/* data.chart — port of registry chart-story (engine/devices/vendor/chart-story), kinds bars and line: baseline
   draw, bars grow by rect geometry (attr tweens, no scaleY), line draws by dashoffset with ease none and dots pop
   at their cumulative length, area fill fades after, the highlighted datum gets the hero colour and a chip whose
   value rolls in authored textContent rows. Already seek-safe in the original. New: negative values (waveform). */
HygenDevices.define("data.chart", function (api, dev) {
  var P = dev.params, tl = api.tl, b = dev.box;
  var series = api.color(P.color, "text"), hero = api.C.hero;
  var values = (P.values || []).map(Number).filter(function (v) { return isFinite(v); });
  if (!values.length) values = [0];
  var n = values.length;
  var labels = (P.labels || []).slice(0, n);
  var unit = P.unit || "";
  var hi = Math.round(Number(P.highlight));
  if (!(hi >= 0 && hi < n)) hi = -1;
  var drawDur = Math.max(0.3, Number(P.drawDur) || 1.6);
  var at = dev.at, axis = P.axis !== false;
  function f(v) { return v.toFixed(1); }

  var labSize = api.sizes.labelSm;
  var left = b.x, right = b.x + b.w;
  var top = b.y + (hi >= 0 ? 90 : 20);
  var base = b.y + b.h - (axis && labels.length ? labSize * 1.9 : 6);
  var vmax = Number(P.max) > 0 ? Number(P.max) : Math.max.apply(null, values.concat([1e-9]));
  var vmin = Math.min(0, Math.min.apply(null, values));
  function yOf(v) { return base - (v - vmin) / Math.max(1e-9, vmax - vmin) * (base - top); }
  var zeroY = yOf(0);

  var svg = api.svg("svg", { id: api.id("chart"), width: 1080, height: 1920, viewBox: "0 0 1080 1920", style: { position: "absolute", left: "0px", top: "0px", overflow: "visible", filter: "drop-shadow(0 0 8px rgba(" + api.RGB.night + ",0.8))" } });
  function text(x, y, str, size, fill, weight, parent) {
    return api.svg("text", { x: f(x), y: f(y), "text-anchor": "middle", text: str, style: { fill: fill, fontFamily: api.F.body, fontSize: size + "px", fontWeight: weight || "600", fontVariantNumeric: "tabular-nums" } }, parent || svg);
  }
  function fadeIn(node, t, rise) {
    tl.set(node, { opacity: 0, y: rise ? 8 : 0 }, 0);
    tl.fromTo(node, { opacity: 0, y: rise ? 8 : 0 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", immediateRender: false }, t);
  }
  function dec(v) { var s = String(v); return (s.split(".")[1] || "").length; }

  if (axis) {
    var bl = api.svg("path", { d: "M " + f(left) + " " + f(zeroY) + " L " + f(right) + " " + f(zeroY), fill: "none", stroke: api.C.muted, "stroke-width": 3, "stroke-linecap": "round" }, svg);
    api.draw(bl, at, 0.5, "power2.inOut");
  }

  var points = [];
  var band = (right - left) / n;
  var lsz = Math.min(labSize, Math.max(14, band * 0.4));
  if (P.kind === "line") {
    for (var i = 0; i < n; i++) points.push({ x: left + (right - left) * (n === 1 ? 0.5 : i / (n - 1)), y: yOf(values[i]) });
    var d = points.map(function (q, k) { return (k ? "L " : "M ") + f(q.x) + " " + f(q.y); }).join(" ");
    var area = api.svg("path", { d: d + " L " + f(points[n - 1].x) + " " + f(zeroY) + " L " + f(points[0].x) + " " + f(zeroY) + " Z", fill: series, stroke: "none" }, svg);
    tl.set(area, { opacity: 0 }, 0);
    tl.fromTo(area, { opacity: 0 }, { opacity: 0.12, duration: 0.45, ease: "power2.out", immediateRender: false }, at + drawDur - 0.05);
    var line = api.svg("path", { d: d, fill: "none", stroke: series, "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
    api.draw(line, at, drawDur, "none");
    tl.set(line, { opacity: 0 }, 0);
    tl.fromTo(line, { opacity: 0 }, { opacity: 1, duration: 0.01, ease: "none", immediateRender: false }, at);
    var cum = [0];
    for (var c = 1; c < n; c++) cum.push(cum[c - 1] + Math.hypot(points[c].x - points[c - 1].x, points[c].y - points[c - 1].y));
    var total = Math.max(1e-9, cum[n - 1]);
    for (var j = 0; j < n; j++) {
      var isEnd = j === n - 1, isHi = j === hi;
      if (!(n <= 12 || isEnd || isHi)) continue; // a dense line (waveform) keeps only the end and highlight dots
      var tj = at + drawDur * (cum[j] / total);
      var dot = api.svg("circle", { cx: f(points[j].x), cy: f(points[j].y), r: isHi ? 12 : isEnd ? 9 : 7, fill: isHi ? hero : series }, svg);
      var od = f(points[j].x) + " " + f(points[j].y);
      tl.set(dot, { scale: 0, svgOrigin: od }, 0);
      tl.fromTo(dot, { scale: 0, svgOrigin: od }, { scale: 1, duration: 0.35, ease: "back.out(2)", immediateRender: false }, tj);
    }
  } else {
    var barW = Math.min(band * 0.62, 150);
    var barDur = Math.min(0.85, drawDur * 0.55);
    var stagger = n > 1 ? (drawDur - barDur) / (n - 1) : 0;
    for (var k = 0; k < n; k++) {
      var cx = left + band * (k + 0.5), yv = yOf(values[k]);
      var hgt = Math.max(Math.abs(yv - zeroY), 3), y1 = Math.min(yv, zeroY);
      var rect = api.svg("rect", { x: f(cx - barW / 2), width: f(barW), y: f(zeroY), height: 0, rx: f(Math.min(10, barW * 0.18, hgt / 2)), fill: k === hi ? hero : series, "fill-opacity": k === hi ? 1 : 0.55 }, svg);
      var tk = at + 0.3 + stagger * k;
      tl.set(rect, { attr: { y: zeroY, height: 0 } }, 0);
      tl.fromTo(rect, { attr: { y: zeroY, height: 0 } }, { attr: { y: y1, height: hgt }, duration: barDur, ease: "power3.out", immediateRender: false }, tk);
      points.push({ x: cx, y: y1 });
      if (k !== hi && n <= 8) fadeIn(text(cx, y1 - 16, values[k] + unit, labSize, api.C.text, "600"), tk + barDur * 0.75, true);
    }
  }

  if (axis) {
    for (var m = 0; m < labels.length; m++) {
      if (!labels[m]) continue;
      var lx = P.kind === "line" ? points[m].x : left + band * (m + 0.5);
      fadeIn(text(lx, zeroY + lsz * 1.45, labels[m], lsz, api.C.muted, "600"), at + 0.3 + Math.min(0.12 * m, drawDur * 0.8 * m / Math.max(1, labels.length - 1)), true);
    }
  }

  // highlight chip: pops over the datum, the value rolls to the exact supplied number
  if (hi >= 0) {
    var chipSize = api.sizes.label;
    var finalStr = values[hi] + unit;
    var cw = Math.max(96, finalStr.length * chipSize * 0.62 + 44), ch = chipSize * 1.75;
    var anchorX = Math.min(Math.max(points[hi].x, left + cw / 2), right - cw / 2);
    var bottom = points[hi].y - (P.kind === "line" ? 26 : 20);
    var chip = api.svg("g", {}, svg);
    api.svg("rect", { x: f(anchorX - cw / 2), y: f(bottom - ch), width: f(cw), height: f(ch), rx: 12, fill: hero }, chip);
    var val = text(anchorX, bottom - ch / 2 + chipSize * 0.36, "0" + unit, chipSize, api.C.night, "800", chip);
    var popAt = at + drawDur - 0.1, oc = f(anchorX) + " " + f(bottom);
    tl.set(chip, { opacity: 0, scale: 0.6, svgOrigin: oc }, 0);
    tl.fromTo(chip, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out", immediateRender: false }, popAt);
    tl.fromTo(chip, { scale: 0.6, svgOrigin: oc }, { scale: 1, duration: 0.45, ease: "back.out(1.7)", immediateRender: false }, popAt);
    var frames = 21, e2 = gsap.parseEase("power2.out"), dd = dec(values[hi]);
    for (var r = 1; r <= frames; r++) {
      tl.set(val, { textContent: r === frames ? finalStr : (values[hi] * e2(r / frames)).toFixed(dd) + unit }, popAt + 0.7 * r / frames);
    }
  }
});
