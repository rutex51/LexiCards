// Rysunek 1.30: obrót i odbicie lustrzane zaznaczenia (kreski, kształty, szyki – w całości; pola,
// tabele, karteczki i symbole – stoją prosto, zmienia się miejsce), przyklejone końce po przekształceniu,
// obrócony szyk liniowy i ustawienie „palec też rysuje”.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { expandArray, makeArray } from '../../js/core/arrays.js';
import { attachPoint, endPoint, resolveAttachments } from '../../js/core/attach.js';
import { cleanDrawing, cleanToolSettings, defaultToolSettings, elementBox, emptyDrawing, selectionBounds, strokeBounds } from '../../js/core/drawing.js';
import { shapeFromDrag, shapeOutline, shapePoint } from '../../js/core/shapes.js';
import { canTurn, isUpright, mirrorStroke, rotateStroke, snapTurn, transformStrokes, turnDegrees } from '../../js/core/transform.js';

const style = { color: '#1d1d1f', size: 3, fill: 'none', caps: {} };
const pen = (points) => ({ tool: 'pen', color: '#1d1d1f', points: points.flatMap(([x, y]) => [x, y, 3]) });
const text = (x, y) => ({ tool: 'text', text: 'Ø 20', color: '#1d1d1f', size: 40, x, y, width: 80, height: 40 });
/** Punkty obrysu jako posortowany zbiór (kolejność po odbiciu jest odwrotna). */
const outline = (shape) => {
  const { points } = shapeOutline(shape);
  const list = [];
  for (let index = 0; index < points.length; index += 2) list.push([Math.round(points[index] * 10) / 10, Math.round(points[index + 1] * 10) / 10]);
  return list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};
const flipped = (shape, axis, at) => {
  const { points } = shapeOutline(shape);
  const list = [];
  for (let index = 0; index < points.length; index += 2) {
    const [x, y] = [points[index], points[index + 1]];
    list.push(axis === 'horizontal' ? [Math.round((2 * at - x) * 10) / 10, Math.round(y * 10) / 10] : [Math.round(x * 10) / 10, Math.round((2 * at - y) * 10) / 10]);
  }
  return list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};
const closeTo = (a, b, tolerance = 0.11) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);
const sameSet = (actual, expected) => {
  assert.equal(actual.length, expected.length);
  actual.forEach(([x, y], index) => {
    closeTo(x, expected[index][0], 0.15);
    closeTo(y, expected[index][1], 0.15);
  });
};
/** Środki elementów jako posortowany zbiór; porównanie z tolerancją (zaokrąglenia do 0,01–0,1). */
const centers = (items) => items.map((item) => {
  const bounds = strokeBounds(item);
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
}).sort((a, b) => Math.round(a[0]) - Math.round(b[0]) || a[1] - b[1]);
const sameCenters = (actual, expected, message) => {
  assert.equal(actual.length, expected.length, message);
  actual.forEach(([x, y], index) => assert.ok(Math.abs(x - expected[index][0]) < 0.6 && Math.abs(y - expected[index][1]) < 0.6, `${message}: ${x},${y} ≈ ${expected[index]}`));
};

test('rysunek 1.30: odbicie kształtów – ten sam rodzaj, obrys jak lustrzany obraz (trójkąt, pochylenie, łamana, odcinek)', () => {
  const triangle = { ...shapeFromDrag('triangle', { x: 100, y: 100 }, { x: 300, y: 220 }, style), adjust: 0.2, skew: 0.3, angle: 0.4 };
  for (const axis of ['horizontal', 'vertical']) {
    const mirrored = mirrorStroke(triangle, axis, 400);
    assert.equal(mirrored.shape, 'triangle');
    sameSet(outline(mirrored), flipped(triangle, axis, 400));
    assert.deepEqual(outline(mirrorStroke(mirrored, axis, 400)), outline(triangle), 'dwa odbicia – jak na początku');
  }
  const polyline = { tool: 'shape', shape: 'polyline', color: '#1d1d1f', size: 3, x: 500, y: 400, w: 200, h: 100, angle: -0.7, skew: 0, adjust: 0, nodes: [-0.5, -0.5, 0.1, 0.5, 0.5, -0.2] };
  sameSet(outline(mirrorStroke(polyline, 'horizontal', 0)), flipped(polyline, 'horizontal', 0));
  sameSet(outline(mirrorStroke(polyline, 'vertical', 300)), flipped(polyline, 'vertical', 300));
  // Odcinek i strzałka: początek zostaje początkiem (grot na tym samym końcu).
  const arrow = shapeFromDrag('arrow', { x: 100, y: 100 }, { x: 260, y: 180 }, style);
  for (const axis of ['horizontal', 'vertical']) {
    const mirrored = mirrorStroke(arrow, axis, 200);
    const [start, end] = [shapePoint(mirrored, -0.5, 0), shapePoint(mirrored, 0.5, 0)];
    const flip = (point) => (axis === 'horizontal' ? { x: 400 - point.x, y: point.y } : { x: point.x, y: 400 - point.y });
    const [a, b] = [flip(shapePoint(arrow, -0.5, 0)), flip(shapePoint(arrow, 0.5, 0))];
    closeTo(start.x, a.x);
    closeTo(start.y, a.y);
    closeTo(end.x, b.x);
    closeTo(end.y, b.y);
  }
});

test('rysunek 1.30: kreska, pole tekstowe i karteczka – odbicie i obrót; pola stoją prosto, strzałka karteczki idzie razem', () => {
  const stroke = pen([[10, 10], [50, 20], [90, 60]]);
  assert.deepEqual(mirrorStroke(stroke, 'horizontal', 100).points, [190, 10, 3, 150, 20, 3, 110, 60, 3]);
  assert.deepEqual(mirrorStroke(stroke, 'vertical', 100).points, [10, 190, 3, 50, 180, 3, 90, 140, 3]);
  const turned = rotateStroke(stroke, 0, 0, Math.PI / 2);
  assert.deepEqual(turned.points.filter((_, index) => index % 3 !== 2), [-10, 10, -20, 50, -60, 90]);
  // Pole tekstowe: środek ramki odbity, tekst bez zmian (nie do góry nogami).
  const label = text(100, 100);
  const mirroredLabel = mirrorStroke(label, 'horizontal', 300);
  assert.deepEqual([mirroredLabel.x, mirroredLabel.y, mirroredLabel.text], [420, 100, 'Ø 20']);
  const turnedLabel = rotateStroke(label, 140, 0, Math.PI);
  assert.deepEqual([turnedLabel.x, turnedLabel.y, turnedLabel.width], [100, -140, 80], 'środek (140, 120) → (140, −120)');
  const sticky = { tool: 'sticky', text: 'Uwaga', color: 'yellow', size: 30, x: 0, y: 0, width: 200, height: 100, leader: { x: 300, y: 50 } };
  const stickyMirrored = mirrorStroke(sticky, 'horizontal', 100);
  assert.deepEqual([stickyMirrored.x, stickyMirrored.y, stickyMirrored.leader], [0, 0, { x: -100, y: 50 }], 'karteczka na osi – na miejscu, strzałka na drugą stronę');
  assert.equal(isUpright(sticky), true);
  assert.equal(isUpright(stroke), false);
  // Obrót albo odbicie ma sens dla kilku elementów albo elementu, który się obraca.
  assert.equal(canTurn([label]), false);
  assert.equal(canTurn([label, sticky]), true);
  assert.equal(canTurn([stroke]), true);
  assert.equal(canTurn([]), false);
});

test('rysunek 1.30: szyki – obrót i odbicie w całości (liniowy dostaje kąt, kołowy na łuku zmienia kierunek)', () => {
  const box = shapeFromDrag('rect', { x: 100, y: 100 }, { x: 140, y: 130 }, style);
  const linear = makeArray([box], { kind: 'linear', columns: 3, rows: 2, dx: 60, dy: 50 }, 6400);
  const pivot = { x: 200, y: 150 };
  const turned = rotateStroke(linear, pivot.x, pivot.y, Math.PI / 6);
  closeTo(turned.angle, Math.PI / 6, 1e-9);
  const expected = expandArray(linear).map((item) => rotateStroke(item, pivot.x, pivot.y, Math.PI / 6));
  sameCenters(centers(expandArray(turned)), centers(expected), 'kopie obróconego szyku – tam, gdzie obrócone kopie');
  const back = rotateStroke(turned, pivot.x, pivot.y, -Math.PI / 6);
  assert.equal('angle' in back, false, 'kąt zero – bez pola');
  for (const axis of ['horizontal', 'vertical']) {
    const mirrored = mirrorStroke(turned, axis, 333);
    sameCenters(centers(expandArray(mirrored)), centers(expandArray(turned).map((item) => mirrorStroke(item, axis, 333))), `liniowy ${axis}`);
  }
  const arc = makeArray([box], { kind: 'polar', count: 4, sweep: 120, rings: 2, ringStep: 60, cx: 300, cy: 400, rotate: true }, 6400);
  for (const axis of ['horizontal', 'vertical']) {
    const mirrored = mirrorStroke(arc, axis, 250);
    sameCenters(centers(expandArray(mirrored)), centers(expandArray(arc).map((item) => mirrorStroke(item, axis, 250))), `łuk ${axis}`);
  }
  const turnedArc = rotateStroke(arc, 0, 0, 1);
  sameCenters(centers(expandArray(turnedArc)), centers(expandArray(arc).map((item) => rotateStroke(item, 0, 0, 1))), 'łuk obrócony');
  // Zapis: kąt szyku liniowego zostaje, zły – znika.
  const drawing = cleanDrawing({ ...emptyDrawing(), strokes: [turned, { ...linear, angle: 'x' }] });
  closeTo(drawing.strokes[0].angle, Math.PI / 6, 1e-9);
  assert.equal('angle' in drawing.strokes[1], false);
});

test('rysunek 1.30: przyklejone końce po odbiciu – narożnik lustrzany; do elementu spoza zaznaczenia – odklejone', () => {
  const rect = { ...shapeFromDrag('rect', { x: 100, y: 100 }, { x: 200, y: 160 }, style), id: 'prostok1' };
  const corner = shapePoint(rect, 0.5, -0.5);
  const arrow = {
    ...shapeFromDrag('arrow', { x: 400, y: 40 }, corner, style),
    attach: { end: { id: 'prostok1', kind: 'corner', index: 1 } }
  };
  const before = attachPoint(rect, arrow.attach.end);
  closeTo(before.x, corner.x);
  const at = selectionBounds([rect, arrow]).minX + 150;
  const [mirroredRect, mirroredArrow] = transformStrokes([rect, arrow], (stroke) => mirrorStroke(stroke, 'horizontal', at), elementBox);
  const end = endPoint(mirroredArrow, 'end');
  const target = attachPoint(mirroredRect, mirroredArrow.attach.end);
  closeTo(end.x, target.x);
  closeTo(end.y, target.y);
  assert.notEqual(mirroredArrow.attach.end.index, 1, 'prawy górny narożnik po odbiciu to lewy górny');
  const strokes = [mirroredRect, mirroredArrow];
  assert.equal(resolveAttachments(strokes, elementBox).size, 0, 'koniec już na swoim miejscu');
  // Strzałka odbita bez prostokąta – odklejona.
  const [alone] = transformStrokes([arrow], (stroke) => mirrorStroke(stroke, 'vertical', 0), elementBox);
  assert.equal('attach' in alone, false);
  // Obrót: strzałka do tabeli (stoi prosto) – zostaje przyklejona do tego samego miejsca tabeli.
  const table = { tool: 'table', id: 'tabela01', x: 100, y: 100, width: 200, height: 100, rows: [['a']], size: 26 };
  const pointer = { ...shapeFromDrag('arrow', { x: 500, y: 150 }, { x: 300, y: 150 }, style), attach: { end: { id: 'tabela01', kind: 'edge', index: 1, t: 0.5 } } };
  const [, turnedPointer] = transformStrokes([table, pointer], (stroke) => rotateStroke(stroke, 300, 150, Math.PI / 2), elementBox);
  assert.deepEqual(turnedPointer.attach.end, { id: 'tabela01', kind: 'edge', index: 1, t: 0.5 });
});

test('rysunek 1.30: kąt obrotu – przyciągany do 15° (z Shift dokładnie), pokazany jak na linijce; palec też rysuje – ustawienie', () => {
  const degrees = (value) => (value * Math.PI) / 180;
  closeTo(snapTurn(degrees(31)), degrees(30), 1e-9);
  closeTo(snapTurn(degrees(37)), degrees(37), 1e-9);
  closeTo(snapTurn(degrees(37), true), degrees(30), 1e-9);
  closeTo(snapTurn(degrees(-179)), Math.PI, 1e-9);
  assert.equal(turnDegrees(degrees(-90)), 90, 'w górę (przeciwnie do wskazówek) – dodatni');
  assert.equal(turnDegrees(degrees(45)), -45);
  assert.equal(turnDegrees(Math.PI), 180);
  assert.equal(defaultToolSettings().fingerDraws, false);
  assert.equal(cleanToolSettings({ fingerDraws: true }).fingerDraws, true);
  assert.equal(cleanToolSettings({ fingerDraws: 'tak' }).fingerDraws, false);
});
