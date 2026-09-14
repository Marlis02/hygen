/* gradient-fill — port of registry caption-gradient-fill (engine/devices/text.caption/vendor/caption-gradient-fill).
   Taken: text painted by background-clip: text with a 350 %-wide gradient — a colour band (0–50 %) and a flat text
   colour (50.5–100 %); a resting word shows the flat part (position 100 %); on its start the word grows to 1.04 and
   the colour band sweeps through it for the length of the word (position 45 % → 0 %, linear); on its end the flat
   colour snaps back and the word settles to 1 (0.15 s power2.out). Own: the band is accentHot → accent → hero →
   heroLight → coldLight → accentHot (the original Siri orange/pink/violet), the flat part is style.color; a dark
   drop-shadow filter on the box instead of nothing (clipped text cannot carry a text-shadow); Montserrat 900 → style font. */
HygenCaptions.define("gradient-fill", {
  family: "explainer",
  ink: "light",
  origin: "registry:caption-gradient-fill",
  owns: { background: false, active: true, entrance: false },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, C = api.C, W = g.words;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    var band = "linear-gradient(90deg, " + C.accentHot + " 0%, " + C.accent + " 10%, " + C.hero + " 20%, " + C.heroLight + " 30%, " + C.coldLight + " 40%, " + C.accentHot + " 50%, " + s.color + " 50.5%, " + s.color + " 100%)";
    api.box.style.filter = "drop-shadow(0 3px 10px " + tint(api.RGB.night, 0.55) + ")";

    var spans = api.words();
    spans.forEach(function (sp, i) {
      var w = W[i], st = sp.style;
      st.backgroundImage = band;
      st.backgroundSize = "350% 100%";
      st.backgroundRepeat = "no-repeat";
      st.webkitBackgroundClip = "text";
      st.backgroundClip = "text";
      st.color = "transparent";
      st.webkitTextFillColor = "transparent";
      st.textShadow = "none";
      st.paddingBottom = "0.05em";
      tl.set(sp, { backgroundPosition: "100% 0%", scale: 1 }, 0);
      tl.set(sp, { scale: 1.04 }, w.start);
      tl.fromTo(sp, { backgroundPosition: "45% 0%" }, { backgroundPosition: "0% 0%", duration: Math.max(0.05, w.end - w.start), ease: "none", immediateRender: false }, w.start);
      tl.set(sp, { backgroundPosition: "100% 0%" }, Math.max(w.end, w.start + 0.05));
      tl.fromTo(sp, { scale: 1.04 }, { scale: 1, duration: 0.15, ease: "power2.out", immediateRender: false }, Math.max(w.end, w.start + 0.05));
    });
  }
});
