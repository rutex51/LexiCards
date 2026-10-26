// Rysunek 1.52: położenie brył – wysokość podstawy, obrót wokół Z, bryła na bryle (odnośnik względem bryły pod spodem),
// wspólny obrazek stosu w 2D zgodny ze sceną, zmiana samego obrazka bryły postawionej, zapis, kopie i skala.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { relinkCopies, withoutLinks } from '../../js/core/attach.js';
import { cleanDrawing, emptyDrawing } from '../../js/core/drawing.js';
import { paintOrder, sceneCamera, sceneQuat, sceneSolids, toView } from '../../js/core/scene.js';
import {
  cleanPose, facesUp, liftOff, normalYaw, placeOn, placement, resolveStacks, solidsById, stackChanges, stackFollowers, stackOf, stackPaintOrder, stackedPicture, withPose
} from '../../js/core/solid-pose.js';
import { faceAt, newSolid, quatMatrix, scaleSolid, viewQuat } from '../../js/core/solids.js';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const nearAll = (actual, expected, tolerance = 1e-6) => actual.forEach((value, index) => near(value, expected[index], tolerance));
const sameRotation = (a, b) => near(Math.abs(a.reduce((sum, value, index) => sum + value * b[index], 0)), 1, 1e-5);
let counter = 0;
const newId = () => `id${String((counter += 1)).padStart(6, '0')}`;

/** Prostopadłościan 200 × 100 × 60 (a – X, b – Y, c – Z) w punkcie strony. */
const box = (x, y, extra = {}) => ({ ...newSolid('box', { x, y }), dims: { a: 200, b: 100, c: 60 }, ...extra });

test('położenie 1.52: zapis – wysokość, obrót (−180°, 180°], odnośnik; bez położenia jak dotąd; format 23', () => {
  assert.deepEqual(cleanPose({}), {});
  assert.deepEqual(cleanPose({ z: 0, yaw: 360 }), {});
  assert.deepEqual(cleanPose({ z: 12.345, yaw: -190 }), { z: 12.35, yaw: 170 });
  assert.equal(normalYaw(-180), 180);
  assert.equal(normalYaw(540), 180);
  assert.equal(normalYaw(-0), 0);
  assert.deepEqual(cleanPose({ z: -5, on: { id: 'abc12345', x: 1, y: 2, z: 0, yaw: 45 } }), { on: { id: 'abc12345', x: 1, y: 2, z: 0, yaw: 45 } });
  assert.deepEqual(cleanPose({ on: { id: 'ZŁY', x: 1, y: 2, z: 0, yaw: 0 } }), {});
  assert.deepEqual(cleanPose({ on: { id: 'abc12345', x: 1, y: Number.NaN, z: 0, yaw: 0 } }), {});
  // Zapis rysunku: bryła z położeniem i bryła postawiona na niej (obrazek wyliczony ze stosu).
  const drawing = emptyDrawing();
  drawing.strokes = [
    box(400, 500, { id: 'base0001', z: 30, yaw: 90 }),
    { ...newSolid('cylinder', { x: 0, y: 0 }), id: 'top00001', on: { id: 'base0001', x: 20, y: 0, z: 0, yaw: 0 } }
  ];
  const clean = cleanDrawing(JSON.parse(JSON.stringify(drawing)));
  assert.ok(clean.version >= 23, 'format 23 albo nowszy');
  const [base, top] = clean.strokes;
  assert.equal(base.z, 30);
  assert.equal(base.yaw, 90);
  assert.equal(base.id, 'base0001');
  assert.deepEqual(top.on, { id: 'base0001', x: 20, y: 0, z: 0, yaw: 0 });
  // Obrazek walca – w obrazku prostopadłościanu (nie w (0, 0)); wysokość i obrót – z prostopadłościanu.
  assert.ok(Math.hypot(top.x - 400, top.y - 500) < 200);
  assert.equal(top.z, 90);
  assert.equal(top.yaw, 90);
  // Bryła bez położenia – bez nowych pól.
  const plain = cleanDrawing(JSON.parse(JSON.stringify({ ...drawing, strokes: [newSolid('box', { x: 100, y: 100 })] }))).strokes[0];
  assert.equal('z' in plain || 'yaw' in plain || 'on' in plain, false);
  // Odnośnik do bryły, której nie ma – usunięty, bryła zostaje w miejscu obrazka.
  const lonely = cleanDrawing(JSON.parse(JSON.stringify({ ...drawing, strokes: [{ ...drawing.strokes[1], x: 300, y: 200, z: 90 }] }))).strokes[0];
  assert.equal(lonely.on, undefined);
  assert.deepEqual([lonely.x, lonely.y, lonely.z], [300, 200, 90]);
});

test('położenie 1.52: scena – wysokość podstawy, obrót wokół Z (zasięg wzdłuż osi świata), bryła na bryle względem tamtej', () => {
  const drawing = emptyDrawing();
  const base = box(400, 500, { id: 'base0001', z: 30, yaw: 90 });
  const top = { ...box(0, 0, { id: 'top00001' }), dims: { a: 40, b: 20, c: 10 }, on: { id: 'base0001', x: 50, y: 0, z: 0, yaw: 0 } };
  drawing.strokes = [base, top];
  resolveStacks(drawing.strokes);
  const [b, t] = sceneSolids(drawing);
  // Podstawa na wysokości 30: początek układu (środek prostopadłościanu) na 30 + 60 / 2.
  nearAll(b.origin, [400, drawing.height - 500, 60]);
  // Obrót o 90°: długość a (200) wzdłuż Y, szerokość b (100) wzdłuż X.
  nearAll(b.half, [50, 100, 30]);
  assert.equal(b.base, 30);
  assert.equal(b.yaw, 90);
  assert.equal(b.on, null);
  // Postawiony 50 wzdłuż X prostopadłościanu – po obrocie o 90° to +50 wzdłuż Y świata; podstawa na wierzchu (30 + 60).
  nearAll(t.origin, [400, drawing.height - 500 + 50, 90 + 5]);
  assert.equal(t.base, 90);
  assert.equal(t.yaw, 90);
  assert.equal(t.on, drawing.strokes[0]);
  // Położenie w punkcie strony.
  const place = placement(solidsById(drawing.strokes), drawing.strokes[1]);
  nearAll([place.x, place.y, place.z, place.yaw], [400, 450, 90, 90]);
  assert.equal(place.root, drawing.strokes[0]);
  // Stos – obie bryły; ściana w górę – wierzch (y bryły) przy każdym obrocie wokół Z, bok – nie.
  assert.equal(stackOf(drawing.strokes, drawing.strokes[1]).length, 2);
  assert.ok(facesUp([0, 1, 0], 37));
  assert.ok(!facesUp([1, 0, 0], 0));
  assert.ok(!facesUp([0, -1, 0], 0));
});

test('położenie 1.52: wspólny obrazek stosu – w widoku bryły na dole, zgodny ze sceną (przesunięcie i obrót)', () => {
  for (const [az, el, yaw, relative] of [[45, 35.264, 0, 0], [45, 35.264, 30, 20], [0, 0, -60, 45], [120, 60, 10, -90]]) {
    const camera = sceneCamera(az, el);
    const base = box(500, 400, { id: 'base0001', yaw, q: sceneQuat(camera, yaw) });
    const top = { ...newSolid('cylinder', { x: 0, y: 0 }), id: 'top00001', on: { id: 'base0001', x: 40, y: -20, z: 0, yaw: relative } };
    const strokes = [base, top];
    resolveStacks(strokes);
    const drawing = { ...emptyDrawing(), strokes };
    const [b, t] = sceneSolids(drawing);
    // Obrazek walca: widok jak walca w scenie z tą kamerą.
    sameRotation(strokes[1].q, sceneQuat(camera, yaw + relative));
    // Przesunięcie obrazka walca względem obrazka prostopadłościanu = przesunięcie w scenie (x w prawo, y strony w dół).
    const [dx, dy] = [0, 1].map((axis) => toView(camera, t.origin)[axis] - toView(camera, b.origin)[axis]);
    near(strokes[1].x - strokes[0].x, dx, 0.02);
    near(strokes[1].y - strokes[0].y, -dy, 0.02);
    // stackedPicture daje to samo.
    const byId = solidsById(strokes);
    const picture = stackedPicture(strokes[0], placement(byId, strokes[0]), strokes[1], placement(byId, strokes[1]));
    near(picture.x, strokes[1].x, 0.01);
  }
});

test('położenie 1.52: stos po zmianie – za bryłą na dole, zmiana samego obrazka postawionej przechodzi na cały obrazek', () => {
  const base = box(500, 400, { id: 'base0001', q: viewQuat('iso') });
  const top = { ...newSolid('cylinder', { x: 0, y: 0 }), id: 'top00001', on: { id: 'base0001', x: 0, y: 0, z: 0, yaw: 0 } };
  const strokes = [base, top];
  resolveStacks(strokes);
  const start = strokes.map((stroke) => ({ ...stroke }));
  // Przesunięty prostopadłościan – walec idzie za nim.
  let before = [...strokes];
  strokes[0] = { ...strokes[0], x: 600, y: 450 };
  resolveStacks(strokes, stackChanges(before, strokes));
  near(strokes[1].x - start[1].x, 100, 0.01);
  near(strokes[1].y - start[1].y, 50, 0.01);
  // Przesunięty sam obrazek walca – przesuwa się cały obrazek (prostopadłościan o tyle samo).
  before = [...strokes];
  strokes[1] = { ...strokes[1], x: strokes[1].x + 30, y: strokes[1].y - 10 };
  resolveStacks(strokes, stackChanges(before, strokes));
  assert.deepEqual([strokes[0].x, strokes[0].y], [630, 440]);
  // Widok samego obrazka walca („Z góry”) – widok całego obrazka; walec zostaje w miejscu.
  before = [...strokes];
  const [x, y] = [strokes[1].x, strokes[1].y];
  strokes[1] = { ...strokes[1], q: viewQuat('top') };
  resolveStacks(strokes, stackChanges(before, strokes));
  sameRotation(strokes[0].q, viewQuat('top'));
  near(strokes[1].x, x, 0.02);
  near(strokes[1].y, y, 0.02);
  // Wyższy prostopadłościan – walec dalej na wierzchu.
  before = [...strokes];
  strokes[0] = { ...strokes[0], dims: { a: 200, b: 100, c: 100 } };
  resolveStacks(strokes, stackChanges(before, strokes));
  assert.equal(strokes[1].z, 100);
  // Podgląd w trakcie przesuwania – walec idzie za prostopadłościanem, rysunek bez zmian.
  const followers = stackFollowers(strokes, new Map([[strokes[0], { ...strokes[0], x: strokes[0].x + 10 }]]));
  assert.equal(followers.size, 1);
  near(followers.get(strokes[1]).x, strokes[1].x + 10, 0.01);
  // Prostopadłościan usunięty – walec stoi sam w miejscu obrazka, na swojej wysokości.
  const alone = [strokes[1]];
  resolveStacks(alone);
  assert.equal(alone[0].on, undefined);
  assert.deepEqual([alone[0].x, alone[0].y, alone[0].z], [strokes[1].x, strokes[1].y, 100]);
  // Pętla (każda na drugiej) – rozerwana.
  const loop = [{ ...box(100, 100), id: 'loopaaaa', on: { id: 'loopbbbb', x: 0, y: 0, z: 0, yaw: 0 } }, { ...box(300, 100), id: 'loopbbbb', on: { id: 'loopaaaa', x: 0, y: 0, z: 0, yaw: 0 } }];
  resolveStacks(loop);
  assert.equal(loop.filter((stroke) => stroke.on).length, 1);
});

test('położenie 1.52: wpisane położenie, „Postaw na ścianie”, „Na arkusz”; kopie i skala ze stosem', () => {
  const base = box(500, 400, { yaw: 90 });
  const free = newSolid('cylinder', { x: 900, y: 300 });
  let strokes = [base, free];
  // Bryła stojąca sama: X, Y to też miejsce obrazka.
  const moved = withPose(strokes, free, { x: 950, y: 250, z: 40, yaw: 400 });
  assert.deepEqual([moved.x, moved.y, moved.z, moved.yaw], [950, 250, 40, 40]);
  assert.equal(withPose(strokes, free, { x: 950, y: 250, z: -5, yaw: 0 }).z, undefined);
  // Postaw na wierzchu prostopadłościanu (wysokość 60) w punkcie strony (520, 380).
  const placed = placeOn(strokes, free, base, { x: 520, y: 380 }, 60, newId);
  assert.ok(placed.base.id && placed.solid.id && placed.base.id !== placed.solid.id);
  strokes = [placed.base, placed.solid];
  resolveStacks(strokes);
  let place = placement(solidsById(strokes), strokes[1]);
  nearAll([place.x, place.y, place.z, place.yaw], [520, 380, 60, 0]);
  assert.equal(strokes[1].on.z, 0);
  // Prostopadłościan obrócony o 90°: punkt +20 w X świata i +20 w Y świata (y strony w górę) – w jego układzie (20, −20).
  nearAll([strokes[1].on.x, strokes[1].on.y], [20, -20]);
  assert.equal(strokes[1].on.yaw, -90);
  assert.equal(placeOn(strokes, strokes[0], strokes[1], { x: 0, y: 0 }, 0, newId).error.length > 0, true);
  assert.equal(placeOn(strokes, strokes[1], strokes[1], { x: 0, y: 0 }, 0, newId).error.length > 0, true);
  // Wpisane położenie bryły postawionej: nowy odnośnik, wyżej o 10 nad wierzchem.
  strokes[1] = withPose(strokes, strokes[1], { x: 500, y: 400, z: 70, yaw: 45 });
  resolveStacks(strokes);
  place = placement(solidsById(strokes), strokes[1]);
  nearAll([place.x, place.y, place.z, place.yaw], [500, 400, 70, 45]);
  assert.equal(strokes[1].on.z, 10);
  // Obracany prostopadłościan – walec obraca się razem z nim wokół jego osi.
  strokes[0] = withPose(strokes, strokes[0], { x: 500, y: 400, z: 0, yaw: 180 });
  resolveStacks(strokes);
  assert.equal(placement(solidsById(strokes), strokes[1]).yaw, 135);
  // Na arkusz: bez odnośnika, z = 0, X i Y bez zmian.
  const down = liftOff(strokes, strokes[1]);
  assert.equal(down.on, undefined);
  assert.equal(down.z, undefined);
  nearAll([down.x, down.y, down.yaw], [500, 400, 135]);
  // Kopie: stos skopiowany razem – odnośnik do kopii; sama bryła postawiona – stoi sama.
  const both = relinkCopies(strokes, strokes);
  assert.equal(both[1].on.id, both[0].id);
  assert.notEqual(both[0].id, strokes[0].id);
  const single = relinkCopies([strokes[1]], strokes);
  assert.equal(single[0].on, undefined);
  assert.equal(withoutLinks(strokes[1]).on, undefined);
  // Skala: wysokość i przesunięcie względem bryły pod spodem rosną razem z bryłą.
  const lifted = { ...strokes[1], z: 70 };
  const bigger = scaleSolid(lifted, 0, 0, 2);
  assert.equal(bigger.z, 140);
  assert.equal(bigger.on.z, lifted.on.z * 2);
  // Wspólny widok stosu: obrazek walca w widoku prostopadłościanu (macierze zgodne co do obrotu wokół osi bryły).
  const m = quatMatrix(strokes[1].q);
  assert.equal(m.length, 9);
});

test('położenie 1.52: kolejność rysowania – stos razem w 2D (od najdalszej w widoku obrazka), w scenie bryła na bryle po niej; wierzch ściany', () => {
  const line = { tool: 'pen', color: '#1d1d1f', points: [0, 0, 2, 10, 10, 2] };
  const top = { ...newSolid('cylinder', { x: 0, y: 0 }), id: 'top00001', on: { id: 'base0001', x: 0, y: 0, z: 0, yaw: 0 } };
  const other = newSolid('sphere', { x: 1200, y: 300 });
  const base = box(500, 400, { id: 'base0001', q: viewQuat('iso') });
  // Walec przed prostopadłościanem w rysunku – i tak rysowany po nim (na wierzchu, bliżej w izometrii).
  const strokes = [top, line, other, base];
  resolveStacks(strokes);
  const order = stackPaintOrder(strokes);
  assert.deepEqual(order.map((stroke) => strokes.indexOf(stroke)), [3, 0, 1, 2], 'stos w miejscu pierwszej bryły, prostopadłościan pod walcem');
  assert.equal(stackPaintOrder([line, other]).length, 2);
  // Widok od spodu obrazka (q z dołu) – walec dalej, rysowany pierwszy.
  const below = strokes.map((stroke) => (stroke === strokes[3] ? { ...stroke, q: viewQuat('bottom') } : stroke));
  resolveStacks(below);
  assert.deepEqual(stackPaintOrder(below).map((stroke) => below.indexOf(stroke)).slice(0, 2), [0, 3]);
  // Scena: bryła na bryle po niej, nawet gdy jej środek jest dalej od patrzącego (np. mała bryła przy tylnym brzegu dużej).
  const drawing = { ...emptyDrawing(), strokes: [box(500, 400, { id: 'base0001', dims: { a: 600, b: 600, c: 20 } }),
    { ...newSolid('box', { x: 0, y: 0 }), dims: { a: 20, b: 20, c: 20 }, id: 'top00001', on: { id: 'base0001', x: -280, y: 280, z: 0, yaw: 0 } }] };
  resolveStacks(drawing.strokes);
  const camera = sceneCamera(45, 35.264);
  const solids = sceneSolids(drawing);
  assert.ok(toView(camera, solids[1].center)[2] < toView(camera, solids[0].center)[2], 'środek małej bryły dalej od patrzącego');
  assert.deepEqual(paintOrder(camera, solids).map((item) => item.index), [0, 1], 'mała bryła i tak po dużej');
  // Ściana pod punktem – z punktem ściany w układzie bryły (wysokość wierzchu).
  const face = faceAt({ ...box(0, 0), q: viewQuat('iso') }, { x: 0, y: -5 });
  assert.ok(face && facesUp(face.normal));
  near(face.vertex[1], 30);
});
