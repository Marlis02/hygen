import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { lang, t } from "./i18n.ts";
import type { Dict } from "./i18n.ts";

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: Blob; query?: Dict } = {}): Promise<T> {
  const params = Object.entries(opts.query ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  const q = params.length ? `?${new URLSearchParams(params.map(([k, v]) => [k, String(v)])).toString()}` : "";
  const method = opts.method ?? (opts.body !== undefined || opts.raw ? "POST" : "GET");
  const res = await fetch(path + q, { method, headers: { "X-Hygen": "1", ...(opts.raw || opts.body === undefined ? {} : { "Content-Type": "application/json" }) }, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

/**
 * Данные экрана: первая загрузка показывает «загрузка», а reload() перечитывает тихо — старые данные остаются
 * на экране, Preact сверяет разницу, и открытые карточки, превью и прокрутка не теряются.
 */
export function useApi<T = Dict>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const next = await load();
      if (my === seq.current) {
        setData(next);
        setError(null);
      }
    } catch (err) {
      if (my === seq.current) setError(err instanceof Error ? err.message : String(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    setData(null);
    setError(null);
    void reload();
  }, [reload]);
  return { data, error, reload };
}

export const fmtSec = (s: number | null | undefined): string => (typeof s === "number" ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "—");
export const fmtBytes = (n: number): string => (n > 1e6 ? `${(n / 1e6).toFixed(1)} ${t("units.mb")}` : `${Math.max(1, Math.round(n / 1e3))} ${t("units.kb")}`);
export const fmtDate = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString(lang() === "en" ? "en-GB" : "ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

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

export const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));
