# LexiCards 1.7 – notatka lekcji w słuchaniu, przyciski wstecz / dalej, czytelne „Anuluj”

Wersja 1.7.0, 19 października 2026. Słuchanie (np. w samochodzie) może przed pojęciami przeczytać
notatki lekcji, na każdym ekranie są przyciski poprzedniego i następnego ekranu, a „Anuluj” w menu
poleceń jest czytelne po najechaniu kursorem. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md)
(sekcje „Interfejs” i „Słuchanie”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Słuchanie: przed fiszkami notatka lekcji, z wyborem PL, EN albo obie | W ustawieniach słuchania grupa **Notatka lekcji przed pojęciami**: **Nie** (domyślnie), **PL**, **EN**, **PL + EN**; opis pod nią mówi, ile notatek ma wybrany materiał. Przed pojęciami aplikacja czyta notatki lekcji wszystkich pojęć z wybranego zakresu (w kolejności biblioteki): zapowiedź „Notatka do lekcji …”, potem tekst zdanie po zdaniu – bez obrazów, odwołań `[[…]]` i podziałów stron. „PL + EN” – najpierw wersja polska, potem „English version.” i angielska. Gdy notatka nie ma wybranej wersji, czyta tę, która jest. Na ekranie słuchania widać „Notatka – nazwa lekcji” i czytane zdanie; „następne” przechodzi od razu do pojęć, „poprzednie” z pierwszego pojęcia wraca do notatki. Zapowiedź na początku: „Zaczynamy. Notatka lekcji i 20 pojęć.”, a czas słuchania obejmuje notatki. Wybór jest zapamiętany |
| „Anuluj” w oknach poleceń mało czytelne po najechaniu kursorem | Przyczyna: reguła najechania dla wszystkich pozycji menu dawała „Anuluj” półprzezroczyste tło, przez które przebijało przyciemnienie ekranu. Teraz „Anuluj” po najechaniu i przy naciśnięciu ma nieprzezroczyste, lekko ciemniejsze tło (w jasnym i ciemnym motywie) |
| Oprócz „poziom wyżej” – powrót do poprzedniego ekranu i dalej, jak w przeglądarce, na wszystkich podstronach | Na pasku u góry każdego ekranu, przed strzałką „poziom wyżej”: **←** (poprzedni ekran) i **→** (następny). Działają jak „wstecz” i „dalej” przeglądarki, więc z lekcji do słuchania i **←** – z powrotem na lekcji; tak samo w statystykach, quizie i ustawieniach. Pojawiają się, gdy jest dokąd przejść, i nigdy nie wychodzą poza aplikację (z pierwszego ekranu ← jest nieaktywne). Działają w trybie pełnoekranowym i po przeładowaniu strony |

## Testy, które wykonano

- **Testy logiki (Node.js): 240 – wszystkie zaliczone** (238 wcześniejszych + 2 nowe): wersje
  notatki do czytania (PL, EN, obie, brakująca – druga), zdania bez odwołań, podziałów
  i punktorów, notatka z samymi odwołaniami – nic do czytania, zapowiedź z notatką, szacunek czasu;
  odtwarzacz z notatką – liczba pojęć bez notatki, „dalej” do pojęć, „wstecz” do notatki.
- **Testy w przeglądarce (Chromium): 98 – wszystkie zaliczone w dwóch przebiegach** (95
  wcześniejszych + 3 nowe):
  - słuchanie z notatką (udawana synteza mowy): opis liczby notatek, czas z notatką, kolejność
    wypowiedzi przy „PL + EN”, języki, wybór zapamiętany; tylko „EN” – bez wersji polskiej,
    „Dalej” w trakcie notatki – pierwsze pojęcie;
  - wstecz / dalej (telefon): na pierwszym ekranie ukryte, lekcja → słuchanie → ← lekcja → →
    słuchanie, statystyki, nowy ekran po cofnięciu kasuje „dalej”, po przeładowaniu działa dalej,
    z pierwszego ekranu ← nieaktywne;
  - „Anuluj” w menu (komputer): po najechaniu i przy naciśnięciu tło nieprzezroczyste.
- **Lint: bez błędów.**
- Zrzuty: ustawienia słuchania z notatką i pasek z ←/→ (telefon), ekran lekcji z ←/→ (komputer),
  „Anuluj” po najechaniu (jasny i ciemny motyw).

## Czego nie sprawdzono

- **Na iPhonie** – Chromium z ekranem telefonu, nie Safari na iOS: czytanie notatki w samochodzie
  (głos, przerwy) i przyciski ←/→ w aplikacji z ekranu początkowego.

## Warto wiedzieć

- Notatki czytane w słuchaniu to notatki lekcji wszystkich pojęć z wybranego zakresu – także gdy
  liczba pojęć jest ograniczona (np. 20 losowych pojęć z modułu, notatki wszystkich jego lekcji).
- Przyciski ←/→ to historia ekranów (jak w przeglądarce), a strzałka z nazwą – miejsce w bibliotece
  o poziom wyżej; obie drogi zostają.
