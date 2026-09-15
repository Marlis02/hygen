/* edit.pip — own device (library/devices/edit.pip/device.json): a second picture in a framed window over the stage. The
   build writes the <img> statically into the data layer (id <prefix>-d<i>-pip, engine/src/stage.ts) so the renderer
   preloads it like any stage image; the device only moves it into its window and animates the entrance. */
HygenDevices.define("edit.pip", function (api, dev) {
  var P = dev.params, tl = api.tl, b = dev.box;
  var img = document.getElementById(api.id("pip"));
  if (!img) return;
  var W = b ? b.w : 1080 * P.size, H = b ? b.h : W * P.ratio;
  var polaroid = P.frame === "polaroid", padX = polaroid ? 18 : 0, padB = polaroid ? 70 : 0;
  var x, y;
  if (b) { x = b.x; y = b.y; }
  else {
    var outerW = W + 2 * padX, outerH = H + padX + padB;
    x = P.corner.indexOf("left") >= 0 ? 64 : P.corner === "center" ? (1080 - outerW) / 2 : 1080 - 64 - outerW;
    y = P.corner.indexOf("top") === 0 ? 190 : P.corner === "center" ? 170 + (1250 - outerH) / 2 : 1420 - outerH;
  }
  var shade = "rgba(" + api.RGB.night + ",";
  var win = api.el("div", { id: api.id("win"), style: {
    position: "absolute", left: x.toFixed(0) + "px", top: y.toFixed(0) + "px", width: (W + 2 * padX).toFixed(0) + "px", height: (H + padX + padB).toFixed(0) + "px",
    boxSizing: "border-box", padding: polaroid ? padX + "px " + padX + "px " + padB + "px" : "0px",
    backgroundColor: polaroid ? api.C.text : "transparent", borderRadius: P.frame === "rounded" ? "28px" : polaroid ? "6px" : "0px",
    border: P.frame === "thin" ? "4px solid " + api.C.text : P.frame === "rounded" ? "3px solid rgba(" + api.RGB.text + ",0.85)" : "none",
    boxShadow: P.frame === "none" ? "none" : "0 22px 60px " + shade + "0.6)", overflow: "hidden", transformOrigin: "50% 50%"
  } });
  var inner = api.el("div", { style: { position: "relative", width: "100%", height: polaroid ? H.toFixed(0) + "px" : "100%", overflow: "hidden", borderRadius: P.frame === "rounded" ? "25px" : "0px" } }, win);
  inner.appendChild(img);
  img.style.position = "absolute"; img.style.left = "0px"; img.style.top = "0px"; img.style.width = "100%"; img.style.height = "100%";
  img.style.objectFit = P.fit; img.style.opacity = "1";
  if (P.label) {
    var lab = api.el("div", { text: P.label, style: polaroid
      ? { position: "absolute", left: "0px", right: "0px", bottom: "14px", textAlign: "center", fontFamily: api.F.body, fontWeight: "700", fontSize: api.sizes.labelSm + "px", letterSpacing: "0.1em", textTransform: "uppercase", color: api.C.night }
      : { position: "absolute", left: "0px", right: "0px", bottom: "12px", textAlign: "center", fontFamily: api.F.body, fontWeight: "700", fontSize: api.sizes.labelSm + "px", letterSpacing: "0.1em", textTransform: "uppercase", color: api.C.text, textShadow: "0 0 12px " + shade + "0.95)" } }, win);
    lab.setAttribute("data-layout-allow-overlap", "");
  }
  var at = dev.at;
  if (P.enter === "slide") {
    var dx = x + W / 2 < 540 ? -380 : 380;
    tl.set(win, { opacity: 0, x: dx }, 0);
    tl.fromTo(win, { opacity: 0, x: dx }, { opacity: 1, x: 0, duration: 0.55, ease: "power3.out", immediateRender: false }, at);
  } else if (P.enter === "wipe") {
    tl.set(win, { clipPath: "inset(0% 100% 0% 0%)" }, 0);
    tl.fromTo(win, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power2.inOut", immediateRender: false }, at);
  } else {
    tl.set(win, { opacity: 0, scale: 0.6, rotation: polaroid ? -4 : 0 }, 0);
    tl.fromTo(win, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none", immediateRender: false }, at);
    tl.fromTo(win, { scale: 0.6, rotation: polaroid ? -9 : 0 }, { scale: 1, rotation: polaroid ? -3 : 0, duration: 0.5, ease: "back.out(1.8)", immediateRender: false }, at);
  }
});
