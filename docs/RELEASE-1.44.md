# LexiCards 1.44 – szablony jakości: Ishikawa, 5 × Dlaczego, SIPOC, układ kartki

Wersja 1.44.0, 23 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Szablony jakości”).

Pierwsza część narzędzi Six Sigma / Lean w edytorze rysunku. Schematy procesów (schemat blokowy, VSM, tory,
spaghetti, koncentracja wad) – w 1.45; wykresy z tabel – później.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| Grupa **Jakość** | Nowa grupa na prawym kółku: **Ishikawa**, **5 Why**, **SIPOC**, **Układ**. Nowy zestaw **Jakość / Lean** w oknie „Grupy narzędzi”: te cztery oraz karteczka, tekst, tabela, prostokąt, romb i strzałka. |
| Diagram Ishikawy | Okno: problem (głowa ryby) i kategorie – na start 6M (człowiek, maszyna, metoda, materiał, pomiar, środowisko), do 8. W polu kategorii każdy wiersz to przyczyna, wiersz od „-” – jej podprzyczyna. Kategoria bez nazwy i przyczyn znika. Ości rozkładają się same: u góry i u dołu kręgosłupa, kreski przyczyn rosną z najdłuższym napisem (do dwukrotności), dłuższy napis jest zwężany. Dotknięcie ości (albo jej nazwy) zaznaczonego diagramu otwiera okno z kursorem w jej przyczynach; dotknięcie głowy – w problemie. |
| 5 × Dlaczego | Problem i odpowiedzi w polach jedno pod drugim ze strzałkami; ostatnie pole wyróżnione jako przyczyna źródłowa. Przycisk **Dlaczego?** nad zaznaczonym diagramem – okno z kursorem w pierwszym pustym polu, a gdy wszystkie są wypełnione – nowe pole (do 7). Puste pola zostają na kartce do wpisania rysikiem. |
| SIPOC | Tabela 5 × 5 z nagłówkami Dostawcy (S), Wejścia (I), Proces (P), Wyjścia (O), Klienci (C) – zwykła tabela rysunku. |
| Układ kartki | **Układ** w grupie albo **Układ kartki…** w menu kartek: raport **A3** (tytuł i siedem pól: tło, stan obecny, cel, analiza przyczyn, działania, plan wdrożenia, kontrola), koło **PDCA**, **macierz 2×2** (wpływ / wysiłek, własne nazwy osi i ćwiartek), **Kanban** i **diagram pokrewieństwa** (2–6 kolumn o własnych nazwach, pokrewieństwo – nagłówki w kolorach karteczek). Układ to tło kartki jak ramka: nie da się go zaznaczyć ani zetrzeć, przy ramce rysunkowej jest w ramce nad tabliczką; na kartce ze zdjęciem go nie ma. |

Poprawka: kółko narzędzi z więcej niż ośmioma pozycjami (8 grup i „Grupy narzędzi” – teraz na prawym kółku; po lewej
przy 8 własnych grupach było tak już wcześniej) rozkłada je gęściej (360° / liczba zamiast co 45°) – wcześniej ostatnia
pozycja stawała dokładnie na pierwszej i zasłaniała ją.

Zasady, które warto znać:

- Diagram to jeden element: zaznaczasz, przesuwasz, kopiujesz, zmieniasz kolor („Styl jak…” też), przypisujesz warstwy;
  wielkość napisów (4 stopnie) i kolor – w oknie. Skala i obrót przesuwają go jak tabelę (stoi prosto).
- Obraz w notatce, PDF i DXF zawierają diagramy (linie, ramki, napisy) i układ (DXF – warstwa **UKLAD**, szara).
  Ukrycie tła w warstwach ukrywa też układ.
- Format rysunku **16** (nowy element `diagram` i pole `layout`); starsza wersja aplikacji pominie je przy zapisie.

## Testy, które wykonano

- **Testy logiki (Node.js): 460 – wszystkie zaliczone** (14 nowych: przyczyny z tekstu i z powrotem, granice;
  szerokość i łamanie napisów; nowy diagram i jego wymiary; rozkład Ishikawy – ości u góry i u dołu, ramki bez nakładania,
  napisy nad i pod kreską, wszystko w obrysie; długość kresek z napisu, 3 ości; miejsca dotknięcia – głowa, nazwa, pas
  każdej ości bez zasłaniania sąsiedniej; 5 × Dlaczego – kolejność pól, przyczyna źródłowa, długi tekst; sprawdzanie
  zapisu; diagram w rysunku – format 16, kolor, skala, bez szyku; sprawdzanie układu; miejsce układu przy ramce i bez;
  geometria A3, PDCA, macierzy, Kanban i pokrewieństwa; DXF – napisy diagramu, warstwa UKLAD obok RAMKA, okrąg PDCA,
  obrócona nazwa osi; grupa Jakość i zestaw Jakość / Lean); do testu kółka dopisane sprawdzenie, że 9, 10 i 12 pozycji
  nie nakłada się.
- **Testy w przeglądarce (Chromium): 213 – wszystkie zaliczone w dwóch pełnych przebiegach** (2 nowe):
  - komputer: grupa Jakość; układy A3, PDCA, macierz i pokrewieństwo na pustej kartce, potem bez układu; Ishikawa 6M
    z przyczynami i podprzyczynami Maszyny i Pomiaru; SIPOC z nagłówkami; Kanban z własnymi kolumnami (piksel nagłówka
    na płótnie i na obrazie w notatce); druga kartka – 5 × Dlaczego, przycisk „Dlaczego?” (kursor w pierwszym pustym
    polu, potem przy pełnym diagramie dalej dostępny); dane zapisane w bazie (obie kartki); ponowne otwarcie i dotknięcie
    ości „Pomiar” zaznaczonego diagramu – kursor w jej przyczynach;
  - telefon (390 px): cztery przyciski grupy w górnym menu, okno Ishikawy i okno układu bez przewijania w bok, raport A3.
  - Poprawione starsze testy: numer formatu rysunku (16) w testach logiki, listy grup na kółku i w oknie „Grupy narzędzi”
    (Jakość na końcu), listy zestawów.
  - Pierwszy pełny przebieg wykrył błąd kółka (powyżej): na iPadzie i telefonie przycisk „Grupy narzędzi” zasłaniał grupę
    „Pisanie” (3 testy: 1.13, 1.15, 1.12.1 na telefonie). Przebieg przerwany, kółko poprawione, te testy oraz testy
    kółek 1.32 i 1.39 uruchomione osobno (zaliczone), potem oba pełne przebiegi od nowa.
  - Własne testy 1.44 poprawione po celowych uruchomieniach: wybór układu w oknie, które jeszcze się wysuwało, trafiał
    w sąsiednią pozycję (test czeka teraz na koniec animacji); 5 × Dlaczego stawał na diagramie Ishikawy i zrzut był
    nieczytelny (przeniesiony na drugą kartkę).
- **Lint: bez błędów.**
- Zrzuty (Chromium): Ishikawa, 5 × Dlaczego, układy A3, PDCA, macierz i pokrewieństwo, okno Ishikawy i raport A3 na telefonie.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – dotknięcia udawane myszą w Chromium.
- Długość napisów jest szacowana (bez mierzenia czcionki) – w Safari z inną czcionką napisy mogą być trochę węższe
  albo szersze; za długi wiersz płótno zwęża.
- Plik DXF z diagramem i układem otwarty w programie CAD – sprawdzony tylko odczytem z powrotem w aplikacji.
- PDF z układem – obraz notatki sprawdzony pikselem, sam PDF nie był otwierany.
- Ciemny motyw.
