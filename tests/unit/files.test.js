// Odczyt i zapis plików: ZIP, XLSX, CSV oraz rozpoznawanie formatu.
// Pliki w tests/fixtures pochodzą z openpyxl i LibreOffice (tools/gen_fixtures.py).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  decodeText, detectDelimiter, detectEncoding, encodeCsv, parseCsv, separatorDirective, writeCsv
} from '../../js/core/csv.js';
import { SpreadsheetError, openTableFile } from '../../js/core/tablefile.js';
import { createWorkbook, openWorkbook, safeSheetName } from '../../js/core/xlsx.js';
import { ZipError, crc32, createZip, readZipDirectory, readZipEntry } from '../../js/core/zip.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = async (name) => new Uint8Array(await readFile(path.join(ROOT, 'tests/fixtures', name)));
const sample = async (name) => new Uint8Array(await readFile(path.join(ROOT, 'docs/samples', name)));
const cellsOf = (table) => table.rows.map((row) => row.cells);
const numbersOf = (table) => table.rows.map((row) => row.number);

// ---------------------------------------------------------------- ZIP

test('crc32 zgadza się z wartością wzorcową', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('archiwum ZIP: zapis i odczyt, także plików z polską nazwą i pustych', async () => {
  const encoder = new TextEncoder();
  const long = encoder.encode('zażółć gęślą jaźń '.repeat(500));
  const bytes = await createZip([
    { name: 'krótki.txt', data: encoder.encode('abc') },
    { name: 'katalog/długi.txt', data: long },
    { name: 'pusty.bin', data: new Uint8Array(0) }
  ]);
  const directory = readZipDirectory(bytes);
  assert.deepEqual([...directory.keys()], ['krótki.txt', 'katalog/długi.txt', 'pusty.bin']);
  assert.equal(new TextDecoder().decode(await readZipEntry(bytes, directory.get('krótki.txt'))), 'abc');
  assert.deepEqual(await readZipEntry(bytes, directory.get('katalog/długi.txt')), long);
  assert.equal((await readZipEntry(bytes, directory.get('pusty.bin'))).length, 0);
  // Długi, powtarzalny tekst został skompresowany.
  assert.ok(directory.get('katalog/długi.txt').compressedSize < long.length / 10);
});

test('uszkodzone archiwum jest wykrywane po sumie kontrolnej', async () => {
  const data = new TextEncoder().encode('x'.repeat(40));
  const bytes = await createZip([{ name: 'a.txt', data }]);
  assert.throws(() => readZipDirectory(new Uint8Array(10)), ZipError);
  assert.throws(() => readZipDirectory(new TextEncoder().encode('to nie jest archiwum, tylko zwykły tekst')), ZipError);
  const damaged = bytes.slice();
  damaged[35] ^= 0xff; // bajt danych pliku zapisanego bez kompresji
  await assert.rejects(readZipEntry(damaged, readZipDirectory(damaged).get('a.txt')), /suma kontrolna/);
});

// ---------------------------------------------------------------- XLSX: odczyt

test('XLSX z openpyxl i z LibreOffice dają tę samą tabelę co plik CSV z tymi danymi', async () => {
  const csv = parseCsv(decodeText(await sample('lexicards_sample.csv'), 'utf-8'), ';');
  assert.equal(csv.rows.length, 41);
  assert.equal(csv.rows[0].cells.join('|'), 'Domain|Module|Lesson|Term PL|Term EN|Description PL|Description EN|Example PL|Example EN|Tags');

  for (const bytes of [await sample('lexicards_sample.xlsx'), await fixture('libreoffice-sample.xlsx')]) {
    const workbook = await openWorkbook(bytes);
    const table = await workbook.readSheet(0);
    assert.deepEqual(cellsOf(table), cellsOf(csv));
    assert.deepEqual(numbersOf(table), numbersOf(csv));
    assert.equal(table.columnCount, 10);
  }
});

test('XLSX: arkusze, ukryty arkusz, scalone komórki, puste wiersze, liczby i znaki specjalne', async () => {
  for (const name of ['openpyxl-cases.xlsx', 'libreoffice-cases.xlsx']) {
    const workbook = await openWorkbook(await fixture(name));
    assert.deepEqual(workbook.sheets, [
      { name: 'Słownik', hidden: false },
      { name: 'Notatki', hidden: false },
      { name: 'Ukryty', hidden: true },
      { name: 'Pusty', hidden: false }
    ], name);

    const table = await workbook.readSheet(0);
    // Wiersz 5 jest pusty: nie ma go w tabeli, ale numeracja pozostałych się nie zmienia.
    assert.deepEqual(numbersOf(table), [1, 2, 3, 4, 6, 7, 8], name);
    const byNumber = new Map(table.rows.map((row) => [row.number, row.cells]));
    assert.deepEqual(byNumber.get(2), ['Metrology', 'CMM', 'Probes', 'sonda', 'probe', 'Element stykający się z detalem.', '2'], name);
    // Scalone komórki: wartość ma tylko pierwsza komórka zakresu.
    assert.deepEqual(byNumber.get(3), ['', '', '', 'trzpień', 'stylus', '', '4'], name);
    assert.deepEqual(byNumber.get(4), ['', '', 'Accuracy', 'wzorcowanie', 'calibration'], name);
    assert.equal(byNumber.get(6)[5], 'A < B & C > D "cudzysłów"', name);
    // Tekst z częściowym pogrubieniem jest składany z fragmentów.
    assert.equal(byNumber.get(7)[4], 'straightness', name);
    assert.equal(byNumber.get(8)[5], '0.125', name);

    assert.deepEqual(cellsOf(await workbook.readSheet(1)), [['To nie są dane do importu']], name);
    assert.deepEqual(cellsOf(await workbook.readSheet(2)), [['Polski', 'Angielski'], ['ukryte', 'hidden']], name);
    assert.deepEqual(await workbook.readSheet(3), { rows: [], columnCount: 0 }, name);
    await assert.rejects(workbook.readSheet(9), SpreadsheetError);
  }
});

test('XLSX: wynik formuły tekstowej zapamiętany w pliku jest odczytywany', async () => {
  // LibreOffice zapisuje wynik formuły; openpyxl zostawia samą formułę (wtedy komórka jest pusta).
  const recalculated = await (await openWorkbook(await fixture('libreoffice-cases.xlsx'))).readSheet(0);
  assert.equal(recalculated.rows.at(-1).cells[4], 'roundness');
  const formulaOnly = await (await openWorkbook(await fixture('openpyxl-cases.xlsx'))).readSheet(0);
  assert.equal(formulaOnly.rows.at(-1).cells[4], '');
});

// ---------------------------------------------------------------- XLSX: zapis

test('XLSX: zapisany skoroszyt daje przy odczycie te same wartości', async () => {
  const header = ['Tekst', 'Liczba', 'Uwagi'];
  const rows = [
    ['zażółć gęślą jaźń', 3, 'A < B & C > D "x" \'y\''],
    ['dwa\nwiersze', 0.5, '  spacje na brzegach  '],
    ['emoji 📐 i znak sterujący\u0001', null, ''],
    ['', '', 'tylko trzecia kolumna'],
    ['=SUMA(A1:A2)', -7, '_x000D_ dosłownie']
  ];
  const bytes = await createWorkbook({ sheetName: 'Pojęcia: test/1', header, rows });
  const workbook = await openWorkbook(bytes);
  assert.deepEqual(workbook.sheets, [{ name: 'Pojęcia test 1', hidden: false }]);
  const table = await workbook.readSheet(0);
  assert.deepEqual(cellsOf(table), [
    header,
    ['zażółć gęślą jaźń', '3', 'A < B & C > D "x" \'y\''],
    ['dwa\nwiersze', '0.5', '  spacje na brzegach  '],
    ['emoji 📐 i znak sterujący'],
    ['', '', 'tylko trzecia kolumna'],
    ['=SUMA(A1:A2)', '-7', '_x000D_ dosłownie']
  ]);
  assert.deepEqual(numbersOf(table), [1, 2, 3, 4, 5, 6]);
});

test('nazwa arkusza jest skracana i czyszczona ze znaków zakazanych przez Excel', () => {
  assert.equal(safeSheetName('Finanse: raporty/2026 [v2]?'), 'Finanse raporty 2026 v2');
  assert.equal(safeSheetName('x'.repeat(50)).length, 31);
  assert.equal(safeSheetName('  '), 'Arkusz1');
});

// ---------------------------------------------------------------- CSV

test('CSV z polskiego Excela: Windows-1250 i średniki są wykrywane, polskie znaki poprawne', async () => {
  const bytes = await fixture('polish-windows-1250.csv');
  assert.equal(detectEncoding(bytes), 'windows-1250');
  const text = decodeText(bytes, 'windows-1250');
  assert.equal(detectDelimiter(text), ';');
  const table = parseCsv(text, ';');
  assert.equal(table.rows.length, 5);
  assert.deepEqual(table.rows[0].cells.slice(0, 5), ['Dziedzina', 'Moduł', 'Lekcja', 'Pojęcie PL', 'Pojęcie EN']);
  assert.equal(table.rows[1].cells[3], 'zarząd');
  // Średnik wewnątrz pola w cudzysłowie nie dzieli pola.
  assert.equal(table.rows[1].cells[5], 'Organ prowadzący sprawy spółki; reprezentuje ją na zewnątrz.');
  assert.equal(table.rows[1].cells[7], 'Zarząd zatwierdził „plan naprawczy”.');
  assert.equal(table.rows[1].cells[8], 'The board approved the "recovery plan".');
  // Pole z nowym wierszem w środku pozostaje jednym polem.
  assert.equal(table.rows[2].cells[5], 'Organ nadzoru.\nPowołuje zarząd.');
  assert.equal(table.rows[3].cells[7], 'Żółć, gęślą jaźń – test znaków.');
});

test('CSV: te same dane w UTF-8 z przecinkami, UTF-16 z tabulatorami i ISO-8859-2', async () => {
  const reference = parseCsv(decodeText(await fixture('polish-windows-1250.csv'), 'windows-1250'), ';');

  const utf8 = await fixture('comma-utf8.csv');
  assert.equal(detectEncoding(utf8), 'utf-8');
  assert.equal(detectDelimiter(decodeText(utf8, 'utf-8')), ',');
  assert.deepEqual(parseCsv(decodeText(utf8, 'utf-8'), ','), reference);

  const utf16 = await fixture('tab-utf16.txt');
  assert.equal(detectEncoding(utf16), 'utf-16le');
  assert.equal(detectDelimiter(decodeText(utf16, 'utf-16le')), '\t');
  assert.deepEqual(parseCsv(decodeText(utf16, 'utf-16le'), '\t'), reference);

  const iso = await fixture('polish-iso-8859-2.csv');
  assert.equal(detectEncoding(iso), 'iso-8859-2');
  const isoTable = parseCsv(decodeText(iso, 'iso-8859-2'), ';');
  assert.equal(isoTable.rows[1].cells[3], 'zarząd');
  assert.equal(isoTable.rows[3].cells[7], 'Żółć, gęślą jaźń - test znaków.');
  // Ten sam plik odczytany w złym kodowaniu psuje litery ą, ś, ź – stąd wykrywanie.
  assert.notEqual(parseCsv(decodeText(iso, 'windows-1250'), ';').rows[1].cells[3], 'zarząd');
});

test('CSV: UTF-16 bez znacznika BOM jest rozpoznawane po układzie bajtów', () => {
  const text = 'Polski;Angielski\r\nbilans;balance sheet\r\n';
  const bytes = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) bytes[index * 2] = text.charCodeAt(index);
  assert.equal(detectEncoding(bytes), 'utf-16le');
  assert.equal(decodeText(bytes, 'utf-16le'), text);
});

test('CSV: wiersz „sep=” wskazuje separator i nie jest traktowany jak dane', async () => {
  const text = decodeText(await fixture('sep-directive.csv'), 'utf-8');
  assert.equal(separatorDirective(text), '|');
  assert.equal(detectDelimiter(text), '|');
  const table = parseCsv(text, '|');
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[0].cells[0], 'Dziedzina');
  assert.equal(table.rows[0].number, 1);
});

test('CSV: przypadki brzegowe składni', () => {
  const parse = (text, delimiter = ';') => cellsOf(parseCsv(text, delimiter));
  assert.deepEqual(parse('a;b\r\nc;d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parse('a;b\nc;d\n'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parse('a;b\rc;d\r'), [['a', 'b'], ['c', 'd']]);
  // Puste pola na końcu są obcinane, w środku zostają.
  assert.deepEqual(parse('a;;c;;\n;;x'), [['a', '', 'c'], ['', '', 'x']]);
  // Podwojony cudzysłów, separator i nowe wiersze w cudzysłowie.
  assert.deepEqual(parse('"a ""b"" c";"x;y";"1\r\n2"'), [['a "b" c', 'x;y', '1\n2']]);
  // Cudzysłów w środku zwykłego pola jest zwykłym znakiem.
  assert.deepEqual(parse('5" dysk;ok'), [['5" dysk', 'ok']]);
  // Niezamknięty cudzysłów: reszta pliku trafia do pola zamiast przepaść.
  assert.deepEqual(parse('a;"b;c\nd'), [['a', 'b;c\nd']]);
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse('\n\n'), []);

  // Puste rekordy są pomijane, ale numeracja rekordów zostaje jak w arkuszu.
  const table = parseCsv('a;b\n\n;;\nc;d', ';');
  assert.deepEqual(numbersOf(table), [1, 4]);
  assert.equal(table.columnCount, 2);
});

test('CSV: wykrywanie separatora nie daje się zmylić przecinkom w treści', () => {
  const semicolons = 'PL;EN;Opis\nbilans;balance sheet;Zestawienie aktywów, zobowiązań i kapitału, na dany dzień\n'
    + 'aktywa;assets;Zasoby, które firma kontroluje, i z których czerpie korzyści\n';
  assert.equal(detectDelimiter(semicolons), ';');
  assert.equal(detectDelimiter('PL,EN\nbilans,balance sheet\naktywa,assets\n'), ',');
  assert.equal(detectDelimiter('PL\tEN\nbilans\tbalance sheet\n'), '\t');
  // Jedna kolumna: zostaje domyślny średnik.
  assert.equal(detectDelimiter('bilans\naktywa\n'), ';');
});

test('CSV: zapis i ponowny odczyt zachowują trudne wartości', () => {
  const lines = [
    ['Term PL', 'Term EN', 'Notes'],
    ['zarząd', 'board; management', 'cytat "w cudzysłowie"'],
    [' spacja na początku', 'dwie\nlinie', null],
    ['', '', 'ostatnia kolumna'],
    [3, 0.5, undefined]
  ];
  const text = writeCsv(lines);
  assert.ok(text.endsWith('\r\n'));
  assert.deepEqual(cellsOf(parseCsv(text, ';')), [
    ['Term PL', 'Term EN', 'Notes'],
    ['zarząd', 'board; management', 'cytat "w cudzysłowie"'],
    [' spacja na początku', 'dwie\nlinie'],
    ['', '', 'ostatnia kolumna'],
    ['3', '0.5']
  ]);
  const bytes = encodeCsv(text);
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(detectEncoding(bytes), 'utf-8');
  assert.equal(decodeText(bytes, 'utf-8'), text);
});

// ---------------------------------------------------------------- rozpoznawanie formatu

test('openTableFile rozpoznaje XLSX i CSV po zawartości, nie po nazwie', async () => {
  const workbook = await openTableFile(await fixture('openpyxl-cases.xlsx'));
  assert.equal(workbook.kind, 'xlsx');
  assert.equal(workbook.sheets.length, 4);
  assert.equal((await workbook.readSheet(0)).rows.length, 7);

  const csv = await openTableFile(await fixture('polish-windows-1250.csv'));
  assert.deepEqual([csv.kind, csv.encoding, csv.delimiter], ['csv', 'windows-1250', ';']);
  assert.equal(csv.read().rows[1].cells[3], 'zarząd');
  // Użytkownik może wymusić inne kodowanie lub separator.
  assert.equal(csv.read({ delimiter: ',' }).columnCount < 12, true);

  const tabs = await openTableFile(await fixture('tab-utf16.txt'));
  assert.deepEqual([tabs.kind, tabs.encoding, tabs.delimiter], ['csv', 'utf-16le', '\t']);
});

test('openTableFile odrzuca nieobsługiwane pliki ze zrozumiałym komunikatem', async () => {
  const rejects = (bytes, pattern) => assert.rejects(openTableFile(bytes), (error) => {
    assert.ok(error instanceof SpreadsheetError, `oczekiwano SpreadsheetError, jest: ${error}`);
    assert.match(error.message, pattern);
    return true;
  });
  await rejects(new Uint8Array(0), /pusty/);
  await rejects(await fixture('old-format.xls'), /stary format Excela \(\.xls\)/);
  await rejects(await fixture('open-document.ods'), /ODS/);
  await rejects(new Uint8Array(await readFile(path.join(ROOT, 'icons/icon-192.png'))), /Nie rozpoznano formatu/);

  const encoder = new TextEncoder();
  await rejects(await createZip([{ name: 'word/document.xml', data: encoder.encode('<w/>') }]), /dokument Word/);
  await rejects(await createZip([{ name: 'cokolwiek.txt', data: encoder.encode('x') }]), /archiwum ZIP/);

  // Skoroszyt z uciętą końcówką: to wciąż „PK…”, ale bez spisu treści.
  const truncated = (await fixture('openpyxl-cases.xlsx')).slice(0, 2000);
  await rejects(truncated, /uszkodzony/);
});
