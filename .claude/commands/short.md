---
description: ИИ-режиссёр Short v3 — тема → исследование с источниками → концепция (look) → арка → сценарий → «что видит зритель» на каждый бит → intent + target + данные → медиа с ролью → грамматика → сборка MP4
argument-hint: "<тема, например: Krakatoa 1883>"
---

# /short — режиссёр Short (v3: stage + devices + intent)

Тема: **$ARGUMENTS**

Ты режиссёр ролика для англоязычного faceless-канала. Работаешь внутри этой сессии Claude Code. Результат — `videos/<id>/video.json` и черновой MP4 из `npm run build`: у каждой цифры на экране — источник, у ролика — **свой мир** (look) и **свой скелет** (арка и последовательность stage). HTML не пишешь и не правишь. Вопросы пользователю не задаёшь.

Главное правило v3: **бит — это не сцена, а то, что зритель должен увидеть.** Сначала одно предложение «что видит зритель», потом intent, который это показывает. Сцены с HTML (`counter-title`, `map-marker`, `scale-gauge`, `year-odometer`, `picture-zoom`, `fraction-finale`, `pyroclastic-flow`) — рецепты на случай, когда нужен именно этот кадр.

Эталоны: `videos/_proof/titanic-v2/` и `videos/_proof/krakatoa-v2/` (video.json + research.md). Контракт — `engine/scenes/CONTRACT.md`, разделы «Бит v2», «Stage», «Устройства», «Intents», «Арка», «Грамматика».

## 0. Подготовка (3 мин)

1. Прочитай `engine/scenes/CONTRACT.md`: «Бит v2» и всё после него; «Look ролика» и «Текстуры».
2. Что есть в движке:
   ```bash
   ls engine/intents engine/scenes/recipes engine/devices engine/arcs engine/assets/maps
   for f in engine/intents/*.json; do python3 -c "import json; d=json.load(open('$f')); print(d['id'], '·', d['stage']['types'], '·', [x['type'] for x in d['devices']], '·', d['use'])"; done
   for f in engine/devices/*/device.json; do python3 -c "import json; d=json.load(open('$f')); print(d['type'], '·', d['target'], '·', list(d['params']))"; done
   cat engine/arcs/arc.json
   npm run scenes
   ```
3. Что уже занято другими роликами (новый должен отличаться миром и скелетом):
   ```bash
   for v in videos/*/video.json videos/_proof/*/video.json; do python3 -c "
   import json; s=json.load(open('$v')); a=s.get('arc') or {}
   print(s['id'], '·', s.get('look','ember'), '·', ' × '.join(a.get(k,'?') for k in ['structure','hook','protagonist','ending']), '·', ' → '.join(b.get('scene') or (b.get('stage') or {}).get('type') or b.get('intent','?') for b in s['beats']))"; done
   ```
4. id ролика: латиница, цифры, дефис, суффикс `-en`. Папка `videos/<id>/`.

## 1. Исследование с источниками (10 мин)

5–8 проверяемых цифр и 2–4 медиа-кандидата. Цифра — только вместе с дословной фразой.

```bash
UA="hygen-engine/0.1 (faceless channel draft tool)"
curl -s -A "$UA" "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=<Title>&format=json&redirects=1" \
  | python3 -c "import json,sys;print(list(json.load(sys.stdin)['query']['pages'].values())[0]['extract'])" > /tmp/<Title>.txt
grep -o -i "[^.]*<число или слово>[^.]*\." /tmp/<Title>.txt
```

Разброс в источниках — осторожная формулировка и одна цифра с цитатой. `videos/<id>/research.md` — таблица `| # | Факт (EN) | Цифра | Цитата | Ссылка |`.

## 2. Концепция мира (3 мин)

Раздел `## Concept` в research.md: настроение (2 фразы), ключевой цвет темы, look (id или объект с `extends`), текстуры, переходы. Правила look — как в CONTRACT.md «Look ролика»; акцент ≥ 30° от других роликов или другой набор текстур (кроме ролика, который ты явно пересказываешь: `"retells": "<id>"`).

## 3. Арка (3 мин) — до сценария

`video.json → "arc"`: `{structure, hook, protagonist, ending, why}` — значения из `engine/arcs/arc.json`, `why` — одна фраза обоснования.

- **structure** — story (завязка → поворот → пик → последствия), mystery (вопрос → улики → разгадка), mechanism (как работало шаг за шагом), comparison (две стороны и вывод), list (равноправные пункты). Роли битов — `engine/arcs/<structure>.json`; у каждого бита поле `role`, первый — `hook`, последний — `ending`.
- **hook** — одна из 9 стратегий (shocking-statistic, rhetorical-question, counterintuitive-claim, pain-validation, visceral-metaphor, concept-announcement, direct-address, imagine-scenario, stakes-consequence).
- **protagonist** — place, person, object, number, sound: вокруг кого или чего ролик.
- **ending** — lesson, open-question, callback, what-remains, one-number-silence.
- Кортеж арки не совпадает ни с одним из двух последних роликов (п. 0.3) — автопроверка `uniqueness` упадёт.

## 4. Сценарий (5 мин)

- 5–8 битов, 45–60 с, 110–150 слов (Kokoro ≈ 2,6 слова/с), 6–20 слов на бит.
- **Правило хука: цифра или ключевое слово — в первые 1,5 с реплики.** Не «In 1883, on a quiet island…», а «[4,800|Four thousand eight hundred] kilometers away…».
- Цифры — токеном `[display|spoken]`. Английский, коротко, сдержанно, без сенсаций.

## 5. Что видит зритель → intent (10 мин) — главный шаг

Для **каждого** бита сначала одна строка в research.md (раздел `## Beats`):

```markdown
- 02-hull (turn): Зритель видит корпус, разделённый на 16 отсеков, и как шесть из них заполняются водой. → show-detail на фото корабля: box ×16 с заливкой 6, count 0→6.
```

Потом бит в `video.json`. Сначала попробуй intent — он раскроется в stage + устройства:

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
- Камера движется только с причиной: `"camera": {"reason": "approach" | "reveal" | "follow" | "tension", "amplitude": 0.5}`.
- Проверка кадра без голоса: `npm run scene -- --stage media --src videos/<id>/media/<файл> --beat '{"stage":{…},"devices":[…]}' --text "<реплика>"` → `.preview/stage-media/sheet.jpg` (смотри глазами).

### Грамматика (ошибки ломают сборку)
- ровно один stage; ≤ 3 устройств; ≤ 1 `data.*`; `explains` у каждого `annotate.*`; `dominant` есть; ≤ 2 видео одновременно;
- ритм (предупреждения): не два бита плотности ≥ 3 подряд (плотность = 1 + устройства); после плотного — бит ≤ 1; hero-эффект не чаще раза за ролик; один intent не дважды подряд; текст на экране ≤ 7 слов (кроме `text.quote`); камера без reason стоит.
- безопасная зона: смысловые метки выше y 74 % (1420 px), текст не заходит за x 89 % при y 52–88 %.

## 6. Медиа с ролью (10 мин)

У каждого файла роль: **hero** (главная картинка мира), **evidence** (документ, хроника, фото события), **place** (где это). Запиши роль в research.md рядом с файлом.

- Только Wikimedia Commons (PD, CC BY, CC BY-SA), NASA, Pexels, Pixabay. Поиск в Commons, в том числе видео:
  ```bash
  curl -s -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=<запрос> filetype:video&srnamespace=6&format=json&srlimit=12"
  curl -s -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&titles=File:<Имя>&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1920&format=json"
  ```
- Прочитай описание файла: что на самом деле снято и когда. Подпись на экране не может утверждать больше описания (хроника «Титаника» снята в Белфасте 2 апреля, а не при отплытии 10-го).
- Рядом `<файл>.license.json`: `title, source, author, license, url, retrieved, notes`. Производная (обрезка, половина листа) — отдельный файл со своей записью и пометкой в `notes`.
- Видео: `in`/`out` — секунды исходника, `rate` 0.1–5, `hold` или устройство `edit.hold` — стоп-кадр на слове, `fit: contain` для 4:3 и 16:9, `treatment` film-memory | engraved | two-ink. Кадры исходника: `ffmpeg -i <видео> -t 150 -vf fps=1/5,scale=240:-2 /tmp/f%03d.jpg`.
- Карта: силуэт `engine/assets/maps/<имя>.svg` или трассировка `engine/py/trace_map.py` (см. CONTRACT.md «Силуэты карт»); координаты меток — px/10,8 и px/19,2 в проценты.

## 7. Источники

- Устройство, которое выводит цифры (`figures` в его device.json), — поле `source` у устройства.
- Цифры реплики, которых нет среди цифр устройств, — `sources.text` бита.
- Бит со сценой с HTML — как раньше: `sources.<param>`.

## 8. video.json и сборка

Образец — `videos/_proof/titanic-v2/video.json`: `id, title, format, fps 30, language, style, look, captions, voice, arc, beats, transitions [], sound` (гул: `peak` на кульминации, `cut` на старте финала; удары на стартах битов, один `heavy`).

```bash
npm run build -- videos/<id> --no-render   # схема, файлы, лицензии, грамматика, арка, голос и тайминги (кэш)
npm run build -- videos/<id>               # до MP4 и автопроверки
```

Упала сборка или автопроверка:

| Что | Что делать |
|---|---|
| `грамматика бита` | убери устройство, раздели бит на два, задай `dominant`, `explains` |
| `sources` | `source` у устройства или `sources.text` у бита |
| `uniqueness` | другая арка или другой порядок stage; другой акцент/текстуры (если ролик не пересказ) |
| `expanded` | резолвер недетерминирован — ошибка движка, в отчёт |
| `frozen` | событие устройства вне клипа: перепривяжи `at` к более раннему слову или увеличь `pad[1]` |
| `settled`, `size`, `loudness` | проблема движка — в отчёт |

Не больше 3 пересборок; правки — только `video.json`, `research.md`, `media/`.

## 9. Итог

По `videos/<id>/renders/<id>.contact.jpg`:
1. MP4, длительность, размер, автопроверка (grammar, uniqueness, expanded).
2. Арка одной строкой и последовательность stage.
3. Для каждого бита: «что видит зритель» → intent/устройства.
4. «Что видно» — одна фраза по контактному листу.
5. Таблица цифр → ссылки.
6. Что поправил после первой сборки и почему — это правки навыка или контракта.
