import type { JSX } from "preact";
import { useMemo } from "preact/hooks";
import { stopDialogOf } from "../dialog.tsx";
import { api, go, useApi } from "../lib/api.ts";
import { t } from "../lib/i18n.ts";
import type { Dict } from "../lib/i18n.ts";
import { debounce, useLive } from "../lib/live.ts";
import { StatusPill } from "../lib/ui.tsx";
import { applyFilters, readFilters } from "./Projects.tsx";

// «Режиссёр»: диалог всегда в контексте проекта. Здесь — живые диалоги с «Завершить» (осиротевший терминал можно
// убить отсюда) и список проектов: выбрать существующий или «Новый ролик». Сам диалог здесь не запускается.

export function DirectorScreen(): JSX.Element {
  const { data, error, reload } = useApi(async () => {
    const [projects, state] = await Promise.all([api<{ projects: Dict[] }>("/api/projects"), api<Dict>("/api/dialogs")]);
    return { projects: projects.projects, state };
  }, []);
  const soon = useMemo(() => debounce(() => void reload(), 300), [reload]);
  useLive((msg) => {
    if (msg.type === "dialog-start" || msg.type === "dialog-exit") soon();
  });
  if (error) return <div class="banner err">{error}</div>;
  if (!data) return <div class="empty">{t("common.loading")}</div>;
  const list = applyFilters(data.projects, readFilters());
  const running = (data.state.running as Dict[]) ?? [];
  return (
    <>
      <div class="header">
        <div>
          <h1>{t("director.title")}</h1>
          <div class="sub">{t("director.sub", { n: running.length, max: data.state.max })}</div>
        </div>
        <div class="row">
          <a class="btn primary" href="#/new">
            {t("nav.new")}
          </a>
        </div>
      </div>
      {data.state.claude ? null : <div class="banner err">{t("director.noClaude")}</div>}
      {running.length ? (
        <div class="panel stack">
          <h3>{t("director.live")}</h3>
          {running.map((d) => (
            <div key={d.project} class="row between">
              <div>
                <span class="live-pulse" />
                <b>{String(d.project)}</b> · {t("dialog.since", { at: String(d.startedAt).slice(11, 16) })}
              </div>
              <div class="row">
                <a class="btn small primary" href={`#/project/${d.project}/dialogs`}>
                  {t("director.goTo")}
                </a>
                <button class="btn small danger" onClick={() => void stopDialogOf(String(d.project)).then((ok) => {
                    if (ok) void reload();
                  })}>
                  {t("dialog.stop")}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div class="muted" style="margin:10px 0">
        {t("director.pick")}
      </div>
      <div class="cards">
        {list.length ? (
          list.map((p) => (
            <div key={p.id} class="card">
              <div class="thumb" style={p.thumb ? { backgroundImage: `url('${p.thumb}')` } : undefined} onClick={() => go(`#/project/${p.id}/dialogs`)}>
                <div class="badges">
                  <StatusPill status={p.status} />
                  {p.dialog ? <span class="pill pill-running">{t("projects.dialog")}</span> : null}
                </div>
              </div>
              <div class="body">
                <div class="title">{p.title}</div>
                <div class="meta">{`${p.id}${p.topic ? ` · ${p.topic}` : ""}`}</div>
              </div>
              <div class="actions">
                <a class="btn small primary" href={`#/project/${p.id}/dialogs`}>
                  {p.dialog ? t("dialog.focus") : t("dialog.open")}
                </a>
              </div>
            </div>
          ))
        ) : (
          <div class="empty">{t("projects.emptyFiltered")}</div>
        )}
      </div>
    </>
  );
}
