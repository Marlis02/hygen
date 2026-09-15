# Контракт сцены

Сцена библиотеки — это папка `engine/scenes/<id>/`:

- `scene.html` — шаблон подкомпозиции HyperFrames с одним paused-таймлайном;
- `scene.json` — описание по [schema.json](schema.json): параметры, якоря, длительность, сид, безопасная зона.

Ролик не трогает HTML сцен. Всё, что меняется от ролика к ролику, — параметры, якорные слова, оттенок и сид в `video.json`, а поверх сцены — слои движка: look ролика, текстуры, медиафон, камера, типографика, пост-эффекты и переходы (разделы ниже). Сцена о слоях не знает: она только объявляет в `scene.json` свои текстовые слоты. Если для нового ролика пришлось править `scene.html`, контракт неполный: сначала чинится контракт (новый параметр в `scene.json`), потом ролик.

## Библиотека

| id | Что на экране | Помпеи |
|---|---|---|
| `counter-title` | большое число считает до значения, слово-единица под ним; может «гореть» и остывать | 18 HOURS |
| `map-marker` | силуэт побережья, метка с подписью, маршрут, счётчик с подписью, ряд слов, вершина с подписью | залив, POMPEII, ≈ 11,000 RESIDENTS, VESUVIUS |
| `scale-gauge` | шкала высоты (up) или глубины (down), маркер и отсчёт едут со значением, дата, слово, слои сюжета; сценография `scenery`: volcano, volcano-still, ocean, wave (волна растёт до значения), mountain (вершина на верху шкалы), building (окна загораются под меткой), none | 79 AD, столб пепла 30 KM, PUMICE, крыши |
| `year-odometer` | год выкатывается барабанами, ±N с единицей, слои разреза | 1748, +100 YEARS, PLASTER |
| `picture-zoom` | картина или фото с медленным наездом к точке, частицы поверх, подпись и кредит | (в английской версии нет: у картины Волера нет лицензии) |
| `fraction-finale` | дробь «числитель / знаменатель», шкала из сегментов, подпись под выделенными | 1/3 STILL BURIED |
| `pyroclastic-flow` | геройская сцена Помпей: обрушение колонны, огненная лавина, скорость, слой пепла | ≈ 100 KM/H, 4–6 M |

Дефолты каждой сцены = Помпеи: бит без `params` собирает кадр из эталонного ролика.

## Бит в video.json

```json
{
  "id": "03-depth",
  "scene": "scale-gauge",
  "text": "The wreck lies [3,800|three thousand eight hundred] meters down.",
  "pad": [0.2, 0.4],
  "tone": "cold",
  "seed": 7,
  "params": { "direction": "down", "value": 3800, "unit": "M" },
  "anchors": { "rise": "wreck", "value": "meters" },
  "sources": { "value": "https://en.wikipedia.org/wiki/Wreck_of_the_Titanic" }
}
```

- `id` бита — имя композиции; может начинаться с цифры (движок сам даёт элементам префикс `f<id>-`).
- `params` — только параметры из `scene.json` сцены; остальное берётся из `default`. Лишний или неверного типа параметр — ошибка сборки.
- `anchors` — якорь сцены → слово реплики. Формат слова: `word`, `word#2` (второе вхождение), `word.end` (конец слова). Слова — как их произносит голос: для `[3,800|three thousand eight hundred]` якорь ставится на `three` или `hundred`, не на «3,800».
- `cues` — низкоуровневые опорные точки «опорное время сцены → слово» для тонкой подгонки. Режиссёру не нужны.
- `tone` — `accent` (тёплый акцент стиля, по умолчанию) или `cold` (холодный). Меняет цвет «героя» сцены: огня, метки, выделенного сегмента.
- `seed` — целое; меняет раскладку частиц и шума. Без сида берётся `seed.default` сцены (0 = вид Помпей).
- `sources` — ссылки на источники цифр, см. «Источники».
- `textures`, `background`, `type`, `camera`, `post`, `transition` — слои движка на этот бит поверх look ролика: разделы «Текстуры», «Фон бита», «Motion», «Переходы».

## scene.json

| Поле | Что |
|---|---|
| `id`, `name`, `use` | id = имя папки; `use` — по-английски, когда режиссёру брать сцену |
| `hero` | `true` — геройская сцена под одну тему |
| `ref` | опорный клип, на котором сцена авторизована: `duration`, `speechStart`, `speechEnd`. Все времена шаблона и якорей — на этой шкале |
| `duration` | `{min, max}` — разумная длительность клипа бита, с; вне диапазона сборка предупреждает |
| `settle` | опорное время, когда кадр устоялся: по нему автопроверка сравнивает MP4 со снимком |
| `params` | параметры, см. ниже |
| `anchors` | `имя → {at, description, required}`: события сцены на опорной шкале |
| `events` | `[{anchor | at, label, if}]`: события, которые обязаны заметно изменить кадр (проверка frozen) |
| `seed` | `{default, affects}`; `affects: null` — случайности нет |
| `safeZone` | `{contentMaxY, rightRail}` — что сцена гарантирует |
| `depth` | множитель параллакса сцены под камерой движка (1) |
| `text` | текстовые слоты для кинетической типографики: `слот → {el, kind, at, dynamic?, chars?, text?}`, см. «Motion» |

### Параметры

Имена плоские, camelCase: `counterValue`, `counterLabel`, а не вложенные объекты.

| type | значение | проверка |
|---|---|---|
| `number`, `integer` | число | `min`, `max` |
| `string` | строка; экранный текст — ЗАГЛАВНЫМИ, если так в дефолте | `maxLength` |
| `boolean` | вкл/выкл слоя | — |
| `enum` | одна из `values` | — |
| `list` | массив строк | `maxItems`, `maxLength` на элемент |
| `point` | `{x, y}` в px кадра 1080×1920 | y ≤ `contentMaxY`, не в правой полосе (x > 960 при y 1000–1700) |
| `map` | имя силуэта из `engine/assets/maps/<имя>.svg` | рядом `<имя>.license.json`; в сцену приходит `{name, water, coast, fillRule}` |
| `image` | путь к файлу от папки ролика | рядом `<файл без расширения>.license.json`; файл копируется в `assets/media/`, в сцену приходит путь |

- `figure: true` — параметр выводит цифру на экран, нужен `sources.<param>`.
- `if: "param"` — параметр показывается только при условии: `param` (истинно), `!param`, `param>=2` (для строк и списков — длина), `param==word`; части соединяются `&&`: `section&&voids`.

### Силуэты карт

`engine/assets/maps/<имя>.svg`: `viewBox="0 0 1080 1920"`, пути в px кадра, окно карты — прямоугольник x 60–1020, y 150–990.

- `<path data-role="water" d="…">` — вода, заливается плоскостью стиля; несколько путей склеиваются; `data-fill-rule="evenodd"` — если вода задана рамкой с вырезами суши.
- `<path data-role="coast" d="…">` — береговая линия, рисуется штрихом.
- `<имя>.license.json`: `{ "source", "author", "license", "url", "notes" }`.

### Медиа

Каждый файл картинки лежит в папке ролика (`videos/<id>/media/`) с записью `<файл>.license.json`: `source`, `author`, `license`, `url`. Без записи сборка падает. Только Wikimedia Commons, NASA, Pexels, Pixabay.

## Якоря и время

Сцена авторизована на опорном голосе (`ref`). Сборка строит кусочно-линейный варп: опорные времена якорей → времена слов текущего голоса. Всегда закреплены начало клипа, начало речи, конец речи и конец клипа. Всё, что в шаблоне стоит на опорном времени якоря, случится на его слове.

- `required: true` — якорь обязателен в бите: без него сцена не попадёт в смысл.
- Необязательный якорь без слова просто растягивается вместе с соседями.
- Якоря идут по порядку: если слова стоят не в том порядке, что опорные времена, лишний якорь пропускается с предупреждением.

## Оттенок, сид, безопасная зона

- **Оттенок.** Стиль задаёт `tones.accent` и `tones.cold` → токены `hero`, `heroDeep`, `heroHot`, `heroLight`. Сцена красит «героя» только ими; `accent` напрямую — только то, что не должно менять оттенок.
- **Сид.** В скрипт приходит `SEED`. Любая псевдослучайность — хеш от индекса и сида (`prand(i + SEED * 101.3)`, `mulberry32(base + SEED)`); при `SEED = 0` раскладка совпадает с Помпеями. `Math.random()` и `Date.now()` запрещены.
- **Безопасная зона** (из стиля): смысловые элементы — не ниже y 1420; субтитры — y 1450–1670; справа при y 1000–1700 текст не заходит за x 960. Фоны, силуэты и частицы могут идти в край.

## Источники

Каждая цифра на экране имеет ссылку в `sources` бита:

- параметр с `figure: true` → `sources.<param>`;
- строковый или списочный параметр, в значении которого есть цифры → `sources.<param>`;
- цифра в реплике, которой нет среди цифр-параметров бита (например, «2 hours 40 minutes» при счётчике 160) → `sources.text`.

`npm run verify` (и шаг автопроверки в `build`) падает, если ссылки нет.

## Шаблон scene.html

Плейсхолдеры, которые подставляет сборка:

| В шаблоне | Становится |
|---|---|
| `__cid__` | id композиции (= id бита): `data-composition-id="__cid__"`, `window.__timelines["__cid__"]` |
| `__p__` | префикс id и классов элементов: `id="__p__-counter"` → `f01-hook-counter` |
| `{{hygen:duration}}` | длительность клипа, с |
| `{{hygen:fontfaces}}` | блок `@font-face` всех шрифтов стиля (внутри `<style>`) |
| `{{hygen:font.display}}`, `{{hygen:font.body}}` | `"Cormorant Garamond", serif` |
| `{{hygen:color.<имя>}}` | цвет стиля `#RRGGBB`; имена оттенка: `hero`, `heroDeep`, `heroHot`, `heroLight` |
| `{{hygen:rgb.<имя>}}` | тот же цвет как `r,g,b` — для `rgba({{hygen:rgb.text}}, 0.35)` |
| `{{hygen:size.<имя>}}` | размер шрифта из стиля, px |
| `{{hygen:param.<имя>}}` | строковый параметр, экранированный для HTML |
| `/*{{hygen:params}}*/` | `var P = {…}, S = {colors, rgb, fonts, sizes, safeZone}, SEED = n;` — первой строкой скрипта |
| `/*{{hygen:warp}}*/` | объект варпа `W` сразу после `var tl = gsap.timeline({ paused: true });` |

Сборка падает, если в шаблоне:

- есть цвет литералом (`#abc`, `#aabbcc`, `rgb(…)`, `rgba(…)` с цифрами) — только токены;
- есть `font-family:` не через `{{hygen:font.…}}` или свой `@font-face`;
- нет `__cid__`, `/*{{hygen:params}}*/`, `/*{{hygen:warp}}*/`, `W.apply(tl)`;
- после подстановки остался хоть один `{{hygen:`.

Правила анимации (из TRAPS.md):

- все времена твинов — опорные; перед регистрацией таймлайна `W.apply(tl)`;
- всё, что пишется из `onUpdate` (счётчики, canvas, камера), — от одного драйвера на всю длину сцены: `tl.fromTo(clock, {t: 0}, {t: DUR, duration: DUR, ease: "none", onUpdate: () => render(W.ref(clock.t))}, 0)`;
- у повторных `fromTo` одного свойства — `immediateRender: false` и базовый `tl.set` в нуле;
- разрядку букв анимировать сдвигом букв по x, не `letterSpacing`;
- id элементов — только с префиксом `__p__-`.

## Look ролика

`video.json → "look"`: id из `engine/looks/` (`ember` — Помпеи, `abyss`, `storm`) или объект — новый look прямо в ролике, можно от встроенного: `{"extends": "abyss", "palette": {"accent": "#E0B040"}, "textures": [...]}` (разделы сливаются по ключам, списки заменяются). Без look — `ember`.

| Поле | Что |
|---|---|
| `id`, `name`, `about` | `about: {mood, topics, avoid}` — настроение, для каких тем, чего избегать |
| `palette` | `accent`; `secondary` — цвет тона `cold` бита; `groundTint` — `#RRGGBB` перекрашивает ночь, пепел и приглушённый текст (светлота сохраняется) или `null`; `temperature` warm/cold; `textColor`; `colors` — явные токены стиля |
| `textures` | текстуры на весь ролик `[{id, …параметры}]` (зерно — не здесь, а в `grain`) |
| `motion` | `camera {preset, amplitude, shake}`, `parallax {enabled, bg, mid, scene, fg}`, `type {number, title, label}`, `post [{id, strength}]` |
| `transitions` | `{default, hit}` — id или список id из `engine/transitions/` |
| `grain` | множитель зерна стиля, 0 — без зерна |
| `vignette` | `{alpha, clear}` |
| `sound` | `{hit, whoosh}` — подсказки звуковому модулю (D4) |

Неизвестное поле, текстура, пресет или переход — ошибка сборки. Палитра подменяет токены стиля при сборке сцены: `{{hygen:color.*}}` и `S.colors` уже в цветах look (цвет палитры, равный цвету стиля, не пересчитывается — ember даёт Помпеи байт в байт). Слои движка читают ту же палитру как CSS-переменные `--hy-<токен>` и `--hy-rgb-<токен>` на корне ролика.

## Текстуры

`engine/textures/<id>/texture.json` + `texture.html` — полнокадровый слой над сценой и под субтитрами со своим таймлайном. Библиотека: `grain` (всегда, сила — `look.grain`), `fire` (crater, horizon, glow), `embers`, `ash` (flakes, pumice), `rain`, `bubbles`, `smoke`, `fog`, `lightning`, `wind`, `snow`, `paper` (D6); параметры с дефолтами — в их `texture.json`.

Ссылка (в look или бите): `{"id": "rain", "density": 0.8, "angle": -20, "opacity": 0.6, "blend": "screen", "depth": "fg", "seed": 3}`. У любой текстуры есть `opacity` 0–1, `blend` (normal, screen, lighten, overlay, soft-light, multiply, color-dodge, plus-lighter), `depth` (bg, mid, fg или множитель — слой параллакса и порядок: bg ниже fg) и `seed`.

Типы параметров текстуры сверх типов сцены:
- `color` — токен палитры (`hero`, `heroLight`, `ashLight`, `text`…) или `#RRGGBB`; в шаблон приходят `P.<имя>` (#RRGGBB) и `P.<имя>Rgb` («r,g,b»);
- `cues` — времена внутри слоя: `hits` (удары `sound.hits`), `start`, секунды или слово реплики бита (`blast`, `died+0.2`). `texture.json → events` отмечает cues-параметр как события слоя (удар молнии → гром).

Направление `angle`: у падающих (ash, snow, rain) — от вертикали, плюс сносит влево; у embers — отклонение подъёма, плюс вправо; у wind — наклон полос; у smoke — направление дрейфа.

Шаблон `texture.html`: `__cid__`, `__p__`, `{{hygen:duration}}`, `/*{{hygen:params}}*/` → `var P = {…}, S = {colors, rgb}, SEED = n, DUR = с;`. Правила сцен: один драйвер на всю длину, кадр — функция времени, случайность только от `SEED`, без литеральных цветов (и без помощников с именем `rgba(`), id с `__p__-`, canvas 540×960 в координатах кадра. Внеэкранный буфер для мягких спрайтов разрешён: рисуется один раз при инициализации.

## Фон бита

У любого бита: `"background": {"image": "media/x.jpg", "treatment": ["duotone", "ken-burns"], "focus": [0.6, 0.5], "opacity": 0.5, "blend": "lighten", "depth": "bg", "zoom": [1, 1.1]}`.

- `image` (jpg, png, webp) или `video` (webm, mp4, mov) от папки ролика; рядом обязателен `<файл>.license.json`, как у картинок сцен.
- `treatment` (одно или списком): `duotone` — перекраска в палитру бита (ночь → hero-deep → чуть светлее), `blur` — размытие с затемнением, `ken-burns` — медленный наезд к `focus` (`zoom` [от, до]), `parallax` — медленный дрейф по вертикали. Без treatment — `ken-burns`.
- `focus` — [x, y] доли картинки: центр обрезки и наезда.
- Слой лежит над сценой в режиме `lighten`: картинка заменяет тёмную землю сцены, светлый текст и герой остаются сверху. Лучше всего под ночной землёй (`counter-title`, `fraction-finale`, `year-odometer` без пыли, `scale-gauge` без сценографии); на карте и под пепельной землёй картинка спорит со сценой.
- Картинка обрабатывается при сборке (`engine/py/background.py`, кэш `videos/<id>/.cache/bg`), в рендере только движется. Видео ffmpeg зацикливает и режет до длины бита, звук убирает.

## Motion

Реализация — `engine/motion/runtime.js` (CSS и canvas, без WebGL: рендер остаётся в 4 потока). Всё задаётся в look и переопределяется в бите.

- **Камера** (`engine/motion/camera.json`): `none`, `push-in`, `pull-out`, `pan`, `tilt`, `handheld`; `amplitude` 0–2, `shake` 0–2 — тряска на ударах `sound.hits`. Двигает хост сцены целиком свойствами `translate`, `scale`, `rotate` с запасом по краям; внутренняя камера сцены продолжает работать. Бит: `"camera": "tilt"` или `{"preset": "handheld", "amplitude": 1.3, "shake": 1.2}`.
- **Параллакс** (`parallax.json`): при `look.motion.parallax.enabled` фон бита и текстуры повторяют камеру с множителем своего `depth`, сцена — с `scene`, текстовые слоты — с `fg`.
- **Типографика** (`type.json`): `pop`, `stagger`, `slide`, `typewriter`, `split-reveal`, `count-roll`, `glow-pulse`, `mask-wipe`. Сцена объявляет слоты в `scene.json → text`: `"counter": {"el": "counter", "kind": "number", "at": "ignite", "dynamic": true}` — `el` id без префикса; `kind` number, title или label; `at` якорь или опорное время появления; `dynamic` — сцена переписывает текст (счётчик); `chars` — селектор своих ячеек символов (`.__p__-col`); `text` — элемент с текстом внутри `el`. Look даёт пресет по `kind`, бит — `"type": "stagger"` всем слотам или `{"year": "typewriter"}`. Пресет заменяет появление элемента (прозрачность, маску, сдвиг), цвет и счёт сцены остаются. `npm run scenes` показывает слоты.
- **Пост-эффекты** (`post.json`), `[{id, strength 0–1}]`: `bloom` (свечение текста и ореол цвета героя), `light-leak`, `chromatic` (на ударах), `flicker`, `blur-pull` (бит начинается размытым), `vignette-pulse` (на ударах). В look — на весь ролик, в бите — поверх.

## Переходы

`engine/transitions/<id>/`: `transition.json` (`id`, `name`, `use`, `duration`) и `transition.js` — модуль, который сборка дописывает к runtime: `window.HygenTransitions[id] = {host(fx, role, d, tr, api), overlay(api, d, tr), frame(api), always}` — `host` сдвигает, масштабирует и размывает уходящую (`from`) или входящую (`to`) сцену, `overlay` рисует над стыком (`api.ctx` — общий canvas переходов, `api.el`, `api.C.rgb`/`api.C.hex` — палитра look), `d` — секунды от стыка. Библиотека: `hard-cut`, `flash`, `ash-burst`, `whip`, `water-ripple`, `smoke-wipe`; D6 — `iris`, `blinds`, `grid-dissolve`, `film-burn`, `directional-wipe`, `grade-split` (canvas по идеям компонентов реестра, `engine/devices/VENDOR.md`). Каждый стык получает переход по порядку: `video.json → transitions` (`{"from", "to", "type": ["flash", "ash-burst"], "duration"}`, только соседние биты) → `"transition"` бита (переход в этот бит) → `look.transitions.hit`, если на стык падает тяжёлый удар (`heavy`) → `look.transitions.default`. Разгон перехода до стыка — не дольше 0,08 с: settle-кадр уходящей сцены остаётся чистым.

## Проверка сцены без голоса

```bash
npm run scene -- counter-title                                   # дефолты = кадр Помпей
npm run scene -- counter-title --params '{"value":160,"format":"clock"}' --tone cold --seed 3
npm run scene -- counter-title --look abyss                        # сцена под look (и его текстурами, камерой, пост-эффектами)
npm run scene -- map-marker --look storm --beat '{"type":{"count":"stagger"},"camera":{"preset":"handheld","shake":1},"post":[{"id":"chromatic","strength":0.8}]}'
npm run scene -- fraction-finale --textures '[{"id":"rain"}]'       # текстура поверх look
npm run scene -- counter-title --beat '{"background":{"image":"videos/titanic-en/media/rms-titanic.jpg","treatment":["duotone","ken-burns"]}}'
```

В превью удары — это события сцены: тряска, chromatic и vignette-pulse срабатывают на них.

Сцена собирается в `.preview/<id>/` на своём опорном времени, проходит `hyperframes lint` и снимается в моменты событий и `settle`; контактный лист — `.preview/<id>/sheet.jpg`. Это быстрый просмотр; приёмка — только по кадрам из MP4.

## Бит v2: stage + devices + intent

Бит — **либо** `scene` (сцена с HTML из библиотеки выше, как раньше, без изменений), **либо** `stage` — база кадра и 0–3 устройства поверх. Новых HTML-сцен нет: кадр собирается из stage и устройств. Эталоны: `videos/_proof/titanic-v2`, `videos/_proof/krakatoa-v2`.

```json
{
  "id": "02-hull", "role": "turn",
  "text": "She had [16|sixteen] compartments and could float with four flooded. The iceberg opened six.",
  "stage": { "type": "media", "src": "media/rms-titanic.jpg", "fit": "contain", "treatment": "film-memory",
             "regions": { "hull": { "x": 2, "y": 53, "w": 91, "h": 6.6 } } },
  "devices": [
    { "type": "focus.spotlight", "target": "hull", "at": "compartments", "params": { "shape": "rect" } },
    { "type": "annotate.box", "target": "hull", "at": "sixteen", "params": { "cells": 16, "fill": 6, "fillAt": "six", "fillFrom": "right", "label": "FLOATS WITH 4 FLOODED" },
      "explains": "the hull was split into 16 compartments and six filled", "source": "https://…" },
    { "type": "data.count", "target": { "x": 50, "y": 36 }, "at": "six", "params": { "to": 6, "label": "OPENED TO THE SEA" }, "source": "https://…" }
  ],
  "dominant": 1,
  "camera": { "reason": "tension", "preset": "push-in", "amplitude": 0.5 },
  "sources": { "text": "https://…" }
}
```

| Поле | Что |
|---|---|
| `stage` | ровно один: `media`, `split`, `map`, `color` (разделы ниже) |
| `devices` | 0–3 устройства: `type`, `target`, `at`, `until`, `params`, `explains`, `source` |
| `dominant` | **обязателен**: `"stage"` или индекс устройства — что главное в кадре |
| `camera` | камера движка двигается только с `reason`: `approach` (push-in), `reveal` (pull-out), `follow` (pan), `tension` (handheld); без reason кадр стоит, даже если look задаёт камеру |
| `intent` | необязателен: резолвер раскрывает его в stage + devices (раздел «Intents») |
| `target`, `at`, `data` | короткая форма для intent и JSON-рецепта |
| `role` | роль бита в структуре арки |
| `tone`, `seed`, `textures`, `post`, `transition`, `sources` | как у бита со сценой; `type` и `background` у stage-бита — ошибка (текст — устройства `text.*`, медиа — stage) |
| `caption`, `sync` | субтитры бита поверх look и ролика; ритм устройств бита voice \| music \| both (раздел «Текст на экране») |

- **Координаты — проценты кадра**: область `{x, y, w, h}`, точка `{x, y}` (px ÷ 10,8 по x, ÷ 19,2 по y). `target` может быть именем из `stage.regions` или словом реплики (для устройств с target `none`).
- **Моменты** (`at`, `until`, параметры типа `at`, `hold`, `reveal`, `pan.at`, `markers[].at`): слово реплики (`six`, `six#2`, `gone.end`, `six+0.3`), `start`, `speech` (начало речи), `end` (конец речи) или секунды внутри клипа бита. Варпа нет: всё стоит на реальных временах слов текущего голоса.
- **Z-порядок фиксирован:** stage (1) → focus (2) → data (3) → annotate (4) → text (5); субтитры, виньетка, текстуры и переходы движка — как у сцен.
- **Безопасная зона:** смысловые устройства (data, annotate, text) — не ниже y 1420 px (74 %); текст не заходит за x 960 при y 1000–1700. Focus может закрывать весь кадр.
- **Сборка:** движок пишет бит как подкомпозицию `compositions/frames/<id>.html` (`engine/src/stage.ts`): статичная разметка stage (клипы видео, стоп-кадры, пути карты) + `HygenStage.mount(tl, CFG)` + `HygenDevices.mount(tl, CFG)` на одном paused-таймлайне; runtime — `assets/hygen/devices.js` (`engine/devices/runtime.js`, `engine/stage/runtime.js`, все `device.js`).

### Stage

**media** — картинка или видео от папки ролика (рядом `<файл>.license.json`):

| Поле | Что |
|---|---|
| `src` | jpg, png, webp или webm, mp4, mov, ogv |
| `in`, `out` | секунды исходника (видео) → `data-media-start` клипов |
| `rate` | постоянная скорость 0,1–5 → `data-playback-rate` |
| `hold` | `[{at, dur | until}]` — стоп-кадр: точный кадр ffmpeg как `<img>`-клип между двумя видеоклипами; источник продолжается с того же кадра. На картинке — вспышка и обесцвечивание без смены кадра |
| `reverse` | видео задом наперёд (ffmpeg, кэш) |
| `crop` | область кадра в %, которая заполняет кадр (масштаб и сдвиг внутренней обёртки) |
| `pan` | `{to: {x, y, w, h}, at, dur}` — переезд crop к другой области |
| `fit` | `cover` (по умолчанию) или `contain` — полоса по ширине на размытом затемнённом фоне из того же кадра |
| `focus` | `[x, y]` доли — `object-position` |
| `zoom` | `[от, до]` 1–2 — медленный наезд за бит |
| `treatment` | `none`, `film-memory` (выцветание, тёплый сдвиг, виньетка, зерно + gate weave и дыхание экспозиции в рендере), `engraved` (гравюра: толщина штриха от светлоты, перекрёстная штриховка в тенях; тушь night, бумага text), `two-ink` (две краски hero и heroDeep по бумаге, растры 15°/75°). `duotone` (две краски look: тени — night, света — приглушённый text с hero не ярче 72 %, чтобы белая бумага не выпадала из тёмного look; яркие насыщенные точки — огни, лампы — остаются пятнами цвета cold). CPU-версии рецептов media-use без WebGL: картинка — numpy, видео — тоновая карта ffmpeg без штриховки |

Видео и картинки обрабатываются один раз при сборке (`engine/py/media_stage.py`, кэш `videos/<id>/.cache/stage` по хэшу файла и параметров): обрезка `in`–`out`, reverse, treatment, H.264 без звука, fps ролика. Звук из видео не берётся. Не больше 2 видео одновременно (`split` из двух видео — уже 2; `focus.spotlight` в режиме blur на видео добавляет копию).

**split** — `a` и `b` (поля media), шторка `b` поверх `a` в момент `at` за `dur` с (по умолчанию 1,1), `direction` left | right | up | down, разделитель едет по краю, `labels: ["BEFORE", "AFTER"]` вверху.

**map** — `map`: силуэт `engine/assets/maps/<имя>.svg` (раздел «Силуэты карт»); `reveal` — момент, когда карта проявляется (до него — пустой мир); `draw: true` — береговая линия прорисовывается; `markers: [{x, y, label, at}]` — точка с пульсом и подписью; `route: {points: [{x, y}, …], at, dur, traveler}` — сглаженный маршрут рисуется, бегунок идёт по `offset-path`.

**color** — пустой мир под текст: `color` — токен палитры (`night` по умолчанию), `glow` — мягкое пятно цвета героя.

### Устройства

`engine/devices/<type>/device.json` + `device.js` (`HygenDevices.define(type, mount)`). `device.json`: `use`, `origin` (own или registry), `layer`, `target` (box | point | none через `|`), `explains` (обязателен ли), `figures` (параметры, которые выводят цифры → нужен `source`), `params` (типы сцен + `numbers` — массив чисел, `at` — момент), `events` (`{label, offset}`; offset — секунды после `at` или имя параметра; события попадают в автопроверку `frozen`, потом — в звук), `demo`.

| type | слой | что | origin |
|---|---|---|---|
| `focus.spotlight` | focus | снаружи окна circle / rect / path — dim или blur ≤ 24 px (blur — копия stage в окне) | своё |
| `annotate.arrow` | annotate | рисованная стрелка к точке, подпись у хвоста | hw-arrow |
| `annotate.circle` | annotate | рисованный овал вокруг области; `grow` — круг вырастает до радиуса | hw-callout-circle |
| `annotate.box` | annotate | рисованная рамка, `cells` ячеек, заливка `fill` ячеек с `fillAt` (слово) от `fillFrom` | hw-box-label |
| `annotate.label` | annotate | маркер + коннектор + подпись и `sub` | vox-annotate |
| `annotate.measure` | annotate | размерная линия с засечками и подписью | своё |
| `data.count` | data | счёт from → to, форматы, `display` в конце («2/3»), подпись | count-up |
| `data.chart` | data | bars или line (в том числе осциллограмма), подсветка | chart-story |
| `text.title` | text | calm / typewriter / slam, kicker | titlecard-calm + своё |
| `text.quote` | text | цитата по словам, автор, год | своё |
| `edit.hold` | focus | стоп-кадр stage с `at` до `until`: сборка режет видео, модуль рисует уголки видоискателя | своё |
| `text.kinetic` | text | буквы как главный объект: 12 режимов (раздел «Текст на экране») | своё + texture-mask-text, kinetic-center-build, kinetic-type-swap |
| `text.caption` | — | субтитры ролика: 20 пресетов, не ставится в `devices` (раздел «Текст на экране») | своё + 17 caption-* |

Компоненты реестра вендорены (`engine/devices/vendor/`, версии и хэши — `engine/devices/VENDOR.md`) и портированы в `mount`: их boil и squash через `tl.eventCallback("onUpdate")` застывают при перемотке (TRAPS.md). Сети и WebGL в рендере нет. У каждого устройства `until` — момент ухода.

### Intents и JSON-рецепты

`engine/intents/<id>.json` — таблица: `stage.types` (какие stage подходят) и `stage.default`, `devices` по умолчанию, `dominant`, `camera`, `requires`, `rhythm`. Плейсхолдеры: `$target`, `$at`, `$at+0.4`, `$data.<ключ>`, `$data.<ключ>|значение` (по умолчанию); устройство с `"if": "$data.<ключ>"` выпадает, если ключа нет. Явные поля бита побеждают: `stage` того же типа сливается поверх default, `devices`, `dominant`, `camera` заменяют.

| intent | stage | устройства |
|---|---|---|
| `show-detail` | media | spotlight → label → (hold) |
| `identify` | media, split, map | spotlight + label |
| `locate` | map | circle с подписью |
| `show-route` | map | маршрут + бегунок, (label) |
| `compare` | split | count |
| `show-scale` | media | measure |
| `show-change` | split, media | шторка + (label) |
| `show-evidence` | media (film-memory) | spotlight + label с источником |
| `reveal` | media | камера reveal, (title) |
| `quiet-ending` | media, color | (count), статичная камера |

JSON-рецепты без HTML — `engine/scenes/recipes/<id>.json` того же вида, вызываются как `"scene": "<id>"` с `data`: `quote-card` (color + text.quote), `portrait` (media film-memory + annotate.label + camera approach), `question-card` (color + text.title typewriter).

Развёрнутые биты пишутся в `build/beats.expanded.json` с хэшем входа (биты video.json + таблицы). Сборка разворачивает дважды и сравнивает с прошлой сборкой при том же хэше; `verify` — проверка `expanded`.

### Арка

`video.json → "arc": {structure, hook, protagonist, ending, why}` — обязательна, если в ролике есть stage-биты. Значения — `engine/arcs/arc.json`: structure story | mystery | mechanism | comparison | list; hook — 9 стратегий faceless-explainer; protagonist place | person | object | number | sound; ending lesson | open-question | callback | what-remains | one-number-silence. Роли битов (`role`) — `engine/arcs/<structure>.json`; первый бит hook, последний ending.

`verify → uniqueness`: против двух последних других роликов (`videos/`, `videos/_proof/`, по времени сборки) кортеж арки и последовательность stage-типов (бит со сценой — `scene:<id>`) не совпадают — иначе ошибка; совпадение больше половины позиций — предупреждение. Проверка цвета и текстур D3.5 остаётся; ролик с `"retells": "<id>"` (пересказ в том же мире) от неё освобождён только в паре с этим id.

### Грамматика

`engine/src/grammar.ts` — в `build` до голоса (ошибки останавливают) и в `verify` (проверка `grammar`). Плотность бита = 1 + устройства (бит со сценой = 2).

- **Ошибки:** ровно один stage; ≤ 3 устройств; ≤ 1 `data.*`; `explains` у каждого `annotate.*`; `dominant` есть; ≤ 2 видео одновременно; арка есть и её значения и роли верны.
- **Предупреждения:** два подряд бита плотности ≥ 3; после плотного нет бита ≤ 1 в двух следующих; hero-эффект (пост ≥ 0,6 из chromatic, light-leak, flicker, blur-pull, или молния) чаще одного бита; один intent дважды подряд; текст на экране > 7 слов вне `text.quote`; камера у stage-бита без reason.

### Источники stage-бита

Устройство с цифрами в `figures` — `source` у устройства. Цифры реплики, которых нет среди цифр устройств с источником, — `sources.text` бита.

### Проверка без голоса

```bash
npm run scene -- --device annotate.arrow                         # demo устройства на нейтральном stage
npm run scene -- --device focus.spotlight --look abyss --beat '{"stage":{"type":"media","src":"videos/titanic-en/media/rms-titanic.jpg"}}'
npm run scene -- --stage media --src videos/_proof/titanic-v2/media/titanic-pathe-1912-belfast.webm --dur 6 \
  --text "The ship left the dock and then it was gone" --beat '{"stage":{"rate":0.8,"fit":"contain"},"devices":[{"type":"edit.hold","at":"gone"}],"dominant":0}'
npm run scene -- quote-card                                       # JSON-рецепт с demo-данными
```

Слова `--text` раскладываются равномерно по клипу (`--dur`, по умолчанию 5 с), поэтому `at`-слова работают как в ролике. Лист — `.preview/<device-…|stage-…|recipe-…>/sheet.jpg`.

## Голос, звук, музыка и публикация (D5)

**Голос.** `video.json → "voice": {"provider": "kokoro" | "elevenlabs", "voiceId", "model"}`; старая форма `{"engine": "kokoro", "voice", "speed"}` работает. Выбор: `--voice` в CLI > `video.json` > `.env VOICE_PROVIDER` (`ELEVENLABS_LIVE=1` — elevenlabs) > kokoro. ElevenLabs — `eleven_multilingual_v2`, эндпоинт with-timestamps: тайминги слов из API, whisper не запускается; дубли — `.cache/voice/elevenlabs/<хэш provider, voiceId, model, text>`, расход — `usage.jsonl`. Ошибка API или нет ключа — предупреждение и Kokoro на весь ролик. Превью голосов — `npm run voices -- "<реплика>"` → `videos/_proof/voices/`.

**Звук по событиям.** События сцен (`scene.json → events`), устройств (`device.json → events`) и переходы получают звук автоматически: слово события → семейство по `style.json → sound.events` (draw → scribble, land → tap, count → ticks, focus → swell, freeze/hold → shutter, wipe/transition → whoosh, rise/fill → riser, collapse → impact); громкости и приглушение — там же; цвет свиста — `look.sound.whoosh`. Не ближе `gap` (0,2 с) друг к другу и 0,25 с к ручным `sound.hits`, не больше `perBeat` (4) на бит; тики длятся до `land` своего устройства. Синтез кодом — `engine/py/sound_design.py --events`. `sound.events: false` — только ручные удары (Помпеи).

**Музыка.** `style.json → music {tracks, volume, duck, fadeIn, fadeOut}`; `video.json → "music": false | {track, volume, duck, fadeIn, fadeOut, in, out}`. Подложка (`engine/py/music_bed.py`): трек к −24 LUFS, петли с кроссфейдом, под речью `duck` дБ, клип `music-bed` на шине music. Треки и лицензии — `engine/assets/music/MUSIC.md`.

**Публикация (D5).** `video.json → "publish": {titles[3], description, tags[10–15]}`. `build` после мастеринга пишет `videos/<id>/publish/`: `title.txt`, `description.md` (+ «Sources:» — все ссылки video.json, «Media:» — кредиты из license.json всех медиа, карт и музыки), `tags.txt`, `subtitles.srt` фразами по 3–5 слов, `thumbnail.jpg` — settle-кадр самого плотного бита. Без рендера — `npm run publish -- videos/<id>`. `verify → publish`: всё на месте, в описании все источники и кредиты.

## Текст на экране (D6)

### Общая текстовая схема

Любой текст на экране — `text.title`, `text.quote`, `annotate.label`, `text.caption`, `text.kinetic` — принимает одни поля (`engine/devices/text.schema.json`, рантайм `engine/devices/text.js` → `HygenText`). Устройство включает схему полем `"text": {"scale", "defaults"}` в device.json; его собственные enum-поля сохраняют старые значения.

| Поле | Значения |
|---|---|
| `type` | `none` (свой вход устройства), `pop`, `stagger`, `slide`, `typewriter`, `split-reveal`, `count-roll`, `glow-pulse`, `mask-wipe` |
| `font` | `display` (Cormorant Garamond) или `body` (Inter) |
| `size` | `s`, `m`, `l`, `xl` по шкале устройства, px: caption 48/64/84/112, title 48/72/120/180, quote 48/60/76/96, label 26/32/42/56, kinetic 120/170/240/320; старые `headline`, `title`, `label`, `large`, `medium` работают |
| `case` | `normal` или `upper` |
| `color` | `text`, `accent`, `secondary` (= `cold`, цвет второго тона look), токен палитры или `#RRGGBB` |
| `background` | `none` (мягкая тень), `pill`, `bar` (во всю строку), `blur` (≤ 24 px под текстом), `wash` (мягкое затемнение) — цветами look |
| `position` | `bottom`, `center`, `top`, `near-target` (рядом с целью другого устройства бита), `follow-camera` (едет с камерой бита) — когда у текста нет своей области |

Полосы позиций (px кадра): bottom 1180–1640 (текст прижат вниз, ширина 840), center 700–1220, top 170–640 (ширина 900), near-target — под целью (или над ней, если внизу тесно), ширина 700. Безопасная зона Shorts для текста: y ≥ 154 (верх 8 %), y ≤ 1670 (низ 13 %), справа при y 1000–1700 — до x 960. Текст устройства выше 154 px — ошибка сборки.

### Субтитры — устройство `text.caption`

Слой на весь ролик, в `devices` бита не ставится и в плотность грамматики не входит. Стиль бита: `look.captions` ← `video.json → captions` ← `caption` бита.

```json
"captions": { "preset": "pill-karaoke", "group": "phrase", "activeWord": "highlight-sweep", "size": "l" },
"beats": [ { "id": "07-air", "caption": { "preset": "neon-glow", "position": "near-target" }, … } ]
```

| Поле | Что |
|---|---|
| `preset` | поведение строки, 20 пресетов (`engine/devices/text.caption/presets`, семейства — `families.json`): **calm** — plain, karaoke, typewriter, weight-shift, blend-difference, editorial-emphasis; **explainer** — pill-karaoke, highlight, clip-wipe, gradient-fill, emoji-pop, texture; **energetic** — kinetic-slam, neon-glow, neon-accent, glitch-rgb, particle-burst, matrix-decode, parallax-layers, camera-follow. Свои — plain, karaoke, typewriter; остальные — порты caption-* реестра (`engine/devices/VENDOR.md`) |
| `group` | `word` — одно слово на экране (умолчание); `phrase` — до 4 слов до паузы или знака; `line` — до 7 слов / 34 символов |
| `activeWord` | как выделено звучащее слово: `color`, `scale`, `weight`, `highlight-sweep`, `underline`, `none` |
| общие поля | `type`, `font`, `size`, `case`, `color`, `background`, `position` |

Умолчание — `plain`, без фона, внизу, по слову, шрифт body: ни плашки, ни линии. Субтитры идут по словам голоса всегда, `sync` на них не действует.

**Контраст.** До рендера сборка пишет слой субтитров пустым, снимает 2 момента каждого бита без подложки и сравнивает цвет текста с яркостью под ним (`engine/py/caption_contrast.py`); ниже 4,5:1 бит получает `wash` (bottom, top, follow-camera) или `blur` (center, near-target) и предупреждение. Итог — `build/captions.plan.json`, проверка `verify → text`.

**Пресет** — `HygenCaptions.define(name, {family, origin, owns: {background, active, entrance}, mount(api, g)})`; `api` описан в шапке `engine/devices/text.caption/device.js` (`words`, `active`, `enter`, `drive`, `canvas`, `blend` — смешивание всего слоя на время группы). Превью: `npm run scene -- --device text.caption --preset <имя> [--look id] [--text "…"] [--beat '{"caption":{…},"stage":{…}}']` → `.preview/caption-<имя>/sheet.jpg`.

### `text.kinetic` — буквы как главный объект

Устройство-кадр слоя text. `mode`: `stack` (слово столбиком, одна строка залита), `extrude` (глубина из копий), `weight-morph` (вес и ширина вариативного Archivo), `outline` (контур, заливка по `fillAt`), `tilt` (блок в перспективе), `marquee` (ряды навстречу), `texture` (буквы прорезаны маской: concrete, rock, lava, wood, metal, snow), `scramble` (перебор символов), `slam` (слова падают с ударом), `center-build` (строка собирается и центрируется), `type-swap` (постоянная строка `text`, меняется слово из `words`), `behind-subject` (слово за человеком с фото stage). Параметры: `text`, `words`, `step`, `repeat`, `depth`, `angle`, `fillAt`, `texture` + общие поля.

- У бита с `text.kinetic` dominant — это устройство, соседей не больше одного (ошибка); в ролике не больше 2 таких битов, кроме look с `typography.kinetic: true` (предупреждение).
- `behind-subject`: stage `media` с картинкой без `crop`, `pan`, `zoom`; фигуру вырезает `hyperframes remove-background` (кэш `.cache/stage`) — модель находит людей (TRAPS.md).
- Превью: `npm run scene -- --device text.kinetic --beat '{"devices":[{"type":"text.kinetic","at":0.4,"params":{"mode":"marquee","text":"BLUE"},"sync":"music"}],"dominant":0}'`.

### `sync` — ритм устройств

У любого устройства и у бита: `"sync": "voice" | "music" | "both"`. `voice` — моменты по словам (умолчание); `music` — `at` встаёт на ближайший бит трека подложки, ритм внутри устройства (строки stack, ряды marquee, волна weight-morph, буквы scramble, слова slam и type-swap) шагает по битам; `both` — слово задаёт что, бит в пределах 100 мс — когда. Сетка — `engine/py/beats.py` один раз на трек (`.cache/beats/<sha>.json`), петли подложки учтены как в `music_bed.py`. В бите один ритм — иначе ошибка грамматики. Превью берёт сетку тестового трека `engine/assets/music/test-beat-100.wav` (100 BPM, CC0).

### Look: `captions` и `typography`

`"captions": {"family": "calm" | "explainer" | "energetic", "preset", "activeWord", …любое поле субтитров}` — умолчания субтитров мира (только семейство — первый пресет семейства); `"typography": {"kinetic": false}`. ember, abyss, storm — calm · plain · none. `bright-explainer` — светлый лист (`palette.colors`: night — бумага, text — тушь), explainer · pill-karaoke · highlight-sweep · phrase · l, `typography.kinetic: true`.

### Текстура `paper`

Мятая бумага поверх кадра: `crumple` 0–1 (складки), `tape` 0–4 (скотч по углам), `offset` 0–2 (дрожание печати 8 раз в секунду), `color`, `tapeColor`; слой fg, multiply. Для светлых миров: на тёмной земле multiply почти ничего не меняет.

### Проверки текста

- **Ошибки** (сборка, `verify → grammar`, `verify → text`): два ритма в бите; `text.kinetic` не dominant или больше одного соседа; текст устройства выше безопасной зоны; контраст под субтитрами ниже 4,5:1 без подложки.
- **Предупреждения:** пресет субтитров не из look больше чем в 2 битах; slam и particle-burst больше чем в одном бите (кроме look семейства energetic); `text.kinetic` больше чем в 2 битах (кроме `typography.kinetic`); near-target без устройства с целью; подложка, поставленная движком по контрасту.

### Вторая волна устройств и intents (D6)

| type | слой | что | origin |
|---|---|---|---|
| `data.timeline` | data | 3–7 дат на линии (`dates`, `labels`), бегущая метка доходит до каждой станции: при sync voice — шаг `step`, при sync music — биты; горизонтально в широкой области, вертикально в высокой | beat-timeline / pan-stations (идея) + своё |
| `data.dots` | data | `count` точек сеткой (1 точка = человек или `per`), на `markAt` `mark` из них загораются (`mode: color`) или гаснут (`fade`), первые, последние или вразброс по сиду | своё |
| `edit.pip` | data | вторая картинка в окне: `src` (с license.json), `corner` или target, `size`, `ratio`, `fit`, `frame` none/thin/rounded/polaroid, `enter` pop/slide/wipe, `label`; сборка ставит `<img>` статично — рендер его предзагружает | своё |

Intents: `show-process` (шаги процесса лентой: `data.steps`), `show-timeline` (даты: `data.dates` + `data.source`), `explain-cause` (spotlight на причину и стрелка к следствию: `target`, `data.effect`, `data.label`), `show-consequence` (точки-люди: `data.count`, `data.mark`, `data.source`, по умолчанию `fade`).

У `text.kinetic` параметр `wordsAt` — список слов реплики для слов `words` режимов slam, center-build, type-swap: слова встают на слова голоса. Тип параметра устройства `ats` — список моментов (слов или секунд после `at`).

### Отпечаток ролика (D6)

`verify → uniqueness` сравнивает с двумя последними роликами ещё и отпечаток: для каждого бита `<stage>+<доминирующее устройство>` (или `+stage`), бит со сценой — `scene:<id>`. Совпадение позиций больше 60 % — ошибка, 40–60 % — предупреждение.

### Бюджет ElevenLabs (D6)

`.env`: `ELEVENLABS_BUDGET_CHARS=3000`. Сборка считает символы, отправленные после последнего сброса (`.cache/voice/elevenlabs/usage.jsonl`, кэш не считается); реплика, которой не хватает бюджета, озвучивается Kokoro с предупреждением, API не вызывается. `npm run voice` — остаток, `npm run voice -- --reset-budget` — сброс; `doctor` показывает остаток. Запасной голос Kokoro — `voice.voice` в video.json (`{"provider": "elevenlabs", "voice": "bm_george"}`).
