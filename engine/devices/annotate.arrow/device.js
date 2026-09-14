/* annotate.arrow — port of registry hw-arrow (engine/devices/vendor/hw-arrow): the seeded wobble path, the stroke
   matrix (plain | soft | sharp | spray via a mask clone) and boil. Changes for seek-safety: boil and the head
   arrival run as tl property tweens / one full-span clock instead of tl.eventCallback("onUpdate"). */
HygenDevices.define("annotate.arrow", function (api, dev) {
  var P = dev.params, tl = api.tl, p = dev.point;
  var col = api.color(P.color, "heroLight");
  var MASK_INK = api.C.white || api.C.text;
  var W = 7, DRAW = 0.7;
  var seed = 1 + Math.floor(api.rand() * 96);
  function hash(n) { var x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }

  var DIRS = { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1], "up-left": [1, 1], "up-right": [-1, 1], "down-left": [1, -1], "down-right": [-1, -1] };
  var dv = DIRS[P.from] || DIRS.left, dl = Math.hypot(dv[0], dv[1]);
  var ux = dv[0] / dl, uy = dv[1] / dl, nx = -uy, ny = ux;
  var L = Math.max(120, Math.min(600, Number(P.length) || 300));
  var tipX = p.x - ux * 14, tipY = p.y - uy * 14; // the head stops just short of the spot
  var midX = tipX - ux * L / 2, midY = tipY - uy * L / 2;
  var side = (540 - midX) * nx + (960 - midY) * ny >= 0 ? 1 : -1; // bow toward the frame centre
  var bend = P.style === "swoop" ? 0.55 : P.style === "straight" ? 0.06 : 0.28;
  var H = 0.47 * L;
  function pt(u, v) { return [tipX - ux * (L - u) + nx * v * side, tipY - uy * (L - u) + ny * v * side]; }
  var t0 = pt(hash(1) * 3, hash(2) * 4);
  var c1 = pt(0.35 * L + hash(5) * 10, bend * 0.6 * H + hash(6) * 8);
  var c2 = pt(0.7 * L + hash(7) * 10, bend * 0.8 * H + hash(8) * 8);
  var ang = Math.atan2(tipY - c2[1], tipX - c2[0]);
  function f(v) { return v.toFixed(1); }
  function headSeg(da, len) { var a = ang + Math.PI + da; return "M " + f(tipX) + " " + f(tipY) + " l " + f(Math.cos(a) * len) + " " + f(Math.sin(a) * len); }

  var svg = api.svg("svg", { id: api.id("svg"), width: 1080, height: 1920, viewBox: "0 0 1080 1920", style: { position: "absolute", left: "0px", top: "0px", overflow: "visible", filter: "drop-shadow(0 0 6px rgba(" + api.RGB.night + ",0.85))", transformOrigin: f(midX) + "px " + f(midY) + "px" } });
  var defs = api.svg("defs", {}, svg);
  function ink(d, parent) { return api.svg("path", { d: d, fill: "none", stroke: col, "stroke-width": W, "stroke-linecap": "round", "stroke-linejoin": "round" }, parent || svg); }

  // stroke matrix (hwStrokeApply): sharp/spray keep their texture still and reveal through a drawn mask clone
  function strokeApply(path, type, maskId) {
    if (type === "soft") { path.style.filter = "blur(0.6px)"; return { draw: path, vis: path }; }
    if (type !== "sharp" && type !== "spray") return { draw: path, vis: path };
    var mask = api.svg("mask", { id: maskId, maskUnits: "userSpaceOnUse" }, defs);
    var clone = api.svg("path", { d: path.getAttribute("d"), fill: "none", stroke: MASK_INK, "stroke-width": W * (type === "spray" ? 2 + 5.2 / W : 1.7), "stroke-linecap": "round", "stroke-linejoin": "round" }, mask);
    var g = api.svg("g", { mask: "url(#" + maskId + ")" }, svg);
    g.appendChild(path);
    if (type === "sharp") path.setAttribute("stroke-dasharray", f(3 * W) + " " + f(1.55 * W));
    else {
      path.setAttribute("stroke-opacity", "0.5");
      path.style.filter = "blur(0.4px)";
      var len = path.getTotalLength(), n = Math.round(len * 0.16);
      for (var i = 0; i < n; i++) {
        var t = Math.min(1, Math.max(0, (i + 0.5) / n + hash(i * 7) * 0.35 / n));
        var a = path.getPointAtLength(t * len), b = path.getPointAtLength(Math.min(len, t * len + 0.5));
        var tl2 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        var off = hash(i * 7 + 1) * (2.6 + W * 0.55);
        api.svg("circle", { cx: f(a.x - (b.y - a.y) / tl2 * off), cy: f(a.y + (b.x - a.x) / tl2 * off), r: (1.1 + Math.abs(hash(i * 7 + 2)) * 1.5).toFixed(2), fill: col }, g);
      }
    }
    return { draw: clone, vis: g };
  }
  function drawOn(rec, at, dur, ease) {
    api.draw(rec.draw, at, dur, ease);
    tl.set(rec.vis, { opacity: 0 }, 0); // hide the round-cap nub before the draw
    tl.fromTo(rec.vis, { opacity: 0 }, { opacity: 1, duration: 0.01, ease: "none", immediateRender: false }, at);
  }

  var curve = ink("M " + f(t0[0]) + " " + f(t0[1]) + " C " + f(c1[0]) + " " + f(c1[1]) + ", " + f(c2[0]) + " " + f(c2[1]) + ", " + f(tipX) + " " + f(tipY));
  var rec = strokeApply(curve, P.stroke, api.id("mask"));
  var headG = api.svg("g", {}, svg);
  ink(headSeg(0.5, 36 + hash(9) * 6) + " " + headSeg(-0.5, 36 + hash(10) * 6), headG);

  // pen accelerates into the head (power2.in), the head pops on arrival
  drawOn(rec, dev.at, DRAW, "power2.in");
  var origin = f(tipX) + " " + f(tipY);
  tl.set(headG, { opacity: 0, scale: 0.45, svgOrigin: origin }, 0);
  tl.fromTo(headG, { opacity: 0, scale: 0.45, svgOrigin: origin }, { opacity: 1, scale: 1, duration: 0.24, ease: "back.out(2.4)", immediateRender: false }, dev.at + DRAW - 0.02);

  // boil (hwBoil "calm": amp 1.6 px, rot 0.5°, 30 fps / frameDrop 3) from one full-span clock
  var clock = { t: 0 }, rot = 0.5 * Math.min(1, 200 / L);
  function boil() {
    var s = Math.floor(clock.t * 10);
    svg.style.transform = "translate(" + (hash(s * 3 + 11) * 1.6).toFixed(2) + "px," + (hash(s * 3 + 12) * 1.6).toFixed(2) + "px) rotate(" + (hash(s * 3 + 13) * rot).toFixed(3) + "deg)";
  }
  boil();
  tl.fromTo(clock, { t: 0 }, { t: api.dur, duration: api.dur, ease: "none", onUpdate: boil }, 0);

  if (P.label) {
    var size = api.sizes.unit;
    var estW = P.label.length * size * 0.72, estH = size * 1.2;
    var ax = t0[0] - ux * 20, ay = t0[1] - uy * 20;
    var h = ux > 0.3 ? "right" : ux < -0.3 ? "left" : "center";
    var v = uy > 0.3 ? "bottom" : uy < -0.3 ? "top" : "middle";
    var lab = api.el("div", {
      id: api.id("label"), text: P.label,
      style: { position: "absolute", whiteSpace: "nowrap", lineHeight: "1.2", fontFamily: api.F.body, fontWeight: "800", fontSize: size + "px", letterSpacing: "0.06em", color: api.C.text, textShadow: "0 0 18px rgba(" + api.RGB.night + ",0.95), 0 0 4px rgba(" + api.RGB.night + ",0.9)" }
    });
    placeText(lab, ax, ay, h, v, estW, estH);
    api.show(lab, dev.at + 0.05, 0.4, { x: -ux * 18, y: -uy * 18 });
  }

  function placeText(node, x, y, hA, vA, w, hh) {
    var left = hA === "right" ? x - w : hA === "center" ? x - w / 2 : x;
    var top = vA === "bottom" ? y - hh : vA === "middle" ? y - hh / 2 : y;
    top = Math.max(154, Math.min(1420 - hh, top));
    var maxR = top + hh > 1000 && top < 1700 ? 960 : 1020;
    left = Math.max(60, Math.min(maxR - w, left));
    node.style.top = top.toFixed(0) + "px";
    if (hA === "right") { node.style.right = (1080 - left - w).toFixed(0) + "px"; node.style.textAlign = "right"; }
    else if (hA === "center") { node.style.left = (left + w / 2 - 540).toFixed(0) + "px"; node.style.width = "1080px"; node.style.textAlign = "center"; }
    else node.style.left = left.toFixed(0) + "px";
  }
});
