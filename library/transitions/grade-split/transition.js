/* transition grade-split — library/transitions/grade-split (after registry grade-split-reveal,
   library/transitions/vendor/grade-split-reveal): the component grades one layer and reveals the other along a split;
   the engine keeps no second layer after the cut, so the grade is a heroDeep cover that dips in before the cut and a
   diagonal split with a bright edge that uncovers the incoming beat. CSS/canvas only. */
(function () {
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions["grade-split"] = {
    overlay: function (api, d) {
      var ctx = api.ctx;
      if (!ctx || d < -0.08 || d > 0.55) return;
      var C = api.C.rgb, slant = 420;
      ctx.globalAlpha = 1;
      if (d < 0) {
        ctx.fillStyle = "rgba(" + C.heroDeep + "," + (0.9 * api.clamp01((d + 0.08) / 0.08)).toFixed(3) + ")";
        ctx.fillRect(0, 0, 1080, 1920);
        return;
      }
      // the split runs from bottom-left to top-right; covered is what lies right of it
      var q = api.E.inOut3 ? api.E.inOut3(api.clamp01(d / 0.55)) : api.E.inOut2(api.clamp01(d / 0.55));
      var x0 = -slant + (1080 + 2 * slant) * q;
      ctx.fillStyle = "rgba(" + C.heroDeep + ",0.9)";
      ctx.beginPath();
      ctx.moveTo(x0 - slant, 1920);
      ctx.lineTo(x0 + slant, 0);
      ctx.lineTo(1080 + slant, 0);
      ctx.lineTo(1080 + slant, 1920);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(" + C.heroLight + ",0.95)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x0 - slant, 1920);
      ctx.lineTo(x0 + slant, 0);
      ctx.stroke();
    }
  };
})();
