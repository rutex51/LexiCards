# LexiCards 1.36 – warstwy z sygnaturami, rodzaje wymiaru w górnym menu, trzeci pasek

Wersja 1.36.0, 22 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Warstwy, rodzaje
wymiaru w menu i trzeci pasek”).

## Co się zmieniło

| Prośba | Jak jest zrobione |
| --- | --- |
| Nie zawsze znika trzeci pasek (wymiar wybrany, w menu grupa Symbole) | Wybór pod menu (tryby gumki, sposób rysowania okręgu, trzecie menu kształtu) jest widoczny tylko wtedy, gdy wybrane narzędzie należy do grupy pokazanej w górnym menu. Inna grupa w menu – pasek znika; powrót do grupy narzędzia – wraca. Styl zaznaczonych elementów (tryb edycji) zostaje niezależnie od grupy. |
| Wymiary jako osobne ikonki w głównym menu: długość, kąt, promień, średnica | Grupa **Wymiary** (i zestaw Metrologia) ma cztery narzędzia z ikonami: **Długość**, **Kąt**, **Promień**, **Średnica** – zamiast jednego „Wymiaru” z wyborem pod menu. Duże kółko pokazuje ikonę wybranego rodzaju. Własne grupy z dawnym „Wymiarem” dostają w tym miejscu wszystkie cztery rodzaje. |
| Warstwy: 5 na początek, dodawanie z aplikacji | Przycisk **Warstwy** na dolnym pasku otwiera panel nad paskiem: pięć warstw elementów, **+ Dodaj warstwę** (do 32), nazwa do zmiany, liczba elementów, oko (ukryj / pokaż), suwaki **Krycie** i **Nasycenie** (0–100%), kółko – warstwa nowych elementów, kosz – usunięcie pustej warstwy (oprócz warstwy 1). Poziomy stałe: **Tło** (papier, kratka, szablon) i na stronie ze zdjęciem **Obraz** – z tymi samymi ustawieniami. |
| Do 3 sygnatur kaskadowo: grupa 1., 2. i 3. rzędu | Przy zaznaczonych elementach polecenie **Warstwy** – w panelu trzy wybory **Rząd 1** (warstwa główna), **Rząd 2**, **Rząd 3** („—” usuwa rząd, „różne” – gdy zaznaczone mają różne). Kaskadowo: ukryta którakolwiek warstwa elementu – element znika; krycie i nasycenie jego warstw się mnożą. Przykład: 5 prostokątów w warstwie 2 z kryciem 50%, trzy z nich także w warstwie 3, jeden w warstwie 4 z nasyceniem 0% – wszystkie jaśniejsze, ten jeden szary; ukrycie warstwy 3 chowa trzy prostokąty. |

Zasady, które warto znać:

- Elementów ukrytych warstw nie da się zaznaczyć, zetrzeć ani do nich przyciągnąć; ukrycie warstwy zdejmuje ich zaznaczenie.
- Obraz rysunku w notatce, plik PDF oraz obraz zaznaczonych (Kopiuj jako obraz, Osadź) wyglądają jak w edytorze.
- Zmiana sygnatur to jeden krok cofania; ustawienia warstw (oko, suwaki, nazwy) – bez cofania, jak tło strony.
- Elementy sprzed 1.36 są na warstwie 1. Warstwy należą do kartki (każda kartka rysunku ma swoje).
- Format rysunku 11: starsza wersja aplikacji otworzy rysunek bez warstw (wszystko widoczne) i tak go zapisze;
  obraz w notatce się nie zmienia.
- Przezroczystość działa na każdy element osobno – tam, gdzie elementy tej samej warstwy zachodzą na siebie, kolor
  jest ciemniejszy. Nasycenie i przezroczystość to same ustawienia rysowania – bez dodatkowego płótna.

## Testy, które wykonano

- **Testy logiki (Node.js): 406 – wszystkie zaliczone** (5 nowych: warstwy domyślne, sprawdzanie, dodawanie, limit 32,
  usuwanie pustej; sygnatury; wygląd kaskadowo; nasycenie koloru; zapis w formacie 11 i sygnatury kawałków po gumce
  i przesunięciu; 6 wcześniejszych z nowymi oczekiwaniami: numer formatu, rodzaje wymiaru jako pozycje grup).
- **Testy w przeglądarce (Chromium): 197 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe; 3 wcześniejsze
  przepisane na rodzaje wymiaru w górnym menu):
  - komputer: elipsa – wybór sposobu pod menu, grupa Symbole w menu – pasek znika, powrót – wraca; Wymiary: Długość, Kąt,
    Promień, Średnica w menu, Kąt wybrany (podpowiedź kąta), bez dawnego wyboru; zaznaczony prostokąt przy zaznaczaniu –
    styl w trzecim menu także przy grupie Symbole;
  - komputer: pięć czerwonych prostokątów – sygnatury (rząd 1: warstwa 2 dla wszystkich, rząd 2: warstwa 3 dla trzech,
    warstwa 4 dla jednego), krycie 50% i nasycenie 0% sprawdzone pikselami, ukrycie warstwy 3 – trzy prostokąty znikają,
    stuknięcie ich nie zaznacza, „Zaznacz wszystko” – 2 elementy; nowa warstwa „Osie” jako warstwa nowych elementów
    (odcinek trafia na nią), usunięcie pustej warstwy 5; zapis (warstwy, ukrycie, warstwa nowych, sygnatury) i obraz
    w notatce (ukryte – puste, krycie 50%, szarość);
  - iPhone: panel warstw w szerokości ekranu bez przewijania w bok, rodzaje wymiaru w górnym menu.
- **Lint: bez błędów.**
- Zrzuty (Chromium): rodzaje wymiaru w menu, panel warstw z prostokątami, ukryta warstwa, panel na iPhonie.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy rysik i palce – gesty w testach są udawane w Chromium.
- Nasycenie zdjęcia i szablonu (tryb mieszania „saturation”) – sprawdzone tylko w testach logiki i kodzie; w przeglądarce
  testy nie robią strony ze zdjęciem z warstwami. W Safari ten tryb mieszania powinien działać, ale nie oglądałem.
- Ciemny motyw panelu warstw – nie oglądany.
