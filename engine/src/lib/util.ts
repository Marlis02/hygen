import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ROOT_DIR = resolve(ENGINE_DIR, "..");
export const VENDOR_SKILLS = join(ENGINE_DIR, "vendor", "skills");

export const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export class BuildError extends Error {}

export function fail(message: string): never {
  throw new BuildError(message);
}

export function sha(value: unknown): string {
  const data = typeof value === "string" ? value : JSON.stringify(value);
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

export function fileSha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

/** Copy a file or a directory tree, creating the destination's parents. */
export function copyInto(src: string, dst: string): void {
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
}

export const stripAnsi = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, "");

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  /** Pass the child's output straight to the terminal (long steps such as the render). */
  stream?: boolean;
  allowFail?: boolean;
}

const quote = (cmd: string, args: string[]): string =>
  [cmd, ...args].map((a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a)).join(" ");

function failure(cmd: string, args: string[], res: RunResult): BuildError {
  const tail = stripAnsi(res.stderr || res.stdout).trim().split("\n").slice(-25).join("\n");
  return new BuildError(`команда завершилась с кодом ${res.status}: ${quote(cmd, args)}\n${tail}`);
}

export function run(cmd: string, args: string[], opts: RunOptions = {}): RunResult {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    encoding: "utf8",
    maxBuffer: 1 << 29,
    stdio: opts.stream ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
  });
  const res: RunResult = {
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: (r.stderr ?? "") + (r.error ? String(r.error) : ""),
  };
  if (res.status !== 0 && !opts.allowFail) throw failure(cmd, args, res);
  return res;
}

export function runAsync(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((done, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      const res: RunResult = { status: code ?? 1, stdout, stderr };
      if (res.status !== 0 && !opts.allowFail) reject(failure(cmd, args, res));
      else done(res);
    });
  });
}

/** Map over items with at most `limit` promises running at once; results keep input order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** The pinned local HyperFrames CLI — the same binary `npx hyperframes` resolves inside the repo. */
export function hyperframesBin(): string {
  const bin = join(ROOT_DIR, "node_modules", ".bin", process.platform === "win32" ? "hyperframes.cmd" : "hyperframes");
  if (!existsSync(bin)) fail("HyperFrames не установлен: выполните npm ci в корне репозитория");
  return bin;
}

/** `.env` in the repo root (never committed): KEY=value lines, `#` comments; the process environment wins. */
export function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const path = join(ROOT_DIR, ".env");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trimStart().startsWith("#")) out[m[1] as string] = (m[2] as string).replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  for (const key of Object.keys(out)) if (process.env[key] !== undefined) out[key] = process.env[key] as string;
  for (const key of ["VOICE_PROVIDER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_MODEL", "ELEVENLABS_LIVE", "PEXELS_API_KEY"]) {
    if (out[key] === undefined && process.env[key] !== undefined) out[key] = process.env[key] as string;
  }
  return out;
}

export const python = (): string => process.env.HYGEN_PYTHON ?? "python3";

export const pyScript = (name: string): string => join(ENGINE_DIR, "py", name);

export function lastJsonLine<T>(text: string): T {
  for (const line of text.trim().split("\n").reverse()) {
    const s = line.trim();
    if (s.startsWith("{") && s.endsWith("}")) return JSON.parse(s) as T;
  }
  fail(`в выводе нет строки JSON:\n${text.slice(-800)}`);
}

export const log = {
  info: (msg: string): void => console.log(`  ${msg}`),
  warn: (msg: string): void => console.log(`  ⚠ ${msg}`),
};

export class Timer {
  readonly steps: { name: string; seconds: number }[] = [];
  private readonly started = Date.now();

  async step<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    const t0 = Date.now();
    console.log(`\n▸ ${name}`);
    const result = await fn();
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    this.steps.push({ name, seconds });
    console.log(`  ✓ ${seconds.toFixed(1)} с`);
    return result;
  }

  totalSeconds(): number {
    return Math.round((Date.now() - this.started) / 100) / 10;
  }
}
