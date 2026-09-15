/* blend-difference — port of registry caption-blend-difference (library/devices/text.caption/vendor/caption-blend-difference).
   Taken: white caption with mix-blend-mode: difference and no plate — every pixel of the letters inverts what lies
   behind (a light sky turns the letters dark, blue turns orange); the integration entrance from the component's notes
   (y 50 → 0 with opacity, 0.6 s expo.out). Own: the rise is 0.5·fontSize and never longer than 40 % of the group; the
   active word keeps the runtime's style.activeWord (the blend inverts its colour too). The blend is set on the whole
   captions layer for the group's time (api.blend): inside the layer — an isolated group at z 35 — difference only saw
   transparency and the letters stayed plain white. No plate and no shadow: both would be inverted too. */
HygenCaptions.define("blend-difference", {
  family: "calm",
  origin: "registry:caption-blend-difference",
  owns: { background: true, active: false, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style;
    api.box.style.color = api.C.white;
    api.box.style.textShadow = "none";
    if (!api.blend("difference")) api.box.style.mixBlendMode = "difference";
    api.words();

    var dy = Math.round(s.fontSize * 0.5);
    var dur = Math.max(0.2, Math.min(0.6, (g.end - g.start) * 0.4));
    tl.set(api.box, { opacity: 0, y: dy }, 0);
    tl.fromTo(api.box, { opacity: 0, y: dy }, { opacity: 1, y: 0, duration: dur, ease: "expo.out", immediateRender: false }, g.start);
  }
});
