import type { JSX } from "preact";
import { useMemo, useState } from "preact/hooks";
import { Field, Fields, Group } from "../forms.tsx";
import { api, useApi } from "../lib/api.ts";
import { LANGS, lang, t } from "../lib/i18n.ts";
import type { Dict } from "../lib/i18n.ts";
import { JobView, fail, toast } from "../lib/ui.tsx";

// «Настройки»: hygen.config.json формой; .env — только «задан / не задан» точками, секреты здесь не показываются
// и не редактируются; расход ElevenLabs по роликам; doctor одной кнопкой.

const PRESETS = ["ultrafast", "veryfast", "fast", "medium", "slow", "slower"];

export function SettingsScreen(): JSX.Element {
  const { data: s, error } = useApi(() => api("/api/settings"), []);
  // черновик конфига: поля неуправляемые и пишут сюда, «Сохранить» отправляет его целиком
  const cfg = useMemo<Dict>(() => structuredClone(s?.config ?? {}), [s]);
  const [doctorJob, setDoctorJob] = useState<string | null>(null);
  if (error) return <div class="banner err">{error}</div>;
  if (!s) return <div class="empty">{t("common.loading")}</div>;
  const enums: Record<string, string[] | undefined> = { "voice.provider": ["kokoro", "elevenlabs"], look: s.looks, "bitrate.preset": PRESETS };
  const top = Object.entries(cfg).filter(([k]) => k !== "about");
  const save = async (): Promise<void> => {
    try {
      await api("/api/settings", { method: "PUT", body: { config: cfg } });
      toast(t("settings.saved"));
    } catch (err) {
      fail(err);
    }
  };
  const doctor = async (): Promise<void> => {
    try {
      const job = await api("/api/doctor", { method: "POST" });
      setDoctorJob(job.id);
    } catch (err) {
      fail(err);
    }
  };
  return (
    <>
      <div class="header">
        <div>
          <h1>{t("settings.title")}</h1>
          <div class="sub">{t("settings.sub")}</div>
        </div>
        <button class="btn primary" onClick={() => void save()}>
          {t("common.save")}
        </button>
      </div>
      {s.error ? <div class="banner err">{s.error}</div> : null}
      <div class="hero" style="grid-template-columns: 1fr 360px">
        <div>
          {top.map(([k, v]) =>
            v && typeof v === "object" && !Array.isArray(v) ? (
              <SectionForm key={k} name={k} obj={v as Dict} enums={enums} />
            ) : (
              <Group key={k} title={k}>
                <Fields>
                  <Field name={k} def={{ type: "string" }} value={v} onChange={(nv) => (cfg[k] = nv)} options={enums[k]} />
                </Fields>
              </Group>
            ),
          )}
        </div>
        <div class="stack">
          <LangPanel />
          <div class="panel">
            <h3>{t("settings.secrets")}</h3>
            <div class="muted small">{t("settings.secretsAbout")}</div>
            <table class="plain">
              {(s.secrets as Dict[]).map((x) => (
                <tr key={x.key}>
                  <td class="mono">{x.key}</td>
                  <td class="secret">{x.set ? "••••••••••" : ""}</td>
                  <td>{x.set ? <span class="pill pill-ok">{t("settings.set")}</span> : <span class="pill red">{t("settings.unset")}</span>}</td>
                </tr>
              ))}
            </table>
            {s.extraEnv.length ? <div class="banner err">{t("settings.extraEnv", { list: s.extraEnv.join(", ") })}</div> : null}
          </div>
          {/* бюджет живёт у ролика (S2): здесь видно, сколько каждый потратил из своего */}
          <div class="panel">
            <h3>{t("settings.budget")}</h3>
            <div class="muted small">{t("settings.budgetAbout", { n: cfg.voice?.defaultBudgetChars ?? 0 })}</div>
            <table class="plain" style="margin-top:8px">
              <tr>
                <th>{t("settings.project")}</th>
                <th>{t("settings.takes")}</th>
                <th>{t("settings.chars")}</th>
                <th>{t("settings.leftCol")}</th>
              </tr>
              {(s.usage as Dict[])
                .filter((u) => u.spent)
                .map((u) => (
                  <tr key={u.project}>
                    <td>{u.project}</td>
                    <td>{u.takes}</td>
                    <td>{`${u.spent} / ${u.budget}`}</td>
                    <td>{u.left}</td>
                  </tr>
                ))}
            </table>
          </div>
          <div class="panel">
            <div class="row between">
              <h3>doctor</h3>
              <button class="btn" onClick={() => void doctor()}>
                {t("settings.doctor")}
              </button>
            </div>
            {doctorJob ? <JobView key={doctorJob} id={doctorJob} onDone={(j) => toast(j.status === "ok" ? t("settings.doctorOk") : t("settings.doctorFail"), j.status === "ok" ? "ok" : "err")} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}

/** Раздел конфига: тип поля — по текущему значению; пустое поле пишет null для чисел и "" для строк. */
function SectionForm({ name, obj, enums }: { name: string; obj: Dict; enums: Record<string, string[] | undefined> }): JSX.Element {
  return (
    <Group title={t(`settings.sections.${name}`)}>
      <div class="muted small" style="margin-bottom:6px">
        {t(`settings.about.${name}`)}
      </div>
      <Fields>
        {Object.entries(obj).map(([k, v]) => {
          const numeric = typeof v === "number" || v === null;
          return (
            <Field
              key={k}
              name={k}
              def={{ type: numeric ? "number" : typeof v === "boolean" ? "boolean" : "string", default: v === "" ? undefined : (v as unknown) }}
              value={v === null ? undefined : v}
              onChange={(nv) => {
                obj[k] = nv === undefined ? (numeric ? null : "") : nv;
              }}
              options={enums[`${name}.${k}`]}
              label={k}
            />
          );
        })}
      </Fields>
    </Group>
  );
}

/** Язык только панели: localStorage этого браузера; ролики, движок и сообщения CLI не меняются. */
function LangPanel(): JSX.Element {
  return (
    <div class="panel">
      <h3>{t("settings.language")}</h3>
      <div class="muted small" style="margin:4px 0 8px">
        {t("settings.languageAbout")}
      </div>
      <select
        onChange={(e) => {
          try {
            localStorage.setItem("studio.lang", e.currentTarget.value);
          } catch {
            // приватный режим: язык остаётся русским
          }
          location.reload();
        }}
      >
        {LANGS.map((l) => (
          <option key={l} value={l} selected={l === lang()}>
            {t(`settings.langs.${l}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
