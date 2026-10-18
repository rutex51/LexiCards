# LexiCards 1.0 – sprawdzenie całości

Wersja 1.0.0, 15 października 2026. Dokument zestawia wymagania z „MASTER PROMPT — LEXICARDS”
ze stanem aplikacji, opisuje uzupełnienia dodane przy sprawdzaniu i wyniki testów, które
rzeczywiście wykonano.

## Jak sprawdzono

1. **Specyfikacja punkt po punkcie** – każdy wymóg porównany z kodem i raportami etapów
   (tabela niżej). Trzy przeoczone wymagania zostały uzupełnione w tej wersji.
2. **Testy automatyczne** – logika w Node.js i pełne scenariusze w przeglądarce Chromium.
3. **Przegląd wszystkich ekranów** (skrypt w przeglądarce testowej): 18 ekranów i okien –
   Start (pusty i z danymi), Biblioteka, Glosariusz z filtrami, dziedzina, moduł, lekcja,
   import, Nauka, fiszka (przód i odwrót), Słuchanie, Quiz (ustawienia i pytanie), Statystyki
   (biblioteki i dziedziny), Ustawienia – w czterech układach: telefon 320 px jasny, telefon
   390 px ciemny, komputer 1280 px jasny i ciemny. Sprawdzane: błędy i ostrzeżenia w konsoli,
   przewijanie w poziomie, kontrolki bez nazwy dla czytnika ekranu, obrazy bez opisu,
   zdublowane identyfikatory, nagłówek strony, kontrast tekstu (co najmniej 4,5:1, duży tekst
   3:1). Wynik: **0 problemów**. Skrypt sprawdzono próbką z celowo złym kontrastem – został wykryty.
4. **Wydajność przy 50 000 pojęć** (100 dziedzin, 1000 modułów, 5000 lekcji; Node.js na komputerze):
   glosariusz – pierwsza porcja 17 ms, z filtrem statusu 19 ms, wyszukiwanie 5 ms; liczby na
   Starcie (bez dzienników) 109 ms. Na telefonie czasy będą kilkukrotnie dłuższe.
5. **Przegląd kodu** – bez pozostawionych „TODO”, bez danych osobowych w repozytorium, bez
   zależności cyklicznych między 47 modułami.

## Uzupełnione w wersji 1.0

| Wymaganie | Co dodano |
| --- | --- |
| 8.1 – na ekranie głównym: nowe, do powtórki, w trakcie nauki, opanowane | Pasek czterech liczb w grupie „Postępy” na Starcie (w kierunku ze Statystyk), pod nim skuteczność quizów i czas nauki |
| 8.2 – filtrowanie fiszek według braków | Zakresy nauki „Nie znam pojęcia”, „Nie znam definicji”, „Nie znam przykładu” – według ostatniej oceny w kierunku fiszki; brakujący element nie jest brakiem wiedzy |
| 10 – statusy wizualne i filtr po statusie w glosariuszu | Status przy każdym pojęciu (glosariusz – lista i tabela, lekcja): Nowe, Do nauki, W trakcie nauki, Częściowo opanowane, Opanowane, osobno „Do powtórki”; filtr „Status” z wyborem kierunku (PL → EN, EN → PL, oba – słabszy z dwóch) |

Przy okazji: podpowiedź pod zakresem „Błędy z quizów” w formularzu nauki (wcześniej brakowało jej).

## Zgodność ze specyfikacją

Oznaczenia: **✓** – zrobione; **≈** – zrobione inaczej (powód obok); **–** – poza wersją 1.

| Punkt | Stan |
| --- | --- |
| 1–2. Technologia | ≈ Aplikacja w przeglądarce (PWA) zamiast natywnej Swift/SwiftUI – decyzja z etapu 1: bez płatnego konta deweloperskiego Apple, ten sam program na iPhonie i Windows. IndexedDB zamiast SwiftData, Web Speech zamiast AVSpeechSynthesizer, wykresy SVG zamiast Swift Charts, `node:test` i Playwright zamiast XCTest. ✓ Działa bez internetu, bez konta, bez reklam, trackerów, powiadomień, widżetów, AI i zewnętrznego serwera |
| 3. Hierarchia dziedzina → moduł → lekcja → pojęcie | ✓ |
| 3.1. Zarządzanie strukturą | ✓ Wszystkie operacje z listy; brakujący moduł i dziedzinę tworzy formularz lekcji; usuwanie podaje liczbę elementów podrzędnych i wymaga potwierdzenia. ≈ Kolejność zmieniana przyciskami w górę i w dół, nie przeciąganiem |
| 3.2. Zakres nauki | ✓ Dziedzina, moduł, lekcja, wiele lekcji, ulubione, trudne, do powtórki, bez powtórzeń pojęć. ≈ „Wiele modułów” – cała dziedzina albo jeden moduł; dowolnego zestawu modułów nie da się wybrać |
| 4. Model danych | ✓ Stałe identyfikatory UUID, pola z listy, historia ocen tylko dopisywana, postępy osobno dla kierunków; starsze dane i kopie są uzupełniane przy odczycie (np. harmonogram FSRS odtwarzany z historii ocen) |
| 5. Import i eksport | ✓ XLSX i CSV, kreator 7 kroków, nagłówki polskie i angielskie, odtwarzanie hierarchii z podsumowaniem, trzy tryby duplikatów z zachowaniem historii, eksport wszystkich poziomów i zaznaczonych pojęć, wersjonowana kopia zapasowa. ≈ Import w wątku interfejsu (z komunikatem o trwającej operacji) |
| 6. Fiszki | ✓ Materiał, kierunek (PL → EN, EN → PL, mieszany), liczba, kolejność, zakresy (wszystkie, nowe, do powtórki, trudne, ulubione, losowe i dodatkowe), obrót 3D, przycisk wymowy, wybór pierwszej strony (pojęcie, definicja, przykład) |
| 7. Trzy kafelki oceny | ✓ Wygląd, przełączanie, „Brak danych”, wynik względem dostępnych elementów, gesty i przyciski, cofanie, statusy, „Umiem wszystko” / „Nie umiem niczego”. ≈ 7.4 zmienione Twoją decyzją w wersji 0.4.2: „Umiem” zalicza komplet. ≈ Brak wibracji na iPhonie – Safari nie udostępnia jej stronom |
| 8. Powtórki FSRS | ✓ FSRS-6 (py-fsrs 6.3.2), uzasadnione mapowanie ocen, harmonogram osobny dla kierunków; 8.1 i 8.2 – od wersji 1.0 |
| 9. Quizy | ✓ Wybór jednokrotny (do 4 odpowiedzi, błędne najpierw z tej samej dziedziny, bez odpowiedzi brzmiących jak pytanie), pary (telefon 5, szeroki ekran 8, liczniki, animacje, czas), test mieszany z regulowanymi proporcjami, konfiguracja z limitem czasu i progiem 80%, wyniki, historia, „Powtórz błędne odpowiedzi”; quizy nie zmieniają FSRS |
| 10. Glosariusz | ✓ Tabela na szerokim ekranie, lista z rozwijanymi szczegółami na telefonie, wyszukiwanie, filtry (dziedzina, moduł, lekcja, status, tagi, ulubione), sortowanie, zaznaczanie wielu, edycja, usuwanie, statusy – od wersji 1.0; od 1.0.1 przy pojęciu tylko status ostatniej oceny, „Do powtórki” w filtrze (Twoja decyzja) |
| 11. Wymowa | ✓ Polski i angielski, wybór głosu, szybkość, ponowne odtworzenie, bez zewnętrznych usług; głos zastępczy, gdy wybrany się nie odzywa |
| 12. Dashboard i wykresy | ✓ Wskaźniki, znajomość pojęć, definicji i przykładów osobno dla kierunków, 7 wykresów, agregacja na poziomie lekcji, modułu i dziedziny |
| 13. Interfejs | ✓ Pięć zakładek, ustawienia w górnym pasku, panel boczny na szerokim ekranie, jasny i ciemny motyw (oraz kolor aplikacji do wyboru), rozmiar tekstu z systemu, opisy dla czytnika ekranu, ograniczenie ruchu, kolory statusów zawsze z nazwą |
| 14. Synchronizacja iCloud | ≈ Zastąpiona kopią zapasową w pliku: aplikacja w przeglądarce nie ma dostępu do iCloud, a zewnętrzny serwer jest wykluczony |
| 15. Prywatność | ✓ Eksport, kopia, przywrócenie, usunięcie danych z ostrzeżeniem; strona poza wyszukiwarkami. – Usuwanie danych z iCloud (nie dotyczy) |
| 16. Wydajność | ✓ Stronicowanie glosariusza, wyszukiwanie po znormalizowanych kluczach, dzienniki historii wczytywane raz na zmianę danych; pomiary wyżej |
| 17. Struktura projektu | ≈ `js/core` (logika bez przeglądarki), `js/ui` (ekrany), `tests`, `tools`, `docs` |
| 18. Testy | ✓ Scenariusze 1–22, 25–26 w testach automatycznych; 27 – test importu i eksportu 50 000 pojęć oraz pomiary wyżej; 28 – częściowo (nazwy kontrolek, rozmiar tekstu, bez prawdziwego VoiceOver); 23–24 nie dotyczą (iCloud) |
| 20. Kryteria akceptacji | ✓ 1–20, 22, 23; ≈ 21 – kopia zapasowa zamiast iCloud |

## Testy (15 października 2026)

- **191 testów logiki** – wszystkie zaliczone (`npm test`).
- **69 testów w przeglądarce** (Chromium, Playwright) – wszystkie zaliczone w dwóch kolejnych
  przebiegach (`npm run test:e2e`). Nowe w tej wersji: liczby na Starcie, oznaczenia statusu
  w glosariuszu i lekcji, filtr statusu i kierunku, „Do powtórki” po upływie terminu, zakresy
  według braków (liczby i podpowiedź).
- **Lint** (ESLint) – bez uwag poza celowym znacznikiem `__ASSETS__` w szablonie service workera.
- **Pliki generowane** (`sw.js`, `js/version.js`) – aktualne (`npm run build -- --check`).

Nie sprawdzono na prawdziwym iPhonie ani komputerze z Windows w tej wersji – sprawdzisz to,
pobierając aktualizację.

## Uzupełnienie w wersji 1.0.1 (16 października 2026)

- **Słuchanie w samochodzie:** po pierwszym pojęciu nie było słychać kolejnych. Kod mowy nie
  zmienił się od wersji 0.6.2, w której to działało, więc przyczyną jest najpewniej połączenie
  Bluetooth / CarPlay: usypia w przerwach (czas na zastanowienie) i budzi się z opóźnieniem,
  a krótkie słowo mieści się w tym opóźnieniu w całości. Nowa opcja **Podtrzymuj dźwięk
  (Bluetooth, CarPlay)**, domyślnie włączona: cichy dźwięk w tle przez całe słuchanie. Przy okazji
  przyciski na kierownicy i w słuchawkach sterują odtwarzaczem (pauza, wznowienie, następne,
  poprzednie pojęcie). **Dziennik dźwięku** pod odtwarzaczem pokazuje, które wypowiedzi ruszyły
  i się skończyły – do skopiowania, gdyby kłopot wrócił. Nie sprawdzono na iPhonie ani w samochodzie.
- **Glosariusz:** przy pojęciu tylko jeden status – wynik ostatniej oceny (Twoja decyzja).
  „Do powtórki” zostaje w filtrze, na Starcie i w szczegółach pojęcia.
- **Ikony dziedzin:** 21 nowych (języki z flagami, ekonomia, zarządzanie, decyzje, zachowania,
  raportowanie, etyka) – razem 51. Flagi na Windows wyświetlają się jako litery.

## Uzupełnienie w wersji 1.0.2

- **Ikony dziedzin:** flaga Polski obok flag Wielkiej Brytanii, Hiszpanii i USA – razem 52 ikony.

## Uzupełnienie w wersji 1.0.3

- **Pasek zakładek (telefon):** „Nauka” w środku to okrągły przycisk w kolorze aplikacji, większy
  od pozostałych i wystający nad pasek; nazwa zostaje pod nim. Pasek poleceń nad zakładkami
  i komunikaty mają u dołu miejsce na wystający przycisk. Na szerokim ekranie (panel boczny) bez zmian.

## Znane ograniczenia

- Dane są w przeglądarce na danym urządzeniu; aplikacja z ekranu początkowego iPhone'a i karta
  Safari mają osobne dane. Urządzenia łączy kopia zapasowa w pliku (przywrócenie zastępuje dane).
- Repozytorium jest prywatne – aktualizacja wymaga chwilowego upublicznienia (README → Aktualizacje).
- Na iPhonie mowa działa tylko przy włączonym ekranie; w słuchaniu aplikacja nie pozwala mu zgasnąć.
- Jakość głosów zależy od systemu; polski głos w Safari bywa niedokładny przy polskich znakach.
- Brak wibracji na iPhonie; kolejność elementów zmieniana przyciskami, nie przeciąganiem.
- Import bardzo dużych plików i statystyki bardzo dużych bibliotek liczą się w wątku interfejsu.
- Stary format `.xls` trzeba zapisać jako `.xlsx`.
