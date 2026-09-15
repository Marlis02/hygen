/* focus.spotlight — own device (library/devices/focus.spotlight/device.json).
   dim: a night veil over the stage with a hole — circle by a radial mask (soft edge), rect/path by an evenodd polygon.
   blur: the stage blurs (≤ 24 px) and a sharp copy of it (#<prefix>-sharp, written by the build) shows through the hole. */
HygenDevices.define("focus.spotlight", function (api, dev) {
  var P = dev.params, tl = api.tl, at = dev.at, g = P.grow;
  var b = dev.box, pt = dev.point;
  var sharp = document.getElementById(api.cfg.prefix + "-sharp");
  var blur = P.mode === "blur" && !!sharp;
  var veil = api.el("div", { id: api.id("veil"), style: { position: "absolute", left: "0px", top: "0px", width: "1080px", height: "1920px", backgroundColor: api.C.night } });
  tl.set(veil, { opacity: 0 }, 0);
  tl.fromTo(veil, { opacity: 0 }, { opacity: blur ? P.strength * 0.45 : P.strength, duration: g, ease: "power2.out", immediateRender: false }, at);

  function pct(s, axis) { return (parseFloat(s) * (axis === "x" ? 1080 : 1920)) / 100; }
  function polygon(pts, scale, cx, cy, outer) {
    var body = pts.map(function (p) { return ((cx + (p[0] - cx) * scale)).toFixed(1) + "px " + ((cy + (p[1] - cy) * scale)).toFixed(1) + "px"; }).join(", ");
    return outer ? "polygon(evenodd, 0px 0px, 1080px 0px, 1080px 1920px, 0px 1920px, 0px 0px, " + body + ", " + body.split(", ")[0] + ")" : "polygon(" + body + ")";
  }

  if (P.shape === "circle") {
    var cx = pt.x, cy = pt.y, r = b ? Math.max(b.w, b.h) / 2 : P.radius;
    var hole = "radial-gradient(circle var(--hy-r) at " + cx + "px " + cy + "px, transparent 0px, transparent calc(var(--hy-r) * 0.74), black var(--hy-r))";
    veil.style.setProperty("--hy-r", (r * 2.4).toFixed(1) + "px");
    veil.style.maskImage = hole; veil.style.webkitMaskImage = hole;
    tl.set(veil, { "--hy-r": (r * 2.4).toFixed(1) + "px" }, 0);
    tl.fromTo(veil, { "--hy-r": (r * 2.4).toFixed(1) + "px" }, { "--hy-r": r.toFixed(1) + "px", duration: g, ease: "power3.out", immediateRender: false }, at);
    if (blur) {
      var win = "radial-gradient(circle var(--hy-r) at " + cx + "px " + cy + "px, black 0px, black calc(var(--hy-r) * 0.74), transparent var(--hy-r))";
      sharp.style.maskImage = win; sharp.style.webkitMaskImage = win;
      tl.set(sharp, { "--hy-r": "2400px" }, 0);
      tl.fromTo(sharp, { "--hy-r": "2400px" }, { "--hy-r": r.toFixed(1) + "px", duration: g, ease: "power3.out", immediateRender: false }, at);
    }
    if (P.ring) {
      var ring = api.el("div", { id: api.id("ring"), style: { position: "absolute", left: (cx - r * 0.87) + "px", top: (cy - r * 0.87) + "px", width: (r * 1.74) + "px", height: (r * 1.74) + "px", borderRadius: "50%", border: "3px solid rgba(" + api.RGB.heroLight + ",0.85)", boxShadow: "0 0 22px rgba(" + api.RGB.hero + ",0.45)" } });
      api.show(ring, at + g * 0.7, 0.35, { scale: 1.25 });
    }
  } else {
    var pts;
    if (P.shape === "path" && P.points.length >= 3) {
      pts = P.points.map(function (s) { var xy = s.split(","); return [pct(xy[0], "x"), pct(xy[1], "y")]; });
    } else {
      var bb = b || { x: pt.x - P.radius, y: pt.y - P.radius, w: P.radius * 2, h: P.radius * 2 };
      pts = [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]];
    }
    var mx = 0, my = 0;
    pts.forEach(function (p) { mx += p[0] / pts.length; my += p[1] / pts.length; });
    tl.set(veil, { clipPath: polygon(pts, 3, mx, my, true) }, 0);
    tl.fromTo(veil, { clipPath: polygon(pts, 3, mx, my, true) }, { clipPath: polygon(pts, 1, mx, my, true), duration: g, ease: "power3.out", immediateRender: false }, at);
    if (blur) {
      tl.set(sharp, { clipPath: polygon(pts, 8, mx, my, false) }, 0);
      tl.fromTo(sharp, { clipPath: polygon(pts, 8, mx, my, false) }, { clipPath: polygon(pts, 1, mx, my, false), duration: g, ease: "power3.out", immediateRender: false }, at);
    }
    if (P.ring) {
      var rs = api.svg("svg", { id: api.id("ring"), width: 1080, height: 1920, viewBox: "0 0 1080 1920", style: { position: "absolute", left: "0px", top: "0px" } });
      var d = "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") + " Z";
      var outline = api.svg("path", { d: d, fill: "none", stroke: api.C.heroLight, "stroke-width": 3 }, rs);
      api.draw(outline, at + g * 0.6, 0.5);
    }
  }
  if (blur) {
    var stage = api.stageEl;
    tl.set(stage, { filter: "blur(0px)" }, 0);
    tl.fromTo(stage, { filter: "blur(0px)" }, { filter: "blur(" + Math.min(24, P.blur) + "px)", duration: g, ease: "power2.out", immediateRender: false }, at);
  }
});
