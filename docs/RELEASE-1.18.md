# LexiCards 1.18 – wcięcia, indeksy, wielkość i własny kolor tekstu, podpisy obrazów, przeciąganie obrazów

Wersja 1.18.0, 20 października 2026. Część „Notatki” z paczki uwag: wcięcie tekstu (Tab), indeks górny
i dolny, wielkość tekstu (także czwarta wielkość pól tekstowych na rysunku), własny kolor tekstu
z narzędzi rysunku, podpisy obrazów z numeracją „Rys. N.” i przeciąganie obrazów w edytorze notatki
(najwyżej dwa rzędy, dalej przewijanie w bok). Część „Rysowanie” z tej paczki będzie w wersji 1.19.
Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Treść notatki”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Tabulator do notatek, wcięcie fragmentu tekstu | **Tab** w tekście notatki wcina akapit (albo zaznaczone akapity), **Shift+Tab** cofa wcięcie – do czterech stopni (po 2 znaki szerokości litery „M” każdy). W liście Tab robi punkt poziom niżej (do trzech poziomów). Na pasku formatowania są też przyciski **Zmniejsz wcięcie** i **Zwiększ wcięcie** (iPhone i iPad bez klawiatury). Ctrl+Z cofa wcięcie. Tab nie przechodzi już do następnego pola – z tekstu wyjdziesz myszą albo dotknięciem |
| Kolor tekstu – narzędzia wyboru koloru z ekranu rysowania | W panelu kolorów (litera A z tęczowym paskiem) po pięciu kolorach są: do trzech ostatnich **własnych kolorów** i **„+”** – okno **Kolor tekstu** z kartami **Siatka** (jak w rysunku), **Suwaki** (R, G, B i kod HEX) i **Pipetka** (kolor z dowolnego miejsca ekranu – tylko tam, gdzie przeglądarka ją ma: Chrome i Edge na komputerze; Safari na iPhonie i iPadzie jej nie ma, więc karty nie ma). Własne kolory są wspólne z rysunkiem (ostatnie trzy, zapamiętane na urządzeniu). W ciemnym motywie własny kolor jest rozjaśniony, tak jak pięć kolorów palety |
| Indeks górny i dolny | Przyciski **x²** i **x₂** na pasku oraz skróty **Ctrl+.** (górny) i **Ctrl+,** (dolny) – jak w Wordzie. Ponowne naciśnięcie wraca do zwykłego tekstu |
| Wielkość czcionki (mała, średnia, duża) – w polu tekstowym rysunku i w notatce | Przycisk **wielkość tekstu** (dwie litery A) – **Mała, Średnia, Duża, Bardzo duża** (0,85×, zwykła, 1,25×, 1,6×). Wielkość dotyczy zaznaczenia albo tego, co zaczniesz pisać. Pola tekstowe i wzory na rysunku miały już Mała, Średnia, Duża – doszła **Bardzo duża** (dwa razy większa od średniej) |
| Podpis rysunku/obrazka i automatyczna numeracja („Rys. 2. Wyniki sprzedaży”, wyśrodkowany pod obrazem) | Menu obrazu w edytorze: **Dodaj podpis** (potem **Zmień podpis**) – do 120 znaków; pusty podpis go usuwa. Podpis jest wyśrodkowany pod obrazem w podglądzie notatki, w powiększeniu i w „Kopiuj notatkę”. Pod obrazami przełącznik **Numeruj obrazy w podglądzie (Rys. 1., Rys. 2.…)** – zapisany w notatce: podpis ma wtedy postać „Rys. 2. Wyniki sprzedaży”, a obraz bez podpisu – „Rys. 2.”. Numer to kolejność obrazu w podglądzie: obrazy z odwołaniem `[[sygnatura]]` w miejscu odwołania, pozostałe przed tekstem albo po nim – tak jak je widać. Sygnatura („Obraz 1”) zostaje do odwołań w tekście; podpis jest tym, co widzi czytelnik |
| Drag & drop przy porządkowaniu rysunków i zdjęć; najwyżej dwa rzędy, dalej przewijanie w bok jak dziedziny na Starcie | Obraz w edytorze notatki przeciągasz na nowe miejsce: **myszą i rysikiem** – od razu po ruchu, **palcem** – po chwili przytrzymania (ok. 0,4 s; krótki ruch palcem przewija jak dotąd). Kafelek idzie za palcem, pozostałe robią mu miejsce, a przy lewej i prawej krawędzi siatka przewija się sama. Kliknięcie bez ruchu otwiera menu obrazu jak dotąd (zostało też „Przesuń wcześniej / dalej”). Gdy obrazy z przyciskami **Dodaj obraz** i **Narysuj** nie mieszczą się w dwóch rzędach, siatka ma dokładnie dwa rzędy i przewija się w bok; kawałek następnej kolumny przy prawej krawędzi podpowiada, że jest więcej |

Szczegóły:

- **Pasek formatowania** ma teraz 16 przycisków: B, I, U, x², x₂, wielkość, kolor, H, listy, wcięcia,
  nowa strona, wzór, ściągawka, wyczyść formatowanie. Na iPadzie i komputerze mieści się w oknie
  notatki (przyciski są o 2 px węższe), na telefonie przewija się w bok, jak dotąd.
- **Arkusz XLSX:** wcięcie zapisuje się jako znaki tabulacji na początku wiersza komórki (i tak
  wraca przy imporcie), indeksy – jako indeks górny i dolny Excela, wielkość – jako 9, 14 i 18 pt
  (zwykła 11 pt), podpisy obrazów – w nowej kolumnie **Image caption** (przy imporcie rozpoznawane
  też „Podpis obrazu”, „Caption”). Własny kolor eksport zapisuje dokładnie, ale **import zamienia
  każdy kolor z arkusza na najbliższy z pięciu kolorów notatki** (tak było od 1.1 – kolory z obcych
  arkuszy nie rozjeżdżają się). Przełącznik numeracji nie trafia do arkusza.
- **Kopia zapasowa** przenosi podpisy, numerację, wcięcia, wielkości i własne kolory.
- **Starsza wersja aplikacji** (np. na drugim urządzeniu przed aktualizacją) pokaże notatkę bez
  wcięć, wielkości, własnych kolorów i podpisów (tekst zostaje), a zapisana w niej notatka już ich
  nie będzie miała.
- **Wklejanie:** tekst z Worda czy stron WWW, jak dotąd, nie przenosi wielkości czcionki ani kolorów
  (poza dokładnie tymi z palety notatki) – inaczej notatka po wklejeniu miałaby przypadkowe rozmiary
  i barwy źródła. Indeksy górne i dolne z Worda zostają.
- Poprawka przy okazji: przy bardzo szybkim pisaniu skrót (Ctrl+B, Tab) mógł zadziałać w miejscu
  sprzed kilku znaków, a kolor wybrany w oknie trafić na początek tekstu – teraz zawsze działa tam,
  gdzie jest kursor.
- Poprawka w rysunku (z 1.17): Esc naciśnięty tuż po dotknięciu pola wymiaru kształtu mógł zostawić
  w polu wpisaną liczbę i kursor (pole po chwili samo odzyskiwało fokus) – teraz wartość zawsze wraca.
  Wyszło w jednym z przebiegów testów.

## Testy, które wykonano

- **Testy logiki (Node.js): 301 – wszystkie zaliczone** (297 wcześniejszych + 4 nowe; test wzoru
  arkusza notatek ma nową kolumnę „Image caption”):
  - zapis i odczyt wcięcia (zagnieżdżone `<blockquote>` z edytora → `data-indent`, najwyżej 4),
    indeksów, wielkości i własnego koloru (`#hex`, „bez koloru” usuwa kolor), tekst bez formatowania
    z wcięciem, HTML do schowka ze stylami;
  - arkusz: wcięcie tabulatorami, wielkości w punktach, własny kolor tam i z powrotem (import –
    najbliższy kolor palety), kolumna podpisu;
  - podpisy: czyszczenie (odstępy, 120 znaków), „Rys. N.” z podpisem i bez, numery w kolejności
    podglądu (odwołania, obrazy przed i po tekście, powtórzone odwołanie).
- **Testy w przeglądarce (Chromium): 136 – wszystkie zaliczone w dwóch pełnych przebiegach** (133
  wcześniejsze + 3 nowe; w teście eksportu zmieniła się lista kolumn arkusza notatek, a w teście pól
  tekstowych rysunku z 1.13 – wybór „Duża” musi teraz pomijać „Bardzo duża”, i test sprawdza cztery
  wielkości). Wcześniejszy przebieg miał jeden błąd w teście kształtów z 1.17 (Esc w polu wymiaru) –
  przyczyna opisana wyżej, poprawiona; po poprawce oba pełne przebiegi bez błędów:
  - ekran komputera: Tab, Tab, Shift+Tab – jeden stopień; Shift+Tab bez wcięcia nic nie robi;
    przyciski wcięcia; Ctrl+, i Ctrl+. oraz przycisk x² (podświetlony w trakcie); wielkości Mała –
    Bardzo duża w panelu; „+” – okno „Kolor tekstu” z siatką, suwakami i kodem HEX; własny kolor
    zapamiętany w panelu; zapisany HTML dokładnie taki, jak oczekiwany; podgląd – wcięcie, 1,25×,
    kolor rgb(18, 171, 52); ponowna edycja – Shift+Tab zdejmuje wcięcie;
  - ekran iPada: 12 obrazów – siatka w dwóch rzędach, przewijana w bok; podpis bez numeracji;
    przełącznik numeracji, „Dodaj podpis”; przeciąganie myszą („Obraz 1” na trzecie miejsce,
    kafelek pod wskaźnikiem w trakcie, bez otwierania menu po upuszczeniu), kliknięcie bez ruchu –
    menu; przeciąganie palcem po przytrzymaniu; zapis kolejności, podpisów i numeracji; podgląd –
    „Rys. 1. Wyniki sprzedaży” (obraz z odwołaniem pierwszy), powiększenie z podpisem;
  - ekran telefonu: 8 obrazów w dwóch rzędach przewijanych w bok, strona bez przewijania w bok,
    panel kolorów w szerokości ekranu.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno własnego koloru, edytor z formatowaniem i podgląd (komputer), obrazy
  w dwóch rzędach, przeciąganie i podpisy „Rys. N.” (iPad), obrazy i pasek (telefon).

## Czego nie sprawdzono

- **Safari na iPadzie i iPhonie** – testy działają w Chromium z ekranem iPada i telefonu (dotyk
  udawany), nie w Safari na iOS. Do sprawdzenia u Ciebie: przeciąganie obrazu palcem po
  przytrzymaniu (Safari może przy przytrzymaniu pokazać lupę albo menu obrazu – aplikacja to
  blokuje, ale tego nie widziałem), klawisz Tab na klawiaturze iPada, indeksy w Safari.
- **Pipetka** – w testach jej nie ma (Chromium bez ekranu nie ma EyeDropper); w Chrome i Edge na
  Windows powinna działać jak w rysunku, w Safari karty nie ma.
- **Excel** – plik z wcięciami, indeksami i wielkościami sprawdzony testem zapisu i odczytu
  aplikacji, nie w samym Excelu.
