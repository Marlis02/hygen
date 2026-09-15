#!/usr/bin/env node
import { existsSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { LibraryItem, PreviewIndexEntry, Section } from "./library.ts";
import { SECTIONS, itemHash, libraryCatalog, previewFile, previewIndex, previewsDir } from "./library.ts";
import { ENGINE_DIR, ROOT_DIR, ensureDir, pool, r3, runAsync, stripAnsi } from "./lib/util.ts";

// npm run library:previews [-- --only looks,devices] [--force] [--jobs 2]
// A 3-second silent 540×960 clip per library item (library.ts → libraryCatalog) through `npm run scene … --render`,
// into library/previews/<section>/<id>.mp4; library/previews/index.json keeps {file, hash, seconds, ok, error?} per
// section/id and an item whose hash is unchanged and whose file exists is skipped. Music gets an index entry only.

const LINE = "Every picture tells a story about the past";
/** A photo for the devices that act on a picture (focus.spotlight) — the CONTRACT example. */
const PHOTO = "projects/titanic-v2/media/rms-titanic.jpg";
/** edit.hold freezes a playing video: its demo stage (color) fails «только на stage media» — the CONTRACT footage. */
const FOOTAGE = "projects/titanic-v2/media/titanic-pathe-1912-belfast.webm";
/** behind-subject cuts a person out of the stage photo (TRAPS.md: remove-background finds people only). */
const PERSON = "projects/typo/media/woman-sky.jpg";

/** text.kinetic params per mode on the neutral line; the rest is the device's defaults. */
const KINETIC: Record<string, Record<string, unknown>> = {
  stack: { text: "STORY" },
  extrude: { text: "STORY" },
  "weight-morph": { text: "STORY" },
  outline: { text: "STORY" },
  tilt: { text: "THE PAST" },
  marquee: { text: "STORY" },
  texture: { text: "STONE", texture: "rock" },
  scramble: { text: "THE PAST" },
  slam: { text: "TELLS A STORY" },
  "center-build": { text: "EVERY PICTURE TELLS" },
  "type-swap": { text: "EVERY", words: ["PICTURE", "STORY", "PAST"] },
  "behind-subject": { text: "LOOK UP", position: "center", size: "xl" },
};

/**
 * A look previews on its own line (look.json → sampleLine): a figure with a unit («18 hours», «2:40 hours», «4,800 km»)
 * counts up in counter-title with the world's textures, grain and camera; any other line is typed on the question card.
 */
function lookArgs(item: LibraryItem): string[] {
  const line = String(item.facts?.sampleLine ?? "").trim();
  const counter = (params: Record<string, unknown>): string[] => ["counter-title", "--look", item.id, "--params", JSON.stringify(params)];
  const clock = /^(\d{1,2}):(\d{2})\s+(\S{1,9})$/.exec(line);
  if (clock) return counter({ value: Number(clock[1]) * 60 + Number(clock[2]), format: "clock", unit: (clock[3] as string).toUpperCase() });
  const figure = /^(\d{1,3}(?:,\d{3})+|\d+)\s+(\S{1,9})$/.exec(line);
  if (figure) return counter({ value: Number((figure[1] as string).replace(/,/g, "")), format: (figure[1] as string).includes(",") ? "thousands" : "int", unit: (figure[2] as string).toUpperCase() });
  if (line) return ["question-card", "--look", item.id, "--text", line, "--dur", "4", "--clip", "3", "--beat", JSON.stringify({ data: { text: line, kicker: "The question" } })];
  return ["counter-title", "--look", item.id];
}

/** `npm run scene` arguments that preview the item (null — no video). */
function sceneArgs(item: LibraryItem): string[] | null {
  const short = ["--text", LINE, "--dur", "4", "--clip", "3"];
  switch (item.section) {
    case "looks":
      return lookArgs(item);
    case "textures":
      return ["counter-title", "--textures", JSON.stringify([{ id: item.id }])];
    case "devices": {
      const [type, mode] = item.id.split(":") as [string, string | undefined];
      const args = ["--device", type, ...short];
      if (mode && item.apply.target === "beat" && "push" in item.apply) args.push("--params", JSON.stringify(item.apply.value.params ?? {}));
      if (type === "focus.spotlight") args.push("--beat", JSON.stringify({ stage: { type: "media", src: PHOTO, fit: "cover" } }));
      if (type === "edit.hold") args.push("--beat", JSON.stringify({ stage: { type: "media", src: FOOTAGE, fit: "contain" } }));
      return args;
    }
    case "kinetic": {
      const beat: Record<string, unknown> = { devices: [{ type: "text.kinetic", at: 0.4, params: { mode: item.id, ...(KINETIC[item.id] ?? { text: "STORY" }) } }], dominant: 0 };
      if (item.id === "behind-subject") beat.stage = { type: "media", src: PERSON, fit: "contain", focus: [0.5, 0.5] };
      return ["--device", "text.kinetic", ...short, "--beat", JSON.stringify(beat)];
    }
    case "captions":
      return ["--device", "text.caption", "--preset", item.id, ...short, ...(item.family === "explainer" ? ["--look", "bright-explainer"] : [])];
    case "transitions":
      return ["counter-title", "--transition", item.id];
    case "scenes":
    case "recipes":
      return [item.id];
    case "music":
      return null;
  }
}

const key = (item: LibraryItem): string => `${item.section}/${item.id}`;
const tail = (text: string, n: number): string => stripAnsi(text).trim().split("\n").map((l) => l.trim()).filter(Boolean).slice(-n).join(" | ").slice(-400);

function parseArgs(argv: string[]): { only: Section[]; force: boolean; jobs: number } {
  const value = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const only = (value("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const s of only) if (!SECTIONS.includes(s as Section)) throw new Error(`--only: «${s}» — разделы: ${SECTIONS.join(", ")}`);
  const jobs = Number(value("--jobs") ?? 2);
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`--jobs: целое ≥ 1, а не ${value("--jobs")}`);
  return { only: only as Section[], force: argv.includes("--force"), jobs };
}

async function main(argv: string[]): Promise<number> {
  const { only, force, jobs } = parseArgs(argv);
  const started = Date.now();
  const catalog = libraryCatalog();
  const items = catalog.filter((it) => !only.length || only.includes(it.section));
  const dir = ensureDir(previewsDir());
  const indexPath = join(dir, "index.json");
  const index = previewIndex();
  // entries of items that left the catalog go away
  const known = new Set(catalog.map(key));
  for (const k of Object.keys(index)) if (!known.has(k)) delete index[k];
  const save = (): void => {
    const part = `${indexPath}.part`;
    const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(part, `${JSON.stringify(sorted, null, 2)}\n`);
    renameSync(part, indexPath);
  };

  type Outcome = "made" | "cached" | "failed";
  const stats = new Map<Section, Record<Outcome, number>>();
  const count = (s: Section, o: Outcome): void => {
    const row = stats.get(s) ?? { made: 0, cached: 0, failed: 0 };
    row[o]++;
    stats.set(s, row);
  };
  const todo: LibraryItem[] = [];
  for (const item of items) {
    const hash = itemHash(item);
    const prev = index[key(item)];
    if (item.section === "music") {
      const file = item.files[0] ?? "";
      const ok = existsSync(join(ROOT_DIR, file));
      index[key(item)] = { file, hash, seconds: 0, ok, ...(ok ? {} : { error: "нет файла трека" }) };
      count("music", ok ? "made" : "failed");
      continue;
    }
    if (!force && prev && prev.hash === hash && prev.ok && existsSync(join(ROOT_DIR, prev.file))) {
      count(item.section, "cached");
      continue;
    }
    todo.push(item);
  }
  save();
  console.log(`превью библиотеки: ${items.length} элементов${only.length ? ` (${only.join(", ")})` : ""}, рендерить ${todo.length}, параллельно ${jobs}`);

  let done = 0;
  await pool(todo, jobs, async (item) => {
    const out = previewFile(item);
    const file = relative(ROOT_DIR, out);
    const hash = itemHash(item);
    const args = sceneArgs(item) as string[];
    const name = `lib-${item.section}-${item.id.replace(/[^\w-]+/g, "-")}`;
    const t0 = Date.now();
    rmSync(out, { force: true });
    ensureDir(join(out, ".."));
    const r = await runAsync(process.execPath, [join(ENGINE_DIR, "src", "cli.ts"), "scene", ...args, "--name", name, "--render", out, "--no-sheet"], { cwd: ROOT_DIR, allowFail: true });
    const seconds = r3((Date.now() - t0) / 1000);
    const made = existsSync(out) && statSync(out).size > 1000;
    const entry: PreviewIndexEntry = { file, hash, seconds, ok: made };
    if (!made) entry.error = tail(r.stdout + r.stderr, 4) || `выход ${r.status}`;
    else if (r.status !== 0) entry.error = "lint нашёл ошибки (MP4 есть)";
    index[key(item)] = entry;
    save();
    count(item.section, made ? "made" : "failed");
    if (made) rmSync(join(ROOT_DIR, ".preview", name), { recursive: true, force: true });
    done++;
    console.log(`[${done}/${todo.length}] ${made ? "✓" : "✗"} ${key(item)} · ${seconds} с${entry.error ? ` · ${entry.error}` : ""}`);
  });

  const total = r3((Date.now() - started) / 1000);
  console.log("\nраздел        сделано  из кэша  ошибок");
  const sum = { made: 0, cached: 0, failed: 0 };
  for (const s of SECTIONS) {
    const row = stats.get(s);
    if (!row) continue;
    console.log(`${s.padEnd(14)}${String(row.made).padStart(7)}${String(row.cached).padStart(9)}${String(row.failed).padStart(8)}`);
    sum.made += row.made;
    sum.cached += row.cached;
    sum.failed += row.failed;
  }
  console.log(`${"всего".padEnd(14)}${String(sum.made).padStart(7)}${String(sum.cached).padStart(9)}${String(sum.failed).padStart(8)}`);
  console.log(`время: ${total} с · индекс: ${relative(ROOT_DIR, indexPath)}`);
  return sum.failed ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
