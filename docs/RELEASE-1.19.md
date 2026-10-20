# LexiCards 1.19 – szablon, Shift i Ctrl, środkowy przycisk, szyk, kartki, zakończenia odcinka, stałe wymiary

Wersja 1.19.0, 20 października 2026. Część „Rysowanie” z paczki uwag (część „Notatki” była w 1.18):
dokładna wielkość szablonu, Shift (proporcje), przytrzymany Ctrl (chwilowe zaznaczanie), przesuwanie
strony środkowym przyciskiem myszy, szyk liniowy i kołowy, kilka kartek w jednym oknie, zakończenia
odcinka i wymiary widoczne na rysunku na stałe. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md)
(sekcja „Treść notatki” – „rysunki”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Szablon jako tło: dokładniejsza skala niż +/− co 10% – wpisana ręcznie albo przeciągnięciem narożnika | W **Ustaw wielkość i miejsce** wielkość między − i + jest teraz polem: wpisz np. **87,5** i Enter (100% – szablon dopasowany do strony). Na stronie ramka szablonu ma cztery **narożniki** (białe kwadraty): przeciągnięcie narożnika zmienia wielkość z zachowaniem proporcji, a przeciwny narożnik zostaje na miejscu; pole z procentami pokazuje wtedy bieżącą wielkość. Przeciągnięcie w środku – jak dotąd przesuwa szablon. Granice jak przy −/+: od 1/20 strony do 4 stron. Przy boisku z włączoną skalą według boiska skala rysunku zmienia się razem z wielkością |
| Shift przy rysowaniu elipsy – koło; analogicznie inne kształty | Z wciśniętym **Shift**: prostokąt – kwadrat, elipsa – koło, trójkąt, romb i trapez – równe szerokość i wysokość, **odcinek i strzałka – co 15°**. Przy poprawianiu: narożnik zachowuje proporcje kształtu, koniec odcinka i obrót – co 15°. Wciśnięcie albo puszczenie Shift w trakcie przeciągania zmienia kształt od razu. Na iPadzie i iPhonie bez klawiatury: w panelu kształtów przełącznik **Proporcje jak z Shift** (zapamiętany na urządzeniu) |
| Przytrzymany Ctrl – zaznaczanie (Auto); puszczony – poprzednie narzędzie | Przy każdym narzędziu poza zaznaczaniem przytrzymanie **Ctrl** (ok. 0,2 s) włącza **zaznaczanie w trybie Auto** (prostokąt albo lasso – jak ustawione; kierunek decyduje: całe kreski albo fragmenty), a podpowiedź na dole mówi „Ctrl: zaznaczanie (Auto) – puść Ctrl…”. Kliknięcie albo przeciągnięcie z wciśniętym Ctrl – od razu, bez czekania. **Puszczenie Ctrl** przywraca poprzednie narzędzie, a zaznaczenie znika – więc z zaznaczeniem robisz coś, trzymając Ctrl: przeciągasz je, usuwasz (Delete), kopiujesz (C) albo wycinasz (X), albo klikasz polecenie nad nim. Ctrl puszczony w trakcie przeciągania – narzędzie wraca po puszczeniu przycisku myszy. Skróty (Ctrl+Z, Ctrl+C, Ctrl+V…) i Ctrl + kółko (powiększanie) narzędzia nie zmieniają |
| Przesuwanie powiększonej strony: dwa palce na ekranie dotykowym, wciśnięty środkowy przycisk (kółko) myszy | Wciśnięte **kółko myszy** i ruch – strona się przesuwa (przy każdym narzędziu, nic się nie rysuje; kursor „chwyt”); przewijanie przeglądarki z kółkiem i strzałkami w Windows jest wyłączone na płótnie. Dwa palce – jak dotąd przesuwają i powiększają |
| Powiel w szyku (liniowym albo kołowym): liczba szeregów, obiektów i przesunięcie; szyk jako obiekt z parametrami do przesuwania w całości; rozdzielenie na niezależne obiekty | Nad każdym zaznaczeniem nowe polecenie **Szyk** – okno **Powiel w szyku**: **Liniowy** – obiektów w rzędzie, odstęp w rzędzie, rzędów, odstęp rzędów (w skali rysunku, jak linijka; ujemny – w lewo, w górę), albo **Kołowy** – obiektów, kąt wypełnienia (360° – pełne koło, mniej – łuk), promień, pierścieni i ich odstęp, „Obracaj obiekty” (pola tekstowe i wzory zawsze stoją prosto). Szyk to **jeden element** („Szyk liniowy · 6”): przeciągnięcie przesuwa wszystkie kopie, **Szyk** albo dotknięcie szyku – zmiana parametrów, **Rozdziel** – wszystkie kopie jako osobne elementy. W szyku kołowym środek to kółko z krzyżykiem połączone przerywaną linią z pierwszą kopią – przeciągnięcie przesuwa środek. Najwyżej 400 kopii; każda zmiana to jeden krok cofania |
| Dodatkowe kartki bez wychodzenia z okna; po „Gotowe” każda kartka to osobny rysunek w notatce | Na dole po prawej przycisk **Kartka 1 z 1** – menu: **Nowa kartka**, lista kartek (przejście), **Usuń tę kartkę** (tylko dodanej; z kreskami – po pytaniu). **PageUp i PageDown** – poprzednia i następna. Nowa kartka ma to samo tło (kratka, linie albo gładkie), jasność linii i skalę, bez szablonu; każda kartka ma swoje cofanie. W nagłówku „Rysunek 1 · kartka 2”. Po **Gotowe** każda kartka z treścią trafia do notatki jako osobny rysunek („Rysunek 2”, „Rysunek 3”…) zaraz za rysunkiem, który był otwarty (i za obrazami z niego osadzonymi); pusta kartka nie trafia. Tak samo przy poprawianiu istniejącego rysunku. **Anuluj** (po pytaniu) odrzuca wszystkie kartki. W jednym oknie najwyżej 20 kartek, a notatka ma najwyżej 30 obrazów – nadmiarowe kartki są pomijane z komunikatem |
| Zakończenia odcinka: koła, kwadraty, trójkąty, romby, grot strzałki | Odcinek i strzałka mają osobno **początek** i **koniec**: **Brak, Grot, Trójkąt, Koło, Kwadrat, Romb** (trójkąt, koło, kwadrat i romb – wypełnione kolorem linii; wielkość zależy od grubości linii). Dla nowych – w panelu kształtów: po wybraniu odcinka albo strzałki panel zostaje otwarty i pod spodem są dwa wiersze ikon (strzałka ma domyślnie grot na końcu, jak dotąd). Dla zaznaczonego odcinka – polecenie **Końce** nad nim |
| Wymiary rysowanych elementów zostają na rysunku; zostaje tylko wyśrodkowany tekst; przy każdym wymiarze ikonka oka | Przy każdym polu wymiaru (szerokość, wysokość, kąt pochylenia; odcinek – długość i kąt) jest **oko** w prawym górnym rogu pola. Włączone oko: po odznaczeniu kształtu w miejscu pola zostaje sam **wyśrodkowany napis** z wymiarem, np. „5 cm” albo „15°” (w kolorze kształtu, z białą obwódką – czytelny na kratce). Napis zmienia się i przesuwa razem z kształtem i jest na obrazie rysunku w notatce. Gdy kształt jest zaznaczony, w miejscu napisu jest pole wymiaru. Każde przełączenie oka to jeden krok cofania |

Szczegóły:

- **Zapis:** rysunek ma teraz format 5 (szyki, zakończenia odcinka, stałe wymiary); wraca z kopią
  zapasową i w schowku rysunku (kopiuj i wklej, także szyk). **Starsza wersja aplikacji** pokaże obraz
  rysunku bez zmian, ale przy jego poprawianiu **pominie szyki (razem z kopiami)**, zakończenia odcinka
  i stałe wymiary – rysunków z szykiem nie poprawiaj na urządzeniu bez aktualizacji.
- **Gumka:** gumka całych kresek usuwa cały szyk (dotknięcie dowolnej kopii); gumka fragmentów szyku nie
  ścina – jak kształtów i pól tekstowych. Zaznaczanie prostokątem i lassem obejmuje szyk tylko w całości.
  Zero linijki przyciąga się także do kopii w szyku.
- Polecenia nad zaznaczeniem na iPadzie nie wchodzą już pod pasek narzędzi, gdy przy zaznaczaniu ma on
  dwa wiersze.
- Ctrl na Macu: działa klawisz **Control** (nie Command), bo Command z klawiszami to skróty.

## Testy, które wykonano

- **Testy logiki (Node.js): 309 – wszystkie zaliczone** (301 wcześniejszych + 8 nowych; test formatu
  rysunku – wersja 5):
  - zakończenia odcinka: domyślne (strzałka – grot), zapis tylko innych niż domyślne, trójkąt (ostrze
    w końcu, linia do podstawy), koło i kwadrat (granice, dotknięcie), grot na początku, sprawdzanie
    danych, zaznaczanie prostokątem z kołem;
  - Shift: kwadrat, koło, odcinek co 15°, dotknięcie – kwadrat, narożnik z zachowaniem proporcji
    (100 × 60 → 150 × 90), koniec odcinka i obrót co 15°;
  - stałe wymiary: klucze i kolejność, sprawdzanie, napisy („5 cm”, „1,5 m”, „15°”, „4 cm”, „30°”),
    miejsce przy ramce, granice kształtu z napisem;
  - szyk liniowy: 12 elementów z 2 źródłowych, położenia, granice, trafienie, zaznaczanie tylko
    w całości, przesunięcie, przyciąganie linijki do kopii; szyk kołowy: kolejność przeciwnie do
    ruchu wskazówek zegara, obrót kopii albo prosto, łuk 90°, pierścienie, promień, przesunięcie;
    granice parametrów (400 kopii), bez szyku w szyku, sprawdzanie danych rysunku i zapis bez zmian;
  - szablon: wielkość w procentach (87,5%) wokół środka, narożnik (przeciwny zostaje, proporcje,
    najmniej 1/20 strony); ustawienia narzędzi.
- **Testy w przeglądarce (Chromium): 140 – wszystkie zaliczone w dwóch pełnych przebiegach** (136 wcześniejszych + 4 nowe; w teście
  szablonu z 1.15 wielkość odczytywana jest teraz z pola – po „−” pokazuje 90,9 zamiast 91%):
  - ekran komputera (mysz i klawiatura): Shift – kwadrat (szerokość = wysokość) i odcinek pod kątem
    15°; przytrzymany Ctrl – zaznaczanie w trybie Auto z podpowiedzią, prostokąt z Ctrl zaznacza
    kreskę, puszczenie – pióro i zaznaczenie znika; Ctrl+Z cofa bez zmiany narzędzia; Ctrl + kółko
    powiększa wokół kursora (narzędzie bez zmiany); środkowy przycisk przesuwa stronę o 120 px, bez
    kreski;
  - ekran iPada: odcinek z kołem i trójkątem z panelu, „Końce” – romb na końcu; oko przy szerokości –
    po odznaczeniu napis „5 cm” pod prostokątem (wcześniej i przy zaznaczeniu – nie); szyk liniowy
    3 × 2 (6 cm, 4 cm) – kopie na miejscach, przesunięcie całości o kratkę, dotknięcie – parametry,
    2 w rzędzie; szyk kołowy z koła – 6 kopii, przeciągnięcie środka, „Rozdziel” – 6 elementów; zapis:
    zakończenia, szyk z parametrami i wymiarem na stałe, 6 rozdzielonych kół wokół nowego środka;
  - ekran iPada: kartki – nowa kartka (pusta, tytuł „Rysunek 1 · kartka 2”), PageUp i PageDown,
    trzecia pusta usunięta z menu; szablon – wpisane 80%, narożnik do 70%; po „Gotowe” w notatce
    „Rysunek 1” i „Rysunek 2” (z szablonem 70%);
  - ekran telefonu: polecenia zaznaczonego odcinka (z „Końce” i „Szyk”) i przycisk kartek w szerokości
    ekranu; okno szyku bez przewijania w bok.
- **Lint: bez błędów.**
- Zrzuty (Chromium): panel kształtów z zakończeniami, odcinek i napis „5 cm”, okno szyku, szyki
  liniowy i kołowy ze środkiem, szablon z narożnikami i polem 70%, menu kartek (iPad); Ctrl –
  zaznaczanie (komputer); odcinek z poleceniami i okno szyku (telefon).

## Czego nie sprawdzono

- **Safari na iPadzie i iPhonie** – testy działają w Chromium z ekranem iPada i telefonu (dotyk,
  rysik i mysz udawane), nie w Safari na iOS. Do sprawdzenia u Ciebie: oko przy polu wymiaru (małe
  kółko – czy łatwo w nie trafić palcem), przeciąganie narożnika szablonu i środka szyku rysikiem,
  Shift i Ctrl na klawiaturze iPada.
- **Windows** – klawisze i mysz w testach są udawane (Chromium na Linuksie): środkowy przycisk na
  prawdziwej myszy (czy przeglądarka nie włączy własnego przewijania), przytrzymanie Ctrl na
  klawiaturze laptopa i rysik z przyciskiem nie były sprawdzane na Windows.
- Szyk kołowy: obracanie kopii pól tekstowych i wzorów nie jest możliwe (stoją prosto); szyk w szyku
  – nie (zaznaczenie z szykiem dostaje go rozdzielonego).
