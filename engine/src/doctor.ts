import { existsSync, readdirSync, statfsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ENGINE_DIR, ROOT_DIR, VENDOR_SKILLS, loadEnv, python, readJson, run, stripAnsi } from "./lib/util.ts";
import { budgetState } from "./voice.ts";

const PINNED: Record<string, string> = {
  hyperframes: "0.8.36",
  "@hyperframes/core": "0.8.36",
  "@hyperframes/shader-transitions": "0.8.36",
  gsap: "3.14.2",
};

const VENDORED = [
  "faceless-explainer/scripts/assemble-index.mjs",
  "faceless-explainer/scripts/captions.mjs",
  "faceless-explainer/scripts/lib/storyboard.mjs",
  "faceless-explainer/scripts/lib/dimensions.mjs",
  "faceless-explainer/scripts/lib/tokens.mjs",
  "faceless-explainer/scripts/lib/assets.mjs",
  "hyperframes-audio/scripts/carve.mjs",
  "media-use/audio/scripts/lib/bgm.mjs",
];

interface Row {
  name: string;
  state: "ok" | "warn" | "fail";
  detail: string;
}

/** Environment check. Warnings (models not downloaded yet) do not fail; everything else does. */
export function doctor(): boolean {
  const rows: Row[] = [];
  const add = (name: string, ok: boolean, detail: string, soft = false): void => {
    rows.push({ name, state: ok ? "ok" : soft ? "warn" : "fail", detail });
  };

  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  add("Node.js", major > 22 || (major === 22 && minor >= 18), `v${process.versions.node} (нужно ≥ 22.18: TypeScript запускается без сборки)`);

  for (const [pkg, want] of Object.entries(PINNED)) {
    const manifest = join(ROOT_DIR, "node_modules", pkg, "package.json");
    const have = existsSync(manifest) ? readJson<{ version: string }>(manifest).version : null;
    add(pkg, have === want, have ? `${have} (закреплено ${want})` : "не установлен — npm ci");
  }

  const fonts = readdirSync(join(ENGINE_DIR, "assets", "fonts")).filter((f) => f.endsWith(".woff2"));
  add("шрифты в проекте", fonts.length >= 8, `${fonts.length} woff2 в engine/assets/fonts`);
  const vendorJs = ["gsap.min.js", "shader-transitions.global.js"].filter((f) => existsSync(join(ENGINE_DIR, "assets", "vendor", f)));
  add("GSAP и шейдеры в проекте", vendorJs.length === 2, `engine/assets/vendor: ${vendorJs.join(", ") || "пусто"}`);
  const missing = VENDORED.filter((f) => !existsSync(join(VENDOR_SKILLS, f)));
  add("скрипты навыков", missing.length === 0, missing.length ? `нет: ${missing.join(", ")}` : `${VENDORED.length} файлов в engine/vendor/skills`);

  const ff = run("ffmpeg", ["-hide_banner", "-filters"], { allowFail: true });
  const ffVersion = run("ffmpeg", ["-version"], { allowFail: true }).stdout.split("\n")[0] ?? "";
  add("ffmpeg (ebur128)", ff.status === 0 && ff.stdout.includes("ebur128"), ffVersion.replace(/ Copyright.*/, "") || "не найден");
  add("ffprobe", run("ffprobe", ["-version"], { allowFail: true }).status === 0, "нужен автопроверке");

  const py = run(python(), ["-c", "import sys, numpy, scipy, soundfile, PIL; print(sys.version.split()[0], 'numpy', numpy.__version__, 'scipy', scipy.__version__, 'soundfile', soundfile.__version__, 'Pillow', PIL.__version__)"], { allowFail: true });
  add("Python и пакеты", py.status === 0, py.status === 0 ? py.stdout.trim() : "pip install numpy scipy soundfile pillow");

  // the key itself is never printed
  const env = loadEnv();
  const provider = env.VOICE_PROVIDER || (env.ELEVENLABS_LIVE === "1" ? "elevenlabs" : "kokoro");
  const hasKey = Boolean(env.ELEVENLABS_API_KEY);
  add("голос по умолчанию (.env)", provider === "kokoro" || (provider === "elevenlabs" && hasKey), `${provider} · ключ ElevenLabs: ${hasKey ? "есть" : "нет"} · ELEVENLABS_VOICE_ID: ${env.ELEVENLABS_VOICE_ID ? "задан" : "не задан"} · Pexels: ${env.PEXELS_API_KEY ? "ключ есть" : "ключа нет"}`, true);
  const budget = budgetState();
  add("бюджет ElevenLabs", budget.budget === null || (budget.left ?? 0) > 0, budget.budget === null ? `не задан (ELEVENLABS_BUDGET_CHARS) · потрачено ${budget.spent} символов` : `осталось ${budget.left} из ${budget.budget} символов (потрачено ${budget.spent}; сброс — npm run voice -- --reset-budget)`, true);
  const emoji = run("fc-list", [], { allowFail: true });
  add("эмодзи-шрифт (субтитры emoji-pop)", emoji.status === 0 && /emoji/i.test(emoji.stdout), emoji.status === 0 && /emoji/i.test(emoji.stdout) ? "есть" : "нет цветного эмодзи-шрифта — значки emoji-pop пропадут (apt install fonts-noto-color-emoji)", true);

  const cache = join(homedir(), ".cache", "hyperframes");
  add("модель Kokoro", existsSync(join(cache, "tts", "models", "kokoro-v1.0.onnx")), "скачается при первом голосе (~330 МБ)", true);
  add("модель whisper large-v3-turbo", existsSync(join(cache, "whisper", "models", "ggml-large-v3-turbo.bin")), "скачается при первой транскрипции (~1,6 ГБ)", true);

  const hd = run(join(ROOT_DIR, "node_modules", ".bin", "hyperframes"), ["doctor"], { allowFail: true });
  const hdLines = stripAnsi(hd.stdout + hd.stderr).trim().split("\n").filter((l) => /✗|✖|fail|error/i.test(l));
  add("hyperframes doctor (Chrome и др.)", hd.status === 0, hd.status === 0 ? "в порядке" : hdLines.slice(0, 3).join(" | ") || `код ${hd.status}`, true);

  const fs = statfsSync(ROOT_DIR);
  const freeGb = (fs.bavail * fs.bsize) / 1e9;
  add("место на диске", freeGb >= 5, `свободно ${freeGb.toFixed(0)} ГБ (рендер Short занимает до 0,5 ГБ)`);

  const icon = { ok: "✓", warn: "⚠", fail: "✗" };
  console.log("hygen doctor\n");
  for (const row of rows) console.log(`  ${icon[row.state]} ${row.name.padEnd(32)} ${row.detail}`);
  const failed = rows.filter((r) => r.state === "fail").length;
  console.log(failed ? `\n✗ проблем: ${failed}` : "\n✓ окружение готово");
  return failed === 0;
}
