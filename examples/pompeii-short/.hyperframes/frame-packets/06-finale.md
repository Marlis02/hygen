# Frame packet: 06-finale

## Project inputs

- Project: /home/ct/Desktop/hygen/pompeii-short
- Design tokens: /home/ct/Desktop/hygen/pompeii-short/frame.md
- RULES_DIR: /home/ct/Desktop/hygen/.agents/skills/hyperframes-animation/rules

## Assigned storyboard block

## Frame 6 — Финал: 1/3

- scene: Две секунды чёрной тишины с догорающей искрой, затем огромная «1/3» и шкала из трёх сегментов, где последний — не раскопан
- voiceover: "Треть города не раскопана до сих пор."
- duration: 5.367s
- poster: 4.2s
- transition_in: cut
- status: outline
- src: compositions/frames/06-finale.html
- type: branding
- persuasion: Distillation (одна дробь) + callback (искра хука гаснет в финале) + open loop (история не закончена)
- beat: silence → resolve
- blueprint: titlecard-reveal (Adapt)
- rules: counting-dynamic-scale, svg-path-draw, stat-bars-and-fills
- focal: дробь «1/3»
- roles: «1/3» = foreground subject (цифры bone, дробная черта ember) · шкала из трёх сегментов + «НЕ РАСКОПАНО» = supporting stat · догорающая искра = supporting (0–2 с) · night-фон = background
- sfx: глухой удар на склейке (0.0 с), затем тишина — музыка обрывается на склейке
- vo_cues: тишина 0.00–2.00 · Треть@2.00 · города@2.22 · не@2.61 · раскопана@2.74 · до@3.30 · сих@3.43 · пор@3.60 · конец речи@3.77

narrativeRole: Вывод — одна цифра, которую зритель унесёт с собой: история Помпей ещё не раскопана до конца.
keyMessage: Треть города до сих пор под землёй.

Adapt: берём спокойную карточку-итог с одним сдержанным движением и удержанием; сохраняем подпись-движение «одна раскрывающаяся карточка + неподвижное удержание», меняем содержание на счётную дробь и трёхсегментную шкалу; вместо логотипа — число.

Геометрия. Сплошной night `#0A0A09`. «1» — Cormorant Garamond 600, 520 px, bone, центр ≈ (300, 760); «3» — такой же, центр ≈ (790, 760); дробная черта — ember `#FF5A1F`, штрих 10 px, SVG-линия от (455, 1000) до (635, 520). Шкала — три равных сегмента x 140–940, высота 22 px, зазор 14 px, центр ≈ y 1170: первые два — заливка ash-light `#8C877F`, третий — только контур 2 px ember. «НЕ РАСКОПАНО» — Inter 600, 28 px, CAPS, трекинг 0.2em, smoke, под третьим сегментом, центр ≈ y 1235.

Scene 1 (0.00–2.00s): чёрная тишина. В центре — одна догорающая искра ember-deep (r ~5 px, свечение ≤ 0.25), которая медленно гаснет к 1.9 с. Больше ничего.
Scene 2 (2.00–2.75s): на «Треть» «1» досчитывается 0 → 1 (0.35 с, scale 0.8 → 1, `power3.out`); на «города» (2.22) ember-черта прорисовывается снизу вверх (0.3 с); «3» досчитывается 0 → 3 (2.35 → 2.75).
Scene 3 (2.74–3.60s): на «раскопана» под дробью появляются сегменты шкалы — первые два заливаются слева направо (0.4 с, `power2.out`), третий прорисовывается ember-контуром (0.35 с) на «до сих» (3.30); «НЕ РАСКОПАНО» проявляется на «пор» (3.60).
Scene 4 (3.77–4.92s): неподвижное удержание итоговой карточки.
Scene 5 (4.92–5.367s): финальный кадр гаснет — всё содержимое уходит в opacity 0 (0.45 с, `power2.in`), остаётся чистый чёрный.

## Selected blueprint: titlecard-reveal

# titlecard-reveal — Title-Card / Single-Card Reveal

**intent**: The calm breather/landing beat — one clean title or single brand/proof card revealed with exactly one restrained move (a slide-up crossfade, or a wipe-away-to-reveal), then a still hold. Low motion is the payload, not a deficiency.

**roles served**

- Benefits (from `benefits-titlecard-crossfade`, #34): a calm two-line value title card — headline value line, then one slide-up crossfade to a qualifier/elaboration line that holds center.
- Social_Proof (from `social-proof-reveal-card`, #35): wipe a busy app-collage open away with one diagonal pill-sweep to reveal a clean brand lockup (icon + wordmark) plus a centered "loved by [N]+ [audience] teams" social-proof line that spring-settles and holds.
- CTA (from `hard-cut-card-stack-to-logo`): a monochrome end-card
  CHAIN — statement → CTA / availability line → brand wordmark/logo — separated by instant hard
  cuts at full opacity; each card is its own allocated stillness, and the sequence terminates on
  the logo held to the final frame.
- Product_Intro (from `title-card-prelude-chain`): a three-beat dark title
  PRELUDE before any product UI — `[logo]` pop → `[name]` (a `[version]` appends grey→bright) →
  `[tagline]` card — chained by clears and blur-snap handoffs rather than hard cuts.

**duration**: 3–5s (Benefits 3–4s; Social_Proof ~5s / observed 4.7s). Card chains run 2–3s per
card, ~5.5–9.5s total.

**shot structure**

```
Scene 1 (0.0–~0.4s): static camera on [neutral / dark background]. Establish the opening state.
  Variant — Benefits: empty-to-text — [benefit line 1] is about to fade in centered (no busy open).
  Variant — Social_Proof: a busy intro frame holds briefly — an [app-screenshot / use-case collage] of overlapping cards under a [setup line].

Scene 2 (~0.4–~1.5s): the ONE move executes — a single restrained reveal that brings the calm card to center.
  Variant — Benefits: [benefit line 1] fades in centered while scaling slightly (~95%→100%, smooth ease-out) and holds.
  Variant — Social_Proof: a large [accent-color] rounded pill sweeps diagonally bottom-left → top-right and exits the corner, clip-path wiping the collage away to reveal the [brand logo lockup] beneath as the [logo icon] strokes draw on.

Scene 3 (~1.5s–end): the revealed/settled card holds to the end (the allocated stillness). At most one subtle live element (a slow breathing pulse on the card, or a very slow camera drift). No second development phase.
  Variant — Benefits: [benefit line 1] translates up and fades out as [benefit line 2 — qualifier / elaboration] translates up from below center and fades in to take center; holds. (This single slide-up crossfade IS the one move — Benefits front-loads no Scene-2 wipe.)
  Variant — Social_Proof: the lockup — [logo icon] centered, [wordmark] below, centered [social-proof tagline] "Loved by [N]+ [audience] teams" (the [N]+ may count up) — spring-settles small, then holds.

Variant — card chain (CTA end-card stack / Product_Intro title prelude): the single-card contract
repeats 2–3 times in sequence. Each card is a complete Scene 1–3 in miniature — arrive (or simply
BE there), at most one restrained move, hold — and the seams between cards are INSTANT hard cuts
at full opacity (no crossfade, no fade-through-black) or, in the prelude flavor, a blur-away →
snap-into-focus handoff.
  Card moves stay on budget: a character-by-character type-on with visible partial states, a
  right-to-left backspace that resolves the [wordmark] into the small [logo icon], a grey→bright
  append ("[name]" gains "[version]"), a blur-snap into focus — or nothing beyond a
  barely-perceptible continuous slow scale-up across the hold.
  The final card is always the [brand logo / lockup], held static to the last frame.
```

**motion vocabulary**: single restrained reveal (gentle fade-in + subtle scale-up settle | diagonal clip-path pill-wipe), one slide-up crossfade between two centered lines (Benefits), icon stroke draw-on (Social_Proof), optional "[N]+ teams" count-up, logo+tagline spring-settle-and-hold, subtle breathing on the held card, hold-to-end. Calm register — no spring chains, no tumble, no per-beat flips, no second phase. Camera static (optional very slow drift only). Card-chain register: instant hard cut at full opacity as the only seam, barely-perceptible
continuous slow scale-up across each hold, character-by-character type-on with visible partial
states, right-to-left backspace collapsing the wordmark into the logo icon, grey→bright text
append, blur-away → snap-into-focus card handoff, logo pop with overshoot + glow (prelude opener),
monochrome text-on-solid throughout.

**rule mapping**

- gentle fade-in + subtle scale-up settle (Benefits Scene 2) → `rules/scale-swap-transition.md` (restrained in/settle; cross-reference the fade ease in `techniques.md`)
- single slide-up crossfade between two centered lines (Benefits Scene 3) → `rules/discrete-text-sequence.md` (one line hands off to the next; translate-up + crossfade)
- diagonal pill-wipe reveal (Social_Proof Scene 2) → `../techniques.md` (clip-path reveal masks — the wipe)
- icon stroke draw-on (Social_Proof Scene 2) → `rules/svg-path-draw.md`
- "[N]+ teams" count-up (Social_Proof Scene 3, optional) → `rules/counting-dynamic-scale.md`
- logo + tagline spring-settle-and-hold (Social_Proof Scene 3) → `rules/spring-pop-entrance.md` (single soft settle; intentionally one beat, not a chain)
- subtle breathing on the held card (the one live element during the hold) → `rules/sine-wave-loop.md`
- type-on / backspace / grey→bright append (chain cards) → `rules/discrete-text-sequence.md`
  (non-linear typing incl. backspace; drive the version append as a bulk addition)
- wordmark remainder resolves into the logo icon → `rules/scale-swap-transition.md` (same-center
  swap fired as the last character deletes)
- barely-perceptible slow scale-up across a hold → the camera-modifier drift
  (`rules/multi-phase-camera.md`, micro-drift register) applied per-card
- blur-away → snap-into-focus handoff (prelude flavor) → `rules/depth-of-field-blur.md` (single
  pull on the outgoing / incoming card)
- logo pop with overshoot + glow (prelude card 1) → `rules/spring-pop-entrance.md` +
  `rules/ambient-glow-bloom.md`
- instant hard cut at full opacity → not a rule: a timeline `tl.set` swap — deliberately NO
  transition entry.

**camera modifier**: optional — a single very slow drift/push under the hold only → `rules/multi-phase-camera.md`. Default is fully static; do not add unless the held beat would otherwise read as a freeze-frame.

**stillness note**: This is a legitimate allocated-stillness beat. The hold in Scene 3 is the deliverable, not an unanimated gap — do NOT manufacture a development phase, extra swaps, or force-animation. One restrained move + a subtle hold (optionally one breathing element or one slow drift) is the correct and complete shape. The card-chain variant does not break this: each card individually obeys the one-move + hold
contract, and the hard cut is a seam, not a move. Boundary: if the cards flip at sub-second tempo
or each beat carries its own entrance/exit energy, you have left this blueprint — that is
`kinetic-type-beats` (its CTA variant owns the high-tempo value-line stack).

## Selected motion rule: counting-dynamic-scale

---
name: counting-dynamic-scale
description: Counter animation where the value counts up while transform scale grows to its final size, creating escalating visual weight without per-frame text reflow.
metadata:
  tags: counter, counting, scale, transform, number, dynamic, emphasis
---

# Counting with Dynamic Scale

A number counts from A → B while its transform scale grows to the final size — escalating visual weight ("this is impressive") without tweening `font-size` or forcing text layout on every frame. The final font size is static CSS; only the transform changes.

## How It Works

Two synchronized tweens at the SAME timeline position with the SAME ease: (1) a proxy value rendered as text via `onUpdate` (`Math.round(...).toLocaleString()`), (2) the counter's transform `scale: START_SCALE → 1`, where `START_SCALE = START_SIZE / END_SIZE`. A suffix (`%`, `×`, `+`) slides in AFTER the count lands — the number gets its own beat — and a label fades in early.

## Recipe

```html
<!-- inside a standard scene clip (hyperframes-core) -->
<div class="counter-wrap">
  <span class="counter" id="counter">0</span><span class="counter-suffix">{suffix}</span>
</div>
<div class="counter-label">{label}</div>
```

```css
.counter-wrap {
  display: flex;
  align-items: baseline;
  justify-content: center;
  width: {counterContainerWidth}; /* fixed width — no layout shift as digit count changes */
}
.counter {
  font-variant-numeric: tabular-nums; /* MANDATORY — digits keep equal width */
  display: inline-block;
  font-size: {endSize}; /* final size is static; GSAP animates scale, not font-size */
  transform-origin: center center;
}
.counter-suffix {
  opacity: 0;
  transform: translateY(20px);
}
```

```js
const counter = document.getElementById("counter");
const state = { value: 0 };
const START_SCALE = START_SIZE / END_SIZE;

// Count value — onUpdate changes text only
tl.to(
  state,
  {
    value: TARGET_VALUE,
    duration: COUNT_DUR,
    ease: COUNT_EASE,
    onUpdate: () => {
      counter.textContent = Math.round(state.value).toLocaleString();
    },
  },
  0,
);

// Visual growth — compositor transform sharing the count's timing + ease
tl.fromTo(counter, { scale: START_SCALE }, { scale: 1, duration: COUNT_DUR, ease: COUNT_EASE }, 0);

// Suffix slides in AFTER the count completes
tl.to(
  ".counter-suffix",
  { opacity: 1, y: 0, duration: SUFFIX_DUR, ease: `back.out(${SUFFIX_BOUNCE_FACTOR})` },
  COUNT_DUR,
);

// Label fades in early
tl.from(".counter-label", { opacity: 0, y: 12, duration: LABEL_DUR, ease: "power2.out" }, LABEL_AT);
```

## Variations

- **Direct `innerText` tween (no proxy)** — GSAP can tween `innerText` directly for a number-only counter; keep the proxy form when you need locale formatting or suffix logic. The scale tween stays separate either way:

```js
tl.to(
  counter,
  { innerText: TARGET_VALUE, duration: COUNT_DUR, ease: COUNT_EASE, snap: { innerText: 1 } },
  0,
);
```

- **3D depth entry** — add a `tl.from(".counter", { z: -300, ... }, 0)` push-in; requires `perspective` on `.counter-wrap` and `transform-style: preserve-3d` on the counter.
- **Multi-stat coordinated reveal** — 3 stats counting in parallel share the SAME ease, duration, and start position so they finish together (a chord, not an arpeggio). Each stat usually also needs a paired graphic (bar / ring / stars) — don't stop at the number; see [stat-bars-and-fills.md](stat-bars-and-fills.md).

## Values

| token                 | range                                       | notes                                                                         |
| --------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| TARGET_VALUE          | 2–3 digits ideal                            | 4+ digits needs a wider container; must fit at END_SIZE without clipping      |
| START_SIZE / END_SIZE | START ≈ 40–60% of END                       | design inputs used once for START_SCALE; never tween either                   |
| COUNT_DUR             | 1.2–2.5s                                    | below ~0.8s reads as a flash — the eye must read the digits scrolling past    |
| COUNT_EASE            | `power2.out` / `power3.out` ⭐ / `expo.out` | shared by value + scale; more `.out` = more dramatic deceleration at the peak |
| SUFFIX_DUR            | 0.3–0.6s                                    | fires at `COUNT_DUR`, never during the count                                  |
| SUFFIX_BOUNCE_FACTOR  | 1.4–2.0                                     | overshoot is fine on the suffix (it's punctuation, not data)                  |
| LABEL_AT / LABEL_DUR  | AT < COUNT_DUR/2; 0.4–0.7s                  | label arrives before the count peaks                                          |

## Critical Constraints

- **`tabular-nums` mandatory** + fixed-width container as belt-and-suspenders — without them digit-count transitions (9 → 10 → 100) jitter as glyph widths change.
- **Never set `fontSize` in `onUpdate`** — final type size is static CSS; only the transform changes per frame. Keep `onUpdate` O(1): set text only, no style writes or DOM creation.
- **`Math.round`, not `Math.floor`** — halfway through the final integer should already display the final value.
- **Avoid `back.out` / `elastic.out` on the counter itself** — overshoot makes the number look unstable (it's data, not decoration). Grow in place, don't bounce.
- **Label is BIG TEXT, not a page-style caption** — a tiny paragraph under a hero-size number reads as visual noise in video. Display-size, uppercase, tracked: the label is part of the headline.

## See also

`stat-bars-and-fills` (the paired graphic — give it the same ease/duration so number and fill land as one beat) · `svg-path-draw` (icons drawing in around the number) · `center-outward-expansion` (icons bursting outward at the count peak).

## Selected motion rule: svg-path-draw

---
name: svg-path-draw
description: Animate SVG paths drawing progressively using stroke-dasharray and stroke-dashoffset.
metadata:
  tags: svg, stroke, draw, path, reveal, icon, vector
---

# SVG Path Draw

Reveals an SVG shape by animating its stroke as if a pen were tracing it. Two stroke properties together: **`stroke-dasharray = <pathLength>`** makes the entire path one dash; **`stroke-dashoffset`** starts at the path length (dash shifted fully out of view → invisible) and tweens to `0` (fully drawn). The length comes from the DOM API `path.getTotalLength()` — measured, never guessed.

Works on anything with a stroke: `<path>`, `<circle>`, `<rect>`, `<line>`, `<polyline>`, `<polygon>`, `<ellipse>`.

## Recipe

```html
<!-- inside a standard scene clip -->
<svg class="logo-mark" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <path id="bar-left" d="M 60 40 L 60 160" />
  <path id="bar-right" d="M 140 40 L 140 160" />
  <path id="bar-mid" d="M 60 100 L 140 100" />
</svg>
```

```css
.logo-mark path {
  fill: none; /* outline-only draw — a fill would appear immediately and ruin the reveal */
  stroke: {accentColor};
  stroke-width: 12;
  stroke-linecap: round; /* softer endpoints */
  stroke-linejoin: round;
}
```

```js
// Setup: measure each path and set its dash pattern. Real measured geometry, not a magic number.
document.querySelectorAll(".logo-mark path").forEach((p) => {
  const len = p.getTotalLength();
  p.style.strokeDasharray = `${len}`;
  p.style.strokeDashoffset = `${len}`;
});

// Stagger draws so the eye reads continuous motion — each segment starts at
// ~70-80% of the previous segment's duration, before it finishes.
tl.to(
  "#bar-left",
  { strokeDashoffset: 0, duration: SEGMENT_DRAW_DUR, ease: "power2.out" },
  SEG_1_START,
);
tl.to(
  "#bar-right",
  { strokeDashoffset: 0, duration: SEGMENT_DRAW_DUR, ease: "power2.out" },
  SEG_2_START,
);
tl.to(
  "#bar-mid",
  { strokeDashoffset: 0, duration: FINAL_SEGMENT_DUR, ease: "power2.out" },
  SEG_3_START,
);

// Companion wordmark fades in only after the last stroke settles.
tl.to(
  ".brand-line",
  { opacity: 1, duration: BRAND_FADE_DUR, ease: "power1.out" },
  BRAND_FADE_START,
);
```

## Variations

- **Ring starting at 12 o'clock** — `<circle>` / `<rect>` strokes start at 3 o'clock by default; rotate the element `-90deg` so a progress ring draws from the top:

```html
<circle
  cx="100"
  cy="100"
  r="60"
  id="ring"
  style="transform-origin: 100px 100px; transform: rotate(-90deg)"
/>
```

- **Linear (constant-speed) draw** — `ease: "none"` for a steady-rate "real pen" trace.
- **Draw then fill** — for filled shapes, tween `fillOpacity: 0 → 1` AFTER the stroke completes (requires `fill-opacity: 0` initially and a real `fill` in CSS):

```js
tl.to(
  "#path",
  { strokeDashoffset: 0, duration: SEGMENT_DRAW_DUR, ease: "power2.out" },
  SEG_1_START,
);
tl.to(
  "#path",
  { fillOpacity: 1, duration: FILL_FADE_DUR, ease: "power1.out" },
  SEG_1_START + SEGMENT_DRAW_DUR,
);
```

## Values

| token             | range                                   | notes                                                                                              |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| SEGMENT_DRAW_DUR  | 0.3–0.8s                                | fast snap vs deliberate pen trace; >~1s feels sluggish for a logo reveal                           |
| FINAL_SEGMENT_DUR | 60–80% of SEGMENT_DRAW_DUR              | proportional to segment length — a short connector at full duration reads slower than its siblings |
| SEG_N_START       | previous start + 70–80% of its duration | reads as continuous motion, not N isolated animations                                              |
| SEG_1_START       | 0–0.4s                                  | a small ~0.2s lead-in lets the viewer settle before motion                                         |
| BRAND_FADE_START  | ≥ last stroke end (+ ~0.2s beat)        | earlier and the wordmark competes with the draw                                                    |
| BRAND_FADE_DUR    | 0.3–0.8s                                | snap (urgent) vs glide (premium)                                                                   |

Ease families are discrete choices: **stroke draws** use `power2.out` (a hand lifting at end of stroke) or `none` for constant speed — never `back.out` / `elastic.out` (pens don't bounce). **Fades** use `power1.out`.

## Critical Constraints

- **`fill: none`** for outline-only draws — otherwise the fill appears immediately.
- **Dasharray/dashoffset = the measured `getTotalLength()`**, set at setup; requires the SVG in the DOM (inline SVG is fine; a loaded `<image>` SVG is not).
- **Complex paths**: if `getTotalLength()` looks wrong, overestimate slightly (`len * 1.05`) — too large is invisible at animation start; too small clips the end.
- **Stagger multi-path draws at ~70–80%** of the previous segment's duration.
- **A drawn line must land on something.** When the path is a connector (rail, beam, underline, callout) rather than a shape, both endpoints must sit on real elements and the draw must do a job — reveal, route, validate, or emphasize. A stroke that only decorates empty space reads as filler; attach it or cut it.

## See also

`svg-icon-enrichment` (internal parts animate after the outline draws) · `counting-dynamic-scale` (stroke draws an icon while a number counts up) · `hacker-flip-3d` (logo draws, wordmark decodes beneath).

## Selected motion rule: stat-bars-and-fills

---
name: stat-bars-and-fills
description: Data-viz primitives that pair a number with a graphic — growth bars (CSS scaleY stagger), a progress fill (bar or ring), and a partial star-rating wipe. Seek-safe, deterministic.
metadata:
  tags: data, stats, chart, bars, progress, ring, stars, rating, infographic, number
---

# Stat Bars & Fills

The graphics that give a stat **visual weight** beside its number: a small bar chart, a progress bar/ring filling to a percentage, or a star row filling to a fractional rating. Pair these with [counting-dynamic-scale.md](counting-dynamic-scale.md) (the number) for a complete stat scene.

**Layout blueprint — pick ONE and hold it across all stats:**

- **Single-focus** — one centered frame, the number is the hero, a ring or bar sits under/around it. Cleanest for a sequential reveal (stat 1 → stat 2 → stat 3 in the same frame).
- **Split-frame** — big number on the left, paired graphic on the right. Better when stats are shown together or each needs a distinct visual.

Don't mix blueprints between stats in one piece — that reads as inconsistent.

## Recipe

### 1 — Growth Bars (CSS `scaleY` stagger)

Bars grow from the baseline with a stagger; the last bar is the accent. Heights are authored in CSS (inline height per bar); GSAP only reveals `scaleY: 0 → 1` — never animate `height`.

```css
.bars {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  height: 280px;
}
.bar {
  width: 48px;
  background: #3a4a64;
  transform: scaleY(0);
  transform-origin: bottom center; /* grow UP from the baseline, not from center */
}
.bar:last-child {
  background: #ffc300; /* accent the final/current bar */
}
```

```js
tl.to(".bar", { scaleY: 1, duration: 0.7, ease: "power3.out", stagger: 0.08 }, 0.3);
```

### 2 — Progress Fill

**Bar form** — `scaleX` from a left origin:

```css
.track {
  width: 520px;
  height: 16px;
  background: #1b263b;
  border-radius: 8px;
  overflow: hidden;
}
/* width:100% is REQUIRED — an absolutely-positioned fill with no width is 0px, and scaleX of 0 is
   still 0 → the bar renders invisible (automated gates may miss a zero-width scaled element). */
.fill {
  width: 100%;
  height: 100%;
  background: #ffc300;
  transform: scaleX(0);
  transform-origin: left center;
}
```

```js
const PCT = 0.92; // 92%
tl.to(".fill", { scaleX: PCT, duration: 1.0, ease: "power2.out" }, 0.3);
```

**Ring form** — measured stroke draw (mechanics in [svg-path-draw.md](svg-path-draw.md)):

```js
const ring = document.querySelector("#ring");
const LEN = ring.getTotalLength(); // measure, don't hard-code the circumference
ring.style.strokeDasharray = LEN;
ring.style.strokeDashoffset = LEN; // empty
// rotate the <circle> -90deg in CSS so the fill starts at 12 o'clock
tl.to(ring, { strokeDashoffset: LEN * (1 - 0.92), duration: 1.1, ease: "power2.out" }, 0.3);
```

### 3 — Star-Rating Fill (fractional)

A gold star row revealed left-to-right to a fractional value (e.g. 4.6 / 5) via a clip wipe over a gold layer sitting on a gray layer.

```html
<div class="stars">
  <div class="stars-gray">★★★★★</div>
  <div class="stars-gold" id="goldStars">★★★★★</div>
</div>
```

```css
.stars {
  position: relative;
  font-size: 64px;
  letter-spacing: 8px;
}
.stars-gray {
  color: #2b3548;
}
.stars-gold {
  position: absolute;
  inset: 0;
  color: #ffc300;
  width: 100%;
  clip-path: inset(0 100% 0 0);
}
```

```js
const RATING = 4.6,
  MAX = 5;
tl.to(
  "#goldStars",
  { clipPath: `inset(0 ${100 - (RATING / MAX) * 100}% 0 0)`, duration: 1.0, ease: "power2.out" },
  0.3,
);
```

## Values

| token         | range       | notes                                                                               |
| ------------- | ----------- | ----------------------------------------------------------------------------------- |
| bar count     | 4–6         | reads as "a trend" without clutter; the last bar is the current/accent value        |
| fill duration | 0.8–1.2s    | matched to the paired count-up so number and graphic land together (share the ease) |
| stagger       | 0.06–0.1s   | larger feels sluggish, 0 loses the build                                            |
| accent hue    | exactly one | bars/fill/stars all use the same accent, the rest is muted                          |

## Critical Constraints

- **`scaleY` / `scaleX` / `clipPath`, never `height`/`width` tweens** — author each bar's final height in CSS and scale from 0.
- **`transform-origin`** must be `bottom` (bars grow up) / `left` (fills grow right) — the default center origin scales from the middle and looks wrong.
- **`.fill` needs `width: 100%`** — a zero-width fill scaled by any factor is still invisible, and automated gates may miss it.
- **Measure, don't hard-code** — ring length via `getTotalLength()`; a hard-coded circumference breaks if the radius changes.
- **Match the number's timing** — the fill and the count-up peak together (same start + ease) so the stat resolves as one beat, not two; a paired counter's `onUpdate` must be O(1) (see [counting-dynamic-scale.md](counting-dynamic-scale.md)).
- **One accent hue, consistent blueprint** — see `hyperframes-creative/references/data-in-motion.md`.

## See also

`counting-dynamic-scale` (the number beside the graphic — same ease/duration) · `svg-path-draw` (progress-ring draw mechanics) · `hyperframes-creative/references/data-in-motion.md` (stat layout + visual weight).
