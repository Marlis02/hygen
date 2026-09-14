/* karaoke — own: every word fills left to right with the active colour for exactly as long as the voice says it
   (a clipped copy of the word over the dim word, clip-path tweened over the word's own time). Spoken words stay filled. */
HygenCaptions.define("karaoke", {
  family: "calm",
  origin: "own",
  owns: { background: false, active: true, entrance: false },
  mount: function (api, g) {
    var tl = api.tl, s = g.style;
    api.words(api.box).forEach(function (sp, i) {
      var w = g.words[i];
      sp.style.color = s.dim;
      var fill = api.el("span", { "class": "hy-kf", text: sp.textContent, style: { position: "absolute", left: "0px", top: "0px", color: s.active, whiteSpace: "pre", textShadow: "none" } }, sp);
      var from = "inset(-20% 100% -20% -2%)", to = "inset(-20% -2% -20% -2%)";
      tl.set(fill, { clipPath: from }, 0);
      tl.fromTo(fill, { clipPath: from }, { clipPath: to, duration: Math.max(0.08, w.end - w.start), ease: "none", immediateRender: false }, Math.max(g.start, w.start));
    });
  }
});
