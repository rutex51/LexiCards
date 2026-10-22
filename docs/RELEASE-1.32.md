# LexiCards 1.32 – nowy interfejs rysowania: kółka narzędzi, górne menu, dolny pasek

Wersja 1.32.0, 22 października 2026. Pierwsza część przebudowy interfejsu edytora rysunku według
szkicu i wybranych wariantów (makiety – płótno „Rysunek – nowy interfejs”): kolor dużego kółka –
wariant C, górne menu – dwa wiersze na jednej pastylce z wysuwanym wyborem (iPad, komputer), na iPhonie
– wariant 3, przełączanie na zaznaczanie lewym Altem, lewe kółko z zestawem Metrologia. Personalizacja
grup (własne grupy, wybór narzędzi) – w następnej wersji. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md)
(sekcja „Interfejs edytora rysunku”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Dwa „magic ringi” u góry po prawej i po lewej; duże kółko jak kółko „Nauka”, z ikoną wybranego narzędzia | Po prawej **kółko narzędzi standardowych**, po lewej – lustrzane **kółko moich narzędzi**. Duże kółko ma obwódkę w kolorze paska (jak kółko „Nauka” w menu) i ikonę wybranego narzędzia; dotknięcie – ustawienia narzędzia (pióro, zakreślacz, kształt). Kółko strony, z której nie ma wybranego narzędzia, pokazuje ikonę swojej grupy. |
| Kolor narzędzia – wariant C (wypełnienie) | Duże kółko jest **wypełnione kolorem** pióra, zakreślacza albo kształtu, obwódka zostaje biała; na jasnym kolorze (żółty zakreślacz) ikona jest ciemna. Narzędzia bez koloru (gumka, zaznaczanie) – kolor aplikacji. |
| Małe kółka – grupy; obrót palcem albo kółkiem myszy; widać 35–50% okręgu, przy krawędzi ekranu płynne zanikanie | Małe kółka co 45° wokół dużego to **grupy**: Pisanie, Kształty, Konstrukcja (prosta, punkt), Tekst i wzory (tekst, wzór, tabela, karteczka), Symbole metrologiczne. Widać wycinek skierowany do środka ekranu (ok. 40% obwodu): dalsze kółka i te przy krawędzi ekranu **płynnie znikają**. **Przeciągnięcie** po małych kółkach obraca je (po puszczeniu – dociągnięcie do najbliższej grupy), **kółko myszy** w pierścieniu – o jedną grupę na ruch. Dotknięcie małego kółka wybiera grupę. |
| Prawe – narzędzia standardowe, lewe – użytkownika; zestaw Metrologia | Lewe kółko ma na początek zestaw **Metrologia**: odcinek, prosta, punkt, ramka tolerancji, baza, chropowatość. Własne grupy i wybór zestawów – w następnej wersji. |
| Górne menu: do 3 poziomów – kolory, narzędzia grupy, wybór bez okna (jak na zdjęciu) | Jedna pastylka: nazwa grupy, **narzędzia grupy** (ikona i napis), pod nimi **kolor i grubość**; pod pastylką wysuwa się **wybór** bez osobnego okna – tryb gumki (całe kreski / fragmenty), obszar i tryb zaznaczania (prostokąt, lasso, auto, całe, fragmenty, wycinek). Wybór grupy wybiera od razu jej ostatnie narzędzie (w kształtach – ostatni kształt); drugie dotknięcie wybranego narzędzia – jego ustawienia. |
| iPhone – wariant 3 | Na iPhonie menu ma **jeden wiersz**: kropka koloru i narzędzia grupy (przewijane w bok); dotknięcie kropki otwiera kolor i grubość; wybór wisi pod menu jak zakładka. Lewe kółko jest na początku schowane (zakładka przy lewej krawędzi). |
| Na dole na środku narzędzia ogólne: linijka, liniuszek, tło, zaznaczanie, cofnij, dalej | **Dolny pasek:** zaznaczanie, linijka, liniuszek, tło, cofnij, ponów. |
| Po lewej na dole – pastylki informacyjne (szare), po prawej – do zmiany (białe) | Po lewej: podpowiedź zaznaczania, długość kreski przy linijce, **Kratka: 1 cm** (skala rysunku) i powiększenie (dotknięcie – cała strona). Po prawej: kartka (‹ Kartka 1 z 3 › w jednym wierszu), rysik i palec, liniuszek, linijka. |
| Zaznaczanie prawym przyciskiem myszy; przełączanie na zaznaczanie – lewy Alt (Ctrl+Z nie zmienia narzędzia); spacja – powiel | **Prawy przycisk myszy** (albo przycisk na rysiku) zaznacza przy każdym narzędziu – narzędzie zostaje zaznaczaniem. Samo naciśnięcie **lewego Alt** – zaznaczanie na stałe, ponownie – poprzednie narzędzie (komunikat mówi, do którego). Alt przytrzymany przy przeciąganiu to dalej swobodne końce odcinka; prawy Alt (AltGr – polskie litery) nic nie przełącza; Ctrl+Z, Ctrl+Y i pozostałe skróty z Ctrl nie zmieniają narzędzia. **Spacja** przy zaznaczeniu – powiel. |
| Chowanie elementów; duże kółko w prawo chowa je, dolny pasek w dół itd.; jeden przycisk w nagłówku chowa wszystko | **Duże kółko** przesunięte do krawędzi ekranu – kółko się chowa; **górne menu** – w górę (albo uchwyt pod nim), **dolny pasek** – w dół (albo uchwyt nad nim), **pastylki** – na boki. Zostaje wąska zakładka przy krawędzi, która przywraca element; wybór jest zapamiętany na urządzeniu. **Oko** w nagłówku chowa cały interfejs (zostaje sam rysunek); ponowne dotknięcie przywraca. |

Zmiany przy okazji: wycinek robi się teraz w trybie **Wycinek** (do 1.31 także prawym przyciskiem –
ten od 1.32 zaznacza). Rodzaje kształtów i symbole metrologiczne są w menu (grupy), a panel kształtów
(drugie dotknięcie wybranego kształtu) ma ich ustawienia: wypełnienie, rodzaj linii, zakończenia,
proporcje, przyciąganie. Strona leży pod górnym menu, więc na iPadzie i komputerze jest trochę mniejsza
niż w 1.31 (menu ma dwa wiersze); po schowaniu menu przed otwarciem rysunku strona zajmuje całą wysokość.
Przytrzymany Ctrl (od 1.19 – chwilowo zaznaczanie) działa jak dotąd.

## Testy, które wykonano

- **Testy logiki (Node.js): 390 – wszystkie zaliczone** (385 wcześniejszych + 5 nowych): grupy –
  każdy kształt i polecenie w grupie standardowej, Metrologia z symbolami; grupa na starcie (zapamiętana,
  z narzędziem, „Pisanie”); małe kółka – co 45°, lewe kółko lustrem prawego, wycinek 35–50% obwodu,
  zanikanie przy krawędzi ekranu; obrót – granice, dociąganie, najkrótsza droga; schowane elementy
  (lewe kółko schowane tylko na telefonie) i zapis w ustawieniach narzędzi.
- **Testy w przeglądarce (Chromium): 184 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (180 wcześniejszych + 4 nowe; wcześniejsze testy rysunku przechodzą do narzędzi przez grupy na kółku –
  tak jak użytkownik; przesunięte kilka punktów kliknięć i próbek pikseli, bo strona jest trochę mniejsza;
  test wycinka – w trybie „Wycinek” zamiast prawego przycisku):
  - iPad: na starcie „Pisanie”, pióro, czarne duże kółko; widoczny wycinek grup; kółko myszy (dwa ruchy –
    dwie grupy dalej i z powrotem) i przeciągnięcie po okręgu obracają grupy, grupa się nie zmienia;
    Symbole – trzy polecenia, pióro zostaje; Kształty – prostokąt, czerwony – czerwone kółko, dotknięcie
    kółka otwiera i zamyka ustawienia kształtu; zakreślacz – żółte kółko z ciemną ikoną; Metrologia –
    sześć pozycji, odcinek na lewym kółku, czerwony odcinek na kartce, grupa zapamiętana;
  - iPad: kółko przesunięte w prawo – schowane z zakładką (bez otwarcia ustawień), menu uchwytem, pasek
    przesunięciem w dół, pastylki w lewo; po zamknięciu i ponownym otwarciu edytora – nadal schowane;
    zakładki przywracają; oko – wszystko schowane bez zakładek, rysowanie działa, ponownie – wraca;
  - komputer: lewy Alt – zaznaczanie i komunikat, ponownie – pióro; prawy Alt – bez zmiany; Alt przy
    przeciąganiu – bez zmiany; Ctrl+Z i Ctrl+Y – cofnięcie i ponowienie bez zmiany narzędzia; prawy
    przycisk – prostokąt zaznaczenia przy piórze; dwa razy spacja – w zapisanym rysunku trzy kreski;
  - iPhone: menu w jednym wierszu, kolory schowane do dotknięcia kropki (kropka w wybranym kolorze),
    wybór gumki pod menu, lewe kółko schowane – zakładka i Metrologia, kółka w szerokości ekranu.
- **Lint: bez błędów.**
- Zrzuty (Chromium): kółka na iPadzie, Metrologia, schowane elementy, bez interfejsu, menu i kółka na iPhonie.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie**, prawdziwy rysik i palce – gesty w testach są udawane w Chromium;
  szczególnie obrót kółka palcem i przesunięcia chowające elementy.
- Lewy Alt na **Windows w Edge** (czy samo naciśnięcie Alt nie przenosi fokusu na menu przeglądarki –
  aplikacja blokuje domyślne działanie klawisza, ale nie sprawdzono na Windows) i Option na Macu.
- Kółko myszy z gładzikiem (małe przesunięcia sumują się do jednej grupy) – sprawdzone tylko z udawanym
  kółkiem myszy.
- Ciemny motyw nowych elementów – nie oglądany.
