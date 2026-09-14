import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Tone } from "./contract.ts";
import { loadScene, loadStyle, renderTemplate, resolveParams, sceneIds, sceneTemplate, toneColors } from "./contract.ts";
import { backgroundHostsHtml, installRuntime, layerHostsHtml, motionConfig, postOverlays, prepareBackgrounds, typeInjection, validateLayers, videoSeed, vignetteCss, writeTextureLayers } from "./layers.ts";
import { applyLook, loadLook, paletteCss } from "./look.ts";
import { sceneEvents, warpHelper } from "./scenes.ts";
import { makeGrain } from "./sound.ts";
import type { BeatSpec, VideoSpec } from "./spec.ts";
import type { TextureRef } from "./textures.ts";
import { ENGINE_DIR, ROOT_DIR, copyInto, ensureDir, fail, hyperframesBin, log, python, r3, run, stripAnsi, writeJson } from "./lib/util.ts";

export interface PreviewOptions {
  params?: string;
  tone?: string;
  seed?: number;
  at?: string;
  style?: string;
  /** Look id or an inline JSON object ({"extends": "abyss", …}). */
  look?: string;
  /** JSON list of texture references over the scene, on top of the look's. */
  textures?: string;
  /** JSON of the beat's layers: {textures, background, type, camera, post}. */
  beat?: string;
}

const SHEET_PY = `
import glob, os, re, sys
from PIL import Image, ImageDraw
files = sorted(glob.glob(os.path.join(sys.argv[1], "**", "*.png"), recursive=True),
               key=lambda p: float((re.findall(r"(\\d+(?:\\.\\d+)?)s", os.path.basename(p)) or ["0"])[-1]))
w, h = 270, 480
sheet = Image.new("RGB", (max(1, len(files)) * w, h + 22), (12, 12, 12))
draw = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    sheet.paste(Image.open(f).convert("RGB").resize((w, h)), (i * w, 22))
    draw.text((i * w + 6, 5), os.path.basename(f)[:40], fill=(236, 231, 222))
sheet.save(sys.argv[2], quality=88)
print(len(files))
`;

function parseJson<T>(flag: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fail(`${flag}: не JSON: ${text}`);
  }
}

const BEAT_LAYER_KEYS = ["textures", "background", "type", "camera", "post"];

/**
 * One scene on its own reference timing, no voice: a throwaway HyperFrames project in .preview/<id>/ with the
 * look's layers (textures, background, camera, post, type presets), hyperframes lint, snapshots at the scene's
 * events and settle time, and a contact sheet.
 */
export function previewScene(id: string, opts: PreviewOptions): boolean {
  const lookRef: unknown = opts.look?.trim().startsWith("{") ? parseJson<unknown>("--look", opts.look) : (opts.look ?? "ember");
  const look = loadLook(lookRef, "--look");
  const style = applyLook(loadStyle(opts.style ?? "documentary-dark"), look);
  const scene = loadScene(id);
  const given = opts.params ? parseJson<Record<string, unknown>>("--params", opts.params) : {};
  if (opts.tone !== undefined && opts.tone !== "accent" && opts.tone !== "cold") fail("--tone: accent или cold");
  const tone = (opts.tone ?? "accent") as Tone;
  const seed = opts.seed ?? scene.seed.default;
  const layerFields = opts.beat ? parseJson<Record<string, unknown>>("--beat", opts.beat) : {};
  for (const key of Object.keys(layerFields)) if (!BEAT_LAYER_KEYS.includes(key)) fail(`--beat: поле ${key} — только ${BEAT_LAYER_KEYS.join(", ")}`);
  if (opts.textures) layerFields.textures = [...((layerFields.textures as TextureRef[] | undefined) ?? []), ...parseJson<TextureRef[]>("--textures", opts.textures)];
  const beat: BeatSpec = { id, scene: id, text: "preview", pad: [0, 0], params: given, tone, seed, ...layerFields };
  const previewId = `preview-${id}`;
  validateLayers({ id: previewId, beats: [beat], transitions: [] } as unknown as VideoSpec, look, ROOT_DIR);

  const dir = join(ROOT_DIR, ".preview", id);
  rmSync(dir, { recursive: true, force: true });
  ensureDir(join(dir, "compositions", "frames"));
  const params = resolveParams(beat, scene, { style, videoDir: ROOT_DIR, buildDir: dir });
  const D = scene.ref.duration;
  const knots = [...new Set([0, scene.ref.speechStart, scene.ref.speechEnd, D])].sort((a, b) => a - b);
  copyInto(join(ENGINE_DIR, "assets", "fonts"), join(dir, "assets", "fonts"));
  copyInto(join(ENGINE_DIR, "assets", "vendor"), join(dir, "assets", "vendor"));
  writeJson(join(dir, "hyperframes.json"), {
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  });
  writeJson(join(dir, "meta.json"), { id: previewId, name: previewId });

  // the scene's events stand in for the hits of a video: shake, chromatic and vignette-pulse fire on them
  const events = sceneEvents(scene, params);
  const hits = events.map((e) => e.ref);
  const inject = typeInjection({ beat, scene, look, style, compositionId: id, start: 0, duration: D, index: 0, hits, seed: videoSeed(previewId) });
  const html = renderTemplate(sceneTemplate(id), { sceneId: id, compositionId: id, duration: D, params, style, tone, seed, warpJs: warpHelper({ ref: knots, act: knots }), inject });
  writeFileSync(join(dir, "compositions", "frames", `${id}.html`), html);
  makeGrain(ROOT_DIR, dir);
  const layers = writeTextureLayers({ look, style, dir, total: D, hits, spans: [{ beatId: id, start: 0, duration: D, textures: beat.textures }] });
  const bgs = prepareBackgrounds({ beats: [{ beat, start: 0, duration: D }], look, style, videoDir: ROOT_DIR, dir, fps: 30 });
  const motion = motionConfig({ id: previewId, look, style, beats: [{ beat, start: 0, end: D, index: 0 }], hits, bgs, layers, transitions: [] });
  const runtime = motion.needs.runtime || inject.length > 0;
  if (runtime) installRuntime(dir);
  const post = postOverlays(motion.needs);
  const driver = runtime
    ? `\n      HygenMotion.root.init(${JSON.stringify(motion.config)});\n      var drive = { t: 0 };\n      tl.fromTo(drive, { t: 0 }, { t: ${D}, duration: ${D}, ease: "none", onUpdate: function () { HygenMotion.root.update(drive.t); } }, 0);`
    : "";
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="assets/vendor/gsap.min.js"></script>${runtime ? '\n    <script src="assets/hygen/runtime.js"></script>' : ""}
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: ${toneColors(style, tone).ground}; }
      .scene { position: absolute; inset: 0; width: 100%; height: 100%; }
      ${paletteCss(style)}
      ${vignetteCss(style)}
      ${post.css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="1080" data-height="1920">
      <div id="el-${id}" class="scene" data-composition-id="${id}" data-composition-src="compositions/frames/${id}.html" data-start="0" data-duration="${D}" data-track-index="0"></div>${backgroundHostsHtml(bgs)}
      <div id="hf-vignette" aria-hidden="true" data-layout-ignore></div>${post.html}${layerHostsHtml(layers)}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });${driver}
      tl.to({}, { duration: ${D} }, 0);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`,
  );
  const lint = run(hyperframesBin(), ["lint"], { cwd: dir, allowFail: true });
  for (const line of stripAnsi(lint.stdout + lint.stderr).trim().split("\n").filter((l) => l.trim()).slice(-12)) log.info(line);
  const times = opts.at
    ? opts.at
    : [...new Set([...events.map((e) => r3(Math.min(D - 0.05, e.ref + 0.7))), scene.settle])].sort((a, b) => a - b).join(",");
  const extras = [layers.length > 1 ? `текстуры ${layers.filter((l) => l.texture !== "grain").map((l) => l.texture).join(", ")}` : "", bgs.length ? "фон" : "", runtime ? "motion" : ""].filter(Boolean);
  console.log(`\nснимки ${id} · look ${look.id}${extras.length ? ` · ${extras.join(" · ")}` : ""} @ ${times} (события: ${events.map((e) => `${e.label} ${e.ref}`).join(" · ") || "нет"})`);
  const snapDir = join(dir, "snapshots");
  const snap = run(hyperframesBin(), ["snapshot", "--at", times, "--no-end", "--output", snapDir], { cwd: dir, allowFail: true });
  if (snap.status !== 0) {
    console.log(stripAnsi(snap.stdout + snap.stderr).slice(-1500));
    return false;
  }
  const sheet = join(dir, "sheet.jpg");
  run(python(), ["-c", SHEET_PY, snapDir, sheet]);
  console.log(`контактный лист: .preview/${id}/sheet.jpg · lint: ${lint.status === 0 ? "0 ошибок" : "ЕСТЬ ОШИБКИ"}`);
  return lint.status === 0;
}

export function listScenes(): boolean {
  for (const id of sceneIds()) {
    const s = loadScene(id);
    console.log(`${id.padEnd(18)} ${s.duration.min}–${s.duration.max} с${s.hero ? " · геройская" : ""}\n  ${s.use}`);
    console.log(`  параметры: ${Object.keys(s.params).join(", ")}`);
    console.log(`  якоря: ${Object.entries(s.anchors).map(([k, a]) => (a.required ? `${k}*` : k)).join(", ")}`);
    const slots = Object.entries(s.text ?? {});
    if (slots.length) console.log(`  текстовые слоты (type): ${slots.map(([k, t]) => `${k} (${t.kind})`).join(", ")}`);
  }
  return true;
}
