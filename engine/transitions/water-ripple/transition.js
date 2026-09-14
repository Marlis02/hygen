/* transition water-ripple — engine/transitions/water-ripple: rings of light expand from the centre, a veil of hero-deep
   water lifts off, the incoming beat wobbles and sharpens as if seen through water. Pre-cut part ≤ 0.08 s. */
(function () {
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions["water-ripple"] = {
    host: function (fx, role, d, tr, api) {
      var E = api.E, dur = tr.durs["water-ripple"];
      if (role === "from" && d < 0 && d > -0.08) fx.blur += 5 * ((d + 0.08) / 0.08);
      if (role === "to" && d >= 0 && d <= dur) {
        var w = d / dur, grow = 1 + 0.05 * (1 - E.out3(Math.min(1, w * 2.2)));
        var wob = 0.022 * Math.sin(w * 26) * (1 - w) * (1 - w);
        fx.sx *= grow * (1 + wob);
        fx.sy *= grow * (1 - wob);
        fx.blur += 8 * (1 - E.out2(Math.min(1, w * 2)));
      }
    },
    overlay: function (api, d, tr) {
      var E = api.E, ctx = api.ctx, dur = tr.durs["water-ripple"];
      if (d < 0) {
        if (d > -0.08) api.veil = Math.max(api.veil, 0.34 * ((d + 0.08) / 0.08));
        return;
      }
      if (d > dur) return;
      api.veil = Math.max(api.veil, 0.34 * (1 - E.out2(d / 0.4)));
      if (!ctx) return;
      for (var k = 0; k < 3; k++) {
        var q = (d - k * 0.12) / (dur * 0.9);
        if (q <= 0 || q >= 1) continue;
        var R = 30 + 980 * E.out2(q);
        ctx.strokeStyle = "rgb(" + api.C.rgb.heroLight + ")";
        ctx.globalAlpha = 0.5 * Math.pow(1 - q, 1.4);
        ctx.lineWidth = 2 + 10 * (1 - q);
        ctx.beginPath(); ctx.ellipse(540, 820, R, R * 0.92, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.14 * Math.pow(1 - q, 1.4);
        ctx.lineWidth = 8 + 34 * (1 - q);
        ctx.stroke();
      }
    }
  };
})();
