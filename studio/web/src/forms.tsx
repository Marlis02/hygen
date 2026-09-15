import type { ComponentChildren, JSX } from "preact";
import { t } from "./lib/i18n.ts";
import type { Dict } from "./lib/i18n.ts";

// Поля форм из собственных описаний движка: params у device.json, scene.json, texture.json, text.schema.json и узлы
// library/scenes/schema.json. Своих копий списков у панели нет — новое значение enum в движке появляется здесь само.
// Поля неуправляемые: значение ставится при создании, onChange пишет в черновик. Чтобы сбросить поле — сменить key.

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

const num = /^-?\d+(\.\d+)?$/;

export interface FieldProps {
  name: string;
  def: Def;
  value: unknown;
  onChange: (v: unknown) => void;
  label?: string;
  wide?: boolean;
  options?: string[];
}

export function Field({ name, def, value, onChange, label, wide, options }: FieldProps): JSX.Element {
  const kind = options ? "enum" : kindOf(def);
  const values = options ?? def.values ?? [];
  let input: JSX.Element;
  if (kind === "enum") {
    const extra = value !== undefined && !values.includes(String(value));
    input = (
      <select onChange={(e) => onChange(e.currentTarget.value === "" ? undefined : e.currentTarget.value)}>
        <option value="">{def.default !== undefined && def.default !== "" ? t("form.default", { v: String(def.default) }) : "—"}</option>
        {values.map((v) => (
          <option key={v} value={v} selected={value === v}>
            {v}
          </option>
        ))}
        {extra ? (
          <option value={String(value)} selected>
            {String(value)}
          </option>
        ) : null}
      </select>
    );
  } else if (kind === "boolean") {
    input = (
      <label class="check">
        <input type="checkbox" defaultChecked={value === undefined ? def.default === true : value === true} onChange={(e) => onChange(e.currentTarget.checked)} />
        {value === undefined ? t("form.defaultShort") : ""}
      </label>
    );
  } else if (kind === "number" || kind === "integer") {
    input = <input type="number" step={kind === "integer" ? "1" : "any"} min={def.min} max={def.max} defaultValue={value === undefined ? "" : String(value)} placeholder={def.default !== undefined ? String(def.default) : ""} onChange={(e) => onChange(e.currentTarget.value === "" ? undefined : Number(e.currentTarget.value))} />;
  } else if (kind === "text") {
    input = <textarea rows={3} maxLength={def.maxLength} defaultValue={value === undefined ? "" : String(value)} onChange={(e) => onChange(e.currentTarget.value === "" ? undefined : e.currentTarget.value)} />;
  } else if (["string", "at", "color", "image", "map"].includes(kind)) {
    input = (
      <input
        type="text"
        maxLength={def.maxLength}
        defaultValue={value === undefined ? "" : String(value)}
        placeholder={def.default !== undefined && def.default !== "" ? String(def.default) : kind === "at" ? t("form.atHint") : ""}
        onChange={(e) => {
          const s = e.currentTarget.value;
          onChange(s === "" ? undefined : kind === "at" && num.test(s) ? Number(s) : s);
        }}
      />
    );
  } else if (kind === "list" || kind === "ats") {
    input = (
      <input
        type="text"
        defaultValue={Array.isArray(value) ? value.join(", ") : ""}
        placeholder={Array.isArray(def.default) ? (def.default as unknown[]).join(", ") : t("form.listHint")}
        onChange={(e) => {
          const s = e.currentTarget.value.trim();
          onChange(s ? s.split(/\s*,\s*/).map((x) => (kind === "ats" && num.test(x) ? Number(x) : x)) : undefined);
        }}
      />
    );
  } else input = <JsonInput value={value} onChange={onChange} placeholder={def.default} />;
  return (
    <div class={`field${wide || kind === "json" || kind === "text" ? " wide" : ""}`}>
      <label class="field-name" title={name}>
        {label ?? name}
      </label>
      {input}
      {def.description ? <div class="hint">{def.description}</div> : null}
    </div>
  );
}

/** Всё, для чего у формы нет виджета (regions, hold, markers, points, data), — JSON с проверкой при изменении. */
export function JsonInput({ value, onChange, placeholder }: { value: unknown; onChange: (v: unknown) => void; placeholder?: unknown }): JSX.Element {
  const text = value === undefined ? "" : JSON.stringify(value);
  return (
    <textarea
      class="json"
      rows={Math.min(6, Math.max(1, Math.ceil(text.length / 70)))}
      placeholder={placeholder !== undefined ? JSON.stringify(placeholder) : "JSON"}
      defaultValue={text}
      onChange={(e) => {
        const ta = e.currentTarget;
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
      }}
    />
  );
}

/** Узел library/scenes/schema.json → Def. */
export function schemaDef(node: Dict | undefined): Def {
  if (!node) return { type: "json" };
  if (Array.isArray(node.enum)) return { type: "enum", values: node.enum, description: node.description };
  if (node.type === "string") return { type: "string", description: node.description, maxLength: node.maxLength };
  if (node.type === "number" || node.type === "integer") return { type: node.type, min: node.minimum, max: node.maximum, description: node.description };
  if (node.type === "boolean") return { type: "boolean", description: node.description };
  return { type: "json", description: node.description };
}

export const Group = ({ title, children }: { title: string; children?: ComponentChildren }): JSX.Element => (
  <fieldset class="group">
    <legend>{title}</legend>
    {children}
  </fieldset>
);

export const Fields = ({ children }: { children?: ComponentChildren }): JSX.Element => <div class="fields">{children}</div>;

/** Поставить или удалить ключ: undefined удаляет, поэтому нетронутое поле не попадает в project.json. */
export function put(obj: Dict, key: string, v: unknown): void {
  if (v === undefined) delete obj[key];
  else obj[key] = v;
}
