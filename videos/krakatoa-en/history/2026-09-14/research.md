# Krakatoa 1883 — исследование

Прогон навыка `/short "Krakatoa 1883"` (ночная сессия 14.09.2026). Тексты статей взяты через Wikipedia API 14.09.2026.

| # | Факт (EN, как на экране) | Цифра | Цитата из источника | Ссылка |
|---|---|---|---|---|
| 1 | Heard 4,800 km away | 4800 | "The explosion was heard 3,110 kilometres (1,930 mi) away in Perth, Western Australia, and Rodrigues near Mauritius, 4,800 kilometres (3,000 mi) away." | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |
| 2 | The loudest sound in history | — | "…remains the loudest-known sound in history." | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |
| 3 | 27 August 1883 | 27, 1883 | "On 27 August, the island had its most significant eruption, which destroyed over 70% of the island" | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |
| 4 | Between Java and Sumatra, Sunda Strait | — | "Krakatoa … is a caldera in the Sunda Strait between the islands of Java and Sumatra" | https://en.wikipedia.org/wiki/Krakatoa |
| 5 | More than 36,000 dead, mostly from tsunamis | 36000 | "At least 36,417 people died, and many more thousands were injured, mostly from the tsunamis that followed the explosion." | https://en.wikipedia.org/wiki/Krakatoa |
| 6 | Tsunamis over 30 m high | 30 | "The worst of the many tsunamis that resulted were estimated to have been over 30 m (100 ft) high in places." | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |
| 7 | 165 villages and towns destroyed | 165 | "165 villages and towns were destroyed near Krakatoa, and 132 were seriously damaged." | https://en.wikipedia.org/wiki/Krakatoa |
| 8 | Pressure wave circled the globe, still recorded 5 days later | — | "These air waves circled the globe several times and were still detectable on barographs five days later." | https://en.wikipedia.org/wiki/1883_eruption_of_Krakatoa |
| 9 | Two thirds of the island destroyed | 2/3 | "The eruption destroyed two-thirds of the island of Krakatoa." | https://en.wikipedia.org/wiki/Krakatoa |
| 10 | Lithograph, Parker & Coward, 1888 | 1888 | Plate 1, Report of the Krakatoa Committee of the Royal Society; public domain | https://commons.wikimedia.org/wiki/File:Krakatoa_eruption_lithograph.jpg |

Осторожно: оценки числа погибших в других источниках доходят до 120 000 — на экране «more than 36,000» (нижняя, официальная цифра). Мелкие острова Кракатау на силуэте Natural Earth 1:50m не видны — метка стоит на координате 6.102 S 105.423 E.

Карта: `engine/assets/maps/sunda-strait.svg` — Natural Earth 50m, коробка lon 103.5…107.64, lat −7.9…−4.3; Кракатау → x 506, y 570.

## Concept
- Настроение: тревога вулканической грозы — серо-зелёная мгла, дым тянется через кадр, молнии в пепловой туче бьют на словах, камера в руке вздрагивает на ударах.
- Ключевой цвет темы: сернисто-лимонный свет молний на серо-зелёной земле; огонь Помпей (ember) уже занят, а у Krakatoa главная сила — звук, волна давления и туча.
- Look: `storm` — акцент 68°, текстуры smoke и ash; холодный secondary (фиолетово-голубой) — на бите цунами.
- Картинки: 1) литография извержения, Parker & Coward, 1888 (отчёт Royal Society, Wikimedia Commons, public domain) — дуотоном фоном «1883» и крупно в `picture-zoom`.
- Текстуры: весь ролик — дым (bg) и серый пепел (fg); хук и «1883» — по одной молнии на «loudest» и «blast»; волна — косой дождь и ветер, они заполняют пустой кадр шкалы.
- Motion: камера handheld 0,9 с тряской 0,8 на ударах (волна — 1,3 и 1,2, финал — push-in); типографика — число stagger, заголовок split-reveal, подпись slide; «TSUNAMI» — split-reveal, отсчёт — count-roll; пост — flicker 0,35 на весь ролик, chromatic на ударах.
- Переходы: на тяжёлом ударе (карта) — smoke-wipe; в картину — whip, в финал — smoke-wipe.
