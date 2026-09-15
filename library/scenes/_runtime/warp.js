  // hygen timeline warp (library/scenes/_runtime/warp.js — injected by the build, engine/src/scenes.ts).
  // A scene is authored on REFERENCE times: the cue times of the voice it was designed for.
  // R holds reference knots, A the same cues on this video's voice (word timings). Every tween start
  // and end is mapped piecewise-linearly R → A, so reveals land on the words of the current voice.
  var W = (function (R, A) {
    function map(x, xs, ys) {
      var n = xs.length;
      if (x <= xs[0]) return ys[0] + (x - xs[0]);
      for (var i = 1; i < n; i++) {
        if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) * (ys[i] - ys[i - 1])) / (xs[i] - xs[i - 1]);
      }
      return ys[n - 1] + (x - xs[n - 1]);
    }
    var refEnd = R[R.length - 1];
    var actEnd = A[A.length - 1];
    return {
      at: function (t) {
        return map(t, R, A);
      },
      // A full-span driver tween runs its value 0 → refEnd across the warped span 0 → actEnd:
      // convert that value back to reference time, which the scene's draw functions expect.
      ref: function (driverValue) {
        return map((driverValue * actEnd) / refEnd, A, R);
      },
      apply: function (timeline) {
        var kids = timeline.getChildren(false, true, true);
        for (var i = 0; i < kids.length; i++) {
          var c = kids[i];
          var s = c.startTime();
          var d = c.duration();
          var s2 = map(s, R, A);
          if (d > 0) c.duration(Math.max(0.0001, map(s + d, R, A) - s2));
          c.startTime(s2);
        }
        return timeline;
      },
    };
  })(__HYGEN_REF__, __HYGEN_ACT__);
