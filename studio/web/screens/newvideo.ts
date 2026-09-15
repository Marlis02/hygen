import { api, clear, fail, go, h, slug, t, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { field, fields } from "../forms.ts";

// «Новый ролик» (ROADMAP S2): бриф (projects/<id>/brief.json) с жанром — по жанру навык берёт свои правила
// исследования. Поля голоса нет: черновик всегда Kokoro. Кнопка одна: «Создать» сохраняет бриф, открывает проект
// на вкладке «Диалоги» и запускает диалог с /short <id>.

export async function newVideoScreen(main: HTMLElement, existing?: string): Promise<void> {
  const d = await api("/api/director");
  const v: Dict = { genre: "history", look: "director", seconds: d.config.short.targetSeconds };
  const idInput = h("input", { placeholder: "tunguska-en" });
  const topic = h("input", { placeholder: t("newvideo.topicPlaceholder") });
  topic.oninput = () => {
    if (!idInput.dataset.touched) idInput.value = topic.value ? `${slug(topic.value).split("-").slice(0, 3).join("-")}-en` : "";
  };
  idInput.oninput = () => (idInput.dataset.touched = "1");
  const create = async (): Promise<void> => {
    try {
      const r = await api("/api/brief", { body: { ...v, id: idInput.value.trim(), topic: topic.value } });
      toast(t("newvideo.briefSaved"));
      // one button: the brief is saved, the project opens on «Диалоги» and the dialog starts with /short <id>
      go(`#/project/${r.brief.id}/dialogs`);
      setTimeout(() => void api(`/api/projects/${r.brief.id}/dialog`, { body: {} }).catch(fail), 400);
    } catch (err) {
      fail(err);
    }
  };
  clear(
    main,
    h("div", { class: "header" }, h("div", null, h("h1", null, t("newvideo.title")), h("div", { class: "sub" }, t("newvideo.sub")))),
    d.claude ? null : h("div", { class: "banner err" }, t("director.noClaude")),
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
          field("genre", { type: "enum" }, v.genre, (x) => (v.genre = x), { options: d.genres as string[], label: t("newvideo.genre") }),
          field("look", { type: "enum" }, v.look, (x) => (v.look = x ?? "director"), { options: ["director", ...d.looks], label: t("newvideo.look") }),
          field("seconds", { type: "number", min: 20, max: 59 }, v.seconds, (x) => (v.seconds = x), { label: t("newvideo.seconds") }),
          field("wishes", { type: "text" }, undefined, (x) => (v.wishes = x), { label: t("newvideo.wishes") }),
          field("arc", { type: "text" }, undefined, (x) => (v.arc = x), { label: t("newvideo.arc") }),
          field("avoid", { type: "text" }, undefined, (x) => (v.avoid = x), { label: t("newvideo.avoid") }),
          field("mustShow", { type: "text" }, undefined, (x) => (v.mustShow = x), { label: t("newvideo.mustShow") }),
        ),
        h("div", { class: "muted small", style: "margin:8px 0" }, t("newvideo.lookHint")),
        h("button", { class: "btn primary", onclick: create, disabled: !d.claude }, t("newvideo.create")),
      ),
      h("div", { class: "panel stack" }, h("h2", null, t("newvideo.howTitle")), h("div", { class: "muted" }, t("newvideo.how")), h("div", { class: "muted small" }, t("newvideo.genreHint"))),
    ),
  );
  if (existing) go(`#/project/${existing}/dialogs`);
}
