import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { missingSources } from "./contract.ts";
import { checkUniqueness } from "./uniqueness.ts";
import type { VideoSpec } from "./spec.ts";
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
 * source link for every figure on screen (engine/scenes/CONTRACT.md, «Источники»).
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
  const missing = missingSources(spec);
  const sourcesOk = missing.length === 0;
  const detail = sourcesOk ? "у всех цифр на экране есть источник" : `нет источника: ${missing.join("; ")}`;
  log.info(`${sourcesOk ? "✓" : "✗"} sources   ${detail}`);
  const rep = readJson<{ ok: boolean; checks: { check: string; ok: boolean; detail: string }[]; palette?: { hue: number | null } }>(report);
  rep.checks.push({ check: "sources", ok: sourcesOk, detail });
  // uniqueness among the videos in videos/: accent hue (look and settle frames) or texture set (ROADMAP D3.5)
  const uniq = checkUniqueness(spec, videoDir, rep.palette?.hue ?? null);
  log.info(`${uniq.ok ? "✓" : "✗"} uniqueness ${uniq.detail}`);
  for (const w of uniq.warnings) log.warn(w);
  rep.checks.push({ check: "uniqueness", ok: uniq.ok, detail: uniq.detail + (uniq.warnings.length ? ` · предупреждения: ${uniq.warnings.join("; ")}` : "") });
  rep.ok = rep.ok && sourcesOk && uniq.ok;
  writeJson(report, rep);
  return { ok: r.status === 0 && sourcesOk && uniq.ok, report, sheet };
}
