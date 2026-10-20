# LexiCards 1.27 – rodzaj linii kształtów, prosta, punkt symetrii, strzałka po łuku

Wersja 1.27.0, 20 października 2026. Nowe możliwości narzędzia **Kształty** w edytorze rysunku. Opis
budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja rysunków – „Od 1.27”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Zmiana ciągłości linii dla wszystkich obiektów typu kształt – co najmniej linia przerywana i linia osi (punktowo-kreskowa) | Rząd **Linia** w panelu kształtów: **ciągła, przerywana, osiowa** (kreska-kropka), **dwupunktowa** (kreska-dwie kropki) i **kropkowa**; nazwa wybranej – w nagłówku rzędu. Wybór działa dla nowych kształtów i od razu zmienia zaznaczone. Nad zaznaczeniem przycisk **Styl** – okno z rodzajem linii (przy kilku zaznaczonych kształtach – dla wszystkich naraz, jeden krok cofania). Działa przy odcinku, strzałce, prostokącie, elipsie, trójkącie, rombie, trapezie, łamanej, wielokącie, prostej i strzałce po łuku; kreski zależą od grubości linii, groty i zakończenia zostają ciągłe; tak samo na obrazie rysunku w notatce. |
| Rysowanie prostych | **Prosta**: przeciągnięcie wyznacza dwa punkty (kąt co 45° lekko przyskakuje, z Shift – co 15°, końce przyciągane do krawędzi i narożników jak przy odcinku), a linia biegnie **przez całą stronę** w obie strony. Zaznaczona ma dwa punkty do przeciągnięcia i pole **kąta**. Z linią osiową – oś symetrii. |
| Punkty symetrii | **Punkt**: dotknięcie strony stawia znacznik – **punkt symetrii** (kółko z krzyżykiem, domyślnie), **kropka**, **krzyżyk** albo **środek** (+); wielkość od grubości pióra. Znacznik – w panelu (**Znacznik punktu**) albo w oknie **Styl** nad zaznaczonym punktem; tekst (np. „O”, „S”) – poleceniem **Tekst**, stoi obok znacznika. |
| Strzałka po łuku z dwoma punktami pośrednimi do wyznaczenia łuku | **Strzałka po łuku**: przeciągnięcie od początku do końca daje łuk wygięty na lewo od kierunku ruchu. Zaznaczona ma **cztery punkty** – początek, **dwa punkty pośrednie** i koniec – a łuk zawsze przechodzi przez wszystkie cztery (gładka krzywa); przeciągnięcie punktu pośredniego zmienia wygięcie, narożniki ramki – wielkość, kółko – obrót. |
| Groty łuku jak dla odcinka | Zakończenia początku i końca jak przy odcinku – **brak, grot, trójkąt, koło, kwadrat, romb** – w panelu kształtów (dla nowych) i w oknie **Styl** (zaznaczony łuk); domyślnie grot na końcu, skierowany wzdłuż łuku. Bez grotów to zwykły łuk. |

Poprawka z 1.26: tabela z ustawionymi szerokościami kolumn na wąskim ekranie (telefon) łamała słowa
i liczby w środku („Iloś-ć”, „120-0”). Szerokości kolumn są teraz proporcjami bez stałego układu tabeli –
kolumna nie jest węższa niż jej najdłuższe słowo albo liczba; tabela szersza niż strona przewija się w bok,
jak dotąd.

**Styl zamiast „Wypełnienie” i „Końce”**: nad zaznaczonym kształtem jest teraz jeden przycisk **Styl** – okno
z rodzajem linii, wypełnieniem (kształty, które je mają), zakończeniami (odcinek, strzałka, łuk) albo znacznikiem
(punkt); zmiana po **Gotowe**. Dodanie osobnego przycisku „Linia” wydłużało pasek poleceń tak, że na telefonie
nie mieścił się w ekranie, a na komputerze zasłaniał stronę – z jednym przyciskiem pasek jest krótszy niż w 1.26.

## Testy, które wykonano

- **Testy logiki (Node.js): 362 – wszystkie zaliczone** (357 wcześniejszych + 5 nowych; test HTML tabeli
  z 1.26 – bez stałego układu):
  rodzaj linii (wzory kresek od grubości, zapis tylko innej niż ciągła, punkt bez linii); prosta (dwa punkty,
  linia za nimi, granice z punktów, dotknięcie daleko za punktami, tylko kąt, bez zakończeń, obrót końcem);
  punkt (znacznik, średnica, dotknięcie i wnętrze, bez uchwytów i wymiarów, zapis); strzałka po łuku
  (krzywa przechodzi przez punkty pośrednie w ⅓ i ⅔, łuk w górę, grot na końcu wzdłuż stycznej, przycięcie
  pod trójkątem, obrys, uchwyty i przesunięcie punktu pośredniego, zapis – dokładnie 4 punkty, dotknięcie –
  łuk domyślnej długości); ustawienia narzędzi.
- **Testy w przeglądarce (Chromium): 170 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (169 wcześniejszych + 1 nowy; poprawione 4 wcześniejsze – 10 kształtów w panelu, wypełnienie i zakończenia
  w oknie „Styl”; w teście tabeli z 1.26 doszło sprawdzenie, że „Ilość” i „1200” mieszczą się w jednym
  wierszu), ekran komputera: prosta z linią osiową; punkt symetrii (domyślny znacznik);
  strzałka po łuku – bez pól wymiarów, punkt pośredni przeciągnięty, okno „Styl” (bez wypełnienia, grot na
  końcu) – koło na początku; prostokąt i „Styl → Przerywana”; zapis (rodzaj linii, znacznik, punkty łuku, zakończenia); obraz w notatce –
  prosta od lewej do prawej krawędzi strony z kreskami i kropkami, łuk przez przeciągnięty punkt, pod łukiem
  pusto, przerywany bok prostokąta.
- **Lint: bez błędów.**
- Zrzuty (Chromium): panel kształtów z rzędem „Linia”, okno „Styl”, kształty na komputerze; ekran telefonu –
  łuk, pasek poleceń i okno „Styl”.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** i rysik Apple Pencil – tylko Chromium (mysz; ekran telefonu bez dotyku).
- Rozpoznawanie odręcznego kształtu (przytrzymane pióro) nie tworzy prostych, punktów ani łuków – te są tylko
  w panelu kształtów.
- Starsza wersja aplikacji (np. na drugim urządzeniu przed aktualizacją) pominie proste, punkty i łuki
  w rysunku zapisanym w 1.27 – zaktualizuj aplikację na wszystkich urządzeniach.
