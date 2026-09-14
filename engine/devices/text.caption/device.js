/* text.caption — engine/devices/text.caption/device.js: the captions of a video as a device (engine/scenes/CONTRACT.md,
   «Текст на экране»). The build (engine/src/captions.ts) groups the words of the voice (word | phrase | line), resolves
   the style of every group — look.captions ← video.json captions ← the beat's caption — and writes
   compositions/captions.html, whose script calls

       HygenCaptions.mount(tl, CFG);

   CFG: duration, seed, colors {hex, rgb}, fonts {display, body}, groups: [{i, beat, start, end, words: [{text, start, end}],
   style: {preset, activeWord, type, font, fontFamily, weight, fontSize, textTransform, color, active, onActive, dim,
   background, position, maxWidth}, band: {x, top, bottom, align}, camera: null | {camera, beat}}].

   Every group gets a host (its band, placed by the build), a full-width row and a box; the preset of the group
   (engine/devices/text.caption/presets/<name>.js) builds its words in the box:

       HygenCaptions.define("pill-karaoke", { family, origin, owns: {background, active, entrance}, mount: function (api, g) {…} });

   The runtime then draws the shared background (text.js), the active-word mode and the entrance unless the preset owns
   them, and shows the host from g.start to g.end — a preset never touches the host's opacity.
   api: tl, cfg, g, host, row, box, C, RGB, F, rand(), id(suffix), el(tag, attrs, parent), svg(tag, attrs, parent),
   show(node, at, dur, from), hide(node, at, dur), font(weight, size), measure(text, font), words(parent) → spans,
   active(spans), enter(node, t, type), drive(fn(t)), canvas() → {ctx, scale, el}.
   Rules (TRAPS.md): property tweens and tl.set only, a baseline tl.set at 0 before repeated fromTo; anything computed per
   frame goes through api.drive — ONE driver for the whole video calls fn(t), a pure function of the time; no Math.random,
   Date.now, timers, network, WebGL. */
(function () {
  "use strict";
  if (window.HygenCaptions) return;
  var SVGNS = "http://www.w3.org/2000/svg";
  var presets = {};

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function setAttrs(node, attrs) {
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] === undefined || attrs[k] === null) continue;
      if (k === "text") node.textContent = attrs[k];
      else if (k === "style" && typeof attrs[k] === "object") for (var s in attrs[k]) node.style[s] = attrs[k][s];
      else node.setAttribute(k, attrs[k]);
    }
    return node;
  }

  var measureCtx = null;
  function measure(text, font) {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  }

  /** Words → line ends: one line when it fits, else the most balanced split into two. */
  function lineEnds(texts, font, maxWidth, gap, upper) {
    var widths = texts.map(function (w) { return measure(upper ? w.toUpperCase() : w, font) * 1.1; });
    var width = function (a, b) {
      var s = 0;
      for (var i = a; i < b; i++) s += widths[i] + (i > a ? gap : 0);
      return s;
    };
    if (texts.length < 2 || width(0, texts.length) <= maxWidth) return { ends: [texts.length], widest: width(0, texts.length) };
    var best = 1, bestD = Infinity;
    for (var k = 1; k < texts.length; k++) {
      var a = width(0, k), b = width(k, texts.length);
      var d = (Math.max(0, a - maxWidth) + Math.max(0, b - maxWidth)) * 10 + Math.abs(a - b);
      if (d < bestD) { bestD = d; best = k; }
    }
    return { ends: [best, texts.length], widest: Math.max(width(0, best), width(best, texts.length)) };
  }

  function activeWord(api, spans) {
    var g = api.g, s = g.style, tl = api.tl, mode = s.activeWord;
    if (!mode || mode === "none" || spans.length < 2) return;
    spans.forEach(function (sp, i) {
      var w = g.words[i], next = g.words[i + 1];
      if (!w) return;
      var on = Math.max(g.start, w.start);
      var off = next ? Math.max(on + 0.04, Math.min(g.end, next.start)) : g.end;
      var len = Math.max(0.08, Math.min(0.24, w.end - w.start));
      if (mode === "color") {
        tl.set(sp, { color: s.dim }, 0);
        tl.set(sp, { color: s.active }, on);
        if (next) tl.set(sp, { color: s.color }, off);
      } else if (mode === "scale") {
        tl.set(sp, { scale: 1, color: s.color }, 0);
        tl.fromTo(sp, { scale: 1 }, { scale: 1.16, duration: 0.12, ease: "power2.out", immediateRender: false }, on);
        tl.set(sp, { color: s.active }, on);
        if (next) {
          tl.fromTo(sp, { scale: 1.16 }, { scale: 1, duration: 0.14, ease: "power2.inOut", immediateRender: false }, off);
          tl.set(sp, { color: s.color }, off);
        }
      } else if (mode === "weight") {
        tl.set(sp, { fontWeight: 400, color: s.dim }, 0);
        tl.set(sp, { fontWeight: 800, color: s.color }, on);
        if (next) tl.set(sp, { fontWeight: 600 }, off);
      } else if (mode === "highlight-sweep") {
        sp.style.isolation = "isolate";
        var mark = api.el("span", { "class": "hy-mark", style: { position: "absolute", left: "-0.14em", right: "-0.14em", top: "0.04em", bottom: "0em", borderRadius: "0.16em", backgroundColor: s.active, transformOrigin: "0% 50%", zIndex: "-1" } }, sp);
        tl.set(mark, { scaleX: 0, opacity: 1 }, 0);
        tl.set(sp, { color: s.color }, 0);
        tl.fromTo(mark, { scaleX: 0 }, { scaleX: 1, duration: len, ease: "power2.out", immediateRender: false }, on);
        tl.set(sp, { color: s.onActive }, on);
        if (next) {
          tl.fromTo(mark, { opacity: 1 }, { opacity: 0, duration: 0.1, ease: "none", immediateRender: false }, off);
          tl.set(sp, { color: s.color }, off);
        }
      } else if (mode === "underline") {
        var bar = api.el("span", { "class": "hy-ul", style: { position: "absolute", left: "0em", right: "0em", bottom: "-0.02em", height: "0.08em", borderRadius: "0.04em", backgroundColor: s.active, transformOrigin: "0% 50%" } }, sp);
        tl.set(bar, { scaleX: 0, opacity: 1 }, 0);
        tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: len, ease: "power2.out", immediateRender: false }, on);
        if (next) tl.fromTo(bar, { opacity: 1 }, { opacity: 0, duration: 0.1, ease: "none", immediateRender: false }, off);
      }
    });
  }

  function makeApi(tl, CFG, g, parts) {
    var s = g.style;
    var api = {
      tl: tl, cfg: CFG, g: g, host: parts.host, row: parts.row, box: parts.box,
      C: CFG.colors.hex, RGB: CFG.colors.rgb, F: CFG.fonts,
      rand: mulberry32((CFG.seed + 1) * 7919 + g.i * 104729),
      spans: [],
      id: function (suffix) { return "cap-g" + g.i + "-" + suffix; },
      el: function (tag, attrs, parent) {
        var n = setAttrs(document.createElement(tag), attrs || {});
        (parent || api.box).appendChild(n);
        return n;
      },
      svg: function (tag, attrs, parent) {
        var n = setAttrs(document.createElementNS(SVGNS, tag), attrs || {});
        if (parent !== false) (parent || api.box).appendChild(n);
        return n;
      },
      show: function (node, at, dur, from) {
        tl.set(node, { opacity: 0 }, 0);
        tl.fromTo(node, Object.assign({ opacity: 0 }, from || {}), { opacity: 1, x: 0, y: 0, scale: 1, duration: dur || 0.3, ease: "power2.out", immediateRender: false }, at);
      },
      hide: function (node, at, dur) {
        tl.to(node, { opacity: 0, duration: dur || 0.25, ease: "power2.in" }, at);
      },
      font: function (weight, size) { return (weight || s.weight) + " " + (size || s.fontSize) + "px " + s.fontFamily; },
      measure: measure,
      /** Spans of the group's words in ≤ 2 lines; a group too wide for two lines shrinks down to 70 %. */
      words: function (parent) {
        parent = parent || api.box;
        var texts = g.words.map(function (w) { return w.text; });
        var upper = s.textTransform === "uppercase";
        var size = s.fontSize, lay = null;
        for (var k = 0; k < 6; k++) {
          lay = lineEnds(texts, api.font(null, size), s.maxWidth - 40, size * 0.26, upper);
          if (lay.widest <= s.maxWidth - 40 || size <= s.fontSize * 0.7) break;
          size = Math.round(size * 0.92);
        }
        if (size !== s.fontSize) parent.style.fontSize = size + "px";
        var spans = [], from = 0;
        lay.ends.forEach(function (end) {
          var line = api.el("div", { "class": "hy-cl", style: { display: "flex", flexWrap: "nowrap", justifyContent: "center", alignItems: "baseline", columnGap: "0.26em", whiteSpace: "nowrap" } }, parent);
          for (var q = from; q < end; q++) spans.push(api.el("span", { "class": "hy-cw", text: texts[q], style: { display: "inline-block", position: "relative" } }, line));
          from = end;
        });
        api.spans = spans;
        return spans;
      },
      active: function (spans) { activeWord(api, spans); },
      enter: function (node, t, type) { return window.HygenText.enter(tl, node, t, type || s.type, { heroRgb: api.RGB.hero }); },
      drive: function (fn) { parts.shared.drivers.push(fn); },
      canvas: function () { return parts.shared.canvas(); },
      /** mix-blend-mode of the whole captions layer while the group shows: a blend inside the layer only sees the
          layer's own transparency (the host is an isolated group at z 35 — TRAPS.md). */
      blend: function (mode) {
        var layer = parts.shared.layer();
        if (!layer) return false;
        tl.set(layer, { mixBlendMode: mode }, g.start);
        tl.set(layer, { mixBlendMode: "normal" }, g.end);
        return true;
      }
    };
    return api;
  }

  function mountGroup(tl, CFG, stage, g, shared) {
    var def = presets[g.style.preset];
    if (!def) throw new Error("hygen: пресет субтитров «" + g.style.preset + "» не загружен (engine/devices/text.caption/presets/" + g.style.preset + ".js)");
    var s = g.style, b = g.band;
    var host = setAttrs(document.createElement("div"), { id: "cap-g" + g.i, "class": "hy-cg", style: {
      position: "absolute", left: "0px", top: b.top + "px", width: "1080px", height: Math.max(40, b.bottom - b.top) + "px",
      display: "flex", flexDirection: "column", alignItems: "stretch", pointerEvents: "none", opacity: "0",
      justifyContent: b.align === "start" ? "flex-start" : b.align === "center" ? "center" : "flex-end"
    } });
    stage.appendChild(host);
    var row = setAttrs(document.createElement("div"), { "class": "hy-cr", style: { position: "relative", width: "1080px", textAlign: "center" } });
    if (b.x !== 540) row.style.translate = (b.x - 540).toFixed(1) + "px 0px";
    host.appendChild(row);
    var box = setAttrs(document.createElement("div"), { "class": "hy-cb", style: {
      position: "relative", display: "inline-block", maxWidth: s.maxWidth + "px", textAlign: "center", verticalAlign: "bottom",
      fontFamily: s.fontFamily, fontWeight: String(s.weight), fontSize: s.fontSize + "px", lineHeight: "1.14",
      letterSpacing: "-0.005em", color: s.color, textTransform: s.textTransform
    } });
    row.appendChild(box);
    var api = makeApi(tl, CFG, g, { host: host, row: row, box: box, shared: shared });
    def.mount(api, g);
    var owns = def.owns || {};
    // ink: a preset that paints its own letters (neon, white blend) says so; otherwise the style colour decides
    if (!owns.background) window.HygenText.background(box, s.background, { RGB: api.RGB, C: api.C, row: row, ink: def.ink, text: s.color });
    if (!owns.active) activeWord(api, api.spans.length ? api.spans : Array.prototype.slice.call(box.querySelectorAll(".hy-cw")));
    if (!owns.entrance && s.type && s.type !== "none") api.enter(box, g.start, s.type);
    tl.set(host, { opacity: 0 }, 0);
    tl.set(host, { opacity: 1 }, g.start);
    tl.set(host, { opacity: 0 }, g.end);
    if (g.camera) {
      var cam = g.camera;
      shared.drivers.push(function (t) {
        if (!window.HygenMotion || t < g.start - 0.05 || t > g.end + 0.05) return;
        var cs = window.HygenMotion.camera(cam.camera, t, cam.beat, CFG.seed);
        host.style.translate = cs.x.toFixed(2) + "px " + cs.y.toFixed(2) + "px";
        host.style.scale = cs.s.toFixed(4);
        host.style.rotate = cs.r.toFixed(3) + "deg";
      });
    }
  }

  window.HygenCaptions = {
    define: function (name, def) { presets[name] = def; },
    has: function (name) { return !!presets[name]; },
    get: function (name) { return presets[name]; },
    names: function () { return Object.keys(presets).sort(); },
    util: { mulberry32: mulberry32, measure: measure, lineEnds: lineEnds, SVGNS: SVGNS },
    mount: function (tl, CFG) {
      var stage = document.getElementById(CFG.stage || "cap-stage");
      var ctx = null, canvasEl = null, layerEl = null;
      var shared = {
        drivers: [],
        layer: function () {
          if (!layerEl) {
            layerEl = document.getElementById(CFG.layer || "el-captions");
            if (layerEl) tl.set(layerEl, { mixBlendMode: "normal" }, 0);
          }
          return layerEl;
        },
        canvas: function () {
          if (!ctx) {
            canvasEl = document.createElement("canvas");
            canvasEl.id = "cap-canvas";
            canvasEl.width = 540;
            canvasEl.height = 960;
            canvasEl.style.cssText = "position:absolute;left:0;top:0;width:1080px;height:1920px;pointer-events:none;z-index:5";
            stage.appendChild(canvasEl);
            ctx = canvasEl.getContext("2d");
          }
          return { ctx: ctx, scale: 0.5, el: canvasEl };
        }
      };
      for (var i = 0; i < CFG.groups.length; i++) mountGroup(tl, CFG, stage, CFG.groups[i], shared);
      if (shared.drivers.length || ctx) {
        var clock = { t: 0 };
        tl.fromTo(clock, { t: 0 }, {
          t: CFG.duration, duration: CFG.duration, ease: "none",
          onUpdate: function () {
            if (ctx) ctx.clearRect(0, 0, 540, 960);
            for (var k = 0; k < shared.drivers.length; k++) shared.drivers[k](clock.t);
          }
        }, 0);
      }
      tl.to({}, { duration: CFG.duration }, 0);
    }
  };
})();
