# LexiCards 1.43 – edycja geometrii: odsuń, zaokrąglij, fazuj, przytnij, wydłuż, okrąg styczny, łamana

Wersja 1.43.0, 23 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Edycja geometrii”).

Pakiet E planu „rysunek jak w CAD” – ostatni z zaplanowanych pakietów.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| Grupa **Edycja** | Nowa grupa na prawym kółku: **Odsuń**, **Zaokrąglij**, **Fazuj**, **Przytnij**, **Wydłuż**. Polecenie czeka na dotknięcia elementów (podpowiedź na dole), działa wielokrotnie – do Esc albo ponownego dotknięcia polecenia; narzędzie rysowania zostaje. Każda zmiana to jeden krok cofania. |
| Odsuń | Najpierw odległość (okno, w jednostkach liczb wymiarów, np. cm), potem dotknij elementu i strony: kopia równoległa odcinka, prostej i półprostej, współśrodkowa okręgu i łuku, prostokąt o tyle samo większy albo mniejszy (zaokrąglenie R ± odległość, faza – odpowiednio), łamana i wielokąt – boki równolegle, wierzchołki w przecięciach (trójkąt, romb, trapez, wielokąt foremny – jako wielokąt). Mysz pokazuje kopię przed dotknięciem. Zaznaczony element – od razu wybór strony. |
| Zaokrąglij | Promień R (0 – ostry narożnik w przecięciu), potem dotknij dwóch odcinków – w częściach, które zostają: odcinki kończą się w punktach styczności, łuk między nimi. Dwa zaznaczone odcinki – od razu. |
| Fazuj | Wielkość fazy (45°), potem dwa odcinki: skrócone o tyle od narożnika, nowy odcinek między nimi. |
| Przytnij | Dotknij części elementu między przecięciami z innymi elementami (kształty, proste, kreski pióra) – znika: odcinek krótszy albo dwa odcinki, prosta – dwie półproste, półprosta – odcinek albo krótsza półprosta, okrąg – łuk (potrzebne dwa przecięcia), łuk – krótszy albo dwa łuki. |
| Wydłuż | Dotknij odcinka albo łuku przy końcu – koniec dochodzi do najbliższego elementu na przedłużeniu (łuk – po okręgu). |
| Okrąg styczny | **Elipsa** → pod menu **Styczny**: dotknij dwóch linii (odcinek, bok kształtu, prosta) albo okręgów i łuków, wpisz promień – okrąg styczny do obu, po stronie dotknięć. |
| Łamana | **Kształty** → **Łamana**: dotykaj kolejnych wierzchołków (przyciągają się jak końce odcinka); koniec – ostatni punkt jeszcze raz, Enter albo Esc; dotknięcie pierwszego punktu zamyka łamaną w wielokąt. Do 24 wierzchołków. |

Zasady, które warto znać:

- Zaokrąglić i sfazować można odcinki (nie prostą, półprostą ani wymiar). Zmieniony koniec przyklejony do kształtu
  zostaje odklejony; drugi – bez zmian.
- Przycięty element zachowuje swoje miejsce na liście (pierwszy kawałek – jego identyfikator, więc wymiary przyklejone
  do niego zostają); drugi kawałek jest nowym elementem.
- Elipsy (nie okręgu) nie da się odsunąć – kopia elipsy nie byłaby elipsą.
- Format rysunku bez zmian (15) – nowe elementy to zwykłe odcinki, łuki, okręgi, łamane i wielokąty.

## Testy, które wykonano

- **Testy logiki (Node.js): 446 – wszystkie zaliczone** (5 nowych: odsunięcie – odcinek, okrąg, łuk, prostokąt z R
  i fazą, łamana, trójkąt, przypadki niemożliwe; zaokrąglenie i faza – punkty styczności, łuk, R 0, za duży promień,
  równoległe, wybór części dotknięciami, odklejenie zmienionego końca; przycinanie – odcinek, prosta, okrąg, łuk, bez
  przecięć; wydłużanie – odcinek z grotem, łuk, bez celu; okrąg styczny – dwie proste, prosta i okrąg, brak rozwiązania).
- **Testy w przeglądarce (Chromium): 211 – wszystkie zaliczone w dwóch pełnych przebiegach** (2 nowe):
  - komputer: łamana z czterech punktów i wielokąt z trzech; grupa Edycja (pięć poleceń); zaokrąglenie R 1 cm i faza
    0,5 cm dwóch „L”; przycięcie poziomego odcinka między dwoma pionowymi (dotknięcie pustego miejsca – komunikat);
    wydłużenie do ściany; odsunięcie o 1 cm z podglądem pod myszą; okrąg styczny R 1 cm w narożniku; położenia
    sprawdzone w zapisanych danych;
  - telefon (390 px): grupa Edycja w górnym menu bez przewijania w bok, okno odsunięcia w szerokości ekranu, przycięcie
    dotknięciem.
  - Poprawione starsze testy: liczba kształtów w grupie Kształty (11 – doszła łamana; wyłapał to pierwszy pełny przebieg,
    przerwany i powtórzony), listy grup na kółku i w oknie „Grupy narzędzi” (Edycja na końcu), testy logiki list grup.
  - Własny test 1.43 poprawiony po celowanym uruchomieniu: dotknięcie zaraz po zamknięciu okna fazy trafiało, zanim
    polecenie ruszyło – test czeka teraz na podpowiedź (3 kolejne uruchomienia – zaliczone).
- **Lint: bez błędów.**
- Zrzuty (Chromium): łamana w trakcie, edycja (podgląd odsunięcia, zaokrąglenie, faza, przycięcie, wydłużenie), okno
  odsunięcia na telefonie.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – dotknięcia udawane myszą w Chromium.
- Ciemny motyw.
