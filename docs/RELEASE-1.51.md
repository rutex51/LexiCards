# LexiCards 1.51 – scena 3D do oglądania

Wersja 1.51.0, 26 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Scena 3D”).

Drugi etap planu „Wspólny układ osi, pełna scena 3D” (po 1.50 – układ współrzędnych arkusza): kartka i bryły w jednej
przestrzeni, oglądane wspólną kamerą. Scena jest tylko do oglądania – położenie brył w przestrzeni (X, Y, Z, obrót) to
następny etap (1.52).

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Scena 3D** | Gdy na kartce są bryły, po prawej na dole jest przycisk **Scena 3D**. Interfejs 2D chowa się, a kartka staje się płaszczyzną w układzie arkusza (X w prawo, Y w górę kartki, Z do góry) z całą treścią 2D: kreskami, kształtami, napisami, ramką z tabliczką. |
| Bryły w scenie | Stoją prosto na kartce, w miejscu swoich obrazków (środek nad środkiem obrazka), osiami wzdłuż osi arkusza. Widok obrazka w 2D (np. „Przód” albo obrót „Obracaj”) dotyczy tylko obrazka – w scenie bryłę pokazuje wspólna kamera. W izometrii sceny bryła wygląda tak samo jak jej obrazek w izometrii. |
| **Obrót i przybliżanie** | Przeciągnięcie (mysz, palec, rysik) obraca całą scenę: w bok – wokół osi Z, w górę i w dół – wysokość kamery od poziomu kartki do widoku z góry (kartka nigdy od spodu – napisy nie w lustrze). Kółko myszy i dwa palce przybliżają; dwa palce też przesuwają, myszą – z Shift albo środkowym przyciskiem. |
| **Widoki** | Pasek u góry: **2D** (powrót do kartki; też Esc), **Izometria**, **Przód** (od −Y), **Prawy bok**, **Lewy bok**, **Tył**, **Góra**, **Cała** (bez przybliżenia i przesunięcia). Przejście płynne, gotowy widok pokazuje całą scenę. |
| **Same krawędzie w ruchu** | W trakcie obracania, przybliżania i przejścia do widoku bryły są rysowane samymi krawędziami – bez krycia i cieniowania (także krawędzie z tyłu), kartka z gotowego obrazu; po puszczeniu (przy kółku – chwilę po ostatnim obrocie) wraca pełny obraz. Pastylka w lewym dolnym rogu pokazuje, że to ruch. |
| Pełny obraz | Kartka rysowana wektorowo (ostra przy przybliżeniu), bryły cieniowane, z krawędziami niewidocznymi jak w ich ustawieniach, od najdalszej – zasłaniają się nawzajem; osie układu arkusza w początku układu (tylko wskaźnik). |
| **Zaznaczanie** | Dotknięcie bryły zaznacza ją (niebieska, nazwa w lewym dolnym rogu), dotknięcie obok – bez zaznaczenia. Po powrocie do 2D bryła zostaje zaznaczona; zaznaczona w 2D jest zaznaczona w scenie. |

## Jak to działa (w skrócie)

- Moduł `js/core/scene.js`: kamera (azymut, wysokość), bryły na kartce, granice sceny, rzut i przekształcenie płaszczyzny
  kartki. Rzut równoległy płaszczyzny jest przekształceniem liniowym, więc treść kartki rysuje się zwykłym rysowaniem 2D
  w przekształconym płótnie – bez osobnego silnika 3D.
- Wszystkie bryły stoją tak samo, więc jedno położenie (kwaternion) dla całej sceny; w gotowych widokach równe położeniu
  widoku bryły – rysowanie brył (krawędzie niewidoczne, cieniowanie, bufor głębokości brył ze szkicu) jest to samo co w 2D.
- Rysunek się nie zmienia (format 22 jak w 1.50); scena nie zapisuje się z rysunkiem – edytor otwiera się w 2D.

## Własność intelektualna

Rzut równoległy sceny, obrót kamery przeciąganiem, gotowe widoki i rysowanie samymi krawędziami w ruchu to ogólne techniki
grafiki komputerowej i programów CAD znane od dziesięcioleci; kod własny, bez bibliotek 3D. Widoki wybiera się zwykłymi
przyciskami z nazwami, a osie w początku układu są tylko wskaźnikiem (bez dotykania i przeciągania) – bez „kostki widoków”
i bez wskaźnika, który obraca scenę (zob. audyt IP, P-01 i P-03). Nazwy w interfejsie opisowe („Scena 3D”, „Cała”, nazwy
widoków).

## Testy, które wykonano

- **Testy logiki (Node.js): 506 – wszystkie zaliczone** (4 nowe):
  - kamera: przód od −Y (X w prawo, Z w górę), góra (X w prawo, Y w górę), izometria od +X, −Y, +Z; w każdym z sześciu
    gotowych widoków położenie bryły w scenie = położenie tego widoku bryły (izometria, przód, góra, boki, tył);
  - bryły na kartce: prostopadłościan, walec, kula, wyciągnięcie ze szkicu – podstawa w Z = 0, środek nad środkiem
    obrazka, zasięg w X, Y, Z; kreska pióra pominięta; granice sceny (kartka i najwyższa bryła);
  - przekształcenie kartki zgodne z rzutem punktów w czterech kamerach (z przybliżeniem i przesunięciem), bez lustra;
    skala „cała scena” z góry (kartka 1600 × 1100 w obszarze 1000 × 740 z marginesem 0,9); środek sceny w środku obszaru;
    kolejność rysowania w izometrii;
  - obrót przeciągnięciem (kierunki, wysokość 0–90°, azymut przez ±180°), gotowy widok w kamerze, przejście najkrótszą drogą.
- **Testy w przeglądarce (Chromium): 233 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe):
  - komputer: bez brył – bez „Scena 3D”; prostokąt na kartce, prostopadłościan przesunięty w lewo, walec; scena –
    izometria, interfejs 2D schowany, dwie bryły (prostopadłościan na lewo od walca), ściany cieniowane (piksel w środku
    bryły ciemniejszy); przeciąganie bez puszczenia – ruch, poza gotowym widokiem, w środku bryły jasno (bez krycia
    i cieniowania); po puszczeniu – znów cieniowana; kółko myszy – ruch i powrót pełnego obrazu; „Przód” – X w prawo, Z
    w górę, Y od patrzącego, środek walca wyżej; „Góra” – X w prawo, Y w górę; „Izometria”; dotknięcie prostopadłościanu
    – zaznaczony i nazwa, dotknięcie obok – bez zaznaczenia, walec – zaznaczony; Esc – kartka 2D z zaznaczonym walcem;
    znów scena – walec zaznaczony; „2D” – powrót, edytor otwarty;
  - iPad (dotyk): stożek, „Scena 3D” palcem, obrót jednym palcem – ruch, po puszczeniu pełny obraz, dotknięcie stożka –
    zaznaczony; dwa palce rozsuwane – ruch, po puszczeniu pełny obraz, stożek ponad dwa razy dalej od początku układu;
  - telefon (390 px): „Scena 3D” na ekranie, „2D”, „Izometria”, „Przód” w szerokości ekranu, bez przewijania strony w bok,
    „Góra” po przewinięciu paska, powrót „2D”.
- **Lint: bez błędów.**
- Zrzuty (Chromium): izometria, obrót – same krawędzie, po puszczeniu, przód, góra, zaznaczenie, iPad (palec, zaznaczenie),
  telefon.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec i dwa palce – dotyk udawany zdarzeniami Chromium. Przesuwanie sceny
  dwoma palcami i myszą (Shift, środkowy przycisk) – bez testu w przeglądarce.
- **Szybkość na prawdziwym iPadzie** – pełny obraz po puszczeniu liczy krawędzie niewidoczne wszystkich brył; przy wielu
  bryłach ze szkicu może chwilę trwać (w ruchu – same krawędzie, bez tego liczenia).
- Bryły stoją zawsze prosto, w miejscu obrazków – położenie X, Y, Z i obrót wokół Z (także bryła na bryle) – w 1.52.
  Bryła obrotowa leży wzdłuż osi X (jej oś to X bryły).
- Zasłanianie brył – kolejnością rysowania (od najdalszej): bryły przenikające się albo bardzo bliskie mogą się zasłaniać
  niedokładnie.
- Bryły w szyku – w scenie jako obrazki na kartce (płasko). Wymiary brył w scenie – bez (są na obrazkach w 2D).
- W ruchu kartka z gotowego obrazu – cienkie linie mogą migotać; po puszczeniu – ostre.
- Ciemny motyw.
