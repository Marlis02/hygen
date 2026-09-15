import { signal } from "@preact/signals";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api, errText } from "./api.ts";
import { t } from "./i18n.ts";
import type { Dict } from "./i18n.ts";

// Общие куски страницы: тосты, модальные окна, вид задачи сервера, ленивое видео, пилюля статуса, иконки.

// ── тосты ────────────────────────────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  text: string;
  kind: "ok" | "err" | "info";
}
const toasts = signal<Toast[]>([]);
let toastSeq = 0;

export function toast(text: string, kind: Toast["kind"] = "ok"): void {
  const item = { id: ++toastSeq, text, kind };
  toasts.value = [...toasts.value, item];
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== item.id)), kind === "err" ? 9000 : 4000);
}

export const fail = (err: unknown): void => toast(errText(err), "err");

export function Toasts(): JSX.Element {
  return (
    <div id="toasts">
      {toasts.value.map((x) => (
        <div key={x.id} class={`toast ${x.kind}`}>
          {x.text}
        </div>
      ))}
    </div>
  );
}

// ── модальные окна ───────────────────────────────────────────────────────────────────────────────────

export interface ModalAction {
  label: string;
  kind?: string;
  /** false — окно остаётся открытым; исключение показывается тостом, окно тоже остаётся. */
  onClick?: () => unknown;
}
interface ModalItem {
  id: number;
  title: string;
  content: () => ComponentChildren;
  actions: ModalAction[];
  onClose?: () => void;
}
const modals = signal<ModalItem[]>([]);
let modalSeq = 0;

/** content — функция-компонент: окно может держать своё состояние (поля ввода, выбор). */
export function modal(title: string, content: () => ComponentChildren, actions: ModalAction[], onClose?: () => void): { close: () => void } {
  const item: ModalItem = { id: ++modalSeq, title, content, actions, onClose };
  const close = (): void => {
    if (!modals.value.includes(item)) return;
    modals.value = modals.value.filter((m) => m !== item);
    item.onClose?.();
  };
  modals.value = [...modals.value, item];
  return { close };
}

function ModalBox({ item }: { item: ModalItem }): JSX.Element {
  const close = (): void => {
    modals.value = modals.value.filter((m) => m !== item);
    item.onClose?.();
  };
  const Body = item.content;
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="modal">
        <h2>{item.title}</h2>
        <Body />
        <div class="actions">
          {item.actions.map((a) => (
            <button
              key={a.label}
              class={`btn ${a.kind ?? ""}`}
              onClick={async () => {
                try {
                  const keep = await a.onClick?.();
                  if (keep !== false) close();
                } catch (err) {
                  fail(err);
                }
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Modals(): JSX.Element {
  return (
    <>
      {modals.value.map((m) => (
        <ModalBox key={m.id} item={m} />
      ))}
    </>
  );
}

export function confirmBox(title: string, text: ComponentChildren, ok = t("common.ok"), kind = "primary"): Promise<boolean> {
  return new Promise((done) => {
    let answered = false;
    modal(
      title,
      () => <div>{text}</div>,
      [
        { label: t("common.cancel"), onClick: () => ((answered = true), done(false)) },
        { label: ok, kind, onClick: () => ((answered = true), done(true)) },
      ],
      () => !answered && done(false),
    );
  });
}

// ── задача сервера ───────────────────────────────────────────────────────────────────────────────────

/**
 * Вид задачи (сборка, превью, doctor): этапы, статус, «Стоп» и лог. Задача опрашивается раз в секунду; Preact
 * меняет только то, что правда изменилось, а строки лога дописываются в конец, а не переписываются целиком.
 */
export function JobView({ id, onDone }: { id: string; onDone?: (job: Dict) => void }): JSX.Element {
  const [job, setJob] = useState<Dict | null>(null);
  const pre = useRef<HTMLPreElement>(null);
  const shown = useRef(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    let stopped = false;
    let from = 0;
    let lines: string[] = [];
    shown.current = 0;
    if (pre.current) pre.current.textContent = "";
    const tick = async (): Promise<void> => {
      if (stopped) return;
      try {
        const j = await api(`/api/jobs/${encodeURIComponent(id)}`, { query: { from } });
        if (stopped) return;
        lines = lines.concat(j.log);
        from = j.logTotal;
        const el = pre.current;
        if (el && lines.length !== shown.current) {
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
          if (shown.current > 0) el.appendChild(document.createTextNode(`\n${lines.slice(shown.current).join("\n")}`));
          else el.textContent = lines.slice(-800).join("\n");
          shown.current = lines.length;
          if (atBottom) el.scrollTop = el.scrollHeight;
        }
        setJob((prev) => (prev && prev.status === j.status && prev.note === j.note && JSON.stringify(prev.stages) === JSON.stringify(j.stages) && prev.title === j.title ? prev : j));
        if (j.status !== "running") {
          done.current?.({ ...j, log: lines });
          return;
        }
      } catch (err) {
        setJob({ id, title: "", status: "fail", stages: [], log: [errText(err)] });
        return;
      }
      setTimeout(tick, 1000);
    };
    void tick();
    return () => {
      stopped = true;
    };
  }, [id]);
  const stages = (job?.stages ?? []) as Dict[];
  return (
    <div class="job">
      <div class="job-head">
        <b>{job?.title ?? ""}</b>
        {job ? <span class={`pill pill-${job.status}`}>{t(`job.status.${job.status}`)}</span> : null}
        {job?.status === "running" ? (
          <button class="btn small ghost" onClick={() => api(`/api/jobs/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(fail)}>
            {t("job.stop")}
          </button>
        ) : null}
      </div>
      <div class="stages" hidden={!stages.length}>
        {stages.map((s) => (
          <span key={s.key} class={`stage st-${s.state}`}>
            {t(`stages.${s.key}`)}
          </span>
        ))}
      </div>
      <div class="note" hidden={!job?.note}>
        {job?.note ? t(`job.notes.${job.note}`) : ""}
      </div>
      <details class="logbox" open={job?.status === "fail" ? true : undefined}>
        <summary>{t("job.log")}</summary>
        <pre class="log" ref={pre} />
      </details>
    </div>
  );
}

// ── ленивое видео ────────────────────────────────────────────────────────────────────────────────────

/** Видео грузится, только когда его видно: девяносто превью разом превращали галерею в слайд-шоу. */
let onScreen: IntersectionObserver | null = null;
function watchOnScreen(v: HTMLVideoElement): () => void {
  if (typeof IntersectionObserver === "undefined") {
    if (v.dataset.src) v.src = v.dataset.src;
    return () => undefined;
  }
  onScreen ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLVideoElement;
        if (!e.isIntersecting || !el.dataset.src) continue;
        el.src = el.dataset.src;
        delete el.dataset.src;
        onScreen?.unobserve(el);
      }
    },
    { rootMargin: "300px" },
  );
  onScreen.observe(v);
  return () => onScreen?.unobserve(v);
}

/** Превью-ролик карточки: грузится по появлению на экране, играет по наведению, стоит на середине клипа. */
export function LazyVideo({ src }: { src: string }): JSX.Element {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.dataset.src = src;
    return watchOnScreen(v);
  }, [src]);
  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="none"
      // первый кадр часто пуст (элемент входит на своём слове): ставим карточку на середину клипа
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (v.paused) v.currentTime = (v.duration || 3) * 0.6;
      }}
      onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
      onMouseLeave={(e) => e.currentTarget.pause()}
    />
  );
}

// ── мелочи ───────────────────────────────────────────────────────────────────────────────────────────

export const StatusPill = ({ status }: { status: string }): JSX.Element => <span class={`pill s-${status}`}>{t(`status.${status}`)}</span>;

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(t("common.copied"));
}

// Tabler Icons 3.34.1 (MIT, © Paweł Kuna), outline — встроены: панель работает без сети.
const PATHS: Record<string, string> = {
  "layout-grid": '<path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/><path d="M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"/>',
  plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
  sparkles: '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"/>',
  palette: '<path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25"/><path d="M8.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  terminal: '<path d="M5 7l5 5l-5 5"/><path d="M12 19l7 0"/>',
  settings: '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
};

export const Icon = ({ name, size = 20 }: { name: string; size?: number }): JSX.Element => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] ?? "" }} />
);
