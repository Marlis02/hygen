# Titanic — пересказ v2 (D6)

Пересказ по раскадровке-доказательству `videos/_proof/titanic-v2` на движке v2: история корабля, в который трудно не поверить. Старая версия (сцены D2: счётчик 2:40 → карта → глубина → 1985 → фото → дробь 1/3) — `history/2026-09-14/`.

## Факты

| # | Факт (EN, как на экране) | Цифра | Цитата из источника | Ссылка |
|---|---|---|---|---|
| 1 | The largest ship afloat | — | «Titanic was the largest ship afloat upon entering service» | https://en.wikipedia.org/wiki/Titanic |
| 2 | The only film of the ship, Belfast, April 1912 | 1912 | Commons: «Titanic Disaster — Genuine Footage (1911–1912)», British Pathé; снято в Белфасте 2 апреля 1912 (TRAPS: подпись не утверждает больше описания) | https://commons.wikimedia.org/wiki/File:Titanic_Disaster_-_Genuine_Footage_(1911-1912).webm |
| 3 | Maiden voyage, Southampton to New York | — | «…sank … during her maiden voyage from Southampton, England, to New York City» | https://en.wikipedia.org/wiki/Sinking_of_the_Titanic |
| 4 | 16 compartments, floats with 4 flooded, iceberg opened 6 | 16, 4, 6 | proof titanic-v2 (Sinking of the Titanic) | https://en.wikipedia.org/wiki/Sinking_of_the_Titanic |
| 5 | 20 lifeboats for 1,178 people; 2,209 on board | 20, 1178, 2209 | «The ship had been supplied with 20 lifeboats that, by lifeboat capacity of that time, could accommodate 1,178 people, a little over half of the 2,209 on board the night it sank.» | https://en.wikipedia.org/wiki/Lifeboats_of_the_Titanic |
| 6 | Sank 2 h 40 min after the collision | 2:40 | «She sank two hours and forty minutes later at 02:20 ship's time» | https://en.wikipedia.org/wiki/Sinking_of_the_Titanic |
| 7 | 710 people pulled from the boats | 710 | proof titanic-v2 (Sinking of the Titanic) | https://en.wikipedia.org/wiki/Sinking_of_the_Titanic |

Точки 04-lifeboats: 1 точка = 10 человек — 221 точка (2,209), загораются 118 (1,178).

## Concept
Холодная глубина look `abyss` (пересказ того же мира, `retells: titanic-v2`). Субтитры calm · plain по слову; в бите шлюпок — editorial-emphasis фразами. Хук — единственная хроника корабля и кинетика THE LARGEST SHIP AFLOAT на словах голоса.

Арка: **story × imagine-scenario × object × one-number-silence** — «представьте самый большой корабль на плаву», рейс, машина, которая не выдержала, места в шлюпках, гибель, одна цифра живых. Отличие от первой версии: у той не было арки, скелет — шесть сцен с HTML; у proof — concept-announcement и три бита.

## Beats
- 01-film (hook): Зритель видит единственную хронику корабля, и на слова голоса собирается THE LARGEST SHIP AFLOAT; на слове gone кадр замирает. → stage media (видео Pathé, кадрирован без логотипа) + text.kinetic center-build (wordsAt) + edit.hold.
- 02-route (setup): Зритель видит, как маршрут идёт с востока через Северную Атлантику к метке TITANIC. → stage map north-atlantic, маршрут с бегунком, камера follow.
- 03-hull (turn): Зритель видит корпус, разделённый на 16 отсеков, и как шесть из них заполняются водой. → proof 02: spotlight + annotate.box + data.count.
- 04-lifeboats (peak): Зритель видит 221 точку — всех на борту — и как загораются только 118 мест в шлюпках. → data.dots; субтитры editorial-emphasis.
- 05-sinking (aftermath): Зритель видит картину Штёвера целиком полосой, свет на тонущем корабле и подпись, что это взгляд художника. → stage media contain + focus.spotlight + annotate.label.
- 06-boat (ending): Зритель видит шлюпку и одну цифру 710 в тишине. → proof 03: quiet-ending.

## Media
- `media/titanic-pathe-1912-belfast.webm` — evidence (Commons, British Pathé, PD; риск Content ID — DECISIONS D5, кадрирован `crop`).
- `media/rms-titanic.jpg` — hero (F. G. O. Stuart, 1912, PD).
- `media/titanic-lifeboat-ogden.jpg` — evidence (Louis Ogden, 1912, PD).
- `media/stower-sinking.jpg` — evidence: «Stöwer Titanic.jpg», Willy Stöwer, 1912, public domain — `npm run media -- "Untergang der Titanic Stöwer"`, миниатюра 2400 px. Картина, а не фото: подпись на экране так и говорит.
- Силуэт `engine/assets/maps/north-atlantic.svg` (Natural Earth): место гибели → x 54,7 %, y 37,7 %.
