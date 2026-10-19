# LexiCards 1.12 – rysunki odręczne w notatce

Wersja 1.12.0, 19 października 2026. Etap 1 rysowania według zaakceptowanych makiet: rysunek jest
obrazem notatki, który można później poprawiać – pióro z naciskiem rysika, zakreślacz, gumka,
kolory, grubości, cofnij i ponów, tło strony, rysowanie na zdjęciu. Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Treść notatki” – „rysunki” i „Kopia zapasowa”).

## Co doszło

| Prośba / makieta | Jak jest zrobione |
| --- | --- |
| Rysunek przy obrazach notatki, z możliwością późniejszej edycji (wariant 1) | W sekcji **Obrazy** edytora notatki obok **Dodaj obraz** jest kafelek **Narysuj**. **Gotowe** dodaje rysunek jako obraz „Rysunek 1”, „Rysunek 2”… – miniatura z całą stroną i znaczkiem pióra. Dalej działa jak każdy obraz: sygnatura, `[[Rysunek 1]]` w tekście, powiększenie, przesuwanie, usuwanie. W menu rysunku pierwsza pozycja to **Edytuj rysunek** – otwiera go z kreskami do poprawy (zapisane są kreski, nie tylko obraz) |
| Edytor rysunku (makieta 1) | Okno na cały ekran: **Anuluj – Rysunek 1 – Gotowe**, pasek narzędzi na środku u góry: **pióro**, **zakreślacz**, **gumka**, kolory, trzy grubości (kropki), **cofnij**, **ponów**, **Tło: kratka / gładkie / linie**. W rogu pigułka „Rysuje tylko rysik · palec przesuwa” i powiększenie w procentach (dotknięcie – cała strona). Na telefonie pasek zawija się w dwa wiersze. **Anuluj** po zmianach pyta „Odrzucić zmiany w rysunku?” (**Rysuj dalej** / **Odrzuć**) |
| Siła nacisku (makieta 2) | Grubość kreski pióra zależy od nacisku rysika (Apple Pencil, rysik w laptopie z Windows). Drugie dotknięcie aktywnego pióra otwiera **ustawienia pióra**: czułość nacisku (**Wył.**, **Mała**, **Średnia**, **Duża**), grubość kreski **od – do** (przy lekkim i mocnym nacisku, dwa suwaki na jednym torze), **wygładzanie kreski** i podgląd „lekko – mocno – lekko”. Ustawienia, kolory i grubości zostają na urządzeniu. Palcem i myszą kreska ma stałą grubość |
| Rysik i palec | Gdy aplikacja raz zobaczy rysik, rysuje tylko rysik, a palec przesuwa stronę – dłoń oparta o ekran nie zostawia śladów, a w trakcie kreski rysikiem nie przesuwa też strony. Na iPhonie (bez rysika) rysuje palec. Dwa palce powiększają (do 600%) i przesuwają. Na komputerze mysz rysuje, kółko przesuwa, Ctrl + kółko powiększa; skróty Ctrl+Z, Ctrl+Shift+Z i Ctrl+Y. Gumka na końcu rysika (Windows) ściera bez zmiany narzędzia |
| Zakreślacz i gumka | Zakreślacz (żółty, zielony, różowy, niebieski) jest półprzezroczysty i mnożony z tłem – tusz pod spodem zostaje ciemny. Gumka ściera całe kreski; kreski starte jednym pociągnięciem to jeden krok cofania |
| Rysowanie na zdjęciu (makieta 4) | W menu zwykłego obrazu jest **Rysuj na zdjęciu**: zdjęcie zostaje pod spodem, kreski osobno (gumka nie ściera zdjęcia). Obraz zostaje w tym samym miejscu i z tą samą sygnaturą, więc odwołania w tekście działają dalej. Rysunek na zdjęciu zapisuje się jako JPEG, rysunek na stronie – jako PNG |

Szczegóły:

- **Strona rysunku** ma 1600 × 1100 punktów (poziomo, w proporcjach ekranu iPada i laptopa);
  na zdjęciu – wielkość zdjęcia, najwyżej 2048 px dłuższego boku (jak obrazy notatki).
- **Nowy pusty rysunek** („Gotowe” bez żadnej kreski) nie trafia do notatki.
- **Kopia zapasowa:** plik obrazów i załączników przenosi rysunek razem z kreskami
  (`rysunki/<id>.json`) i zdjęciem pod spodem (`rysunki/<id>-zdjecie…`) – na drugim urządzeniu
  rysunek da się dalej poprawiać. Plik danych ma przy obrazie znacznik rysunku. Starsza wersja
  aplikacji przywróci z tego pliku sam obraz (bez kresek do edycji).
- **Bez zmian:** podgląd notatki, powiększenie, eksport do XLSX i „Kopiuj notatkę” biorą obraz
  rysunku tak jak każdy obraz; kopia lekcji i „Cofnij” po usunięciu zachowują kreski.
- **Ikony:** „Zmień sygnaturę” ma teraz ikonę etykiety (jak na makiecie), żeby nie myliła się
  z ołówkiem „Edytuj rysunek”.
- **Nie w tym etapie** (etap 2, po akceptacji): zamiana odręcznych kształtów na figury
  (przytrzymanie rysika), uchwyty, zaznaczanie i przesuwanie kresek.

## Testy, które wykonano

- **Testy logiki (Node.js): 273 – wszystkie zaliczone** (264 wcześniejsze + 9 nowych):
  - grubość z nacisku dla czterech czułości, nacisk 0 (palec, mysz) – środek zakresu;
  - wygładzanie i zapis punktów (zaokrąglenie, bez powtórzeń), gumka (trafienie z grubością
    kreski, kolejność od wierzchu), historia: dodanie, gumka jako jeden krok, cofnij i ponów;
  - sprawdzanie danych rysunku: złe kreski, kolory, liczby, rozmiar strony 0, zdjęcie z bajtami
    i bez, duże zdjęcie – strona pomniejszona do 2048 px; ustawienia narzędzi; sygnatura „Rysunek N”;
  - rysunek w bibliotece: zapis z kreskami, znacznik w opisie, zmiana sygnatury bez utraty kresek,
    kopia lekcji z kreskami, „Cofnij” po usunięciu lekcji – rysunek wraca z kreskami, zwykły obraz
    bez kresek;
  - kopia zapasowa: znacznik w pliku danych przechodzi sprawdzanie, kreski i zdjęcie w ZIP (zdjęcie
    osobnym plikiem, nie w JSON), przywrócenie na nowym urządzeniu – kreski, tło i zdjęcie bez zmian.
- **Testy w przeglądarce (Chromium): 119 – wszystkie zaliczone w dwóch przebiegach**
  (117 wcześniejszych + 2 nowe):
  - ekran iPada (1180 × 820, dotyk): rysik z rosnącym naciskiem – kreska od cienkiej do grubej
    (grubości sprawdzone w zapisanych danych); mysz (prawdziwe zdarzenia przeglądarki) – stała
    grubość; palec po rysiku nie rysuje; dwa palce – 200%, pigułka wraca do 100%; dłoń przesuwana
    w trakcie kreski rysikiem nie przesuwa powiększonej strony; zielony zakreślacz, tusz pod nim
    ciemny; czerwona gruba kreska; gumka ściera całą kreskę, cofnij, ponów, Ctrl+Z; tło kratka →
    gładkie → linie; ustawienia pióra (czułość, suwak grubości – ten sam suwak w trakcie
    przesuwania, zapis na urządzeniu); miniatura ze znaczkiem, zapis notatki, rysunek w podglądzie
    w miejscu `[[Rysunek 1]]`; „Edytuj rysunek” – kreski i tło wracają, „Anuluj” pyta, „Rysuj dalej”,
    zapis z nową kreską;
  - ekran telefonu: „Narysuj” i „Gotowe” bez kreski – nic nie dochodzi; „Rysuj na zdjęciu” – zdjęcie
    pod kreskami, bez wyboru tła, palec rysuje (brak rysika), edytor mieści się w szerokości ekranu;
    rysunek w tym samym miejscu i z tą samą sygnaturą, JPEG, zdjęcie pod spodem bez zmian; kopia
    zapasowa – znacznik w pliku danych, kreski i zdjęcie w pliku ZIP, przywrócenie obu plików na
    drugim urządzeniu daje ten sam rysunek.
  - Rysik w testach to syntetyczne zdarzenia `PointerEvent` (`pointerType: 'pen'`, nacisk) – nie
    prawdziwy Apple Pencil. Kreski sprawdzane są po pikselach płótna i w danych w bazie.
- **Lint: bez błędów.**
- Sprawdzone w drugą stronę: bez poprawki „dłoń nie przesuwa strony” test nie przechodzi.
- W trakcie pracy testy wyłapały: Ctrl+Z nie działał, gdy fokus zniknął z okna (np. po „Ponów”,
  które stało się nieaktywne) – skróty działają teraz w całym oknie rysunku; suwaki ustawień pióra
  przebudowywane przy każdym ruchu (przeciąganie by się urywało) – teraz panel powstaje raz;
  rysunek o zerowym rozmiarze nie był odrzucany.
- Zrzuty (Chromium): edytor i ustawienia pióra na ekranie iPada (jasny i ciemny motyw), pasek
  na telefonie, miniatura i menu rysunku, podgląd notatki z rysunkiem, rysunek na zdjęciu.

## Uzupełnienie w wersji 1.12.1

| Prośba | Jak jest zrobione |
| --- | --- |
| Gumka – drugi tryb: zamazywanie fragmentów, nie całych obiektów; kilka wielkości | Po wybraniu gumki na pasku jest przełącznik **Całe kreski / Fragmenty** i – dla fragmentów – cztery wielkości (kółka: mała, średnia, duża, bardzo duża). Gumka fragmentów ściera tylko to, czego dotknie: kreska dzieli się na części, a reszta zostaje (dalej da się ją zaznaczyć, przesunąć, cofnąć). Pod myszą i zawieszonym rysikiem widać kółko gumki. Zdjęcie pod kreskami zostaje nietknięte. Wielkość gumki jest stała na ekranie – po powiększeniu strony ściera dokładniej. Tryb i wielkość zostają zapamiętane |
| Linijka z kątem pochylenia, sterowana palcami albo myszą | Przycisk **linijki** na pasku. Na środku linijki i w pigułce w rogu – kąt (0–179°). Jeden palec albo mysz przesuwa linijkę, dwa palce ją obracają (i przesuwają), a mysz obraca ją okrągłymi uchwytami na linijce. Przy 0°, 45°, 90° i 135° linijka lekko przyskakuje. Kreska rysikiem, myszą albo palcem zaczęta na linijce albo przy niej biegnie prosto wzdłuż bliższej krawędzi (z naciskiem rysika). Linijka nie jest częścią rysunku |
| Skrzynka do zaznaczania kilku obiektów | Narzędzie **zaznaczanie**: prostokąt zaznacza kreski leżące w nim w całości, dotknięcie kreski – tę jedną, **Zaznacz wszystko** (albo Ctrl+A) – wszystkie. Nad ramką zaznaczenia: liczba kresek, **Powiel** i **Usuń** (też Delete). Przeciągnięcie wewnątrz ramki przesuwa zaznaczone kreski – rysikiem, myszą i palcem. Esc zdejmuje zaznaczenie (dopiero następne zamyka edytor). Każda zmiana to jeden krok cofania |

Przy okazji: pasek narzędzi leży teraz nad płótnem – zmiana narzędzia (na telefonie pasek bywa
o wiersz wyższy) nie przesuwa strony.

**Dociąganie szkicu do linii kratek** – zostaje do etapu 2, razem z zamianą odręcznych kształtów na
figury: to ta sama mechanika (wierzchołki rozpoznanej figury przyciągane do przecięć kratek,
odcinki – do linii kratek).

Testy wersji 1.12.1:

- **Testy logiki (Node.js): 277 – wszystkie zaliczone** (273 wcześniejsze + 4 nowe): gumka
  fragmentów (dziura na brzegu koła, przecięcie między rzadkimi punktami, grubość w miejscu cięcia,
  kropka, cała kreska, okruchy bez kropek, skrzyżowane kreski), zaznaczanie prostokątem, granice
  i przesunięcie bez zmiany oryginału, kąt linijki (przyskok co 45°, stopnie 0–179, położenie punktu
  względem linijki), historia jako stany przed i po zmianie; ustawienia gumki.
- **Testy w przeglądarce (Chromium): 121 – wszystkie zaliczone w dwóch przebiegach** (119
  wcześniejszych + 2 nowe):
  - ekran iPada: gumka fragmentów – tryb, cztery wielkości, kółko pod myszą, dotknięcie przecina
    kreskę (obie części zostają), cofnij i ponów, zapamiętane ustawienia; linijka – 0°, dwa palce:
    30°, potem przyskok do 45°, uchwyt myszą: 90°, mysz przesuwa linijkę, kreska rysikiem 40–48 px od
    środka biegnie prosto wzdłuż krawędzi (w zapisie jedno x), linijka schowana; zaznaczanie –
    prostokąt (1 i 2 kreski), przesunięcie, powielenie, usunięcie, trzy cofnięcia i ponowienie,
    dotknięcie kreski, Ctrl+A, „Zaznacz wszystko”, Esc nie zamyka edytora; zapis – 5 kresek, dwa
    kawałki przeciętej kreski;
  - ekran telefonu bez rysika: pasek każdego narzędzia w szerokości ekranu (pióro – dwa wiersze),
    płótno bez zmian przy zmianie narzędzia; palec przesuwa linijkę, kreska palcem przy krawędzi –
    prosta; zaznaczenie palcem i przesunięcie palcem.
- **Lint: bez błędów.**
- W trakcie pracy testy wyłapały: strona przeskakiwała przy zmianie narzędzia na telefonie
  (pasek o inną liczbę wierszy) – teraz pasek leży nad płótnem.
- Zrzuty (Chromium): gumka fragmentów, linijka pod kątem 45°, zaznaczenie z poleceniami (iPad),
  linijka i zaznaczenie na telefonie.

## Czego nie sprawdzono

- **Prawdziwy rysik:** Apple Pencil na iPadzie (Safari) i rysik w laptopie z Windows – nacisk,
  odrzucanie dłoni, gumka na końcu rysika i płynność rysowania trzeba sprawdzić na urządzeniu.
  Testy działają w Chromium z udawanymi zdarzeniami rysika.
- **Safari na iPadzie i iPhonie** – gesty dwoma palcami, przewijanie i powiększanie strony przez
  Safari w oknie rysunku; zachowanie po obróceniu ekranu.
- **Duże rysunki** (tysiące kresek) – szybkość na starszym iPadzie.
- Testem nie są objęte: kółko myszy i Ctrl + kółko, gumka na końcu rysika (Windows) – działanie
  jest w kodzie, ale bez sprawdzenia w przeglądarce.
- Od 1.12.1: obracanie linijki dwoma palcami i przesuwanie zaznaczenia palcem na prawdziwym iPadzie
  (w testach – udawane zdarzenia dotyku); szybkość gumki fragmentów przy bardzo dużych rysunkach.

## Warto wiedzieć

- Ustawienia pióra otwiera **drugie dotknięcie** aktywnego pióra (jak w aplikacjach Apple).
- Pigułka „Rysuje tylko rysik · palec przesuwa” pojawia się po pierwszym dotknięciu rysikiem i od
  tej chwili palec na tym urządzeniu tylko przesuwa stronę.
- Na telefonie strona rysunku jest mała – do szkiców palcem; wygodniej rysuje się na iPadzie albo
  laptopie.
