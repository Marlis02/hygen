import { api, clear, fail, fmtBytes, fmtDate, fmtSec, go, h, mountJob, t, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { terminalPanel } from "../terminal.ts";

// «Режиссёр» of a project: the terminal of the panel (one shell for every project) and the journal of the director —
// brief, concept and arc, media searches and choices with licenses, intents per beat, grammar, ElevenLabs characters and
// Claude tokens, refusals of the allowlist, director.log. A project without director.log is marked «сделан вручную».

type Child = Node | string | null | false | undefined | Child[];

const panel = (title: string, wide: boolean, ...children: Child[]): HTMLElement => h("div", { class: `panel${wide ? " wide" : ""}` }, h("h3", null, title), ...children);

const kilo = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const tokenLine = (x: Dict): string => t("director.tokensLine", { input: kilo(x.input), output: kilo(x.output), read: kilo(x.cacheRead), write: kilo(x.cacheWrite) });

/** **bold** and `code` inside a line of research.md. */
function inline(text: string): Child[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map((part) => (part.startsWith("**") ? h("b", null, part.slice(2, -2)) : part.startsWith("`") ? h("code", null, part.slice(1, -1)) : part));
}

/** Paragraphs and pipe tables of research.md — enough for its Concept and Media sections. */
function md(text: string): HTMLElement {
  const box = h("div", { class: "md" });
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] as string).trim();
    if (!line) {
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] as string).trim().startsWith("|")) rows.push((lines[i++] as string).trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      box.appendChild(h("div", { class: "scroll" }, h("table", { class: "plain" }, h("tr", null, (body[0] ?? []).map((c) => h("th", null, inline(c)))), body.slice(1).map((r) => h("tr", null, r.map((c) => h("td", { class: "small" }, inline(c))))))));
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] as string).trim() && !(lines[i] as string).trim().startsWith("|")) para.push((lines[i++] as string).trim());
    box.appendChild(h("p", null, inline(para.join(" "))));
  }
  return box;
}

function runsTable(runs: Dict[]): HTMLElement {
  const cols = ["when", "source", "prompt", "model", "duration", "tokens", "cost", "denied"];
  return h(
    "div",
    { class: "scroll" },
    h(
      "table",
      { class: "plain" },
      h("tr", null, cols.map((c) => h("th", null, t(`director.cols.${c}`)))),
      runs.map((r) =>
        h(
          "tr",
          null,
          h("td", { class: "mono" }, fmtDate(r.startedAt)),
          h("td", { class: "small" }, t(`director.source.${r.source}`)),
          h("td", { class: "mono" }, r.prompt ?? "—"),
          h("td", { class: "small" }, r.model ?? "—"),
          h("td", null, r.durationMs ? fmtSec(r.durationMs / 1000) : "—"),
          h("td", { class: "small" }, tokenLine(r.tokens), " · ", t("director.turns", { n: r.turns })),
          h("td", null, r.cost === null ? "—" : `$${Number(r.cost).toFixed(2)}`),
          h("td", null, r.denied.length ? h("span", { class: "pill red" }, String(r.denied.length)) : "0"),
        ),
      ),
    ),
  );
}

function runPanel(id: string, j: Dict, reload: () => void): HTMLElement {
  const box = h("div");
  const run = async (): Promise<void> => {
    try {
      const job = await api("/api/director/run", { body: { id } });
      mountJob(box, job.id, (done) => {
        toast(done.status === "ok" ? t("newvideo.directorDone") : t("newvideo.directorFail"), done.status === "ok" ? "ok" : "err");
        reload();
      });
    } catch (err) {
      fail(err);
    }
  };
  if (j.job?.status === "running") requestAnimationFrame(() => mountJob(box, j.job.id, () => reload()));
  return h(
    "div",
    { class: "panel", style: "margin-bottom:16px" },
    h("div", { class: "row between" }, h("h2", null, t("director.journal")), j.brief && j.claude ? h("button", { class: "btn primary", onclick: run, disabled: j.job?.status === "running" }, t("director.run")) : null),
    j.manual ? h("div", { class: "banner info" }, t("director.manual")) : runsTable(j.runs),
    h(
      "details",
      { class: "small", style: "margin-top:10px" },
      h("summary", { class: "muted", style: "cursor:pointer" }, t("director.allowlist", { n: j.allowlist.length })),
      h("div", { class: "row", style: "margin:8px 0" }, (j.allowlist as string[]).map((a) => h("span", { class: "chip mono" }, a))),
      h("div", { class: "muted" }, t("director.allowlistAbout")),
      h("pre", { class: "log", style: "max-height:120px" }, j.command),
    ),
    box,
  );
}

function briefPanel(j: Dict): HTMLElement {
  const b = j.brief;
  if (!b) return panel(t("director.brief"), false, h("div", { class: "muted" }, t("director.noBrief")));
  const rows: [string, unknown][] = [["topic", b.topic], ["look", b.look ?? t("director.lookByDirector")], ["voice", b.voice], ["seconds", b.seconds], ["wishes", b.wishes || "—"], ["createdAt", fmtDate(b.createdAt)]];
  return panel(t("director.brief"), false, h("dl", { class: "kv" }, rows.map(([k, v]) => [h("dt", null, t(`director.briefFields.${k}`)), h("dd", null, String(v ?? "—"))])));
}

function conceptPanel(j: Dict): HTMLElement {
  const a = j.arc;
  return panel(
    t("director.concept"),
    false,
    a ? h("div", { class: "row", style: "margin-bottom:8px" }, ["structure", "hook", "protagonist", "ending"].map((k) => h("span", { class: "chip" }, `${k}: ${a[k] ?? "—"}`)), j.look ? h("span", { class: "chip" }, `look: ${j.look}`) : null) : null,
    a?.why ? h("div", { class: "muted", style: "margin-bottom:8px" }, a.why) : null,
    j.concept ? md(j.concept) : h("div", { class: "muted" }, t("director.noConcept")),
  );
}

function mediaPanel(j: Dict): HTMLElement {
  const m = j.media;
  return panel(
    t("director.media"),
    true,
    h("div", { class: "small muted" }, t("director.searches")),
    m.searches.length ? h("div", { class: "row", style: "margin:6px 0 10px" }, (m.searches as string[]).map((q) => h("span", { class: "chip" }, q))) : h("div", { class: "muted small", style: "margin:6px 0 10px" }, t("director.noSearches")),
    m.gets.length ? [h("div", { class: "small muted" }, t("director.gets")), h("ul", { class: "small" }, (m.gets as Dict[]).map((g) => h("li", null, h("span", { class: "mono" }, g.ref), ` → ${g.as ?? "—"}${g.role ? ` · ${g.role}` : ""}`, g.ok === false ? h("span", { class: "pill red", style: "margin-left:6px" }, t("director.getFailed")) : null)))] : null,
    m.section ? [h("div", { class: "small muted", style: "margin-top:8px" }, t("director.whyChosen")), md(m.section)] : null,
    h("div", { class: "small muted", style: "margin-top:8px" }, t("director.licenses")),
    h(
      "div",
      { class: "scroll" },
      h("table", { class: "plain" }, h("tr", null, ["file", "role", "license", "author", "source"].map((c) => h("th", null, t(`director.mediaCols.${c}`)))), (m.records as Dict[]).map((r) => h("tr", null, h("td", { class: "mono" }, r.file), h("td", null, r.role ?? "—"), h("td", null, r.license), h("td", { class: "small" }, r.author), h("td", { class: "small" }, r.url ? h("a", { href: r.url, target: "_blank", rel: "noreferrer" }, r.source || r.url) : r.source ?? "")))),
    ),
  );
}

function beatsPanel(j: Dict): HTMLElement {
  const cols = ["id", "role", "sees", "frame", "devices", "dominant"];
  return panel(
    t("director.beats"),
    true,
    h(
      "div",
      { class: "scroll" },
      h("table", { class: "plain" }, h("tr", null, cols.map((c) => h("th", null, t(`director.beatCols.${c}`)))), (j.beats as Dict[]).map((b) => h("tr", null, h("td", { class: "mono" }, b.id), h("td", { class: "small" }, b.role ?? "—"), h("td", { class: "small" }, b.sees ?? h("span", { class: "muted" }, b.text)), h("td", null, b.intent ? h("span", { class: "chip" }, `intent ${b.intent}`) : b.scene ? h("span", { class: "chip" }, `scene ${b.scene}`) : b.stage ? h("span", { class: "chip" }, `stage ${b.stage}`) : "—"), h("td", { class: "small" }, (b.devices as string[]).join(", ") || "—"), h("td", { class: "small" }, b.dominant === null ? "—" : String(b.dominant))))),
    ),
  );
}

function grammarPanel(j: Dict): HTMLElement {
  const g = j.grammar;
  return panel(
    t("director.grammar"),
    false,
    g.errors.length ? h("ul", { class: "errs" }, (g.errors as string[]).map((e) => h("li", null, e))) : h("div", { class: "pill pill-ok" }, t("director.grammarOk")),
    g.warnings.length ? h("ul", { class: "warns" }, (g.warnings as string[]).map((w) => h("li", null, w))) : null,
    g.density.length ? h("div", { class: "small muted", style: "margin-top:8px" }, `${t("director.density")}: ${(g.density as number[]).join(" · ")}`) : null,
  );
}

function spendPanel(j: Dict): HTMLElement {
  const e = j.eleven;
  const hasTokens = j.tokens.input + j.tokens.output + j.tokens.cacheRead + j.tokens.cacheWrite > 0;
  return panel(
    t("director.spend"),
    false,
    h("div", null, e.chars ? t("director.eleven", { takes: e.takes, chars: e.chars }) : t("director.noEleven")),
    e.lines.length ? h("details", { class: "small" }, h("summary", { class: "muted", style: "cursor:pointer" }, t("director.takes")), h("table", { class: "plain" }, (e.lines as Dict[]).map((x) => h("tr", null, h("td", { class: "mono" }, x.label), h("td", null, String(x.chars)), h("td", { class: "muted" }, fmtDate(x.at)))))) : null,
    h("div", { style: "margin-top:8px" }, hasTokens ? t("director.tokensTotal", { line: tokenLine(j.tokens) }) : t("director.noTokens")),
    j.cost !== null ? h("div", { class: "muted small" }, t("director.costTotal", { cost: Number(j.cost).toFixed(2) })) : null,
  );
}

function deniedPanel(j: Dict): HTMLElement {
  return panel(t("director.denied"), false, j.denied.length ? h("ul", { class: "errs" }, (j.denied as Dict[]).map((d) => h("li", null, h("span", { class: "mono" }, d.tool), d.at ? h("span", { class: "muted" }, ` · ${fmtDate(d.at)}`) : null))) : h("div", { class: "muted" }, t("director.noDenied")));
}

function logPanel(j: Dict): HTMLElement {
  if (!j.logBytes) return panel("director.log", true, h("div", { class: "muted" }, t("director.noLog")));
  return panel("director.log", true, h("details", null, h("summary", { class: "muted", style: "cursor:pointer" }, t("director.log", { n: j.log.length, size: fmtBytes(j.logBytes) })), h("pre", { class: "log", style: "max-height:520px" }, (j.log as string[]).join("\n"))));
}

export async function directorTab(id: string, reload: () => void): Promise<HTMLElement> {
  const j = await api<Dict>(`/api/projects/${encodeURIComponent(id)}/director`);
  return h("div", { class: "director" }, terminalPanel(id), runPanel(id, j, reload), h("div", { class: "journal" }, briefPanel(j), conceptPanel(j), mediaPanel(j), beatsPanel(j), grammarPanel(j), spendPanel(j), deniedPanel(j), logPanel(j)));
}

/** «Режиссёр» in the sidebar: the director tab of the last opened project, or the terminal with a project list. */
export async function directorHome(main: HTMLElement): Promise<void> {
  let last: string | null = null;
  try {
    last = localStorage.getItem("studio.lastProject");
  } catch {
    last = null;
  }
  const { projects } = await api<{ projects: Dict[] }>("/api/projects");
  if (last && projects.some((p) => p.id === last)) return go(`#/project/${last}/director`);
  clear(main, h("div", { class: "header" }, h("div", null, h("h1", null, t("director.title")), h("div", { class: "sub" }, t("director.homeSub")))), terminalPanel(null), h("div", { class: "row" }, projects.filter((p) => !p.proof).map((p) => h("a", { class: "btn", href: `#/project/${p.id}/director` }, p.title))));
}
