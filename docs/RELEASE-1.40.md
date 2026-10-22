# LexiCards 1.40 – etap D: wielokąt foremny, półprosta, narożniki, kreskowanie, pole i obwód, kolejność

Wersja 1.40.0, 22 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Etap D: wielokąt
foremny, półprosta, narożniki, kreskowanie, pole, kolejność”).

Pierwsza część etapu D planu „rysunek jak w CAD” (strona porównania z AutoCAD). Dalsza część – odbicie względem
prostej przez dwa punkty, skalowanie o współczynnik, przenoszenie stylu i ramka rysunkowa z tabliczką A4/A3 –
w kolejnym wydaniu.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| Wielokąt foremny | Grupa **Kształty** → **Wielokąt foremny**. Przeciągnij od środka do wierzchołka – wierzchołek trafia w koniec przeciągnięcia (prawie prosto – przyciągany, z Shift albo „Proporcjami” – obrót co 15°); dotknięcie – wielokąt z podstawą u dołu. **Boki** pod menu: 3–12 (na start 6 – łeb śruby, nakrętka); zmienia też zaznaczone (środek i promień zostają). Narożnik ramki zaznaczonego zachowuje foremność, środek boku – rozciąga. |
| Półprosta | Grupa **Konstrukcja** → **Półprosta**: od pierwszego punktu przez drugi do brzegu kartki. Końce przyciągają się do narożników i krawędzi jak przy prostej; rodzaj linii (np. osiowa) – pod menu. |
| Zaokrąglenie R i faza | Przy prostokącie **Narożniki** pod menu: ostre, zaokrąglenie R albo faza; wielkość ¼, ½, 1 kratka albo wpisana w jednostkach rysunku (najwyżej połowa krótszego boku). Działa dla nowych prostokątów i dla zaznaczonych. Łuki są rysowane dokładnie. |
| Kreskowanie | **Wypełnienie** → **Kreskowanie** (każdy zamknięty kształt): kąt 45°, 135°, 0° albo 90°, odstęp gęste / średnie / rzadkie, **Krzyżowe**. Linie zaczepione w rogu kartki – sąsiednie przekroje mają ciągłe kreskowanie. Obrót kształtu obraca kreskowanie, odbicie – odbija. |
| Pole i obwód | Przy nazwie zaznaczonego zamkniętego kształtu: „pole 49,8 cm² · obwód 29,1 cm” – w jednostce liczb wymiarów rysunku (styl techniczny – mm² i mm). Elipsa (także pochylona) i zaokrąglenia – dokładnie. |
| Kolejność rysowania | Nad zaznaczeniem **Kolejność**: Na wierzch, Wyżej, Niżej, Na spód. „Wyżej” i „niżej” przesuwają zaznaczenie nad (pod) najbliższy element, z którym się styka – od razu widać zmianę; gdy nic go nie zakrywa – komunikat. Jeden krok cofania. |
| DXF | Zapis: półprosta – odcinek od początku przez kartkę, kreskowanie – odcinki, zaokrąglony prostokąt – łamana z łukami (bulge). Odczyt: RAY – półprosta (do 1.39 – prosta). |

Zasady, które warto znać:

- Kreskowanie i liczba boków są zapamiętane dla nowych kształtów (kreskowanie – osobno dla każdego rodzaju kształtu).
- Wielkość narożnika jest w jednostkach strony – po zmianie skali rysunku liczba w polu się przelicza, kształt nie.
- Pochylony prostokąt z zaokrągleniem zapisuje się w DXF jako łamana z punktami na łukach (łuk pochylony nie jest okręgiem).
- Rysunek ma format 13. Starsza wersja aplikacji nie zna wielokąta foremnego i półprostej (pomija je w edytorze
  i przy zapisie), a kreskowanie i narożniki pokazuje jako zwykły kształt – rysunki z nowymi kształtami poprawiaj w 1.40.

## Testy, które wykonano

- **Testy logiki (Node.js): 429 – wszystkie zaliczone** (8 nowych: wielokąt foremny – wierzchołki na okręgu,
  wierzchołek w końcu przeciągnięcia, podstawa u dołu, przyciąganie kąta, zmiana liczby boków, narożnik zachowuje
  proporcje; półprosta – obrys, zakończenia, odbicie; narożniki – faza i zaokrąglenie, pole, obwód, ścieżka z łukami,
  stadion, zapis; kreskowanie – linie, brzegi, krzyżowe, obrót, odbicie, zapis; pole i obwód w jednostkach, elipsa
  pochylona, trójkąt, wielokąt; kolejność – na wierzch, na spód, wyżej, niżej, bez zmian; ustawienia narzędzi;
  DXF – półprosta, kreskowanie, bulge, RAY).
- **Testy w przeglądarce (Chromium): 206 – wszystkie zaliczone w dwóch pełnych przebiegach** (2 nowe):
  - komputer: prostokąt z zaokrągleniem (R z gotowej wielkości i wpisany, zapamiętany), pole i obwód przy nazwie,
    kreskowanie 135° krzyżowe, wielokąt foremny z 5 bokami, kolejność „Na spód” i komunikat przy powtórzeniu,
    półprosta bez pola, zapis rysunku (kolejność, boki, narożnik, kreskowanie, położenie półprostej);
  - iPhone: wybór narożników i kreskowania pod menu mieści się bez przewijania w bok, pole i obwód w osobnym wierszu
    paska zaznaczenia.
- **Lint: bez błędów.**
- Zrzuty (Chromium): kształty na kartce, wybór kreskowania, menu kolejności, narożniki i kreskowanie na iPhonie.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – gesty udawane myszą w Chromium.
- Pliki DXF z 1.40 w AutoCAD-zie i innych programach CAD – sprawdzony tylko odczyt z powrotem w aplikacji.
- Ciemny motyw.
