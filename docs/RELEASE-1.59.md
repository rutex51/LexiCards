# LexiCards 1.59 – tablica A0 i rulon

Wersja 1.59.0, 30 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Tablica A0”).

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Tablica A0** | Kartka rysunku może być dużym arkuszem zamiast kartki zeszytu: menu **Kartki** (pigułka „Kartka 1 z 2”) → **Zamień na tablicę A0** albo **Nowa tablica A0**. Tablica nie wygląda jak zeszyt (bez pierścieni, szara rama) i nie jest ograniczona wielkością kartki: jest cztery razy szersza i wyższa (gdy kartka to A4 – wymiary A0, proporcje √2). Po otwarciu widać ją całą; powiększenie sięga cztery razy dalej niż przy kartce. |
| **Obszar kartki** | Kartka zeszytu leży w lewym górnym rogu tablicy – niebieska przerywana ramka „Obszar kartki zeszytu”. Rysunek po zamianie zostaje na swoim miejscu (w obie strony). |
| **Powrót do zeszytu** | **Zamień na kartkę zeszytu** – tylko gdy cały rysunek mieści się w ramce obszaru kartki. Inaczej pozycja menu mówi „rysunek wychodzi poza ramkę”, a po jej wybraniu komunikat wyjaśnia, że zamiana jest niemożliwa; tablica zostaje bez zmian. |
| **Tablica w notatce** | Obraz w notatce to obszar z rysunkiem (z marginesem jednej kratki), w proporcjach kartki, co najmniej wielkości kartki (mały rysunek nie jest powiększany), przeskalowany do wielkości obrazu kartki zeszytu. Pusta tablica – obszar kartki. Rysunek do poprawy zostaje tablicą („Edytuj rysunek” otwiera całą tablicę). |
| **Rulon przy przejściu** | Opuszczana tablica (następna albo poprzednia kartka) zwija się w rulon od prawego dolnego rogu: płaska część zostaje, przy linii zwijania – coraz grubszy walec z odwrotu papieru, z cieniem na tym, co pod spodem; pod spodem odsłania się następna kartka (zeszyt z pierścieniami albo inna tablica). Przejście z zeszytu na tablicę – tablica rozwija się z rulonu od lewego górnego rogu nad zeszytem. Między kartkami zeszytu – przewracanie jak dotąd. Ok. 1,1 s; przy ograniczonym ruchu – bez animacji. |

Format rysunku 27 (nowe pole `board`); starsza wersja aplikacji otworzy tablicę jako bardzo dużą kartkę zeszytu.

## Własność intelektualna

Duży arkusz, zwijanie w rulon i kadrowanie obrazu do obszaru z rysunkiem to ogólne funkcje i efekty interfejsu; kod własny
(rysunek walca gradientem wzdłuż przekątnej, granice kresek – kod z 1.12.1), bez bibliotek. Nazwy opisowe.

## Testy, które wykonano

- **Testy logiki (Node.js): 541 – wszystkie zaliczone**, w tym 2 nowe: wymiary A0 (4 × kartka, proporcje √2), zamiana
  w miejscu i z powrotem (kreski na miejscu, zapis i odczyt tablicy, kreski daleko na tablicy nie są przycinane), blokada
  powrotu przy rysunku poza obszarem kartki, kreska przy samym brzegu kartki – mieści się, zdjęcie – bez tablicy; obszar
  obrazu do notatki (pusta tablica – kartka, mały rysunek – wielkość kartki wokół niego, duży – z marginesem w proporcjach
  kartki, przy brzegu – w obrębie tablicy, na całą tablicę – cała szerokość). Format rysunku 27 – sprawdzenia wersji
  w 7 starszych testach logiki i 1 teście przeglądarki zaktualizowane.
- **Testy w przeglądarce (Chromium): 258 – wszystkie zaliczone w dwóch pełnych przebiegach** na tym samym kodzie, w tym 2 nowe:
  - tablica (komputer): zamiana – proporcje A0, mniejsza skala, bez pierścieni, kreska na miejscu; kreska daleko poza
    obszarem kartki – pozycja menu „wychodzi poza ramkę”, komunikat, tablica zostaje; po „Cofnij” – znów kartka zeszytu
    w tej samej skali, z pierścieniami; obraz w notatce 1600 × 1100 z obiema częściami rysunku, pusto między nimi, rysunek
    do poprawy zostaje tablicą 6400 jednostek;
  - rulon (komputer, zatrzymany czas): z tablicy na kartkę – w połowie prawy dolny róg tablicy odsłonięty, lewy górny jeszcze
    tablica, pod spodem kartka z czerwoną kreską, potem pierścień przy dolnym brzegu odsłonięty; z kartki na tablicę –
    w połowie zeszyt widać przy prawym dolnym rogu, lewy górny róg i dziurka przy górze zakryte tablicą.
- **Lint: bez błędów.**
- Zrzuty (Chromium): tablica z rysunkiem poza ramką, zwijanie i rozwijanie w połowie, obraz tablicy w notatce.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – dotyk udawany zdarzeniami Chromium. Animacja rulonu oglądana
  tylko na zrzutach z Chromium (zatrzymany czas); płynność na urządzeniu nie była sprawdzana.
- Zamiana kartka ↔ tablica nie jest krokiem **Cofnij** (odwraca ją druga zamiana).
- Ramka rysunkowa i układ kartki na tablicy rozciągają się na całą tablicę.
- Przy całej tablicy na ekranie kratka jest gęsta, a cienkie kreski – bardzo cienkie; do rysowania szczegółów trzeba powiększyć.
- Rysunek wypełniający całą tablicę: obraz w notatce ma proporcje kartki, więc kilka procent wysokości tablicy (pas przy
  górnym lub dolnym brzegu) może się w nim nie zmieścić.
- Ciemny motyw.
