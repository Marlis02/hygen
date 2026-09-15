import { createWriteStream, existsSync, readFileSync, statSync } from "node:fs";
import type { WriteStream } from "node:fs";
import { join } from "node:path";
import { checkGrammar } from "../engine/src/grammar.ts";
import { loadLook } from "../engine/src/look.ts";
import { loadSpec } from "../engine/src/spec.ts";
import { readLedger } from "../engine/src/lib/project.ts";
import { readJson } from "../engine/src/lib/util.ts";

// «Режиссёр» of a project (ROADMAP S1.1): projects/<id>/director.log keeps every director run as JSON lines — the
// stream-json of `claude -p` as it came, plus hygen events (start with the allowlist, denied, end). The journal reads it
// next to what the director left in the project: brief.json, research.md (Concept, Media), project.json (arc, beats),
// media.json, voice/usage.jsonl; grammar is checked live. A project without director.log was made by hand.

type Dict = Record<string, any>;

export const directorLogPath = (dir: string): string => join(dir, "director.log");

/**
 * Tools of `claude -p` started by the panel: npm scripts, reading the repository, writing only into this project, and
 * Wikipedia for the research step of /short. Everything else is refused by --permission-mode dontAsk and lands in director.log.
 */
export function directorAllowlist(id: string): string[] {
  return ["Bash(npm run *)", "Read(./**)", "Glob", "Grep", `Write(./projects/${id}/**)`, `Edit(./projects/${id}/**)`, "WebFetch(domain:en.wikipedia.org)", "TodoWrite"];
}

/** Settings of the user and of .claude/settings.local.json stay out: their allow rules would widen the list. */
export function directorArgs(id: string, prompt = `/short ${id}`): string[] {
  return ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--setting-sources", "project", "--strict-mcp-config", "--allowedTools", ...directorAllowlist(id)];
}

/**
 * The environment of claude started by the panel: the subscription login, not an API key, and none of the markers of a
 * Claude Code session the panel itself may run in (session id, messaging socket and token, child-session flag, effort) —
 * a login shell re-reads the person's own profile anyway.
 */
export function claudeEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(ANTHROPIC_API_KEY|CLAUDECODE|CLAUDE_CODE_\w+|CLAUDE_AGENT_SDK_\w+|CLAUDE_PID|CLAUDE_EFFORT)$/.test(k)) env[k] = v;
  return { ...env, ...extra };
}

const textOf = (content: unknown): string => (typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (typeof c === "string" ? c : String((c as Dict)?.text ?? ""))).join("\n") : "");

/** A refusal of Claude Code's permission check (not a failing command: those start with «Exit code»). */
const DENIED = /requested permissions|haven't granted|permission to use .* (?:has been|was) denied|denied by (?:the )?permission/i;

export function toolLabel(name: string | undefined, input: Dict | undefined): string {
  const i = input ?? {};
  const arg = i.command ?? i.file_path ?? i.url ?? i.pattern ?? i.path ?? i.skill ?? "";
  return `${name ?? "?"}${arg ? `: ${String(arg).replace(/\s+/g, " ").slice(0, 200)}` : ""}`;
}

/** One event of director.log → a readable line of the job log and the journal (null — nothing to show). */
export function readableLine(ev: Dict): string | null {
  if (ev.type === "hygen") {
    if (ev.subtype === "start") return `── ${ev.source === "transcript" ? `восстановлено из транскрипта Claude Code ${ev.session ?? ""}` : "запуск из панели"} · ${ev.at ?? ""} · ${ev.prompt ?? ""}`;
    if (ev.subtype === "denied") return `✗ отказано: ${toolLabel(ev.tool, ev.input)}`;
    if (ev.subtype === "end") return `── конец${ev.exitCode !== undefined && ev.exitCode !== null ? `, код ${ev.exitCode}` : ""} · ${ev.at ?? ""}`;
    if (ev.subtype === "stderr") return String(ev.text ?? "");
    return null;
  }
  if (ev.type === "assistant") {
    const parts = (ev.message?.content ?? []) as Dict[];
    return parts.map((c) => (c.type === "text" ? String(c.text).trim().split("\n")[0]?.slice(0, 240) : c.type === "tool_use" ? `▸ ${toolLabel(c.name, c.input)}` : "")).filter(Boolean).join("\n") || null;
  }
  if (ev.type === "result") return `${ev.is_error ? "✗" : "✓"} итог: ${String(ev.result ?? "").split("\n")[0]?.slice(0, 300)} · ${Math.round((ev.duration_ms ?? 0) / 1000)} с${ev.total_cost_usd ? ` · $${Number(ev.total_cost_usd).toFixed(2)}` : ""}`;
  if (ev.type === "system" && ev.subtype === "init") return `claude: модель ${ev.model ?? "?"}, режим ${ev.permissionMode ?? "?"}, инструментов ${(ev.tools ?? []).length}`;
  return null;
}

/** Writes a live `claude -p` run into director.log and turns its stream-json into readable lines for the job log. */
export class DirectorRecorder {
  private readonly out: WriteStream;
  private readonly tools = new Map<string, { name: string; input: Dict }>();
  private readonly denied = new Set<string>();

  constructor(dir: string, meta: Dict) {
    this.out = createWriteStream(directorLogPath(dir), { flags: "a" });
    this.write({ type: "hygen", subtype: "start", at: new Date().toISOString(), source: "studio", ...meta });
  }

  private write(ev: Dict): void {
    this.out.write(`${JSON.stringify(ev)}\n`);
  }

  private deny(toolUseId: string | undefined, tool: string | undefined, input: Dict | undefined, message: string): string {
    if (toolUseId) this.denied.add(toolUseId);
    this.write({ type: "hygen", subtype: "denied", at: new Date().toISOString(), toolUseId, tool, input, message: message.slice(0, 400) });
    return `✗ отказано: ${toolLabel(tool, input)}`;
  }

  line(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;
    let ev: Dict;
    try {
      ev = JSON.parse(s) as Dict;
    } catch {
      this.write({ type: "hygen", subtype: "stderr", at: new Date().toISOString(), text: s.slice(0, 2000) });
      return s;
    }
    this.out.write(`${s}\n`);
    const extra: string[] = [];
    if (ev.type === "assistant") for (const c of (ev.message?.content ?? []) as Dict[]) if (c.type === "tool_use") this.tools.set(c.id, { name: c.name, input: c.input ?? {} });
    if (ev.type === "user") {
      for (const c of (ev.message?.content ?? []) as Dict[]) {
        const text = textOf(c.content);
        if (c.type === "tool_result" && c.is_error && !text.startsWith("Exit code") && DENIED.test(text) && !this.denied.has(c.tool_use_id)) {
          const tool = this.tools.get(c.tool_use_id);
          extra.push(this.deny(c.tool_use_id, tool?.name, tool?.input, text));
        }
      }
    }
    if (ev.type === "result") for (const d of (ev.permission_denials ?? []) as Dict[]) if (!this.denied.has(d.tool_use_id)) extra.push(this.deny(d.tool_use_id, d.tool_name, d.tool_input, "permission_denials"));
    return [readableLine(ev), ...extra].filter(Boolean).join("\n") || null;
  }

  end(exitCode: number | undefined): void {
    this.write({ type: "hygen", subtype: "end", at: new Date().toISOString(), exitCode: exitCode ?? null });
    this.out.end();
  }
}

export interface DirectorRun {
  source: "studio" | "transcript";
  prompt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  session: string | null;
  model: string | null;
  exitCode: number | null;
  result: string | null;
  durationMs: number | null;
  turns: number;
  cost: number | null;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  tools: Record<string, number>;
  searches: string[];
  gets: { ref: string; as: string | null; role: string | null; ok: boolean | null }[];
  denied: { tool: string; at: string | null }[];
  allowedTools: string[] | null;
}

/** npm run media commands of a Bash call: searches (the queries) and downloads (what was taken, as what, in which role). */
function mediaCommands(command: string, run: DirectorRun, toolUseId: string, gets: Map<string, DirectorRun["gets"][number]>): void {
  for (const m of command.matchAll(/npm run media --\s+(["'])(.+?)\1/g)) {
    // a search in a shell loop (for q in "a" "b"; do npm run media -- "$q") — the queries are the words of the loop
    const name = /^\$\{?(\w+)\}?$/.exec(m[2] as string)?.[1];
    const loop = name ? new RegExp(`for\\s+${name}\\s+in\\s+((?:(?:"[^"]*"|'[^']*')\\s*)+)[;\\n]`).exec(command)?.[1] : undefined;
    const queries = name ? [...(loop ?? "").matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => (x[1] ?? x[2]) as string) : [m[2] as string];
    for (const q of queries) if (q && !run.searches.includes(q)) run.searches.push(q);
  }
  for (const m of command.matchAll(/--get\s+(["'])(.+?)\1\s+(\S+)([^;&|\n]*)/g)) {
    const rest = m[4] ?? "";
    const get = { ref: m[2] as string, as: /--as\s+(\S+)/.exec(rest)?.[1] ?? null, role: /--role\s+(\S+)/.exec(rest)?.[1] ?? null, ok: null };
    const same = run.gets.find((g) => g.ref === get.ref && g.as === get.as);
    if (same) gets.set(toolUseId, same);
    else {
      run.gets.push(get);
      gets.set(toolUseId, get);
    }
  }
}

export function readDirectorLog(dir: string): { runs: DirectorRun[]; lines: string[]; bytes: number } {
  const file = directorLogPath(dir);
  if (!existsSync(file)) return { runs: [], lines: [], bytes: 0 };
  const runs: DirectorRun[] = [];
  const lines: string[] = [];
  let run: DirectorRun | null = null;
  let perMessage = new Map<string, Dict>();
  let gets = new Map<string, DirectorRun["gets"][number]>();
  const settle = (): void => {
    if (!run || !perMessage.size) return;
    const sum = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const u of perMessage.values()) {
      sum.input += Number(u.input_tokens ?? 0);
      sum.output += Number(u.output_tokens ?? 0);
      sum.cacheRead += Number(u.cache_read_input_tokens ?? 0);
      sum.cacheWrite += Number(u.cache_creation_input_tokens ?? 0);
    }
    for (const k of Object.keys(sum) as (keyof typeof sum)[]) run.tokens[k] = Math.max(run.tokens[k], sum[k]);
    run.turns = Math.max(run.turns, perMessage.size);
  };
  const open = (ev: Dict): DirectorRun => {
    settle();
    perMessage = new Map();
    gets = new Map();
    const r: DirectorRun = { source: ev.source === "transcript" ? "transcript" : "studio", prompt: ev.prompt ?? null, startedAt: ev.at ?? ev.timestamp ?? null, endedAt: null, session: ev.session ?? null, model: null, exitCode: null, result: null, durationMs: null, turns: 0, cost: null, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, tools: {}, searches: [], gets: [], denied: [], allowedTools: ev.allowedTools ?? null };
    runs.push(r);
    return r;
  };
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    let ev: Dict;
    try {
      ev = JSON.parse(raw) as Dict;
    } catch {
      lines.push(raw);
      continue;
    }
    if (ev.type === "hygen" && ev.subtype === "start") run = open(ev);
    const r = run ?? (run = open({ at: ev.timestamp ?? null }));
    if (ev.type === "system" && ev.subtype === "init") {
      r.model = ev.model ?? r.model;
      r.session = ev.session_id ?? r.session;
    }
    if (ev.type === "assistant") {
      const m = (ev.message ?? {}) as Dict;
      if (m.model) r.model = m.model;
      if (m.id && m.usage) {
        const prev = perMessage.get(m.id) ?? {};
        perMessage.set(m.id, Object.fromEntries(["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].map((k) => [k, Math.max(Number(prev[k] ?? 0), Number(m.usage[k] ?? 0))])));
      }
      for (const c of (m.content ?? []) as Dict[]) {
        if (c.type !== "tool_use") continue;
        r.tools[c.name] = (r.tools[c.name] ?? 0) + 1;
        if (c.name === "Bash") mediaCommands(String(c.input?.command ?? ""), r, c.id, gets);
      }
    }
    if (ev.type === "user") for (const c of (ev.message?.content ?? []) as Dict[]) if (c.type === "tool_result" && gets.has(c.tool_use_id)) (gets.get(c.tool_use_id) as DirectorRun["gets"][number]).ok = !c.is_error;
    if (ev.type === "hygen" && ev.subtype === "denied") r.denied.push({ tool: toolLabel(ev.tool, ev.input), at: ev.at ?? null });
    if (ev.type === "result") {
      r.durationMs = ev.duration_ms ?? r.durationMs;
      r.cost = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : r.cost;
      r.result = String(ev.result ?? "").slice(0, 600) || r.result;
      r.turns = Math.max(r.turns, Number(ev.num_turns ?? 0));
      if (ev.usage) {
        const u = ev.usage as Dict;
        r.tokens = { input: Math.max(r.tokens.input, Number(u.input_tokens ?? 0)), output: Math.max(r.tokens.output, Number(u.output_tokens ?? 0)), cacheRead: Math.max(r.tokens.cacheRead, Number(u.cache_read_input_tokens ?? 0)), cacheWrite: Math.max(r.tokens.cacheWrite, Number(u.cache_creation_input_tokens ?? 0)) };
      }
    }
    if (ev.type === "hygen" && ev.subtype === "end") {
      r.endedAt = ev.at ?? null;
      r.exitCode = ev.exitCode ?? null;
    }
    const text = readableLine(ev);
    if (text) lines.push(text);
  }
  settle();
  return { runs, lines, bytes: statSync(file).size };
}

/** «## <title>» of research.md up to the next «## ». */
function sectionOf(md: string | null, title: string): string | null {
  if (!md) return null;
  const lines = md.split("\n");
  const at = lines.findIndex((l) => new RegExp(`^##\\s+${title}\\s*$`, "i").test(l.trim()));
  if (at < 0) return null;
  const end = lines.findIndex((l, i) => i > at && /^##\s/.test(l));
  return lines.slice(at + 1, end < 0 ? undefined : end).join("\n").trim() || null;
}

const readOpt = <T>(path: string): T | null => {
  try {
    return existsSync(path) ? readJson<T>(path) : null;
  } catch {
    return null;
  }
};

export function directorJournal(dir: string, id: string): Dict {
  const { runs, lines, bytes } = readDirectorLog(dir);
  const research = existsSync(join(dir, "research.md")) ? readFileSync(join(dir, "research.md"), "utf8") : null;
  const spec = readJson<Dict>(join(dir, "project.json"));
  let grammar: Dict;
  try {
    const s = loadSpec(dir);
    const g = checkGrammar(s, loadLook(s.look), dir);
    grammar = { errors: g.errors, warnings: g.warnings, density: g.density };
  } catch (err) {
    grammar = { errors: [err instanceof Error ? err.message : String(err)], warnings: [], density: [] };
  }
  const usageFile = join(dir, "voice", "usage.jsonl");
  const takes = existsSync(usageFile)
    ? readFileSync(usageFile, "utf8").split("\n").filter(Boolean).flatMap((l) => {
        try {
          const u = JSON.parse(l) as Dict;
          return [{ label: String(u.label ?? ""), chars: Number(u.chars ?? 0), cost: u.characterCost ?? u.character_cost ?? null, at: u.at ?? null }];
        } catch {
          return [];
        }
      })
    : [];
  const sum = (k: keyof DirectorRun["tokens"]): number => runs.reduce((n, r) => n + r.tokens[k], 0);
  const ledger = readLedger(join(dir, "media.json"));
  return {
    manual: runs.length === 0,
    brief: readOpt(join(dir, "brief.json")),
    allowlist: directorAllowlist(id),
    command: `claude ${directorArgs(id).map((a) => (/[\s*()]/.test(a) ? `"${a}"` : a)).join(" ")}`,
    runs,
    tokens: { input: sum("input"), output: sum("output"), cacheRead: sum("cacheRead"), cacheWrite: sum("cacheWrite") },
    cost: runs.some((r) => r.cost !== null) ? runs.reduce((n, r) => n + (r.cost ?? 0), 0) : null,
    concept: sectionOf(research, "Concept") ?? (typeof spec.concept === "string" ? spec.concept : null),
    arc: spec.arc ?? null,
    look: typeof spec.look === "string" ? spec.look : spec.look?.id ?? spec.look?.extends ?? null,
    media: {
      section: sectionOf(research, "Media"),
      searches: [...new Set(runs.flatMap((r) => r.searches))],
      gets: runs.flatMap((r) => r.gets),
      records: Object.entries(ledger).map(([file, r]) => ({ file, role: r.role ?? null, title: r.title ?? "", license: r.license, author: r.author, source: r.source, url: r.url, notes: r.notes ?? "" })),
    },
    beats: ((spec.beats ?? []) as Dict[]).map((b) => ({ id: b.id, role: b.role ?? null, text: b.text, sees: b.sees ?? null, intent: b.intent ?? null, scene: b.scene ?? null, stage: b.stage?.type ?? null, devices: ((b.devices ?? []) as Dict[]).map((d) => (d.params?.mode ? `${d.type}:${d.params.mode}` : d.type)), dominant: b.dominant ?? null })),
    grammar,
    eleven: { takes: takes.length, chars: takes.reduce((n, x) => n + x.chars, 0), lines: takes },
    denied: runs.flatMap((r) => r.denied),
    log: lines.slice(-3000),
    logBytes: bytes,
  };
}

/**
 * A past run from a Claude Code transcript (~/.claude/projects/<repo>/<session>.jsonl) → director.log lines in the same
 * shape as a live run: text and tool calls of the assistant, tool results cut to 1 000 characters, usage per message,
 * a closing result with the summed usage. Used once for the runs made before director.log existed.
 */
export function logFromTranscript(transcript: string, note: string): string {
  const events: string[] = [];
  const usage = new Map<string, Dict>();
  let first: string | null = null;
  let last: string | null = null;
  let session: string | null = null;
  let prompt: string | null = null;
  for (const raw of readFileSync(transcript, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    let e: Dict;
    try {
      e = JSON.parse(raw) as Dict;
    } catch {
      continue;
    }
    if (e.type !== "user" && e.type !== "assistant") continue;
    const ts = (e.timestamp as string | undefined) ?? null;
    first ??= ts;
    if (ts) last = ts;
    session ??= e.sessionId ?? null;
    const m = (e.message ?? {}) as Dict;
    if (e.type === "assistant") {
      if (m.id && m.usage) {
        const prev = usage.get(m.id) ?? {};
        usage.set(m.id, Object.fromEntries(["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].map((k) => [k, Math.max(Number(prev[k] ?? 0), Number(m.usage[k] ?? 0))])));
      }
      const content = ((m.content ?? []) as Dict[]).filter((c) => c.type === "text" || c.type === "tool_use").map((c) => (c.type === "text" ? { type: "text", text: c.text } : { type: "tool_use", id: c.id, name: c.name, input: c.input }));
      if (content.length) events.push(JSON.stringify({ type: "assistant", timestamp: ts, message: { id: m.id, model: m.model, content, usage: usage.get(m.id) } }));
    } else if (typeof m.content === "string") {
      const cmd = /<command-name>([^<]+)<\/command-name>[\s\S]*?<command-args>([^<]*)<\/command-args>/.exec(m.content);
      prompt ??= cmd ? `${cmd[1]} ${cmd[2]}`.trim() : m.content.replace(/\s+/g, " ").slice(0, 200);
    } else {
      const results = ((m.content ?? []) as Dict[]).filter((c) => c.type === "tool_result").map((c) => ({ type: "tool_result", tool_use_id: c.tool_use_id, is_error: c.is_error === true, content: textOf(c.content).slice(0, 1000) }));
      if (results.length) events.push(JSON.stringify({ type: "user", timestamp: ts, message: { content: results } }));
    }
  }
  const total = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  for (const u of usage.values()) for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += Number(u[k] ?? 0);
  const ms = first && last ? Date.parse(last) - Date.parse(first) : null;
  return [
    JSON.stringify({ type: "hygen", subtype: "start", at: first, source: "transcript", session, prompt, note }),
    ...events,
    JSON.stringify({ type: "result", subtype: "success", source: "transcript", is_error: false, duration_ms: ms, num_turns: usage.size, usage: total, total_cost_usd: null, session_id: session, result: "восстановлено из транскрипта: стоимость в транскрипте не пишется" }),
    JSON.stringify({ type: "hygen", subtype: "end", at: last, exitCode: null }),
  ].join("\n") + "\n";
}
