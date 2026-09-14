# hygen

Движок англоязычного faceless-канала: тема → сценарий → голос → сцены с эффектами → субтитры и звук → черновик → финал. Shorts 1080×1920, позже Long 1920×1080.

Правила работы и структура — в [CLAUDE.md](CLAUDE.md). План недели — в [ROADMAP.md](ROADMAP.md). Ловушки рендера — в [TRAPS.md](TRAPS.md), решения — в [DECISIONS.md](DECISIONS.md).

## Запуск

```bash
npm ci                                # зависимости, версии закреплены
npm run doctor                        # проверка окружения
npm run build -- videos/pompeii-en    # весь конвейер до MP4 с автопроверкой
npm run verify -- videos/pompeii-en   # автопроверка готового MP4 и контактный лист
npm run scenes                        # библиотека сцен: параметры и якоря
npm run scene -- counter-title        # превью одной сцены без голоса (.preview/<id>/sheet.jpg)
npm run scene -- counter-title --look abyss                          # сцена под look ролика
npm run scene -- map-marker --look storm --beat '{"type":{"count":"stagger"},"camera":"handheld","post":[{"id":"flicker"}]}'
npm run scene -- fraction-finale --textures '[{"id":"rain"}]'         # текстура поверх сцены
npm run scene -- --device annotate.box                               # бит v2: устройство на нейтральном stage
npm run scene -- --stage media --src videos/_proof/titanic-v2/media/titanic-pathe-1912-belfast.webm --text "It was gone" --beat '{"stage":{"fit":"contain"},"devices":[{"type":"edit.hold","at":"gone"}],"dominant":0}'
npm run scene -- quote-card                                          # JSON-рецепт без HTML
npm run build -- videos/_proof/titanic-v2                            # proof бита v2: stage + devices + intent
```

Сравнение и регрессия:

```bash
python3 engine/py/compare_frames.py <эталон>.contact.jpg <новый>.contact.jpg       # плитка за плиткой: среднее ≤ 3, блок ≤ 40
python3 engine/py/contact_montage.py videos/_compare/contact-3.jpg \
  videos/pompeii-en/renders/pompeii-en.contact.jpg:"pompeii-en · ember" …        # листы роликов один под другим
```

Новый ролик от темы: в Claude Code `/short "Krakatoa 1883"` — исследование с источниками, концепция мира (look), арка (structure × hook × protagonist × ending), сценарий, для каждого бита «что видит зритель» → intent + target + данные (stage + устройства), медиа с ролью, грамматика до сборки, `videos/<id>/video.json` и сборка (`.claude/commands/short.md`, v3). Бит v2 — `engine/scenes/CONTRACT.md`, «Бит v2».

`build` идёт по шагам: голос Kokoro → тайминги слов whisper → звук по таймингам → сцены, растянутые под голос → `index.html` с субтитрами и шинами → `hyperframes lint` и `check` → рендер → мастеринг до −14 LUFS → автопроверка MP4.

Полезные флаги: `--no-render` (остановиться перед рендером), `--quality draft|standard|high`, `--no-check`, `--no-snapshots`.

Результаты ролика лежат в `videos/<ролик>/renders/`: `<id>.mp4`, контактный лист `<id>.contact.jpg`, отчёт автопроверки `<id>.verify.json`, тайминги сборки `<id>.build.json`. Рендеры, кэши голоса и ASR в git не попадают.

## Что нужно на машине

Node ≥ 22.18, Python 3.10+ с `numpy scipy soundfile pillow`, ffmpeg с `ebur128`, Chrome. Локальные модели ставятся один раз:

```bash
python3 -m pip install --user kokoro-onnx      # голос Kokoro
```

Модели Kokoro (~330 МБ) и whisper large-v3-turbo (~1,6 ГБ) скачиваются сами при первом прогоне в `~/.cache/hyperframes`, whisper.cpp собирается из исходников (нужны `cmake` и компилятор). `npm run doctor` показывает, чего не хватает.

## Машины

| Машина | Железо | Что отличалось | Настройка |
|---|---|---|---|
| Ноутбук (D1–D3) | Ryzen 5 5600H, RTX 3050, 16 ГБ | модели Kokoro и whisper скачаны, whisper.cpp собран в D1 | ≈ 45 мин в D1 |
| Компьютер №2 (с D3.5) | Intel i5-10400 (6 ядер / 12 потоков), GTX 1650 4 ГБ, 31 ГБ, Ubuntu 24.04 | Node стоит через nvm (`~/.nvm`, v25.6.1): в неинтерактивном шелле `npm` и `node` не видны — перед командами `. ~/.nvm/nvm.sh`. Модели Kokoro, whisper large-v3-turbo и Chrome уже лежали в `~/.cache/hyperframes`, `node_modules` на месте | `npm run doctor` зелёный с первого раза; проверочная сборка Помпей 5 мин 48 с |

Скорость на компьютере №2 (сборка с нуля, кэшей голоса нет): Помпеи 56 с — голос 23 с, тайминги слов 78 с, рендер 95,5 с (4 потока), мастеринг 92 с, всего 5 мин 48 с; Titanic 35 с — 4 мин 15 с; Krakatoa 44 с — 4 мин 53 с. На ноутбуке рендер Помпей шёл 89 с.

## Ролик

Ролик описывается одним файлом `videos/<ролик>/video.json`: биты с текстом на английском, сцена библиотеки на бит, её параметры и якорные слова, оттенок, сид, источники цифр, переходы и звук. Сцены живут в `engine/scenes/` (контракт — [engine/scenes/CONTRACT.md](engine/scenes/CONTRACT.md)), стиль на токенах — в `engine/styles/`.

Каждый ролик — свой мир поверх стиля: `look` (`engine/looks/` — палитра, текстуры, камера, типографика, пост-эффекты, переходы; или свой объект в video.json), текстуры (`engine/textures/`), медиафон бита, motion (`engine/motion/`) и переходы (`engine/transitions/`). Сцены о слоях не знают. Автопроверка `uniqueness` падает, если ролик похож на другой из `videos/` (акцент ближе 30° и тот же набор текстур). MP4 — H.264 crf 18, до 25 МБ на 10 с; автопроверка падает, если у цифры на экране нет ссылки на источник. Всё привязано к словам голоса: сменился голос — сцены и субтитры сдвинулись вместе с ним.
