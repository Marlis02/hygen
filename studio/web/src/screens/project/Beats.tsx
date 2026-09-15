import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Field, Fields, Group, JsonInput, put, schemaDef } from "../../forms.tsx";
import { api } from "../../lib/api.ts";
import { t } from "../../lib/i18n.ts";
import type { Dict } from "../../lib/i18n.ts";
import { JobView, confirmBox, fail, toast } from "../../lib/ui.tsx";
import type { ProjectCtx } from "../Project.tsx";

// «Биты»: карточка на бит — реплика, что видит зритель, intent / scene / stage, устройства, субтитры, look, sync, камера.
// Списки и типы параметров — из /api/schema. Карточки с ключом по id: перечитывание проекта не закрывает открытые
// карточки и не сбрасывает прокрутку. Форма бита (BeatForm) — одна на «Биты» и «Редактор».

export function BeatsTab({ ctx }: { ctx: ProjectCtx }): JSX.Element {
  const { id, data, reload } = ctx;
  const p = data.project;
  const add = async (): Promise<void> => {
    try {
      const r = await api(`/api/projects/${id}/beats`, { body: { after: p.beats[p.beats.length - 1]?.id } });
      toast(t("beats.added", { id: r.beat }));
      await reload();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <div>
      <div class="row between" style="margin-bottom:12px">
        <div class="muted">{p.beats.length ? t("beats.about") : t("beats.emptyBrief")}</div>
        <button class="btn" onClick={() => void add()}>
          {t("beats.add")}
        </button>
      </div>
      {(p.beats as Dict[]).map((beat) => (
        <BeatCard key={beat.id} ctx={ctx} beat={beat} />
      ))}
    </div>
  );
}

function BeatCard({ ctx, beat }: { ctx: ProjectCtx; beat: Dict }): JSX.Element {
  const [opened, setOpened] = useState(false);
  const devs = (beat.devices ?? []) as Dict[];
  return (
    <details class="beat" data-beat={beat.id} onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary>
        <div>
          <div class="bid">{beat.id}</div>
          <div class="small muted">{beat.role ?? ""}</div>
        </div>
        <div>
          <div class="line">{beat.text}</div>
          {beat.sees ? <div class="sees">👁 {beat.sees}</div> : null}
        </div>
        <div class="row" style="justify-content:flex-end">
          {beat.intent ? <span class="chip">intent {beat.intent}</span> : null}
          {beat.scene ? <span class="chip">scene {beat.scene}</span> : null}
          {beat.stage ? <span class="chip">stage {beat.stage.type}</span> : null}
          {devs.map((d, i) => (
            <span key={i} class="chip">
              {d.type}
            </span>
          ))}
        </div>
      </summary>
      {opened ? (
        <div class="inner">
          <BeatForm ctx={ctx} beat={beat} />
          <BeatSide ctx={ctx} beat={beat} />
        </div>
      ) : null}
    </details>
  );
}

const beatKind = (b: Dict): string => (b.scene !== undefined ? "scene" : b.intent !== undefined ? "intent" : "stage");

/**
 * Форма бита. Черновик — копия бита; поля неуправляемые и пишут в черновик. «Перерисовать» форму (смена типа бита,
 * устройства, сцены) = новый key у полей. Бит поменялся снаружи (режиссёр, редактор) — черновик берётся заново.
 */
export function BeatForm({ ctx, beat, onSaved }: { ctx: ProjectCtx; beat: Dict; onSaved?: () => void }): JSX.Element {
  const { id, data, schema, reload } = ctx;
  const source = JSON.stringify(beat);
  const draftRef = useRef<{ source: string; draft: Dict }>({ source: "", draft: {} });
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<Dict | null>(null);
  if (draftRef.current.source !== source) draftRef.current = { source, draft: structuredClone(beat) };
  useEffect(() => setVersion((v) => v + 1), [source]);
  const draft = draftRef.current.draft;
  const redraw = (): void => setVersion((v) => v + 1);
  const defs = schema.defs;
  const kind = beatKind(draft);
  const k = (name: string): string => `${version}-${name}`;

  const save = async (): Promise<void> => {
    try {
      const r = await api(`/api/projects/${id}/beats/${encodeURIComponent(beat.id)}`, { method: "PUT", body: { beat: draft } });
      setStatus(r);
      toast(t("beats.saved"));
      onSaved?.();
      await reload();
    } catch (err) {
      fail(err);
    }
  };
  const move = async (dir: number): Promise<void> => {
    try {
      await api(`/api/projects/${id}/beats/${encodeURIComponent(beat.id)}/move`, { body: { dir } });
      await reload();
    } catch (err) {
      fail(err);
    }
  };
  const remove = async (): Promise<void> => {
    if (!(await confirmBox(t("beats.removeTitle", { id: beat.id }), t("beats.removeText"), t("beats.remove"), "danger"))) return;
    try {
      await api(`/api/projects/${id}/beats/${encodeURIComponent(beat.id)}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      fail(err);
    }
  };

  const intentGroup = (): JSX.Element => {
    const intent = (schema.intents as Dict[]).find((x) => x.id === draft.intent);
    return (
      <Group title={t("beats.groups.intent")}>
        <Fields>
          <Field key={k("intent")} name="intent" def={{ type: "enum", description: intent?.use }} value={draft.intent} onChange={(v) => (put(draft, "intent", v), redraw())} options={(schema.intents as Dict[]).map((x) => x.id)} />
          <Field key={k("target")} name="target" def={schemaDef(defs.beat.properties.target)} value={draft.target} onChange={(v) => put(draft, "target", v)} />
          <Field key={k("at")} name="at" def={{ type: "at" }} value={draft.at} onChange={(v) => put(draft, "at", v)} />
          <Field key={k("data")} name="data" def={{ type: "json", description: intent?.requires ? `${t("beats.requires")}: ${(intent.requires as string[]).join(", ")}` : undefined }} value={draft.data} onChange={(v) => put(draft, "data", v)} />
          <Field key={k("stage")} name="stage" def={{ type: "json", description: t("beats.intentStageHint") }} value={draft.stage} onChange={(v) => put(draft, "stage", v)} />
        </Fields>
      </Group>
    );
  };

  const sceneGroup = (): JSX.Element => {
    const scene = (schema.scenes as Dict[]).find((s) => s.id === draft.scene);
    const recipe = (schema.recipes as Dict[]).find((r) => r.id === draft.scene);
    const options = [...(schema.scenes as Dict[]).map((s) => s.id), ...(schema.recipes as Dict[]).map((r) => r.id)];
    return (
      <Group title={t("beats.groups.scene")}>
        <Fields>
          <Field key={k("scene")} name="scene" def={{ type: "enum", description: scene?.use ?? recipe?.use }} value={draft.scene} onChange={(v) => (put(draft, "scene", v), delete draft.params, redraw())} options={options} />
          {recipe ? <Field key={k("rdata")} name="data" def={{ type: "json", default: recipe.demo }} value={draft.data} onChange={(v) => put(draft, "data", v)} /> : null}
          {scene ? <Field key={k("anchors")} name="anchors" def={{ type: "json", description: t("beats.anchorsHint", { list: Object.keys(scene.anchors ?? {}).join(", ") }) }} value={draft.anchors} onChange={(v) => put(draft, "anchors", v)} /> : null}
          {scene
            ? Object.entries(scene.params as Dict).map(([name, def]) => (
                <Field
                  key={k(`p-${name}`)}
                  name={name}
                  def={def as Dict}
                  value={draft.params?.[name]}
                  onChange={(v) => {
                    draft.params = draft.params ?? {};
                    put(draft.params, name, v);
                    if (!Object.keys(draft.params).length) delete draft.params;
                  }}
                />
              ))
            : null}
        </Fields>
      </Group>
    );
  };

  const mediaFields = (obj: Dict): JSX.Element[] => {
    const files = (data.media as Dict[]).filter((m) => m.kind === "image" || m.kind === "video").map((m) => `media/${m.name}`);
    const props = defs.media.properties as Dict;
    return [
      <Field key={k("src")} name="src" def={{ type: "enum", description: props.src?.description }} value={obj.src} onChange={(v) => put(obj, "src", v)} options={files} />,
      ...["fit", "treatment", "in", "out", "rate", "reverse"].map((name) => <Field key={k(name)} name={name} def={name === "treatment" ? { type: "enum", values: schema.treatments, description: props.treatment?.description } : name === "fit" ? { type: "enum", values: ["cover", "contain"] } : schemaDef(props[name])} value={obj[name]} onChange={(v) => put(obj, name, v)} />),
      ...["crop", "pan", "hold", "zoom", "focus"].map((name) => <Field key={k(name)} name={name} def={{ type: "json", description: props[name]?.description }} value={obj[name]} onChange={(v) => put(obj, name, v)} />),
    ];
  };

  const stageGroup = (): JSX.Element => {
    const st: Dict = draft.stage ?? (draft.stage = { type: "color" });
    const extra: JSX.Element[] = [];
    if (st.type === "media") extra.push(...mediaFields(st));
    if (st.type === "split")
      extra.push(
        <Field key={k("a")} name="a" def={{ type: "json", description: t("beats.splitHint") }} value={st.a} onChange={(v) => put(st, "a", v)} />,
        <Field key={k("b")} name="b" def={{ type: "json" }} value={st.b} onChange={(v) => put(st, "b", v)} />,
        <Field key={k("sat")} name="at" def={{ type: "at" }} value={st.at} onChange={(v) => put(st, "at", v)} />,
        <Field key={k("dur")} name="dur" def={{ type: "number", default: 1.1 }} value={st.dur} onChange={(v) => put(st, "dur", v)} />,
        <Field key={k("direction")} name="direction" def={{ type: "enum", values: ["left", "right", "up", "down"] }} value={st.direction} onChange={(v) => put(st, "direction", v)} />,
        <Field key={k("labels")} name="labels" def={{ type: "list" }} value={st.labels} onChange={(v) => put(st, "labels", v)} />,
      );
    if (st.type === "map")
      extra.push(
        <Field key={k("map")} name="map" def={{ type: "string", description: t("beats.mapHint") }} value={st.map} onChange={(v) => put(st, "map", v)} />,
        <Field key={k("reveal")} name="reveal" def={{ type: "at" }} value={st.reveal} onChange={(v) => put(st, "reveal", v)} />,
        <Field key={k("draw")} name="draw" def={{ type: "boolean" }} value={st.draw} onChange={(v) => put(st, "draw", v)} />,
        <Field key={k("markers")} name="markers" def={{ type: "json" }} value={st.markers} onChange={(v) => put(st, "markers", v)} />,
        <Field key={k("route")} name="route" def={{ type: "json" }} value={st.route} onChange={(v) => put(st, "route", v)} />,
      );
    if (st.type === "color") extra.push(<Field key={k("color")} name="color" def={{ type: "string", default: "night" }} value={st.color} onChange={(v) => put(st, "color", v)} />, <Field key={k("glow")} name="glow" def={{ type: "boolean" }} value={st.glow} onChange={(v) => put(st, "glow", v)} />);
    extra.push(<Field key={k("regions")} name="regions" def={{ type: "json", description: t("beats.regionsHint") }} value={st.regions} onChange={(v) => put(st, "regions", v)} />, <Field key={k("source")} name="source" def={{ type: "string" }} value={st.source} onChange={(v) => put(st, "source", v)} />);
    return (
      <Group title={t("beats.groups.stage")}>
        <Fields>
          <Field key={k("type")} name="type" def={{ type: "enum", values: schema.stageTypes }} value={st.type} onChange={(v) => ((draft.stage = { type: v ?? "color" }), redraw())} />
          {extra}
        </Fields>
      </Group>
    );
  };

  const devicesGroup = (): JSX.Element => {
    const list: Dict[] = draft.devices ?? (draft.devices = []);
    const types = Object.keys(schema.devices).filter((x) => x !== "text.caption");
    return (
      <Group title={t("beats.groups.devices")}>
        {list.map((dev, i) => {
          const def = schema.devices[dev.type] as Dict | undefined;
          const textParams = def?.text ? (schema.text.params as Dict) : {};
          const params = { ...(def?.params ?? {}), ...Object.fromEntries(Object.entries(textParams).filter(([name]) => !(def?.params ?? {})[name])) };
          const dk = (name: string): string => k(`d${i}-${name}`);
          return (
            <div key={k(`dev-${i}`)} class="device" data-device={i}>
              <div class="row between">
                <b>{`${i}. ${dev.type}`}</b>
                <span class="small muted grow">{def?.use ?? ""}</span>
                <button
                  class="btn small danger"
                  onClick={() => {
                    list.splice(i, 1);
                    if (typeof draft.dominant === "number" && draft.dominant >= list.length) draft.dominant = "stage";
                    redraw();
                  }}
                >
                  ✕
                </button>
              </div>
              <Fields>
                <Field key={dk("type")} name="type" def={{ type: "enum" }} value={dev.type} onChange={(v) => ((list[i] = { type: v, at: dev.at }), redraw())} options={types} />
                <Field key={dk("at")} name="at" def={{ type: "at" }} value={dev.at} onChange={(v) => put(dev, "at", v)} />
                <Field key={dk("until")} name="until" def={{ type: "at" }} value={dev.until} onChange={(v) => put(dev, "until", v)} />
                <Field key={dk("target")} name="target" def={{ type: "json", description: `${def?.target ?? ""} ${def?.targetNote ?? ""}` }} value={dev.target} onChange={(v) => put(dev, "target", v)} />
                {def?.explains ? <Field key={dk("explains")} name="explains" def={{ type: "string", description: t("beats.explainsHint") }} value={dev.explains} onChange={(v) => put(dev, "explains", v)} /> : null}
                <Field key={dk("source")} name="source" def={{ type: "string", description: def?.figures ? t("beats.figuresHint", { list: (def.figures as string[]).join(", ") }) : undefined }} value={dev.source} onChange={(v) => put(dev, "source", v)} />
                <Field key={dk("sync")} name="sync" def={{ type: "enum", values: schema.sync }} value={dev.sync} onChange={(v) => put(dev, "sync", v)} />
                {Object.entries(params).map(([name, pdef]) => (
                  <Field
                    key={dk(`p-${name}`)}
                    name={name}
                    def={pdef as Dict}
                    value={dev.params?.[name]}
                    onChange={(v) => {
                      dev.params = dev.params ?? {};
                      put(dev.params, name, v);
                      if (!Object.keys(dev.params).length) delete dev.params;
                    }}
                  />
                ))}
              </Fields>
            </div>
          );
        })}
        <div class="row">
          <select
            key={k("add")}
            style="width:auto"
            onChange={(e) => {
              const type = e.currentTarget.value;
              if (!type) return;
              if (list.length >= 3) {
                toast(t("beats.maxDevices"), "err");
                redraw();
                return;
              }
              const demo = (schema.devices[type]?.demo ?? {}) as Dict;
              list.push({ type, at: "speech", ...(demo.target !== undefined ? { target: demo.target } : {}), ...(demo.params ? { params: structuredClone(demo.params) } : {}) });
              redraw();
            }}
          >
            <option value="">{t("beats.addDevice")}</option>
            {types.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <div style="width:220px">
            <Field key={k("dominant")} name="dominant" def={{ type: "enum", description: defs.beat.properties.dominant?.description }} value={draft.dominant === undefined ? undefined : String(draft.dominant)} onChange={(v) => put(draft, "dominant", v === undefined ? undefined : v === "stage" ? "stage" : Number(v))} options={["stage", ...list.map((_, i) => String(i))]} />
          </div>
        </div>
      </Group>
    );
  };

  const captionGroup = (): JSX.Element => {
    const cap: Dict = draft.caption ?? {};
    const commit = (): void => {
      if (Object.keys(cap).length) draft.caption = cap;
      else delete draft.caption;
    };
    const presets = Object.values(schema.captionFamilies as Record<string, string[]>).flat();
    const cdef = (schema.devices["text.caption"]?.params ?? {}) as Dict;
    const textParams = schema.text.params as Dict;
    const names = [...new Set([...Object.keys(cdef), ...Object.keys(textParams)])].filter((x) => x !== "preset");
    return (
      <Group title={t("beats.groups.caption")}>
        <div class="hint muted small" style="margin-bottom:6px">
          {t("beats.captionHint")}
        </div>
        <Fields>
          <Field key={k("preset")} name="preset" def={{ type: "enum", description: Object.entries(schema.captionFamilies).map(([f, l]) => `${f}: ${(l as string[]).join(", ")}`).join(" · ") }} value={cap.preset} onChange={(v) => (put(cap, "preset", v), commit())} options={presets} />
          {names.map((name) => (
            <Field key={k(`c-${name}`)} name={name} def={(cdef[name] ?? textParams[name]) as Dict} value={cap[name]} onChange={(v) => (put(cap, name, v), commit())} />
          ))}
        </Fields>
      </Group>
    );
  };

  const lookGroup = (): JSX.Element => {
    const cam: Dict = draft.camera && typeof draft.camera === "object" ? draft.camera : draft.camera ? { preset: draft.camera } : {};
    const camCommit = (): void => {
      if (Object.keys(cam).length) draft.camera = cam;
      else delete draft.camera;
    };
    const tex = new Set(((draft.textures ?? []) as Dict[]).map((x) => x.id));
    return (
      <Group title={t("beats.groups.look")}>
        <Fields>
          <Field key={k("tone")} name="tone" def={{ type: "enum", values: schema.tones }} value={draft.tone} onChange={(v) => put(draft, "tone", v)} />
          <Field key={k("transition")} name="transition" def={{ type: "enum", description: t("beats.transitionHint") }} value={draft.transition} onChange={(v) => put(draft, "transition", v)} options={schema.transitions} />
          <Field key={k("bsync")} name="sync" def={{ type: "enum", values: schema.sync, description: t("beats.syncHint") }} value={draft.sync} onChange={(v) => put(draft, "sync", v)} />
          <Field key={k("cam.reason")} name="camera.reason" def={{ type: "enum", values: schema.cameraReasons, description: t("beats.cameraHint") }} value={cam.reason} onChange={(v) => (put(cam, "reason", v), camCommit())} />
          <Field key={k("cam.preset")} name="camera.preset" def={{ type: "string" }} value={cam.preset} onChange={(v) => (put(cam, "preset", v), camCommit())} />
          <Field key={k("cam.amp")} name="camera.amplitude" def={{ type: "number", min: 0, max: 2 }} value={cam.amplitude} onChange={(v) => (put(cam, "amplitude", v), camCommit())} />
          <Field key={k("post")} name="post" def={{ type: "json", description: t("beats.postHint") }} value={draft.post} onChange={(v) => put(draft, "post", v)} />
        </Fields>
        <div class="field wide" style="margin-top:8px">
          <label class="field-name">textures</label>
          <div>
            {(schema.textures as string[]).map((tid) => (
              <label key={k(`tex-${tid}`)} class="check" style="margin-right:10px">
                <input
                  type="checkbox"
                  defaultChecked={tex.has(tid)}
                  onChange={(e) => {
                    const list = ((draft.textures ?? []) as Dict[]).filter((x) => x.id !== tid);
                    if (e.currentTarget.checked) list.push({ id: tid });
                    if (list.length) draft.textures = list;
                    else delete draft.textures;
                  }}
                />
                {tid}
              </label>
            ))}
          </div>
        </div>
      </Group>
    );
  };

  const advancedGroup = (): JSX.Element => (
    <details>
      <summary class="muted small">{t("beats.groups.advanced")}</summary>
      <Fields>
        <Field key={k("sources")} name="sources" def={{ type: "json" }} value={draft.sources} onChange={(v) => put(draft, "sources", v)} />
        <Field key={k("pad")} name="pad" def={{ type: "json", default: [0.2, 0.4] }} value={draft.pad} onChange={(v) => put(draft, "pad", v)} />
        <Field key={k("seed")} name="seed" def={{ type: "integer" }} value={draft.seed} onChange={(v) => put(draft, "seed", v)} />
        <Field key={k("background")} name="background" def={{ type: "json" }} value={draft.background} onChange={(v) => put(draft, "background", v)} />
      </Fields>
      <div class="field wide">
        <label class="field-name">{t("beats.rawJson")}</label>
        <JsonInput
          key={k("raw")}
          value={draft}
          onChange={(v) => {
            if (v && typeof v === "object") {
              for (const key of Object.keys(draft)) delete draft[key];
              Object.assign(draft, v);
            }
          }}
        />
      </div>
    </details>
  );

  return (
    <div>
      <Group title={t("beats.groups.line")}>
        <Fields>
          <Field key={k("id")} name="id" def={schemaDef(defs.beat.properties.id)} value={draft.id} onChange={(v) => put(draft, "id", v)} />
          <Field key={k("role")} name="role" def={{ type: "string", description: t("beats.roleHint") }} value={draft.role} onChange={(v) => put(draft, "role", v)} />
          <Field key={k("text")} name="text" def={{ type: "text", description: defs.beat.properties.text?.description }} value={draft.text} onChange={(v) => put(draft, "text", v)} label={t("beats.text")} />
          <Field key={k("sees")} name="sees" def={{ type: "text", description: t("beats.seesHint") }} value={draft.sees} onChange={(v) => put(draft, "sees", v)} label={t("beats.sees")} />
          <div class="field">
            <label class="field-name">{t("beats.kindLabel")}</label>
            <select
              key={k("kind")}
              onChange={(e) => {
                for (const key of ["stage", "devices", "dominant", "intent", "target", "at", "data", "scene", "params", "anchors"]) delete draft[key];
                const v = e.currentTarget.value;
                if (v === "stage") Object.assign(draft, { stage: { type: "color", color: "night", glow: true }, devices: [], dominant: "stage" });
                if (v === "intent") draft.intent = schema.intents[0]?.id;
                if (v === "scene") draft.scene = schema.scenes[0]?.id;
                redraw();
              }}
            >
              {["stage", "intent", "scene"].map((x) => (
                <option key={x} value={x} selected={x === kind}>
                  {t(`beats.kind.${x}`)}
                </option>
              ))}
            </select>
          </div>
        </Fields>
      </Group>
      {kind === "intent" ? intentGroup() : kind === "scene" ? sceneGroup() : [stageGroup(), devicesGroup()]}
      {captionGroup()}
      {lookGroup()}
      {advancedGroup()}
      <div class="row" style="margin-top:8px">
        <button class="btn primary" onClick={() => void save()}>
          {t("common.save")}
        </button>
        <button class="btn small ghost" onClick={() => void move(-1)}>
          ↑
        </button>
        <button class="btn small ghost" onClick={() => void move(1)}>
          ↓
        </button>
        <span class="grow" />
        <button class="btn small danger" onClick={() => void remove()}>
          {t("beats.remove")}
        </button>
      </div>
      {status ? (
        status.ok ? (
          <div class="banner ok">{t("beats.saved")}</div>
        ) : (
          <div class="banner err">
            <b>{t("beats.savedInvalid")}</b> {status.error}
          </div>
        )
      ) : null}
    </div>
  );
}

/** Правая колонка карточки: превью бита, пересборка бита, переозвучка (с ценой) — всё по кнопкам. */
function BeatSide({ ctx, beat }: { ctx: ProjectCtx; beat: Dict }): JSX.Element {
  const { id } = ctx;
  const [job, setJob] = useState<string | null>(null);
  const [out, setOut] = useState<Dict | null>(null);
  const bid = encodeURIComponent(beat.id);
  const preview = async (): Promise<void> => {
    try {
      const j = await api(`/api/projects/${id}/beats/${bid}/preview`, { method: "POST" });
      setOut({ running: true });
      setJob(j.id);
    } catch (err) {
      fail(err);
    }
  };
  const rebuild = async (): Promise<void> => {
    if (!(await confirmBox(t("beats.rebuildTitle"), t("beats.rebuildText")))) return;
    try {
      setOut(null);
      setJob((await api(`/api/projects/${id}/beats/${bid}/rebuild`, { method: "POST" })).id);
    } catch (err) {
      fail(err);
    }
  };
  const revoice = async (): Promise<void> => {
    try {
      const v = await api(`/api/projects/${id}/beats/${bid}/voice`);
      const left = v.budget.left === null ? "∞" : v.budget.left;
      const text = (
        <div class="stack">
          <div>{t("beats.revoiceProvider", { p: v.provider })}</div>
          <div>{t("beats.revoiceCost", { n: v.chars, left, budget: v.budget.budget ?? "∞" })}</div>
          {v.budget.left !== null ? (
            <div class="meter">
              <div style={{ width: `${Math.min(100, (100 * (v.budget.budget - v.budget.left)) / Math.max(1, v.budget.budget))}%` }} />
            </div>
          ) : null}
          <div class="muted small">{t("beats.revoiceNote")}</div>
        </div>
      );
      if (!(await confirmBox(t("beats.revoiceTitle", { id: beat.id }), text, t("beats.revoiceGo", { n: v.chars })))) return;
      setOut(null);
      setJob((await api(`/api/projects/${id}/beats/${bid}/revoice`, { method: "POST" })).id);
    } catch (err) {
      fail(err);
    }
  };
  return (
    <div class="side stack">
      <div class="row">
        <button class="btn primary" onClick={() => void preview()}>
          {t("beats.preview")}
        </button>
        <button class="btn" onClick={() => void rebuild()}>
          {t("beats.rebuild")}
        </button>
        <button class="btn" onClick={() => void revoice()}>
          {t("beats.revoice")}
        </button>
      </div>
      <div class="muted small">{t("beats.previewHint")}</div>
      {out?.running ? <div class="muted small">{t("beats.previewRunning")}</div> : out?.mp4 ? <video src={out.mp4} controls autoPlay loop muted /> : out?.sheet ? <img src={out.sheet} /> : out?.failed ? <div class="banner err">{t("beats.previewFailed")}</div> : null}
      {job ? (
        <JobView
          key={job}
          id={job}
          onDone={(j) => {
            const r = j.result ?? {};
            if (out?.running || r.mp4 || r.sheet) setOut(r.mp4 || r.sheet ? r : { failed: true });
            else toast(j.status === "ok" ? t("build.done") : t("build.failed"), j.status === "ok" ? "ok" : "err");
          }}
        />
      ) : null}
    </div>
  );
}
