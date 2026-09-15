import { clear, h, loadStrings, t } from "./lib.ts";
import { projectsScreen } from "./screens/projects.ts";
import { projectScreen } from "./screens/project.ts";
import { libraryScreen } from "./screens/library.ts";
import { looksScreen } from "./screens/looks.ts";
import { settingsScreen } from "./screens/settings.ts";
import { newVideoScreen } from "./screens/newvideo.ts";

// Hash router: #/projects, #/project/<id>/<tab>, #/library/<section>, #/looks, #/settings, #/new.

const NAV = [
  { hash: "#/projects", key: "nav.projects", icon: "▦" },
  { hash: "#/new", key: "nav.new", icon: "+" },
  { hash: "#/library", key: "nav.library", icon: "◈" },
  { hash: "#/looks", key: "nav.looks", icon: "◐" },
  { hash: "#/settings", key: "nav.settings", icon: "⚙" },
];

function renderNav(): void {
  const current = location.hash || "#/projects";
  const nav = document.getElementById("nav") as HTMLElement;
  clear(
    nav,
    h("div", { class: "brand" }, "hygen", h("small", null, t("nav.tagline"))),
    NAV.map((n) => h("a", { href: n.hash, class: current.startsWith(n.hash) || (n.hash === "#/projects" && current.startsWith("#/project/")) ? "on" : "" }, h("span", null, n.icon), t(n.key))),
    h("div", { class: "spacer" }),
    h("div", { class: "foot" }, t("nav.foot")),
  );
}

async function route(): Promise<void> {
  renderNav();
  const main = document.getElementById("main") as HTMLElement;
  const [, screen = "projects", a, b] = (location.hash || "#/projects").split("/");
  clear(main, h("div", { class: "empty" }, t("common.loading")));
  window.scrollTo(0, 0);
  try {
    if (screen === "project" && a) await projectScreen(main, decodeURIComponent(a), b ?? "beats");
    else if (screen === "library") await libraryScreen(main, a ?? "looks");
    else if (screen === "looks") await looksScreen(main);
    else if (screen === "settings") await settingsScreen(main);
    else if (screen === "new") await newVideoScreen(main, a);
    else await projectsScreen(main);
  } catch (err) {
    clear(main, h("div", { class: "banner err" }, err instanceof Error ? err.message : String(err)));
  }
}

await loadStrings();
document.title = t("app.title");
window.addEventListener("hashchange", () => void route());
void route();
