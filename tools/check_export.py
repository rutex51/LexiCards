#!/usr/bin/env python3
"""Sprawdza pliki eksportu LexiCards w niezależnych programach.

Eksport danych przykładowych (XLSX i CSV) jest otwierany przez:
  - openpyxl,
  - LibreOffice (konwersja XLSX → CSV),
  - moduł csv z biblioteki standardowej Pythona,
a odczytane wartości są porównywane komórka po komórce.

Uruchomienie: python3 tools/check_export.py
Wymaga: Node.js, openpyxl, LibreOffice (polecenie soffice).
"""

import csv
import subprocess
import sys
import tempfile
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent


def text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def trim(rows):
    """Usuwa puste komórki z końca wierszy (programy różnie je zapisują)."""
    result = []
    for row in rows:
        cells = [text(cell) for cell in row]
        while cells and cells[-1] == "":
            cells.pop()
        result.append(cells)
    return result


def main():
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        subprocess.run(["node", str(ROOT / "tools" / "export_sample.mjs"), str(temp)], check=True)

        # 1. Własny eksport CSV czytany przez moduł csv Pythona – to nasz punkt odniesienia.
        with open(temp / "export.csv", newline="", encoding="utf-8-sig") as handle:
            reference = trim(csv.reader(handle, delimiter=";"))
        assert reference[0][:5] == ["Domain", "Module", "Lesson", "Term PL", "Term EN"], reference[0]
        assert len(reference) == 42, len(reference)
        print(f"CSV (moduł csv Pythona): {len(reference) - 1} pojęć, nagłówek poprawny")

        # 2. XLSX otwarty przez openpyxl.
        book = load_workbook(temp / "export.xlsx")
        sheet = book.active
        assert sheet.title == "Pojęcia", sheet.title
        from_openpyxl = trim(sheet.iter_rows(values_only=True))
        assert from_openpyxl == reference, first_difference(from_openpyxl, reference)
        assert sheet["A1"].font.bold is True, "nagłówek powinien być pogrubiony"
        assert sheet.freeze_panes == "A2", sheet.freeze_panes
        print(f"XLSX (openpyxl): {len(from_openpyxl) - 1} pojęć, wartości zgodne z CSV, nagłówek pogrubiony i zamrożony")

        # 3. XLSX otwarty przez LibreOffice i zapisany jako CSV.
        out = temp / "lo"
        out.mkdir()
        subprocess.run(
            ["soffice", "--headless", "--convert-to", "csv:Text - txt - csv (StarCalc):59,34,76,1", "--outdir", str(out), str(temp / "export.xlsx")],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
        )
        with open(out / "export.csv", newline="", encoding="utf-8") as handle:
            from_libreoffice = trim(csv.reader(handle, delimiter=";"))
        assert from_libreoffice == reference, first_difference(from_libreoffice, reference)
        print(f"XLSX (LibreOffice): {len(from_libreoffice) - 1} pojęć, wartości zgodne z CSV")

        # 4. CSV otwarty przez LibreOffice (wykrywanie UTF-8 po znaczniku BOM) i zapisany jako XLSX.
        out2 = temp / "lo2"
        out2.mkdir()
        subprocess.run(
            ["soffice", "--headless", "--convert-to", "xlsx", "--infilter=Text - txt - csv (StarCalc):59,34,76,1,,0,false,false", "--outdir", str(out2), str(temp / "export.csv")],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
        )
        from_csv = trim(load_workbook(out2 / "export.xlsx").active.iter_rows(values_only=True))
        assert from_csv == reference, first_difference(from_csv, reference)
        print(f"CSV (LibreOffice → XLSX → openpyxl): {len(from_csv) - 1} pojęć, wartości zgodne")

    print("OK")


def first_difference(actual, expected):
    for index, (a, b) in enumerate(zip(actual, expected)):
        if a != b:
            return f"wiersz {index + 1}:\n  jest:      {a}\n  oczekiwano: {b}"
    return f"różna liczba wierszy: {len(actual)} i {len(expected)}"


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        print(f"BŁĄD: {error}")
        sys.exit(1)
