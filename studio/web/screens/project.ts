import { api, clear, confirmBox, copyText, fail, fmtDate, fmtSec, h, mountJob, statusPill, t, tn, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { beatsTab } from "./beats.ts";
import { assetsTab } from "./assets.ts";
import { rollback } from "./projects.ts";

const TABS = ["beats", "assets", "publish", "verify", "history"];

export async function projectScreen(main: HTMLElement, id: string, tab: string): Promise<void> {
  const [data, schema] = await Promise.all([api<Dict>(`/api/projects/${id}`), api<Dict>("/api/schema")]);
  const p = data.project;
  const reload = (): void => void projectScreen(main, id, tab).catch(fail);
  const jobBox = h("div");
  const runBuild = async (render: boolean): Promise<void> => {
    try {
      const job = await api(`/api/projects/${id}/build`, { body: { render } });
      mountJob(jobBox, job.id, (j) => {
        toast(j.status === "ok" ? t("build.done") : t("build.failed"), j.status === "ok" ? "ok" : "err");
        if (j.status === "ok") setTimeout(reload, 600);
      });
    } catch (err) {
      fail(err);
    }
  };
  const running = (data.jobs as Dict[]).find((j) => j.kind === "build" && j.status === "running");
  if (running) mountJob(jobBox, running.id, () => setTimeout(reload, 600));

  const verifyOk = data.renders.verify?.ok;
  const statusSel = h("select", { style: "width:auto" }, (schema.statuses as string[]).map((s) => h("option", { value: s, selected: s === (p.status ?? "draft") }, t(`status.${s}`))));
  statusSel.onchange = async () => {
    try {
      await api(`/api/projects/${id}/status`, { body: { status: statusSel.value } });
      toast(t("project.statusSaved"));
      reload();
    } catch (err) {
      fail(err);
    }
  };

  const counts: Dict = { beats: p.beats.length, assets: data.media.length, history: data.history.length };
  const body = h("div");
  clear(
    main,
    h("div", { class: "header" }, h("div", null, h("div", { class: "row" }, h("a", { href: "#/projects", class: "muted" }, `← ${t("nav.projects")}`)), h("h1", null, p.title), h("div", { class: "sub row" }, statusPill(p.status ?? "draft"), p.proof ? h("span", { class: "pill proof" }, "proof") : null, `${id} · look ${typeof p.look === "string" ? p.look : p.look?.id ?? p.look?.extends ?? "ember"} · ${data.card.voice} · ${fmtSec(data.renders.build?.duration_s)}`)), h("div", { class: "row" }, statusSel, h("button", { class: "btn", onclick: () => runBuild(false) }, t("build.noRender")), h("button", { class: "btn primary", onclick: () => runBuild(true) }, t("build.run")))),
    data.validation.ok ? null : h("div", { class: "banner err" }, h("b", null, t("project.invalid")), " ", data.validation.error),
    jobBox,
    h("div", { class: "hero" }, h("div", { class: "player" }, data.renders.mp4 ? h("video", { src: data.renders.mp4, controls: true, preload: "metadata", poster: data.publish?.thumbnail ?? undefined }) : h("div", { class: "empty panel" }, t("project.noMp4"))), h("div", { class: "stack" }, data.renders.contact ? h("div", { class: "contact" }, h("h3", null, t("project.contact")), h("img", { src: data.renders.contact, alt: "contact sheet" })) : h("div", { class: "panel muted" }, t("project.noContact")), h("div", { class: "row small muted" }, data.renders.build ? t("project.buildInfo", { s: data.renders.build.build_seconds, d: fmtDate(data.card.builtAt) }) : "", verifyOk === undefined ? "" : verifyOk ? h("span", { class: "pill pill-ok" }, t("verify.green")) : h("span", { class: "pill red" }, t("verify.red"))))),
    h("nav", { class: "tabs" }, TABS.map((k) => h("a", { href: `#/project/${id}/${k}`, class: k === tab ? "on" : "" }, t(`project.tabs.${k}`), counts[k] !== undefined ? h("span", { class: "count" }, counts[k]) : null))),
    body,
  );
  if (tab === "assets") body.appendChild(assetsTab(id, data, schema, reload));
  else if (tab === "publish") body.appendChild(publishTab(id, data, reload));
  else if (tab === "verify") body.appendChild(verifyTab(data));
  else if (tab === "history") body.appendChild(historyTab(id, data, reload));
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
    h("table", { class: "plain" }, h("tr", null, h("th", null, t("history.when")), h("th", null, t("history.reason")), h("th", null, t("history.files")), h("th", null, "")), (data.history as Dict[]).map((e) => h("tr", null, h("td", { class: "mono" }, e.at ? fmtDate(e.at) : e.name), h("td", null, e.reason || "—"), h("td", { class: "small muted" }, (e.files as string[]).join(", "), e.sheet ? [" · ", h("a", { href: e.sheet, target: "_blank" }, t("history.sheet"))] : null), h("td", null, e.canRollback ? h("button", { class: "btn small", onclick: () => rollback(id, e.name, reload) }, t("history.rollback")) : null)))),
  );
}
