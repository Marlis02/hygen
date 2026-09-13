import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VideoSpec } from "./spec.ts";
import type { BeatTiming, SceneMeta, Warp } from "./timeline.ts";
import { warpKnots } from "./timeline.ts";
import type { BeatWords } from "./words.ts";
import { ENGINE_DIR, ensureDir, fail, log, readJson } from "./lib/util.ts";

export interface SceneBuild {
  beatId: string;
  src: string;
  warp: Warp;
  meta: SceneMeta;
}

export function sceneMeta(scene: string): SceneMeta {
  const [pack, name] = scene.split("/");
  const all = readJson<Record<string, SceneMeta>>(join(ENGINE_DIR, "scenes", pack as string, "scenes.json"));
  const meta = all[name as string];
  if (!meta) fail(`нет описания сцены ${scene} в engine/scenes/${pack}/scenes.json`);
  return meta;
}

/** Scene templates → build/compositions/frames: real duration + the time warp onto this voice. */
export function writeScenes(spec: VideoSpec, buildDir: string, timings: BeatTiming[], words: BeatWords[]): SceneBuild[] {
  const warpJs = readFileSync(join(ENGINE_DIR, "scenes", "_runtime", "warp.js"), "utf8");
  ensureDir(join(buildDir, "compositions", "frames"));
  return spec.beats.map((beat, i) => {
    const templatePath = join(ENGINE_DIR, "scenes", `${beat.scene}.html`);
    if (!existsSync(templatePath)) fail(`нет сцены ${templatePath}`);
    let html = readFileSync(templatePath, "utf8");
    if (!html.includes(`data-composition-id="${beat.id}"`)) {
      fail(`${beat.id}: id бита должен совпадать с data-composition-id сцены ${beat.scene}`);
    }
    if (!html.includes("/*{{hygen:warp}}*/")) fail(`${beat.scene}: в шаблоне нет метки /*{{hygen:warp}}*/`);
    const meta = sceneMeta(beat.scene);
    const timing = timings[i] as BeatTiming;
    const warp = warpKnots(beat, meta, timing, words[i] as BeatWords);
    for (const note of warp.notes) log.warn(`${beat.id}: ${note}`);
    const helper = warpJs.replace("__HYGEN_REF__", JSON.stringify(warp.ref)).replace("__HYGEN_ACT__", JSON.stringify(warp.act));
    html = html.replace("/*{{hygen:warp}}*/", () => helper).replaceAll("{{hygen:duration}}", String(timing.duration));
    const src = `compositions/frames/${beat.id}.html`;
    writeFileSync(join(buildDir, src), html);
    log.info(`${beat.id}: ${beat.scene} · ${timing.duration.toFixed(3)} с · якорей ${warp.ref.length}`);
    return { beatId: beat.id, src, warp, meta };
  });
}
