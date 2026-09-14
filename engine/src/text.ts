import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_DIR, fail, readJson } from "./lib/util.ts";

// The shared text schema of every text on screen (engine/devices/text.schema.json, ROADMAP D6): text.title, text.quote,
// annotate.label, text.caption, text.kinetic take the same fields — type, font, size, case, color, background, position.
// Caption presets (engine/devices/text.caption/presets) and their families (families.json) live here too.

export interface TextParamDef {
  type: string;
  values?: string[];
  default: unknown;
  maxLength?: number;
  description: string;
}

export interface Band {
  top: number;
  bottom: number;
  align: "start" | "center" | "end";
  maxWidth: number;
}

export interface TextSchema {
  params: Record<string, TextParamDef>;
  scales: Record<string, Record<string, number>>;
  bands: { safeTop: number; safeBottom: number; bottom: Band; center: Band; top: Band; "near-target": { gap: number; maxWidth: number } };
}

let schema: TextSchema | null = null;

export function textSchema(): TextSchema {
  if (!schema) schema = readJson<TextSchema>(join(ENGINE_DIR, "devices", "text.schema.json"));
  return schema;
}

/** Scales and bands for the browser side (engine/devices/text.js reads window.HygenTextSchema). */
export const textSchemaScript = (): string => `window.HygenTextSchema = ${JSON.stringify({ scales: textSchema().scales, bands: textSchema().bands })};`;

export const TEXT_FIELDS = ["type", "font", "size", "case", "color", "background", "position"];
export const SYNC_VALUES = ["voice", "music", "both"];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** text | accent | secondary | cold | a palette token | #RRGGBB → #RRGGBB (colors — the tone table of the beat). */
export function textColor(colors: Record<string, string>, v: string, where: string): string {
  if (HEX_RE.test(v)) return v.toUpperCase();
  if (v === "secondary" || v === "cold") return colors.cold as string;
  const hit = colors[v];
  if (!hit) return fail(`${where}: цвет «${v}» — text, accent, secondary, cold, токен палитры или #RRGGBB`);
  return hit;
}

const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The palette colour that reads best on bg. */
export function inkOn(colors: Record<string, string>, bg: string): string {
  let best = colors.text as string;
  let score = 0;
  for (const k of ["night", "text", "white", "black"]) {
    const c = colors[k];
    if (!c) continue;
    const s = contrastRatio(c, bg);
    if (s > score) {
      score = s;
      best = c;
    }
  }
  return best;
}

// ── caption presets and families ──────────────────────────────────────────────────────────────────

const CAPTION_DIR = join(ENGINE_DIR, "devices", "text.caption");

export function captionPresetNames(): string[] {
  const dir = join(CAPTION_DIR, "presets");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.slice(0, -3))
    .sort();
}

export const CAPTION_FAMILIES = ["calm", "explainer", "energetic"];

export function captionFamilies(): Record<string, string[]> {
  const file = join(CAPTION_DIR, "families.json");
  if (!existsSync(file)) return { calm: ["plain", "karaoke", "typewriter"], explainer: [], energetic: [] };
  return readJson<Record<string, string[]>>(file);
}

export function familyOf(preset: string): string | null {
  for (const [family, list] of Object.entries(captionFamilies())) if (list.includes(preset)) return family;
  return null;
}

/** A preset that exists as a file; the family says where it belongs. */
export function checkCaptionPreset(preset: unknown, where: string): string {
  const names = captionPresetNames();
  if (typeof preset !== "string" || !names.includes(preset)) fail(`${where}: пресет субтитров «${String(preset)}» — одно из: ${names.join(", ")}`);
  return preset as string;
}
