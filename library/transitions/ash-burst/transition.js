/* transition ash-burst — library/transitions/ash-burst (from engine/src/assemble.ts, D2): 180 seeded ash flakes spray from
   the hero line over the cut and fall away within 1.6 s. Canvas #hf-burst (540×960, written by the build), cleared on
   every frame; colours — ash of the look. */
(function () {
  function prand(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  var ASH = null, ctx = null;
  function flakes(api) {
    if (ASH) return ASH;
    var colors = [api.C.hex.ashMid, api.C.hex.ash3, api.C.hex.plane, api.C.hex.ashLight];
    ASH = [];
    for (var i = 0; i < 180; i++) {
      ASH.push({ a: prand(i * 1.7 + 0.3) * 6.2832, v: 700 + 1500 * prand(i * 2.9 + 1.1), r: 2 + 8 * Math.pow(prand(i * 3.3 + 2.2), 1.6),
        c: colors[i % colors.length], life: 0.8 + 0.7 * prand(i * 4.1 + 0.7), lag: 0.06 * prand(i * 5.3 + 1.9) });
    }
    return ASH;
  }
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions["ash-burst"] = {
    frame: function (api) {
      var canvas = api.el("hf-burst");
      ctx = canvas ? canvas.getContext("2d") : null;
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 540, 960);
      ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    },
    overlay: function (api, d) {
      if (!ctx || d < 0 || d > 1.6) return;
      var ash = flakes(api);
      for (var j = 0; j < ash.length; j++) {
        var q = ash[j], age = d - q.lag;
        if (age <= 0 || age >= q.life) continue;
        var s = 0.3 * (1 - Math.exp(-age / 0.3));
        var x = 540 + Math.cos(q.a) * q.v * s;
        var y = 760 + Math.sin(q.a) * q.v * s * 0.8 + 140 * age * age;
        ctx.globalAlpha = 0.85 * (1 - age / q.life);
        ctx.fillStyle = q.c;
        ctx.beginPath(); ctx.arc(x, y, q.r * (1 + 0.8 * age), 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };
})();
