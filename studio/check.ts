#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../engine/src/lib/util.ts";

// npm run studio:check — смоук-тест панели: сервер с Vite поднимается, каждый элемент библиотеки открывается карточкой,
// форма бита рендерится для каждого устройства и каждого stage (Preact → строка), «Новый ролик» создаёт проект-бриф
// и ничего не запускает сам, Помпеи собираются кнопкой на Kokoro.
// Сессия по движку или библиотеке заканчивается зелёными `npm run library:previews` и этим тестом.
//
//   npm run studio:check                 # всё, включая сборку Помпей (около 5–8 минут)
//   npm run studio:check -- --no-build   # без сборки (около 30 секунд)

const args = process.argv.slice(2);
const noBuild = args.includes("--no-build") || process.env.npm_config_no_build === "true";
const port = Number(process.env.STUDIO_CHECK_PORT ?? 5188);
const base = `http://127.0.0.1:${port}`;
const rows: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail: string): void => {
  rows.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(34)} ${detail}`);
};

const headers = { Host: `localhost:${port}` };
const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(base + path, { headers });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
};
const send = async <T>(method: string, path: string, body: unknown): Promise<T> => {
  const res = await fetch(base + path, { method, headers: { ...headers, "Content-Type": "application/json", "X-Hygen": "1" }, body: JSON.stringify(body) });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`);
  return data;
};
const post = <T>(path: string, body: unknown): Promise<T> => send<T>("POST", path, body);

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

console.log(`hygen studio:check — панель на ${base}${noBuild ? " (без сборки)" : ""}\n`);
const server = spawn(process.execPath, ["studio/server.ts", "--no-open"], { cwd: ROOT_DIR, env: { ...process.env, STUDIO_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (b: Buffer) => (serverLog += b.toString()));
server.stderr.on("data", (b: Buffer) => (serverLog += b.toString()));

let failed = false;
const PROBE = "studio-check-brief-en";
try {
  let up = false;
  const t0 = Date.now();
  for (let i = 0; i < 100 && !up; i++) {
    await wait(300);
    up = await fetch(`${base}/`, { headers }).then((r) => r.ok, () => false);
  }
  add("сервер и страница поднимаются", up, up ? `${base}, Vite dev, ${((Date.now() - t0) / 1000).toFixed(1)} с` : `не ответил: ${serverLog.slice(-300)}`);
  if (!up) throw new Error("сервер не поднялся");
  add("живой канал", /WebSocket/.test(serverLog), serverLog.split("\n").find((l) => l.includes("WebSocket"))?.trim() ?? "нет строки о канале");

  // 1. каждый элемент библиотеки открывается карточкой
  const lib = await get<{ sections: { id: string }[]; items: Record<string, any>[] }>("/api/library");
  const bad = lib.items.filter((i) => !i.id || !i.section || !i.apply || typeof i.name !== "string" || !Array.isArray(i.files));
  add("библиотека: карточки", bad.length === 0 && lib.items.length > 0, bad.length ? `без карточки: ${bad.slice(0, 5).map((i) => `${i.section}/${i.id}`).join(", ")}` : `${lib.items.length} элементов в ${lib.sections.length} разделах`);

  // 2. форма бита рендерится для каждого устройства и каждого stage: тот же forms.tsx, что у страницы, через Vite SSR
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({ configFile: join(ROOT_DIR, "studio", "vite.config.ts"), appType: "custom", server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const { h } = await import("preact");
    const { renderToString } = await import("preact-render-to-string");
    const i18n = await vite.ssrLoadModule("/src/lib/i18n.ts");
    i18n.setStrings(JSON.parse(readFileSync(join(ROOT_DIR, "studio", "i18n", "ru.json"), "utf8")));
    const { Field, schemaDef } = await vite.ssrLoadModule("/src/forms.tsx");
    const schema = await get<Record<string, any>>("/api/schema");
    const problems: string[] = [];
    let made = 0;
    const render = (label: string, props: Record<string, unknown>): void => {
      try {
        const html = renderToString(h(Field, { onChange: () => undefined, ...props }));
        if (!html.includes("<label") || !/<(input|select|textarea)/.test(html)) problems.push(label);
        else made++;
      } catch (err) {
        problems.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    for (const [id, device] of Object.entries(schema.devices as Record<string, any>)) {
      for (const [name, def] of Object.entries((device.params ?? {}) as Record<string, any>)) render(`${id}.${name}`, { name, def, value: undefined });
    }
    for (const type of schema.stageTypes as string[]) {
      const node = (schema.defs as Record<string, any>)[`stage_${type}`] ?? (schema.defs as Record<string, any>).stage;
      render(`stage ${type}`, { name: "type", def: schemaDef(node), value: type, options: schema.stageTypes });
    }
    add("форма бита: устройства и stage", problems.length === 0, problems.length ? problems.slice(0, 5).join("; ") : `${made} полей (preact-render-to-string): ${Object.keys(schema.devices).length} устройств, ${(schema.stageTypes as string[]).length} stage`);
  } finally {
    await vite.close();
  }

  // 3. «Новый ролик» → проект-бриф: экран открывается, бюджет в project.json, ничего не запущено само
  const dir = join(ROOT_DIR, "projects", PROBE);
  if (existsSync(join(dir, "project.json"))) await send("DELETE", `/api/projects/${PROBE}`, { confirm: PROBE });
  const jobsBefore = (await get<{ jobs: unknown[] }>("/api/jobs")).jobs.length;
  await post("/api/brief", { id: PROBE, topic: "Studio check: brief only", genre: "history", look: "director", budgetChars: 1234 });
  await wait(1500);
  const proj = await get<Record<string, any>>(`/api/projects/${PROBE}`);
  const onDisk = JSON.parse(readFileSync(join(dir, "project.json"), "utf8"));
  const dialogs = await get<{ running: { project: string }[] }>("/api/dialogs");
  const jobsAfter = (await get<{ jobs: unknown[] }>("/api/jobs")).jobs.length;
  const briefProblems = [
    proj.card?.status === "brief" ? "" : `статус ${proj.card?.status}`,
    onDisk.voice?.budgetChars === 1234 ? "" : `voice.budgetChars ${onDisk.voice?.budgetChars}`,
    proj.validation?.ok ? "" : `project.json не проходит проверку: ${proj.validation?.error}`,
    dialogs.running.some((d) => d.project === PROBE) ? "диалог запустился сам" : "",
    jobsAfter === jobsBefore ? "" : `появились задачи: ${jobsAfter - jobsBefore}`,
    existsSync(join(dir, "build")) ? "появился build/" : "",
    existsSync(join(dir, "media")) || existsSync(join(dir, "research.md")) ? "появились media/ или research.md — поиск или исследование" : "",
  ].filter(Boolean);
  // экран проекта в настоящем браузере, если Chrome есть: без плашки «нет проекта» и без запросов кроме чтения
  let screen = "без браузера";
  const chrome = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => existsSync(p));
  if (chrome) {
    const { createRequire } = await import("node:module");
    const puppeteer = (await import(createRequire(join(ROOT_DIR, "package.json")).resolve("puppeteer-core"))).default;
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      const writes: string[] = [];
      const errors: string[] = [];
      page.on("request", (r: any) => r.method() !== "GET" && writes.push(`${r.method()} ${new URL(r.url()).pathname}`));
      page.on("pageerror", (e: any) => errors.push(e.message));
      page.on("console", (m: any) => m.type() === "error" && errors.push(m.text()));
      await page.goto(`http://localhost:${port}/#/project/${PROBE}/dialogs`, { waitUntil: "networkidle2" });
      await wait(1500);
      const seen = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent ?? "", err: [...document.querySelectorAll(".banner.err")].map((b) => b.textContent ?? ""), open: [...document.querySelectorAll(".term-head button")].map((b) => b.textContent ?? "") }));
      if (seen.h1 !== "Studio check: brief only") briefProblems.push(`экран: заголовок «${seen.h1}»`);
      if (seen.err.length) briefProblems.push(`экран: ${seen.err.join(" | ")}`);
      if (writes.length) briefProblems.push(`страница сама отправила ${writes.join(", ")}`);
      if (errors.length) briefProblems.push(`консоль: ${errors.slice(0, 2).join(" | ")}`);
      screen = `экран «${seen.h1}», кнопки: ${seen.open.join(" / ")}`;
    } finally {
      await browser.close();
    }
  }
  await send("DELETE", `/api/projects/${PROBE}`, { confirm: PROBE });
  add("создание из брифа", briefProblems.length === 0 && !existsSync(dir), briefProblems.length ? briefProblems.join("; ") : `статус brief, бюджет 1234, задач и диалогов нет, build/ нет; ${screen}; проект удалён`);

  // 4. Помпеи собираются кнопкой панели, на Kokoro и бесплатно
  if (noBuild) add("сборка Помпей кнопкой", true, "пропущена (--no-build)");
  else {
    const job = await post<{ id: string }>("/api/projects/pompeii-en/build", { render: true });
    let done: Record<string, any> | null = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 30 * 60_000) {
      await wait(5000);
      const j = await get<Record<string, any>>(`/api/jobs/${job.id}`);
      if (j.status !== "running") {
        done = j;
        break;
      }
    }
    const build = await get<Record<string, any>>("/api/projects/pompeii-en");
    const provider = build.renders?.build?.voice?.provider;
    const timeline = await get<Record<string, any>>("/api/projects/pompeii-en/timeline").catch(() => null);
    const ok = done?.status === "ok" && provider === "kokoro" && build.renders?.verify?.ok === true && timeline?.estimated === false && (timeline?.beats?.length ?? 0) > 0;
    add("сборка Помпей кнопкой", ok, ok ? `голос ${provider}, автопроверка зелёная, карта ролика ${timeline?.beats.length} битов / ${timeline?.words.length} слов, ${Math.round((Date.now() - t1) / 1000)} с` : `статус ${done?.status ?? "не дождались"}, голос ${provider ?? "?"}, карта ${timeline ? `estimated=${timeline.estimated}` : "нет"}: ${(done?.log as string[] | undefined)?.slice(-3).join(" | ") ?? ""}`);
  }
} catch (err) {
  add("смоук-тест", false, err instanceof Error ? err.message : String(err));
  await send("DELETE", `/api/projects/${PROBE}`, { confirm: PROBE }).catch(() => undefined);
} finally {
  server.kill("SIGTERM");
}

failed = rows.some((r) => !r.ok);
console.log(`\n${failed ? "✗ studio:check не пройден" : "✓ studio:check пройден"} — ${rows.filter((r) => r.ok).length} из ${rows.length}`);
process.exit(failed ? 1 : 0);
