/* annotate.measure — own device (library/devices/annotate.measure/device.json): a dimension line with ticks and a label. */
HygenDevices.define("annotate.measure", function (api, dev) {
  var P = dev.params, b = dev.box, tl = api.tl;
  var x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
  var len = Math.hypot(x2 - x1, y2 - y1) || 1;
  var nx = -(y2 - y1) / len, ny = (x2 - x1) / len; // unit normal
  var col = api.color(P.color, "heroLight");
  var tick = 26;
  var g = api.svg("svg", { id: api.id("svg"), width: 1080, height: 1920, viewBox: "0 0 1080 1920", style: { position: "absolute", left: "0px", top: "0px", overflow: "visible" } });
  var shadow = "drop-shadow(0 0 6px rgba(" + api.RGB.night + ",0.9))";
  g.style.filter = shadow;
  var line = api.svg("path", { d: "M" + x1 + " " + y1 + " L" + x2 + " " + y2, stroke: col, "stroke-width": 5, fill: "none", "stroke-linecap": "round" }, g);
  var t1 = api.svg("path", { d: "M" + (x1 - nx * tick) + " " + (y1 - ny * tick) + " L" + (x1 + nx * tick) + " " + (y1 + ny * tick), stroke: col, "stroke-width": 5, fill: "none", "stroke-linecap": "round" }, g);
  var t2 = api.svg("path", { d: "M" + (x2 - nx * tick) + " " + (y2 - ny * tick) + " L" + (x2 + nx * tick) + " " + (y2 + ny * tick), stroke: col, "stroke-width": 5, fill: "none", "stroke-linecap": "round" }, g);
  var d = P.draw;
  api.draw(t1, dev.at, 0.18, "power2.out");
  api.draw(line, dev.at + 0.12, d, "power2.inOut");
  api.draw(t2, dev.at + 0.12 + d * 0.9, 0.18, "power2.out");

  if (P.label) {
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    var side = P.side === "auto" ? (mx > 540 ? "left" : "right") : P.side;
    var off = 34;
    var lab = api.el("div", {
      id: api.id("label"),
      text: P.label,
      style: {
        position: "absolute", top: (my - 40) + "px", whiteSpace: "nowrap",
        fontFamily: api.F.body, fontWeight: "800", fontSize: api.sizes.unit + "px", letterSpacing: "0.06em",
        color: api.C.text, textShadow: "0 0 18px rgba(" + api.RGB.night + ",0.95), 0 0 4px rgba(" + api.RGB.night + ",0.9)"
      }
    });
    if (side === "left") { lab.style.right = (1080 - mx + off) + "px"; lab.style.textAlign = "right"; }
    else { lab.style.left = (mx + off) + "px"; }
    var bar = api.el("div", { id: api.id("bar"), style: { position: "absolute", top: (my + 16) + "px", height: "4px", width: "64px", backgroundColor: col } });
    if (side === "left") bar.style.left = (mx - off - 64) + "px"; else bar.style.left = (mx + off) + "px";
    tl.set(bar, { scaleX: 0, transformOrigin: side === "left" ? "right center" : "left center" }, 0);
    tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "power3.out", immediateRender: false }, dev.at + 0.12 + d * 0.9);
    api.show(lab, dev.at + 0.12 + d * 0.9, 0.4, { x: side === "left" ? 24 : -24 });
  }
});
