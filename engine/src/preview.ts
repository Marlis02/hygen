import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Tone } from "./contract.ts";
import { loadScene, loadStyle, renderTemplate, resolveParams, sceneIds, sceneTemplate, toneColors } from "./contract.ts";
import { backgroundHostsHtml, installRuntime, layerHostsHtml, motionConfig, planTransitions, postOverlays, prepareBackgrounds, typeInjection, validateLayers, videoSeed, vignetteCss, writeTextureLayers } from "./layers.ts";
import { applyLook, loadLook, paletteCss } from "./look.ts";
import { checkTransitionRef } from "./motion.ts";
import { sceneEvents, warpHelper } from "./scenes.ts";
import { makeGrain } from "./sound.ts";
import type { BeatSpec, VideoSpec } from "./spec.ts";
import type { TextureRef } from "./textures.ts";
import { LIBRARY_DIR, ROOT_DIR, copyInto, ensureDir, fail, hyperframesBin, log, python, r3, run, stripAnsi, writeJson } from "./lib/util.ts";

/** Flags shared by every `npm run scene` preview: where it is built and whether it becomes an MP4. */
export interface PreviewOutput {
  /** .preview/<name>/ instead of the default folder — parallel previews must not share one. */
  name?: string;
  /** Render the preview project and write a silent 540×960 H.264 clip here. */
  render?: string;
  /** false (--no-sheet) — no snapshots and no contact sheet. */
  sheet?: boolean;
  /** Start of the clip, s (default: just before the first event). */
  from?: number;
  /** Length of the clip, s (default: --dur of a stage preview, else 3). */
  clip?: number;
}

export interface PreviewOptions extends PreviewOutput {
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
  /** Transition id(s) ("iris", "flash+ash-burst", '["flash","ash-burst"]'): two beats of the scene with this cut between them. */
  transition?: string;
}

export const SHEET_PY = `
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

/** The clip of a preview: `length` s (≤ the composition), from `anchor − lead` unless --from says otherwise. */
export function clipWindow(total: number, anchor: number, out: PreviewOutput & { dur?: number }, lead = 0.25): { from: number; length: number } {
  const length = r3(Math.min(total, out.clip ?? out.dur ?? 3));
  const from = out.from ?? Math.min(Math.max(0, anchor - lead), total - length);
  return { from: r3(Math.max(0, Math.min(from, total - length))), length };
}

/**
 * --render: hyperframes render of the preview project (quality draft, like renderProject), then ffmpeg cuts
 * [from, from + length], scales to 540×960 and writes H.264 crf 26, yuv420p, faststart, no audio (via .part).
 * HYGEN_PREVIEW_WORKERS limits the render workers (npm run library:previews).
 */
export function renderClip(dir: string, out: string, from: number, length: number): boolean {
  const raw = join(ensureDir(join(dir, "renders")), "preview-raw.mp4");
  const workers = process.env.HYGEN_PREVIEW_WORKERS;
  console.log(`\nрендер ${relative(ROOT_DIR, dir)} → ${out} · ${from}–${r3(from + length)} с`);
  const r = run(hyperframesBin(), ["render", "--output", raw, "--quality", "draft", "--fps", "30", ...(workers ? ["--workers", workers] : [])], { cwd: dir, allowFail: true });
  if (r.status !== 0 || !existsSync(raw)) {
    console.log(stripAnsi(r.stdout + r.stderr).slice(-1500));
    return false;
  }
  const target = resolve(out);
  ensureDir(dirname(target));
  const part = `${target}.part.mp4`;
  const enc = ["-map", "0:v:0", "-an", "-sn", "-dn", "-vf", "scale=540:960:flags=lanczos", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
  const f = run("ffmpeg", ["-v", "error", "-y", "-ss", from.toFixed(3), "-i", raw, "-t", length.toFixed(3), ...enc, part], { allowFail: true });
  if (f.status !== 0 || !existsSync(part)) {
    rmSync(part, { force: true });
    console.log(stripAnsi(f.stderr).slice(-1500));
    return false;
  }
  renameSync(part, target);
  console.log(`превью MP4: ${relative(ROOT_DIR, target)} (${length} с)`);
  return true;
}

/** Snapshots + contact sheet (unless --no-sheet), then the clip (with --render). */
export function finishPreview(input: { dir: string; name: string; lookId: string; lintOk: boolean; times: string; note: string; total: number; anchor: number; lead?: number; out: PreviewOutput & { dur?: number } }): boolean {
  const { dir, name, out } = input;
  if (out.sheet !== false) {
    console.log(`\nснимки ${name} · look ${input.lookId}${input.note} @ ${input.times}`);
    const snapDir = join(dir, "snapshots");
    const snap = run(hyperframesBin(), ["snapshot", "--at", input.times, "--no-end", "--output", snapDir], { cwd: dir, allowFail: true });
    if (snap.status !== 0) {
      console.log(stripAnsi(snap.stdout + snap.stderr).slice(-1500));
      return false;
    }
    run(python(), ["-c", SHEET_PY, snapDir, join(dir, "sheet.jpg")]);
    console.log(`контактный лист: .preview/${name}/sheet.jpg · lint: ${input.lintOk ? "0 ошибок" : "ЕСТЬ ОШИБКИ"}`);
  } else console.log(`lint ${name}: ${input.lintOk ? "0 ошибок" : "ЕСТЬ ОШИБКИ"}`);
  if (out.render) {
    const w = clipWindow(input.total, input.anchor, out, input.lead);
    if (!renderClip(dir, out.render, w.from, w.length)) return false;
  }
  return input.lintOk;
}

const BEAT_LAYER_KEYS = ["textures", "background", "type", "camera", "post"];

/**
 * One scene on its own reference timing, no voice: a throwaway HyperFrames project in .preview/<id>/ with the
 * look's layers (textures, background, camera, post, type presets), hyperframes lint, snapshots at the scene's
 * events and settle time, and a contact sheet. --transition: the scene twice (accent, then the other tone) with
 * that transition over the cut → .preview/transition-<id>/.
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
  const pair = opts.transition !== undefined;
  const beats: BeatSpec[] = [{ id: pair ? "pv-a" : id, scene: id, text: "preview", pad: [0, 0], params: given, tone, seed, ...layerFields }];
  if (pair) {
    const transition = checkTransitionRef(opts.transition?.trim().startsWith("[") ? parseJson<unknown>("--transition", opts.transition) : opts.transition, "--transition");
    beats.push({ ...(beats[0] as BeatSpec), id: "pv-b", tone: tone === "accent" ? "cold" : "accent", seed: seed + 1, transition });
  }
  const previewId = `preview-${id}`;
  const spec = { id: previewId, beats, transitions: [] } as unknown as VideoSpec;
  validateLayers(spec, look, ROOT_DIR);

  const name = opts.name ?? (pair ? `transition-${id}` : id);
  const dir = join(ROOT_DIR, ".preview", name);
  rmSync(dir, { recursive: true, force: true });
  ensureDir(join(dir, "compositions", "frames"));
  const D = scene.ref.duration;
  const total = r3(D * beats.length);
  const spans = beats.map((beat, index) => ({ beat, index, start: r3(index * D) }));
  const knots = [...new Set([0, scene.ref.speechStart, scene.ref.speechEnd, D])].sort((a, b) => a - b);
  copyInto(join(LIBRARY_DIR, "assets", "fonts"), join(dir, "assets", "fonts"));
  copyInto(join(LIBRARY_DIR, "assets", "vendor"), join(dir, "assets", "vendor"));
  writeJson(join(dir, "hyperframes.json"), {
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  });
  writeJson(join(dir, "meta.json"), { id: previewId, name: previewId });

  // the scene's events stand in for the hits of a video: shake, chromatic and vignette-pulse fire on them
  const params = spans.map(({ beat }) => resolveParams(beat, scene, { style, videoDir: ROOT_DIR, buildDir: dir }));
  const events = sceneEvents(scene, params[0] as Record<string, unknown>);
  const hits = spans.flatMap(({ start }) => events.map((e) => r3(start + e.ref)));
  let injected = false;
  for (const { beat, index, start } of spans) {
    const inject = typeInjection({ beat, scene, look, style, compositionId: beat.id, start, duration: D, index, hits, seed: videoSeed(previewId) });
    injected ||= inject.length > 0;
    const html = renderTemplate(sceneTemplate(id), { sceneId: id, compositionId: beat.id, duration: D, params: params[index] as Record<string, unknown>, style, tone: beat.tone ?? "accent", seed: beat.seed ?? seed, warpJs: warpHelper({ ref: knots, act: knots }), inject });
    writeFileSync(join(dir, "compositions", "frames", `${beat.id}.html`), html);
  }
  makeGrain(ROOT_DIR, dir);
  const layers = writeTextureLayers({ look, style, dir, total, hits, spans: spans.map(({ beat, start }) => ({ beatId: beat.id, start, duration: D, textures: beat.textures })) });
  const bgs = prepareBackgrounds({ beats: spans.map(({ beat, start }) => ({ beat, start, duration: D })), look, style, videoDir: ROOT_DIR, dir, fps: 30 });
  const planned = pair ? planTransitions(spec, look, spans, []) : [];
  const motion = motionConfig({ id: previewId, look, style, beats: spans.map(({ beat, start, index }) => ({ beat, start, end: r3(start + D), index })), hits, bgs, layers, transitions: planned });
  const runtime = motion.needs.runtime || injected;
  if (runtime) installRuntime(dir);
  const post = postOverlays(motion.needs);
  const flashes = planned.filter((tr) => tr.list.includes("flash"));
  const burst = planned.some((tr) => tr.list.includes("ash-burst"));
  const overlayCss = [flashes.length ? `.hf-flash { position: absolute; inset: 0; pointer-events: none; z-index: 28; background-color: ${toneColors(style, "accent").text}; opacity: 0; }` : "", burst ? "#hf-burst { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; pointer-events: none; z-index: 29; }" : ""].filter(Boolean).join("\n      ");
  const overlayHtml = flashes.map((_, i) => `\n      <div id="hf-flash-${i}" class="hf-flash" aria-hidden="true" data-layout-ignore></div>`).join("") + (burst ? '\n      <canvas id="hf-burst" width="540" height="960" aria-hidden="true" data-layout-ignore data-layout-allow-occlusion></canvas>' : "");
  const hosts = spans.map(({ beat, index, start }) => `\n      <div id="el-${beat.id}" class="scene" data-composition-id="${beat.id}" data-composition-src="compositions/frames/${beat.id}.html" data-start="${start}" data-duration="${D}" data-track-index="${index % 2}"></div>`).join("");
  const driver = runtime
    ? `\n      HygenMotion.root.init(${JSON.stringify(motion.config)});\n      var drive = { t: 0 };\n      tl.fromTo(drive, { t: 0 }, { t: ${total}, duration: ${total}, ease: "none", onUpdate: function () { HygenMotion.root.update(drive.t); } }, 0);`
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
      ${post.css}${overlayCss ? `\n      ${overlayCss}` : ""}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1080" data-height="1920">${hosts}${backgroundHostsHtml(bgs)}${overlayHtml}
      <div id="hf-vignette" aria-hidden="true" data-layout-ignore></div>${post.html}${layerHostsHtml(layers)}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });${driver}
      tl.to({}, { duration: ${total} }, 0);
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
    : pair
      ? [-0.3, 0.05, 0.2, 0.4, 0.9].map((d) => r3(D + d)).join(",")
      : [...new Set([...events.map((e) => r3(Math.min(D - 0.05, e.ref + 0.7))), scene.settle])].sort((a, b) => a - b).join(",");
  const extras = [layers.length > 1 ? `текстуры ${layers.filter((l) => l.texture !== "grain").map((l) => l.texture).join(", ")}` : "", bgs.length ? "фон" : "", runtime ? "motion" : "", planned.length ? `переход ${planned.map((tr) => tr.list.join("+")).join(", ")}` : ""].filter(Boolean);
  const note = `${extras.length ? ` · ${extras.join(" · ")}` : ""} (события: ${events.map((e) => `${e.label} ${e.ref}`).join(" · ") || "нет"})`;
  // the clip: around the cut for a transition, else from just before the scene's first event
  const clip = clipWindow(total, 0, opts);
  const anchor = pair ? r3(D - clip.length / 2) : Math.min(...events.map((e) => e.ref), scene.settle);
  return finishPreview({ dir, name, lookId: look.id, lintOk: lint.status === 0, times, note, total, anchor, lead: pair ? 0 : 0.25, out: opts });
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
