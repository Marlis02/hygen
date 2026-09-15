import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { Field, Fields } from "../forms.tsx";
import { api, errText, go, slug, useApi } from "../lib/api.ts";
import { t } from "../lib/i18n.ts";
import type { Dict } from "../lib/i18n.ts";
import { toast } from "../lib/ui.tsx";

// «Новый ролик» (ROADMAP S3, блок 0.5): бриф с жанром и бюджетом озвучки. «Создать» только пишет на диск brief.json,
// скелет project.json (статус brief) и пустой media.json и открывает проект на вкладке «Диалоги». Больше ничего:
// ни диалога, ни исследования, ни поиска медиа, ни сборки — всё дальше по кнопкам пользователя.

export function NewVideoScreen(): JSX.Element {
  const { data: d, error: loadError } = useApi(() => api<Dict>("/api/director"), []);
  const [v] = useState<Dict>({ genre: "history", look: "director" });
  const [topic, setTopic] = useState("");
  const [id, setId] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (loadError) return <div class="banner err">{loadError}</div>;
  if (!d) return <div class="empty">{t("common.loading")}</div>;
  const seconds = v.seconds ?? d.config.short.targetSeconds;
  const budget = v.budgetChars ?? d.config.voice?.defaultBudgetChars ?? 3000;
  const create = async (): Promise<void> => {
    setError(null);
    if (!Number.isFinite(Number(budget)) || Number(budget) < 0) return setError(t("newvideo.budgetRequired"));
    setBusy(true);
    try {
      const r = await api("/api/brief", { body: { ...v, seconds, budgetChars: Number(budget), id: id.trim(), topic } });
      toast(t("newvideo.created", { id: r.brief.id }));
      go(`#/project/${r.brief.id}/dialogs`);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div class="header">
        <div>
          <h1>{t("newvideo.title")}</h1>
          <div class="sub">{t("newvideo.sub")}</div>
        </div>
      </div>
      <div class="hero" style="grid-template-columns: 1fr 1fr">
        <div class="panel">
          <h2 style="margin-bottom:12px">{t("newvideo.brief")}</h2>
          <div class="field wide">
            <label class="field-name">{t("newvideo.topic")}</label>
            <input
              placeholder={t("newvideo.topicPlaceholder")}
              value={topic}
              onInput={(e) => {
                const s = e.currentTarget.value;
                setTopic(s);
                if (!touched) setId(s ? `${slug(s).split("-").slice(0, 3).join("-")}-en` : "");
              }}
            />
          </div>
          <div class="field wide" style="margin-top:8px">
            <label class="field-name">{t("newvideo.id")}</label>
            <input
              placeholder="tunguska-en"
              value={id}
              onInput={(e) => {
                setTouched(true);
                setId(e.currentTarget.value);
              }}
            />
          </div>
          <Fields>
            <Field name="genre" def={{ type: "enum" }} value={v.genre} onChange={(x) => (v.genre = x)} options={d.genres as string[]} label={t("newvideo.genre")} />
            <Field name="look" def={{ type: "enum" }} value={v.look} onChange={(x) => (v.look = x ?? "director")} options={["director", ...(d.looks as string[])]} label={t("newvideo.look")} />
            <Field name="seconds" def={{ type: "number", min: 20, max: 59 }} value={seconds} onChange={(x) => (v.seconds = x)} label={t("newvideo.seconds")} />
            <Field name="budgetChars" def={{ type: "integer", min: 0, description: t("newvideo.budgetHint") }} value={budget} onChange={(x) => (v.budgetChars = x)} label={t("newvideo.budget")} />
            <Field name="wishes" def={{ type: "text" }} value={undefined} onChange={(x) => (v.wishes = x)} label={t("newvideo.wishes")} />
            <Field name="arc" def={{ type: "text" }} value={undefined} onChange={(x) => (v.arc = x)} label={t("newvideo.arc")} />
            <Field name="avoid" def={{ type: "text" }} value={undefined} onChange={(x) => (v.avoid = x)} label={t("newvideo.avoid")} />
            <Field name="mustShow" def={{ type: "text" }} value={undefined} onChange={(x) => (v.mustShow = x)} label={t("newvideo.mustShow")} />
          </Fields>
          <div class="muted small" style="margin:8px 0">
            {t("newvideo.lookHint")}
          </div>
          {error ? <div class="banner err">{error}</div> : null}
          <button class="btn primary" onClick={() => void create()} disabled={busy}>
            {t("newvideo.create")}
          </button>
        </div>
        <div class="panel stack">
          <h2>{t("newvideo.howTitle")}</h2>
          <div class="muted">{t("newvideo.how")}</div>
          <div class="muted small">{t("newvideo.genreHint")}</div>
        </div>
      </div>
    </>
  );
}
