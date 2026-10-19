# LexiCards 1.5

Aplikacja do nauki terminologii polsko-angielskiej. Działa w przeglądarce na komputerze
z Windows i na iPhonie, także bez internetu. Jest darmowa i nie wymaga konta: materiały
są zapisywane wyłącznie w przeglądarce na Twoim urządzeniu.

Adres (gdy strona jest opublikowana): **https://rutex51.github.io/LexiCards/**. Repozytorium jest
prywatne, więc strona jest publikowana tylko na czas instalacji albo aktualizacji – zobacz
[Aktualizacje](#aktualizacje). Zainstalowana aplikacja działa bez niej.

Sprawdzenie całości i zgodność ze specyfikacją: [docs/RELEASE-1.0.md](docs/RELEASE-1.0.md).
Notatki do lekcji (wersja 1.1): [docs/RELEASE-1.1.md](docs/RELEASE-1.1.md).
Postęp na listach i lekcje utrwalone (wersja 1.2): [docs/RELEASE-1.2.md](docs/RELEASE-1.2.md).
Stos fiszek, notatki w stronach, utrwalone na końcu list (wersja 1.3): [docs/RELEASE-1.3.md](docs/RELEASE-1.3.md).
Kartki notatek zaginane od rogu, dwie strony obok siebie na komputerze (wersja 1.4): [docs/RELEASE-1.4.md](docs/RELEASE-1.4.md).
Obrazy notatki przed tekstem albo po nim (wersja 1.5): [docs/RELEASE-1.5.md](docs/RELEASE-1.5.md).

## Co potrafi wersja 1.5

- Biblioteka w układzie dziedzina → moduł → lekcja → pojęcie: dodawanie, edycja,
  przenoszenie, kopiowanie, zmiana kolejności i usuwanie z ostrzeżeniem, ile elementów zniknie.
  Na listach modułów i lekcji pionowy pasek po lewej i opis „opanowane N%” pokazują, jaka część
  pojęć ma status „Opanowane”.
- Lekcje i moduły „utrwalone”: ręczne oznaczenie w menu „…” (moduł – razem ze wszystkimi lekcjami;
  moduł jest utrwalony, gdy wszystkie jego lekcje są). Wiersz ma zieloną poświatę, a fiszki wracają
  rzadko – najwcześniej po okresie z Ustawień (domyślnie miesiąc). Nowe pojęcie w lekcji albo nowa
  lekcja w module zdejmuje oznaczenie samo; dodane pojęcie zaczyna jako nowe. Utrwalone są na
  końcu listy.
- Pojęcie ma nazwę po polsku i po angielsku oraz opcjonalnie opis i przykład w obu językach,
  tagi, trudność, notatki i oznaczenie „ulubione”.
- Glosariusz wszystkich pojęć: wyszukiwanie bez polskich znaków („plynnosc” znajduje
  „płynność”), filtry (dziedzina, moduł, lekcja, status nauki, ulubione, tag), sortowanie, zaznaczanie
  wielu pojęć. Przy każdym pojęciu – także w lekcji – status ostatniej oceny (Nowe, Do nauki,
  W trakcie nauki, Częściowo opanowane, Opanowane); pojęcia do powtórki pokazuje filtr.
- Notatka do każdej lekcji: tekst z formatowaniem (pogrubienie, kursywa, podkreślenie, nagłówki,
  listy, pięć kolorów) i obrazy, w osobnym oknie z podglądem i edycją. Otwierasz ją z listy lekcji
  w module, z ekranu lekcji, ze szczegółów pojęcia i w trakcie nauki fiszek. Długa notatka dzieli się
  na strony mieszczące się w oknie (bez przewijania) – przewracasz je palcem jak kartki książki
  (kartka zagina się od rogu, za który ją chwycisz), przyciskami ‹ › albo strzałkami; na komputerze
  dwie strony leżą obok siebie jak w otwartej książce; „Nowa strona” w edytorze zaczyna stronę tam, gdzie chcesz. Wklejony tekst z Worda,
  stron WWW czy Notatek zachowuje formatowanie, wklejony obraz trafia do obrazów notatki, a
  „Kopiuj notatkę” przenosi ją z formatowaniem i obrazami do innej aplikacji.
- Import pojęć z pliku XLSX lub CSV w kreatorze: wybór arkusza, przypisanie kolumn, miejsce w bibliotece,
  sprawdzenie danych, podgląd i zatwierdzenie. Duplikaty można pominąć, zaktualizować albo dodać.
  Notatki do lekcji przychodzą z osobnego arkusza tego samego pliku – razem z pojęciami albo osobno.
- Eksport do XLSX lub CSV: cała biblioteka, dziedzina, moduł, lekcja albo zaznaczone pojęcia;
  XLSX ma też arkusz z notatkami (formatowanie i obrazy).
- Nauka z fiszkami: wybór materiału, kierunku (PL → EN, EN → PL, mieszany), zakresu i liczby fiszek;
  obracana fiszka na stosie następnych, trzy kafelki oceny (pojęcie, definicja, przykład), zatwierdzanie gestem albo
  przyciskiem, cofanie, podsumowanie i runda powtórkowa. Postępy są osobne dla każdego kierunku.
  Zakresy „Nie znam pojęcia”, „Nie znam definicji” i „Nie znam przykładu” zbierają fiszki
  z konkretnym brakiem z ostatniej oceny.
- Powtórki w odstępach według algorytmu FSRS-6, osobno dla PL → EN i EN → PL: „Powtórka na dziś”
  na Starcie, zakres „Do powtórki” z fiszkami po terminie, podpowiedź przy przyciskach, za ile fiszka
  wróci, termin i poziom utrwalenia w szczegółach pojęcia, docelowa skuteczność i okres powtórek
  lekcji utrwalonych w Ustawieniach.
- Quizy: jednokrotny wybór (do czterech odpowiedzi), łączenie par i test mieszany; wybór materiału,
  kierunku, liczby pytań, limitu czasu i progu zaliczenia. Wynik z listą błędów, „Powtórz błędne
  odpowiedzi”, historia wyników. Quizy nie zmieniają terminów powtórek fiszek.
- Słuchanie, np. w samochodzie: aplikacja czyta pojęcie, daje chwilę na zastanowienie, czyta odpowiedź,
  definicję i przykład; ekran nie gaśnie, a duże przyciski pozwalają zatrzymać, cofnąć albo pominąć pojęcie.
- Statystyki: opanowane pojęcia, do powtórki, skuteczność quizów, czas nauki, znajomość pojęć,
  definicji i przykładów (osobno dla każdego kierunku), wykresy postępu, powtórek i quizów w czasie,
  opanowanie według dziedzin, modułów i lekcji z przejściem w głąb. Na Starcie: pojęcia nowe,
  w trakcie nauki, do powtórki i opanowane, skuteczność quizów i czas nauki.
- Wymowa pojęć, definicji i przykładów głosem z urządzenia, z głosem zastępczym, gdy wybrany się
  nie odzywa, i sprawdzeniem wymowy w Ustawieniach; historia ocen każdego pojęcia.
- Kopia zapasowa do pliku i przywracanie z pliku (materiały, notatki z obrazami, postępy, ustawienia).
- Motyw jasny, ciemny albo zgodny z systemem i kolor aplikacji do wyboru (niebieski, antracytowy,
  pomarańczowy, zielony, czerwony); układ na telefon i na szeroki ekran. Ikony dziedzin mają
  szare tło, a inny kolor można wybrać w edycji dziedziny.
- Praca bez internetu po pierwszym otwarciu.
- 40 przykładowych pojęć (Business English, Metrology) do wczytania jednym przyciskiem.

Raporty z etapów, razem z wynikami testów: [etap 1](docs/STAGE-1.md), [etap 2](docs/STAGE-2.md),
[etap 3](docs/STAGE-3.md), [etap 4](docs/STAGE-4.md), [etap 5](docs/STAGE-5.md), [etap 6](docs/STAGE-6.md),
[wersja 1.0](docs/RELEASE-1.0.md), [wersja 1.1 – notatki](docs/RELEASE-1.1.md),
[wersja 1.2 – postęp i utrwalenie](docs/RELEASE-1.2.md), [wersja 1.3 – stos fiszek i strony notatek](docs/RELEASE-1.3.md),
[wersja 1.4 – kartki zaginane od rogu, dwie strony](docs/RELEASE-1.4.md),
[wersja 1.5 – obrazy notatki przed tekstem albo po nim](docs/RELEASE-1.5.md).

## Jak korzystać

### iPhone

1. Otwórz adres aplikacji w **Safari**.
2. Dotknij przycisku Udostępnij, a potem **Do ekranu początkowego**.
3. Uruchamiaj LexiCards z ikony na ekranie początkowym.

Zrób to, zanim zaczniesz wprowadzać dane: aplikacja z ekranu początkowego ma osobną pamięć
niż karta Safari. Dane wprowadzone wcześniej w Safari przeniesiesz kopią zapasową.

### Windows

Otwórz adres w Chrome albo Edge. Ikona instalacji w pasku adresu pozwala otwierać
aplikację w osobnym oknie, ale nie jest to konieczne.

### Aktualizacje

Na darmowym koncie GitHub strona jest publikowana tylko z repozytorium publicznego. Zainstalowana
aplikacja działa bez niej, ale nowa wersja dotrze do urządzenia tylko wtedy, gdy strona jest dostępna:

1. GitHub → **Settings → General → Change visibility → Public**.
2. **Settings → Pages**: źródło – gałąź `main`, katalog `/ (root)`; po chwili strona jest dostępna.
3. Otwórz aplikację na urządzeniu z internetem. Gdy pojawi się „Pobrano nową wersję aplikacji”,
   dotknij **Uruchom ją**. Numer wersji jest na dole Ustawień.
4. Przywróć repozytorium do **Private**.

Strona nie trafia do wyszukiwarek (znacznik `noindex`), a Twoje materiały nigdy nie opuszczają urządzenia.

### Glosariusz i statusy

Przy każdym pojęciu widać jeden status – wynik ostatniej oceny: Nowe, Do nauki, W trakcie nauki,
Częściowo opanowane albo Opanowane. Status dotyczy kierunku wybranego w Statystykach (jak liczby
na Starcie); w filtrach glosariusza możesz wybrać inny kierunek albo oba – wtedy liczy się słabszy
z dwóch. Filtr „Status” pokazuje tylko pojęcia w danym stanie, a „Do powtórki” – pojęcia, których
termin powtórki już minął (także opanowane: powtórka podtrzymuje pamięć). Termin każdego pojęcia
jest w jego szczegółach.

### Import z arkusza

W Bibliotece wybierz **+ → Import z pliku** (albo „Importuj z pliku” w menu lekcji). Plik powinien mieć
w pierwszym wierszu nagłówki, po polsku albo po angielsku:

| Kolumna | Znaczenie |
| --- | --- |
| `Term PL`, `Term EN` | pojęcie po polsku i po angielsku – wymagane |
| `Description PL`, `Description EN` | opis |
| `Example PL`, `Example EN` | przykład użycia |
| `Domain`, `Module`, `Lesson` | miejsce w bibliotece; brakujące elementy zostaną utworzone |
| `Tags`, `Difficulty`, `Notes` | tagi (po przecinku), trudność 1–5, notatki |

Rozpoznawane są też nagłówki takie jak „Polski”, „Angielski”, „Opis PL”, „Przykład po angielsku”, „Lekcja”.
Wzór pliku można pobrać w pierwszym kroku kreatora; przykłady są w katalogu [docs/samples](docs/samples).
Pliki CSV z polskiego Excela (Windows-1250, średniki) są odczytywane poprawnie. Stary format `.xls`
trzeba najpierw zapisać w Excelu jako `.xlsx`.

**Notatki do lekcji** są w osobnym arkuszu tego samego skoroszytu (we wzorze: „Notatki”):

| Kolumna | Znaczenie |
| --- | --- |
| `Domain`, `Module`, `Lesson` | lekcja notatki; brakujące elementy zostaną utworzone |
| `Note` | treść – formatowanie z Excela (pogrubienie, kursywa, podkreślenie, przekreślenie, kolor) zostaje; wiersz `---` to nowa strona |
| `Image` | obrazy wklejone do komórki („Umieść w komórce”) albo na arkusz przy tej komórce |

W treści: wiersz zaczynający się od „• ” albo „- ” to punkt listy, od „1. ” – lista numerowana, od „# ” –
nagłówek, a pusty wiersz rozdziela akapity (nowy wiersz w komórce: Alt+Enter). Kilka wierszy z tą
samą lekcją składa się na jedną notatkę – np. jeden obraz w wierszu. Gdy plik ma i pojęcia, i notatki,
kreator pyta, co zaimportować; w kroku „Sprawdź notatki” widać podgląd każdej notatki z obrazami
i można zdecydować, co zrobić z lekcjami, które mają już notatkę (zastąpić, dopisać, zostawić).
Obrazy w formatach EMF i WMF (Windows) są pomijane z ostrzeżeniem – zapisz je jako PNG albo JPEG.

### Notatki do lekcji

Notatkę otworzysz w module (ikona notatki przy lekcji albo „Dodaj notatkę” w menu „…”), na ekranie
lekcji (wiersz „Notatka” nad listą pojęć), w szczegółach pojęcia („Notatka lekcji”) i w trakcie nauki
fiszek (ikona u góry). Okno pokazuje tekst i obrazy; dotknięcie obrazu powiększa go (dwa palce albo
dwukrotne dotknięcie). **Edytuj** pokazuje u góry sekcję obrazów – **Dodaj obraz** (zdjęcie, plik,
aparat), dotknięcie obrazu – powiększ, przesuń, usuń – a pod nią tekst z paskiem formatowania. Przy
obrazach wybierasz, gdzie są w podglądzie: **Przed tekstem** albo **Po tekście** (domyślnie po
tekście; wybór jest zapisany w notatce). Duże zdjęcia są zmniejszane do 2048 px dłuższego boku. Wklejony tekst zachowuje formatowanie (bez skryptów, stylów i obrazów z sieci).

Długa notatka dzieli się na strony o wysokości okna: przewracasz je, przeciągając stronę palcem
w lewo lub w prawo, przyciskami ‹ › pod stroną albo klawiszami ←/→ (Home i End – pierwsza
i ostatnia). Kartka zagina się od miejsca, za które ją chwycisz: za dolny róg – zagina się dół,
za górny – góra, za środek krawędzi – prosto, pionowo; wstecz tak samo od lewej krawędzi.
Na zagiętej części prześwituje lustrzany, wyblakły tekst strony, a cienie przy zgięciu i na stronie
pod spodem rosną, gdy kartka się unosi. Przyciski i klawisze przewracają kartkę od dolnego rogu.
Na komputerze (okno co najmniej 960 × 520 px) dwie strony leżą obok siebie jak w otwartej książce:
prawa strona przewraca się przez grzbiet, a na jej odwrocie jest następna strona. Myszą kartkę
chwytasz za narożnik (kursor zmienia się w dłoń) albo klikasz narożnik; przeciąganie w tekście
zaznacza tekst. Kółko myszy przewraca strony: w dół – następna, w górę – poprzednia (jeden ruch
kółka – jedna kartka). W trakcie przewracania kartka może na chwilę zakryć tytuł lekcji i przyciski,
ale nie wychodzi poza okno notatki. Przycisk z otwartą książką obok numeru strony przełącza jedną i dwie strony
(wybór jest zapamiętany). Przy ograniczonym ruchu w systemie strony zmieniają się bez animacji.
Obrazy są po tekście albo przed nim – jak wybierzesz w edytorze. Przycisk **Nowa strona** w pasku
formatowania (dwie połówki kartki) zaczyna nową stronę w miejscu kursora; w komórce arkusza
importu nową stronę oznacza wiersz `---`.

### Postęp i lekcje utrwalone

Pasek po lewej stronie wiersza lekcji i modułu wypełnia się w miarę, jak pojęcia dostają status
„Opanowane” z fiszek (w kierunku wybranym w Statystykach); obok nazwy jest „opanowane N%”. Status
„Opanowane” działa jak dotąd – fiszki wracają według FSRS.

Gdy uznasz, że lekcję masz w głowie na dłużej, wybierz w jej menu „…” **Oznacz jako utrwaloną**
(w module: **Oznacz jako utrwalony** – oznacza wszystkie jego lekcje). Lekcja dostaje pełny pasek,
opis „utrwalona” i zieloną poświatę, a jej fiszki wracają najwcześniej po okresie z **Ustawienia →
Powtórki → Lekcje utrwalone** (co miesiąc, co 2 lub 3 miesiące, co pół roku, raz w roku), liczonym
od ostatniej powtórki albo od oznaczenia. Fiszka, której przy takiej powtórce nie pamiętasz, wraca
według zwykłego FSRS. Nowe pojęcie w lekcji (dodane, przeniesione, skopiowane albo z importu)
zdejmuje oznaczenie lekcji, a nowa lekcja – oznaczenie modułu; aplikacja mówi o tym komunikatem,
a kreator importu uprzedza przed importem. Oznaczenie cofniesz w menu „…” albo przyciskiem
**Cofnij** na ekranie lekcji.

### Nauka z fiszkami

1. W zakładce **Nauka** wybierz materiał i dotknij **Rozpocznij** – na telefonie to okrągły przycisk
   z symbolem odtwarzania w środku paska zakładek, na komputerze „Rozpocznij naukę” na dole ekranu
   (albo „Ucz się tej lekcji” na ekranie lekcji).
2. Przypomnij sobie odpowiedź i dotknij fiszki, żeby ją odwrócić.
3. Zaznacz kafelki tego, co umiesz: pojęcie, definicję, przykład.
4. Przesuń fiszkę **w lewo – Umiem** albo **w prawo – Powtórz** (są też przyciski).

Zakresy „Nie znam pojęcia”, „Nie znam definicji” i „Nie znam przykładu” zbierają fiszki, przy których
w ostatniej ocenie w danym kierunku ten kafelek został niezaznaczony – sesja tylko z jednym rodzajem braków.

Strzałka w pasku u góry cofa ostatnią decyzję. Przerwaną sesję można wznowić ze Startu.
Po sesji można jednym dotknięciem powtórzyć fiszki odłożone (wszystkie z „Powtórz”), częściowo
zapamiętane („Powtórz” z częścią kafelków), nieznane („Powtórz” bez kafelków) albo całą sesję – na podsumowaniu, a po jego zamknięciu
w zakładce Nauka (grupa „Ostatnia sesja”); całą sesję także ze Startu. Zakres „Częściowo zapamiętane”
działa też dla dowolnego materiału. Formularz sesji pamięta ostatnio wybrany materiał.
Na komputerze działa klawiatura: spacja odwraca, 1 2 3 przełączają kafelki, ← i → zatwierdzają, Z cofa.

### Powtórki

Każda zatwierdzona fiszka dostaje termin następnej powtórki (algorytm FSRS), osobno dla każdego
kierunku. Gdy termin minie, na Starcie pojawia się **Powtórka na dziś** – zaległe fiszki z całej
biblioteki, od najdłużej czekających. Pod przyciskami „Umiem” i „Powtórz” widać, za ile fiszka wróci.

**Przesunięcie w lewo – Umiem** oznacza, że pamiętasz wszystko: kafelki zaznaczają się same
(ocena Good). **Przesunięcie w prawo – Powtórz** bierze kafelki tak, jak je zaznaczyłeś:

| Zaznaczone kafelki przy „Powtórz” | Grupa po sesji | Ocena dla algorytmu |
| --- | --- | --- |
| żaden | nieznane | Again – wraca po chwili |
| część, w tym pojęcie | częściowo zapamiętane | Hard – krótszy odstęp |
| część bez pojęcia (tłumaczenia) | częściowo zapamiętane | Again |
| wszystkie | odłożone | Hard |

### Quizy

1. W zakładce **Quiz** wybierz materiał, rodzaj quizu, kierunek i liczbę pytań (albo „Quiz z tej
   lekcji” na ekranie lekcji, „Quiz” w menu dziedziny lub modułu). W „Ustawieniach” quizu są limit
   czasu, próg zaliczenia i – w teście mieszanym – proporcje pytań wyboru i par.
2. **Jednokrotny wybór:** dotknij jednej z odpowiedzi. Od razu widać, czy była poprawna, oraz
   definicję i przykład. Przed odpowiedzią można odsłonić definicję i przykład w języku pytania.
3. **Pary:** dotknij pojęcia, a potem jego tłumaczenia (albo odwrotnie). Para połączona z pomyłką
   liczy się jako błędna odpowiedź.
4. Po ostatnim pytaniu: wynik w procentach, zaliczony lub nie, lista błędów i **Powtórz błędne
   odpowiedzi** – nowy quiz tylko z tych pojęć.

Niedokończony quiz można wznowić ze Startu albo z zakładki Quiz. Quizy nie zmieniają terminów
powtórek fiszek; pojęcia, na które ostatnio odpowiedziałeś źle, znajdziesz w Nauce w zakresie
**Błędy z quizów**. Na komputerze działa klawiatura: 1–4 lub A–D wybiera odpowiedź, Enter – dalej.

### Słuchanie (np. w samochodzie)

W zakładce **Nauka** wybierz **Słuchaj, np. w samochodzie**, ustaw materiał, kierunek (domyślnie mieszany),
zakres, liczbę pojęć i czas na zastanowienie (3–12 s), a potem **Rozpocznij słuchanie** – jeszcze przed
jazdą. Aplikacja czyta pojęcie, czeka, czyta odpowiedź, a potem definicję i przykład (po angielsku albo
po polsku). Duży przycisk w środku zatrzymuje i wznawia, boczne przechodzą do poprzedniego i następnego
pojęcia. Słuchanie nie zmienia terminów powtórek.

Na iPhonie strona mówi tylko wtedy, gdy jest na ekranie; aplikacja nie pozwala ekranowi zgasnąć. Czy
czytanie trwa przy zablokowanym ekranie, aplikacja sprawdza sama: zablokuj telefon na około 30 sekund
w trakcie słuchania, a po odblokowaniu zobaczysz wynik (zapamiętany w ustawieniach słuchania).

**Podtrzymuj dźwięk (Bluetooth, CarPlay)** – domyślnie włączone. Przez całe słuchanie gra cichy dźwięk
w tle, więc połączenie z samochodem albo słuchawkami nie usypia w przerwach i krótkie słowa nie są
ucinane. Przyciski na kierownicy, w słuchawkach i na ekranie blokady zatrzymują, wznawiają i przełączają
pojęcia, a wyświetlacz samochodu pokazuje bieżące pojęcie. Pod odtwarzaczem jest **Dziennik dźwięku**:
gdy coś nie gra, skopiuj go i wklej w rozmowie – widać w nim, które wypowiedzi ruszyły i się skończyły.

Głos i szybkość czytania ustawisz w **Ustawieniach → Wymowa**. Przycisk **Sprawdź wymowę** czyta zdanie
po polsku, po angielsku i znowu po polsku i pokazuje, który głos działa. Gdy wybrany głos się nie
odzywa (zdarza się w Safari na iPhonie), aplikacja po kilku sekundach czyta tekst głosem zastępczym
i informuje o tym – wtedy wybierz inny głos.

### Statystyki

Zakładka **Statystyki** pokazuje całą bibliotekę; wiersz w zestawieniu „Opanowanie według…” (albo
„Statystyki” w menu dziedziny, modułu lub lekcji w Bibliotece) otwiera te same statystyki dla jednego
elementu. U góry wybierasz kierunek: PL → EN, EN → PL albo oba – wtedy pojęcie jest opanowane dopiero
w obu kierunkach. Znajomość pojęć, definicji i przykładów jest zawsze podana osobno dla każdego kierunku.
Wykresy obejmują 7, 30 albo 90 dni; dotknij wykresu (albo użyj strzałek), żeby zobaczyć wartości dnia,
a „Dane w tabeli” pokazuje te same liczby bez wykresu. Czas nauki to czas nad fiszkami i odpowiedziami
w quizach – od wersji 0.6.0 mierzony, dla starszych ocen szacowany.

### Gdzie są dane

- Dane zostają w przeglądarce na danym urządzeniu. Nic nie jest wysyłane do internetu.
- Telefon i komputer mają osobne biblioteki. Żeby przenieść materiały, w Ustawieniach
  wybierz **Zapisz kopię do pliku** na jednym urządzeniu i **Przywróć z pliku** na drugim
  (przywrócenie zastępuje dane na urządzeniu docelowym). Same materiały, bez postępów, przeniesiesz też
  eksportem i importem – wtedy dane na urządzeniu docelowym zostają, a pojęcia są dopisywane.
- Przeglądarka może usunąć dane witryny, której długo nie otwierasz, albo gdy brakuje miejsca.
  Wyczyszczenie danych przeglądarki także je usuwa. Dlatego regularnie zapisuj kopię zapasową.

## Dla programisty

Aplikacja to zwykłe pliki statyczne: HTML, CSS i moduły JavaScript, bez bibliotek zewnętrznych
i bez etapu kompilacji. Wymagany jest tylko Node.js 22 lub nowszy (do testów i narzędzi).

```
npm test             # testy logiki (bez przeglądarki)
npm run test:e2e     # testy w przeglądarce Chromium (wymaga biblioteki Playwright)
npm run serve        # aplikacja pod adresem http://localhost:8080/
npm run build        # odświeża sw.js i js/version.js – uruchom po każdej zmianie plików
```

`npm run build` trzeba wykonać przed wysłaniem zmian: zapisuje w `sw.js` listę plików do pracy
offline i identyfikator wydania wyliczony z ich treści. Test `tests/unit/build.test.js`
nie przejdzie, jeśli te pliki są nieaktualne.

### Układ katalogów

```
index.html, manifest.webmanifest, sw.js   strona, opis aplikacji, praca offline
css/app.css                               wygląd
js/core/                                  dane, reguły, odczyt i zapis plików (bez zależności od przeglądarki)
js/ui/                                    ekrany i okna
icons/                                    ikony aplikacji
tests/unit/, tests/e2e/, tests/fixtures/  testy i pliki testowe
tools/                                    budowanie, serwer lokalny, generatory
docs/                                     architektura, raporty etapów, pliki przykładowe
```

Opis budowy: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Publikacja

Strona jest serwowana przez GitHub Pages z gałęzi `main` (katalog główny), gdy repozytorium jest
publiczne (zobacz [Aktualizacje](#aktualizacje)). Po wysłaniu zmian nowa wersja pojawia się po kilku
minutach. Otwarta aplikacja pobiera ją w tle i pokazuje komunikat z przyciskiem „Uruchom ją”.

## Plan etapów

1. **Biblioteka, glosariusz, kopia zapasowa** – gotowe.
2. **Import i eksport plików CSV oraz XLSX** – gotowe.
3. **Fiszki: obracana karta, ocena pojęcia, definicji i przykładu, gesty, cofanie** – gotowe.
4. **Powtórki w odstępach (FSRS), osobno dla kierunków PL→EN i EN→PL** – gotowe.
5. **Quizy: jednokrotny wybór, dopasowywanie, mieszany** – gotowe.
6. **Statystyki: wskaźniki, wykresy, zestawienia według dziedzin, modułów i lekcji** – gotowe.
7. **Wersja 1.0: sprawdzenie całości ze specyfikacją, uzupełnienia, przegląd ekranów** – gotowe.
8. **Wersja 1.1: notatki do lekcji – tekst z formatowaniem i obrazy, import, eksport, kopia** – gotowe.
9. **Wersja 1.2: postęp na listach, lekcje i moduły utrwalone, szare ikony dziedzin** – gotowe.
10. **Wersja 1.3: stos fiszek, notatki w stronach, utrwalone na końcu list** – gotowe.
11. **Wersja 1.4: kartki notatek zaginane od rogu, dwie strony obok siebie na komputerze** – gotowe.
12. **Wersja 1.5: obrazy notatki na górze edytora, w podglądzie przed tekstem albo po nim** – gotowe.

Synchronizacja przez iCloud ze specyfikacji jest zastąpiona kopią zapasową w pliku (aplikacja
w przeglądarce nie ma dostępu do iCloud, a zewnętrzny serwer jest wykluczony).
