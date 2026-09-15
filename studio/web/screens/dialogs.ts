import { api, clear, fail, fmtDate, go, h, statusPill, t } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { continueDialog, dialogPanel } from "../dialog.ts";
import { applyFilters, readFilters } from "./projects.ts";

// «Режиссёр» (ROADMAP S2): диалог всегда в контексте проекта. Пункт сайдбара показывает список проектов — выбрать
// существующий или «Новый ролик»; вкладка «Диалоги» проекта держит живой терминал и журналы прошлых диалогов.

/** Вкладка «Диалоги» проекта: живой диалог сверху, журналы прошлых — снизу. */
export function dialogsTab(id: string, data: Dict, reload: () => void): HTMLElement {
  const list = h("div");
  const draw = (rows: Dict[]): void => {
    clear(
      list,
      rows.length
        ? h(
            "div",
            { class: "panel" },
            h("div", { class: "row between" }, h("h3", null, t("dialog.past")), h("span", { class: "muted small" }, t("dialog.pastHint"))),
            h(
              "table",
              { class: "plain" },
              h("tr", null, h("th", null, t("dialog.when")), h("th", null, t("dialog.summary")), h("th", null, "")),
              rows.map((d) =>
                h(
                  "tr",
                  null,
                  h("td", { class: "mono" }, d.at ? fmtDate(d.at) : d.name),
                  h("td", null, d.running ? h("span", { class: "pill pill-running" }, t("dialog.running")) : String(d.summary || "—")),
                  h(
                    "td",
                    { class: "row" },
                    d.log ? h("a", { class: "btn small ghost", href: d.log, target: "_blank" }, t("dialog.journal")) : null,
                    d.sessionId && !d.running ? h("button", { class: "btn small", onclick: () => void continueDialog(id, String(d.sessionId)).then(reload, fail) }, t("dialog.continue")) : null,
                  ),
                ),
              ),
            ),
          )
        : h("div", { class: "empty panel" }, t("dialog.noneYet")),
    );
  };
  draw((data.dialogs as Dict[]) ?? []);
  return h(
    "div",
    { class: "stack" },
    dialogPanel(id, () => void api<Dict>(`/api/projects/${id}/dialog`).then((d) => draw((d.list as Dict[]) ?? []), () => undefined)),
    h("div", { class: "panel muted small" }, t("dialog.contextHint")),
    list,
  );
}

/** Пункт сайдбара «Режиссёр»: без проекта диалог не запускается — сначала выбрать ролик или завести новый. */
export async function directorHome(main: HTMLElement): Promise<void> {
  const [data, state] = await Promise.all([api<{ projects: Dict[] }>("/api/projects"), api<Dict>("/api/dialogs")]);
  const f = readFilters();
  const list = applyFilters(data.projects, f);
  const running = (state.running as Dict[]) ?? [];
  clear(
    main,
    h(
      "div",
      { class: "header" },
      h("div", null, h("h1", null, t("director.title")), h("div", { class: "sub" }, t("director.sub", { n: running.length, max: state.max }))),
      h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/new" }, t("nav.new"))),
    ),
    state.claude ? null : h("div", { class: "banner err" }, t("director.noClaude")),
    running.length
      ? h("div", { class: "panel" }, h("h3", null, t("director.live")), running.map((d) => h("div", { class: "row between" }, h("div", null, h("b", null, String(d.project)), " · ", t("dialog.since", { at: String(d.startedAt).slice(11, 16) })), h("a", { class: "btn small primary", href: `#/project/${d.project}/dialogs` }, t("director.goTo")))))
      : null,
    h("div", { class: "muted", style: "margin:10px 0" }, t("director.pick")),
    h(
      "div",
      { class: "cards" },
      list.length
        ? list.map((p) =>
            h(
              "div",
              { class: "card" },
              h("div", { class: "thumb", style: p.thumb ? `background-image:url('${p.thumb}')` : "", onclick: () => go(`#/project/${p.id}/dialogs`) }, h("div", { class: "badges" }, statusPill(p.status), p.dialog ? h("span", { class: "pill pill-running" }, t("projects.dialog")) : null)),
              h("div", { class: "body" }, h("div", { class: "title" }, p.title), h("div", { class: "meta" }, `${p.id}${p.topic ? ` · ${p.topic}` : ""}`)),
              h("div", { class: "actions" }, h("a", { class: "btn small primary", href: `#/project/${p.id}/dialogs` }, p.dialog ? t("dialog.focus") : t("dialog.open"))),
            ),
          )
        : h("div", { class: "empty" }, t("projects.emptyFiltered")),
    ),
  );
}
