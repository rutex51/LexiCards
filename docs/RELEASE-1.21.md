# LexiCards 1.21 – tabele w notatkach („Tab. N.”) i na rysunku, okno grubości zakreślacza, karteczki na rysunku

Wersja 1.21.0, 20 października 2026. Druga część paczki uwag. Dalej: 1.22 – rysunek: liniuszek
promieniowy, przewracanie kartek kółkiem z animacją, wymiarowanie techniczne z tolerancjami i GD&T,
przyciąganie (magnes wł./wył., ok. 3 mm, jak w zaakceptowanej propozycji); 1.23 – eksport do kalendarza
(.ics). Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Treść notatki” – „Od 1.21 tabele”,
rysunki – „Od 1.21 (format rysunku 6)”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Tabele w notatkach – jako obiekty, jak obrazy: sygnatura, odwołanie w tekście, podpis „Tab. N.” nad tabelą, osobna numeracja | Sekcja **Tabele** w edytorze (między obrazami a załącznikami) – **Dodaj tabelę**. Kafelek „Tabela 1” (np. „5 × 3”) ma menu jak obraz: **Edytuj tabelę**, **Wstaw do tekstu** (`[[Tabela 1]]`), **Zmień sygnaturę**, **Dodaj podpis**, **Przesuń wcześniej / dalej**, **Usuń tabelę**. Sygnatury tabel i obrazów są wspólne – każda jedna w notatce; po zmianie sygnatury odwołania zmieniają się same. Podpis stoi **nad tabelą**, z numeracją – „Tab. 1. Koszty stałe” (tabele liczone osobno od rysunków). Przełącznik nazywa się teraz **Numeruj obrazy i tabele w podglądzie** |
| Okno tabeli: wpisywanie, wiersze i kolumny, wklejanie z Excela | Siatka pól (nowa tabela 3 × 3), **+ / − Wiersz** i **+ / − Kolumna** przy komórce z kursorem, strzałki wyrównania nad kolumnami (lewo, środek, prawo), **Pierwszy wiersz – nagłówek** (domyślnie) i **Pierwsza kolumna – nagłówki wierszy**. Tab – następna komórka, Enter – nowy wiersz w komórce. **Wklejenie** zaznaczonych komórek Excela albo tabeli z Worda, OneNote czy strony WWW wypełnia komórki od kursora i powiększa tabelę (do 100 wierszy i 12 kolumn); wklejone do pustej tabeli – tabela ma dokładnie wielkość fragmentu |
| Tabela dłuższa niż strona – podział po wierszach | W podglądzie tabela dzieli się **po wierszach**; na każdej następnej stronie znów jest wiersz nagłówka, podpis – tylko nad pierwszą częścią. Szersza niż strona – przewija się w bok (telefon) |
| Tabela w „Kopiuj”, PDF, eksporcie | **Kopiuj notatkę** – prawdziwa tabela (obramowanie, nagłówek z tłem, wyrównanie) z podpisem w miejscu odwołania; zwykły tekst – komórki po tabulatorze (wkleja się do Excela). **PDF** – tabela z nagłówkiem powtarzanym na każdej stronie wydruku. **Eksport do XLSX** – komórka arkusza nie ma tabel, więc tabela jest tekstem: „Tabela 1 – Koszty stałe” i wiersze „a \| b \| c” (nagłówek pogrubiony). **Czytanie na głos i słuchanie** czytają wiersze (komórki po przecinku) |
| Tabele w edytorze rysunku i na zdjęciu | Przycisk z siatką za narzędziami – to samo okno tabeli (z wklejaniem), a pod siatką **wielkość tekstu** (Mała, Średnia, Duża, Bardzo duża) i **kolor**. Tabela pojawia się na środku widocznej części strony z szerokością według treści i jest zaznaczona: przeciągnięcie przesuwa, **narożnik zmienia szerokość** (tekst się zawija, wysokość z treści), dotknięcie albo **Edytuj** – poprawka. Kopiuj, Powiel, Osadź, Usuń – jak inne elementy. Na zdjęciu („Rysuj na zdjęciu”) tak samo |
| Okno grubości zakreślacza jak przy piórze | Drugie dotknięcie aktywnego zakreślacza: **Kropka na pasku** (Cienka, Średnia, Gruba) i suwak **Grubość 4–60** dla wybranej kropki, z podglądem (zakreślony napis). Każda kropka ma swoją grubość, zapamiętaną na urządzeniu (dotąd stałe 14 / 24 / 36 – to nadal wartości domyślne) |
| Karteczki na rysunku (A) z przełącznikami: zwinięcie (B), strzałka (C), „Widoczna na obrazie w notatce” | Przycisk z kartką – okno **Nowa karteczka**: tekst (z symbolami), **pięć kolorów** (żółta, różowa, zielona, niebieska, pomarańczowa; ostatni zostaje), wielkość tekstu, przełączniki **Zwinięta – tylko ikona**, **Strzałka do miejsca**, **Widoczna na obrazie w notatce**. Karteczka – z cieniem i zagiętym rogiem, rośnie z tekstem, narożnik zmienia wielkość. **Strzałka** w ciemniejszym odcieniu karteczki – koniec (kółko) przeciągasz; przesunięcie samej karteczki zostawia koniec na miejscu. **Zwinięta** – ikona z numerem (kolejność dodania); zaznaczona pokazuje obok treść z nagłówkiem „Karteczka 2 · 20.10.2026” (data dodania). Nad zaznaczoną karteczką **Zwiń / Rozwiń**. **Niewidoczna na obrazie** – tylko w edytorze (przerywana obwódka), obraz rysunku w notatce jej nie ma |

Szczegóły:

- **Pasek rysunku na telefonie:** tabela i karteczka są w pierwszym wierszu z narzędziami (przyciski
  narzędzi węższe: 36 zamiast 40 px), więc pasek nadal ma trzy wiersze – także przy szerokości 375 px
  (iPhone SE, mini).
- **Pasek rysunku na iPadzie** (i w oknie węższym niż 1280 px): przycisk tła ma krótki napis **Tło**
  (pełny – „Tło: kratka i szablon” – w podpowiedzi i w panelu), bo z tabelą i karteczką pasek z dłuższym
  napisem zawijał się do dwóch wierszy. Przy okazji poprawka: przejście na inną kartkę (PageUp,
  PageDown, menu kartek) układało stronę pod paskiem w starej wysokości – gdy pasek kartki miał inną
  wysokość, strona była przesunięta i pomniejszona. Teraz najpierw zmienia się pasek, potem układ strony.
- **Polecenia nad zaznaczeniem** omijają treść zwiniętej karteczki (stoją nad nią albo pod nią).
- **Nowy element na rysunku** szuka wolnego miejsca według tego, co naprawdę zajmuje stronę – zwinięta
  karteczka zajmuje tylko miejsce ikony.
- **Zapis:** notatka ma nowe pole `tables`, rysunek – format 6 (elementy `table` i `sticky`). Kopia
  zapasowa przenosi tabele notatek i elementy rysunków. **Starsza wersja aplikacji** (np. na drugim
  urządzeniu przed aktualizacją) nie zna tabel: w podglądzie notatki zobaczy czerwone `[[Tabela 1]]`,
  a przy poprawce notatki zapisze ją bez tabel; rysunek pokaże jako obraz (z tabelami i karteczkami),
  ale przy poprawce rysunku zapisze go bez nich. Dlatego zaktualizuj aplikację na obu urządzeniach
  przed przenoszeniem danych.
- **Na zdjęciu** tabela i karteczka mają wielkość w punktach zdjęcia (jak pola tekstowe) – na małym
  zdjęciu (np. 512 px) są duże; wtedy wybierz mniejszy tekst albo zmniejsz karteczkę narożnikiem.

## Testy, które wykonano

- **Testy logiki (Node.js): 324 – wszystkie zaliczone** (316 wcześniejszych + 8 nowych):
  - tabela: sprawdzanie danych (wiersze dopełnione do prostokąta, limity wierszy, kolumn i znaków,
    nagłówek domyślnie, złe wyrównanie – do lewej); wklejanie z Excela (tabulatory, komórka
    w cudzysłowie z nowym wierszem) i tabeli HTML z Worda (colspan, akapity w komórce, znaki `&` `<`);
  - sygnatury „Tabela N” – wolne także wśród sygnatur obrazów, powtórzona zastąpiona, limit 30 tabel,
    numery „Tab. N.” w kolejności podglądu (najpierw tabele w kolejności odwołań, potem pozostałe),
    podpis „Tab. 2. Koszty” / „Tab. 2.” / sam podpis;
  - HTML tabeli (`<thead>`, nagłówki wierszy, wyrównanie, znaki, zakres wierszy dla podziału stron),
    wersja dla Worda ze stylami w komórkach, tekst z tabulatorami, linijki arkusza „a | b | c”;
  - zapis w bibliotece (notatka z samą tabelą też jest notatką; zapis bez pola `tables` zostawia
    tabele, 31 tabel – komunikat), kopia lekcji, kopia zapasowa (zapis i sprawdzenie; uszkodzona
    tabela pominięta), eksport do XLSX jako tekst;
  - rysunek: sprawdzanie tabeli i karteczki (złe dane pominięte, kolor spoza listy – żółty, data),
    zwinięta karteczka zajmuje ikonę, strzałka w granicach, dotknięciu, zaznaczaniu prostokątem
    i przesunięciu, szyk pomija tabele i karteczki;
  - ustawienia narzędzi: trzy grubości zakreślacza (4–60) i kolor karteczki zapamiętane, złe –
    domyślne; zakreślacz do 60, pióro nadal do 40;
  - słuchanie: tabela w miejscu odwołania (podpis i wiersze, komórki po przecinku), tabela bez
    odwołania po tekście (albo przed nim), każda tabela raz także przy „PL + EN”.
- **Testy w przeglądarce (Chromium): 148 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (145 wcześniejszych + 3 nowe):
  - ekran komputera: nowa tabela – pusta nie zapisuje się (komunikat); wklejony fragment arkusza
    4 × 3 („Wklejono 4 × 3”); wiersz pod „Media” i kolumna przy kursorze (dodana i usunięta);
    druga kolumna do prawej; kafelek „Tabela 1”, „5 × 3”; **Wstaw do tekstu** w miejscu kursora,
    podpis „Koszty stałe”, numeracja; zapisany HTML z `[[Tabela 1]]` i zapisana tabela (wiersze,
    nagłówek, wyrównanie, podpis); podgląd: tabela między akapitami, „Tab. 1. Koszty stałe” nad nią,
    nagłówek, 4 wiersze, wyrównanie do prawej; **Kopiuj** – podpis przed tabelą, tabela w miejscu
    odwołania, zwykły tekst z tabulatorami bez `[[…]]`; **PDF** – tabela z nagłówkiem i podpisem
    w wydruku; poprawka komórki i zmiana sygnatury na „Koszty” – odwołanie zmienia się samo;
  - ekran telefonu: tabela 31 wierszy (nagłówek + 30) dzieli się na kilka stron – nagłówek na każdej
    stronie z tabelą, podpis tylko na pierwszej, każdy wiersz dokładnie raz i po kolei; okno tabeli –
    siatka przewija się w bok, strona nie;
  - ekran iPada (rysunek): okno zakreślacza – gruba kropka 52, kreska zapisana z grubością 52;
    tabela z wklejenia, wielkość „Duża” (34) – słowa nagłówka w jednym wierszu („Wymiar”,
    „Wartość”); karteczka różowa ze strzałką i zielona – zwinięta i niewidoczna na obrazie; zapis
    (tekst, kolor, data, zwinięcie, ukrycie); obraz rysunku w notatce – różowa karteczka jest
    (piksel `#ffc2d4`), zielonej nie ma; poprawka: tabela szersza narożnikiem o 200, koniec strzałki
    przeciągnięty, karteczka przesunięta o 100 w górę z końcem strzałki na miejscu; zwinięta
    karteczka zaznaczona – polecenia nie zasłaniają jej treści.
  - Poprawione testy wcześniejsze: kolejność sekcji edytora notatki (doszły „Tabele”); test linku
    z 1.20 czeka, aż okno ustawi kursor w polu adresu (pod dużym obciążeniem tekst linku trafiał do
    adresu – zdarzyło się raz w przebiegu próbnym, człowiek tak szybko nie pisze); test kartek z 1.19
    sprawdza też pasek w jednym wierszu z szablonem (iPad) i kartkę 1 w tym samym miejscu po PageUp.
  - **Błąd znaleziony testami:** test kartek z 1.19 nie przechodził w pełnych przebiegach (2 z 3) –
    przyczyną był pasek zawinięty do dwóch wierszy i kolejność przy zmianie kartki (opisane wyżej).
    Pod sztucznym obciążeniem procesora: kod 1.20 – 3 z 3 zaliczone, 1.21 przed poprawką – 0 z 3,
    po poprawce – 3 z 3; potem wszystkie 19 testów rysunku i dwa nowe pełne przebiegi.
- Sprawdzenia robocze (poza zestawem testów, Chromium): tabela i karteczka na zdjęciu („Rysuj na
  zdjęciu”, ekran iPada) – zapisane w rysunku zdjęcia; pasek rysunku na telefonie 390 i 375 px – trzy
  wiersze, bez przewijania strony w bok; **PDF** notatki z tabelą 81 wierszy (nagłówek + 80) – 3 strony
  A4, wiersz nagłówka na każdej, każdy wiersz raz, podpis „Tab. 1. Pozycje” tylko na pierwszej.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno tabeli, kafelek i podgląd tabeli (komputer); druga strona długiej tabeli
  i okno tabeli (telefon); okno zakreślacza, okno karteczki, tabela z karteczkami, zwinięta karteczka
  z treścią (iPad).

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** – testy działają w Chromium z ekranem telefonu i iPada, nie w Safari
  na iOS. Do sprawdzenia u Ciebie: wklejanie komórek z Excela i tabeli z Worda w oknie tabeli na iPadzie
  (Safari daje schowek inaczej niż Chromium – gdyby wkleiło się wszystko do jednej komórki, daj znać);
  pola komórek rosnące z tekstem (`field-sizing` – w starszym iOS zastępuje je skrypt); rysikiem –
  przeciąganie narożnika tabeli i końca strzałki karteczki.
- **Wklejenie do Worda i OneNote** z „Kopiuj notatkę” – nie sprawdzone (brak Worda w środowisku
  testów); sprawdzony jest HTML w schowku (tabela ze stylami w komórkach, podpis, tekst z tabulatorami).
- **Wklejenie z prawdziwego Excela** – w testach schowek ma tekst z tabulatorami taki, jaki daje Excel;
  samego Excela nie było.
- **PDF z tabelą na wielu stronach w Edge i w Safari** – powtarzanie nagłówka na stronach wydruku
  sprawdzone tylko w Chromium (PDF z Chromium – wyżej).

## Uzupełnienie w wersji 1.21.1 – wybór daty i godziny

| Prośba | Jak jest zrobione |
| --- | --- |
| Bardziej nowoczesny wybór godziny i daty na Windows (Edge i Chrome pokazują starą listę kolumn); z propozycji – godzina: bębny (wariant B) | Własne okno aplikacji zamiast pól przeglądarki – na wszystkich urządzeniach jednakowe. **Inna data lub godzina…** (notatka → Data i godzina): u góry pełna data („wtorek, 20 października 2026, 15:35”) i „Wstawi się: …”, przełącznik **Data i godzina / Data / Godzina**, **kalendarz** (dni od poniedziałku, dziś w obwódce, ‹ › – miesiące, nazwa miesiąca – wybór miesiąca i roku; **Dziś**, **Jutro**, **Za tydzień**) i **bębny** godzin i minut: kółko myszy (ząbek – jedna liczba), przeciągnięcie myszą, palec, strzałki ↑ ↓, PageUp / PageDown (6 godzin, 10 minut), dotknięcie liczby; bęben się zapętla (za 59 – 00, za 23 – 00). Cyfry na bębnie godzin – „1533” to 15:33, Enter wstawia. Skróty **Teraz**, **Pełna godzina**, **+15 min**. Na komputerze kalendarz i bębny obok siebie, na telefonie jeden pod drugim |
| (z propozycji) okres w filtrze „Utworzone” | **Wybrany okres…** od razu otwiera kalendarz okresu: pierwszy dzień, ostatni dzień (pasmo między nimi, na komputerze – podgląd pod kursorem), u góry „5 – 16 października 2026” i „12 dni”; dni po dzisiejszym niedostępne; gotowe **Ten tydzień**, **Ten miesiąc**, **Poprzedni miesiąc**, **Ten rok**; **Pokaż** filtruje. Pod listą wyboru jest przycisk z okresem – otwiera kalendarz ponownie. Tak samo w glosariuszu (Filtry i sortowanie) |

Testy wersji 1.21.1:

- **Testy logiki: 328 – wszystkie zaliczone** (324 wcześniejsze + 4 nowe): siatka miesiąca
  (6 tygodni od poniedziałku, dni sąsiednich miesięcy, zmiana czasu 25.10.2026), przesunięcia dni
  i miesięcy (przełom roku, rok przestępny), nazwy po polsku („wtorek, 20 października 2026”), okres
  dwoma dotknięciami (wcześniejszy dzień – zamiana, trzecie dotknięcie – nowy okres, jeden dzień),
  opis okresu (ten sam miesiąc, przełom miesiąca i roku), liczba dni, gotowe okresy (tydzień od
  poniedziałku, także w niedzielę; poprzedni miesiąc w styczniu), zapis godziny „09:05”.
- **Testy w przeglądarce (Chromium): 150 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (148 wcześniejszych, z nich 2 dostosowane do nowego wyboru, + 2 nowe):
  - ekran komputera (zegar testu: 20.10.2026, 14:35): w oknie nie ma pól daty i godziny przeglądarki;
    kółko myszy – dwa ząbki na godzinach (16), ząbek w górę na minutach (34); przeciągnięcie minut
    myszą o dwie liczby (36), kliknięcie liczby pod środkiem (37); „00” – północ i fokus na minutach;
    strzałka w górę z 00 – 23; „0745”; strzałka w dół, PageUp, strzałka w lewo; kalendarz – kliknięcie
    22 października, strzałki i PageDown, Enter – 30 listopada; wybór miesiąca i roku – marzec 2027;
    skróty Jutro, +15 min, Pełna godzina, Teraz; tryby „Godzina” i „Data” (ukryty kalendarz albo
    bębny, tekst do wstawienia); „0930” i Enter – „Spotkanie 20.10.2026, 09:30” w notatce;
  - ekran telefonu: okno bez przewijania w bok; bęben przewinięty o ok. 3,4 liczby zatrzymuje się na
    liczbie (38), dotknięcie liczby (39), wstawienie i zapis notatki; filtr lekcji modułu – „Wybrany
    okres…” otwiera kalendarz z ostatnim tygodniem, jutro niedostępne, dwa dotknięcia (koniec przed
    początkiem – zamiana), pasmo dni 6–15, „12 dni”, „Poprzedni miesiąc” – 1 – 30 września, „Pokaż”,
    przycisk z okresem, ponowne otwarcie i „Anuluj” bez zmian;
  - dostosowane: data wpisana ręcznie w teście notatki 1.20 (kalendarz: „Data”, następny miesiąc,
    5 listopada) i okres stycznia 2026 w module i w glosariuszu (wybór miesiąca i roku, dwa dni).
  - **Błąd znaleziony testami:** w pierwszym pełnym przebiegu test komputerowy nie przeszedł – gdy
    płynny obrót bębna się przycinał (klatki opóźnione o ponad 140 ms), bęben „zatrzymywał się” na
    liczbie w połowie drogi. Teraz, dopóki bęben jedzie do zadanej liczby, pozycja pośrednia nie zmienia
    wartości (palec przejmuje bęben od razu). Pod sztucznym obciążeniem procesora: przed poprawką 1 z 3
    zaliczone, po poprawce 3 z 3; potem dwa nowe pełne przebiegi.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno daty i godziny (komputer, telefon), bębny na telefonie, okres w filtrze
  (telefon).

Czego nie sprawdzono w 1.21.1:

- **Safari na iPhonie i iPadzie** – bębny opierają się na przewijaniu z przyciąganiem (`scroll-snap`),
  które Safari obsługuje, ale **ruchu palcem, bezwładności po puszczeniu i zatrzymania na liczbie nie
  sprawdziłem na prawdziwym iPhonie** (w Chromium przewinięcie jest symulowane). Gdyby bęben zatrzymywał
  się między liczbami albo „uciekał” – daj znać.
- **Kółko myszy i gładzik na Windows** – w teście kółko daje 100 jednostek na ząbek (jak zwykła mysz);
  gładzik i myszy z płynnym przewijaniem dają mniejsze kroki – aplikacja sumuje je co ok. 36 px, ale na
  prawdziwym sprzęcie nie było to sprawdzane.
