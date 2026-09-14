/* text.kinetic — letters as the main object of the frame (engine/devices/text.kinetic/device.json). Twelve modes.
   Own: stack, extrude, weight-morph (variable Archivo: font-weight 100–900 × font-stretch 62–125 %), outline, tilt, marquee.
   Ports of the registry: texture (texture-mask-text — a luminance mask cuts the letters), scramble (caption-matrix-decode),
   slam (caption-kinetic-slam), center-build (kinetic-center-build — the line re-centres as words arrive), type-swap
   (kinetic-type-swap — a fixed line, only the slot cuts), behind-subject (the build cuts the stage picture with
   `hyperframes remove-background`, the cutout lies over the word; the word drifts as in caption-parallax-layers).
   Timing: sync voice — steps of `step` from dev.at; sync music / both — dev.grid.beats after at (the build snapped at).
   Property tweens and tl.set on the beat timeline, a baseline at 0 before repeated fromTo; scramble — one full-span driver. */
HygenDevices.define("text.kinetic", function (api, dev) {
  var P = dev.params, tl = api.tl, T = window.HygenText, at = dev.at, D = api.dur;
  var end = dev.until !== null && dev.until !== undefined ? dev.until : D;
  var mode = P.mode || "stack";
  var upper = P["case"] !== "normal";
  var text = String(P.text || dev.word || "").trim();
  if (upper) text = text.toUpperCase();
  var col = T.color(api.C, P.color, "text");
  var hero = api.C.hero;
  var variable = mode === "weight-morph";
  var fam = variable ? "'Archivo Variable', " + api.F.body : P.font === "display" ? api.F.display : api.F.body;
  var weight = variable ? 500 : P.font === "display" ? 700 : 800;
  var area = dev.box || (P.position === "top" ? { x: 70, y: 180, w: 940, h: 700 } : P.position === "bottom" ? { x: 70, y: 700, w: 940, h: 700 } : { x: 70, y: 430, w: 940, h: 920 });
  var cx = area.x + area.w / 2, cy = area.y + area.h / 2;
  var shade = "rgba(" + api.RGB.night + ",";
  var size = T.px("kinetic", P.size, api.sizes);

  // beats of the device: music / both — the grid after at; voice — a steady step
  var beats = ((dev.grid && dev.grid.beats) || []).filter(function (b) { return b >= at - 0.01 && b < end - 0.05; });
  var period = beats.length > 1 ? beats[1] - beats[0] : P.step;
  function times(n, step) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(beats.length ? (i < beats.length ? beats[i] : beats[beats.length - 1] + (i - beats.length + 1) * period) : at + i * step);
    return out.map(function (t) { return Math.min(t, end - 0.15); });
  }
  var mctx = document.createElement("canvas").getContext("2d");
  function measure(s, px, wgt, family) { mctx.font = (wgt || weight) + " " + px + "px " + (family || fam); return mctx.measureText(s).width; }
  /** The size of the scale that keeps s inside maxW (fonts may still load at mount: 8 % reserve). */
  function fit(s, maxW, px, stretch) {
    var w = measure(s, px) * 1.08 * (stretch || 1);
    return w > maxW ? Math.max(36, Math.floor((px * maxW) / w)) : px;
  }
  function node(tag, style, parent, txt) {
    var n = api.el(tag, { style: style }, parent);
    if (txt !== undefined) n.textContent = txt;
    // copies of the same word lie over each other on purpose (extrude depth, stack rows, tilt layers)
    n.setAttribute("data-layout-allow-overlap", "");
    // an outline row has a transparent fill by design — not an unpainted text for `check`
    if (style && style.color === "transparent") n.setAttribute("data-layout-ignore", "");
    return n;
  }
  function baseStyle(px, extra) {
    var s = { fontFamily: fam, fontWeight: String(weight), fontSize: px + "px", lineHeight: "0.92", letterSpacing: "-0.02em", whiteSpace: "nowrap", color: col };
    for (var k in extra || {}) s[k] = extra[k];
    return s;
  }
  function stroke(px) { return Math.max(2, Math.round(px * 0.022)) + "px " + col; }
  function entrance(el, t, fallback) {
    if (P.type && P.type !== "none") return T.enter(tl, el, t, P.type, { heroRgb: api.RGB.hero });
    tl.set(el, fallback.from, 0);
    tl.fromTo(el, fallback.from, Object.assign({ duration: 0.5, ease: "power3.out", immediateRender: false }, fallback.to), t);
    return true;
  }
  function bg(el, ink) { if (P.background && P.background !== "none") { el.style.display = el.style.display || "inline-block"; T.background(el, P.background, { RGB: api.RGB, C: api.C, text: ink || col }); } }
  var root = api.el("div", { id: api.id("k"), style: { position: "absolute", left: "0px", top: "0px", width: "1080px", height: "1920px" } });
  root.setAttribute("data-layout-allow-overflow", "");
  var sheet = api.el("style", {}, root);
  var cls = api.id("k");
  sheet.textContent = "." + cls + "-fill { color: " + col + "; -webkit-text-stroke: 0px transparent; }\n." + cls + "-line { color: transparent; -webkit-text-stroke: " + stroke(size) + "; }";

  if (mode === "stack") {
    var n = P.repeat, rowPx = Math.min(fit(text, area.w * 0.96, size), Math.floor(area.h / (n * 0.92)));
    var block = node("div", { position: "absolute", left: area.x + "px", top: (cy - (n * rowPx * 0.92) / 2).toFixed(0) + "px", width: area.w + "px", textAlign: "center" }, root);
    tl.set(block, { skewX: -Math.abs(P.angle) * 0.6 }, 0);
    // rows arrive in a quick stagger from at (the first beat under music); the filled row walks on the beats after that
    var filled = Math.floor(n / 2), rows = [], ts = [];
    for (var q0 = 0; q0 < n; q0++) ts.push(Math.min(end - 0.3, (beats.length ? beats[0] : at) + q0 * 0.09));
    sheet.textContent = "." + cls + "-fill { color: " + col + "; -webkit-text-stroke: 0px transparent; }\n." + cls + "-line { color: transparent; -webkit-text-stroke: " + stroke(rowPx) + "; }";
    for (var i = 0; i < n; i++) {
      // no inline colour: the fill / line classes decide (an inline colour beat the outline class — every row came out filled)
      var row = node("div", baseStyle(rowPx, { color: "" }), block, text);
      row.className = cls + (i === filled ? "-fill" : "-line");
      rows.push(row);
      var dx = (i % 2 ? 1 : -1) * 160;
      tl.set(row, { opacity: 0, x: dx }, 0);
      tl.fromTo(row, { opacity: 0, x: dx }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out", immediateRender: false }, ts[i]);
      var hold = end - (ts[i] + 0.45);
      if (hold > 0.3) tl.fromTo(row, { x: 0 }, { x: (i % 2 ? -1 : 1) * 26, duration: hold, ease: "sine.inOut", immediateRender: false }, ts[i] + 0.45);
    }
    // the filled row walks down the stack on every further beat (music) or step (voice)
    var walk = beats.length > 1 ? beats.slice(1).filter(function (bt) { return bt > ts[n - 1] + 0.4; }) : [];
    if (!beats.length) for (var w = ts[n - 1] + 0.9; w < end - 0.3; w += 0.9) walk.push(w);
    walk.forEach(function (bt, k) {
      var idx = (filled + k + 1) % n;
      rows.forEach(function (r, j) { tl.set(r, { className: cls + (j === idx ? "-fill" : "-line") }, bt); });
    });
  } else if (mode === "extrude") {
    var ePx = fit(text, area.w * 0.86, size), depthN = P.depth, ang = (P.angle * Math.PI) / 180, stepPx = Math.max(3, ePx * 0.03);
    var wrapE = node("div", { position: "absolute", left: area.x + "px", top: (cy - ePx * 0.55).toFixed(0) + "px", width: area.w + "px", height: (ePx * 1.1).toFixed(0) + "px" }, root);
    var ang2 = ang + (P.angle >= 0 ? -0.9 : 0.9);
    for (var c = depthN; c >= 1; c--) {
      var q = c / depthN;
      var copy = node("div", baseStyle(ePx, { position: "absolute", left: "0px", top: "0px", width: "100%", textAlign: "center", color: "rgba(" + api.RGB.heroDeep + "," + (0.55 + 0.45 * (1 - q)).toFixed(2) + ")" }), wrapE, text);
      if (c === 1) copy.style.color = hero;
      var fx = Math.cos(ang) * c * stepPx, fy = Math.sin(ang) * c * stepPx;
      tl.set(copy, { x: 0, y: 0 }, 0);
      tl.fromTo(copy, { x: 0, y: 0 }, { x: fx, y: fy, duration: 0.7, ease: "power3.out", immediateRender: false }, at + 0.1);
      if (end - at - 0.8 > 0.4) tl.fromTo(copy, { x: fx, y: fy }, { x: Math.cos(ang2) * c * stepPx, y: Math.sin(ang2) * c * stepPx, duration: end - at - 0.8, ease: "sine.inOut", immediateRender: false }, at + 0.8);
    }
    var front = node("div", baseStyle(ePx, { position: "absolute", left: "0px", top: "0px", width: "100%", textAlign: "center", textShadow: "0 0 24px " + shade + "0.35)" }), wrapE, text);
    bg(front);
    entrance(wrapE, at, { from: { opacity: 0, scale: 1.25 }, to: { opacity: 1, scale: 1 } });
    beats.slice(1).forEach(function (bt) { tl.fromTo(wrapE, { scale: 1.05 }, { scale: 1, duration: 0.25, ease: "power2.out", immediateRender: false }, bt); });
  } else if (mode === "weight-morph") {
    var mPx = fit(text, area.w * 0.94, size, 1.25);
    var line = node("div", baseStyle(mPx, { position: "absolute", left: area.x + "px", top: (cy - mPx * 0.5).toFixed(0) + "px", width: area.w + "px", textAlign: "center", fontWeight: "150", fontStretch: "70%" }), root);
    bg(line);
    var letters = Array.from(text).map(function (ch) { return node("span", { display: "inline-block", fontWeight: "150", fontStretch: "70%", whiteSpace: "pre" }, line, ch); });
    var half = beats.length > 1 ? period : 0.8;
    letters.forEach(function (sp, li) {
      var t0 = at + li * 0.06, reps = Math.max(0, Math.floor((end - t0) / half) - 1);
      tl.set(sp, { fontWeight: 150, fontStretch: "70%" }, 0);
      tl.fromTo(sp, { fontWeight: 150, fontStretch: "70%" }, { fontWeight: 900, fontStretch: "125%", duration: half, ease: "sine.inOut", yoyo: true, repeat: reps, immediateRender: false }, t0);
    });
    entrance(line, at, { from: { opacity: 0, y: 30 }, to: { opacity: 1, y: 0 } });
  } else if (mode === "outline") {
    var oPx = fit(text, area.w * 0.94, size);
    var holder = node("div", { position: "absolute", left: area.x + "px", top: (cy - oPx * 0.5).toFixed(0) + "px", width: area.w + "px", textAlign: "center" }, root);
    var ghost = node("div", baseStyle(oPx, { color: "transparent", WebkitTextStroke: stroke(oPx) }), holder, text);
    var fill = node("div", baseStyle(oPx, { position: "absolute", left: "0px", top: "0px", width: "100%", textAlign: "center", color: hero }), holder, text);
    var tFill = at + P.fillAt;
    if (beats.length) tFill = beats.reduce(function (b0, b) { return Math.abs(b - tFill) < Math.abs(b0 - tFill) ? b : b0; }, beats[0]);
    tFill = Math.min(tFill, end - 0.4);
    tl.set(fill, { clipPath: "inset(-20% 100% -20% -2%)" }, 0);
    tl.fromTo(fill, { clipPath: "inset(-20% 100% -20% -2%)" }, { clipPath: "inset(-20% -2% -20% -2%)", duration: 0.6, ease: "power2.inOut", immediateRender: false }, tFill);
    entrance(holder, at, { from: { opacity: 0, y: 40 }, to: { opacity: 1, y: 0 } });
    void ghost;
  } else if (mode === "tilt") {
    var tPx = fit(text, area.w * 0.8, size), ta = Math.max(10, Math.min(20, Math.abs(P.angle)));
    var persp = node("div", { position: "absolute", left: area.x + "px", top: (cy - tPx * 1.6).toFixed(0) + "px", width: area.w + "px", height: (tPx * 3.2).toFixed(0) + "px", perspective: "1400px" }, root);
    var inner = node("div", { position: "absolute", left: "0px", top: "0px", width: "100%", height: "100%", transformStyle: "preserve-3d" }, persp);
    var zs = [-260, 0, 200], ys = [0.05, 1.1, 2.15];
    zs.forEach(function (z, ri) {
      var r = node("div", baseStyle(ri === 1 ? tPx : Math.round(tPx * 0.72), { position: "absolute", left: "0px", top: (tPx * ys[ri]).toFixed(0) + "px", width: "100%", textAlign: "center", color: ri === 1 ? col : "transparent", WebkitTextStroke: ri === 1 ? "0px transparent" : stroke(tPx * 0.72) }), inner, text);
      if (ri === 1) bg(r);
      tl.set(r, { z: z, x: 0 }, 0);
      if (end - at > 0.5) tl.fromTo(r, { x: -z * 0.18 }, { x: z * 0.18, duration: end - at, ease: "sine.inOut", immediateRender: false }, at);
    });
    tl.set(inner, { rotationY: -ta, rotationX: ta * 0.5 }, 0);
    if (end - at > 0.5) tl.fromTo(inner, { rotationY: -ta, rotationX: ta * 0.5 }, { rotationY: ta, rotationX: -ta * 0.3, duration: end - at, ease: "sine.inOut", immediateRender: false }, at);
    entrance(persp, at, { from: { opacity: 0 }, to: { opacity: 1 } });
  } else if (mode === "marquee") {
    var rowsN = Math.min(P.repeat, 5), qPx = Math.min(Math.round(size * 0.62), Math.floor(area.h / (rowsN * 1.05)));
    var unit = text + "  ·  ", unitW = measure(unit, qPx) * 1.02, reps2 = Math.ceil(2200 / Math.max(80, unitW)) + 1;
    var line2 = new Array(reps2 + 1).join(unit);
    for (var m = 0; m < rowsN; m++) {
      var rowQ = node("div", baseStyle(qPx, { position: "absolute", left: "0px", top: (cy - (rowsN * qPx * 1.05) / 2 + m * qPx * 1.05).toFixed(0) + "px", color: m === Math.floor(rowsN / 2) ? hero : m % 2 ? "transparent" : col, WebkitTextStroke: m % 2 && m !== Math.floor(rowsN / 2) ? stroke(qPx) : "0px transparent" }), root, line2);
      var dir = m % 2 ? 1 : -1, speed = 90 * (1 + m * 0.35), x0 = dir > 0 ? -unitW * 2 : -unitW * 0.5;
      tl.set(rowQ, { x: x0, opacity: 0 }, 0);
      tl.fromTo(rowQ, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "none", immediateRender: false }, at + m * 0.06);
      if (beats.length) {
        beats.forEach(function (bt, k) {
          tl.fromTo(rowQ, { x: x0 + dir * speed * period * k }, { x: x0 + dir * speed * period * (k + 1), duration: Math.min(0.2, period * 0.6), ease: "power3.out", immediateRender: false }, bt);
        });
      } else if (end - at > 0.3) {
        tl.fromTo(rowQ, { x: x0 }, { x: x0 + dir * speed * (end - at), duration: end - at, ease: "none", immediateRender: false }, at);
      }
    }
  } else if (mode === "texture") {
    var xPx = fit(text, area.w * 0.94, Math.round(size * 1.1));
    var tex = node("div", baseStyle(xPx, { position: "absolute", left: area.x + "px", top: (cy - xPx * 0.5).toFixed(0) + "px", width: area.w + "px", textAlign: "center", color: col, lineHeight: "1", fontWeight: "900" }), root, text);
    var url = "url('assets/hygen/masks/" + P.texture + ".png')";
    tex.style.webkitMaskImage = url; tex.style.maskImage = url;
    tex.style.webkitMaskSize = "cover"; tex.style.maskSize = "cover";
    tex.style.maskMode = "luminance";
    tl.set(tex, { webkitMaskPosition: "50% 0%", maskPosition: "50% 0%" }, 0);
    if (end - at > 0.3) tl.fromTo(tex, { webkitMaskPosition: "50% 0%", maskPosition: "50% 0%" }, { webkitMaskPosition: "50% 100%", maskPosition: "50% 100%", duration: end - at, ease: "none", immediateRender: false }, at);
    var texWrap = node("div", { position: "absolute", left: "0px", top: "0px", width: "1080px", height: "1920px", filter: "drop-shadow(0 6px 18px " + shade + "0.55))" }, root);
    texWrap.appendChild(tex);
    entrance(tex, at, { from: { opacity: 0, scale: 0.86 }, to: { opacity: 1, scale: 1 } });
  } else if (mode === "scramble") {
    var sPx = fit(text, area.w * 0.94, size, 1.1), GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+=?";
    var sLine = node("div", baseStyle(sPx, { position: "absolute", left: area.x + "px", top: (cy - sPx * 0.5).toFixed(0) + "px", width: area.w + "px", textAlign: "center" }), root);
    bg(sLine);
    var chars = Array.from(text), cells = [], resolve = [];
    var groupsN = beats.length ? Math.max(1, Math.min(beats.length, 4)) : 0, per = groupsN ? Math.ceil(chars.length / groupsN) : 0;
    chars.forEach(function (ch, ci) {
      var cw = Math.max(sPx * 0.3, measure(ch === " " ? "M" : ch, sPx) * (ch === " " ? 0.5 : 1.02));
      cells.push(node("span", { display: "inline-block", width: cw.toFixed(1) + "px", textAlign: "center", whiteSpace: "pre" }, sLine, ""));
      resolve.push(groupsN ? beats[Math.min(Math.floor(ci / per), beats.length - 1)] + 0.12 : at + 0.3 + ci * 0.08);
    });
    var seedK = Math.floor(api.rand() * 1000);
    var render = function (t) {
      for (var ci = 0; ci < cells.length; ci++) {
        var ch = chars[ci], el = cells[ci];
        if (t < at || ch === " ") { el.textContent = t < at ? "" : " "; continue; }
        if (t >= resolve[ci]) { if (el.textContent !== ch) el.textContent = ch; el.style.color = col; continue; }
        var h = Math.sin((ci + 1) * 12.9898 + Math.floor(t * 20) * 78.233 + seedK) * 43758.5453;
        el.textContent = GLYPHS.charAt(Math.floor((h - Math.floor(h)) * GLYPHS.length));
        el.style.color = hero;
      }
    };
    var clk = { t: 0 };
    render(0);
    tl.fromTo(clk, { t: 0 }, { t: D, duration: D, ease: "none", onUpdate: function () { render(clk.t); } }, 0);
  } else if (mode === "slam" || mode === "center-build" || mode === "type-swap") {
    var words = P.words && P.words.length ? P.words.map(function (x) { return upper ? String(x).toUpperCase() : String(x); }) : text.split(/\s+/).filter(Boolean);
    if (mode === "type-swap" && !(P.words && P.words.length)) words = [text];
    // words on the words of the voice (wordsAt), else a steady step or the beats of the track
    var wa = P.wordsAt || [];
    var wt = wa.length
      ? words.map(function (_, k) { var off = wa[Math.min(k, wa.length - 1)] + Math.max(0, k - wa.length + 1) * P.step; return Math.min(end - 0.15, at + off); })
      : times(words.length, P.step);
    if (mode === "slam") {
      var lh = 1.02, wPx = Math.min.apply(null, words.map(function (x) { return fit(x, area.w * 0.94, size); }).concat([Math.floor(area.h / (words.length * lh))]));
      var stackTop = cy - (words.length * wPx * lh) / 2;
      var shake = node("div", { position: "absolute", left: "0px", top: "0px", width: "1080px", height: "1920px" }, root);
      tl.set(shake, { x: 0, y: 0 }, 0);
      words.forEach(function (wd, k) {
        var el2 = node("div", baseStyle(wPx, { position: "absolute", left: area.x + "px", top: (stackTop + k * wPx * lh).toFixed(0) + "px", width: area.w + "px", textAlign: "center", color: k === words.length - 1 ? hero : col, transformOrigin: "50% 60%" }), shake);
        var inner2 = node("span", { display: "inline-block" }, el2, wd);
        bg(inner2, k === words.length - 1 ? hero : col);
        var rot = (k % 2 ? 1 : -1) * 7;
        tl.set(el2, { opacity: 0, scale: 2.6, rotation: rot }, 0);
        tl.fromTo(el2, { opacity: 0 }, { opacity: 1, duration: 0.05, ease: "none", immediateRender: false }, wt[k]);
        tl.fromTo(el2, { scale: 2.6, rotation: rot }, { scale: 1, rotation: 0, duration: 0.16, ease: "power4.in", immediateRender: false }, wt[k]);
        var kick = [14, -10, 6, -3, 0], sx = 0;
        for (var s = 0; s < kick.length; s++) {
          tl.fromTo(shake, { x: sx, y: sx * 0.4 }, { x: kick[s], y: kick[s] * 0.4, duration: 0.045, ease: "sine.inOut", immediateRender: false }, wt[k] + 0.16 + s * 0.045);
          sx = kick[s];
        }
      });
    } else if (mode === "center-build") {
      var full = words.join(" "), cPx = fit(full, area.w * 0.94, Math.round(size * 0.7)), gap = cPx * 0.26;
      var widths = words.map(function (x) { return measure(x, cPx) * 1.04; });
      var posAt = [];
      for (var cnt = 1; cnt <= words.length; cnt++) {
        var tot = gap * (cnt - 1);
        for (var a = 0; a < cnt; a++) tot += widths[a];
        var cur = -tot / 2, ps = [];
        for (var b2 = 0; b2 < cnt; b2++) { ps.push(cur + widths[b2] / 2); cur += widths[b2] + gap; }
        posAt.push(ps);
      }
      var els = words.map(function (wd, k) {
        var e = node("div", baseStyle(cPx, { position: "absolute", left: cx + "px", top: cy + "px", color: k === words.length - 1 ? hero : col }), root, wd);
        bg(e, k === words.length - 1 ? hero : col);
        tl.set(e, { xPercent: -50, yPercent: -50, x: posAt[k][k] + (k ? 88 : 0), opacity: 0 }, 0);
        return e;
      });
      els.forEach(function (e, k) {
        var dur = Math.min(0.43, Math.max(0.2, (wt[k + 1] || end) - wt[k] - 0.05));
        tl.fromTo(e, { x: posAt[k][k] + (k ? 88 : 0), opacity: 0 }, { x: posAt[k][k], opacity: 1, duration: dur, ease: "power3.out", immediateRender: false }, wt[k]);
        for (var j = 0; j < k; j++) tl.fromTo(els[j], { x: posAt[k - 1][j] }, { x: posAt[k][j], duration: dur, ease: "power3.out", immediateRender: false }, wt[k]);
      });
    } else {
      // the fixed part on its own line above the slot: both stay large, the slot never jumps sideways
      var prefix = P.words && P.words.length ? text : "";
      var longest = words.reduce(function (l, x) { return x.length > l.length ? x : l; }, "");
      var tPx2 = Math.min(fit(longest, area.w * 0.9, Math.round(size * 0.9)), prefix ? fit(prefix, area.w * 0.9, Math.round(size * 0.9)) : 9999);
      var lineH = tPx2 * 1.15, slotTop = prefix ? cy + lineH * 0.05 : cy - tPx2 * 0.5;
      if (prefix) {
        var pre = node("div", baseStyle(tPx2, { position: "absolute", left: area.x + "px", width: area.w + "px", textAlign: "center", top: (cy - lineH * 1.05).toFixed(0) + "px" }), root);
        bg(node("span", { display: "inline-block" }, pre, prefix));
      }
      words.forEach(function (wd, k) {
        var e = node("div", baseStyle(tPx2, { position: "absolute", left: area.x + "px", width: area.w + "px", textAlign: "center", top: slotTop.toFixed(0) + "px", color: k === words.length - 1 ? hero : col }), root);
        bg(node("span", { display: "inline-block" }, e, wd), k === words.length - 1 ? hero : col);
        tl.set(e, { opacity: 0 }, 0);
        tl.set(e, { opacity: 1 }, wt[k]);
        if (k < words.length - 1) tl.set(e, { opacity: 0 }, wt[k + 1]);
      });
    }
  } else if (mode === "behind-subject") {
    var bPx = fit(text, 1080 * 0.96, Math.round(size * 1.5));
    var word = node("div", baseStyle(bPx, { position: "absolute", left: "0px", top: (cy - bPx * 0.5).toFixed(0) + "px", width: "1080px", textAlign: "center", color: col, lineHeight: "1", fontWeight: "900", textShadow: "0 8px 40px " + shade + "0.35)" }), root, text);
    bg(word);
    if (P.cutout) {
      var img = api.el("img", { src: P.cutout, alt: "", style: { position: "absolute", left: "0px", top: "0px", width: "1080px", height: "1920px", objectFit: P.fit || "cover", objectPosition: P.focus ? (P.focus[0] * 100).toFixed(1) + "% " + (P.focus[1] * 100).toFixed(1) + "%" : "50% 50%" } }, root);
      img.setAttribute("data-layout-ignore", "");
    }
    entrance(word, at, { from: { opacity: 0, y: 170 }, to: { opacity: 1, y: 0 } });
    if (end - at - 0.6 > 0.4) tl.fromTo(word, { x: -24 }, { x: 24, duration: end - at - 0.6, ease: "sine.inOut", immediateRender: false }, at + 0.6);
    beats.slice(1).forEach(function (bt) { tl.fromTo(word, { scale: 1.04 }, { scale: 1, duration: 0.22, ease: "power2.out", immediateRender: false }, bt); });
  }
});
