# Превью голосов ElevenLabs

Реплика: «More than a century later, archaeologists began pouring plaster into the voids left by the bodies.»

Модель `eleven_multilingual_v2`, эндпоинт with-timestamps (тайминги слов из API). Собрано командой `npm run voices -- "<реплика>"`; дубли лежат в кэше `.cache/voice/elevenlabs` и повторно символов не тратят.

| Файл | Голос | voiceId | Какой | Длина |
|---|---|---|---|---|
| `01-michael-c.wav` | Michael C. Vincent - Confident, Expressive | `uju3wxzG5OhpWcoi3SMy` | ELEVENLABS_VOICE_ID из .env — голос по умолчанию · descriptive: confident, age: middle_aged, gender: male, use_case: narrative_story, accent: american, language: en | 6.5 с |
| `02-george-warm.wav` | George - Warm, Captivating Storyteller | `JBFqnCBsd6RMkjVDRZzb` | британский мужской, рассказчик (готовый голос библиотеки ElevenLabs) · accent: british, age: middle_aged, descriptive: mature, language: en, gender: male, use_case: narrative_story | 6.4 с |
| `03-daniel-steady.wav` | Daniel - Steady Broadcaster | `onwK4e9ZLuTAKqWW03F9` | британский мужской, диктор новостей (готовый голос библиотеки ElevenLabs) · accent: british, age: middle_aged, descriptive: formal, language: en, gender: male, use_case: informative_educational | 8.0 с |
| `04-alice-clear.wav` | Alice - Clear, Engaging Educator | `Xb7hH8MSUJpSbSDYk0k2` | британский женский, ведущая-просветитель (готовый голос библиотеки ElevenLabs) · accent: british, age: middle_aged, descriptive: professional, language: en, gender: female, use_case: informative_educational | 7.0 с |

Как выбрать: послушать, взять voiceId и поставить его в `hygen.config.json` (`voice.voiceId`) — голос по умолчанию для всех роликов на ElevenLabs, или в `video.json` ролика: `"voice": {"provider": "elevenlabs", "voiceId": "…"}`.
