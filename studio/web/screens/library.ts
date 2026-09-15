import { api, clear, fail, go, h, modal, t, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { field, fields } from "../forms.ts";
import { debounce, onLive } from "../live.ts";

// «Библиотека»: every element of the engine with its 3-second preview (library/previews), description and params;
// «apply to a beat» writes it into project.json. Music: listen, BPM, mood, looks; add a track with its license.

export async function libraryScreen(main: HTMLElement, section: string): Promise<void> {
  // looks have their own screen (sidebar «Look»), not a section of the library
  if (section === "looks") return go("#/looks");
  const data = await api<{ sections: string[]; items: Dict[]; missing: number; job: Dict | null }>("/api/library");
  const items = data.items.filter((i) => i.section === section);
  const families = [...new Set(items.map((i) => i.family).filter(Boolean))] as string[];
  const fam = h("select", null, h("option", { value: "" }, t("library.allFamilies")), families.map((f) => h("option", { value: f }, f)));
  const origin = h("select", null, ["", "own", "registry"].map((o) => h("option", { value: o }, t(`library.origin.${o || "all"}`))));
  const search = h("input", { placeholder: t("library.search") });
  const grid = h("div", { class: "cards" });
  const draw = (): void => {
    const q = search.value.trim().toLowerCase();
    const list = items.filter((i) => (!fam.value || i.family === fam.value) && (!origin.value || i.origin === origin.value) && (!q || `${i.id} ${i.name} ${i.description}`.toLowerCase().includes(q)));
    clear(grid, list.length ? list.map((i) => (section === "music" ? musicCard(i) : itemCard(i))) : h("div", { class: "empty" }, t("library.empty")));
  };
  [fam, origin].forEach((s) => (s.onchange = draw));
  search.oninput = draw;
  const shown = data.items.filter((i) => i.section !== "looks");
  const withPreview = shown.filter((i) => i.preview || i.audio).length;
  const bar = previewsBar(main, section, data);
  clear(
    main,
    h("div", { class: "header" }, h("div", null, h("h1", null, t("library.title")), h("div", { class: "sub" }, t("library.sub", { n: shown.length, p: withPreview }))), section === "music" ? h("button", { class: "btn primary", onclick: addTrack }, t("library.addTrack")) : null),
    bar,
    h("div", { class: "sections" }, data.sections.filter((s) => s !== "looks").map((s) => h("a", { href: `#/library/${s}`, class: s === section ? "on" : "" }, `${t(`library.sections.${s}`)} · ${data.items.filter((i) => i.section === s).length}`))),
    h("div", { class: "filters" }, families.length ? fam : null, section === "music" ? null : origin, search),
    grid,
  );
  draw();
}

function itemCard(item: Dict): HTMLElement {
  const thumb = h("div", { class: "thumb" });
  if (item.preview) {
    const v = h("video", { src: item.preview, muted: true, loop: true, playsinline: true, preload: "metadata" });
    // the first frame is often empty (the element enters on its word): stand the card on the middle of the clip
    v.addEventListener("loadedmetadata", () => {
      if (v.paused) v.currentTime = (v.duration || 3) * 0.6;
    });
    thumb.appendChild(v);
    thumb.addEventListener("mouseenter", () => void v.play().catch(() => {}));
    thumb.addEventListener("mouseleave", () => v.pause());
  } else thumb.appendChild(h("div", null, item.previewError ? t("library.previewError", { e: item.previewError }) : t("library.noPreview")));
  const facts = item.facts ? Object.entries(item.facts as Dict).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) : [];
  const params = item.params ? Object.entries(item.params as Dict) : [];
  return h(
    "div",
    { class: "card lib-card" },
    thumb,
    h(
      "div",
      { class: "body" },
      h("div", { class: "title" }, item.name),
      h("div", { class: "row" }, h("span", { class: "chip mono" }, item.id), item.family ? h("span", { class: "chip" }, item.family) : null, h("span", { class: "chip" }, item.originRef ?? t(`library.origin.${item.origin}`))),
      h("div", { class: "meta" }, item.description),
      facts.length ? h("div", { class: "small" }, facts.map(([k, v]) => h("div", null, h("span", { class: "muted" }, `${k}: `), k === "accent" ? h("span", { class: "swatch", style: `background:${v}` }) : null, " ", typeof v === "object" ? JSON.stringify(v) : String(v)))) : null,
      params.length ? h("details", null, h("summary", { class: "small muted", style: "cursor:pointer" }, t("library.params", { n: params.length })), h("table", { class: "plain" }, params.map(([k, d]) => h("tr", null, h("td", { class: "mono" }, k), h("td", { class: "small" }, `${(d as Dict).type ?? ""}${(d as Dict).values ? `: ${((d as Dict).values as string[]).join(" | ")}` : ""}${(d as Dict).default !== undefined ? ` = ${JSON.stringify((d as Dict).default)}` : ""}`, h("div", { class: "muted" }, (d as Dict).description ?? "")))))) : null,
    ),
    h("div", { class: "actions" }, h("button", { class: "btn small primary", onclick: () => applyDialog(item) }, item.apply.target === "project" ? t("library.applyProject") : t("library.applyBeat"))),
  );
}

function musicCard(item: Dict): HTMLElement {
  const f = item.facts ?? {};
  return h(
    "div",
    { class: "card" },
    h("div", { class: "body" }, h("div", { class: "title" }, item.name), h("div", { class: "row" }, h("span", { class: "chip mono" }, item.id), f.bpm ? h("span", { class: "pill" }, `${Math.round(f.bpm)} BPM`) : null, f.mood ? h("span", { class: "chip" }, f.mood) : null), h("div", { class: "meta" }, `${t("library.looks")}: ${(f.looks ?? []).join(", ") || "—"}`), h("div", { class: "meta" }, `${f.license} · ${f.author}`), item.audio ? h("audio", { src: item.audio, controls: true, preload: "none", style: "width:100%" }) : null, h("div", { class: "meta small" }, item.description)),
    h("div", { class: "actions" }, h("button", { class: "btn small primary", onclick: () => applyDialog(item) }, t("library.applyProject"))),
  );
}

async function applyDialog(item: Dict): Promise<void> {
  try {
    const { projects } = await api<{ projects: Dict[] }>("/api/projects");
    const projSel = h("select", null, projects.map((p) => h("option", { value: p.id }, `${p.title} (${p.id})`)));
    const beatSel = h("select");
    const needBeat = item.apply.target === "beat";
    const loadBeats = async (): Promise<void> => {
      if (!needBeat) return;
      const d = await api(`/api/projects/${projSel.value}`);
      clear(beatSel, (d.project.beats as Dict[]).map((b) => h("option", { value: b.id }, `${b.id} — ${String(b.text).slice(0, 60)}`)));
    };
    projSel.onchange = () => void loadBeats().catch(fail);
    await loadBeats();
    modal(t("library.applyTitle", { name: item.name }), h("div", { class: "stack" }, h("div", { class: "muted small" }, t(`library.applyHint.${needBeat ? ("push" in item.apply ? item.apply.push : "set") : "project"}`)), h("label", { class: "field-name" }, t("library.project")), projSel, needBeat ? [h("label", { class: "field-name" }, t("library.beat")), beatSel] : null), [
      { label: t("common.cancel") },
      {
        label: t("library.apply"),
        kind: "primary",
        onClick: async () => {
          const r = await api("/api/library/apply", { body: { section: item.section, id: item.id, project: projSel.value, beat: needBeat ? beatSel.value : undefined } });
          toast(r.ok ? t("library.applied", { what: r.applied }) : t("library.appliedInvalid", { e: r.error }), r.ok ? "ok" : "err");
        },
      },
    ]);
  } catch (err) {
    fail(err);
  }
}

async function addTrack(): Promise<void> {
  const schema = await api("/api/schema");
  const rec: Dict = { looks: [] };
  const file = h("input", { type: "file", accept: "audio/*" });
  const form = h("div", { class: "stack" }, h("div", { class: "muted small" }, t("library.addTrackHint")), file, fields(field("title", { type: "string" }, undefined, (v) => (rec.title = v), { label: t("assets.title") }), field("source", { type: "string" }, undefined, (v) => (rec.source = v), { label: t("assets.source") }), field("author", { type: "string" }, undefined, (v) => (rec.author = v), { label: t("assets.author") }), field("license", { type: "enum" }, undefined, (v) => (rec.license = v), { options: schema.licenses, label: t("assets.license") }), field("url", { type: "string" }, undefined, (v) => (rec.url = v), { label: t("assets.url") }), field("mood", { type: "string" }, undefined, (v) => (rec.mood = v), { label: t("library.mood") }), field("looks", { type: "list" }, undefined, (v) => (rec.looks = v ?? []), { label: t("library.looks") })));
  modal(t("library.addTrack"), form, [
    { label: t("common.cancel") },
    {
      label: t("library.addTrackGo"),
      kind: "primary",
      onClick: async () => {
        const f = file.files?.[0];
        if (!f) throw new Error(t("library.pickFile"));
        const up = await api("/api/library/music", { raw: f, query: { name: f.name } });
        const r = await api(`/api/library/music/${encodeURIComponent(up.file)}`, { method: "PUT", body: rec });
        toast(t("library.trackAdded", { file: r.file, bpm: Math.round(r.bpm), beats: r.beats }));
        location.reload();
      },
    },
  ]);
}

/**
 * Превью галереи (ROADMAP S2): при открытии считаются недостающие по хэшам и досчитываются задачей сервера —
 * карточки видны сразу, превью появляются по готовности, открытый раздел идёт первым. Закрытие вкладки задачу
 * не останавливает: она живёт на сервере. Это единственная автоматическая сборка в системе.
 */
function previewsBar(main: HTMLElement, section: string, data: Dict): HTMLElement {
  const box = h("div");
  if (!data.missing && !data.job) return box;
  const line = h("div", { class: "banner info" });
  box.appendChild(line);
  // 22 с на превью — среднее по прошлым прогонам (S1.1: 83 превью за 388 с в два потока)
  const show = (done: number, total: number): void => {
    const left = Math.max(0, total - done);
    line.textContent = left ? t("library.previewsRunning", { done, total, min: Math.max(1, Math.round((left * 22) / 60 / 2)) }) : t("library.previewsDone", { total });
    if (!left) setTimeout(() => line.remove(), 4000);
  };
  show(Number(data.job?.done ?? 0), Number(data.job?.total ?? data.missing));
  const reload = debounce(() => {
    if (main.isConnected && location.hash.startsWith("#/library")) void libraryScreen(main, section).catch(() => undefined);
  }, 1500);
  onLive((msg) => {
    if (msg.type === "job" && msg.job?.kind === "previews") {
      show(Number((msg.job.result as Dict | undefined)?.done ?? 0), Number((msg.job.result as Dict | undefined)?.total ?? data.missing));
      if (msg.job.status !== "running") reload();
    } else if (msg.type === "files" && (msg.library as string[] | undefined)?.some((f) => f.startsWith("previews/"))) reload();
  });
  if (!data.job) void api("/api/library/previews", { body: { section } }).catch(() => undefined);
  return box;
}
