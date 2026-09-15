import { api, clear, confirmBox, fail, h, t } from "./lib.ts";
import { onLive } from "./live.ts";

// Диалог с режиссёром (ROADMAP S2): xterm.js над pty сервера, один диалог на проект. Терминал живёт на сервере —
// закрытие вкладки браузера его не завершает; «Завершить» спрашивает подтверждение. Вывод приходит по WebSocket.

interface Term {
  cols: number;
  rows: number;
  open(el: HTMLElement): void;
  write(data: string): void;
  reset(): void;
  focus(): void;
  onData(cb: (data: string) => void): void;
  loadAddon(addon: unknown): void;
}

let term: Term | null = null;
let fit: { fit(): void } | null = null;
let loading: Promise<void> | null = null;
let root: HTMLElement | null = null;
let host: HTMLElement;
let pill: HTMLElement;
let hint: HTMLElement;
let openBtn: HTMLButtonElement;
let stopBtn: HTMLButtonElement;
let project = "";
let state: Record<string, any> = {};
let chain: Promise<unknown> = Promise.resolve();
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
let onChange: (() => void) | null = null;

const size = (): Record<string, number> => (term ? { cols: term.cols, rows: term.rows } : {});
const live = (): boolean => Boolean(state.dialog);

function paint(): void {
  if (!root) return;
  pill.className = `pill ${live() ? "pill-ok" : ""}`;
  pill.textContent = live() ? t("dialog.running") : t("dialog.stopped");
  hint.textContent = live() ? t("dialog.hintRunning", { at: String(state.dialog?.startedAt ?? "").slice(11, 16) }) : t("dialog.hint", { project });
  openBtn.textContent = live() ? t("dialog.focus") : (state.list ?? []).length ? t("dialog.continue") : t("dialog.open");
  stopBtn.disabled = !live();
}

function refit(): void {
  if (!term || !fit || !host.isConnected || !host.dataset.opened) return;
  fit.fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (live()) void api(`/api/projects/${project}/dialog/resize`, { body: size() }).catch(() => undefined);
  }, 150);
}

async function loadXterm(): Promise<void> {
  if (!document.getElementById("xterm-css")) document.head.appendChild(h("link", { id: "xterm-css", rel: "stylesheet", href: "/vendor/xterm/xterm.css" }));
  const xtermUrl = "/vendor/xterm/xterm.mjs";
  const fitUrl = "/vendor/xterm/addon-fit.mjs";
  const [xterm, addon] = await Promise.all([import(xtermUrl), import(fitUrl)]);
  const made = new xterm.Terminal({ fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace', fontSize: 13, lineHeight: 1.15, cursorBlink: true, scrollback: 5000, theme: { background: "#0a0908", foreground: "#e8e1d6", cursor: "#e8a33a", selectionBackground: "#4a3b2a" } }) as Term;
  fit = new addon.FitAddon();
  made.loadAddon(fit);
  made.onData((keys) => {
    if (!live()) return;
    chain = chain.then(() => api(`/api/projects/${project}/dialog/input`, { body: { data: keys } })).catch(() => undefined);
  });
  term = made;
  onLive((msg) => {
    if (msg.project !== project) return;
    if (msg.type === "dialog") term?.write(String(msg.data));
    else if (msg.type === "dialog-exit") {
      term?.write(`\r\n\x1b[2m[${t("dialog.exited", { code: msg.code })}]\x1b[0m\r\n`);
      void refresh();
    } else if (msg.type === "dialog-start") void refresh();
  });
}

async function refresh(): Promise<void> {
  try {
    const next = await api<Record<string, any>>(`/api/projects/${project}/dialog`);
    const wasRunning = live();
    state = next;
    paint();
    if (next.dialog && next.buffer && !wasRunning) {
      term?.reset();
      term?.write(next.buffer);
    }
    onChange?.();
  } catch (err) {
    fail(err);
  }
}

async function mount(): Promise<void> {
  try {
    loading ??= loadXterm();
    await loading;
    if (term && root?.isConnected && !host.dataset.opened) {
      term.open(host);
      host.dataset.opened = "1";
    }
    refit();
  } catch (err) {
    loading = null;
    clear(host, h("div", { class: "banner err" }, t("dialog.noXterm", { e: err instanceof Error ? err.message : String(err) })));
  }
}

async function start(resume?: string): Promise<void> {
  try {
    if (!live()) {
      term?.reset();
      await api(`/api/projects/${project}/dialog`, { body: { ...size(), resume } });
    }
    await refresh();
    term?.focus();
  } catch (err) {
    fail(err);
  }
}

export async function continueDialog(id: string, sessionId: string): Promise<void> {
  project = id;
  await start(sessionId);
}

/** Блок диалога на вкладке «Диалоги» проекта. Без проекта диалог не запускается — id обязателен. */
export function dialogPanel(id: string, changed?: () => void): HTMLElement {
  const fresh = project !== id;
  project = id;
  onChange = changed ?? null;
  if (!root) {
    host = h("div", { class: "term-host" });
    pill = h("span", { class: "pill" });
    hint = h("span", { class: "hint" });
    openBtn = h("button", { class: "btn small primary", onclick: () => void start() });
    stopBtn = h("button", { class: "btn small danger", onclick: () => void stop() });
    root = h("div", { class: "term" }, h("div", { class: "term-head" }, h("b", null, t("dialog.title")), pill, hint, h("span", { class: "grow" }), openBtn, stopBtn), host);
    new ResizeObserver(() => refit()).observe(host);
  }
  stopBtn.textContent = t("dialog.stop");
  if (fresh) {
    term?.reset();
    state = {};
  }
  paint();
  requestAnimationFrame(() => void mount());
  void refresh();
  return root;
}

async function stop(): Promise<void> {
  if (!(await confirmBox(t("dialog.stopTitle"), t("dialog.stopText", { project }), t("dialog.stop"), "danger"))) return;
  try {
    await api(`/api/projects/${project}/dialog/stop`, { method: "POST" });
    await refresh();
  } catch (err) {
    fail(err);
  }
}
