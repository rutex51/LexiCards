# Wstępne rozpoznanie patentowe (screening) – moduły CAD i wybrane funkcje

Stan: 25 października 2026, commit `9eaa9ac`. **To nie jest analiza Freedom to Operate ani opinia rzecznika
patentowego.** Statusy i daty pochodzą z wyników wyszukiwarki, które cytują Google Patents, Justia lub USPTO.
**Żadnego dokumentu nie zweryfikowano bezpośrednio w bazie.** Espacenet, Google Patents, USPTO (ppubs, Patent Center)
i Justia były niedostępne z sieci środowiska audytu: tunel CONNECT kończył się odpowiedzią 403, a WebFetch błędem DNS.
Bazy Urzędu Patentowego RP nie przeszukano. Nie odczytano treści zastrzeżeń żadnego patentu.

## Zakres i metoda

- **Mechanizmy faktycznie zaimplementowane:**
  - kostka widoków (orientacja modelu);
  - obrót przeciągnięciem (wirtualna kula);
  - menu kołowe narzędzi;
  - szkic → wyciągnięcie / obrót z listą „Historia modelu”;
  - uchwyt długości i kąta;
  - automatyczne rzuty 2D (metoda europejska);
  - krawędzie niewidoczne i bufor głębokości;
  - rozpoznawanie kształtu po przytrzymaniu kreski;
  - animacja zaginanej kartki;
  - planowanie powtórek (FSRS).
- **Klasy CPC właściwe do dalszego wyszukiwania** (w tym audycie nieużyte, bo bazy były niedostępne):
  - G06F 3/04815 – interakcja w środowisku 3D;
  - G06F 3/04845 – manipulowanie obrazem, obrót, przeciąganie;
  - G06F 3/0482 – menu;
  - G06F 3/0483 – środowisko stron, metafora książki;
  - G06F 3/04883 – gesty i pismo odręczne na ekranie dotykowym;
  - G06T 19/20 – edycja modeli 3D;
  - G06T 15/40 – usuwanie części niewidocznych;
  - G06F 30/10 – CAD geometryczny;
  - G06T 17/10 – modelowanie brył.
- **Zapytania (wyszukiwarka internetowa, 10 zapytań):**
  - ViewCube / „three-dimensional orientation indicator and controller”;
  - EP-odpowiednik ViewCube;
  - „configurable viewcube controller”;
  - US7814436;
  - marking / pie menu (Autodesk);
  - wzór przemysłowy Apple na przewracanie strony;
  - Apple – rozpoznawanie kształtów po przytrzymaniu rysika;
  - SolidWorks – drzewo cech;
  - automatyczne rzuty z modelu 3D;
  - uchwyt wyciągnięcia (direct modeling);
  - wirtualna kula / arcball;
  - powtórki w odstępach.

## Wyniki

### P-01. US 7,782,319 B2 – „Three-dimensional orientation indicator and controller” (Autodesk) – **najważniejsze**

- **Publikacja i rodzina:** zgłoszenie US 11/729,211 (publikacja US 2008/0238916 A1), złożone 2007-03-28, udzielone
  2010-08-24. Odpowiednika EP w wynikach nie znaleziono – to nie dowód, że go nie ma.
- **Właściciel:** Autodesk, Inc.
- **Status według Google Patents** (cytowany w wyniku wyszukiwania): „Active – Reinstated”, przewidywane wygaśnięcie
  **2029-03-06**. Google zaznacza, że status jest domniemaniem, a nie wnioskiem prawnym. Niezweryfikowany.
- **Istota według streszczenia** (z wyniku wyszukiwania): trójwymiarowa reprezentacja układu współrzędnych sceny z bieżącym
  punktem widzenia oraz ścianami, krawędziami i narożnikami powiązanymi z punktami widzenia. Manipulacja reprezentacją
  ustawia nowy punkt widzenia i obraca scenę. Autodesk Research opisuje ViewCube jako widżet przeciągany albo klikany
  (ściany, krawędzie, narożniki).
- **Implementacja w aplikacji:**
  - **Pliki:** `js/ui/drawing-solids.js:195-260` (`cubeFaces`, `cubeFaceAt`, `paintViewCube`) i `js/ui/drawing.js`
    (uchwyt `cube` w `boxHandles`, przeciąganie → `orbitQuat`, dotknięcie ściany → `animateSolid`).
  - **Wygląd:** sześcian z napisami PRZÓD/TYŁ/PRAWA/LEWA/GÓRA/DÓŁ obok zaznaczonej bryły.
  - **Działanie:** dotknięcie ściany ustawia ten widok z płynnym przejściem, przeciągnięcie obraca bryłę. Krawędzie
    i narożniki kostki nie są aktywne.
- **Zbieżność ze streszczeniem:**
  - reprezentacja 3D orientacji – tak;
  - ściany powiązane z widokami – tak;
  - manipulacja → nowy widok i obrót modelu – tak;
  - krawędzie i narożniki jako punkty widzenia – nie.
  
  Bez treści zastrzeżeń nie da się ocenić, czy wszystkie elementy któregokolwiek zastrzeżenia niezależnego są spełnione.
- **Wstępne ryzyko:** **WYSOKIE (USA)**. Ochrona patentowa jest terytorialna; dla UE/PL nie zidentyfikowano odpowiednika.
  **Wymaga analizy FTO przez rzecznika patentowego** albo zmiany projektu (REMEDIATION_PLAN R-01).
- **Źródła:**
  - https://patents.google.com/patent/US7782319B2/en
  - https://patents.google.com/patent/US20080238916A1/en
  - https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7782319
  - https://www.research.autodesk.com/publications/viewcube-a-3d-orientation-indicator-and-controller

### P-02. US 9,043,707 B2 – „Configurable viewcube controller” (Autodesk)

- **Publikacja:** zgłoszenie US 13/910,808, pierwszeństwo z wniosku tymczasowego 2012-06-11.
- **Status według Google Patents:** „Active”; data wygaśnięcia nieustalona. Niezweryfikowany.
- **Istota (Justia, z wyniku):** wyświetlanie właściwości lub statystyk sceny na ścianach reprezentacji 3D układu
  współrzędnych.
- **Implementacja:** kostka w aplikacji nie pokazuje statystyk – tylko stałe nazwy widoków.
- **Wstępne ryzyko:** NISKIE. Do sprawdzenia razem z P-01.
- **Źródła:**
  - https://patents.google.com/patent/US9043707
  - https://patents.justia.com/patent/9043707

### P-03. US 8,132,123 (publikacja US 2011/0066963 A1) i US 7,814,436 B2 – „3D scene orientation indicator system with scene orientation change capability”

- **Daty i właściciel:** US 8,132,123 złożony 2010-08-26, przypisany Autodesk (według listy Justia).
  US 7,814,436 – zgłoszenie opublikowane jako US 2005/0028111 (2005-02-03).
- **Status:** nieustalony (wyszukiwanie nie zwróciło danych).
- **Istota (z wyniku):** wskaźnik orientacji w widoku 3D, który przełącza scenę na określony wcześniej punkt widzenia.
- **Wstępne ryzyko:** ŚREDNIE do czasu sprawdzenia zastrzeżeń i statusu. Dotyczy tego samego mechanizmu co P-01.
- **Źródła:**
  - https://patents.google.com/patent/US20110066963A1/en
  - https://patents.google.com/patent/US7814436
  - https://patents.justia.com/patent/20050028111

### P-04. Menu kołowe / „marking menus”

- **Dokumenty:**
  - US 5,689,667 A (pierwotnie Silicon Graphics) – „Expired – Lifetime” według Google Patents;
  - US 5,926,178 A (później m.in. Autodesk) – „Expired – Lifetime”;
  - US 8,832,597 B2 (później Autodesk) – „Expired – Fee Related”;
  - US 6,549,219 B2 „Pie menu graphical user interface” – status niesprawdzony.
- **Implementacja:** kółko narzędzi (`js/ui/drawing-ring.js`, `js/core/tool-ring.js`) – menu kołowe obracane,
  bez wyboru gestem kreski.
- **Wstępne ryzyko:** NISKIE. Główne patenty według Google wygasły (niezweryfikowane); technika jest znana z publikacji
  od lat 80.
- **Źródła:**
  - https://patents.google.com/patent/US5689667A
  - https://patents.google.com/patent/US5926178
  - https://patents.google.com/patent/US8832597B2
  - https://patents.google.com/patent/US6549219

### P-05. US 7,050,960 B2 / EP 1 342 210 B1 – generowanie rysunków z modelu CAD (General Electric)

- **Status:** udzielony 2006-05-23; „Expired – Fee Related” według Google Patents (niezweryfikowane).
- **Implementacja:** przycisk „Rzuty” (`js/core/solids.js:1145-1293`, `js/ui/drawing.js` – `projectSolid`) –
  trzy rzuty prostokątne jako kształty kartki.
- **Wstępne ryzyko:** NISKIE.
- **Źródła:**
  - https://patents.google.com/patent/US7050960B2
  - https://patents.google.com/patent/EP1342210
  - https://data.epo.org/gpi/EP1342210B1

### P-06. US 2012/0078589 A1 – „Unified handle approach for moving and extruding objects in a 3-D editor”

- **Zgłaszający:** według podsumowania wyniku wyszukiwania Siemens (do potwierdzenia).
- **Status:** czy udzielono patentu – nieustalone.
- **Istota (z wyniku):** narzędzie z trybem wyciągania i parą przeciwległych uchwytów po obu stronach początku
  narzędzia; przeciągnięcie uchwytu zmienia obiekt.
- **Implementacja:** jeden uchwyt (ramię od ściany) zmienia długość wyciągnięcia, przeciwna ściana zostaje
  (`js/ui/drawing.js:6624-6648` i gałąź `extent`).
- **Wstępne ryzyko:** NISKIE–ŚREDNIE. Uchwyty manipulatorów są powszechne w CAD; wymaga sprawdzenia statusu i zastrzeżeń.
- **Źródło:** https://patents.justia.com/patent/20120078589

### P-07. US D670,713 S – „Display screen or portion thereof with animated graphical user interface” (Apple) – przewracanie strony

- **Daty:** udzielony 2012-11-13; zgłoszenie z grudnia 2011 (według doniesień prasowych).
- **Wygaśnięcie:** wzór przemysłowy USA ze zgłoszenia sprzed 13 maja 2015 trwa 14 lat od udzielenia. Z wyliczenia
  ustawowego wynika koniec ochrony **2026-11-13** – nie zweryfikowano w USPTO.
- **Istota:** ochrona dotyczy ozdobnego wyglądu animacji przedstawionej na rysunkach, nie samej idei przewracania.
  Rysunków nie pobrano.
- **Implementacja:** przewracanie kartek notatki i rysunku z zagięciem od rogu (`js/core/page-curl.js`, animacja w UI).
- **Wstępne ryzyko:** ŚREDNIE (tylko USA, do ok. 13.11.2026). Prasa wskazuje wcześniejszy stan techniki (BeOS).
- **Źródła:**
  - https://www.mactrast.com/2012/11/apple-receives-design-patents-for-page-turning-animation-and-ipad-smart-case/amp/
  - https://www.smartcompany.com.au/technology/apple-patents-page-turning-animation-on-ebooks-despite-prior-art-in-beos/

### P-12 – P-14. Inne rodziny dotyczące przewracania strony (uzupełnienie z 25.10.2026, po pytaniu właściciela)

Wyszukiwanie: wyłącznie wyszukiwarka internetowa (bazy patentowe nadal zablokowane – AUDIT_LIMITATIONS.md). Zastrzeżeń
nie odczytano; statusy – z wyników wyszukiwania, niezweryfikowane w USPTO.

- **P-12. US 9,911,221 B2 – „Animated page turning” (Google LLC).** Status „Active” według Google Patents. Według
  streszczenia: strona zaginana na wirtualnym walcu (cylindrze) w trakcie przewracania.
  Źródło: https://patents.google.com/patent/US9911221
- **P-13. US 7,667,703 B2 (Palo Alto Research Center) i US 7,898,541 B2 (kontynuacja częściowa).** Przewracanie stron
  w dokumencie elektronicznym. US 7,667,703 – „Expired – Fee Related” według Google Patents; status US 7,898,541 –
  nieustalony. Źródła: https://patents.google.com/patent/US7667703, https://patents.google.com/patent/US7898541
- **P-14. Zgłoszenie Microsoft z 2009 r.** (zawijanie strony z prześwitującym płatem) – znane z prasy; numeru i tego, czy
  udzielono patentu, nie ustalono. Źródło: https://techcrunch.com/2010/07/08/microsoft-tries-to-patent-virtual-page-turning-technique-should-apple-be-worried/
- **Implementacja w aplikacji:** `js/core/page-curl.js` – **płaskie zgięcie papieru**: zgięcie to symetralna odcinka
  róg → wskaźnik, zagięta część kartki odbita względem zgięcia (macierz odbicia), podział kartki obcinaniem wielokąta
  półpłaszczyzną (Sutherland–Hodgman). Bez walca, bez siatki 3D i bez prześwitywania płata – inna technika niż opisana
  w streszczeniu P-12.
- **Wstępne ryzyko:** NISKIE (P-12 – technika z walcem, inna niż płaskie odbicie; P-13 – wygasły lub nieustalony; P-14 –
  nieustalony). Formalnie wymaga odczytu zastrzeżeń niezależnych P-12 (R-07).

### P-08. Rozpoznawanie kształtu po przytrzymaniu kreski

- **Wynik:** nie znaleziono patentu na samo zachowanie „narysuj i przytrzymaj → figura” (znane z iPadOS 14).
  Najbliższy wynik to US 8,749,497 „Multi-touch shape drawing” (Apple według wyniku) – dotyczy gestów wielodotykowych.
- **Implementacja:** `js/core/recognize.js` – jedna kreska, przytrzymanie ok. ½ s, klasyfikacja regułowa.
- **Wstępne ryzyko:** NISKIE. Wymaga jednak celowanego wyszukiwania w bazach (klasa G06F 3/04883).
- **Źródło:** https://patents.justia.com/patent/8749497

### P-09. US 5,815,154 A – „Graphical browser system for displaying and manipulating a computer model” (SolidWorks)

- **Status:** „Expired” według Google Patents (niezweryfikowane).
- **Implementacja:** „Historia modelu” w oknie bryły – statyczna lista „1. Szkic / 2. Operacja” z przyciskiem „Edytuj
  szkic”. Bez drzewa, przeciągania kolejności i przebudowy modelu.
- **Wstępne ryzyko:** NISKIE.
- **Źródło:** https://patents.google.com/patent/US5815154

### Pozostałe mechanizmy

- **Wirtualna kula (obrót przeciągnięciem):** publikacje 1988 (virtual sphere) i 1992 (Arcball). Patentu nie znaleziono.
  Ryzyko NISKIE. Źródło: https://graphicsinterface.org/wp-content/uploads/gi1992-18.pdf
- **Krawędzie niewidoczne, bufor głębokości, rzuty prostokątne, szkic → wyciągnięcie / obrót:** techniki od lat 60.–80.
  Patentów nie szukano szczegółowo. Ryzyko ocenione jako NISKIE na podstawie wieku technik, nie wyników wyszukiwania.
- **Planowanie powtórek (FSRS):** w jednym wyszukiwaniu nie znaleziono patentu. FSRS jest projektem open source (MIT).
  Brak wniosku – wymaga wyszukiwania w bazach.

## Podsumowanie

| | Liczba |
| --- | --- |
| Dokumenty patentowe zidentyfikowane (metadane z wyszukiwarki) | 17 (12 patentów US, 4 publikacje zgłoszeń US, 1 patent EP) |
| Dokumenty z odczytaną treścią zastrzeżeń | 0 |
| Rodziny potencjalnie istotne | 5 (orientacja Autodesk – P-01 i P-03, co najmniej dwie rodziny; uchwyt – P-06; przewracanie strony – P-07; kształty – P-08) |
| Nierozstrzygnięte ryzyka patentowe | 4 (P-01 wysokie, P-03 średnie, P-07 średnie, P-06 niskie–średnie) |

Funkcje wymagające formalnej analizy FTO przed sprzedażą w USA: **kostka widoków** (P-01, P-03) i **animacja
przewracania strony** (P-07 – do jej wygaśnięcia).

Uzupełnienie z 25.10.2026: kostkę widoków usunięto w wersji 1.48.1 (R-01). Dopisano P-12 – P-14 (inne rodziny
dotyczące przewracania strony: 3 patenty US i 1 zgłoszenie bez numeru) – ryzyko NISKIE, bez zmian w aplikacji.
