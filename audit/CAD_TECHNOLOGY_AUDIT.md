# Audyt technologii CAD 2D i 3D

Stan: commit `9eaa9ac` (1.48.0). Ocena techniczna i wstępna ocena ryzyka – **nie jest opinią prawną ani analizą FTO**.

## 4.1 Architektura – co faktycznie jest zaimplementowane

Aplikacja to PWA: czysty JavaScript (moduły ES), Canvas 2D, IndexedDB, bez bibliotek i bez serwera.
Moduły CAD to 27 plików:

- **Rdzeń, bez przeglądarki (`js/core`):** `drawing.js`, `shapes.js`, `geometry-edit.js`, `recognize.js`,
  `transform.js`, `arrays.js`, `attach.js`, `layers.js`, `solids.js`, `dxf.js`, `gdt.js`, `fits.js`, `templates.js`,
  `page-layouts.js`, `diagrams.js`, `title-block.js`, `tool-ring.js`, `page-curl.js`.
- **Interfejs (`js/ui`):** `drawing.js` (edytor), `drawing-solids.js`, `drawing-gdt.js`, `drawing-paint.js`,
  `drawing-ring.js`, `drawing-groups.js`, `drawing-boxes.js`, `drawing-diagrams.js`, `fit-table.js`.

| Mechanizm | Stan | Gdzie |
| --- | --- | --- |
| Rysunek 2D: odcinek, łuk, okrąg, elipsa, wielokąty, krzywa Béziera, łamana, spirala, punkt | jest | `shapes.js` |
| Bryły 3D podstawowe (6 rodzajów) | jest – siatki wielościanów | `solids.js` |
| Bryły ze szkicu: wyciągnięcie, obrót wokół osi | jest – siatki z profilu, bez jądra B-Rep | `solids.js` |
| Układy współrzędnych | strona 2D (y w dół); bryła: prawoskrętny, kwaternion | `solids.js` |
| Przekształcenia: przesunięcie, obrót, odbicie, skala, szyk | jest | `transform.js`, `arrays.js` |
| Zaznaczanie i edycja: uchwyty, lasso, prostokąt, fragmenty | jest | `ui/drawing.js` |
| Więzy geometryczne i solwer więzów | **brak** (tylko przyciąganie i przyklejone końce) | `attach.js` |
| Modelowanie parametryczne | **brak** (wymiary jako pola liczbowe; „Historia modelu” to szkic + jedna operacja, bez przeliczania drzewa) | `solids.js`, `ui/drawing.js` |
| Operacje logiczne (CSG), B-Rep, powierzchnie, NURBS powierzchniowe | **brak** | — |
| Generowanie siatek | jest (pierścienie, wielościany, obrót profilu) | `solids.js` |
| Wizualizacja | Canvas 2D: rzut prostokątny, krawędzie niewidoczne, bufor głębokości | `solids.js`, `ui/drawing-solids.js` |
| Import / eksport CAD | DXF (odczyt ASCII, zapis R12) | `dxf.js` |
| Zapis | JSON w IndexedDB (format rysunku 19), kopia zapasowa | `drawing.js`, `backup.js` |
| Cofnij / ponów | migawki stanu | `ui/drawing.js` |
| Sprawdzanie danych | funkcje `clean*` dla każdego elementu | wszystkie moduły rdzenia |
| Wymiarowanie i symbole metrologiczne (ISO 129, 1101, 1302, 286 – oznaczenia) | jest | `shapes.js`, `gdt.js`, `fits.js` |

## 4.2 Porównanie z technologiami CAD

| System | SDK/biblioteka | Kod z repozytorium | Znane algorytmy | Formaty | Wyróżniające cechy | Zasoby chronione | Ukryte zależności |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AutoCAD (Autodesk) | nie | nie znaleziono | tak – ogólne konstrukcje (offset, fillet, trim, TTR, object snap) | DXF – publiczna specyfikacja | nazwy poleceń opisowo w dokumentacji („jak FILLET”) | nie | nie |
| Autodesk Inventor / Fusion | nie | nie | szkic → wyciągnięcie / obrót, manipulator długości | — | **kostka widoków** – mechanizm jak ViewCube (zob. P-01) | nie (własny rysunek kostki, polskie napisy) | nie |
| SolidWorks | nie | nie | szkic → bryła, lista historii | — | „Historia modelu” – lista dwóch kroków, bez drzewa | nie | nie |
| Siemens NX / Solid Edge | nie | nie | uchwyt przeciągania długości | — | ogólne (zob. P-06) | nie | nie |
| PTC Creo, CATIA, Onshape | nie | nie | ogólne | — | brak cech szczególnych | nie | nie |
| FreeCAD / OCCT | nie | nie (brak nazw `TopoDS`, `BRep…`, `Part::`) | — | — | — | — | nie |
| LibreCAD / QCAD CE | nie | nie (brak nazw `RS_…`) | DXF | DXF | — | — | nie |
| SolveSpace | nie | nie (brak solwera więzów) | — | — | — | — | nie |
| Blender | nie | nie | — | — | — | — | nie |
| CGAL | nie | nie | — | — | — | — | nie |
| Three.js / Babylon.js | nie | nie (brak `Matrix4`, `BufferGeometry` itp.); wzór kwaternionu z macierzy – standard (S-2) | kwaterniony, SLERP | — | — | — | nie |

Wniosek: **nie znaleziono kodu, bibliotek, zasobów ani dokumentacji pochodzących z systemów CAD**.
Podobieństwa dotyczą koncepcji funkcji i interfejsu. Prawo autorskie nie chroni koncepcji. Koncepcje mogą natomiast
podlegać patentom (zob. PATENT_LANDSCAPE.md) i oznaczeniom chronionym jako znaki towarowe (niżej).

## 4.3 Algorytmy geometrii

Szczegóły zawiera GEOMETRY_ALGORITHM_REGISTER.csv: 48 pozycji z plikami i wierszami.

- Wszystkie to techniki standardowe z literatury publicznej: de Casteljau, de Boor, shoelace, crossing number, Newell,
  Sutherland–Hodgman, z-buffer, HLR przez próbkowanie, kwaterniony i SLERP, ShortStraw, PCA.
- Brak NURBS powierzchniowych, B-Rep, CSG, triangulacji, solwera więzów i operacji logicznych.
- Podobieństwa zapisu do znanych postaci: S-1 (PNPOLY), S-2, S-3 – szczegóły w SOURCE_CODE_SIMILARITY.md.

## 4.4 Jądra CAD i biblioteki geometrii

Brak. Repozytorium nie zawiera i nie ładuje: Open CASCADE, CGAL, Clipper, Eigen, GLM, three.js, Babylon.js ani
innych bibliotek matematycznych czy renderujących.

Dowody:
- `package.json` nie ma `dependencies`;
- brak importów spoza ścieżek względnych;
- brak plików dostawców (vendor);
- brak skryptów z CDN w `index.html`.

Tabela: CAD_LIBRARY_LICENSES.csv.

## 4.5 Formaty danych

| Format | Obsługa | Biblioteka | Uwagi IP |
| --- | --- | --- | --- |
| DXF | odczyt ASCII (DXF binarny odrzucany z komunikatem), zapis R12 | własna | Specyfikacja jest publikowana przez Autodesk. Implementacja formatu dla zgodności jest powszechna i co do zasady dozwolona. „DXF” figuruje na liście znaków towarowych Autodesk (wynik wyszukiwania, niezweryfikowany) – używać opisowo („plik DXF”), bez sugerowania powiązania. |
| DWG, STEP, IGES, STL, OBJ, glTF | **brak** | — | — |
| SVG | tylko rozpoznanie typu wklejanego obrazu (wklejenie SVG jest odrzucane) | — | — |
| PDF (eksport notatki), PNG (obraz rysunku) | jest | własna | ISO 32000; standardowe kroje PDF bez osadzania |

## Znaki towarowe w repozytorium

| Oznaczenie | Gdzie | Ocena |
| --- | --- | --- |
| ViewCube (znak Autodesk – według rekordu rejestru znalezionego w wyszukiwaniu) | tylko wewnętrzne nazwy w kodzie: `paintViewCube` (`js/ui/drawing-solids.js:218`), import w `js/ui/drawing.js:82`, ikona `viewCube` (`js/ui/icons.js:242`), komentarz `js/ui/drawing.js:7669` | Użytkownik widzi „kostka widoków”. Ryzyko znaku niskie, ale zalecana zmiana nazw wewnętrznych na neutralne (np. `orientationCube`). |
| AutoCAD | komentarze w `js/core/dxf.js` (opis formatu, kolory ACI), dokumentacja (9 miejsc), README (4) | Użycie opisowe. W materiałach handlowych nie sugerować zgodności ani powiązania z Autodesk. |
| Inventor, SolidWorks | `docs/RELEASE-1.48.md` („jak w Inventorze / SolidWorks”) | Opisowe, w dokumentacji wewnętrznej. W materiałach handlowych zalecane sformułowania neutralne („jak w programach CAD”). |
| iPad, iPhone, Apple Pencil, Windows | dokumentacja | Opisowe (platformy) – zwykła praktyka. |

## Najważniejsze ustalenie CAD

**Kostka widoków** (wersja 1.47) odtwarza mechanizm interfejsu Autodesk ViewCube:

- sześcian z podpisanymi ścianami przy modelu;
- dotknięcie ściany ustawia widok;
- przeciągnięcie kostki obraca model.

Kod jest własny, ale mechanizm może wchodzić w zakres patentu USA **US 7,782,319 B2** (Autodesk). Według Google Patents,
widzianego tylko w wynikach wyszukiwarki, jego status to „Active – Reinstated”, przewidywane wygaśnięcie 2029-03-06.
Treści zastrzeżeń nie pobrano – szczegóły w PATENT_LANDSCAPE.md (P-01). To jedyne ustalenie o ryzyku **WYSOKIM**
(dla rynku USA, do czasu analizy FTO).

Pozostałe sposoby zmiany widoku nie dotyczą tego mechanizmu:
- menu „Widok”;
- „Obracaj” (przeciąganie samej bryły);
- pola kątów w oknie bryły.

Usunięcie samej kostki nie odbiera więc żadnej funkcji.

## Uzupełnienie: wersja 1.49 (26.10.2026) – szkic na ścianie bryły, operacje logiczne

Stan opisany wyżej dotyczy wersji 1.48.0. Od 1.49 aplikacja ma **operacje logiczne na bryłach** (różnica i suma)
– zdanie „brak CSG i operacji logicznych” w 4.3 przestaje być aktualne. Ocena:

- **Kod:** `js/core/csg.js` – własna implementacja metody drzew BSP (podział przestrzeni płaszczyznami ścian); metoda
  opisana w literaturze od lat 80. (m.in. Thibault i Naylor, SIGGRAPH 1987; Naylor, Amanatides i Thibault, SIGGRAPH 1990).
  Bez bibliotek i jąder CAD – punkt 4.4 bez zmian. Podobieństwo kolejności kroków do otwartej biblioteki csg.js – S-4
  w SOURCE_CODE_SIMILARITY.md.
- **Funkcje:** szkic na płaskiej ścianie bryły, widok prosto na ścianę, wyciągnięcie wycięcia i dodania prostopadle do
  ściany, historia operacji – ogólne techniki modelowania cechami znane od końca lat 80. Nazwy w interfejsie opisowe
  („Szkic na ścianie”, „Wytnij z bryły”, „Dodaj do bryły”), bez nazw handlowych.
- **Patenty:** metoda BSP z 1987 r. – ewentualne patenty z tamtego okresu wygasły (ponad 20 lat). Celowanego wyszukiwania
  patentów na „szkic na ścianie” nie robiono (bazy patentowe nadal zablokowane – AUDIT_LIMITATIONS.md); ryzyko oceniono
  jako NISKIE na podstawie wieku techniki, nie wyników wyszukiwania.
- Nowe pozycje rejestru algorytmów: G49–G53 (GEOMETRY_ALGORITHM_REGISTER.csv).

## Uzupełnienie: wersja 1.50 (26.10.2026) – układ współrzędnych arkusza

Pierwszy etap planu „wspólny układ osi, pełna scena 3D”. Ocena:

- **Kod:** `js/core/sheet-coords.js` (punkt strony ↔ współrzędne arkusza: przesunięcie do początku, odwrócenie osi y,
  mnożnik skali i jednostki wymiarów), `drawingToDxf` od początku układu, w edytorze – osie w początku, współrzędne pod
  kursorem, okna „Punkt X, Y” i „Położenie”. Bez bibliotek; przekształcenie liniowe z podręczników grafiki.
- **Funkcje:** kartezjański układ z początkiem w rogu arkusza, współrzędne kursora, wpisywanie punktów liczbami, położenie
  elementu w liczbach, przesunięcie początku – powszechna praktyka programów CAD od lat 80. i norm rysunku technicznego.
  Nazwy w interfejsie opisowe („Układ współrzędnych arkusza”, „Punkt X, Y”, „Położenie”, „Przesuń początek…”).
- **Osie brył (W1):** zmienione tylko etykiety osi bryły (X = x, Y = −z, Z = y) – konwencja jak w programach CAD
  i maszynach pomiarowych (przód od strony −Y); bez zmiany geometrii i bez nowych elementów sterujących.
- **Patenty – uwaga na przyszłość (P-01, P-03, P-06):** osie w początku arkusza i przy bryle są **tylko wskaźnikiem**
  (bez dotykania, bez zmiany widoku przez ich przeciąganie albo klikanie) – poza mechanizmem „wskaźnik, który obraca
  scenę / ustawia punkt widzenia” z P-01 i P-03. W kolejnych etapach (scena 3D) zasada zostaje: widoki – zwykłymi
  przyciskami, obrót – przeciąganiem sceny, nie wskaźnika. Strzałki przesuwania brył wzdłuż osi (planowane w 1.52) –
  przed wdrożeniem sprawdzić zastrzeżenia P-06 (uchwyt przesuwania i wyciągania w edytorze 3D).
- Nowe pozycje rejestru algorytmów: G54–G55 (GEOMETRY_ALGORITHM_REGISTER.csv). Ryzyko wstępnie NISKIE (technika
  powszechna; wyszukiwania patentowego nie robiono – bazy zablokowane, AUDIT_LIMITATIONS.md).

## Uzupełnienie: wersja 1.51 (26.10.2026) – scena 3D do oglądania

- **Kod:** `js/core/scene.js` (kamera z azymutu i wysokości, rzut równoległy, przekształcenie płaszczyzny kartki, bryły
  stojące na kartce, kolejność rysowania od najdalszej), `js/ui/drawing-scene.js` (płótno sceny, obrót przeciąganiem,
  przybliżanie, gotowe widoki, w ruchu – same krawędzie). Bez bibliotek 3D (WebGL nie jest używany); rysowanie brył – ten
  sam rozkład 2D co w 1.47–1.49.
- **Funkcje:** obrót kamery wokół sceny („orbit”), rzut równoległy, widoki standardowe, rysowanie krawędziowe w trakcie
  ruchu, zasłanianie kolejnością (algorytm malarza) – ogólne techniki grafiki komputerowej od lat 70.–80.
- **Patenty – P-01 i P-03:** widoki wybiera się przyciskami z nazwami w pasku, obrót – przeciąganiem samej sceny; osie
  w początku układu są tylko wskaźnikiem (bez dotykania, bez zmiany widoku). Brak „kostki widoków” i wskaźnika sterującego
  – zasada z 1.50 zachowana.
- Nowe pozycje rejestru algorytmów: G56–G57. Ryzyko wstępnie NISKIE.

## Uzupełnienie: wersja 1.52 (26.10.2026) – położenie brył w scenie

- **Kod:** `js/core/solid-pose.js` (położenie bryły w układzie arkusza: wysokość podstawy, obrót wokół Z, bryła postawiona
  na innej – położenie względne, wspólny obrazek stosu w 2D, porządkowanie stosów po zmianie), zmiany w `js/core/scene.js`
  (obrót każdej bryły, kolejność – bryła na bryle po niej) i `js/ui/drawing-scene.js` (panel X/Y/Z/obrót, strzałki osi,
  „Postaw na ścianie”, „Na arkusz”, „Cofnij”). Bez bibliotek; rachunek – macierze obrotu 3 × 3 i przecięcie promienia
  z płaszczyzną.
- **Funkcje:** pola położenia, przesuwanie wzdłuż osi przeciąganiem strzałki, obrót wokół osi pionowej, stawianie obiektu
  na powierzchni innego, hierarchia rodzic–dziecko (obiekt idzie za obiektem pod spodem) – ogólne techniki edytorów 3D
  i programów CAD od lat 80.–90. (manipulatory przesunięcia, grafy sceny).
- **Patenty – P-06 (sprawdzone przed wdrożeniem strzałek, zgodnie z uwagą z 1.50):** wyszukiwanie z opisem zgłoszenia
  (bazy patentowe nadal niedostępne – WebFetch do patents.google.com, patents.justia.com i data.epo.org: brak połączenia).
  Dane z wyników wyszukiwania (do potwierdzenia w rejestrze): US 2012/0078589 A1, zgłoszenie US 13/233,550 z 15.09.2011,
  pierwszeństwo z US 61/386,750 (27.09.2010), odpowiednik EP 2434456 A2 (publikacja 28.03.2012), Siemens. Streszczenie:
  narzędzie ze **wskaźnikiem trybu wyciągania**, **punktem narzędzia** oznaczającym obiekt 3D i **dwoma przeciwległymi
  uchwytami na wspólnej osi**; działanie na którymkolwiek uchwycie zmienia obiekt. Status (udzielony / wygasły / wycofany)
  i zastrzeżenia – nieustalone.
  **Rozwiązanie w 1.52 omija istotę streszczenia:** po jednej strzałce na oś (bez par przeciwległych uchwytów), strzałki
  tylko **przesuwają** całą bryłę (bez wyciągania, zmiany wymiarów i bez wskaźnika ani przełącznika trybu); wyciągnięcie
  i wymiary – jak dotąd osobno (pola wymiarów; jeden uchwyt długości z 1.48 – P-06 bez zmian). Liczby położenia w panelu
  dają ten sam skutek bez strzałek (alternatywa, gdyby rzecznik wskazał ryzyko). Ryzyko dla strzałek 1.52 wstępnie NISKIE.
- **P-01 i P-03:** bez zmian – osie w początku układu i strzałki nie zmieniają widoku; widoki – przyciski z nazwami.
- Nowe pozycje rejestru algorytmów: G58–G60. Ryzyko wstępnie NISKIE.

## Uzupełnienie: wersja 1.53 (26.10.2026) – pomiary 3D w scenie

- **Kod:** `js/core/measure3d.js` (cechy bryły z siatki: ściany płaskie i powierzchnie zakrzywione – łączenie ścian
  siatki przez krawędzie gładkie, krawędzie proste, narożniki, środki ścian, osie; pomiar odległości i kątów; zapis
  pomiaru w bryle jako odnośnik rola + punkt + kierunek) i tryb „Pomiar” w `js/ui/drawing-scene.js` (wskazywanie cech,
  wymiary pomiarów w scenie). Bez bibliotek; geometria analityczna (iloczyn skalarny i wektorowy, rzuty na prostą
  i płaszczyznę, najbliższe punkty prostych skośnych).
- **Funkcje:** pomiar odległości punkt–punkt z ΔX/ΔY/ΔZ, punkt–prosta, punkt–płaszczyzna, kąty i odległości równoległych
  – standardowe funkcje programów CAD i oprogramowania maszyn pomiarowych (od lat 70.–80.); rozpoznawanie ścian płaskich
  z siatki przez progi kąta – technika podręcznikowa (segmentacja siatek wg normalnych).
- **Patenty:** szczególnego ryzyka nie zidentyfikowano (wyszukiwania patentowego nie robiono – bazy zablokowane,
  AUDIT_LIMITATIONS.md). Interfejs: zwykły przycisk „Pomiar”, dotknięcie dwóch cech, wynik w panelu i liczba w scenie –
  bez rozpoznawalnych elementów cudzych programów.
- Nowe pozycje rejestru algorytmów: G61–G62. Ryzyko wstępnie NISKIE.

## Uzupełnienie: wersja 1.54 (26.10.2026) – płaszczyzny szkicu i rzuty sceny

- **Kod:** `js/core/solids.js` (`sketchToBody` – przejście z układu szkicu na płaszczyźnie XY, XZ albo YZ do układu bryły
  przez obrót; `meshLines` – rdzeń linii widocznych i niewidocznych wydzielony z rzutów jednej bryły z 1.48;
  `layoutProjections`, `viewsToShapes`), `js/core/solid-pose.js` (`sketchPlaneLevel`, `onSketchPlane` – położenie
  płaszczyzny szkicu w scenie), nowy `js/core/scene-projections.js` (wspólna siatka wszystkich brył w położeniu ze sceny,
  siatka kuli z południków i równoleżników, osie, trzy widoki), okno „Bryła na płaszczyźnie” w `js/ui/drawing.js`, przycisk
  „Rzuty” w `js/ui/drawing-scene.js`. Bez bibliotek. Dwie nowe ikony (`sketchPlane`, `sceneProjections`) – własne proste
  rysunki SVG (prostokąty, linie), bez cudzych zestawów ikon.
- **Funkcje:** szkic na płaszczyźnie podstawowej (XY, XZ, YZ) z odsunięciem – ogólna funkcja programów CAD (płaszczyzny
  odniesienia i szkice od lat 80.–90.); rzuty prostokątne trzech widoków metodą europejską z liniami niewidocznymi –
  rysunek techniczny według norm (rzutowanie prostokątne, linie niewidoczne przerywane, linie osiowe); ukrywanie krawędzi
  na wspólnej siatce wielu brył – klasyczne algorytmy usuwania linii niewidocznych (podręczniki grafiki od lat 60.–70.).
- **Patenty:** szczególnego ryzyka nie zidentyfikowano (wyszukiwania patentowego nie robiono – bazy zablokowane,
  AUDIT_LIMITATIONS.md). Interfejs: opisowe nazwy („Na płaszczyźnie…”, „XZ – przód”, „Rzuty”, „Na tej kartce”), okno
  w stylu aplikacji – bez rozpoznawalnych elementów cudzych programów. Nazwy płaszczyzn XY/XZ/YZ – zwykłe oznaczenia osi.
- Nowe pozycje rejestru algorytmów: G63–G64. Ryzyko wstępnie NISKIE.

## Uzupełnienie: wersja 1.55 (27.10.2026) – suma i różnica brył

- **Kod:** nowy `js/core/solid-combine.js` (położenie drugiej bryły w układzie pierwszej – przesunięcie i obrót wokół osi
  pionowej z położenia w scenie; sprawdzenie styku zasięgów; bryły stojące na bryłach w tym samym miejscu; „Wyjmij bryłę”),
  operacja z bryłą w historii modelu w `js/core/solids.js` (zapis, siatka, odbicie, skalowanie, osie `bodyAxes`), przypisanie
  osi powierzchniom zakrzywionym w `js/core/measure3d.js` (`regionAxis`), tryb „Połącz z…” / „Wytnij…” w
  `js/ui/drawing-scene.js`, wiersze historii i „Wyjmij bryłę” w `js/ui/drawing.js`. Operacje logiczne – **ten sam moduł**
  `js/core/csg.js` z 1.49 (G49–G51, S-4 bez zmian), bez nowego kodu BSP i bez bibliotek. Siatka kuli (48 × 24) przeniesiona
  z `scene-projections.js` do `solids.js`.
- **Funkcje:** suma i różnica dwóch brył ustawionych w scenie (konstrukcyjna geometria brył, CSG) – ogólna funkcja
  programów CAD od lat 70.–80.; zapis operacji w historii modelu bryły (drzewo operacji) – modelowanie z historią, znane
  od końca lat 80.; dopasowanie osi powierzchni obrotowej przez normalne ścian (normalne przecinają oś) – geometria
  analityczna.
- **Patenty:** szczególnego ryzyka nie zidentyfikowano (wyszukiwania patentowego nie robiono – bazy zablokowane,
  AUDIT_LIMITATIONS.md); patenty na modelowanie z historią i operacje logiczne z przełomu lat 80. i 90. wygasły. Interfejs:
  opisowe przyciski w panelu bryły i dotknięcie drugiej bryły, zaznaczona rysowana krawędziami – bez rozpoznawalnych
  elementów cudzych programów (bez nazw handlowych operacji, bez ich ikon).
- Nowe pozycje rejestru algorytmów: G65–G66. Ryzyko wstępnie NISKIE.


## Uzupełnienie: wersja 1.56 (30.10.2026) – strony fiszki (bez zmian w modułach CAD)

- **Zakres:** moduły rysunku i brył bez zmian. Zmiany w nauce z fiszkami: kierunki obrotów (od lewej, od prawej, z góry;
  powrót z dołu – animacja CSS `rotateY` / `rotateX`), treść stron na środku, części stron do wyboru w Nauce i przy pojęciu
  (`js/core/card-faces.js`, `js/ui/screens/study-session.js`, `study-setup.js`, `js/ui/actions.js`), rysunek, zdjęcie albo
  tabela z notatki lekcji użytkownika przypięta do strony fiszki (po sygnaturze); w oknie notatki „Edytuj” i „Zamknij”
  zamienione stronami.
- **Funkcje:** fiszki z kilkoma stronami, wybór treści stron i obraz na karcie – ogólne funkcje programów do nauki
  z fiszkami (fiszki papierowe, programy z powtórkami); kod własny, bez bibliotek i zewnętrznych usług. Nazwy w interfejsie
  opisowe („Własne strony tej fiszki”, „Obrazy z notatki lekcji”, „Przypnij do fiszki”) – bez nazw i układu okien cudzych
  programów. Obrazy i tabele pochodzą wyłącznie z notatek użytkownika – aplikacja nie dołącza cudzych treści.
- **Patenty:** szczególnego ryzyka nie zidentyfikowano (wyszukiwania patentowego nie robiono – bazy zablokowane,
  AUDIT_LIMITATIONS.md).
- Nowych pozycji rejestru algorytmów brak (bez algorytmów geometrii). Ryzyko wstępnie NISKIE.

## Uzupełnienie: wersja 1.56.1 (30.10.2026) – poprawki stron fiszki (bez zmian w modułach CAD)

- **Zakres:** kierunki obrotów fiszki (pierwszy od prawej do lewej, następne z dołu do góry, powrót od lewej do prawej),
  część strony „Obraz” (wszystkie obrazy i tabele z notatki przypięte do pojęcia), wybór obrazów na kafelkach
  z miniaturami w oknie pojęcia (`js/core/card-faces.js`, `js/ui/actions.js`, `js/ui/screens/study-session.js`,
  `study-setup.js`). Miniatury z obrazów i tabel notatek użytkownika, bez zewnętrznych usług.
- **Funkcje:** ogólne elementy interfejsu (kafelki z miniaturą i znacznikiem wyboru, przełącznik części); nazwy opisowe.
- Nowych pozycji rejestru algorytmów brak. Ryzyko wstępnie NISKIE.

## Uzupełnienie: wersja 1.57 (30.10.2026) – gumka przez kształty, kółko narzędzi, pełny ekran obrazu na fiszce

- **Zakres:** `js/core/sketch-erase.js` – zamiana elementu (kształt, bryła, szyk, diagram) na kreski pióra z jego linii
  (obrys, zakończenia, kreskowanie, osie, linie wymiarów; bryła – krawędzie z `solidGeometry`) i cięcie gumką: obszarem
  (wielokąt – ten sam podział kresek brzegiem obszaru `splitByPolygon` co zaznaczanie fragmentów z 1.14) albo kołem
  (`eraseFromStroke` z 1.12.1). `js/core/tool-ring.js` – promień okręgu kółka narzędzi z odstępu kółek (cięciwa
  2·r·sin(krok/2)). `js/ui/zoom-view.js` – powiększenie obrazu z fiszki z animacją przesunięcia i skali (FLIP).
  Stuknięcie w fiszkę obsługiwane przy `touchend` – istniejąca własna funkcja `onTap` (`js/ui/dom.js`, od 0.3.3).
- **Funkcje:** gumka obszarem i rozbijanie obiektu na linie przy edycji to ogólne funkcje programów do rysowania
  i CAD (np. „rozbij”/„explode” jako ogólna idea – nazwa w aplikacji opisowa: „Zaznaczenie”, „Także kształty”);
  powiększanie obrazu z ciemnym tłem (lightbox) – powszechny wzorzec interfejsu. Kod własny, bez bibliotek.
- **Patenty:** szczególnego ryzyka nie zidentyfikowano (wyszukiwania patentowego nie robiono – bazy zablokowane,
  AUDIT_LIMITATIONS.md).
- Nowa pozycja rejestru algorytmów: G67. Ryzyko wstępnie NISKIE.

## Uzupełnienie: wersja 1.58 (30.10.2026) – pierścienie na grzbiecie, odsuwanie zeszytu, kółko narzędzi

- **Zakres:** `js/ui/drawing.js` – grzbiet kartki narysowany jako pierścienie (prostokątne dziurki, w każdej dwie pętle
  drutu – elipsy z połyskiem); szerszy zakres przesuwania widoku (krawędź strony do środka ekranu).
  `js/core/tool-ring.js` – rozkład małych kółek na okręgu o stałym promieniu: widoczne co stały kąt, pozostałe ściśnięte
  w niewidocznej części (odwzorowanie odcinkami liniowe).
- **Funkcje:** wygląd zeszytu na drucie podwójnym – ogólny motyw graficzny, rysunek własny z prymitywów (prostokąt, elipsa),
  bez obrazów cudzych ani bibliotek. Przesuwanie widoku i rozkład elementów na okręgu – ogólne techniki interfejsu.
- **Patenty:** szczególnego ryzyka nie zidentyfikowano (wyszukiwania patentowego nie robiono – bazy zablokowane,
  AUDIT_LIMITATIONS.md). Nowej pozycji rejestru algorytmów nie dodano (geometria trywialna). Ryzyko wstępnie NISKIE.

## Uzupełnienie: wersja 1.59 (30.10.2026) – tablica A0 i rulon

- **Zakres:** `js/core/board.js` – tryb kartki „tablica A0” (wymiary 4 × kartka, proporcje √2), sprawdzenie, czy rysunek
  mieści się w obszarze kartki (granice kresek z `strokeBounds`), obszar obrazu do notatki (prostokąt w proporcjach kartki
  wokół rysunku, przesunięty w obręb tablicy); `js/ui/drawing.js` – rama tablicy, ramka obszaru kartki, kadrowanie obrazu
  do notatki, animacja zwijania w rulon (pas walca z gradientem wzdłuż przekątnej, cień, przycięcie do arkusza).
- **Funkcje:** duży arkusz rysunku, dopasowanie obrazu do zawartości i efekt zwijania kartki – ogólne funkcje programów
  do rysowania i efekty interfejsu; kod własny, bez bibliotek i cudzych obrazów. Nazwy opisowe („Tablica A0”).
- **Patenty:** szczególnego ryzyka nie zidentyfikowano (wyszukiwania patentowego nie robiono – bazy zablokowane,
  AUDIT_LIMITATIONS.md). Nowa pozycja rejestru: G68. Ryzyko wstępnie NISKIE.

## Uzupełnienie: wersja 1.60 (30.10.2026) – edycja notatki w widoku książki

- **Zakres:** `js/ui/notes.js` – pole edycji notatki w kolumnach CSS (strona = szerokość pola), liczenie stron,
  przewracanie do strony z kursorem; `js/ui/note-book.js` – `curlTurn`, wydzielone z podglądu przewrócenie kartki na
  dowolnych elementach (geometria zagięcia z `core/page-curl.js`, już w rejestrze od 1.4). Poza modułami CAD.
- **Funkcje:** edycja w stronach i przewracanie kartek – ogólne funkcje edytorów tekstu i czytników; kod własny, bez
  bibliotek. Nazwy opisowe („Ciągły”, „Książka”).
- **Patenty:** szczególnego ryzyka nie zidentyfikowano (wyszukiwania patentowego nie robiono – bazy zablokowane,
  AUDIT_LIMITATIONS.md). Nowej pozycji rejestru algorytmów geometrii nie dodano. Ryzyko wstępnie NISKIE.

## Uzupełnienie: wersja 1.61 (31.10.2026) – tablica A0 w skali zeszytu, dwie strony w edycji notatki

- **Zakres:** `js/core/board.js`, `js/core/drawing.js` – obszar kartki na środku tablicy, przesunięcie rysunku przy zamianie
  i jednorazowo dla tablic formatu 27; `js/ui/drawing.js` – skala widoku tablicy jak zeszytu, rulon na całym ekranie;
  `js/ui/notes.js`, `js/ui/note-book.js` – dwie kolumny pola edycji, przewracanie przez grzbiet (geometria z podglądu, G-rejestr
  bez zmian).
- **Funkcje i patenty:** bez nowych technik (przesunięcie, skala, kolumny CSS); kod własny, bez bibliotek. Szczególnego
  ryzyka nie zidentyfikowano (wyszukiwania patentowego nie robiono – AUDIT_LIMITATIONS.md). Ryzyko wstępnie NISKIE.
