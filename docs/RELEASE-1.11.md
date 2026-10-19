# LexiCards 1.11 – równania w notatkach

Wersja 1.11.0, 19 października 2026. Wzory wpisujesz w notatce tekstem, zapisem jak w LaTeX między
znakami dolara, a podgląd notatki pokazuje je jak w podręczniku. Ściągawka zapisu jest w osobnym
oknie pod ikoną info w edytorze. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Treść
notatki” – „wzory”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Równania w notatce – w formie tekstu i konwersji | Wzór wpisujesz w tekście notatki między znakami dolara: `$x^2 + y^2 = r^2$` w zdaniu, `$$…$$` – w osobnym wierszu, na środku. W edytorze zapis zostaje tekstem (łatwo go poprawić), w podglądzie notatki zamienia się we wzór. Wzory składa sama przeglądarka (Safari, Chrome, Edge) – bez bibliotek i bez internetu. Obsługiwane: potęgi i indeksy, ułamki, pierwiastki (też stopnia n), symbol Newtona, znaki działań, relacje, strzałki, zbiory (`\mathbb{R}`), sumy i iloczyny z granicami, całki, granice, funkcje (`\sin`, `\cos`, `\tg`, `\log`, `\ln`…), litery greckie, nawiasy dopasowane do wysokości, tekst we wzorze, wektory i kreski nad literą, odstępy. Błędny zapis (np. nieznane polecenie) jest we wzorze na czerwono |
| Ściągawka zapisów potęg, pierwiastków itd. w osobnym oknie pod ikoną info | Na pasku formatowania edytora: **Σ** – wstawia `$$` z kursorem w środku (zaznaczony tekst obejmuje znakami dolara), **ⓘ** – otwiera okno **Równania**. W nim: pole **Wypróbuj** z podglądem wzoru i podpowiedzią („W notatce wpisz: $…$” albo opis błędu, np. „Nieznane polecenie: \bogus”), a pod nim przykłady w grupach – jak wpisać wzór, potęgi i indeksy, ułamki i pierwiastki, znaki działań i relacje, sumy, całki i granice, litery greckie, nawiasy, tekst i akcenty – każdy z gotowym wzorem, zapisem i opisem. Dotknięcie przykładu wpisuje go do pola; **Wstaw** dokłada wzór w miejscu kursora w notatce |

Szczegóły:

- **Kwoty zostają tekstem:** „$20 i $30”, „$5/$10”, „US$5” nie zamieniają się we wzór (po
  otwierającym dolarze i przed zamykającym nie może być odstępu, a po zamykającym – cyfry). `\$` to
  zawsze zwykły dolar.
- **Czytanie na głos i słuchanie** czytają wzór słowami w języku notatki: „P równa się pi r do
  kwadratu”, „a przez b”, „pierwiastek z x”, „suma od i równa się 1 do n” (po angielsku: „P equals
  pi r squared”…).
- **Strony:** wzór nigdy nie dzieli się między strony notatki; długi wzór w osobnym wierszu, szerszy
  od strony, przewija się w bok.
- **Zapis bez zmian w danych:** w notatce, kopii zapasowej, eksporcie do arkusza i „Kopiuj notatkę”
  zostaje tekst `$…$` (inne aplikacje dostają zapis, nie obraz wzoru).
- **Czcionka wzorów:** z systemu – na iPhonie, iPadzie i Macu STIX Two Math, na Windows Cambria Math.

## Testy, które wykonano

- **Testy logiki (Node.js): 264 – wszystkie zaliczone** (259 wcześniejszych + 5 nowych):
  - wzory w tekście: `$…$` i `$$…$$`, kilka wzorów w zdaniu, kwoty i zwykłe dolary (8 przypadków),
    `\$`, wzór nie przechodzi do następnego wiersza;
  - odczyt zapisu: potęgi i indeksy w dowolnej kolejności, ułamek, pierwiastek stopnia n, suma
    z granicami, funkcje, `\mathbb{R}`, tekst z odstępami, nawiasy `\left…\right`, liczby z przecinkiem,
    prawdziwy minus, kropka mnożenia, prim, litery greckie;
  - błędy: nieznane polecenie, brak i nadmiar nawiasów, `\right` bez `\left` (reszta zapisu zostaje),
    bardzo głębokie zagnieżdżenie i bardzo długi zapis – bez awarii;
  - wzór słowami po polsku i po angielsku (11 wzorów), tekst ze wzorami i kwotą, słuchanie notatki
    w obu wersjach językowych;
  - ściągawka: każdy z przykładów odczytuje się bez błędów i ma opis.
- **Testy w przeglądarce (Chromium, ekran telefonu): 116 – wszystkie zaliczone w dwóch przebiegach**
  (114 wcześniejszych + 2 nowe):
  - podgląd notatki: sześć wzorów (z nich jeden w osobnym wierszu), potęga, ułamek z pierwiastkiem,
    suma z granicami, wzór z ułamkiem wyższy od wiersza, nieznane polecenie oznaczone, kwoty tekstem;
    czytanie na głos – wzory słowami, bez znaków zapisu;
  - edytor: **Σ** wstawia `$$` z kursorem w środku; ściągawka – podgląd ułamka, podpowiedź, błąd
    zapisu, przykład wpisany dotknięciem, **Wstaw** w miejscu kursora; po zapisie w notatce zapis
    tekstem, w podglądzie osiem wzorów;
  - długi akapit z 70 wzorami dzielony na kilka stron: każdy wzór dokładnie raz i cały.
- **Lint: bez błędów.**
- W trakcie pracy testy wyłapały: wstawianie ze ściągawki, gdy jej okno było jeszcze otwarte (edytor
  pod nim był zablokowany – teraz wzór trafia do notatki po zamknięciu okna), zgubiony błąd przy
  `\right` bez `\left`, brak odstępu po nazwie funkcji („sinx” – teraz „sin x”).
- Zrzuty (Chromium, ekran telefonu): podgląd notatki ze wzorami, edytor z przyciskiem Σ, okno
  **Równania**. W kontenerze testowym nie było czcionki matematycznej; do zrzutów doinstalowana
  została czcionka STIX (tylko w środowisku testowym – aplikacja korzysta z czcionek systemu).

## Uzupełnienie w wersji 1.11.1

| Prośba | Jak jest zrobione |
| --- | --- |
| Sprawdzić fokus w różnych oknach – pojawia się ramka np. na „Anuluj” | Ramka fokusu pokazuje się teraz tylko przy obsłudze klawiaturą. Po dotknięciu, kliknięciu albo rysiku nie ma jej nigdzie: ani na „Anuluj” w nowo otwartym oknie (Safari stawiał tam fokus z ramką – formularze dziedziny, modułu, lekcji, pojęcia, ściągawka, pytania), ani w menu „…”, ani na przycisku, do którego wraca fokus po zamknięciu okna, ani na przełącznikach i polach wyboru. Pierwszy klawisz nawigacji (Tab, strzałki, Esc, Enter i spacja poza polem tekstowym) przywraca ramki – dla obsługi klawiaturą na komputerze i na iPadzie z klawiaturą. Pisanie w polach nie włącza ramek. Ramka wokół wybranej ikony w „Edytuj dziedzinę” to oznaczenie wyboru (nie fokus) – zostaje |

Testy wersji 1.11.1:

- **Testy logiki: 264 – wszystkie zaliczone** (bez zmian w logice).
- **Testy w przeglądarce: 117 – wszystkie zaliczone w dwóch przebiegach** (116 wcześniejszych
  + 1 nowy): fokus ustawiony jak w Safari (widoczny) po dotknięciu – w menu „…”, na „Anuluj”
  w oknie „Edytuj lekcję” i na przycisku po zamknięciu okna – bez ramki; Tab – ramka; dotknięcie
  pola – znów bez ramek; pisanie w polu nie włącza ramek. Sprawdzone też w drugą stronę: bez
  poprawki ten test nie przechodzi (ramka widoczna w menu).
- **Lint: bez błędów.**

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** – testy działają w Chromium (zachowanie fokusu Safari jest w teście
  odtworzone, nie sprawdzone na urządzeniu). Safari ma własne składanie MathML,
  więc odstępy i wielkość niektórych znaków (nawiasy, pierwiastek, suma) mogą wyglądać nieco
  inaczej niż na zrzutach. Do sprawdzenia u Ciebie: wygląd wzorów w podglądzie i w oknie Równania.
- **Windows (Chrome / Edge) z Cambria Math** – nie sprawdzano.

## Warto wiedzieć

- Na telefonie pasek formatowania jest szerszy od ekranu: **ⓘ** jest zaraz za **Σ** – przesuń pasek
  w bok. Na iPadzie i laptopie mieści się cały.
- Wzór obejmuje jeden fragment tekstu – pogrubienie albo kolor nałożone na część zapisu przerywają
  wzór (zostaje wtedy tekstem).
- Po wpisaniu wzoru przyciskiem **Σ** kursor stoi przed zamykającym `$` – dalszy tekst pisz po
  przesunięciu kursora za niego (strzałka w prawo albo End).
