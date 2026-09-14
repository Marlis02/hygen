#!/usr/bin/env node
/** npm run voices -- "<реплика>" [--out videos/_proof/voices] [--model eleven_multilingual_v2] — одна реплика четырьмя голосами ElevenLabs, выбор на слух. */
import { writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ELEVEN_DEFAULT_MODEL, elevenTake } from "./voice.ts";
import { ROOT_DIR, ensureDir, lastJsonLine, loadEnv, pyScript, python, run } from "./lib/util.ts";

const PRESETS = [
  { id: "", why: "ELEVENLABS_VOICE_ID из .env — голос по умолчанию" },
  { id: "JBFqnCBsd6RMkjVDRZzb", why: "британский мужской, рассказчик (готовый голос библиотеки ElevenLabs)" },
  { id: "onwK4e9ZLuTAKqWW03F9", why: "британский мужской, диктор новостей (готовый голос библиотеки ElevenLabs)" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", why: "британский женский, ведущая-просветитель (готовый голос библиотеки ElevenLabs)" },
];

async function main(argv: string[]): Promise<number> {
  const opt = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const text = argv.find((a, i) => !a.startsWith("--") && !["--out", "--model"].includes(argv[i - 1] ?? ""));
  if (!text) {
    console.log('npm run voices -- "<реплика>" [--out videos/_proof/voices] [--model eleven_multilingual_v2]');
    return 2;
  }
  const env = loadEnv();
  if (!env.ELEVENLABS_API_KEY) {
    console.error("✗ нет ELEVENLABS_API_KEY в .env");
    return 1;
  }
  const out = ensureDir(resolve(opt("--out") ?? join(ROOT_DIR, "videos", "_proof", "voices")));
  const model = opt("--model") ?? env.ELEVENLABS_MODEL ?? ELEVEN_DEFAULT_MODEL;
  const presets = PRESETS.map((p, i) => (i === 0 ? { ...p, id: env.ELEVENLABS_VOICE_ID ?? "" } : p)).filter((p) => p.id);
  const rows: string[] = [];
  let chars = 0;
  for (const [i, p] of presets.entries()) {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(p.id)}`, { headers: { "xi-api-key": env.ELEVENLABS_API_KEY } });
    const info = res.ok ? ((await res.json()) as { name?: string; labels?: Record<string, string> }) : {};
    const name = info.name ?? p.id;
    const take = await elevenTake(text, p.id, model, `voices/${name}`);
    chars += take.chars;
    const slug = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 2).join("-") || p.id;
    const file = `${String(i + 1).padStart(2, "0")}-${slug}.wav`;
    const meta = lastJsonLine<{ duration_s: number; lufs: number }>(run(python(), [pyScript("voice_line.py"), take.wav, join(out, file), "--lead", "0.25", "--tail", "0.6"]).stdout);
    const labels = Object.entries(info.labels ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ");
    rows.push(`| \`${file}\` | ${name} | \`${p.id}\` | ${p.why}${labels ? ` · ${labels}` : ""} | ${meta.duration_s.toFixed(1)} с |`);
    console.log(`  ✓ ${file} · ${name} · ${p.id} · ${meta.duration_s.toFixed(2)} с${take.cached ? " · из кэша" : ""}`);
  }
  writeFileSync(
    join(out, "README.md"),
    [
      "# Превью голосов ElevenLabs",
      "",
      `Реплика: «${text}»`,
      "",
      `Модель \`${model}\`, эндпоинт with-timestamps (тайминги слов из API). Собрано командой \`npm run voices -- "<реплика>"\`; дубли лежат в кэше \`.cache/voice/elevenlabs\` и повторно символов не тратят.`,
      "",
      "| Файл | Голос | voiceId | Какой | Длина |",
      "|---|---|---|---|---|",
      ...rows,
      "",
      "Как выбрать: послушать, взять voiceId и поставить его в `.env` (`ELEVENLABS_VOICE_ID=…`) — голос по умолчанию для всех роликов на ElevenLabs, или в `video.json` ролика: `\"voice\": {\"provider\": \"elevenlabs\", \"voiceId\": \"…\"}`.",
      "",
    ].join("\n"),
  );
  console.log(`ElevenLabs: потрачено ${chars} символов · ${relative(ROOT_DIR, out)}/README.md`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
