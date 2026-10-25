// Rysunek 1.47 (bryły): element 'solid' – sprawdzanie danych, położenie (kwaternion, kąty, gotowe widoki, obrót
// z przeciągnięcia), rzut z krawędziami widocznymi i niewidocznymi, ściany do cieniowania, osie, wymiary, przekształcenia
// zaznaczenia (obrót na kartce, odbicie, skala, styl), granice, DXF, grupa Bryły, format rysunku 18.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DRAWING_VERSION, cleanDrawing, elementBox, emptyDrawing, hasMeasuredContent, isBox, solidDimText, strokeBounds, touchesStroke, translateStroke
} from '../../js/core/drawing.js';
import { drawingToDxf, parseDxf } from '../../js/core/dxf.js';
import {
  SOLID_DEFAULTS, SOLID_KINDS, SOLID_VIEWS, chainEdges, cleanSolid, newSolid, orbitQuat, quatFromAngles, quatMatrix, quatNorm, quatSlerp, solidAngles,
  solidBox, solidDimParts, solidGeometry, solidLabel, solidMesh, solidTone, solidView, viewQuat, withQuat
} from '../../js/core/solids.js';
import { SOLID_ITEMS, TOOL_GROUPS, itemLabel } from '../../js/core/tool-ring.js';
import { canTurn, mirrorAcross, mirrorStroke, rotateStroke, scaleStroke, withStyleOf } from '../../js/core/transform.js';

const PAGE = [1600, 1100];
const near = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const segments = (lines) => lines.reduce((sum, line) => sum + (line.closed ? line.points.length : line.points.length - 1), 0);
const at = (kind, view, extra = {}) => withQuat({ ...newSolid(kind, { x: 800, y: 500 }), ...extra }, viewQuat(view));
const span = (lines) => {
  const points = lines.flatMap((line) => line.points);
  return { width: Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)), height: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)) };
};
/** Ten sam obrót (q i −q). */
const sameTurn = (a, b) => near(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]), 1, 1e-6);

test('bryły 1.47: nowa bryła i sprawdzanie danych – rodzaj, środek, wymiary (domyślne i w granicach), kwaternion jednostkowy, wygląd', () => {
  const solid = newSolid('cylinder', { x: 300, y: 200, color: '#0040dd' });
  assert.deepEqual(solid.dims, { d: 176, h: 220 }, 'walec 4 × 5 kratek');
  assert.deepEqual(solidAngles(solid.q), { yaw: 45, pitch: 35.3, roll: 0 }, 'izometria');
  assert.equal(solidLabel(solid), 'Bryła: Walec');
  const clean = cleanSolid(solid, ...PAGE);
  assert.deepEqual({ ...clean, q: undefined }, { ...solid, q: undefined });
  sameTurn(clean.q, solid.q);
  // Złe dane: nieznany rodzaj, brak koloru – odrzucone; wymiary poza granicami, n niecałkowite, t ujemne, kwaternion nie jednostkowy.
  assert.equal(cleanSolid({ ...solid, kind: 'torus' }, ...PAGE), null);
  assert.equal(cleanSolid({ ...solid, color: 'blue' }, ...PAGE), null);
  const messy = cleanSolid({ ...solid, kind: 'prism', dims: { n: 40.6, d: -5, h: 1e9 }, q: [2, 0, 0, 0], edges: 'wavy', size: 99, shade: 'yes' }, ...PAGE);
  assert.deepEqual(messy.dims, { n: 12, d: SOLID_DEFAULTS.prism.d, h: 6000 });
  assert.deepEqual(messy.q, [1, 0, 0, 0]);
  assert.equal(messy.edges, 'dashed');
  assert.equal(messy.size, 20);
  assert.equal(messy.shade, undefined, 'cieniowanie tylko jako true');
  assert.deepEqual(cleanSolid({ ...solid, kind: 'cone', dims: { d: 100, t: -3, h: 50 } }, ...PAGE).dims, { d: 100, t: 0, h: 50 }, 'stożek ostry');
  assert.deepEqual(cleanSolid({ ...solid, q: 'x' }, ...PAGE).q, viewQuat('iso'), 'bez położenia – izometria');
  for (const kind of SOLID_KINDS) assert.ok(cleanSolid(newSolid(kind), ...PAGE), kind);
});

test('bryły 1.47: kąty położenia ↔ kwaternion, gotowe widoki, płynne przejście, obrót z przeciągnięcia (swobodny i wokół pionu)', () => {
  for (const [yaw, pitch, roll] of [[30, 20, 10], [-120, 60, -45], [170, -80, 5], [0, 0, 0], [-90, 0, 0]]) {
    assert.deepEqual(solidAngles(quatFromAngles(yaw, pitch, roll)), { yaw, pitch, roll });
  }
  // Pochylenie ±90° – obrót na kartce przechodzi w obrót wokół pionu (ten sam rzut).
  const top = solidAngles(quatFromAngles(30, 90, 20));
  assert.equal(top.roll, 0);
  sameTurn(quatFromAngles(top.yaw, top.pitch, top.roll), quatFromAngles(30, 90, 20));
  for (const view of SOLID_VIEWS) {
    assert.equal(solidView(viewQuat(view.id)), view.id);
    const angles = solidAngles(viewQuat(view.id));
    near(angles.yaw, Math.round(view.yaw * 10) / 10);
    near(angles.pitch, Math.round(view.pitch * 10) / 10);
  }
  assert.equal(solidView(quatFromAngles(10, 10, 0)), null);
  // Przejście: początek, koniec, w połowie – kwaternion jednostkowy.
  const [a, b] = [viewQuat('front'), viewQuat('top')];
  sameTurn(quatSlerp(a, b, 0), a);
  sameTurn(quatSlerp(a, b, 1), b);
  near(Math.hypot(...quatSlerp(a, b, 0.5)), 1, 1e-9);
  assert.deepEqual(solidAngles(quatSlerp(a, b, 0.5)), { yaw: 0, pitch: 45, roll: 0 });
  // Przeciągnięcie w prawo (przód idzie w prawo) – widać lewą ścianę; w dół – górę; po przekątnej – oba naraz.
  const front = viewQuat('front');
  assert.deepEqual(solidAngles(orbitQuat(front, 180, 0)), { yaw: -90, pitch: 0, roll: 0 });
  assert.deepEqual(solidAngles(orbitQuat(front, 0, 180)), { yaw: 0, pitch: 90, roll: 0 });
  const diagonal = solidAngles(orbitQuat(front, 40, 40));
  assert.ok(diagonal.yaw < 0 && diagonal.pitch > 0);
  // Wokół pionu: poziomo – tylko obrót wokół osi bryły (pochylenie zostaje), pionowo – tylko pochylenie.
  assert.deepEqual(solidAngles(orbitQuat(viewQuat('iso'), 90, 0, 0.5, false)), { yaw: 0, pitch: 35.3, roll: 0 });
  assert.deepEqual(solidAngles(orbitQuat(viewQuat('front'), 0, 60, 0.5, false)), { yaw: 0, pitch: 30, roll: 0 });
  // Swobodny obrót nie ma ograniczeń – bryła może stanąć do góry nogami.
  const flipped = solidAngles(orbitQuat(front, 0, 360 * 1.0));
  assert.ok(Math.abs(flipped.yaw) === 180 || Math.abs(flipped.roll) === 180, `do góry nogami: ${JSON.stringify(flipped)}`);
  near(Math.hypot(...quatNorm([0, 0, 0, 5])), 1);
});

test('bryły 1.47: siatki – ściany na zewnątrz, krawędzie ostre i gładkie; łamane z odcinków', () => {
  const box = solidMesh('box', SOLID_DEFAULTS.box);
  assert.equal(box.F.length, 6);
  assert.equal(box.E.length, 12);
  assert.ok(box.E.every((edge) => edge.sharp));
  const cylinder = solidMesh('cylinder', SOLID_DEFAULTS.cylinder);
  assert.equal(cylinder.E.filter((edge) => edge.sharp).length, 144, 'krawędzie podstaw ostre, tworzące – gładkie');
  const prism = solidMesh('prism', { n: 6, d: 100, h: 40 });
  assert.equal(prism.E.filter((edge) => edge.sharp).length, 18, 'graniastosłup sześciokątny – wszystkie krawędzie');
  // Jedna ściana graniastosłupa z przodu (normalna +z).
  assert.ok(prism.N.some((normal) => Math.abs(normal[2] - 1) < 1e-9));
  for (const kind of ['box', 'cylinder', 'cone', 'pyramid', 'prism']) {
    const mesh = solidMesh(kind, SOLID_DEFAULTS[kind]);
    mesh.F.forEach((face, index) => {
      const middle = face.reduce((sum, vertex) => sum.map((value, axis) => value + mesh.V[vertex][axis] / face.length), [0, 0, 0]);
      assert.ok(mesh.N[index].reduce((sum, value, axis) => sum + value * middle[axis], 0) > 0, `${kind}: ściana ${index} na zewnątrz`);
    });
  }
  // Okrąg z odcinków – jedna zamknięta łamana; dwa łuki stykające się końcami – jedna.
  assert.deepEqual(chainEdges([{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }]), [[0, 1, 2, 0]]);
  assert.deepEqual(chainEdges([{ a: 0, b: 1 }, { a: 1, b: 2 }]), [[0, 1, 2]]);
});

test('bryły 1.47: rzut – krawędzie widoczne i niewidoczne w widokach, zarys walca i kuli, ściany do cieniowania', () => {
  // Prostopadłościan w izometrii: 9 krawędzi widocznych (6 zarysu + 3 do narożnika), 3 niewidoczne, 3 ściany.
  const iso = solidGeometry(at('box', 'iso'));
  assert.equal(segments(iso.visible), 9);
  assert.equal(segments(iso.hidden), 3);
  assert.equal(iso.faces.length, 3);
  // Z przodu – prostokąt a × c; z góry – a × b; z lewej – b × c.
  const front = solidGeometry(at('box', 'front'));
  assert.equal(segments(front.visible), 4);
  near(span(front.visible).width, 264);
  near(span(front.visible).height, 132);
  near(span(solidGeometry(at('box', 'top')).visible).height, 176);
  near(span(solidGeometry(at('box', 'left')).visible).width, 176);
  // Walec z przodu – prostokąt d × h, z góry – okrąg o średnicy d.
  const side = solidGeometry(at('cylinder', 'front'));
  near(span(side.visible).width, 176);
  near(span(side.visible).height, 220);
  const circle = solidGeometry(at('cylinder', 'top'));
  near(span(circle.visible).width, 176);
  near(span(circle.visible).height, 176, 0.5);
  // Ściany od patrzącego: światło 0–1.
  assert.ok(solidGeometry(at('cylinder', 'iso')).faces.every((face) => face.light >= 0 && face.light <= 1));
  // Kula – zarys, równik i południk: tylna połowa niewidoczna.
  const ball = solidGeometry(at('sphere', 'iso'));
  assert.deepEqual(ball.sphere, { x: 800, y: 500, r: 88 });
  assert.ok(ball.hidden.length >= 2 && ball.visible.some((line) => line.thin));
  // Ostrosłup z góry: kwadrat i przekątne do wierzchołka, nic niewidocznego.
  const pyramid = solidGeometry(at('pyramid', 'top'));
  assert.equal(segments(pyramid.visible), 8);
  assert.equal(pyramid.hidden.length, 0);
  // Kolor ściany: jaśniejszy od tuszu, ciemniejszy z dala od światła.
  assert.equal(solidTone('#000000', 1), '#cccccc');
  assert.ok(parseInt(solidTone('#000000', 0).slice(1, 3), 16) < parseInt(solidTone('#000000', 1).slice(1, 3), 16));
});

test('bryły 1.47: osie symetrii i wymiary – krawędzie zarysu, wysokość wzdłuż osi, średnice ⌀ i S⌀, liczby w jednostce rysunku', () => {
  const values = (solid) => solidGeometry(solid).dims.map((dim) => `${dim.prefix ?? ''}${dim.value}`);
  assert.deepEqual(values(at('box', 'iso')), ['264', '176', '132']);
  assert.deepEqual(values(at('box', 'front')), ['264', '132'], 'głębokość widać w punkt – bez wymiaru');
  assert.deepEqual(values(at('cylinder', 'iso')), ['220', '⌀176']);
  assert.deepEqual(values(at('cylinder', 'top')), ['⌀176'], 'wysokość widać w punkt');
  assert.deepEqual(values(at('cone', 'iso', { dims: { d: 176, t: 88, h: 220 } })), ['220', '⌀176', '⌀88'], 'stożek ścięty');
  assert.deepEqual(values(at('pyramid', 'iso')), ['176', '176', '198']);
  assert.deepEqual(values(at('sphere', 'iso')), ['S⌀176']);
  assert.deepEqual(values(at('box', 'iso', { showDims: false })), []);
  // Osie: walec – linia wzdłuż osi; z góry – krzyż; prostopadłościan – bez osi; bez osi w danych – brak.
  assert.equal(solidGeometry(at('cylinder', 'iso')).axes.length, 1);
  assert.equal(solidGeometry(at('cylinder', 'top')).axes.length, 2);
  assert.equal(solidGeometry(at('box', 'iso')).axes.length, 0);
  assert.equal(solidGeometry(at('cone', 'iso', { axes: false })).axes.length, 0);
  // Liczba: technicznie w mm bez jednostki, opisowo – z jednostką skali.
  const dim = solidGeometry(at('cylinder', 'iso')).dims[1];
  assert.equal(solidDimText(dim, { value: 1, unit: 'cm' }, { style: 'technical', unit: 'mm' }), '⌀40');
  assert.equal(solidDimText(dim, { value: 1, unit: 'cm' }), '⌀4 cm');
  // Wymiar liniowy do narysowania: linie pomocnicze, linia wymiarowa, dwa groty, liczba czytelna (nie do góry nogami).
  const parts = solidDimParts(solidGeometry(at('box', 'iso')).dims[0], '60');
  assert.equal(parts.lines.length, 3);
  assert.equal(parts.arrows.length, 2);
  assert.ok(Math.abs(parts.label.angle) <= Math.PI / 2 + 1e-9);
  const diameter = solidDimParts(solidGeometry(at('sphere', 'iso')).dims[0], 'S⌀40');
  assert.equal(diameter.lines.length, 1);
  assert.ok(diameter.label.x > 800 + 88, 'liczba za okręgiem');
});

test('bryły 1.47: na kartce – element z oknem, prostokąt z rzutu (z wymiarami), dotknięcie, przesunięcie, oznaczenie jednostki', () => {
  const solid = at('box', 'iso');
  assert.equal(isBox(solid), true);
  const box = elementBox(solid);
  assert.deepEqual(box, solidBox(solid));
  const geometry = solidGeometry(solid);
  assert.ok(box.x <= Math.min(...geometry.visible.flatMap((line) => line.points.map((p) => p.x))), 'prostokąt obejmuje bryłę');
  assert.ok(box.width > 300 && box.height > 250);
  assert.ok(touchesStroke(solid, 800, 500, 0));
  assert.ok(!touchesStroke(solid, 100, 100, 0));
  const moved = translateStroke(solid, 40, -20);
  assert.deepEqual([moved.x, moved.y], [840, 480]);
  near(strokeBounds(moved).minX - strokeBounds(solid).minX, 40);
  // Poprawiony w miejscu – rozkład liczony od nowa.
  const changed = { ...solid };
  solidGeometry(changed);
  changed.x = 900;
  near(solidBox(changed).x - box.x, 100);
  const drawing = { ...emptyDrawing(), dimStyle: 'technical', strokes: [solid] };
  assert.equal(hasMeasuredContent(drawing), true, '„Wymiary w mm” przy wymiarach bryły');
  assert.equal(hasMeasuredContent({ ...drawing, strokes: [{ ...solid, showDims: false }] }), false);
});

test('bryły 1.47: przekształcenia zaznaczenia – obrót na kartce, odbicie (w poziomie, w pionie, względem prostej), skala, styl', () => {
  const solid = at('cylinder', 'dimetric');
  assert.equal(canTurn([solid]), true, 'bryła się obraca (nie stoi prosto)');
  // Obrót o 30° zgodnie ze wskazówkami zegara wokół jej środka: obrót na kartce −30°, środek w miejscu.
  const turned = rotateStroke(solid, 800, 500, Math.PI / 6);
  assert.deepEqual(solidAngles(turned.q), { yaw: 20.7, pitch: 19.5, roll: -30 });
  assert.deepEqual([turned.x, turned.y], [800, 500]);
  // Wokół innego punktu – środek obrócony.
  const around = rotateStroke(solid, 700, 500, Math.PI / 2);
  near(around.x, 700);
  near(around.y, 600);
  // Rzut obróconej bryły – obrócony rzut (prostokąt granic krawędzi zamienia szerokość z wysokością przy 90°).
  const upright = at('cylinder', 'front');
  const lying = rotateStroke(upright, 800, 500, Math.PI / 2);
  near(span(solidGeometry(lying).visible).width, 220, 0.5);
  near(span(solidGeometry(lying).visible).height, 176, 0.5);
  // Odbicie w poziomie: kąty z przeciwnym znakiem, rzut lustrzany względem osi.
  const mirrored = mirrorStroke(rotateStroke(solid, 800, 500, Math.PI / 12), 'horizontal', 1000);
  assert.deepEqual(solidAngles(mirrored.q), { yaw: -20.7, pitch: 19.5, roll: 15 });
  assert.equal(mirrored.x, 1200);
  const original = span(solidGeometry(solid).visible);
  near(span(solidGeometry(mirrorStroke(solid, 'horizontal', 800)).visible).width, original.width, 0.5);
  const before = solidGeometry(solid).visible.flatMap((line) => line.points);
  const after = solidGeometry(mirrorStroke(solid, 'horizontal', 800)).visible.flatMap((line) => line.points);
  near(Math.max(...after.map((p) => p.x)), 1600 - Math.min(...before.map((p) => p.x)), 0.5);
  // Dwa odbicia – to samo położenie; w pionie – góra z dołem.
  sameTurn(mirrorStroke(mirrorStroke(solid, 'vertical', 500), 'vertical', 500).q, solid.q);
  const flipped = solidGeometry(mirrorStroke(solid, 'vertical', 500)).visible.flatMap((line) => line.points);
  near(Math.max(...flipped.map((p) => p.y)), 1000 - Math.min(...before.map((p) => p.y)), 0.5);
  // Względem prostej (od 1.41): pozioma prosta – jak w pionie.
  sameTurn(mirrorAcross(solid, { x: 0, y: 500 }, { x: 100, y: 500 }).q, mirrorStroke(solid, 'vertical', 500).q);
  // Skala: wymiary razy współczynnik (liczba boków bez zmian), środek – od punktu.
  const prism = at('prism', 'iso');
  const bigger = scaleStroke(prism, 0, 0, 2);
  assert.deepEqual(bigger.dims, { n: 6, d: 352, h: 220 });
  assert.deepEqual([bigger.x, bigger.y], [1600, 1000]);
  // Styl jak kształt: kolor i grubość linii.
  const styled = withStyleOf(solid, { tool: 'shape', shape: 'rect', color: '#d70015', size: 4, x: 0, y: 0, w: 10, h: 10, angle: 0 });
  assert.equal(styled.color, '#d70015');
  assert.equal(styled.size, 4);
});

test('bryły 1.47: rysunek – zapis (format 18), DXF: krawędzie, linie przerywane i osiowe, wymiary; grupa Bryły', () => {
  assert.equal(DRAWING_VERSION, 18);
  const drawing = { ...emptyDrawing(), dimStyle: 'technical', strokes: [at('box', 'iso'), at('cylinder', 'front', { edges: 'all' }), at('sphere', 'iso', { color: '#d70015' })] };
  const clean = cleanDrawing(drawing);
  assert.equal(clean.strokes.length, 3);
  assert.deepEqual(clean.strokes.map((stroke) => stroke.kind), ['box', 'cylinder', 'sphere']);
  const exported = drawingToDxf(clean);
  assert.equal(exported.skipped, 0);
  const parsed = parseDxf(exported.text);
  const texts = parsed.entities.filter((item) => item.type === 'TEXT').map((item) => item.first(1));
  // Prostopadłościan 60 × 40 × 30, walec – wysokość 50 i ⌀40 (w DXF znak średnicy %%c), kula – S⌀40.
  for (const value of ['60', '40', '30', '50', '%%c40', 'S%%c40']) assert.ok(texts.includes(value), `${value} w ${texts}`);
  assert.ok(parsed.entities.some((item) => item.linetype === 'DASHED'), 'niewidoczne prostopadłościanu');
  assert.ok(parsed.entities.some((item) => item.linetype === 'CENTER'), 'osie walca i kuli');
  // Walec z „widocznymi” niewidocznymi – bez DASHED tylko dla niego: rysunek z samym walcem.
  const plain = parseDxf(drawingToDxf(cleanDrawing({ ...emptyDrawing(), strokes: [at('cylinder', 'front', { edges: 'all', axes: false })] })).text);
  assert.ok(!plain.entities.some((item) => item.linetype === 'DASHED'));
  // Grupa Bryły na końcu kółka, polecenia z nazwami.
  assert.equal(TOOL_GROUPS.at(-1).id, 'solids');
  assert.deepEqual(TOOL_GROUPS.at(-1).items, SOLID_ITEMS);
  assert.deepEqual(SOLID_ITEMS.map(itemLabel), ['Prostopadłościan', 'Walec', 'Stożek', 'Ostrosłup', 'Graniastosłup', 'Kula']);
  // Macierz obrotu – ortonormalna.
  const m = quatMatrix(viewQuat('dimetric'));
  near(m[0] * m[0] + m[3] * m[3] + m[6] * m[6], 1, 1e-9);
  near(m[0] * m[1] + m[3] * m[4] + m[6] * m[7], 0, 1e-9);
});
