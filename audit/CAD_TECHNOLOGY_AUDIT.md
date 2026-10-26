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

