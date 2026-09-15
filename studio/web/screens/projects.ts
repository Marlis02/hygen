import { api, clear, confirmBox, fail, fmtDate, fmtSec, go, h, modal, statusPill, t, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { debounce, onLive } from "../live.ts";

// Страница «Проекты» (ROADMAP S2): вместо галочки proof — фильтры по типу, статусу, look, голосу и дате плюс поиск
// по названию и теме. Выбор запоминается в браузере. Ничего не собирается само: у ролика без MP4 на этой машине
// карточка говорит «не собран» и предлагает кнопку.

export interface Filters {
  kind: string;
  status: string;
  look: string;
  voice: string;
  date: string;
  sort: string;
  q: string;
}

const DEFAULTS: Filters = { kind: "videos", status: "all", look: "all", voice: "all", date: "all", sort: "changed", q: "" };

export function readFilters(): Filters {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem("studio.filters") ?? "{}") as Partial<Filters>) };
  } catch {
    return { ...DEFAULTS };
  }
}

const saveFilters = (f: Filters): void => {
  try {
    localStorage.setItem("studio.filters", JSON.stringify(f));
  } catch {
    // private mode: filters just do not survive the reload
  }
};

const DAYS: Record<string, number> = { week: 7, month: 31 };

export function applyFilters(list: Dict[], f: Filters): Dict[] {
  const q = f.q.trim().toLowerCase();
  const since = DAYS[f.date] ? Date.now() - (DAYS[f.date] as number) * 86_400_000 : 0;
  const out = list.filter((p) => {
    if (f.kind === "videos" && p.proof) return false;
    if (f.kind === "proof" && !p.proof) return false;
    if (f.status === "unbuilt" ? p.built : f.status !== "all" && p.status !== f.status) return false;
    if (f.look !== "all" && p.look !== f.look) return false;
    if (f.voice !== "all" && p.provider !== f.voice) return false;
    if (since && Date.parse(p.builtAt ?? p.changedAt ?? p.createdAt ?? "") < since) return false;
    if (q && !`${p.title} ${p.id} ${p.topic ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const key = f.sort === "built" ? "builtAt" : f.sort === "created" ? "createdAt" : "changedAt";
  return out.sort((a, b) => String(b[key] ?? "").localeCompare(String(a[key] ?? "")));
}

export async function projectsScreen(main: HTMLElement): Promise<void> {
  const data = await api<{ projects: Dict[] }>("/api/projects");
  const f = readFilters();
  const grid = h("div", { class: "cards" });
  const count = h("div", { class: "sub" });
  const draw = (): void => {
    const list = applyFilters(data.projects, f);
    count.textContent = t("projects.sub", { n: list.length, all: data.projects.length });
    clear(grid, list.length ? list.map((p) => projectCard(p, reload)) : h("div", { class: "empty" }, t("projects.emptyFiltered")));
  };
  const reload = debounce(async () => {
    try {
      data.projects = (await api<{ projects: Dict[] }>("/api/projects")).projects;
      draw();
    } catch {
      // the server may be restarting: the live channel will call again
    }
  }, 300);
  onLive((msg) => {
    if (msg.type === "files" && Object.keys(msg.projects ?? {}).length) reload();
    else if (msg.type === "job" || msg.type === "dialog-start" || msg.type === "dialog-exit") reload();
  });

  const pick = (key: keyof Filters, options: { value: string; label: string }[]): HTMLElement => {
    const sel = h("select", { style: "width:auto" }, options.map((o) => h("option", { value: o.value, selected: o.value === f[key] }, o.label)));
    sel.onchange = () => {
      (f as Dict)[key] = sel.value;
      saveFilters(f);
      draw();
    };
    return sel;
  };
  const opts = (key: string, values: string[]): { value: string; label: string }[] => values.map((v) => ({ value: v, label: t(`projects.filter.${key}.${v}`) }));
  const looks = [...new Set(data.projects.map((p) => String(p.look)))].sort();
  const search = h("input", { class: "search", placeholder: t("projects.filter.search"), value: f.q });
  search.oninput = debounce(() => {
    f.q = search.value;
    saveFilters(f);
    draw();
  }, 200);
  const reset = h("button", { class: "btn small ghost", onclick: () => {
    Object.assign(f, DEFAULTS);
    saveFilters(f);
    go("#/projects");
    void projectsScreen(main);
  } }, t("projects.filter.reset"));

  clear(
    main,
    h("div", { class: "header" }, h("div", null, h("h1", null, t("projects.title")), count), h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/new" }, t("nav.new")))),
    h(
      "div",
      { class: "filters" },
      search,
      pick("kind", opts("kind", ["videos", "proof", "all"])),
      pick("status", [{ value: "all", label: t("projects.filter.status.all") }, ...["draft-kokoro", "final-elevenlabs", "published", "waiting-library"].map((s) => ({ value: s, label: t(`status.${s}`) })), { value: "unbuilt", label: t("projects.filter.status.unbuilt") }]),
      pick("look", [{ value: "all", label: t("projects.filter.look.all") }, ...looks.map((l) => ({ value: l, label: l }))]),
      pick("voice", opts("voice", ["all", "kokoro", "elevenlabs"])),
      pick("date", opts("date", ["all", "week", "month"])),
      pick("sort", opts("sort", ["changed", "built", "created"])),
      reset,
    ),
    grid,
  );
  draw();
}

function projectCard(p: Dict, reload: () => void): HTMLElement {
  const open = (): void => go(`#/project/${p.id}/beats`);
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "thumb", style: p.thumb ? `background-image:url('${p.thumb}')` : "", onclick: open },
      h(
        "div",
        { class: "badges" },
        statusPill(p.status),
        p.proof ? h("span", { class: "pill proof" }, "proof") : null,
        p.built ? null : h("span", { class: "pill" }, t("projects.notBuilt")),
        p.dialog ? h("span", { class: "pill pill-running" }, t("projects.dialog")) : null,
        p.mediaErrors ? h("span", { class: "pill red" }, t("projects.mediaErrors", { n: p.mediaErrors })) : null,
        p.building ? h("span", { class: "pill pill-running" }, t("projects.building")) : null,
      ),
      p.duration ? h("div", { class: "dur" }, fmtSec(p.duration)) : null,
    ),
    h(
      "div",
      { class: "body" },
      h("div", { class: "title" }, p.title),
      h("div", { class: "meta" }, `${p.id} · ${t("projects.beats", { n: p.beats })}`),
      h("div", { class: "meta" }, `${t("projects.voice")}: ${p.voice} · look: ${p.look}`),
      h("div", { class: "meta" }, p.publishedAt ? t("projects.publishedAt", { d: p.publishedAt }) : p.built ? t("projects.builtAt", { d: fmtDate(p.builtAt) }) : t("projects.notBuiltHere")),
    ),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "btn small primary", onclick: open }, t("projects.open")),
      h("button", { class: "btn small", onclick: () => duplicate(p) }, t("projects.duplicate")),
      h("button", { class: "btn small ghost", onclick: () => go(`#/project/${p.id}/history`) }, t("projects.history", { n: p.history })),
      h("button", { class: "btn small danger ghost", onclick: () => removeProject(p, reload) }, t("projects.delete")),
    ),
  );
}

/** «Удалить проект»: имя вписывают руками — вместе с папкой уходят строка library/index.json и задачи панели. */
export function removeProject(p: Dict, after: () => void): void {
  const inp = h("input", { placeholder: p.id });
  const box = modal(t("projects.deleteTitle", { id: p.id }), h("div", { class: "stack" }, h("div", null, t("projects.deleteText", { id: p.id })), inp), [
    { label: t("common.cancel") },
    {
      label: t("projects.delete"),
      kind: "danger",
      onClick: async () => {
        try {
          const r = await api(`/api/projects/${p.id}`, { method: "DELETE", body: { confirm: inp.value.trim() } });
          toast(t("projects.deleted", { id: r.removed }));
          if (location.hash.startsWith(`#/project/${p.id}`)) go("#/projects");
          else after();
        } catch (err) {
          fail(err);
          throw err;
        }
      },
    },
  ]);
  inp.focus();
  return void box;
}

function duplicate(p: Dict): void {
  const inp = h("input", { value: `${p.id.replace(/-en$/, "")}-copy-en` });
  modal(t("projects.duplicateTitle", { id: p.id }), h("div", { class: "stack" }, h("div", { class: "muted" }, t("projects.duplicateHint")), inp), [
    { label: t("common.cancel") },
    {
      label: t("projects.duplicate"),
      kind: "primary",
      onClick: async () => {
        const r = await api("/api/projects/" + p.id + "/duplicate", { body: { id: inp.value.trim() } });
        toast(t("projects.duplicated", { id: r.id }));
        go(`#/project/${r.id}/beats`);
      },
    },
  ]);
}

export async function rollback(projectId: string, name: string, after: () => void): Promise<void> {
  if (!(await confirmBox(t("history.rollbackTitle"), t("history.rollbackText", { name }), t("history.rollback")))) return;
  try {
    const r = await api(`/api/projects/${projectId}/history/${encodeURIComponent(name)}/rollback`, { method: "POST" });
    toast(t("history.rolledBack", { name, saved: r.saved ?? "—" }));
    after();
  } catch (err) {
    fail(err);
  }
}
