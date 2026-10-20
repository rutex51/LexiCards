# LexiCards 1.24 – figury z odręcznych kształtów, łamana, przewracanie kartek od rogu

Wersja 1.24.0, 20 października 2026. Rysunki, etap 2 (punkt 31 planu): zamiana odręcznych kształtów
na figury i punkty w wierzchołkach łamanej. Dociągania do linii kratek nie ma – zgodnie z decyzją
(to samo daje liniuszek). Do tego dwie poprawki zgłoszone w trakcie: przesuwanie elementów przy
włączonym liniuszku na iPhonie i przewracanie kartek rysunku. Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (sekcja rysunków – „Od 1.24”).

## Co doszło i co poprawiono

| Prośba | Jak jest zrobione |
| --- | --- |
| Rozpoznawanie kształtów: kształt rysowany odręcznie, przytrzymanie rysika ok. ½ s na końcu – figura; „Cofnij” przywraca wersję odręczną | Pióro: narysuj kształt i na końcu, nie odrywając pióra, **przytrzymaj ok. ½ s** – kreska od razu zamienia się w figurę (zapis po oderwaniu). Bez przytrzymania kreska zostaje odręczna. **Cofnij** – kreska odręczna, drugie „Cofnij” – nic. Działa rysikiem, palcem (iPhone) i myszą; zakreślacz i kreski prowadzone linijką albo liniuszkiem – bez zmian. Wyłącznik **Figury z odręcznych kształtów** w ustawieniach pióra (drugie dotknięcie pióra) – domyślnie włączony. |
| Rozpoznawane kształty: prosta i odcinek z dociąganiem do poziomu, pionu i 45°, strzałka, łamana, trójkąt, prostokąt i kwadrat (kąty dociągane do 90°), romb, okrąg i elipsa | **Odcinek** – prawie poziomy i pionowy dokładnie (do 7°), prawie pod 45° – do 5° (np. 53° zostaje). **Strzałka** – trzon i grot „V” (ramię, powrót do ostrza, drugie ramię) albo grot-trójkąt, także grot narysowany najpierw; ostrze zostaje tam, gdzie wskazałeś. **Łamana**. **Trójkąt** – podstawa prawie pozioma dokładnie pozioma, prawie równoramienny, prostokątny i równoboczny – dokładnie. **Prostokąt i kwadrat** (kąty prawie proste – proste; kwadrat stojący na rogu – romb). **Romb**, a dodatkowo **równoległobok** i **trapez**. **Okrąg i elipsa** (osie poziomo i pionowo albo pod kątem, gdy tak narysowane). **Wielokąt** – np. litera L czy pięciokąt (boki prawie poziome i pionowe – dokładnie). Figura ma kolor i grubość kreski; końce odcinka i strzałki przy krawędzi innego elementu przyklejają się jak przy narzędziu Kształty. Łuki, fale, pismo i niepewne kształty zostają odręczne. |
| Uchwyty (punkty konstrukcyjne) – nowe tylko dla łamanej: punkt w każdym wierzchołku | Rozpoznana figura to zwykły kształt – ma punkty konstrukcyjne jak od 1.15. **Łamana i wielokąt** zaznaczone mają **niebieski punkt w każdym wierzchołku**: przeciągnięcie przesuwa wierzchołek (bok do sąsiedniego prawie poziomy, pionowy albo pod 45° – dokładnie; z Shift co 15°), narożniki ramki zmieniają wielkość całej figury, kółko – obrót, pola – szerokość i wysokość. |
| „Sprawdź, jak działa przesuwanie elementów, gdy aktywny jest liniuszek – na iPhonie razem z elementem przesuwa się liniuszek” | Przyczyna: nowy element (pole tekstowe, wzór, tabela, karteczka) jest wstawiany na środku widoku – tam, gdzie stoi kółko liniuszka – a kółko miało pierwszeństwo przed zaznaczeniem. Na telefonie (strona pomniejszona) pole trafienia kółka obejmowało cały mały element, więc przeciągnięcie przesuwało liniuszek, a nie element. Teraz **zaznaczenie ma pierwszeństwo**: przeciągnięcie zaznaczonego elementu leżącego na kółku przesuwa element, a liniuszek zostaje; dotknięcie kółka przy zaznaczaniu zaznacza to, co pod nim; kółko poza zaznaczeniem przesuwa liniuszek jak dotąd. Odtworzone w Chromium z ekranem telefonu przed poprawką (liniuszek się przesuwał, pole zostawało) i sprawdzone po niej. |
| Przewracanie kartek rysunku – wolniej, z animacją jak w notatkach (chwyt za prawy dolny róg), bez dziwnych artefaktów | Kartka zagina się od **prawego dolnego rogu** i przewraca w lewo – ta sama geometria zgięcia co w notatkach (grzbiet z lewej, na odwrocie lekko prześwituje rysunek w lustrze, cienie przy zgięciu i na kartce pod spodem); poprzednia kartka wraca tą samą drogą nad bieżącą. Czas: **0,9 s** (było 0,52 s). Artefakty ze zrzutów miały dwie przyczyny: zdjęcie powiększonej kartki było nakładane na kartkę w widoku całej strony (inne miejsce i wielkość – stąd pas przez całą szerokość i kreski poza stroną) oraz ukośne „duchy” kresek odbitych na płacie zginanym w poziomie. Teraz powiększona kartka najpierw wraca do widoku całej strony, a obie kartki są brane w tym samym widoku i obcinane do strony. |

## Testy, które wykonano

- **Testy logiki (Node.js): 347 – wszystkie zaliczone** (342 wcześniejsze + 5 nowych):
  - odcinek: 2,3° od poziomu – poziomo, 47° – 45°, prawie pion – pion, 30° zostaje (po 3 kreski
    z innym drżeniem); strzałka z grotem „V”, z grotem-trójkątem i z grotem narysowanym najpierw
    (ostrze na miejscu); łamana pod 53° – wierzchołki w rogach (do 4 jednostek), bez przyciągania do 45°;
    haczyk na początku kreski nie robi łamanej;
  - trójkąt równoramienny, prostokątny i odwrócony; prostokąt (3 kreski), zaczęty w połowie boku
    i z zakładką; kwadrat; kwadrat na rogu – romb; romb; równoległobok (pochylenie ⅓); trapez (wcięcie
    0,2); pięciokąt; litera L – wierzchołki w przecięciach przyciągniętych boków;
  - okrąg (2 kreski), elipsa pozioma, pionowa, obrócona o 30°, niedomknięta; odrzucone: półokrąg, łuk,
    fala, ósemka, spirala, kropka, za mała kreska na ekranie; kolor i grubość (mediana) kreski;
  - łamana i wielokąt: ramka wokół wierzchołków, punkty (narożniki, wierzchołki, obrót – bez
    pochylenia), przesunięcie wierzchołka (pozostałe na miejscu), bok przyciągnięty do poziomu,
    przecięcie dwóch przyciągniętych boków, narożnik skaluje wierzchołki, obrót, wierzchołek obróconej
    figury, pola szerokości i wysokości; sprawdzanie danych (liczba wierzchołków, wartości, wypełnienie
    łamanej), boki do przyklejania (łamana bez boku zamykającego), ustawienie rozpoznawania.
  - Poza testami: kreski syntetyczne z drżeniem w 5 wariantach (mocniejsze drżenie, rzadkie punkty,
    mała figura, zaokrąglone rogi) po 20 razy – figury rozpoznane w 90–100% (przy bardzo mocnym drżeniu
    pięciokąt czasem zostaje odręczny, sześcio- i ośmiokąt bywa okręgiem); łuki, fale, ósemki – nigdy.
- **Testy w przeglądarce (Chromium): 162 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (159 wcześniejszych + 3 nowe):
  - ekran iPada, zdarzenia rysika: prostokąt z wybrzuszeniem przytrzymany – prosty bok; Cofnij –
    kreska z wybrzuszeniem, Cofnij – pusto, Ponów ×2 – prostokąt; okrąg, trójkąt, strzałka, łamana
    przytrzymane, kreska bez przytrzymania – odręczna; łamana zaznaczona („Łamana”), wierzchołek
    przeciągnięty; wyłącznik w ustawieniach pióra – przytrzymana kreska zostaje odręczna; zapis:
    prostokąt 400 × 250, okrąg ⌀240, trójkąt na poziomej podstawie, strzałka pozioma z grotem w miejscu
    ostrza, przesunięty wierzchołek i pozostałe na miejscu, dwie kreski pióra;
  - ekran telefonu, zdarzenia palca: liniuszek, pole tekstowe wstawione na kółku; dotknięcie kółka
    zaznacza pole (liniuszek bez ruchu); przeciągnięcie przesuwa pole o ok. 200 × 150, a kółko zostaje
    (do 2 px); kółko poza zaznaczeniem przesuwa liniuszek; zapis – pole w nowym miejscu;
  - ekran komputera, zatrzymany czas animacji: powiększona kartka – przewracanie w widoku całej strony
    (stara kartka z kreską w tym samym miejscu), w połowie z prawej odsłonięta następna kartka,
    z lewej płat (jasny odwrót), po 0,85 s animacja trwa, po 0,95 s koniec; wstecz – pod spodem
    bieżąca kartka.
- **Lint: bez błędów.**
- Zrzuty (Chromium): figury z kresek i punkty w wierzchołkach łamanej (iPad), pole na kółku liniuszka
  (telefon), klatki przewracania kartki (komputer i telefon).

## Czego nie sprawdzono

- **Apple Pencil na iPadzie i Safari na iPhonie** – przytrzymanie rysika i palca sprawdzone tylko
  zdarzeniami w Chromium (pióro i palec bez drżenia w czasie postoju). Prawdziwa ręka drży: do 6 px
  przytrzymanie trwa, dalej liczy się od nowa – do sprawdzenia u Ciebie, czy ½ s i 6 px są wygodne.
- **Rozpoznawanie na prawdziwych kreskach** – sprawdzone na kreskach syntetycznych z drżeniem
  i zaokrąglonymi rogami; Twoje kształty mogą być rysowane inaczej (np. strzałka grotem z dwóch
  osobnych kresek – to dwie kreski, nie strzałka).
- **Przewracanie kartek w Safari** (płynność 0,9 s animacji na iPadzie i iPhonie) – tylko Chromium.

## Uzupełnienie w wersji 1.24.1 – spirala na grzbiecie kartki

| Prośba | Jak jest zrobione |
| --- | --- |
| Efekt kółek spirali na lewym grzbiecie i dziurek w kartkach, przez które przechodzi spirala; bez tego efektu na obrazie (grafice) rysunku | Kartka w edytorze ma przy lewej krawędzi **dziurki co kratkę** (na środku wysokości strony) i **metalowe zwoje**: drut wychodzi z dziurki, przechodzi nad krawędzią z cieniem na kartce i wraca pod kartką (ta część widoczna tylko za krawędzią, ciemniejsza); zwoje widać lekko z ukosa, jak w zeszycie na spirali. Zwoje leżą nad kreskami. Przy **przewracaniu** spirala stoi, a kartka obraca się wokół niej (dziurki przewracają się razem z kartką). Strona jest dopasowana do ekranu tak, żeby zwoje się mieściły (na wąskim ekranie strona jest o ok. 5% mniejsza); przy powiększeniu przesunięcie strony w prawo odsłania spiralę. **Obraz rysunku w notatce, wycinek i „Osadź” – bez spirali i bez dziurek**; kreska narysowana pod dziurką jest na obrazie cała. Strona ze zdjęciem („Rysuj na zdjęciu”) – bez spirali. |

Testy wersji 1.24.1:

- **Testy logiki (Node.js): 347 – wszystkie zaliczone** (bez zmian – spirala to tylko rysowanie
  w edytorze).
- **Testy w przeglądarce (Chromium): 163 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (162 wcześniejsze + 1 nowy): ekran komputera – kreska przy grzbiecie; w dziurce szarość, między
  dziurkami papier; zwój za lewą krawędzią strony (warstwa bieżąca); strona odsunięta od brzegu o miejsce
  na spiralę; po „Gotowe” obraz rysunku w notatce bez dziurki, a kreska pod dziurką cała.
- **Lint: bez błędów.**
- Zrzuty (Chromium): spirala na komputerze i telefonie, klatki przewracania ze spiralą.

Czego nie sprawdzono: wygląd na ekranie iPada i iPhone'a w Safari (tylko Chromium z ekranem telefonu)
oraz w trybie ciemnym na prawdziwym urządzeniu (zwoje i dziurki mają stałe kolory, kartka jest biała
w obu trybach).

## Uzupełnienie w wersji 1.24.2 – powiększanie i przesuwanie dwoma palcami

| Zgłoszenie | Przyczyna i poprawka |
| --- | --- |
| Powiększanie dwoma palcami na iPhonie ucieka w lewy górny róg – nie powiększa w miejscu rozsuwanych palców; przesuwanie dwoma palcami nie jest płynne, skacze | Edytor rysunku liczył przesunięcie strony od początku gestu, ale powiększenie – od poprzedniej klatki (w skali, która już się zmieniła). Każda klatka zostawiała błąd proporcjonalny do odległości palców od lewego górnego rogu strony, więc strona uciekała w tamtą stronę, a przy przesuwaniu – gdy odstęp palców choć trochę drgał – skakała. Teraz oba ruchy są liczone od początku gestu: powiększenie według odstępu palców, a punkt strony, który był pod środkiem palców, zostaje pod ich środkiem (także gdy palce przy tym idą). Wyjątek jak dotąd: przy brzegu strony kartka nie wychodzi poza brzeg ekranu (górny brzeg nie zjeżdża pod pasek narzędzi), więc tam punkt może się przesunąć. |

Testy wersji 1.24.2:

- **Testy logiki (Node.js): 347 – wszystkie zaliczone** (bez zmian).
- **Testy w przeglądarce (Chromium): 164 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (163 wcześniejsze + 1 nowy): ekran telefonu, zdarzenia dwóch palców na przemian (jak na telefonie):
  znacznik w punkcie (1000, 600) strony; rozsunięcie palców wokół niego – 400%, znacznik pod środkiem
  palców (do 4 px); rozsunięcie z jednoczesnym przesunięciem palców – znacznik idzie za środkiem palców;
  przesunięcie dwoma palcami o (−60, −40) px – powiększenie bez zmian, znacznik dokładnie o tyle samo
  (do 3 px). Ten sam test na kodzie sprzed poprawki: znacznik ucieka poza ekran (test niezaliczony) –
  błąd był odtworzony, zanim go poprawiłem.
- **Lint: bez błędów.**

Czego nie sprawdzono: **Safari na iPhonie** – gest sprawdzony zdarzeniami palców w Chromium, nie na
prawdziwym ekranie. Do sprawdzenia u Ciebie, czy powiększanie i przesuwanie są teraz płynne.
