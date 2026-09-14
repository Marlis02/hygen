/* neon-glow — port of registry caption-neon-glow (engine/devices/text.caption/vendor/caption-neon-glow).
   Taken: unlit words are a faint ghost of the neon colour; the spoken word lights up hard (colour + a triple glow of
   ≈0.1 / 0.36 / 0.9 of the size) and goes dark again; the keyword burns in the second neon; the group snaps on with a
   short sideways jolt (x −8 → 0, 0.14 s power3.out). Own: cyan → coldLight with a cold halo, pink → heroLight with a
   hero halo; the ghost is coldLight at 30 % (14 % in the original — unreadable over video); a word stays lit until the
   next word starts (the original switches off on its end); the jolt starts on g.start (the original waits 0.05 s,
   which is an empty frame); the exit jolt is not taken (the host hides the group); Outfit 900 → style font. */
HygenCaptions.define("neon-glow", {
  family: "energetic",
  ink: "light",
  origin: "registry:caption-neon-glow",
  owns: { background: false, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, C = api.C, R = api.RGB, fs = s.fontSize;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    function glow(hex) { return "0 0 " + Math.round(fs * 0.1) + "px " + hex + ", 0 0 " + Math.round(fs * 0.36) + "px " + hex + ", 0 0 " + Math.round(fs * 0.9) + "px " + hex; }
    var key = -1, kl = 0;
    for (var i = 0; i < W.length; i++) { var n = W[i].text.replace(/[^A-Za-z0-9]/g, "").length; if (n >= 4 && n >= kl) { key = i; kl = n; } }

    var ghost = tint(R.coldLight, 0.3);
    var spans = api.words();
    spans.forEach(function (sp, j) {
      var w = W[j], next = W[j + 1];
      var on = Math.max(g.start, w.start), off = next ? Math.max(on + 0.04, next.start) : g.end;
      var lit = j === key ? C.heroLight : C.coldLight, halo = j === key ? C.hero : C.cold;
      tl.set(sp, { color: ghost, textShadow: "none" }, 0);
      tl.set(sp, { color: lit, textShadow: glow(halo) }, on);
      if (next) tl.set(sp, { color: ghost, textShadow: "none" }, off);
    });

    var jolt = Math.max(3, Math.round(fs * 0.09));
    tl.set(api.box, { x: -jolt }, 0);
    tl.fromTo(api.box, { x: -jolt }, { x: 0, duration: 0.14, ease: "power3.out", immediateRender: false }, g.start);
  }
});
