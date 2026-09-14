import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { SceneDef, StyleDef, TextSlot } from "./contract.ts";
import { checkLicense, loadScene, toneColors } from "./contract.ts";
import type { LookDef } from "./look.ts";
import type { CameraSpec, PostSpec } from "./motion.ts";
import { checkCamera, checkPost, checkTransitionRef, checkTypeMap, transitionIds, typePresets } from "./motion.ts";
import type { BeatSpec, VideoSpec } from "./spec.ts";
import type { Depth, TextureRef } from "./textures.ts";
import { BLENDS, DEPTH_Z, checkTextureRefs, renderTexture, resolveTexture } from "./textures.ts";
import { ENGINE_DIR, ROOT_DIR, copyInto, ensureDir, fail, fileSha, pyScript, python, r3, readJson, run, sha } from "./lib/util.ts";

// Video-level layers over the scenes: texture sub-compositions, media backgrounds, the engine camera and
// parallax, post effects, transitions over the cuts and the type presets injected into scenes. Shared by the
// build (index.html) and the scene preview; played by engine/motion/runtime.js.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const rgbStr = (hex: string): string => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

// ── textures ─────────────────────────────────────────────────────────────────────────────────────

export interface LayerSpan {
  beatId: string;
  start: number;
  duration: number;
  textures?: TextureRef[];
  /** A word of this beat → seconds inside the beat (texture cues such as lightning strikes). */
  word?: (ref: string) => number;
}

export interface TextureLayer {
  id: string;
  texture: string;
  start: number;
  duration: number;
  z: number;
  blend: string;
  opacity: number;
  /** Parallax factor under the engine camera. */
  depth: number;
  src: string;
  events: { t: number; label: string; sound?: string }[];
}

export function depthFactor(depth: Depth | number, look: LookDef): number {
  if (typeof depth === "number") return depth;
  const p = look.motion.parallax;
  return depth === "bg" ? p.bg : depth === "fg" ? p.fg : p.mid;
}

const depthName = (depth: Depth | number): Depth => (typeof depth !== "number" ? depth : depth < 0.55 ? "bg" : depth > 1.1 ? "fg" : "mid");

/**
 * Grain (the style's film grain × look.grain), the look's textures over the whole video and each beat's own
 * textures over its clip → compositions/layers/<id>.html. Times are seconds of the video.
 */
export function writeTextureLayers(input: { look: LookDef; style: StyleDef; dir: string; total: number; spans: LayerSpan[]; hits: number[] }): TextureLayer[] {
  const { look, style, dir, total, spans, hits } = input;
  ensureDir(join(dir, "compositions", "layers"));
  const layers: TextureLayer[] = [];
  const add = (ref: TextureRef, start: number, duration: number, where: string, word?: (ref: string) => number): void => {
    const id = `tx-${ref.id}-${layers.length}`;
    const cue = (c: string): number[] => {
      if (c === "hits") return hits.filter((h) => h >= start - 0.01 && h < start + duration).map((h) => r3(Math.max(0, h - start)));
      if (c === "start") return [0];
      if (/^-?\d+(\.\d+)?$/.test(c)) return [Number(c)];
      if (!word) return fail(`${where}: «${c}» — у текстуры ролика нет слов; hits, start или секунды`);
      const m = /^(.+?)([+-]\d+(?:\.\d+)?)?$/.exec(c) as RegExpExecArray;
      return [r3(word(m[1] as string) + Number(m[2] ?? 0))];
    };
    const res = resolveTexture(ref, style, where, cue);
    const src = `compositions/layers/${id}.html`;
    writeFileSync(join(dir, src), renderTexture(res, id, duration, style));
    layers.push({
      id,
      texture: ref.id,
      start: r3(start),
      duration: r3(duration),
      z: res.def.layer.z ?? DEPTH_Z[depthName(res.depth)],
      blend: res.blend,
      opacity: res.opacity,
      depth: depthFactor(res.depth, look),
      src,
      events: res.def.events.flatMap((ev) => ((res.params[ev.param] as number[] | undefined) ?? []).map((t) => ({ t: r3(start + t), label: ev.label, sound: ev.sound }))),
    });
  };
  if (look.grain > 0) add({ id: "grain", dark: style.grain.dark, light: style.grain.light }, 0, total, "grain");
  look.textures.forEach((ref, i) => add(ref, 0, total, `look ${look.id}: textures[${i}]`));
  for (const span of spans) (span.textures ?? []).forEach((ref, i) => add(ref, span.start, span.duration, `${span.beatId}: textures[${i}]`, span.word));
  return layers;
}

/** Hosts of the texture layers for the root composition (each on its own track, above the scenes). */
export function layerHostsHtml(layers: TextureLayer[], trackBase = 20): string {
  return layers
    .map((l, i) => {
      const style = [`position: absolute`, `left: 0`, `top: 0`, `width: 1080px`, `height: 1920px`, `pointer-events: none`, `z-index: ${l.z}`];
      if (l.blend !== "normal") style.push(`mix-blend-mode: ${l.blend}`);
      if (l.opacity !== 1) style.push(`opacity: ${l.opacity}`);
      return `\n      <div id="el-${l.id}" class="hy-layer" data-composition-id="${l.id}" data-composition-src="${l.src}" data-start="${l.start}" data-duration="${l.duration}" data-track-index="${trackBase + i}" style="${style.join("; ")}" aria-hidden="true" data-layout-ignore></div>`;
    })
    .join("");
}

/** The style's vignette (colour, clear radius and strength come from the look). */
export function vignetteCss(style: StyleDef): string {
  const colors = toneColors(style, "accent");
  const rgb = [1, 3, 5].map((i) => parseInt((colors[style.vignette.color] as string).slice(i, i + 2), 16)).join(", ");
  return `#hf-vignette { position: absolute; inset: 0; pointer-events: none; z-index: 30;
        background: radial-gradient(ellipse 78% 64% at 50% 42%, rgba(${rgb}, 0) ${style.vignette.clear}%, rgba(${rgb}, ${style.vignette.alpha}) 100%); }`;
}

// ── beat motion: camera, post, type ──────────────────────────────────────────────────────────────

/** A stage beat moves the camera only for a reason; the reason picks the preset when none is given. */
const REASON_PRESET: Record<string, string> = { approach: "push-in", reveal: "pull-out", follow: "pan", tension: "handheld" };

export function beatCamera(beat: Pick<BeatSpec, "id" | "camera" | "scene">, look: LookDef): CameraSpec {
  const base = look.motion.camera;
  if (beat.scene === undefined) {
    if (beat.camera === undefined) return { preset: "none", amplitude: 0, shake: 0 };
    checkCamera(beat.camera, `${beat.id}: camera`, true);
    const given = (typeof beat.camera === "string" ? { preset: beat.camera } : beat.camera) as Partial<CameraSpec> & { reason?: string };
    if (!given.reason) return { preset: "none", amplitude: 0, shake: 0 };
    return { preset: given.preset ?? (REASON_PRESET[given.reason] as string), amplitude: given.amplitude ?? base.amplitude, shake: given.shake ?? (given.reason === "tension" ? Math.max(base.shake, 0.4) : 0) };
  }
  if (beat.camera === undefined) return base;
  checkCamera(beat.camera, `${beat.id}: camera`, true);
  const given = (typeof beat.camera === "string" ? { preset: beat.camera } : beat.camera) as Partial<CameraSpec>;
  return { preset: given.preset ?? base.preset, amplitude: given.amplitude ?? base.amplitude, shake: given.shake ?? base.shake };
}

/** The look's post effects with the beat's own on top (same id — the beat's strength). */
export function beatPost(beat: Pick<BeatSpec, "id" | "post">, look: LookDef): PostSpec[] {
  const out = new Map<string, number>(look.motion.post.map((p) => [p.id, p.strength]));
  if (beat.post !== undefined) {
    if (!Array.isArray(beat.post)) fail(`${beat.id}: post — список {id, strength}`);
    beat.post.forEach((p, i) => {
      const spec = checkPost(p, `${beat.id}: post[${i}]`);
      out.set(spec.id, spec.strength);
    });
  }
  return [...out].filter(([, s]) => s > 0).map(([id, strength]) => ({ id, strength }));
}

/** Text slot of the scene → type preset: the beat's (one for all or by slot), else the look's by the slot's kind. */
export function slotPresets(beat: Pick<BeatSpec, "type">, scene: SceneDef, look: LookDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, slot] of Object.entries(scene.text ?? {})) {
    const fromBeat = typeof beat.type === "string" ? beat.type : beat.type?.[name];
    const preset = fromBeat ?? look.motion.type[slot.kind];
    if (preset) out[name] = preset;
  }
  return out;
}

export function videoSeed(id: string): number {
  return parseInt(sha(id).slice(0, 6), 16) % 997;
}

/**
 * Script injected into a scene right before W.apply(tl) (engine/motion/runtime.js → HygenMotion.type): type
 * presets of its text slots and their fg parallax. Empty when the beat needs neither — the scene stays as authored.
 */
export function typeInjection(input: { beat: BeatSpec; scene: SceneDef; look: LookDef; style: StyleDef; compositionId: string; start: number; duration: number; index: number; hits: number[]; seed: number }): string {
  const { beat, scene, look } = input;
  const presets = slotPresets(beat, scene, look);
  const camera = beatCamera(beat, look);
  const moving = camera.preset !== "none" || camera.shake > 0;
  const par = look.motion.parallax;
  const parallax = par.enabled && moving ? r3(par.fg - (scene.depth ?? 1) * par.scene) : 0;
  const bloom = beatPost(beat, look).find((p) => p.id === "bloom")?.strength ?? 0;
  const names = Object.keys(scene.text ?? {}).filter((n) => presets[n] || parallax || bloom);
  if (!names.length) return "";
  const prefix = /^[0-9]/.test(input.compositionId) ? `f${input.compositionId}` : `f-${input.compositionId}`;
  const end = r3(input.start + input.duration);
  const cfg = {
    slots: names.map((name) => {
      const slot = (scene.text as Record<string, TextSlot>)[name] as TextSlot;
      return {
        name,
        el: `${prefix}-${slot.el}`,
        text: `${prefix}-${slot.text ?? slot.el}`,
        kind: slot.kind,
        at: typeof slot.at === "number" ? slot.at : (scene.anchors[slot.at] as { at: number }).at,
        dynamic: slot.dynamic === true,
        chars: slot.chars ? slot.chars.replaceAll("__p__", prefix) : null,
        preset: presets[name] ?? null,
      };
    }),
    durRef: scene.ref.duration,
    durAct: input.duration,
    beatStart: input.start,
    beat: { start: input.start, end, index: input.index, hits: input.hits.filter((h) => h >= input.start - 0.01 && h < end) },
    camera: moving ? camera : null,
    parallax,
    bloom,
    seed: input.seed,
    heroRgb: rgbStr(toneColors(input.style, beat.tone ?? "accent").hero as string),
  };
  return `window.HygenMotion && window.HygenMotion.type(tl, W, ${JSON.stringify(cfg).replace(/<\//g, "<\\/")});\n  `;
}

// ── transitions ──────────────────────────────────────────────────────────────────────────────────

/** Transitions that draw on the shared transition canvas (#hy-tr-canvas); flash and ash-burst have their own overlays. */
const CANVAS_TRANSITIONS = ["whip", "water-ripple", "smoke-wipe", "iris", "blinds", "grid-dissolve", "film-burn", "directional-wipe", "grade-split"];

export interface PlannedTransition {
  fromBeat: string;
  toBeat: string;
  from: string;
  to: string;
  at: number;
  list: string[];
  /** Length of each transition of the cut, s (flash — video.json duration or the default). */
  durs: Record<string, number>;
  /** The longest of them. */
  dur: number;
  flashDur: number;
}

export const transitionDuration = (id: string): number => readJson<{ duration: number }>(join(ENGINE_DIR, "transitions", id, "transition.json")).duration;

/**
 * Every cut gets a transition: video.json transitions → the beat's own (transition) → the look's hit transition
 * when a heavy hit lands on the cut → the look's default. hard-cut is nothing.
 */
export function planTransitions(spec: VideoSpec, look: LookDef, timings: { start: number }[], heavyHits: number[]): PlannedTransition[] {
  const out: PlannedTransition[] = [];
  for (let i = 1; i < spec.beats.length; i++) {
    const from = spec.beats[i - 1] as BeatSpec;
    const to = spec.beats[i] as BeatSpec;
    const at = (timings[i] as { start: number }).start;
    const explicit = spec.transitions.find((tr) => tr.from === from.id && tr.to === to.id);
    if (explicit?.type === "shader") continue;
    let list: string[];
    let flashDur = transitionDuration("flash");
    if (explicit) {
      list = explicit.list;
      flashDur = explicit.duration;
    } else if (to.transition !== undefined) list = checkTransitionRef(to.transition, `${to.id}: transition`);
    else if (heavyHits.some((h) => h >= at - 0.05 && h <= at + 0.6)) list = look.transitions.hit;
    else list = look.transitions.default;
    list = list.filter((id) => id !== "hard-cut");
    if (!list.length) continue;
    const durs = Object.fromEntries(list.map((id) => [id, id === "flash" ? flashDur : transitionDuration(id)]));
    out.push({ fromBeat: from.id, toBeat: to.id, from: `el-${from.id}`, to: `el-${to.id}`, at: r3(at), list, durs, dur: Math.max(0.1, ...Object.values(durs)), flashDur });
  }
  return out;
}

// ── media backgrounds ────────────────────────────────────────────────────────────────────────────

const TREATMENTS = ["ken-burns", "parallax", "blur", "duotone"];
const BG_KEYS = ["image", "video", "treatment", "focus", "opacity", "depth", "blend", "zoom"];
const OVERSCAN = 1.12;

export interface BackgroundPlan {
  beatId: string;
  host: string;
  move: string;
  src: string;
  video: boolean;
  start: number;
  duration: number;
  opacity: number;
  blend: string;
  depth: number;
  zoom: [number, number];
  drift: boolean;
  focus: [number, number];
}

const mixHex = (a: string, b: string, t: number): string =>
  "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("").toUpperCase();

const mediaPath = (v: string, videoDir: string): string => (isAbsolute(v) ? v : v.startsWith("engine/") ? join(ROOT_DIR, v) : join(videoDir, v));

export function checkBackground(beat: Pick<BeatSpec, "id" | "background">, videoDir: string): { file: string; video: boolean; treatment: string[] } {
  const where = `${beat.id}: background`;
  const bg = beat.background;
  if (!isObj(bg)) return fail(`${where}: {image|video, treatment, focus, opacity, depth, blend, zoom}`);
  for (const key of Object.keys(bg)) if (!BG_KEYS.includes(key)) fail(`${where}: неизвестное поле ${key}; есть: ${BG_KEYS.join(", ")}`);
  if ((bg.image === undefined) === (bg.video === undefined)) fail(`${where}: ровно одно из image или video`);
  const rel = bg.image ?? bg.video;
  if (typeof rel !== "string" || !rel) fail(`${where}: путь к файлу от папки ролика`);
  const file = mediaPath(rel as string, videoDir);
  if (!existsSync(file)) fail(`${where}: нет файла ${file}`);
  checkLicense(file, where);
  const video = bg.video !== undefined;
  if (video && !/\.(webm|mp4|mov|ogv|mkv)$/i.test(file)) fail(`${where}: video — webm, mp4, mov или ogv`);
  if (!video && !/\.(jpe?g|png|webp)$/i.test(file)) fail(`${where}: image — jpg, png или webp`);
  const treatment = bg.treatment === undefined ? ["ken-burns"] : typeof bg.treatment === "string" ? [bg.treatment] : bg.treatment;
  if (!Array.isArray(treatment) || !treatment.length || treatment.some((t) => !TREATMENTS.includes(t as string))) fail(`${where}: treatment — ${TREATMENTS.join(", ")} или их список`);
  const focus = bg.focus ?? [0.5, 0.5];
  if (!Array.isArray(focus) || focus.length !== 2 || focus.some((v) => typeof v !== "number" || v < 0 || v > 1)) fail(`${where}: focus — [x, y], доли картинки 0–1`);
  if (bg.opacity !== undefined && (typeof bg.opacity !== "number" || bg.opacity < 0 || bg.opacity > 1)) fail(`${where}: opacity — 0–1`);
  if (bg.blend !== undefined && !BLENDS.includes(bg.blend as string)) fail(`${where}: blend — одно из ${BLENDS.join(", ")}`);
  if (bg.depth !== undefined && !(["bg", "mid", "fg"].includes(bg.depth as string) || (typeof bg.depth === "number" && bg.depth >= 0 && bg.depth <= 3))) fail(`${where}: depth — bg, mid, fg или множитель 0–3`);
  if (bg.zoom !== undefined && (!Array.isArray(bg.zoom) || bg.zoom.length !== 2 || bg.zoom.some((v) => typeof v !== "number" || v < 1 || v > 2))) fail(`${where}: zoom — [от, до], 1–2`);
  return { file, video, treatment: treatment as string[] };
}

/**
 * Backgrounds are treated once at build time (engine/py/background.py, cached by file + palette): duotone into the
 * beat's hero palette (night → heroDeep → heroLight), blur; the render only moves them (ken-burns, drift, parallax).
 */
export function prepareBackgrounds(input: { beats: { beat: BeatSpec; start: number; duration: number }[]; look: LookDef; style: StyleDef; videoDir: string; dir: string; fps: number }): BackgroundPlan[] {
  const out: BackgroundPlan[] = [];
  for (const { beat, start, duration } of input.beats) {
    if (!beat.background) continue;
    const { file, video, treatment } = checkBackground(beat, input.videoDir);
    const bg = beat.background as Record<string, unknown>;
    const colors = toneColors(input.style, beat.tone ?? "accent");
    // shadows night, mids toward hero-deep, highlights a little past it: the picture stays a dim world under the text
    const stops = [colors.night as string, mixHex(colors.night as string, colors.heroDeep as string, 0.7), mixHex(colors.heroDeep as string, colors.hero as string, 0.35)];
    const focus = (bg.focus as [number, number] | undefined) ?? [0.5, 0.5];
    const ext = video ? ".mp4" : ".jpg";
    const key = sha({ v: 1, file: fileSha(file), treatment, stops, focus, OVERSCAN, duration: video ? r3(duration) : 0, fps: input.fps });
    const cacheDir = ensureDir(join(input.videoDir, ".cache", "bg"));
    const cached = join(cacheDir, `${key}${ext}`);
    if (!existsSync(cached)) {
      const args = [pyScript("background.py"), file, cached, "--focus", String(focus[0]), String(focus[1]), "--treatment", ...treatment, "--stops", ...stops, "--overscan", String(OVERSCAN)];
      if (video) args.push("--duration", String(r3(duration)), "--fps", String(input.fps));
      run(python(), args);
    }
    const name = `bg-${beat.id}${ext}`;
    ensureDir(join(input.dir, "assets", "media"));
    copyFileSync(cached, join(input.dir, "assets", "media", name));
    const kenBurns = treatment.includes("ken-burns");
    out.push({
      beatId: beat.id,
      host: `hy-bg-${beat.id}`,
      move: `hy-bg-${beat.id}-move`,
      src: `assets/media/${name}`,
      video,
      start: r3(start),
      duration: r3(duration),
      opacity: (bg.opacity as number | undefined) ?? 0.5,
      blend: (bg.blend as string | undefined) ?? "lighten",
      depth: depthFactor((bg.depth as Depth | number | undefined) ?? "bg", input.look),
      zoom: (bg.zoom as [number, number] | undefined) ?? (kenBurns ? [1, 1.1] : [1, 1]),
      drift: treatment.includes("parallax"),
      focus,
    });
  }
  return out;
}

/** Backgrounds over the scene hosts (z 10, lighten by default): the picture replaces the scene's dark ground, brighter text stays on top. */
export function backgroundHostsHtml(bgs: BackgroundPlan[], trackBase = 40): string {
  return bgs
    .map((b, i) => {
      const w = Math.round(1080 * OVERSCAN), h = Math.round(1920 * OVERSCAN);
      const box = `position: absolute; left: ${-(w - 1080) / 2}px; top: ${-(h - 1920) / 2}px; width: ${w}px; height: ${h}px; transform-origin: ${(b.focus[0] * 100).toFixed(1)}% ${(b.focus[1] * 100).toFixed(1)}%`;
      const outer = [`position: absolute`, `left: 0`, `top: 0`, `width: 1080px`, `height: 1920px`, `overflow: hidden`, `pointer-events: none`, `z-index: 10`];
      if (b.blend !== "normal") outer.push(`mix-blend-mode: ${b.blend}`);
      outer.push(`opacity: ${b.opacity}`);
      const timing = `data-start="${b.start}" data-duration="${b.duration}" data-track-index="${trackBase + i}"`;
      if (!b.video) return `\n      <div id="${b.host}" class="clip hy-bg" ${timing} style="${outer.join("; ")}" aria-hidden="true" data-layout-ignore><img id="${b.move}" src="${b.src}" alt="" style="${box}; object-fit: cover" /></div>`;
      // media rule: timing on the video only, motion on an untimed wrapper
      return `\n      <div id="${b.host}" class="hy-bg" style="${outer.join("; ")}" aria-hidden="true" data-layout-ignore><div id="${b.move}" style="${box}"><video id="${b.host}-video" class="clip" src="${b.src}" ${timing} muted playsinline style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover"></video></div></div>`;
    })
    .join("");
}

// ── motion runtime: config, post overlays ────────────────────────────────────────────────────────

export interface MotionNeeds {
  runtime: boolean;
  bloom: boolean;
  leak: boolean;
  flicker: boolean;
  vpulse: boolean;
  chromatic: boolean;
  canvas: boolean;
}

export function motionConfig(input: { id: string; look: LookDef; style: StyleDef; beats: { beat: BeatSpec; start: number; end: number; index: number }[]; hits: number[]; bgs: BackgroundPlan[]; layers: TextureLayer[]; transitions: PlannedTransition[] }): { config: Record<string, unknown>; needs: MotionNeeds } {
  const { look, bgs, layers } = input;
  let flashes = 0;
  const transitions = input.transitions.map((tr, n) => ({ from: tr.from, to: tr.to, at: tr.at, dur: tr.dur, durs: tr.durs, list: tr.list, n, flash: tr.list.includes("flash") ? flashes++ : -1 }));
  const par = look.motion.parallax;
  const posts = new Set<string>();
  let anyMoving = false;
  const beats = input.beats.map(({ beat, start, end, index }) => {
    const camera = beatCamera(beat, look);
    const post = beatPost(beat, look);
    post.forEach((p) => posts.add(p.id));
    const host = `el-${beat.id}`;
    const bg = bgs.find((b) => b.beatId === beat.id);
    const bgMoves = !!bg && (bg.zoom[0] !== bg.zoom[1] || bg.drift);
    const moving = camera.preset !== "none" || camera.shake > 0;
    anyMoving ||= moving;
    return {
      id: beat.id,
      host,
      index,
      start: r3(start),
      end: r3(end),
      camera,
      post,
      hits: input.hits.filter((h) => h >= start - 0.01 && h < end),
      bg: bgMoves && bg ? { move: bg.move, zoom: bg.zoom, drift: bg.drift } : null,
      sceneDepth: par.enabled ? r3((beat.scene !== undefined ? (loadScene(beat.scene).depth ?? 1) : 1) * par.scene) : 1,
      active: moving || bgMoves || transitions.some((tr) => (tr.from === host || tr.to === host) && tr.list.some((id) => id === "whip" || id === "water-ripple")) || post.some((p) => p.id === "blur-pull" || p.id === "chromatic"),
    };
  });
  const colors = toneColors(input.style, "accent");
  const needs: MotionNeeds = {
    runtime: false,
    bloom: posts.has("bloom"),
    leak: posts.has("light-leak"),
    flicker: posts.has("flicker"),
    vpulse: posts.has("vignette-pulse"),
    chromatic: posts.has("chromatic"),
    canvas: transitions.some((tr) => tr.list.some((id) => CANVAS_TRANSITIONS.includes(id))),
  };
  needs.runtime = beats.some((b) => b.active) || posts.size > 0 || transitions.length > 0 || anyMoving;
  return {
    config: {
      seed: videoSeed(input.id),
      parallax: par.enabled,
      beats,
      layers: [
        ...bgs.map((b) => ({ el: b.host, depth: b.depth, start: b.start, end: r3(b.start + b.duration) })),
        ...layers.filter((l) => l.texture !== "grain").map((l) => ({ el: `el-${l.id}`, depth: l.depth, start: l.start, end: r3(l.start + l.duration) })),
      ],
      transitions,
      transitionIds: [...new Set(transitions.flatMap((tr) => tr.list))],
      rgb: Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, rgbStr(v)])),
      hex: colors,
    },
    needs,
  };
}

/** Root overlays of the post effects and runtime transitions (colours from the look's CSS variables). */
export function postOverlays(needs: MotionNeeds): { css: string; html: string } {
  const css: string[] = [];
  const html: string[] = [];
  if (needs.leak) {
    css.push(
      "#hy-post-leak { position: absolute; inset: 0; pointer-events: none; z-index: 22; mix-blend-mode: screen; opacity: 0; overflow: hidden; }",
      ".hy-leak { position: absolute; width: 1000px; height: 1000px; border-radius: 50%; }",
      "#hy-post-leak-1 { left: -460px; top: 120px; background: radial-gradient(closest-side, rgba(var(--hy-rgb-heroHot), 0.8), rgba(var(--hy-rgb-heroHot), 0)); }",
      "#hy-post-leak-2 { right: -480px; top: 980px; background: radial-gradient(closest-side, rgba(var(--hy-rgb-coldLight), 0.55), rgba(var(--hy-rgb-coldLight), 0)); }",
    );
    html.push('<div id="hy-post-leak" aria-hidden="true" data-layout-ignore><div id="hy-post-leak-1" class="hy-leak"></div><div id="hy-post-leak-2" class="hy-leak"></div></div>');
  }
  if (needs.bloom) {
    // halation around the hero area; the glow of the bright text itself is written into the scene (text slots) — no backdrop-filter (TRAPS.md)
    css.push("#hy-post-bloom { position: absolute; inset: 0; pointer-events: none; z-index: 24; display: none; mix-blend-mode: screen; background: radial-gradient(ellipse 62% 40% at 50% 38%, rgba(var(--hy-rgb-hero), 0.34) 0%, rgba(var(--hy-rgb-hero), 0.12) 45%, rgba(var(--hy-rgb-hero), 0) 100%); }");
    html.push('<div id="hy-post-bloom" aria-hidden="true" data-layout-ignore></div>');
  }
  if (needs.flicker) {
    css.push("#hy-post-flicker { position: absolute; inset: 0; pointer-events: none; z-index: 26; background-color: var(--hy-night); opacity: 0; }");
    html.push('<div id="hy-post-flicker" aria-hidden="true" data-layout-ignore></div>');
  }
  if (needs.canvas) {
    css.push(
      "#hy-tr-canvas { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; pointer-events: none; z-index: 27; }",
      "#hy-tr-veil { position: absolute; inset: 0; pointer-events: none; z-index: 27; background-color: var(--hy-heroDeep); opacity: 0; }",
    );
    html.push('<div id="hy-tr-veil" aria-hidden="true" data-layout-ignore data-layout-allow-occlusion></div>', '<canvas id="hy-tr-canvas" width="540" height="960" aria-hidden="true" data-layout-ignore data-layout-allow-occlusion></canvas>');
  }
  if (needs.vpulse) {
    css.push("#hy-post-vpulse { position: absolute; inset: 0; pointer-events: none; z-index: 31; opacity: 0; background: radial-gradient(ellipse 70% 56% at 50% 42%, rgba(var(--hy-rgb-night), 0) 30%, rgba(var(--hy-rgb-night), 0.9) 100%); }");
    html.push('<div id="hy-post-vpulse" aria-hidden="true" data-layout-ignore></div>');
  }
  if (needs.chromatic) {
    html.push(
      '<svg id="hy-post-svg" width="0" height="0" style="position: absolute" aria-hidden="true" data-layout-ignore><defs><filter id="hy-ca" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" /><feOffset id="hy-ca-r" in="r" dx="0" dy="0" result="ro" /><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" /><feOffset id="hy-ca-gb" in="gb" dx="0" dy="0" result="gbo" /><feBlend in="ro" in2="gbo" mode="screen" /></filter></defs></svg>',
    );
  }
  return { css: css.join("\n      "), html: html.map((h) => `\n      ${h}`).join("") };
}

/** engine/motion/runtime.js + every engine/transitions/<id>/transition.js → assets/hygen/runtime.js. */
export function installRuntime(dir: string): void {
  const root = join(ENGINE_DIR, "transitions");
  const parts = [readFileSync(join(ENGINE_DIR, "motion", "runtime.js"), "utf8")];
  for (const id of transitionIds()) {
    const file = join(root, id, "transition.js");
    if (existsSync(file)) parts.push(readFileSync(file, "utf8"));
  }
  ensureDir(join(dir, "assets", "hygen"));
  writeFileSync(join(dir, "assets", "hygen", "runtime.js"), parts.join("\n"));
}

// ── validation (before the voice) ────────────────────────────────────────────────────────────────

export function validateLayers(spec: VideoSpec, look: LookDef, videoDir: string): void {
  const ids = spec.beats.map((b) => b.id);
  for (const tr of spec.transitions) {
    if (tr.type !== "shader" && ids.indexOf(tr.to) !== ids.indexOf(tr.from) + 1) fail(`переход ${tr.from} → ${tr.to}: только между соседними битами`);
  }
  for (const beat of spec.beats) {
    if (beat.textures !== undefined) checkTextureRefs(beat.textures, `${beat.id}: textures`);
    if (beat.background !== undefined) checkBackground(beat, videoDir);
    if (beat.scene === undefined) {
      if (beat.type !== undefined) fail(`${beat.id}: type — пресеты текстовых слотов сцены; у stage-бита текст — устройства text.*`);
      if (beat.background !== undefined) fail(`${beat.id}: background — фон сцены; у stage-бита медиа — это stage media`);
    }
    beatCamera(beat, look);
    beatPost(beat, look);
    if (beat.transition !== undefined) checkTransitionRef(beat.transition, `${beat.id}: transition`);
    if (beat.scene === undefined) continue;
    const scene = loadScene(beat.scene);
    if (beat.type !== undefined) {
      const slots = Object.keys(scene.text ?? {});
      if (!slots.length) fail(`${beat.id}: у сцены ${scene.id} нет текстовых слотов (scene.json → text) — type некуда применить`);
      if (typeof beat.type === "string") {
        if (!typePresets().includes(beat.type)) fail(`${beat.id}: type — одно из ${typePresets().join(", ")}`);
      } else {
        checkTypeMap(beat.type, `${beat.id}: type`, false);
        for (const slot of Object.keys(beat.type)) if (!slots.includes(slot)) fail(`${beat.id}: у сцены ${scene.id} нет текстового слота «${slot}»; есть: ${slots.join(", ")}`);
      }
    }
    beatCamera(beat, look);
    beatPost(beat, look);
    if (beat.transition !== undefined) checkTransitionRef(beat.transition, `${beat.id}: transition`);
  }
}
