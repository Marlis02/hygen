import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { ENGINE_DIR, ROOT_DIR, fail, readJson, writeJson } from "./util.ts";

// Project storage (ROADMAP S1): hygen.config.json in the root (no secrets), projects/<id>/ with project.json and
// media.json next to it, media/ with asset files only, voice/, renders/ (mp4, sheets, publish/), history/;
// library/music/ with music.json and beats/. Every licensed file has one record in the ledger of its folder.

export interface HygenConfig {
  voice: { provider: "kokoro" | "elevenlabs"; voiceId: string; model: string; kokoroVoice: string };
  look: string;
  budgets: { elevenlabsChars: number | null };
  bitrate: { crf: number; preset: string; maxrate: string; bufsize: string };
  short: { targetSeconds: number; minSeconds: number; maxSeconds: number };
  paths: { projects: string; library: string };
  studio: { port: number };
}

export const CONFIG_PATH = join(ROOT_DIR, "hygen.config.json");

export const DEFAULT_CONFIG: HygenConfig = {
  voice: { provider: "kokoro", voiceId: "", model: "eleven_multilingual_v2", kokoroVoice: "am_michael" },
  look: "ember",
  budgets: { elevenlabsChars: 3000 },
  bitrate: { crf: 18, preset: "slow", maxrate: "16M", bufsize: "32M" },
  short: { targetSeconds: 45, minSeconds: 35, maxSeconds: 59 },
  paths: { projects: "projects", library: "library" },
  studio: { port: 5177 },
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
  if (!["kokoro", "elevenlabs"].includes(cfg.voice.provider)) fail("hygen.config.json: voice.provider — kokoro или elevenlabs");
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

/** One licensed file: projects/<id>/media.json, library/music/music.json or engine/assets/media.json → key → record. */
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
  const assets = join(ENGINE_DIR, "assets");
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
  if (!at) fail(`${file}: файл не лежит ни в проекте, ни в library/music, ни в engine/assets — записи о лицензии негде жить`);
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

/**
 * history/<date>/: project.json and media.json before a rebuild or a rollback — only when they differ from the last
 * snapshot, so ten rebuilds of an unchanged project leave one snapshot. Returns the new folder or null.
 */
export function snapshotHistory(projectDir: string, reason: string): string | null {
  const files = ["project.json", "media.json"].filter((f) => existsSync(join(projectDir, f)));
  const digest = createHash("sha256").update(files.map((f) => readFileSync(join(projectDir, f), "utf8")).join("\0")).digest("hex").slice(0, 16);
  const hist = join(projectDir, "history");
  const last = existsSync(hist) ? readdirSync(hist).filter((n) => existsSync(join(hist, n, "snapshot.json"))).sort().pop() : undefined;
  if (last && readJson<{ digest?: string }>(join(hist, last, "snapshot.json")).digest === digest) return null;
  const dir = join(hist, localStamp());
  mkdirSync(dir, { recursive: true });
  for (const f of files) copyFileSync(join(projectDir, f), join(dir, f));
  writeJson(join(dir, "snapshot.json"), { at: new Date().toISOString(), reason, digest });
  return dir;
}

/** library/music/<track>.<ext> of a track id (the first file whose stem is the id). */
export function musicFile(track: string): string | null {
  const dir = musicDir();
  const key = Object.keys(readLedger(join(dir, "music.json"))).find((k) => k.replace(/\.[^.]+$/, "") === track);
  if (key && existsSync(join(dir, key))) return join(dir, key);
  const wav = join(dir, `${track}.wav`);
  return existsSync(wav) ? wav : null;
}
