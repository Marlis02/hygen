import { rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { StyleDef } from "./contract.ts";
import { loadStyle, toneColors } from "./contract.ts";
import { checkCaptionFields, installCaptions, planCaptions, writeCaptions } from "./captions.ts";
import type { LookDef } from "./look.ts";
import { trackBeats } from "./music.ts";
import { musicFile } from "./lib/project.ts";
import { checkCaptionPreset } from "./text.ts";
import type { BeatWords } from "./words.ts";
import type { Clock, DeviceSpec } from "./devices.ts";
import { installDevices, loadDevice } from "./devices.ts";
import { expandBeat, loadRecipe } from "./intents.ts";
import { vignetteCss } from "./layers.ts";
import { applyLook, loadLook, paletteCss } from "./look.ts";
import type { PreviewOutput } from "./preview.ts";
import { finishPreview } from "./preview.ts";
import type { BeatSpec } from "./spec.ts";
import { isHtmlScene, parseBeatText } from "./spec.ts";
import { checkStageBeat, writeStageFrame } from "./stage.ts";
import { ENGINE_DIR, ROOT_DIR, copyInto, ensureDir, fail, hyperframesBin, log, r3, run, stripAnsi, writeJson } from "./lib/util.ts";

// Preview of a stage beat without a voice (engine/scenes/CONTRACT.md, «Проверка без голоса»):
//   npm run scene -- --device annotate.arrow           the device's demo on its neutral stage
//   npm run scene -- --stage media --src <file>        a stage alone (plus --beat '{"stage":{…},"devices":[…]}')
//   npm run scene -- quote-card                        a JSON recipe with its demo data
// The words of --text are spread evenly over the clip, so `at` words work as in a video.

export interface StagePreviewOptions extends PreviewOutput {
  stage?: string;
  src?: string;
  device?: string;
  recipe?: string;
  beat?: string;
  look?: string;
  text?: string;
  dur?: number;
  tone?: string;
  at?: string;
  /** text.caption: the preset to preview. */
  preset?: string;
  /** --device: JSON merged over the demo params (a mode: '{"mode":"blur"}'). */
  params?: string;
}

/** In a preview sync: music | both snaps to the test track (library/music/test-beat-100.wav) from 0 s. */
function previewGrid(duration: number): { beats: number[]; strong: number[] } {
  const g = trackBeats(musicFile("test-beat-100") ?? fail("нет library/music/test-beat-100.wav — тестовый трек превью sync: music"));
  return { beats: g.beats.filter((t) => t <= duration), strong: g.downbeats.filter((t) => t <= duration) };
}

function fakeClock(text: string, duration: number): Clock {
  const spoken = parseBeatText(text).tokens.flatMap((t) => t.spoken);
  const t0 = 0.35;
  const step = Math.max(0.12, (duration - 0.9 - t0) / Math.max(1, spoken.length));
  const at = (i: number): number => r3(t0 + i * step);
  return {
    duration,
    speechStart: t0,
    speechEnd: at(spoken.length),
    grid: previewGrid(duration),
    spoken,
    word: (ref: string) => {
      const m = /^([a-z0-9']+)(?:#(\d+))?(\.end)?$/i.exec(ref) as RegExpExecArray;
      const hits = spoken.map((w, i) => (w === (m[1] as string).toLowerCase() ? i : -1)).filter((i) => i >= 0);
      const i = hits[Number(m[2] ?? 1) - 1];
      if (i === undefined) fail(`превью: в тексте нет слова «${ref}»`);
      return m[3] ? r3(at(i) + step * 0.8) : at(i);
    },
  };
}

const parse = <T>(flag: string, text: string): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fail(`${flag}: не JSON: ${text}`);
  }
};

export function previewStage(opts: StagePreviewOptions): boolean {
  const lookRef: unknown = opts.look?.trim().startsWith("{") ? parse<unknown>("--look", opts.look) : (opts.look ?? "ember");
  const look = loadLook(lookRef, "--look");
  const style = applyLook(loadStyle("documentary-dark"), look);
  const extra = opts.beat ? parse<Record<string, unknown>>("--beat", opts.beat) : {};
  if (opts.device === "text.caption") return previewCaption(opts, look, style, extra);
  let beat: BeatSpec;
  let name: string;
  if (opts.device) {
    const def = loadDevice(opts.device, "--device");
    const demo = def.demo;
    const given = opts.params ? parse<Record<string, unknown>>("--params", opts.params) : {};
    const dev: DeviceSpec = { type: def.type, target: demo.target, at: demo.at ?? 0.6, params: { ...(demo.params ?? {}), ...given } };
    if (demo.until !== undefined) dev.until = demo.until;
    if (def.explains) dev.explains = "preview of the device";
    if (def.figures.length) dev.source = "https://example.org/preview";
    beat = { id: "pv", text: opts.text ?? demo.text ?? "A neutral preview line so every word of the device can land on time here.", pad: [0, 0], stage: (demo.stage as BeatSpec["stage"]) ?? { type: "color", color: "ground", glow: true }, devices: [dev], dominant: 0, ...extra } as BeatSpec;
    name = `device-${def.type}`;
  } else if (opts.recipe) {
    const tpl = loadRecipe(opts.recipe);
    const demo = tpl.demo ?? {};
    const raw = { id: "pv", scene: opts.recipe, text: opts.text ?? demo.text ?? "A neutral preview line for the recipe.", pad: [0, 0], target: demo.target, data: demo.data, stage: demo.stage, ...extra } as BeatSpec;
    beat = expandBeat(raw, isHtmlScene);
    name = `recipe-${opts.recipe}`;
  } else {
    const stage: Record<string, unknown> = { type: opts.stage ?? "color", ...((extra.stage as Record<string, unknown> | undefined) ?? {}) };
    if (opts.src) stage.src = isAbsolute(opts.src) ? opts.src : resolve(opts.src);
    beat = { id: "pv", text: opts.text ?? "A neutral preview line for the stage with enough words to anchor devices.", pad: [0, 0], dominant: "stage", ...extra, stage } as BeatSpec;
    name = `stage-${String(stage.type)}`;
  }
  if (opts.tone === "cold") beat.tone = "cold";
  for (const [i, d] of (beat.devices ?? []).entries()) if (loadDevice(d.type).figures.length && !d.source) (beat.devices as DeviceSpec[])[i] = { ...d, source: "https://example.org/preview" };
  checkStageBeat(beat, style, ROOT_DIR);
  const D = opts.dur ?? 5;
  const clock = fakeClock(beat.text, D);
  if (opts.name) name = opts.name;
  const dir = join(ROOT_DIR, ".preview", name);
  rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  copyInto(join(ENGINE_DIR, "assets", "fonts"), join(dir, "assets", "fonts"));
  copyInto(join(ENGINE_DIR, "assets", "vendor"), join(dir, "assets", "vendor"));
  installDevices(dir);
  writeJson(join(dir, "hyperframes.json"), { $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } });
  writeJson(join(dir, "meta.json"), { id: name, name });
  const frame = writeStageFrame({ beat, style, videoDir: ROOT_DIR, dir, compositionId: "pv", clock, fps: 30, seed: 1 });
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="assets/vendor/gsap.min.js"></script>
    <script src="assets/hygen/devices.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: ${toneColors(style, beat.tone ?? "accent").night}; }
      .scene { position: absolute; inset: 0; width: 100%; height: 100%; }
      ${paletteCss(style)}
      ${vignetteCss(style)}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="1080" data-height="1920">
      <div id="el-pv" class="scene" data-composition-id="pv" data-composition-src="compositions/frames/pv.html" data-start="0" data-duration="${D}" data-track-index="0"></div>
      <div id="hf-vignette" aria-hidden="true" data-layout-ignore></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`,
  );
  const lint = run(hyperframesBin(), ["lint"], { cwd: dir, allowFail: true });
  for (const line of stripAnsi(lint.stdout + lint.stderr).trim().split("\n").filter((l) => l.trim()).slice(-12)) log.info(line);
  const times = opts.at ?? [...new Set([...frame.events.map((e) => r3(Math.min(D - 0.05, e.t + 0.5))), frame.settle, r3(D - 0.1)])].sort((a, b) => a - b).join(",");
  const note = ` (события: ${frame.events.map((e) => `${e.label} ${e.t}`).join(" · ") || "нет"})`;
  const anchor = frame.events.length ? Math.min(...frame.events.map((e) => e.t)) : 0;
  return finishPreview({ dir, name, lookId: look.id, lintOk: lint.status === 0, times, note, total: D, anchor, out: opts });
}

/**
 * npm run scene -- --device text.caption --preset <name> [--look id] [--text "…"] [--dur 6] [--beat '{"caption":{…},"stage":{…}}']
 * The captions layer of one beat over its stage (a neutral ground by default); words of --text spread evenly, groups — phrase
 * unless the beat's caption says otherwise. Snapshots inside up to 7 groups → .preview/caption-<preset>/sheet.jpg.
 */
function previewCaption(opts: StagePreviewOptions, look: LookDef, style: StyleDef, extra: Record<string, unknown>): boolean {
  const def = loadDevice("text.caption", "--device");
  const preset = checkCaptionPreset(opts.preset ?? "plain", "--preset");
  const text = opts.text ?? def.demo.text ?? "A neutral preview line for the captions.";
  const D = opts.dur ?? 6;
  const name = opts.name ?? `caption-${preset}`;
  const dir = join(ROOT_DIR, ".preview", name);
  rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  copyInto(join(ENGINE_DIR, "assets", "fonts"), join(dir, "assets", "fonts"));
  copyInto(join(ENGINE_DIR, "assets", "vendor"), join(dir, "assets", "vendor"));
  installDevices(dir);
  const caption = { group: "phrase", ...((extra.caption as Record<string, unknown> | undefined) ?? {}), preset };
  checkCaptionFields(caption, "--beat caption");
  const beat = {
    id: "pv",
    text,
    pad: [0, 0],
    stage: (extra.stage as BeatSpec["stage"]) ?? { type: "color", color: "ground", glow: true },
    devices: (extra.devices as DeviceSpec[] | undefined) ?? [],
    dominant: (extra.dominant as BeatSpec["dominant"]) ?? "stage",
    caption,
  } as BeatSpec;
  if (opts.tone === "cold") beat.tone = "cold";
  checkStageBeat(beat, style, ROOT_DIR);
  writeStageFrame({ beat, style, videoDir: ROOT_DIR, dir, compositionId: "pv", clock: fakeClock(text, D), fps: 30, seed: 1 });
  const toks = parseBeatText(text).tokens;
  const t0 = 0.35;
  const step = Math.max(0.12, (D - 0.9 - t0) / Math.max(1, toks.length));
  const words: BeatWords = { beatId: "pv", tokens: toks.map((tk, i) => ({ id: `w${i}`, text: tk.display, start: r3(t0 + i * step), end: r3(t0 + i * step + step * 0.82) })), spoken: [], heard: "", matched: toks.length, snapped: 0 };
  const timing = { id: "pv", number: 1, start: 0, duration: D, end: D, speechStart: t0, speechEnd: r3(t0 + toks.length * step) };
  const plan = planCaptions({ spec: { id: name, beats: [beat], captions: undefined }, look, style, timings: [timing], words: [words], total: D, hits: [] });
  writeCaptions(dir, plan, style);
  installCaptions(dir, [preset]);
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="assets/vendor/gsap.min.js"></script>
    <script src="assets/hygen/devices.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: ${toneColors(style, beat.tone ?? "accent").night}; }
      .scene { position: absolute; inset: 0; width: 100%; height: 100%; }
      #el-captions { z-index: 35; }
      ${paletteCss(style)}
      ${vignetteCss(style)}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="1080" data-height="1920">
      <div id="el-pv" class="scene" data-composition-id="pv" data-composition-src="compositions/frames/pv.html" data-start="0" data-duration="${D}" data-track-index="0"></div>
      <div id="hf-vignette" aria-hidden="true" data-layout-ignore></div>
      <div id="el-captions" class="scene" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${D}" data-track-index="2"></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`,
  );
  const lint = run(hyperframesBin(), ["lint"], { cwd: dir, allowFail: true });
  for (const line of stripAnsi(lint.stdout + lint.stderr).trim().split("\n").filter((l) => l.trim()).slice(-12)) log.info(line);
  const groups = plan.cfg.groups;
  const pick = groups.length <= 7 ? groups : Array.from({ length: 7 }, (_, k) => groups[Math.round((k * (groups.length - 1)) / 6)] as (typeof groups)[number]);
  const times = opts.at ?? [...new Set(pick.map((g) => r3(Math.min(D - 0.05, g.start + Math.min(0.45, (g.end - g.start) * 0.6)))))].sort((a, b) => a - b).join(",");
  const anchor = groups.length ? Math.min(...groups.map((g) => g.start)) : t0;
  return finishPreview({ dir, name, lookId: look.id, lintOk: lint.status === 0, times, note: ` · групп ${groups.length} (${caption.group})`, total: D, anchor, lead: 0.15, out: opts });
}
