/* hygen text — library/devices/text.js: the shared text schema (library/devices/text.schema.json) of every text on screen —
   text.title, text.quote, annotate.label, text.caption, text.kinetic: type (one of the eight entrances of
   library/motion/type.json), font, size, case, color, background, position. Bundled first into assets/hygen/devices.js
   (stage beats) and assets/hygen/captions.js (the captions layer); the build puts the schema's scales and bands into
   window.HygenTextSchema right before this file. Entrances are property tweens and tl.set on the paused timeline with
   a baseline at 0: any seek shows the same pixels (TRAPS.md). */
(function () {
  "use strict";
  if (window.HygenText) return;
  var SCHEMA = window.HygenTextSchema || { scales: {}, bands: {} };
  var LEGACY = { headline: 120, title: 72, label: 32, large: 76, medium: 60 };

  /** px of s | m | l | xl on the device's scale; legacy names (headline, title, label, large, medium) keep their old sizes. */
  function px(kind, size, sizes) {
    var scale = SCHEMA.scales[kind] || SCHEMA.scales.title || {};
    if (scale[size]) return scale[size];
    if (sizes && typeof sizes[size] === "number") return sizes[size];
    return LEGACY[size] || scale.m || 72;
  }

  /** text | accent | secondary | cold | any palette token | #RRGGBB → #RRGGBB. */
  function color(C, v, fallback) {
    if (typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v)) return v;
    if (v === "secondary" || v === "cold") return C.cold;
    return C[v] || C[fallback || "text"] || C.text;
  }
  function rgb(hex) {
    return [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); }).join(",");
  }
  function lum(hex) {
    var c = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  /** The palette colour that reads best on bg. */
  function ink(C, bg) {
    var best = C.text, bc = 0;
    ["night", "text", "white", "black"].forEach(function (k) {
      if (!C[k]) return;
      var c = contrast(C[k], bg);
      if (c > bc) { bc = c; best = C[k]; }
    });
    return best;
  }

  /** font, size, case and colour of the schema onto a node; returns the px size. */
  function apply(node, P, o) {
    var size = px(o.kind, P.size, o.sizes);
    node.style.fontFamily = P.font === "display" ? o.F.display : o.F.body;
    node.style.fontWeight = String(o.weight || (P.font === "display" ? 600 : 700));
    node.style.fontSize = size + "px";
    node.style.textTransform = P["case"] === "upper" ? "uppercase" : "none";
    node.style.color = color(o.C, P.color, o.fallback || "text");
    return size;
  }

  /**
   * Background of the schema in the look's colours: none (a soft shadow), pill, bar (the full row), blur (≤ 24 px), wash.
   * The shade goes against the ink: light letters get a dark shade, dark letters a light one — on a light look `night` is
   * the paper, and a wash of paper under light neon made it unreadable (TRAPS.md). o.ink: "light" | "dark" | undefined (from o.text).
   */
  function background(box, mode, o) {
    var RGB = o.RGB, C = o.C;
    var ink = o.ink || (o.text && /^#[0-9A-Fa-f]{6}$/.test(o.text) ? (lum(o.text) > 0.35 ? "light" : "dark") : "light");
    var nightLum = C && C.night ? lum(C.night) : 0;
    var planeLum = C && C.plane ? lum(C.plane) : 0;
    var shadeRgb = ink === "light" ? (nightLum < 0.2 ? RGB.night : RGB.black || RGB.night) : (nightLum > 0.6 ? RGB.night : RGB.white || RGB.text);
    var plateRgb = ink === "light" ? (planeLum < 0.2 ? RGB.plane : RGB.black || RGB.plane) : (planeLum > 0.6 ? RGB.plane : RGB.white || RGB.plane);
    var s = box.style, shade = "rgba(" + shadeRgb + ",";
    o = { RGB: { night: shadeRgb, plane: plateRgb }, row: o.row, radius: o.radius };
    s.textShadow = "0 0.04em 0.3em " + shade + "0.72), 0 0 0.1em " + shade + "0.5)";
    if (!mode || mode === "none") return;
    if (mode === "pill") {
      s.textShadow = "none";
      s.backgroundColor = "rgba(" + o.RGB.plane + ",0.9)";
      s.borderRadius = "0.4em";
      s.padding = "0.12em 0.48em 0.18em";
    } else if (mode === "bar") {
      s.textShadow = "none";
      var bar = o.row || box;
      bar.style.backgroundColor = shade + "0.82)";
      bar.style.paddingTop = "0.14em";
      bar.style.paddingBottom = "0.2em";
    } else if (mode === "blur") {
      s.backdropFilter = "blur(" + Math.min(24, o.radius || 22) + "px)";
      s.backgroundColor = shade + "0.3)";
      s.borderRadius = "0.36em";
      s.padding = "0.1em 0.42em 0.16em";
    } else if (mode === "wash") {
      s.backgroundColor = shade + "0.46)";
      s.boxShadow = "0 0 1.1em 0.8em " + shade + "0.46)";
      s.borderRadius = "0.8em";
    }
  }

  /** Words of a node → nowrap word spans of inline-block characters (roll: each character clipped for a drum roll). */
  function chars(node, roll) {
    var out = [];
    (function walk(n) {
      var kids = Array.prototype.slice.call(n.childNodes);
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k.nodeType === 3) {
          var parts = k.nodeValue.split(/(\s+)/), frag = document.createDocumentFragment();
          for (var p = 0; p < parts.length; p++) {
            var part = parts[p];
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
            var word = document.createElement("span");
            word.className = "hy-wd";
            word.style.display = "inline-block";
            word.style.whiteSpace = "nowrap";
            for (var c = 0; c < part.length; c++) {
              var o = document.createElement("span");
              o.className = "hy-ch";
              o.style.display = "inline-block";
              o.style.whiteSpace = "pre";
              if (roll) o.style.clipPath = "inset(-0.08em -0.3em 0 -0.3em)";
              var inner = document.createElement("span");
              inner.style.display = "inline-block";
              inner.textContent = part[c];
              o.appendChild(inner);
              word.appendChild(o);
              out.push(o);
            }
            frag.appendChild(word);
          }
          n.replaceChild(frag, k);
        } else if (k.nodeType === 1 && !/\bhy-(ch|wd|mark|ul)\b/.test(k.getAttribute("class") || "")) {
          walk(k);
        }
      }
    })(node);
    return out;
  }

  /** One of the eight entrances at t (seconds of the timeline). Returns false for none. */
  function enter(tl, node, t, type, o) {
    o = o || {};
    if (!type || type === "none") return false;
    var i, list;
    if (type === "pop") {
      tl.set(node, { opacity: 0, scale: 0.4 }, 0);
      tl.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.11, ease: "none", immediateRender: false }, t);
      tl.fromTo(node, { scale: 0.4 }, { scale: 1, duration: 0.45, ease: "back.out(2)", immediateRender: false }, t);
    } else if (type === "slide") {
      tl.set(node, { opacity: 0, x: -90 }, 0);
      tl.fromTo(node, { opacity: 0, x: -90 }, { opacity: 1, x: 0, duration: 0.55, ease: "power3.out", immediateRender: false }, t);
    } else if (type === "mask-wipe") {
      tl.set(node, { clipPath: "inset(-25% 100% -25% -6%)" }, 0);
      tl.fromTo(node, { clipPath: "inset(-25% 100% -25% -6%)" }, { clipPath: "inset(-25% -8% -25% -6%)", duration: 0.6, ease: "power2.inOut", immediateRender: false }, t);
    } else if (type === "glow-pulse") {
      var hero = o.heroRgb || "255,255,255";
      tl.set(node, { opacity: 0 }, 0);
      tl.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out", immediateRender: false }, t);
      tl.fromTo(node, { textShadow: "0 0 56px rgba(" + hero + ",0.95)" }, { textShadow: "0 0 18px rgba(" + hero + ",0.3)", duration: 0.9, ease: "power2.out", immediateRender: false }, t);
    } else if (type === "stagger") {
      list = o.chars || chars(node);
      for (i = 0; i < list.length; i++) {
        tl.set(list[i], { opacity: 0, y: -46, rotation: -14 }, 0);
        tl.fromTo(list[i], { opacity: 0, y: -46, rotation: -14 }, { opacity: 1, y: 0, rotation: 0, duration: 0.42, ease: "power3.out", immediateRender: false }, t + i * 0.05);
      }
    } else if (type === "typewriter") {
      list = o.chars || chars(node);
      for (i = 0; i < list.length; i++) {
        tl.set(list[i], { opacity: 0 }, 0);
        tl.set(list[i], { opacity: 1 }, t + i * 0.06);
      }
    } else if (type === "split-reveal") {
      tl.set(node, { clipPath: "inset(50% -12% 50% -12%)" }, 0);
      tl.fromTo(node, { clipPath: "inset(50% -12% 50% -12%)" }, { clipPath: "inset(-10% -12% -10% -12%)", duration: 0.55, ease: "power3.out", immediateRender: false }, t);
      list = o.chars || chars(node);
      for (i = 0; i < list.length; i++) {
        var dy = (i % 2 ? 1 : -1) * 40;
        tl.set(list[i], { y: dy }, 0);
        tl.fromTo(list[i], { y: dy }, { y: 0, duration: 0.55, ease: "power3.out", immediateRender: false }, t + i * 0.02);
      }
    } else if (type === "count-roll") {
      list = o.chars || chars(node, true);
      for (i = 0; i < list.length; i++) {
        var inner = list[i].firstChild;
        tl.set(inner, { yPercent: 105 }, 0);
        tl.fromTo(inner, { yPercent: 105 }, { yPercent: 0, duration: 0.5, ease: "power3.out", immediateRender: false }, t + i * 0.06);
      }
    } else {
      return false;
    }
    return true;
  }

  /** Band of a position without an own area (text.schema.json → bands): {top, bottom, align, maxWidth} in px. */
  function band(position) {
    var b = SCHEMA.bands[position] || SCHEMA.bands.center || { top: 700, bottom: 1220, align: "center", maxWidth: 840 };
    return { top: b.top, bottom: b.bottom, align: b.align, maxWidth: b.maxWidth };
  }

  window.HygenText = { px: px, color: color, rgb: rgb, lum: lum, contrast: contrast, ink: ink, apply: apply, background: background, chars: chars, enter: enter, band: band, schema: SCHEMA };
})();
