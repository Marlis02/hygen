import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Панель на Preact (ROADMAP S3): dev — Vite как middleware внутри studio/server.ts на том же порту 5177;
// prod — `npm run studio:build` → studio/dist/, сервер отдаёт его с флагом --dist.
const STUDIO = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: join(STUDIO, "web"),
  cacheDir: join(STUDIO, "..", ".cache", "vite"),
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  build: { outDir: join(STUDIO, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 900 },
  clearScreen: false,
  logLevel: "warn",
});
