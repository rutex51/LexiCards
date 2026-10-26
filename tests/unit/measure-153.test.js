// Rysunek 1.53: pomiary 3D – cechy brył (narożniki, środki ścian, krawędzie proste, ściany płaskie, oś, wierzchołek, kula),
// pomiar między cechami (odległość z ΔX, ΔY, ΔZ, odległość od prostej i płaszczyzny, kąty, równoległe), odnośniki po zmianie
// bryły, zapis w bryle (format 24), kopie.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { relinkCopies, withoutLinks } from '../../js/core/attach.js';
import { cleanDrawing, emptyDrawing } from '../../js/core/drawing.js';
import {
  MEASURE_LIMITS, angleText, cleanMeasures, drawingMeasures, featureRef, measureFeatures, measureTitle, resolveRef, solidFeatures, withMeasure, withoutMeasure,
  worldFeature
} from '../../js/core/measure3d.js';
import { sceneSolids } from '../../js/core/scene.js';
import { resolveStacks } from '../../js/core/solid-pose.js';
import { newModel, newSolid } from '../../js/core/solids.js';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const nearAll = (actual, expected, tolerance = 1e-6) => actual.forEach((value, index) => near(value, expected[index], tolerance));
/** Prostopadłościan a × b × c (X, Y, Z) w punkcie strony. */
const box = (x, y, extra = {}) => ({ ...newSolid('box', { x, y }), dims: { a: 200, b: 100, c: 60 }, ...extra });
const corners = (features) => features.points.filter((item) => item.role === 'corner');
/** Cecha w świecie dla bryły z rysunku. */
const world = (drawing, solid, feature) => worldFeature(sceneSolids(drawing).find((item) => item.solid === solid), feature);

test('pomiary 1.53: cechy brył – narożniki, środki ścian, krawędzie, ściany płaskie, oś walca i stożka, wierzchołek, kula, bryły ze szkicu', () => {
  const cube = solidFeatures(box(0, 0));
  assert.equal(corners(cube).length, 8);
  assert.equal(cube.points.filter((item) => item.role === 'center').length, 6);
  assert.equal(cube.edges.length, 12);
  assert.equal(cube.faces.length, 6);
  assert.equal(cube.axis, null);
  // Wierzch prostopadłościanu: środek w (0, c/2, 0), normalna w górę (y bryły); krawędź wzdłuż X ma długość a.
  const top = cube.faces.find((face) => face.n[1] > 0.99);
  nearAll(top.p, [0, 30, 0]);
  assert.ok(cube.edges.some((edge) => Math.abs(edge.d[0]) > 0.99 && Math.abs(Math.hypot(...edge.b.map((value, axis) => value - edge.a[axis])) - 200) < 1e-9));
  // Walec: środki podstaw, oś przez nie; pobocznica – oś; bez narożników i krawędzi prostych.
  const cylinder = solidFeatures({ ...newSolid('cylinder', { x: 0, y: 0 }), dims: { d: 80, h: 120 } });
  assert.deepEqual(cylinder.points.map((item) => item.role), ['center', 'center']);
  assert.equal(cylinder.edges.length, 0);
  nearAll(cylinder.axis.a, [0, -60, 0]);
  nearAll(cylinder.axis.d, [0, 1, 0]);
  assert.ok(cylinder.facets.filter((facet) => facet?.kind === 'axis').length > 10, 'pobocznica – oś');
  // Stożek ostry: wierzchołek; ostrosłup – 5 narożników i 8 krawędzi; kula – środek.
  const cone = solidFeatures({ ...newSolid('cone', { x: 0, y: 0 }), dims: { d: 100, t: 0, h: 120 } });
  nearAll(cone.points.find((item) => item.role === 'apex').p, [0, 60, 0]);
  assert.ok(cone.axis);
  const pyramid = solidFeatures(newSolid('pyramid', { x: 0, y: 0 }));
  assert.equal(corners(pyramid).length, 5);
  assert.equal(pyramid.edges.length, 8);
  assert.deepEqual(solidFeatures(newSolid('sphere', { x: 0, y: 0 })).points.map((item) => item.role), ['sphere']);
  // Wyciągnięcie profilu L: 12 narożników, 8 ścian, 18 krawędzi; koło wyciągnięte – pobocznica bez osi (brak cechy).
  const L = { islands: [{ outer: [[-60, -40], [60, -40], [60, -10], [-30, -10], [-30, 40], [-60, 40]], holes: [] }] };
  const bracket = solidFeatures({ ...newModel('extrude', L, { x: 0, y: 0 }), dims: { h: 30 } });
  assert.equal(corners(bracket).length, 12);
  assert.equal(bracket.faces.length, 8);
  assert.equal(bracket.edges.length, 18);
  const ring = Array.from({ length: 48 }, (_, index) => [40 * Math.cos((index / 48) * Math.PI * 2), 40 * Math.sin((index / 48) * Math.PI * 2)]);
  const disc = solidFeatures({ ...newModel('extrude', { islands: [{ outer: ring, holes: [] }] }, { x: 0, y: 0 }), dims: { h: 20 } });
  assert.equal(disc.faces.length, 2, 'dwie podstawy');
  assert.equal(disc.axis, null);
  assert.ok(disc.facets.some((facet) => facet === null), 'pobocznica – bez cechy');
});

test('pomiary 1.53: odległość punkt–punkt z ΔX, ΔY, ΔZ (układ arkusza), od prostej, od płaszczyzny; kąty i równoległe', () => {
  const drawing = emptyDrawing();
  const first = box(400, 500);
  const second = box(800, 300, { z: 50, yaw: 30 });
  drawing.strokes = [first, second];
  const [f1, f2] = [solidFeatures(first), solidFeatures(second)];
  // Środek wierzchu pierwszego (400, 1100 − 500, 60) → środek wierzchu drugiego (800, 800, 110).
  const topCenter = (features) => features.points.find((item) => item.role === 'center' && item.d[1] > 0.99);
  let result = measureFeatures(world(drawing, first, topCenter(f1)), world(drawing, second, topCenter(f2)));
  assert.equal(result.kind, 'distance');
  nearAll(result.delta, [400, 200, 50]);
  near(result.value, Math.hypot(400, 200, 50));
  assert.equal(measureTitle(result), 'Odległość');
  // Punkt i płaszczyzna: środek wierzchu pierwszego od wierzchu drugiego (poziome) – 50.
  const topFace = (features) => features.faces.find((face) => face.n[1] > 0.99);
  result = measureFeatures(world(drawing, second, topFace(f2)), world(drawing, first, topCenter(f1)));
  assert.equal(result.type, 'point-plane');
  near(result.value, 50);
  // Dwie płaszczyzny: wierzchy – równoległe, odległość 50; przody – kąt 30° (obrót drugiego wokół Z).
  result = measureFeatures(world(drawing, first, topFace(f1)), world(drawing, second, topFace(f2)));
  assert.ok(result.parallel);
  near(result.value, 50);
  assert.equal(measureTitle(result), 'Płaszczyzny równoległe – odległość');
  const front = (features) => features.faces.find((face) => face.n[2] < -0.99);
  result = measureFeatures(world(drawing, first, front(f1)), world(drawing, second, front(f2)));
  assert.equal(result.kind, 'angle');
  near(result.value, 30, 1e-9);
  assert.equal(angleText(result.value), '30,00°');
  // Prosta i płaszczyzna: krawędź pionowa pierwszego z wierzchem – 90°; z przodem – równoległa (odległość 0 – leży w nim).
  const vertical = f1.edges.find((edge) => Math.abs(edge.d[1]) > 0.99);
  result = measureFeatures(world(drawing, first, vertical), world(drawing, first, topFace(f1)));
  near(result.value, 90, 1e-9);
  result = measureFeatures(world(drawing, first, vertical), world(drawing, first, front(f1)));
  assert.ok(result.parallel || result.value < 1e-6);
  // Dwie proste: krawędzie pionowe obu brył – równoległe; krawędź X pierwszego i krawędź X drugiego (obrót 30°) – 30°.
  const verticalTwo = f2.edges.find((edge) => Math.abs(edge.d[1]) > 0.99);
  result = measureFeatures(world(drawing, first, vertical), world(drawing, second, verticalTwo));
  assert.ok(result.parallel);
  const alongX = (features) => features.edges.find((edge) => Math.abs(edge.d[0]) > 0.99);
  result = measureFeatures(world(drawing, first, alongX(f1)), world(drawing, second, alongX(f2)));
  near(result.value, 30, 1e-9);
  assert.ok(result.distance >= 0);
  assert.equal(measureTitle(result), 'Kąt między prostymi');
  // Punkt i oś walca: narożnik od osi walca stojącego obok – odległość w poziomie.
  const cylinder = { ...newSolid('cylinder', { x: 400, y: 300 }), dims: { d: 80, h: 120 } };
  drawing.strokes.push(cylinder);
  const corner = corners(f1).find((item) => item.p[0] > 0 && item.p[2] < 0 && item.p[1] > 0);
  result = measureFeatures(world(drawing, first, corner), world(drawing, cylinder, solidFeatures(cylinder).axis));
  assert.equal(result.type, 'point-line');
  const p = world(drawing, first, corner).p;
  near(result.value, Math.hypot(p[0] - 400, p[1] - 800));
});

test('pomiary 1.53: odnośnik do cechy – po zmianie wymiarów i położenia ta sama cecha; zapis w bryle (format 24), kopie, granice', () => {
  const first = box(400, 500, { id: 'measure1' });
  const second = { ...newSolid('cylinder', { x: 0, y: 0 }), dims: { d: 80, h: 120 }, id: 'measure2', on: { id: 'measure1', x: 0, y: 0, z: 0, yaw: 0 } };
  const f1 = solidFeatures(first);
  const corner = corners(f1).find((item) => item.p[0] > 0 && item.p[1] > 0 && item.p[2] > 0);
  const refA = featureRef(first, corner);
  const refB = featureRef(second, solidFeatures(second).points.find((item) => item.d[1] > 0.99));
  // Dłuższy prostopadłościan: ten sam narożnik (+x, +y, +z) – w nowym miejscu.
  const longer = { ...first, dims: { a: 300, b: 100, c: 60 } };
  nearAll(resolveRef(longer, refA).p, [150, 30, 50]);
  // Ściana i krawędź – po normalnej i kierunku.
  const faceRef = featureRef(first, f1.faces.find((face) => face.n[0] > 0.99));
  nearAll(resolveRef(longer, faceRef).p, [150, 0, 0]);
  assert.equal(resolveRef(newSolid('sphere', { x: 0, y: 0 }), faceRef), null, 'kula – bez ściany');
  // Zapis: pomiar w bryle pierwszej cechy; walec na prostopadłościanie – wierzch walca 60 + 120 nad kartką.
  const owner = withMeasure(first, refA, refB);
  const drawing = { ...emptyDrawing(), strokes: [owner, second] };
  resolveStacks(drawing.strokes);
  let list = drawingMeasures(drawing.strokes);
  assert.equal(list.length, 1);
  const a = worldFeature(sceneSolids(drawing)[0], list[0].a.feature);
  const b = worldFeature(sceneSolids(drawing)[1], list[0].b.feature);
  // Narożnik +z bryły leży od strony −Y arkusza (Y w głąb): walec jest od niego w X o −100, w Y o +50, w Z o +120.
  nearAll(measureFeatures(a, b).delta, [-100, 50, 120]);
  const clean = cleanDrawing(JSON.parse(JSON.stringify(drawing)));
  assert.ok(clean.version >= 24, 'format 24 albo nowszy');
  assert.deepEqual(clean.strokes[0].measures, owner.measures);
  // Pomiar do bryły, której nie ma – usunięty przy wczytaniu.
  const lonely = cleanDrawing(JSON.parse(JSON.stringify({ ...drawing, strokes: [owner] })));
  assert.equal(lonely.strokes[0].measures, undefined);
  // Zły zapis – pominięty; granica liczby pomiarów.
  assert.deepEqual(cleanMeasures([{ a: refA, b: { ...refB, role: 'zły' } }, { a: refA }]), {});
  assert.deepEqual(cleanMeasures([{ a: { ...refA, d: [0, 0, 0] }, b: refB }]).measures.length, 1, 'narożnik – bez kierunku');
  let full = first;
  for (let index = 0; index < MEASURE_LIMITS.count; index += 1) full = withMeasure(full, refA, refB);
  assert.equal(withMeasure(full, refA, refB), null);
  assert.equal(withoutMeasure(owner, 0).measures, undefined);
  // Kopie: obie bryły razem – pomiar przy kopiach; sama bryła z pomiarem – bez pomiaru.
  const copies = relinkCopies([owner, second], drawing.strokes);
  assert.equal(copies[0].measures[0].a.id, copies[0].id);
  assert.equal(copies[0].measures[0].b.id, copies[1].id);
  assert.equal(relinkCopies([owner], drawing.strokes)[0].measures, undefined);
  assert.equal(withoutLinks(owner).measures, undefined);
  // Usunięta druga bryła w trakcie pracy – pomiar pominięty w liście sceny.
  list = drawingMeasures([owner]);
  assert.equal(list.length, 0);
});
