import type { RefCue, SceneDef } from "./contract.ts";
import type { VoiceLine } from "./voice.ts";
import type { BeatWords } from "./words.ts";
import { fail, r3 } from "./lib/util.ts";

export interface BeatTiming {
  id: string;
  number: number;
  start: number;
  duration: number;
  end: number;
  speechStart: number;
  speechEnd: number;
}

export interface Warp {
  ref: number[];
  act: number[];
  notes: string[];
}

/** Scenes follow each other; a scene lasts exactly as long as its voice clip. */
export function beatTimings(voices: Pick<VoiceLine, "beatId" | "duration" | "speechStart" | "speechEnd">[]): BeatTiming[] {
  let acc = 0;
  return voices.map((v, i) => {
    const timing = {
      id: v.beatId,
      number: i + 1,
      start: r3(acc),
      duration: v.duration,
      end: r3(acc + v.duration),
      speechStart: v.speechStart,
      speechEnd: v.speechEnd,
    };
    acc += v.duration;
    return timing;
  });
}

/** "word", "word#2", "word.end" → seconds inside the beat's clip. */
export function wordTime(words: BeatWords, ref: string): number {
  const m = /^([a-z0-9']+)(?:#(\d+))?(\.end)?$/i.exec(ref.trim());
  if (!m) fail(`${words.beatId}: не понимаю ссылку на слово «${ref}»`);
  const word = (m[1] as string).toLowerCase();
  const nth = Number(m[2] ?? 1);
  const hit = words.spoken.filter((s) => s.word === word)[nth - 1];
  if (!hit) fail(`${words.beatId}: в реплике нет слова «${word}»${m[2] ? ` №${nth}` : ""}`);
  return m[3] ? hit.end : hit.start;
}

/** "<beat>:<anchor>[±seconds]" → absolute seconds in the video. */
export function resolveTime(ref: string, timings: BeatTiming[], words: BeatWords[]): number {
  const m = /^([^:]+):([^+-]+?)([+-]\d+(?:\.\d+)?)?$/.exec(ref.trim());
  if (!m) fail(`не понимаю ссылку на время «${ref}»`);
  const beat = timings.find((t) => t.id === m[1]);
  if (!beat) fail(`«${ref}»: нет бита ${m[1]}`);
  const anchor = (m[2] as string).trim();
  const offset = Number(m[3] ?? 0);
  const local =
    anchor === "start" ? 0
    : anchor === "end" ? beat.duration
    : anchor === "speechStart" ? beat.speechStart
    : anchor === "speechEnd" ? beat.speechEnd
    : wordTime(words.find((w) => w.beatId === beat.id) as BeatWords, anchor);
  return r3(beat.start + local + offset);
}

/**
 * Knots of the scene's time warp: reference times of its anchors and cues → their words on this voice.
 * Always pinned: clip start, speech start, speech end, clip end. Cues out of order are dropped.
 */
export function warpKnots(cues: RefCue[], sceneRef: SceneDef["ref"], timing: BeatTiming, words: BeatWords): Warp {
  const pairs: [number, number, string][] = [
    [0, 0, "начало"],
    [sceneRef.speechStart, timing.speechStart, "начало речи"],
  ];
  for (const cue of cues) pairs.push([cue.at, wordTime(words, cue.word), cue.label]);
  pairs.push([sceneRef.speechEnd, timing.speechEnd, "конец речи"], [sceneRef.duration, timing.duration, "конец"]);
  pairs.sort((a, b) => a[0] - b[0]);
  const ref: number[] = [];
  const act: number[] = [];
  const notes: string[] = [];
  for (const [r, a, label] of pairs) {
    const lastRef = ref[ref.length - 1];
    const lastAct = act[act.length - 1];
    if (lastRef !== undefined && lastAct !== undefined && (r - lastRef < 0.02 || a - lastAct < 0.02)) {
      if (label === "конец") {
        ref[ref.length - 1] = r3(r);
        act[act.length - 1] = r3(a);
      } else {
        notes.push(`якорь «${label}» (${r} → ${r3(a)}) пропущен: идёт не по порядку`);
      }
      continue;
    }
    ref.push(r3(r));
    act.push(r3(a));
  }
  return { ref, act, notes };
}

/** The same piecewise-linear map the scene runtime applies (library/scenes/_runtime/warp.js). */
export function warpAt(warp: Warp, t: number): number {
  const xs = warp.ref;
  const ys = warp.act;
  const n = xs.length;
  if (t <= (xs[0] as number)) return (ys[0] as number) + (t - (xs[0] as number));
  for (let i = 1; i < n; i++) {
    const x1 = xs[i] as number;
    if (t <= x1) {
      const x0 = xs[i - 1] as number;
      const y0 = ys[i - 1] as number;
      return y0 + ((t - x0) * ((ys[i] as number) - y0)) / (x1 - x0);
    }
  }
  return (ys[n - 1] as number) + (t - (xs[n - 1] as number));
}
