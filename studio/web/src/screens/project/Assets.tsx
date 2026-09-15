import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { Field, Fields } from "../../forms.tsx";
import { api, fmtBytes } from "../../lib/api.ts";
import { t } from "../../lib/i18n.ts";
import type { Dict } from "../../lib/i18n.ts";
import { JobView, confirmBox, fail, toast } from "../../lib/ui.tsx";

// «Ассеты»: media.json с превью; файл без полной записи лицензии красный, и сборка его не пропускает.
// Добавить: перетащить или выбрать файлы (дальше форма лицензии) либо найти в Commons / Pexels (npm run media).
// В сеть вкладка ходит только по кнопкам «Найти» и «Добавить в проект».

export function AssetsTab({ id, data, schema, reload }: { id: string; data: Dict; schema: Dict; reload: () => void }): JSX.Element {
  const media = data.media as Dict[];
  const red = media.filter((m) => m.missing.length || m.kind === "missing").length;
  return (
    <div>
      {red ? <div class="banner err">{t("assets.redBanner", { n: red })}</div> : <div class="banner ok">{t("assets.allGreen", { n: media.length })}</div>}
      <Drop id={id} reload={reload} />
      <SearchPanel id={id} reload={reload} />
      <h2 style="margin:18px 0 10px">{t("assets.inProject")}</h2>
      {media.length ? media.map((m) => <AssetRow key={m.name} id={id} m={m} schema={schema} reload={reload} />) : <div class="empty panel">{t("assets.none")}</div>}
    </div>
  );
}

function Drop({ id, reload }: { id: string; reload: () => void }): JSX.Element {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | File[]): Promise<void> => {
    for (const f of Array.from(files)) {
      try {
        const r = await api(`/api/projects/${id}/media`, { raw: f, query: { name: f.name } });
        toast(t("assets.uploaded", { name: r.name }), "info");
      } catch (err) {
        fail(err);
      }
    }
    reload();
  };
  return (
    <div
      class={`drop${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer?.files.length) void upload(e.dataTransfer.files);
      }}
    >
      {t("assets.drop")}{" "}
      <button class="btn small" onClick={() => input.current?.click()}>
        {t("assets.pick")}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        style="display:none"
        onChange={(e) => {
          const files = e.currentTarget.files;
          if (files) void upload(Array.from(files));
        }}
      />
    </div>
  );
}

function AssetRow({ id, m, schema, reload }: { id: string; m: Dict; schema: Dict; reload: () => void }): JSX.Element {
  // черновик записи: поля пишут сюда. Запись на сервере поменялась (сохранили, правка извне) — черновик и поля
  // заводятся заново по key; превью и раскрытая обрезка при этом не пересоздаются
  const recKey = JSON.stringify(m.record ?? {});
  const rec = useRef<Dict>({});
  const seen = useRef<string | null>(null);
  if (seen.current !== recKey) {
    seen.current = recKey;
    rec.current = { ...(m.record ?? {}) };
  }
  const isRed = m.missing.length > 0 || m.kind === "missing";
  const save = async (): Promise<void> => {
    try {
      const r = await api(`/api/projects/${id}/media/${encodeURIComponent(m.name)}`, { method: "PUT", body: rec.current });
      toast(r.missing.length ? t("assets.stillRed", { list: r.missing.join(", ") }) : t("assets.saved"), r.missing.length ? "err" : "ok");
      reload();
    } catch (err) {
      fail(err);
    }
  };
  const remove = async (): Promise<void> => {
    if (!(await confirmBox(t("assets.removeTitle"), t("assets.removeText", { name: m.name }), t("assets.remove"), "danger"))) return;
    try {
      await api(`/api/projects/${id}/media/${encodeURIComponent(m.name)}`, { method: "DELETE" });
      reload();
    } catch (err) {
      fail(err);
    }
  };
  const r = rec.current;
  const pv =
    m.kind === "video" ? <video src={m.url} muted controls preload="metadata" /> : m.kind === "image" ? <img src={m.url} loading="lazy" /> : m.kind === "audio" ? <audio src={m.url} controls style="width:150px" /> : <div class="pill red">{t("assets.noFile")}</div>;
  return (
    <div class={`asset${isRed ? " red" : ""}`}>
      <div class="pv">{pv}</div>
      <div>
        <div class="row between">
          <div>
            <b class="mono">{m.name}</b> <span class="muted small">{m.bytes ? fmtBytes(m.bytes) : ""}</span> <span class="chip">{m.used ? t("assets.used") : t("assets.unused")}</span>{" "}
            {isRed ? <span class="pill red">{m.kind === "missing" ? t("assets.recordNoFile") : t("assets.missing", { list: m.missing.join(", ") })}</span> : <span class="pill pill-ok">{t("assets.licensed")}</span>}
          </div>
          <button class="btn small danger" onClick={() => void remove()}>
            {t("assets.remove")}
          </button>
        </div>
        <Fields key={recKey}>
          <Field name="role" def={{ type: "enum", description: t("assets.roleHint") }} value={r.role ?? undefined} onChange={(v) => (rec.current.role = v ?? null)} options={schema.roles} label={t("assets.role")} />
          <Field name="title" def={{ type: "string" }} value={r.title} onChange={(v) => (rec.current.title = v ?? "")} label={t("assets.title")} />
          <Field name="source" def={{ type: "string", default: "Wikimedia Commons" }} value={r.source || undefined} onChange={(v) => (rec.current.source = v ?? "")} label={t("assets.source")} />
          <Field name="author" def={{ type: "string" }} value={r.author || undefined} onChange={(v) => (rec.current.author = v ?? "")} label={t("assets.author")} />
          <Field name="license" def={{ type: "enum" }} value={r.license || undefined} onChange={(v) => (rec.current.license = v ?? "")} options={schema.licenses} label={t("assets.license")} />
          <Field name="url" def={{ type: "string", description: t("assets.urlHint") }} value={r.url || undefined} onChange={(v) => (rec.current.url = v ?? "")} label={t("assets.url")} />
          <Field name="notes" def={{ type: "text" }} value={r.notes} onChange={(v) => (rec.current.notes = v)} label={t("assets.notes")} />
        </Fields>
        {m.kind === "video" ? <LazyTrim url={m.url} rec={rec} /> : null}
        <div class="row" style="margin-top:8px">
          <button class="btn primary small" onClick={() => void save()}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Ползунки обрезки тянут само видео двумя копиями с preload auto: у проекта с тремя роликами это сотни мегабайт
 * при открытии вкладки. Поэтому они монтируются, только когда раздел раскрыли, и дальше остаются.
 */
function LazyTrim({ url, rec }: { url: string; rec: { current: Dict } }): JSX.Element {
  const [opened, setOpened] = useState(false);
  return (
    <details class="panel" onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary style="cursor:pointer">
        <b>{t("assets.trim")}</b>
      </summary>
      {opened ? <TrimControl url={url} rec={rec} /> : null}
    </details>
  );
}

/** in/out ползунками над видео с кадрами на обоих концах; сохраняется в media.json → trim. */
function TrimControl({ url, rec }: { url: string; rec: { current: Dict } }): JSX.Element {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const [max, setMax] = useState(0);
  const [range, setRange] = useState<{ in: number; out: number } | null>(null);
  const show = (i: number, o: number): void => {
    setRange({ in: i, out: o });
    if (a.current) a.current.currentTime = i;
    if (b.current) b.current.currentTime = Math.max(0, o - 0.04);
  };
  const move = (i: number, o: number): void => {
    rec.current.trim = { in: i, out: o };
    show(i, o);
  };
  const cur = range ?? { in: 0, out: 0 };
  return (
    <div class="group">
      <div class="trim">
        <div>
          <video
            ref={a}
            src={url}
            muted
            preload="auto"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration || 0;
              setMax(d);
              show(Number(rec.current.trim?.in ?? 0), Number(rec.current.trim?.out ?? d));
            }}
          />
          <label class="field-name">in</label>
          <input
            type="range"
            min="0"
            max={String(max)}
            step="0.05"
            value={String(cur.in)}
            onInput={(e) => {
              let i = Number(e.currentTarget.value);
              if (i >= cur.out) i = Math.max(0, cur.out - 0.1);
              e.currentTarget.value = String(i);
              move(i, cur.out);
            }}
          />
        </div>
        <div>
          <video ref={b} src={url} muted preload="auto" />
          <label class="field-name">out</label>
          <input
            type="range"
            min="0"
            max={String(max)}
            step="0.05"
            value={String(cur.out)}
            onInput={(e) => {
              let o = Number(e.currentTarget.value);
              if (o <= cur.in) o = cur.in + 0.1;
              e.currentTarget.value = String(o);
              move(cur.in, o);
            }}
          />
        </div>
      </div>
      <div class="small muted">{range ? t("assets.trimLabel", { a: range.in.toFixed(2), b: range.out.toFixed(2), d: Math.max(0, range.out - range.in).toFixed(2) }) : ""}</div>
      <div class="small muted">{t("assets.trimHint")}</div>
    </div>
  );
}

/** Поиск Commons / Pexels — только по кнопке «Найти» или Enter; при открытии вкладки запросов нет. */
function SearchPanel({ id, reload }: { id: string; reload: () => void }): JSX.Element {
  const [q, setQ] = useState("");
  const [video, setVideo] = useState(false);
  const [provider, setProvider] = useState("all");
  const [results, setResults] = useState<Dict[] | "searching" | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const run = async (): Promise<void> => {
    if (!q.trim()) return;
    setResults("searching");
    try {
      const r = await api("/api/media/search", { query: { q: q.trim(), video: video ? 1 : "", provider, n: 8 } });
      setResults(r.items as Dict[]);
      if (!r.pexels && provider !== "commons") toast(t("assets.noPexels"), "info");
    } catch (err) {
      setResults(null);
      fail(err);
    }
  };
  const onDone = (j: Dict): void => {
    toast(j.status === "ok" ? t("assets.added") : t("assets.addFailed"), j.status === "ok" ? "ok" : "err");
    if (j.status === "ok") reload();
  };
  return (
    <details class="panel">
      <summary style="cursor:pointer">
        <b>{t("assets.search")}</b>
        <span class="muted small">{` — ${t("assets.searchAbout")}`}</span>
      </summary>
      <div class="row" style="margin-top:10px">
        <div class="grow">
          <input placeholder={t("assets.searchPlaceholder")} value={q} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && void run()} />
        </div>
        <label class="check">
          <input type="checkbox" checked={video} onChange={(e) => setVideo(e.currentTarget.checked)} />
          {t("assets.videoOnly")}
        </label>
        <select style="width:auto" value={provider} onChange={(e) => setProvider(e.currentTarget.value)}>
          {["all", "commons", "pexels"].map((p) => (
            <option key={p} value={p}>
              {t(`assets.providers.${p}`)}
            </option>
          ))}
        </select>
        <button class="btn primary" onClick={() => void run()}>
          {t("assets.find")}
        </button>
      </div>
      <div>{job ? <JobView key={job} id={job} onDone={onDone} /> : null}</div>
      <div class="results">
        {results === "searching" ? (
          <div class="muted">{t("assets.searching")}</div>
        ) : results === null ? null : results.length ? (
          results.map((it) => <ResultCard key={it.id} id={id} it={it} onJob={setJob} />)
        ) : (
          <div class="muted">{t("assets.nothing")}</div>
        )}
      </div>
    </details>
  );
}

const nameOf = (title: unknown): string =>
  String(title ?? "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Найденный файл: скачивается только по «Добавить в проект» — задачей сервера с записью в media.json. */
function ResultCard({ id, it, onJob }: { id: string; it: Dict; onJob: (job: string) => void }): JSX.Element {
  const [as, setAs] = useState(() => nameOf(it.title));
  const [role, setRole] = useState("");
  const [inp, setIn] = useState("");
  const [outp, setOut] = useState("");
  const add = async (): Promise<void> => {
    try {
      const body: Dict = { ref: it.id, as, role: role || undefined };
      if (it.video && inp !== "") body.in = Number(inp);
      if (it.video && outp !== "") body.out = Number(outp);
      const job = await api(`/api/projects/${id}/media/get`, { body });
      onJob(job.id);
    } catch (err) {
      fail(err);
    }
  };
  return (
    <div class="result">
      {it.thumb ? <img src={it.thumb} loading="lazy" referrerpolicy="no-referrer" /> : <div style="height:150px" />}
      <div class="body">
        <b>{it.title}</b>
        <div class="muted">{`${it.author} · ${it.source}`}</div>
        <div>
          <span class="pill pill-ok">{it.license}</span> {it.video ? <span class="chip">{`${t("assets.video")} ${Math.round(it.duration || 0)} с`}</span> : <span class="chip">{`${it.width}×${it.height}`}</span>}
        </div>
        <a href={it.page} target="_blank" rel="noreferrer" class="small">
          {t("assets.page")}
        </a>
        <label class="field-name">{t("assets.saveAs")}</label>
        <input value={as} onInput={(e) => setAs(e.currentTarget.value)} />
        <select value={role} onChange={(e) => setRole(e.currentTarget.value)}>
          {["", "hero", "evidence", "place"].map((x) => (
            <option key={x} value={x}>
              {x || t("assets.roleAny")}
            </option>
          ))}
        </select>
        {it.video ? (
          <div class="row">
            <div class="grow">
              <input type="number" step="0.1" placeholder="in" value={inp} onInput={(e) => setIn(e.currentTarget.value)} />
            </div>
            <div class="grow">
              <input type="number" step="0.1" placeholder="out" value={outp} onInput={(e) => setOut(e.currentTarget.value)} />
            </div>
          </div>
        ) : null}
        <button class="btn small primary" onClick={() => void add()}>
          {t("assets.addToProject")}
        </button>
      </div>
    </div>
  );
}
