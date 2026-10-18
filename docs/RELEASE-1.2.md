# LexiCards 1.2 – postęp na listach i lekcje utrwalone

Wersja 1.2.0, 19 października 2026. Listy modułów i lekcji pokazują postęp nauki, a lekcję
albo moduł można ręcznie oznaczyć jako utrwalone – wtedy fiszki wracają rzadko. Ikony dziedzin
mają szare tło. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcje „Dane”, „Zapis zmian”,
„Powtórki (FSRS)”, „Statystyki”, „Kopia zapasowa”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Szare tło w dziedzinach, z zostawionym wyborem | Ikony dziedzin mają szare tło – nowe dziedziny, dane przykładowe i istniejące dziedziny (przestawione jeden raz przy pierwszym otwarciu wersji 1.2). Kolor nadal wybierzesz w edycji dziedziny i ten wybór zostaje |
| Mini znacznik postępu po lewej, dla lekcji i modułu (wariant C) | Pionowy pasek po lewej w wierszu i opis „opanowane N%” pod nazwą: część pojęć ze statusem „Opanowane” z fiszek, w kierunku wybranym w Statystykach. Moduł liczy wszystkie pojęcia swoich lekcji |
| Ręczna, twardsza ocena lekcji i modułu – „utrwalona” | Menu „…” lekcji: **Oznacz jako utrwaloną**; modułu: **Oznacz jako utrwalony** (oznacza wszystkie jego lekcje). Na ekranie lekcji wiersz „Lekcja utrwalona” z datą i przyciskiem **Cofnij**; cofnięcie także w menu „…” |
| Moduł bez oceny – według lekcji | Moduł jest utrwalony, gdy wszystkie jego lekcje są utrwalone; wtedy jego pojęcia w lekcjach utrwalonych liczą się w pasku jako opanowane |
| Delikatna zielona poświata, nasycenie zmniejszone | Wiersz utrwalonej lekcji albo modułu ma lekki zielony gradient i obwódkę, pasek pełny, opis „utrwalona” / „utrwalony” na zielono – w jasnym i ciemnym motywie |
| „Opanowane” z fiszek po staremu | Bez zmian: status „Opanowane” po przeciągnięciu fiszki i powtórki FSRS działają jak w 1.1 |
| Rzadkie powtórki materiału utrwalonego, okres w Ustawieniach | **Ustawienia → Powtórki → Lekcje utrwalone**: co miesiąc (domyślnie), co 2 miesiące, co 3 miesiące, co pół roku, raz w roku. Fiszka wraca najwcześniej po tym czasie od oznaczenia albo od ostatniej powtórki; gdy FSRS wyznaczył termin jeszcze późniejszy, zostaje ten. Fiszka, której przy powtórce nie pamiętasz, wraca według zwykłego FSRS, dopóki znów jej nie opanujesz. Pojęcia lekcji utrwalonej nie trafiają do zakresu „Nowe” |
| Zmiana w lekcji/module zdejmuje status, nowa fiszka jako nowa | Nowe pojęcie w lekcji (dodane, przeniesione z innej lekcji, skopiowane, z importu) zdejmuje oznaczenie lekcji; nowa lekcja w module (dodana, przeniesiona, z importu) – oznaczenie modułu. Pojawia się komunikat, np. „Lekcja „Investments” nie jest już utrwalona – doszło nowe pojęcie.” Dodane pojęcie zaczyna jako nowe. Edycja i usunięcie pojęcia oraz zmiana notatki statusu nie zmieniają |
| Notatka z fiszki (punkt 4) | Bez zmian, zgodnie z Twoją decyzją – przycisk notatki w sesji fiszek z wersji 1.1 zostaje |

Dodatkowo: kreator importu w kroku **Zatwierdź import** wymienia lekcje i moduły, które przestaną
być utrwalone, a wynik importu mówi, z ilu zdjęto utrwalenie (kilka naraz – jeden zbiorczy
komunikat zamiast serii). Kopia zapasowa przenosi daty utrwalenia i okres z Ustawień; kopia z wersji
1.1 po przywróceniu też dostaje szare tła dziedzin.

## Testy, które wykonano

- **Testy logiki (Node.js): 218 – wszystkie zaliczone** (212 wcześniejszych + 6 nowych): oznaczanie
  lekcji i modułu, moduł utrwalony z lekcji, pusty moduł; terminy powtórek (fiszka nieoceniana,
  późniejszy termin FSRS, pomyłka po oznaczeniu, opanowanie po oznaczeniu, zmiana okresu), zakresy
  „Nowe” i „Do powtórki”, liczba do powtórki; zdejmowanie statusu przy dodaniu, przeniesieniu,
  kopiowaniu pojęcia i przy nowej lekcji, brak zmiany przy edycji i usunięciu, przeniesienie lekcji
  między modułami, komunikaty dla interfejsu; import (plan, wynik, aktualizacja bez zdejmowania);
  procent opanowania lekcji i modułu; szare tła po aktualizacji (także baza bez zapisanych ustawień
  i kopia z 1.1), kolor wybrany po aktualizacji zostaje, niepoprawna data w kopii.
- **Testy w przeglądarce (Chromium, ekran telefonu): 85 – wszystkie zaliczone w dwóch przebiegach**
  (80 wcześniejszych + 5 nowych): pasek i „opanowane N%” na listach lekcji i modułów, oznaczenie
  z menu, poświata, moduł utrwalony z lekcji, cofnięcie, pusta lekcja; zdjęcie statusu po dodaniu
  pojęcia i nowej lekcji z komunikatem, wiersz „Lekcja utrwalona” i „Cofnij”, trwałość po
  przeładowaniu; nauka z zegarem przesuniętym o 11 minut i o miesiąc, przy okresie 2 miesiące
  i miesiąc – fiszki lekcji utrwalonej wracają po okresie z Ustawień, termin w szczegółach
  pojęcia, zakresy nauki; szare tła
  po aktualizacji i kolor wybrany potem; ostrzeżenie w kreatorze importu.
- Zrzuty ekranu: listy lekcji i modułów oraz ekran lekcji w jasnym i ciemnym motywie; Ustawienia,
  kafelki dziedzin i krok „Zatwierdź import” w jasnym.

## Czego nie sprawdzono

- **Na iPhonie** – testy działają w Chromium z ekranem telefonu, nie w Safari na iOS. Do
  sprawdzenia u Ciebie: wygląd paska i poświaty na ekranie telefonu, komunikaty po dodaniu pojęcia.
- Rzadkie powtórki sprawdzono przesuwaniem zegara w teście; w prawdziwym użyciu pierwszy efekt
  zobaczysz po miesiącu.

## Warto wiedzieć

- W szczegółach pojęcia poziom z FSRS nadal ma nazwy „Utrwalane” / „Utrwalone” (od długości odstępu
  powtórek). To co innego niż ręczne „utrwalona” lekcji – jeśli będzie mylić, nazwy poziomów można
  zmienić.
- Pasek liczy kierunek wybrany w Statystykach (przełącznik „Kierunek”); przy „Oba kierunki”
  pojęcie jest opanowane, gdy jest opanowane w obu.
- Lekcja utrwalona, w której nie ćwiczyłeś jeszcze fiszek, też trafi do powtórki po okresie
  z Ustawień – od dnia oznaczenia.
