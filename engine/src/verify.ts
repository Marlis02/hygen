import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkExpanded } from "./expanded.ts";
import { checkGrammar, textWarnings } from "./grammar.ts";
import { checkCaptionPlan } from "./captions.ts";
import { loadLook } from "./look.ts";
import { allMissingSources } from "./stage.ts";
import { checkUniqueness } from "./uniqueness.ts";
import { checkPublish } from "./publish.ts";
import type { VideoSpec } from "./spec.ts";
import { checkProjectMedia } from "./lib/project.ts";
import { fail, hyperframesBin, log, pyScript, python, readJson, run, writeJson } from "./lib/util.ts";

export interface VerifyOptions {
  mp4?: string;
  snapshots: boolean;
}

export interface VerifyResult {
  ok: boolean;
  report: string;
  sheet: string;
}

/**
 * Autocheck of the final MP4 (py/verify_mp4.py): format, duration and size, loudness and peaks, blank
 * scenes, frozen scenes and events, settle frames compared with fresh composition snapshots — plus a
 * source link for every figure on screen (library/scenes/CONTRACT.md, «Источники»).
 */
export function verifyVideo(videoDir: string, spec: VideoSpec, opts: VerifyOptions): VerifyResult {
  const buildDir = join(videoDir, "build");
  const rendersDir = join(videoDir, "renders");
  const mp4 = opts.mp4 ?? join(rendersDir, `${spec.id}.mp4`);
  const planPath = join(buildDir, "verify_plan.json");
  if (!existsSync(mp4)) fail(`нет файла ${mp4}`);
  if (!existsSync(planPath)) fail(`нет ${planPath} — сначала hygen build`);
  const args = [pyScript("verify_mp4.py"), mp4, "--plan", planPath];
  const report = join(rendersDir, `${spec.id}.verify.json`);
  const sheet = join(rendersDir, `${spec.id}.contact.jpg`);
  args.push("--out", report, "--sheet", sheet);
  if (opts.snapshots) {
    const plan = readJson<{ scenes: { settle: number }[] }>(planPath);
    const snapDir = join(buildDir, "snapshots-verify");
    rmSync(snapDir, { recursive: true, force: true });
    const times = plan.scenes.map((s) => s.settle.toFixed(3)).join(",");
    const r = run(hyperframesBin(), ["snapshot", "--at", times, "--no-end", "--output", snapDir], { cwd: buildDir, allowFail: true });
    if (r.status === 0) args.push("--snapshots", snapDir);
    else log.warn("hyperframes snapshot не удался — сравнение со снимками пропущено");
  }
  const r = run(python(), args, { allowFail: true });
  for (const line of r.stdout.trim().split("\n")) log.info(line);
  if (r.status !== 0 && !existsSync(report)) fail(`автопроверка упала:\n${r.stderr.slice(-1500)}`);
  const missing = allMissingSources(spec);
  const sourcesOk = missing.length === 0;
  const detail = sourcesOk ? "у всех цифр на экране есть источник" : `нет источника: ${missing.join("; ")}`;
  log.info(`${sourcesOk ? "✓" : "✗"} sources   ${detail}`);
  const rep0 = checkProjectMedia(videoDir);
  const mediaOk = rep0.errors.length === 0;
  const mDetail = mediaOk ? `файлов в media/ ${rep0.files}, у всех запись с лицензией в media.json` : rep0.errors.join("; ");
  log.info(`${mediaOk ? "✓" : "✗"} media     ${mDetail}`);
  const rep = readJson<{ ok: boolean; checks: { check: string; ok: boolean; detail: string }[]; palette?: { hue: number | null } }>(report);
  rep.checks.push({ check: "sources", ok: sourcesOk, detail });
  rep.checks.push({ check: "media", ok: mediaOk, detail: mDetail });
  // grammar of the beats and the arc (ROADMAP D4): errors fail, warnings are reported
  const grammar = checkGrammar(spec, loadLook(spec.look), videoDir);
  const grammarOk = grammar.errors.length === 0;
  const gDetail = `${grammarOk ? "ошибок нет" : grammar.errors.join("; ")} · плотность ${grammar.density.join(" ")}${grammar.warnings.length ? ` · предупреждения: ${grammar.warnings.join("; ")}` : ""}`;
  log.info(`${grammarOk ? "✓" : "✗"} grammar   ${gDetail}`);
  rep.checks.push({ check: "grammar", ok: grammarOk, detail: gDetail });
  // the resolver: the same project.json and tables give the same beats.expanded.json as the build wrote
  const exp = checkExpanded(videoDir, spec);
  log.info(`${exp.ok ? "✓" : "✗"} expanded  ${exp.detail}`);
  rep.checks.push({ check: "expanded", ok: exp.ok, detail: exp.detail });
  // uniqueness among the projects in projects/: accent hue (look and settle frames) or texture set (ROADMAP D3.5)
  const uniq = checkUniqueness(spec, videoDir, rep.palette?.hue ?? null);
  log.info(`${uniq.ok ? "✓" : "✗"} uniqueness ${uniq.detail}`);
  for (const w of uniq.warnings) log.warn(w);
  rep.checks.push({ check: "uniqueness", ok: uniq.ok, detail: uniq.detail + (uniq.warnings.length ? ` · предупреждения: ${uniq.warnings.join("; ")}` : "") });
  // publish/ is complete: titles, description with every source and media credit, tags, SRT, cover (ROADMAP D5)
  const pub = checkPublish(videoDir, spec);
  log.info(`${pub.ok ? "✓" : "✗"} publish   ${pub.detail}`);
  rep.checks.push({ check: "publish", ok: pub.ok, detail: pub.detail });
  // text on screen (ROADMAP D6): contrast under the captions (measured before the render), safe zone, text warnings of the grammar
  const text = checkCaptionPlan(buildDir);
  const textWarn = textWarnings(spec, loadLook(spec.look));
  const tDetail = text.detail + (textWarn.length ? ` · предупреждения: ${textWarn.join("; ")}` : "");
  log.info(`${text.ok ? "✓" : "✗"} text      ${tDetail}`);
  rep.checks.push({ check: "text", ok: text.ok, detail: tDetail });
  rep.ok = rep.ok && mediaOk && sourcesOk && uniq.ok && grammarOk && exp.ok && pub.ok && text.ok;
  writeJson(report, rep);
  return { ok: r.status === 0 && mediaOk && sourcesOk && uniq.ok && grammarOk && exp.ok && pub.ok && text.ok, report, sheet };
}
