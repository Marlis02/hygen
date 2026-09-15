import { copyFileSync, existsSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { musicDir, musicFile } from "./lib/project.ts";
import type { StyleDef } from "./contract.ts";
import { checkLicense } from "./contract.ts";
import type { VideoSpec } from "./spec.ts";
import type { BeatTiming } from "./timeline.ts";
import { resolveTime } from "./timeline.ts";
import type { VoiceLine } from "./voice.ts";
import type { BeatWords } from "./words.ts";
import { ROOT_DIR, ensureDir, fail, fileSha, lastJsonLine, log, pyScript, python, r3, readJson, run, sha, writeJson } from "./lib/util.ts";

export interface TrackBeats {
  bpm: number;
  beats: number[];
  downbeats: number[];
  duration: number;
}

// a library track: library/music/beats/<track>.beats.json, counted once when the track is added (the sha of the file guards it)
const libraryGridPath = (file: string): string | null => {
  const lib = musicDir();
  return resolve(file).startsWith(lib + sep) ? join(lib, "beats", `${basename(file).replace(/\.[^.]+$/, "")}.beats.json`) : null;
};

const cacheGridPath = (file: string): string => join(ROOT_DIR, ".cache", "beats", `${sha({ v: 1, file: fileSha(file) })}.json`);

/** Beat grid of a track (py/beats.py), once per track: .cache/beats/<sha of the file>.json. */
export function trackBeats(file: string): TrackBeats {
  const grid = libraryGridPath(file);
  if (grid) {
    const hash = fileSha(file);
    if (!existsSync(grid) || readJson<{ sha?: string }>(grid).sha !== hash) {
      const r = lastJsonLine<{ bpm: number; beats: number }>(run(python(), [pyScript("beats.py"), file, "--out", grid]).stdout);
      writeJson(grid, { sha: hash, ...readJson<Record<string, unknown>>(grid) });
      log.info(`ритм ${relative(ROOT_DIR, file)}: ${r.bpm} BPM, битов ${r.beats} → ${relative(ROOT_DIR, grid)}`);
    }
    return readJson(grid);
  }
  const cache = cacheGridPath(file);
  if (!existsSync(cache)) {
    const r = lastJsonLine<{ bpm: number; beats: number }>(run(python(), [pyScript("beats.py"), file, "--out", cache]).stdout);
    log.info(`ритм ${relative(ROOT_DIR, file)}: ${r.bpm} BPM, битов ${r.beats} → .cache/beats`);
  }
  return readJson(cache);
}

/** The grid of a track only if it was already counted (the panel's timeline never runs beats.py). */
export function cachedTrackBeats(file: string): TrackBeats | null {
  const grid = libraryGridPath(file) ?? cacheGridPath(file);
  return existsSync(grid) ? readJson<TrackBeats>(grid) : null;
}

/** The track of the bed: project.json music.track or the style's first; null — no music (music: false or no track). */
export function musicTrack(spec: Pick<VideoSpec, "music">, style: StyleDef, videoDir: string): { track: string; file: string } | null {
  const own = (spec as unknown as { music?: MusicSpec | false }).music;
  const tok = (style as unknown as { music?: Partial<MusicTokens> }).music;
  if (own === false || (!own?.track && !tok?.tracks?.length)) return null;
  const track = own?.track ?? (tok?.tracks?.[0] as string);
  return { track, file: /[/.]/.test(track) ? join(videoDir, track) : (musicFile(track) ?? join(musicDir(), `${track}.wav`)) };
}

/** music.in / music.out → seconds of the video (the bed plays start–end). */
export function musicSpan(spec: Pick<VideoSpec, "music">, timings: BeatTiming[], words: BeatWords[]): { start: number; end: number } {
  const own = (spec as unknown as { music?: MusicSpec | false }).music || undefined;
  const last = timings[timings.length - 1] as BeatTiming;
  const at = (ref: string | undefined, fallback: number): number => (ref === undefined ? fallback : ref === "start" ? 0 : ref === "end" ? last.end : resolveTime(ref, timings, words));
  return { start: at(own?.in, 0), end: at(own?.out, last.end) };
}

/** Beats of the track over the bed start–end: loops with a 2 s crossfade, as music_bed.py joins them. */
export function loopGrid(g: TrackBeats, start: number, end: number): { beats: number[]; strong: number[] } {
  const xf = Math.min(2, g.duration / 4);
  const hop = Math.max(0.5, g.duration - xf);
  const beats: number[] = [];
  const strong: number[] = [];
  for (let k = 0; start + k * hop < end && k < 200; k++) {
    const base = start + k * hop;
    const lo = k === 0 ? -1 : base + xf / 2;
    const hi = base + hop + xf / 2;
    for (const b of g.beats) if (base + b >= lo && base + b < hi && base + b < end) beats.push(r3(base + b));
    for (const b of g.downbeats) if (base + b >= lo && base + b < hi && base + b < end) strong.push(r3(base + b));
  }
  return { beats, strong };
}

export interface MusicGrid {
  track: string;
  bpm: number;
  /** Beats and strong beats (downbeats) of the bed, seconds of the video. */
  beats: number[];
  strong: number[];
}

/** The bed's beat grid in video seconds for sync: music — the same track, in/out and loops (2 s crossfade) as music_bed.py. */
export function musicGrid(spec: VideoSpec, style: StyleDef, videoDir: string, timings: BeatTiming[], words: BeatWords[]): MusicGrid | null {
  const t = musicTrack(spec, style, videoDir);
  if (!t || !existsSync(t.file)) return null;
  const g = trackBeats(t.file);
  const { start, end } = musicSpan(spec, timings, words);
  return { track: t.track, bpm: g.bpm, ...loopGrid(g, start, end) };
}

/** project.json → music: false, or a track of the style (id) or of the video (media/…wav) with dB volume, ducking, fades and in/out. */
export interface MusicSpec {
  track?: string;
  /** dB of the bed (project.json); `volume` — the old name. */
  gain?: number;
  volume?: number;
  duck?: number;
  fadeIn?: number;
  fadeOut?: number;
  in?: string;
  out?: string;
}

export interface MusicTokens {
  tracks: string[];
  volume: number;
  duck: number;
  fadeIn: number;
  fadeOut: number;
}

export interface MusicPlan {
  track: string;
  /** Repo-relative path of the licensed track (publish credits). */
  file: string;
  volume: number;
  duck: number;
  start: number;
  end: number;
}

/**
 * Music bed (library/music/MUSIC.md): the style's track or the video's own, looped to length, faded,
 * ducked under the voice by `duck` dB — baked by py/music_bed.py into build/assets/music/bed.wav.
 */
export function makeMusic(spec: VideoSpec, style: StyleDef, videoDir: string, buildDir: string, voices: VoiceLine[], timings: BeatTiming[], words: BeatWords[]): MusicPlan | null {
  const own = (spec as unknown as { music?: MusicSpec | false }).music;
  const tok = (style as unknown as { music?: Partial<MusicTokens> }).music;
  if (own === false || (!own?.track && !tok?.tracks?.length)) return null;
  const track = own?.track ?? (tok?.tracks?.[0] as string);
  const file = /[/.]/.test(track) ? join(videoDir, track) : (musicFile(track) ?? join(musicDir(), `${track}.wav`));
  if (!existsSync(file)) fail(`музыка: нет файла ${relative(ROOT_DIR, file)}`);
  checkLicense(file, "музыка");
  const last = timings[timings.length - 1] as BeatTiming;
  const at = (ref: string | undefined, fallback: number): number => (ref === undefined || ref === "start" ? (ref === "start" ? 0 : fallback) : ref === "end" ? last.end : resolveTime(ref, timings, words));
  const plan: MusicPlan = { track, file: relative(ROOT_DIR, file), volume: own?.gain ?? own?.volume ?? tok?.volume ?? -4, duck: own?.duck ?? tok?.duck ?? -12, start: r3(at(own?.in, 0)), end: r3(at(own?.out, last.end)) };
  const fadeIn = own?.fadeIn ?? tok?.fadeIn ?? 1.5;
  const fadeOut = own?.fadeOut ?? tok?.fadeOut ?? 2;
  const speech = timings.map((t, i) => [r3(t.start + (voices[i] as VoiceLine).speechStart), r3(t.start + (voices[i] as VoiceLine).speechEnd)]);
  const key = sha({ v: 1, fileHash: fileSha(file), total: last.end, speech, ...plan, fadeIn, fadeOut });
  const cacheDir = ensureDir(join(videoDir, ".cache", "music", key));
  const bed = join(cacheDir, "bed.wav");
  if (!existsSync(bed)) {
    writeJson(join(cacheDir, "speech.json"), speech);
    const args = [pyScript("music_bed.py"), "--track", file, "--out", bed, "--duration", String(last.end), "--speech", join(cacheDir, "speech.json"), "--gain", String(plan.volume), "--duck", String(plan.duck), "--fade-in", String(fadeIn), "--fade-out", String(fadeOut), "--start", String(plan.start), "--end", String(plan.end)];
    const r = lastJsonLine<{ track_lufs: number; loops: number }>(run(python(), args).stdout);
    log.info(`музыка ${track}: трек ${r.track_lufs} LUFS → подложка ${plan.start}–${plan.end} с, петель ${r.loops}, ${plan.volume} дБ, под голосом ${plan.duck} дБ`);
  } else log.info(`музыка ${track}: подложка из кэша (${key})`);
  copyFileSync(bed, join(ensureDir(join(buildDir, "assets", "music")), "bed.wav"));
  writeJson(join(buildDir, "music.json"), { ...plan, fadeIn, fadeOut });
  return plan;
}
