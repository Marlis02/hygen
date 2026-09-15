import { signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { Dict } from "./i18n.ts";

// Живая панель: один WebSocket на вкладку. Через него идут вывод диалога, прогресс задач и события файлов от chokidar.
// Состояние канала и список живых диалогов — сигналы; экраны подписываются на нужный тип сообщений через useLive.

type Handler = (msg: Dict) => void;
const handlers = new Set<Handler>();
let socket: WebSocket | null = null;
let retry = 0;

export const online = signal(false);
/** Живые диалоги режиссёра: бейдж в сайдбаре и список в «Режиссёре». */
export const liveDialogs = signal<{ project: string; startedAt: string }[]>([]);

export function onLive(fn: Handler): () => void {
  handlers.add(fn);
  connect();
  return () => {
    handlers.delete(fn);
  };
}

/** Подписка экрана на живой канал, пока экран смонтирован; обработчик всегда свежий, переподписки нет. */
export function useLive(fn: Handler): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onLive((msg) => ref.current(msg)), []);
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const ws = new WebSocket(`ws://${location.host}/api/events`);
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    online.value = true;
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
    online.value = false;
    // сервер перезапускается при открытой странице: возвращаемся сами, с паузой до 8 с
    retry = Math.min(retry + 1, 8);
    setTimeout(connect, retry * 1000);
  };
  ws.onerror = () => ws.close();
}

export async function readDialogs(): Promise<void> {
  try {
    const res = await fetch("/api/dialogs");
    const d = (await res.json()) as { running?: { project: string; startedAt: string }[] };
    const next = d.running ?? [];
    if (next.map((r) => r.project).join() !== liveDialogs.value.map((r) => r.project).join()) liveDialogs.value = next;
  } catch {
    // сервер перезапускается — канал вернётся сам
  }
}

export function startLive(): void {
  onLive((msg) => {
    if (msg.type === "dialog-start" || msg.type === "dialog-exit" || msg.type === "hello") void readDialogs();
  });
  void readDialogs();
}

/** Склейка 500 мс уже сделана на сервере; здесь — защита от очереди перерисовок одного экрана. */
export function debounce<T extends (...a: any[]) => void>(fn: T, ms = 300): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
