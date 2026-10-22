# LexiCards 1.41 – etap D, część 2: odbicie względem prostej, skalowanie, „Styl jak…”, ramka rysunkowa

Wersja 1.41.0, 22 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Etap D, część 2: odbicie
względem prostej, skala, styl, ramka rysunkowa”).

Druga część etapu D planu „rysunek jak w CAD” (po 1.40: wielokąt foremny, półprosta, narożniki, kreskowanie, pole
i obwód, kolejność rysowania). Etap D jest tym samym zamknięty.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| Odbicie względem prostej | **Odbij** nad zaznaczeniem → **Względem prostej…**: dotknij dwóch punktów osi (przyciągają się do narożników i krawędzi; myszą widać oś przerywaną linią przez całą kartkę; Esc – rezygnacja). Zaznaczenie odbija się względem tej prostej – jeden krok cofania. |
| Kopia odbita | **Kopia względem prostej…** – to samo, ale oryginał zostaje, a odbita kopia (zaznaczona) dochodzi obok – np. druga połowa symetrycznej części. |
| Skalowanie | **Skaluj** nad zaznaczeniem: współczynnik 2, 0,5 albo w postaci 2:1, 1:2 (0,01–100), wokół środka zaznaczenia. Kreski i kształty rosną razem z odsunięciami wymiarów i narożnikami; grubość linii, tekst na kształcie, znacznik punktu i kreskowanie – bez zmian; pola tekstowe, wzory, tabele, karteczki i symbole tylko się przesuwają. |
| Styl jak… | **Styl jak…** nad zaznaczeniem, potem dotknij elementu-wzoru: zaznaczone dostają jego kolor, grubość linii (kreska – szerokości przeskalowane, nacisk zostaje), a kształty także rodzaj linii, wypełnienie i kreskowanie. Tekst dostaje sam kolor; karteczki i tabele zostają bez zmian. |
| Ramka rysunkowa z tabliczką | Menu kartek (**Kartka 1 z 1**) → **Ramka rysunkowa…**: arkusz **A4** albo **A3** w poziomie wpasowany w kartkę; ramka 20 mm od lewego brzegu i 10 mm od pozostałych, tabliczka 180 × 34 mm w prawym dolnym rogu: Rysował, Data (na start dzisiejsza), Skala, Format, Tytuł, Materiał, Nr rysunku. Skala bez wpisu – z kratki rysunku i arkusza (np. kratka 1 cm na A4 – 1:1,19). **Bez ramki** – usuwa ramkę. |
| DXF | Ramka i tabliczka w pliku DXF na osobnej warstwie **RAMKA** (brzeg arkusza, ramka i tabliczka – łamane, linie tabliczki, napisy). |
| Pasek zaznaczenia | Więcej poleceń: na komputerze pole i obwód są pod nazwą elementu (pasek węższy); gdy polecenia nie mieszczą się w jednym wierszu, pasek pokazuje same ikony (napis – w podpowiedzi po najechaniu i dla czytnika ekranu), a gdy i to za mało – przechodzą do drugiego wiersza, jak na telefonie. Pasek nie wychodzi poza ekran ani nie rośnie bez potrzeby nad zaznaczeniem. |

Zasady, które warto znać:

- Ramka należy do tła kartki: ukrycie poziomu **Tło** w warstwach ukrywa także ramkę; nie da się jej zaznaczyć ani zetrzeć.
- Kartka ze zdjęciem nie ma ramki (polecenie jest ukryte).
- Skala w tabliczce nie zmienia skali rysunku – to tylko napis (wpisany albo policzony z kratki).
- Rysunek ma format 14 (ramka). Starsza wersja aplikacji pokaże kartkę bez ramki i przy zapisie ją pominie.

## Testy, które wykonano

- **Testy logiki (Node.js): 434 – wszystkie zaliczone** (5 nowych: odbicie względem prostej – kreska, kształt, tekst,
  oś pozioma jak odbicie „w pionie”, dwa odbicia wracają; skalowanie – prostokąt z narożnikami i wymiarem, kreska, odcinek,
  punkt, tekst, szyk; „Styl jak…” – kształt, odcinek, kreska, tekst, karteczka, szyk; ramka – zapis, arkusz A4 i A3,
  marginesy, tabliczka, skala z kratki, kartka ze zdjęciem; DXF – warstwa RAMKA, łamane, linie, napisy).
- **Testy w przeglądarce (Chromium): 207 – wszystkie zaliczone w dwóch pełnych przebiegach** (1 nowy, komputer):
  kopia odbita trójkąta względem pionowej prostej z dwóch dotknięć (podpowiedzi, oś pod myszą), skalowanie ×2 (zły
  współczynnik – komunikat w oknie), „Styl jak…” (dotknięcie pustego miejsca – komunikat, potem kolor trójkąta), ramka A4
  z tabliczką (skala z kratki w podpowiedzi pola, dzisiejsza data, linia ramki na kartce), zapis rysunku.
- **Lint: bez błędów.**
- Zrzuty (Chromium): oś odbicia w trakcie wyboru, kartka z ramką A4 i tabliczką.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – dotknięcia udawane myszą w Chromium.
- Wydruk arkusza w prawdziwym rozmiarze A4/A3 (aplikacja nie drukuje rysunku w skali) i plik DXF z ramką w programie CAD.
- Ciemny motyw.
