/* annotate.circle — port of registry hw-callout-circle (engine/devices/vendor/hw-callout-circle): wobble ellipse,
   scribble hatch, curved connector, label pop from the connector tip and the contact squash of the shapes.
   Changes for seek-safety: squash and boil run as tl property tweens / one full-span clock (no eventCallback);
   new: grow mode (the ring scales from its centre with a non-scaling stroke). */
HygenDevices.define("annotate.circle", function (api, dev) {
  var P = dev.params, tl = api.tl, b = dev.box, p = dev.point;
  var col = api.color(P.color, "heroLight");
  var W = 6;
  var seed = 1 + Math.floor(api.rand() * 96);
  function hash(n) { var x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
  function f(v) { return v.toFixed(1); }

  var cx = p.x, cy = p.y, rx, ry;
  if (b) { rx = b.w / 2 * 1.1 + 12; ry = b.h / 2 * 1.14 + 12; }
  else { rx = ry = Math.max(20, Number(P.radius) || 140); }

  // hwWobbleEllipse: 14 wobbled points joined by quadratic midpoints
  function wobbleEllipse() {
    var N = 14, pts = [];
    for (var i = 0; i < N; i++) {
      var a = i / N * Math.PI * 2, wr = 1 + hash(i * 13 + 5) * 0.04;
      pts.push([cx + Math.cos(a) * rx * wr, cy + Math.sin(a) * ry * wr]);
    }
    var d = "M" + f((pts[0][0] + pts[N - 1][0]) / 2) + " " + f((pts[0][1] + pts[N - 1][1]) / 2);
    for (var j = 0; j < N; j++) {
      var q = pts[(j + 1) % N];
      d += " Q" + f(pts[j][0]) + " " + f(pts[j][1]) + " " + f((pts[j][0] + q[0]) / 2) + " " + f((pts[j][1] + q[1]) / 2);
    }
    return d;
  }

  var svg = api.svg("svg", { id: api.id("svg"), width: 1080, height: 1920, viewBox: "0 0 1080 1920", style: { position: "absolute", left: "0px", top: "0px", overflow: "visible", filter: "drop-shadow(0 0 6px rgba(" + api.RGB.night + ",0.85))", transformOrigin: f(cx) + "px " + f(cy) + "px" } });
  var growG = api.svg("g", {}, svg);
  var deform = api.svg("g", {}, growG);
  var grow = P.grow === true;
  var stroke = { fill: "none", stroke: col, "stroke-linecap": "round", "stroke-linejoin": "round" };
  function path(d, width, parent, extra) {
    var a = Object.assign({ d: d, "stroke-width": width }, stroke, extra || {});
    if (grow) a["vector-effect"] = "non-scaling-stroke"; // grow never dash-draws, so a non-scaling stroke is safe
    return api.svg("path", a, parent);
  }

  var scribble = null;
  if (P.scribble) {
    // one point per row alternating sides: a real zigzag (the component's paired points read as stacked bars on wide ellipses)
    var d = "", rows = Math.max(9, Math.round(ry * 2 / 20));
    for (var i = 0; i < rows; i++) {
      var yy = cy - ry + (i + 0.5) / rows * ry * 2;
      var half = Math.sqrt(Math.max(0.05, 1 - Math.pow((yy - cy) / ry, 2)));
      var xw = rx * half * 0.86;
      var xs = i % 2 ? cx - xw + hash(i * 7 + 2) * 8 : cx + xw + hash(i * 7 + 3) * 8;
      d += (i === 0 ? "M " : " L ") + f(xs) + " " + f(yy + hash(i * 7 + 4) * 4);
    }
    scribble = path(d, 3, deform, { stroke: api.C.hero, "stroke-opacity": 0.5 });
  }
  var outline = path(wobbleEllipse(), W, deform);

  // label + connector: side with room (right → left → top → bottom)
  var size = Math.round(api.sizes.unit * 0.83);
  var estW = (P.label || "").length * size * 0.72, estH = size * 1.2;
  function geom(s) {
    var S, E, C;
    if (s === "right" || s === "left") {
      var k = s === "right" ? 1 : -1;
      S = [cx + k * rx * 0.94, cy + ry * 0.34]; E = [S[0] + k * 80, S[1] + 60]; C = [(S[0] + E[0]) / 2 + hash(21) * 14, S[1] + 50];
    } else {
      var kv = s === "bottom" ? 1 : -1;
      S = [cx + rx * 0.25, cy + kv * ry * 0.97]; E = [S[0] + 50, S[1] + kv * 80]; C = [S[0] + 6 + hash(21) * 10, S[1] + kv * 55];
    }
    return { S: S, E: E, C: C };
  }
  function fits(s) {
    var g = geom(s), E = g.E;
    if (s === "right") return E[0] + 14 + estW <= (E[1] > 1000 && E[1] < 1700 ? 960 : 1020);
    if (s === "left") return E[0] - 14 - estW >= 60;
    if (s === "top") return E[1] - 8 - estH >= 140;
    return E[1] + 8 + estH <= 1420;
  }
  var side = P.labelSide;
  if (!side || side === "auto") {
    side = "right";
    var order = ["right", "left", "top", "bottom"];
    for (var o = 0; o < order.length; o++) if (fits(order[o])) { side = order[o]; break; }
  }

  function drawOn(node, at, dur, ease) {
    api.draw(node, at, dur, ease);
    tl.set(node, { opacity: 0 }, 0); // hide the round-cap nub before the draw
    tl.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.01, ease: "none", immediateRender: false }, at);
  }

  var t = dev.at;
  if (grow) {
    var gd = Math.max(0.3, Number(P.growDur) || 1.2), o2 = f(cx) + " " + f(cy);
    tl.set(growG, { opacity: 0, scale: 0.02, svgOrigin: o2 }, 0);
    tl.fromTo(growG, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none", immediateRender: false }, t);
    tl.fromTo(growG, { scale: 0.02, svgOrigin: o2 }, { scale: 1, duration: gd, ease: "power2.out", immediateRender: false }, t);
    t += gd;
    if (scribble) { drawOn(scribble, t - 0.2, 0.55, "power2.inOut"); t += 0.4; }
  } else {
    drawOn(outline, t, 0.7, "power2.inOut"); t += 0.7 * 0.85;
    if (scribble) { drawOn(scribble, t, 0.55, "power2.inOut"); t += 0.55 * 0.85; }
  }

  if (P.label) {
    var g = geom(side), S = g.S, E = g.E;
    var conn = api.svg("path", { d: "M " + f(S[0]) + " " + f(S[1]) + " Q " + f(g.C[0]) + " " + f(g.C[1]) + " " + f(E[0]) + " " + f(E[1]), fill: "none", stroke: col, "stroke-width": 4, "stroke-linecap": "round" }, svg);
    drawOn(conn, t, 0.35, "power2.inOut"); t += 0.35 * 0.85;
    var lab = api.el("div", {
      id: api.id("label"), text: P.label,
      style: { position: "absolute", whiteSpace: "nowrap", lineHeight: "1.2", fontFamily: api.F.body, fontWeight: "800", fontSize: size + "px", letterSpacing: "0.05em", color: api.C.text, textShadow: "0 0 18px rgba(" + api.RGB.night + ",0.95), 0 0 4px rgba(" + api.RGB.night + ",0.9)" }
    });
    var hA = side === "right" ? "left" : side === "left" ? "right" : "center";
    var vA = side === "top" ? "bottom" : side === "bottom" ? "top" : "middle";
    var ax = side === "right" ? E[0] + 14 : side === "left" ? E[0] - 14 : E[0];
    var ay = side === "top" ? E[1] - 8 : side === "bottom" ? E[1] + 8 : E[1];
    placeText(lab, ax, ay, hA, vA, estW, estH);
    var origin = hA === "left" ? "0% 50%" : hA === "right" ? "100% 50%" : vA === "top" ? "50% 0%" : "50% 100%";
    // pop arrives with momentum (power2.in) — the shapes absorb it with a volume-preserving squash
    tl.set(lab, { opacity: 0, scale: 0.001, transformOrigin: origin }, 0);
    tl.fromTo(lab, { opacity: 0 }, { opacity: 1, duration: 0.08, ease: "none", immediateRender: false }, t);
    tl.fromTo(lab, { scale: 0.001 }, { scale: 1, duration: 0.3, ease: "power2.in", immediateRender: false }, t);
    var Sq = Math.min(0.08 * ((2 * rx / 0.3) / 2000), 0.25);
    var o3 = f(cx) + " " + f(cy + ry);
    tl.set(deform, { scaleX: 1, scaleY: 1, svgOrigin: o3 }, 0);
    tl.fromTo(deform, { scaleX: 1, scaleY: 1, svgOrigin: o3 }, { scaleX: 1 / (1 - Sq), scaleY: 1 - Sq, duration: 2 / 30, ease: "power3.out", immediateRender: false }, t + 0.3);
    tl.fromTo(deform, { scaleX: 1 / (1 - Sq), scaleY: 1 - Sq }, { scaleX: 1, scaleY: 1, duration: 0.45, ease: "power3.out", immediateRender: false }, t + 0.3 + 3 / 30);
  }

  // boil (hwBoil "calm") from one full-span clock
  var clock = { t: 0 }, rot = 0.5 * Math.min(1, 160 / Math.max(rx, ry));
  function boil() {
    var s = Math.floor(clock.t * 10);
    svg.style.transform = "translate(" + (hash(s * 3 + 31) * 1.6).toFixed(2) + "px," + (hash(s * 3 + 32) * 1.6).toFixed(2) + "px) rotate(" + (hash(s * 3 + 33) * rot).toFixed(3) + "deg)";
  }
  boil();
  tl.fromTo(clock, { t: 0 }, { t: api.dur, duration: api.dur, ease: "none", onUpdate: boil }, 0);

  function placeText(node, x, y, hA2, vA2, w, hh) {
    var left = hA2 === "right" ? x - w : hA2 === "center" ? x - w / 2 : x;
    var top = vA2 === "bottom" ? y - hh : vA2 === "middle" ? y - hh / 2 : y;
    top = Math.max(154, Math.min(1420 - hh, top));
    var maxR = top + hh > 1000 && top < 1700 ? 960 : 1020;
    left = Math.max(60, Math.min(maxR - w, left));
    node.style.top = top.toFixed(0) + "px";
    if (hA2 === "right") { node.style.right = (1080 - left - w).toFixed(0) + "px"; node.style.textAlign = "right"; }
    else if (hA2 === "center") { node.style.left = (left + w / 2 - 540).toFixed(0) + "px"; node.style.width = "1080px"; node.style.textAlign = "center"; }
    else node.style.left = left.toFixed(0) + "px";
  }
});
