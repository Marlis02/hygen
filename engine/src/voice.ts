import { appendFileSync, copyFileSync, cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
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
/** Previews of voices and the reset marks of the budget; takes of videos live in `videos/<id>/voice/` (in git, ROADMAP D7). */
const ELEVEN_DIR = join(ROOT_DIR, ".cache", "voice", "elevenlabs");
const USAGE = join(ELEVEN_DIR, "usage.jsonl");

/** videos/<id>/voice/usage.jsonl of every project (and _proof) — the budget counts them together with the previews. */
function projectUsageFiles(): string[] {
  const out: string[] = [];
  for (const base of [join(ROOT_DIR, "videos"), join(ROOT_DIR, "videos", "_proof")]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const f = join(base, name, "voice", "usage.jsonl");
      if (existsSync(f)) out.push(f);
    }
  }
  return out;
}

function readUsage(file: string): Record<string, unknown>[] {
  if (!existsSync(file)) return [];
  const out: Record<string, unknown>[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // a torn line of an interrupted build
    }
  }
  return out;
}

/** The ElevenLabs budget is spent: this line goes to Kokoro, the rest of the build continues (not a failure of the API). */
export class BudgetError extends Error {}

/**
 * ELEVENLABS_BUDGET_CHARS in .env against the characters sent since the last reset (.cache/voice/elevenlabs/usage.jsonl and
 * videos/<id>/voice/usage.jsonl; a cached take is not sent and not recorded). `npm run voice -- --reset-budget` appends a reset mark.
 */
export function budgetState(): { budget: number | null; spent: number; left: number | null; since: string | null } {
  const raw = loadEnv().ELEVENLABS_BUDGET_CHARS;
  const budget = raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
  let spent = 0;
  let since: string | null = null;
  // one timeline: previews and resets from .cache, takes from the projects; a take moved into a project keeps its record once
  const seen = new Set<string>();
  const records = [USAGE, ...projectUsageFiles()]
    .flatMap(readUsage)
    .filter((r) => {
      const k = `${r.at}|${r.label ?? ""}|${r.reset ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));
  for (const rec of records) {
    if (rec.reset) {
      spent = 0;
      since = (rec.at as string | undefined) ?? null;
    } else spent += Number(rec.chars ?? 0);
  }
  return { budget, spent, left: budget === null ? null : Math.max(0, budget - spent), since };
}

export function resetBudget(): void {
  ensureDir(ELEVEN_DIR);
  appendFileSync(USAGE, JSON.stringify({ at: new Date().toISOString(), reset: true }) + "\n");
}

/** Characters promised to requests in flight: three parallel lines must not all pass the same check. */
let reserved = 0;

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
 * A take of the old global cache moves into its project: take.wav, alignment.json, meta.json and its usage record
 * (the same `at`, so the budget counts it once). Returns false when there is nothing to move.
 */
export function moveTake(key: string, projectDir: string): boolean {
  const from = join(ELEVEN_DIR, key);
  if (!existsSync(join(from, "take.wav")) || !existsSync(join(from, "alignment.json"))) return false;
  const to = join(ensureDir(join(projectDir, "voice")), key);
  cpSync(from, to, { recursive: true });
  const meta = existsSync(join(from, "meta.json")) ? readJson<{ label?: string; chars?: number }>(join(from, "meta.json")) : {};
  const rec = readUsage(USAGE).filter((r) => !r.reset && r.label === meta.label && r.chars === meta.chars).pop();
  const projUsage = join(projectDir, "voice", "usage.jsonl");
  if (rec && !readUsage(projUsage).some((r) => r.at === rec.at && r.label === rec.label)) appendFileSync(projUsage, JSON.stringify(rec) + "\n");
  rmSync(from, { recursive: true, force: true });
  return true;
}

/** The label of a take (`<video id>/<beat>`) → the project folder whose video.json has that id. */
export function projectOfLabel(label: string): string | null {
  const id = label.split("/")[0] ?? "";
  for (const base of [join(ROOT_DIR, "videos"), join(ROOT_DIR, "videos", "_proof")]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const spec = join(base, name, "video.json");
      if (!existsSync(spec)) continue;
      try {
        if (readJson<{ id?: string }>(spec).id === id || name === id) return join(base, name);
      } catch {
        // not a video folder
      }
    }
  }
  return null;
}

/** Takes left in the global cache: previews (label voices/…) and takes of videos still to move (`npm run voice -- --migrate`). */
export function globalTakes(): { previews: number; videos: { key: string; label: string }[] } {
  const res = { previews: 0, videos: [] as { key: string; label: string }[] };
  if (!existsSync(ELEVEN_DIR)) return res;
  for (const key of readdirSync(ELEVEN_DIR)) {
    const meta = join(ELEVEN_DIR, key, "meta.json");
    if (!existsSync(meta)) continue;
    const label = readJson<{ label?: string }>(meta).label ?? "";
    if (label.startsWith("voices/")) res.previews++;
    else res.videos.push({ key, label });
  }
  return res;
}

/**
 * One ElevenLabs take with word times (`text-to-speech/{voice}/with-timestamps`), cached by provider + voice + model +
 * text: a rebuild costs no characters, an edited line re-voices only itself. Takes of a video live in
 * `videos/<id>/voice/<key>/` and go to git — the voice travels with the project; previews (no project) stay in `.cache`.
 */
export async function elevenTake(text: string, voiceId: string, model: string, label: string, projectDir?: string): Promise<ElevenTake> {
  const key = sha({ provider: "elevenlabs", voiceId, model, text });
  const dir = projectDir ? join(projectDir, "voice", key) : join(ELEVEN_DIR, key);
  const wav = join(dir, "take.wav");
  const alignPath = join(dir, "alignment.json");
  if (projectDir && !existsSync(wav) && moveTake(key, projectDir)) log.info(`${label}: дубль ElevenLabs перенесён из .cache/voice в ${basename(projectDir)}/voice`);
  if (existsSync(wav) && existsSync(alignPath)) return { wav, alignment: readJson<AlignedWord[]>(alignPath), chars: 0, cached: true };
  const apiKey = loadEnv().ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("нет ELEVENLABS_API_KEY в .env");
  if (!voiceId) throw new Error("нет voiceId: voice.voiceId в video.json или ELEVENLABS_VOICE_ID в .env");
  const budget = budgetState();
  if (budget.budget !== null && budget.spent + reserved + text.length > budget.budget) {
    throw new BudgetError(`бюджет ElevenLabs: потрачено ${budget.spent} из ${budget.budget} символов${reserved ? ` (+${reserved} в пути)` : ""}, реплике нужно ${text.length}`);
  }
  reserved += text.length;
  try {
    return await sendTake(text, voiceId, model, label, apiKey, dir, wav, alignPath, projectDir ? join(projectDir, "voice", "usage.jsonl") : USAGE);
  } finally {
    reserved -= text.length;
  }
}

async function sendTake(text: string, voiceId: string, model: string, label: string, apiKey: string, dir: string, wav: string, alignPath: string, usage: string): Promise<ElevenTake> {
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
  appendFileSync(usage, JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n");
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

  // Kokoro voice when ElevenLabs is out: the video's own Kokoro voice (voice.voice / voiceId of a Kokoro spec), else am_michael
  const kokoroFallback = (from: VoiceChoice["from"]): VoiceChoice => {
    const v = spec.voice ?? {};
    const own = (v.provider ?? v.engine) === "kokoro";
    return { provider: "kokoro", voiceId: (own ? (v.voiceId ?? v.voice) : v.voice) ?? KOKORO_DEFAULT_VOICE, model: "kokoro-v1.0", speed: v.speed ?? 1, from };
  };
  let overBudget = 0;
  const eleven = async (choice: VoiceChoice): Promise<VoiceLine[]> =>
    pool(spec.beats, 3, async (beat, i) => {
      const { tts } = parseBeatText(beat.text);
      let take: ElevenTake;
      try {
        take = await elevenTake(tts, choice.voiceId, choice.model, `${spec.id}/${beat.id}`, videoDir);
      } catch (err) {
        if (!(err instanceof BudgetError)) throw err;
        // over the budget: this line only goes to Kokoro, no API call (ROADMAP D6)
        log.warn(`${beat.id}: ${err.message} — реплика озвучена Kokoro`);
        overBudget++;
        return kokoroLine(kokoroFallback(choice.from), beat, i);
      }
      chars += take.chars;
      const key = sha({ v: 2, provider: "elevenlabs", voiceId: choice.voiceId, model: choice.model, tts, pad: beat.pad, fps: spec.fps });
      const done = await finishLine(take.wav, ensureDir(join(videoDir, ".cache", "voice", `${beat.id}-${key}`)), beat.pad, spec.fps);
      // API times are seconds of the raw take; the clip dropped the take's leading silence and added the lead pad
      const shift = done.meta.speech_start_s - (done.meta.trim_start_s ?? 0);
      const alignment = take.alignment.map((w) => ({ text: w.text, start: r3(w.start + shift), end: r3(w.end + shift) }));
      return place(beat.id, i, tts, done.line, done.meta, take.cached && done.cached, "elevenlabs", alignment);
    });

  async function kokoroLine(choice: VoiceChoice, beat: VideoSpec["beats"][number], i: number): Promise<VoiceLine> {
    const { tts } = parseBeatText(beat.text);
    // same key as before D5 for {engine, voice, speed}: Kokoro takes of existing videos stay cached
    const key = sha({ v: 1, engine: "kokoro", voice: choice.voiceId, speed: choice.speed, tts, pad: beat.pad, fps: spec.fps });
    const cacheDir = ensureDir(join(videoDir, ".cache", "voice", `${beat.id}-${key}`));
    const raw = join(cacheDir, "raw.wav");
    if (!existsSync(join(cacheDir, "line.wav")) && !existsSync(raw)) {
      await runAsync(hyperframesBin(), ["tts", tts, "--voice", choice.voiceId, "--speed", String(choice.speed), "--output", raw, "--json"], { cwd: cacheDir });
    }
    const done = await finishLine(raw, cacheDir, beat.pad, spec.fps);
    return place(beat.id, i, tts, done.line, done.meta, done.cached, "kokoro");
  }

  const kokoro = async (choice: VoiceChoice): Promise<VoiceLine[]> => {
    const line1 = (beat: VideoSpec["beats"][number], i: number): Promise<VoiceLine> => kokoroLine(choice, beat, i);
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
      const lines = await eleven(wanted);
      if (overBudget) log.warn(`ElevenLabs: бюджет кончился — ${overBudget} из ${lines.length} реплик озвучены Kokoro (смешанные голоса; пересоберите после npm run voice -- --reset-budget)`);
      return { lines, choice: wanted, chars };
    } catch (err) {
      log.warn(`ElevenLabs: ${err instanceof Error ? err.message : String(err)} — откат на Kokoro, сборка продолжается`);
      const fallback = kokoroFallback(wanted.from);
      return { lines: await kokoro(fallback), choice: fallback, chars };
    }
  }
  return { lines: await kokoro(wanted), choice: wanted, chars };
}
