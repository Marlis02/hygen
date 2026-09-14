/* data.count — port of registry count-up (engine/devices/vendor/count-up): arrival (0.38 s fade + rise + 0.98 → 1),
   sine.inOut count written as authored frame rows (tl.set textContent at 30 fps — seek-safe without callbacks),
   landing pulse 1 → 1.07 → 1 (0.165 s halves), optical lift of currency / math affixes. */
HygenDevices.define("data.count", function (api, dev) {
  var P = dev.params, tl = api.tl, p = dev.point;
  var col = api.color(P.color, "text");
  var sizeKey = P.size === "hero" ? "numberHero" : P.size === "small" ? "headline" : "numberMid";
  var size = api.sizes[sizeKey];
  var from = Number(P.from) || 0, to = Number(P.to) || 0;
  var countDur = Math.max(0.2, Number(P.countDur) || 1.2);
  var prefix = P.prefix || "", suffix = P.suffix || "";

  function fmt(v) {
    if (P.format === "decimal1") return v.toFixed(1);
    var n = Math.round(v), s = String(Math.abs(n));
    if (P.format === "thousands") s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (n < 0 ? "-" : "") + s;
  }
  var finalText = P.display ? String(P.display) : fmt(to);
  function affixLift(t) {
    if (/^[$€£¥₹₩]$/.test(t)) return "-0.31em";
    if (/^[+−±×=~<>-]+$/.test(t)) return "-0.36em";
    return "0em";
  }

  // layout: centre on the target, pulled inside the frame; label below, the block stays above y 1420
  var chars = Math.max(finalText.length, fmt(from).length, fmt(to).length);
  var estW = (chars * 0.56 + (prefix.length + suffix.length) * 0.4) * size;
  var labSize = api.sizes.label;
  var blockH = size * 1.02 + (P.label ? labSize * 1.6 : 0);
  var cx = Math.max(60 + estW / 2, Math.min(1020 - estW / 2, p.x));
  var top = Math.max(154, Math.min(1420 - blockH, p.y - size * 0.51));

  var wrap = api.el("div", { id: api.id("count"), style: { position: "absolute", left: (cx - 540).toFixed(0) + "px", top: top.toFixed(0) + "px", width: "1080px", textAlign: "center", whiteSpace: "nowrap" } });
  var pulse = api.el("div", { style: { display: "inline-block", transformOrigin: "50% 55%", fontFamily: api.F.display, fontWeight: "700", fontSize: size + "px", lineHeight: "1", color: col, fontVariantNumeric: "lining-nums tabular-nums", textShadow: "0 0 40px rgba(" + api.RGB.night + ",0.7)" } }, wrap);
  if (prefix) api.el("span", { text: prefix, style: { fontSize: "0.55em", position: "relative", top: affixLift(prefix), marginRight: "0.04em" } }, pulse);
  var num = api.el("span", { text: fmt(from) }, pulse);
  num.setAttribute("data-layout-allow-overlap", ""); // hero digits reach into the label line box
  if (suffix) api.el("span", { text: suffix, style: { fontSize: "0.55em", position: "relative", top: affixLift(suffix), marginLeft: "0.04em" } }, pulse);

  api.show(wrap, dev.at, 0.38, { y: 24, scale: 0.98 });

  var parts = P.format === "fraction" ? /^\s*([^/]+)\/(.+)$/.exec(finalText) : null;
  if (parts) {
    // a fraction is not counted (integer rows showed a lone «1» before «2/3» — D5 debt): numerator, slash and denominator
    // arrive one after another over countDur, the pulse lands on the denominator
    num.textContent = "";
    var bits = [parts[1], "/", parts[2]].map(function (t, k) {
      var sp = api.el("span", { text: t, style: { display: "inline-block" } }, num);
      tl.set(sp, { opacity: 0, y: k === 1 ? 0 : 18 }, 0);
      tl.fromTo(sp, { opacity: 0, y: k === 1 ? 0 : 18 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, dev.at + (countDur * k) / 2);
      return sp;
    });
    void bits;
  } else {
    var frames = Math.max(1, Math.round(countDur * 30)), ease = gsap.parseEase("sine.inOut");
    for (var i = 1; i <= frames; i++) {
      var row = i === frames ? finalText : fmt(from + (to - from) * ease(i / frames));
      tl.set(num, { textContent: row }, dev.at + countDur * i / frames);
    }
  }

  var land = dev.at + countDur;
  tl.set(pulse, { scale: 1 }, 0);
  tl.fromTo(pulse, { scale: 1 }, { scale: 1.07, duration: 0.165, ease: "power3.out", immediateRender: false }, land);
  tl.fromTo(pulse, { scale: 1.07 }, { scale: 1, duration: 0.165, ease: "power2.out", immediateRender: false }, land + 0.165);

  if (P.label) {
    var lab = api.el("div", { id: api.id("label"), text: P.label, style: { position: "absolute", left: (cx - 540).toFixed(0) + "px", width: "1080px", top: (top + size * 1.02 + labSize * 0.25).toFixed(0) + "px", textAlign: "center", whiteSpace: "nowrap", fontFamily: api.F.body, fontWeight: "700", fontSize: labSize + "px", lineHeight: "1.2", letterSpacing: "0.14em", textTransform: "uppercase", color: api.color(P.labelColor, "text"), opacity: "0.88", textShadow: "0 0 16px rgba(" + (["night", "heroDeep", "ground", "plane", "ashDeep"].indexOf(P.labelColor) >= 0 ? api.RGB.text : api.RGB.night) + ",0.95)" } });
    lab.setAttribute("data-layout-allow-overlap", "");
    api.show(lab, dev.at + 0.25, 0.4, { y: 12 });
  }
});
