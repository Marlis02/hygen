import { fail, hyperframesBin, lastJsonLine, log, pyScript, python, run, stripAnsi } from "./lib/util.ts";

const tail = (text: string, n: number): string[] =>
  stripAnsi(text).trim().split("\n").filter((l) => l.trim()).slice(-n);

export function lintProject(buildDir: string): void {
  const r = run(hyperframesBin(), ["lint"], { cwd: buildDir, allowFail: true });
  for (const line of tail(r.stdout + r.stderr, 20)) log.info(line);
  if (r.status !== 0) fail("hyperframes lint нашёл ошибки — рендер не запускаю");
}

/** `check` is reported, not blocking: the final word belongs to frames of the MP4 (TRAPS.md). */
export function checkProject(buildDir: string): boolean {
  const r = run(hyperframesBin(), ["check"], { cwd: buildDir, allowFail: true });
  for (const line of tail(r.stdout + r.stderr, 30)) log.info(line);
  if (r.status !== 0) log.warn("hyperframes check сообщил о проблемах (выше); решает автопроверка MP4");
  return r.status === 0;
}

export function renderProject(buildDir: string, out: string, quality: string, fps: number): void {
  run(hyperframesBin(), ["render", "--output", out, "--quality", quality, "--fps", String(fps)], { cwd: buildDir, stream: true });
}

export interface MasterResult {
  input_lufs: number;
  input_tp: number;
  lufs: number;
  true_peak: number;
  ceiling: number;
  passes: number;
}

export function masterAudio(raw: string, out: string): MasterResult {
  const r = run(python(), [pyScript("master_audio.py"), raw, "--out", out]);
  for (const line of r.stdout.trim().split("\n").slice(0, -1)) log.info(line);
  return lastJsonLine<MasterResult>(r.stdout);
}
