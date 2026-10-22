# LexiCards 1.35 – trzecie menu kształtów, zmiana zaznaczonego, „Przesuń”, wybór nad dolnym paskiem

Wersja 1.35.0, 22 października 2026. Poprawki edytora rysunku po pierwszym używaniu nowego układu
(1.32–1.34). Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Trzecie menu, zmiana zaznaczonego
i »Przesuń«”).

## Co się zmieniło

| Prośba | Jak jest zrobione |
| --- | --- |
| Spirala: ostatni zwój kończy się w powietrzu; ostre przejście odblasku | Drut kończy się w **ostatniej dziurce** – pod nią nie ma już zwoju. Odblask na górze drutu to sześć coraz cieńszych i jaśniejszych pasm (od szarego do prawie białego) zamiast jednego jasnego paska na szarym – przejście jest łagodniejsze. |
| Dodatkowe narzędzia paska ogólnego na dole, nad paskiem | Wybór przy zaznaczaniu (prostokąt / lasso, Auto, Całe, Fragmenty, Wycinek, Wklej, Zaznacz wszystko) jest **nad dolnym paskiem**, nie pod górnym menu; panele tła, linijki i liniuszka też otwierają się nad paskiem. Pastylki (kratka, powiększenie, kartka) i komunikaty przesuwają się wyżej, gdy wybór jest widoczny; na iPhonie wybór ma dwa wiersze. Uchwyt pod wyborem chowa pasek razem z nim. |
| „Przesuń” po kliknięciu elementu (na ekranie dotykowym trudno trafić w kreskę) | **Przesuń** – pierwszy przycisk nad zaznaczeniem. Włączony: przeciągnięcie palcem, rysikiem albo myszą w dowolnym miejscu strony przesuwa zaznaczenie; zostaje włączony do ponownego dotknięcia albo zdjęcia zaznaczenia. |
| Po zaznaczeniu elementu – tryb edycji (kolor, grot, grubość…) | Zaznaczony element zmieniasz **od razu w menu**: kolory i grubości (także przy narzędziu zaznaczania) zmieniają zaznaczone kształty i kreski pióra albo zakreślacza (kolor – także pola tekstowe, wzory i symbole), a trzecie menu – rodzaj linii, wypełnienie, końce (grot, trójkąt, koło…) i znacznik punktu. Menu pokazuje wartości zaznaczonego. Każda zmiana – jeden krok cofania. |
| Punkt, prosta i inne kształty: opcje jako trzecie menu z ⓘ rozwijanym w dół, bez osobnego okna | Pod menu kształtów jest **trzecie menu**: przy punkcie – od razu cztery znaczniki, przy prostej i łuku – rodzaje linii, przy innych kształtach przyciski **Linia**, **Wypełnienie**, **Końce** (z wybraną wartością), które rozwijają wybór w dół. **ⓘ** rozwija w dół przełączniki (proporcje jak z Shift, przyciąganie końców) i krótki opis wybranego kształtu. Okno „Styl” z 1.27 i polecenie „Styl” nad zaznaczeniem – usunięte. |
| Mysz po wyjściu z menu obraca kółko przy samym najechaniu, nie da się wybrać grupy | Gdy przycisk myszy został puszczony poza kółkiem (zdarzenie puszczenia nie dociera do kółka), ruch myszy bez wciśniętego przycisku kończy obracanie: kółka wracają na miejsca, a kliknięcie wybiera grupę. To samo dla przesuwania dużego kółka. |
| Zaznaczony punkt – większe kółko zamiast kwadratowej ramki | Zaznaczony punkt ma **przerywane kółko** o promieniu co najmniej 20 punktów ekranu, z jasnym wypełnieniem. |

Zachowanie, które warto znać:

- Przy narzędziu do rysowania (pióro, zakreślacz, kształty) wybrany kolor, grubość i styl zmieniają
  zaznaczone i są też ustawieniem następnych elementów; przy zaznaczaniu następne rysują się jak dotąd.
- Przy narzędziu kształtów zmiana dotyczy zaznaczonych kształtów **tego samego rodzaju** (np. właśnie
  narysowanej strzałki), a nie wcześniej zaznaczonego okręgu.
- Wybór zaznaczania nad dolnym paskiem może zasłonić dół strony – uchwyt nad paskiem chowa oba.

## Testy, które wykonano

- **Testy logiki (Node.js): 399 – wszystkie zaliczone** (bez nowych – zmiany są w interfejsie, logika
  kształtów i rysunku bez zmian).
- **Testy w przeglądarce (Chromium): 193 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (4 nowe; 8 wcześniejszych przepisanych z okna „Styl” i panelu kształtów na trzecie menu, „Przesuń” zamiast
  „Styl” wśród poleceń, karteczka przy dole strony – pasek schowany na chwilę):
  - komputer: punkt – cztery znaczniki od razu w trzecim menu, ⓘ rozwija opis pod menu bez okna; prosta –
    pięć rodzajów linii od razu; strzałka – „Linia” i „Końce” rozwijane pod menu (grot na końcu); narysowana
    strzałka przy zaznaczaniu: czerwona, gruba, koniec – trójkąt; kreska pióra zaznaczona ramką – niebieska
    i cienka; następna strzałka bez tych zmian (zapis sprawdzony w bazie);
  - iPad (palec): „Przesuń” – przeciągnięcie daleko od prostokąta przesuwa go o 3 × 2 kratki, drugie –
    o kratkę dalej, wielkość bez zmian; wybór zaznaczania nad dolnym paskiem (nie ma go w górnym menu), styl
    zaznaczonego prostokąta w trzecim menu przy zaznaczaniu, panel tła nad paskiem;
  - iPhone: wybór zaznaczania w szerokości ekranu, nad paskiem, nie zasłania pastylek; trzecie menu strzałki
    i wybór końców w szerokości ekranu, „Przesuń” widoczne, bez przewijania w bok;
  - komputer: spirala – zwój do ostatniej dziurki jest, za nią nie ma; zaznaczony punkt – przerywane kółko
    ok. 20 px od środka, dalej pusto; kółko narzędzi – mysz wciśnięta na małym kółku i puszczona poza nim,
    najechanie nie przesuwa kółek, kliknięcie wybiera grupę. Ten test sprawdzony też na kodzie bez poprawki –
    wtedy nie przechodzi (kółka się obracają).
- **Lint: bez błędów.**
- Zrzuty (Chromium): trzecie menu punktu z opisem, końce strzałki, zmiana zaznaczonej strzałki, „Przesuń”
  i wybór zaznaczania na iPadzie, wybór zaznaczania i trzecie menu na iPhonie, koniec spirali, zaznaczony punkt.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy rysik i palce – gesty w testach są udawane w Chromium.
- Błąd kółka przy myszy odtworzony w Chromium jednym sposobem (puszczenie przycisku poza kółkiem). Na
  Windows z prawdziwą myszą nie sprawdzony – jeśli kółko nadal obraca się samo, proszę o kroki (który
  kształt, które menu).
- Ciemny motyw nowych elementów – nie oglądany.
