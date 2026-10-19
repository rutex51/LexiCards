# LexiCards 1.5 – obrazy notatki na górze edytora, w podglądzie przed tekstem albo po nim

Wersja 1.5.0, 19 października 2026. W edytorze notatki obrazy są teraz na górze, nad tekstem,
a dla każdej notatki można wybrać, czy w podglądzie obrazy są przed tekstem, czy po nim. Opis
budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcje „Treść notatki” i „Notatka w stronach”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Dodawanie zdjęć w trybie edycji na górze, przed notatką | Sekcja „Obrazy” (miniatury, **Dodaj obraz**, wybór miejsca) jest nad sekcją „Tekst” z paskiem formatowania. Wklejanie i upuszczanie obrazów działa jak dotąd |
| Decyzja, czy obrazy w podglądzie są przed tekstem, czy po nim | Przy obrazach w edytorze: „W podglądzie: **Przed tekstem** / **Po tekście**” (widać, gdy notatka ma obrazy; domyślnie po tekście – jak dotąd). Wybór jest zapisany w notatce. Przed tekstem: obrazy w swojej kolejności na początku, tekst zaczyna się pod ostatnim obrazem albo na następnej stronie. „Kopiuj notatkę” kładzie obrazy w tym samym miejscu co podgląd |
| Gdzie wybór zostaje | W notatce, w kopii zapasowej i w kopii lekcji. Import notatek z arkusza (zastąpienie i dopisanie) zmienia treść i obrazy, ale zostawia wybór. Arkusz XLSX nie ma na niego kolumny – po eksporcie i imporcie do nowej lekcji obrazy będą po tekście |

## Testy, które wykonano

- **Testy logiki (Node.js): 231 – wszystkie zaliczone** (230 wcześniejszych + 1 nowy): domyślnie
  obrazy po tekście, wybór zapisany, zapis bez wyboru i import z arkusza go zostawiają, kopia
  lekcji i kopia zapasowa go przenoszą, niepoprawna wartość w kopii – po tekście.
- **Testy w przeglądarce (Chromium, ekran telefonu): 91 – wszystkie zaliczone w dwóch
  przebiegach** (bez nowych testów; 2 testy notatek uzupełnione): sekcja obrazów nad tekstem,
  wyboru nie ma bez obrazów, domyślnie „Po tekście” i obraz pod tekstem w podglądzie; po wyborze
  „Przed tekstem” – zapisane w notatce, obraz nad tekstem; długa notatka z obrazem przed tekstem –
  obraz na pierwszej stronie, cała treść za nim, każda strona bez przewijania.
- **Lint (ESLint): bez błędów.**
- Zrzuty ekranu: edytor z obrazami na górze i wyborem, podgląd z obrazem przed tekstem.

## Czego nie sprawdzono

- **Na iPhonie** – testy działają w Chromium z ekranem telefonu, nie w Safari na iOS.
- „Kopiuj notatkę” z obrazami przed tekstem – kolejność w schowku sprawdzona tylko w kodzie,
  bez wklejenia do innej aplikacji.

## Uzupełnienie w wersji 1.5.1

| Prośba | Jak jest zrobione |
| --- | --- |
| Cień przy przewracaniu kartki nie wygląda naturalnie – płynny gradient | Jasny pas na płacie kończył się wewnątrz płata lekko ciemnym brzegiem – stąd widoczna granica. Teraz pas sięga do najdalszego punktu płata, więc nigdzie na nim nie ma granicy, a wszystkie trzy cienie (przy zgięciu, na płacie, na stronie pod spodem) zanikają łagodnie, w kilku krokach gradientu, i kończą się przezroczystością |
| Fiszka przy nowym wyświetleniu mniejsza niż po obrocie – ta sama wielkość | Podpowiedź pod przyciskami („Odwróć fiszkę…”) po obrocie znikała razem ze swoim miejscem, więc fiszka rosła (54 px na telefonie, 36 px na komputerze). Teraz po obrocie podpowiedź jest niewidoczna, ale miejsce zostaje: fiszka ma tę samą wielkość i położenie na obu etapach, a kafelki i przyciski się nie przesuwają |
| Trzeci przycisk na ekranie lekcji: „Słuchaj lekcji” | Obok „Ucz się tej lekcji” i „Quiz z tej lekcji”. Otwiera słuchanie z materiałem ustawionym na tę lekcję (dziedzina, moduł, zaznaczona lekcja). Na telefonie „Ucz się tej lekcji” jest na całą szerokość, pod nim quiz i słuchanie; na szerszym ekranie trzy przyciski w rzędzie |

Testy wersji 1.5.1:

- **Testy logiki: 231 – wszystkie zaliczone.**
- **Testy w przeglądarce: 92 – wszystkie zaliczone w dwóch przebiegach** (91 + 1 nowy: „Słuchaj
  lekcji” – układ przycisków, adres, ustawiony materiał i liczba pojęć; test fiszek uzupełniony
  o tę samą wielkość i położenie fiszki przed i po obrocie).
- **Lint: bez błędów.**
- Zrzuty: fiszka przed i po obrocie, ekran lekcji (telefon i komputer), przewracana kartka
  z nowym cieniem (komputer). Na iPhonie nie sprawdzono.

## Do decyzji

- Sygnatury obrazów: obraz w dowolnym miejscu treści przez odwołanie do jego sygnatury (także
  z arkusza Excela) – zrobione w wersji 1.6 ([RELEASE-1.6.md](RELEASE-1.6.md)).
