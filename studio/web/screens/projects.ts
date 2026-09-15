import { api, clear, confirmBox, fail, fmtDate, fmtSec, go, h, modal, statusPill, t, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";

export async function projectsScreen(main: HTMLElement): Promise<void> {
  const data = await api<{ projects: Dict[] }>("/api/projects");
  let showProof = localStorage.getItem("studio.proof") === "1";
  const grid = h("div", { class: "cards" });
  const draw = (): void => {
    const list = data.projects.filter((p) => showProof || !p.proof);
    clear(grid, list.length ? list.map(projectCard) : h("div", { class: "empty" }, t("projects.empty")));
  };
  const proofToggle = h("input", { type: "checkbox", checked: showProof });
  proofToggle.onchange = () => {
    showProof = proofToggle.checked;
    localStorage.setItem("studio.proof", showProof ? "1" : "0");
    draw();
  };
  clear(
    main,
    h("div", { class: "header" }, h("div", null, h("h1", null, t("projects.title")), h("div", { class: "sub" }, t("projects.sub", { n: data.projects.filter((p) => !p.proof).length, proof: data.projects.filter((p) => p.proof).length }))), h("div", { class: "row" }, h("label", { class: "check" }, proofToggle, t("projects.showProof")), h("a", { class: "btn primary", href: "#/new" }, t("nav.new")))),
    grid,
  );
  draw();
}

function projectCard(p: Dict): HTMLElement {
  const open = (): void => go(`#/project/${p.id}/beats`);
  return h(
    "div",
    { class: "card" },
    h("div", { class: "thumb", style: p.thumb ? `background-image:url('${p.thumb}')` : "", onclick: open }, h("div", { class: "badges" }, statusPill(p.status), p.proof ? h("span", { class: "pill proof" }, "proof") : null, p.mediaErrors ? h("span", { class: "pill red" }, t("projects.mediaErrors", { n: p.mediaErrors })) : null, p.building ? h("span", { class: "pill pill-running" }, t("projects.building")) : null), p.duration ? h("div", { class: "dur" }, fmtSec(p.duration)) : null),
    h("div", { class: "body" }, h("div", { class: "title" }, p.title), h("div", { class: "meta" }, `${p.id} · ${t("projects.beats", { n: p.beats })}`), h("div", { class: "meta" }, `${t("projects.voice")}: ${p.voice} · look: ${p.look}`), h("div", { class: "meta" }, p.publishedAt ? t("projects.publishedAt", { d: p.publishedAt }) : t("projects.builtAt", { d: fmtDate(p.builtAt) }))),
    h("div", { class: "actions" }, h("button", { class: "btn small primary", onclick: open }, t("projects.open")), h("button", { class: "btn small", onclick: () => duplicate(p) }, t("projects.duplicate")), h("button", { class: "btn small ghost", onclick: () => go(`#/project/${p.id}/history`) }, t("projects.history", { n: p.history }))),
  );
}

function duplicate(p: Dict): void {
  const inp = h("input", { value: `${p.id.replace(/-en$/, "")}-copy-en` });
  modal(t("projects.duplicateTitle", { id: p.id }), h("div", { class: "stack" }, h("div", { class: "muted" }, t("projects.duplicateHint")), inp), [
    { label: t("common.cancel") },
    {
      label: t("projects.duplicate"),
      kind: "primary",
      onClick: async () => {
        const r = await api("/api/projects/" + p.id + "/duplicate", { body: { id: inp.value.trim() } });
        toast(t("projects.duplicated", { id: r.id }));
        go(`#/project/${r.id}/beats`);
      },
    },
  ]);
}

export async function rollback(projectId: string, name: string, after: () => void): Promise<void> {
  if (!(await confirmBox(t("history.rollbackTitle"), t("history.rollbackText", { name }), t("history.rollback")))) return;
  try {
    const r = await api(`/api/projects/${projectId}/history/${encodeURIComponent(name)}/rollback`, { method: "POST" });
    toast(t("history.rolledBack", { name, saved: r.saved ?? "—" }));
    after();
  } catch (err) {
    fail(err);
  }
}
