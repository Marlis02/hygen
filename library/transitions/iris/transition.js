/* transition iris — library/transitions/iris (after registry iris-reveal, library/transitions/vendor/iris-reveal): the
   component masks a second layer with a growing circle; here the circle is cut out of an ink cover on the shared
   transition canvas — closing over the outgoing beat in its last 0.08 s, opening over the incoming one in 0.55 s. */
(function () {
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions.iris = {
    host: function (fx, role, d) {
      if (role === "to" && d >= 0 && d < 0.55) { var k = 1.05 - 0.05 * (d / 0.55); fx.sx *= k; fx.sy *= k; }
    },
    overlay: function (api, d) {
      var ctx = api.ctx;
      if (!ctx || d < -0.08 || d > 0.55) return;
      var R = Math.sqrt(540 * 540 + 960 * 960) + 30;
      var r = d < 0 ? R * (-d / 0.08) : R * api.E.out3(api.clamp01(d / 0.55));
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgb(" + api.C.rgb.night + ")";
      ctx.fillRect(0, 0, 1080, 1920);
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(540, 960, Math.max(0, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (r > 4 && r < R - 4) {
        ctx.strokeStyle = "rgba(" + api.C.rgb.heroLight + ",0.8)";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(540, 960, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  };
})();
