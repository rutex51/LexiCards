# LexiCards 1.61 – tablica A0 w skali zeszytu, dwie strony przy edycji notatki

Wersja 1.61.0, 31 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Tablica A0 w skali zeszytu,
dwie strony w edytorze notatki”). Według zaakceptowanych makiet.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Tablica w skali zeszytu** | Po przejściu na tablicę A0 (zamiana albo następna kartka) tablica jest w tej samej skali co zeszyt („100%”), a obszar kartki zeszytu (przerywana ramka) leży dokładnie tam, gdzie leżała kartka – rysunek zostaje w tym samym miejscu ekranu. Tablica zakrywa cały ekran; resztę widać po przesunięciu. |
| **Kartka na środku tablicy** | Obszar kartki zeszytu jest na środku tablicy A0 (jak na szkicu). Pomniejszenie (Ctrl + kółko myszy, dwa palce) pokazuje całą tablicę z kartką na środku; „100%” wraca do skali zeszytu. |
| **Rulon przez cały ekran** | Z tablicy na zeszyt: tablica zwija się od prawego dolnego rogu ekranu, rulon przechodzi przez cały ekran, a pod spodem zostaje zwykły zeszyt z pierścieniami. Z zeszytu na tablicę – rozwija się od lewego górnego rogu ekranu nad zeszytem. |
| **Tablice z 1.59–1.60** | Kartka była wtedy w lewym górnym rogu tablicy – przy otwarciu rysunek przesuwa się raz razem z nią na środek (rysunek przy prawym albo dolnym brzegu – najwyżej do brzegu tablicy). |
| **Dwie strony przy edycji** | W widoku „Książka” na dużym ekranie (jak w podglądzie – od 960 × 520 px) dwie strony obok siebie z grzbietem; pod nimi przycisk z ikoną książki i „‹ Strony 3–4 z 9 ›”. Prawa kartka przechodzi przez grzbiet na lewo (na odwrocie – lewa strona następnej rozkładówki), wstecz – lewa na prawo. PageDown / PageUp, przewracanie za kursorem i Ctrl+End – po rozkładówkach. |
| **Wspólne ustawienie** | Dwie strony albo jedna – to samo ustawienie w edycji i w podglądzie: przycisk w jednym miejscu zmienia oba (otwarty pod spodem podgląd od razu). |
| Poprawka 1.60 | Na odwrocie przewracanej kartki w edycji była zawsze pierwsza strona – teraz jest strona, którą się przewraca. |

Format rysunku 28.

## Własność intelektualna

Bez nowych technik – skala i położenie widoku, przesunięcie rysunku, kolumny CSS i zagięcie kartki z podglądu (1.4).
Kod własny, bez bibliotek.

## Testy, które wykonano

- **Testy logiki (Node.js): 541 – wszystkie zaliczone**, w tym zmienione testy tablicy (obszar kartki na środku, zamiana
  w obie strony w miejscu, jednorazowe przesunięcie tablic formatu 27 – także rysunku przy brzegu, pusta tablica)
  i numer formatu 28 w testach rysunku.
- **Testy w przeglądarce (Chromium): 261 – wszystkie zaliczone w dwóch pełnych przebiegach** na tym samym kodzie, w tym:
  - nowy – notatka na komputerze: domyślnie dwie strony, tekst na obu połowach; w połowie przewracania (zatrzymany czas)
    dwie połówki stron i zagięty płat, potem „Strony 3–4”; przewracanie wstecz; PageDown; Ctrl+End – ostatnia
    rozkładówka; przycisk z książką – jedna strona („Strona N z N”), a podgląd notatki pod spodem też ma jedną stronę;
  - zmienione – tablica: po zamianie rysunek w tym samym miejscu ekranu, bez pierścieni, tablica zakrywa ponad 97%
    ekranu rysunku; pomniejszenie – cała tablica z kartką na środku; kreska poza obszarem kartki blokuje powrót, po
    „Cofnij” – kartka z pierścieniami; obraz do notatki – obszar z rysunkiem; rulon zwija się przez cały ekran
    i rozwija nad zeszytem;
  - zmieniony – edycja notatki 1.60 na komputerze najpierw wyłącza dwie strony.
  - Testy rysunku (109) i notatek (47) – zaliczone także osobno, przed pełnymi przebiegami.
- **Lint: bez błędów.**
- Zrzuty (Chromium): cała tablica po pomniejszeniu, rulon w połowie zwijania i rozwijania, dwie strony w edycji,
  przewracanie przez grzbiet w połowie.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie** – pole edycji w kolumnach i rulon oglądane tylko w Chromium; na iPadzie dwie strony
  w edycji nie były sprawdzane.
- Zamiana kartka ↔ tablica rozpoczyna nową historię zmian (Cofnij nie sięga sprzed zamiany), bo rysunek się przesuwa.
- Tablice z 1.59–1.60 z rysunkiem przy prawym albo dolnym brzegu: przesunięte tylko do brzegu – ich obszar kartki nie
  pokrywa się wtedy z dawnym rysunkiem na kartce.
- Dwie strony w edycji: strony liczy przeglądarka (kolumny), więc podział może się różnić od podglądu; zaznaczenie
  przeciągnięciem przez grzbiet nie przewraca kartki.
- Ciemny motyw.
