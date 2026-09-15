/* transition film-burn — library/transitions/film-burn, own: the registry's burn (ridged-burn) is a shader block, the
   engine renders without WebGL. Seeded blobs of hot light (heroHot → accentLight core, heroDeep rim) swell from the edges
   in the last 0.08 s, cover the cut and fade over 0.7 s; a warm wash carries the frame through the peak. */
(function () {
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions["film-burn"] = {
    overlay: function (api, d, tr) {
      var ctx = api.ctx;
      if (!ctx || d < -0.08 || d > 0.7) return;
      var a = d < 0 ? api.clamp01((d + 0.08) / 0.08) : 1 - api.E.out2(api.clamp01(d / 0.7));
      if (a <= 0.01) return;
      var n = tr.n || 0, C = api.C.rgb;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(" + C.accentLight + "," + (0.78 * a * a).toFixed(3) + ")";
      ctx.fillRect(0, 0, 1080, 1920);
      for (var i = 0; i < 6; i++) {
        var edge = i % 4, u = api.hash(i * 3.1 + n * 1.7);
        var x = edge === 0 ? 0 : edge === 1 ? 1080 : u * 1080, y = edge === 2 ? 0 : edge === 3 ? 1920 : u * 1920;
        var rad = (380 + 520 * api.hash(i * 5.3 + n)) * (0.55 + 0.45 * a) + 60 * Math.sin(d * 9 + i);
        var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, "rgba(" + C.accentLight + "," + (0.95 * a).toFixed(3) + ")");
        g.addColorStop(0.45, "rgba(" + C.heroHot + "," + (0.8 * a).toFixed(3) + ")");
        g.addColorStop(0.8, "rgba(" + C.heroDeep + "," + (0.55 * a).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + C.heroDeep + ",0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
  };
})();
