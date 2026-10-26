// Rysunek 1.54: płaszczyzny szkicu – bryła ze szkicu na XY na wysokości, na pionowej XZ (przód) i YZ (bok), oś bryły
// obrotowej pod kątem; rzuty całej sceny – wspólna siatka, krawędzie zasłonięte przez inne bryły, układ rzutów, osie.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanDrawing, emptyDrawing } from '../../js/core/drawing.js';
import { solidFeatures } from '../../js/core/measure3d.js';
import { sceneSolids } from '../../js/core/scene.js';
import { sceneMesh, sceneProjections, sphereMesh } from '../../js/core/scene-projections.js';
import { onSketchPlane, sketchPlaneLevel } from '../../js/core/solid-pose.js';
import { cleanSolid, newModel, newSolid, sketchToBody, solidGeometry, solidShape, viewQuat, viewsToShapes } from '../../js/core/solids.js';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const nearAll = (actual, expected, tolerance = 1e-6) => actual.forEach((value, index) => near(value, expected[index], tolerance));
/** Prostokąt 120 × 80 (x w prawo, y w górę) – profil wyciągnięcia. */
const rectangle = { islands: [{ outer: [[-60, -40], [60, -40], [60, 40], [-60, 40]], holes: [] }] };
const extrude = (plane, x = 500, y = 400) => ({ ...newModel('extrude', rectangle, { x, y, plane }), dims: { h: 30 } });
/** Zasięg siatki w układzie bryły. */
function range(solid) {
  const mesh = solidShape(solid);
  return [0, 1, 2].map((axis) => [Math.min(...mesh.V.map((v) => v[axis])), Math.max(...mesh.V.map((v) => v[axis]))]);
}
/** Zasięg bryły w świecie sceny (z położenia sceny). */
function worldRange(solid) {
  const drawing = { ...emptyDrawing(), strokes: [solid] };
  const [item] = sceneSolids(drawing);
  return [0, 1, 2].map((axis) => [item.center[axis] - item.half[axis], item.center[axis] + item.half[axis]]);
}

test('płaszczyzny 1.54: zapis – plane xz i yz z kątem osi, XY bez kąta; brak płaszczyzny – jak bryła z 1.48; format 25', () => {
  const vertical = { ...extrude('xz'), color: '#1d1d1f', planeAngle: 450 };
  const clean = cleanSolid(vertical, 1600, 1100);
  assert.equal(clean.plane, 'xz');
  assert.equal(clean.planeAngle, 90, 'kąt w (−180°, 180°]');
  assert.equal(cleanSolid({ ...extrude('yz'), color: '#1d1d1f' }, 1600, 1100).plane, 'yz');
  assert.equal(cleanSolid({ ...extrude('xy'), color: '#1d1d1f', planeAngle: 30 }, 1600, 1100).planeAngle, undefined, 'XY – bez kąta');
  // Bryła ze szkicu bez płaszczyzny (1.48) – na XY, położenie obrazka przeliczone jak dotąd.
  const legacy = { ...extrude('xy'), color: '#1d1d1f', q: viewQuat('front') };
  delete legacy.plane;
  const old = cleanSolid(legacy, 1600, 1100);
  assert.equal(old.plane, 'xy');
  assert.notDeepEqual(old.q, viewQuat('front'));
  assert.equal(cleanDrawing({ ...emptyDrawing(), strokes: [vertical] }).version, 25);
  // Obrazek na start – jak szkic: XZ z przodu, YZ z prawego boku.
  assert.deepEqual(extrude('xz').q, viewQuat('front'));
  assert.deepEqual(extrude('yz').q, viewQuat('right'));
});

test('płaszczyzny 1.54: siatka i położenie w scenie – XY na wysokości, XZ (przód, wyciągnięcie do −Y), YZ (bok, wyciągnięcie do +X)', () => {
  const H = emptyDrawing().height;
  // XY: profil poziomo, wyciągnięcie w górę (y bryły); na wysokości 50.
  assert.deepEqual(range(extrude('xy')).map(([a, b]) => b - a), [120, 30, 80]);
  let solid = onSketchPlane(extrude('xy'), 'xy', 50, H);
  assert.equal(solid.z, 50);
  nearAll(worldRange(solid)[2], [50, 80]);
  // XZ: profil pionowo (x – X, y – Z), grubość wzdłuż z bryły; płaszczyzna szkicu Y = 600, wyciągnięcie do przodu.
  assert.deepEqual(range(extrude('xz')).map(([a, b]) => b - a), [120, 80, 30]);
  solid = onSketchPlane(extrude('xz'), 'xz', 600, H);
  let world = worldRange(solid);
  nearAll(world[0], [440, 560]);
  nearAll(world[1], [570, 600]);
  nearAll(world[2], [0, 80]);
  // Domyślna płaszczyzna – obrazek w miejscu szkicu.
  const sketch = extrude('xz');
  assert.equal(onSketchPlane(sketch, 'xz', sketchPlaneLevel(sketch, 'xz', H), H).y, sketch.y);
  // YZ: profil pionowo (x – Y, y – Z), grubość wzdłuż x bryły; płaszczyzna X = 300, wyciągnięcie w prawo.
  assert.deepEqual(range(extrude('yz')).map(([a, b]) => b - a), [30, 80, 120]);
  solid = onSketchPlane(extrude('yz'), 'yz', 300, H);
  world = worldRange(solid);
  nearAll(world[0], [300, 330]);
  nearAll(world[1], [H - 400 - 60, H - 400 + 60]);
  nearAll(world[2], [0, 80]);
  const side = extrude('yz');
  assert.equal(onSketchPlane(side, 'yz', sketchPlaneLevel(side, 'yz', H), H).x, side.x);
  // Mapowanie to obrót (ściany na zewnątrz): normalna wierzchu profilu XZ (y profilu) – w górę.
  nearAll(sketchToBody(extrude('xz'))([0, 1, 0]), [0, 1, 0]);
  nearAll(sketchToBody(extrude('yz'))([1, 0, 0]), [0, 0, -1], 1e-12);
});

test('płaszczyzny 1.54: bryła obrotowa na płaszczyźnie XZ z osią pionową – oś wzdłuż Z (pomiar, rzuty); wymiar wyciągnięcia na XZ', () => {
  // Profil przy osi x (wzdłuż osi 100, promień 40); oś pionowo na kartce – kąt 90°.
  const profile = { islands: [{ outer: [[-50, 0], [50, 0], [50, 40], [-50, 40]], holes: [] }] };
  const vase = { ...newModel('revolve', profile, { x: 500, y: 400, plane: 'xz', planeAngle: 90 }), dims: { angle: 360 } };
  assert.deepEqual(range(vase).map(([a, b]) => Math.round(b - a)), [80, 100, 80], 'oś wzdłuż y bryły (Z)');
  const { axis } = solidFeatures(vase);
  nearAll(axis.d.map(Math.abs), [0, 1, 0], 1e-9);
  // W rzucie z góry oś na patrzącego – krzyżyk; z przodu – pionowa linia osiowa.
  const drawing = { ...emptyDrawing(), strokes: [vase] };
  const { views } = sceneProjections(drawing);
  const front = views.find((view) => view.id === 'front');
  assert.ok(front.axes.some(([a, b]) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 100), 'z przodu – oś pionowa');
  assert.equal(views.find((view) => view.id === 'top').axes.length, 2, 'z góry – krzyżyk');
  // Wymiar długości wyciągnięcia na XZ i YZ – krawędź wzdłuż wyciągnięcia (z albo x bryły), jak na XY.
  for (const plane of ['xy', 'xz', 'yz']) {
    const plate = { ...extrude(plane), showDims: true, q: viewQuat('iso') };
    assert.deepEqual(solidGeometry(plate).dims.map((dim) => dim.value), [30], plane);
  }
});

test('rzuty sceny 1.54: wspólna siatka, bryła z przodu zasłania krawędź bryły z tyłu (przerywana), góra pod przodem, bok obok, kula – okrąg, osie', () => {
  const drawing = emptyDrawing();
  // Niska szeroka z tyłu (y strony 300 – dalej od przodu), wysoka wąska z przodu (y strony 600).
  const back = { ...newSolid('box', { x: 400, y: 300 }), dims: { a: 200, b: 100, c: 60 } };
  const front = { ...newSolid('box', { x: 400, y: 600 }), dims: { a: 100, b: 60, c: 120 } };
  const ball = { ...newSolid('sphere', { x: 900, y: 500 }), dims: { d: 120 } };
  const cylinder = { ...newSolid('cylinder', { x: 1200, y: 500 }), dims: { d: 80, h: 100 } };
  drawing.strokes = [back, front, ball, cylinder];
  const mesh = sceneMesh(sceneSolids(drawing));
  assert.equal(mesh.F.length, 6 + 6 + sphereMesh(60).F.length + solidShape(cylinder).F.length);
  const { views, bounds } = sceneProjections(drawing);
  assert.deepEqual(views.map((view) => view.id), ['front', 'top', 'left']);
  const [viewFront, viewTop, viewLeft] = views;
  // Z przodu: górna krawędź bryły z tyłu (Z = 60) za bryłą z przodu (X 350–450) – przerywana.
  assert.ok(viewFront.hidden.some((line) => line.points.every((point) => Math.abs(point.y + 60) < 0.5) && Math.min(...line.points.map((p) => p.x)) >= 349 && Math.max(...line.points.map((p) => p.x)) <= 451),
    JSON.stringify(viewFront.hidden));
  // Z góry obie bryły widać w całości (bez przerywanych prostopadłościanów).
  assert.equal(viewTop.hidden.length, 0);
  // Góra pod przodem, lewy bok na prawo od przodu.
  assert.ok(viewTop.bounds.minY > viewFront.bounds.maxY);
  assert.ok(viewLeft.bounds.minX > viewFront.bounds.maxX);
  assert.ok(bounds.minX <= viewFront.bounds.minX && bounds.maxX >= viewLeft.bounds.maxX);
  // Kształty: kula z przodu i z góry – okręgi, walec z góry – okrąg; osie walca i krzyżyki kuli – linią osiową; przerywane.
  const shapes = viewsToShapes(views, { x: 0, y: 0 }, { color: '#1d1d1f', size: 2.5 });
  assert.ok(shapes.filter((shape) => shape.shape === 'ellipse').length >= 3);
  assert.ok(shapes.some((shape) => shape.dash === 'center'));
  assert.ok(shapes.some((shape) => shape.dash === 'dashed'));
  // Obrys zebrany z kawałków, który wraca do początku (niezamknięta łamana) – wielokąt, nie odcinek długości 0.
  const loop = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -50 }, { x: 0, y: -50 }, { x: 0, y: 0 }];
  const [outline] = viewsToShapes([{ visible: [{ points: loop, closed: false }], hidden: [], axes: [] }], { x: 10, y: 10 }, { color: '#1d1d1f', size: 2.5 });
  assert.equal(outline.shape, 'polygon');
  assert.equal(outline.nodes.length, 8, 'cztery wierzchołki');
  // Bez brył – brak rzutów.
  assert.equal(sceneProjections(emptyDrawing()), null);
});
