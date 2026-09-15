import { existsSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { ledgerOf, mediaRecord } from "./lib/project.ts";
import type { BeatSpec, VideoSpec } from "./spec.ts";
import { isHtmlScene, parseBeatText } from "./spec.ts";
import { LIBRARY_DIR, ROOT_DIR, ensureDir, fail, pyScript, python, readJson, run, writeIfChanged } from "./lib/util.ts";

/** project.json → `publish`: what the director writes for the upload; the engine adds sources, credits, SRT and the cover. */
export interface PublishSpec {
  titles?: string[];
  description?: string;
  tags?: string[];
}

export interface PublishResult {
  dir: string;
  files: string[];
  sources: string[];
  credits: string[];
  thumbnailAt: { beat: string; t: number };
}

interface TimedWord {
  text: string;
  start: number;
  end: number;
}

interface PlanScene {
  id: string;
  start: number;
  end: number;
  settle: number;
}

const MEDIA_RE = /\.(jpe?g|png|webp|gif|svg|mp4|webm|mov|ogv|wav|mp3|flac|ogg)$/i;
const TITLE_MAX = 100;

/** Every http(s) link of the video's own data: beat sources, device, stage and data sources. */
export function collectSources(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) out.add(value);
  } else if (Array.isArray(value)) value.forEach((v) => collectSources(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectSources(v, out));
  return out;
}

/** Licensed files the video shows or plays: media paths in beats (expanded), map silhouettes, image defaults of HTML scenes, music. */
export function collectMedia(videoDir: string, spec: VideoSpec, beats: BeatSpec[]): string[] {
  const files = new Set<string>();
  const add = (value: string): void => {
    const abs = [join(videoDir, value), join(ROOT_DIR, value), join(LIBRARY_DIR, value)].find((p) => existsSync(p));
    if (abs) files.add(abs);
  };
  const walk = (value: unknown, key?: string): void => {
    if (typeof value === "string") {
      if (MEDIA_RE.test(value)) add(value);
      else if (key === "map" && existsSync(join(LIBRARY_DIR, "assets", "maps", `${value}.svg`))) files.add(join(LIBRARY_DIR, "assets", "maps", `${value}.svg`));
    } else if (Array.isArray(value)) value.forEach((v) => walk(v, key));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  for (const beat of beats) {
    walk(beat);
    if (beat.scene && isHtmlScene(beat.scene)) {
      const scene = readJson<{ params: Record<string, { default?: unknown }> }>(join(LIBRARY_DIR, "scenes", beat.scene, "scene.json"));
      for (const [name, def] of Object.entries(scene.params)) if (beat.params?.[name] === undefined) walk(def.default, name);
    }
  }
  walk((spec as unknown as { music?: unknown }).music);
  const music = join(videoDir, "build", "music.json");
  if (existsSync(music)) add(readJson<{ file: string }>(music).file);
  return [...files].filter((f) => mediaRecord(f) !== null).sort();
}

/** A credit line is built from media.json alone: title, author, license, link — never from the path of the file. */
function credit(file: string): { line: string; url: string } {
  const lic = mediaRecord(file) as unknown as Record<string, string>;
  const title = (lic.title ?? "").trim() || (ledgerOf(file)?.key ?? basename(file)).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  return { line: `- ${title} — ${lic.author}, ${lic.license}. ${lic.url}`, url: lic.url ?? "" };
}

const display = (text: string): string => parseBeatText(text).tokens.map((t) => t.display).join(" ");

function clip(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[\s,;:—-]+$/, "")}…`;
}

const srtTime = (t: number): string => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

/** Phrases of 3–5 words: a group closes at a sentence end, at a comma once it has 3, or at 5 — at 6 when the sixth ends the sentence. */
export function srtPhrases(words: TimedWord[]): string {
  const groups: TimedWord[][] = [];
  let cur: TimedWord[] = [];
  const ends = (w: TimedWord | undefined): boolean => !!w && /[.!?…]["»”]?$/.test(w.text);
  for (const [i, w] of words.entries()) {
    cur.push(w);
    const sentence = ends(w);
    const pause = /[,;:—]$/.test(w.text);
    if (sentence || (pause && cur.length >= 3) || (cur.length >= 5 && !(cur.length === 5 && ends(words[i + 1])))) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) {
    const last = groups[groups.length - 1];
    if (last && cur.length < 3 && last.length + cur.length <= 6 && !/[.!?…]["»”]?$/.test((last[last.length - 1] as TimedWord).text)) last.push(...cur);
    else groups.push(cur);
  }
  return groups
    .map((g, i) => {
      const next = groups[i + 1]?.[0];
      const end = Math.min((g[g.length - 1] as TimedWord).end + 0.15, next ? next.start : Number.POSITIVE_INFINITY);
      return `${i + 1}\n${srtTime((g[0] as TimedWord).start)} --> ${srtTime(end)}\n${g.map((w) => w.text).join(" ")}\n`;
    })
    .join("\n");
}

/** Word timings of the whole video from the build: clip-time tokens (build/audio_meta.json) + clip starts (audio_timeline.json). */
function videoWords(buildDir: string): TimedWord[] {
  const meta = readJson<{ voices: { words: TimedWord[] }[] }>(join(buildDir, "audio_meta.json"));
  const starts = readJson<{ frame_starts_s: number[] }>(join(buildDir, "audio_timeline.json")).frame_starts_s;
  return meta.voices.flatMap((v, i) => v.words.map((w) => ({ text: w.text, start: (starts[i] ?? 0) + w.start, end: (starts[i] ?? 0) + w.end })));
}

/** projects/<id>/renders/publish/: title.txt (3 variants), description.md (+ Sources and media credits), tags.txt, subtitles.srt, thumbnail.jpg. */
export function writePublish(videoDir: string, spec: VideoSpec, mp4?: string): PublishResult {
  const buildDir = join(videoDir, "build");
  for (const f of ["audio_meta.json", "audio_timeline.json", "verify_plan.json", "beats.expanded.json"]) {
    if (!existsSync(join(buildDir, f))) fail(`publish: нет build/${f} — сначала hygen build`);
  }
  const video = mp4 ?? join(videoDir, "renders", `${spec.id}.mp4`);
  if (!existsSync(video)) fail(`publish: нет ${relative(ROOT_DIR, video)} — обложка берётся из MP4`);
  const pub = ((spec as unknown as { publish?: PublishSpec }).publish ?? {}) as PublishSpec;
  const beats = readJson<{ beats: BeatSpec[] }>(join(buildDir, "beats.expanded.json")).beats;
  const dir = ensureDir(join(videoDir, "renders", "publish"));

  const hook = display(spec.beats[0]?.text ?? spec.title);
  const titles = (pub.titles?.length ? pub.titles : [spec.title, hook, `${spec.title.split(":")[0]?.trim()} — ${display(spec.beats[spec.beats.length - 1]?.text ?? "")}`])
    .map((t) => clip(t, TITLE_MAX))
    .slice(0, 3);
  writeIfChanged(join(dir, "title.txt"), titles.join("\n") + "\n");

  const sources = [...collectSources(spec.beats), ...collectSources(beats)].filter((v, i, a) => a.indexOf(v) === i);
  const credits = collectMedia(videoDir, spec, beats).map(credit);
  const about = pub.description?.trim() || spec.beats.slice(0, 2).map((b) => display(b.text)).join(" ");
  writeIfChanged(
    join(dir, "description.md"),
    [about, "", "Sources:", ...sources.map((s) => `- ${s}`), "", "Media:", ...(credits.length ? credits.map((c) => c.line) : ["- no third-party media"]), ""].join("\n"),
  );

  // without publish.tags: words of the title first, then general ones up to at least 10
  const fallbackTags = [...spec.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3), "history", "shorts", "documentary", "explained", "history facts", "archive", "education", "true story", "on this day", "history shorts"];
  const tags = (pub.tags?.length ? pub.tags : fallbackTags).map((t) => t.trim()).filter((t, i, a) => t && a.indexOf(t) === i).slice(0, 15);
  writeIfChanged(join(dir, "tags.txt"), tags.join(", ") + "\n");

  writeIfChanged(join(dir, "subtitles.srt"), srtPhrases(videoWords(buildDir)));

  // cover: the settle frame of the densest beat (its dominant device has landed); ties go to the earliest
  const plan = readJson<{ scenes: PlanScene[] }>(join(buildDir, "verify_plan.json")).scenes;
  const density = (b: BeatSpec): number => (b.scene && isHtmlScene(b.scene) ? 2 : 1 + (b.devices?.length ?? 0));
  let pick = 0;
  beats.forEach((b, i) => {
    if (density(b) > density(beats[pick] as BeatSpec)) pick = i;
  });
  const at = plan[pick] as PlanScene;
  // обложка без даты и метаданных времени; кадр, показывающий то же самое, оставляет файл, который уже на диске
  const thumb = join(dir, "thumbnail.jpg");
  const part = `${thumb}.part.jpg`;
  run("ffmpeg", ["-v", "error", "-y", "-ss", at.settle.toFixed(3), "-i", video, "-frames:v", "1", "-q:v", "2", "-map_metadata", "-1", "-fflags", "+bitexact", part]);
  const same = existsSync(thumb) && run(python(), [pyScript("same_picture.py"), thumb, part], { allowFail: true }).status === 0;
  if (!same) renameSync(part, thumb);
  rmSync(part, { force: true });

  return { dir, files: ["title.txt", "description.md", "tags.txt", "subtitles.srt", "thumbnail.jpg"], sources, credits: credits.map((c) => c.line), thumbnailAt: { beat: at.id, t: at.settle } };
}

/** verify: publish/ is complete — 3 titles ≤ 100, 10–15 tags, every source and media credit in the description, SRT and a cover. */
export function checkPublish(videoDir: string, spec: VideoSpec): { ok: boolean; detail: string } {
  const dir = join(videoDir, "renders", "publish");
  const problems: string[] = [];
  const read = (f: string): string => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
  for (const f of ["title.txt", "description.md", "tags.txt", "subtitles.srt", "thumbnail.jpg"]) if (!existsSync(join(dir, f))) problems.push(`нет ${f}`);
  const titles = read("title.txt").split("\n").filter((l) => l.trim());
  if (titles.length !== 3) problems.push(`названий ${titles.length}, нужно 3`);
  for (const t of titles) if (t.length > TITLE_MAX) problems.push(`название длиннее ${TITLE_MAX}: «${t.slice(0, 40)}…»`);
  const tags = read("tags.txt").split(",").map((t) => t.trim()).filter(Boolean);
  if (tags.length < 10 || tags.length > 15) problems.push(`тегов ${tags.length}, нужно 10–15`);
  const description = read("description.md");
  const buildDir = join(videoDir, "build");
  const beats = existsSync(join(buildDir, "beats.expanded.json")) ? readJson<{ beats: BeatSpec[] }>(join(buildDir, "beats.expanded.json")).beats : spec.beats;
  const sources = [...new Set([...collectSources(spec.beats), ...collectSources(beats)])];
  const missingSources = sources.filter((s) => !description.includes(s));
  if (missingSources.length) problems.push(`в описании нет источников: ${missingSources.join(", ")}`);
  const media = collectMedia(videoDir, spec, beats);
  const missingCredits = media.filter((f) => !description.includes(credit(f).url));
  if (missingCredits.length) problems.push(`в описании нет кредитов: ${missingCredits.map((f) => relative(ROOT_DIR, f)).join(", ")}`);
  const cues = (read("subtitles.srt").match(/-->/g) ?? []).length;
  if (!cues) problems.push("SRT пустой");
  if (existsSync(join(dir, "thumbnail.jpg")) && statSync(join(dir, "thumbnail.jpg")).size < 20_000) problems.push("обложка меньше 20 КБ");
  return {
    ok: problems.length === 0,
    detail: problems.length ? problems.join("; ") : `3 названия, тегов ${tags.length}, источников ${sources.length}, кредитов ${media.length}, фраз SRT ${cues}, обложка`,
  };
}
