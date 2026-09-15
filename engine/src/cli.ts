#!/usr/bin/env node
import { build, verifyOnly } from "./build.ts";
import { doctor } from "./doctor.ts";
import { isRecipe } from "./intents.ts";
import { listScenes, previewScene } from "./preview.ts";
import { previewStage } from "./preview-stage.ts";
import { checkPublish, writePublish } from "./publish.ts";
import { loadSpec } from "./spec.ts";
import { BuildError } from "./lib/util.ts";
import { projectPath } from "./lib/project.ts";
import { buildTimeline, readTimeline, timelineSummary } from "./lib/timeline.ts";

const USAGE = `hygen — движок faceless-канала

  hygen build <projects/<id> или id> [--voice kokoro|elevenlabs] [--quality draft|standard|high] [--no-render] [--no-check] [--no-snapshots]
      голос → тайминги слов → звук → сцены → index.html → lint/check → рендер → мастеринг → автопроверка
  hygen publish <projects/<id> или id> [--mp4 <файл>]
      publish/ из готовой сборки и MP4: 3 названия, описание с источниками и кредитами, теги, SRT фразами, обложка
  hygen verify <projects/<id> или id> [--mp4 <файл>] [--no-snapshots]
      автопроверка готового MP4 и контактный лист
  hygen timeline <projects/<id> или id> [--read] [--json]
      карта ролика из готового build/ → build/timeline.json без пересборки; --read — как панель (оценка, если project.json изменился), без записи; --json — вся карта
  hygen scene <id сцены> [--params '{json}'] [--tone accent|cold] [--seed n] [--at t1,t2] [--look id|'{json}'] [--textures '[{"id":"rain"}]'] [--beat '{"type":"stagger","camera":"handheld","post":[{"id":"bloom"}]}']
      быстрый просмотр сцены без голоса: lint + снимки + .preview/<id>/sheet.jpg; --transition <id> — сцена дважды с этим переходом на стыке
  hygen scene --device <тип> [--params '{json}'] | --stage <тип> --src <файл> | <рецепт> [--look id] [--text "…"] [--dur с] [--beat '{json}'] [--preset <субтитры>]
      превью stage-бита, устройства или рецепта: lint + снимки + .preview/<device-…|stage-…|recipe-…>/sheet.jpg
  общие флаги scene: --name <папка .preview> --render <out.mp4> [--from с] [--clip с] [--no-sheet]
      --render: hyperframes render (draft) → клип 540×960 H.264 без звука, длина --clip, иначе --dur, иначе 3 с
  hygen scenes
      список сцен библиотеки
  hygen doctor
      проверка окружения

  из корня репозитория: npm run build -- projects/pompeii-en`;

const VALUE_FLAGS = new Set(["--voice", "--quality", "--mp4", "--params", "--tone", "--seed", "--at", "--look", "--textures", "--beat", "--stage", "--src", "--device", "--text", "--dur", "--preset", "--render", "--name", "--from", "--clip", "--transition"]);

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const value = (name: string): string | undefined => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const positional = rest.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(rest[i - 1] ?? ""));
  const dir = positional[0] ? projectPath(positional[0]) : undefined;
  if (cmd === "build" && dir) {
    const quality = value("--quality") ?? "standard";
    if (!["draft", "standard", "high"].includes(quality)) throw new BuildError(`--quality: draft, standard или high, а не ${quality}`);
    const ok = await build(dir, { render: !flags.has("--no-render"), check: !flags.has("--no-check"), quality, snapshots: !flags.has("--no-snapshots"), voice: value("--voice") });
    return ok ? 0 : 1;
  }
  if (cmd === "publish" && dir) {
    const spec = loadSpec(dir);
    const res = writePublish(dir, spec, value("--mp4"));
    console.log(`publish/: ${res.files.join(", ")} · источников ${res.sources.length}, кредитов ${res.credits.length}, обложка — ${res.thumbnailAt.beat} @${res.thumbnailAt.t.toFixed(2)} с`);
    const chk = checkPublish(dir, spec);
    console.log(`${chk.ok ? "✓" : "✗"} publish   ${chk.detail}`);
    return chk.ok ? 0 : 1;
  }
  if (cmd === "verify" && dir) return verifyOnly(dir, value("--mp4"), !flags.has("--no-snapshots")) ? 0 : 1;
  if (cmd === "timeline" && dir) {
    const tl = flags.has("--read") ? readTimeline(dir) : buildTimeline(dir);
    console.log(flags.has("--json") ? JSON.stringify(tl, null, 2) : `${timelineSummary(tl)}${flags.has("--read") ? "" : "\n→ build/timeline.json"}`);
    return 0;
  }
  const num = (name: string): number | undefined => {
    const v = value(name);
    if (v === undefined) return undefined;
    if (!Number.isFinite(Number(v))) throw new BuildError(`${name}: число, а не ${v}`);
    return Number(v);
  };
  const output = { name: value("--name"), render: value("--render"), sheet: !flags.has("--no-sheet"), from: num("--from"), clip: num("--clip") };
  if (cmd === "scene" && (value("--stage") || value("--device") || (positional[0] && isRecipe(positional[0])))) {
    const dur = value("--dur");
    const common = { ...output, beat: value("--beat"), look: value("--look"), text: value("--text"), dur: dur === undefined ? undefined : Number(dur), tone: value("--tone"), at: value("--at"), preset: value("--preset") };
    if (value("--device")) return previewStage({ ...common, device: value("--device"), params: value("--params") }) ? 0 : 1;
    if (value("--stage")) return previewStage({ ...common, stage: value("--stage"), src: value("--src") }) ? 0 : 1;
    return previewStage({ ...common, recipe: positional[0] }) ? 0 : 1;
  }
  if (cmd === "scene" && positional[0]) {
    const seed = value("--seed");
    return previewScene(positional[0], { params: value("--params"), tone: value("--tone"), seed: seed === undefined ? undefined : Number(seed), at: value("--at"), look: value("--look"), textures: value("--textures"), beat: value("--beat"), transition: value("--transition"), ...output }) ? 0 : 1;
  }
  if (cmd === "scenes") return listScenes() ? 0 : 1;
  if (cmd === "doctor") return doctor() ? 0 : 1;
  console.log(USAGE);
  return cmd && cmd !== "help" && cmd !== "--help" ? 2 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof BuildError) console.error(`\n✗ ${err.message}`);
    else console.error(err);
    process.exit(1);
  },
);
