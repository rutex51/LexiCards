# LexiCards 1.57 – obraz na fiszce, kółko narzędzi, gumka przez kształty

Wersja 1.57.0, 30 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Obraz na fiszce, kółko
narzędzi, gumka przez kształty”).

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Obraz wypełnia fiszkę** | Strona fiszki z obrazem albo tabelą z notatki: tekst u góry, obraz zajmuje całą resztę strony (dopasowany bez przycinania), sygnatura i przyciski przewijania – na samym dole. Przy kilku obrazach sygnatura jest w wierszu przycisków („‹ Schemat 1 / 2 ›”), żeby obraz był większy. |
| **Pełny ekran** | Przycisk w prawym górnym rogu obrazu (cztery narożniki). Obraz przybliża się płynnie z miejsca na fiszce na środek ekranu, a cała reszta ciemnieje; pod obrazem jego sygnatura. Obraz zajmuje prawie cały ekran – w poziomie ekranu prawie całą wysokość. Tabela – powiększona kopia (dłuższa przewija się w środku). Dotknięcie gdziekolwiek, ✕ albo Esc – obraz wraca na fiszkę tą samą animacją. W tym czasie klawisze nauki (←, →, spacja) nic nie robią, a fiszka się nie obraca. |
| **Odstępy na kółku narzędzi** | Gdy grup jest wiele (domyślnie 11 po prawej), okrąg małych kółek jest większy – między kółkami jest co najmniej 18 px (na telefonie 12 px). Przy kilku grupach – bez zmian. |
| Edytor bez przesunięcia w bok | Kółka, które przy większym okręgu wystają poza krawędź ekranu, są przycięte – fokus na takim kółku (np. z klawiatury) nie przewija już całego edytora w bok. |
| **Wybór grupy jednym kliknięciem** | Kliknięcie myszą w małe kółko poza środkiem wycinka (np. u góry) od razu wybiera grupę – wcześniej pierwsze kliknięcie tylko obracało kółko i trzeba było kliknąć drugi raz. Klawiatura (Tab) dalej obraca grupę z fokusem na środek wycinka. |
| **Gumka „Zaznaczenie”** | Trzeci tryb gumki obok „Całe kreski” i „Fragmenty”, z wyborem **prostokąt** albo **lasso**. Obrys jest czerwony i kreskowany; po puszczeniu znika wszystko w środku: kreski – cięte dokładnie na brzegu obszaru; kształt, odcinek, strzałka, okrąg, wymiar, bryła, szyk albo diagram, przez który przechodzi obszar – zamieniony na zwykły szkic piórem bez środka; pola tekstowe, wzory, tabele, karteczki i symbole – tylko gdy leżą w obszarze w całości. Obszar w pustym środku kształtu (bez jego linii) nic nie zmienia. Jeden krok cofania. |
| **„Także kształty”** | Opcja gumki **Fragmenty**: ściera wtedy także fragmenty kształtów, odcinków i brył – dotknięty element staje się szkicem piórem i traci starty kawałek. Bez opcji – jak dotąd (kształty zostają). |
| Stuknięcie w fiszkę | Krótkie dotknięcie palcem obraca fiszkę już przy podniesieniu palca, a nie dopiero po zdarzeniu „click” przeglądarki. W teście gestów (dotyk udawany w Chromium) po przesunięciu fiszki przeglądarka czasem w ogóle nie wysyłała „click” – fiszka się nie obracała (ok. 1 raz na 60 przebiegów, częściej przy obciążonym procesorze; zdarzało się już przed 1.56). Tak samo od dawna działają przyciski aplikacji (obejście błędu Safari w iOS 26, który gubi pierwsze dotknięcie). Przyciski na fiszce (pełny ekran, przewijanie obrazów) – bez zmian. |
| Szkic piórem | Linie elementu w jego kolorze i grubości, na jego warstwach: obrys, zakończenia odcinka (grot, trójkąt, koło), kreskowanie, osie, linie wymiarów; bryła – krawędzie widoczne i niewidoczne obrazka oraz osie. Narożniki zostają ostre. Napisy (liczby wymiarów, tekst kształtu, napisy diagramu), wypełnienie i rodzaj linii (przerywana, osiowa) znikają – szkic jest ciągłą kreską. |

## Własność intelektualna

Powiększanie obrazu z animacją, wycinanie obszarem i gumka to ogólne funkcje programów do rysowania i przeglądarek
obrazów; kod własny (animacja FLIP – przesunięcie i skala elementu – to podręcznikowa technika interfejsu), bez bibliotek
i zewnętrznych usług. Cięcie kresek wzdłuż obrysu – ten sam własny kod co zaznaczanie fragmentów z 1.14. Nazwy opisowe.

## Testy, które wykonano

- **Testy logiki (Node.js): 539 – wszystkie zaliczone**, w tym 5 nowych: ustawienia gumki (tryb, prostokąt/lasso,
  „Także kształty”, złe wartości); szkic prostokąta (zamknięty obrys, kolor, grubość, warstwy, ostre narożniki, gęste
  punkty) i odcinka ze strzałką; gumka obszarem (kreska cięta na brzegu, prostokąt → szkic bez punktów w obszarze,
  odcinek poza obszarem i pole tekstowe bez zmian, pusty środek prostokąta – bez zmian, wszystko w obszarze – znika,
  ukryta warstwa – bez zmian); gumka fragmentów przez odcinek i bryłę (krawędzie widoczne, niewidoczne, osie);
  promień kółka narzędzi (odstęp ≥ 18 px przy 2, 8, 9, 11 i 12 kółkach; przy 4 – promień bez zmian).
- **Testy w przeglądarce (Chromium): 254 – wszystkie zaliczone w dwóch pełnych przebiegach** na tym samym kodzie,
  w tym 6 nowych:
  - kółko narzędzi (komputer): odstępy między małymi kółkami ≥ 17,5 px przy ponad 8 kółkach; wciśnięcie myszy na kółku
    poza środkiem wycinka, chwila, puszczenie – grupa wybrana od razu; Tab – fokus obraca grupę na środek;
  - gumka „Zaznaczenie” (komputer): prostokąt przez kreskę pióra i prostokąt – w obszarze pusto (piksele), poza nim
    linie zostają, prostokąt zamieniony na szkic, jeden krok **Cofnij**/**Ponów**; lasso – narożnik; „Fragmenty” bez
    opcji nie rusza odcinka, z „Także kształty” – ściera jego fragment; zapisany rysunek bez kształtów, z kreskami pióra;
  - gumka na telefonie: wybory „Zaznaczenie”, prostokąt/lasso i „Także kształty” mieszczą się na ekranie;
  - obraz na fiszce (komputer): ramka obrazu – ponad 55% wysokości strony, przyciski na dole, sygnatura w wierszu przycisków;
    pełny ekran – obraz ≥ 95% wysokości ekranu (bez miejsca na podpis), ciemne tło, obraz na fiszce ukryty, ← nic nie
    robi, zamykanie ✕, Esc i dotknięciem tła; tabela w pełnym ekranie;
  - telefon w poziomie (844 × 390, dotyk): pełny ekran prawie na całą wysokość, dotknięcie oddala.
  - Istniejący test gestów fiszki („stuknięcie po przeciągnięciu obraca fiszkę”) przed poprawką stuknięcia zawodził
    rzadko: 1 na 20 prób na tym kodzie, 1 na 20 na 1.56.2, 0 na 20 na 1.55, 0 na 40 z logiem zdarzeń; pod sztucznym
    obciążeniem procesora – w 7. i w 4. próbie. Log: pointerdown, pointerup i touchend dochodzą, click i zdarzenia myszy
    – nie (Chromium nie zamienił dotknięcia na stuknięcie). Ten sam błąd był już w pełnym przebiegu 19.10.2026 (dużo
    przed 1.56). Po poprawce: 0 na 40 prób pod tym samym obciążeniem, wszystkie 30 testów fiszek i oba pełne przebiegi
    – zaliczone.
- **Lint: bez błędów.**
- Zrzuty (Chromium): kółko narzędzi z odstępami, gumka obszarem (w trakcie i po), gumka „Także kształty”, gumka na
  telefonie, obraz wypełniający fiszkę, pełny ekran (w trakcie animacji i po), tabela w pełnym ekranie, telefon
  w poziomie.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – dotyk udawany zdarzeniami Chromium. Animacja powiększenia
  nie była oglądana na urządzeniu.
- Zamiana na szkic jest nieodwracalna poza **Cofnij** – szkic nie wraca do kształtu (bez uchwytów, wymiarów, wypełnienia).
- Prosta (przez całą stronę) zamieniona na szkic to bardzo długa kreska – jak prosta wychodzi poza kartkę.
- Szkic linii przerywanej i osiowej jest ciągły.
- Pełny ekran: bez przybliżania dwoma palcami w środku i bez przechodzenia do następnego obrazu (to – przyciski na fiszce).
- Ciemny motyw.
