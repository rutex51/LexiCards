# LexiCards 1.52 – położenie brył w scenie

Wersja 1.52.0, 26 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Położenie brył”).

Trzeci etap planu „Wspólny układ osi, pełna scena 3D” (po 1.50 – układ współrzędnych arkusza, 1.51 – scena 3D do
oglądania): bryły mają położenie w przestrzeni arkusza – X, Y, wysokość podstawy Z i obrót wokół Z – i mogą stać jedna na
drugiej. W 2D bryły zostają obrazkami (izometria albo wybrany widok), a stos brył to jeden wspólny obrazek.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Panel położenia w scenie** | Zaznaczona bryła (dotknięcie w scenie) – panel w prawym dolnym rogu (na telefonie – na dole, w szerokości ekranu): **X**, **Y** – punkt arkusza, nad którym stoi środek bryły, **Z** – wysokość podstawy nad arkuszem, **↻** – obrót wokół Z w stopniach (patrząc z góry – przeciwnie do ruchu wskazówek zegara). Liczby w układzie arkusza, w mm przedmiotu w skali rysunku (jak współrzędne i wymiary; styl „5 cm” – jednostka skali). Zmiana – po Enter albo po wyjściu z pola; puste pole – 0; Z poniżej 0 – komunikat. |
| **Strzałki osi** | Przy zaznaczonej bryle trzy strzałki w kolorach osi: **X** (czerwona) i **Y** (zielona) od środka podstawy, **Z** (niebieska) od środka wierzchu. Przeciągnięcie strzałki przesuwa bryłę wzdłuż tej osi (w obie strony), liczby zaokrąglone (mm – do 1, cm – do 0,1); w trakcie – **same krawędzie** wszystkich brył, bez krycia i cieniowania, liczby w panelu i w pastylce na dole. Oś skierowana prawie na patrzącego – bez strzałki (np. Y w widoku z przodu). Dotknięcie strzałki bez przeciągania działa jak dotknięcie sceny (np. zaznacza bryłę stojącą na zaznaczonej). |
| **Postaw na ścianie…** | Potem dotknięcie **wierzchu** (poziomej ściany od góry) innej bryły – zaznaczona bryła staje na nim, środkiem w dotkniętym miejscu, obrót bez zmian. Panel: „stoi na: Prostopadłościan”. Ściana pochyła albo boczna – komunikat; Esc albo „Anuluj – bez zmian” – bez zmian. Nie da się postawić bryły na sobie ani na bryle, która na niej stoi. |
| **Bryła na bryle** | Idzie za bryłą pod spodem: przesunięcie (strzałką, liczbami, w 2D), wysokość i obrót wokół Z bryły pod spodem (obraca się razem z nią wokół jej osi), zmiana jej wymiarów (zostaje na wierzchu). Zmiana jej własnego położenia (strzałki, liczby) – względem bryły pod spodem. Może być kilka pięter. |
| **Na arkusz (Z = 0)** | Bryła stoi sama na arkuszu, w tym samym miejscu X, Y (z obrotem); bryły, które na niej stoją, schodzą razem z nią. Nieaktywne, gdy bryła już stoi na arkuszu. |
| **Wspólny obrazek w 2D** | Bryła postawiona na innej nie ma osobnego obrazka – jest w obrazku bryły na samym dole, w tym samym widoku, w swoim miejscu i obrocie względem niej, zasłaniana jak w rzeczywistości (najpierw dalsza). Przesunięcie, obrót obrazka, widok („Przód”, „Obracaj”) dotyczą całego obrazka – także gdy zaznaczona jest bryła z góry. Wymiary, kolor, krawędzie – każdej bryły osobno. |
| **Cofnij w scenie** | W pasku sceny – **Cofnij** (też Ctrl/⌘ + Z poza polem liczby). Każda zmiana położenia to jeden krok cofania rysunku, także po powrocie do 2D. |
| **Położenie bryły w 2D** | Przy włączonym układzie współrzędnych przycisk **Położenie** przy zaznaczonej bryle otwiera okno „Położenie bryły”: X, Y środka, wysokość podstawy Z i obrót wokół Z (wcześniej – tylko środek obrazka). |

Zmiany przy okazji:

- Format rysunku **23**: bryła może mieć `z` (wysokość podstawy), `yaw` (obrót wokół Z) i `on` (bryła pod spodem i położenie
  względem niej); obrazek bryły postawionej jest zapisany w miejscu w obrazku bryły na dole, więc starsza wersja aplikacji
  pokaże stos tak samo w 2D (bez położenia w scenie – bryły stoją na kartce).
- Kopie (powielenie, wklejenie, odbicie z kopią): stos skopiowany razem – kopia stoi na kopii; sama bryła z góry – stoi
  sama. Usunięta bryła pod spodem – bryły z niej stoją same, w miejscu swoich obrazków, na tej samej wysokości.
- Skala zaznaczonego: wysokość podstawy i odległości w stosie rosną razem z bryłami.

## Jak to działa (w skrócie)

- Moduł `js/core/solid-pose.js` (bez przeglądarki): położenie w scenie (`placement` – także przez stos), położenie względem
  bryły pod spodem (`withPose`, `placeOn`, `liftOff`), obrazek bryły postawionej w obrazku bryły na dole (`stackedPicture`
  – ten sam rzut co w scenie), porządkowanie stosów po każdej zmianie (`resolveStacks`: brakujące bryły i pętle, zmiana
  samego obrazka bryły z góry przechodzi na bryłę na dole) i kolejność rysowania stosu w 2D (`stackPaintOrder`).
- Scena (`js/core/scene.js`): każda bryła ma swój obrót (`sceneQuat(camera, yaw)`), zasięg w osiach świata po obrocie,
  bryła postawiona na innej rysuje się po niej.
- Przesuwanie strzałką liczy podgląd (rysunek bez zmian do puszczenia); po puszczeniu jedna zmiana idzie do historii
  edytora (ta sama droga co zmiany w 2D, z przyklejonymi końcami i stosami).

## Własność intelektualna

Przesuwanie zaznaczonego obiektu przeciąganiem strzałki osi w kolorze osi, pola X/Y/Z, obrót wokół osi pionowej i stawianie
obiektu na powierzchni innego to ogólne techniki edytorów 3D i programów CAD znane od dziesięcioleci; kod własny, bez
bibliotek 3D. **Zgłoszenie patentowe P-06** (audyt IP: US 2012/0078589 A1 / EP 2434456 A2, Siemens – „uchwyt do
przesuwania i wyciągania obiektów w edytorze 3D”) według dostępnego streszczenia opisuje narzędzie ze **wskaźnikiem trybu
wyciągania**, **punktem narzędzia** i **dwoma przeciwległymi uchwytami na wspólnej osi**, którymi zmienia się obiekt
(przesuwa albo wyciąga). Strzałki w 1.52 są zrobione inaczej: **po jednej strzałce na oś** (bez par przeciwległych
uchwytów), **tylko przesuwanie** całej bryły (bez wyciągania, zmiany wymiarów i bez przełącznika trybu), wymiary i
wyciągnięcie – jak dotąd osobno (pola wymiarów, uchwyt długości z 1.48). Stanu prawnego i zastrzeżeń P-06 nie dało się
sprawdzić – bazy patentowe są z tego środowiska niedostępne, było tylko wyszukiwanie z opisem zgłoszenia (zob. audyt IP,
uwaga przy 1.52). Nazwy w interfejsie opisowe („Postaw na ścianie”, „Na arkusz”, „Położenie bryły”).

## Testy, które wykonano

- **Testy logiki (Node.js): 512 – wszystkie zaliczone** (6 nowych):
  - zapis: wysokość, obrót (−180°, 180°], odnośnik do bryły pod spodem (zły – pominięty), format 23, bryła bez położenia bez
    nowych pól, obrazek bryły postawionej wyliczony przy wczytaniu, odnośnik do bryły, której nie ma – usunięty;
  - scena: podstawa na wysokości z, obrót o 90° (długość wzdłuż Y), bryła na bryle obróconej – przesunięcie w jej układzie,
    wysokość na wierzchu, obrót razem z nią; ściana „w górę” przy każdym obrocie;
  - wspólny obrazek w 2D zgodny ze sceną w czterech kamerach (izometria, z boku, z ukosa, z obrotami 0°–90° i względnymi
    ±90°): to samo położenie obrazka i to samo przesunięcie co w scenie;
  - stos po zmianie: przesunięta bryła na dole – górna idzie za nią; przesunięty i obrócony („Z góry”) sam obrazek górnej –
    cały obrazek; wyższa bryła na dole – górna dalej na wierzchu; podgląd w trakcie przesuwania; usunięta bryła na dole;
    pętla rozerwana;
  - wpisane położenie, „Postaw na ścianie” (identyfikatory, położenie względem obróconej bryły, bryła na sobie i na tej, która
    na niej stoi – odmowa), obrót bryły na dole, „Na arkusz”, kopie stosu i samej bryły z góry, skala;
  - kolejność rysowania: stos w 2D razem (widok z góry i od spodu), w scenie mała bryła przy tylnym brzegu dużej – po niej;
    punkt ściany pod wskaźnikiem.
- **Testy w przeglądarce (Chromium): 236 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe):
  - komputer: prostopadłościan i walec; scena – bez zaznaczenia bez panelu i strzałek; zaznaczony prostopadłościan – panel
    (Z = 0, obrót 0, „Na arkusz” nieaktywne), strzałki X (w prawo w dół), Y, Z (w górę); strzałka Z bez puszczenia – ruch, same
    krawędzie (w środku bryły jasno), podpowiedź „Przesuwanie wzdłuż Z”; po puszczeniu – wyżej, liczba zaokrąglona, X bez zmian,
    pełny obraz; Z = 0 i obrót 30 wpisane; strzałka X – dalej; walec – „Postaw na ścianie…”, dotknięcie wierzchu
    prostopadłościanu: „stoi na: Prostopadłościan”, Z = 3 cm, walec nad prostopadłościanem; prostopadłościan strzałką X – walec
    przesuwa się o tyle samo (±2 px); „Cofnij” – oba wracają; 2D: walec w obrazku prostopadłościanu, przeciągnięty walec
    przesuwa cały obrazek (prostopadłościan o 120 × 60 px, ±3 px); „Na arkusz” i „Cofnij”; zapis – format 23, obrót 30°,
    odnośnik walca do prostopadłościanu, wysokość podstawy = wysokość prostopadłościanu, zapis spójny;
  - iPad (dotyk): strzałka Z palcem – ruch, podpowiedź, po puszczeniu wyżej; „Położenie bryły” w 2D – Z = 2, obrót 45° –
    w scenie te same liczby;
  - telefon (390 px): panel, cztery pola, „Postaw na ścianie…” i „Na arkusz” na ekranie, Z wpisane z przecinkiem (1,5),
    strzałka Z, bez przewijania w bok.
- Testy 1.50 i 1.51 z poprawką: zapis 1.50 sprawdza format 22 albo nowszy.
- **Lint: bez błędów.**
- Zrzuty (Chromium): zaznaczona bryła ze strzałkami, przesuwanie – same krawędzie, „Postaw na ścianie”, stos w ruchu,
  wspólny obrazek w 2D, iPad (palec, okno „Położenie bryły”, scena), telefon.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – dotyk udawany zdarzeniami Chromium.
- Stan prawny zgłoszenia P-06 – bez dostępu do baz patentowych (opis wyżej).
- Obrót tylko wokół Z (bryła zawsze stoi prosto); położenie przechylone – później. „Postaw na ścianie” – tylko na
  poziomej ścianie od góry (wierzch); bryła stoi środkiem w dotkniętym miejscu, także gdy wystaje poza ścianę.
- Bryły mogą się przenikać (nic nie pilnuje, by się nie nachodziły); zasłanianie – kolejnością rysowania, przy przenikaniu
  niedokładne.
- Obrót wokół Z zmienia bryłę w scenie, nie jej obrazek w 2D (obrazek ma swój widok). „Na arkusz” bryły z góry stawia ją
  w tym samym X, Y – jej obrazek w 2D pojawia się w tym miejscu kartki (może nachodzić na obrazek bryły, na której stała).
- W trakcie przeciągania podgląd stosu w 2D rysuje bryły osobno (po puszczeniu – razem, w kolejności widoku).
- Bez cienia pod bryłą uniesioną nad arkusz (wysokość – w liczbach i w widoku z boku).
- Ciemny motyw.
