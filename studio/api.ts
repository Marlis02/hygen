import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { basename, delimiter, extname, join, relative, sep } from "node:path";
import { BUILD_STAGES, buildStageOf, dropJobs, getJob, listJobs, runningJob, startJob, stopJob } from "./jobs.ts";
import type { Job } from "./jobs.ts";
import { SECTIONS, itemHash, libraryCatalog, previewFile, previewIndex } from "../engine/src/library.ts";
import type { LibraryItem } from "../engine/src/library.ts";
import { CONFIG_PATH, LICENSES, ROLES, checkProjectMedia, dropFromLibraryIndex, loadConfig, missingLicense, musicDir, projectDirs, projectsDir, readLedger, snapshotHistory, writeLedger } from "../engine/src/lib/project.ts";
import type { MediaRecord } from "../engine/src/lib/project.ts";
import { ENGINE_DIR, LIBRARY_DIR, ROOT_DIR, loadEnv, readJson, runAsync, sha, writeJson } from "../engine/src/lib/util.ts";
import { SECRET_KEYS } from "../engine/src/doctor.ts";
import { expandBeat } from "../engine/src/intents.ts";
import { lookIds, loadLook } from "../engine/src/look.ts";
import { trackBeats } from "../engine/src/music.ts";
import { isHtmlScene, loadSpec, parseBeatText } from "../engine/src/spec.ts";
import type { BeatSpec, VideoSpec } from "../engine/src/spec.ts";
import { CAMERA_REASONS, STAGE_TYPES, TREATMENTS } from "../engine/src/stage.ts";
import { ELEVEN_SPEED, finalPlan, projectBudget, resolveVoice } from "../engine/src/voice.ts";
import { dialogBuffer, dialogContext, dialogState, findClaude, listDialogs, maxDialogs, noteEdit, resizeDialog, runningProjects, startDialog, stopDialog, writeDialog } from "./dialogs.ts";
import { markSelfWrite, setProjectEditHook } from "./events.ts";

// The local API of the studio over the engine: every write goes to project.json, media.json, music.json, a look file
// or hygen.config.json — the same files the CLI and the director read, so editing JSON by hand keeps working.

const NODE = process.execPath;
const CLI = join(ENGINE_DIR, "src", "cli.ts");
const MEDIA_CLI = join(ENGINE_DIR, "src", "media.ts");
const ID_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;
const ASSET_RE = /\.(jpe?g|png|webp|gif|mp4|webm|mov|ogv|wav|mp3|flac|ogg)$/i;
/**
 * Статусы ролика (ROADMAP S2). Черновик живёт на Kokoro и ничего не стоит; финал — один прогон ElevenLabs;
 * «выложен» ставит человек; waiting-library ждёт будущих референсов и пока не используется.
 */
/** Жанры брифа (ROADMAP S2): по жанру навык берёт свои правила исследования. */
export const GENRES = ["history", "science", "facts", "entertainment", "explainer"];

export const STATUSES = ["draft-kokoro", "final-elevenlabs", "published", "waiting-library"];
export const STATUS_OF_OLD: Record<string, string> = { draft: "draft-kokoro", built: "draft-kokoro", verified: "draft-kokoro", published: "published" };
export const statusOf = (p: Record<string, any>): string => {
  const raw = String(p.status ?? "draft-kokoro");
  if (STATUSES.includes(raw)) return raw;
  const mapped = STATUS_OF_OLD[raw] ?? "draft-kokoro";
  // a video voiced by ElevenLabs was a final long before the statuses of S2 existed
  return mapped === "draft-kokoro" && (p.voice?.provider ?? p.voice?.engine) === "elevenlabs" ? "final-elevenlabs" : mapped;
};

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
/** Writes of the panel itself: the file watch of a project must not reload the page after its own save. */
const markSelf = (dir: string): void => {
  for (const f of ["project.json", "media.json"]) markSelfWrite(join(dir, f));
};
const writeProject = (dir: string, p: unknown): void => {
  markSelf(dir);
  writeJson(join(dir, "project.json"), p);
};

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
  const provider = v?.provider ?? v?.engine ?? "kokoro";
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
  const mp4 = join(renders, `${p.id}.mp4`);
  const brief = readOpt<{ topic?: string; genre?: string; createdAt?: string }>(join(dir, "brief.json"));
  return {
    id: name,
    title: p.title,
    topic: brief?.topic ?? null,
    genre: brief?.genre ?? null,
    status: statusOf(p),
    proof: Boolean(p.proof),
    duration: build?.duration_s ?? null,
    builtAt: existsSync(buildJson) ? statSync(buildJson).mtime.toISOString() : null,
    // a video is only «собран» when its MP4 is here: renders are not in git, so a fresh clone shows «не собран»
    built: existsSync(mp4),
    createdAt: brief?.createdAt ?? statSync(join(dir, "project.json")).birthtime.toISOString(),
    changedAt: statSync(join(dir, "project.json")).mtime.toISOString(),
    voice: voiceLabel(p.voice),
    provider: (p.voice?.provider ?? p.voice?.engine ?? "kokoro") as string,
    look: lookLabel(p.look),
    beats: p.beats?.length ?? 0,
    thumb: fileUrl(thumb),
    history: existsSync(join(dir, "history")) ? readdirSync(join(dir, "history")).length : 0,
    mediaErrors: media.errors.length,
    publishedAt: p.publishedAt ?? null,
    building: Boolean(runningJob("build", name)),
    dialog: runningProjects().includes(name),
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
      const snap = readOpt<{ at?: string; reason?: string; why?: string; engine?: string }>(join(hist, n, "snapshot.json"));
      const files = readdirSync(join(hist, n));
      const sheet = files.find((f) => f.endsWith(".contact.jpg"));
      return { name: n, at: snap?.at ?? null, reason: snap?.reason ?? (files.includes("research.md") ? "архив до пересказа" : ""), why: snap?.why ?? "", engine: snap?.engine ?? null, files, canRollback: files.includes("project.json"), sheet: sheet ? fileUrl(join(hist, n, sheet)) : null };
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
    budget: projectBudget(dir),
    final: finalPlan(dir),
    dialogs: listDialogs(dir),
    dialog: dialogState(basename(dir)).dialog,
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

/**
 * «Удалить проект» (ROADMAP S2): the folder, the row of library/index.json and the jobs of the panel go together.
 * The body must repeat the id — a click cannot delete a video by accident.
 */
route("DELETE", "/api/projects/:id", async ({ req, m }) => {
  const dir = projectDir(m[1] as string, false);
  const id = basename(dir);
  const b = await body<{ confirm?: string }>(req);
  if ((b.confirm ?? "").trim() !== id) throw new HttpError(400, `чтобы удалить, впишите имя проекта: ${id}`);
  if (!existsSync(dir)) throw new HttpError(404, `нет projects/${id}`);
  if (runningProjects().includes(id)) throw new HttpError(409, "в проекте идёт диалог — сначала «Завершить»");
  const jobs = dropJobs(id);
  const indexed = dropFromLibraryIndex(id);
  rmSync(dir, { recursive: true, force: true });
  return { removed: id, jobs, index: indexed };
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
  markSelf(dir);
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
  markSelf(dir);
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
  markSelf(dir);
  writeLedger(join(dir, "media.json"), ledger);
  return { record: rec, missing: missingLicense(rec) };
});

route("DELETE", "/api/projects/:id/media/:name", ({ m, url }) => {
  const dir = projectDir(m[1] as string);
  const name = decodeURIComponent(m[2] as string);
  const p = readProject(dir);
  if (JSON.stringify(p.beats).includes(`media/${name}`) && url.searchParams.get("force") !== "1") throw new HttpError(409, `media/${name} используется в битах — сначала уберите его из битов`);
  markSelf(dir);
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
      // a Kokoro build is a draft, an ElevenLabs build is the final; «выложен» is set by hand and never overwritten
      if (opts.render && job.status !== "stopped" && statusOf(p) !== "published") {
        const provider = readOpt<{ voice?: { provider?: string } }>(join(dir, "renders", `${p.id}.build.json`))?.voice?.provider;
        const status = provider === "elevenlabs" ? "final-elevenlabs" : "draft-kokoro";
        if (status !== p.status) {
          p.status = status;
          writeProject(dir, p);
        }
      }
      job.result = { mp4: fileUrl(join(dir, "renders", `${p.id}.mp4`)), contact: fileUrl(join(dir, "renders", `${p.id}.contact.jpg`)), verify: verify?.ok ?? null };
    },
  });
}

/**
 * «Собрать» и «Без рендера» — всегда Kokoro, бесплатно. A final video whose line was edited would send those lines to
 * ElevenLabs: such a build answers 409 with what it would cost until the page confirms it.
 */
route("POST", "/api/projects/:id/build", async ({ req, m }) => {
  const dir = projectDir(m[1] as string);
  const b = await body<{ render?: boolean; voice?: string; confirm?: boolean }>(req);
  const p = readProject(dir);
  const provider = b.voice ?? p.voice?.provider ?? p.voice?.engine ?? "kokoro";
  if (provider === "elevenlabs" && !b.confirm) {
    const plan = finalPlan(dir);
    if (plan.missing.length) {
      throw new HttpError(409, `${plan.missing.length === 1 ? "1 реплика будет переозвучена" : `${plan.missing.length} реплик будут переозвучены`}, ${plan.chars} символов (бюджет ролика: осталось ${plan.budget.left} из ${plan.budget.budget})`);
    }
  }
  return startBuild(dir, { render: b.render !== false, voice: b.voice });
});

// ── бюджет и финал на ElevenLabs (ROADMAP S2) ───────────────────────────────────────────────────────

route("GET", "/api/projects/:id/final", ({ m }) => {
  const dir = projectDir(m[1] as string);
  return { ...finalPlan(dir), speed: ELEVEN_SPEED, key: Boolean(loadEnv().ELEVENLABS_API_KEY) };
});

route("PUT", "/api/projects/:id/budget", async ({ req, m }) => {
  const dir = projectDir(m[1] as string);
  const { budgetChars } = await body<{ budgetChars: number }>(req);
  const n = Number(budgetChars);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new HttpError(400, "бюджет — число символов от 0 до 1 000 000");
  const p = readProject(dir);
  p.voice = { ...(p.voice && typeof p.voice === "object" ? p.voice : {}), budgetChars: Math.round(n) };
  writeProject(dir, p);
  return projectBudget(dir);
});

/** «Финал на ElevenLabs»: the confirmed run — the provider goes into project.json and the build re-voices what is missing. */
route("POST", "/api/projects/:id/final", async ({ req, m }) => {
  const dir = projectDir(m[1] as string);
  const b = await body<{ confirm?: boolean }>(req);
  const plan = finalPlan(dir);
  if (!b.confirm) throw new HttpError(400, "нужно подтверждение");
  if (!loadEnv().ELEVENLABS_API_KEY && plan.missing.length) throw new HttpError(400, "нет ELEVENLABS_API_KEY в .env — переозвучить нечем");
  if (!plan.enough) throw new HttpError(400, `нужно ${plan.chars} символов, бюджет ролика ${plan.budget.left} из ${plan.budget.budget}`);
  const p = readProject(dir);
  p.voice = { ...(p.voice && typeof p.voice === "object" ? p.voice : {}), provider: "elevenlabs" };
  writeProject(dir, p);
  return startBuild(dir, { render: true, title: "финал на ElevenLabs", note: "final" });
});

/** «Обратно на Kokoro»: правки без трат; дубли ElevenLabs остаются в voice/ и ждут следующего финала. */
route("POST", "/api/projects/:id/kokoro", ({ m }) => {
  const dir = projectDir(m[1] as string);
  const p = readProject(dir);
  p.voice = { ...(p.voice && typeof p.voice === "object" ? p.voice : {}), provider: "kokoro" };
  if (statusOf(p) !== "published") p.status = "draft-kokoro";
  writeProject(dir, p);
  return { provider: "kokoro", status: p.status };
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
  return { provider: v.provider, chars: v.chars, cached: Boolean(v.take), budget: projectBudget(dir) };
});

route("POST", "/api/projects/:id/beats/:beat/revoice", ({ m }) => {
  const dir = projectDir(m[1] as string);
  const beatId = decodeURIComponent(m[2] as string);
  const v = voiceInfo(dir, beatId);
  if (v.provider !== "elevenlabs") throw new HttpError(400, "голос Kokoro детерминирован: тот же текст даёт тот же дубль — переозвучка имеет смысл только для ElevenLabs или после правки реплики");
  const budget = projectBudget(dir);
  if (budget.left < v.chars) throw new HttpError(400, `бюджет ролика: осталось ${budget.left}, нужно ${v.chars}`);
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
  const schema = readJson<{ $defs: Record<string, unknown> }>(join(LIBRARY_DIR, "scenes", "schema.json"));
  const devicesDir = join(LIBRARY_DIR, "devices");
  const devices = Object.fromEntries(
    readdirSync(devicesDir)
      .filter((d) => existsSync(join(devicesDir, d, "device.json")))
      .sort()
      .map((d) => [d, readJson(join(devicesDir, d, "device.json"))]),
  );
  const dirIds = (d: string, file: string): string[] => readdirSync(join(LIBRARY_DIR, d)).filter((n) => existsSync(join(LIBRARY_DIR, d, n, file))).sort();
  return {
    defs: schema.$defs,
    stageTypes: STAGE_TYPES,
    treatments: TREATMENTS,
    cameraReasons: CAMERA_REASONS,
    sync: ["voice", "music", "both"],
    tones: ["accent", "cold"],
    devices,
    text: readJson(join(devicesDir, "text.schema.json")),
    captionFamilies: readJson(join(LIBRARY_DIR, "captions", "families.json")),
    arcs: readJson(join(LIBRARY_DIR, "arcs", "arc.json")),
    intents: readdirSync(join(LIBRARY_DIR, "intents")).filter((f) => f.endsWith(".json")).sort().map((f) => readJson<Record<string, unknown>>(join(LIBRARY_DIR, "intents", f))),
    scenes: dirIds("scenes", "scene.json").map((id) => {
      const s = readJson<Record<string, any>>(join(LIBRARY_DIR, "scenes", id, "scene.json"));
      return { id, name: s.name, use: s.use, params: s.params, anchors: s.anchors };
    }),
    recipes: readdirSync(join(LIBRARY_DIR, "scenes", "recipes")).filter((f) => f.endsWith(".json")).sort().map((f) => readJson<Record<string, unknown>>(join(LIBRARY_DIR, "scenes", "recipes", f))),
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

/** Элементы без превью — по хэшу содержимого: столько галерея и будет считать. */
function missingPreviews(): string[] {
  const index = previewIndex();
  return libraryCatalog()
    .filter((item) => {
      const prev = index[`${item.section}/${item.id}`];
      return !prev || prev.hash !== itemHash(item) || !prev.ok || !existsSync(join(ROOT_DIR, prev.file));
    })
    .map((item) => `${item.section}/${item.id}`);
}

/**
 * Единственная автоматическая сборка в системе (CLAUDE.md, правило 14): галерея досчитывает недостающие превью.
 * Задача живёт на сервере — закрытие вкладки её не останавливает; открытый раздел считается первым.
 */
route("POST", "/api/library/previews", async ({ req }) => {
  const b = await body<{ section?: string; force?: boolean }>(req);
  const running = runningJob("previews");
  if (running) return running;
  const missing = missingPreviews();
  if (!missing.length && !b.force) return { nothing: true, missing: 0 };
  const args = [join(ENGINE_DIR, "src", "library-previews.ts"), "--jobs", "2"];
  if (b.section && SECTIONS.includes(b.section as never)) args.push("--first", b.section);
  if (b.force) args.push("--force");
  let total = missing.length;
  let done = 0;
  return startJob({
    kind: "previews",
    title: `превью библиотеки: ${total}`,
    cmd: NODE,
    args,
    cwd: ROOT_DIR,
    onLine: (line, job) => {
      const m = /^\[(\d+)\/(\d+)\]/.exec(line.trim());
      if (!m) return;
      done = Number(m[1]);
      total = Number(m[2]);
      job.result = { done, total };
    },
  });
});

route("GET", "/api/library", () => {
  const index = previewIndex();
  const job = runningJob("previews");
  return {
    missing: missingPreviews().length,
    job: job ? { id: job.id, ...(job.result ?? {}) } : null,
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

route("GET", "/api/looks", () => ({ looks: lookIds().map((id) => ({ id, look: readJson(join(LIBRARY_DIR, "looks", id, "look.json")) })), families: readJson(join(LIBRARY_DIR, "captions", "families.json")) }));

route("POST", "/api/looks", async ({ req }) => {
  const b = await body<{ id: string; name: string; extends: string; accent?: string; secondary?: string; mood?: string; family?: string; textures?: string[]; camera?: string; grain?: number; sampleLine?: string }>(req);
  if (!ID_RE.test(b.id ?? "")) throw new HttpError(400, "id look — строчная латиница, цифры и дефис");
  const dir = join(LIBRARY_DIR, "looks", b.id);
  if (existsSync(dir)) throw new HttpError(409, `look ${b.id} уже есть`);
  if (!lookIds().includes(b.extends)) throw new HttpError(400, "основа — один из встроенных look");
  const base = readJson<Record<string, any>>(join(LIBRARY_DIR, "looks", b.extends, "look.json"));
  const look = structuredClone(base);
  look.id = b.id;
  look.name = b.name || b.id;
  if (b.mood) look.about = { ...(look.about ?? {}), mood: b.mood };
  if (b.sampleLine) look.sampleLine = String(b.sampleLine).trim().slice(0, 60);
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
    const families = readJson<Record<string, string[]>>(join(LIBRARY_DIR, "captions", "families.json"));
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
  // the budget is per video now: the settings screen shows what each of them has spent against its own budget
  const usage = projectDirs().map((d) => ({ project: basename(d), ...projectBudget(d) }));
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

// ── режиссёр: бриф и диалог (ROADMAP S2) ────────────────────────────────────────────────────────────

route("GET", "/api/director", () => ({ claude: findClaude(), looks: lookIds(), config: loadConfig(), genres: GENRES, dialogs: dialogState(), max: maxDialogs() }));

route("POST", "/api/brief", async ({ req }) => {
  const b = await body<{ id: string; topic: string; genre?: string; look?: string; seconds?: number; wishes?: string; arc?: string; avoid?: string; mustShow?: string }>(req);
  if (!ID_RE.test(b.id ?? "")) throw new HttpError(400, "id ролика — строчная латиница, цифры и дефис, например tunguska-en");
  if (!b.topic?.trim()) throw new HttpError(400, "нужна тема");
  const dir = join(projectsDir(), b.id);
  if (existsSync(join(dir, "project.json"))) throw new HttpError(409, `projects/${b.id} уже есть — выберите другой id`);
  if (b.look && b.look !== "director" && !lookIds().includes(b.look)) throw new HttpError(400, `нет look ${b.look}`);
  if (!GENRES.includes(b.genre ?? "")) throw new HttpError(400, `жанр — ${GENRES.join(", ")}`);
  mkdirSync(dir, { recursive: true });
  const cfg = loadConfig();
  const brief = {
    id: b.id,
    topic: b.topic.trim(),
    genre: b.genre,
    look: b.look && b.look !== "director" ? b.look : null,
    seconds: Number(b.seconds) || cfg.short.targetSeconds,
    wishes: (b.wishes ?? "").trim(),
    arc: (b.arc ?? "").trim() || null,
    avoid: (b.avoid ?? "").trim() || null,
    mustShow: (b.mustShow ?? "").trim() || null,
    createdAt: new Date().toISOString(),
  };
  writeJson(join(dir, "brief.json"), brief);
  return { brief, command: `/short ${b.id}` };
});

route("GET", "/api/brief/:id", ({ m }) => {
  const dir = projectDir(m[1] as string, false);
  const job = listJobs(basename(dir)).find((j) => j.kind === "director");
  return { brief: readOpt(join(dir, "brief.json")), project: existsSync(join(dir, "project.json")), media: existsSync(join(dir, "media.json")) ? Object.keys(readLedger(join(dir, "media.json"))).length : 0, research: existsSync(join(dir, "research.md")), job: job ? { id: job.id, status: job.status } : null };
});

// ── диалог с режиссёром (studio/dialogs.ts) ─────────────────────────────────────────────────────────

route("GET", "/api/dialogs", () => ({ ...dialogState(), claude: findClaude() }));

route("GET", "/api/projects/:id/dialog", ({ m }) => {
  const dir = projectDir(m[1] as string, false);
  const id = basename(dir);
  return { ...dialogState(id), context: dialogContext(dir), list: listDialogs(dir), buffer: dialogBuffer(id), claude: findClaude() };
});

/** «Открыть диалог» / «Продолжить диалог»: без проекта терминал не запускается. */
route("POST", "/api/projects/:id/dialog", async ({ req, m }) => {
  const dir = projectDir(m[1] as string, false);
  const b = await body<{ cols?: number; rows?: number; resume?: string }>(req);
  if (!existsSync(join(dir, "brief.json")) && !existsSync(join(dir, "project.json"))) throw new HttpError(400, "у проекта нет ни брифа, ни project.json");
  return startDialog(dir, { cols: b.cols, rows: b.rows, resume: b.resume });
});

route("POST", "/api/projects/:id/dialog/input", async ({ req, m }) => {
  writeDialog(basename(projectDir(m[1] as string, false)), (await body<{ data: string }>(req)).data);
  return { ok: true };
});

route("POST", "/api/projects/:id/dialog/resize", async ({ req, m }) => {
  const b = await body<{ cols?: number; rows?: number }>(req);
  resizeDialog(basename(projectDir(m[1] as string, false)), b.cols, b.rows);
  return { ok: true };
});

route("POST", "/api/projects/:id/dialog/stop", ({ m }) => stopDialog(basename(projectDir(m[1] as string, false))));

/** The file watch counts what the director changed while the dialog was running — it becomes the summary of the run. */
setProjectEditHook((id, files) => {
  if (files.some((f) => f === "project.json" || f === "media.json" || f.startsWith("media/"))) noteEdit(id);
});
