# Etap 4 – powtórki w odstępach (FSRS)

Raport z czwartego etapu. Wyniki testów pochodzą z rzeczywistego uruchomienia opisanego
w sekcji „Testy”; to, czego nie udało się sprawdzić, jest wymienione osobno.

## Co zostało zaimplementowane

**Algorytm**

- FSRS-6 przeniesiony do JavaScriptu z oficjalnej implementacji py-fsrs 6.3.2
  (Open Spaced Repetition, licencja MIT – jej treść jest w nagłówku `js/core/fsrs.js`).
  Te same wzory, 21 domyślnych parametrów, stany nauka / powtórki / ponowna nauka,
  krótkoterminowa stabilność dla powtórek tego samego dnia i rozmycie dłuższych odstępów.
- Ustawienia: docelowa skuteczność 90% (do zmiany w Ustawieniach: 80, 85, 90 albo 95%),
  kroki nauki nowej fiszki 1 i 10 minut, ponowna nauka po zapomnieniu 10 minut, najdłuższy
  odstęp 100 lat. Zmiana skuteczności dotyczy kolejnych ocen.
- Harmonogram jest osobny dla PL → EN i EN → PL: każda para pojęcie + kierunek ma własną
  stabilność, trudność i termin.

**Ocena dla FSRS**

FSRS przyjmuje jedną z czterech ocen przypomnienia: Again (zapomniane), Hard (z trudem),
Good (poprawnie), Easy (bez wysiłku). Od wersji 0.4.2 (na Twoją prośbę) przesunięcie
w lewo – „Umiem” – oznacza, że pamiętasz wszystko: dostępne kafelki zaznaczają się same.
Przesunięcie w prawo – „Powtórz” – bierze kafelki tak, jak je zaznaczyłeś:

| Decyzja i kafelki | Status ostatniej oceny | Ocena FSRS |
| --- | --- | --- |
| Umiem (kafelki zaznaczają się same) | Opanowane | Good |
| Powtórz, żaden kafelek | Do nauki – nieznane | Again |
| Powtórz, część kafelków bez pojęcia | częściowy – częściowo zapamiętane | Again |
| Powtórz, część kafelków z pojęciem | częściowy – częściowo zapamiętane | Hard |
| Powtórz, wszystkie kafelki | Opanowane, ale odłożone | Hard |

W wersjach 0.4.0–0.4.1 obowiązywała inna tabela („Umiem” z niepełnym wynikiem dawało Hard,
„Powtórz” obniżało ocenę o stopień). Oceny zapisane wtedy pozostają w historii bez zmian.
To odstępstwo od punktu 7.4 specyfikacji („Umiem” z niepełnym wynikiem zachowuje status
częściowy) – zastąpiła go Twoja decyzja.

Uzasadnienie:

- **Pojęcie (tłumaczenie) decyduje o Again.** Fiszka uczy przede wszystkim odpowiednika
  w drugim języku; gdy go nie pamiętasz, w sensie FSRS fiszka jest zapomniana, nawet jeśli
  pamiętasz definicję i przykład.
- **Komplet to Good, nie Easy.** Aplikacja nie mierzy, czy przypomnienie było bez wysiłku,
  a premia za Easy wydłużyłaby odstępy na wyrost. Easy nie jest przyznawane automatycznie.
- **Częściowo zapamiętane to Hard** – przypomnienie z trudem: tłumaczenie pamiętasz,
  ale nie całą resztę. Fiszka wraca wcześniej niż przy „Umiem”, ale nie jest zapomniana.
- **Komplet z „Powtórz” to Hard** – pamiętasz, ale chcesz wrócić do fiszki wcześniej.
- Brakujący opis lub przykład nie obniża oceny: 2/2 i 1/1 to komplet.
- Cztery statusy (3/3, 2/3, 1/3, 0/3) nie są przekładane wprost na cztery oceny FSRS. Status
  ostatniej oceny i poziom długoterminowy z FSRS to osobne informacje.

**Gdzie widać powtórki**

- **Start:** „Powtórka na dziś (N fiszek)”, gdy coś czeka – zaległe fiszki z całej biblioteki,
  od najdłużej czekających. Gdy nic nie czeka, krótka informacja, ile fiszek wróci dziś
  i kiedy najbliższa.
- **Zakładka Nauka:** ten sam przycisk na górze; zakres „Do powtórki” to fiszki z wybranego
  materiału, których termin minął (najpierw najbardziej zaległe).
- **Na fiszce:** pod „Umiem” i „Powtórz” napis „wróci za …” liczony na bieżąco z zaznaczonych
  kafelków. Podgląd i zapis korzystają z tego samego losowania rozmycia, więc się zgadzają.
- **Szczegóły pojęcia:** dla każdego kierunku ostatnia ocena, termin powtórki, poziom
  (Nowe, W nauce, Utrwalane, Utrwalone od stabilności 21 dni) i szansa przypomnienia dziś.
- **Historia ocen:** przy każdym wpisie ocena FSRS i odstęp do następnej powtórki.
- **Zakres „Trudne”:** dodatkowo fiszki z trudnością FSRS co najmniej 7 na 10.

**Zapis, cofanie, dane z etapu 3**

- Zatwierdzenie fiszki zapisuje jedną transakcją: ocenę w historii, wpis w dzienniku powtórek
  (ocena, stan przed i po, stabilność, trudność, odstęp), postęp z harmonogramem i stan sesji.
- Cofnięcie decyzji usuwa oba wpisy i przywraca poprzedni harmonogram.
- **Twoje dotychczasowe oceny zostały przeliczone.** Przy pierwszym otwarciu wersji 0.4
  aplikacja odtwarza harmonogram z historii ocen – każda ocena jest powtórką w chwili, w której
  ją zapisałeś. To samo dzieje się po przywróceniu starszej kopii zapasowej.
- Harmonogram i dziennik powtórek są w kopii zapasowej.

## Pliki

| Plik | Zawartość |
| --- | --- |
| `js/core/fsrs.js` | algorytm FSRS-6 (planista, stany, rozmycie, zaokrąglenia jak w Pythonie) |
| `js/core/study.js` | ocena FSRS z kafelków, harmonogram w postępie, zakres „Do powtórki”, powtórka na dziś, prognoza, poziom, opisy odstępów |
| `js/core/library.js` | zapis powtórki przy decyzji, podgląd odstępu, cofanie, przeliczenie danych sprzed FSRS, planista z ustawień |
| `js/core/model.js` | ustawienie `desiredRetention` |
| `js/ui/screens/study-session.js` | podpowiedź odstępu przy przyciskach decyzji |
| `js/ui/screens/start.js`, `study-setup.js` | powtórka na dziś, opisy zakresów |
| `js/ui/screens/terms.js`, `js/ui/actions.js` | termin i poziom w szczegółach pojęcia, ocena FSRS w historii |
| `js/ui/screens/settings.js` | docelowa skuteczność |
| `tools/gen_fsrs_reference.py` | generator wektorów referencyjnych z py-fsrs |
| `tests/fixtures/fsrs-reference.json` | 1113 powtórek policzonych przez py-fsrs 6.3.2 |
| `tests/unit/fsrs.test.js`, `tests/unit/review.test.js` | zgodność algorytmu i zapis powtórek |
| `tests/e2e/run.mjs` | test powtórek w przeglądarce z kontrolowanym zegarem |

## Testy

Uruchomione 12 października 2026 w środowisku Linux, Node.js 22.22.0, Chromium przez Playwright 1.56.

| Polecenie | Wynik |
| --- | --- |
| `npm test` | 158 testów, 158 zaliczonych (20 nowych w etapie 4) |
| `npm run test:e2e` | 47 testów, 47 zaliczonych (dwa kolejne przebiegi po poprawce opisanej niżej) |
| ESLint | brak uwag w kodzie aplikacji |
| kontrast tekstu na ekranie fiszki | podpowiedź odstępu 5,07:1 przy wymaganym 4,5:1 |

Pierwszy pełny przebieg testów w przeglądarce zakończył się jednym błędem: pomocnik testu
sprawdzał licznik fiszek w chwili, gdy ekran przechodził już do podsumowania. To był wyścig
w samym teście, nie w aplikacji; pomocnik czyta teraz stan strony jednym odczytem.

**Poprawność harmonogramu FSRS (scenariusz 16 specyfikacji)**

- Oficjalna biblioteka py-fsrs 6.3.2 (pobrana z GitHuba, commit 9446cb0) policzyła
  120 losowych historii – razem 1113 powtórek – w czterech ustawieniach: domyślnym bez rozmycia,
  bez kroków nauki ze skutecznością 85%, z jednym krokiem nauki, dwoma krokami ponownej nauki,
  skutecznością 95% i odstępem do 365 dni oraz domyślnym z rozmyciem (dla rozmycia zapisano
  wylosowane wartości i podano je wersji JavaScript).
- Wersja JavaScript odtwarza każdą powtórkę: stan, krok, termin i chwila powtórki są identyczne
  co do milisekundy; stabilność i trudność są identyczne bit w bit w 86% przypadków, a w pozostałych
  różnią się o najwyżej 4,5·10⁻¹⁵ wartości (różnice zaokrągleń funkcji potęgowej między Pythonem
  a JavaScriptem).
- Dodatkowe testy: odstęp przy 90% równa się stabilności, kolejność Hard < Good < Easy,
  zapomnienie obniża stabilność i podnosi trudność, kroki nauki 1 / 5,5 / 10 min.

**Zapis i interfejs**

| Scenariusz | Gdzie sprawdzony |
| --- | --- |
| Odwzorowanie kafelków i decyzji na ocenę FSRS | test jednostkowy wszystkich kombinacji (Easy nigdy) |
| Niezależne harmonogramy kierunków | testy jednostkowe i test w przeglądarce |
| Kolejne powtórki zgodne z planistą | test jednostkowy: pięć powtórek przez bibliotekę = pięć powtórek planisty |
| Podgląd = zapis | test jednostkowy z rozmyciem |
| Cofnięcie przywraca harmonogram i usuwa wpis powtórki | test jednostkowy |
| Przeliczenie ocen sprzed FSRS (także z kopii zapasowej) | testy jednostkowe |
| „Do powtórki” według terminów, najpierw najstarsze, limit bierze najbardziej zaległe | testy jednostkowe i test w przeglądarce |
| Powtórka na dziś ze Startu i z zakładki Nauka | test w przeglądarce z zegarem przesuwanym o 11 minut |
| Podpowiedź „wróci za …” przy kafelkach i decyzjach | test w przeglądarce |
| Termin, poziom i ocena FSRS w szczegółach i historii pojęcia | test w przeglądarce |

### Czego nie sprawdzono

- **Działanie przez wiele dni na prawdziwym urządzeniu.** Upływ czasu był symulowany
  (w testach jednostkowych podawaną chwilą, w przeglądarce zegarem Playwright).
- **Safari na iPhonie** – nowe elementy ekranu (podpowiedź przy przyciskach, blok na Starcie).
- **Dopasowanie parametrów do Ciebie.** Używane są parametry domyślne FSRS-6. Optymalizacja
  parametrów na podstawie własnej historii wymaga setek powtórek i nie jest częścią tego etapu.

## Znane ograniczenia

- **Parametry domyślne.** FSRS uczy się najlepiej na własnej historii; dziennik powtórek jest
  zapisywany, więc optymalizację można dodać później bez utraty danych.
- **Runda „Powtórz odłożone” i „Powtórz całą sesję”** to kolejne powtórki tego samego dnia.
  FSRS liczy je osobnym wzorem krótkoterminowym, więc nie wydłużają odstępów tak jak powtórka
  po kilku dniach – to zamierzone zachowanie algorytmu.
- **„Dziś” i „jutro”** w prognozie liczą się według zegara urządzenia; terminy są zapisywane w UTC.
- **Kolejność w powtórce na dziś** jest zawsze od najdłużej czekających (bez tasowania).
- **Easy nie jest używane**, więc najdłuższe odstępy rosną wolniej niż w aplikacjach,
  w których użytkownik sam wybiera „Łatwe”.

## Uzupełnienie w wersji 0.4.1: powtórka częściowo zapamiętanych

- Na podsumowaniu sesji obok „Powtórz odłożone” i „Powtórz całą sesję” jest
  **„Powtórz częściowo zapamiętane”** – fiszki zatwierdzone jako „Umiem”, ale bez kompletu kafelków.
- Obie grupy (odłożone i częściowo zapamiętane) są liczone z najnowszej oceny każdej fiszki
  sesji, więc obejmują wszystkie jej rundy: fiszka odłożona w pierwszej rundzie czeka, dopóki
  nie zostanie powtórzona, a fiszka poprawiona do kompletu znika z grupy.
- W zakładce Nauka grupa **„Ostatnia sesja”** ma te same trzy polecenia dla ostatniej
  zamkniętej sesji, z tymi samymi ustawieniami.
- Nowy zakres w formularzu sesji: **„Częściowo zapamiętane”** dla dowolnego materiału.
- Testy: nowy test logiki, rozszerzony test zakresów i nowy test w przeglądarce (podsumowanie,
  runda, zakładka Nauka, zakres). Wszystkie: 159 testów logiki i 48 w przeglądarce, bez błędów.

## Zmiana w wersji 0.4.2: „Umiem” to komplet, „Powtórz” według kafelków

- Przesunięcie w lewo (i przycisk „Umiem”, i strzałka ← na klawiaturze) zaznacza wszystkie
  dostępne kafelki – widać to na fiszce, zanim odleci. Wynik to zawsze komplet (3/3, 2/2, 1/1).
- Przesunięcie w prawo zapisuje kafelki tak, jak je zaznaczono. Po sesji fiszki z „Powtórz”
  dzielą się na **częściowo zapamiętane** (część kafelków) i **nieznane** (żaden kafelek).
- Podsumowanie i grupa „Ostatnia sesja” w zakładce Nauka mają polecenia: odłożone (wszystkie
  z „Powtórz”), częściowo zapamiętane, nieznane i cała sesja. Grupa z tymi samymi fiszkami co
  „odłożone” nie dostaje osobnego przycisku.
- Zakres „Częściowo zapamiętane” w formularzu sesji działa według tej samej reguły.
- Podpowiedź pod „Umiem” zawsze pokazuje odstęp dla kompletu; pod „Powtórz” zależy od kafelków.
- Testy: 159 testów logiki i 48 w przeglądarce (dwa kolejne przebiegi), bez błędów.

## Poprawka w wersji 0.4.3: powiększanie formularzy na iPhonie

- Objaw: po dotknięciu pola w formularzu (np. „Nowe pojęcie”) Safari powiększało stronę,
  przyciski „Zapisz” i „Anuluj” wychodziły poza ekran, a powiększenie zostawało po zamknięciu.
- Przyczyna: Safari powiększa stronę przy polu z tekstem mniejszym niż 16 px; pola dziedziczą
  rozmiar tekstu z ustawień systemu (Dynamic Type), który może być mniejszy.
- Poprawka: pola tekstowe i listy wyboru mają zawsze co najmniej 16 px, a na iPhonie i iPadzie
  znacznik widoku dostaje `maximum-scale=1` (Safari nadal pozwala powiększać dwoma palcami).
  Pola opisów i przykładów nie podpowiadają już danych kontaktowych.
- Test w przeglądarce z tekstem systemowym 14 px sprawdza, że pola formularza mają 16 px; bez
  poprawki pokazywał 14 px. Na prawdziwym iPhonie poprawki nie sprawdzono.

## Jak uruchomić

- W przeglądarce: adres z pliku [README](../README.md); w Safari odśwież stronę dwa razy albo
  użyj przycisku „Uruchom ją”. W Ustawieniach powinna być widoczna wersja 0.4.0.
- Wypróbowanie: zatwierdź kilka fiszek, a po kilku minutach otwórz Start – pojawi się
  „Powtórka na dziś” dla fiszek z ocenami Again i Hard.
- Testy: `npm test`, `npm run test:e2e` (wymaga Playwright z Chromium).
- Ponowne wygenerowanie wektorów referencyjnych:
  `python3 -I tools/gen_fsrs_reference.py ŚCIEŻKA_DO_py-fsrs tests/fixtures/fsrs-reference.json`.
