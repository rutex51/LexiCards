# LexiCards 1.17 – wycinek, „Osadź”, wymiary z klawiatury, wypełnienie i tekst kształtu

Wersja 1.17.0, 20 października 2026. Uwagi do trybu rysowania: wycinek ekranu przy zaznaczaniu
prostokątem i lassem, polecenie **Osadź** (fragment rysunku jako obraz notatki), wymiary i kąt
pochylenia kształtu wpisywane z klawiatury w polach przy jego ramce, wypełnienie kształtu i tekst
na kształcie. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Treść notatki” – „rysunki”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Lasso i prostokąt: zaznaczanie prawym przyciskiem – wycinek ekranu (z częściami obiektów i kratką), jak w Windows | Przy narzędziu **zaznaczanie** przeciągnięcie **prawym przyciskiem myszy** (albo z wciśniętym przyciskiem na rysiku) robi **wycinek** – prostokątem albo lassem, zależnie od wybranego kształtu. Wycinek to obraz wszystkiego, co w obszarze: tło, kratka albo linie, szablon (np. boisko), zdjęcie i części kresek, kształtów i pól przecięte brzegiem. Obszar ma fioletową, kreskowaną ramkę, a nad nim polecenia **Kopiuj** i **Osadź**; menu przeglądarki się nie pokazuje. Na iPadzie i iPhonie (bez prawego przycisku) jest czwarty tryb zaznaczania – **Wycinek** (obok Auto, Całe, Fragmenty) |
| Wycinek kopiuje wszystko, co w pudełku | **Kopiuj** (albo Ctrl+C) wkłada wycinek do schowka jako obraz PNG – wkleisz go w tekście notatki (trafi do jej obrazów), w Wordzie albo innej aplikacji. Lasso – poza obrysem obraz jest przezroczysty. Rysunek się nie zmienia |
| Obok Powiel, Przenieś, Usuń, Kopiuj – **Osadź**: fragment jako obrazek w notatce (elementy albo wycinek ekranu) | Nowe polecenie **Osadź** nad każdym zaznaczeniem. Zaznaczone kreski, kształty i pola (całe albo fragmenty) – obraz samych elementów na białym tle, bez kratki; wycinek – obraz z tłem i kratką. Obraz trafia od razu do obrazów notatki jako „Obraz N” (komunikat podaje sygnaturę), zaraz za rysunkiem; przy nowym rysunku – rysunek jest pierwszy, a osadzone obrazy za nim. Zostaje w notatce także wtedy, gdy rysunek zamkniesz przyciskiem **Anuluj** |
| Kształty: kąt pochylenia, długość i wysokość z klawiatury, w polach na środku linii przerywanych ramki konstrukcyjnej | Przy zaznaczonym kształcie są trzy pola: **szerokość** pod dolną linią ramki, **wysokość** przy prawej, **kąt pochylenia** (w stopniach, w prawo – dodatni) przy lewej – przy pochylanych bokach. Długości są w skali rysunku (jak na linijce, np. cm albo m przy boisku). Wpisz liczbę i Enter (albo przejdź dalej) – kształt zmienia się wokół środka, jeden krok cofania; Esc – bez zmiany. Dotknięcie rombu pochylenia (bez przeciągania) ustawia kursor w polu kąta pochylenia, dotknięcie punktu boku albo narożnika – w polu wymiaru. Odcinek i strzałka: **długość** pod środkiem i **kąt** za końcem (początek zostaje na miejscu). W trakcie przeciągania punktów pola pokazują bieżące wartości. Pola obracają się z kształtem (są przy tych samych liniach ramki) |
| Wypełnienie kształtu oprócz linii | **Wypełnienie: Brak, Jasne, Pełne** – w kolorze kształtu (jasne – przejrzyste, kratka prześwituje). Dla nowych kształtów – w panelu kształtów; dla zaznaczonego – polecenie **Wypełnienie** nad nim. Wnętrze wypełnionego kształtu jest jego częścią: gumka całych kresek usuwa go dotknięciem wnętrza |
| Pole tekstowe na kształcie, które wędruje razem z nim | Polecenie **Tekst** nad zaznaczonym kształtem (albo dotknięcie zaznaczonego kształtu) – okno jak przy polu tekstowym: tekst, wielkość, kolor. Tekst jest na środku kształtu (odcinka i strzałki – nad linią), łamie się do szerokości kształtu, a przy przesuwaniu, obracaniu i zmianie wielkości idzie razem z nim (obrócony nigdy nie leży do góry nogami). Pusty tekst usuwa go z kształtu. Przy pełnym wypełnieniu tekst domyślnie jest biały |

Szczegóły:

- **Zapis:** rysunek ma teraz format 4 (wypełnienie i tekst kształtu); wraca z kopią zapasową.
  Starsza wersja aplikacji pokaże obraz rysunku, ale przy jego poprawianiu pominie wypełnienie
  i tekst kształtów.
- **Telefon:** cztery tryby zaznaczania mieszczą się w jednym wierszu („Fragmenty” są tam
  skrócone do „Fragm.”), pasek zaznaczania nadal ma najwyżej trzy wiersze; polecenia zaznaczenia
  mają same ikony. Pola wymiarów mają 16-punktową czcionkę, więc iPad i iPhone nie powiększają
  strony przy wpisywaniu.
- Polecenia nad zaznaczeniem nie wchodzą już pod pasek narzędzi ani na pola wymiarów – gdy brakuje
  miejsca, są pod zaznaczeniem.
- Obrazy wycinka i osadzane mają dwa piksele na jednostkę strony (najdłuższy bok najwyżej
  2048 px, jak inne obrazy notatki) – są ostrzejsze niż sam rysunek w notatce.

## Testy, które wykonano

- **Testy logiki (Node.js): 297 – wszystkie zaliczone** (294 wcześniejsze + 3 nowe; test kopii
  zapasowej kształtów rozszerzony o wypełnienie i tekst, test formatu – wersja 4):
  - wypełnienie: nowy kształt z wypełnieniem (odcinek bez), wnętrze wypełnionego trafia
    gumkę i dotknięcie, sprawdzanie danych, ustawienie narzędzia;
  - tekst na kształcie: środek kształtu, nad odcinkiem, obrócony o 180° – czytelny, odcinek w dół –
    tekst czytany od dołu, granice z wystającym tekstem, dotknięcie tekstu, przesunięcie razem
    z kształtem, sprawdzanie danych (pusty, zły kolor, za długi);
  - wymiary: szerokość i wysokość wokół środka, pochylenie 15° (i najwyżej 68°), najmniejsza
    wielkość, odcinek – długość i kąt od początku (90°, 270° → −90°, 0° bez „−0”), przeliczanie
    na skalę rysunku, odczyt wpisanych liczb („4,5”, „12.5 cm”, „−15°”), tryb „Wycinek”.
- **Testy w przeglądarce (Chromium): 133 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (130 wcześniejszych + 3 nowe; w teście kształtów z 1.15 zmieniła się tylko nazwa
  przycisków wypełnienia w panelu, a test pól tekstowych z 1.13 czeka teraz, aż poprawiony wzór
  pojawi się na płótnie – w jednym przebiegu dotknięcie testu wyprzedziło zamknięcie okna wzoru):
  - ekran iPada, wycinek: prawy przycisk myszy – prostokąt „Wycinek” z poleceniami Kopiuj i Osadź
    (bez Powiel i Usuń); Kopiuj – obraz PNG w schowku w proporcjach obszaru; Osadź – „Obraz 1”;
    Esc zdejmuje wycinek, edytor zostaje; tryb „Wycinek” i lasso rysikiem – „Obraz 2”; zaznaczenie
    całej kreski – Osadź – „Obraz 3”; po „Gotowe” kolejność: Rysunek 1, Obraz 1, 2, 3; obrazy
    w notatce: wycinek prostokątem – z kratką i kreską, nieprzezroczysty; lasso – przezroczysty róg;
    zaznaczenie – białe tło, bez kratki, cała kreska;
  - ekran iPada, kształt: pola szerokości (pod dolną linią), wysokości (z prawej) i pochylenia
    (z lewej); 5 cm, 3 cm, 15°; Esc w polu – wartość wraca, edytor otwarty; 0 – komunikat, bez
    zmiany; dotknięcie rombu – kursor w polu pochylenia, 20°; Wypełnienie: pełne (ciemny środek),
    jasne (szary); Tekst „Bramka” czerwony na środku; przesunięcie kształtu – tekst razem z nim;
    dotknięcie kształtu – poprawka tekstu; obrót o 90° – tekst obrócony, polecenia nie zasłaniają
    pól; odcinek – kąt 30° i długość 4 cm; wypełnienie pełne w panelu – nowa elipsa wypełniona;
    zapis: 220 × 132, pochylenie 0,364, jasne, „Bramka A”, kolor, obrót 90°, odcinek 176 pod 30°;
  - ekran telefonu: tryb „Wycinek” palcem, „Fragm.”, pasek w trzech wierszach, Osadź; pola
    wymiarów i polecenia w szerokości ekranu i pod paskiem narzędzi, bez przewijania w bok.
- **Lint: bez błędów.**
- Zrzuty (Chromium): wycinek prostokątem i lassem (iPad), wymiary kształtu – 5 cm, 3 cm, 15°
  (iPad), kształt z wypełnieniem i tekstem po obrocie (iPad), wycinek i pola wymiarów (telefon).

## Czego nie sprawdzono

- **Safari na iPadzie i iPhonie** – testy działają w Chromium z ekranem iPada i telefonu (dotyk,
  rysik i mysz udawane), nie w Safari na iOS. Do sprawdzenia u Ciebie: **Kopiuj** wycinka
  w Safari (obraz w schowku – Safari jest tu bardziej wymagające), klawiatura iPada przy polach
  wymiarów, wpisywanie minusa w polu kąta.
- **Windows: prawy przycisk rysika** (przycisk na obudowie) – w testach był tylko prawy przycisk
  myszy; rysik z przyciskiem powinien działać tak samo (przeglądarka zgłasza go jak prawy przycisk),
  ale tego nie sprawdzono.
- Wklejenie wycinka z powrotem do rysunku – nie ma (rysunek nie ma jeszcze obrazów jako elementów);
  wycinek wkleisz w tekście notatki albo w innej aplikacji, a do notatki trafia też przez **Osadź**.
- Dociąganie kresek i kształtów do linii kratki oraz zamiana odręcznych kształtów na figury – nadal
  etap 2.
