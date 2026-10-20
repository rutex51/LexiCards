# LexiCards 1.25 – jednostki wymiarów, odchyłki w ramce tolerancji, tabela pasowań

Wersja 1.25.0, 20 października 2026. Uwagi z iPhone'a do wymiarów technicznych i symboli metrologicznych
(1.22.1) oraz do paneli edytora rysunku. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja
rysunków – „Od 1.25”).

## Co doszło i co poprawiono

| Prośba | Jak jest zrobione |
| --- | --- |
| Przy tolerowaniu metrologicznym domyślnie mm i bez jednostki przy liczbach; jednostka w rogu jako adnotacja rysunku | Pierwsza tolerancja albo pierwszy znak przed liczbą (okno **±** przy polu długości) na rysunku z liczbami „5 cm” przełącza rysunek na **liczby bez jednostki w mm** – od razu, więc pola okna są już w mm; **Anuluj** w oknie – rysunek zostaje jak był. To samo po wstawieniu (albo poprawie) **ramki tolerancji**. Po zapisie komunikat „Wymiary w mm – liczby bez jednostki…”. Jednostka jest w oznaczeniu **„Wymiary w mm”** w **lewym dolnym rogu** rysunku – w edytorze i na obrazie w notatce; tylko gdy na rysunku są wymiary długości albo ramki tolerancji. |
| Możliwość wymiarowania w innych jednostkach, np. w cm | Liczby bez jednostki w **mm, cm, m albo calach** – wybór w panelu linijki (dotknij kąta linijki; **Bez jednostki „50”** → **Jednostka liczb bez jednostki**) i w oknie tolerancji (**Jednostka liczb wymiarów (cały rysunek)**). Oznaczenie zmienia się na „Wymiary w cm”, „Wymiary w m”, „Wymiary w calach”. Liczby z jednostką („5 cm”) – jak dotąd. **Tolerancje długości są zapisane w mm**, więc zmiana jednostki ich nie psuje: 0,1 mm to przy cm 0,01 (wpisane w oknie liczby też się przeliczają). Rysunki zrobione wcześniej (tolerancje w jednostce liczby) są przeliczane przy otwarciu. |
| Odchyłki również w ramce tolerancji | Okno ramki tolerancji: przełącznik **Odchyłki po tolerancji** i pola **Górna**, **Dolna** (ze znakiem z przycisku +/−); na ramce – małe liczby, górna nad dolną, za tolerancją (przed Ⓜ/Ⓛ), jak przy liczbie wymiaru. Etykieta pola pokazuje jednostkę („Tolerancja (mm)”). Wartości w ramce zostają takie, jak je wpisałeś (zmiana jednostki rysunku ich nie przelicza – ramka to napis). |
| Na iPhonie przy odchyłkach z klawiatury nie da się wpisać + i − | Przed każdym polem odchyłki (wymiar i ramka) jest przycisk **+ / −** – dotknięcie zmienia znak; domyślnie górna +, dolna −. Klawiatura liczb zostaje (z przecinkiem); znak wpisany z klawiatury sprzętowej przechodzi na przycisk. |
| Cała tabela pasowań, ale w oknie tylko kilka ostatnich | W oknie tolerancji (Pasowanie) widać **6 ostatnio użytych** (na początek: H7, h6, H7/g6, H7/k6, g6, H8) i **Tabela pasowań…** – okno **Tabela pasowań (ISO 286)**: pasowania zalecane według **zasady stałego otworu** i **stałego wałka** oraz inne często używane, każde w grupach **luźne / mieszane / ciasne** (dotknięcie wybiera), a niżej **dowolna klasa tolerancji albo pasowanie**: Otwór / Wałek / Pasowanie, litera położenia pola (A–ZC, a–zc, w tym JS, js, CD…) i klasa dokładności IT01–IT18, podgląd („Wybrane: K7/js5”) i **Wybierz**. Użyte pasowanie trafia na początek ostatnich (na tym urządzeniu). Odchyłki graniczne z tablic ISO 286 nie są liczone – to tylko zapis klasy. |
| Okno (panel) musi dać się zamknąć – na iPhonie panel Kształty zakrywa stronę i trzeba celować w jej skrawek | Każdy panel pod paskiem (pióro, zakreślacz, kolor, kształty, liniuszek, tło, linijka, ustawianie szablonu) ma w nagłówku przycisk **✕**; nagłówek zostaje u góry także przy przewijaniu panelu. |

Przy okazji: tytuł okna tolerancji jest krótszy („Szerokość – tolerancja”), żeby na telefonie nie
nachodził na „Gotowe”.

## Testy, które wykonano

- **Testy logiki (Node.js): 351 – wszystkie zaliczone** (347 wcześniejszych + 4 nowe):
  - jednostki: format liczb rysunku, liczba wymiaru w mm, cm, m i calach z tolerancją w mm
    („50 +0,1/−0,05”, „5 +0,01/−0,005”, „0,05 +0,0001/−0,00005”, cale), liczby „5 cm” z tolerancją w cm,
    kąt w stopniach, mnożniki, oznaczenie („Wymiary w mm”, „Wymiary w calach”), kiedy jest oznaczenie;
  - format 10: przeliczenie tolerancji starszych rysunków (cm – ×10, styl „50” – bez zmian, cale –
    ×25,4, metry – ×1000), format 10 bez zmian, jednostka zapisana tylko przy stylu bez jednostki;
  - ramka tolerancji: odchyłki obie albo żadna, górna nie mniejsza od dolnej, napisy ze znakiem,
    szerokość pola;
  - pasowania: litery i klasy IT, rozpoznanie klasy i pasowania, wszystkie pasowania zalecane poprawne,
    ostatnio użyte (na początku, bez powtórzeń, 6), ustawienia na urządzeniu.
- **Testy w przeglądarce (Chromium): 166 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (164 wcześniejsze + 2 nowe):
  - ekran telefonu, zdarzenia palca: panel Kształty zamknięty przyciskiem ✕; prostokąt 11,8 × 4 cm;
    okno tolerancji – pola w mm, Anuluj – pole wymiaru znów w cm; odchyłki 0,1 i 0,05 bez znaków –
    „118 +0,1 / −0,05”, przycisk znaku górnej → błąd „Odchyłka górna nie może być mniejsza od dolnej”;
    jednostka cm w oknie – pola 0,01 i 0,005, podgląd „11,8 +0,01 / −0,005”, z powrotem mm; zapis –
    komunikat „Wymiary w mm”, pole w mm; pasowanie: 6 ostatnich i „Tabela pasowań…”, H7/k6 z tabeli,
    potem H7/k6 pierwsze wśród ostatnich, z budowania K7/js5; zapis: styl bez jednostki, mm, tolerancje
    w mm, na obrazie w notatce oznaczenie w lewym dolnym rogu;
  - ekran komputera: ramka tolerancji z odchyłkami (+0,02, dolna 0,01 z domyślnym −), etykieta
    „Tolerancja (mm)”, po wstawieniu – „Wymiary w mm”; panel linijki: jednostka cm – pole szerokości
    „5” cm, panel zamknięty ✕; zapis: jednostka cm, ramka 0,1 +0,02/−0,01 z bazą A, oznaczenie na obrazie.
- **Lint: bez błędów.**
- Zrzuty (Chromium, ekran telefonu): okno odchyłek z przyciskami znaku, tabela pasowań, panel ✕;
  ramka z odchyłkami (komputer).

## Czego nie sprawdzono

- **Safari na iPhonie** – przyciski znaku i klawiatura liczb sprawdzone w Chromium z ekranem telefonu;
  wygląd klawiatury iOS (przecinek) i zachowanie przycisku przy otwartej klawiaturze – do sprawdzenia
  u Ciebie.
- **Rysunki z tolerancjami zrobione wcześniej** – przeliczenie do mm sprawdzone w testach logiki, nie na
  Twoich rysunkach; warto otworzyć jeden z nich i sprawdzić liczby.
- Odchyłki graniczne z tablic ISO 286 (np. ⌀50 H7 → +0,025/0) nie są liczone – mogę to zaproponować
  osobno (trzeba wpisać tablice normy i sprawdzić je z Tobą).
