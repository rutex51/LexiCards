// Tolerancje i symbole – uzupełnienia 1.38: wymiary graniczne, rodzaj wymiaru (dokładny, pomocniczy, kontrolny),
// miejsca po przecinku; ramka tolerancji z Ⓟ, modyfikatorami baz, drugim wierszem i „dookoła”; chropowatość
// z kierunkiem struktury, naddatkiem i metodą; odnośnik (karteczka bez tła); zapis DXF.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STICKY_COLORS, dimensionParts, dimensionText, emptyDrawing, stickyColor } from '../../js/core/drawing.js';
import { drawingToDxf, dxfPrimitives, dxfText, parseDxf } from '../../js/core/dxf.js';
import { cleanDatumPairs, cleanSymbol, gdtHeight, roughnessLayout } from '../../js/core/gdt.js';
import { toneStroke } from '../../js/core/layers.js';
import { cleanDimTolerance, withDimTolerance } from '../../js/core/shapes.js';

const technical = { style: 'technical', unit: 'mm' };
const scale = { value: 1, unit: 'cm' };
const rect = (dimTols = {}) => ({
  tool: 'shape', shape: 'rect', color: '#1d1d1f', size: 2, x: 400, y: 300, w: 220, h: 88, angle: 0, skew: 0, adjust: 0, dims: ['width', 'height'], dimTols
});

test('wymiar 1.38: sprawdzanie – graniczne, rodzaj wymiaru, miejsca po przecinku; dokładny i pomocniczy bez tolerancji', () => {
  assert.deepEqual(cleanDimTolerance({ kind: 'limits', upper: 0.05, lower: -0.02 }), { kind: 'limits', upper: 0.05, lower: -0.02 });
  assert.deepEqual(cleanDimTolerance({ style: 'inspection', kind: 'sym', value: 0.1, places: 2 }), { style: 'inspection', places: 2, kind: 'sym', value: 0.1 });
  assert.deepEqual(cleanDimTolerance({ style: 'basic', kind: 'sym', value: 0.1, prefix: '⌀' }), { prefix: '⌀', style: 'basic' }, 'dokładny – bez tolerancji');
  assert.deepEqual(cleanDimTolerance({ style: 'reference', kind: 'fit', fit: 'H7' }), { style: 'reference' });
  assert.equal(cleanDimTolerance({ style: 'boxed', places: 4 }), null, 'nieznany rodzaj i za dużo miejsc – pominięte');
  assert.deepEqual(cleanDimTolerance({ places: 0 }), { places: 0 });
  assert.equal(cleanDimTolerance({ kind: 'limits', upper: 0.05 }), null, 'graniczne – obie odchyłki');
});

test('wymiar 1.38: napisy – graniczne z odchyłek (miejsca jak dokładniejsza liczba), stała liczba miejsc, nawias pomocniczego, ramki', () => {
  const limits = rect({ width: { kind: 'limits', upper: 0.05, lower: -0.02 } });
  assert.deepEqual(dimensionParts(limits, 'width', scale, technical), { main: '', tolerance: { kind: 'limits', upper: '50,05', lower: '49,98' } });
  assert.equal(dimensionText(limits, 'width', scale, technical), '50,05/49,98');
  const fixed = withDimTolerance(limits, 'width', { kind: 'limits', upper: 0.05, lower: -0.02, places: 3, prefix: '⌀' });
  assert.equal(dimensionText(fixed, 'width', scale, technical), '⌀50,050/49,980');
  assert.equal(dimensionText(rect({ height: { style: 'basic', places: 2 } }), 'height', scale, technical), '20,00');
  assert.equal(dimensionParts(rect({ height: { style: 'basic' } }), 'height', scale, technical).frame, 'basic');
  assert.equal(dimensionText(rect({ width: { style: 'reference', prefix: '⌀' } }), 'width', scale, technical), '(⌀50)');
  const inspection = rect({ height: { style: 'inspection', kind: 'sym', value: 0.1 } });
  assert.deepEqual(dimensionParts(inspection, 'height', scale, technical), { main: '20', tolerance: { kind: 'sym', text: '±0,1' }, frame: 'inspection' });
  // Liczby „5 cm” (bez stylu technicznego): graniczne w centymetrach z jednostką; tolerancje zapisane w mm.
  assert.equal(dimensionText(rect({ width: { kind: 'limits', upper: 0.5, lower: -0.2 } }), 'width', scale, 'unit'), '5,05 cm/4,98 cm');
  assert.equal(dimensionText(rect({ width: { places: 1 } }), 'width', scale, 'unit'), '5,0 cm');
  // Kąt odcinka 30°: graniczne w stopniach.
  const segment = { tool: 'shape', shape: 'line', color: '#1d1d1f', size: 2, x: 400, y: 300, w: 200, h: 0, angle: -Math.PI / 6, skew: 0, adjust: 0, dims: ['angle'],
    dimTols: { angle: { kind: 'limits', upper: 0.5, lower: -0.5 } } };
  assert.equal(dimensionText(segment, 'angle', scale, technical), '30,5°/29,5°');
});

test('ramka tolerancji 1.38: Ⓟ z wysokością, modyfikatory baz (z pominiętą złą bazą), drugi wiersz, „dookoła”, wysokość dwóch wierszy', () => {
  assert.deepEqual(cleanDatumPairs(['a', '1', 'C'], ['M', 'L', 'X']), { datums: ['A', 'C'], mods: ['M', ''] });
  const frame = cleanSymbol({
    tool: 'gdt', x: 100, y: 100, size: 26, color: '#1D1D1F', symbol: 'position', value: '0.1', diameter: true, modifier: 'M',
    projected: ' 12 ', datums: ['A', 'B'], datumMods: ['M', ''], row2: { value: '0,05', diameter: true, datums: ['a', '', 'b'] }, allAround: true
  }, 1600, 1100);
  assert.deepEqual([frame.value, frame.projected, frame.datums, frame.datumMods, frame.row2, frame.allAround],
    ['0,1', '12', ['A', 'B'], ['M', ''], { value: '0,05', diameter: true, datums: ['A', 'B'] }, true]);
  assert.equal(frame.height, gdtHeight(26) * 2);
  assert.equal(frame.cells.length, 4);
  assert.equal(frame.cells2.length, 3);
  assert.equal(frame.width, Math.max(frame.cells.reduce((sum, cell) => sum + cell, 0), frame.cells[0] + frame.cells2.reduce((sum, cell) => sum + cell, 0)));
  // Drugi wiersz bez tolerancji – pominięty; bez modyfikatorów baz – bez pola; płaskość – bez baz w obu wierszach.
  const plain = cleanSymbol({ tool: 'gdt', x: 0, y: 0, size: 26, color: '#1d1d1f', symbol: 'position', value: '0,1', datums: ['A'], datumMods: ['', ''], row2: { value: ' ' } }, 1600, 1100);
  assert.equal(plain.row2, undefined);
  assert.equal(plain.datumMods, undefined);
  assert.equal(plain.projected, undefined);
  assert.equal(plain.height, gdtHeight(26));
  const form = cleanSymbol({ tool: 'gdt', x: 0, y: 0, size: 26, color: '#1d1d1f', symbol: 'flatness', value: '0,1', datums: ['A'], row2: { value: '0,05', datums: ['A'] } }, 1600, 1100);
  assert.deepEqual([form.datums, form.row2.datums], [[], []]);
});

test('chropowatość 1.38: kierunek struktury, naddatek, metoda, „dookoła” – sprawdzanie i obrys symbolu', () => {
  const base = { tool: 'roughness', x: 500, y: 400, size: 26, color: '#1d1d1f', text: 'Ra 1,6', kind: 'removal', width: 70 };
  const rich = cleanSymbol({ ...base, lay: '⊥', allowance: '0.5', method: '  szlifowane  ', allAround: true }, 1600, 1100);
  assert.deepEqual([rich.lay, rich.allowance, rich.method, rich.allAround], ['⊥', '0,5', 'szlifowane', true]);
  const bare = cleanSymbol({ ...base, lay: 'Q', allowance: '', method: '' }, 1600, 1100);
  assert.deepEqual([bare.lay, bare.allowance, bare.method, bare.allAround], [undefined, undefined, undefined, undefined]);
  // Obrys większy: metoda nad kreską, naddatek z lewej, kierunek z prawej przy wierzchołku.
  const [small, big] = [roughnessLayout(bare).box, roughnessLayout({ ...rich, width: 120 }).box];
  assert.ok(big.y < small.y, 'metoda nad kreską');
  assert.ok(big.x < small.x, 'naddatek z lewej');
  assert.equal(roughnessLayout(rich).around.x, roughnessLayout(rich).long.x, 'kółko „dookoła” na załamaniu');
});

test('odnośnik 1.38: karteczka bez tła – kolor „clear”, nasycenie warstwy zachowuje odnośnik', () => {
  assert.equal(STICKY_COLORS.at(-1).id, 'clear');
  assert.equal(stickyColor('clear').clear, true);
  const note = { tool: 'sticky', x: 0, y: 0, width: 200, height: 60, size: 24, color: 'clear', text: 'Hartować' };
  const toned = toneStroke(note, 0.5, stickyColor);
  assert.equal(toned.color.clear, true);
  assert.equal(stickyColor(toned.color).clear, true);
});

test('DXF 1.38: graniczne – dwa wiersze, dokładny – prostokąt, kontrolny – owal, pomocniczy w nawiasie; odnośnik – tekst ze strzałką', () => {
  const drawing = emptyDrawing();
  drawing.dimStyle = 'technical';
  drawing.dimUnit = 'mm';
  drawing.strokes = [
    rect({ width: { kind: 'limits', upper: 0.05, lower: -0.02 }, height: { style: 'basic' } }),
    { ...rect({ width: { style: 'reference' }, height: { style: 'inspection', kind: 'sym', value: 0.1 } }), x: 900 },
    { tool: 'sticky', x: 100, y: 800, width: 220, height: 50, size: 24, color: 'clear', text: 'Hartować 58 HRC', created: '2026-10-22', leader: { x: 400, y: 900 } },
    { tool: 'sticky', x: 100, y: 100, width: 220, height: 160, size: 24, color: 'yellow', text: 'notatka', created: '2026-10-22' }
  ];
  const { text, written, skipped } = drawingToDxf(drawing);
  assert.equal(skipped, 1, 'zwykła karteczka pominięta');
  assert.equal(written, 3);
  const parsed = parseDxf(text);
  const labels = parsed.entities.filter((item) => item.type === 'TEXT').map((item) => dxfText(item.first(1)));
  assert.deepEqual(labels, ['50,05', '49,98', '20', '(50)', '20±0,1', 'Hartować 58 HRC']);
  const outlines = parsed.entities.filter((item) => item.type === 'POLYLINE');
  // Dwa prostokąty kształtów, prostokąt wymiaru dokładnego (4 wierzchołki) i owal kontrolnego (18).
  assert.deepEqual(outlines.map((item) => item.vertices.length).sort((a, b) => a - b), [4, 4, 4, 18]);
  const { primitives } = dxfPrimitives(parsed);
  assert.ok(primitives.some((item) => item.kind === 'line' && Math.abs(item.b.x - 400 * (10 / 44)) < 0.01), 'strzałka odnośnika do (400, 900)');
});
