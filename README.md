# hygen

Движок англоязычного faceless-канала: тема → сценарий → голос → сцены с эффектами → субтитры и звук → черновик → финал. Shorts 1080×1920, позже Long 1920×1080.

Правила работы и структура — в [CLAUDE.md](CLAUDE.md). План недели — в [ROADMAP.md](ROADMAP.md). Ловушки рендера — в [TRAPS.md](TRAPS.md), решения — в [DECISIONS.md](DECISIONS.md).

## Запуск

```bash
npm ci                                # зависимости, версии закреплены
npm run doctor                        # проверка окружения
npm run build -- videos/pompeii-en    # весь конвейер до MP4 с автопроверкой
npm run verify -- videos/pompeii-en   # автопроверка готового MP4 и контактный лист
```

`build` идёт по шагам: голос Kokoro → тайминги слов whisper → звук по таймингам → сцены, растянутые под голос → `index.html` с субтитрами и шинами → `hyperframes lint` и `check` → рендер → мастеринг до −14 LUFS → автопроверка MP4.

Полезные флаги: `--no-render` (остановиться перед рендером), `--quality draft|standard|high`, `--no-check`, `--no-snapshots`.

Результаты ролика лежат в `videos/<ролик>/renders/`: `<id>.mp4`, контактный лист `<id>.contact.jpg`, отчёт автопроверки `<id>.verify.json`, тайминги сборки `<id>.build.json`. Рендеры, кэши голоса и ASR в git не попадают.

## Что нужно на машине

Node ≥ 22.18, Python 3.10+ с `numpy scipy soundfile pillow`, ffmpeg с `ebur128`, Chrome. Локальные модели ставятся один раз:

```bash
python3 -m pip install --user kokoro-onnx      # голос Kokoro
```

Модели Kokoro (~330 МБ) и whisper large-v3-turbo (~1,6 ГБ) скачиваются сами при первом прогоне в `~/.cache/hyperframes`, whisper.cpp собирается из исходников (нужны `cmake` и компилятор). `npm run doctor` показывает, чего не хватает.

## Ролик

Ролик описывается одним файлом `videos/<ролик>/video.json`: биты с текстом на английском, сцена на бит, опорные слова (`cues`), переходы и звук. Сцены живут в `engine/scenes/`, стиль — в `engine/styles/`. Всё привязано к словам голоса: сменился голос — сцены и субтитры сдвинулись вместе с ним.
