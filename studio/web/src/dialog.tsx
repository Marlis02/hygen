import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "./lib/api.ts";
import { t } from "./lib/i18n.ts";
import type { Dict } from "./lib/i18n.ts";
import { onLive, readDialogs } from "./lib/live.ts";
import { confirmBox, fail, toast } from "./lib/ui.tsx";

// Диалог с режиссёром: xterm.js над pty сервера, один диалог на проект. Терминал живёт на сервере — закрытие вкладки
// его не завершает; «Завершить» спрашивает подтверждение. Ничего не запускается само: только «Открыть диалог».
// xterm — императивный островок: один терминал на вкладку, его узел переносится в панель открытого проекта.

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
let host: HTMLElement | null = null;
/** Проект, чей вывод сейчас в терминале, и жив ли его диалог: вывод другого проекта сюда не пишется. */
let shown = "";
let shownLive = false;
let chain: Promise<unknown> = Promise.resolve();

async function loadXterm(): Promise<void> {
  const [xterm, addon] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit"), import("@xterm/xterm/css/xterm.css")]);
  const made = new xterm.Terminal({ fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace', fontSize: 13, lineHeight: 1.15, cursorBlink: true, scrollback: 5000, theme: { background: "#0a0a0a", foreground: "#e6e6e6", cursor: "#f2f2f2", selectionBackground: "#3a3a3a" } }) as unknown as Term;
  fit = new addon.FitAddon();
  made.loadAddon(fit);
  made.onData((keys) => {
    if (!shownLive) return;
    const project = shown;
    chain = chain.then(() => api(`/api/projects/${project}/dialog/input`, { body: { data: keys } })).catch(() => undefined);
  });
  onLive((msg) => {
    if (msg.project !== shown) return;
    if (msg.type === "dialog") term?.write(String(msg.data));
    else if (msg.type === "dialog-exit") term?.write(`\r\n\x1b[2m[${t("dialog.exited", { code: msg.code })}]\x1b[0m\r\n`);
  });
  host = document.createElement("div");
  host.className = "term-host";
  term = made;
}

const size = (): Dict => (term ? { cols: term.cols, rows: term.rows } : {});

/** «Завершить» диалог откуда угодно: осиротевший терминал не должен держать лимит диалогов. */
export async function stopDialogOf(project: string): Promise<boolean> {
  if (!(await confirmBox(t("dialog.stopTitle"), t("dialog.stopText", { project }), t("dialog.stop"), "danger"))) return false;
  try {
    await api(`/api/projects/${encodeURIComponent(project)}/dialog/stop`, { method: "POST" });
    toast(t("dialog.stoppedToast", { project }));
    await readDialogs();
    return true;
  } catch (err) {
    fail(err);
    return false;
  }
}

/** Блок диалога на вкладке «Диалоги» проекта. Без проекта диалог не запускается — id обязателен. */
export function DialogPanel({ id, onChange }: { id: string; onChange?: () => void }): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<Dict>({});
  const [xtermError, setXtermError] = useState<string | null>(null);
  const live = Boolean(state.dialog);
  shownLive = live && shown === id;

  const refresh = async (): Promise<void> => {
    try {
      const next = await api<Dict>(`/api/projects/${id}/dialog`);
      setState((prev) => {
        // диалог уже шёл до открытия вкладки: показываем накопленный вывод один раз
        if (next.dialog && next.buffer && !prev.dialog) {
          term?.reset();
          term?.write(next.buffer);
        }
        return next;
      });
      onChange?.();
    } catch (err) {
      fail(err);
    }
  };

  useEffect(() => {
    let alive = true;
    if (shown !== id) {
      term?.reset();
      shown = id;
    }
    const observer = new ResizeObserver(() => refit());
    const refit = (): void => {
      if (!term || !fit || !host?.isConnected) return;
      fit.fit();
      if (shownLive) void api(`/api/projects/${id}/dialog/resize`, { body: size() }).catch(() => undefined);
    };
    loading ??= loadXterm();
    loading.then(
      () => {
        if (!alive || !box.current || !host || !term) return;
        box.current.appendChild(host);
        if (!host.dataset.opened) {
          term.open(host);
          host.dataset.opened = "1";
        }
        observer.observe(host);
        refit();
        void refresh();
      },
      (err) => {
        loading = null;
        setXtermError(String(err instanceof Error ? err.message : err));
      },
    );
    const off = onLive((msg) => {
      if (msg.project === id && (msg.type === "dialog-start" || msg.type === "dialog-exit")) void refresh();
    });
    return () => {
      alive = false;
      observer.disconnect();
      off();
      host?.remove();
    };
  }, [id]);

  const start = async (resume?: string): Promise<void> => {
    try {
      if (!live) {
        term?.reset();
        await api(`/api/projects/${id}/dialog`, { body: { ...size(), resume } });
      }
      await refresh();
      term?.focus();
    } catch (err) {
      fail(err);
    }
  };

  const past = (state.list ?? []) as Dict[];
  return (
    <div class="term">
      <div class="term-head">
        <b>{t("dialog.title")}</b>
        <span class={`pill ${live ? "pill-running" : ""}`}>{live ? t("dialog.running") : t("dialog.stopped")}</span>
        <span class="hint">{live ? t("dialog.hintRunning", { at: String(state.dialog?.startedAt ?? "").slice(11, 16) }) : t("dialog.hint", { project: id })}</span>
        <span class="grow" />
        <button class="btn small primary" disabled={!live && state.claude === null} title={state.claude === null ? t("director.noClaude") : undefined} onClick={() => void start(!live && past[0]?.sessionId ? String(past[0].sessionId) : undefined)}>
          {live ? t("dialog.focus") : past.length ? t("dialog.continue") : t("dialog.open")}
        </button>
        {!live && past.length ? (
          <button class="btn small" disabled={state.claude === null} onClick={() => void start()}>
            {t("dialog.openNew")}
          </button>
        ) : null}
        <button class="btn small danger" disabled={!live} onClick={() => void stopDialogOf(id).then((ok) => {
            if (ok) void refresh();
          })}>
          {t("dialog.stop")}
        </button>
      </div>
      {xtermError ? <div class="banner err">{t("dialog.noXterm", { e: xtermError })}</div> : null}
      <div ref={box} />
    </div>
  );
}

export async function continueDialog(id: string, sessionId: string): Promise<void> {
  await api(`/api/projects/${id}/dialog`, { body: { ...size(), resume: sessionId } });
}
