/* pill-karaoke — port of registry caption-pill-karaoke (engine/devices/text.caption/vendor/caption-pill-karaoke).
   Taken: a light rounded plate (radius ≈0.3 of the size, padding 18/60/20 at 72 px, a faint drop shadow), grey future
   words that turn dark 0.05 s before each word starts (0.1 s, linear) and stay dark — cumulative karaoke; the first
   word is dark from the group start. Own: plate = C.text (the light text tone of the look), dark ink = C.night, grey =
   night at 42 %; Poppins 700 → the style's font and weight; letter case stays the style's (the original lowercases). */
HygenCaptions.define("pill-karaoke", {
  family: "explainer",
  origin: "registry:caption-pill-karaoke",
  owns: { background: true, active: true, entrance: false },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, fs = s.fontSize, b = api.box.style;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    b.backgroundColor = api.C.text;
    b.borderRadius = Math.round(fs * 0.3) + "px";
    b.padding = Math.round(fs * 0.25) + "px " + Math.round(fs * 0.62) + "px " + Math.round(fs * 0.28) + "px";
    b.boxShadow = "0 2px 8px " + tint(api.RGB.night, 0.12) + ", 0 12px 32px " + tint(api.RGB.night, 0.3);
    b.lineHeight = "1.16";

    var ink = api.C.night, grey = tint(api.RGB.night, 0.42);
    var spans = api.words();
    spans.forEach(function (sp, i) {
      var w = g.words[i];
      tl.set(sp, { color: i === 0 ? ink : grey }, 0);
      if (i === 0) return;
      var at = Math.max(g.start, w.start - 0.05);
      tl.fromTo(sp, { color: grey }, { color: ink, duration: 0.1, ease: "none", immediateRender: false }, at);
    });
  }
});
