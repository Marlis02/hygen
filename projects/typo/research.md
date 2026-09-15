# Why is the sky blue — proof `typo` (D6)

Контрольный ролик текстовой системы: все режимы `text.kinetic` подряд, по одному пресету субтитров из каждого семейства, `sync: voice` и `sync: music` на тестовом треке `test-beat-100`. Тема нейтральная и не документальная — первый ролик в look `bright-explainer`.

## Факты

| # | Факт (EN) | Цифра | Цитата | Ссылка |
|---|---|---|---|---|
| 1 | Blue light scatters more strongly than red | — | «Because its wavelengths are shorter, blue light is more strongly scattered than the longer-wavelength lights, red or green.» | https://en.wikipedia.org/wiki/Diffuse_sky_radiation |
| 2 | Scattering falls with the fourth power of the wavelength | — | «the amount of scattering is inversely proportional to the fourth power of the wavelength» | https://en.wikipedia.org/wiki/Rayleigh_scattering |
| 3 | The daytime sky is blue because blue scatters more | — | «Since blue light wavelengths scatter more, the diffuse sky seen in daytime is blue.» | https://en.wikipedia.org/wiki/Rayleigh_scattering |
| 4 | Scattered light comes from every part of the sky | — | «This results in the indirect blue and violet light coming from all regions of the sky.» | https://en.wikipedia.org/wiki/Rayleigh_scattering |
| 5 | Nitrogen and oxygen molecules do the scattering | — | «the sky is blue due to Rayleigh scattering, which also involves the diatomic gases N2 and O2» | https://en.wikipedia.org/wiki/Diffuse_sky_radiation |
| 6 | At sunset the light crosses more air and loses its blue | — | «the path of sunlight through the atmosphere is elongated such that much of the blue or green light is scattered away» | https://en.wikipedia.org/wiki/Diffuse_sky_radiation |
| 7 | Lord Rayleigh explained it in 1871 | 1871 | «The explanation of blue color by Lord Rayleigh in 1871 is a famous example of applying dimensional analysis» | https://en.wikipedia.org/wiki/Diffuse_sky_radiation |

## Concept
Светлый лист бумаги, синяя тушь и оранжевый второй цвет: объясняющий ролик, в котором буквы — главный объект кадра. Look `bright-explainer` (светлая бумага, субтитры explainer — pill-karaoke с маркером по звучащему слову), текстура `paper` на трёх битах, переходы — жёсткие склейки. Музыка — `test-beat-100` (100 BPM): половина битов шагает по сетке трека.

Арка: mechanism × rhetorical-question × object × lesson — как белый солнечный свет становится синим небом шаг за шагом.

## Beats
- 01-why (hook): Зритель видит, как на слова вопроса падают WHY / IS / THE SKY / BLUE? → text.kinetic **slam**, sync voice.
- 02-white (setup): Слово WHITE столбиком, залитая строка шагает по битам → **stack**, sync music, paper.
- 03-colors (step): EVERY COLOR AT ONCE собирается по центру слово за словом → **center-build**, sync voice.
- 04-rainbow (step): ряды COLORS бегут навстречу, шагая на бит → **marquee**, sync music.
- 05-waves (step): WAVES выдавливается в глубину и качается → **extrude**, sync voice.
- 06-short (step): SHORT дышит весом и шириной в такт → **weight-morph**, sync music, paper.
- 07-air (step): NITROGEN перебирает символы и встаёт → **scramble**, sync voice; субтитры energetic — neon-glow.
- 08-scatter (step): контур SCATTER заливается на слове direction, привязанном к биту → **outline**, sync music.
- 09-stronger (step): BLUE, прорезанное текстурой бетона → **texture**, sync voice, paper.
- 10-everywhere (step): небо сквозь листву, EVERYWHERE в перспективе → **tilt** на фото, sync music; субтитры calm — blend-difference.
- 11-look-up (step): женщина смотрит в небо, LOOK UP стоит за её головой → **behind-subject**, sync voice.
- 12-sunset (consequence): закат, строка THE SKY IS меняет BLUE → ORANGE → RED на биты → **type-swap**, sync music.
- 13-rayleigh (ending): RAYLEIGH SCATTERING и 1871 спокойным титром → text.title calm, sync voice.

## Media
Запросы `npm run media`: «woman looking up at the sky», «person looking at sky», «blue sky clouds», «sunset sky orange» (листы `.preview/typo-media-*.jpg`).
- `media/woman-sky.jpg` — place/hero: «Woman red hair looking at sky (Unsplash)», Tyler McRobert, CC0. Человек со спины на фоне неба: модель remove-background режет людей (TRAPS), поэтому для behind-subject нужен человек.
- `media/sky-trees.jpg` — place: «Blue sky white clouds looking up at trees», Tomwsulcer, CC0; вертикальный кадр.
- `media/sunset-laos.jpg` — evidence: «Colorful sky with orange clouds reflecting in the water of a paddy field, at sunset, Vang Vieng, Laos», Basile Morin, CC BY-SA 4.0 (кредит в publish).
