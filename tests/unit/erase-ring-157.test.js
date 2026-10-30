// 1.57: gumka przez kształty i bryły (szkic piórem), gumka obszarem, odstęp małych kółek narzędzi.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanToolSettings, defaultToolSettings, ERASER_MODES } from '../../js/core/drawing.js';
import { canSketch, elementSketch, eraseArea, eraseElementsAt } from '../../js/core/sketch-erase.js';
import { newSolid, solidGeometry } from '../../js/core/solids.js';
import { ringRadius, ringStep } from '../../js/core/tool-ring.js';

const rect = (extra = {}) => ({ tool: 'shape', shape: 'rect', color: '#d70015', size: 3, x: 100, y: 100, w: 80, h: 40, angle: 0, skew: 0, adjust: 0, ...extra });
const line = (extra = {}) => ({ tool: 'shape', shape: 'line', color: '#1d1d1f', size: 2, x: 100, y: 200, w: 100, h: 0, angle: 0, skew: 0, adjust: 0, ...extra });
const pen = (points) => ({ tool: 'pen', color: '#1d1d1f', points: points.flatMap(([x, y]) => [x, y, 2]) });
const pointsOf = (stroke) => Array.from({ length: stroke.points.length / 3 }, (_, index) => [stroke.points[index * 3], stroke.points[index * 3 + 1]]);
const strictlyInside = ([x, y], [x0, y0, x1, y1]) => x > x0 + 0.05 && x < x1 - 0.05 && y > y0 + 0.05 && y < y1 - 0.05;
const box = (x0, y0, x1, y1) => [x0, y0, x1, y0, x1, y1, x0, y1];

test('ustawienia gumki: tryb „Zaznaczenie”, prostokąt albo lasso, „Także kształty”', () => {
  assert.deepEqual([...ERASER_MODES], ['stroke', 'pixel', 'area']);
  const base = defaultToolSettings();
  assert.deepEqual([base.eraserArea, base.eraserShapes], ['rect', false]);
  const set = cleanToolSettings({ eraserMode: 'area', eraserArea: 'lasso', eraserShapes: true });
  assert.deepEqual([set.eraserMode, set.eraserArea, set.eraserShapes], ['area', 'lasso', true]);
  const wrong = cleanToolSettings({ eraserArea: 'kolo', eraserShapes: 'tak' });
  assert.deepEqual([wrong.eraserArea, wrong.eraserShapes], ['rect', false]);
});

test('szkic piórem: prostokąt – zamknięty obrys w kolorze i grubości kształtu, na jego warstwach, gęste punkty (ostre narożniki)', () => {
  const [outline, ...rest] = elementSketch(rect({ layers: [2] }));
  assert.equal(rest.length, 0);
  assert.deepEqual([outline.tool, outline.color, outline.layers], ['pen', '#d70015', [2]]);
  const points = pointsOf(outline);
  assert.deepEqual(points[0], points.at(-1), 'obrys zamknięty');
  for (const corner of [[60, 80], [140, 80], [140, 120], [60, 120]]) assert.ok(points.some(([x, y]) => x === corner[0] && y === corner[1]), `narożnik ${corner}`);
  assert.ok(points.length >= 100, `gęste punkty (${points.length})`);
  assert.ok(outline.points.filter((_, index) => index % 3 === 2).every((width) => width === 3));
  // Strzałka – linia i grot; pole tekstowe – bez szkicu.
  const arrow = elementSketch(line({ shape: 'arrow' }));
  assert.equal(arrow.length, 2);
  assert.equal(canSketch({ tool: 'text', text: 'a' }), false);
  assert.deepEqual(elementSketch({ tool: 'text', text: 'a' }), []);
});

test('gumka obszarem: kreski cięte na brzegu, kształt dotknięty obszarem – szkic bez fragmentu w środku; w pustym środku kształtu – bez zmian', () => {
  const area = [90, 70, 160, 110];
  const strokes = [rect(), pen([[20, 90], [200, 90]]), line(), { tool: 'text', x: 150, y: 85, size: 10, text: 'a', width: 30, height: 10 }];
  assert.equal(eraseArea(strokes, box(...area)), true);
  assert.equal(strokes.some((stroke) => stroke.tool === 'shape' && stroke.shape === 'rect'), false, 'prostokąt – szkic');
  assert.equal(strokes.some((stroke) => stroke.tool === 'shape' && stroke.shape === 'line'), true, 'odcinek poza obszarem – bez zmian');
  const pens = strokes.filter((stroke) => stroke.tool === 'pen');
  assert.ok(pens.length >= 3, `kawałki (${pens.length})`);
  for (const stroke of pens) for (const point of pointsOf(stroke)) assert.ok(!strictlyInside(point, area), `punkt ${point} poza obszarem`);
  // Kreska pióra – dwa kawałki: do x = 90 i od x = 160.
  const horizontal = pens.filter((stroke) => pointsOf(stroke).every(([, y]) => y === 90));
  assert.deepEqual(horizontal.map((stroke) => [pointsOf(stroke)[0][0], pointsOf(stroke).at(-1)[0]]).sort((a, b) => a[0] - b[0]), [[20, 90], [160, 200]]);
  // Pole tekstowe nie w całości w obszarze – zostaje.
  assert.equal(strokes.filter((stroke) => stroke.tool === 'text').length, 1);

  const hollow = [rect()];
  assert.equal(eraseArea(hollow, box(80, 90, 120, 110)), false, 'obszar w środku prostokąta, bez jego linii');
  assert.equal(hollow[0].shape, 'rect');
  const whole = [rect(), { tool: 'text', x: 70, y: 90, size: 10, text: 'a', width: 10, height: 10 }];
  assert.equal(eraseArea(whole, box(0, 0, 300, 300)), true);
  assert.deepEqual(whole, [], 'w całości w obszarze – znika (także pole tekstowe)');
  const hidden = [rect()];
  assert.equal(eraseArea(hidden, box(...area), { canErase: () => false }), false, 'ukryta warstwa – bez zmian');
});

test('gumka fragmentów „Także kształty”: odcinek pod kołem – szkic z dziurą; kształt poza kołem – bez zmian; bryła – krawędzie jako szkic', () => {
  const strokes = [line(), rect()];
  assert.equal(eraseElementsAt(strokes, 100, 200, 5), true);
  assert.equal(strokes.filter((stroke) => stroke.tool === 'shape').length, 1, 'prostokąt bez zmian');
  const pieces = strokes.filter((stroke) => stroke.tool === 'pen');
  assert.equal(pieces.length, 2, 'odcinek – dwa kawałki');
  for (const piece of pieces) for (const [x] of pointsOf(piece)) assert.ok(Math.abs(x - 100) >= 5 - 1e-6);
  assert.equal(eraseElementsAt(strokes, 500, 500, 5), false);

  const solid = newSolid('box', { x: 300, y: 300 });
  const geometry = solidGeometry(solid);
  const sketch = elementSketch(solid);
  assert.equal(sketch.length, geometry.visible.length + geometry.hidden.length + geometry.axes.length, 'krawędzie widoczne, niewidoczne i osie');
  assert.ok(sketch.length > 0 && sketch.every((stroke) => stroke.tool === 'pen' && stroke.color === solid.color), 'bryła – kreski pióra w jej kolorze');
  const cut = [solid];
  const [x, y] = [geometry.visible[0].points[0].x, geometry.visible[0].points[0].y];
  assert.equal(eraseElementsAt(cut, x, y, 4), true, 'koło na krawędzi bryły');
  assert.ok(cut.length > 0 && cut.every((stroke) => stroke.tool === 'pen'), 'bryła – szkic');
});

test('kółko narzędzi: promień rośnie z liczbą kółek – odstęp między kółkami co najmniej zadany', () => {
  for (const count of [2, 8, 9, 11, 12]) {
    const radius = ringRadius(count, 84, 46, 18);
    const { step } = ringStep(count);
    const gap = 2 * radius * Math.sin((step * Math.PI) / 360) - 46;
    assert.ok(radius >= 84 && gap >= 18 - 1e-9, `${count} kółek: promień ${radius}, odstęp ${gap.toFixed(1)}`);
  }
  assert.equal(ringRadius(4, 84, 46, 18), 84, 'mało kółek – bez zmian');
  assert.ok(ringRadius(11, 84, 46, 18) > 84);
});
