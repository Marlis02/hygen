import { api, clear, confirmBox, fail, h, t } from "./lib.ts";

// The one terminal of the panel: xterm.js over the server's node-pty shell (studio/terminal.ts). The element and its event
// stream are made once and moved between the «Режиссёр» tabs — switching projects changes only the hint in the header.

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
let hint: HTMLElement;
let pill: HTMLElement;
let shortBtn: HTMLButtonElement;
let project: string | null = null;
let state: Record<string, any> = { running: false };
let chain: Promise<unknown> = Promise.resolve();
let resizeTimer: ReturnType<typeof setTimeout> | undefined;

const size = (): Record<string, number> => (term ? { cols: term.cols, rows: term.rows } : {});
const data = (e: Event): any => JSON.parse((e as MessageEvent).data);

function setState(next: Record<string, any>): void {
  state = next;
  pill.className = `pill ${state.running ? "pill-ok" : ""}`;
  pill.textContent = state.running ? t("terminal.running", { process: state.process ?? "" }) : t("terminal.stopped");
  hint.textContent = t("terminal.hint", { cwd: state.cwd ?? "", project: project ?? "—" });
}

function refit(): void {
  if (!term || !fit || !host.isConnected || !host.dataset.opened) return;
  fit.fit();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.running) void api("/api/terminal/resize", { body: size() }).catch(() => undefined);
  }, 150);
}

function connect(): void {
  const es = new EventSource("/api/terminal/stream");
  es.addEventListener("state", (e) => setState(data(e)));
  es.addEventListener("replay", (e) => {
    term?.reset();
    term?.write(data(e));
  });
  es.addEventListener("data", (e) => term?.write(data(e)));
  es.addEventListener("start", (e) => {
    term?.reset();
    setState(data(e));
    refit();
  });
  es.addEventListener("exit", (e) => {
    const x = data(e);
    setState({ ...state, running: false, process: null, lastExit: x });
    term?.write(`\r\n\x1b[2m[${t("terminal.exited", { code: x.code })}]\x1b[0m\r\n`);
  });
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
    if (!state.running) return;
    chain = chain.then(() => api("/api/terminal/input", { body: { data: keys } })).catch(() => undefined);
  });
  term = made;
  connect();
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
    clear(host, h("div", { class: "banner err" }, t("terminal.noXterm", { e: err instanceof Error ? err.message : String(err) })));
  }
}

async function act(path: string, extra: Record<string, unknown> = {}): Promise<void> {
  try {
    setState(await api(path, { body: { ...size(), ...extra } }));
    term?.focus();
  } catch (err) {
    fail(err);
  }
}

/** The terminal block for a project's «Режиссёр» tab (or the director home without a project). */
export function terminalPanel(projectId: string | null): HTMLElement {
  project = projectId;
  if (!root) {
    host = h("div", { class: "term-host" });
    hint = h("span", { class: "hint" });
    pill = h("span", { class: "pill" });
    shortBtn = h("button", { class: "btn small", onclick: () => project && act("/api/terminal/short", { id: project }) });
    const stop = async (): Promise<void> => {
      if (await confirmBox(t("terminal.stopTitle"), t("terminal.stopText"), t("terminal.stop"), "danger")) await act("/api/terminal/stop");
    };
    root = h(
      "div",
      { class: "term" },
      h("div", { class: "term-head" }, h("b", null, t("terminal.title")), pill, hint, h("span", { class: "grow" }), h("button", { class: "btn small ghost", onclick: () => act("/api/terminal/start") }, t("terminal.start")), h("button", { class: "btn small primary", onclick: () => act("/api/terminal/claude") }, t("terminal.claude")), shortBtn, h("button", { class: "btn small danger", onclick: stop }, t("terminal.stop"))),
      host,
    );
    new ResizeObserver(() => refit()).observe(host);
    setState(state);
  }
  shortBtn.textContent = t("terminal.short");
  shortBtn.disabled = !projectId;
  shortBtn.title = projectId ? `/short ${projectId}` : t("terminal.shortNone");
  setState(state);
  requestAnimationFrame(() => void mount());
  return root;
}
