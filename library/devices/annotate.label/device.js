/* annotate.label — port of registry vox-annotate (library/devices/vendor/vox-annotate): the annotate gesture as one
   beat — marker draws (0.60 s), connector draws out of it from 0.36 s (0.45 s), the label fades up from 0.66 s
   (0.30 s), the marker breathes once as the ink lands. The marker sits on a point / area of the picture instead
   of a word of a sentence. Already seek-safe in the original (explicit fromTo on dashoffset). */
HygenDevices.define("annotate.label", function (api, dev) {
  var P = dev.params, tl = api.tl, b = dev.box, p = dev.point;
  var col = api.color(P.color, "heroLight");
  function f(v) { return v.toFixed(1); }
  var text = P.text || dev.word || "";
  var sub = P.sub || "";
  var at = dev.at, DRAW = 0.6, CONN_AT = 0.36, CONN = 0.45, NOTE_AT = 0.66, NOTE = 0.3;

  var svg = api.svg("svg", { id: api.id("svg"), width: 1080, height: 1920, viewBox: "0 0 1080 1920", style: { position: "absolute", left: "0px", top: "0px", overflow: "visible", filter: "drop-shadow(0 0 6px rgba(" + api.RGB.night + ",0.85))" } });
  var markG = api.svg("g", {}, svg);
  var ink = { fill: "none", stroke: col, "stroke-linecap": "round", "stroke-linejoin": "round" };
  function drawOn(node, t, dur, ease, alpha) {
    api.draw(node, t, dur, ease);
    tl.set(node, { opacity: 0 }, 0); // round cap paints a dot at dashoffset == length
    tl.fromTo(node, { opacity: 0 }, { opacity: alpha || 1, duration: 0.01, ease: "none", immediateRender: false }, t);
  }

  // marker: the vox "circle" stroke fitted to the area, or a ring with a dot on a point
  var mx0, mx1, my0, my1, mark;
  if (b) {
    var padX = Math.max(14, b.w * 0.08), padY = Math.max(14, b.h * 0.12);
    mx0 = b.x - padX; mx1 = b.x + b.w + padX; my0 = b.y - padY; my1 = b.y + b.h + padY;
    var src = [[22, 7], [58, 1], [95, 8], [97, 20], [99, 31], [74, 38], [44, 37], [16, 36], [2, 29], [3, 19], [4, 10], [22, 4], [52, 4.5]];
    var q = src.map(function (s) { return [mx0 + s[0] / 100 * (mx1 - mx0), my0 + s[1] / 40 * (my1 - my0)]; });
    var d = "M " + f(q[0][0]) + " " + f(q[0][1]);
    for (var i = 1; i < q.length; i += 3) d += " C " + f(q[i][0]) + " " + f(q[i][1]) + ", " + f(q[i + 1][0]) + " " + f(q[i + 1][1]) + ", " + f(q[i + 2][0]) + " " + f(q[i + 2][1]);
    mark = api.svg("path", Object.assign({ d: d, "stroke-width": 5 }, ink), markG);
  } else {
    var R = 22;
    mx0 = p.x - R; mx1 = p.x + R; my0 = p.y - R; my1 = p.y + R;
    mark = api.svg("path", Object.assign({ d: "M " + f(p.x) + " " + f(p.y - R) + " A " + R + " " + R + " 0 1 1 " + f(p.x - 0.1) + " " + f(p.y - R), "stroke-width": 5 }, ink), markG);
    var dot = api.svg("circle", { cx: f(p.x), cy: f(p.y), r: 7, fill: col }, markG);
    var od = f(p.x) + " " + f(p.y);
    tl.set(dot, { opacity: 0, scale: 0, svgOrigin: od }, 0);
    tl.fromTo(dot, { opacity: 0, scale: 0, svgOrigin: od }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.5)", immediateRender: false }, at);
  }
  var mcx = (mx0 + mx1) / 2, mcy = (my0 + my1) / 2;
  drawOn(mark, at, DRAW, "power2.inOut");
  var om = f(mcx) + " " + f(mcy);
  tl.set(markG, { scale: 1, svgOrigin: om }, 0);
  tl.fromTo(markG, { scale: 1, svgOrigin: om }, { scale: 1.045, duration: 0.16, ease: "power1.out", yoyo: true, repeat: 1, immediateRender: false }, at + DRAW * 0.7);

  // label block size (estimates: fonts may still be loading at mount); size, font, case, background, type — shared text schema
  var T = window.HygenText;
  var size = T.px("label", P.size, api.sizes), subSize = Math.round(size * 0.81);
  var estW = Math.max(text.length * size * 0.74, sub.length * subSize * 0.62), estH = size * 1.2 + (sub ? subSize * 1.35 : 0);
  function geom(s) {
    if (s === "right") { var M = [mx1 + 4, mcy - (my1 - my0) * 0.18]; return { M: M, E: [M[0] + 130, M[1] - 110] }; }
    if (s === "left") { var Ml = [mx0 - 4, mcy - (my1 - my0) * 0.18]; return { M: Ml, E: [Ml[0] - 130, Ml[1] - 110] }; }
    if (s === "top") { var Mt = [mcx + (mx1 - mx0) * 0.15, my0 - 4]; return { M: Mt, E: [Mt[0] + 60, Mt[1] - 150] }; }
    var Mb = [mcx + (mx1 - mx0) * 0.15, my1 + 4]; return { M: Mb, E: [Mb[0] + 60, Mb[1] + 150] };
  }
  function fits(s) {
    var E = geom(s).E;
    if (s === "right") return E[0] + 12 + estW <= (E[1] > 1000 && E[1] < 1700 ? 960 : 1020) && E[1] - estH / 2 >= 140;
    if (s === "left") return E[0] - 12 - estW >= 60 && E[1] - estH / 2 >= 140;
    if (s === "top") return E[1] - 10 - estH >= 140 && E[0] - estW / 2 >= 60 && E[0] + estW / 2 <= 1020;
    return E[1] + 10 + estH <= 1420 && E[0] - estW / 2 >= 60 && E[0] + estW / 2 <= 1020;
  }
  var side = P.side;
  if (!side || side === "auto") {
    var order = mcx <= 540 ? ["right", "left", "top", "bottom"] : ["left", "right", "top", "bottom"];
    side = order[0];
    for (var o = 0; o < order.length; o++) if (fits(order[o])) { side = order[o]; break; }
  }
  var g = geom(side), M = g.M, E = g.E;
  var cx1 = M[0] + (E[0] - M[0]) * 0.2, cy1 = M[1] + (E[1] - M[1]) * 0.75;
  var conn = api.svg("path", { d: "M " + f(M[0]) + " " + f(M[1]) + " C " + f(cx1) + " " + f(cy1) + ", " + f(M[0] + (E[0] - M[0]) * 0.6) + " " + f(E[1]) + ", " + f(E[0]) + " " + f(E[1]), fill: "none", stroke: col, "stroke-width": 3, "stroke-linecap": "round" }, svg);
  drawOn(conn, at + CONN_AT, CONN, "power2.out", 0.9);

  if (text || sub) {
    var shadow = "0 0 16px rgba(" + api.RGB.night + ",0.95), 0 0 4px rgba(" + api.RGB.night + ",0.9)";
    var hA = side === "right" ? "left" : side === "left" ? "right" : "center";
    var block = api.el("div", { id: api.id("label"), style: { position: "absolute", whiteSpace: "nowrap", textShadow: shadow } });
    if (text) api.el("div", { text: text, style: { fontFamily: P.font === "display" ? api.F.display : api.F.body, fontWeight: P.font === "display" ? "600" : "700", fontSize: size + "px", lineHeight: "1.2", letterSpacing: P["case"] === "normal" ? "0.02em" : "0.1em", textTransform: P["case"] === "normal" ? "none" : "uppercase", color: col } }, block);
    if (sub) api.el("div", { text: sub, style: { fontFamily: api.F.body, fontWeight: "500", fontSize: subSize + "px", lineHeight: "1.35", letterSpacing: "0.04em", color: api.C.text, opacity: "0.82" } }, block);
    if (P.background && P.background !== "none") T.background(block, P.background, { RGB: api.RGB, C: api.C, text: col });
    var ax = side === "right" ? E[0] + 12 : side === "left" ? E[0] - 12 : E[0];
    var ay = side === "top" ? E[1] - 10 : side === "bottom" ? E[1] + 10 : E[1];
    placeText(block, ax, ay, hA, side === "top" ? "bottom" : side === "bottom" ? "top" : "middle", estW, estH);
    if (P.type && P.type !== "none") T.enter(tl, block, at + NOTE_AT, P.type, { heroRgb: api.RGB.hero });
    else api.show(block, at + NOTE_AT, NOTE, { y: 14 });
  }

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
