# LexiCards 1.38 – tolerancje i symbole: uzupełnienia

Wersja 1.38.0, 22 października 2026. Etap „Tolerancje i symbole – uzupełnienia” z planu narzędzi podobnych do AutoCAD-a
(makiety 6–8). Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Tolerancje i symbole – uzupełnienia”).

## Co się zmieniło

| Z planu | Jak jest zrobione |
| --- | --- |
| Wymiary graniczne | Okno tolerancji wymiaru → **Tolerancja: Graniczne** – wpisujesz odchyłki (górna, dolna, znak z przycisku +/−), na rysunku dwa wymiary jeden nad drugim: „50,05” nad „49,98”. Miejsc po przecinku tyle, ile ma dokładniejsza liczba. Linia wymiarowa odsuwa się od kształtu, żeby dwie liczby się zmieściły. Działa też dla kątów („30,5°/29,5°”). |
| Wymiar teoretycznie dokładny w ramce, pomocniczy w nawiasie | Nowy wybór **Wymiar**: **Zwykły**, **Dokładny** (liczba w prostokątnej ramce), **Pomocniczy** („(40)”) – oba bez tolerancji (wybór tolerancji znika), **Kontrolny** (owalna ramka, z tolerancją albo bez). |
| Miejsca po przecinku | **Miejsca po przecinku**: Auto albo 0, 1, 2, 3 („20,00”). |
| Ramka tolerancji: Ⓟ, modyfikator przy bazie, drugi wiersz, „dookoła” | Okno ramki: **Strefa rzutowana** – Ⓟ z wysokością („⌀0,1 Ⓜ Ⓟ12”); przy każdej bazie przycisk **– / Ⓜ / Ⓛ**; **Drugi wiersz (ramka złożona)** – własna tolerancja z ⌀ i do trzech baz, pole symbolu na oba wiersze; **Dookoła** – kółko na strzałce przy ramce. |
| Chropowatość: kierunek struktury, naddatek, metoda, „dookoła” | Okno chropowatości: **Kierunek struktury** (=, ⊥, X, M, C, R, P – z nazwą pod wyborem), **Naddatek** (z lewej strony symbolu) i **metoda** (nad kreską), **Dookoła** (kółko na załamaniu), podgląd. Układ jak w ISO 1302. |
| Wymiar kontrolny (owalna ramka) | Wybór **Kontrolny** w oknie tolerancji wymiaru. |
| Odnośnik z tekstem bez karteczki | Nowy kolor karteczki **Bez tła – odnośnik**: sam tekst z cienką strzałką i mniejszym grotem, bez kartki i cienia; wybranie go włącza strzałkę, pole dopasowuje się do tekstu (strzałka zaczyna się przy nim). |

Przy okazji: okno tolerancji wymiaru ma podgląd narysowany jak na kartce; na telefonie wybory z długimi napisami
przechodzą do drugiego wiersza (wcześniej napisy byłyby ucięte). Zapis kartki jako DXF (1.37) zapisuje też nowe
wymiary (graniczne – dwa wiersze, ramka i owal wokół liczby, nawias) i odnośnik (tekst ze strzałką).

Zasady, które warto znać:

- Format rysunku 12. Starsza wersja aplikacji otworzy rysunek, ale **nowe pola pominie przy zapisie** (np. graniczne
  stracą tolerancję, ramka – drugi wiersz). Obraz w notatce się nie zmienia. Najpierw zaktualizuj aplikację na wszystkich
  urządzeniach.
- Wymiar teoretycznie dokładny i pomocniczy nie mają tolerancji (tak jak w normie) – przełączenie na nie usuwa tolerancję.
- Ramki tolerancji, bazy i chropowatość nadal nie trafiają do pliku DXF (tylko wymiary i odnośnik).

## Testy, które wykonano

- **Testy logiki (Node.js): 418 – wszystkie zaliczone** (6 nowych: sprawdzanie oznaczeń wymiaru; napisy granicznych,
  miejsc po przecinku, nawiasu i ramek – też w „cm” i dla kąta; ramka z Ⓟ, modyfikatorami baz, drugim wierszem
  i „dookoła”; chropowatość z kierunkiem, naddatkiem i metodą; odnośnik i nasycenie warstwy; DXF z nowymi wymiarami
  i odnośnikiem; 5 wcześniejszych z nowym numerem formatu 12).
- **Testy w przeglądarce (Chromium): 201 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe):
  - iPad: prostokąt 5 × 2 cm – szerokość graniczna (podgląd „50,05 / 49,98”, 3 miejsca „50,050 / 49,980”), wysokość
    dokładna z 2 miejscami („20,00 w ramce”, wybór tolerancji znika); drugi prostokąt – pomocniczy „(40)” i kontrolny
    „30±0,1”; zapis (oznaczenia, odsunięcie linii granicznej ≥ 54);
  - komputer: ramka „pozycja ⌀0,1 Ⓜ Ⓟ12 | A Ⓜ | B | C” z drugim wierszem „⌀0,05 | A” i „dookoła” (błąd bez tolerancji
    drugiego wiersza), chropowatość Ra 1,6 z ⊥, naddatkiem 0,5, metodą „szlifowane” i „dookoła”, odnośnik „Bez tła”
    (strzałka włącza się sama); zapis wszystkich pól;
  - iPhone: okno tolerancji wymiaru bez przewijania w bok i bez uciętych napisów; okno ramki (modyfikatory baz w szerokości
    ekranu, drugi wiersz); okno chropowatości.
- Wcześniejsze dwa pełne przebiegi (przed poprawką testu): 200 z 201 – nowy test ramki i chropowatości klikał krawędź,
  zanim okno skończyło się zamykać (bez czekania na komunikat „Dotknij krawędzi…”); test poprawiony, aplikacja bez zmian.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno tolerancji z wymiarem granicznym (iPad), wymiary na kartce, okno na iPhonie, okno ramki
  (komputer i iPhone), okno chropowatości, symbole i odnośnik na kartce.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** – nowe okna i rysowanie oglądane tylko w Chromium (ekran telefonu i iPada).
- Wygląd w ciemnym motywie – nie oglądany.
- Plik DXF z nowymi wymiarami otwarty w programie CAD – sprawdzony tylko odczytem z powrotem w testach; szerokość ramki
  wokół liczby w DXF jest szacowana z liczby znaków (zależy od czcionki programu CAD).
