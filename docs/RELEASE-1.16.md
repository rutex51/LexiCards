# LexiCards 1.16 – przeciąganie wierszy i kolejność list biblioteki

Wersja 1.16.0, 20 października 2026. Listy dziedzin, modułów i lekcji w Bibliotece: kolejność
ręczną ustawia się przeciąganiem (palcem, rysikiem albo myszą), a listę można też ułożyć
alfabetycznie, a moduły i lekcje – według daty utworzenia. Opis budowy:
[ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Interfejs” – „Kolejność list”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Przeciąganie (drag & drop) przy sortowaniu ręcznym | W trybie **Zmień kolejność** każdy wiersz ma po prawej uchwyt **≡**. Przytrzymaj go palcem, rysikiem albo myszą i przeciągnij: wiersz unosi się z cieniem i idzie za palcem, pozostałe robią mu miejsce, a po puszczeniu nowa kolejność zapisuje się od razu. Myszą można chwycić też cały wiersz. Przy górnej i dolnej krawędzi ekranu długa lista sama się przewija. Strzałki ↑ ↓ zostają (klawiatura, przesunięcie o jedno miejsce) |
| Sortowanie alfabetyczne | Przy tytule listy (**Dziedziny**, **Moduły**, **Lekcje**) jest przycisk kolejności z ikoną i bieżącym wyborem (np. **Ręcznie**, **A–Z**). Menu **Kolejność …**: **Ręcznie**, **Nazwa A–Z**, **Nazwa Z–A**. Porządek polski (Ł po L, Ć po C), bez rozróżniania wielkich liter, liczby jak liczby („Test 2” przed „Test 10”) |
| Tam, gdzie jest data (moduł, lekcja) – po dacie | Dla modułów i lekcji dodatkowo **Od najnowszych** i **Od najstarszych** – według daty utworzenia widocznej w wierszu („Utworzono …”). Dziedziny nie pokazują daty, więc mają tylko kolejność ręczną i alfabetyczną |

Szczegóły:

- **Wybór jest zapamiętany** osobno dla dziedzin, modułów i lekcji (np. lekcje od najnowszych,
  moduły A–Z) – w ustawieniach, więc wraca też z kopią zapasową. Kolejność ręczna nie ginie:
  po powrocie do **Ręcznie** lista wraca do ułożenia, które ustawiłeś.
- **„Ustaw ręcznie – przeciągnij…”** na dole menu kolejności i dotychczasowe **Zmień kolejność**
  (ikona na Bibliotece, pozycja w menu „…” dziedziny i modułu) przełączają listę na kolejność
  ręczną i od razu włączają przeciąganie. **Gotowe** kończy.
- **Utrwalone na końcu listy** działa jak dotąd: lista jest najpierw układana według wyboru,
  a potem utrwalone trafiają pod pozostałe. Przy przeciąganiu wiersz nie przejdzie z jednej grupy
  do drugiej (zatrzymuje się na granicy); po wyłączeniu ustawienia przesuwa się razem z innymi.
- **Filtr daty** nad listą modułów i lekcji działa razem z kolejnością (np. lekcje z ostatnich 30 dni
  od najnowszych).
- Kolejność dotyczy list w Bibliotece. Kafelki dziedzin na ekranie **Start**, wybór materiału
  w nauce i quizie oraz glosariusz (który ma własne sortowanie) zostają w kolejności ręcznej.

## Testy, które wykonano

- **Testy logiki (Node.js): 294 – wszystkie zaliczone** (292 wcześniejsze + 2 nowe): kolejność
  ręczna, A–Z i Z–A po polsku (Ł po L, „test 2” przed „Test 10”, bez wielkości liter), od
  najnowszych i najstarszych (ta sama data – po nazwie, bez daty – na końcu), oryginalna lista bez
  zmian; wybór z ustawień (domyślnie ręcznie, nieznana wartość – ręcznie, dziedziny bez daty);
  nowa kolejność po przeniesieniu elementu w górę i w dół.
- **Testy w przeglądarce (Chromium): 130 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (128 wcześniejszych + 2 nowe; wcześniejsze testy zmiany kolejności strzałkami i utrwalonych
  na końcu listy przechodzą bez zmian). Nowe testy:
  - ekran telefonu, dziedziny: menu kolejności (trzy pozycje, bez daty, zaznaczona bieżąca);
    A–Z (Analiza, Business English, Ćwiczenia, Ekonomia 2, Ekonomia 10, Metrology, Zoologia), po
    ponownym otwarciu nadal A–Z, Z–A, ręczna kolejność zapisana bez zmian, wybór w kopii zapasowej;
    „Ustaw ręcznie – przeciągnij…” – kolejność ręczna, uchwyt w każdym wierszu; **przeciągnięcie
    palcem** za uchwyt z czwartego miejsca na pierwsze (w trakcie: wiersz uniesiony, idzie za
    palcem, pierwszy wiersz zrobił miejsce, strona się nie przewinęła), zapis od razu; krótkie
    przeciągnięcie w dół – o jedno miejsce; po ponownym otwarciu kolejność zostaje;
  - ekran komputera, lekcje i moduły: menu lekcji (pięć pozycji), od najnowszych, od najstarszych,
    A–Z; utrwalona lekcja na końcu po posortowaniu; moduły – osobny wybór (Z–A), lekcje go nie
    zmieniają; „Zmień kolejność lekcji” z menu „…” przełącza na ręczną; **przeciągnięcie myszą**
    za uchwyt na górę; myszą za wiersz daleko w dół – zatrzymuje się nad utrwaloną; utrwalona sama
    w swojej grupie – przeciągnięcie nic nie zmienia; kliknięcie wiersza bez ruchu – nic; po
    ponownym otwarciu kolejność zostaje.
- **Lint: bez błędów.**
- Zrzuty (Chromium): menu kolejności i lista A–Z na telefonie, przeciąganie na telefonie i na
  komputerze, menu kolejności lekcji, lekcje A–Z z utrwaloną na końcu.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** – testy działają w Chromium z ekranem telefonu (dotyk udawany
  zdarzeniami przeglądarki), nie w Safari na iOS. Do sprawdzenia u Ciebie: czy przytrzymanie
  uchwytu ≡ nie przewija strony i nie zaznacza tekstu, wyczucie przeciągania palcem i Apple Pencil,
  samoczynne przewijanie długiej listy przy krawędzi ekranu.
- **Windows z rysikiem** – nie sprawdzano (mysz – tak, w Chromium).
- Przewijanie przy krawędzi ekranu nie ma osobnego testu (krótkie listy w testach mieszczą się na
  ekranie).
