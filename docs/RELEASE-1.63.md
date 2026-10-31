# LexiCards 1.63 – wiaderko, kolor kartki, arkusze A3–4A0, wpisywanie w szybkiej fiszce (1.63.1 – notatka z klawiaturą)

Wersja 1.63.0, 31 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Wydanie 1.63”).

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Szybkie fiszki – wpisywanie** | W „Uporządkuj” (obok edytora i w teczce) każde pole tekstowe – pojęcie, definicja, przykład po polsku i po angielsku – ma miejsce do wpisania tekstu: puste pole – od razu („Wpisz albo upuść fragment”), pole z fragmentami – ołówek w rogu („Dopisz…”, fiszka nie rośnie); Enter kończy wpisywanie, pole „Obraz” – bez wpisywania. Z wybranym (dotkniętym) fragmentem dotknięcie pola tekstu przenosi fragment, jak dotąd. Tekst jest w skrócie fiszki, w teczce („tekst wpisany”), w stanie fiszki (Gotowa / Do uzupełnienia) i w formularzu „Dodaj do lekcji…” – za fragmentami pola. Fiszka z samym wpisanym tekstem też jest fiszką. Obok edytora zapisuje się z notatką („Anuluj” cofa), w teczce – od razu po Enter albo wyjściu z pola. |
| **iPhone – pasek nad klawiaturą** | Okno tekstu notatki zajmuje widoczną część ekranu nad klawiaturą (jak inne okna formularzy), więc pasek formatowania przyklejony u góry nie ucieka poza ekran, gdy Safari przesuwa obraz do kursora. Dotyczy widoku „Ciągły” i „Książka”. |
| **Kształty – linia ciągła, bez wypełnienia** | Nowe kształty zaczynają od linii ciągłej bez wypełnienia. Zapamiętane wcześniej na urządzeniu rodzaje linii i wypełnienia (osobno dla kształtów i wspólne sprzed 1.35.1) są raz wyczyszczone; późniejsze wybory pamiętane jak dotąd. Kreskowanie (kąt, odstęp) zostaje. |
| **Arkusz zamiast tablicy** | Menu „Kartki”: „Nowy arkusz…” i „Zamień na arkusz…” z wyborem formatu A3, A2, A1, A0, 2A0, 4A0 (poziomo, √2; A3 – wysokość kartki zeszytu); na arkuszu „Format arkusza: A0…” – zmiana w miejscu (obszar kartki na środku, rysunek w tym samym miejscu ekranu; mniejszy format tylko, gdy rysunek się mieści). Na liście kartek „(arkusz A2)”. Dawne tablice A0 – arkusze A0. |
| **Obszar kartki na arkuszu** | Przerywana ramka jasnoszara (wcześniej niebieska), bez podpisu „Obszar kartki zeszytu”. |
| **Wiaderko** | Grupa „Pisanie”: pióro, zakreślacz, gumka, **wiaderko**. Dotknięcie wnętrza zamkniętego obszaru – także zamkniętego kilkoma kreskami albo odręczną pętlą (szczeliny do ok. 6 px ekranu są domykane) – wypełnia go kolorem pod liniami; mniejsze zamknięte obszary w środku zostają puste. Siedem jasnych tonów i „+”. To samo miejsce drugi raz – nowy kolor zamiast poprzedniego. Obszar otwarty albo wychodzący poza widoczną część ekranu – komunikat. Wypełnienie da się zaznaczyć, przesunąć, obrócić, przebarwić, cofnąć; gumka całych kresek usuwa, gumka fragmentów nie tnie; DXF – bez wypełnień. |
| **Kolor kartki** | „Tło strony” → „Kolor kartki”: biała, kremowa, żółta, zielona, błękitna, różowa, lawendowa, szara i „+” (siatka, suwaki, pipetka – jak kolor pióra). Zapisany z rysunkiem i w obrazie w notatce; nowa kartka dostaje kolor poprzedniej; kartka ze zdjęciem – bez koloru. |

## Własność intelektualna

Własny kod bez bibliotek: wypełnianie obszaru wierszami pikseli, poszerzanie maski, obrys po krawędziach pikseli
i upraszczanie Douglasa–Peuckera to ogólnie znane, opisane w literaturze algorytmy (zapisane od nowa); ikona wiaderka –
własny rysunek konturowy. Nazwy opisowe. Wyszukiwania patentowego nie robiono.

## Testy, które wykonano

- **Testy logiki (Node.js): 554 – wszystkie zaliczone**, w tym nowe: wiaderko (obszar zamknięty z otworem, poszerzenie pod
  linie, dotknięta linia, obszar otwarty, szczelina domykana przy `gap`, obrys piksela i pikseli stykających się narożnikiem),
  wypełnienie w rysunku (zapis i sprawdzanie, trafienie wnętrza, gumka fragmentów, przesunięcie, obrót, odbicie, skala, narzędzie
  w grupie „Pisanie”, kolor wiaderka), formaty arkusza (wymiary, zmiana formatu w miejscu, mniejszy format tylko gdy się mieści,
  zapis), kolor kartki, jednorazowy powrót do linii ciągłej bez wypełnienia, tekst wpisany w szybkiej fiszce (sprawdzanie,
  szkic pojęcia, stan, fiszka z samym tekstem, zapis w bibliotece). Zmienione: testy ustawień narzędzi (znacznik `styleDefaults`),
  stan fiszki (`typed`), grupy kółek (wiaderko).
- **Testy w przeglądarce (Chromium): 271 – wszystkie zaliczone w dwóch pełnych przebiegach** na tym samym kodzie, w tym 5 nowych:
  - rysunek (komputer): odręczny kwadrat z mniejszym w środku – wiaderko wypełnia pod liniami, środek zostaje pusty, otwarte „U”
    – komunikat, drugi kolor zastępuje pierwszy, cofnij/ponów; kolor kartki – ton „kremowa” i własny #E8F4FF z „+”; zapis –
    jedno wypełnienie z dwoma obrysami pod kreskami, kolor kartki w rysunku;
  - arkusz (komputer): „Nowy arkusz…” – sześć formatów, A3, na liście „(arkusz A3)”, zmiana na 4A0 – kreska w tym samym miejscu
    ekranu, pomniejszenie do całego 4A0 (zrzut z jasnoszarą ramką), zmiana na A2;
  - szybkie fiszki (komputer): pole „Obraz” bez wpisywania, fragment do pola dotknięciem, tekst wpisany w pustym polu i ołówkiem
    „Dopisz” w polu z fragmentem, Enter kończy, skrót fiszki, zapis z notatką, w teczce na ekranie Biblioteki – przykład wpisany
    i zapisany od razu, „Dodaj do lekcji…” – pojęcie z fragmentem i wpisanym tekstem;
  - notatka (telefon): widoczna część ekranu ustawiona jak przy klawiaturze iPhone’a (420 px od 160 px) – okno dokładnie w niej,
    pasek formatowania i przycisk szybkiej fiszki widoczne po przewinięciu tekstu na dół. Ten sam test na stylu sprzed poprawki –
    niezaliczony (okno 0–844 px).
  - Zmienione: arkusz A0 (wybór formatu w menu, komunikat „Arkusz A0”), kółka 1.32 (wiaderko w grupie „Pisanie”).
  - Przebieg wstępny (przed ostateczną wersją): 268 z 271 – oczekiwana zmiana listy narzędzi (test poprawiony) i dwa testy szybkich
    fiszek: dotknięcie pustego pola z wybranym fragmentem trafiało w nowe pole tekstu i nie przenosiło fragmentu, a wyższe pola
    odsunęły „Obraz”. Poprawione w aplikacji (dotknięcie pola tekstu z wybranym fragmentem przenosi fragment; w polu
    z fragmentami zamiast pola tekstu mały ołówek „Dopisz”), potem dwa pełne przebiegi – oba 271/271.
- **Lint: bez błędów.**
- Zrzuty (Chromium): wiaderko, kolor kartki, cały arkusz 4A0, wpisywanie w szybkiej fiszce, okno notatki przy symulowanej klawiaturze.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie** – w szczególności poprawka paska nad klawiaturą: w Chromium klawiatury iPhone’a nie ma; test
  ustawia widoczną część ekranu tak, jak podaje ją Safari (wysokość i przesunięcie), i sprawdza okno i pasek. Na prawdziwym
  iPhonie – do sprawdzenia przez Ciebie.
- Wiaderko liczy obszar w widocznej części rysunku (przy dużym arkuszu – pomniejsz, żeby objąć cały obszar); w rozdzielczości
  ekranu, więc bardzo cienkie szczeliny przy dużym pomniejszeniu mogą się zamknąć albo otworzyć inaczej niż przy powiększeniu.
- Wypełnienie jest osobnym elementem pod liniami – przesunięcie samego kształtu nie przesuwa wypełnienia (jak w programach do
  malowania); zaznacz oba.
- Kalka (szablon) i linie tła kartki nie zamykają obszaru wiaderka; zakreślacz – też nie.

## Uzupełnienie w wersji 1.63.1 – notatka na telefonie z klawiaturą

Prośba (ze zrzutami z iPhone’a): pasek „Pokaż na fiszce / Usuń z fiszki” zmniejszał kartkę; zrezygnować z niego, ewentualnie
krótka informacja „Cofnij dodanie”; utrzymywać jak największą kartkę także z klawiaturą i dać możliwość przesunięcia do jej
krawędzi nad klawiaturę.

| Zmiana | Jak działa |
| --- | --- |
| **Bez paska fragmentu** | Nad tekstem nie ma już paska z sygnaturą – kartka nie zmienia wielkości, gdy kursor wchodzi we fragment. Kursor we fragmencie: przycisk szybkiej fiszki jest podświetlony (opis „Usuń fragment ✦N.M z szybkiej fiszki”), przyciski tekstu wyszarzone jak dotąd. |
| **Cofnij dodanie** | Po dodaniu fragmentu przez 5 sekund na dole okna komunikat „Dodano ✦N.M do fiszki.” z **Cofnij** – fragment wraca do zwykłego tekstu i znika z fiszki. |
| **Usunięcie z fiszki** | Dotknięcie podświetlonego przycisku fiszki (kursor albo zaznaczenie we fragmencie) – fragment wraca do zwykłego tekstu; przy fiszce dodanej do lekcji – zdejmuje oznaczenie. |
| **Komunikaty w oknach** | Komunikaty pokazywane przy otwartym oknie (np. notatki) są w tym oknie, przy jego dolnej krawędzi – z klawiaturą nad nią. Wcześniej leżały pod oknem i nie było ich widać. |
| **Kartka z klawiaturą** | Widok „Książka”: kartka ma wielkość jak bez klawiatury (ta sama liczba stron); okno przewija się do jej dolnej krawędzi nad klawiaturę, a przy pisaniu – samo do kursora. Pisanie nie przewija już okna na górę (wcześniej przy każdej literze). Widok „Ciągły” – pole tej samej wysokości, okno przewija się do kursora. |
| **Teczka przy klawiaturze** | Na czas pisania (klawiatura otwarta) teczka w prawym dolnym rogu okna się chowa – nie zasłania tekstu nad klawiaturą. |

### Testy, które wykonano (1.63.1)

- **Testy logiki (Node.js): 554 – wszystkie zaliczone.**
- **Testy w przeglądarce (Chromium): 271 – wszystkie zaliczone w dwóch pełnych przebiegach** na tym samym kodzie, w tym nowy
  (telefon, klawiatura symulowana – visualViewport 420 px, strona 844 px): widok „Ciągły” – okno w widocznej części, pasek
  formatowania u góry po przewinięciu na dół, teczka schowana; widok „Książka” – kartka tej samej wysokości (483 px) i ta sama
  liczba stron co bez klawiatury, przewinięcie do dolnej krawędzi kartki – nad klawiaturą, pisanie przy dolnej krawędzi nie
  przewija okna na górę, kursor nad klawiaturą, komunikat „Dodano… Cofnij” nad klawiaturą. Ten sam test bez poprawki wysokości
  – niezaliczony (kartka 483 → 240 px).
  - Zmienione: szybkie fiszki 1.62 – zamiast paska: przycisk podświetlony z kursorem we fragmencie, „Cofnij” w komunikacie po
    dodaniu (fragment wraca do zwykłego tekstu), usunięcie przyciskiem fiszki; złoto i turkus 1.62.2 – opis przycisku z sygnaturą;
    teczka 1.62 – przycisk z „fiszka dodana do lekcji jako „Zobowiązania””.
  - W trakcie: wspólne odświeżanie paska formatowania gasiło podświetlenie przycisku fiszki, a po usunięciu fragmentu
    podświetlenie zostawało – oba błędy poprawione przed pełnymi przebiegami.
- **Lint: bez błędów.**
- Zrzuty (Chromium, telefon): widok „Książka” i „Ciągły” z symulowaną klawiaturą.

### Czego nie sprawdzono (1.63.1)

- **Safari na iPhonie** – klawiatura symulowana w Chromium: widoczna część ekranu (visualViewport) ustawiona tak, jak podaje
  ją Safari z klawiaturą (wysokość i przesunięcie), strona tej samej wysokości. Zachowanie Safari przy przewijaniu do kursora
  (własne przewijanie przeglądarki) może się różnić – do sprawdzenia na telefonie.
