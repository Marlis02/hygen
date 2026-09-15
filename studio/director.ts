// Окружение claude, которого поднимает панель (ROADMAP S2). Автономного `claude -p`, allowlist и director.log в
// панели больше нет: режиссёр работает в живом диалоге (studio/dialogs.ts), очередь без участия человека — отдельная
// сессия (README, раздел «Режиссёр»). Старые projects/<id>/director.log остаются в git как история прошлых прогонов.

/**
 * The environment of claude started by the panel: the subscription login, not an API key, and none of the markers of a
 * Claude Code session the panel itself may run in (session id, messaging socket and token, child-session flag, effort) —
 * a login shell re-reads the person's own profile anyway (TRAPS.md).
 */
export function claudeEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(ANTHROPIC_API_KEY|CLAUDECODE|CLAUDE_CODE_\w+|CLAUDE_AGENT_SDK_\w+|CLAUDE_PID|CLAUDE_EFFORT)$/.test(k)) env[k] = v;
  return { ...env, ...extra };
}
