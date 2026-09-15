import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { Field, Fields } from "../forms.tsx";
import { api, go, useApi } from "../lib/api.ts";
import { t } from "../lib/i18n.ts";
import type { Dict } from "../lib/i18n.ts";
import { LazyVideo, fail, toast } from "../lib/ui.tsx";

// «Look»: миры движка с превью и умолчаниями (субтитры, текстуры, камера); новый look строится формой от встроенного
// и сохраняется в library/looks/<id>/look.json. Превью каждого look показывает его sampleLine.

export function LooksScreen(): JSX.Element {
  const { data, error } = useApi(() => Promise.all([api("/api/looks"), api("/api/library"), api("/api/schema")]), []);
  if (error) return <div class="banner err">{error}</div>;
  if (!data) return <div class="empty">{t("common.loading")}</div>;
  const [looks, lib, schema] = data;
  const previews = new Map((lib.items as Dict[]).filter((i) => i.section === "looks").map((i) => [i.id as string, i.preview as string | null]));
  return (
    <>
      <div class="header">
        <div>
          <h1>{t("looks.title")}</h1>
          <div class="sub">{t("looks.sub")}</div>
        </div>
      </div>
      <div class="cards">
        {(looks.looks as Dict[]).map(({ id, look }) => (
          <LookCard key={id} id={id} look={look} preview={previews.get(id) ?? null} />
        ))}
      </div>
      <h2 style="margin:28px 0 12px">{t("looks.create")}</h2>
      <CreateForm looks={looks} schema={schema} />
    </>
  );
}

function LookCard({ id, look, preview }: { id: string; look: Dict; preview: string | null }): JSX.Element {
  const rows: [string, JSX.Element | string][] = [
    [
      t("looks.palette"),
      <span>
        <span class="swatch" style={`background:${look.palette?.accent}`} /> {look.palette?.accent} · <span class="swatch" style={`background:${look.palette?.secondary}`} /> {look.palette?.secondary ?? ""}
      </span>,
    ],
    [t("looks.captions"), `${look.captions?.family ?? "calm"} · ${look.captions?.preset ?? "plain"}${look.captions?.activeWord ? ` · ${look.captions.activeWord}` : ""}`],
    [t("looks.textures"), ((look.textures ?? []) as Dict[]).map((x) => x.id).join(", ") || "—"],
    [t("looks.camera"), `${look.motion?.camera?.preset ?? "none"}${look.motion?.camera?.amplitude !== undefined ? ` × ${look.motion.camera.amplitude}` : ""}`],
    [t("looks.transitions"), `${look.transitions?.default ?? "—"} / ${look.transitions?.hit ?? "—"}`],
    [t("looks.kinetic"), look.typography?.kinetic ? t("common.yes") : t("common.no")],
  ];
  return (
    <div class="card lib-card">
      {preview ? (
        <div class="thumb" onMouseEnter={(e) => void e.currentTarget.querySelector("video")?.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.querySelector("video")?.pause()}>
          <LazyVideo src={preview} />
        </div>
      ) : (
        <div class="thumb">
          <div>{t("library.noPreview")}</div>
        </div>
      )}
      <div class="body">
        <div class="title">
          {`${look.name} `}
          <span class="chip mono">{id}</span>
        </div>
        <div class="meta">{look.about?.mood ?? ""}</div>
        {look.sampleLine ? (
          <div class="sample">
            <span class="muted small">{`${t("looks.sample")}: `}</span>
            {`“${look.sampleLine}”`}
          </div>
        ) : null}
        <table class="plain">
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </table>
      </div>
    </div>
  );
}

const baseTextures = (looks: Dict, base: unknown): string[] => (((looks.looks as Dict[]).find((l) => l.id === base)?.look?.textures ?? []) as Dict[]).map((x) => x.id as string);

function CreateForm({ looks, schema }: { looks: Dict; schema: Dict }): JSX.Element {
  // черновик формы: поля неуправляемые и пишут сюда; POST /api/looks получает его целиком
  const draft = useRef<Dict | null>(null);
  draft.current ??= { extends: looks.looks[0]?.id, textures: baseTextures(looks, looks.looks[0]?.id) };
  const v = draft.current;
  // смена основы пересоздаёт чекбоксы (key) — выбор текстур сбрасывается к текстурам основы
  const [base, setBase] = useState<string>(String(v.extends ?? ""));
  const submit = async (): Promise<void> => {
    try {
      const r = await api("/api/looks", { body: v });
      toast(t("looks.created", { id: r.id }));
      go("#/looks");
      location.reload();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <div class="panel">
      <div class="muted small" style="margin-bottom:10px">
        {t("looks.createHint")}
      </div>
      <Fields>
        <Field name="id" def={{ type: "string", description: t("looks.idHint") }} value={undefined} onChange={(x) => (v.id = x)} />
        <Field name="name" def={{ type: "string" }} value={undefined} onChange={(x) => (v.name = x)} label={t("looks.name")} />
        <Field
          name="extends"
          def={{ type: "enum" }}
          value={v.extends}
          onChange={(x) => {
            v.extends = x;
            v.textures = baseTextures(looks, x);
            setBase(String(x ?? ""));
          }}
          options={(looks.looks as Dict[]).map((l) => l.id as string)}
          label={t("looks.base")}
        />
        <Field name="accent" def={{ type: "color", description: "#RRGGBB" }} value={undefined} onChange={(x) => (v.accent = x)} label={t("looks.accent")} />
        <Field name="secondary" def={{ type: "color", description: "#RRGGBB" }} value={undefined} onChange={(x) => (v.secondary = x)} label={t("looks.secondary")} />
        <Field name="family" def={{ type: "enum" }} value={undefined} onChange={(x) => (v.family = x)} options={Object.keys(looks.families)} label={t("looks.captionsFamily")} />
        <Field name="camera" def={{ type: "enum" }} value={undefined} onChange={(x) => (v.camera = x)} options={["none", "push-in", "pull-out", "pan", "tilt", "handheld"]} label={t("looks.camera")} />
        <Field name="grain" def={{ type: "number", min: 0, max: 2 }} value={undefined} onChange={(x) => (v.grain = x)} label={t("looks.grain")} />
        <Field name="mood" def={{ type: "text" }} value={undefined} onChange={(x) => (v.mood = x)} label={t("looks.mood")} />
        <Field name="sampleLine" def={{ type: "string", description: t("looks.sampleHint") }} value={undefined} onChange={(x) => (v.sampleLine = x)} label={t("looks.sample")} />
      </Fields>
      <div class="field wide" style="margin-top:10px">
        <label class="field-name">{t("looks.textures")}</label>
        <div key={base}>
          {(schema.textures as string[])
            .filter((x) => x !== "grain")
            .map((id) => (
              <label key={id} class="check" style="margin-right:10px">
                <input
                  type="checkbox"
                  defaultChecked={(v.textures as string[]).includes(id)}
                  onChange={(e) => {
                    const chosen = new Set<string>(v.textures as string[]);
                    if (e.currentTarget.checked) chosen.add(id);
                    else chosen.delete(id);
                    v.textures = [...chosen];
                  }}
                />
                {id}
              </label>
            ))}
        </div>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" onClick={() => void submit()}>
          {t("looks.createGo")}
        </button>
      </div>
    </div>
  );
}
