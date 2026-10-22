// Rysunek 1.34: okrąg ze środka, z dwóch i trzech punktów, łuk przez trzy punkty, narzędzie „Wymiar”
// (liniowy ze stroną, średnica, promień, kąt), przyciąganie do środka okręgu i łuku, zestaw Metrologia z wymiarem.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attachPoint, findSnap, keepLinks, resolveAttachments } from '../../js/core/attach.js';
import { cleanToolSettings, defaultToolSettings, dimensionParts } from '../../js/core/drawing.js';
import {
  angleDimDegrees, angleDimFromPoints, arcFromPoints, arcGeometry, arcSamples, canDash, canFill, circleFromPoints, circleThrough, cleanShape, dimFromPoints,
  dimAwayFrom, dimGeometry, dimKeys, dimOffsetAt, isMeasure, isPoly, isSegment, moveShapeHandle, shapeBounds, shapeFromDrag, shapeHandles, shapeOutline,
  shapePath, shownDims, stackDimOffset, touchesShape
} from '../../js/core/shapes.js';
import { PRESETS, TOOL_GROUPS, cleanToolGroups, findGroup } from '../../js/core/tool-ring.js';

const style = { color: '#1d1d1f', size: 3, fill: 'none', caps: {} };
const isColor = (value) => /^#[0-9a-f]{6}$/i.test(value ?? '');
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);

test('rysunek 1.34: okrąg – środek i promień, dwa punkty (średnica), trzy punkty; punkty na jednej prostej – bez okręgu', () => {
  const center = shapeFromDrag('ellipse', { x: 400, y: 300 }, { x: 488, y: 300 }, style, { mode: 'center' });
  assert.deepEqual([center.shape, center.x, center.y, center.w, center.h], ['ellipse', 400, 300, 176, 176]);
  const two = shapeFromDrag('ellipse', { x: 700, y: 300 }, { x: 876, y: 300 }, style, { mode: 'two' });
  assert.deepEqual([two.x, two.y, two.w, two.h], [788, 300, 176, 176]);
  const tap = shapeFromDrag('ellipse', { x: 100, y: 100 }, { x: 101, y: 100 }, style, { mode: 'center' });
  assert.deepEqual([tap.x, tap.y, tap.w], [100, 100, 176], 'dotknięcie – okrąg domyślnej wielkości');
  const frame = shapeFromDrag('ellipse', { x: 0, y: 0 }, { x: 300, y: 100 }, style);
  assert.deepEqual([frame.w, frame.h], [300, 100], 'ramka – jak dotąd');
  const circle = circleThrough({ x: 1000, y: 300 }, { x: 1176, y: 300 }, { x: 1088, y: 388 });
  near(circle.x, 1088);
  near(circle.y, 300);
  near(circle.r, 88);
  const three = circleFromPoints({ x: 1000, y: 300 }, { x: 1176, y: 300 }, { x: 1088, y: 388 }, { ...style, fill: 'light', dash: 'dashed' });
  assert.deepEqual([three.x, three.y, three.w, three.h, three.fill, three.dash], [1088, 300, 176, 176, 'light', 'dashed']);
  assert.equal(circleThrough({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0.2 }), null, 'na jednej prostej');
  assert.equal(circleFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 50, y: 9 }, style), null, 'punkty się pokrywają');
});

test('rysunek 1.34: łuk przez trzy punkty – geometria, krzywe Béziera na okręgu, punkt pośredni w połowie łuku, zapis, uchwyty', () => {
  const arc = arcFromPoints({ x: 300, y: 700 }, { x: 476, y: 700 }, { x: 388, y: 612 }, { ...style, dash: 'center' });
  assert.equal(arc.shape, 'arc');
  assert.equal(arc.dash, 'center');
  assert.equal(isPoly(arc), true);
  const geometry = arcGeometry(arc);
  near(geometry.center.x, 388, 1e-3);
  near(geometry.center.y, 700, 1e-3);
  near(geometry.radius, 88, 1e-3);
  near(Math.abs(geometry.sweep), Math.PI, 1e-6);
  // Łuk przechodzi przez punkt pośredni – nad cięciwą, nie pod nią.
  const samples = arcSamples(arc);
  assert.ok(samples.every((point) => point.y <= 700 + 1e-6), 'łuk nad cięciwą');
  assert.ok(samples.some((point) => Math.abs(point.x - 388) < 1 && Math.abs(point.y - 612) < 1), 'przez punkt pośredni');
  // Krzywe Béziera: środek każdej leży na okręgu.
  const path = shapePath(arc);
  assert.equal(path.curves.length, 2, 'półokrąg – dwie ćwiartki');
  let from = path.start;
  for (const [c1, c2, to] of path.curves) {
    const mid = { x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8, y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8 };
    near(Math.hypot(mid.x - 388, mid.y - 700), 88, 0.05);
    from = to;
  }
  // Punkt pośredni zapisany w połowie łuku (tam jest uchwyt), także gdy dotknięty gdzie indziej.
  const skewed = arcFromPoints({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 30, y: -60 }, style);
  const handles = shapeHandles(skewed, 30).filter((handle) => handle.kind === 'vertex');
  assert.equal(handles.length, 3);
  near(handles[1].x, 100, 0.05);
  assert.equal(canFill(arc), false);
  assert.equal(canDash(arc), true);
  assert.deepEqual(dimKeys(arc), []);
  // Przesunięty punkt – łuk przez nowy punkt.
  const moved = moveShapeHandle(arc, 'v1', { x: 388, y: 650 });
  assert.ok(arcGeometry(moved).radius > 88, 'płaski łuk – większy promień');
  // Zapis: dokładnie trzy wierzchołki.
  assert.equal(cleanShape(arc, 1600, 1100, isColor).nodes.length, 6);
  assert.equal(cleanShape({ ...arc, nodes: [0, 0, 0.5, 0.5] }, 1600, 1100, isColor), null);
  // Obrys i granice z łuku (nie z całego okręgu).
  const bounds = shapeBounds(arc);
  assert.ok(bounds.maxY < 705 && bounds.minY < 615, JSON.stringify(bounds));
  assert.equal(touchesShape(arc, 388, 612, 3), true);
  assert.equal(touchesShape(arc, 388, 788, 3), false);
});

test('rysunek 1.34: wymiar liniowy – mierzone punkty jak odcinek, linia wymiarowa po stronie znaku odsunięcia, przeciąganie na drugą stronę, piętra', () => {
  const dim = dimFromPoints('linear', { x: 400, y: 532 }, { x: 576, y: 532 }, style);
  assert.deepEqual([dim.shape, dim.w, dim.dims, dim.dimOffsets.length], ['dim', 176, ['length'], 40]);
  assert.equal(isSegment(dim), true);
  assert.equal(isMeasure(dim), true);
  assert.deepEqual(shownDims(dim), ['length']);
  assert.equal(canDash(dim), false);
  // Dodatnie odsunięcie – „nad” kierunkiem od początku do końca (w lewo do prawa – w górę strony).
  const above = dimGeometry(dim, 'length');
  near(above.from.y, 492);
  near(above.to.x, 576);
  assert.equal(above.ext.length, 2);
  // Od środka prostokąta pod krawędzią – na zewnątrz (w dół).
  const below = dimAwayFrom(dim, { x: 488, y: 466 });
  assert.equal(below.dimOffsets.length, -40);
  near(dimGeometry(below, 'length').from.y, 572);
  // Przeciągnięcie liczby pod spód – odsunięcie ujemne, nad – dodatnie.
  assert.ok(dimOffsetAt(dim, 'length', { x: 488, y: 620 }) < 0);
  assert.ok(dimOffsetAt(dim, 'length', { x: 488, y: 440 }) > 0);
  // Piętro dalej po swojej stronie.
  assert.equal(stackDimOffset([below], below, 'length', -40), -40, 'ten sam wymiar się nie liczy');
  const second = dimAwayFrom(dimFromPoints('linear', { x: 420, y: 532 }, { x: 560, y: 532 }, style), { x: 488, y: 466 });
  assert.equal(stackDimOffset([below], second, 'length', -40), -76);
  // Liczba – długość w skali rysunku; tylko widoczna linia (nie mierzone punkty) jest dotykiem wymiaru.
  assert.equal(dimensionParts(dim, 'length', { value: 1, unit: 'cm' }).main, '4 cm');
  assert.equal(touchesShape(below, 488, 532, 3), false, 'mierzona krawędź – nie wymiar');
  assert.equal(touchesShape(below, 488, 572, 3), true, 'linia wymiarowa');
  // Zapis: odsunięcie ze znakiem, zawsze widoczny wymiar, bez tekstu na kształcie.
  const clean = cleanShape({ ...below, dims: [], label: { text: 'x', size: 20, color: '#000000', width: 10, height: 10 } }, 1600, 1100, isColor);
  assert.deepEqual([clean.dims, clean.dimOffsets.length, 'label' in clean], [['length'], -40, false]);
});

test('rysunek 1.34: średnica i promień – znak ⌀ i R, linia na mierzonych punktach, promień z jednym grotem; wymiar kąta – mniejszy kąt, łuk wokół wierzchołka', () => {
  const diameter = dimFromPoints('diameter', { x: 912, y: 466 }, { x: 1088, y: 466 }, style);
  assert.deepEqual([diameter.mode, diameter.dimTols.length.prefix], ['diameter', '⌀']);
  const line = dimGeometry(diameter, 'length');
  assert.deepEqual([line.ext.length, line.arrows], [0, 'both']);
  near(line.from.x, 912);
  assert.equal(dimensionParts(diameter, 'length', { value: 1, unit: 'cm' }).main, '⌀4 cm');
  const radius = dimFromPoints('radius', { x: 1000, y: 466 }, { x: 1000, y: 378 }, style);
  assert.deepEqual([radius.mode, dimGeometry(radius, 'length').arrows], ['radius', 'end']);
  assert.equal(dimensionParts(radius, 'length', { value: 1, unit: 'cm' }).main, 'R2 cm');
  assert.equal(cleanShape(radius, 1600, 1100, isColor).mode, 'radius');
  assert.equal('mode' in cleanShape(dimFromPoints('linear', { x: 0, y: 0 }, { x: 50, y: 0 }, style), 1600, 1100, isColor), false);

  const angle = angleDimFromPoints({ x: 400, y: 532 }, { x: 520, y: 532 }, { x: 400, y: 440 }, style);
  assert.deepEqual([angle.shape, angle.dims], ['angledim', ['angle']]);
  near(angleDimDegrees(angle), 90);
  assert.equal(dimensionParts(angle, 'angle', { value: 1, unit: 'cm' }).main, '90°');
  const arc = dimGeometry(angle, 'angle');
  assert.equal(arc.kind, 'angle');
  near(arc.radius, 46, 1e-6);
  near(Math.abs(arc.sweep), Math.PI / 2);
  // Kąt rozwarty – mniejszy z kątów (135°), linie pomocnicze, gdy łuk dalej niż punkty ramion.
  const wide = angleDimFromPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -10, y: -10 }, style);
  near(angleDimDegrees(wide), 135, 1e-6);
  assert.equal(dimGeometry(wide, 'angle').exts.length, 2);
  // Uchwyty – tylko wierzchołek i ramiona; przesunięte ramię zmienia kąt.
  assert.deepEqual(shapeHandles(angle, 30).map((handle) => handle.id), ['v0', 'v1', 'v2']);
  near(angleDimDegrees(moveShapeHandle(angle, 'v2', { x: 520, y: 412 })), 45, 1e-6);
  assert.equal(angleDimFromPoints({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 50, y: 50 }, style), null, 'ramię bez długości');
  assert.equal(cleanShape(angle, 1600, 1100, isColor).nodes.length, 6);
  assert.ok(shapeOutline(angle).points.length > 4, 'obrys – łuk');
});

test('rysunek 1.34: przyciąganie do środka okręgu i łuku, przyklejony promień idzie za okręgiem; do wymiaru nic się nie przyciąga', () => {
  const circle = { ...circleFromPoints({ x: 1000, y: 300 }, { x: 1176, y: 300 }, { x: 1088, y: 388 }, style), id: 'okrag001' };
  const snap = findSnap([circle], { x: 1090, y: 303 }, 14);
  assert.deepEqual([snap.kind, snap.ref.kind, snap.x, snap.y], ['center', 'center', 1088, 300]);
  const arc = arcFromPoints({ x: 300, y: 700 }, { x: 476, y: 700 }, { x: 388, y: 612 }, style);
  const arcCenter = findSnap([arc], { x: 390, y: 698 }, 14);
  assert.equal(arcCenter.kind, 'center');
  near(arcCenter.x, 388, 0.01);
  // Promień przyklejony do środka i krawędzi – po przesunięciu okręgu idzie za nim.
  const radius = keepLinks(dimFromPoints('radius', { x: 1088, y: 300 }, { x: 1088, y: 212 }, style), {
    attach: { start: { id: 'okrag001', kind: 'center' }, end: { id: 'okrag001', kind: 'edge', angle: -Math.PI / 2 } }
  });
  assert.deepEqual(radius.attach.start, { id: 'okrag001', kind: 'center' });
  const strokes = [{ ...circle, x: 1188, w: 200, h: 200 }, radius];
  resolveAttachments(strokes);
  const moved = strokes[1];
  near(moved.x, 1188, 0.01);
  near(moved.w, 100, 0.01);
  assert.deepEqual(attachPoint(strokes[0], { kind: 'center' }), { x: 1188, y: 300 });
  // Wymiar nie jest celem przyciągania (jego mierzone punkty leżą na innych kształtach).
  assert.equal(findSnap([dimFromPoints('linear', { x: 0, y: 0 }, { x: 100, y: 0 }, style)], { x: 50, y: 0 }, 14), null);
});

test('rysunek 1.34: grupy – łuk w Kształtach, grupa Wymiary przed Symbolami, Metrologia z wymiarem (także zapisana z 1.33), ustawienia narzędzi', () => {
  assert.deepEqual(TOOL_GROUPS.map((group) => group.id), ['write', 'shapes', 'construct', 'text', 'dims', 'symbols']);
  assert.ok(findGroup('right', 'shapes').items.includes('shape:arc'));
  // Od 1.36 rodzaje wymiaru – osobne pozycje (do 1.35 jedna pozycja 'shape:dim').
  assert.deepEqual(findGroup('right', 'dims').items, ['dim:linear', 'dim:angle', 'dim:radius', 'dim:diameter']);
  assert.equal(PRESETS[0].items[0], 'dim:linear');
  // Metrologia zapisana w 1.33 (bez zmian użytkownika) dostaje wymiar; zmieniona – zostaje jak jest.
  const old = cleanToolGroups({ order: ['write', 'shapes', 'construct', 'text', 'symbols'], mine: [
    { id: 'metrology', label: 'Metrologia', icon: 'caliper', items: ['shape:line', 'shape:xline', 'shape:point', 'gdt', 'datum', 'roughness'] },
    { id: 'own-1', label: 'Moje', icon: 'star', items: ['shape:line', 'gdt'] }
  ] });
  assert.deepEqual(old.order, ['write', 'shapes', 'construct', 'text', 'dims', 'symbols'], 'Wymiary w miejscu z kolejności domyślnej');
  assert.equal(old.mine[0].items[0], 'dim:linear');
  assert.deepEqual(old.mine[1].items, ['shape:line', 'gdt']);
  const changed = cleanToolGroups({ mine: [{ id: 'metrology', label: 'Metrologia', icon: 'caliper', items: ['gdt', 'datum'] }] });
  assert.deepEqual(changed.mine[0].items, ['gdt', 'datum']);
  // Sposób rysowania okręgu i rodzaj wymiaru – zapamiętane na urządzeniu.
  assert.deepEqual([defaultToolSettings().ellipseMode, defaultToolSettings().dimMode], ['frame', 'linear']);
  const settings = cleanToolSettings({ ellipseMode: 'three', dimMode: 'angle', shape: 'arc' });
  assert.deepEqual([settings.ellipseMode, settings.dimMode, settings.shape], ['three', 'angle', 'arc']);
  assert.deepEqual([cleanToolSettings({ ellipseMode: 'spiral', dimMode: 'x' }).ellipseMode, cleanToolSettings({ dimMode: 'x' }).dimMode], ['frame', 'linear']);
});
