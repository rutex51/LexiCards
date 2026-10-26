// Rysunek 1.41 (etap D, część 2): odbicie względem prostej przez dwa punkty, skalowanie o współczynnik,
// „Styl jak…” i ramka rysunkowa z tabliczką A4/A3.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DRAWING_VERSION, cleanDrawing, emptyDrawing } from '../../js/core/drawing.js';
import { drawingToDxf, dxfText, parseDxf } from '../../js/core/dxf.js';
import { shapeFromDrag, shapePoint, withCorner, withShapeFill } from '../../js/core/shapes.js';
import { cleanFrame, frameLayout, frameScaleText, frameSheet } from '../../js/core/title-block.js';
import { hasStyle, lineWidthOf, mirrorAcross, mirrorStroke, scaleStroke, withStyleOf } from '../../js/core/transform.js';

const near = (actual, expected, tolerance = 0.02) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const style = { color: '#1d1d1f', size: 2 };
const pen = (points) => ({ tool: 'pen', color: '#0040dd', points });

test('rysunek 1.41: odbicie względem prostej przez dwa punkty – kreska, kształt, tekst; oś pozioma jak „w pionie”, dwa odbicia wracają', () => {
  // Oś y = x: punkt (100, 0) → (0, 100).
  const diagonal = mirrorAcross(pen([100, 0, 2, 200, 50, 3]), { x: 0, y: 0 }, { x: 10, y: 10 });
  near(diagonal.points[0], 0);
  near(diagonal.points[1], 100);
  near(diagonal.points[3], 50);
  near(diagonal.points[4], 200);
  assert.equal(diagonal.points[2], 2, 'grubość punktu zostaje');
  // Oś pozioma przez y = 300 – to samo co odbicie „w pionie”.
  const arrow = shapeFromDrag('arrow', { x: 100, y: 100 }, { x: 300, y: 200 }, style);
  const across = mirrorAcross(arrow, { x: 0, y: 300 }, { x: 50, y: 300 });
  const vertical = mirrorStroke(arrow, 'vertical', 300);
  near(across.x, vertical.x);
  near(across.y, vertical.y);
  near(Math.cos(across.angle), Math.cos(vertical.angle), 1e-6);
  near(Math.sin(across.angle), Math.sin(vertical.angle), 1e-6);
  // Dwa odbicia względem tej samej ukośnej prostej – z powrotem (z dokładnością zaokrągleń).
  const triangle = shapeFromDrag('triangle', { x: 400, y: 300 }, { x: 560, y: 420 }, style);
  const [a, b] = [{ x: 100, y: 900 }, { x: 900, y: 150 }];
  const twice = mirrorAcross(mirrorAcross(triangle, a, b), a, b);
  for (const [u, v] of [[0, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
    near(shapePoint(twice, u, v).x, shapePoint(triangle, u, v).x, 0.1);
    near(shapePoint(twice, u, v).y, shapePoint(triangle, u, v).y, 0.1);
  }
  // Pole tekstowe stoi prosto – zmienia się tylko miejsce (środek ramki odbity).
  const label = { tool: 'text', color: '#1d1d1f', x: 90, y: 0, size: 20, text: 'A', width: 20, height: 20, maxWidth: 400 };
  const moved = mirrorAcross(label, { x: 0, y: 0 }, { x: 10, y: 10 });
  near(moved.x + moved.width / 2, 10, 0.05);
  near(moved.y + moved.height / 2, 100, 0.05);
  // Punkty osi w jednym miejscu – bez zmian.
  assert.equal(mirrorAcross(arrow, { x: 5, y: 5 }, { x: 5, y: 5 }), arrow);
});

test('rysunek 1.41: skalowanie o współczynnik – kształty i kreski rosną, grubość, znacznik punktu i tekst zostają', () => {
  const rect = withCorner(shapeFromDrag('rect', { x: 100, y: 100 }, { x: 300, y: 200 }, style), { kind: 'round', size: 10 });
  const big = scaleStroke({ ...rect, dims: ['width'], dimOffsets: { width: 40 } }, 0, 0, 2);
  assert.deepEqual([big.x, big.y, big.w, big.h, big.size], [400, 300, 400, 200, 2]);
  assert.deepEqual(big.corner, { kind: 'round', size: 20 });
  assert.deepEqual(big.dimOffsets, { width: 80 });
  const line = scaleStroke(pen([100, 100, 2, 200, 100, 4]), 100, 100, 0.5);
  assert.deepEqual(line.points, [100, 100, 2, 150, 100, 4]);
  const segment = scaleStroke(shapeFromDrag('line', { x: 0, y: 0 }, { x: 100, y: 0 }, style), 0, 0, 3);
  assert.deepEqual([segment.w, segment.h, segment.x], [300, 0, 150]);
  const point = shapeFromDrag('point', { x: 50, y: 50 }, { x: 50, y: 50 }, style);
  const movedPoint = scaleStroke(point, 0, 0, 2);
  assert.deepEqual([movedPoint.x, movedPoint.y, movedPoint.w], [100, 100, point.w], 'punkt – w nowym miejscu, znacznik tej samej wielkości');
  const text = { tool: 'text', color: '#1d1d1f', x: 100, y: 100, size: 20, text: 'A', width: 40, height: 20, maxWidth: 400 };
  const movedText = scaleStroke(text, 0, 0, 2);
  assert.deepEqual([movedText.size, movedText.width], [20, 40], 'tekst tej samej wielkości');
  near(movedText.x + 20, 240);
  const array = { tool: 'array', kind: 'linear', items: [rect], columns: 3, rows: 1, dx: 250, dy: 0 };
  const grown = scaleStroke(array, 0, 0, 2);
  assert.equal(grown.dx, 500);
  assert.equal(grown.items[0].w, 400);
  assert.equal(scaleStroke(rect, 0, 0, 1), rect);
});

test('rysunek 1.41: „Styl jak…” – kolor, grubość, rodzaj linii, wypełnienie i kreskowanie; kreska – szerokości przeskalowane', () => {
  const source = withShapeFill({ ...shapeFromDrag('rect', { x: 0, y: 0 }, { x: 100, y: 80 }, { color: '#D70015', size: 4 }), dash: 'dashed' }, 'hatch', { angle: 135, gap: 6 });
  const target = shapeFromDrag('ellipse', { x: 200, y: 0 }, { x: 300, y: 80 }, style);
  const styled = withStyleOf(target, source);
  assert.deepEqual([styled.color, styled.size, styled.dash, styled.fill, styled.hatch], ['#d70015', 4, 'dashed', 'hatch', { angle: 135, gap: 6, cross: false }]);
  assert.equal(styled.w, target.w, 'geometria bez zmian');
  // Odcinek: bez wypełnienia; kreska pióra – kolor i grubość (średnio 4, nacisk zostaje).
  const segment = withStyleOf(shapeFromDrag('line', { x: 0, y: 0 }, { x: 50, y: 0 }, style), source);
  assert.deepEqual([segment.color, segment.dash, segment.fill], ['#d70015', 'dashed', undefined]);
  const stroke = withStyleOf(pen([0, 0, 1, 10, 0, 3]), source);
  assert.equal(stroke.color, '#d70015');
  assert.deepEqual([stroke.points[2], stroke.points[5]], [2, 6]);
  assert.equal(lineWidthOf(stroke), 4);
  // Kształt z kreski: grubość = średnia szerokość kreski.
  assert.equal(withStyleOf(target, pen([0, 0, 5, 10, 0, 7])).size, 6);
  // Tekst – tylko kolor; karteczka i tabela – bez zmian; źródło bez stylu – bez zmian.
  const text = { tool: 'text', color: '#1d1d1f', x: 0, y: 0, size: 20, text: 'A', width: 20, height: 20, maxWidth: 400 };
  assert.deepEqual(withStyleOf(text, source), { ...text, color: '#d70015' });
  const sticky = { tool: 'sticky', color: 'yellow', x: 0, y: 0, width: 100, height: 100, size: 20, text: 'x' };
  assert.equal(withStyleOf(sticky, source), sticky);
  assert.equal(hasStyle(sticky), false);
  assert.equal(withStyleOf(target, sticky), target);
  // Szyk – każdy element źródła.
  const array = { tool: 'array', kind: 'linear', items: [target], columns: 2, rows: 1, dx: 150, dy: 0 };
  assert.equal(withStyleOf(array, source).items[0].color, '#d70015');
});

test('rysunek 1.41: ramka rysunkowa – arkusz A4 i A3 na kartce, tabliczka 180 mm, skala z kratki, zapis tylko bez zdjęcia', () => {
  assert.equal(DRAWING_VERSION, 24, 'od 1.53 – pomiary 3D; 1.52 – położenie brył w scenie; 1.50 – początek układu współrzędnych arkusza; 1.49 – operacje na ścianach brył; 1.48.2 – szkic na XY (Z do góry); 1.48 – bryły ze szkicu; 1.47 – bryły; 1.45 – schematy procesów; 1.44 – diagramy jakości i układ kartki; 1.42 – wymiar długości łuku, kierunek wymiaru, osie okręgu; 1.41 – ramka rysunkowa');
  assert.equal(cleanFrame({ format: 'A5' }), null);
  assert.equal(cleanFrame(null), null);
  assert.deepEqual(cleanFrame({ format: 'A3', title: '  Wałek   stopniowany ', number: 'x'.repeat(60), scale: '', extra: 1 }),
    { format: 'A3', title: 'Wałek stopniowany', number: 'x'.repeat(40) });
  const a4 = frameSheet('A4', 1600, 1100);
  near(a4.mm, 1100 / 210, 1e-9);
  near(a4.height, 1100, 1e-9);
  near(a4.x, (1600 - 297 * a4.mm) / 2, 1e-9);
  const a3 = frameSheet('A3', 1600, 1100);
  near(a3.mm, 1100 / 297, 1e-9);
  assert.equal(frameScaleText('A4', 1600, 1100, { value: 1, unit: 'cm' }), '1:1,19');
  assert.equal(frameScaleText('A3', 1600, 1100, { value: 1, unit: 'cm' }), '1,19:1');
  assert.equal(frameScaleText('A4', 1600, 1100, { value: 1, unit: 'm' }), '1:119');
  const layout = frameLayout({ format: 'A4', title: 'Wałek', number: 'LC-1' }, 1600, 1100, { value: 1, unit: 'cm' });
  near(layout.border.x - a4.x, 20 * a4.mm, 1e-9);
  near(a4.y + a4.height - (layout.border.y + layout.border.h), 10 * a4.mm, 1e-9);
  near(layout.block.w, 180 * a4.mm, 1e-9);
  near(layout.block.x + layout.block.w, layout.border.x + layout.border.w, 1e-9);
  assert.deepEqual(layout.cells.map((cell) => cell.key), ['author', 'date', 'scale', 'format', 'title', 'material', 'number']);
  const value = (key) => layout.cells.find((cell) => cell.key === key).value;
  assert.deepEqual([value('title'), value('scale'), value('format'), value('material')], ['Wałek', '1:1,19', 'A4', '']);
  assert.equal(frameLayout({ format: 'A4', scale: '1:2' }, 1600, 1100, { value: 1, unit: 'cm' }).cells.find((cell) => cell.key === 'scale').value, '1:2');
  // Zapis: kartka bez zdjęcia – z ramką, ze zdjęciem – bez.
  const page = cleanDrawing({ ...emptyDrawing(), frame: { format: 'A4', title: 'Wałek' } });
  assert.deepEqual(page.frame, { format: 'A4', title: 'Wałek' });
  const photo = cleanDrawing({ ...emptyDrawing(), photo: { type: 'image/jpeg', width: 800, height: 600 }, frame: { format: 'A4' } });
  assert.equal(photo.frame, undefined);
  assert.equal(cleanDrawing({ ...emptyDrawing(), frame: { format: 'B5' } }).frame, undefined);
});

test('DXF 1.41: ramka na warstwie RAMKA – brzeg arkusza, ramka i tabliczka (łamane), linie tabliczki, napisy', () => {
  const drawing = cleanDrawing({ ...emptyDrawing(), frame: { format: 'A4', title: 'Wałek Ø20', number: 'LC-001', material: 'C45' } });
  drawing.strokes = [shapeFromDrag('rect', { x: 400, y: 300 }, { x: 600, y: 400 }, style)];
  const { text, written } = drawingToDxf(drawing);
  assert.equal(written, 1, 'ramka nie jest elementem kartki');
  const parsed = parseDxf(text);
  assert.ok(parsed.layers.has('RAMKA'));
  const framed = parsed.entities.filter((item) => item.layer === 'RAMKA');
  assert.equal(framed.filter((item) => item.type === 'POLYLINE').length, 3);
  assert.equal(framed.filter((item) => item.type === 'LINE').length, 6);
  const labels = framed.filter((item) => item.type === 'TEXT').map((item) => dxfText(item.first(1)));
  // Ø zapisane jako %%c – wczytane jako ⌀ (jak od 1.37).
  for (const expected of ['Tytuł', 'Wałek ⌀20', 'LC-001', 'C45', '1:1,19', 'A4', 'Rysował']) assert.ok(labels.includes(expected), expected);
  assert.equal(parsed.entities.filter((item) => item.layer !== 'RAMKA').length, 1, 'prostokąt na swojej warstwie');
  assert.equal(parseDxf(drawingToDxf({ ...drawing, frame: undefined }).text).layers.has('RAMKA'), false);
});
