import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { arcKey } from "./arcs.ts";
import { loadStyle } from "./contract.ts";
import { applyLook, hueDistance, hueOf, loadLook } from "./look.ts";
import type { VideoSpec } from "./spec.ts";
import { loadSpec } from "./spec.ts";
import { ROOT_DIR, readJson } from "./lib/util.ts";

// Uniqueness of a video among the others in videos/ and videos/_proof/.
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
  arc: string | null;
  retells: string | null;
  built: number;
}

/** scene beats → "scene:<id>", stage beats → the stage type. */
export const stageSequence = (spec: VideoSpec): string[] => spec.beats.map((b) => (b.scene !== undefined ? `scene:${b.scene}` : String(b.stage?.type)));

function fingerprint(spec: VideoSpec, dir: string, observed: number | null): Fingerprint {
  const look = loadLook(spec.look);
  const style = applyLook(loadStyle(spec.style), look);
  const textures = new Set<string>(look.textures.map((t) => t.id));
  for (const beat of spec.beats) for (const t of beat.textures ?? []) textures.add(t.id);
  const build = join(dir, "renders", `${spec.id}.build.json`);
  const built = existsSync(build) ? statSync(build).mtimeMs : statSync(join(dir, "video.json")).mtimeMs;
  return { id: spec.id, dir, hue: Math.round(hueOf(style.colors.accent as string)), observed, textures: [...textures].sort(), stages: stageSequence(spec), arc: arcKey(spec), retells: spec.retells ?? null, built };
}

/** Observed accent hue of a finished video: engine/py/verify_mp4.py writes it into <id>.verify.json → palette. */
function observedHue(videoDir: string, id: string): number | null {
  const report = join(videoDir, "renders", `${id}.verify.json`);
  if (!existsSync(report)) return null;
  const hue = readJson<{ palette?: { hue?: number | null } }>(report).palette?.hue;
  return typeof hue === "number" ? hue : null;
}

function videoDirs(): string[] {
  const out: string[] = [];
  for (const root of [join(ROOT_DIR, "videos"), join(ROOT_DIR, "videos", "_proof")]) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root).sort()) if (!name.startsWith("_") && existsSync(join(root, name, "video.json"))) out.push(join(root, name));
  }
  return out;
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
    skeleton.push(`${other.id}: арка ${other.arc ? (other.arc === me.arc ? "та же" : "другая") : "не задана"}, stage ${eq}/${n}`);
  }
  const head = `акцент ${me.hue}°${me.observed === null ? "" : ` (по кадрам ${Math.round(me.observed)}°)`}, текстуры: ${me.textures.join(", ") || "нет"}; арка ${me.arc ?? "не задана"}; stage ${me.stages.join(" → ")}`;
  return {
    ok: bad.length === 0,
    detail: bad.length ? `похож на: ${bad.join("; ")} — нужно ≥ ${MIN_HUE}° или другой набор текстур, другая арка и другая последовательность stage` : `${head}; ${pairs.join("; ") || "других роликов нет"}; скелет против двух последних: ${skeleton.join("; ") || "—"}`,
    warnings,
    hue: me.hue,
    textures: me.textures,
  };
}
