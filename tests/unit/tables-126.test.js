// Tabele 1.26: formaty wartości kolumn (tekst, liczba całkowita, liczba 1 234,56, waluta, data),
// osobne wyrównanie wiersza nagłówka, szerokości kolumn (udziały, przeciąganie granicy) – zapis,
// HTML podglądu i tekst schowka, tabela na rysunku.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanDrawing } from '../../js/core/drawing.js';
import {
  TABLE_FORMATS, cellAlign, cleanColumnWidths, cleanTable, displayCell, displayRows, formatNumber, isNumericFormat, moveColumnBorder, parseDate,
  parseNumber, tableHtml, tableLines, tableText, widthsWithColumn, widthsWithoutColumn
} from '../../js/core/tables.js';

const NBSP = ' ';
const priced = () => cleanTable({
  rows: [['Pozycja', 'Ilość', 'Cena', 'Data'], ['Śruba M6', '1200', '1234,5', '2026-10-20'], ['Nakrętka', '35,7', '0.99', '1/2/26'], ['Razem', 'brak', '', '31.02.2026']],
  align: ['left', 'right', 'right', 'left'], headAlign: ['center', 'right', 'right', 'left'], formats: ['text', 'integer', 'pln', 'date'], colWidths: [2, 1, 1, 1]
});

test('tabele 1.26: liczby i daty z tekstu komórki, liczby po polsku', () => {
  assert.deepEqual(['1,5', '1.5', '1 234,56', '1.234.567', '1,234.56', '1.234,56 zł', '12 345,6 €', '−7', '-0,5', '+3', "1'000"].map(parseNumber),
    [1.5, 1.5, 1234.56, 1234567, 1234.56, 1234.56, 12345.6, -7, -0.5, 3, 1000]);
  assert.deepEqual(['abc', '', '1e3', '12,5 kg', '1,,2', '-'].map(parseNumber), [null, null, null, null, null, null]);
  assert.deepEqual([formatNumber(1234.5), formatNumber(1234567.891), formatNumber(-0.004), formatNumber(-12.5, 0, false), formatNumber(999.995)],
    [`1${NBSP}234,50`, `1${NBSP}234${NBSP}567,89`, '0,00', '−13', `1${NBSP}000,00`]);
  assert.deepEqual(['2026-10-20', '20.10.2026', '1/2/26', '5-3-2026', '31.02.2026', '2026-13-01', '20.10'].map(parseDate),
    ['20.10.2026', '20.10.2026', '01.02.2026', '05.03.2026', null, null, null]);
  assert.deepEqual(TABLE_FORMATS.map((format) => format.id), ['text', 'integer', 'number', 'pln', 'eur', 'usd', 'gbp', 'chf', 'date']);
  assert.deepEqual(['text', 'integer', 'number', 'eur', 'date', 'xx'].map(isNumericFormat), [false, true, true, true, false, false]);
});

test('tabele 1.26: wartości w formacie kolumny – nagłówek, puste i nie-liczby bez zmian; wyrównanie nagłówka osobno', () => {
  const table = priced();
  assert.deepEqual(displayRows(table), [
    ['Pozycja', 'Ilość', 'Cena', 'Data'],
    ['Śruba M6', '1200', `1${NBSP}234,50${NBSP}zł`, '20.10.2026'],
    ['Nakrętka', '36', `0,99${NBSP}zł`, '01.02.2026'],
    ['Razem', 'brak', '', '31.02.2026']
  ]);
  // Zapis bez zmian – format działa tylko przy pokazywaniu.
  assert.equal(table.rows[1][2], '1234,5');
  // Kilka wierszy w komórce – tekst jak wpisany; kolumna nagłówków wierszy – bez formatu.
  const lines = cleanTable({ rows: [['1', '2'], ['3\n4', '5']], header: false, headerColumn: true, formats: ['number', 'number'] });
  assert.deepEqual(displayRows(lines), [['1', '2,00'], ['3\n4', '5,00']]);
  const euro = cleanTable({ rows: [['a'], ['1000']], formats: ['eur'] });
  assert.equal(displayCell(euro, 1, 0), `1${NBSP}000,00${NBSP}€`);
  assert.deepEqual([cellAlign(table, 0, 0), cellAlign(table, 1, 0), cellAlign(table, 0, 1), cellAlign(table, 2, 3)], ['center', 'left', 'right', 'left']);
});

test('tabele 1.26: zapis – wyrównanie nagłówka, formaty i szerokości tylko gdy coś zmieniają; złe dane pominięte', () => {
  const table = priced();
  assert.deepEqual(table.headAlign, ['center', 'right', 'right', 'left']);
  assert.deepEqual(table.formats, ['text', 'integer', 'pln', 'date']);
  assert.deepEqual(table.colWidths, [0.4, 0.2, 0.2, 0.2]);
  const plain = cleanTable({ rows: [['a', 'b']], align: ['left', 'center'], headAlign: ['left', 'center'], formats: ['text', 'bogus'], colWidths: [1] });
  assert.deepEqual(Object.keys(plain).sort(), ['align', 'header', 'headerColumn', 'rows'], 'nic do zapisania – pola pominięte');
  assert.equal(cleanTable({ rows: [['a', 'b']], formats: ['date'] }).formats[1], 'text', 'brakujący format – tekst');
  assert.equal('colWidths' in cleanTable({ rows: [['a', 'b']], colWidths: [1, -1] }), false);
  assert.equal('colWidths' in cleanTable({ rows: [['a', 'b']], colWidths: [1, 'x'] }), false);
  // Udziały: suma 1, najwęższa kolumna 2%.
  assert.deepEqual(cleanColumnWidths([0.0001, 1], 2), [0.0196, 0.9804]);
  assert.equal(cleanColumnWidths([1, 1], 3), null);
});

test('tabele 1.26: granica kolumn – lewa szersza, prawa węższa, razem tyle samo; kolumny dodane i usunięte', () => {
  const widths = moveColumnBorder([0.25, 0.25, 0.5], 0, 0.1);
  assert.deepEqual(widths.map((value) => Math.round(value * 1000) / 1000), [0.35, 0.15, 0.5]);
  const clamped = moveColumnBorder([0.25, 0.25, 0.5], 1, 1);
  assert.deepEqual(clamped.map((value) => Math.round(value * 1000) / 1000), [0.25, 0.73, 0.02], 'prawa nie mniej niż 2%');
  assert.deepEqual(widthsWithColumn([0.5, 0.5], 1), [0.3333, 0.3333, 0.3333]);
  assert.deepEqual(widthsWithoutColumn([0.25, 0.25, 0.5], 2), [0.5, 0.5]);
  assert.equal(widthsWithColumn(null, 0), null);
  assert.equal(widthsWithoutColumn([1], 0), null);
});

test('tabele 1.26: HTML podglądu (szerokości kolumn, wyrównanie nagłówka, wartości w formacie), tekst schowka i arkusza', () => {
  const table = priced();
  const html = tableHtml(table);
  assert.ok(html.startsWith('<table class="note-table"><colgroup><col style="width:40%"><col style="width:20%">'), html);
  assert.ok(html.includes('<th style="text-align:center;">Pozycja</th>'), 'nagłówek do środka');
  assert.ok(html.includes(`<td style="text-align:right;">1${NBSP}234,50${NBSP}zł</td>`), 'waluta do prawej');
  assert.ok(html.includes('<td>20.10.2026</td>'));
  const portable = tableHtml(table, { portable: true });
  assert.ok(portable.startsWith('<table style="border-collapse:collapse;width:100%"><colgroup>'), portable);
  assert.equal(tableHtml(cleanTable({ rows: [['a']] })).includes('colgroup'), false, 'bez szerokości – układ z treści');
  assert.equal(tableText(table).split('\n')[1], `Śruba M6\t1200\t1${NBSP}234,50${NBSP}zł\t20.10.2026`);
  assert.equal(tableLines(table)[2], `Nakrętka | 36 | 0,99${NBSP}zł | 01.02.2026`);
});

test('tabele 1.26: tabela na rysunku zachowuje formaty, wyrównanie nagłówka i szerokości kolumn', () => {
  const element = { tool: 'table', x: 100, y: 100, width: 600, height: 120, size: 22, color: '#1d1d1f', ...priced() };
  const cleaned = cleanDrawing({ width: 1600, height: 1100, version: 10, strokes: [element] }).strokes[0];
  assert.deepEqual([cleaned.formats, cleaned.headAlign, cleaned.colWidths], [element.formats, element.headAlign, element.colWidths]);
});
