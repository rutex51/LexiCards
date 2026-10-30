# LexiCards 1.56.1 – obroty fiszki, „Obraz” na stronach, miniatury

Wersja 1.56.1, 30 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Strony fiszki: kierunki,
wyśrodkowanie, własne strony pojęcia”, akapit „Od 1.56.1”). Poprawki do [1.56](RELEASE-1.56.md) po uwagach.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Kierunki obrotów** | Pierwszy obrót – **od prawej do lewej**; każdy następny (2. i 3.) – **z dołu do góry**; powrót do pytania (dotknięcie ostatniej strony albo przycisk obrotu w nagłówku) – **od lewej do prawej**. Podpisy w Nauce i w oknie pojęcia, np. „Po 2. obrocie (z dołu do góry)”. |
| **„Obraz” wśród części strony** | W wierszu każdej strony (Nauka – **Obroty fiszki**, okno pojęcia – **Własne strony tej fiszki**) obok **Tłumaczenie**, **Definicja**, **Przykład** jest czwarta część **Obraz**. Pojawia się, gdy jest obraz: w Nauce – gdy któreś pojęcie ma przypięty obraz, w oknie pojęcia – gdy to pojęcie go ma. Strona z „Obrazem” pokazuje **wszystkie** obrazy i tabele przypięte do pojęcia. |
| Gdzie są obrazy bez „Obrazu” | Gdy żadna strona nie ma zaznaczonego „Obrazu” (np. 1 obrót), przypięte obrazy są na ostatniej stronie. Pojęcie bez obrazów: część „Obraz” nic nie zmienia, a strona z samym obrazem jest pomijana (fiszka ma o stronę mniej). |
| **Miniatury przy wyborze** | Sekcja **Obrazy z notatki lekcji** w oknie pojęcia to kafelki ze wszystkimi rysunkami, zdjęciami i tabelami notatki lekcji – z miniaturą (tabela: pierwsze wiersze i kolumny), sygnaturą i rodzajem. Dotknięcie przypina albo odpina. |
| **Miniatury po wyborze** | Przypięte kafelki mają niebieską obwódkę, tło i ✓; pod kafelkami „Przypięte: N”. Przypięty obraz, którego nie ma już w notatce – osobny kafelek „nie ma w notatce lekcji” (dotknięcie odpina). |
| Pusta strona | Strona z samym „Obrazem” bez przypiętego obrazu – ostrzeżenie w oknie i błąd przy **Zapisz** (jak w 1.56). |
| Telefon | Cztery części strony mieszczą się w wierszu (szerokość opcji według napisu). |
| Zapis | Obrazy pojęcia: `cardMedia` – `[{ kind, label }]` (numer strony z 1.56 jest pomijany). Strona z obrazem w `cardFaces` i w ustawieniach Nauki: np. `answer+media`, `details+media` albo `media`. Starsza wersja aplikacji (1.56) takiej strony nie zna – pokaże stronę domyślną. |

## Zmiana względem 1.56

- Nie ma już wyboru strony przy każdym obrazie (lista „Po 1. obrocie…” z 1.56) ani obrazu na pierwszej stronie (pytaniu).
  Obrazy przypięte w 1.56 zostają przypięte; trafiają teraz na strony z „Obrazem”, a bez niego – na ostatnią stronę.

## Własność intelektualna

Bez nowych algorytmów; kafelki z miniaturami i wybór treści stron – własny interfejs, nazwy opisowe. Obrazy pochodzą
wyłącznie z notatek użytkownika.

## Testy, które wykonano

- **Testy logiki (Node.js): 534 – wszystkie zaliczone** (testy 1.56 zmienione, 1 nowy):
  - kierunki: right, up, up, powrót left;
  - części: „Obraz” jako czwarta część (`answer+media`, `details+media`, sam `media`), pusty zestaw – brak rodzaju, złe
    rodzaje z „+media” odrzucone, strony z obrazem w ustawieniach Nauki zapisane i odczytane;
  - obrazy pojęcia bez numeru strony (numer z 1.56 pomijany), bez powtórzeń, najwyżej 6;
  - strony w sesji: pojęcie bez obrazów – część „Obraz” usunięta, strona z samym obrazem pominięta (żadna – „wszystko”);
  - obrazy na stronach z „Obrazem”, bez niej – na ostatniej, pytanie bez obrazów; pusta strona; `hasCardMedia`; import
    z arkusza i kopia zapasowa – bez zmian w stronach i obrazach.
- **Testy w przeglądarce (Chromium): 249 – wszystkie zaliczone w dwóch pełnych przebiegach** (4 testy 1.56 przepisane):
  - komputer: notatka – „Edytuj” po lewej; Nauka – „Po 1. obrocie (od prawej do lewej)”, „Po 2./3. obrocie (z dołu
    do góry)”, powrót „od lewej do prawej”, bez „Obrazu”, gdy żadne pojęcie nie ma obrazu; sesja: right, up, up, powrót
    left, treść na środku, krótka definicja pogrubiona;
  - komputer: okno pojęcia – kafelki „Schemat” (miniatura wczytana, 192 px) i „Koszty” (miniatura tabeli), przypięcie
    dotknięciem (✓, „Przypięte: 2”), „Obraz” w wierszach stron dopiero po przypięciu, strona z samym obrazem, ostatniej
    części nie da się odznaczyć; odpięte – ostrzeżenie i błąd przy zapisie; zapis `['answer', 'media']` i obrazy bez
    numeru strony; ponowne otwarcie; sesja: pytanie i tłumaczenie bez obrazów, „Pokaż obraz z notatki”, strona „Z notatki
    lekcji” z obrazem i tabelą;
  - iPad (dotyk): „Obraz” w Nauce (pojęcie z obrazem), obraz na stronie z „Obrazem”, na następnej – nie; right, up, left;
    następne pojęcie (bez obrazu) – 3 strony;
  - telefon (390 px): cztery części strony mieszczą się (napisy nieucięte), kafelki w szerokości ekranu, miniatura;
    tabela na ostatniej stronie (bez „Obrazu”), bez przewijania w bok.
  - Test 1.39 (kierunki obrotów) – nowa kolejność.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno pojęcia z kafelkami (przed i po przypięciu), strona z obrazem i tabelą, ustawienia Nauki
  na iPadzie z „Obrazem”, iPad – tłumaczenie z obrazem, telefon – okno pojęcia i fiszka z tabelą.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec – dotyk udawany zdarzeniami Chromium; animacje obrotów (od prawej,
  z dołu, od lewej) nie były oglądane na urządzeniu.
- Obraz na pierwszej stronie (pytaniu) – nie (był w 1.56 przez wybór strony przy obrazie). Jeśli potrzebny, dodam
  „Obraz” także do pierwszej strony.
- Kolejność obrazów na stronie – kolejność przypięcia (bez przestawiania).
- Ograniczenia z 1.56 bez zmian: obraz przypięty sygnaturą (zmiana sygnatury w notatce – trzeba przypiąć od nowa),
  szerokiej tabeli nie przewiniesz palcem w bok, ciemny motyw.
