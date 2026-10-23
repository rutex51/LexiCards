# LexiCards 1.45 – schematy procesów: schemat blokowy, łącznik, tory, VSM, koncentracja wad, spaghetti

Wersja 1.45.0, 23 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Schematy procesów”).

Druga część narzędzi Six Sigma / Lean (pierwsza – 1.44: Ishikawa, 5 × Dlaczego, SIPOC, układ kartki). Wykresy z tabel –
później, zgodnie z ustaleniem.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| Grupa **Procesy** | Nowa grupa na prawym kółku: **Start/stop**, **Dane**, **Dokument**, **Podproces**, **Łącznik**, **VSM**, **Oś czasu**, **Wady**. Zestaw **Procesy / VSM** w oknie „Grupy narzędzi” – te pozycje oraz prostokąt (proces), romb (decyzja), punkt i karteczka. Na telefonie rząd przewija się w bok (jak Kształty). |
| Schemat blokowy | Start/stop – półokrągłe boki; Dane – równoległobok; Dokument – falisty dół; Podproces – pionowe linie przy bokach. Rysowane przeciągnięciem jak prostokąt: tekst na kształcie, wypełnienie, rodzaj linii, uchwyty, pole i obwód. |
| Łącznik | Strzałka pod kątem prostym. Końce przyciągają się i przyklejają do kształtów, a przebieg wynika z krawędzi: z boku – w poziomie, z góry albo z dołu – w pionie, różne – jedno załamanie. Przesunięty kształt ciągnie za sobą łącznik. Zaznaczony łącznik – **Przebieg** w trzecim menu: poziomo, pionowo, w bok i w pionie, w pionie i w bok. Grot na końcu (zakończenia zmienia się jak przy strzałce). |
| Tory (swimlanes) | Nowy rodzaj w oknie **Układ kartki**: 2–6 poziomych pasów z nazwami działów po lewej (domyślnie Klient, Biuro, Produkcja, Kontrola jakości). Tło kartki – jak inne układy (obraz w notatce, PDF, DXF – warstwa UKLAD). |
| Symbol VSM | Okno z rodzajem: proces (nazwa i dane: C/T, C/O, dostępność…), zapas (trójkąt z I, pod nim ilość i dni), dostawca / klient (fabryka), supermarket, strzałka push, kaizen, operator, transport. Wielkość i kolor – jak diagramy. |
| Oś czasu VSM | Kroki: oczekiwanie (górna linia) i praca (dolna linia), jednostki (s, min, h, dni) i długość dnia (24 – doba, 8 – zmiana). Na końcu: czas przejścia (w jednostce oczekiwania), wartość dodana (w jednostce pracy) i PCE. Krok można dodać (do 10) i usunąć. |
| Koncentracja wad | **Wady** wstawia legendę: każda wada ma nazwę, znacznik (jak narzędzie Punkt: punkt symetrii, kropka, krzyżyk, środek) i kolor. Legenda sama liczy punkty kartki z tym znacznikiem i kolorem (i sumę). **Zaznaczaj tę wadę** zapisuje legendę i włącza Punkt z jej znacznikiem i kolorem. Dwie wady z tym samym znacznikiem i kolorem – komunikat. |
| Spaghetti (długość tras) | Zaznaczone linie – odcinki, łączniki, łamane, łuki, strzałki po łuku, kreski pióra – pokazują w pasku zaznaczenia **długość** (kilka – **długość razem**) w jednostkach rysunku. Trasę ruchu rysujesz piórem albo łamaną na planie stanowiska. |

Zmiany przy okazji:

- Narzędzie Punkt: gdy zaznaczone są same punkty (np. właśnie postawiony znacznik), dotknięcie obok od razu stawia kolejny
  punkt. Wcześniej pierwsze dotknięcie tylko zdejmowało zaznaczenie. Przy innym zaznaczeniu jest jak dotąd.
- Format rysunku **17** (nowe kształty i diagramy, układ „tory”); starsza wersja aplikacji je pominie przy zapisie.
- DXF: kształty schematu i łącznik – polilinie (grot łącznika, jak grot strzałki, nie trafia do DXF), linie podprocesu,
  symbole VSM, oś czasu i legenda wad (liczby i znaczniki w kolorach wad).

## Testy, które wykonano

- **Testy logiki (Node.js): 469 – wszystkie zaliczone** (9 nowych: kształty schematu – obrysy, pole, linie podprocesu,
  zapis; łącznik – przebiegi, domyślny, zapis tylko innego, przebieg z kierunków końców, obrys, grot wzdłuż ostatniego odcinka,
  bez załamań na prostej, bez odsuwania i przycinania, przyciąganie, przyklejony koniec za przesuniętym kształtem; długość linii – odcinek, łącznik, pióro, figury bez
  długości, suma; tory; symbole VSM – osiem rodzajów w obrysie, dane procesu, zapas, push, sprawdzanie zapisu; oś czasu –
  sumy, PCE z długością dnia, sprawdzanie; legenda wad – liczenie, „–” bez kresek, sprawdzanie; DXF; grupa, zestaw,
  format 17, zakończenia łącznika w ustawieniach).
- **Testy w przeglądarce (Chromium): 215 – wszystkie zaliczone w dwóch pełnych przebiegach** (2 nowe):
  - komputer: grupa Procesy; tory z własnymi nazwami; sześć kształtów schematu i cztery łączniki od krawędzi do krawędzi
    (przyklejone końce i przebiegi zapisane w danych, linia łącznika sprawdzona pikselami przed i po zmianie przebiegu
    w trzecim menu); długość łącznika i suma dwóch odcinków zaznaczonych prostokątem; druga kartka – proces z danymi,
    zapas i oś czasu (błąd w liczbie – komunikat), czas przejścia w danych; trzecia kartka – legenda wad (ta sama para
    znacznik + kolor – komunikat), „Zaznaczaj tę wadę”, trzy znaczniki trzema dotknięciami, liczba w legendzie; DXF kartki;
  - telefon (390 px): pozycje grupy dają się przewinąć na ekran, okna symbolu VSM, legendy wad i osi czasu bez przewijania
    w bok.
  - Poprawione starsze testy: listy grup na kółku i w oknie „Grupy narzędzi” (Procesy na końcu), listy zestawów, numer
    formatu rysunku (17).
  - Własne testy 1.45 poprawione po celowych uruchomieniach: pasek zaznaczenia świeżo narysowanego kształtu zasłaniał
    miejsce następnego przeciągnięcia (test odznacza teraz po każdym kształcie); nowa kartka ma inny widok niż pierwsza
    (test liczy położenie od nowa).
  - Błędy aplikacji wykryte przez te testy i poprawione: łącznik bez grotu (brak ustawienia zakończeń łącznika); zestaw
    i grupa o tym samym identyfikatorze; po „Zaznaczaj tę wadę” menu zostawało na grupie Procesy (Punktu nie było widać),
    a pierwsze dotknięcie tylko odznaczało legendę; na telefonie etykieta „Oczekiwanie w” łamała się i rozjeżdżała pola.
- **Lint: bez błędów.**
- Zrzuty (Chromium): schemat na torach z łącznikami, VSM (proces, zapas, oś czasu), legenda wad ze znacznikami, okno osi
  czasu na telefonie.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – dotknięcia udawane myszą w Chromium.
- Przebieg łącznika przy obróconych kształtach (kierunek liczony z normalnej krawędzi – sprawdzony tylko przy prostych).
- Plik DXF w programie CAD – sprawdzony odczytem z powrotem w aplikacji.
- Ciemny motyw.
