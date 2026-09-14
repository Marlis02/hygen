/* data.timeline — port of the idea of registry beat-timeline / pan-stations (engine/devices/data.timeline/device.json):
   the base line draws (0.6 s), station ticks pop along it, a bright marker travels station to station — one fromTo per
   leg, sync voice every `step` s, sync music on the beats of the track — the passed part of the line fills in markColor,
   each date (and label) lands when the marker arrives. Horizontal in a wide area, vertical in a tall one. */
HygenDevices.define("data.timeline", function (api, dev) {
  var P = dev.params, tl = api.tl, b = dev.box;
  var dates = (P.dates || []).slice(0, 7), labels = P.labels || [];
  var n = Math.max(2, dates.length);
  var col = api.color(P.color, "text"), mark = api.color(P.markColor, "hero");
  var horiz = b.w >= b.h;
  var pad = horiz ? b.w * 0.06 : b.h * 0.06;
  function pos(i) {
    var q = i / (n - 1);
    return horiz ? { x: b.x + pad + q * (b.w - 2 * pad), y: b.y + b.h * 0.5 } : { x: b.x + b.w * 0.3, y: b.y + pad + q * (b.h - 2 * pad) };
  }
  var a = pos(0), z = pos(n - 1);
  var svg = api.svg("svg", { id: api.id("tl"), width: 1080, height: 1920, viewBox: "0 0 1080 1920", style: { position: "absolute", left: "0px", top: "0px", overflow: "visible", filter: "drop-shadow(0 0 6px rgba(" + api.RGB.night + ",0.8))" } });
  var base = api.svg("path", { d: "M " + a.x.toFixed(1) + " " + a.y.toFixed(1) + " L " + z.x.toFixed(1) + " " + z.y.toFixed(1), stroke: col, "stroke-width": 4, fill: "none", opacity: 0.55 }, svg);
  api.draw(base, dev.at, 0.6, "power2.inOut");
  var passed = api.svg("path", { d: "M " + a.x.toFixed(1) + " " + a.y.toFixed(1) + " L " + z.x.toFixed(1) + " " + z.y.toFixed(1), stroke: mark, "stroke-width": 7, fill: "none", "stroke-linecap": "butt" }, svg);
  var len = horiz ? z.x - a.x : z.y - a.y;
  passed.style.strokeDasharray = len + " " + len;
  tl.set(passed, { strokeDashoffset: len }, 0);
  // leg times: voice — every step after the line is drawn; music — the beats after it
  var beats = ((dev.grid && dev.grid.beats) || []).filter(function (t) { return t >= dev.at + 0.6; });
  var times = [];
  for (var i = 0; i < n; i++) times.push(beats.length ? (i < beats.length ? beats[i] : beats[beats.length - 1] + (i - beats.length + 1) * P.step) : dev.at + 0.7 + i * P.step);
  var dot = api.svg("circle", { cx: a.x.toFixed(1), cy: a.y.toFixed(1), r: 16, fill: mark }, svg);
  tl.set(dot, { opacity: 0 }, 0);
  tl.fromTo(dot, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "none", immediateRender: false }, times[0] - 0.1);
  var fs = api.sizes.label, big = Math.round(fs * 1.35);
  for (var s = 0; s < n; s++) {
    var p = pos(s);
    var tick = api.svg("circle", { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 9, fill: col }, svg);
    tl.set(tick, { opacity: 0 }, 0);
    tl.fromTo(tick, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "none", immediateRender: false }, dev.at + 0.1 + (0.5 * s) / n);
    if (s > 0) {
      var q = pos(s - 1), legDur = Math.max(0.15, Math.min(0.5, times[s] - times[s - 1] - 0.05));
      var attrFrom = horiz ? { cx: q.x } : { cy: q.y }, attrTo = horiz ? { cx: p.x } : { cy: p.y };
      tl.fromTo(dot, { attr: attrFrom }, { attr: attrTo, duration: legDur, ease: "power2.inOut", immediateRender: false }, times[s] - legDur);
      tl.fromTo(passed, { strokeDashoffset: len - ((s - 1) / (n - 1)) * len }, { strokeDashoffset: len - (s / (n - 1)) * len, duration: legDur, ease: "power2.inOut", immediateRender: false }, times[s] - legDur);
    }
    var block = api.el("div", { id: api.id("st" + s), style: { position: "absolute", whiteSpace: "nowrap", textAlign: horiz ? "center" : "left", fontFamily: api.F.body, textShadow: "0 0 14px rgba(" + api.RGB.night + ",0.95)" } });
    if (horiz) { block.style.left = (p.x - 150).toFixed(0) + "px"; block.style.width = "300px"; block.style.top = (s % 2 ? p.y + 34 : p.y - 34 - big * 1.2 - (labels[s] ? fs * 1.3 : 0)).toFixed(0) + "px"; }
    else { block.style.left = (p.x + 40).toFixed(0) + "px"; block.style.top = (p.y - big * 0.62).toFixed(0) + "px"; }
    api.el("div", { text: dates[s] || "", style: { fontWeight: "800", fontSize: big + "px", lineHeight: "1.1", color: col } }, block);
    if (labels[s]) api.el("div", { text: labels[s], style: { fontWeight: "700", fontSize: fs + "px", letterSpacing: "0.12em", textTransform: "uppercase", color: mark } }, block);
    api.show(block, times[s], 0.3, { y: horiz ? (s % 2 ? -10 : 10) : 0, x: horiz ? 0 : -12 });
  }
});
