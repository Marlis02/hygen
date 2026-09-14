/* data.dots — own device (engine/devices/data.dots/device.json): N dots in a grid inside the target area arrive row by row
   (opacity + scale stagger, ≤ 0.9 s), then on markAt `mark` of them change — light up in markColor or fade to 15 % —
   in a stagger of ≤ 0.8 s. SVG circles, attr/property tweens on the beat timeline with a baseline at 0; the spread pick
   is seeded (api.rand), so every render marks the same dots. */
HygenDevices.define("data.dots", function (api, dev) {
  var P = dev.params, tl = api.tl, b = dev.box;
  var n = Math.max(1, P.count), k = Math.max(0, Math.min(n, P.mark));
  var col = api.color(P.color, "text"), mark = api.color(P.markColor, "hero");
  // grid: columns so that cells are square inside the area
  var cols = Math.max(1, Math.round(Math.sqrt((n * b.w) / Math.max(1, b.h))));
  var rows = Math.ceil(n / cols);
  var cell = Math.min(b.w / cols, b.h / rows);
  var r = Math.max(2, cell * 0.34);
  var gw = cols * cell, gh = rows * cell;
  var x0 = b.x + (b.w - gw) / 2 + cell / 2, y0 = b.y + (b.h - gh) / 2 + cell / 2;
  var svg = api.svg("svg", { id: api.id("dots"), width: 1080, height: 1920, viewBox: "0 0 1080 1920", style: { position: "absolute", left: "0px", top: "0px", overflow: "visible" } });
  var dots = [];
  for (var i = 0; i < n; i++) {
    var cx = x0 + (i % cols) * cell, cy = y0 + Math.floor(i / cols) * cell;
    dots.push(api.svg("circle", { cx: cx.toFixed(1), cy: cy.toFixed(1), r: r.toFixed(1), fill: col }, svg));
  }
  // which dots change: the first k, the last k, or k spread by the seed
  var order = dots.map(function (_, i) { return i; });
  if (P.from === "end") order.reverse();
  else if (P.from === "spread") {
    for (var s = order.length - 1; s > 0; s--) { var j = Math.floor(api.rand() * (s + 1)); var tmp = order[s]; order[s] = order[j]; order[j] = tmp; }
  }
  var marked = order.slice(0, k);
  var inStep = Math.min(0.9 / Math.max(1, rows), 0.08);
  dots.forEach(function (d, i) {
    var t = dev.at + Math.floor(i / cols) * inStep;
    tl.set(d, { opacity: 0, attr: { r: 0 } }, 0);
    tl.fromTo(d, { opacity: 0, attr: { r: 0 } }, { opacity: 1, attr: { r: r }, duration: 0.3, ease: "back.out(2)", immediateRender: false }, t);
  });
  var tMark = dev.at + P.markAt;
  var markStep = Math.min(0.8 / Math.max(1, k), 0.03);
  marked.forEach(function (idx, m) {
    var d = dots[idx], t = tMark + m * markStep;
    if (P.mode === "fade") tl.fromTo(d, { opacity: 1 }, { opacity: 0.15, duration: 0.25, ease: "power2.out", immediateRender: false }, t);
    else tl.fromTo(d, { attr: { fill: col } }, { attr: { fill: mark }, duration: 0.2, ease: "none", immediateRender: false }, t);
  });
  var shadow = "0 0 16px rgba(" + api.RGB.night + ",0.9)";
  var textTop = y0 + gh - cell / 2 + 26;
  if (P.label || P.per) {
    var block = api.el("div", { id: api.id("label"), style: { position: "absolute", left: b.x.toFixed(0) + "px", width: b.w.toFixed(0) + "px", top: Math.min(1360, textTop).toFixed(0) + "px", textAlign: "center", fontFamily: api.F.body, textShadow: shadow } });
    if (P.label) api.el("div", { text: P.label, style: { fontWeight: "700", fontSize: api.sizes.label + "px", letterSpacing: "0.14em", textTransform: "uppercase", color: P.mode === "fade" ? col : mark } }, block);
    if (P.per) api.el("div", { text: P.per, style: { fontWeight: "500", fontSize: api.sizes.labelSm + "px", letterSpacing: "0.08em", color: col, opacity: "0.8", marginTop: "6px" } }, block);
    api.show(block, tMark + 0.2, 0.4, { y: 12 });
  }
});
