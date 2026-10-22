// Rysunek 1.27: rodzaj linii kształtów (przerywana, osiowa, dwupunktowa, kropkowa), prosta przez dwa
// punkty, punkt (znacznik – punkt symetrii, kropka, krzyżyk, środek) i strzałka po łuku z dwoma punktami
// pośrednimi i zakończeniami jak odcinek.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanToolSettings, defaultToolSettings } from '../../js/core/drawing.js';
import {
  POINT_MARKS, SHAPES, SHAPE_DASHES, XLINE_REACH, bezierPoint, canDash, canFill, cleanShape, curveControls, dashPattern, dimKeys, dimPlaces, hasCaps, isSegment,
  moveShapeHandle, pointMark, pointMarkGeometry, polyPoints, segmentCapList, segmentCaps, shapeBounds, shapeContains, shapeFromDrag, shapeHandles,
  shapeOutline, shapePath, touchesShape, withCaps, withDash
} from '../../js/core/shapes.js';

const style = { color: '#1d1d1f', size: 3, fill: 'none', caps: {} };
const isColor = (value) => /^#[0-9a-f]{6}$/i.test(value ?? '');
const near = (a, b, digits = 6) => assert.ok(Math.abs(a - b) < 10 ** -digits, `${a} ≈ ${b}`);

test('rysunek 1.27: rodzaj linii – wzór kresek od grubości, zapis tylko innej niż ciągła, punkt bez linii', () => {
  assert.deepEqual(SHAPE_DASHES, ['solid', 'dashed', 'center', 'phantom', 'dotted']);
  const rect = shapeFromDrag('rect', { x: 100, y: 100 }, { x: 300, y: 200 }, { ...style, dash: 'dashed' });
  assert.equal(rect.dash, 'dashed');
  assert.deepEqual(dashPattern(rect), [12, 12]);
  assert.deepEqual(dashPattern({ ...rect, dash: 'center' }), [36, 12, 0.001, 12]);
  assert.deepEqual(dashPattern({ ...rect, dash: 'phantom' }).length, 6);
  assert.deepEqual(dashPattern({ ...rect, dash: 'dotted', size: 1 }), [0.001, 4.5], 'cienka linia – wzór jak dla 1,5');
  assert.deepEqual(dashPattern({ ...rect, dash: undefined }), []);
  assert.equal('dash' in withDash(rect, 'solid'), false);
  assert.equal(withDash(rect, 'center').dash, 'center');
  assert.equal('dash' in withDash(rect, 'wavy'), false);
  assert.equal(cleanShape({ ...rect, dash: 'phantom' }, 1600, 1100, isColor).dash, 'phantom');
  assert.equal('dash' in cleanShape({ ...rect, dash: 'solid' }, 1600, 1100, isColor), false);
  assert.equal('dash' in cleanShape({ ...rect, dash: 'zigzag' }, 1600, 1100, isColor), false);
  const point = shapeFromDrag('point', { x: 0, y: 0 }, { x: 500, y: 400 }, { ...style, dash: 'dashed' });
  assert.equal(canDash(point), false);
  assert.equal('dash' in point, false);
  // Nowe kształty w panelu (od 1.34 za nimi łuk i wymiar).
  assert.deepEqual(SHAPES.slice(7, 10), ['xline', 'curve', 'point']);
});

test('rysunek 1.27: prosta – dwa punkty jak odcinek, linia przez całą stronę, granice z punktów, tylko kąt, bez zakończeń', () => {
  const line = shapeFromDrag('xline', { x: 400, y: 300 }, { x: 800, y: 300 }, { ...style, caps: { start: 'arrow', end: 'circle' } });
  assert.deepEqual([line.shape, line.w, line.h, line.angle], ['xline', 400, 0, 0]);
  assert.equal(isSegment(line), true);
  assert.equal(hasCaps(line), false);
  assert.deepEqual(segmentCaps(line), { start: 'none', end: 'none' });
  assert.equal('endCap' in withCaps(line, { start: 'arrow', end: 'arrow' }), false);
  assert.deepEqual(segmentCapList(line), []);
  const { points } = shapeOutline(line);
  assert.deepEqual(points, [400 - XLINE_REACH, 300, 800 + XLINE_REACH, 300]);
  assert.deepEqual(shapeBounds(line), { minX: 398.5, minY: 298.5, maxX: 801.5, maxY: 301.5 });
  assert.equal(touchesShape(line, 1500, 301, 4), true, 'dotknięcie daleko za punktami');
  assert.deepEqual(dimKeys(line), ['angle']);
  assert.deepEqual(Object.keys(dimPlaces(line)), ['angle'], 'pole wymiaru – tylko kąt');
  assert.deepEqual(shapeHandles(line, 30).map((handle) => handle.id), ['start', 'end']);
  const turned = moveShapeHandle(line, 'end', { x: 800, y: 700 });
  near(turned.angle, Math.PI / 4);
  const cleaned = cleanShape({ ...line, startCap: 'arrow' }, 1600, 1100, isColor);
  assert.deepEqual([cleaned.shape, cleaned.h, 'startCap' in cleaned], ['xline', 0, false]);
});

test('rysunek 1.27: punkt – znacznik (punkt symetrii domyślnie), średnica z grubości, dotknięcie i wnętrze, bez uchwytów i wymiarów', () => {
  const point = shapeFromDrag('point', { x: 100, y: 100 }, { x: 900, y: 300 }, { ...style, mark: 'cross' });
  assert.deepEqual([point.shape, point.x, point.y, point.w, point.h, point.mark], ['point', 900, 300, 21, 21, 'cross']);
  assert.equal(pointMark({ mark: 'bogus' }), 'center');
  assert.deepEqual(POINT_MARKS, ['center', 'dot', 'cross', 'plus']);
  assert.equal(shapeFromDrag('point', { x: 0, y: 0 }, { x: 0, y: 0 }, { ...style, size: 20 }).w, 60, 'najwyżej 60');
  const center = pointMarkGeometry({ ...point, mark: 'center' });
  assert.equal(center.lines.length, 2);
  near(center.ring.r, 21 * 0.31);
  assert.equal(pointMarkGeometry({ ...point, mark: 'dot' }).dot.r, 3.78);
  assert.equal(pointMarkGeometry(point).lines.length, 2);
  assert.equal(touchesShape(point, 905, 300, 2), true);
  assert.equal(touchesShape(point, 930, 300, 2), false);
  assert.equal(shapeContains(point, 903, 303), true);
  assert.deepEqual(shapeHandles(point, 30), []);
  assert.deepEqual(dimKeys(point), []);
  assert.equal(canFill(point), false);
  const cleaned = cleanShape({ ...point, h: 99, skew: 1, mark: 'plus' }, 1600, 1100, isColor);
  assert.deepEqual([cleaned.h, cleaned.skew, cleaned.mark], [21, 0, 'plus']);
  assert.equal(cleanShape({ ...point, mark: 'x' }, 1600, 1100, isColor).mark, 'center');
});

test('rysunek 1.27: strzałka po łuku – krzywa przez cztery punkty, łuk z przeciągnięcia, grot na końcu w kierunku stycznej, punkty pośrednie przesuwane', () => {
  const arc = shapeFromDrag('curve', { x: 100, y: 500 }, { x: 700, y: 500 }, style);
  assert.equal(arc.shape, 'curve');
  assert.equal(arc.nodes.length, 8);
  const nodes = polyPoints(arc);
  near(nodes[0].x, 100, 2);
  near(nodes[3].x, 700, 2);
  assert.ok(nodes[1].y < 500 - 100 && nodes[2].y < 500 - 100, 'łuk w górę (na lewo od kierunku)');
  // Krzywa przechodzi przez punkty pośrednie w t = ⅓ i ⅔.
  const curve = curveControls(arc);
  for (const [t, node] of [[1 / 3, nodes[1]], [2 / 3, nodes[2]]]) {
    const point = bezierPoint(curve, t);
    near(point.x, node.x, 6);
    near(point.y, node.y, 6);
  }
  // Domyślnie grot na końcu, skierowany w dół-prawo (styczna przy końcu łuku).
  assert.deepEqual(segmentCaps(arc), { start: 'none', end: 'arrow' });
  const [cap] = segmentCapList(arc);
  assert.equal(cap.kind, 'arrow');
  assert.ok(cap.arms.every((arm) => arm.x < 700 && arm.y < 500 + 40), JSON.stringify(cap.arms));
  assert.deepEqual(dimKeys(arc), []);
  assert.deepEqual(dimPlaces(arc), {}, 'bez pól wymiarów');
  assert.equal(canFill(arc), false);
  assert.equal(hasCaps(arc), true);
  // Ścieżka: jedna krzywa Béziera; trójkąt na początku przycina krzywą pod podstawą.
  const path = shapePath(arc);
  assert.equal(path.curves.length, 1);
  const triangle = shapePath(withCaps(arc, { start: 'triangle', end: 'arrow' }));
  assert.ok(Math.hypot(triangle.start.x - 100, triangle.start.y - 500) > 10, 'linia zaczyna się pod trójkątem');
  // Obrys – punkty krzywej (do zaznaczania); dotknięcie wierzchołka łuku.
  assert.equal(shapeOutline(arc).points.length, 66);
  const top = bezierPoint(curve, 0.5);
  assert.equal(touchesShape(arc, top.x, top.y + 2, 4), true);
  assert.equal(touchesShape(arc, 400, 500, 4), false, 'cięciwa nie jest częścią łuku');
  // Uchwyty: narożniki ramki, cztery wierzchołki, obrót; punkt pośredni bez przyciągania kierunku.
  const handles = shapeHandles(arc, 30).map((handle) => handle.id);
  assert.deepEqual(handles.filter((id) => id.startsWith('v')), ['v0', 'v1', 'v2', 'v3']);
  const moved = moveShapeHandle(arc, 'v1', { x: 250, y: 200 });
  const after = polyPoints(moved);
  near(after[1].x, 250, 1);
  near(after[1].y, 200, 1);
  near(after[0].x, 100, 1);
  // Zapis: dokładnie 4 wierzchołki, zakończenia inne niż domyślne, rodzaj linii.
  const saved = cleanShape({ ...withCaps(arc, { start: 'circle', end: 'none' }), dash: 'dashed' }, 1600, 1100, isColor);
  assert.deepEqual([saved.startCap, saved.endCap, saved.dash, saved.nodes.length], ['circle', 'none', 'dashed', 8]);
  assert.equal(cleanShape({ ...arc, nodes: arc.nodes.slice(0, 6) }, 1600, 1100, isColor), null, 'trzy punkty – złe dane');
  assert.equal(cleanShape({ ...arc, nodes: [...arc.nodes, 0, 0] }, 1600, 1100, isColor), null, 'pięć punktów – złe dane');
  // Dotknięcie (bez przeciągnięcia) – łuk domyślnej długości.
  const tapped = shapeFromDrag('curve', { x: 300, y: 300 }, { x: 301, y: 300 }, style, { defaultSize: 176 });
  near(polyPoints(tapped)[3].x, 476, 1);
});

test('rysunek 1.27: ustawienia narzędzi – rodzaj linii, zakończenia łuku i znacznik punktu zapamiętane, złe – domyślne', () => {
  const base = defaultToolSettings();
  assert.deepEqual([base.shapeDash, base.curveCaps, base.pointMark], ['solid', { start: 'none', end: 'arrow' }, 'center']);
  const saved = cleanToolSettings({ shapeDash: 'center', curveCaps: { start: 'circle', end: 'triangle' }, pointMark: 'dot', shape: 'curve' });
  assert.deepEqual([saved.shapeDash, saved.curveCaps, saved.pointMark, saved.shape], ['center', { start: 'circle', end: 'triangle' }, 'dot', 'curve']);
  const bad = cleanToolSettings({ shapeDash: 'wavy', pointMark: 'star', curveCaps: 'x' });
  assert.deepEqual([bad.shapeDash, bad.pointMark, bad.curveCaps], ['solid', 'center', { start: 'none', end: 'arrow' }]);
});
