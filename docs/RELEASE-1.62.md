# LexiCards 1.62 – magiczne fiszki

Wersja 1.62.0, 31 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Magiczne fiszki”).
Według zaakceptowanej makiety, we wszystkich trzech wersjach kolorystycznych (fiolet, złoto, turkus) z wyborem w Ustawieniach.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Przycisk „Magiczna fiszka”** | Pierwszy na pasku formatowania w oknie tekstu notatki (karta z gwiazdką, Ctrl+M); na telefonie zostaje na początku paska, gdy pasek się przewija. |
| **Fragment na fiszkę** | Zaznaczony tekst (w jednym akapicie, z polskiej albo angielskiej wersji) zmienia się na kolor fiszki, pogrubiony, z sygnaturą ✦N.M (fiszka N, fragment M). Kursor w akapicie z odwołaniem `[[…]]` – na fiszkę trafia obraz albo tabela notatki. Z cofaniem (Ctrl+Z). |
| **Błyszczące piksele** | Z tekstu fragmentu wylatują piksele w kolorach fiszki i lecą łukiem na fiszkę obok edytora; fragment ląduje w worku z rozbłyskiem. |
| **Fiszka obok edytora** | Na komputerze i iPadzie w poziomie (od 1000 px) z prawej obok tekstu (tekst przesuwa się w lewo), na telefonie wysuwa się z prawej nad tekst. Strzałka › chowa ją za krawędź – zostaje języczek z numerem fiszki i liczbą fragmentów (piksele lecą wtedy do języczka); na szerokim ekranie wybór jest zapamiętany. |
| **Stały format fragmentu** | Kursor we fragmencie: przyciski tekstu (pogrubienie, kolor, wielkość…) są wyszarzone, skróty nic nie zmieniają; pasek z sygnaturą – „Pokaż na fiszce”, „Usuń z fiszki” (tekst wraca do zwykłego). Tekst fiszki to zawsze tekst z notatki. |
| **Uporządkuj** | Worek i pola: pojęcie, definicja, przykład (po polsku i po angielsku) oraz obraz. Przeciąganie (palec, rysik, mysz – lista przewija się przy krawędziach), dotknięcie fragmentu i pola albo klawiatura (Tab, Enter). Obraz i tabela – tylko w polu „Obraz”, tekst – nie w nim. |
| **Teczka 3D** | „Do teczki” (uporządkowana albo nie): fiszka maleje i leci do teczki w prawym dolnym rogu, klapa się uchyla, karta wpada do środka, licznik rośnie; obok tekstu czeka pusta fiszka z następnym numerem. Teczka jest też w prawym dolnym rogu ekranów Biblioteki, gdy coś w niej czeka. |
| **Sprawdzenie w teczce** | Fiszki ze wszystkich notatek: stan (Gotowa / Do uzupełnienia / Brak pojęcia), lekcja – od razu lekcja notatki, dotknięcie zmienia ją na inną, „Uporządkuj”, „Usuń” (fragmenty wracają do zwykłego tekstu) i „Dodaj do lekcji…” – formularz nowego pojęcia wypełniony fragmentami (z przypiętym obrazem albo tabelą). Po zapisie pojęcie jest w lekcji, fiszka znika z teczki, a fragmenty w notatce zostają w kolorze fiszki z sygnaturą. |
| **Zapis i Anuluj** | Fiszki zapisują się z notatką; „Anuluj” cofa też zmiany fiszek z tej edycji (pojęcie dodane z teczki zostaje). Usunięty tekst fragmentu – fragment znika z fiszki przy zapisie. Wklejony tekst nie powiela fragmentów. Kopia zapasowa przenosi fiszki. |
| **Podgląd, PDF, czytanie** | W podglądzie fragmenty w kolorze fiszki z sygnaturą; w PDF, druku, „Kopiuj”, czytaniu na głos i słuchaniu – zwykły tekst. |
| **Kolor** | Ustawienia → Wygląd → „Magiczna fiszka”: fiolet (domyślnie), złoto (ciemnozłoty tekst, złote przyciski z ciemnym napisem, granatowa teczka) albo turkus – w jasnym i ciemnym motywie; ustawiony przed narysowaniem strony (bez mignięcia). |

## Własność intelektualna

Własny kod bez bibliotek: oznaczenia w treści notatki, iskry na płótnie (krzywe Béziera), przeciąganie zdarzeniami
wskaźnika, teczka z przekształceń 3D w CSS. Szczególnego ryzyka nie zidentyfikowano (wyszukiwania patentowego nie
robiono).

## Testy, które wykonano

- **Testy logiki (Node.js): 547 – wszystkie zaliczone**, w tym 6 nowych: znacznik fragmentu w treści notatki (jeden span
  na fragment, błędne sygnatury, wklejanie bez oznaczeń, zmiana sygnatury obrazu), fragmenty z treści (tekst, odwołanie
  jako obiekt, wersja angielska, fragment w dwóch akapitach), sprawdzanie fiszek i porządek z treścią, stan fiszki i szkic
  pojęcia, kolor w ustawieniach, biblioteka (zapis, teczka, zmiana pól i lekcji, usunięcie, pojęcie z fiszki) i kopia zapasowa.
- **Testy w przeglądarce (Chromium): 265 – wszystkie zaliczone w dwóch pełnych przebiegach** na tym samym kodzie, w tym 4 nowe:
  - komputer – edytor: przycisk pierwszy na pasku, tekst obok fiszki, iskry w połowie lotu (zatrzymany czas – płótno w oknie,
    fragment jeszcze w locie), kolor, pogrubienie i sygnatura fragmentu, pięć fragmentów (tekst i tabela przez `[[Bilans]]`),
    ten sam tekst drugi raz – komunikat, kursor we fragmencie – pasek, zablokowane pogrubienie i Ctrl+I, „Usuń z fiszki”,
    schowanie (języczek z liczbą, tekst na środku) i powrót, porządkowanie przeciąganiem i dotknięciem, odmowa tabeli
    w polu tekstu, klawiatura (Enter na fragmencie i na worku, fokus zostaje), zapis i podgląd z sygnaturą;
  - komputer – teczka: lot do teczki (w połowie – kopia fiszki i uchylona klapa, potem karta wpada), pusta fiszka ✦2,
    teczka z lekcją notatki, porządkowanie w teczce, „Dodaj do lekcji…” – formularz z polami i przypiętą tabelą, pojęcie
    w lekcji, pusta teczka, fragment z nazwą pojęcia; „Anuluj” cofa nową fiszkę z fragmentem z wersji angielskiej; teczka
    na ekranie Biblioteki, zmiana lekcji w drzewie, usunięcie fiszki (tekst bez oznaczeń, teczka znika);
  - telefon: przycisk widoczny na początku przewiniętego paska, fiszka schowana, iskry do języczka, wysunięcie, porządkowanie
    na całą szerokość, dotknięcie fragmentu i pola, nic poza ekranem, wysłanie do teczki;
  - ustawienia: fiolet, złoto, turkus – kolor fragmentu (rgb), granatowa teczka przy złocie, kolor po ponownym uruchomieniu
    (przed wczytaniem bazy), ciemny motyw.
  - Zmienione: notatka 1.20 (grupy paska – pierwsza „Magiczna fiszka”), notatka 1.29 (tekst obok fiszki, po schowaniu –
    na środku; wybór zapamiętany).
  - Testy notatek – zaliczone także osobno przed pełnymi przebiegami; cztery nowe testy – 3 razy z rzędu.
  - Pierwsza para pełnych przebiegów: 265 i 264 – w drugim test ustawień zrobił zrzut sekcji w chwili, gdy ekran ustawień
    rysował się od nowa po zapisie („element nie jest w dokumencie”). Poprawiony test (zrzut ponawiany), potem dwa nowe
    pełne przebiegi – oba 265/265.
- **Lint: bez błędów.**
- Zrzuty (Chromium): iskry w połowie lotu, worek, schowana fiszka, porządkowanie z przeciąganym fragmentem, lot do teczki,
  nowa fiszka ✦2, teczka, teczka w Bibliotece, telefon (iskry do języczka, fiszka, porządkowanie), ustawienia, złoto,
  turkus, ciemny motyw.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie** – zaznaczanie tekstu i przycisk na pasku (czy zaznaczenie zostaje po dotknięciu
  przycisku), przeciąganie palcem i płynność iskier i lotu do teczki sprawdzone tylko w Chromium z ekranem telefonu
  i komputera.
- Fragment obejmuje jeden akapit; zaznaczenie przez kilka akapitów – komunikat.
- Fiszka dodana do innej lekcji niż lekcja notatki – bez obrazów z notatki (fiszka pokazuje obrazy notatki swojej lekcji).
- Pojęcie wymaga nazwy po polsku i po angielsku (jak dotąd) – brakującą uzupełnia się w formularzu „Dodaj do lekcji…”.
- Pisanie tuż za fragmentem może go wydłużyć (kursor na granicy oznaczenia) – fragment zmienia się wtedy także na fiszce.
- Fiszka dodana do lekcji pokazuje się na pasku fragmentu z nazwą pojęcia, ale nie ma przejścia do pojęcia.
