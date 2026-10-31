# LexiCards 1.62 – magiczne fiszki (od 1.62.2: szybkie fiszki)

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

## Uzupełnienie w wersji 1.62.1 – kolor teczki

| Funkcja | Jak działa |
| --- | --- |
| **Kolor teczki** | Ustawienia → Wygląd → „Teczka”: żółta, czarna, szara albo biała – w oknie notatki i na ekranach Biblioteki, w jasnym i ciemnym motywie (czarna w ciemnym motywie jaśniejsza, żeby była widoczna). |
| **Domyślnie** | Bez własnego wyboru teczka jest żółta, a przy złotej fiszce – szara (zamiast granatowej z 1.62). Wybór koloru równego domyślnemu nie jest zapisywany, więc teczka dalej dopasowuje się do koloru fiszki; własny wybór zostaje przy każdym kolorze fiszki. Kolor ustawiony przed narysowaniem strony (bez mignięcia). |
| **Numeracja** | Bez zmian, potwierdzona: osobna w każdej lekcji – notatka każdej lekcji zaczyna od ✦1. |

### Testy, które wykonano (1.62.1)

- **Testy logiki (Node.js): 548 – wszystkie zaliczone**, w tym nowy: kolory teczki, domyślna żółta, przy złotej fiszce szara,
  własny wybór przy każdym kolorze fiszki, nieznana wartość – domyślna; w teście biblioteki – fiszka ✦1 jednocześnie
  w notatkach dwóch lekcji (numeracja osobno w każdej lekcji).
- **Testy w przeglądarce (Chromium): 265 – wszystkie zaliczone w dwóch pełnych przebiegach** na tym samym kodzie; zmieniony test
  ustawień: przy złotej fiszce teczka szara (opis „domyślna przy złotej fiszce”), każdy z czterech kolorów na przedniej
  klapie teczki w oknie notatki, żółta przy turkusie nie jest zapisana (wybór domyślny), biała zapisana, kolor fiszki
  i teczki ustawiony po ponownym uruchomieniu przed wczytaniem bazy. Cztery testy magicznych fiszek – także osobno przed
  pełnymi przebiegami.
- **Lint: bez błędów.**
- Zrzuty (Chromium): cztery teczki, ustawienia z „Teczką”, złota fiszka z szarą teczką.

### Czego nie sprawdzono (1.62.1)

- Safari na iPhonie i iPadzie – jak w 1.62.

## Uzupełnienie w wersji 1.62.2 – szybkie fiszki, naprawa złota i turkusu

| Zmiana | Jak działa |
| --- | --- |
| **Nazwa** | „Magiczne fiszki” nazywają się teraz **szybkimi fiszkami** – przycisk na pasku, fiszka, teczka, komunikaty, Ustawienia → Wygląd → „Szybka fiszka”. Wygląd, sygnatury ✦N.M i zapisane fiszki – bez zmian. |
| **Błąd: złoto i turkus** | Przy złotym albo turkusowym kolorze zaznaczonego tekstu nie dało się wysłać na fiszkę – pojawiał się komunikat „Ten tekst jest już na fiszce (✦gold)”. Przyczyna: kolor fiszki był zapisany na całej stronie w tym samym atrybucie (`data-magic`), którym w notatce oznaczone są fragmenty, a sprawdzenie „czy tekst jest już na fiszce” szło w górę aż do początku strony. Przy fiolecie (domyślnym) atrybutu nie było, więc działało. Teraz kolor ma własny atrybut (`data-magic-color`), a sprawdzenie patrzy tylko na pole notatki. Dotyczyło to wszystkich urządzeń. |

### Testy, które wykonano (1.62.2)

- **Odtworzenie błędu przed poprawką** (tymczasowy test, poza repozytorium): dodanie fragmentu w trzech kolorach na komputerze,
  telefonie i iPadzie (Chromium) – złoto i turkus: 6 z 6 nieudanych (komunikat „już na fiszce (✦gold)” / „(✦teal)”),
  fiolet: 3 z 3 udanych.
- **Testy logiki (Node.js): 548 – wszystkie zaliczone.**
- **Testy w przeglądarce (Chromium): 267 – wszystkie zaliczone w dwóch pełnych przebiegach** na tym samym kodzie, w tym 2 nowe:
  - komputer: złoto, potem turkus (kolor wybrany w Ustawieniach) – na `<html>` nie ma `data-magic`, fragment dodany
    przyciskiem i drugi Ctrl+M, oba na fiszce, bez komunikatu „już na fiszce”, fragment w kolorze fiszki, kursor we
    fragmencie – pasek z sygnaturą;
  - telefon: złoto – zaznaczenie i dotknięcie przycisku, fragment oznaczony, języczek z liczbą 1.
  - Zmienione: nowa nazwa w testach (grupa paska „Szybka fiszka”, komunikaty), kolor w atrybucie `data-magic-color`.
  - Wcześniejsza para pełnych przebiegów: 267 i 266 – w drugim test „fiszki 1.56.1 na telefonie” (zwykła fiszka w Nauce,
    obszar bez zmian) kliknął w końcówkę obrotu fiszki, a kliknięcie w trakcie obrotu fiszka pomija (zamierzenie). Osobno
    6 z 6 udanych. Poprawiony test (czekanie na koniec obrotu między kliknięciami – też w teście „fiszki 1.39”), potem dwa
    nowe pełne przebiegi – oba 267/267.
- **Lint: bez błędów.**
- Zrzuty (Chromium): złota fiszka z dodanymi fragmentami (komputer), złoto na telefonie.

### Czego nie sprawdzono (1.62.2)

- Safari na iPhonie i iPadzie – jak w 1.62.
