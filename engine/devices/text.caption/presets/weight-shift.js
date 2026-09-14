/* weight-shift — port of registry caption-weight-shift (engine/devices/text.caption/vendor/caption-weight-shift).
   Taken: the group always splits into two balanced lines, line 1 bold and line 2 light; when the first word of line 2
   is spoken the weights swap in 0.1 s (power2.out); the group pops in from scale 0.85 in 0.1 s (power3.out); tracking
   −0.03em and a soft shadow. Own: Inter 800/400 instead of Montserrat 700/300 (the style ships 400–800), lines are
   balanced by letters instead of canvas metrics (fonts may still be loading at mount), the size shrinks only when a
   line would be wider than style.maxWidth, the letter case stays the style's (the original lowercases). */
HygenCaptions.define("weight-shift", {
  family: "calm",
  origin: "registry:caption-weight-shift",
  owns: { background: false, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, BOLD = 800, LIGHT = 400;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    function chars(list) { return list.reduce(function (n, w, i) { return n + w.text.length + (i ? 1 : 0); }, 0); }

    var split = W.length;
    if (W.length >= 2) {
      var total = chars(W), best = Infinity;
      for (var k = 1; k < W.length; k++) {
        var a = chars(W.slice(0, k)), diff = Math.abs(a - (total - a - 1));
        if (diff < best) { best = diff; split = k; }
      }
    }
    var parts = split < W.length ? [W.slice(0, split), W.slice(split)] : [W];
    var em = s.textTransform === "uppercase" ? 0.68 : 0.58;
    var widest = Math.max.apply(null, parts.map(chars));
    var fs = Math.max(28, Math.min(s.fontSize, Math.floor(s.maxWidth / Math.max(1, widest * em))));
    var shadow = "0 2px 4px " + tint(api.RGB.night, 0.3) + ", 0 0 18px " + tint(api.RGB.night, 0.35);

    var lines = parts.map(function (p, li) {
      var line = api.el("div", { style: { display: "block", whiteSpace: "nowrap", textAlign: "center", fontSize: fs + "px", lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: String(li === 0 ? BOLD : LIGHT), textShadow: shadow } }, api.box);
      p.forEach(function (w, i) {
        api.el("span", { text: w.text, style: { display: "inline-block", marginRight: i < p.length - 1 ? "0.24em" : "0" } }, line);
      });
      return line;
    });

    tl.set(api.box, { opacity: 0, scale: 0.85, transformOrigin: "50% 50%" }, 0);
    tl.fromTo(api.box, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.1, ease: "power3.out", immediateRender: false }, g.start);

    if (lines.length === 2) {
      var at = parts[1][0].start;
      tl.set(lines[0], { fontWeight: BOLD }, 0);
      tl.set(lines[1], { fontWeight: LIGHT }, 0);
      tl.fromTo(lines[0], { fontWeight: BOLD }, { fontWeight: LIGHT, duration: 0.1, ease: "power2.out", immediateRender: false }, at);
      tl.fromTo(lines[1], { fontWeight: LIGHT }, { fontWeight: BOLD, duration: 0.1, ease: "power2.out", immediateRender: false }, at);
    }
  }
});
