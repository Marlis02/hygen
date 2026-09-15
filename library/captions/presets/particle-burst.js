/* particle-burst — port of registry caption-particle-burst (library/devices/text.caption/vendor/caption-particle-burst).
   Taken: unspoken words at 45 % of the text colour; the spoken word turns full colour and grows (1.05, the keyword
   1.12 in the accent colour, 0.08 s) and settles back (0.1 s); the keyword fires 10 round particles (4–12 px, a ring
   with seeded jitter of 0.6 rad, 120–320 px out, 0.12 s power3.out, staggered 0.018 s, then 0.45 s fade power1.in);
   the group pops in from 0.92 (0.2 s back.out(1.5)). Own: particles burst from the keyword itself (the original fires
   from one fixed point at the bottom centre), their distance and size scale with the size, the spread is 0.7 upward
   and 0.25 downward so the burst stays in the caption band; numbers burst too; colours accent / accentHot / hero / heroLight /
   cold / coldLight / white / accentLight (the original gold-to-cyan list); a word stays lit until the next one
   starts; the keyword is the longest word of ≥4 letters and takes style.active; Outfit 900 → style font. */
HygenCaptions.define("particle-burst", {
  family: "energetic",
  origin: "registry:caption-particle-burst",
  owns: { background: false, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, C = api.C, R = api.RGB, k = s.fontSize / 88;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    var key = -1, kl = 0;
    for (var i = 0; i < W.length; i++) { var n = W[i].text.replace(/[^A-Za-z0-9]/g, "").length; if (n >= 4 && n >= kl) { key = i; kl = n; } }
    var COLORS = [C.accent, C.accentHot, C.hero, C.heroLight, C.cold, C.coldLight, C.white, C.accentLight];
    var dim = tint(R.text, 0.45);

    var spans = api.words();
    spans.forEach(function (sp, j) {
      var w = W[j], next = W[j + 1];
      var on = Math.max(g.start, w.start), off = next ? Math.max(on + 0.1, next.start) : g.end;
      var hot = j === key || /\d/.test(w.text);
      var col = hot ? s.active : s.color, sc = hot ? 1.12 : 1.05;
      sp.style.textShadow = "0 4px 16px " + tint(R.night, 0.5);
      tl.set(sp, { color: dim, scale: 1, transformOrigin: "50% 60%" }, 0);
      tl.fromTo(sp, { color: dim, scale: 1 }, { color: col, scale: sc, duration: 0.08, ease: "none", immediateRender: false }, on);
      if (next) tl.fromTo(sp, { color: col, scale: sc }, { color: dim, scale: 1, duration: 0.1, ease: "none", immediateRender: false }, off);
      if (!hot) return;
      for (var p = 0; p < 10; p++) {
        var ang = (p / 10) * Math.PI * 2 + api.rand() * 0.6;
        var dist = (120 + api.rand() * 200) * k;
        var size = Math.max(3, (4 + api.rand() * 8) * k);
        // upward 0.7 of the reach, downward 0.25: the caption sits at the bottom of its band, above the unsafe zone
        var dx = Math.cos(ang) * dist, dy = -Math.sin(ang) * dist * (Math.sin(ang) < 0 ? 0.25 : 0.7);
        var dot = api.el("span", { style: { position: "absolute", left: "50%", top: "50%", width: size.toFixed(1) + "px", height: size.toFixed(1) + "px", marginLeft: (-size / 2).toFixed(1) + "px", marginTop: (-size / 2).toFixed(1) + "px", borderRadius: "50%", backgroundColor: COLORS[p % COLORS.length], pointerEvents: "none" } }, sp);
        var t0 = on + p * 0.018;
        tl.set(dot, { x: 0, y: 0, opacity: 0 }, 0);
        tl.fromTo(dot, { x: 0, y: 0, opacity: 0 }, { x: dx, y: dy, opacity: 1, duration: 0.12, ease: "power3.out", immediateRender: false }, t0);
        tl.fromTo(dot, { opacity: 1 }, { opacity: 0, duration: 0.45, ease: "power1.in", immediateRender: false }, t0 + 0.12);
        tl.set(dot, { x: 0, y: 0 }, on + 0.8);
      }
    });

    tl.set(api.box, { opacity: 0, scale: 0.92, transformOrigin: "50% 50%" }, 0);
    tl.fromTo(api.box, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.2, ease: "back.out(1.5)", immediateRender: false }, g.start);
  }
});
