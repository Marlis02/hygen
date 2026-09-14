/* transition directional-wipe — engine/transitions/directional-wipe (after registry directional-wipe,
   engine/transitions/vendor/directional-wipe): the component slides a clip edge over a second layer; here an ink cover
   with a soft 70 px edge and a hero line slides over the cut. Direction alternates by the cut's index. */
(function () {
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions["directional-wipe"] = {
    overlay: function (api, d, tr) {
      var ctx = api.ctx;
      if (!ctx || d < -0.08 || d > 0.45) return;
      var rtl = (tr.n || 0) % 2 === 1;
      // cover [from, to] in x of a left-to-right wipe; mirrored for rtl
      var from, to;
      if (d < 0) { from = 0; to = 1080 * api.clamp01((d + 0.08) / 0.08); }
      else { from = 1080 * api.E.inOut2(api.clamp01(d / 0.45)); to = 1080; }
      if (to - from < 1) return;
      var a = rtl ? 1080 - to : from, b = rtl ? 1080 - from : to;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgb(" + api.C.rgb.night + ")";
      ctx.fillRect(a, 0, b - a, 1920);
      var edge = d < 0 ? (rtl ? a : b) : (rtl ? b : a), dirIn = d < 0 ? (rtl ? -1 : 1) : (rtl ? 1 : -1);
      var g = ctx.createLinearGradient(edge, 0, edge + 70 * dirIn, 0);
      g.addColorStop(0, "rgba(" + api.C.rgb.night + ",1)");
      g.addColorStop(1, "rgba(" + api.C.rgb.night + ",0)");
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(edge, edge + 70 * dirIn), 0, 70, 1920);
      ctx.fillStyle = "rgba(" + api.C.rgb.hero + ",0.9)";
      ctx.fillRect(edge - 2, 0, 4, 1920);
    }
  };
})();
