import { copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { VideoSpec } from "./spec.ts";
import { parseBeatText } from "./spec.ts";
import { ensureDir, hyperframesBin, lastJsonLine, log, pool, pyScript, python, readJson, runAsync, sha, writeJson } from "./lib/util.ts";

export interface VoiceLine {
  beatId: string;
  index: number;
  /** Project-relative path inside the build (what index.html references). */
  rel: string;
  abs: string;
  duration: number;
  speechStart: number;
  speechEnd: number;
  lufs: number;
  truePeak: number;
  tts: string;
  cached: boolean;
}

interface LineMeta {
  duration_s: number;
  speech_start_s: number;
  speech_end_s: number;
  lufs: number;
  true_peak_dbtp: number;
}

/**
 * Draft voice: Kokoro through `hyperframes tts`, then loudness and pads (py/voice_line.py).
 * Takes are cached by text + voice + pads, so a rebuild never re-synthesizes an unchanged line.
 */
export async function makeVoices(spec: VideoSpec, videoDir: string, buildDir: string): Promise<VoiceLine[]> {
  const bin = hyperframesBin();
  const outDir = ensureDir(join(buildDir, "assets", "voice"));
  const line1 = async (beat: VideoSpec["beats"][number], i: number): Promise<VoiceLine> => {
    const { tts } = parseBeatText(beat.text);
    const key = sha({ v: 1, ...spec.voice, tts, pad: beat.pad, fps: spec.fps });
    const cacheDir = ensureDir(join(videoDir, ".cache", "voice", `${beat.id}-${key}`));
    const raw = join(cacheDir, "raw.wav");
    const line = join(cacheDir, "line.wav");
    const metaPath = join(cacheDir, "line.json");
    const cached = existsSync(line) && existsSync(metaPath);
    if (!cached) {
      if (!existsSync(raw)) {
        await runAsync(bin, ["tts", tts, "--voice", spec.voice.voice, "--speed", String(spec.voice.speed), "--output", raw, "--json"], { cwd: cacheDir });
      }
      const r = await runAsync(python(), [pyScript("voice_line.py"), raw, line, "--lead", String(beat.pad[0]), "--tail", String(beat.pad[1]), "--fps", String(spec.fps)]);
      writeJson(metaPath, lastJsonLine<LineMeta>(r.stdout));
    }
    const meta = readJson<LineMeta>(metaPath);
    const nn = String(i + 1).padStart(2, "0");
    const rel = `assets/voice/${nn}.wav`;
    copyFileSync(line, join(outDir, `${nn}.wav`));
    log.info(
      `${beat.id}: ${meta.duration_s.toFixed(3)} с, речь ${meta.speech_start_s.toFixed(2)}–${meta.speech_end_s.toFixed(2)} · ` +
        `${meta.lufs} LUFS · TP ${meta.true_peak_dbtp} dBTP${cached ? " · из кэша" : ""}`,
    );
    return {
      beatId: beat.id,
      index: i,
      rel,
      abs: join(buildDir, rel),
      duration: meta.duration_s,
      speechStart: meta.speech_start_s,
      speechEnd: meta.speech_end_s,
      lufs: meta.lufs,
      truePeak: meta.true_peak_dbtp,
      tts,
      cached,
    };
  };
  // Cold machine: the model downloads inside `hyperframes tts`, so three parallel calls would
  // fetch the same 330 МБ three times. The first line goes alone and warms the cache (TRAPS.md).
  const cold = !existsSync(join(homedir(), ".cache", "hyperframes", "tts", "models", "kokoro-v1.0.onnx"));
  const first = spec.beats[0];
  if (!cold || !first) return pool(spec.beats, 3, line1);
  log.info("модели Kokoro нет в кэше — первая строка синтезируется отдельно, чтобы скачать её один раз");
  const head = await line1(first, 0);
  const tail = await pool(spec.beats.slice(1), 3, (beat, i) => line1(beat, i + 1));
  return [head, ...tail];
}
