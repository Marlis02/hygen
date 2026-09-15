import { api, clear, confirmBox, fail, h, mountJob, t, toast } from "../lib.ts";
import type { Dict } from "../lib.ts";
import { field, fields, group, jsonInput, put, schemaDef } from "../forms.ts";

let reopen = new Set<string>();

/** Beat cards to open again when the tab is drawn anew (a save, a build, a change of project.json from outside). */
export function setReopenBeats(ids: string[]): void {
  reopen = new Set(ids.filter(Boolean));
}

// «Биты»: a card per beat — line, what the viewer sees, intent / scene / stage, devices, captions, look overrides,
// sync, camera. Lists and param types come from /api/schema (device.json, scene.json, schema.json, text.schema.json).

export function beatsTab(id: string, data: Dict, schema: Dict, reload: () => void): HTMLElement {
  const p = data.project;
  const box = h("div");
  const add = async (): Promise<void> => {
    try {
      const r = await api(`/api/projects/${id}/beats`, { body: { after: p.beats[p.beats.length - 1]?.id } });
      toast(t("beats.added", { id: r.beat }));
      reload();
    } catch (err) {
      fail(err);
    }
  };
  box.appendChild(h("div", { class: "row between", style: "margin-bottom:12px" }, h("div", { class: "muted" }, t("beats.about")), h("button", { class: "btn", onclick: add }, t("beats.add"))));
  p.beats.forEach((beat: Dict, i: number) => box.appendChild(beatCard(id, data, schema, beat, i, reload)));
  reopen = new Set();
  return box;
}

const beatKind = (b: Dict, schema: Dict): string => (b.scene !== undefined ? "scene" : b.intent !== undefined ? "intent" : "stage");

function beatCard(id: string, data: Dict, schema: Dict, beat: Dict, index: number, reload: () => void): HTMLElement {
  const draft: Dict = structuredClone(beat);
  const side = h("div", { class: "side stack" });
  const status = h("div");
  const editor = h("div");
  const devs = (beat.devices ?? []) as Dict[];
  const summary = h(
    "summary",
    null,
    h("div", null, h("div", { class: "bid" }, beat.id), h("div", { class: "small muted" }, beat.role ?? "")),
    h("div", null, h("div", { class: "line" }, beat.text), beat.sees ? h("div", { class: "sees" }, `👁 ${beat.sees}`) : null),
    h("div", { class: "row", style: "justify-content:flex-end" }, beat.intent ? h("span", { class: "chip" }, `intent ${beat.intent}`) : null, beat.scene ? h("span", { class: "chip" }, `scene ${beat.scene}`) : null, beat.stage ? h("span", { class: "chip" }, `stage ${beat.stage.type}`) : null, devs.map((d) => h("span", { class: "chip" }, d.type))),
  );
  const details = h("details", { class: "beat", "data-beat": beat.id }, summary, h("div", { class: "inner" }, h("div", null, editor, status), side));
  let drawn = false;
  details.addEventListener("toggle", () => {
    if (details.open && !drawn) {
      drawn = true;
      drawEditor();
      drawSide();
    }
  });

  const save = async (): Promise<void> => {
    try {
      const r = await api(`/api/projects/${id}/beats/${encodeURIComponent(beat.id)}`, { method: "PUT", body: { beat: draft } });
      clear(status, r.ok ? h("div", { class: "banner ok" }, t("beats.saved")) : h("div", { class: "banner err" }, h("b", null, t("beats.savedInvalid")), " ", r.error));
      toast(t("beats.saved"));
      if (draft.id !== beat.id) reload();
    } catch (err) {
      fail(err);
    }
  };

  function drawEditor(): void {
    const kind = beatKind(draft, schema);
    const defs = schema.defs;
    const kindSel = h("select", null, ["stage", "intent", "scene"].map((k) => h("option", { value: k, selected: k === kind }, t(`beats.kind.${k}`))));
    kindSel.onchange = () => {
      for (const k of ["stage", "devices", "dominant", "intent", "target", "at", "data", "scene", "params", "anchors"]) delete draft[k];
      if (kindSel.value === "stage") Object.assign(draft, { stage: { type: "color", color: "night", glow: true }, devices: [], dominant: "stage" });
      if (kindSel.value === "intent") draft.intent = schema.intents[0]?.id;
      if (kindSel.value === "scene") draft.scene = schema.scenes[0]?.id;
      drawEditor();
    };
    const main = group(
      t("beats.groups.line"),
      fields(
        field("id", schemaDef(defs.beat.properties.id), draft.id, (v) => put(draft, "id", v)),
        field("role", { type: "string", description: t("beats.roleHint") }, draft.role, (v) => put(draft, "role", v)),
        field("text", { type: "text", description: defs.beat.properties.text?.description }, draft.text, (v) => put(draft, "text", v), { label: t("beats.text") }),
        field("sees", { type: "text", description: t("beats.seesHint") }, draft.sees, (v) => put(draft, "sees", v), { label: t("beats.sees") }),
        h("div", { class: "field" }, h("label", { class: "field-name" }, t("beats.kindLabel")), kindSel),
      ),
    );
    const parts: HTMLElement[] = [main];
    if (kind === "intent") parts.push(intentGroup());
    else if (kind === "scene") parts.push(sceneGroup());
    else parts.push(stageGroup(), devicesGroup());
    parts.push(captionGroup(), lookGroup(), advancedGroup());
    clear(editor, parts, h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn primary", onclick: save }, t("common.save")), h("button", { class: "btn small ghost", onclick: () => move(-1) }, "↑"), h("button", { class: "btn small ghost", onclick: () => move(1) }, "↓"), h("span", { class: "grow" }), h("button", { class: "btn small danger", onclick: remove }, t("beats.remove"))));
  }

  function intentGroup(): HTMLElement {
    const intent = (schema.intents as Dict[]).find((x) => x.id === draft.intent);
    return group(
      t("beats.groups.intent"),
      fields(
        field("intent", { type: "enum", description: intent?.use }, draft.intent, (v) => {
          put(draft, "intent", v);
          drawEditor();
        }, { options: (schema.intents as Dict[]).map((x) => x.id) }),
        field("target", schemaDef(schema.defs.beat.properties.target), draft.target, (v) => put(draft, "target", v)),
        field("at", { type: "at" }, draft.at, (v) => put(draft, "at", v)),
        field("data", { type: "json", description: intent?.requires ? `${t("beats.requires")}: ${(intent.requires as string[]).join(", ")}` : undefined }, draft.data, (v) => put(draft, "data", v)),
        field("stage", { type: "json", description: t("beats.intentStageHint") }, draft.stage, (v) => put(draft, "stage", v)),
      ),
    );
  }

  function sceneGroup(): HTMLElement {
    const scene = (schema.scenes as Dict[]).find((s) => s.id === draft.scene);
    const recipe = (schema.recipes as Dict[]).find((r) => r.id === draft.scene);
    const options = [...(schema.scenes as Dict[]).map((s) => s.id), ...(schema.recipes as Dict[]).map((r) => r.id)];
    const params = scene ? Object.entries(scene.params as Dict).map(([name, def]) => field(name, def as Dict, draft.params?.[name], (v) => {
      draft.params = draft.params ?? {};
      put(draft.params, name, v);
      if (!Object.keys(draft.params).length) delete draft.params;
    })) : [];
    return group(
      t("beats.groups.scene"),
      fields(
        field("scene", { type: "enum", description: scene?.use ?? recipe?.use }, draft.scene, (v) => {
          put(draft, "scene", v);
          delete draft.params;
          drawEditor();
        }, { options }),
        recipe ? field("data", { type: "json", default: recipe.demo }, draft.data, (v) => put(draft, "data", v)) : null,
        scene ? field("anchors", { type: "json", description: t("beats.anchorsHint", { list: Object.keys(scene.anchors ?? {}).join(", ") }) }, draft.anchors, (v) => put(draft, "anchors", v)) : null,
        ...params,
      ),
    );
  }

  function mediaFields(obj: Dict, onChange: () => void): HTMLElement[] {
    const files = (data.media as Dict[]).filter((m) => m.kind === "image" || m.kind === "video").map((m) => `media/${m.name}`);
    const props = schema.defs.media.properties as Dict;
    return [
      field("src", { type: "enum", description: props.src?.description }, obj.src, (v) => {
        put(obj, "src", v);
        onChange();
      }, { options: files }),
      ...["fit", "treatment", "in", "out", "rate", "reverse"].map((k) =>
        field(k, k === "treatment" ? { type: "enum", values: schema.treatments, description: props.treatment?.description } : k === "fit" ? { type: "enum", values: ["cover", "contain"] } : schemaDef(props[k]), obj[k], (v) => put(obj, k, v)),
      ),
      ...["crop", "pan", "hold", "zoom", "focus"].map((k) => field(k, { type: "json", description: props[k]?.description }, obj[k], (v) => put(obj, k, v))),
    ];
  }

  function stageGroup(): HTMLElement {
    const st: Dict = draft.stage ?? (draft.stage = { type: "color" });
    const typeSel = field("type", { type: "enum", values: schema.stageTypes }, st.type, (v) => {
      draft.stage = { type: v ?? "color" };
      drawEditor();
    });
    const extra: HTMLElement[] = [];
    if (st.type === "media") extra.push(...mediaFields(st, () => undefined));
    if (st.type === "split") {
      extra.push(field("a", { type: "json", description: t("beats.splitHint") }, st.a, (v) => put(st, "a", v)), field("b", { type: "json" }, st.b, (v) => put(st, "b", v)), field("at", { type: "at" }, st.at, (v) => put(st, "at", v)), field("dur", { type: "number", default: 1.1 }, st.dur, (v) => put(st, "dur", v)), field("direction", { type: "enum", values: ["left", "right", "up", "down"] }, st.direction, (v) => put(st, "direction", v)), field("labels", { type: "list" }, st.labels, (v) => put(st, "labels", v)));
    }
    if (st.type === "map") {
      extra.push(field("map", { type: "string", description: t("beats.mapHint") }, st.map, (v) => put(st, "map", v)), field("reveal", { type: "at" }, st.reveal, (v) => put(st, "reveal", v)), field("draw", { type: "boolean" }, st.draw, (v) => put(st, "draw", v)), field("markers", { type: "json" }, st.markers, (v) => put(st, "markers", v)), field("route", { type: "json" }, st.route, (v) => put(st, "route", v)));
    }
    if (st.type === "color") extra.push(field("color", { type: "string", default: "night" }, st.color, (v) => put(st, "color", v)), field("glow", { type: "boolean" }, st.glow, (v) => put(st, "glow", v)));
    extra.push(field("regions", { type: "json", description: t("beats.regionsHint") }, st.regions, (v) => put(st, "regions", v)), field("source", { type: "string" }, st.source, (v) => put(st, "source", v)));
    return group(t("beats.groups.stage"), fields(typeSel, ...extra));
  }

  function devicesGroup(): HTMLElement {
    const list: Dict[] = draft.devices ?? (draft.devices = []);
    const types = Object.keys(schema.devices).filter((k) => k !== "text.caption");
    const cards = list.map((dev, i) => {
      const def = schema.devices[dev.type] as Dict | undefined;
      const textParams = def?.text ? (schema.text.params as Dict) : {};
      const params = { ...(def?.params ?? {}), ...Object.fromEntries(Object.entries(textParams).filter(([k]) => !(def?.params ?? {})[k])) };
      return h(
        "div",
        { class: "device" },
        h("div", { class: "row between" }, h("b", null, `${i}. ${dev.type}`), h("span", { class: "small muted grow" }, def?.use ?? ""), h("button", { class: "btn small danger", onclick: () => {
          list.splice(i, 1);
          if (typeof draft.dominant === "number" && draft.dominant >= list.length) draft.dominant = "stage";
          drawEditor();
        } }, "✕")),
        fields(
          field("type", { type: "enum" }, dev.type, (v) => {
            list[i] = { type: v, at: dev.at };
            drawEditor();
          }, { options: types }),
          field("at", { type: "at" }, dev.at, (v) => put(dev, "at", v)),
          field("until", { type: "at" }, dev.until, (v) => put(dev, "until", v)),
          field("target", { type: "json", description: `${def?.target ?? ""} ${def?.targetNote ?? ""}` }, dev.target, (v) => put(dev, "target", v)),
          def?.explains ? field("explains", { type: "string", description: t("beats.explainsHint") }, dev.explains, (v) => put(dev, "explains", v)) : null,
          field("source", { type: "string", description: def?.figures ? t("beats.figuresHint", { list: (def.figures as string[]).join(", ") }) : undefined }, dev.source, (v) => put(dev, "source", v)),
          field("sync", { type: "enum", values: schema.sync }, dev.sync, (v) => put(dev, "sync", v)),
          ...Object.entries(params).map(([name, pdef]) => field(name, pdef as Dict, dev.params?.[name], (v) => {
            dev.params = dev.params ?? {};
            put(dev.params, name, v);
            if (!Object.keys(dev.params).length) delete dev.params;
          })),
        ),
      );
    });
    const addSel = h("select", { style: "width:auto" }, h("option", { value: "" }, t("beats.addDevice")), types.map((k) => h("option", { value: k }, k)));
    addSel.onchange = () => {
      if (!addSel.value) return;
      if (list.length >= 3) return toast(t("beats.maxDevices"), "err");
      const demo = (schema.devices[addSel.value]?.demo ?? {}) as Dict;
      list.push({ type: addSel.value, at: "speech", ...(demo.target !== undefined ? { target: demo.target } : {}), ...(demo.params ? { params: structuredClone(demo.params) } : {}) });
      drawEditor();
    };
    const dominant = field("dominant", { type: "enum", description: schema.defs.beat.properties.dominant?.description }, draft.dominant === undefined ? undefined : String(draft.dominant), (v) => put(draft, "dominant", v === undefined ? undefined : v === "stage" ? "stage" : Number(v)), { options: ["stage", ...list.map((_, i) => String(i))] });
    return group(t("beats.groups.devices"), ...cards, h("div", { class: "row" }, addSel, h("div", { style: "width:220px" }, dominant)));
  }

  function captionGroup(): HTMLElement {
    const cap: Dict = draft.caption ?? {};
    const commit = (): void => {
      if (Object.keys(cap).length) draft.caption = cap;
      else delete draft.caption;
    };
    const presets = Object.entries(schema.captionFamilies as Record<string, string[]>).flatMap(([fam, list]) => list.map((x) => `${x}`));
    const cdef = (schema.devices["text.caption"]?.params ?? {}) as Dict;
    const textParams = schema.text.params as Dict;
    const names = [...new Set([...Object.keys(cdef), ...Object.keys(textParams)])].filter((k) => k !== "preset");
    return group(
      t("beats.groups.caption"),
      h("div", { class: "hint muted small", style: "margin-bottom:6px" }, t("beats.captionHint")),
      fields(
        field("preset", { type: "enum", description: Object.entries(schema.captionFamilies).map(([f, l]) => `${f}: ${(l as string[]).join(", ")}`).join(" · ") }, cap.preset, (v) => {
          put(cap, "preset", v);
          commit();
        }, { options: presets }),
        ...names.map((name) => field(name, (cdef[name] ?? textParams[name]) as Dict, cap[name], (v) => {
          put(cap, name, v);
          commit();
        })),
      ),
    );
  }

  function lookGroup(): HTMLElement {
    const cam = draft.camera && typeof draft.camera === "object" ? draft.camera : draft.camera ? { preset: draft.camera } : {};
    const camCommit = (): void => {
      if (Object.keys(cam).length) draft.camera = cam;
      else delete draft.camera;
    };
    const tex = new Set(((draft.textures ?? []) as Dict[]).map((x) => x.id));
    const texChecks = (schema.textures as string[]).map((id) => {
      const cb = h("input", { type: "checkbox", checked: tex.has(id) });
      cb.onchange = () => {
        const list = ((draft.textures ?? []) as Dict[]).filter((x) => x.id !== id);
        if (cb.checked) list.push({ id });
        if (list.length) draft.textures = list;
        else delete draft.textures;
      };
      return h("label", { class: "check", style: "margin-right:10px" }, cb, id);
    });
    return group(
      t("beats.groups.look"),
      fields(
        field("tone", { type: "enum", values: schema.tones }, draft.tone, (v) => put(draft, "tone", v)),
        field("transition", { type: "enum", description: t("beats.transitionHint") }, draft.transition, (v) => put(draft, "transition", v), { options: schema.transitions }),
        field("sync", { type: "enum", values: schema.sync, description: t("beats.syncHint") }, draft.sync, (v) => put(draft, "sync", v)),
        field("camera.reason", { type: "enum", values: schema.cameraReasons, description: t("beats.cameraHint") }, cam.reason, (v) => {
          put(cam, "reason", v);
          camCommit();
        }),
        field("camera.preset", { type: "string" }, cam.preset, (v) => {
          put(cam, "preset", v);
          camCommit();
        }),
        field("camera.amplitude", { type: "number", min: 0, max: 2 }, cam.amplitude, (v) => {
          put(cam, "amplitude", v);
          camCommit();
        }),
        field("post", { type: "json", description: t("beats.postHint") }, draft.post, (v) => put(draft, "post", v)),
      ),
      h("div", { class: "field wide", style: "margin-top:8px" }, h("label", { class: "field-name" }, "textures"), h("div", null, texChecks)),
    );
  }

  function advancedGroup(): HTMLElement {
    return h("details", null, h("summary", { class: "muted small" }, t("beats.groups.advanced")), fields(field("sources", { type: "json" }, draft.sources, (v) => put(draft, "sources", v)), field("pad", { type: "json", default: [0.2, 0.4] }, draft.pad, (v) => put(draft, "pad", v)), field("seed", { type: "integer" }, draft.seed, (v) => put(draft, "seed", v)), field("background", { type: "json" }, draft.background, (v) => put(draft, "background", v))), h("div", { class: "field wide" }, h("label", { class: "field-name" }, t("beats.rawJson")), jsonInput(draft, (v) => {
      if (v && typeof v === "object") {
        for (const k of Object.keys(draft)) delete draft[k];
        Object.assign(draft, v);
      }
    })));
  }

  function drawSide(): void {
    const out = h("div");
    const jobBox = h("div");
    const preview = async (): Promise<void> => {
      try {
        const job = await api(`/api/projects/${id}/beats/${encodeURIComponent(beat.id)}/preview`, { method: "POST" });
        clear(out, h("div", { class: "muted small" }, t("beats.previewRunning")));
        mountJob(jobBox, job.id, (j) => {
          const r = j.result ?? {};
          clear(out, r.mp4 ? h("video", { src: r.mp4, controls: true, autoplay: true, loop: true, muted: true }) : r.sheet ? h("img", { src: r.sheet }) : h("div", { class: "banner err" }, t("beats.previewFailed")));
        });
      } catch (err) {
        fail(err);
      }
    };
    const rebuild = async (): Promise<void> => {
      if (!(await confirmBox(t("beats.rebuildTitle"), t("beats.rebuildText")))) return;
      try {
        const job = await api(`/api/projects/${id}/beats/${encodeURIComponent(beat.id)}/rebuild`, { method: "POST" });
        mountJob(jobBox, job.id, (j) => toast(j.status === "ok" ? t("build.done") : t("build.failed"), j.status === "ok" ? "ok" : "err"));
      } catch (err) {
        fail(err);
      }
    };
    const revoice = async (): Promise<void> => {
      try {
        const v = await api(`/api/projects/${id}/beats/${encodeURIComponent(beat.id)}/voice`);
        const left = v.budget.left === null ? "∞" : v.budget.left;
        const text = h("div", { class: "stack" }, h("div", null, t("beats.revoiceProvider", { p: v.provider })), h("div", null, t("beats.revoiceCost", { n: v.chars, left, budget: v.budget.budget ?? "∞" })), v.budget.left !== null ? h("div", { class: "meter" }, h("div", { style: `width:${Math.min(100, (100 * (v.budget.budget - v.budget.left)) / Math.max(1, v.budget.budget))}%` })) : null, h("div", { class: "muted small" }, t("beats.revoiceNote")));
        if (!(await confirmBox(t("beats.revoiceTitle", { id: beat.id }), text, t("beats.revoiceGo", { n: v.chars })))) return;
        const job = await api(`/api/projects/${id}/beats/${encodeURIComponent(beat.id)}/revoice`, { method: "POST" });
        mountJob(jobBox, job.id, (j) => toast(j.status === "ok" ? t("build.done") : t("build.failed"), j.status === "ok" ? "ok" : "err"));
      } catch (err) {
        fail(err);
      }
    };
    clear(side, h("div", { class: "row" }, h("button", { class: "btn primary", onclick: preview }, t("beats.preview")), h("button", { class: "btn", onclick: rebuild }, t("beats.rebuild")), h("button", { class: "btn", onclick: revoice }, t("beats.revoice"))), h("div", { class: "muted small" }, t("beats.previewHint")), out, jobBox);
  }

  async function move(dir: number): Promise<void> {
    try {
      await api(`/api/projects/${id}/beats/${encodeURIComponent(beat.id)}/move`, { body: { dir } });
      reload();
    } catch (err) {
      fail(err);
    }
  }

  async function remove(): Promise<void> {
    if (!(await confirmBox(t("beats.removeTitle", { id: beat.id }), t("beats.removeText"), t("beats.remove"), "danger"))) return;
    try {
      await api(`/api/projects/${id}/beats/${encodeURIComponent(beat.id)}`, { method: "DELETE" });
      reload();
    } catch (err) {
      fail(err);
    }
  }

  if (reopen.has(beat.id)) {
    details.open = true;
    drawn = true;
    drawEditor();
    drawSide();
  }
  return details;
}
