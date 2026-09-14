/* transition grid-dissolve — engine/transitions/grid-dissolve (after registry grid-pixelate-wipe,
   engine/transitions/vendor/grid-pixelate-wipe): 9 × 16 cells of ink; each cell has its own seeded moment — it lands
   before the cut and lifts after it, a thin hero tint on the last cells. */
(function () {
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions["grid-dissolve"] = {
    overlay: function (api, d, tr) {
      var ctx = api.ctx;
      if (!ctx || d < -0.08 || d > 0.6) return;
      var cols = 9, rows = 16, cw = 1080 / cols, ch = 1920 / rows, n = tr.n || 0;
      ctx.globalAlpha = 1;
      for (var k = 0; k < cols * rows; k++) {
        var r = api.hash(k * 1.37 + n * 7.1 + 0.2);
        var covered = d < 0 ? (d + 0.08) / 0.08 > r : d / 0.5 < r;
        if (!covered) continue;
        var x = (k % cols) * cw, y = Math.floor(k / cols) * ch;
        ctx.fillStyle = r > 0.9 && d > 0 ? "rgb(" + api.C.rgb.heroDeep + ")" : "rgb(" + api.C.rgb.night + ")";
        ctx.fillRect(x - 0.5, y - 0.5, cw + 1, ch + 1);
      }
    }
  };
})();
