import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { arcKey } from "./arcs.ts";
import { loadStyle } from "./contract.ts";
import { applyLook, hueDistance, hueOf, loadLook } from "./look.ts";
import type { VideoSpec } from "./spec.ts";
import { loadSpec } from "./spec.ts";
import { readJson } from "./lib/util.ts";
import { projectDirs } from "./lib/project.ts";

// Uniqueness of a video among the other projects in projects/ (proof projects included).
// World (D3.5): two videos may not look like one — accent hues differ by at least 30° (by the look and by the settle
// frames of the MP4) or their texture sets differ; a video that `retells` another is exempt from this pair.
// Skeleton (D4): against the two most recent other videos the arc tuple (structure × hook × protagonist × ending) and the
// sequence of stage types must differ — an error; more than half of the positions equal — a warning.

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
  dir: string;
  hue: number;
  observed: number | null;
  textures: string[];
  stages: string[];
  devices: string[];
  arc: string | null;
  retells: string | null;
  built: number;
}

/** scene beats → "scene:<id>", stage beats → the stage type. */
export const stageSequence = (spec: VideoSpec): string[] => spec.beats.map((b) => (b.scene !== undefined ? `scene:${b.scene}` : String(b.stage?.type)));

/**
 * Fingerprint of a video (ROADMAP D6): per beat the stage type + what leads the frame — the dominant device or the stage
 * itself; a scene beat is its scene. «photo + label → quote → counter» of two videos in a row is caught here, not by the arc.
 */
export const deviceFingerprint = (spec: VideoSpec): string[] =>
  spec.beats.map((b) => {
    if (b.scene !== undefined) return `scene:${b.scene}`;
    const lead = typeof b.dominant === "number" ? (b.devices?.[b.dominant]?.type ?? "stage") : "stage";
    return `${String(b.stage?.type)}+${lead}`;
  });

/** Share of positions where two fingerprints agree, over the longer one. */
export function fingerprintMatch(a: string[], b: string[]): { eq: number; n: number; share: number } {
  const n = Math.max(a.length, b.length, 1);
  const eq = a.filter((x, i) => b[i] === x).length;
  return { eq, n, share: eq / n };
}

export const FINGERPRINT_ERROR = 0.6;
export const FINGERPRINT_WARN = 0.4;

function fingerprint(spec: VideoSpec, dir: string, observed: number | null): Fingerprint {
  const look = loadLook(spec.look);
  const style = applyLook(loadStyle(spec.style), look);
  const textures = new Set<string>(look.textures.map((t) => t.id));
  for (const beat of spec.beats) for (const t of beat.textures ?? []) textures.add(t.id);
  const build = join(dir, "renders", `${spec.id}.build.json`);
  const built = existsSync(build) ? statSync(build).mtimeMs : statSync(join(dir, "project.json")).mtimeMs;
  return { id: spec.id, dir, hue: Math.round(hueOf(style.colors.accent as string)), observed, textures: [...textures].sort(), stages: stageSequence(spec), devices: deviceFingerprint(spec), arc: arcKey(spec), retells: spec.retells ?? null, built };
}

/** Observed accent hue of a finished video: engine/py/verify_mp4.py writes it into <id>.verify.json → palette. */
function observedHue(videoDir: string, id: string): number | null {
  const report = join(videoDir, "renders", `${id}.verify.json`);
  if (!existsSync(report)) return null;
  const hue = readJson<{ palette?: { hue?: number | null } }>(report).palette?.hue;
  return typeof hue === "number" ? hue : null;
}

function videoDirs(): string[] {
  return projectDirs();
}

export function checkUniqueness(spec: VideoSpec, videoDir: string, observed: number | null): UniquenessResult {
  const me = fingerprint(spec, videoDir, observed);
  const pairs: string[] = [];
  const bad: string[] = [];
  const warnings: string[] = [];
  const others: Fingerprint[] = [];
  for (const dir of videoDirs()) {
    if (resolve(dir) === resolve(videoDir)) continue;
    try {
      const spec2 = loadSpec(dir);
      others.push(fingerprint(spec2, dir, observedHue(dir, spec2.id)));
    } catch (err) {
      warnings.push(`уникальность: ${basename(dir)} пропущен — ${(err as Error).message}`);
    }
  }
  for (const other of others) {
    if (me.retells === other.id || other.retells === me.id) {
      pairs.push(`${other.id}: пересказ — мир тот же намеренно`);
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
  }
  // skeleton against the two most recent others
  const recent = [...others].sort((a, b) => b.built - a.built).slice(0, 2);
  const skeleton: string[] = [];
  for (const other of recent) {
    if (me.arc && other.arc && me.arc === other.arc) bad.push(`${other.id}: та же арка (${me.arc})`);
    const same = me.stages.join(" → ") === other.stages.join(" → ");
    if (same) bad.push(`${other.id}: та же последовательность stage (${me.stages.join(" → ")})`);
    const n = Math.max(me.stages.length, other.stages.length);
    const eq = me.stages.filter((s, i) => other.stages[i] === s).length;
    if (!same && eq / n > 0.5) warnings.push(`уникальность: с ${other.id} совпадает ${eq} из ${n} позиций stage`);
    // fingerprint (D6): stage + the device that leads, position by position
    const fp = fingerprintMatch(me.devices, other.devices);
    const pct = Math.round(fp.share * 100);
    if (fp.share > FINGERPRINT_ERROR) bad.push(`${other.id}: отпечаток совпадает на ${pct} % (${fp.eq} из ${fp.n}: ${me.devices.join(" → ")})`);
    else if (fp.share >= FINGERPRINT_WARN) warnings.push(`уникальность: отпечаток с ${other.id} совпадает на ${pct} % (${fp.eq} из ${fp.n}) — порог ошибки 60 %`);
    skeleton.push(`${other.id}: арка ${other.arc ? (other.arc === me.arc ? "та же" : "другая") : "не задана"}, stage ${eq}/${n}, отпечаток ${pct} %`);
  }
  const head = `акцент ${me.hue}°${me.observed === null ? "" : ` (по кадрам ${Math.round(me.observed)}°)`}, текстуры: ${me.textures.join(", ") || "нет"}; арка ${me.arc ?? "не задана"}; stage ${me.stages.join(" → ")}; отпечаток ${me.devices.join(" → ")}`;
  return {
    ok: bad.length === 0,
    detail: bad.length ? `похож на: ${bad.join("; ")} — нужно ≥ ${MIN_HUE}° или другой набор текстур, другая арка, другая последовательность stage и отпечаток ≤ 60 %` : `${head}; ${pairs.join("; ") || "других роликов нет"}; скелет против двух последних: ${skeleton.join("; ") || "—"}`,
    warnings,
    hue: me.hue,
    textures: me.textures,
  };
}
