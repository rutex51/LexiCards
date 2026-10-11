# LexiCards

Aplikacja do nauki terminologii polsko-angielskiej. Działa w przeglądarce na komputerze
z Windows i na iPhonie, także bez internetu. Jest darmowa i nie wymaga konta: materiały
są zapisywane wyłącznie w przeglądarce na Twoim urządzeniu.

Adres: **https://6mhm9nv2yz-cyber.github.io/LexiCards/**

## Co już działa (etap 1)

- Biblioteka w układzie dziedzina → moduł → lekcja → pojęcie: dodawanie, edycja,
  przenoszenie, kopiowanie, zmiana kolejności i usuwanie z ostrzeżeniem, ile elementów zniknie.
- Pojęcie ma nazwę po polsku i po angielsku oraz opcjonalnie opis i przykład w obu językach,
  tagi, trudność, notatki i oznaczenie „ulubione”.
- Glosariusz wszystkich pojęć: wyszukiwanie bez polskich znaków („plynnosc” znajduje
  „płynność”), filtry (dziedzina, moduł, lekcja, ulubione, tag), sortowanie, zaznaczanie wielu pojęć.
- Kopia zapasowa do pliku i przywracanie z pliku.
- Motyw jasny, ciemny albo zgodny z systemem; układ na telefon i na szeroki ekran.
- Praca bez internetu po pierwszym otwarciu.
- 40 przykładowych pojęć (Business English, Metrology) do wczytania jednym przyciskiem.

Zakładki Nauka, Quiz i Statystyki są widoczne, ale ich funkcje powstaną w kolejnych etapach
(plan niżej). Szczegółowy raport z etapu 1, razem z wynikami testów: [docs/STAGE-1.md](docs/STAGE-1.md).

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

### Gdzie są dane

- Dane zostają w przeglądarce na danym urządzeniu. Nic nie jest wysyłane do internetu.
- Telefon i komputer mają osobne biblioteki. Żeby przenieść materiały, w Ustawieniach
  wybierz **Zapisz kopię do pliku** na jednym urządzeniu i **Przywróć z pliku** na drugim
  (przywrócenie zastępuje dane na urządzeniu docelowym).
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
js/core/                                  dane i reguły (bez zależności od przeglądarki)
js/ui/                                    ekrany i okna
icons/                                    ikony aplikacji
tests/unit/, tests/e2e/                   testy
tools/                                    budowanie, serwer lokalny, generatory
docs/                                     architektura, raporty etapów, pliki przykładowe
```

Opis budowy: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Publikacja

Strona jest serwowana przez GitHub Pages z gałęzi `main` (katalog główny). Po wysłaniu zmian
nowa wersja pojawia się po kilku minutach. Otwarta aplikacja pobiera ją w tle i używa od
następnego uruchomienia.

## Plan etapów

1. **Biblioteka, glosariusz, kopia zapasowa** – gotowe.
2. Import i eksport plików CSV oraz XLSX z kreatorem (podgląd, mapowanie kolumn, duplikaty).
3. Fiszki: obracana karta, ocena pojęcia, definicji i przykładu, gesty, cofanie.
4. Powtórki w odstępach (FSRS), osobno dla kierunków PL→EN i EN→PL.
5. Quizy: jednokrotny wybór, dopasowywanie, mieszany.
6. Ekran startowy z planem dnia i statystyki.
7. Dopracowanie: wymowa, dostępność, wydajność przy dużych bibliotekach.

Synchronizacja między urządzeniami nie jest planowana; urządzenia łączy kopia zapasowa w pliku.
