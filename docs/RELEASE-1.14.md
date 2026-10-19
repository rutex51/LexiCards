# LexiCards 1.14 – skala na linijce, własne kolory, zaznaczanie fragmentów i lasso, kopiuj i wklej

Wersja 1.14.0, 19 października 2026. W edytorze rysunku linijka dostała podziałkę w skali rysunku
i przyciąganie zera do przecięć i linii, pióro – własne kolory (siatka, suwaki RGB, pipetka),
zaznaczanie – fragmenty i lasso, a zaznaczenie – kopiuj i wklej. Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Treść notatki” – „rysunki”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Skala na podziałce linijki, współczynnik skali do rysunków w realnych proporcjach | Na linijce liczby w skali rysunku, od **zera na środku** w obie strony, z jednostką obok zera. Liczby wypadają co 1, 2 albo 5 × 10ⁿ jednostek (gęściej po powiększeniu), między nimi kreski co dziesiątą, piątą albo połowę – jak na zwykłej linijce. Skalę ustawiasz w panelu **Linijka i skala** (dotknięcie pigułki „Linijka …°” w rogu): **1 kratka = [liczba] [jednostka]** – mm, cm, m, km albo cale, stopy, jardy, mile. Skala zapisuje się z rysunkiem |
| Szacunek skali z wielkości ekranu | W panelu np. „Przy powiększeniu 100% kratka ma na tym ekranie ok. 6,3 mm – rysunek widać w skali ok. 1:400” (dla 1 kratka = 2,5 m; liczby zależą od skali, ekranu i powiększenia). **Skala 1:1 – kratka jak na ekranie** ustawia skalę tak, żeby linijka mierzyła to, co widać (w mm albo w calach) |
| Długość rysowanej linii | Kreska wzdłuż linijki pokazuje długość w skali przy rysiku, a po puszczeniu – w pigułce „Kreska: 12 m” |
| Odciąganie linijki do przecięcia linii | Zero przy krawędzi linijki przyskakuje do **przecięcia** dwóch kresek (kółko z kropką), a gdy przecięcia nie ma – do **linii** (kółko). Pigułka: „Linijka 90° · na przecięciu”, „· na linii”. Przyciąganie można wyłączyć w panelu |
| Zero na innej linii, linijka prostopadle | Gdy zero trafi na linię, a linijka jest prawie prostopadła (do 8°), ustawia się dokładnie prostopadle – zerem na linii („· prostopadle”). Przycisk **⊥** obok pigułki ustawia linijkę prostopadle do linii pod zerem z dowolnego kąta. Obrót uchwytem przy zerze na linii odbywa się wokół zera |
| Panel koloru własnego – siatka, suwaki RGB, pipetka | Na palecie pióra (i zakreślacza) przycisk **+** otwiera panel z trzema kartami: **Siatka** (12 odcieni w 6 jasnościach i szarości), **Suwaki** (R, G, B z kolorowym torem i pole HEX), **Pipetka** (dotknięcie albo przeciągnięcie po rysunku pobiera kolor spod palca, rysika albo kursora, także ze zdjęcia; lupa pokazuje powiększone miejsce). **Użyj koloru** – kolor narzędzia |
| Maks. 3 kolory do zapamiętania | Ostatnie trzy własne kolory są na palecie za zwykłymi (najnowszy pierwszy), także przy zakreślaczu i w oknie pola tekstowego i wzoru. Kolor z palety (np. pobrany pipetką czerwony) nie zajmuje miejsca wśród własnych |
| Skrzynka: od lewej jak teraz, od prawej – tylko piksele w środku | Prostokąt **od lewej do prawej** zaznacza kreski leżące w całości w środku (niebieski, linia ciągła), **od prawej do lewej** – tylko to, co w środku (zielony, kreskowany, „Fragment”): kreski są przecinane na brzegu prostokąta. **Usuń** usuwa wnętrze, przeciągnięcie przesuwa wycięty kawałek, **Powiel** i **Kopiuj** biorą samo wnętrze. Zdjęcie pod kreskami nie jest cięte; pole tekstowe i wzór są w zaznaczeniu tylko w całości |
| Lasso analogicznie; przeciwnie do wskazówek zegara – obiekty, zgodnie – wnętrze | Przy zaznaczaniu przełącznik kształtu **prostokąt / lasso**. Lasso **przeciwnie do ruchu wskazówek zegara** zaznacza kreski w całości w środku, **zgodnie** – tylko wnętrze (cięcie na obrysie). W trakcie obrysu kolor i podpowiedź w rogu pokazują, co zaznaczysz |
| Przełącznik jako dodatkowa opcja | Obok kształtu: **Auto** (według kierunku, jak wyżej), **Całe**, **Fragmenty** – zapamiętane na urządzeniu |
| Wszędzie, gdzie można, poza „Powiel” także kopiuj / wklej | Nad zaznaczeniem **Kopiuj** (obok Powiel i Usuń), przy zaznaczaniu na pasku **Wklej**; skróty Ctrl+C, Ctrl+V, Ctrl+X (Cmd na Macu). Wklejenie trafia na środek widocznej części strony, zaznaczone (kolejne – trochę niżej). Schowek działa **między rysunkami** i po ponownym otwarciu aplikacji (na tym urządzeniu); skopiowane kreski idą też jako obraz PNG do schowka systemu, gdy przeglądarka pozwala |

Szczegóły:

- **Zaznaczony fragment bez zmian nie zostawia śladu:** kreski są przecinane dopiero naprawdę przy
  przesunięciu albo usunięciu (jeden krok cofania razem z cięciem). Zdjęcie zaznaczenia (Esc,
  dotknięcie obok, inne narzędzie, **Gotowe**) przywraca całe kreski, bez kroku w historii.
- **Esc** najpierw zamyka otwarty panel (koloru, linijki, ustawień pióra), potem zdejmuje
  zaznaczenie, dopiero następny zamyka edytor. W polach panelu (liczba skali, kod HEX) klawisze
  Delete, Ctrl+C / Ctrl+V działają jak w zwykłym polu.
- **Telefon:** przy zaznaczaniu pasek ma trzy wiersze (napis „Wszystko” zamiast „Zaznacz wszystko”),
  polecenia nad zaznaczeniem – same ikony (Kopiuj, Powiel, Usuń). Panel koloru mieści się
  w szerokości ekranu.
- **Szacunek ekranu:** przeglądarka nie podaje fizycznej wielkości ekranu, więc aplikacja przyjmuje
  gęstość według urządzenia: iPhone 153–163 pikseli na cal, iPad 132 (iPad mini 163), Mac 127,
  komputer z Windows 96 (z powiększeniem ekranu – 110). Na laptopie z Windows wynik może się różnić
  o kilkanaście procent – to szacunek, nie pomiar.
- **Zapis:** skala jest w danych rysunku (`scale: { value, unit }`), w kopii zapasowej razem
  z kreskami; starszy rysunek ma skalę 1 kratka = 1 cm. Starsza wersja aplikacji skalę pomija.

## Testy, które wykonano

- **Testy logiki (Node.js): 285 – wszystkie zaliczone** (281 wcześniejszych + 4 nowe):
  - skala: sprawdzanie danych (zła liczba albo jednostka – 1 cm), liczby po polsku, długość
    w skali, szacunek na ekranie i skala 1:N zaokrąglona do dwóch cyfr („1:200”, „1:2 500”,
    „1:1,6”, przy powiększeniu „2:1”, „2,5:1”), skala 1:1 w wybranej jednostce;
  - przyciąganie linijki: przecięcie przed linią, punkt na linii z jej kierunkiem, kąt prostopadły
    najbliższy obecnemu, różnica kierunków;
  - obszar zaznaczania: kierunek obrysu (zgodnie / przeciwnie do wskazówek zegara na ekranie),
    punkt w wielokącie, całe kreski w lassie, cięcie kreski na brzegu (grubość w miejscu cięcia,
    zygzak wchodzący i wychodzący), pole tekstowe tylko w całości; zaznaczenie fragmentu bez zmian
    cofnięte bez kroku historii, przesunięcie fragmentu cofnięte jednym krokiem;
  - własne kolory: siatka HSL, RGB ↔ HEX, trzy zapamiętane bez powtórzeń, kolor pióra własny
    w ustawieniach, kształt i tryb zaznaczania, przyciąganie.
- **Testy w przeglądarce (Chromium): 125** (122 wcześniejsze + 3 nowe). Pierwszy pełny przebieg:
  124 zaliczone, 1 niezaliczony – „ekran lekcji i listy” (lista lekcji, nie rysunek): test czytał
  wiersze listy zaraz po przeładowaniu strony, zanim lista powstała. Ten sam test osobno – 6 razy
  zaliczony; poprawiony (czeka na wiersze po przeładowaniu) – 4 razy zaliczony. Drugi pełny
  przebieg: **125 z 125 zaliczonych**. Nowe testy, ekran iPada:
  - linijka: 30° uchwytem, przeciągnięcie – zero na linii („na linii”), obrót uchwytem wokół zera –
    przy 84° przyskok do 90° („prostopadle”), przy 60° już nie, **⊥** – znowu 90°; kreska rysikiem
    wzdłuż krawędzi (z drżeniem) – prosta, od linii, z długością w pigułce; panel: szacunek ekranu,
    **Skala 1:1** – jednostka mm i „skala ok. 1:1”, potem 1 kratka = 2,5 m – długość w metrach
    zgodna z zapisaną kreską; przesunięcie wzdłuż linii do przecięcia („na przecięciu”); Esc zamyka
    panel, nie edytor; skala w zapisanym rysunku;
  - kolory: siatka (84 pola) – kolor w podglądzie, „Użyj koloru” – pierwszy własny, wybrany; suwaki –
    kod #12AB34 ustawia R, G, B (18, 171, 52), suwak R = 200 zmienia kod na #C8AB34; pipetka –
    z grubej czerwonej kreski #D70015 (lupa w trakcie), nie rysuje, kolor z palety bez nowego
    własnego; po dwóch kolejnych kodach – trzy ostatnie; te same przy zakreślaczu; pole tekstowe
    w kolorze własnym; zapisane kolory kresek i pola;
  - zaznaczanie: prostokąt od prawej – „Fragment”, Usuń – znika tylko środek (cięcie na brzegu),
    cofnij – cała kreska; fragment zdjęty Esc – „Ponów” nadal dostępne; przesunięcie wyciętego środka,
    cofnij; prostokąt od lewej – nic (kreska wystaje); lasso przeciwnie do wskazówek – „1 kreska”,
    zgodnie – „Fragment”, Delete, Ctrl+Z; Kopiuj („Skopiowano”), Wklej, Ctrl+V, Ctrl+X („Wycięto”); fragment skopiowany Ctrl+C
    i wklejony po Esc – kreska źródłowa w całości, wklejony sam środek; schowek w drugim rysunku
    notatki.
  - telefon: pasek pióra i zaznaczania najwyżej w trzech wierszach, panel koloru w szerokości ekranu.
- **Lint: bez błędów.**
- Zrzuty (Chromium): linijka z liczbami i zerem na linii, panel „Linijka i skala” ze skalą 1:1
  (linijka w mm), zero na przecięciu, panel koloru – siatka, suwaki, pipetka z lupą (iPad i telefon),
  prostokąt i lasso zaznaczające fragment, wklejony fragment.

## Czego nie sprawdzono

- **Safari na iPadzie i iPhonie** – testy działają w Chromium z ekranem iPada (dotyk i zdarzenia
  rysika udawane), nie w Safari na iOS. Do sprawdzenia u Ciebie: pipetka i lupa pod Apple Pencil,
  lasso rysikiem, wybór jednostki (lista Safari), szacunek skali na Twoim iPadzie (132 piksele na
  cal) – najprościej przyłożyć prawdziwą linijkę po „Skala 1:1”.
- **Windows z rysikiem** – nie sprawdzano; szacunek skali na laptopie z Windows jest najmniej pewny.
- **Schowek systemu** (obraz PNG po „Kopiuj”) – w Chromium testowym zapis może być zablokowany i jest
  wtedy pomijany bez komunikatu; nie sprawdzano wklejania obrazu w innych aplikacjach.
- Przyciąganie do linii kratek i zamiana kształtów na figury – nadal etap 2 (po makietach).
