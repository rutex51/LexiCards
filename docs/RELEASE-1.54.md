# LexiCards 1.54 – płaszczyzny szkicu i rzuty sceny

Wersja 1.54.0, 26 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Płaszczyzny szkicu i rzuty
sceny”).

Piąty etap planu „Wspólny układ osi, pełna scena 3D” (po 1.50 – układ arkusza, 1.51 – scena 3D, 1.52 – położenie brył,
1.53 – pomiary 3D): bryła ze szkicu nie musi już leżeć płasko na arkuszu – szkic może być pionowy (widok z przodu albo
z boku) albo poziomy na wybranej wysokości. Druga część: rzuty całej sceny – wszystkie bryły razem, z krawędziami, które
zasłania inna bryła.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Na płaszczyźnie…** | Nowy przycisk na pasku zaznaczenia obok **Wyciągnij** i **Obróć wokół osi** (zaznaczone kształty z co najmniej jednym zamkniętym). Otwiera okno **Bryła na płaszczyźnie**: płaszczyzna, rodzaj bryły (**Wyciągnij** / **Obróć wokół osi**), położenie płaszczyzny i podpowiedź, jak czytać szkic. **Utwórz** – bryła jak z „Wyciągnij” albo „Obróć wokół osi” (szkic zostaje w bryle). |
| **XY – poziomo** | Szkic leży poziomo jak dotąd, ale na wysokości **Z** z okna (0 – na arkuszu); wyciągnięcie w górę. Wysokość nie może być ujemna. |
| **XZ – przód** | Kształty na kartce to **widok z przodu**: w prawo X, w górę Z. Bryła stoi na arkuszu, szkic leży w pionowej płaszczyźnie **Y =** liczba z okna, wyciągnięcie idzie do przodu (w stronę −Y, do patrzącego – jak w programach CAD). Przykład: profil L wyciągnięty w głąb – stojący wspornik. Obrazek na kartce na start – widok z przodu. |
| **YZ – bok** | Kształty na kartce to **widok z prawego boku**: w prawo Y, w górę Z. Szkic w płaszczyźnie **X =** liczba z okna, wyciągnięcie w prawo (+X). Obrazek na start – widok z prawego boku. |
| Położenie płaszczyzny | Liczba w mm przedmiotu w skali rysunku (jak współrzędne z 1.50). Na start – tak, by bryła stała tam, gdzie leży szkic (obrazek bryły w miejscu szkicu). Okno pamięta ostatnio wybraną płaszczyznę. |
| Bryła obrotowa | Oś obrotu leży w płaszczyźnie szkicu i ma kierunek z rysunku – np. na XZ oś pionowa daje bryłę stojącą (wazon, tuleja), pozioma – leżącą wzdłuż X. Pomiar osi (1.53), osie i wymiar długości wyciągnięcia na obrazku działają we właściwym kierunku na każdej płaszczyźnie. |
| **Edytuj szkic** | Szkic bryły z płaszczyzny pionowej wraca na kartkę, a okno **Na płaszczyźnie…** startuje z jej płaszczyzną (komunikat podpowiada, np. „(YZ)”). |
| **Rzuty** w scenie | Nowy przycisk w pasku sceny 3D. Rzuty **wszystkich brył** w ich położeniu ze sceny (X, Y, Z, obrót, bryła na bryle): **przód**, **góra** pod przodem i **lewy bok** na prawo od przodu (metoda europejska, jak rzuty jednej bryły z 1.48). Krawędzie zasłonięte – także przez **inną bryłę** – linią przerywaną; osie walców, stożków, graniastosłupów, ostrosłupów i brył obrotowych – linią osiową (w widoku wzdłuż osi – krzyżyk); kula – okrąg z krzyżykiem. Na telefonie **Pomiar** i **Rzuty** w pasku sceny to same ikony (nazwa w podpowiedzi i dla czytnika ekranu), żeby pierwsze widoki mieściły się na ekranie. |
| Gdzie trafiają rzuty | Gdy rysunek może mieć kolejne kartki – menu **Na tej kartce** / **Na nowej kartce**. Na tej kartce – na prawo od obrazków brył (gdy brak miejsca – na lewo albo od lewej krawędzi); na nowej – na środku. Scena się zamyka, rzuty są zaznaczone (można je od razu przesunąć albo zmniejszyć), komunikat podaje liczbę linii; większe niż kartka – podpowiedź „Skaluj”. Wstawienie to jeden krok cofania. |
| Zapis | Format rysunku **25**: bryła ze szkicu ma płaszczyznę (`plane`: `xy`, `xz`, `yz`) i kierunek osi szkicu na płaszczyźnie pionowej. Bryły ze starszych rysunków – na XY, jak dotąd. Rzuty to zwykłe linie i okręgi rysunku. |

## Jak to działa (w skrócie)

- Bryła ze szkicu ma w zapisie płaszczyznę; przejście ze szkicu do bryły to obrót (bez odbicia): XY – jak dotąd, XZ – szkic
  bez zmian w pionie, grubość wzdłuż głębi, YZ – szkic obrócony do boku. Położenie płaszczyzny zmienia środek obrazka
  (XZ – w pionie kartki, YZ – w poziomie), bo w scenie środek obrazka to punkt arkusza pod bryłą (1.52).
- Rzuty sceny: siatki wszystkich brył w położeniu ze sceny łączone w jedną siatkę (kula – siatka południków i równoleżników),
  a krawędzie niewidoczne liczone na tej wspólnej siatce tą samą metodą co rzuty jednej bryły – dlatego bryła z przodu
  zasłania krawędzie bryły z tyłu. Układ trzech widoków i zamiana na linie rysunku – wspólne z rzutami jednej bryły.

## Własność intelektualna

Szkic na płaszczyźnie XY, XZ albo YZ i rzuty prostokątne (przód, góra, bok; metoda europejska według normy rysunku
technicznego) z liniami niewidocznymi to od dziesięcioleci ogólne funkcje programów CAD i podręcznikowa wiedza rysunku
technicznego. Kod własny, bez bibliotek; nazwy w interfejsie opisowe („Na płaszczyźnie…”, „Rzuty”). Szczegóły – audyt IP
(G63–G64).

## Testy, które wykonano

- **Testy logiki (Node.js): 519 – wszystkie zaliczone** (4 nowe):
  - zapis: płaszczyzna XZ i YZ z kątem osi (sprowadzonym do zakresu), XY bez kąta, bryła bez płaszczyzny (1.48) – na XY,
    format 25, obrazek na start – przód (XZ) i prawy bok (YZ);
  - siatka i położenie w scenie: XY na wysokości 50 (Z 50–80), XZ (X, Y od płaszczyzny do przodu, Z 0–80), YZ (X od
    płaszczyzny w prawo), domyślne położenie płaszczyzny – obrazek w miejscu szkicu; przejście szkic → bryła to obrót;
  - bryła obrotowa na XZ z osią pionową – oś wzdłuż Z (pomiar), z przodu linia osiowa pionowa, z góry krzyżyk; wymiar
    długości wyciągnięcia na XY, XZ i YZ;
  - rzuty sceny: wspólna siatka (liczba ścian), górna krawędź bryły z tyłu za bryłą z przodu – przerywana, z góry bez
    przerywanych, góra pod przodem i bok obok, kula i walec – okręgi, linie osiowe; obrys wracający do początku – wielokąt;
    bez brył – bez rzutów.
  - Testy wcześniejszych wersji – format 25 zamiast 24.
- **Testy w przeglądarce (Chromium): 242 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe):
  - komputer: prostokąt → **Na płaszczyźnie…** – na start XZ z podpowiedzią „widok z przodu”, YZ – inne położenie
    i podpowiedź „widok z prawego boku”, XY – 0,00, powrót do XZ – to samo położenie; **Utwórz** – „Bryła: wyciągnięcie”,
    komunikat „Bryła na płaszczyźnie XZ”; prostopadłościan; w scenie płyta stoi na arkuszu (Z = 0), prostopadłościan
    przesunięty za płytę z panelu; **Rzuty** → **Na tej kartce** – powrót do 2D, komunikat „Rzuty sceny: przód, góra
    i lewy bok”, linie zaznaczone; zapis – format 25, `plane: 'xz'`, płyta w scenie pionowo (szerokość X 300, grubość Y 100,
    wysokość Z 200, stoi na arkuszu), linie przerywane (prostopadłościan za płytą), obrysy z góry i z boku;
  - iPad (dotyk): **YZ** i **Obróć wokół osi** dotknięciem – „Bryła: obrotowa”; **Edytuj szkic** – szkic na kartce,
    komunikat z „(YZ)”, w oknie na start znów YZ; scena; **Rzuty** → **Na nowej kartce** – „Kartka 2 z 2”, rzuty zaznaczone;
  - telefon (390 px): przycisk na ekranie, okno w szerokości ekranu (trzy płaszczyzny, rodzaj, położenie), bez przewijania
    w bok, **Utwórz** – bryła.
  - Test 1.51 na telefonie (pasek sceny: „Izometria” i „Przód” na ekranie) wykrył, że nowy przycisk „Rzuty” wypchnął „Przód”
    poza ekran – stąd ikony bez podpisów na telefonie; test przechodzi bez zmian w nim.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno płaszczyzny, płyta w 2D, scena (izometria i przód), rzuty na kartce, iPad (okno, scena, rzuty
  na nowej kartce), telefon.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec – dotyk udawany zdarzeniami Chromium. W teście iPada prostokąt jest
  rysowany myszą (jak w teście 1.48): w Chromium po przeciągnięciu palcem udawanym przez CDP kolejne dotknięcie przycisku
  nie dawało kliknięcia – to cecha emulacji, ale na prawdziwym iPadzie nie zostało to sprawdzone.
- Rzuty sceny są **zwykłymi liniami** – nie zmieniają się po przesunięciu albo zmianie brył (trzeba wstawić je od nowa)
  i nie mają wymiarów; treść 2D kartki (kreski, napisy) nie wchodzi do rzutów.
- Zarys kuli w rzucie może być podzielony na kilka łuków (łamanych), gdy pokrywa się z krawędzią innej bryły.
- Płaszczyzny pionowe są tylko równoległe do osi arkusza (XZ, YZ) – bez płaszczyzny pod dowolnym kątem; wysokość płaszczyzny
  XZ i YZ w pionie nie jest wybierana (bryła stoi na arkuszu – w scenie można ją unieść polem Z).
- Szkic na ścianie bryły (1.49) – jak dotąd na ścianie, bez wyboru płaszczyzny.
- Ciemny motyw.
