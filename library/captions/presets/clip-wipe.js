/* clip-wipe — port of registry caption-clip-wipe (library/devices/text.caption/vendor/caption-clip-wipe).
   Taken: every word is revealed left → right by clip-path inset on its start (0.3 s power2.out); the keyword turns
   the accent colour 0.1 s in (0.05 s); a spoken word fades to 40 % white on its end (0.2 s); the group leaves by
   wiping every word out to the right with a 0.04 s stagger (0.25 s power2.in). Own: the keyword is the longest word of
   ≥4 letters (the original lists indices by hand) and takes style.active (gold FFD700 in the original); the spent
   colour is rgba(text, 0.4); the last word stays bright until the group ends; the exit is timed to finish by g.end
   and is skipped when it would cut the last word's reveal; the inset has 20 % vertical slack so descenders survive. */
HygenCaptions.define("clip-wipe", {
  family: "explainer",
  origin: "registry:caption-clip-wipe",
  owns: { background: false, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    var key = -1, kl = 0;
    for (var i = 0; i < W.length; i++) { var n = W[i].text.replace(/[^A-Za-z0-9]/g, "").length; if (n >= 4 && n >= kl) { key = i; kl = n; } }

    var HIDE = "inset(-20% 100% -20% 0%)", SHOW = "inset(-20% 0% -20% 0%)", GONE = "inset(-20% 0% -20% 100%)";
    var spent = tint(api.RGB.text, 0.4);
    var spans = api.words();
    spans.forEach(function (sp, j) {
      var w = W[j], col = s.color;
      tl.set(sp, { clipPath: HIDE, color: s.color }, 0);
      tl.fromTo(sp, { clipPath: HIDE }, { clipPath: SHOW, duration: 0.3, ease: "power2.out", immediateRender: false }, w.start);
      if (j === key) {
        tl.fromTo(sp, { color: s.color }, { color: s.active, duration: 0.05, ease: "none", immediateRender: false }, w.start + 0.1);
        col = s.active;
      }
      if (j < W.length - 1) tl.fromTo(sp, { color: col }, { color: spent, duration: 0.2, ease: "none", immediateRender: false }, Math.max(w.end, w.start + 0.15));
    });

    var last = spans.length - 1, dur = 0.25, stagger = 0.04;
    var exitAt = g.end - dur - stagger * last;
    if (exitAt >= W[last].start + 0.3) {
      spans.forEach(function (sp, j) {
        tl.fromTo(sp, { clipPath: SHOW }, { clipPath: GONE, duration: dur, ease: "power2.in", immediateRender: false }, exitAt + j * stagger);
      });
    }
  }
});
