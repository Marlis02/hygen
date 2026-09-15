import { existsSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import type { Duplex } from "node:stream";
import { basename, relative, sep } from "node:path";
import { LIBRARY_DIR, ROOT_DIR } from "../engine/src/lib/util.ts";
import { projectsDir } from "../engine/src/lib/project.ts";

// Живая панель (ROADMAP S2): один WebSocket на вкладку несёт всё — вывод диалога, прогресс задач и события файлов.
// chokidar watches projects/ and library/; events of 500 ms are glued together, so a build that writes a hundred files
// wakes the page once and only the touched cards are re-read.

type Client = { send: (data: string) => void; alive: boolean };
const clients = new Set<Client>();

export function broadcast(msg: Record<string, unknown>): void {
  if (!clients.size) return;
  const data = JSON.stringify(msg);
  for (const c of clients) {
    try {
      c.send(data);
    } catch {
      clients.delete(c);
    }
  }
}

/** Writes the panel makes itself: the watch must not tell the page to re-read what it has just saved. */
const selfWrites = new Map<string, number>();
export const markSelfWrite = (file: string): void => {
  selfWrites.set(file, Date.now());
};
const isSelf = (file: string): boolean => Date.now() - (selfWrites.get(file) ?? 0) < 1500;

let pending: { projects: Record<string, string[]>; library: string[] } = { projects: {}, library: [] };
let timer: ReturnType<typeof setTimeout> | undefined;

function note(file: string): void {
  if (isSelf(file)) return;
  const rel = relative(ROOT_DIR, file);
  if (/(^|[\\/])(build|\.cache|renders[\\/](?!publish)|dialogs)[\\/]/.test(rel) || rel.endsWith(".part.jpg") || rel.endsWith("~")) return;
  if (file.startsWith(projectsDir() + sep)) {
    const id = relative(projectsDir(), file).split(sep)[0] as string;
    const list = (pending.projects[id] ??= []);
    const what = relative(projectsDir(), file).split(sep).slice(1).join("/");
    if (!list.includes(what)) list.push(what);
  } else if (file.startsWith(LIBRARY_DIR + sep)) {
    const what = relative(LIBRARY_DIR, file);
    if (!pending.library.includes(what)) pending.library.push(what);
  } else return;
  clearTimeout(timer);
  timer = setTimeout(flush, 500);
}

function flush(): void {
  const batch = pending;
  pending = { projects: {}, library: [] };
  if (!Object.keys(batch.projects).length && !batch.library.length) return;
  broadcast({ type: "files", projects: batch.projects, library: batch.library, at: new Date().toISOString() });
  for (const id of Object.keys(batch.projects)) onProjectEdit?.(id, batch.projects[id] as string[]);
}

/** The panel hooks in here: a live dialog counts the edits of its project. */
let onProjectEdit: ((id: string, files: string[]) => void) | null = null;
export const setProjectEditHook = (fn: (id: string, files: string[]) => void): void => {
  onProjectEdit = fn;
};

export async function startWatching(): Promise<string> {
  const dirs = [projectsDir(), LIBRARY_DIR].filter((d) => existsSync(d));
  try {
    const { watch } = (await import("chokidar")) as { watch: (paths: string[], o: Record<string, unknown>) => { on: (e: string, cb: (p: string) => void) => unknown } };
    const w = watch(dirs, { ignoreInitial: true, ignored: (p: string) => /(^|[\\/])(node_modules|\.git|build|\.cache)([\\/]|$)/.test(p), awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }, depth: 6 });
    for (const e of ["add", "change", "unlink", "addDir", "unlinkDir"]) w.on(e, (p: string) => note(p));
    return `chokidar следит за ${dirs.map((d) => basename(d)).join(", ")}`;
  } catch (err) {
    return `без живых обновлений: chokidar не загрузился (${err instanceof Error ? err.message : String(err)})`;
  }
}

// ── WebSocket ────────────────────────────────────────────────────────────────────────────────────────

const HOSTS = (port: number): Set<string> => new Set([`localhost:${port}`, `127.0.0.1:${port}`]);

export async function attachWebSocket(server: Server, port: number): Promise<boolean> {
  let WebSocketServer: any;
  try {
    ({ WebSocketServer } = (await import("ws")) as any);
  } catch {
    return false;
  }
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // only the page of this panel: same host, no cross-site upgrade
    if (req.url !== "/api/events" || !HOSTS(port).has(String(req.headers.host ?? ""))) {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (origin && !HOSTS(port).has(origin.replace(/^https?:\/\//, ""))) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws: any) => {
      const client: Client = { send: (d: string) => ws.send(d), alive: true };
      clients.add(client);
      ws.on("close", () => clients.delete(client));
      ws.on("error", () => clients.delete(client));
      ws.send(JSON.stringify({ type: "hello", at: new Date().toISOString() }));
    });
  });
  return true;
}

export const clientCount = (): number => clients.size;
