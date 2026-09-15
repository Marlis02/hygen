import { clear, h, loadStrings, t } from "./lib.ts";
import { icon } from "./icons.ts";
import { projectsScreen } from "./screens/projects.ts";
import { projectScreen, stopProjectWatch } from "./screens/project.ts";
import { libraryScreen } from "./screens/library.ts";
import { looksScreen } from "./screens/looks.ts";
import { settingsScreen } from "./screens/settings.ts";
import { newVideoScreen } from "./screens/newvideo.ts";
import { directorHome } from "./screens/director.ts";

// Hash router: #/projects, #/project/<id>/<tab>, #/library/<section>, #/looks, #/director, #/settings, #/new.

const NAV = [
  { hash: "#/projects", key: "nav.projects", icon: "layout-grid" },
  { hash: "#/new", key: "nav.new", icon: "plus" },
  { hash: "#/library", key: "nav.library", icon: "sparkles" },
  { hash: "#/looks", key: "nav.looks", icon: "palette" },
  { hash: "#/director", key: "nav.director", icon: "terminal" },
  { hash: "#/settings", key: "nav.settings", icon: "settings" },
];

/** The sidebar item of a screen: a project's «Режиссёр» tab belongs to «Режиссёр», its other tabs to «Проекты». */
function currentItem(hash: string): string {
  if (hash.startsWith("#/project/")) return hash.split("/")[3] === "director" ? "#/director" : "#/projects";
  return NAV.find((n) => hash.startsWith(n.hash))?.hash ?? "#/projects";
}

function renderNav(): void {
  const on = currentItem(location.hash || "#/projects");
  const nav = document.getElementById("nav") as HTMLElement;
  clear(
    nav,
    h("div", { class: "brand" }, "hygen", h("small", null, t("nav.tagline"))),
    NAV.map((n) => h("a", { href: n.hash, class: n.hash === on ? "on" : "" }, icon(n.icon), h("span", null, t(n.key)))),
    h("div", { class: "spacer" }),
    h("div", { class: "foot" }, t("nav.foot")),
  );
}

async function route(): Promise<void> {
  renderNav();
  const main = document.getElementById("main") as HTMLElement;
  const [, screen = "projects", a, b] = (location.hash || "#/projects").split("/");
  if (screen !== "project") stopProjectWatch();
  clear(main, h("div", { class: "empty" }, t("common.loading")));
  window.scrollTo(0, 0);
  try {
    if (screen === "project" && a) await projectScreen(main, decodeURIComponent(a), b ?? "beats");
    else if (screen === "library") await libraryScreen(main, a ?? "textures");
    else if (screen === "looks") await looksScreen(main);
    else if (screen === "director") await directorHome(main);
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
