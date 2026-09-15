// Строки панели: studio/i18n/<lang>.json; ключа нет в выбранном языке — берётся ru.json.

export type Dict = Record<string, any>;
let strings: Dict = {};
let fallback: Dict = {};
export const LANGS = ["ru", "en"];

/** Язык панели (Настройки → язык): localStorage, по умолчанию русский. */
export function lang(): string {
  try {
    const v = localStorage.getItem("studio.lang");
    return v && LANGS.includes(v) ? v : "ru";
  } catch {
    return "ru";
  }
}

const lookup = (from: Dict, key: string): any => key.split(".").reduce<any>((o, k) => (o == null ? undefined : o[k]), from);

export async function loadStrings(): Promise<void> {
  const load = async (code: string): Promise<Dict> => (await fetch(`/i18n/${code}.json`)).json();
  fallback = await load("ru");
  strings = lang() === "ru" ? fallback : await load(lang()).catch(() => fallback);
  document.documentElement.lang = lang();
}

/** Для смоук-теста в Node: строки подставляются объектом, без fetch. */
export function setStrings(ru: Dict): void {
  fallback = ru;
  strings = ru;
}

/** Строка по ключу с подстановками {name}; отсутствующий ключ показывает сам себя. */
export function t(key: string, vars?: Record<string, unknown>): string {
  const v = lookup(strings, key) ?? lookup(fallback, key);
  const s = typeof v === "string" ? v : key;
  return vars ? s.replace(/\{(\w+)\}/g, (_: string, k: string) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k]))) : s;
}

/** Сырой узел строк (объект подписей). */
export const tn = (key: string): any => lookup(strings, key) ?? lookup(fallback, key);
