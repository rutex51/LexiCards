# LexiCards 1.26 – jeden wygląd okien, „Wstaw obiekt” w notatce, okno równań, tabele z formatami i szerokościami kolumn

Wersja 1.26.0, 20 października 2026. Wybrany wariant C wyglądu okien, uwagi do paska notatki i do tabel,
późniejsze znikanie przewracanej kartki. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcje
interfejsu i treści notatki – „Od 1.26”).

## Co doszło i co poprawiono

| Prośba | Jak jest zrobione |
| --- | --- |
| Spójny wygląd okienek – wariant C | Wszystkie okna formularzy (pojęcie, lekcja, moduł, dziedzina, eksport, okna rysunku – tolerancja, ramka tolerancji, karteczka, szyk, tekst i wzór –, okno tabeli, kolumny, równań, linku, daty i godziny, kalendarza, tabela pasowań) mają **białe tło** jak panele edytora rysunku. Każde pole i przełącznik leży w **cienkiej zaokrąglonej ramce**; kilka przełączników pod sobą i grupa pól (np. „Pojęcie: Po polsku, Po angielsku”) – w jednej ramce z liniami. Aktywne pole – ramka w kolorze aplikacji (bez dawnej grubej ciemnej ramki). Tak samo w motywie ciemnym, na telefonie, iPadzie i komputerze. Okno notatki (kartka i pasek narzędzi) zostaje na szarym tle. |
| (przy okazji) | „Pasowanie” w przełączniku tolerancji mieści się w jednym wierszu (słowo nie łamie się w środku); okno tabeli pasowań ma krótszy tytuł **Tabela pasowań** (nie nachodzi na „Wybierz”), norma ISO 286 – w podpowiedzi; przycisk **Tabela pasowań…** jest jaśniejszy. Tytuły okien skracają się wielokropkiem zamiast nachodzić na przyciski. |
| Przewracanie strony – opóźnić zniknięcie strony | Przewracany płat znika dopiero, gdy płaska część kartki jest mniejsza niż ok. **5%** strony (było 18%) – widać go prawie do końca przewracania, potem spirala płynnie wychodzi spod niego. |
| Notatki: zrezygnować z ikony równania, która wstawia znaki dolara; pod przyciskiem Równania – to, co było pod „info” | Przycisk **Σ** otwiera okno **Równania** – pole zapisu z podglądem, ściągawka (przykłady w grupach, dotknięcie wpisuje przykład) i **Wstaw**, które kładzie `$zapis$` w miejscu kursora (zaznaczony tekst trafia do pola zapisu). Osobna ikona **ⓘ** zniknęła. Wzór można dalej wpisywać ręcznie między znakami dolara. |
| Notatki: na pasku skrót – lista, która wstawia do tekstu obiekt (rysunek, zdjęcie, tabela); lista na bieżąco; dziś za dużo przewijania | Przycisk **Wstaw rysunek, zdjęcie albo tabelę** (obraz z plusem, grupa **Wstaw** na pasku) otwiera pod paskiem panel: **Nowy – Rysunek / Zdjęcie / Tabela** (nowy obiekt od razu trafia do tekstu w miejscu kursora) i **lista obiektów notatki** – rysunki, zdjęcia i tabele z miniaturą, sygnaturą, rodzajem, podpisem i dopiskiem **„już w tekście”**. Dotknięcie wstawia odwołanie `[[sygnatura]]` w miejscu kursora. Lista odświeża się sama przy dodaniu, usunięciu, zmianie sygnatury i podczas pisania. |
| Tabela: dostosowanie szerokości wszystkich kolumn | W oknie tabeli **uchwyt** (pionowa kreska) między przyciskami kolumn – przeciągnięcie poszerza jedną kolumnę kosztem następnej (tabela tej samej szerokości); **Równe kolumny** / **Kolumny z treści**. Na rysunku zaznaczona tabela ma **uchwyty granic kolumn** na górnej krawędzi; narożnik dalej zmienia szerokość całej tabeli (kolumny w tych samych proporcjach). W podglądzie notatki, w „Kopiuj” i w PDF kolumny mają ustawione szerokości. |
| Tabela: formaty tekstu w polach – tekst, liczby całkowite, liczby z separatorem tysięcy i 2 miejscami po przecinku, walutowe, data | Przycisk nad kolumną otwiera okno **Kolumna N** – **Format wartości**: Tekst, Liczba całkowita (1235), Liczba (1 234,56), Waluta – zł, €, $, £, CHF (1 234,56 zł), Data (20.10.2026). Liczbę i datę wpisujesz jak zwykle („1234,5”, „1.234,56”, „0.99”, „2026-10-20”, „1/2/26”) – komórka z kursorem pokazuje tekst jak wpisany, bez kursora, w podglądzie, na rysunku, w „Kopiuj”, PDF i słuchaniu – w formacie kolumny. Tekst, który nie jest liczbą (datą), i nagłówki zostają bez zmian. Zapis komórki się nie zmienia, więc zmiana formatu nic nie psuje. |
| Tabela: niezależne wyrównanie wiersza nagłówka i wartości | W oknie **Kolumna N**: **Wyrównanie wartości** i osobno **Wyrównanie wiersza nagłówka**. Nagłówek idzie za wartościami, dopóki nie wybierzesz mu innego; liczba i waluta wyrównują wartości do prawej (gdy było do lewej). |

## Testy, które wykonano

- **Testy logiki (Node.js): 357 – wszystkie zaliczone** (351 wcześniejszych + 6 nowych):
  liczby z tekstu komórki (przecinek, kropka, separatory tysięcy, waluty, minus) i po polsku
  („1 234,50”, „−13”), daty (cztery zapisy, złe dni); wartości w formacie kolumny (nagłówek, puste,
  wielowierszowe, nie-liczby bez zmian), wyrównanie nagłówka; zapis tylko zmieniających pól, złe dane
  pominięte, udziały kolumn (suma 1, najmniej 2%); granica kolumn, kolumny dodane i usunięte; HTML
  podglądu (`<colgroup>`, wyrównanie nagłówka, waluta), tekst schowka i arkusza; tabela na rysunku
  zachowuje nowe pola.
- **Testy w przeglądarce (Chromium): 169 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (167 wcześniejszych + 2 nowe; poprawione 3 wcześniejsze – okno równań, przycisk kolumny tabeli,
  późniejsze znikanie kartki):
  - ekran telefonu: panel „Wstaw obiekt” – pusty, nowa tabela z panelu trafia za „Wymiary:”, na liście
    „Tabela 1 · Tabela · już w tekście”; okno tabeli – waluta zł (wartości do prawej, nagłówek za nimi),
    liczba całkowita z nagłówkiem do środka, data; z kursorem – tekst jak wpisany; uchwyt kolumny –
    pierwsza szersza, druga węższa, suma bez zmian; zapis (formaty, wyrównania, szerokości), podgląd
    („1 234,50 zł”, nagłówek do środka, 4 kolumny w `<colgroup>`);
  - ekran komputera, rysunek: tabela z równymi kolumnami i formatem liczby, potem uchwyt granicy
    kolumn na rysunku – udziały 1/3 + 40/szerokość i 1/3 − 40/szerokość, trzecia bez zmian, tabela
    w tym samym miejscu i tej samej szerokości;
  - przewracanie kartki z zatrzymanym czasem: w 700 ms płat jeszcze przykrywa spiralę, w 840 ms spirala
    wyszła spod niego;
  - okno równań w notatce (przycisk Σ – bez ikony ⓘ, wzór z okna w miejscu kursora, ściągawka).
- **Lint: bez błędów.**
- Zrzuty (Chromium): okna w nowym wyglądzie (telefon, komputer, motyw ciemny), panel „Wstaw obiekt”,
  okno tabeli z formatami, podgląd tabeli, uchwyty kolumn na rysunku.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** – wygląd okien (`:has()` w CSS działa w Safari od 15.4), przeciąganie
  uchwytu kolumny palcem i panel „Wstaw obiekt” przy otwartej klawiaturze sprawdzone tylko w Chromium
  z ekranem telefonu.
- Wybór zdjęcia z panelu „Wstaw obiekt” (okno plików systemu) – testy wybierają tabelę; zdjęcie wstawia
  ta sama funkcja co „Dodaj obraz”.
- Wklejenie tabeli z formatami do Worda – HTML ma `<colgroup>` i wartości w formacie, nie otwierałem go w Wordzie.
