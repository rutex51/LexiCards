# LexiCards 1.37 – pliki DXF: wczytywanie i zapis kartki

Wersja 1.37.0, 22 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Pliki DXF”).

## Co się zmieniło

| Prośba | Jak jest zrobione |
| --- | --- |
| Import DXF | Menu kartek (przycisk **Kartka 1 z 1**) → **Wczytaj DXF…**. Okno pokazuje nazwę pliku, liczbę elementów i warstw, rozmiar w milimetrach i pyta, gdzie: **Ta kartka – skala dopasowana** (pusta kartka), **Nowa kartka – skala dopasowana**, **Ta kartka – jej skala**. Skala dopasowana – z szeregu 1–2–5 (np. 1 kratka = 5 mm), więc długości i wymiary na kartce to prawdziwe milimetry z pliku. Wczytuje odcinki, proste, okręgi, łuki, elipsy, łamane (też z łukami), splajny, punkty, teksty, wypełnione trójkąty (groty), bloki i wymiary (jako linie, groty i liczba). Warstwy pliku stają się warstwami rysunku (wyłączona w pliku – ukryta), kolory i rodzaje linii – z pliku. Wczytane elementy są zaznaczone, jeden krok cofania. |
| Eksport DXF | Menu kartek → **Zapisz kartkę jako DXF**: plik „Rysunek 1.dxf” (na iPhonie i iPadzie – arkusz udostępniania), format R12 – czyta go każdy program CAD. Milimetry w skali rysunku, warstwy z nazwami (ukryta – wyłączona), kolory, rodzaje linii. Wymiary (narzędzie „Wymiar” i stałe wymiary kształtów) – linie pomocnicze, linia wymiarowa albo łuk, groty i ta sama liczba co na kartce, wyśrodkowana i obrócona jak na kartce. Polskie litery i ⌀ ° ± zapisane tak, że plik ma same znaki ASCII. |

Przy okazji: puste miejsce obok krótszych pastylek w lewym dolnym rogu edytora (np. obok „100%” pod szeroką
podpowiedzią) nie blokuje już rysowania – wcześniej przejmowało dotyk i mysz.

Zasady, które warto znać:

- **DWG nie jest obsługiwany** – to zamknięty format binarny. Plik DWG zapisz najpierw jako DXF (AutoCAD: „Zapisz jako”
  → DXF; albo darmowy konwerter). Binarny DXF też nie – tylko tekstowy (zwykły).
- Pomijane przy wczytywaniu (okno podaje liczbę): kreskowania, bryły i siatki 3D, obrazy, nieznane encje.
- Wymiary z pliku i bloki stają się zwykłymi liniami i tekstem – bez edycji jako wymiar. Obrót tekstu jest pomijany
  (tekst poziomy w miejscu zaczepienia). Łamana dłuższa niż 24 wierzchołki dzieli się na kawałki ze wspólnymi końcami.
- Biały i bardzo jasne kolory są przyciemniane (inaczej byłyby niewidoczne na białej kartce).
- Warstwa „0” – warstwa 1; warstwa o tej samej nazwie co istniejąca – ta istniejąca; przy 32 warstwach dalsze trafiają
  na ostatnią. Najwyżej 20 000 elementów na kartce – nadmiar pomijany z komunikatem.
- Polskie litery: pliki UTF-8 (AutoCAD 2007 i nowsze), strona kodowa z pliku albo Windows-1250, zapis `\U+XXXX`;
  %%c, %%d, %%p to ⌀, °, ±.
- Do pliku trafia tylko warstwa rzędu 1 elementu (DXF nie ma kilku warstw na element). Kolor – najbliższy z palety
  AutoCAD-a (255 kolorów). Prosta – długi odcinek przez kartkę (R12 nie ma prostej). Pomijane: tabele, karteczki,
  symbole metrologiczne (ramka tolerancji, baza, chropowatość) i zdjęcie.

## Testy, które wykonano

- **Testy logiki (Node.js): 412 – wszystkie zaliczone** (6 nowych: czytanie – jednostki, warstwy, bloki, encje,
  pominięte; teksty, kolory, rodzaje linii, nazwy warstw, skala dopasowana; zamiana na elementy – milimetry, oś y,
  warstwy, dzielenie długich łamanych; zapis kartki i odczyt z powrotem; wymiary z grotami i liczbą, wymiar kształtu,
  polskie litery, wyśrodkowana liczba wczytana z powrotem na tym samym miejscu; odczyt bajtów UTF-8, Windows-1250
  i strony kodowej z pliku).
- **Testy w przeglądarce (Chromium): 198 – wszystkie zaliczone w dwóch pełnych przebiegach** (1 nowy, komputer):
  wczytanie małego pliku DXF z menu kartek (podsumowanie „5 elementów, 3 warstwy, 100 × 95 mm”, skala dopasowana
  5 mm, warstwy OSIE i UKRYTA – ukryta), zaznaczenie wczytanych, puste miejsce obok pastylek – kartka (bez poprawki
  test nie przechodzi), wymiar 20 mm, zapis kartki jako DXF i odczyt pobranego pliku: odcinek 100 mm, okrąg R20
  na warstwie OSIE z linią osiową, same znaki ASCII, „Wałek ⌀20” z powrotem, liczba wymiaru „20 mm” wyśrodkowana,
  dwa groty; zapisany rysunek w notatce – skala 5 mm, warstwy, tekst.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno „Wczytaj DXF”, wczytany rysunek na kartce, zapisany plik wczytany z powrotem na nową kartkę
  (wymiary z grotami i liczbą).

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** – wybór pliku i arkusz udostępniania przy DXF nie były oglądane.
- **Pliki z prawdziwego AutoCAD-a** – testy używają plików zbudowanych w testach (z typowymi encjami AutoCAD-a);
  zapisanego pliku nie otwierałem w AutoCAD-zie ani innym programie CAD (nie ma ich w środowisku testów). Format R12
  jest najprostszy i najszerzej czytany, ale to warto sprawdzić na swoim pliku.
- Duże pliki (tysiące elementów) – nie mierzyłem szybkości wczytywania ani rysowania.
