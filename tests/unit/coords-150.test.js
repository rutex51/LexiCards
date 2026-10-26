// Rysunek 1.50: układ współrzędnych arkusza – początek w lewym dolnym rogu arkusza (z ramką) albo kartki, przesunięty
// początek (zapis, sprawdzanie), liczby w skali rysunku i jednostce wymiarów (mm, cm, cale), napisy, ustawienie na
// urządzeniu i plik DXF od początku układu.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanDrawing, cleanOrigin, cleanToolSettings, defaultToolSettings, emptyDrawing } from '../../js/core/drawing.js';
import { drawingToDxf, parseDxf } from '../../js/core/dxf.js';
import {
  coordFactor, coordPlaces, coordText, coordUnit, defaultOrigin, formatCoord, fromSheet, originText, sheetOrigin, toSheet
} from '../../js/core/sheet-coords.js';
import { frameSheet } from '../../js/core/title-block.js';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const technical = (drawing, unit = null) => ({ ...drawing, dimStyle: 'technical', ...(unit ? { dimUnit: unit } : {}) });

test('rysunek 1.50: początek – lewy dolny róg kartki, z ramką – arkusza, przesunięty – punkt strony; X w prawo, Y w górę', () => {
  const plain = emptyDrawing();
  assert.deepEqual(defaultOrigin(plain), { x: 0, y: plain.height }, 'bez ramki – lewy dolny róg kartki');
  assert.deepEqual(sheetOrigin(plain), defaultOrigin(plain));
  const framed = { ...plain, frame: { format: 'A4' } };
  const sheet = frameSheet('A4', plain.width, plain.height);
  assert.deepEqual(defaultOrigin(framed), { x: sheet.x, y: sheet.y + sheet.height }, 'A4 – lewy dolny róg arkusza wpasowanego w stronę');
  assert.ok(sheet.x > 0, 'arkusz A4 jest węższy od strony – róg nie jest rogiem strony');
  // Ramka pionowa – inny róg.
  const portrait = frameSheet('A4V', plain.width, plain.height);
  assert.deepEqual(defaultOrigin({ ...plain, frame: { format: 'A4V' } }), { x: portrait.x, y: portrait.y + portrait.height });
  // Przesunięty początek – punkt strony.
  const moved = { ...framed, origin: { x: 400, y: 700 } };
  assert.deepEqual(sheetOrigin(moved), { x: 400, y: 700 });
  // Kierunki: X w prawo, Y w górę (y strony w dół).
  const right = toSheet(moved, { x: 444, y: 700 });
  const up = toSheet(moved, { x: 400, y: 656 });
  assert.ok(right.x > 0 && Math.abs(right.y) < 1e-9);
  assert.ok(up.y > 0 && Math.abs(up.x) < 1e-9);
});

test('rysunek 1.50: liczby w skali rysunku i jednostce wymiarów – mm (technicznie), cm (styl „5 cm”), cale; w obie strony', () => {
  // 1 kratka (44 jednostki strony) = 1 cm.
  const cm = emptyDrawing();
  near(coordFactor(cm), 1 / 44);
  assert.equal(coordUnit(cm), 'cm');
  assert.equal(coordPlaces(cm), 2);
  const mm = technical(cm);
  near(coordFactor(mm), 10 / 44);
  assert.equal(coordUnit(mm), 'mm');
  assert.equal(coordPlaces(mm), 1);
  // Punkt 10 kratek w prawo i 5 kratek w górę od lewego dolnego rogu – 100 mm, 50 mm.
  const point = { x: 440, y: cm.height - 220 };
  const inMm = toSheet(mm, point);
  near(inMm.x, 100);
  near(inMm.y, 50);
  assert.equal(coordText(mm, point), 'X 100,0 · Y 50,0 mm');
  assert.equal(coordText(cm, point), 'X 10,00 · Y 5,00 cm');
  // Skala 1 kratka = 2,5 m, liczby w m – trzy miejsca.
  const meters = technical({ ...cm, scale: { value: 2.5, unit: 'm' } }, 'm');
  assert.equal(coordText(meters, point), 'X 25,000 · Y 12,500 m');
  // Cale (skala imperialna – domyślnie cale).
  const inches = technical({ ...cm, scale: { value: 1, unit: 'in' } });
  assert.equal(coordUnit(inches), 'in');
  assert.equal(coordPlaces(inches), 3);
  assert.equal(coordText(inches, point), 'X 10,000 · Y 5,000 in');
  // W obie strony (też przy przesuniętym początku).
  for (const drawing of [mm, cm, meters, inches, { ...mm, origin: { x: 123.45, y: 678.9 } }]) {
    const back = fromSheet(drawing, toSheet(drawing, { x: 321.5, y: 456.25 }));
    near(back.x, 321.5, 1e-9);
    near(back.y, 456.25, 1e-9);
  }
  // Ujemne, zero bez znaku, minus typograficzny.
  assert.equal(formatCoord(-12.345, 1), '−12,3');
  assert.equal(formatCoord(-0.04, 1), '0,0');
  assert.equal(formatCoord(0, 2), '0,00');
  assert.equal(coordText(mm, { x: -44, y: cm.height + 44 }), 'X −10,0 · Y −10,0 mm');
});

test('rysunek 1.50: opis początku, zapis (format 22, punkt na kartce), ustawienie „Układ współrzędnych” na urządzeniu', () => {
  const drawing = technical(emptyDrawing());
  assert.equal(originText(drawing), 'Początek w lewym dolnym rogu kartki');
  assert.equal(originText({ ...drawing, frame: { format: 'A3' } }), 'Początek w lewym dolnym rogu arkusza');
  assert.equal(originText({ ...drawing, origin: { x: 88, y: drawing.height - 352 } }), 'Początek przesunięty: X 20,0 · Y 80,0 mm od lewego dolnego rogu kartki');
  // Początek w samym rogu – opis jak bez przesunięcia.
  assert.equal(originText({ ...drawing, origin: { x: 0, y: drawing.height } }), 'Początek w lewym dolnym rogu kartki');
  // Zapis: zaokrąglony do setnych, przycięty do kartki; zły – pominięty.
  const saved = cleanDrawing({ ...drawing, origin: { x: 88.123, y: 748.456 } });
  assert.equal(saved.version, 22);
  assert.deepEqual(saved.origin, { x: 88.12, y: 748.46 });
  assert.deepEqual(cleanDrawing({ ...drawing, origin: { x: -50, y: 5000 } }).origin, { x: 0, y: drawing.height });
  assert.equal(cleanDrawing({ ...drawing, origin: { x: 'a', y: 3 } }).origin, undefined);
  assert.equal(cleanDrawing(drawing).origin, undefined, 'bez przesunięcia – bez pola');
  assert.equal(cleanOrigin(null, 100, 100), null);
  // Ustawienie na urządzeniu: domyślnie wyłączone, zapamiętane.
  assert.equal(defaultToolSettings().coords, false);
  assert.equal(cleanToolSettings({ coords: true }).coords, true);
  assert.equal(cleanToolSettings({ coords: 'tak' }).coords, false);
});

test('rysunek 1.50: DXF od początku układu – bez ramki jak dotąd (lewy dolny róg kartki), z ramką od rogu arkusza, przesunięty początek – (0, 0)', () => {
  const line = { tool: 'shape', shape: 'line', color: '#1d1d1f', size: 2, x: 330, y: 858, w: 440, h: 0, angle: 0, skew: 0, adjust: 0 };
  // Odcinek długości 100 mm (ramka też ma linie – LINE).
  const ends = (drawing) => parseDxf(drawingToDxf(drawing).text).entities.filter((entity) => entity.type === 'LINE')
    .map((item) => [10, 20, 11, 21].map((code) => Number(item.codes.find(([key]) => key === code)[1])))
    .find(([x1, y1, x2, y2]) => Math.abs(Math.hypot(x2 - x1, y2 - y1) - 100) < 1e-6 && Math.abs(y2 - y1) < 1e-6);
  const header = (drawing, name) => {
    const text = drawingToDxf(drawing).text.split(/\r?\n/).map((value) => value.trim());
    const at = text.indexOf(name);
    return [Number(text[at + 2]), Number(text[at + 4])];
  };
  const plain = { ...emptyDrawing(), strokes: [line] };
  // Odcinek od (110; 858) do (550; 858): 1 kratka = 1 cm = 10 mm, początek – lewy dolny róg kartki (0; 1100).
  const [x1, y1, x2, y2] = ends(plain);
  near(x1, 25);
  near(y1, 55);
  near(x2, 125);
  near(y2, 55);
  assert.deepEqual(header(plain, '$EXTMIN'), [0, 0]);
  // Z ramką A4 – od lewego dolnego rogu arkusza (o tyle w lewo, ile arkusz jest odsunięty od brzegu strony).
  const framed = { ...plain, frame: { format: 'A4' } };
  const sheet = frameSheet('A4', plain.width, plain.height);
  near(ends(framed)[0], 25 - (sheet.x / 44) * 10, 1e-3);
  near(header(framed, '$EXTMIN')[0], -(sheet.x / 44) * 10, 1e-3);
  // Przesunięty początek w początku odcinka – odcinek od (0; 0) do (100; 0).
  const moved = { ...plain, origin: { x: 110, y: 858 } };
  const [mx1, my1, mx2, my2] = ends(moved);
  near(mx1, 0);
  near(my1, 0);
  near(mx2, 100);
  near(my2, 0);
});
