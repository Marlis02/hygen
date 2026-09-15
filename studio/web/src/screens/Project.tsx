import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { api, errText, fmtDate, fmtSec, useApi } from "../lib/api.ts";
import { t } from "../lib/i18n.ts";
import type { Dict } from "../lib/i18n.ts";
import { debounce, useLive } from "../lib/live.ts";
import { JobView, StatusPill, confirmBox, fail, modal, toast } from "../lib/ui.tsx";
import { AssetsTab } from "./project/Assets.tsx";
import { BeatsTab } from "./project/Beats.tsx";
import { DialogsTab } from "./project/Dialogs.tsx";
import { EditorTab } from "./project/Editor.tsx";
import { HistoryTab, PublishTab, VerifyTab } from "./project/Tabs.tsx";

const TABS = ["beats", "editor", "assets", "dialogs", "publish", "verify", "history"];

/** Схема форм меняется только вместе с движком — одна на вкладку браузера. */
let schemaCache: Promise<Dict> | null = null;
export const loadSchema = (): Promise<Dict> => (schemaCache ??= api<Dict>("/api/schema").catch((err) => ((schemaCache = null), Promise.reject(err))));

export interface ProjectCtx {
  id: string;
  data: Dict;
  schema: Dict;
  reload: () => Promise<void>;
  /** Запустить сборку кнопкой: render — с MP4, иначе «Без рендера». */
  runBuild: (render: boolean) => Promise<void>;
}

export function ProjectScreen({ id, tab }: { id: string; tab: string }): JSX.Element {
  const { data, error, reload } = useApi(async () => {
    const [d, schema] = await Promise.all([api<Dict>(`/api/projects/${id}`), loadSchema()]);
    return { d, schema };
  }, [id]);
  const [jobId, setJobId] = useState<string | null>(null);
  /** Пока идёт сборка, экран не перечитываем по событиям файлов — у сборки свой прогресс. */
  const building = useRef(false);
  const soon = useMemo(() => debounce(() => void reload(), 800), [reload]);

  useEffect(() => {
    try {
      localStorage.setItem("studio.lastProject", id);
    } catch {
      // приватный режим
    }
  }, [id]);

  // сборка, начатая до перезагрузки страницы или в другой вкладке, продолжает показывать этапы
  useEffect(() => {
    const running = (data?.d.jobs as Dict[] | undefined)?.find((j) => j.kind === "build" && j.status === "running");
    if (running && !jobId) {
      building.current = true;
      setJobId(running.id);
    }
  }, [data]);

  /**
   * Экран перечитывается, только когда снаружи поменялись сценарий, медиа или их лицензии (режиссёр в диалоге, JSON
   * руками). Рендеры, кэши и журналы сюда не доходят, а во время сборки экран не трогаем вовсе.
   */
  useLive((msg) => {
    if (msg.type !== "files" || building.current) return;
    const files = ((msg.projects ?? {})[id] as string[] | undefined)?.filter((f) => f === "project.json" || f === "media.json" || f.startsWith("media/") || f === "brief.json" || f === "research.md");
    if (!files?.length) return;
    toast(t("project.changedOutside", { files: files.join(", ") }), "info");
    soon();
  });

  if (error) return <div class="banner err">{error}</div>;
  if (!data) return <div class="empty">{t("common.loading")}</div>;
  const { d, schema } = data;
  const p = d.project;

  // сборка финала с правленой репликой платная: сервер отвечает 409, панель сначала спрашивает
  const runBuild = async (render: boolean, confirm = false): Promise<void> => {
    try {
      const job = await api(`/api/projects/${id}/build`, { body: { render, confirm } });
      building.current = true;
      setJobId(job.id);
    } catch (err) {
      const text = errText(err);
      if (!confirm && /переозвуч/.test(text)) {
        if (await confirmBox(t("final.revoiceTitle"), text, t("build.run"))) await runBuild(render, true);
        return;
      }
      fail(err);
    }
  };
  const onJobDone = (j: Dict): void => {
    building.current = false;
    if (j.kind === "build" || j.stages?.length) toast(j.status === "ok" ? t("build.done") : t("build.failed"), j.status === "ok" ? "ok" : "err");
    if (j.status === "ok") setTimeout(() => void reload(), 600);
  };

  const ctx: ProjectCtx = { id, data: d, schema, reload, runBuild };
  const hasBeats = p.beats.length > 0;
  const verifyOk = d.renders.verify?.ok;
  const counts: Dict = { beats: p.beats.length, assets: d.media.length, history: d.history.length, dialogs: (d.dialogs as Dict[]).length };
  const look = typeof p.look === "string" ? p.look : p.look?.id ?? p.look?.extends ?? "ember";
  const showHero = hasBeats && tab !== "editor";

  return (
    <>
      <div class="header">
        <div>
          <div class="row">
            <a href="#/projects" class="muted">
              ← {t("nav.projects")}
            </a>
          </div>
          <h1>{p.title}</h1>
          <div class="sub row">
            <StatusPill status={d.card.status} />
            {p.proof ? <span class="pill proof">proof</span> : null}
            {d.card.changed ? <span class="pill pill-changed" title={t("editor.changedHint")}>{t("editor.changed")}</span> : null}
            {`${id} · look ${look} · ${d.card.voice} · ${fmtSec(d.renders.build?.duration_s)}`}
          </div>
        </div>
        <div class="row">
          <BudgetButton id={id} budget={d.budget} reload={reload} />
          <StatusSelect id={id} statuses={schema.statuses} status={d.card.status} reload={reload} />
          {hasBeats ? (
            <>
              {d.card.provider === "elevenlabs" ? (
                <button class="btn" onClick={() => void backToKokoro(id, reload)}>
                  {t("final.backToKokoro")}
                </button>
              ) : (
                <button class="btn" onClick={() => finalDialog(id, d, (job) => ((building.current = true), setJobId(job.id)), reload)}>
                  {t("final.button")}
                </button>
              )}
              <button class="btn" onClick={() => void runBuild(false)}>
                {t("build.noRender")}
              </button>
              <button class="btn primary" onClick={() => void runBuild(true)}>
                {t("build.run")}
              </button>
            </>
          ) : null}
        </div>
      </div>
      {d.validation.ok ? null : (
        <div class="banner err">
          <b>{t("project.invalid")}</b> {d.validation.error}
        </div>
      )}
      {jobId ? <JobView key={jobId} id={jobId} onDone={onJobDone} /> : null}
      {showHero ? (
        <div class="hero">
          <div class="player">
            {d.renders.mp4 ? (
              <video src={d.renders.mp4} controls preload="metadata" poster={d.publish?.thumbnail ?? undefined} />
            ) : (
              <div class="empty panel stack">
                <div>{t("project.notBuiltHere")}</div>
                <button class="btn primary" onClick={() => void runBuild(true)}>
                  {t("build.run")}
                </button>
              </div>
            )}
          </div>
          <div class="stack">
            {d.renders.contact ? (
              <div class="contact">
                <h3>{t("project.contact")}</h3>
                <img src={d.renders.contact} alt="contact sheet" />
              </div>
            ) : (
              <div class="panel muted">{t("project.noContact")}</div>
            )}
            <div class="row small muted">
              {d.renders.build ? t("project.buildInfo", { s: d.renders.build.build_seconds, d: fmtDate(d.card.builtAt) }) : ""}
              {verifyOk === undefined ? "" : verifyOk ? <span class="pill pill-ok">{t("verify.green")}</span> : <span class="pill red">{t("verify.red")}</span>}
            </div>
          </div>
        </div>
      ) : null}
      <nav class="tabs">
        {TABS.map((k) => (
          <a key={k} href={`#/project/${id}/${k}`} class={k === tab ? "on" : ""}>
            {t(`project.tabs.${k}`)}
            {counts[k] !== undefined ? <span class="count">{counts[k]}</span> : null}
          </a>
        ))}
      </nav>
      {tab === "assets" ? (
        <AssetsTab id={id} data={d} schema={schema} reload={() => void reload()} />
      ) : tab === "publish" ? (
        <PublishTab ctx={ctx} />
      ) : tab === "verify" ? (
        <VerifyTab ctx={ctx} />
      ) : tab === "history" ? (
        <HistoryTab ctx={ctx} />
      ) : tab === "dialogs" ? (
        <DialogsTab ctx={ctx} />
      ) : tab === "editor" ? (
        <EditorTab ctx={ctx} />
      ) : (
        <BeatsTab ctx={ctx} />
      )}
    </>
  );
}

function StatusSelect({ id, statuses, status, reload }: { id: string; statuses: string[]; status: string; reload: () => Promise<void> }): JSX.Element {
  return (
    <select
      style="width:auto"
      value={status}
      onChange={async (e) => {
        try {
          await api(`/api/projects/${id}/status`, { body: { status: e.currentTarget.value } });
          toast(t("project.statusSaved"));
          await reload();
        } catch (err) {
          fail(err);
        }
      }}
    >
      {statuses.map((s) => (
        <option key={s} value={s}>
          {t(`status.${s}`)}
        </option>
      ))}
    </select>
  );
}

/** Бюджет ElevenLabs этого ролика в шапке: видно всегда, меняется на месте. */
function BudgetButton({ id, budget: b, reload }: { id: string; budget: Dict; reload: () => Promise<void> }): JSX.Element {
  const open = (): void => {
    let value = String(b.budget);
    modal(
      t("final.budgetTitle"),
      () => (
        <div class="stack">
          <div class="muted">{t("final.budgetText", { spent: b.spent, takes: b.takes })}</div>
          <input type="number" min={0} step={100} defaultValue={value} onInput={(e) => (value = e.currentTarget.value)} />
        </div>
      ),
      [
        { label: t("common.cancel") },
        {
          label: t("common.save"),
          kind: "primary",
          onClick: async () => {
            await api(`/api/projects/${id}/budget`, { method: "PUT", body: { budgetChars: Number(value) } });
            toast(t("final.budgetSaved"));
            await reload();
          },
        },
      ],
    );
  };
  return (
    <button class="btn ghost" title={t("final.budgetHint")} onClick={open}>
      {t("final.budget", { left: b.left, budget: b.budget })}
    </button>
  );
}

/** «Финал на ElevenLabs»: сколько реплик, символов, что с бюджетом и какой станет длительность — до подтверждения. */
function finalDialog(id: string, d: Dict, follow: (job: Dict) => void, reload: () => Promise<void>): void {
  const f = d.final as Dict;
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
    () => (
      <div class="stack">
        {rows.map((r) => (
          <div key={r}>{r}</div>
        ))}
        {blocked ? <div class="banner err">{blocked}</div> : <div class="muted small">{t("final.hint")}</div>}
      </div>
    ),
    [
      { label: t("common.cancel") },
      {
        label: t("final.confirm"),
        kind: blocked ? "" : "primary",
        onClick: async () => {
          if (blocked) throw new Error(blocked);
          follow(await api(`/api/projects/${id}/final`, { body: { confirm: true } }));
          await reload();
        },
      },
    ],
  );
}

async function backToKokoro(id: string, reload: () => Promise<void>): Promise<void> {
  if (!(await confirmBox(t("final.backTitle"), t("final.backText"), t("final.backToKokoro")))) return;
  try {
    await api(`/api/projects/${id}/kokoro`, { method: "POST" });
    toast(t("final.backDone"));
    await reload();
  } catch (err) {
    fail(err);
  }
}
