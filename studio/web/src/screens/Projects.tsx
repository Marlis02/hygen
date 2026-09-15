import type { JSX } from "preact";
import { useMemo, useState } from "preact/hooks";
import { api, fmtDate, fmtSec, go, useApi } from "../lib/api.ts";
import { t } from "../lib/i18n.ts";
import type { Dict } from "../lib/i18n.ts";
import { debounce, useLive } from "../lib/live.ts";
import { StatusPill, confirmBox, fail, modal, toast } from "../lib/ui.tsx";

// «Проекты»: фильтры по типу, статусу, look, голосу и дате плюс поиск; выбор запоминается в браузере. Ничего не
// собирается само: у ролика без MP4 карточка говорит «не собран». Карточки с ключами — фильтр переставляет готовые
// узлы, событие с сервера меняет только изменившиеся строки, обложка не перезагружается.

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
export const STATUS_FILTERS = ["brief", "draft-kokoro", "final-elevenlabs", "published", "waiting-library"];

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
    // приватный режим: фильтры просто не переживут перезагрузку
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

export function ProjectsScreen(): JSX.Element {
  const { data, error, reload } = useApi(() => api<{ projects: Dict[] }>("/api/projects"), []);
  const [f, setF] = useState<Filters>(readFilters);
  const soon = useMemo(() => debounce(() => void reload(), 500), [reload]);
  useLive((msg) => {
    if (msg.type === "files" && Object.keys(msg.projects ?? {}).length) soon();
    // задача шлёт событие только на старте и на конце — метка «идёт сборка» появляется сразу, сетка не дёргается
    else if (msg.type === "job" || msg.type === "dialog-start" || msg.type === "dialog-exit") soon();
  });
  const set = (patch: Partial<Filters>): void => {
    const next = { ...f, ...patch };
    saveFilters(next);
    setF(next);
  };
  const [q, setQ] = useState(f.q);
  const search = useMemo(() => debounce((v: string) => setF((cur) => (saveFilters({ ...cur, q: v }), { ...cur, q: v })), 200), []);
  if (error) return <div class="banner err">{error}</div>;
  if (!data) return <div class="empty">{t("common.loading")}</div>;
  const list = applyFilters(data.projects, f);
  const looks = [...new Set(data.projects.map((p) => String(p.look)))].sort();
  const pick = (key: keyof Filters, options: { value: string; label: string }[]): JSX.Element => (
    <select style="width:auto" value={f[key]} onChange={(e) => set({ [key]: e.currentTarget.value })}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const opts = (key: string, values: string[]): { value: string; label: string }[] => values.map((v) => ({ value: v, label: t(`projects.filter.${key}.${v}`) }));
  return (
    <>
      <div class="header">
        <div>
          <h1>{t("projects.title")}</h1>
          <div class="sub">{t("projects.sub", { n: list.length, all: data.projects.length })}</div>
        </div>
        <div class="row">
          <a class="btn primary" href="#/new">
            {t("nav.new")}
          </a>
        </div>
      </div>
      <div class="filters">
        <input
          class="search"
          placeholder={t("projects.filter.search")}
          value={q}
          onInput={(e) => {
            setQ(e.currentTarget.value);
            search(e.currentTarget.value);
          }}
        />
        {pick("kind", opts("kind", ["videos", "proof", "all"]))}
        {pick("status", [{ value: "all", label: t("projects.filter.status.all") }, ...STATUS_FILTERS.map((s) => ({ value: s, label: t(`status.${s}`) })), { value: "unbuilt", label: t("projects.filter.status.unbuilt") }])}
        {pick("look", [{ value: "all", label: t("projects.filter.look.all") }, ...looks.map((l) => ({ value: l, label: l }))])}
        {pick("voice", opts("voice", ["all", "kokoro", "elevenlabs"]))}
        {pick("date", opts("date", ["all", "week", "month"]))}
        {pick("sort", opts("sort", ["changed", "built", "created"]))}
        <button
          class="btn small ghost"
          onClick={() => {
            saveFilters(DEFAULTS);
            setF({ ...DEFAULTS });
            setQ("");
          }}
        >
          {t("projects.filter.reset")}
        </button>
      </div>
      <div class="cards">{list.length ? list.map((p) => <ProjectCard key={p.id} p={p} reload={reload} />) : <div class="empty">{t("projects.emptyFiltered")}</div>}</div>
    </>
  );
}

function ProjectCard({ p, reload }: { p: Dict; reload: () => void }): JSX.Element {
  const open = (): void => go(`#/project/${p.id}/${p.status === "brief" ? "dialogs" : "beats"}`);
  return (
    <div class="card">
      <div class="thumb" style={p.thumb ? { backgroundImage: `url('${p.thumb}')` } : undefined} onClick={open}>
        <div class="badges">
          <StatusPill status={p.status} />
          {p.proof ? <span class="pill proof">proof</span> : null}
          {p.built || p.status === "brief" ? null : <span class="pill">{t("projects.notBuilt")}</span>}
          {p.dialog ? <span class="pill pill-running">{t("projects.dialog")}</span> : null}
          {p.mediaErrors ? <span class="pill red">{t("projects.mediaErrors", { n: p.mediaErrors })}</span> : null}
          {p.building ? <span class="pill pill-running">{t("projects.building")}</span> : null}
          {p.changed ? <span class="pill pill-changed">{t("editor.changed")}</span> : null}
        </div>
        {p.duration ? <div class="dur">{fmtSec(p.duration)}</div> : null}
      </div>
      <div class="body">
        <div class="title">{p.title}</div>
        <div class="meta">{`${p.id} · ${t("projects.beats", { n: p.beats })}`}</div>
        <div class="meta">{`${t("projects.voice")}: ${p.voice} · look: ${p.look}`}</div>
        <div class="meta">{p.publishedAt ? t("projects.publishedAt", { d: p.publishedAt }) : p.built ? t("projects.builtAt", { d: fmtDate(p.builtAt) }) : t("projects.notBuiltHere")}</div>
      </div>
      <div class="actions">
        <button class="btn small primary" onClick={open}>
          {t("projects.open")}
        </button>
        <button class="btn small" onClick={() => duplicate(p)}>
          {t("projects.duplicate")}
        </button>
        <button class="btn small ghost" onClick={() => go(`#/project/${p.id}/history`)}>
          {t("projects.history", { n: p.history })}
        </button>
        <button class="btn small danger ghost" onClick={() => removeProject(p, reload)}>
          {t("projects.delete")}
        </button>
      </div>
    </div>
  );
}

/** «Удалить проект»: имя вписывают руками — вместе с папкой уходят строка library/index.json и задачи панели. */
export function removeProject(p: Dict, after: () => void): void {
  let typed = "";
  modal(
    t("projects.deleteTitle", { id: p.id }),
    () => (
      <div class="stack">
        <div>{t("projects.deleteText", { id: p.id })}</div>
        <input placeholder={p.id} autoFocus onInput={(e) => (typed = e.currentTarget.value)} />
      </div>
    ),
    [
      { label: t("common.cancel") },
      {
        label: t("projects.delete"),
        kind: "danger",
        onClick: async () => {
          const r = await api(`/api/projects/${p.id}`, { method: "DELETE", body: { confirm: typed.trim() } });
          toast(t("projects.deleted", { id: r.removed }));
          if (location.hash.startsWith(`#/project/${p.id}`)) go("#/projects");
          else after();
        },
      },
    ],
  );
}

function duplicate(p: Dict): void {
  let name = `${String(p.id).replace(/-en$/, "")}-copy-en`;
  modal(
    t("projects.duplicateTitle", { id: p.id }),
    () => (
      <div class="stack">
        <div class="muted">{t("projects.duplicateHint")}</div>
        <input defaultValue={name} onInput={(e) => (name = e.currentTarget.value)} />
      </div>
    ),
    [
      { label: t("common.cancel") },
      {
        label: t("projects.duplicate"),
        kind: "primary",
        onClick: async () => {
          const r = await api(`/api/projects/${p.id}/duplicate`, { body: { id: name.trim() } });
          toast(t("projects.duplicated", { id: r.id }));
          go(`#/project/${r.id}/beats`);
        },
      },
    ],
  );
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
