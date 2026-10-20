# LexiCards 1.20 – notatki: wyrównanie i interlinia, linki, symbole, data i godzina, PDF; „Usuń formatowanie”, Ctrl+Z, „Kopiuj” w wielkości A4; ścieżka nad fiszką

Wersja 1.20.0, 20 października 2026. Pierwsza część kolejnej paczki uwag – notatki i poprawki. Dalej:
1.21 – tabele (notatki, rysunek, zdjęcie), okno grubości zakreślacza, karteczki; 1.22 – rysunek:
liniuszek promieniowy, przewracanie kartek kółkiem z animacją, wymiarowanie techniczne z tolerancjami
i GD&T, przyciąganie strzałek; 1.23 – eksport do kalendarza (.ics). Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Treść notatki” – „Od 1.20”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| „Usuń formatowanie” – zostają wielkości tekstu i punktowanie; ma czyścić wszystko oprócz linków | W zaznaczonym tekście znika **wszystko oprócz linków**: pogrubienie, kursywa, podkreślenie, przekreślenie, indeksy, kolor i wielkość. Akapity objęte zaznaczeniem stają się zwykłymi akapitami – bez nagłówka, listy (punkty i numeracja), wcięcia, wyrównania i interlinii. Bez zaznaczenia – akapit, w którym jest kursor. Ctrl+Z cofa całość jednym krokiem |
| Ctrl+Z po wklejeniu sygnatury cofa wcześniejszą edycję | **Wstaw do tekstu** (odwołanie `[[sygnatura]]`) i **Nowa strona** są teraz jednym krokiem cofania: Ctrl+Z usuwa odwołanie albo nową stronę (podzielony akapit wraca w całości), a kursor wraca tam, gdzie był. Ponowienie (Ctrl+Y, Ctrl+Shift+Z) przywraca zmianę |
| „Kopiuj” skalowane do A4 – obrazy wychodzą poza kartkę | Obraz w schowku ma wymiary wpisane wprost: najwyżej **16 cm szerokości** (tekst strony A4 przy marginesach 2,5 cm) i 22,7 cm wysokości, z zachowaniem proporcji – Word i OneNote nie muszą go zmniejszać same. Plik obrazu jest ten sam (pełna rozdzielczość), więc po powiększeniu w Wordzie jest ostry. Tekst – bez zmian |
| Interlinia i justowanie (środek, lewa, prawa, wyjustowany); dla zaznaczenia, bez zaznaczenia – dla całego tekstu | Przycisk **Wyrównanie i interlinia** (grupa „Akapit”) otwiera panel: **do lewej, do środka, do prawej, wyjustuj** i interlinia **1,0 · 1,15 · 1,5 · 2,0** (1,15 to dotychczasowy odstęp notatki). Zmienia **zaznaczone akapity** (także nagłówki i punkty list), a **bez zaznaczenia – cały tekst**. Panel pokazuje ustawienie akapitu z kursorem i zostaje otwarty (można zmienić oba). Enter w takim akapicie zaczyna następny z tym samym ustawieniem. Każda zmiana – jeden krok Ctrl+Z. Działa w podglądzie, w PDF i w „Kopiuj” (Word dostaje wyrównanie i interlinię 100 / 150 / 200%). Akapit wyjustowany podzielony między strony ma do obu krawędzi także ostatni wiersz na stronie |
| Czy można dodawać linki zewnętrzne – jeśli nie, dodać | Do tej pory link był tylko we wklejonym tekście. Teraz przycisk **Link** (grupa „Wstaw”, **Ctrl+K**): z zaznaczonym tekstem – wpisujesz adres; bez zaznaczenia – adres i tekst linku (puste – sam adres); z kursorem w linku – **Edytuj link**: inny adres albo **Usuń link** (tekst zostaje). Adres: `https://…`, `www.…` albo sama domena (dostają `https://`), adres e-mail (dostaje `mailto:`); inne (np. `javascript:`) – komunikat. W podglądzie link otwiera się w nowej karcie, w edytorze – Ctrl+kliknięcie |
| Symbole: procent, stopnie, paragraf, promil, fi (średnica) itd. – w notatkach i w tekście rysunku | Przycisk **Ω Symbole**: panel pod paskiem – **Ostatnio użyte** (osiem, zapamiętane na urządzeniu, wspólne z rysunkiem) i grupy: często używane (% ‰ ° § ⌀ ± × ÷ ≈ ≠ ≤ ≥ ∞ √ … – — • „ ” ©), matematyka (∑ ∫ ∂ ∆ ∇ ∠ ⊥ ∥ ≡ ∈ … ½ ² ³), litery greckie, strzałki, jednostki i znaki (µ ℃ € £ ™ ® ✓ ✗ …). **⌀** to znak średnicy (U+2300), nie litera „ø”. Podpowiedź przy każdym znaku (np. „⌀ – średnica”). Znak trafia w miejsce kursora, panel zostaje otwarty. W rysunku: pod polem tekstu (nowe pole tekstowe, jego poprawka i tekst na kształcie) przycisk **Symbole (%, °, §, ⌀…)** z tym samym panelem |
| Data i godzina: dzisiaj, teraz (data i godzina), teraz (sama godzina), wpisanie ręczne | Przycisk z kalendarzem: **Dzisiaj – 20.10.2026**, **Teraz – 20.10.2026, 14:35**, **Godzina – 14:35** (menu pokazuje, co zostanie wstawione) i **Inna data lub godzina…** – pola daty i godziny z wyborem systemowym; z jednym pustym – sama data albo sama godzina. Wstawiane jako zwykły tekst w miejscu kursora |
| Zapis notatki do PDF – standardowymi funkcjami | Pod stroną notatki obok „Kopiuj” – **PDF**: zwykłe okno drukowania z **całą notatką** (wersja w wybranym języku) w układzie **A4**: ścieżka i nazwa lekcji, tekst z formatowaniem, wzory, obrazy na szerokość strony (najwyżej 22,5 cm wysokości) z podpisami „Rys. N.”, „Nowa strona” – nowa strona wydruku; w jasnych kolorach także przy ciemnym motywie. Na Windows: **Zapisz jako PDF** (Edge, Chrome) albo **Microsoft Print to PDF**; na iPhonie i iPadzie – w oknie drukowania **Udostępnij → Zachowaj w Plikach**. Nazwa pliku – nazwa lekcji. Eksport do OneNote – pominięty (jak ustaliliśmy) |
| Nauka: ukrycie w ustawieniach „Powtórka na dziś” i „Ostatnia sesja” (są na Starcie) | **Ustawienia → Ekran Nauka**: „Pokazuj „Powtórka na dziś”” i „Pokazuj „Ostatnia sesja”” (domyślnie włączone). Wyłączone – grupy znikają z ekranu Nauka; na Starcie przyciski zostają zawsze |
| Fiszki: nad fiszką cała ścieżka Dziedzina/Moduł/Lekcja | Nad fiszką **Dziedzina › Moduł › Lekcja** (znak „›” jak w innych miejscach aplikacji); nazwa lekcji wyraźniejsza. Gdy ścieżka się nie mieści (telefon), najpierw skraca się dziedzina i moduł („…”), nazwa lekcji zostaje; pełna ścieżka – w podpowiedzi po najechaniu myszą |

Szczegóły:

- **Pasek formatowania w trzech grupach:** Tekst (B, I, U, x², x₂, wielkość, kolor, Usuń formatowanie),
  Akapit (nagłówek, listy, wcięcia, wyrównanie i interlinia), Wstaw (link, symbole, data i godzina,
  nowa strona, wzór, ściągawka). Na komputerze i iPadzie grupy łamią się w dwa wiersze (bez
  przewijania), na telefonie pasek przewija się w bok. Pod paskiem otwarty jest najwyżej jeden panel
  (kolor, wielkość, akapit, symbole).
- Na telefonie w podglądzie przycisk „Kopiuj notatkę” ma napis **Kopiuj** – razem z **PDF** i numerami
  stron mieści się w jednym wierszu.
- **Zapis:** wyrównanie i interlinia to nowe atrybuty akapitu, nagłówka i punktu listy (`data-align`,
  `data-line`). Starsza wersja aplikacji pokaże notatkę bez nich (i przy poprawianiu zapisze ją bez
  nich). Kopia zapasowa przenosi je; **eksport do arkusza (XLSX) – nie** (komórka nie ma wyrównania
  akapitów).
- **Wklejanie:** tekst z Worda i stron WWW zachowuje wyrównanie akapitów (np. wyśrodkowany tytuł);
  interlinia źródła – nie (strony mają różne odstępy, które w notatce wyglądałyby przypadkowo).
- **Cofanie:** zmiany, których przeglądarka nie umie zrobić własnym poleceniem (wyrównanie, interlinia,
  „Usuń formatowanie”, odwołanie, nowa strona), edytor robi na kopii treści i podmienia ją jednym
  poleceniem – to jeden krok Ctrl+Z; po cofnięciu kursor (albo zaznaczenie) wraca na miejsce sprzed
  zmiany, zamiast zaznaczać cały tekst.

## Testy, które wykonano

- **Testy logiki (Node.js): 316 – wszystkie zaliczone** (309 wcześniejszych + 7 nowych):
  - wyrównanie i interlinia: zapis przy akapicie, nagłówku i punkcie listy (punkt zagnieżdżony nie
    przejmuje wyrównania), złe wartości znikają, zwykły tekst bez zmian; wklejanie z Worda (`align`,
    `text-align`), z bloku nadrzędnego, `<center>`, „do lewej” zdejmuje; interlinia tylko z atrybutu
    notatki;
  - edytor (wcięcie jako `<blockquote>` z wyrównaniem przy akapicie) i powrót do zapisu; schowek (style
    dla Worda i atrybuty do ponownego wklejenia);
  - adres linku: `www.`, domena (także z polskimi znakami i portem), e-mail, odrzucone `javascript:`,
    `ftp:`, `data:`, `localhost:3000`, tekst bez kropki i z odstępem;
  - data i godzina: „20.10.2026”, „14:35”, „20.10.2026, 14:35”, zera wiodące, wpisane ręcznie (data,
    godzina, oba, puste, niepoprawne);
  - symbole: grupy bez powtórzeń, nazwy (⌀ – średnica), ostatnio użyte – najnowszy pierwszy, bez
    powtórzeń, najwyżej 8, odczyt uszkodzonej listy;
  - ustawienia: obie grupy ekranu Nauka domyślnie widoczne.
- **Testy w przeglądarce (Chromium): 145 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (140 wcześniejszych + 5 nowych):
  - ekran komputera: „Usuń formatowanie” na zaznaczeniu od pogrubienia do punktu listy – tekst bez
    wyróżnień, wielkości, koloru i indeksu, link zostaje, punkt listy staje się akapitem (drugi punkt
    zostaje w liście); Ctrl+Z – formatowanie wraca jednym krokiem z zaznaczeniem, Ctrl+Shift+Z –
    ponowienie; sam kursor – wcięcie, wyrównanie i interlinia akapitu znikają, kursor na końcu akapitu;
    **Wstaw do tekstu** – odwołanie w osobnej linijce, pisanie pod nim, Ctrl+Z usuwa odwołanie (a nie
    wcześniejszą zmianę), kursor na końcu akapitu; **Nowa strona** w środku akapitu – podział, kursor na
    początku drugiej części, Ctrl+Z – akapit w całości; zapis;
  - ekran komputera: trzy grupy paska; bez zaznaczenia – cały tekst do środka; zaznaczony akapit – do
    prawej i interlinia 2,0, Ctrl+Z cofa samą interlinię, potem 1,5; Enter – nowy akapit z tym samym
    ustawieniem; interlinia 1,5 w edytorze ≈ 2 × wielkość tekstu; link: Ctrl+K na zaznaczeniu,
    `javascript:` – komunikat, `www.przyklad.pl` → `https://www.przyklad.pl`, zmiana na e-mail
    (`mailto:`), **Usuń link** (tekst zostaje), link bez zaznaczenia z tekstem „Przykład” i pisanie dalej
    poza linkiem; symbole ⌀ i ° w miejscu kursora, „Ostatnio użyte” – ° ⌀; data (stały zegar
    20.10.2026 14:35): Dzisiaj, Teraz, Godzina, ręcznie 05.11.2026 bez godziny; zapisany HTML;
    w podglądzie wyrównanie i interlinia (1,55 / 2 / 2 / 1,55);
  - ekran komputera: **PDF** – okno drukowania (podmienione w teście) dostaje notatkę z obrazem
    wczytanym w pełnej rozdzielczości; nazwa pliku – nazwa lekcji; ścieżka, tytuł, podpis „Rys. 1. Bilans
    w skrócie”, podział strony, wzór, wyjustowanie; na ekranie wydruku nie widać; w trybie druku – tylko
    notatka (aplikacja i okno ukryte), czerwony w jasnym odcieniu, obraz na szerokość strony; **PDF
    z Chromium – 2 strony A4**; po zamknięciu okna wydruk znika, tytuł strony wraca; **Kopiuj** – obraz
    2000 × 1000 w schowku jako 605 × 303 px, wyjustowanie i interlinia 150% w stylu;
  - ekran telefonu: Kopiuj, PDF i strony w jednym wierszu w oknie; pasek przewija się w bok; panel
    wyrównania i panel symboli w szerokości ekranu, jeden panel naraz, ‰ w tekście; rysunek – symbole
    pod polem tekstowym (° w miejscu kursora: „Kąt 30° i 45”), ‰ w ostatnio użytych z notatki;
  - ekran telefonu: nad fiszką „Biznes › Finanse › Podstawy”; długa ścieżka (dziedzina i moduł
    przemianowane) – skraca się dziedzina i moduł, nazwa lekcji cała, nic poza ekranem; po sesji
    i 11 minutach (zegar w teście)
    na ekranie Nauka są „Powtórka na dziś” i „Ostatnia sesja”; w Ustawieniach → Ekran Nauka wyłączone –
    znikają z Nauki, na Starcie zostają; po włączeniu wracają.
- **Lint: bez błędów.**
- Zrzuty (Chromium): panel wyrównania i interlinii, okno linku, panel symboli, podgląd (komputer);
  pierwsze strony PDF; podgląd z Kopiuj i PDF, panel akapitu, panel symboli, symbole w polu tekstowym
  rysunku, ścieżka nad fiszką, Ustawienia → Ekran Nauka (telefon).

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** – testy działają w Chromium z ekranem telefonu i iPada, nie w Safari na
  iOS. Najważniejsze do sprawdzenia u Ciebie: **cofanie** po wyrównaniu, interlinii, „Usuń formatowanie”,
  „Wstaw do tekstu” i „Nowa strona” (Ctrl+Z na klawiaturze iPada, przycisk cofania na pasku klawiatury,
  potrząśnięcie iPhonem) – mechanizm podmiany treści sprawdziłem tylko w Chromium; Safari ma edytor
  z tego samego rodu, ale nie mogłem tego potwierdzić. Także: czy znak ⌀ wyświetla się w czcionce iOS.
- **PDF na iPhonie z aplikacji na ekranie początkowym** – nie wiem, czy iOS pokaże tam okno drukowania
  (w Safari pokazuje). Gdyby nic się nie działo – otwórz notatkę w Safari albo daj znać, dodam inny
  sposób. Na Windows (Edge) okno drukowania nie było sprawdzane – PDF powstał w Chromium w teście.
- **Wklejenie do Worda i OneNote** – nie sprawdzone (brak Worda w środowisku testów); sprawdzony jest
  HTML w schowku: wymiary obrazu, wyrównanie i interlinia w stylu.
- **Ctrl+K w Edge i Chrome na Windows** – w Chromium na Linuksie strona przechwytuje skrót; na Windows nie
  sprawdzono (gdyby otwierał wyszukiwanie przeglądarki – jest przycisk Link).
