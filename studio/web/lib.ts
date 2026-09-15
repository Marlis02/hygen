// Shared helpers of the studio page: strings (studio/i18n/<lang>.json), a DOM builder, the API client, toasts, dialogs,
// and a job view that polls a long command of the server (build, preview, download, doctor, director).

export type Dict = Record<string, any>;
let strings: Dict = {};
let fallback: Dict = {};
export const LANGS = ["ru", "en"];

/** Language of the panel (Настройки → язык): localStorage, Russian by default. */
export function lang(): string {
  try {
    const v = localStorage.getItem("studio.lang");
    return v && LANGS.includes(v) ? v : "ru";
  } catch {
    return "ru";
  }
}

const lookup = (from: Dict, key: string): any => key.split(".").reduce<any>((o, k) => (o == null ? undefined : o[k]), from);

/** studio/i18n/<lang>.json; a key missing there falls back to ru.json. */
export async function loadStrings(): Promise<void> {
  const load = async (code: string): Promise<Dict> => (await fetch(`/i18n/${code}.json`)).json();
  fallback = await load("ru");
  strings = lang() === "ru" ? fallback : await load(lang()).catch(() => fallback);
  document.documentElement.lang = lang();
}

/** A string of i18n/ru.json by dotted key with {name} placeholders; a missing key shows itself. */
export function t(key: string, vars?: Record<string, unknown>): string {
  const v = lookup(strings, key) ?? lookup(fallback, key);
  const s = typeof v === "string" ? v : key;
  return vars ? s.replace(/\{(\w+)\}/g, (_: string, k: string) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k]))) : s;
}

/** A raw node of the strings (an object of labels). */
export const tn = (key: string): any => lookup(strings, key) ?? lookup(fallback, key);

type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Dict | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "value") (el as unknown as HTMLInputElement).value = String(v);
    else if (k === "checked") (el as unknown as HTMLInputElement).checked = Boolean(v);
    else if (k === "selected") (el as unknown as HTMLOptionElement).selected = Boolean(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  add(el, children);
  return el;
}

function add(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) add(el, c);
    else el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
}

export function clear<E extends Element>(el: E, ...children: Child[]): E {
  el.replaceChildren();
  add(el, children);
  return el;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: Blob; query?: Dict } = {}): Promise<T> {
  const params = Object.entries(opts.query ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  const q = params.length ? `?${new URLSearchParams(params.map(([k, v]) => [k, String(v)])).toString()}` : "";
  const method = opts.method ?? (opts.body !== undefined || opts.raw ? "POST" : "GET");
  const res = await fetch(path + q, { method, headers: { "X-Hygen": "1", ...(opts.raw || opts.body === undefined ? {} : { "Content-Type": "application/json" }) }, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export function toast(text: string, kind: "ok" | "err" | "info" = "ok"): void {
  const el = h("div", { class: `toast ${kind}` }, text);
  document.getElementById("toasts")?.appendChild(el);
  setTimeout(() => el.remove(), kind === "err" ? 9000 : 4000);
}

export const fail = (err: unknown): void => toast(err instanceof Error ? err.message : String(err), "err");

export function modal(title: string, content: Child, actions: { label: string; kind?: string; onClick?: () => unknown }[]): { close: () => void } {
  const back = h("div", { class: "modal-back" });
  const close = (): void => back.remove();
  const buttons = actions.map((a) =>
    h("button", {
      class: `btn ${a.kind ?? ""}`,
      onclick: async () => {
        try {
          const keep = await a.onClick?.();
          if (keep !== false) close();
        } catch (err) {
          fail(err);
        }
      },
    }, a.label),
  );
  back.appendChild(h("div", { class: "modal" }, h("h2", null, title), content, h("div", { class: "actions" }, buttons)));
  back.addEventListener("click", (e) => {
    if (e.target === back) close();
  });
  document.body.appendChild(back);
  return { close };
}

export function confirmBox(title: string, text: Child, ok = t("common.ok"), kind = "primary"): Promise<boolean> {
  return new Promise((done) => {
    modal(title, h("div", null, text), [
      { label: t("common.cancel"), onClick: () => done(false) },
      { label: ok, kind, onClick: () => done(true) },
    ]);
  });
}

/** Poll a job: the log comes in slices (from = lines already seen). */
export function watchJob(id: string, onUpdate: (job: Dict) => void, onDone?: (job: Dict) => void): () => void {
  let from = 0;
  let log: string[] = [];
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const j = await api(`/api/jobs/${encodeURIComponent(id)}`, { query: { from } });
      log = log.concat(j.log);
      from = j.logTotal;
      const job = { ...j, log };
      onUpdate(job);
      if (j.status !== "running") {
        onDone?.(job);
        return;
      }
    } catch (err) {
      onUpdate({ id, title: "", status: "fail", stages: [], log: log.concat([String(err)]) });
      return;
    }
    setTimeout(tick, 1000);
  };
  void tick();
  return () => {
    stopped = true;
  };
}

/** A job box in a container: stages, status, a stop button and a folding log that keeps its scroll. */
/**
 * Видео грузится, только когда его видно: девяносто превью разом превращали галерею в слайд-шоу.
 * Наблюдатель заводится при первом превью — модуль читает и смоук-тест форм, где браузерного API нет.
 */
let onScreen: IntersectionObserver | null = null;
function watchOnScreen(v: HTMLVideoElement): void {
  if (typeof IntersectionObserver === "undefined") {
    if (v.dataset.src) v.src = v.dataset.src;
    return;
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
}

/** Превью-ролик карточки: грузится по появлению на экране, играет по наведению, стоит на середине клипа. */
export function lazyVideo(url: string): HTMLVideoElement {
  const v = h("video", { muted: true, loop: true, playsinline: true, preload: "none" });
  v.dataset.src = url;
  // the first frame is often empty (the element enters on its word): stand the card on the middle of the clip
  v.addEventListener("loadedmetadata", () => {
    if (v.paused) v.currentTime = (v.duration || 3) * 0.6;
  });
  v.addEventListener("mouseenter", () => void v.play().catch(() => undefined));
  v.addEventListener("mouseleave", () => v.pause());
  watchOnScreen(v);
  return v;
}

export function mountJob(box: HTMLElement, id: string, onDone?: (job: Dict) => void): void {
  const head = h("div", { class: "job-head" });
  const stages = h("div", { class: "stages" });
  const note = h("div", { class: "note" });
  const pre = h("pre", { class: "log" });
  const details = h("details", { class: "logbox" }, h("summary", null, t("job.log")), pre);
  clear(box, h("div", { class: "job" }, head, stages, note, details));
  // сборка идёт минутами, задача опрашивается раз в секунду — перерисовываем только то, что правда изменилось,
  // а строки лога дописываем, а не переписываем целиком (иначе страница дёргается всю сборку)
  let shownStatus = "";
  let shownStages = "";
  let shownNote = "";
  let shownLines = 0;
  watchJob(
    id,
    (job) => {
      const status = `${job.title ?? ""}|${job.status}`;
      if (status !== shownStatus) {
        shownStatus = status;
        clear(head, h("b", null, job.title ?? ""), h("span", { class: `pill pill-${job.status}` }, t(`job.status.${job.status}`)), job.status === "running" ? h("button", { class: "btn small ghost", onclick: () => api(`/api/jobs/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(fail) }, t("job.stop")) : null);
      }
      const marks = (job.stages ?? []).map((s: Dict) => `${s.key}:${s.state}`).join(",");
      if (marks !== shownStages) {
        shownStages = marks;
        clear(stages, (job.stages ?? []).map((s: Dict) => h("span", { class: `stage st-${s.state}` }, t(`stages.${s.key}`))));
        stages.hidden = !(job.stages ?? []).length;
      }
      if (job.note !== shownNote) {
        shownNote = job.note ?? "";
        note.textContent = job.note ? t(`job.notes.${job.note}`) : "";
        note.hidden = !job.note;
      }
      const lines = (job.log ?? []) as string[];
      if (lines.length !== shownLines) {
        const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 24;
        if (lines.length > shownLines && shownLines > 0) pre.appendChild(document.createTextNode((shownLines ? "\n" : "") + lines.slice(shownLines).join("\n")));
        else pre.textContent = lines.slice(-800).join("\n");
        shownLines = lines.length;
        if (atBottom) pre.scrollTop = pre.scrollHeight;
      }
      if (job.status === "fail") details.open = true;
    },
    onDone,
  );
}

export const fmtSec = (s: number | null | undefined): string => (typeof s === "number" ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "—");
export const fmtBytes = (n: number): string => (n > 1e6 ? `${(n / 1e6).toFixed(1)} ${t("units.mb")}` : `${Math.max(1, Math.round(n / 1e3))} ${t("units.kb")}`);
export const fmtDate = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString(lang() === "en" ? "en-GB" : "ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h("textarea", { style: "position:fixed;opacity:0" }, text);
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(t("common.copied"));
}

export const statusPill = (status: string): HTMLElement => h("span", { class: `pill s-${status}` }, t(`status.${status}`));

export const go = (hash: string): void => {
  location.hash = hash;
};

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
