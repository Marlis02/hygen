import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { claudeEnv } from "./director.ts";
import { ROOT_DIR } from "../engine/src/lib/util.ts";

// One shell for the whole panel (ROADMAP S1.1): node-pty on the server, xterm.js in the page, only on 127.0.0.1. The shell
// belongs to the server, not to a browser tab — closing the tab keeps it and a claude inside; «Завершить» kills it. Output
// goes to the page as server-sent events with the scrollback replayed on reconnect; keys and resizes come back as POSTs.

interface Pty {
  pid: number;
  process: string;
  cols: number;
  rows: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(cb: (data: string) => void): unknown;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): unknown;
}

const SCROLLBACK = 400_000;
let term: Pty | null = null;
let buffer = "";
let startedAt: string | null = null;
let lastExit: { code: number; at: string } | null = null;
const clients = new Set<ServerResponse>();

const send = (res: ServerResponse, event: string, data: unknown): void => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};
const broadcast = (event: string, data: unknown): void => {
  for (const res of clients) send(res, event, data);
};
const clamp = (n: unknown, lo: number, hi: number, dflt: number): number => (n !== undefined && n !== null && Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Math.round(Number(n)))) : dflt);

/**
 * The command line of the terminal's foreground process group (/proc/<shell>/stat → tpgid → cmdline): node-pty's own
 * `process` keeps naming the shell while claude runs under it.
 */
function foreground(): string {
  if (!term) return "";
  try {
    const stat = readFileSync(`/proc/${term.pid}/stat`, "utf8");
    const tpgid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[5]);
    if (tpgid > 0) return readFileSync(`/proc/${tpgid}/cmdline`, "utf8").split("\0").filter(Boolean).join(" ");
  } catch {
    // not Linux, or the process has just ended: node-pty's name is the best guess
  }
  return term.process;
}

/** claude holds the terminal: node running …/bin/claude, or a process titled claude. */
const claudeInForeground = (): boolean => /(^|[\s/])claude(\s|$)/.test(foreground());

/** Short name for the header: claude, bash, npm… */
function foregroundName(): string | null {
  if (!term) return null;
  if (claudeInForeground()) return "claude";
  return basename(foreground().split(" ")[0] ?? "").replace(/^-/, "") || term.process;
}

export function terminalState(): Record<string, unknown> {
  return { running: Boolean(term), pid: term?.pid ?? null, process: foregroundName(), cols: term?.cols ?? null, rows: term?.rows ?? null, startedAt, lastExit, cwd: ROOT_DIR, claude: claudeInForeground() };
}

export async function startTerminal(cols?: unknown, rows?: unknown): Promise<Record<string, unknown>> {
  if (term) return terminalState();
  let pty: { spawn: (file: string, args: string[], opts: Record<string, unknown>) => Pty };
  try {
    pty = (await import("node-pty")) as unknown as typeof pty;
  } catch (err) {
    throw new Error(`node-pty не загрузился — npm install в корне репозитория (${err instanceof Error ? err.message : String(err)})`);
  }
  const shell = process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : "/bin/bash";
  const t = pty.spawn(shell, ["-l"], { name: "xterm-256color", cols: clamp(cols, 20, 400, 120), rows: clamp(rows, 5, 200, 32), cwd: ROOT_DIR, env: claudeEnv({ TERM: "xterm-256color", COLORTERM: "truecolor" }) });
  term = t;
  buffer = "";
  startedAt = new Date().toISOString();
  t.onData((data) => {
    buffer += data;
    if (buffer.length > SCROLLBACK) buffer = buffer.slice(-SCROLLBACK);
    broadcast("data", data);
  });
  t.onExit((e) => {
    if (term !== t) return;
    term = null;
    lastExit = { code: e.exitCode, at: new Date().toISOString() };
    broadcast("exit", lastExit);
  });
  broadcast("start", terminalState());
  return terminalState();
}

export function writeTerminal(data: unknown): void {
  if (!term) throw new Error("терминал не запущен");
  if (typeof data !== "string" || data.length > 100_000) throw new Error("data — строка до 100 000 символов");
  term.write(data);
}

export function resizeTerminal(cols: unknown, rows: unknown): void {
  if (term) term.resize(clamp(cols, 20, 400, term.cols), clamp(rows, 5, 200, term.rows));
}

export function stopTerminal(): Record<string, unknown> {
  const t = term;
  if (t) {
    t.kill("SIGHUP");
    setTimeout(() => {
      if (term === t) t.kill("SIGKILL");
    }, 2000);
  }
  return terminalState();
}

/** «Открыть claude здесь»: interactive claude with the subscription login, in the repository root. */
export async function openClaude(cols?: unknown, rows?: unknown): Promise<Record<string, unknown>> {
  await startTerminal(cols, rows);
  if (term && !claudeInForeground()) term.write(`cd ${JSON.stringify(ROOT_DIR)} && claude\r`);
  return terminalState();
}

/** «/short для этого проекта»: the command is typed into the terminal without Enter — the person presses it. */
export async function pasteShort(id: string, cols?: unknown, rows?: unknown): Promise<Record<string, unknown>> {
  await startTerminal(cols, rows);
  term?.write(claudeInForeground() ? `/short ${id}` : `cd ${JSON.stringify(ROOT_DIR)} && claude "/short ${id}"`);
  return terminalState();
}

export function streamTerminal(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  send(res, "state", terminalState());
  if (buffer) send(res, "replay", buffer);
  clients.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
  });
}
