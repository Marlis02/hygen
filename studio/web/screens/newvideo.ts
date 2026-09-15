import { api, clear, copyText, fail, fmtDate, go, h, mountJob, slug, t, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { field, fields } from "../forms.ts";

// «Новый ролик»: the brief (projects/<id>/brief.json) → the director. When `claude -p` works here, «Создать» runs
// /short <id> and shows its steps; otherwise the page gives the command for Claude Code and waits for project.json.

export async function newVideoScreen(main: HTMLElement, existing?: string): Promise<void> {
  const d = await api("/api/director");
  const v: Dict = { look: "director", voice: d.config.voice.provider, seconds: d.config.short.targetSeconds };
  const idInput = h("input", { placeholder: "tunguska-en" });
  const topic = h("input", { placeholder: t("newvideo.topicPlaceholder") });
  topic.oninput = () => {
    if (!idInput.dataset.touched) idInput.value = topic.value ? `${slug(topic.value).split("-").slice(0, 3).join("-")}-en` : "";
  };
  idInput.oninput = () => (idInput.dataset.touched = "1");
  const after = h("div");
  const submit = async (): Promise<void> => {
    try {
      const r = await api("/api/brief", { body: { ...v, id: idInput.value.trim(), topic: topic.value } });
      toast(t("newvideo.briefSaved"));
      go(`#/new/${r.brief.id}`);
    } catch (err) {
      fail(err);
    }
  };
  clear(
    main,
    h("div", { class: "header" }, h("div", null, h("h1", null, t("newvideo.title")), h("div", { class: "sub" }, t("newvideo.sub")))),
    h(
      "div",
      { class: "hero", style: "grid-template-columns: 1fr 1fr" },
      h(
        "div",
        { class: "panel" },
        h("h2", { style: "margin-bottom:12px" }, t("newvideo.brief")),
        h("div", { class: "field wide" }, h("label", { class: "field-name" }, t("newvideo.topic")), topic),
        h("div", { class: "field wide", style: "margin-top:8px" }, h("label", { class: "field-name" }, t("newvideo.id")), idInput),
        fields(
          field("look", { type: "enum" }, v.look, (x) => (v.look = x ?? "director"), { options: ["director", ...d.looks], label: t("newvideo.look") }),
          field("voice", { type: "enum" }, v.voice, (x) => (v.voice = x), { options: ["kokoro", "elevenlabs"], label: t("newvideo.voice") }),
          field("seconds", { type: "number", min: 20, max: 59 }, v.seconds, (x) => (v.seconds = x), { label: t("newvideo.seconds") }),
          field("wishes", { type: "text" }, undefined, (x) => (v.wishes = x), { label: t("newvideo.wishes") }),
        ),
        h("div", { class: "muted small", style: "margin:8px 0" }, t("newvideo.lookHint")),
        h("button", { class: "btn primary", onclick: submit }, t("newvideo.saveBrief")),
      ),
      h("div", { class: "stack" }, directorPanel(d), after),
    ),
  );
  if (existing) await briefStatus(after, existing, d);
}

function directorPanel(d: Dict): HTMLElement {
  const box = h("div");
  const check = async (): Promise<void> => {
    try {
      const job = await api("/api/director/check", { method: "POST" });
      mountJob(box, job.id, (j) => {
        toast(j.result?.ok ? t("newvideo.claudeOk") : t("newvideo.claudeFail"), j.result?.ok ? "ok" : "err");
        setTimeout(() => location.reload(), 800);
      });
    } catch (err) {
      fail(err);
    }
  };
  const c = d.check;
  return h(
    "div",
    { class: "panel" },
    h("div", { class: "row between" }, h("h2", null, t("newvideo.director")), h("button", { class: "btn small", onclick: check, disabled: !d.claude }, t("newvideo.check"))),
    h("div", { class: "small", style: "margin:8px 0" }, d.claude ? t("newvideo.claudeFound", { path: d.claude }) : t("newvideo.claudeMissing")),
    c ? h("div", { class: `banner ${c.ok ? "ok" : "err"}` }, c.ok ? t("newvideo.checkOk", { d: fmtDate(c.at), s: Math.round((c.durationMs ?? 0) / 1000) }) : t("newvideo.checkFail", { d: fmtDate(c.at), e: c.error ?? "" })) : h("div", { class: "muted small" }, t("newvideo.notChecked")),
    box,
  );
}

async function briefStatus(box: HTMLElement, id: string, d: Dict): Promise<void> {
  const s = await api(`/api/brief/${id}`);
  const jobBox = h("div");
  const command = `claude "/short ${id}"`;
  const run = async (): Promise<void> => {
    try {
      const job = await api("/api/director/run", { body: { id } });
      mountJob(jobBox, job.id, (j) => {
        toast(j.status === "ok" ? t("newvideo.directorDone") : t("newvideo.directorFail"), j.status === "ok" ? "ok" : "err");
        void briefStatus(box, id, d);
      });
    } catch (err) {
      fail(err);
    }
  };
  const progress = h("div", { class: "row" }, h("span", { class: `pill ${s.research ? "pill-ok" : ""}` }, "research.md"), h("span", { class: `pill ${s.media ? "pill-ok" : ""}` }, t("newvideo.mediaCount", { n: s.media })), h("span", { class: `pill ${s.project ? "pill-ok" : ""}` }, "project.json"));
  clear(
    box,
    h(
      "div",
      { class: "panel stack" },
      h("h2", null, t("newvideo.briefOf", { id })),
      h("pre", { class: "log" }, JSON.stringify(s.brief, null, 2)),
      progress,
      s.project ? h("a", { class: "btn primary", href: `#/project/${id}/beats` }, t("newvideo.openProject")) : null,
      s.job?.status === "running" ? null : d.check?.ok ? h("button", { class: "btn primary", onclick: run }, t("newvideo.create")) : h("div", { class: "banner info" }, t("newvideo.manual")),
      h("div", { class: "copyline" }, h("div", { class: "txt mono" }, command), h("button", { class: "btn small", onclick: () => copyText(command) }, t("common.copy"))),
      jobBox,
    ),
  );
  // a director started earlier (or from another tab) keeps showing its steps
  if (s.job) mountJob(jobBox, s.job.id);
  if (!s.project) {
    const timer = setInterval(async () => {
      if (!document.body.contains(box)) return clearInterval(timer);
      try {
        const again = await api(`/api/brief/${id}`);
        if (again.project || again.media !== s.media || again.research !== s.research) {
          clearInterval(timer);
          if (again.project) toast(t("newvideo.projectAppeared"));
          void briefStatus(box, id, d);
        }
      } catch {
        clearInterval(timer);
      }
    }, 5000);
  }
}
