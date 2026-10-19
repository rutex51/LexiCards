# Architektura LexiCards

Dokument opisuje stan wersji 1.1. Zgodność ze specyfikacją i wyniki sprawdzenia całości:
[RELEASE-1.0.md](RELEASE-1.0.md); notatki do lekcji (1.1): [RELEASE-1.1.md](RELEASE-1.1.md).

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
js/ui/speech.js            wymowa przez syntezator mowy przeglądarki
js/ui/material.js          wybór materiału (dziedzina, moduł, lekcje) wspólny dla nauki i quizu
js/ui/charts.js            wykresy SVG (w czasie, pasek udziałów, miernik) z podpowiedzią i tabelą danych
js/ui/listen-player.js     odtwarzacz słuchania: kolejne kroki czytane syntezatorem mowy, pauza, dalej, powtórz
js/ui/notes.js             okno notatki lekcji: podgląd, edytor z paskiem formatowania, obrazy, powiększanie
js/ui/images.js            obrazy w przeglądarce: odczyt, zmniejszanie dużych zdjęć, adresy do wyświetlenia
js/core/library.js         model w pamięci + wszystkie operacje na danych
js/core/storage.js         adaptery zapisu: IndexedDB i pamięć
js/core/model.js           kształt rekordów, wartości domyślne, stałe
js/core/backup.js          kopia zapasowa: tworzenie, walidacja, przywracanie
js/core/zip.js             odczyt i zapis archiwów ZIP
js/core/xlsx.js            odczyt i zapis skoroszytów XLSX
js/core/csv.js             kodowanie, separator, odczyt i zapis CSV
js/core/tablefile.js       rozpoznanie formatu pliku, wspólna postać tabeli
js/core/importer.js        nagłówki → pola, wiersze pliku → wiersze importu, walidacja
js/core/exporter.js        zakres eksportu → plik XLSX (z arkuszem notatek) lub CSV; wzór importu
js/core/note-format.js     treść notatki: bezpieczny HTML ↔ dokument ↔ tekst sformatowany komórki arkusza
js/core/note-import.js     arkusz notatek: rozpoznanie, wiersze → notatki lekcji z obrazami
js/core/page-curl.js       zaginana kartka notatki: chwyt, zgięcie, odbicie płata, ograniczenia papieru
js/core/note-refs.js       sygnatury obrazów notatki i odwołania [[sygnatura]] w treści
js/core/images.js          format i wymiary obrazu z nagłówka pliku
js/core/study.js           fiszki: dobór do sesji, treść stron, ocena, postęp, podsumowanie
js/core/fsrs.js            algorytm powtórek FSRS-6 (przeniesiony z py-fsrs 6.3.2)
js/core/quiz.js            quizy: pytania wyboru, rundy par, test mieszany, odpowiedzi, wynik
js/core/stats.js           statystyki: statusy w kierunkach, elementy, szeregi dzienne, zestawienia, czas nauki
js/core/listen.js          słuchanie: kroki pojęcia (pojęcie, przerwa, odpowiedź, definicja, przykład), szacunek czasu
js/core/text.js            normalizacja tekstu, tagi, odmiana liczebników
```

Zależności biegną tylko w dół: ekrany znają bibliotekę, biblioteka zna adapter zapisu.

## Dane

Wszystkie rekordy mają identyfikator UUID i daty w formacie ISO.

| Magazyn | Zawartość | Klucze powiązań |
| --- | --- | --- |
| `domains` | dziedziny: nazwa, opis, ikona, kolor, kolejność | – |
| `modules` | moduły | `domainID` |
| `lessons` | lekcje; od 1.2 data ręcznego oznaczenia „utrwalona” (`consolidatedAt`, puste – nieoznaczona) | `moduleID`, `domainID` |
| `terms` | pojęcia: 6 pól treści, tagi, trudność, notatki, ulubione | `lessonID`, `moduleID`, `domainID` |
| `progress` | ostatnia ocena pojęcia w danym kierunku i jego harmonogram FSRS (`schedule`) | `termID` + klucze zakresu |
| `assessments` | historia ocen fiszek – jeden wpis na zatwierdzoną fiszkę, od wersji 0.6.0 z czasem nad fiszką (`duration`, ms, najwyżej 3 min) | indeks `termID` |
| `reviews` | dziennik powtórek FSRS – ocena 1–4, stan przed i po, stabilność, trudność, odstęp | indeks `termID` |
| `quizAnswers` | odpowiedzi w quizach – jedna na pytanie wyboru albo parę: odpowiedź wybrana i poprawna, wynik, podpowiedź, czas | indeks `termID`, `sessionID` |
| `studySessions` | dziennik zakończonych sesji nauki | – |
| `quizSessions` | historia wyników quizów: rodzaj, kierunek, liczby odpowiedzi, procent, próg, zaliczenie, czas, limit, błędne pojęcia | – |
| `settings` | jeden rekord `app`: wygląd, wymowa, ustawienia nauki i quizu (od 1.2 okres powtórek lekcji utrwalonych `consolidatedReviewDays` i znacznik `domainColorsGray`), trwająca sesja nauki i trwający quiz | – |
| `notes` | notatka lekcji (od 1.1): treść w znormalizowanym HTML (`html` po polsku, od 1.6 `htmlEN` po angielsku), opis obrazów (typ, wymiary, rozmiar, CRC-32, od 1.6 `label` – sygnatura) i `imagesFirst` – obrazy bez odwołania w podglądzie przed tekstem (od 1.5) – w pamięci | identyfikator = `lessonID` |
| `noteImages` | bajty obrazów notatek (`ArrayBuffer`) – czytane z bazy dopiero przy otwarciu notatki | `lessonID` |

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
  numer formatu – zmiany w kolejnych etapach będą migracjami, nie przebudową. Wersja 1.1
  podniosła `DB_VERSION` do 2: przy otwarciu powstają magazyny `notes` i `noteImages`,
  istniejące dane zostają bez zmian.
- **Obrazy poza pamięcią.** Notatka w pamięci ma tylko tekst i opis obrazów; bajty są w osobnym
  magazynie, czytane przy otwarciu notatki. Obrazy są zapisane jako `ArrayBuffer`, nie `Blob`
  (Safari miewał kłopoty z `Blob` w IndexedDB). Notatka znika razem z lekcją, modułem
  i dziedziną; kopia lekcji ma kopię notatki z własnymi obrazami.
- **Utrwalenie tylko w lekcji** (od 1.2). Moduł nie ma własnego pola: jest utrwalony, gdy ma
  lekcje i wszystkie są utrwalone (`isModuleConsolidated()`), a „Oznacz jako utrwalony” oznacza
  wszystkie jego lekcje. Dzięki temu nie ma dwóch źródeł prawdy: nowa lekcja (nieoznaczona)
  sama sprawia, że moduł przestaje być utrwalony.
- **Szare ikony dziedzin** (od 1.2): domyślny kolor to `gray`. Przy wczytaniu bazy bez znacznika
  `domainColorsGray` w ustawieniach (dane sprzed 1.2, także przywrócona kopia z 1.1) wszystkie
  dziedziny dostają szare tło jeden raz, a znacznik zostaje zapisany. Pusta aplikacja przy
  pierwszym otwarciu niczego nie zapisuje; znacznik powstaje przy pierwszym wyborze koloru
  dziedziny innego niż szary, żeby ten wybór przetrwał ponowne otwarcie.

## Zapis zmian

Biblioteka trzyma materiały w pamięci (mapy), a każdą zmianę wykonuje przez `#mutate()`:

1. `UnitOfWork` zapamiętuje stan rekordów sprzed zmiany i zbiera zapisy oraz usunięcia.
2. Funkcja operacji sprawdza dane i modyfikuje pamięć.
3. Adapter zapisuje wszystko **jedną transakcją** IndexedDB.
4. Jeśli walidacja albo zapis się nie powiedzie, pamięć wraca do stanu sprzed zmiany.

Operacje są kolejkowane, więc dwie zmiany nigdy się nie przeplatają. Po udanej zmianie
biblioteka zwiększa numer rewizji, unieważnia wyliczone liczniki i powiadamia ekrany.
Operacja może też zostawić w `unit.notices` komunikat dla interfejsu (od 1.2: utrata statusu
„utrwalona”); słuchacze `onNotice()` dostają go dopiero po udanym zapisie, więc zmiana
wycofana po błędzie nie pokazuje komunikatu.

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
  przywracane jest przewinięcie listy. Od 1.7 pasek nawigacji ma też przyciski ← i → (historia
  ekranów – `history.back()` / `forward()`, ważne w trybie pełnoekranowym bez przycisków
  przeglądarki), obok strzałki „poziom wyżej”. Router numeruje wpisy historii aplikacji
  (`lexicardsIndex` w `history.state`, ostatnia pozycja „dalej” w `sessionStorage`, więc przetrwa
  przeładowanie): nowy ekran – pozycja + 1 i koniec „dalej”, zastąpienie adresu (`replace`) – ta sama
  pozycja, powrót do znanego wpisu – pozycja z wpisu. ← jest aktywne od drugiego ekranu, → –
  po cofnięciu; oba ukryte, gdy nie ma dokąd przejść, i nigdy nie wychodzą poza aplikację.
- **Okna** to natywny `<dialog>`: przeglądarka pilnuje fokusu, klawisza Esc i blokady tła.
- **Układ**: poniżej 900 px zakładki u dołu, powyżej panel boczny; glosariusz na szerokim
  ekranie jest tabelą. Rozmiar tekstu na iPhonie podąża za ustawieniem systemowym.
- Stan jest zawsze nazwany tekstem lub ikoną, nie samym kolorem; brak treści to „Brak danych”.
- **Motyw i kolor aplikacji** to dwa niezależne ustawienia (`appearance`, `accentColor`).
  Motyw ustawia atrybut `data-theme` (brak – zgodnie z systemem), kolor – `data-accent`
  (brak – niebieski). Każdy kolor (`--tone-<kolor>`, `-fill`, `-soft` w `css/app.css`) ma
  wersję jasną i ciemną z kontrastem co najmniej 4,5:1 dla tekstu i przycisków, a reguła
  `:root[data-accent=…]` tylko podstawia go pod `--accent`, `--accent-fill` i `--accent-soft`,
  z których korzysta reszta stylów. `js/theme-boot.js` ustawia oba atrybuty z pamięci lokalnej,
  zanim strona się narysuje. Kolory znaczące (zielone „Umiem”, czerwone usuwanie, statusy)
  i wykresy nie zależą od wybranego koloru.

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
  jest pomijane. Zapis tworzy arkusze z pogrubionym, zamrożonym nagłówkiem; od wersji 1.1
  także tekst sformatowany w komórce i obrazy zakotwiczone przy komórce (arkusz notatek).
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

### Notatki w arkuszu (od 1.1)

- **Rozpoznanie arkusza** (`classifyTable`): arkusz notatek ma kolumnę treści (`Note`, „Notatka”,
  „Treść”…) albo obrazów (`Image`, „Obraz”…), nie ma kolumn pojęć i albo nazywa się
  „Notatki”/„Notes”, albo ma kolumnę lekcji. Każdy inny arkusz z danymi to arkusz pojęć –
  pliki bez notatek przechodzą przez kreator dokładnie tak jak wcześniej.
- **Odczyt z formatowaniem** (`readSheet(i, { rich: true })`): fragmenty tekstu komórki
  z właściwościami czcionki (`<rPr>`; brak właściwości – czcionka komórki ze `styles.xml`),
  kolory RGB, motywu (`theme1.xml`) i indeksowane. Obrazy: rysunki zakotwiczone przy komórce
  (`drawing*.xml`, lewy górny róg kotwicy) oraz obrazy „w komórce” Excela 365 (atrybut `vm`
  komórki → `metadata.xml` → `richData/rdrichvalue.xml` → struktura `_localImage` →
  `richValueRel.xml` → plik w `xl/media`).
- **Treść** (`docFromRichText`): wiersze komórki stają się akapitami (pusty wiersz) albo
  złamaniami; „•”, „-”, „1.” to listy, wcięcie to poziom, „#” albo większy pogrubiony wiersz
  to nagłówek; kolory są przybliżane do pięciu kolorów notatek; `**…**` i `*…*` działają
  także w CSV. Eksport (`richTextFromDoc`) zapisuje notatkę tak, żeby import odtworzył ją
  bez zmian – sprawdza to test.
- **Wiersze → notatki** (`buildNoteRows`): wiersze tej samej lekcji (z przejmowaniem nazw
  z wiersza powyżej) składają się na jedną notatkę; obraz należy do ostatniego wiersza z danymi
  nie niżej niż obraz. Formaty, których przeglądarka nie pokaże (EMF, WMF), są pomijane
  z ostrzeżeniem; duże zdjęcia kreator zmniejsza (`prepareImage`, dłuższy bok 2048 px).
- **Import** idzie razem z pojęciami w `#runImport`: najpierw pojęcia, potem notatki, z tymi
  samymi mapami nazw – notatka trafia też do lekcji, którą tworzą pojęcia z tego samego pliku.
  Sama nazwa lekcji (bez dziedziny i modułu) musi wskazywać dokładnie jedną lekcję. Lekcja z
  notatką: zastąp (domyślnie), dopisz albo pomiń; ta sama treść i te same obrazy (CRC-32) – „bez zmian”.
- **Od 1.6** arkusz ma też kolumny `Note EN` (wersja angielska; `guessNoteField` rozpoznaje język
  jak w arkuszu pojęć – „Note EN”, „Notatka po angielsku”) i `Image label` (sygnatura obrazu z tego
  wiersza; „Label”, „Sygnatura”, „Etykieta”). Nagłówek „Note EN” nie jest już brany za kolumnę
  pojęcia (`guessField` pomija język przy nazwach pól innych niż pojęcie). Wiersz komórki z samym
  `[[…]]` jest zawsze osobnym akapitem (także po pojedynczym Alt+Enter). Arkusz bez `Note EN` nie
  zmienia wersji angielskiej istniejącej notatki (pole `htmlEN` nie trafia do importu), a eksport
  zapisuje obie wersje i sygnatury – import odtwarza notatkę bez zmian (test).

### Treść notatki

Notatka jest zapisana jako HTML z wąskiego zestawu znaczników (`<p>`, `<h3>`, listy, `<strong>`,
`<em>`, `<u>`, `<s>`, `<sup>`, `<sub>`, `<span data-color>`, `<a href>` http/https/mailto, `<br>`).
`normalizeNoteHtml()` przepuszcza przez ten filtr wszystko: wklejony HTML (Word, strony, Google
Docs, Notatki, tabele z Excela), zawartość edytora przy zapisie, kopię zapasową i podgląd. Własny
parser HTML w `js/core` pozwala testować to w Node.js; w przeglądarce wklejony HTML najpierw
porządkuje `DOMParser`. Edytor to `contenteditable` z `document.execCommand` (cofanie Ctrl+Z
działa), kolory zapisane są nazwą, więc w ciemnym motywie są jaśniejsze. „Kopiuj notatkę”
kładzie do schowka HTML z kolorami w stylu i obrazami jako `data:` (przed tekstem albo po nim,
jak w podglądzie) oraz zwykły tekst.

Od 1.6 **sygnatury i odwołania** (`js/core/note-refs.js`): każdy obraz ma w notatce `label` –
brakujący albo powtórzony dostaje kolejną wolną „Obraz N” (`withImageLabels`, przy zapisie, w kopii
zapasowej i przy odczycie starych notatek), więc sygnatura nie zmienia się przy przesuwaniu obrazów.
Akapit z samym `[[sygnatura]]` (`referenceLabel`; porównanie `labelKey` – bez wielkości liter,
znaków diakrytycznych i odstępów) to w podglądzie obraz (`contentUnits` w `note-book.js`); odwołanie
bez obrazu zostaje tekstem z klasą `note-ref--missing` (czerwony), a obrazy bez odwołania idą przed
tekst albo za niego. W edytorze miniatura pokazuje sygnaturę, menu obrazu ma „Wstaw do tekstu”
(akapit z odwołaniem w miejscu kursora – ta sama funkcja co „Nowa strona”: `insertBlock`) i „Zmień
sygnaturę” (jedyna w notatce; `renameReferences` zmienia odwołania w obu wersjach językowych).
„Kopiuj notatkę” wstawia obrazy w miejsca odwołań.

Od 1.6 **wersja angielska**: `htmlEN` obok `html`; w edytorze przełącznik Polski / Angielski zamienia
treść jednego pola `contenteditable` (stan drugiej wersji jest w pamięci edytora; zmiana języka
kończy historię cofania), z `lang` pola dla sprawdzania pisowni. Podgląd: przełącznik PL / EN, gdy
notatka ma obie wersje; wybór w ustawieniach (`noteLanguage`), a gdy wybranej wersji nie ma –
pokazuje się ta, która jest. Zapis bez `htmlEN` (import) zostawia wersję angielską.

Od 1.6 **czytanie na głos** (`noteReader` w `js/ui/notes.js`): fragmenty z `book.readingParts()`
(nagłówki, akapity, punkty list – bez list zagnieżdżonych i odwołań bez obrazu) dzielone na zdania,
czytane po kolei przez `speakThen()` (głos i tempo z Ustawień, język wersji) – pierwsza wypowiedź
pada w obsłudze dotknięcia (wymóg Safari). Start od pierwszego fragmentu widocznej strony; czytany
akapit ma klasę `note-reading`, a `book.showPage()` przewraca kartkę, gdy czytanie przechodzi na
następną stronę. Pauza przerywa zdanie i wznawia od niego; po ponownym podziale na strony (obrót
telefonu) czytanie idzie dalej od widocznej strony. Zmiana wersji, edycja i zamknięcie okna kończą
czytanie.

Od 1.5 w edytorze sekcja obrazów jest na górze, nad tekstem, a przy obrazach jest wybór „W podglądzie:
Przed tekstem / Po tekście” (`imagesFirst` w notatce, domyślnie po tekście). Zapis bez tego pola
(import z arkusza, w każdym trybie) zostawia wybór notatki; kopia lekcji i kopia zapasowa go
przenoszą. Arkusz XLSX go nie zawiera – kolumna Image to tylko obrazy po kolei.

Od 1.3 dokument ma też blok `break` – podział na strony. W HTML to `<hr data-page="">`
(zwykła linia `<hr>`, np. ze strony WWW, tylko kończy akapit); podział strony z Worda
(`page-break-before: always`, `break-before: page`) też go daje. Podział nigdy nie stoi na
początku, na końcu ani dwa razy z rzędu (`normalizePageBreaks`). W zwykłym tekście i w komórce
arkusza to wiersz `---` – eksport i import dają tę samą notatkę. Przycisk „Nowa strona” w edytorze
wstawia podział między blokami: na końcu bloku (z pustym akapitem do pisania dalej), w środku
akapitu (akapit dzieli się na dwa) albo w liście (lista dzieli się po bieżącym punkcie).

### Notatka w stronach (od 1.3)

Podgląd notatki to książka (`js/ui/note-book.js`) – strona ma wysokość okna, więc nic się nie
przewija:

- **Podział na strony** liczy przeglądarka: treść (`contentUnits`: akapity, nagłówki, punkty list,
  podziały, obrazy) trafia po kolei do niewidocznej strony pomiarowej o tej samej szerokości
  i stylach. Akapit albo punkt listy, który się nie mieści, jest dzielony między wyrazami
  (wyszukiwanie binarne po początkach wyrazów; `Range.cloneContents()` zachowuje formatowanie
  po obu stronach), o ile na dole zostały co najmniej ~2 wiersze. Lista na kolejnej stronie ma
  `start`, a ciąg dalszy punktu – bez drugiego punktora. Nagłówek nie zostaje sam na dole strony.
  Obrazy są po tekście albo – gdy notatka ma `imagesFirst` (od 1.5) – przed nim; tekst po obrazie
  zaczyna nowy blok pod obrazem. Obrazy są zmniejszone najwyżej do wysokości strony; obraz, który
  nie mieści się pod tekstem, zostaje na tej stronie zmniejszony, jeśli zachowa co najmniej 55% wysokości
  (i 140 px) – inaczej przechodzi na następną. Blok niepodzielny wyższy niż strona (np. długa
  lista zagnieżdżona) dostaje stronę przewijaną – jedyny wyjątek.
- **Jedna strona** wygląda jak dawniej: karta o wysokości treści, bez przycisków stron. Na
  szerokim ekranie okno dostaje stałą wysokość tylko wtedy, gdy stron jest kilka.
- **Ponowny podział** po zmianie wielkości okna (np. obrót telefonu) zachowuje miejsce w treści:
  pokazuje stronę z tą samą pierwszą jednostką.
- **Przewracanie (od 1.4 – kartka zaginana od rogu):** geometria jest w `js/core/page-curl.js`
  (bez przeglądarki, z testami logiki), rysowanie w `note-book.js`. Układ kartki: grzbiet na x = 0,
  kartka W × H po prawej. Chwyt zależy od wysokości dotknięcia: górne 30% – górny róg, dolne 30% –
  dolny róg, środek – krawędź (róg porusza się tylko w poziomie, więc zgięcie jest pionowe). Róg
  przesunięty do punktu P: zgięcie to symetralna odcinka róg–P; płaska część strony to przycięcie
  prostokąta półpłaszczyzną (Sutherland–Hodgman, `clip-path: polygon()`), a zagięty płat – część
  po stronie rogu odbita względem zgięcia (macierz odbicia w `transform: matrix()`, wyznacznik −1,
  więc tekst jest w lustrze). Papier się nie rozciąga: róg nie może być dalej od końców grzbietu
  niż na płaskiej kartce (rzut na okręgi), dolny róg nie schodzi poniżej strony, górny nad nią –
  kartka nie odrywa się od grzbietu. Płaskie zgięcie zamiast prawdziwego wygięcia (walca):
  zaokrąglenie udaje jasny pas na płacie, bez zamiany strony na obraz.
- **Warstwy w trakcie przewracania** (w kolejności): strona pod spodem, cień rzucany na nią
  (pas gradientu wzdłuż zgięcia, przycięty do odsłoniętej części; szerokość i siła rosną z
  „uniesieniem” sin(π·postęp)), przewracana strona przycięta do płaskiej części, cień przy zgięciu
  na płaskiej części, płat (odwrót kartki z jasnym pasem przy zgięciu i miękkim cieniem
  `drop-shadow` pod sobą). Od 1.4.1 płat może wyjść poza strony – nad tytuł lekcji, pasek okna
  i przyciski pod stronami: na czas przewracania część okna z treścią nie przycina zawartości
  (`:has(> .note-book--turning)`), a książka leży nad przyciskami (`z-index`); przycina dopiero
  panel okna z zaokrąglonymi rogami. W jednej stronie płat jest przycięty w poziomie do strony
  (`clip-path: inset(-200vh 0)`) – znika za lewą krawędzią, bez paska kartki w marginesie. Klatki rysuje `requestAnimationFrame`; po skończeniu
  warstwy znikają, a strony wracają bez stylów.
- **Odwrót kartki:** w jednej stronie to kopia tej samej strony (`inert`, `aria-hidden`), wyblakła
  (przezroczystość treści 0,2) i odbita – prześwitujący tekst. W dwóch stronach to prawdziwa
  strona, która po przewróceniu leży po drugiej stronie grzbietu (w przód – nowa lewa), złożona
  z lustrem strony, więc po odbiciu jest czytelna; na końcu ruchu jest dokładnie na swoim miejscu.
- **Gest:** kartka leżąca płasko – róg idzie za palcem (z naturalnym uniesieniem dolnego rogu
  w górę, górnego w dół, które znika pod koniec ruchu); jedna strona wstecz – poprzednia kartka
  wraca spoza lewej krawędzi, a zgięcie idzie za palcem. Po puszczeniu kartka kończy ruch albo
  wraca (28% szerokości albo szybki ruch). Przyciski ‹ › i klawisze ←/→, Page Up/Down przewracają
  od dolnego rogu łukiem (`cornerPath`), Home/End – bez animacji. Kółko myszy i przewijanie na
  gładziku (od 1.4.1, `handleWheel`, nasłuch na panelu okna): w dół lub w lewo – następna strona,
  w górę – poprzednia; ruch sumuje się do 40 px, a kolejną kartkę przewraca dopiero ruch po 180 ms
  ciszy, więc bezwładność gładzika nie przerzuca kilku stron; strona przewijana najpierw się
  przewija, Ctrl + kółko (powiększenie) zostaje przeglądarce. Mysz: kartkę chwyta się za
  narożnik strony (48 px; kursor `grab`), kliknięcie narożnika przewraca; w pozostałym miejscu
  mysz zaznacza tekst. Ograniczony ruch – strony zmieniają się od razu. Fokus z usuwanej strony
  (np. z obrazu) przechodzi na okno, żeby klawisze działały dalej; po otwarciu okna fokus jest na
  panelu, a nie na „Zamknij” (bez ramki fokusu w Safari).
- **Dwie strony obok siebie** (od 1.4): gdy okno ma co najmniej 960 × 520 px, notatka ma kilka
  stron, a wybór jest włączony (`noteSpread` w ustawieniach, domyślnie tak; przycisk z otwartą
  książką obok numeru strony). Okno jest szersze (do 1280 px), strony liczone są dla połowy
  szerokości, widać parę (lewa – nieparzysta), wskaźnik „3–4 z 7”, przy nieparzystej liczbie stron
  na końcu pusta kartka. Wstecz przewraca się lewa strona – ten sam rachunek w układzie odbitym.
- **Pomiar w otwierającym się oknie:** na komputerze okno pojawia się z animacją powiększenia
  (od 96%); podział na strony przelicza wysokości z `getBoundingClientRect` przez to powiększenie
  (stosunek do `offsetWidth`), więc strony nie wychodzą za długie (błąd z 1.3, poprawiony w 1.4).
  Po ponownym podziale pokazywana jest pierwsza strona zaczynająca się od zapamiętanej jednostki –
  notatka zaczynająca się długim akapitem otwiera się na pierwszej stronie, a nie na ostatniej
  części akapitu (też poprawione w 1.4).

## Nauka z fiszkami

Reguły są w `js/core/study.js` (bez przeglądarki), zapis w `Library`, ekrany w
`js/ui/screens/study-setup.js` i `study-session.js`.

- **Sesja to kolejka** `[{ termID, direction }]` zbudowana z wybranego materiału, kierunku
  (PL → EN, EN → PL albo mieszany – wtedy każde pojęcie raz, w jednym z kierunków), zakresu
  i liczby fiszek. Trwająca sesja leży w ustawieniach (`activeStudySession`), więc przeżywa
  zamknięcie strony i trafia do kopii zapasowej.
- **Ocena** to stan trzech kafelków: `true`, `false` albo `null` („Brak danych” – pojęcie
  nie ma opisu lub przykładu). Wynik liczy się względem dostępnych elementów (2/2, 1/1),
  a status wynika z proporcji: komplet – opanowane, co najmniej połowa – częściowo opanowane,
  mniej – w trakcie nauki, zero – do nauki.
- **Zatwierdzenie fiszki jest jedną transakcją:** wpis w `assessments` (tylko dopisywany),
  rekord `progress` dla pary pojęcie + kierunek oraz przesunięcie sesji. Biblioteka sama
  ustala, które elementy pojęcie ma, więc ocena brakującego elementu nie może trafić do bazy.
- **„Umiem” to komplet:** przy tej decyzji biblioteka zalicza wszystkie dostępne elementy,
  niezależnie od zaznaczenia. „Powtórz” zapisuje kafelki tak, jak je zaznaczono; grupy po sesji
  (`REPEAT_KINDS`): odłożone (ostatnia decyzja „Powtórz”), częściowo zapamiętane (wynik między
  zerem a kompletem), nieznane (wynik zero).
- **Powtórzenie sesji:** sesja przechowuje `baseQueue` – pełny zestaw fiszek, także w rundzie
  powtórkowej. Zamknięta sesja z ocenami trafia do ustawień jako `lastStudySession`
  (`config` + `queue`). `repeatStudy(random, kind)` zaczyna jedną transakcją: całą sesję
  (`all`, nowa sesja) albo kolejną rundę z odłożonymi (`repeat`), częściowo zapamiętanymi
  (`partial`) lub nieznanymi (`unknown`). Grupy wynikają z najnowszej oceny każdej fiszki
  pełnego zestawu (`REPEAT_KINDS`), więc obejmują wszystkie rundy sesji. `repeatChoices()`
  zwraca polecenia do pokazania, bez grup identycznych z „odłożonymi”.
- **Cofnięcie** usuwa ostatni wpis historii i przywraca poprzedni rekord postępu, zapamiętany
  w wyniku fiszki. Działa także z ekranu podsumowania.
- **Stos** (od 1.3): pod fiszką leżą najwyżej dwie następne z kolejki – pierwsza ze stroną
  pytania (bez przycisków, `inert`, `aria-hidden`), druga pusta – przesunięte o 6 i 11 px w dół
  i zwężone (od 1.4 o 4 i 7 px – fiszki leżą bliżej siebie). Przy obrocie i przeciąganiu widać następną; przy wyrzuceniu stos podnosi się o jedno
  miejsce (te same 220 ms co lot fiszki), a nowa fiszka pojawia się w tym samym położeniu bez
  animacji wejścia (`data-enter="stack"`, także przy kolejnych odświeżeniach ekranu). Ostatnia
  fiszka nie ma nic pod spodem; miejsce pod stosem jest zarezerwowane zawsze, więc fiszka nie
  zmienia wysokości w trakcie sesji. Od 1.5.1 także podpowiedź pod przyciskami („Odwróć fiszkę…”)
  po obrocie tylko znika (`visibility: hidden`), zostawiając miejsce – fiszka ma tę samą wielkość
  przed i po obrocie, a przyciski się nie przesuwają.
- **Dzienniki** (`assessments`, `studySessions`) nie są trzymane w pamięci: zapis idzie przez
  `UnitOfWork.append()` / `erase()` w tej samej transakcji co reszta zmian, a odczyt historii
  pojęcia przez indeks `termID`.
- **Zakresy:** „Nowe” – bez żadnej oceny w kierunku; „Do powtórki” – termin FSRS minął
  (kolejka od najdłużej czekających, limit liczby fiszek bierze najbardziej zaległe);
  „Trudne” – trudność 4–5 ustawiona przez użytkownika, trudność FSRS ≥ 7 albo ostatnia ocena
  poniżej połowy; „Nie znam pojęcia / definicji / przykładu” – w ostatniej ocenie w kierunku
  fiszki dany kafelek był niezaznaczony (`knowsTerm`, `knowsDescription`, `knowsExample`
  równe `false`; `null` – element nie istnieje – nie jest brakiem wiedzy).
- **Status w glosariuszu i lekcji** (`statusChips()` w `js/ui/screens/terms.js`): tylko poziom
  ostatniej oceny (`termStatus()`), w kierunku ze Statystyk albo – dla obu – słabszy z dwóch.
  „Do powtórki” (`isTermDue()`) nie ma oznaczenia przy pojęciu (decyzja z wersji 1.0.1) –
  pokazują je filtr, liczba na Starcie i szczegóły pojęcia. Filtr glosariusza (`status`,
  `statusDirection` w `Library.glossary()`) używa tych samych reguł (`matchesTermStatus()`).

## Powtórki (FSRS)

- **Algorytm:** `js/core/fsrs.js` to wierne przeniesienie klasy `Scheduler` z py-fsrs 6.3.2
  (FSRS-6, 21 parametrów, krótkoterminowa stabilność dla powtórek tego samego dnia, kroki nauki,
  rozmycie odstępów). Zaokrąglenia odtwarzają `round()` z Pythona. Zgodność sprawdza
  `tests/unit/fsrs.test.js` na 1113 powtórkach policzonych przez oryginał
  (`tools/gen_fsrs_reference.py` → `tests/fixtures/fsrs-reference.json`).
- **Ustawienia:** domyślne parametry, docelowa skuteczność z Ustawień (domyślnie 90%), kroki
  nauki 1 i 10 min, ponowna nauka 10 min, najdłuższy odstęp 36500 dni, rozmycie włączone.
- **Ocena 1–4** (`fsrsRating()`): pojęcie nieznane – Again; komplet z „Umiem” – Good; pojęcie
  znane bez kompletu albo komplet z „Powtórz” – Hard; Easy nigdy automatycznie.
- **Harmonogram** leży w `progress.schedule` (stan, krok, stabilność, trudność, termin,
  ostatnia powtórka, liczba powtórek i zapomnień), osobno dla pary pojęcie + kierunek.
  Zatwierdzenie fiszki zapisuje w jednej transakcji: ocenę (`assessments`), powtórkę
  (`reviews`), postęp z harmonogramem i stan sesji. Cofnięcie usuwa oba wpisy i przywraca
  poprzedni postęp razem z harmonogramem.
- **Podgląd i zapis zgodne:** ekran losuje jedną wartość rozmycia na fiszkę i podaje ją zarówno
  do `previewStudyDecision()`, jak i do `recordStudyDecision()`.
- **Status a poziom:** status ostatniej oceny (`lastStatus`) i poziom długoterminowy z FSRS
  (`masteryLevel()`: nowe, w nauce, utrwalane, utrwalone od stabilności 21 dni) są osobno.
- **Dane sprzed FSRS:** przy wczytaniu biblioteka szuka postępów bez harmonogramu i odtwarza
  go z historii ocen (te same chwile, bez rozmycia), dopisując wpisy `reviews` z `migrated: true`.
  Dotyczy to też przywrócenia starszej kopii zapasowej.
- **Lekcje utrwalone** (od 1.2, `cardDueTime()` w `js/core/study.js`): termin fiszki z lekcji
  oznaczonej jako utrwalona to późniejszy z dwóch – terminu FSRS i okresu z Ustawień
  (`consolidatedReviewDays`, domyślnie 30 dni) liczonego od oznaczenia albo od ostatniej powtórki,
  jeśli była później. Wyjątek: fiszka oceniona po oznaczeniu na mniej niż „Opanowane” wraca według
  zwykłego FSRS, dopóki znów nie zostanie opanowana. Harmonogram FSRS w `progress.schedule` się
  nie zmienia – utrwalenie tylko odsuwa termin, więc cofnięcie oznaczenia przywraca zwykłe
  powtórki. Zakres „Nowe” pomija pojęcia lekcji utrwalonych. `cardDueTime()` jest używane wszędzie,
  gdzie liczy się zaległość: zakres „Do powtórki”, kolejka i prognoza na Starcie, statystyki,
  szczegóły pojęcia.
- **Zdejmowanie utrwalenia:** `createTerm`, `moveTerms` (do innej lekcji), `copyTerms` i import
  (nowe pojęcia, nie aktualizacje) czyszczą `consolidatedAt` lekcji docelowej w tej samej
  transakcji. Nowa lekcja w module utrwalonym (utworzona, przeniesiona albo z importu) zgłasza
  komunikat o module. `planImport()` zwraca listę `unconsolidated`, którą kreator pokazuje
  przed importem. Edycja, usunięcie pojęcia i zmiany notatki statusu nie zmieniają.
- **Powtórka na dziś** (`reviewConfig()`): zaległe fiszki z całej biblioteki, w trybie
  mieszanym jedno pojęcie raz – w kierunku, który czeka dłużej. `reviewForecast()` liczy
  zaległe, dzisiejsze i jutrzejsze według czasu urządzenia.

Ekran sesji przebudowuje widok tylko po zmianie danych (zatwierdzenie, cofnięcie). Obrót,
kafelki i przeciąganie zmieniają istniejące elementy, żeby animacje nie zaczynały się od nowa.
Gest korzysta ze zdarzeń wskaźnika; strona fiszki ma `touch-action: pan-y`, dzięki czemu
ruch w pionie przewija długą treść, a ruch w poziomie trafia do aplikacji. Wymowa używa
`speechSynthesis` z głosami systemu – nic nie jest wysyłane do sieci.

Safari potrafi „zawiesić” wypowiedź: nie zaczyna jej, nie zgłasza końca ani błędu, a następne
czekają za nią w kolejce, więc syntezator milknie do przeładowania strony. Dlatego każda
wypowiedź w `js/ui/speech.js` ma strażnika:

- gdy nie zacznie się w ciągu 4 s (`START_TIMEOUT`) albo zgłosi błąd przed startem, kolejka jest
  czyszczona (`cancel()`), a po 150 ms tekst czytany jeszcze raz głosem zastępczym – najlepszym
  innym głosem języka (bez głosów-efektów Apple), a gdy go brak – domyślnym głosem systemu;
- głos, który dwa razy się nie odezwał, choć zastępczy tak, jest do końca sesji pomijany
  (`silentVoice()`), o czym mówią ustawienia i ekran słuchania; ponowny wybór głosu w ustawieniach
  daje mu nową szansę; nieudany start przy zablokowanym ekranie nie obciąża głosu;
- gdy po starcie koniec nie nadejdzie w czasie dopasowanym do długości tekstu, kolejka jest
  czyszczona i czytanie idzie dalej;
- przed wypowiedzią pozostałości w kolejce są usuwane, a wstrzymany syntezator – wznawiany;
- **Sprawdź wymowę** w ustawieniach (`checkSpeech()`) czyta po polsku, po angielsku i znowu po
  polsku – jak w słuchaniu – i pokazuje wynik każdego kroku; głos, który się w niej nie odezwie,
  jest od razu pomijany.

## Quizy

Reguły są w `js/core/quiz.js` (bez przeglądarki), zapis w `Library`, ekrany w
`js/ui/screens/quiz-setup.js`, `quiz-session.js` i `quiz-history.js`.

- **Budowa quizu** (`buildQuiz()`): pojęcia z wybranego materiału (albo wskazane wprost –
  `termIDs` przy powtórce błędnych) są tasowane i każde trafia do quizu najwyżej raz.
  Typ `choice` – same pytania wyboru; `matching` – same rundy par; `mixed` – udział pytań
  wyboru z ustawień (40–80%, domyślnie 60%), reszta w rundach par. Rundy mają do 5 par na
  telefonie i do 8 na szerokim ekranie, rozkładane równo (`roundSizes()`: 6 → 3 + 3).
  Pojęcia o tym samym brzmieniu nie trafiają do jednej rundy; pojęcie, którego nie da się
  ułożyć w parę, dostaje pytanie wyboru. Kolejność pytań i rund jest losowa.
- **Pytanie wyboru** (`choiceQuestion()`): poprawna odpowiedź i do trzech błędnych o innym
  brzmieniu (porównanie bez wielkości liter i polskich znaków), najpierw z tej samej dziedziny,
  potem z reszty biblioteki. Pomijane są pojęcia, które w języku pytania brzmią tak samo jak
  pytanie (to samo pojęcie zapisane drugi raz z innym tłumaczeniem – to tłumaczenie też byłoby
  poprawne). Gdy różnych odpowiedzi jest mniej, pytanie ma ich mniej; przy mniej niż dwóch jest
  pomijane.
- **Ocena:** pytanie wyboru – jedna odpowiedź; runda par – jedna odpowiedź na parę, poprawna,
  gdy parę połączono bez pomyłki. Lewa kolumna to pytanie, prawa odpowiedź: błędne połączenie
  obciąża parę elementu z lewej kolumny niezależnie od kolejności dotknięć.
- **Wynik** (`quizResult()`, `summarizeQuiz()`): procent względem wszystkich pytań quizu;
  pytania bez odpowiedzi (koniec czasu, przerwanie) są błędne i trafiają na listę do powtórki.
  Zaliczenie: procent ≥ próg (domyślnie 80%).
- **Zapis:** trwający quiz (pytania, pozycja, odpowiedzi, czas) leży w ustawieniach
  (`activeQuiz`), więc przeżywa zamknięcie strony. Każda odpowiedź to jedna transakcja:
  wpisy `quizAnswers` i przesunięcie quizu; ostatnia odpowiedź w tej samej transakcji kończy
  quiz i dopisuje wynik do `quizSessions`. Koniec czasu w trakcie rundy par zapisuje połączone
  pary, a niepołączone liczy jako bez odpowiedzi (`finishQuiz({ partial })`). Nowy quiz
  rozpoczęty w miejsce niedokończonego zapisuje jego wynik jako przerwany.
- **Czas** płynie tylko, gdy ekran quizu jest widoczny: zegar ekranu zapisuje się przy każdej
  odpowiedzi, przy wyjściu z ekranu i przy przejściu aplikacji w tło (`saveQuizTime()`).
- **Bez wpływu na powtórki:** quiz nie zmienia `progress`, `assessments` ani `reviews`.
  Biblioteka liczy przy wczytaniu statystyki pojęć z `quizAnswers` (`getQuizStats()`: próby,
  poprawne, wynik ostatniej odpowiedzi). Z nich korzysta zakres nauki „Błędy z quizów”
  (pojęcia, na które ostatnio odpowiedziano źle) i linia „Quizy” w szczegółach pojęcia.

## Słuchanie

- **Notatki lekcji** (od 1.7, ustawienie `listenNote`: off | pl | en | both): przed pojęciami
  odtwarzacz czyta notatki lekcji wszystkich pojęć z wybranego zakresu, w kolejności biblioteki.
  `noteSteps()` w `js/core/listen.js` robi z notatki zapowiedź „Notatka do lekcji …” i zdania
  (`sentences()`, wspólne z czytaniem w oknie notatki) – bez podziałów stron, odwołań do obrazów
  i punktorów; „PL + EN” – wersja angielska z zapowiedzią „English version.”, a brak wybranej
  wersji – ta, która jest (`noteVersions()`). W odtwarzaczu notatki są pozycjami przed pojęciami
  (`items`), więc „następne”, „poprzednie” i „powtórz” działają też na notatce, a liczby pojęć,
  postęp i podsumowanie liczą tylko pojęcia. Szacunek czasu dolicza notatki (`estimateNotes()`).
- **Wejście** z zakładki Nauka (materiał wybrany ostatnio) albo – od 1.5.1 – przyciskiem „Słuchaj
  lekcji” na ekranie lekcji: adres `#/study/listen/lesson/<id>` ustawia materiał na tę lekcję
  (`initialSelection()` jak w nauce i quizie).
- **Scenariusz** (`listenSteps()` w `js/core/listen.js`): pojęcie w języku pytania, czas na
  zastanowienie, odpowiedź, opcjonalnie odpowiedź drugi raz, definicja i przykład w wybranym
  języku (gdy brak – w drugim). Kolejka pojęć powstaje tak jak w nauce (`buildQueue()`: materiał,
  kierunek, zakres, liczba), w losowej kolejności.
- **Odtwarzacz** (`js/ui/listen-player.js`) czyta kroki po kolei przez `speakThen()` z
  `js/ui/speech.js`: wypowiedź zgłasza koniec (także nieudana – po strażniku startu i głosie
  zastępczym, opisanych przy wymowie), więc czytanie nigdy nie staje w miejscu. Każde przejście ma „bilet” – pauza,
  „dalej”, „wstecz” i „powtórz” wydają nowy, więc spóźnione zdarzenia przerwanej wypowiedzi nic
  nie przestawiają. Wznowienie czyta bieżący krok od początku.
- **Safari:** pierwsza wypowiedź pada bezpośrednio w obsłudze dotknięcia „Rozpocznij słuchanie”
  (wymóg przeglądarki). Ekran nie gaśnie dzięki Screen Wake Lock (`navigator.wakeLock`),
  o który aplikacja prosi ponownie po powrocie strony na ekran.
- **Sprawdzenie na urządzeniu:** gdy strona zniknie z ekranu w trakcie czytania na co najmniej
  8 s, po powrocie aplikacja porównuje liczbę ukończonych kroków i zapisuje w ustawieniach
  (`listenBackground`), czy czytanie trwało. Po powrocie bieżący krok jest czytany od nowa –
  system mógł przerwać wypowiedź bez zgłoszenia końca.
- **Dźwięk w tle** (`js/ui/audio-keepalive.js`, opcja `listenKeepAudio`, domyślnie włączona):
  element `<audio>` odtwarza w pętli ciszę (WAV generowany w pamięci) przez całe słuchanie.
  Połączenie Bluetooth (samochód, CarPlay, słuchawki) nie usypia w przerwach, więc krótkie
  słowa po chwili ciszy nie są ucinane. Start w tym samym dotknięciu co pierwsza wypowiedź.
  Media Session: przyciski systemu (kierownica, słuchawki, ekran blokady) wywołują pauzę,
  wznowienie, następne i poprzednie pojęcie; opis to bieżące pojęcie i „Pojęcie N z M”.
- **Dziennik dźwięku** (`logSpeech()` w `js/ui/speech.js`): ostatnie zdarzenia mowy w pamięci –
  wypowiedź z językiem i głosem, start, koniec, błąd, strażnik, czyszczenie kolejki, dźwięk
  w tle, przyciski, ukrycie strony. Widoczny pod odtwarzaczem, do skopiowania.
- Słuchanie nie zapisuje ocen ani powtórek.

## Statystyki

Obliczenia są w `js/core/stats.js` (bez przeglądarki), ekran w `js/ui/screens/stats.js`,
wykresy w `js/ui/charts.js`.

- **Zakres:** cała biblioteka albo dziedzina, moduł lub lekcja (`#/stats/<poziom>/<id>`).
  Zestawienie „Opanowanie według…” prowadzi o poziom niżej, więc te same wskaźniki i wykresy
  są dostępne na każdym poziomie hierarchii. Zestawienie liczy status każdego pojęcia raz
  i sumuje po kluczach `domainID` / `moduleID` / `lessonID` zapisanych w pojęciu.
- **Kierunki** (punkt 12.2 specyfikacji – bez mieszania bez oznaczenia): wybrany kierunek
  liczy tylko siebie; „oba kierunki” daje pojęciu słabszy z dwóch statusów (pojęcie nieocenione
  w jednym kierunku jest w nim „nowe”), a do powtórki jest, gdy czeka w którymkolwiek. Zdarzenia
  (powtórki, odpowiedzi, czas) są wtedy sumowane, a na wykresach powtórek i quizów oba kierunki
  mają osobne serie. Znajomość pojęć, definicji i przykładów jest zawsze osobno dla kierunku.
- **Wskaźniki** pochodzą z danych w pamięci (`progress`: ostatni status, ostatnia ocena każdego
  elementu, termin FSRS) i z dzienników (`quizAnswers` – skuteczność; `assessments` i
  `quizAnswers` – czas).
- **Postęp w czasie** jest odtwarzany z historii ocen: oceny w kolejności chronologicznej
  zmieniają status pary pojęcie + kierunek, a liczniki statusów są zapisywane na koniec każdego
  dnia (czas urządzenia). Stan ostatniego dnia równa się bieżącym postępom – sprawdza to test.
- **Czas nauki:** fiszka zapisuje czas od pokazania do decyzji (najwyżej 3 minuty, bo fiszka
  mogła czekać na ekranie); quiz – czas odpowiedzi. Dla ocen sprzed wersji 0.6.0 czas jest
  szacowany z odstępu od poprzedniej oceny tej samej sesji (najwyżej 2 minuty).
- **Dzienniki** czyta `Library.journals()`. Wynik jest zapamiętany do następnej zmiany dzienników:
  `journalRevision` rośnie tylko wtedy, gdy operacja dopisuje lub usuwa wpisy dziennika
  (zmiana ustawień, np. kierunku w statystykach, nie wymusza ponownego odczytu).
- **Postęp na listach** (od 1.2, `lessonMastery()` i `moduleMastery()`): procent pojęć ze statusem
  „Opanowane” w kierunku wybranym w Statystykach (dla „oba kierunki” – słabszy z dwóch). Lekcja
  utrwalona ma pełny pasek i opis „utrwalona”, a w module jej pojęcia liczą się jako opanowane.
  Pasek, opis i pozycje menu rysuje `js/ui/mastery.js`. Od 1.3 utrwalone są na końcu listy
  modułów i lekcji (w obu grupach kolejność ustalona przez użytkownika); w trybie zmiany kolejności
  przesuwa się tylko w obrębie grupy, a zapisana kolejność to kolejność listy.
- **Wykresy** są rysowane w SVG w rzeczywistej szerokości kontenera (ResizeObserver), bez
  bibliotek. Kolory to zmienne `--viz-*`, osobne dla jasnego i ciemnego motywu, sprawdzone
  walidatorem palet (kontrast z tłem, rozróżnialność przy protanopii i deuteranopii): statusy
  pojęć to stopnie jednej niebieskiej skali (opanowane najmocniej, w ciemnym motywie
  najjaśniej), kierunki – fiolet (PL → EN) i pomarańcz (EN → PL), tło porównawcze – szarość.
  Każdy wykres ma podpowiedź (wskaźnik, dotyk, strzałki na klawiaturze) i tabelę z tymi samymi
  liczbami („Dane w tabeli”).

## Kopia zapasowa

Jeden plik JSON: nagłówek (format, wersje, data, liczniki) i zawartość wszystkich magazynów.
Przywracanie najpierw sprawdza cały plik (format, wersję, unikalność identyfikatorów,
powiązania hierarchii), przelicza klucze wyszukiwania i dopiero wtedy zastępuje bazę
jedną transakcją. Uszkodzony plik niczego nie zmienia. Dane nauki wskazujące na
nieistniejące pojęcia są pomijane.

Od wersji 1.1 (format kopii 2) kopia zawiera notatki i obrazy (bajty w Base64). Przy
przywracaniu treść notatek przechodzi przez filtr HTML, a notatki bez lekcji i obrazy bez
notatki są pomijane. Kopie w formacie 1 (bez notatek) nadal można przywrócić.

Wersja 1.2 nie zmienia formatu kopii: data utrwalenia jest polem lekcji, okres powtórek – polem
ustawień. Kopia sprzed 1.2 nie ma znacznika szarych ikon, więc po jej przywróceniu dziedziny
dostają szare tło tak samo jak przy aktualizacji.

## Testy

- `tests/unit/` – Node.js (`node --test`), bez przeglądarki: reguły biblioteki, wycofywanie
  nieudanych zmian, glosariusz, odczyt i zapis plików, import i eksport, nauka z fiszkami,
  FSRS (zgodność z py-fsrs i zapis powtórek), quizy, statystyki, kopia zapasowa, spójność plików wydania.
- `tests/fixtures/` – pliki testowe wygenerowane w openpyxl i LibreOffice
  (`tools/gen_fixtures.py`), żeby odczyt nie był sprawdzany wyłącznie na plikach własnych.
  Notatki: skoroszyt z openpyxl (fragmenty z formatowaniem, obrazy przy komórkach), ten sam
  przepisany przez LibreOffice i skoroszyt z obrazami „w komórce” złożony według budowy plików
  Excela 365 (z celowo przestawioną kolejnością wpisów pośrednich).
- `tests/e2e/` – Chromium przez Playwright: pełne przepływy na ekranie telefonu i komputera,
  trwałość po przeładowaniu, praca offline, aktualizacja wydania, klawiatura. Gesty na fiszce
  są wykonywane zdarzeniami dotyku przeglądarki, a syntezator mowy zastępuje atrapa.
  Upływ czasu przy powtórkach i limit czasu quizu symuluje zegar Playwright (`context.clock`).

## Możliwy dalszy rozwój

- **Wydajność:** statystyki liczą się w jednym przebiegu po pojęciach zakresu i po dziennikach;
  przy setkach tysięcy ocen kolejnym krokiem byłoby liczenie szeregów dziennych przyrostowo
  albo w tle (Web Worker), tak samo import bardzo dużych plików.
- **Głosy neuronowe (Piper):** wstępnie sprawdzone są fonemy espeak-ng w WebAssembly
  (w przeglądarce) i model głosu w ONNX Runtime (poza przeglądarką); do sprawdzenia zostaje
  ONNX Runtime Web w przeglądarce i pobieranie głosów (ok. 60 MB na język) do pamięci urządzenia.
- **Wersja na Windows w jednym pliku:** 47 modułów bez zależności cyklicznych można złożyć
  w jeden `LexiCards.html`, otwierany z dysku bez serwera.
