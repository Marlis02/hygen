/* matrix-decode — port of registry caption-matrix-decode (engine/devices/text.caption/vendor/caption-matrix-decode).
   Taken: a word is invisible until it is spoken, then shows two scrambles of random letters and digits of its own
   length — 0.1 s each — and resolves into the real word; the scrambles sit over the real word's slot, so the layout
   never moves; all steps are tl.set. Own: scrambles are seeded by api.rand() (the original seeds by word index) and
   drawn in style.active, the resolved word in style.color (all neon green 00FF41 in the original); the two steps
   shrink to half the word for words shorter than 0.2 s; a dark text shadow for video; Space Grotesk 700 → style
   font; the group entrance is the style's. */
HygenCaptions.define("matrix-decode", {
  family: "energetic",
  origin: "registry:caption-matrix-decode",
  owns: { background: false, active: true, entrance: false },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, R = api.RGB;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    function scramble(len) {
      var out = "";
      for (var i = 0; i < len; i++) out += GLYPHS.charAt(Math.floor(api.rand() * GLYPHS.length) % GLYPHS.length);
      return out;
    }
    api.box.style.textShadow = "0 3px 14px " + tint(R.night, 0.55);

    var spans = api.words();
    spans.forEach(function (sp, j) {
      var w = W[j], txt = sp.textContent, at = Math.max(g.start, w.start);
      var step = Math.max(0.04, Math.min(0.1, (w.end - w.start) / 2));
      sp.textContent = "";
      var real = api.el("span", { text: txt, style: { color: s.color } }, sp);
      var a = api.el("span", { text: scramble(txt.length), style: { position: "absolute", left: "0px", top: "0px", whiteSpace: "nowrap", color: s.active } }, sp);
      var b = api.el("span", { text: scramble(txt.length), style: { position: "absolute", left: "0px", top: "0px", whiteSpace: "nowrap", color: s.active } }, sp);
      tl.set([real, a, b], { opacity: 0 }, 0);
      tl.set(a, { opacity: 1 }, at);
      tl.set(a, { opacity: 0 }, at + step);
      tl.set(b, { opacity: 1 }, at + step);
      tl.set(b, { opacity: 0 }, at + 2 * step);
      tl.set(real, { opacity: 1 }, at + 2 * step);
    });
  }
});
