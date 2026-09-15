# hygen

Движок англоязычного faceless-канала. Из темы он делает готовый к выкладке Short 1080×1920: исследование с источниками → сценарий → голос → кадры с эффектами → субтитры, звук и музыка → MP4 с автопроверкой → папка `publish/` (названия, описание, теги, SRT, обложка). Long 16:9 — позже.

Режиссёр — навык Claude Code `/short`: он пишет `videos/<id>/video.json`. Движок (`engine/`) собирает из этого файла ролик одной командой. Рендер — [HyperFrames](https://github.com/heygen-com/hyperframes) 0.8.36 (HTML + GSAP → MP4).

| Документ | Что в нём |
|---|---|
| [CLAUDE.md](CLAUDE.md) | правила работы, структура, голос, звук, медиа, секреты |
| [ROADMAP.md](ROADMAP.md) | единственный план, прогресс и замеры (старые версии — `roadmap/history/`) |
| [TRAPS.md](TRAPS.md) | ловушки рендера: одна строка — одна проблема и обход |
| [DECISIONS.md](DECISIONS.md) | принятые решения и почему |
| [sessions/](sessions/) | отчёты сессий с кадрами и замерами |
| [engine/scenes/CONTRACT.md](engine/scenes/CONTRACT.md) | формат `video.json`: бит, stage, устройства, текст, голос, звук, publish |

Готовые ролики: `videos/pompeii-en` (эталон, Kokoro), `videos/halifax-en`, `videos/great-fire-en`, `videos/titanic-en`, `videos/krakatoa-en`. Proof-ролики возможностей — `videos/_proof/` (`typo` — все режимы текста, `media-ops` — операции с видео, `voices` — превью голосов).

## 1. Установка на новой машине

Порядок собран по опыту двух машин (ноутбук — D1, компьютер №2 на Ubuntu 24.04 — D3.5 и D7); с нуля одной командой не прогонялся — если что-то не встало, `npm run doctor` скажет, чего не хватает. Видеокарта рендеру не нужна. Около 30–45 минут, большую часть времени занимают скачивания.

```bash
# 1. Системное
sudo apt install -y git ffmpeg python3-pip cmake build-essential fonts-noto-color-emoji
# 2. Node ≥ 22.18 (TypeScript запускается без сборки) — через nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
. ~/.nvm/nvm.sh && nvm install 22
# 3. Репозиторий и зависимости (версии закреплены в package-lock.json)
git clone <repo> hygen && cd hygen
npm ci
# 4. Python-пакеты движка и голос Kokoro
python3 -m pip install --user numpy scipy soundfile pillow kokoro-onnx
# 5. Ключи
cp .env.example .env        # и заполнить, см. раздел 2
# 6. Проверка
npm run doctor
```

Что важно знать:

- **nvm и неинтерактивный шелл.** Если Node стоит через nvm, в скриптах и у агента `node` и `npm` не видны — перед командами `. ~/.nvm/nvm.sh`.
- **Модели скачиваются сами** при первой сборке в `~/.cache/hyperframes`: Kokoro (~330 МБ), whisper large-v3-turbo (~1,6 ГБ, whisper.cpp собирается из исходников — нужны `cmake` и компилятор), Chrome для рендера. `npm run doctor` показывает, чего не хватает; строки «скачается при первом …» — предупреждение, не ошибка.
- **Шрифты, GSAP и скрипты навыков лежат в проекте** (`engine/assets`, `engine/vendor`) — при рендере сеть не нужна.
- **Голос ElevenLabs едет с проектом:** дубли лежат в `videos/<id>/voice/` и в git, поэтому пересборка ролика на новой машине не тратит символов. Старый глобальный кэш `.cache/voice/elevenlabs` с другой машины переносится в проекты командой `npm run voice -- --migrate`.
- Первая сборка Помпей на чистой машине — около 6 минут, дальше из кэша — около 4.
- Финал одного ролика рендерится целиком на одной машине.
- Навыки HyperFrames для Claude Code — `.agents/skills/`, версии в `skills-lock.json`. Навык-режиссёр — `.claude/commands/short.md`.

## 2. Настройки: `.env`

`.env` не попадает в git; образец — `.env.example`.

| Переменная | Что |
|---|---|
| `VOICE_PROVIDER` | `kokoro` (бесплатный черновой голос) или `elevenlabs` (финал) — голос по умолчанию |
| `ELEVENLABS_API_KEY` | ключ ElevenLabs; без него сборка откатывается на Kokoro с предупреждением |
| `ELEVENLABS_VOICE_ID` | голос по умолчанию для всех роликов; выбрать на слух — `videos/_proof/voices/README.md` |
| `ELEVENLABS_BUDGET_CHARS` | потолок символов с последнего сброса; реплики сверх бюджета озвучиваются Kokoro без запроса к API |
| `PEXELS_API_KEY` | поиск фото и видео в Pexels (без ключа — только Wikimedia Commons) |

Выбор голоса: флаг `--voice` > `voice` в `video.json` > `VOICE_PROVIDER` > kokoro. Бюджет: `npm run voice` (потрачено и осталось), `npm run voice -- --reset-budget`.

## 3. Как сделать ролик

```bash
# 1. В Claude Code, в корне репозитория:
/short "Halifax Explosion 1917"
#    навык исследует тему (цитаты в research.md), выбирает мир (look) и арку, пишет сценарий,
#    для каждого бита — «что видит зритель» → stage + устройства, ищет медиа с лицензией,
#    проверяет грамматику и собирает videos/<id>/video.json
# 2. Сборка — голос, кадры, звук, рендер, мастеринг, publish/, автопроверка:
npm run build -- videos/halifax-en
#    черновик без трат символов:            --voice kokoro
#    остановиться перед рендером:           --no-render
# 3. Проверка готового MP4 (контактный лист и отчёт):
npm run verify -- videos/halifax-en
```

Что получится в папке ролика:

| Путь | Что | В git |
|---|---|---|
| `video.json` | ролик целиком: биты, текст, stage, устройства, look, голос, музыка, publish | да |
| `research.md` | источники и дословные цитаты к каждой цифре | да |
| `media/` | картинки и видео + `<файл>.license.json` на каждый | да |
| `voice/` | дубли ElevenLabs (`take.wav`, `alignment.json`, `meta.json`) и `usage.jsonl` | да |
| `renders/<id>.mp4` | итоговый ролик | нет |
| `renders/<id>.contact.jpg` | контактный лист кадров из MP4 — по нему принимаем | да |
| `renders/<id>.verify.json` | отчёт автопроверки | нет |
| `publish/` | `title.txt` (3 названия), `description.md` (с источниками и кредитами медиа), `tags.txt`, `subtitles.srt`, `thumbnail.jpg` | да |
| `build/`, `.cache/` | сборка HyperFrames и кэши | нет |

Автопроверка (`verify`) смотрит на сам MP4: формат и длительность, громкость (−14 LUFS, пик ≤ −1,5 dBTP), пустые и застывшие сцены, совпадение кадров со снимками, размер (≤ 25 МБ на 10 с), источники у каждой цифры, лицензии, грамматику битов, контраст субтитров, уникальность против других роликов, полноту `publish/`. Последнее слово — за кадрами контактного листа.

Правило движка: всё привязано к словам голоса, а не к секундам. Сменился голос — устройства, шторки и субтитры сдвинулись сами.

## 4. Как устроен бит

Ролик — 5–7 битов. Бит — одна реплика и один кадр:

```json
{
  "id": "06-gone",
  "text": "In four days, at least [13,200|thirteen thousand two hundred] houses were gone.",
  "stage": { "type": "split", "a": { "src": "media/before.jpg" }, "b": { "src": "media/after.jpg" }, "at": "gone" },
  "devices": [ { "type": "data.count", "at": "thirteen", "params": { "to": 13200, "label": "HOUSES DESTROYED" }, "source": "https://…" } ],
  "dominant": 0
}
```

- **stage** — база кадра, ровно одна: `media` (фото или видео: `in`/`out`, `rate`, `hold`, `crop`, `pan`, `zoom`, `treatment`), `split` (до/после шторкой), `map` (силуэт, маркеры, маршрут), `color`.
- **devices** — 0–3 устройства поверх: фокус, аннотации, данные, текст. Время — якорное слово реплики (`"at": "gone"`, `"how+0.4"`).
- **intent** — готовое намерение (`show-evidence`, `compare`, `locate`…), которое раскрывается в stage + устройства; явные поля бита сильнее.
- `[показ|произношение]` в тексте — как число выглядит в субтитрах и как его читает голос.

Полный формат — `engine/scenes/CONTRACT.md`. Превью без голоса и рендера ролика — за секунды:

```bash
npm run scenes                                                        # сцены-рецепты с параметрами
npm run scene -- counter-title --look abyss                           # сцена под look
npm run scene -- --device annotate.box                                # устройство на нейтральном stage
npm run scene -- --device text.caption --preset highlight --look bright-explainer
npm run scene -- --device text.kinetic --beat '{"devices":[{"type":"text.kinetic","at":0.4,"params":{"mode":"extrude","text":"WAVES"}}],"dominant":0}'
```

## 5. Как расширять библиотеку

### Ассет (картинка, видео)

Только источники с лицензией: Wikimedia Commons, Pexels (и NASA, Pixabay — вручную с записью лицензии).

```bash
npm run media -- "Halifax Explosion 1917" --n 6 --sheet .preview/halifax.jpg   # таблица + лист миниатюр с номерами
npm run media -- "ocean waves" --provider pexels --video                        # только Pexels, видео
npm run media -- --get "File:Halifax Explosion blast cloud.jpg" halifax-en --as blast-cloud
npm run media -- --get "pexels:photo:57884" _proof/media-ops --as harbour --width 2400
npm run media -- --get "File:<хроника>.webm" halifax-en --in 12 --out 19        # отрезок видео без звука
```

`--get` кладёт файл в `videos/<id>/media/` и рядом `<имя>.license.json` (источник, автор, лицензия, ссылка). Файл без записи о лицензии сборка не возьмёт. Хронику с водяным знаком (British Pathé) не брать или кадрировать — риск Content ID.

### Look — мир ролика

`engine/looks/<id>/look.json`: палитра (`accent`, `secondary`, `groundTint`, `textColor`, при светлом мире — `colors`), текстуры, камера, типографика, пост-эффекты, переходы, зерно, виньетка, звуковые подсказки, умолчания субтитров (`captions`) и `typography`. Образцы: `ember`, `abyss`, `storm`, `bright-explainer`. Ролик подключает look по имени (`"look": "storm"`) или своим объектом с `extends`. Неизвестное поле — ошибка сборки. Проверка: `npm run scene -- counter-title --look <id>`.

### Пресет субтитров

1. `engine/devices/text.caption/presets/<имя>.js` — `HygenCaptions.define("<имя>", { family, origin, owns: { background, active, entrance }, mount(api, g) { … } })`. Всё анимировать на `api.tl` (paused-таймлайн, без колбэков `onUpdate` и без `Math.random()` — TRAPS.md).
2. Имя — в семейство в `engine/devices/text.caption/families.json` (calm | explainer | energetic).
3. Превью: `npm run scene -- --device text.caption --preset <имя>`. Пресет, который сам красит буквы, объявляет `ink: "light"` — по нему меряется контраст.

### Режим кинетического текста

1. Ветка `mode === "<режим>"` в `engine/devices/text.kinetic/device.js`: элементы через `node(...)`, ширину строки — оценкой `fit()`/`measure()` (не замером canvas — TRAPS «Замер текста до загрузки шрифта»), время — `at`, `wordsAt` или `beats`.
2. Значение в `params.mode.values` и описание в `engine/devices/text.kinetic/device.json`.
3. Превью через `npm run scene -- --device text.kinetic --beat '…'`, затем бит в `videos/_proof/typo`.

### Устройство

1. Папка `engine/devices/<группа>.<имя>/`: `device.json` (слой `focus | data | annotate | text`, `target`, параметры с типами и умолчаниями, события для звука и проверки) и `device.js` — `HygenDevices.define("<тип>", function (api, dev) { … })`.
2. Компонент из реестра HyperFrames не вставляется как есть: `npx hyperframes add <компонент>` → копия в `engine/devices/vendor/` с хэшем и версией в `VENDOR.md`, порт на токены look и один таймлайн.
3. Грамматика бита (≤ 3 устройств, ≤ 1 `data.*`, `explains` у аннотаций) проверяется в `build` и `verify`.
4. Превью: `npm run scene -- --device <тип>`.

Другие точки расширения: intents — `engine/intents/*.json`, JSON-рецепты — `engine/scenes/recipes/`, арки — `engine/arcs/`, текстуры — `engine/textures/`, переходы — `engine/transitions/`, музыка — `engine/assets/music/` (+ `MUSIC.md` с лицензией).

## 6. Справка по командам

| Команда | Что |
|---|---|
| `npm run doctor` | окружение: версии, ffmpeg, Python, ключи, бюджет, кэш голоса, модели, место |
| `npm run build -- videos/<id>` | весь конвейер до MP4 и `publish/` (`--voice`, `--no-render`, `--quality draft\|standard\|high`, `--no-check`, `--no-snapshots`) |
| `npm run verify -- videos/<id>` | автопроверка готового MP4 |
| `npm run publish -- videos/<id>` | пересобрать `publish/` без рендера |
| `npm run media -- "<запрос>"` | поиск и скачивание медиа с лицензией |
| `npm run voice [-- --reset-budget \| --migrate]` | бюджет ElevenLabs; перенос старого кэша дублей в проекты |
| `npm run voices -- "<реплика>"` | одна реплика четырьмя голосами ElevenLabs → `videos/_proof/voices/` |
| `npm run scene`, `npm run scenes` | превью сцены, устройства, пресета |
| `npm run typecheck` | проверка типов TypeScript |
| `python3 engine/py/compare_frames.py <эталон>.contact.jpg <новый>.contact.jpg` | регрессия по контактным листам: плитка за плиткой |

`build` идёт по шагам: голос (ElevenLabs с таймингами слов из API или Kokoro + whisper) → звук по таймингам → кадры под голос → звуки событий устройств и переходов → музыка с приглушением под голос → субтитры с замером контраста → `hyperframes lint` и `check` → рендер → мастеринг до −14 LUFS → `publish/` → автопроверка.

## 7. Машины

| Машина | Железо | Особенности | Скорость |
|---|---|---|---|
| Ноутбук (D1–D5) | Ryzen 5 5600H, RTX 3050, 16 ГБ | модели и whisper.cpp поставлены в D1 (≈ 45 мин) | рендер Помпей 89 с |
| Компьютер №2 (с D3.5) | i5-10400 (12 потоков), GTX 1650, 31 ГБ, Ubuntu 24.04 | Node через nvm; `.env` и кэш голоса перенесены в D7 | Помпеи 56 с: сборка 4 мин 8 с, рендер 97 с (4 потока) |
