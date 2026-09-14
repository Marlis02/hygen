# Great Fire of London 1666 — исследование

Ролик слепого теста навыка `/short` v3 (сессия D5): тема дана, всё остальное — по навыку.

| # | Факт (EN) | Цифра | Цитата | Ссылка |
|---|---|---|---|---|
| 1 | The fire began at Thomas Farriner's bakery in Pudding Lane, just after midnight, 2 September 1666 | 1666 | "A short time after midnight on Sunday, 2 September 1666, a fire broke out at Thomas Farriner's bakery in Pudding Lane." | https://en.wikipedia.org/wiki/Great_Fire_of_London |
| 2 | The City was mostly timber; upper floors almost met across the lanes | — | "Building with wood and roofing with thatch had been prohibited for centuries, but these cheap materials continued to be used." · "The fire hazard was well perceived when the top jetties all but met across the narrow alleys" | https://en.wikipedia.org/wiki/Great_Fire_of_London |
| 3 | The Lord Mayor delayed the demolitions for hours, then cried "the fire overtakes us faster than we can do it" | — | "demolition was fatally delayed for hours by the Lord Mayor's lack of leadership and failure to give the necessary orders." · "crying out plaintively in response to the King's message that he was pulling down houses: "But the fire overtakes us faster than we can do it."" | https://en.wikipedia.org/wiki/Great_Fire_of_London |
| 4 | The water wheels under London Bridge burned; piped water was lost | — | "The flames crept towards the riverfront and set alight the water wheels under London Bridge, eliminating the supply of piped water." | https://en.wikipedia.org/wiki/Great_Fire_of_London |
| 5 | The east wind fanned it into a firestorm | — | "the wind had already fanned the bakery fire into a firestorm which defeated such measures." · "the strong east wind dropped" | https://en.wikipedia.org/wiki/Great_Fire_of_London |
| 6 | St Paul's lead roof was melting within half an hour | half an hour | "This caught fire on Tuesday night, and within half an hour, the lead roof was melting" | https://en.wikipedia.org/wiki/Great_Fire_of_London |
| 7 | Four days | 4 | "The Great Fire of London occurred from Sunday 2 September to Wednesday 5 September 1666" | https://en.wikipedia.org/wiki/Great_Fire_of_London |
| 8 | At least 13,200 houses destroyed | 13,200 | "The material destruction has been computed at 13,200–13,500 houses, 86 or 87 parish churches, 44 Company Halls…" | https://en.wikipedia.org/wiki/Great_Fire_of_London |
| 9 | The Monument is 202 ft tall and stands 202 ft from the bakery | 202 | "202 feet (61.6 m) in height and 202 feet west of the spot in Pudding Lane where the Great Fire started on 2 September 1666." · "Its height marks its distance from the site of the shop of Thomas Farriner" | https://en.wikipedia.org/wiki/Monument_to_the_Great_Fire_of_London |

Разброс: дома — «13,200–13,500» → на экране нижняя граница «13,200», в реплике «at least». Число погибших (традиционно 6, Хансон — «several hundred and quite possibly several thousand») не используется: одна цифра с цитатой не выбирается.

## Concept
- Настроение: Лондон, каким его вырезал на меди Холлар, и та же ночь маслом — огонь у реки. Спокойно и тяжело, как в хронике; ветер с востока несёт искры через кадр справа налево.
- Ключевой цвет: золото расплавленного свинца и свечного света на тёмной сепии туши (акцент #E8C84A, земля #120E0A, бумага #F1E8D6).
- Look: свой объект `ink-fire` поверх `ember` — палитра тушь + золото, текстуры `smoke` (фон) и `embers` (передний план, снос влево −25°), типографика typewriter (печатный лист), bloom 0,3, лёгкий flicker 0,2 (свет огня), переход на ударах `smoke-wipe`. Набор текстур {smoke, embers} не совпадает ни с одним роликом (ember — нет, abyss — fog+bubbles, storm — smoke+ash); акцент 32° от ember.
- Арка: mechanism × rhetorical-question × place × callback. Протагонист — сам Сити: деревянный город, мэр, мост без воды, ветер, собор; финал возвращается к пекарне из хука через высоту колонны.

## Media
| Файл | Роль | Что на самом деле | Лицензия |
|---|---|---|---|
| `plaque-pudding-lane.jpg` | evidence | табличка Worshipful Company of Bakers на Pudding Lane (фото 2025), надпись без герба | CC BY-SA 4.0, Acabashi |
| `hollar-london-before-1666.jpg` | place | Холлар, вид Лондона из Саутуарка до пожара, окно вокруг собора Св. Павла | PD |
| `hollar-london-after-1666.jpg` | evidence | тот же вид и то же окно после пожара, 1666 | PD |
| `great-fire-1675-tower-wharf.jpg` | hero | пожар с лодки у Tower Wharf, картина c. 1675: слева Old London Bridge | PD |
| `hollar-old-st-pauls-burning-1666.jpg` | evidence | Холлар, горящий старый собор Св. Павла, офорт 1666 | CC0 |
| `monument-fish-street-hill.jpg` | place | Monument целиком, фото 2012, производная: колонна выше зоны субтитров | CC BY-SA 2.0, Lauren (geograph) |

Поиск: Commons API `list=search` по «Great Fire of London 1666 painting», «Hollar London fire 1666», «London before and after the fire Hollar», «Great Fire of London filetype:video» (видео нет — 1666), «Pudding Lane», «Monument London fire»; выбор — по листу миниатюр и описаниям файлов.

## Beats
- 01-bakery (hook): Зритель видит надпись на табличке «…the King's Baker, in which the Great Fire of September 1666 began», её выделяет свет и рукописная обводка с подписью PUDDING LANE. → show-evidence на табличке: spotlight + label «PUDDING LANE, 1666», без обработки (фото современное). Роль медиа: evidence.
- 02-timber (setup): Зритель видит плотный деревянный Лондон с собором Св. Павла, камера отъезжает от собора ко всему городу. → reveal на гравюре Холлара «до», fit contain, без титра (пауза после плотного хука). Роль медиа: place.
- 03-mayor (step): Зритель видит на тёмной карточке слова мэра, появляющиеся по одному: «…the fire overtakes us faster than we can do it.» → рецепт quote-card, автор Thomas Bloodworth, 1666.
- 04-bridge (step): Зритель видит на картине Old London Bridge над ночной водой, мост выхвачен светом и подписан, справа огонь. → show-detail: картина c. 1675, cover со сдвигом влево, spotlight + label «LONDON BRIDGE / WATER WHEELS BURNED»; текстура wind. Роль медиа: hero.
- 05-st-pauls (step): Зритель видит, как горит собор Св. Павла на офорте 1666 года: камера медленно наезжает на башню в огне. → stage media, cover на башню, камера approach, без устройств (пауза после плотного бита). Роль медиа: evidence.
- 06-gone (consequence): Зритель видит тот же вид Лондона до и после: шторка на слове «four» стирает город до руин, над ним вырастает «13,200 · HOUSES DESTROYED». → compare: split гравюр Холлара BEFORE/AFTER + count. Роль медиа: place → evidence.
- 07-monument (ending, callback): Зритель видит колонну Monument целиком, вдоль неё рисуется размерная линия «202 FT» — ровно столько до пекарни из первого кадра. → show-scale: measure по высоте колонны, камера reveal. Роль медиа: place.
