# LexiCards 1.33 – grupy narzędzi: dobór, gotowe zestawy, własne grupy

Wersja 1.33.0, 22 października 2026. Druga część przebudowy interfejsu edytora rysunku – personalizacja
kółek narzędzi według makiety „Grupy narzędzi” (płótno „Rysunek – nowy interfejs”). Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Interfejs edytora rysunku”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Narzędzie do personalizacji grup | Ostatnie małe kółko na **obu** kółkach (ikona suwaków, przerywana obwódka) otwiera okno **„Grupy narzędzi”**. Zmiany obowiązują po **Gotowe**, **Anuluj** zostawia grupy bez zmian; dobór jest zapamiętany na urządzeniu (jak kolory i schowane elementy). |
| Prawe kółko – narzędzia standardowe | Sekcja „Kółko po prawej – narzędzia standardowe”: przy każdej grupie (Pisanie, Kształty, Konstrukcja, Tekst i wzory, Symbole metrologiczne) **pole zaznaczenia** – czy jest na kółku – i uchwyt **≡** – kolejność na kółku (przeciągnięcie palcem, rysikiem albo myszą; klawiaturą – strzałki w górę i w dół na uchwycie). Na kółku zostaje co najmniej jedna grupa (ostatnie zaznaczone pole jest zablokowane). |
| Gotowe zestawy jak Metrologia | Sekcja „Gotowe zestawy”: **Metrologia** (odcinek, prosta, punkt, ramka tolerancji, baza, chropowatość), **Szkic odręczny** (pióro, gumka, strzałka), **Geometria** (odcinek, elipsa, prosta, punkt), **Notatki** (tekst, wzór, karteczka, zakreślacz). Dotknięcie dodaje zestaw jako grupę lewego kółka (✓), ponowne – usuwa ją. |
| Lewe kółko – grupy użytkownika | Sekcja „Kółko po lewej – moje grupy”: lista grup z narzędziami, **Edytuj** (dotknięcie wiersza) i ≡ – kolejność; **+ Nowa grupa**. Pod listą – edytowana grupa: **nazwa**, **ikona** (8 do wyboru), **narzędzia** według grup standardowych; kolejność dotknięć to kolejność w górnym menu (numer przy nazwie), **Usuń grupę**. Najwyżej 8 grup po 12 narzędzi. Pusta grupa czeka w oknie – na kółku jej nie ma. |
| (przy okazji) | Okno otwarte z lewego kółka pokazuje do edycji jego ostatnią grupę. Lewe kółko bez grup ma duże kółko z **plusem** – dotknięcie otwiera okno. Gdy pokazanej grupy już nie ma (usunięta albo schowana), menu pokazuje grupę z bieżącym narzędziem. Narzędzia z dodanego zestawu można potem zmienić – grupa jest już Twoja. |

Wymiar jako osobne narzędzie (makieta miała grupę „Wymiary” i wymiar w zestawie Metrologia) dojdzie
razem z nowymi narzędziami konstrukcji w następnej wersji – wtedy będzie też do wyboru w oknie grup.

## Testy, które wykonano

- **Testy logiki (Node.js): 393 – wszystkie zaliczone** (390 wcześniejszych + 3 nowe): gotowe
  zestawy (znane pozycje bez powtórzeń, ikony, nazwy pozycji); dobór z pamięci urządzenia (kolejność,
  nowe grupy standardowe na końcu, co najmniej jedna widoczna, sprawdzone własne grupy – id, nazwa,
  ikona, pozycje, granice 8 / 12 / 30, ustawienia sprzed 1.33 – Metrologia); grupy na kółkach przy własnym
  doborze (bez schowanych, bez pustej grupy) i grupa na starcie.
- **Testy w przeglądarce (Chromium): 186 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (184 wcześniejsze + 2 nowe):
  - iPad: ostatnie małe kółko otwiera okno; Anuluj – bez zmian; Symbole odznaczone, Tekst na początek
    strzałkami na uchwycie (fokus zostaje), Konstrukcja przeciągnięta ≡ myszą o dwa wiersze w górę;
    po odznaczeniu trzech grup czwarta zablokowana; Geometria dodana (otwiera się do edycji), Metrologia
    usunięta; nowa grupa „Ulubione” z ikoną i trzema narzędziami (numery 1–3); po Gotowe – prawe kółko
    w nowej kolejności bez Symboli, lewe – Geometria i Ulubione, menu Ulubionych w kolejności wyboru,
    zapis w pamięci urządzenia; po ponownym otwarciu edytora – to samo; usunięcie pokazanej grupy z okna
    otwartego z lewego kółka – menu wraca do „Pisanie”;
  - iPhone: okno bez przewijania w bok; bez Metrologii lewe kółko nie ma grup – duże kółko z plusem
    otwiera okno; zestaw Notatki – grupa na lewym kółku, pierwsze narzędzie (zakreślacz) wybrane.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno na iPadzie (grupy standardowe i zestawy), edycja własnej grupy, kółka z własną
  grupą, okno na iPhonie, lewe kółko z zestawem Notatki na iPhonie.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy rysik i palce – przeciąganie ≡ w oknie jest sprawdzone
  tylko myszą w Chromium (palcem i rysikiem działa ten sam kod co na listach biblioteki od 1.16).
- Czytnik ekranu (VoiceOver) w nowym oknie – nie sprawdzony.
- Ciemny motyw okna – nie oglądany.
