/* parallax-layers — port of registry caption-parallax-layers (engine/devices/text.caption/vendor/caption-parallax-layers).
   Taken: two layers — the emphasis word huge behind (serif, vertically stretched, filled and stroked in one strong
   colour with a hard darker shadow, fades in 0.1 s power2.out on its start) and the caption in front (serif words that
   appear hard on their own start, with a double dark shadow). Own: the behind word sits behind the caption line in
   the band (the original puts it in the top half of a 1920×1080 frame) and is picked automatically (the longest word
   of ≥4 letters; the original lists blocks by hand); the front line keeps every word, the emphasis too, so the phrase
   reads whole; scaleY 1.35 and a size fitted to maxWidth instead of scaleX-to-1800 px + scaleY 2.8; opacity 0.85;
   the layers drift at different speeds over the group (the original layers stand still — the name asks for parallax);
   colours hero / heroDeep (red E50914 / A30610 in the original); Instrument Serif → style display font. */
HygenCaptions.define("parallax-layers", {
  family: "energetic",
  origin: "registry:caption-parallax-layers",
  owns: { background: false, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, C = api.C, R = api.RGB, fs = s.fontSize;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    var key = -1, kl = 0;
    for (var i = 0; i < W.length; i++) { var n = W[i].text.replace(/[^A-Za-z0-9]/g, "").length; if (n >= 4 && n >= kl) { key = i; kl = n; } }

    var b = api.box.style;
    b.isolation = "isolate";
    b.fontFamily = api.F.display;
    b.fontWeight = "700";
    var shadow = "0 2px 12px " + tint(R.night, 0.75) + ", 0 4px 24px " + tint(R.night, 0.5);
    var spans = api.words();
    spans.forEach(function (sp, j) {
      sp.style.textShadow = shadow;
      tl.set(sp, { opacity: 0 }, 0);
      tl.set(sp, { opacity: 1 }, Math.max(g.start, W[j].start));
    });

    var dur = Math.max(0.3, g.end - g.start);
    var lines = Array.prototype.slice.call(api.box.querySelectorAll(".hy-cl"));
    if (lines.length) {
      tl.set(lines, { y: 0 }, 0);
      tl.fromTo(lines, { y: 0 }, { y: -Math.round(fs * 0.08), duration: dur, ease: "none", immediateRender: false }, g.start);
    }
    if (key < 0) return;

    var word = W[key];
    var big = Math.max(fs * 1.4, Math.min(fs * 2.6, (s.maxWidth * 0.95) / Math.max(1, word.text.length * 0.5)));
    // anchored to the bottom of the caption and stretched upward, so the big word never leaves the band below
    var back = api.el("div", { text: word.text, style: { position: "absolute", left: "50%", bottom: "0px", zIndex: "-1", whiteSpace: "nowrap", fontFamily: api.F.display, fontWeight: "700", fontSize: Math.round(big) + "px", lineHeight: "0.9", color: C.hero, webkitTextStroke: Math.max(2, Math.round(big * 0.02)) + "px " + C.hero, textShadow: "2px 4px 4px " + C.heroDeep, pointerEvents: "none" } }, api.box);
    var lift = Math.round(fs * 0.24);
    tl.set(back, { xPercent: -50, scaleY: 1.35, y: 0, opacity: 0, transformOrigin: "50% 100%" }, 0);
    tl.fromTo(back, { opacity: 0 }, { opacity: 0.85, duration: 0.1, ease: "power2.out", immediateRender: false }, Math.max(g.start, word.start));
    tl.fromTo(back, { y: 0 }, { y: -lift, duration: dur, ease: "none", immediateRender: false }, g.start);
  }
});
