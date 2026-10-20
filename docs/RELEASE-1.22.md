# LexiCards 1.22 – rysunek: liniuszek promieniowy, przewracanie kartek kółkiem z animacją, przyciąganie końców do krawędzi i narożników

Wersja 1.22.0, 20 października 2026. Pierwsza część uwag do rysunku z tej paczki. Dalej: 1.22.1 –
wymiarowanie techniczne (linie wymiarowe, przesuwane dymki, tolerancje, pasowania, przełącznik
„50” / „5 cm”) i symbole metrologiczne (ramka tolerancji, bazy, chropowatość) z odnośnikiem
przyciąganym tak jak w tej wersji; potem eksport do kalendarza (.ics). Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (rysunki – „Liniuszek”, „Od 1.22 (format rysunku 7)” i „Przewracanie
kartek”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Liniuszek promieniowy: odległość między okręgami, linie pomocnicze ze środka co wybrany kąt, obrót | W panelu liniuszka wybór **Równoległy / Promieniowy**. Promieniowy: okręgi wokół kółka (środek – przesuwasz go jak dotąd, przyskakuje do węzłów kratki) co **Odstęp okręgów** ¼–6 kratek (opis w kratkach i w skali rysunku, np. „2 kratki · 2 cm”); przełącznik **Promienie ze środka** – przerywane promienie **co** 5°, 10°, 15°, 20°, 30°, 45°, 60° albo 90° (tylko kąty, które dzielą 360° – promienie zamykają koło; obok liczba promieni) z szybkimi 15°, 30°, 45°; **Obrót** −90° do 90° (szybkie 0°, 15°, 45°). Kreska zaczęta przy okręgu i prowadzona wzdłuż niego biegnie dokładnie po łuku, przy promieniu – prosto po promieniu, w innym kierunku – zwykła; długość (łuku) w pigułce „Kreska: …”. Pigułka liniuszka: „Promieniowy · okręgi co 2 cm · promienie co 45°”. Ustawienia zostają na urządzeniu. |
| Kółko góra / dół przewraca kartki, z animacją jak w notatkach, ale z dołu do góry; (z propozycji) na iPadzie przyciski | Przy całej stronie jeden ruch kółka = jedna kartka (w dół – następna, w górę – poprzednia). Małe ruchy gładzika się sumują, a rozpęd po przewróceniu nie przewraca dalej (nowy ruch – po krótkiej przerwie). Powiększoną stronę kółko przesuwa, a na górnym albo dolnym brzegu dalszy ruch przewraca kartkę. Obok **Kartka 2 z 3** – strzałki **‹ ›** (od dwóch kartek; nieczynne na pierwszej i ostatniej). Animacja (pół sekundy, też PageUp, PageDown i menu kartek): następna – kartka unosi się od **dolnej** krawędzi i przechodzi do góry (jasny odwrót, cień przy zgięciu i na kartce pod spodem), poprzednia – opada z góry. Bez animacji, gdy system prosi o ograniczenie ruchu. |
| Precyzyjne dociąganie strzałek do krawędzi lub narożnika – także odcinków i strzałek z kształtów; Alt; co dla iPada i iPhone'a (z propozycji: ok. 3 mm, znacznik, magnes) | Początek i koniec nowego odcinka albo strzałki, przeciągany koniec zaznaczonego i koniec strzałki karteczki przyskakują do **narożnika** (znacznik – kwadracik) albo **krawędzi** (kółko) innego elementu bliżej niż ok. 3 mm (14 punktów ekranu; narożnik ma pierwszeństwo). Przyciągają: kształty (także obwód elipsy, końce i środek odcinka), pola tekstowe, wzory, tabele, karteczki; kreski pióra – nie. Myszą znacznik widać już przy najechaniu. **Alt** – swobodnie. iPad i iPhone: **magnes** „Przyciąganie wł. / wył.” nad zaznaczonym odcinkiem, strzałką albo karteczką ze strzałką i przełącznik w panelu kształtów – to samo ustawienie, zapamiętane na urządzeniu (domyślnie włączone). |
| (z propozycji) przyklejony koniec idzie za kształtem | Przyciągnięty koniec jest **przyklejony**: idzie za elementem przy przesunięciu, zmianie wielkości (narożnikiem albo w polach wymiarów) i obrocie – na krawędzi zostaje w tym samym miejscu boku. Przesunięty sam odcinek odkleja się (razem z elementem – zostaje przyklejony); usunięty element – koniec zostaje na miejscu; kopie (Powiel, Wklej, Szyk) są wolne, chyba że skopiowane razem z elementem. Cofnij przywraca końce razem ze zmianą. |

Szczegóły:

- **Zapis:** rysunek ma format 7 – elementy z identyfikatorem `id` i końce z `attach` (opis
  w ARCHITECTURE.md). Kopia zapasowa przenosi przyklejenia. **Starsza wersja aplikacji** pokaże rysunek
  bez zmian, a przy poprawce rysunku zapisze końce tam, gdzie są – już bez przyklejenia.
- **Kolejne dotknięcie ‹ ›** w trakcie animacji przewraca od razu dalej (poprzednia animacja kończy
  się natychmiast) – szybkie dwa dotknięcia to dwie kartki.
- **Klawisz Alt** w oknie rysunku jest zatrzymywany na stronie (żeby przeglądarka nie przechodziła po
  nim do swojego menu), działa też wciśnięty przed rozpoczęciem przeciągania; gdy okno traci fokus
  (np. Alt+Tab), przytrzymanie się zeruje.

## Testy, które wykonano

- **Testy logiki (Node.js): 332 – wszystkie zaliczone** (328 wcześniejszych, 2 dostosowane do formatu 7
  i nowych ustawień liniuszka, + 4 nowe):
  - liniuszek promieniowy: najbliższy okrąg (przy środku – pierwszy, bez okręgu 0), najbliższy promień
    (także po obrocie o 15°), liczba promieni (co 30° – 12, co 45° – 8), okręgi przecinające stronę
    (środek na środku strony – 22, środek poza stroną – od pierwszego, który sięga strony);
  - ustawienia: rodzaj, odstęp okręgów, promienie, krok tylko z listy, obrót −90…90; złe – domyślne;
    przyciąganie końców zapamiętane;
  - przyciąganie: narożnik ma pierwszeństwo przed bokiem, bok prostokąta (miejsce na boku), obwód
    elipsy, ramka pola tekstowego, poza promieniem – nic, pominięty element;
  - przyklejenie: koniec w nowym narożniku po przesunięciu kształtu (początek bez zmian), miejsce na
    boku po zmianie szerokości, usunięty kształt – przyklejenie znika, podgląd w trakcie przesuwania,
    odklejenie przesuniętego samego, kopie i szyk bez `id` i `attach`, nowy identyfikator; zapis –
    wersja 7, poprawne `id` i przyklejenia zostają, złe pominięte, karteczka – tylko strzałka (idzie za
    kształtem).
- **Testy w przeglądarce (Chromium): 154 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (150 wcześniejszych + 4 nowe):
  - ekran iPada (rysik): liniuszek promieniowy – okręgi co 2 kratki, promienie co 45°, obrót 15°;
    kreska wzdłuż okręgu z drżeniem – w zapisie każdy punkt w odległości 176 od środka (±0,6), kreska
    wzdłuż promienia – każdy punkt pod kątem 30° (±0,3°), ukośna – zwykła; bez promieni – pigułka bez
    nich; po wyłączeniu i włączeniu liniuszka ustawienia te same;
  - ekran komputera (mysz): prostokąt; strzałka do lewego górnego narożnika (koniec 6 i 5 jednostek
    obok) – w narożniku, ze znacznikiem w trakcie; strzałka z **Alt** – koniec przy kursorze; odcinek
    do prawej krawędzi – na krawędzi; prostokąt przesunięty dwa razy – przyklejone końce idą za nim
    (dokładnie w narożniku i na krawędzi w tym samym miejscu); Cofnij – prostokąt i końce wracają
    razem, Ponów – znów za prostokątem; magnes wyłączony nad odcinkiem –
    przełącznik w panelu kształtów też wyłączony, strzałka obok narożnika zostaje obok; włączony
    z panelu; strzałka do prawego dolnego narożnika przesunięta sama – odklejona, przy drugim przesunięciu
    prostokąta zostaje; w zapisie `id` prostokąta i `attach` tylko przy przyklejonych;
  - ekran komputera: trzy kartki; kółko w górę – kartka 2 z animacją (płótno animacji pokazane
    i schowane); jeden ruch kółka (6 zdarzeń co 40 ms) – tylko jedna kartka; mały ruch (20) – bez
    zmiany; ‹ dwa razy – kartka 1, „‹” nieczynne; › – kartka 2; „›” nieczynne na ostatniej; po
    powiększeniu (Ctrl + kółko) kółko przesuwa stronę, kartka ta sama; z ograniczeniem ruchu
    (`prefers-reduced-motion`) PageUp zmienia kartkę bez animacji;
  - ekran telefonu: dwie kartki – „‹ Kartka 2 z 2 ›” w jednym wierszu w szerokości 390 px, bez
    przewijania w bok; dotknięcia ‹ i › przewracają kartki (drugie zaraz po pierwszym – w trakcie
    animacji).
  - **Błędy znalezione testami:** napis magnesu nie zmieniał się po dotknięciu (komunikat mówił
    „wyłączone”, a przycisk – „wł.”) – teraz zmienia się od razu; na telefonie drugie dotknięcie ›
    w trakcie animacji było pomijane – teraz przewraca dalej.
- Sprawdzenia robocze (poza zestawem testów, Chromium): klatki animacji złożone z płótna strony
  i płótna animacji w trakcie przewracania w obie strony (w przód – zgięcie idzie od dołu do góry,
  wstecz – nowa kartka opada z góry); **błąd znaleziony:** pierwsza klatka była pusta – przez chwilę
  widać było już nową kartkę; teraz pierwsza klatka rysuje się od razu.
- **Lint: bez błędów.**
- Zrzuty (Chromium): panel liniuszka promieniowego i kreski na nim (iPad), znacznik narożnika przy
  strzałce, końce za przesuniętym prostokątem (komputer), przewracanie kartki w połowie (komputer),
  „‹ Kartka 2 z 2 ›” (telefon).

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** – testy działają w Chromium z ekranem telefonu i iPada, nie w Safari
  na iOS. Do sprawdzenia u Ciebie: rysikiem – kreska po łuku liniuszka promieniowego, przyciąganie
  końca strzałki (czy ok. 3 mm to dobra odległość pod rysikiem i palcem), magnes; płynność animacji
  przewracania na iPadzie.
- **Prawdziwa mysz z kółkiem i gładzik na Windows** – w testach kółko daje 100 jednostek na ząbek;
  gładzik i myszy z płynnym przewijaniem dają wiele małych zdarzeń z rozpędem – aplikacja je sumuje
  i po przewróceniu kartki czeka na przerwę, ale na prawdziwym sprzęcie nie było to sprawdzane. Gdyby
  jeden ruch gładzika przewracał dwie kartki albo żadnej – daj znać.
- **Alt w Edge na Windows** – w Chromium testów Alt nie otwiera menu; zachowanie paska menu w Edge
  przy samym Alt (bez innego klawisza) nie było sprawdzane na prawdziwym Windows.
- **Płynność animacji** – w Chromium bez karty graficznej klatki są rzadkie (co ok. 50–200 ms),
  więc oceniłem tylko poszczególne klatki, nie płynność.
