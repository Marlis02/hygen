# Halifax Explosion 1917 — исследование

Второй ролик выпуска D5: полный конвейер навыком `/short` v3.1 — голос ElevenLabs, медиа командой `npm run media`, звук по событиям, музыка, `publish/`.

| # | Факт (EN) | Цифра | Цитата | Ссылка |
|---|---|---|---|---|
| 1 | Two ships collided in Halifax harbour on 6 December 1917 | 1917 | "On the morning of 6 December 1917, the French cargo ship SS Mont-Blanc and the Norwegian vessel SS Imo collided in the harbour of Halifax, Nova Scotia, Canada." | https://en.wikipedia.org/wiki/Halifax_Explosion |
| 2 | The collision came at 8:45 am, at about one knot | 8:45 · 1 knot | "At roughly 8:45 am, she collided at low speed, about one knot (1.2 mph; 1.9 km/h), with the unladen Imo" | https://en.wikipedia.org/wiki/Halifax_Explosion |
| 3 | Mont-Blanc was full of TNT, picric acid and benzol | — | "The vessel was fully loaded with the explosives trinitrotoluene (TNT) and picric acid, the highly flammable fuel benzol, and guncotton." | https://en.wikipedia.org/wiki/Halifax_Explosion |
| 4 | About 20 minutes later, at 9:04 am, she exploded | 20 · 9:04 | "Around 20 minutes later at 9:04:35 am, Mont-Blanc exploded." | https://en.wikipedia.org/wiki/Halifax_Explosion |
| 5 | The abandoned ship drifted to Pier 6 while thousands watched | — | "the abandoned ship continued to drift and beached herself at Pier 6 near the foot of Richmond street." · "Thousands of people had stopped to watch the ship burning in the harbour, many from inside buildings, leaving them directly in the path of glass fragments from shattered windows." | https://en.wikipedia.org/wiki/Halifax_Explosion |
| 6 | Dispatcher Vince Coleman telegraphed a warning, stopped the incoming trains and was killed at his post | — | "Ammunition ship afire in harbor making for Pier 6 and will explode." · "Coleman's message was responsible for bringing all incoming trains around Halifax to a halt." · "Coleman was killed at his post." | https://en.wikipedia.org/wiki/Halifax_Explosion |
| 7 | The largest human-made explosion of its time, about 2.9 kilotons | 2.9 | "It released the equivalent energy of roughly 2.9 kilotons of TNT (12 TJ)." · "The blast was the largest human-made explosion at the time." | https://en.wikipedia.org/wiki/Halifax_Explosion |
| 8 | Nearly everything within 800 metres was obliterated | 800 | "Nearly all structures within an 800-metre (2,600 ft) or half-mile radius, including the community of Richmond, were obliterated." | https://en.wikipedia.org/wiki/Halifax_Explosion |
| 9 | At least 1,782 people were killed | 1,782 | "At least 1,782 people, largely in Halifax and Dartmouth, were killed by the blast, debris, fires, or collapsed buildings, and an estimated 9,000 others were injured." | https://en.wikipedia.org/wiki/Halifax_Explosion |
| 10 | Every year since 1971 Nova Scotia sends Boston its Christmas tree | 1971 | "In 1918, Halifax sent a Christmas tree to Boston in thanks and remembrance for the help that the Boston Red Cross and the Massachusetts Public Safety Committee provided immediately after the disaster." · "That gift was revived in 1971 by the Lunenburg County Christmas Tree Producers Association, which began an annual donation of a large tree" · "The tree is Boston's official Christmas tree and is lit on Boston Common throughout the holiday season." | https://en.wikipedia.org/wiki/Halifax_Explosion |

Разброс и осторожность: погибшие — «at least 1,782» (в разделе о разрушениях «more than 1,600 instantly … more than 300 of whom later died») → на экране 1,782 с «at least» в реплике. Спасение 300 пассажиров телеграммой Коулмана статья называет «uncertain» — не утверждаем; утверждаем только, что сообщение остановило поезда, и что он погиб на посту. Метель была на следующий день — снега в кадре взрыва нет.

## Concept
- Настроение: серое декабрьское утро военной гавани — медленно и холодно, потом одна белая вспышка и тишина. Чёрно-белые фотографии 1917 года в стальной синеве, шрифт телеграфа.
- Ключевой цвет: морозная синь зимней воды (#9CC3F0) против бело-серого дыма; янтарь лампы телеграфа — холодный тон бита.
- Look: свой объект `harbour-frost` поверх `abyss` — акцент #9CC3F0 (212°, 27° от abyss, набор текстур другой), текстуры `smoke` (фон, медленно) и `fog` (передний план, слабо); типографика typewriter (телеграф); переход на ударе — `flash` (взрыв); звук: удар deep-boom, свист smoke.
- Голос: ElevenLabs (голос по умолчанию из `.env`).
- Арка: story × stakes-consequence × place × what-remains. Протагонист — Галифакс: двадцать минут город смотрел на горящий корабль и заплатил окнами, северной частью и 1 782 жизнями; что осталось — ёлка благодарности, которую каждую зиму везут в Бостон.

## Media
Поиск — командой `npm run media -- "<запрос>" --n 6 --sheet …` (лист миниатюр с номерами), скачивание — `npm run media -- --get "<файл>" halifax-en --as <имя>` (файл + `license.json`).

| Запрос | Что выбрано и почему |
|---|---|
| «SS Mont-Blanc ship» | `SS Mont Blanc, in 1899.png` — сам корабль в порту (PD); остальное — другие суда «Mont-Blanc» (Женевское озеро) и раскрашенные фото с Flickr |
| «Halifax harbour 1917» | `…looking north from a grain elevator towards Acadia Sugar Refinery, ca. 1900.jpg` — крыши и станция Ричмонд, гавань вдали: тот район, что потом уничтожен; `Halifax Explosion - harbour view - restored.jpg` — он же после взрыва |
| «Halifax Explosion blast cloud» | `Halifax Explosion blast cloud.jpg` — одно из немногих фото самого взрыва, вертикальное (почти 9:16) |
| «Halifax Explosion Richmond devastation» | тот же harbour view (restored), William James |
| «Boston Common Christmas tree» | `2010 Boston Halifax Christmas tree on Boston Common USA 5273771973.jpg` — ёлка из Галифакса на Бостон-Коммон (CC BY-SA 2.0); фото установки ёлки 1929–1955 (DPLA) не взяты: до 1971 года, не доказано, что ёлка из Новой Шотландии |

| Файл | Роль | Что на самом деле | Лицензия |
|---|---|---|---|
| `north-end-1900.jpg` | place | вид на север с элеватора к сахарному заводу Acadia, около 1900 года; даты на экране нет | PD |
| `mont-blanc.png` | evidence | SS Mont-Blanc в порту, 1899; в кадре два парохода — обводка и подпись на всю полосу кораблей, не на один корпус | PD |
| `blast-cloud.jpg` | hero | облако взрыва 6 декабря 1917 года | PD |
| `richmond-ruins.jpg` | evidence | разрушенный Ричмонд, вид к Дартмуту, после 6 декабря 1917 (снег — метель следующего дня) | PD, William James (Toronto) |
| `boston-tree.jpg` | place | ёлка из Галифакса на Бостон-Коммон, 2010 | CC BY-SA 2.0, Louis Oliveira |

## Beats
- 01-watch (hook): Зритель видит крыши и сортировочную станцию Ричмонда с гаванью вдали, на небе отсчитывается «20 MINUTES». → media (place, cover) + data.count 20 тёмным по светлому небу, лёгкий наезд.
- 02-cargo (setup): Зритель видит сам «Монблан»: полоса кораблей выхвачена светом, над фото — подпись и груз. → устройства явно (identify не передаёт сторону подписи): spotlight rect 0,5 + label «SS MONT-BLANC» / «TNT · PICRIC ACID · BENZOL» сверху, в тёмной полосе — на светлом небе фото подпись не читалась (снимок).
- 03-telegraph (turn): Зритель видит, как по одному слову появляется телеграмма Коулмана «Ammunition ship afire in harbor making for Pier 6 and will explode.» → quote-card.
- 04-blast (peak): Зритель видит облако взрыва над гаванью, камера отъезжает и открывает его размер. → reveal на фото облака (evidence), без устройств.
- 05-richmond (aftermath): Зритель видит разрушенный северный Галифакс и число «1,782», которое вырастает над руинами. → media (evidence) + data.count.
- 06-tree (ending): Зритель видит ёлку на Бостон-Коммон — тихий финал без цифр. → quiet-ending.
