# LexiCards 1.56 – strony fiszki: kierunki, środek, treść i obrazy z notatki

Wersja 1.56.0, 30 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Strony fiszki: kierunki,
wyśrodkowanie, własne strony pojęcia”).

Zmiany w głównym mechanizmie nauki: kolejność obrotów fiszki, układ treści na stronach, wybór treści każdej strony
(w Nauce i przy pojęciu) i obraz albo tabela z notatki lekcji na wybranej stronie fiszki. W oknie notatki przyciski
nagłówka zamienione stronami.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Notatka: „Edytuj” i „Zamknij”** | W nagłówku podglądu notatki **Edytuj** jest teraz po lewej, a **Zamknij** po prawej. Okna edycji (Anuluj / Zapisz, Gotowe) – bez zmian. |
| **Kolejność obrotów** | 1. obrót – **od lewej do prawej**, 2. obrót – **od prawej do lewej**, 3. obrót – **z góry na dół**; powrót do pytania (dotknięcie ostatniej strony albo przycisk obrotu w nagłówku) – **z dołu do góry**. Kierunek widać przy każdej stronie w Nauce, np. „Po 2. obrocie (od prawej do lewej)”. |
| **Treść na środku** | Każda strona (pytanie, tłumaczenie, definicja, przykład, obraz) to jeden blok na środku fiszki – w pionie i w poziomie, także gdy na stronie są dwie albo trzy dłuższe linie. Krótkie linie definicji i przykładu (do 42 znaków) są pogrubione, jak tekst pierwszej strony. Treść dłuższa niż fiszka przewija się od góry. |
| **Części stron w Nauce** | Grupa **Obroty fiszki**: przy 2 i 3 obrotach dla każdej strony zaznaczasz dowolnie **Tłumaczenie**, **Definicja**, **Przykład** (np. tłumaczenie z definicją). Co najmniej jedna część musi zostać. Przycisk na dole strony mówi, co dochodzi („Pokaż definicję”, „Pokaż przykład”). |
| **Własne strony pojęcia** | Okno pojęcia (**Edytuj**) – sekcja **Strony fiszki**, przełącznik **Własne strony tej fiszki** (na start – to, co w Nauce): pierwsza strona (pojęcie, definicja, przykład), liczba obrotów (po zmianie – strony jak domyślne w Nauce przy tej liczbie) i części każdej strony. Ta fiszka wygląda tak w każdej sesji, niezależnie od ustawień Nauki. |
| **Obraz z notatki na fiszce** | Sekcja **Obrazy z notatki lekcji** – **Przypnij do fiszki**: rysunek, zdjęcie albo tabela z notatki lekcji (lista po sygnaturach) i strona: **Pytanie**, **Po 1. obrocie**, **Po 2. obrocie**, **Po 3. obrocie**. Najwyżej 6 na fiszce, ✕ odpina. Fiszka pokazuje obraz albo tabelę pod tekstem strony, z sygnaturą; obraz mieści się na stronie razem z krótkim tekstem. |
| Strona z samym obrazem | Własną stronę bez zaznaczonych części można zostawić, gdy jest na niej obraz z notatki (nagłówek „Z notatki lekcji”, przycisk „Pokaż obraz z notatki”). Strony, która nic by nie pokazała, nie da się zapisać – ostrzeżenie w oknie i komunikat przy **Zapisz**. |
| Zapis | Pojęcie ma pola `cardFaces` (`{ front, faces }` albo null) i `cardMedia` (`[{ kind, label, face }]`). Kopia zapasowa je przenosi; import z arkusza ich nie zmienia. Starsza wersja aplikacji je pominie (fiszka jak w ustawieniach Nauki). |

## Jak to działa (w skrócie)

- Strony fiszki opisuje nowy moduł `core/card-faces.js`: części strony, rodzaj strony z zestawu części, kierunki obrotów,
  sprawdzanie własnych stron i obrazów pojęcia.
- Obraz z notatki jest wskazany sygnaturą (jak odwołania `[[…]]` w treści notatki) – fiszka szuka go w notatce lekcji przy
  każdym pokazaniu, więc poprawiony rysunek albo tabela od razu są na fiszce.
- Środek w pionie: treść strony ma automatyczne marginesy w kolumnie; przycisk na dole nie zabiera już części wolnego miejsca.

## Własność intelektualna

Obracanie fiszek, wybór treści stron i obraz na karcie to ogólne funkcje programów do nauki z fiszkami. Kod i nazwy
w interfejsie własne, bez bibliotek i zewnętrznych usług; obrazy pochodzą wyłącznie z notatek użytkownika.

## Testy, które wykonano

- **Testy logiki (Node.js): 533 – wszystkie zaliczone** (8 nowych):
  - kierunki: obroty left, right, down, powrót up;
  - części strony: rodzaj z każdego zestawu (kolejność bez znaczenia), pusty zestaw – strona z samym obrazem; nowe rodzaje
    w ustawieniach Nauki zapisane i odczytane, strona z samym obrazem w ustawieniach Nauki – odrzucona;
  - własne strony pojęcia: najwyżej 3 strony, złe rodzaje pominięte, zła pierwsza strona – pojęcie, bez stron – null;
  - obrazy na stronach: rodzaj, sygnatura (spacje, do 40 znaków), strona 0–3, powtórzenia tej samej sygnatury – raz,
    najwyżej 6;
  - własne strony przed ustawieniami sesji; obraz przypięty dalej niż ostatnia strona – na ostatniej; pusta strona – numery;
  - szkic pojęcia → zapis → szkic (kopie, pojęcie sprzed 1.56 – null i []);
  - biblioteka: zapis pojęcia, import z arkusza (aktualizacja) nie kasuje stron i obrazów, ten sam wiersz drugi raz – bez
    zmian, kopia zapasowa – te same strony i obrazy.
  - Test 1.39 (kierunki obrotów) – nowa kolejność.
- **Testy w przeglądarce (Chromium): 249 – wszystkie zaliczone w dwóch pełnych przebiegach** (4 nowe):
  - komputer: notatka – „Edytuj” po lewej, „Zamknij” po prawej; Nauka – podpisy stron z kierunkiem, tłumaczenie dodane
    do 2. strony; sesja: obroty left, right, down, powrót up; na każdej stronie treść na środku (w poziomie < 2 px, odstęp
    nad i pod treścią – różnica ≤ 8 px), krótka definicja pogrubiona (700) i wyśrodkowana, przyciski „Pokaż definicję”,
    „Pokaż przykład”; ustawienie zapamiętane;
  - komputer: okno pojęcia – „Własne strony tej fiszki” (na start z Nauki), pierwsza strona „Przykład”, 2 obroty (strony
    jak w Nauce), ostatniej części nie da się odznaczyć bez obrazu; lista obrazów z notatki („Schemat (zdjęcie)”, „Koszty
    (tabela)”), Schemat na pytaniu, Koszty po 2. obrocie, strona z samą tabelą; odpięta tabela – ostrzeżenie i błąd przy
    zapisie; zapis i ponowne otwarcie; sesja: pytanie – przykład z obrazem (wczytany, sygnatura, na środku), tłumaczenie,
    „Pokaż obraz z notatki”, strona „Z notatki lekcji” z tabelą (komórki), na środku;
  - iPad (dotyk): części stron dotknięciem, strony dotknięciem fiszki (left, right, powrót up), tłumaczenie z definicją na
    środku; strona z definicją, przykładem i obrazem – na środku w poziomie, przewija się od góry;
  - telefon (390 px): okno pojęcia – części stron i wiersz obrazu w szerokości ekranu; tabela na fiszce bez przewijania
    strony w bok.
- **Lint: bez błędów.**
- Zrzuty (Chromium): nagłówek notatki, ustawienia Nauki, cztery strony fiszki, pytanie z obrazem, strona z tabelą, okno
  pojęcia (komputer i telefon), iPad.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec – dotyk udawany zdarzeniami Chromium. Animacja obrotu z góry na dół
  (obrót wokół osi poziomej) nie była oglądana na urządzeniu.
- Obraz jest przypięty **sygnaturą**: po zmianie sygnatury w notatce fiszka pokaże „„…” – nie ma w notatce lekcji” (trzeba
  przypiąć go od nowa). Usunięcie obrazu z notatki – to samo.
- Przy przeniesieniu pojęcia do innej lekcji przypięte obrazy szukane są w notatce nowej lekcji.
- Szeroka tabela przewija się w bok w swoim polu tylko myszą albo gładzikiem – na dotyku ruch w bok na fiszce to ocena
  („Umiem” / „Powtórz”), więc szerokiej tabeli palcem nie przewiniesz (wąska, np. 2–4 kolumny, mieści się).
- Dopasowanie wysokości obrazu do fiszki używa jednostek kontenera (Safari 16+); starsza przeglądarka – stała wysokość
  (30% ekranu), wtedy strona może się przewijać.
- Ciemny motyw.
