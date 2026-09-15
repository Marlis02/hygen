/* annotate.box — port of registry hw-box-label (library/devices/vendor/hw-box-label): wobbled rounded rect, draw-on
   entrance, label fade, boil. Changes: boil from one full-span clock (no eventCallback); new: cells with
   hand-drawn dividers and an ordered fill (attr tweens of clipped rects — seek-safe). */
HygenDevices.define("annotate.box", function (api, dev) {
  var P = dev.params, tl = api.tl, b = dev.box;
  var col = api.color(P.color, "heroLight"), fillCol = api.color(P.fillColor, "hero");
  var seed = 1 + Math.floor(api.rand() * 96);
  function hash(n) { var x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
  function f(v) { return v.toFixed(1); }
  var w = Math.max(20, b.w), h = Math.max(20, b.h);

  // hwWobbleRect
  function wobbleRect(r, amp) {
    function wob(n) { return hash(n) * amp; }
    var d = "M " + f(r + wob(1)) + " " + f(wob(2));
    d += " L " + f(w / 2 + wob(3)) + " " + f(wob(4)) + " L " + f(w - r + wob(5)) + " " + f(wob(6));
    d += " Q " + f(w + wob(7)) + " " + f(wob(8)) + " " + f(w + wob(9)) + " " + f(r + wob(10));
    d += " L " + f(w + wob(11)) + " " + f(h / 2 + wob(12)) + " L " + f(w + wob(13)) + " " + f(h - r + wob(14));
    d += " Q " + f(w + wob(15)) + " " + f(h + wob(16)) + " " + f(w - r + wob(17)) + " " + f(h + wob(18));
    d += " L " + f(w / 2 + wob(19)) + " " + f(h + wob(20)) + " L " + f(r + wob(21)) + " " + f(h + wob(22));
    d += " Q " + f(wob(23)) + " " + f(h + wob(24)) + " " + f(wob(25)) + " " + f(h - r + wob(26));
    d += " L " + f(wob(27)) + " " + f(h / 2 + wob(28)) + " L " + f(wob(29)) + " " + f(r + wob(30));
    d += " Q " + f(wob(31)) + " " + f(wob(32)) + " " + f(r + wob(33)) + " " + f(wob(34));
    return d;
  }

  var wrap = api.el("div", { id: api.id("box"), style: { position: "absolute", left: b.x + "px", top: b.y + "px", width: w + "px", height: h + "px" } });
  var boilEl = api.el("div", { style: { position: "absolute", left: "0px", top: "0px", width: w + "px", height: h + "px" } }, wrap);
  var svg = api.svg("svg", { width: w, height: h, viewBox: "0 0 " + w + " " + h, style: { position: "absolute", left: "0px", top: "0px", overflow: "visible", filter: "drop-shadow(0 0 6px rgba(" + api.RGB.night + ",0.85))" } }, boilEl);
  var defs = api.svg("defs", {}, svg);
  var rectD = wobbleRect(Math.min(26, w * 0.1, h * 0.4), 3.5);
  var clipId = api.id("clip");
  var clip = api.svg("clipPath", { id: clipId }, defs);
  api.svg("path", { d: rectD }, clip);

  var N = Math.max(1, Math.min(20, Math.round(Number(P.cells) || 1)));
  var nFill = Math.max(0, Math.min(N, Math.round(Number(P.fill) || 0)));
  var cellW = w / N;

  // fills under the strokes: each cell rises from the floor, one after another
  if (nFill > 0) {
    var fillG = api.svg("g", { "clip-path": "url(#" + clipId + ")" }, svg);
    var fillDur = Math.max(0.1, Number(P.fillDur) || 1.5), per = fillDur / nFill;
    var fillAt = dev.at + Math.max(0, Number(P.fillAt) || 0);
    for (var i = 0; i < nFill; i++) {
      var rect = api.svg("rect", { x: f((P.fillFrom === "right" ? N - 1 - i : i) * cellW + 2), width: f(cellW - 4), y: f(h), height: 0, fill: fillCol, "fill-opacity": 0.62 }, fillG);
      tl.set(rect, { attr: { y: h, height: 0 } }, 0);
      tl.fromTo(rect, { attr: { y: h, height: 0 } }, { attr: { y: 0, height: h }, duration: per * 1.1, ease: "sine.inOut", immediateRender: false }, fillAt + i * per);
    }
  }

  function ink(d, width) { return api.svg("path", { d: d, fill: "none", stroke: col, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg); }
  function drawOn(node, at, dur, ease) {
    api.draw(node, at, dur, ease);
    tl.set(node, { opacity: 0 }, 0); // hide the round-cap nub before the draw
    tl.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.01, ease: "none", immediateRender: false }, at);
  }
  drawOn(ink(rectD, 6), dev.at, 0.75, "power2.inOut");
  var stagger = Math.max(0, Number(P.stagger) || 0);
  for (var k = 1; k < N; k++) {
    var x = k * cellW;
    var div = ink("M " + f(x + hash(40 + k) * 3) + " " + f(3 + hash(60 + k) * 2) + " Q " + f(x + hash(80 + k) * 5) + " " + f(h / 2) + " " + f(x + hash(100 + k) * 3) + " " + f(h - 3 + hash(120 + k) * 2), 4);
    drawOn(div, dev.at + 0.35 + (k - 1) * stagger, 0.3, "power2.out");
  }

  if (P.label) {
    var size = Math.round(api.sizes.unit * 0.83), estH = size * 1.2;
    var lab = api.el("div", {
      id: api.id("label"), text: P.label,
      style: { position: "absolute", left: f(w / 2 - 540) + "px", width: "1080px", textAlign: "center", whiteSpace: "nowrap", lineHeight: "1.2", fontFamily: api.F.body, fontWeight: "800", fontSize: size + "px", letterSpacing: "0.05em", color: api.C.text, textShadow: "0 0 18px rgba(" + api.RGB.night + ",0.95), 0 0 4px rgba(" + api.RGB.night + ",0.9)" }
    }, boilEl);
    // above the box; below it when the top is too close to the frame edge; inside as the last resort
    var top = -16 - estH;
    if (b.y + top < 140) top = b.y + h + 16 + estH <= 1420 ? h + 16 : (h - estH) / 2;
    lab.style.top = f(top) + "px";
    api.show(lab, dev.at + 0.55, 0.4, { y: 10 });
  }

  // boil (hwBoil "calm") from one full-span clock
  var clock = { t: 0 }, rot = 0.5 * Math.min(1, 220 / Math.max(w, h));
  function boil() {
    var s = Math.floor(clock.t * 10);
    boilEl.style.transform = "translate(" + (hash(s * 3 + 51) * 1.6).toFixed(2) + "px," + (hash(s * 3 + 52) * 1.6).toFixed(2) + "px) rotate(" + (hash(s * 3 + 53) * rot).toFixed(3) + "deg)";
  }
  boil();
  tl.fromTo(clock, { t: 0 }, { t: api.dur, duration: api.dur, ease: "none", onUpdate: boil }, 0);
});
