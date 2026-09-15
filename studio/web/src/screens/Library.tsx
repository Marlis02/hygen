import type { JSX } from "preact";
import { memo } from "preact/compat";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Field, Fields } from "../forms.tsx";
import { api, go, useApi } from "../lib/api.ts";
import { t } from "../lib/i18n.ts";
import type { Dict } from "../lib/i18n.ts";
import { debounce, useLive } from "../lib/live.ts";
import { LazyVideo, fail, modal, toast } from "../lib/ui.tsx";

// «Библиотека»: каждый элемент движка с 3-секундным превью (library/previews), описанием и параметрами;
// «применить к биту» пишет его в project.json. Музыка: прослушать, BPM, настроение, look; добавить трек с лицензией.
// Карточки с ключами и memo: фильтр только прячет готовые узлы, готовое превью перерисовывает одну карточку.

interface LibData {
  sections: string[];
  items: Dict[];
  missing: number;
  job: Dict | null;
}
interface Ready {
  preview: string | null;
  error: string | null;
}
type ReadyMap = Record<string, Ready>;

const keyOf = (i: Dict): string => `${i.section}/${i.id}`;

export function LibraryScreen({ section }: { section: string }): JSX.Element {
  // у look свой экран (сайдбар «Look»), это не раздел библиотеки
  if (section === "looks") return <ToLooks />;
  return <Gallery section={section} />;
}

function ToLooks(): JSX.Element {
  useEffect(() => go("#/looks"), []);
  return <div class="empty">{t("common.loading")}</div>;
}

function Gallery({ section }: { section: string }): JSX.Element {
  const { data, error } = useApi(() => api<LibData>("/api/library"), []);
  const [fam, setFam] = useState("");
  const [origin, setOrigin] = useState("");
  const [q, setQ] = useState("");
  const [ready, setReady] = useState<ReadyMap>({});
  const bar = usePreviewsBar(data, section, setReady);
  if (error) return <div class="banner err">{error}</div>;
  if (!data) return <div class="empty">{t("common.loading")}</div>;

  const items = data.items.filter((i) => i.section === section);
  const families = [...new Set(items.map((i) => i.family).filter(Boolean))] as string[];
  const query = q.trim().toLowerCase();
  const fits = (i: Dict): boolean => (!fam || i.family === fam) && (!origin || i.origin === origin) && (!query || `${i.id} ${i.name} ${i.description}`.toLowerCase().includes(query));
  const shown = data.items.filter((i) => i.section !== "looks");
  const withPreview = shown.filter((i) => i.preview || i.audio || ready[keyOf(i)]?.preview).length;
  const any = items.some(fits);
  return (
    <>
      <div class="header">
        <div>
          <h1>{t("library.title")}</h1>
          <div class="sub">{t("library.sub", { n: shown.length, p: withPreview })}</div>
        </div>
        {section === "music" ? (
          <button class="btn primary" onClick={() => void addTrack()}>
            {t("library.addTrack")}
          </button>
        ) : null}
      </div>
      {bar ? <div class="banner info">{bar}</div> : null}
      <div class="sections">
        {data.sections
          .filter((s) => s !== "looks")
          .map((s) => (
            <a key={s} href={`#/library/${s}`} class={s === section ? "on" : ""}>
              {`${t(`library.sections.${s}`)} · ${data.items.filter((i) => i.section === s).length}`}
            </a>
          ))}
      </div>
      <div class="filters">
        {families.length ? (
          <select value={fam} onChange={(e) => setFam(e.currentTarget.value)}>
            <option value="">{t("library.allFamilies")}</option>
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        ) : null}
        {section === "music" ? null : (
          <select value={origin} onChange={(e) => setOrigin(e.currentTarget.value)}>
            {["", "own", "registry"].map((o) => (
              <option key={o} value={o}>
                {t(`library.origin.${o || "all"}`)}
              </option>
            ))}
          </select>
        )}
        <input placeholder={t("library.search")} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      </div>
      <div class="cards">
        {/* все карточки в DOM всегда: не подошедшая под фильтр только скрыта, загруженное видео не теряется */}
        {items.map((i) => (section === "music" ? <MusicCard key={keyOf(i)} item={i} hidden={!fits(i)} /> : <ItemCard key={keyOf(i)} item={i} ready={ready[keyOf(i)]} hidden={!fits(i)} />))}
        {any ? null : <div class="empty">{t("library.empty")}</div>}
      </div>
    </>
  );
}

/**
 * Превью галереи: при открытии сервер считает недостающие по хэшам и досчитывает их задачей. Готовое превью
 * встаёт в свою карточку через map ready — меняются только изменившиеся записи, остальные карточки не трогаются.
 * Закрытие вкладки задачу не останавливает. Это единственная автоматическая сборка в системе.
 * Возвращает текст баннера или null.
 */
function usePreviewsBar(data: LibData | null, section: string, setReady: (fn: (prev: ReadyMap) => ReadyMap) => void): string | null {
  const [text, setText] = useState<string | null>(null);
  const active = useRef(false);
  const alive = useRef(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dataRef = useRef(data);
  dataRef.current = data;

  // 22 с на превью — среднее по прошлым прогонам (S1.1: 83 превью за 388 с в два потока)
  const show = (done: number, total: number): void => {
    const left = Math.max(0, total - done);
    clearTimeout(hideTimer.current);
    setText(left ? t("library.previewsRunning", { done, total, min: Math.max(1, Math.round((left * 22) / 60 / 2)) }) : t("library.previewsDone", { total }));
    if (!left) hideTimer.current = setTimeout(() => alive.current && setText(null), 4000);
  };

  /** Одна лёгкая выборка: готовые превью встают в свои карточки, счётчик в шапке подрастает сам. */
  const patch = useMemo(
    () =>
      debounce(async () => {
        const d = dataRef.current;
        if (!alive.current || !d) return;
        try {
          const r = await api<{ job: Dict | null; items: Record<string, Ready> }>("/api/library/ready");
          if (!alive.current) return;
          setReady((prev) => {
            let next = prev;
            for (const item of d.items) {
              if (item.section === "looks" || item.section === "music" || item.preview) continue;
              const key = keyOf(item);
              const got = r.items[key];
              const old = prev[key];
              // видео уже стоит — не трогаем; пустая запись ничего не меняет
              if (!got || old?.preview || (!got.preview && !got.error)) continue;
              if (old && old.preview === got.preview && old.error === got.error) continue;
              if (next === prev) next = { ...prev };
              next[key] = { preview: got.preview, error: got.error };
            }
            return next;
          });
          if (r.job) show(Number(r.job.done ?? 0), Number(r.job.total ?? d.missing));
        } catch {
          // сервер перезапускается — следующее событие позовёт снова
        }
      }, 700),
    [],
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!data || active.current || (!data.missing && !data.job)) return;
    active.current = true;
    show(Number(data.job?.done ?? 0), Number(data.job?.total ?? data.missing));
    if (!data.job) void api("/api/library/previews", { body: { section } }).catch(() => undefined);
  }, [data]);

  useLive((msg) => {
    if (!active.current) return;
    if (msg.type === "job" && msg.job?.kind === "previews") {
      const r = (msg.job.result as Dict | undefined) ?? {};
      show(Number(r.done ?? 0), Number(r.total ?? dataRef.current?.missing));
      patch();
    } else if (msg.type === "files" && (msg.library as string[] | undefined)?.some((f) => f.startsWith("previews/"))) patch();
  });
  return text;
}

/** Превью карточки: пока его нет — своя строка «готовится»; наведение на всю карточку-превью запускает видео. */
function Thumb({ preview, error, waiting }: { preview: string | null; error: string | null; waiting: boolean }): JSX.Element {
  if (preview)
    return (
      <div class="thumb" onMouseEnter={(e) => void e.currentTarget.querySelector("video")?.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.querySelector("video")?.pause()}>
        <LazyVideo src={preview} />
      </div>
    );
  return (
    <div class="thumb">
      {error ? (
        <div>{t("library.previewError", { e: error })}</div>
      ) : waiting ? (
        <div class="preparing">
          <span class="spin" />
          {t("library.previewSoon")}
        </div>
      ) : (
        <div>{t("library.noPreview")}</div>
      )}
    </div>
  );
}

const hide = (hidden: boolean): string | undefined => (hidden ? "display:none" : undefined);

const ItemCard = memo(function ItemCard({ item, ready, hidden }: { item: Dict; ready?: Ready; hidden: boolean }): JSX.Element {
  // ready из выборки сильнее данных открытия, но уже стоящее видео не меняется
  const preview: string | null = item.preview ?? ready?.preview ?? null;
  const error: string | null = preview ? null : ready ? ready.error : (item.previewError ?? null);
  const waiting = !ready && !item.preview && !item.previewError;
  const facts = item.facts ? Object.entries(item.facts as Dict).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) : [];
  const params = item.params ? (Object.entries(item.params as Dict) as [string, Dict][]) : [];
  return (
    <div class="card lib-card" style={hide(hidden)}>
      <Thumb preview={preview} error={error} waiting={waiting} />
      <div class="body">
        <div class="title">{item.name}</div>
        <div class="row">
          <span class="chip mono">{item.id}</span>
          {item.family ? <span class="chip">{item.family}</span> : null}
          <span class="chip">{item.originRef ?? t(`library.origin.${item.origin}`)}</span>
        </div>
        <div class="meta">{item.description}</div>
        {facts.length ? (
          <div class="small">
            {facts.map(([k, v]) => (
              <div key={k}>
                <span class="muted">{`${k}: `}</span>
                {k === "accent" ? <span class="swatch" style={`background:${v}`} /> : null} {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </div>
            ))}
          </div>
        ) : null}
        {params.length ? (
          <details>
            <summary class="small muted" style="cursor:pointer">
              {t("library.params", { n: params.length })}
            </summary>
            <table class="plain">
              {params.map(([k, d]) => (
                <tr key={k}>
                  <td class="mono">{k}</td>
                  <td class="small">
                    {`${d.type ?? ""}${d.values ? `: ${(d.values as string[]).join(" | ")}` : ""}${d.default !== undefined ? ` = ${JSON.stringify(d.default)}` : ""}`}
                    <div class="muted">{d.description ?? ""}</div>
                  </td>
                </tr>
              ))}
            </table>
          </details>
        ) : null}
      </div>
      <div class="actions">
        <button class="btn small primary" onClick={() => void applyDialog(item)}>
          {item.apply.target === "project" ? t("library.applyProject") : t("library.applyBeat")}
        </button>
      </div>
    </div>
  );
});

const MusicCard = memo(function MusicCard({ item, hidden }: { item: Dict; hidden: boolean }): JSX.Element {
  const f = (item.facts ?? {}) as Dict;
  return (
    <div class="card" style={hide(hidden)}>
      <div class="body">
        <div class="title">{item.name}</div>
        <div class="row">
          <span class="chip mono">{item.id}</span>
          {f.bpm ? <span class="pill">{`${Math.round(f.bpm)} BPM`}</span> : null}
          {f.mood ? <span class="chip">{f.mood}</span> : null}
        </div>
        <div class="meta">{`${t("library.looks")}: ${((f.looks ?? []) as string[]).join(", ") || "—"}`}</div>
        <div class="meta">{`${f.license} · ${f.author}`}</div>
        {item.audio ? <audio src={item.audio} controls preload="none" style="width:100%" /> : null}
        <div class="meta small">{item.description}</div>
      </div>
      <div class="actions">
        <button class="btn small primary" onClick={() => void applyDialog(item)}>
          {t("library.applyProject")}
        </button>
      </div>
    </div>
  );
});

const beatsOf = async (project: string): Promise<Dict[]> => ((await api(`/api/projects/${project}`)).project.beats ?? []) as Dict[];

/** «Применить»: выбор проекта (и бита, если элемент ставится в бит); запись — POST /api/library/apply. */
async function applyDialog(item: Dict): Promise<void> {
  try {
    const { projects } = await api<{ projects: Dict[] }>("/api/projects");
    const needBeat = item.apply.target === "beat";
    const firstBeats = needBeat ? await beatsOf(String(projects[0]?.id ?? "")) : [];
    // выбор живёт в окне, а кнопка «Применить» читает его отсюда
    const sel = { project: String(projects[0]?.id ?? ""), beat: String(firstBeats[0]?.id ?? "") };
    const Body = (): JSX.Element => {
      const [project, setProject] = useState(sel.project);
      const [beats, setBeats] = useState(firstBeats);
      const [beat, setBeat] = useState(sel.beat);
      const pickProject = (id: string): void => {
        sel.project = id;
        setProject(id);
        if (!needBeat) return;
        beatsOf(id)
          .then((list) => {
            setBeats(list);
            sel.beat = String(list[0]?.id ?? "");
            setBeat(sel.beat);
          })
          .catch(fail);
      };
      return (
        <div class="stack">
          <div class="muted small">{t(`library.applyHint.${needBeat ? ("push" in item.apply ? item.apply.push : "set") : "project"}`)}</div>
          <label class="field-name">{t("library.project")}</label>
          <select value={project} onChange={(e) => pickProject(e.currentTarget.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{`${p.title} (${p.id})`}</option>
            ))}
          </select>
          {needBeat ? (
            <>
              <label class="field-name">{t("library.beat")}</label>
              <select
                value={beat}
                onChange={(e) => {
                  sel.beat = e.currentTarget.value;
                  setBeat(sel.beat);
                }}
              >
                {beats.map((b) => (
                  <option key={b.id} value={b.id}>{`${b.id} — ${String(b.text).slice(0, 60)}`}</option>
                ))}
              </select>
            </>
          ) : null}
        </div>
      );
    };
    modal(t("library.applyTitle", { name: item.name }), Body, [
      { label: t("common.cancel") },
      {
        label: t("library.apply"),
        kind: "primary",
        onClick: async () => {
          const r = await api("/api/library/apply", { body: { section: item.section, id: item.id, project: sel.project, beat: needBeat ? sel.beat : undefined } });
          toast(r.ok ? t("library.applied", { what: r.applied }) : t("library.appliedInvalid", { e: r.error }), r.ok ? "ok" : "err");
        },
      },
    ]);
  } catch (err) {
    fail(err);
  }
}

/** «+ Трек»: файл и запись лицензии; трек ложится в library/music/, сетка битов считается сервером один раз. */
async function addTrack(): Promise<void> {
  try {
    const schema = await api("/api/schema");
    const rec: Dict = { looks: [] };
    const picked: { file: File | null } = { file: null };
    const Body = (): JSX.Element => (
      <div class="stack">
        <div class="muted small">{t("library.addTrackHint")}</div>
        <input type="file" accept="audio/*" onChange={(e) => (picked.file = e.currentTarget.files?.[0] ?? null)} />
        <Fields>
          <Field name="title" def={{ type: "string" }} value={undefined} onChange={(v) => (rec.title = v)} label={t("assets.title")} />
          <Field name="source" def={{ type: "string" }} value={undefined} onChange={(v) => (rec.source = v)} label={t("assets.source")} />
          <Field name="author" def={{ type: "string" }} value={undefined} onChange={(v) => (rec.author = v)} label={t("assets.author")} />
          <Field name="license" def={{ type: "enum" }} value={undefined} onChange={(v) => (rec.license = v)} options={schema.licenses} label={t("assets.license")} />
          <Field name="url" def={{ type: "string" }} value={undefined} onChange={(v) => (rec.url = v)} label={t("assets.url")} />
          <Field name="mood" def={{ type: "string" }} value={undefined} onChange={(v) => (rec.mood = v)} label={t("library.mood")} />
          <Field name="looks" def={{ type: "list" }} value={undefined} onChange={(v) => (rec.looks = v ?? [])} label={t("library.looks")} />
        </Fields>
      </div>
    );
    modal(t("library.addTrack"), Body, [
      { label: t("common.cancel") },
      {
        label: t("library.addTrackGo"),
        kind: "primary",
        onClick: async () => {
          const f = picked.file;
          if (!f) throw new Error(t("library.pickFile"));
          const up = await api("/api/library/music", { raw: f, query: { name: f.name } });
          const r = await api(`/api/library/music/${encodeURIComponent(up.file)}`, { method: "PUT", body: rec });
          toast(t("library.trackAdded", { file: r.file, bpm: Math.round(r.bpm), beats: r.beats }));
          location.reload();
        },
      },
    ]);
  } catch (err) {
    fail(err);
  }
}
