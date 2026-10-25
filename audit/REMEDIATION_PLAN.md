# Plan działań naprawczych (priorytety)

Żadnego z działań nie wykonano w ramach audytu – zgodnie ze zleceniem kod aplikacji nie był zmieniany.
Każde działanie zmieniające kod wymaga decyzji właściciela.

| Nr | Priorytet | Działanie | Ustalenie | Nakład | Kto |
| --- | --- | --- | --- | --- | --- |
| R-01 | 1 – WYSOKI | **Kostka widoków:** usunąć ją albo zastąpić rozwiązaniem bez trójwymiarowej reprezentacji układu współrzędnych, np. płaskim paskiem przycisków widoków, przed jakąkolwiek dystrybucją komercyjną w USA. Bez kostki dalej działają: menu „Widok”, „Obracaj” (przeciąganie bryły) i kąty w oknie bryły. Jeśli kostka ma zostać – opinia FTO rzecznika patentowego (US 7,782,319 B2; US 8,132,123; US 7,814,436 B2). | P-01, P-03 | mały (usunięcie uchwytu `cube`, testy 1.47 do poprawy) | deweloper + decyzja właściciela |
| R-02 | 2 – ŚREDNI | **Animacja przewracania kartek:** przed sprzedażą w USA przed 13.11.2026 porównać z rysunkami wzoru US D670,713 S. W razie podobieństwa w USA użyć innego przejścia (przesunięcie, zanikanie) albo poczekać do wygaśnięcia. | P-07 | mały | rzecznik / właściciel |
| R-03 | 2 – ŚREDNI | **Dokumentacja autorstwa:** zachować prywatnie zapisy rozmów z AI, dziennik decyzji, dowód nagrania kartki; oznaczać ręczne zmiany w commitach. | AI_AUTHORSHIP_EVIDENCE.md | stały | właściciel |
| R-04 | 3 – NISKI | **Test punktu w wielokącie:** zastąpić 7 kopii wyrażenia jedną własną funkcją (np. w `core/shapes.js`), napisaną od zera i opisaną. Alternatywnie dodać notę PNPOLY po weryfikacji u źródła. | S-1 | mały (refaktoryzacja + testy) | deweloper |
| R-05 | 3 – NISKI | **Nazwy wewnętrzne:** zmienić `paintViewCube` i ikonę `viewCube` na neutralne (np. `orientationCube`), jeśli kostka zostaje. W materiałach handlowych nie używać „ViewCube”, „AutoCAD”, „Inventor”, „SolidWorks” poza opisem zgodności formatu DXF. | Znaki towarowe (CAD_TECHNOLOGY_AUDIT.md) | bardzo mały | deweloper |
| R-06 | 3 – NISKI | **Noty licencyjne przy pakowaniu:** przy minifikacji lub wydaniu w App Store / Google Play / Microsoft Store dodać ekran „Licencje” z treścią THIRD_PARTY_NOTICES.md (MIT py-fsrs). | Rejestr zależności | mały | deweloper |
| R-07 | 4 – INFORMACYJNY | **Uzupełnienie wyszukiwań:** po odblokowaniu dostępu do Espacenet, Google Patents, USPTO i bazy UPRP (ustawienia sieci środowiska) odczytać zastrzeżenia P-01, P-03, P-06, P-07, sprawdzić odpowiedniki EP/PL i przeszukać klasy CPC z PATENT_LANDSCAPE.md. Uruchomić ScanCode / ScanOSS lokalnie (po zgodzie na instalację; ScanOSS wysyła odciski kodu – wymaga zgody). | AUDIT_LIMITATIONS.md | średni | audytor / rzecznik |
| R-08 | 4 – INFORMACYJNY | **Repozytorium publiczne:** przed komercjalizacją rozważyć repozytorium prywatne (tajemnica przedsiębiorstwa, ochrona przed kopiowaniem) i dodać plik licencji własnej („All rights reserved” / EULA). Dziś repozytorium nie ma pliku LICENSE – brak licencji oznacza brak zgody na użycie przez innych, ale kod jest widoczny. | — | mały | właściciel |
| R-09 | 4 – INFORMACYJNY | **Dane przykładowe:** sprawdzić, czy definicje pojęć w danych przykładowych nie są przepisane ze słowników lub glosariuszy chronionych; najlepiej zastąpić je własnymi tekstami właściciela. | AUDIT_LIMITATIONS.md | mały | właściciel |

## Zasady na przyszłość (dla prac z asystentem AI)

1. Funkcje inspirowane programami komercyjnymi (CAD, iPadOS, aplikacje do notatek) – przed wdrożeniem krótkie
   sprawdzenie, czy charakterystyczny element interfejsu nie jest znakiem towarowym albo przedmiotem znanego patentu
   (np. ViewCube, przewracanie strony). Przy wątpliwości – propozycja alternatywy w makiecie.
2. Kod z cudzych źródeł tylko na licencjach permisywnych, z notą w pliku i wpisem w THIRD_PARTY_NOTICES.md (tak jak FSRS).
3. Algorytmy z literatury – w komentarzu nazwa metody i publikacja; implementacja pisana od zera według opisu, nie
   przepisana z kodu wzorcowego.
4. Nie używać nazw cudzych produktów w nazwach w kodzie i w interfejsie.
5. Zasoby (dźwięki, obrazy, kroje) – tylko własne albo z licencją pozwalającą na użycie komercyjne; zapisywać źródło.
