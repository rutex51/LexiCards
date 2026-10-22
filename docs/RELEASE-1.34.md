# LexiCards 1.34 – okrąg z punktów, łuk przez trzy punkty, narzędzie „Wymiar”

Wersja 1.34.0, 22 października 2026. Trzecia część przebudowy edytora rysunku – nowe narzędzia z makiety
„Rysunek – nowy interfejs” (wybór pod menu: „Ramka / Środek i R / 2 pkt / 3 pkt”, grupa „Wymiary”) i z planu
po porównaniu z AutoCAD. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Okrąg z punktów, łuk
i narzędzie »Wymiar«”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Okrąg z 2 i 3 punktów (wybór bez osobnego okna) | Przy elipsie pod menu wybór: **Ramka** (jak dotąd), **Środek i R** (przeciągnięcie od środka do okręgu), **2 pkt** (średnica – od punktu do punktu), **3 pkt** (okrąg przez trzy punkty: dotknięcia albo przeciągnięcie od pierwszego do drugiego i dotknięcie trzeciego; mysz nad trzecim pokazuje podgląd, **Esc** – od nowa, trzy punkty na jednej prostej – komunikat, dwa pierwsze zostają). Wybór zapamiętany na urządzeniu. |
| Łuk z 3 punktów | Nowy kształt **Łuk** w grupie „Kształty”: przeciągnij od początku do końca (albo dotknij obu), potem dotknij punktu, przez który ma przejść. Zaznaczony łuk ma trzy punkty (początek, środek łuku, koniec) – przeciągnięcie zmienia łuk; obrót, odbicie, kopia, szyk i rodzaj linii – jak przy innych kształtach. |
| Osobne narzędzie wymiaru (do 1.33 tylko pola przy zaznaczonym kształcie) | Grupa **Wymiary** na prawym kółku (przed Symbolami) i pierwsza pozycja zestawu **Metrologia**. Wybór pod menu: **Liniowy** – przeciągnięcie od punktu do punktu albo dotknięcie krawędzi (odcinka, boku kształtu, ramki); linia wymiarowa staje po stronie dalszej od mierzonego kształtu. **⌀ Średnica** i **R Promień** – dotknięcie okręgu albo łuku (linia w kierunku dotknięcia) albo przeciągnięcie. **Kąt** – wierzchołek, punkt na pierwszym i na drugim ramieniu (mniejszy z kątów, łuk z grotami). |
| (przy okazji) | Końce wymiaru przyciągnięte do kształtu są do niego **przyklejone**: wymiar idzie za przesuwanym albo zmienianym kształtem i pokazuje nową liczbę (promień – przyklejony do środka i do okręgu). Liczba mierzy rysunek w jego skali, jak inne wymiary (mm w stylu technicznym, „Wymiary w mm” w rogu); nie wpisuje się jej – **±** przy liczbie: znak i tolerancja (±, odchyłki, pasowanie), uchwyt: odsunięcie linii wymiarowej, także na drugą stronę. Punkty okręgu, łuku i wymiaru przyciągają się do narożników, krawędzi i – nowe – **środków okręgów i łuków** (znacznik: kółko z krzyżykiem; także końce odcinka i strzałki). Podpowiedź w szarej pastylce mówi, który punkt dotknąć. |

Zestaw Metrologia zapisany na urządzeniu w 1.33 bez zmian dostaje wymiar sam; zmieniony – zostaje taki, jaki
był (wymiar można dodać w oknie „Grupy narzędzi”). Zmienione przy okazji: przy narzędziu „Wymiar” i przy
kształtach z punktów przeciągnięcie zaczęte na zaznaczonym kształcie nie przesuwa go (punkty często leżą na
wspólnym narożniku) – kształty przesuwa się zaznaczaniem.

## Testy, które wykonano

- **Testy logiki (Node.js): 399 – wszystkie zaliczone** (393 wcześniejsze + 6 nowych; 4 wcześniejsze
  dostały nowe oczekiwania: grupa Wymiary, łuk w Kształtach, miejsce brakującej grupy w kolejności): okrąg ze
  środka, z dwóch i trzech punktów, punkty na jednej prostej; łuk – geometria, krzywe Béziera na okręgu, punkt
  pośredni w połowie, zapis, uchwyty, obrys; wymiar liniowy – strona linii wymiarowej, przeciąganie na drugą
  stronę, piętra, dotyk tylko widocznej linii, zapis; średnica i promień – znak, groty; wymiar kąta – mniejszy
  kąt, linie pomocnicze, uchwyty; przyciąganie do środka okręgu i łuku, promień idący za okręgiem; grupy
  i zestaw Metrologia z 1.33, ustawienia narzędzi.
- **Testy w przeglądarce (Chromium): 189 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (186 wcześniejszych + 3 nowe; we wcześniejszych: 9 kształtów w menu, grupa Wymiary w oknie grup, Metrologia
  zaczyna się od wymiaru):
  - komputer: okrąg ze środka, z dwóch punktów (4 cm), z trzech punktów – dotknięcie przy zaznaczeniu tylko je
    zdejmuje, podpowiedzi dla punktów, Esc, przeciągnięcie i podgląd pod myszą, trzy punkty na prostej –
    komunikat, okrąg przez trzy punkty; łuk – półokrąg nad cięciwą (piksele na łuku, nie pod cięciwą); zapis:
    trzy okręgi i łuk z trzema wierzchołkami;
  - komputer: wymiar krawędzi dotknięciem (4 cm, pole tylko do odczytu, bez oka i stylu), od narożnika do
    narożnika (góra – nad prostokątem, dół – pod nim), wysokość (3 cm), średnica okręgu (⌀) i promień (2 cm),
    kąt prosty (90°); prostokąt przesunięty i poszerzony do 5 cm – trzy wymiary idą za nim (końce przyklejone
    do jego narożników), promień przyklejony do środka okręgu;
  - iPhone: rodzaje wymiaru pod menu bez przewijania strony w bok, promień okręgu dotknięciem palca.
- **Lint: bez błędów.**
- Zrzuty (Chromium): podgląd okręgu przez trzy punkty, okręgi i łuk, wymiary na komputerze, wymiar na iPhonie.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy rysik i palce – gesty w testach są udawane w Chromium.
- Wymiary na obrazie rysunku w notatce i w pliku PDF – rysowane tym samym kodem co w edytorze, ale nie
  oglądane w tej wersji.
- Ciemny motyw nowych elementów – nie oglądany.
