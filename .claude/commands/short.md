---
description: ИИ-режиссёр Short — тема → исследование с источниками → сценарий → визуальная концепция (look, картинки, текстуры, motion) → раскадровка по контракту → video.json → сборка MP4
argument-hint: "<тема, например: Krakatoa 1883>"
---

# /short — режиссёр Short

Тема: **$ARGUMENTS**

Ты режиссёр ролика для англоязычного faceless-канала. Работаешь внутри этой сессии Claude Code (не через API). Результат — `videos/<id>/video.json` и черновой MP4 из `npm run build`: у каждой цифры на экране — ссылка на источник, у ролика — **свой мир**: своя палитра, свои текстуры, своё движение и переходы, свои картинки. HTML сцен не трогаешь: всё выражается параметрами сцен и слоями движка в `video.json`. Вопросы пользователю не задаёшь.

Эталон готового результата — `videos/titanic-en/` (video.json, research.md). Контракт сцен и слоёв — `engine/scenes/CONTRACT.md`.

## 0. Подготовка (3 мин)

1. Прочитай `engine/scenes/CONTRACT.md` целиком: сцены, «Look ролика», «Текстуры», «Фон бита», «Motion», «Переходы».
2. `npm run scenes` — сцены, параметры, якоря (`*` — обязательный) и текстовые слоты для типографики.
3. Что уже есть в движке:
   ```bash
   for f in engine/looks/*/look.json; do python3 -c "import json,sys; l=json.load(open('$f')); print(l['id'], '·', l['palette']['accent'], '·', l['about']['topics'])"; done
   ls engine/textures engine/transitions
   cat engine/motion/camera.json engine/motion/type.json engine/motion/post.json
   ```
4. Какие looks и текстуры уже заняты другими роликами (новый ролик должен от них отличаться):
   ```bash
   for v in videos/*/video.json; do python3 -c "import json; s=json.load(open('$v')); print(s['id'], '·', s.get('look', 'ember'), '·', sorted({t['id'] for b in s['beats'] for t in b.get('textures', [])}))"; done
   ```
5. Для сцен, которые возьмёшь, прочитай их `engine/scenes/<id>/scene.json`: типы, `maxLength`, дефолты, `description` параметров и якорей, `text` (слоты).
6. id ролика: латиница, цифры, дефис, суффикс `-en` (`krakatoa-en`). Папка `videos/<id>/`. Если папка уже есть и в ней есть рендер — возьми другой id.

## 1. Исследование с источниками (10 мин)

Нужно 5–8 проверяемых цифр: длительность, расстояние, высота/глубина, год, прошедшие годы, число людей, доля.

- Источники: Wikipedia (en), сайты музеев, NASA, USGS, NOAA, энциклопедии. Не блоги и не агрегаторы.
- Текст статьи Wikipedia без браузера:
  ```bash
  UA="hygen-engine/0.1 (faceless channel draft tool)"
  curl -s -A "$UA" "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=<Title>&format=json&redirects=1" \
    | python3 -c "import json,sys;print(list(json.load(sys.stdin)['query']['pages'].values())[0]['extract'])" > /tmp/<Title>.txt
  grep -o -i "[^.]*<число или ключевое слово>[^.]*\." /tmp/<Title>.txt
  ```
- Цифра берётся только вместе с дословной фразой из источника. Разброс в источниках — бери осторожную формулировку («about», «up to», «fewer than») и нижнюю границу.
- Не бери цифры, которых нет в найденной фразе. Производные (1985 − 1912 = 73) можно, если оба числа из источника.

Запиши `videos/<id>/research.md`:

```markdown
# <Topic> — исследование
| # | Факт (EN, как на экране) | Цифра | Цитата из источника | Ссылка |
|---|---|---|---|---|
| 1 | Heard 4,800 km away | 4800 | "…" | https://… |
```

## 2. Сценарий (5 мин)

- 5–8 битов, всего 45–60 с. Голос Kokoro читает ≈ 2,6 слова в секунду: 110–150 слов на весь ролик, 6–20 слов на бит.
- Один бит = одна главная цифра или одна картинка. Первый бит — хук с самой сильной цифрой. Последний — итог или доля, после него тишина.
- В хуке цифра звучит в первой половине реплики: число должно загореться в первые 2 секунды, а не после вводной фразы.
- Английский, простые короткие фразы, без морали и вопросов к зрителю.
- Цифры в реплике — токеном `[display|spoken]`: `[4,800|four thousand eight hundred]`, `[1883|eighteen eighty-three]`. В `spoken` только слова.
- Тон сдержанный: без описаний тел и страданий, без сенсаций (`engine/styles/documentary-dark/frame.md`, Don't).

## 3. Визуальная концепция (5 мин) — до раскадровки

Концепция решает, **каким будет мир ролика**, раскадровка потом только расставляет сцены внутри него. Запиши её в `videos/<id>/research.md` разделом `## Concept` (по-русски, коротко):

```markdown
## Concept
- Настроение: <2 фразы — что зритель чувствует и какой свет в кадре>.
- Ключевой цвет темы: <чем пахнет тема: море — бирюза, пожар — оранжевый, газ/гроза — сернисто-жёлтый; почему>.
- Look: <id из engine/looks или новый объект; одна фраза — почему именно он; чем отличается от look других роликов>.
- Картинки: 1) <что, запрос в Commons> 2) … (2–3 штуки, у каждой будет license.json).
- Текстуры: весь ролик — <…>; по битам — <бит: текстура с параметрами>.
- Motion: камера <пресет, амплитуда, тряска>; типографика <number/title/label → пресеты>; пост-эффект <какой и зачем>.
- Переходы: по умолчанию <…>, на ударе <…>, особые стыки <…>.
```

Правила концепции:
1. **Look.** Сначала посмотри `about.topics` и `about.avoid` встроенных look (`ember` — огонь и пепел, `abyss` — вода и глубина, `storm` — гроза, дым, газ). Подходит — бери id. Не подходит или тема уже занята другим роликом — **создай новый look объектом** в `video.json`:
   ```json
   "look": {
     "extends": "storm",
     "id": "plague",
     "name": "Чума",
     "about": { "mood": "…", "topics": "…", "avoid": "…" },
     "palette": { "accent": "#C9B458", "secondary": "#8FA3B8", "groundTint": "#12100C", "temperature": "warm", "textColor": "#E8E4D8" },
     "textures": [ { "id": "fog", "density": 0.6, "height": 0.4 } ],
     "motion": { "camera": { "preset": "push-in", "amplitude": 0.5, "shake": 0 }, "type": { "number": "count-roll", "title": "mask-wipe", "label": "typewriter" }, "post": [ { "id": "flicker", "strength": 0.25 } ] },
     "transitions": { "default": "hard-cut", "hit": "smoke-wipe" }
   }
   ```
   Неизвестное поле look — ошибка сборки. Поля и значения — CONTRACT.md, «Look ролика».
2. **Ключевой цвет.** accent — цвет самой темы: море не оранжевое, огонь не синий. `groundTint` окрашивает ночь и пепел в тон мира (тёмно-синий у воды, серо-зелёный у грозы); `secondary` — второй цвет для бита с `tone: cold` (контраст финала, лёд, свет спасения).
3. **Уникальность.** Акцент отличается от акцента каждого ролика в `videos/` не меньше чем на 30° по кругу цветов **или** набор текстур другой. Автопроверка `uniqueness` падает, если нет.
4. **Картинки.** 2–3 ключевые картинки из Wikimedia Commons (public domain, CC BY, CC BY-SA), NASA, Pexels, Pixabay — см. «Картинка» ниже. Минимум одна идёт **фоном бита** (`background`), не только в `picture-zoom`.
5. **Текстуры** — от мира, а не от привычки: пепел и угольки только у огня и вулканов, пузыри и взвесь у воды, дождь, ветер и молния у бури, снег у холода, туман и дым — настроение. На весь ролик — 1–2, по битам — ещё 0–2. Молний — не больше одной на бит, удары — на слова реплики (`"strikes": ["blast"]`).
6. **Motion под настроение.** Тихо и глубоко — `push-in`/`tilt`, амплитуда 0,5–0,7, без тряски; тревога и удары — `handheld` и `shake`; перечисление мест — `pan`. Типографика: минимум два разных пресета на ролик (look даёт по виду текста, бит переопределяет). Пост-эффект — хотя бы один: `bloom` у света и воды, `flicker` у грозы и старой хроники, `chromatic` на ударах, `blur-pull` у глубины и воспоминания, `light-leak` у тёплой памяти, `vignette-pulse` на ударах.
7. **Переходы.** По умолчанию `hard-cut`; на тяжёлом ударе — переход мира (`flash`+`ash-burst` у огня, `water-ripple` у воды, `smoke-wipe` у дыма и войны, `whip` у смены места и времени). Особый переход — полем `transition` бита. Шейдерные переходы не использовать.

## 4. Раскадровка (10 мин)

### Выбор сцены на бит

| Что за цифра | Сцена | Ключевые параметры |
|---|---|---|
| сколько длилось, число-заголовок | `counter-title` | `value`, `format` (`int`, `thousands`, `clock` — минуты как H:MM), `unit`, `heat` |
| где это было, расстояние от места | `map-marker` | `map`, `marker`, `label`, `region`, `regionAt`, `route`/`routeTo`, `counterValue`/`counterLabel`, `items`, `peak` |
| высота или глубина, если есть подходящая сценография | `scale-gauge` | `direction` up/down, `value`, `unit`, `scenery` (`volcano` — извержение, `ocean` — глубина воды), `dateValue`, `word`. `scenery: none` даёт почти пустой кадр — тогда заполни его текстурами (дождь, ветер, туман) или фоном бита, либо бери `counter-title` |
| год и сколько лет прошло | `year-odometer` | `year`, `delta`/`deltaUnit`, `dust` (пепельная маска — только для раскопок), `section` (разрез — только если это слои), `voids` |
| одна настоящая картинка крупно | `picture-zoom` | `image`, `fit` (`band` для широких фото), `focus`, `particles`, `tint`, `title`, `credit`, `creditSub` |
| доля, итог | `fraction-finale` | `numerator`, `denominator` (однозначные), `label` |
| геройские (`hero: true` в `npm run scenes`) | только по своей теме | например `pyroclastic-flow` — только вулкан |

Правила:
- 5–8 битов, **сцены в любом порядке** — не повторяй порядок другого ролика (одинаковая последовательность сцен — предупреждение автопроверки). Карта не обязательна.
- Одна сцена может повториться, если во втором бите она в другом режиме (другие параметры, фон, текстуры, типографика); `picture-zoom` — не больше одного раза.
- Минимум один бит с медиафоном (`background`) и минимум два разных type-пресета на ролик.
- `tone`: без поля — accent look; `cold` — secondary look (контрастный бит). Один тон на ролик, если нет причины.
- `seed`: разный на каждый бит (1, 2, 3…), чтобы частицы не повторялись.
- Параметры — только из `scene.json`; всё, что не задано, берётся из дефолта **Помпей**. Поэтому выключай лишнее явно: `peak: false`, `items: []`, `dateValue: 0`, `word: ""`, `dust: false`, `section: false, voids: false`, `particles: "none"` (если частицы дают текстуры).
- Строки на экране — ЗАГЛАВНЫМИ, в пределах `maxLength`.
- Безопасная зона: точки (`marker`, `regionAt`, `routeTo`, `focus`) — y ≤ 1420; не ставь текст в x > 960 на высоте 1000–1700.

### Слои бита

```json
"background": { "image": "media/ship.jpg", "treatment": ["duotone", "ken-burns"], "focus": [0.6, 0.5], "opacity": 0.5 },
"textures": [ { "id": "rain", "density": 0.8, "angle": -20 }, { "id": "lightning", "strikes": ["blast"] } ],
"camera": { "preset": "handheld", "amplitude": 1.2, "shake": 1 },
"type": { "year": "typewriter", "delta": "count-roll" },
"post": [ { "id": "blur-pull", "strength": 0.8 } ],
"transition": "whip"
```

- Фон лучше всего под сценами с ночной землёй: `counter-title`, `fraction-finale`, `year-odometer` без пыли, `scale-gauge` без сценографии. Картинку сразу проверь: `npm run scene -- counter-title --look <look> --beat '{"background":{…}}'`.
- `type` — имена слотов из `npm run scenes` (или одна строка на все слоты).
- Превью сцены под look и слоями бита — `npm run scene -- <сцена> --look <id или '{json}'> --beat '{…}'`, лист `.preview/<сцена>/sheet.jpg` смотри глазами.

### Якоря

- Каждый якорь с `required` привязан к слову реплики. Остальные — к словам, на которые должно случиться событие (появление числа — на первом слове числа, единица — на слове единицы).
- Слово якоря — нормализованное произносимое слово из `spoken`: строчные, без пунктуации, дефис делит слово (`eighty-five` → `eighty`, `five`). Повтор — `word#2`, конец слова — `word.end`.
- Якоря должны идти в том же порядке, что и их опорные времена `at` в `scene.json`. Не привязывай якорь к самому первому слову, если его `at` совпадает с `ref.speechStart`.

### Карта

Силуэт берётся из `engine/assets/maps/<имя>.svg`. Если нужного нет, трассируй из Natural Earth (public domain):

```bash
curl -s -L -o /tmp/ne_50m_land.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
python3 engine/py/trace_map.py /tmp/ne_50m_land.geojson --lon <W> <E> --lat <S> <N> \
  --out engine/assets/maps/<имя>.svg --name "<Name>" --mark <lon> <lat>
```

- Коробка: (E − W) · cos(средней широты) / (N − S) ≈ 1,14 — иначе суша растянута. Место события — примерно x 400–700, y 450–800 (скрипт печатает px для `--mark`, это и есть `marker`).
- Рядом `engine/assets/maps/<имя>.license.json` по образцу `north-atlantic.license.json`.
- Суша должна попадать в кадр: проверь `npm run scene -- map-marker --params '{"map":"<имя>", …}'`.

### Картинка

Только Wikimedia Commons (public domain или CC BY/CC BY-SA), NASA, Pexels, Pixabay:

```bash
curl -s -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=<запрос>&srnamespace=6&format=json&srlimit=10"
curl -s -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&titles=File:<Имя>&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1920&format=json"
```

Бери `LicenseShortName` = Public domain / CC BY / CC BY-SA, скачивай `thumburl` в `videos/<id>/media/<имя>.jpg`, рядом `<имя>.license.json` (`title, source, author, license, url, retrieved, notes`). В `credit`/`creditSub` — автор и лицензия. Цифры в кредите (год) тоже требуют `sources.credit`. Видео для фона (webm/mp4) — так же, с `license.json`.

### Источники

- Параметр с `figure: true` → `sources.<param>`.
- Строковый или списочный параметр с цифрами → `sources.<param>`.
- Цифры реплики, которых нет среди значений цифр-параметров бита → `sources.text`.

### Звук

```json
"sound": {
  "drone": { "peak": "<кульминация>:<ключевое слово>+0.3", "cut": "<последний бит>:start", "volume": 0.42, "carve": 0.65 },
  "hits": [ { "at": "<бит>:start", "volume": 0.55, "carve": 0.75 }, { "at": "<кульминация>:start+0.3", "heavy": true, "volume": 0.62, "carve": 0.75 } ]
}
```

- Удар на старте каждого бита, кроме первого; `heavy` — один, на кульминации: на этот стык встанет переход look «на удар»; финалу — `volume 0.42` без `carve`.
- `ash` (шелест пепла) — только для вулканов и пожаров.
- У последнего бита `pad: [2.0, 1.6]` — тишина до и после итоговой цифры; у остальных `[0.2, 0.4]`–`[0.3, 0.8]`.

## 5. video.json

Пиши `videos/<id>/video.json` по образцу `videos/titanic-en/video.json`: `id, title, format "1080x1920", fps 30, language "en", style "documentary-dark", look, captions "word-by-word", voice { engine "kokoro", voice "am_michael", speed 1.0 }, beats, transitions [], sound`.

## 6. Сборка

```bash
npm run build -- videos/<id> --no-render   # быстро: параметры, якоря, слои, файлы, источники; голос и тайминги кэшируются
npm run build -- videos/<id>               # весь конвейер до MP4 и автопроверки
```

Если проверка до голоса падает — чинишь `video.json` и повторяешь. Предупреждения «клип вне диапазона сцены» — меняй `pad` или длину реплики. «якорь пропущен: не по порядку» — перепривяжи якорь.

Автопроверка (`videos/<id>/renders/<id>.verify.json`):

| Упало | Что делать |
|---|---|
| `sources` | добавить ссылку в `sources` бита |
| `uniqueness` | ролик похож на другой: сдвинь accent look на ≥ 30° от названного ролика или смени набор текстур |
| `frozen` — событие не изменило кадр | событие зависит от выключенного слоя или якорь слишком близко к концу клипа: включи слой, перепривяжи якорь к более раннему слову, увеличь `pad[1]` |
| `blank` | у сцены выключены все слои — верни хотя бы один |
| `settled` | кадр MP4 не совпал со снимком выше полосы субтитров — смотри контактный лист, запиши в отчёт (проблема сцены или движка, не ролика) |
| `size`, `loudness`, `format` | проблема движка — не чинить в video.json, записать в отчёт |

Не больше 3 пересборок. Правки — только в `video.json`, `research.md` и `media/`.

## 7. Итог

Посмотри `videos/<id>/renders/<id>.contact.jpg` и напиши в ответе:

1. Путь к MP4, длительность, размер, автопроверка (с `uniqueness`).
2. Концепция в одну строку: look, ключевой цвет, текстуры, камера, типографика, пост-эффект, переходы.
3. «Что видно» — одна фраза по кадрам контактного листа.
4. Таблица цифр: цифра на экране → ссылка.
5. Что пришлось поправить после первой сборки и почему (если было) — это правки навыка или контракта.
