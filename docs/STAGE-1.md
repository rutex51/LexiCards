# Etap 1 – biblioteka, glosariusz, kopia zapasowa

Raport z pierwszego etapu wersji webowej. Wyniki testów pochodzą z rzeczywistego
uruchomienia opisanego w sekcji „Testy”; to, czego nie udało się sprawdzić, jest
wymienione osobno.

## Co zostało zaimplementowane

**Materiały**

- Hierarchia dziedzina → moduł → lekcja → pojęcie z dodawaniem, edycją i usuwaniem.
- Formularz lekcji i modułu potrafi od razu utworzyć brakujący element nadrzędny.
- Pojęcie: nazwa PL i EN (wymagane), opis PL/EN, przykład PL/EN, tagi, trudność 1–5,
  notatki, ulubione. Brak opisu lub przykładu jest pokazywany jako „Brak danych”.
- Ostrzeżenie przy próbie dodania pojęcia, które już jest w lekcji (porównanie bez
  wielkości liter i polskich znaków); drugi zapis dodaje je mimo to.
- „Zapisz i dodaj kolejne” do szybkiego wprowadzania wielu pojęć.
- Przenoszenie modułów, lekcji i pojęć; kopiowanie lekcji i pojęć; zmiana kolejności.
- Usuwanie z ostrzeżeniem, ile modułów, lekcji i pojęć zniknie razem z elementem.
- Zaznaczanie wielu pojęć: ulubione, przeniesienie, kopiowanie, usunięcie.

**Glosariusz**

- Wszystkie pojęcia w jednym miejscu, na telefonie jako lista, na szerokim ekranie jako tabela.
- Wyszukiwanie po polsku i angielsku bez znaków diakrytycznych.
- Filtry: dziedzina, moduł, lekcja, tylko ulubione, tag. Sortowanie: polski, angielski,
  najnowsze, najstarsze.
- Długie listy są dociągane porcjami po 100 pojęć podczas przewijania.

**Dane**

- Zapis w IndexedDB; każda operacja to jedna niepodzielna transakcja, a nieudany zapis
  jest wycofywany także z pamięci.
- Kopia zapasowa do pliku JSON (na telefonie przez arkusz udostępniania, na komputerze
  jako pobranie) i przywracanie z pliku po sprawdzeniu jego poprawności.
- Usunięcie wszystkich danych z potwierdzeniem.
- 40 przykładowych pojęć: Business English (22) i Metrology (18).

**Aplikacja**

- Ekran Start z podsumowaniem, kafelkami dziedzin i skrótami do dodawania.
- Układ na telefon (zakładki u dołu) i szeroki ekran (panel boczny).
- Motyw jasny, ciemny lub systemowy; uwzględnione ograniczenie ruchu.
- Instalacja na ekranie początkowym, praca bez internetu, automatyczne pobieranie
  nowego wydania.
- Zmiany wprowadzone w jednej karcie przeglądarki pojawiają się w drugiej.

Zakładki Nauka, Quiz i Statystyki pokazują informację, że ich funkcje są w przygotowaniu.

## Pliki

| Plik | Zawartość |
| --- | --- |
| `index.html`, `manifest.webmanifest`, `icons/` | strona, opis aplikacji do instalacji, ikony |
| `sw.js`, `js/version.js` | generowane: praca offline i numer wydania |
| `css/app.css` | cały wygląd, motywy, układy |
| `js/main.js`, `js/theme-boot.js` | uruchomienie aplikacji, motyw przed pierwszym rysowaniem |
| `js/core/model.js`, `text.js`, `messages.js` | kształt danych, normalizacja tekstu, komunikaty |
| `js/core/storage.js` | adaptery IndexedDB i pamięciowy |
| `js/core/library.js` | wszystkie operacje na materiałach |
| `js/core/backup.js` | kopia zapasowa |
| `js/core/samples.js`, `sample-data.js` | dane przykładowe |
| `js/ui/dom.js`, `icons.js`, `components.js`, `dialogs.js`, `files.js` | elementy interfejsu |
| `js/ui/router.js`, `shell.js`, `actions.js` | nawigacja, powłoka, formularze i przepływy |
| `js/ui/screens/*.js` | ekrany: start, biblioteka, lekcja, glosariusz, ustawienia, zapowiedzi |
| `tests/unit/*.test.js` | testy logiki |
| `tests/e2e/run.mjs` | testy w przeglądarce |
| `tools/build.mjs`, `sw.template.js`, `serve.mjs` | budowanie wydania, serwer lokalny |
| `tools/gen_samples.py`, `gen_icons.py` | generatory danych przykładowych i ikon |
| `docs/samples/` | przykładowe pliki CSV i XLSX do importu w etapie 2 |

## Testy

Uruchomione 11 października 2026 w środowisku Linux, Node.js 22.22.0.

| Polecenie | Wynik |
| --- | --- |
| `npm test` | 73 testy, 73 zaliczone |
| `npm run test:e2e` | 20 testów, 20 zaliczonych (trzy kolejne przebiegi) |
| ESLint (`no-undef`, `no-unused-vars` i pokrewne) | brak uwag w kodzie aplikacji |

Testy w przeglądarce wykonano w Chromium 141 (bez okna, sterowany przez Playwright 1.56.1)
na ekranie telefonu 390 × 844 z dotykiem oraz komputera 1280 × 800. Obejmują:

- tworzenie dziedziny, modułu, lekcji i pojęcia od pustej aplikacji,
- trwałość danych po ponownym otwarciu strony,
- tworzenie brakującego modułu i dziedziny z formularza lekcji,
- glosariusz: wyszukiwanie, filtry, sortowanie, ulubione, dociąganie listy 250 pojęć,
- ostrzeżenie przed usunięciem i samo usunięcie,
- ostrzeżenie o duplikacie oraz „Zapisz i dodaj kolejne”,
- przenoszenie pojęcia i działania na wielu zaznaczonych pojęciach,
- zapamiętanie zmienionej kolejności,
- kopię zapasową: zapis, usunięcie wszystkiego, przywrócenie, odrzucenie uszkodzonego pliku,
- zapamiętanie motywu ciemnego,
- układ wąski i szeroki, brak poziomego przewijania przy 320 px,
- przywracanie przewinięcia po „wstecz”,
- obsługę z klawiatury (Enter, Esc, fokus w oknach),
- synchronizację dwóch kart,
- otwarcie aplikacji bez sieci,
- przejście na nowe wydanie po zmianie plików.

Kontrast policzono dla obu motywów dla tekstu podstawowego i pomocniczego, koloru akcentu,
komunikatów, podpowiedzi w polach i przycisków na każdym tle, na którym występują:
najniższa wartość to 4,5 : 1.

### Czego nie sprawdzono

- **Safari na iPhonie.** Środowisko testowe ma tylko Chromium. Nie zostały sprawdzone
  na prawdziwym urządzeniu: instalacja na ekranie początkowym, arkusz udostępniania przy
  zapisie kopii (w teście podstawiono jego atrapę), wybór pliku z aplikacji Pliki,
  zachowanie formularzy przy wysuniętej klawiaturze oraz wygląd z wycięciem ekranu.
- **Edge i Firefox na Windows.** Kod nie używa funkcji specyficznych dla Chromium,
  ale nie było jak tego uruchomić.
- **Czytniki ekranu** (VoiceOver, Narrator). Testy automatyczne odwołują się do ról
  i etykiet dostępności oraz sprawdzają obsługę z klawiatury, ale nikt nie odsłuchał aplikacji.

## Znane ograniczenia

- Dane istnieją tylko w przeglądarce na danym urządzeniu. Przeglądarka może je usunąć
  po długim nieużywaniu witryny lub przy braku miejsca; wyczyszczenie danych przeglądarki
  usuwa je na pewno. Zabezpieczeniem jest kopia zapasowa w pliku.
- Na iPhonie aplikacja z ekranu początkowego i karta Safari mają osobne dane.
- Telefon i komputer nie synchronizują się; dane przenosi plik kopii, a przywrócenie
  zastępuje całą bibliotekę (nie łączy dwóch bibliotek).
- Import plików CSV i XLSX jest przedmiotem etapu 2 – na razie pojęcia dodaje się ręcznie.
- Kolejność zmienia się przyciskami w górę i w dół, nie przeciąganiem.
- Po zamknięciu okna fokus klawiatury nie zawsze wraca do elementu, który je otworzył;
  bywa przenoszony na początek strony.
- Przy szerokości 320 px etykieta „Zaznacz wszystkie” na dolnym pasku łamie się na dwa wiersze.

## Jak uruchomić

- W przeglądarce: adres z pliku [README](../README.md).
- Na własnym komputerze: `npm run serve`, potem http://localhost:8080/.
- Testy: `npm test` oraz `npm run test:e2e` (drugie wymaga biblioteki Playwright z Chromium).
