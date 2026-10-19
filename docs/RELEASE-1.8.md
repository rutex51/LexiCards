# LexiCards 1.8 – załączniki notatek, przeniesienie dwoma plikami

Wersja 1.8.0, 19 października 2026. Notatka lekcji może mieć załączniki (PDF, Word, Excel,
PowerPoint i inne pliki), a kopia zapasowa i przeniesienie na inne urządzenie to dwa pliki: dane
oraz jeden plik ze wszystkimi obrazami i załącznikami. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md)
(sekcje „Dane” i „Kopia zapasowa”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Załączniki do notatek (PDF, XLSX, DOCX, PPTX) | W edytorze notatki sekcja **Załączniki** (od 1.8.1 pod obrazami, nad tekstem): **Dodaj załącznik** (dowolny plik do 50 MB, najwyżej 30 w notatce; na komputerze plik można też upuścić na edytor – obrazy trafiają do obrazów, pozostałe pliki do załączników). Każdy plik ma plakietkę rodzaju (PDF – czerwona, DOCX – niebieska, XLSX – zielona, PPTX – pomarańczowa), nazwę, rodzaj i rozmiar. Dotknięcie: **Zmień nazwę** (rozszerzenie zostaje, nawet gdy zniknie z pola), **Otwórz**, **Przesuń wyżej / niżej**, **Usuń załącznik**; × usuwa od razu |
| Gdzie są zapisane, otwieranie na iPhonie i w Windows | Jak obrazy: w bazie przeglądarki na urządzeniu (osobny magazyn `noteFiles`, notatka ma tylko opis plików). W podglądzie notatki pliki są w rzędzie pod nazwą lekcji. Na iPhonie dotknięcie pliku → **Otwórz lub zapisz…** – systemowy arkusz udostępniania: Word, Excel, PowerPoint, Książki albo „Zachowaj w Plikach”. Na komputerze: **Otwórz w nowej karcie** (PDF, obrazy, tekst) albo **Pobierz** / **Pobierz i otwórz** (Word, Excel, PowerPoint – z folderu Pobrane otworzą się w Office). Po dodaniu załącznika aplikacja prosi przeglądarkę o ochronę danych przed usunięciem przy braku miejsca. Notatka może mieć same załączniki – wtedy podgląd pokazuje tylko ich listę, a wiersz „Notatka” na ekranie lekcji – „2 załączniki”. Kopia lekcji ma własne kopie załączników, usunięcie lekcji usuwa je razem z notatką. Import z arkusza nie zmienia załączników, eksport XLSX ich nie obejmuje |
| Zapis do przeniesienia dwustopniowy: same dane oraz osobno załączniki i obrazy – jednym plikiem | W Ustawieniach grupa **Kopia zapasowa i przeniesienie**: **Zapisz dane do pliku** – `LexiCards-dane-RRRR-MM-DD.json`: materiały, notatki (tekst i opisy obrazów i załączników), postępy, historia, ustawienia – bez bajtów obrazów i załączników, więc mały. **Zapisz obrazy i załączniki** – **jeden** plik `LexiCards-obrazy-i-zalaczniki-RRRR-MM-DD.zip` ze wszystkimi obrazami i załącznikami notatek (wiersz pokazuje, ile ich jest i ile zajmują; plik ZIP bez Base64, więc nie jest o 1/3 większy jak dotąd obrazy w kopii). **Przywróć z pliku** przyjmuje plik danych, plik obrazów i załączników albo oba zaznaczone naraz (najpierw idą dane). Przywrócenie danych zastępuje dane, ale obrazy i załączniki, które już są na urządzeniu, zostają; przywrócenie pliku obrazów i załączników tylko dopisuje brakujące pliki do notatek (sprawdza sumę kontrolną), niczego nie usuwa i po wszystkim mówi, ile dodało, ile już było, ile nie pasuje i ile wciąż brakuje. Dopóki drugi plik nie jest przywrócony, notatka pokazuje ramkę „Brak pliku obrazu „…”” i przekreślone załączniki, a Ustawienia – wiersz „Brak na tym urządzeniu: 1 obraz i 2 załączniki”. Kopie z wersji 1.1–1.7 (jeden plik z obrazami) nadal można przywrócić |

## Testy, które wykonano

- **Testy logiki (Node.js): 252 – wszystkie zaliczone** (240 wcześniejszych, w tym 3 dostosowane
  do nowego formatu kopii, + 12 nowych): nazwy, typy i rodzaje plików, zmiana nazwy z zachowaniem
  rozszerzenia; zapis, zmiana nazwy i kolejności, usuwanie załączników, limity (30 plików, 50 MB,
  pusty plik); kopia lekcji, usuwanie lekcji i wszystkich danych; import nie rusza załączników;
  eksport XLSX bez notatek z samymi załącznikami; plik danych bez bajtów (opisy, podsumowanie,
  oczyszczanie złych opisów); przywrócenie danych na tym samym urządzeniu zostawia pliki, na nowym
  – brakuje ich, a zapis notatki zostawia opisy brakujących; plik obrazów i załączników (jeden ZIP
  ze spisem treści) – przywrócenie na nowym urządzeniu, drugi raz – nic nie dochodzi, przed plikiem
  danych – nic nie pasuje, inna suma kontrolna – plik uszkodzony; obcy ZIP, nie-ZIP i plik z nowszej
  wersji – czytelny błąd; ZIP zapisywany i czytany kawałkami (z kompresją i bez). Sprawdzone też,
  że test „przywrócenie danych zostawia pliki” nie przechodzi, gdy przywracanie czyści pliki jak dotąd.
- **Testy w przeglądarce (Chromium, ekran telefonu i komputera): 101 – wszystkie zaliczone
  w dwóch przebiegach** (98 wcześniejszych – z nich test „kopia zapasowa z notatkami” zastąpiony
  nowymi, 2 testy kopii dostosowane do nowych nazw i opisów – + 4 nowe):
  - przeniesienie dwustopniowe (telefon → drugi telefon): plik danych (format 3, bez obrazów,
    mały), plik obrazów i załączników (jeden ZIP: obraz, PDF, DOCX, spis treści); na drugim
    urządzeniu najpierw dane – komunikat o osobnym pliku, wiersz „Brak na tym urządzeniu”, ramka
    brakującego obrazu, przekreślone załączniki, dotknięcie – komunikat zamiast poleceń; potem plik
    obrazów i załączników – „Dodano 1 obraz i 2 załączniki.”, bajty plików zgodne z oryginałem, obraz
    się wyświetla; trzecie urządzenie – oba pliki wybrane naraz;
  - kopia z wersji 1.7 (jeden plik z obrazami w Base64) nadal się przywraca; przywrócenie danych
    na tym samym urządzeniu zostawia obrazy i załączniki;
  - telefon: dodanie trzech plików w edytorze, plakietki i opisy, zmiana nazwy bez rozszerzenia
    (wraca `.docx`), usunięcie, zapis (typy, rozmiary, bajty), lista w podglądzie, „Otwórz lub
    zapisz…” – plik w arkuszu udostępniania (udawanym – Chromium go nie ma) z właściwą nazwą, typem
    i treścią; notatka z samymi załącznikami – podgląd bez stron, „2 załączniki” na ekranie lekcji;
  - komputer: PDF – „Otwórz w nowej karcie” otwiera kartę z adresem `blob:` o typie
    `application/pdf` i właściwej treści, DOCX – pobranie z tymi samymi bajtami, upuszczenie pliku
    CSV na edytor – nowy załącznik.
- **Lint: bez błędów.**
- Zrzuty (Chromium): podgląd notatki z załącznikami i edytor z sekcją „Załączniki” (komputer),
  ustawienia z wierszem „Brak na tym urządzeniu” i notatka bez plików po przywróceniu samych danych
  (telefon).

## Uzupełnienie w wersji 1.8.1

| Prośba | Jak jest zrobione |
| --- | --- |
| Załączniki w trybie edycji pod zdjęciami, a przed notatką | Kolejność sekcji edytora: **Obrazy**, **Załączniki**, **Tekst** (wcześniej załączniki były na końcu, pod tekstem) |
| Podgląd po edycji na iPhonie: najpierw „rozsypana” notatka z dużo większą liczbą stron, dopiero po przeładowaniu właściwa | Przyczyna: po **Zapisz** klawiatura jeszcze się chowała, a okno notatki na telefonie ma wysokość widocznej części ekranu (nad klawiaturą) – strony dzieliły się dla niskiego okna (mały obraz, kilka linijek na stronę). Gdy klawiatura znikała, okno rosło, ale podział nie był liczony od nowa: Safari zgłasza to jako zmianę widocznej części ekranu, a nie wielkości okna, na którą czekała notatka. Teraz notatka dzieli się od nowa także po zmianie widocznej części ekranu, jeśli zmieniła się wielkość stron – po schowaniu klawiatury (ułamek sekundy) widać właściwy podział, z tym samym miejscem treści. Błąd był od wersji 1.3 (od kiedy notatka jest w stronach) |

Testy wersji 1.8.1:

- **Testy logiki: 252 – wszystkie zaliczone.**
- **Testy w przeglądarce: 102 – wszystkie zaliczone w dwóch przebiegach** (101 wcześniejszych
  + 1 nowy; test załączników w edytorze sprawdza teraz kolejność sekcji: Obrazy, Załączniki, Tekst):
  - nowy: notatka zapisana przy „otwartej klawiaturze” (Chromium nie ma klawiatury – okno notatki
    zmniejszone tak, jak robi to klawiatura iPhone'a) ma więcej stron; po „schowaniu klawiatury”
    (zdarzenie zmiany widocznej części ekranu) strony dzielą się od nowa – tyle samo co po otwarciu
    notatki, strona mieści się bez przewijania. Ten test nie przechodzi na kodzie z 1.8.0 (zostaje
    28 stron zamiast 6, puste strony jak na Twoich zrzutach).
- **Lint: bez błędów.**
- Zrzut: edytor na telefonie z sekcją „Załączniki” pod obrazami.
- Czego nie sprawdzono: **Safari na iPhonie** – klawiatura w teście jest udawana; do sprawdzenia
  u Ciebie, czy po zapisie z otwartą klawiaturą notatka po chwili pokazuje właściwe strony.

## Czego nie sprawdzono

- **Na iPhonie** – testy działają w Chromium z ekranem telefonu, nie w Safari na iOS. Do
  sprawdzenia u Ciebie: arkusz udostępniania z załącznikiem (czy widać Word / Excel / PowerPoint
  i „Zachowaj w Plikach”), wybór plików z aplikacji Pliki (w tym kilku naraz przy przywracaniu),
  zapis dużego pliku obrazów i załączników (np. 100–300 MB) – Safari trzyma go w pamięci,
  więc przy bardzo dużej liczbie plików może być ciężko.
- **Na Windows** – PDF w nowej karcie sprawdzony w Chromium sterowanym przez Playwright (który nie
  ma przeglądarki PDF – sprawdzony adres i treść otwieranej karty), nie w Twojej przeglądarce.
- Prawdziwe pliki Office i PDF – testy używają plików udawanych (bajty są przenoszone bez zmian,
  aplikacja nie zagląda do ich treści).

## Warto wiedzieć

- Plik danych i plik obrazów i załączników zapisane tego samego dnia pasują do siebie. Plik obrazów
  i załączników z innego dnia też zadziała dla plików, które się nie zmieniły (dopasowanie po
  identyfikatorze i sumie kontrolnej).
- Przywrócenie samego pliku danych na nowym urządzeniu jest bezpieczne – notatki działają, brakuje
  tylko plików; plik obrazów i załączników możesz przywrócić później.
- Jeśli notatka nie ma ani obrazów, ani załączników, przycisk **Zapisz obrazy i załączniki** się
  nie pokazuje.
- Załączniki nie trafiają do eksportu XLSX ani do „Kopiuj notatkę” – tylko do pliku obrazów
  i załączników kopii zapasowej.
- Limit pliku ZIP bez rozszerzenia ZIP64: 4 GB i 65 535 plików łącznie.
