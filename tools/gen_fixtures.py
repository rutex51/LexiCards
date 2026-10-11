#!/usr/bin/env python3
"""Generuje pliki testowe dla importu (tests/fixtures).

Pliki powstają w niezależnych programach – openpyxl i LibreOffice – żeby testy odczytu
nie sprawdzały wyłącznie plików zapisanych przez samą aplikację.

Uruchomienie: python3 tools/gen_fixtures.py
Wymaga: openpyxl oraz LibreOffice (polecenie soffice).
"""

import csv
import shutil
import subprocess
import tempfile
from pathlib import Path

from openpyxl import Workbook
from openpyxl.cell.rich_text import CellRichText, TextBlock
from openpyxl.cell.text import InlineFont
from openpyxl.styles import Font

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "fixtures"
SAMPLE_CSV = ROOT / "docs" / "samples" / "lexicards_sample.csv"

POLISH_ROWS = [
    ["Dziedzina", "Moduł", "Lekcja", "Pojęcie PL", "Pojęcie EN", "Opis PL", "Opis EN", "Przykład PL", "Przykład EN", "Tagi", "Trudność", "Notatki"],
    ["Prawo", "Spółki", "Organy", "zarząd", "management board", "Organ prowadzący sprawy spółki; reprezentuje ją na zewnątrz.",
     "The body that runs the company's affairs.", "Zarząd zatwierdził „plan naprawczy”.", 'The board approved the "recovery plan".', "prawo, spółki", "3", "źródło: KSH"],
    ["Prawo", "Spółki", "Organy", "rada nadzorcza", "supervisory board", "Organ nadzoru.\nPowołuje zarząd.", "", "", "", "", "", ""],
    ["Prawo", "Spółki", "Kapitał", "wkład niepieniężny", "contribution in kind", "", "", "Żółć, gęślą jaźń – test znaków.", "", "", "9", ""],
    ["Prawo", "Umowy", "Zawarcie", "oferta", "offer", "", "", "", "", "", "", ""],
]


def write_csv(path, rows, delimiter, encoding, bom=False):
    with open(path, "w", newline="", encoding=encoding) as handle:
        if bom:
            handle.write("﻿")
        csv.writer(handle, delimiter=delimiter, lineterminator="\r\n").writerows(rows)


def csv_fixtures():
    write_csv(OUT / "polish-windows-1250.csv", POLISH_ROWS, ";", "cp1250")
    # ISO-8859-2 nie ma cudzysłowów drukarskich ani półpauzy.
    plain = [[cell.replace("„", "'").replace("”", "'").replace("–", "-") for cell in row] for row in POLISH_ROWS]
    write_csv(OUT / "polish-iso-8859-2.csv", plain, ";", "iso8859_2")
    write_csv(OUT / "comma-utf8.csv", POLISH_ROWS, ",", "utf-8")
    write_csv(OUT / "tab-utf16.txt", POLISH_ROWS, "\t", "utf-16-le", bom=True)
    # Excel dopisuje czasem wiersz z separatorem.
    with open(OUT / "sep-directive.csv", "w", newline="", encoding="utf-8") as handle:
        handle.write("sep=|\r\n")
        csv.writer(handle, delimiter="|", lineterminator="\r\n").writerows(POLISH_ROWS[:3])
    # Bez nagłówków: dwie kolumny.
    write_csv(OUT / "no-header.csv", [["bilans", "balance sheet"], ["aktywa", "assets"], ["pasywa", "liabilities"]], ";", "utf-8")


def workbook_fixture():
    """Skoroszyt z kilkoma arkuszami i przypadkami brzegowymi."""
    book = Workbook()
    sheet = book.active
    sheet.title = "Słownik"
    sheet.append(["Domain", "Module", "Lesson", "Term PL", "Term EN", "Description PL", "Difficulty"])
    sheet.append(["Metrology", "CMM", "Probes", "sonda", "probe", "Element stykający się z detalem.", 2])
    # Scalone komórki struktury: nazwa tylko w pierwszym wierszu grupy.
    sheet.append([None, None, None, "trzpień", "stylus", None, 4.0])
    sheet.append([None, None, "Accuracy", "wzorcowanie", "calibration", None, None])
    sheet.append([])  # pusty wiersz
    sheet.append(["Metrology", "GD&T", "Form", "płaskość", "flatness", "A < B & C > D \"cudzysłów\"", 1])
    sheet.merge_cells("A2:A4")
    sheet.merge_cells("B2:B4")
    # Tekst z formatowaniem części znaków (zapisywany jako kilka fragmentów).
    sheet["E7"] = CellRichText("straight", TextBlock(InlineFont(b=True), "ness"))
    sheet["D7"] = "prostoliniowość"
    sheet["A7"], sheet["B7"], sheet["C7"] = "Metrology", "GD&T", "Form"
    # Formuła zwracająca tekst i liczba ułamkowa.
    sheet["D8"] = "okrągłość"
    sheet["E8"] = '=CONCATENATE("round","ness")'
    sheet["F8"] = 0.125
    sheet["A8"], sheet["B8"], sheet["C8"] = "Metrology", "GD&T", "Form"
    sheet["A1"].font = Font(bold=True)

    notes = book.create_sheet("Notatki")
    notes.append(["To nie są dane do importu"])

    hidden = book.create_sheet("Ukryty")
    hidden.append(["Polski", "Angielski"])
    hidden.append(["ukryte", "hidden"])
    hidden.sheet_state = "hidden"

    empty = book.create_sheet("Pusty")
    assert empty.max_row == 1

    book.save(OUT / "openpyxl-cases.xlsx")


def libreoffice(source, target_format, out_dir, infilter=None):
    command = ["soffice", "--headless", "--convert-to", target_format, "--outdir", str(out_dir)]
    if infilter:
        command.append(f"--infilter={infilter}")
    command.append(str(source))
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)


def libreoffice_fixtures():
    """Te same dane przykładowe zapisane przez LibreOffice jako XLSX, XLS i ODS."""
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        source = temp / "libreoffice-sample.csv"
        shutil.copy(SAMPLE_CSV, source)
        # 59 = średnik, 34 = cudzysłów, 76 = UTF-8
        csv_filter = "Text - txt - csv (StarCalc):59,34,76,1"
        libreoffice(source, "xlsx", temp, csv_filter)
        shutil.copy(temp / "libreoffice-sample.xlsx", OUT / "libreoffice-sample.xlsx")
        libreoffice(source, "xls", temp, csv_filter)
        shutil.copy(temp / "libreoffice-sample.xls", OUT / "old-format.xls")
        libreoffice(source, "ods", temp, csv_filter)
        shutil.copy(temp / "libreoffice-sample.ods", OUT / "open-document.ods")
        # Skoroszyt z przypadkami brzegowymi przepisany przez LibreOffice: formuły dostają
        # zapamiętane wyniki, a teksty trafiają do wspólnej tablicy w innym układzie.
        cases = temp / "libreoffice-cases.xlsx"
        nested = temp / "converted"
        nested.mkdir()
        shutil.copy(OUT / "openpyxl-cases.xlsx", cases)
        libreoffice(cases, "xlsx", nested)
        shutil.copy(nested / "libreoffice-cases.xlsx", OUT / "libreoffice-cases.xlsx")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    csv_fixtures()
    workbook_fixture()
    libreoffice_fixtures()
    for path in sorted(OUT.iterdir()):
        print(f"{path.stat().st_size:>8}  tests/fixtures/{path.name}")


if __name__ == "__main__":
    main()
