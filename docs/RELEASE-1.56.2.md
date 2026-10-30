# LexiCards 1.56.2 – obrót od prawej do lewej, przewijanie obrazów

Wersja 1.56.2, 30 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Strony fiszki: kierunki,
wyśrodkowanie, własne strony pojęcia”). Poprawka do [1.56.1](RELEASE-1.56.1.md) po uwagach: obroty w pionie wyglądały
chaotycznie; kilka obrazów na stronie – przewijane.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Kierunek obrotu** | Każdy obrót fiszki – na 2., 3. i 4. stronę oraz powrót do pytania (dotknięcie ostatniej strony albo przycisk obrotu w nagłówku) – idzie **od prawej do lewej**. Obrotów w pionie (z dołu do góry) już nie ma. |
| Podpisy | W Nauce i w oknie pojęcia strony mają podpisy bez kierunku („Po 1. obrocie”, „Po 2. obrocie”…); kierunek – raz, w opisie pod grupą **Obroty fiszki**: „Dotknięcie fiszki obraca ją (od prawej do lewej) na następną stronę”. |
| **Przewijanie obrazów** | Gdy na stronie fiszki jest kilka obrazów lub tabel z notatki, wszystkie są na tej jednej stronie, ale widać jeden naraz. Pod nim przyciski **‹** (poprzedni) i **›** (następny) oraz licznik „1 / 2”; na pierwszym ‹ jest wyszarzony, na ostatnim – ›. Przewijanie nie obraca fiszki i nie ocenia jej (także dotykiem na telefonie). Jeden obraz – bez przycisków, jak dotąd. Kolejność – kolejność przypięcia w oknie pojęcia. |

Reszta bez zmian (części stron z „Obrazem”, kafelki z miniaturami, treść na środku – jak w 1.56.1).

## Testy, które wykonano

- **Testy logiki (Node.js): 534 – wszystkie zaliczone** (kierunek: jeden obrót `right`, podpis „od prawej do lewej”).
- **Testy w przeglądarce (Chromium): 249 – wszystkie zaliczone w dwóch pełnych przebiegach**:
  - testy fiszek 1.39 i 1.56: `data-turn` = right po każdym obrocie i po powrocie do pytania, podpisy stron bez kierunku,
    w opisie grupy „obraca ją (od prawej do lewej)”, brak „z dołu do góry”;
  - komputer: dwa przypięte obrazy na jednej stronie – widoczny pierwszy, „1 / 2”, ‹ wyłączony; › – tabela, „2 / 2”,
    › wyłączony, fiszka dalej na tej samej stronie; ‹ – z powrotem obraz; treść na środku albo przewijana od góry;
  - telefon (dotyk): ›  – drugi obraz, bez obrotu i bez oceny (licznik fiszek „1 z 6”); iPad – jeden obraz bez przycisków.
  - Wcześniej, przy dwóch przebiegach uruchomionych przez pomyłkę równocześnie, raz nie przeszedł istniejący test gestów
    („stuknięcie po przeciągnięciu obraca fiszkę”); osobno na tym kodzie zawiódł 1 raz na 15 prób, na 1.56.1 – 0 na 8.
    W dwóch czystych pełnych przebiegach przeszedł. Ścieżka kodu stuknięcia się nie zmieniła; najpewniej to cecha
    udawanego dotyku w Chromium (jak w 1.54), ale nie jest to dowiedzione.
- **Lint: bez błędów.**
- Zrzuty (Chromium): ustawienia Nauki, fiszka w połowie obrotu, przewijanie obrazów na komputerze i telefonie.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec – dotyk udawany zdarzeniami Chromium; animacja obrotu nie była
  oglądana na urządzeniu (zrzut w połowie obrotu – z Chromium).
- Ograniczenia z 1.56 i 1.56.1 bez zmian (obraz przypięty sygnaturą, bez obrazu na pytaniu, szerokiej tabeli nie
  przewiniesz palcem, ciemny motyw).
