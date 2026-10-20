# Architektura LexiCards

Dokument opisuje stan wersji 1.1. Zgodność ze specyfikacją i wyniki sprawdzenia całości:
[RELEASE-1.0.md](RELEASE-1.0.md); notatki do lekcji (1.1): [RELEASE-1.1.md](RELEASE-1.1.md).

## Założenia

- **Jeden użytkownik, dane na urządzeniu.** Nie ma serwera ani kont. Baza to IndexedDB
  w przeglądarce; między urządzeniami dane przenoszą dwa pliki kopii zapasowej (od 1.8): dane
  oraz obrazy z załącznikami.
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
js/ui/dialogs.js           arkusze, pytania, menu (także z wyborem jednej pozycji), komunikaty (element <dialog>)
js/ui/reorder-drag.js      przeciąganie wierszy w trybie zmiany kolejności (uchwyt, w obrębie grupy, przewijanie przy krawędzi)
js/ui/grid-drag.js         przeciąganie kafelków w siatce (obrazy w edytorze notatki): mysz i rysik od razu, palec po przytrzymaniu, przewijanie przy krawędzi
js/ui/color-picker.js      wybór własnego koloru: siatka, suwaki RGB z kodem HEX, pipetka; ostatnie własne kolory wspólne dla rysunku i notatek
js/ui/router.js            adresy po znaku # i historia przeglądarki (od 1.23 Nauka z kilkoma lekcjami: #/study/lessons/id1+id2)
js/ui/study-calendar.js    plan nauki w kalendarzu (od 1.23): okno (dzień, godzina, czas, powtarzanie, przypomnienie, prywatność), plik .ics
js/ui/speech.js            wymowa przez syntezator mowy przeglądarki
js/ui/material.js          wybór materiału (dziedzina, moduł, lekcje) wspólny dla nauki i quizu
js/ui/charts.js            wykresy SVG (w czasie, pasek udziałów, miernik) z podpowiedzią i tabelą danych
js/ui/listen-player.js     odtwarzacz słuchania: kolejne kroki czytane syntezatorem mowy, pauza, dalej, powtórz
js/ui/notes.js             okno notatki lekcji: podgląd (Kopiuj, PDF), edytor z paskiem formatowania w grupach (wcięcia, indeksy, wielkość, kolory, wyrównanie i interlinia, link, symbole, data), obrazy (podpisy, numeracja, przeciąganie), tabele, załączniki, powiększanie
js/ui/date-picker.js       wybór daty i godziny (od 1.21.1): kalendarz (dni, miesiące i lata, okres), bębny godzin i minut, okna „Data i godzina” i „Wybrany okres”
js/ui/table-editor.js      okno tabeli (od 1.21, wspólne dla notatki i rysunku): siatka pól, wiersze i kolumny przy kursorze, nagłówki, wyrównanie, wklejanie z Excela i Worda
js/ui/note-editing.js      zmiany treści edytora notatki z cofaniem: kopia treści ze znacznikami zaznaczenia, podmiana jednym insertHTML (wartownik), klucze miejsca kursora; wyrównanie i interlinia, „Usuń formatowanie”, wstawienie bloku
js/ui/note-print.js        druk i PDF notatki: cała notatka w układzie A4 (ścieżka, tytuł, treść), okno drukowania przeglądarki
js/ui/symbols.js           panel symboli z ostatnio użytymi (notatka) i symbole pod polem tekstu (rysunek)
js/ui/attachments.js       załączniki notatek: plakietka rodzaju, lista w podglądzie, otwieranie (arkusz udostępniania / karta / pobranie), odtwarzacz nagrań
js/ui/recorder.js          notatka głosowa: nagrywanie z mikrofonu (MediaRecorder), pauza, limit czasu, blokada wygaszania ekranu
js/ui/math.js              wzory w notatce: drzewo zapisu → MathML, zamiana $…$ w podglądzie, ściągawka „Równania”
js/ui/fit-table.js         okno „Tabela pasowań” (od 1.25): pasowania zalecane, dowolna klasa albo pasowanie z litery i klasy IT
js/ui/drawing.js           edytor rysunku: płótno, pióro z naciskiem, zakreślacz, gumka, gesty, ustawienia pióra, linijka ze skalą, własne kolory, zaznaczanie i schowek, wycinek i „Osadź”, tło i szablon (narożniki, wielkość w %), liniuszek (równoległy, od 1.22 promieniowy), kształty (pola wymiarów z okiem, wypełnienie, tekst, zakończenia odcinka, od 1.22 przyciąganie końców i magnes, od 1.24 punkty w wierzchołkach łamanej), figury z odręcznych kształtów (od 1.24 – przytrzymane pióro), spirala na grzbiecie (od 1.24.1), Shift i Ctrl, środkowy przycisk, szyk, kartki (od 1.22 kółko, ‹ › i animacja przewracania, od 1.24 zagięcie od rogu), obraz PNG / JPEG
js/ui/drawing-paint.js     rysunek na płótnie: kształty geometryczne (z zakończeniami odcinka), szablon (boisko liniami, obraz mnożony z tłem)
js/ui/drawing-boxes.js     tabele i karteczki na rysunku (od 1.21): układ i pomiar (szerokości kolumn, łamanie, wysokość z treści), rysowanie, strzałka, ikona zwiniętej, treść obok ikony
js/ui/drawing-gdt.js       wymiary techniczne i symbole metrologiczne na płótnie (od 1.22.1): linie pomocnicze, linia wymiarowa, łuk, liczba z tolerancją, ramka tolerancji, znak bazy, chropowatość; znaki ⌀ □ Ⓜ Ⓛ i 14 symboli ISO 1101 rysowane kreską
js/ui/canvas-text.js       tekst na płótnie rysunku: czcionka, wysokość wiersza, pomiar i łamanie wierszy (pola tekstowe, tekst kształtu, tabele, karteczki)
js/ui/images.js            obrazy w przeglądarce: odczyt, zmniejszanie dużych zdjęć, adresy do wyświetlenia
js/core/library.js         model w pamięci + wszystkie operacje na danych
js/core/storage.js         adaptery zapisu: IndexedDB i pamięć
js/core/model.js           kształt rekordów, wartości domyślne, stałe
js/core/backup.js          kopia zapasowa: plik danych i plik obrazów i załączników – tworzenie, walidacja, przywracanie
js/core/note-files.js      załączniki notatek: nazwy plików, typy i rodzaje (PDF, Word, Excel, PowerPoint…)
js/core/math.js            wzory: wyszukiwanie $…$ w tekście, odczyt zapisu (podzbiór LaTeX), wzór słowami, ściągawka
js/core/drawing.js         rysunki: grubość z nacisku, wygładzanie, gumka, historia cofania, skala, przyciąganie linijki, obszar zaznaczania, tabele i karteczki (prostokąt, strzałka), sprawdzanie danych rysunku
js/core/math-layout.js     wzór na płótnie (rysunek): układ ułamków, potęg, pierwiastków, sum, nawiasów i rysowanie
js/core/shapes.js          kształty geometryczne (punkty, obrys, punkty konstrukcyjne, Shift, wymiary z klawiatury i na stałe, wypełnienie, tekst, zakończenia odcinka, od 1.24 łamana i wielokąt z wierzchołkami, sprawdzanie) i liniuszek (najbliższa linia; od 1.22 najbliższy okrąg i promień, okręgi na stronie, kierunki promieni)
js/core/recognize.js       figury z odręcznych kształtów (od 1.24): rogi kreski (ShortStraw), boki i wierzchołki, odcinek, strzałka, łamana, trójkąt, czworokąty, wielokąt, okrąg i elipsa
js/core/fits.js            pasowania ISO 286 (od 1.25): litery otworów i wałków, klasy IT, pasowania zalecane, ostatnio użyte
js/core/attach.js          przyciąganie i przyklejanie końców (od 1.22): narożniki i boki elementów, najbliższy punkt, identyfikatory, końce za elementem, odklejanie, kopie, sprawdzanie przyklejeń; od 1.22.1 kierunek na zewnątrz krawędzi
js/core/gdt.js             symbole metrologiczne (od 1.22.1): lista ISO 1101, układ ramki tolerancji, znaku bazy i chropowatości (ISO 1302), początek strzałki, trójkąt bazy, kolejna litera bazy, sprawdzanie
js/core/arrays.js          szyk liniowy i kołowy: kopie elementów, przesunięcie, obrót wokół środka, parametry, sprawdzanie
js/core/templates.js       tło rysunku: poziomy jasności, szablon – boisko (105 × 68 m), dopasowanie, środek, wielkość (też w % i narożnikiem), sprawdzanie
js/core/zip.js             odczyt i zapis archiwów ZIP (także kawałkami przez Blob – duże pliki)
js/core/xlsx.js            odczyt i zapis skoroszytów XLSX
js/core/csv.js             kodowanie, separator, odczyt i zapis CSV
js/core/tablefile.js       rozpoznanie formatu pliku, wspólna postać tabeli
js/core/importer.js        nagłówki → pola, wiersze pliku → wiersze importu, walidacja
js/core/exporter.js        zakres eksportu → plik XLSX (z arkuszem notatek) lub CSV; wzór importu
js/core/note-format.js     treść notatki: bezpieczny HTML ↔ dokument ↔ tekst sformatowany komórki arkusza; wyrównanie i interlinia, adres linku wpisany ręcznie
js/core/symbols.js         symbole do wstawiania: grupy, nazwy, ostatnio użyte
js/core/note-import.js     arkusz notatek: rozpoznanie, wiersze → notatki lekcji z obrazami
js/core/page-curl.js       zaginana kartka notatki (od 1.24 także kartki rysunku): chwyt, zgięcie, odbicie płata, ograniczenia papieru
js/core/note-refs.js       sygnatury obrazów notatki i odwołania [[sygnatura]] w treści, podpisy i numery „Rys. N.”
js/core/calendar.js        kalendarz (od 1.21.1): siatka miesiąca od poniedziałku, nazwy po polsku, okres dwoma dotknięciami, gotowe okresy
js/core/tables.js          tabele (od 1.21): sprawdzanie, wklejony tekst z tabulatorami i tabela HTML → wiersze, sygnatury „Tabela N”, numery i podpisy „Tab. N.”, HTML (podgląd, schowek), tekst (schowek, arkusz, słuchanie)
js/core/images.js          format i wymiary obrazu z nagłówka pliku
js/core/study.js           fiszki: dobór do sesji, treść stron, ocena, postęp, podsumowanie
js/core/ics.js             plik kalendarza .ics (od 1.23, RFC 5545): wydarzenie z powtarzaniem, przypomnieniem i prywatnością, strefa czasowa z Intl, zawijanie wierszy
js/core/fsrs.js            algorytm powtórek FSRS-6 (przeniesiony z py-fsrs 6.3.2)
js/core/quiz.js            quizy: pytania wyboru, rundy par, test mieszany, odpowiedzi, wynik
js/core/stats.js           statystyki: statusy w kierunkach, elementy, szeregi dzienne, zestawienia, czas nauki
js/core/listen.js          słuchanie: kroki pojęcia (pojęcie, przerwa, odpowiedź, definicja, przykład), szacunek czasu
js/core/text.js            normalizacja tekstu, tagi, odmiana liczebników, data i godzina do wstawienia w notatce
js/core/sorting.js         kolejność list biblioteki: ręczna, nazwa A–Z i Z–A (po polsku), data utworzenia; nowa kolejność po przeniesieniu
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
| `notes` | notatka lekcji (od 1.1): treść w znormalizowanym HTML (`html` po polsku, od 1.6 `htmlEN` po angielsku), opis obrazów (typ, wymiary, rozmiar, CRC-32, od 1.6 `label` – sygnatura, od 1.18 `caption` – podpis), `imagesFirst` – obrazy bez odwołania w podglądzie przed tekstem (od 1.5), od 1.18 `numberFigures` – numeracja „Rys. N.” (od 1.21 też „Tab. N.”) w podglądzie, od 1.21 `tables` – tabele
(`{ label, caption?, rows, header, headerColumn, align }`) i od 1.8 `files` – opis załączników (nazwa, typ, rozmiar, CRC-32, od 1.10 `duration` – czas nagrania w sekundach) – w pamięci | identyfikator = `lessonID` |
| `noteImages` | bajty obrazów notatek (`ArrayBuffer`) – czytane z bazy dopiero przy otwarciu notatki; rysunek (od 1.12) ma też `drawing` – kreski i zdjęcie pod nimi, a opis w notatce `drawing: true` | `lessonID` |
| `noteFiles` | bajty załączników notatek (od 1.8, `ArrayBuffer`, do 50 MB) – czytane dopiero przy otwarciu pliku | `lessonID` |

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
  istniejące dane zostają bez zmian; wersja 1.8 – do 3: dochodzi magazyn `noteFiles`.
- **Obrazy poza pamięcią.** Notatka w pamięci ma tylko tekst i opis obrazów; bajty są w osobnym
  magazynie, czytane przy otwarciu notatki. Obrazy są zapisane jako `ArrayBuffer`, nie `Blob`
  (Safari miewał kłopoty z `Blob` w IndexedDB). Notatka znika razem z lekcją, modułem
  i dziedziną; kopia lekcji ma kopię notatki z własnymi obrazami i załącznikami.
- **Załączniki jak obrazy** (od 1.8): opis w notatce (`files`), bajty w `noteFiles`. Zapis notatki
  bez pola `files` (import z arkusza) ich nie rusza. Opis może istnieć bez pliku (przywrócone same
  dane): `noteImages(…, { withMissing: true })` i `noteFileList()` zaznaczają takie pozycje jako
  `missing`, podgląd pokazuje ramkę „Brak pliku obrazu” i przekreślony załącznik, a zapis notatki
  zostawia ich opisy – plik może dojść później z pliku obrazów i załączników (`addMedia`).
  Otwieranie (`js/ui/attachments.js`): na telefonie z arkuszem udostępniania – `navigator.share`
  z plikiem (bajty są czytane już przy otwarciu menu, żeby udostępnianie zaczęło się w obsłudze
  dotknięcia, czego wymaga Safari); na komputerze PDF, obrazy i tekst – nowa karta z adresem
  `blob:`, pozostałe – pobranie.
- **Notatka głosowa** (od 1.10, `js/ui/recorder.js`): `getUserMedia` + `MediaRecorder` (64 kb/s,
  kawałki co sekundę, więc przerwane nagranie nie przepada w całości). Format: AAC w `.m4a`, gdy
  przeglądarka go nagrywa (Safari; Chrome i Edge z systemowym koderem), inaczej Opus w `.webm`
  (Opus w `.m4a` odtwarza mniej programów). Czas liczony bez pauz, limit 90 minut (ok. 43 MB – poniżej
  limitu załącznika). W trakcie nagrywania `navigator.wakeLock` trzyma ekran włączony (prośba ponawiana
  po powrocie do aplikacji); koniec ścieżki mikrofonu (system go odebrał) kończy nagranie z tym, co
  jest. Edytor notatki (`js/ui/notes.js`) pokazuje przyklejony pasek nagrywania i nie blokuje niczego
  innego; nagranie dochodzi do `state.files` jak zwykły nowy załącznik (z polem `duration`), a
  `save()` najpierw czeka na `finishRecording()`. Trwające nagranie zajmuje miejsce w limicie 30
  załączników, a edytor jest „zmieniony” (pytanie przy zamknięciu). Odtwarzanie – `<audio>` w okienku
  (`openPlayer`), adres `blob:` zwalniany po zamknięciu.
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
- **Ramki fokusu** (od 1.11.1, `js/ui/focus-mode.js`): tylko przy obsłudze klawiaturą. Safari dawał
  `:focus-visible` także po dotknięciu (pierwszy przycisk nowego okna, przycisk po zamknięciu okna),
  więc `pointerdown` ustawia na `<html>` klasę `input-pointer` (wtedy CSS chowa wszystkie obrysy
  fokusu), a klawisz nawigacji (Tab, strzałki, Esc; Enter i spacja poza polem tekstowym) ją zdejmuje.
- **Przesuwanie wierszy** (od 1.9, `js/ui/swipe.js`) – wiersze modułów i lekcji: zdarzenia wskaźnika
  tylko dla dotyku i rysika, `touch-action: pan-y` (pionowe przewijanie zostaje przeglądarce, ruch
  w pionie kończy gest), kierunek ustalany po 10 px. Przesuwa się cały wiersz z tłem, a pod nim, na
  czas ruchu, leży warstwa działania wstawiona do listy w miejscu wiersza (lista dostaje
  `position: relative`). Próg lekki – 56 px (po puszczeniu pytanie: `requestDeletion`,
  `confirmConsolidation`), zdecydowany – połowa szerokości wiersza (od razu: `deleteNow`,
  `setConsolidated`). Napis działania widać, gdy mieści się w odsłoniętej części. Kliknięcie
  w link tuż po przesunięciu jest pomijane. Od 1.9.2 także pojęcia w lekcji (`termList(…, { swipe })`):
  w prawo – ulubione (działanie bez `confirm`, więc od razu przy każdym przesunięciu ponad próg),
  w lewo – usunięcie; ruch od gwiazdki i „…” (`ignore: '.icon-button'`) nie przesuwa wiersza.
- **Lista wyboru** (od 1.9.2): w przeglądarkach z `appearance: base-select` (Chrome i Edge od 135)
  `<select>` i jego lista (`::picker(select)`) mają style aplikacji – zaokrąglenie, cień, odstępy,
  znacznik wybranej pozycji w kolorze aplikacji; strzałka zostaje własna (`::picker-icon` ukryte).
  Pozostałe przeglądarki (Safari, Firefox) – lista systemowa, bez zmian (`@supports`).
- **Cofnij po usunięciu** (od 1.9.1): `deleteWithUndo(target)` przed usunięciem kopiuje wszystko, co
  zniknie – rekordy z pamięci (dziedzina, moduły, lekcje, pojęcia, postępy, notatki), dzienniki
  nauki tych pojęć (`readByTerm`) i pliki notatek – a `restoreDeleted(kopia)` zapisuje je z powrotem
  jedną transakcją (odmawia, gdy w międzyczasie zniknął element nadrzędny albo kopia została już
  przywrócona). Kopia żyje tylko w komunikacie z przyciskiem „Cofnij” (`undoToast`, 60 s, pasek
  czasu; przy ograniczonym ruchu bez animacji) – po przeładowaniu jej nie ma.
- **Data utworzenia** (od 1.9): każdy rekord ma `createdAt`. Wiersze modułów i lekcji pokazują ją pod
  opisem, szczegóły pojęcia – w „Utworzono”. Filtr (`js/core/created.js`: okresy dziś, 7 i 30 dni,
  ten rok, własny zakres od – do, dni w czasie lokalnym, „do” obejmuje cały dzień) jest nad listą
  modułów, lekcji i pojęć lekcji (wybór pamiętany w pamięci aplikacji dla danej listy) i w filtrach
  glosariusza (`glossary({ created })`). Od 1.21.1 zakres wybiera się w oknie `openRangeSheet`
  (`js/ui/date-picker.js`) zamiast pól `<input type="date">`.
- **Kolejność list** (od 1.16, `js/core/sorting.js`): ustawienie `listSort: { domain, module, lesson }`
  (`manual`, `name`, `name-desc`, a dla modułów i lekcji także `newest`, `oldest`; nieznana wartość –
  `manual`). `sortItems` zwraca nową tablicę: nazwy przez `Intl.Collator('pl', { numeric: true,
  sensitivity: 'base' })`, data – `createdAt` (ta sama data – po nazwie), przy remisie decyduje
  `sortOrder`. Ekrany Biblioteki sortują listę, potem dzielą ją na nieutrwalone i utrwalone
  (`consolidatedLast`), potem filtrują datą. Zapisana kolejność (`sortOrder`) zmienia się tylko
  w trybie zmiany kolejności, który zawsze pokazuje kolejność ręczną – jego włączenie przy innym
  wyborze ustawia `manual`. Przycisk przy tytule listy (`group({ action })`) otwiera menu z pozycjami
  `menuitemradio` (`openMenu` – `checked`). Ustawienie jest w rekordzie ustawień, więc wraca z kopią
  zapasową. Start, wybór materiału i eksport używają kolejności ręcznej.
- **Przeciąganie wierszy** (od 1.16, `js/ui/reorder-drag.js`): w trybie zmiany kolejności wiersz ma
  uchwyt `.row__grip` (`touch-action: none`). `pointerdown` na uchwycie (dotyk, rysik, mysz) albo myszą
  na wierszu poza przyciskami (po 4 px ruchu – kliknięcie zostaje kliknięciem) mierzy wiersze we
  współrzędnych strony i przechwytuje wskaźnik. Przeciągany wiersz dostaje `translateY` (ograniczony
  do swojej grupy – `groupOf`, np. utrwalone), a wiersze między miejscem startu i docelowym – przesunięcie
  o jego wysokość (z przejściem CSS). Miejsce zmienia się, gdy brzeg przeciąganego wiersza minie środek
  sąsiada. Przy krawędzi okna (72 px) pętla `requestAnimationFrame` przewija stronę (do 14 px na
  klatkę). Upuszczenie wywołuje `onMove(from, to)` → `library.reorder(level, movedOrder(…))` i ekran
  rysuje się od nowa; `pointercancel` przywraca wiersze. Strzałki ↑ ↓ zostają (klawiatura).
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
  i wykresy nie zależą od wybranego koloru. Każda ikona ma klasę z nazwą (`icon--<nazwa>`); piktogram
  notatki (`svg.icon--note`) ma od 1.10.5 stały ciemnożółty kolor – w obu motywach i przy każdym
  kolorze aplikacji.

Od 1.26 **jeden wygląd okien** (`css/app.css`, sekcja okien): arkusz formularza (`openFormSheet`) ma białe
tło `--elevated` – jak panele edytora rysunku – a każde pole (`.field`) i przełącznik (`.switch`) leży
w cienkiej zaokrąglonej ramce `--outline` (aktywne pole – ramka w kolorze aplikacji, bez grubej ramki
wokół pola); grupa pól (`formGroup`) i kilka przełączników pod sobą (`div:has(> .switch + .switch)`) – jedna
ramka i linie między nimi. Okno notatki (`.note-dialog`) zostaje na szarym tle `--sheet-bg` (kartka i pasek
narzędzi). Tytuł okna stoi między przyciskami (`auto 1fr auto`) i skraca się wielokropkiem; przełącznik
segmentowy ma mniejsze marginesy i nie łamie słowa w środku.

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
- **Od 1.18** kolumna `Image caption` (podpis obrazu; „Podpis obrazu”, „Caption” – sprawdzane przed
  sygnaturą). Wcięcie akapitu to znaki tabulacji na początku wiersza komórki, wielkość – punkty
  czcionki (eksport 9, 14, 18 pt; import – `sheetSize` względem zwykłej czcionki komórki: do 0,88 mała,
  od 1,18 duża, od 1,45 bardzo duża), indeksy –
  `vertAlign`. Własny kolor eksport zapisuje jako RGB, a import – jak każdy kolor – sprowadza do
  najbliższego koloru palety (`nearestNoteColor`).

### Treść notatki

Notatka jest zapisana jako HTML z wąskiego zestawu znaczników (`<p>`, `<h3>`, listy, `<strong>`,
`<em>`, `<u>`, `<s>`, `<sup>`, `<sub>`, `<span data-color>`, `<a href>` http/https/mailto, `<br>`;
od 1.18 `<p data-indent="1…4">`, `<span data-size="s|l|xl">` i `<span data-color="#rrggbb">`).
`normalizeNoteHtml()` przepuszcza przez ten filtr wszystko: wklejony HTML (Word, strony, Google
Docs, Notatki, tabele z Excela), zawartość edytora przy zapisie, kopię zapasową i podgląd. Własny
parser HTML w `js/core` pozwala testować to w Node.js; w przeglądarce wklejony HTML najpierw
porządkuje `DOMParser`. Edytor to `contenteditable` z `document.execCommand` (cofanie Ctrl+Z
działa), kolory zapisane są nazwą, więc w ciemnym motywie są jaśniejsze. „Kopiuj notatkę”
kładzie do schowka HTML z kolorami w stylu i obrazami jako `data:` (przed tekstem albo po nim,
jak w podglądzie) oraz zwykły tekst.

Od 1.18 **wcięcia, wielkość, własny kolor, indeksy**. W edytorze wcięcie to zagnieżdżone `<blockquote>`
z polecenia `indent` / `outdent` (cofanie działa; lista – poziom niżej), a wielkość i kolor –
`<font size>` i `<font color>` z `fontSize` / `foreColor`. Te znaczniki filtr przyjmuje tylko z opcją
`{ editor: true }` (zawartość edytora; wklejony HTML jej nie ma, więc rozmiary i barwy źródła nie
wchodzą): liczba `<blockquote>` nad akapitem (najwyżej `MAX_INDENT` = 4) staje się `data-indent`,
`<font size>` 2 / 5 / 6 – `data-size` s / l / xl (3 – zwykła), kolor spoza palety – `data-color="#hex"`
(z `style="--note-color: …"`; CSS w ciemnym motywie miesza go z bielą), a `NOTE_NO_COLOR` (`#010101`) usuwa
kolor. `editorNoteHtml()` zamienia zapis z powrotem na znaczniki edytora. `NOTE_SIZES` to wielkości
(em, polecenie, punkty w arkuszu). Tab i Shift+Tab w polu tekstu wywołują `indent` (bez przejścia do
następnego pola). Zaznaczenie zapamiętane przy `selectionchange` przychodzi z opóźnieniem, więc przed
poleceniem z klawiatury albo przycisku edytor bierze bieżące (`captureSelection`), a przy oknie koloru –
to sprzed otwarcia. „Kopiuj notatkę” (`portableNoteHtml`) zamienia wcięcie, wielkość i własny kolor
na style.

Od 1.20 **wyrównanie, interlinia, linki, symbole, data, PDF**. Blok (`<p>`, `<h3>`, `<li>`) może mieć
`data-align` (`center` / `right` / `justify`; do lewej – bez atrybutu) i `data-line` (`1` / `1.5` / `2`;
1,15 – bez atrybutu); w dokumencie to `align` i `line` bloku. Filtr czyta je też z wklejonego HTML
(`text-align`, `align`, `<center>` – dziedziczone z bloku nadrzędnego jak w CSS, ale nie przez listę
zagnieżdżoną; interlinia – tylko z `data-line`). `portableNoteHtml` dopisuje style dla Worda
(`text-align`, `line-height` 100 / 150 / 200%) i zostawia atrybuty, żeby wklejone z powrotem do notatki
nic nie traciło. Zmiany, których `execCommand` nie zrobi (wyrównanie, interlinia, „Usuń formatowanie”
z blokami, wstawienie odwołania i nowej strony), robi `js/ui/note-editing.js`: kopia treści pola ze
znacznikami zaznaczenia (znaki U+E000 / U+E001), zmiana kopii, potem `insertHTML` całej treści jako
**jeden krok cofania**. Przed podmianą na początek pola trafia pusty `<p data-s>` (wartownik) – bez
niego Chromium wstawia treść do wnętrza pierwszego bloku, gdy jest nim nagłówek, punkt listy albo
`<blockquote>`; po cofnięciu wartownik wraca (ukryty w CSS, przy zapisie znika). Miejsce kursora
opisuje klucz `{ block, offset }` (numer bloku z tekstem, znaki od początku bloku, `<br>` – jeden
znak); historia podmian przywraca kursor po `historyUndo` / `historyRedo` (przeglądarka zaznaczałaby
całą treść). „Usuń formatowanie” zamienia fragment treści od bloku początku do bloku końca zaznaczenia
w dokument, zdejmuje znaczniki w zakresie (zostaje `href`), bloki objęte zaznaczeniem stają się
akapitami, a puste akapity zostają (znak zastępczy U+E002). Link: `createLink` / `unlink` /
`insertHTML` (`normalizeLink` – `www.` i domena dostają `https://`, e-mail – `mailto:`, inne protokoły
odrzucone). Symbole i data – `insertText`; od 1.21.1 „Inna data lub godzina…” – `openDateTimeSheet`
z `js/ui/date-picker.js`: kalendarz (`calendar`, siatka 6 tygodni z `monthGrid`, widok miesięcy roku,
fokus „wędrujący” – jeden dzień z `tabindex=0`, strzałki, PageUp / PageDown, Home / End; tryb `range`
z pasmem i podglądem końca pod kursorem) i bębny (`timeDrums`): przewijany element z trzema kopiami
liczb i `scroll-snap`, po zatrzymaniu (`scrollend` albo 140 ms bez przewijania) wartość ze środka
i powrót do środkowej kopii (zapętlenie bez końca); kółko myszy – krok na ząbek (gładzik – co ok.
36 px), mysz – przeciąganie (`scroll-snap` wyłączony na czas ruchu, trwający płynny obrót najpierw
dokończony), palec i rysik – przewijanie przeglądarki, kliknięcie – liczba z położenia (przy
przechwyceniu wskaźnika kliknięcie trafia w cały bęben); pochylenie liczb nad i pod środkiem
(`rotateX`) – tylko dla siedmiu widocznych. Tekst do wstawienia – `formatEnteredDate`. PDF (`note-print.js`): `noteFlow()` z `note-book.js` składa
całą notatkę jednym ciągiem (te same jednostki co strony książki: bloki, listy, obrazy z podpisami,
podziały stron), element `.note-print` trafia na koniec `<body>`, a `@media print` ukrywa resztę
strony (strona A4, jasne kolory, obraz najwyżej 225 mm, podział `break-after: page`); po `afterprint`
element znika. „Kopiuj notatkę” daje obrazowi `width` / `height` najwyżej 605 × 860 px (16 cm szerokości
tekstu strony A4 przy 96 dpi).

Od 1.18 **podpisy i numeracja** (`note-refs.js`): `caption` w opisie obrazu (`cleanImageCaption`, do
120 znaków; zapis notatki: brak pola – podpis bez zmian, `''` – usunięty). `figureNumbers(html, images,
imagesFirst)` daje numer każdego obrazu według kolejności w podglądzie (obrazy z odwołaniem w miejscu
pierwszego odwołania, pozostałe przed tekstem albo po nim), a `figureCaption(caption, n, numbered)` –
tekst pod obrazem („Rys. 2. Wyniki sprzedaży”, „Rys. 2.” albo sam podpis). Podgląd (`contentUnits`
w `note-book.js`) mierzy wysokość podpisu przy dzieleniu na strony i kładzie obraz w `<figure>`
z `<p class="note-page__caption">`; powiększenie i „Kopiuj notatkę” pokazują ten sam tekst.
**Siatka obrazów** w edytorze: przeciąganie (`enableGridDrag` z `grid-drag.js`) przestawia kafelki
w DOM na żywo (kafelek przesunięty `transform` pod wskaźnik), a po upuszczeniu zwraca nową kolejność
numerów – edytor przestawia `state.images` i rysuje siatkę od nowa. Gdy kafelków jest więcej niż dwa
rzędy (`layoutGrid`, kafelek ≥ 96 px), siatka dostaje klasę `note-images--scroll`: dwa rzędy,
kolumny w poziomie (`grid-auto-flow: column`) o szerokości liczonej tak, by widać było kawałek
następnej kolumny; `ResizeObserver` przelicza ją przy zmianie szerokości okna.

Od 1.21 **tabele** (`js/core/tables.js`, `js/ui/table-editor.js`): notatka ma listę `tables` –
`{ label, caption?, rows: [[tekst komórki]], header, headerColumn, align: ['left' | 'center' | 'right'] }`
(`cleanTable`: prostokąt najwyżej `TABLE_MAX_ROWS` = 100 × `TABLE_MAX_COLUMNS` = 12, komórka do 500 znaków,
krótsze wiersze dopełnione; `NOTE_TABLE_LIMIT` = 30 tabel). Treść tabel nie jest w `html` – tekst ma tylko
odwołanie `[[Tabela 1]]`, jak przy obrazach. Sygnatury: `withTableLabels(tables, imageLabels)` – kolejna
wolna „Tabela N”, z pominięciem sygnatur obrazów (wspólna przestrzeń, `findTableByLabel` porównuje
`labelKey`); zapis notatki (`#writeNote` w bibliotece) i kopia zapasowa przepuszczają listę przez
`cleanNoteTables`, a zapis bez pola `tables` (np. import) zostawia tabele notatki. Okno tabeli:
siatka `<textarea>` (`field-sizing: content`, w starszych przeglądarkach wysokość z `scrollHeight`), stan
`{ rows, header, headerColumn, align }`, przyciski wierszy i kolumn przy komórce z fokusem (`mousedown`
bez zabrania fokusu); wklejenie – `rowsFromHtml` (tabela z Worda, OneNote, strony; `<br>` w komórce –
nowy wiersz tekstu) albo `parseTableText` (Excel: tabulatory, cudzysłowy z nowymi wierszami w środku),
od komórki z kursorem, z dopisaniem wierszy i kolumn. Podgląd: `contentUnits` w `note-book.js` daje
jednostkę `{ kind: 'table', index, node, caption, from, to }` w miejscu odwołania (tabele bez odwołania –
za obrazami); podział strony szuka binarnie największej liczby wierszy treści, które mieszczą się na
stronie, a reszta przechodzi z `<thead>` na następną (podpis – tylko nad pierwszą częścią, `continued`).
`tableNumbers` liczy „Tab. N.” jak `figureNumbers`, ale osobno. `tableHtml(table, { portable })` – styl
w komórkach dla Worda i OneNote; `tableText` – komórki po tabulatorze (zwykły tekst schowka),
`htmlWithTables` – arkusz notatek eksportu (komórka nie ma tabel: podpis i wiersze „a | b | c”),
`tableSpeech` – słuchanie lekcji (`noteSteps`: w miejscu odwołania, każda tabela raz). W kafelkach
edytora tabele mają te same polecenia co obrazy (`renameImage` i `editCaption` obsługują oba rodzaje).

Od 1.26 tabela ma też (`cleanTable` zapisuje je tylko, gdy coś zmieniają): `headAlign` – wyrównanie wiersza
nagłówka osobno od wartości (`cellAlign`; brak – jak `align`), `formats` – format wartości kolumny
(`TABLE_FORMATS`: 'text', 'integer', 'number', waluty 'pln' | 'eur' | 'usd' | 'gbp' | 'chf', 'date') i `colWidths` –
udział kolumn w szerokości (suma 1, najmniej 2%; `cleanColumnWidths`, `moveColumnBorder` – granica między
kolumnami, `widthsWithColumn` / `widthsWithoutColumn` – przy dodaniu i usunięciu kolumny). Komórka jest
zapisana jak wpisana; `displayCell` pokazuje ją w formacie kolumny (`parseNumber` – spacje, apostrof
i kropki tysięcy, przecinek albo kropka dziesiętna, symbol waluty pomijany; `formatNumber` – twarda spacja
co trzy cyfry, przecinek, minus „−”; `parseDate` – rrrr-mm-dd, dd.mm.rrrr, d/m/rr), a nagłówki, puste,
wielowierszowe i nie-liczby – bez zmian. `tableHtml` (podgląd, druk, schowek; `<colgroup>` w procentach przy `colWidths` – od 1.27 bez
`table-layout: fixed`, więc kolumna nie jest węższa niż najdłuższe słowo), `tableText`, `tableLines` i `tableSpeech` używają wartości
pokazywanych. W oknie tabeli przycisk kolumny otwiera okno **Kolumna N** (`openColumnSheet`: format,
wyrównanie wartości i nagłówka – nagłówek idzie za wartościami, dopóki nie wybierze się mu innego; liczba
i waluta przy wyrównaniu do lewej – do prawej), uchwyt `.table-editor__grip` między przyciskami zmienia
`colWidths` przeciąganiem (szerokość komórek w oknie – udział × liczba kolumn × 9,5 rem), a komórka bez
kursora pokazuje `displayCell` (z kursorem – tekst jak wpisany). Na rysunku `tableColumnWidths`
(`drawing-boxes.js`) bierze `colWidths` albo naturalne proporcje, a zaznaczona tabela ma uchwyty `col-N`
na górnej krawędzi (granice kolumn, `editBoxHandle`).

Od 1.26 pasek notatki ma przycisk **Wstaw obiekt** (`command: 'object'`, panel `note-objects` pod paskiem,
jak symbole): **Nowy – Rysunek** (`drawNew()` zwraca obraz rysunku), **Zdjęcie** (`addFiles(files,
{ insert })` – wybór z panelu) i **Tabela** (`addTable({ insert })`) wstawiają też odwołanie w miejscu
kursora (`insertReference` – jak „Wstaw do tekstu”); niżej lista obrazów i tabel notatki (miniatura,
rodzaj, podpis, „już w tekście” – akapity `referenceLabel` w edytorze). `renderImages`, `renderTables`
i wpisywanie tekstu odświeżają otwarty panel (`refreshObjectsPanel`). Przycisk **Σ** (`editEquation`)
otwiera `openMathHelp` z zaznaczonym tekstem jako zapisem – `$…$` trafia do tekstu po „Wstaw”;
osobnej ikony ściągawki (`equationHelp`) już nie ma.

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

Od 1.11 **wzory** (`js/core/math.js`, `js/ui/math.js`): w treści notatki zostają tekstem `$…$`
i `$$…$$` – zapis nie zmienia filtra HTML, eksportu, kopii ani wyszukiwania. `mathSegments()` znajduje
wzory jak Pandoc: po otwierającym `$` i przed zamykającym nie ma odstępu, a po zamykającym – cyfry,
więc kwoty („$20 i $30”, „$5/$10”) zostają tekstem; `\$` to zwykły dolar. `parseMath()` czyta podzbiór
LaTeX (potęgi i indeksy, `\frac`, `\sqrt[n]`, `\binom`, litery greckie, relacje i strzałki, `\sum`/`\prod`
z granicami, całki, funkcje `\sin`…`\lim`, `\mathbb`, `\text`, `\left…\right`, akcenty, odstępy) do drzewa
z listą błędów (nieznane polecenie, nawiasy); długość i zagnieżdżenie są ograniczone. `js/ui/math.js`
buduje z drzewa MathML przez `createElementNS` (bez `innerHTML`) – wzory składa przeglądarka (MathML
Core w Chrome i Edge, MathML w Safari), czcionką z tablicą matematyczną systemu (STIX Two Math na
urządzeniach Apple, Cambria Math na Windows). `contentUnits` w `note-book.js` zamienia zapis na wzory
po rozpoznaniu odwołań do obrazów, a podział akapitu między strony pomija miejsca wewnątrz wzoru
(`mathRanges`). Każdy `<math>` ma `data-source` (zapis) i `data-spoken` (`spokenMath` – słowa
w języku notatki: „x do kwadratu”, „a przez b”, „pierwiastek z x”); z tego czyta „Czytaj na głos”,
a słuchanie lekcji (`noteSteps`) – z `spokenText()`. Edytor: przycisk „Wzór” (`$$` z kursorem w środku
albo `$zaznaczenie$`) i „Równania – ściągawka” (`openMathHelp`: pole z podglądem, przykłady
z `MATH_CHEATSHEET`, wstawienie po zamknięciu okna – wcześniej edytor pod oknem jest zablokowany).

Od 1.12 **rysunki** (`js/core/drawing.js`, `js/ui/drawing.js`): rysunek to obraz notatki – PNG
strony (JPEG, gdy pod spodem jest zdjęcie) w `bytes`, więc podgląd, powiększenie, sygnatury, eksport
i „Kopiuj notatkę” działają bez zmian – a w tym samym rekordzie `noteImages` pole `drawing`:
`{ version, width, height, paper, strokes, photo? }`. Kreska to `{ tool: 'pen' | 'highlighter', color,
points: [x, y, w, …] }` – `w` to grubość w punkcie (pióro: `penWidth(nacisk, od–do, czułość)`,
zakreślacz: stała), współrzędne w jednostkach strony (1600 × 1100, na zdjęciu – jego wielkość,
najwyżej 2048 px), zaokrąglone do 0,1. `cleanDrawing()` sprawdza dane przy zapisie i z kopii (złe
kreski i liczby pomija, ogranicza do strony, limity kresek i punktów). Edytor: dwa płótna – zapisane
kreski (rysowane od nowa po zmianie widoku albo cofnięciu) i bieżąca kreska nad nimi; Pointer Events
(`pointerType`, `pressure`, `getCoalescedEvents`, przycisk gumki rysika `buttons & 32`). Po pierwszym
zdarzeniu rysika (`localStorage`) palec tylko przesuwa, a dotyk w trakcie kreski rysikiem (dłoń) nie
rusza strony; dwa palce – powiększenie wokół środka palców. Od 1.24.2 `moveGesture` liczy dwa palce
od początku gestu (`startGesture`: powiększenie, środek palców na ekranie i punkt strony pod nim):
powiększenie = początkowe × odstęp palców / początkowy odstęp, a położenie tak, żeby punkt strony
z początku był pod obecnym środkiem palców (potem `clampView`) – wcześniej przesunięcie od początku
gestu łączyło się ze skalą z poprzedniej klatki (`setZoom` liczy od bieżącego widoku), więc strona
uciekała w stronę lewego górnego rogu, a przesuwanie skakało. Gumka usuwa całe kreski (odległość od
odcinków z ich grubością); kolejne kreski starte jednym pociągnięciem to jeden krok `DrawingHistory`.
Zakreślacz: `multiply` i przezroczystość 0,45 – tusz pod spodem zostaje ciemny. Ustawienia narzędzi
(kolory, grubości, czułość, wygładzanie, od 1.12.1 tryb i wielkość gumki) – `localStorage` urządzenia.
Od 1.12.1: **gumka fragmentów** (`eraseFromStroke`, `eraseAt`) przecina kreskę na brzegu koła gumki
(promień + połowa grubości; odcinek między punktami przecinany dokładnie, grubość z nacisku
przeliczona w miejscu cięcia) i zastępuje ją kawałkami – rysunek zostaje wektorowy, zdjęcie pod
spodem nietknięte; koło gumki ma stałą wielkość na ekranie, a szybki ruch jest dzielony na gęste
kroki. **Historia** to stany listy kresek przed zmianą i po niej (`begin()` … `commit()`), bo kreski
są niezmienne – starcie, przesunięcie i powielenie dają nowe obiekty. **Zaznaczanie**: kreski
z linią środkową w całości w prostokącie (`strokesInRect`) albo dotknięta kreska; przesuwanie
rysuje zaznaczone kreski na warstwie bieżącej z przesunięciem (warstwa zapisanych je pomija) i na
końcu zastępuje je przesuniętymi (`translateStroke`) jednym krokiem. **Linijka** `{ x, y, angle }`
w jednostkach strony, szerokość stała na ekranie (64 px), rysowana na warstwie bieżącej z podziałką
(do 1.13 co ćwierć kratki, od 1.14 w skali rysunku – niżej) i kątem (`rulerDegrees`: 0–179°, przeciwnie do ruchu wskazówek zegara); kąt
przyskakuje co 45° (±2,5°, `snapRulerAngle`). Kreska zaczęta do 26 px od krawędzi jest rzutowana na
prostą krawędzi (`rulerOffset`, `rulerPoint`). Linijkę przesuwa jeden palec albo mysz, obracają dwa
palce (wokół środka palców) albo uchwyt. Pasek narzędzi leży nad płótnem: płótno ma stałą wielkość,
a strona mieści się pod paskiem (miejsce mierzone przy otwarciu, obrocie ekranu i „100%”).
Od 1.13 (format rysunku 2) lista `strokes` ma też **pola tekstowe** `{ tool: 'text', color, x, y, size,
text, maxWidth, width, height }` i **wzory** `{ tool: 'math', color, x, y, size, source, width, height }`
– wspólna kolejność rysowania, zaznaczanie, przesuwanie, powielanie i historia jak dla kresek
(`isElement`: granice z `width`/`height`, gumka całych kresek usuwa całość, gumka fragmentów je
omija). Wymiary są mierzone przy wstawieniu i od nowa przy otwarciu edytora (czcionki urządzenia).
Tekst – czcionka systemu, łamanie na słowach do `maxWidth` (60% strony). Wzoru w MathML nie da się
przenieść na płótno (Safari blokuje zapis płótna z obrazem SVG z `foreignObject`), więc
`js/core/math-layout.js` składa go sam z drzewa `parseMath()`: pudełka { w, a, d, draw } w czterech
stylach (wyświetlany, tekstowy, indeks, indeks indeksu), odstępy wokół działań i relacji, znak liczby,
ułamek z kreską na osi wzoru, znak pierwiastka i stopień, granice sumy i lim nad i pod, duże operatory
wyśrodkowane na osi, akcenty i nawiasy rysowane kreską w wysokości treści; szerokości mierzy
`measureText` płótna (czcionka wzorów systemu: STIX Two Math, Cambria Math). Okno wzoru to okno
„Równania” (`openMathHelp` z opcjami `raw`, `extra`, `allowEmpty`). Nowy element trafia na środek
widocznej części strony, pod już leżące tam pola i wzory, i jest od razu zaznaczony. Edytor notatki: „Narysuj”
dodaje obraz „Rysunek N”, „Edytuj rysunek” i „Rysuj na zdjęciu” zastępują obraz nowym w tym samym
miejscu, z tą samą sygnaturą (stary rekord znika przy zapisie notatki, jak usunięty obraz).
Od 1.14 rysunek ma **skalę** `scale: { value, unit }` – ile w rzeczywistości ma jedna kratka (44
jednostki strony); `SCALE_UNITS` – mm, cm, m, km i in, ft, yd, mi z długością w metrach, `cleanScale()`
(brak albo zła – 1 cm). Linijka rysuje podziałkę w jednostkach skali: liczby co 1, 2 albo 5 × 10ⁿ
jednostek (najgęściej tak, żeby napisy się nie stykały), kreski co 1/10, 1/5 albo 1/2 odstępu (co
najmniej 4 px), od zera na środku. Szacunek ekranu (`screenScale`, `formatRatio`, `screenScaleValue`)
liczy wielkość kratki z pikseli CSS i przybliżonej gęstości ekranu według urządzenia (iPhone 153/163,
iPad 132, iPad mini 163, Mac 127, inny komputer 96, z powiększeniem ekranu 110 pikseli na cal).
Długość kreski przy linijce to zasięg rzutów punktów na krawędź (`formatLength`). **Przyciąganie zera**
(`snapToStrokes`): punkty zera przy obu krawędziach; w promieniu 20 px ekranu najpierw przecięcie
odcinków dwóch kresek, potem najbliższy punkt kreski z jej kierunkiem (kreski poza granicami pomijane
od razu); przy linii i różnicy do kąta prostego do 8° (`lineAngleDifference`) – kąt prostopadły
najbliższy obecnemu (`perpendicularAngle`), a linijka jest ustawiana tak, żeby zero tej krawędzi leżało
w punkcie przyciągnięcia (obrót uchwytem – wokół tego punktu). Linijka `{ x, y, angle, snap }` – `snap`
tylko na ekranie (pigułka, kółko). **Zaznaczanie** ma kształt (`rect`, `lasso`) i tryb (`auto`, `whole`,
`region`): w Auto kierunek prostokąta (`x1 < x0`) i obrysu lassa (`isClockwise` – pole wielokąta przy
osi y w dół) decyduje o fragmentach. Całe kreski w lassie – `strokesInPolygon` (wszystkie punkty
w wielokącie, reguła parzystości); fragmenty – `splitByPolygon`: każdy odcinek kreski przecinany
z bokami wielokąta, kawałki w środku i poza nim (grubość przeliczona w miejscu cięcia), pole tekstowe
i wzór tylko w całości. Zaznaczenie fragmentu zastępuje kreski kawałkami po `history.begin()` bez
`commit()`: przesunięcie, usunięcie albo gumka kończą krok (cięcie razem ze zmianą), a zdjęcie
zaznaczenia, cofnij, inne narzędzie i „Gotowe” wołają `history.rollback()` – kreski wracają w całości
bez kroku historii; „Powiel” i „Kopiuj” biorą kawałki z wnętrza bez cięcia oryginału. **Schowek**:
kreski w pamięci modułu i w `localStorage` (`lexicards-drawing-clipboard`, do 1,5 mln znaków JSON,
przy odczycie przez `cleanDrawing`), wklejenie – na środek widocznej części strony (kolejne przesunięte),
pola i wzory mierzone od nowa; do schowka systemu idzie też obraz PNG zaznaczenia (`navigator.clipboard.write`,
błąd pomijany). **Własne kolory**: kolor narzędzia to nazwa z palety albo `#rrggbb` (`isHexColor`);
panel ma siatkę (`hslToHex`: 12 odcieni × 6 jasności i szarości), suwaki RGB z kodem HEX
(`hexToRgb`, `rgbToHex`) i pipetkę – piksel warstwy zapisanych kresek pod wskaźnikiem (`getImageData`,
poza stroną bez zmiany) i lupa 15 × 15 pikseli na warstwie bieżącej; `rememberColor` trzyma trzy
ostatnie. Ustawienia narzędzi mają też `customColors`, `selectShape`, `selectMode`, `rulerSnap`.
Komunikaty edytora (np. „Skopiowano”) są w pigułce w rogu – zwykłe komunikaty aplikacji leżą pod
oknem rysunku.
Od 1.15 (format rysunku 3): **kształty** w `strokes` – `{ tool: 'shape', shape, color, size, x, y, w, h,
angle, skew, adjust }` (`js/core/shapes.js`): punkt (u, v) ramki to (u·w − skew·v·h, v·h) obrócony
o `angle` wokół środka (x, y), więc pochylenie przesuwa górną krawędź względem dolnej, a elipsa jest
rysowana czterema krzywymi Béziera przekształconymi tak samo (dokładnie, ze stałą grubością linii).
Kształt jest elementem (`isElement`): obrys (`shapeOutline`, elipsa – 48 punktów) służy do trafienia
gumką i dotknięciem, zaznaczania w całości (`elementCorners`), granic i przyciągania zera linijki
(`shapeAsStroke`); dotknięcie pustego środka – `shapeContains`. Punkty konstrukcyjne (`shapeHandles`,
`moveShapeHandle`) są liczone od kształtu sprzed przeciągnięcia: narożnik i środek boku – przeciwny
punkt zostaje, pochylenie – dolna krawędź zostaje (blisko zera – 0), obrót – wokół środka (co 15°
z przyciąganiem do 2°), `adjust` – wierzchołek trójkąta (przyciągany do 0, ½, 1) i wcięcie trapezu;
w trakcie przeciągania warstwa zapisanych kresek pomija kształt, a bieżąca rysuje podgląd; koniec –
jeden krok historii. **Tło**: `paperLevel` (0–4) wybiera kolor linii i kratki (`PAPER_COLORS`);
**szablon** `template: { source: 'pitch' | 'image', x, y, w, h, level, type?, width?, height?, bytes? }`
(`js/core/templates.js`) jest rysowany po zdjęciu, a przed kreskami: boisko – liniami z `PITCH`
(105 × 68 m), obraz – `drawImage` z `multiply` (biel znika) i kryciem `TEMPLATE_ALPHA[level]`.
Ustawianie (`placing`) przechwytuje wskaźnik na płótnie (przesuwanie), panel zmienia wielkość wokół
środka (`scaleTemplate`), dopasowuje (`fitTemplate`) i wyśrodkowuje; „Anuluj” przywraca szablon,
obraz i skalę sprzed ustawiania. Skala z boiska: 105 m na szerokość szablonu (`pitchScale`). Obraz
szablonu z pliku przechodzi przez `prepareImage` (jak obrazy notatki) i jest zapisany w rysunku,
a w kopii zapasowej – jako `rysunki/<id>-szablon.<typ>` (w spisie `drawing.template`); szablon bez
pliku przy przywracaniu jest pomijany. **Liniuszek** (tylko w edytorze, ustawienia w `tools.guide`):
rodziny linii `{ x, y, angle, spacing }` – główne i poprzeczne (kąt względem głównych, odstęp mierzony
wzdłuż głównych); `nearestGuideLine` – rzut punktu na najbliższą linię. Kreska jest najpierw zwykła;
po odsunięciu o 10 px od początku, gdy początek leży do 12 px od linii, a kierunek różni się od niej
najwyżej o 20°, wszystkie dotychczasowe punkty trafiają na tę linię, a następne są na nią rzutowane
(jak przy krawędzi linijki – z długością w skali). Kółko liniuszka przesuwa punkt rodziny
(przyskok do węzłów kratki do 8 px). Od 1.22 `tools.guide.kind: 'lines' | 'radial'`; promieniowy –
`radialFamily()` `{ x, y, spacing, step, angle }` (środek w kółku, `ringSpacing` w kratkach, `rayStep`
z `RAY_STEPS` – dzielniki 360°, `rayAngle` −90…90 – na ekranie kąt ujemny) i `nearestRing`,
`nearestRay`, `ringsIn` (okręgi przecinające stronę, najwyżej 2000), `rayAngles` z `js/core/shapes.js`.
`decideGuide` po tych samych progach (10 px, 12 px, 20°) wybiera okrąg (kierunek kreski – styczna
w punkcie początku) albo promień; krawędź kreski `active.edge` jest wtedy `{ circle: { x, y, r } }`
i `onEdge` rzutuje punkty na okrąg (kąt ciągły – bez skoku przy ±180°, `along` = kąt × promień, więc
pigułka pokazuje długość łuku) albo `{ ruler }` jak przy linii.
Od 1.24 **zaznaczenie ma pierwszeństwo przed kółkiem liniuszka**: `onSelection(point)` (zaznaczanie –
ramka zaznaczenia, kształty – zaznaczony kształt: wnętrze albo linia) sprawdzane w `pointerdown` przed
`guideKnobHit` (też przy palcu, gdy rysuje tylko rysik) – element wstawiony na środku widoku, czyli na
kółku, przesuwa się przeciągnięciem (na telefonie ze skalą < 1 pole trafienia kółka obejmowało go
całego). `guide-move` liczy ruch dopiero od `TAP_SLOP`; dotknięcie kółka bez ruchu przy zaznaczaniu –
jak dotknięcie strony (`finishOutline` w punkcie).
Od 1.17 (format rysunku 4): kształt może mieć **wypełnienie** `fill: 'light' | 'solid'` (kolor kształtu,
krycie `FILL_ALPHA`; odcinek i strzałka – bez) – wnętrze wypełnionego kształtu liczy się przy trafieniu
(`touchesShape`) – i **tekst** `label: { text, size, color, width, height }`: `labelFrame` – środek
kształtu (odcinek – nad linią), kąt kształtu sprowadzony do czytelnego (−90°…90°), wiersze łamane do
`labelMaxWidth` (szerokość kształtu z marginesem). `width` i `height` mierzy edytor (`measureLabel`)
przy wpisaniu, otwarciu, wklejeniu i każdej zmianie kształtu; granice kształtu (`shapeBounds`) i
dotknięcie obejmują tekst. **Pola wymiarów** (HTML nad płótnem, `placeDims`): szerokość, wysokość
i kąt pochylenia przy środkach linii ramki (odsunięte wzdłuż normalnej boku o pół pola + 16 px),
odcinek – długość i kąt; wartości w skali rysunku (`toScaleLength`, `fromScaleLength`) i stopniach;
zmiana – `resizeShape` (wokół środka, pochylenie = tan kąta) albo `setSegment` (początek na miejscu),
jeden krok historii. Dotknięcie punktu konstrukcyjnego bez ruchu (< 5 px) ustawia fokus w polu
(`HANDLE_FIELDS`). **Wycinek**: prawy przycisk (`button === 2`, mysz albo rysik) przy zaznaczaniu albo
tryb `snip` – obrys nie zaznacza kresek, tylko zapamiętuje obszar `snip = { polygon, bounds, kind }`
(przycięty do strony). Obraz wycinka (`snipCanvas`) to `paintDrawing` przycięty ścieżką obrysu, 2 px
na jednostkę (najdłuższy bok ≤ 2048); poza lassem – przezroczyście. **Kopiuj** – `ClipboardItem`
z obietnicą PNG (schowek otwierany od razu w chwili dotknięcia). **Osadź** – `onEmbed({ blob, width,
height })` przekazane przez edytor notatki: obraz przechodzi przez `prepareImage` i trafia do obrazów
notatki („Obraz N” z `withImageLabels`) zaraz za rysunkiem; inne obrazy zostają tymi samymi obiektami
(edytor notatki odnajduje po nich rysunek po zamknięciu edytora), a nowy rysunek wstawia się przed
obrazy z niego osadzone. Zaznaczenie (całe albo fragmenty) – obraz samych elementów na białym tle
(`strokesCanvas`).
Od 1.19 (format rysunku 5): **zakończenia odcinka** `startCap`, `endCap` (`SEGMENT_CAPS`: none, arrow,
triangle, circle, square, diamond; zapisane tylko inne niż domyślne – `segmentCaps` daje strzałce sprzed
1.19 grot na końcu). `segmentCap(shape, which)` – geometria: ramiona grotu, wielokąt (trójkąt z ostrzem
w końcu odcinka, kwadrat i romb ze środkiem w końcu) albo koło, oraz `trim` – miejsce, w którym kończy się
linia (pod trójkątem). Granice, dotknięcie i zaznaczanie obejmują zakończenia (`capPoints`).
**Stałe wymiary** `dims: ['width', 'height', 'skew']` albo odcinek `['length', 'angle']` (`withDims`) –
napisy z `dimensionText` (skala rysunku) w miejscach z `dimPlaces` (te same co pola wymiarów, `dimCenter`
odsuwa napis od linii ramki o `DIM_GAP` i pół napisu); `paintStroke(ctx, stroke, { scale, dims })` – warstwa
zapisanych kresek pomija napisy kształtu z polami wymiarów (`plain`). **Shift** (`lock`): `shapeFromDrag`
– równe boki, odcinek co 15°; `moveShapeHandle` – narożnik z zachowaniem proporcji, koniec odcinka
i obrót co 15°; edytor śledzi klawisz (`shiftDown`) i przelicza przeciągany kształt także bez ruchu.
**Szyk** (`js/core/arrays.js`) – element `{ tool: 'array', kind, items, … }` w `strokes`: `expandArray`
(zapamiętane w `WeakMap`) daje wszystkie kopie jako zwykłe elementy – z nich rysowanie, granice,
dotknięcie, zaznaczanie (tylko w całości), przyciąganie linijki i „Rozdziel”; `translateArray`
przesuwa źródło i środek. Kołowy: kopie obracane wokół (cx, cy) o −k·krok (przeciwnie do ruchu
wskazówek zegara na ekranie), pierścienie – źródło odsunięte wzdłuż promienia; pola tekstowe i wzory
tylko przesuwane. `cleanArrayParams` ogranicza kopie do 400, `makeArray` pomija szyki w szyku.
**Ctrl**: przytrzymanie (200 ms bez innego klawisza) albo wskaźnik z `ctrlKey` – `ctrlHold = { previous,
mode: 'auto' }` i narzędzie zaznaczania; puszczenie (także `blur` okna) – `setTool(previous)`, po
zakończeniu trwającej czynności. **Środkowy przycisk** – czynność `pan` (przesunięcie widoku).
**Szablon**: narożniki w trakcie ustawiania – `resizeTemplateCorner` (rzut wskaźnika na przekątną od
przeciwnego narożnika), pole z procentami – `setTemplatePercent` względem `fitTemplate`.
**Kartki**: edytor ma listę `pages` ({ drawing, history, media, changed, ready }) i bieżące `drawing`,
`history`, `media`; wynik `{ drawing, image, pages }` – pierwsza kartka (null, gdy bez zmian) i kolejne
z treścią; edytor notatki wstawia je jako nowe rysunki (`addPages`) za otwartym rysunkiem.
Od 1.21 (format rysunku 6): **tabela** `{ tool: 'table', x, y, width, height, size, color, rows, header,
headerColumn, align }` (dane tabeli jak w notatce, `cleanTable`) i **karteczka** `{ tool: 'sticky', x, y,
width, height, size, color, text, created: 'rrrr-mm-dd', collapsed?, hidden?, leader?: { x, y } }`
(`STICKY_COLORS` – nazwa koloru; `hidden` – bez niej na obrazie w notatce). `height` jest zmierzona na
urządzeniu (`measureTable` – wysokość z treści, `measureSticky` – co najmniej tyle, ile zajmuje tekst),
a rysowanie (`drawing-boxes.js`) liczy układ od nowa: szerokości kolumn – naturalne (najdłuższy wiersz
komórki) rozciągnięte albo ściśnięte do szerokości tabeli, łamanie wierszy `textLines` z `canvas-text.js`
(pół piksela zapasu, żeby zaokrąglona szerokość nie łamała słowa). `elementBox` – prostokąt elementu
(zwinięta karteczka – ikona `STICKY_ICON` = 60); granice, dotknięcie i zaznaczanie obejmują strzałkę
(`leaderStart` – punkt na brzegu karteczki w stronę celu), `translateStroke` przesuwa też koniec strzałki
(karteczka przesuwana sama – `keptTarget` – zostawia go na miejscu). Uchwyty zaznaczonej tabeli i karteczki (`box-edit`):
narożnik – szerokość (tabela) albo wielkość (karteczka), kółko – koniec strzałki. Zwinięta zaznaczona
karteczka – treść obok ikony na warstwie bieżącej (`stickyPopoverBox`), a polecenia zaznaczenia omijają
ją. Obraz do notatki pomija karteczki `hidden`; numer karteczki to kolejność wśród karteczek rysunku.
`makeArray` pomija tabele i karteczki (szyk), gumka fragmentów ich nie przecina. Ustawienia narzędzi:
`highlighterWidths` (trzy grubości zakreślacza, `HIGHLIGHTER_RANGE` 4–60; `cleanStroke` dopuszcza 60
tylko dla zakreślacza) i `stickyColor`. Starsza wersja aplikacji pomija tabele i karteczki rysunku (obraz
w notatce zostaje), a przy poprawce rysunku zapisze go bez nich.
Od 1.22 (format rysunku 7): element może mieć **identyfikator** `id` (`[a-z0-9]{6,16}`, nadawany przy
pierwszym przyklejeniu – `newElementId`), a odcinek i strzałka – **przyklejone końce** `attach: { start?,
end? }`, karteczka – `attach: { leader? }`. Odnośnik: `{ id, kind: 'corner', index }`, `{ id, kind: 'edge',
index, t }` (bok i miejsce na nim 0…1) albo dla elipsy `{ id, kind: 'edge', angle }` (kąt parametru).
`js/core/attach.js` nie zna edytora (prostokąt elementu `boxOf` – `elementBox` – przekazuje edytor):
`snapGeometry` – narożniki i boki (kształt z `shapeOutline`, odcinek – dwa końce, środek i sam odcinek,
elipsa – cztery punkty i obwód, element z ramką – prostokąt); `findSnap(strokes, point, radius)` –
narożnik do 1,4 × promienia ma pierwszeństwo, inaczej najbliższy bok (na elipsie – punkt obwodu
dociągany kilkoma krokami); `attachPoint` – punkt odnośnika na bieżącym elemencie. Edytor przyciąga
(`EDGE_SNAP` = 14 px ekranu, bez Alt i przy `tools.edgeSnap`) w czynnościach `shape-new` (początek
i koniec – `segmentBetween`), `shape-edit` (koniec odcinka) i `box-edit` (koniec strzałki karteczki),
z kwadracikiem (narożnik) albo kółkiem (bok) na warstwie bieżącej, a po puszczeniu `linkEnds` /
`replaceLinked` zapisuje odnośniki (`withLink`; koniec puszczony bez przyciągnięcia – odklejony).
Każdy krok historii (`commitStep`) kończy `resolveAttachments` – po `history.begin()`, więc przesunięte
końce należą do tego samego kroku cofania; mapa stary → nowy poprawia zaznaczenie. W trakcie ruchu
`followersOf` daje podgląd elementów, które idą za przesuwanym albo zmienianym (warstwa zapisanych
kresek je pomija). `moveSelection` odkleja końce od elementów spoza zaznaczenia (`keepLinksTo`),
powielenie i wklejenie – `relinkCopies` (nowe identyfikatory, przyklejenia tylko między kopiami), szyk
– `withoutLinks`. Sprawdzanie (`cleanElement` → `keepLinks`) przepuszcza tylko poprawne `id`
i odnośniki do istniejących końców. Starsza wersja aplikacji pomija `id` i `attach` (rysunek bez
zmian), a przy poprawce rysunku zapisze końce tam, gdzie są – bez przyklejenia.
Od 1.22.1 (format rysunku 8): **wymiary techniczne** (`js/core/shapes.js`). `dimGeometry(shape, key,
offset)` – wymiar liniowy: punkty mierzone `linearMeasure` (szerokość – dolna krawędź, elipsa i romb –
skrajne punkty; wysokość – prostopadle do podstawy, po prawej, od wierzchołka trójkąta albo górnego
narożnika trapezu; długość odcinka – po stronie bez łuku kąta), linia wymiarowa za dalszym punktem
w odsunięciu, linie pomocnicze od przerwy `DIM_EXT_GAP` do `DIM_EXT_OVER` za linię, środek liczby nad
linią w kierunku czytania (`readableAngle` – od −90° do 90° bez 90°: pion od dołu do góry, ISO 129);
kąt (pochylenie – przy lewym dolnym narożniku od pionu, odcinek – na początku od poziomu) – środek,
promień, początek i rozwartość łuku, linia odniesienia. `dimOffsets` w kształcie (brak – `DIM_OFFSET`
40, łuk – połowa ramienia), `dimOffsetAt` – odsunięcie z położenia przeciąganej liczby,
`stackDimOffset` – kolejne piętro (`DIM_TIER` 36), gdy równoległa linia wymiarowa innego wymiaru jest
w tym samym miejscu i zachodzi na nową (z zapasem czcionki); `dimTols` – `cleanDimTolerance` (znak tylko
dla długości, ± bez zera, odchyłki – obie, pasowanie – `FIT_RE`). Napis – `dimensionParts(shape, key,
scale, style)` w `js/core/drawing.js` (`dimStyle: 'technical'` rysunku – `dimFactor` do mm albo cali,
`dimUnitLabel` dla pól). Rysowanie – `paintTechnicalDim` (`js/ui/drawing-gdt.js`): groty zaczernione,
przy krótkim wymiarze na zewnątrz; liczba z białą obwódką, znak ⌀ / □ kreską, odchyłki 0,64 czcionki
jedna nad drugą. Zaznaczony kształt: warstwa zapisanych kresek pomija jego wymiary (`plain`), warstwa
bieżąca rysuje same linie (`paintDims(…, { text: false })`), a pola wymiarów (`placeDims`) stoją
w miejscu liczby; uchwyt (`startDimDrag`, nasłuch na `window`, miejsce chwytu względem liczby) –
czynność `dim-offset` z podglądem przerywanym, po puszczeniu `withDimOffset` i wzór `tools.dimOffset`
(dla długości); oko – `showDim` (wzór i piętro). Przycisk ± – `editDimMarks` (`withDimTolerance`).
Od 1.27 (bez zmiany formatu rysunku – nowe pola i rodzaje kształtów; starsza wersja aplikacji je pomija):
**rodzaj linii** `dash` ('dashed' | 'center' | 'phantom' | 'dotted', `SHAPE_DASHES`; brak – ciągła, punkt go
nie ma – `canDash`) – `dashPattern` daje wzór `setLineDash` w wielokrotnościach grubości (zaokrąglone końce:
kreska dłuższa o grubość, przerwa krótsza, kropka – kreska 0,001), `paintShape` przerywa tylko linię
kształtu (groty i zakończenia – ciągłe), `withDash` zapisuje tylko inną niż ciągła. **Prosta** `xline`
(w `isSegment`: dwa punkty, kąt co 45°, przyciąganie końców) – `shapeOutline` sięga `XLINE_REACH` za punkty
(dotknięcie i gumka na całej długości, płótno i obraz przycinają ją do strony), `shapeBounds` – z samych
punktów (ramka, zaznaczanie prostokątem); bez zakończeń (`hasCaps`), wymiar – tylko kąt. **Punkt** `point`:
(x, y), średnica `w = h` (`pointDiameter` z grubości pióra), znacznik `mark` (`POINT_MARKS`: center – kółko
z krzyżykiem, punkt symetrii, dot, cross, plus; `pointMarkGeometry`), bez uchwytów, wymiarów i wypełnienia;
tekst obok znacznika. **Strzałka po łuku** `curve` (w `isPoly`: `nodes` – dokładnie cztery wierzchołki):
`curveControls` – jedna krzywa Béziera [P0, C1, C2, P3] przechodząca przez punkty pośrednie w t = ⅓ i ⅔
(12·C1 + 6·C2 = 27·P1 − 8·P0 − P3, 6·C1 + 12·C2 = 27·P2 − P0 − 8·P3); `shapeFromDrag` – punkty w ⅓ i ⅔
cięciwy odsunięte o ⅕ jej długości na lewo od kierunku przeciągnięcia; zakończenia jak odcinka
(`capFrame` – koniec i kierunek stycznej, długość grotu od cięciwy; domyślnie grot na końcu, `curveCaps`
w ustawieniach), trójkąt przycina krzywą (`bezierTrim`, `bezierPart` – de Casteljau); obrys –
`curveSamples` (32 odcinki), wierzchołki bez przyciągania kierunków (`moveNode`), bez wymiarów (`dimPlaces`
zwraca tylko klucze `dimKeys`). Przyciąganie (`snapGeometry`): punkt – środek, łuk – końce i krzywa.
Edytor: panel kształtów – **Prosta**, **Strzałka po łuku**, **Punkt**, rząd **Linia** (`styleChoices`,
`tools.shapeDash`; zmienia też zaznaczone kształty – `restyle`, jeden krok cofania) albo **Znacznik punktu**
(`tools.pointMark`), zakończenia łuku (`CAPS_KEYS`); nad zaznaczeniem jeden przycisk **Styl** (`chooseStyle`,
w miejsce dawnych „Wypełnienie” i „Końce” – pasek mieści się na telefonie): okno z rodzajem linii, wypełnieniem,
zakończeniami (`capChoices`) albo znacznikiem; kilka zaznaczonych kształtów – sam rodzaj linii; zmiana po
„Gotowe” przez `restyle` (jeden krok cofania). `openMenu` pokazuje ikonę także przy pozycji do wyboru.

Od 1.25 (format rysunku 10): **jednostka liczb wymiarów** – `drawing.dimUnit` ('mm' | 'cm' | 'm' | 'in',
`DIM_UNITS`; tylko przy `dimStyle: 'technical'`, brak – `defaultDimUnit`: mm, przy skali imperialnej
cale). `dimFormat(drawing)` → `{ style, unit }` zastępuje dawny napis stylu w `dimensionParts`, `dimFactor`,
`dimUnitLabel` (napis 'technical' | 'unit' nadal działa – jednostka domyślna); `paintStroke` dostaje
`dimFormat`. **Tolerancje długości są w mm** (`dimTols` – value, upper, lower), pokazywane w jednostce
liczby wymiaru (`dimMillimeters`, `formatTolerance` – do czterech cyfr znaczących), kąty – w stopniach;
`cleanDrawing` rysunków w formacie < 10 przelicza je do mm (`tolerancesInMillimeters`, `scaleDimTolerances`:
styl „50” – mm albo cale, styl „5 cm” – jednostka skali; też kształty w szyku), schowek czyta się jako
format 10. Oznaczenie **„Wymiary w …”** (`dimUnitNote`) rysuje `paintDrawing` (`paintUnitNote`, lewy dolny
róg za dziurkami spirali, 22 jednostki) przy stylu technicznym, gdy `hasMeasuredContent` (wymiar długości
na stałe albo ramka tolerancji) – w edytorze i na obrazie w notatce. Edytor: `setDimFormat(style, unit)`,
w panelu linijki styl i `dimUnitChoice`; okno tolerancji (`editDimMarks`) przy długości najpierw
`technicalForTolerancing` (rysunek „5 cm” → mm, „Anuluj” – `restore`), wybór jednostki w oknie (wpisane
liczby przeliczane), odchyłki – `signedInput` (przycisk znaku, `inputmode: decimal`, wpisany znak
przechodzi na przycisk), pasowania – `tools.recentFits` (`rememberFit`, najwyżej 6) i `openFitTable`
(`js/ui/fit-table.js`: `PREFERRED_FITS` – dotknięcie wybiera; budowanie z `HOLE_LETTERS`, `SHAFT_LETTERS`,
`IT_GRADES`, `isTableFit`); po zapisie – komunikat `announceTechnical`. Ramka tolerancji: wstawiona albo
poprawiona na rysunku „5 cm” – `technicalAfterFrame` (po wstawieniu dotknięciem). **Odchyłki w ramce**:
`upper`, `lower` w elemencie `gdt` (liczby jak wpisane, obie albo żadna, górna ≥ dolna – `cleanSymbol`),
napisy `gdtDeviations` / `signedDeviation`, w `measureGdt` i `paintGdt` małe, górna nad dolną, przed Ⓜ/Ⓛ.
Panele pod paskiem mają nagłówek `panelTitle` (przyklejony przy przewijaniu) z przyciskiem zamknięcia
`drawing-panel-close` → `closeSettings`.
**Symbole metrologiczne** (`js/core/gdt.js`, `isSymbol`, w `isBox` i `isElement`): ramka `gdt` – pola
`cells` mierzone w edytorze (`measureGdt`; `cleanSymbol` szacuje, gdy złe), strzałka od środka boku
zwróconego do celu (`symbolLeaderStart`); znak bazy `datum` – kwadrat i `leader` (środek podstawy
trójkąta, `datumTriangle` – podstawa prostopadle do linii); chropowatość `roughness` – (x, y) to
wierzchołek, `roughnessLayout` – ramiona pod 60° (1,4 h i 2,8 h), kreska nad tekstem, zamknięcie albo
koło, `symbolBox` → `elementBox`. Przyklejanie: końce `leader` (ramka, baza) i `tip` (chropowatość –
`movedEnd` przesuwa cały symbol); przesunięte same ramka i baza zostawiają koniec strzałki na miejscu
(`keptTarget`). Wstawianie: okno (`editGdt`, `editDatum`, `editRoughness`), potem `symbolPlacing` –
dotknięcie (bez palca, gdy rysuje tylko rysik) → `placeSymbol`: `edgeSnapAt`, ramka i kwadrat obok
w kierunku `snapNormal` (prostopadle do boku, od środka elementu), jeden krok cofania z `linkEnds`.
Uchwyt `target` w `boxHandles` (bez narożnika wielkości). Szyk pomija symbole. Starsza wersja aplikacji
pomija symbole, `dimStyle`, `dimOffsets` i `dimTols` (obraz w notatce zostaje), a przy poprawce
rysunku zapisze go bez nich.
Od 1.24 (format rysunku 9): **figury z odręcznych kształtów** (`js/core/recognize.js`, bez przeglądarki).
W edytorze kreska pióra (nie zakreślacza, bez krawędzi linijki i liniuszka, `tools.recognize`) ma
`active.hold`: `watchHold` przy każdym ruchu dalej niż `HOLD_SLOP` (6 px) od miejsca postoju ustawia od
nowa licznik `HOLD_MS` (500 ms); po nim `recognizeHeld` → `recognizeStroke(points, { color }, { scale })`
i podgląd figury zamiast kreski (`active.recognized`; dalszy ruch jej nie zmienia). Końce odcinka
i strzałki przy krawędzi – `edgeSnapAt`, `segmentBetween`, przy zapisie `linkEnds`. Puszczenie pióra:
`history.add(kreska)`, potem zamiana na figurę w osobnym kroku (`commitStep`) – „Cofnij” przywraca
kreskę. Rozpoznawanie: punkty co 1/40 przekątnej (najwyżej 400), kreska zamknięta, gdy koniec dochodzi
do początku (do 18% przekątnej; zakładka za początkiem odcięta); rogi – **ShortStraw** (słomka
z punktów ±3, róg w minimum przebiegu poniżej 0,95 mediany; między rogami kreska nieprosta – róg
w środkowej połowie, róg na prostej między sąsiednimi – usunięty; prosta – cięciwa ≥ 0,95 drogi albo
odchylenie ≤ 5%; haczyk do 6% długości na końcach kreski otwartej – pominięty), boki – prosta
dopasowana do punktów boku bez 15% przy rogach, wierzchołki – przecięcia boków. Kierunki przyciągane
do poziomu i pionu do 7°, do 45° do 5° (`snap`). Otwarta: odcinek (odchylenie ≤ 7,5%), strzałka
(`arrowFrom`: wierzchołki A, B, C, B, D albo A, B, C, D, B – ramiona 6–60% trzonu, 8–80° od trzonu, po
obu stronach; też odwrotnie – grot narysowany najpierw), łamana (proste boki). Zamknięta: wielokąt
o prostych bokach (3–24 rogi) albo elipsa (`fitEllipse`: osie z kowariancji, półosie z rozpiętości,
średni błąd promienia ≤ 0,12, obieg 300–420°; osie poziomo, pionowo albo pod 45°, gdy błąd prawie ten
sam; stosunek osi ≥ 0,87 – okrąg); przy obu – wielokąt, gdy każdy skręt ≥ 40°, a wyraźne rogi (słomka
≤ 0,82 mediany) przy błędzie > 0,045 wykluczają okrąg. Trójkąt – podstawa pozioma, pionowa albo
najdłuższa, `adjust` 0, ½, 1 i równoboczny – dokładnie; czworokąt – kąty ±12° od prostych: prostokąt
(kwadrat ±12%, kwadrat pod 45° – romb), boki równe bez poziomej pary – romb (przekątne), dwie pary
równoległych (±10°) – prostokąt z pochyleniem, jedna – trapez (`adjust` i pochylenie), inaczej
wielokąt. **Łamana i wielokąt** (`shape: 'polyline' | 'polygon'`, poza panelem kształtów – `POLY_SHAPES`):
`nodes` [u, v, …] w układzie ramki (`polyFromPoints`, `polyPoints`), więc przesuwanie, obrót, narożniki
i pola szerokości i wysokości działają jak dotąd; bez pochylenia, łamana bez wypełnienia i wnętrza.
`shapeHandles`: narożniki ramki, `v0…` (`kind: 'vertex'` – pierwszeństwo przed narożnikiem w tym samym
miejscu) i obrót; `moveNode` – wierzchołek w nowym miejscu (bok do sąsiada przyciągany jak koniec
odcinka, przy dwóch – przecięcie), ramka dopasowana na nowo (kąt zostaje). `snapGeometry` łamanej – bez
boku zamykającego. Starsza wersja aplikacji pomija łamaną i wielokąt (obraz w notatce zostaje).
**Przewracanie kartek** (od 1.22; od 1.24 jak w notatkach): `flipTo(index)` – powiększona kartka
najpierw w widoku całej strony (`view.zoom = 1`), zdjęcia stron przed i po `showPage` (`snapshotPage` –
sama strona z płótna zapisanych kresek, `{ image, rect }` w pikselach urządzenia; każda kartka ze swoim
prostokątem, bo strony ze zdjęciem mają inną wielkość) i osobne płótno `drawing__flip` nad stroną;
`stepFlip` (`FLIP_MS` 900 ms, krzywa cubic in-out jak w notatkach, pierwsza klatka od razu)
i `paintTurn(ctx, page, progress)` – geometria z `js/core/page-curl.js` (`cornerOf('bottom')`,
`cornerPath`, `constrainCorner`, `foldGeometry`; grzbiet – lewa krawędź strony): płaska część kartki
z cieniem przy zgięciu, cień płata na odsłoniętej kartce pod spodem, płat – odwrót (#f7f7f8, odbity
rysunek z kryciem 0,12, jasny pas zaokrąglenia, cień `shadowBlur`) przycięty w poziomie do strony (za
grzbietem znika), w pionie może z niej wyjść. Pasy – gradienty `CAST_STOPS`, `FOLD_STOPS`, `LIGHT_STOPS`
jak w `css .note-curl__band`, z kryciem zależnym od uniesienia (sin π·postęp). Następna: na płótnie
strony już nowa kartka, stara przewraca się (postęp 0 → 1); poprzednia: na płótnie animacji stara
kartka, nowa wraca (postęp 1 → 0). Od 1.24.1 **spirala na grzbiecie** (tylko edytor, kartki bez
zdjęcia – `hasSpiral`): `SPIRAL` – dziurki co kratkę (`spiralHoles`, na środku wysokości) w `holeX`
od lewej krawędzi, zwoje wokół osi `axis` tuż za krawędzią. `paintHoles` – na płótnie zapisanych kresek
po treści (szare, nieprzezroczyste – zdjęcie strony do animacji ma dziurki, pomiar strony w testach bez
zmian), `paintCoils` – na warstwie bieżącej na początku `renderLive` (nad kreskami, pod resztą) i na
płótnie animacji (spirala stoi, kartka obraca się wokół niej; od 1.25.1 `paintTurn(…, between)` rysuje
zwoje nad płaską częścią kartki, a pod płatem, warstwa bieżąca ich wtedy nie rysuje – `coilsOnFlip`;
płat nie jest przycinany przy grzbiecie – przechodzi nad spiralę i poza stronę – i znika płynnie, gdy
płaska część kartki jest mniejsza niż `FLAP_FADE` (od 1.26 0,05, w 1.25.1 – 0,18) strony – krycie płata `1 − smoothstep`): przednia połowa zwoju – od
dziurki nad krawędzią (cień `shadowBlur` w pikselach urządzenia, połysk), tylna – pod kartką, widoczna za
krawędzią; zwój widziany lekko z ukosa (`tilt`). `fitScale` i `clampView` zostawiają miejsce
`SPIRAL_OUT` z obu stron (strona na środku), a przy powiększeniu przesunięcie w prawo odsłania spiralę.
Obraz rysunku (`renderDrawingImage`), wycinek i „Osadź” rysuje `paintDrawing` – bez spirali. Kolejne
przejście w trakcie animacji kończy ją od razu; `prefers-reduced-motion: reduce` – bez animacji. Kółko:
`wheelTurn { sum, last, locked }` – nowy ruch po 220 ms przerwy, próg 50 (cała strona) albo 150
(powiększona, gdy widok już się nie przesuwa), jedno przewrócenie na ruch. Przyciski `drawing-page-prev`
i `drawing-page-next` przy pigułce kartek – od dwóch kartek.

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
  pokazuje stronę z tą samą pierwszą jednostką. Od 1.8.1 sygnałem jest też zmiana widocznej części
  ekranu (`visualViewport`), a warunkiem – inna wielkość książki albo okna niż przy ostatnim podziale.
  Na iPhonie klawiatura zmienia tylko widoczną część ekranu, a okno notatki ma jej wysokość
  (`--vv-height`): notatka zapisana przy otwartej klawiaturze dzieliła się na strony okna nad
  klawiaturą i tak zostawała po jej schowaniu (dużo stron, puste miejsce na każdej).
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
`js/ui/screens/study-setup.js` i `study-session.js`. Od 1.20 nad fiszką jest `library.lessonPath()`
(dziedzina i moduł w osobnym elemencie, który skraca się pierwszy), a ustawienia `studyShowReview`
i `studyShowLast` (domyślnie `true`) ukrywają na ekranie Nauka grupy „Powtórka na dziś” i „Ostatnia
sesja”.

Od 1.23 **plan nauki w kalendarzu** (`js/ui/study-calendar.js`, `js/core/ics.js`): okno z ekranu Nauka
dostaje materiał z `selectionConfig`; lekcje – wybrane, modułu, dziedziny albo wszystkie (w opisie
najwyżej 30). Plan (`cleanPlan`: dzień nie wcześniejszy niż dziś, godzina, `PLAN_DURATIONS`,
`repeat: 'once' | 'daily' | 'weekly'` z dniami 0–6 od poniedziałku, koniec `count` 1–365 albo `until`,
`PLAN_REMINDERS`, `private`, `busy`, `links`) jest zapamiętany w ustawieniach (`calendarPlan`); gdy dziś
jest już po godzinie – pierwszy dzień jutro. `buildCalendar` składa VCALENDAR (PUBLISH, `X-WR-CALNAME`)
z VTIMEZONE strefy urządzenia (`Intl…resolvedOptions().timeZone`): `zoneOffset` liczy przesunięcie
z `Intl.DateTimeFormat` (formatToParts), `timezoneLines` szuka w roku pierwszego terminu zmian
przesunięcia (doba po dobie, potem co 15 min) i zapisuje je jako STANDARD / DAYLIGHT z regułą
`FREQ=YEARLY;BYMONTH;BYDAY=nXX` (ostatni dzień tygodnia miesiąca – `-1`), od 1970; strefa bez zmiany
czasu – samo STANDARD. VEVENT: `DTSTART`/`DTEND;TZID=…` (czas na zegarze), `RRULE` (`FREQ=DAILY` albo
`WEEKLY;BYDAY=…;WKST=MO`, `COUNT` albo `UNTIL` – koniec ostatniego dnia w strefie przeliczony na UTC
przez `zoneInstant`), pierwszy termin – najbliższy wybrany dzień tygodnia (`firstPlanDay`), `CLASS`,
`TRANSP` i `X-MICROSOFT-CDO-BUSYSTATUS` (Outlook), `VALARM` (`TRIGGER:-PTnM`), `UID` – skrót FNV-1a
tytułu, początku, reguły i lekcji (ten sam plan – ten sam identyfikator), `DESCRIPTION` i `URL` z linkami
(adres strony + `routes.study…`). Tekst – `escapeText`, wiersze CRLF zawijane do 75 bajtów UTF-8
(`foldLine`). Plik oddaje `deliverFile` (`text/calendar`). Link do kilku lekcji: `routes.studyLessons`
→ `parseHash` daje `preset: { level: 'lessons', ids }`, a `initialSelection` wybiera moduł pierwszej
lekcji i jego lekcje z listy (wszystkie – cały moduł).

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
  i punktorów (od 1.21 tabele: `tableSpeech` – podpis i wiersze w miejscu odwołania, tabele bez
  odwołania przed tekstem albo po nim, każda raz); „PL + EN” – wersja angielska z zapowiedzią „English version.”, a brak wybranej
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
  przesuwa się tylko w obrębie grupy, a zapisana kolejność to kolejność listy. Od 1.9 to ustawienie
  (`consolidatedLast`, domyślnie włączone): wyłączone – lista w kolejności użytkownika, a zmiana
  kolejności obejmuje też utrwalone.
- **Wykresy** są rysowane w SVG w rzeczywistej szerokości kontenera (ResizeObserver), bez
  bibliotek. Kolory to zmienne `--viz-*`, osobne dla jasnego i ciemnego motywu, sprawdzone
  walidatorem palet (kontrast z tłem, rozróżnialność przy protanopii i deuteranopii): statusy
  pojęć to stopnie jednej niebieskiej skali (opanowane najmocniej, w ciemnym motywie
  najjaśniej), kierunki – fiolet (PL → EN) i pomarańcz (EN → PL), tło porównawcze – szarość.
  Każdy wykres ma podpowiedź (wskaźnik, dotyk, strzałki na klawiaturze) i tabelę z tymi samymi
  liczbami („Dane w tabeli”).

## Kopia zapasowa

Od wersji 1.8 dwa pliki (przeniesienie dwustopniowe):

1. **Plik danych** (`LexiCards-dane-RRRR-MM-DD.json`, format kopii 3): nagłówek (format, wersje,
   data, liczniki, `media` – ile obrazów i załączników opisują notatki i ile zajmują) i zawartość
   wszystkich magazynów oprócz `noteImages` i `noteFiles`. Notatki mają opisy obrazów
   i załączników, bez bajtów – plik jest mały.
2. **Plik obrazów i załączników** (`LexiCards-obrazy-i-zalaczniki-RRRR-MM-DD.zip`): jedno archiwum
   ZIP bez kompresji (obrazy, PDF i pliki Office są już skompresowane, więc bez Base64 i bez
   narzutu 33%) – `obrazy/<id>.png`, `zalaczniki/<id>/<nazwa pliku>` i spis treści
   `lexicards-pliki.json` (identyfikator, rodzaj, lekcja, ścieżka, typ, rozmiar, CRC-32). Rysunek
   (od 1.12) ma dodatkowo `rysunki/<id>.json` (kreski, skompresowane) i `rysunki/<id>-zdjecie.<typ>`
   (zdjęcie pod kreskami), a pozycja spisu – `drawing: { path, photo }`. Rysunek bez kresek
   w archiwum (albo z uszkodzonymi) wraca jako zwykły obraz; starsza wersja aplikacji przywróci sam
   obraz. Format spisu bez zmian (`formatVersion` 1), w pliku danych – znacznik `drawing: true`. Archiwum
   powstaje plik po pliku (`ZipWriter` → `Blob`, bajty czytane z bazy po jednym) i jest czytane
   kawałkami (`openZipBlob` – `Blob.slice`), więc nawet kilkaset MB nie trafia naraz do pamięci.
   Granica formatu ZIP bez ZIP64: 4 GB i 65 535 plików.

Przywracanie pliku danych najpierw sprawdza cały plik (format, wersję, unikalność identyfikatorów,
powiązania hierarchii), przelicza klucze wyszukiwania i dopiero wtedy zastępuje bazę
jedną transakcją. Uszkodzony plik niczego nie zmienia. Dane nauki wskazujące na
nieistniejące pojęcia są pomijane. Pliki obrazów i załączników, które opisują przywracane notatki
i już są w bazie, zostają (`replaceAll(data, { keep })` usuwa z `noteImages` i `noteFiles` tylko
pozostałe) – przywrócenie samych danych na tym samym urządzeniu niczego nie gubi.

Przywracanie pliku obrazów i załączników (`restoreMedia`) tylko dopisuje: plik trafia do bazy, gdy
opisuje go któraś notatka, jeszcze go nie ma, a jego CRC-32 zgadza się z opisem w notatce. Zapis
idzie porcjami do 16 MB na transakcję; przerwanie w połowie niczego nie psuje. Raport mówi, ile
dodano, ile już było, ile nie pasuje do notatek (np. plik obrazów przywrócony przed plikiem danych)
i ile wciąż brakuje. W Ustawieniach można wybrać oba pliki naraz – rodzaj pliku rozpoznaje
zawartość (`PK` na początku – ZIP), najpierw idą dane.

Od wersji 1.1 (format kopii 2) kopia zawiera notatki i obrazy (bajty w Base64). Przy
przywracaniu treść notatek przechodzi przez filtr HTML, a notatki bez lekcji i obrazy bez
notatki są pomijane. Kopie w formacie 1 (bez notatek) nadal można przywrócić.

Wersja 1.2 nie zmienia formatu kopii: data utrwalenia jest polem lekcji, okres powtórek – polem
ustawień. Kopia sprzed 1.2 nie ma znacznika szarych ikon, więc po jej przywróceniu dziedziny
dostają szare tło tak samo jak przy aktualizacji.

Kopie w formacie 2 (wersje 1.1–1.7, obrazy w Base64 w tym samym pliku) nadal się przywracają:
obrazy z pliku trafiają do bazy, a opis obrazu bez bajtów w takiej kopii jest pomijany. W formacie 3
opis bez bajtów jest poprawny – plik dochodzi z drugiego pliku.

## Testy

- `tests/unit/` – Node.js (`node --test`), bez przeglądarki: reguły biblioteki, wycofywanie
  nieudanych zmian, glosariusz, odczyt i zapis plików, import i eksport, nauka z fiszkami,
  FSRS (zgodność z py-fsrs i zapis powtórek), quizy, statystyki, kopia zapasowa (oba pliki),
  załączniki, rysunki (nacisk, wygładzanie, gumka, historia, dane, zapis i kopia, pola tekstowe i wzory,
  skala, przyciąganie linijki, obszar zaznaczania, własne kolory, kształty z punktami konstrukcyjnymi,
  liniuszek, jasność tła i szablon, wypełnienie i tekst kształtu, wymiary z klawiatury, zakończenia
  odcinka, Shift, stałe wymiary, szyk liniowy i kołowy, wielkość szablonu w % i z narożnika, od 1.22
  liniuszek promieniowy, przyciąganie do narożników i krawędzi, przyklejone końce, od 1.22.1 wymiary
  techniczne – geometria, piętra, tolerancje, styl liczb – i symbole metrologiczne, od 1.24
  rozpoznawanie odręcznych kształtów – figury, przyciąganie kierunków, kształty odrzucane – oraz łamana
  i wielokąt: wierzchołki, punkty, przesuwanie wierzchołka, dane; od 1.25 jednostki liczb wymiarów,
  oznaczenie „Wymiary w …”, tolerancje w mm i przeliczenie starszych rysunków, odchyłki w ramce
  tolerancji, tabela pasowań i ostatnio użyte),
  układ wzoru na płótnie, spójność plików wydania.
- `tests/fixtures/` – pliki testowe wygenerowane w openpyxl i LibreOffice
  (`tools/gen_fixtures.py`), żeby odczyt nie był sprawdzany wyłącznie na plikach własnych.
  Notatki: skoroszyt z openpyxl (fragmenty z formatowaniem, obrazy przy komórkach), ten sam
  przepisany przez LibreOffice i skoroszyt z obrazami „w komórce” złożony według budowy plików
  Excela 365 (z celowo przestawioną kolejnością wpisów pośrednich).
- `tests/e2e/` – Chromium przez Playwright: pełne przepływy na ekranie telefonu i komputera,
  trwałość po przeładowaniu, praca offline, aktualizacja wydania, klawiatura. Gesty na fiszce
  są wykonywane zdarzeniami dotyku przeglądarki, a syntezator mowy zastępuje atrapa.
  Upływ czasu przy powtórkach i limit czasu quizu symuluje zegar Playwright (`context.clock`).
  Mikrofon (notatka głosowa) to udawane urządzenie Chromium (`--use-fake-device-for-media-stream`).
  Rysik (1.12) to syntetyczne zdarzenia `PointerEvent` z `pointerType: 'pen'` i naciskiem – nie
  prawdziwy Apple Pencil; mysz to prawdziwe zdarzenia przeglądarki. Kreski sprawdzane są po pikselach
  płótna i po danych zapisanych w bazie.

## Możliwy dalszy rozwój

- **Wydajność:** statystyki liczą się w jednym przebiegu po pojęciach zakresu i po dziennikach;
  przy setkach tysięcy ocen kolejnym krokiem byłoby liczenie szeregów dziennych przyrostowo
  albo w tle (Web Worker), tak samo import bardzo dużych plików.
- **Głosy neuronowe (Piper):** wstępnie sprawdzone są fonemy espeak-ng w WebAssembly
  (w przeglądarce) i model głosu w ONNX Runtime (poza przeglądarką); do sprawdzenia zostaje
  ONNX Runtime Web w przeglądarce i pobieranie głosów (ok. 60 MB na język) do pamięci urządzenia.
- **Wersja na Windows w jednym pliku:** 47 modułów bez zależności cyklicznych można złożyć
  w jeden `LexiCards.html`, otwierany z dysku bez serwera.
