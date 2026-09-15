import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../lib/i18n.ts";

// Режим «Композиция» редактора (S3, блок 3): собранная композиция HyperFrames (build/index.html) в iframe на паузе.
// Страницу отдаёт GET /api/projects/:id/composition — index.html с <base> на build/ и рантаймом HyperFrames
// (он грузит подкомпозиции и кладёт window.__player). Курсор двигает время через __player.renderSeek — тот же
// вызов, которым рендерер ставит кадр; ничего не проигрывается, звука нет, ffmpeg и рендера нет.

export interface CompositionHandle {
  /** Ставит время (с) и ждёт готовый кадр; ответ — мс от вызова до кадра. Частые вызовы склеиваются: побеждает последний. */
  seek(t: number): Promise<number>;
  duration: number;
}

interface HfPlayer {
  renderSeek(t: number, opts?: { suppressEvents?: boolean }): void;
  getDuration(): number;
  pause?(): void;
}
type HfWindow = Window & typeof globalThis & { __player?: HfPlayer; __renderReady?: boolean };

const W = 1080;
const H = 1920;
const READY_TIMEOUT_MS = 20000;
const MEDIA_TIMEOUT_MS = 1500;

/** Видео встало на кадр: seeking снят (или событие seeked), данные кадра есть. Звук не ждём. */
function mediaSettled(doc: Document): Promise<void> {
  const busy = [...doc.querySelectorAll("video")].filter((v) => v.seeking || (v.readyState < 2 && v.getAttribute("src")));
  if (!busy.length) return Promise.resolve();
  return new Promise((done) => {
    let left = busy.length;
    const timer = setTimeout(done, MEDIA_TIMEOUT_MS);
    for (const v of busy) {
      const ok = (): void => {
        v.removeEventListener("seeked", ok);
        v.removeEventListener("loadeddata", ok);
        if (--left === 0) {
          clearTimeout(timer);
          done();
        }
      };
      v.addEventListener("seeked", ok);
      v.addEventListener("loadeddata", ok);
    }
  });
}

function makeHandle(win: HfWindow, player: HfPlayer): CompositionHandle {
  const raf = (): Promise<void> => new Promise((r) => win.requestAnimationFrame(() => r()));
  let waiters: { since: number; done: (ms: number) => void }[] = [];
  let target: number | null = null;
  let busy = false;
  const pump = async (): Promise<void> => {
    if (busy || target === null) return;
    busy = true;
    while (target !== null) {
      const time = target;
      const batch = waiters;
      target = null;
      waiters = [];
      try {
        player.renderSeek(time);
      } catch {
        /* кадр не встал — курсор всё равно отпускаем */
      }
      // кадр 1: рантайм применил время и синхронизировал медиа; ждём, пока видео доищет кадр; кадр 2: отрисовано
      await raf();
      await mediaSettled(win.document);
      await raf();
      const end = performance.now();
      for (const w of batch) w.done(end - w.since);
    }
    busy = false;
  };
  return {
    duration: player.getDuration() || Number(win.document.querySelector("[data-composition-id]")?.getAttribute("data-duration")) || 0,
    seek(time: number): Promise<number> {
      return new Promise((done) => {
        target = Math.max(0, Number(time) || 0);
        waiters.push({ since: performance.now(), done });
        void pump();
      });
    },
  };
}

export function CompositionFrame(props: { id: string; url: string; width: number; onReady?: (h: CompositionHandle) => void; onError?: (text: string) => void }): JSX.Element {
  const { id, url, width } = props;
  const frame = useRef<HTMLIFrameElement>(null);
  const cb = useRef(props);
  cb.current = props;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    setState("loading");
    const el = frame.current;
    if (!el) return;
    let stopped = false;
    let poll = 0;
    const fail = (text: string): void => {
      if (stopped) return;
      stopped = true;
      setError(text);
      setState("error");
      cb.current.onError?.(text);
    };
    const onLoad = (): void => {
      const started = performance.now();
      const check = (): void => {
        if (stopped) return;
        let win: HfWindow | null = null;
        try {
          win = el.contentWindow as HfWindow | null;
        } catch {
          return fail(t("composition.failed"));
        }
        const doc = win?.document;
        if (win && doc && !doc.querySelector("[data-composition-id]")) {
          // 404 с текстом сервера («композиции нет — проект не собирался») или чужая страница
          return fail(doc.body?.textContent?.trim() || t("composition.missing"));
        }
        const player = win?.__player;
        if (win && player && typeof player.renderSeek === "function" && win.__renderReady) {
          stopped = true;
          player.pause?.();
          const handle = makeHandle(win, player);
          void handle.seek(0).then(() => {
            setState("ready");
            cb.current.onReady?.(handle);
          });
          return;
        }
        if (performance.now() - started > READY_TIMEOUT_MS) return fail(t("composition.timeout"));
        poll = window.setTimeout(check, 30);
      };
      check();
    };
    el.addEventListener("load", onLoad);
    return () => {
      stopped = true;
      clearTimeout(poll);
      el.removeEventListener("load", onLoad);
    };
  }, [id, url]);

  const scale = width / W;
  return (
    <div style={{ position: "relative", width: `${width}px`, height: `${Math.round(H * scale)}px`, overflow: "hidden", background: "#000" }}>
      <iframe
        key={url}
        ref={frame}
        src={url}
        title={`composition ${id}`}
        tabIndex={-1}
        scrolling="no"
        style={{ position: "absolute", left: 0, top: 0, width: `${W}px`, height: `${H}px`, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none", visibility: state === "ready" ? "visible" : "hidden" }}
      />
      {state !== "ready" ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", textAlign: "center", color: state === "error" ? "#fff" : "#888", font: "13px/1.4 system-ui, sans-serif" }}>
          {state === "error" ? error : t("composition.loading")}
        </div>
      ) : null}
    </div>
  );
}
