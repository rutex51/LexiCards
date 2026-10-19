# LexiCards 1.4 – kartki zaginane od rogu, dwie strony obok siebie, fiszki bliżej siebie

Wersja 1.4.0, 19 października 2026. Kartka notatki zagina się od miejsca, za które ją chwycisz,
z odwrotem, przez który prześwituje tekst, i z cieniami. Na komputerze notatka leży jak otwarta
książka – dwie strony obok siebie. Fiszki w stosie leżą bliżej siebie. Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (sekcje „Notatka w stronach” i „Nauka z fiszkami”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Zaginanie od chwyconego rogu: dolny róg – zagina się dół, górny – góra, środek krawędzi – prosto, pionowo | Chwyt zależy od wysokości dotknięcia: górne 30% strony – górny róg, dolne 30% – dolny róg, środek – krawędź. Róg kartki idzie za palcem, a zgięcie przebiega w poprzek, w połowie drogi między rogiem a palcem. Przy chwycie krawędzi róg porusza się tylko w poziomie, więc zgięcie jest zawsze pionowe. Dolny róg unosi się w trakcie ruchu lekko w górę, górny w dół – zginanie od rogu widać także przy poziomym ruchu palca |
| Cofanie tak samo od lewej krawędzi | Ruch palca w prawo przywraca poprzednią kartkę: wraca spoza lewej krawędzi, zgięcie idzie za palcem, róg według wysokości dotknięcia |
| Kartka nie odrywa się od grzbietu | Papier się nie rozciąga: róg nie może być dalej od końców grzbietu niż na płaskiej kartce, dolny róg nie schodzi poniżej strony, górny nad nią. Grzbiet zawsze leży płasko, nawet gdy palec ucieknie daleko |
| Przyciski i strzałki przewracają od dolnego rogu | ‹ ›, ←/→ i Page Up/Down prowadzą róg łukiem od dolnego rogu do przewróconej kartki (ok. 0,7 s); Home/End – bez animacji |
| Odwrót kartki: lustrzane, wyblakłe odbicie tekstu | Zagięta część pokazuje odwrót tej samej strony – tekst w lustrze, wyblakły (przezroczystość 0,2), na lekko szarym papierze |
| Więcej cienia w trzech miejscach | 1) na płaskiej części strony przy zgięciu, 2) na płacie jasny pas przy zgięciu udający zaokrąglenie papieru (dalej płat lekko ciemnieje), 3) miękki cień rzucany na stronę pod spodem – szerszy i mocniejszy, gdy kartka się unosi, znika, gdy leży płasko. Do tego delikatny cień pod samym płatem |
| Opcja dwustronicowa w przeglądarce, jak książka | Gdy okno ma co najmniej 960 × 520 px, notatka leży jak otwarta książka: dwie strony obok siebie (okno szersze, do 1280 px), cień grzbietu pośrodku, wskaźnik „3–4 z 7”. Prawa strona przewraca się przez grzbiet tak samo – zaginana od rogu – a na jej odwrocie jest następna strona, która po przewróceniu leży po lewej. Wstecz – lewa strona wraca na prawo. Przycisk z otwartą książką obok numeru strony przełącza jedną i dwie strony; wybór jest zapamiętany (w ustawieniach i kopii zapasowej). Na telefonie przycisku nie ma |
| Myszą (Windows) | Kartkę chwyta się za narożnik strony (kursor zmienia się w dłoń) i przeciąga; kliknięcie narożnika przewraca kartkę. Przeciąganie w tekście nadal zaznacza tekst |
| Usunąć stos pod notatką | Pod stroną notatki nie ma już wystającej kolejnej strony |
| Stos fiszek: mniejszy odstęp w pionie | Fiszki pod spodem wystają o 4 i 7 px zamiast 6 i 11 px; miejsce pod stosem 5 px zamiast 7 |
| „Utrwalane” / „Utrwalone” w szczegółach pojęcia | Bez zmian, zgodnie z prośbą |
| Lepsza synteza mowy | Odłożona |

## Poprawione przy okazji (błędy z 1.3)

- **Na komputerze strony notatki mogły być za długie** (tekst przycięty u dołu strony). Okno
  notatki pojawia się z animacją powiększenia od 96%, a podział na strony liczył się w trakcie tej
  animacji, więc mierzone wysokości były zaniżone. Teraz pomiar jest przeliczany przez to
  powiększenie. Na telefonie okno wysuwa się bez powiększenia, więc tam błędu nie było.
- **Notatka zaczynająca się długim akapitem otwierała się na dalszej stronie** – na ostatniej
  części tego akapitu (np. strona 3 z 4) zamiast na pierwszej. Teraz otwiera się na stronie 1,
  a po zmianie wielkości okna wraca na pierwszą stronę z tym samym miejscem treści.

## Testy, które wykonano

- **Testy logiki (Node.js): 230 – wszystkie zaliczone** (223 wcześniejsze + 7 nowych, geometria
  kartki): chwyt według wysokości, przycięcie strony prostą (pola części), odbicie płata (punkty
  zgięcia zostają, lustro, dwukrotne odbicie), zgięcie z dolnego i górnego rogu i pionowe z krawędzi,
  ograniczenia papieru (grzbiet płasko przy dowolnym położeniu palca, róg nie wychodzi za stronę),
  droga rogu przy przewracaniu przyciskiem.
- **Testy w przeglądarce (Chromium, ekran telefonu i komputera): 91 – wszystkie zaliczone
  w dwóch przebiegach** (89 wcześniejszych + 2 nowe; 1 wcześniejszy test notatek dostosowany do
  zaginania, test stosu fiszek uzupełniony):
  - zaginanie palcem: dolny róg (zagięty dół, górny róg i grzbiet płasko, pod spodem następna
    strona), odwrót w lustrze z tekstem tej samej strony i wyblakły, trzy cienie, cień rzucany
    rośnie z uniesieniem, palec daleko poza stroną – grzbiet nadal płasko, powrót kartki; górny
    róg; środek krawędzi – zgięcie pionowe mimo ukośnego ruchu; wstecz od lewej krawędzi;
    przycisk – zagięty dolny róg; po przewróceniu nie zostają warstwy; brak stosu pod stroną;
  - notatka zaczynająca się długim akapitem otwiera się na stronie 1;
  - dwie strony (ekran 1280 × 800): strony obok siebie, tej samej wielkości, każda mieści się bez
    przewijania; przycisk – na odwrocie przewracanej prawej strony jest strona 3 (czytelna, nie
    w lustrze); mysz za prawy dolny i lewy górny narożnik; przeciąganie w tekście zaznacza tekst;
    End i Home, pusta kartka przy nieparzystej liczbie stron; przełącznik – jedna strona, wybór
    zapisany i zachowany po ponownym otwarciu;
  - stos fiszek: następna fiszka wystaje 3–5 px.
- **Lint (ESLint): bez błędów.**
- Zrzuty ekranu (Chromium): telefon – dolny róg (początek i dalej), górny róg, środek krawędzi,
  wstecz, ciemny motyw; komputer – dwie strony w spoczynku, przewracanie myszą i przyciskiem,
  wstecz od górnego rogu, jedna strona po przełączeniu; stos fiszek przed i po.

## Czego nie sprawdzono

- **Na iPhonie** – testy działają w Chromium z ekranem telefonu, nie w Safari na iOS. Do
  sprawdzenia u Ciebie: płynność zaginania (każda klatka przelicza przycięcie strony i cień pod
  płatem – na starszym telefonie może być mniej płynnie), wygląd cieni i odwrotu, czy chwyt za
  róg i za środek krawędzi działa tak, jak się spodziewasz.
- **Na Windows** – tryb dwustronicowy i mysz sprawdzone w Chromium sterowanym przez Playwright,
  nie w Twojej przeglądarce i nie prawdziwą myszą.

## Warto wiedzieć

- Zgięcie jest płaskie (jak złożona kartka), nie wygięte jak walec – zaokrąglenie udaje jasny pas
  przy zgięciu. Prawdziwe wygięcie tekstu wymagałoby zamiany strony na obraz.
- Zagięty płat nie wychodzi poza obrys książki: na telefonie kartka znika za lewą krawędzią,
  a przy mocno uniesionym rogu górna krawędź płata zostaje na wysokości stron.
- W trybie dwustronicowym na odwrocie przewracanej kartki jest następna strona, jak w prawdziwej
  książce – prześwitujący lustrzany tekst jest w trybie jednej strony (na telefonie).
- Narożnik do chwytania myszą ma 48 px; tekst zaczynający się w samym narożniku zaznaczysz,
  zaczynając przeciąganie kawałek dalej.
- Przy ograniczonym ruchu w systemie strony zmieniają się od razu, bez zaginania.
