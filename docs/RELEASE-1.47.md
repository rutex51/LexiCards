# LexiCards 1.47 – bryły: obrót w przestrzeni, kostka widoków, krawędzie niewidoczne, wymiary

Wersja 1.47.0, 25 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Bryły”).

Pierwszy etap rysunku przestrzennego (zgodnie z propozycją i makietami). Numer 1.46 zostaje dla wykresów z tabel.
Następny etap – 1.48: szkic → wyciągnięcie / obrót wokół osi, historia modelu, rzuty 2D.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| Grupa **Bryły** | Nowa grupa na prawym kółku: **prostopadłościan**, **walec**, **stożek** (ostry albo ścięty), **ostrosłup**, **graniastosłup** foremny (3–12 boków), **kula**. Dotknięcie wstawia bryłę na środku widocznej części strony (pod innymi elementami, gdy tam zajęte) – w izometrii, cieniowaną, z wymiarami i osiami. |
| Kostka widoków | Przy zaznaczonej bryle, obok ramki (jak kostka w programach CAD). **Przeciągnięcie kostki obraca bryłę swobodnie** – w każdą stronę, także od spodu i do góry nogami; z Shift – tylko wokół osi pionowej bryły i pochylenie. **Dotknięcie ściany** (PRZÓD, GÓRA, PRAWA…) – płynne przejście do tego widoku. Bryła zostaje w miejscu. |
| **Obracaj** | Przycisk nad zaznaczoną bryłą: przeciąganie samej bryły (palcem, rysikiem, myszą) obraca ją zamiast przesuwać – większy obszar niż kostka. Ponowne dotknięcie – koniec. Dotknięcie bryły bez ruchu – jej okno. |
| **Widok** | Menu nad zaznaczoną bryłą: izometria, dimetria, przód, góra, z lewej, z prawej, tył, dół (bieżący zaznaczony). |
| Okno bryły | Dotknięcie zaznaczonej bryły: **rodzaj** (zmiana bez wstawiania od nowa), **wymiary** w jednostce rysunku (np. mm), **położenie** – obrót wokół osi pionowej, pochylenie, obrót na kartce – i gotowe widoki, **krawędzie niewidoczne** (przerywane, ukryte, widoczne), **cieniowanie**, **wymiary**, **osie symetrii**, grubość linii i kolor. |
| Rysunek techniczny | Rzut prostokątny. Krawędzie niewidoczne – cienka linia przerywana, osie – linia punktowa, wymiary – jak przy kształtach: krawędzie prostopadłościanu, wysokość wzdłuż osi, średnice ⌀ i S⌀ kuli, liczby w skali i jednostce rysunku („Wymiary w mm”). |
| Na kartce | Bryła jest zwykłym elementem: przesuwanie, narożnik – wielkość (proporcjonalnie), uchwyt obrotu nad ramką – obrót na kartce, **Odbij** (lustrzane położenie), **Skaluj**, **Styl jak…**, kolor z menu, warstwy, kolejność, kopiuj, cofnij. Widać ją na obrazie w notatce i w PDF. |
| DXF | Rzut bryły: krawędzie liniami, niewidoczne – rodzaj linii DASHED, osie – CENTER, wymiary z grotami i liczbą. |

Zmiany przy okazji:

- Na ekranie dotykowym dotknięcie elementu, które otwiera jego okno (bryła, tabela, diagram), nie „klika” już potem w okno pod
  palcem (przeglądarka po dotknięciu wysyłała jeszcze kliknięcie w to samo miejsce – na telefonie zmieniało np. rodzaj bryły).
- Format rysunku **18** (bryły); starsza wersja aplikacji pominie je przy zapisie.

## Testy, które wykonano

- **Testy logiki (Node.js): 481 – wszystkie zaliczone** (8 nowych: bryła – sprawdzanie danych, wymiary w granicach,
  kwaternion jednostkowy; kąty ↔ położenie, gotowe widoki, płynne przejście, obrót z przeciągnięcia swobodny i wokół pionu,
  bez ograniczeń (do góry nogami); siatki – ściany na zewnątrz, krawędzie ostre i gładkie, łamane; rzut – liczba krawędzi
  widocznych i niewidocznych w widokach, wymiary rzutów (prostokąt, okrąg), kula; osie i wymiary – wartości, średnice,
  liczby w mm i z jednostką, części wymiaru; element na kartce – prostokąt, dotknięcie, przesunięcie, rozkład po poprawce,
  oznaczenie jednostki; obrót na kartce, odbicia (w poziomie, w pionie, względem prostej – rzut lustrzany sprawdzony
  współrzędnymi), skala, styl; zapis (format 18), DXF – liczby, DASHED, CENTER; grupa Bryły).
- **Testy w przeglądarce (Chromium): 220 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe):
  - komputer: grupa Bryły; prostopadłościan – izometria w oknie; przeciągnięcie kostki obraca (środek bryły w miejscu); menu
    „Widok” – izometria; ściana GÓRA kostki – widok z góry; „Obracaj” – poziomy ruch obraca wokół pionu, bryła nie
    przesunięta; okno – zmiana na walec 5 × 6 cm, dimetria, obrót na kartce 15°, bez krawędzi niewidocznych i cieniowania;
    odbicie w poziomie (kąty z przeciwnym znakiem); sześć brył na kartce; zapis (wymiary w jednostkach strony, kąty) i DXF
    (DASHED, CENTER, liczba „6 cm”);
  - iPad (dotyk): kostka przeciągnięta palcem obraca stożek; ściana PRZÓD – widok z przodu; „Obracaj” palcem;
  - telefon (390 px): pozycje grupy na ekranie, kostka w szerokości ekranu, okno bryły bez przewijania w bok, dotknięcie bryły
    nie zmienia rodzaju w oknie.
  - Poprawione starsze testy: numer formatu rysunku (18), listy grup na kółku i w oknie „Grupy narzędzi” (Bryły na końcu),
    historia zmian (1.46 zarezerwowana; wydanie 1.47.0 w historii jako „1.47”).
  - Błędy wykryte przez te testy i poprawione: dotknięcie bryły na telefonie „klikało” w otwarte okno; w trybie „Obracaj”
    dotknięcie bez ruchu nie otwierało okna; przycisk „Obracaj” pokazywał stan dopiero po następnej klatce.
- **Lint: bez błędów.**
- Zrzuty (Chromium): sześć brył na kartce, prostopadłościan z kostką widoków, obrót palcem (iPad), okno bryły (komputer
  i telefon), telefon.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy palec i Apple Pencil – dotyk udawany zdarzeniami Chromium.
- Szybkość obracania na prawdziwym iPadzie (w Chromium klatka bez opóźnień).
- Plik DXF w programie CAD – sprawdzony odczytem z powrotem w aplikacji.
- Ciemny motyw.
- Bryły nachodzące na siebie: każda rysuje się osobno (kolejność rysowania), krawędzie niewidoczne jednej nie uwzględniają
  drugiej – tak jak w propozycji.
