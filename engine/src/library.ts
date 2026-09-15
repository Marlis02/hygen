import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { libraryDir, musicDir, readLedger } from "./lib/project.ts";
import { LIBRARY_DIR, ROOT_DIR, readJson } from "./lib/util.ts";

// The library as one catalog (ROADMAP S1): looks, textures, devices (with their modes), text.kinetic modes, caption
// presets, transitions, HTML scene recipes, JSON recipes, music. The studio shows it; `npm run library:previews`
// renders a 3-second clip per item into library/previews/<section>/<id>.mp4, cached by the hash of the item's files.

export type Section = "looks" | "textures" | "devices" | "kinetic" | "captions" | "transitions" | "scenes" | "recipes" | "music";

export const SECTIONS: Section[] = ["looks", "textures", "devices", "kinetic", "captions", "transitions", "scenes", "recipes", "music"];

/** How «apply to a beat» writes the item into project.json. */
export type Apply =
  | { target: "project"; set: Record<string, unknown> }
  | { target: "beat"; set: Record<string, unknown>; replaceStage?: boolean }
  | { target: "beat"; push: "devices" | "textures"; value: Record<string, unknown> };

export interface LibraryItem {
  section: Section;
  /** Unique inside the section: look id, texture id, device type or type:mode, kinetic mode, preset, transition, scene, recipe, track. */
  id: string;
  name: string;
  description: string;
  /** Caption family (calm | explainer | energetic), device layer, look captions family. */
  family?: string;
  origin: "own" | "registry";
  /** registry:<component> when ported from the HyperFrames registry. */
  originRef?: string;
  /** Param definitions (device.json / texture.json / scene.json params) — the studio shows them. */
  params?: Record<string, unknown>;
  /** Defaults worth showing on a card (look: captions, textures, camera; music: bpm, mood, looks). */
  facts?: Record<string, unknown>;
  /** Files whose content keys the preview cache (repo-relative). */
  files: string[];
  apply: Apply;
}

const rel = (p: string): string => relative(ROOT_DIR, p);
const dirs = (root: string): string[] => (existsSync(root) ? readdirSync(root).filter((n) => !n.startsWith("_") && n !== "vendor" && statSync(join(root, n)).isDirectory()).sort() : []);
const filesOf = (dir: string): string[] => readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile()).sort().map((n) => rel(join(dir, n)));
const originOf = (raw: unknown): { origin: "own" | "registry"; originRef?: string } => {
  const s = typeof raw === "string" ? raw : "own";
  return s.startsWith("registry") ? { origin: "registry", originRef: s } : { origin: "own" };
};

function looks(): LibraryItem[] {
  return dirs(join(LIBRARY_DIR, "looks")).map((id) => {
    const file = join(LIBRARY_DIR, "looks", id, "look.json");
    const l = readJson<Record<string, any>>(file);
    return {
      section: "looks",
      id,
      name: l.name ?? id,
      description: [l.about?.mood, l.about?.topics ? `Темы: ${[].concat(l.about.topics).join(", ")}` : ""].filter(Boolean).join(" "),
      family: l.captions?.family,
      origin: "own",
      facts: { sampleLine: l.sampleLine, accent: l.palette?.accent, captions: l.captions, textures: (l.textures ?? []).map((t: { id: string }) => t.id), camera: l.motion?.camera?.preset, transitions: l.transitions, kinetic: l.typography?.kinetic ?? false },
      files: [rel(file)],
      apply: { target: "project", set: { look: id } },
    };
  });
}

function textures(): LibraryItem[] {
  return dirs(join(LIBRARY_DIR, "textures")).map((id) => {
    const dir = join(LIBRARY_DIR, "textures", id);
    const t = readJson<Record<string, any>>(join(dir, "texture.json"));
    return { section: "textures", id, name: t.name ?? id, description: t.use ?? "", family: t.layer?.depth, origin: "own", params: t.params, facts: { layer: t.layer }, files: filesOf(dir), apply: { target: "beat", push: "textures", value: { id } } };
  });
}

/** Devices; a device with an enum `mode` (or `shape`/`kind` when there is no mode) gives one item per value. text.kinetic and text.caption have their own sections. */
function devices(): LibraryItem[] {
  const out: LibraryItem[] = [];
  for (const type of dirs(join(LIBRARY_DIR, "devices"))) {
    if (type === "text.kinetic" || type === "text.caption") continue;
    const dir = join(LIBRARY_DIR, "devices", type);
    if (!existsSync(join(dir, "device.json"))) continue;
    const d = readJson<Record<string, any>>(join(dir, "device.json"));
    const base = { section: "devices" as const, name: d.name ?? type, family: d.layer, ...originOf(d.origin), params: d.params, files: filesOf(dir) };
    const demo = (d.demo ?? {}) as Record<string, any>;
    const value = (params: Record<string, unknown>): Record<string, unknown> => ({ type, ...(demo.target !== undefined ? { target: demo.target } : {}), at: "speech", params: { ...(demo.params ?? {}), ...params } });
    const modeKey = ["mode", "shape", "kind"].find((k) => d.params?.[k]?.type === "enum");
    out.push({ ...base, id: type, description: d.use ?? "", apply: { target: "beat", push: "devices", value: value({}) } });
    if (modeKey) {
      for (const m of d.params[modeKey].values as string[]) {
        if (m === d.params[modeKey].default) continue;
        out.push({ ...base, id: `${type}:${m}`, name: `${base.name} · ${m}`, description: `${d.use ?? ""} ${modeKey}: ${m}.`.trim(), apply: { target: "beat", push: "devices", value: value({ [modeKey]: m }) } });
      }
    }
  }
  return out;
}

function kinetic(): LibraryItem[] {
  const dir = join(LIBRARY_DIR, "devices", "text.kinetic");
  const d = readJson<Record<string, any>>(join(dir, "device.json"));
  const about = String(d.params.mode.description ?? "");
  return (d.params.mode.values as string[]).map((mode) => {
    const m = new RegExp(`(?:^|; )${mode.replace(/[-]/g, "\\-")} — ([^;]+)`).exec(about);
    return {
      section: "kinetic",
      id: mode,
      name: `text.kinetic · ${mode}`,
      description: m ? (m[1] as string).replace(/\.$/, "") : d.use ?? "",
      family: "text",
      ...originOf(mode === "texture" ? "registry:texture-mask-text" : mode === "center-build" ? "registry:kinetic-center-build" : mode === "type-swap" ? "registry:kinetic-type-swap" : "own"),
      params: d.params,
      files: filesOf(dir),
      apply: { target: "beat", push: "devices", value: { type: "text.kinetic", at: "speech", params: { mode, text: String(d.demo?.params?.text ?? "WORD") } } },
    };
  });
}

function captions(): LibraryItem[] {
  const dir = join(LIBRARY_DIR, "captions");
  const families = readJson<Record<string, string[]>>(join(dir, "families.json"));
  const out: LibraryItem[] = [];
  for (const [family, presets] of Object.entries(families)) {
    for (const preset of presets) {
      const file = join(dir, "presets", `${preset}.js`);
      const src = existsSync(file) ? readFileSync(file, "utf8") : "";
      const head = /\/\*\s*[\w-]+\s+—\s+([\s\S]*?)\*\//.exec(src)?.[1] ?? "";
      const description = head.replace(/\s+/g, " ").replace(/^port of registry [\w-]+ \([^)]*\)\.\s*/i, "").split(/(?<=\.)\s/)[0] ?? "";
      out.push({
        section: "captions",
        id: preset,
        name: preset,
        description: description.trim(),
        family,
        ...originOf(/origin:\s*"([^"]+)"/.exec(src)?.[1]),
        files: [rel(file), rel(join(LIBRARY_DIR, "devices", "text.caption", "device.js"))].filter((f) => existsSync(join(ROOT_DIR, f))),
        apply: { target: "beat", set: { "caption.preset": preset } },
      });
    }
  }
  return out;
}

function transitions(): LibraryItem[] {
  return dirs(join(LIBRARY_DIR, "transitions")).map((id) => {
    const dir = join(LIBRARY_DIR, "transitions", id);
    const t = readJson<Record<string, any>>(join(dir, "transition.json"));
    return { section: "transitions", id, name: t.name ?? id, description: t.use ?? "", ...originOf(t.origin), facts: { duration: t.duration }, files: filesOf(dir), apply: { target: "beat", set: { transition: id } } };
  });
}

function scenes(): LibraryItem[] {
  return dirs(join(LIBRARY_DIR, "scenes")).filter((id) => existsSync(join(LIBRARY_DIR, "scenes", id, "scene.json"))).map((id) => {
    const dir = join(LIBRARY_DIR, "scenes", id);
    const s = readJson<Record<string, any>>(join(dir, "scene.json"));
    return { section: "scenes", id, name: s.name ?? id, description: s.use ?? "", family: s.hero ? "hero" : undefined, origin: "own", params: s.params, files: filesOf(dir), apply: { target: "beat", set: { scene: id }, replaceStage: true } };
  });
}

function recipes(): LibraryItem[] {
  const dir = join(LIBRARY_DIR, "scenes", "recipes");
  return readdirSync(dir).filter((n) => n.endsWith(".json")).sort().map((n) => {
    const id = n.replace(/\.json$/, "");
    const r = readJson<Record<string, any>>(join(dir, n));
    return { section: "recipes", id, name: r.name ?? id, description: r.use ?? "", origin: "own", facts: { requires: r.requires }, files: [rel(join(dir, n))], apply: { target: "beat", set: { scene: id, data: r.demo ?? {} }, replaceStage: true } };
  });
}

function music(): LibraryItem[] {
  const ledger = readLedger(join(musicDir(), "music.json"));
  return Object.entries(ledger).map(([file, rec]) => {
    const id = file.replace(/\.[^.]+$/, "");
    return {
      section: "music",
      id,
      name: rec.title ?? id,
      description: rec.notes ?? "",
      origin: "own",
      facts: { file, bpm: rec.bpm, mood: rec.mood, looks: rec.looks, license: rec.license, author: rec.author, url: rec.url },
      files: [rel(join(musicDir(), file))],
      apply: { target: "project", set: { music: { track: id } } },
    };
  });
}

export function libraryCatalog(): LibraryItem[] {
  return [...looks(), ...textures(), ...devices(), ...kinetic(), ...captions(), ...transitions(), ...scenes(), ...recipes(), ...music()];
}

export const previewsDir = (): string => join(libraryDir(), "previews");

/** Cache key of an item's preview: its section, id and the content of its files. */
export function itemHash(item: LibraryItem): string {
  const h = createHash("sha256").update(`${item.section}/${item.id}\0`);
  for (const f of item.files) if (existsSync(join(ROOT_DIR, f))) h.update(readFileSync(join(ROOT_DIR, f)));
  return h.digest("hex").slice(0, 16);
}

/** library/previews/<section>/<id>.mp4 (a device mode type:mode → type~mode on disk). */
export function previewFile(item: LibraryItem): string {
  return join(previewsDir(), item.section, `${item.id.replace(/:/g, "~")}.mp4`);
}

/** library/previews/index.json: section/id → {file, hash, seconds, ok, error?}. */
export interface PreviewIndexEntry {
  file: string;
  hash: string;
  seconds?: number;
  ok: boolean;
  error?: string;
}

export function previewIndex(): Record<string, PreviewIndexEntry> {
  const f = join(previewsDir(), "index.json");
  return existsSync(f) ? readJson(f) : {};
}
