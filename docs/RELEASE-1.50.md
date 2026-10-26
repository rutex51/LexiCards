# LexiCards 1.50 – układ współrzędnych arkusza

Wersja 1.50.0, 26 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Układ współrzędnych
arkusza”).

Pierwszy etap planu „Wspólny układ osi, pełna scena 3D”: jeden układ współrzędnych dla całej kartki – arkusz ma początek
w lewym dolnym rogu, X w prawo, Y w górę, a osie brył są z nim zgodne (jak w programach CAD i na maszynach pomiarowych).
Liczby to wymiary przedmiotu w skali rysunku. Scena 3D (bryły na arkuszu w przestrzeni) – w kolejnych wydaniach.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **„Kratka: …” otwiera panel** | Pastylka skali w lewym dolnym rogu jest teraz przyciskiem – otwiera **Linijka i skala** także bez linijki na stronie. |
| **Układ współrzędnych arkusza** | W panelu **Linijka i skala** przełącznik **Układ współrzędnych arkusza (X, Y)** (zapamiętany na urządzeniu; domyślnie wyłączony – kto go nie potrzebuje, nie widzi zmian). Włączony: w początku układu osie – **X** czerwona w prawo, **Y** zielona w górę, **Z** (z arkusza do Ciebie) – niebieskie kółko z kropką. |
| Początek | W lewym dolnym rogu **arkusza** (z ramką A4 / A3 – arkusza wpasowanego w kartkę) albo **kartki** (bez ramki). **Przesuń początek…** – dotknij punktu (narożniki, krawędzie, środki przyciągają; Esc – bez zmian), **Początek w rogu** – z powrotem. Opis w panelu: „Początek przesunięty: X 20,0 · Y 80,0 mm od lewego dolnego rogu kartki”. |
| **Współrzędne pod kursorem** | Pastylka „X 103,2 · Y 36,7 mm” nad „Kratka”: pod myszą i zawieszonym rysikiem, palcem – w trakcie rysowania (koniec kształtu, punkt łuku, przeciągany uchwyt; z przyciąganiem – dokładnie w miejscu przyciągnięcia). Dotknięcie pastylki – panel z początkiem. |
| Liczby | Wymiary przedmiotu w **skali rysunku**, w jednostce liczb wymiarów: styl „50” – mm (albo wybrana: cm, m, cale), styl „5 cm” – jednostka skali. Miejsca po przecinku: mm – 1, cm – 2, m i cale – 3. Współrzędne i wymiary zgadzają się ze sobą. |
| **Punkt X, Y** | Przy kształtach przycisk po prawej na dole: okno punktów wpisanych liczbami. Kształt z przeciągnięcia (odcinek, strzałka, prostokąt, elipsa, okrąg ze środka albo z 2 punktów, wielokąt foremny, wymiar liniowy, ⌀, R…) – dwa punkty naraz („Początek / Koniec”, „Środek / Punkt na okręgu”, „Narożnik / Narożnik naprzeciwko”), jak przeciągnięcie. Łamana, okrąg przez 3 punkty, łuk i kąt – punkt po punkcie (okno zostaje; łamana – **Zakończ łamaną** albo **Zamknij w wielokąt**). Punkt – jeden. Puste pole – 0; punkt poza kartką – komunikat w oknie (nowe elementy powstają tylko na kartce). |
| **Położenie** | Nad zaznaczonym (przy włączonym układzie): okno z X i Y – odcinek, strzałka, prosta, półprosta, łącznik i wymiar: **początek i koniec** (końce odklejają się od elementów); okrąg, elipsa, łuk, wielokąt foremny, punkt i bryła: **środek**; reszta i kilka elementów: **lewy dolny róg obrysu** – zaznaczone przesuwa się tak, by ten punkt był w podanym miejscu. Jeden krok cofania. |
| **DXF** | Punkt (0, 0) pliku to początek układu – współrzędne w programie CAD są te same co w aplikacji. Bez ramki i bez przesunięcia – jak dotąd (lewy dolny róg kartki); z ramką – od rogu arkusza. |
| **Osie brył jak w CAD** | Układ osi przy bryle wspólny z arkuszem: w izometrii **X w prawo w dół, Y w prawo w górę** (w głąb), Z do góry; **przód** – od strony −Y (X w prawo, Z w górę), **z góry** – X w prawo, Y w górę (jak kartka i szkic na XY), **z lewej** – od −X. Zmieniły się tylko nazwy osi: zapisane bryły i ich widoki wyglądają jak dotąd; wymiary prostopadłościanu a, b, c – wzdłuż X, Y, Z. |

Zmiany przy okazji:

- Format rysunku **22** (przesunięty początek układu); starsza wersja aplikacji go pominie (początek w rogu).
- Wymiary bryły w zapisie bez zmian; starsze rysunki wczytują się bez przeliczeń.
- Test dźwięków 1.31 czeka, aż Ustawienia narysują się drugi raz (po policzeniu zajętego miejsca) – w pierwszym przebiegu
  tego wydania raz dotknął przełącznika w chwili przerysowania („Element is not attached to the DOM”). Wyścig był w teście,
  nie w aplikacji.
- Nowy test 1.50 (komputer) w jednym z pełnych przebiegów odczytał położenie osi przed ich przerysowaniem po „Przesuń
  początek…” – teraz czeka na nową klatkę. Oba wyścigi poprawione przed dwoma pełnymi przebiegami opisanymi niżej.

## Jak to działa (w skrócie)

- Moduł `js/core/sheet-coords.js`: punkt strony → współrzędne arkusza (odwrócona oś y, mnożnik skali i jednostki wymiarów)
  i z powrotem; początek – róg arkusza z ramki (ta sama geometria co rysowana ramka) albo zapisany punkt.
- „Punkt X, Y” nie ma własnej geometrii kształtów: wpisane punkty idą tą samą drogą co przeciągnięcie albo dotknięcie
  (te same kształty, te same podpowiedzi, cofanie jednym krokiem).
- Osie brył: tylko inne przypisanie etykiet do osi bryły (X = x, Y = −z, Z = y); kwaterniony, siatki i widoki – bez zmian.

## Własność intelektualna

Kartezjański układ współrzędnych z początkiem w rogu arkusza, wpisywanie punktów liczbami, współrzędne pod kursorem
i nazwy osi jak w programach CAD i normach rysunku technicznego to ogólna, powszechna praktyka (od dziesięcioleci
w programach CAD i maszynach pomiarowych) – bez cudzego kodu i bibliotek. Nazwy w interfejsie są opisowe („Układ
współrzędnych arkusza”, „Punkt X, Y”, „Położenie”, „Przesuń początek…”), bez nazw handlowych. Osie rysowane własnym kodem
na płótnie (bez „kostki widoków” ani innych rozpoznawalnych elementów cudzych programów).

## Testy, które wykonano

- **Testy logiki (Node.js): 502 – wszystkie zaliczone** (4 nowe, 1 zmieniony):
  - początek: bez ramki – lewy dolny róg kartki, ramka A4 i A4 pionowo – róg arkusza wpasowanego w stronę, przesunięty
    – zapisany punkt; kierunki X w prawo, Y w górę;
  - liczby: 1 kratka = 1 cm → mm (technicznie), cm (styl „5 cm”), m przy skali 2,5 m, cale; „X 100,0 · Y 50,0 mm”,
    „X 10,00 · Y 5,00 cm”, „X 25,000 · Y 12,500 m”, „X 10,000 · Y 5,000 in”; w obie strony (też z przesuniętym początkiem);
    minus typograficzny, bez „−0”;
  - opis początku (kartka, arkusz, przesunięty), zapis: format 22, zaokrąglenie do setnych, przycięcie do kartki, zły
    początek pominięty; ustawienie na urządzeniu (domyślnie wyłączone);
  - DXF: bez ramki – jak dotąd (odcinek 25–125 mm, zakres od 0, 0), z ramką A4 – od rogu arkusza (zakres z ujemnym X),
    przesunięty początek w początku odcinka – odcinek od (0, 0) do (100, 0);
  - osie brył (zmieniony test 1.48.1–1.50): przód – X w prawo, Z w górę, Y od patrzącego; z góry – X w prawo, Y w górę;
    z lewej – X od patrzącego; izometria – X w prawo w dół, Y w prawo w górę, Z w górę; szkic na XY – X = 100, Y = 40.
- **Testy w przeglądarce (Chromium): 230 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe, 3 testy brył
  z poprawionymi kierunkami osi):
  - komputer: bez układu – bez pastylki i osi; „Kratka” → panel, styl „50”, włącznik, opis „Początek w lewym dolnym rogu
    kartki”; osie w lewym dolnym rogu kartki (co do 2 px); mysz 10 kratek w prawo i 5 w górę – „X 100 · Y 50 mm”
    (±0,6 mm); odcinek z „Punkt X, Y” (20; 30) – (120; 30); „Położenie” – 20,0 / 30,0 / 120,0 / 30,0, nowy początek (20; 80);
    łamana z trzech wpisanych punktów i „Zakończ łamaną” (długość 90 mm); punkt poza kartką – komunikat; „Przesuń
    początek…” dotknięciem przy końcu odcinka (przyciągnięty) – osie w nowym miejscu, koniec odcinka „X 100 · Y −50”; opis
    „Początek przesunięty: X 20,0 · Y 80,0 mm…”; zapis (początek 88, 748; format 22; odcinek; łamana) i DXF – odcinek od (0, 0)
    do (100, −50);
  - iPad (dotyk): włącznik palcem, styl „5 cm” – „X – · Y – cm”; okrąg ze środka palcem – w trakcie przeciągania pastylka
    pokazuje miejsce pod palcem (ok. X 13 · Y 10 cm); okrąg ze środka (5; 5) przez (7; 5) z „Punkt X, Y”; „Położenie” – środek 5,00 / 5,00, przesunięcie
    do X 10;
  - telefon (390 px): panel z włącznikiem i „Przesuń początek…” w szerokości ekranu, pastylka współrzędnych i „Punkt X, Y”
    na ekranie, okno punktów bez przewijania w bok (cztery pola w szerokości ekranu), prostokąt z wpisanych punktów;
  - bryły 1.47, 1.48.2, 1.49 (komputer, iPad, telefon): kierunki osi W1 – izometria, z góry, z przodu, po pochyleniu palcem.
- **Lint: bez błędów.**
- Zrzuty (Chromium): panel z układem, osie i współrzędne, okno punktów odcinka, łamana punkt po punkcie, przesunięty
  początek, iPad – palec i „Położenie”, telefon – ekran, panel i okno punktów.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec, rysik zawieszony nad ekranem (Apple Pencil hover) – dotyk i mysz udawane
  zdarzeniami Chromium. Bez myszy i bez zawieszonego rysika współrzędne widać tylko w trakcie rysowania.
- Plik DXF z przesuniętym początkiem w programie CAD – sprawdzony odczytem z powrotem w aplikacji.
- Bryły nie mają jeszcze położenia X, Y, Z w układzie arkusza – „Położenie” bryły to środek jej obrazka na kartce
  (położenie w przestrzeni i scena 3D – kolejne wydania).
- „Punkt X, Y” – bez okręgu stycznego i wymiaru długości łuku (te wskazuje się dotknięciem elementu). Punkty wpisane
  liczbami nie przyklejają się do elementów (jak swobodne końce).
- „Położenie” łamanej i wielokąta – lewy dolny róg obrysu (bez wierzchołka po wierzchołku). Obrócony prostokąt – też róg
  obrysu, nie narożnik.
- Ciemny motyw.
