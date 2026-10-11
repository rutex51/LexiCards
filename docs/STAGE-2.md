# Etap 2 – import i eksport plików XLSX oraz CSV

Raport z drugiego etapu. Wyniki testów pochodzą z rzeczywistego uruchomienia opisanego
w sekcji „Testy”; to, czego nie udało się sprawdzić, jest wymienione osobno.

## Co zostało zaimplementowane

**Kreator importu w siedmiu krokach**

1. **Plik** – wybór pliku XLSX albo CSV z urządzenia (na iPhonie z aplikacji Pliki);
   do pobrania jest wzór pliku z nagłówkami.
2. **Arkusz** – lista arkuszy skoroszytu (z oznaczeniem ukrytych) i podgląd początku pliku.
   Dla CSV w tym kroku widać wykryte kodowanie znaków i separator; oba można zmienić.
3. **Kolumny** – automatyczne przypisanie kolumn do pól po nagłówkach polskich i angielskich,
   z możliwością poprawienia każdego przypisania. Plik bez nagłówków też jest obsługiwany.
4. **Miejsce** – struktura dziedzina → moduł → lekcja odtwarzana z kolumn pliku albo jedna
   wskazana lekcja (istniejąca lub nowa). Poziomy, których plik nie zawiera, uzupełnia się tutaj.
5. **Sprawdzenie** – liczba poprawnych i odrzuconych wierszy, lista błędów i ostrzeżeń
   z numerami wierszy arkusza, wybór sposobu traktowania duplikatów.
6. **Podgląd** – pojęcia w postaci, w jakiej trafią do biblioteki, z lekcją docelową
   i informacją, co się z każdym stanie.
7. **Zatwierdzenie** – podsumowanie oraz lista dziedzin, modułów i lekcji, które zostaną
   utworzone. Dopiero ten krok cokolwiek zapisuje.

Kreator uruchamia się ze Startu, z menu „+” w Bibliotece, z menu lekcji („Importuj z pliku…” –
wtedy lekcja jest od razu wybrana) i z Ustawień.

**Reguły importu**

- Obsługiwane kolumny: Domain, Module, Lesson, Term PL, Term EN, Description PL/EN,
  Example PL/EN oraz dodatkowo Tags, Difficulty, Notes.
- Wymagane są tylko pojęcie po polsku i po angielsku. Wiersz bez któregoś z nich jest
  odrzucany i wymieniany w liście błędów; pozostałe wiersze można zaimportować.
- Pusta komórka dziedziny, modułu lub lekcji przejmuje wartość z wiersza powyżej – tak
  wyglądają scalone komórki i arkusze z nazwą grupy tylko w pierwszym wierszu.
- Duplikat to pojęcie o tej samej nazwie polskiej i angielskiej w tej samej lekcji,
  porównywane bez wielkości liter i polskich znaków. Do wyboru: **pomiń**, **aktualizuj
  istniejące**, **dodaj jako nowe**.
- Aktualizacja zachowuje identyfikator pojęcia, więc postępy i historia nauki zostają.
  Nadpisywane są tylko pola, które plik zawiera; pusta komórka niczego nie kasuje.
- Powtórzenia w samym pliku są pomijane (importowane jest pierwsze wystąpienie).
- Import to jedna niepodzielna operacja: wykonuje się w całości albo wcale.

**Odczyt plików**

- XLSX: wiele arkuszy, teksty z częściowym formatowaniem, zapamiętane wyniki formuł,
  scalone komórki, puste wiersze.
- CSV: UTF-8 (z BOM i bez), UTF-16, Windows-1250, ISO-8859-2; separator średnik, przecinek,
  tabulator lub kreska pionowa; pola w cudzysłowie z separatorem i nowymi wierszami w środku;
  wiersz `sep=` dopisywany przez Excela.
- Format jest rozpoznawany po zawartości pliku, nie po rozszerzeniu. Stary format `.xls`,
  pliki ODS, Numbers, dokumenty Word i pliki binarne dają komunikat, co zrobić.

**Eksport**

- Zakres: cała biblioteka, dziedzina, moduł, lekcja albo zaznaczone pojęcia.
- Formaty: XLSX (pogrubiony, zamrożony nagłówek, szerokości kolumn) i CSV (UTF-8 z BOM,
  średniki – otwiera się poprawnie w polskim Excelu).
- Kolumny są takie same jak przy imporcie, więc wyeksportowany plik można poprawić
  w arkuszu i wczytać z powrotem w trybie „aktualizuj istniejące”.
- Na telefonie plik trafia do arkusza udostępniania („Zachowaj w Plikach”), na komputerze
  do folderu pobranych.

**Poza zakresem etapu, ale zrobione przy okazji**

- Nowe wydanie aplikacji zgłasza się komunikatem z przyciskiem „Uruchom ją”; aplikacja
  szuka go także przy powrocie na pierwszy plan, nie tylko przy starcie.
- Przy przywracaniu kopii zapasowej na telefonie wybór pliku nie jest zawężany do typu JSON,
  żeby system nie wyszarzył kopii zapisanej przez inną aplikację.

## Pliki

| Plik | Zawartość |
| --- | --- |
| `js/core/zip.js` | odczyt i zapis archiwów ZIP, suma kontrolna CRC-32 |
| `js/core/xlsx.js` | odczyt i zapis skoroszytów XLSX |
| `js/core/csv.js` | kodowanie, separator, odczyt i zapis CSV |
| `js/core/tablefile.js` | rozpoznanie formatu, komunikaty dla nieobsługiwanych plików |
| `js/core/importer.js` | rozpoznawanie nagłówków, wiersze importu, walidacja |
| `js/core/exporter.js` | zakresy eksportu, pliki XLSX i CSV, wzór pliku do importu |
| `js/core/library.js` | `planImport()`, wspólny przebieg planu i importu, aktualizacja bez kasowania treści |
| `js/ui/screens/import.js` | kreator importu |
| `js/ui/actions.js` | arkusz eksportu |
| `js/ui/screens/*.js`, `js/ui/router.js`, `js/main.js` | wejścia do importu i eksportu, adres kreatora, komunikat o nowym wydaniu |
| `css/app.css` | wygląd kreatora |
| `tests/unit/files.test.js`, `tests/unit/import.test.js` | testy plików oraz logiki importu i eksportu |
| `tests/e2e/run.mjs` | 9 nowych testów w przeglądarce |
| `tests/fixtures/` | pliki testowe z openpyxl i LibreOffice |
| `tools/gen_fixtures.py` | generator plików testowych |
| `tools/check_export.py`, `tools/export_sample.mjs` | sprawdzenie eksportu w niezależnych programach |

## Testy

Uruchomione 11 października 2026 w środowisku Linux, Node.js 22.22.0.

| Polecenie | Wynik |
| --- | --- |
| `npm test` | 109 testów, 109 zaliczonych |
| `npm run test:e2e` | 29 testów, 29 zaliczonych (dwa kolejne przebiegi) |
| `python3 tools/check_export.py` | 4 sprawdzenia, wszystkie zgodne |
| ESLint (`no-undef`, `no-unused-vars` i pokrewne) | brak uwag w kodzie aplikacji |

**Scenariusze wymagane w specyfikacji**

| Scenariusz | Gdzie sprawdzony |
| --- | --- |
| Import XLSX | testy jednostkowe na plikach z openpyxl i LibreOffice; test w przeglądarce przez wszystkie 7 kroków |
| Import CSV z polskimi znakami | Windows-1250, ISO-8859-2, UTF-8, UTF-16; test w przeglądarce z plikiem Windows-1250 ze średnikami |
| Import duplikatów | trzy tryby, duplikaty w bibliotece i w pliku; test w przeglądarce |
| Aktualizacja pojęć bez utraty postępów | testy jednostkowe i test w przeglądarce (rekord postępu i wpis historii zostają w bazie) |
| Eksport | zakresy, oba formaty, ponowny import wyeksportowanego pliku do pustej aplikacji |

**Niezależne sprawdzenie plików**

- Odczyt: pliki testowe zapisały openpyxl 3.1.5 i LibreOffice, nie sama aplikacja. Skoroszyt
  z przypadkami brzegowymi istnieje w dwóch wersjach – z openpyxl (teksty wpisane wprost
  w komórkach) i przepisany przez LibreOffice (wspólna tablica tekstów, zapamiętane wyniki formuł).
- Zapis: wyeksportowany XLSX otworzyły openpyxl i LibreOffice, a CSV – moduł `csv` Pythona
  i LibreOffice. Wszystkie odczytały te same wartości komórka po komórce, łącznie z polskimi
  znakami, cudzysłowami, znakami `< & >`, tekstem wielowierszowym i separatorem w treści.

**Wydajność** (test jednostkowy, 50 000 pojęć w 2500 lekcjach, na komputerze testowym)

| Operacja | Czas |
| --- | --- |
| odczyt CSV | 0,1 s |
| walidacja wierszy | 0,5 s |
| plan importu | 0,8 s |
| import | 1,9 s |
| eksport do XLSX | 1,4 s |
| odczyt XLSX | 1,1 s |

Na telefonie czasy będą kilkukrotnie dłuższe; kreator pokazuje wtedy komunikat o trwającej operacji.

### Czego nie sprawdzono

- **Pliki zapisane przez Microsoft Excel, Numbers i Arkusze Google.** W środowisku testowym
  są tylko openpyxl i LibreOffice. Format jest ten sam, ale prawdziwym testem będzie Twój plik.
- **Otwarcie eksportu w Microsoft Excel.** Sprawdziły go openpyxl i LibreOffice.
- **Safari na iPhonie:** wybór pliku z aplikacji Pliki, zapis eksportu przez arkusz
  udostępniania i kreator przy wysuniętej klawiaturze. Testy przeszły w Chromium z ekranem
  telefonu. Gdyby system wyszarzał właściwy plik, w pierwszym kroku jest przycisk
  „Pokaż wszystkie pliki”.
- **Bardzo duże pliki na telefonie.** 50 000 pojęć sprawdzono tylko na komputerze.

## Znane ograniczenia

- Stary format `.xls` nie jest czytany – trzeba zapisać plik w Excelu jako `.xlsx` lub CSV.
- Pliki zabezpieczone hasłem nie są obsługiwane.
- Liczby i daty trafiają do aplikacji w postaci zapisanej w pliku, bez formatowania
  z arkusza (data może pojawić się jako liczba). Dla pojęć i opisów nie ma to znaczenia.
- Formuła bez zapamiętanego wyniku daje pustą komórkę. Excel i LibreOffice zawsze zapisują
  wynik; brak zdarza się w plikach generowanych programowo.
- Eksport nie zawiera postępów nauki ani oznaczenia „ulubione” – do tego służy kopia zapasowa.
- Import przebiega w wątku interfejsu. Przy dziesiątkach tysięcy wierszy ekran na chwilę
  przestaje reagować; jest wtedy widoczny komunikat o trwającej operacji.
- Kreator nie pamięta stanu po opuszczeniu ekranu – wyjście w połowie oznacza rozpoczęcie od nowa.
- Plik CSV z jedną kolumną (bez separatora) jest czytany jako jedna kolumna; drugiej nie da
  się wtedy przypisać.

## Jak uruchomić

- W przeglądarce: adres z pliku [README](../README.md). Po opublikowaniu nowej wersji
  aplikacja pokaże komunikat „Pobrano nową wersję aplikacji” z przyciskiem „Uruchom ją”.
- Na własnym komputerze: `npm run serve`, potem http://localhost:8080/.
- Testy: `npm test`, `npm run test:e2e` (wymaga Playwright z Chromium),
  `python3 tools/check_export.py` (wymaga openpyxl i LibreOffice).
- Pliki do wypróbowania importu: `docs/samples/lexicards_sample.xlsx` i `.csv`.
