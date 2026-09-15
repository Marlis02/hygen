import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

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
}

const jobs = new Map<string, Job>();
const children = new Map<string, ChildProcess>();
let seq = 0;
const MAX_LOG = 4000;

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
  const child = spawn(o.cmd, o.args, { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
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
  return true;
}

/** A running job of the same kind on the same project — two builds of one project must not overlap. */
export const runningJob = (kind: string, project?: string): Job | undefined => [...jobs.values()].find((j) => j.kind === kind && j.project === project && j.status === "running");
