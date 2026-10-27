// Rysunek 1.55: suma i różnica brył – druga bryła w historii modelu pierwszej (zapis, format 26), położenie w scenie bez
// zmian, otwór skośny (bryła ze szkicu na płaszczyźnie pionowej), pomiar osi otworu, „Wyjmij bryłę”, bryły stojące na
// bryłach, odbicie i skalowanie, kula z wycięciem, rzuty sceny z osią otworu.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { meshVolume } from '../../js/core/csg.js';
import { cleanDrawing, emptyDrawing } from '../../js/core/drawing.js';
import { measureFeatures, solidFeatures, worldFeature } from '../../js/core/measure3d.js';
import { sceneSolids } from '../../js/core/scene.js';
import { sceneProjections } from '../../js/core/scene-projections.js';
import { bodyDepth, bodyName, bodyOf, combineSolids, extractBody } from '../../js/core/solid-combine.js';
import { bodyExtent, placeOn, placement, solidsById } from '../../js/core/solid-pose.js';
import {
  BODY_LIMITS, bodyAxes, bodyMesh, cleanSolid, isPlainSphere, mirrorSolid, newModel, newSolid, scaleSolid, solidGeometry, solidShape
} from '../../js/core/solids.js';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
let counter = 0;
const newId = () => `t${(counter += 1)}`;
/** Prostopadłościan 264 × 176 × 132 (jednostki strony) w (x, y), na wysokości z. */
const box = (x, y, z = 0, id = 'box') => ({ ...newSolid('box', { x, y }), id, ...(z > 0 ? { z } : {}) });
/** Walec ⌀ d, wysokość h. */
const cylinder = (x, y, { d = 80, h = 220, z = 0, id = 'cyl' } = {}) => ({ ...newSolid('cylinder', { x, y }), dims: { d, h }, id, ...(z > 0 ? { z } : {}) });
const volume = (solid) => meshVolume(bodyMesh(solid));
const where = (strokes, solid) => {
  const place = placement(solidsById(strokes), solid);
  return [place.x, place.y, place.z, place.yaw];
};
/** Początek układu bryły w scenie (jak solid-combine): X, −Y strony, Z. */
const origin = (strokes, solid) => {
  const place = placement(solidsById(strokes), solid);
  return [place.x, -place.y, place.z - bodyExtent(solid).min[1]];
};

test('suma i różnica 1.55: zapis – operacja z bryłą (bez położenia i identyfikatora), obrót w (−180°, 180°], zagnieżdżenie, kula tylko z bryłą; format 26', () => {
  const tool = { ...cylinder(0, 0), z: 40, yaw: 30, on: { id: 'abc', x: 0, y: 0, z: 0, yaw: 0 }, measures: [] };
  const raw = { ...box(500, 400), features: [{ op: 'cut', body: { ...tool, x: 900, y: 900 }, at: [1.234567, 20, -5], turn: 390 }] };
  const clean = cleanSolid(raw, 1600, 1100);
  const [feature] = clean.features;
  assert.equal(feature.op, 'cut');
  assert.deepEqual(feature.at, [1.2346, 20, -5]);
  assert.equal(feature.turn, 30);
  for (const key of ['tool', 'x', 'y', 'z', 'yaw', 'on', 'measures']) assert.equal(key in feature.body, false, key);
  assert.equal(feature.body.kind, 'cylinder');
  // Bez poprawnej bryły albo położenia – operacja pominięta; zagnieżdżenie najwyżej BODY_LIMITS.depth.
  assert.equal(cleanSolid({ ...box(0, 0), features: [{ op: 'add', body: { kind: 'nic' }, at: [0, 0, 0] }] }, 1600, 1100).features, undefined);
  assert.equal(cleanSolid({ ...box(0, 0), features: [{ op: 'add', body: bodyOf(cylinder(0, 0)) }] }, 1600, 1100).features, undefined);
  let nested = bodyOf(cylinder(0, 0));
  for (let level = 0; level < BODY_LIMITS.depth + 2; level += 1) nested = { ...bodyOf(box(0, 0)), features: [{ op: 'add', body: nested, at: [0, 0, 0] }] };
  const deep = cleanSolid({ ...nested, x: 0, y: 0 }, 1600, 1100);
  assert.ok(bodyDepth(deep) <= BODY_LIMITS.depth, `zagnieżdżenie ${bodyDepth(deep)}`);
  // Kula: suma i różnica tak, operacje na ścianach – nie.
  const ball = cleanSolid({ ...newSolid('sphere', { x: 0, y: 0 }), features: [
    { op: 'cut', body: bodyOf(box(0, 0)), at: [100, 0, 0] },
    { op: 'cut', o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], profile: { islands: [{ outer: [[0, 0], [10, 0], [10, 10]], holes: [] }] }, depth: 5 }
  ] }, 1600, 1100);
  assert.equal(ball.features.length, 1);
  assert.equal(isPlainSphere(ball), false);
  assert.equal(cleanDrawing({ ...emptyDrawing(), strokes: [raw] }).version, 26);
  assert.equal(bodyName(feature.body), 'Walec');
});

test('suma i różnica 1.55: różnica – otwór na wylot (objętość), bryła w tym samym miejscu, druga znika; suma – podstawa niżej, początek układu bez zmian', () => {
  const target = box(500, 500);
  const tool = cylinder(500, 500);
  const strokes = [target, tool];
  const cut = combineSolids(strokes, target, tool, 'cut', newId);
  assert.equal(cut.error, undefined);
  assert.equal(cut.strokes.length, 1);
  assert.deepEqual(where(cut.strokes, cut.solid), where(strokes, target));
  // Walec ⌀ 80 przez całą wysokość prostopadłościanu (132).
  near(volume(cut.solid), 264 * 176 * 132 - Math.PI * 40 * 40 * 132, 264 * 176 * 132 * 0.003);
  assert.deepEqual(cut.solid.features[0].at, [0, 44, 0], 'początek walca 44 wyżej niż prostopadłościanu');
  // Suma: prostopadłościan uniesiony (z 50), walec od arkusza – wynik od arkusza, początek układu prostopadłościanu bez zmian.
  const lifted = box(500, 500, 50);
  const post = cylinder(500, 500);
  const list = [lifted, post];
  const joined = combineSolids(list, lifted, post, 'add', newId);
  assert.equal(joined.error, undefined);
  assert.equal(where(joined.strokes, joined.solid)[2], 0, 'podstawa – najniżej (walec)');
  origin(joined.strokes, joined.solid).forEach((value, axis) => near(value, origin(list, lifted)[axis], 0.01));
  assert.ok(volume(joined.solid) > volume(lifted));
});

test('suma i różnica 1.55: otwór skośny – bryła obrotowa na płaszczyźnie XZ pod kątem 35° wycięta z prostopadłościanu; oś otworu do pomiaru (kąt z wierzchem 35°), rzuty z osią', () => {
  const target = box(500, 500, 60);
  const profile = { islands: [{ outer: [[-150, 0], [150, 0], [150, 30], [-150, 30]], holes: [] }] };
  const rod = { ...newModel('revolve', profile, { x: 500, y: 500, plane: 'xz', planeAngle: 35 }), id: 'rod' };
  rod.z = Math.round((60 + 66 + bodyExtent(rod).min[1]) * 100) / 100;
  const result = combineSolids([target, rod], target, rod, 'cut', newId);
  assert.equal(result.error, undefined);
  const features = solidFeatures(result.solid);
  assert.equal(features.axes.length, 1, 'oś otworu');
  assert.ok(features.facets.some((facet) => facet?.kind === 'axis'), 'ściany otworu – oś');
  const drawing = { ...emptyDrawing(), strokes: result.strokes };
  const [item] = sceneSolids(drawing);
  const top = features.faces.find((face) => face.n[1] > 0.99);
  const angle = measureFeatures(worldFeature(item, features.axes[0]), worldFeature(item, top));
  assert.equal(angle.kind, 'angle');
  near(angle.value, 35, 1e-6);
  // Rzuty sceny: oś otworu – z przodu pod kątem (linia osiowa nie pozioma i nie pionowa).
  const front = sceneProjections(drawing).views.find((view) => view.id === 'front');
  assert.ok(front.axes.some(([a, b]) => Math.abs(a.x - b.x) > 10 && Math.abs(a.y - b.y) > 10), JSON.stringify(front.axes));
  assert.equal(bodyAxes(result.solid).length, 1);
});

test('suma i różnica 1.55: błędy – ta sama bryła, bryły się nie stykają, nie przenikają, wycięcie całej bryły, bryła stojąca na drugiej', () => {
  const target = box(500, 500);
  assert.match(combineSolids([target], target, target, 'add', newId).error, /nie tej samej/);
  const far = cylinder(1200, 500);
  assert.match(combineSolids([target, far], target, far, 'add', newId).error, /nie stykają/);
  assert.match(combineSolids([target, far], target, far, 'cut', newId).error, /nie przenikają/);
  // Walec obok (zasięgi się stykają w rogu), bez części wspólnej – różnica bez zmian.
  const beside = cylinder(500 + 132 + 40, 500 + 88 + 40, { d: 60 });
  assert.match(combineSolids([target, beside], target, beside, 'cut', newId).error, /nie przenikają/);
  const big = { ...newSolid('box', { x: 500, y: 500 }), dims: { a: 400, b: 300, c: 200 }, id: 'big' };
  assert.match(combineSolids([target, big], target, big, 'cut', newId).error, /całą bryłę/);
  // Prostopadłościan postawiony na walcu – walca nie da się do niego dołączyć ani z niego wyciąć.
  const base = cylinder(500, 500, { id: 'base' });
  const placed = placeOn([base, box(500, 500)], box(500, 500), base, { x: 500, y: 500 }, 220, newId);
  assert.match(combineSolids([placed.base, placed.solid], placed.solid, placed.base, 'add', newId).error, /stoi na tej bryle/);
});

test('suma i różnica 1.55: „Wyjmij bryłę” – druga bryła z powrotem w tym samym miejscu, nowy identyfikator; bryły stojące na drugiej – na wyniku (suma) albo same (różnica)', () => {
  const target = box(500, 500);
  const tool = cylinder(560, 470, { id: 'tool' });
  const strokes = [target, tool];
  const cut = combineSolids(strokes, target, tool, 'cut', newId);
  const back = extractBody(cut.strokes, cut.solid, newId);
  assert.equal(back.error, undefined);
  assert.equal(back.strokes.length, 2);
  assert.equal(back.strokes[1], back.tool);
  assert.notEqual(back.tool.id, 'tool');
  where(back.strokes, back.tool).forEach((value, index) => near(value, where(strokes, tool)[index], 0.01));
  assert.equal(back.solid.features, undefined);
  assert.match(extractBody(back.strokes, back.solid, newId).error, /nie jest sumą/);
  // Kula postawiona na walcu: suma – stoi na wyniku (to samo miejsce), różnica – stoi sama, w tym samym miejscu.
  const ball = { ...newSolid('sphere', { x: 560, y: 470 }), id: 'ball' };
  for (const op of ['add', 'cut']) {
    const placed = placeOn([target, tool, ball], ball, tool, { x: 560, y: 470 }, 220, newId);
    const list = [target, placed.base, placed.solid];
    const before = where(list, placed.solid);
    const result = combineSolids(list, target, placed.base, op, newId);
    assert.equal(result.error, undefined, op);
    const after = result.strokes.find((stroke) => stroke.kind === 'sphere');
    where(result.strokes, after).forEach((value, index) => near(value, before[index], 0.01));
    if (op === 'add') assert.equal(after.on.id, result.solid.id);
    else assert.equal(after.on, undefined);
  }
});

test('suma i różnica 1.55: odbicie i skalowanie – druga bryła razem z bryłą (miejsce, obrót, wymiary); kula z wycięciem – siatka, bez okręgu; zapis bez zmian', () => {
  const target = box(500, 500);
  const tool = { ...newSolid('box', { x: 600, y: 520 }), dims: { a: 100, b: 60, c: 300 }, yaw: 30, id: 'slot' };
  const cut = combineSolids([target, tool], target, tool, 'cut', newId).solid;
  const [feature] = cut.features;
  assert.equal(feature.turn, 30);
  const mirrored = mirrorSolid(cut, { x: 500, y: 0 }, Math.PI / 2);
  assert.equal(mirrored.features[0].turn, -30);
  near(mirrored.features[0].at[0], -feature.at[0]);
  near(volume(mirrored), volume(cut), 1);
  const scaled = scaleSolid(cut, 500, 500, 2);
  assert.deepEqual(scaled.features[0].body.dims, { a: 200, b: 120, c: 600 });
  feature.at.forEach((value, axis) => near(scaled.features[0].at[axis], value * 2, 1e-3));
  near(volume(scaled), volume(cut) * 8, volume(cut) * 0.01);
  // Kula z wyciętym prostopadłościanem – siatka, płaska ściana, środek kuli do pomiaru.
  const ball = { ...newSolid('sphere', { x: 500, y: 500 }), id: 'ball' };
  const cube = { ...newSolid('box', { x: 560, y: 500 }), dims: { a: 100, b: 100, c: 100 }, id: 'cube', z: 40 };
  const hollow = combineSolids([ball, cube], ball, cube, 'cut', newId);
  assert.equal(hollow.error, undefined);
  assert.equal(isPlainSphere(hollow.solid), false);
  assert.ok(solidShape(hollow.solid).F.length > 100);
  assert.equal(solidGeometry(hollow.solid).sphere, null);
  assert.ok(solidFeatures(hollow.solid).points.some((point) => point.role === 'sphere'));
  assert.ok(solidFeatures(hollow.solid).faces.length >= 3, 'płaskie ściany wycięcia');
  // Zapis i odczyt – ta sama bryła.
  const saved = cleanDrawing(JSON.parse(JSON.stringify({ ...emptyDrawing(), strokes: hollow.strokes })));
  near(volume(saved.strokes[0]), volume(hollow.solid), 1);
});
