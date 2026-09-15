import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT_DIR } from "../engine/src/lib/util.ts";
import { broadcast } from "./events.ts";

// Long commands of the studio (build, preview, media download, doctor, director): one child process per job, its
// output kept in memory for the page to poll; a build job turns the `▸ step` lines of engine/src/build.ts into stages.

export type StageState = "wait" | "run" | "done" | "fail" | "skip";

export interface Job {
  id: string;
  kind: string;
  title: string;
  project?: string;
  status: "running" | "ok" | "fail" | "stopped";
  stages: { key: string; state: StageState }[];
  log: string[];
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  /** What the job produced (a file to show, a parsed result). */
  result?: Record<string, unknown>;
  note?: string;
}

interface JobOptions {
  kind: string;
  title: string;
  project?: string;
  cmd: string;
  args: string[];
  cwd: string;
  stages?: string[];
  stageOf?: (line: string) => string | null;
  /** Rewrite a raw output line before it is logged (null — drop it): the director's stream-json → readable lines. */
  transform?: (line: string) => string | null;
  onLine?: (line: string, job: Job) => void;
  onDone?: (job: Job) => void;
  note?: string;
  /** Environment of the child (default — the server's): claude runs without an API key of the server's environment. */
  env?: Record<string, string>;
}

const jobs = new Map<string, Job>();
const children = new Map<string, ChildProcess>();
let seq = 0;
const MAX_LOG = 4000;

/**
 * Задачи переживают перезапуск сервера (ROADMAP S2): .cache/jobs.json keeps the last runs, so reloading the page — or
 * restarting `npm run studio` — still shows the build that was going. A job that was running when the server died has
 * no child process any more: it is read back as «прервана перезапуском», never as running.
 */
const STORE = join(ROOT_DIR, ".cache", "studio", "jobs.json");
const KEEP = 40;
const SAVE_LOG = 400;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function save(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(STORE), { recursive: true });
      const list = [...jobs.values()].slice(-KEEP).map((j) => ({ ...j, log: j.log.slice(-SAVE_LOG) }));
      writeFileSync(STORE, JSON.stringify({ seq, jobs: list }, null, 1));
    } catch {
      // the panel works without the store
    }
  }, 300);
}

export function restoreJobs(): number {
  if (!existsSync(STORE)) return 0;
  try {
    const data = JSON.parse(readFileSync(STORE, "utf8")) as { seq?: number; jobs?: Job[] };
    for (const j of data.jobs ?? []) {
      if (j.status === "running") {
        j.status = "stopped";
        j.note = "прервана перезапуском панели";
        j.endedAt = j.endedAt ?? new Date().toISOString();
        for (const s of j.stages) if (s.state === "run") s.state = "fail";
      }
      jobs.set(j.id, j);
    }
    seq = Math.max(Number(data.seq ?? 0), ...[...jobs.keys()].map((id) => Number(id.split("-").pop()) || 0));
    return jobs.size;
  } catch {
    return 0;
  }
}

const strip = (s: string): string => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");

/** build.ts step titles → the six stages of the progress bar. */
export const BUILD_STAGES = ["voice", "timings", "composition", "render", "master", "verify"];

export function buildStageOf(line: string): string | null {
  const m = /^▸\s+(.*)$/.exec(line.trim());
  if (!m) return null;
  const s = (m[1] as string).toLowerCase();
  if (s.startsWith("голос")) return "voice";
  if (s.startsWith("тайминги")) return "timings";
  if (s.startsWith("рендер")) return "render";
  if (s.startsWith("мастеринг")) return "master";
  if (s.startsWith("публикация") || s.startsWith("автопроверка")) return "verify";
  return "composition";
}

export function startJob(o: JobOptions): Job {
  const id = `${o.kind}-${++seq}`;
  const job: Job = { id, kind: o.kind, title: o.title, project: o.project, status: "running", stages: (o.stages ?? []).map((key) => ({ key, state: "wait" })), log: [], startedAt: new Date().toISOString(), note: o.note };
  jobs.set(id, job);
  save();
  broadcast({ type: "job", job: { id, kind: job.kind, title: job.title, project: job.project, status: job.status, stages: job.stages, startedAt: job.startedAt } });
  const child = spawn(o.cmd, o.args, { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...(o.env ?? process.env), FORCE_COLOR: "0", NO_COLOR: "1" } });
  children.set(id, child);
  let tail = "";
  const feed = (chunk: Buffer): void => {
    tail += strip(chunk.toString());
    const lines = tail.split("\n");
    tail = lines.pop() ?? "";
    for (const line of lines) push(line);
  };
  const push = (raw: string): void => {
    const line = o.transform ? o.transform(raw) : raw;
    if (line === null) return;
    job.log.push(line);
    if (job.log.length > MAX_LOG) job.log.splice(0, job.log.length - MAX_LOG);
    const stage = o.stageOf?.(line);
    if (stage) {
      broadcast({ type: "job-stage", id, project: job.project, stage });
      const at = job.stages.findIndex((s) => s.key === stage);
      job.stages.forEach((s, i) => {
        if (i < at && (s.state === "run" || s.state === "wait")) s.state = s.state === "run" ? "done" : "skip";
      });
      if (at >= 0) job.stages[at]!.state = "run";
    }
    o.onLine?.(line, job);
  };
  child.stdout?.on("data", feed);
  child.stderr?.on("data", feed);
  child.on("error", (err) => push(`✗ ${err.message}`));
  child.on("close", (code) => {
    if (tail) push(tail);
    children.delete(id);
    job.exitCode = code ?? 1;
    job.endedAt = new Date().toISOString();
    if (job.status === "running") job.status = code === 0 ? "ok" : "fail";
    for (const s of job.stages) {
      if (s.state === "run") s.state = job.status === "ok" ? "done" : "fail";
      else if (s.state === "wait" && job.status === "ok") s.state = "skip";
    }
    try {
      o.onDone?.(job);
    } catch (err) {
      job.log.push(`✗ ${err instanceof Error ? err.message : String(err)}`);
    }
    save();
    broadcast({ type: "job", job: { id, kind: job.kind, title: job.title, project: job.project, status: job.status, stages: job.stages, startedAt: job.startedAt, endedAt: job.endedAt, result: job.result } });
  });
  return job;
}

export const getJob = (id: string): Job | undefined => jobs.get(id);

export function listJobs(project?: string): Job[] {
  return [...jobs.values()].filter((j) => !project || j.project === project).reverse();
}

export function stopJob(id: string): boolean {
  const child = children.get(id);
  const job = jobs.get(id);
  if (!child || !job) return false;
  job.status = "stopped";
  child.kill("SIGTERM");
  save();
  return true;
}

/** The jobs of a project the panel must forget — «Удалить проект» takes its builds with it. */
export function dropJobs(project: string): number {
  let n = 0;
  for (const [id, job] of [...jobs.entries()]) {
    if (job.project !== project) continue;
    if (job.status === "running") stopJob(id);
    jobs.delete(id);
    n++;
  }
  save();
  return n;
}

/** A running job of the same kind on the same project — two builds of one project must not overlap. */
export const runningJob = (kind: string, project?: string): Job | undefined => [...jobs.values()].find((j) => j.kind === kind && j.project === project && j.status === "running");
