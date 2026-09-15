import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LIBRARY_DIR, fail, readJson } from "./lib/util.ts";

// Registries of the motion library (library/motion/*.json) and of the transitions (library/transitions/<id>/):
// what a look or a beat may name, with the parameters checked here. The runtime that plays them is
// library/motion/runtime.js (host-root layers) and library/motion/type.js (inside a scene).

export interface CameraSpec {
  preset: string;
  /** 1 = push 4 %, pan/tilt 36 px, handheld ±7 px and ±0.35°. */
  amplitude: number;
  /** Shake on the hits of sound.hits: 1 = 16 px decaying over 0.35 s. */
  shake: number;
}

export interface PostSpec {
  id: string;
  strength: number;
}

export type TransitionRef = string[];

export const PARALLAX_DEFAULTS = { bg: 0.35, mid: 0.7, scene: 1, fg: 1.3 };
export const TEXT_KINDS = ["number", "title", "label"];

interface Registry {
  presets: Record<string, string>;
}

const registry = (name: string): Registry => {
  const path = join(LIBRARY_DIR, "motion", `${name}.json`);
  if (!existsSync(path)) fail(`нет реестра library/motion/${name}.json`);
  return readJson<Registry>(path);
};

export const cameraPresets = (): string[] => Object.keys(registry("camera").presets);
export const typePresets = (): string[] => Object.keys(registry("type").presets);
export const postEffects = (): string[] => Object.keys(registry("post").presets);

export function transitionIds(): string[] {
  const root = join(LIBRARY_DIR, "transitions");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "transition.json")))
    .map((d) => d.name)
    .sort();
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function checkCamera(value: unknown, where: string, partial = false): CameraSpec {
  const spec = typeof value === "string" ? { preset: value } : value;
  if (!isObj(spec)) fail(`${where}: {preset, amplitude, shake} или имя пресета`);
  for (const key of Object.keys(spec)) if (!["preset", "amplitude", "shake", "reason"].includes(key)) fail(`${where}: неизвестное поле ${key}`);
  if (spec.reason !== undefined && !["approach", "reveal", "follow", "tension"].includes(spec.reason as string)) fail(`${where}: reason — approach, reveal, follow или tension`);
  const presets = cameraPresets();
  if (spec.preset !== undefined && !presets.includes(spec.preset as string)) fail(`${where}: preset — одно из ${presets.join(", ")}`);
  if (!partial && spec.preset === undefined) fail(`${where}: нет preset`);
  for (const key of ["amplitude", "shake"]) {
    const v = spec[key];
    if (v !== undefined && (typeof v !== "number" || v < 0 || v > 2)) fail(`${where}: ${key} — число 0–2`);
  }
  return { preset: (spec.preset as string) ?? "none", amplitude: (spec.amplitude as number) ?? 0.6, shake: (spec.shake as number) ?? 0 };
}

export function checkPost(value: unknown, where: string): PostSpec {
  const spec = typeof value === "string" ? { id: value } : value;
  if (!isObj(spec)) fail(`${where}: {id, strength}`);
  for (const key of Object.keys(spec)) if (!["id", "strength"].includes(key)) fail(`${where}: неизвестное поле ${key}`);
  const ids = postEffects();
  if (!ids.includes(spec.id as string)) fail(`${where}: id — одно из ${ids.join(", ")}`);
  const s = spec.strength ?? 0.5;
  if (typeof s !== "number" || s < 0 || s > 1) fail(`${where}: strength — 0–1`);
  return { id: spec.id as string, strength: s };
}

/** Text kind (look) or scene text slot (beat) → preset. */
export function checkTypeMap(value: unknown, where: string, kinds: boolean): Record<string, string> {
  if (!isObj(value)) fail(`${where}: {${kinds ? "number|title|label" : "слот"}: пресет}`);
  const presets = typePresets();
  for (const [key, preset] of Object.entries(value)) {
    if (kinds && !TEXT_KINDS.includes(key)) fail(`${where}: ключ ${key} — один из ${TEXT_KINDS.join(", ")}`);
    if (typeof preset !== "string" || !presets.includes(preset)) fail(`${where}.${key}: пресет — один из ${presets.join(", ")}`);
  }
  return value as Record<string, string>;
}

/** "flash" or ["flash", "ash-burst"] → list of library transitions played over the same cut. */
export function checkTransitionRef(value: unknown, where: string): TransitionRef {
  const list = typeof value === "string" ? value.split("+") : value;
  if (!Array.isArray(list) || !list.length) fail(`${where}: id перехода или список id`);
  const ids = transitionIds();
  for (const id of list as unknown[]) if (typeof id !== "string" || !ids.includes(id)) fail(`${where}: «${String(id)}» — нет перехода (есть: ${ids.join(", ")})`);
  return list as string[];
}
