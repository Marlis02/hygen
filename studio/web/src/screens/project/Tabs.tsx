import type { JSX } from "preact";
import { api, fmtDate } from "../../lib/api.ts";
import { t, tn } from "../../lib/i18n.ts";
import type { Dict } from "../../lib/i18n.ts";
import { confirmBox, copyText, fail, toast } from "../../lib/ui.tsx";
import type { ProjectCtx } from "../Project.tsx";
import { rollback } from "../Projects.tsx";

// Вкладки «Публикация», «Автопроверка», «История» проекта.

export function PublishTab({ ctx }: { ctx: ProjectCtx }): JSX.Element {
  const { id, data, reload } = ctx;
  const pub = data.publish;
  if (!pub) return <div class="empty panel">{t("publish.none")}</div>;
  const p = data.project;
  const markPublished = async (): Promise<void> => {
    if (!(await confirmBox(t("publish.markTitle"), t("publish.markText")))) return;
    try {
      await api(`/api/projects/${id}/status`, { body: { status: "published" } });
      toast(t("publish.marked"));
      await reload();
    } catch (err) {
      fail(err);
    }
  };
  const Line = ({ text }: { text: string }): JSX.Element => (
    <div class="copyline">
      <div class="txt">{text}</div>
      <button class="btn small" onClick={() => void copyText(text)}>
        {t("common.copy")}
      </button>
    </div>
  );
  return (
    <div class="hero">
      <div class="stack">
        {pub.thumbnail ? <img src={pub.thumbnail} style="width:100%;border-radius:10px" /> : null}
        <div class="row">
          {pub.thumbnail ? (
            <a class="btn" href={`${pub.thumbnail}&download=${id}-thumbnail.jpg`}>
              {t("publish.thumb")}
            </a>
          ) : null}
          {pub.srt ? (
            <a class="btn" href={`${pub.srt}&download=${id}.srt`}>
              {t("publish.srt")}
            </a>
          ) : null}
        </div>
      </div>
      <div class="stack">
        <div class="panel">
          <h3>{t("publish.titles")}</h3>
          {(pub.titles as string[]).map((x) => (
            <Line key={x} text={x} />
          ))}
        </div>
        <div class="panel">
          <div class="row between">
            <h3>{t("publish.description")}</h3>
            <button class="btn small" onClick={() => void copyText(pub.description)}>
              {t("common.copy")}
            </button>
          </div>
          <pre class="log" style="max-height:360px">
            {pub.description}
          </pre>
        </div>
        <div class="panel">
          <h3>{t("publish.tags")}</h3>
          <Line text={pub.tags} />
        </div>
        <div class="panel row between">
          {p.status === "published" ? <div>{t("publish.publishedAt", { d: p.publishedAt ?? "—" })}</div> : <div class="muted">{t("publish.notYet")}</div>}
          {p.status === "published" ? null : (
            <button class="btn primary" onClick={() => void markPublished()}>
              {t("publish.mark")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** verify.json → строка на проверку: зелёная, жёлтая (с предупреждениями) или красная, и что делать. */
export function VerifyTab({ ctx }: { ctx: ProjectCtx }): JSX.Element {
  const rep = ctx.data.renders.verify;
  if (!rep) return <div class="empty panel">{t("verify.none")}</div>;
  const human = tn("verify.checks") ?? {};
  return (
    <div class="panel checks">
      <div class="row between">
        <h2>{rep.ok ? t("verify.green") : t("verify.red")}</h2>
        <span class="muted small">{rep.mp4 ?? ""}</span>
      </div>
      {(rep.checks as Dict[]).map((c) => {
        const [main, warnPart] = String(c.detail).split(" · предупреждения: ");
        const warnings = warnPart ? warnPart.split(/;\s+/).filter(Boolean) : [];
        const light = !c.ok ? "red" : warnings.length ? "yellow" : "green";
        const info = human[c.check] ?? {};
        return (
          <div key={c.check} class="check">
            <div class={`light ${light}`} />
            <div>
              <b>{info.title ?? c.check}</b>
              <div class="small muted mono">{c.check}</div>
            </div>
            <div>
              <div>{main}</div>
              {warnings.length ? (
                <ul>
                  {warnings.map((w) => {
                    const m = /^([0-9][a-z0-9-]*)(?:\s*→\s*[0-9][a-z0-9-]*)?:\s*(.*)$/.exec(w);
                    return (
                      <li key={w}>
                        {m ? (
                          <>
                            <span class="chip">{m[1]}</span>
                            {m[2]}
                          </>
                        ) : (
                          w
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {light !== "green" ? <div class="fix">{`${t("verify.todo")}: ${light === "red" ? info.fix ?? t("verify.fixDefault") : info.warn ?? t("verify.warnDefault")}`}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HistoryTab({ ctx }: { ctx: ProjectCtx }): JSX.Element {
  const { id, data, reload } = ctx;
  if (!data.history.length) return <div class="empty panel">{t("history.none")}</div>;
  return (
    <div class="panel">
      <div class="muted" style="margin-bottom:10px">
        {t("history.about")}
      </div>
      <table class="plain">
        <tr>
          <th>{t("history.when")}</th>
          <th>{t("history.why")}</th>
          <th>{t("history.files")}</th>
          <th />
        </tr>
        {(data.history as Dict[]).map((e) => (
          <tr key={e.name}>
            <td class="mono">{e.at ? fmtDate(e.at) : e.name}</td>
            <td>{e.why || e.reason || "—"}</td>
            <td class="small muted">
              {(e.files as string[]).join(", ")}
              {e.sheet ? (
                <>
                  {" · "}
                  <a href={e.sheet} target="_blank">
                    {t("history.sheet")}
                  </a>
                </>
              ) : null}
            </td>
            <td>
              {e.canRollback ? (
                <button class="btn small" onClick={() => void rollback(id, e.name, () => void reload())}>
                  {t("history.rollback")}
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </table>
    </div>
  );
}
