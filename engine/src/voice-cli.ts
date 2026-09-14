#!/usr/bin/env node
import { budgetState, resetBudget } from "./voice.ts";

// npm run voice [-- --reset-budget] — the ElevenLabs character budget (ELEVENLABS_BUDGET_CHARS in .env) against
// .cache/voice/elevenlabs/usage.jsonl: what is spent since the last reset and what is left. Cached takes cost nothing.

const args = process.argv.slice(2);
if (args.includes("--reset-budget")) {
  resetBudget();
  console.log("бюджет ElevenLabs сброшен: счёт символов начинается заново");
}
const b = budgetState();
console.log(
  b.budget === null
    ? `бюджет ElevenLabs не задан (ELEVENLABS_BUDGET_CHARS в .env) · потрачено с последнего сброса: ${b.spent} символов`
    : `бюджет ElevenLabs: ${b.budget} символов · потрачено ${b.spent} · осталось ${b.left}${b.since ? ` · сброс ${b.since}` : ""}`,
);
