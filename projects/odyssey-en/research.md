# The Odyssey — как доказать, что ты царь, после 20 лет — исследование

Бриф панели: тема «odyssey», look свободный, голос ElevenLabs, 45 с, пожеланий нет.

| # | Факт (EN) | Цифра | Цитата | Ссылка |
|---|---|---|---|---|
| 1 | Odysseus comes home after 20 years, disguised as a beggar | 20 | "When the disguised Odysseus returns after 20 years, he is recognized only by his faithful dog, Argos." · "Athena disguises Odysseus as a wandering beggar to learn how things stand in his household." | https://en.wikipedia.org/wiki/Odysseus |
| 2 | Ten years of war and ten more years of the journey | 10 + 10 | "his homecoming journey after the ten-year-long Trojan War. His journey from Troy to Ithaca lasts an additional ten years" | https://en.wikipedia.org/wiki/Odyssey |
| 3 | 108 suitors court Penelope | 108 | "In his absence, 108 boorish suitors court his wife Penelope." | https://en.wikipedia.org/wiki/Odyssey |
| 4 | His old dog Argos recognizes him and dies | — | "Odysseus's elderly dog Argos, long neglected, recognizes him through his disguise; … upon finally seeing his return, dies peacefully." · Butler: "Argos died as soon as he had recognised his master." | https://en.wikipedia.org/wiki/Odyssey · https://en.wikisource.org/wiki/The_Odyssey_(Butler)/Book_XVII |
| 5 | The nurse Eurycleia knows the scar from a boar hunt while washing his feet | — | "Odysseus's identity is discovered by the housekeeper, Eurycleia, as she is washing his feet and discovers an old scar Odysseus received during a boar hunt." | https://en.wikipedia.org/wiki/Odysseus |
| 6 | He strings the bow and shoots through twelve axes | 12 | "whoever can string Odysseus's rigid bow and shoot an arrow through twelve axe shafts may have her hand." · "Odysseus easily strings his bow and wins the contest." | https://en.wikipedia.org/wiki/Odysseus |
| 7 | Penelope still fears a god in disguise | — | "Penelope cannot believe that her husband has really returned—she fears that it is perhaps some god in disguise … and tests him by ordering her servant Euryclea to move the bed" | https://en.wikipedia.org/wiki/Odysseus |
| 8 | The bed cannot be moved: one leg is a living olive tree | — | "he made the bed himself and knows that one of its legs is a living olive tree." · "the bed, which he carved from the trunk of an olive tree, is immovable" | https://en.wikipedia.org/wiki/Odysseus · https://en.wikipedia.org/wiki/Odyssey |
| 9 | Odysseus's own words (Butler, 1900) | — | "There was a young olive growing within the precincts of the house … I built my room round this with strong walls of stone" | https://en.wikisource.org/wiki/The_Odyssey_(Butler)/Book_XXIII |

Разброс: «twelve axe shafts» (Wikipedia) и «twelve axes» (Батлер); голландское название офорта — «двенадцать колец». В реплике и на экране — «twelve axes», как у Батлера. Хронология: сомнение Пенелопы и испытание кроватью — после стрельбы и расправы с женихами; расправу ролик не показывает, реплика 05 «Even then» верна.

## Concept
- Настроение: «винно-тёмное море» Гомера на листах старого офорта — медленно, тихо, как чтение при лампе; ветер странствий тянет через кадр, а внизу стелется морская дымка.
- Ключевой цвет: тёмное вино на чёрной туши (акцент #C23C66, земля #140A0E, бумага #F0E6D8), холодный второй тон — эгейская бирюза #6FB3C4.
- Look: свой объект `wine-dark` поверх `ember` — палитра вино + бумага, текстуры `fog` (фон, низкая дымка) и `wind` (передний план, редкие полосы); офорты в `duotone` (тень — ночь, свет — бумага с вином); заголовки mask-wipe, подписи slide, счёт count-roll; bloom 0,25; переход на ударах `iris` (виньетка старой гравюры); субтитры calm · `editorial-emphasis` (литературный курсив для одного слова фразы). Акцент 341° — 35° от ember (16°), 77° от control-violet; набор текстур {fog, wind} не совпадает ни с одним роликом (halifax — smoke+fog, molasses — fog, ink-fire — smoke+embers, storm — smoke+ash, abyss — fog+bubbles).
- Арка: mystery × rhetorical-question × person × callback. Протагонист — Одиссей: нищий в собственном доме; улики — собака и шрам, ложный след — лук (сила не доказывает, что это не бог), разгадка — кровать на живой оливе; финал возвращается к «двадцати годам» хука. Последние два ролика: molasses (story × shocking-statistic × object × what-remains) и krakatoa-v2 (mystery × shocking-statistic × sound × what-remains) — кортеж другой.

## Media
| Файл | Роль | Что на самом деле | Лицензия |
|---|---|---|---|
| `beggar-at-the-door.jpg` | evidence | Теодор ван Тюльден по Приматиччо, «Les Travaux d'Ulysse», лист 36/58 (1632–33): Одиссей-нищий сидит у двери своего дома, слева женихи | CC0, Rijksmuseum RP-P-OB-66.767 |
| `argos-recognizes.jpg` | evidence | та же серия, лист 34/58: пёс Аргус узнаёт Одиссея, рядом Эвмей | CC0, Rijksmuseum RP-P-OB-66.765 |
| `euryclea-scar.jpg` | evidence | И. Г. В. Тишбейн, «Odysseus and Euryclea» (контурный рисунок): Эвриклея держит его ногу над тазом и узнаёт | PD |
| `bow-twelve-rings.jpg` | evidence | серия, лист 39/58: Одиссей стреляет сквозь ряд из двенадцати колец (топоров), видно 7 колец | CC0, Rijksmuseum RP-P-OB-66.770 |
| `penelope-embrace.jpg` | hero | серия, лист 46/58: Одиссей и Пенелопа обнимаются | CC0, Rijksmuseum RP-P-OB-66.777 |

Поиск: `npm run media -- "<запрос>" --provider commons` по «Eurycleia», «Odysseus slaying suitors», «Odysseus Argos», «Odysseus Penelope bed», «Odysseus Sirens stamnos», «werken van Odysseus Rijksmuseum», «Odysseus bow axes», «Penelope loom weaving shroud». Выбрана одна серия офортов 1633 года, чтобы мир был цельным (четыре листа из 58 без подписей внизу — версии RP-P-OB, а не BI-1883 с французским текстом); Эвриклеи в серии нет — взят рисунок Тишбейна, штрих того же характера. Краснофигурные вазы (Онесим, скифос из Тарквинии) отброшены: фрагменты или B&W-скан с подписями.

Координаты (сетка 10 %): беглец на листе 36 — голова (0,78; 0,42), фигура u 0,57–0,90, v 0,38–0,82 → cover focus 0,92 (Wv 0,427, left 0,527) → рамка x 18–86, y 36–72. Аргус — голова (0,56; 0,50) → cover focus 0,587 (left 0,337) → x 40–68, y 47–73. Шрам — рука Эвриклеи на колене (0,44–0,62; 0,50–0,62) → cover focus 0,5 (Wv 0,735, left 0,133) → x 42–66, y 50–62 → pan к {30, 32, 48, 48}. Лук и кольца — contain (полоса 28,8–71,2 %), кольца на y ≈ 58 %; число над полосой y 18 %. Объятие — contain (полоса 28,5–71,5 %), лица на y ≈ 39 %, число над полосой y 17 %.

## Beats
- 01-beggar (hook): Зритель видит нищего старика, сидящего на земле у двери дворца; его обводит рукописный овал с подписью «ODYSSEUS · KING OF ITHACA · 20 YEARS AWAY». → identify без spotlight (label + камера approach 0,3), чтобы хук не был плотным. Роль медиа: evidence.
- 02-suitors (question): Зритель видит, как на тёмном поле выстраиваются 108 точек-женихов и на слове «wife» все разом загораются винным цветом. → stage color + data.dots 108, mark 108. Пауза после хука.
- 03-argos (clue): Зритель видит старого пса, который тянется мордой к Одиссею; свет выхватывает пса, подпись «ARGOS». → show-detail на листе 34: spotlight + label.
- 04-scar (clue): Зритель видит, как нянька держит ногу гостя над тазом, и кадр медленно съезжает к её руке на его колене — туда, где шрам. → stage media + pan к колену на слове «scar», без устройств (пауза после плотного бита).
- 05-bow (false-lead): Зритель видит весь офорт: Одиссей натягивает лук, перед ним ряд колец, над листом счёт до «12 · AXES, ONE ARROW». → stage media contain + data.count.
- 06-bed (reveal): Зритель видит на тёмной карточке, как по словам появляются слова Одиссея у Батлера: «There was a young olive growing within the precincts of the house… I built my room round this». → рецепт quote-card.
- 07-embrace (ending, callback) — см. ниже.

## Правки после снимков (--no-render)
- Длина 37,9 с при брифе 45 с → реплики 02–05 длиннее на 12 слов («In his hall… Penelope», «long neglected», «Eurycleia… Her hand stops», «the bow no suitor could» — все из цитат таблицы), паузы 0,7–0,8 с, финал 2,6 с. Итого 117 слов.
- 04-scar: наезд до окна 48 % увеличивал рисунок 1112 px вдвое — штрих рассыпался в зерно; окно 64 %.
- Мир читается: винный duotone держит офорты и рисунок Тишбейна вместе; субтитры editorial-emphasis — курсив одного слова; движок подложил wash под субтитры в 01 и 04 (контраст 3,6 и 3,3).

- 07-embrace (ending, callback): Зритель видит, как Одиссей и Пенелопа обнимаются, а над листом в тишине встаёт «20 · YEARS». → quiet-ending: contain + data.count, камера стоит. Роль медиа: hero.
