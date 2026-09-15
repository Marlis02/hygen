/* hygen motion runtime — library/motion/runtime.js, copied into build/assets/hygen/runtime.js.
   Two entry points, both pure functions of time (one full-span driver each, any seek order — TRAPS.md):
   - HygenMotion.root.init/update — on the main timeline: the engine camera and parallax of scene hosts and
     layers, media backgrounds (ken-burns, drift), post effects, transitions over the cuts;
   - HygenMotion.type(tl, W, cfg) — inside a scene, called by the build right before W.apply(tl): type presets
     of the scene's text slots (scene.json → text) and the fg parallax of those slots.
   CSS and canvas only, no WebGL: the render stays on 4 workers (DECISIONS.md). Presets: library/motion/*.json. */
(function () {
  "use strict";
  var TAU = Math.PI * 2;
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function noise(x, seed) {
    var i = Math.floor(x), f = x - i;
    var a = hash(i * 1.37 + seed * 17.13) * 2 - 1, b = hash((i + 1) * 1.37 + seed * 17.13) * 2 - 1;
    return a + (b - a) * f * f * (3 - 2 * f);
  }
  var E = {
    sine: function (p) { return -(Math.cos(Math.PI * clamp01(p)) - 1) / 2; },
    out2: function (p) { p = clamp01(p); return 1 - (1 - p) * (1 - p); },
    out3: function (p) { p = clamp01(p); return 1 - Math.pow(1 - p, 3); },
    in2: function (p) { p = clamp01(p); return p * p; },
    inOut2: function (p) { p = clamp01(p); return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; },
    back: function (p) { p = clamp01(p); var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
  };

  // ── camera (library/motion/camera.json): state at video time t inside beat b ──
  function camera(cam, t, b, seed) {
    var A = cam.amplitude, d = Math.max(0.001, b.end - b.start), p = clamp01((t - b.start) / d);
    var x = 0, y = 0, s = 1, r = 0;
    if (cam.preset === "push-in") s = 1 + 0.04 * A * E.sine(p);
    else if (cam.preset === "pull-out") s = 1 + 0.04 * A * (1 - E.sine(p));
    else if (cam.preset === "pan") x = 36 * A * (E.sine(p) * 2 - 1) * (b.index % 2 ? -1 : 1);
    else if (cam.preset === "tilt") y = 36 * A * (1 - E.sine(p) * 2);
    else if (cam.preset === "handheld") {
      x = 7 * A * noise(t * 0.55, seed + 11) + 2.5 * A * noise(t * 1.7, seed + 5);
      y = 7 * A * noise(t * 0.47, seed + 23) + 2 * A * noise(t * 1.9, seed + 7);
      r = 0.35 * A * noise(t * 0.33, seed + 37);
    }
    if (cam.shake > 0) {
      for (var k = 0; k < b.hits.length; k++) {
        var dh = t - b.hits[k];
        if (dh < 0 || dh > 0.4) continue;
        var env = Math.exp(-dh / 0.1) * (1 - dh / 0.4) * cam.shake;
        x += 16 * env * Math.sin(dh * 61 + k * 1.7);
        y += 12 * env * Math.sin(dh * 47 + k * 2.3 + 1);
        r += 0.3 * env * Math.sin(dh * 39 + k);
      }
    }
    return { x: x, y: y, s: s, r: r };
  }
  // constant zoom that keeps the frame edges covered while the camera moves
  function overscan(cam) {
    var A = cam.amplitude, m = 0, rot = 0;
    if (cam.preset === "pan" || cam.preset === "tilt") m += 36 * A;
    if (cam.preset === "handheld") { m += 9.5 * A; rot += 0.35 * A; }
    if (cam.shake > 0) { m += 9 * cam.shake; rot += 0.2 * cam.shake; }
    return 1 + (2 * m) / 1080 + (1920 / 1080) * ((rot * Math.PI) / 180);
  }
  function moving(cam) { return cam.preset !== "none" || cam.shake > 0; }

  // ── root: host-root layers on the main timeline ──
  var C = null, cache = {};
  function el(id) {
    var e = cache[id];
    if (!e || !e.isConnected) { e = document.getElementById(id); if (e) cache[id] = e; }
    return e;
  }
  function beatAt(t) {
    for (var i = C.beats.length - 1; i >= 0; i--) if (t >= C.beats[i].start - 1e-6) return C.beats[i];
    return C.beats[0];
  }
  function post(b, id) {
    for (var i = 0; i < b.post.length; i++) if (b.post[i].id === id) return b.post[i].strength;
    return 0;
  }
  function hitEnv(b, t, len, tau) {
    var v = 0;
    for (var k = 0; k < b.hits.length; k++) {
      var d = t - b.hits[k];
      if (d >= 0 && d < len) v = Math.max(v, Math.exp(-d / tau) * (1 - d / len));
    }
    return v;
  }
  // transitions are modules of library/transitions/<id>/transition.js (appended to this file by the build):
  // host(fx, role, d, tr, api) moves the outgoing ("from") or incoming ("to") scene host, overlay(api, d, tr) draws over
  // the cut, frame(api) runs once per frame; `always` — the overlay is written on every frame, not only near its cut
  var api = { el: null, E: E, hash: hash, noise: noise, clamp01: clamp01, C: null, ctx: null, veil: 0 };
  function modules() { return window.HygenTransitions || {}; }
  function hostFx(t, host) {
    var fx = { x: 0, sx: 1, sy: 1, blur: 0 }, mods = modules();
    for (var i = 0; i < C.transitions.length; i++) {
      var tr = C.transitions[i], d = t - tr.at;
      if (d < -0.1 || d > tr.dur + 0.05) continue;
      var role = host === tr.from ? "from" : host === tr.to ? "to" : null;
      if (!role) continue;
      for (var j = 0; j < tr.list.length; j++) {
        var m = mods[tr.list[j]];
        if (m && m.host) m.host(fx, role, d, tr, api);
      }
    }
    return fx;
  }

  function writeMove(e, cs, f, over, fx) {
    var sx = (1 + (cs.s - 1) * f) * over * (fx ? fx.sx : 1), sy = (1 + (cs.s - 1) * f) * over * (fx ? fx.sy : 1);
    e.style.translate = (cs.x * f + (fx ? fx.x : 0)).toFixed(2) + "px " + (cs.y * f).toFixed(2) + "px";
    e.style.scale = sx.toFixed(5) + " " + sy.toFixed(5);
    e.style.rotate = (cs.r * f).toFixed(3) + "deg";
  }

  var root = {
    init: function (config) {
      C = config;
      api.el = el;
      api.C = C;
      for (var i = 0; i < C.beats.length; i++) {
        var b = C.beats[i];
        b.over = moving(b.camera) ? overscan(b.camera) : 1;
        b.moving = moving(b.camera);
      }
    },
    update: function (t) {
      if (!C) return;
      var b = beatAt(t), i;
      // scene hosts: camera × scene depth, transition moves, blur-pull and chromatic filters
      for (i = 0; i < C.beats.length; i++) {
        var bi = C.beats[i];
        if (!bi.active || t < bi.start - 0.1 || t > bi.end + 0.1) continue;
        var host = el(bi.host);
        if (!host) continue;
        var cs = bi.moving ? camera(bi.camera, t, bi, C.seed) : { x: 0, y: 0, s: 1, r: 0 };
        var fx = hostFx(t, bi.host);
        writeMove(host, cs, bi.sceneDepth, bi.over, fx);
        var blur = fx.blur, filters = [];
        var bp = post(bi, "blur-pull");
        if (bp > 0) blur += 18 * bp * (1 - E.out2((t - bi.start) / 0.9));
        if (blur > 0.05) filters.push("blur(" + blur.toFixed(2) + "px)");
        var ca = post(bi, "chromatic"), k = ca > 0 ? ca * 10 * hitEnv(bi, t, 0.45, 0.12) : 0;
        if (k > 0.2) {
          el("hy-ca-r").setAttribute("dx", k.toFixed(2));
          el("hy-ca-gb").setAttribute("dx", (-k).toFixed(2));
          filters.push("url(#hy-ca)");
        }
        host.style.filter = filters.join(" ");
        if (bi.bg) {
          var img = el(bi.bg.move);
          if (img) {
            var p = clamp01((t - bi.start) / Math.max(0.001, bi.end - bi.start));
            var z = bi.bg.zoom[0] + (bi.bg.zoom[1] - bi.bg.zoom[0]) * E.sine(p);
            var dy = bi.bg.drift ? 48 * (0.5 - E.sine(p)) : 0;
            img.style.transform = "translate(0px, " + dy.toFixed(2) + "px) scale(" + z.toFixed(5) + ")";
          }
        }
      }
      // layers (textures, backgrounds): the current beat's camera × their depth
      if (C.parallax && b.moving) {
        var cb = camera(b.camera, t, b, C.seed);
        for (i = 0; i < C.layers.length; i++) {
          var L = C.layers[i];
          if (t < L.start - 0.05 || t > L.end + 0.05) continue;
          var le = el(L.el);
          if (le) writeMove(le, cb, L.depth, 1 + (b.over - 1) * Math.max(1, L.depth), null);
        }
      }
      // post overlays of the current beat
      var sb = post(b, "bloom"), bloom = el("hy-post-bloom");
      if (bloom) { bloom.style.display = sb > 0 ? "block" : "none"; bloom.style.opacity = Math.min(1, 1.2 * sb).toFixed(3); }
      var leak = el("hy-post-leak");
      if (leak) {
        var sl = post(b, "light-leak");
        leak.style.opacity = sl > 0 ? (sl * (0.5 + 0.3 * noise(t * 0.35, C.seed + 3))).toFixed(3) : "0";
        if (sl > 0) {
          el("hy-post-leak-1").style.transform = "translate(" + (160 * noise(t * 0.12, C.seed + 41)).toFixed(1) + "px, " + (260 * noise(t * 0.09, C.seed + 43)).toFixed(1) + "px)";
          el("hy-post-leak-2").style.transform = "translate(" + (180 * noise(t * 0.1, C.seed + 47)).toFixed(1) + "px, " + (300 * noise(t * 0.08, C.seed + 53)).toFixed(1) + "px)";
        }
      }
      var fl = el("hy-post-flicker");
      if (fl) {
        var sf = post(b, "flicker"), step = Math.floor(t * 12), n1 = hash(step * 1.91 + C.seed * 7.7);
        var dip = n1 > 0.72 ? (n1 - 0.72) / 0.28 : 0;
        fl.style.opacity = sf > 0 ? (sf * (0.04 + 0.08 * hash(step * 3.1 + 1.3) + 0.55 * dip)).toFixed(3) : "0";
      }
      var vp = el("hy-post-vpulse");
      if (vp) { var sv = post(b, "vignette-pulse"); vp.style.opacity = sv > 0 ? (sv * hitEnv(b, t, 0.9, 0.3)).toFixed(3) : "0"; }
      // transition overlays (modules of library/transitions)
      var mods = modules();
      for (i = 0; i < C.transitionIds.length; i++) {
        var mf = mods[C.transitionIds[i]];
        if (mf && mf.frame) mf.frame(api, t);
      }
      var tc = el("hy-tr-canvas");
      api.ctx = tc ? tc.getContext("2d") : null;
      api.veil = 0;
      if (api.ctx) {
        api.ctx.setTransform(1, 0, 0, 1, 0, 0);
        api.ctx.clearRect(0, 0, 540, 960);
        api.ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
      }
      for (i = 0; i < C.transitions.length; i++) {
        var tr = C.transitions[i], d = t - tr.at;
        for (var j = 0; j < tr.list.length; j++) {
          var mo = mods[tr.list[j]];
          if (!mo || !mo.overlay || (!mo.always && (d < -0.1 || d > tr.dur + 0.05))) continue;
          mo.overlay(api, d, tr);
        }
      }
      if (api.ctx) api.ctx.globalAlpha = 1;
      var ve = el("hy-tr-veil");
      if (ve) ve.style.opacity = api.veil.toFixed(3);
    }
  };

  // ── type (library/motion/type.json): presets of the scene's text slots, inside the scene composition ──
  // The slot takes over opacity and clip-path of its element with an !important rule fed by CSS variables, so the
  // scene's own entrance tweens keep running but can no longer hide or wipe it (killing tweens left from-values
  // behind — TRAPS.md); transforms are the individual translate/scale/rotate properties, on top of GSAP's transform.
  var PRESETS = {
    "pop": { dur: 0.45, el: function (q) { return { o: q <= 0 ? 0 : Math.min(1, q * 4), s: 0.4 + 0.6 * E.back(q) }; } },
    "slide": { dur: 0.55, el: function (q) { return { o: q <= 0 ? 0 : E.out2(q), x: -90 * (1 - E.out3(q)) }; } },
    "mask-wipe": { dur: 0.6, el: function (q) { var e = q <= 0 ? 0 : E.inOut2(q); return { clip: "inset(-25% " + (100 - 108 * e).toFixed(2) + "% -25% -6%)" }; } },
    "glow-pulse": { dur: 0.9, keep: true, el: function (q, tRef, c) {
      if (q <= 0) return { o: 0 };
      var flash = Math.exp(-q / 0.28), breathe = 0.5 + 0.5 * Math.sin(tRef * 2.4);
      return { o: E.out2(Math.min(1, q * 3)), glow: "0 0 " + (22 + 34 * flash).toFixed(1) + "px rgba(" + c.heroRgb + "," + (0.35 + 0.55 * flash + 0.15 * breathe).toFixed(3) + ")" };
    } },
    "stagger": { dur: 0.42, step: 0.05, ch: function (q) { var e = q <= 0 ? 0 : E.out3(q); return { o: q <= 0 ? 0 : E.out2(Math.min(1, q * 2)), y: -46 * (1 - e), r: -14 * (1 - e) }; } },
    "typewriter": { dur: 0.02, step: 0.07, caret: true, ch: function (q) { return { o: q > 0 ? 1 : 0 }; } },
    "split-reveal": { dur: 0.55, step: 0.02,
      el: function (q) { var e = q <= 0 ? 0 : E.out3(q); return { clip: "inset(" + (50 * (1 - e)).toFixed(2) + "% -12% " + (50 * (1 - e)).toFixed(2) + "% -12%)" }; },
      ch: function (q, i) { var e = q <= 0 ? 0 : E.out3(q); return { o: 1, y: (i % 2 ? 1 : -1) * 40 * (1 - e) }; } },
    "count-roll": { dur: 0.5, step: 0.06, roll: true, ch: function (q) { return { o: q > 0 ? 1 : 0, roll: 105 * (1 - (q <= 0 ? 0 : E.out3(q))) }; } }
  };
  var TEXT_DESC = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  var typeSheet = null;
  function ownRule(css) {
    if (!typeSheet) {
      typeSheet = document.createElement("style");
      typeSheet.setAttribute("data-hygen", "type");
      typeSheet.appendChild(document.createTextNode(".hy-ch { opacity: var(--hy-co, 1) !important; }\n"));
      document.head.appendChild(typeSheet);
    }
    typeSheet.appendChild(document.createTextNode(css + "\n"));
  }

  function makeChar(chr, roll) {
    var o = document.createElement("span");
    o.className = "hy-ch";
    o.style.display = "inline-block";
    o.style.whiteSpace = "pre";
    if (roll) o.style.clipPath = "inset(-0.08em -0.3em 0 -0.3em)";
    var inner = document.createElement("span");
    inner.className = "hy-ci";
    inner.style.display = "inline-block";
    TEXT_DESC.set.call(inner, chr);
    o.appendChild(inner);
    return o;
  }
  function splitStatic(node, roll) {
    var out = [];
    (function walk(n) {
      var kids = Array.prototype.slice.call(n.childNodes);
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k.nodeType === 3) {
          var text = k.nodeValue, frag = document.createDocumentFragment();
          for (var c = 0; c < text.length; c++) { var o = makeChar(text[c], roll); frag.appendChild(o); out.push(o); }
          n.replaceChild(frag, k);
        } else if (k.nodeType === 1 && k.className !== "hy-ch") {
          walk(k);
        }
      }
    })(node);
    return out;
  }

  function type(tl, W, cfg) {
    var slots = [];
    cfg.slots.forEach(function (s) {
      var node = document.getElementById(s.el);
      if (!node || node.style.display === "none") return;
      var preset = PRESETS[s.preset];
      if (!preset && !cfg.parallax && !cfg.bloom) return;
      // bloom: the bright text glows in its own colour (a soft halo on top of the root halation)
      if (cfg.bloom > 0) node.style.textShadow = "0 0 " + (5 + 9 * cfg.bloom).toFixed(1) + "px currentColor, 0 0 " + (22 + 36 * cfg.bloom).toFixed(1) + "px rgba(" + cfg.heroRgb + "," + (0.25 + 0.4 * cfg.bloom).toFixed(2) + ")";
      var slot = { cfg: s, node: node, preset: preset, chars: [], caret: null, neutral: false };
      if (preset) {
        ownRule("#" + s.el + " { opacity: var(--hy-eo, 1) !important; clip-path: var(--hy-clip, none) !important; }");
        if (s.chars) {
          slot.chars = Array.prototype.slice.call(node.querySelectorAll(s.chars));
          ownRule("#" + s.el + " " + s.chars + " { opacity: var(--hy-co, 1) !important; }");
        } else if (preset.ch || preset.caret) {
          var textNode = document.getElementById(s.text) || node;
          if (s.dynamic) {
            var rebuild = function (v) {
              TEXT_DESC.set.call(textNode, "");
              slot.chars = [];
              var str = String(v);
              for (var c = 0; c < str.length; c++) { var o = makeChar(str[c], preset.roll); textNode.appendChild(o); slot.chars.push(o); }
              render(slot, W.ref((tl.time() * cfg.durRef) / cfg.durAct), tl.time());
            };
            var initial = TEXT_DESC.get.call(textNode);
            Object.defineProperty(textNode, "textContent", { configurable: true, get: function () { return TEXT_DESC.get.call(textNode); }, set: rebuild });
            TEXT_DESC.set.call(textNode, "");
            for (var c0 = 0; c0 < initial.length; c0++) { var o0 = makeChar(initial[c0], preset.roll); textNode.appendChild(o0); slot.chars.push(o0); }
          } else {
            slot.chars = splitStatic(textNode, preset.roll);
          }
        }
        if (preset.caret) {
          slot.caret = document.createElement("span");
          slot.caret.className = "hy-caret";
          slot.caret.style.cssText = "display:inline-block;width:0.07em;height:0.8em;margin-right:-0.07em;vertical-align:baseline;background-color:currentColor;";
        }
      }
      slots.push(slot);
    });
    if (!slots.length) return;

    function render(slot, tRef, tAct) {
      var s = slot.cfg, pr = slot.preset, node = slot.node;
      var n = Math.max(1, slot.chars.length);
      var end = pr ? s.at + (pr.step || 0) * (n - 1) + pr.dur + (pr.caret ? 0.7 : 0) : -1;
      var live = pr && (tRef <= end + 0.05 || pr.keep);
      var px = 0, py = 0;
      if (cfg.parallax && cfg.camera) {
        var cs = camera(cfg.camera, cfg.beatStart + tAct, cfg.beat, cfg.seed);
        px = cs.x * cfg.parallax;
        py = cs.y * cfg.parallax;
      }
      if (!pr) {
        node.style.translate = cfg.parallax ? px.toFixed(2) + "px " + py.toFixed(2) + "px" : "";
        return;
      }
      if (!live) {
        if (!slot.neutral) {
          node.style.removeProperty("--hy-eo");
          node.style.removeProperty("--hy-clip");
          node.style.scale = "";
          for (var j = 0; j < slot.chars.length; j++) {
            var cj = slot.chars[j];
            cj.style.removeProperty("--hy-co");
            cj.style.translate = "";
            cj.style.rotate = "";
            if (cj.firstChild && cj.firstChild.style) cj.firstChild.style.translate = "";
          }
          if (slot.caret && slot.caret.parentNode) slot.caret.parentNode.removeChild(slot.caret);
          slot.neutral = true;
        }
        node.style.translate = cfg.parallax ? px.toFixed(2) + "px " + py.toFixed(2) + "px" : "";
        return;
      }
      slot.neutral = false;
      var q = (tRef - s.at) / pr.dur;
      var st = pr.el ? pr.el(q < 0 ? -1 : clamp01(q), tRef, cfg) : {};
      if (st.o === undefined) node.style.removeProperty("--hy-eo"); else node.style.setProperty("--hy-eo", st.o.toFixed(3));
      if (st.clip) node.style.setProperty("--hy-clip", st.clip); else node.style.removeProperty("--hy-clip");
      node.style.scale = st.s === undefined ? "" : st.s.toFixed(4);
      if (st.glow) node.style.textShadow = st.glow;
      node.style.translate = ((st.x || 0) + px).toFixed(2) + "px " + py.toFixed(2) + "px";
      if (pr.ch) {
        var visible = 0;
        for (var i = 0; i < slot.chars.length; i++) {
          var qc = (tRef - s.at - i * (pr.step || 0)) / pr.dur;
          var c = pr.ch(qc <= 0 ? -1 : clamp01(qc), i);
          var o = slot.chars[i];
          o.style.setProperty("--hy-co", String(c.o));
          o.style.translate = "0px " + (c.y || 0).toFixed(2) + "px";
          o.style.rotate = (c.r || 0).toFixed(2) + "deg";
          if (c.roll !== undefined && o.firstChild && o.firstChild.style) o.firstChild.style.translate = "0 " + c.roll.toFixed(1) + "%";
          if (c.o > 0) visible = i + 1;
        }
        if (slot.caret) {
          var host = slot.chars.length ? slot.chars[0].parentNode : node;
          if (tRef < s.at - 0.3 || !host) {
            if (slot.caret.parentNode) slot.caret.parentNode.removeChild(slot.caret);
          } else {
            var before = slot.chars[visible] || null;
            if (before && before.parentNode !== host) before = null;
            if (slot.caret.parentNode !== host || slot.caret.nextSibling !== before) host.insertBefore(slot.caret, before);
            slot.caret.style.opacity = Math.floor((tRef - s.at) * 5) % 2 === 0 ? "1" : "0";
          }
        }
      }
    }

    var clk = { t: 0 };
    tl.fromTo(clk, { t: 0 }, {
      t: cfg.durRef, duration: cfg.durRef, ease: "none",
      onUpdate: function () {
        var tRef = W.ref(clk.t), tAct = (clk.t * cfg.durAct) / cfg.durRef;
        for (var i = 0; i < slots.length; i++) render(slots[i], tRef, tAct);
      }
    }, 0);
  }

  window.HygenMotion = { root: root, type: type, camera: camera, overscan: overscan };
})();
