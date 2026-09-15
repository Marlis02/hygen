import { signal } from "@preact/signals";
import type { JSX } from "preact";
import { useEffect, useErrorBoundary } from "preact/hooks";
import { stopDialogOf } from "./dialog.tsx";
import { errText } from "./lib/api.ts";
import { t } from "./lib/i18n.ts";
import { liveDialogs, online } from "./lib/live.ts";
import { Icon, Modals, Toasts } from "./lib/ui.tsx";
import { ProjectsScreen } from "./screens/Projects.tsx";
import { ProjectScreen } from "./screens/Project.tsx";
import { LibraryScreen } from "./screens/Library.tsx";
import { LooksScreen } from "./screens/Looks.tsx";
import { SettingsScreen } from "./screens/Settings.tsx";
import { NewVideoScreen } from "./screens/NewVideo.tsx";
import { DirectorScreen } from "./screens/Director.tsx";

// Роутер по hash: #/projects, #/project/<id>/<tab>, #/library/<section>, #/looks, #/director, #/settings, #/new.

export const hash = signal(typeof location === "undefined" ? "#/projects" : location.hash || "#/projects");
if (typeof window !== "undefined") window.addEventListener("hashchange", () => (hash.value = location.hash || "#/projects"));

const NAV = [
  { hash: "#/projects", key: "nav.projects", icon: "layout-grid" },
  { hash: "#/new", key: "nav.new", icon: "plus" },
  { hash: "#/library", key: "nav.library", icon: "sparkles" },
  { hash: "#/looks", key: "nav.looks", icon: "palette" },
  { hash: "#/director", key: "nav.director", icon: "terminal" },
  { hash: "#/settings", key: "nav.settings", icon: "settings" },
];

/** Пункт сайдбара экрана: вкладка «Диалоги» проекта относится к «Режиссёру», остальные вкладки — к «Проектам». */
function currentItem(h: string): string {
  if (h.startsWith("#/project/")) return h.split("/")[3] === "dialogs" ? "#/director" : "#/projects";
  return NAV.find((n) => h.startsWith(n.hash))?.hash ?? "#/projects";
}

function Nav(): JSX.Element {
  const on = currentItem(hash.value);
  const dialogs = liveDialogs.value;
  return (
    <aside id="nav">
      <div class="brand">
        hygen<small>{t("nav.tagline")}</small>
      </div>
      {NAV.map((n) => (
        <a key={n.hash} href={n.hash} class={n.hash === on ? "on" : ""}>
          <Icon name={n.icon} />
          <span>{t(n.key)}</span>
        </a>
      ))}
      {dialogs.map((d) => (
        <div key={d.project} class="nav-banner">
          <a href={`#/project/${d.project}/dialogs`} title={t("director.goTo")}>
            <span class="live-pulse" />
            {t("director.banner", { project: d.project, n: dialogs.length })}
          </a>
          <button class="btn small ghost" onClick={() => void stopDialogOf(d.project)}>
            {t("dialog.stop")}
          </button>
        </div>
      ))}
      <div class="spacer" />
      <div class="foot">
        <span class={`live ${online.value ? "on" : "off"}`} title={online.value ? "живые обновления включены" : "нет связи с сервером"} />
        {t("nav.foot")}
      </div>
    </aside>
  );
}

function Screen(): JSX.Element {
  const [, screen = "projects", a, b] = hash.value.split("/");
  const [error, resetError] = useErrorBoundary();
  const place = screen === "project" ? `project/${a}` : screen;
  useEffect(() => {
    window.scrollTo(0, 0);
    resetError();
  }, [place]);
  if (error) return <div class="banner err">{errText(error)}</div>;
  if (screen === "project" && a) return <ProjectScreen key={a} id={decodeURIComponent(a)} tab={b || "beats"} />;
  if (screen === "library") return <LibraryScreen key={a ?? "textures"} section={a || "textures"} />;
  if (screen === "looks") return <LooksScreen />;
  if (screen === "director") return <DirectorScreen />;
  if (screen === "settings") return <SettingsScreen />;
  if (screen === "new") return <NewVideoScreen />;
  return <ProjectsScreen />;
}

export function App(): JSX.Element {
  return (
    <>
      <div id="app">
        <Nav />
        <main id="main">
          <Screen />
        </main>
      </div>
      <Toasts />
      <Modals />
    </>
  );
}
