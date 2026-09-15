/* text.quote — own device (library/devices/text.quote/device.json): quote mark, words one by one, author and year.
   Shared text schema (library/devices/text.schema.json): font, size, case, color, background of the quote body; position
   without a target area; type — one entrance of the whole body instead of the words one by one. */
HygenDevices.define("text.quote", function (api, dev) {
  var P = dev.params, tl = api.tl, at = dev.at, T = window.HygenText;
  var box = dev.box || (P.position === "top" ? { x: 90, y: 200, w: 900, h: 700 } : P.position === "bottom" ? { x: 90, y: 700, w: 900, h: 700 } : { x: 90, y: 520, w: 900, h: 730 });
  var fs = T.px("quote", P.size, api.sizes);
  var body = P.font === "body";
  var wrap = api.el("div", { id: api.id("wrap"), style: { position: "absolute", left: box.x + "px", top: box.y + "px", width: box.w + "px" } });
  var mark = api.el("div", { id: api.id("mark"), text: "“", style: { fontFamily: api.F.display, fontWeight: "700", fontSize: "260px", lineHeight: "0.9", height: "150px", color: api.C.hero, textShadow: "0 0 40px rgba(" + api.RGB.hero + ",0.35)" } }, wrap);
  mark.setAttribute("data-layout-allow-overlap", ""); // the big quote mark sits behind the first words on purpose
  api.show(mark, at, 0.5, { y: 30 });
  var bodyEl = api.el("div", { id: api.id("body"), style: { fontFamily: body ? api.F.body : api.F.display, fontWeight: body ? "700" : "600", fontSize: fs + "px", lineHeight: "1.12", color: T.color(api.C, P.color, "text"), textShadow: "0 0 18px rgba(" + api.RGB.night + ",0.8)", textTransform: P["case"] === "upper" ? "uppercase" : "none" } }, wrap);
  if (P.background && P.background !== "none") T.background(bodyEl, P.background, { RGB: api.RGB, C: api.C, row: wrap, text: T.color(api.C, P.color, "text") });
  var words = (P.text || dev.word || "").split(/\s+/).filter(Boolean);
  var own = P.type && P.type !== "none";
  words.forEach(function (w, i) {
    var s = api.el("span", { id: api.id("w" + i), text: w + (i < words.length - 1 ? " " : ""), style: { display: "inline-block", whiteSpace: "pre" } }, bodyEl);
    if (!own) api.show(s, at + 0.25 + i * P.wordStep, 0.35, { y: 18 });
  });
  if (own) T.enter(tl, bodyEl, at + 0.25, P.type, { heroRgb: api.RGB.hero });
  var tail = at + 0.25 + (own ? 0.6 : words.length * P.wordStep) + 0.2;
  if (P.author || P.year) {
    var by = api.el("div", { id: api.id("by"), text: "— " + [P.author, P.year].filter(Boolean).join(", "), style: { marginTop: "36px", fontFamily: api.F.body, fontWeight: "700", fontSize: api.sizes.label + "px", letterSpacing: "0.16em", textTransform: "uppercase", color: api.C.heroLight } }, wrap);
    api.show(by, tail, 0.45, { x: -20 });
  }
});
