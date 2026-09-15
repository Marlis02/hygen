import { LANGS, api, clear, fail, h, lang, mountJob, t, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { field, fields, group } from "../forms.ts";

// «Настройки»: hygen.config.json as a form; .env only as «set / not set» with dots — secrets are never shown or edited
// here; ElevenLabs spend against the budget; doctor with one button.

export async function settingsScreen(main: HTMLElement): Promise<void> {
  const s = await api("/api/settings");
  const cfg: Dict = structuredClone(s.config ?? {});
  const enums: Record<string, string[]> = { "voice.provider": ["kokoro", "elevenlabs"], look: s.looks, "bitrate.preset": ["ultrafast", "veryfast", "fast", "medium", "slow", "slower"] };
  const sectionForm = (key: string, obj: Dict): HTMLElement =>
    group(
      t(`settings.sections.${key}`),
      h("div", { class: "muted small", style: "margin-bottom:6px" }, t(`settings.about.${key}`)),
      fields(
        ...Object.entries(obj).map(([k, v]) =>
          field(k, { type: typeof v === "number" || v === null ? "number" : typeof v === "boolean" ? "boolean" : "string", default: v === "" ? undefined : (v as unknown) }, v === null ? undefined : v, (nv) => {
            obj[k] = nv === undefined ? (typeof v === "number" || v === null ? null : "") : nv;
          }, { options: enums[`${key}.${k}`], label: k }),
        ),
      ),
    );
  const top = Object.entries(cfg).filter(([k]) => k !== "about");
  const save = async (): Promise<void> => {
    try {
      await api("/api/settings", { method: "PUT", body: { config: cfg } });
      toast(t("settings.saved"));
    } catch (err) {
      fail(err);
    }
  };
  const b = s.budget;
  const doctorBox = h("div");
  const doctor = async (): Promise<void> => {
    try {
      const job = await api("/api/doctor", { method: "POST" });
      mountJob(doctorBox, job.id, (j) => toast(j.status === "ok" ? t("settings.doctorOk") : t("settings.doctorFail"), j.status === "ok" ? "ok" : "err"));
    } catch (err) {
      fail(err);
    }
  };
  clear(
    main,
    h("div", { class: "header" }, h("div", null, h("h1", null, t("settings.title")), h("div", { class: "sub" }, t("settings.sub"))), h("button", { class: "btn primary", onclick: save }, t("common.save"))),
    s.error ? h("div", { class: "banner err" }, s.error) : null,
    h(
      "div",
      { class: "hero", style: "grid-template-columns: 1fr 360px" },
      h("div", null, top.map(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? sectionForm(k, v as Dict) : group(k, fields(field(k, { type: "string" }, v, (nv) => (cfg[k] = nv), { options: enums[k] })))))),
      h(
        "div",
        { class: "stack" },
        langPanel(),
        h("div", { class: "panel" }, h("h3", null, t("settings.secrets")), h("div", { class: "muted small" }, t("settings.secretsAbout")), h("table", { class: "plain" }, (s.secrets as Dict[]).map((x) => h("tr", null, h("td", { class: "mono" }, x.key), h("td", { class: "secret" }, x.set ? "••••••••••" : ""), h("td", null, x.set ? h("span", { class: "pill pill-ok" }, t("settings.set")) : h("span", { class: "pill red" }, t("settings.unset")))))), s.extraEnv.length ? h("div", { class: "banner err" }, t("settings.extraEnv", { list: s.extraEnv.join(", ") })) : null),
        h("div", { class: "panel" }, h("h3", null, t("settings.budget")), b.budget === null ? h("div", null, t("settings.noBudget", { spent: b.spent })) : [h("div", { class: "row between" }, h("span", null, t("settings.spent", { spent: b.spent, budget: b.budget })), h("b", null, t("settings.left", { left: b.left }))), h("div", { class: "meter", style: "margin:8px 0" }, h("div", { style: `width:${Math.min(100, (100 * b.spent) / Math.max(1, b.budget))}%` }))], h("div", { class: "muted small" }, b.since ? t("settings.since", { d: new Date(b.since).toLocaleString(lang() === "en" ? "en-GB" : "ru-RU") }) : ""), h("table", { class: "plain", style: "margin-top:8px" }, h("tr", null, h("th", null, t("settings.project")), h("th", null, t("settings.takes")), h("th", null, t("settings.chars"))), (s.usage as Dict[]).filter((u) => u.takes).map((u) => h("tr", null, h("td", null, u.project), h("td", null, u.takes), h("td", null, u.chars))))),
        h("div", { class: "panel" }, h("div", { class: "row between" }, h("h3", null, "doctor"), h("button", { class: "btn", onclick: doctor }, t("settings.doctor"))), doctorBox),
      ),
    ),
  );
}

/** Language of the panel only: localStorage of this browser; videos, the engine and CLI messages stay as they are. */
function langPanel(): HTMLElement {
  const sel = h("select", null, LANGS.map((l) => h("option", { value: l, selected: l === lang() }, t(`settings.langs.${l}`))));
  sel.onchange = () => {
    try {
      localStorage.setItem("studio.lang", sel.value);
    } catch {
      // private mode: the language stays Russian
    }
    location.reload();
  };
  return h("div", { class: "panel" }, h("h3", null, t("settings.language")), h("div", { class: "muted small", style: "margin:4px 0 8px" }, t("settings.languageAbout")), sel);
}
