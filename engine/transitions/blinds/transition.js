/* transition blinds — engine/transitions/blinds, own (no CSS blinds in the registry): nine slats of ink close together
   before the cut and open top to bottom after it, each with a thin light edge. */
(function () {
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions.blinds = {
    overlay: function (api, d) {
      var ctx = api.ctx;
      if (!ctx || d < -0.08 || d > 0.5) return;
      var N = 9, h = 1920 / N, step = 0.03, open = 0.5 - step * (N - 1);
      ctx.globalAlpha = 1;
      for (var i = 0; i < N; i++) {
        var cover = d < 0 ? api.clamp01((d + 0.08) / 0.08) : 1 - api.E.inOut2(api.clamp01((d - i * step) / open));
        if (cover <= 0.001) continue;
        var sh = h * cover, y = i * h + (h - sh) / 2;
        ctx.fillStyle = "rgb(" + api.C.rgb.night + ")";
        ctx.fillRect(0, y, 1080, sh);
        ctx.fillStyle = "rgba(" + api.C.rgb.text + "," + (0.35 * cover).toFixed(3) + ")";
        ctx.fillRect(0, y, 1080, 2);
      }
    }
  };
})();
