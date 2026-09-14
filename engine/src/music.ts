import { copyFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { StyleDef } from "./contract.ts";
import { checkLicense } from "./contract.ts";
import type { VideoSpec } from "./spec.ts";
import type { BeatTiming } from "./timeline.ts";
import { resolveTime } from "./timeline.ts";
import type { VoiceLine } from "./voice.ts";
import type { BeatWords } from "./words.ts";
import { ENGINE_DIR, ROOT_DIR, ensureDir, fail, fileSha, lastJsonLine, log, pyScript, python, r3, run, sha, writeJson } from "./lib/util.ts";

/** video.json → music: false, or a track of the style (id) or of the video (media/…wav) with dB volume, ducking, fades and in/out. */
export interface MusicSpec {
  track?: string;
  volume?: number;
  duck?: number;
  fadeIn?: number;
  fadeOut?: number;
  in?: string;
  out?: string;
}

export interface MusicTokens {
  tracks: string[];
  volume: number;
  duck: number;
  fadeIn: number;
  fadeOut: number;
}

export interface MusicPlan {
  track: string;
  /** Repo-relative path of the licensed track (publish credits). */
  file: string;
  volume: number;
  duck: number;
  start: number;
  end: number;
}

/**
 * Music bed (engine/assets/music/MUSIC.md): the style's track or the video's own, looped to length, faded,
 * ducked under the voice by `duck` dB — baked by py/music_bed.py into build/assets/music/bed.wav.
 */
export function makeMusic(spec: VideoSpec, style: StyleDef, videoDir: string, buildDir: string, voices: VoiceLine[], timings: BeatTiming[], words: BeatWords[]): MusicPlan | null {
  const own = (spec as unknown as { music?: MusicSpec | false }).music;
  const tok = (style as unknown as { music?: Partial<MusicTokens> }).music;
  if (own === false || (!own?.track && !tok?.tracks?.length)) return null;
  const track = own?.track ?? (tok?.tracks?.[0] as string);
  const file = /[/.]/.test(track) ? join(videoDir, track) : join(ENGINE_DIR, "assets", "music", `${track}.wav`);
  if (!existsSync(file)) fail(`музыка: нет файла ${relative(ROOT_DIR, file)}`);
  checkLicense(file, "музыка");
  const last = timings[timings.length - 1] as BeatTiming;
  const at = (ref: string | undefined, fallback: number): number => (ref === undefined || ref === "start" ? (ref === "start" ? 0 : fallback) : ref === "end" ? last.end : resolveTime(ref, timings, words));
  const plan: MusicPlan = { track, file: relative(ROOT_DIR, file), volume: own?.volume ?? tok?.volume ?? -4, duck: own?.duck ?? tok?.duck ?? -12, start: r3(at(own?.in, 0)), end: r3(at(own?.out, last.end)) };
  const fadeIn = own?.fadeIn ?? tok?.fadeIn ?? 1.5;
  const fadeOut = own?.fadeOut ?? tok?.fadeOut ?? 2;
  const speech = timings.map((t, i) => [r3(t.start + (voices[i] as VoiceLine).speechStart), r3(t.start + (voices[i] as VoiceLine).speechEnd)]);
  const key = sha({ v: 1, fileHash: fileSha(file), total: last.end, speech, ...plan, fadeIn, fadeOut });
  const cacheDir = ensureDir(join(videoDir, ".cache", "music", key));
  const bed = join(cacheDir, "bed.wav");
  if (!existsSync(bed)) {
    writeJson(join(cacheDir, "speech.json"), speech);
    const args = [pyScript("music_bed.py"), "--track", file, "--out", bed, "--duration", String(last.end), "--speech", join(cacheDir, "speech.json"), "--gain", String(plan.volume), "--duck", String(plan.duck), "--fade-in", String(fadeIn), "--fade-out", String(fadeOut), "--start", String(plan.start), "--end", String(plan.end)];
    const r = lastJsonLine<{ track_lufs: number; loops: number }>(run(python(), args).stdout);
    log.info(`музыка ${track}: трек ${r.track_lufs} LUFS → подложка ${plan.start}–${plan.end} с, петель ${r.loops}, ${plan.volume} дБ, под голосом ${plan.duck} дБ`);
  } else log.info(`музыка ${track}: подложка из кэша (${key})`);
  copyFileSync(bed, join(ensureDir(join(buildDir, "assets", "music")), "bed.wav"));
  writeJson(join(buildDir, "music.json"), { ...plan, fadeIn, fadeOut });
  return plan;
}
