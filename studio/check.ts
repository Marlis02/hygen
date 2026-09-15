#!/usr/bin/env node
import { spawn } from "node:child_process";
import { ROOT_DIR } from "../engine/src/lib/util.ts";
import { installDom } from "./dom-shim.ts";

// npm run studio:check — смоук-тест панели (ROADMAP S2): сервер поднимается, каждый элемент библиотеки открывается
// карточкой, форма бита рендерится для каждого устройства и каждого stage, Помпеи собираются кнопкой на Kokoro.
// Сессия по движку или библиотеке заканчивается зелёными `npm run library:previews` и этим тестом.
//
//   npm run studio:check                 # всё, включая сборку Помпей (около 8 минут)
//   npm run studio:check -- --no-build   # без сборки (около 20 секунд)

const args = process.argv.slice(2);
const noBuild = args.includes("--no-build") || process.env.npm_config_no_build === "true";
const port = Number(process.env.STUDIO_CHECK_PORT ?? 5188);
const base = `http://127.0.0.1:${port}`;
const rows: { name: string; ok: boolean; detail: string }[] = [];
const add = (name: string, ok: boolean, detail: string): void => {
  rows.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(34)} ${detail}`);
};

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(base + path, { headers: { Host: `localhost:${port}` } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
};
const post = async <T>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Hygen": "1", Host: `localhost:${port}` }, body: JSON.stringify(body) });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`);
  return data;
};

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

console.log(`hygen studio:check — панель на ${base}${noBuild ? " (без сборки)" : ""}\n`);
const server = spawn(process.execPath, ["studio/server.ts", "--no-open"], { cwd: ROOT_DIR, env: { ...process.env, STUDIO_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (b: Buffer) => (serverLog += b.toString()));
server.stderr.on("data", (b: Buffer) => (serverLog += b.toString()));

let failed = false;
try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await wait(300);
    up = await get("/api/projects").then(() => true, () => false);
  }
  add("сервер поднимается", up, up ? `${base} за ${serverLog.includes("studio") ? "" : ""}меньше 20 с` : `не ответил: ${serverLog.slice(-300)}`);
  if (!up) throw new Error("сервер не поднялся");
  add("живой канал", /WebSocket/.test(serverLog), serverLog.split("\n").find((l) => l.includes("chokidar") || l.includes("WebSocket"))?.trim() ?? "нет строки о канале");

  // 1. каждый элемент библиотеки открывается карточкой
  const lib = await get<{ sections: { id: string }[]; items: Record<string, any>[] }>("/api/library");
  const bad = lib.items.filter((i) => !i.id || !i.section || !i.apply || typeof i.name !== "string" || !Array.isArray(i.files));
  add("библиотека: карточки", bad.length === 0 && lib.items.length > 0, bad.length ? `без карточки: ${bad.slice(0, 5).map((i) => `${i.section}/${i.id}`).join(", ")}` : `${lib.items.length} элементов в ${lib.sections.length} разделах`);

  // 2. форма бита рендерится для каждого устройства и каждого stage
  installDom();
  const { field, schemaDef } = await import("./web/forms.ts");
  const schema = await get<Record<string, any>>("/api/schema");
  const problems: string[] = [];
  let made = 0;
  for (const [id, device] of Object.entries(schema.devices as Record<string, any>)) {
    for (const [name, def] of Object.entries((device.params ?? {}) as Record<string, any>)) {
      try {
        const el = field(name, def as any, undefined, () => undefined);
        if (!el || !el.querySelector("label")) problems.push(`${id}.${name}`);
        else made++;
      } catch (err) {
        problems.push(`${id}.${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  for (const type of schema.stageTypes as string[]) {
    const node = (schema.defs as Record<string, any>)[`stage_${type}`] ?? (schema.defs as Record<string, any>).stage;
    try {
      const el = field("type", schemaDef(node), type, () => undefined, { options: schema.stageTypes as string[] });
      if (!el) problems.push(`stage ${type}`);
      else made++;
    } catch (err) {
      problems.push(`stage ${type}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  add("форма бита: устройства и stage", problems.length === 0, problems.length ? problems.slice(0, 5).join("; ") : `${made} полей: ${Object.keys(schema.devices).length} устройств, ${(schema.stageTypes as string[]).length} stage`);

  // 3. Помпеи собираются кнопкой панели, на Kokoro и бесплатно
  if (noBuild) add("сборка Помпей кнопкой", true, "пропущена (--no-build)");
  else {
    const job = await post<{ id: string }>("/api/projects/pompeii-en/build", { render: true });
    let done: Record<string, any> | null = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 30 * 60_000) {
      await wait(5000);
      const j = await get<Record<string, any>>(`/api/jobs/${job.id}`);
      if (j.status !== "running") {
        done = j;
        break;
      }
    }
    const build = await get<Record<string, any>>("/api/projects/pompeii-en");
    const provider = build.renders?.build?.voice?.provider;
    const ok = done?.status === "ok" && provider === "kokoro" && build.renders?.verify?.ok === true;
    add("сборка Помпей кнопкой", ok, ok ? `голос ${provider}, автопроверка зелёная, ${Math.round((Date.now() - t0) / 1000)} с` : `статус ${done?.status ?? "не дождались"}, голос ${provider ?? "?"}: ${(done?.log as string[] | undefined)?.slice(-3).join(" | ") ?? ""}`);
  }
} catch (err) {
  add("смоук-тест", false, err instanceof Error ? err.message : String(err));
} finally {
  server.kill("SIGTERM");
}

failed = rows.some((r) => !r.ok);
console.log(`\n${failed ? "✗ studio:check не пройден" : "✓ studio:check пройден"} — ${rows.filter((r) => r.ok).length} из ${rows.length}`);
process.exit(failed ? 1 : 0);
