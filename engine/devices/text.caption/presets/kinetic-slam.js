/* kinetic-slam — port of registry caption-kinetic-slam (engine/devices/text.caption/vendor/caption-kinetic-slam).
   Taken: one big word at a time in the same spot; the entrance cycles with the word index — drop from above
   (back.out(1.7), 0.22 s), from the left and from the right (expo.out, 0.2 s), grow from 0.4 (back.out(2.2), 0.24 s);
   the keyword takes the accent colour; the word shrinks only when it would not fit. Own: a word stays until the next
   one starts (the original fades it on its end — a gap between words is an empty frame inside the group); the last
   word stays until the group ends; the size is 1.7 × style.fontSize (220 px Anton at 1920 wide in the original),
   offsets scale with the size and the text width; the keyword is the longest word of ≥4 letters and takes
   style.active (gold in the original); Anton → style font 800; a dark text shadow for video underneath. */
HygenCaptions.define("kinetic-slam", {
  family: "energetic",
  origin: "registry:caption-kinetic-slam",
  owns: { background: false, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, R = api.RGB;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    var key = -1, kl = 0;
    for (var i = 0; i < W.length; i++) { var n = W[i].text.replace(/[^A-Za-z0-9]/g, "").length; if (n >= 4 && n >= kl) { key = i; kl = n; } }

    var big = Math.round(s.fontSize * 1.7), room = s.maxWidth - 40, upper = s.textTransform === "uppercase";
    var sizes = W.map(function (w) {
      var wpx = api.measure(upper ? w.text.toUpperCase() : w.text, api.font(800, big)) * 1.12;
      return wpx > room ? Math.max(Math.round(s.fontSize * 0.8), Math.floor(big * room / wpx)) : big;
    });
    var stage = api.el("div", { style: { position: "relative", width: room + "px", height: Math.round(big * 1.15) + "px" } }, api.box);
    var push = Math.round(room * 0.18), drop = Math.round(s.fontSize * 0.8);
    var shadow = "0 4px 18px " + tint(R.night, 0.55) + ", 0 1px 3px " + tint(R.night, 0.45);

    W.forEach(function (w, j) {
      var next = W[j + 1], at = Math.max(g.start, w.start);
      var slot = next ? Math.max(0.06, next.start - at) : 0.3;
      var el = api.el("div", { text: w.text, style: { position: "absolute", left: "0px", right: "0px", top: "50%", textAlign: "center", whiteSpace: "nowrap", fontWeight: "800", fontSize: sizes[j] + "px", lineHeight: "1", letterSpacing: "0.02em", color: j === key ? s.active : s.color, textShadow: shadow } }, stage);
      tl.set(el, { opacity: 0, yPercent: -50, x: 0, y: 0, scale: 1, transformOrigin: "50% 50%" }, 0);
      var mode = j % 4;
      if (mode === 0) tl.fromTo(el, { opacity: 0, y: -drop }, { opacity: 1, y: 0, duration: Math.min(0.22, slot), ease: "back.out(1.7)", immediateRender: false }, at);
      else if (mode === 1) tl.fromTo(el, { opacity: 0, x: -push }, { opacity: 1, x: 0, duration: Math.min(0.2, slot), ease: "expo.out", immediateRender: false }, at);
      else if (mode === 2) tl.fromTo(el, { opacity: 0, x: push }, { opacity: 1, x: 0, duration: Math.min(0.2, slot), ease: "expo.out", immediateRender: false }, at);
      else tl.fromTo(el, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: Math.min(0.24, slot), ease: "back.out(2.2)", immediateRender: false }, at);
      if (next) tl.set(el, { opacity: 0 }, Math.max(at + 0.06, next.start));
    });
  }
});
