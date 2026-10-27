// Rysunek 1.49 (szkic na ścianie bryły): operacje logiczne na wielościanach (różnica, suma, siatka szczelna, objętości),
// ściana pod punktem i widok prosto na nią, układ szkicu na ścianie, wycięcie (głębokość, na wylot) i dodanie, sprawdzanie
// danych, odbicie i skala z operacjami, przesuwanie operacji za ścianami, rozkład na stronie, rzuty i DXF.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { convexParts, meshPolygons, meshVolume, subtract, toMesh, union } from '../../js/core/csg.js';
import { DRAWING_VERSION, cleanDrawing } from '../../js/core/drawing.js';
import { drawingToDxf, parseDxf } from '../../js/core/dxf.js';
import {
  FEATURE_LIMITS, cleanSolid, faceAt, faceView, featureBehind, featureMesh, featureNormal, featureQuat, featureView, followFaces, mirrorSolid, newFeature, newModel,
  newSolid, primitiveMesh, profileFromShapes, projectionShapes, quatFromAngles, scaleSolid, shapeLoop, signedArea, sketchFrame, solidAngles, solidBox, solidGeometry,
  solidView, viewQuat, withQuat
} from '../../js/core/solids.js';

const PAGE = [1600, 1200];
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
/** Pole 72-kąta foremnego wpisanego w okrąg r (okręgi szkicu mają 72 punkty). */
const ring = (r) => 0.5 * 72 * r * r * Math.sin((2 * Math.PI) / 72);
const closed = (mesh) => mesh.E.every((edge) => edge.faces.length === 2);
/** Pole profilu (punkty zaokrąglone do 0,01 – dokładnie to, co wycina operacja). */
const profileArea = (profile) => profile.islands.reduce((sum, island) => sum + Math.abs(signedArea(island.outer)) - island.holes.reduce((holes, hole) => holes + Math.abs(signedArea(hole)), 0), 0);
const moved = (mesh, [dx, dy, dz]) => ({ ...mesh, V: mesh.V.map(([x, y, z]) => [x + dx, y + dy, z + dz]) });
const circle = (x, y, d) => ({ tool: 'shape', shape: 'ellipse', x, y, w: d, h: d, angle: 0, skew: 0, adjust: 0, color: '#1d1d1f', size: 2 });
const rect = (x, y, w, h) => ({ tool: 'shape', shape: 'rect', x, y, w, h, angle: 0, skew: 0, adjust: 0, color: '#1d1d1f', size: 2 });
const loopsOf = (shapes) => profileFromShapes(shapes, 'extrude');
/** Prostopadłościan 264 × 176 × 132 (x, z, y) widziany z góry, środek (400, 300) – wierzch: x 268–532, y 212–388 na stronie. */
const topBox = () => ({ ...newSolid('box', { x: 400, y: 300 }), q: viewQuat('top') });
/** Operacja z kształtów na stronie na bryle widzianej prosto na ścianę. */
function feature(element, op, shapes) {
  const made = loopsOf(shapes);
  const loops = shapes.map((shape) => (shape.shape === 'ellipse'
    ? Array.from({ length: 72 }, (_, index) => [shape.x + (shape.w / 2) * Math.cos((index * Math.PI) / 36), shape.y + (shape.h / 2) * Math.sin((index * Math.PI) / 36)])
    : [[shape.x - shape.w / 2, shape.y - shape.h / 2], [shape.x + shape.w / 2, shape.y - shape.h / 2], [shape.x + shape.w / 2, shape.y + shape.h / 2], [shape.x - shape.w / 2, shape.y + shape.h / 2]]));
  const frame = sketchFrame(element, loops, made.center);
  assert.equal(frame.error, undefined, frame.error);
  return newFeature(op, frame, made.profile, shapes);
}

test('bryły 1.49: operacje logiczne – różnica i suma, siatka szczelna, ściany jednej płaszczyzny scalone, objętości', () => {
  const box = primitiveMesh('box', { a: 200, b: 100, c: 50 });
  const cylinder = primitiveMesh('cylinder', { d: 40, h: 80 });
  const hole = toMesh(subtract(meshPolygons(box), meshPolygons(cylinder)));
  assert.ok(closed(hole), 'każda krawędź – dwie ściany');
  near(meshVolume(hole), 200 * 100 * 50 - ring(20) * 50, 1e-3);
  // Wierzch z otworem – jedna ściana z jedną pętlą otworu.
  const topFace = hole.F.filter((loops, index) => hole.N[index][1] > 0.999);
  assert.equal(topFace.length, 1);
  assert.equal(topFace[0].length, 2, 'obrys i otwór');
  // Kieszeń: walec wystaje nad wierzch, sięga 20 w głąb.
  const pocket = toMesh(subtract(meshPolygons(box), meshPolygons(moved(primitiveMesh('cylinder', { d: 40, h: 40 }), [50, 25, 0]))));
  assert.ok(closed(pocket));
  near(meshVolume(pocket), 200 * 100 * 50 - ring(20) * 20, 1e-3);
  // Czop na wierzchu (styka się ścianą) i dodanie równo z bokiem – ściany boczne scalone (bryła L: 8 ścian).
  const boss = toMesh(union(meshPolygons(box), meshPolygons(moved(primitiveMesh('box', { a: 50, b: 50, c: 30 }), [0, 40, 0]))));
  assert.ok(closed(boss));
  near(meshVolume(boss), 200 * 100 * 50 + 50 * 50 * 30, 1e-3);
  assert.equal(boss.F.length, 11);
  const flush = toMesh(union(meshPolygons(box), meshPolygons(moved(primitiveMesh('box', { a: 50, b: 100, c: 30 }), [75, 40, 0]))));
  assert.equal(flush.F.length, 8, 'bok bryły i bok dodania w jednej płaszczyźnie – jedna ściana');
  near(meshVolume(flush), 200 * 100 * 50 + 50 * 100 * 30, 1e-3);
  // Bryły rozłączne – bez zmian (różnica) i obok siebie (suma).
  const far = meshPolygons(moved(box, [1000, 0, 0]));
  assert.equal(subtract(meshPolygons(box), far).length, meshPolygons(box).length);
  near(meshVolume(toMesh(union(meshPolygons(box), far))), 2 * 200 * 100 * 50, 1e-3);
  // Części wypukłe obszaru z otworem: suma pól = pole obrysu − pole otworu.
  const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const inner = [[30, 30], [30, 70], [70, 70], [70, 30]];
  const area = (loop) => Math.abs(loop.reduce((sum, [x, y], index) => sum + x * loop[(index + 1) % loop.length][1] - loop[(index + 1) % loop.length][0] * y, 0) / 2);
  near(convexParts([square, inner]).reduce((sum, part) => sum + area(part), 0), 100 * 100 - 40 * 40, 1e-9);
});

test('bryły 1.49: ściana pod punktem i widok prosto na nią – przód, prawy bok, wierzch, pochyła ściana ostrosłupa; kula – bez ścian', () => {
  const box = newSolid('box', { x: 400, y: 300 });
  const views = [[{ x: 380, y: 330 }, 'front', [0, 0, 1]], [{ x: 460, y: 330 }, 'right', [1, 0, 0]], [{ x: 400, y: 230 }, 'top', [0, 1, 0]]];
  for (const [point, view, normal] of views) {
    const face = faceAt(box, point);
    assert.deepEqual(face.normal.map((value) => Math.round(value) + 0), normal, view);
    assert.ok(face.loops[0].length >= 4);
    assert.equal(solidView(faceView(box, face.normal)), view, `widok na ścianę: ${view}`);
  }
  assert.equal(faceAt(box, { x: 100, y: 100 }), null, 'poza bryłą');
  // Ostrosłup: ściana pochyła – bez obrotu na kartce, pochylenie jak ściana.
  const pyramid = newSolid('pyramid', { x: 400, y: 300 });
  const slope = faceAt(pyramid, { x: 390, y: 290 });
  const angles = solidAngles(faceView(pyramid, slope.normal));
  assert.equal(angles.roll, 0);
  assert.equal(angles.yaw, 0);
  assert.ok(angles.pitch > 10 && angles.pitch < 40, `pochylenie ${angles.pitch}`);
  assert.equal(faceAt(newSolid('sphere', { x: 400, y: 300 }), { x: 400, y: 300 }), null, 'kula');
  assert.ok(sketchFrame(newSolid('sphere', { x: 400, y: 300 }), [[[390, 290], [410, 290], [410, 310]]], { x: 400, y: 300 }).error);
});

test('bryły 1.49: szkic na wierzchu – układ, wycięcie (połowa grubości, na wylot), dodanie; bez widoku na ścianę albo poza ścianą – komunikat', () => {
  const box = topBox();
  const cut = feature(box, 'cut', [circle(450, 300, 60)]);
  assert.deepEqual(cut.o, [50, 66, 0], 'o – środek szkicu na wierzchu (y = połowa wysokości)');
  assert.deepEqual([cut.u, cut.v].map((v) => v.map((value) => Math.round(value) + 0)), [[1, 0, 0], [0, 0, -1]]);
  assert.deepEqual(featureNormal(cut).map((value) => Math.round(value) + 0), [0, 1, 0], 'normalna – na zewnątrz wierzchu');
  assert.equal(cut.depth, 66, 'wycięcie – do połowy grubości');
  const pocket = cleanSolid({ ...box, features: [cut] }, ...PAGE);
  const volume = 264 * 176 * 132;
  const hole = profileArea(cut.profile);
  near(hole, ring(30), 2);
  near(meshVolume(featureMesh(pocket)), volume - hole * 66, 0.05);
  assert.ok(closed(featureMesh(pocket)));
  const through = cleanSolid({ ...box, features: [{ ...cut, through: true }] }, ...PAGE);
  near(meshVolume(featureMesh(through)), volume - hole * 132, 0.05);
  assert.equal(featureBehind(through, 0), 132, 'na wylot – przez całą grubość');
  const add = feature(box, 'add', [rect(350, 300, 80, 60)]);
  assert.equal(add.depth, 30, 'dodanie – połowa krótszego boku szkicu');
  near(meshVolume(featureMesh(cleanSolid({ ...box, features: [add] }, ...PAGE))), volume + 80 * 60 * 30, 0.05);
  // Dwie operacje po kolei: kieszeń, potem czop w innym miejscu; operacja na ścianie dodanej wcześniej.
  const both = cleanSolid({ ...box, features: [cut, add] }, ...PAGE);
  near(meshVolume(featureMesh(both)), volume - hole * 66 + 80 * 60 * 30, 0.05);
  const onBoss = feature(withQuat(both, viewQuat('top')), 'cut', [circle(350, 300, 20)]);
  near(onBoss.o[1], 66 + 30, 1e-6, 'szkic na wierzchu czopa – najbliższa ściana');
  // Bryła nie stoi ścianą do patrzącego albo szkic obok bryły – komunikat zamiast operacji.
  const shapes = [circle(450, 300, 60)];
  const made = loopsOf(shapes);
  const loops = [[[420, 270], [480, 270], [480, 330], [420, 330]]];
  assert.match(sketchFrame(withQuat(box, viewQuat('iso')), loops, made.center).error, /ścianą do siebie/);
  assert.match(sketchFrame(box, [[[1000, 900], [1050, 900], [1050, 950]]], { x: 1025, y: 925 }).error, /na ścianie bryły/);
});

test('bryły 1.49: dane – operacje sprawdzane (u, v prostopadłe, profil, głębokość), kula bez operacji, najwyżej 30, zapis bez zmian; format 21', () => {
  const box = topBox();
  const cut = feature(box, 'cut', [circle(450, 300, 60)]);
  const element = cleanSolid({ ...box, features: [cut] }, ...PAGE);
  assert.deepEqual(cleanSolid(element, ...PAGE), element, 'drugie wczytanie bez zmian');
  assert.equal(element.features[0].sketch.length, 1, 'szkic w operacji');
  const bad = [
    { ...cut, op: 'bevel' }, { ...cut, u: [0, 0, 0] }, { ...cut, v: [1, 0, 0] }, { ...cut, profile: null }, { ...cut, depth: -5 }, { ...cut, o: [1, 2] }
  ];
  assert.equal(cleanSolid({ ...box, features: bad }, ...PAGE).features, undefined, 'złe operacje odrzucone');
  // u i v nieprostopadłe / niejednostkowe – poprawione.
  const skew = cleanSolid({ ...box, features: [{ ...cut, u: [2, 0, 0], v: [0.1, 0, -3] }] }, ...PAGE).features[0];
  assert.deepEqual(skew.u, [1, 0, 0]);
  assert.deepEqual(skew.v, [0, 0, -1]);
  assert.equal(cleanSolid({ ...box, features: [{ ...cut, through: true, op: 'add' }] }, ...PAGE).features[0].through, undefined, 'na wylot – tylko wycięcie');
  assert.equal(cleanSolid({ ...newSolid('sphere'), features: [cut] }, ...PAGE).features, undefined, 'kula');
  assert.equal(cleanSolid({ ...box, features: Array.from({ length: 40 }, () => cut) }, ...PAGE).features.length, FEATURE_LIMITS.count);
  assert.equal(DRAWING_VERSION, 26, 'format 26 (od 1.55 – suma i różnica brył; płaszczyzny – od 25; pomiary – od 24; położenie brył – od 23; początek układu – od 22; operacje na ścianach – od 21)');
  const saved = cleanDrawing({ version: DRAWING_VERSION, width: PAGE[0], height: PAGE[1], strokes: [element] });
  assert.deepEqual(saved.strokes[0].features, element.features);
});

test('bryły 1.49: odbicie i skala z operacjami, przesuwanie operacji za ścianą (wymiary, głębokość), widok po operacji, widok na szkic operacji', () => {
  const box = topBox();
  const cut = feature(box, 'cut', [circle(450, 300, 60)]);
  const add = feature(box, 'add', [rect(350, 300, 80, 60)]);
  const element = cleanSolid({ ...box, features: [cut, add] }, ...PAGE);
  const volume = meshVolume(featureMesh(element));
  const mirrored = mirrorSolid(element, { x: 400, y: 0 }, Math.PI / 2);
  near(meshVolume(featureMesh(mirrored)), volume, 0.05);
  assert.deepEqual(mirrored.features[0].o, [-50, 66, 0], 'odbite względem x = 0 bryły');
  assert.deepEqual(featureNormal(mirrored.features[0]).map((value) => Math.round(value) + 0), [0, 1, 0], 'normalna dalej na zewnątrz');
  assert.equal(mirrored.features[0].mirror, true, 'szkic oznaczony');
  assert.equal(mirrorSolid(mirrored, { x: 400, y: 0 }, Math.PI / 2).features[0].mirror, undefined, 'podwójne odbicie – szkic jak był');
  const scaled = scaleSolid(element, 400, 300, 2);
  near(meshVolume(featureMesh(scaled)), volume * 8, 1);
  assert.deepEqual(scaled.features[0].o, [100, 132, 0]);
  assert.equal(scaled.features[0].depth, 132);
  // Wyższy prostopadłościan: wierzch idzie w górę o 34 – operacje na nim też; głębszy czop – operacja na jego wierzchu też.
  const taller = followFaces(element, cleanSolid({ ...element, dims: { ...element.dims, c: 200 } }, ...PAGE));
  assert.deepEqual(taller.features.map((item) => item.o[1]), [100, 100]);
  const onBoss = cleanSolid({ ...element, features: [cut, add, feature(element, 'cut', [circle(350, 300, 20)])] }, ...PAGE);
  const higher = followFaces(onBoss, { ...onBoss, features: onBoss.features.map((item, index) => (index === 1 ? { ...item, depth: 50 } : item)) });
  assert.equal(higher.features[2].o[1], 66 + 50, 'operacja na wierzchu czopa idzie z nim');
  assert.equal(higher.features[0].o[1], 66, 'operacja na wierzchu bryły zostaje');
  // Po operacji – izometria, w której widać ścianę; szkic operacji – widok prosto na ścianę.
  assert.equal(solidView(featureView([0, 1, 0])), 'iso');
  assert.ok(solidAngles(featureView([0, -1, 0])).pitch < 0, 'spód – widok od dołu');
  assert.equal(solidView(featureQuat(element.features[0])), 'top');
});

test('bryły 1.49: rozkład na stronie, rzuty i DXF bryły z operacjami; bryła ze szkicu z operacją; wiele wysp', () => {
  const box = topBox();
  const element = cleanSolid({ ...box, features: [{ ...feature(box, 'cut', [circle(450, 300, 60)]), through: true }] }, ...PAGE);
  const iso = solidGeometry(withQuat(element, viewQuat('iso')));
  assert.equal(iso.depth, true, 'cieniowanie z buforem głębokości');
  assert.ok(iso.visible.length > 0 && iso.hidden.length > 0, 'otwór – krawędzie niewidoczne');
  assert.ok(iso.faces.every((face) => face.plane), 'ściany z płaszczyzną');
  assert.deepEqual(iso.dims.map((dim) => dim.value), [264, 176, 132], 'wymiary bryły bazowej');
  const shapes = projectionShapes(element, { x: 0, y: 0 }, { color: '#1d1d1f', size: 2.5 });
  assert.equal(shapes.filter((shape) => shape.shape === 'ellipse').length, 1, 'otwór z góry – okrąg');
  assert.ok(shapes.filter((shape) => shape.dash === 'dashed').length >= 2, 'otwór z przodu i z boku – przerywaną');
  const dxf = drawingToDxf({ version: DRAWING_VERSION, width: PAGE[0], height: PAGE[1], strokes: [withQuat(element, viewQuat('iso'))] });
  assert.equal(dxf.skipped, 0);
  assert.ok(parseDxf(dxf.text).entities.some((item) => item.linetype === 'DASHED'));
  // Płyta ze szkicu (z otworem) – otwór na wylot w jej wierzchu; dwie nachodzące wyspy – najpierw suma.
  const plateShapes = [rect(400, 300, 300, 200), circle(330, 300, 60)];
  const made = profileFromShapes(plateShapes, 'extrude');
  const plate = { ...newModel('extrude', made.profile, { x: 400, y: 300, sketch: plateShapes }), dims: { h: 50 } };
  const drill = { ...feature(plate, 'cut', [circle(470, 300, 40)]), through: true };
  const drilled = cleanSolid({ ...plate, features: [drill] }, ...PAGE);
  near(meshVolume(featureMesh(drilled)), (profileArea(made.profile) - profileArea(drill.profile)) * 50, 0.05);
  const twin = profileFromShapes([rect(380, 300, 100, 100), rect(440, 300, 100, 100)], 'extrude');
  assert.equal(twin.profile.islands.length, 2, 'dwie nachodzące wyspy');
  const merged = { ...newModel('extrude', twin.profile, { x: 410, y: 300 }), dims: { h: 20 } };
  const small = { ...feature(merged, 'cut', [circle(410, 300, 20)]), through: true };
  const withHole = cleanSolid({ ...merged, features: [small] }, ...PAGE);
  near(meshVolume(featureMesh(withHole)), (160 * 100 - profileArea(small.profile)) * 20, 0.05);
  assert.ok(closed(featureMesh(withHole)));
});

test('bryły 1.49: losowe operacje (stałe ziarno) – siatka szczelna (krawędzie bez pary najwyżej przy szczelinach z rachunku), objętość maleje przy wycięciu i rośnie przy dodaniu', () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const kinds = ['box', 'cylinder', 'prism', 'pyramid', 'cone'];
  let operations = 0;
  for (let trial = 0; trial < 40; trial += 1) {
    const kind = kinds[Math.floor(random() * kinds.length)];
    let element = withQuat(newSolid(kind, { x: 400, y: 300 }), quatFromAngles(random() * 360 - 180, random() * 160 - 80, random() * 60 - 30));
    let volume = meshVolume(primitiveMesh(element.kind, element.dims));
    for (let step = 0; step < 3; step += 1) {
      const box = solidBox(element);
      let face = null;
      for (let tries = 0; tries < 30 && !face; tries += 1) face = faceAt(element, { x: box.x + random() * box.width, y: box.y + random() * box.height });
      if (!face) break;
      const facing = { ...element, q: faceView(element, face.normal) };
      const outline = (faceAt(facing, { x: facing.x + 1e-3, y: facing.y }) ?? face).loops[0];
      const x = outline.reduce((sum, point) => sum + point[0], 0) / outline.length + (random() - 0.5) * 40;
      const y = outline.reduce((sum, point) => sum + point[1], 0) / outline.length + (random() - 0.5) * 40;
      const shape = random() < 0.5 ? circle(x, y, 20 + random() * 80) : { ...rect(x, y, 20 + random() * 120, 20 + random() * 120), angle: random() * 1.5 };
      const made = profileFromShapes([shape], 'extrude');
      const frame = sketchFrame(facing, [shapeLoop(shape)], made.center);
      if (frame.error) break;
      const op = random() < 0.6 ? 'cut' : 'add';
      const through = op === 'cut' && random() < 0.3;
      const next = cleanSolid({ ...facing, features: [...(facing.features ?? []), { ...newFeature(op, frame, made.profile), ...(through ? { through: true } : {}) }] }, ...PAGE);
      const mesh = featureMesh(next);
      const open = mesh.E.filter((edge) => edge.faces.length !== 2 && edge.seam === undefined && Math.hypot(...mesh.V[edge.a].map((value, axis) => value - mesh.V[edge.b][axis])) > 0.5);
      assert.equal(open.length, 0, `próba ${trial}, krok ${step} (${kind}, ${op}): krawędzie bez pary`);
      const after = meshVolume(mesh);
      assert.ok(op === 'cut' ? after <= volume + 1 : after >= volume - 1, `próba ${trial}, krok ${step}: objętość ${volume} → ${after}`);
      volume = after;
      element = next;
      operations += 1;
    }
  }
  assert.ok(operations > 80, `operacji: ${operations}`);
});
