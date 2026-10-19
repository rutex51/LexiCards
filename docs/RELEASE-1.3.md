# LexiCards 1.3 – stos fiszek, notatki w stronach, utrwalone na końcu list

Wersja 1.3.0, 19 października 2026. Fiszki leżą na stosie, długa notatka dzieli się na strony
przewracane jak kartki książki, okno notatki otwiera się bez ramki przy „Zamknij”, a utrwalone
lekcje i moduły są na końcu list. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcje „Treść
notatki”, „Notatka w stronach”, „Nauka z fiszkami”, „Statystyki”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Fiszki: delikatny efekt stosu, widać, że pod spodem są inne | Pod fiszką leżą dwie następne – wystają kilka pikseli spod dolnej krawędzi, lekko zwężone i przyciemnione, w jasnym i ciemnym motywie |
| Przy obracaniu i wyrzucaniu fiszki pod spodem widać już następną | Pierwsza fiszka pod spodem ma stronę z pytaniem następnego pojęcia. Przy obrocie, przeciąganiu i wyrzuceniu ją widać; w trakcie przeciągania lekko się podnosi, a przy wyrzuceniu wskakuje na miejsce wierzchniej – nowa fiszka pojawia się dokładnie tam, bez dodatkowej animacji |
| Ostatnia fiszka bez fiszki pod spodem | Przy ostatniej fiszce stosu nie ma; fiszka ma tę samą wysokość przez całą sesję |
| Notatki w stronach, bez przewijania na telefonie | Podgląd notatki dzieli treść na strony o wysokości okna. Długi akapit dzieli się między wyrazami (z formatowaniem), numeracja listy biegnie dalej na kolejnej stronie, nagłówek nie zostaje sam na dole strony, obrazy są po tekście (zmniejszone do wysokości strony; obraz, który prawie się mieści, zostaje lekko zmniejszony na tej samej stronie). Po obrocie telefonu strony liczą się od nowa, z zachowaniem miejsca w treści. Krótka notatka wygląda jak dawniej – jedna karta, bez przycisków stron |
| Możliwość wprowadzania stron | W edytorze przycisk **Nowa strona** (w pasku formatowania, ikona dwóch połówek kartki): wstawia podział w miejscu kursora – na końcu bloku, w środku akapitu (dzieląc go) albo między punktami listy; w edytorze widać przerywaną linię „Nowa strona”. W arkuszu importu nową stronę oznacza wiersz `---` w komórce notatki; eksport zapisuje podziały tak samo. Podział strony z Worda przy wklejaniu też zaczyna nową stronę |
| Efekt flipping book przy przewracaniu | Strona obraca się wokół lewej krawędzi jak kartka, z cieniem na kartce i na stronie pod nią. Palcem: kartka idzie za palcem w lewo (dalej) albo w prawo (wstecz) i po puszczeniu kończy obrót albo wraca. Do tego przyciski ‹ › z numerem strony („2 z 5”) i klawisze ←/→, Page Up/Down, Home/End. Przy ograniczonym ruchu strony zmieniają się bez obrotu |
| Bez ramki przy „Zamknij” w oknie notatki | Ramka była zaznaczeniem fokusu, które Safari rysuje po otwarciu okna na pierwszym przycisku. Teraz fokus jest na samym oknie – bez ramki, a klawiatura działa jak wcześniej (to samo w powiększeniu obrazu) |
| Utrwalone automatycznie na dół listy | Na listach lekcji w module i modułów w dziedzinie utrwalone są na końcu, w swojej kolejności; po cofnięciu utrwalenia lekcja wraca wyżej. W trybie „Zmień kolejność” przesuwa się w obrębie grupy (utrwalone wśród utrwalonych) |

## Testy, które wykonano

- **Testy logiki (Node.js): 223 – wszystkie zaliczone** (218 wcześniejszych + 5 nowych): podział
  strony w HTML (zwykła linia pozioma nie dzieli), brak pustych stron, podział z Worda
  (`page-break-before`, `break-before`), zwykły tekst i schowek, komórka arkusza z `---` – eksport
  i import bez zmian, ręcznie wpisane `---`.
- **Testy w przeglądarce (Chromium, ekran telefonu): 89 – wszystkie zaliczone w dwóch przebiegach**
  (85 wcześniejszych + 4 nowe; 4 wcześniejsze testy notatek dostosowane do stron):
  - stos: dwie fiszki pod spodem, pierwsza z pytaniem następnego pojęcia, nic się w nich nie
    da nacisnąć; w połowie obrotu i w połowie lotu w miejscu fiszki widać następną; nowa fiszka
    bez animacji wejścia; ostatnia bez stosu; ta sama wysokość fiszki; cofnięcie;
  - notatka w stronach: długa notatka (lista 24 punktów, akapit na kilka stron, obraz) – każda
    strona mieści się w oknie, cała treść w kolejności, akapit podzielony bez zgubionych słów,
    numeracja listy na drugiej stronie, przyciski, klawisze, przeciąganie palcem (dalej, wstecz,
    krótki ruch wraca, dwie strony w trakcie obrotu), obraz otwiera powiększenie, ponowny podział
    po zmianie wysokości okna; fokus po otwarciu na oknie, nie na „Zamknij”;
  - „Nowa strona” w edytorze: na końcu tekstu, w środku akapitu, w środku listy; zapisany HTML,
    liczba stron, ograniczony ruch, podgląd na liście bez znacznika `---`;
  - utrwalone na końcu list lekcji i modułów, zmiana kolejności w obrębie grup, powrót po cofnięciu.
- Zrzuty ekranu: stos w spoczynku, przy obrocie, przeciąganiu, wyrzuceniu i przy ostatniej fiszce
  (jasny i ciemny motyw); strony notatki na telefonie i komputerze, w trakcie obrotu kartki,
  w ciemnym motywie; edytor z linią „Nowa strona”; lista z utrwaloną lekcją na końcu.

## Czego nie sprawdzono

- **Na iPhonie** – testy działają w Chromium z ekranem telefonu, nie w Safari na iOS. Do
  sprawdzenia u Ciebie: płynność obrotu kartki i przeciągania palcem, wygląd stosu fiszek, brak
  ramki przy „Zamknij”, wstawianie „Nowej strony” z klawiaturą iPhone'a.
- Podział stron zależy od wielkości okna i czcionki urządzenia, więc na iPhonie strony mogą
  się łamać w innych miejscach niż na zrzutach.

## Warto wiedzieć

- W trakcie obrotu kartka unosi się „do Ciebie”, więc na chwilę zachodzi na nagłówek okna –
  tak wygląda przewracana strona książki.
- Myszą (Windows) strony przewraca się przyciskami albo klawiszami; przeciąganie myszą zostaje
  do zaznaczania tekstu.
- Blok, którego nie da się podzielić, a jest wyższy niż ekran (np. bardzo długa lista z punktami
  zagnieżdżonymi), dostaje stronę przewijaną – to jedyny wyjątek.
