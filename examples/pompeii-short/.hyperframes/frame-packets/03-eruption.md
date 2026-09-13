# Frame packet: 03-eruption

## Project inputs

- Project: /home/ct/Desktop/hygen/pompeii-short
- Design tokens: /home/ct/Desktop/hygen/pompeii-short/frame.md
- RULES_DIR: /home/ct/Desktop/hygen/.agents/skills/hyperframes-animation/rules

## Assigned storyboard block

## Frame 3 — Извержение: колонна 30 км

- scene: Из кратера вырастает колонна пепла из частиц через весь экран, рядом растёт шкала высоты до 30 км; сыплется пемза, рушатся крыши
- voiceover: "Семьдесят девятый год нашей эры. Везувий выбрасывает колонну пепла на тридцать километров. С неба падает пемза — по нескольку сантиметров в час. Крыши не выдерживают."
- duration: 9.545s
- poster: 6.2s
- transition_in: cut
- status: outline
- src: compositions/frames/03-eruption.html
- type: feature_showcase
- persuasion: Demonstration (механизм показан в работе) + statistical proof (шкала 30 км) + causal chain (колонна → пемза → крыши)
- beat: fascination → dread
- blueprint: compose
- rules: particle-burst, counting-dynamic-scale, stat-bars-and-fills, multi-phase-camera
- focal: колонна пепла из частиц
- roles: колонна частиц = foreground subject · шкала высоты с ember-маркером и счётчиком «КМ» = foreground stat · «79 Н. Э.» = supporting · силуэт конуса = supporting plane · ряд крыш города = supporting plane · падающая пемза и «ПЕМЗА» = supporting · ash-фон с темнеющим небом = background
- sfx: глухой удар на склейке (0.0 с); шорох пепла и пемзы на весь кадр, усиливается с «С неба падает пемза»
- vo_cues: Семьдесят@0.20 · девятый@0.69 · год@1.10 · нашей@1.27 · эры@1.54 · Везувий@2.12 · выбрасывает@2.46 · колонну@3.07 · пепла@3.45 · на@3.71 · тридцать@3.83 · километров@4.17 · С@5.08 · неба@5.18 · падает@5.46 · пемза@5.89 · по@6.45 · нескольку@6.56 · сантиметров@6.99 · в@7.58 · час@7.66 · Крыши@8.24 · не@8.49 · выдерживают@8.59 · конец речи@9.14

narrativeRole: Показывает механизм катастрофы в действии — масштаб колонны и то, как падающая пемза ломает город.
keyMessage: Колонна пепла поднялась на 30 км, пемза засыпала город и проломила крыши.

Геометрия. Фоновый слой — сплошной `background-color: #2E2C29` + плоскость «неба» `#0A0A09`, чья непрозрачность растёт с колонной (сплошной цвет, без градиента). Силуэт конуса — плоскость ash-deep `#211F1D`, полигон (−60,1920) (470,1010) (610,1010) (1140,1920); кратер — плоская вершина x 470–610 на y 1010. Город — ряд из 7 силуэтов ink-charcoal `#121110` на линии земли y 1420 (дома с двускатными крышами шириной 110–190 px, в середине — фронтон храма с 4 колоннами), крыши занимают y 1260–1420; ниже y 1420 — сплошная плоскость ink-charcoal до низа кадра. Колонна рождается в (540,1010). Шкала высоты справа: ось x 990 от y 1010 (0 км) до y 150 (30 км), 28.67 px/км, засечки каждые 5 км (y 1010, 867, 723, 580, 437, 293, 150), ось и засечки 1 px bone@35 %; ember-маркер — треугольник влево на уровне верхушки колонны; показание — «NN» Cormorant Garamond 600, 110 px, bone, прижато вправо к x 955, + «КМ» Inter 600, 36 px, CAPS, smoke, едет вместе с маркером (не выше y 160). «79» — Cormorant Garamond 600, 180 px, bone, от x 90, верх ≈ y 150; «Н. Э.» — Inter 600, 40 px, CAPS, трекинг 0.18em, smoke, справа от числа. «ПЕМЗА» — Cormorant Garamond 600, 72 px, CAPS, трекинг 0.12em, bone, от x 90, y ≈ 760.

Частицы (canvas, чистая функция времени, seeded PRNG от индекса): ~1600 частиц колонны — момент рождения распределён от 2.12 с до конца кадра; подъём с замедлением по экспоненте (верхушка колонны доходит до y ≈ 120 к 4.17 с), ширина растёт с высотой (≈ 40 px у кратера → ≈ 520 px на высоте), боковая турбулентность — синусы от времени и индекса; выше y ≈ 330 частицы расходятся в стороны «зонтом» (крона пинии по Плинию). Радиусы 6–32 px, альфа 0.18–0.5, цвета ash-mid / ash-light / `#3A3835` / ink-charcoal для глубины; нижние 12 % колонны — редкие ember-искры r 2–4, гаснущие с высотой. Пемза — ~500 мелких частиц ash-light r 1.5–4, падают по диагонали сверху через весь кадр (детерминированный модульный цикл), плотность нарастает с 5.08 с. Облачка пыли при обрушении крыш — на том же canvas.

Scene 1 (0.00–2.00s): со склейкой на месте ash-фон, конус и ряд крыш; в кратере тлеет крошечное ember-свечение. На «Семьдесят девятый» (0.20) слева сверху «79» досчитывается 0 → 79 (1.0 с, `power2.out`); «Н. Э.» проявляется на «эры» (1.54).
Scene 2 (2.12–4.40s): на «Везувий» — извержение: частицы вырываются из кратера, колонна растёт снизу вверх через всю высоту кадра. На 2.12 прорисовывается ось шкалы (0.4 с); ember-маркер и показание едут за верхушкой колонны, показание досчитывается 0 → 30 синхронно с высотой и приземляется ровно на «тридцать километров» (3.83–4.17). Небо темнеет (непрозрачность плоскости 0 → 0.5).
Scene 3 (4.17–5.08s): колонна клубится, наверху раскрывается зонт, медленно расползаясь влево и вправо; показание «30 КМ» замерло у верхней засечки.
Scene 4 (5.08–8.20s): на «С неба падает» начинает сыпаться пемза, её плотность растёт до «пемза» (5.89), когда слева раскрывается «ПЕМЗА» (маска слева направо, 0.5 с). С «по нескольку сантиметров» (6.45) на каждой крыше нарастает светлый слой пемзы (ash-light, полоска поверх крыши, scaleY 0 → 1 от 6.45 до 8.20).
Scene 5 (8.24–9.545s): на «Крыши не выдерживают» крыши проваливаются одна за другой слева направо (шаг 0.07 с): скаты раскалываются, половинки опускаются на 26 px с поворотом ±10° (`power2.in`, 0.35 с, затем замирают), над каждым домом поднимается облачко пыли; слой пемзы уходит вниз вместе с ними. Разрушенный силуэт, живая колонна и падающая пемза продолжаются до конца.

Важно для сборки: хост этого кадра продлевается на 0.6 с под шейдерный переход `flash-through-white` — последний показанный кадр не должен ничего убирать; canvas просто продолжает рисоваться от времени, итоговое состояние держится.

## Selected motion rule: particle-burst

---
name: particle-burst
description: Deterministic particle / confetti events — a confetti pop that bursts up and drifts down (optionally instant-shrinking away), a dot burst from behind text, or a glyph dissolving to particles. Every particle's state is a pure ballistic function of timeline time from index-seeded values, so a scrub to any t shows the correct mid-flight frame.
metadata:
  tags: particles, confetti, burst, dissolve, celebration, ballistic, deterministic, punctuation
---

# Particle Burst

Discrete flying particles as a one-shot event: a **confetti pop** that erupts upward and drifts back down on gravity, a **dot burst** radiating from behind a landing word, or a **glyph dissolve** where text breaks into particles that scatter and die. Particles are ephemeral garnish — born from a beat, fly, gone; they never become layout.

Boundaries: [css-marker-patterns.md](css-marker-patterns.md)'s burst mode is radiating **drawn lines** — a static accent, no flight. [press-release-spring.md](press-release-spring.md)'s release burst is **one blurred radial layer** faking an explosion — enough when a single glow pop will do. [center-outward-expansion.md](center-outward-expansion.md) moves **real layout elements** to final resting slots; particles have no destination, only physics and a death.

## How It Works

The whole event is **one driver tween and one formula**:

1. **Seeded setup** — a fixed pool of `PARTICLE_COUNT` small divs is created once at composition setup (a deterministic loop — setup-time generation is fine; per-frame DOM creation is not). Each particle `i` derives everything from a pure hash:

   ```js
   // angle, speed, size, spin, color (palette[i % palette.length]) — all from prand(i * k)
   const prand = (n) => {
     const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
     return x - Math.floor(x); // 0..1, pure function of n
   };
   ```

2. **Ballistic formula** — a proxy tween advances `T: 0 → 1` over `FLIGHT_DUR` with `ease: "none"`; `onUpdate` positions every particle as a **pure function of T**:

   ```
   x(T) = vx · T·FLIGHT_DUR
   y(T) = vy · T·FLIGHT_DUR + ½ · G · (T·FLIGHT_DUR)²
   rot(T) = spin · T·FLIGHT_DUR
   ```

   Gravity `G` supplies the rise-decelerate-fall arc for free. Because position is computed from `T` (never accumulated per frame), a seek to any moment renders the exact mid-flight state — this is what makes DOM particles seek-safe. The driver's `ease: "none"` is load-bearing: the physics lives in the formula; an eased driver warps gravity and the arc stops reading as thrown objects.

3. **Death** — an opacity tail inside the same formula (fade over the last `FADE_FRAC` of flight), or the confetti signature: a separate **instant-shrink** tween scaling the pool to 0 in a blink at flight end. Either way the particles end invisible and stay invisible.

## Recipe

```html
<!-- inside a standard scene clip (hyperframes-core) -->
<div class="burst-stage">
  <div class="particle-field" id="particle-field"></div>
  <div class="burst-hero" id="burst-hero">{heroWord}</div>
</div>
```

```css
/* .burst-stage: position: relative; display: grid; place-items: center.
   .burst-hero: z-index: 2 — particles fly BEHIND the word. */
.particle-field {
  position: absolute;
  z-index: 1;
  left: 50%;
  top: 50%; /* the launch origin — offset to taste (e.g. the word's baseline) */
  width: 0;
  height: 0;
}
.particle {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 2px; /* confetti chip; 50% for dots */
  opacity: 0; /* invisible until the event fires */
  will-change: transform, opacity;
}
```

```js
// Setup: deterministic pool, generated ONCE.
const field = document.getElementById("particle-field");
const palette = ["{accentA}", "{accentB}", "{accentC}"]; // 3-5 brand tokens
const parts = [];
for (let i = 0; i < PARTICLE_COUNT; i++) {
  const el = document.createElement("div");
  el.className = "particle";
  const size = SIZE_MIN + prand(i * 3 + 1) * (SIZE_MAX - SIZE_MIN);
  el.style.width = `${size}px`;
  el.style.height = `${size * 0.7}px`; // slightly oblong = confetti chip
  el.style.background = palette[i % palette.length];
  field.appendChild(el);
  // Index-seeded launch parameters — the particle's whole life, fixed here.
  const angle = -Math.PI / 2 + (prand(i * 5 + 2) * 2 - 1) * CONE; // upward cone
  const speed = SPEED_MIN + prand(i * 7 + 3) * (SPEED_MAX - SPEED_MIN);
  parts.push({
    el,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed, // negative = up
    spin: (prand(i * 11 + 4) * 2 - 1) * SPIN_MAX,
  });
}

// Confetti pop — one driver, pure ballistic formula.
const drive = { T: 0 };
tl.fromTo(
  drive,
  { T: 0 },
  {
    T: 1,
    duration: FLIGHT_DUR,
    ease: "none", // physics lives in the formula, not the ease
    onUpdate: () => {
      const t = drive.T * FLIGHT_DUR; // seconds of flight — pure function of T
      const fade = Math.min(1, (1 - drive.T) / FADE_FRAC); // opacity tail
      parts.forEach((p) => {
        const x = p.vx * t;
        const y = p.vy * t + 0.5 * G * t * t; // rise, stall, drift down
        p.el.style.transform = `translate(${x}px, ${y}px) rotate(${p.spin * t}deg)`;
        p.el.style.opacity = String(drive.T === 0 ? 0 : fade); // T===0 guard covers seeks before the event
      });
    },
  },
  BURST_AT,
);
```

## Variations

- **Confetti pop, then instant-shrink** — the playful signature: full burst, gravity drift, then every chip scales to 0 in a blink: `FADE_FRAC` near 0, plus `tl.to(".particle", { scale: 0, duration: SHRINK_DUR, ease: "power2.in" }, BURST_AT + FLIGHT_DUR - SHRINK_DUR)` with `SHRINK_DUR` 0.15–0.25s. Keep the whole event tiny relative to the subject — a garnish measured in a few dozen pixels, not a screen-filling cannon.
- **Dot burst behind a landing word** — radial instead of a cone: `angle = prand(i) * Math.PI * 2`, `G` near 0, short flight (0.4–0.7s), round dots (`border-radius: 50%`), pool z-indexed behind the word. Fire at the word's settle frame.
- **Glyph dissolve** — seed each particle's **origin** across the glyph block's box (`ox = (prand(i*13) - 0.5) * BLOCK_W`, same for `oy`, added inside the transform), gentle outward drift with low `G`; text fades out over the first ~30% of flight while particles fade in from its silhouette. Color every particle `{textColor}` so the swarm reads as the text's own material. (True per-pixel dissolves are Canvas-2D territory — `techniques.md`; this DOM version sells it up to ~40 particles.)
- **Two-stage burst (pop + stragglers)** — split the pool: 70% on the main driver, 30% on a second driver ~0.12s later with lower speeds; the split is index-derived (`i % 10 < 3`). Same formula, two windows.

## Values

| token                 | range                                        | notes                                                                           |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- | --- | ----------------------- |
| PARTICLE_COUNT        | 10–18 pop/dots; 24–40 dissolve               | **cap ~40** — per-frame style writes; past that, seek perf and register degrade |
| G                     | 900–1600 px/s² confetti; 0–200 dots/dissolve | natural fall vs drift                                                           |
| SPEED_MIN / SPEED_MAX | 250–700 px/s                                 | per-particle via `prand`, never uniform                                         |
| CONE                  | 0.35–0.8 rad (~20–45°)                       | wider = splash, narrower = fountain                                             |
| FLIGHT_DUR            | 0.7–1.4s                                     | arc should peak ~35–45% of flight: check `                                      | vy  | / G ≈ 0.4 × FLIGHT_DUR` |
| SIZE_MIN / SIZE_MAX   | 5–14px chips; 4–8px dots                     | on a 1080p frame                                                                |
| SPIN_MAX              | 180–720 deg/s confetti; 0 dots               | tumble                                                                          |
| FADE_FRAC             | 0.2–0.35                                     | near 0 when using instant-shrink                                                |
| BURST_AT              | on a cause                                   | the word's settle, a click, a lockup completing — an uncaused burst is noise    |

## Critical Constraints

- **Position is a pure function of time, driver ease `"none"`** — `x(T)`, `y(T)`, `rot(T)` computed from the driver value every frame, never accumulated (`+=`) per tick (accumulation breaks the moment the renderer seeks); gravity is the ease — an eased driver bends the parabola.
- **Fixed pool, no per-frame DOM** — all particles exist after setup with `opacity: 0`; the event only writes `transform` / `opacity`. **`PARTICLE_COUNT ≤ ~40`** — per-frame style writes scale linearly; keep the event cheap.
- **Particles start AND end at `opacity: 0`** — the `drive.T === 0` guard covers seeks to before the event; the tail/shrink covers after. A chip frozen mid-air at driver end is a bug every subsequent frame.
- **Particles are punctuation** — one event per beat, fired on a cause, small relative to the subject, dead before the next beat; z-ordered behind or around the word it celebrates, never over it. A persistent particle system is a background, and that's not this rule.

## See also

`spring-pop-entrance` (confetti fires on the hero's settle frame) · `kinetic-beat-slam` (one beat earns the confetti payoff) · `press-release-spring` (single-layer glow alternative, or compose both) · `css-marker-patterns` (drawn-line burst when the accent should feel hand-annotated) · `scale-swap-transition` (glyph dissolve covers the exit).

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

## Selected motion rule: multi-phase-camera

---
name: multi-phase-camera
description: Sequential camera zoom with 2-3 distinct phases (pull-back / focus / push) plus continuous micro-drift for organic cinematic feel.
metadata:
  tags: camera, zoom, phase, drift, scale, cinematic
---

# Multi-Phase Camera

A camera wrapper around the ENTIRE scene that progresses through discrete zoom phases at scripted triggers, with continuous sine-driven micro-drift overlaid so the camera never feels static between phases. Distinct from a single linear zoom — multi-phase creates cinematic pacing (anticipation → reveal → settle).

## How It Works

The camera is one wrapping `<div>` whose `transform: scale() translate(x, y)` is composed from two channels inside a single `onUpdate` writer:

1. **Phase scale** — a proxy object `{ scale }` stepped through phases at trigger times (`PHASE_1_SCALE` at t=0 → `PHASE_2_SCALE` at `PHASE_2_AT` → `PHASE_3_SCALE` at `PHASE_3_AT`).
2. **Drift offset** — a continuous sine-based `translateX` / `translateY` (small amplitude, slow frequency) ADDED to the phase transform. X and Y run at slightly different frequencies (`DRIFT_FREQ_RATIO ≈ 1.3`) — equal frequencies produce a perfect diagonal that reads mechanical; ~1.3 gives an organic Lissajous.

## Recipe

```html
<div class="camera" id="camera">
  <div class="content">
    <div class="hero">{Brand}</div>
    <div class="tagline">{tagline}</div>
    <div class="cta">{ctaText}</div>
  </div>
</div>
```

```css
.scene {
  overflow: hidden; /* REQUIRED — any phase scale < 1 exposes the content's edges */
  background: {sceneBgColor}; /* background on .scene, NOT .camera — a camera-borne
     background warps/translates with the transform and reveals the outer void */
}
.camera {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  transform-origin: 50% 50%; /* off-center origin creates phase-to-phase drift */
  will-change: transform;
}
```

```js
const camera = document.getElementById("camera");

// Three-phase scale plan: pullback → focus → push.
const phase = { scale: PHASE_1_SCALE }; // Phase 1 is the initial value — no tween

// Phase 2 — settle to neutral focus
tl.to(phase, { scale: PHASE_2_SCALE, duration: PHASE_2_DUR, ease: PHASE_2_EASE }, PHASE_2_AT);

// Phase 3 — slow push-in for the climax
tl.to(phase, { scale: PHASE_3_SCALE, duration: PHASE_3_DUR, ease: PHASE_3_EASE }, PHASE_3_AT);

// Drift driver — continuous sine motion overlaid on the phase scale.
// The ONE writer of camera.style.transform.
const drift = { p: 0 };
tl.to(
  drift,
  {
    p: Math.PI * 2 * DRIFT_CYCLES,
    duration: TOTAL_DURATION, // spans the whole composition
    ease: "none",
    onUpdate: () => {
      const dx = Math.sin(drift.p) * DRIFT_AMP_X;
      const dy = Math.sin(drift.p * DRIFT_FREQ_RATIO) * DRIFT_AMP_Y;
      camera.style.transform = `scale(${phase.scale}) translate(${dx}px, ${dy}px)`;
    },
  },
  0,
);

// Content reveals happen INSIDE the camera frame (hero/tagline/cta beats).
```

## Phase Patterns

| Pattern             | Scale sequence (1 → 2 → 3)        | Feel                            | When to use                   |
| ------------------- | --------------------------------- | ------------------------------- | ----------------------------- |
| **Focus-in**        | back → neutral → slight push      | Approach → settle → slight push | Default product reveal        |
| **Dramatic reveal** | push → neutral → pull             | Wide → focus → settle back      | Hero shot with breathing room |
| **Steady push**     | neutral → slight push → more push | Gradual forward momentum        | Continuous narrative push     |
| **Bookend pull**    | neutral → strong push → neutral   | Settle → push → release         | CTA emphasis then release     |

## Variations

- **Phase trigger by content beat**: align a camera tween's start with a content tween's end (entry completes → push begins) rather than a fixed clock value.
- **Camera shake (panic / impact)**: a brief higher-amplitude, higher-frequency drift tween over a short window — same `drift` mechanism with `SHAKE_AMP` / `SHAKE_CYCLES` / `SHAKE_DUR` at `SHAKE_AT`.
- **Targeted zoom into an off-center element**: combine scale with counter-translation so the target lands at viewport center — divide the measured offset by the current scale before feeding it into the writer:

```js
const tRect = document.querySelector(".cta").getBoundingClientRect();
const offsetX = (STAGE_W / 2 - (tRect.left + tRect.width / 2)) / phase.scale;
const offsetY = (STAGE_H / 2 - (tRect.top + tRect.height / 2)) / phase.scale;
// then in onUpdate: translate(offsetX + dx, offsetY + dy)
```

(Full counter-translate doctrine: [coordinate-target-zoom.md](coordinate-target-zoom.md).)

## Values

| token                       | range                                    | notes                                                                               |
| --------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| PHASE_1 / 2 / 3_SCALE       | 0.88–0.96 / 0.98–1.02 / 1.04–1.15        | tighter spread = subtler camera; scale < 1 REQUIRES `overflow: hidden` on `.scene`  |
| PHASE_2_AT / PHASE_2_DUR    | 0.3–1.0s / 1.0–1.8s                      | longer DUR = slower settle, more cinematic                                          |
| PHASE_3_AT / PHASE_3_DUR    | 2.0–4.0s / 1.0–2.0s                      | PHASE_3_AT ≥ PHASE_2_AT + PHASE_2_DUR or focus is preempted                         |
| PHASE_2_EASE / PHASE_3_EASE | `power2.out` `power3.out` `power2.inOut` | spring/back easing on a camera feels uncomfortable; each later phase settles deeper |
| TOTAL_DURATION              | = `data-duration`                        | the drift tween must span the whole composition                                     |
| DRIFT_CYCLES                | 1–3                                      | 1 = one slow breath; high values read as mechanical wobble                          |
| DRIFT_AMP_X / DRIFT_AMP_Y   | 2–8 px / 1–4 px                          | imperceptible per-frame, visible over time — if it reads as a shake, it's too much  |
| DRIFT_FREQ_RATIO            | 1.2–1.5                                  | 1.0 = perfect diagonal (mechanical); ~1.3 = organic Lissajous                       |
| HERO_AT (etc.)              | after Phase-2 settle lands               | a hero fading in mid-pull-back feels like it's flying away                          |

## Critical Constraints

- **Camera wraps EVERYTHING in the scene** — a per-element camera creates parallax bugs and breaks the "one viewpoint" read.
- **One writer**: phase scale and drift compose inside the single drift `onUpdate`; nothing else touches `camera.style.transform`.
- **`overflow: hidden` on `.scene`** — required whenever any phase scale < 1.
- **`transform-origin: 50% 50%` on `.camera`** — off-center origin creates unpredictable phase-to-phase drift.
- **Scene background on `.scene`, not `.camera`** — otherwise scaling/translating reveals the outer void.
- **Hero reveal starts AFTER the initial pull-back ease lands** — otherwise the headline feels like it's flying away.

## See also

[coordinate-target-zoom.md](coordinate-target-zoom.md) (counter-translate math for the targeted variation) · [orbit-3d-entry.md](orbit-3d-entry.md) (orbit inside a drifting camera) · [counting-dynamic-scale.md](counting-dynamic-scale.md) (climax push synced to counter peak) · [3d-text-depth-layers.md](3d-text-depth-layers.md) (depth-stacked hero under camera moves) · [sine-wave-loop.md](sine-wave-loop.md) (element idle inside the camera).
