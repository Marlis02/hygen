import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { StyleDef } from "./contract.ts";
import { toneColors } from "./contract.ts";
import type { CameraSpec, PostSpec, TransitionRef } from "./motion.ts";
import { checkCamera, checkPost, checkTransitionRef, checkTypeMap, PARALLAX_DEFAULTS } from "./motion.ts";
import type { TextureRef } from "./textures.ts";
import { checkTextureRefs } from "./textures.ts";
import { checkCaptionFields } from "./captions.ts";
import { captionFamilies, familyOf } from "./text.ts";
import { ENGINE_DIR, fail, readJson } from "./lib/util.ts";

// The look of one video (engine/looks/<id>/look.json or an inline object in project.json): palette over the
// style tokens, textures, motion, transitions, grain, vignette and sound hints. Scenes never read it — the
// build hands them the looked token table, the engine layers read the same palette as CSS variables.

export interface LookDef {
  id: string;
  name: string;
  about: { mood: string; topics: string; avoid: string };
  palette: {
    accent: string;
    secondary: string;
    groundTint: string | null;
    temperature: "warm" | "cold";
    textColor: string;
    /** Explicit overrides of any style colour token, applied last. */
    colors?: Record<string, string>;
  };
  textures: TextureRef[];
  motion: {
    camera: CameraSpec;
    parallax: { enabled: boolean; bg: number; mid: number; scene: number; fg: number };
    /** Text kind (number, title, label) → type preset. */
    type: Record<string, string>;
    post: PostSpec[];
  };
  transitions: { default: TransitionRef; hit: TransitionRef };
  /** Multiplier of the style's film grain; 0 — no grain. */
  grain: number;
  vignette: { alpha: number; clear: number };
  sound: { hit: string; whoosh: string };
  /** Caption defaults of the world (engine/devices/text.caption): family calm | explainer | energetic, preset, activeWord and any caption field. */
  captions: { family: string; preset: string; activeWord: string; [key: string]: string };
  /** kinetic: true — a typographic world, text.kinetic is not limited to 2 beats of a video. */
  typography: { kinetic: boolean };
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const TOP_KEYS = ["$schema", "id", "name", "about", "palette", "textures", "motion", "transitions", "grain", "vignette", "sound", "captions", "typography"];
const PALETTE_KEYS = ["accent", "secondary", "groundTint", "temperature", "textColor", "colors"];
const MOTION_KEYS = ["camera", "parallax", "type", "post"];

// ── colour ───────────────────────────────────────────────────────────────────────────────────────

export type Rgb = [number, number, number];
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const hexRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

export const rgbHex = (rgb: Rgb): string =>
  "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();

export function rgbHsl([r0, g0, b0]: Rgb): [number, number, number] {
  const r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslHex(h: number, s: number, l: number): string {
  const hh = ((((h % 360) + 360) % 360) / 360);
  const ss = clamp01(s), ll = clamp01(l);
  if (ss === 0) return rgbHex([ll * 255, ll * 255, ll * 255]);
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const f = (t0: number): number => {
    const t = (t0 + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return rgbHex([f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255]);
}

export const hueOf = (hex: string): number => rgbHsl(hexRgb(hex))[0];

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** base → base, deep, hot, light: the same relation the documentary-dark accent family has. */
function family(hex: string): [string, string, string, string] {
  const [h, s, l] = rgbHsl(hexRgb(hex));
  return [hex.toUpperCase(), hslHex(h - 2, s * 0.88, Math.min(0.26, l * 0.46)), hslHex(h + 5, s, l + (1 - l) * 0.23), hslHex(h + 9, s, l + (1 - l) * 0.41)];
}

/** Neutral ramp of the style (grounds, ash, muted text) re-tinted: lightness kept, hue from the tint, saturation fades toward light greys. */
const NEUTRALS = ["night", "ashDeep", "plane", "ash3", "ground", "ashMid", "dim", "ashLight", "muted", "mutedLight"];

function retint(hex: string, tintHex: string): string {
  const [, , l] = rgbHsl(hexRgb(hex));
  const [th, ts] = rgbHsl(hexRgb(tintHex));
  return hslHex(th, ts * (1 - 0.5 * l), l);
}

// ── load ─────────────────────────────────────────────────────────────────────────────────────────

export function lookIds(): string[] {
  const root = join(ENGINE_DIR, "looks");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "look.json")))
    .map((d) => d.name)
    .sort();
}

function readLookFile(id: string, where: string): Record<string, unknown> {
  const path = join(ENGINE_DIR, "looks", id, "look.json");
  if (!existsSync(path)) fail(`${where}: нет look «${id}» (есть: ${lookIds().join(", ")})`);
  return readJson<Record<string, unknown>>(path);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Inline look: {"extends": "abyss", …} — nested sections merge key by key, lists replace. */
function mergeLook(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (key === "extends") continue;
    if (isObj(value) && isObj(base[key]) && key !== "palette") out[key] = mergeLook(base[key] as Record<string, unknown>, value);
    else if (key === "palette" && isObj(value) && isObj(base[key])) out[key] = { ...(base[key] as Record<string, unknown>), ...value };
    else out[key] = value;
  }
  return out;
}

/** project.json → look: a built-in id, an inline object (optionally {"extends": id}) or nothing (ember). */
export function loadLook(ref: unknown, where = "project.json: look"): LookDef {
  let raw: Record<string, unknown>;
  if (ref === undefined || ref === null) raw = readLookFile("ember", where);
  else if (typeof ref === "string") raw = readLookFile(ref, where);
  else if (isObj(ref)) {
    const base = typeof ref.extends === "string" ? readLookFile(ref.extends, where) : {};
    if (ref.extends !== undefined && typeof ref.extends !== "string") fail(`${where}: extends — id встроенного look`);
    raw = mergeLook(base, ref);
    if (typeof ref.id !== "string") raw.id = typeof ref.extends === "string" ? `${ref.extends}-custom` : "custom";
    if (typeof ref.name !== "string" && typeof raw.name !== "string") raw.name = String(raw.id);
  } else {
    fail(`${where}: строка (id из engine/looks) или объект look`);
  }
  return validateLook(raw, where);
}

export function validateLook(raw: Record<string, unknown>, where: string): LookDef {
  const bad = (msg: string): never => fail(`${where}: ${msg}`);
  const unknown = (obj: Record<string, unknown>, keys: string[], section: string): void => {
    for (const key of Object.keys(obj)) if (!keys.includes(key)) bad(`неизвестное поле ${section}${key}`);
  };
  unknown(raw, TOP_KEYS, "");
  if (typeof raw.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(raw.id)) bad("id — строчная латиница");
  if (typeof raw.name !== "string") bad("нет name");
  const about = raw.about;
  if (about !== undefined) {
    if (!isObj(about)) bad("about — {mood, topics, avoid}");
    unknown(about as Record<string, unknown>, ["mood", "topics", "avoid"], "about.");
  }
  const pal = raw.palette;
  if (!isObj(pal)) bad("нет palette");
  const p = pal as Record<string, unknown>;
  unknown(p, PALETTE_KEYS, "palette.");
  for (const key of ["accent", "secondary", "textColor"]) if (typeof p[key] !== "string" || !HEX_RE.test(p[key] as string)) bad(`palette.${key} — #RRGGBB`);
  if (p.groundTint !== null && p.groundTint !== undefined && (typeof p.groundTint !== "string" || !HEX_RE.test(p.groundTint))) bad("palette.groundTint — #RRGGBB или null");
  if (p.temperature !== "warm" && p.temperature !== "cold") bad("palette.temperature — warm или cold");
  if (p.colors !== undefined) {
    if (!isObj(p.colors)) bad("palette.colors — {токен: #RRGGBB}");
    for (const [k, v] of Object.entries(p.colors as Record<string, unknown>)) if (typeof v !== "string" || !HEX_RE.test(v)) bad(`palette.colors.${k} — #RRGGBB`);
  }

  const textures = raw.textures ?? [];
  if (!Array.isArray(textures)) bad("textures — список {id, …параметры}");
  checkTextureRefs(textures as TextureRef[], `${where}: textures`);
  if ((textures as TextureRef[]).some((t) => t.id === "grain")) bad("textures: зерно задаётся полем grain (множитель), а не текстурой");

  const motion = (raw.motion ?? {}) as Record<string, unknown>;
  if (!isObj(motion)) bad("motion — {camera, parallax, type, post}");
  unknown(motion, MOTION_KEYS, "motion.");
  const camera = checkCamera(motion.camera ?? { preset: "none" }, `${where}: motion.camera`);
  const par = (motion.parallax ?? { enabled: false }) as Record<string, unknown>;
  if (!isObj(par)) bad("motion.parallax — {enabled, bg, mid, scene, fg}");
  unknown(par, ["enabled", "bg", "mid", "scene", "fg"], "motion.parallax.");
  for (const k of ["bg", "mid", "scene", "fg"]) if (par[k] !== undefined && (typeof par[k] !== "number" || (par[k] as number) < 0 || (par[k] as number) > 3)) bad(`motion.parallax.${k} — число 0–3`);
  if (par.enabled !== undefined && typeof par.enabled !== "boolean") bad("motion.parallax.enabled — true/false");
  const parallax = { ...PARALLAX_DEFAULTS, ...(par as object), enabled: par.enabled === true } as LookDef["motion"]["parallax"];
  const type = checkTypeMap(motion.type ?? {}, `${where}: motion.type`, true);
  const postRaw = motion.post ?? [];
  if (!Array.isArray(postRaw)) bad("motion.post — список {id, strength}");
  const post = (postRaw as unknown[]).map((x, i) => checkPost(x, `${where}: motion.post[${i}]`));

  const tr = (raw.transitions ?? { default: "hard-cut", hit: "hard-cut" }) as Record<string, unknown>;
  if (!isObj(tr)) bad("transitions — {default, hit}");
  unknown(tr, ["default", "hit"], "transitions.");
  const transitions = {
    default: checkTransitionRef(tr.default ?? "hard-cut", `${where}: transitions.default`),
    hit: checkTransitionRef(tr.hit ?? "hard-cut", `${where}: transitions.hit`),
  };

  const grain = raw.grain ?? 1;
  if (typeof grain !== "number" || grain < 0 || grain > 3) bad("grain — множитель зерна стиля 0–3");
  const vig = (raw.vignette ?? {}) as Record<string, unknown>;
  if (!isObj(vig)) bad("vignette — {alpha, clear}");
  unknown(vig, ["alpha", "clear"], "vignette.");
  const alpha = vig.alpha ?? 0.6, clear = vig.clear ?? 55;
  if (typeof alpha !== "number" || alpha < 0 || alpha > 1) bad("vignette.alpha — 0–1");
  if (typeof clear !== "number" || clear < 0 || clear > 100) bad("vignette.clear — 0–100 (% радиуса без затемнения)");
  const snd = (raw.sound ?? {}) as Record<string, unknown>;
  if (!isObj(snd)) bad("sound — {hit, whoosh}");
  unknown(snd, ["hit", "whoosh"], "sound.");
  const cap = checkCaptionFields(raw.captions ?? { family: "calm", preset: "plain", activeWord: "none" }, `${where}: captions`, true) as Record<string, string>;
  const capFamily = cap.family ?? (cap.preset ? familyOf(cap.preset) : null) ?? "calm";
  const typo = (raw.typography ?? {}) as Record<string, unknown>;
  if (!isObj(typo)) bad("typography — {kinetic}");
  unknown(typo, ["kinetic"], "typography.");
  if (typo.kinetic !== undefined && typeof typo.kinetic !== "boolean") bad("typography.kinetic — true/false");

  return {
    captions: { ...cap, family: capFamily, preset: cap.preset ?? captionFamilies()[capFamily]?.[0] ?? "plain", activeWord: cap.activeWord ?? "none" },
    typography: { kinetic: typo.kinetic === true },
    id: raw.id as string,
    name: raw.name as string,
    about: { mood: "", topics: "", avoid: "", ...((about as object) ?? {}) },
    palette: { ...(p as LookDef["palette"]), groundTint: (p.groundTint as string | null | undefined) ?? null },
    textures: textures as TextureRef[],
    motion: { camera, parallax, type, post },
    transitions,
    grain: grain as number,
    vignette: { alpha: alpha as number, clear: clear as number },
    sound: { hit: String(snd.hit ?? "thud"), whoosh: String(snd.whoosh ?? "air") },
  };
}

// ── apply ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Style tokens under a look. A palette colour equal to the style's own keeps the style's family untouched
 * (ember = the documentary-dark tokens byte for byte); a new accent / secondary derives deep, hot and light.
 */
export function applyLook(style: StyleDef, look: LookDef): StyleDef {
  const colors = { ...style.colors };
  const same = (a: string | undefined, b: string): boolean => (a ?? "").toUpperCase() === b.toUpperCase();
  const pal = look.palette;
  if (!same(style.colors.accent, pal.accent)) {
    [colors.accent, colors.accentDeep, colors.accentHot, colors.accentLight] = family(pal.accent);
  }
  if (!same(style.colors.cold, pal.secondary)) {
    [colors.cold, colors.coldDeep, colors.coldHot, colors.coldLight] = family(pal.secondary);
  }
  if (pal.groundTint) for (const name of NEUTRALS) if (colors[name]) colors[name] = retint(colors[name] as string, pal.groundTint);
  if (!same(style.colors.text, pal.textColor)) colors.text = pal.textColor.toUpperCase();
  for (const [name, value] of Object.entries(pal.colors ?? {})) {
    if (!style.colors[name]) fail(`look ${look.id}: palette.colors.${name} — в стиле нет такого цвета`);
    colors[name] = value.toUpperCase();
  }
  const g = look.grain;
  return {
    ...style,
    colors,
    grain: { dark: g === 1 ? style.grain.dark : Math.round(style.grain.dark * g * 1000) / 1000, light: g === 1 ? style.grain.light : Math.round(style.grain.light * g * 1000) / 1000 },
    vignette: { ...style.vignette, alpha: look.vignette.alpha, clear: look.vignette.clear },
  };
}

/** CSS custom properties of the looked palette for the engine layers: --hy-<token> and --hy-rgb-<token>. */
export function paletteCss(style: StyleDef): string {
  const lines: string[] = [];
  for (const [name, hex] of Object.entries(toneColors(style, "accent"))) {
    lines.push(`--hy-${name}: ${hex};`, `--hy-rgb-${name}: ${hexRgb(hex).join(", ")};`);
  }
  return `:root { ${lines.join(" ")} }`;
}
