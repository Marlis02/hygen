/* hygen devices runtime — engine/devices/runtime.js, bundled with engine/stage/runtime.js and every
   engine/devices/<type>/device.js into build/assets/hygen/devices.js (engine/src/devices.ts → installDevices).

   A stage beat (engine/scenes/CONTRACT.md, «Бит v2») is one sub-composition built by the engine: the stage
   (media | split | map | color) and 0–3 devices over it, on fixed z-layers stage → focus → data → annotate → text.
   Its script calls, in this order:

       HygenStage.mount(tl, cfg);     // engine/stage/runtime.js: the base of the frame
       HygenDevices.mount(tl, cfg);   // every device of the beat, in the order of cfg.devices

   A device module registers one mount function:

       HygenDevices.define("annotate.measure", function (api, dev) { … });

   dev (resolved by the build, engine/src/devices.ts):
     type, index, at (s, beat-local), until (s or null — the device leaves), params (device.json defaults merged),
     box {x, y, w, h} (px of the 1080×1920 frame, or null), point {x, y} (px: centre of box or the given point),
     word (target given as a word of the line, or null), explains (string or null), dominant (bool)
   api:
     tl, cfg, dur — the beat timeline (seconds inside the beat), config, beat duration
     C, RGB — palette of the beat's tone: C.hero "#RRGGBB", RGB.hero "r,g,b" (night, ground, text, muted, hero,
              heroDeep, heroHot, heroLight, accent, cold, ashLight …); color(tokenOrHex) → "#RRGGBB"
     F — fonts: F.display, F.body (CSS stacks); sizes — style sizes (title 72, label 32 …)
     layer — the device's z-layer element; stageEl — the stage element (for spotlight copies)
     id(suffix) → unique element id; el(tag, attrs, parent) / svg(tag, attrs, parent) → new element
     rand() — seeded PRNG of this device (mulberry32); show(el, at, dur) / hide(el, at, dur) — seek-safe fades
     draw(path, at, dur, ease) — stroke draw-on by dashoffset (length measured once at mount)
   Rules (TRAPS.md): only property tweens on tl at dev.at; a baseline tl.set at 0 before repeated fromTo; anything
   written from onUpdate is driven by ONE full-span tween (0 → dur, ease none) and computed from its time; no
   Math.random, Date.now, timers, network, WebGL. */
(function () {
  "use strict";
  if (window.HygenDevices) return;
  var SVGNS = "http://www.w3.org/2000/svg";
  var defs = {};
  var LAYERS = ["focus", "data", "annotate", "text"];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function setAttrs(node, attrs, isSvg) {
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] === undefined || attrs[k] === null) continue;
      if (k === "text") node.textContent = attrs[k];
      else if (k === "style" && typeof attrs[k] === "object") for (var s in attrs[k]) node.style[s] = attrs[k][s];
      else if (k === "class") node.setAttribute(isSvg ? "class" : "class", attrs[k]);
      else node.setAttribute(k, attrs[k]);
    }
    return node;
  }

  function makeApi(tl, cfg, dev) {
    var prefix = cfg.prefix + "-d" + dev.index;
    var api = {
      tl: tl, cfg: cfg, dur: cfg.duration,
      C: cfg.colors.hex, RGB: cfg.colors.rgb, F: cfg.fonts, sizes: cfg.sizes,
      layer: document.getElementById(cfg.prefix + "-L-" + (cfg.layerOf[dev.type] || "annotate")),
      stageEl: document.getElementById(cfg.prefix + "-stage"),
      id: function (suffix) { return prefix + "-" + suffix; },
      el: function (tag, attrs, parent) {
        var n = setAttrs(document.createElement(tag), attrs || {}, false);
        (parent || api.layer).appendChild(n);
        return n;
      },
      svg: function (tag, attrs, parent) {
        var n = setAttrs(document.createElementNS(SVGNS, tag), attrs || {}, true);
        if (parent !== false) (parent || api.layer).appendChild(n);
        return n;
      },
      rand: mulberry32((cfg.seed + 1) * 7919 + dev.index * 104729),
      color: function (v, fallback) {
        if (typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v)) return v;
        return cfg.colors.hex[v] || cfg.colors.hex[fallback || "hero"];
      },
      rgb: function (v, fallback) {
        var hex = api.color(v, fallback);
        return [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); }).join(",");
      },
      show: function (node, at, dur, from) {
        tl.set(node, { opacity: 0 }, 0);
        tl.fromTo(node, Object.assign({ opacity: 0 }, from || {}), { opacity: 1, x: 0, y: 0, scale: 1, duration: dur || 0.35, ease: "power2.out", immediateRender: false }, at);
      },
      hide: function (node, at, dur) {
        tl.to(node, { opacity: 0, duration: dur || 0.3, ease: "power2.in" }, at);
      },
      draw: function (path, at, dur, ease) {
        var len = Math.max(1, path.getTotalLength ? path.getTotalLength() : 1000);
        path.style.strokeDasharray = len + " " + len;
        tl.set(path, { strokeDashoffset: len }, 0);
        tl.fromTo(path, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: dur || 0.6, ease: ease || "power2.inOut", immediateRender: false }, at);
        return len;
      }
    };
    return api;
  }

  window.HygenDevices = {
    define: function (type, mount) { defs[type] = mount; },
    has: function (type) { return !!defs[type]; },
    util: { mulberry32: mulberry32, SVGNS: SVGNS, LAYERS: LAYERS },
    mount: function (tl, cfg) {
      for (var i = 0; i < cfg.devices.length; i++) {
        var dev = cfg.devices[i];
        var fn = defs[dev.type];
        if (!fn) throw new Error("hygen: устройство " + dev.type + " не загружено (engine/devices/" + dev.type + "/device.js)");
        var api = makeApi(tl, cfg, dev);
        fn(api, dev);
        if (dev.until !== null && dev.until !== undefined) {
          var nodes = api.layer.querySelectorAll('[id^="' + cfg.prefix + "-d" + dev.index + '-"]');
          for (var j = 0; j < nodes.length; j++) if (nodes[j].parentNode === api.layer) api.hide(nodes[j], dev.until, 0.3);
        }
      }
    }
  };
})();
