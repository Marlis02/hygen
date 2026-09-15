#!/usr/bin/env node
// npm run migrate — videos/ → projects/ (ROADMAP S1). Every video folder (and every proof in videos/_proof) becomes
// projects/<name>/ with project.json (video.json + concept, «what the viewer sees» and status from research.md and the
// renders) and media.json next to it (all license.json of media/, then deleted); publish/ → renders/publish/;
// history/*/video.json → project.json. Music: library/assets/music → library/music with music.json and beats/.
// Map and scene assets: library/assets/**/*.license.json → library/assets/media.json. Non-secret lines of .env →
// hygen.config.json. A second run finds nothing to move.
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { trackBeats } from "./music.ts";
import { CONFIG_PATH, DEFAULT_CONFIG, libraryDir, musicDir, projectsDir, readLedger, writeLedger } from "./lib/project.ts";
import type { HygenConfig, MediaRecord } from "./lib/project.ts";
import { ENGINE_DIR, LIBRARY_DIR, ROOT_DIR, ensureDir, readJson, writeJson } from "./lib/util.ts";

const OLD = join(ROOT_DIR, "videos");
const rel = (p: string): string => relative(ROOT_DIR, p);
const say = (msg: string): void => console.log(`  ${msg}`);

/** Text of a «## title» section of research.md (without the heading), "" when absent. */
function section(md: string, title: string): string {
  const m = new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(md);
  return m ? (m[1] as string).trim() : "";
}

/** research.md «Media» table rows: | `file` | role | … → file → hero | evidence | place. */
function rolesOf(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of md.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(hero|evidence|place)\b/gm)) out[m[1] as string] = m[2] as string;
  return out;
}

/** research.md «Beats»: "- 01-watch (hook): Зритель видит … → media …" → beat id → what the viewer sees. */
function seesOf(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of section(md, "Beats").split("\n")) {
    const m = /^-\s*([0-9a-z][a-z0-9-]*)\s*(?:\([^)]*\))?\s*:\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const text = (m[2] as string).split(/\s+→\s+/)[0]?.trim() ?? "";
    if (text) out[m[1] as string] = text;
  }
  return out;
}

/** Paths inside the video data: videos/_proof/<x>/ and videos/<x>/ → projects/<x>/. */
function rewrite<T>(value: T): T {
  if (typeof value === "string") return value.replace(/\bvideos\/_proof\//g, "projects/").replace(/\bvideos\/(?=[a-z0-9_-]+\/)/g, "projects/") as T;
  if (Array.isArray(value)) return value.map((v) => rewrite(v)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)])) as T;
  return value;
}

function statusOf(dir: string, id: string): string {
  const report = join(dir, "renders", `${id}.verify.json`);
  if (existsSync(report) && readJson<{ ok?: boolean }>(report).ok) return "verified";
  return existsSync(join(dir, "renders", `${id}.mp4`)) ? "built" : "draft";
}

/** video.json → project.json: id, title, status, proof, concept first; beats get «sees» after the text; music volume → gain. */
function toProject(raw: Record<string, unknown>, extra: { status: string; proof: boolean; concept: string; sees: Record<string, string> }): Record<string, unknown> {
  const spec = rewrite(raw);
  const out: Record<string, unknown> = { id: spec.id, title: spec.title, status: extra.status };
  if (extra.proof) out.proof = true;
  if (extra.concept) out.concept = extra.concept;
  for (const [k, v] of Object.entries(spec)) if (!(k in out)) out[k] = v;
  out.beats = (spec.beats as Record<string, unknown>[]).map((beat) => {
    const b: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(beat)) {
      b[k] = v;
      if (k === "text" && extra.sees[beat.id as string] && beat.sees === undefined) b.sees = extra.sees[beat.id as string];
    }
    return b;
  });
  const music = out.music as Record<string, unknown> | false | undefined;
  if (music && typeof music === "object" && music.volume !== undefined && music.gain === undefined) {
    const { volume, ...restMusic } = music;
    out.music = { track: restMusic.track, gain: volume, ...restMusic };
  }
  return out;
}

/** media/*.license.json → media.json (retrieved → added, role from research.md, crop of the first beat that crops the file); the json files are deleted. */
function ledgerFromLicenses(dir: string, roles: Record<string, string>, spec: Record<string, unknown>): number {
  const media = join(dir, "media");
  if (!existsSync(media)) return 0;
  const ledgerPath = join(dir, "media.json");
  const ledger = readLedger(ledgerPath);
  const crops: Record<string, unknown> = {};
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.src === "string" && o.crop !== undefined) {
        const name = basename(o.src);
        if (crops[name] === undefined) crops[name] = o.crop;
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(spec.beats);
  let n = 0;
  for (const name of readdirSync(media).sort()) {
    if (!name.endsWith(".license.json")) continue;
    const lic = readJson<Record<string, string>>(join(media, name));
    const stem = name.slice(0, -".license.json".length);
    const file = readdirSync(media).find((f) => !f.endsWith(".json") && f.slice(0, f.length - extname(f).length) === stem);
    if (!file) {
      say(`⚠ ${rel(join(media, name))}: нет файла ${stem}.* — запись пропущена`);
      rmSync(join(media, name));
      continue;
    }
    const { retrieved, notes, title, source, author, license, url, ...rest } = lic;
    const rec: MediaRecord = { role: roles[file] ?? null, title, source: source ?? "", author: author ?? "", license: license ?? "", url: url ?? "", added: retrieved, notes, ...rest };
    if (crops[file] !== undefined) rec.crop = crops[file];
    ledger[file] = rec;
    rmSync(join(media, name));
    n++;
  }
  writeLedger(ledgerPath, ledger);
  return n;
}

function migrateProject(src: string, proof: boolean): void {
  const name = basename(src);
  const dst = join(projectsDir(), name);
  if (existsSync(dst)) return say(`⚠ ${rel(dst)} уже есть — ${rel(src)} не тронут`);
  const raw = readJson<Record<string, unknown>>(join(src, "video.json"));
  ensureDir(projectsDir());
  renameSync(src, dst);
  const research = join(dst, "research.md");
  const md = existsSync(research) ? readFileSync(research, "utf8") : "";
  const project = toProject(raw, { status: statusOf(dst, raw.id as string), proof, concept: section(md, "Concept"), sees: seesOf(md) });
  writeJson(join(dst, "project.json"), project);
  rmSync(join(dst, "video.json"));
  const licenses = ledgerFromLicenses(dst, rolesOf(md), project);
  if (!existsSync(join(dst, "media.json"))) writeLedger(join(dst, "media.json"), {});
  if (existsSync(join(dst, "publish"))) {
    ensureDir(join(dst, "renders"));
    rmSync(join(dst, "renders", "publish"), { recursive: true, force: true });
    renameSync(join(dst, "publish"), join(dst, "renders", "publish"));
  }
  let hist = 0;
  if (existsSync(join(dst, "history"))) {
    for (const h of readdirSync(join(dst, "history"))) {
      const old = join(dst, "history", h, "video.json");
      if (!existsSync(old)) continue;
      writeJson(join(dst, "history", h, "project.json"), rewrite(readJson(old)));
      rmSync(old);
      hist++;
    }
  }
  if (md) writeFileSync(research, md.replace(/\bvideos\/_proof\//g, "projects/").replace(/\bvideos\//g, "projects/").replace(/`?license\.json`?/g, "`media.json`").replace(/\bvideo\.json\b/g, "project.json"));
  say(`✓ ${rel(src)} → ${rel(dst)} · project.json (${project.status}${proof ? ", proof" : ""}, «видит зритель» у ${(project.beats as { sees?: string }[]).filter((b) => b.sees).length} битов) · media.json ${licenses} записей${hist ? ` · history ${hist}` : ""}`);
}

const MUSIC_META: Record<string, { mood: string; looks: string[] }> = {
  "documentary-dark-01": { mood: "dark, low drone, slow", looks: ["ember", "abyss", "storm"] },
  "test-beat-100": { mood: "test beat, clear 4/4 pulse", looks: ["bright-explainer"] },
};

function migrateMusic(): void {
  const old = join(ENGINE_DIR, "assets", "music");
  if (!existsSync(old)) return;
  const dir = ensureDir(musicDir());
  const ledgerPath = join(dir, "music.json");
  const ledger = readLedger(ledgerPath);
  for (const name of readdirSync(old).sort()) {
    if (!/\.(wav|mp3|flac|ogg)$/i.test(name)) continue;
    const stem = name.slice(0, name.length - extname(name).length);
    renameSync(join(old, name), join(dir, name));
    const licPath = join(old, `${stem}.license.json`);
    const lic = existsSync(licPath) ? readJson<Record<string, string>>(licPath) : ({} as Record<string, string>);
    const { retrieved, notes, title, source, author, license, url, ...rest } = lic;
    const grid = trackBeats(join(dir, name));
    ledger[name] = { title, source: source ?? "", author: author ?? "", license: license ?? "", url: url ?? "", added: retrieved, notes, bpm: grid.bpm, mood: MUSIC_META[stem]?.mood ?? "", looks: MUSIC_META[stem]?.looks ?? [], ...rest };
    rmSync(licPath, { force: true });
    say(`✓ музыка ${name} → ${rel(join(dir, name))} · ${grid.bpm} BPM · beats/${stem}.beats.json`);
  }
  if (existsSync(join(old, "MUSIC.md"))) {
    const md = readFileSync(join(old, "MUSIC.md"), "utf8").replace(/engine\/assets\/music\//g, "library/music/").replace(/`?<[^>]*>\.license\.json`?|`?[a-z0-9-]+\.license\.json`?/g, "`music.json`").replace(/\bvideos\//g, "projects/");
    writeFileSync(join(dir, "MUSIC.md"), md);
    rmSync(join(old, "MUSIC.md"));
  }
  writeLedger(ledgerPath, ledger);
  if (!readdirSync(old).length) rmdirSync(old);
}

/** library/assets/**\/<file>.license.json → library/assets/media.json (key — path from library/assets). */
function migrateEngineAssets(): void {
  const assets = join(LIBRARY_DIR, "assets");
  const ledgerPath = join(assets, "media.json");
  const ledger = readLedger(ledgerPath);
  let n = 0;
  for (const sub of ["maps", "media"]) {
    const dir = join(assets, sub);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".license.json")) continue;
      const stem = name.slice(0, -".license.json".length);
      const file = readdirSync(dir).find((f) => !f.endsWith(".json") && f.slice(0, f.length - extname(f).length) === stem);
      const lic = readJson<Record<string, string>>(join(dir, name));
      const { retrieved, notes, title, source, author, license, url, ...rest } = lic;
      if (file) ledger[`${sub}/${file}`] = { title, source: source ?? "", author: author ?? "", license: license ?? "", url: url ?? "", added: retrieved, notes, ...rest };
      rmSync(join(dir, name));
      n++;
    }
  }
  if (n) {
    writeLedger(ledgerPath, ledger);
    say(`✓ library/assets: ${n} license.json → library/assets/media.json`);
  }
}

/** Non-secret lines of .env → hygen.config.json; values are never printed. */
function migrateEnv(): void {
  const envPath = join(ROOT_DIR, ".env");
  const cfg: HygenConfig = existsSync(CONFIG_PATH) ? readJson<HygenConfig>(CONFIG_PATH) : structuredClone(DEFAULT_CONFIG);
  const moved: string[] = [];
  if (existsSync(envPath)) {
    const keep: string[] = [];
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      const value = m ? (m[2] as string).replace(/^(["'])(.*)\1$/, "$2") : "";
      const key = m?.[1];
      if (key === "VOICE_PROVIDER" && (value === "kokoro" || value === "elevenlabs")) cfg.voice.provider = value;
      else if (key === "ELEVENLABS_VOICE_ID") cfg.voice.voiceId = value;
      else if (key === "ELEVENLABS_MODEL") cfg.voice.model = value || cfg.voice.model;
      else if (key === "ELEVENLABS_BUDGET_CHARS") cfg.budgets.elevenlabsChars = value ? Number(value) : null;
      else if (key === "ELEVENLABS_LIVE") cfg.voice.provider = value === "1" ? "elevenlabs" : cfg.voice.provider;
      else {
        keep.push(line);
        continue;
      }
      moved.push(key as string);
    }
    if (moved.length) writeFileSync(envPath, keep.join("\n").replace(/\n*$/, "\n"));
  }
  if (moved.length || !existsSync(CONFIG_PATH)) {
    writeJson(CONFIG_PATH, cfg);
    say(`✓ hygen.config.json${moved.length ? ` ← из .env: ${moved.join(", ")} (в .env остались только ключи)` : " — умолчания"}`);
  }
}

function moveLoose(): void {
  const voices = join(OLD, "_proof", "voices");
  if (existsSync(voices)) {
    const dst = join(libraryDir(), "voices");
    if (!existsSync(dst)) {
      ensureDir(libraryDir());
      renameSync(voices, dst);
      const readme = join(dst, "README.md");
      if (existsSync(readme)) writeFileSync(readme, readFileSync(readme, "utf8").replace(/videos\/_proof\/voices/g, "library/voices").replace(/`\.env` \(`ELEVENLABS_VOICE_ID=…`\)/g, "`hygen.config.json` (`voice.voiceId`)"));
      say(`✓ ${rel(voices)} → ${rel(dst)}`);
    }
  }
  const compare = join(OLD, "_compare");
  if (existsSync(compare)) {
    const dst = join(ROOT_DIR, "sessions", "compare-d3.5");
    if (!existsSync(dst)) {
      renameSync(compare, dst);
      say(`✓ ${rel(compare)} → ${rel(dst)}`);
    }
  }
}

function main(): number {
  console.log("hygen migrate — videos/ → projects/\n");
  migrateEnv();
  migrateMusic();
  migrateEngineAssets();
  if (existsSync(OLD)) {
    for (const name of readdirSync(OLD).sort()) {
      const dir = join(OLD, name);
      if (name !== "_proof" && statSync(dir).isDirectory() && existsSync(join(dir, "video.json"))) migrateProject(dir, false);
    }
    const proofs = join(OLD, "_proof");
    if (existsSync(proofs)) for (const name of readdirSync(proofs).sort()) if (existsSync(join(proofs, name, "video.json"))) migrateProject(join(proofs, name), true);
    moveLoose();
    for (const d of [join(OLD, "_proof"), OLD]) if (existsSync(d) && !readdirSync(d).length) rmdirSync(d);
    if (existsSync(OLD)) say(`⚠ в videos/ осталось: ${readdirSync(OLD).join(", ")}`);
  }
  const left = [projectsDir(), musicDir(), join(LIBRARY_DIR, "assets")].flatMap(function find(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? (n === "build" || n === ".cache" ? [] : find(p)) : n.endsWith(".license.json") || (basename(dir) === "media" && n.endsWith(".json")) ? [rel(p)] : [];
    });
  });
  console.log(left.length ? `\n⚠ остались json рядом с медиа: ${left.join(", ")}` : "\n✓ ни одного license.json и json внутри media/");
  return left.length ? 1 : 0;
}

process.exit(main());
