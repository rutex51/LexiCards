# LexiCards 1.55 – suma i różnica brył

Wersja 1.55.0, 27 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Suma i różnica brył”).

Szósty etap planu „Wspólny układ osi, pełna scena 3D” (po 1.50 – układ arkusza, 1.51 – scena 3D, 1.52 – położenie brył,
1.53 – pomiary 3D, 1.54 – płaszczyzny szkicu i rzuty sceny). Dwie bryły ustawione w scenie łączysz w jedną albo jedną
wycinasz z drugiej, pod dowolnym kątem. Dotąd wycięcie działało tylko prostopadle do ściany (szkic na ścianie, 1.49).

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Połącz z…** (suma) | W scenie 3D, w panelu zaznaczonej bryły (pod „Postaw na ścianie…”). Potem dotknięcie drugiej bryły: druga bryła zostaje dołączona do zaznaczonej i znika jako osobny element. Bryły muszą na siebie nachodzić albo się stykać (np. walec postawiony na prostopadłościanie). |
| **Wytnij…** (różnica) | To samo, ale druga bryła jest wycinana z zaznaczonej – otwór na wylot, kieszeń, wcięcie, wycięcie kuli. W trybie wybierania zaznaczona bryła jest rysowana samymi krawędziami, więc widać i da się dotknąć bryłę schowaną w środku. |
| Pod dowolnym kątem | Liczy się położenie ze sceny: X, Y, Z, obrót wokół Z każdej bryły i bryła ze szkicu na płaszczyźnie pionowej (1.54) z osią pod kątem. Przykład: bryła obrotowa (pręt) narysowana na płaszczyźnie XZ z osią pod kątem 35°, wycięta z prostopadłościanu – **otwór skośny**. |
| Nic się nie przesuwa | Zaznaczona bryła zostaje w tym samym miejscu (gdy suma sięga niżej, jej podstawa Z się obniża, a reszta nie drgnie). Bryły stojące na drugiej bryle – po sumie stoją na wyniku, po różnicy stoją same, w tym samym miejscu. |
| Tryb i Esc | Przycisk w trybie zmienia się na **Anuluj – bez zmian**; Esc też kończy tryb. Podpowiedź na dole mówi, co dotknąć; dotknięcie pustego miejsca – komunikat, tryb zostaje. Po operacji komunikat, np. „Różnica: Prostopadłościan − Walec”. **Cofnij** w scenie (i Ctrl/⌘ + Z) – jeden krok. |
| **Historia modelu** | W oknie bryły (2D) operacje: „2. Różnica – wycięta: Walec”, „3. Suma – dołączona: Kula” – razem z wycięciami i dodaniami na ścianach (1.49), po kolei. **Usuń** – operacja znika (razem z drugą bryłą). |
| **Wyjmij bryłę** | Przy ostatniej sumie albo różnicy: druga bryła wraca jako osobna, w tym samym miejscu w scenie (nie niżej niż arkusz), z nowym identyfikatorem; zaznaczona po wyjęciu. |
| Pomiary i rzuty | Bryła złożona ma tyle osi, ile brył z osią: powierzchnia otworu dostaje oś walca, którym ją wycięto – **Pomiar** (1.53) zmierzy np. kąt osi skośnego otworu z wierzchem. Środek wyciętej albo dołączonej kuli – punkt do pomiaru. **Rzuty** sceny (1.54) rysują osie otworów linią osiową. |
| Kula | Kula też może być bryłą bazową (kula z wycięciem): wtedy rysuje się z siatki (płaskie ściany wycięcia, wymiary i osie – bez). |
| Odbicie i skala | „Odbij” i „Skaluj” w 2D zmieniają bryłę złożoną razem z drugą bryłą (jej miejsce, obrót i wymiary). |
| Zapis | Format rysunku **26**: w operacjach bryły (`features`) także `{ op: 'add' | 'cut', body, at, turn? }` – druga bryła (bez położenia w scenie), jej początek układu i obrót w układzie bryły. Starsza wersja aplikacji takie operacje pominie. |

## Jak to działa (w skrócie)

- Położenie drugiej bryły w układzie pierwszej: przesunięcie między początkami układów w scenie obrócone do układu pierwszej
  bryły i różnica obrotów wokół Z (w układzie bryły – obrót wokół y).
- Siatka bryły złożonej: kolejne operacje (na ścianach i z bryłami) na wielościanach metodą podziału przestrzeni drzewem BSP
  (moduł z 1.49), kula – siatka 48 × 24. Wynik jest zapamiętany, więc rysowanie i przesuwanie nie liczą go od nowa.
- Oś powierzchni zakrzywionej: wśród osi bryły bazowej i brył-narzędzi ta, do której pasują normalne ścian (leżą
  w płaszczyznach przechodzących przez oś).

## Własność intelektualna

Suma i różnica brył (konstrukcyjna geometria brył, CSG) to od dziesięcioleci ogólna funkcja programów CAD; metoda drzewa BSP
jest opisana w literaturze grafiki komputerowej (m.in. Thibault i Naylor, 1987), a kod jest własny – ten sam moduł co
w 1.49. Nazwy w interfejsie opisowe („Połącz z…”, „Wytnij…”, „Wyjmij bryłę”). Szczegóły – audyt IP (G65–G66).

## Testy, które wykonano

- **Testy logiki (Node.js): 525 – wszystkie zaliczone** (6 nowych):
  - zapis: operacja z bryłą – druga bryła bez położenia, identyfikatora i pomiarów, obrót 390° → 30°, operacja bez bryły albo
    bez miejsca – pominięta, zagnieżdżenie najwyżej 4, kula – suma i różnica tak, operacje na ścianach nie; format 26;
  - różnica: walec ⌀ 80 przez prostopadłościan – objętość z otworem na wylot (±0,3%), położenie bez zmian, druga bryła
    znika, jej początek układu 44 wyżej; suma: prostopadłościan uniesiony i walec od arkusza – podstawa Z = 0, początek
    układu prostopadłościanu bez zmian;
  - otwór skośny: bryła obrotowa na XZ pod kątem 35° wycięta z prostopadłościanu – jedna oś, ściany otworu przypisane do
    niej, pomiar kąta osi z wierzchem – 35°; rzut z przodu – linia osiowa ukośna;
  - błędy: ta sama bryła, bryły się nie stykają, nie przenikają (także walec tuż obok), wycięcie całej bryły, bryła stojąca
    na drugiej;
  - „Wyjmij bryłę”: druga bryła w tym samym miejscu (±0,01), nowy identyfikator, bryła bez operacji; kula postawiona na
    drugiej bryle – po sumie stoi na wyniku, po różnicy sama, w tym samym miejscu;
  - odbicie (obrót −30°, miejsce odbite, ta sama objętość) i skalowanie ×2 (wymiary i miejsce drugiej bryły, objętość ×8);
    kula z wyciętym prostopadłościanem – siatka, płaskie ściany, środek kuli do pomiaru; zapis i odczyt – ta sama bryła.
  - Testy wcześniejszych wersji – format 26 zamiast 25.
- **Testy w przeglądarce (Chromium): 245 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe):
  - komputer: walec ⌀1,5 cm (okno bryły), kula, prostopadłościan; położenia z panelu sceny; **Wytnij…** – tryb (podpowiedź,
    „Anuluj – bez zmian”, bez strzałek), Esc – koniec trybu bez zmian; dotknięcie walca – dwie bryły, komunikat
    „Różnica: Prostopadłościan − Walec”, prostopadłościan dalej zaznaczony; **Cofnij** – trzy bryły, jeszcze raz wycięcie;
    **Połącz z…** – dotknięcie pustego miejsca: komunikat, tryb zostaje; dotknięcie kuli – jedna bryła, „Suma: Prostopadłościan
    + Kula”; widok z przodu; 2D: okno bryły – „2. Różnica – wycięta: Walec”, „3. Suma – dołączona: Kula”, „Wyjmij bryłę”
    tylko przy ostatniej; **Wyjmij bryłę** – „Bryła: Kula”, komunikat; zapis – format 26, prostopadłościan z różnicą (walec
    1,5 cm od środka), kula osobno;
  - iPad (dotyk): walec postawiony na wierzchu prostopadłościanu (Z = 3 cm); „Wytnij…” i „Anuluj – bez zmian”; **Połącz z…**
    i dotknięcie walca – jedna bryła, Z = 0;
  - telefon (390 px): „Połącz z…”, „Wytnij…”, „Postaw na ścianie…”, „Na arkusz” na ekranie, podpowiedź trybu, bez przewijania
    w bok.
  - Pierwszy pełny przebieg wykrył test 1.54 sprawdzający zapis dokładnie w formacie 25 – po poprawce sprawdza format 25 albo
    nowszy (jak testy 1.52 i 1.53); dwa kolejne pełne przebiegi – bez błędów.
- **Lint: bez błędów.**
- Zrzuty (Chromium): przed, tryb „Wytnij…”, różnica, suma (izometria i przód), historia modelu, po „Wyjmij bryłę”, iPad,
  telefon.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec – dotyk udawany zdarzeniami Chromium. **Szybkość na iPadzie** nie była
  mierzona: w Node na komputerze wycięcie walca z prostopadłościanu trwa ok. 40 ms, różnica kuli i prostopadłościanu
  ok. 0,15 s, suma dwóch kul ok. 0,6 s (na iPadzie może być kilka razy wolniej; w tym czasie ekran stoi).
- Bryły nie da się pochylić w scenie (jest tylko obrót wokół Z) – pochyloną bryłę robisz ze szkicu na płaszczyźnie pionowej
  (1.54), jak w przykładzie z otworem skośnym.
- **Usuń** w historii modelu kasuje operację razem z drugą bryłą; żeby ją zachować – **Wyjmij bryłę** (tylko ostatnia
  operacja).
- Wymiary i osie na obrazku 2D – z bryły bazowej (bez otworów); kula z wycięciem – bez wymiarów i osi na obrazku.
- Szkic na ścianie (1.49) na kuli z wycięciem – nie.
- Druga bryła nie ma swoich wymiarów w oknie bryły złożonej – zmienisz je po „Wyjmij bryłę” (potem operacja jeszcze raz).
- Ciemny motyw.
