import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { loadStyle } from "./contract.ts";
import { applyLook, hueDistance, hueOf, loadLook } from "./look.ts";
import type { VideoSpec } from "./spec.ts";
import { loadSpec } from "./spec.ts";
import { readJson } from "./lib/util.ts";

// Uniqueness of a video among the others in videos/ (ROADMAP D3.5): two videos may not look like one — their
// accent hues differ by at least 30° on the colour wheel (by the look in video.json and by the colours of the
// settle frames of the MP4), or their texture sets differ. The same sequence of scenes is only a warning.

export const MIN_HUE = 30;

export interface UniquenessResult {
  ok: boolean;
  detail: string;
  warnings: string[];
  hue: number;
  textures: string[];
}

interface Fingerprint {
  id: string;
  hue: number;
  observed: number | null;
  textures: string[];
  scenes: string;
}

function fingerprint(spec: VideoSpec, observed: number | null): Fingerprint {
  const look = loadLook(spec.look);
  const style = applyLook(loadStyle(spec.style), look);
  const textures = new Set<string>(look.textures.map((t) => t.id));
  for (const beat of spec.beats) for (const t of beat.textures ?? []) textures.add(t.id);
  return { id: spec.id, hue: Math.round(hueOf(style.colors.accent as string)), observed, textures: [...textures].sort(), scenes: spec.beats.map((b) => b.scene).join(" → ") };
}

/** Observed accent hue of a finished video: engine/py/verify_mp4.py writes it into <id>.verify.json → palette. */
function observedHue(videoDir: string, id: string): number | null {
  const report = join(videoDir, "renders", `${id}.verify.json`);
  if (!existsSync(report)) return null;
  const hue = readJson<{ palette?: { hue?: number | null } }>(report).palette?.hue;
  return typeof hue === "number" ? hue : null;
}

export function checkUniqueness(spec: VideoSpec, videoDir: string, observed: number | null): UniquenessResult {
  const me = fingerprint(spec, observed);
  const root = join(videoDir, "..");
  const pairs: string[] = [];
  const bad: string[] = [];
  const warnings: string[] = [];
  for (const name of readdirSync(root).sort()) {
    if (name === basename(videoDir) || name.startsWith("_") || !existsSync(join(root, name, "video.json"))) continue;
    let other: Fingerprint;
    try {
      const spec2 = loadSpec(join(root, name));
      other = fingerprint(spec2, observedHue(join(root, name), spec2.id));
    } catch (err) {
      warnings.push(`уникальность: ${name} пропущен — ${(err as Error).message}`);
      continue;
    }
    const declared = hueDistance(me.hue, other.hue);
    const byFrames = me.observed !== null && other.observed !== null ? Math.round(hueDistance(me.observed, other.observed)) : null;
    const hueDiff = byFrames === null ? declared : Math.min(declared, byFrames);
    const sameTextures = me.textures.join(",") === other.textures.join(",");
    const ok = hueDiff >= MIN_HUE || !sameTextures;
    const note = `${other.id}: акцент ${Math.round(declared)}°${byFrames === null ? "" : ` (по кадрам ${byFrames}°)`}, текстуры ${sameTextures ? "те же" : "разные"}`;
    pairs.push(note);
    if (!ok) bad.push(note);
    if (me.scenes === other.scenes) warnings.push(`уникальность: у ${other.id} та же последовательность сцен (${me.scenes})`);
  }
  const head = `акцент ${me.hue}°${me.observed === null ? "" : ` (по кадрам ${Math.round(me.observed)}°)`}, текстуры: ${me.textures.join(", ") || "нет"}`;
  return {
    ok: bad.length === 0,
    detail: bad.length ? `похож на: ${bad.join("; ")} — нужно ≥ ${MIN_HUE}° или другой набор текстур` : `${head}; ${pairs.join("; ") || "других роликов нет"}`,
    warnings,
    hue: me.hue,
    textures: me.textures,
  };
}
