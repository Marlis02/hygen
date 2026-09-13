import { copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, isAbsolute, join } from "node:path";
import type { BeatSpec, VideoSpec } from "./spec.ts";
import { parseBeatText } from "./spec.ts";
import { ENGINE_DIR, ROOT_DIR, ensureDir, fail, readJson } from "./lib/util.ts";

// The scene contract (engine/scenes/CONTRACT.md, engine/scenes/schema.json), checked in code.

export type ParamType = "number" | "integer" | "string" | "boolean" | "enum" | "list" | "point" | "map" | "image";

export interface ParamDef {
  type: ParamType;
  default: unknown;
  description: string;
  values?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  maxItems?: number;
  figure?: boolean;
  if?: string;
}

export interface AnchorDef {
  at: number;
  description: string;
  required?: boolean;
}

export interface EventDef {
  anchor?: string;
  at?: number;
  label: string;
  if?: string;
}

export interface SceneDef {
  id: string;
  name: string;
  use: string;
  hero?: boolean;
  ref: { duration: number; speechStart: number; speechEnd: number };
  duration: { min: number; max: number };
  settle: number;
  params: Record<string, ParamDef>;
  anchors: Record<string, AnchorDef>;
  events: EventDef[];
  seed: { default: number; affects: string | null };
  safeZone: { contentMaxY: number; rightRail: boolean };
}

export interface FontDef {
  family: string;
  fallback: string;
  files: Record<string, string>;
}

export type Tone = "accent" | "cold";

export interface StyleDef {
  id: string;
  name: string;
  colors: Record<string, string>;
  tones: Record<Tone, Record<string, string>>;
  fonts: Record<string, FontDef>;
  sizes: Record<string, number>;
  captions: {
    font: string;
    weight: number;
    size: number;
    plate: string;
    plateAlpha: number;
    border: string;
    borderAlpha: number;
    upcoming: string;
    active: string;
    spokenAlpha: number;
  };
  grain: { dark: number; light: number };
  vignette: { color: string; clear: number; alpha: number };
  safeZone: {
    width: number;
    height: number;
    padX: number;
    safeTop: number;
    contentMaxY: number;
    captionBand: [number, number];
    rightRail: { x: number; yFrom: number; yTo: number };
  };
}

const NAME_RE = /^[a-z][A-Za-z0-9]*$/;
const COND_RE = /^(!)?([a-z][A-Za-z0-9]*)(?:(>=|>|==|!=|<=|<)([A-Za-z0-9.-]+))?$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const condOk = (cond: string): boolean => cond.split("&&").every((part) => COND_RE.test(part));

// ── style ────────────────────────────────────────────────────────────────────────────────────────

export function loadStyle(id: string): StyleDef {
  const path = join(ENGINE_DIR, "styles", id, "style.json");
  if (!existsSync(path)) fail(`нет стиля ${path}`);
  const style = readJson<StyleDef>(path);
  const bad = (msg: string): never => fail(`engine/styles/${id}/style.json: ${msg}`);
  for (const key of ["colors", "tones", "fonts", "sizes", "captions", "grain", "vignette", "safeZone"] as const) {
    if (!style[key]) bad(`нет раздела ${key}`);
  }
  for (const [name, value] of Object.entries(style.colors)) if (!HEX_RE.test(value)) bad(`цвет ${name}: нужен #RRGGBB, а не ${value}`);
  for (const tone of ["accent", "cold"] as const) {
    const map = style.tones[tone];
    if (!map) bad(`нет tones.${tone}`);
    for (const alias of ["hero", "heroDeep", "heroHot", "heroLight"]) {
      if (!style.colors[map[alias] as string]) bad(`tones.${tone}.${alias} ссылается на неизвестный цвет «${map[alias]}»`);
    }
  }
  for (const [name, font] of Object.entries(style.fonts)) {
    for (const file of Object.values(font.files)) {
      if (!existsSync(join(ENGINE_DIR, "assets", "fonts", file))) bad(`шрифт ${name}: нет файла engine/assets/fonts/${file}`);
    }
  }
  return style;
}

/** Colour table of a style with the tone aliases (hero, heroDeep, heroHot, heroLight) resolved. */
export function toneColors(style: StyleDef, tone: Tone): Record<string, string> {
  const colors = { ...style.colors };
  for (const [alias, name] of Object.entries(style.tones[tone])) colors[alias] = style.colors[name] as string;
  return colors;
}

const rgbOf = (hex: string): string =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

export function fontStack(font: FontDef): string {
  return `"${font.family}", ${font.fallback}`;
}

export function fontFaces(style: StyleDef): string {
  const lines: string[] = [];
  for (const font of Object.values(style.fonts)) {
    for (const [weight, file] of Object.entries(font.files)) {
      lines.push(`@font-face{font-family:"${font.family}";font-weight:${weight};font-style:normal;font-display:block;src:url("assets/fonts/${file}") format("woff2");}`);
    }
  }
  return lines.join("\n");
}

/**
 * {{hygen:color.X}} {{hygen:rgb.X}} {{hygen:font.X}} {{hygen:size.X}} {{hygen:fontfaces}} — the style
 * part of the template language, shared by scenes and the caption preset.
 */
export function styleToken(style: StyleDef, tone: Tone, kind: string, name: string | undefined): string | undefined {
  const colors = toneColors(style, tone);
  if (kind === "fontfaces" && name === undefined) return fontFaces(style);
  if (name === undefined) return undefined;
  if (kind === "color") return colors[name];
  if (kind === "rgb") return colors[name] ? rgbOf(colors[name] as string) : undefined;
  if (kind === "font") return style.fonts[name] ? fontStack(style.fonts[name] as FontDef) : undefined;
  if (kind === "size") return style.sizes[name] !== undefined ? String(style.sizes[name]) : undefined;
  if (kind === "caption") {
    const c = style.captions;
    const rgba = (color: string, alpha: number): string => `rgba(${rgbOf(colors[color] as string)}, ${alpha})`;
    const table: Record<string, string> = {
      plate: rgba(c.plate, c.plateAlpha),
      border: rgba(c.border, c.borderAlpha),
      upcoming: colors[c.upcoming] as string,
      active: colors[c.active] as string,
      spoken: rgba(c.active, c.spokenAlpha),
      font: style.fonts[c.font] ? fontStack(style.fonts[c.font] as FontDef) : "",
      weight: String(c.weight),
      size: String(c.size),
    };
    return table[name];
  }
  return undefined;
}

const TOKEN_RE = /\{\{hygen:([a-z]+)(?:\.([A-Za-z0-9]+))?\}\}/g;

export function substituteStyle(text: string, style: StyleDef, tone: Tone, where: string): string {
  return text.replace(TOKEN_RE, (whole, kind: string, name: string | undefined) => {
    const value = styleToken(style, tone, kind, name);
    if (value === undefined) fail(`${where}: неизвестный токен ${whole}`);
    return value;
  });
}

// ── scene definitions ────────────────────────────────────────────────────────────────────────────

export function sceneIds(): string[] {
  const root = join(ENGINE_DIR, "scenes");
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "scene.json")))
    .map((d) => d.name)
    .sort();
}

function checkValue(def: ParamDef, value: unknown, where: string): void {
  const bad = (msg: string): never => fail(`${where}: ${msg}`);
  switch (def.type) {
    case "number":
    case "integer":
      if (typeof value !== "number" || !Number.isFinite(value)) bad(`нужно число, а не ${JSON.stringify(value)}`);
      if (def.type === "integer" && !Number.isInteger(value)) bad(`нужно целое, а не ${value}`);
      if (def.min !== undefined && (value as number) < def.min) bad(`${value} меньше минимума ${def.min}`);
      if (def.max !== undefined && (value as number) > def.max) bad(`${value} больше максимума ${def.max}`);
      return;
    case "string":
      if (typeof value !== "string") bad(`нужна строка, а не ${JSON.stringify(value)}`);
      if (def.maxLength !== undefined && (value as string).length > def.maxLength) bad(`«${value}» длиннее ${def.maxLength} символов`);
      return;
    case "boolean":
      if (typeof value !== "boolean") bad(`нужно true или false, а не ${JSON.stringify(value)}`);
      return;
    case "enum":
      if (!def.values?.includes(value as string)) bad(`одно из ${JSON.stringify(def.values)}, а не ${JSON.stringify(value)}`);
      return;
    case "list":
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) bad(`нужен массив строк, а не ${JSON.stringify(value)}`);
      if (def.maxItems !== undefined && (value as string[]).length > def.maxItems) bad(`больше ${def.maxItems} элементов`);
      if (def.maxLength !== undefined) {
        for (const item of value as string[]) if (item.length > def.maxLength) bad(`«${item}» длиннее ${def.maxLength} символов`);
      }
      return;
    case "point": {
      const p = value as { x?: unknown; y?: unknown };
      if (typeof p !== "object" || p === null || typeof p.x !== "number" || typeof p.y !== "number") bad(`нужна точка {x, y}, а не ${JSON.stringify(value)}`);
      return;
    }
    case "map":
    case "image":
      if (typeof value !== "string" || !value) bad(`нужно имя файла, а не ${JSON.stringify(value)}`);
      return;
  }
}

export function loadScene(id: string): SceneDef {
  const dir = join(ENGINE_DIR, "scenes", id);
  const path = join(dir, "scene.json");
  if (!existsSync(path)) fail(`нет сцены engine/scenes/${id}/scene.json`);
  if (!existsSync(join(dir, "scene.html"))) fail(`нет шаблона engine/scenes/${id}/scene.html`);
  const s = readJson<SceneDef>(path);
  const where = `engine/scenes/${id}/scene.json`;
  const need = (cond: unknown, msg: string): void => {
    if (!cond) fail(`${where}: ${msg}`);
  };
  need(s.id === id, `id «${s.id}» должен совпадать с папкой «${id}»`);
  need(typeof s.name === "string" && typeof s.use === "string" && s.use.length > 10, "нужны name и use");
  need(s.ref && s.ref.duration > 0 && s.ref.speechStart >= 0 && s.ref.speechEnd > s.ref.speechStart && s.ref.speechEnd <= s.ref.duration, "ref: duration > speechEnd > speechStart ≥ 0");
  need(s.duration && s.duration.min > 0 && s.duration.max >= s.duration.min, "duration: 0 < min ≤ max");
  need(typeof s.settle === "number" && s.settle >= 0 && s.settle <= s.ref.duration, "settle внутри ref.duration");
  need(s.seed && Number.isInteger(s.seed.default) && (s.seed.affects === null || typeof s.seed.affects === "string"), "seed: {default: целое, affects: строка или null}");
  need(s.safeZone && typeof s.safeZone.contentMaxY === "number" && typeof s.safeZone.rightRail === "boolean", "safeZone: {contentMaxY, rightRail}");
  need(s.params && typeof s.params === "object", "нет params");
  const types = new Set(["number", "integer", "string", "boolean", "enum", "list", "point", "map", "image"]);
  for (const [name, def] of Object.entries(s.params)) {
    need(NAME_RE.test(name), `имя параметра «${name}» — camelCase латиницей`);
    need(types.has(def.type), `параметр ${name}: неизвестный type «${def.type}»`);
    need(typeof def.description === "string" && def.description.length > 0, `параметр ${name}: нет description`);
    need(def.type !== "enum" || (Array.isArray(def.values) && def.values.length > 0), `параметр ${name}: enum без values`);
    need(def.if === undefined || condOk(def.if), `параметр ${name}: условие if «${def.if}» не разобрать`);
    checkValue(def, def.default, `${where}: default параметра ${name}`);
  }
  need(s.anchors && typeof s.anchors === "object", "нет anchors");
  for (const [name, a] of Object.entries(s.anchors)) {
    need(NAME_RE.test(name), `имя якоря «${name}» — camelCase латиницей`);
    need(typeof a.at === "number" && a.at >= 0 && a.at <= s.ref.duration, `якорь ${name}: at внутри ref.duration`);
    need(typeof a.description === "string" && a.description.length > 0, `якорь ${name}: нет description`);
  }
  need(Array.isArray(s.events), "events — массив");
  for (const ev of s.events) {
    need((ev.anchor === undefined) !== (ev.at === undefined), `событие «${ev.label}»: ровно одно из anchor или at`);
    need(ev.anchor === undefined || s.anchors[ev.anchor], `событие «${ev.label}»: нет якоря ${ev.anchor}`);
    need(ev.if === undefined || condOk(ev.if), `событие «${ev.label}»: условие if «${ev.if}» не разобрать`);
  }
  return s;
}

export function sceneTemplate(id: string): string {
  return readFileSync(join(ENGINE_DIR, "scenes", id, "scene.html"), "utf8");
}

// ── beat params ──────────────────────────────────────────────────────────────────────────────────

function truthValue(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string") return value.length;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  return value ? 1 : 0;
}

export function evalCondition(cond: string | undefined, params: Record<string, unknown>): boolean {
  if (!cond) return true;
  if (cond.includes("&&")) return cond.split("&&").every((part) => evalCondition(part, params));
  const m = COND_RE.exec(cond);
  if (!m) fail(`не разобрать условие «${cond}»`);
  const raw = params[m[2] as string];
  const v = truthValue(raw);
  let ok: boolean;
  if (!m[3]) ok = v !== 0;
  else if (!/^-?\d+(\.\d+)?$/.test(m[4] as string)) {
    if (m[3] !== "==" && m[3] !== "!=") fail(`условие «${cond}»: со словом — только == или !=`);
    ok = (String(raw) === m[4]) === (m[3] === "==");
  } else {
    const n = Number(m[4]);
    ok = m[3] === ">=" ? v >= n : m[3] === ">" ? v > n : m[3] === "==" ? v === n : m[3] === "!=" ? v !== n : m[3] === "<=" ? v <= n : v < n;
  }
  return m[1] ? !ok : ok;
}

export interface ResolveContext {
  style: StyleDef;
  /** Folder of the video: image params are relative to it. */
  videoDir: string;
  /** Build folder: images are copied into its assets/media/. When absent, paths are only checked. */
  buildDir?: string;
}

export interface MapSilhouette {
  name: string;
  water: string;
  coast: string;
  fillRule: string;
}

function licenseOf(file: string): string {
  return join(file.slice(0, file.length - extname(file).length) + ".license.json");
}

function checkLicense(file: string, where: string): void {
  const lic = licenseOf(file);
  if (!existsSync(lic)) fail(`${where}: у файла ${file} нет записи о лицензии ${basename(lic)}`);
  const rec = readJson<Record<string, unknown>>(lic);
  for (const key of ["source", "author", "license", "url"]) {
    if (typeof rec[key] !== "string" || !(rec[key] as string).trim()) fail(`${where}: в ${basename(lic)} нет поля ${key}`);
  }
}

export function loadMap(name: string, where: string): MapSilhouette {
  const file = join(ENGINE_DIR, "assets", "maps", `${name}.svg`);
  if (!existsSync(file)) fail(`${where}: нет силуэта engine/assets/maps/${name}.svg`);
  checkLicense(file, where);
  const svg = readFileSync(file, "utf8");
  const paths = (role: string): string[] =>
    [...svg.matchAll(/<path\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => new RegExp(`data-role="${role}"`).test(tag))
      .map((tag) => /\sd="([^"]+)"/.exec(tag)?.[1] ?? "");
  const water = paths("water").join(" ").trim();
  const coast = paths("coast").join(" ").trim();
  if (!water || !coast) fail(`${where}: в ${name}.svg нужны <path data-role="water"> и <path data-role="coast">`);
  const fillRule = /data-fill-rule="(evenodd|nonzero)"/.exec(svg)?.[1] ?? "nonzero";
  return { name, water, coast, fillRule };
}

/** Beat params → full param set of the scene: unknown names and wrong types fail, defaults fill the rest. */
export function resolveParams(beat: BeatSpec, scene: SceneDef, ctx: ResolveContext): Record<string, unknown> {
  const where = `${beat.id} (${scene.id})`;
  const given = beat.params ?? {};
  for (const name of Object.keys(given)) {
    if (!scene.params[name]) fail(`${where}: у сцены нет параметра «${name}»; есть: ${Object.keys(scene.params).join(", ")}`);
  }
  const out: Record<string, unknown> = {};
  const zone = ctx.style.safeZone;
  for (const [name, def] of Object.entries(scene.params)) {
    const value = name in given ? given[name] : def.default;
    checkValue(def, value, `${where}: параметр ${name}`);
    if (def.type === "point") {
      const p = value as { x: number; y: number };
      if (p.y > zone.contentMaxY) fail(`${where}: ${name}.y = ${p.y} ниже безопасной зоны (${zone.contentMaxY})`);
      if (p.x > zone.rightRail.x && p.y >= zone.rightRail.yFrom && p.y <= zone.rightRail.yTo) fail(`${where}: ${name} в правой полосе кнопок`);
      if (p.x < 0 || p.x > zone.width || p.y < 0) fail(`${where}: ${name} вне кадра`);
    }
    if (def.type === "map") {
      out[name] = loadMap(value as string, `${where}: параметр ${name}`);
      continue;
    }
    if (def.type === "image") {
      const v = value as string;
      const file = isAbsolute(v) ? v : v.startsWith("engine/") ? join(ROOT_DIR, v) : join(ctx.videoDir, v);
      if (!existsSync(file)) fail(`${where}: нет файла ${file}`);
      checkLicense(file, `${where}: параметр ${name}`);
      const rel = `assets/media/${basename(file)}`;
      if (ctx.buildDir) {
        ensureDir(join(ctx.buildDir, "assets", "media"));
        copyFileSync(file, join(ctx.buildDir, rel));
      }
      out[name] = rel;
      continue;
    }
    out[name] = value;
  }
  return out;
}

export interface RefCue {
  at: number;
  word: string;
  label: string;
}

/** Named anchors + raw cues of a beat → reference-time cues for the warp. */
export function beatCues(beat: BeatSpec, scene: SceneDef): RefCue[] {
  const where = `${beat.id} (${scene.id})`;
  const cues: RefCue[] = [];
  const anchors = beat.anchors ?? {};
  for (const [name, word] of Object.entries(anchors)) {
    const def = scene.anchors[name];
    if (!def) fail(`${where}: у сцены нет якоря «${name}»; есть: ${Object.keys(scene.anchors).join(", ")}`);
    cues.push({ at: def.at, word, label: name });
  }
  for (const [name, def] of Object.entries(scene.anchors)) {
    if (def.required && !(name in anchors)) fail(`${where}: обязательный якорь «${name}» (${def.description}) не привязан к слову`);
  }
  for (const [at, word] of Object.entries(beat.cues ?? {})) cues.push({ at: Number(at), word, label: word });
  return cues;
}

/** Everything about the beats that can be checked before the voice: scenes, params, anchor names, files. */
export function validateBeats(spec: VideoSpec, style: StyleDef, videoDir: string): void {
  for (const beat of spec.beats) {
    const scene = loadScene(beat.scene);
    resolveParams(beat, scene, { style, videoDir });
    beatCues(beat, scene);
    for (const word of [...Object.values(beat.anchors ?? {}), ...Object.values(beat.cues ?? {})]) {
      const bare = word.replace(/#\d+$|\.end$|#\d+\.end$/g, "").replace(/\.end$/, "");
      const spoken = parseBeatText(beat.text).tokens.flatMap((t) => t.spoken);
      if (!spoken.includes(bare)) fail(`${beat.id}: якорное слово «${word}» не встречается в реплике (${spoken.join(" ")})`);
    }
  }
}

// ── sources ──────────────────────────────────────────────────────────────────────────────────────

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
const numbersIn = (text: string): number[] => [...text.matchAll(NUMBER_RE)].map((m) => Number(m[0].replace(/,/g, "")));

/** Every figure on screen needs a link: figure params, strings/lists with digits, digits of the narration. */
export function missingSources(spec: VideoSpec): string[] {
  const missing: string[] = [];
  for (const beat of spec.beats) {
    const scene = loadScene(beat.scene);
    const sources = beat.sources ?? {};
    const params: Record<string, unknown> = {};
    for (const [name, def] of Object.entries(scene.params)) params[name] = beat.params && name in beat.params ? beat.params[name] : def.default;
    const has = (key: string): boolean => typeof sources[key] === "string" && /^https?:\/\//.test(sources[key] as string);
    const covered: number[] = [];
    for (const [name, def] of Object.entries(scene.params)) {
      if (!evalCondition(def.if, params)) continue;
      const value = params[name];
      let digits: number[] = [];
      if (def.figure && typeof value === "number") digits = [value];
      else if (typeof value === "string" && /\d/.test(value) && (def.type === "string")) digits = numbersIn(value);
      else if (Array.isArray(value) && def.type === "list") digits = numbersIn(value.join(" "));
      if (!digits.length) continue;
      if (has(name)) covered.push(...digits);
      else missing.push(`${beat.id}: ${name} = ${JSON.stringify(value)} — нет sources.${name}`);
    }
    if (!has("text")) {
      const shown = parseBeatText(beat.text).tokens.map((t) => t.display).join(" ");
      const loose = numbersIn(shown).filter((n) => !covered.includes(n));
      if (loose.length) missing.push(`${beat.id}: цифры реплики ${loose.join(", ")} — нет sources.text`);
    }
  }
  return missing;
}

// ── template ─────────────────────────────────────────────────────────────────────────────────────

const LITERAL_COLOR_RE = /(?<![\w&$-])#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})(?![\w-])|\brgba?\(\s*\d/;

/** Rules of engine/scenes/CONTRACT.md that can be checked on the template text. */
export function lintTemplate(id: string, html: string): void {
  const where = `engine/scenes/${id}/scene.html`;
  const need = (cond: unknown, msg: string): void => {
    if (!cond) fail(`${where}: ${msg}`);
  };
  need(html.includes('data-composition-id="__cid__"'), 'нет data-composition-id="__cid__"');
  need(/window\.__timelines\["__cid__"\]/.test(html), 'нет window.__timelines["__cid__"]');
  need(html.includes("/*{{hygen:params}}*/"), "нет метки /*{{hygen:params}}*/");
  need(html.includes("/*{{hygen:warp}}*/"), "нет метки /*{{hygen:warp}}*/");
  need(/W\.apply\(tl\)/.test(html), "нет W.apply(tl)");
  need(!/Math\.random\(|Date\.now\(/.test(html), "Math.random() и Date.now() запрещены — только сид");
  need(!/@font-face/.test(html), "свой @font-face запрещён — {{hygen:fontfaces}}");
  const color = LITERAL_COLOR_RE.exec(html);
  need(!color, `цвет литералом «${color?.[0]}» у позиции ${color?.index} — только {{hygen:color.…}} / {{hygen:rgb.…}}`);
  const font = /font-family:(?!\s*\{\{hygen:font\.)/.exec(html);
  need(!font, `font-family без токена у позиции ${font?.index}`);
  const id0 = /\sid="(?!__p__-|root")([^"]+)"/.exec(html);
  need(!id0, `id «${id0?.[1]}» без префикса __p__-`);
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const scriptJson = (value: unknown): string => JSON.stringify(value).replace(/<\//g, "<\\/");

export interface RenderInput {
  sceneId: string;
  compositionId: string;
  duration: number;
  params: Record<string, unknown>;
  style: StyleDef;
  tone: Tone;
  seed: number;
  /** The warp helper (engine/scenes/_runtime/warp.js with knots filled in). */
  warpJs: string;
}

export function renderTemplate(template: string, input: RenderInput): string {
  const { style, tone } = input;
  lintTemplate(input.sceneId, template);
  const colors = toneColors(style, tone);
  const S = {
    colors,
    rgb: Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, rgbOf(v)])),
    fonts: Object.fromEntries(Object.entries(style.fonts).map(([k, f]) => [k, fontStack(f)])),
    sizes: style.sizes,
    safeZone: style.safeZone,
  };
  const prefix = /^[0-9]/.test(input.compositionId) ? `f${input.compositionId}` : `f-${input.compositionId}`;
  let html = template.replaceAll("__cid__", input.compositionId).replaceAll("__p__", prefix);
  html = html.replace("/*{{hygen:params}}*/", () => `var P = ${scriptJson(input.params)}, S = ${scriptJson(S)}, SEED = ${input.seed};`);
  html = html.replace("/*{{hygen:warp}}*/", () => input.warpJs);
  html = html.replace(TOKEN_RE, (whole, kind: string, name: string | undefined) => {
    if (kind === "duration" && name === undefined) return String(input.duration);
    if (kind === "param" && name !== undefined) {
      if (!(name in input.params)) fail(`engine/scenes/${input.sceneId}/scene.html: ${whole} — нет такого параметра`);
      const v = input.params[name];
      return escapeHtml(typeof v === "string" ? v : JSON.stringify(v));
    }
    const value = styleToken(style, tone, kind, name);
    if (value === undefined) fail(`engine/scenes/${input.sceneId}/scene.html: неизвестный токен ${whole}`);
    return value;
  });
  if (html.includes("{{hygen:")) fail(`engine/scenes/${input.sceneId}/scene.html: после подстановки остался плейсхолдер {{hygen:…}}`);
  return html;
}
