# Etap 5 – quizy

Raport z piątego etapu (wersja 0.5.0). Wyniki testów pochodzą z rzeczywistego uruchomienia
opisanego w sekcji „Testy”; to, czego nie udało się sprawdzić, jest wymienione osobno.

## Co zostało zaimplementowane

**Konfiguracja (zakładka Quiz)**

- Materiał: dziedzina, moduł i jedna lub kilka lekcji – ten sam wybór co w nauce. Wejście
  z ekranu lekcji („Quiz z tej lekcji”) i z menu dziedziny lub modułu w Bibliotece ustawia
  materiał od razu. Ostatni wybór jest zapamiętany.
- Rodzaj: **Wybór** (jednokrotny wybór), **Pary** (łączenie), **Mieszany**.
- Kierunek: PL → EN, EN → PL albo mieszany (każde pytanie i każda runda losuje kierunek).
- Liczba pytań (w quizie par – liczba par): 10, 20, 30 albo wszystkie pojęcia materiału.
- Ustawienia: limit czasu (bez limitu, 2, 5 albo 10 minut), próg zaliczenia (60–100%,
  domyślnie 80%), w teście mieszanym proporcje (40–80% pytań wyboru, domyślnie 60/40).
- Pod przyciskiem „Rozpocznij quiz” widać, ile pytań powstanie z ilu pojęć. Na dole ekranu –
  ostatnie wyniki i pełna historia wyników.

**Jednokrotny wybór**

- Pojęcie i do czterech odpowiedzi w losowej kolejności, z oznaczeniami A–D. Odpowiedzi nie
  powtarzają się (porównanie bez wielkości liter i polskich znaków). Błędne odpowiedzi pochodzą
  najpierw z tej samej dziedziny, potem z reszty biblioteki.
- Gdy różnych odpowiedzi jest mniej niż cztery, pytanie ma ich mniej; gdy mniej niż dwie –
  pytanie jest pomijane.
- Po dotknięciu odpowiedzi: zielona ramka i ✓ przy poprawnej, czerwona i ✗ przy wybranej
  błędnej, „Dobrze” albo „Źle”, para pojęcie → tłumaczenie z przyciskiem wymowy oraz definicja
  i przykład w obu językach. Potem „Dalej”.
- Przed odpowiedzią można odsłonić definicję i przykład w języku pytania („Pokaż definicję
  i przykład”); w zapisie odpowiedzi jest wtedy zaznaczone, że użyto podpowiedzi.
- Klawiatura na komputerze: 1–4 albo A–D wybiera odpowiedź, Enter przechodzi dalej.

**Łączenie par**

- Dwie kolumny: lewa w języku pytania, prawa w drugim języku, obie potasowane. Runda ma do
  5 par na telefonie i do 8 na szerokim ekranie (okno od 900 px – iPad w poziomie, komputer).
  Większa liczba par jest dzielona na równe rundy (np. 6 par → 3 + 3).
- Pary łączy się dotknięciem w dowolnej kolejności (najpierw lewa albo prawa kolumna);
  dotknięcie innego elementu w tej samej kolumnie zmienia wybór.
- Poprawna para: krótka animacja, zielony kolor i blokada. Błędna: drgnięcie i czerwony błysk.
  Liczniki „Pary: x z n” i „Błędy: n”.
- Każda para to osobna oceniana odpowiedź: para połączona z pomyłką liczy się jako błędna.
  Po rundzie lista wszystkich par z ✓ albo ✗ i błędnym połączeniem.

**Test mieszany**

- Pytania wyboru i rundy par w losowej kolejności, w proporcji z ustawień. Każda para to osobna
  odpowiedź, więc „20 pytań” przy 60/40 to 12 pytań wyboru i 8 par.

**Czas, przerwanie, wznowienie**

- Zegar widać zawsze: bez limitu – czas od początku, z limitem – pozostały czas (ostatnie
  30 sekund na czerwono). Po upływie limitu quiz kończy się sam; połączone już pary trwającej
  rundy się liczą, a pytania bez odpowiedzi są błędne.
- Czas płynie tylko wtedy, gdy ekran quizu jest widoczny (wyjście z ekranu albo przejście
  aplikacji w tło zatrzymuje zegar).
- Każda odpowiedź jest zapisywana od razu. Niedokończony quiz można wznowić ze Startu albo
  z zakładki Quiz, także po zamknięciu strony. „Zakończ” w trakcie quizu (z potwierdzeniem)
  pokazuje wynik; quiz bez żadnej odpowiedzi znika bez wpisu w historii.

**Wynik**

- Procent na pierścieniu, „Zaliczony” albo „Niezaliczony” z progiem, liczby: poprawne, błędne,
  bez odpowiedzi (jeśli były), czas.
- Lista „Do powtórki”: pojęcie → poprawna odpowiedź oraz Twoja odpowiedź albo „Bez odpowiedzi”.
- **Powtórz błędne odpowiedzi (N)** – nowy quiz tylko z tych pojęć, z tymi samymi ustawieniami
  (pojedyncze pojęcie dostaje pytanie wyboru). Dalej: „Nowy quiz”, „Zakończ”, „Historia wyników”.
- Historia: data, rodzaj (z dopiskiem „powtórka błędnych”), procent, liczba poprawnych, czas,
  zaliczenie, a także „koniec czasu” albo „przerwany”.

**Quiz a nauka z fiszkami**

- Quiz **nie zmienia** harmonogramu powtórek FSRS ani postępów fiszek. Wyniki są zapisywane
  osobno: odpowiedzi w `quizAnswers`, wyniki quizów w `quizSessions`.
- W Nauce działa zakres **„Błędy z quizów”** – pojęcia, na które ostatnio odpowiedziałeś źle
  (to jest lista pojęć wymagających dodatkowej nauki z punktu 9 specyfikacji).
- W szczegółach pojęcia jest linia **„Quizy”**, np. „1 z 2 poprawnie, ostatnio poprawnie (12 paź 2026)”.
- Kopia zapasowa obejmuje odpowiedzi, historię wyników i niedokończony quiz.

**Decyzje, które warto znać**

- Pytania bez odpowiedzi (koniec czasu, przerwanie) obniżają wynik i trafiają na listę do
  powtórki, ale nie do statystyk pojęcia – nie było próby odpowiedzi.
- W parach pomyłka obciąża parę elementu z lewej kolumny (pytania), niezależnie od kolejności
  dotknięć; „Twoje połączenie” to wybrany element z prawej kolumny.
- „8 par na iPadzie” jest powiązane z szerokością okna, nie z rodzajem urządzenia: iPad
  w pionie (okno węższe niż 900 px) dostaje 5 par, tak jak telefon.

## Pliki

| Plik | Zawartość |
| --- | --- |
| `js/core/quiz.js` | budowa quizu, pytanie wyboru, rundy par, odpowiedzi, wynik, czas |
| `js/core/library.js` | trwający quiz, zapis odpowiedzi i wyników, koniec czasu z niedokończoną rundą, czas, historia, statystyki pojęć |
| `js/core/study.js`, `js/core/model.js` | zakres „Błędy z quizów”, ustawienia quizu |
| `js/ui/material.js` | wybór materiału wspólny dla nauki i quizu |
| `js/ui/screens/quiz-setup.js` | konfiguracja, wznowienie, ostatnie wyniki |
| `js/ui/screens/quiz-session.js` | pytania, pary, zegar, informacja zwrotna, wynik, powtórka błędnych |
| `js/ui/screens/quiz-history.js` | lista i arkusz historii wyników |
| `js/ui/screens/start.js`, `terms.js`, `library.js` | wznowienie quizu na Starcie, „Quiz z tej lekcji”, menu Biblioteki, linia „Quizy” |
| `js/ui/router.js`, `js/main.js`, `css/app.css` | adresy `#/quiz…`, ekrany, wygląd |
| `tests/unit/quiz.test.js` | 12 testów logiki i zapisu quizów |
| `tests/e2e/run.mjs` | 8 testów quizu w przeglądarce |

## Testy

Uruchomione 12 października 2026 w środowisku Linux, Node.js 22.22.0, Chromium przez Playwright 1.56.

| Polecenie | Wynik |
| --- | --- |
| `npm test` | 171 testów, 171 zaliczonych (12 nowych w etapie 5) |
| `npm run test:e2e` | 58 testów, 58 zaliczonych, w dwóch kolejnych przebiegach (8 nowych) |
| ESLint | brak uwag w kodzie aplikacji |
| kontrast tekstu na ekranach quizu | najniższy 5,07:1 (jasny) i 4,81:1 (ciemny, biały napis na niebieskim przycisku) przy wymaganym 4,5:1 |

Poprawione przed wydaniem:

- Testy w przeglądarce wykryły, że Enter (albo „Dalej”) wciśnięty tuż po odpowiedzi, zanim
  zapis się skończył, był ignorowany. Teraz przejście czeka na zapis i wtedy następuje.
  Trzy kolejne niepowodzenia dotyczyły samych testów (kolejność odczytu odpowiedzi z bazy,
  nawigacja w teście, przewijanie elementu w trakcie przebudowy ekranu).
- Przegląd zrzutów ekranu i pomiar kontrastu: litery A–D przy przyciemnionych odpowiedziach
  miały kontrast 2,47:1 (teraz 5,07:1); długie słowa w kafelkach par łamały się w środku
  (teraz mniejsza czcionka dla długich słów); treść przewijana pod przyciskiem „Dalej” była
  widoczna pod nim (teraz przycisk ma tło); „3 pytania z 3 pojęcia” zamiast „z 3 pojęć”.

| Scenariusz | Gdzie sprawdzony |
| --- | --- |
| 4 różne odpowiedzi, poprawna jest jedna, błędne z tej samej dziedziny | test jednostkowy (20 losowań) i test w przeglądarce |
| Mniej odpowiedzi, gdy brakuje różnych; pominięcie przy mniej niż dwóch | test jednostkowy |
| Oznaczenie poprawnej i błędnej odpowiedzi, definicja i przykład po odpowiedzi | test w przeglądarce |
| Podpowiedź w języku pytania, zapis użycia podpowiedzi; brak podpowiedzi bez definicji i przykładu | test w przeglądarce |
| Rundy par: 5 na telefonie, 8 na szerokim ekranie, równy podział | testy jednostkowe i w przeglądarce |
| Łączenie w dowolnej kolejności, zmiana wyboru, blokada połączonych, liczniki | test w przeglądarce (dotyk) |
| Para z pomyłką liczona jako błędna, „Twoje połączenie” | testy jednostkowe i w przeglądarce |
| Proporcje testu mieszanego 60/40 i 40/60 | testy jednostkowe i w przeglądarce |
| Limit czasu: odliczanie, wyróżnienie końcówki, koniec quizu, pytania bez odpowiedzi | test w przeglądarce z zegarem Playwright |
| Koniec czasu w trakcie rundy par | test jednostkowy |
| Wznowienie po ponownym otwarciu strony, ze Startu i z zakładki Quiz; zakończenie niedokończonego | test w przeglądarce |
| Wynik, zaliczenie na progu, lista błędów, historia | testy jednostkowe i w przeglądarce |
| „Powtórz błędne odpowiedzi” dwa razy z rzędu, wpis „powtórka błędnych” w historii | test w przeglądarce |
| Quiz nie zmienia postępów, ocen ani powtórek FSRS | testy jednostkowe i w przeglądarce |
| Zakres „Błędy z quizów” i linia „Quizy” w szczegółach pojęcia | testy jednostkowe i w przeglądarce |
| Wejście z lekcji i z menu modułu, zapamiętanie materiału | test w przeglądarce |
| Klawiatura: 1–4, A–D, Enter | test w przeglądarce (komputer) |
| Ekran 320 px z długimi pojęciami: nic nie wystaje, kafelki par co najmniej 44 px | test w przeglądarce |

### Czego nie sprawdzono

- **Safari na iPhonie.** Wszystkie testy działały w Chromium z emulacją telefonu i dotyku.
  Dotyk w kafelkach par i odpowiedziach obsługuje ten sam mechanizm, który w wersji 0.3.3
  usunął problem pierwszego dotknięcia, ale na prawdziwym iPhonie go nie sprawdzono.
- **Dzielenie długich polskich słów w kafelkach par** zależy od przeglądarki (Chromium
  w środowisku testowym ich nie dzieli, w Safari nie sprawdzono); test sprawdza tylko,
  że nic nie wystaje poza ekran.
- **iPad** – układ 8 par sprawdzono na oknie komputera 1280 × 800.

## Znane ograniczenia

- Gdy materiał quizu jest mały, błędne odpowiedzi pochodzą z całej biblioteki; w bibliotece
  z jedną dziedziną wszystkie są z niej.
- Liczba pytań na ekranie konfiguracji jest szacunkiem: jeśli dla któregoś pojęcia nie da się
  ułożyć pytania (brak różnych odpowiedzi), quiz ma o tyle mniej pytań.
- Pojęcie usunięte w trakcie quizu zostaje w nim z zapamiętanym tekstem, ale bez definicji
  i przykładu; nie trafia do „Powtórz błędne odpowiedzi”.
- Wyniki quizów nie mają jeszcze wykresów – to część statystyk w etapie 6.

## Jak uruchomić

- W przeglądarce: adres z pliku [README](../README.md); w Safari odśwież stronę dwa razy albo
  użyj przycisku „Uruchom ją”. W Ustawieniach powinna być widoczna wersja 0.5.0.
- Wypróbowanie: zakładka Quiz → „Rozpocznij quiz”; na ekranie lekcji „Quiz z tej lekcji”.
- Testy: `npm test`, `npm run test:e2e` (wymaga Playwright z Chromium).
