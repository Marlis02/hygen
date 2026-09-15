/* transition smoke-wipe — library/transitions/smoke-wipe: a wall of soft smoke rises over the cut (0.08 s before it at
   most), covers the frame and thins out over the next beat. Three puff sprites in the look's ash colours, drawn once. */
(function () {
  var sprites = null;
  function puffs(api) {
    if (sprites) return sprites;
    sprites = ["ashMid", "ash3", "mutedLight"].map(function (name) {
      var c = document.createElement("canvas");
      c.width = c.height = 128;
      var g = c.getContext("2d"), rgb = api.C.rgb[name];
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(" + rgb + ",1)");
      gr.addColorStop(0.5, "rgba(" + rgb + ",0.55)");
      gr.addColorStop(1, "rgba(" + rgb + ",0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return c;
    });
    return sprites;
  }
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions["smoke-wipe"] = {
    overlay: function (api, d, tr) {
      var E = api.E, ctx = api.ctx, dur = tr.durs["smoke-wipe"];
      if (!ctx || d < -0.08 || d > dur) return;
      var spr = puffs(api), n = tr.n;
      var rise = E.out3((d + 0.08) / 0.5);
      var thin = 1 - E.inOut2((d - 0.3) / Math.max(0.1, dur - 0.3));
      if (thin <= 0) return;
      for (var i = 0; i < 38; i++) {
        var hx = api.hash(i * 2.31 + n * 7.7), hy = api.hash(i * 3.17 + n * 5.3 + 1.1), hs = api.hash(i * 4.03 + n * 3.1 + 2.7);
        var size = 520 + 560 * hs;
        var x = -140 + hx * 1360 + 70 * Math.sin(d * 1.3 + i);
        var y0 = 2300 + hy * 800, y1 = -250 + hy * 2200;
        var y = y0 + (y1 - y0) * rise - 110 * Math.max(0, d);
        ctx.globalAlpha = 0.92 * thin * (0.55 + 0.45 * hs);
        ctx.drawImage(spr[i % 3], x - size / 2, y - size / 2, size, size);
      }
    }
  };
})();
