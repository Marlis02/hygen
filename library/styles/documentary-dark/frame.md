---
version: alpha
name: Documentary Dark — Frame (video / frame layer)
description: >
  Frame-scale design system of the hygen style "documentary-dark" (first used by the Pompeii Short). Derived from the
  broadside preset (flat planes, 1px hairlines, one loud accent) and re-cut to the brief: dark,
  cinematic, anxious — a documentary-trailer register, not a travel reel. Ash-grey ground, charcoal
  planes, ONE accent (hot ember orange). Cormorant Garamond (serif antiqua) carries numbers and
  titles; Inter (clean grotesque) carries labels and captions. Film grain + vignette on every frame.
  On-screen copy is English; both families ship as local files (library/assets/fonts).
unit: the frame — 1080×1920 (9:16) primary
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  canvas: "#2E2C29"
  ink-charcoal: "#121110"
  night: "#0A0A09"
  bone: "#ECE7DE"
  smoke: "#A39E95"
  ash-light: "#8C877F"
  ash-mid: "#5A5650"
  ash-deep: "#211F1D"
  ember: "#FF5A1F"
  ember-deep: "#7A2208"
  ember-glow: "rgba(255,90,31,0.45)"
  hairline: "rgba(236,231,222,0.16)"

typography:
  # — serif antiqua: numbers + titles (lining + tabular figures, never italic, never lowercase display) —
  display:     { fontFamily: "Cormorant Garamond", px: 560, weight: 600, lineHeight: 0.86, tracking: "-0.02em", numerals: "lining tabular" }
  number-hero: { fontFamily: "Cormorant Garamond", px: 300, weight: 700, lineHeight: 0.9, tracking: "-0.01em", numerals: "lining tabular" }
  number-mid:  { fontFamily: "Cormorant Garamond", px: 180, weight: 600, lineHeight: 0.92, numerals: "lining tabular" }
  headline:    { fontFamily: "Cormorant Garamond", px: 120, weight: 600, lineHeight: 1.0, tracking: "0.16em", upper: true }
  title:       { fontFamily: "Cormorant Garamond", px: 72, weight: 600, lineHeight: 1.05, tracking: "0.10em", upper: true }
  # — grotesque: labels, units, captions —
  unit:        { fontFamily: "Inter", px: 48, weight: 600, lineHeight: 1.0, tracking: "0.12em", upper: true }
  label:       { fontFamily: "Inter", px: 32, weight: 600, lineHeight: 1.1, tracking: "0.22em", upper: true }
  label-sm:    { fontFamily: "Inter", px: 26, weight: 500, lineHeight: 1.1, tracking: "0.18em", upper: true }
  body:        { fontFamily: "Inter", px: 34, weight: 500, lineHeight: 1.35 }
  caption:     { fontFamily: "Inter", px: 60, weight: 700, lineHeight: 1.12, tracking: "-0.005em" }

spacing:
  canvas: "1080×1920"
  pad-x: "90px"
  safe-top: "140px"
  content-max-y: "1420px"
  caption-band: "y 1450–1670 (text block bottom 250px above the frame edge)"
  right-rail-keepout: "x > 960px for y 1000–1700 (Shorts/TikTok action buttons)"
  hero-anchor-y: "≈ 700–806px"
  gap-lg: "72px"
  gap-md: "40px"
  gap-sm: "16px"

components:
  grounds:
    night: "full-bleed {colors.night} — beats 1 and 6 (the hook and the final card)"
    ash: "full-bleed {colors.canvas} with a faint {colors.ash-deep} vignette pooling at the edges — beats 2–5"
    ember-flood: "full-bleed {colors.ember} surge — ONLY in beat 4 (the pyroclastic flow), then cools back to ash"
    description: "Every frame paints its own ground on a full-duration class=clip background layer, never on #root."
  plane:
    backgroundColor: "{colors.ink-charcoal}"
    description: "Flat charcoal silhouettes / planes (sea, volcano cone, roofs, strata). Sharp corners, no shadow, no gradient fill."
  hairline:
    rule: "1px–2px solid {colors.hairline} (or {colors.bone} at 60–80% for a map coastline)"
    description: "The only line work: coastlines, scales, ticks, leader lines. Never heavier than 3px."
  counter-lockup:
    typography: "{typography.number-hero} or {typography.display} figure + {typography.unit} unit + {typography.label} label"
    description: "Every number on screen COUNTS UP (never static). Figure in serif with font-variant-numeric: lining-nums tabular-nums inside a fixed-width box; unit in Inter caps. Thousands separator = thin space (11 000)."
  ember-mark:
    color: "{colors.ember}"
    description: "The single accent per frame: a city dot, a slash, a marker, an ember glow, the flood. Glow uses {colors.ember-glow} only (same hue)."
  scale:
    rule: "vertical hairline axis with ticks in {colors.ash-light}, marker triangle in {colors.ember}"
    typography: "{typography.label-sm}"
    description: "Altitude scale (beat 3) and depth gauge (beat 4)."
  caption-plate:
    backgroundColor: "rgba(18,17,16,0.84)"
    borderTop: "2px solid {colors.ember} at 85%"
    typography: "{typography.caption}"
    description: "Word-synced subtitle plate owned by compositions/captions.html. Frames never draw inside the caption band."
  grain-vignette:
    description: "Global film grain + radial vignette are mounted once in index.html above all frames — frames do NOT add their own grain."
---

# Documentary Dark — Frame (video / frame layer)

## Brand adaptation (READ FIRST — the frontmatter is the source of truth)

This spec started from the **broadside** preset and was rewritten by hand to the user's brief (the preset
remix could not express an ash ground or the serif + grotesque pairing). The YAML frontmatter above is
**normative — use it verbatim.**

- **Fonts** — **Cormorant Garamond** (display: numbers + titles) and **Inter** (labels, units, captions). Nothing else. No mono face.
- **Weights shipped** — Cormorant Garamond `{500, 600, 700}`, Inter `{400, 500, 600, 700, 800}`. Upright only (no italic files).
- **Colors** — ash / charcoal / night / bone / smoke family + ONE accent `ember`. No second hue, ever.

## Overview

A documentary trailer about a city erased in eighteen hours. The frame is **dark, quiet and heavy**: an
ash-grey ground, charcoal planes laid on it like cut paper, bone-white type, and a single hot ember orange
that behaves like heat — it appears where the fire is and nowhere else. Numbers are the heroes (18 · 11 000 ·
30 км · 100 км/ч · 4–6 м · 1748 · 1/3); each one is set in a large serif antiqua and **counts up** to its
value. Labels are small Inter capitals, tracked wide, like survey annotations on a map.

**Key characteristics at frame scale:**

- **Three grounds** — night (hook + final card), ash (context → excavation), ember flood (one beat only).
- **Serif numerals as monuments** — Cormorant Garamond 600–700, lining + tabular figures, counters in fixed-width boxes.
- **Grotesque chrome** — Inter 500–600 uppercase, 0.18–0.22em tracking, `smoke` colour.
- **Flat planes + hairlines** — charcoal silhouettes, 1–2px bone/ash lines; no drop shadows, no rounded cards, no gradients on content.
- **One accent** — ember orange for the fire, the city dot, a marker, a slash. Glow only as a same-hue bloom.
- **Grain + vignette** on everything (mounted globally in index.html).

## The Frame

- **Canvas:** 1080×1920 portrait. Author in px against this canvas.
- **Safe area:** 90px side padding; nothing load-bearing above y 140.
- **Content keep-out:** every frame element that carries meaning (type, numbers, diagrams, markers) ends at **y ≤ 1420**. The caption plate lives at **y 1450–1670** (250px bottom margin for the Shorts/TikTok UI). Background/ambient layers (grounds, silhouettes, particles, flood) may run full-bleed.
- **Right rail:** keep type out of x > 960 between y 1000 and 1700 (platform action buttons).
- **Hero anchor:** a centred hero sits around y 700–806 (≈0.4 × height), never at the canvas midpoint.

## Colors

`canvas` (#2E2C29) is the default ground; `night` (#0A0A09) replaces it on the hook and the final card.
`ink-charcoal` (#121110) is the plane colour — sea, cone, roofs, strata, caption plate. `bone` (#ECE7DE) is
primary text; `smoke` (#A39E95) is secondary text and labels; `ash-light` / `ash-mid` / `ash-deep` are
material tones (particles, pumice, strata, sea). **`ember` (#FF5A1F) is the only accent** — use it for heat and
for the single most important mark in a frame. `ember-deep` is the same hue cooled or not yet lit.
No pure #000 / #FFF, no cool blues, no second accent, no purple/blue "AI" gradients.

Contrast: bone and smoke on ash/night pass AA for any size; ember on ash passes only as **large** text
(≥ 48px) — never set small copy in ember. On the ember flood, type is `ink-charcoal`.

## Typography

- **Numbers & titles:** Cormorant Garamond. `display` 560px for the lone hero number (18, 1/3), `number-hero`
  300px for primary stats, `number-mid` 180px for secondary stats, `headline`/`title` for uppercase serif titles
  (ЧАСОВ, ПОМПЕИ) with generous tracking. Always `font-variant-numeric: lining-nums tabular-nums;`.
- **Labels & units:** Inter 500–600 uppercase, tracked 0.12–0.22em (ЖИТЕЛЕЙ, КМ, КМ/Ч, М).
- **Captions:** Inter 700, 60px, sentence case (owned by the captions composition).
- Thousands separator: a thin space (`11 000`). Ranges use an en dash (`4–6`). Approximation: `≈`.
- On-screen copy is short motion-graphics copy — numbers, one or two words, a label. Never a narration sentence.

## Depth & Surface

Flat, printed, cinematic: depth comes from **plane overlap, value steps (night → ash-deep → canvas → ash-mid),
hairlines, grain and vignette** — never from box-shadows or rounded glass. The ember is the only light source:
a soft same-hue bloom may sit behind an ember mark (≤ 0.45 opacity).

## Shapes

Sharp corners everywhere. Circles only for dots, rings and particles. Silhouettes are geometric and schematic
(a cone, gabled roofs, a column) — cut-paper, not illustration.

## Components

- **grounds** — night / ash / ember-flood, each a full-duration background clip in the frame.
- **plane** — charcoal silhouettes. **hairline** — coastlines, axes, ticks, leaders.
- **counter-lockup** — serif figure that counts up + Inter unit + Inter label.
- **ember-mark** — the one accent per frame. **scale** — altitude/depth axis with an ember marker.
- **caption-plate** — owned by captions.html. **grain-vignette** — owned by index.html.

## Composition Rules

### Do

- Stack vertically; anchor the hero high (y 300–806) and let supporting elements flow down to y 1420.
- Make every number count up to its value, then hold it still.
- Reveal each element when the voiceover names it; hold the final state — prefer stillness to fidgeting.
- Use ember for heat and for the single most important mark, nothing else.

### Don't

- **Never depict victims, bodies, human silhouettes or plaster casts.** Voids, strata, roofs, a cone, type — abstraction only. The tone is restrained; no gore, no suffering imagery, no sensational framing.
- No tourist imagery (sunny colours, postcards, ruins-as-attraction), no emoji, no icons in colour.
- No second accent colour, no gradients on content, no shadows, no rounded cards.
- No bouncy / elastic / back easing; no infinite loops; no randomness (seeded, index-derived values only).
- Nothing load-bearing below y 1420 or inside the right rail.

## Shader-transition frames (beats 3 and 4)

Beats 3 and 4 are joined by the `flash-through-white` WebGL transition, so both scenes are captured to
textures. In those two frames: no `transparent` keyword in gradients (use the colour at alpha 0), no CSS
`var()` on visible elements, no gradients on elements thinner than 4px, no gradient opacity below 0.15, and
the ground is an explicit solid `background-color`.

## Font loading (auto-generated)

The fonts ship as local files in `assets/fonts/` — do NOT link Google Fonts. Paste this `<style>` into every frame's `<template>` (captions use the same files) so `font-family` resolves in preview, snapshot, and render alike:

```html
<style>
@font-face{font-family:"Cormorant Garamond";font-weight:500;font-style:normal;font-display:block;src:url("assets/fonts/CormorantGaramond-500.woff2") format("woff2");}
@font-face{font-family:"Cormorant Garamond";font-weight:600;font-style:normal;font-display:block;src:url("assets/fonts/CormorantGaramond-600.woff2") format("woff2");}
@font-face{font-family:"Cormorant Garamond";font-weight:700;font-style:normal;font-display:block;src:url("assets/fonts/CormorantGaramond-700.woff2") format("woff2");}
@font-face{font-family:"Inter";font-weight:400;font-style:normal;font-display:block;src:url("assets/fonts/Inter-400.woff2") format("woff2");}
@font-face{font-family:"Inter";font-weight:500;font-style:normal;font-display:block;src:url("assets/fonts/Inter-500.woff2") format("woff2");}
@font-face{font-family:"Inter";font-weight:600;font-style:normal;font-display:block;src:url("assets/fonts/Inter-600.woff2") format("woff2");}
@font-face{font-family:"Inter";font-weight:700;font-style:normal;font-display:block;src:url("assets/fonts/Inter-700.woff2") format("woff2");}
@font-face{font-family:"Inter";font-weight:800;font-style:normal;font-display:block;src:url("assets/fonts/Inter-800.woff2") format("woff2");}
</style>
```
