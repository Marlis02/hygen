import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VideoSpec } from "./spec.ts";
import type { BeatTiming } from "./timeline.ts";
import { resolveTime } from "./timeline.ts";
import type { BeatWords } from "./words.ts";
import { copyInto, ensureDir, log, pyScript, python, r3, run, sha, writeJson } from "./lib/util.ts";

/** Input of py/sound_design.py — every time comes from the voice timings. */
export interface SoundTimeline {
  frame_starts_s: number[];
  total_s: number;
  peak_s: number;
  cut_s: number;
  ash_duration_s: number;
  ash_swell_s: number;
  ash_debris_s: number;
}

export interface SfxCue {
  kind: "thud" | "thud-heavy" | "ash-fall";
  file: string;
  at: number;
  frame: number;
  offset_s: number;
  duration_s: number;
  volume: number;
  carve?: number;
  /** Element id in index.html, set when the index is finalized. */
  id?: string;
}

export interface SoundPlan {
  timeline: SoundTimeline;
  sfx: SfxCue[];
  drone: { cut: number; volume: number; carve?: number };
}

const THUD_S = 1.7;
const THUD_HEAVY_S = 2.6;

export function planSound(spec: VideoSpec, timings: BeatTiming[], words: BeatWords[]): SoundPlan {
  const at = (ref: string): number => resolveTime(ref, timings, words);
  const frameOf = (t: number): BeatTiming => timings.filter((b) => b.start <= t + 0.35).pop() ?? (timings[0] as BeatTiming);
  const cue = (kind: SfxCue["kind"], t: number, duration: number, volume: number, carve?: number): SfxCue => {
    const f = frameOf(t);
    return { kind, file: `assets/sfx/${kind}.wav`, at: r3(t), frame: f.number, offset_s: r3(t - f.start), duration_s: r3(duration), volume, carve };
  };
  const sfx: SfxCue[] = spec.sound.hits.map((h) => cue(h.heavy ? "thud-heavy" : "thud", at(h.at), h.heavy ? THUD_HEAVY_S : THUD_S, h.volume, h.carve));
  let ash = { duration: 1, swell: 0.5, debris: 0.8 };
  if (spec.sound.ash) {
    const a = spec.sound.ash;
    const start = at(a.at);
    ash = { duration: r3(at(a.until) - start), swell: r3(at(a.swell) - start), debris: r3(at(a.debris) - start) };
    sfx.push(cue("ash-fall", start, ash.duration, a.volume, a.carve));
  }
  sfx.sort((x, y) => x.at - y.at);
  const last = timings[timings.length - 1] as BeatTiming;
  const timeline: SoundTimeline = {
    frame_starts_s: timings.map((t) => t.start),
    total_s: last.end,
    peak_s: at(spec.sound.drone.peak),
    cut_s: at(spec.sound.drone.cut),
    ash_duration_s: ash.duration,
    ash_swell_s: ash.swell,
    ash_debris_s: ash.debris,
  };
  log.info(`гул: пик ${timeline.peak_s} с, обрыв ${timeline.cut_s} с · пепел ${ash.duration} с · ударов ${spec.sound.hits.length}`);
  return { timeline, sfx, drone: { cut: timeline.cut_s, volume: spec.sound.drone.volume, carve: spec.sound.drone.carve } };
}

/** Drone, thuds and ash, generated in code from the timings (py/sound_design.py), cached by timing. */
export function makeSound(plan: SoundPlan, videoDir: string, buildDir: string): void {
  const t = plan.timeline;
  const key = sha({ v: 1, peak: t.peak_s, cut: t.cut_s, ash: [t.ash_duration_s, t.ash_swell_s, t.ash_debris_s] });
  const cacheDir = join(videoDir, ".cache", "sound", key);
  if (!existsSync(join(cacheDir, "music", "drone.wav"))) {
    ensureDir(cacheDir);
    writeJson(join(cacheDir, "audio_timeline.json"), t);
    run(python(), [pyScript("sound_design.py"), "--timeline", join(cacheDir, "audio_timeline.json"), "--out", cacheDir]);
    log.info(`звук сгенерирован заново (${key})`);
  } else {
    log.info(`звук из кэша (${key})`);
  }
  copyInto(join(cacheDir, "music"), join(buildDir, "assets", "music"));
  copyInto(join(cacheDir, "sfx"), join(buildDir, "assets", "sfx"));
  writeJson(join(buildDir, "audio_timeline.json"), t);
}

/** Two seeded film-grain tiles (py/make_grain.py). */
export function makeGrain(videoDir: string, buildDir: string): void {
  const cacheDir = join(videoDir, ".cache", "grain");
  if (!existsSync(join(cacheDir, "grain-dark.png"))) run(python(), [pyScript("make_grain.py"), "--out", ensureDir(cacheDir)]);
  copyInto(cacheDir, join(buildDir, "assets", "grain"));
}
