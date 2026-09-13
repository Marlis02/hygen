---
description: ИИ-режиссёр Short — тема → исследование с источниками → сценарий → раскадровка по контракту сцен → video.json → сборка MP4
argument-hint: "<тема, например: Krakatoa 1883>"
---

# /short — режиссёр Short

Тема: **$ARGUMENTS**

Ты режиссёр ролика для англоязычного faceless-канала. Работаешь внутри этой сессии Claude Code (не через API). Результат — `videos/<id>/video.json` и черновой MP4 из `npm run build`, у каждой цифры на экране — ссылка на источник. HTML сцен не трогаешь: всё выражается параметрами из `scene.json`. Вопросы пользователю не задаёшь.

Эталон готового результата — `videos/titanic-en/` (video.json, research.md). Контракт сцен — `engine/scenes/CONTRACT.md`.

## 0. Подготовка (2 мин)

1. Прочитай `engine/scenes/CONTRACT.md` целиком и выполни `npm run scenes` — список сцен, их параметры и якоря (`*` — обязательный).
2. Для сцен, которые возьмёшь, прочитай их `engine/scenes/<id>/scene.json`: типы, `maxLength`, дефолты, `description` параметров и якорей.
3. id ролика: латиница, цифры, дефис, суффикс `-en` (`krakatoa-en`). Папка `videos/<id>/`. Если папка уже есть и в ней есть рендер — возьми другой id.

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

- 5–7 битов, всего 45–60 с. Голос Kokoro читает ≈ 2,6 слова в секунду: 110–150 слов на весь ролик, 6–20 слов на бит.
- Один бит = одна главная цифра = одна сцена. Первый бит — хук с самой сильной цифрой. Последний — итог или доля (часто `fraction-finale`), после него тишина.
- В хуке цифра звучит в первой половине реплики: число должно загореться в первые 2 секунды, а не после вводной фразы (Krakatoa: «…It was heard 4,800 km away» — до 4-й секунды на экране была только искра).
- Английский, простые короткие фразы, настоящее или прошедшее время, без морали и вопросов к зрителю.
- Цифры в реплике — токеном `[display|spoken]`: `[4,800|four thousand eight hundred]`, `[1883|eighteen eighty-three]`, `[30|thirty]`. В `spoken` только слова, как их надо произнести.
- Тон сдержанный: без описаний тел и страданий, без сенсаций (см. `engine/styles/documentary-dark/frame.md`, Don't).

## 3. Раскадровка (10 мин)

### Выбор сцены на бит

| Что за цифра | Сцена | Ключевые параметры |
|---|---|---|
| сколько длилось, число-заголовок | `counter-title` | `value`, `format` (`int`, `thousands`, `clock` — минуты как H:MM), `unit`, `heat` |
| где это было, расстояние от места | `map-marker` | `map`, `marker`, `label`, `region`, `regionAt`, `route`/`routeTo`, `counterValue`/`counterLabel`, `items`, `peak` |
| высота или глубина, если есть подходящая сценография | `scale-gauge` | `direction` up/down, `value`, `unit`, `scenery` (`volcano` — извержение, `ocean` — глубина воды), `dateValue`, `word`. `scenery: none` даёт почти пустой кадр (шкала в углу и слово) — для высоты без сценографии бери `counter-title` |
| год и сколько лет прошло | `year-odometer` | `year`, `delta`/`deltaUnit`, `dust`, `section` (разрез — только если это раскопки/слои), `voids` |
| одна настоящая картинка | `picture-zoom` | `image`, `fit` (`band` для широких фото), `focus`, `particles`, `tint`, `title`, `credit`, `creditSub` |
| доля, итог | `fraction-finale` | `numerator`, `denominator` (однозначные), `label` |
| геройские (`hero: true` в `npm run scenes`) | только по своей теме | например `pyroclastic-flow` — только вулкан |

Правила:
- Одна сцена может встречаться дважды, если параметры сильно разные; `picture-zoom` — не больше одного раза.
- `tone`: `cold` — вода, лёд, холод, ночь, космос; `accent` — огонь, взрыв, жар, кровь истории. Один тон на весь ролик, если нет причины.
- `seed`: разный на каждый бит (1, 2, 3…), чтобы частицы не повторялись.
- Параметры — только из `scene.json`; всё, что не задано, берётся из дефолта **Помпей**. Поэтому выключай лишнее явно: `peak: false`, `items: []`, `dateValue: 0`, `word: ""`, `section: false, voids: false`.
- Строки на экране — ЗАГЛАВНЫМИ, в пределах `maxLength`.
- Безопасная зона: точки (`marker`, `regionAt`, `routeTo`, `focus`) — y ≤ 1420; не ставь текст в x > 960 на высоте 1000–1700.

### Якоря

- Каждый якорь с `required` привязан к слову реплики. Остальные — к словам, на которые должно случиться событие (появление числа — на первом слове числа, единица — на слове единицы).
- Слово якоря — нормализованное произносимое слово из `spoken`: строчные, без пунктуации, дефис делит слово (`eighty-five` → `eighty`, `five`). Повтор — `word#2`, конец слова — `word.end`.
- Якоря должны идти в том же порядке, что и их опорные времена `at` в `scene.json`. Не привязывай якорь к самому первому слову, если его `at` совпадает с `ref.speechStart` — это и так начало речи.

### Карта

Силуэт берётся из `engine/assets/maps/<имя>.svg`. Если нужного нет, трассируй из Natural Earth (public domain):

```bash
curl -s -L -o /tmp/ne_50m_land.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
python3 engine/py/trace_map.py /tmp/ne_50m_land.geojson --lon <W> <E> --lat <S> <N> \
  --out engine/assets/maps/<имя>.svg --name "<Name>" --mark <lon> <lat>
```

- Коробка: (E − W) · cos(средней широты) / (N − S) ≈ 1,14 — иначе суша растянута. Место события — примерно x 400–700, y 450–800 (скрипт печатает px для `--mark`, это и есть `marker`).
- Рядом `engine/assets/maps/<имя>.license.json` по образцу `north-atlantic.license.json` (source, author, license, url, notes с коробкой).
- Суша должна попадать в кадр: проверь `npm run scene -- map-marker --params '{"map":"<имя>", …}'` и посмотри `.preview/map-marker/sheet.jpg`.

### Картинка

Только Wikimedia Commons (public domain или CC BY/CC BY-SA), NASA, Pexels, Pixabay:

```bash
curl -s -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=<запрос>&srnamespace=6&format=json&srlimit=10"
curl -s -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&titles=File:<Имя>&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1920&format=json"
```

Бери `LicenseShortName` = Public domain / CC BY / CC BY-SA, скачивай `thumburl` в `videos/<id>/media/<имя>.jpg`, рядом `<имя>.license.json` (`title, source, author, license, url, retrieved, notes`). В `credit`/`creditSub` — автор и лицензия. Цифры в кредите (год) тоже требуют `sources.credit` (ссылка на страницу файла).

### Источники

- Параметр с `figure: true` → `sources.<param>`.
- Строковый или списочный параметр с цифрами → `sources.<param>`.
- Цифры реплики, которых нет среди значений цифр-параметров бита → `sources.text`.

### Звук и переход

```json
"transitions": [{ "from": "<бит перед кульминацией>", "to": "<кульминация>", "type": "flash", "duration": 0.6 }],
"sound": {
  "drone": { "peak": "<кульминация>:<ключевое слово>+0.3", "cut": "<последний бит>:start", "volume": 0.42, "carve": 0.65 },
  "hits": [ { "at": "<бит>:start", "volume": 0.55, "carve": 0.75 }, { "at": "<кульминация>:start+0.3", "heavy": true, "volume": 0.62, "carve": 0.75 } ]
}
```

- Удар на старте каждого бита, кроме первого; `heavy` — один, на кульминации; финалу — `volume 0.42` без `carve`.
- `ash` (шелест пепла) — только для вулканов и пожаров.
- Не больше одного перехода; `shader` не использовать (рендер падает в один поток).
- У последнего бита `pad: [2.0, 1.6]` — тишина до и после итоговой цифры; у остальных `[0.2, 0.4]`–`[0.3, 0.8]`.

## 4. video.json

Пиши `videos/<id>/video.json` по образцу `videos/titanic-en/video.json`: `id, title, format "1080x1920", fps 30, language "en", style "documentary-dark", captions "word-by-word", voice { engine "kokoro", voice "am_michael", speed 1.0 }, beats, transitions, sound`.

## 5. Сборка

```bash
npm run build -- videos/<id> --no-render   # быстро: параметры, якоря, файлы, источники; голос и тайминги кэшируются
npm run build -- videos/<id>               # весь конвейер до MP4 и автопроверки
```

Если проверка до голоса падает — чинишь `video.json` и повторяешь. Предупреждения «клип вне диапазона сцены» — меняй `pad` или длину реплики. Предупреждение «якорь пропущен: не по порядку» — перепривяжи якорь.

Автопроверка (`videos/<id>/renders/<id>.verify.json`):

| Упало | Что делать |
|---|---|
| `sources` | добавить ссылку в `sources` бита |
| `frozen` — событие не изменило кадр | событие зависит от выключенного слоя или якорь слишком близко к концу клипа: включи слой, перепривяжи якорь к более раннему слову, увеличь `pad[1]` |
| `blank` | у сцены выключены все слои — верни хотя бы один |
| `settled` | кадр MP4 не совпал со снимком выше полосы субтитров — смотри контактный лист, запиши в отчёт (это проблема сцены или движка, не ролика) |
| `size`, `loudness`, `format` | проблема движка — не чинить в video.json, записать в отчёт |

Не больше 3 пересборок. Правки — только в `video.json` и `research.md`.

## 6. Итог

Посмотри `videos/<id>/renders/<id>.contact.jpg` и напиши в ответе:

1. Путь к MP4, длительность, размер, автопроверка.
2. «Что видно» — одна фраза по кадрам контактного листа.
3. Таблица цифр: цифра на экране → ссылка.
4. Что пришлось поправить после первой сборки и почему (если было) — это правки навыка или контракта.
