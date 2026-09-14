import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FontDef, StyleDef } from "./contract.ts";
import { fontFaces, fontStack, toneColors } from "./contract.ts";
import type { Box } from "./devices.ts";
import { boxPx, pctBox, pctPoint, pointPx } from "./devices.ts";
import type { LookDef } from "./look.ts";
import type { CameraSpec } from "./motion.ts";
import { beatCamera, videoSeed } from "./layers.ts";
import type { BeatSpec, VideoSpec } from "./spec.ts";
import type { BeatTiming } from "./timeline.ts";
import type { BeatWords } from "./words.ts";
import { CAPTION_FAMILIES, captionFamilies, checkCaptionPreset, familyOf, inkOn, textColor, textSchema, textSchemaScript } from "./text.ts";
import { ENGINE_DIR, ensureDir, fail, hyperframesBin, lastJsonLine, pyScript, python, r3, readJson, run, writeJson } from "./lib/util.ts";

// Captions as the device text.caption (engine/devices/text.caption, ROADMAP D6): the words of the voice grouped by word,
// phrase or line; the style of every beat — look.captions ← video.json captions ← the beat's caption; one sub-composition
// compositions/captions.html over the whole video played by engine/devices/text.caption/device.js and its presets. The old
// skin layer (captions.mjs, a plate with a hairline) is gone. Before the render the build measures the contrast under the
// captions on snapshots and puts a wash or blur under the beats that fall below 4.5:1.

export interface CaptionStyle {
  preset: string;
  group: string;
  activeWord: string;
  type: string;
  font: string;
  size: string;
  case: string;
  color: string;
  background: string;
  position: string;
}

export const CAPTION_KEYS = ["preset", "group", "activeWord", "type", "font", "size", "case", "color", "background", "position"];
export const CAPTION_DEFAULTS: CaptionStyle = { preset: "plain", group: "word", activeWord: "none", type: "none", font: "body", size: "m", case: "normal", color: "text", background: "none", position: "bottom" };
const OWN_ENUMS: Record<string, string[]> = {
  group: ["word", "phrase", "line"],
  activeWord: ["color", "scale", "weight", "highlight-sweep", "underline", "none"],
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const rgbStr = (hex: string): string => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

/** Fields of a caption object (video.json captions, a beat's caption, look.captions with family). */
export function checkCaptionFields(v: unknown, where: string, look = false): Partial<CaptionStyle> & { family?: string } {
  if (!isObj(v)) return fail(`${where}: {${CAPTION_KEYS.join(", ")}}`);
  const allowed = look ? [...CAPTION_KEYS, "family"] : CAPTION_KEYS;
  for (const [key, value] of Object.entries(v)) {
    if (!allowed.includes(key)) fail(`${where}: неизвестное поле ${key}; есть: ${allowed.join(", ")}`);
    if (key === "preset") checkCaptionPreset(value, `${where}.preset`);
    else if (key === "family") {
      if (!CAPTION_FAMILIES.includes(value as string)) fail(`${where}.family — ${CAPTION_FAMILIES.join(", ")}`);
    } else if (key === "color") {
      if (typeof value !== "string" || !/^(#[0-9A-Fa-f]{6}|[a-zA-Z]+)$/.test(value)) fail(`${where}.color — text, accent, secondary, cold, токен палитры или #RRGGBB`);
    } else {
      const values = OWN_ENUMS[key] ?? textSchema().params[key]?.values ?? [];
      if (!values.includes(value as string)) fail(`${where}.${key} — одно из: ${values.join(", ")}`);
    }
  }
  return v as Partial<CaptionStyle>;
}

/** look.captions ← video.json captions ← beat caption; a look with only a family takes the family's first preset. */
export function captionStyleOf(look: LookDef, spec: Pick<VideoSpec, "captions">, beat: Pick<BeatSpec, "caption"> | null): CaptionStyle {
  const lk = { ...((look.captions ?? {}) as Partial<CaptionStyle> & { family?: string }) };
  const family = lk.family;
  delete lk.family;
  if (!lk.preset && family) lk.preset = captionFamilies()[family]?.[0] ?? "plain";
  const video = isObj(spec.captions) ? (spec.captions as Partial<CaptionStyle>) : {};
  const own = isObj(beat?.caption) ? (beat?.caption as Partial<CaptionStyle>) : {};
  return { ...CAPTION_DEFAULTS, ...lk, ...video, ...own };
}

interface Tok {
  text: string;
  start: number;
  end: number;
}

/** word — one word on screen; phrase — up to 4 words, split at a pause or a punctuation mark; line — up to 7 words / 34 characters. */
export function groupTokens(toks: Tok[], mode: string): Tok[][] {
  if (mode === "word") return toks.map((t) => [t]);
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  for (const t of toks) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const gap = t.start - prev.end;
      const chars = cur.reduce((n, w) => n + w.text.length + 1, 0) + t.text.length;
      const split = mode === "phrase" ? gap > 0.18 || cur.length >= 4 || /[.?!,;:—]$/.test(prev.text) : gap > 0.35 || cur.length >= 7 || chars > 34 || /[.?!]$/.test(prev.text);
      if (split) {
        out.push(cur);
        cur = [];
      }
    }
    cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** The area of the beat's dominant device (or the first with an area or point), px — what near-target sits next to. */
export function beatTarget(beat: BeatSpec): Box | null {
  if (beat.scene !== undefined || !beat.devices?.length) return null;
  const regions = ((beat.stage as Record<string, unknown> | undefined)?.regions ?? {}) as Record<string, unknown>;
  const order = beat.devices.map((_, i) => i).sort((a, b) => (a === beat.dominant ? -1 : b === beat.dominant ? 1 : a - b));
  for (const i of order) {
    let t = beat.devices[i]?.target;
    if (typeof t === "string") t = regions[t];
    if (!isObj(t)) continue;
    try {
      if ("w" in t) return boxPx(pctBox(t, beat.id));
      const p = pointPx(pctPoint(t, beat.id));
      return { x: r3(p.x - 40), y: r3(p.y - 40), w: 80, h: 80 };
    } catch {
      continue;
    }
  }
  return null;
}

function nearBand(target: Box, fontSize: number, lines: number): CaptionGroup["band"] {
  const B = textSchema().bands;
  const nt = B["near-target"];
  const est = lines * fontSize * 1.2 + 24;
  const cx = Math.min(Math.max(target.x + target.w / 2, 90 + nt.maxWidth / 2), 960 - nt.maxWidth / 2);
  const below = target.y + target.h + nt.gap;
  if (below + est <= B.safeBottom - 30) return { x: r3(cx), top: r3(below), bottom: r3(below + est), align: "start" };
  const above = Math.max(B.safeTop + 16 + est, target.y - nt.gap);
  return { x: r3(cx), top: r3(above - est), bottom: r3(above), align: "end" };
}

export interface CaptionGroup {
  i: number;
  beat: string;
  start: number;
  end: number;
  words: Tok[];
  style: Record<string, unknown> & { preset: string; background: string; fontSize: number; maxWidth: number; color: string };
  band: { x: number; top: number; bottom: number; align: string };
  camera: { camera: CameraSpec; beat: { start: number; end: number; index: number; hits: number[] } } | null;
}

export interface CaptionBeat {
  id: string;
  style: CaptionStyle;
  family: string | null;
  groups: number;
  /** Measured before the render (worst sample under the text), WCAG ratio. */
  contrast: number | null;
  /** Background the engine put under a beat below 4.5:1. */
  forced: string | null;
  near: boolean;
}

export interface CaptionCfg {
  duration: number;
  seed: number;
  stage: string;
  colors: { hex: Record<string, string>; rgb: Record<string, string> };
  fonts: { display: string; body: string };
  groups: CaptionGroup[];
}

export interface CaptionPlan {
  cfg: CaptionCfg;
  beats: CaptionBeat[];
  warnings: string[];
}

export function planCaptions(input: { spec: Pick<VideoSpec, "id" | "beats" | "captions">; look: LookDef; style: StyleDef; timings: BeatTiming[]; words: BeatWords[]; total: number; hits: number[] }): CaptionPlan {
  const { spec, look, style, timings, words, total, hits } = input;
  const S = textSchema();
  const groups: CaptionGroup[] = [];
  const beats: CaptionBeat[] = [];
  const warnings: string[] = [];
  spec.beats.forEach((beat, bi) => {
    const timing = timings[bi] as BeatTiming;
    const st = captionStyleOf(look, spec, beat);
    const where = `${beat.id}: caption`;
    const colors = toneColors(style, beat.tone ?? "accent");
    const color = textColor(colors, st.color, where);
    const active = st.color === "accent" || color === colors.hero ? (colors.text as string) : (colors.hero as string);
    const target = st.position === "near-target" ? beatTarget(beat) : null;
    if (st.position === "near-target" && !target) warnings.push(`${beat.id}: caption near-target без устройства с целью — субтитры внизу`);
    const position = st.position === "near-target" && !target ? "bottom" : st.position;
    const band = position === "top" ? S.bands.top : position === "center" ? S.bands.center : S.bands.bottom;
    const maxWidth = position === "near-target" ? S.bands["near-target"].maxWidth : band.maxWidth;
    const fontSize = S.scales.caption?.[st.size] ?? 64;
    const font = (style.fonts[st.font] ?? style.fonts.body) as FontDef;
    const styleJs = {
      preset: st.preset,
      family: familyOf(st.preset),
      group: st.group,
      activeWord: st.activeWord,
      type: st.type,
      font: st.font,
      fontFamily: fontStack(font),
      weight: st.font === "display" ? 600 : 700,
      fontSize,
      size: st.size,
      textTransform: st.case === "upper" ? "uppercase" : "none",
      color,
      active,
      onActive: inkOn(colors, active),
      dim: `rgba(${rgbStr(color)},0.5)`,
      background: st.background,
      position,
      maxWidth,
    };
    const cam = position === "follow-camera" ? beatCamera(beat, look) : null;
    const camera = cam && (cam.preset !== "none" || cam.shake > 0) ? { camera: cam, beat: { start: timing.start, end: timing.end, index: bi, hits: hits.filter((h) => h >= timing.start - 0.01 && h < timing.end) } } : null;
    const toks = (words[bi] as BeatWords).tokens.map((k) => ({ text: k.text, start: r3(timing.start + k.start), end: r3(timing.start + k.end) }));
    const parts = groupTokens(toks, st.group);
    for (const part of parts) {
      const lines = st.group === "word" ? 1 : 2;
      groups.push({
        i: groups.length,
        beat: beat.id,
        start: (part[0] as Tok).start,
        end: 0,
        words: part,
        style: { ...styleJs },
        band: position === "near-target" && target ? nearBand(target, fontSize, lines) : { x: 540, top: band.top, bottom: band.bottom, align: band.align },
        camera,
      });
    }
    beats.push({ id: beat.id, style: st, family: familyOf(st.preset), groups: parts.length, contrast: null, forced: null, near: !!target });
  });
  // a group stays until the next one starts or its last word + 0.3 s; a gap shorter than 0.15 s closes
  groups.forEach((g, k) => {
    const next = groups[k + 1];
    const last = g.words[g.words.length - 1] as Tok;
    const limit = next ? next.start : total;
    let end = Math.min(limit, last.end + 0.3);
    if (limit - end < 0.15) end = limit;
    g.end = r3(Math.min(limit, Math.max(g.start + 0.05, end)));
  });
  const accent = toneColors(style, "accent");
  return {
    cfg: {
      duration: total,
      seed: videoSeed(spec.id),
      stage: "cap-stage",
      colors: { hex: accent, rgb: Object.fromEntries(Object.entries(accent).map(([k, v]) => [k, rgbStr(v)])) },
      fonts: { display: fontStack(style.fonts.display as FontDef), body: fontStack(style.fonts.body as FontDef) },
      groups,
    },
    beats,
    warnings,
  };
}

export function captionsHtml(cfg: CaptionCfg, style: StyleDef): string {
  return `<!-- hygen captions (engine/src/captions.ts → engine/devices/text.caption): ${cfg.groups.length} groups — generated on every build, do not edit -->
<template id="captions-template">
<script src="assets/vendor/gsap.min.js"></script>
<script src="assets/hygen/captions.js"></script>
<style>
${fontFaces(style)}
#captions-root { position: relative; width: 1080px; height: 1920px; overflow: hidden; pointer-events: none; }
#cap-stage { position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; }
</style>
<div id="captions-root" data-composition-id="captions" data-start="0" data-duration="${cfg.duration}" data-width="1080" data-height="1920">
  <div id="cap-stage" aria-hidden="true"></div>
</div>
<script>
(function () {
  var CFG = ${JSON.stringify(cfg).replace(/<\//g, "<\\/")};
  var tl = gsap.timeline({ paused: true });
  HygenCaptions.mount(tl, CFG);
  window.__timelines = window.__timelines || {};
  window.__timelines["captions"] = tl;
})();
</script>
</template>
`;
}

export function writeCaptions(dir: string, plan: CaptionPlan, style: StyleDef): void {
  ensureDir(join(dir, "compositions"));
  writeFileSync(join(dir, "compositions", "captions.html"), captionsHtml(plan.cfg, style));
  writeJson(join(dir, "captions.plan.json"), {
    groups: plan.cfg.groups.length,
    presets: [...new Set(plan.cfg.groups.map((g) => g.style.preset))],
    beats: plan.beats,
    warnings: plan.warnings,
  });
}

/** verify → text: every beat's captions read at ≥ 4.5:1 or got a background from the engine; the bands keep the Shorts safe zone. */
export function checkCaptionPlan(buildDir: string): { ok: boolean; detail: string } {
  const file = join(buildDir, "captions.plan.json");
  if (!existsSync(file)) return { ok: false, detail: "нет build/captions.plan.json — сборка до D6, пересоберите ролик" };
  const plan = readJson<{ presets: string[]; beats: CaptionBeat[]; warnings: string[] }>(file);
  // a preset with its own plate is responsible for its contrast: reported, not failed
  const owned = plan.beats.filter((b) => b.contrast !== null && b.contrast < 4.5 && !b.forced && presetTraits(b.style.preset).ownsBackground);
  const bad = plan.beats.filter((b) => b.contrast !== null && b.contrast < 4.5 && !b.forced && b.style.background === "none" && !owned.includes(b));
  const forced = plan.beats.filter((b) => b.forced).map((b) => `${b.id} ${b.contrast}:1 → ${b.forced}`);
  const measured = plan.beats.map((b) => b.contrast).filter((c): c is number => c !== null);
  const B = textSchema().bands;
  const outside = [B.bottom, B.center, B.top].filter((band) => band.top < B.safeTop || band.bottom > B.safeBottom);
  const ok = bad.length === 0 && outside.length === 0;
  const detail = `пресеты ${plan.presets.join(", ")}; контраст под субтитрами ${measured.length ? `от ${Math.min(...measured)}:1` : "не измерялся (у всех битов подложка)"}${forced.length ? `; подложки движка: ${forced.join("; ")}` : ""}${owned.length ? `; свой фон пресета при контрасте < 4,5: ${owned.map((b) => `${b.id} (${b.style.preset} ${b.contrast}:1)`).join(", ")}` : ""}${bad.length ? `; ниже 4,5:1 без подложки: ${bad.map((b) => b.id).join(", ")}` : ""}${outside.length ? "; полоса субтитров вне безопасной зоны" : ""}`;
  return { ok, detail };
}

/** engine/devices/text.js + text.caption/device.js + the presets in use → assets/hygen/captions.js. */
export function installCaptions(dir: string, presets: string[]): void {
  const root = join(ENGINE_DIR, "devices");
  const parts = [textSchemaScript(), readFileSync(join(root, "text.js"), "utf8"), readFileSync(join(root, "text.caption", "device.js"), "utf8")];
  for (const name of [...new Set(presets)].sort()) parts.push(readFileSync(join(root, "text.caption", "presets", `${checkCaptionPreset(name, "субтитры")}.js`), "utf8"));
  ensureDir(join(dir, "assets", "hygen"));
  writeFileSync(join(dir, "assets", "hygen", "captions.js"), parts.join("\n"));
}

/** What a preset file declares about itself: ink "light" | "dark" (it paints its own letters) and whether it owns the plate. */
export function presetTraits(preset: string): { ink: "light" | "dark" | null; ownsBackground: boolean } {
  const src = readFileSync(join(ENGINE_DIR, "devices", "text.caption", "presets", `${preset}.js`), "utf8");
  const ink = /\bink:\s*"(light|dark)"/.exec(src)?.[1] as "light" | "dark" | undefined;
  return { ink: ink ?? null, ownsBackground: /owns:\s*\{[^}]*background:\s*true/.test(src) };
}

/**
 * Contrast under the captions before the render: frames of the video with an empty captions layer at 2 moments of every
 * beat without a background (py/caption_contrast.py — the brightest 10 % under a light text); below 4.5:1 the beat gets a
 * wash (bottom, top, follow-camera) or a blur (center, near-target) and a warning. Rewrites compositions/captions.html.
 */
export function probeCaptionContrast(dir: string, plan: CaptionPlan, style: StyleDef): string[] {
  const probe: { t: number; beat: string; rect: number[]; text: string }[] = [];
  for (const b of plan.beats) {
    if (b.style.background !== "none") continue;
    const gs = plan.cfg.groups.filter((g) => g.beat === b.id);
    const first = gs[0];
    const last = gs[gs.length - 1];
    if (!first || !last) continue;
    const fs = first.style.fontSize;
    const widest = Math.min(first.style.maxWidth, Math.max(...gs.map((g) => g.words.map((w) => w.text).join(" ").length)) * fs * 0.56 + 40);
    const lines = b.style.group === "word" ? 1 : widest >= first.style.maxWidth ? 2 : 1;
    const h = lines * fs * 1.2 + 16;
    const band = first.band;
    const mid = (band.top + band.bottom) / 2;
    const [y0, y1] = band.align === "end" ? [band.bottom - h, band.bottom] : band.align === "start" ? [band.top, band.top + h] : [mid - h / 2, mid + h / 2];
    const rect = [r3(band.x - widest / 2), r3(y0), r3(band.x + widest / 2), r3(y1)];
    // a preset that paints its own letters (neon, gradient) is measured with its ink, not with the style colour
    const traits = presetTraits(first.style.preset);
    const ink = traits.ink === "light" ? "#FFFFFF" : traits.ink === "dark" ? "#000000" : first.style.color;
    for (const q of [0.3, 0.75]) probe.push({ t: r3(first.start + (last.end - first.start) * q), beat: b.id, rect, text: ink });
  }
  const warnings: string[] = [];
  if (probe.length) {
    writeFileSync(join(dir, "compositions", "captions.html"), captionsHtml({ ...plan.cfg, groups: [] }, style));
    const snapDir = join(dir, ".captions-probe");
    rmSync(snapDir, { recursive: true, force: true });
    const times = [...new Set(probe.map((p) => p.t.toFixed(3)))].join(",");
    const snap = run(hyperframesBin(), ["snapshot", "--at", times, "--no-end", "--output", snapDir], { cwd: dir, allowFail: true });
    if (snap.status === 0) {
      writeJson(join(snapDir, "probe.json"), probe);
      const res = lastJsonLine<{ beats: Record<string, { contrast: number; t: number }> }>(run(python(), [pyScript("caption_contrast.py"), snapDir, join(snapDir, "probe.json")]).stdout);
      for (const b of plan.beats) {
        const hit = res.beats[b.id];
        if (!hit) continue;
        b.contrast = hit.contrast;
        if (hit.contrast >= 4.5) continue;
        if (presetTraits(b.style.preset).ownsBackground) {
          warnings.push(`${b.id}: контраст субтитров ${hit.contrast}:1 < 4,5 (@${hit.t} с), но пресет ${b.style.preset} рисует фон сам — подложка движка не ляжет`);
          continue;
        }
        b.forced = b.style.position === "center" || b.style.position === "near-target" ? "blur" : "wash";
        for (const g of plan.cfg.groups) if (g.beat === b.id) g.style.background = b.forced;
        warnings.push(`${b.id}: контраст субтитров ${hit.contrast}:1 < 4,5 (@${hit.t} с) — подложка ${b.forced}`);
      }
    } else {
      warnings.push("снимки под субтитрами не удались — контраст не измерен, подложки не подобраны");
    }
    rmSync(snapDir, { recursive: true, force: true });
  }
  plan.warnings.push(...warnings);
  writeCaptions(dir, plan, style);
  return warnings;
}
