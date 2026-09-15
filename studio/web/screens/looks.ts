import { api, clear, fail, go, h, lazyVideo, t, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { field, fields } from "../forms.ts";

// «Look»: the worlds of the engine with their preview and defaults (captions, textures, camera); a new look is made
// from a built-in one by a form and saved as library/looks/<id>/look.json. The preview of every look shows its sampleLine.

export async function looksScreen(main: HTMLElement): Promise<void> {
  const [looks, lib, schema] = await Promise.all([api("/api/looks"), api("/api/library"), api("/api/schema")]);
  const previews = new Map((lib.items as Dict[]).filter((i) => i.section === "looks").map((i) => [i.id, i.preview]));
  const cards = (looks.looks as Dict[]).map(({ id, look }) => {
    const pv = previews.get(id);
    const thumb = h("div", { class: "thumb" });
    if (pv) {
      const v = lazyVideo(pv);
      thumb.addEventListener("mouseenter", () => v.dispatchEvent(new Event("mouseenter")));
      thumb.addEventListener("mouseleave", () => v.dispatchEvent(new Event("mouseleave")));
      thumb.appendChild(v);
    } else thumb.appendChild(h("div", null, t("library.noPreview")));
    return h(
      "div",
      { class: "card lib-card" },
      thumb,
      h(
        "div",
        { class: "body" },
        h("div", { class: "title" }, `${look.name} `, h("span", { class: "chip mono" }, id)),
        h("div", { class: "meta" }, look.about?.mood ?? ""),
        look.sampleLine ? h("div", { class: "sample" }, h("span", { class: "muted small" }, `${t("looks.sample")}: `), `“${look.sampleLine}”`) : null,
        h("table", { class: "plain" }, [
          [t("looks.palette"), h("span", null, h("span", { class: "swatch", style: `background:${look.palette?.accent}` }), " ", look.palette?.accent, " · ", h("span", { class: "swatch", style: `background:${look.palette?.secondary}` }), " ", look.palette?.secondary ?? "")],
          [t("looks.captions"), `${look.captions?.family ?? "calm"} · ${look.captions?.preset ?? "plain"}${look.captions?.activeWord ? ` · ${look.captions.activeWord}` : ""}`],
          [t("looks.textures"), ((look.textures ?? []) as Dict[]).map((x) => x.id).join(", ") || "—"],
          [t("looks.camera"), `${look.motion?.camera?.preset ?? "none"}${look.motion?.camera?.amplitude !== undefined ? ` × ${look.motion.camera.amplitude}` : ""}`],
          [t("looks.transitions"), `${look.transitions?.default ?? "—"} / ${look.transitions?.hit ?? "—"}`],
          [t("looks.kinetic"), look.typography?.kinetic ? t("common.yes") : t("common.no")],
        ].map(([k, v]) => h("tr", null, h("th", null, k as string), h("td", null, v as string)))),
      ),
    );
  });
  clear(main, h("div", { class: "header" }, h("div", null, h("h1", null, t("looks.title")), h("div", { class: "sub" }, t("looks.sub")))), h("div", { class: "cards" }, cards), h("h2", { style: "margin:28px 0 12px" }, t("looks.create")), createForm(looks, schema));
}

function createForm(looks: Dict, schema: Dict): HTMLElement {
  const v: Dict = { extends: looks.looks[0]?.id, textures: undefined };
  const texBox = h("div");
  const drawTex = (): void => {
    const base = (looks.looks as Dict[]).find((l) => l.id === v.extends)?.look;
    const chosen = new Set<string>(v.textures ?? ((base?.textures ?? []) as Dict[]).map((x) => x.id));
    v.textures = [...chosen];
    clear(texBox, (schema.textures as string[]).filter((x) => x !== "grain").map((id) => {
      const cb = h("input", { type: "checkbox", checked: chosen.has(id) });
      cb.onchange = () => {
        if (cb.checked) chosen.add(id);
        else chosen.delete(id);
        v.textures = [...chosen];
      };
      return h("label", { class: "check", style: "margin-right:10px" }, cb, id);
    }));
  };
  const submit = async (): Promise<void> => {
    try {
      const r = await api("/api/looks", { body: v });
      toast(t("looks.created", { id: r.id }));
      go("#/looks");
      location.reload();
    } catch (err) {
      fail(err);
    }
  };
  drawTex();
  return h(
    "div",
    { class: "panel" },
    h("div", { class: "muted small", style: "margin-bottom:10px" }, t("looks.createHint")),
    fields(
      field("id", { type: "string", description: t("looks.idHint") }, undefined, (x) => (v.id = x)),
      field("name", { type: "string" }, undefined, (x) => (v.name = x), { label: t("looks.name") }),
      field("extends", { type: "enum" }, v.extends, (x) => {
        v.extends = x;
        v.textures = undefined;
        drawTex();
      }, { options: (looks.looks as Dict[]).map((l) => l.id), label: t("looks.base") }),
      field("accent", { type: "color", description: "#RRGGBB" }, undefined, (x) => (v.accent = x), { label: t("looks.accent") }),
      field("secondary", { type: "color", description: "#RRGGBB" }, undefined, (x) => (v.secondary = x), { label: t("looks.secondary") }),
      field("family", { type: "enum" }, undefined, (x) => (v.family = x), { options: Object.keys(looks.families), label: t("looks.captionsFamily") }),
      field("camera", { type: "enum" }, undefined, (x) => (v.camera = x), { options: ["none", "push-in", "pull-out", "pan", "tilt", "handheld"], label: t("looks.camera") }),
      field("grain", { type: "number", min: 0, max: 2 }, undefined, (x) => (v.grain = x), { label: t("looks.grain") }),
      field("mood", { type: "text" }, undefined, (x) => (v.mood = x), { label: t("looks.mood") }),
      field("sampleLine", { type: "string", description: t("looks.sampleHint") }, undefined, (x) => (v.sampleLine = x), { label: t("looks.sample") }),
    ),
    h("div", { class: "field wide", style: "margin-top:10px" }, h("label", { class: "field-name" }, t("looks.textures")), texBox),
    h("div", { class: "row", style: "margin-top:12px" }, h("button", { class: "btn primary", onclick: submit }, t("looks.createGo"))),
  );
}
