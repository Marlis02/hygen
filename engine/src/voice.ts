import { appendFileSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { VideoSpec } from "./spec.ts";
import { parseBeatText } from "./spec.ts";
import { ROOT_DIR, ensureDir, fail, hyperframesBin, lastJsonLine, loadEnv, log, pool, pyScript, python, r3, readJson, runAsync, sha, writeJson } from "./lib/util.ts";

export type VoiceProvider = "kokoro" | "elevenlabs";

/** The voice of a build and where the choice came from: `--voice` > video.json `voice` > `.env` > kokoro. */
export interface VoiceChoice {
  provider: VoiceProvider;
  voiceId: string;
  model: string;
  speed: number;
  from: "--voice" | "video.json" | ".env" | "по умолчанию";
}

/** A word of the take with its time; for a provider with timestamps — already in clip time. */
export interface AlignedWord {
  text: string;
  start: number;
  end: number;
}

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
  provider: VoiceProvider;
  /** Word times from the provider (ElevenLabs with-timestamps); Kokoro lines have none and go through whisper. */
  alignment?: AlignedWord[];
}

export interface VoiceResult {
  lines: VoiceLine[];
  choice: VoiceChoice;
  /** ElevenLabs characters sent in this build (cached takes cost nothing). */
  chars: number;
}

interface LineMeta {
  duration_s: number;
  speech_start_s: number;
  speech_end_s: number;
  lufs: number;
  true_peak_dbtp: number;
  trim_start_s?: number;
}

export const ELEVEN_DEFAULT_MODEL = "eleven_multilingual_v2";
const KOKORO_DEFAULT_VOICE = "am_michael";
const ELEVEN_DIR = join(ROOT_DIR, ".cache", "voice", "elevenlabs");

export function resolveVoice(spec: VideoSpec, cli?: string): VoiceChoice {
  const env = loadEnv();
  const v = spec.voice ?? {};
  const own = v.provider ?? v.engine;
  const fromEnv = env.VOICE_PROVIDER || (env.ELEVENLABS_LIVE === "1" ? "elevenlabs" : undefined);
  const provider = cli ?? own ?? fromEnv ?? "kokoro";
  const from = cli ? "--voice" : own ? "video.json" : fromEnv ? ".env" : "по умолчанию";
  if (provider !== "kokoro" && provider !== "elevenlabs") fail(`голос: провайдер kokoro или elevenlabs, а не «${provider}» (${from})`);
  // voiceId and model of video.json belong to its own provider: `--voice elevenlabs` on a Kokoro video takes the .env voice
  const mine = own === provider;
  if (provider === "kokoro") return { provider, voiceId: (mine ? (v.voiceId ?? v.voice) : undefined) ?? KOKORO_DEFAULT_VOICE, model: "kokoro-v1.0", speed: v.speed ?? 1, from };
  return { provider, voiceId: (mine ? v.voiceId : undefined) ?? env.ELEVENLABS_VOICE_ID ?? "", model: (mine ? v.model : undefined) ?? env.ELEVENLABS_MODEL ?? ELEVEN_DEFAULT_MODEL, speed: 1, from };
}

function wavHeader(bytes: number, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + bytes, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(bytes, 40);
  return h;
}

interface CharAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

function charsToWords(al: CharAlignment | undefined): AlignedWord[] {
  const out: AlignedWord[] = [];
  if (!al) return out;
  let cur: AlignedWord | null = null;
  for (let i = 0; i < al.characters.length; i++) {
    const ch = al.characters[i] as string;
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = null;
      continue;
    }
    const s = al.character_start_times_seconds[i] ?? 0;
    const e = al.character_end_times_seconds[i] ?? s;
    if (cur) {
      cur.text += ch;
      cur.end = e;
    } else cur = { text: ch, start: s, end: e };
  }
  if (cur) out.push(cur);
  return out;
}

export interface ElevenTake {
  wav: string;
  alignment: AlignedWord[];
  chars: number;
  cached: boolean;
}

let outputFormat = "pcm_44100";

/**
 * One ElevenLabs take with word times (`text-to-speech/{voice}/with-timestamps`), cached in `.cache/voice/elevenlabs`
 * by provider + voice + model + text: a rebuild costs no characters, an edited line re-voices only itself.
 */
export async function elevenTake(text: string, voiceId: string, model: string, label: string): Promise<ElevenTake> {
  const dir = join(ELEVEN_DIR, sha({ provider: "elevenlabs", voiceId, model, text }));
  const wav = join(dir, "take.wav");
  const alignPath = join(dir, "alignment.json");
  if (existsSync(wav) && existsSync(alignPath)) return { wav, alignment: readJson<AlignedWord[]>(alignPath), chars: 0, cached: true };
  const apiKey = loadEnv().ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("нет ELEVENLABS_API_KEY в .env");
  if (!voiceId) throw new Error("нет voiceId: voice.voiceId в video.json или ELEVENLABS_VOICE_ID в .env");
  let res: Response;
  let format: string;
  for (;;) {
    // the format of THIS request: parallel lines share the module-level choice (TRAPS.md)
    format = outputFormat;
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${format}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text, model_id: model }),
    });
    if (res.ok || format === "pcm_24000") break;
    const body = await res.text();
    // 44.1 kHz PCM needs a higher tier: fall back to 24 kHz for the whole process
    if (!/output_format|pcm|tier|subscription/i.test(body)) throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 240)}`);
    outputFormat = "pcm_24000";
  }
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const cost = Number(res.headers.get("character-cost") ?? Number.NaN);
  const data = (await res.json()) as { audio_base64?: string; alignment?: CharAlignment; normalized_alignment?: CharAlignment };
  if (!data.audio_base64) throw new Error("ElevenLabs: в ответе нет audio_base64");
  const words = charsToWords(data.alignment ?? data.normalized_alignment);
  if (!words.length) throw new Error("ElevenLabs: в ответе нет таймингов слов");
  const pcm = Buffer.from(data.audio_base64, "base64");
  ensureDir(dir);
  writeFileSync(wav, Buffer.concat([wavHeader(pcm.length, Number(format.split("_")[1])), pcm]));
  writeJson(alignPath, words);
  const record = { label, voiceId, model, output_format: format, chars: text.length, character_cost: Number.isFinite(cost) ? cost : null };
  writeJson(join(dir, "meta.json"), { ...record, text });
  appendFileSync(join(ELEVEN_DIR, "usage.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n");
  return { wav, alignment: words, chars: text.length, cached: false };
}

/** Raw take → the engine's clip: loudness, lead and tail (py/voice_line.py); cached per beat inside the video. */
async function finishLine(raw: string, cacheDir: string, pad: [number, number], fps: number): Promise<{ line: string; meta: LineMeta; cached: boolean }> {
  const line = join(cacheDir, "line.wav");
  const metaPath = join(cacheDir, "line.json");
  const cached = existsSync(line) && existsSync(metaPath);
  if (!cached) {
    const r = await runAsync(python(), [pyScript("voice_line.py"), raw, line, "--lead", String(pad[0]), "--tail", String(pad[1]), "--fps", String(fps)]);
    writeJson(metaPath, lastJsonLine<LineMeta>(r.stdout));
  }
  return { line, meta: readJson<LineMeta>(metaPath), cached };
}

/**
 * Voice lines of a build. Kokoro through `hyperframes tts` (draft), ElevenLabs with word timestamps (final).
 * An ElevenLabs failure (no key, API error, no credits) warns and falls back to Kokoro for the whole video.
 */
export async function makeVoices(spec: VideoSpec, videoDir: string, buildDir: string, wanted: VoiceChoice): Promise<VoiceResult> {
  const outDir = ensureDir(join(buildDir, "assets", "voice"));
  let chars = 0;
  const place = (beatId: string, i: number, tts: string, line: string, meta: LineMeta, cached: boolean, provider: VoiceProvider, alignment?: AlignedWord[]): VoiceLine => {
    const nn = String(i + 1).padStart(2, "0");
    const rel = `assets/voice/${nn}.wav`;
    copyFileSync(line, join(outDir, `${nn}.wav`));
    log.info(
      `${beatId}: ${meta.duration_s.toFixed(3)} с, речь ${meta.speech_start_s.toFixed(2)}–${meta.speech_end_s.toFixed(2)} · ` +
        `${meta.lufs} LUFS · TP ${meta.true_peak_dbtp} dBTP · ${provider}${cached ? " · из кэша" : ""}`,
    );
    return { beatId, index: i, rel, abs: join(buildDir, rel), duration: meta.duration_s, speechStart: meta.speech_start_s, speechEnd: meta.speech_end_s, lufs: meta.lufs, truePeak: meta.true_peak_dbtp, tts, cached, provider, alignment };
  };

  const eleven = async (choice: VoiceChoice): Promise<VoiceLine[]> =>
    pool(spec.beats, 3, async (beat, i) => {
      const { tts } = parseBeatText(beat.text);
      const take = await elevenTake(tts, choice.voiceId, choice.model, `${spec.id}/${beat.id}`);
      chars += take.chars;
      const key = sha({ v: 2, provider: "elevenlabs", voiceId: choice.voiceId, model: choice.model, tts, pad: beat.pad, fps: spec.fps });
      const done = await finishLine(take.wav, ensureDir(join(videoDir, ".cache", "voice", `${beat.id}-${key}`)), beat.pad, spec.fps);
      // API times are seconds of the raw take; the clip dropped the take's leading silence and added the lead pad
      const shift = done.meta.speech_start_s - (done.meta.trim_start_s ?? 0);
      const alignment = take.alignment.map((w) => ({ text: w.text, start: r3(w.start + shift), end: r3(w.end + shift) }));
      return place(beat.id, i, tts, done.line, done.meta, take.cached && done.cached, "elevenlabs", alignment);
    });

  const kokoro = async (choice: VoiceChoice): Promise<VoiceLine[]> => {
    const bin = hyperframesBin();
    const line1 = async (beat: VideoSpec["beats"][number], i: number): Promise<VoiceLine> => {
      const { tts } = parseBeatText(beat.text);
      // same key as before D5 for {engine, voice, speed}: Kokoro takes of existing videos stay cached
      const key = sha({ v: 1, engine: "kokoro", voice: choice.voiceId, speed: choice.speed, tts, pad: beat.pad, fps: spec.fps });
      const cacheDir = ensureDir(join(videoDir, ".cache", "voice", `${beat.id}-${key}`));
      const raw = join(cacheDir, "raw.wav");
      if (!existsSync(join(cacheDir, "line.wav")) && !existsSync(raw)) {
        await runAsync(bin, ["tts", tts, "--voice", choice.voiceId, "--speed", String(choice.speed), "--output", raw, "--json"], { cwd: cacheDir });
      }
      const done = await finishLine(raw, cacheDir, beat.pad, spec.fps);
      return place(beat.id, i, tts, done.line, done.meta, done.cached, "kokoro");
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
  };

  if (wanted.provider === "elevenlabs") {
    try {
      return { lines: await eleven(wanted), choice: wanted, chars };
    } catch (err) {
      log.warn(`ElevenLabs: ${err instanceof Error ? err.message : String(err)} — откат на Kokoro, сборка продолжается`);
      const v = spec.voice ?? {};
      const own = (v.provider ?? v.engine) === "kokoro";
      const fallback: VoiceChoice = { provider: "kokoro", voiceId: (own ? (v.voiceId ?? v.voice) : undefined) ?? KOKORO_DEFAULT_VOICE, model: "kokoro-v1.0", speed: v.speed ?? 1, from: wanted.from };
      return { lines: await kokoro(fallback), choice: fallback, chars };
    }
  }
  return { lines: await kokoro(wanted), choice: wanted, chars };
}
