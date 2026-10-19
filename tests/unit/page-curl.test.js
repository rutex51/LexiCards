// Geometria zaginanej kartki (wersja 1.4): chwyt, zgięcie, odbicie płata, ograniczenia papieru
// (kartka nie odrywa się od grzbietu) i droga rogu przy przewracaniu przyciskiem.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  IDENTITY, applyMatrix, clipPolygon, constrainCorner, cornerLift, cornerOf, cornerPath, foldGeometry, gripOf, mirror,
  multiply, reflection, turnedCorner
} from '../../js/core/page-curl.js';

const W = 360;
const H = 600;
const PAGE = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];

/** Pole wielokąta (wzór Gaussa). */
function area(polygon) {
  let sum = 0;
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    sum += point.x * next.y - next.x * point.y;
  });
  return Math.abs(sum) / 2;
}

const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} ≠ ${b}`);
const hasVertex = (polygon, point) => polygon.some((vertex) => Math.hypot(vertex.x - point.x, vertex.y - point.y) < 1e-6);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('chwyt: górna i dolna część strony – róg, środek – krawędź (zgięcie pionowe)', () => {
  assert.equal(gripOf(20, H), 'top');
  assert.equal(gripOf(H - 20, H), 'bottom');
  assert.equal(gripOf(H / 2, H), 'edge');
  assert.deepEqual(cornerOf('top', W, H), { x: W, y: 0 });
  assert.deepEqual(cornerOf('bottom', W, H), { x: W, y: H });
  assert.deepEqual(cornerOf('edge', W, H, 250), { x: W, y: 250 });
  assert.deepEqual(turnedCorner({ x: W, y: H }), { x: -W, y: H });
});

test('przycięcie wielokąta prostą: dwie części mają razem pole całej strony', () => {
  const point = { x: 200, y: 300 };
  const normal = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const one = clipPolygon(PAGE, point, normal);
  const other = clipPolygon(PAGE, point, { x: -normal.x, y: -normal.y });
  near(area(one) + area(other), W * H, 'suma pól');
  assert.deepEqual(clipPolygon(PAGE, { x: -10, y: 0 }, { x: -1, y: 0 }), [], 'prosta poza stroną – pusta część');
});

test('odbicie względem prostej: punkty prostej zostają, dwukrotne odbicie to tożsamość, odwrócenie strony (lustro)', () => {
  const point = { x: 120, y: 80 };
  const direction = { x: 0.6, y: 0.8 };
  const matrix = reflection(point, direction);
  const onLine = { x: point.x + direction.x * 50, y: point.y + direction.y * 50 };
  near(applyMatrix(matrix, onLine).x, onLine.x, 'x na prostej');
  near(applyMatrix(matrix, onLine).y, onLine.y, 'y na prostej');
  const twice = multiply(matrix, matrix);
  IDENTITY.forEach((value, index) => near(twice[index], value, `element ${index}`));
  near(matrix[0] * matrix[3] - matrix[1] * matrix[2], -1, 'wyznacznik');
  const flipped = multiply(mirror(W), mirror(W));
  IDENTITY.forEach((value, index) => near(flipped[index], value, `lustro ${index}`));
});

test('zgięcie z dolnego rogu: róg ląduje w punkcie palca, płaska część zawiera grzbiet i górny róg', () => {
  const corner = cornerOf('bottom', W, H);
  const point = { x: 220, y: 480 };
  const fold = foldGeometry({ width: W, height: H, corner, point });
  near(area(fold.flat) + area(fold.folded), W * H, 'płaska + zagięta = strona');
  near(area(fold.flap), area(fold.folded), 'płat ma pole zagiętej części');
  assert.ok(hasVertex(fold.flap, point), 'róg płata w punkcie palca');
  assert.ok(hasVertex(fold.flat, { x: W, y: 0 }), 'górny róg leży płasko');
  assert.ok(!hasVertex(fold.flat, { x: W, y: H }), 'dolny róg jest zagięty');
  assert.ok(hasVertex(fold.flat, { x: 0, y: 0 }) && hasVertex(fold.flat, { x: 0, y: H }), 'grzbiet leży płasko');
  // Zgięcie przechodzi w połowie drogi róg–palec, prostopadle do niej.
  near(fold.point.x, (corner.x + point.x) / 2, 'środek x');
  near(fold.point.y, (corner.y + point.y) / 2, 'środek y');
  near(fold.direction.x * (corner.x - point.x) + fold.direction.y * (corner.y - point.y), 0, 'prostopadłość');
  assert.ok(fold.progress > 0 && fold.progress < 0.5);
  assert.equal(foldGeometry({ width: W, height: H, corner, point: corner }), null, 'bez ruchu kartka leży płasko');
});

test('zgięcie z górnego rogu zagina górę; chwyt krawędzi zgina prosto, pionowo', () => {
  const top = foldGeometry({ width: W, height: H, corner: cornerOf('top', W, H), point: { x: 250, y: 90 } });
  assert.ok(hasVertex(top.flat, { x: W, y: H }), 'dolny róg leży płasko');
  assert.ok(!hasVertex(top.flat, { x: W, y: 0 }), 'górny róg jest zagięty');

  const corner = cornerOf('edge', W, H, 300);
  const point = constrainCorner({ width: W, height: H, corner, point: { x: 100, y: 340 } });
  assert.equal(point.y, 300, 'chwyt krawędzi: róg idzie tylko w poziomie');
  const edge = foldGeometry({ width: W, height: H, corner, point });
  near(edge.direction.x, 0, 'zgięcie pionowe');
  const foldX = (W + 100) / 2;
  const xs = edge.folded.map((vertex) => vertex.x).sort((a, b) => a - b);
  [foldX, foldX, W, W].forEach((x, index) => near(xs[index], x, `wierzchołek ${index}`));
  near(area(edge.flap), (W - foldX) * H, 'płat to pas przy zgięciu');
});

test('kartka nie odrywa się od grzbietu: róg najdalej tak, jak pozwala papier', () => {
  const corner = cornerOf('bottom', W, H);
  for (const wanted of [{ x: -900, y: -400 }, { x: -300, y: H }, { x: 100, y: -800 }, { x: -W, y: 100 }]) {
    const point = constrainCorner({ width: W, height: H, corner, point: wanted });
    assert.ok(distance(point, { x: 0, y: H }) <= W + 1e-6, 'odległość od dolnego końca grzbietu');
    assert.ok(distance(point, { x: 0, y: 0 }) <= Math.hypot(W, H) + 1e-6, 'odległość od górnego końca grzbietu');
    assert.ok(point.y <= H, 'dolny róg nie schodzi poniżej strony');
    const fold = foldGeometry({ width: W, height: H, corner, point });
    if (!fold) continue;
    assert.ok(hasVertex(fold.flat, { x: 0, y: 0 }) || fold.flat.length === 0, 'górny koniec grzbietu płasko');
    assert.ok(fold.flat.every((vertex) => vertex.x >= -1e-6));
  }
  const top = constrainCorner({ width: W, height: H, corner: cornerOf('top', W, H), point: { x: 0, y: -50 } });
  assert.ok(top.y >= 0, 'górny róg nie wychodzi nad stronę');
  // W pełni przewrócona kartka: zgięcie na grzbiecie, płat to cała strona po drugiej stronie.
  const turned = foldGeometry({ width: W, height: H, corner, point: turnedCorner(corner) });
  assert.equal(turned.flat.length, 0);
  near(turned.progress, 1, 'postęp');
  assert.ok(turned.flap.every((vertex) => vertex.x <= 1e-6));
});

test('droga rogu przy przewracaniu przyciskiem: od dolnego rogu łukiem do przewróconej kartki', () => {
  const corner = cornerOf('bottom', W, H);
  assert.deepEqual(cornerPath(corner, W, H, 0), corner);
  const end = cornerPath(corner, W, H, 1);
  near(end.x, -W, 'koniec x');
  near(end.y, H, 'koniec y');
  const middle = cornerPath(corner, W, H, 0.5);
  assert.ok(middle.y < H - 50, 'w połowie róg jest uniesiony');
  assert.equal(cornerLift(cornerOf('edge', W, H, 300), W, H, 0.5), 0, 'chwyt krawędzi bez uniesienia');
  assert.ok(cornerLift(cornerOf('top', W, H), W, H, 0.5) > 0, 'górny róg idzie w dół');
});
