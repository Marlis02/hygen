#!/usr/bin/env node
import { resolve } from "node:path";
import { build, verifyOnly } from "./build.ts";
import { doctor } from "./doctor.ts";
import { listScenes, previewScene } from "./preview.ts";
import { BuildError } from "./lib/util.ts";

const USAGE = `hygen — движок faceless-канала

  hygen build <папка ролика> [--quality draft|standard|high] [--no-render] [--no-check] [--no-snapshots]
      голос → тайминги слов → звук → сцены → index.html → lint/check → рендер → мастеринг → автопроверка
  hygen verify <папка ролика> [--mp4 <файл>] [--no-snapshots]
      автопроверка готового MP4 и контактный лист
  hygen scene <id сцены> [--params '{json}'] [--tone accent|cold] [--seed n] [--at t1,t2]
      быстрый просмотр сцены без голоса: lint + снимки + .preview/<id>/sheet.jpg
  hygen scenes
      список сцен библиотеки
  hygen doctor
      проверка окружения

  из корня репозитория: npm run build -- videos/pompeii-en`;

const VALUE_FLAGS = new Set(["--quality", "--mp4", "--params", "--tone", "--seed", "--at"]);

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const value = (name: string): string | undefined => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const positional = rest.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(rest[i - 1] ?? ""));
  const dir = positional[0] ? resolve(positional[0]) : undefined;
  if (cmd === "build" && dir) {
    const quality = value("--quality") ?? "standard";
    if (!["draft", "standard", "high"].includes(quality)) throw new BuildError(`--quality: draft, standard или high, а не ${quality}`);
    const ok = await build(dir, { render: !flags.has("--no-render"), check: !flags.has("--no-check"), quality, snapshots: !flags.has("--no-snapshots") });
    return ok ? 0 : 1;
  }
  if (cmd === "verify" && dir) return verifyOnly(dir, value("--mp4"), !flags.has("--no-snapshots")) ? 0 : 1;
  if (cmd === "scene" && positional[0]) {
    const seed = value("--seed");
    return previewScene(positional[0], { params: value("--params"), tone: value("--tone"), seed: seed === undefined ? undefined : Number(seed), at: value("--at") }) ? 0 : 1;
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
