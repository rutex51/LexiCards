# Etap 3 – nauka z fiszkami

Raport z trzeciego etapu. Wyniki testów pochodzą z rzeczywistego uruchomienia opisanego
w sekcji „Testy”; to, czego nie udało się sprawdzić, jest wymienione osobno.

## Co zostało zaimplementowane

**Przygotowanie sesji** (zakładka Nauka)

- Materiał: wszystkie dziedziny, jedna dziedzina, jeden moduł albo wybrane lekcje modułu.
- Kierunek: PL → EN, EN → PL albo mieszany (każde pojęcie raz, w jednym z kierunków).
- Zakres: Wszystkie, Nowe, Do powtórki, Trudne, Ulubione, Losowe – przy każdym widać,
  ile fiszek do niego pasuje.
- Liczba fiszek (10, 20, 50, wszystkie), kolejność (jak w lekcjach albo losowa) i pierwsza
  strona fiszki (pojęcie, definicja albo przykład).
- Ustawienia są zapamiętywane. Gdy nic nie pasuje, przycisk rozpoczęcia jest nieaktywny.
- Wejścia: przycisk „Rozpocznij naukę” na Starcie, „Ucz się tej lekcji” na ekranie lekcji,
  „Ucz się” w menu dziedziny, modułu i lekcji – materiał jest wtedy od razu wybrany.

**Fiszka**

- U góry nazwa lekcji, numer fiszki, liczba wszystkich i pasek postępu.
- Pierwsza strona pokazuje pojęcie w języku pytania. Dotknięcie fiszki (albo przycisk
  „Pokaż odpowiedź”) obraca ją animacją.
- Odwrót: tłumaczenie, pojęcie źródłowe, opis i przykład w obu językach. Brakujący opis
  lub przykład jest podpisany „Brak danych”. Długa treść przewija się wewnątrz fiszki.
- Przyciski głośnika czytają pojęcie, tłumaczenie, definicje i przykłady głosem z urządzenia
  (od wersji 0.3.1 także definicje).

**Trzy kafelki oceny**

- Pojęcie, Definicja, Przykład – każdy z ikoną, nazwą i stanem; działają jak przełączniki
  („Nie umiem” ↔ „Umiem”, zielone tło, zielona ramka i haczyk po zaznaczeniu).
- Są aktywne dopiero po odkryciu odpowiedzi.
- Kafelek elementu, którego pojęcie nie ma, jest nieaktywny i podpisany „Brak danych”.
- Pod kafelkami pasek i wynik liczony względem dostępnych elementów: 2/3, ale też 2/2 i 1/1.
- „Umiem wszystko” i „Nie umiem niczego” ustawiają dostępne kafelki, niczego nie zatwierdzając.

**Zatwierdzanie i statusy**

- Przesunięcie fiszki w lewo – **Umiem**, w prawo – **Powtórz**; obok są przyciski
  o tym samym działaniu. W trakcie przesuwania na fiszce widać, jaka decyzja zapadnie.
  Za krótki ruch odstawia fiszkę na miejsce.
- Przed odkryciem odpowiedzi fiszki nie da się zatwierdzić – ani gestem, ani przyciskiem.
- Status ostatniej oceny: komplet – Opanowane, co najmniej połowa – Częściowo opanowane,
  mniej – W trakcie nauki, zero – Do nauki. Dla pełnej fiszki to dokładnie 3/3, 2/3, 1/3, 0/3.
- Fiszka jest opanowana tylko przy komplecie zaliczonych elementów **i** decyzji „Umiem”.
  „Umiem” przy niepełnym wyniku zostawia status częściowy.
- Postęp jest zapisywany osobno dla kierunku PL → EN i EN → PL.

**Cofanie, podsumowanie, wznawianie**

- Strzałka w pasku u góry cofa ostatnią decyzję: usuwa jej wpis z historii i przywraca
  poprzedni stan pojęcia. Można cofać kolejne decyzje wstecz, także z podsumowania.
- Podsumowanie sesji: liczba ocenionych fiszek, podział na cztery statusy, przycisk
  „Powtórz odłożone” uruchamiający rundę tylko z fiszek odłożonych do powtórki.
- Każda decyzja jest zapisywana od razu. Zamkniętą w połowie sesję można wznowić ze Startu
  albo z zakładki Nauka – także po ponownym otwarciu strony i po przywróceniu kopii
  zapasowej na innym urządzeniu. „Zakończ” kończy sesję przed czasem.

**Powtórka tej samej sesji** (wersja 0.3.2)

- Na podsumowaniu „Powtórz całą sesję” uruchamia od nowa wszystkie fiszki sesji – także
  ocenione jako „Umiem” – z tymi samymi ustawieniami. Po rundzie powtórkowej oznacza to
  pełny zestaw z pierwszej rundy, nie tylko odłożone fiszki.
- Ostatnia zakończona sesja (z co najmniej jedną oceną) jest zapamiętywana: na Starcie
  i w zakładce Nauka jest przycisk „Powtórz ostatnią sesję”, także po ponownym otwarciu strony.
- Przy kolejności losowej fiszki są tasowane na nowo, kierunek każdej fiszki zostaje ten sam.
  Pojęcia usunięte w międzyczasie są pomijane.
- Formularz sesji pamięta ostatnio wybrany materiał (dziedzinę, moduł, lekcje).

**Historia ocen i stan nauki**

- Każda zatwierdzona fiszka dopisuje wpis do historii (wynik, liczba ocenianych elementów,
  status, decyzja, kierunek, data). Wpisów nic nie nadpisuje.
- W szczegółach pojęcia widać ostatnią ocenę w każdym kierunku i przycisk „Historia ocen”.
- Usunięcie pojęcia usuwa jego postęp i historię; przeniesienie do innej lekcji je zachowuje.

**Wymowa** (Ustawienia → Wymowa)

- Szybkość czytania oraz wybór głosu polskiego i angielskiego spośród głosów urządzenia.

**Klawiatura** (komputer)

- Spacja lub Enter – odwróć, 1 2 3 – kafelki, ← Umiem, → Powtórz, Z lub Backspace – cofnij.

## Decyzje, o których warto wiedzieć

- **Zakres „Do powtórki” opiera się na razie na ostatniej ocenie:** trafiają tam fiszki
  odłożone decyzją „Powtórz” oraz zatwierdzone z niepełnym wynikiem. Planowanie powtórek
  w czasie (FSRS) to etap 4; status ostatniej oceny pozostanie wtedy osobną informacją.
- **„Trudne”** to pojęcia z trudnością 4–5 ustawioną w edycji albo ostatnio ocenione
  poniżej połowy.
- **Tryb mieszany** losuje kierunek dla każdego pojęcia przy budowaniu sesji, a przy
  zakresie „Nowe” wybiera spośród kierunków, w których pojęcie jest jeszcze nowe.
- **Pierwsza strona „Definicja” lub „Przykład”:** gdy pojęcie nie ma takiej treści
  w języku pytania, na pierwszej stronie pokazuje się samo pojęcie.
- **Na odwrocie powrót do pytania** to mały przycisk w nagłówku fiszki (i dotknięcie
  fiszki), żeby zostało więcej miejsca na opis i przykład.

## Błędy znalezione przez testy i poprawione w tym etapie

- Gest przesunięcia nie działał dla dotyku na treści fiszki: przewijana strona fiszki
  przejmowała ruch w poziomie. Wykrył to test wykonujący gest zdarzeniami dotyku
  (test z myszą przechodził). Poprawione regułą `touch-action` na stronie fiszki.
- Decyzja kliknięta w ostatnich 0,2 s obrotu fiszki była ignorowana.
- Długa nazwa lekcji poszerzała ekran sesji poza szerokość telefonu.
- Test „nic nie wystaje poza ekran 320 px” z etapów 1–2 porównywał szerokość treści
  z wartością, która w trybie telefonu rośnie razem z treścią, więc nie mógł niczego wykryć.
  Teraz porównuje z szerokością urządzenia; wcześniejsze ekrany przeszły poprawioną wersję.

## Pliki

| Plik | Zawartość |
| --- | --- |
| `js/core/study.js` | dobór fiszek, treść stron, ocena z kafelków, postęp, podsumowanie sesji |
| `js/core/library.js` | sesja nauki, zatwierdzanie i cofanie decyzji jedną transakcją, historia ocen |
| `js/core/model.js`, `js/core/storage.js`, `js/core/text.js` | ustawienia nauki, odczyt historii pojęcia, odmiana „fiszka” |
| `js/ui/screens/study-setup.js` | przygotowanie sesji |
| `js/ui/screens/study-session.js` | fiszka, kafelki, gesty, klawiatura, podsumowanie |
| `js/ui/speech.js` | wymowa |
| `js/ui/screens/settings.js` | ustawienia wymowy |
| `js/ui/screens/start.js`, `library.js`, `terms.js` | wejścia do nauki, stan nauki pojęcia |
| `js/ui/actions.js` | arkusz historii ocen |
| `js/ui/router.js`, `js/ui/shell.js`, `js/ui/icons.js`, `js/ui/components.js`, `js/main.js` | adresy ekranów nauki, tryb bez paska zakładek, ikony |
| `css/app.css` | wygląd ekranów nauki |
| `tests/unit/study.test.js` | 25 testów logiki nauki |
| `tests/e2e/run.mjs` | 15 nowych testów w przeglądarce, poprawiony test szerokości ekranu |

## Testy

Uruchomione 12 października 2026 w środowisku Linux, Node.js 22.22.0, Chromium przez Playwright.

| Polecenie | Wynik |
| --- | --- |
| `npm test` | 134 testy, 134 zaliczone |
| `npm run test:e2e` | 44 testy, 44 zaliczone (dwa kolejne przebiegi) |
| ESLint (`no-undef`, `no-unused-vars` i pokrewne) | brak uwag w kodzie aplikacji |
| kontrast tekstu na ekranach nauki (skrypt, motyw jasny i ciemny) | najniższy 4,81:1 przy wymaganym 4,5:1 |

**Scenariusze wymagane w specyfikacji**

| Scenariusz | Gdzie sprawdzony |
| --- | --- |
| Obracanie fiszki | przeglądarka: dotknięcie, przycisk, klawiatura, tryb ograniczonego ruchu |
| Zmiana stanu trzech kafelków | przeglądarka: przełączanie, blokada przed odkryciem odpowiedzi, szybkie przyciski |
| Poprawne obliczanie wyniku 0/3–3/3 | testy jednostkowe (wszystkie kombinacje) i przeglądarka |
| Obsługa brakujących definicji i przykładów | testy jednostkowe i przeglądarka: „Brak danych”, wynik 1/2 i 1/1, zapis `null` w historii |
| Przesuwanie fiszki w lewo i prawo | przeglądarka: gest dotykiem i myszą, krótki ruch, ruch w pionie, próba przed odkryciem odpowiedzi |
| Cofanie decyzji | testy jednostkowe i przeglądarka: pierwsza ocena, ocena wcześniej ocenionego pojęcia, cofnięcie z podsumowania |
| Niezależne postępy dla obu kierunków | testy jednostkowe i przeglądarka |

Poza tym testy w przeglądarce obejmują: wznowienie sesji po przeładowaniu strony, zakończenie
przed czasem, rundę powtórkową, zakresy z licznikami, wybór wielu lekcji, kolejność, pierwszą
stronę „Definicja”, wejścia z biblioteki, wymowę (z atrapą syntezatora – sprawdzany jest tekst,
język, szybkość i głos przekazane do przeglądarki), historię ocen, usunięcie pojęcia w trakcie
sesji, długie teksty na ekranie 320 px oraz przeniesienie postępów i niedokończonej sesji
kopią zapasową do drugiej przeglądarki.

### Czego nie sprawdzono

- **Safari na iPhonie.** Testy przeszły w Chromium z ekranem i dotykiem telefonu. Na
  prawdziwym urządzeniu nie sprawdzono gestu przesunięcia, płynności obrotu ani układu
  przy paskach Safari. To pierwsza rzecz do wypróbowania po aktualizacji.
- **Dźwięk wymowy.** Test potwierdza, że aplikacja przekazuje przeglądarce właściwy tekst,
  język, szybkość i głos. Nie sprawdza, czy i jak głos zabrzmi – to zależy od głosów
  zainstalowanych na urządzeniu.
- **Czytniki ekranu** (VoiceOver, NVDA). Kafelki mają stan „wciśnięty”, a paski postępu
  opisy, ale obsługi czytnikiem nie testowano.
- **Edge i Firefox.**

## Znane ograniczenia

- **Brak wibracji na iPhonie.** Safari nie udostępnia stronom sprzężenia haptycznego.
  Aplikacja wywołuje je tam, gdzie jest dostępne (Android).
- **Gest przy lewej krawędzi ekranu.** Przesunięcie rozpoczęte od samej krawędzi Safari
  traktuje jako „wstecz”. Fiszkę najlepiej przesuwać, zaczynając od jej środka.
- **Wysokość fiszki w Safari.** Paski przeglądarki zabierają część ekranu, więc dłuższy
  odwrót trzeba przewinąć wewnątrz fiszki. Po dodaniu aplikacji do ekranu początkowego
  fiszka jest wyższa.
- **Głosy.** Lista zależy od urządzenia; jakość głosów systemowych bywa różna. Lepsze głosy
  można pobrać w ustawieniach systemu (iPhone: Dostępność → Zawartość mówiona → Głosy).
- **Powtórki nie są jeszcze planowane w czasie** – to etap 4.
- **Jedna sesja naraz.** Rozpoczęcie nowej zamyka poprzednią (oceny zostają).
- **Dwie karty jednocześnie.** Nauka w dwóch kartach tej samej przeglądarki naraz nie jest
  przewidziana; druga karta odświeża się po zmianach w pierwszej.

## Jak uruchomić

- W przeglądarce: adres z pliku [README](../README.md). Po opublikowaniu nowej wersji
  aplikacja pokaże komunikat „Pobrano nową wersję aplikacji” z przyciskiem „Uruchom ją”;
  w karcie Safari wystarczy też odświeżyć stronę dwa razy.
- Wypróbowanie: Start → „Wczytaj dane przykładowe” (jeśli biblioteka jest pusta) →
  „Rozpocznij naukę”.
- Na własnym komputerze: `npm run serve`, potem http://localhost:8080/.
- Testy: `npm test`, `npm run test:e2e` (wymaga Playwright z Chromium).
