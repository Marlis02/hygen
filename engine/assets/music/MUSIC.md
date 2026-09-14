# Музыка

Подложка ролика — трек из библиотеки стиля, зацикленный на длину ролика, с входом и выходом и приглушением под голос. Звуки событий и гул — отдельно (`engine/src/sound.ts`), музыка их не заменяет.

## Где лежит
- `engine/assets/music/<стиль>-NN.wav` + `<стиль>-NN.license.json` рядом. Сейчас: `documentary-dark-01` — плато процедурного гула Помпей (CC0).
- Треки стиля перечислены в `engine/styles/<стиль>/style.json → music.tracks`; там же громкость, приглушение, вход и выход по умолчанию.

## Как ролик выбирает музыку
- Без поля `music` в `video.json` — первый трек стиля с настройками стиля.
- `"music": {"track": "documentary-dark-01", "volume": -4, "duck": -12, "fadeIn": 1.5, "fadeOut": 2, "in": "02-context:start", "out": "end"}` — id трека стиля или файл ролика (`"media/theme.wav"` с `license.json`); `volume` и `duck` — дБ; `in`/`out` — ссылки времени движка (`<бит>:start|end|<слово>`, `start`, `end`).
- `"music": false` — без музыки. Так у Помпей: их гул — эталон ручного звука.

## Формат трека
- WAV 48 кГц, 16 бит, стерео (другие частоты движок пересчитает). Без резкой концовки: подложка склеивается кроссфейдом 2 с.
- Громкость файла не важна: движок приводит трек к −24 LUFS, дальше `volume`; под речью −12 дБ (атака 0,12 с, отпускание 0,45 с). Мастеринг держит ролик на −14 LUFS.

## Откуда брать
- **YouTube Audio Library** (studio.youtube.com → «Фонотека»): фильтр «Указание авторства не требуется». Если трек требует атрибуции — строка кредита в `license.json → notes`; кредит сам попадёт в `publish/description.md`. Треки фонотеки не блокируются Content ID на YouTube.
- **Pixabay Music** (pixabay.com/music): Pixabay Content License, атрибуция не нужна, но автора и ссылку записываем всё равно.
- Не брать: музыку из обычного поиска, ремиксы, «no copyright music» с чужих каналов — у них нет проверяемой лицензии.

## license.json
Те же поля, что у медиа, их проверяет сборка:

```json
{ "title": "…", "source": "YouTube Audio Library", "author": "…", "license": "YouTube Audio Library — attribution not required",
  "url": "https://…", "retrieved": "ГГГГ-ММ-ДД", "notes": "…" }
```

## Проверка
`npm run build -- videos/<id> --no-render` — шаг «музыка» пишет `build/assets/music/bed.wav` и `build/music.json`; полная сборка — автопроверка `loudness` (−14 LUFS ±0,5).

## Тестовый трек с битом
`test-beat-100` — процедурный трек 100 BPM, 30 тактов 4/4 (72 с, длиннее Short — подложка не склеивается): бочка на каждую долю, хлопок на 2 и 4, хэты восьмыми, пэд Am–F–C–G. CC0, генерируется `python3 engine/py/make_test_beat.py engine/assets/music/test-beat-100.wav`. Только для проверки `sync: music` (proof `videos/_proof/typo`), не для публикации.

Сетка битов: `engine/py/beats.py` (numpy/scipy: спектральный поток → автокорреляция 60–180 BPM → фаза сетки → привязка к пикам; сильные доли — каждый 4-й бит с наибольшей энергией), один раз на трек в `.cache/beats/<sha файла>.json`. На `test-beat-100`: 99,94 BPM, отклонение битов от сетки 0,6 с ≤ 8 мс.
