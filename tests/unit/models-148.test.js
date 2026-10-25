// Rysunek 1.48 (bryły ze szkicu): profil z zamkniętych kształtów (otwory, wyspy, oś obrotu), wyciągnięcie i bryła obrotowa
// (siatka zamknięta, normalne na zewnątrz), krawędzie niewidoczne brył wklęsłych i z otworami, ściany z płaszczyznami,
// wymiary, odbicie i skala z profilem, sprawdzanie danych, rzuty 2D (metoda europejska, okręgi, linie niewidoczne), DXF.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DRAWING_VERSION, cleanDrawing, emptyDrawing } from '../../js/core/drawing.js';
import { drawingToDxf, parseDxf } from '../../js/core/dxf.js';
import { polyFromPoints, shapePoint } from '../../js/core/shapes.js';
import {
  PROJECTION_GAP, circleOf, cleanProfile, cleanSolid, isModel, mirrorSolid, modelMesh, newModel, profileFromShapes, projectionShapes, quatFromAngles,
  scaleSolid, signedArea, solidAngles, solidBox, solidGeometry, solidLabel, solidProjections, viewQuat, withQuat
} from '../../js/core/solids.js';
import { mirrorStroke, rotateStroke, scaleStroke } from '../../js/core/transform.js';

const PAGE = [1600, 1100];
const near = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const style = { color: '#1d1d1f', size: 2 };
const rect = (x, y, w, h) => ({ tool: 'shape', shape: 'rect', ...style, x, y, w, h, angle: 0, skew: 0, adjust: 0 });
const circle = (x, y, d) => ({ tool: 'shape', shape: 'ellipse', ...style, x, y, w: d, h: d, angle: 0, skew: 0, adjust: 0 });
const polygon = (points) => polyFromPoints('polygon', points.map(([x, y]) => ({ x, y })), { x: points[0][0], y: points[0][1], angle: 0 }, style);
const line = (a, b) => ({ tool: 'shape', shape: 'line', ...style, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: Math.hypot(b.x - a.x, b.y - a.y), h: 0, angle: Math.atan2(b.y - a.y, b.x - a.x), skew: 0, adjust: 0 });
const segments = (lines) => lines.reduce((sum, item) => sum + item.points.length - (item.closed ? 0 : 1), 0);
/** Płytka 300 × 200 z dwoma otworami ⌀60 (środek szkicu w (400, 300)). */
const plateShapes = [rect(400, 300, 300, 200), circle(330, 300, 60), circle(470, 300, 60)];
const plate = () => {
  const made = profileFromShapes(plateShapes, 'extrude');
  return cleanSolid(newModel('extrude', made.profile, { x: made.center.x, y: made.center.y, sketch: plateShapes }), ...PAGE);
};
/** Wałek stopniowany – półprofil nad osią y = 600 (od x = 100 do 430). */
const SHAFT = [[100, 600], [430, 600], [430, 562], [424, 556], [300, 556], [300, 530], [190, 530], [190, 548], [106, 548], [100, 554]];
const shaft = (angle = 360) => {
  const made = profileFromShapes([polygon(SHAFT)], 'revolve', { a: { x: 80, y: 600 }, b: { x: 460, y: 600 } });
  return cleanSolid({ ...newModel('revolve', made.profile, { x: made.center.x, y: made.center.y }), dims: { angle } }, ...PAGE);
};
/** Siatka zamknięta: każda krawędź ma dokładnie dwie ściany. */
const closedMesh = (mesh) => mesh.E.every((edge) => edge.faces.length === 2);

test('bryły 1.48: profil ze szkicu – otwory w obrysie, osobne wyspy, wyspa w otworze, kierunek pętli, środek', () => {
  const made = profileFromShapes(plateShapes, 'extrude');
  assert.deepEqual(made.center, { x: 400, y: 300 });
  assert.equal(made.profile.islands.length, 1);
  assert.equal(made.profile.islands[0].holes.length, 2);
  assert.ok(signedArea(made.profile.islands[0].outer) > 0, 'obrys przeciwnie do wskazówek zegara');
  assert.ok(made.profile.islands[0].holes.every((hole) => signedArea(hole) < 0), 'otwory – zgodnie');
  assert.equal(made.profile.islands[0].holes[0].length, 72, 'okrąg – 72 punkty');
  near(signedArea(made.profile.islands[0].outer), 300 * 200);
  // Y w górę: górny brzeg szkicu (y = 200 na stronie) – y = 100 w profilu.
  assert.equal(Math.max(...made.profile.islands[0].outer.map(([, y]) => y)), 100);
  // Dwie osobne figury – dwie wyspy; wyspa w otworze – trzecia.
  const two = profileFromShapes([rect(200, 200, 100, 100), rect(500, 200, 100, 100)], 'extrude');
  assert.equal(two.profile.islands.length, 2);
  const nested = profileFromShapes([rect(400, 300, 300, 300), rect(400, 300, 200, 200), rect(400, 300, 100, 100)], 'extrude');
  assert.deepEqual(nested.profile.islands.map((island) => island.holes.length).sort(), [0, 1]);
  // Bez zamkniętego kształtu – komunikat.
  assert.match(profileFromShapes([], 'extrude').error, /zamknięty kształt/);
});

test('bryły 1.48: profil obrotowy – oś z odcinka albo pozioma pod szkicem, układ osi, profil przecinający oś – komunikat', () => {
  const made = profileFromShapes([polygon(SHAFT)], 'revolve', { a: { x: 80, y: 600 }, b: { x: 460, y: 600 } });
  assert.deepEqual(made.center, { x: 265, y: 600 }, 'środek – na osi, w połowie długości');
  assert.equal(made.angle, 0);
  const ys = made.profile.islands[0].outer.map(([, y]) => y);
  assert.deepEqual([Math.min(...ys), Math.max(...ys)], [0, 70], 'odległość od osi 0–70');
  const xs = made.profile.islands[0].outer.map(([x]) => x);
  assert.deepEqual([Math.min(...xs), Math.max(...xs)], [-165, 165]);
  // Bez osi – pozioma prosta przez najniższy punkt szkicu (tu ta sama).
  assert.deepEqual(profileFromShapes([polygon(SHAFT)], 'revolve').profile, made.profile);
  // Oś pionowa z odcinka (jak w edytorze – końce odcinka): kąt osi 90°, profil po jej prawej stronie.
  const axis = line({ x: 250, y: 100 }, { x: 250, y: 500 });
  const vertical = profileFromShapes([rect(300, 300, 100, 200)], 'revolve', { a: shapePoint(axis, -0.5, 0), b: shapePoint(axis, 0.5, 0) });
  near(vertical.angle, Math.PI / 2);
  near(vertical.center.x, 250);
  near(vertical.center.y, 300);
  const heights = vertical.profile.islands[0].outer.map(([, y]) => y);
  near(Math.min(...heights), 0);
  near(Math.max(...heights), 100);
  assert.match(profileFromShapes([polygon(SHAFT)], 'revolve', { a: { x: 80, y: 560 }, b: { x: 460, y: 560 } }).error, /przecina oś/);
  assert.match(profileFromShapes([polygon(SHAFT)], 'revolve', { a: { x: 80, y: 600 }, b: { x: 80, y: 600 } }).error, /Oś/);
});

test('bryły 1.48: siatki – wyciągnięcie i obrót zamknięte (każda krawędź – dwie ściany), normalne na zewnątrz, punkty na osi', () => {
  const slab = plate();
  const mesh = modelMesh(slab);
  assert.ok(closedMesh(mesh));
  assert.equal(mesh.F.length, 2 + 4 + 72 * 2, 'dwie podstawy z otworami, boki obrysu i otworów');
  // Bryła symetryczna względem środka: suma objętości (dywergencja) > 0 – normalne na zewnątrz.
  const volume = (m) => m.F.reduce((sum, loops, face) => {
    const [p] = [m.V[loops[0][0]]];
    const area = loops.reduce((total, loop) => {
      let [x, y, z] = [0, 0, 0];
      loop.forEach((index, at) => {
        const [a, b] = [m.V[index], m.V[loop[(at + 1) % loop.length]]];
        x += (a[1] - b[1]) * (a[2] + b[2]);
        y += (a[2] - b[2]) * (a[0] + b[0]);
        z += (a[0] - b[0]) * (a[1] + b[1]);
      });
      return total + (x * m.N[face][0] + y * m.N[face][1] + z * m.N[face][2]) / 2;
    }, 0);
    return sum + (area * (p[0] * m.N[face][0] + p[1] * m.N[face][1] + p[2] * m.N[face][2])) / 3;
  }, 0);
  near(volume(mesh), (300 * 200 - 2 * Math.PI * 30 * 30 * 0.9987) * slab.dims.h, 300 * 200 * slab.dims.h * 0.002);
  const full = modelMesh(shaft());
  assert.ok(closedMesh(full), 'pełny obrót – zamknięta');
  assert.ok(volume(full) > 0);
  const partial = modelMesh(shaft(270));
  assert.ok(closedMesh(partial), 'obrót o 270° – zamknięta (ściany na końcach)');
  assert.ok(volume(partial) > 0 && volume(partial) < volume(full));
  near(volume(partial) / volume(full), 0.75, 0.01);
  // Punkty na osi – wspólne dla wszystkich kątów.
  assert.equal(full.V.filter(([, y, z]) => y === 0 && z === 0).length, 2);
});

test('bryły 1.48: rzut brył wklęsłych – otwory widoczne z przodu, niewidoczne z boku; ściany z płaszczyzną głębokości', () => {
  const front = solidGeometry(withQuat(plate(), viewQuat('front')));
  assert.equal(front.visible.length, 3, 'obrys i dwa otwory');
  assert.ok(front.visible.every((item) => item.closed));
  assert.equal(front.depth, true);
  const top = solidGeometry(withQuat(plate(), viewQuat('top')));
  // Z góry: tworzące otworów (po dwie) – niewidoczne.
  for (const x of [300, 360, 440, 500]) {
    assert.ok(top.hidden.some((item) => {
      const along = item.points.filter((point) => Math.abs(point.x - x) < 0.6);
      return along.length >= 2 && Math.max(...along.map((point) => point.y)) - Math.min(...along.map((point) => point.y)) > 90;
    }), `tworząca otworu x = ${x}`);
  }
  // Izometria: część krawędzi otworu z tyłu – niewidoczna (krawędź przerwana na granicy widoczności).
  const iso = solidGeometry(withQuat(plate(), viewQuat('iso')));
  assert.ok(iso.hidden.length > 0 && iso.visible.length > 0);
  assert.ok(iso.hidden.some((item) => item.offset > 0), 'przerywana dalej od miejsca na krawędzi');
  // Płaszczyzna ściany: z w środku przedniej ściany (z przodu) = połowa grubości.
  const face = front.faces.find((item) => item.loops.length === 3);
  near(face.plane.a * 400 + face.plane.b * 300 + face.plane.c, plate().dims.h / 2, 1e-6);
  // Wałek z boku: zarys i krawędzie stopni.
  const side = solidGeometry(withQuat(shaft(), viewQuat('front')));
  assert.ok(segments(side.visible) > 10);
  near(solidBox(withQuat({ ...shaft(), showDims: false, axes: false }, viewQuat('front'))).width, 330, 0.5);
});

test('bryły 1.48: wymiary i osie – długość wyciągnięcia, długość wałka i największa średnica; oś bryły obrotowej', () => {
  const slab = plate();
  assert.equal(slab.dims.h, 100, 'domyślnie – połowa krótszego boku szkicu');
  assert.deepEqual(solidGeometry(withQuat(slab, viewQuat('iso'))).dims.map((dim) => dim.value), [100]);
  assert.deepEqual(solidGeometry(withQuat(slab, viewQuat('front'))).dims, [], 'z przodu długość widać w punkt');
  const turned = solidGeometry(withQuat(shaft(), viewQuat('dimetric')));
  assert.deepEqual(turned.dims.map((dim) => `${dim.prefix ?? ''}${dim.value}`), ['330', '⌀140']);
  assert.equal(turned.axes.length, 1);
  assert.equal(solidGeometry(withQuat(shaft(), viewQuat('left'))).axes.length, 2, 'wzdłuż osi – krzyż');
  assert.equal(solidGeometry(withQuat(slab, viewQuat('iso'))).axes.length, 0);
  assert.equal(solidLabel(slab), 'Bryła: wyciągnięcie');
  assert.equal(solidLabel(shaft()), 'Bryła: obrotowa');
  assert.ok(isModel(slab) && !isModel({ kind: 'box' }));
});

test('bryły 1.48: dane – profil i szkic sprawdzane, kąt obrotu 10–360°, złe profile odrzucone; zapis rysunku (format 19)', () => {
  const slab = plate();
  assert.equal(slab.sketch.length, 3);
  assert.equal(slab.q[0], 1, 'nowa – z przodu');
  assert.equal(cleanSolid({ ...slab, profile: null }, ...PAGE), null);
  assert.equal(cleanSolid({ ...slab, profile: { islands: [{ outer: [[0, 0], [1, 0]] }] } }, ...PAGE), null, 'za mało punktów');
  assert.equal(cleanProfile({ islands: [{ outer: [[0, -5], [10, -5], [10, 10], [0, 10]], holes: [] }] }, 'revolve'), null, 'obrotowy pod osią');
  assert.deepEqual(cleanSolid({ ...shaft(), dims: { angle: 400 } }, ...PAGE).dims, { angle: 360 });
  assert.deepEqual(cleanSolid({ ...shaft(), dims: { angle: 2 } }, ...PAGE).dims, { angle: 10 });
  // Pętla z odwrotnym kierunkiem – poprawiona; powtórzone punkty – usunięte.
  const messy = cleanProfile({ islands: [{ outer: [[0, 0], [0, 10], [0, 10], [10, 10], [10, 0], [0, 0]], holes: [] }] }, 'extrude');
  assert.equal(messy.islands[0].outer.length, 4);
  assert.ok(signedArea(messy.islands[0].outer) > 0);
  const saved = cleanDrawing({ ...emptyDrawing(), strokes: [slab, shaft(270)] });
  assert.deepEqual(saved.strokes.map((stroke) => stroke.kind), ['extrude', 'revolve']);
  assert.deepEqual(saved.strokes[0].profile, slab.profile);
  assert.deepEqual(saved.strokes[0].sketch, slab.sketch, 'szkic zapisany w bryle');
  assert.equal(DRAWING_VERSION, 19, 'format 19 – bryły ze szkicu');
});

test('bryły 1.48: odbicie i skala – profil odbity (x → −x), szkic oznaczony; rzut lustrzany; skala profilu, wymiaru i szkicu', () => {
  const slab = withQuat(plate(), quatFromAngles(30, 20, 0));
  const mirrored = mirrorStroke(slab, 'horizontal', 400);
  assert.equal(mirrored.sketchMirror, true);
  assert.equal(mirrorStroke(mirrored, 'horizontal', 400).sketchMirror, undefined, 'dwa odbicia – bez oznaczenia');
  assert.ok(signedArea(mirrored.profile.islands[0].outer) > 0);
  const before = solidGeometry(slab).visible.flatMap((item) => item.points);
  const after = solidGeometry(mirrored).visible.flatMap((item) => item.points);
  near(Math.max(...after.map((point) => point.x)), 800 - Math.min(...before.map((point) => point.x)), 0.6);
  near(Math.max(...after.map((point) => point.y)), Math.max(...before.map((point) => point.y)), 0.6);
  // Wałek z przodu odbity w pionie – ten sam rzut (bryła obrotowa symetryczna).
  const shaftFront = withQuat(shaft(), viewQuat('front'));
  near(solidBox(mirrorSolid(shaftFront, { x: 0, y: 600 }, 0)).width, solidBox(shaftFront).width, 0.5);
  const bigger = scaleStroke(plate(), 400, 300, 2);
  assert.equal(bigger.dims.h, 200);
  near(signedArea(bigger.profile.islands[0].outer), 4 * 300 * 200);
  assert.deepEqual(bigger.sketch.map((shape) => shape.w), [600, 120, 120], 'szkic razem z bryłą');
  assert.deepEqual(scaleSolid(shaft(), 0, 0, 2).dims, { angle: 360 });
  // Obrót na kartce – profil bez zmian.
  assert.deepEqual(rotateStroke(slab, 0, 0, 1).profile, slab.profile);
  assert.deepEqual(solidAngles(rotateStroke(withQuat(slab, viewQuat('front')), 400, 300, Math.PI / 2).q), { yaw: 0, pitch: 0, roll: -90 });
});

test('bryły 1.48: rzuty 2D – przód, góra pod nim, lewy bok obok; okręgi, odcinki, linie niewidoczne przerywane, osie; DXF bryły ze szkicu', () => {
  const slab = plate();
  const { views, bounds } = solidProjections(slab);
  assert.deepEqual(views.map((view) => view.id), ['front', 'top', 'left']);
  const [front, top, left] = views;
  near(front.bounds.minX, -150);
  near(top.bounds.minY - front.bounds.maxY, PROJECTION_GAP, 0.5);
  near(left.bounds.minX - front.bounds.maxX, PROJECTION_GAP, 0.5);
  near(bounds.maxX - bounds.minX, 300 + PROJECTION_GAP + 100, 0.5);
  assert.equal(front.hidden.length, 0, 'z przodu niewidoczne pokrywają się z widocznymi – odpadają');
  assert.equal(top.hidden.length, 4, 'z góry – otwory przerywaną');
  assert.equal(left.hidden.length, 2, 'z boku – otwory jeden za drugim: każda tworząca raz');
  // Krawędzie otworów widziane z boku leżą na obrysie – odpadają (każda kreska raz).
  assert.deepEqual([top.visible.length, left.visible.length], [1, 1], 'z góry i z boku – sam obrys');
  const shapes = projectionShapes(slab, { x: 400, y: 300 }, { color: '#0040dd', size: 2.5 });
  const kinds = shapes.map((shape) => `${shape.shape}${shape.dash ? `/${shape.dash}` : ''}`);
  assert.equal(kinds.filter((kind) => kind === 'ellipse').length, 2, 'otwory – okręgi');
  assert.equal(kinds.filter((kind) => kind === 'line/dashed').length, 6, 'tworzące otworów z góry (4) i z boku (2) – odcinki przerywane');
  assert.ok(shapes.every((shape) => shape.color === '#0040dd'));
  assert.ok(shapes.filter((shape) => shape.dash).every((shape) => shape.size === 1.3), 'niewidoczne – cieńsze');
  const holes = shapes.filter((shape) => shape.shape === 'ellipse').sort((p, q) => p.x - q.x);
  near(holes[0].w, 60, 0.1);
  assert.deepEqual(holes.map((hole) => [hole.x, hole.y]), [[330, 300], [470, 300]], 'okręgi w miejscach otworów szkicu');
  // Wałek: osie (linia osiowa) w każdym rzucie, okręgi stopni z lewej.
  const turned = projectionShapes(shaft(), { x: 0, y: 0 }, style).map((shape) => `${shape.shape}${shape.dash ? `/${shape.dash}` : ''}`);
  assert.ok(turned.includes('line/center'));
  assert.ok(turned.filter((kind) => kind === 'ellipse').length >= 2);
  const ring = circleOf({ closed: true, points: Array.from({ length: 30 }, (_, index) => ({ x: 10 + 5 * Math.cos((index / 30) * Math.PI * 2), y: 5 * Math.sin((index / 30) * Math.PI * 2) })) });
  near(ring.r, 5, 1e-9);
  near(ring.x, 10, 1e-9);
  assert.equal(circleOf({ closed: true, points: Array.from({ length: 30 }, (_, index) => ({ x: index, y: 0 })) }), null);
  // DXF: bryła ze szkicu jak inne bryły.
  const parsed = parseDxf(drawingToDxf(cleanDrawing({ ...emptyDrawing(), strokes: [withQuat(slab, viewQuat('iso')), withQuat(shaft(), viewQuat('dimetric'))] })).text);
  assert.ok(parsed.entities.some((item) => item.linetype === 'DASHED'));
  assert.ok(parsed.entities.some((item) => item.linetype === 'CENTER'));
});
