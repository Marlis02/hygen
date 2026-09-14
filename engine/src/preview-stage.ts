import { rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { loadStyle, toneColors } from "./contract.ts";
import type { Clock, DeviceSpec } from "./devices.ts";
import { installDevices, loadDevice } from "./devices.ts";
import { expandBeat, loadRecipe } from "./intents.ts";
import { vignetteCss } from "./layers.ts";
import { applyLook, loadLook, paletteCss } from "./look.ts";
import { SHEET_PY } from "./preview.ts";
import type { BeatSpec } from "./spec.ts";
import { isHtmlScene, parseBeatText } from "./spec.ts";
import { checkStageBeat, writeStageFrame } from "./stage.ts";
import { ENGINE_DIR, ROOT_DIR, copyInto, ensureDir, fail, hyperframesBin, log, python, r3, run, stripAnsi, writeJson } from "./lib/util.ts";

// Preview of a stage beat without a voice (engine/scenes/CONTRACT.md, «Проверка без голоса»):
//   npm run scene -- --device annotate.arrow           the device's demo on its neutral stage
//   npm run scene -- --stage media --src <file>        a stage alone (plus --beat '{"stage":{…},"devices":[…]}')
//   npm run scene -- quote-card                        a JSON recipe with its demo data
// The words of --text are spread evenly over the clip, so `at` words work as in a video.

export interface StagePreviewOptions {
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
  let beat: BeatSpec;
  let name: string;
  if (opts.device) {
    const def = loadDevice(opts.device, "--device");
    const demo = def.demo;
    const dev: DeviceSpec = { type: def.type, target: demo.target, at: demo.at ?? 0.6, params: demo.params };
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
  console.log(`\nснимки ${name} · look ${look.id} @ ${times} (события: ${frame.events.map((e) => `${e.label} ${e.t}`).join(" · ") || "нет"})`);
  const snapDir = join(dir, "snapshots");
  const snap = run(hyperframesBin(), ["snapshot", "--at", times, "--no-end", "--output", snapDir], { cwd: dir, allowFail: true });
  if (snap.status !== 0) {
    console.log(stripAnsi(snap.stdout + snap.stderr).slice(-1500));
    return false;
  }
  run(python(), ["-c", SHEET_PY, snapDir, join(dir, "sheet.jpg")]);
  console.log(`контактный лист: .preview/${name}/sheet.jpg · lint: ${lint.status === 0 ? "0 ошибок" : "ЕСТЬ ОШИБКИ"}`);
  return lint.status === 0;
}
