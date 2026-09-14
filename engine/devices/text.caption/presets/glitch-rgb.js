/* glitch-rgb — port of registry caption-glitch-rgb (engine/devices/text.caption/vendor/caption-glitch-rgb).
   Taken: on its start every word jerks sideways (−8…−16 px) while its text shadow splits into two colour ghosts
   (±5…12 px) — linear for 35 % of a ≤0.24 s glitch — then snaps back (65 %, power3.out); long words (≥7 letters) and
   numbers get aftershocks — smaller glitches of 0.045 + 0.075 s every 0.18 / 0.24 s until the next word; a deep dark
   drop shadow is part of the resting shadow. Own: the ghosts are hero and cold (red FF003C and cyan 00E5FF in the
   original); offsets scale with the size (the original is 88 px at 1920 wide); the per-word seed comes from api.rand()
   (the original seeds mulberry32 by word index); the frame darkening and scanline overlays are not taken — they are a
   layer of the scene, not of a caption; Space Grotesk 700 → style font; entrance is the style's. */
HygenCaptions.define("glitch-rgb", {
  family: "energetic",
  origin: "registry:caption-glitch-rgb",
  owns: { background: false, active: true, entrance: false },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, R = api.RGB, k = s.fontSize / 88;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    function px(v) { return (Math.round(v * 10) / 10) + "px"; }
    var drop = "0px " + px(5 * k) + " " + px(18 * k) + " " + tint(R.night, 0.52);
    var calm = "0px 0px 0px " + tint(R.hero, 0) + ", 0px 0px 0px " + tint(R.cold, 0) + ", " + drop;
    function split(m) { return px(m) + " 0px 0px " + tint(R.hero, 1) + ", " + px(-m) + " 0px 0px " + tint(R.cold, 1) + ", " + drop; }

    var spans = api.words();
    spans.forEach(function (sp, j) {
      var w = W[j], next = W[j + 1], at = Math.max(g.start, w.start);
      var nextStart = next ? next.start : g.end;
      var total = Math.min(0.24, Math.max(0.08, Math.min(w.end, nextStart) - w.start - 0.02));
      var d1 = total * 0.35, d2 = total * 0.65;
      var travel = -(8 + api.rand() * 8) * k, sm = (5 + api.rand() * 7) * k;
      tl.set(sp, { x: 0, textShadow: calm }, 0);
      tl.fromTo(sp, { x: 0, textShadow: calm }, { x: travel, textShadow: split(sm), duration: d1, ease: "none", immediateRender: false }, at);
      tl.fromTo(sp, { x: travel, textShadow: split(sm) }, { x: 0, textShadow: calm, duration: d2, ease: "power3.out", immediateRender: false }, at + d1);

      var until = Math.min(g.end - 0.08, nextStart - 0.04);
      if ((/\d|\$|%/.test(w.text) || w.text.replace(/[^\w]/g, "").length >= 7) && until - w.end > 0.22) {
        var p = Math.max(w.end, at + total) + 0.08, count = 0;
        while (p + 0.1 < until) {
          var pt = -(3 + api.rand() * 5) * k, ps = (3 + api.rand() * 5) * k;
          tl.fromTo(sp, { x: 0, textShadow: calm }, { x: pt, textShadow: split(ps), duration: 0.045, ease: "none", immediateRender: false }, p);
          tl.fromTo(sp, { x: pt, textShadow: split(ps) }, { x: 0, textShadow: calm, duration: 0.075, ease: "power3.out", immediateRender: false }, p + 0.045);
          count++;
          p += count % 2 === 0 ? 0.18 : 0.24;
        }
      }
    });
  }
});
