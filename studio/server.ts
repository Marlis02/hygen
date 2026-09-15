#!/usr/bin/env node
// npm run studio — the local panel of the engine (ROADMAP S1): http://localhost:5177, only on 127.0.0.1.
// The page is plain TypeScript in studio/web: the server strips the types on the fly (node:module), no bundler.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as nodeModule from "node:module";
import { extname, join, normalize, resolve, sep } from "node:path";
import { handleApi } from "./api.ts";
import { attachWebSocket, startWatching } from "./events.ts";
import { restoreJobs } from "./jobs.ts";
import { loadConfig } from "../engine/src/lib/project.ts";
import { ROOT_DIR } from "../engine/src/lib/util.ts";

const STUDIO = join(ROOT_DIR, "studio");

// stripTypeScriptTypes is marked experimental; its warning would repeat on every page load
const emit = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  if (String(warning).includes("stripTypeScriptTypes")) return;
  (emit as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;
const stripTypes = (nodeModule as unknown as { stripTypeScriptTypes: (src: string, o?: { mode: string }) => string }).stripTypeScriptTypes;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".srt": "application/x-subrip; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".woff2": "font/woff2",
};

/** Folders the page may read files from (media, renders, previews, fonts); never .env or the rest of the repo. */
const READABLE = ["projects", "library", ".preview"].map((d) => join(ROOT_DIR, d) + sep);

/** xterm.js for the dialog with the director — straight from node_modules, only these files. */
const VENDOR: Record<string, string> = {
  "/vendor/xterm/xterm.mjs": join(ROOT_DIR, "node_modules", "@xterm", "xterm", "lib", "xterm.mjs"),
  "/vendor/xterm/xterm.css": join(ROOT_DIR, "node_modules", "@xterm", "xterm", "css", "xterm.css"),
  "/vendor/xterm/addon-fit.mjs": join(ROOT_DIR, "node_modules", "@xterm", "addon-fit", "lib", "addon-fit.mjs"),
};

const tsCache = new Map<string, { mtime: number; js: string }>();

function sendFile(req: IncomingMessage, res: ServerResponse, file: string, download?: string): void {
  const st = statSync(file);
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string | number> = { "Content-Type": type, "Cache-Control": "no-cache", "Accept-Ranges": "bytes" };
  if (download) headers["Content-Disposition"] = `attachment; filename="${download.replace(/"/g, "")}"`;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && st.size > 0) {
    const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) {
      res.writeHead(416, { "Content-Range": `bytes */${st.size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}

function serveStatic(req: IncomingMessage, res: ServerResponse, path: string): boolean {
  if (path === "/" || path === "/index.html") {
    sendFile(req, res, join(STUDIO, "web", "index.html"));
    return true;
  }
  const i18n = /^\/i18n\/(ru|en)\.json$/.exec(path);
  if (i18n) {
    const file = join(STUDIO, "i18n", `${i18n[1]}.json`);
    if (!existsSync(file)) return false;
    sendFile(req, res, file);
    return true;
  }
  const vendor = VENDOR[path];
  if (vendor) {
    if (!existsSync(vendor)) return false;
    sendFile(req, res, vendor);
    return true;
  }
  if (path.startsWith("/web/")) {
    const file = resolve(STUDIO, "web", normalize(decodeURIComponent(path.slice(5))));
    if (!file.startsWith(join(STUDIO, "web") + sep) || !existsSync(file)) return false;
    if (file.endsWith(".ts")) {
      const mtime = statSync(file).mtimeMs;
      let hit = tsCache.get(file);
      if (!hit || hit.mtime !== mtime) {
        hit = { mtime, js: stripTypes(readFileSync(file, "utf8"), { mode: "strip" }) };
        tsCache.set(file, hit);
      }
      res.writeHead(200, { "Content-Type": TYPES[".ts"] as string, "Cache-Control": "no-cache" }).end(hit.js);
      return true;
    }
    sendFile(req, res, file);
    return true;
  }
  if (path.startsWith("/files/")) {
    const file = resolve(ROOT_DIR, normalize(decodeURIComponent(path.slice(7))));
    if (!READABLE.some((d) => file.startsWith(d)) || !existsSync(file) || !statSync(file).isFile()) return false;
    const url = new URL(req.url ?? "/", "http://localhost");
    sendFile(req, res, file, url.searchParams.get("download") ?? undefined);
    return true;
  }
  return false;
}

const port = Number(process.env.STUDIO_PORT ?? loadConfig().studio.port ?? 5177);
/** DNS rebinding and requests from other sites: the API answers only its own host, and a write needs the header the page sends. */
const HOSTS = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);

function foreign(req: IncomingMessage): string | null {
  if (!HOSTS.has(String(req.headers.host ?? ""))) return "чужой Host: панель отвечает только на localhost";
  if (req.method === "GET" || req.method === "HEAD") return null;
  if (req.headers["x-hygen"] !== "1") return "нет заголовка X-Hygen: запрос не со страницы панели";
  const origin = req.headers.origin;
  if (origin && !HOSTS.has(origin.replace(/^https?:\/\//, ""))) return `чужой Origin ${origin}`;
  return null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const done = (err: unknown): void => {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: message }));
  };
  try {
    if (url.pathname.startsWith("/api/")) {
      const refused = foreign(req);
      if (refused) {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: refused }));
        return;
      }
      handleApi(req, res, url).then((handled) => {
        if (!handled && !res.headersSent) res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: `нет такого запроса: ${req.method} ${url.pathname}` }));
      }, done);
      return;
    }
    if (!serveStatic(req, res, url.pathname)) res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("не найдено");
  } catch (err) {
    done(err);
  }
});

server.listen(port, "127.0.0.1", async () => {
  const address = `http://localhost:${port}`;
  const restored = restoreJobs();
  const live = await attachWebSocket(server, port);
  const watching = await startWatching();
  console.log(`hygen studio — ${address}  (остановить: Ctrl+C)`);
  console.log(`  ${live ? "живые обновления: WebSocket /api/events" : "без WebSocket: ws не установлен"} · ${watching}${restored ? ` · задач из прошлого запуска: ${restored}` : ""}`);
  if (!process.argv.includes("--no-open") && (process.env.DISPLAY || process.env.WAYLAND_DISPLAY)) {
    const opener = spawn("xdg-open", [address], { stdio: "ignore", detached: true });
    opener.on("error", () => {});
    opener.unref();
  }
});
