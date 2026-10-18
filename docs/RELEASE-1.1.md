# LexiCards 1.1 – notatki do lekcji

Wersja 1.1.0, 18 października 2026. Każda lekcja może mieć notatkę: tekst z formatowaniem
i obrazy. Notatki przychodzą też z osobnego arkusza pliku importu, wychodzą w eksporcie
do XLSX i są w kopii zapasowej. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcje „Dane”,
„Notatki w arkuszu”, „Treść notatki”, „Kopia zapasowa”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Notatka do całej lekcji, z listy lekcji w module | Menu „…” lekcji: **Dodaj notatkę** / **Notatka**; lekcja z notatką ma ikonę notatki obok „…” |
| …lub z innych miejsc | Ekran lekcji (wiersz „Notatka” z początkiem tekstu i miniaturą obrazu, także w menu), szczegóły pojęcia w lekcji i w glosariuszu („Notatka lekcji”), sesja fiszek (ikona u góry – np. schemat w trakcie nauki) |
| Osobne okno z sekcją na tekst i obrazek | Okno „Notatka”: podgląd (tekst, obrazy, **Kopiuj notatkę**) i edycja – sekcja **Tekst** z paskiem formatowania (pogrubienie, kursywa, podkreślenie, nagłówek, listy punktowana i numerowana, pięć kolorów, usunięcie formatowania; Ctrl+B/I/U) oraz sekcja **Obrazy** (dodawanie ze zdjęć, plików i aparatu, do 30 obrazów; powiększ, przesuń, usuń). Obraz na cały ekran: dwa palce, dwukrotne dotknięcie, przesuwanie, przewijanie między obrazami |
| Import jako osobny arkusz obecnego pliku: dziedzina, moduł, lekcja, notatki – tekst i grafika | Arkusz „Notatki” we wzorze pliku (kolumny `Domain`, `Module`, `Lesson`, `Note`, `Image`) z przykładową notatką i obrazem. Obrazy mogą być wklejone do komórki („Umieść w komórce”, Excel 365) albo na arkusz przy komórce (każdy Excel, LibreOffice, Numbers). Kilka wierszy tej samej lekcji to jedna notatka |
| Przenoszenie tekstu sformatowanego | Z komórki Excela: pogrubienie, kursywa, podkreślenie, przekreślenie, indeksy, kolor (przybliżany do pięciu kolorów notatek), większy pogrubiony wiersz jako nagłówek, „•”/„-”/„1.” jako listy. Wklejanie do notatki z Worda, stron WWW, Google Docs, Notatek, tabel z Excela – z formatowaniem, bez skryptów i stylów. **Kopiuj notatkę** daje do schowka tekst z formatowaniem i obrazami (Word, Pages, Notatki, poczta) |
| Osobny import fiszek i notatek, zależnie od zawartości pliku | Plik z pojęciami i notatkami: krok **Wybierz zawartość** (pojęcia, notatki albo oba). Sam arkusz notatek albo sam arkusz pojęć – kreator od razu idzie właściwą drogą; plik bez notatek przechodzi te same 7 kroków co w 1.0. Krok **Sprawdź notatki**: podgląd każdej notatki z miniaturami obrazów i lekcją docelową, uwagi do wierszy, a dla lekcji, które mają już notatkę – zastąp / dopisz / zostaw |

Dodatkowo: eksport do XLSX ma arkusz „Notatki” w układzie, który przyjmuje import (wyeksportowany
plik wczytany z powrotem daje notatkę bez zmian); kopia zapasowa (format 2) zawiera notatki
z obrazami, a kopie z wersji 1.0 nadal się przywracają; usuwanie lekcji, modułu i dziedziny
uprzedza o notatkach; kopia lekcji kopiuje też notatkę.

## Testy, które wykonano

- **Testy logiki (Node.js): 212 – wszystkie zaliczone** (192 wcześniejsze + 20 nowych): filtr HTML
  (skrypty, zdarzenia, odnośniki `javascript:`), wklejki z Worda, Google Docs i tabel, kolory, listy
  zagnieżdżone, tekst sformatowany komórki w obie strony, rozpoznawanie obrazów, zapis i usuwanie
  obrazów, limity, usuwanie kaskadowe, kopia lekcji, kopia zapasowa z Base64, zapis i odczyt XLSX
  z formatowaniem i obrazami, pliki z openpyxl i z LibreOffice, obrazy „w komórce” Excela 365,
  rozpoznanie arkusza notatek, grupowanie wierszy i przypisanie obrazów, import razem z pojęciami
  (nowe lekcje, zastąp/dopisz/pomiń, nazwy niejednoznaczne i brakujące), eksport → import bez zmian, wzór.
- **Testy w przeglądarce (Chromium, ekran telefonu): 80 – wszystkie zaliczone w dwóch przebiegach**
  (72 wcześniejsze + 8 nowych): dodanie notatki z listy lekcji z formatowaniem i obrazem, podgląd,
  powiększenie, porzucenie zmian, usunięcie, trwałość po przeładowaniu; wklejenie HTML z Worda
  (skrypt się nie wykonał) i obrazu, kopiowanie do schowka; import z arkusza notatek razem
  z pojęciami i samych notatek (zastąp / zostaw); eksport z notatką i import do pustej aplikacji;
  kopia zapasowa z obrazami; notatka w sesji fiszek i w glosariuszu (klawisze fiszek nie działają
  pod oknem); okno notatki na ekranie 320 px w ciemnym motywie.
- **Pliki od innych programów:** wzór importu otwarty w LibreOffice wyświetla nagłówek, pogrubienia,
  kursywę, podkreślenie, kolory, punkty i obraz przy lekcji; plik zapisany przez aplikację,
  przepisany przez LibreOffice i przeczytany z powrotem zachowuje formatowanie i obrazy.

## Czego nie sprawdzono

- **Na iPhonie** – testy działają w Chromium z ekranem telefonu, nie w Safari na iOS. Do
  sprawdzenia u Ciebie: pisanie i pasek formatowania przy klawiaturze, wklejanie z innych
  aplikacji, dodawanie zdjęć (HEIC z aparatu Safari zamienia na JPEG), powiększanie dwoma palcami.
- **W Excelu** – pliki z obrazami „w komórce” są złożone według budowy plików Excela 365, ale nie
  powstały w samym Excelu; obrazy wstawiane na arkusz sprawdzono plikami z openpyxl i LibreOffice.
  Jeśli plik z Excela nie przyniesie obrazów albo formatowania, prześlij go – poprawię odczyt.
- Wklejanie i kopiowanie w Wordzie, Pages i Notatkach – sprawdzone tylko na przykładowym HTML.

## Znane ograniczenia

- Obrazy w formatach EMF i WMF (rysunki Windows) są pomijane – trzeba je zapisać jako PNG lub JPEG.
- Notatki nie biorą udziału w wyszukiwaniu glosariusza; CSV przenosi notatki bez obrazów
  (tylko arkusz notatek zapisany jako osobny plik CSV).
- Kolory tekstu są ograniczone do pięciu (czerwony, pomarańczowy, zielony, niebieski, fioletowy),
  żeby były czytelne w obu motywach; inne kolory z Excela są do nich przybliżane.
