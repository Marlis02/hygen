/* neon-accent — port of registry caption-neon-accent (engine/devices/text.caption/vendor/caption-neon-accent).
   Taken: heavy words where the keyword and a seeded 40 % of the content words take a neon accent at 1.2× size, function
   words stay the text colour; every word carries a glow of its own colour over a deep dark drop shadow; the group pops
   in from scale 0.65 (7 frames, power3.out) and then drifts diagonally ±0.16 em (14 px at 88 px) in sine.inOut
   yoyo half-cycles of 0.77 s, the direction alternating group to group. Own: accents are heroLight / coldLight /
   accentLight (the original green / red / yellow), shadows are C.night; the glow is in em so it follows the size;
   the group shrinks by the accents' share so the 1.2× words do not push the line past maxWidth; the repeat count is
   floor, not ceil (no overshoot past the group); Montserrat 800 → style font; no active word (same as the original). */
HygenCaptions.define("neon-accent", {
  family: "energetic",
  ink: "light",
  origin: "registry:caption-neon-accent",
  owns: { background: false, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, C = api.C, R = api.RGB, fs = s.fontSize;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    function rgbOf(hex) { return [1, 3, 5].map(function (k) { return parseInt(hex.slice(k, k + 2), 16); }).join(","); }
    var FUNC = /^(the|a|an|and|or|but|is|are|was|were|to|of|in|on|at|for|with|by|from|as|it|its|this|that|these|those|be|been|have|has|had|do|does|did|will|would|could|should|may|might|must|can|if|then|so|just|not|no|yes|up|out|about|he|she|they|we|you|i|his|her|their|our)$/;
    var key = -1, kl = 0;
    for (var i = 0; i < W.length; i++) { var n = W[i].text.replace(/[^A-Za-z0-9]/g, "").length; if (n >= 4 && n >= kl) { key = i; kl = n; } }
    var accents = [C.heroLight, C.coldLight, C.accentLight];

    var spans = api.words();
    var total = 0, extra = 0;
    spans.forEach(function (sp, j) {
      var w = W[j], clean = w.text.toLowerCase().replace(/[^a-z']/g, ""), col = s.color;
      var roll = api.rand();
      if (j === key || (!FUNC.test(clean) && roll > 0.6)) col = accents[Math.floor(api.rand() * accents.length) % accents.length];
      var rgb = rgbOf(col), accent = col !== s.color;
      total += w.text.length;
      if (accent) { sp.style.fontSize = "1.2em"; extra += w.text.length * 0.2; }
      sp.style.color = col;
      sp.style.fontWeight = "800";
      sp.style.textShadow = "0 0.09em 0.18em " + tint(R.night, 0.8) + ", 0 0.18em 0.45em " + tint(R.night, 0.6) +
        ", 0 0 0.045em " + tint(rgb, 1) + ", 0 0 0.11em " + tint(rgb, 0.9) + ", 0 0 0.23em " + tint(rgb, 0.7) + ", 0 0 0.45em " + tint(rgb, 0.4);
    });
    if (extra > 0 && total > 0) {
      var base = parseFloat(api.box.style.fontSize) || fs;
      api.box.style.fontSize = Math.floor(base / (1 + extra / total)) + "px";
    }

    tl.set(api.box, { opacity: 0, scale: 0.65, x: 0, y: 0, transformOrigin: "50% 50%" }, 0);
    tl.fromTo(api.box, { opacity: 0, scale: 0.65 }, { opacity: 1, scale: 1, duration: 7 / 30, ease: "power3.out", immediateRender: false }, g.start);
    var half = 1 / 1.3, span = g.end - g.start;
    if (span > half) {
      var d = Math.round(fs * 0.16) * (g.i % 2 ? 1 : -1);
      var rep = Math.max(0, Math.floor(span / half) - 1);
      tl.fromTo(api.box, { x: 0, y: 0 }, { x: d, y: d, duration: half, ease: "sine.inOut", yoyo: true, repeat: rep, immediateRender: false }, g.start);
    }
  }
});
