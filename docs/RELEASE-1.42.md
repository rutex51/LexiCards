# LexiCards 1.42 – przyciąganie i wymiary: zaległości pakietów A i B

Wersja 1.42.0, 23 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Przyciąganie i wymiary –
zaległości pakietów A i B”).

Uzupełnienie planu „rysunek jak w CAD”: to, czego brakowało w pakiecie A (rysowanie i przyciąganie) i B (wymiary) po
etapach C i D. Następne wydanie – pakiet E (edycja geometrii).

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| Przyciąganie do środka kształtu | Koniec odcinka, wymiaru, punkt okręgu i łuku przyciąga się do środka prostokąta, rombu, trapezu, wielokąta (środek ciężkości trójkąta i wielokąta, środek okręgu opisanego wielokąta foremnego) – znacznik: kółko z krzyżykiem. Przyklejony koniec idzie za kształtem. |
| Środek boku | Trójkątny znacznik na środku boku (bok dłuższy niż zasięg przyciągania); przyklejony koniec zostaje na środku, gdy bok się wydłuża. |
| Przecięcie | Znacznik × w miejscu przecięcia dwóch linii (kształty, proste, ramki, kreski pióra); koniec przykleja się do krawędzi jednej z nich. |
| Kreski pióra | Koniec kreski i jej linia przyciągają – bez przyklejania (kreska nie ma punktów do zapamiętania). |
| Wymiar poziomy i pionowy | **Długość** ma pod menu **Równoległy / Poziomy / Pionowy**. Poziomy mierzy odległość w poziomie – linia wymiarowa pozioma za skrajnym punktem; pionowy – w pionie, liczba czytana od dołu. Zaznaczonemu wymiarowi kierunek zmienisz w trzecim menu (**Kierunek**). |
| Łańcuch i od bazy | Nad zaznaczonym wymiarem długości: **Łańcuch** – każde dotknięcie punktu dodaje wymiar od końca poprzedniego, w tej samej linii; **Od bazy** – od początku wymiaru bazowego, każdy piętro dalej. Esc – koniec; każdy wymiar to jeden krok cofania. |
| Długość łuku | Narzędzie **Dł. łuku** w grupie Wymiary (i w zestawie Metrologia): dotknij łuku – łuk wymiarowy na zewnątrz i liczba ze znakiem ⌒ wzdłuż łuku. Odsunięcie – uchwytem przy liczbie; tolerancje jak wymiaru długości. |
| Łuk ze środka | **Łuk** ma pod menu **3 pkt** albo **Środek**: dotknij środka, początku (promień) i końca (kierunek) – łuk biegnie od początku do końca przeciwnie do ruchu wskazówek zegara. |
| Osie okręgu | Okrąg i elipsa – **Osie** w trzecim menu: krzyż linii osiowych przez środek, wystający poza obrys (znacznik środka); także dla zaznaczonych. W DXF – linie z rodzajem CENTER. |
| Pole ⌀ okręgu | Zaznaczony okrąg ma jedno pole ze znakiem ⌀ – wpisana średnica zmienia oba boki (pole wysokości schowane). |
| Ramka A4 pionowo | Okno ramki rysunkowej: **A4 poziomo**, **A4 pionowo**, **A3 poziomo**. W pionie tabliczka zajmuje całą szerokość ramki; w tabliczce format „A4”. |

Zasady, które warto znać:

- Wymiar długości łuku nie jest przyklejony do łuku – po przesunięciu albo zmianie łuku przesuń (zmień) też wymiar.
- Przy wymiarze poziomym przeciągniętym między przeciwległymi narożnikami prostokąta strona linii wymiarowej zależy od tego,
  który punkt jest wyżej; drugą stronę ustawisz uchwytem przy liczbie.
- Łańcuch i od bazy biorą kierunek wymiaru bazowego (poziomy, pionowy albo równoległy).
- Rysunek ma format 15. Starsza wersja aplikacji pominie przy zapisie wymiary długości łuku, a wymiar poziomy i pionowy
  pokaże jako równoległy.
- Przy okazji: okrąg rysowany ze środka i z punktów zachowuje kreskowanie narzędzia (w 1.40 je gubił).

## Testy, które wykonano

- **Testy logiki (Node.js): 441 – wszystkie zaliczone** (7 nowych: przyciąganie – środek prostokąta i trójkąta, środek
  boku idzie za wydłużonym bokiem, krawędź jak dotąd, krótki bok bez środka; przecięcie odcinka z bokiem, kreski pióra z odcinkiem
  i dwóch kresek, koniec i linia kreski bez przyklejenia; wymiar poziomy i pionowy – wartości 4,55 i 2,27 cm, położenie linii,
  odsunięcie z uchwytu, zapis; łuk ze środka – ćwiartka, trzy czwarte, przypadki bez łuku; długość łuku – ⌒3,57 cm, geometria,
  tolerancja w mm, zapis, DXF; osie okręgu – linie, obrys, zapis, DXF z CENTER, kreskowanie okręgu; arkusz A4 pionowo,
  ustawienia narzędzi, format 15).
- **Testy w przeglądarce (Chromium): 209 – wszystkie zaliczone w dwóch pełnych przebiegach** (2 nowe):
  - komputer: odcinek od środka boku (znacznik pod myszą) do środka prostokąta – oba końce przyklejone; wymiar poziomy,
    dwa od bazy i łańcuchowy (piętra i ta sama linia sprawdzone w zapisanych danych); łuk ze środka; długość łuku π cm; okrąg
    z osiami i polem ⌀ (3 cm – oba boki); ramka A4 pionowo (skala z kratki 1,19:1); zapis rysunku;
  - telefon (390 px): wybór kierunku wymiaru i sposobu rysowania łuku mieści się na ekranie, wymiar pionowy krawędzi,
    przyciski Łańcuch i Od bazy na pasku zaznaczenia.
  - Poprawione starsze testy: lista narzędzi grupy Wymiary i zestawu Metrologia (doszła długość łuku), komunikat ramki
    („Ramka A4 poziomo z tabliczką”); w testach przyciągania z 1.22 i 1.22.1 dotknięcie krawędzi przesunięte z dala od
    środka boku – pierwszy pełny przebieg pokazał, że koniec odcinka i strzałka ramki tolerancji przyciągały się teraz do
    środka boku (zamierzona zmiana 1.42); test okręgów z 1.34 sprawdza teraz, że okrąg ma jedno pole ⌀ (zamiast pola
    wysokości).
  - Niestabilność: w jednym z celowanych uruchomień testów rysunku 1.3x raz nie przeszedł test 1.38 (wymiary graniczne;
    różnica w zapisanych oznaczeniach wymiaru). Osobno (4 razy), w dwóch kolejnych celowanych uruchomieniach i w obu
    pełnych przebiegach – zaliczony; przyczyny nie ustalono.
- **Lint: bez błędów.**
- Zrzuty (Chromium): znacznik środka boku, wymiary od bazy i łańcuch, łuk z wymiarem długości i okrąg z osiami, ramka A4
  pionowo, wybór kierunku wymiaru na telefonie.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – dotknięcia udawane myszą w Chromium.
- Plik DXF z wymiarem długości łuku i osiami w programie CAD (sprawdzony tylko odczyt własnym czytnikiem).
- Ciemny motyw.
