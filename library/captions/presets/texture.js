/* texture — port of registry caption-texture (library/devices/text.caption/vendor/caption-texture).
   Taken: heavy uppercase letters filled with a texture that is twice the word's size and slides 0 % → 100 % across
   the word (sine.inOut), a warm glow drop-shadow around the textured ink, each word enters on its start (opacity,
   scale 0.88 → 1, 0.18 s power3.out); the keyword takes a stronger colour. Own: the PNG textures of the component
   (lava, marble, rock … — installed next to it) are not vendored: the texture is seeded fractal noise (SVG
   feTurbulence in a data URI, preserveAspectRatio none, noise mapped between two palette colours), so nothing is
   fetched at render time; the texture is colour through background-clip: text instead of a luminance mask, so the
   letters never get see-through holes over video; the whole group stays on screen (the original
   shows one word at a time and drops it on its end) and every word slides its texture until the group ends; ink
   accentHot → accentLight, keyword accent → accentHot, glow accent (the original warm cream / orange / orange glow);
   Anton → style body font 800. */
HygenCaptions.define("texture", {
  family: "explainer",
  ink: "light",
  origin: "registry:caption-texture",
  owns: { background: false, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, C = api.C, R = api.RGB;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    function unit(hex) { return [1, 3, 5].map(function (k) { return parseInt(hex.slice(k, k + 2), 16) / 255; }); }
    var key = -1, kl = 0;
    for (var i = 0; i < W.length; i++) { var n = W[i].text.replace(/[^A-Za-z0-9]/g, "").length; if (n >= 4 && n >= kl) { key = i; kl = n; } }

    var seed = 1 + Math.floor(api.rand() * 997);
    function noise(dark, light) {
      var a = unit(dark), b = unit(light), rows = [];
      // colour = dark + (light − dark) · (1.7 · noise − 0.35): grain between the two tones
      for (var c = 0; c < 3; c++) rows.push(((b[c] - a[c]) * 1.7).toFixed(3) + " 0 0 0 " + (a[c] - (b[c] - a[c]) * 0.35).toFixed(3));
      rows.push("0 0 0 0 1");
      var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='160' viewBox='0 0 400 160' preserveAspectRatio='none'>" +
        "<filter id='tx' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>" +
        "<feTurbulence type='fractalNoise' baseFrequency='0.035 0.07' numOctaves='3' seed='" + seed + "'/>" +
        "<feColorMatrix type='matrix' values='" + rows.join("  ") + "'/>" +
        "</filter><rect width='400' height='160' filter='url(#tx)'/></svg>";
      return "url(\"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) + "\")";
    }
    var plain = noise(C.accentHot, C.accentLight), strong = noise(C.accent, C.accentHot);
    var glow = "drop-shadow(0 2px 5px " + tint(R.night, 0.6) + ") drop-shadow(0 4px 22px " + tint(R.accent, 0.5) + ")";

    var spans = api.words();
    // the layout was measured in the style's case; uppercase ink is wider
    if (s.textTransform !== "uppercase") api.box.style.fontSize = Math.round((parseFloat(api.box.style.fontSize) || s.fontSize) * 0.88) + "px";
    spans.forEach(function (sp, j) {
      var w = W[j], st = sp.style;
      st.textTransform = "uppercase";
      st.fontFamily = api.F.body;
      st.fontWeight = "800";
      st.letterSpacing = "0.03em";
      st.backgroundImage = j === key ? strong : plain;
      st.backgroundSize = "200% 200%";
      st.backgroundRepeat = "repeat";
      st.webkitBackgroundClip = "text";
      st.backgroundClip = "text";
      st.color = "transparent";
      st.webkitTextFillColor = "transparent";
      st.textShadow = "none";
      st.filter = glow;

      tl.set(sp, { opacity: 0, scale: 0.88, backgroundPosition: "0% 50%", transformOrigin: "50% 60%" }, 0);
      tl.fromTo(sp, { opacity: 0, scale: 0.88 }, { opacity: 1, scale: 1, duration: 0.18, ease: "power3.out", immediateRender: false }, w.start);
      tl.fromTo(sp, { backgroundPosition: "0% 50%" }, { backgroundPosition: "100% 50%", duration: Math.max(0.4, g.end - w.start), ease: "sine.inOut", immediateRender: false }, w.start);
    });
  }
});
