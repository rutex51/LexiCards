# LexiCards 1.39 – kółko przesuwane, menu na iPhonie, elementy na kartce, obroty fiszki

Wersja 1.39.0, 22 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Kółko przesuwane,
menu na telefonie, elementy na kartce, obroty fiszki”).

## Co się zmieniło

| Prośba | Jak jest zrobione |
| --- | --- |
| Pastylka rzędu 2 i 3 ze ściętą górą | Na iPhonie wybór pod menu (rząd 2) i trzecie menu (rząd 3) są w osobnej, zaokrąglonej pastylce tuż pod menu; gdy są oba – w jednej pastylce, trzecie menu w drugim wierszu oddzielone kreską. |
| Kółko zostaje w miejscu po zwinięciu menu | Po zwinięciu górnego menu kółko od razu przesuwa się do góry (wcześniej czasem zostawało pod niewidocznym już menu); po rozwinięciu – znowu pod menu, także po zakończeniu animacji. |
| Ręczne przesuwanie kółka, schowanie – miejsce bazowe | Przytrzymaj duże kółko (ok. pół sekundy, lekko się podnosi) i przeciągnij – całe kółko jedzie w wybrane miejsce. Wycinek małych kółek kieruje się do środka ekranu; z dala od brzegów widać cały okrąg, przy brzegu – tylko część. Miejsce jest zapamiętane; schowanie kółka (zakładka albo przesunięcie do krawędzi) przywraca stałe miejsce. Krótkie przeciągnięcie bez przytrzymania działa jak dotąd (w bok – chowa). |
| Elementy powstają poza kartką | Dotknięcie obok kartki przy kształcie albo wymiarze nic nie tworzy (zdejmuje zaznaczenie); przeciągnięcie zaczęte obok kartki tworzy kształt tylko wtedy, gdy wejdzie na kartkę (początek przesuwa się na jej brzeg); koniec przeciąganego kształtu zatrzymuje się na brzegu kartki; punkty okręgu i łuku z trzech punktów – tylko na kartce; kreska pióra może zacząć się obok kartki (np. linia przez brzeg), ale kreska w całości poza kartką przepada; symbol metrologiczny wstawisz tylko na kartce (obok – komunikat i dalsze czekanie). |
| Obroty fiszki: 1, 2, 3; co pokazują kolejne strony | Nauka → **Obroty fiszki**: 1 obrót (jak dotąd), 2 obroty albo 3 obroty; dla każdej następnej strony wybór: tłumaczenie, definicja, przykład, definicja i przykład, wszystko. Pierwszy obrót – od lewej do prawej, **drugi – z dołu do góry**, **trzeci – od prawej do lewej**. Na dole strony przycisk następnej, w nagłówku numer strony („3/4”) i powrót do pytania; po ostatniej stronie dotknięcie wraca do pytania. |

Zasady, które warto znać:

- Przytrzymanie dużego kółka bez przeciągania nie otwiera ustawień narzędzia (po puszczeniu nic się nie dzieje).
- Kółko przesunięte może zasłaniać kartkę – wtedy przeciągnij je dalej albo schowaj (wraca na stałe miejsce).
- Oceniać fiszkę (kafelki, Umiem / Powtórz) można już po pierwszym obrocie, nie trzeba oglądać wszystkich stron.
- Sesja zaczęta przed 1.39 albo powtórka na dziś bierze liczbę obrotów z ustawień zapamiętanych w Nauce.

## Testy, które wykonano

- **Testy logiki (Node.js): 421 – wszystkie zaliczone** (3 nowe: wycinek kółka przesuniętego – na środku cały
  okrąg, przy rogu część, nic za brzegiem, kierunek do środka; zapamiętane miejsce kółka w ustawieniach narzędzi;
  liczba obrotów i treść stron fiszki).
- **Testy w przeglądarce (Chromium): 204 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe):
  - komputer: przytrzymanie i przeciągnięcie dużego kółka na środek (środek w miejscu puszczenia, wszystkie małe
    kółka widoczne, bez otwierania ustawień, miejsce zapamiętane), przeciągnięcie bez przytrzymania nie przesuwa,
    przy rogu – część kółek, zakładka chowa i przywraca stałe miejsce;
  - iPhone: pastylka pod menu osobno (odstęp, zaokrąglona u góry, trzecie menu w drugim wierszu), kółko wyżej
    zaraz po zwinięciu menu i z powrotem pod menu po rozwinięciu, dotknięcie pod kartką bez prostokąta i zdejmuje
    zaznaczenie, przeciągnięcie poza kartkę – prostokąt na kartce, kreska pod kartką przepada, a zaczęta pod kartką
    i wchodząca na nią – zostaje;
  - iPhone: 3 obroty fiszki – wybór stron (przykład i definicja zamienione), strony 2/4–4/4 z kierunkami obrotu
    (od lewej, z dołu do góry, od prawej), tłumaczenie bez definicji i przykładu, ocenianie po pierwszym obrocie,
    powrót do pytania po ostatniej stronie i przyciskiem w nagłówku, ustawienie zapamiętane.
- **Lint: bez błędów.**
- Zrzuty (Chromium): kółko na środku i przy rogu, pastylka pod menu i zwinięte menu na iPhonie, ustawienia obrotów,
  strona z przykładem.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – przytrzymanie i przeciąganie kółka udawane myszą
  w Chromium; na iOS przytrzymanie może wywołać menu systemu (zablokowane stylem, ale nie sprawdzone).
- Wygląd animacji obrotu z dołu do góry i od prawej – w testach sprawdzony kierunek (atrybut), nie klatki animacji.
- Ciemny motyw.
