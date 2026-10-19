# LexiCards 1.9 – przesuwanie wierszy, data utworzenia i filtr daty, kolejność utrwalonych do wyboru

Wersja 1.9.0, 19 października 2026. Wiersz lekcji albo modułu przesuwasz palcem: w prawo – utrwalasz,
w lewo – usuwasz. Przy modułach, lekcjach i pojęciach jest data utworzenia, a listy i glosariusz
można filtrować po niej. To, czy utrwalone są na końcu listy, wybierasz w Ustawieniach. Opis
budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcje „Interfejs” i „Statystyki” – postęp na listach).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Wybór, czy utrwalone lekcje lądują na dole; jeśli nie – przesuwanie także utrwalonych | **Ustawienia → Listy lekcji i modułów → Utrwalone na końcu listy** (domyślnie włączone – jak dotąd). Wyłączone: utrwalone lekcje i moduły zostają tam, gdzie je ustawisz, a **Zmień kolejność** przesuwa je razem z pozostałymi (bez podziału na dwie części). Ustawienie jest w kopii zapasowej |
| Data utworzenia przy każdej lekcji i module; filtr po dacie utworzenia w lekcji, module i glosariuszu | Pod opisem każdego modułu (w dziedzinie) i lekcji (w module) jest „Utworzono 19 paź 2026”, a w szczegółach pojęcia – „Utworzono”. Nad listą modułów, lekcji i pojęć lekcji jest pole **Utworzone**: Wszystkie, Dziś, Ostatnie 7 dni, Ostatnie 30 dni, Ten rok, **Wybrany okres…** (pola „od” i „do”, oba dni w całości). Tytuł listy pokazuje, ile zostało („Lekcje – 2 z 3”, „3 z 4 pojęć”); gdy nic – komunikat. Wybór jest pamiętany dla danej listy do zamknięcia aplikacji (np. po powrocie z lekcji do modułu). W glosariuszu: **Filtry i sortowanie → Data utworzenia** – ten sam wybór, z opisem w podsumowaniu filtra („utworzone od 1 sty 2026 do 31 sty 2026”). Pole pokazuje się przy co najmniej dwóch elementach |
| Przesunięcie kafelka modułu albo lekcji: w prawo – utrwala, w lewo – usuwa; lekkie – z potwierdzeniem, zdecydowane – bezwzględnie | Na listach modułów (w dziedzinie) i lekcji (w module), palcem: cały wiersz jedzie za palcem, a pod nim widać działanie – w prawo zielone **Utrwal** (na utrwalonym szare **Cofnij utrwalenie**), w lewo czerwone **Usuń**. Lekkie przesunięcie (od ok. 1,5 cm) i puszczenie – okno z pytaniem (przy usuwaniu – to samo co dotąd, z listą tego, co zniknie). Zdecydowane – ponad połowę szerokości wiersza: ikona rośnie, napis zmienia się na **Puść – usuń** / **Puść – utrwal**, a po puszczeniu działanie wykonuje się od razu, bez pytania (usuwany wiersz odjeżdża; komunikat „Usunięto lekcję „…”.”). Krótki ruch i przewijanie w pionie niczego nie robią, zwykłe dotknięcie otwiera lekcję. Pusta lekcja albo moduł nie ma czego utrwalić – komunikat zamiast działania. Myszą na komputerze – bez zmian, polecenia są w menu „…” |

## Poprawione przy okazji

- **Odmiana „3 z 4 pojęcia”** w tytule listy pojęć lekcji (po wyszukiwaniu), „Wczytano 100 z 232 pojęcia”
  w glosariuszu i „Pierwsze 30 z 32 pojęcia” w imporcie – teraz „z … pojęć” (po „z” dopełniacz).

## Testy, które wykonano

- **Testy logiki (Node.js): 256 – wszystkie zaliczone** (252 wcześniejsze + 4 nowe): okresy
  filtra liczone od początku dnia (dziś, 7 i 30 dni, ten rok), własny zakres obejmuje oba dni, daty
  odwrócone, jedna strona zakresu, niepoprawne daty, rekord bez daty; opis filtra i data przy
  elemencie; filtr daty w glosariuszu biblioteki; ustawienie „utrwalone na końcu” domyślnie włączone.
- **Testy w przeglądarce (Chromium, ekran telefonu i komputera): 105 – wszystkie zaliczone
  w dwóch przebiegach** (102 wcześniejsze + 3 nowe):
  - przesuwanie (telefon, zdarzenia dotyku): lekkie w lewo – pytanie, „Anuluj” – lekcja zostaje;
    zdecydowane w lewo – napis „Puść – usuń” na warstwie pod wierszem, usunięcie bez pytania
    i komunikat; lekkie w prawo – napis „Utrwal…” w odsłoniętej części, pytanie, utrwalenie;
    zdecydowane w prawo na utrwalonej – cofnięcie bez pytania; krótki ruch i ruch w pionie – nic;
    zwykłe dotknięcie otwiera lekcję; moduł w dziedzinie – utrwalony zdecydowanym przesunięciem;
    pusty moduł – komunikat;
  - ustawienie wyłączone: utrwalona lekcja na swoim miejscu, „Zmień kolejność” przesuwa ją między
    nieutrwalone, ustawienie w danych kopii;
  - daty i filtr: „Utworzono” przy lekcjach i modułach, filtr 30 dni i własny okres w module (tytuł
    „Lekcje – 2 z 3”), filtr pamiętany po powrocie z lekcji, moduły w dziedzinie, pojęcia lekcji
    („3 z 4 pojęć”), „Utworzono” w szczegółach pojęcia, okres w filtrach glosariusza z opisem.
- **Lint: bez błędów.**
- Zrzuty (Chromium): przesuwanie w lewo i w prawo (telefon), lista lekcji z datami i filtrem okresu
  (telefon i komputer), glosariusz z filtrem daty.

## Uzupełnienie w wersji 1.9.1

| Prośba | Jak jest zrobione |
| --- | --- |
| Przycisk „Cofnij” po usunięciu – nie wyskakujące okno, tylko przycisk, który wisi około minuty i znika | Po każdym usunięciu – zdecydowanym przesunięciem, po pytaniu (lekkie przesunięcie, menu „…”) i zaznaczonych pojęć – u dołu ekranu jest komunikat „Usunięto lekcję „…”.” z przyciskiem **Cofnij**. Nie zasłania ekranu i niczego nie blokuje; pasek u dołu komunikatu kurczy się przez 60 sekund, potem komunikat znika sam. **Cofnij** przywraca wszystko, co zniknęło: element na swoim miejscu, pojęcia, postępy i historię nauki, notatki z obrazami i załącznikami („Przywrócono lekcję „…”.”). Okno ostrzeżenia przed usunięciem mówi teraz „Przez minutę po usunięciu możesz to cofnąć przyciskiem „Cofnij”.” zamiast „Tej operacji nie można cofnąć.” |

Testy wersji 1.9.1:

- **Testy logiki: 258 – wszystkie zaliczone** (256 wcześniejszych, z nich 1 dostosowany do nowego
  tekstu ostrzeżenia, + 2 nowe): usunięcie lekcji i cofnięcie – wracają pojęcia, postępy, oceny,
  powtórki i odpowiedzi quizów, notatka z obrazami i załącznikami (te same pliki w bazie); drugie
  cofnięcie – odmowa; pojęcia wracają do lekcji; cofnięcie, gdy w międzyczasie usunięto moduł – odmowa.
- **Testy w przeglądarce: 106 – wszystkie zaliczone w dwóch przebiegach** (105 wcześniejszych,
  z nich 2 uzupełnione, + 1 nowy): usunięcie dziedziny z menu i „Cofnij” – bez okna, 40 pojęć z powrotem,
  także po przeładowaniu; zdecydowane przesunięcie – komunikat z paskiem czasu, „Cofnij” – lekcja na
  swoim miejscu; zegar testu: po 58 s komunikat nadal jest, po minucie znika, a lekcja zostaje usunięta
  (test nie przechodzi, gdy komunikat nie znika sam).
- **Lint: bez błędów.**

## Czego nie sprawdzono

- **Na iPhonie** – testy działają w Chromium z ekranem telefonu (dotyk wysyłany przez przeglądarkę),
  nie w Safari na iOS. Do sprawdzenia u Ciebie: czy przesuwanie wiersza nie gryzie się z
  przewijaniem listy i z gestem „wstecz” od krawędzi ekranu (ruch zaczęty przy samej krawędzi nie
  przesuwa wiersza), czy progi lekkiego i zdecydowanego przesunięcia są wygodne; wygląd pól daty
  (systemowy wybór daty).
- **Na Windows** – przesuwanie myszą celowo nie działa (menu „…”); ekran dotykowy laptopa nie był
  sprawdzany.

## Warto wiedzieć

- Zdecydowane przesunięcie w lewo usuwa **bez pytania** – także cały moduł z lekcjami, pojęciami
  i historią nauki; od 1.9.1 przez około minutę można to cofnąć przyciskiem „Cofnij” w komunikacie
  (po przeładowaniu aplikacji – już nie).
- Data utworzenia elementów z importu i danych przykładowych to dzień importu; kopiowanie lekcji
  i pojęć daje nową datę.
