# LexiCards 1.13 – pola tekstowe i wzory na rysunku

Wersja 1.13.0, 19 października 2026. W edytorze rysunku (pisanie ręczne) doszły pola tekstowe
i wzory. Wzór wpisujesz tym samym zapisem co w notatce, a rysunek składa go sam i zapisuje razem
z kreskami. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Treść notatki” – „rysunki”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Pole tekstowe w trybie pisania ręcznego | Na pasku narzędzi edytora rysunku przycisk **pole tekstowe** (litera T w ramce) otwiera okno **Nowe pole tekstowe**: tekst (Enter zaczyna nowy wiersz, długi wiersz łamie się sam na słowach), **Wielkość** (Mała, Średnia, Duża) i **Kolor** (kolory pióra). **Wstaw** kładzie pole na środku widocznej części strony i od razu je zaznacza – przeciągnięciem przesuwasz je w wybrane miejsce |
| Równania w trybie pisania ręcznego | Przycisk **Σ** otwiera okno **Nowy wzór** – to samo co ściągawka „Równania” w notatce: pole **Zapis wzoru** (jak w notatce, bez znaków dolara: `\frac{a}{b}`, `x^2`, `\sqrt{x}`, `\sum_{i=1}^{n}`…), podgląd wzoru, opis błędu zapisu, wielkość, kolor i wszystkie przykłady (dotknięcie przykładu wpisuje go do pola). **Wstaw** kładzie wzór na stronie, zaznaczony |

Szczegóły:

- **Kolejne pola i wzory** układają się jeden pod drugim (nie na sobie); gdy pod spodem brakuje
  miejsca – od góry widocznej części strony.
- **Poprawka:** dotknięcie zaznaczonego pola albo wzoru (albo **Edytuj** nad ramką zaznaczenia)
  otwiera je z treścią, wielkością i kolorem; **Zapisz** zostawia element w tym samym miejscu.
  Pusta treść usuwa element. Nad ramką widać, co jest zaznaczone: „Pole tekstowe”, „Wzór” albo
  liczbę elementów.
- **Jak kreski:** pola i wzory zaznaczasz prostokątem, dotknięciem albo „Zaznacz wszystko”,
  przesuwasz, powielasz i usuwasz; cofnij i ponów obejmują wstawienie, poprawkę i przesunięcie.
  Gumka **Całe kreski** usuwa pole albo wzór w całości, gumka **Fragmenty** ich nie przecina (ściera
  tylko kreski).
- **Wielkość:** ostatnio wybrana zostaje dla następnych pól i wzorów (na tym urządzeniu). Kolor
  nowego elementu – kolor pióra.
- **Wzór na rysunku** składa sama aplikacja (układ jak w podręczniku: ułamki, potęgi i indeksy,
  pierwiastki ze stopniem, sumy i granice z granicami nad i pod znakiem, całki, nawiasy w wysokości
  treści, akcenty – wektor, daszek, kreska –, litery greckie, funkcje prosto, odstępy wokół działań),
  czcionką wzorów systemu (na iPadzie i Macu STIX Two Math, na Windows Cambria Math). Dzięki temu wzór
  jest w obrazie rysunku w notatce, w powiększeniu, w eksporcie do arkusza i w „Kopiuj notatkę”.
  Wzorów w notatce (MathML) nie dało się przenieść na rysunek: Safari blokuje zapis płótna z takim
  obrazem.
- **Zapis:** pola i wzory są w danych rysunku (format 2) obok kresek – przy ponownej edycji można je
  poprawiać; kopia zapasowa przenosi je w pliku obrazów i załączników. Starsza wersja aplikacji
  pokaże rysunek (obraz), ale przy jego poprawianiu pominie pola i wzory.
- **Telefon:** pasek narzędzi z dwoma nowymi przyciskami ma trzy wiersze (strona i tak ma dużo
  miejsca w pionie).

## Testy, które wykonano

- **Testy logiki (Node.js): 281 – wszystkie zaliczone** (277 wcześniejszych + 4 nowe):
  - układ wzoru: ułamek wyższy od wiersza (licznik nad, mianownik pod linią bazową, kreska),
    potęga obok i wyżej, znak pierwiastka, nawiasy wokół ułamka, suma z granicami nad i pod,
    wymiary rosnące z wielkością; odstępy wokół „+” i „=”, znak liczby („−x”) bez odstępu, zmienne
    kursywą, nazwa funkcji prosto z odstępem („sin x”), błąd zapisu na czerwono;
  - pola tekstowe i wzory w danych: granice, trafienie gumką, gumka fragmentów ich nie przecina
    (kreska pod polem – tak), zaznaczanie prostokątem, przesunięcie bez zmiany oryginału;
    sprawdzanie danych (pusta treść, złe liczby i kolory odrzucone, wielkość i długość tekstu
    ograniczone); zapis w notatce i kopia zapasowa w obu plikach – pole i wzór wracają bez zmian.
- **Testy w przeglądarce (Chromium): 122 – wszystkie zaliczone w dwóch przebiegach** (121
  wcześniejszych + 1 nowy), ekran iPada: pole tekstowe w dwóch wierszach (duże, czerwone) – na
  środku strony, zaznaczone; „Wstaw” nieaktywne bez tekstu; wzór `\frac{a+b}{2} = x^2` (niebieski)
  – podpowiedź „Wzór jest gotowy.”, pod polem tekstowym; przesunięcie wzoru rysikiem; dotknięcie
  zaznaczonego wzoru – poprawka zapisu; „Edytuj” pola tekstowego – poprawka tekstu; gumka fragmentów
  nie zmienia tekstu, gumka całych kresek usuwa wzór, cofnij przywraca; zapis – pole i wzór w danych
  (rodzaj, kolor, wielkość, treść, wymiary), rysunek w podglądzie notatki; ponowne otwarcie – pole
  nadal da się zaznaczyć. Test telefonu: pasek każdego narzędzia w szerokości ekranu, najwyżej trzy
  wiersze.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno „Nowy wzór” z wielkością i kolorem, pole tekstowe i wzór na rysunku
  (iPad), przykłady wzorów złożonych na płótnie (granica, całka, wektor i akcenty, pierwiastek
  stopnia 3, symbol Newtona, nawiasy).

## Czego nie sprawdzono

- **Safari na iPadzie i iPhonie** – wygląd wzorów na płótnie zależy od czcionki wzorów systemu
  (STIX Two Math); na zrzutach z Chromium w kontenerze testowym była STIX. Do sprawdzenia u Ciebie:
  wygląd sumy, całki i pierwiastka na rysunku.
- **Windows (Cambria Math)** – nie sprawdzano.
- Pole tekstowe na rysunku jest zwykłym tekstem (bez pogrubienia i list); wzorów w treści pola
  tekstowego (`$…$`) rysunek nie zamienia – wzór wstawiasz osobnym przyciskiem Σ.
