# Krakatoa v2 (proof D4) — исследование

Proof-ролик сессии D4: три бита Krakatoa на языке stage + devices. Пересказывает `projects/krakatoa-en` в том же мире (look storm), полный пересказ — D6.

| # | Факт (EN, как на экране) | Цифра | Цитата из источника | Ссылка |
|---|---|---|---|---|
| 1 | Heard 4,800 km away on Rodrigues | 4800 | "heard 3,110 km (1,930 mi) away in Perth, Western Australia, and the Indian Ocean island of Rodrigues near Mauritius, 4,800 km (3,000 mi) away, where the blast was thought to have been cannon fire from a nearby ship." | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |
| 2 | Ash rose about 80 km | 80 | "Ash was propelled to an estimated height of 80 km (260,000 ft)." | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |
| 3 | Lithograph for the Royal Society, 1888 | 1888 | Plate 1, Report of the Krakatoa Committee of the Royal Society; public domain | https://commons.wikimedia.org/wiki/File:Krakatoa_eruption_lithograph.jpg |
| 4 | Two thirds of the island destroyed | 2/3 | "The eruption destroyed two-thirds of the island of Krakatoa." | https://en.wikipedia.org/wiki/Krakatoa |
| 5 | Maps before and after, 1884 | — | Popular Science Monthly vol. 25 (1884), public domain | https://commons.wikimedia.org/wiki/File:PSM_V25_D379_Krakatoa_before_after_eruption_in_august_1883.jpg |

Расстояние на карте: Krakatoa 6.102 S 105.423 E → x 590, y 628 px; 4 800 км ≈ 405 px (engine/assets/maps/indian-ocean.`media.json`).

## Concept
- Настроение: мгла storm; ролик — загадка звука: его услышали за полмира и приняли за пушку.
- Арка: mystery × shocking-statistic × sound × what-remains. Хук — «4,800» в первые 1,5 с.
- Что видит зритель: (1) звуковая волна, потом карта, где круг от вулкана дорастает до Родригеса; (2) литографию-гравюру, замершую, с измерением столба пепла; (3) остров до и после под шторкой и «2/3».
- Медиа: карта Natural Earth (place), литография 1888 (evidence), карты PSM 1884 (evidence).

## Beats
- 01-heard (hook): Зритель видит звук — волну, — потом карту, где круг от вулкана дорастает до Родригеса. → stage map indian-ocean, reveal на «kilometers», метки KRAKATOA и RODRIGUES; data.chart line (осциллограмма, уходит на «away»); annotate.circle grow до 405 px (4 800 км) на «rodrigues»; камера reveal. Роль карты: place.
- 02-column (clue): Зритель видит литографию 1888 как документ: кадр замирает, прожектор на столб, размерная линия «80 KM». → stage media engraved, fit contain; edit.hold «drew» → «ash»; focus.spotlight rect; annotate.measure. Роль медиа: evidence.
- 03-island (ending): Зритель видит остров до и после под шторкой и «2/3». → intent compare: split двух половин листа PSM 1884, шторка на «destroyed», data.count «2/3» тёмным по бумаге. Роль медиа: evidence.
