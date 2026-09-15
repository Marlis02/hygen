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
  // карточка живёт, пока жив экран: фильтр переставляет её, а событие с сервера меняет только те строки,
  // которые изменились, — обложка не перезагружается и сетка не мигает
  const made = new Map<string, { el: HTMLElement; update: (p: Dict) => void }>();
  const cardFor = (p: Dict): HTMLElement => {
    let card = made.get(p.id as string);
    if (!card) {
      card = projectCard(p, () => reload());
      made.set(p.id as string, card);
    } else card.update(p);
    return card.el;
  };
  const draw = (): void => {
    const list = applyFilters(data.projects, f);
    count.textContent = t("projects.sub", { n: list.length, all: data.projects.length });
    grid.replaceChildren(...(list.length ? list.map(cardFor) : [h("div", { class: "empty" }, t("projects.emptyFiltered"))]));
  };
  const reload = debounce(async () => {
    if (!grid.isConnected) return;
    try {
      const next = (await api<{ projects: Dict[] }>("/api/projects")).projects;
      const ids = new Set(next.map((p) => String(p.id)));
      for (const id of [...made.keys()]) if (!ids.has(id)) made.delete(id);
      data.projects = next;
      draw();
    } catch {
      // the server may be restarting: the live channel will call again
    }
  }, 500);
  onLive((msg) => {
    if (msg.type === "files" && Object.keys(msg.projects ?? {}).length) reload();
    // задача шлёт событие только на старте и на конце (этапы идут отдельным типом) — метка «идёт сборка»
    // появляется сразу, но сетка не дёргается всю сборку
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

function projectCard(first: Dict, reload: () => void): { el: HTMLElement; update: (p: Dict) => void } {
  let p = first;
  const open = (): void => go(`#/project/${p.id}/beats`);
  const badges = h("div", { class: "badges" });
  const dur = h("div", { class: "dur" });
  const thumb = h("div", { class: "thumb", onclick: open }, badges, dur);
  const title = h("div", { class: "title" });
  const line1 = h("div", { class: "meta" });
  const line2 = h("div", { class: "meta" });
  const line3 = h("div", { class: "meta" });
  const history = h("button", { class: "btn small ghost", onclick: () => go(`#/project/${p.id}/history`) });
  const update = (next: Dict): void => {
    p = next;
    // обложку переставляем только когда она правда поменялась: иначе браузер перезагружает картинку и карточка мигает
    const bg = p.thumb ? `url('${p.thumb}')` : "";
    if (thumb.style.backgroundImage !== bg) thumb.style.backgroundImage = bg;
    clear(
      badges,
      statusPill(p.status),
      p.proof ? h("span", { class: "pill proof" }, "proof") : null,
      p.built ? null : h("span", { class: "pill" }, t("projects.notBuilt")),
      p.dialog ? h("span", { class: "pill pill-running" }, t("projects.dialog")) : null,
      p.mediaErrors ? h("span", { class: "pill red" }, t("projects.mediaErrors", { n: p.mediaErrors })) : null,
      p.building ? h("span", { class: "pill pill-running" }, t("projects.building")) : null,
    );
    dur.textContent = p.duration ? fmtSec(p.duration) : "";
    dur.hidden = !p.duration;
    title.textContent = String(p.title);
    line1.textContent = `${p.id} · ${t("projects.beats", { n: p.beats })}`;
    line2.textContent = `${t("projects.voice")}: ${p.voice} · look: ${p.look}`;
    line3.textContent = p.publishedAt ? t("projects.publishedAt", { d: p.publishedAt }) : p.built ? t("projects.builtAt", { d: fmtDate(p.builtAt) }) : t("projects.notBuiltHere");
    history.textContent = t("projects.history", { n: p.history });
  };
  update(first);
  const el = h(
    "div",
    { class: "card" },
    thumb,
    h("div", { class: "body" }, title, line1, line2, line3),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "btn small primary", onclick: open }, t("projects.open")),
      h("button", { class: "btn small", onclick: () => duplicate(p) }, t("projects.duplicate")),
      history,
      h("button", { class: "btn small danger ghost", onclick: () => removeProject(p, reload) }, t("projects.delete")),
    ),
  );
  return { el, update };
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
