# Podobieństwo kodu do źródeł zewnętrznych

Stan repozytorium: commit `9eaa9ac` (wersja 1.48.0), 25 października 2026.
Ocena techniczna i wstępna ocena ryzyka – **nie jest opinią prawną**.

## Metoda i jej granice

Narzędzia do porównywania kodu (ScanOSS, ScanCode Toolkit, FOSSology) nie są zainstalowane w środowisku audytu.
Zgodnie z zasadami zlecenia nie były instalowane. Kod nie był też wysyłany do usług zewnętrznych: wyszukiwanie
fragmentów kodu w GitHub Code Search oznaczałoby wysłanie kodu. Wykonano więc tylko kontrole lokalne:

1. Przeszukanie wszystkich plików pod kątem not licencyjnych i praw autorskich (`copyright`, `(c)`, `SPDX`, `license`,
   `MIT`, `GPL`, `Apache`, `BSD`, `Mozilla`) oraz adresów URL do cudzych repozytoriów.
2. Sprawdzenie importów: kod aplikacji nie importuje żadnej biblioteki zewnętrznej. Testy i narzędzia importują tylko
   moduły wbudowane Node.js.
3. Przeszukanie kodu pod kątem nazw charakterystycznych dla bibliotek CAD i geometrii. Sprawdzone nazwy: three.js (`Matrix4`,
   `BufferGeometry`, `Object3D`), gl-matrix (`cosom`, `sinom`, `scale0`), OCCT (`TopoDS`, `gp_Pnt`, `BRep…`),
   Clipper (`ClipperLib`, `IntPoint`), earcut, polybool, martinez, dxf-parser (`_entityHandlers`), LibreCAD/QCAD (`RS_…`),
   FreeCAD (`Part::`), $1 Recognizer (`IndicativeAngle`), `OrbitControls`, `TrackballControls`, `ViewCube`, `NavCube`.
   Jedyne trafienie to wewnętrzna nazwa funkcji `paintViewCube` (zob. ustalenie znaków towarowych w CAD_TECHNOLOGY_AUDIT.md).
4. Ręczny przegląd algorytmów geometrii (zob. GEOMETRY_ALGORITHM_REGISTER.csv) i porównanie z postaciami powszechnie
   publikowanymi, które audytor zna. Bez dostępu do tekstu źródłowego w trakcie audytu, chyba że zaznaczono inaczej.

Podobieństwo nie jest dowodem kopiowania ani naruszenia. Nie zakładamy, że kod wygenerowany przez AI pochodzi
z konkretnych danych treningowych.

## Wynik

| Kategoria | Liczba |
| --- | --- |
| Zweryfikowane dopasowania do kodu zewnętrznego (porównane z tekstem źródłowym) | 0 |
| Jawne, opisane adaptacje kodu zewnętrznego | 1 – FSRS (py-fsrs 6.3.2, MIT), nota licencyjna w pliku |
| Podejrzewane podobieństwa (hipotezy) | 3 (S-1 – S-3) |

### Jawna adaptacja – FSRS (nie jest naruszeniem)

1. **Plik:** `js/core/fsrs.js:1-34` (cały moduł, 261 wierszy).
2. **Źródło:** py-fsrs 6.3.2, plik `fsrs/scheduler.py`.
3. **Repozytorium:** https://github.com/open-spaced-repetition/py-fsrs
4. **Licencja:** MIT, „Copyright (c) 2022 Open Spaced Repetition” – pełny tekst jest w nagłówku pliku.
5. **Charakter:** przeniesienie z Pythona do JavaScriptu z tymi samymi wzorami i parametrami. Zgodność sprawdzają
   wektory referencyjne z oryginału (`tools/gen_fsrs_reference.py`, `tests/fixtures/fsrs-reference.json`).
6. **Dowód:** opis w nagłówku pliku.
7. **Ocena:** implementacja zapożyczona, opisana.
8. **Skutki:** MIT wymaga zachowania noty we „wszystkich kopiach lub istotnych częściach”. Dziś warunek jest spełniony,
   bo plik jest dostarczany bez minifikacji.
9. **Zalecenie:** przy pakowaniu (minifikacja, App Store) przenieść notę do THIRD_PARTY_NOTICES i ekranu licencji
   w aplikacji.
10. **Pewność:** wysoka.

### S-1. Test „punkt w wielokącie” zbudowany jak PNPOLY

1. **Pliki i wiersze:** `js/core/shapes.js:1145`, `js/core/shapes.js:1158`, `js/core/drawing.js:1115`,
   `js/core/solids.js:297`, `js/core/solids.js:745`, `js/ui/drawing-solids.js:210`. W `js/ui/drawing-solids.js:64` jest
   wariant scanline tej samej zasady.
2. **Źródło zewnętrzne:** PNPOLY, W. Randolph Franklin (strona autora wrfranklin.org).
3. **Adres:** https://wrfranklin.org/Research/Short_Notes/pnpoly.html – w czasie audytu niedostępny z sieci środowiska.
   Treść licencji potwierdzono tylko pośrednio: wyniki wyszukiwania pokazały kopię w źródłach NOAA/PMEL Ferret.
4. **Licencja (według kopii):** permisywna, w stylu MIT/BSD, „Copyright (c) 1970-2003, Wm. Randolph Franklin”.
   Warunki: zachowanie noty w kodzie źródłowym, powielenie jej w dokumentacji dystrybucji binarnej, zakaz użycia
   nazwiska do promocji.
5. **Charakter podobieństwa:** warunek
   `(yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi`, przełączanie `inside = !inside` i pętla
   `for (i = 0, j = n-1; i < n; j = i++)`. Budowa jest taka sama jak w PNPOLY (w C: `c = !c`). Nazwy zmiennych i część
   pętli różnią się.
6. **Dowód:** zgodność struktury wyrażenia z powszechnie cytowaną postacią PNPOLY. Nie porównano z tekstem źródłowym,
   bo strona była niedostępna.
7. **Standard czy wyróżnik:** to najbardziej rozpowszechniona postać testu parzystości przecięć (crossing number).
   Występuje w setkach bibliotek i podręczników (np. pakiet npm „point-in-polygon”, MIT).
8. **Skutki prawne:** jednowierszowe wyrażenie wymuszone matematyką ma wątpliwą zdolność ochronną (brak swobody
   twórczej, zasada „merger”). Licencja i tak jest permisywna. Ryzyko: **NISKIE**.
9. **Zalecenie (do wyboru):**
   - (a) dodać notę PNPOLY do THIRD_PARTY_NOTICES i komentarz przy funkcji;
   - (b) zastąpić jedną własną funkcją pomocniczą napisaną od zera, np. liczba nawinięć liczona z kątów albo iloczynu
     wektorowego, i użyć jej we wszystkich 7 miejscach.
   
   Wariant (b) usuwa też powielenie kodu.
10. **Pewność:** podobieństwo struktury – wysoka. Pochodzenie z PNPOLY – hipoteza: wzór jest powszechny, a AI mogło go
    znać z wielu źródeł.

### S-2. Kwaternion z macierzy obrotu

1. **Plik:** `js/core/solids.js:119-138` (`quatFromMatrix`).
2. **Źródło porównawcze:** powszechnie publikowana postać metody śladu z czterema gałęziami (Shepperd 1978, Shoemake),
   m.in. w three.js `Quaternion.setFromRotationMatrix` (MIT) i w opracowaniach internetowych.
3. **Adres:** https://github.com/mrdoob/three.js – nie pobrano w czasie audytu.
4. **Licencja odpowiednika:** MIT (three.js).
5. **Charakter:** te same gałęzie (ślad > 0; największy element przekątnej) i te same wyrażenia na składowe. Różnice:
   zapis macierzy wierszami w tablicy, `s` liczone jako `2·√…`, normalizacja wyniku.
6. **Dowód:** zgodność z formułą matematyczną. Nie porównywano znak po znaku z konkretnym plikiem.
7. **Standard czy wyróżnik:** standard. Wzory są wymuszone matematyką.
8. **Skutki:** **NISKIE**. Odpowiedniki są na licencjach permisywnych.
9. **Zalecenie:** brak działań koniecznych. Można dopisać źródło metody w komentarzu.
10. **Pewność:** wysoka, że to wzór standardowy. Pochodzenie konkretnego zapisu nieustalone.

### S-3. Próg 0,9995 w SLERP

1. **Plik:** `js/core/solids.js:178`.
2. **Źródło porównawcze:** przykład kodu SLERP z próbą `DOT_THRESHOLD = 0.9995`, często cytowany (np. w artykule
   Wikipedii „Slerp” na licencji CC BY-SA). Hipoteza z pamięci audytora, **niezweryfikowana** u źródła w czasie audytu.
3. **Adres:** https://en.wikipedia.org/wiki/Slerp – nie pobrano.
4. **Licencja odpowiednika:** CC BY-SA 4.0 (treść Wikipedii), jeśli hipoteza się potwierdzi.
5. **Charakter:** ta sama stała progowa i ten sam schemat (zmiana znaku przy ujemnym iloczynie, interpolacja liniowa
   powyżej progu). Reszta funkcji jest zapisana inaczej.
6. **Dowód:** zbieżność jednej stałej i schematu.
7. **Standard czy wyróżnik:** konwencja inżynierska, powszechna.
8. **Skutki:** **NISKIE**. Stała liczbowa i schemat wymuszony problemem numerycznym nie stanowią utworu.
9. **Zalecenie:** brak działań koniecznych. Opcjonalnie dobrać próg własny (np. 1 − 1e-6) i opisać powód w komentarzu.
10. **Pewność:** niska (hipoteza).

## Elementy sprawdzone bez zastrzeżeń

- `js/core/zip.js`: odczyt i zapis ZIP według publicznej specyfikacji APPNOTE. Kompresja przez wbudowane
  `CompressionStream` przeglądarki, bez przeniesionego kodu inflate/deflate (nie znaleziono tablic Huffmana z zlib/pako).
- `js/core/xlsx.js`, `js/core/pdf.js`, `js/core/ics.js`: implementacje według publicznych specyfikacji (ECMA-376,
  ISO 32000 / PDF 1.4, RFC 5545). PDF używa standardowych krojów bez osadzania plików czcionek.
- `js/core/recognize.js`: metoda ShortStraw (publikacja naukowa) zaimplementowana według opisu i cytowana w komentarzu.
- `js/core/dxf.js`: parser i zapis według publicznej dokumentacji DXF, bez nazw z dxf-parser, LibreCAD ani QCAD.
- `js/ui/icons.js`: ikony opisane w pliku jako własne (ścieżki SVG 24×24). Nie porównano ich z zestawami ikon
  (SF Symbols, Material, Feather) – zob. AUDIT_LIMITATIONS.md.
