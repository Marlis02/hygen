#!/usr/bin/env node
import { basename } from "node:path";
import { allProjectSpend, globalTakes, moveTake, previewSpend, projectBudget } from "./voice.ts";
import { projectDirs } from "./lib/project.ts";
import { projectOfLabel } from "./voice.ts";

// npm run voice [-- --migrate] — the ElevenLabs budget of every video: project.json → voice.budgetChars (default:
// voice.defaultBudgetChars of hygen.config.json) against projects/<id>/voice/usage.jsonl. Cached takes cost nothing.
// There is no global budget any more (ROADMAP S2). --migrate moves takes of the old global cache into their projects.

const args = process.argv.slice(2);
if (args.includes("--migrate")) {
  let moved = 0;
  for (const t of globalTakes().videos) {
    const dir = projectOfLabel(t.label);
    if (dir && moveTake(t.key, dir)) {
      moved++;
      console.log(`  ${t.label} → ${basename(dir)}/voice/${t.key}`);
    } else console.log(`  ${t.label}: проект не найден — остаётся в .cache/voice`);
  }
  console.log(`дубли ElevenLabs перенесены в проекты: ${moved}`);
}

console.log("бюджет ElevenLabs по роликам (символы):");
let total = 0;
for (const dir of projectDirs()) {
  const b = projectBudget(dir);
  total += b.spent;
  if (b.spent === 0 && b.budget === 0) continue;
  console.log(`  ${basename(dir).padEnd(20)} потрачено ${String(b.spent).padStart(6)} из ${String(b.budget).padStart(6)} · осталось ${String(b.left).padStart(6)} · дублей ${b.takes}`);
}
const previews = previewSpend();
console.log(`всего по роликам ${total} символов${previews ? ` · превью голосов ${previews}` : ""} · роликов с расходом ${allProjectSpend().filter((p) => p.chars > 0).length}`);
