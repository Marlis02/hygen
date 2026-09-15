// Минимальный DOM для смоук-теста форм (studio/check.ts): studio/web/forms.ts — это код страницы, и проверять его
// стоит тем же кодом, а не копией. Здесь ровно то, чем пользуются lib.ts h() и forms.ts: createElement, атрибуты,
// дети, classList и querySelector по имени тега.

class El {
  readonly tag: string;
  readonly children: El[] = [];
  readonly attrs: Record<string, string> = {};
  className = "";
  value = "";
  checked = false;
  textContent = "";
  readonly classList = {
    add: (c: string): void => {
      this.className = `${this.className} ${c}`.trim();
    },
    remove: (c: string): void => {
      this.className = this.className.split(/\s+/).filter((x) => x && x !== c).join(" ");
    },
  };
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};

  constructor(tag: string) {
    this.tag = tag;
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  appendChild(child: El): El {
    this.children.push(child);
    return child;
  }
  replaceChildren(...items: El[]): void {
    this.children.length = 0;
    this.children.push(...items);
  }
  addEventListener(): void {
    // the check renders the form, it does not click it
  }
  querySelector(sel: string): El | null {
    for (const c of this.children) {
      if (c.tag === sel) return c;
      const deep = c.querySelector(sel);
      if (deep) return deep;
    }
    return null;
  }
}

export function installDom(): void {
  const g = globalThis as Record<string, any>;
  if (g.document) return;
  g.document = {
    createElement: (tag: string) => new El(tag),
    createTextNode: (text: string) => Object.assign(new El("#text"), { textContent: text }),
    getElementById: () => null,
    head: new El("head"),
    body: new El("body"),
    documentElement: new El("html"),
  };
  g.localStorage = undefined;
  g.fetch ??= (() => Promise.reject(new Error("нет сети в смоук-тесте"))) as unknown;
}
