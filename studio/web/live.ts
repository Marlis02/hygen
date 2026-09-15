import type { Dict } from "./lib.ts";

// Живая панель (ROADMAP S2): один WebSocket на вкладку. Через него идут вывод диалога, прогресс задач и события
// файлов от chokidar; экраны подписываются на нужный тип и перечитывают только свои карточки.

type Handler = (msg: Dict) => void;
const handlers = new Set<Handler>();
let socket: WebSocket | null = null;
let retry = 0;
let statusEl: HTMLElement | null = null;

export function onLive(fn: Handler): () => void {
  handlers.add(fn);
  connect();
  return () => handlers.delete(fn);
}

export const liveOnline = (): boolean => socket?.readyState === WebSocket.OPEN;

export function setLiveIndicator(el: HTMLElement | null): void {
  statusEl = el;
  paint();
}

function paint(): void {
  if (!statusEl) return;
  statusEl.className = `live ${liveOnline() ? "on" : "off"}`;
  statusEl.title = liveOnline() ? "живые обновления включены" : "нет связи с сервером";
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const ws = new WebSocket(`ws://${location.host}/api/events`);
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    paint();
  };
  ws.onmessage = (e) => {
    let msg: Dict;
    try {
      msg = JSON.parse(e.data as string) as Dict;
    } catch {
      return;
    }
    for (const fn of [...handlers]) {
      try {
        fn(msg);
      } catch {
        // один сломанный экран не гасит канал
      }
    }
  };
  ws.onclose = () => {
    paint();
    // the server restarts while a page is open: come back on its own, backing off up to 8 s
    retry = Math.min(retry + 1, 8);
    setTimeout(connect, retry * 1000);
  };
  ws.onerror = () => ws.close();
}

/** Склейка 500 мс уже сделана на сервере; здесь — защита от очереди перерисовок одного экрана. */
export function debounce<T extends (...a: any[]) => void>(fn: T, ms = 300): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
