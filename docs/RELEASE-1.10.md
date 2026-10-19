# LexiCards 1.10 – notatka głosowa

Wersja 1.10.0, 19 października 2026. Do notatki lekcji możesz dołączyć nagranie: dyktujesz część
treści, a w tym czasie dalej piszesz i poprawiasz notatkę. Nagranie jest zwykłym załącznikiem.
Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Dane” – „Notatka głosowa”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Notatka głosowa jako załącznik notatki; nagrywanie w tle, a w tym czasie dalsze pisanie i edycja notatki | W edytorze notatki, w sekcji **Załączniki**, obok **Dodaj załącznik** jest **Nagraj notatkę głosową** (za pierwszym razem przeglądarka pyta o mikrofon). U góry edytora pojawia się czerwony pasek „● Nagrywanie 0:42” – przyklejony, więc widać go także po przewinięciu – z przyciskiem pauzy / wznowienia (w pauzie czas stoi) i **Zakończ**. Reszta edytora działa jak zwykle: piszesz, formatujesz, przełączasz Polski / Angielski, dodajesz obrazy i pliki. **Zakończ** dodaje nagranie do załączników jako „Notatka głosowa 2026-10-19 15.01.m4a” z fioletową plakietką mikrofonu i opisem „Nagranie, 0:42, 330 KB”. **Zapisz** w trakcie nagrywania najpierw kończy nagranie, potem zapisuje notatkę razem z nim. **Anuluj** pyta jak zawsze o odrzucenie zmian – po zgodzie nagranie przepada. W jednej notatce może być wiele nagrań (po kolei, jedno naraz) |
| Odsłuchanie nagrania | W podglądzie notatki nagranie jest w rzędzie załączników. Dotknięcie – **Odtwórz**: okienko z odtwarzaczem w aplikacji (przewijanie, głośność) i **Zamknij**. Poza tym jak każdy załącznik: **Otwórz lub zapisz…** na iPhonie, **Pobierz** na komputerze, zmiana nazwy w edytorze |

Szczegóły:

- Najdłuższe nagranie – 90 minut (ok. 0,5 MB na minutę, poniżej limitu 50 MB na załącznik); po
  90 minutach nagrywanie kończy się samo, a nagranie trafia do załączników z komunikatem.
- W trakcie nagrywania ekran nie gaśnie sam (blokada wygaszania ekranu przeglądarki).
- Gdy system odbierze mikrofon (zgaszenie ekranu przyciskiem, inna aplikacja, połączenie
  telefoniczne), nagrywanie się kończy, a to, co się nagrało, zostaje w załącznikach – komunikat
  to mówi.
- Format zależy od przeglądarki: Safari nagrywa AAC w `.m4a` (odtworzy go każde urządzenie), Chrome
  i Edge – AAC w `.m4a`, gdy system ma koder, inaczej Opus w `.webm`.
- Nagrania przenosi plik obrazów i załączników kopii zapasowej (razem z czasem trwania); eksport
  do arkusza ich nie obejmuje – jak pozostałych załączników.
- Trwające nagranie zajmuje już jedno miejsce w limicie 30 załączników notatki.

## Testy, które wykonano

- **Testy logiki (Node.js): 259 – wszystkie zaliczone** (258 wcześniejszych + 1 nowy): nazwa
  nagrania z datą i godziną, zapis czasu (0:05, 1:02, 1:02:05), typy i rodzaj plików `.m4a`,
  `.webm`, `.ogg`, `.wav`; czas nagrania w opisie załącznika po zapisie, po zmianie nazwy, w kopii
  lekcji i w pliku danych kopii zapasowej; zły czas (ujemny, tekst) jest pomijany.
- **Testy w przeglądarce (Chromium, ekran telefonu i komputera): 109 – wszystkie zaliczone
  w dwóch przebiegach** (108 wcześniejszych + 1 nowy). Mikrofon to udawane urządzenie Chromium
  (sygnał testowy), nie prawdziwy mikrofon:
  - start nagrywania, czas biegnie; pisanie tekstu w edytorze w trakcie nagrywania; pasek widoczny
    po przewinięciu edytora; drugi przycisk nagrywania wyłączony (jedno naraz);
  - pauza – czas stoi przez 1,3 s, wznowienie – biegnie dalej; **Zakończ** – komunikat, pasek znika,
    nagranie na liście załączników z opisem „Nagranie, 0:0…”;
  - drugie nagranie zakończone samym **Zapisz**: w bazie oba nagrania z treścią (ponad 1 KB),
    czasem 1–6 s, właściwą nazwą i typem, bajty w bazie zgodne z rozmiarem; tekst notatki zapisany;
  - podgląd: dwa nagrania z plakietką mikrofonu, **Odtwórz** – odtwarzacz wczytuje nagranie
    (czas trwania ponad 0,5 s); Ustawienia – plik obrazów i załączników liczy oba nagrania.
- **Lint: bez błędów.**
- Zrzuty (Chromium, ekran telefonu): edytor w trakcie nagrywania, odtwarzacz nagrania.
- W trakcie pracy zrzut pokazał, że pasek nagrywania był półprzezroczysty i prześwitywała przez
  niego przewijana treść – teraz ma pełne tło.

## Uzupełnienie w wersji 1.10.1

| Prośba | Jak jest zrobione |
| --- | --- |
| Pole notatki na ekranie lekcji bardzo delikatnie żółte | Wiersz **Notatka** nad listą pojęć ma bardzo jasne, żółtawe tło (jak kartka notesu), a kwadrat z ikoną notatki – odrobinę mocniejsze (od 1.10.2 – szare, od 1.10.3 – żółte z ciemnożółtą ikoną). To samo przy lekcji bez notatki („Dodaj notatkę do lekcji”). W ciemnym motywie odcień jest przyciemniony, żeby nie raził. Wiersz utrwalenia, lista pojęć i pozostałe pola – bez zmian |

Testy wersji 1.10.1:

- **Testy logiki: 259 – wszystkie zaliczone** (bez zmian w logice).
- **Testy w przeglądarce: 110 – wszystkie zaliczone w dwóch przebiegach** (109 wcześniejszych
  + 1 nowy): w jasnym i ciemnym motywie wiersz notatki jest żółtawy, ale delikatnie (niebieski
  składnik niższy od czerwonego o 12–40 na 255), tło grupy jest takie jak tło listy pojęć, a wiersz
  „Dodaj notatkę do lekcji” ma ten sam kolor.
- **Lint: bez błędów.**
- Zrzuty (Chromium, ekran telefonu): ekran lekcji w jasnym i ciemnym motywie.

## Uzupełnienie w wersji 1.10.2

| Prośba | Jak jest zrobione |
| --- | --- |
| Tylko szare tło piktogramu notatki | Kwadrat z ikoną w żółtym wierszu notatki ma neutralnie szare, nieprzezroczyste tło (żółć przez nie nie prześwituje), w obu motywach. Wiersz zostaje delikatnie żółty |

Testy wersji 1.10.2:

- **Testy logiki: 259 – wszystkie zaliczone** (bez zmian w logice).
- **Testy w przeglądarce: 110 – wszystkie zaliczone w dwóch przebiegach** (test wiersza notatki
  uzupełniony: tło ikony jest szare – składowe różnią się najwyżej o 4 – i odróżnia się od tła,
  w jasnym i ciemnym motywie).
- **Lint: bez błędów.**
- Zrzuty (Chromium, ekran telefonu): ekran lekcji w jasnym i ciemnym motywie.

## Uzupełnienie w wersji 1.10.3

| Prośba | Jak jest zrobione |
| --- | --- |
| Utrwalona lekcja z obwódką nad żółtą notatką bez niej – ramka wokół notatki albo utrwalona bez obwódki (najpierw makiety obu wariantów); wybrany wariant B z żółtym piktogramem | Na ekranie lekcji wiersz **Lekcja utrwalona** nie ma już cienkiej zielonej obwódki – zostaje zielone tło z miękką poświatą – a między nim a wierszem notatki nie ma szarej linii: wiersze rozdzielają same kolory tła. Kwadrat z ikoną notatki jest żółty z ciemnożółtą ikoną (w ciemnym motywie – jasnożółtą), tak jak zielony kwadrat przy utrwaleniu; kontrast ikony do kwadratu ok. 5,3:1 (jasny) i 5,8:1 (ciemny). Na listach modułów i lekcji utrwalone wiersze mają obwódkę jak dotąd – stoją tam między białymi wierszami |

Testy wersji 1.10.3:

- **Testy logiki: 259 – wszystkie zaliczone** (bez zmian w logice).
- **Testy w przeglądarce: 110 – wszystkie zaliczone w dwóch przebiegach** (test wiersza notatki
  przebudowany): na utrwalonej lekcji z notatką, w jasnym i ciemnym motywie – wiersz notatki
  delikatnie żółty, kwadrat ikony żółty, ikona ciemnożółta (w ciemnym – jasnożółta), utrwalenie bez
  obwódki (sama poświata), brak linii między wierszami; na liście lekcji w module utrwalona lekcja
  nadal ma obwódkę; „Dodaj notatkę do lekcji” – ten sam kolor wiersza i piktogramu.
- **Lint: bez błędów.**
- Zrzuty (Chromium, ekran telefonu): utrwalona lekcja z notatką w jasnym i ciemnym motywie.

## Uzupełnienie w wersji 1.10.4

| Prośba | Jak jest zrobione |
| --- | --- |
| Na listach modułów i lekcji – pełne zielone linie poziome oddzielające utrwalone, bez linii bocznych (wybrane z makiet) | Utrwalony wiersz nie ma już obwódki dookoła: zostaje zielone tło z poświatą, a od sąsiednich wierszy oddzielają go pełne zielone linie – od krawędzi do krawędzi karty, w miejscu zwykłych szarych linii. Przy krawędzi karty linii nie ma (jak przy zwykłych wierszach), więc utrwalony na końcu listy ma tylko linię nad sobą. Dwa utrwalone obok siebie dzielą jedną linię |
| Piktogramy na ekranie lekcji bez tła, w kolorach intensywnych, ale czytelnych (wybrane z makiet) | Ikony **Lekcja utrwalona** (zielona) i **Notatka** (żółta, w odcieniu ochry) nie mają już kwadratu pod spodem i są nieco większe (22 zamiast 19 px). Kolory dobrane tak, żeby ikona miała kontrast co najmniej 3:1 do tła wiersza: w jasnym motywie ok. 3,3:1 (zielona) i 3,2:1 (żółta), w ciemnym – jasnozielona i jasnożółta |

Testy wersji 1.10.4:

- **Testy logiki: 259 – wszystkie zaliczone** (bez zmian w logice).
- **Testy w przeglądarce: 110 – wszystkie zaliczone w dwóch przebiegach** (test wiersza notatki
  rozszerzony na listy), w jasnym i ciemnym motywie:
  - ekran lekcji: piktogramy bez tła, 22 px, żółty i zielony, kontrast do tła wiersza co najmniej
    3:1 (liczony w teście z kolorów na ekranie); żółty wiersz notatki, utrwalenie bez obwódki i bez
    linii między wierszami;
  - lista lekcji z utrwaloną w środku: bez obwódki z boków, zielona linia nad i pod nią od krawędzi
    karty; utrwalona na końcu listy: zielona linia tylko nad nią.
- **Lint: bez błędów.**
- Zrzuty (Chromium, ekran telefonu): ekran lekcji i lista lekcji z utrwaloną w środku, jasny
  i ciemny motyw.

## Uzupełnienie w wersji 1.10.5

| Prośba | Jak jest zrobione |
| --- | --- |
| Piktogram notatki wszędzie, gdzie się pojawia, ciemnożółty – bez względu na motyw | Ikona notatki ma jeden stały ciemnożółty kolor w jasnym i ciemnym motywie i przy każdym kolorze aplikacji: na ekranie lekcji (wiersz notatki i „Dodaj notatkę do lekcji”), przy lekcji na liście w module, w menu „…” („Notatka” / „Dodaj notatkę”), w szczegółach pojęcia („Notatka lekcji” – sama ikona, napis zostaje w kolorze aplikacji), przy fiszce w trakcie nauki i w menu obrazu w edytorze („Wstaw do tekstu” ma tę samą ikonę). Kontrast do jasnych i ciemnych teł – co najmniej 3:1 |
| Wyłączanie „Utrwalone na końcu listy” także z ekranu lekcji, nie tylko z Ustawień | W menu „…” u góry ekranu lekcji, zaraz pod „Cofnij utrwalenie” / „Oznacz jako utrwaloną”, jest **Wyłącz „Utrwalone na końcu listy”** (albo **Włącz…**, gdy ustawienie jest wyłączone). To samo polecenie jest w menu „…” modułu (lista lekcji) i dziedziny (lista modułów). Zmienia to samo ustawienie co **Ustawienia → Listy lekcji i modułów** – listy układają się od razu, a komunikat mówi, co się zmieniło |

Testy wersji 1.10.5:

- **Testy logiki: 259 – wszystkie zaliczone** (bez zmian w logice).
- **Testy w przeglądarce: 112 – wszystkie zaliczone w dwóch przebiegach** (110 wcześniejszych,
  z nich 1 dostosowany – kolor czytany z samej ikony, + 2 nowe):
  - przy zielonym kolorze aplikacji, w jasnym i ciemnym motywie ikona notatki ma ten sam
    ciemnożółty kolor na ekranie lekcji, w szczegółach pojęcia, na liście lekcji, w menu „…”
    i przy fiszce;
  - „Wyłącz „Utrwalone na końcu listy”” w menu ekranu lekcji (pod „Cofnij utrwalenie”) – komunikat,
    utrwalona lekcja na swoim miejscu w module, przełącznik w Ustawieniach wyłączony; „Włącz…”
    z menu modułu – utrwalona od razu na końcu; polecenie także w menu dziedziny.
- **Lint: bez błędów.**
- Zrzuty (Chromium, ekran telefonu): lista lekcji (jasny i ciemny motyw, zielony kolor aplikacji),
  ekran lekcji (jasny i ciemny), menu „…” ekranu lekcji z nowym poleceniem.

## Uzupełnienie w wersji 1.10.6

| Prośba | Jak jest zrobione |
| --- | --- |
| Wyłączanie „Utrwalone na końcu listy” także w trybie zmiany kolejności (ekran „Zmień kolejność modułów” / „Zmień kolejność lekcji”) | Nad listą ze strzałkami jest przełącznik **Utrwalone na końcu listy** z opisem: włączony – „Utrwalone moduły są pod pozostałymi i przesuwasz je tylko między sobą” (dlatego strzałka w górę przy pierwszym utrwalonym jest szara), wyłączony – „Utrwalone moduły przesuwasz razem z innymi”. Po wyłączeniu lista od razu układa się w Twojej kolejności i utrwalone można przesuwać między pozostałe, bez wychodzenia z trybu. To samo ustawienie co w Ustawieniach i w menu „…”. Przełącznik pokazuje się tylko wtedy, gdy na liście są utrwalone moduły albo lekcje |

Testy wersji 1.10.6:

- **Testy logiki: 259 – wszystkie zaliczone** (bez zmian w logice).
- **Testy w przeglądarce: 113 – wszystkie zaliczone w dwóch przebiegach** (112 wcześniejszych
  + 1 nowy): dziedzina z utrwalonym modułem – w trybie zmiany kolejności przełącznik włączony,
  opis, utrwalony na końcu i bez strzałki w górę; wyłączenie – zapisane ustawienie, nowy opis, tryb
  trwa, utrwalony przesuwa się między nieutrwalone; Ustawienia pokazują ten sam stan; lista lekcji
  bez utrwalonych – bez przełącznika; włączenie z listy lekcji.
- **Lint: bez błędów.**
- Zrzuty (Chromium, ekran telefonu): tryb zmiany kolejności z przełącznikiem włączonym i wyłączonym.

## Poprawka w wersji 1.10.7

| Prośba | Jak jest zrobione |
| --- | --- |
| Wcześniej wskazane było złe miejsce na wyłączanie „Utrwalone na końcu listy” (ekran lekcji zamiast trybu zmiany kolejności) | Wycofane polecenia **Wyłącz / Włącz „Utrwalone na końcu listy”** z menu „…” ekranu lekcji, modułu i dziedziny (dodane w 1.10.5). Ustawienie zmieniasz przełącznikiem w trybie **Zmień kolejność** (1.10.6) albo w **Ustawieniach → Listy lekcji i modułów** |

Testy wersji 1.10.7:

- **Testy logiki: 259 – wszystkie zaliczone** (bez zmian w logice).
- **Testy w przeglądarce: 112 – wszystkie zaliczone w dwóch przebiegach** (113 wcześniejszych
  − 1 usunięty razem z poleceniem w menu; test zmiany kolejności sprawdza teraz, że w menu „…” tego
  polecenia nie ma). Uwaga: w pierwszym, wcześniejszym przebiegu raz nie przeszedł test gestów fiszek
  (stuknięcie nie obróciło fiszki w czasie testu) – ta wersja fiszek nie zmienia; ten test osobno
  przeszedł 5 razy na 5, a dwa kolejne pełne przebiegi – 112 z 112. Do obserwacji.
- **Lint: bez błędów.**

## Uzupełnienie w wersji 1.10.8

| Prośba | Jak jest zrobione |
| --- | --- |
| Kafelki dziedzin na Starcie – najwyżej 2 wiersze, przy większej liczbie przewijanie poziome | Do czterech dziedzin – jak dotąd siatka (na telefonie 2 × 2). Od pięciu – dwa wiersze, a kolejne dziedziny są w kolumnach w prawo (1. i 2. w pierwszej kolumnie, 3. i 4. w drugiej…). Przewijasz palcem w bok, kolumny dociągają się do marginesu; na telefonie widać dwie kolumny i kawałek trzeciej (widać, że jest dalej), a lista sięga krawędzi ekranu. Na komputerze – więcej kolumn naraz i cienki pasek przewijania pod kafelkami. Przewinięcie zostaje po wejściu w dziedzinę i powrocie na Start (do zamknięcia aplikacji). Strona nie przewija się w bok |

Testy wersji 1.10.8:

- **Testy logiki: 259 – wszystkie zaliczone** (bez zmian w logice).
- **Testy w przeglądarce: 114 – wszystkie zaliczone w dwóch przebiegach** (112 wcześniejszych
  + 2 nowe): cztery dziedziny – siatka 2 × 2 bez przewijania; dziewięć – dwa wiersze, przewijanie
  w bok, lista od krawędzi do krawędzi ekranu, pierwsza kolumna przy marginesie, kolejność kolumnami,
  trzecia kolumna wystaje, strona bez przewijania w bok, przewinięcie wraca po wejściu w dziedzinę
  i powrocie; komputer, czternaście dziedzin – dwa wiersze i przewijanie.
- **Lint: bez błędów.**
- W trakcie pracy test wyłapał, że przewinięcie nie zawsze wracało, gdy ekran był wstawiany
  o klatkę później – poprawione (aplikacja czeka, aż lista będzie na ekranie).
- Zrzuty (Chromium): Start z dziewięcioma dziedzinami (telefon, przed i po przewinięciu), komputer.

## Czego nie sprawdzono

- **Na iPhonie** – testy działają w Chromium z udawanym mikrofonem, nie w Safari na iOS. Do
  sprawdzenia u Ciebie: pytanie o mikrofon w aplikacji z ekranu początkowego; czy nagrywanie trwa
  przy pisaniu z klawiatury i przy przewijaniu; jakość dźwięku; odtwarzanie w okienku; co dokładnie
  dzieje się po zgaszeniu ekranu i po przejściu do innej aplikacji (oczekiwane: nagrywanie się
  kończy, nagrany fragment zostaje).
- **Prawdziwy mikrofon** na Windows (Chrome / Edge) – nie był sprawdzany; w Chromium testowym
  (Linux, bez kodera AAC) nagranie zapisuje się jako `.webm`.

## Warto wiedzieć

- **Nagrywanie działa w aplikacji, nie „w tle systemu”.** Możesz pisać i edytować notatkę, ale
  na iPhonie zgaszenie ekranu albo przejście do innej aplikacji kończy nagrywanie (strony
  internetowe i aplikacje z ekranu początkowego nie mogą nagrywać w tle). Dlatego ekran w trakcie
  nagrywania nie gaśnie sam.
- **Dyktowanie z klawiatury iPhone'a** (mikrofon na klawiaturze) w trakcie nagrywania może nie
  działać albo przerwać nagranie – mikrofon jest wtedy zajęty przez nagrywanie.
- Nagrania są tylko na urządzeniu, w bazie przeglądarki – do innego urządzenia przenosi je plik
  obrazów i załączników.
