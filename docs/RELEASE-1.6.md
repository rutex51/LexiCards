# LexiCards 1.6 – sygnatury obrazów w treści notatki, notatka po angielsku, czytanie na głos

Wersja 1.6.0, 19 października 2026. Obraz notatki można postawić w dowolnym miejscu tekstu przez
odwołanie do jego sygnatury, notatka może mieć wersję angielską (przełącznik PL / EN), a podgląd
notatki czyta ją na głos. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcje „Treść
notatki”, „Notatki w arkuszu”, „Notatka w stronach”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Sygnatury obrazów na poziomie notatki | Każdy obraz ma sygnaturę widoczną na miniaturze w edytorze: „Obraz 1”, „Obraz 2”… – nadaną przy dodaniu, więc nie zmienia się przy przesuwaniu obrazów. **Zmień sygnaturę** w menu obrazu nadaje własną (np. „Schemat bilansu”; musi być jedyna w notatce, bez nawiasów kwadratowych, do 40 znaków). Stare notatki dostają „Obraz 1”, „Obraz 2”… w kolejności obrazów |
| Łatwe umieszczanie obrazu w tekście prostą komendą | Linijka `[[Schemat bilansu]]` w tekście to miejsce obrazu w podglądzie. **Wstaw do tekstu** w menu obrazu wpisuje ją w osobnej linijce w miejscu kursora. Wielkość liter, polskie znaki i odstępy w odwołaniu nie mają znaczenia. Po zmianie sygnatury odwołania w obu wersjach językowych zmieniają się same. Odwołanie do sygnatury, której notatka nie ma, jest w podglądzie czerwone. Obrazy bez odwołania są przed tekstem albo po nim (wybór z 1.5). „Kopiuj notatkę” wstawia obrazy w miejscach odwołań |
| Sygnatury w pliku Excela | Arkusz „Notatki” ma kolumnę **Image label** – sygnatura obrazu z tego wiersza (bez niej obrazy lekcji to „Obraz 1”, „Obraz 2”… po kolei). W komórce notatki odwołanie to wiersz `[[sygnatura]]` – także po pojedynczym Alt+Enter. Eksport zapisuje sygnatury, import je odtwarza |
| Notatka po angielsku z przełącznikiem języków | W edytorze nad tekstem przełącznik **Polski / Angielski** – każda wersja ma swoją treść, obrazy są wspólne. W podglądzie notatki z obiema wersjami przełącznik **PL / EN** obok nazwy lekcji; wybór jest zapamiętany, a gdy notatka nie ma wybranej wersji, pokazuje się ta, która jest. Edytor otwiera się w wersji z podglądu, a po zapisie podgląd pokazuje wersję edytowaną. Notatka może mieć samą wersję angielską |
| Opis w pliku importu | Arkusz „Notatki” ma kolumnę **Note EN** (rozpoznawane też „Notatka po angielsku”, „Notes English”). Wzór importu ma przykład wersji angielskiej, obraz z sygnaturą „Schemat bilansu” i odwołanie do niego, a jego opis w komórce mówi o obu kolumnach. Plik bez kolumny Note EN (np. starszy) nie zmienia wersji angielskiej istniejącej notatki. README opisuje nowe kolumny |
| Odsłuch notatek | Przycisk z głośnikiem obok nazwy lekcji czyta widoczną wersję notatki (polską albo angielską) głosem i tempem z Ustawień – synteza mowy urządzenia, bez internetu. Czyta zdanie po zdaniu od widocznej strony; czytany akapit jest wyróżniony, a strony przewracają się same. Ten sam przycisk (wtedy z symbolem pauzy) zatrzymuje i wznawia czytanie od przerwanego zdania. Zmiana wersji językowej, edycja i zamknięcie okna kończą czytanie. Obrazów nie czyta |

## Testy, które wykonano

- **Testy logiki (Node.js): 238 – wszystkie zaliczone** (231 wcześniejszych + 7 nowych):
  czyszczenie i porównanie sygnatur, odwołanie tylko jako cała linijka, nadawanie „Obraz N” (także
  przy powtórzeniach), zmiana sygnatury w odwołaniach; zapis wersji angielskiej i sygnatur
  w bibliotece (zapis bez tych pól ich nie usuwa, kopia lekcji, notatka tylko po angielsku); kopia
  zapasowa (także stara kopia bez sygnatur); arkusz notatek – rozpoznanie kolumn Note EN i Image
  label, sygnatury z wiersza obrazu, stary arkusz bez Note EN; eksport XLSX z nowymi kolumnami
  i import zastępujący bez Note EN.
- **Testy w przeglądarce (Chromium, ekran telefonu): 95 – wszystkie zaliczone w dwóch
  przebiegach** (92 wcześniejsze + 3 nowe; test eksportu i importu notatki uzupełniony o wersję
  angielską i sygnatury):
  - sygnatury: obraz w miejscu odwołania (także `[[ schemat ]]`), odwołanie bez obrazu na czerwono,
    obraz bez odwołania na końcu; kopiowanie z obrazem w miejscu odwołania; w edytorze sygnatury
    pod miniaturami, „Wstaw do tekstu” w miejscu kursora, zmiana sygnatury (powtórzona – błąd)
    zmienia odwołania w obu wersjach;
  - wersja angielska: przełącznik w podglądzie (język tekstu `lang`), wybór zapamiętany po
    ponownym otwarciu, edytor w wersji z podglądu, zmiana wersji w edytorze bez utraty drugiej,
    notatka bez wersji angielskiej – bez przełącznika;
  - czytanie na głos (udawana synteza mowy): start od nagłówka, język wersji, wyróżniony akapit,
    strony przewracają się same, pauza i wznowienie od przerwanego zdania, zmiana wersji kończy
    czytanie, czytanie po angielsku, koniec – przycisk wraca do stanu początkowego.
- **Lint (ESLint): bez błędów.**
- Zrzuty ekranu (telefon): czytanie z wyróżnionym akapitem, odwołanie bez obrazu i obraz bez
  odwołania, wersja angielska, edytor z sygnaturami i przełącznikiem języka, menu obrazu.

## Czego nie sprawdzono

- **Na iPhonie** – testy działają w Chromium z ekranem telefonu, nie w Safari na iOS. Czytanie na
  głos sprawdzone z udawaną syntezą mowy; do sprawdzenia u Ciebie: głos i płynność czytania
  w Safari, przewracanie stron w trakcie czytania.
- **Twój plik Excela** z kolumnami Note EN i Image label – sprawdzony tylko plik z eksportu
  aplikacji i tabele w testach.

## Warto wiedzieć

- Odwołanie musi być całą linijką: `Zobacz [[Obraz 1]]` w środku zdania zostaje zwykłym tekstem.
- Usunięcie obrazu nie usuwa odwołań – w podglądzie będą czerwone.
- Zmiana języka w edytorze kończy historię cofania (Ctrl+Z) dla tej wersji.
- Import w trybie „dopisz” numeruje nowe obrazy dalej („Obraz 3”…), więc odwołania `[[Obraz 1]]`
  z dopisywanego pliku wskażą istniejący obraz – w takim pliku lepiej nadać własne sygnatury.
