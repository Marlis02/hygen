import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoSpec } from "./spec.ts";
import { normalizeWords, parseBeatText } from "./spec.ts";
import type { VoiceLine } from "./voice.ts";
import { ensureDir, fail, fileSha, hyperframesBin, log, pool, r3, readJson, runAsync, writeJson } from "./lib/util.ts";

export const ASR_MODEL = "large-v3-turbo";

/** A caption token (display text) with its time inside the voice clip. */
export interface TimedWord {
  id: string;
  text: string;
  start: number;
  end: number;
}

/** A spoken word of the script (normalized) — what cues and sound references point at. */
export interface SpokenWord {
  word: string;
  token: number;
  start: number;
  end: number;
}

export interface BeatWords {
  beatId: string;
  tokens: TimedWord[];
  spoken: SpokenWord[];
  heard: string;
  matched: number;
  snapped: number;
}

interface AsrWord {
  text: string;
  start: number;
  end: number;
}

interface Unit {
  word: string;
  start: number;
  end: number;
}

// ── numbers: whisper writes "18", "11,000", "1748"; the script says them in words ──────────────
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function below100(n: number): string[] {
  if (n < 20) return [ONES[n] as string];
  const tens = TENS[Math.floor(n / 10)] as string;
  return n % 10 ? [tens, ONES[n % 10] as string] : [tens];
}

function below1000(n: number): string[] {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const out: string[] = [];
  if (hundreds) out.push(ONES[hundreds] as string, "hundred");
  if (rest) out.push(...below100(rest));
  return out;
}

export function cardinalWords(n: number): string[] {
  if (n === 0) return ["zero"];
  const out: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions) out.push(...below1000(millions), "million");
  if (thousands) out.push(...below1000(thousands), "thousand");
  if (rest) out.push(...below1000(rest));
  return out;
}

export function yearWords(n: number): string[] | null {
  if (n < 1100 || n > 1999) return null;
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  return [...below100(hi), ...(lo === 0 ? ["hundred"] : lo < 10 ? ["oh", ONES[lo] as string] : below100(lo))];
}

/** ASR tokens → normalized word units; a number becomes the words the script uses for it. */
function expandAsr(asr: AsrWord[], script: string): Unit[] {
  const units: Unit[] = [];
  for (const a of asr) {
    const words: string[] = [];
    for (const piece of a.text.replace(/(\d),(?=\d{3})/g, "$1").split(/[-–—]/)) {
      const digits = /^\D*(\d+)\D*$/.exec(piece)?.[1];
      if (digits) {
        const n = Number(digits);
        const year = yearWords(n);
        words.push(...(year && script.includes(year.join(" ")) ? year : cardinalWords(n)));
      } else {
        words.push(...normalizeWords(piece));
      }
    }
    if (!words.length) continue;
    const weight = words.reduce((s, w) => s + Math.max(2, w.length), 0);
    let t = a.start;
    for (const w of words) {
      const share = ((a.end - a.start) * Math.max(2, w.length)) / weight;
      units.push({ word: w, start: t, end: t + share });
      t += share;
    }
  }
  return units;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - (prev[b.length] as number) / Math.max(a.length, b.length);
}

/** Needleman–Wunsch over words: script index → ASR unit index (null when the ASR missed it). */
function alignSequences(script: string[], units: Unit[]): (number | null)[] {
  const n = script.length;
  const m = units.length;
  const GAP = 0.6;
  const w = m + 1;
  const cost = new Float64Array((n + 1) * w);
  const back = new Uint8Array((n + 1) * w);
  for (let i = 1; i <= n; i++) {
    cost[i * w] = i * GAP;
    back[i * w] = 2;
  }
  for (let j = 1; j <= m; j++) {
    cost[j] = j * GAP;
    back[j] = 3;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = (cost[(i - 1) * w + j - 1] as number) + (1 - similarity(script[i - 1] as string, (units[j - 1] as Unit).word)) * 1.5;
      const up = (cost[(i - 1) * w + j] as number) + GAP;
      const left = (cost[i * w + j - 1] as number) + GAP;
      let best = diag;
      let dir = 1;
      if (up < best) {
        best = up;
        dir = 2;
      }
      if (left < best) {
        best = left;
        dir = 3;
      }
      cost[i * w + j] = best;
      back[i * w + j] = dir;
    }
  }
  const match: (number | null)[] = new Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const dir = i > 0 && j > 0 ? back[i * w + j] : i > 0 ? 2 : 3;
    if (dir === 1) {
      if (similarity(script[i - 1] as string, (units[j - 1] as Unit).word) >= 0.5) match[i - 1] = j - 1;
      i--;
      j--;
    } else if (dir === 2) i--;
    else j--;
  }
  return match;
}

function readWavMono16(path: string): { samples: Int16Array; rate: number } {
  const buf = readFileSync(path);
  let off = 12;
  let rate = 48000;
  let channels = 1;
  let bits = 16;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(off + 10);
      rate = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    } else if (id === "data") {
      if (bits !== 16 || channels !== 1) fail(`${path}: ожидался WAV 16 бит моно`);
      const count = Math.floor(Math.min(size, buf.length - off - 8) / 2);
      const samples = new Int16Array(count);
      for (let k = 0; k < count; k++) samples[k] = buf.readInt16LE(off + 8 + 2 * k);
      return { samples, rate };
    }
    off += 8 + size + (size % 2);
  }
  fail(`${path}: в WAV нет блока data`);
}

/** Pauses inside the speech: ≥ 60 ms below −38 dB of the line's peak (10 ms RMS envelope). */
function pauses(path: string, from: number, to: number): [number, number][] {
  const { samples, rate } = readWavMono16(path);
  const hop = Math.round(rate * 0.01);
  const env: number[] = [];
  let peak = 1;
  for (let k = 0; k + hop <= samples.length; k += hop) {
    let acc = 0;
    for (let q = k; q < k + hop; q++) acc += (samples[q] as number) * (samples[q] as number);
    const rms = Math.sqrt(acc / hop);
    env.push(rms);
    if (rms > peak) peak = rms;
  }
  const quiet = env.map((v) => 20 * Math.log10(v / peak + 1e-12) < -38);
  const out: [number, number][] = [];
  for (let i = 0; i < quiet.length; ) {
    if (!quiet[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < quiet.length && quiet[j]) j++;
    const a = i * 0.01;
    const b = j * 0.01;
    if (b - a >= 0.06 && a > from + 0.03 && b < to - 0.03) out.push([a, b]);
    i = j;
  }
  return out;
}

/**
 * Word timings: `hyperframes transcribe` (whisper) gives times, the script gives the words.
 * Short words that whisper places inside a pause (TRAPS.md) are moved to the end of that pause.
 */
export async function alignWords(spec: VideoSpec, voices: VoiceLine[], videoDir: string): Promise<BeatWords[]> {
  const bin = hyperframesBin();
  const cacheDir = ensureDir(join(videoDir, ".cache", "asr"));
  return pool(voices, 2, async (voice, i) => {
    const beat = spec.beats[i];
    if (!beat) fail(`нет бита для голоса ${voice.beatId}`);
    const cachePath = join(cacheDir, `${fileSha(voice.abs)}-${ASR_MODEL}.json`);
    if (!existsSync(cachePath)) {
      const tmp = mkdtempSync(join(tmpdir(), "hygen-asr-"));
      try {
        await runAsync(bin, ["transcribe", voice.abs, "--dir", tmp, "--model", ASR_MODEL, "--language", spec.language, "--json"]);
        writeJson(cachePath, readJson<unknown>(join(tmp, "transcript.json")));
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
    const rawAsr = readJson<AsrWord[] | { words: AsrWord[] }>(cachePath);
    const asr = Array.isArray(rawAsr) ? rawAsr : rawAsr.words;

    const { tokens } = parseBeatText(beat.text);
    const script: { word: string; token: number }[] = [];
    tokens.forEach((t, ti) => t.spoken.forEach((word) => script.push({ word, token: ti })));
    const units = expandAsr(asr, script.map((s) => s.word).join(" "));
    const match = alignSequences(script.map((s) => s.word), units);
    const matched = match.filter((x) => x !== null).length;

    // matched words take whisper's times; a run of missed words shares the gap by length
    const spans: ({ start: number; end: number } | null)[] = match.map((j) => (j === null ? null : { start: (units[j] as Unit).start, end: (units[j] as Unit).end }));
    for (let k = 0; k < spans.length; ) {
      if (spans[k]) {
        k++;
        continue;
      }
      let e = k;
      while (e < spans.length && !spans[e]) e++;
      const left = k > 0 ? (spans[k - 1] as { end: number }).end : voice.speechStart;
      const right = e < spans.length ? (spans[e] as { start: number }).start : voice.speechEnd;
      const weights = script.slice(k, e).map((s) => Math.max(2, s.word.length));
      const total = weights.reduce((a, b) => a + b, 0);
      let t = left;
      for (let q = k; q < e; q++) {
        const d = (Math.max(0, right - left) * (weights[q - k] as number)) / total;
        spans[q] = { start: t, end: t + d };
        t += d;
      }
      k = e;
    }

    const spoken: SpokenWord[] = script.map((s, q) => ({ word: s.word, token: s.token, ...(spans[q] as { start: number; end: number }) }));
    const gaps = pauses(voice.abs, voice.speechStart, voice.speechEnd);
    let snapped = 0;
    for (const w of spoken) {
      const gap = gaps.find(([a, b]) => w.start > a + 0.02 && w.start < b - 0.01);
      if (gap) {
        w.start = gap[1];
        snapped++;
      }
    }
    spoken.forEach((w, q) => {
      const prev = spoken[q - 1];
      w.start = prev ? Math.max(w.start, prev.start + 0.03) : Math.max(w.start, voice.speechStart - 0.02);
    });
    spoken.forEach((w, q) => {
      const next = spoken[q + 1];
      const limit = next ? next.start : voice.speechEnd + 0.05;
      w.end = r3(Math.max(w.start + 0.05, Math.min(w.end, limit)));
      w.start = r3(w.start);
    });

    const timed: TimedWord[] = [];
    tokens.forEach((t, ti) => {
      const ws = spoken.filter((s) => s.token === ti);
      if (!ws.length) return;
      timed.push({ id: `w${timed.length}`, text: t.display, start: (ws[0] as SpokenWord).start, end: (ws[ws.length - 1] as SpokenWord).end });
    });
    const heard = asr.map((a) => a.text).join(" ");
    log.info(`${beat.id}: совпало слов ${matched}/${script.length}, сдвинуто к паузам ${snapped} · whisper: «${heard}»`);
    if (matched < script.length * 0.8) log.warn(`${beat.id}: whisper расслышал мало слов — проверьте голос`);
    return { beatId: beat.id, tokens: timed, spoken, heard, matched, snapped };
  });
}
