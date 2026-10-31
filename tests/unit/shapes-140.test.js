// Kształty 1.40 (etap D): wielokąt foremny, półprosta, narożniki prostokąta (R i faza), kreskowanie,
// pole i obwód, kolejność rysowania, ustawienia narzędzi i DXF.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PAPER_STEP, STYLE_DEFAULTS, cleanToolSettings, defaultToolSettings, emptyDrawing, reorderStrokes, shapeMeasureText, shapeToolStyle, withShapeToolStyle
} from '../../js/core/drawing.js';
import { drawingToDxf, dxfPrimitives, parseDxf, primitivesToElements } from '../../js/core/dxf.js';
import {
  HATCH_DEFAULT, cleanHatch, cleanShape, cornerSize, dimKeys, hatchLines, isSegment, moveShapeHandle, ngonSides, polyPoints, segmentCaps,
  shapeContains, shapeFromDrag, shapeHatch, shapeMeasure, shapeOutline, shapePath, shapePoint, withCorner, withNgonSides, withShapeFill
} from '../../js/core/shapes.js';
import { mirrorStroke, rotateStroke } from '../../js/core/transform.js';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const style = { color: '#1d1d1f', size: 2 };
const isColor = (value) => /^#[0-9a-f]{6}$/i.test(value);
/** Wierzchołki wielokąta foremnego w punktach strony (z obrysu). */
const corners = (shape) => {
  const { points } = shapeOutline(shape);
  return Array.from({ length: points.length / 2 }, (_, index) => ({ x: points[index * 2], y: points[index * 2 + 1] }));
};
const rect = (extra = {}) => ({ tool: 'shape', shape: 'rect', color: '#1d1d1f', size: 2, x: 200, y: 200, w: 100, h: 60, angle: 0, skew: 0, adjust: 0, ...extra });

test('kształty 1.40: wielokąt foremny – od środka do wierzchołka, dotknięcie z podstawą u dołu, liczba boków, foremny po zmianie wielkości', () => {
  const center = { x: 400, y: 300 };
  const hexagon = shapeFromDrag('ngon', center, { x: 400, y: 200 }, { ...style, sides: 6 });
  assert.equal(hexagon.shape, 'ngon');
  assert.equal(hexagon.sides, 6);
  const points = corners(hexagon);
  assert.equal(points.length, 6);
  // Wszystkie wierzchołki na okręgu o promieniu przeciągnięcia; jeden – w końcu przeciągnięcia.
  for (const point of points) near(Math.hypot(point.x - center.x, point.y - center.y), 100, 0.05);
  assert.ok(points.some((point) => Math.hypot(point.x - 400, point.y - 200) < 0.05), 'wierzchołek w końcu przeciągnięcia');
  near(shapeMeasure(hexagon).area, ((3 * Math.sqrt(3)) / 2) * 100 * 100, 1);
  near(shapeMeasure(hexagon).perimeter, 600, 0.1);
  // Dotknięcie: domyślna wielkość, podstawa pozioma u dołu (dwa najniższe wierzchołki na jednej wysokości).
  const tapped = shapeFromDrag('ngon', center, center, { ...style, sides: 5 });
  assert.equal(tapped.angle, 0);
  const ys = corners(tapped).map((point) => point.y).sort((a, b) => b - a);
  near(ys[0], ys[1], 1e-6);
  // Prawie prosto – przyciągnięty do 0°, z Shift – co 15°.
  const tilted = shapeFromDrag('ngon', center, { x: 400 + Math.sin(0.03) * 100, y: 300 - Math.cos(0.03) * 100 }, { ...style, sides: 3 });
  assert.equal(tilted.angle, 0);
  const locked = shapeFromDrag('ngon', center, { x: 400 + Math.sin(0.4) * 100, y: 300 - Math.cos(0.4) * 100 }, { ...style, sides: 3 }, { lock: true });
  near(locked.angle, Math.PI / 6, 1e-9);
  // Zapis: liczba boków poza zakresem – sześć.
  assert.equal(cleanShape({ ...hexagon, sides: 2 }, 1600, 1100, isColor).sides, 6);
  assert.equal(cleanShape({ ...hexagon, sides: 8 }, 1600, 1100, isColor).sides, 8);
  assert.equal(ngonSides({}), 6);
  // Inna liczba boków: ten sam środek okręgu opisanego i promień.
  const octagon = withNgonSides(hexagon, 8);
  assert.equal(corners(octagon).length, 8);
  for (const point of corners(octagon)) near(Math.hypot(point.x - center.x, point.y - center.y), 100, 0.05);
  // Narożnik ramki – zostaje foremny (proporcje ramki bez zmian), bok – rozciąga (sześciokąt bez obrotu).
  const flat = shapeFromDrag('ngon', center, center, { ...style, sides: 6 });
  const corner = shapePoint(flat, 0.5, 0.5);
  const bigger = moveShapeHandle(flat, 'se', { x: corner.x + 40, y: corner.y + 5 });
  near(bigger.w / bigger.h, flat.w / flat.h, 0.01);
  const side = shapePoint(flat, 0.5, 0);
  const stretched = moveShapeHandle(flat, 'e', { x: side.x + 40, y: side.y });
  assert.ok(stretched.w / stretched.h > flat.w / flat.h + 0.1);
  assert.deepEqual(dimKeys(hexagon), ['width', 'height', 'skew']);
});

test('kształty 1.40: półprosta – od pierwszego punktu w jedną stronę, bez zakończeń, wymiar kąta', () => {
  const ray = shapeFromDrag('ray', { x: 100, y: 500 }, { x: 300, y: 500 }, style);
  assert.equal(ray.shape, 'ray');
  assert.ok(isSegment(ray));
  const { points } = shapeOutline(ray);
  near(points[0], 100);
  near(points[1], 500);
  assert.ok(points[2] > 10000, 'biegnie daleko za drugi punkt');
  assert.deepEqual(segmentCaps(ray), { start: 'none', end: 'none' });
  assert.deepEqual(dimKeys(ray), ['angle']);
  const saved = cleanShape({ ...ray, startCap: 'arrow' }, 1600, 1100, isColor);
  assert.equal(saved.shape, 'ray');
  assert.equal(saved.h, 0);
  assert.equal(saved.startCap, undefined);
  // Odbicie: początek zostaje początkiem.
  const mirrored = mirrorStroke(ray, 'horizontal', 400);
  near(shapePoint(mirrored, -0.5, 0).x, 700, 0.01);
  near(shapePoint(mirrored, 0.5, 0).x, 500, 0.01);
});

test('kształty 1.40: narożniki prostokąta – faza i zaokrąglenie, najwyżej połowa krótszego boku, pole i obwód, ścieżka z łukami', () => {
  const chamfer = withCorner(rect(), { kind: 'chamfer', size: 10 });
  assert.equal(corners(chamfer).length, 8);
  near(shapeMeasure(chamfer).area, 100 * 60 - 2 * 10 * 10, 1e-6);
  near(shapeMeasure(chamfer).perimeter, 2 * (100 + 60) - 8 * 10 + 4 * Math.SQRT2 * 10, 1e-6);
  const round = withCorner(rect(), { kind: 'round', size: 10 });
  near(shapeMeasure(round).area, 100 * 60 - (4 - Math.PI) * 100, 1e-6);
  near(shapeMeasure(round).perimeter, 2 * (100 + 60) - 80 + 20 * Math.PI, 1e-6);
  const path = shapePath(round);
  assert.equal(path.closed, true);
  assert.equal(path.curves.length, 8, '4 łuki i 4 boki');
  near(path.start.x, 160);
  near(path.start.y, 170);
  // Za duży promień – połowa krótszego boku (stadion).
  const stadium = withCorner(rect(), { kind: 'round', size: 500 });
  assert.equal(cornerSize(stadium), 30);
  assert.equal(shapePath(stadium).curves.length, 6, 'boki pionowe znikają');
  assert.ok(shapeContains(round, 200, 200));
  assert.equal(shapeContains(round, 151, 171), false, 'róg zaokrąglony – poza kształtem');
  // Zapis: zły rodzaj albo wielkość – bez narożników; tylko prostokąt.
  assert.deepEqual(cleanShape(round, 1600, 1100, isColor).corner, { kind: 'round', size: 10 });
  assert.equal(cleanShape(rect({ corner: { kind: 'wave', size: 4 } }), 1600, 1100, isColor).corner, undefined);
  assert.equal(cleanShape(rect({ corner: { kind: 'round', size: -1 } }), 1600, 1100, isColor).corner, undefined);
  assert.equal(cleanShape({ ...rect({ corner: { kind: 'round', size: 4 } }), shape: 'diamond' }, 1600, 1100, isColor).corner, undefined);
  assert.equal(withCorner(round, null).corner, undefined);
  // Nowy prostokąt z narożnikami narzędzia.
  const drawn = shapeFromDrag('rect', { x: 0, y: 0 }, { x: 120, y: 80 }, { ...style, corner: { kind: 'chamfer', size: 8 } });
  assert.deepEqual(drawn.corner, { kind: 'chamfer', size: 8 });
});

test('kształty 1.40: kreskowanie – linie w środku kształtu, pominięte na brzegu, krzyżowe, obrót i odbicie, zapis', () => {
  const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const flat = hatchLines(square, 0, 10);
  assert.equal(flat.length, 9, 'linie co 10 bez brzegów y = 0 i y = 100');
  for (const [a, b] of flat) {
    near(a.y, b.y);
    near(Math.abs(b.x - a.x), 100, 1e-6);
  }
  const slanted = hatchLines(square, 45, 10);
  for (const [a, b] of slanted) {
    // Linie „/”: w górę w prawo (oś y strony w dół), końce na brzegu kwadratu.
    near((a.y - b.y) / (b.x - a.x), 1, 1e-9);
    for (const point of [a, b]) assert.ok(point.x >= -1e-6 && point.x <= 100 + 1e-6 && point.y >= -1e-6 && point.y <= 100 + 1e-6);
  }
  const hatched = withShapeFill(rect(), 'hatch', { angle: 45, gap: 11 });
  assert.deepEqual(hatched.hatch, { angle: 45, gap: 11, cross: false });
  const single = shapeHatch(hatched).length;
  assert.ok(single > 5);
  assert.equal(shapeHatch({ ...hatched, hatch: { ...hatched.hatch, cross: true } }).length > single, true, 'krzyżowe – więcej linii');
  assert.deepEqual(shapeHatch(rect()), []);
  assert.equal(withShapeFill(hatched, 'light').hatch, undefined, 'inne wypełnienie – bez kreskowania');
  assert.equal(withShapeFill(shapeFromDrag('line', { x: 0, y: 0 }, { x: 50, y: 0 }, style), 'hatch').fill, undefined, 'odcinek bez wypełnienia');
  // Obrót o 90° zgodnie z ruchem wskazówek zegara: „/” → „\\”; odbicie: 45° → 135°.
  assert.equal(rotateStroke(hatched, 200, 200, Math.PI / 2).hatch.angle, 135);
  assert.equal(mirrorStroke(hatched, 'horizontal', 200).hatch.angle, 135);
  // Zapis.
  assert.deepEqual(cleanHatch({ angle: 225, gap: 1000, cross: 'tak' }), { angle: 45, gap: 120, cross: false });
  assert.deepEqual(cleanHatch({ angle: -45, gap: 2 }), { angle: 135, gap: 3, cross: false });
  assert.deepEqual(cleanHatch(null), { ...HATCH_DEFAULT });
  const saved = cleanShape({ ...hatched, hatch: { angle: 30, gap: 8, cross: true } }, 1600, 1100, isColor);
  assert.deepEqual([saved.fill, saved.hatch], ['hatch', { angle: 30, gap: 8, cross: true }]);
  assert.equal(cleanShape({ ...rect(), fill: 'light', hatch: { angle: 30 } }, 1600, 1100, isColor).hatch, undefined);
  // Wielokąt z rozpoznania i nowy kształt z kreskowaniem narzędzia.
  const drawn = shapeFromDrag('ellipse', { x: 0, y: 0 }, { x: 120, y: 80 }, { ...style, fill: 'hatch', hatch: { angle: 0, gap: 6 } });
  assert.deepEqual([drawn.fill, drawn.hatch], ['hatch', { angle: 0, gap: 6, cross: false }]);
});

test('kształty 1.40: pole i obwód w jednostkach rysunku; elipsa dokładnie, otwarte kształty bez pola', () => {
  const square = rect({ w: PAPER_STEP, h: PAPER_STEP });
  assert.deepEqual(shapeMeasureText(square, { value: 1, unit: 'cm' }), { area: '1 cm²', perimeter: '4 cm' });
  assert.deepEqual(shapeMeasureText(square, { value: 1, unit: 'cm' }, { style: 'technical', unit: 'mm' }), { area: '100 mm²', perimeter: '40 mm' });
  const circle = shapeFromDrag('ellipse', { x: 300, y: 300 }, { x: 400, y: 400 }, style);
  near(shapeMeasure(circle).area, Math.PI * 50 * 50, 1e-6);
  near(shapeMeasure(circle).perimeter, Math.PI * 100, 1e-6);
  // Elipsa pochylona: pole bez zmian (pochylenie go nie zmienia), obwód dłuższy.
  const skewed = { ...shapeFromDrag('ellipse', { x: 0, y: 0 }, { x: 100, y: 60 }, style), skew: 0.5 };
  near(shapeMeasure(skewed).area, (Math.PI * 100 * 60) / 4, 1e-6);
  assert.ok(shapeMeasure(skewed).perimeter > shapeMeasure({ ...skewed, skew: 0 }).perimeter);
  const triangle = shapeFromDrag('triangle', { x: 0, y: 0 }, { x: 100, y: 80 }, style);
  near(shapeMeasure(triangle).area, 4000, 1e-6);
  assert.equal(shapeMeasure(shapeFromDrag('line', { x: 0, y: 0 }, { x: 50, y: 0 }, style)), null);
  assert.equal(shapeMeasure({ tool: 'pen', points: [] }), null);
  const polygon = { tool: 'shape', shape: 'polygon', color: '#1d1d1f', size: 2, x: 50, y: 50, w: 100, h: 100, angle: 0, skew: 0, adjust: 0, nodes: [-0.5, -0.5, 0.5, -0.5, -0.5, 0.5] };
  near(shapeMeasure(polygon).area, 5000, 1e-6);
  assert.equal(polyPoints(polygon).length, 3);
});

test('kolejność rysowania 1.40: na wierzch, na spód, wyżej i niżej – nad (pod) najbliższy zakrywany element', () => {
  const box = (name, x) => ({ name, minX: x, maxX: x + 10, minY: 0, maxY: 10 });
  const [a, b, c, d] = [box('a', 0), box('b', 100), box('c', 5), box('d', 8)];
  const strokes = [a, b, c, d];
  const boundsOf = (item) => item;
  const names = (list) => list.map((item) => item.name).join('');
  assert.equal(names(reorderStrokes(strokes, new Set([a]), 'front', boundsOf)), 'bcda');
  assert.equal(names(reorderStrokes(strokes, new Set([d, b]), 'back', boundsOf)), 'bdac');
  // Wyżej: a przeskakuje b (nie zakrywa go) i staje tuż nad c.
  assert.equal(names(reorderStrokes(strokes, new Set([a]), 'up', boundsOf)), 'bcad');
  assert.equal(names(reorderStrokes(strokes, new Set([d]), 'down', boundsOf)), 'abdc');
  // Bez zmiany – ta sama tablica.
  assert.equal(reorderStrokes(strokes, new Set([d]), 'up', boundsOf), strokes);
  assert.equal(reorderStrokes(strokes, new Set([b]), 'down', boundsOf), strokes);
  assert.equal(reorderStrokes(strokes, new Set(strokes), 'front', boundsOf), strokes);
  assert.equal(reorderStrokes(strokes, new Set(), 'front', boundsOf), strokes);
});

test('ustawienia 1.40: boki wielokąta, narożniki prostokąta i kreskowanie narzędzia – zapis i sprawdzanie', () => {
  const tools = defaultToolSettings();
  assert.equal(tools.ngonSides, 6);
  assert.equal(tools.rectCorner, null);
  assert.deepEqual(shapeToolStyle(tools, 'rect').hatch, { ...HATCH_DEFAULT });
  const saved = cleanToolSettings({ ...withShapeToolStyle(tools, 'rect', 'hatch', { angle: 135, gap: 6, cross: true }), ngonSides: 8, rectCorner: { kind: 'round', size: 11 } });
  assert.equal(saved.ngonSides, 8);
  assert.deepEqual(saved.rectCorner, { kind: 'round', size: 11 });
  assert.deepEqual(shapeToolStyle(saved, 'rect').hatch, { angle: 135, gap: 6, cross: true });
  const wrong = cleanToolSettings({ styleDefaults: STYLE_DEFAULTS, ngonSides: 40, rectCorner: { kind: 'round', size: 0 }, shapeFill: 'hatch' });
  assert.equal(wrong.ngonSides, 6);
  assert.equal(wrong.rectCorner, null);
  assert.equal(wrong.shapeFill, 'hatch');
  assert.equal(cleanToolSettings({ shape: 'ngon' }).shape, 'ngon');
  assert.equal(cleanToolSettings({ shape: 'ray' }).shape, 'ray');
});

test('DXF 1.40: półprosta (LINE od początku), kreskowanie (linie), zaokrąglony prostokąt z łukami (bulge), RAY wczytany jako półprosta', () => {
  const drawing = emptyDrawing();
  drawing.strokes = [
    shapeFromDrag('ray', { x: 100, y: 500 }, { x: 300, y: 500 }, style),
    withShapeFill(rect({ x: 400, y: 400 }), 'hatch', { angle: 0, gap: 10 }),
    withCorner(rect({ x: 800, y: 400 }), { kind: 'round', size: 10 })
  ];
  const { text, written } = drawingToDxf(drawing);
  assert.equal(written, 3);
  const parsed = parseDxf(text);
  const lines = parsed.entities.filter((item) => item.type === 'LINE');
  // Półprosta i 5 linii kreskowania (prostokąt 100 × 60, co 10, bez brzegów).
  assert.equal(lines.length, 1 + 5);
  const polyline = parsed.entities.filter((item) => item.type === 'POLYLINE').at(-1);
  assert.equal(polyline.vertices.filter((vertex) => vertex.number(42)).length, 4, 'cztery łuki narożników');
  near(polyline.vertices.find((vertex) => vertex.number(42)).number(42), -Math.tan(Math.PI / 8), 1e-3);
  const { primitives } = dxfPrimitives(parsed);
  const rounded = primitives.at(-1);
  assert.equal(rounded.kind, 'poly');
  assert.ok(rounded.points.length > 8, 'łuki rozłożone na punkty przy wczytaniu');
  // RAY z innego programu – półprosta.
  const file = ['0', 'SECTION', '2', 'ENTITIES', '0', 'RAY', '8', '0', '10', '10', '20', '20', '30', '0', '11', '1', '21', '0', '31', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const read = dxfPrimitives(parseDxf(file)).primitives;
  assert.equal(read[0].kind, 'ray');
  const [element] = primitivesToElements(read, { unitMm: 1, pageUnitMm: 1, origin: { x: 0, y: 0 }, bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } });
  assert.equal(element.shape, 'ray');
});
