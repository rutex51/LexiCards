# LexiCards 1.48 – bryły ze szkicu: wyciągnięcie, obrót wokół osi, historia modelu, rzuty 2D

Wersja 1.48.0, 25 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Bryły ze szkicu i rzuty 2D”).

Drugi etap rysunku przestrzennego (po 1.47 – bryły podstawowe), jak w zaakceptowanym planie: szkic → bryła jak
w Inventorze / SolidWorks, w uproszczeniu. Kolejne etapy (wycięcia i operacje logiczne, szkic na ścianie bryły, STL) –
jeszcze nie.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Wyciągnij** | Przycisk nad zaznaczonymi kształtami (co najmniej jeden zamknięty: prostokąt, okrąg, elipsa, wielokąt, łamana zamknięta…). Kształt wewnątrz innego to **otwór**, kształt w otworze – znów materiał. Profil wyciąga się prostopadle do kartki; długość na start – połowa mniejszego wymiaru szkicu. |
| **Obróć wokół osi** | Bryła obrotowa z profilu. Oś – odcinek albo prosta zaznaczona razem z profilem; bez niej – pozioma linia przez najniższy punkt szkicu. Profil musi leżeć po jednej stronie osi (inaczej komunikat). Kąt 360° – pełna bryła, mniejszy – z przekrojem. |
| Po utworzeniu | Kształty znikają z kartki i zostają w bryle jako **szkic**. Bryła pojawia się z przodu (jak szkic) i płynnie obraca do izometrii (obrotowa – do dimetrii); kostka widoków, „Obracaj”, „Widok” – jak w 1.47. |
| Niebieski uchwyt | Przy zaznaczonej bryle ze szkicu: wyciągnięcie – ramię od przedniej ściany, przeciąganie zmienia długość (tylna ściana zostaje w miejscu); obrót – na końcu łuku, przeciąganie zmienia kąt (10–360°, z Shift – co 15°). Gdy kierunek biegnie prawie na patrzącego (np. wyciągnięcie z przodu), uchwyt się chowa – długość i kąt są też w oknie bryły. |
| **Historia modelu** | W oknie bryły: „1. Szkic – N kształtów, M otworów” z przyciskiem **Edytuj szkic** (bryła znika, szkic wraca na kartkę zaznaczony – poprawiasz go i wybierasz „Wyciągnij” albo „Obróć wokół osi” jeszcze raz) i „2. Wyciągnięcie” / „2. Obrót wokół osi”. Pod spodem – długość albo kąt, położenie i wygląd jak w 1.47. |
| **Rzuty** | Przycisk nad zaznaczoną bryłą (każdą, także z 1.47): trzy rzuty metodą europejską obok bryły – z przodu, pod nim z góry, z prawej strony – z lewej. Zwykłe kształty do wymiarowania: krawędzie – linią ciągłą, okręgi – okręgami, niewidoczne – przerywaną, osie – osiową; każda kreska raz (niewidoczne pokrywające się z widocznymi i powtórzone odpadają). |
| Bryły wklęsłe i z otworami | Krawędzie niewidoczne liczone z zasłaniania przez ściany (nie tylko dla brył wypukłych), cieniowanie z buforem głębokości. |
| Na kartce | Odbicie odbija też profil i szkic („Edytuj szkic” po odbiciu – szkic odbity), skala zmienia profil, wymiar i szkic; obraz w notatce, PDF, DXF – jak przy innych bryłach. |

Zmiany przy okazji:

- Format rysunku **19** (bryły ze szkicu); starsza wersja aplikacji pominie je przy zapisie.

## Testy, które wykonano

- **Testy logiki (Node.js): 489 – wszystkie zaliczone** (8 nowych: profil z kształtów – otwory w kształtach, wyspy
  w otworach, środek; oś obrotu z odcinka (pionowa – kąt 90°), bez osi – pozioma pod szkicem, profil przecinający oś –
  komunikat; siatki wyciągnięcia i obrotu zamknięte (każda krawędź – dwie ściany), normalne na zewnątrz, punkty na osi;
  krawędzie niewidoczne płytki z otworami i wałka stopniowanego w kilku widokach; ściany z płaszczyznami; wymiary
  (długość, średnica); dane – profil i szkic sprawdzane, kąt 10–360°, złe profile odrzucone, zapis (format 19); odbicie
  i skala z profilem i szkicem; rzuty 2D – układ europejski, okręgi otworów w miejscach szkicu, przerywane z góry (4)
  i z boku (2 – otwory jeden za drugim liczone raz), z góry i z boku sam obrys, osie, DXF).
- **Testy w przeglądarce (Chromium): 223 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe):
  - komputer: dwa okręgi i prostokąt narysowane myszą, Ctrl+A – „Wyciągnij” i „Obróć wokół osi” widoczne, „Rzuty” nie;
    „Wyciągnij” – bryła, okno: historia „1. Szkic – 3 kształty, 2 otwory / 2. Wyciągnięcie”, bez wyboru rodzaju, długość
    ok. 2,7 cm zmieniona na 3; uchwyt przeciągnięty – dłuższa; „Rzuty” – komunikat i zaznaczone kształty; „Edytuj szkic” –
    bryła znika, 3 kształty zaznaczone; ponowne „Wyciągnij”; prostokąt nad odcinkiem → „Obróć wokół osi” – tuleja
    (promienie 60–140), kąt 360 → 270, uchwyt kąta; zapis (profil z 2 otworami, szkic, kąt) i DXF (bryły zapisane, DASHED);
  - iPad (dotyk): „Wyciągnij” palcem, uchwyt długości przeciągnięty palcem, „Edytuj szkic” palcem;
  - telefon (390 px): „Wyciągnij” i „Obróć wokół osi” w szerokości ekranu, okno bryły obrotowej bez przewijania w bok.
  - Poprawione starsze testy: numer formatu rysunku (19); pomocnik testów uznaje okno za zamknięte dopiero, gdy zniknie
    z dokumentu (po zapisaniu zmian), a nie zaraz po zdjęciu „open” – wcześniej test w tej chwili mógł nacisnąć Esc albo
    dotknąć kartki przed zapisem. Usuwa to sporadyczne błędy testów 1.38 (iPad) i 1.44 (zdarzały się też na 1.45.2:
    1 na 5 prób; po poprawce 9 na 9 zaliczonych osobno).
  - Błędy wykryte przez te testy i poprawione: kształty rysowane po utworzeniu bryły nie zapisywały się (bryła podmieniała
    listę elementów rysunku zamiast ją zmieniać); „Rzuty” i „Edytuj szkic” – błąd przy nadawaniu identyfikatorów;
    w rzutach powtórzone linie (krawędzie otworów widziane z boku na obrysie, otwory jeden za drugim).
- **Lint: bez błędów.**
- Zrzuty (Chromium): szkic, okno z historią modelu, płytka, rzuty, „Edytuj szkic”, bryły ze szkicu (płytka, rzuty, tuleja
  270°), uchwyt palcem (iPad), telefon i okno na telefonie.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy palec i Apple Pencil – dotyk udawany zdarzeniami Chromium.
- Szybkość obracania dużych brył ze szkicu na prawdziwym iPadzie (krawędzie niewidoczne i cieniowanie liczone w każdej
  klatce; w Chromium na komputerze bez widocznych opóźnień).
- Plik DXF w programie CAD – sprawdzony odczytem z powrotem w aplikacji.
- Ciemny motyw.
- Szkice z przecinającymi się kształtami (nie w sobie) – każdy liczony jako osobna wyspa; operacje logiczne – w kolejnym etapie.

## Uzupełnienie w wersji 1.48.1 – układ osi zamiast kostki widoków

Wersja 1.48.1, 25 października 2026. Po audycie własności intelektualnej (osobna gałąź repozytorium z katalogiem
`audit/`) kostka widoków z 1.47 została usunięta. Jej działanie – kostka obok modelu, dotknięcie ściany ustawia widok,
przeciągnięcie obraca – odpowiada mechanizmowi Autodesk ViewCube, objętemu patentem USA (US 7,782,319 B2).

| Prośba | Jak jest zrobione |
| --- | --- |
| Usunąć kostkę widoków | Nie ma jej przy bryle ani w kodzie (uchwyt, ściany, przeciąganie). Bryłę obracasz przyciskiem **Obracaj** (przeciąganie samej bryły, z Shift – wokół osi pionowej), widok wybierasz w menu **Widok**, kąty – w oknie bryły. |
| Zamiast niej układ współrzędnych 3D w trzech kolorach | Obok zaznaczonej bryły, w miejscu kostki – **układ osi** na jasnej tarczy: **X – czerwona**, **Y – zielona**, **Z – niebieska**, z literami na końcach, w położeniu bryły (obraca się razem z nią, także w trakcie „Obracaj”). Oś skierowana od patrzącego jest bledsza, oś na patrzącego – punkt. Układ tylko pokazuje położenie: dotknięcie i przeciągnięcie tarczy niczego nie zmieniają i nie zdejmują zaznaczenia. |
| Przy okazji | Komunikat po wstawieniu bryły i podpowiedź w jej oknie mówią o „Obracaj” i „Widok”; ikona przycisku **Widok** – układ osi zamiast sześcianu. |

Testy wersji 1.48.1:

- **Testy logiki (Node.js): 490 – wszystkie zaliczone** (1 nowy: układ osi – kierunki w widokach z przodu, z góry,
  w izometrii i z tyłu, punkt dla osi na patrzącego, kolejność od najdalszej, kolory; brak funkcji kostki).
- **Testy w przeglądarce (Chromium): 223 – wszystkie zaliczone w dwóch pełnych przebiegach** (bez nowych testów;
  zmienione 3 testy brył 1.47 i 3 testy 1.48):
  - komputer: układ osi w izometrii – X w prawo i w dół, Y w górę, Z w lewo i w dół; kolory końców osi odczytane
    z płótna – czerwona, zielona, niebieska; kostki nie ma; dotknięcie i przeciągnięcie tarczy nie obracają bryły
    i nie zdejmują zaznaczenia; menu „Widok” – z góry: Y punktem, Z w dół, X w prawo; reszta testu bez zmian;
  - iPad (dotyk): palec na tarczy niczego nie obraca; menu „Widok” – przód (Z punktem); „Obracaj” palcem – oś Z schodzi
    w dół razem z pochyloną bryłą;
  - telefon: tarcza osi w szerokości ekranu.
  - Uwaga: w pierwszym, przerwanym podejściu do pełnych przebiegów raz nie przeszedł test fiszek „gesty” (stuknięcie
    po przesunięciu nie obróciło fiszki). Kodu fiszek ta wersja nie zmienia; test osobno przeszedł 5 razy na 5, w ok. 100
    wcześniejszych przebiegach nie zawiódł. Przyczyny nie ustalono. Oba pełne przebiegi powtórzono od początku – bez błędów.
- **Lint: bez błędów.**
- Zrzuty (Chromium): prostopadłościan z układem osi, układ osi w widoku z góry, obrót palcem (iPad), telefon.

Czego nie sprawdzono: Safari na iPhonie i iPadzie, prawdziwy palec i Apple Pencil; czytelność kolorów osi w ciemnym
motywie i dla osób z zaburzeniami widzenia barw (osie mają też litery X, Y, Z).
