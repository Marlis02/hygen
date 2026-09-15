import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BeatSpec } from "./spec.ts";
import { ENGINE_DIR, fail, readJson, sha } from "./lib/util.ts";

// Intent resolver (engine/scenes/CONTRACT.md, «Бит v2»): a table, not heuristics over the text. An intent
// (engine/intents/<id>.json) or a JSON recipe (engine/scenes/recipes/<id>.json, used as `scene`) gives a default stage,
// default devices, dominant and camera; placeholders take the beat's shorthand fields — $target, $at[±s], $data.<key>
// — and every explicit field of the beat wins. Pure function of project.json and the tables: the same input gives the
// same expanded beat (build/beats.expanded.json).

export interface TemplateDef {
  id: string;
  name?: string;
  use: string;
  stage: { types: string[]; default?: Record<string, unknown> };
  devices: Record<string, unknown>[];
  dominant: "stage" | number;
  camera?: Record<string, unknown> | null;
  /** Shorthand fields the beat must give: "target", "at", "data.<key>". */
  requires?: string[];
  rhythm?: { density?: number; note: string };
  demo?: { text?: string; target?: unknown; data?: Record<string, unknown>; stage?: Record<string, unknown> };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function tableIds(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();
}

export const intentIds = (): string[] => tableIds(join(ENGINE_DIR, "intents"));
export const recipeIds = (): string[] => tableIds(join(ENGINE_DIR, "scenes", "recipes"));
export const isRecipe = (id: string): boolean => existsSync(join(ENGINE_DIR, "scenes", "recipes", `${id}.json`));

function loadTemplate(kind: "intent" | "recipe", id: string): TemplateDef {
  const file = kind === "intent" ? join(ENGINE_DIR, "intents", `${id}.json`) : join(ENGINE_DIR, "scenes", "recipes", `${id}.json`);
  if (!existsSync(file)) fail(`нет ${kind === "intent" ? "intent" : "рецепта"} «${id}»; есть: ${(kind === "intent" ? intentIds() : recipeIds()).join(", ")}`);
  const t = readJson<TemplateDef>(file);
  const where = kind === "intent" ? `engine/intents/${id}.json` : `engine/scenes/recipes/${id}.json`;
  if (t.id !== id) fail(`${where}: id «${t.id}» не совпадает с именем файла`);
  if (!isObj(t.stage) || !Array.isArray(t.stage.types) || !t.stage.types.length) fail(`${where}: stage.types — список допустимых stage`);
  if (!Array.isArray(t.devices)) fail(`${where}: devices — список`);
  if (t.dominant !== "stage" && typeof t.dominant !== "number") fail(`${where}: dominant — "stage" или индекс устройства`);
  return t;
}

export const loadIntent = (id: string): TemplateDef => loadTemplate("intent", id);
export const loadRecipe = (id: string): TemplateDef => loadTemplate("recipe", id);

const MISSING = Symbol("missing");

function substitute(value: unknown, beat: BeatSpec, where: string): unknown {
  if (typeof value === "string" && value.startsWith("$")) {
    const m = /^\$(target|at|data\.([A-Za-z0-9_]+))(?:([+-]\d+(?:\.\d+)?))?(?:\|(.*))?$/.exec(value);
    if (!m) fail(`${where}: не понимаю подстановку «${value}»`);
    const fallback = m[4];
    let v: unknown;
    if (m[1] === "target") v = beat.target;
    else if (m[1] === "at") v = beat.at ?? "speech";
    else v = beat.data?.[m[2] as string];
    if (v === undefined) {
      if (fallback === undefined) return MISSING;
      return /^-?\d+(\.\d+)?$/.test(fallback) ? Number(fallback) : fallback === "true" ? true : fallback === "false" ? false : fallback;
    }
    if (m[3] && m[1] === "at") {
      const off = Number(m[3]);
      if (typeof v === "number") return Math.round((v + off) * 1000) / 1000;
      const inner = /^(.*?)([+-]\d+(?:\.\d+)?)?$/.exec(String(v)) as RegExpExecArray;
      const sum = Math.round((Number(inner[2] ?? 0) + off) * 1000) / 1000;
      return `${inner[1]}${sum >= 0 ? "+" : ""}${sum}`;
    }
    return v;
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, beat, where)).filter((v) => v !== MISSING);
  if (isObj(value)) {
    // a template device with "if": "$data.key" is dropped when the beat does not give that key
    if (typeof value.if === "string") {
      if (substitute(value.if, beat, `${where}.if`) === MISSING) return MISSING;
      const { if: _drop, ...rest } = value;
      return substitute(rest, beat, where);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const s = substitute(v, beat, `${where}.${k}`);
      if (s !== MISSING) out[k] = s;
    }
    return out;
  }
  return value;
}

/** One beat → stage + devices (scene beats with an HTML scene pass through untouched). */
export function expandBeat(beat: BeatSpec, htmlScene: (id: string) => boolean): BeatSpec {
  if (beat.scene !== undefined && htmlScene(beat.scene)) {
    for (const key of ["stage", "devices", "intent", "dominant", "target", "data", "at"] as const) {
      if (beat[key] !== undefined) fail(`${beat.id}: сцена с HTML (${beat.scene}) не сочетается с ${key} — бит либо scene, либо stage`);
    }
    return beat;
  }
  let tpl: TemplateDef | null = null;
  let kind = "";
  if (beat.scene !== undefined) {
    if (!isRecipe(beat.scene)) fail(`${beat.id}: нет сцены engine/scenes/${beat.scene}/scene.json и рецепта engine/scenes/recipes/${beat.scene}.json`);
    if (beat.intent !== undefined) fail(`${beat.id}: рецепт ${beat.scene} и intent ${beat.intent} вместе — выбери одно`);
    tpl = loadRecipe(beat.scene);
    kind = `рецепт ${beat.scene}`;
  } else if (beat.intent !== undefined) {
    tpl = loadIntent(beat.intent);
    kind = `intent ${beat.intent}`;
  }
  const out: BeatSpec = { ...beat };
  if (!tpl) {
    if (!beat.stage) fail(`${beat.id}: нужен scene, stage или intent`);
    return out;
  }
  const where = `${beat.id} (${kind})`;
  for (const req of tpl.requires ?? []) {
    const ok = req === "target" ? beat.target !== undefined : req === "at" ? beat.at !== undefined : req.startsWith("data.") ? beat.data?.[req.slice(5)] !== undefined : true;
    if (!ok && !(req === "target" && beat.devices) && !(req.startsWith("data.") && beat.devices)) fail(`${where}: нужно поле ${req}`);
  }
  const tplStage = tpl.stage.default ? (substitute(tpl.stage.default, beat, `${where}: stage`) as Record<string, unknown>) : undefined;
  let stage: Record<string, unknown> | undefined;
  if (beat.stage) stage = tplStage && tplStage.type === beat.stage.type ? { ...tplStage, ...beat.stage } : { ...beat.stage };
  else stage = tplStage;
  if (!stage) fail(`${where}: у шаблона нет stage по умолчанию — задай stage (${tpl.stage.types.join(" | ")})`);
  if (!tpl.stage.types.includes(String(stage.type))) fail(`${where}: stage ${String(stage.type)} не подходит — нужен ${tpl.stage.types.join(" | ")}`);
  out.stage = stage as BeatSpec["stage"];
  out.devices = beat.devices ?? (substitute(tpl.devices, beat, `${where}: devices`) as BeatSpec["devices"]);
  out.dominant = beat.dominant ?? tpl.dominant;
  if (beat.camera === undefined && tpl.camera) out.camera = substitute(tpl.camera, beat, `${where}: camera`);
  if (beat.scene !== undefined) {
    out.recipe = beat.scene;
    delete out.scene;
  }
  delete out.target;
  delete out.data;
  delete out.at;
  return out;
}

/** Hash of everything the resolver reads: the beats and the tables. */
export function resolverInputHash(beats: BeatSpec[]): string {
  const tables: string[] = [];
  for (const id of intentIds()) tables.push(readFileSync(join(ENGINE_DIR, "intents", `${id}.json`), "utf8"));
  for (const id of recipeIds()) tables.push(readFileSync(join(ENGINE_DIR, "scenes", "recipes", `${id}.json`), "utf8"));
  return sha({ beats, tables });
}
