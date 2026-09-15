import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { api, useApi } from "../../lib/api.ts";
import { t } from "../../lib/i18n.ts";
import type { Dict } from "../../lib/i18n.ts";
import { fail, toast } from "../../lib/ui.tsx";
import type { ProjectCtx } from "../Project.tsx";
import { BeatForm } from "./Beats.tsx";
import { CompositionFrame } from "./Composition.tsx";
import type { CompositionHandle } from "./Composition.tsx";

// «Редактор» (ROADMAP S3): плеер сверху, под ним дорожки карты ролика (build/timeline.json через API), форма бита
// справа — та же, что в «Битах». Ничего не собирается само: правка пишет project.json через API бита, проект получает
// метку «изменено, пересоберите», карта перестраивается оценкой до пересборки. Три действия мышью — граница бита
// (пауза после реплики, pad[1]), маркер устройства (at со снапом к слову своего бита), сдвиг музыки (music.in со
// снапом к сетке битов трека); Ctrl+Z / Ctrl+Shift+Z — в пределах экрана.

interface TlBeat {
  id: string;
  start: number;
  end: number;
  speechStart: number;
  speechEnd: number;
  line: string;
  stage: string | null;
  intent: string | null;
  hold: { value: number; min: number; max: number; field: string };
  lead?: { value: number };
  estimated?: boolean;
}
interface TlWord {
  text: string;
  start: number;
  end: number;
  bit: string;
  ref?: string;
}
interface TlDevice {
  bit: string;
  index: number;
  type: string;
  at: number;
  duration: number;
  atField: string | null;
}
interface TlMusic {
  track: string;
  id?: string;
  offset: number;
  bpm?: number;
  beats: number[];
  strong?: number[];
  duck: { start: number; end: number; gain: number }[];
}
interface Timeline {
  id: string;
  estimated: boolean;
  duration: number;
  beats: TlBeat[];
  words: TlWord[];
  captions: { text: string; start: number; end: number }[];
  devices: TlDevice[];
  transitions: { from: string; to: string; type: string; start: number; duration: number }[];
  music: TlMusic | null;
}

type Edit = { label: string; kind: "beat"; beatId: string; before: Dict; after: Dict } | { label: string; kind: "project"; before: Dict; after: Dict };
type Drag =
  | { kind: "hold"; beat: string; end: number; base: number; value: number }
  | { kind: "device"; key: string; bit: string; base: number; value: number; word: TlWord | null }
  | { kind: "music"; base: number; value: number; moved: boolean };

const PAD = 10;
const LANES: [string, number][] = [
  ["ruler", 24],
  ["beats", 40],
  ["words", 30],
  ["captions", 30],
  ["devices", 34],
  ["transitions", 28],
  ["music", 42],
];
const UNDO_DEPTH = 50;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const fmtT = (s: number): string => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
const isTyping = (el: EventTarget | null): boolean => el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** Ссылка на слово в формате at устройства: карта даёт ref; старая карта без ref — слово в нижнем регистре с номером повтора. */
function wordRef(w: TlWord, words: TlWord[]): string {
  if (w.ref) return w.ref;
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9']/g, "");
  const same = words.filter((x) => x.bit === w.bit && norm(x.text) === norm(w.text));
  const n = same.indexOf(w) + 1;
  return n > 1 ? `${norm(w.text)}#${n}` : norm(w.text);
}

export function EditorTab({ ctx }: { ctx: ProjectCtx }): JSX.Element {
  const { id, data } = ctx;
  const stamp = String(data.card.changedAt ?? "");
  const { data: tl, error, reload: reloadTl } = useApi(() => api<Timeline>(`/api/projects/${id}/timeline`), [id]);
  // карта перечитывается, когда project.json поменялся (своя правка, форма бита, режиссёр) — экран не мигает
  const firstStamp = useRef(stamp);
  useEffect(() => {
    if (firstStamp.current !== stamp) void reloadTl();
  }, [stamp]);

  const [pps, setPps] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [mode, setMode] = useState<"mp4" | "composition">("mp4");
  useEffect(() => {
    if (mode === "mp4") comp.current = null;
  }, [mode]);
  const [, setStacks] = useState(0);
  const undo = useRef<Edit[]>([]);
  const redo = useRef<Edit[]>([]);
  const busy = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const lanes = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const hover = useRef<HTMLDivElement>(null);
  const comp = useRef<CompositionHandle | null>(null);
  const seekMs = useRef<HTMLSpanElement>(null);
  const zoomAnchor = useRef<{ t: number; x: number } | null>(null);
  const now = useRef(0);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;

  // ── курсор: синхронен с плеером (rAF, пока играет) и со seek по клику ─────────────────────────────
  const place = (time: number, follow = false): void => {
    now.current = time;
    const x = PAD + time * ppsRef.current;
    if (cursor.current) cursor.current.style.transform = `translateX(${x}px)`;
    if (clock.current) clock.current.textContent = `${fmtT(time)} / ${fmtT(tl?.duration ?? 0)}`;
    const box = lanes.current;
    if (follow && box && (x < box.scrollLeft || x > box.scrollLeft + box.clientWidth - 40)) box.scrollLeft = Math.max(0, x - box.clientWidth * 0.25);
  };
  const seek = (time: number): void => {
    const v = video.current;
    const target = clamp(time, 0, tl?.duration ?? time);
    if (v) v.currentTime = target;
    // композиция на паузе: кадр ставит рантайм HyperFrames в браузере, без ffmpeg и рендера
    if (mode === "composition" && comp.current)
      void comp.current.seek(target).then((ms) => {
        if (seekMs.current) seekMs.current.textContent = t("editor.seekMs", { ms: Math.round(ms) });
      });
    place(target);
  };
  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      const v = video.current;
      if (v && !v.paused) place(v.currentTime, true);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tl]);

  // первый показ: весь ролик по ширине дорожек
  useLayoutEffect(() => {
    if (!tl || pps || !lanes.current) return;
    setPps(clamp((lanes.current.clientWidth - PAD * 2) / Math.max(1, tl.duration), 8, 400));
  }, [tl]);
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    if (a && lanes.current) lanes.current.scrollLeft = Math.max(0, PAD + a.t * pps - a.x);
    zoomAnchor.current = null;
    place(now.current);
  }, [pps]);

  // Ctrl+колесо — зум вокруг мыши; обычное колесо и Shift — прокрутка как есть
  useEffect(() => {
    const box = lanes.current;
    if (!box) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      const x = e.clientX - rect.left;
      zoomAnchor.current = { t: (x + box.scrollLeft - PAD) / ppsRef.current, x };
      setPps((p) => clamp(p * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 8, 600));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [tl]);

  // ── правки: через API бита / проекта, с отменой ─────────────────────────────────────────────────
  const beatOf = (beatId: string): Dict | undefined => (data.project.beats as Dict[]).find((b) => b.id === beatId);
  const put = async (e: Edit, side: "before" | "after"): Promise<void> => {
    const r =
      e.kind === "beat"
        ? await api(`/api/projects/${id}/beats/${encodeURIComponent(e.beatId)}`, { method: "PUT", body: { beat: e[side] } })
        : await api(`/api/projects/${id}/project`, { method: "PUT", body: { project: e[side] } });
    if (r && r.ok === false) toast(t("editor.savedInvalid", { e: r.error }), "err");
    await ctx.reload();
  };
  const commit = async (e: Edit): Promise<void> => {
    if (JSON.stringify(e.before) === JSON.stringify(e.after)) return;
    busy.current = true;
    try {
      await put(e, "after");
      undo.current = [...undo.current, e].slice(-UNDO_DEPTH);
      redo.current = [];
      setStacks((n) => n + 1);
      toast(e.label);
    } catch (err) {
      fail(err);
    } finally {
      busy.current = false;
    }
  };
  const step = async (back: boolean): Promise<void> => {
    if (busy.current) return;
    const from = back ? undo : redo;
    const to = back ? redo : undo;
    const e = from.current[from.current.length - 1];
    if (!e) return;
    busy.current = true;
    try {
      await put(e, back ? "before" : "after");
      from.current = from.current.slice(0, -1);
      to.current = [...to.current, e].slice(-UNDO_DEPTH);
      setStacks((n) => n + 1);
      toast(t(back ? "editor.undone" : "editor.redone", { what: e.label }), "info");
    } catch (err) {
      fail(err);
    } finally {
      busy.current = false;
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        void step(!e.shiftKey);
      } else if (key === "y") {
        e.preventDefault();
        void step(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const editBeat = (beatId: string, label: string, mutate: (b: Dict) => void): void => {
    const cur = beatOf(beatId);
    if (!cur) return;
    const after = structuredClone(cur);
    mutate(after);
    void commit({ kind: "beat", label, beatId, before: structuredClone(cur), after });
  };

  // размер контактного листа — для кадра-подсказки на шкале
  const sheet = data.renders.contact as string | null;
  const [sheetSize, setSheetSize] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!sheet) return;
    const img = new Image();
    img.onload = () => setSheetSize([img.naturalWidth, img.naturalHeight]);
    img.src = sheet;
  }, [sheet]);

  if (error) return <div class="banner err">{error}</div>;
  if (!tl) return <div class="empty">{t("common.loading")}</div>;
  if (!tl.beats.length) return <div class="empty panel">{t("editor.noBeats")}</div>;

  const scale = pps || 40;
  // перетаскивание границы бита: поле после реплики растёт, всё после бита едет вместе с ним
  const shift = drag?.kind === "hold" ? { at: drag.end - 1e-3, delta: drag.value - drag.base } : null;
  const S = (time: number): number => (shift && time >= shift.at ? time + shift.delta : time);
  const X = (time: number): number => PAD + time * scale;
  const duration = S(tl.duration);
  const width = PAD * 2 + duration * scale;
  const timeAt = (clientX: number): number => {
    const box = lanes.current as HTMLDivElement;
    return clamp((clientX - box.getBoundingClientRect().left + box.scrollLeft - PAD) / scale, 0, tl.duration);
  };

  /** Перетаскивание указателем: onMove получает сдвиг в секундах, onUp — итог; меньше 3 px — это клик. */
  const pointerDrag = (e: PointerEvent, onMove: (dt: number) => void, onUp: (moved: boolean) => void): void => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent): void => {
      if (Math.abs(ev.clientX - x0) > 3) moved = true;
      if (moved) onMove((ev.clientX - x0) / scale);
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onUp(moved);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startHold = (e: PointerEvent, b: TlBeat): void => {
    const base = b.hold.value;
    let value = base;
    setDrag({ kind: "hold", beat: b.id, end: b.end, base, value });
    pointerDrag(
      e,
      (dt) => {
        value = Math.round(clamp(base + dt, b.hold.min ?? 0, b.hold.max ?? 3) * 20) / 20;
        setDrag({ kind: "hold", beat: b.id, end: b.end, base, value });
      },
      (moved) => {
        setDrag(null);
        if (!moved || Math.abs(value - base) < 0.001) return;
        editBeat(b.id, t("editor.holdSaved", { id: b.id, v: value.toFixed(2) }), (beat) => {
          const lead = Array.isArray(beat.pad) ? Number(beat.pad[0]) : b.lead?.value ?? 0.2;
          beat.pad = [lead, r3(value)];
        });
      },
    );
  };

  const startDevice = (e: PointerEvent, d: TlDevice): void => {
    const key = `${d.bit}/${d.index}`;
    const own = tl.words.filter((w) => w.bit === d.bit);
    let word: TlWord | null = null;
    setDrag({ kind: "device", key, bit: d.bit, base: d.at, value: d.at, word: null });
    pointerDrag(
      e,
      (dt) => {
        const want = d.at + dt;
        // снап к ближайшему слову своего бита: устройство не уходит в чужой бит
        word = own.reduce<TlWord | null>((best, w) => (!best || Math.abs(w.start - want) < Math.abs(best.start - want) ? w : best), null);
        setDrag({ kind: "device", key, bit: d.bit, base: d.at, value: word ? word.start : d.at, word });
      },
      (moved) => {
        setDrag(null);
        if (!moved || !word || Math.abs(word.start - d.at) < 0.001) return;
        const ref = wordRef(word, tl.words);
        editBeat(d.bit, t("editor.deviceSaved", { type: d.type, bit: d.bit, word: ref }), (beat) => {
          const m = /^devices\[(\d+)\]\.at$/.exec(d.atField ?? "");
          if (m && beat.devices?.[Number(m[1])]) beat.devices[Number(m[1])].at = ref;
          else if (d.atField === "at") beat.at = ref;
          else if (Array.isArray(beat.devices) && beat.devices[d.index]) beat.devices[d.index].at = ref;
          else beat.at = ref;
        });
      },
    );
  };

  const music = tl.music;
  const period = music?.bpm ? 60 / music.bpm : music && music.beats.length > 1 ? (music.beats[music.beats.length - 1]! - music.beats[0]!) / (music.beats.length - 1) : 0.5;
  const startMusic = (e: PointerEvent): void => {
    if (!music) return;
    const base = music.offset;
    let value = base;
    setDrag({ kind: "music", base, value, moved: false });
    pointerDrag(
      e,
      (dt) => {
        // снап к сетке битов трека: сдвиг — целое число долей
        value = Math.max(0, r3(base + Math.round(dt / period) * period));
        setDrag({ kind: "music", base, value, moved: true });
      },
      (moved) => {
        setDrag(null);
        if (!moved) return seek(timeAt(e.clientX));
        if (Math.abs(value - base) < 0.001) return;
        const before = structuredClone(data.project);
        const after = structuredClone(data.project);
        const m: Dict = after.music && typeof after.music === "object" ? after.music : {};
        if (value > 0.0005) m.in = `${tl.beats[0]!.id}:start+${value.toFixed(3)}`;
        else delete m.in;
        if (Object.keys(m).length) after.music = m;
        else delete after.music;
        void commit({ kind: "project", label: t("editor.musicSaved", { v: value.toFixed(2) }), before, after });
      },
    );
  };

  // ── кадр-подсказка из контактного листа: плитка ближайшей сцены ───────────────────────────────────
  const scenes = ((data.renders.verify?.scenes as Dict[] | undefined) ?? tl.beats.map((b) => ({ id: b.id, start: b.start, end: b.end, settle: { t: b.end - 0.1 } }))) as Dict[];
  const showFrame = (e: MouseEvent): void => {
    const el = hover.current;
    if (!el || !sheet || !sheetSize) return;
    const time = timeAt(e.clientX);
    const i = Math.max(0, scenes.findIndex((s) => time >= s.start && time < s.end));
    const s = scenes[i] ?? scenes[0]!;
    const [W, H] = sheetSize;
    const cols = Math.max(1, Math.round(W / 216));
    const tileW = W / cols;
    const tileH = tileW * (16 / 9) + 24;
    const late = Math.abs(time - Number(s.settle?.t ?? s.end)) < Math.abs(time - (s.start + s.end) / 2);
    const col = i % cols;
    const row = Math.floor(i / cols) * 2 + (late ? 1 : 0);
    const k = 0.5;
    el.style.display = "block";
    el.style.width = `${tileW * k}px`;
    el.style.height = `${(tileH - 24) * k}px`;
    el.style.left = `${e.clientX - (tileW * k) / 2}px`;
    el.style.top = `${(e.currentTarget as HTMLElement).getBoundingClientRect().top - (tileH - 24) * k - 26}px`;
    el.style.backgroundImage = `url('${sheet}')`;
    el.style.backgroundSize = `${W * k}px ${H * k}px`;
    el.style.backgroundPosition = `${-col * tileW * k}px ${-(row * tileH + 24) * k}px`;
    (el.firstChild as HTMLElement).textContent = `${fmtT(time)} · ${s.id}`;
  };

  // ── дорожки ──────────────────────────────────────────────────────────────────────────────────────
  const major = scale >= 60 ? 1 : scale >= 25 ? 5 : 10;
  const minor = major >= 5 ? 1 : 0.5;
  const ticks: JSX.Element[] = [];
  for (let s = 0; s <= duration + 1e-6; s = r3(s + minor)) {
    const isMajor = Math.abs(s / major - Math.round(s / major)) < 1e-6;
    ticks.push(
      <div key={s} class={`tick${isMajor ? "" : " minor"}`} style={{ left: `${X(s)}px` }}>
        {isMajor ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : ""}
      </div>,
    );
  }
  const selBeat = sel ? beatOf(sel) : undefined;
  const hasMp4 = Boolean(data.renders.mp4);
  const devices = tl.devices.map((d) => (drag?.kind === "device" && drag.key === `${d.bit}/${d.index}` ? { ...d, at: drag.value } : d));
  const musicShift = drag?.kind === "music" ? drag.value - drag.base : 0;
  const laneH = (key: string): number => LANES.find(([k]) => k === key)![1];
  const duckPath = (): string => {
    if (!music) return "";
    const h = laneH("music");
    const y = (g: number): number => 6 + (1 - clamp(g, 0, 1)) * (h - 18);
    let path = `M ${X(0)} ${y(1)}`;
    for (const d of [...music.duck].sort((a, b) => a.start - b.start)) path += ` L ${X(S(d.start))} ${y(1)} L ${X(S(d.start))} ${y(d.gain)} L ${X(S(d.end))} ${y(d.gain)} L ${X(S(d.end))} ${y(1)}`;
    return `${path} L ${X(duration)} ${y(1)}`;
  };

  return (
    <div class={`editor${selBeat ? "" : " no-side"}`}>
      <div>
        <div class="editor-bar">
          <div class="seg">
            <button class={mode === "mp4" ? "on" : ""} onClick={() => setMode("mp4")}>
              MP4
            </button>
            <button class={mode === "composition" ? "on" : ""} disabled={!data.renders.composition} title={data.renders.composition ? undefined : t("editor.compositionNone")} onClick={() => setMode("composition")}>
              {t("editor.composition")}
            </button>
          </div>
          <span class="time" ref={clock}>
            {`${fmtT(0)} / ${fmtT(tl.duration)}`}
          </span>
          {mode === "composition" ? <span class="muted small" ref={seekMs} /> : null}
          {tl.estimated ? (
            <span class="pill" title={t("editor.estimatedHint")}>
              {t("editor.estimated")}
            </span>
          ) : null}
          {data.card.changed ? (
            <span class="pill pill-changed" title={t("editor.changedHint")}>
              {t("editor.changed")}
            </span>
          ) : null}
          <span class="grow" />
          <button class="btn small ghost" disabled={!undo.current.length} onClick={() => void step(true)} title="Ctrl+Z">
            ↶ {t("editor.undo")}
          </button>
          <button class="btn small ghost" disabled={!redo.current.length} onClick={() => void step(false)} title="Ctrl+Shift+Z">
            ↷ {t("editor.redo")}
          </button>
          <button class="btn small ghost" onClick={() => lanes.current && setPps(clamp((lanes.current.clientWidth - PAD * 2) / tl.duration, 8, 400))}>
            {t("editor.fit")}
          </button>
        </div>
        <div class="editor-top">
          <div class="editor-player">
            {mode === "composition" && data.renders.composition ? (
              <CompositionFrame
                id={id}
                url={data.renders.composition}
                width={240}
                onReady={(h) => {
                  comp.current = h;
                  seek(now.current);
                }}
                onError={(text) => {
                  toast(text, "err");
                  setMode("mp4");
                }}
              />
            ) : hasMp4 ? (
              <video ref={video} src={data.renders.mp4} controls preload="auto" poster={data.publish?.thumbnail ?? undefined} onSeeked={(e) => place(e.currentTarget.currentTime)} onTimeUpdate={(e) => e.currentTarget.paused && place(e.currentTarget.currentTime)} />
            ) : sheet ? (
              <div class="stack">
                <img src={sheet} alt="contact sheet" />
                <div class="muted small">{t("editor.notBuilt")}</div>
              </div>
            ) : (
              <div class="empty panel">{t("editor.notBuilt")}</div>
            )}
          </div>
          <div class="stack small muted">
            <div>{t("editor.help")}</div>
            <div class="undo-hint">{t("editor.undoHint", { n: undo.current.length })}</div>
          </div>
        </div>
        <div class="tracks">
          <div class="track-names">
            {LANES.map(([key, h]) => (
              <div key={key} style={{ "--h": `${h}px` }}>
                {key === "ruler" ? "" : t(`editor.lanes.${key}`)}
              </div>
            ))}
          </div>
          <div class="lanes" ref={lanes}>
            <div
              class="lanes-inner"
              style={{ width: `${width}px` }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest(".handle, .pin, .music-lane")) return;
                seek(timeAt(e.clientX));
              }}
            >
              <div
                class="lane ruler"
                style={{ "--h": `${laneH("ruler")}px` }}
                title={t("editor.scrub")}
                onPointerDown={(e) => {
                  // протяжка по шкале — скраббинг: курсор, MP4 или композиция идут за мышью
                  seek(timeAt(e.clientX));
                  pointerDrag(e, () => undefined, () => undefined);
                  const move = (ev: PointerEvent): void => seek(timeAt(ev.clientX));
                  const up = (): void => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
                onMouseMove={showFrame} onMouseLeave={() => hover.current && (hover.current.style.display = "none")}>
                {ticks}
              </div>
              <div class="lane" style={{ "--h": `${laneH("beats")}px` }}>
                {tl.beats.map((b) => {
                  const end = S(b.end);
                  const start = S(b.start);
                  const hold = drag?.kind === "hold" && drag.beat === b.id ? drag.value : b.hold.value;
                  return (
                    <div
                      key={b.id}
                      class={`blk${sel === b.id ? " on" : ""}${drag?.kind === "hold" && drag.beat === b.id ? " dragging" : ""}`}
                      data-beat={b.id}
                      title={`${b.id} · ${b.line}\n${t("editor.holdTitle", { v: hold.toFixed(2) })}`}
                      style={{ left: `${X(start)}px`, width: `${Math.max(4, (end - start) * scale)}px` }}
                      onClick={() => setSel(b.id)}
                    >
                      <span class="bid">{b.id}</span>
                      {b.stage ?? b.intent ?? ""}
                      <div class="hold" style={{ width: `${Math.max(0, hold * scale)}px` }} />
                      <div class="handle" title={t("editor.holdDrag")} onPointerDown={(e) => startHold(e, b)} />
                    </div>
                  );
                })}
              </div>
              <div class="lane" style={{ "--h": `${laneH("words")}px` }}>
                {tl.words.map((w, i) => {
                  const wpx = (w.end - w.start) * scale;
                  return (
                    <div key={i} class="blk word" title={`${w.text} · ${w.start.toFixed(2)}`} style={{ left: `${X(S(w.start))}px`, width: `${Math.max(2, wpx)}px` }}>
                      {wpx > 22 ? w.text : ""}
                    </div>
                  );
                })}
              </div>
              <div class="lane" style={{ "--h": `${laneH("captions")}px` }}>
                {tl.captions.map((c, i) => (
                  <div key={i} class="blk cap" title={c.text} style={{ left: `${X(S(c.start))}px`, width: `${Math.max(2, (c.end - c.start) * scale)}px` }}>
                    {(c.end - c.start) * scale > 26 ? c.text : ""}
                  </div>
                ))}
              </div>
              <div class="lane" style={{ "--h": `${laneH("devices")}px` }}>
                {devices.map((d) => {
                  const key = `${d.bit}/${d.index}`;
                  const dragging = drag?.kind === "device" && drag.key === key;
                  return (
                    <div key={key} class={`dev${dragging ? " dragging" : ""}`} data-device={key} title={`${d.type} · ${d.bit} · ${d.at.toFixed(2)} с`} style={{ left: `${X(S(d.at))}px`, width: `${Math.max(16, d.duration * scale)}px` }}>
                      <div class="pin" title={t("editor.deviceDrag")} onPointerDown={(e) => startDevice(e, d)} />
                      {d.type}
                    </div>
                  );
                })}
                {drag?.kind === "device" && drag.word ? <div class="snap-line" style={{ left: `${X(drag.word.start)}px` }} title={drag.word.text} /> : null}
              </div>
              <div class="lane" style={{ "--h": `${laneH("transitions")}px` }}>
                {tl.transitions.map((tr) => (
                  <div key={`${tr.from}-${tr.to}`} class="blk trans" title={`${tr.from} → ${tr.to} · ${tr.type}`} style={{ left: `${X(S(tr.start))}px`, width: `${Math.max(4, tr.duration * scale)}px` }}>
                    {tr.duration * scale > 30 ? tr.type : ""}
                  </div>
                ))}
              </div>
              <div class={`lane music-lane${drag?.kind === "music" ? " dragging" : ""}`} style={{ "--h": `${laneH("music")}px` }} title={music ? `${music.id ?? music.track} · ${t("editor.musicDrag")}` : t("editor.noMusic")} onPointerDown={(e) => (music ? startMusic(e) : undefined)}>
                {music ? (
                  <>
                    <svg width={width} height={laneH("music")}>
                      <path d={duckPath()} fill="none" stroke="#8c8c8c" stroke-width="1" />
                    </svg>
                    {music.beats.map((b, i) => (
                      <div key={i} class={`beat-tick${music.strong?.includes(b) ? " strong" : ""}`} style={{ left: `${X(b + musicShift)}px` }} />
                    ))}
                  </>
                ) : null}
              </div>
              <div class="cursor" ref={cursor} />
            </div>
          </div>
        </div>
        <div class="hover-frame" ref={hover} style={{ display: "none" }}>
          <span />
        </div>
      </div>
      {selBeat ? (
        <div class="editor-side">
          <div class="panel">
            <div class="row between" style="margin-bottom:8px">
              <b class="mono">{selBeat.id}</b>
              <button class="btn small ghost" onClick={() => setSel(null)}>
                {t("editor.close")}
              </button>
            </div>
            <BeatForm key={selBeat.id} ctx={ctx} beat={selBeat} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
