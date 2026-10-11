# Architektura LexiCards

Dokument opisuje stan po etapie 2 oraz decyzje, które przygotowują kolejne etapy.

## Założenia

- **Jeden użytkownik, dane na urządzeniu.** Nie ma serwera ani kont. Baza to IndexedDB
  w przeglądarce; między urządzeniami dane przenosi plik kopii zapasowej.
- **Pliki statyczne bez kompilacji.** Moduły ES ładowane wprost przez przeglądarkę, zero
  zależności zewnętrznych. Hosting: GitHub Pages.
- **Logika oddzielona od przeglądarki.** Katalog `js/core/` nie dotyka DOM ani IndexedDB
  bezpośrednio, więc jest testowany w Node.js.
- **Działa offline.** Service worker przechowuje komplet plików aplikacji.

## Warstwy

```
js/main.js                 start: baza → biblioteka → nawigacja → ekrany
js/ui/screens/*.js         ekrany: klasa z metodą view() zwracającą opis ekranu
js/ui/shell.js             powłoka: pasek nawigacji, zakładki / panel boczny
js/ui/actions.js           formularze i przepływy wspólne dla wielu ekranów
js/ui/dialogs.js           arkusze, pytania, menu, komunikaty (element <dialog>)
js/ui/router.js            adresy po znaku # i historia przeglądarki
js/core/library.js         model w pamięci + wszystkie operacje na danych
js/core/storage.js         adaptery zapisu: IndexedDB i pamięć
js/core/model.js           kształt rekordów, wartości domyślne, stałe
js/core/backup.js          kopia zapasowa: tworzenie, walidacja, przywracanie
js/core/zip.js             odczyt i zapis archiwów ZIP
js/core/xlsx.js            odczyt i zapis skoroszytów XLSX
js/core/csv.js             kodowanie, separator, odczyt i zapis CSV
js/core/tablefile.js       rozpoznanie formatu pliku, wspólna postać tabeli
js/core/importer.js        nagłówki → pola, wiersze pliku → wiersze importu, walidacja
js/core/exporter.js        zakres eksportu → plik XLSX lub CSV
js/core/text.js            normalizacja tekstu, tagi, odmiana liczebników
```

Zależności biegną tylko w dół: ekrany znają bibliotekę, biblioteka zna adapter zapisu.

## Dane

Wszystkie rekordy mają identyfikator UUID i daty w formacie ISO.

| Magazyn | Zawartość | Klucze powiązań |
| --- | --- | --- |
| `domains` | dziedziny: nazwa, opis, ikona, kolor, kolejność | – |
| `modules` | moduły | `domainID` |
| `lessons` | lekcje | `moduleID`, `domainID` |
| `terms` | pojęcia: 6 pól treści, tagi, trudność, notatki, ulubione | `lessonID`, `moduleID`, `domainID` |
| `progress` | postęp nauki pojęcia w danym kierunku (etap 4) | `termID` + klucze zakresu |
| `assessments`, `reviews`, `quizAnswers` | dzienniki nauki (etapy 3–5) | indeks `termID` |
| `studySessions`, `quizSessions` | sesje (etapy 3–5) | – |
| `settings` | jeden rekord `app` | – |

Decyzje:

- **Powiązania przez identyfikatory, z kopią kluczy zakresu.** Pojęcie przechowuje także
  `moduleID` i `domainID`, żeby filtr „cała dziedzina” nie wymagał przechodzenia hierarchii.
  Przeniesienie lekcji lub modułu aktualizuje te kopie w tej samej transakcji.
- **Klucze wyszukiwania zapisane w rekordzie** (`keyPL`, `keyEN`, `nameKey`, `tagKeys`):
  małe litery bez znaków diakrytycznych. Wyszukiwanie i wykrywanie duplikatów nie zależą
  od wielkości liter ani polskich znaków.
- **Postęp osobno dla kierunku.** Rekord `progress` dotyczy pary pojęcie + kierunek
  (PL→EN albo EN→PL), więc powtórki obu kierunków będą niezależne.
- **Schemat ma numer wersji** (`SCHEMA_VERSION`, `DB_VERSION`), a kopia zapasowa własny
  numer formatu – zmiany w kolejnych etapach będą migracjami, nie przebudową.

## Zapis zmian

Biblioteka trzyma materiały w pamięci (mapy), a każdą zmianę wykonuje przez `#mutate()`:

1. `UnitOfWork` zapamiętuje stan rekordów sprzed zmiany i zbiera zapisy oraz usunięcia.
2. Funkcja operacji sprawdza dane i modyfikuje pamięć.
3. Adapter zapisuje wszystko **jedną transakcją** IndexedDB.
4. Jeśli walidacja albo zapis się nie powiedzie, pamięć wraca do stanu sprzed zmiany.

Operacje są kolejkowane, więc dwie zmiany nigdy się nie przeplatają. Po udanej zmianie
biblioteka zwiększa numer rewizji, unieważnia wyliczone liczniki i powiadamia ekrany.

Dzienniki nauki nie są trzymane w pamięci – mogą urosnąć do dziesiątek tysięcy wpisów.
Czyta je tylko kopia zapasowa, a usunięcie pojęcia czyści je po indeksie `termID`.

Gdy IndexedDB jest niedostępne (np. tryb prywatny w niektórych przeglądarkach), aplikacja
działa na adapterze pamięciowym i wyświetla ostrzeżenie, że dane znikną po zamknięciu karty.

## Interfejs

- **Ekran** to obiekt z metodą `view()`, która zwraca tytuł, przycisk powrotu, polecenia
  i treść. Stan ekranu (wyszukiwany tekst, rozwinięte pojęcia, zaznaczenie) żyje w obiekcie,
  dopóki adres się nie zmieni. Po każdej zmianie danych ekran jest budowany od nowa
  z zachowaniem przewinięcia i fokusu.
- **Nawigacja** opiera się na adresach `#/…`, więc działa przycisk „wstecz” przeglądarki
  i gest cofania w Safari. Każda zakładka pamięta ostatnie miejsce. Przy powrocie
  przywracane jest przewinięcie listy.
- **Okna** to natywny `<dialog>`: przeglądarka pilnuje fokusu, klawisza Esc i blokady tła.
- **Układ**: poniżej 900 px zakładki u dołu, powyżej panel boczny; glosariusz na szerokim
  ekranie jest tabelą. Rozmiar tekstu na iPhonie podąża za ustawieniem systemowym.
- Stan jest zawsze nazwany tekstem lub ikoną, nie samym kolorem; brak treści to „Brak danych”.

## Praca offline i aktualizacje

`npm run build` wylicza identyfikator wydania ze skrótu treści wszystkich plików aplikacji
i zapisuje go razem z listą plików w `sw.js`.

- Przy pierwszym otwarciu service worker pobiera komplet plików do pamięci podręcznej
  nazwanej tym identyfikatorem i od tej pory serwuje aplikację z niej.
- Po publikacji nowego wydania przeglądarka wykrywa zmieniony `sw.js`, pobiera nowy komplet
  w tle i usuwa stary. Otwarta aplikacja kończy pracę na starych plikach i pokazuje komunikat
  z przyciskiem uruchamiającym nowe wydanie. Pliki z dwóch wydań nigdy się nie mieszają.
- Nowego wydania aplikacja szuka przy starcie i przy każdym powrocie na pierwszy plan –
  aplikacja z ekranu początkowego iPhone'a rzadko startuje od zera.
- Aktualizacja nie dotyka danych użytkownika – są w IndexedDB, nie w pamięci podręcznej.

## Import i eksport plików

Aplikacja nie ma zależności, więc pliki czyta i zapisuje własnym kodem:

- **ZIP** (`zip.js`): spis treści archiwum, suma kontrolna CRC-32, zapis archiwum. Samą
  kompresję wykonuje przeglądarka (`CompressionStream`, `DecompressionStream`); te same
  interfejsy ma Node.js, więc moduł jest testowany bez przeglądarki.
- **XLSX** (`xlsx.js`): z dokumentów XML skoroszytu czytane są lista arkuszy, wspólna tablica
  tekstów i komórki. Obsłużone są teksty wpisane wprost w komórce, teksty z formatowaniem
  części znaków, zapamiętane wyniki formuł i komórki bez adresu. Formatowanie liczb i dat
  jest pomijane. Zapis tworzy jeden arkusz z pogrubionym, zamrożonym nagłówkiem.
- **CSV** (`csv.js`): kodowanie jest rozpoznawane po znaczniku BOM, poprawności UTF-8,
  a na końcu po bajtach polskich liter (Windows-1250 albo ISO-8859-2); separator – po tym,
  przy którym początkowe rekordy mają najrówniejszą liczbę pól. Oba ustawienia użytkownik
  może zmienić w kreatorze. Zapis używa UTF-8 ze znacznikiem BOM i średników, bo tak
  plik otwiera się poprawnie w polskim Excelu.

Odczyt każdego formatu daje tę samą tabelę: `{ rows: [{ number, cells }], columnCount }`,
gdzie `number` to numer wiersza widoczny w arkuszu – używany w komunikatach walidacji.

Dalsza droga jest wspólna:

1. `analyzeHeader()` rozpoznaje pola po nagłówkach (rdzenie słów po polsku i angielsku
   oraz oznaczenie języka) i proponuje przypisanie kolumn.
2. `buildImportRows()` zamienia wiersze pliku na wiersze importu i zbiera błędy oraz
   ostrzeżenia. Pusta komórka dziedziny, modułu lub lekcji przejmuje wartość z wiersza
   powyżej (scalone komórki), o ile w tym wierszu nie zmienił się poziom wyżej.
3. `Library.planImport()` wylicza, co powstanie i co stanie się z każdym wierszem, bez
   zapisu. Plan i właściwy import wykonuje **ten sam kod** (`#runImport`) – z transakcją
   albo bez niej – więc podgląd w kreatorze nie może rozminąć się z wynikiem.
4. `Library.importRows()` zapisuje wszystko jedną transakcją.

Duplikat to pojęcie o tych samych znormalizowanych nazwach PL i EN w tej samej lekcji.
Tryb „aktualizuj” nadpisuje tylko pola, które wiersz rzeczywiście niesie: brak kolumny
albo pusta komórka nie kasują treści, a identyfikator pojęcia się nie zmienia, więc postępy
i historia nauki zostają. Powtórzenia w samym pliku są pomijane.

Eksport zapisuje te same kolumny, które rozpoznaje import, dzięki czemu plik można poprawić
w arkuszu i wczytać z powrotem.

## Kopia zapasowa

Jeden plik JSON: nagłówek (format, wersje, data, liczniki) i zawartość wszystkich magazynów.
Przywracanie najpierw sprawdza cały plik (format, wersję, unikalność identyfikatorów,
powiązania hierarchii), przelicza klucze wyszukiwania i dopiero wtedy zastępuje bazę
jedną transakcją. Uszkodzony plik niczego nie zmienia. Dane nauki wskazujące na
nieistniejące pojęcia są pomijane.

## Testy

- `tests/unit/` – Node.js (`node --test`), bez przeglądarki: reguły biblioteki, wycofywanie
  nieudanych zmian, glosariusz, odczyt i zapis plików, import i eksport, kopia zapasowa,
  spójność plików wydania.
- `tests/fixtures/` – pliki testowe wygenerowane w openpyxl i LibreOffice
  (`tools/gen_fixtures.py`), żeby odczyt nie był sprawdzany wyłącznie na plikach własnych.
- `tests/e2e/` – Chromium przez Playwright: pełne przepływy na ekranie telefonu i komputera,
  trwałość po przeładowaniu, praca offline, aktualizacja wydania, klawiatura.

## Przygotowanie kolejnych etapów

- **Fiszki i powtórki (etapy 3–4)** zapiszą oceny w `assessments` i `reviews`, a stan
  harmonogramu w `progress`. Brakujące pola pojęcia nie będą liczone jako nieznane –
  funkcje `availableElementCount()` i `assessmentStatus()` są już w `model.js`.
- **Quizy i statystyki (etapy 5–6)** korzystają z magazynów sesji i dzienników.
