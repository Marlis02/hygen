import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { claudeEnv } from "./director.ts";
import { localStamp, loadConfig, readLedger } from "../engine/src/lib/project.ts";
import { ROOT_DIR, readJson, writeJson } from "../engine/src/lib/util.ts";
import { broadcast } from "./events.ts";

// Диалог с режиссёром (ROADMAP S2): один живой claude на проект, не больше `studio.maxDialogs` на панель. The shell
// belongs to the server, so closing the browser tab does not end the dialog — only «Завершить» does. Everything the
// terminal shows is appended to projects/<id>/dialogs/<stamp>.log, the meta of the run lives next to it in .json, and
// the session id of Claude Code is kept so «Продолжить» can run `claude --resume <id>`.

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

interface Dialog {
  project: string;
  pty: Pty;
  buffer: string;
  startedAt: string;
  sessionId: string;
  resumed: string | null;
  logPath: string;
  metaPath: string;
  /** Edits of project.json and media.json seen by the file watch while this dialog ran. */
  edits: number;
}

const SCROLLBACK = 400_000;
const dialogs = new Map<string, Dialog>();
let lastExit: { project: string; code: number; at: string } | null = null;

export const maxDialogs = (): number => Math.max(1, Number(loadConfig().studio.maxDialogs ?? 2));
const clamp = (n: unknown, lo: number, hi: number, dflt: number): number => (n !== undefined && n !== null && Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Math.round(Number(n)))) : dflt);
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "").replace(/\r(?!\n)/g, "\n");

const dialogsDir = (projectDir: string): string => join(projectDir, "dialogs");

/** The command line of the foreground process group: node-pty keeps naming the shell while claude runs under it. */
function foreground(d: Dialog): string {
  try {
    const stat = readFileSync(`/proc/${d.pty.pid}/stat`, "utf8");
    const tpgid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[5]);
    if (tpgid > 0) return readFileSync(`/proc/${tpgid}/cmdline`, "utf8").split("\0").filter(Boolean).join(" ");
  } catch {
    // not Linux, or the process has just ended
  }
  return d.pty.process;
}

const claudeAlive = (d: Dialog): boolean => /(^|[\s/])claude(\s|$)/.test(foreground(d));

export function dialogState(project?: string): Record<string, unknown> {
  const one = (d: Dialog): Record<string, unknown> => ({
    project: d.project,
    pid: d.pty.pid,
    cols: d.pty.cols,
    rows: d.pty.rows,
    startedAt: d.startedAt,
    sessionId: d.sessionId,
    resumed: d.resumed,
    claude: claudeAlive(d),
    log: `dialogs/${basename(d.logPath)}`,
  });
  const list = [...dialogs.values()].map(one);
  return { running: list, max: maxDialogs(), lastExit, dialog: project ? (dialogs.has(project) ? one(dialogs.get(project) as Dialog) : null) : null };
}

export const dialogRunning = (project: string): boolean => dialogs.has(project);
export const runningProjects = (): string[] => [...dialogs.keys()];

/** The panel's file watch tells a live dialog that the director has just edited the project. */
export function noteEdit(project: string): void {
  const d = dialogs.get(project);
  if (d) d.edits++;
}

/**
 * The first line claude gets: who the video is, what the brief asked for, what is already built, how the last dialog
 * ended — and the rules of the folder (write only here, read the library and the documents of the engine freely).
 */
export function dialogContext(projectDir: string): string {
  const id = basename(projectDir);
  const brief = existsSync(join(projectDir, "brief.json")) ? readJson<Record<string, any>>(join(projectDir, "brief.json")) : null;
  const spec = existsSync(join(projectDir, "project.json")) ? readJson<Record<string, any>>(join(projectDir, "project.json")) : null;
  const mp4 = spec && existsSync(join(projectDir, "renders", `${spec.id}.mp4`));
  const media = existsSync(join(projectDir, "media.json")) ? Object.keys(readLedger(join(projectDir, "media.json"))).length : 0;
  const last = listDialogs(projectDir)[0];
  const parts = [
    `Проект ${id}.`,
    brief?.topic ? `Тема: ${brief.topic}.` : spec?.title ? `Название: ${spec.title}.` : "",
    brief?.genre ? `Жанр: ${brief.genre}.` : "",
    brief?.seconds ? `Длина: ${brief.seconds} с.` : "",
    brief?.look ? `Look: ${brief.look}.` : brief ? "Look: выбираешь сам." : "",
    brief?.wishes ? `Пожелания: ${brief.wishes}` : "",
    spec ? `Статус: ${spec.status ?? "draft-kokoro"}, битов ${spec.beats?.length ?? 0}, медиа ${media}, MP4 ${mp4 ? "собран" : "не собран"}.` : "project.json ещё нет — начни с /short.",
    last?.summary ? `Итог прошлого диалога: ${last.summary}` : "",
    "Пиши только в свою папку projects/" + id + "; чужие проекты не читай. Библиотеку library/, CONTRACT.md, CLAUDE.md, README и документы движка — читай свободно. Уникальность ролика проверяй по library/index.json.",
    spec ? "" : `Начни с команды /short ${id}.`,
  ];
  return parts.filter(Boolean).join(" ");
}

export async function startDialog(projectDir: string, opts: { cols?: unknown; rows?: unknown; resume?: string } = {}): Promise<Record<string, unknown>> {
  const project = basename(projectDir);
  if (dialogs.has(project)) return dialogState(project);
  if (dialogs.size >= maxDialogs()) {
    throw new Error(`уже идут диалоги: ${[...dialogs.keys()].join(", ")} — завершите один, панель держит не больше ${maxDialogs()}`);
  }
  let pty: { spawn: (file: string, args: string[], o: Record<string, unknown>) => Pty };
  try {
    pty = (await import("node-pty")) as unknown as typeof pty;
  } catch (err) {
    throw new Error(`node-pty не загрузился — npm install в корне репозитория (${err instanceof Error ? err.message : String(err)})`);
  }
  const bin = findClaude();
  if (!bin) throw new Error("claude не найден: ни в PATH, ни в ~/.local/bin, ни в расширении VS Code");
  const shell = process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : "/bin/bash";
  const t = pty.spawn(shell, ["-l"], { name: "xterm-256color", cols: clamp(opts.cols, 20, 400, 120), rows: clamp(opts.rows, 5, 200, 32), cwd: ROOT_DIR, env: claudeEnv({ TERM: "xterm-256color", COLORTERM: "truecolor" }) });
  const stamp = localStamp();
  mkdirSync(dialogsDir(projectDir), { recursive: true });
  const sessionId = opts.resume ?? randomUUID();
  const d: Dialog = {
    project,
    pty: t,
    buffer: "",
    startedAt: new Date().toISOString(),
    sessionId,
    resumed: opts.resume ?? null,
    logPath: join(dialogsDir(projectDir), `${stamp}.log`),
    metaPath: join(dialogsDir(projectDir), `${stamp}.json`),
    edits: 0,
  };
  dialogs.set(project, d);
  writeJson(d.metaPath, { project, at: d.startedAt, sessionId, resumed: d.resumed, log: basename(d.logPath) });
  appendFileSync(d.logPath, `── диалог ${project} · ${d.startedAt} · сессия ${sessionId}${opts.resume ? " (продолжение)" : ""}\n`);
  t.onData((data) => {
    d.buffer += data;
    if (d.buffer.length > SCROLLBACK) d.buffer = d.buffer.slice(-SCROLLBACK);
    try {
      appendFileSync(d.logPath, stripAnsi(data));
    } catch {
      // a full disk must not kill the dialog
    }
    broadcast({ type: "dialog", project, data });
  });
  t.onExit((e) => {
    if (dialogs.get(project) !== d) return;
    dialogs.delete(project);
    lastExit = { project, code: e.exitCode, at: new Date().toISOString() };
    finish(d, e.exitCode);
    broadcast({ type: "dialog-exit", project, code: e.exitCode });
  });
  // bash comes up on its own; claude is started with the context as its first message
  const ctx = dialogContext(projectDir).replace(/"/g, '\\"');
  const args = opts.resume ? `--resume ${opts.resume}` : `--session-id ${sessionId}`;
  t.write(`cd ${JSON.stringify(ROOT_DIR)} && ${JSON.stringify(bin)} ${args} "${ctx}"\r`);
  broadcast({ type: "dialog-start", project });
  return dialogState(project);
}

function finish(d: Dialog, code: number): void {
  const endedAt = new Date().toISOString();
  const minutes = Math.round((Date.parse(endedAt) - Date.parse(d.startedAt)) / 60000);
  const summary = `${minutes} мин, правок проекта ${d.edits}${code ? `, выход с кодом ${code}` : ""}`;
  try {
    writeJson(d.metaPath, { project: d.project, at: d.startedAt, endedAt, sessionId: d.sessionId, resumed: d.resumed, log: basename(d.logPath), exitCode: code, edits: d.edits, summary });
    appendFileSync(d.logPath, `\n── конец ${endedAt} · ${summary}\n`);
  } catch {
    // the dialog is over either way
  }
}

export function writeDialog(project: string, data: unknown): void {
  const d = dialogs.get(project);
  if (!d) throw new Error("диалог этого проекта не запущен");
  if (typeof data !== "string" || data.length > 100_000) throw new Error("data — строка до 100 000 символов");
  d.pty.write(data);
}

export function resizeDialog(project: string, cols: unknown, rows: unknown): void {
  const d = dialogs.get(project);
  if (d) d.pty.resize(clamp(cols, 20, 400, d.pty.cols), clamp(rows, 5, 200, d.pty.rows));
}

export function stopDialog(project: string): Record<string, unknown> {
  const d = dialogs.get(project);
  if (d) {
    d.pty.kill("SIGHUP");
    setTimeout(() => {
      if (dialogs.get(project) === d) d.pty.kill("SIGKILL");
    }, 2000);
  }
  return dialogState(project);
}

export const dialogBuffer = (project: string): string => dialogs.get(project)?.buffer ?? "";

/** «Диалоги» of a project: date, summary, the journal file and the session id «Продолжить» resumes. */
export function listDialogs(projectDir: string): Record<string, unknown>[] {
  const dir = dialogsDir(projectDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .reverse()
    .map((n) => {
      const meta = (() => {
        try {
          return readJson<Record<string, any>>(join(dir, n));
        } catch {
          return {} as Record<string, any>;
        }
      })();
      const log = join(dir, n.replace(/\.json$/, ".log"));
      return {
        name: n.replace(/\.json$/, ""),
        at: meta.at ?? null,
        endedAt: meta.endedAt ?? null,
        sessionId: meta.sessionId ?? null,
        summary: meta.summary ?? (meta.endedAt ? "" : "идёт"),
        edits: meta.edits ?? 0,
        bytes: existsSync(log) ? statSync(log).size : 0,
        log: existsSync(log) ? `/files/${["projects", basename(projectDir), "dialogs", basename(log)].join("/")}` : null,
        running: dialogs.get(basename(projectDir))?.metaPath === join(dir, n),
      };
    });
}

/**
 * The claude binary. `~/.local/bin/claude` can be a symlink left behind by an older VS Code extension (it happened on
 * this laptop), so a broken link is skipped and the newest extension binary is taken instead (TRAPS.md).
 */
export function findClaude(): string | null {
  const ok = (p: string | undefined): p is string => Boolean(p) && existsSync(p as string) && statSync(p as string).isFile();
  const fromPath = [process.env.CLAUDE_BIN, ...(process.env.PATH ?? "").split(":").map((d) => join(d, "claude")), join(process.env.HOME ?? "", ".local", "bin", "claude")].find(ok);
  if (fromPath) return fromPath;
  const ext = join(process.env.HOME ?? "", ".vscode", "extensions");
  if (!existsSync(ext)) return null;
  const dirs = readdirSync(ext).filter((n) => n.startsWith("anthropic.claude-code-")).sort();
  for (const name of dirs.reverse()) {
    const bin = join(ext, name, "resources", "native-binary", "claude");
    if (ok(bin)) return bin;
  }
  return null;
}
