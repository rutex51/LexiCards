# LexiCards 1.29 – osobne okna edycji notatki, ołówek i oczko na miniaturach, podpowiedzi do schowania

Wersja 1.29.0, 21 października 2026. Pierwsza część uwag do notatek i okien (punkty 1, 5, 6, 7 i 8);
uwagi do rysowania (punkty 2–4 i 9–11) – w następnym wydaniu, dźwięki przewracania (punkt 12) – po wyborze
z propozycji. Opis budowy: [ARCHITECTURE.md](ARCHITECTURE.md) (sekcja treści notatki – „Od 1.29”).

## Co doszło

| Prośba | Jak jest zrobione |
| --- | --- |
| Sprytny przycisk w oknach, który chowa teksty pomocnicze | Obok tytułu okna (formularze, okna notatki) i w nagłówku panelu rysunku – **ⓘ**. Dotknięcie chowa opisy we **wszystkich** oknach naraz (także w tych otwartych później), drugie – pokazuje je z powrotem; wybór jest zapamiętany na urządzeniu (również po ponownym otwarciu aplikacji). Zostają zawsze: komunikaty o błędzie, postęp, informacja o pliku. Przycisk widać tylko w oknie, które ma podpowiedzi. |
| Edycja notatki w osobnym oknie, jak okno rysowania, z większym polem tekstu | **Edytuj** otwiera okno tekstu **na cały ekran** (jak edytor rysunku): pasek formatowania i pole tekstu na całą wysokość, na komputerze – kolumna na środku. Podgląd zostaje pod spodem – po **Zapisz** wraca odświeżony, po **Anuluj** – bez zmian (przy zmianach pytanie). |
| Opcja przejścia do załączników – jak obecne okno, ale bez sekcji notatki | **Spinacz z liczbą** obrazów, tabel i załączników – w podglądzie (obok głośnika) i w oknie tekstu. W podglądzie otwiera okno **Obrazy i załączniki** z **Anuluj / Zapisz**: obrazy, tabele, miejsce w podglądzie, numeracja, załączniki, na dole **Usuń notatkę** – bez tekstu. W oknie tekstu otwiera to samo okno nad tekstem z **Gotowe** (zapis – razem z tekstem). Obok spinacza w oknie tekstu – **mikrofon**: notatka głosowa nagrywa się w trakcie pisania, bez przechodzenia do załączników. Obraz wklejony do tekstu trafia do obrazów, a w tekście pojawia się jego odwołanie. |
| Miniatura – menu opcji; ołówek – od razu edycja | Dotknięcie miniatury – menu jak dotąd. **Ołówek** w rogu miniatury od razu otwiera edycję: rysunek – edytor rysunku, zdjęcie – rysowanie na zdjęciu, tabela – okno tabeli. |
| Oczko – czy obiekt trafia do notatki | **Oczko** w pasku sygnatury miniatury (obrazu, rysunku, tabeli): przekreślone – obiekt **ukryty w notatce**. Zostaje w oknie (przygaszony), ale podgląd, PDF, druk, „Kopiuj”, słuchanie notatki i eksport do arkusza go pomijają – razem z odwołaniem `[[sygnatura]]` w tekście (odwołanie zostaje w tekście, więc po włączeniu oczka obiekt wraca na swoje miejsce). To samo w menu miniatury: **Ukryj w notatce** / **Pokaż w notatce**. |
| Usunięcie rysunku, obrazu albo tabeli usuwa sygnaturę w notatce | Usunięcie (✕ albo menu) usuwa też linijki z odwołaniem `[[sygnatura]]` w **obu wersjach** tekstu (polskiej i angielskiej); komunikat mówi, że odwołanie zniknęło. „Nowa strona”, która została na początku albo końcu tekstu, też znika. |

Przy okazji: w zwykłym tekście kopiowanym przyciskiem **Kopiuj** nie ma już linijek `[[sygnatura]]` obrazów
(obraz jest w wersji z formatowaniem).

## Testy, które wykonano

- **Testy logiki (Node.js): 373 – wszystkie zaliczone** (369 wcześniejszych + 4 nowe): usunięcie
  odwołań (wielkość liter, odwołanie w zdaniu zostaje, nowa strona na brzegu znika); treść do pokazania
  (ukryty obraz i tabela pominięte z odwołaniami, sygnatury domyślne się nie przesuwają); zapis ukrycia
  (bez pola – zostaje, `false` – zdejmuje), kopia zapasowa; słuchanie i eksport do arkusza bez ukrytych.
- **Testy w przeglądarce (Chromium): 174 – wszystkie zaliczone w dwóch pełnych przebiegach**
  (172 wcześniejsze + 2 nowe; ok. 25 wcześniejszych testów notatek i rysunków przestawionych na nowe okna –
  obrazy, tabele i załączniki są w oknie „Obrazy i załączniki”):
  - ekran telefonu: spinacz „3” w podglądzie; **Edytuj** – okno 390 × 844 (cały ekran), pole tekstu ponad
    45% wysokości, bez miniatur, z mikrofonem; okno obiektów z podglądu (Zapisz, bez tekstu, bez „Wstaw do
    tekstu”); ołówek zdjęcia – od razu rysowanie na zdjęciu, bez menu; oczko na obrazie i tabeli;
    usunięcie zdjęcia – komunikat o odwołaniu; ⓘ – podpowiedź schowana; po zapisie podgląd bez obrazu,
    tabeli i odwołań, spinacz „2”; zapis: odwołania do ukrytych zostają, do usuniętego – znikają w obu
    wersjach; oczko z powrotem – obraz wraca; podpowiedzi schowane także po przeładowaniu;
  - ekran komputera: okno tekstu 1280 × 800, pole w kolumnie na środku; okno obiektów nad tekstem
    (Gotowe, bez Anuluj); usunięcie tabeli – odwołanie znika w wersji polskiej i angielskiej, spinacz „2”;
    ⓘ w oknie „Sygnatura obrazu” i w panelu pióra – chowa i pokazuje podpowiedzi;
  - przestawione: wklejony obraz – w obrazach i jako odwołanie w tekście, „Kopiuj” bez odwołania
    w zwykłym tekście; notatka głosowa mikrofonem z okna tekstu; „Wstaw do tekstu” z okna nad tekstem –
    kursor w tym samym miejscu (Ctrl+Z jak dotąd); ołówek tabeli na telefonie – od razu okno tabeli;
    upuszczenie pliku na okno tekstu – do załączników; „Usuń notatkę” w oknie obiektów.
- **Lint: bez błędów.**
- Zrzuty (Chromium): okno tekstu (telefon, komputer), okno „Obrazy i załączniki” z ukrytymi obiektami,
  okno bez podpowiedzi.

## Czego nie sprawdzono

- **Safari na iPhonie i iPadzie** – okno tekstu na cały ekran przy otwartej klawiaturze, przewijanie pola
  tekstu, okno nad oknem i przywracanie kursora po „Wstaw do tekstu” sprawdzone tylko w Chromium
  (`:has()` w CSS – Safari od 15.4).
- Starsza wersja aplikacji (np. na drugim urządzeniu przed aktualizacją) nie zna oczka – pokaże ukryte
  obrazy i tabele. Zaktualizuj aplikację na wszystkich urządzeniach.
