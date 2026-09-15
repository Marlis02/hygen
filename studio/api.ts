import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { basename, delimiter, extname, join, relative, sep } from "node:path";
import { BUILD_STAGES, buildStageOf, getJob, listJobs, runningJob, startJob, stopJob } from "./jobs.ts";
import type { Job } from "./jobs.ts";
import { SECTIONS, libraryCatalog, previewIndex } from "../engine/src/library.ts";
import type { LibraryItem } from "../engine/src/library.ts";
import { CONFIG_PATH, LICENSES, ROLES, checkProjectMedia, loadConfig, missingLicense, musicDir, projectDirs, projectsDir, readLedger, snapshotHistory, writeLedger } from "../engine/src/lib/project.ts";
import type { MediaRecord } from "../engine/src/lib/project.ts";
import { ENGINE_DIR, ROOT_DIR, loadEnv, readJson, runAsync, sha, writeJson } from "../engine/src/lib/util.ts";
import { SECRET_KEYS } from "../engine/src/doctor.ts";
import { expandBeat } from "../engine/src/intents.ts";
import { lookIds, loadLook } from "../engine/src/look.ts";
import { trackBeats } from "../engine/src/music.ts";
import { isHtmlScene, loadSpec, parseBeatText } from "../engine/src/spec.ts";
import type { BeatSpec, VideoSpec } from "../engine/src/spec.ts";
import { CAMERA_REASONS, STAGE_TYPES, TREATMENTS } from "../engine/src/stage.ts";
import { budgetState, resolveVoice } from "../engine/src/voice.ts";

// The local API of the studio over the engine: every write goes to project.json, media.json, music.json, a look file
// or hygen.config.json — the same files the CLI and the director read, so editing JSON by hand keeps working.

const NODE = process.execPath;
const CLI = join(ENGINE_DIR, "src", "cli.ts");
const MEDIA_CLI = join(ENGINE_DIR, "src", "media.ts");
const ID_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
const ASSET_RE = /\.(jpe?g|png|webp|gif|mp4|webm|mov|ogv|wav|mp3|flac|ogg)$/i;
export const STATUSES = ["draft", "built", "verified", "published"];

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  m: RegExpExecArray;
}

type Handler = (ctx: Ctx) => unknown;
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, path: string, h: Handler): void => {
  routes.push([method, new RegExp(`^${path.replace(/:[a-z]+/g, "([^/]+)")}$`), h]);
};

const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" }).end(JSON.stringify(body));
};

export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  for (const [method, re, h] of routes) {
    if (req.method !== method) continue;
    const m = re.exec(url.pathname);
    if (!m) continue;
    try {
      const out = await h({ req, res, url, m });
      if (!res.headersSent) json(res, 200, out ?? { ok: true });
    } catch (err) {
      json(res, err instanceof HttpError ? err.status : 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }
  return false;
}

function rawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((done, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => done(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function body<T = Record<string, any>>(req: IncomingMessage): Promise<T> {
  const buf = await rawBody(req);
  if (!buf.length) return {} as T;
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    throw new HttpError(400, "тело запроса — не JSON");
  }
}

const posix = (p: string): string => p.split(sep).join("/");
const fileUrl = (abs: string | null | undefined): string | null => (abs && existsSync(abs) ? `/files/${posix(relative(ROOT_DIR, abs))}?v=${Math.round(statSync(abs).mtimeMs)}` : null);
const readOpt = <T = any>(path: string): T | null => {
  try {
    return existsSync(path) ? readJson<T>(path) : null;
  } catch {
    return null;
  }
};
const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const msg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function projectDir(name: string, needSpec = true): string {
  const id = decodeURIComponent(name);
  if (!ID_RE.test(id)) throw new HttpError(400, `плохой id проекта «${id}»`);
  const dir = join(projectsDir(), id);
  if (needSpec && !existsSync(join(dir, "project.json"))) throw new HttpError(404, `нет проекта projects/${id}`);
  return dir;
}

const readProject = (dir: string): VideoSpec & Record<string, any> => readJson(join(dir, "project.json"));
const writeProject = (dir: string, p: unknown): void => writeJson(join(dir, "project.json"), p);

/** Quick check after an edit: the schema and the resolver (loadSpec) and the media ledger; the build does the rest. */
function validate(dir: string): { ok: boolean; error: string | null } {
  try {
    loadSpec(dir);
    const media = checkProjectMedia(dir);
    return media.errors.length ? { ok: false, error: media.errors.join("; ") } : { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: msg(err) };
  }
}

const lookLabel = (look: unknown): string => (typeof look === "string" ? look : look && typeof look === "object" ? String((look as any).id ?? (look as any).extends ?? "свой") : "ember");
const voiceLabel = (v: any): string => {
  const provider = v?.provider ?? v?.engine ?? loadConfig().voice.provider;
  return provider === "elevenlabs" ? "ElevenLabs" : `Kokoro${v?.voiceId || v?.voice ? ` · ${v.voiceId ?? v.voice}` : ""}`;
};

function card(dir: string): Record<string, unknown> {
  const p = readProject(dir);
  const name = basename(dir);
  const renders = join(dir, "renders");
  const buildJson = join(renders, `${p.id}.build.json`);
  const build = readOpt<{ duration_s?: number }>(buildJson);
  const thumb = [join(renders, "publish", "thumbnail.jpg"), join(renders, `${p.id}.contact.jpg`)].find((f) => existsSync(f));
  const media = checkProjectMedia(dir);
  return {
    id: name,
    title: p.title,
    status: p.status ?? "draft",
    proof: Boolean(p.proof),
    duration: build?.duration_s ?? null,
    builtAt: existsSync(buildJson) ? statSync(buildJson).mtime.toISOString() : null,
    voice: voiceLabel(p.voice),
    look: lookLabel(p.look),
    beats: p.beats?.length ?? 0,
    thumb: fileUrl(thumb),
    history: existsSync(join(dir, "history")) ? readdirSync(join(dir, "history")).length : 0,
    mediaErrors: media.errors.length,
    publishedAt: p.publishedAt ?? null,
    building: Boolean(runningJob("build", name)),
  };
}

function historyOf(dir: string): Record<string, unknown>[] {
  const hist = join(dir, "history");
  if (!existsSync(hist)) return [];
  return readdirSync(hist)
    .filter((n) => statSync(join(hist, n)).isDirectory())
    .sort()
    .reverse()
    .map((n) => {
      const snap = readOpt<{ at?: string; reason?: string }>(join(hist, n, "snapshot.json"));
      const files = readdirSync(join(hist, n));
      const sheet = files.find((f) => f.endsWith(".contact.jpg"));
      return { name: n, at: snap?.at ?? null, reason: snap?.reason ?? (files.includes("research.md") ? "архив до пересказа" : ""), files, canRollback: files.includes("project.json"), sheet: sheet ? fileUrl(join(hist, n, sheet)) : null };
    });
}

function mediaList(dir: string, p: Record<string, any>): Record<string, unknown>[] {
  const ledger = readLedger(join(dir, "media.json"));
  const mediaDir = join(dir, "media");
  const files = existsSync(mediaDir) ? readdirSync(mediaDir).filter((f) => statSync(join(mediaDir, f)).isFile()).sort() : [];
  const text = JSON.stringify(p.beats ?? []);
  const out = files.map((f) => {
    const rec = ledger[f] ?? null;
    const ext = extname(f).toLowerCase();
    return {
      name: f,
      url: fileUrl(join(mediaDir, f)),
      kind: /\.(mp4|webm|mov|ogv)$/.test(ext) ? "video" : /\.(wav|mp3|flac|ogg)$/.test(ext) ? "audio" : "image",
      bytes: statSync(join(mediaDir, f)).size,
      record: rec,
      missing: missingLicense(rec),
      used: text.includes(`media/${f}`),
    };
  });
  for (const key of Object.keys(ledger)) if (!files.includes(key)) out.push({ name: key, url: null, kind: "missing", bytes: 0, record: ledger[key] ?? null, missing: [], used: text.includes(`media/${key}`) });
  return out;
}

function publishOf(dir: string): Record<string, unknown> | null {
  const pub = join(dir, "renders", "publish");
  if (!existsSync(pub)) return null;
  const read = (f: string): string => (existsSync(join(pub, f)) ? readFileSync(join(pub, f), "utf8") : "");
  return {
    titles: read("title.txt").split("\n").filter((l) => l.trim()),
    description: read("description.md"),
    tags: read("tags.txt").trim(),
    srt: fileUrl(join(pub, "subtitles.srt")),
    thumbnail: fileUrl(join(pub, "thumbnail.jpg")),
  };
}

const jobView = (j: Job, from = 0): Record<string, unknown> => ({ ...j, log: j.log.slice(from), logFrom: from, logTotal: j.log.length });

// ── projects ─────────────────────────────────────────────────────────────────────────────────────────

route("GET", "/api/projects", () => ({ projects: projectDirs().map(card), statuses: STATUSES }));

route("GET", "/api/projects/:id", ({ m }) => {
  const dir = projectDir(m[1] as string);
  const p = readProject(dir);
  const renders = join(dir, "renders");
  return {
    id: basename(dir),
    project: p,
    card: card(dir),
    validation: validate(dir),
    media: mediaList(dir, p),
    renders: {
      mp4: fileUrl(join(renders, `${p.id}.mp4`)),
      contact: fileUrl(join(renders, `${p.id}.contact.jpg`)),
      blind: fileUrl(join(renders, "blind", `${p.id}.contact.jpg`)),
      verify: readOpt(join(renders, `${p.id}.verify.json`)),
      build: readOpt(join(renders, `${p.id}.build.json`)),
    },
    publish: publishOf(dir),
    history: historyOf(dir),
    brief: readOpt(join(dir, "brief.json")),
    research: existsSync(join(dir, "research.md")) ? readFileSync(join(dir, "research.md"), "utf8") : null,
    jobs: listJobs(basename(dir)).slice(0, 8).map((j) => ({ id: j.id, kind: j.kind, title: j.title, status: j.status, startedAt: j.startedAt })),
  };
});

route("PUT", "/api/projects/:id/project", async ({ req, m }) => {
  const dir = projectDir(m[1] as string);
  const b = await body<{ project: Record<string, unknown> }>(req);
  if (!b.project || typeof b.project !== "object" || !Array.isArray(b.project.beats)) throw new HttpError(400, "project — объект с beats");
  writeProject(dir, b.project);
  return validate(dir);
});

route("PUT", "/api/projects/:id/beats/:beat", async ({ req, m }) => {
  const dir = projectDir(m[1] as string);
  const beatId = decodeURIComponent(m[2] as string);
  const b = await body<{ beat: BeatSpec }>(req);
  const p = readProject(dir);
  const i = p.beats.findIndex((x) => x.id === beatId);
  if (i < 0) throw new HttpError(404, `нет бита ${beatId}`);
  if (!b.beat || typeof b.beat !== "object") throw new HttpError(400, "beat — объект");
  p.beats[i] = b.beat;
  writeProject(dir, p);
  return validate(dir);
});

route("POST", "/api/projects/:id/beats", async ({ req, m }) => {
  const dir = projectDir(m[1] as string);
  const b = await body<{ after?: string }>(req);
  const p = readProject(dir);
  const at = b.after ? p.beats.findIndex((x) => x.id === b.after) + 1 : p.beats.length;
  let n = p.beats.length + 1;
  while (p.beats.some((x) => x.id === `${String(n).padStart(2, "0")}-new`)) n++;
  const beat = { id: `${String(n).padStart(2, "0")}-new`, text: "New line of the voice.", sees: "", stage: { type: "color", color: "night", glow: true }, devices: [], dominant: "stage" } as unknown as BeatSpec;
  p.beats.splice(at, 0, beat);
  writeProject(dir, p);
  return { beat: beat.id, ...validate(dir) };
});

route("DELETE", "/api/projects/:id/beats/:beat", ({ m }) => {
  const dir = projectDir(m[1] as string);
  const p = readProject(dir);
  const beatId = decodeURIComponent(m[2] as string);
  if (p.beats.length <= 1) throw new HttpError(400, "в ролике должен остаться хотя бы один бит");
  snapshotHistory(dir, `удалён бит ${beatId}`);
  p.beats = p.beats.filter((x) => x.id !== beatId);
  p.transitions = (p.transitions ?? []).filter((t) => t.from !== beatId && t.to !== beatId);
  writeProject(dir, p);
  return validate(dir);
});

route("POST", "/api/projects/:id/beats/:beat/move", async ({ req, m }) => {
  const dir = projectDir(m[1] as string);
  const { dir: step } = await body<{ dir: number }>(req);
  const p = readProject(dir);
  const i = p.beats.findIndex((x) => x.id === decodeURIComponent(m[2] as string));
  const j = i + (step < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= p.beats.length) throw new HttpError(400, "двигать некуда");
  [p.beats[i], p.beats[j]] = [p.beats[j] as BeatSpec, p.beats[i] as BeatSpec];
  writeProject(dir, p);
  return validate(dir);
});

route("POST", "/api/projects/:id/status", async ({ req, m }) => {
  const dir = projectDir(m[1] as string);
  const { status } = await body<{ status: string }>(req);
  if (!STATUSES.includes(status)) throw new HttpError(400, `статус — ${STATUSES.join(", ")}`);
  const p = readProject(dir);
  p.status = status;
  if (status === "published") p.publishedAt = today();
  else delete p.publishedAt;
  writeProject(dir, p);
  return { status, publishedAt: p.publishedAt ?? null };
});

route("POST", "/api/projects/:id/duplicate", async ({ req, m }) => {
  const src = projectDir(m[1] as string);
  const b = await body<{ id: string }>(req);
  if (!ID_RE.test(b.id ?? "")) throw new HttpError(400, "id копии — строчная латиница, цифры и дефис");
  const dst = join(projectsDir(), b.id);
  if (existsSync(dst)) throw new HttpError(409, `projects/${b.id} уже есть`);
  const skip = new Set(["build", ".cache", "renders", "history"].map((d) => join(src, d)));
  cpSync(src, dst, { recursive: true, filter: (f) => !skip.has(f) && basename(f) !== "usage.jsonl" && basename(f) !== "brief.json" });
  const old = basename(src);
  const p = JSON.parse(readFileSync(join(dst, "project.json"), "utf8").split(`projects/${old}/`).join(`projects/${b.id}/`));
  p.id = b.id;
  p.title = `${p.title} (copy)`;
  p.status = "draft";
  delete p.publishedAt;
  writeProject(dst, p);
  return { id: b.id };
});

route("POST", "/api/projects/:id/history/:name/rollback", ({ m }) => {
  const dir = projectDir(m[1] as string);
  const name = decodeURIComponent(m[2] as string);
  const snap = join(dir, "history", name);
  if (!/^[\w.-]+$/.test(name) || !existsSync(join(snap, "project.json"))) throw new HttpError(404, `в history/${name} нет project.json`);
  const before = snapshotHistory(dir, `перед откатом к ${name}`);
  copyFileSync(join(snap, "project.json"), join(dir, "project.json"));
  if (existsSync(join(snap, "media.json"))) copyFileSync(join(snap, "media.json"), join(dir, "media.json"));
  return { restored: name, saved: before ? basename(before) : null, ...validate(dir) };
});

// ── media ────────────────────────────────────────────────────────────────────────────────────────────

route("POST", "/api/projects/:id/media", async ({ req, url, m }) => {
  const dir = projectDir(m[1] as string);
  const original = url.searchParams.get("name") ?? "";
  const ext = extname(original).toLowerCase();
  if (!ASSET_RE.test(original)) throw new HttpError(400, "файл — jpg, png, webp, gif, mp4, webm, mov, ogv, wav, mp3, flac или ogg");
  const stem = basename(original, extname(original)).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
  const mediaDir = join(dir, "media");
  mkdirSync(mediaDir, { recursive: true });
  let name = `${stem}${ext === ".jpeg" ? ".jpg" : ext}`;
  for (let k = 2; existsSync(join(mediaDir, name)); k++) name = `${stem}-${k}${ext === ".jpeg" ? ".jpg" : ext}`;
  writeFileSync(join(mediaDir, name), await rawBody(req));
  const ledger = readLedger(join(dir, "media.json"));
  ledger[name] = { role: null, title: basename(original, extname(original)), source: "", author: "", license: "", url: "", added: today() };
  writeLedger(join(dir, "media.json"), ledger);
  return { name };
});

route("PUT", "/api/projects/:id/media/:name", async ({ req, m }) => {
  const dir = projectDir(m[1] as string);
  const name = decodeURIComponent(m[2] as string);
  const ledger = readLedger(join(dir, "media.json"));
  if (!existsSync(join(dir, "media", name))) throw new HttpError(404, `нет файла media/${name}`);
  const b = await body<Partial<MediaRecord>>(req);
  const rec: MediaRecord = { ...(ledger[name] ?? { source: "", author: "", license: "", url: "" }) };
  for (const k of ["role", "title", "source", "author", "license", "url", "notes"] as const) if (b[k] !== undefined) (rec as Record<string, unknown>)[k] = typeof b[k] === "string" ? (b[k] as string).trim() : b[k];
  if (b.url && !/^https?:\/\//.test(b.url)) throw new HttpError(400, "ссылка — http(s)");
  if (b.role && !ROLES.includes(b.role)) throw new HttpError(400, `роль — ${ROLES.join(", ")}`);
  if (b.trim !== undefined) {
    if (b.trim === null) delete rec.trim;
    else if (typeof b.trim.in !== "number" || typeof b.trim.out !== "number" || b.trim.out <= b.trim.in) throw new HttpError(400, "trim — {in, out}, out > in");
    else rec.trim = { in: Math.round(b.trim.in * 100) / 100, out: Math.round(b.trim.out * 100) / 100 };
  }
  if (b.crop !== undefined) rec.crop = b.crop ?? undefined;
  ledger[name] = rec;
  writeLedger(join(dir, "media.json"), ledger);
  return { record: rec, missing: missingLicense(rec) };
});

route("DELETE", "/api/projects/:id/media/:name", ({ m, url }) => {
  const dir = projectDir(m[1] as string);
  const name = decodeURIComponent(m[2] as string);
  const p = readProject(dir);
  if (JSON.stringify(p.beats).includes(`media/${name}`) && url.searchParams.get("force") !== "1") throw new HttpError(409, `media/${name} используется в битах — сначала уберите его из битов`);
  rmSync(join(dir, "media", name), { force: true });
  const ledger = readLedger(join(dir, "media.json"));
  delete ledger[name];
  writeLedger(join(dir, "media.json"), ledger);
  return { removed: name };
});

route("GET", "/api/media/search", async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) throw new HttpError(400, "пустой запрос");
  const args = [MEDIA_CLI, q, "--n", url.searchParams.get("n") ?? "8", "--json"];
  if (url.searchParams.get("video") === "1") args.push("--video");
  const provider = url.searchParams.get("provider");
  if (provider && ["all", "commons", "pexels"].includes(provider)) args.push("--provider", provider);
  const r = await runAsync(NODE, args, { cwd: ROOT_DIR, allowFail: true });
  const line = r.stdout.trim().split("\n").reverse().find((l) => l.startsWith("["));
  if (!line) throw new HttpError(502, (r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ") || "поиск ничего не вернул");
  return { items: JSON.parse(line), pexels: Boolean(loadEnv().PEXELS_API_KEY) };
});

route("POST", "/api/projects/:id/media/get", async ({ req, m }) => {
  const dir = projectDir(m[1] as string, false);
  const b = await body<{ ref: string; as?: string; role?: string; in?: number; out?: number; width?: number }>(req);
  if (!b.ref) throw new HttpError(400, "ref — File:… или pexels:photo:<id>");
  const args = [MEDIA_CLI, "--get", b.ref, dir];
  if (b.as) args.push("--as", b.as.toLowerCase().replace(/[^a-z0-9-]+/g, "-"));
  if (b.role && ROLES.includes(b.role)) args.push("--role", b.role);
  if (typeof b.in === "number") args.push("--in", String(b.in));
  if (typeof b.out === "number") args.push("--out", String(b.out));
  if (typeof b.width === "number") args.push("--width", String(b.width));
  return startJob({ kind: "media", title: `скачать ${b.ref}`, project: basename(dir), cmd: NODE, args, cwd: ROOT_DIR });
});

// ── beats: preview, rebuild, re-voice ────────────────────────────────────────────────────────────────

/** media/<file> of the project → projects/<id>/media/<file>: the preview is built from the repo root. */
function rootPaths<T>(value: T, name: string): T {
  if (typeof value === "string") return (value.startsWith("media/") ? `projects/${name}/${value}` : value) as T;
  if (Array.isArray(value)) return value.map((v) => rootPaths(v, name)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rootPaths(v, name)])) as T;
  return value;
}

const pick = (o: Record<string, unknown>, keys: string[]): Record<string, unknown> => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

route("POST", "/api/projects/:id/beats/:beat/preview", ({ m }) => {
  const dir = projectDir(m[1] as string);
  const name = basename(dir);
  const p = readProject(dir);
  const beat = p.beats.find((x) => x.id === decodeURIComponent(m[2] as string));
  if (!beat) throw new HttpError(404, "нет бита");
  const b = rootPaths(expandBeat(structuredClone(beat), isHtmlScene), name) as BeatSpec & Record<string, any>;
  const words = parseBeatText(beat.text).tokens.flatMap((t) => t.spoken).length;
  const dur = Math.min(9, Math.max(3, Math.round((0.9 + words * 0.36) * 10) / 10));
  const look = p.look === undefined ? [] : ["--look", typeof p.look === "string" ? p.look : JSON.stringify(rootPaths(p.look, name))];
  const tag = `studio-${name}-${beat.id}`;
  const out = join(ROOT_DIR, ".preview", "studio", `${name}-${beat.id}.mp4`);
  mkdirSync(join(ROOT_DIR, ".preview", "studio"), { recursive: true });
  rmSync(out, { force: true });
  let args: string[];
  if (b.scene && isHtmlScene(b.scene)) {
    args = [CLI, "scene", b.scene, "--params", JSON.stringify(b.params ?? {}), ...look, "--beat", JSON.stringify(pick(b, ["type", "camera", "post", "textures", "background"]))];
    if (b.tone) args.push("--tone", b.tone);
    if (b.seed !== undefined) args.push("--seed", String(b.seed));
  } else {
    const stage = (b.stage ?? { type: "color" }) as Record<string, unknown>;
    args = [CLI, "scene", "--stage", String(stage.type), "--text", beat.text, "--dur", String(dur), ...look, "--beat", JSON.stringify(pick(b, ["stage", "devices", "dominant", "camera", "caption", "sync", "textures", "post", "tone"]))];
    if (stage.type === "media" && typeof stage.src === "string") args.push("--src", stage.src);
  }
  args.push("--render", out, "--name", tag, "--no-sheet");
  return startJob({
    kind: "preview",
    title: `превью ${beat.id}`,
    project: name,
    cmd: NODE,
    args,
    cwd: ROOT_DIR,
    onDone: (job) => {
      job.result = { mp4: fileUrl(out), sheet: fileUrl(join(ROOT_DIR, ".preview", tag, "sheet.jpg")) };
    },
  });
});

function startBuild(dir: string, opts: { render: boolean; voice?: string; note?: string; title?: string }): Job {
  const name = basename(dir);
  const running = runningJob("build", name);
  if (running) return running;
  const args = [CLI, "build", dir];
  if (!opts.render) args.push("--no-render");
  if (opts.voice === "kokoro" || opts.voice === "elevenlabs") args.push("--voice", opts.voice);
  return startJob({
    kind: "build",
    title: opts.title ?? (opts.render ? "сборка" : "сборка без рендера"),
    project: name,
    cmd: NODE,
    args,
    cwd: ROOT_DIR,
    stages: BUILD_STAGES,
    stageOf: buildStageOf,
    note: opts.note,
    onDone: (job) => {
      const p = readProject(dir);
      const verify = readOpt<{ ok?: boolean }>(join(dir, "renders", `${p.id}.verify.json`));
      if (opts.render && job.status !== "stopped" && p.status !== "published") {
        const status = job.status === "ok" && verify?.ok ? "verified" : existsSync(join(dir, "renders", `${p.id}.mp4`)) ? "built" : p.status ?? "draft";
        if (status !== p.status) {
          p.status = status;
          writeProject(dir, p);
        }
      }
      job.result = { mp4: fileUrl(join(dir, "renders", `${p.id}.mp4`)), contact: fileUrl(join(dir, "renders", `${p.id}.contact.jpg`)), verify: verify?.ok ?? null };
    },
  });
}

route("POST", "/api/projects/:id/build", async ({ req, m }) => {
  const dir = projectDir(m[1] as string);
  const b = await body<{ render?: boolean; voice?: string }>(req);
  return startBuild(dir, { render: b.render !== false, voice: b.voice });
});

route("POST", "/api/projects/:id/beats/:beat/rebuild", ({ m }) => {
  const dir = projectDir(m[1] as string);
  return startBuild(dir, { render: true, title: `перерендер ради ${decodeURIComponent(m[2] as string)}`, note: "segment" });
});

function voiceInfo(dir: string, beatId: string): { beat: BeatSpec; provider: string; chars: number; key: string | null; take: string | null } {
  const spec = readProject(dir);
  const beat = spec.beats.find((x) => x.id === beatId);
  if (!beat) throw new HttpError(404, "нет бита");
  const choice = resolveVoice(spec);
  const { tts } = parseBeatText(beat.text);
  if (choice.provider !== "elevenlabs") return { beat, provider: choice.provider, chars: tts.length, key: null, take: null };
  // the same key as engine/src/voice.ts elevenTake: provider + voice + model + text
  const key = sha({ provider: "elevenlabs", voiceId: choice.voiceId, model: choice.model, text: tts });
  const take = join(dir, "voice", key);
  return { beat, provider: choice.provider, chars: tts.length, key, take: existsSync(take) ? take : null };
}

route("GET", "/api/projects/:id/beats/:beat/voice", ({ m }) => {
  const dir = projectDir(m[1] as string);
  const v = voiceInfo(dir, decodeURIComponent(m[2] as string));
  return { provider: v.provider, chars: v.chars, cached: Boolean(v.take), budget: budgetState() };
});

route("POST", "/api/projects/:id/beats/:beat/revoice", ({ m }) => {
  const dir = projectDir(m[1] as string);
  const beatId = decodeURIComponent(m[2] as string);
  const v = voiceInfo(dir, beatId);
  if (v.provider !== "elevenlabs") throw new HttpError(400, "голос Kokoro детерминирован: тот же текст даёт тот же дубль — переозвучка имеет смысл только для ElevenLabs или после правки реплики");
  const budget = budgetState();
  if (budget.left !== null && budget.left < v.chars) throw new HttpError(400, `бюджет ElevenLabs: осталось ${budget.left}, нужно ${v.chars}`);
  if (v.take) {
    const hist = join(dir, "history");
    mkdirSync(hist, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_");
    renameSync(v.take, join(hist, `voice_${beatId}_${stamp}`));
  }
  return startBuild(dir, { render: true, title: `переозвучка ${beatId}`, note: "revoice" });
});

// ── jobs ─────────────────────────────────────────────────────────────────────────────────────────────

route("GET", "/api/jobs", ({ url }) => ({ jobs: listJobs(url.searchParams.get("project") ?? undefined).map((j) => jobView(j, Math.max(0, j.log.length - 3))) }));
route("GET", "/api/jobs/:id", ({ m, url }) => {
  const job = getJob(decodeURIComponent(m[1] as string));
  if (!job) throw new HttpError(404, "нет такой задачи (панель перезапускалась?)");
  return jobView(job, Number(url.searchParams.get("from") ?? 0));
});
route("POST", "/api/jobs/:id/stop", ({ m }) => ({ stopped: stopJob(decodeURIComponent(m[1] as string)) }));

// ── schema for the forms ─────────────────────────────────────────────────────────────────────────────

route("GET", "/api/schema", () => {
  const schema = readJson<{ $defs: Record<string, unknown> }>(join(ENGINE_DIR, "scenes", "schema.json"));
  const devicesDir = join(ENGINE_DIR, "devices");
  const devices = Object.fromEntries(
    readdirSync(devicesDir)
      .filter((d) => existsSync(join(devicesDir, d, "device.json")))
      .sort()
      .map((d) => [d, readJson(join(devicesDir, d, "device.json"))]),
  );
  const dirIds = (d: string, file: string): string[] => readdirSync(join(ENGINE_DIR, d)).filter((n) => existsSync(join(ENGINE_DIR, d, n, file))).sort();
  return {
    defs: schema.$defs,
    stageTypes: STAGE_TYPES,
    treatments: TREATMENTS,
    cameraReasons: CAMERA_REASONS,
    sync: ["voice", "music", "both"],
    tones: ["accent", "cold"],
    devices,
    text: readJson(join(devicesDir, "text.schema.json")),
    captionFamilies: readJson(join(devicesDir, "text.caption", "families.json")),
    arcs: readJson(join(ENGINE_DIR, "arcs", "arc.json")),
    intents: readdirSync(join(ENGINE_DIR, "intents")).filter((f) => f.endsWith(".json")).sort().map((f) => readJson<Record<string, unknown>>(join(ENGINE_DIR, "intents", f))),
    scenes: dirIds("scenes", "scene.json").map((id) => {
      const s = readJson<Record<string, any>>(join(ENGINE_DIR, "scenes", id, "scene.json"));
      return { id, name: s.name, use: s.use, params: s.params, anchors: s.anchors };
    }),
    recipes: readdirSync(join(ENGINE_DIR, "scenes", "recipes")).filter((f) => f.endsWith(".json")).sort().map((f) => readJson<Record<string, unknown>>(join(ENGINE_DIR, "scenes", "recipes", f))),
    looks: lookIds(),
    textures: dirIds("textures", "texture.json"),
    transitions: dirIds("transitions", "transition.json"),
    licenses: LICENSES,
    roles: ROLES,
    statuses: STATUSES,
    music: Object.keys(readLedger(join(musicDir(), "music.json"))).map((k) => k.replace(/\.[^.]+$/, "")),
  };
});

// ── library ──────────────────────────────────────────────────────────────────────────────────────────

route("GET", "/api/library", () => {
  const index = previewIndex();
  return {
    sections: SECTIONS,
    items: libraryCatalog().map((item) => {
      const entry = index[`${item.section}/${item.id}`];
      const file = entry?.ok ? join(ROOT_DIR, entry.file) : null;
      return { ...item, preview: file && /\.(mp4|webm)$/.test(file) ? fileUrl(file) : null, audio: item.section === "music" ? fileUrl(join(musicDir(), String(item.facts?.file ?? ""))) : null, previewError: entry && !entry.ok ? entry.error ?? "ошибка" : null };
    }),
  };
});

function setPath(obj: Record<string, any>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1] as string] = value;
}

route("POST", "/api/library/apply", async ({ req }) => {
  const b = await body<{ section: string; id: string; project: string; beat?: string }>(req);
  const item: LibraryItem | undefined = libraryCatalog().find((i) => i.section === b.section && i.id === b.id);
  if (!item) throw new HttpError(404, `нет элемента ${b.section}/${b.id}`);
  const dir = projectDir(b.project);
  const p = readProject(dir);
  const a = item.apply;
  if (a.target === "beat" && !b.beat) throw new HttpError(400, "выберите бит");
  snapshotHistory(dir, `библиотека: ${item.section}/${item.id}`);
  if (a.target === "project") {
    for (const [k, v] of Object.entries(a.set)) {
      if (k === "music" && v && typeof v === "object") p.music = { ...(p.music && typeof p.music === "object" ? p.music : {}), ...(v as object) };
      else setPath(p, k, v);
    }
  } else {
    const beat = p.beats.find((x) => x.id === b.beat) as (BeatSpec & Record<string, any>) | undefined;
    if (!beat) throw new HttpError(404, `нет бита ${b.beat}`);
    if ("push" in a) {
      if (a.push === "textures") beat.textures = [...(beat.textures ?? []).filter((t) => t.id !== a.value.id), a.value as any];
      else {
        if (beat.scene && isHtmlScene(beat.scene)) throw new HttpError(400, `${beat.id} — бит со сценой: устройства ставятся только на stage-бит`);
        const devices = beat.devices ?? [];
        if (devices.length >= 3) throw new HttpError(400, `${beat.id}: уже 3 устройства — грамматика не пустит четвёртое`);
        beat.devices = [...devices, structuredClone(a.value) as any];
        if (!beat.stage && !beat.intent && !beat.scene) beat.stage = { type: "color", color: "night", glow: true };
        if (beat.dominant === undefined || item.section === "kinetic") beat.dominant = item.section === "kinetic" ? beat.devices.length - 1 : "stage";
      }
    } else {
      if (a.replaceStage) for (const k of ["stage", "devices", "dominant", "intent", "target", "at", "params", "anchors"]) delete beat[k];
      for (const [k, v] of Object.entries(a.set)) setPath(beat, k, structuredClone(v));
    }
  }
  writeProject(dir, p);
  return { applied: `${item.section}/${item.id}`, ...validate(dir) };
});

route("GET", "/api/looks", () => ({ looks: lookIds().map((id) => ({ id, look: readJson(join(ENGINE_DIR, "looks", id, "look.json")) })), families: readJson(join(ENGINE_DIR, "devices", "text.caption", "families.json")) }));

route("POST", "/api/looks", async ({ req }) => {
  const b = await body<{ id: string; name: string; extends: string; accent?: string; secondary?: string; mood?: string; family?: string; textures?: string[]; camera?: string; grain?: number }>(req);
  if (!ID_RE.test(b.id ?? "")) throw new HttpError(400, "id look — строчная латиница, цифры и дефис");
  const dir = join(ENGINE_DIR, "looks", b.id);
  if (existsSync(dir)) throw new HttpError(409, `look ${b.id} уже есть`);
  if (!lookIds().includes(b.extends)) throw new HttpError(400, "основа — один из встроенных look");
  const base = readJson<Record<string, any>>(join(ENGINE_DIR, "looks", b.extends, "look.json"));
  const look = structuredClone(base);
  look.id = b.id;
  look.name = b.name || b.id;
  if (b.mood) look.about = { ...(look.about ?? {}), mood: b.mood };
  const hex = /^#[0-9A-Fa-f]{6}$/;
  if (b.accent) {
    if (!hex.test(b.accent)) throw new HttpError(400, "акцент — #RRGGBB");
    look.palette.accent = b.accent.toUpperCase();
  }
  if (b.secondary) {
    if (!hex.test(b.secondary)) throw new HttpError(400, "второй тон — #RRGGBB");
    look.palette.secondary = b.secondary.toUpperCase();
  }
  if (b.family) {
    const families = readJson<Record<string, string[]>>(join(ENGINE_DIR, "devices", "text.caption", "families.json"));
    if (!families[b.family]) throw new HttpError(400, "семейство субтитров — calm, explainer или energetic");
    look.captions = { ...(look.captions ?? {}), family: b.family, preset: families[b.family]?.[0] };
  }
  if (Array.isArray(b.textures)) {
    const byId = new Map<string, Record<string, unknown>>((base.textures ?? []).map((t: Record<string, unknown>) => [String(t.id), t]));
    look.textures = b.textures.map((id) => byId.get(id) ?? { id });
  }
  if (b.camera) look.motion = { ...(look.motion ?? {}), camera: { ...(look.motion?.camera ?? {}), preset: b.camera } };
  if (typeof b.grain === "number") look.grain = b.grain;
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "look.json"), look);
  try {
    loadLook(b.id);
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw new HttpError(400, msg(err));
  }
  return { id: b.id };
});

route("POST", "/api/library/music", async ({ req, url }) => {
  const original = url.searchParams.get("name") ?? "";
  if (!/\.(wav|mp3|flac|ogg)$/i.test(original)) throw new HttpError(400, "трек — wav, mp3, flac или ogg");
  const name = `${basename(original, extname(original)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "track"}${extname(original).toLowerCase()}`;
  const file = join(musicDir(), name);
  if (existsSync(file)) throw new HttpError(409, `library/music/${name} уже есть`);
  mkdirSync(musicDir(), { recursive: true });
  writeFileSync(file, await rawBody(req));
  return { file: name };
});

route("PUT", "/api/library/music/:file", async ({ req, m }) => {
  const name = decodeURIComponent(m[1] as string);
  const file = join(musicDir(), name);
  if (!/^[\w.-]+$/.test(name) || !existsSync(file)) throw new HttpError(404, `нет library/music/${name}`);
  const b = await body<Record<string, any>>(req);
  const rec: MediaRecord = { title: String(b.title ?? name), source: String(b.source ?? "").trim(), author: String(b.author ?? "").trim(), license: String(b.license ?? "").trim(), url: String(b.url ?? "").trim(), added: today(), mood: String(b.mood ?? ""), looks: Array.isArray(b.looks) ? b.looks : [] };
  const miss = missingLicense(rec);
  if (miss.length) {
    rmSync(file, { force: true });
    throw new HttpError(400, `без лицензии трек не добавляется: не заполнено ${miss.join(", ")}`);
  }
  let grid: { bpm: number; beats: number[] };
  try {
    grid = trackBeats(file);
  } catch (err) {
    rmSync(file, { force: true });
    throw new HttpError(400, `сетка битов не посчиталась: ${msg(err)}`);
  }
  const ledgerPath = join(musicDir(), "music.json");
  const ledger = readLedger(ledgerPath);
  ledger[name] = { ...rec, bpm: grid.bpm };
  writeLedger(ledgerPath, ledger);
  return { file: name, bpm: grid.bpm, beats: grid.beats.length };
});

// ── settings ─────────────────────────────────────────────────────────────────────────────────────────

route("GET", "/api/settings", () => {
  const env = loadEnv();
  const envFile = join(ROOT_DIR, ".env");
  const envKeys = existsSync(envFile) ? [...readFileSync(envFile, "utf8").matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((x) => x[1] as string) : [];
  const usage = projectDirs().map((d) => {
    const f = join(d, "voice", "usage.jsonl");
    const lines = existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean) : [];
    const chars = lines.reduce((n, l) => {
      try {
        return n + Number(JSON.parse(l).chars ?? 0);
      } catch {
        return n;
      }
    }, 0);
    return { project: basename(d), takes: lines.length, chars };
  });
  let config: unknown;
  let error: string | null = null;
  try {
    config = loadConfig();
  } catch (err) {
    error = msg(err);
    config = readOpt(CONFIG_PATH);
  }
  return {
    config,
    configExists: existsSync(CONFIG_PATH),
    error,
    // values of the keys never leave the server: only whether they are set
    secrets: SECRET_KEYS.map((key) => ({ key, set: Boolean(env[key]) })),
    extraEnv: envKeys.filter((k) => !SECRET_KEYS.includes(k)),
    budget: budgetState(),
    usage,
    looks: lookIds(),
  };
});

route("PUT", "/api/settings", async ({ req }) => {
  const b = await body<{ config: Record<string, unknown> }>(req);
  if (!b.config || typeof b.config !== "object") throw new HttpError(400, "config — объект");
  const before = existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, "utf8") : null;
  writeJson(CONFIG_PATH, b.config);
  try {
    return { config: loadConfig() };
  } catch (err) {
    if (before === null) rmSync(CONFIG_PATH, { force: true });
    else writeFileSync(CONFIG_PATH, before);
    throw new HttpError(400, msg(err));
  }
});

route("POST", "/api/doctor", () => startJob({ kind: "doctor", title: "doctor", cmd: NODE, args: [CLI, "doctor"], cwd: ROOT_DIR }));

// ── director: brief.json and claude -p ───────────────────────────────────────────────────────────────

const CHECK_FILE = join(ROOT_DIR, ".cache", "studio", "claude-check.json");

function findClaude(): string | null {
  const candidates = [process.env.CLAUDE_BIN, join(homedir(), ".local", "bin", "claude"), ...(process.env.PATH ?? "").split(delimiter).map((d) => join(d, "claude"))];
  return candidates.find((c): c is string => Boolean(c) && existsSync(c as string)) ?? null;
}

route("GET", "/api/director", () => ({ claude: findClaude(), check: readOpt(CHECK_FILE), looks: lookIds(), config: loadConfig() }));

route("POST", "/api/director/check", () => {
  const bin = findClaude();
  if (!bin) throw new HttpError(404, "claude не найден: ни в PATH, ни в ~/.local/bin");
  let out = "";
  return startJob({
    kind: "claude-check",
    title: "проверка claude -p",
    cmd: bin,
    args: ["-p", "Reply with exactly one word: ok", "--output-format", "json", "--max-turns", "1"],
    cwd: ROOT_DIR,
    onLine: (line) => {
      out += line + "\n";
    },
    onDone: (job) => {
      let parsed: Record<string, any> | null = null;
      const line = out.trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
      try {
        parsed = line ? JSON.parse(line) : null;
      } catch {
        parsed = null;
      }
      const ok = job.status === "ok" && Boolean(parsed) && !parsed?.is_error && /ok/i.test(String(parsed?.result ?? ""));
      const record = { at: new Date().toISOString(), bin, ok, exitCode: job.exitCode, result: parsed?.result ?? null, error: ok ? null : String(parsed?.result ?? out.trim().split("\n").slice(-3).join(" ")).slice(0, 400), cost: parsed?.total_cost_usd ?? null, durationMs: parsed?.duration_ms ?? null };
      writeJson(CHECK_FILE, record);
      job.result = record;
    },
  });
});

route("POST", "/api/brief", async ({ req }) => {
  const b = await body<{ id: string; topic: string; look?: string; voice?: string; seconds?: number; wishes?: string }>(req);
  if (!ID_RE.test(b.id ?? "")) throw new HttpError(400, "id ролика — строчная латиница, цифры и дефис, например tunguska-en");
  if (!b.topic?.trim()) throw new HttpError(400, "нужна тема");
  const dir = join(projectsDir(), b.id);
  if (existsSync(join(dir, "project.json"))) throw new HttpError(409, `projects/${b.id} уже есть — выберите другой id`);
  if (b.look && b.look !== "director" && !lookIds().includes(b.look)) throw new HttpError(400, `нет look ${b.look}`);
  mkdirSync(dir, { recursive: true });
  const cfg = loadConfig();
  const brief = {
    id: b.id,
    topic: b.topic.trim(),
    look: b.look && b.look !== "director" ? b.look : null,
    voice: b.voice === "kokoro" || b.voice === "elevenlabs" ? b.voice : cfg.voice.provider,
    seconds: Number(b.seconds) || cfg.short.targetSeconds,
    wishes: (b.wishes ?? "").trim(),
    createdAt: new Date().toISOString(),
  };
  writeJson(join(dir, "brief.json"), brief);
  return { brief, command: `claude "/short ${b.id}"` };
});

route("GET", "/api/brief/:id", ({ m }) => {
  const dir = projectDir(m[1] as string, false);
  const job = listJobs(basename(dir)).find((j) => j.kind === "director");
  return { brief: readOpt(join(dir, "brief.json")), project: existsSync(join(dir, "project.json")), media: existsSync(join(dir, "media.json")) ? Object.keys(readLedger(join(dir, "media.json"))).length : 0, research: existsSync(join(dir, "research.md")), job: job ? { id: job.id, status: job.status } : null };
});

/** stream-json of claude -p → one readable line per tool call and per text of the assistant. */
function directorLine(raw: string): string | null {
  const s = raw.trim();
  if (!s.startsWith("{")) return s || null;
  try {
    const ev = JSON.parse(s) as Record<string, any>;
    if (ev.type === "assistant") {
      const parts = (ev.message?.content ?? []) as Record<string, any>[];
      return (
        parts
          .map((c) => (c.type === "text" ? String(c.text).trim().split("\n")[0]?.slice(0, 240) : c.type === "tool_use" ? `▸ ${c.name}: ${String(c.input?.command ?? c.input?.file_path ?? c.input?.pattern ?? c.input?.url ?? c.input?.skill ?? "").slice(0, 200)}` : ""))
          .filter(Boolean)
          .join("\n") || null
      );
    }
    if (ev.type === "result") return `${ev.is_error ? "✗" : "✓"} итог: ${String(ev.result ?? "").split("\n")[0]?.slice(0, 300)} · ${Math.round((ev.duration_ms ?? 0) / 1000)} с${ev.total_cost_usd ? ` · $${Number(ev.total_cost_usd).toFixed(2)}` : ""}`;
    if (ev.type === "system" && ev.subtype === "init") return `claude: модель ${ev.model ?? "?"}, навыков и команд ${(ev.slash_commands ?? []).length}`;
    return null;
  } catch {
    return s;
  }
}

const DIRECTOR_STAGES = ["research", "script", "media", "project", "build"];

route("POST", "/api/director/run", async ({ req }) => {
  const b = await body<{ id: string }>(req);
  const dir = projectDir(b.id, false);
  if (!existsSync(join(dir, "brief.json"))) throw new HttpError(400, "сначала бриф");
  const bin = findClaude();
  if (!bin) throw new HttpError(404, "claude не найден");
  const running = runningJob("director", b.id);
  if (running) return running;
  return startJob({
    kind: "director",
    title: `/short ${b.id}`,
    project: b.id,
    cmd: bin,
    args: ["-p", `/short ${b.id}`, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--allowedTools", "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Skill,TodoWrite"],
    cwd: ROOT_DIR,
    stages: DIRECTOR_STAGES,
    transform: directorLine,
    stageOf: (line) => {
      if (!line.startsWith("▸")) return null;
      if (/npm run build/.test(line)) return "build";
      if (/project\.json/.test(line)) return "project";
      if (/npm run media|media\.json/.test(line)) return "media";
      if (/research\.md/.test(line) && /Write|Edit/.test(line)) return "script";
      if (/WebFetch|WebSearch|wikipedia/i.test(line)) return "research";
      return null;
    },
  });
});
