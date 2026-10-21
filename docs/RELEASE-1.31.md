# LexiCards 1.31 – dźwięki fiszki i kartek

Wersja 1.31.0, 21 października 2026. Punkt 12 listy do 1.29 – dźwięki przewracania, w wariantach
wybranych z propozycji. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Dźwięki”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Fiszka – wariant B („miękki obrót”) przy wylocie | Po decyzji („Umiem”, „Powtórz”, przesunięcie palcem albo klawisz) fiszka odlatuje z krótkim **szumem z trzaskiem krawędzi i miękkim stuknięciem** (0,26 s). Dźwięk idzie w stronę lotu: „Umiem” – w lewo, „Powtórz” – w prawo (w słuchawkach). |
| Kartka – wariant E („album – gruby papier”), wydłużony do czasu przewracania | Przewracana kartka **notatki** (przyciski ‹ ›, klawisze, kółko, palec) i **rysunku** szeleści jak gruby papier; dźwięk trwa tyle, co przewracanie – **klapnięcie wypada w chwili, gdy kartka kładzie się na drugą stronę**: w notatce po 0,72 s, w oknie rysowania (wolniejsza animacja) – po 0,9 s, cały dźwięk proporcjonalnie dłuższy. Kartka puszczona palcem w połowie: słychać końcówkę dźwięku, klapnięcie razem z końcem animacji; kartka, która wraca na miejsce – bez dźwięku. Kartka idzie z prawej na lewą (wstecz – odwrotnie), z lekkim pogłosem pokoju; trzy odmiany na zmianę, żeby kolejne kartki nie brzmiały identycznie. |

Dźwięki powstają **w aplikacji** (synteza – bez plików, bez internetu, działają offline) i grają
z głośnością multimediów. **Ustawienia → Dźwięki → „Dźwięki fiszek i kartek”** – wyłącza oba
(domyślnie włączone). Gdy system prosi o ograniczenie ruchu (bez animacji), dźwięków też nie ma.

## Testy, które wykonano

- **Testy logiki (Node.js): 385 – wszystkie zaliczone** (382 wcześniejsze + 3 nowe): kartka 0,72 s
  i 0,9 s – klapnięcie dokładnie w chwili końca animacji (głośniej tuż po niej niż chwilę przed i niż na
  końcu), długość dźwięku, dłuższa animacja – dłuższy dźwięk; stereo – kartka z prawej na lewą, wstecz
  odwrotnie, fiszka w stronę lotu; ta sama próbka przy tym samym ziarnie, inna przy innym; odpowiedź
  impulsowa pokoju; ustawienie domyślnie włączone.
- **Testy w przeglądarce (Chromium, ekran telefonu): 180 – wszystkie zaliczone w dwóch pełnych
  przebiegach** (178 wcześniejszych + 2 nowe; odtwarzanie sprawdzane na prawdziwym Web Audio – każde
  uruchomienie próbki jest zapisywane):
  - fiszki: „Umiem” – dźwięk w lewo, „Powtórz” – w prawo, Web Audio gra dwie próbki po 260 ms;
    Ustawienia → Dźwięki domyślnie włączone, po wyłączeniu – kolejna decyzja bez dźwięku;
  - notatka: przycisk › i ‹ – kartka 720 ms (próbka 950 ms – klapnięcie i wybrzmienie), kierunek;
    kartka puszczona palcem w połowie – próbka gra od środka (z tym samym przesunięciem w Web Audio);
    kartka, która wraca na miejsce – bez dźwięku;
  - rysunek: kartka 2 → 1 – dźwięk 900 ms (próbka 1175 ms), wstecz.
- **Lint: bez błędów.**
- Zrzut: Ustawienia → Dźwięki (Chromium, ekran telefonu).

## Czego nie sprawdzono

- **Jak to brzmi na iPhonie i w Safari** – testy sprawdzają, że dźwięk jest odtwarzany i z jakim
  wyczuciem czasu, ale nikt go nie słuchał na urządzeniu. Według opisu Safari dźwięki Web Audio milkną
  przy przełączniku wyciszenia i mieszają się z muzyką – **nie sprawdzono na iPhonie**.
- Pierwszy dźwięk po otwarciu aplikacji: próbka liczy się przy pierwszym użyciu (w Node.js ok. 40 ms
  przy 24 kHz) – na starszym iPhonie pierwsza kartka może ruszyć z małym opóźnieniem.
- Opóźnienie dźwięku względem obrazu na Bluetooth (słuchawki, samochód) – zależy od urządzenia.

## 1.31.1 – kartka z nagrania, bez dudnienia

Wersja 1.31.1, 21 października 2026. Dźwięk przewracanej kartki to teraz **Twoje nagranie** zamiast
syntezy (w syntezie dudniło klapnięcie). Nagranie przycięte do samej kartki (1,14 s – bez ciszy na
początku i szmerów na końcu), **niskie tony poniżej ok. 170 Hz wycięte** (dudnienie i stuki telefonu),
głośność wyrównana, zapisane jako zwykły plik dźwięku bez opisów nagrania (daty, nazwy). Plik jest
w aplikacji i w pamięci do pracy offline.

Czas jak dotąd według animacji: klapnięcie kartki z nagrania wypada w chwili, gdy kartka kładzie się
na drugą stronę – w notatce nagranie zaczyna się 45 ms „w głąb”, w oknie rysowania (wolniejsza
animacja) – 135 ms później; wysokość dźwięku się nie zmienia. Kartka puszczona palcem – końcówka
nagrania; kierunek (z prawej na lewą, wstecz odwrotnie) – jak dotąd. Fiszka bez zmian.

Testy: logika – 385 zaliczone (nagranie: format, brak opisów, klapnięcie po 0,765 s, udział tonów
poniżej 100 Hz, wyczucie czasu; synteza kartki usunięta razem z jej testami); przeglądarka (Chromium,
ekran telefonu) – 180 zaliczone w dwóch pełnych przebiegach (nagranie gra od 45 ms przy przycisku,
od środka po puszczeniu kartki, 135 ms później w rysunku; plik w pamięci offline; test aktualizacji wydania kopiuje teraz także katalog `sounds` – bez niego
nowy service worker nie mógł się zainstalować i test stał); lint bez błędów.
Nie sprawdzono w Safari na iPhonie ani nie słuchano na urządzeniu.
