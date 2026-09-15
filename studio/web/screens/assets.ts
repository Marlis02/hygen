import { api, clear, confirmBox, fail, fmtBytes, h, mountJob, t, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { field, fields } from "../forms.ts";

// «Ассеты»: media.json with previews; a file without a complete license record is red and the build refuses it.
// Adding: drag and drop or a file dialog (then the license form), or search of Commons / Pexels (npm run media).

export function assetsTab(id: string, data: Dict, schema: Dict, reload: () => void): HTMLElement {
  const box = h("div");
  const fileInput = h("input", { type: "file", multiple: true, accept: "image/*,video/*,audio/*", style: "display:none" });
  const upload = async (files: FileList | File[]): Promise<void> => {
    for (const f of Array.from(files)) {
      try {
        const r = await api(`/api/projects/${id}/media`, { raw: f, query: { name: f.name } });
        toast(t("assets.uploaded", { name: r.name }), "info");
      } catch (err) {
        fail(err);
      }
    }
    reload();
  };
  fileInput.onchange = () => fileInput.files && void upload(fileInput.files);
  const drop = h("div", { class: "drop" }, t("assets.drop"), " ", h("button", { class: "btn small", onclick: () => fileInput.click() }, t("assets.pick")), fileInput);
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    if (e.dataTransfer?.files.length) void upload(e.dataTransfer.files);
  });
  const red = (data.media as Dict[]).filter((m) => m.missing.length || m.kind === "missing").length;
  box.append(
    red ? h("div", { class: "banner err" }, t("assets.redBanner", { n: red })) : h("div", { class: "banner ok" }, t("assets.allGreen", { n: data.media.length })),
    drop,
    searchPanel(id, schema, reload),
    h("h2", { style: "margin:18px 0 10px" }, t("assets.inProject")),
    ...((data.media as Dict[]).length ? (data.media as Dict[]).map((m) => assetRow(id, m, schema, reload)) : [h("div", { class: "empty panel" }, t("assets.none"))]),
  );
  return box;
}

function assetRow(id: string, m: Dict, schema: Dict, reload: () => void): HTMLElement {
  const rec: Dict = { ...(m.record ?? {}) };
  const isRed = m.missing.length > 0 || m.kind === "missing";
  const status = h("div");
  const save = async (): Promise<void> => {
    try {
      const r = await api(`/api/projects/${id}/media/${encodeURIComponent(m.name)}`, { method: "PUT", body: rec });
      toast(r.missing.length ? t("assets.stillRed", { list: r.missing.join(", ") }) : t("assets.saved"), r.missing.length ? "err" : "ok");
      reload();
    } catch (err) {
      fail(err);
    }
  };
  const remove = async (): Promise<void> => {
    if (!(await confirmBox(t("assets.removeTitle"), t("assets.removeText", { name: m.name }), t("assets.remove"), "danger"))) return;
    try {
      await api(`/api/projects/${id}/media/${encodeURIComponent(m.name)}`, { method: "DELETE" });
      reload();
    } catch (err) {
      fail(err);
    }
  };
  const pv = m.kind === "video" ? h("video", { src: m.url, muted: true, controls: true, preload: "metadata" }) : m.kind === "image" ? h("img", { src: m.url, loading: "lazy" }) : m.kind === "audio" ? h("audio", { src: m.url, controls: true, style: "width:150px" }) : h("div", { class: "pill red" }, t("assets.noFile"));
  const licenseOptions = schema.licenses as string[];
  return h(
    "div",
    { class: `asset${isRed ? " red" : ""}` },
    h("div", { class: "pv" }, pv),
    h(
      "div",
      null,
      h("div", { class: "row between" }, h("div", null, h("b", { class: "mono" }, m.name), " ", h("span", { class: "muted small" }, m.bytes ? fmtBytes(m.bytes) : ""), " ", m.used ? h("span", { class: "chip" }, t("assets.used")) : h("span", { class: "chip" }, t("assets.unused")), " ", isRed ? h("span", { class: "pill red" }, m.kind === "missing" ? t("assets.recordNoFile") : t("assets.missing", { list: m.missing.join(", ") })) : h("span", { class: "pill pill-ok" }, t("assets.licensed"))), h("button", { class: "btn small danger", onclick: remove }, t("assets.remove"))),
      fields(
        field("role", { type: "enum", description: t("assets.roleHint") }, rec.role ?? undefined, (v) => (rec.role = v ?? null), { options: schema.roles, label: t("assets.role") }),
        field("title", { type: "string" }, rec.title, (v) => (rec.title = v ?? ""), { label: t("assets.title") }),
        field("source", { type: "string", default: "Wikimedia Commons" }, rec.source || undefined, (v) => (rec.source = v ?? ""), { label: t("assets.source") }),
        field("author", { type: "string" }, rec.author || undefined, (v) => (rec.author = v ?? ""), { label: t("assets.author") }),
        field("license", { type: "enum" }, rec.license || undefined, (v) => (rec.license = v ?? ""), { options: licenseOptions, label: t("assets.license") }),
        field("url", { type: "string", description: t("assets.urlHint") }, rec.url || undefined, (v) => (rec.url = v ?? ""), { label: t("assets.url") }),
        field("notes", { type: "text" }, rec.notes, (v) => (rec.notes = v), { label: t("assets.notes") }),
      ),
      m.kind === "video" ? trimControl(m, rec) : null,
      h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn primary small", onclick: save }, t("common.save")), status),
    ),
  );
}

/** in/out sliders over a video with the frames at both ends; saved as media.json → trim. */
function trimControl(m: Dict, rec: Dict): HTMLElement {
  const a = h("video", { src: m.url, muted: true, preload: "auto" });
  const b = h("video", { src: m.url, muted: true, preload: "auto" });
  const inR = h("input", { type: "range", min: "0", step: "0.05", value: "0" });
  const outR = h("input", { type: "range", min: "0", step: "0.05", value: "0" });
  const label = h("div", { class: "small muted" });
  const show = (): void => {
    const i = Number(inR.value);
    const o = Number(outR.value);
    label.textContent = t("assets.trimLabel", { a: i.toFixed(2), b: o.toFixed(2), d: Math.max(0, o - i).toFixed(2) });
    a.currentTime = i;
    b.currentTime = Math.max(0, o - 0.04);
  };
  a.addEventListener("loadedmetadata", () => {
    const d = a.duration || 0;
    inR.max = outR.max = String(d);
    inR.value = String(rec.trim?.in ?? 0);
    outR.value = String(rec.trim?.out ?? d);
    show();
  });
  inR.oninput = () => {
    if (Number(inR.value) >= Number(outR.value)) inR.value = String(Math.max(0, Number(outR.value) - 0.1));
    rec.trim = { in: Number(inR.value), out: Number(outR.value) };
    show();
  };
  outR.oninput = () => {
    if (Number(outR.value) <= Number(inR.value)) outR.value = String(Number(inR.value) + 0.1);
    rec.trim = { in: Number(inR.value), out: Number(outR.value) };
    show();
  };
  return h("div", { class: "group" }, h("legend", null, t("assets.trim")), h("div", { class: "trim" }, h("div", null, a, h("label", { class: "field-name" }, "in"), inR), h("div", null, b, h("label", { class: "field-name" }, "out"), outR)), label, h("div", { class: "small muted" }, t("assets.trimHint")));
}

function searchPanel(id: string, schema: Dict, reload: () => void): HTMLElement {
  const q = h("input", { placeholder: t("assets.searchPlaceholder") });
  const video = h("input", { type: "checkbox" });
  const provider = h("select", { style: "width:auto" }, ["all", "commons", "pexels"].map((p) => h("option", { value: p }, t(`assets.providers.${p}`))));
  const results = h("div", { class: "results" });
  const jobBox = h("div");
  const run = async (): Promise<void> => {
    if (!q.value.trim()) return;
    clear(results, h("div", { class: "muted" }, t("assets.searching")));
    try {
      const r = await api("/api/media/search", { query: { q: q.value.trim(), video: video.checked ? 1 : "", provider: provider.value, n: 8 } });
      clear(results, r.items.length ? (r.items as Dict[]).map((it) => resultCard(id, it, jobBox, reload)) : h("div", { class: "muted" }, t("assets.nothing")));
      if (!r.pexels && provider.value !== "commons") toast(t("assets.noPexels"), "info");
    } catch (err) {
      clear(results);
      fail(err);
    }
  };
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void run();
  });
  return h("details", { class: "panel" }, h("summary", { style: "cursor:pointer" }, h("b", null, t("assets.search")), h("span", { class: "muted small" }, ` — ${t("assets.searchAbout")}`)), h("div", { class: "row", style: "margin-top:10px" }, h("div", { class: "grow" }, q), h("label", { class: "check" }, video, t("assets.videoOnly")), provider, h("button", { class: "btn primary", onclick: run }, t("assets.find"))), jobBox, results);
}

function resultCard(id: string, it: Dict, jobBox: HTMLElement, reload: () => void): HTMLElement {
  const as = h("input", { value: String(it.title ?? "").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) });
  const role = h("select", null, ["", "hero", "evidence", "place"].map((r) => h("option", { value: r }, r || t("assets.roleAny"))));
  const inp = h("input", { type: "number", step: "0.1", placeholder: "in" });
  const outp = h("input", { type: "number", step: "0.1", placeholder: "out" });
  const add = async (): Promise<void> => {
    try {
      const body: Dict = { ref: it.id, as: as.value, role: role.value || undefined };
      if (it.video && inp.value !== "") body.in = Number(inp.value);
      if (it.video && outp.value !== "") body.out = Number(outp.value);
      const job = await api(`/api/projects/${id}/media/get`, { body });
      mountJob(jobBox, job.id, (j) => {
        toast(j.status === "ok" ? t("assets.added") : t("assets.addFailed"), j.status === "ok" ? "ok" : "err");
        if (j.status === "ok") reload();
      });
    } catch (err) {
      fail(err);
    }
  };
  return h(
    "div",
    { class: "result" },
    it.thumb ? h("img", { src: it.thumb, loading: "lazy", referrerpolicy: "no-referrer" }) : h("div", { style: "height:150px" }),
    h("div", { class: "body" }, h("b", null, it.title), h("div", { class: "muted" }, `${it.author} · ${it.source}`), h("div", null, h("span", { class: "pill pill-ok" }, it.license), " ", it.video ? h("span", { class: "chip" }, `${t("assets.video")} ${Math.round(it.duration || 0)} с`) : h("span", { class: "chip" }, `${it.width}×${it.height}`)), h("a", { href: it.page, target: "_blank", rel: "noreferrer", class: "small" }, t("assets.page")), h("label", { class: "field-name" }, t("assets.saveAs")), as, role, it.video ? h("div", { class: "row" }, h("div", { class: "grow" }, inp), h("div", { class: "grow" }, outp)) : null, h("button", { class: "btn small primary", onclick: add }, t("assets.addToProject"))),
  );
}
