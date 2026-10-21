# LexiCards 1.28 – plik PDF notatki tworzony w aplikacji

Wersja 1.28.0, 21 października 2026. Wybrany wariant B propozycji zapisu PDF: plik powstaje w aplikacji,
z prawdziwym tekstem, zawsze na stronie A4 (bez wyboru formatu), z wyborem jakości obrazów. Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (sekcja treści notatki – „Od 1.28”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Tworzenie PDF – druk na iPhonie nie działa; wariant B (prawdziwy tekst) | Przycisk **PDF** pod notatką otwiera okno **PDF notatki** w trzech krokach (jak w makiecie): opcje → **Tworzę plik…** z paskiem postępu → gotowy plik (nazwa, liczba stron, wielkość, A4). Plik składa sama aplikacja – bez okna drukowania, bez internetu, nic nie jest nigdzie wysyłane. Na iPhonie **Udostępnij…** otwiera arkusz systemu: **Zachowaj w Plikach** (iCloud Drive albo „Na moim iPhonie”), Drukuj, Poczta, AirDrop; na komputerze **Pobierz plik** (folder Pobrane). |
| Prawdziwy tekst | Tekst w pliku można zaznaczać, kopiować i wyszukiwać (też polskie litery), linki działają. Wyrazy leżą dokładnie tam, gdzie w układzie notatki: wyjustowanie, wcięcia, wyrównanie, interlinia, pogrubienie, kursywa, podkreślenie, przekreślenie, indeksy, kolory. Kroje wbudowane w każdy czytnik PDF (Helvetica, dla wzorów Times, dla liter greckich i znaków matematycznych Symbol) – plik jest mały (notatka tekstowa – kilkadziesiąt kB). |
| Cała notatka na stronach A4 | Ścieżka i nazwa lekcji, nagłówki, listy (kropki, kółka, kwadraty, numery), wzory (wektorowo – ostre przy powiększeniu), tabele z formatami kolumn i podpisem „Tab. N.” (tabela na kilku stronach – **nagłówek tabeli na każdej stronie**, za szeroka tabela – mniejszy tekst), obrazy z podpisami „Rys. N.”, „Nowa strona”, numery stron „N / M”. Strony dzielą się jak w druku: nagłówek nie zostaje sam na dole strony, akapit nie zostawia pojedynczego wiersza na dole ani na górze. Zawsze jasne kolory, także przy ciemnym motywie. |
| Bez wyboru formatu (Letter) | Zawsze A4, bez przełącznika formatu. |
| Wybór jakości | **Jakość obrazów**: **Standardowa** – obrazy 150 dpi (mniejszy plik, do czytania na ekranie i zwykłego druku) albo **Wysoka** – 300 dpi (ostrzejsze przy powiększeniu i w druku, plik kilka razy większy). Obraz nie jest powiększany ponad oryginał. Wybór jest zapamiętany. Bez obrazów okno mówi, że jakość nie zmienia pliku. |
| (przy okazji) | **Nazwa pliku** do zmiany w oknie (domyślnie nazwa lekcji, „.pdf” dochodzi sama, znaki niedozwolone w nazwach plików są pomijane). **Drukuj…** w tym samym oknie otwiera dawne okno drukowania przeglądarki (na komputerze); w aplikacji otwieranej z ekranu początkowego iPhone'a tego przycisku nie ma – tam druk nie działa. |

## Testy, które wykonano

- **Testy logiki (Node.js): 369 – wszystkie zaliczone** (362 wcześniejsze + 7 nowych):
  kodowanie znaków (polskie litery w Helvetica, litery greckie i minus w Symbol, twarda spacja, miękki
  dywiz, č → c, „?” dla znaków spoza krojów, znak „›” w kodzie zastępczym); budowa pliku (tabela xref
  sprawdzona obiekt po obiekcie, dwie strony A4, tylko użyte kroje, Differences, szerokości 1–255, tytuł
  z polskimi literami, link z nawiasami i polską literą, kompresja; tekst odczytany z pliku przez jego
  mapy ToUnicode – „Zażółć gęślą jaźń”); krój i kolor ustawiane raz, obrazy JPEG i RGB, ścieżki,
  przycięcie; wzór rysowany wektorowo (Times pochylony, Symbol, kreski, linia bazowa, okrąg z czterech
  krzywych); podział na strony (pełne strony, „Nowa strona”, przycięcie, nagłówek nie na dole, pierwszy
  i ostatni wiersz akapitu nie sam, wiersze tabeli z powtórzonym nagłówkiem, wiersz wyższy niż strona).
- **Testy w przeglądarce (Chromium): 172 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (170 wcześniejszych + 2 nowe; dwa testy druku z 1.20 i 1.21 – teraz przez „Drukuj…” w oknie PDF):
  - ekran komputera, ciemny motyw aplikacji: okno (nazwa lekcji, Standardowa, „150 dpi”, bez „Letter”),
    Wysoka (zapamiętana), nazwa „Bilans: notatka” → plik „Bilans notatka.pdf”; plik odczytany w teście:
    nagłówek, tytuł, liczba stron jak w oknie, ścieżka i nazwa lekcji, „Bilans – zażółć gęślą jaźń”,
    tekst akapitu, znaki wzoru σ i ∑, lista, link, kroje (Helvetica, Helvetica-Bold, Times-Italic,
    Symbol), tabela 40 wierszy na co najmniej dwóch stronach z nagłówkiem na każdej, podpisy „Tab. 1.”
    i „Rys. 1.”, ostatnia strona od tekstu po „Nowej stronie” z numerem „N / N”, kolor tekstu #1d1d1f
    (bez białego tekstu); obraz 1600 px przy wysokiej jakości i 1051 px przy standardowej, plik
    standardowy mniejszy; „Drukuj…” – okno drukowania z nazwą lekcji;
  - ekran telefonu z podstawionym arkuszem udostępniania i trybem aplikacji z ekranu początkowego: bez
    „Drukuj…”, „Notatka nie ma obrazów”, „1 strona”, „Udostępnij…” pierwsze (główne), „Pobierz plik”
    drugie, nic nie wystaje poza ekran; do arkusza trafia plik „Financial Statements.pdf”,
    `application/pdf`, zaczynający się od „%PDF-1.4”.
- Ręcznie w Chromium (skrypty poza repozytorium), pliki sprawdzone programami `pdfinfo`, `pdftotext`,
  `pdffonts`, `pdfimages` i obejrzane po zamianie stron na obrazy (`pdftoppm`): notatka z wyjustowanym
  akapitem, listami trzech poziomów, listą numerowaną, wzorem w tekście i w osobnym wierszu, wcięciem,
  znakami („cudzysłów”, –, —, …, €, ™, °C, ±, µm, ⌀), tabelą z formatami, obrazem i „Nową stroną” –
  4 strony, 37 kB (wysoka jakość 59 kB), czas tworzenia ok. 0,2 s; tabela 45 wierszy na trzech
  stronach z nagłówkiem; tabela 12 kolumn z długimi słowami – mieści się na stronie; długi adres się
  zawija; wzory ze znakami ∘ i ⌊ ⌋ – jako obraz; cztery zdjęcia 4000 × 3000 – standardowa 1,7 s
  (z pierwszym wczytaniem zdjęć) i 383 kB, wysoka 0,45 s i 1,0 MB.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno PDF (komputer i telefon), gotowy plik z „Udostępnij…”, strony pliku.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** – tworzenie pliku, arkusz udostępniania („Zachowaj w Plikach”) i wygląd
  pliku w podglądzie iPhone'a sprawdzone tylko w Chromium (arkusz udostępniania i tryb aplikacji
  z ekranu początkowego podstawione w teście). Układ korzysta z Helvetica, która jest na iPhonie; czas
  tworzenia na telefonie może być dłuższy (obrazy).
- Otwarcie plików w Adobe Acrobat, podglądzie macOS / iOS i w Edge – pliki obejrzane programami
  Poppler (`pdftoppm`, `pdftotext`), które używają zastępczych krojów (Liberation, Nimbus) jak każdy
  czytnik bez Helvetica.
- Znaki spoza krojów PDF w tekście (np. cyrylica, emoji, chiński) pojawiają się jako „?”; litery czeskie
  i inne ze znakami diakrytycznymi – bez nich (č → c). Polskie, niemieckie, francuskie litery i znaki
  techniczne (°, ±, µ, ×) są w pliku; ⌀ ma glif ∅ kroju Symbol (skopiowany daje ∅).
- Bardzo długa notatka (dziesiątki stron, wiele dużych zdjęć) na starszym iPhonie – pamięć płócien
  w Safari jest ograniczona; płótna są zwalniane po każdym obrazie, ale nie było próby na urządzeniu.
