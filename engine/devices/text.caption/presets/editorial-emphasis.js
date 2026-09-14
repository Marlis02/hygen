/* editorial-emphasis — port of registry caption-editorial-emphasis (engine/devices/text.caption/vendor/caption-editorial-emphasis).
   Taken: a left-aligned block of up to two lines; plain words in the body font, one emphasis word ≈2× larger in a
   heavy italic serif with tight leading; every word appears on its own start (opacity, scale 1.12 → 1 from the bottom
   left, 0.1 s power2.out), the emphasis word slides in from the left (0.2 s power2.out); cream text with a double dark
   shadow. Own: the emphasis word is picked automatically (the longest word of ≥4 letters, later on a tie) instead of a
   hand-written block list; Playfair Display 800 italic → style display font (Cormorant) 700 italic, Inter 400 → body
   font 400; the slide starts half the text width away, not 1920 px off-frame; the emphasis shrinks to fit maxWidth; the big word is marked data-layout-allow-overlap (its font box, not its ink, meets the other line). */
HygenCaptions.define("editorial-emphasis", {
  family: "calm",
  origin: "registry:caption-editorial-emphasis",
  owns: { background: false, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, fs = s.fontSize;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    function letters(w) { return w.text.replace(/[^A-Za-z0-9]/g, "").length; }

    var key = -1, kl = 0;
    for (var i = 0; i < W.length; i++) { var n = letters(W[i]); if (n >= 4 && n >= kl) { key = i; kl = n; } }

    // lines: [ [index, emphasis?], … ]
    var lines;
    if (key < 0 || W.length < 2) lines = [W.map(function (_, j) { return [j, j === key]; })];
    else if (key === 0) lines = [[[0, true]], W.slice(1).map(function (_, j) { return [j + 1, false]; })];
    else lines = [W.slice(0, key).map(function (_, j) { return [j, false]; }), W.slice(key).map(function (_, j) { return [key + j, j === 0]; })];

    var em = s.textTransform === "uppercase" ? 0.66 : 0.56;
    var emphSize = fs * 1.9;
    if (key >= 0) {
      var rest = 0;
      lines.forEach(function (ln) { if (ln.some(function (p) { return p[1]; })) ln.forEach(function (p) { if (!p[1]) rest += W[p[0]].text.length + 1; }); });
      var room = s.maxWidth - rest * em * fs;
      var ef = s.textTransform === "uppercase" ? 0.74 : 0.5; // average advance of the italic serif, em
      emphSize = Math.max(fs * 1.1, Math.min(emphSize, room / Math.max(1, W[key].text.length * ef)));
    }

    var shadow = "0 2px 12px " + tint(api.RGB.night, 0.6) + ", 0 4px 24px " + tint(api.RGB.night, 0.35);
    api.box.style.textAlign = "left";
    var gap = Math.round(fs * 0.24);
    var slide = -Math.round(s.maxWidth * 0.5);

    lines.forEach(function (ln, li) {
      // the original keeps 8 px between lines at an 86 px body size
      var line = api.el("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: gap + "px", lineHeight: "1.1", color: s.color, marginTop: li ? Math.round(fs * 0.1) + "px" : "0px" } }, api.box);
      ln.forEach(function (p) {
        var w = W[p[0]], emph = p[1];
        // tight leading is the look: the font box of the big word reaches the next line, its letters do not
        var span = api.el("span", { text: w.text, "data-layout-allow-overlap": emph ? "" : null, style: emph
          ? { display: "inline-block", fontFamily: api.F.display, fontWeight: "700", fontStyle: "italic", fontSize: Math.round(emphSize) + "px", lineHeight: "0.9", textShadow: shadow }
          : { display: "inline-block", fontFamily: api.F.body, fontWeight: "400", fontSize: fs + "px", textShadow: shadow } }, line);
        if (emph && lines.length > 1) {
          tl.set(span, { opacity: 0, x: slide }, 0);
          tl.fromTo(span, { opacity: 0, x: slide }, { opacity: 1, x: 0, duration: 0.2, ease: "power2.out", immediateRender: false }, w.start);
        } else {
          tl.set(span, { opacity: 0, scale: 1.12, transformOrigin: "0% 100%" }, 0);
          tl.fromTo(span, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.1, ease: "power2.out", immediateRender: false }, w.start);
        }
      });
    });
  }
});
