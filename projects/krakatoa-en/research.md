# Krakatoa 1883 — пересказ v2 (D6)

Пересказ по раскадровке-доказательству `projects/krakatoa-v2` на движке v2: механизм — как остров стал самым громким звуком в истории. Старая версия (сцены D3: счётчик → одометр → карта → шкала → картина → дробь) — `history/2026-09-14/`.

## Факты

| # | Факт (EN, как на экране) | Цифра | Цитата из источника | Ссылка |
|---|---|---|---|---|
| 1 | The loudest sound in history | — | «…remains the loudest-known sound in history.» | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |
| 2 | Between Java and Sumatra, Sunda Strait | — | «Krakatoa … is a caldera in the Sunda Strait between the islands of Java and Sumatra» | https://en.wikipedia.org/wiki/Krakatoa |
| 3 | Heard 4,800 km away on Rodrigues | 4800 | «The explosion was heard 3,110 kilometres (1,930 mi) away in Perth, Western Australia, and Rodrigues near Mauritius, 4,800 kilometres (3,000 mi) away.» | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |
| 4 | The ash rose about 80 km | 80 | «…the ash column reached an estimated height of 80 km» (proof krakatoa-v2) | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |
| 5 | More than 36,000 dead, mostly from tsunamis | 36000 | «At least 36,417 people died, and many more thousands were injured, mostly from the tsunamis that followed the explosion.» | https://en.wikipedia.org/wiki/Krakatoa |
| 6 | 165 villages and towns destroyed, 132 damaged | 165, 132 | «165 villages and towns were destroyed near Krakatoa, and 132 were seriously damaged.» | https://en.wikipedia.org/wiki/Krakatoa |
| 7 | Two thirds of the island destroyed | 2/3 | «The eruption destroyed two-thirds of the island of Krakatoa.» | https://en.wikipedia.org/wiki/Krakatoa |
| 8 | Lithograph, Parker & Coward, 1888 | 1888 | Plate 1, Report of the Krakatoa Committee of the Royal Society; public domain | https://commons.wikimedia.org/wiki/File:Krakatoa_eruption_lithograph.jpg |
| 9 | August 1883 | 1883 | «On 27 August, the island had its most significant eruption, which destroyed over 70% of the island» | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |

Осторожно: оценки погибших доходят до 120 000 — на экране «more than 36,000» (нижняя официальная). Точки 05-waves: 297 = 165 разрушенных + 132 серьёзно повреждённых поселения; гаснут 165.

## Concept
Серо-зелёная мгла грозы look `storm` (как у proof: пересказ того же мира, `retells: krakatoa-v2`). Субтитры calm · plain по слову, в бите звука — karaoke фразами. Хук — kinetic type-swap: сначала ложные ответы, потом «AN ISLAND».

Арка: **mechanism × counterintuitive-claim × sound × what-remains** — «самый громкий звук был не войной, а островом», дальше шаг за шагом: где остров → как далеко слышно → как высоко ушёл пепел → чем обернулись волны → что осталось от острова. Отличие от первой версии: у той не было арки, скелет — шесть сцен с HTML; у proof — mystery × shocking-statistic.

## Beats
- 01-claim (hook): Зритель читает THE LOUDEST SOUND, а под ней на слова голоса сменяются A WAR? → A BOMB? → AN ISLAND. → text.kinetic type-swap с wordsAt, цвет.
- 02-strait (setup): Зритель видит пролив и метку KRAKATOA между Явой и Суматрой. → stage map sunda-strait, метка.
- 03-heard (step): Зритель видит, как круг от Кракатау дорастает до Родригеса, 4,800 KM, и осциллограмму удара. → proof 01: map indian-ocean + data.chart + annotate.circle; субтитры karaoke.
- 04-column (step): Зритель видит литографию 1888 года стоп-кадром и размерную линию 80 KM вдоль столба пепла. → proof 02: edit.hold, spotlight, measure.
- 05-waves (consequence): Зритель видит 297 точек-поселений, из которых 165 гаснут. → data.dots, дождь.
- 06-island (ending): Зритель видит остров до и после шторкой и дробь 2/3, собранную без промежуточных чисел. → split + data.count fraction.

## Media
Из proof krakatoa-v2 (скопированы с `media.json`): `krakatoa-lithograph.jpg` (evidence, PD), `krakatoa-before.jpg` / `krakatoa-after.jpg` (place, PD), силуэты `engine/assets/maps/sunda-strait.svg`, `indian-ocean.svg` (Natural Earth).
