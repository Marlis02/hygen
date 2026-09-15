import { api, clear, confirmBox, copyText, fail, fmtDate, fmtSec, h, modal, mountJob, statusPill, t, tn, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { beatsTab, setReopenBeats } from "./beats.ts";
import { dialogsTab } from "./dialogs.ts";
import { assetsTab } from "./assets.ts";
import { removeProject, rollback } from "./projects.ts";
import { debounce, onLive } from "../live.ts";

const TABS = ["beats", "assets", "dialogs", "publish", "verify", "history"];

let unwatch: (() => void) | null = null;

/** Leaving the project screens: stop following its files. */
export function stopProjectWatch(): void {
  unwatch?.();
  unwatch = null;
}

/** Идёт ли сейчас сборка этого проекта: пока идёт, экран не перечитываем — у сборки свой прогресс. */
let building = false;

/**
 * Живая панель: экран перечитывается, только когда снаружи поменялись сам сценарий, медиа или их лицензии
 * (режиссёр в диалоге, редактор). Рендеры, кэши и журналы диалогов сюда не доходят, а во время сборки экран
 * не трогаем вовсе — иначе он мигал бы все семь минут.
 */
function watchProject(id: string, reload: () => void): void {
  stopProjectWatch();
  const soon = debounce(reload, 800);
  unwatch = onLive((msg) => {
    if (msg.type !== "files" || building) return;
    const files = ((msg.projects ?? {})[id] as string[] | undefined)?.filter((f) => f === "project.json" || f === "media.json" || f.startsWith("media/") || f === "brief.json" || f === "research.md");
    if (!files?.length) return;
    toast(t("project.changedOutside", { files: files.join(", ") }), "info");
    soon();
  });
}

/** Схема форм меняется только вместе с движком — держим её на экран, а не тянем при каждом перечитывании. */
let schemaCache: Promise<Dict> | null = null;
const loadSchema = (): Promise<Dict> => (schemaCache ??= api<Dict>("/api/schema"));

export async function projectScreen(main: HTMLElement, id: string, tab: string): Promise<void> {
  const [data, schema] = await Promise.all([api<Dict>(`/api/projects/${id}`), loadSchema()]);
  const p = data.project;
  // a reload keeps the open beat cards and the scroll: after a save, a build or a change of the files from outside
  const reload = (): void => {
    setReopenBeats([...main.querySelectorAll<HTMLElement>("details.beat[open]")].map((d) => d.dataset.beat ?? ""));
    const y = window.scrollY;
    projectScreen(main, id, tab).then(() => window.scrollTo(0, y), fail);
  };
  try {
    localStorage.setItem("studio.lastProject", id);
  } catch {
    // private mode: «Режиссёр» in the sidebar just opens the project list
  }
  watchProject(id, reload);
  const jobBox = h("div");
  const follow = (job: Dict): void => {
    building = true;
    mountJob(jobBox, job.id, (j) => {
      building = false;
      toast(j.status === "ok" ? t("build.done") : t("build.failed"), j.status === "ok" ? "ok" : "err");
      if (j.status === "ok") setTimeout(reload, 600);
    });
  };
  // a build of a final video whose line was edited would pay for it: the server answers 409 and the panel asks first
  const runBuild = async (render: boolean, confirm = false): Promise<void> => {
    try {
      follow(await api(`/api/projects/${id}/build`, { body: { render, confirm } }));
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (!confirm && /переозвуч/.test(text)) {
        if (await confirmBox(t("final.revoiceTitle"), text, t("build.run"))) await runBuild(render, true);
        return;
      }
      fail(err);
    }
  };
  // сборка, начатая до перезагрузки страницы или в другой вкладке, продолжает показывать этапы
  const running = (data.jobs as Dict[]).find((j) => j.kind === "build" && j.status === "running");
  building = Boolean(running);
  if (running)
    mountJob(jobBox, running.id, () => {
      building = false;
      setTimeout(reload, 600);
    });

  const verifyOk = data.renders.verify?.ok;
  const statusSel = h("select", { style: "width:auto" }, (schema.statuses as string[]).map((s) => h("option", { value: s, selected: s === data.card.status }, t(`status.${s}`))));
  statusSel.onchange = async () => {
    try {
      await api(`/api/projects/${id}/status`, { body: { status: statusSel.value } });
      toast(t("project.statusSaved"));
      reload();
    } catch (err) {
      fail(err);
    }
  };

  const counts: Dict = { beats: p.beats.length, assets: data.media.length, history: data.history.length, dialogs: (data.dialogs as Dict[]).length };
  const budgetBox = budgetPanel(id, data, reload);
  const voiceBtn = data.card.provider === "elevenlabs"
    ? h("button", { class: "btn", onclick: () => backToKokoro(id, reload) }, t("final.backToKokoro"))
    : h("button", { class: "btn", onclick: () => finalDialog(id, data, follow, reload) }, t("final.button"));
  const body = h("div");
  clear(
    main,
    h("div", { class: "header" }, h("div", null, h("div", { class: "row" }, h("a", { href: "#/projects", class: "muted" }, `← ${t("nav.projects")}`)), h("h1", null, p.title), h("div", { class: "sub row" }, statusPill(data.card.status), p.proof ? h("span", { class: "pill proof" }, "proof") : null, `${id} · look ${typeof p.look === "string" ? p.look : p.look?.id ?? p.look?.extends ?? "ember"} · ${data.card.voice} · ${fmtSec(data.renders.build?.duration_s)}`)), h("div", { class: "row" }, budgetBox, statusSel, voiceBtn, h("button", { class: "btn", onclick: () => runBuild(false) }, t("build.noRender")), h("button", { class: "btn primary", onclick: () => runBuild(true) }, t("build.run")))),
    data.validation.ok ? null : h("div", { class: "banner err" }, h("b", null, t("project.invalid")), " ", data.validation.error),
    jobBox,
    h("div", { class: "hero" }, h("div", { class: "player" }, data.renders.mp4 ? h("video", { src: data.renders.mp4, controls: true, preload: "metadata", poster: data.publish?.thumbnail ?? undefined }) : h("div", { class: "empty panel stack" }, h("div", null, t("project.notBuiltHere")), h("button", { class: "btn primary", onclick: () => runBuild(true) }, t("build.run")))), h("div", { class: "stack" }, data.renders.contact ? h("div", { class: "contact" }, h("h3", null, t("project.contact")), h("img", { src: data.renders.contact, alt: "contact sheet" })) : h("div", { class: "panel muted" }, t("project.noContact")), h("div", { class: "row small muted" }, data.renders.build ? t("project.buildInfo", { s: data.renders.build.build_seconds, d: fmtDate(data.card.builtAt) }) : "", verifyOk === undefined ? "" : verifyOk ? h("span", { class: "pill pill-ok" }, t("verify.green")) : h("span", { class: "pill red" }, t("verify.red"))))),
    h("nav", { class: "tabs" }, TABS.map((k) => h("a", { href: `#/project/${id}/${k}`, class: k === tab ? "on" : "" }, t(`project.tabs.${k}`), counts[k] !== undefined ? h("span", { class: "count" }, counts[k]) : null))),
    body,
  );
  if (tab === "assets") body.appendChild(assetsTab(id, data, schema, reload));
  else if (tab === "publish") body.appendChild(publishTab(id, data, reload));
  else if (tab === "verify") body.appendChild(verifyTab(data));
  else if (tab === "history") body.appendChild(historyTab(id, data, reload));
  else if (tab === "dialogs") body.appendChild(dialogsTab(id, data, reload));
  else body.appendChild(beatsTab(id, data, schema, reload));
}

function publishTab(id: string, data: Dict, reload: () => void): HTMLElement {
  const pub = data.publish;
  if (!pub) return h("div", { class: "empty panel" }, t("publish.none"));
  const p = data.project;
  const markPublished = async (): Promise<void> => {
    if (!(await confirmBox(t("publish.markTitle"), t("publish.markText")))) return;
    try {
      await api(`/api/projects/${id}/status`, { body: { status: "published" } });
      toast(t("publish.marked"));
      reload();
    } catch (err) {
      fail(err);
    }
  };
  const line = (text: string): HTMLElement => h("div", { class: "copyline" }, h("div", { class: "txt" }, text), h("button", { class: "btn small", onclick: () => copyText(text) }, t("common.copy")));
  return h(
    "div",
    { class: "hero" },
    h("div", { class: "stack" }, pub.thumbnail ? h("img", { src: pub.thumbnail, style: "width:100%;border-radius:10px" }) : null, h("div", { class: "row" }, pub.thumbnail ? h("a", { class: "btn", href: `${pub.thumbnail}&download=${id}-thumbnail.jpg` }, t("publish.thumb")) : null, pub.srt ? h("a", { class: "btn", href: `${pub.srt}&download=${id}.srt` }, t("publish.srt")) : null)),
    h(
      "div",
      { class: "stack" },
      h("div", { class: "panel" }, h("h3", null, t("publish.titles")), (pub.titles as string[]).map(line)),
      h("div", { class: "panel" }, h("div", { class: "row between" }, h("h3", null, t("publish.description")), h("button", { class: "btn small", onclick: () => copyText(pub.description) }, t("common.copy"))), h("pre", { class: "log", style: "max-height:360px" }, pub.description)),
      h("div", { class: "panel" }, h("h3", null, t("publish.tags")), line(pub.tags)),
      h("div", { class: "panel row between" }, p.status === "published" ? h("div", null, t("publish.publishedAt", { d: p.publishedAt ?? "—" })) : h("div", { class: "muted" }, t("publish.notYet")), p.status === "published" ? null : h("button", { class: "btn primary", onclick: markPublished }, t("publish.mark"))),
    ),
  );
}

/** verify.json → one line per check: green, yellow (passed with warnings) or red, and what to do. */
function verifyTab(data: Dict): HTMLElement {
  const rep = data.renders.verify;
  if (!rep) return h("div", { class: "empty panel" }, t("verify.none"));
  const human = tn("verify.checks") ?? {};
  const rows = (rep.checks as Dict[]).map((c) => {
    const [main, warnPart] = String(c.detail).split(" · предупреждения: ");
    const warnings = warnPart ? warnPart.split(/;\s+/).filter(Boolean) : [];
    const light = !c.ok ? "red" : warnings.length ? "yellow" : "green";
    const info = human[c.check] ?? {};
    return h(
      "div",
      { class: "check" },
      h("div", { class: `light ${light}` }),
      h("div", null, h("b", null, info.title ?? c.check), h("div", { class: "small muted mono" }, c.check)),
      h(
        "div",
        null,
        h("div", null, main),
        warnings.length
          ? h(
              "ul",
              null,
              warnings.map((w) => {
                const m = /^([0-9][a-z0-9-]*)(?:\s*→\s*[0-9][a-z0-9-]*)?:\s*(.*)$/.exec(w);
                return h("li", null, m ? [h("span", { class: "chip" }, m[1] as string), m[2] as string] : w);
              }),
            )
          : null,
        light !== "green" ? h("div", { class: "fix" }, `${t("verify.todo")}: ${light === "red" ? info.fix ?? t("verify.fixDefault") : info.warn ?? t("verify.warnDefault")}`) : null,
      ),
    );
  });
  return h("div", { class: "panel checks" }, h("div", { class: "row between" }, h("h2", null, rep.ok ? t("verify.green") : t("verify.red")), h("span", { class: "muted small" }, rep.mp4 ?? "")), rows);
}

function historyTab(id: string, data: Dict, reload: () => void): HTMLElement {
  if (!data.history.length) return h("div", { class: "empty panel" }, t("history.none"));
  return h(
    "div",
    { class: "panel" },
    h("div", { class: "muted", style: "margin-bottom:10px" }, t("history.about")),
    h("table", { class: "plain" }, h("tr", null, h("th", null, t("history.when")), h("th", null, t("history.why")), h("th", null, t("history.files")), h("th", null, "")), (data.history as Dict[]).map((e) => h("tr", null, h("td", { class: "mono" }, e.at ? fmtDate(e.at) : e.name), h("td", null, e.why || e.reason || "—"), h("td", { class: "small muted" }, (e.files as string[]).join(", "), e.sheet ? [" · ", h("a", { href: e.sheet, target: "_blank" }, t("history.sheet"))] : null), h("td", null, e.canRollback ? h("button", { class: "btn small", onclick: () => rollback(id, e.name, reload) }, t("history.rollback")) : null)))),
  );
}

/** Бюджет ElevenLabs этого ролика в шапке: видно всегда, меняется на месте. */
function budgetPanel(id: string, data: Dict, reload: () => void): HTMLElement {
  const b = data.budget as Dict;
  const box = h("button", { class: "btn ghost", title: t("final.budgetHint") }, t("final.budget", { left: b.left, budget: b.budget }));
  box.onclick = () => {
    const inp = h("input", { type: "number", min: 0, step: 100, value: String(b.budget) });
    modal(t("final.budgetTitle"), h("div", { class: "stack" }, h("div", { class: "muted" }, t("final.budgetText", { spent: b.spent, takes: b.takes })), inp), [
      { label: t("common.cancel") },
      {
        label: t("common.save"),
        kind: "primary",
        onClick: async () => {
          await api(`/api/projects/${id}/budget`, { method: "PUT", body: { budgetChars: Number(inp.value) } });
          toast(t("final.budgetSaved"));
          reload();
        },
      },
    ]);
  };
  return box;
}

/** «Финал на ElevenLabs»: сколько реплик, символов, что с бюджетом и какой станет длительность — до подтверждения. */
function finalDialog(id: string, data: Dict, follow: (job: Dict) => void, reload: () => void): void {
  const f = data.final as Dict;
  const delta = f.seconds && f.expectedSeconds ? (f.expectedSeconds - f.seconds).toFixed(1) : null;
  const rows = [
    t("final.lines", { n: (f.missing as Dict[]).length, all: (f.lines as Dict[]).length }),
    t("final.chars", { n: f.chars }),
    t("final.budgetLine", { left: (f.budget as Dict).left, budget: (f.budget as Dict).budget }),
    f.seconds ? t("final.duration", { was: f.seconds.toFixed(1), now: f.expectedSeconds.toFixed(1), delta }) : t("final.durationUnknown"),
  ];
  const blocked = !f.enough ? t("final.notEnough", { need: f.chars, budget: (f.budget as Dict).left }) : !f.key && (f.missing as Dict[]).length ? t("final.noKey") : null;
  modal(
    t("final.title"),
    h("div", { class: "stack" }, rows.map((r) => h("div", null, r)), blocked ? h("div", { class: "banner err" }, blocked) : h("div", { class: "muted small" }, t("final.hint"))),
    [
      { label: t("common.cancel") },
      {
        label: t("final.confirm"),
        kind: blocked ? "" : "primary",
        onClick: async () => {
          if (blocked) throw new Error(blocked);
          follow(await api(`/api/projects/${id}/final`, { body: { confirm: true } }));
          reload();
        },
      },
    ],
  );
}

async function backToKokoro(id: string, reload: () => void): Promise<void> {
  if (!(await confirmBox(t("final.backTitle"), t("final.backText"), t("final.backToKokoro")))) return;
  try {
    await api(`/api/projects/${id}/kokoro`, { method: "POST" });
    toast(t("final.backDone"));
    reload();
  } catch (err) {
    fail(err);
  }
}
