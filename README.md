# hygen

Движок англоязычного faceless-канала. Из темы он делает готовый к выкладке Short 1080×1920: исследование с источниками → сценарий → голос → кадры с эффектами → субтитры, звук и музыка → MP4 с автопроверкой → папка `publish/` (названия, описание, теги, SRT, обложка). Long 16:9 — позже.

Режиссёр — навык Claude Code `/short`: он пишет `projects/<id>/project.json` и `media.json`. Движок (`engine/`) собирает из этого ролик одной командой. Панель `npm run studio` (http://localhost:5177) показывает проекты, ассеты, биты, библиотеку эффектов с превью, сборку, проверку и publish — без правки JSON руками. Рендер — [HyperFrames](https://github.com/heygen-com/hyperframes) 0.8.36 (HTML + GSAP → MP4).

| Документ | Что в нём |
|---|---|
| [CLAUDE.md](CLAUDE.md) | правила работы, структура, голос, звук, медиа, секреты |
| [ROADMAP.md](ROADMAP.md) | единственный план, прогресс и замеры (старые версии — `roadmap/history/`) |
| [TRAPS.md](TRAPS.md) | ловушки рендера: одна строка — одна проблема и обход |
| [DECISIONS.md](DECISIONS.md) | принятые решения и почему |
| [sessions/](sessions/) | отчёты сессий с кадрами и замерами |
| [library/scenes/CONTRACT.md](library/scenes/CONTRACT.md) | формат `project.json`: бит, stage, устройства, текст, голос, звук, publish; хранилище проектов |

Готовые ролики: `projects/pompeii-en` (Kokoro), `projects/halifax-en`, `projects/great-fire-en`, `projects/titanic-en`, `projects/krakatoa-en`, `projects/molasses-flood-en`; `projects/odyssey-en` — сценарий правлен после озвучки, 4 реплики ждут дублей ElevenLabs. Все они — в регрессии `npm run regress`. Proof-проекты (`"proof": true`): `typo` — все режимы текста, `media-ops` — операции с видео, `titanic-v2`, `krakatoa-v2`; превью голосов — `library/voices/`.

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
cp .env.example .env                              # ключи, см. раздел 2
cp hygen.config.example.json hygen.config.json    # голос, look, бюджет, битрейт
# 6. Проверка
npm run doctor
```

Что важно знать:

- **nvm и неинтерактивный шелл.** Если Node стоит через nvm, в скриптах и у агента `node` и `npm` не видны — перед командами `. ~/.nvm/nvm.sh`.
- **Модели скачиваются сами** при первой сборке в `~/.cache/hyperframes`: Kokoro (~330 МБ), whisper large-v3-turbo (~1,6 ГБ, whisper.cpp собирается из исходников — нужны `cmake` и компилятор), Chrome для рендера. `npm run doctor` показывает, чего не хватает; строки «скачается при первом …» — предупреждение, не ошибка.
- **Шрифты, GSAP и скрипты навыков лежат в проекте** (`library/assets`, `engine/vendor`) — при рендере сеть не нужна.
- **Голос ElevenLabs едет с проектом:** дубли лежат в `projects/<id>/voice/` и в git, поэтому пересборка ролика на новой машине не тратит символов. Старый глобальный кэш `.cache/voice/elevenlabs` с другой машины переносится в проекты командой `npm run voice -- --migrate`.
- Первая сборка Помпей на чистой машине — около 6 минут, дальше из кэша — около 4.
- Финал одного ролика рендерится целиком на одной машине.
- Навыки HyperFrames для Claude Code — `.agents/skills/`, версии в `skills-lock.json`. Навык-режиссёр — `.claude/commands/short.md`.

## 2. Настройки: `hygen.config.json` и `.env`

`hygen.config.json` (в git, образец `hygen.config.example.json`) — всё, кроме секретов: `voice` (provider, voiceId, model, kokoroVoice), `look`, `budgets.elevenlabsChars`, `bitrate` (crf, preset, maxrate, bufsize), `short` (целевая длина), `paths`, `studio.port`. Все команды и панель читают его; панель правит формой.

`.env` не попадает в git и хранит только ключи; образец — `.env.example`. Панель показывает ключи точками (есть / нет) и не редактирует.

| Переменная | Что |
|---|---|
| `ELEVENLABS_API_KEY` | ключ ElevenLabs; без него сборка откатывается на Kokoro с предупреждением |
| `PEXELS_API_KEY` | поиск фото и видео в Pexels (без ключа — только Wikimedia Commons) |

Выбор голоса: флаг `--voice` > `voice` в `project.json` > `hygen.config.json → voice.provider`. Голос по умолчанию — `voice.voiceId` (выбрать на слух — `library/voices/README.md`), бюджет — `budgets.elevenlabsChars`. Бюджет: `npm run voice` (потрачено и осталось), `npm run voice -- --reset-budget`.

## 3. Как сделать ролик

```bash
# 1. В Claude Code, в корне репозитория:
/short "Halifax Explosion 1917"
#    навык исследует тему (цитаты в research.md), выбирает мир (look) и арку, пишет сценарий,
#    для каждого бита — «что видит зритель» → stage + устройства, ищет медиа с лицензией,
#    проверяет грамматику и собирает projects/<id>/project.json + media.json
#    (или: панель → «Новый ролик» → бриф projects/<id>/brief.json → «Создать» запускает claude -p "/short <id>")
# 2. Сборка — голос, кадры, звук, рендер, мастеринг, publish/, автопроверка:
npm run build -- projects/halifax-en
#    черновик без трат символов:            --voice kokoro
#    остановиться перед рендером:           --no-render
# 3. Проверка готового MP4 (контактный лист и отчёт):
npm run verify -- projects/halifax-en
```

Что получится в папке ролика:

| Путь | Что | В git |
|---|---|---|
| `project.json` | ролик целиком: статус, концепция, биты (с «что видит зритель»), текст, stage, устройства, look, голос, музыка (ссылка на трек библиотеки), publish | да |
| `media.json` | все ассеты и лицензии одним файлом: ключ — имя файла, `role, title, source, author, license, url, added, notes, crop, trim` | да |
| `media/` | только файлы картинок и видео, без json | да |
| `research.md` | приложение: источники и дословные цитаты к каждой цифре | да |
| `brief.json` | бриф из панели для режиссёра (если ролик начат в панели) | да |
| `voice/` | дубли ElevenLabs (`take.wav`, `alignment.json`, `meta.json`) и `usage.jsonl` | да |
| `renders/<id>.mp4` | итоговый ролик | нет |
| `renders/<id>.contact.jpg` | контактный лист кадров из MP4 — по нему принимаем | да |
| `renders/<id>.verify.json` | отчёт автопроверки | нет |
| `renders/publish/` | `title.txt` (3 названия), `description.md` (с источниками и кредитами из media.json и music.json), `tags.txt`, `subtitles.srt`, `thumbnail.jpg` | да |
| `history/<дата>/` | снимок project.json и media.json перед пересборкой или откатом | да |
| `build/`, `.cache/` | сборка HyperFrames и кэши | нет |

Автопроверка (`verify`) смотрит на сам MP4: формат и длительность, громкость (−14 LUFS, пик ≤ −1,5 dBTP), пустые и застывшие сцены, совпадение кадров со снимками, размер (≤ 25 МБ на 10 с), источники у каждой цифры, лицензии (`media` — у каждого файла запись в media.json), грамматику битов, контраст субтитров, уникальность против других роликов, полноту `publish/`. Последнее слово — за кадрами контактного листа.

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

Полный формат — `library/scenes/CONTRACT.md`. Превью без голоса и рендера ролика — за секунды:

```bash
npm run scenes                                                        # сцены-рецепты с параметрами
npm run scene -- counter-title --look abyss                           # сцена под look
npm run scene -- --device annotate.box                                # устройство на нейтральном stage
npm run scene -- --device text.caption --preset highlight --look bright-explainer
npm run scene -- --device text.kinetic --beat '{"devices":[{"type":"text.kinetic","at":0.4,"params":{"mode":"extrude","text":"WAVES"}}],"dominant":0}'
```

## 5. Как расширять библиотеку

Всё, из чего собирается ролик, лежит в `library/` (looks, styles, textures, devices, captions, transitions, motion, scenes, arcs, intents, assets, music); `engine/` — только код. После любой правки библиотеки или движка — `npm run regress` (раздел 6).

### Ассет (картинка, видео)

Только источники с лицензией: Wikimedia Commons, Pexels (и NASA, Pixabay — вручную с записью лицензии).

```bash
npm run media -- "Halifax Explosion 1917" --n 6 --sheet .preview/halifax.jpg   # таблица + лист миниатюр с номерами
npm run media -- "ocean waves" --provider pexels --video                        # только Pexels, видео
npm run media -- --get "File:Halifax Explosion blast cloud.jpg" halifax-en --as blast-cloud --role hero
npm run media -- --get "pexels:photo:57884" media-ops --as harbour --width 2400
npm run media -- --get "File:<хроника>.webm" halifax-en --in 12 --out 19        # отрезок видео без звука
```

`--get` кладёт файл в `projects/<id>/media/` и запись в `projects/<id>/media.json` (источник, автор, лицензия, ссылка, роль). Файл без полной записи сборка не возьмёт. В панели: вкладка «Ассеты» — перетащить файл и заполнить форму лицензии или найти в Commons/Pexels и нажать «Добавить в проект». Хронику с водяным знаком (British Pathé) не брать или кадрировать — риск Content ID.

### Look — мир ролика

`library/looks/<id>/look.json`: палитра (`accent`, `secondary`, `groundTint`, `textColor`, при светлом мире — `colors`), текстуры, камера, типографика, пост-эффекты, переходы, зерно, виньетка, звуковые подсказки, умолчания субтитров (`captions`) и `typography`. Образцы: `ember`, `abyss`, `storm`, `bright-explainer`. Ролик подключает look по имени (`"look": "storm"`) или своим объектом с `extends`. Неизвестное поле — ошибка сборки. `sampleLine` — реплика превью в панели и `npm run library:previews`: число с единицей («18 hours», «2:40 hours», «4,800 km») считает counter-title с текстурами мира, любая другая строка («Why is the sky blue?») печатается на карточке вопроса. Проверка: `npm run scene -- counter-title --look <id>`.

### Пресет субтитров

1. `library/captions/presets/<имя>.js` — `HygenCaptions.define("<имя>", { family, origin, owns: { background, active, entrance }, mount(api, g) { … } })`. Всё анимировать на `api.tl` (paused-таймлайн, без колбэков `onUpdate` и без `Math.random()` — TRAPS.md).
2. Имя — в семейство в `library/captions/families.json` (calm | explainer | energetic).
3. Превью: `npm run scene -- --device text.caption --preset <имя>`. Пресет, который сам красит буквы, объявляет `ink: "light"` — по нему меряется контраст.

### Режим кинетического текста

1. Ветка `mode === "<режим>"` в `library/devices/text.kinetic/device.js`: элементы через `node(...)`, ширину строки — оценкой `fit()`/`measure()` (не замером canvas — TRAPS «Замер текста до загрузки шрифта»), время — `at`, `wordsAt` или `beats`.
2. Значение в `params.mode.values` и описание в `library/devices/text.kinetic/device.json`.
3. Превью через `npm run scene -- --device text.kinetic --beat '…'`, затем бит в `projects/typo`.

### Устройство

1. Папка `library/devices/<группа>.<имя>/`: `device.json` (слой `focus | data | annotate | text`, `target`, параметры с типами и умолчаниями, события для звука и проверки) и `device.js` — `HygenDevices.define("<тип>", function (api, dev) { … })`.
2. Компонент из реестра HyperFrames не вставляется как есть: `npx hyperframes add <компонент>` → копия в `library/devices/vendor/` с хэшем и версией в `VENDOR.md`, порт на токены look и один таймлайн.
3. Грамматика бита (≤ 3 устройств, ≤ 1 `data.*`, `explains` у аннотаций) проверяется в `build` и `verify`.
4. Превью: `npm run scene -- --device <тип>`.

Другие точки расширения: intents — `library/intents/*.json`, JSON-рецепты — `library/scenes/recipes/`, арки — `library/arcs/`, текстуры — `library/textures/`, переходы — `library/transitions/`, музыка — `library/music/` (трек + запись в `music.json` с лицензией, bpm, mood, looks; сетка битов `beats/` считается сама; в панели — «Библиотека → Музыка → + Трек»).

## 6. Справка по командам

| Команда | Что |
|---|---|
| `npm run doctor` | окружение: версии, ffmpeg, Python, ключи, бюджет, кэш голоса, модели, место |
| `npm run build -- projects/<id>` (или id) | весь конвейер до MP4 и `publish/` (`--voice`, `--no-render`, `--quality draft\|standard\|high`, `--no-check`, `--no-snapshots`) |
| `npm run verify -- projects/<id>` | автопроверка готового MP4 |
| `npm run publish -- projects/<id>` | пересобрать `publish/` без рендера |
| `npm run media -- "<запрос>"` | поиск и скачивание медиа с лицензией (`--json` — результат одним JSON для панели, `--role` у `--get`) |
| `npm run voice [-- --reset-budget \| --migrate]` | бюджет ElevenLabs; перенос старого кэша дублей в проекты |
| `npm run voices -- "<реплика>"` | одна реплика четырьмя голосами ElevenLabs → `library/voices/` |
| `npm run scene`, `npm run scenes` | превью сцены, устройства, пресета |
| `npm run studio` | панель на http://localhost:5177 (только 127.0.0.1; `-- --no-open` — не открывать браузер) |
| `npm run library:previews` | 3-секундные превью всех элементов библиотеки → `library/previews/` (кэш по хэшу; `--only devices,kinetic`, `--force`, `--jobs 2`) |
| `npm run migrate` | перенос старого `videos/` в `projects/` (license.json → media.json, музыка → library/music, не секреты .env → hygen.config.json) |
| `npm run typecheck` | проверка типов TypeScript (движок; панель — `npx tsc -p studio/tsconfig.json`) |
| `npm run regress` | регрессия по всем роликам: пересборка каждого не-proof проекта со сборкой и сравнение листа MP4 со снимком `library/regress/<id>.jpg` (`-- --record` — записать снимки, `--only a,b`, `--jobs 2`, `--no-build` — сравнить готовые листы без пересборки); голос только из кэша — символы ElevenLabs не тратятся; около 20 минут на семь роликов |
| `python3 engine/py/compare_frames.py <снимок>.jpg <новый>.contact.jpg` | сравнение двух контактных листов плитка за плиткой (среднее ≤ 3, блок ≤ 40) — им пользуется `regress` |

Регрессия. Совпало — движок кадры не поменял. Расхождение: рядом с отчётом `.cache/regress/<id>.diff.jpg` (снимок над новым листом). Намеренное (правка look, бита, движка) — `npm run regress -- --record --only <id>` и запись в DECISIONS.md; случайное — строка в TRAPS.md и починка. Сборка регрессии перезаписывает `renders/` проекта тем же MP4.

`build` идёт по шагам: голос (ElevenLabs с таймингами слов из API или Kokoro + whisper) → звук по таймингам → кадры под голос → звуки событий устройств и переходов → музыка с приглушением под голос → субтитры с замером контраста → `hyperframes lint` и `check` → рендер → мастеринг до −14 LUFS → `publish/` → автопроверка.

## 7. Машины

| Машина | Железо | Особенности | Скорость |
|---|---|---|---|
| Ноутбук (D1–D5) | Ryzen 5 5600H, RTX 3050, 16 ГБ | модели и whisper.cpp поставлены в D1 (≈ 45 мин) | рендер Помпей 89 с |
| Компьютер №2 (с D3.5) | i5-10400 (12 потоков), GTX 1650, 31 ГБ, Ubuntu 24.04 | Node через nvm; `.env` и кэш голоса перенесены в D7 | Помпеи 56 с: сборка 4 мин 8 с, рендер 97 с (4 потока) |

## 8. Панель Studio

`npm run studio` → http://localhost:5177. Локальный Node-сервер (`studio/server.ts`, API — `studio/api.ts`) над движком, страница — TypeScript без сборки (`studio/web`, типы снимает сам сервер). Строки интерфейса — `studio/i18n/ru.json` и `studio/i18n/en.json`, язык выбирается в «Настройках» (только панель, на ролики не влияет). API отвечает только на `localhost`/`127.0.0.1` и принимает запросы на запись только со страницы панели (заголовок `X-Hygen`) — в панели живёт терминал. После изменения путей движка панель перезапускают. Панель пишет те же файлы, что CLI и режиссёр: `project.json`, `media.json`, `library/music/music.json`, `library/looks/<id>/look.json`, `hygen.config.json` — ручная правка JSON работает как раньше.

| Экран | Что |
|---|---|
| Проекты | карточки с обложкой, статусом (черновик / собран / проверен / выложен), длительностью, голосом, look; открыть, дублировать, история |
| Проект | плеер MP4 и контактный лист; «Собрать» и «Без рендера» с прогрессом по этапам (голос → тайминги → композиция → рендер → мастеринг → проверка) и логом |
| · Биты | карточка на бит: реплика, «что видит зритель», intent / сцена / stage, устройства, субтитры, look, sync, камера — формы из device.json, scene.json, schema.json; превью бита (MP4 540×960 без голоса), перерендер (полная пересборка: заменить сегмент MP4 движок не умеет), переозвучка с расходом символов до подтверждения |
| · Ассеты | media.json с превью; перетащить файл → форма лицензии (без неё файл красный, сборка не пропустит); поиск Commons и Pexels; обрезка видео ползунками — `trim` становится in/out бита, если у бита они не заданы |
| · Режиссёр | терминал панели и журнал режиссёра проекта: бриф, концепция и арка из research.md, запросы медиа и что выбрано (research.md → Media, лицензии media.json), intents по битам, грамматика, расход символов ElevenLabs и токенов Claude, отказы allowlist, `director.log` сворачиваемо; без журнала — «сделан вручную» |
| · Publish | названия, описание, теги с копированием; SRT и обложка; «отметить выложенным» |
| · Проверка | автопроверка человеческим языком: зелёный / жёлтый / красный и что делать; предупреждения грамматики с битом |
| · История | снимки project.json и media.json с откатом |
| Новый ролик | бриф → `projects/<id>/brief.json`; «Проверить claude -p»; «Создать» запускает `claude -p "/short <id>"` и показывает шаги, иначе даёт команду для Claude Code и ждёт project.json |
| Библиотека | текстуры, устройства с режимами, text.kinetic, субтитры, переходы, сцены, рецепты, музыка — превью, описание, параметры, фильтры, «применить к биту / проекту»; добавить трек с лицензией |
| Look | миры отдельным экраном: превью на своей реплике (`sampleLine`) и умолчания; новый look формой от встроенного |
| Режиссёр | вкладка «Режиссёр» последнего открытого проекта (или терминал со списком проектов) |
| Настройки | язык панели; hygen.config.json формой; ключи .env точками; расход ElevenLabs; doctor |

### Режиссёр из панели: `claude -p` с allowlist

«Создать» в «Новом ролике» и «Запустить /short» во вкладке «Режиссёр» запускают режиссёра так (`studio/director.ts`):

```bash
claude -p "/short <id>" --output-format stream-json --verbose \
  --permission-mode dontAsk --setting-sources project --strict-mcp-config \
  --allowedTools "Bash(npm run *)" "Read(./**)" Glob Grep "Write(./projects/<id>/**)" "Edit(./projects/<id>/**)" \
                 "WebFetch(domain:en.wikipedia.org)" TodoWrite
```

- разрешено: `npm run …`, чтение файлов репозитория, запись и правка только в `projects/<id>/`, Wikipedia для исследования, список задач;
- всё остальное (`ls`, `curl`, `python3`, запись в другие папки, чтение вне репозитория, MCP) — отказ без вопроса (`dontAsk`); `--setting-sources project` не подмешивает allow-правила пользователя;
- каждая строка прогона и каждый отказ пишутся в `projects/<id>/director.log` (JSON-строки stream-json и события `hygen` start / denied / end);
- claude запускается с подпиской: из окружения убраны `ANTHROPIC_API_KEY` и метки сессии Claude Code.

### Терминал режиссёра

Во вкладке «Режиссёр» — терминал (xterm.js + node-pty) в корне репозитория: «Открыть claude здесь» запускает интерактивный `claude` с подпиской, «/short для этого проекта» печатает команду без Enter. Это обычная сессия Claude Code рядом с плеером: панель следит за `project.json` и `media.json` проекта и перечитывает карточки битов, когда их меняет claude или редактор. Терминал один на панель: переживает переключение проектов и закрытие вкладки браузера, «Завершить» останавливает shell. При первом запуске claude в папке он спрашивает, доверять ли ей.
