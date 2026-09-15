/* camera-follow — port of registry caption-camera-follow (library/devices/text.caption/vendor/caption-camera-follow).
   Taken: the words build a block in a "world" — each new word is 0.72 of the block's current height and goes to the
   right on the same baseline while the block is narrower than the frame, else onto a new line below; on every word a
   camera (the world's x / y / scale) moves to frame the block with a 1.36 margin, a radial blur smear rises into the
   move and wipes off (each word's share --k = 0.2 + 1.15·distance from the move centre, one animated --amt divided by
   the camera scale, 24 % up / 44 % down of the move, peak 2.6 % of the frame width); words ink in over 0.16 s; the
   group ends with a pull back to the whole block (margin 1.2, 0.94 s) 0.62 s after the last word; tight leading 0.78.
   Own: the frame is the caption band (maxWidth × 2.3·fontSize, clipped), not the whole 1080×1920 video; moves start on
   the words of the voice (the original steps every 0.52 s) and never outlast the gap to the next word; word widths
   come from api.measure (the original lays out a hidden ruler); the gap between words on a line is 0.22 em (0.07 em in
   the original, where the words touch); the custom bezier eases → power3.inOut / power2; the vignette is not taken
   (a scene layer); accent = keyword = style.active (gold in the original); Helvetica → style font 700. */
HygenCaptions.define("camera-follow", {
  family: "energetic",
  origin: "registry:caption-camera-follow",
  owns: { background: true, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, R = api.RGB;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    var key = -1, kl = 0;
    for (var i = 0; i < W.length; i++) { var n = W[i].text.replace(/[^A-Za-z0-9]/g, "").length; if (n >= 4 && n >= kl) { key = i; kl = n; } }

    var FW = s.maxWidth, FH = Math.round(s.fontSize * 2.3), RATIO = 0.72, MARGIN = 1.36, LH = 0.78;
    var upper = s.textTransform === "uppercase";
    var frame = api.el("div", { style: { position: "relative", width: FW + "px", height: FH + "px", overflow: "hidden" } }, api.box);
    var world = api.el("div", { style: { position: "absolute", left: "0px", top: "0px", width: "0px", height: "0px" } }, frame);
    world.style.setProperty("--amt", "0px");

    var base = FH / (LH * MARGIN), box = null, boxes = [], els = [];
    W.forEach(function (w, j) {
      var size = j === 0 ? base : (box.y1 - box.y0) * RATIO;
      var width = api.measure(upper ? w.text.toUpperCase() : w.text, "700 " + size.toFixed(1) + "px " + s.fontFamily) * 1.04;
      var h = size * LH, x, y;
      if (j === 0) { x = 0; y = 0; }
      else if ((box.x1 - box.x0) / (box.y1 - box.y0) < FW / FH) { x = box.x1 + size * 0.22; y = box.y1 - h; }
      else { x = box.x0; y = box.y1 + size * 0.07; }
      box = box ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x + width), y1: Math.max(box.y1, y + h) } : { x0: x, y0: y, x1: x + width, y1: y + h };
      boxes.push({ x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 });
      var el = api.el("div", { text: w.text, style: { position: "absolute", left: x.toFixed(1) + "px", top: y.toFixed(1) + "px", fontSize: size.toFixed(1) + "px", lineHeight: String(LH), whiteSpace: "nowrap", fontWeight: "700", letterSpacing: "0.005em", color: j === key ? s.active : s.color, textShadow: "0 0.04em 0.2em " + tint(R.night, 0.5), filter: "blur(calc(var(--k) * var(--amt)))" } }, world);
      el.style.setProperty("--k", "0");
      els.push({ el: el, cx: x + width / 2, cy: y + h / 2 });
    });

    function pose(bx, margin) {
      var sc = Math.min(FW / ((bx.x1 - bx.x0) * margin), FH / ((bx.y1 - bx.y0) * margin));
      return { x: FW / 2 - (sc * (bx.x0 + bx.x1)) / 2, y: FH / 2 - (sc * (bx.y0 + bx.y1)) / 2, scale: sc };
    }
    var HALF = Math.sqrt(FW * FW + FH * FH) / 2, BLUR = FW * 0.026;
    function smear(bx, sc, count, at, up, down, peak) {
      var cx = (bx.x0 + bx.x1) / 2, cy = (bx.y0 + bx.y1) / 2;
      for (var q = 0; q < count; q++) {
        var d = (sc * Math.sqrt((els[q].cx - cx) * (els[q].cx - cx) + (els[q].cy - cy) * (els[q].cy - cy))) / HALF;
        tl.set(els[q].el, { "--k": (0.2 + 1.15 * Math.min(1, d)).toFixed(3) }, at);
      }
      var amt = (peak / sc).toFixed(2) + "px";
      tl.fromTo(world, { "--amt": "0px" }, { "--amt": amt, duration: up, ease: "power2.out", immediateRender: false }, at);
      tl.fromTo(world, { "--amt": amt }, { "--amt": "0px", duration: down, ease: "power2.inOut", immediateRender: false }, at + up);
    }

    var prev = pose(boxes[0], MARGIN);
    tl.set(world, { x: prev.x, y: prev.y, scale: prev.scale, transformOrigin: "0px 0px", "--amt": "0px" }, 0);
    els.forEach(function (e, j) { tl.set(e.el, { opacity: j === 0 ? 1 : 0, "--k": "0" }, 0); });

    W.forEach(function (w, j) {
      if (j === 0) return;
      var at = Math.max(g.start, w.start), next = W[j + 1];
      var move = Math.max(0.12, Math.min(0.4, (next ? next.start : g.end) - at));
      var p = pose(boxes[j], MARGIN);
      tl.fromTo(els[j].el, { opacity: 0 }, { opacity: 1, duration: 0.16, ease: "power2.out", immediateRender: false }, at);
      tl.fromTo(world, { x: prev.x, y: prev.y, scale: prev.scale }, { x: p.x, y: p.y, scale: p.scale, duration: move, ease: "power3.inOut", immediateRender: false }, at);
      smear(boxes[j], p.scale, j + 1, at, move * 0.24, move * 0.44, BLUR);
      prev = p;
    });

    var wideAt = Math.max(g.start, W[W.length - 1].start) + 0.62;
    if (W.length > 1 && wideAt + 0.3 < g.end) {
      var full = boxes[boxes.length - 1], wide = pose(full, 1.2), dur = Math.min(0.94, g.end - wideAt);
      tl.fromTo(world, { x: prev.x, y: prev.y, scale: prev.scale }, { x: wide.x, y: wide.y, scale: wide.scale, duration: dur, ease: "power3.inOut", immediateRender: false }, wideAt);
      smear(full, wide.scale, els.length, wideAt, dur * 0.32, dur * 0.62, BLUR * 0.8);
    }
  }
});
