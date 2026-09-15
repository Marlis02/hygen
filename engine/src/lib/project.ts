import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { LIBRARY_DIR, ROOT_DIR, engineCommit, fail, readJson, writeJson, writeJsonIfChanged } from "./util.ts";

// Project storage (ROADMAP S1): hygen.config.json in the root (no secrets), projects/<id>/ with project.json and
// media.json next to it, media/ with asset files only, voice/, renders/ (mp4, sheets, publish/), history/;
// library/music/ with music.json and beats/. Every licensed file has one record in the ledger of its folder.

export interface HygenConfig {
  /** Kokoro is always the default provider (S2); voiceId and model belong to ElevenLabs, defaultBudgetChars is the budget a new video starts with. */
  voice: { voiceId: string; model: string; kokoroVoice: string; defaultBudgetChars: number };
  look: string;
  bitrate: { crf: number; preset: string; maxrate: string; bufsize: string };
  short: { targetSeconds: number; minSeconds: number; maxSeconds: number };
  paths: { projects: string; library: string };
  /** maxDialogs — сколько живых диалогов с режиссёром панель держит разом (ROADMAP S2). */
  studio: { port: number; maxDialogs: number };
}

export const CONFIG_PATH = join(ROOT_DIR, "hygen.config.json");

export const DEFAULT_CONFIG: HygenConfig = {
  voice: { voiceId: "", model: "eleven_multilingual_v2", kokoroVoice: "am_michael", defaultBudgetChars: 1200 },
  look: "ember",
  bitrate: { crf: 18, preset: "slow", maxrate: "16M", bufsize: "32M" },
  short: { targetSeconds: 45, minSeconds: 35, maxSeconds: 59 },
  paths: { projects: "projects", library: "library" },
  studio: { port: 5177, maxDialogs: 2 },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function merge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in out && isObj(out[k]) ? merge(out[k], v) : v;
  return out as T;
}

/** hygen.config.json over the defaults; an unknown section or a wrong type fails — the config is read by every command. */
export function loadConfig(): HygenConfig {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  const raw = readJson<Record<string, unknown>>(CONFIG_PATH);
  for (const key of Object.keys(raw)) if (key !== "$schema" && key !== "about" && !(key in DEFAULT_CONFIG)) fail(`hygen.config.json: неизвестный раздел «${key}»; есть: ${Object.keys(DEFAULT_CONFIG).join(", ")}`);
  const cfg = merge(DEFAULT_CONFIG, raw);
  if (!Number.isFinite(cfg.voice.defaultBudgetChars) || cfg.voice.defaultBudgetChars < 0) fail("hygen.config.json: voice.defaultBudgetChars — число символов ElevenLabs, с которым начинается новый ролик");
  if (!Number.isFinite(cfg.bitrate.crf)) fail("hygen.config.json: bitrate.crf — число");
  return cfg;
}

export const projectsDir = (): string => resolve(ROOT_DIR, loadConfig().paths.projects);
export const libraryDir = (): string => resolve(ROOT_DIR, loadConfig().paths.library);
export const musicDir = (): string => join(libraryDir(), "music");

/** Every project folder (projects/<id>/project.json), proof projects included, sorted by name. */
export function projectDirs(): string[] {
  const root = projectsDir();
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .sort()
    .map((n) => join(root, n))
    .filter((d) => statSync(d).isDirectory() && existsSync(join(d, "project.json")));
}

/** projects/<id> by id or by a path given on the command line. */
export function projectPath(arg: string): string {
  const direct = resolve(arg);
  if (existsSync(join(direct, "project.json"))) return direct;
  const byId = join(projectsDir(), basename(arg));
  if (existsSync(join(byId, "project.json"))) return byId;
  return direct;
}

// ── media ledger ─────────────────────────────────────────────────────────────────────────────────────

/** One licensed file: projects/<id>/media.json, library/music/music.json or library/assets/media.json → key → record. */
export interface MediaRecord {
  role?: string | null;
  title?: string;
  source: string;
  author: string;
  license: string;
  url: string;
  added?: string;
  notes?: string;
  crop?: unknown;
  trim?: { in: number; out: number };
  [key: string]: unknown;
}

export const LICENSE_FIELDS = ["source", "author", "license", "url"] as const;
/** Licenses the channel may use (CLAUDE.md «Медиа»); the panel offers them as a list. */
export const LICENSES = ["Public domain", "CC0", "CC BY 2.0", "CC BY 3.0", "CC BY 4.0", "CC BY-SA 2.0", "CC BY-SA 3.0", "CC BY-SA 4.0", "Pexels License", "Pixabay License", "NASA (public domain)"];
export const ROLES = ["hero", "evidence", "place"];

const posix = (p: string): string => p.split(sep).join("/");

/** The ledger a file belongs to and its key there; null — the file is outside any ledger. */
export function ledgerOf(file: string): { path: string; key: string } | null {
  const abs = resolve(file);
  const music = musicDir();
  if (abs.startsWith(music + sep)) return { path: join(music, "music.json"), key: posix(relative(music, abs)) };
  const assets = join(LIBRARY_DIR, "assets");
  if (abs.startsWith(assets + sep)) return { path: join(assets, "media.json"), key: posix(relative(assets, abs)) };
  // projects/<id>/… is a project even before project.json exists (the director downloads media first, from brief.json)
  const projects = projectsDir();
  for (let dir = dirname(abs); dir.startsWith(ROOT_DIR) && dir !== ROOT_DIR; dir = dirname(dir)) {
    if (existsSync(join(dir, "project.json")) || dirname(dir) === projects) {
      const media = join(dir, "media");
      return { path: join(dir, "media.json"), key: posix(abs.startsWith(media + sep) ? relative(media, abs) : relative(dir, abs)) };
    }
  }
  return null;
}

export function readLedger(path: string): Record<string, MediaRecord> {
  return existsSync(path) ? readJson<Record<string, MediaRecord>>(path) : {};
}

/** Keys sorted: diffs of media.json stay small when the panel adds a file. */
export function writeLedger(path: string, ledger: Record<string, MediaRecord>): void {
  writeJson(path, Object.fromEntries(Object.entries(ledger).sort(([a], [b]) => a.localeCompare(b))));
}

export function mediaRecord(file: string): MediaRecord | null {
  const at = ledgerOf(file);
  return at ? (readLedger(at.path)[at.key] ?? null) : null;
}

/** Missing license fields of a record ([] — complete). */
export function missingLicense(rec: MediaRecord | null | undefined): string[] {
  if (!rec) return [...LICENSE_FIELDS];
  return LICENSE_FIELDS.filter((k) => typeof rec[k] !== "string" || !(rec[k] as string).trim());
}

export function setMediaRecord(file: string, rec: MediaRecord): string {
  const at = ledgerOf(file);
  if (!at) fail(`${file}: файл не лежит ни в проекте, ни в library/music, ни в library/assets — записи о лицензии негде жить`);
  const ledger = readLedger(at.path);
  ledger[at.key] = rec;
  writeLedger(at.path, ledger);
  return at.path;
}

const ASSET_RE = /\.(jpe?g|png|webp|gif|svg|mp4|webm|mov|ogv|wav|mp3|flac|ogg)$/i;

/**
 * projects/<id>: every file in media/ has a complete record in media.json; a record without a file, a json inside
 * media/ and a music track missing from library/music/music.json are errors (verify → media, build refuses).
 */
export function checkProjectMedia(projectDir: string): { errors: string[]; files: number } {
  const errors: string[] = [];
  const mediaDir = join(projectDir, "media");
  const ledger = readLedger(join(projectDir, "media.json"));
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(posix(relative(mediaDir, p)));
    }
  };
  walk(mediaDir);
  for (const f of files) {
    if (f.endsWith(".json")) errors.push(`media/${f}: json внутри media/ — записи живут в media.json`);
    else if (!ASSET_RE.test(f)) errors.push(`media/${f}: не медиафайл`);
    else if (!ledger[f]) errors.push(`media/${f}: нет записи в media.json`);
    else {
      const miss = missingLicense(ledger[f]);
      if (miss.length) errors.push(`media/${f}: в media.json не заполнено ${miss.join(", ")}`);
    }
  }
  for (const key of Object.keys(ledger)) if (!files.includes(key)) errors.push(`media.json: запись «${key}» без файла в media/`);
  const spec = readJson<{ music?: false | { track?: string } }>(join(projectDir, "project.json"));
  if (spec.music && spec.music.track && !/[/.]/.test(spec.music.track)) {
    const music = readLedger(join(musicDir(), "music.json"));
    const track = spec.music.track;
    const key = Object.keys(music).find((k) => k.replace(/\.[^.]+$/, "") === track);
    if (!key) errors.push(`music.track «${spec.music.track}»: нет в library/music/music.json`);
    else if (!existsSync(join(musicDir(), key))) errors.push(`music.track «${spec.music.track}»: нет файла library/music/${key}`);
  }
  return { errors, files: files.length };
}

/** Local time as 2026-09-15_1304-05: the name of a history snapshot (sorts by time). */
export function localStamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** What a build reads out of the project folder: change any of it and the next build is a different build. */
export interface ProjectInput {
  project: string;
  media: string;
  /** sha of every file in media/ by name — a replaced picture is a new input even under the same name. */
  files: string;
  /** takes in voice/ — a fresh ElevenLabs take changes the video without touching project.json. */
  voice: string;
  engine: string;
}

const hash = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 16);

function walkFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walkFiles(p, base) : [`${posix(relative(base, p))}:${createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16)}`];
  });
}

export function projectInput(projectDir: string): ProjectInput {
  const read = (f: string): string => (existsSync(join(projectDir, f)) ? readFileSync(join(projectDir, f), "utf8") : "");
  const voiceDir = join(projectDir, "voice");
  const takes = existsSync(voiceDir) ? readdirSync(voiceDir).filter((n) => statSync(join(voiceDir, n)).isDirectory()).sort() : [];
  return {
    project: hash(read("project.json")),
    media: hash(read("media.json")),
    files: hash(walkFiles(join(projectDir, "media")).join("\n")),
    voice: hash(takes.join("\n")),
    engine: engineCommit(),
  };
}

const INPUT_NAMES: Record<keyof ProjectInput, string> = {
  project: "изменился project.json",
  media: "изменился media.json",
  files: "изменились файлы media/",
  voice: "изменились дубли voice/",
  engine: "движок",
};

/** What changed since the snapshot `was` — the human reason of the «История» tab. */
export function inputReason(was: Partial<ProjectInput> | null, now: ProjectInput): string {
  if (!was || !was.project) return "первый снимок";
  const parts: string[] = [];
  for (const key of ["project", "media", "files", "voice"] as const) {
    if (was[key] !== undefined && was[key] !== now[key]) parts.push(INPUT_NAMES[key]);
  }
  // the engine counts only against a snapshot that recorded it: old snapshots must not make every build a new one
  if (was.engine && now.engine && was.engine !== now.engine) parts.push(`движок ${was.engine} → ${now.engine}`);
  return parts.join(", ");
}

/**
 * history/<date>/: project.json and media.json before a rebuild or a rollback — only when the input of the build
 * really changed (project.json, media.json, files of media/, takes of voice/ or the commit of the engine), so ten
 * rebuilds of an unchanged project leave one snapshot and a clean git tree. Returns the new folder or null.
 */
export function snapshotHistory(projectDir: string, reason: string): string | null {
  const files = ["project.json", "media.json"].filter((f) => existsSync(join(projectDir, f)));
  const input = projectInput(projectDir);
  const digest = createHash("sha256").update([input.project, input.media, input.files, input.voice].join("\0")).digest("hex").slice(0, 16);
  const hist = join(projectDir, "history");
  const last = existsSync(hist) ? readdirSync(hist).filter((n) => existsSync(join(hist, n, "snapshot.json"))).sort().pop() : undefined;
  const was = last ? readJson<{ digest?: string; input?: Partial<ProjectInput>; engine?: string }>(join(hist, last, "snapshot.json")) : null;
  const wasInput: Partial<ProjectInput> | null = was ? (was.input ?? (was.digest ? { project: was.digest } : null)) : null;
  // a snapshot written before S2 knows only its own digest of project.json + media.json: same digest — same input
  if (was && !was.input && was.digest === createHash("sha256").update(files.map((f) => readFileSync(join(projectDir, f), "utf8")).join("\0")).digest("hex").slice(0, 16)) return null;
  if (was?.input && was.input.project === input.project && was.input.media === input.media && was.input.files === input.files && was.input.voice === input.voice && (!was.input.engine || was.input.engine === input.engine)) return null;
  const dir = join(hist, localStamp());
  mkdirSync(dir, { recursive: true });
  for (const f of files) copyFileSync(join(projectDir, f), join(dir, f));
  const why = inputReason(wasInput, input);
  writeJson(join(dir, "snapshot.json"), { at: new Date().toISOString(), reason, why, digest, input, engine: input.engine });
  return dir;
}

// ── library/index.json: the fingerprint of every video, so the next one is not a twin ────────────────

export interface LibraryEntry {
  arc: string;
  stages: string[];
  look: string;
  captions: string;
  devices: string[];
  at: string;
}

const beatStage = (b: Record<string, any>): string => (typeof b.scene === "string" ? `scene:${b.scene}` : String(b.stage?.type ?? b.intent ?? "?"));

/** id, arc, sequence of stages, look, caption preset, first three devices — everything the director compares against. */
export function projectFingerprint(spec: Record<string, any>): Omit<LibraryEntry, "at"> {
  const arc = spec.arc ?? {};
  const devices: string[] = [];
  for (const b of spec.beats ?? []) for (const d of b.devices ?? []) if (devices.length < 3) devices.push(String(d.type));
  const captions = typeof spec.captions === "string" ? spec.captions : String(spec.captions?.preset ?? spec.captions?.family ?? "из look");
  return {
    arc: ["structure", "hook", "protagonist", "ending"].map((k) => arc[k] ?? "?").join(" × "),
    stages: (spec.beats ?? []).map(beatStage),
    look: typeof spec.look === "string" ? spec.look : String(spec.look?.id ?? spec.look?.extends ?? "ember"),
    captions,
    devices,
    at: "",
  } as LibraryEntry;
}

export const LIBRARY_INDEX = join(LIBRARY_DIR, "index.json");

const readIndex = (): Record<string, LibraryEntry> => (existsSync(LIBRARY_INDEX) ? readJson<Record<string, LibraryEntry>>(LIBRARY_INDEX) : {});
const writeIndex = (index: Record<string, LibraryEntry>): boolean =>
  writeJsonIfChanged(LIBRARY_INDEX, Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b))));

/** Today as 2026-09-15 — the date a fingerprint changed, not the date of the build. */
const day = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** After a build: the row of a video is rewritten only when its fingerprint changed, proof videos are not indexed. */
export function updateLibraryIndex(projectDir: string): boolean {
  const spec = readJson<Record<string, any>>(join(projectDir, "project.json"));
  const id = basename(projectDir);
  const index = readIndex();
  if (spec.proof) {
    if (!(id in index)) return false;
    delete index[id];
    return writeIndex(index);
  }
  const next = projectFingerprint(spec);
  const was = index[id];
  const same = was && JSON.stringify({ ...was, at: "" }) === JSON.stringify({ ...next, at: "" });
  if (same) return false;
  index[id] = { ...next, at: day() } as LibraryEntry;
  return writeIndex(index);
}

export function dropFromLibraryIndex(id: string): boolean {
  const index = readIndex();
  if (!(id in index)) return false;
  delete index[id];
  return writeIndex(index);
}

/** library/music/<track>.<ext> of a track id (the first file whose stem is the id). */
export function musicFile(track: string): string | null {
  const dir = musicDir();
  const key = Object.keys(readLedger(join(dir, "music.json"))).find((k) => k.replace(/\.[^.]+$/, "") === track);
  if (key && existsSync(join(dir, key))) return join(dir, key);
  const wav = join(dir, `${track}.wav`);
  return existsSync(wav) ? wav : null;
}
