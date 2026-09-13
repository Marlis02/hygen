import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { VideoSpec } from "./spec.ts";
import { fail, hyperframesBin, log, pyScript, python, readJson, run } from "./lib/util.ts";

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
 * Autocheck of the final MP4 (py/verify_mp4.py): format and duration, loudness and peaks, blank
 * scenes, frozen scenes and events, and settle frames compared with fresh composition snapshots.
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
  return { ok: r.status === 0, report, sheet };
}
