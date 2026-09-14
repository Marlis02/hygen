#!/usr/bin/env node
/**
 * npm run media -- "<запрос>" [--n 5] [--video] [--sheet <файл.jpg>] — медиа с подходящей лицензией: Wikimedia Commons (public domain,
 * CC0, CC BY, CC BY-SA), Pexels — если в .env есть PEXELS_API_KEY; таблица и лист миниатюр с номерами.
 * npm run media -- --get "<File:Имя>" <videoId> [--as <имя>] [--width 2400] [--in <с> --out <с>] — файл в videos/<id>/media/ и рядом
 * <имя>.license.json; видео — отрезок без звука в VP9 webm.
 */
import { createWriteStream, existsSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { checkLicense, licenseOf } from "./contract.ts";
import { BuildError, ROOT_DIR, ensureDir, fail, lastJsonLine, loadEnv, pool, pyScript, python, run, writeJson } from "./lib/util.ts";

const UA = "hygen-engine/0.1 (faceless channel draft tool)";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const EXTMETA = "ObjectName|ImageDescription|Artist|Credit|LicenseShortName|License|UsageTerms|LicenseUrl|DateTimeOriginal|Restrictions";
/** Thumbnail widths upload.wikimedia.org serves; any other width is HTTP 400 (the API rounds up to the next one). */
const THUMB_WIDTHS = [250, 330, 500, 960, 1280, 1920, 3840];
/** Widest image kept in git: wider originals come as the 3840 px thumbnail. */
const MAX_WIDTH = 3840;
const PEXELS_LICENSE = "https://www.pexels.com/license/";
/** Pexels rendition taken without --width: the widest mp4 up to this width. */
const PEXELS_VIDEO_WIDTH = 1920;
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/tiff"];
const WEB_EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const MEDIA_EXT = /\.(jpe?g|png|webp|tiff?|webm|mp4|mov|ogv|mkv)$/i;
/** Clips for media/: VP9 webm without sound, like the D4 media — a third smaller than H.264 crf 23 on archive film. */
const VP9 = ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-pix_fmt", "yuv420p"];

interface Found {
  /** What --get takes: File:<name>, pexels:photo:<id> or pexels:video:<id>. */
  id: string;
  source: "Wikimedia Commons" | "Pexels";
  title: string;
  author: string;
  /** Accepted license name; "" when the license does not fit the channel. */
  license: string;
  licenseRaw: string;
  licenseUrl: string;
  /** File page — the url of license.json. */
  page: string;
  description: string;
  date: string;
  restrictions: string;
  mime: string;
  video: boolean;
  width: number;
  height: number;
  /** 0 when the source does not tell. */
  bytes: number;
  duration: number;
  thumb: string;
  original: string;
}

interface CommonsInfo {
  url: string;
  descriptionurl: string;
  thumburl?: string;
  width: number;
  height: number;
  size: number;
  duration?: number;
  mime: string;
  mediatype: string;
  extmetadata?: Record<string, { value?: unknown }>;
}

interface CommonsReply {
  query?: { pages?: { title: string; index?: number; missing?: boolean; imageinfo?: CommonsInfo[] }[] };
  continue?: { gsroffset?: number };
  error?: { code?: string; info?: string };
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer?: string;
  alt?: string;
  src: Record<string, string>;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  duration: number;
  image: string;
  user?: { name?: string };
  video_files: { file_type: string; width: number | null; height: number | null; link: string }[];
}

interface GetOptions {
  name?: string;
  width?: number;
  from?: number;
  to?: number;
}

interface Saved {
  file: string;
  summary: string;
  notes: string;
}

// ── text ────────────────────────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function entity(match: string, body: string): string {
  if (!body.startsWith("#")) return ENTITIES[body.toLowerCase()] ?? match;
  const code = /^#x/i.test(body) ? parseInt(body.slice(2), 16) : Number(body.slice(1));
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
}

/** Commons metadata HTML → one line of text: hidden duplicates dropped, tags stripped, entities decoded. */
function plain(html: string): string {
  return html
    .replace(/<(\w+)\b[^>]*display:\s*none[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/li>/gi, "; ")
    .replace(/<br\s*\/?>|<\/(?:p|div)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, entity)
    .replace(/\s+/g, " ")
    .replace(/[;\s]+$/, "")
    .trim();
}

function cut(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

function slug(text: string): string {
  const s = text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "");
  return s.slice(0, 60).replace(/-+$/, "") || "media";
}

function bytesText(bytes: number, en = false): string {
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} ${en ? "KB" : "КБ"}`;
  return `${(bytes / 1048576).toFixed(1)} ${en ? "MB" : "МБ"}`;
}

function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const secs = (x: number): string => String(Math.round(x * 100) / 100);

const sizeOf = (f: Found): string =>
  [`${f.width}×${f.height}`, f.bytes ? bytesText(f.bytes) : "", f.video && f.duration ? clock(f.duration) : ""].filter(Boolean).join(" · ");

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Drop the utm_* tracking parameters Commons appends to file links. */
function clean(url: string): string {
  if (!url) return url;
  const u = new URL(url);
  for (const key of [...u.searchParams.keys()]) if (key.startsWith("utm_")) u.searchParams.delete(key);
  return u.toString();
}

/** .jpg | .png | .webp of a link, else the fallback. */
function extOf(url: string, fallback: string): string {
  const ext = extname(new URL(url).pathname).toLowerCase();
  return ext === ".jpeg" ? ".jpg" : [".jpg", ".png", ".webp"].includes(ext) ? ext : fallback;
}

/** Commons license name → what the channel may use: Public domain, CC0, CC BY, CC BY-SA (any version); "" for anything else. */
function acceptLicense(short: string, code: string): string {
  const norm = (s: string): string => s.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const s = norm(short);
  const c = norm(code);
  const tokens = new Set(`${s}-${c}`.split("-"));
  if (tokens.has("nc") || tokens.has("nd") || /fair-?use|non-?free/.test(`${s} ${c}`)) return "";
  if (/^cc0(-|$)/.test(s) || /^cc0(-|$)/.test(c)) return "CC0";
  if (/^(public-domain|pd)(-|$)/.test(s) || /^pdm?(-|$)/.test(c)) return "Public domain";
  for (const v of [s, c]) {
    const m = /^cc-by(-sa)?(?:-(\d(?:\.\d)?))?(?:-|$)/.exec(v);
    if (m) return /^cc by/i.test(short.trim()) ? short.trim() : `CC BY${m[1] ? "-SA" : ""}${m[2] ? ` ${m[2]}` : ""}`;
  }
  return "";
}

// ── network ─────────────────────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** GET with the engine User-Agent; 408/429/5xx and network errors are retried up to 4 attempts. */
async function http(url: string, what: string, headers: Record<string, string> = {}): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let status = 0;
    let wait = attempt * 2;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
      if (res.ok) return res;
      status = res.status;
      wait = Number(res.headers.get("retry-after")) || wait;
      await res.body?.cancel();
      // upload.wikimedia.org bans a burst of downloads for 10 min (Retry-After: 600): retrying only extends the ban
      if (status === 429 && wait > 30) fail(`${what}: HTTP 429 — сервер ограничил частоту запросов, повторить через ${Math.ceil(wait / 60)} мин`);
      if (![408, 429, 500, 502, 503, 504].includes(status)) fail(`${what}: HTTP ${status}`);
    } catch (err) {
      if (err instanceof BuildError) throw err;
      if (attempt >= 4) fail(`${what}: сеть недоступна (${(err as { cause?: { code?: string } }).cause?.code ?? String(err)})`);
    }
    if (attempt >= 4) fail(`${what}: HTTP ${status} после ${attempt} попыток`);
    await sleep(Math.min(wait, 30) * 1000);
  }
}

async function getJson<T>(url: string, what: string, headers?: Record<string, string>): Promise<T> {
  return (await (await http(url, what, headers)).json()) as T;
}

async function download(url: string, file: string, what: string): Promise<number> {
  const res = await http(url, what);
  if (!res.body) fail(`${what}: пустой ответ`);
  const part = `${file}.part`;
  await pipeline(Readable.fromWeb(res.body as WebReadableStream), createWriteStream(part));
  renameSync(part, file);
  return statSync(file).size;
}

// ── Wikimedia Commons ───────────────────────────────────────────────────────────────────────────────────

function commonsUrl(extra: Record<string, string>): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    prop: "imageinfo",
    iiprop: "url|size|mime|mediatype|extmetadata",
    iiextmetadatafilter: EXTMETA,
    iiextmetadatalanguage: "en",
    iiurlwidth: "400",
    ...extra,
  });
  return `${COMMONS_API}?${params}`;
}

function commonsItem(title: string, ii: CommonsInfo): Found {
  const meta = (key: string): string => {
    const value = ii.extmetadata?.[key]?.value;
    return typeof value === "string" ? plain(value) : typeof value === "number" ? String(value) : "";
  };
  const short = meta("LicenseShortName");
  const license = acceptLicense(short, meta("License"));
  const artist = meta("Artist").replace(/^unknown$/i, "Unknown author");
  return {
    id: title,
    source: "Wikimedia Commons",
    title: meta("ObjectName") || title.replace(/^File:/, "").replace(/\.[^.]+$/, ""),
    author: artist || (license.startsWith("CC BY") ? meta("Credit") : "") || "Unknown author",
    license,
    licenseRaw: short || meta("UsageTerms") || "без лицензии",
    licenseUrl: meta("LicenseUrl"),
    page: ii.descriptionurl,
    description: meta("ImageDescription"),
    date: meta("DateTimeOriginal"),
    restrictions: meta("Restrictions"),
    mime: ii.mime,
    video: ii.mediatype === "VIDEO",
    width: ii.width,
    height: ii.height,
    bytes: ii.size,
    duration: ii.duration ?? 0,
    thumb: clean(ii.thumburl ?? ""),
    original: clean(ii.url),
  };
}

interface Batch {
  found: Found[];
  seen: number;
  dropped: Map<string, number>;
}

/** Search pages of 20–50 files until n fit the license filter (at most 4 pages). */
async function searchCommons(query: string, n: number, video: boolean): Promise<Batch> {
  const batch: Batch = { found: [], seen: 0, dropped: new Map() };
  const filter = /\bfiletype:/i.test(query) ? "" : video ? " filetype:video" : " filetype:bitmap";
  const limit = Math.min(50, Math.max(20, n * 4));
  let offset = 0;
  for (let page = 0; page < 4 && batch.found.length < n; page++) {
    const reply = await getJson<CommonsReply>(
      commonsUrl({ generator: "search", gsrsearch: query + filter, gsrnamespace: "6", gsrlimit: String(limit), gsroffset: String(offset) }),
      "Commons: поиск",
    );
    if (reply.error) fail(`Commons: ${reply.error.info ?? reply.error.code}`);
    const pages = [...(reply.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii || (video ? ii.mediatype !== "VIDEO" : !IMAGE_MIMES.includes(ii.mime))) continue;
      if (batch.found.length >= n) break;
      batch.seen++;
      const item = commonsItem(p.title, ii);
      if (item.license) batch.found.push(item);
      else batch.dropped.set(item.licenseRaw, (batch.dropped.get(item.licenseRaw) ?? 0) + 1);
    }
    if (reply.continue?.gsroffset === undefined) break;
    offset = reply.continue.gsroffset;
  }
  return batch;
}

/** File:Name, Name, a Commons file page or an upload.wikimedia.org link → the file with its metadata. */
async function commonsFile(ref: string): Promise<Found> {
  let name = ref.trim();
  const page = /commons\.wikimedia\.org\/wiki\/([^?#]+)/i.exec(name);
  const upload = /upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i.exec(name);
  if (page) name = decodeURIComponent(page[1]);
  else if (upload) name = decodeURIComponent(upload[1]);
  name = name.replace(/^(?:File|Image|Файл):/i, "").replace(/_/g, " ").trim();
  if (!name) fail("--get: пустое имя файла");
  const reply = await getJson<CommonsReply>(commonsUrl({ titles: `File:${name}` }), `Commons: File:${name}`);
  if (reply.error) fail(`Commons: ${reply.error.info ?? reply.error.code}`);
  const hit = reply.query?.pages?.[0];
  const info = hit?.imageinfo?.[0];
  if (!hit || hit.missing || !info) fail(`Commons: нет файла «File:${name}»`);
  return commonsItem(hit.title, info);
}

// ── Pexels (only with PEXELS_API_KEY) ──────────────────────────────────────────────────────────────────

function pexelsTitle(pageUrl: string): string {
  return (/\/(?:photo|video)\/([^/?#]+?)-\d+\/?(?:[?#]|$)/.exec(pageUrl)?.[1] ?? "").replace(/-/g, " ").trim();
}

function pexelsPhoto(p: PexelsPhoto): Found {
  const title = p.alt?.trim() || pexelsTitle(p.url) || `Pexels photo ${p.id}`;
  return {
    id: `pexels:photo:${p.id}`,
    source: "Pexels",
    title,
    author: p.photographer?.trim() || "Pexels",
    license: "Pexels License",
    licenseRaw: "Pexels License",
    licenseUrl: PEXELS_LICENSE,
    page: p.url,
    description: p.alt?.trim() ?? "",
    date: "",
    restrictions: "",
    mime: "image/jpeg",
    video: false,
    width: p.width,
    height: p.height,
    bytes: 0,
    duration: 0,
    thumb: p.src.medium ?? p.src.small ?? "",
    original: p.src.original ?? "",
  };
}

function pexelsVideo(v: PexelsVideo, maxWidth = PEXELS_VIDEO_WIDTH): Found {
  const title = pexelsTitle(v.url) || `Pexels video ${v.id}`;
  const files = v.video_files.filter((f) => f.file_type === "video/mp4" && f.width && f.link).sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const file = [...files].reverse().find((f) => (f.width ?? 0) <= maxWidth) ?? files[0];
  return {
    id: `pexels:video:${v.id}`,
    source: "Pexels",
    title,
    author: v.user?.name?.trim() || "Pexels",
    license: "Pexels License",
    licenseRaw: "Pexels License",
    licenseUrl: PEXELS_LICENSE,
    page: v.url,
    description: title,
    date: "",
    restrictions: "",
    mime: "video/mp4",
    video: true,
    width: v.width,
    height: v.height,
    bytes: 0,
    duration: v.duration,
    thumb: v.image,
    original: file?.link ?? "",
  };
}

async function searchPexels(query: string, n: number, video: boolean, key: string): Promise<Found[]> {
  const params = new URLSearchParams({ query, per_page: String(n) });
  const auth = { Authorization: key };
  if (video) {
    const reply = await getJson<{ videos?: PexelsVideo[] }>(`https://api.pexels.com/videos/search?${params}`, "Pexels: поиск видео", auth);
    return (reply.videos ?? []).map((v) => pexelsVideo(v));
  }
  const reply = await getJson<{ photos?: PexelsPhoto[] }>(`https://api.pexels.com/v1/search?${params}`, "Pexels: поиск фото", auth);
  return (reply.photos ?? []).map(pexelsPhoto);
}

async function pexelsById(kind: string, id: string, key: string, width: number | undefined): Promise<Found> {
  const auth = { Authorization: key };
  if (kind === "photo") return pexelsPhoto(await getJson<PexelsPhoto>(`https://api.pexels.com/v1/photos/${id}`, `Pexels: фото ${id}`, auth));
  const v = await getJson<PexelsVideo>(`https://api.pexels.com/videos/videos/${id}`, `Pexels: видео ${id}`, auth);
  return pexelsVideo(v, width ?? PEXELS_VIDEO_WIDTH);
}

// ── search ──────────────────────────────────────────────────────────────────────────────────────────────

function printTable(items: Found[], first: number): void {
  if (!items.length) return;
  const head = ["№", "файл", "автор", "лицензия", "размер"];
  const rows = items.map((f, i) => [String(first + i), f.id, cut(f.author, 40), f.license, sizeOf(f)]);
  const widths = head.map((h, c) => Math.min(c === 1 ? 72 : 44, Math.max(h.length, ...rows.map((r) => r[c].length))));
  const line = (cells: string[]): string => cells.map((cell, c) => (c < cells.length - 1 ? cell.padEnd(widths[c]) : cell)).join("  ");
  const indent = " ".repeat(widths[0] + 2);
  console.log(line(head));
  for (const [i, f] of items.entries()) {
    console.log(line(rows[i]));
    const about = [f.date ? cut(f.date, 40) : "", cut(f.description || f.title, 120), f.restrictions ? `ограничения: ${f.restrictions}` : ""];
    console.log(indent + about.filter(Boolean).join(" · "));
    console.log(indent + f.page);
  }
}

async function makeSheet(items: Found[], out: string): Promise<void> {
  if (!items.length) {
    console.log("Лист миниатюр: нечего показывать");
    return;
  }
  const target = resolve(out);
  const tmp = mkdtempSync(join(ensureDir(join(ROOT_DIR, ".cache", "media")), "sheet-"));
  try {
    const tiles = await pool(items, 2, async (f, i) => {
      if (!f.thumb) return null;
      const file = join(tmp, `${String(i + 1).padStart(2, "0")}${extOf(f.thumb, ".jpg")}`);
      try {
        await download(f.thumb, file, `миниатюра №${i + 1}`);
        return file;
      } catch (err) {
        console.log(`  ⚠ ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    });
    const manifest = join(tmp, "sheet.json");
    writeJson(manifest, items.map((f, i) => ({ n: i + 1, path: tiles[i], caption: `${f.license} · ${sizeOf(f)}`, title: f.title })));
    ensureDir(dirname(target));
    const res = lastJsonLine<{ width: number; height: number }>(run(python(), [pyScript("media_sheet.py"), "sheet", manifest, target]).stdout);
    console.log(`\nЛист миниатюр: ${target} · ${res.width}×${res.height} · номера как в таблице`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function search(query: string, n: number, video: boolean, sheet: string | undefined, provider = "all"): Promise<number> {
  const kind = video ? "видео" : "картинки";
  const all: Found[] = [];
  if (provider !== "pexels") {
    const commons = await searchCommons(query, n, video);
    const dropped = [...commons.dropped].map(([name, count]) => `${name} ×${count}`).join(", ");
    console.log(
      `Wikimedia Commons · ${kind} · «${query}»: подходящих ${commons.found.length} из ${commons.seen} просмотренных` +
        (dropped ? ` · отброшено по лицензии: ${dropped}` : ""),
    );
    printTable(commons.found, 1);
    all.push(...commons.found);
  }
  const key = loadEnv().PEXELS_API_KEY;
  if (provider === "commons") {
    // Commons only
  } else if (!key) console.log(`\nPexels: ключа нет (PEXELS_API_KEY в .env), ${provider === "pexels" ? "поиск не выполнен" : "пропущено"}`);
  else {
    try {
      const found = await searchPexels(query, n, video, key);
      console.log(`\nPexels · ${kind} · «${query}»: ${found.length}`);
      printTable(found, all.length + 1);
      all.push(...found);
    } catch (err) {
      console.log(`\nPexels: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (sheet) await makeSheet(all, sheet);
  if (!all.length) {
    console.log("Ничего не нашлось: запрос короче или другими словами");
    return 1;
  }
  console.log(`\nСкачать: npm run media -- --get "<файл>" <videoId> [--as <имя>]${video ? " [--in <с> --out <с>]" : " [--width 2400]"}`);
  return 0;
}

// ── download ────────────────────────────────────────────────────────────────────────────────────────────

/** videos/<id>/media inside the repo; the video folder must exist, so a typo in the id does not start a new video. */
function mediaDirOf(arg: string): string {
  let dir = isAbsolute(arg) ? resolve(arg) : resolve(ROOT_DIR, /^(\.\/)?videos\//.test(arg) ? arg : join("videos", arg));
  if (basename(dir) === "media") dir = dirname(dir);
  const inside = relative(join(ROOT_DIR, "videos"), dir);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) fail(`${arg}: папка ролика должна лежать внутри videos/ репозитория`);
  if (!existsSync(dir)) fail(`нет папки ролика ${relative(ROOT_DIR, dir)} — проверьте id или создайте папку`);
  return ensureDir(join(dir, "media"));
}

interface Probe {
  duration: number;
  width: number;
  height: number;
  audio: number;
  codec: string;
}

function probe(file: string): Probe {
  const out = run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", file]).stdout;
  const data = JSON.parse(out) as { streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[]; format?: { duration?: string } };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  return {
    duration: Number(data.format?.duration) || 0,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    audio: streams.filter((s) => s.codec_type === "audio").length,
    codec: video?.codec_name ?? "",
  };
}

/** Date, description, license link and restrictions — what the director needs later next to the file. */
function context(item: Found): string {
  return [
    item.date ? `Date: ${cut(item.date, 60)}.` : "",
    item.description && item.description !== item.title ? `Description: ${cut(item.description, 200)}` : "",
    item.licenseUrl && (item.license.startsWith("CC BY") || item.source === "Pexels") ? `License: ${item.licenseUrl}` : "",
    item.restrictions ? `Restrictions: ${item.restrictions}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Commons: the smallest standard thumbnail at least `want` wide and not wider than the file, else the original. Pexels resizes on request. */
function imageUrl(item: Found, want: number): string {
  if (want >= item.width && (item.source === "Pexels" || WEB_EXT[item.mime])) return item.original;
  if (item.source === "Pexels") {
    const u = new URL(item.original);
    u.search = new URLSearchParams({ auto: "compress", cs: "tinysrgb", w: String(want) }).toString();
    return u.toString();
  }
  const bucket = THUMB_WIDTHS.find((w) => w >= want && w <= item.width);
  const sized = /\/((?:lossy-|lossless-)?(?:page\d+-)?)\d+px-([^/]+)$/;
  if (bucket && item.thumb && sized.test(new URL(item.thumb).pathname)) {
    const u = new URL(item.thumb);
    u.pathname = u.pathname.replace(sized, `/$1${bucket}px-$2`);
    return u.toString();
  }
  return item.original;
}

async function getImage(item: Found, dir: string, stem: string, tmp: string, opt: GetOptions): Promise<Saved> {
  const want = Math.min(opt.width ?? MAX_WIDTH, item.width);
  const url = imageUrl(item, want);
  const fromOriginal = url === item.original;
  const ext = extOf(url, ".jpg");
  const raw = join(tmp, `download${extname(new URL(url).pathname).toLowerCase() || ".img"}`);
  const bytes = await download(url, raw, `${item.id}: скачивание`);
  const file = join(dir, `${stem}${ext}`);
  const existed = existsSync(file);
  const fit = lastJsonLine<{ width: number; height: number; source_width: number }>(
    run(python(), [pyScript("media_sheet.py"), "fit", raw, file, "--width", String(want)]).stdout,
  );
  const kind = extname(new URL(item.original).pathname).slice(1).toLowerCase() || "image";
  const size = item.bytes ? ` (${bytesText(item.bytes, true)})` : "";
  const same = fromOriginal && fit.width === item.width && statSync(file).size === bytes;
  const how = same
    ? `Original ${item.width}×${item.height} ${kind} file${size}.`
    : fromOriginal
      ? `${fit.width}×${fit.height} ${ext.slice(1)} made from the ${item.width}×${item.height} ${kind} original${size}.`
      : `${fit.width}×${fit.height} version of the ${item.width}×${item.height} ${kind} original${size}: ${item.source === "Pexels" ? "Pexels" : "Commons"} thumbnail ${fit.source_width} px${fit.source_width > fit.width ? ", downscaled" : ""}.`;
  return {
    file,
    summary: `${fit.width}×${fit.height} · ${bytesText(statSync(file).size)}${existed ? " · перезаписан" : ""}`,
    notes: [how, context(item)].filter(Boolean).join(" "),
  };
}

async function getVideo(item: Found, dir: string, stem: string, tmp: string, opt: GetOptions): Promise<Saved> {
  if (!item.original) fail(`${item.id}: нет ссылки на файл`);
  const raw = join(tmp, `source${extname(new URL(item.original).pathname).toLowerCase() || ".video"}`);
  const bytes = await download(item.original, raw, `${item.id}: скачивание`);
  const src = probe(raw);
  if (!src.width || !src.duration) fail(`${item.id}: ffprobe не видит видео в скачанном файле`);
  const from = opt.from ?? 0;
  let to = opt.to ?? src.duration;
  if (from >= src.duration) fail(`--in ${secs(from)} за концом видео (${secs(src.duration)} с)`);
  if (to > src.duration) {
    console.log(`  ⚠ --out ${secs(to)} за концом видео — до ${secs(src.duration)} с`);
    to = src.duration;
  }
  if (to - from < 0.1) fail("--out должен быть больше --in хотя бы на 0.1 с");
  const file = join(dir, `${stem}.webm`);
  const existed = existsSync(file);
  const part = join(tmp, "clip.webm");
  const scale = opt.width && src.width > opt.width ? ["-vf", `scale=${opt.width}:-2:flags=lanczos`] : [];
  run("ffmpeg", ["-v", "error", "-y", "-ss", secs(from), "-i", raw, "-t", secs(to - from), "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1", ...scale, ...VP9, part]);
  renameSync(part, file);
  const clip = probe(file);
  if (clip.audio) fail(`${relative(ROOT_DIR, file)}: в клипе осталась звуковая дорожка`);
  const whole = from <= 0 && to >= src.duration;
  const origin =
    item.source === "Pexels"
      ? `${src.width}×${src.height} mp4 rendition of the ${item.width}×${item.height} Pexels video`
      : `original ${src.width}×${src.height} ${extname(new URL(item.original).pathname).slice(1).toLowerCase()}`;
  const how =
    `Derived by the hygen engine (npm run media --get): ${whole ? `the whole ${origin}` : `seconds ${secs(from)}–${secs(to)} of the ${origin}`} ` +
    `(${secs(src.duration)} s, ${bytesText(bytes, true)}), ${scale.length ? `scaled to ${clip.width}×${clip.height}, ` : ""}re-encoded VP9 crf 34 without sound.`;
  return {
    file,
    summary: `${clip.width}×${clip.height} · ${secs(clip.duration)} с · ${clip.codec} · без звука · ${bytesText(statSync(file).size)}${existed ? " · перезаписан" : ""}`,
    notes: [how, context(item)].filter(Boolean).join(" "),
  };
}

async function get(ref: string, videoArg: string, opt: GetOptions): Promise<number> {
  const dir = mediaDirOf(videoArg);
  const px =
    /^pexels:(photo|video):(\d+)$/i.exec(ref.trim()) ??
    /pexels\.com\/(?:[a-z]{2}-[a-z]{2}\/)?(photo|video)\/(?:[^/?#]*-)?(\d+)\/?(?:[?#]|$)/i.exec(ref.trim());
  let item: Found;
  if (px) {
    const key = loadEnv().PEXELS_API_KEY;
    if (!key) fail("Pexels: ключа PEXELS_API_KEY в .env нет");
    item = await pexelsById(px[1].toLowerCase(), px[2], key, opt.width);
  } else {
    item = await commonsFile(ref);
  }
  if (!item.license) fail(`${item.id}: лицензия «${item.licenseRaw}» не подходит — берём только public domain, CC0, CC BY, CC BY-SA`);
  if (!item.video && (opt.from !== undefined || opt.to !== undefined)) console.log("  ⚠ --in/--out есть только у видео — пропущены");
  const stem = opt.name !== undefined ? basename(opt.name).replace(MEDIA_EXT, "") : slug(item.title);
  if (!stem || stem.startsWith(".")) fail(`--as: плохое имя файла «${opt.name}»`);
  const tmp = mkdtempSync(join(ensureDir(join(ROOT_DIR, ".cache", "media")), "get-"));
  try {
    const saved = item.video ? await getVideo(item, dir, stem, tmp, opt) : await getImage(item, dir, stem, tmp, opt);
    const lic = licenseOf(saved.file);
    writeJson(lic, { title: item.title, source: item.source, author: item.author, license: item.license, url: item.page, retrieved: today(), notes: saved.notes });
    checkLicense(saved.file, "media --get");
    console.log(`✓ ${relative(ROOT_DIR, saved.file)} · ${saved.summary}`);
    console.log(`✓ ${relative(ROOT_DIR, lic)} · ${item.license} · ${cut(item.author, 40)}`);
    return 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ── cli ─────────────────────────────────────────────────────────────────────────────────────────────────

const USAGE = [
  'npm run media -- "<запрос>" [--n 5] [--video] [--sheet <файл.jpg>] [--provider all|commons|pexels]',
  'npm run media -- --get "<File:Имя>" <videoId> [--as <имя>] [--width 2400] [--in <с> --out <с>]',
  "  --get: File:Имя или ссылка Commons; pexels:photo:<id>, pexels:video:<id> или ссылка Pexels (нужен PEXELS_API_KEY)",
].join("\n");

const VALUE_FLAGS = ["--n", "--sheet", "--get", "--as", "--width", "--in", "--out", "--provider"];

function number(value: string | undefined, flag: string, min: number, max: number, int = false): number | undefined {
  if (value === undefined) return undefined;
  const x = Number(value);
  if (!value.trim() || !Number.isFinite(x) || x < min || x > max || (int && !Number.isInteger(x))) {
    fail(`${flag}: нужно ${int ? "целое " : ""}число от ${min} до ${max}, а не «${value}»`);
  }
  return x;
}

async function main(argv: string[]): Promise<number> {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  let video = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.includes(a)) {
      if (argv[i + 1] === undefined) fail(`у ${a} нет значения`);
      flags[a] = argv[++i];
    } else if (a === "--video") video = true;
    else if (a === "--help" || a === "-h") return (console.log(USAGE), 2);
    else if (a.startsWith("--")) fail(`неизвестный флаг ${a}\n${USAGE}`);
    else positional.push(a);
  }
  if (flags["--get"] !== undefined) {
    if (positional.length !== 1) return (console.log(USAGE), 2);
    return get(flags["--get"], positional[0], {
      name: flags["--as"],
      width: number(flags["--width"], "--width", 16, 10000, true),
      from: number(flags["--in"], "--in", 0, 86400),
      to: number(flags["--out"], "--out", 0, 86400),
    });
  }
  if (!positional.length) return (console.log(USAGE), 2);
  const provider = flags["--provider"] ?? "all";
  if (!["all", "commons", "pexels"].includes(provider)) fail(`--provider: all, commons или pexels, а не «${provider}»`);
  return search(positional.join(" "), number(flags["--n"], "--n", 1, 50, true) ?? 5, video, flags["--sheet"], provider);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof BuildError ? `✗ ${err.message}` : err);
    process.exit(1);
  },
);
