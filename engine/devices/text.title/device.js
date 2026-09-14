/* text.title — calm is a port of registry titlecard-calm (engine/devices/vendor/titlecard-calm): kicker fades and
   rises first (0.5 s), the headline follows at 0.28 s (0.72 s, power3.out), the lockup drifts barely upward on the
   hold. typewriter and slam are own modes after kinetic-type-swap (fixed layout, only per-glyph opacity and
   transforms change): every step is a tl.set / property tween, so any seek shows the same pixels. */
HygenDevices.define("text.title", function (api, dev) {
  var P = dev.params, tl = api.tl, b = dev.box, p = dev.point, T = window.HygenText;
  // shared text schema (engine/devices/text.schema.json): font, size, case, color, background, position, type
  var col = T.color(api.C, P.color, "text");
  var text = P.text || dev.word || "";
  var kicker = P.kicker || "";
  var size = T.px("title", P.size, api.sizes);
  var body = P.font === "body";
  var at = dev.at, mode = P.mode || "calm", alignLeft = P.align === "left";
  var end = dev.until !== null && dev.until !== undefined ? dev.until : api.dur;
  var shadow = "0 0 30px rgba(" + api.RGB.night + ",0.75), 0 0 6px rgba(" + api.RGB.night + ",0.6)";

  // block geometry: width from the target, height estimated (fonts may still be loading at mount)
  var boxW, cx, cy, lx;
  if (b) { boxW = b.w; cx = b.x + b.w / 2; cy = b.y + b.h / 2; lx = b.x; }
  else if (p) { boxW = 900; cx = p.x; cy = p.y; lx = p.x; }
  else { boxW = 900; cx = 540; cy = P.position === "center" ? 900 : P.position === "bottom" ? 1240 : 380; lx = 90; }
  if (alignLeft) boxW = Math.min(boxW, 1020 - lx);
  else { boxW = Math.min(boxW, 2 * Math.min(cx - 60, 1020 - cx)); }
  var kSize = api.sizes.label;
  var lines = Math.max(1, Math.ceil(text.length * size * 0.5 / Math.max(200, boxW)));
  var blockH = (kicker ? kSize * 1.7 : 0) + lines * size * 1.02;
  var top = cy - blockH / 2;
  if (!b && !p && P.position === "near-target") {
    // next to the area of another device of the beat: below it when there is room above the captions, else above it
    for (var n = 0; n < api.cfg.devices.length; n++) {
      var o = api.cfg.devices[n];
      if (o.index === dev.index || !(o.box || o.point)) continue;
      var ob = o.box || { x: o.point.x - 40, y: o.point.y - 40, w: 80, h: 80 };
      top = ob.y + ob.h + 40 + blockH <= 1420 ? ob.y + ob.h + 40 : ob.y - 40 - blockH;
      break;
    }
  }
  top = Math.max(154, Math.min(1420 - blockH, top));
  var left = alignLeft ? lx : cx - boxW / 2;

  var wrap = api.el("div", { id: api.id("title"), style: { position: "absolute", left: left.toFixed(0) + "px", top: top.toFixed(0) + "px", width: boxW.toFixed(0) + "px", textAlign: alignLeft ? "left" : "center" } });
  var kEl = null;
  if (kicker) kEl = api.el("div", { text: kicker, style: { fontFamily: api.F.body, fontWeight: "600", fontSize: kSize + "px", lineHeight: "1", letterSpacing: "0.18em", textTransform: "uppercase", color: api.C.muted, marginBottom: (kSize * 0.7).toFixed(0) + "px", textShadow: shadow } }, wrap);
  var tEl = api.el("div", { style: { fontFamily: body ? api.F.body : api.F.display, fontWeight: body ? "700" : "600", fontSize: size + "px", lineHeight: "1.02", letterSpacing: "-0.01em", color: col, textWrap: "balance", textShadow: shadow, textTransform: P["case"] === "upper" ? "uppercase" : "none" } }, wrap);
  if (P.background && P.background !== "none") {
    tEl.style.display = "inline-block";
    T.background(tEl, P.background, { RGB: api.RGB, C: api.C, row: wrap, text: col });
  }

  if (mode !== "typewriter") tEl.textContent = text;
  if (mode === "typewriter") {
    // glyph spans keep the final layout; each glyph appears on its step, the caret rides the last shown glyph
    var chars = Array.from(text);
    var step = Math.max(0.03, Math.min(0.07, 0.9 / Math.max(1, chars.length)));
    var t0 = at + (kEl ? 0.18 : 0.05);
    var caretW = Math.max(3, Math.round(size * 0.045));
    var word = null, carets = [], times = [];
    for (var i = 0; i < chars.length; i++) {
      var chr = chars[i];
      var host = tEl;
      if (chr !== " ") { if (!word) word = api.el("span", { style: { whiteSpace: "nowrap" } }, tEl); host = word; }
      else word = null;
      var span = api.el("span", { text: chr, style: { position: "relative", opacity: "0" } }, host);
      var caret = api.el("span", { style: { position: "absolute", left: "100%", top: "0.1em", bottom: "0.06em", width: caretW + "px", marginLeft: "0.04em", backgroundColor: api.C.hero, opacity: "0" } }, span);
      var ti = t0 + i * step;
      tl.set(span, { opacity: 1 }, ti);
      carets.push(caret); times.push(ti);
    }
    for (var c = 0; c < carets.length; c++) {
      tl.set(carets[c], { opacity: 1 }, times[c]);
      if (c < carets.length - 1) tl.set(carets[c], { opacity: 0 }, times[c + 1]);
    }
    if (carets.length) {
      var last = carets[carets.length - 1], blinkEnd = Math.min(end, times[times.length - 1] + 2.2);
      for (var bt = times[times.length - 1] + 0.45, on = false; bt < blinkEnd; bt += 0.45, on = !on) tl.set(last, { opacity: on ? 1 : 0 }, bt);
      tl.set(last, { opacity: 0 }, blinkEnd);
    }
    if (kEl) api.show(kEl, at, 0.35, { y: 10 });
  } else if (mode === "slam") {
    // big and fast: the line drops in from 1.9× accelerating into contact, one short overshoot, a decaying shake
    tl.set(tEl, { opacity: 0, scale: 1.9, transformOrigin: "50% 60%" }, 0);
    tl.fromTo(tEl, { opacity: 0 }, { opacity: 1, duration: 0.06, ease: "none", immediateRender: false }, at);
    tl.fromTo(tEl, { scale: 1.9 }, { scale: 0.96, duration: 0.17, ease: "power4.in", immediateRender: false }, at);
    tl.fromTo(tEl, { scale: 0.96 }, { scale: 1, duration: 0.25, ease: "power2.out", immediateRender: false }, at + 0.17);
    var shake = [12, -9, 6, -3, 0], sx = 0;
    tl.set(wrap, { x: 0 }, 0);
    for (var s = 0; s < shake.length; s++) {
      tl.fromTo(wrap, { x: sx }, { x: shake[s], duration: 0.045, ease: "sine.inOut", immediateRender: false }, at + 0.17 + s * 0.045);
      sx = shake[s];
    }
    if (kEl) api.show(kEl, at + 0.22, 0.35, { y: 10 });
  } else {
    if (kEl) api.show(kEl, at, 0.5, { y: 18 });
    if (P.type && P.type !== "none") {
      T.enter(tl, tEl, at + 0.28, P.type, { heroRgb: api.RGB.hero });
    } else {
      tl.set(tEl, { opacity: 0, y: 26 }, 0);
      tl.fromTo(tEl, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.72, ease: "power3.out", immediateRender: false }, at + 0.28);
    }
    var hold = end - (at + 1.2);
    if (hold > 0.4) {
      tl.set(wrap, { y: 0 }, 0);
      tl.fromTo(wrap, { y: 0 }, { y: -8, duration: hold, ease: "sine.inOut", immediateRender: false }, at + 1.2);
    }
  }
});
