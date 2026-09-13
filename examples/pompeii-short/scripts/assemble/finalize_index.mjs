#!/usr/bin/env node
// finalize_index.mjs — project-specific finishing pass over the index.html that
// faceless-explainer/scripts/assemble-index.mjs writes. Run it right after assembly:
//
//   node .agents/skills/faceless-explainer/scripts/assemble-index.mjs --storyboard ./STORYBOARD.md --hyperframes .
//   node scripts/assemble/finalize_index.mjs
//
// 1. flash-through-white WebGL transition between frames 03 and 04 via @hyperframes/shader-transitions
//    (HyperShader). The workflow's transitions.mjs only knows its CSS registry, so the shader seam is
//    wired here: the outgoing frame is held under the blend (host + frame root + tail clips extended).
//    Every other seam stays a hard cut, as the brief asks.
// 2. global film grain (registry `grain-overlay`, its offset steps driven by the timeline instead of an
//    infinite CSS loop so every seek is deterministic) + radial vignette (registry `vignette`).
// 3. the mix: voiceover / music / sfx submix buses (<hf-audio-group>), the procedural drone that is cut
//    hard at the start of the finale, readable SFX ids. The voiceover carve is written afterwards by
//    .agents/skills/hyperframes-audio/scripts/carve.mjs.
//
// Idempotent: every value is recomputed from STORYBOARD.md / audio_timeline.json, never incremented.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const r3 = (x) => Math.round(x * 1000) / 1000;
const die = (m) => {
  console.error(`✗ finalize_index: ${m}`);
  process.exit(1);
};

const FLASH = { from: "03-eruption", to: "04-collapse", duration: 0.6, ease: "power2.inOut" };
const ASH = "#2E2C29";
const EMBER = "#FF5A1F";
const SHADER_CDN = "https://cdn.jsdelivr.net/npm/@hyperframes/shader-transitions@0.8.36/dist/index.global.js";

// Levels (linear). Voice lines are normalized to −20 LUFS; the bus lifts them. Beds sit well under the
// voice before the carve makes room; the final master level is verified against −14 LUFS after render.
// No master bus exists: bus faders sit after each clip's limiter, so they stay ≤ 1 and loudness is set
// at the source (voice lines are normalized to −15 LUFS by make_voice.py).
const LEVELS = {
  voiceBus: 1.0,
  musicBus: 1.0,
  sfxBus: 1.0,
  drone: 0.42,
  thud: 0.55,
  thudHeavy: 0.62,
  ash: 0.5,
};
// the finale's thud sits alone in the silence — a touch softer
const THUD_FINALE = 0.42;

const indexPath = join(ROOT, "index.html");
let html = readFileSync(indexPath, "utf8");
const timeline = JSON.parse(readFileSync(join(ROOT, "audio_timeline.json"), "utf8"));
const storyboard = readFileSync(join(ROOT, "STORYBOARD.md"), "utf8");

// ── frames (from the assembled hosts) ──────────────────────────────────────────
const hostRe = /<div\s+id="el-([^"]+)"\s+class="scene"([^>]*)><\/div>/g;
const frames = [];
for (const m of html.matchAll(hostRe)) {
  const attrs = m[2];
  const src = attrs.match(/data-composition-src="([^"]+)"/)?.[1];
  if (!src || !src.startsWith("compositions/frames/")) continue;
  frames.push({
    id: m[1],
    block: m[0],
    src,
    start: Number(attrs.match(/data-start="([\d.]+)"/)?.[1]),
    duration: Number(attrs.match(/data-duration="([\d.]+)"/)?.[1]),
  });
}
if (frames.length !== 6) die(`expected 6 frame hosts in index.html, found ${frames.length}`);
const total = Number(html.match(/data-composition-id="main"[^>]*?data-duration="([\d.]+)"/s)?.[1]);
if (!Number.isFinite(total)) die("root data-duration not found");

// storyboard base duration of the outgoing frame (never the already-extended value)
const sbDuration = (id) => {
  const block = storyboard.split(/^## Frame /m).find((b) => b.includes(`src: compositions/frames/${id}.html`));
  const d = Number(block?.match(/^- duration:\s*([\d.]+)s/m)?.[1]);
  if (!Number.isFinite(d)) die(`no storyboard duration for ${id}`);
  return d;
};

const from = frames.find((f) => f.id === FLASH.from);
const to = frames.find((f) => f.id === FLASH.to);
if (!from || !to) die("flash-through-white frames not mounted");
const baseDur = sbDuration(FLASH.from);
const heldDur = r3(baseDur + FLASH.duration);
const T = r3(to.start);

// ── 1a. hosts: hold the outgoing frame under the blend, solid scene grounds, 0/1 lanes ─────────
frames
  .sort((a, b) => a.start - b.start)
  .forEach((f, i) => {
    let block = f.block
      .replace(/\sstyle="[^"]*"/, "")
      .replace(/data-track-index="\d+"/, `data-track-index="${i % 2}"`);
    if (f.id === FLASH.from) block = block.replace(/data-duration="[\d.]+"/, `data-duration="${heldDur}"`);
    if (f.id === FLASH.from || f.id === FLASH.to)
      block = block.replace(/class="scene"/, `class="scene" style="background-color: ${ASH}"`);
    html = html.replace(f.block, block);
  });

// ── 1b. the outgoing frame file: root + every visual clip that reached the old end ───────────────
{
  const framePath = join(ROOT, from.src);
  const src = readFileSync(framePath, "utf8");
  let extended = 0;
  let rootDone = false;
  const out = src.replace(/<([A-Za-z][\w:-]*)\b([^>]*)>/g, (tag, name, attrs) => {
    const dm = attrs.match(/\bdata-duration="([\d.]+)"/);
    if (!rootDone && attrs.includes(`data-composition-id="${FLASH.from}"`)) {
      rootDone = true;
      return dm
        ? tag.replace(/\bdata-duration="[\d.]+"/, `data-duration="${heldDur}"`)
        : tag.replace(/(\s*\/?>)$/, ` data-duration="${heldDur}"$1`);
    }
    if (!dm || name.toLowerCase() === "audio") return tag;
    const sm = attrs.match(/\bdata-start="([\d.]+)"/);
    if (!sm) return tag;
    const start = Number(sm[1]);
    const end = start + Number(dm[1]);
    if (end < baseDur - 0.011) return tag;
    extended++;
    return tag.replace(/\bdata-duration="[\d.]+"/, `data-duration="${r3(heldDur - start)}"`);
  });
  if (!rootDone) die(`${from.src}: root data-composition-id="${FLASH.from}" not found`);
  writeFileSync(framePath, out);
  console.log(`  ${FLASH.from}: held ${baseDur}s → ${heldDur}s (root + ${extended} tail clip(s))`);
}

// ── 1c + 2. head: shader runtime + overlay styles ────────────────────────────────────────────────
html = html.replace(/\s*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@hyperframes\/shader-transitions[^"]*"><\/script>/g, "");
html = html.replace(/(<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"]+"[^>]*><\/script>)/, `$1\n    <script src="${SHADER_CDN}"></script>`);
// Grain: the registry grain-overlay's structure and offset stepping, but with two complementary seeded
// tiles (scripts/assemble/make_grain.py) instead of a mid-grey SVG noise, which lifted black by ~8/255
// while its grain stayed ~2/255 — invisible after platform compression.
const overlayCss = `
      /* ── global finish (scripts/assemble/finalize_index.mjs) ── */
      #el-captions {
        z-index: 35;
      }
      #hf-vignette {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 30;
        background: radial-gradient(ellipse 78% 64% at 50% 42%, rgba(10, 10, 9, 0) 55%, rgba(10, 10, 9, 0.6) 100%);
      }
      #grain-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 40;
        overflow: hidden;
      }
      #grain-texture {
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
      }
      #grain-dark,
      #grain-light {
        position: absolute;
        inset: 0;
        background-size: 512px 512px;
      }
      #grain-dark {
        background-image: url("assets/grain/grain-dark.png");
        opacity: 0.16;
      }
      #grain-light {
        background-image: url("assets/grain/grain-light.png");
        opacity: 0.12;
      }
      /* ── /global finish ── */`;
html = html.replace(/\n\s*\/\* ── global finish \(scripts[\s\S]*?\/\* ── \/global finish ── \*\//, "");
html = html.replace(/(\s*)<\/style>\s*<\/head>/, `${overlayCss}\n    </style>\n  </head>`);

// ── 2b + 3. body: overlays + audio buses, drone, SFX ids ─────────────────────────────────────────
html = html.replace(/\n\s*<!-- global finish:[\s\S]*?<!-- \/global finish -->/, "");
// voice lines join the voiceover bus
html = html.replace(/<audio\s+id="el-([^"]+)-voice"(?![^>]*data-audio-group)/g, '<audio\n        id="el-$1-voice"\n        data-audio-group="voiceover"');
// back-to-back lines touch exactly, but start + duration in float lands 1e-15 s past the next start
// (lint duplicate_audio_track) — alternate the voice lanes 10 / 12 (the drone sits on 11)
let voiceLane = 0;
html = html.replace(/<audio\s+id="el-[^"]+-voice"[^>]*>/g, (tag) =>
  tag.replace(/data-track-index="\d+"/, `data-track-index="${voiceLane++ % 2 === 0 ? 10 : 12}"`),
);
// SFX: readable ids + the sfx bus + levels
let sfxIndex = 0;
html = html.replace(/<audio\s+id="el-sfx-\d+"\s+src="([^"]+)"\s+data-start="([\d.]+)"([^>]*)><\/audio>/g, (tag, src, start, rest) => {
  const t = Number(start);
  const frame = frames.slice().sort((a, b) => a.start - b.start).findLast((f) => f.start <= t + 0.35);
  const nn = frame ? frame.id.slice(0, 2) : String(sfxIndex).padStart(2, "0");
  const kind = src.includes("ash-fall") ? "ash-fall" : src.includes("thud-heavy") ? "thud-heavy" : "thud";
  const vol = kind === "ash-fall" ? LEVELS.ash : kind === "thud-heavy" ? LEVELS.thudHeavy : nn === "06" ? THUD_FINALE : LEVELS.thud;
  sfxIndex++;
  const dur = rest.match(/data-duration="([\d.]+)"/)?.[1];
  const lane = rest.match(/data-track-index="(\d+)"/)?.[1];
  return `<audio\n        id="sfx-${kind}-${nn}"\n        src="${src}"\n        data-start="${r3(t)}"\n        data-duration="${dur}"\n        data-track-index="${lane}"\n        data-volume="${vol}"\n        data-audio-group="sfx"\n      ></audio>`;
});
// float noise from the assembler's cumulative sum (21.557000000000002 → 21.557)
html = html.replace(/data-start="(\d+\.\d{4,})"/g, (_, v) => `data-start="${r3(Number(v))}"`);
html = html.replace(/\n\s*<!-- mix buses[\s\S]*?<!-- \/mix buses -->/, "");
const voiceChain = {
  version: 1,
  nodes: [
    { type: "highpass", id: "n1", label: "Remove Rumble", params: { frequency: 70, q: 0.707, poles: "2" } },
    { type: "peaking", id: "n2", label: "Reduce Mud", params: { frequency: 250, gain: -2, q: 1.2 } },
    { type: "peaking", id: "n4", label: "Add Clarity", params: { frequency: 3000, gain: 1.5, q: 1 } },
    { type: "limiter", id: "n5", label: "Peak Ceiling", params: { limit: -2.5, attack: 5, release: 60, level_out: 0 } },
  ],
};
const attr = (o) => JSON.stringify(o).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
// The voice chain rides on every narration clip, NOT on the bus. The engine sums a bus into a 32-bit
// float WAV, which ffmpeg writes as WAVE_FORMAT_EXTENSIBLE (65534); the engine's FX reader only takes
// format 1/16-bit or 3/32-bit, so any bus with a data-fx-chain fails the whole mix
// ("Unsupported WAV format 65534/32-bit"). Clip chains are decoded to 16-bit PCM first and render fine.
// The buses stay as real groups: membership, labels and one fader each.
html = html.replace(/<audio\s+id="el-[^"]+-voice"[^>]*>/g, (tag) =>
  tag.replace(/\s*data-fx-chain="[^"]*"/, "").replace(/(\s*)>$/, `\n        data-fx-chain="${attr(voiceChain)}"$1>`),
);
const cut = r3(timeline.cut_s);
const buses = `
      <!-- mix buses (scripts/assemble/finalize_index.mjs) -->
      <hf-audio-group id="voiceover" data-label="Голос" data-volume="${LEVELS.voiceBus}"></hf-audio-group>
      <hf-audio-group id="music" data-label="Музыка — дрон" data-volume="${LEVELS.musicBus}"></hf-audio-group>
      <hf-audio-group id="sfx" data-label="SFX" data-volume="${LEVELS.sfxBus}"></hf-audio-group>
      <!-- procedural drone: swells to the eruption (${timeline.peak_s}s), cut hard at the finale (${cut}s) -->
      <audio
        id="music-drone"
        src="assets/music/drone.wav"
        data-start="0"
        data-duration="${cut}"
        data-track-index="11"
        data-volume="${LEVELS.drone}"
        data-audio-group="music"
      ></audio>
      <!-- /mix buses -->`;
const overlays = `
      <!-- global finish: vignette + film grain (registry: vignette, grain-overlay) -->
      <div id="hf-vignette" aria-hidden="true" data-layout-ignore></div>
      <div id="grain-overlay" aria-hidden="true" data-layout-ignore><div id="grain-texture"><div id="grain-dark"></div><div id="grain-light"></div></div></div>
      <!-- /global finish -->`;
html = html.replace(/(\n\s*<\/div>\s*\n\s*<script>)/, `${buses}\n${overlays}$1`);

// ── 1d + 2c. main timeline: HyperShader seam + grain driver + full-span anchor ───────────────────
const mainScript = `<script>
      (function () {
        var TOTAL = ${total};
        // flash-through-white between frame 03 and 04 — every other seam is a hard cut
        var tl = HyperShader.init({
          bgColor: "${ASH}",
          accentColor: "${EMBER}",
          compositionId: "main",
          scenes: ["el-${FLASH.from}", "el-${FLASH.to}"],
          transitions: [{ time: ${T}, shader: "flash-through-white", duration: ${FLASH.duration}, ease: "${FLASH.ease}" }],
        });
        // film grain: the registry grain-overlay's offset steps, stepped by timeline time (seek-safe)
        var grain = document.getElementById("grain-texture");
        var OFFS = [[0, 0], [-5, -5], [-10, 5], [5, -10], [-5, 15], [-10, 5], [15, 0], [0, 10], [-15, 0], [10, 5], [3, -7], [-12, -3], [8, 12]];
        var drive = { t: 0 };
        tl.fromTo(drive, { t: 0 }, {
          t: TOTAL,
          duration: TOTAL,
          ease: "none",
          onUpdate: function () {
            var o = OFFS[Math.floor(drive.t * 24) % OFFS.length];
            grain.style.transform = "translate(" + o[0] + "%, " + o[1] + "%)";
          },
        }, 0);
        tl.to({}, { duration: TOTAL }, 0);
        window.__timelines = window.__timelines || {};
        window.__timelines["main"] = tl;
      })();
    </script>`;
const scriptRe = /<script>\s*(?:\(function \(\) \{[\s\S]*?\}\)\(\);|window\.__timelines = window\.__timelines \|\| \{\};\s*window\.__timelines\["main"\] = gsap\.timeline\(\{ paused: true \}\);)\s*<\/script>/;
if (!scriptRe.test(html)) die("main timeline script not found");
html = html.replace(scriptRe, mainScript);

writeFileSync(indexPath, html);
console.log(`✓ finalize_index: flash-through-white @ ${T}s (${FLASH.duration}s), grain + vignette, buses voiceover/music/sfx, drone 0→${cut}s, ${sfxIndex} SFX`);
