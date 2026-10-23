// Rysunek 1.43 (pakiet E planu „rysunek jak w CAD”): odsunięcie, zaokrąglenie i faza dwóch odcinków, przycinanie
// i wydłużanie do przecięć, okrąg styczny do dwóch elementów (TTR).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canExtend, canOffset, canTrim, chamferSegments, extendAt, filletSegments, offsetShape, segmentEnds, tangentCircle, tangentTarget, trimAt
} from '../../js/core/geometry-edit.js';
import { arcFromPoints, arcGeometry, circleShape, polyFromPoints, polyPoints, shapeFromDrag, withCaps, withCorner } from '../../js/core/shapes.js';

const style = { color: '#1d1d1f', size: 2 };
const near = (actual, expected, tolerance = 0.05) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const nearPoint = (actual, [x, y], tolerance = 0.05) => {
  near(actual.x, x, tolerance);
  near(actual.y, y, tolerance);
};
const line = (a, b) => shapeFromDrag('line', a, b, style);
const ends = (shape) => segmentEnds(shape);
/** Ćwiartka okręgu (500, 500) o promieniu 100 od prawej (0°) do góry strony (−90°). */
const quarter = () => arcFromPoints({ x: 600, y: 500 }, { x: 500, y: 400 }, { x: 500 + 100 * Math.SQRT1_2, y: 500 - 100 * Math.SQRT1_2 }, style);

test('rysunek 1.43: odsunięcie – odcinek na stronę dotknięcia, okrąg i łuk współśrodkowo, prostokąt z zaokrągleniem, łamana, trójkąt jako wielokąt', () => {
  const segment = { ...line({ x: 100, y: 100 }, { x: 300, y: 100 }), id: 'abc123', attach: { start: { id: 'x', kind: 'corner', index: 0 } } };
  const [up] = offsetShape(segment, 20, { x: 200, y: 50 }).shapes;
  ends(up).forEach((point, index) => nearPoint(point, [[100, 80], [300, 80]][index]));
  assert.equal(up.id, undefined, 'kopia – nowy element bez identyfikatora');
  assert.equal(up.attach, undefined);
  nearPoint(ends(offsetShape(segment, 20, { x: 200, y: 150 }).shapes[0])[0], [100, 120]);
  // Okrąg: dotknięcie na zewnątrz – większy, w środku – mniejszy; za duża odległość – komunikat.
  const circle = circleShape({ x: 500, y: 500 }, 50, style);
  assert.equal(offsetShape(circle, 10, { x: 600, y: 500 }).shapes[0].w, 120);
  assert.equal(offsetShape(circle, 10, { x: 510, y: 500 }).shapes[0].w, 80);
  assert.match(offsetShape(circle, 60, { x: 510, y: 500 }).error, /promień/);
  // Łuk – ten sam środek i kąty, promień + 20.
  const arc = arcGeometry(offsetShape(quarter(), 20, { x: 700, y: 400 }).shapes[0]);
  nearPoint(arc.center, [500, 500], 0.1);
  near(arc.radius, 120, 0.1);
  near(arc.sweep, -Math.PI / 2, 1e-3);
  // Prostokąt 200 × 100 z zaokrągleniem R 10: na zewnątrz o 5 – 210 × 110, R 15; do środka – 190 × 90, R 5.
  const rect = withCorner(shapeFromDrag('rect', { x: 100, y: 100 }, { x: 300, y: 200 }, style), { kind: 'round', size: 10 });
  const out = offsetShape(rect, 5, { x: 50, y: 50 }).shapes[0];
  assert.deepEqual([out.w, out.h, out.corner], [210, 110, { kind: 'round', size: 15 }]);
  const inner = offsetShape(rect, 5, { x: 200, y: 150 }).shapes[0];
  assert.deepEqual([inner.w, inner.h, inner.corner], [190, 90, { kind: 'round', size: 5 }]);
  assert.match(offsetShape(rect, 60, { x: 200, y: 150 }).error, /za duża/);
  // Faza 10 na zewnątrz o 5 – 10 + 5·(2 − √2).
  const chamfered = offsetShape(withCorner(rect, { kind: 'chamfer', size: 10 }), 5, { x: 50, y: 50 }).shapes[0];
  near(chamfered.corner.size, 10 + 5 * (2 - Math.SQRT2), 0.01);
  // Łamana „Γ” przesunięta do środka narożnika: wierzchołek w przecięciu przesuniętych boków.
  const polyline = polyFromPoints('polyline', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], { x: 50, y: 50, angle: 0 }, style);
  const moved = polyPoints(offsetShape(polyline, 10, { x: 50, y: 30 }).shapes[0]);
  [[0, 10], [90, 10], [90, 100]].forEach((expected, index) => nearPoint(moved[index], expected, 0.05));
  // Trójkąt na zewnątrz – wielokąt o bokach 5 dalej (podstawa y = 100 → 105).
  const triangle = offsetShape(shapeFromDrag('triangle', { x: 0, y: 0 }, { x: 100, y: 100 }, style), 5, { x: 500, y: 500 }).shapes[0];
  assert.equal(triangle.shape, 'polygon');
  const base = polyPoints(triangle).filter((point) => point.y > 100);
  assert.equal(base.length, 2);
  base.forEach((point) => near(point.y, 105, 0.05));
  // Czego nie da się odsunąć.
  assert.equal(canOffset(shapeFromDrag('ellipse', { x: 0, y: 0 }, { x: 200, y: 100 }, style)), false, 'elipsa');
  assert.equal(canOffset({ tool: 'pen', points: [0, 0, 1, 10, 10, 1] }), false, 'kreska');
  assert.match(offsetShape(circle, 0, { x: 600, y: 500 }).error, /większa od zera/);
});

test('rysunek 1.43: zaokrąglenie i faza dwóch odcinków – punkty styczności, łuk, promień 0 – ostry narożnik, za duży promień; dotknięcia wybierają części', () => {
  const across = line({ x: 100, y: 300 }, { x: 300, y: 300 });
  const down = withCaps(line({ x: 300, y: 100 }, { x: 300, y: 280 }), { start: 'arrow', end: 'none' });
  const [first, second, arc] = filletSegments(across, down, 30).shapes;
  ends(first).forEach((point, index) => nearPoint(point, [[100, 300], [270, 300]][index]));
  ends(second).forEach((point, index) => nearPoint(point, [[300, 100], [300, 270]][index]));
  assert.equal(second.startCap, 'arrow', 'grot na zachowanym końcu zostaje');
  const geometry = arcGeometry(arc);
  nearPoint(geometry.center, [270, 270], 0.05);
  near(geometry.radius, 30, 0.05);
  near(Math.abs(geometry.sweep), Math.PI / 2, 1e-3);
  // Promień 0 – odcinki wydłużone do przecięcia, bez łuku.
  const sharp = filletSegments(across, down, 0).shapes;
  assert.equal(sharp.length, 2);
  nearPoint(ends(sharp[1])[1], [300, 300]);
  assert.match(filletSegments(across, down, 300).error, /za duży/);
  assert.match(filletSegments(across, line({ x: 100, y: 400 }, { x: 300, y: 400 }), 10).error, /równoległe/);
  // Faza 20: odcinki skrócone o 20 od narożnika, nowy odcinek między nimi.
  const [cutFirst, cutSecond, bevel] = chamferSegments(across, down, 20).shapes;
  nearPoint(ends(cutFirst)[1], [280, 300]);
  nearPoint(ends(cutSecond)[1], [300, 280]);
  ends(bevel).forEach((point, index) => nearPoint(point, [[280, 300], [300, 280]][index]));
  assert.match(chamferSegments(across, down, 500).error, /za duża/);
  // Przecinające się odcinki („X”): dotknięcia w lewej części obu – zostają lewe części.
  const a = line({ x: 0, y: 0 }, { x: 200, y: 200 });
  const b = line({ x: 0, y: 200 }, { x: 200, y: 0 });
  const [left, right] = filletSegments(a, b, 20, [{ x: 20, y: 20 }, { x: 20, y: 180 }]).shapes;
  nearPoint(ends(left)[0], [0, 0]);
  nearPoint(ends(right)[0], [0, 200]);
  assert.ok(ends(left)[1].x < 100 && ends(right)[1].x < 100, 'lewe części, przed przecięciem');
  // Przyklejony koniec, który się zmienił, jest odklejony; drugi zostaje.
  const linked = { ...across, attach: { start: { id: 'q', kind: 'corner', index: 1 }, end: { id: 'q', kind: 'corner', index: 2 } } };
  assert.deepEqual(filletSegments(linked, down, 30).shapes[0].attach, { start: { id: 'q', kind: 'corner', index: 1 } });
});

test('rysunek 1.43: przycinanie – odcinek między przecięciami (dwa kawałki), koniec, prosta na dwie półproste, okrąg na łuk, łuk; bez przecięć – komunikat', () => {
  const target = { ...line({ x: 0, y: 500 }, { x: 400, y: 500 }), id: 'trim01' };
  const cutters = [line({ x: 100, y: 400 }, { x: 100, y: 600 }), line({ x: 300, y: 400 }, { x: 300, y: 600 })];
  const middle = trimAt([target, ...cutters], target, { x: 200, y: 500 }).shapes;
  assert.equal(middle.length, 2);
  ends(middle[0]).forEach((point, index) => nearPoint(point, [[0, 500], [100, 500]][index]));
  ends(middle[1]).forEach((point, index) => nearPoint(point, [[300, 500], [400, 500]][index]));
  assert.equal(middle[0].id, 'trim01', 'pierwszy kawałek zostaje elementem');
  assert.equal(middle[1].id, undefined);
  const end = trimAt([target, ...cutters], target, { x: 350, y: 500 }).shapes;
  assert.equal(end.length, 1);
  nearPoint(ends(end[0])[1], [300, 500]);
  assert.match(trimAt([target], target, { x: 200, y: 500 }).error, /niczego nie przecina/);
  // Prosta między dwoma pionowymi odcinkami – dwie półproste na zewnątrz.
  const xline = shapeFromDrag('xline', { x: 0, y: 700 }, { x: 100, y: 700 }, style);
  const rays = trimAt([xline, line({ x: 100, y: 650 }, { x: 100, y: 750 }), line({ x: 300, y: 650 }, { x: 300, y: 750 })], xline, { x: 200, y: 700 }).shapes;
  assert.deepEqual(rays.map((shape) => shape.shape), ['ray', 'ray']);
  nearPoint(ends(rays[0])[0], [100, 700]);
  assert.ok(ends(rays[0])[1].x < 100, 'pierwsza w lewo');
  nearPoint(ends(rays[1])[0], [300, 700]);
  assert.ok(ends(rays[1])[1].x > 300, 'druga w prawo');
  // Okrąg przecięty poziomym odcinkiem przez środek: dotknięcie górnej połowy – zostaje dolna (łuk).
  const circle = circleShape({ x: 800, y: 500 }, 100, style);
  const [half] = trimAt([circle, line({ x: 600, y: 500 }, { x: 1000, y: 500 })], circle, { x: 800, y: 400 }).shapes;
  assert.equal(half.shape, 'arc');
  const geometry = arcGeometry(half);
  near(geometry.radius, 100, 0.05);
  near(Math.abs(geometry.sweep), Math.PI, 1e-3);
  assert.ok(half.y > 500, 'dolna połowa');
  assert.match(trimAt([circle, line({ x: 800, y: 300 }, { x: 800, y: 500 })], circle, { x: 800, y: 600 }).error, /dwóch miejscach/);
  // Łuk przecięty odcinkiem pod 45°: dotknięcie przy początku – zostaje część od przecięcia do końca.
  const [rest] = trimAt([quarter(), line({ x: 500, y: 500 }, { x: 650, y: 350 })], quarter(), { x: 590, y: 460 }).shapes;
  const kept = arcGeometry(rest);
  near(kept.start, -Math.PI / 4, 1e-3);
  near(kept.sweep, -Math.PI / 4, 1e-3);
  assert.equal(canTrim(shapeFromDrag('rect', { x: 0, y: 0 }, { x: 100, y: 100 }, style)), false);
});

test('rysunek 1.43: wydłużanie – koniec odcinka do najbliższego elementu na przedłużeniu, łuk po okręgu; bez celu – komunikat', () => {
  const short = withCaps(line({ x: 0, y: 900 }, { x: 100, y: 900 }), { start: 'none', end: 'arrow' });
  const walls = [line({ x: 300, y: 800 }, { x: 300, y: 1000 }), line({ x: 500, y: 800 }, { x: 500, y: 1000 })];
  const [longer] = extendAt([short, ...walls], short, { x: 95, y: 900 }).shapes;
  ends(longer).forEach((point, index) => nearPoint(point, [[0, 900], [300, 900]][index]));
  assert.equal(longer.endCap, 'arrow', 'grot zostaje na końcu');
  assert.match(extendAt([short, ...walls], short, { x: 5, y: 900 }).error, /nic nie leży/);
  // Łuk do poziomego odcinka po lewej (okrąg przecina y = 500 w x = 400): od −90° do −180°.
  const [wider] = extendAt([quarter(), line({ x: 300, y: 500 }, { x: 450, y: 500 })], quarter(), { x: 505, y: 405 }).shapes;
  const geometry = arcGeometry(wider);
  near(geometry.start, 0, 1e-3);
  near(geometry.sweep, -Math.PI, 1e-3);
  assert.equal(canExtend(shapeFromDrag('xline', { x: 0, y: 0 }, { x: 100, y: 0 }, style)), false, 'prosta nie ma końca');
});

test('rysunek 1.43: okrąg styczny (TTR) – do dwóch prostych (w narożniku dotknięć), do prostej i okręgu (na zewnątrz), bez rozwiązania – komunikat', () => {
  const across = line({ x: 100, y: 300 }, { x: 300, y: 300 });
  const down = line({ x: 300, y: 100 }, { x: 300, y: 280 });
  const picks = [{ x: 200, y: 300 }, { x: 300, y: 200 }];
  const [corner] = tangentCircle(tangentTarget(across, picks[0]), tangentTarget(down, picks[1]), 40, picks, style).shapes;
  assert.deepEqual([corner.x, corner.y, corner.w, corner.h], [260, 260, 80, 80]);
  const ground = line({ x: 600, y: 500 }, { x: 1000, y: 500 });
  const wheel = circleShape({ x: 800, y: 500 }, 100, style);
  const [small] = tangentCircle(tangentTarget(ground, { x: 650, y: 500 }), tangentTarget(wheel, { x: 750, y: 420 }), 30, [{ x: 650, y: 500 }, { x: 750, y: 420 }], style).shapes;
  near(Math.abs(small.y - 500), 30, 0.05);
  near(Math.hypot(small.x - 800, small.y - 500), 130, 0.05);
  assert.ok(small.y < 500 && small.x < 800, 'po stronie dotknięć');
  // Dwie równoległe proste 100 od siebie – promień 30 nie dotknie obu.
  assert.match(tangentCircle(tangentTarget(across, picks[0]), tangentTarget(line({ x: 100, y: 400 }, { x: 300, y: 400 }), { x: 200, y: 400 }), 30, picks, style).error, /Nie ma okręgu/);
  // Prostokąt – bok najbliższy dotknięciu.
  const rect = shapeFromDrag('rect', { x: 0, y: 0 }, { x: 200, y: 100 }, style);
  const side = tangentTarget(rect, { x: 198, y: 50 });
  assert.equal(side.kind, 'line');
  near(side.a.x, 200);
  near(side.b.x, 200);
});
