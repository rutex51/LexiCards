// Wersja 1.21: tabele (notatka – obiekty z sygnaturą, odwołaniem i podpisem „Tab. N.”; rysunek –
// element strony), karteczki na rysunku (zwinięcie, strzałka, ukrycie na obrazie) i grubości
// zakreślacza w ustawieniach narzędzi.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeArray } from '../../js/core/arrays.js';
import { createBackup, validateBackup } from '../../js/core/backup.js';
import {
  STICKY_ICON, cleanDrawing, cleanToolSettings, defaultToolSettings, elementBox, emptyDrawing, leaderStart, strokeBounds, strokesInRect,
  touchesStroke, translateStroke
} from '../../js/core/drawing.js';
import { buildExportFile } from '../../js/core/exporter.js';
import { noteSteps } from '../../js/core/listen.js';
import {
  NOTE_TABLE_LIMIT, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, cleanNoteTables, cleanTable, emptyTable, findTableByLabel, htmlWithTables, isEmptyTable,
  nextTableLabel, parseTableText, rowsFromHtml, tableCaption, tableHtml, tableLines, tableNumbers, tableSpeech, tableText, withTableLabels
} from '../../js/core/tables.js';
import { openWorkbook } from '../../js/core/xlsx.js';
import { makeBranch, makeLibrary } from './helpers.js';

const costs = () => ({ rows: [['Pozycja', 'Kwota'], ['Czynsz', '1 200 zł'], ['Media', '300 zł']], header: true, headerColumn: false, align: ['left', 'right'] });

test('tabela 1.21: sprawdzanie danych – wiersze wyrównane, granice, nagłówek domyślnie, wyrównanie kolumn', () => {
  assert.deepEqual(emptyTable(2, 3), { rows: [['', '', ''], ['', '', '']], header: true, headerColumn: false, align: ['left', 'left', 'left'] });
  const table = cleanTable({ rows: [['a', 'b', 'c'], ['d'], 'zły wiersz', ['e\r\nf', 7, null]], align: ['center', 'środek'] });
  assert.deepEqual(table.rows, [['a', 'b', 'c'], ['d', '', ''], ['e\nf', '7', '']], 'krótsze wiersze dopełnione, zły pominięty, \\r\\n → \\n');
  assert.deepEqual(table.align, ['center', 'left', 'left']);
  assert.equal(table.header, true);
  assert.equal(table.headerColumn, false);
  const big = cleanTable({ rows: Array.from({ length: 150 }, () => Array.from({ length: 20 }, () => 'x'.repeat(900))) });
  assert.equal(big.rows.length, TABLE_MAX_ROWS);
  assert.equal(big.rows[0].length, TABLE_MAX_COLUMNS);
  assert.equal(big.rows[0][0].length, 500);
  assert.equal(cleanTable({ rows: [] }), null);
  assert.equal(cleanTable({ rows: [[]] }), null);
  assert.equal(cleanTable(null), null);
  assert.equal(isEmptyTable(emptyTable()), true);
  assert.equal(isEmptyTable(costs()), false);
});

test('tabela 1.21: wklejanie z Excela (tabulatory, cudzysłowy z nowym wierszem) i tabeli HTML z Worda (colspan, akapity, znaki)', () => {
  assert.deepEqual(parseTableText('Nazwa\tKwota\r\nCzynsz\t"1 200\nzł"\nUwaga\t"cytat ""x"""\n'), [['Nazwa', 'Kwota'], ['Czynsz', '1 200\nzł'], ['Uwaga', 'cytat "x"']]);
  assert.deepEqual(parseTableText('a\nb'), [['a'], ['b']], 'kilka wierszy bez tabulatora – jedna kolumna');
  assert.equal(parseTableText('zwykły tekst'), null);
  assert.equal(parseTableText(''), null);
  const html = '<html><body><p>przed</p><table class=MsoTable><tr><td><p class=MsoNormal>A &amp; B</p></td><td colspan="2"><p>C1</p><p>C2</p></td></tr>'
    + '<tr><th>x</th><td><b>2</b></td><td>3</td></tr></table><table><tr><td>druga</td></tr></table></body></html>';
  assert.deepEqual(rowsFromHtml(html), [['A & B', 'C1\nC2', ''], ['x', '2', '3']]);
  assert.equal(rowsFromHtml('<p>bez tabeli</p>'), null);
});

test('tabele notatki 1.21: sygnatury „Tabela N” (jedyne także wśród obrazów), limit, numery „Tab. N.” w kolejności podglądu, podpis nad tabelą', () => {
  assert.equal(nextTableLabel(['Tabela 1', 'tabela 2', 'Obraz 1']), 'Tabela 3');
  const labeled = withTableLabels([{ label: 'Schemat' }, {}, { label: 'koszty' }, { label: 'Koszty' }], ['Schemat']);
  assert.deepEqual(labeled.map((table) => table.label), ['Tabela 1', 'Tabela 2', 'koszty', 'Tabela 3'], 'sygnatura obrazu i powtórzona – zastąpione');
  const tables = cleanNoteTables([{ ...costs(), label: 'Koszty', caption: '  Koszty   stałe ' }, { rows: 'zła' }, { ...costs(), label: '' }]);
  assert.deepEqual(tables.map((table) => [table.label, table.caption ?? null]), [['Koszty', 'Koszty stałe'], ['Tabela 1', null]]);
  assert.equal(cleanNoteTables(Array.from({ length: 40 }, () => costs())).length, NOTE_TABLE_LIMIT);
  assert.equal(findTableByLabel(tables, ' KOSZTY '), 0);
  const html = '<p>[[Tabela 1]]</p><p>tekst</p><p>[[koszty]]</p><p>[[Tabela 1]]</p>';
  assert.deepEqual(tableNumbers(html, tables), [2, 1]);
  assert.deepEqual(tableNumbers('<p>bez odwołań</p>', tables, true), [1, 2]);
  assert.equal(tableCaption('Koszty', 2, true), 'Tab. 2. Koszty');
  assert.equal(tableCaption('', 2, true), 'Tab. 2.');
  assert.equal(tableCaption('Koszty', 2, false), 'Koszty');
  assert.equal(tableCaption('', 2, false), null);
});

test('tabela 1.21: HTML (nagłówek w <thead>, nagłówki wierszy, wyrównanie, znaki, zakres wierszy), dla Worda ze stylami, tekst i linijki arkusza', () => {
  const table = { ...costs(), rows: [['Pozycja', 'Kwota'], ['Czynsz <x>', '1 200 zł'], ['Media\nprąd', '300 zł']], headerColumn: true };
  const html = tableHtml(table);
  assert.equal(html, '<table class="note-table"><thead><tr><th>Pozycja</th><th style="text-align:right;">Kwota</th></tr></thead><tbody>'
    + '<tr><th scope="row">Czynsz &lt;x&gt;</th><td style="text-align:right;">1 200 zł</td></tr>'
    + '<tr><th scope="row">Media<br>prąd</th><td style="text-align:right;">300 zł</td></tr></tbody></table>');
  assert.equal((tableHtml(table, { from: 1, to: 2 }).match(/<tr>/g) ?? []).length, 2, 'nagłówek i jeden wiersz treści');
  const portable = tableHtml(costs(), { portable: true });
  assert.ok(portable.startsWith('<table style="border-collapse:collapse;width:100%">'));
  assert.ok(portable.includes('border:1px solid #9a9a9a') && portable.includes('background:#f2f2f2;font-weight:bold;'));
  assert.equal(tableText(table), 'Pozycja\tKwota\nCzynsz <x>\t1 200 zł\nMedia prąd\t300 zł');
  assert.deepEqual(tableLines(costs()), ['Pozycja | Kwota', 'Czynsz | 1 200 zł', 'Media | 300 zł']);
  const tables = cleanNoteTables([{ ...costs(), label: 'Koszty', caption: 'Stałe' }, { ...costs(), label: 'Druga' }]);
  assert.equal(htmlWithTables('<p>Przed</p><p>[[koszty]]</p><p>Po</p>', tables),
    '<p>Przed</p><p><em>Koszty – Stałe</em><br><strong>Pozycja | Kwota</strong><br>Czynsz | 1 200 zł<br>Media | 300 zł</p><p>Po</p>'
    + '<p><em>Druga</em><br><strong>Pozycja | Kwota</strong><br>Czynsz | 1 200 zł<br>Media | 300 zł</p>');
  assert.equal(htmlWithTables('<p>bez</p>', []), '<p>bez</p>');
});

test('tabele w notatce 1.21: zapis (sama tabela też jest notatką), zapis bez pola zostawia tabele, kopia lekcji, kopia zapasowa, eksport do arkusza jako tekst', async () => {
  const { library } = await makeLibrary();
  const { lesson, module } = await makeBranch(library);
  await library.saveNote(lesson.id, { html: '', tables: [{ ...costs(), label: 'Koszty', caption: 'Stałe' }], numberFigures: true });
  let note = library.getNote(lesson.id);
  assert.ok(note, 'notatka z samą tabelą');
  assert.deepEqual(note.tables.map((table) => [table.label, table.caption, table.rows.length]), [['Koszty', 'Stałe', 3]]);
  await library.saveNote(lesson.id, { html: '<p>Tekst</p><p>[[Koszty]]</p>' });
  note = library.getNote(lesson.id);
  assert.equal(note.tables.length, 1, 'zapis bez pola tables zostawia tabele');
  await assert.rejects(() => library.saveNote(lesson.id, { html: '<p>x</p>', tables: Array.from({ length: 31 }, () => costs()) }), /najwyżej 30 tabel/);

  const copy = await library.copyLesson(lesson.id, module.id);
  const copied = library.getNote(copy.id);
  assert.deepEqual([copied.tables.map((table) => table.label), copied.numberFigures], [['Koszty'], true], 'kopia lekcji z tabelą i numeracją');

  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  const restored = validateBackup(backup).data.notes.find((item) => item.lessonID === lesson.id);
  assert.deepEqual(restored.tables, note.tables);
  backup.data.notes.find((item) => item.lessonID === lesson.id).tables.push({ rows: 'uszkodzona' });
  assert.equal(validateBackup(backup).data.notes.find((item) => item.lessonID === lesson.id).tables.length, 1, 'uszkodzona tabela pominięta');

  const file = await buildExportFile(library, { kind: 'lesson', id: lesson.id }, 'xlsx');
  const book = await openWorkbook(file.bytes);
  const sheet = await book.readSheet(1);
  const cell = sheet.rows.slice(1).flatMap((row) => row.cells).find((value) => String(value ?? '').includes('Czynsz'));
  assert.ok(cell, 'tabela w komórce notatki');
  assert.ok(String(cell).includes('Czynsz | 1 200 zł'), String(cell));
});

test('rysunek 1.21: tabela i karteczka – sprawdzanie danych, zwinięta karteczka (ikona), strzałka w granicach, dotknięciu i przesunięciu, bez szyku', () => {
  const table = { tool: 'table', x: 100, y: 100, width: 400, height: 120, size: 26, color: '#1D1D1F', ...costs() };
  const sticky = { tool: 'sticky', x: 600, y: 200, width: 300, height: 220, size: 30, color: 'pink', text: 'Sprawdzić', created: '2026-10-20', leader: { x: 1100, y: 600 } };
  const cleaned = cleanDrawing({
    ...emptyDrawing(),
    strokes: [table, sticky, { ...sticky, color: 'fioletowa', collapsed: true, hidden: true, created: 'wczoraj', leader: { x: 'x' } },
      { tool: 'table', x: 0, y: 0, width: 10, height: 10, size: 20, color: '#000000', rows: [] }, { tool: 'sticky', x: 0, y: 0, width: 10, height: 10, size: 20 }]
  });
  assert.equal(cleaned.strokes.length, 3, 'tabela bez wierszy i karteczka bez tekstu – pominięte');
  assert.equal(cleaned.strokes[0].color, '#1d1d1f');
  assert.deepEqual(cleaned.strokes[0].rows, costs().rows);
  assert.deepEqual(cleaned.strokes[1].leader, { x: 1100, y: 600 });
  assert.deepEqual([cleaned.strokes[2].color, cleaned.strokes[2].collapsed, cleaned.strokes[2].hidden, cleaned.strokes[2].created, cleaned.strokes[2].leader],
    ['yellow', true, true, '2026-01-01', undefined]);

  // Zwinięta – tylko ikona; strzałka – w granicach, w dotknięciu i w zaznaczeniu prostokątem.
  assert.deepEqual(elementBox({ ...sticky, collapsed: true }), { x: 600, y: 200, width: STICKY_ICON, height: STICKY_ICON });
  const bounds = strokeBounds(sticky);
  assert.deepEqual([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY], [600, 200, 1106, 606]);
  const start = leaderStart(sticky);
  assert.equal(start.y, 420, 'strzałka zaczyna się na brzegu karteczki (tu – dolnym)');
  assert.ok(start.x > 750 && start.x < 900);
  assert.equal(touchesStroke(sticky, (start.x + 1100) / 2, (start.y + 600) / 2, 2), true, 'punkt w połowie strzałki');
  assert.equal(touchesStroke(sticky, 1000, 250, 2), false);
  assert.deepEqual(strokesInRect([sticky], { x0: 590, y0: 190, x1: 950, y1: 450 }), [], 'bez końca strzałki – nie w całości');
  assert.deepEqual(strokesInRect([sticky], { x0: 590, y0: 190, x1: 1120, y1: 620 }), [0]);
  const moved = translateStroke(sticky, 10, -20);
  assert.deepEqual([moved.x, moved.y, moved.leader], [610, 180, { x: 1110, y: 580 }]);
  assert.equal(makeArray([table, sticky], { kind: 'linear', columns: 2, dx: 100, rows: 1, dy: 0 }, 5000), null, 'tabeli i karteczki nie ma w szyku');
});

test('narzędzia 1.21: grubości kropek zakreślacza (4–60) i kolor karteczki zapamiętane, złe – domyślne', () => {
  assert.deepEqual(defaultToolSettings().highlighterWidths, [14, 24, 36]);
  assert.equal(defaultToolSettings().stickyColor, 'yellow');
  const tools = cleanToolSettings({ highlighterWidths: [2, 30.4, 99], stickyColor: 'green' });
  assert.deepEqual(tools.highlighterWidths, [4, 30, 60]);
  assert.equal(tools.stickyColor, 'green');
  assert.deepEqual(cleanToolSettings({ highlighterWidths: [10, 'x', 20], stickyColor: 'czarna' }).highlighterWidths, [10, 24, 20]);
  assert.equal(cleanToolSettings({ highlighterWidths: [10] }).highlighterWidths.length, 3);
  assert.equal(cleanToolSettings({ stickyColor: 'czarna' }).stickyColor, 'yellow');
});

test('słuchanie: tabela w miejscu odwołania – podpis i wiersze (komórki po przecinku), tabela bez odwołania po tekście, każda raz', () => {
  const tables = [
    { label: 'Koszty', caption: 'Koszty stałe', header: true, headerColumn: false, align: ['left', 'right'], rows: [['Pozycja', 'Kwota'], ['Czynsz', '1 200 zł'], ['Media', '']] },
    { label: 'Tabela 2', header: false, headerColumn: false, align: ['left'], rows: [['Bez odwołania']] }
  ];
  assert.deepEqual(tableSpeech(tables[0]), ['Koszty stałe', 'Pozycja, Kwota', 'Czynsz, 1 200 zł', 'Media']);
  const note = { html: '<p>Wstęp.</p><p>[[koszty]]</p><p>[[Obraz 1]]</p><p>Koniec.</p>', htmlEN: '<p>[[Koszty]]</p><p>End.</p>', tables };
  assert.deepEqual(noteSteps(note, 'Budżet', 'both').map(({ kind, text, lang }) => `${kind}/${lang} ${text}`), [
    'noteTitle/pl Notatka do lekcji Budżet.',
    'note/pl Wstęp.',
    'note/pl Koszty stałe',
    'note/pl Pozycja, Kwota',
    'note/pl Czynsz, 1 200 zł',
    'note/pl Media',
    'note/pl Koniec.',
    'note/pl Bez odwołania',
    'noteTitle/en English version.',
    'note/en End.'
  ]);
  // Tabele bez odwołania przed tekstem – jak obrazy („Obrazy przed tekstem”).
  const first = noteSteps({ html: '<p>Tekst.</p>', tables: [tables[1]], imagesFirst: true }, 'X', 'pl').map((step) => step.text);
  assert.deepEqual(first, ['Notatka do lekcji X.', 'Bez odwołania', 'Tekst.']);
});
