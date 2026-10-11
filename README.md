# LexiCards

Aplikacja do nauki terminologii polsko-angielskiej. Działa w przeglądarce na komputerze
z Windows i na iPhonie, także bez internetu. Jest darmowa i nie wymaga konta: materiały
są zapisywane wyłącznie w przeglądarce na Twoim urządzeniu.

Adres: **https://rutex51.github.io/LexiCards/**

## Co już działa (etapy 1–3)

- Biblioteka w układzie dziedzina → moduł → lekcja → pojęcie: dodawanie, edycja,
  przenoszenie, kopiowanie, zmiana kolejności i usuwanie z ostrzeżeniem, ile elementów zniknie.
- Pojęcie ma nazwę po polsku i po angielsku oraz opcjonalnie opis i przykład w obu językach,
  tagi, trudność, notatki i oznaczenie „ulubione”.
- Glosariusz wszystkich pojęć: wyszukiwanie bez polskich znaków („plynnosc” znajduje
  „płynność”), filtry (dziedzina, moduł, lekcja, ulubione, tag), sortowanie, zaznaczanie wielu pojęć.
- Import pojęć z pliku XLSX lub CSV w kreatorze: wybór arkusza, przypisanie kolumn, miejsce w bibliotece,
  sprawdzenie danych, podgląd i zatwierdzenie. Duplikaty można pominąć, zaktualizować albo dodać.
- Eksport do XLSX lub CSV: cała biblioteka, dziedzina, moduł, lekcja albo zaznaczone pojęcia.
- Nauka z fiszkami: wybór materiału, kierunku (PL → EN, EN → PL, mieszany), zakresu i liczby fiszek;
  obracana fiszka, trzy kafelki oceny (pojęcie, definicja, przykład), zatwierdzanie gestem albo
  przyciskiem, cofanie, podsumowanie i runda powtórkowa. Postępy są osobne dla każdego kierunku.
- Wymowa pojęć i przykładów głosem z urządzenia; historia ocen każdego pojęcia.
- Kopia zapasowa do pliku i przywracanie z pliku (materiały, postępy, ustawienia).
- Motyw jasny, ciemny albo zgodny z systemem; układ na telefon i na szeroki ekran.
- Praca bez internetu po pierwszym otwarciu.
- 40 przykładowych pojęć (Business English, Metrology) do wczytania jednym przyciskiem.

Zakładki Quiz i Statystyki są widoczne, ale ich funkcje powstaną w kolejnych etapach
(plan niżej). Raporty z etapów, razem z wynikami testów: [etap 1](docs/STAGE-1.md),
[etap 2](docs/STAGE-2.md), [etap 3](docs/STAGE-3.md).

## Jak korzystać

### iPhone

1. Otwórz adres aplikacji w **Safari**.
2. Dotknij przycisku Udostępnij, a potem **Do ekranu początkowego**.
3. Uruchamiaj LexiCards z ikony na ekranie początkowym.

Zrób to, zanim zaczniesz wprowadzać dane: aplikacja z ekranu początkowego ma osobną pamięć
niż karta Safari. Dane wprowadzone wcześniej w Safari przeniesiesz kopią zapasową.

### Windows

Otwórz adres w Chrome albo Edge. Ikona instalacji w pasku adresu pozwala otwierać
aplikację w osobnym oknie, ale nie jest to konieczne.

### Import z arkusza

W Bibliotece wybierz **+ → Import z pliku** (albo „Importuj z pliku” w menu lekcji). Plik powinien mieć
w pierwszym wierszu nagłówki, po polsku albo po angielsku:

| Kolumna | Znaczenie |
| --- | --- |
| `Term PL`, `Term EN` | pojęcie po polsku i po angielsku – wymagane |
| `Description PL`, `Description EN` | opis |
| `Example PL`, `Example EN` | przykład użycia |
| `Domain`, `Module`, `Lesson` | miejsce w bibliotece; brakujące elementy zostaną utworzone |
| `Tags`, `Difficulty`, `Notes` | tagi (po przecinku), trudność 1–5, notatki |

Rozpoznawane są też nagłówki takie jak „Polski”, „Angielski”, „Opis PL”, „Przykład po angielsku”, „Lekcja”.
Wzór pliku można pobrać w pierwszym kroku kreatora; przykłady są w katalogu [docs/samples](docs/samples).
Pliki CSV z polskiego Excela (Windows-1250, średniki) są odczytywane poprawnie. Stary format `.xls`
trzeba najpierw zapisać w Excelu jako `.xlsx`.

### Nauka z fiszkami

1. W zakładce **Nauka** wybierz materiał i dotknij **Rozpocznij naukę** (albo „Ucz się tej lekcji”
   na ekranie lekcji).
2. Przypomnij sobie odpowiedź i dotknij fiszki, żeby ją odwrócić.
3. Zaznacz kafelki tego, co umiesz: pojęcie, definicję, przykład.
4. Przesuń fiszkę **w lewo – Umiem** albo **w prawo – Powtórz** (są też przyciski).

Strzałka w pasku u góry cofa ostatnią decyzję. Przerwaną sesję można wznowić ze Startu.
Na komputerze działa klawiatura: spacja odwraca, 1 2 3 przełączają kafelki, ← i → zatwierdzają, Z cofa.

### Gdzie są dane

- Dane zostają w przeglądarce na danym urządzeniu. Nic nie jest wysyłane do internetu.
- Telefon i komputer mają osobne biblioteki. Żeby przenieść materiały, w Ustawieniach
  wybierz **Zapisz kopię do pliku** na jednym urządzeniu i **Przywróć z pliku** na drugim
  (przywrócenie zastępuje dane na urządzeniu docelowym). Same materiały, bez postępów, przeniesiesz też
  eksportem i importem – wtedy dane na urządzeniu docelowym zostają, a pojęcia są dopisywane.
- Przeglądarka może usunąć dane witryny, której długo nie otwierasz, albo gdy brakuje miejsca.
  Wyczyszczenie danych przeglądarki także je usuwa. Dlatego regularnie zapisuj kopię zapasową.

## Dla programisty

Aplikacja to zwykłe pliki statyczne: HTML, CSS i moduły JavaScript, bez bibliotek zewnętrznych
i bez etapu kompilacji. Wymagany jest tylko Node.js 22 lub nowszy (do testów i narzędzi).

```
npm test             # testy logiki (bez przeglądarki)
npm run test:e2e     # testy w przeglądarce Chromium (wymaga biblioteki Playwright)
npm run serve        # aplikacja pod adresem http://localhost:8080/
npm run build        # odświeża sw.js i js/version.js – uruchom po każdej zmianie plików
```

`npm run build` trzeba wykonać przed wysłaniem zmian: zapisuje w `sw.js` listę plików do pracy
offline i identyfikator wydania wyliczony z ich treści. Test `tests/unit/build.test.js`
nie przejdzie, jeśli te pliki są nieaktualne.

### Układ katalogów

```
index.html, manifest.webmanifest, sw.js   strona, opis aplikacji, praca offline
css/app.css                               wygląd
js/core/                                  dane, reguły, odczyt i zapis plików (bez zależności od przeglądarki)
js/ui/                                    ekrany i okna
icons/                                    ikony aplikacji
tests/unit/, tests/e2e/, tests/fixtures/  testy i pliki testowe
tools/                                    budowanie, serwer lokalny, generatory
docs/                                     architektura, raporty etapów, pliki przykładowe
```

Opis budowy: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Publikacja

Strona jest serwowana przez GitHub Pages z gałęzi `main` (katalog główny). Po wysłaniu zmian
nowa wersja pojawia się po kilku minutach. Otwarta aplikacja pobiera ją w tle i pokazuje komunikat
z przyciskiem „Uruchom ją”.

## Plan etapów

1. **Biblioteka, glosariusz, kopia zapasowa** – gotowe.
2. **Import i eksport plików CSV oraz XLSX** – gotowe.
3. **Fiszki: obracana karta, ocena pojęcia, definicji i przykładu, gesty, cofanie** – gotowe.
4. Powtórki w odstępach (FSRS), osobno dla kierunków PL→EN i EN→PL.
5. Quizy: jednokrotny wybór, dopasowywanie, mieszany.
6. Ekran startowy z planem dnia i statystyki.
7. Dopracowanie: dostępność, wydajność przy dużych bibliotekach.

Synchronizacja między urządzeniami nie jest planowana; urządzenia łączy kopia zapasowa w pliku.
