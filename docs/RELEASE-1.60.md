# LexiCards 1.60 – edycja notatki w widoku książki

Wersja 1.60.0, 30 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Widok książki w edytorze
notatki”).

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Dwa widoki edycji** | W oknie edycji tekstu notatki, obok wyboru języka, przełącznik **Ciągły \| Książka**. „Ciągły” – jak dotąd (pole rośnie z tekstem, okno się przewija). Wybór jest zapamiętany. |
| **Książka** | Pole edycji jest stroną na wysokość okna (bez przewijania); tekst płynie na kolejne strony jak w podglądzie – akapit może przejść na następną stronę, „Nowa strona” zaczyna nową, obrazy i wzory się nie dzielą. Pod stroną **‹ Strona 2 z 7 ›**. |
| **Przewracanie** | Przyciskami ‹ ›, klawiszami **PageDown / PageUp** w polu (kursor na początek nowej strony) i samo – gdy kursor przechodzi na inną stronę: pisanie za końcem strony, strzałki, Ctrl+End / Ctrl+Home, wklejenie. Kartka zagina się od dolnego rogu i odsłania następną stronę (wstecz – poprzednia wraca z lewej), na odwrocie prześwituje lustrzany tekst – ta sama animacja co w podglądzie notatki. Przy ograniczonym ruchu – bez animacji. |
| **Treść** | Ta sama w obu widokach: formatowanie, cofanie, wstawianie obiektów i zapis działają tak samo; widok nie zmienia zapisanej notatki. |

## Własność intelektualna

Edycja tekstu w stronach i przewracanie kartek to ogólne funkcje edytorów i czytników; kod własny – kolumny CSS w polu
edycji i zagięcie kartki z modułu podglądu notatki (1.4, `core/page-curl.js`), bez bibliotek. Nazwy opisowe.

## Testy, które wykonano

- **Testy logiki (Node.js): 541 – wszystkie zaliczone** (bez nowych – zmiany są w interfejsie).
- **Testy w przeglądarce (Chromium): 260 – wszystkie zaliczone w dwóch pełnych przebiegach** na tym samym kodzie, w tym 2 nowe:
  - komputer (notatka z 36 akapitami i „Nową stroną” przed akapitem 30): domyślnie widok ciągły; „Książka” – 7 stron,
    strona mieści się w oknie, akapit 1 na pierwszej stronie, 36 dalej; przycisk › – w połowie przewracania kopia strony
    i zagięty płat (zatrzymany czas), potem „Strona 2 z 7” i pole na drugiej stronie; akapit 30 zaczyna stronę na górze,
    29 – na stronie wcześniej; ‹ wraca; PageDown w polu – następna strona; Ctrl+End – ostatnia strona; 30 × Enter i tekst
    – nowa strona, przewrócona sama, dopisany tekst na niej; Ctrl+Home – pierwsza; zapis – treść z dopisanym tekstem, bez
    stylów stron; ponowna edycja – widok książki zapamiętany; „Ciągły” – pole bez stron;
  - telefon: 11 stron, przyciski stron na ekranie, bez przewijania w bok, przewrócenie dotknięciem ›.
  - Wszystkie 46 testów notatek – zaliczone także osobno, przed pełnymi przebiegami.
- **Lint: bez błędów.**
- Zrzuty (Chromium): widok książki na komputerze i telefonie, przewracanie w połowie.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie** – pole edycji w kolumnach (contenteditable) zachowuje się w Safari inaczej niż w Chromium
  (przesuwanie do kursora, zaznaczanie przez granicę stron); sprawdzone tylko w Chromium z ekranem telefonu i komputera.
  Na iPhonie klawiatura ekranowa zmniejsza okno – strona dopasowuje się do nowej wysokości, ale nie było to oglądane.
- Strony edytora są liczone przez przeglądarkę (kolumny), a strony podglądu – przez własny podział z 1.4: podział stron
  w edycji i w podglądzie może się różnić (np. nagłówek na dole strony, obrazy po tekście, tabele).
- Jedna strona naraz – bez dwóch stron obok siebie (jak w podglądzie na dużym ekranie) i bez przewracania gestem palca
  za róg (przyciski i klawisze).
- Zaznaczenie przeciągnięciem przez granicę stron nie przewraca kartki w trakcie zaznaczania.
- Ciemny motyw.
