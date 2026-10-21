# LexiCards 1.30 – rysunki notatki przewracane jak kartki, palec też rysuje, obrót, odbicie, Shift

Wersja 1.30.0, 21 października 2026. Druga część uwag z listy do 1.29 – rysowanie (punkty 2, 3, 4, 9, 10
i 11). Dźwięki przewracania (punkt 12) – po wyborze z propozycji (nie ma ich w tej wersji). Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (sekcje „Kartki” i „Od 1.30 obrót i odbicie zaznaczenia”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Rysunki osadzone osobno w notatce, ale przy kilku – przechodzenie między nimi w oknie rysowania, zmiana strony flipbookiem | Każdy rysunek jest w notatce **osobno**, a edytor otwiera **wszystkie rysunki notatki** jako kartki: na kartce rysunku, który edytujesz (ołówek albo „Edytuj rysunek”), a **nowy rysunek** – na kartce za ostatnim. Sąsiednie przewracasz jak dotąd: **‹ ›**, kółko myszy, PageUp / PageDown albo menu kartek (z sygnaturami: „Kartka 2 – Rysunek 2”); w nagłówku – sygnatura bieżącego rysunku. Po **Gotowe** zapisują się **wszystkie zmienione** rysunki (każdy na swoim miejscu, z tą samą sygnaturą, podpisem i oczkiem). **Nowa kartka** dokłada nowy rysunek za ostatnim („Rysunek 3”…); usunąć można tylko kartkę dodaną w tym oknie. „Osadź” wstawia obraz za rysunkiem kartki, z której pochodzi. |
| Rysowanie po obrazku: bez nowej kartki; flipbookiem między zdjęciami | Przy **rysowaniu na zdjęciu** kartki okna to **zdjęcia notatki** (i rysunki na zdjęciach) – **bez „Nowej kartki”** (nie ma już przejścia zdjęcie → pusta kratka). Kolejne zdjęcie wczytuje się dopiero przy przewróceniu (sąsiednie – zawczasu, dalsze zwalniają pamięć – ważne na iPhonie przy wielu zdjęciach). Zdjęcie, na którym nic nie narysowano, zostaje zwykłym zdjęciem; ukryte (oczko) zostaje ukryte. |
| Tablet / laptop: rysowanie palcem, dwa palce przesuwają lub przybliżają | Pigułka **„Rysuje tylko rysik · palec przesuwa”** (pojawia się, gdy aplikacja zna rysik) jest teraz **przełącznikiem**: dotknięcie – **„Palec też rysuje · dwa palce przesuwają”**: palec rysuje, **dwa palce** przesuwają i powiększają (kreska zaczęta pierwszym palcem przepada, gdy dołączy drugi). Wybór jest zapamiętany na urządzeniu; ponowne dotknięcie – z powrotem (dłoń oparta o ekran przy rysiku nie zostawia śladów tylko w trybie „Rysuje tylko rysik”). |
| Obracanie każdego złapanego obiektu | Nad ramką zaznaczenia (narzędzie zaznaczania) – okrągły **uchwyt obrotu**: przeciągnięcie obraca zaznaczenie wokół środka ramki, przy uchwycie widać kąt (jak na linijce: dodatni – przeciwnie do ruchu wskazówek zegara); przyciąga do pełnych 15°, z **Shift** – dokładnie co 15°. Obracają się w całości **kreski pióra i zakreślacza, kształty i szyki** (szyk liniowy zostaje jednym szykiem – z obróconymi rzędami). **Pola tekstowe, wzory, tabele, karteczki i symbole metrologiczne** zostają proste (czytelne): zmienia się ich miejsce, a strzałka karteczki i symbolu idzie razem z resztą. Jeden kształt obraca się jak dotąd swoim uchwytem; jedno pole albo tabela sama – bez uchwytu (nie ma czego obrócić). Jeden krok cofania. |
| Odbicie lustrzane w dwóch osiach, obok „Powiel” | Przycisk **Odbij** obok **Powiel** – menu **W poziomie** (lewa strona z prawą) i **W pionie** (góra z dołem), względem środka zaznaczenia. Kształt zostaje tym samym kształtem (trójkąt z odbitym wierzchołkiem, pochylenie, łamana, łuk), grot strzałki – na tym samym końcu, tekst się nie odwraca. Na telefonie polecenia zaznaczenia, które nie mieszczą się w jednym wierszu, przechodzą do drugiego. |
| Shift – kilka obiektów naraz, precyzyjnie, także blisko siebie | Przy zaznaczaniu z wciśniętym **Shift** zaznaczenie zostaje: **kliknięcie** elementu dokłada go, a kliknięcie zaznaczonego – zdejmuje (także wewnątrz ramki zaznaczenia, więc wybierzesz pojedynczo elementy leżące tuż obok siebie); **prostokąt albo lasso** z Shift dokłada całe elementy. |

Przy obrocie i odbiciu przyklejone końce strzałek i odcinków między przekształcanymi elementami zostają
przyklejone (w odbitym narożniku albo miejscu krawędzi); do elementów spoza zaznaczenia – odklejają się,
jak przy przesuwaniu. Przy okazji: rysunek ukryty w notatce (oczko) po poprawce w edytorze wracał do
podglądu – teraz zostaje ukryty.

## Testy, które wykonano

- **Testy logiki (Node.js): 378 – wszystkie zaliczone** (373 wcześniejsze + 5 nowych): odbicie
  kształtów – obrys jak lustrzany obraz (trójkąt z pochyleniem i obrotem, łamana, w poziomie i w pionie),
  dwa odbicia – jak na początku, początek strzałki zostaje początkiem; kreska, pole tekstowe (prosto,
  środek odbity) i karteczka (strzałka odbita); obrót i odbicie szyków – kopie w miejscach obróconych
  i odbitych kopii (liniowy z kątem, kołowy na łuku z pierścieniami), zapis kąta szyku; przyklejone końce
  po odbiciu (odbity narożnik, bez poprawki przy rozwiązywaniu), odklejenie bez celu, strzałka do tabeli
  po obrocie; kąt obrotu co 15° i wyświetlany, ustawienie „palec też rysuje”.
- **Testy w przeglądarce (Chromium): 177 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (174 wcześniejsze + 3 nowe; 3 wcześniejsze poprawione: sygnatura dodanej kartki to teraz „Rysunek 2”,
  w teście przyciągania końców drugi Esc zdejmuje zaznaczenie strzałki – jej szerszy pasek poleceń
  sięgał początku nowego odcinka, a zrzut okna tekstu z 1.29 na telefonie powstaje po końcu animacji):
  - ekran iPada: rysik – pigułka „Rysuje tylko rysik”, palec nie rysuje; przełącznik – „Palec też rysuje”,
    kreska palcem, dwa palce – 200%; drugi rysunek otwiera się na kartce 2 z 2 („Rysunek 2”), ‹ – kartka
    z „Rysunkiem 1” i jego kreską, kreska na nim; menu kartek z sygnaturami; „Nowa kartka” – „Rysunek 3”;
    po „Gotowe” trzy rysunki (3, 1 i 1 kresek); ołówek drugiego rysunku – kartka 2 z 3;
  - ekran iPada, zdjęcia: ołówek pierwszego z trzech zdjęć – kartka 1 z 3, w menu bez „Nowej kartki”;
    › – drugie zdjęcie (inny kolor pod kreskami), kreski na drugim i trzecim (ukrytym); zapis: pierwsze
    – zwykłe zdjęcie, drugie i trzecie – rysunki na zdjęciu, trzecie nadal ukryte, sygnatury bez zmian;
  - ekran komputera: odbicie strzałki w poziomie (grot w lewo), Shift + kliknięcie kreski – „2 elementy”,
    odbicie w pionie (kreska na dole, strzałka na górze); dwa prostokąty 30 jednostek od siebie: Shift +
    kliknięcia – po jednym, drugie kliknięcie zdejmuje, trzecie dokłada; uchwyt obrotu z Shift – 90°:
    zapis – prostokąty jeden nad drugim w (915, 285) i (915, 415), kąt 90°.
- **Lint: bez błędów.**
- Zrzuty (Chromium): obrót w trakcie (ramka, uchwyt, kąt) i po nim, menu kartek z sygnaturami, rysowanie
  na zdjęciach, palec rysuje (iPad).

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** oraz prawdziwy rysik i palce – zdarzenia dotyku są w testach udawane
  (Chromium z ekranem iPada); szczególnie przełącznik palca i dłoń oparta o ekran przy rysiku.
- Pamięć przy wielu dużych zdjęciach na iPhonie (zwalnianie dalszych kartek sprawdzone tylko w logice
  edytora, nie na urządzeniu).
- Obrót pól tekstowych, wzorów, tabel i karteczek „w całości” (z obróconym tekstem) – świadomie nie ma:
  zostają proste, zmienia się ich miejsce.
- Starsza wersja aplikacji nie zna kąta szyku liniowego – pokaże obrócony szyk z rzędami poziomo (obraz
  w notatce jest dobry); zaktualizuj aplikację na wszystkich urządzeniach.

## 1.30.1 – okno „Obrazy i załączniki” w ustalonym układzie

Wersja 1.30.1, 21 października 2026. Okno „Obrazy i załączniki” (z podglądu i nad oknem tekstu) ma wygląd
pozostałych okien od 1.26: białe tło, każda sekcja – **Obrazy**, **Tabele**, **Podgląd notatki** (miejsce
obrazów i tabel bez odwołania oraz numeracja „Rys. N.”, „Tab. N.” – dotąd pod tabelami, teraz osobna
sekcja, widoczna przy obrazach albo tabelach) i **Załączniki** – w cienkiej zaokrąglonej ramce, z nazwą
i podpowiedzią w środku. Na miniaturze tabeli komórki są pod ołówkiem i ✕ (dotąd przyciski je zasłaniały).

Testy: logika – 378 zaliczone; przeglądarka (Chromium) – 177 zaliczone w dwóch pełnych przebiegach
(test załączników sprawdza też ramkę sekcji); lint bez błędów. Nie sprawdzono w Safari na iPhonie.
