import { rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { assembleProject } from "./assemble.ts";
import { loadStyle, validateBeats } from "./contract.ts";
import { requireExpanded } from "./expanded.ts";
import { checkGrammar } from "./grammar.ts";
import { allMissingSources, checkStageBeat } from "./stage.ts";
import { validateLayers } from "./layers.ts";
import { applyLook, loadLook } from "./look.ts";
import { checkProject, lintProject, masterAudio, renderProject } from "./render.ts";
import type { MasterResult } from "./render.ts";
import { writeScenes } from "./scenes.ts";
import { makeEventSounds, makeGrain, makeSound, planEventSounds, planSound } from "./sound.ts";
import { planTransitions } from "./layers.ts";
import { makeMusic, musicGrid } from "./music.ts";
import { checkCaptionFields, probeCaptionContrast } from "./captions.ts";
import { loadSpec, requireBeats } from "./spec.ts";
import { beatTimings } from "./timeline.ts";
import { verifyVideo } from "./verify.ts";
import type { VerifyResult } from "./verify.ts";
import { makeVoices, resolveVoice } from "./voice.ts";
import { writePublish } from "./publish.ts";
import { alignWords } from "./words.ts";
import { checkProjectMedia, snapshotHistory, updateLibraryIndex } from "./lib/project.ts";
import { buildTimeline, projectHashOf, timelineSummary, writeTimingRecord } from "./lib/timeline.ts";
import { ROOT_DIR, Timer, ensureDir, fail, log, writeJson } from "./lib/util.ts";

export interface BuildOptions {
  render: boolean;
  check: boolean;
  quality: string;
  snapshots: boolean;
  /** kokoro | elevenlabs — over project.json `voice` and `.env` VOICE_PROVIDER. */
  voice?: string;
}

/** project.json → voice → word timings → sound → scenes → index.html → lint/check → render → master → autocheck. */
export async function build(videoDir: string, opts: BuildOptions): Promise<boolean> {
  const spec = loadSpec(videoDir);
  requireBeats(spec);
  // the project.json this build reads: build/timeline.json is current while the file keeps this hash
  const projectHash = projectHashOf(videoDir);
  const media = checkProjectMedia(videoDir);
  if (media.errors.length) fail(`медиа проекта — у каждого файла запись с лицензией в media.json:\n  ${media.errors.join("\n  ")}`);
  const snap = snapshotHistory(videoDir, "build");
  if (snap) log.info(`история: вход изменился, снимок project.json и media.json → ${relative(ROOT_DIR, snap)}`);
  const look = loadLook(spec.look);
  const style = applyLook(loadStyle(spec.style), look);
  validateBeats(spec, style, videoDir);
  for (const beat of spec.beats) if (beat.scene === undefined) checkStageBeat(beat, style, videoDir);
  validateLayers(spec, look, videoDir);
  if (spec.captions !== undefined && typeof spec.captions !== "string") checkCaptionFields(spec.captions, "project.json: captions");
  for (const beat of spec.beats) if (beat.caption !== undefined) checkCaptionFields(beat.caption, `${beat.id}: caption`);
  const grammar = checkGrammar(spec, look, videoDir);
  for (const w of grammar.warnings) log.warn(`грамматика: ${w}`);
  if (grammar.errors.length) fail(`грамматика бита:\n  ${grammar.errors.join("\n  ")}`);
  const timer = new Timer();
  const buildDir = join(videoDir, "build");
  const rendersDir = ensureDir(join(videoDir, "renders"));
  console.log(`hygen build ${spec.id} — «${spec.title}» · look ${look.id}`);
  for (const miss of allMissingSources(spec)) log.warn(`источник: ${miss} — автопроверка упадёт`);
  const expanded = requireExpanded(videoDir, spec);
  rmSync(buildDir, { recursive: true, force: true });
  ensureDir(buildDir);
  writeJson(join(buildDir, "beats.expanded.json"), expanded);

  const wanted = resolveVoice(spec, opts.voice);
  console.log(`голос: ${wanted.provider} · ${wanted.voiceId} · ${wanted.model} (${wanted.from})`);
  const voice = await timer.step(`голос: ${wanted.provider === "elevenlabs" ? "ElevenLabs" : "Kokoro"}, громкость, паузы`, () => makeVoices(spec, videoDir, buildDir, wanted));
  const voices = voice.lines;
  const asrName = voice.choice.provider === "elevenlabs" ? "тайминги слов: ElevenLabs + выравнивание по сценарию" : "тайминги слов: whisper + выравнивание по сценарию";
  const words = await timer.step(asrName, () => alignWords(spec, voices, videoDir));
  const timings = beatTimings(voices);
  const sound = await timer.step("звук: гул, удары, пепел; зерно", () => {
    const plan = planSound(spec, timings, words);
    makeSound(plan, videoDir, buildDir);
    makeGrain(videoDir, buildDir);
    return plan;
  });
  const grid = musicGrid(spec, style, videoDir, timings, words);
  const scenes = await timer.step("сцены по таймингам голоса", () => writeScenes(spec, style, videoDir, buildDir, timings, words, look, sound.sfx.filter((c) => c.kind === "thud" || c.kind === "thud-heavy").map((c) => c.at), grid));
  if (spec.sound.events !== false) {
    await timer.step("звук по событиям: устройства, сцены, переходы", () => {
      const hits = sound.sfx.filter((c) => c.kind === "thud" || c.kind === "thud-heavy").map((c) => c.at);
      const heavy = sound.sfx.filter((c) => c.kind === "thud-heavy").map((c) => c.at);
      const ev = planEventSounds({ spec, style, look, timings, scenes, transitions: planTransitions(spec, look, timings, heavy), hits });
      makeEventSounds(ev.files, look, videoDir, buildDir);
      sound.sfx.push(...ev.cues);
      sound.sfx.sort((a, b) => a.at - b.at);
      const byFamily = ev.cues.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.kind.slice(3)]: (acc[c.kind.slice(3)] ?? 0) + 1 }), {});
      log.info(`звуков событий ${ev.cues.length}: ${Object.entries(byFamily).map(([k, v]) => `${k} ${v}`).join(", ") || "нет"}`);
    });
  }
  const music = await timer.step("музыка: подложка, приглушение под голос", () => makeMusic(spec, style, videoDir, buildDir, voices, timings, words));
  const { total, captions } = await timer.step("index.html: субтитры, шины, переход, приглушение", () =>
    assembleProject({ spec, style, look, buildDir, voices, words, timings, sound, scenes, music }),
  );
  await timer.step("субтитры: контраст под текстом (снимки)", () => probeCaptionContrast(buildDir, captions, style));
  for (const w of captions.warnings) log.warn(`субтитры: ${w}`);
  // the map of the video for the «Редактор» screen: build/timing.json + the files above → build/timeline.json (no render change)
  try {
    writeTimingRecord(buildDir, { projectHash, spec, voice, words, scenes, grid });
    log.info(timelineSummary(buildTimeline(videoDir)));
  } catch (err) {
    log.warn(`карта ролика build/timeline.json не записана: ${err instanceof Error ? err.message : String(err)} — панель покажет оценку`);
  }
  await timer.step("hyperframes lint", () => lintProject(buildDir));
  const checkOk = opts.check ? await timer.step("hyperframes check", () => checkProject(buildDir)) : null;

  let master: MasterResult | null = null;
  let verify: VerifyResult | null = null;
  const finalMp4 = join(rendersDir, `${spec.id}.mp4`);
  if (opts.render) {
    const raw = join(rendersDir, `${spec.id}.raw.mp4`);
    await timer.step(`рендер (${opts.quality})`, () => renderProject(buildDir, raw, opts.quality, spec.fps));
    master = await timer.step("мастеринг: −14 LUFS, пики ≤ −1,5 dBTP; H.264 crf 18", () => masterAudio(raw, finalMp4));
    rmSync(raw, { force: true });
    const pub = await timer.step("публикация: названия, описание, теги, SRT, обложка", () => writePublish(videoDir, spec));
    log.info(`publish/: источников ${pub.sources.length}, кредитов ${pub.credits.length}, обложка — ${pub.thumbnailAt.beat} @${pub.thumbnailAt.t.toFixed(2)} с`);
    verify = await timer.step("автопроверка MP4", () => verifyVideo(videoDir, spec, { snapshots: opts.snapshots }));
    // library/index.json — the fingerprint of the video for the director; the row is rewritten only when it changed
    if (updateLibraryIndex(videoDir)) log.info("library/index.json: отпечаток ролика обновлён");
  }

  const seconds = timer.totalSeconds();
  const rel = (p: string): string => relative(ROOT_DIR, p);
  writeJson(join(rendersDir, `${spec.id}.build.json`), {
    id: spec.id,
    look: look.id,
    voice: { provider: voice.choice.provider, voiceId: voice.choice.voiceId, model: voice.choice.model, from: voice.choice.from, elevenlabs_chars: voice.chars },
    duration_s: total,
    build_seconds: seconds,
    steps: timer.steps,
    check_ok: checkOk,
    master,
    verify_ok: verify?.ok ?? null,
    mp4: opts.render ? rel(finalMp4) : null,
  });
  console.log(`\n${"─".repeat(60)}`);
  console.log(`ролик ${spec.id}: ${total.toFixed(2)} с · сборка ${Math.floor(seconds / 60)} мин ${Math.round(seconds % 60)} с`);
  for (const s of timer.steps) console.log(`  ${s.seconds.toFixed(1).padStart(6)} с  ${s.name}`);
  console.log(`голос: ${voice.choice.provider} · ${voice.choice.voiceId}${voice.choice.provider === "elevenlabs" ? ` · ElevenLabs: потрачено ${voice.chars} символов` : ""}`);
  if (opts.render && verify) {
    const mb = statSync(finalMp4).size / 1e6;
    console.log(`MP4: ${rel(finalMp4)} (${mb.toFixed(0)} МБ)`);
    console.log(`контактный лист: ${rel(verify.sheet)} · отчёт: ${rel(verify.report)}`);
    console.log(verify.ok ? "✓ автопроверка пройдена" : "✗ автопроверка НЕ пройдена — см. отчёт");
  }
  return verify ? verify.ok : true;
}

export function verifyOnly(videoDir: string, mp4: string | undefined, snapshots: boolean): boolean {
  const spec = loadSpec(videoDir);
  requireBeats(spec);
  const result = verifyVideo(videoDir, spec, { mp4, snapshots });
  console.log(result.ok ? "\n✓ автопроверка пройдена" : "\n✗ автопроверка НЕ пройдена");
  return result.ok;
}
