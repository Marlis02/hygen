#!/usr/bin/env node
import { copyFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { libraryDir, projectDirs } from "./lib/project.ts";
import { ENGINE_DIR, ROOT_DIR, ensureDir, pool, pyScript, python, readJson, run, runAsync, stripAnsi, writeJson } from "./lib/util.ts";

// npm run regress [-- --record] [--only id,id] [--jobs 2] [--no-build]
// Regression over every video instead of one reference video (CLAUDE.md «Правила работы»): each non-proof project that
// has been built is rebuilt by the current engine, and the contact sheet of its MP4 is compared tile by tile with
// library/regress/<id>.jpg (engine/py/compare_frames.py: mean ≤ 3 of 255 and no block > 40). --record writes the sheets
// as the snapshots. The voice comes from the project's cache only: a line without an ElevenLabs take goes to Kokoro
// instead of spending characters (HYGEN_VOICE_CACHE_ONLY, engine/src/voice.ts). --no-build compares the sheets already in
// renders/ without rebuilding — after a change of the comparison itself.

const TILE = 3.0;
const BLOCK = 40.0;

type State = "recorded" | "match" | "differ" | "new" | "failed";

interface Row {
  id: string;
  state: State;
  seconds: number;
  verify: boolean | null;
  voice: string;
  tiles: { ok: number; total: number } | null;
  detail: string;
}

interface BuildJson {
  duration_s?: number;
  build_seconds?: number;
  verify_ok?: boolean | null;
  voice?: { provider: string; voiceId: string };
}

const readOpt = <T>(path: string): T | null => {
  try {
    return existsSync(path) ? readJson<T>(path) : null;
  } catch {
    return null;
  }
};

function parseArgs(argv: string[]): { record: boolean; only: string[]; jobs: number; noBuild: boolean } {
  const value = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  // `npm run regress --record` (without `--`) reaches the script as npm_config_record
  const record = argv.includes("--record") || process.env.npm_config_record === "true";
  const only = (value("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const jobs = Number(value("--jobs") ?? 2);
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`--jobs: целое ≥ 1, а не ${value("--jobs")}`);
  return { record, only, jobs, noBuild: argv.includes("--no-build") };
}

const specOf = (dir: string): { id: string; proof?: boolean; status?: string; beats: unknown[] } => readJson(join(dir, "project.json"));

/** Non-proof projects that have been built, the oldest build first: uniqueness in verify compares with the most recent builds, so the order stays. */
function targets(only: string[]): { dirs: string[]; skipped: string[] } {
  const dirs: string[] = [];
  const skipped: string[] = [];
  for (const dir of projectDirs()) {
    const spec = specOf(dir);
    if (spec.proof || (only.length && !only.includes(basename(dir)))) continue;
    if ((spec.status ?? "draft") === "draft" && !existsSync(join(dir, "renders", `${spec.id}.mp4`))) {
      skipped.push(`${basename(dir)} — черновик без сборки`);
      continue;
    }
    dirs.push(dir);
  }
  for (const id of only) if (!dirs.some((d) => basename(d) === id) && !skipped.some((s) => s.startsWith(`${id} `))) skipped.push(`${id} — нет такого не-proof проекта`);
  const builtAt = (dir: string): number => {
    const f = join(dir, "renders", `${specOf(dir).id}.build.json`);
    return existsSync(f) ? statSync(f).mtimeMs : Number.MAX_SAFE_INTEGER;
  };
  dirs.sort((a, b) => builtAt(a) - builtAt(b));
  return { dirs, skipped };
}

const tail = (text: string, n = 4): string => stripAnsi(text).trim().split("\n").map((l) => l.trim()).filter(Boolean).slice(-n).join(" | ").slice(-500);
const fmt = (s: number): string => `${Math.floor(s / 60)} мин ${String(s % 60).padStart(2, "0")} с`;

async function regressOne(dir: string, record: boolean, noBuild: boolean, snapDir: string, workDir: string): Promise<Row> {
  const spec = specOf(dir);
  const id = basename(dir);
  const renders = join(dir, "renders");
  const sheet = join(renders, `${spec.id}.contact.jpg`);
  const before = existsSync(sheet) ? statSync(sheet).mtimeMs : 0;
  const t0 = Date.now();
  let log = "";
  if (!noBuild) {
    const r = await runAsync(process.execPath, [join(ENGINE_DIR, "src", "cli.ts"), "build", dir], { cwd: ROOT_DIR, allowFail: true });
    log = stripAnsi(r.stdout + r.stderr);
    writeFileSync(join(workDir, `${id}.log`), log);
  }
  const seconds = Math.round((Date.now() - t0) / 1000);
  const build = readOpt<BuildJson>(join(renders, `${spec.id}.build.json`));
  const kokoro = (log.match(/реплика озвучена Kokoro/g) ?? []).length;
  const voice = build?.voice ? `${build.voice.provider}${kokoro ? ` + Kokoro ×${kokoro}` : ""}` : "—";
  const verify = build?.verify_ok ?? null;
  const row = (state: State, detail: string, tiles: Row["tiles"] = null): Row => ({ id, state, seconds, verify, voice, tiles, detail });
  if (noBuild ? !existsSync(sheet) : !existsSync(sheet) || statSync(sheet).mtimeMs <= before) return row("failed", noBuild ? "листа нет — сначала сборка" : `сборка без нового листа: ${tail(log)}`);
  const snap = join(snapDir, `${id}.jpg`);
  if (record) {
    copyFileSync(sheet, snap);
    return row("recorded", relative(ROOT_DIR, snap));
  }
  if (!existsSync(snap)) return row("new", `снимка нет — npm run regress -- --record --only ${id}`);
  const cmpJson = join(workDir, `${id}.compare.json`);
  await runAsync(python(), [pyScript("compare_frames.py"), snap, sheet, "--tile", String(TILE), "--block", String(BLOCK), "--json", cmpJson], { allowFail: true });
  const cmp = readOpt<{ ok: boolean; tiles: { tile: string; mean: number; block: number }[]; sizes?: { a: number[]; b: number[] } }>(cmpJson);
  if (!cmp) return row("failed", "compare_frames.py не дал отчёта");
  const bad = cmp.tiles.filter((t) => t.mean > TILE || t.block > BLOCK);
  const tiles = { ok: cmp.tiles.length - bad.length, total: cmp.tiles.length };
  const sizeDiff = cmp.sizes && cmp.sizes.a.join("×") !== cmp.sizes.b.join("×");
  if (cmp.ok && !sizeDiff) return row("match", "", tiles);
  // side by side for the eye: the snapshot over the new sheet
  const side = join(workDir, `${id}.diff.jpg`);
  run(python(), [pyScript("contact_montage.py"), side, `${snap}:снимок library/regress/${id}.jpg`, `${sheet}:сейчас`], { allowFail: true });
  const detail = [sizeDiff ? `лист ${cmp.sizes?.a.join("×")} → ${cmp.sizes?.b.join("×")} (другое число битов)` : "", bad.map((t) => `${t.tile} ${t.mean}/${t.block}`).join(", "), `рядом: ${relative(ROOT_DIR, side)}`].filter(Boolean).join(" · ");
  return row("differ", detail, tiles);
}

async function main(argv: string[]): Promise<number> {
  const { record, only, jobs, noBuild } = parseArgs(argv);
  // children inherit it: a line without a cached ElevenLabs take goes to Kokoro, no characters are spent
  process.env.HYGEN_VOICE_CACHE_ONLY = "1";
  const snapDir = ensureDir(join(libraryDir(), "regress"));
  const workDir = ensureDir(join(ROOT_DIR, ".cache", "regress"));
  const { dirs, skipped } = targets(only);
  console.log(`регрессия${record ? " — запись снимков" : ""}${noBuild ? " без пересборки (листы из renders/)" : ""}: проектов ${dirs.length}, параллельно ${jobs}, снимки ${relative(ROOT_DIR, snapDir)}/<id>.jpg · голос только из кэша`);
  for (const s of skipped) console.log(`  пропущен: ${s}`);
  const started = Date.now();
  let done = 0;
  const rows = await pool(dirs, jobs, async (dir) => {
    console.log(`▸ ${basename(dir)}`);
    const row = await regressOne(dir, record, noBuild, snapDir, workDir);
    done++;
    const mark = row.state === "match" || row.state === "recorded" ? "✓" : "✗";
    console.log(`[${done}/${dirs.length}] ${mark} ${row.id} · ${fmt(row.seconds)} · ${row.tiles ? `плитки ${row.tiles.ok}/${row.tiles.total}` : row.state}${row.detail ? ` · ${row.detail}` : ""}`);
    return row;
  });

  const head = run("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT_DIR, allowFail: true }).stdout.trim();
  if (record) {
    const indexPath = join(snapDir, "index.json");
    const index = readOpt<Record<string, unknown>>(indexPath) ?? {};
    for (const row of rows.filter((x) => x.state === "recorded")) {
      const dir = dirs.find((d) => basename(d) === row.id) as string;
      const spec = specOf(dir);
      const build = readOpt<BuildJson>(join(dir, "renders", `${spec.id}.build.json`));
      index[row.id] = { recordedAt: new Date().toISOString(), head, beats: spec.beats.length, duration_s: build?.duration_s ?? null, voice: row.voice, verify_ok: row.verify };
    }
    writeJson(indexPath, Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b))));
  }
  writeJson(join(workDir, "last.json"), { at: new Date().toISOString(), head, record, rows });

  console.log(`\n${"проект".padEnd(20)}${"сборка".padEnd(14)}${"голос".padEnd(26)}${"verify".padEnd(8)}итог`);
  for (const r of rows) {
    const verdict = r.state === "recorded" ? "снимок записан" : r.state === "match" ? `совпало ${r.tiles?.ok}/${r.tiles?.total}` : r.state === "differ" ? `РАСХОЖДЕНИЕ ${r.tiles?.ok}/${r.tiles?.total}` : r.state === "new" ? "нет снимка" : "СБОРКА УПАЛА";
    console.log(`${r.id.padEnd(20)}${fmt(r.seconds).padEnd(14)}${r.voice.padEnd(26)}${(r.verify === null ? "—" : r.verify ? "✓" : "✗").padEnd(8)}${verdict}`);
  }
  const ok = rows.every((r) => r.state === (record ? "recorded" : "match"));
  console.log(`\n${ok ? "✓" : "✗"} ${record ? "снимков записано" : "совпало роликов"} ${rows.filter((r) => r.state === (record ? "recorded" : "match")).length} из ${rows.length} · ${fmt(Math.round((Date.now() - started) / 1000))} · отчёт .cache/regress/last.json`);
  if (!record && !ok) console.log("  расхождение намеренное — перезаписать снимки (--record --only <id>) и записать в DECISIONS.md; случайное — строка в TRAPS.md и починка");
  return ok ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
