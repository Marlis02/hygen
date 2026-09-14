import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join } from "node:path";
import type { StyleDef } from "./contract.ts";
import { checkLicense, fontFaces, fontStack, loadMap, missingSources, toneColors } from "./contract.ts";
import type { Box, Clock, ResolvedDevice } from "./devices.ts";
import { LAYER_Z, atSeconds, boxPx, checkAt, checkDeviceSpec, deviceEvents, deviceFigures, loadDevice, pctBox, pctPoint, pointPx, resolveDevices } from "./devices.ts";
import type { SceneBuild } from "./scenes.ts";
import type { BeatSpec, VideoSpec } from "./spec.ts";
import { parseBeatText } from "./spec.ts";
import type { BeatTiming } from "./timeline.ts";
import { wordTime } from "./timeline.ts";
import type { BeatWords } from "./words.ts";
import { ROOT_DIR, ensureDir, fail, fileSha, lastJsonLine, log, pyScript, python, r3, run, sha } from "./lib/util.ts";

// Stage of a beat v2 (engine/scenes/CONTRACT.md, «Бит v2», «Stage»): the base of the frame — media | split | map | color —
// written by the build as a sub-composition with fixed z-layers (stage → focus → data → annotate → text) and played by
// engine/stage/runtime.js + engine/devices/runtime.js. Video is real footage: trim (in/out → data-media-start), rate
// (data-playback-rate), stop-frames (an exact ffmpeg frame as an <img> clip between two video clips), reverse and the
// treatments baked once into a cache (engine/py/media_stage.py), crop/pan on an inner wrapper.

export const STAGE_TYPES = ["media", "split", "map", "color"];
export const TREATMENTS = ["none", "film-memory", "engraved", "two-ink"];
export const CAMERA_REASONS = ["approach", "reveal", "follow", "tension"];

const VIDEO_RE = /\.(webm|mp4|mov|ogv|mkv)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;
const MEDIA_KEYS = ["src", "in", "out", "rate", "hold", "reverse", "crop", "pan", "fit", "focus", "zoom", "treatment"];
const STAGE_KEYS: Record<string, string[]> = {
  media: ["type", "regions", "source", ...MEDIA_KEYS],
  split: ["type", "regions", "source", "a", "b", "at", "dur", "direction", "labels"],
  map: ["type", "regions", "source", "map", "markers", "route", "reveal", "draw"],
  color: ["type", "regions", "color", "glow"],
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const NUM = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const mediaPath = (v: string, videoDir: string): string => (isAbsolute(v) ? v : v.startsWith("engine/") || v.startsWith("videos/") ? join(ROOT_DIR, v) : join(videoDir, v));

export const spokenOf = (beat: BeatSpec): string[] => parseBeatText(beat.text).tokens.flatMap((t) => t.spoken);

// ── checks before the voice ──────────────────────────────────────────────────────────────────────

function checkMedia(m: unknown, where: string, videoDir: string, spoken: string[]): { video: boolean } {
  if (!isObj(m)) return fail(`${where}: {src, in, out, rate, hold, crop, pan, fit, treatment}`);
  for (const key of Object.keys(m)) if (!MEDIA_KEYS.includes(key) && !["type", "regions", "source"].includes(key)) fail(`${where}: неизвестное поле ${key}; есть: ${MEDIA_KEYS.join(", ")}`);
  if (typeof m.src !== "string" || !m.src) fail(`${where}: src — файл картинки или видео от папки ролика`);
  const file = mediaPath(m.src as string, videoDir);
  if (!existsSync(file)) fail(`${where}: нет файла ${file}`);
  checkLicense(file, where);
  const video = VIDEO_RE.test(file);
  if (!video && !IMAGE_RE.test(file)) fail(`${where}: src — jpg, png, webp или webm, mp4, mov, ogv`);
  for (const key of ["in", "out", "rate", "reverse"]) if (!video && m[key] !== undefined) fail(`${where}: ${key} — только у видео`);
  if (m.in !== undefined && (!NUM(m.in) || m.in < 0)) fail(`${where}: in — секунды исходника ≥ 0`);
  if (m.out !== undefined && (!NUM(m.out) || m.out <= ((m.in as number) ?? 0))) fail(`${where}: out — секунды исходника больше in`);
  if (m.rate !== undefined && (!NUM(m.rate) || m.rate < 0.1 || m.rate > 5)) fail(`${where}: rate — 0.1–5 (постоянная скорость)`);
  if (m.reverse !== undefined && typeof m.reverse !== "boolean") fail(`${where}: reverse — true или false`);
  if (m.hold !== undefined) {
    if (!Array.isArray(m.hold)) fail(`${where}: hold — [{at, dur | until}]`);
    (m.hold as unknown[]).forEach((h, i) => {
      if (!isObj(h) || h.at === undefined) fail(`${where}: hold[${i}] — {at, dur | until}`);
      checkAt(h.at, spoken, `${where}: hold[${i}].at`);
      if (h.until !== undefined) checkAt(h.until, spoken, `${where}: hold[${i}].until`);
      else if (!NUM(h.dur) || h.dur <= 0) fail(`${where}: hold[${i}] — dur > 0 или until`);
    });
  }
  if (m.crop !== undefined) pctBox(m.crop, `${where}: crop`);
  if (m.pan !== undefined) {
    if (!isObj(m.pan)) fail(`${where}: pan — {to: {x, y, w, h}, at, dur}`);
    pctBox(m.pan.to, `${where}: pan.to`);
    if (m.pan.at !== undefined) checkAt(m.pan.at, spoken, `${where}: pan.at`);
    if (m.pan.dur !== undefined && (!NUM(m.pan.dur) || m.pan.dur <= 0)) fail(`${where}: pan.dur > 0`);
  }
  if (m.fit !== undefined && !["cover", "contain"].includes(m.fit as string)) fail(`${where}: fit — cover или contain`);
  if (m.focus !== undefined && (!Array.isArray(m.focus) || m.focus.length !== 2 || m.focus.some((v) => !NUM(v) || v < 0 || v > 1))) fail(`${where}: focus — [x, y], доли 0–1`);
  if (m.zoom !== undefined && (!Array.isArray(m.zoom) || m.zoom.length !== 2 || m.zoom.some((v) => !NUM(v) || v < 1 || v > 2))) fail(`${where}: zoom — [от, до], 1–2`);
  if (m.treatment !== undefined && !TREATMENTS.includes(m.treatment as string)) fail(`${where}: treatment — ${TREATMENTS.join(", ")}`);
  return { video };
}

/** Stage and devices of a v2 beat: fields, files, licenses, words, targets, dominant. */
export function checkStageBeat(beat: BeatSpec, style: StyleDef, videoDir: string): void {
  const where = `${beat.id}: stage`;
  const st = beat.stage;
  if (!isObj(st)) return fail(`${where}: {type: media | split | map | color, …}`);
  if (!STAGE_TYPES.includes(st.type as string)) fail(`${where}: type — одно из ${STAGE_TYPES.join(", ")} (ровно один stage на бит)`);
  const type = st.type as string;
  for (const key of Object.keys(st)) if (!(STAGE_KEYS[type] as string[]).includes(key)) fail(`${where} (${type}): неизвестное поле ${key}; есть: ${(STAGE_KEYS[type] as string[]).join(", ")}`);
  const spoken = spokenOf(beat);
  const regions = (st.regions ?? {}) as Record<string, unknown>;
  if (!isObj(regions)) fail(`${where}: regions — {имя: {x, y, w, h}}`);
  for (const [name, box] of Object.entries(regions)) pctBox(box, `${where}: regions.${name}`);
  if (type === "media") checkMedia(st, where, videoDir, spoken);
  if (type === "split") {
    checkMedia(st.a, `${where}: a`, videoDir, spoken);
    checkMedia(st.b, `${where}: b`, videoDir, spoken);
    if (st.at !== undefined) checkAt(st.at, spoken, `${where}: at`);
    if (st.dur !== undefined && (!NUM(st.dur) || st.dur <= 0)) fail(`${where}: dur > 0`);
    if (st.direction !== undefined && !["left", "right", "up", "down"].includes(st.direction as string)) fail(`${where}: direction — left, right, up, down`);
    if (st.labels !== undefined && (!Array.isArray(st.labels) || st.labels.length !== 2 || st.labels.some((l) => typeof l !== "string" || l.length > 16))) fail(`${where}: labels — две строки ≤ 16`);
  }
  if (type === "map") {
    if (typeof st.map !== "string") fail(`${where}: map — имя силуэта engine/assets/maps/<имя>.svg`);
    loadMap(st.map as string, where);
    for (const [i, mk] of ((st.markers ?? []) as unknown[]).entries()) {
      pctPoint(mk, `${where}: markers[${i}]`);
      const m = mk as Record<string, unknown>;
      if (m.at !== undefined) checkAt(m.at, spoken, `${where}: markers[${i}].at`);
      if (m.label !== undefined && (typeof m.label !== "string" || m.label.length > 20)) fail(`${where}: markers[${i}].label — строка ≤ 20`);
    }
    if (st.route !== undefined) {
      const r = st.route as Record<string, unknown>;
      if (!isObj(r) || !Array.isArray(r.points) || r.points.length < 2) fail(`${where}: route — {points: [{x, y}, …], at, dur, traveler}`);
      (r.points as unknown[]).forEach((p, i) => pctPoint(p, `${where}: route.points[${i}]`));
      if (r.at !== undefined) checkAt(r.at, spoken, `${where}: route.at`);
    }
    if (st.reveal !== undefined) checkAt(st.reveal, spoken, `${where}: reveal`);
  }
  if (type === "color" && st.color !== undefined && !toneColors(style, beat.tone ?? "accent")[st.color as string]) fail(`${where}: color — токен палитры (night, ground, plane, heroDeep …)`);
  if (st.source !== undefined && !/^https?:\/\//.test(String(st.source))) fail(`${where}: source — ссылка http(s)`);

  const devices = beat.devices ?? [];
  if (!Array.isArray(devices)) fail(`${beat.id}: devices — список`);
  devices.forEach((dev, i) => {
    const def = checkDeviceSpec(dev, i, beat.id, regions, spoken, style);
    if (def.type === "edit.hold" && type !== "media") fail(`${beat.id}: devices[${i}] edit.hold — только на stage media`);
  });
  if (beat.dominant === undefined) fail(`${beat.id}: dominant обязателен — "stage" или индекс устройства, которое главное в кадре`);
  if (beat.dominant !== "stage" && !(Number.isInteger(beat.dominant) && (beat.dominant as number) >= 0 && (beat.dominant as number) < devices.length)) fail(`${beat.id}: dominant — "stage" или индекс 0–${devices.length - 1}`);
  if (isObj(beat.camera) && beat.camera.reason !== undefined && !CAMERA_REASONS.includes(beat.camera.reason as string)) fail(`${beat.id}: camera.reason — ${CAMERA_REASONS.join(", ")}`);
}

/** Videos on screen at once in a v2 beat: the stage's videos (+1 for the sharp copy of a blur spotlight). */
export function stageVideoCount(beat: BeatSpec, videoDir: string): number {
  const st = beat.stage as Record<string, unknown> | undefined;
  if (!st) return 0;
  const isVideo = (m: unknown): number => (isObj(m) && typeof m.src === "string" && VIDEO_RE.test(mediaPath(m.src, videoDir)) ? 1 : 0);
  let n = st.type === "media" ? isVideo(st) : st.type === "split" ? isVideo(st.a) + isVideo(st.b) : 0;
  if (st.type === "media" && n && (beat.devices ?? []).some((d) => d.type === "focus.spotlight" && d.params?.mode === "blur")) n += 1;
  return n;
}

/** Sources of the digits in v2 beats (devices with figures need `source`) plus the scene beats of contract.ts. */
export function allMissingSources(spec: VideoSpec): string[] {
  const missing = missingSources(spec);
  const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
  for (const beat of spec.beats) {
    if (beat.scene !== undefined) continue;
    const covered: number[] = [];
    for (const [i, dev] of (beat.devices ?? []).entries()) {
      const figs = deviceFigures(dev);
      if (!figs.length) continue;
      if (dev.source) {
        for (const f of figs) for (const m of f.matchAll(NUMBER_RE)) covered.push(Number(m[0].replace(/,/g, "")));
      } else missing.push(`${beat.id}: devices[${i}] (${dev.type}) ${figs.join("; ")} — нет source`);
    }
    const has = typeof beat.sources?.text === "string" && /^https?:\/\//.test(beat.sources.text);
    if (!has) {
      const shown = parseBeatText(beat.text).tokens.map((t) => t.display).join(" ");
      const loose = [...shown.matchAll(NUMBER_RE)].map((m) => Number(m[0].replace(/,/g, ""))).filter((n) => !covered.includes(n));
      if (loose.length) missing.push(`${beat.id}: цифры реплики ${loose.join(", ")} — нет sources.text`);
    }
  }
  return missing;
}

// ── media at build time ──────────────────────────────────────────────────────────────────────────

interface MediaCfg {
  key: string;
  crop: Box | null;
  pan: { to: Box; at: number; dur: number } | null;
  zoom: [number, number];
  focus: [number, number];
  holds: { at: number; dur: number }[];
  weave: boolean;
}

interface MediaBuild {
  cfg: MediaCfg;
  html: (copy: string) => string;
  videos: number;
}

interface Ctx {
  beat: BeatSpec;
  style: StyleDef;
  videoDir: string;
  dir: string;
  clock: Clock;
  fps: number;
  prefix: string;
  track: { n: number };
}

function py(args: string[]): Record<string, unknown> {
  const r = run(python(), [pyScript("media_stage.py"), ...args]);
  return lastJsonLine<Record<string, unknown>>(r.stdout);
}

interface Seg {
  kind: "video" | "still";
  start: number;
  dur: number;
  src: number;
}

/** Timeline of a video stage: video clips from the source cursor, stop-frames at the holds, a still tail when the source runs out. */
export function videoSegments(total: number, srcDur: number, rate: number, holds: { at: number; dur: number }[]): Seg[] {
  const segs: Seg[] = [];
  let t = 0;
  let s = 0;
  const lastFrame = Math.max(0, srcDur - 0.04);
  const play = (until: number): void => {
    const dur = Math.min(until - t, Math.max(0, (srcDur - s) / rate));
    if (dur > 0.02) {
      segs.push({ kind: "video", start: r3(t), dur: r3(dur), src: r3(s) });
      s += dur * rate;
      t += dur;
    }
    if (until - t > 0.01) {
      segs.push({ kind: "still", start: r3(t), dur: r3(until - t), src: r3(Math.min(s, lastFrame)) });
      t = until;
    }
  };
  for (const h of holds) {
    if (h.at < t) continue;
    play(h.at);
    const end = Math.min(total, h.at + h.dur);
    segs.push({ kind: "still", start: r3(t), dur: r3(end - t), src: r3(Math.min(s, lastFrame)) });
    t = end;
  }
  if (t < total) play(total);
  return segs.filter((g) => g.dur > 0.005);
}

function prepareMedia(m: Record<string, unknown>, key: string, ctx: Ctx, extraHolds: { at?: number | string; until?: number | string; dur?: number }[]): MediaBuild {
  const { beat, style, clock } = ctx;
  const where = `${beat.id}: stage ${key}`;
  const file = mediaPath(m.src as string, ctx.videoDir);
  const video = VIDEO_RE.test(file);
  const colors = toneColors(style, beat.tone ?? "accent");
  const inks = [colors.night, colors.hero, colors.heroDeep, colors.text] as string[];
  const treatment = (m.treatment as string | undefined) ?? "none";
  const D = clock.duration;
  const cacheDir = ensureDir(join(ctx.videoDir, ".cache", "stage"));
  const mediaDir = ensureDir(join(ctx.dir, "assets", "media"));
  const holds = [...((m.hold as { at: number | string; until?: number | string; dur?: number }[] | undefined) ?? []), ...extraHolds]
    .map((h, i) => {
      const at = atSeconds(h.at, clock, 0, `${where}: hold[${i}].at`);
      const end = h.until !== undefined ? atSeconds(h.until, clock, D, `${where}: hold[${i}].until`) : Math.min(D, at + (h.dur ?? 1.5));
      return { at, dur: r3(end - at) };
    })
    .filter((h) => h.dur > 0.05)
    .sort((a, b) => a.at - b.at);
  const fit = (m.fit as string | undefined) ?? "cover";
  const focus = (m.focus as [number, number] | undefined) ?? [0.5, 0.5];
  const place = `position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; object-fit: ${fit}; object-position: ${(focus[0] * 100).toFixed(1)}% ${(focus[1] * 100).toFixed(1)}%`;
  const pan = isObj(m.pan) ? { to: boxPx(pctBox(m.pan.to, `${where}: pan.to`)), at: atSeconds(m.pan.at as number | string | undefined, clock, 0, `${where}: pan.at`), dur: 0 } : null;
  if (pan) pan.dur = r3(NUM((m.pan as Record<string, unknown>).dur) ? ((m.pan as Record<string, unknown>).dur as number) : Math.max(0.3, D - pan.at));
  const cfg: MediaCfg = {
    key,
    crop: m.crop !== undefined ? boxPx(pctBox(m.crop, `${where}: crop`)) : null,
    pan,
    zoom: (m.zoom as [number, number] | undefined) ?? [1, 1],
    focus,
    holds,
    weave: treatment === "film-memory",
  };
  const copyTo = (src: string, name: string): string => {
    copyFileSync(src, join(mediaDir, name));
    return `assets/media/${name}`;
  };
  const clips: { tag: "img" | "video"; src: string; start: number; dur: number; mediaStart?: number; rate?: number }[] = [];
  let backdrop: string | null = null;
  let videos = 0;
  if (!video) {
    const k = sha({ v: 1, f: fileSha(file), treatment, inks });
    const out = join(cacheDir, `${k}.jpg`);
    if (!existsSync(out)) py(["image", file, out, "--treatment", treatment, "--inks", ...inks]);
    const src = copyTo(out, `st-${beat.id}-${key}-${k.slice(0, 8)}.jpg`);
    clips.push({ tag: "img", src, start: 0, dur: D });
    if (fit === "contain") {
      const bd = join(cacheDir, `${k}-backdrop.jpg`);
      if (!existsSync(bd)) py(["backdrop", out, bd]);
      backdrop = copyTo(bd, `st-${beat.id}-${key}-${k.slice(0, 8)}-bd.jpg`);
    }
  } else {
    const info = py(["probe", file]) as { duration: number };
    const tIn = (m.in as number | undefined) ?? 0;
    const tOut = Math.min((m.out as number | undefined) ?? info.duration, info.duration);
    if (tIn >= tOut - 0.05) fail(`${where}: in ${tIn} с за концом исходника (${info.duration} с)`);
    const rate = (m.rate as number | undefined) ?? 1;
    const k = sha({ v: 1, f: fileSha(file), tIn, tOut, reverse: m.reverse === true, treatment, inks, fps: ctx.fps });
    const baked = join(cacheDir, `${k}.mp4`);
    if (!existsSync(baked)) {
      const args = ["video", file, baked, "--in", String(tIn), "--out", String(tOut), "--treatment", treatment, "--inks", ...inks, "--fps", String(ctx.fps)];
      if (m.reverse === true) args.push("--reverse");
      py(args);
      log.info(`${beat.id}: видео ${basename(file)} ${tIn}–${tOut} с${m.reverse ? " задом наперёд" : ""}${treatment !== "none" ? ` · ${treatment}` : ""} → кэш`);
    }
    const bakedDur = (py(["probe", baked]) as { duration: number }).duration;
    const src = copyTo(baked, `st-${beat.id}-${key}-${k.slice(0, 8)}.mp4`);
    const segs = videoSegments(D, bakedDur, rate, holds);
    for (const seg of segs) {
      if (seg.kind === "video") {
        clips.push({ tag: "video", src, start: seg.start, dur: seg.dur, mediaStart: seg.src, rate });
        videos = 1;
      } else {
        const fk = sha({ k, t: seg.src });
        const still = join(cacheDir, `${fk}.jpg`);
        if (!existsSync(still)) py(["frame", baked, still, "--t", String(seg.src)]);
        clips.push({ tag: "img", src: copyTo(still, `st-${beat.id}-${key}-${fk.slice(0, 8)}.jpg`), start: seg.start, dur: seg.dur });
      }
    }
    if (fit === "contain") {
      const first = clips.find((c) => c.tag === "img")?.src;
      const still = first ? join(ctx.dir, first) : join(cacheDir, `${sha({ k, t: 0 })}.jpg`);
      if (!first && !existsSync(still)) py(["frame", baked, still, "--t", "0"]);
      const bd = join(cacheDir, `${k}-backdrop.jpg`);
      if (!existsSync(bd)) py(["backdrop", still, bd]);
      backdrop = copyTo(bd, `st-${beat.id}-${key}-${k.slice(0, 8)}-bd.jpg`);
    }
  }
  const P = ctx.prefix;
  const html = (copy: string): string => {
    const id = `${P}-${key}${copy}`;
    const tr = (): number => ctx.track.n++;
    const parts: string[] = [];
    if (backdrop) parts.push(`<img id="${id}-bd" class="clip" src="${backdrop}" alt="" data-start="0" data-duration="${D}" data-track-index="${tr()}" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; object-fit: cover" />`);
    clips.forEach((c, i) => {
      const timing = `data-start="${c.start}" data-duration="${c.dur}" data-track-index="${tr()}"`;
      if (c.tag === "img") parts.push(`<img id="${id}-c${i}" class="clip" src="${c.src}" alt="" ${timing} style="${place}" />`);
      else parts.push(`<video id="${id}-c${i}" class="clip" src="${c.src}" ${timing} data-media-start="${c.mediaStart}"${c.rate !== 1 ? ` data-playback-rate="${c.rate}"` : ""} muted playsinline style="${place}"></video>`);
    });
    return `<div id="${id}-zoom" data-hy-zoom="${P}-${key}" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px"><div id="${id}-inner" data-hy-inner="${P}-${key}" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px">${parts.join("")}</div></div>`;
  };
  return { cfg, html, videos };
}

function catmull(points: { x: number; y: number }[]): string {
  if (points.length === 2) return `M${points[0]?.x} ${points[0]?.y} L${points[1]?.x} ${points[1]?.y}`;
  let d = `M${(points[0] as { x: number }).x} ${(points[0] as { y: number }).y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)] as { x: number; y: number };
    const p1 = points[i] as { x: number; y: number };
    const p2 = points[i + 1] as { x: number; y: number };
    const p3 = points[Math.min(points.length - 1, i + 2)] as { x: number; y: number };
    d += ` C${r3(p1.x + (p2.x - p0.x) / 6)} ${r3(p1.y + (p2.y - p0.y) / 6)} ${r3(p2.x - (p3.x - p1.x) / 6)} ${r3(p2.y - (p3.y - p1.y) / 6)} ${p2.x} ${p2.y}`;
  }
  return d;
}

// ── the frame ────────────────────────────────────────────────────────────────────────────────────

export interface StageFrameInput {
  beat: BeatSpec;
  style: StyleDef;
  videoDir: string;
  /** Project folder (build/ or .preview/…): compositions/frames/<id>.html and assets/media go here. */
  dir: string;
  compositionId: string;
  clock: Clock;
  fps: number;
  seed: number;
}

export interface StageFrame {
  src: string;
  events: { t: number; label: string }[];
  settle: number;
  devices: ResolvedDevice[];
  videos: number;
  /** A playing video is on screen at settle (no hold covers it): a snapshot cannot match the render frame-exactly. */
  videoAtSettle: boolean;
}

export function clockOf(timing: BeatTiming, words: BeatWords): Clock {
  return { duration: timing.duration, speechStart: timing.speechStart, speechEnd: timing.speechEnd, spoken: words.spoken.map((w) => w.word), word: (ref: string) => wordTime(words, ref) };
}

export function writeStageFrame(input: StageFrameInput): StageFrame {
  const { beat, style, clock } = input;
  const cid = input.compositionId;
  const prefix = /^[0-9]/.test(cid) ? `f${cid}` : `f-${cid}`;
  const st = beat.stage as Record<string, unknown>;
  const D = clock.duration;
  const colors = toneColors(style, beat.tone ?? "accent");
  const rgbOf = (hex: string): string => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");
  const regions = (st.regions ?? {}) as Record<string, unknown>;
  const devices = resolveDevices(beat.devices ?? [], beat.dominant, regions, clock, style, beat.id);
  const ctx: Ctx = { beat, style, videoDir: input.videoDir, dir: input.dir, clock, fps: input.fps, prefix, track: { n: 1 } };
  const events: { t: number; label: string }[] = deviceEvents(devices);
  let stageHtml = "";
  let sharpHtml = "";
  let videos = 0;
  const stageCfg: Record<string, unknown> = { type: st.type };
  const holdDevices = (beat.devices ?? []).map((d, i) => ({ d, r: devices[i] as ResolvedDevice })).filter(({ d }) => d.type === "edit.hold").map(({ r }) => ({ at: r.at, until: r.until ?? undefined }));
  const flash = `<div id="${prefix}-flash" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; background-color: ${colors.text}; opacity: 0; pointer-events: none"></div>`;
  const tone = (key: string): string =>
    // a neutral grey in saturation blend removes colour; a palette grey is tinted by the look and adds it (TRAPS.md)
    `<div id="${prefix}-${key}-tone" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; background-color: gray; mix-blend-mode: saturation; opacity: 0; pointer-events: none"></div>` +
    `<div id="${prefix}-${key}-breath" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; background-color: ${colors.night}; opacity: 0; pointer-events: none"></div>`;

  if (st.type === "media") {
    const m = prepareMedia(st, "m", ctx, holdDevices.map((h) => ({ at: h.at, until: h.until })));
    stageHtml = m.html("") + tone("m") + (m.cfg.holds.length ? flash : "");
    videos = m.videos;
    stageCfg.media = m.cfg;
    for (const h of m.cfg.holds) events.push({ t: h.at, label: "stage: hold" });
    if ((beat.devices ?? []).some((d) => d.type === "focus.spotlight" && d.params?.mode === "blur")) {
      if (videos && videos + 1 > 2) log.warn(`${beat.id}: spotlight blur на видео даёт второе видео`);
      sharpHtml = `<div id="${prefix}-sharp" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; overflow: hidden; z-index: ${LAYER_Z.focus}; pointer-events: none">${m.html("s")}</div>`;
      videos += m.videos;
    }
  } else if (st.type === "split") {
    const a = prepareMedia(st.a as Record<string, unknown>, "a", ctx, []);
    const b = prepareMedia(st.b as Record<string, unknown>, "b", ctx, []);
    const dir = (st.direction as string | undefined) ?? "left";
    const at = atSeconds(st.at as number | string | undefined, clock, clock.speechStart + (clock.speechEnd - clock.speechStart) * 0.45, `${beat.id}: stage.at`);
    const dur = r3(Math.min((st.dur as number | undefined) ?? 1.1, Math.max(0.2, D - at - 0.1)));
    const horiz = dir === "left" || dir === "right";
    const divider = horiz
      ? `<div id="${prefix}-divider" style="position: absolute; left: -3px; top: 0px; width: 6px; height: 1920px; background-color: ${colors.text}; box-shadow: 0 0 24px rgba(${rgbOf(colors.hero as string)},0.8); opacity: 0"></div>`
      : `<div id="${prefix}-divider" style="position: absolute; left: 0px; top: -3px; width: 1080px; height: 6px; background-color: ${colors.text}; box-shadow: 0 0 24px rgba(${rgbOf(colors.hero as string)},0.8); opacity: 0"></div>`;
    const labels = (st.labels as string[] | undefined) ?? [];
    const lab = (id: string, text: string, right: boolean): string =>
      `<div id="${prefix}-${id}" style="position: absolute; top: 170px; ${right ? "right: 72px; text-align: right" : "left: 72px"}; padding: 10px 18px; border-radius: 6px; background-color: rgba(${rgbOf(colors.night as string)},0.78); font-family: ${fontStack(style.fonts.body as never).replace(/"/g, "'")}; font-weight: 800; font-size: ${style.sizes.label}px; letter-spacing: 0.18em; color: ${colors.text}; opacity: 0">${text.replace(/</g, "&lt;")}</div>`;
    stageHtml =
      `<div id="${prefix}-a-wrap" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px">${a.html("")}${tone("a")}</div>` +
      `<div id="${prefix}-b-wrap" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px">${b.html("")}${tone("b")}</div>` +
      divider +
      (labels[0] ? lab("label-a", labels[0], false) : "") +
      (labels[1] ? lab("label-b", labels[1], true) : "");
    videos = a.videos + b.videos;
    stageCfg.a = a.cfg;
    stageCfg.b = b.cfg;
    stageCfg.split = { at, dur, direction: dir };
    events.push({ t: r3(at + dur * 0.6), label: "stage: wipe" });
  } else if (st.type === "map") {
    const map = loadMap(st.map as string, `${beat.id}: stage.map`);
    const reveal = st.reveal !== undefined ? atSeconds(st.reveal as number | string, clock, 0, `${beat.id}: stage.reveal`) : null;
    const markers = ((st.markers ?? []) as Record<string, unknown>[]).map((mk, i) => ({ ...pointPx(mk as never), label: (mk.label as string | undefined) ?? "", at: atSeconds(mk.at as number | string | undefined, clock, (reveal ?? 0) + 0.4 + i * 0.3, `${beat.id}: markers[${i}].at`) }));
    let routeHtml = "";
    let route: Record<string, unknown> | null = null;
    if (isObj(st.route)) {
      const r = st.route;
      const pts = (r.points as Record<string, unknown>[]).map((p) => pointPx(p as never));
      const d = catmull(pts);
      const at = atSeconds(r.at as number | string | undefined, clock, clock.speechStart, `${beat.id}: route.at`);
      route = { at, dur: r3(Math.min((r.dur as number | undefined) ?? 1.6, Math.max(0.3, D - at - 0.1))) };
      routeHtml = `<path id="${prefix}-route" d="${d}" fill="none" stroke="${colors.hero}" stroke-width="7" stroke-linecap="round" />`;
      if (r.traveler !== false) routeHtml += `</svg><div id="${prefix}-traveler" style="position: absolute; left: 0px; top: 0px; width: 26px; height: 26px; border-radius: 50%; background-color: ${colors.heroLight}; box-shadow: 0 0 20px rgba(${rgbOf(colors.hero as string)},0.95); offset-path: path('${d}'); offset-rotate: 0deg; opacity: 0"></div><svg style="display: none">`;
      events.push({ t: r3(at + (route.dur as number) * 0.8), label: "stage: route" });
    }
    stageHtml =
      `<div style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; background-color: ${colors.ashDeep}"></div>` +
      `<svg id="${prefix}-map" width="1080" height="1920" viewBox="0 0 1080 1920" style="position: absolute; left: 0px; top: 0px"><path id="${prefix}-water" d="${map.water}" fill="${colors.night}" fill-rule="${map.fillRule}" /><path id="${prefix}-coast" d="${map.coast}" fill="none" stroke="${colors.ashLight}" stroke-width="2.5" stroke-linejoin="round" />${routeHtml}</svg>`;
    stageCfg.map = { reveal, draw: st.draw === true, markers, route };
    if (reveal !== null) events.push({ t: r3(reveal + 0.5), label: "stage: reveal" });
    for (const mk of markers) events.push({ t: r3(mk.at + 0.3), label: "stage: marker" });
  } else {
    const ground = colors[(st.color as string | undefined) ?? "night"] as string;
    stageHtml = `<div id="${prefix}-color" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; background-color: ${ground}"></div>`;
    if (st.glow !== false) stageHtml += `<div id="${prefix}-glow" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; background: radial-gradient(ellipse 72% 42% at 50% 36%, rgba(${rgbOf(colors.hero as string)},0.2) 0%, rgba(${rgbOf(colors.hero as string)},0) 72%)"></div>`;
  }

  const layerOf = Object.fromEntries((beat.devices ?? []).map((d) => [d.type, loadDevice(d.type).layer]));
  const cfg = {
    prefix,
    duration: D,
    seed: input.seed,
    colors: { hex: colors, rgb: Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, rgbOf(v)])) },
    fonts: { display: fontStack(style.fonts.display as never), body: fontStack(style.fonts.body as never) },
    sizes: style.sizes,
    layerOf,
    stage: stageCfg,
    devices,
  };
  const layers = ["focus", "data", "annotate", "text"]
    .map((name) => `  <div id="${prefix}-L-${name}" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; overflow: hidden; z-index: ${LAYER_Z[name]}; pointer-events: none"></div>`)
    .join("\n");
  const html = `<!-- hygen stage beat ${beat.id} (engine/src/stage.ts): ${String(st.type)} + ${devices.map((d) => d.type).join(", ") || "без устройств"} — generated on every build, do not edit -->
<template id="${prefix}-template">
<script src="assets/vendor/gsap.min.js"></script>
<script src="assets/hygen/devices.js"></script>
<style>
${fontFaces(style)}
#root { position: relative; width: 1080px; height: 1920px; overflow: hidden; }
</style>
<div id="root" data-composition-id="${cid}" data-start="0" data-duration="${D}" data-width="1080" data-height="1920">
  <div id="${prefix}-ground" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; background-color: ${colors.night}"></div>
  <div id="${prefix}-stage" style="position: absolute; left: 0px; top: 0px; width: 1080px; height: 1920px; overflow: hidden; z-index: ${LAYER_Z.stage}">${stageHtml}</div>
  ${sharpHtml}
${layers}
</div>
<script>
(function () {
  var CFG = ${JSON.stringify(cfg).replace(/<\//g, "<\\/")};
  var tl = gsap.timeline({ paused: true });
  HygenStage.mount(tl, CFG);
  HygenDevices.mount(tl, CFG);
  window.__timelines = window.__timelines || {};
  window.__timelines["${cid}"] = tl;
})();
</script>
</template>
`;
  const src = `compositions/frames/${cid}.html`;
  ensureDir(join(input.dir, "compositions", "frames"));
  writeFileSync(join(input.dir, src), html);
  const inside = events.filter((e) => e.t < D - 0.15).sort((a, b) => a.t - b.t);
  const last = inside.length ? (inside[inside.length - 1] as { t: number }).t : 0;
  const settle = r3(Math.max(0.3, Math.min(D - 0.25, Math.max(last + 0.9, clock.speechEnd - 0.2))));
  const holdSpans = (stageCfg.media as { holds?: { at: number; dur: number }[] } | undefined)?.holds ?? [];
  const videoAtSettle = videos > 0 && !holdSpans.some((h) => settle >= h.at - 0.05 && settle <= h.at + h.dur + 0.05);
  return { src, events: inside, settle, devices, videos, videoAtSettle };
}

/** A v2 beat of a video → its frame and the SceneBuild the rest of the build expects (identity warp, times in seconds). */
export function writeStageBeat(input: StageFrameInput): SceneBuild {
  const frame = writeStageFrame(input);
  const D = input.clock.duration;
  log.info(`${input.beat.id}: stage ${String((input.beat.stage as Record<string, unknown>).type)} · ${D.toFixed(3)} с · ${frame.devices.map((d) => `${d.type}@${d.at}`).join(", ") || "без устройств"}${frame.videos ? ` · видео ${frame.videos}` : ""}`);
  return {
    beatId: input.beat.id,
    src: frame.src,
    warp: { ref: [0, D], act: [0, D], notes: [] },
    scene: null,
    params: {},
    settle: frame.settle,
    video: frame.videoAtSettle,
    events: frame.events.map((e) => ({ ref: e.t, label: e.label })),
    injected: false,
  };
}

export const mediaExt = (f: string): string => extname(f).toLowerCase();
