// Rysunek 1.48.1: układ osi przy zaznaczonej bryle zamiast kostki widoków – kierunki osi X, Y, Z w położeniu bryły
// (gotowe widoki), kolory (czerwona, zielona, niebieska), kolejność rysowania od najdalszej; kostki już nie ma.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { quatFromAngles, viewQuat } from '../../js/core/solids.js';
import * as solidsUi from '../../js/ui/drawing-solids.js';

const { AXES_LENGTH, solidAxes } = solidsUi;
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const center = { x: 100, y: 100 };
const byLabel = (q) => Object.fromEntries(solidAxes(q, center).map((axis) => [axis.label, axis]));

test('bryły 1.48.1: układ osi – kierunki w widokach, kolory, kolejność od najdalszej; bez kostki widoków', () => {
  // Z przodu: X w prawo, Y w górę (y ekranu w dół), Z na patrzącego – sam punkt.
  const front = byLabel(viewQuat('front'));
  near(front.X.tip.x, 100 + AXES_LENGTH);
  near(front.X.tip.y, 100);
  near(front.Y.tip.x, 100);
  near(front.Y.tip.y, 100 - AXES_LENGTH);
  near(front.Z.tip.x, 100);
  near(front.Z.tip.y, 100);
  near(front.Z.along, 0);
  near(front.Z.depth, 1);
  // Z góry: Z w dół ekranu, Y na patrzącego.
  const top = byLabel(viewQuat('top'));
  near(top.Z.tip.y, 100 + AXES_LENGTH);
  near(top.Y.depth, 1);
  // Izometria: X w prawo i w dół, Y pionowo w górę, Z w lewo i w dół; wszystkie zwrócone do patrzącego.
  const iso = byLabel(viewQuat('iso'));
  assert.ok(iso.X.tip.x > 100 && iso.X.tip.y > 100);
  near(iso.Y.tip.x, 100);
  assert.ok(iso.Y.tip.y < 100);
  assert.ok(iso.Z.tip.x < 100 && iso.Z.tip.y > 100);
  assert.ok(Object.values(iso).every((axis) => axis.depth > 0));
  // Z tyłu Z od patrzącego – rysowana pierwsza (bledsza); kolejność zawsze od najdalszej.
  const back = solidAxes(viewQuat('back'), center);
  assert.equal(back[0].label, 'Z');
  near(back[0].depth, -1);
  const any = solidAxes(quatFromAngles(30, -20, 10), center);
  assert.ok(any.every((axis, index) => index === 0 || any[index - 1].depth <= axis.depth));
  // Kolory: X czerwona, Y zielona, Z niebieska; długość osi na ekranie – AXES_LENGTH przy osi w płaszczyźnie ekranu.
  assert.deepEqual(Object.fromEntries(Object.entries(front).map(([label, axis]) => [label, axis.color])), { X: '#d92d20', Y: '#1e8e3e', Z: '#1a6fdb' });
  near(Math.hypot(front.X.tip.x - 100, front.X.tip.y - 100), AXES_LENGTH);
  // Kostki widoków (1.47–1.48) już nie ma.
  assert.equal(solidsUi.paintViewCube, undefined);
  assert.equal(solidsUi.cubeFaceAt, undefined);
  assert.equal(solidsUi.CUBE_HALF, undefined);
});
