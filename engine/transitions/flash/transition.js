/* transition flash — engine/transitions/flash (from engine/src/assemble.ts, D2): a bone-white overlay over the cut.
   Ramps in over the last 0.08 s of the outgoing beat (its settle frame stays clean — TRAPS.md), holds 0.08 s and fades
   out by `dur`. Overlay element: #hf-flash-<n> (written by the build). Written on every frame, like before. */
(function () {
  function alpha(d, dur) {
    if (d <= -0.08 || d >= dur) return 0;
    if (d < 0) { var u = 1 + d / 0.08; return u * u; }
    if (d < 0.08) return 1;
    var p = (d - 0.08) / (dur - 0.08);
    return (1 - p) * (1 - p);
  }
  window.HygenTransitions = window.HygenTransitions || {};
  window.HygenTransitions.flash = {
    always: true,
    overlay: function (api, d, tr) {
      var e = api.el("hf-flash-" + tr.flash);
      if (e) e.style.opacity = alpha(d, tr.durs.flash).toFixed(3);
    }
  };
})();
