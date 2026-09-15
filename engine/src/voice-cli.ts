#!/usr/bin/env node
import { basename } from "node:path";
import { budgetState, globalTakes, moveTake, projectOfLabel, resetBudget } from "./voice.ts";

// npm run voice [-- --reset-budget] [-- --migrate] — the ElevenLabs character budget (ELEVENLABS_BUDGET_CHARS in .env)
// against .cache/voice/elevenlabs/usage.jsonl and videos/<id>/voice/usage.jsonl: what is spent since the last reset and what
// is left. Cached takes cost nothing. --migrate moves takes of videos from the old global cache into their projects.

const args = process.argv.slice(2);
if (args.includes("--reset-budget")) {
  resetBudget();
  console.log("бюджет ElevenLabs сброшен: счёт символов начинается заново");
}
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
const b = budgetState();
console.log(
  b.budget === null
    ? `бюджет ElevenLabs не задан (ELEVENLABS_BUDGET_CHARS в .env) · потрачено с последнего сброса: ${b.spent} символов`
    : `бюджет ElevenLabs: ${b.budget} символов · потрачено ${b.spent} · осталось ${b.left}${b.since ? ` · сброс ${b.since}` : ""}`,
);
