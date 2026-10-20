# LexiCards 1.15 – jasność tła, szablon (kalka), liniuszek, kształty geometryczne

Wersja 1.15.0, 20 października 2026. Dalszy ciąg etapu 1 rysunków: jasność kratki i linii, szablon
pod kreskami (wbudowane boisko piłkarskie albo obraz z pliku), liniuszek z przyciąganiem kreski
i kształty geometryczne poprawiane punktami konstrukcyjnymi. Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Treść notatki” – „rysunki”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Kilkustopniowa jasność kratek i linii | Przycisk **Tło** na pasku otwiera panel **Tło strony**: rodzaj (Gładkie, Linie, Kratka) i **Jasność linii** w pięciu stopniach – od bardzo jasnych do bardzo ciemnych (próbki kratki). Domyślnie – jak dotąd. Jasność jest zapisana w rysunku i widać ją w obrazie w notatce |
| Własna kalka – dowolny szablon kresek | W tym samym panelu **Szablon pod kreskami (kalka)**: **Z pliku…** (PNG, JPEG, WebP, GIF – np. zrzut albo skan wzoru) albo **Boisko piłkarskie**. Szablon leży pod kreskami, biel obrazu znika (obraz jest mnożony z tłem), więc kratka pod spodem zostaje widoczna |
| Przy imporcie: pomniejszenie, powiększenie, autodopasowanie, wyśrodkowanie | Po wstawieniu panel **…: wielkość i miejsce**: **−** i **+** (po 10%, wielkość w procentach względem dopasowania), **Dopasuj** (cała strona z marginesem kratki, w proporcjach szablonu), **Wyśrodkuj**; przeciągnięcie na stronie (palcem, rysikiem, myszą) przesuwa szablon, dwa palce nadal powiększają stronę. **Gotowe** zatwierdza, **Anuluj** przywraca stan sprzed ustawiania |
| Kilkustopniowa jasność szablonu | **Jasność szablonu** – pięć stopni (krycie od 14% do 100%), przy ustawianiu i później |
| Szablon boiska na pierwsze testy | **Boisko piłkarskie** według przepisów 105 × 68 m: linie boczne i bramkowe, linia środkowa, koło środkowe, pola karne i bramkowe, punkty karne, łuki pól karnych, łuki rożne, bramki. Przy ustawianiu przełącznik **Skala rysunku według boiska** – 1 kratka = tyle metrów, ile wynika z wielkości boiska (np. 3,06 m), więc linijka mierzy boisko w metrach; na rysunku z domyślną skalą jest włączony |
| Raz zaimportowany szablon nie porusza się i działa jak kratka | Po **Gotowe** szablon jest częścią tła: przeciągnięcie rysuje, a nie przesuwa. Zmiana – **Tło → Ustaw wielkość i miejsce** albo **Usuń szablon** |
| Liniuszek – wiele równoległych linii, do których dociąga się pióro | Przycisk **liniuszek** (obok linijki) pokazuje linie przez całą stronę. Kreska zaczęta przy linii (do 12 px) i prowadzona wzdłuż niej (do 20°) od razu leży na linii, prosto – także jej pierwsze milimetry; kreska w innym kierunku jest zwykła. Pigułka „Kreska: …” podaje długość w skali rysunku. Kółko na stronie przesuwa liniuszek (przyskakuje do węzłów kratki) |
| Linie poprzeczne i regulacja kąta nachylenia | Pigułka „Liniuszek …” otwiera ustawienia: **Odstęp linii** (od ¼ do 6 kratek, z długością w skali), **Kąt linii** (−90° do 90°, szybko 0°, 45°, 90°), **Linie poprzeczne** – odstęp wzdłuż linii i **kąt względem linii** (10°–170°, szybko 60°, 75°, 90°), np. pochylone linie do pisma. Przyciąganie działa też na poprzecznych; można je wyłączyć. Liniuszek nie trafia do rysunku |
| Kształty geometryczne, punkty konstrukcyjne: szerokość, wysokość, pochylenie | Narzędzie **kształty** (ikona wybranego kształtu): **Odcinek, Strzałka, Prostokąt, Elipsa, Trójkąt, Romb, Trapez**. Przeciągnięcie tworzy kształt w prostokącie przeciągnięcia (prawie równe boki – kwadrat, koło; odcinek – kąt co 45° przyciągany), dotknięcie – kształt domyślnej wielkości. Zaznaczony kształt ma punkty: **narożniki** (szerokość i wysokość, przeciwny narożnik zostaje), **środki boków** (jeden wymiar), **romb na górnej krawędzi** – pochylenie (prostokąt staje się równoległobokiem, elipsa – pochyloną elipsą), **kółko nad kształtem** – obrót (co 15° lekko przyskakuje), **pomarańczowy punkt** – wierzchołek trójkąta (np. trójkąt prostokątny) albo wcięcie trapezu; odcinek i strzałka – dwa końce |

Szczegóły:

- **Kształty jak inne elementy:** kolor i grubość pióra; zaznaczanie prostokątem i lassem (tylko
  w całości), dotknięcie linii albo pustego środka kształtu, przesuwanie, kopiuj, wklej, powiel,
  usuń, cofnij i ponów każdej zmiany punktu. Gumka **Całe kreski** usuwa kształt, gumka
  **Fragmenty** go nie przecina. Zero linijki przyciąga się także do boków i narożników kształtów.
  Przy narzędziu kształtów dotknięcie obok zaznaczonego kształtu tylko zdejmuje zaznaczenie.
- **Zapis:** rysunek ma teraz format 3 (kształty, jasność tła, szablon). Szablon z pliku zapisuje
  się z rysunkiem, a w kopii zapasowej (plik obrazów i załączników) jako osobny plik
  `rysunki/<id>-szablon.png`; boisko rysuje aplikacja (bez pliku). Starsza wersja aplikacji pokaże
  obraz rysunku, ale przy jego poprawianiu pominie kształty i szablon.
- **Telefon:** na pasku doszły dwa przyciski (kształty, liniuszek), a napis tła jest krótszy („Tło”) –
  pasek pióra, kształtów i zaznaczania nadal ma najwyżej trzy wiersze.
- **Na zdjęciu** (Rysuj na zdjęciu) tłem jest zdjęcie – bez kratki i bez szablonu, jak dotąd.

## Testy, które wykonano

- **Testy logiki (Node.js): 292 – wszystkie zaliczone** (285 wcześniejszych + 7 nowych):
  - kształty: punkty z pochyleniem i obrotem, obrys, granice, trafienie linii (środek pustego
    prostokąta – nie), wnętrze, elipsa, trójkąt prostokątny, grot strzałki; tworzenie
    przeciągnięciem (w lewo i w górę, prawie koło – koło, odcinek przyciągnięty do poziomu),
    dotknięcie – domyślna wielkość;
  - punkty konstrukcyjne: narożnik (wymiary, przeciwny narożnik na miejscu – także przy
    pochyleniu), bok, najmniejsza wielkość bez odwracania, pochylenie (dolna krawędź na miejscu,
    blisko zera – zero), obrót (90°, 16° → 15°), wierzchołek trójkąta i wcięcie trapezu, końce
    odcinka z przyciąganiem 45°;
  - kształty w rysunku: sprawdzanie danych (zły rodzaj, liczby, kolor; ograniczenia), zaznaczanie
    prostokątem i lassem, brak cięcia fragmentu, dotknięcie, gumka fragmentów, przesunięcie,
    przyciąganie zera linijki do narożnika i boku;
  - liniuszek: najbliższa linia (także pochylona), linie przecinające stronę, ustawienia;
  - tło: poziomy jasności, boisko (proporcje, metry na kratkę), dopasowanie, pomniejszanie wokół
    środka, wyśrodkowanie, wysoki obraz, sprawdzanie szablonu;
  - kopia zapasowa: kształt, jasność i szablon z pliku (osobny plik w ZIP) wracają bez zmian,
    boisko bez pliku.
- **Testy w przeglądarce (Chromium): 128 – wszystkie zaliczone w dwóch pełnych przebiegach** (125 wcześniejszych + 3 nowe; test tła
  z wersji 1.12 poprawiony – tło wybiera się teraz w panelu, a test telefonu sprawdza też pasek
  kształtów). Nowe testy, ekran iPada:
  - tło i szablon: kratka bardzo jasna jaśniejsza od domyślnej, a ta od bardzo ciemnej (piksele);
    boisko – 100%, skala w metrach, −/+ (91%, 110%), **Dopasuj** (100%), przeciągnięcie przesuwa
    linię środkową o 0,1 szerokości, **Wyśrodkuj**, jasność 5, **Gotowe**; potem przeciągnięcie
    rysuje kreskę, a boisko zostaje; szablon z pliku PNG (krzyż) w drugim rysunku – widoczny na
    środku; zapis: jasność 0, boisko (poziom 4, szerokość 1512), skala 3,06 m, obraz szablonu
    zapisany z rysunkiem;
  - liniuszek: kreska z drżeniem wzdłuż linii – jedno y, na linii przez węzeł kratki; ukośna – zwykła;
    pionowa przy liniach poprzecznych – jedno x; kąt 45° – x + y stałe; kółko przesunięte o 15 px –
    kreska na przesuniętej linii; kółko nie rysuje; długość w pigułce;
  - kształty: panel siedmiu kształtów, prostokąt przeciągnięciem (boki, pusty środek), narożnik,
    pochylenie i obrót o 90° (proporcje, pochylenie i kąt w zapisie; cofnij i ponów), dotknięcie obok –
    tylko odznaczenie, trójkąt dotknięciem (176 × 132) z wierzchołkiem nad lewym narożnikiem, odcinek
    prawie poziomy – poziomy, dotknięcie środka trójkąta – „Trójkąt”, gumka usuwa odcinek, cofnij.
- **Lint: bez błędów.**
- Zrzuty (Chromium, iPad): panel tła z jasnością, boisko przy ustawianiu i po „Gotowe”, liniuszek
  gęsty z poprzecznymi i co kratkę z poprzecznymi pod 75° (z panelem), panel kształtów,
  równoległobok z punktami konstrukcyjnymi.

## Czego nie sprawdzono

- **Safari na iPadzie i iPhonie** – testy działają w Chromium z ekranem iPada (dotyk i rysik
  udawane), nie w Safari na iOS. Do sprawdzenia u Ciebie: wybór pliku szablonu z Plików albo
  Zdjęć, przeciąganie punktów kształtu Apple Pencil (czy punkty są dość duże), wyczucie
  przyciągania do liniuszka przy szybkim pisaniu (próg 12 px i 20°).
- **Windows z rysikiem** – nie sprawdzano.
- Szablony **SVG i PDF** – nieobsługiwane (jak obrazy notatki); trzeba je zapisać jako PNG albo JPEG.
- Dociąganie kresek i kształtów do linii kratki oraz zamiana odręcznych kształtów na figury – nadal
  etap 2.
