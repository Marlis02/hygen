# Скрипты навыков HyperFrames в движке

Копии скриптов из `.agents/skills` (heygen-com/hyperframes, CLI 0.8.36), на которых держится сборка. Движок вызывает их отсюда и не зависит от установленных навыков. Обновлять только копированием файла целиком, с новым хешем в таблице.

| Файл в `skills/` | Навык и `computedHash` из skills-lock.json | Роль в конвейере |
|---|---|---|
| `faceless-explainer/scripts/assemble-index.mjs` | faceless-explainer `641f6260f9b9…` | STORYBOARD.md + audio_meta.json → index.html |
| `faceless-explainer/scripts/captions.mjs` | faceless-explainer | слова голоса → группы → `compositions/captions.html` по скину субтитров |
| `faceless-explainer/scripts/lib/{storyboard,dimensions,tokens,assets}.mjs` | faceless-explainer | зависимости двух скриптов выше |
| `hyperframes-audio/scripts/carve.mjs` | hyperframes-audio `0761783373…` | приглушение гула и звуков под голос (`data-fx-carve`) |
| `media-use/audio/scripts/lib/bgm.mjs` | media-use `b01947a858ea…` | **урезан** до `bgmDefaultVolume`: полный файл тянет клиент HeyGen и проверки MusicGen |

Все файлы, кроме `bgm.mjs`, совпадают с оригиналом байт в байт.
