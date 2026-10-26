# LexiCards 1.53 – pomiary 3D w scenie

Wersja 1.53.0, 26 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Pomiary 3D”).

Czwarty etap planu „Wspólny układ osi, pełna scena 3D” (po 1.50 – układ arkusza, 1.51 – scena 3D, 1.52 – położenie brył):
sprawdzanie odległości i kątów między bryłami w przestrzeni. Bryły się nie zmieniają; wynik zostaje w scenie jako wymiar
i idzie za bryłami, gdy się je przesuwa albo zmienia.

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Pomiar** | W pasku sceny przycisk **Pomiar** (suwmiarka). Potem dotknięcie dwóch **cech** brył – także na różnych bryłach. Panel na dole pokazuje, co dotknąć, pierwszą wybraną cechę („1: Środek ściany (Prostopadłościan)”) i wynik. Przeciągnięcie dalej obraca scenę. |
| Cechy | **Narożnik**, **środek ściany** (płaskiej – także środek wierzchu walca), **wierzchołek** stożka, **środek kuli** – punkty; **krawędź** prosta i **oś** (dotknięcie pobocznicy walca, stożka albo bryły obrotowej) – proste; **ściana** płaska – płaszczyzna. Punkty mają pierwszeństwo przed krawędziami, krawędzie przed ścianami; liczą się tylko cechy od strony patrzącego. Myszą – cecha pod kursorem podświetlona. |
| **Wyniki** | Punkt–punkt: **odległość** i **ΔX, ΔY, ΔZ** w układzie arkusza. Punkt–prosta, punkt–płaszczyzna: odległość prostopadła. Dwie proste, prosta i płaszczyzna, dwie płaszczyzny: **kąt** (0–90°, dwa miejsca po przecinku), a gdy są równoległe – **odległość** między nimi (znak ∥); dla prostych skośnych także najmniejsza odległość prostych. Liczby w mm przedmiotu w skali rysunku (jak współrzędne i wymiary; styl „5 cm” – jednostka skali). |
| **Wymiar w scenie** | Każdy pomiar zostaje: zaznaczone cechy (kropka, pogrubiona krawędź, zabarwiona ściana), odcinek pomiaru (kąt – przerywany) i liczba w ramce w kolorze pomarańczowym. Liczby nie zasłaniają się nawzajem. Pomiar **idzie za bryłami** – po przesunięciu strzałką, zmianie wysokości, obrocie wokół Z albo wymiarów liczy się od nowa. |
| Szczegóły i usuwanie | Dotknięcie liczby pomiaru (także poza trybem pomiaru) – panel z tytułem („Odległość”, „Kąt między płaszczyznami”…), cechami („Środek ściany (Prostopadłościan) → Oś (Walec)”), wynikiem i **Usuń pomiar**. |
| Esc i koniec | Esc najpierw porzuca wybraną pierwszą cechę, potem wskazany pomiar, potem kończy pomiar (drugie Esc z niczym – powrót do 2D jak dotąd). **Od nowa** – inna pierwsza cecha, **Zakończ pomiar** – koniec. |
| Cofanie i zapis | Dodanie i usunięcie pomiaru to krok cofania (**Cofnij** w scenie albo Ctrl/⌘ + Z). Pomiar jest zapisany w bryle pierwszej cechy (format rysunku **24**) – usunięta bryła zabiera swoje pomiary; pomiar do bryły, której nie ma, znika przy wczytaniu. Kopia samej bryły jest bez pomiarów, kopia obu brył – z pomiarem między kopiami. |

## Jak to działa (w skrócie)

- Moduł `js/core/measure3d.js`: cechy bryły z jej siatki – ściany siatki połączone krawędziami gładkimi to jedna ściana
  płaska (ta sama normalna) albo powierzchnia zakrzywiona (oś bryły); krawędzie proste – ostre krawędzie między dwiema
  ścianami płaskimi; narożniki – wierzchołki co najmniej dwóch krawędzi prostych w różnych kierunkach; środek ściany –
  środek ciężkości jej pola (otwory odjęte).
- Odnośnik do cechy zapisuje rolę, punkt i kierunek w układzie bryły; po zmianie bryły wybierana jest cecha tej samej roli
  i kierunku najbliższa zapisanej – stąd pomiar idzie za bryłą bez numerów wierzchołków.
- Pomiar liczy się w świecie sceny (położenie z 1.52), wzory: odległość punktów, rzut na prostą i płaszczyznę, kąt
  z iloczynu skalarnego, najbliższe punkty prostych skośnych.

## Własność intelektualna

Pomiar odległości i kątów między punktami, krawędziami, płaszczyznami i osiami to ogólna funkcja programów CAD i oprogramowania
maszyn pomiarowych od dziesięcioleci; wzory – podręcznikowa geometria analityczna. Kod własny, bez bibliotek. Nazwy w interfejsie
opisowe („Pomiar”, „Odległość”, „Kąt prostej z płaszczyzną”). Szczegóły – audyt IP (G61–G62).

## Testy, które wykonano

- **Testy logiki (Node.js): 515 – wszystkie zaliczone** (3 nowe):
  - cechy brył: prostopadłościan (8 narożników, 6 środków ścian, 12 krawędzi, 6 ścian, bez osi; środek wierzchu, krawędź
    długości a), walec (środki podstaw, oś, pobocznica – oś, bez krawędzi prostych), stożek ostry (wierzchołek, oś),
    ostrosłup (5 narożników, 8 krawędzi), kula (środek), wyciągnięty profil L (12 narożników, 8 ścian, 18 krawędzi),
    wyciągnięte koło (dwie podstawy, pobocznica bez cechy);
  - pomiary: środek wierzchu do środka wierzchu bryły uniesionej i obróconej – ΔX, ΔY, ΔZ i odległość; punkt–płaszczyzna;
    płaszczyzny równoległe (odległość) i przody pod kątem 30°; krawędź pionowa z wierzchem (90°) i z przodem (równoległa);
    krawędzie równoległe i pod kątem 30° (z najmniejszą odległością); narożnik od osi walca;
  - odnośniki: ten sam narożnik i ta sama ściana po wydłużeniu bryły, kula bez ściany; zapis w bryle – pomiar do walca stojącego
    na prostopadłościanie (ΔZ 120), format 24, pomiar do bryły, której nie ma – usunięty; zły zapis pominięty; granica 20
    pomiarów; usuwanie; kopie obu brył i samej bryły.
- **Testy w przeglądarce (Chromium): 239 – wszystkie zaliczone w dwóch pełnych przebiegach** (3 nowe):
  - komputer: prostopadłościan i walec, położenie obu z panelu; „Pomiar” – panel, bez strzałek i panelu położenia,
    7 widocznych narożników prostopadłościanu; środek wierzchu prostopadłościanu → środek wierzchu walca: „Odległość”,
    ΔX i ΔY zgodne z położeniem brył (±0,01 cm), ΔZ = 2 cm, odległość = √(ΔX² + ΔY² + ΔZ²); wierzch (ściana) i pobocznica
    walca (oś) – „Kąt prostej z płaszczyzną” 90,00°; Esc – bez pierwszej cechy, drugie Esc – koniec pomiaru (scena otwarta,
    pomiary zostają); prostopadłościan strzałką X dalej – po dotknięciu liczby pomiaru ΔX mniejsze o przesunięcie; „Usuń
    pomiar” – jeden, „Cofnij” – dwa; zapis – format 24, dwa pomiary w prostopadłościanie (środek–środek, ściana–oś), odnośnik
    do walca;
  - iPad (dotyk): środek wierzchu i narożnik palcem (kilka pikseli obok) – ΔX 3, ΔY 2, ΔZ 0 cm, 3,61 cm, liczba w scenie;
  - telefon (390 px): „Pomiar” w pasku bez przewijania, panel z wynikiem i „Zakończ pomiar” na ekranie, bez przewijania w bok,
    po zakończeniu pomiar zostaje.
- Testy 1.52 z poprawką: zapis sprawdza format 23 albo nowszy.
- **Lint: bez błędów.**
- Zrzuty (Chromium): pierwsza cecha, odległość, kąt, pomiar po przesunięciu bryły, iPad, telefon.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec – dotyk udawany zdarzeniami Chromium.
- Pomiary są tylko w scenie – nie na kartce 2D, w PDF ani w DXF.
- Cechy powierzchni zakrzywionych: tylko oś walca, stożka i bryły obrotowej (bez okręgu krawędzi, średnicy i powierzchni
  wyciągniętego łuku). Środek okręgu podstawy walca – jako środek ściany.
- Kąty 0–90° (kąt między prostymi i płaszczyznami, bez kierunku); bez tolerancji i porównania z wymiarem nominalnym.
- Po dużej zmianie bryły (np. inna liczba boków graniastosłupa) pomiar może przejść na sąsiednią cechę tej samej roli.
- Cechy zasłonięte przez inną bryłę (np. stojącą przed nią) da się wskazać, jeśli są od strony patrzącego.
- Ciemny motyw.
