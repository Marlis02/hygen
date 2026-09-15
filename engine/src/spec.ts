import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DeviceSpec } from "./devices.ts";
import { expandBeat } from "./intents.ts";
import { checkTransitionRef } from "./motion.ts";
import type { TextureRef } from "./textures.ts";
import { LIBRARY_DIR, fail, readJson } from "./lib/util.ts";

export const isHtmlScene = (id: string): boolean => existsSync(join(LIBRARY_DIR, "scenes", id, "scene.json"));

/** One beat = one voice line + either a library scene (HTML recipe) or a stage with devices (library/scenes/CONTRACT.md, «Бит v2»). */
export interface BeatSpec {
  id: string;
  /** Library scene id (library/scenes/<scene>/scene.html) or a JSON recipe (library/scenes/recipes/<scene>.json). */
  scene?: string;
  /** What the viewer must see — an intent from library/intents/ that the resolver expands into stage + devices. */
  intent?: string;
  /** Set by the resolver: the JSON recipe this stage beat came from. */
  recipe?: string;
  /** The base of the frame: exactly one of media | split | map | color. */
  stage?: { type: string; [key: string]: unknown };
  /** 0–3 devices over the stage (library/devices/<type>). */
  devices?: DeviceSpec[];
  /** What leads the frame: "stage" or the index of one device. */
  dominant?: "stage" | number;
  /** Shorthand for an intent or a recipe: the target region, the anchor word and the data of its devices. */
  target?: unknown;
  at?: number | string;
  data?: Record<string, unknown>;
  /** Role of the beat in the arc structure (library/arcs/<structure>.json). */
  role?: string;
  /** Narration. `[display|spoken]` shows `display` in captions while the voice says `spoken`. */
  text: string;
  /** Silence before and after the line, seconds — part of the scene's timing. */
  pad: [number, number];
  tone?: "accent" | "cold";
  seed?: number;
  /** Scene params (scene.json → params); missing ones take the scene default. */
  params?: Record<string, unknown>;
  /** Scene anchor → word of this line: "word", "word#2" (2nd occurrence), "word.end". */
  anchors?: Record<string, string>;
  /** Low-level: reference time in the scene → word of this line. */
  cues?: Record<string, string>;
  /** Figure param (or "text") → source link. */
  sources?: Record<string, string>;
  /** Textures over this beat only, on top of the look's (library/textures). */
  textures?: TextureRef[];
  /** Licensed image or video under the scene: {image|video, treatment, focus, opacity, depth, blend}. */
  background?: Record<string, unknown>;
  /** Type preset for the scene's text slots: one name for all, or slot → preset (library/motion/type.json). */
  type?: string | Record<string, string>;
  /** Engine camera for this beat: preset name or {preset, amplitude, shake} over the look's. */
  camera?: unknown;
  /** Post effects of this beat, on top of the look's: [{id, strength}]. */
  post?: unknown[];
  /** Transition into this beat: id or list of ids (overrides the look's default and hit transitions). */
  transition?: unknown;
  /** Captions of this beat over the video's (library/devices/text.caption): {preset, group, activeWord, type, font, size, case, color, background, position}. */
  caption?: Record<string, unknown>;
  /** Rhythm of the beat's devices: voice (the words, default) | music (beats of the track) | both. */
  sync?: string;
  /** What the viewer must see — one sentence of the director before the intent (research.md «Beats»). */
  sees?: string;
}

export interface TransitionSpec {
  from: string;
  to: string;
  /** Library transitions over the cut (library/transitions): "flash", ["flash", "ash-burst"], "flash+ash-burst"; or "shader" — WebGL HyperShader (the render drops to one worker). */
  type?: string | string[];
  shader?: string;
  duration: number;
  ease: string;
  /** Normalized ids of the library transitions (empty for a shader). */
  list: string[];
}

/** Time references: "<beat>:start|end|speechStart|speechEnd|<word>[#n][.end][±seconds]". */
export interface DroneSpec {
  peak: string;
  cut: string;
  volume: number;
  carve?: number;
}

export interface AshSpec {
  at: string;
  until: string;
  swell: string;
  debris: string;
  volume: number;
  carve?: number;
}

export interface HitSpec {
  at: string;
  heavy?: boolean;
  volume: number;
  carve?: number;
}

/** Arc v2 (library/arcs): structure × hook × protagonist × ending. */
export interface ArcSpec {
  structure: string;
  hook: string;
  protagonist: string;
  ending: string;
  why?: string;
}

/** Voice of the video: {provider: kokoro | elevenlabs, voiceId, model}; the old form {engine: "kokoro", voice, speed} still works. */
export interface VoiceSpec {
  provider?: string;
  voiceId?: string;
  model?: string;
  engine?: string;
  voice?: string;
  speed?: number;
}

export interface VideoSpec {
  id: string;
  title: string;
  /** draft | built | verified | published — the card of the project in the studio. */
  status?: string;
  /** A proof project (capabilities, not for upload). */
  proof?: boolean;
  /** Concept of the director: mood, key colour, look, textures (research.md «Concept»). */
  concept?: string;
  publishedAt?: string;
  arc?: ArcSpec;
  /** Id of the video this one re-tells in the same world (a proof or a remake): colour uniqueness is not checked against it. */
  retells?: string;
  format: string;
  fps: number;
  language: string;
  style: string;
  /** Look: id from library/looks or an inline object {extends, palette, textures, motion, …}; none — ember. */
  look?: unknown;
  /** Captions of the video over the look's defaults: {preset, group, activeWord, type, font, size, case, color, background, position}; the old string "word-by-word" is ignored. */
  captions?: string | Record<string, unknown>;
  voice?: VoiceSpec;
  beats: BeatSpec[];
  transitions: TransitionSpec[];
  /** events: false — only the hand-set hits of this file (Pompeii, the reference); default — sounds from device, scene and transition events too. */
  sound: { drone: DroneSpec; ash?: AshSpec; hits: HitSpec[]; events?: boolean };
  /** Music bed: false — none (Pompeii); absent — the style's first track; or {track, volume, duck, fadeIn, fadeOut, in, out} (library/music/MUSIC.md). */
  music?: false | { track?: string; gain?: number; volume?: number; duck?: number; fadeIn?: number; fadeOut?: number; in?: string; out?: string };
}

export interface Token {
  display: string;
  spoken: string[];
}

/** Lowercase words without punctuation; hyphens split ("forty-eight" → forty, eight), "A.D." → "ad". */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[-‐‑‒–—―]/g, " ")
    .replace(/[^a-z0-9'\s]/g, "")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

const TOKEN_RE = /\[([^\]|]+)\|([^\]]+)\]([^\s[]*)|(\S+)/g;

export function parseBeatText(text: string): { tts: string; tokens: Token[] } {
  const tokens: Token[] = [];
  const tts: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m[4] !== undefined) {
      tts.push(m[4]);
      tokens.push({ display: m[4], spoken: normalizeWords(m[4]) });
      continue;
    }
    const tail = m[3] ?? "";
    tts.push((m[2] ?? "").trim() + tail);
    tokens.push({ display: (m[1] ?? "").trim() + tail, spoken: normalizeWords(m[2] ?? "") });
  }
  return { tts: tts.join(" "), tokens };
}

export function loadSpec(videoDir: string): VideoSpec {
  const path = join(videoDir, "project.json");
  if (!existsSync(path)) fail(`нет ${path}`);
  const spec = readJson<VideoSpec>(path);
  const need = (cond: unknown, msg: string): void => {
    if (!cond) fail(`project.json: ${msg}`);
  };
  need(typeof spec.id === "string" && /^[a-z0-9-]+$/.test(spec.id), "id — строчная латиница, цифры и дефис");
  need(/^\d+x\d+$/.test(spec.format ?? ""), "format вида 1080x1920");
  need(Number.isInteger(spec.fps) && spec.fps > 0, "fps — целое число");
  need(spec.voice === undefined || (typeof spec.voice === "object" && [undefined, "kokoro", "elevenlabs"].includes(spec.voice.provider ?? spec.voice.engine)), "voice: {provider: kokoro | elevenlabs, voiceId, model} (старая форма {engine: kokoro, voice, speed} тоже работает)");
  need(Array.isArray(spec.beats) && spec.beats.length > 0, "нет битов");
  spec.language = spec.language ?? "en";
  spec.style = spec.style ?? "documentary-dark";
  need(existsSync(join(LIBRARY_DIR, "styles", spec.style, "style.json")) && existsSync(join(LIBRARY_DIR, "styles", spec.style, "frame.md")), `нет стиля library/styles/${spec.style} (style.json и frame.md)`);
  need(spec.captions === undefined || typeof spec.captions === "string" || (typeof spec.captions === "object" && spec.captions !== null && !Array.isArray(spec.captions)), "captions — объект {preset, group, activeWord, …} (строка — старая форма, не действует)");
  const ids = new Set<string>();
  for (const beat of spec.beats) {
    need(beat.id && !ids.has(beat.id), `пустой или повторный id бита «${beat.id}»`);
    ids.add(beat.id);
    need(/^[0-9a-z][a-z0-9-]*$/.test(beat.id ?? ""), `id бита «${beat.id}» — строчная латиница, цифры и дефис`);
    need(beat.scene !== undefined || beat.stage !== undefined || beat.intent !== undefined, `${beat.id}: нужен scene (сцена или рецепт), stage или intent`);
    need(typeof beat.text === "string" && beat.text.trim().length > 0, `${beat.id}: пустой text`);
    need(beat.tone === undefined || beat.tone === "accent" || beat.tone === "cold", `${beat.id}: tone — accent или cold`);
    need(beat.seed === undefined || Number.isInteger(beat.seed), `${beat.id}: seed — целое`);
    const known = new Set(["id", "scene", "text", "pad", "tone", "seed", "params", "anchors", "cues", "sources", "textures", "background", "type", "camera", "post", "transition", "intent", "stage", "devices", "dominant", "target", "at", "data", "role", "caption", "sync", "sees"]);
    for (const key of Object.keys(beat)) need(known.has(key), `${beat.id}: неизвестное поле «${key}»`);
    beat.pad = beat.pad ?? [0.2, 0.4];
  }
  // intents and JSON recipes → stage + devices (engine/src/intents.ts); scene beats with an HTML scene stay as they are
  spec.beats = spec.beats.map((beat) => expandBeat(beat, isHtmlScene));
  spec.transitions = spec.transitions ?? [];
  for (const tr of spec.transitions) {
    need(ids.has(tr.from) && ids.has(tr.to), `переход ${tr.from} → ${tr.to}: нет таких битов`);
    if (tr.shader !== undefined || tr.type === "shader") {
      need(typeof tr.shader === "string", `переход ${tr.from} → ${tr.to}: type shader с именем шейдера`);
      tr.type = "shader";
      tr.list = [];
    } else {
      tr.list = checkTransitionRef(tr.type ?? "flash", `переход ${tr.from} → ${tr.to}`);
    }
    need(typeof tr.duration === "number" && tr.duration > 0, `переход ${tr.from} → ${tr.to}: duration > 0`);
    tr.ease = tr.ease ?? "power2.inOut";
  }
  need(spec.sound?.drone, "sound.drone обязателен");
  spec.sound.hits = spec.sound.hits ?? [];
  return spec;
}
