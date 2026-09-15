/* transition whip — library/transitions/whip: the outgoing beat streaks off to the left with motion blur in its last
   0.08 s, the incoming one lands from the right in 0.27 s, light streaks sweep across the cut. */
(function () {
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions.whip = {
    host: function (fx, role, d, tr, api) {
      var E = api.E;
      if (role === "from" && d < 0 && d > -0.08) { var p = (d + 0.08) / 0.08; fx.x -= 320 * E.in2(p); fx.blur += 16 * p; }
      if (role === "to" && d >= 0 && d < 0.27) { var q = d / 0.27; fx.x += 320 * (1 - E.out3(q)); fx.blur += 16 * (1 - q); }
    },
    overlay: function (api, d) {
      var ctx = api.ctx;
      if (!ctx) return;
      var p = api.clamp01((d + 0.08) / 0.35), a = Math.sin(Math.PI * p);
      if (a <= 0.01) return;
      ctx.globalAlpha = 1;
      for (var i = 0; i < 14; i++) {
        var y = api.hash(i * 5.7 + 0.3) * 1920, h = 6 + 30 * api.hash(i * 2.9 + 1.7);
        var x = -1600 + 3200 * p + (api.hash(i * 3.3) - 0.5) * 600;
        var g = ctx.createLinearGradient(x - 700, 0, x + 700, 0);
        g.addColorStop(0, "rgba(" + api.C.rgb.text + ",0)");
        g.addColorStop(0.5, "rgba(" + api.C.rgb.text + "," + (0.24 * a).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + api.C.rgb.text + ",0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 700, y, 1400, h);
      }
    }
  };
})();
