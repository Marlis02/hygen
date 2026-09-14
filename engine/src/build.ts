import { rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { assembleProject } from "./assemble.ts";
import { loadStyle, missingSources, validateBeats } from "./contract.ts";
import { validateLayers } from "./layers.ts";
import { applyLook, loadLook } from "./look.ts";
import { checkProject, lintProject, masterAudio, renderProject } from "./render.ts";
import type { MasterResult } from "./render.ts";
import { writeScenes } from "./scenes.ts";
import { makeGrain, makeSound, planSound } from "./sound.ts";
import { loadSpec } from "./spec.ts";
import { beatTimings } from "./timeline.ts";
import { verifyVideo } from "./verify.ts";
import type { VerifyResult } from "./verify.ts";
import { makeVoices } from "./voice.ts";
import { alignWords } from "./words.ts";
import { ROOT_DIR, Timer, ensureDir, log, writeJson } from "./lib/util.ts";

export interface BuildOptions {
  render: boolean;
  check: boolean;
  quality: string;
  snapshots: boolean;
}

/** video.json → voice → word timings → sound → scenes → index.html → lint/check → render → master → autocheck. */
export async function build(videoDir: string, opts: BuildOptions): Promise<boolean> {
  const spec = loadSpec(videoDir);
  const look = loadLook(spec.look);
  const style = applyLook(loadStyle(spec.style), look);
  validateBeats(spec, style, videoDir);
  validateLayers(spec, look, videoDir);
  const timer = new Timer();
  const buildDir = join(videoDir, "build");
  const rendersDir = ensureDir(join(videoDir, "renders"));
  console.log(`hygen build ${spec.id} — «${spec.title}» · look ${look.id}`);
  for (const miss of missingSources(spec)) log.warn(`источник: ${miss} — автопроверка упадёт`);
  rmSync(buildDir, { recursive: true, force: true });
  ensureDir(buildDir);

  const voices = await timer.step("голос: Kokoro, громкость, паузы", () => makeVoices(spec, videoDir, buildDir));
  const words = await timer.step("тайминги слов: whisper + выравнивание по сценарию", () => alignWords(spec, voices, videoDir));
  const timings = beatTimings(voices);
  const sound = await timer.step("звук: гул, удары, пепел; зерно", () => {
    const plan = planSound(spec, timings, words);
    makeSound(plan, videoDir, buildDir);
    makeGrain(videoDir, buildDir);
    return plan;
  });
  const scenes = await timer.step("сцены по таймингам голоса", () => writeScenes(spec, style, videoDir, buildDir, timings, words, look, sound.sfx.filter((c) => c.kind !== "ash-fall").map((c) => c.at)));
  const total = await timer.step("index.html: субтитры, шины, переход, приглушение", () =>
    assembleProject({ spec, style, look, buildDir, voices, words, timings, sound, scenes }),
  );
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
    verify = await timer.step("автопроверка MP4", () => verifyVideo(videoDir, spec, { snapshots: opts.snapshots }));
  }

  const seconds = timer.totalSeconds();
  const rel = (p: string): string => relative(ROOT_DIR, p);
  writeJson(join(rendersDir, `${spec.id}.build.json`), {
    id: spec.id,
    look: look.id,
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
  const result = verifyVideo(videoDir, spec, { mp4, snapshots });
  console.log(result.ok ? "\n✓ автопроверка пройдена" : "\n✗ автопроверка НЕ пройдена");
  return result.ok;
}
