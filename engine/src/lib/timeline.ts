import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { captionStyleOf, closeCaptionGroups, groupTokens } from "../captions.ts";
import type { StyleDef } from "../contract.ts";
import { loadStyle } from "../contract.ts";
import { deviceMoments, deviceParams, loadDevice } from "../devices.ts";
import { resolverInputHash } from "../intents.ts";
import { planTransitions } from "../layers.ts";
import type { LookDef } from "../look.ts";
import { loadLook } from "../look.ts";
import type { MusicGrid, MusicSpec, MusicTokens } from "../music.ts";
import { cachedTrackBeats, loopGrid, musicSpan, musicTrack } from "../music.ts";
import type { SceneBuild } from "../scenes.ts";
import type { BeatSpec, VideoSpec } from "../spec.ts";
import { loadSpec, parseBeatText } from "../spec.ts";
import { clockOf } from "../stage.ts";
import type { BeatTiming } from "../timeline.ts";
import { beatTimings, resolveTime } from "../timeline.ts";
import type { VoiceProvider, VoiceResult } from "../voice.ts";
import { resolveVoice } from "../voice.ts";
import type { BeatWords, SpokenWord, TimedWord } from "../words.ts";
import { loadConfig } from "./project.ts";
import { ROOT_DIR, fail, r3, readJson, writeJson } from "./util.ts";

// build/timeline.json (ROADMAP S3, «Карта ролика»): the whole video on one time axis for the «Редактор» screen — beats,
// words, captions, devices, transitions, music. The build writes it from its own records (build/timing.json and the
// files it already had); readTimeline answers for a project changed since the build or never built: real word times
// stay, each beat is re-laid with its current pad, a new or edited line is estimated by characters.

export const TIMELINE_VERSION = 1;
/** The pause after a line: the tail of `pad` — silence the voice clip gets after the speech (py/voice_line.py). */
export const HOLD = { field: "pad[1]", min: 0, max: 3 } as const;
/** Where the bed starts: a time reference "<beat>:<word|start|end|speechStart|speechEnd>[±s]" (engine/src/music.ts). */
export const MUSIC_OFFSET_FIELD = "music.in";

export interface TimelineBeat {
  id: string;
  number: number;
  start: number;
  end: number;
  speechStart: number;
  speechEnd: number;
  /** The line as in project.json (with `[display|spoken]`); tts — what the voice says. */
  line: string;
  tts: string;
  stage: string;
  intent: string | null;
  hold: { value: number; min: number; max: number; field: string };
  lead: { value: number; field: string };
  duration: number;
  /** This beat's speech is an estimate (a new or edited line, another provider). */
  estimated: boolean;
}

export interface TimelineWord {
  text: string;
  start: number;
  end: number;
  bit: string;
  /** What `at` of a device in this beat takes to stand on this word: its first spoken word ("eighteen", "the#2"); refEnd — the end of its last one. */
  ref: string | null;
  refEnd: string | null;
}

export interface TimelineCaption {
  text: string;
  start: number;
  end: number;
  beat: string;
}

export interface TimelineDevice {
  bit: string;
  index: number;
  type: string;
  at: number;
  duration: number;
  until: number | null;
  target: string | null;
  atRaw: number | string | null;
  /** Field of the beat in project.json that holds atRaw: "devices[0].at" or "at" (intent / recipe shorthand); null — default moment. */
  atField: string | null;
}

export interface TimelineTransition {
  from: string;
  to: string;
  type: string;
  list: string[];
  start: number;
  duration: number;
}

export interface TimelineMusic {
  track: string;
  id: string;
  offset: number;
  offsetRaw: string | null;
  offsetField: string;
  bpm: number | null;
  beats: number[];
  strong: number[];
  duckDb: number;
  duck: { start: number; end: number; gain: number }[];
}

export interface Timeline {
  version: number;
  id: string;
  estimated: boolean;
  duration: number;
  fps: number;
  source: { projectHash: string | null; builtAt: string | null };
  voice: { provider: VoiceProvider; cached: boolean | null };
  beats: TimelineBeat[];
  words: TimelineWord[];
  captions: TimelineCaption[];
  devices: TimelineDevice[];
  transitions: TimelineTransition[];
  music: TimelineMusic | null;
  warnings: string[];
}

type Words = Pick<BeatWords, "beatId" | "tokens" | "spoken">;

interface TimingLine {
  beatId: string;
  text: string;
  pad: [number, number];
  duration: number;
  speechStart: number;
  speechEnd: number;
  cached: boolean;
  provider: VoiceProvider;
}

interface DeviceMoment {
  index: number;
  type: string;
  at: number;
  until: number | null;
}

interface PlainTransition {
  from: string;
  to: string;
  type: string;
  list: string[];
  duration: number;
}

/** build/timing.json — what the build knows about time and the other build/ files do not keep. */
export interface TimingRecord {
  version: 1;
  /** sha1 of project.json read when the build started. */
  projectHash: string;
  voice: { provider: VoiceProvider; voiceId: string; model: string; cached: boolean };
  lines: TimingLine[];
  words: Words[];
  devices: { beatId: string; list: DeviceMoment[] }[];
  grid: MusicGrid | null;
  shaders: PlainTransition[];
}

interface RawProject {
  id?: string;
  fps?: number;
  voice?: { provider?: string; engine?: string };
  beats?: Record<string, unknown>[];
}

/** A finished build as the map needs it. */
interface Snapshot {
  id: string;
  fps: number;
  hash: string | null;
  builtAt: string | null;
  provider: VoiceProvider;
  cached: boolean | null;
  beats: BeatSpec[];
  lines: TimingLine[];
  words: Words[];
  /** null for a beat — the build did not record its devices (an older engine): the moments are counted from the words. */
  devices: (DeviceMoment[] | null)[];
  grid: MusicGrid | null;
  transitions: PlainTransition[];
  music: { track: string; file: string; offset: number; offsetRaw: string | null; duck: number } | null;
  groupModes: Record<string, string>;
  warnings: string[];
}

const msg = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const full = (w: Words): BeatWords => ({ ...w, heard: "", matched: 0, snapped: 0 });
const shaderList = (transitions: VideoSpec["transitions"]): PlainTransition[] =>
  transitions.filter((tr) => tr.type === "shader").map((tr) => ({ from: tr.from, to: tr.to, type: "shader", list: tr.shader ? [tr.shader] : [], duration: tr.duration }));

export const projectHashOf = (projectDir: string): string => createHash("sha1").update(readFileSync(join(projectDir, "project.json"))).digest("hex");

/** The clip of a line: lead + speech + tail, stretched to a whole frame (py/voice_line.py). */
const clipLength = (lead: number, speech: number, tail: number, fps: number): number => r3(Math.ceil((lead + speech + tail) * fps - 1e-6) / fps);

/** Words share a span by length (as words.ts shares a gap whisper missed). */
function spread(words: string[], from: number, to: number): { start: number; end: number }[] {
  const weights = words.map((w) => Math.max(2, w.length));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = from;
  return weights.map((w) => {
    const d = (Math.max(0, to - from) * w) / total;
    const span = { start: r3(t), end: r3(t + d) };
    t += d;
    return span;
  });
}

/** A line never voiced: its words laid over from–to by length. */
function estimateWords(beat: Pick<BeatSpec, "id" | "text">, from: number, to: number): Words {
  const { tokens } = parseBeatText(beat.text);
  const script = tokens.flatMap((t, ti) => t.spoken.map((word) => ({ word, token: ti })));
  const spans = spread(script.map((s) => s.word), from, to);
  const spoken: SpokenWord[] = script.map((s, q) => ({ ...s, ...(spans[q] as { start: number; end: number }) }));
  return { beatId: beat.id, tokens: tokensOf(tokens.map((t) => t.display), spoken), spoken };
}

function tokensOf(display: string[], spoken: SpokenWord[]): TimedWord[] {
  const out: TimedWord[] = [];
  display.forEach((text, ti) => {
    const ws = spoken.filter((s) => s.token === ti);
    if (!ws.length) return;
    out.push({ id: `w${out.length}`, text, start: (ws[0] as SpokenWord).start, end: (ws[ws.length - 1] as SpokenWord).end });
  });
  return out;
}

// ── the build ────────────────────────────────────────────────────────────────────────────────────

/** Called by the build once index.html is assembled: voice lines, words, device moments and the music grid → build/timing.json. */
export function writeTimingRecord(buildDir: string, input: { projectHash: string; spec: VideoSpec; voice: VoiceResult; words: BeatWords[]; scenes: SceneBuild[]; grid: MusicGrid | null }): void {
  const { spec, voice } = input;
  const record: TimingRecord = {
    version: 1,
    projectHash: input.projectHash,
    voice: { provider: voice.choice.provider, voiceId: voice.choice.voiceId, model: voice.choice.model, cached: voice.lines.every((l) => l.cached) },
    lines: voice.lines.map((l, i) => {
      const beat = spec.beats[i] as BeatSpec;
      return { beatId: l.beatId, text: beat.text, pad: beat.pad, duration: l.duration, speechStart: l.speechStart, speechEnd: l.speechEnd, cached: l.cached, provider: l.provider };
    }),
    words: input.words.map((w) => ({ beatId: w.beatId, tokens: w.tokens, spoken: w.spoken })),
    devices: input.scenes.map((s) => ({ beatId: s.beatId, list: (s.devices ?? []).map((d) => ({ index: d.index, type: d.type, at: d.at, until: d.until })) })),
    grid: input.grid,
    shaders: shaderList(spec.transitions),
  };
  writeJson(join(buildDir, "timing.json"), record);
}

/** A line of a build without timing.json: the voice cache knows where its speech is (.cache/voice/<beat>-<key>/line.json). */
function cachedLine(projectDir: string, beatId: string, duration: number, lead: number): { speech_start_s: number; speech_end_s: number } | null {
  const dir = join(projectDir, ".cache", "voice");
  if (!existsSync(dir)) return null;
  const re = new RegExp(`^${beatId.replace(/[-]/g, "\\-")}-[0-9a-f]{16}$`);
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name, "line.json");
    if (!re.test(name) || !existsSync(file)) continue;
    const m = readJson<{ duration_s: number; speech_start_s: number; speech_end_s: number }>(file);
    if (Math.abs(m.duration_s - duration) < 0.0015 && Math.abs(m.speech_start_s - lead) < 0.0015) return m;
  }
  return null;
}

const readRaw = (projectDir: string): RawProject | null => {
  try {
    return readJson<RawProject>(join(projectDir, "project.json"));
  } catch {
    return null;
  }
};

/**
 * build/ → Snapshot. `partial` — the build itself, before timeline.json exists; otherwise timing.json without
 * timeline.json is a build still running (build/ is wiped at its start) and there is no build to read.
 */
function loadBuild(projectDir: string, partial: boolean): Snapshot | null {
  const dir = join(projectDir, "build");
  const has = (f: string): boolean => existsSync(join(dir, f));
  if (!["beats.expanded.json", "audio_meta.json", "verify_plan.json", "captions.plan.json"].every(has)) return null;
  if (has("timing.json") && !partial && !has("timeline.json")) return null;
  const expanded = readJson<{ inputHash: string; beats: BeatSpec[] }>(join(dir, "beats.expanded.json"));
  const plan = readJson<{ id: string; fps: number }>(join(dir, "verify_plan.json"));
  const meta = readJson<{ voices: { duration_s: number; words: TimedWord[] }[] }>(join(dir, "audio_meta.json"));
  if (meta.voices.length !== expanded.beats.length) return null;
  const caps = readJson<{ beats: { id: string; style: { group: string } }[] }>(join(dir, "captions.plan.json"));
  const groupModes = Object.fromEntries(caps.beats.map((b) => [b.id, b.style.group]));
  const warnings: string[] = [];
  const builtAt = has("index.html") ? statSync(join(dir, "index.html")).mtime.toISOString() : null;
  const layers = has("layers.json") ? readJson<{ transitions?: { fromBeat: string; toBeat: string; list: string[]; dur: number }[] }>(join(dir, "layers.json")) : {};
  const planned: PlainTransition[] = (layers.transitions ?? []).map((p) => ({ from: p.fromBeat, to: p.toBeat, type: p.list.join("+"), list: p.list, duration: p.dur }));
  const music = has("music.json") ? readJson<{ track: string; file: string; start: number; end: number; duck: number }>(join(dir, "music.json")) : null;
  const raw = readRaw(projectDir);
  const rawMusic = (raw as { music?: MusicSpec | false } | null)?.music;
  const snapMusic = music ? { track: music.track, file: music.file, offset: music.start, offsetRaw: rawMusic ? (rawMusic.in ?? null) : null, duck: music.duck } : null;

  if (has("timing.json")) {
    const rec = readJson<TimingRecord>(join(dir, "timing.json"));
    const byBeat = new Map(rec.devices.map((d) => [d.beatId, d.list]));
    return {
      id: plan.id,
      fps: plan.fps,
      hash: rec.projectHash,
      builtAt,
      provider: rec.voice.provider,
      cached: rec.voice.cached,
      beats: expanded.beats,
      lines: rec.lines,
      words: rec.words,
      devices: expanded.beats.map((b) => byBeat.get(b.id) ?? null),
      grid: rec.grid,
      transitions: [...planned, ...rec.shaders],
      music: snapMusic,
      groupModes,
      warnings,
    };
  }

  // a build of an older engine: speech bounds from the voice cache, spoken words shared inside the caption tokens
  const lines: TimingLine[] = [];
  const words: Words[] = [];
  let approx = 0;
  expanded.beats.forEach((beat, i) => {
    const v = meta.voices[i] as { duration_s: number; words: TimedWord[] };
    const pad = beat.pad ?? [0.2, 0.4];
    const hit = cachedLine(projectDir, beat.id, v.duration_s, pad[0]);
    const lastTok = v.words[v.words.length - 1];
    if (!hit) approx++;
    const speechStart = hit?.speech_start_s ?? r3(pad[0]);
    const speechEnd = hit?.speech_end_s ?? r3(Math.max(lastTok?.end ?? speechStart, v.duration_s - pad[1] - 0.5 / plan.fps));
    lines.push({ beatId: beat.id, text: beat.text, pad, duration: v.duration_s, speechStart, speechEnd, cached: true, provider: "kokoro" });
    const { tokens } = parseBeatText(beat.text);
    const voiced = tokens.map((t, ti) => ({ t, ti })).filter(({ t }) => t.spoken.length);
    if (voiced.length !== v.words.length) {
      words.push(estimateWords(beat, speechStart, speechEnd));
      return;
    }
    const spoken: SpokenWord[] = [];
    voiced.forEach(({ t, ti }, k) => {
      const tok = v.words[k] as TimedWord;
      spread(t.spoken, tok.start, tok.end).forEach((span, q) => spoken.push({ word: t.spoken[q] as string, token: ti, ...span }));
    });
    words.push({ beatId: beat.id, tokens: v.words, spoken });
  });
  warnings.push(`сборка старым движком (нет build/timing.json): слова внутри субтитров разложены по длине${approx ? `, у ${approx} бит(ов) границы речи приблизительны` : ""}, моменты устройств пересчитаны`);
  const info = join(projectDir, "renders", `${plan.id}.build.json`);
  const said = existsSync(info) ? readJson<{ voice?: { provider?: string } }>(info).voice?.provider : (raw?.voice?.provider ?? raw?.voice?.engine);
  const provider: VoiceProvider = said === "elevenlabs" ? "elevenlabs" : "kokoro";
  for (const l of lines) l.provider = provider;
  // the same resolver input as the build → project.json beats are those of the build (the rest of project.json is not known)
  let hash: string | null = null;
  try {
    if (raw?.beats && resolverInputHash(raw.beats as unknown as BeatSpec[]) === expanded.inputHash) hash = projectHashOf(projectDir);
  } catch {
    hash = null;
  }
  const rawShaders = Array.isArray((raw as { transitions?: unknown } | null)?.transitions) ? shaderList((raw as unknown as VideoSpec).transitions) : [];
  let grid: MusicGrid | null = null;
  if (music) {
    const g = cachedTrackBeats(join(ROOT_DIR, music.file));
    if (g) grid = { track: music.track, bpm: g.bpm, ...loopGrid(g, music.start, music.end) };
  }
  return { id: plan.id, fps: plan.fps, hash, builtAt, provider, cached: null, beats: expanded.beats, lines, words, devices: expanded.beats.map(() => null), grid, transitions: [...planned, ...rawShaders], music: snapMusic, groupModes, warnings };
}

// ── the map ──────────────────────────────────────────────────────────────────────────────────────

interface ComposeInput {
  id: string;
  fps: number;
  estimated: boolean;
  source: Timeline["source"];
  voice: Timeline["voice"];
  beats: BeatSpec[];
  raw: Record<string, unknown>[] | null;
  lines: TimingLine[];
  words: Words[];
  lineEstimated: boolean[];
  devices: (DeviceMoment[] | null)[];
  grid: MusicGrid | null;
  transitions: PlainTransition[];
  music: Snapshot["music"];
  groupModes: Record<string, string>;
  warnings: string[];
}

/** Moments of the devices of a beat from its words: the same code as the build (deviceMoments); an error leaves a default moment and a warning. */
function countDevices(beat: BeatSpec, timing: BeatTiming, words: Words, grid: MusicGrid | null, warnings: string[]): DeviceMoment[] {
  const clock = clockOf(timing, full(words), grid);
  return (beat.devices ?? []).map((dev, index) => {
    const where = `${beat.id}: devices[${index}] (${dev.type})`;
    try {
      const params = deviceParams(loadDevice(dev.type, where), dev.params, where);
      const m = deviceMoments(dev, index, params, clock, where, beat.sync);
      return { index, type: dev.type, at: m.at, until: m.until };
    } catch (err) {
      warnings.push(msg(err));
      return { index, type: dev.type, at: r3(Math.max(0, Math.min(timing.speechStart + 0.2 * index, timing.duration - 0.1))), until: null };
    }
  });
}

function atFieldOf(raw: Record<string, unknown>[] | null, beatId: string, index: number): string | null {
  const rb = raw?.find((b) => b.id === beatId);
  if (!rb) return null;
  const devs = rb.devices;
  if (Array.isArray(devs) && devs[index] && (devs[index] as Record<string, unknown>).at !== undefined) return `devices[${index}].at`;
  return rb.at !== undefined ? "at" : null;
}

/** Caption tokens → word references of engine/src/timeline.ts wordTime: the first spoken word of the token, its n-th occurrence in the line. */
function wordRefs(w: Words): { ref: string; refEnd: string }[] {
  const seen = new Map<string, number>();
  const name = w.spoken.map((s) => {
    const n = (seen.get(s.word) ?? 0) + 1;
    seen.set(s.word, n);
    return n > 1 ? `${s.word}#${n}` : s.word;
  });
  const groups: number[][] = [];
  w.spoken.forEach((s, q) => {
    const prev = w.spoken[q - 1];
    if (!prev || prev.token !== s.token) groups.push([]);
    (groups[groups.length - 1] as number[]).push(q);
  });
  return groups.map((g) => ({ ref: name[g[0] as number] as string, refEnd: `${name[g[g.length - 1] as number]}.end` }));
}

const targetText = (t: unknown): string | null => (t === undefined || t === null ? null : typeof t === "string" ? t : JSON.stringify(t));

function compose(input: ComposeInput): Timeline {
  const { beats, lines, words, warnings } = input;
  const timings = beatTimings(lines);
  const total = timings.length ? (timings[timings.length - 1] as BeatTiming).end : 0;
  const at = (i: number): BeatTiming => timings[i] as BeatTiming;

  const outBeats: TimelineBeat[] = beats.map((beat, i) => {
    const t = at(i);
    const pad = (lines[i] as TimingLine).pad;
    return {
      id: beat.id,
      number: i + 1,
      start: t.start,
      end: t.end,
      speechStart: r3(t.start + t.speechStart),
      speechEnd: r3(t.start + t.speechEnd),
      line: beat.text,
      tts: parseBeatText(beat.text).tts,
      stage: beat.scene ?? beat.stage?.type ?? beat.recipe ?? "?",
      intent: beat.intent ?? null,
      hold: { value: pad[1], min: HOLD.min, max: HOLD.max, field: HOLD.field },
      lead: { value: pad[0], field: "pad[0]" },
      duration: t.duration,
      estimated: input.lineEstimated[i] ?? false,
    };
  });

  const outWords: TimelineWord[] = [];
  const groups: { start: number; end: number; words: TimelineWord[]; beat: string }[] = [];
  beats.forEach((beat, i) => {
    const t = at(i);
    const refs = wordRefs(words[i] as Words);
    const toks = ((words[i] as Words).tokens ?? []).map((k, q) => ({ text: k.text, start: r3(t.start + k.start), end: r3(t.start + k.end), bit: beat.id, ref: refs[q]?.ref ?? null, refEnd: refs[q]?.refEnd ?? null }));
    outWords.push(...toks);
    for (const part of groupTokens(toks, input.groupModes[beat.id] ?? "phrase")) groups.push({ start: (part[0] as TimelineWord).start, end: 0, words: part as TimelineWord[], beat: beat.id });
  });
  closeCaptionGroups(groups, total);

  const devices: TimelineDevice[] = [];
  beats.forEach((beat, i) => {
    const t = at(i);
    const moments = input.devices[i] ?? countDevices(beat, t, words[i] as Words, input.grid, warnings);
    for (const m of moments) {
      const dev = beat.devices?.[m.index];
      devices.push({
        bit: beat.id,
        index: m.index,
        type: m.type,
        at: r3(t.start + m.at),
        duration: r3(Math.max(0, (m.until ?? t.duration) - m.at)),
        until: m.until === null ? null : r3(t.start + m.until),
        target: targetText(dev?.target),
        atRaw: dev?.at ?? null,
        atField: atFieldOf(input.raw, beat.id, m.index),
      });
    }
  });

  const transitions: TimelineTransition[] = input.transitions
    .flatMap((tr) => {
      const to = timings.find((t) => t.id === tr.to);
      return to && timings.some((t) => t.id === tr.from) ? [{ ...tr, start: to.start }] : [];
    })
    .sort((a, b) => a.start - b.start);

  let music: TimelineMusic | null = null;
  if (input.music) {
    const gain = r3(10 ** (input.music.duck / 20));
    music = {
      track: input.music.file,
      id: input.music.track,
      offset: r3(input.music.offset),
      offsetRaw: input.music.offsetRaw,
      offsetField: MUSIC_OFFSET_FIELD,
      bpm: input.grid?.bpm ?? null,
      beats: input.grid?.beats ?? [],
      strong: input.grid?.strong ?? [],
      duckDb: input.music.duck,
      duck: timings.map((t) => ({ start: r3(t.start + t.speechStart), end: r3(t.start + t.speechEnd), gain })),
    };
  }

  return {
    version: TIMELINE_VERSION,
    id: input.id,
    estimated: input.estimated,
    duration: total,
    fps: input.fps,
    source: input.source,
    voice: input.voice,
    beats: outBeats,
    words: outWords,
    captions: groups.map((g) => ({ text: g.words.map((w) => w.text).join(" "), start: g.start, end: g.end, beat: g.beat })),
    devices,
    transitions,
    music,
    warnings: [...new Set(warnings)],
  };
}

function fromSnapshot(projectDir: string, snap: Snapshot): Timeline {
  return compose({
    id: snap.id,
    fps: snap.fps,
    estimated: false,
    source: { projectHash: snap.hash, builtAt: snap.builtAt },
    voice: { provider: snap.provider, cached: snap.cached },
    beats: snap.beats,
    raw: readRaw(projectDir)?.beats ?? null,
    lines: snap.lines,
    words: snap.words,
    lineEstimated: snap.beats.map(() => false),
    devices: snap.devices,
    grid: snap.grid,
    transitions: snap.transitions,
    music: snap.music,
    groupModes: snap.groupModes,
    warnings: [...snap.warnings],
  });
}

/** The map of the last build → build/timeline.json. The build calls it after index.html; `hygen timeline` — on an existing build/. */
export function buildTimeline(videoDir: string): Timeline {
  const snap = loadBuild(videoDir, true);
  if (!snap) fail(`${relative(ROOT_DIR, videoDir)}: в build/ нет готовой сборки — карта строится после build (или hygen timeline --read — оценка по project.json)`);
  const tl = fromSnapshot(videoDir, snap);
  writeJson(join(videoDir, "build", "timeline.json"), tl);
  return tl;
}

/**
 * The map of project.json as it is now, over the last build when there is one: a beat with the same line keeps its real
 * words (shifted to its current lead; another provider scales them by characters per second), its clip is re-laid with
 * the current pad; a new or edited line is estimated by characters. Devices, music and captions follow the current file.
 */
function estimateTimeline(projectDir: string, raw: RawProject, hash: string, old: Snapshot | null): Timeline {
  const spec = loadSpec(projectDir);
  const cps = loadConfig().voice.charsPerSecond;
  const provider = resolveVoice(spec).provider;
  const warnings: string[] = old ? old.warnings.filter((w) => !w.startsWith("сборка старым движком")) : [];
  const lines: TimingLine[] = [];
  const words: Words[] = [];
  const lineEstimated: boolean[] = [];
  for (const beat of spec.beats) {
    const k = old ? old.lines.findIndex((l) => l.beatId === beat.id) : -1;
    const ol = old && k >= 0 ? (old.lines[k] as TimingLine) : null;
    const ow = old && k >= 0 ? (old.words[k] as Words | undefined) : undefined;
    const lead = r3(beat.pad[0]);
    if (ol && ow && ol.text === beat.text) {
      const scale = ol.provider === provider ? 1 : cps[ol.provider] / cps[provider];
      if (scale === 1 && ol.pad[0] === beat.pad[0] && ol.pad[1] === beat.pad[1]) {
        lines.push(ol);
        words.push(ow);
        lineEstimated.push(false);
        continue;
      }
      const speech = (ol.speechEnd - ol.speechStart) * scale;
      const move = (t: number): number => r3(Math.max(0, lead + (t - ol.speechStart) * scale));
      lines.push({ ...ol, pad: beat.pad, provider, duration: clipLength(lead, speech, beat.pad[1], spec.fps), speechStart: lead, speechEnd: r3(lead + speech) });
      words.push({ beatId: beat.id, tokens: ow.tokens.map((t) => ({ ...t, start: move(t.start), end: move(t.end) })), spoken: ow.spoken.map((w) => ({ ...w, start: move(w.start), end: move(w.end) })) });
      lineEstimated.push(scale !== 1);
      continue;
    }
    const speech = parseBeatText(beat.text).tts.length / cps[provider];
    lines.push({ beatId: beat.id, text: beat.text, pad: beat.pad, duration: clipLength(lead, speech, beat.pad[1], spec.fps), speechStart: lead, speechEnd: r3(lead + speech), cached: false, provider });
    words.push(estimateWords(beat, lead, lead + speech));
    lineEstimated.push(true);
  }
  const timings = beatTimings(lines);
  const total = (timings[timings.length - 1] as BeatTiming).end;
  const beatWords = words.map(full);

  let look: LookDef | null = null;
  let style: StyleDef | null = null;
  try {
    look = loadLook(spec.look);
    style = loadStyle(spec.style);
  } catch (err) {
    warnings.push(`look/style: ${msg(err)}`);
  }

  let music: Snapshot["music"] = null;
  let grid: MusicGrid | null = null;
  const track = style ? musicTrack(spec, style, projectDir) : null;
  if (track && style) {
    const own = spec.music || undefined;
    const tok = (style as unknown as { music?: Partial<MusicTokens> }).music;
    let span = { start: 0, end: total };
    try {
      span = musicSpan(spec, timings, beatWords);
    } catch (err) {
      warnings.push(`music.in/out: ${msg(err)}`);
    }
    music = { track: track.track, file: relative(ROOT_DIR, track.file), offset: span.start, offsetRaw: own?.in ?? null, duck: own?.duck ?? tok?.duck ?? -12 };
    const g = existsSync(track.file) ? cachedTrackBeats(track.file) : null;
    if (g) grid = { track: track.track, bpm: g.bpm, ...loopGrid(g, span.start, span.end) };
    else warnings.push(`музыка ${track.track}: сетка битов ещё не посчитана — биты появятся после сборки`);
  }

  let transitions: PlainTransition[] = [];
  if (look) {
    try {
      const heavy = spec.sound.hits.filter((h) => h.heavy).flatMap((h) => {
        try {
          return [resolveTime(h.at, timings, beatWords)];
        } catch {
          return [];
        }
      });
      transitions = planTransitions(spec, look, timings, heavy).map((p) => ({ from: p.fromBeat, to: p.toBeat, type: p.list.join("+"), list: p.list, duration: p.dur }));
    } catch (err) {
      warnings.push(`переходы: ${msg(err)}`);
    }
  }
  transitions.push(...shaderList(spec.transitions));

  const groupModes: Record<string, string> = {};
  for (const beat of spec.beats) {
    try {
      groupModes[beat.id] = look ? captionStyleOf(look, spec, beat).group : (old?.groupModes[beat.id] ?? "phrase");
    } catch {
      groupModes[beat.id] = old?.groupModes[beat.id] ?? "phrase";
    }
  }

  return compose({
    id: spec.id,
    fps: spec.fps,
    estimated: true,
    source: { projectHash: hash, builtAt: old?.builtAt ?? null },
    voice: { provider, cached: null },
    beats: spec.beats,
    raw: raw.beats ?? null,
    lines,
    words,
    lineEstimated,
    devices: spec.beats.map(() => null),
    grid,
    transitions,
    music,
    groupModes,
    warnings,
  });
}

function emptyTimeline(projectDir: string, raw: RawProject, hash: string): Timeline {
  const p = raw.voice?.provider ?? raw.voice?.engine;
  return {
    version: TIMELINE_VERSION,
    id: raw.id ?? basename(projectDir),
    estimated: true,
    duration: 0,
    fps: raw.fps ?? 30,
    source: { projectHash: hash, builtAt: null },
    voice: { provider: p === "elevenlabs" ? "elevenlabs" : "kokoro", cached: null },
    beats: [],
    words: [],
    captions: [],
    devices: [],
    transitions: [],
    music: null,
    warnings: [],
  };
}

/**
 * The map for the panel (GET /api/projects/:id/timeline): build/timeline.json when project.json is the one it was built
 * from; the last build projected onto the current project.json when it changed; an estimate by characters when there is
 * no build. A project without beats is an empty map.
 */
export function readTimeline(projectDir: string): Timeline {
  if (!existsSync(join(projectDir, "project.json"))) fail(`нет ${relative(ROOT_DIR, join(projectDir, "project.json"))}`);
  const hash = projectHashOf(projectDir);
  const raw = readJson<RawProject>(join(projectDir, "project.json"));
  if (!Array.isArray(raw.beats) || raw.beats.length === 0) return emptyTimeline(projectDir, raw, hash);
  const saved = join(projectDir, "build", "timeline.json");
  if (existsSync(saved)) {
    try {
      const tl = readJson<Timeline>(saved);
      // a map written before words had refs is recomposed from the same build
      if (tl.version === TIMELINE_VERSION && tl.source?.projectHash === hash && (!tl.words.length || "ref" in (tl.words[0] as TimelineWord))) return tl;
    } catch {
      // a torn file: the build is writing it right now
    }
  }
  const snap = loadBuild(projectDir, false);
  if (snap && snap.hash === hash) return fromSnapshot(projectDir, snap);
  return estimateTimeline(projectDir, raw, hash, snap);
}

/**
 * «Изменено, пересоберите» for the project card: build/timeline.json exists and project.json is no longer the file it was
 * built from. Only the head of the map is read (source sits near the top); no map — false.
 */
export function timelineChanged(projectDir: string): boolean {
  const file = join(projectDir, "build", "timeline.json");
  if (!existsSync(file) || !existsSync(join(projectDir, "project.json"))) return false;
  const buf = Buffer.alloc(4096);
  const fd = openSync(file, "r");
  let n = 0;
  try {
    n = readSync(fd, buf, 0, buf.length, 0);
  } finally {
    closeSync(fd);
  }
  const m = /"projectHash":\s*(null|"([0-9a-f]{40})")/.exec(buf.toString("utf8", 0, n));
  if (!m) return false;
  return m[2] === undefined || m[2] !== projectHashOf(projectDir);
}

export function timelineSummary(tl: Timeline): string {
  const moved = tl.beats.filter((b) => b.estimated).length;
  return (
    `карта ${tl.id}: ${tl.duration.toFixed(2)} с · битов ${tl.beats.length}${tl.estimated ? ` (оценка${moved ? `, по символам ${moved}` : ""})` : ""} · слов ${tl.words.length} · субтитров ${tl.captions.length} · ` +
    `устройств ${tl.devices.length} · переходов ${tl.transitions.length} · музыка ${tl.music ? `${tl.music.id} с ${tl.music.offset} с, битов ${tl.music.beats.length}` : "нет"} · голос ${tl.voice.provider}` +
    (tl.warnings.length ? `\n  ! ${tl.warnings.join("\n  ! ")}` : "")
  );
}
