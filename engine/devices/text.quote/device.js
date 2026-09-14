/* text.quote — own device (engine/devices/text.quote/device.json): quote mark, words one by one, author and year. */
HygenDevices.define("text.quote", function (api, dev) {
  var P = dev.params, tl = api.tl, at = dev.at;
  var box = dev.box || { x: 90, y: 520, w: 900, h: 730 };
  var fs = P.size === "large" ? 76 : 60;
  var wrap = api.el("div", { id: api.id("wrap"), style: { position: "absolute", left: box.x + "px", top: box.y + "px", width: box.w + "px" } });
  var mark = api.el("div", { id: api.id("mark"), text: "“", style: { fontFamily: api.F.display, fontWeight: "700", fontSize: "260px", lineHeight: "0.9", height: "150px", color: api.C.hero, textShadow: "0 0 40px rgba(" + api.RGB.hero + ",0.35)" } }, wrap);
  api.show(mark, at, 0.5, { y: 30 });
  var body = api.el("div", { id: api.id("body"), style: { fontFamily: api.F.display, fontWeight: "600", fontSize: fs + "px", lineHeight: "1.12", color: api.C.text, textShadow: "0 0 18px rgba(" + api.RGB.night + ",0.8)" } }, wrap);
  var words = (P.text || dev.word || "").split(/\s+/).filter(Boolean);
  words.forEach(function (w, i) {
    var s = api.el("span", { id: api.id("w" + i), text: w + (i < words.length - 1 ? " " : ""), style: { display: "inline-block", whiteSpace: "pre" } }, body);
    api.show(s, at + 0.25 + i * P.wordStep, 0.35, { y: 18 });
  });
  var tail = at + 0.25 + words.length * P.wordStep + 0.2;
  if (P.author || P.year) {
    var by = api.el("div", { id: api.id("by"), text: "— " + [P.author, P.year].filter(Boolean).join(", "), style: { marginTop: "36px", fontFamily: api.F.body, fontWeight: "700", fontSize: api.sizes.label + "px", letterSpacing: "0.16em", textTransform: "uppercase", color: api.C.heroLight } }, wrap);
    api.show(by, tail, 0.45, { x: -20 });
  }
});
