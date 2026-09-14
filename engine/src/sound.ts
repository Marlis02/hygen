import { existsSync } from "node:fs";
import { join } from "node:path";
import type { StyleDef } from "./contract.ts";
import type { PlannedTransition } from "./layers.ts";
import type { LookDef } from "./look.ts";
import type { SceneBuild } from "./scenes.ts";
import type { VideoSpec } from "./spec.ts";
import type { BeatTiming } from "./timeline.ts";
import { resolveTime, warpAt } from "./timeline.ts";
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
  /** thud | thud-heavy | ash-fall (video.json sound) or ev-<family> (engine events: devices, scenes, transitions). */
  kind: string;
  file: string;
  at: number;
  frame: number;
  offset_s: number;
  duration_s: number;
  volume: number;
  carve?: number;
  /** Element id in index.html, set when the index is finalized. */
  id?: string;
  /** The event that asked for an ev-* sound. */
  label?: string;
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

// ── event sounds (ROADMAP D5): what the eye sees gets a sound — a stroke when a mark draws, ticks while a number counts ──

export interface EventSoundTokens {
  /** Event word → family: draw → scribble, land → tap, count → ticks, focus → swell, freeze → shutter, wipe → whoosh… */
  events: Record<string, string>;
  volume: Record<string, number>;
  carve: number;
  /** Min seconds between two event sounds. */
  gap: number;
  /** Max event sounds in one beat (a count's ticks do not count). */
  perBeat: number;
}

const EVENT_DEFAULTS: EventSoundTokens = {
  events: { draw: "scribble", land: "tap", count: "ticks", focus: "swell", freeze: "shutter", hold: "shutter", wipe: "whoosh", in: "tap", marker: "tap", item: "tap", word: "tap", rise: "riser", fill: "riser", uncovered: "swell", strata: "swell", collapse: "impact", transition: "whoosh" },
  volume: { scribble: 0.34, tap: 0.4, ticks: 0.32, swell: 0.34, riser: 0.34, whoosh: 0.36, shutter: 0.45, impact: 0.5 },
  carve: 0.6,
  gap: 0.2,
  perBeat: 4,
};
const FAMILY_S: Record<string, number> = { scribble: 0.42, tap: 0.16, swell: 0.9, riser: 1.2, whoosh: 0.6, shutter: 0.3 };

/** Event label → sound family: the words after «device: », last word first, plural folded («counts» → count). */
export function eventFamily(label: string, table: Record<string, string>): string | null {
  const words = label.replace(/^[^:]*:\s*/, "").toLowerCase().split(/[^a-z]+/).filter(Boolean).reverse();
  for (const w of words) {
    const hit = table[w] ?? (w.endsWith("s") ? table[w.slice(0, -1)] : undefined);
    if (hit) return hit;
  }
  return null;
}

export interface EventSoundInput {
  spec: VideoSpec;
  style: StyleDef;
  look: LookDef;
  timings: BeatTiming[];
  scenes: SceneBuild[];
  transitions: PlannedTransition[];
  /** Times of the explicit hits of video.json: an event right on a hit stays silent. */
  hits: number[];
}

export interface EventSoundPlan {
  cues: SfxCue[];
  files: { name: string; family: string; duration: number }[];
}

export function planEventSounds(input: EventSoundInput): EventSoundPlan {
  const own = (input.style as unknown as { sound?: Partial<EventSoundTokens> }).sound ?? {};
  const tok: EventSoundTokens = { ...EVENT_DEFAULTS, ...own, events: { ...EVENT_DEFAULTS.events, ...(own.events ?? {}) }, volume: { ...EVENT_DEFAULTS.volume, ...(own.volume ?? {}) } };
  const { timings } = input;
  const last = timings[timings.length - 1] as BeatTiming;
  const frameOf = (t: number): BeatTiming => timings.filter((b) => b.start <= t + 0.35).pop() ?? (timings[0] as BeatTiming);
  const evs: { t: number; family: string; dur: number; label: string; beat: number }[] = [];
  input.scenes.forEach((sc, i) => {
    const tm = timings[i] as BeatTiming;
    const list = sc.events.map((ev) => ({ t: r3(tm.start + warpAt(sc.warp, ev.ref)), label: ev.label }));
    list.forEach((ev, k) => {
      const family = eventFamily(ev.label, tok.events);
      if (!family) return;
      let dur = FAMILY_S[family] ?? 0.5;
      if (family === "ticks") {
        // a device count runs until its own land; a scene counter about 0.9 s
        const device = ev.label.includes(":") ? (ev.label.split(":")[0] as string) : null;
        const land = device ? list.slice(k + 1).find((x) => x.label.startsWith(`${device}:`) && /land/.test(x.label)) : undefined;
        dur = Math.round(Math.min(2.4, Math.max(0.5, land ? land.t - ev.t : 0.9)) * 10) / 10;
      }
      evs.push({ t: ev.t, family, dur, label: ev.label, beat: i });
    });
  });
  const trFamily = tok.events.transition;
  if (trFamily) for (const tr of input.transitions) evs.push({ t: r3(Math.max(0, tr.at - 0.25)), family: trFamily, dur: FAMILY_S[trFamily] ?? 0.6, label: `transition: ${tr.list.join("+")}`, beat: timings.indexOf(frameOf(tr.at)) });
  evs.sort((a, b) => a.t - b.t);

  const kept: typeof evs = [];
  const perBeat = new Map<number, number>();
  for (const e of evs) {
    if (e.t > last.end - 0.25) continue;
    if (e.family !== "ticks" && input.hits.some((h) => Math.abs(h - e.t) < 0.25)) continue;
    const prev = kept[kept.length - 1];
    if (prev && prev.family !== "ticks" && e.t - prev.t < tok.gap) continue;
    const n = perBeat.get(e.beat) ?? 0;
    if (e.family !== "ticks" && n >= tok.perBeat) continue;
    if (e.family !== "ticks") perBeat.set(e.beat, n + 1);
    kept.push(e);
  }

  const files = new Map<string, { name: string; family: string; duration: number }>();
  const cues = kept.map((e): SfxCue => {
    const name = e.family === "impact" ? "thud-heavy" : e.family === "ticks" ? `ev-ticks-${e.dur.toFixed(1)}` : `ev-${e.family}`;
    if (e.family !== "impact") files.set(name, { name, family: e.family, duration: e.family === "ticks" ? e.dur : (FAMILY_S[e.family] ?? 0.5) });
    const f = frameOf(e.t);
    const dur = e.family === "impact" ? THUD_HEAVY_S : e.family === "ticks" ? e.dur + 0.08 : (FAMILY_S[e.family] ?? 0.5);
    return { kind: `ev-${e.family}`, file: `assets/sfx/${name}.wav`, at: e.t, frame: f.number, offset_s: r3(e.t - f.start), duration_s: r3(dur), volume: tok.volume[e.family] ?? 0.35, carve: tok.carve, label: e.label };
  });
  return { cues, files: [...files.values()] };
}

/** Event sounds synthesized in code (py/sound_design.py --events), coloured by the look hint, cached by the set of files. */
export function makeEventSounds(files: EventSoundPlan["files"], look: LookDef, videoDir: string, buildDir: string): void {
  if (!files.length) return;
  const color = ["water", "smoke", "ash"].includes(look.sound.whoosh) ? look.sound.whoosh : "air";
  const key = sha({ v: 1, files, color });
  const cacheDir = join(videoDir, ".cache", "sound-events", key);
  if (!existsSync(join(cacheDir, "done.json"))) {
    ensureDir(cacheDir);
    writeJson(join(cacheDir, "events.json"), { files });
    run(python(), [pyScript("sound_design.py"), "--events", join(cacheDir, "events.json"), "--whoosh", color, "--out", cacheDir]);
    writeJson(join(cacheDir, "done.json"), { files: files.length });
  }
  copyInto(join(cacheDir, "sfx"), join(buildDir, "assets", "sfx"));
}
