import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { DialogPanel, continueDialog } from "../../dialog.tsx";
import { api, fmtDate } from "../../lib/api.ts";
import { t } from "../../lib/i18n.ts";
import type { Dict } from "../../lib/i18n.ts";
import { fail } from "../../lib/ui.tsx";
import type { ProjectCtx } from "../Project.tsx";

// Вкладка «Диалоги»: бриф проекта, живой терминал режиссёра (запускается только кнопкой) и журналы прошлых диалогов.

function BriefPanel({ brief, budget }: { brief: Dict; budget: Dict }): JSX.Element {
  const rows: [string, unknown][] = [
    [t("newvideo.topic"), brief.topic],
    [t("newvideo.genre"), brief.genre ? t(`genre.${brief.genre}`) : null],
    [t("newvideo.look"), brief.look ?? "director"],
    [t("newvideo.seconds"), brief.seconds],
    [t("newvideo.budget"), budget?.budget ?? brief.budgetChars],
    [t("newvideo.wishes"), brief.wishes],
    [t("newvideo.arc"), brief.arc],
    [t("newvideo.avoid"), brief.avoid],
    [t("newvideo.mustShow"), brief.mustShow],
  ];
  return (
    <div class="panel">
      <h3 style="margin-bottom:8px">{t("newvideo.brief")}</h3>
      <dl class="kv">
        {rows
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => (
            <>
              <dt key={`${k}-k`}>{k}</dt>
              <dd key={`${k}-v`}>{String(v)}</dd>
            </>
          ))}
      </dl>
    </div>
  );
}

export function DialogsTab({ ctx }: { ctx: ProjectCtx }): JSX.Element {
  const { id, data } = ctx;
  const [rows, setRows] = useState<Dict[]>((data.dialogs as Dict[]) ?? []);
  const fresh = !data.project.beats.length;
  return (
    <div class="stack">
      {data.brief ? <BriefPanel brief={data.brief} budget={data.budget} /> : null}
      {fresh ? <div class="panel muted">{t("dialog.briefHint", { command: `/short ${id}` })}</div> : null}
      <DialogPanel id={id} onChange={() => void api<Dict>(`/api/projects/${id}/dialog`).then((d) => setRows((d.list as Dict[]) ?? []), () => undefined)} />
      <div class="panel muted small">{t("dialog.contextHint")}</div>
      {rows.length ? (
        <div class="panel">
          <div class="row between">
            <h3>{t("dialog.past")}</h3>
            <span class="muted small">{t("dialog.pastHint")}</span>
          </div>
          <table class="plain">
            <tr>
              <th>{t("dialog.when")}</th>
              <th>{t("dialog.summary")}</th>
              <th />
            </tr>
            {rows.map((d) => (
              <tr key={d.name}>
                <td class="mono">{d.at ? fmtDate(d.at) : d.name}</td>
                <td>{d.running ? <span class="pill pill-running">{t("dialog.running")}</span> : String(d.summary || "—")}</td>
                <td class="row">
                  {d.log ? (
                    <a class="btn small ghost" href={d.log} target="_blank">
                      {t("dialog.journal")}
                    </a>
                  ) : null}
                  {d.sessionId && !d.running ? (
                    <button class="btn small" onClick={() => void continueDialog(id, String(d.sessionId)).catch(fail)}>
                      {t("dialog.continue")}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </table>
        </div>
      ) : (
        <div class="empty panel">{t("dialog.noneYet")}</div>
      )}
    </div>
  );
}
