import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolverInputHash } from "./intents.ts";
import type { BeatSpec, VideoSpec } from "./spec.ts";
import { loadSpec } from "./spec.ts";
import { fail, readJson } from "./lib/util.ts";

// build/beats.expanded.json — beats after the intent resolver. The resolver is a pure function of video.json and the
// tables: two expansions in one run must match, and a build with the same input hash must write the same beats.

export interface ExpandedRecord {
  inputHash: string;
  beats: BeatSpec[];
}

export function expandedRecord(videoDir: string, spec: VideoSpec): ExpandedRecord {
  const raw = readJson<{ beats: BeatSpec[] }>(join(videoDir, "video.json"));
  return { inputHash: resolverInputHash(raw.beats), beats: spec.beats };
}

/** Same input → same expansion: twice in this run and against the previous build. Returns a one-line note. */
export function checkExpanded(videoDir: string, spec: VideoSpec): { ok: boolean; detail: string; record: ExpandedRecord } {
  const record = expandedRecord(videoDir, spec);
  const again = JSON.stringify(loadSpec(videoDir).beats);
  if (again !== JSON.stringify(spec.beats)) return { ok: false, detail: "две развёртки video.json в одном запуске разошлись — резолвер недетерминирован", record };
  const prevPath = join(videoDir, "build", "beats.expanded.json");
  if (!existsSync(prevPath)) return { ok: true, detail: "прошлой развёртки нет", record };
  const prev = readJson<ExpandedRecord>(prevPath);
  if (prev.inputHash !== record.inputHash) return { ok: true, detail: "video.json или таблицы intents изменились — развёртка обновлена", record };
  const same = JSON.stringify(prev.beats) === JSON.stringify(record.beats);
  return { ok: same, detail: same ? "beats.expanded.json совпадает с прошлой сборкой" : "тот же вход, другая развёртка — резолвер недетерминирован", record };
}

export function requireExpanded(videoDir: string, spec: VideoSpec): ExpandedRecord {
  const res = checkExpanded(videoDir, spec);
  if (!res.ok) fail(`beats.expanded.json: ${res.detail}`);
  return res.record;
}
