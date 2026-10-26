# LexiCards 1.49 – szkic na ścianie bryły: wycięcie i dodanie

Wersja 1.49.0, 26 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Szkic na ścianie bryły:
wycięcie i dodanie”).

Trzeci etap rysunku przestrzennego (po 1.47 – bryły podstawowe i 1.48 – bryły ze szkicu): szkic przeniesiony na płaską
ścianę bryły i materiał wycięty albo dodany prostopadle do tej ściany – jak „wyciągnięcie wycięcia” i „wyciągnięcie
dodania” w programach CAD, w uproszczeniu. Pod spodem – operacje logiczne na bryłach (różnica i suma), napisane od
podstaw w aplikacji.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Szkic na ścianie** | Przycisk nad zaznaczoną bryłą (każdą poza kulą, także ze szkicu). Potem dotknij płaskiej ściany – myszą ściana pod kursorem podświetla się na niebiesko. Bryła płynnie obraca się tak, że ta ściana stoi prosto do Ciebie: ściana boczna albo pochyła – z osią Z w górę, wierzch i spód – krawędziami wzdłuż osi (np. wierzch prostopadłościanu – jak widok „Góra”). Esc albo ponowne dotknięcie przycisku – bez zmian. |
| Szkic | Zwykłe zamknięte kształty narysowane na ścianie (okrąg, prostokąt, wielokąt, łamana zamknięta…); kształt w kształcie – otwór w profilu, jak w 1.48. Szkic musi leżeć choć częściowo na ścianie; gdy pod nim jest kilka ścian (np. stopień), liczy się ta bliżej Ciebie. |
| **Wytnij z bryły** | Przycisk nad zaznaczonymi kształtami, gdy leżą na ścianie bryły widzianej prosto (albo gdy bryłę zaznaczono razem z nimi). Materiał znika w głąb, prostopadle do ściany – na start do połowy grubości bryły pod ścianą (kieszeń). |
| **Dodaj do bryły** | Jak wyżej, ale materiał przybywa na zewnątrz (czop, żebro) – na start połowa krótszego boku szkicu. |
| Po operacji | Kształty znikają z kartki i zostają w operacji jako jej szkic. Bryła przechodzi do izometrii, w której widać tę ścianę (wierzch – zwykła izometria, spód – od dołu, tył – z drugiej strony). |
| Niebieski uchwyt | Głębokość (wysokość) ostatniej operacji: ramię od środka szkicu na ścianie – przy wycięciu w głąb (do dna), przy dodaniu – na zewnątrz. Przeciąganie dalej – głębiej (wyżej). |
| **Historia modelu** | W oknie bryły kolejne operacje: „2. Wycięcie – 1 obrys” / „3. Dodanie – …” z polem **Głębokość** albo **Wysokość**, przełącznikiem **Na wylot** (wycięcie przez całą bryłę, także po zmianie jej wymiarów), **Usuń** (przekreślone; **Przywróć** – cofa) i przy ostatniej **Edytuj szkic**: operacja znika, bryła staje ścianą do Ciebie, szkic wraca na nią zaznaczony – poprawiasz i wycinasz albo dodajesz jeszcze raz. |
| Ściany się przesuwają | Zmiana wymiarów bryły albo głębokości operacji przesuwa operacje narysowane na przesuniętych ścianach (otwór w wierzchu idzie w górę razem z wierzchem; otwór w wierzchu czopa – razem z wierzchem czopa). |
| Na kartce | Krawędzie niewidoczne (kieszenie, otwory) – przerywaną, cieniowanie z buforem głębokości, wymiary całej bryły; **Rzuty** – otwory z góry jako okręgi, z przodu i z boku przerywaną; odbicie, skala, obraz w notatce, PDF i DXF – jak przy innych bryłach. |

Zmiany przy okazji:

- Format rysunku **21** (operacje na ścianach); starsza wersja aplikacji pokaże bryłę bez operacji.
- Bryła ze szkicu z wyspami nachodzącymi na siebie: przy operacjach liczona jest suma wysp (bez operacji – jak dotąd).

## Jak to działa (w skrócie)

- Operacja to profil szkicu wyciągnięty wzdłuż normalnej ściany (graniastosłup). Bryła z operacjami powstaje
  po kolei: bryła bazowa, potem różnica albo suma z każdą operacją.
- Różnica i suma – klasyczna metoda grafiki komputerowej: drzewa BSP, czyli podział przestrzeni płaszczyznami ścian
  (opisana w literaturze od lat 80., m.in. Thibault i Naylor 1987). Implementacja własna, bez bibliotek
  (`js/core/csg.js`). Wynik wraca do siatki ścian z otworami: części jednej płaszczyzny są łączone, punkty pośrednie
  na prostych usuwane, a wierzchołki bliżej niż 0,002 jednostki strony sklejane. Tak każda krawędź ma dwie ściany, a gładkie
  ściany otworów nie dostają zbędnych kresek.
- Wyniki po każdej operacji są zapamiętywane – przeciąganie uchwytu liczy tylko ostatnią operację. W testach jedna
  operacja trwała zwykle 10–60 ms, najdłużej ok. 140 ms (Node.js na komputerze).

## Własność intelektualna

Szkic na ścianie i wyciągnięcie wycięcia / dodania to ogólne techniki modelowania CAD znane od lat 80. Operacje logiczne
metodą BSP – metoda opisana w literaturze w 1987 r. Kod napisany od podstaw w aplikacji, bez cudzych bibliotek i bez
kopiowania kodu innych programów. Kolejność kroków różnicy i sumy (przycinanie drzewami, odwracanie) wynika z metody
i jest taka sama jak w znanych otwartych implementacjach (np. csg.js, licencja MIT) – reszta (drzewo bez rekurencji,
wybór płaszczyzny, przebudowa siatki) jest własna; opis w audycie IP (gałąź z katalogiem `audit/`, pozycja S-4). Nazwy
przycisków są opisowe („Szkic na ścianie”, „Wytnij z bryły”, „Dodaj do bryły”).

## Testy, które wykonano

- **Testy logiki (Node.js): 498 – wszystkie zaliczone** (7 nowych):
  - operacje logiczne: otwór w prostopadłościanie i kieszeń – objętość zgodna z obliczoną, siatka szczelna, wierzch
    z otworem jako jedna ściana z jedną pętlą otworu; czop na wierzchu; dodanie równo z bokiem – boki scalone (8 ścian);
    bryły rozłączne; części wypukłe obszaru z otworem (suma pól);
  - ściana pod punktem i widok na nią: przód, prawy bok, wierzch prostopadłościanu, pochyła ściana ostrosłupa (bez
    obrotu na kartce); kula – bez ścian;
  - szkic na wierzchu: układ (o, u, v, normalna na zewnątrz), wycięcie do połowy grubości, na wylot, dodanie, dwie
    operacje, operacja na wierzchu czopa (najbliższa ściana); bryła nie stoi ścianą do patrzącego albo szkic obok –
    komunikat;
  - dane: zapis bez zmian przy ponownym wczytaniu, złe operacje odrzucone, u i v poprawiane, „na wylot” tylko przy
    wycięciu, kula bez operacji, najwyżej 30, format 21;
  - odbicie (objętość ta sama, normalna na zewnątrz, szkic oznaczony), skala ×2 (objętość ×8), przesuwanie operacji
    za wierzchem i za wierzchem czopa, widok po operacji, widok na szkic operacji;
  - rozkład na stronie (krawędzie niewidoczne, płaszczyzny ścian, wymiary bryły bazowej), rzuty (okrąg otworu,
    przerywane), DXF; płyta ze szkicu z otworem na wylot; dwie nachodzące wyspy – suma i otwór;
  - losowe operacje ze stałym ziarnem (40 brył po 3 operacje, ponad 80 operacji: wycięcia, na wylot, dodania na ścianach
    prostopadłościanów, walców, graniastosłupów, ostrosłupów i stożków w losowych położeniach) – każda siatka szczelna,
    objętość maleje przy wycięciu i rośnie przy dodaniu.
- Poza testami w repozytorium: trzy serie losowe po ok. 650–710 operacji (razem 2027). W dwóch operacjach została
  jedna krawędź bez drugiej ściany – przy ściance cieńszej niż 0,01 jednostki strony. Kreska jest wtedy zasadna
  (krawędź wierzchu), siatka ma szczelinę tylko w tym miejscu.
- **Testy w przeglądarce (Chromium): 227 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe):
  - komputer: prostopadłościan → „Szkic na ścianie”, podświetlenie wierzchu pod myszą, dotknięcie – widok z góry (Z
    punktem, Y w prawo, X w dół); okrąg na wierzchu – „Wytnij z bryły” i „Dodaj do bryły” bez zaznaczania bryły,
    „Wyciągnij” zostaje; wycięcie – uchwyt pod środkiem bryły (w głąb), okno: historia „1. Prostopadłościan / 2. Wycięcie”,
    bez wyboru rodzaju, głębokość ok. 1,5 cm; uchwyt przeciągnięty – głębiej; „Na wylot” – pole głębokości wyłączone;
    prostokąt na wierzchu – „Dodaj do bryły”, uchwyt nad bryłą; „Rzuty”; „Edytuj szkic” ostatniej operacji – prostokąt
    wraca, znów „Dodaj do bryły”; zapis (wycięcie na wylot i dodanie, u wzdłuż x, o na wierzchu, szkic w operacji, rzut
    z okręgiem) i DXF (bez pominiętych, DASHED);
  - iPad (dotyk): walec – „Szkic na ścianie” i wierzch dotknięty palcem, okrąg, „Dodaj do bryły” palcem, wysokość ok.
    0,7 cm, uchwyt przeciągnięty palcem – wyżej;
  - telefon (390 px): „Szkic na ścianie”, „Wytnij z bryły” i „Dodaj do bryły” w szerokości ekranu, okno bryły z operacją
    bez przewijania w bok (głębokość, „Usuń”, „Edytuj szkic” na ekranie).
- **Lint: bez błędów.**
- Zrzuty (Chromium): wybór ściany, szkic na ścianie, wycięcie z uchwytem, otwór na wylot, wycięcie i dodanie, rzuty,
  uchwyt palcem (iPad), telefon i okno na telefonie.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec i Apple Pencil – dotyk udawany zdarzeniami Chromium. Z rysikiem palec
  przesuwa kartkę – ścianę wskazuje się wtedy rysikiem (jak inne wskazania punktów).
- Szybkość na prawdziwym iPadzie przy wielu operacjach (każda zmiana głębokości liczy ostatnią operację od nowa).
- Ściana zakrzywiona (pobocznica walca, stożka, bryły obrotowej) składa się z wąskich płaskich pasków: szkic leży na
  płaszczyźnie dotkniętego paska, a operacja idzie prostopadle do niego.
- „Edytuj szkic” – tylko ostatniej operacji (wcześniejsze: usuń późniejsze albo zmień głębokość). Szkic bryły ze szkicu –
  po usunięciu operacji.
- Usunięcie operacji nie przesuwa operacji narysowanych na jej ścianach (np. otwór w wierzchu usuniętego czopa zostaje
  na dawnej wysokości i niczego nie wycina). Za ścianami bocznymi czopa operacje nie idą.
- Wymiary na rysunku – całej bryły bazowej; głębokości operacji – w oknie bryły (bez linii wymiarowych na bryle).
- Plik DXF w programie CAD – sprawdzony odczytem z powrotem w aplikacji. Ciemny motyw.
