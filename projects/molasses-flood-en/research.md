# Great Molasses Flood, Boston 1919 — исследование

Бриф из панели: спокойная документальная интонация, странность события несёт ролик сама; цифры с источниками; одно главное фото рухнувшего резервуара.

| # | Факт (EN) | Цифра | Цитата | Ссылка |
|---|---|---|---|---|
| 1 | The tank held 2.3 million US gallons of molasses | 2.3 million | "A large storage tank filled with 2.3 million U.S. gallons (8,700 cubic meters) of molasses" | https://en.wikipedia.org/wiki/Great_Molasses_Flood |
| 2 | The tank was 50 ft tall and 90 ft across, on Commercial Street by Boston Harbor | 50 / 90 | "The molasses tank stood 50 feet (15 meters) tall and 90 ft (27 m) in diameter" · "the Commercial Street tank, located adjacent to Boston Harbor" | https://en.wikipedia.org/wiki/Great_Molasses_Flood |
| 3 | The day before, the air warmed from 2 to 41 °F | 2 → 41 | "Warmer weather the previous day would have assisted in building this pressure, as the air temperature rose from 2 to 41 °F (−17 to 5.0 °C) over that period." | https://en.wikipedia.org/wiki/Great_Molasses_Flood |
| 4 | It burst around 12:30 p.m.; rivets shot out like a machine gun | 12:30 | "the tank burst open and collapsed at approximately 12:30 p.m." · "a sound like a machine gun as the rivets shot out of the tank" | https://en.wikipedia.org/wiki/Great_Molasses_Flood |
| 5 | The wave was 25 ft high and moved at 35 mph | 25 / 35 | "a wave of molasses 25 ft (8 m) high at its peak, moving at 35 mph (56 km/h)" | https://en.wikipedia.org/wiki/Great_Molasses_Flood |
| 6 | Steel panels of the tank were driven against the girders of the elevated railway | — | "drive steel panels of the burst tank against the girders of the adjacent Boston Elevated Railway's Atlantic Avenue structure" | https://en.wikipedia.org/wiki/Great_Molasses_Flood |
| 7 | As it cooled the molasses thickened and trapped people | — | "After the initial wave, the molasses became viscous, exacerbated by the cold temperatures, trapping those caught in the wave" | https://en.wikipedia.org/wiki/Great_Molasses_Flood |
| 8 | 21 killed, about 150 injured | 21 / 150 | "About 150 people were injured, and 21 people and several horses were killed." | https://en.wikipedia.org/wiki/Great_Molasses_Flood |
| 9 | The tank was never rebuilt; the area smelled of molasses for decades | decades | "USIA did not rebuild the tank." · "residents reported for decades afterwards that the area still smelled of molasses on hot summer days" | https://en.wikipedia.org/wiki/Great_Molasses_Flood |

Разброс: табличка Bostonian Society пишет «40-foot wave», статья — 25 ft на пике. В ролике — 25 ft по статье; табличку в кадр не берём, чтобы не спорить с ней на экране. Первые газеты (Globe, Post 16 января) дают «11 dead» — ранний счёт, газетные полосы тоже не берём.

## Concept
- Настроение: чёрно-белый январский Бостон 1919 года, холодная гавань и эстакада — и в этом сером мире тёмно-янтарная, почти сладкая волна. Спокойно, без сенсации: странность — в самом веществе.
- Ключевой цвет: янтарь патоки на холодной серой земле (акцент #C8862E, земля #0E0C0A, текст #EEE8DE; холодный тон — сталь #9FB3C4).
- Look: свой объект `molasses-amber` поверх `abyss` — янтарный акцент (≈ 35°), одна текстура `fog` (холодная гавань, фон, слабо): набор {fog} не совпадает ни с одним роликом, поэтому близость акцента к ember/ink-fire допустима по правилу «≥ 30° или другой набор текстур»; типографика typewriter (газета 1919), без flicker и bloom, переход на ударе `smoke-wipe`; субтитры calm · plain.
- Арка: story × shocking-statistic × object × what-remains. Протагонист — резервуар: полный, тёплый день, разрыв, волна, погибшие, и то, что осталось, — запах.

## Media
| Файл | Роль | Что на самом деле | Лицензия |
|---|---|---|---|
| `tank-scale.png` | evidence | фото последствий 15 января 1919 с нарисованным поверх контуром резервуара 50 × 90 ft (Jacione, 2023) | CC BY-SA 4.0 |
| `el-structure.jpg` | evidence | стальной лист разорванного резервуара, свёрнутый у опор эстакады Atlantic Avenue, 1919 | PD |
| `aftermath-panorama.jpg` | hero | панорама Commercial Street в день катастрофы: руины, эстакада слева, толпа и машины Красного Креста | PD (BPL) |
| `blackstrap-molasses.jpg` | place | патока (blackstrap) стекает с ложки, фото 2008 — само вещество, без утверждений о Бостоне | CC BY 3.0, Badagnani |

Поиск: `npm run media` по «Boston molasses disaster», «Great Molasses Flood», «molasses tank Boston 1919», «Commercial Street Boston 1919 elevated», «Langone Park Boston», «Puopolo Park North End», «molasses». Фото резервуара до катастрофы (`North End molasses tank.jpg`) — всего 417×327, в кадр 9:16 не годится. Газетные полосы дают ранний счёт «11 dead», табличка — «40-foot wave»: не берём. Фото Langone Park сегодня на Commons не нашлось — финал держится на запахе, а не на месте. `wreckage-elevated.jpg` скачан и отброшен: второй кадр эстакады повторял бы бит 03. В описании панорамы — «eight foot wave»; на панораме волну не подписываем, высота 25 ft — только в реплике со ссылкой на статью.

## Beats
- 01-tank (hook): Зритель видит руины 1919 года с красным контуром резервуара 50 × 90 ft и над ними счётчик «2.3M · GALLONS OF MOLASSES». → stage media (tank-scale, contain, film-memory) + data.count на первом слове.
- 02-warm (setup): Зритель видит на тёмном янтарном фоне, как термометр-счётчик ползёт от 2 °F до 41 °F — за один день перед катастрофой. → stage color с glow + data.count 2→41.
- 03-burst (turn): Зритель видит свёрнутый стальной лист резервуара у опор эстакады, рукописная обводка подписывает его TANK STEEL. → stage media (el-structure, contain) + annotate.label.
- 04-wave (peak): Зритель видит главную фотографию — разрушенную Commercial Street с толпой и машинами, камера чуть дышит, наверху падает «35 · MILES PER HOUR». → stage media (aftermath-panorama, cover, film-memory) + data.count, камера tension.
- 05-trapped (aftermath): Зритель видит 171 точку — всех погибших и раненых, и на слове «died» 21 точка гаснет. → show-consequence: color + data.dots 171 / 21, fade вразброс.
- 06-smell (ending, what-remains): Зритель видит, как тёмная патока медленно стекает с ложки, — тишина, без цифр. → quiet-ending на blackstrap-molasses (cover, duotone), камера стоит.
