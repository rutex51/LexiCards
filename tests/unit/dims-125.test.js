// Rysunek 1.25: jednostka liczb wymiarów bez jednostki (mm, cm, m, cale) z oznaczeniem „Wymiary w …”,
// tolerancje długości zapisane w mm (i przeliczenie starszych rysunków), odchyłki w ramce tolerancji,
// tabela pasowań ISO 286 i ostatnio użyte pasowania.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DIM_UNITS, DRAWING_VERSION, cleanDrawing, cleanToolSettings, defaultDimUnit, defaultToolSettings, dimFactor, dimFormat, dimMillimeters,
  dimUnitLabel, dimUnitNote, dimensionText, formatTolerance, hasMeasuredContent
} from '../../js/core/drawing.js';
import {
  DEFAULT_RECENT_FITS, HOLE_LETTERS, IT_GRADES, PREFERRED_FITS, RECENT_FITS_MAX, SHAFT_LETTERS, cleanRecentFits, isTableFit, isToleranceClass, rememberFit
} from '../../js/core/fits.js';
import { cleanSymbol, gdtDeviations, signedDeviation } from '../../js/core/gdt.js';
import { FIT_RE, scaleDimTolerances, withDimTolerance } from '../../js/core/shapes.js';

const rect = (extra = {}) => ({ tool: 'shape', shape: 'rect', color: '#1d1d1f', size: 3, x: 500, y: 400, w: 220, h: 88, angle: 0, skew: 0, adjust: 0, ...extra });
const CM = { value: 1, unit: 'cm' };

test('jednostki 1.25: liczby bez jednostki w mm, cm, m i calach, oznaczenie „Wymiary w …”, tolerancje w mm pokazane w jednostce liczby', () => {
  assert.deepEqual(DIM_UNITS.map((unit) => unit.id), ['mm', 'cm', 'm', 'in']);
  assert.deepEqual([defaultDimUnit(CM), defaultDimUnit({ value: 1, unit: 'ft' })], ['mm', 'in']);
  assert.deepEqual(dimFormat({ scale: CM }), { style: 'unit', unit: null });
  assert.deepEqual(dimFormat({ scale: CM, dimStyle: 'technical' }), { style: 'technical', unit: 'mm' });
  assert.deepEqual(dimFormat({ scale: CM, dimStyle: 'technical', dimUnit: 'cm' }), { style: 'technical', unit: 'cm' });
  assert.deepEqual(dimFormat({ scale: { value: 1, unit: 'in' }, dimStyle: 'technical', dimUnit: 'xx' }), { style: 'technical', unit: 'in' });
  // 220 jednostek = 5 kratek = 5 cm.
  const shape = withDimTolerance(rect(), 'width', { kind: 'dev', upper: 0.1, lower: -0.05 });
  const text = (unit) => dimensionText(shape, 'width', CM, { style: 'technical', unit });
  assert.equal(text('mm'), '50 +0,1/−0,05');
  assert.equal(text('cm'), '5 +0,01/−0,005');
  assert.equal(text('m'), '0,05 +0,0001/−0,00005');
  assert.equal(dimensionText(shape, 'width', { value: 1, unit: 'in' }, { style: 'technical', unit: 'in' }), '5 +0,003937/−0,001969', 'cale – z mm');
  assert.equal(dimensionText(shape, 'width', CM), '5 cm +0,01/−0,005', 'liczby „5 cm” – tolerancja w cm');
  assert.equal(dimensionText(withDimTolerance(rect(), 'width', { kind: 'sym', value: 0.02 }), 'width', CM, { style: 'technical', unit: 'cm' }), '5±0,002');
  // Kąt – w stopniach, bez przeliczania.
  const skewed = withDimTolerance(rect({ skew: Math.tan((25 * Math.PI) / 180) }), 'skew', { kind: 'sym', value: 1 });
  assert.equal(dimensionText(skewed, 'skew', CM, { style: 'technical', unit: 'cm' }), '25°±1°');
  assert.deepEqual([dimFactor(CM, { style: 'technical', unit: 'cm' }), dimFactor(CM, { style: 'technical', unit: 'm' }), dimFactor(CM, 'unit')], [1, 0.01, 1]);
  assert.deepEqual([dimMillimeters(CM, 'unit'), dimMillimeters(CM, { style: 'technical', unit: 'in' })], [10, 25.4]);
  assert.deepEqual([dimUnitLabel(CM, { style: 'technical', unit: 'cm' }), dimUnitLabel(CM, 'unit')], ['cm', 'cm']);
  assert.deepEqual([dimUnitNote({ style: 'technical', unit: 'mm' }), dimUnitNote({ style: 'technical', unit: 'in' }), dimUnitNote({ style: 'unit', unit: null })],
    ['Wymiary w mm', 'Wymiary w calach', null]);
  assert.deepEqual([formatTolerance(0.1), formatTolerance(0.0005), formatTolerance(12.5), formatTolerance(0)], ['0,1', '0,0005', '12,5', '0']);
  // Oznaczenie tylko przy wymiarach długości albo ramkach tolerancji.
  assert.equal(hasMeasuredContent({ strokes: [rect()] }), false);
  assert.equal(hasMeasuredContent({ strokes: [rect({ dims: ['skew'] })] }), false);
  assert.equal(hasMeasuredContent({ strokes: [rect({ dims: ['width'] })] }), true);
  assert.equal(hasMeasuredContent({ strokes: [{ tool: 'gdt' }] }), true);
});

test('jednostki 1.25: zapis jednostki z rysunkiem i przeliczenie tolerancji starszych rysunków do mm (format 10)', () => {
  assert.equal(DRAWING_VERSION, 18, 'od 1.47 – bryły; 1.45 – schematy procesów; 1.44 – diagramy jakości i układ kartki; 1.42 – wymiar długości łuku, kierunek wymiaru, osie okręgu; 1.41 – ramka rysunkowa; 1.40 – wielokąt foremny, półprosta, narożniki, kreskowanie (1.38 – uzupełnienia tolerancji i symboli, 1.36 – warstwy)');
  const tolerated = withDimTolerance(withDimTolerance(rect({ dims: ['width', 'skew'] }), 'width', { kind: 'dev', upper: 0.01, lower: -0.005 }), 'skew', { kind: 'sym', value: 1 });
  const base = { width: 1600, height: 1100, strokes: [tolerated] };
  // Liczby „5 cm” (format 9): tolerancja w cm – ×10; kąt bez zmian.
  const fromCm = cleanDrawing({ ...base, version: 9, scale: CM });
  assert.deepEqual(fromCm.strokes[0].dimTols, { width: { kind: 'dev', upper: 0.1, lower: -0.05 }, skew: { kind: 'sym', value: 1 } });
  assert.equal(fromCm.version, DRAWING_VERSION);
  // Styl „50” (format 8) – w mm, bez zmian; przy skali imperialnej – w calach (×25,4).
  assert.deepEqual(cleanDrawing({ ...base, version: 8, scale: CM, dimStyle: 'technical' }).strokes[0].dimTols.width, { kind: 'dev', upper: 0.01, lower: -0.005 });
  assert.deepEqual(cleanDrawing({ ...base, version: 8, scale: { value: 1, unit: 'in' }, dimStyle: 'technical' }).strokes[0].dimTols.width, { kind: 'dev', upper: 0.254, lower: -0.127 });
  // Skala w metrach, „5 cm” – ×1000; szyk – też kształty w środku.
  assert.equal(cleanDrawing({ ...base, version: 9, scale: { value: 1, unit: 'm' } }).strokes[0].dimTols.width.upper, 10);
  // Format 10 – bez przeliczania (zapis w mm).
  assert.deepEqual(cleanDrawing({ ...base, version: 10, scale: CM }).strokes[0].dimTols.width, { kind: 'dev', upper: 0.01, lower: -0.005 });
  assert.deepEqual(scaleDimTolerances(tolerated, 10).dimTols, { width: { kind: 'dev', upper: 0.1, lower: -0.05 }, skew: { kind: 'sym', value: 1 } });
  // Jednostka zapisana tylko przy stylu bez jednostki i tylko znana.
  assert.equal(cleanDrawing({ ...base, version: 10, dimStyle: 'technical', dimUnit: 'cm' }).dimUnit, 'cm');
  assert.equal('dimUnit' in cleanDrawing({ ...base, version: 10, dimStyle: 'technical', dimUnit: 'km' }), false);
  assert.equal('dimUnit' in cleanDrawing({ ...base, version: 10, dimUnit: 'cm' }), false);
});

test('ramka tolerancji 1.25: odchyłki po tolerancji – obie albo żadna, górna nie mniejsza od dolnej, napisy ze znakiem', () => {
  const frame = (extra) => cleanSymbol({ tool: 'gdt', x: 100, y: 100, size: 26, color: '#000000', symbol: 'position', value: '0,1', datums: ['A'], ...extra }, 1600, 1100);
  const withDeviations = frame({ upper: 0.02, lower: -0.01 });
  assert.deepEqual([withDeviations.upper, withDeviations.lower], [0.02, -0.01]);
  assert.deepEqual(gdtDeviations(withDeviations), { upper: '+0,02', lower: '−0,01' });
  assert.equal('upper' in frame({ upper: 0.02 }), false, 'jedna odchyłka – pominięta');
  assert.equal('upper' in frame({ upper: -0.02, lower: 0.01 }), false, 'górna mniejsza od dolnej – pominięte');
  assert.equal(gdtDeviations(frame({})), null);
  assert.ok(frame({ upper: 0.02, lower: -0.01, cells: undefined }).cells[1] > frame({}).cells[1], 'szacunek szerokości pola – z odchyłkami szersze');
  assert.deepEqual([signedDeviation(0.02), signedDeviation(-0.005), signedDeviation(0)], ['+0,02', '−0,005', '0']);
});

test('pasowania 1.25: tabela ISO 286 (litery, klasy IT, pasowania zalecane), ostatnio użyte pasowania', () => {
  assert.equal(HOLE_LETTERS.length, 28);
  assert.deepEqual([HOLE_LETTERS.includes('JS'), SHAFT_LETTERS.includes('js'), SHAFT_LETTERS.includes('zc')], [true, true, true]);
  assert.deepEqual([IT_GRADES[0], IT_GRADES.at(-1), IT_GRADES.length], ['01', '18', 20]);
  assert.deepEqual(['H7', 'js6', 'ZC11', 'h01', 'Js6', 'H19', 'Q7', 'H'].map(isToleranceClass), [true, true, true, true, false, false, false, false]);
  assert.deepEqual(['H7/g6', 'K7/js6', 'g6/H7', 'H7/G6', 'H7'].map(isTableFit), [true, true, false, false, true]);
  // Każde pasowanie zalecane – poprawne w tabeli i w zapisie wymiaru.
  const all = PREFERRED_FITS.flatMap((system) => system.groups.flatMap((group) => group.fits));
  assert.ok(all.length >= 26);
  assert.ok(all.every((fit) => isTableFit(fit) && FIT_RE.test(fit)), 'pasowania zalecane poprawne');
  assert.deepEqual(PREFERRED_FITS[0].groups.map((group) => group.label), ['Luźne', 'Mieszane', 'Ciasne']);
  // Ostatnio użyte: na początku, bez powtórzeń, najwyżej 6.
  let recent = [...DEFAULT_RECENT_FITS];
  recent = rememberFit(recent, 'K7/js6');
  assert.deepEqual(recent.slice(0, 2), ['K7/js6', 'H7']);
  assert.equal(recent.length, RECENT_FITS_MAX);
  recent = rememberFit(recent, 'H7');
  assert.deepEqual(recent.slice(0, 2), ['H7', 'K7/js6']);
  assert.equal(new Set(recent).size, recent.length);
  assert.deepEqual(cleanRecentFits(['H7/g6', 'xx', 'H7/g6', 'js6'], (fit) => FIT_RE.test(fit)), ['H7/g6', 'js6']);
  assert.deepEqual(cleanRecentFits('H7', () => true), [...DEFAULT_RECENT_FITS]);
  assert.deepEqual(defaultToolSettings().recentFits, [...DEFAULT_RECENT_FITS]);
  assert.deepEqual(cleanToolSettings({ recentFits: ['H8/f7', 'bad fit'] }).recentFits, ['H8/f7']);
});
