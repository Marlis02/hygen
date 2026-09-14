/* emoji-pop — port of registry caption-emoji-pop (engine/devices/text.caption/vendor/caption-emoji-pop).
   Taken: one emoji above the line when a word of the group has one (≈0.78 of the text size); heavy words with a dark
   outline (-webkit-text-stroke, paint-order stroke fill) and a glow of their own colour; keywords take an accent colour,
   function words stay the text colour, other words take an accent with a seeded chance of 45 %; the group enters
   stretched (scaleX 0.8 → 1, 4 frames power3.out) and leaves squeezed (scaleX 0.75, opacity 0.8, 3 frames power2.in).
   Own: the emoji dictionary is for documentary topics (the original knows five demo words) and matches simple stems;
   the emoji pops on its own word (scale 0 → 1, back.out) instead of arriving with the group; accents are heroLight /
   accent / coldLight (the original pink/red/cyan), outline and shadow are C.night; Gabarito 900 → style font 800;
   the emoji needs a colour emoji font — Noto Color Emoji is installed (fc-list), see VENDOR.md. */
HygenCaptions.define("emoji-pop", {
  family: "explainer",
  origin: "registry:caption-emoji-pop",
  owns: { background: false, active: true, entrance: true },
  mount: function (api, g) {
    var tl = api.tl, s = g.style, W = g.words, C = api.C, R = api.RGB, fs = s.fontSize;
    function tint(rgb, a) { return "rgba(" + rgb + "," + a + ")"; }
    var EMOJI = {
      volcano: "🌋", vesuvius: "🌋", eruption: "🌋", erupt: "🌋", lava: "🌋", magma: "🌋", krakatoa: "🌋",
      fire: "🔥", flame: "🔥", burn: "🔥", burned: "🔥", heat: "🔥", hot: "🔥",
      ash: "🌫️", smoke: "💨", gas: "💨", wind: "💨", cloud: "☁️", sky: "☁️",
      city: "🏙️", town: "🏘️", house: "🏠", home: "🏠", street: "🏘️", pompeii: "🏛️", rome: "🏛️", roman: "🏛️", temple: "🏛️",
      people: "👥", crowd: "👥", family: "👪", child: "🧒", children: "🧒",
      dead: "💀", death: "💀", died: "💀", die: "💀", killed: "💀", body: "💀", bodies: "💀", skeleton: "💀",
      ship: "🚢", boat: "⛵", titanic: "🚢", sea: "🌊", ocean: "🌊", water: "🌊", wave: "🌊", tsunami: "🌊", flood: "🌊",
      earth: "🌍", world: "🌍", planet: "🌍", earthquake: "💥", explosion: "💥", exploded: "💥", blast: "💥",
      time: "⏳", hour: "⏳", minute: "⏱️", second: "⏱️", day: "☀️", sun: "☀️", night: "🌙", moon: "🌙",
      year: "📅", century: "📜", history: "📜", letter: "✉️", book: "📖", map: "🗺️",
      gold: "💰", money: "💰", king: "👑", emperor: "👑", mountain: "⛰️", stone: "🪨", rock: "🪨",
      storm: "⛈️", lightning: "⚡", rain: "🌧️", ice: "🧊", iceberg: "🧊", frozen: "🧊", cold: "🥶",
      war: "⚔️", army: "⚔️", soldier: "⚔️", danger: "⚠️", warning: "⚠️", mystery: "❓", why: "❓",
      eye: "👀", saw: "👀", heart: "❤️", bread: "🍞", wine: "🍷", dog: "🐕", horse: "🐎",
      sound: "🔊", loud: "🔊", silence: "🤫", secret: "🤫", buried: "⚱️", grave: "⚱️", photo: "📷",
      train: "🚂", plane: "✈️", rocket: "🚀", space: "🚀", star: "⭐", light: "💡", idea: "💡", power: "⚡", fast: "⚡",
      million: "💯", thousand: "💯", hundred: "💯"
    };
    var FUNC = /^(the|a|an|and|or|but|is|are|was|were|to|of|in|on|at|for|with|by|from|as|it|its|this|that|these|those|be|been|have|has|had|do|does|did|will|would|could|should|may|might|must|can|if|then|so|just|not|no|yes|up|out|about|he|she|they|we|you|i|his|her|their|our)$/;
    function emojiOf(text) {
      var t = text.toLowerCase().replace(/[^a-z]/g, "");
      if (!t) return null;
      var tries = [t, t.replace(/s$/, ""), t.replace(/es$/, ""), t.replace(/ed$/, ""), t.replace(/ing$/, "")];
      for (var i = 0; i < tries.length; i++) if (tries[i] && Object.prototype.hasOwnProperty.call(EMOJI, tries[i])) return EMOJI[tries[i]];
      return null;
    }

    var key = -1, kl = 0;
    for (var i = 0; i < W.length; i++) { var n = W[i].text.replace(/[^A-Za-z0-9]/g, "").length; if (n >= 4 && n >= kl) { key = i; kl = n; } }
    var accents = [C.heroLight, C.accent, C.coldLight];
    var stroke = Math.max(2, Math.round(fs * 0.045));

    api.box.style.position = "relative";
    var spans = api.words();
    var emo = null, emoAt = 0;
    spans.forEach(function (sp, j) {
      var w = W[j], clean = w.text.toLowerCase().replace(/[^a-z']/g, "");
      var roll = api.rand(), col = s.color, rgb = R.text;
      if (j === key || (!FUNC.test(clean) && roll > 0.55)) {
        col = accents[Math.floor(api.rand() * accents.length) % accents.length];
        rgb = [1, 3, 5].map(function (k) { return parseInt(col.slice(k, k + 2), 16); }).join(",");
      }
      sp.style.color = col;
      sp.style.fontWeight = "800";
      sp.style.webkitTextStroke = stroke + "px " + C.night;
      sp.style.paintOrder = "stroke fill";
      sp.style.textShadow = "0 4px 8px " + tint(R.night, 0.7) + ", 0 0 2px " + tint(rgb, 1) + ", 0 0 8px " + tint(rgb, 0.6);
      if (!emo) { var e = emojiOf(w.text); if (e) { emo = e; emoAt = w.start; } }
    });

    tl.set(api.box, { opacity: 0, scaleX: 0.8, scaleY: 1, transformOrigin: "50% 50%" }, 0);
    tl.fromTo(api.box, { opacity: 0, scaleX: 0.8 }, { opacity: 1, scaleX: 1, duration: 4 / 30, ease: "power3.out", immediateRender: false }, g.start);
    var exitAt = g.end - 3 / 30;
    if (exitAt > g.start + 4 / 30) tl.fromTo(api.box, { opacity: 1, scaleX: 1 }, { opacity: 0.8, scaleX: 0.75, duration: 3 / 30, ease: "power2.in", immediateRender: false }, exitAt);

    if (emo) {
      var icon = api.el("div", { text: emo, style: { position: "absolute", left: "50%", bottom: "100%", marginBottom: Math.round(fs * 0.08) + "px", fontFamily: "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif", fontSize: Math.round(fs * 0.78) + "px", lineHeight: "1", fontWeight: "400", webkitTextStroke: "0", textShadow: "0 4px 10px " + tint(R.night, 0.5) } }, api.box);
      tl.set(icon, { xPercent: -50, scale: 0, transformOrigin: "50% 100%" }, 0);
      tl.fromTo(icon, { scale: 0 }, { scale: 1, duration: 0.28, ease: "back.out(2.6)", immediateRender: false }, Math.max(g.start, emoAt));
    }
  }
});
