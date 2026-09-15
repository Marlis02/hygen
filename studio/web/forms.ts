import { h, t } from "./lib.ts";
import type { Dict } from "./lib.ts";

// Form fields from the engine's own definitions: params of device.json, scene.json, texture.json, text.schema.json and
// nodes of engine/scenes/schema.json. The panel keeps no copy of the lists — a new enum value in the engine shows up here.

export interface Def {
  type?: string;
  values?: string[];
  default?: unknown;
  description?: string;
  min?: number;
  max?: number;
  maxLength?: number;
}

const kindOf = (def: Def): string =>
  def.type ?? (Array.isArray(def.values) ? "enum" : typeof def.default === "number" ? "number" : typeof def.default === "boolean" ? "boolean" : typeof def.default === "string" ? "string" : "json");

export function field(name: string, def: Def, value: unknown, onChange: (v: unknown) => void, opts: { label?: string; wide?: boolean; options?: string[] } = {}): HTMLElement {
  const kind = opts.options ? "enum" : kindOf(def);
  const values = opts.options ?? def.values ?? [];
  let input: HTMLElement;
  if (kind === "enum") {
    const sel = h("select", null, h("option", { value: "" }, def.default !== undefined && def.default !== "" ? t("form.default", { v: String(def.default) }) : "—"), values.map((v) => h("option", { value: v, selected: value === v }, v)));
    if (value !== undefined && !values.includes(String(value))) sel.appendChild(h("option", { value: String(value), selected: true }, String(value)));
    sel.onchange = () => onChange(sel.value === "" ? undefined : sel.value);
    input = sel;
  } else if (kind === "boolean") {
    const cb = h("input", { type: "checkbox", checked: value === undefined ? def.default === true : value === true });
    cb.onchange = () => onChange(cb.checked);
    input = h("label", { class: "check" }, cb, value === undefined ? t("form.defaultShort") : "");
  } else if (kind === "number" || kind === "integer") {
    const inp = h("input", { type: "number", step: kind === "integer" ? "1" : "any", min: def.min, max: def.max, value: value === undefined ? "" : String(value), placeholder: def.default !== undefined ? String(def.default) : "" });
    inp.onchange = () => onChange(inp.value === "" ? undefined : Number(inp.value));
    input = inp;
  } else if (kind === "text") {
    const ta = h("textarea", { rows: "3", maxlength: def.maxLength }, value === undefined ? "" : String(value));
    ta.onchange = () => onChange(ta.value === "" ? undefined : ta.value);
    input = ta;
  } else if (["string", "at", "color", "image", "map"].includes(kind)) {
    const inp = h("input", { type: "text", maxlength: def.maxLength, value: value === undefined ? "" : String(value), placeholder: def.default !== undefined && def.default !== "" ? String(def.default) : kind === "at" ? t("form.atHint") : "" });
    inp.onchange = () => onChange(inp.value === "" ? undefined : kind === "at" && /^-?\d+(\.\d+)?$/.test(inp.value) ? Number(inp.value) : inp.value);
    input = inp;
  } else if (kind === "list" || kind === "ats") {
    const inp = h("input", { type: "text", value: Array.isArray(value) ? value.join(", ") : "", placeholder: Array.isArray(def.default) ? (def.default as unknown[]).join(", ") : t("form.listHint") });
    inp.onchange = () => {
      const s = inp.value.trim();
      onChange(s ? s.split(/\s*,\s*/).map((x) => (kind === "ats" && /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x)) : undefined);
    };
    input = inp;
  } else input = jsonInput(value, onChange, def.default);
  return h("div", { class: `field${opts.wide || kind === "json" || kind === "text" ? " wide" : ""}` }, h("label", { class: "field-name", title: name }, opts.label ?? name), input, def.description ? h("div", { class: "hint" }, def.description) : null);
}

/** Anything the form has no widget for (regions, hold, markers, points, data) — JSON, checked on change. */
export function jsonInput(value: unknown, onChange: (v: unknown) => void, placeholder?: unknown): HTMLTextAreaElement {
  const text = value === undefined ? "" : JSON.stringify(value);
  const ta = h("textarea", { class: "json", rows: String(Math.min(6, Math.max(1, Math.ceil(text.length / 70)))), placeholder: placeholder !== undefined ? JSON.stringify(placeholder) : "JSON" }, text);
  ta.onchange = () => {
    const s = ta.value.trim();
    if (!s) {
      ta.classList.remove("bad");
      onChange(undefined);
      return;
    }
    try {
      onChange(JSON.parse(s));
      ta.classList.remove("bad");
    } catch {
      ta.classList.add("bad");
    }
  };
  return ta;
}

/** A node of engine/scenes/schema.json → Def. */
export function schemaDef(node: Dict | undefined): Def {
  if (!node) return { type: "json" };
  if (Array.isArray(node.enum)) return { type: "enum", values: node.enum, description: node.description };
  if (node.type === "string") return { type: "string", description: node.description, maxLength: node.maxLength };
  if (node.type === "number" || node.type === "integer") return { type: node.type, min: node.minimum, max: node.maximum, description: node.description };
  if (node.type === "boolean") return { type: "boolean", description: node.description };
  return { type: "json", description: node.description };
}

export const group = (title: string, ...children: (Node | null | false | undefined)[]): HTMLElement => h("fieldset", { class: "group" }, h("legend", null, title), ...children);
export const fields = (...children: (Node | null | false | undefined)[]): HTMLElement => h("div", { class: "fields" }, ...children);

/** Set or delete a key: undefined removes it, so an untouched field never lands in project.json. */
export function put(obj: Dict, key: string, v: unknown): void {
  if (v === undefined) delete obj[key];
  else obj[key] = v;
}
