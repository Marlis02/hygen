import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Tone } from "./contract.ts";
import { loadScene, loadStyle, renderTemplate, resolveParams, sceneIds, sceneTemplate, toneColors } from "./contract.ts";
import { sceneEvents, warpHelper } from "./scenes.ts";
import type { BeatSpec } from "./spec.ts";
import { ENGINE_DIR, ROOT_DIR, copyInto, ensureDir, fail, hyperframesBin, log, python, r3, run, stripAnsi, writeJson } from "./lib/util.ts";

export interface PreviewOptions {
  params?: string;
  tone?: string;
  seed?: number;
  at?: string;
  style?: string;
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

/**
 * One scene on its own reference timing, no voice: a throwaway HyperFrames project in .preview/<id>/,
 * hyperframes lint, snapshots at the scene's events and settle time, and a contact sheet.
 */
export function previewScene(id: string, opts: PreviewOptions): boolean {
  const style = loadStyle(opts.style ?? "documentary-dark");
  const scene = loadScene(id);
  let given: Record<string, unknown> = {};
  if (opts.params) {
    try {
      given = JSON.parse(opts.params) as Record<string, unknown>;
    } catch {
      fail(`--params: не JSON: ${opts.params}`);
    }
  }
  if (opts.tone !== undefined && opts.tone !== "accent" && opts.tone !== "cold") fail("--tone: accent или cold");
  const tone = (opts.tone ?? "accent") as Tone;
  const seed = opts.seed ?? scene.seed.default;
  const beat: BeatSpec = { id, scene: id, text: "preview", pad: [0, 0], params: given, tone, seed };
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
  writeJson(join(dir, "meta.json"), { id: `preview-${id}`, name: `preview-${id}` });
  const html = renderTemplate(sceneTemplate(id), { sceneId: id, compositionId: id, duration: D, params, style, tone, seed, warpJs: warpHelper({ ref: knots, act: knots }) });
  writeFileSync(join(dir, "compositions", "frames", `${id}.html`), html);
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="assets/vendor/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: ${toneColors(style, tone).ground}; }
      .scene { position: absolute; inset: 0; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="1080" data-height="1920">
      <div id="el-${id}" class="scene" data-composition-id="${id}" data-composition-src="compositions/frames/${id}.html" data-start="0" data-duration="${D}" data-track-index="0"></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      tl.to({}, { duration: ${D} }, 0);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`,
  );
  const lint = run(hyperframesBin(), ["lint"], { cwd: dir, allowFail: true });
  for (const line of stripAnsi(lint.stdout + lint.stderr).trim().split("\n").filter((l) => l.trim()).slice(-12)) log.info(line);
  const events = sceneEvents(scene, params);
  const times = opts.at
    ? opts.at
    : [...new Set([...events.map((e) => r3(Math.min(D - 0.05, e.ref + 0.7))), scene.settle])].sort((a, b) => a - b).join(",");
  console.log(`\nснимки ${id} @ ${times} (события: ${events.map((e) => `${e.label} ${e.ref}`).join(" · ") || "нет"})`);
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
  }
  return true;
}
