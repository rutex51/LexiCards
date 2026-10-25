# Audyt własności intelektualnej – podsumowanie

**Aplikacja:** LexiCards 1.48.0 (commit `9eaa9ac`), PWA w czystym JavaScripcie.
**Data:** 25 października 2026. **Priorytet:** moduły rysunku 2D i brył 3D.

Ocena techniczna i wstępna ocena ryzyka prawnego. **Nie jest opinią prawną, analizą Freedom to Operate ani gwarancją
braku naruszeń.** Kod aplikacji nie był zmieniany.

## Najważniejsze wnioski

1. **Prawa autorskie.** Nie znaleziono kodu skopiowanego z programów CAD ani bibliotek CAD lub geometrii: AutoCAD,
   Inventor, SolidWorks, FreeCAD/OCCT, LibreCAD/QCAD, three.js, CGAL, Clipper i inne. Aplikacja nie ma bibliotek
   uruchomieniowych. Algorytmy geometrii (48 pozycji w rejestrze) to techniki standardowe z literatury publicznej.
   Jedyny kod osób trzecich to jawnie opisana adaptacja **py-fsrs (MIT)** z zachowaną notą – zgodna z licencją.
   Trzy drobne podobieństwa zapisu do powszechnych wzorów (test PNPOLY, kwaternion z macierzy, próg SLERP) mają ryzyko
   niskie. **Nie ma podstaw do usuwania czegokolwiek z powodu praw autorskich.**
2. **Patenty – jedno ryzyko wysokie (USA).** **Kostka widoków** (wersja 1.47) odtwarza mechanizm Autodesk ViewCube,
   objęty patentem USA **US 7,782,319 B2**. Według Google Patents (cytowanego przez wyszukiwarkę, niezweryfikowane)
   patent jest aktywny do **2029-03-06**. Kod jest własny, ale patent chroni rozwiązanie, nie kod. Zalecenie: usunąć
   kostkę albo zastąpić ją przed sprzedażą w USA (R-01). Pozostałe sposoby zmiany widoku (menu „Widok”, „Obracaj”,
   kąty w oknie) zostają.
3. **Patenty – ryzyka średnie:**
   - animacja przewracania kartki a wzór przemysłowy Apple US D670,713 S (USA, wyliczony koniec ochrony 13.11.2026);
   - powiązane patenty Autodesk o wskaźniku orientacji (US 8,132,123; US 7,814,436 B2 – status nieznany);
   - uchwyt wyciągnięcia a zgłoszenie US 2012/0078589 A1 (status nieznany).
   
   Pozostałe mechanizmy CAD (szkic → wyciągnięcie / obrót, rzuty, krawędzie niewidoczne, menu kołowe, historia modelu)
   to rozwiązania znane od dziesięcioleci albo objęte patentami, które według Google wygasły.
4. **Autorstwo.** Wszystkie 102 commity powstały ze współudziałem AI. Ochrona autorska kodu jest niepewna, więc warto
   dokumentować wkład twórczy właściciela (R-03).
5. **Licencje.** Konfliktów licencyjnych brak. Przy pakowaniu do sklepów dodać ekran licencji z notą MIT (R-06).

## Ustalenia

| ID | Klasa | Ustalenie | Dokument |
| --- | --- | --- | --- |
| F-01 | **WYSOKIE** | Kostka widoków a US 7,782,319 B2 (Autodesk), USA | PATENT_LANDSCAPE.md P-01 |
| F-02 | ŚREDNIE | Powiązane patenty Autodesk o wskaźniku orientacji – status nieustalony | P-03 |
| F-03 | ŚREDNIE | Animacja przewracania kartki a US D670,713 S (Apple), USA do 11.2026 | P-07 |
| F-04 | ŚREDNIE | Uchwyt długości wyciągnięcia a US 2012/0078589 A1 – status nieustalony | P-06 |
| F-05 | ŚREDNIE | Niepewna ochrona autorska kodu generowanego przez AI; dokumentacja wkładu człowieka niepełna | AI_AUTHORSHIP_EVIDENCE.md |
| F-06 | NISKIE | Wyrażenie testu punkt-w-wielokącie zbudowane jak PNPOLY (7 miejsc) | SOURCE_CODE_SIMILARITY.md S-1 |
| F-07 | NISKIE | Kwaternion z macierzy i próg SLERP – postacie standardowe | S-2, S-3 |
| F-08 | NISKIE | Znaki towarowe: wewnętrzne nazwy `paintViewCube` / `viewCube`; AutoCAD, Inventor, SolidWorks w dokumentacji | CAD_TECHNOLOGY_AUDIT.md |
| F-09 | NISKIE | Menu kołowe – patenty marking menus (wg Google wygasłe) | P-04 |
| F-10 | NISKIE | Rzuty z modelu – US 7,050,960 B2 (wg Google wygasły) | P-05 |
| F-11 | NISKIE | Rozpoznawanie kształtu po przytrzymaniu – brak znalezionego patentu dedykowanego | P-08 |
| F-12 | NISKIE | Historia modelu – US 5,815,154 (wg Google wygasły) | P-09 |
| F-13 | INFORMACYJNE | Nota MIT py-fsrs przy minifikacji i pakowaniu do sklepów | THIRD_PARTY_NOTICES.md |
| F-14 | INFORMACYJNE | Repozytorium publiczne bez pliku LICENSE (brak licencji własnej i tajemnicy) | REMEDIATION_PLAN R-08 |
| F-15 | INFORMACYJNE | Teksty danych przykładowych i ikony nieporównane ze źródłami zewnętrznymi | AUDIT_LIMITATIONS.md |
| F-16 | INFORMACYJNE | Funkcje z opisu zlecenia, których nie ma w kodzie (iCloud, grywalizacja) – nieoceniane | AUDIT_LIMITATIONS.md |

## Metryki (sekcja 11 zlecenia)

| Metryka | Wartość |
| --- | --- |
| Przeanalizowane pliki kodu | 198: 124 pliki aplikacji (120 JS, CSS, HTML, `sw.js`, manifest), 64 testy, 10 narzędzi; dodatkowo przeszukano 55 dokumentów `.md` |
| Pliki związane z CAD | 27 (18 rdzenia + 9 interfejsu) |
| Zidentyfikowane zależności | 11: 0 uruchomieniowych, 1 osadzona (py-fsrs), 10 narzędzi i zasobów budowania |
| Biblioteki CAD | 0 |
| Zweryfikowane dopasowania kodu | 0 (plus 1 jawna, zgodna adaptacja – py-fsrs) |
| Podejrzewane podobieństwa | 3 |
| Przeanalizowane algorytmy geometrii | 48 |
| Dokumenty patentowe | 17 zidentyfikowanych (metadane z wyszukiwarki); 0 z odczytanymi zastrzeżeniami |
| Potencjalnie istotne rodziny patentowe | 5 |
| Nierozstrzygnięte ryzyka patentowe | 4 (P-01, P-03, P-06, P-07) |
| Konflikty licencyjne | 0 |
| Ustalenia: CRITICAL / HIGH / MEDIUM / LOW / INFO | 0 / 1 / 4 / 7 / 4 |

## Plan działań (skrót – szczegóły w REMEDIATION_PLAN.md)

1. **R-01:** usunąć albo przeprojektować kostkę widoków. Jeśli ma zostać – opinia FTO rzecznika patentowego dla USA.
2. **R-02:** przed sprzedażą w USA przed 13.11.2026 porównać animację przewracania z wzorem D670,713 albo ją zmienić.
3. **R-03:** dokumentować wkład twórczy właściciela (zapisy rozmów z AI, dziennik decyzji).
4. **R-04 – R-06:** własna funkcja punkt-w-wielokącie; neutralne nazwy wewnętrzne; ekran licencji przy pakowaniu.
5. **R-07:** uzupełnić wyszukiwania w bazach patentowych po odblokowaniu dostępu i uruchomić skanery (po zgodzie).
6. **R-08, R-09:** repozytorium prywatne i licencja własna przed komercjalizacją; własne teksty przykładowe.

## Gotowość (wstępna, nie jest zgodą prawną)

**CONDITIONAL (warunkowa).** Rynek UE/PL: brak przeszkód zidentyfikowanych w tym zakresie badań – z zastrzeżeniem
ograniczeń (AUDIT_LIMITATIONS.md). Rynek USA: warunkiem jest R-01, a do 13.11.2026 także R-02.
