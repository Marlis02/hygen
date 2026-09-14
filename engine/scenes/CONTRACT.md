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
| `scale-gauge` | шкала высоты (up) или глубины (down), маркер и отсчёт едут со значением, дата, слово, слои сюжета | 79 AD, столб пепла 30 KM, PUMICE, крыши |
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

`engine/textures/<id>/texture.json` + `texture.html` — полнокадровый слой над сценой и под субтитрами со своим таймлайном. Библиотека: `grain` (всегда, сила — `look.grain`), `fire` (crater, horizon, glow), `embers`, `ash` (flakes, pumice), `rain`, `bubbles`, `smoke`, `fog`, `lightning`, `wind`, `snow`; параметры с дефолтами — в их `texture.json`.

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

`engine/transitions/<id>/`: `transition.json` (`id`, `name`, `use`, `duration`) и `transition.js` — модуль, который сборка дописывает к runtime: `window.HygenTransitions[id] = {host(fx, role, d, tr, api), overlay(api, d, tr), frame(api), always}` — `host` сдвигает, масштабирует и размывает уходящую (`from`) или входящую (`to`) сцену, `overlay` рисует над стыком (`api.ctx` — общий canvas переходов, `api.el`, `api.C.rgb`/`api.C.hex` — палитра look), `d` — секунды от стыка. Библиотека: `hard-cut`, `flash`, `ash-burst`, `whip`, `water-ripple`, `smoke-wipe`. Каждый стык получает переход по порядку: `video.json → transitions` (`{"from", "to", "type": ["flash", "ash-burst"], "duration"}`, только соседние биты) → `"transition"` бита (переход в этот бит) → `look.transitions.hit`, если на стык падает тяжёлый удар (`heavy`) → `look.transitions.default`. Разгон перехода до стыка — не дольше 0,08 с: settle-кадр уходящей сцены остаётся чистым.

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
