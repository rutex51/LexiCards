# LexiCards 1.23 – nauka w kalendarzu (plik .ics dla Outlooka)

Wersja 1.23.0, 20 października 2026. Ostatnia część paczki uwag (punkt 6 propozycji: kalendarz w nowym
Outlooku; decyzja 10 – plik .ics z ekranu Nauka). Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md)
(sekcja „Nauka z fiszkami” – „Od 1.23 plan nauki w kalendarzu”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Eksport sesji nauki do kalendarza (Outlook) – plik .ics tworzony w aplikacji, bez serwera | Zakładka **Nauka** → po wyborze materiału grupa **Kalendarz** → **Zaplanuj naukę w kalendarzu** – okno **Nauka w kalendarzu**; **Zapisz .ics** zapisuje plik („nauka-lekcje-….ics”; na iPhonie i iPadzie – arkusz udostępniania, „Zachowaj w Plikach”). W Outlooku: Kalendarz → Dodaj kalendarz → Prześlij z pliku (albo otwórz plik). |
| Termin: data, godzina, czas trwania i przypomnienie | **Pierwszy dzień** – kalendarz z 1.21.1 (wcześniejszy niż dziś – dziś; gdy dziś jest już po wybranej godzinie, okno proponuje jutro), **Godzina** – bębny, **Czas trwania** 15, 20, 30, 45 min, 1 h, 1,5 h, **Przypomnienie** – brak, 5, 10, 15, 30 min, 1 h przed. |
| Cykliczność: np. pon./śr./pt. do wybranej daty albo N razy | **Powtarzanie**: Jednorazowo, Codziennie albo Wybrane dni (Pn–Nd, co najmniej jeden); **Koniec powtarzania**: po liczbie terminów (1–365, domyślnie 10) albo w wybranym dniu (kalendarz). Pierwsze wydarzenie – najbliższy wybrany dzień tygodnia. |
| Prywatność: „Prywatne” i „Pokaż jako: Zajęty” | Przełączniki **Prywatne – inni widzą tylko zajęty czas** i **Pokaż jako: zajęty** (oba domyślnie włączone; wyłączone – publiczne i „wolny”). |
| Opis: lista lekcji z linkami do Nauki; nowy rodzaj linku do wielu lekcji | Przełącznik **Linki do lekcji w opisie**: w opisie „Rozpocznij naukę: …” – Nauka z tym samym materiałem (lekcja, kilka lekcji, moduł, dziedzina albo wszystko) – i lista lekcji „Moduł › Lekcja – link” (najwyżej 30). Nowy link do kilku lekcji jednego modułu: `…/#/study/lessons/id1+id2` – otwiera Naukę z tymi lekcjami zaznaczonymi. |

Szczegóły:

- **Strefa czasowa i zmiana czasu:** wydarzenie jest zapisane w strefie urządzenia (np. Europe/Warsaw)
  z opisem strefy i regułami zmiany czasu wyliczonymi z przeglądarki – nauka o 17:30 zostaje o 17:30
  także po przejściu na czas zimowy i letni (Outlook przelicza ją w swojej strefie).
- **Podsumowanie** w oknie pokazuje plan zdaniem („pn, śr, pt o 17:30 przez 45 min, od 21 października
  2026, do 18 grudnia 2026”). Okno pamięta ostatni plan (godzina, dni, czas, przypomnienie, przełączniki).
- **Ograniczenia** (jak w propozycji, opisane też w oknie): link działa tam, gdzie są dane aplikacji –
  na Windows w Edge i Chrome aplikacja i karta przeglądarki mają wspólne dane; na iPhonie link z Outlooka
  otworzy Safari, a aplikacja z ekranu początkowego ma osobne dane, więc lekcji może tam nie być. Ponowny
  import tego samego pliku może zdublować wydarzenia (ten sam plan ma ten sam identyfikator – kalendarze,
  które go uwzględniają, zastąpią wydarzenie). Bez synchronizacji i zaproszeń – zmiana planu to nowy plik.
- **Prywatność danych:** plik nie wychodzi z urządzenia (aplikacja nie łączy się z żadnym serwerem); w opisie
  są nazwy modułów i lekcji – trafią do Twojego kalendarza.

## Testy, które wykonano

- **Testy logiki (Node.js): 342 – wszystkie zaliczone** (337 wcześniejszych + 5 nowych):
  - tekst wartości (ukośnik, średnik, przecinek, nowy wiersz), zawijanie do 75 bajtów UTF-8 bez dzielenia
    polskich znaków, po rozwinięciu – ten sam tekst;
  - strefa: przesunięcie Warszawy latem 120 i zimą 60 min, Nowy Jork −300; 18:00 w Warszawie latem to
    16:00 UTC; koniec 18.12.2026 – 22:59:59 UTC; reguły: Warszawa – ostatnia niedziela marca 02:00 i
    października 03:00, Nowy Jork – druga niedziela marca i pierwsza listopada, Sydney – czas letni od
    października, Tokio – bez zmiany;
  - plan: pierwszy dzień z wybranych dni tygodnia (także przez Nowy Rok), domyślne i złe ustawienia,
    opis planu (dni tygodnia, codziennie do dnia, 1,5 h, jednorazowo);
  - plik: wiersze CRLF do 75 bajtów, DTSTART i DTEND w strefie, RRULE z dniami tygodnia i COUNT,
    codziennie z UNTIL w UTC, jednorazowo przez północ (bez RRULE), przypomnienie, prywatne / publiczne,
    zajęty / wolny, bez linków – bez opisu i adresu, przecinki w tytule, ten sam plan – ten sam
    identyfikator, inna godzina – inny;
  - link do kilku lekcji: adres i odczyt (kodowanie, pusty – zwykła Nauka).
- **Testy w przeglądarce (Chromium): 159 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (157 wcześniejszych + 2 nowe):
  - ekran komputera, strefa Europe/Warsaw, zegar testu 20.10.2026 14:35: link do dwóch lekcji otwiera
    Naukę z nimi (materiał w oknie „Lekcje: A, B · 2 lekcje”, tytuł „Nauka – Lekcje: A, B”); domyślnie
    wtorek o 18:00; pn, śr, pt, „1730” na bębnie, 45 min, koniec 18 grudnia (dwa miesiące dalej
    w kalendarzu), przypomnienie 30 min – podsumowanie; pobrany plik: wiersze CRLF do 75 bajtów,
    `DTSTART;TZID=Europe/Warsaw:20261021T173000`, `DTEND…T181500`,
    `RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;WKST=MO;UNTIL=20261218T225959Z`, opis strefy z regułą
    października, przypomnienie, prywatne, zajęty, adres Nauki z obiema lekcjami, obie lekcje z linkami
    w opisie; ponowne otwarcie okna – ten sam plan; link z pliku otwiera Naukę z obiema lekcjami;
  - ekran telefonu: okno bez przewijania w bok, dni tygodnia w szerokości ekranu.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno planu (komputer i telefon).

## Czego nie sprawdzono

- **Outlook** – import pliku nie był sprawdzony w prawdziwym Outlooku (ani nowym, ani klasycznym, ani
  w Outlook.com) – w środowisku testów go nie ma. Plik jest zgodny z RFC 5545 i ma pola, których używa
  Outlook (`X-MICROSOFT-CDO-BUSYSTATUS`), ale np. nazwa polecenia „Prześlij z pliku” w polskim Outlooku
  i to, czy ponowny import zastępuje wydarzenie, czy je dubluje – do sprawdzenia u Ciebie.
- **Safari na iPhonie i iPadzie** – zapis pliku przez arkusz udostępniania i otwarcie .ics w Kalendarzu
  iOS nie były sprawdzone (testy działają w Chromium z ekranem telefonu).
- **Linki z Outlooka** – otwieranie linku z wydarzenia w przeglądarce z danymi aplikacji sprawdzone tylko
  przez przejście na adres z pliku w tej samej karcie Chromium.
