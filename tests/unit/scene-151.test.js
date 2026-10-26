// Rysunek 1.51: scena 3D – kamera i gotowe widoki (te same położenia co widoki bryły), bryły stojące na kartce, granice
// sceny, przekształcenie kartki, skala „cała scena”, kolejność rysowania, obrót przeciągnięciem i przejście do widoku.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptyDrawing } from '../../js/core/drawing.js';
import {
  SCENE_ELEVATION, SCENE_VIEWS, blendCamera, fitScale, orbit, paintOrder, projectWorld, sceneBounds, sceneCamera, sceneQuat, sceneSolids, sceneView,
  sceneViewId, sheetMatrix, toView, worldOfPage
} from '../../js/core/scene.js';
import { newModel, newSolid, viewQuat } from '../../js/core/solids.js';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const nearAll = (actual, expected, tolerance = 1e-9) => actual.forEach((value, index) => near(value, expected[index], tolerance));
const view = (id) => SCENE_VIEWS.find((item) => item.id === id);

test('scena 1.51: kamera – przód od −Y, góra z X w prawo i Y w górę; gotowe widoki dają te same położenia co widoki bryły', () => {
  const front = sceneCamera(0, 0);
  nearAll(front.xv, [1, 0, 0]);
  nearAll(front.yv, [0, 0, 1]);
  nearAll(front.zv, [0, -1, 0]);
  const top = sceneCamera(0, 90);
  nearAll(top.xv, [1, 0, 0]);
  nearAll(top.yv, [0, 1, 0], 1e-12);
  nearAll(top.zv, [0, 0, 1], 1e-12);
  // Izometria: od przodu z prawej, z góry (+X, −Y, +Z).
  const iso = sceneCamera(view('iso').az, view('iso').el);
  assert.ok(iso.zv[0] > 0 && iso.zv[1] < 0 && iso.zv[2] > 0);
  // Bryła stojąca w scenie wygląda w gotowym widoku sceny tak jak w tym samym widoku na obrazku 2D.
  for (const { id, az, el } of SCENE_VIEWS) {
    const q = sceneQuat(sceneCamera(az, el));
    const expected = viewQuat(id);
    const same = Math.abs(q.reduce((sum, value, index) => sum + value * expected[index], 0));
    near(same, 1, 1e-6);
  }
});

test('scena 1.51: bryły stoją na kartce w miejscu obrazków – podstawa w Z = 0, środek nad środkiem obrazka; granice sceny', () => {
  const drawing = emptyDrawing();
  const box = newSolid('box', { x: 400, y: 300 });
  const cylinder = newSolid('cylinder', { x: 1000, y: 700 });
  const sphere = newSolid('sphere', { x: 1300, y: 200 });
  const profile = { islands: [{ outer: [[-60, -40], [60, -40], [60, 40], [-60, 40]], holes: [] }] };
  const slab = { ...newModel('extrude', profile, { x: 700, y: 900 }), dims: { h: 30 } };
  drawing.strokes = [{ tool: 'pen', color: '#1d1d1f', points: [0, 0, 2, 10, 10, 2] }, box, cylinder, sphere, slab];
  const solids = sceneSolids(drawing);
  assert.deepEqual(solids.map((item) => item.index), [1, 2, 3, 4], 'tylko bryły, z miejscem w rysunku');
  const [b, c, s, e] = solids;
  // Prostopadłościan a × b × c (6 × 4 × 3 kratki): środek obrazka (400, 300) → świat (400, 1100 − 300); podstawa na kartce.
  nearAll(b.origin, [400, 800, box.dims.c / 2]);
  nearAll(b.center, [400, 800, box.dims.c / 2]);
  nearAll(b.half, [box.dims.a / 2, box.dims.b / 2, box.dims.c / 2]);
  near(b.height, box.dims.c);
  near(c.origin[2], cylinder.dims.h / 2);
  near(s.origin[2], sphere.dims.d / 2);
  // Wyciągnięcie ze szkicu na XY: profil 120 × 80 leży na kartce (X, Y), wysokość 30 w górę.
  nearAll(e.half, [60, 40, 15]);
  near(e.origin[2], 15);
  assert.equal(e.model, true);
  const bounds = sceneBounds(drawing, solids);
  nearAll(bounds.min, [0, 0, 0]);
  nearAll(bounds.max, [drawing.width, drawing.height, Math.max(box.dims.c, cylinder.dims.h, sphere.dims.d, 30)]);
  // Punkt kartki w świecie.
  assert.deepEqual(worldOfPage(drawing, { x: 10, y: 100 }), [10, drawing.height - 100, 0]);
});

test('scena 1.51: kartka – przekształcenie płótna zgodne z rzutem punktów; skala „cała scena”; kolejność rysowania od najdalszej', () => {
  const drawing = emptyDrawing();
  const room = { width: 1000, height: 800, top: 60 };
  const bounds = sceneBounds(drawing, []);
  for (const [az, el] of [[45, 35.264], [0, 90], [-30, 20], [120, 60]]) {
    const camera = sceneCamera(az, el);
    const base = fitScale(camera, bounds, room);
    const screen = sceneView(camera, bounds, { ...room, base, zoom: 1.5, pan: { x: 20, y: -10 } });
    const [a, b, c, d, e, f] = sheetMatrix(camera, screen, drawing);
    for (const point of [{ x: 0, y: 0 }, { x: 1600, y: 0 }, { x: 800, y: 550 }, { x: 123, y: 987 }]) {
      const expected = projectWorld(camera, screen, worldOfPage(drawing, point));
      near(a * point.x + c * point.y + e, expected.x, 1e-6);
      near(b * point.x + d * point.y + f, expected.y, 1e-6);
    }
    // Kartka widziana z góry albo z ukosa – bez odbicia lustrzanego.
    assert.ok(a * d - b * c > 0);
  }
  // Z góry: kartka 1600 × 1100 w obszarze 1000 × (800 − 60) z marginesem 0,9 – ogranicza szerokość.
  near(fitScale(sceneCamera(0, 90), bounds, room), Math.min(900 / 1600, (740 * 0.9) / 1100));
  // Środek sceny w środku obszaru (bez przesunięcia).
  const camera = sceneCamera(45, 35.264);
  const screen = sceneView(camera, bounds, { ...room, base: 0.5 });
  const middle = projectWorld(camera, screen, [800, 550, 0]);
  near(middle.x, 500, 1e-9);
  near(middle.y, 60 + 370, 1e-9);
  // Kolejność: w izometrii (od +X, −Y) bliżej jest bryła z większym X i mniejszym Y.
  const far = { index: 0, center: [200, 900, 50] };
  const close = { index: 1, center: [1200, 200, 50] };
  assert.deepEqual(paintOrder(camera, [close, far]).map((item) => item.index), [0, 1]);
  assert.ok(toView(camera, close.center)[2] > toView(camera, far.center)[2]);
});

test('scena 1.51: obrót przeciągnięciem (wysokość 0–90°, azymut w kółko), gotowy widok w kamerze, przejście najkrótszą drogą', () => {
  const start = sceneCamera(45, 35.264);
  // W prawo – azymut maleje (scena obraca się za palcem), w dół – kamera wyżej.
  const turned = orbit(start, 100, 50);
  near(turned.az, 5);
  near(turned.el, 55.264);
  assert.deepEqual(orbit(start, 0, 1000).el, SCENE_ELEVATION[1]);
  assert.deepEqual(orbit(start, 0, -1000).el, SCENE_ELEVATION[0]);
  near(orbit(sceneCamera(170, 30), -50, 0).az, -170);
  assert.equal(sceneViewId(sceneCamera(45, 35.264)), 'iso');
  assert.equal(sceneViewId(sceneCamera(180, 0)), 'back');
  assert.equal(sceneViewId(sceneCamera(-180, 0)), 'back');
  assert.equal(sceneViewId(sceneCamera(20, 0)), null);
  // Z 170° do −170°: przez 180°, nie przez 0°.
  near(blendCamera({ az: 170, el: 0 }, { az: -170, el: 0 }, 0.5).az, 180);
  assert.deepEqual(blendCamera({ az: 10, el: 10 }, { az: 90, el: 0 }, 1), { az: 90, el: 0 });
});
