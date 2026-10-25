// Rysunek 1.48.1: układ osi przy zaznaczonej bryle zamiast kostki widoków – kierunki osi X, Y, Z w położeniu bryły
// (gotowe widoki), kolory (czerwona, zielona, niebieska), kolejność rysowania od najdalszej; kostki już nie ma.
// Od 1.48.2 osie jak w rysunku technicznym: Z do góry, X i Y na dole (w izometrii w dół); szkic na płaszczyźnie XY.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromSketch, modelMesh, newModel, quatFromAngles, viewQuat } from '../../js/core/solids.js';
import * as solidsUi from '../../js/ui/drawing-solids.js';

const { AXES_LENGTH, solidAxes } = solidsUi;
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const center = { x: 100, y: 100 };
const byLabel = (q) => Object.fromEntries(solidAxes(q, center).map((axis) => [axis.label, axis]));

test('bryły 1.48.1–1.48.2: układ osi – Z do góry, kierunki w widokach, kolory, kolejność od najdalszej; bez kostki widoków', () => {
  // Z przodu (od 1.48.2): Y w prawo, Z w górę (y ekranu w dół), X na patrzącego – sam punkt.
  const front = byLabel(viewQuat('front'));
  near(front.Y.tip.x, 100 + AXES_LENGTH);
  near(front.Y.tip.y, 100);
  near(front.Z.tip.x, 100);
  near(front.Z.tip.y, 100 - AXES_LENGTH);
  near(front.X.tip.x, 100);
  near(front.X.tip.y, 100);
  near(front.X.along, 0);
  near(front.X.depth, 1);
  // Z góry (jak kartka ze szkicem na XY): Y w prawo, X w dół ekranu, Z na patrzącego.
  const top = byLabel(viewQuat('top'));
  near(top.Y.tip.x, 100 + AXES_LENGTH);
  near(top.X.tip.y, 100 + AXES_LENGTH);
  near(top.X.tip.x, 100);
  near(top.Z.depth, 1);
  // Izometria: Z pionowo w górę, X w lewo i w dół, Y w prawo i w dół (X i Y „na dole”); wszystkie do patrzącego.
  const iso = byLabel(viewQuat('iso'));
  near(iso.Z.tip.x, 100);
  assert.ok(iso.Z.tip.y < 100);
  assert.ok(iso.X.tip.x < 100 && iso.X.tip.y > 100);
  assert.ok(iso.Y.tip.x > 100 && iso.Y.tip.y > 100);
  near(iso.X.tip.y, iso.Y.tip.y);
  assert.ok(Object.values(iso).every((axis) => axis.depth > 0));
  // Z tyłu X od patrzącego – rysowana pierwsza (bledsza); kolejność zawsze od najdalszej.
  const back = solidAxes(viewQuat('back'), center);
  assert.equal(back[0].label, 'X');
  near(back[0].depth, -1);
  const any = solidAxes(quatFromAngles(30, -20, 10), center);
  assert.ok(any.every((axis, index) => index === 0 || any[index - 1].depth <= axis.depth));
  // Kolory: X czerwona, Y zielona, Z niebieska; długość osi na ekranie – AXES_LENGTH przy osi w płaszczyźnie ekranu.
  assert.deepEqual(Object.fromEntries(Object.entries(front).map(([label, axis]) => [label, axis.color])), { X: '#d92d20', Y: '#1e8e3e', Z: '#1a6fdb' });
  near(Math.hypot(front.Y.tip.x - 100, front.Y.tip.y - 100), AXES_LENGTH);
  // Kostki widoków (1.47–1.48) już nie ma.
  assert.equal(solidsUi.paintViewCube, undefined);
  assert.equal(solidsUi.cubeFaceAt, undefined);
  assert.equal(solidsUi.CUBE_HALF, undefined);
});

test('bryły 1.48.2: szkic na płaszczyźnie XY – profil leży w X i Y, wyciągnięcie wzdłuż Z (do góry)', () => {
  // Układ szkicu (x w prawo, y w górę kartki, z – wyciągnięcie) → bryła: x bez zmian (Y), y szkicu → −z bryły (X w dół
  // kartki z góry), z → y bryły (Z).
  assert.deepEqual(fromSketch([1, 2, 3]), [1, 3, -2]);
  const profile = { islands: [{ outer: [[-50, -20], [50, -20], [50, 20], [-50, 20]], holes: [] }] };
  const slab = newModel('extrude', profile);
  const mesh = modelMesh({ ...slab, dims: { h: 10 } });
  const span = (index) => Math.max(...mesh.V.map((vertex) => vertex[index])) - Math.min(...mesh.V.map((vertex) => vertex[index]));
  assert.deepEqual([span(0), span(1), span(2)].map((value) => Math.round(value)), [100, 10, 40], 'Y = 100, Z = 10 (wyciągnięcie), X = 40');
});
