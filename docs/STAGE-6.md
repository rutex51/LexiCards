# Etap 6 – statystyki

Raport z szóstego etapu (wersja 0.6.0). Wyniki testów pochodzą z rzeczywistego uruchomienia
opisanego w sekcji „Testy”; to, czego nie udało się sprawdzić, jest wymienione osobno.

## Co zostało zaimplementowane

**Zakładka Statystyki (punkt 12 specyfikacji)**

- **Kierunek** u góry: PL → EN, EN → PL albo oba kierunki. W trybie „oba kierunki” pojęcie jest
  opanowane dopiero wtedy, gdy jest opanowane w obu (liczy się słabszy wynik), a do powtórki –
  gdy czeka w którymkolwiek. Sposób liczenia jest opisany pod przełącznikiem. Wybór jest
  zapamiętany; domyślnie taki jak kierunek nauki.
- **Wskaźniki (12.1):** opanowane pojęcia (procent i liczba) z paskiem udziałów i liczbą pojęć
  w każdym statusie (opanowane, częściowo opanowane, w trakcie nauki, do nauki, nowe), wszystkie
  pojęcia, do powtórki (termin FSRS minął), skuteczność quizów, czas nauki (razem i z ostatnich 7 dni).
- **Znajomość elementów (12.2 i wykres 7):** pojęcie, definicja, przykład – z ostatniej oceny
  każdego elementu, zawsze osobno dla każdego kierunku (w trybie „oba” – dwa paski obok siebie).
  Mianownikiem są ocenione pojęcia, które mają dany element.
- **Wykresy w czasie** (7, 30 albo 90 dni):
  - postęp nauki – liczba opanowanych i ocenionych pojęć na koniec każdego dnia (wykres 1),
  - powtórki fiszek dziennie – osobno dla kierunków (wykres 6),
  - skuteczność quizów – odsetek poprawnych odpowiedzi w dniach z quizem, osobno dla kierunków (wykres 5).
- **Opanowanie według dziedzin, modułów i lekcji** (wykresy 2–4): przełącznik poziomu
  i paski udziałów statusów. Wiersz otwiera te same statystyki dla tej dziedziny, modułu lub lekcji
  (agregacja hierarchiczna), z powrotem o poziom wyżej. Statystyki elementu otwiera też polecenie
  „Statystyki” w menu dziedziny, modułu i lekcji w Bibliotece.
- Każdy wykres ma podpowiedź z wartościami dnia (dotknięcie, wskaźnik myszy, strzałki i Home/End
  na klawiaturze) oraz „Dane w tabeli” z tymi samymi liczbami.

**Start**

- Nowa grupa **Postępy**: opanowane pojęcia, skuteczność quizów i czas nauki z ostatnich 7 dni,
  z przejściem do Statystyk.

**Czas nauki**

- Od tej wersji każda zatwierdzona fiszka zapisuje czas od pokazania do decyzji (najwyżej
  3 minuty – fiszka mogła czekać na ekranie). Quizy zapisywały czas odpowiedzi już wcześniej.
- Dla ocen sprzed wersji 0.6.0 czas jest szacowany z odstępu od poprzedniej oceny w tej samej
  sesji (najwyżej 2 minuty). Te oceny masz już w aplikacji, więc „Czas nauki” nie startuje od zera.

**Kolory wykresów**

- Statusy pojęć to stopnie jednej skali niebieskiej (opanowane najmocniej), kierunki – fiolet
  (PL → EN) i pomarańcz (EN → PL). Paletę sprawdziłem walidatorem: kontrast z tłem, rozróżnialność
  przy daltonizmie (protanopia, deuteranopia), osobno dla jasnego i ciemnego motywu.
- Podsumowanie sesji nauki używa teraz tych samych kolorów statusów co Statystyki
  (wcześniej: zielony, pomarańczowy, niebieski, czerwony).

**Poprawka quizu (z poprzedniej rozmowy)**

- Błędną odpowiedzią nie może być pojęcie, które w języku pytania brzmi tak samo jak pytanie.
  Przykład: „bilans” → „balance sheet” i drugi rekord „bilans” → „balance” (np. po imporcie
  z opcją „dodaj”) – „balance” nie pojawi się już jako błędna odpowiedź w pytaniu o „bilans”.
  Porównanie ignoruje wielkość liter, polskie znaki i odstępy.

## Pliki

| Plik | Zawartość |
| --- | --- |
| `js/core/stats.js` | statusy w kierunkach, do powtórki, elementy, skuteczność quizów, czas nauki, szeregi dzienne, zestawienia, komplet wskaźników |
| `js/core/library.js` | `journals()` – dzienniki do statystyk zapamiętane do zmiany dzienników; zapis czasu fiszki |
| `js/core/study.js`, `js/core/model.js` | limit czasu fiszki, ustawienia statystyk |
| `js/core/quiz.js` | poprawka błędnych odpowiedzi |
| `js/ui/charts.js` | wykres w czasie (linie, słupki, stos), pasek udziałów, miernik, podpowiedź, tabela |
| `js/ui/screens/stats.js` | ekran statystyk, wczytywanie dzienników w tle, kafelki wskaźników |
| `js/ui/screens/start.js` | grupa „Postępy” |
| `js/ui/screens/study-session.js` | pomiar czasu nad fiszką |
| `js/ui/screens/library.js`, `terms.js`, `js/ui/router.js`, `js/main.js`, `css/app.css` | polecenia „Statystyki”, adresy `#/stats/…`, wygląd |
| `js/ui/screens/upcoming.js` | usunięty – nie ma już zakładek „w przygotowaniu” |
| `tests/unit/stats.test.js`, `tests/unit/quiz.test.js` | 5 testów statystyk, 1 test poprawki quizu |
| `tests/e2e/run.mjs` | 4 testy statystyk w przeglądarce |

## Testy

Uruchomione 12 października 2026 w środowisku Linux, Node.js 22.22.0, Chromium przez Playwright 1.56.

| Polecenie | Wynik |
| --- | --- |
| `npm test` | 177 testów, 177 zaliczonych (6 nowych) |
| `npm run test:e2e` | 62 testy, 62 zaliczone, w dwóch kolejnych przebiegach (4 nowe) |
| ESLint | brak uwag w kodzie aplikacji |
| walidator palet wykresów | wszystkie kontrole zaliczone w obu motywach (różnica barw kierunków przy daltonizmie ΔE 26–29 przy wymaganym 8) |
| kontrast tekstu na Starcie i w Statystykach | najniższy 5,69:1 (jasny) i 6,30:1 (ciemny) przy wymaganym 4,5:1 |

**Poprawność statystyk (scenariusz 26 specyfikacji)**

| Scenariusz | Gdzie sprawdzony |
| --- | --- |
| Statusy w kierunku i w obu kierunkach (słabszy z dwóch) | test jednostkowy i test w przeglądarce (liczby po trzech ocenach przez interfejs) |
| Do powtórki – termin minął w kierunku albo w którymkolwiek, pojęcie liczone raz | test jednostkowy |
| Znajomość elementów, brakujący element poza mianownikiem | test jednostkowy i test w przeglądarce |
| Postęp w czasie odtworzony z historii = bieżące postępy (oba tryby) | test jednostkowy |
| Powtórki i odpowiedzi w quizach dziennie, poza zakresem dni pominięte | testy jednostkowe i w przeglądarce |
| Czas: zapisany z limitem, szacowany dla starszych ocen, quizy, ostatnie 7 dni, zakres | test jednostkowy; w przeglądarce z zegarem Playwright (2 fiszki × 30 s + 3 odpowiedzi × 20 s = „2 min”) |
| Skuteczność quizów na Starcie i w Statystykach | test w przeglądarce (2 z 3 = 67%) |
| Zestawienia według dziedzin, modułów, lekcji i przejście w głąb | test jednostkowy i test w przeglądarce |
| Podpowiedź wykresu z klawiatury, zakres 7 i 30 dni, tabela danych | test w przeglądarce z historią z kilku dni |
| Dzienniki czytane ponownie tylko po zmianie dzienników | test jednostkowy |
| Ekran 320 px, ciemny motyw, pusta biblioteka | test w przeglądarce |
| Kopia zapasowa – zapisany czas fiszki | zapis w istniejącym magazynie `assessments`, który kopia już obejmuje |

Pierwsze przebiegi nowych testów wykryły jeden problem w aplikacji: w trybie „oba kierunki”
wykres postępu po nauce tylko w jednym kierunku mówił, że „nie oceniono żadnej fiszki”. Teraz
wyjaśnia, że żadne pojęcie nie jest jeszcze ocenione w obu kierunkach. Dwa pozostałe dotyczyły
samych testów (tolerancja zegara, zbędne 30 s oczekiwania).

**Wydajność (orientacyjnie):** dla 50 000 pojęć i 100 000 ocen policzenie wskaźników zajmuje
około 0,2 s, szeregów na 90 dni – 0,2 s, zestawienia 500 lekcji – 0,03 s (Node.js na serwerze
testowym, nie na telefonie).

### Czego nie sprawdzono

- **Safari na iPhonie** – dotyk na wykresie (podpowiedź, przesuwanie palcem w poziomie,
  przewijanie w pionie) sprawdzony tylko w emulacji telefonu w Chromium.
- **Zmiana czasu i strefy czasowej** – dni liczą się według zegara urządzenia; przejścia na czas
  letni i zimowy nie były testowane osobno.
- **Duże biblioteki na telefonie** – pomiar wydajności tylko w Node.js.

## Znane ograniczenia

- Postęp w czasie jest odtwarzany z historii ocen. Pojęcia przeniesione do innej lekcji liczą
  się tam, gdzie są teraz; usunięte pojęcia znikają z historii (tak jak ich oceny).
- „Czas nauki” dla ocen sprzed wersji 0.6.0 jest szacunkiem, a dla nowych – czasem nad fiszką
  bez czasu animacji i przejść między ekranami.
- Skuteczność quizów jest liczona z odpowiedzi na pojęcia z zakresu; pytania bez odpowiedzi
  (koniec czasu) do niej nie wchodzą.
- Statystyki liczą się przy każdym otwarciu i zmianie ustawień ekranu; przy bardzo dużych
  bibliotekach na telefonie może to być zauważalne – to temat etapu 7.

## Jak uruchomić

- W przeglądarce: adres z pliku [README](../README.md); w Safari odśwież stronę dwa razy albo
  użyj przycisku „Uruchom ją”. W Ustawieniach powinna być widoczna wersja 0.6.0.
- Wypróbowanie: zakładka Statystyki; na Starcie grupa „Postępy”.
- Testy: `npm test`, `npm run test:e2e` (wymaga Playwright z Chromium).
