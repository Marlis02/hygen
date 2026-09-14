import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SceneDef, StyleDef } from "./contract.ts";
import { beatCues, evalCondition, loadScene, renderTemplate, resolveParams, sceneTemplate } from "./contract.ts";
import type { VideoSpec } from "./spec.ts";
import type { BeatTiming, Warp } from "./timeline.ts";
import { warpKnots } from "./timeline.ts";
import type { BeatWords } from "./words.ts";
import { typeInjection, videoSeed } from "./layers.ts";
import type { LookDef } from "./look.ts";
import { ENGINE_DIR, ensureDir, log } from "./lib/util.ts";

export interface SceneEvent {
  /** Reference time inside the scene. */
  ref: number;
  label: string;
}

export interface SceneBuild {
  beatId: string;
  src: string;
  warp: Warp;
  scene: SceneDef;
  params: Record<string, unknown>;
  settle: number;
  events: SceneEvent[];
  /** Type presets or text parallax were injected (the root must load the motion runtime). */
  injected: boolean;
}

export function warpHelper(warp: { ref: number[]; act: number[] }): string {
  const warpJs = readFileSync(join(ENGINE_DIR, "scenes", "_runtime", "warp.js"), "utf8");
  return warpJs.replace("__HYGEN_REF__", JSON.stringify(warp.ref)).replace("__HYGEN_ACT__", JSON.stringify(warp.act));
}

/** Events of a scene that apply to these params (engine/scenes/<id>/scene.json → events). */
export function sceneEvents(scene: SceneDef, params: Record<string, unknown>): SceneEvent[] {
  return scene.events
    .filter((ev) => evalCondition(ev.if, params))
    .map((ev) => ({ ref: ev.anchor ? (scene.anchors[ev.anchor] as { at: number }).at : (ev.at as number), label: ev.label }));
}

/** Library scenes → build/compositions/frames: params, style tokens, real duration, time warp onto this voice. */
export function writeScenes(spec: VideoSpec, style: StyleDef, videoDir: string, buildDir: string, timings: BeatTiming[], words: BeatWords[], look: LookDef, hits: number[]): SceneBuild[] {
  ensureDir(join(buildDir, "compositions", "frames"));
  return spec.beats.map((beat, i) => {
    const scene = loadScene(beat.scene);
    const params = resolveParams(beat, scene, { style, videoDir, buildDir });
    const timing = timings[i] as BeatTiming;
    const warp = warpKnots(beatCues(beat, scene), scene.ref, timing, words[i] as BeatWords);
    for (const note of warp.notes) log.warn(`${beat.id}: ${note}`);
    if (timing.duration < scene.duration.min || timing.duration > scene.duration.max) {
      log.warn(`${beat.id}: клип ${timing.duration.toFixed(2)} с вне диапазона сцены ${beat.scene} (${scene.duration.min}–${scene.duration.max} с)`);
    }
    const inject = typeInjection({ beat, scene, look, style, compositionId: beat.id, start: timing.start, duration: timing.duration, index: i, hits, seed: videoSeed(spec.id) });
    const html = renderTemplate(sceneTemplate(beat.scene), {
      sceneId: beat.scene,
      compositionId: beat.id,
      duration: timing.duration,
      params,
      style,
      tone: beat.tone ?? "accent",
      seed: beat.seed ?? scene.seed.default,
      warpJs: warpHelper(warp),
      inject,
    });
    const src = `compositions/frames/${beat.id}.html`;
    writeFileSync(join(buildDir, src), html);
    log.info(`${beat.id}: ${beat.scene} · ${timing.duration.toFixed(3)} с · опор варпа ${warp.ref.length}${beat.tone === "cold" ? " · cold" : ""}${inject ? " · type/параллакс" : ""}`);
    return { beatId: beat.id, src, warp, scene, params, settle: scene.settle, events: sceneEvents(scene, params), injected: inject.length > 0 };
  });
}
