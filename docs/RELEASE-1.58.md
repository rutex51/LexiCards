# LexiCards 1.58 – pierścienie na grzbiecie, odsuwanie zeszytu, kółko narzędzi o stałym promieniu

Wersja 1.58.0, 30 października 2026. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja „Pierścienie, odsuwanie
zeszytu, kółko narzędzi o stałym promieniu”).

## Co się zmieniło

| Funkcja | Jak działa |
| --- | --- |
| **Pierścienie zamiast spirali** | Grzbiet kartki jak w zeszycie na drucie podwójnym: co kratkę prostokątna, ciemna dziurka (z jaśniejszym brzegiem – grubość kartki), a w niej dwa druty. Każdy drut to zamknięta pętla na wspólnej osi przy lewej krawędzi: wychodzi z dziurki, wygina się nad krawędzią w lewo (połysk, cień na kartce) i wraca pod kartką (widać ją tylko za krawędzią). Pierścienie stoją na miejscu przy przewracaniu kartki (płat przechodzi nad nimi, jak nad spiralą); obraz rysunku w notatce, wycinek i „Osadź” – bez nich. |
| **Odsuwanie zeszytu** | Stronę można przesunąć dalej niż dotąd – palcem (gdy rysuje tylko rysik), dwoma palcami, wciśniętym kółkiem myszy albo kółkiem myszy (przy jednej kartce) – aż dowolna krawędź kartki dojdzie do środka ekranu. Np. dolny brzeg kartki można podnieść do połowy ekranu i rysować przy nim wyżej. Dalej strona się nie przesuwa. „100%” i przejście na inną kartkę – strona znów na swoim miejscu; przewracanie z odsuniętej strony zaczyna się od widoku całej strony. |
| **Kółko narzędzi – stały promień** | Poprawka 1.57: okrąg małych kółek ma znów stały promień (84 px, telefon 62 px). Odstęp daje kąt między widocznymi kółkami: co 45° – co najmniej 18 px (telefon: co ok. 50° – 12 px). Gdy grup jest więcej, niż mieści się tak na okręgu (domyślnie 11 po prawej), kółka za wycinkiem – tam, gdzie ich nie widać – są ściśnięte; obrót wprowadza je do wycinka i tam rozsuwają się na zwykły odstęp. Przeciąganie: kółko pod palcem idzie za palcem. Kółko przesunięte na środek ekranu pokazuje tyle kółek, ile mieści się z odstępem (przy 12 – pięć w pełni i dwa zanikające), reszta czeka ściśnięta. |

## Własność intelektualna

Grzbiet na pierścieniach (drut podwójny) to ogólny wygląd zeszytu; rysunek własny z prostych kształtów (prostokąt, elipsa,
pasma połysku), bez obrazów i bibliotek. Przesuwanie widoku i rozkład kółek na okręgu – własny kod. Nazwy opisowe.

## Testy, które wykonano

- **Testy logiki (Node.js): 539 – wszystkie zaliczone**; test kółka z 1.57 przepisany na nową zasadę: dla promieni 84 i 62 px
  oraz 2, 5, 8, 9, 11 i 12 kółek, przy krawędzi i na środku ekranu, w każdym położeniu obrotu (co 1°) – promień bez zmian,
  odstęp między widocznymi kółkami co najmniej 18 / 12 px, widać co najmniej 3 kółka; przy 11 kółkach – sąsiednie co 45°,
  dalsze ściśnięte.
- **Testy w przeglądarce (Chromium): 256 – wszystkie zaliczone w dwóch pełnych przebiegach** na tym samym kodzie, w tym 2 nowe:
  - pierścienie (komputer): 3 dziurki – ciemne w środku i przy rogach, obok papier; w każdej z 24 dziurek dwa druty (pionowa
    linia przy osi przecina każdy pierścień 4 razy); zrzuty z bliska;
  - odsuwanie zeszytu (komputer): środkowym przyciskiem – dolna krawędź dokładnie na środku ekranu i ani piksela wyżej, kreska
    przy dolnym brzegu kartki, kółko myszy przesuwa z powrotem, „100%” i nowa kartka – na środku.
  - Zmienione, bo opisywały dawny wygląd albo zachowanie: spirala 1.24.1, 1.25.1 i 1.35 (położenie drutu, ciemna prostokątna
    dziurka, drut kończy się w dziurce), kółko 1.57 (stały promień, odstęp widocznych, ściśnięte za wycinkiem), kółko 1.39 na
    środku ekranu (5 kółek w pełni zamiast wszystkich), palec przy rysiku (strona się przesuwa, „100%” wraca), znacznik
    w teście dwóch palców – czerwony (dziurki są teraz ciemne jak tusz).
- **Lint: bez błędów.**
- Zrzuty (Chromium): pierścienie, pierścienie z bliska, zeszyt odsunięty w górę, kółko narzędzi.

## Czego nie sprawdzono i ograniczenia

- **Safari na iPhonie i iPadzie**, prawdziwy palec i rysik – dotyk udawany zdarzeniami Chromium. Odsuwanie palcem i dwoma
  palcami sprawdzone tylko pośrednio (ta sama funkcja co przesuwanie myszą); testy przesuwają stronę środkowym przyciskiem
  i kółkiem myszy.
- Pierścienie przy dużym powiększeniu i na ekranie Retina oglądane tylko na zrzutach z Chromium.
- Przy jednej kartce kółko myszy w pionie przesuwa stronę także przy 100% (wcześniej nic nie robiło); przy kilku kartkach –
  jak dotąd przewraca kartki.
- Ciemny motyw.
