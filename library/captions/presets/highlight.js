/* highlight — port of registry caption-highlight (library/devices/text.caption/vendor/caption-highlight).
   Taken: a rounded marker plate behind each word (135° gradient, coloured glow shadow) that sweeps in from the left on
   the word's start (scaleX 0 → 1 with opacity, 0.15 s power2.out), leaves on its end (opacity 0, scaleX 1.02, 0.1 s
   power2.in) and collapses 0.1 s later; padding around each word, a soft dark text shadow. Own: the gradient is
   hero → heroDeep and the glow is hero (the original red FF1745 → DF1238); the in-sweep is shortened for words
   shorter than 0.15 s; the 1.05 brightness flash is not taken (invisible under the plate); Montserrat 800 → style font. */
HygenCaptions.define("highlight", {
  family: "explainer",
  origin: "registry:caption-highlight",
  owns: { background: false, active: true, entrance: false },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, C = api.C, R = api.RGB;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    var rad = Math.max(4, Math.round(s.fontSize * 0.13));
    var spans = api.words();
    spans.forEach(function (sp, i) {
      var w = g.words[i];
      sp.style.position = "relative";
      sp.style.isolation = "isolate";
      sp.style.padding = "0.04em 0.14em 0.08em";
      sp.style.textShadow = "0 6px 18px " + tint(R.night, 0.45);
      var bg = api.el("span", { style: { position: "absolute", left: "0", top: "0", right: "0", bottom: "0", zIndex: "-1", borderRadius: rad + "px", backgroundImage: "linear-gradient(135deg, " + C.hero + " 0%, " + C.heroDeep + " 100%)", boxShadow: "0 12px 30px " + tint(R.hero, 0.32), transformOrigin: "0% 50%" } }, sp);
      var inDur = Math.max(0.05, Math.min(0.15, w.end - w.start));
      tl.set(bg, { opacity: 0, scaleX: 0 }, 0);
      tl.fromTo(bg, { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: inDur, ease: "power2.out", immediateRender: false }, w.start);
      tl.fromTo(bg, { opacity: 1, scaleX: 1 }, { opacity: 0, scaleX: 1.02, duration: 0.1, ease: "power2.in", immediateRender: false }, Math.max(w.end, w.start + inDur));
      tl.set(bg, { scaleX: 0 }, Math.max(w.end, w.start + inDur) + 0.1);
    });
  }
});
