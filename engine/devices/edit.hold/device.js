/* edit.hold — own device (engine/devices/edit.hold/device.json). The freeze itself is compiled by the build into the
   stage (a stop-frame <img> between two video clips, engine/src/stage.ts); this module draws what marks it on screen:
   viewfinder brackets and an optional label for the duration of the hold. */
HygenDevices.define("edit.hold", function (api, dev) {
  var P = dev.params, tl = api.tl, at = dev.at, until = dev.until;
  if (!P.brackets && !P.label) return;
  var group = api.el("div", { id: api.id("frame"), style: { position: "absolute", left: "0px", top: "0px", width: "1080px", height: "1920px" } });
  if (P.brackets) {
    var s = api.svg("svg", { width: 1080, height: 1920, viewBox: "0 0 1080 1920", style: { position: "absolute", left: "0px", top: "0px" } }, group);
    var L = 70, x0 = 64, y0 = 150, x1 = 1016, y1 = 1400;
    var corners = ["M" + x0 + " " + (y0 + L) + " L" + x0 + " " + y0 + " L" + (x0 + L) + " " + y0, "M" + (x1 - L) + " " + y0 + " L" + x1 + " " + y0 + " L" + x1 + " " + (y0 + L),
      "M" + x1 + " " + (y1 - L) + " L" + x1 + " " + y1 + " L" + (x1 - L) + " " + y1, "M" + (x0 + L) + " " + y1 + " L" + x0 + " " + y1 + " L" + x0 + " " + (y1 - L)];
    corners.forEach(function (d) { api.svg("path", { d: d, fill: "none", stroke: api.C.text, "stroke-width": 5, "stroke-linecap": "square" }, s); });
    tl.set(s, { scale: 1.06, transformOrigin: "540px 775px" }, 0);
    tl.fromTo(s, { scale: 1.06 }, { scale: 1, duration: 0.3, ease: "power3.out", immediateRender: false }, at);
  }
  if (P.label) {
    api.el("div", { id: api.id("label"), text: P.label, style: { position: "absolute", left: "96px", top: "182px", fontFamily: api.F.body, fontWeight: "800", fontSize: api.sizes.labelSm + "px", letterSpacing: "0.2em", color: api.C.text, textShadow: "0 0 10px rgba(" + api.RGB.night + ",0.9)" } }, group);
  }
  tl.set(group, { opacity: 0 }, 0);
  tl.to(group, { opacity: 1, duration: 0.12 }, at);
  if (until !== null) tl.to(group, { opacity: 0, duration: 0.25 }, until);
});
