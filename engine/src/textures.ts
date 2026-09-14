import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ParamDef, StyleDef } from "./contract.ts";
import { LITERAL_COLOR_RE, checkValue, toneColors } from "./contract.ts";
import { ENGINE_DIR, fail, readJson } from "./lib/util.ts";

// Texture library (engine/textures/<id>/texture.json + texture.html): full-frame layers over the scene and
// under the captions — rain, smoke, embers, grain. A texture is a HyperFrames sub-composition with its own
// paused timeline; the scene never knows it is there. Contract: engine/scenes/CONTRACT.md, «Текстуры».

export interface TextureRef {
  id: string;
  [param: string]: unknown;
}

export type Depth = "bg" | "mid" | "fg";
export const BLENDS = ["normal", "screen", "lighten", "overlay", "soft-light", "multiply", "color-dodge", "plus-lighter"];
const DEPTHS = ["bg", "mid", "fg"];
/** z-index of a texture host by depth (scenes 0, backgrounds 10, post 22–27, vignette 30, captions 35). */
export const DEPTH_Z: Record<Depth, number> = { bg: 12, mid: 14, fg: 16 };

export interface TextureParamDef extends Omit<ParamDef, "type"> {
  /** color — token of the looked palette («hero», «ashLight») or #RRGGBB; cues — times: «hits», «start», seconds or a word of the beat. */
  type: ParamDef["type"] | "color" | "cues";
}

export interface TextureDef {
  id: string;
  name: string;
  use: string;
  layer: { depth: Depth; blend: string; opacity: number; z?: number };
  params: Record<string, TextureParamDef>;
  /** Cue params whose times are events of the layer (a lightning strike → thunder in the sound module). */
  events: { param: string; label: string; sound?: string }[];
  seed: { default: number; affects: string | null };
}

const LAYER_KEYS = ["opacity", "blend", "depth", "seed"];
const HEX6 = /^#[0-9A-Fa-f]{6}$/;
const TOKEN = /^[a-z][A-Za-z0-9]*$/;
const TEMPLATE_TOKEN_RE = /\{\{hygen:([a-z]+)(?:\.([A-Za-z0-9]+))?\}\}/g;

export function textureIds(): string[] {
  const root = join(ENGINE_DIR, "textures");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "texture.json")))
    .map((d) => d.name)
    .sort();
}

const cache = new Map<string, TextureDef>();

export function loadTexture(id: string): TextureDef {
  const hit = cache.get(id);
  if (hit) return hit;
  const dir = join(ENGINE_DIR, "textures", id);
  if (!existsSync(join(dir, "texture.json"))) fail(`нет текстуры engine/textures/${id} (есть: ${textureIds().join(", ")})`);
  if (!existsSync(join(dir, "texture.html"))) fail(`нет шаблона engine/textures/${id}/texture.html`);
  const t = readJson<TextureDef>(join(dir, "texture.json"));
  const where = `engine/textures/${id}/texture.json`;
  const need = (cond: unknown, msg: string): void => {
    if (!cond) fail(`${where}: ${msg}`);
  };
  need(t.id === id, `id «${t.id}» должен совпадать с папкой`);
  need(typeof t.name === "string" && typeof t.use === "string" && t.use.length > 10, "нужны name и use");
  need(t.layer && DEPTHS.includes(t.layer.depth) && BLENDS.includes(t.layer.blend) && typeof t.layer.opacity === "number", "layer: {depth bg|mid|fg, blend, opacity}");
  need(t.seed && Number.isInteger(t.seed.default), "seed: {default, affects}");
  t.params = t.params ?? {};
  t.events = t.events ?? [];
  for (const [name, def] of Object.entries(t.params)) {
    need(TOKEN.test(name) && !LAYER_KEYS.includes(name), `параметр ${name}: camelCase и не ${LAYER_KEYS.join("/")}`);
    need(typeof def.description === "string" && def.description.length > 0, `параметр ${name}: нет description`);
    checkParam(def, def.default, `${where}: default параметра ${name}`);
  }
  for (const ev of t.events) need(t.params[ev.param]?.type === "cues", `событие ${ev.label}: параметр ${ev.param} должен быть типа cues`);
  cache.set(id, t);
  return t;
}

function checkParam(def: TextureParamDef, value: unknown, where: string): void {
  if (def.type === "color") {
    if (typeof value !== "string" || !(HEX6.test(value) || TOKEN.test(value))) fail(`${where}: токен палитры или #RRGGBB, а не ${JSON.stringify(value)}`);
    return;
  }
  if (def.type === "cues") {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string" && typeof v !== "number")) fail(`${where}: список времён («hits», «start», секунды, слово реплики)`);
    return;
  }
  checkValue(def as ParamDef, value, where);
}

/** Every texture reference of a look or a beat: known id, known params, valid values. */
export function checkTextureRefs(refs: unknown, where: string): void {
  if (!Array.isArray(refs)) fail(`${where}: список {id, …параметры}`);
  refs.forEach((ref: unknown, i: number) => {
    const w = `${where}[${i}]`;
    if (typeof ref !== "object" || ref === null || typeof (ref as TextureRef).id !== "string") fail(`${w}: {id, …параметры}`);
    const r = ref as TextureRef;
    const def = loadTexture(r.id);
    for (const [key, value] of Object.entries(r)) {
      if (key === "id") continue;
      if (key === "opacity") {
        if (typeof value !== "number" || value < 0 || value > 1) fail(`${w}: opacity — 0–1`);
      } else if (key === "blend") {
        if (!BLENDS.includes(value as string)) fail(`${w}: blend — одно из ${BLENDS.join(", ")}`);
      } else if (key === "depth") {
        if (!(DEPTHS.includes(value as string) || (typeof value === "number" && value >= 0 && value <= 3))) fail(`${w}: depth — bg, mid, fg или множитель 0–3`);
      } else if (key === "seed") {
        if (!Number.isInteger(value)) fail(`${w}: seed — целое`);
      } else {
        const pd = def.params[key];
        if (!pd) fail(`${w}: у текстуры ${def.id} нет параметра «${key}»; есть: ${[...Object.keys(def.params), ...LAYER_KEYS].join(", ")}`);
        checkParam(pd, value, `${w}.${key}`);
      }
    }
  });
}

export interface ResolvedTexture {
  def: TextureDef;
  params: Record<string, unknown>;
  opacity: number;
  blend: string;
  depth: Depth | number;
  seed: number;
}

const rgbOf = (hex: string): string => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

/** Reference → full params: defaults filled, colour tokens → #RRGGBB (+ <name>Rgb), cues → seconds inside the layer. */
export function resolveTexture(ref: TextureRef, style: StyleDef, where: string, cue: (c: string) => number[]): ResolvedTexture {
  const def = loadTexture(ref.id);
  const colors = toneColors(style, "accent");
  const params: Record<string, unknown> = {};
  for (const [name, pd] of Object.entries(def.params)) {
    const value = name in ref ? ref[name] : pd.default;
    checkParam(pd, value, `${where}.${name}`);
    if (pd.type === "color") {
      const hex = HEX6.test(value as string) ? (value as string) : colors[value as string];
      if (!hex) fail(`${where}.${name}: в палитре нет цвета «${value}»`);
      params[name] = hex;
      params[`${name}Rgb`] = rgbOf(hex as string);
    } else if (pd.type === "cues") {
      params[name] = (value as (string | number)[]).flatMap((c) => (typeof c === "number" ? [c] : cue(c))).sort((a, b) => a - b);
    } else {
      params[name] = value;
    }
  }
  return {
    def,
    params,
    opacity: (ref.opacity as number | undefined) ?? def.layer.opacity,
    blend: (ref.blend as string | undefined) ?? def.layer.blend,
    depth: (ref.depth as Depth | number | undefined) ?? def.layer.depth,
    seed: (ref.seed as number | undefined) ?? def.seed.default,
  };
}

export function lintTexture(id: string, html: string): void {
  const where = `engine/textures/${id}/texture.html`;
  const need = (cond: unknown, msg: string): void => {
    if (!cond) fail(`${where}: ${msg}`);
  };
  need(html.includes('data-composition-id="__cid__"'), 'нет data-composition-id="__cid__"');
  need(/window\.__timelines\["__cid__"\]/.test(html), 'нет window.__timelines["__cid__"]');
  need(html.includes("/*{{hygen:params}}*/"), "нет метки /*{{hygen:params}}*/");
  need(!/Math\.random\(|Date\.now\(/.test(html), "Math.random() и Date.now() запрещены — только SEED");
  const color = LITERAL_COLOR_RE.exec(html);
  need(!color, `цвет литералом «${color?.[0]}» — только параметры color, S.colors и {{hygen:color.…}}`);
  const id0 = /\sid="(?!__p__-|root")([^"]+)"/.exec(html);
  need(!id0, `id «${id0?.[1]}» без префикса __p__-`);
}

/** texture.html → sub-composition: `var P = params, S = {colors, rgb}, SEED, DUR` and the colour tokens. */
export function renderTexture(res: ResolvedTexture, compositionId: string, duration: number, style: StyleDef): string {
  const template = readFileSync(join(ENGINE_DIR, "textures", res.def.id, "texture.html"), "utf8");
  lintTexture(res.def.id, template);
  const colors = toneColors(style, "accent");
  const S = { colors, rgb: Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, rgbOf(v)])) };
  const json = (v: unknown): string => JSON.stringify(v).replace(/<\//g, "<\\/");
  let html = template.replaceAll("__cid__", compositionId).replaceAll("__p__", `f-${compositionId}`);
  html = html.replace("/*{{hygen:params}}*/", () => `var P = ${json(res.params)}, S = ${json(S)}, SEED = ${res.seed}, DUR = ${duration};`);
  html = html.replace(TEMPLATE_TOKEN_RE, (whole, kind: string, name: string | undefined) => {
    if (kind === "duration" && name === undefined) return String(duration);
    if (kind === "color" && name && colors[name]) return colors[name] as string;
    if (kind === "rgb" && name && colors[name]) return rgbOf(colors[name] as string);
    return fail(`engine/textures/${res.def.id}/texture.html: неизвестный токен ${whole}`);
  });
  return html;
}
