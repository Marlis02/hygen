import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkTransitionRef } from "./motion.ts";
import type { TextureRef } from "./textures.ts";
import { ENGINE_DIR, fail, readJson } from "./lib/util.ts";

/** One beat = one voice line + one library scene (engine/scenes/CONTRACT.md). */
export interface BeatSpec {
  id: string;
  /** Library scene id: engine/scenes/<scene>/. */
  scene: string;
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
  /** Textures over this beat only, on top of the look's (engine/textures). */
  textures?: TextureRef[];
  /** Licensed image or video under the scene: {image|video, treatment, focus, opacity, depth, blend}. */
  background?: Record<string, unknown>;
  /** Type preset for the scene's text slots: one name for all, or slot → preset (engine/motion/type.json). */
  type?: string | Record<string, string>;
  /** Engine camera for this beat: preset name or {preset, amplitude, shake} over the look's. */
  camera?: unknown;
  /** Post effects of this beat, on top of the look's: [{id, strength}]. */
  post?: unknown[];
  /** Transition into this beat: id or list of ids (overrides the look's default and hit transitions). */
  transition?: unknown;
}

export interface TransitionSpec {
  from: string;
  to: string;
  /** Library transitions over the cut (engine/transitions): "flash", ["flash", "ash-burst"], "flash+ash-burst"; or "shader" — WebGL HyperShader (the render drops to one worker). */
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

export interface VideoSpec {
  id: string;
  title: string;
  format: string;
  fps: number;
  language: string;
  style: string;
  /** Look: id from engine/looks or an inline object {extends, palette, textures, motion, …}; none — ember. */
  look?: unknown;
  captions: string;
  voice: { engine: "kokoro"; voice: string; speed: number };
  beats: BeatSpec[];
  transitions: TransitionSpec[];
  sound: { drone: DroneSpec; ash?: AshSpec; hits: HitSpec[] };
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
  const path = join(videoDir, "video.json");
  if (!existsSync(path)) fail(`нет ${path}`);
  const spec = readJson<VideoSpec>(path);
  const need = (cond: unknown, msg: string): void => {
    if (!cond) fail(`video.json: ${msg}`);
  };
  need(typeof spec.id === "string" && /^[a-z0-9-]+$/.test(spec.id), "id — строчная латиница, цифры и дефис");
  need(/^\d+x\d+$/.test(spec.format ?? ""), "format вида 1080x1920");
  need(Number.isInteger(spec.fps) && spec.fps > 0, "fps — целое число");
  need(spec.voice?.engine === "kokoro", "voice.engine: пока поддерживается только kokoro");
  need(Array.isArray(spec.beats) && spec.beats.length > 0, "нет битов");
  spec.language = spec.language ?? "en";
  spec.style = spec.style ?? "documentary-dark";
  spec.captions = spec.captions ?? "word-by-word";
  need(existsSync(join(ENGINE_DIR, "styles", spec.style, "style.json")) && existsSync(join(ENGINE_DIR, "styles", spec.style, "frame.md")), `нет стиля engine/styles/${spec.style} (style.json и frame.md)`);
  need(existsSync(join(ENGINE_DIR, "captions", `${spec.captions}.html`)), `нет пресета субтитров engine/captions/${spec.captions}.html`);
  const ids = new Set<string>();
  for (const beat of spec.beats) {
    need(beat.id && !ids.has(beat.id), `пустой или повторный id бита «${beat.id}»`);
    ids.add(beat.id);
    need(/^[0-9a-z][a-z0-9-]*$/.test(beat.id ?? ""), `id бита «${beat.id}» — строчная латиница, цифры и дефис`);
    need(existsSync(join(ENGINE_DIR, "scenes", beat.scene ?? "", "scene.json")), `${beat.id}: нет сцены engine/scenes/${beat.scene}/scene.json`);
    need(typeof beat.text === "string" && beat.text.trim().length > 0, `${beat.id}: пустой text`);
    need(beat.tone === undefined || beat.tone === "accent" || beat.tone === "cold", `${beat.id}: tone — accent или cold`);
    need(beat.seed === undefined || Number.isInteger(beat.seed), `${beat.id}: seed — целое`);
    const known = new Set(["id", "scene", "text", "pad", "tone", "seed", "params", "anchors", "cues", "sources", "textures", "background", "type", "camera", "post", "transition"]);
    for (const key of Object.keys(beat)) need(known.has(key), `${beat.id}: неизвестное поле «${key}»`);
    beat.pad = beat.pad ?? [0.2, 0.4];
  }
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
