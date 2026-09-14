import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ParamDef, StyleDef } from "./contract.ts";
import { checkValue } from "./contract.ts";
import { normalizeWords } from "./spec.ts";
import { SYNC_VALUES, textSchema, textSchemaScript } from "./text.ts";
import { ENGINE_DIR, copyInto, ensureDir, fail, r3, readJson } from "./lib/util.ts";

// Devices of a stage beat (engine/scenes/CONTRACT.md, «Бит v2»): engine/devices/<type>/device.json + device.js.
// Checked here before the voice, resolved here once the words are timed: target in % of the frame → px, `at` word →
// seconds inside the beat. Played by engine/devices/runtime.js on fixed z-layers stage → focus → data → annotate → text.

export const DEVICE_LAYERS = ["focus", "data", "annotate", "text"] as const;
export type DeviceLayer = (typeof DEVICE_LAYERS)[number];
export const LAYER_Z: Record<string, number> = { stage: 1, focus: 2, data: 3, annotate: 4, text: 5 };
export const FRAME = { w: 1080, h: 1920 };

export interface DeviceParamDef extends Omit<ParamDef, "type"> {
  /** numbers — array of numbers; at — a moment inside the device: a word of the line or seconds after the device's `at`; ats — a list of such moments. */
  type: ParamDef["type"] | "numbers" | "at" | "ats";
}

export interface DeviceDef {
  type: string;
  name: string;
  use: string;
  origin: string;
  layer: DeviceLayer;
  /** What target means: "box", "point", "box|point", "none" (combinations with |). */
  target: string;
  targetNote?: string;
  /** annotate.* — the beat must say what the mark explains. */
  explains: boolean;
  /** Params that can put digits on screen: the device needs `source`. */
  figures: string[];
  params: Record<string, DeviceParamDef>;
  /** Events that visibly change the frame; offset — seconds after `at` or the name of a number param. */
  events: { label: string; offset: number | string }[];
  demo: { target?: unknown; params?: Record<string, unknown>; at?: number | string; until?: number | string; text?: string; stage?: Record<string, unknown> };
  /** A text device takes the shared text schema (engine/devices/text.schema.json): its scale of sizes and own defaults. */
  text?: { scale: string; defaults?: Record<string, unknown> };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A device in video.json (after the intent resolver). */
export interface DeviceSpec {
  type: string;
  /** {x, y, w, h} or {x, y} in % of the frame, a region name of the stage, or a word of the line. */
  target?: unknown;
  /** Word of the line ("gone", "gone#2", "gone.end", "gone+0.3"), start | speech | end, or seconds in the beat. */
  at?: number | string;
  /** The device leaves (edit.hold: the stage resumes). */
  until?: number | string;
  params?: Record<string, unknown>;
  explains?: string;
  /** Link for the digits this device shows. */
  source?: string;
  /** Rhythm: voice (the words, default) | music (the nearest beat of the track) | both (the word says what, a beat ≤ 100 ms away when). */
  sync?: string;
}

/** Time of the beat: seconds of its clip, speech bounds and the words of the voice. */
export interface Clock {
  duration: number;
  speechStart: number;
  speechEnd: number;
  spoken: string[];
  word: (ref: string) => number;
  /** Beat grid of the music bed inside the beat (seconds of its clip), or null without music. */
  grid?: { beats: number[]; strong: number[] } | null;
}

export interface ResolvedDevice {
  type: string;
  index: number;
  layer: DeviceLayer;
  at: number;
  until: number | null;
  params: Record<string, unknown>;
  box: Box | null;
  point: Point | null;
  word: string | null;
  explains: string | null;
  dominant: boolean;
  sync: string;
  /** The beat grid inside the beat for sync music | both (per-beat motion), null for voice. */
  grid: { beats: number[]; strong: number[] } | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const NUM = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// ── registry ─────────────────────────────────────────────────────────────────────────────────────

export function deviceTypes(): string[] {
  const root = join(ENGINE_DIR, "devices");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "device.json")))
    .map((d) => d.name)
    .sort();
}

const cache = new Map<string, DeviceDef>();

export function loadDevice(type: string, where = "устройство"): DeviceDef {
  const hit = cache.get(type);
  if (hit) return hit;
  const dir = join(ENGINE_DIR, "devices", type);
  if (!existsSync(join(dir, "device.json"))) fail(`${where}: нет устройства «${type}»; есть: ${deviceTypes().join(", ")}`);
  if (!existsSync(join(dir, "device.js"))) fail(`engine/devices/${type}: нет device.js`);
  const d = readJson<DeviceDef>(join(dir, "device.json"));
  // the shared text schema: fields the device does not define itself; an own enum keeps its legacy values and gains the schema's
  if (d.text) {
    for (const [name, p] of Object.entries(textSchema().params)) {
      const own = d.params[name] as (DeviceParamDef & { values?: string[] }) | undefined;
      if (!own) d.params[name] = { ...(p as unknown as DeviceParamDef), default: d.text.defaults?.[name] ?? p.default };
      else if (own.type === "enum" && p.values) own.values = [...new Set([...(own.values ?? []), ...p.values])];
    }
  }
  const at = `engine/devices/${type}/device.json`;
  const need = (cond: unknown, msg: string): void => {
    if (!cond) fail(`${at}: ${msg}`);
  };
  need(d.type === type, `type «${d.type}» должен совпадать с папкой`);
  need(typeof d.use === "string" && d.use.length > 10, "нет use");
  need((DEVICE_LAYERS as readonly string[]).includes(d.layer), `layer — ${DEVICE_LAYERS.join(", ")}`);
  need(typeof d.target === "string" && d.target.split("|").every((t) => ["box", "point", "none"].includes(t)), "target — box, point, none через |");
  need(typeof d.explains === "boolean", "explains — true или false");
  need(Array.isArray(d.figures), "figures — список параметров");
  need(isObj(d.params), "нет params");
  for (const [name, def] of Object.entries(d.params)) {
    need(typeof def.description === "string" && def.description.length > 0, `параметр ${name}: нет description`);
    checkParam(def, def.default, `${at}: default ${name}`);
  }
  need(Array.isArray(d.events), "events — список");
  for (const ev of d.events) need(typeof ev.label === "string" && (NUM(ev.offset) || (typeof ev.offset === "string" && d.params[ev.offset])), `событие ${ev.label}: offset — число или имя параметра`);
  need(isObj(d.demo), "нет demo");
  cache.set(type, d);
  return d;
}

function checkParam(def: DeviceParamDef, value: unknown, where: string): void {
  if (def.type === "numbers") {
    if (!Array.isArray(value) || value.some((v) => !NUM(v))) fail(`${where}: нужен массив чисел, а не ${JSON.stringify(value)}`);
    if (def.maxItems !== undefined && (value as number[]).length > def.maxItems) fail(`${where}: больше ${def.maxItems} чисел`);
    return;
  }
  if (def.type === "at") {
    if (!NUM(value) && typeof value !== "string") fail(`${where}: слово реплики или секунды после at`);
    return;
  }
  if (def.type === "ats") {
    if (!Array.isArray(value) || value.some((v) => !NUM(v) && typeof v !== "string")) fail(`${where}: нужен список слов реплики или секунд после at`);
    if (def.maxItems !== undefined && (value as unknown[]).length > def.maxItems) fail(`${where}: больше ${def.maxItems} моментов`);
    return;
  }
  checkValue(def as ParamDef, value, where);
}

export function deviceParams(def: DeviceDef, given: Record<string, unknown> | undefined, where: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(given ?? {})) if (!def.params[name]) fail(`${where}: у ${def.type} нет параметра «${name}»; есть: ${Object.keys(def.params).join(", ")}`);
  for (const [name, p] of Object.entries(def.params)) {
    const value = given && name in given ? given[name] : p.default;
    checkParam(p, value, `${where}: ${name}`);
    out[name] = value;
  }
  return out;
}

// ── time ─────────────────────────────────────────────────────────────────────────────────────────

const AT_RE = /^([a-z0-9']+(?:#\d+)?(?:\.end)?)?\s*(?:([+-])\s*(\d+(?:\.\d+)?))?$/i;

function parseAt(ref: number | string, where: string): { base: string | null; offset: number } {
  if (NUM(ref)) return { base: null, offset: ref };
  const m = AT_RE.exec(String(ref).trim());
  if (!m || (!m[1] && !m[2])) fail(`${where}: не понимаю момент «${ref}» — слово реплики, start, speech, end или секунды`);
  const offset = m[2] ? (m[2] === "-" ? -1 : 1) * Number(m[3]) : 0;
  return { base: m[1] ? m[1].toLowerCase() : null, offset };
}

export function checkAt(ref: unknown, spoken: string[], where: string): void {
  if (!NUM(ref) && typeof ref !== "string") fail(`${where}: момент — слово реплики или секунды`);
  if (NUM(ref) && ref < 0) fail(`${where}: секунды ≥ 0`);
  const { base } = parseAt(ref as number | string, where);
  if (!base || ["start", "speech", "end"].includes(base)) return;
  const bare = base.replace(/#\d+/, "").replace(/\.end$/, "");
  if (!spoken.includes(bare)) fail(`${where}: слова «${bare}» нет в реплике (${spoken.join(" ")})`);
}

export function atSeconds(ref: number | string | undefined, clock: Clock, fallback: number, where: string): number {
  if (ref === undefined) return r3(fallback);
  const { base, offset } = parseAt(ref, where);
  const t0 = base === null ? 0 : base === "start" ? 0 : base === "speech" ? clock.speechStart : base === "end" ? clock.speechEnd : clock.word(base);
  return r3(Math.min(Math.max(0, t0 + offset), Math.max(0, clock.duration - 0.05)));
}

// ── target ───────────────────────────────────────────────────────────────────────────────────────

export function pctBox(v: unknown, where: string): Box {
  if (!isObj(v) || !NUM(v.x) || !NUM(v.y) || !NUM(v.w) || !NUM(v.h)) return fail(`${where}: нужна область {x, y, w, h} в % кадра`);
  const b = v as unknown as Box;
  if (b.x < 0 || b.y < 0 || b.w < 0 || b.h < 0 || b.x + b.w > 100.001 || b.y + b.h > 100.001) fail(`${where}: область ${JSON.stringify(v)} вне кадра (0–100 %)`);
  return b;
}

export function pctPoint(v: unknown, where: string): Point {
  if (!isObj(v) || !NUM(v.x) || !NUM(v.y) || v.x < 0 || v.x > 100 || v.y < 0 || v.y > 100) return fail(`${where}: нужна точка {x, y} в % кадра (0–100)`);
  return v as unknown as Point;
}

export const boxPx = (b: Box): Box => ({ x: r3((b.x * FRAME.w) / 100), y: r3((b.y * FRAME.h) / 100), w: r3((b.w * FRAME.w) / 100), h: r3((b.h * FRAME.h) / 100) });
export const pointPx = (p: Point): Point => ({ x: r3((p.x * FRAME.w) / 100), y: r3((p.y * FRAME.h) / 100) });

/** Target of a device → box/point in px (or a word): region names of the stage first, then words of the line. */
export function resolveTarget(target: unknown, def: DeviceDef, regions: Record<string, unknown>, spoken: string[], style: StyleDef, where: string): { box: Box | null; point: Point | null; word: string | null } {
  const kinds = def.target.split("|");
  let t = target;
  if (typeof t === "string" && regions[t] !== undefined) t = regions[t];
  if (t === undefined || t === null) {
    if (!kinds.includes("none")) fail(`${where}: ${def.type} нужен target (${def.target}${def.targetNote ? ` — ${def.targetNote}` : ""})`);
    return { box: null, point: null, word: null };
  }
  if (typeof t === "string") {
    const words = normalizeWords(t);
    if (!words.length || words.some((w) => !spoken.includes(w))) fail(`${where}: target «${t}» — не область stage.regions и не слово реплики`);
    if (!kinds.includes("none")) fail(`${where}: ${def.type} ставится на область, а не на слово`);
    return { box: null, point: null, word: t };
  }
  let box: Box | null = null;
  let point: Point | null = null;
  if (isObj(t) && "w" in t) {
    if (!kinds.includes("box") && !kinds.includes("point")) fail(`${where}: ${def.type} без области`);
    box = boxPx(pctBox(t, where));
    point = { x: r3(box.x + box.w / 2), y: r3(box.y + box.h / 2) };
    if (!kinds.includes("box")) box = null;
  } else {
    if (!kinds.includes("point")) fail(`${where}: ${def.type} нужна область {x, y, w, h}, а не точка`);
    point = pointPx(pctPoint(t, where));
  }
  // meaningful marks stay above the captions; text keeps out of the right rail of the buttons (CLAUDE.md, safe zone)
  if (def.layer !== "focus") {
    const zone = style.safeZone;
    const bottom = box ? box.y + box.h : (point as Point).y;
    if (bottom > zone.contentMaxY + 0.5) fail(`${where}: ${def.type} уходит ниже безопасной зоны (y ${Math.round(bottom)} px > ${zone.contentMaxY})`);
    // Shorts safe zone for text: the top 8 % belongs to the player (ROADMAP D6)
    if (def.layer === "text" && box && box.y < textSchema().bands.safeTop - 0.5) fail(`${where}: текст ${def.type} выше безопасной зоны (y ${Math.round(box.y)} px < ${textSchema().bands.safeTop})`);
    if (def.layer === "text" && box && box.x + box.w > zone.rightRail.x && box.y + box.h > zone.rightRail.yFrom) fail(`${where}: текст заходит в правую полосу кнопок (x > ${zone.rightRail.x} при y ${zone.rightRail.yFrom}–${zone.rightRail.yTo})`);
  }
  return { box, point, word: null };
}

// ── beat ─────────────────────────────────────────────────────────────────────────────────────────

export function checkDeviceSpec(dev: unknown, i: number, beatId: string, regions: Record<string, unknown>, spoken: string[], style: StyleDef): DeviceDef {
  const where = `${beatId}: devices[${i}]`;
  if (!isObj(dev)) fail(`${where}: {type, target, at, params, explains}`);
  for (const key of Object.keys(dev)) if (!["type", "target", "at", "until", "params", "explains", "source", "sync"].includes(key)) fail(`${where}: неизвестное поле ${key}`);
  if (dev.type === "text.caption") fail(`${where}: субтитры — не устройство в devices, а поле caption бита (или captions ролика)`);
  if (dev.sync !== undefined && !SYNC_VALUES.includes(dev.sync as string)) fail(`${where}: sync — ${SYNC_VALUES.join(", ")}`);
  const def = loadDevice(String(dev.type), where);
  const params = deviceParams(def, dev.params as Record<string, unknown> | undefined, `${where} (${def.type})`);
  for (const [name, p] of Object.entries(def.params)) if (p.type === "at" && typeof params[name] === "string") checkAt(params[name], spoken, `${where} (${def.type}).${name}`);
  for (const [name, p] of Object.entries(def.params)) {
    if (p.type !== "ats") continue;
    ((params[name] as unknown[]) ?? []).forEach((v, k) => {
      if (typeof v === "string") checkAt(v, spoken, `${where} (${def.type}).${name}[${k}]`);
    });
  }
  resolveTarget(dev.target, def, regions, spoken, style, `${where} (${def.type})`);
  if (dev.at !== undefined) checkAt(dev.at, spoken, `${where}.at`);
  if (dev.until !== undefined) checkAt(dev.until, spoken, `${where}.until`);
  if (dev.explains !== undefined && (typeof dev.explains !== "string" || !dev.explains.trim())) fail(`${where}: explains — строка: что объясняет пометка`);
  if (def.explains && !dev.explains) fail(`${where}: у ${def.type} обязателен explains — что зритель поймёт из этой пометки`);
  if (dev.source !== undefined && !/^https?:\/\//.test(String(dev.source))) fail(`${where}: source — ссылка http(s)`);
  return def;
}

/** Devices of a timed beat → the runtime config (engine/devices/runtime.js). */
export function resolveDevices(devices: DeviceSpec[], dominant: "stage" | number | undefined, regions: Record<string, unknown>, clock: Clock, style: StyleDef, beatId: string, beatSync?: string): ResolvedDevice[] {
  return devices.map((dev, index) => {
    const where = `${beatId}: devices[${index}] (${dev.type})`;
    const def = loadDevice(dev.type, where);
    const params = deviceParams(def, dev.params, where);
    const target = resolveTarget(dev.target, def, regions, clock.spoken, style, where);
    const sync = dev.sync ?? beatSync ?? "voice";
    let at = atSeconds(dev.at, clock, Math.min(clock.speechStart + 0.2 * index, clock.duration - 0.1), `${where}.at`);
    const grid = clock.grid ?? null;
    if (sync !== "voice") {
      if (!grid || !grid.beats.length) fail(`${where}: sync ${sync} — у ролика нет музыки с сеткой битов (video.json music)`);
      const beats = (grid as { beats: number[] }).beats;
      const near = beats.reduce((best, b) => (Math.abs(b - at) < Math.abs(best - at) ? b : best), beats[0] as number);
      // music — the nearest beat of the track; both — the word says what, the nearest beat ≤ 100 ms away says when
      if (sync === "music" || Math.abs(near - at) <= 0.1) at = r3(Math.min(Math.max(0, near), clock.duration - 0.05));
    }
    let until = dev.until === undefined ? null : atSeconds(dev.until, clock, clock.duration, `${where}.until`);
    if (until !== null && until <= at) fail(`${where}: until (${until} с) раньше at (${at} с)`);
    if (dev.type === "edit.hold" && until === null) until = r3(Math.min(clock.duration - 0.05, at + Number(params.dur)));
    // at-params become seconds after the device's own at, so the device adds them to dev.at
    for (const [name, p] of Object.entries(def.params)) if (p.type === "at" && typeof params[name] === "string") params[name] = r3(Math.max(0, atSeconds(params[name] as string, clock, at, `${where}.${name}`) - at));
    // ats: every word → seconds after the device's at (numbers already are offsets)
    for (const [name, p] of Object.entries(def.params)) {
      if (p.type !== "ats") continue;
      params[name] = ((params[name] as (string | number)[]) ?? []).map((v, k) => (typeof v === "string" ? r3(Math.max(0, atSeconds(v, clock, at, `${where}.${name}[${k}]`) - at)) : v));
    }
    return { type: dev.type, index, layer: def.layer, at, until, params, box: target.box, point: target.point, word: target.word, explains: dev.explains ?? null, dominant: dominant === index, sync, grid: sync === "voice" ? null : grid };
  });
}

export function deviceEvents(devs: ResolvedDevice[]): { t: number; label: string }[] {
  const out: { t: number; label: string }[] = [];
  for (const dev of devs) {
    const def = loadDevice(dev.type);
    for (const ev of def.events) {
      const off = typeof ev.offset === "number" ? ev.offset : Number(dev.params[ev.offset] ?? 0);
      out.push({ t: r3(dev.at + off), label: `${dev.type}: ${ev.label}` });
    }
    // words placed on words of the voice (ats params, e.g. text.kinetic wordsAt) change the frame one by one: each is an
    // event, so the frame settles after the last one (a settle on the swap itself failed `settled` — TRAPS.md)
    for (const [name, p] of Object.entries(def.params)) {
      if (p.type !== "ats") continue;
      for (const off of (dev.params[name] as unknown[] | undefined) ?? []) if (typeof off === "number") out.push({ t: r3(dev.at + off), label: `${dev.type}: word` });
    }
  }
  return out;
}

/** Digits a device puts on screen (figure params) — each needs the device's `source`. */
export function deviceFigures(dev: DeviceSpec): string[] {
  const def = loadDevice(dev.type);
  const params = { ...Object.fromEntries(Object.entries(def.params).map(([k, p]) => [k, p.default])), ...(dev.params ?? {}) };
  const out: string[] = [];
  for (const name of def.figures) {
    const v = params[name];
    const text = Array.isArray(v) ? v.join(" ") : v === undefined || v === null ? "" : String(v);
    if (/\d/.test(text) && !(typeof v === "number" && v === 0 && name === "from")) out.push(`${name} = ${JSON.stringify(v)}`);
  }
  return out;
}

/** engine/devices/runtime.js + engine/stage/runtime.js + every device.js → assets/hygen/devices.js. */
export function installDevices(dir: string): void {
  // text.kinetic texture: the luminance masks of registry texture-mask-text (engine/devices/vendor/texture-mask-text/masks)
  const masks = join(ENGINE_DIR, "devices", "vendor", "texture-mask-text", "masks");
  if (existsSync(masks)) copyInto(masks, join(dir, "assets", "hygen", "masks"));
  const parts = [textSchemaScript(), readFileSync(join(ENGINE_DIR, "devices", "text.js"), "utf8"), readFileSync(join(ENGINE_DIR, "devices", "runtime.js"), "utf8"), readFileSync(join(ENGINE_DIR, "stage", "runtime.js"), "utf8")];
  // text.caption plays in the captions layer (engine/src/captions.ts → assets/hygen/captions.js), not inside a stage beat
  for (const type of deviceTypes()) if (type !== "text.caption") parts.push(readFileSync(join(ENGINE_DIR, "devices", type, "device.js"), "utf8"));
  ensureDir(join(dir, "assets", "hygen"));
  writeFileSync(join(dir, "assets", "hygen", "devices.js"), parts.join("\n"));
}
