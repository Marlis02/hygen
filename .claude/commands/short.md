---
description: ИИ-режиссёр Short v3.5 (S3) — тема → исследование с источниками → концепция (look) → арка → сценарий → «что видит зритель» на каждый бит → intent + target + данные → текст на экране (субтитры, text.kinetic, sync) → медиа с ролью → грамматика → снимки → сборка MP4
argument-hint: "<тема, например: Krakatoa 1883> | <id проекта с brief.json>"
---

# /short — режиссёр Short (v3.5: stage + devices + intent + текст; своя папка, жанр, черновик на Kokoro)

Тема: **$ARGUMENTS**

Ты режиссёр ролика для англоязычного faceless-канала. Работаешь внутри этой сессии Claude Code. Результат — `projects/<id>/project.json` (+ `media.json` рядом) и MP4 из `npm run build`: у каждой цифры на экране — источник, у ролика — **свой мир** (look) и **свой скелет** (арка и последовательность stage). HTML не пишешь и не правишь.

**Твоя папка — одна.** Пишешь только в `projects/<id>/` своего ролика. Чужие проекты (`projects/*` кроме своего) не читаешь: что уже занято, показывает `library/index.json`. Библиотеку `library/`, `library/scenes/CONTRACT.md`, `CLAUDE.md`, `README.md` и остальные документы движка читаешь свободно.

**Вопросы.** В живом диалоге можно задать до трёх уточняющих вопросов — только там, где ответ меняет ролик (спорная трактовка темы, выбор между двумя сюжетами, обязательный кадр). Дальше работаешь до MP4 сам. В неинтерактивном запуске вопросов нет вообще.

Главное правило v3: **бит — это не сцена, а то, что зритель должен увидеть.** Сначала одно предложение «что видит зритель», потом intent, который это показывает. Сцены с HTML (`counter-title`, `map-marker`, `scale-gauge`, `year-odometer`, `picture-zoom`, `fraction-finale`, `pyroclastic-flow`) — рецепты на случай, когда нужен именно этот кадр.

Образцы битов и скелет `project.json` — в `library/scenes/CONTRACT.md`, раздел «Примеры битов». Там же «Бит v2», «Stage», «Устройства», «Intents», «Арка», «Грамматика».

## 0. Подготовка (3 мин)

0. **Бриф.** Если `$ARGUMENTS` — id, и есть `projects/<id>/brief.json` (его пишет панель `npm run studio`, «Новый ролик»), — бриф и есть задание: `topic` — тема, `genre` — жанр (`history` | `science` | `facts` | `entertainment` | `explainer`, задаёт правила исследования шага 1), `look` — мир (null — выбираешь сам), `seconds` — целевая длина, `wishes` — пожелания; необязательные `arc` (null — выбираешь сам), `avoid` (чего избегать) и `mustShow` (обязательный кадр: текст или ссылка на Commons — если файл уже лежит в `media/`, бери его). id ролика — `id` брифа, папка уже создана. Без брифа длина — `short.targetSeconds` из `hygen.config.json`, жанр — `history`.

   **Голос всегда Kokoro.** Поля голоса в брифе нет и в `project.json` его не пиши: черновик бесплатный. Финал на ElevenLabs — отдельная кнопка в панели, с бюджетом ролика и подтверждением; это не твоя работа.

1. Прочитай `library/scenes/CONTRACT.md`: «Бит v2» и всё после него; «Look ролика» и «Текстуры».
2. Что есть в движке (в неинтерактивном шелле Node стоит через nvm — сначала `. ~/.nvm/nvm.sh`):
   ```bash
   . ~/.nvm/nvm.sh
   ls library/intents library/scenes/recipes library/devices library/arcs library/assets/maps
   for f in library/intents/*.json; do python3 -c "import json; d=json.load(open('$f')); print(d['id'], '·', d['stage']['types'], '·', [x['type'] for x in d['devices']], '·', d['use'])"; done
   for f in library/devices/*/device.json; do python3 -c "import json; d=json.load(open('$f')); print(d['type'], '·', d['target'], '·', list(d['params']))"; done
   cat library/arcs/arc.json
   npm run scenes
   ```
3. Что уже занято другими роликами (новый должен отличаться миром и скелетом). Чужие проекты не открывай — отпечатки лежат в `library/index.json`:
   ```bash
   python3 -c "
   import json; d=json.load(open('library/index.json'))
   for k,v in d.items(): print(k, '·', v['look'], '·', v['arc'], '·', ' → '.join(v['stages']), '·', ', '.join(v['devices']), '·', v['at'])"
   ```
4. id ролика: латиница, цифры, дефис, суффикс `-en`. Папка `projects/<id>/` (с брифом — уже есть).

## 1. Исследование с источниками (10 мин)

5–8 проверяемых цифр и 2–4 медиа-кандидата (как искать медиа — шаг 6). Цифра — только вместе с дословной фразой.

### Правила по жанру (`genre` из брифа)

| Жанр | Где искать | Что обязательно |
|---|---|---|
| `history` история | Wikipedia (API ниже) | у цифры хука и у цифры финала — **вторая ссылка**, не Wikipedia |
| `science` наука | NASA, NOAA, сайты университетов, Britannica | 2–4 цифры **с единицами**; каждое упрощение помечено в research.md строкой «упрощение: …» |
| `facts` факты и списки | что угодно с лицензией на проверку | **источник у каждого пункта**; в ролике названы критерий отбора и год данных |
| `entertainment` развлекательное | как у фактов | гипотеза названа гипотезой и в реплике, и в research.md; цифры только реальные, с источником; look по умолчанию — энергичный |
| `explainer` объясняющее | техническая документация, спецификации, учебники | арка `mechanism`; шаги механизма по порядку |

Общее для всех жанров:

- **У меняющейся цифры — год.** «13,200 houses (1666)», «about 1.3 million today (2024)».
- **Своих выводов нет.** Единственное исключение — арифметика из двух цифр источника, показанная на экране (две цифры видны, третья — их разность или отношение).
- **Спорное** (число жертв, авторство, причина) — осторожная формулировка с одной цифрой и цитатой либо не берётся вовсе.
- **Медиа сначала со страницы Wikipedia** самой темы: файлы оттуда почти всегда на Commons и точно относятся к событию (шаг 6).

```bash
UA="hygen-engine/0.1 (faceless channel draft tool)"
curl -s -A "$UA" "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=<Title>&format=json&redirects=1" \
  | python3 -c "import json,sys;print(list(json.load(sys.stdin)['query']['pages'].values())[0]['extract'])" > /tmp/<Title>.txt
wc -w /tmp/<Title>.txt
grep -o -i -E "[^.]*\b([0-9][0-9,.]*|half|dozen|hundred|thousand|million|two|three|four|five|six|seven|eight|nine|ten)\b[^.]*\." /tmp/<Title>.txt
```

Цифры в статьях часто написаны словами («six», «within half an hour») — grep выше ловит и их. Статья длиннее 5 тыс. слов — читай разделы о самом событии и о последствиях, не целиком.

Разброс в источниках — осторожная формулировка и одна цифра с цитатой. `projects/<id>/research.md` — таблица `| # | Факт (EN) | Цифра | Цитата | Ссылка |`.

## 2. Концепция мира (3 мин)

Раздел `## Concept` в research.md: настроение (2 фразы), ключевой цвет темы, look (id или объект с `extends` и своим `id`), текстуры, переходы. Правила look — как в CONTRACT.md «Look ролика»; акцент ≥ 30° от других роликов или другой набор текстур (кроме ролика, который ты явно пересказываешь: `"retells": "<id>"`). Тема «огонь» не обязана быть `ember`: `great-fire-en` — свой look `ink-fire` (тушь и золото).

## 3. Арка (3 мин) — до сценария

`project.json → "arc"`: `{structure, hook, protagonist, ending, why}` — значения из `library/arcs/arc.json`, `why` — одна фраза обоснования.

- **structure** — story (завязка → поворот → пик → последствия), mystery (вопрос → улики → разгадка), mechanism (как работало шаг за шагом), comparison (две стороны и вывод), list (равноправные пункты). Роли битов — `library/arcs/<structure>.json`; у каждого бита поле `role`, первый — `hook`, последний — `ending`. Роли без `repeat` — не больше одного бита (у story ровно 6 ролей — не больше 6 битов).
- **hook** — одна из 9 стратегий (shocking-statistic, rhetorical-question, counterintuitive-claim, pain-validation, visceral-metaphor, concept-announcement, direct-address, imagine-scenario, stakes-consequence).
- **protagonist** — place, person, object, number, sound: вокруг кого или чего ролик.
- **ending** — lesson, open-question, callback, what-remains, one-number-silence.
- Кортеж арки не совпадает ни с одним из двух последних роликов (п. 0.3) — автопроверка `uniqueness` упадёт.

## 4. Сценарий (5 мин)

- 5–8 битов, 45–60 с, 110–150 слов, 6–20 слов на бит.
- **Длина — по финальному голосу.** Скорость речи — `voice.charsPerSecond` в `hygen.config.json` (Kokoro 14,4 символа/с, ElevenLabs 16,8). Черновик озвучивает Kokoro, финал на ElevenLabs короче в 0,855 раза — поэтому целься в `short.targetSeconds` (или `seconds` брифа) **по ElevenLabs**: символов во всех репликах ≈ (цель − сумма `pad`) × 16,8. Черновик на Kokoro выйдет примерно на 15–17 % длиннее цели (45 с финала ≈ 52 с черновика) — это нормально, реплики не режь.
- **Правило хука: цифра или ключевое слово — в первые 1,5 с, и в реплике, и на экране.** Не «In 1883, on a quiet island…», а «[4,800|Four thousand eight hundred] kilometers away…». Устройство хука ставь на первое слово (`"at": "<первое слово>"`): подпись садится примерно через секунду после `at`.
- Цифры — токеном `[display|spoken]`. Английский, коротко, сдержанно, без сенсаций. «St» Kokoro читает как «street» — пиши «Saint».

## 5. Что видит зритель → intent (10 мин) — главный шаг

Для **каждого** бита сначала одна строка в research.md (раздел `## Beats`):

```markdown
- 02-hull (turn): Зритель видит корпус, разделённый на 16 отсеков, и как шесть из них заполняются водой. → show-detail на фото корабля: box ×16 с заливкой 6, count 0→6.
```

Потом бит в `project.json`; ту же строку «что видит зритель» (без стрелки и intent) положи в поле бита `"sees"` — панель показывает её на карточке бита. Сначала попробуй intent — он раскроется в stage + устройства:

| Что зритель должен увидеть | intent | stage | устройства по умолчанию |
|---|---|---|---|
| деталь на фото или кадре видео | `show-detail` | media | spotlight, label, (hold) |
| что это: назвать предмет, место, человека | `identify` | media, split, map | spotlight + label |
| где это | `locate` | map | circle с подписью |
| путь: откуда куда | `show-route` | map | маршрут + бегунок, label |
| две вещи и одна цифра разницы | `compare` | split | count |
| насколько большое | `show-scale` | media | measure |
| было → стало | `show-change` | split (media) | шторка + label |
| документ или фото как доказательство | `show-evidence` | media + treatment | spotlight + label с источником |
| открыть мир от детали к целому | `reveal` | media | камера reveal, title |
| финал: одна картинка, одна цифра | `quiet-ending` | media, color | count или ничего |

Короткая форма бита с intent:

```json
{ "id": "03-boat", "role": "ending", "text": "…", "pad": [0.8, 2.0],
  "intent": "quiet-ending", "target": { "x": 50, "y": 21 }, "at": "seven",
  "data": { "src": "media/lifeboat.jpg", "value": 710, "size": "hero", "source": "https://…" },
  "stage": { "type": "media", "fit": "contain" }, "dominant": 0 }
```

- `target` — область `{x, y, w, h}` или точка `{x, y}` **в процентах кадра**, или имя из `stage.regions`. `at` — слово реплики (`six`, `six+0.2`, `gone.end`).
- `data` — ключи, которые ждёт intent (`requires` в его JSON). Явные `stage`, `devices`, `dominant`, `camera` бита побеждают intent.
- **Устройства явно** (`devices: [...]`) — только если intent не подходит. Каталог: `focus.spotlight`, `annotate.arrow|circle|box|label|measure`, `data.count|chart`, `text.title|quote`, `edit.hold` (параметры — `device.json`). Рецепты без HTML: `"scene": "quote-card" | "portrait" | "question-card"` с `data`.
- `dominant` — что главное в кадре: `"stage"` или индекс устройства. Обязателен.
- Камера движется только с причиной: `"camera": {"reason": "approach" | "reveal" | "follow" | "tension", "amplitude": 0.5}`. Intent приносит свою камеру (show-evidence — approach 0,4): на полосе `fit: contain` она обрезает края картинки — там ставь `amplitude` ≤ 0,15.
- Проверка кадра без голоса: `npm run scene -- --stage media --src projects/<id>/media/<файл> --beat '{"stage":{…},"devices":[…]}' --text "<реплика>"` → `.preview/stage-media/sheet.jpg` (смотри глазами).

### Координаты: картинка → кадр
Кадр 1080×1920. Точка картинки `(u, v)` — доли ширины и высоты (сетка 10 % поверх картинки: PIL, 10 строк):
- `fit: contain` (полоса по ширине): высота полосы `Hb = 1080 · h / w` px, верх `top = (1920 − Hb) / 2`; `x% = 100·u`, `y% = (top + v·Hb) / 19,2`.
- `fit: cover`, картинка шире 9:16: видимая доля ширины `Wv = (1080 / 1920) · h / w`, левый край `left = (1 − Wv) · focus[0]`; `x% = 100·(u − left) / Wv`, `y% = 100·v`.
- `fit: cover`, картинка уже 9:16: видимая доля высоты `Hv = (1920 / 1080) · w / h`, верх `top = (1 − Hv) · focus[1]`; `x% = 100·u`, `y% = 100·(v − top) / Hv`.
- Камера с amplitude увеличивает кадр до ~×1,1 — держи цели в 5 % от краёв.

### Правила кадра (D6)
- **До/после — один бит `compare` со `split`,** а не два бита с одной и той же картинкой: шторка показывает перемену в одном кадре (гравюры Холлара «до» и «после» — один split).
- **Обводка и spotlight — только на читаемом с телефона:** предмет, лицо, деталь, одна строка крупной надписи. Мелкий текст документа, подпись под гравюрой, цифры таблицы не обводятся — их показывает `text.quote` или `annotate.label` словами.
- **Одна картинка — один бит.** Повтор того же файла в соседнем бите — только через `edit.hold` (стоп-кадр того же видео) или `split`.

### Грамматика (ошибки ломают сборку)
- ровно один stage; ≤ 3 устройств; ≤ 1 `data.*`; `explains` у каждого `annotate.*`; `dominant` есть; ≤ 2 видео одновременно;
- ритм (предупреждения): не два бита плотности ≥ 3 подряд (плотность = 1 + устройства); после плотного — бит ≤ 1; hero-эффект не чаще раза за ролик; один intent не дважды подряд; текст на экране ≤ 7 слов (кроме `text.quote`); камера без reason стоит.
- безопасная зона: смысловые метки **строго** выше y 74 % (1420 px): у области `y + h ≤ 73,9`; текст не заходит за x 89 % при y 52–88 %.

## 5.5. Текст на экране (5 мин)

Контракт — `library/scenes/CONTRACT.md`, раздел «Текст на экране (D6)».

1. **Субтитры.** Умолчание берётся из look (`look.captions`: семейство, пресет, активное слово): документальные ember/abyss/storm — calm · plain, `bright-explainer` — explainer · pill-karaoke. Ролик может сменить стиль целиком (`"captions": {…}` в project.json), бит — точечно (`"caption": {…}`), но **не больше 2 битов с пресетом не из look**. Выбор:
   - calm (plain, karaoke, typewriter, weight-shift, blend-difference, editorial-emphasis) — документалка, тишина, цитаты;
   - explainer (pill-karaoke, highlight, clip-wipe, gradient-fill, emoji-pop, texture) — объяснения, списки, факты;
   - energetic (kinetic-slam, neon-glow, neon-accent, glitch-rgb, particle-burst, matrix-decode, parallax-layers, camera-follow) — пик, удар, развлекательный ролик; slam и particle-burst — один бит на ролик.
   - `group`: word — короткие реплики и хук; phrase — объяснение; line — медленная документалка. `activeWord`: highlight-sweep и color — объяснение, none — тишина. `position: near-target` — подпись у предмета, если в бите есть устройство с целью. Фон не ставь: движок сам измерит контраст и подложит wash/blur.
2. **`text.kinetic`** — когда слово само и есть кадр: хук-вопрос (slam, scramble), термин (outline, texture, extrude), перечисление (center-build, marquee, stack), смена состояния (type-swap), «посмотрите вверх» над человеком на фото (behind-subject — нужен человек в кадре). В документальном look — не больше 2 битов, dominant — это устройство, соседей ≤ 1. В бите с цитатой документа лучше `text.quote`.
3. **`sync`.** По умолчанию всё идёт по словам (voice). `"sync": "music"` у бита — когда кадр держится на музыке без важного слова (перечисление, пауза, монтажная связка), `both` — когда слово важно, но хочется попасть в бит. В одном бите — один ритм.

## 6. Медиа с ролью (10 мин)

У каждого файла роль: **hero** (главная картинка мира), **evidence** (документ, хроника, фото события), **place** (где это). Роль — флаг `--role` у `--get` (попадает в media.json) и строка в research.md рядом с файлом.

- Только Wikimedia Commons (PD, CC0, CC BY, CC BY-SA) и Pexels (если в `.env` есть ключ `PEXELS_API_KEY`). **Медиа ищется командой, не руками:**
  ```bash
  npm run media -- "<запрос>" --n 6 --sheet .preview/<id>-media-1.jpg     # таблица: файл, автор, лицензия, размер, описание; лист миниатюр с номерами
  npm run media -- "<запрос>" --video --n 4                               # видео с длительностью
  npm run media -- --get "File:<Имя>" <id> --as <имя> --role hero          # projects/<id>/media/<имя>.<ext> + запись в projects/<id>/media.json
  npm run media -- --get "File:<Имя>.webm" <id> --as <имя> --role evidence --in 12 --out 19   # отрезок видео без звука
  ```
  Неподходящие лицензии команда отбрасывает сама. HTTP 429 (Commons ограничил частоту) — повтори `--get` через минуту или возьми миниатюру: `--width <ширина оригинала или 2400>`.
- Выбирай глазами: смотри лист миниатюр, потом сетка 10 % поверх выбранных (координаты — шаг 5). В research.md — раздел `## Media`: какие запросы, что выбрано и почему, роль каждого файла.
- Прочитай описание файла: что на самом деле снято и когда. Подпись на экране не может утверждать больше описания (хроника «Титаника» снята в Белфасте 2 апреля, а не при отплытии 10-го).
- `--get` сам пишет запись в `projects/<id>/media.json` (ключ — имя файла: `role, title, source, author, license, url, added, notes`). В `media/` — только файлы, никаких json. Производная (обрезка, половина листа) — отдельный файл со своей записью в media.json (скопируй запись оригинала, пометка в `notes`). Файл без полной записи сборка не пропустит.
- Предмет в полный рост (колонна, башня, корабль) с размерной линией не должен опускаться ниже 74 % кадра: выбери фото, где он в верхних 70 %, или сделай производную — предмет вверху холста 9:16 на размытой копии самого фото (`projects/great-fire-en/media/monument-fish-street-hill.jpg`).
- Два вида одного места (до/после) — одинаковое окно из обоих, выровненное по горизонту: шторка `split` покажет перемену, а не сдвиг.
- Видео: `in`/`out` — секунды исходника, `rate` 0.1–5, `hold` или устройство `edit.hold` — стоп-кадр на слове, `fit: contain` для 4:3 и 16:9, `treatment` film-memory | engraved | two-ink | duotone (цветное фото или белая карта в тёмном мире). Кадры исходника: `ffmpeg -i <видео> -t 150 -vf fps=1/5,scale=240:-2 /tmp/f%03d.jpg`. Хронику с водяным знаком (British Pathé и т. п.) не брать или кадрировать `crop` так, чтобы знак ушёл за кадр, — риск Content ID (DECISIONS).
- Карта: силуэт `library/assets/maps/<имя>.svg` или трассировка `engine/py/trace_map.py` (см. CONTRACT.md «Силуэты карт»); координаты меток — px/10,8 и px/19,2 в проценты.

## 7. Источники

- Устройство, которое выводит цифры (`figures` в его device.json), — поле `source` у устройства.
- Цифры реплики, которых нет среди цифр устройств, — `sources.text` бита.
- Бит со сценой с HTML — как раньше: `sources.<param>`.

## 8. project.json, снимки и сборка

Скелет и примеры битов — `library/scenes/CONTRACT.md`, раздел «Примеры битов»: `id, title, status: "draft-kokoro", concept (раздел Concept одним абзацем), format, fps 30, language, style, look, voice, arc, beats (с `sees`), transitions [], sound, music, publish`; `captions` — объект только если стиль субтитров всего ролика отличается от look, `caption` и `sync` — у бита (шаг 5.5).

- **Голос.** Всегда Kokoro, поля `voice` в `project.json` не пиши (`am_michael` по умолчанию; британская тема — `"voice": {"provider": "kokoro", "voiceId": "bm_george"}`). Финал на ElevenLabs делает человек кнопкой в панели: она считает символы, бюджет ролика и ожидаемую длительность, переозвучивает недостающие реплики и пересобирает ролик. Сколько символов стоил бы финал — видно в панели, тебе считать не нужно.
- **Звук.** Гул: `peak` на кульминации, `cut` на старте финала; ручные удары (`hits`) — только на главных стыках, один `heavy`. Штрихи пометок, тапы подписей, тики счётчиков, свист шторки, затвор стоп-кадра движок ставит сам по событиям устройств и сцен (`sound.events` по умолчанию включён). Музыка — трек стиля с приглушением под голос; треки — `library/music/` (`music.json`: bpm, mood, looks; в project.json только ссылка `"music": {"track": "<id>", "gain", "duck", "in", "out"}` или `false`), правила — `library/music/MUSIC.md`.
- **Публикация.** `"publish": {"titles": [3 варианта ≤ 100 символов, в каждом крючок — цифра или вопрос], "description": "2–3 строки по фактам ролика", "tags": [10–15]}`. Источники и кредиты медиа движок допишет в `renders/publish/description.md` сам (кредиты — из media.json и music.json), SRT фразами и обложку — тоже.

```bash
npm run build -- projects/<id> --no-render   # схема, файлы, лицензии, грамматика, арка, голос и тайминги (кэш) — ошибки схемы за секунды
# кадры всей сборки до рендера: settle каждого бита + 1,5 с хука
npx hyperframes snapshot projects/<id>/build --no-end -o .preview/<id>-snap --at "$(python3 -c "import json;v=json.load(open('projects/<id>/build/verify_plan.json'));print(','.join(['1.5']+[str(round(s['settle'],2)) for s in v['scenes']]))")"
# → .preview/<id>-snap/contact-sheet.jpg — смотри глазами: обрезанный текст, подписи ниже 74 %, нечитаемый контраст
npm run build -- projects/<id>               # до MP4 и автопроверки
```

`hyperframes check` в `--no-render` — не приговор, но `container_overflow` у подписи и контраст ниже 3:1 проверь на снимках.

Упала сборка или автопроверка:

| Что | Что делать |
|---|---|
| `грамматика бита` | убери устройство, раздели бит на два, задай `dominant`, `explains` |
| `… ниже безопасной зоны` | подними цель: `y + h ≤ 73,9` |
| `sources` | `source` у устройства или `sources.text` у бита |
| `uniqueness` | другая арка или другой порядок stage; другой акцент/текстуры (если ролик не пересказ). Что занято — `library/index.json` |
| `expanded` | резолвер недетерминирован — ошибка движка, в отчёт |
| `frozen`, событие после конца клипа | перепривяжи `at` к более раннему слову или увеличь `pad[1]` |
| `frozen`, событие внутри клипа | событие устройства не меняет кадр — ошибка движка, в отчёт |
| `settled`, `size`, `loudness` | проблема движка — в отчёт |

Не больше 3 пересборок с рендером (сборки `--no-render` и снимки не считаются); правки — только `project.json`, `media.json`, `research.md`, `media/`.

## 9. Итог

По `projects/<id>/renders/<id>.contact.jpg`:
1. MP4, длительность, размер, автопроверка (grammar, uniqueness, expanded, publish); голос и сколько символов ElevenLabs потрачено (строка «голос:» в конце сборки).
2. Арка одной строкой и последовательность stage.
3. Для каждого бита: «что видит зритель» → intent/устройства.
4. «Что видно» — одна фраза по контактному листу.
5. Таблица цифр → ссылки.
6. Что поправил после первой сборки и почему — это правки навыка или контракта.
