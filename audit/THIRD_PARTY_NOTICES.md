# Noty osób trzecich (rejestr zweryfikowany w audycie)

Stan: commit `9eaa9ac` (1.48.0). Aplikacja nie zawiera bibliotek uruchomieniowych osób trzecich. Poniżej jest kod
przeniesiony lub potencjalnie pochodny oraz oznaczenia, których używa opisowo.

## 1. py-fsrs (algorytm FSRS-6) – kod przeniesiony

Plik: `js/core/fsrs.js` – przeniesienie klasy Scheduler z py-fsrs 6.3.2
(https://github.com/open-spaced-repetition/py-fsrs). Nota zachowana w pliku (wiersze 12-34).

```
MIT License

Copyright (c) 2022 Open Spaced Repetition

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. PNPOLY – test punktu w wielokącie (DO POTWIERDZENIA)

Wyrażenie w 7 miejscach kodu ma budowę testu PNPOLY (SOURCE_CODE_SIMILARITY.md, S-1). Czy to fragment pochodny,
nie rozstrzygnięto: wzór jest powszechny i krótki.

Według kopii odnalezionej w wynikach wyszukiwania (źródła NOAA/PMEL Ferret; strona autora była niedostępna):

- licencja jest permisywna, „Copyright (c) 1970-2003, Wm. Randolph Franklin”;
- warunki: zachowanie noty w kodzie źródłowym, powielenie jej w dokumentacji dystrybucji binarnej, zakaz używania
  nazwiska autora do promocji.

**Pełnego tekstu noty nie przytoczono, bo nie zweryfikowano go u źródła.** Przed dystrybucją komercyjną należy:
- pobrać notę ze strony autora i wstawić ją tutaj oraz przy funkcji;
- albo zastąpić wyrażenie własną funkcją (REMEDIATION_PLAN R-04).

## 3. Zasoby utworzone narzędziami z licencją

- Ikony (`icons/*.png`): napis wyrenderowany krojem **Inter** (SIL Open Font License 1.1). Plik kroju nie jest
  dystrybuowany; OFL nie nakłada obowiązków na obrazy utworzone krojem.
- Obraz wzoru importu (`js/core/template-image.js`): napisy krojem **Liberation Sans** (SIL OFL 1.1). Uwagi jak wyżej.

## 4. Znaki towarowe osób trzecich (użycie opisowe)

AutoCAD, DWG, DXF, Inventor, ViewCube – znaki Autodesk, Inc. SolidWorks – znak Dassault Systèmes. iPad, iPhone,
Apple Pencil, Safari, iCloud – znaki Apple Inc. Windows – znak Microsoft Corporation. Helvetica i Times – znaki
odpowiednich właścicieli (standardowe nazwy krojów PDF). Nazwy występują wyłącznie opisowo: format pliku, platforma,
porównanie w dokumentacji. Aplikacja nie jest powiązana z ich właścicielami.

## 5. Specyfikacje i normy, według których zaimplementowano funkcje (bez kopiowania treści)

- Formaty: DXF (dokumentacja Autodesk), ZIP (APPNOTE), XLSX (ECMA-376), PDF (ISO 32000), iCalendar (RFC 5545).
- Normy: ISO 1101, ISO 1302, ISO 286 (oznaczenia), ISO 128 / ISO 5456 (rzutowanie).
- Treść norm i tabel nie jest kopiowana; aplikacja używa oznaczeń i symboli.
