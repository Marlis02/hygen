/* typewriter — own (after text.title typewriter): the characters of every word are typed while the voice says the word,
   a caret in the active colour rides the last typed character and blinks after the group is complete. */
HygenCaptions.define("typewriter", {
  family: "calm",
  origin: "own",
  owns: { background: false, active: false, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style;
    var caretW = Math.max(3, Math.round(s.fontSize * 0.055));
    var carets = [], times = [];
    api.words(api.box).forEach(function (sp, i) {
      var w = g.words[i], text = sp.textContent, n = text.length;
      sp.textContent = "";
      var t0 = Math.max(g.start, w.start);
      var span = Math.max(0.05, Math.min(w.end - w.start, 0.055 * n));
      for (var c = 0; c < n; c++) {
        var ch = api.el("span", { "class": "hy-tw", text: text[c], style: { position: "relative", opacity: "0" } }, sp);
        var caret = api.el("span", { style: { position: "absolute", left: "100%", top: "0.1em", bottom: "0.06em", width: caretW + "px", marginLeft: "0.03em", backgroundColor: s.active, opacity: "0" } }, ch);
        var ti = t0 + (span * c) / n;
        tl.set(ch, { opacity: 0 }, 0);
        tl.set(ch, { opacity: 1 }, ti);
        carets.push(caret);
        times.push(ti);
      }
    });
    for (var k = 0; k < carets.length; k++) {
      tl.set(carets[k], { opacity: 0 }, 0);
      tl.set(carets[k], { opacity: 1 }, times[k]);
      if (k < carets.length - 1) tl.set(carets[k], { opacity: 0 }, times[k + 1]);
    }
    if (carets.length) {
      var last = carets[carets.length - 1], on = false;
      for (var bt = times[times.length - 1] + 0.4; bt < g.end - 0.05; bt += 0.4, on = !on) tl.set(last, { opacity: on ? 1 : 0 }, bt);
    }
  }
});
