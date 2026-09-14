/* hygen stage runtime — engine/stage/runtime.js, bundled into build/assets/hygen/devices.js (engine/src/devices.ts).
   HygenStage.mount(tl, cfg) animates the base of a stage beat; the markup (media clips, stop-frames, map paths) is
   static HTML written by the build (engine/src/stage.ts). Everything is a property tween on the beat's paused
   timeline — seek-safe, no callbacks, no randomness (TRAPS.md).
     media  crop (the box fills the frame) → pan to another box; zoom [from, to] around the focus; holds: a flash and a
            desaturated stop-frame; film-memory: gate weave and a gentle exposure breath
     split  the "after" layer wipes over the "before" layer at `at`, a divider rides the edge, two labels
     map    optional reveal, coast draw-on, markers with labels, a route drawn with a traveler (offset-path)
     color  a still ground with a soft glow of the hero colour */
(function () {
  "use strict";
  if (window.HygenStage) return;

  function coverOf(box) {
    var s = Math.max(1080 / Math.max(1, box.w), 1920 / Math.max(1, box.h));
    return { x: 540 - (box.x + box.w / 2) * s, y: 960 - (box.y + box.h / 2) * s, scale: s };
  }

  function mediaMotion(tl, cfg, m, D) {
    var inners = document.querySelectorAll('[data-hy-inner="' + cfg.prefix + "-" + m.key + '"]');
    var zooms = document.querySelectorAll('[data-hy-zoom="' + cfg.prefix + "-" + m.key + '"]');
    var i;
    for (i = 0; i < inners.length; i++) {
      var inner = inners[i];
      var from = m.crop ? coverOf(m.crop) : { x: 0, y: 0, scale: 1 };
      tl.set(inner, { x: from.x, y: from.y, scale: from.scale, transformOrigin: "0px 0px" }, 0);
      if (m.pan) {
        var to = coverOf(m.pan.to);
        tl.fromTo(inner, { x: from.x, y: from.y, scale: from.scale }, { x: to.x, y: to.y, scale: to.scale, duration: m.pan.dur, ease: "sine.inOut", immediateRender: false }, m.pan.at);
      }
    }
    for (i = 0; i < zooms.length; i++) {
      var z = zooms[i];
      tl.set(z, { scale: m.zoom[0], transformOrigin: (m.focus[0] * 100).toFixed(1) + "% " + (m.focus[1] * 100).toFixed(1) + "%" }, 0);
      if (m.zoom[1] !== m.zoom[0]) tl.fromTo(z, { scale: m.zoom[0] }, { scale: m.zoom[1], duration: D, ease: "none", immediateRender: false }, 0);
      if (m.weave) {
        // film-memory: slight mechanical drift, finite sine segments, back near the start at the end
        var n = Math.max(2, Math.floor(D / 0.7)), seg = D / n;
        tl.set(z, { x: 0, y: 0, rotation: 0 }, 0);
        for (var k = 0; k < n; k++) {
          var last = k === n - 1;
          var px = last ? 0 : Math.sin(k * 2.3 + 1.1) * 1.5, py = last ? 0 : Math.cos(k * 1.7 + 0.4) * 1.5, pr = last ? 0 : Math.sin(k * 3.1) * 0.03;
          tl.to(z, { x: px, y: py, rotation: pr, duration: seg, ease: "sine.inOut" }, k * seg);
        }
      }
    }
    var breath = document.getElementById(cfg.prefix + "-" + m.key + "-breath");
    if (breath && m.weave) {
      var nb = Math.max(2, Math.floor(D / 0.6)), sb = D / nb;
      tl.set(breath, { opacity: 0 }, 0);
      for (var b = 0; b < nb; b++) tl.to(breath, { opacity: b === nb - 1 ? 0 : 0.04 + 0.05 * Math.abs(Math.sin(b * 2.7 + 0.5)), duration: sb, ease: "sine.inOut" }, b * sb);
    }
    var flash = document.getElementById(cfg.prefix + "-flash");
    var tone = document.getElementById(cfg.prefix + "-" + m.key + "-tone");
    for (i = 0; i < m.holds.length; i++) {
      var h = m.holds[i];
      if (flash) {
        if (i === 0) tl.set(flash, { opacity: 0 }, 0);
        tl.fromTo(flash, { opacity: 0.5 }, { opacity: 0, duration: 0.28, ease: "power2.out", immediateRender: false }, h.at);
      }
      if (tone) {
        if (i === 0) tl.set(tone, { opacity: 0 }, 0);
        tl.fromTo(tone, { opacity: 0 }, { opacity: 0.38, duration: 0.2, ease: "power1.out", immediateRender: false }, h.at);
        tl.to(tone, { opacity: 0, duration: 0.25, ease: "power1.in" }, h.at + h.dur);
      }
    }
  }

  function el(tag, attrs, parent) {
    var n = tag === "svg" || tag === "path" || tag === "circle" || tag === "g" ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
    for (var k in attrs) {
      if (k === "style") for (var s in attrs.style) n.style[s] = attrs.style[s];
      else if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    parent.appendChild(n);
    return n;
  }

  function label(cfg, parent, id, text, x, y, align) {
    return el("div", {
      id: id, text: text,
      style: {
        position: "absolute", left: x + "px", top: y + "px", whiteSpace: "nowrap", transform: align === "right" ? "translateX(-100%)" : align === "center" ? "translateX(-50%)" : "none",
        fontFamily: cfg.fonts.body, fontWeight: "700", fontSize: cfg.sizes.label + "px", letterSpacing: "0.14em", textTransform: "uppercase",
        color: cfg.colors.hex.text, textShadow: "0 0 14px rgba(" + cfg.colors.rgb.night + ",0.95)"
      }
    }, parent);
  }

  function split(tl, cfg, sp) {
    var P = cfg.prefix, b = document.getElementById(P + "-b-wrap"), div = document.getElementById(P + "-divider");
    var dir = sp.direction;
    var hidden = dir === "left" ? "inset(0% 100% 0% 0%)" : dir === "right" ? "inset(0% 0% 0% 100%)" : dir === "down" ? "inset(0% 0% 100% 0%)" : "inset(100% 0% 0% 0%)";
    tl.set(b, { clipPath: hidden }, 0);
    tl.fromTo(b, { clipPath: hidden }, { clipPath: "inset(0% 0% 0% 0%)", duration: sp.dur, ease: "power2.inOut", immediateRender: false }, sp.at);
    if (div) {
      var horiz = dir === "left" || dir === "right";
      var start = dir === "left" ? 0 : dir === "right" ? 1080 : dir === "down" ? 0 : 1920;
      var end = dir === "left" ? 1080 : dir === "right" ? 0 : dir === "down" ? 1920 : 0;
      var prop = horiz ? "x" : "y";
      var f = {}; f[prop] = start; f.opacity = 0;
      tl.set(div, f, 0);
      var a = {}; a.opacity = 1; a.duration = 0.2;
      tl.to(div, a, Math.max(0, sp.at - 0.2));
      var t = {}; t[prop] = end; t.duration = sp.dur; t.ease = "power2.inOut";
      tl.to(div, t, sp.at);
      tl.to(div, { opacity: 0, duration: 0.25 }, sp.at + sp.dur);
    }
    var la = document.getElementById(P + "-label-a"), lb = document.getElementById(P + "-label-b");
    if (la) { tl.set(la, { opacity: 0 }, 0); tl.to(la, { opacity: 1, duration: 0.4 }, 0.3); tl.to(la, { opacity: 0, duration: 0.3 }, sp.at + sp.dur * 0.5); }
    if (lb) { tl.set(lb, { opacity: 0 }, 0); tl.to(lb, { opacity: 1, duration: 0.4 }, sp.at + sp.dur * 0.7); }
  }

  function map(tl, cfg, mp, D) {
    var P = cfg.prefix, svg = document.getElementById(P + "-map"), coast = document.getElementById(P + "-coast");
    var layer = document.getElementById(P + "-stage");
    if (mp.reveal !== null) {
      tl.set(svg, { opacity: 0 }, 0);
      tl.fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: "power2.out", immediateRender: false }, mp.reveal);
    }
    if (mp.draw && coast) {
      var len = coast.getTotalLength();
      coast.style.strokeDasharray = len + " " + len;
      tl.set(coast, { strokeDashoffset: len }, 0);
      tl.fromTo(coast, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut", immediateRender: false }, mp.reveal || 0);
    }
    for (var i = 0; i < mp.markers.length; i++) {
      var mk = mp.markers[i];
      var dot = el("div", { id: P + "-mk" + i, style: { position: "absolute", left: (mk.x - 12) + "px", top: (mk.y - 12) + "px", width: "24px", height: "24px", borderRadius: "50%", backgroundColor: cfg.colors.hex.hero, boxShadow: "0 0 24px rgba(" + cfg.colors.rgb.hero + ",0.9)" } }, layer);
      var ring = el("div", { id: P + "-mkr" + i, style: { position: "absolute", left: (mk.x - 12) + "px", top: (mk.y - 12) + "px", width: "24px", height: "24px", borderRadius: "50%", border: "3px solid " + cfg.colors.hex.heroLight } }, layer);
      tl.set([dot, ring], { opacity: 0, scale: 0.2 }, 0);
      tl.to(dot, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, mk.at);
      tl.fromTo(ring, { opacity: 0.9, scale: 1 }, { opacity: 0, scale: 3.2, duration: 1.1, ease: "power2.out", immediateRender: false }, mk.at);
      if (mk.label) {
        var lab = label(cfg, layer, P + "-mkl" + i, mk.label, mk.x + (mk.x > 700 ? -30 : 30), mk.y - 20, mk.x > 700 ? "right" : "left");
        tl.set(lab, { opacity: 0 }, 0);
        tl.to(lab, { opacity: 1, duration: 0.4 }, mk.at + 0.2);
      }
    }
    if (mp.route) {
      var route = document.getElementById(P + "-route");
      var rl = route.getTotalLength();
      route.style.strokeDasharray = rl + " " + rl;
      tl.set(route, { strokeDashoffset: rl }, 0);
      tl.fromTo(route, { strokeDashoffset: rl }, { strokeDashoffset: 0, duration: mp.route.dur, ease: "power1.inOut", immediateRender: false }, mp.route.at);
      var trav = document.getElementById(P + "-traveler");
      if (trav) {
        tl.set(trav, { opacity: 0, offsetDistance: "0%" }, 0);
        tl.to(trav, { opacity: 1, duration: 0.15 }, mp.route.at);
        tl.fromTo(trav, { offsetDistance: "0%" }, { offsetDistance: "100%", duration: mp.route.dur, ease: "power1.inOut", immediateRender: false }, mp.route.at);
      }
    }
  }

  window.HygenStage = {
    mount: function (tl, cfg) {
      var st = cfg.stage, D = cfg.duration;
      if (st.type === "media") mediaMotion(tl, cfg, st.media, D);
      if (st.type === "split") {
        mediaMotion(tl, cfg, st.a, D);
        mediaMotion(tl, cfg, st.b, D);
        split(tl, cfg, st.split);
      }
      if (st.type === "map") map(tl, cfg, st.map, D);
      var ground = document.getElementById(cfg.prefix + "-glow");
      if (ground) {
        tl.set(ground, { opacity: 0.55 }, 0);
        tl.to(ground, { opacity: 0.9, duration: D, ease: "sine.inOut" }, 0);
      }
    }
  };
})();
