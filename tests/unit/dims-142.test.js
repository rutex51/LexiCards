// Rysunek 1.42 (zaległości pakietów A i B planu „rysunek jak w CAD”): przyciąganie do środka kształtu,
// środka boku, przecięć i kresek pióra; wymiar poziomy i pionowy; wymiar długości łuku; łuk ze środka,
// początku i końca; osie okręgu; arkusz A4 pionowo; ustawienia narzędzi.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attachPoint, findSnap, snapNormal } from '../../js/core/attach.js';
import {
  DRAWING_VERSION, cleanDrawing, cleanToolSettings, defaultToolSettings, dimensionText, emptyDrawing, hasMeasuredContent
} from '../../js/core/drawing.js';
import { drawingToDxf, dxfText, parseDxf } from '../../js/core/dxf.js';
import {
  AXES_OVER, arcDimFromArc, arcDimLength, arcFromCenter, arcGeometry, circleShape, cleanShape, dimAxis, dimFromPoints, dimGeometry, dimKeys,
  dimOffsetAt, isLengthKey, measuredLength, shapeAxes, shapeBounds, shapeFromDrag, withAxes, withDimAxis, withDimTolerance
} from '../../js/core/shapes.js';
import { FRAME_FORMATS, cleanFrame, frameLayout, frameScaleText, frameSheet } from '../../js/core/title-block.js';

const near = (actual, expected, tolerance = 0.02) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const style = { color: '#1d1d1f', size: 2 };
const isColor = (value) => /^#[0-9a-f]{6}$/i.test(value);
const clean = (shape) => cleanShape(shape, 1600, 1100, isColor);

test('rysunek 1.42: przyciąganie – środek prostokąta i trójkąta, środek boku (idzie za kształtem), krawędź jak dotąd', () => {
  const rect = shapeFromDrag('rect', { x: 100, y: 100 }, { x: 300, y: 200 }, style);
  const center = findSnap([rect], { x: 205, y: 152 }, 12);
  assert.equal(center.kind, 'center');
  assert.deepEqual([center.x, center.y], [200, 150]);
  assert.deepEqual(center.ref, { kind: 'center' });
  // Środek boku – zapis jak miejsce na krawędzi (t = 0,5), więc koniec idzie za przesuniętym i rozciągniętym bokiem.
  const mid = findSnap([rect], { x: 198, y: 104 }, 12);
  assert.equal(mid.kind, 'mid');
  assert.deepEqual([mid.x, mid.y], [200, 100]);
  assert.deepEqual(mid.ref, { kind: 'edge', index: 0, t: 0.5 });
  const wider = { ...rect, x: 260, w: 320 };
  assert.deepEqual(attachPoint(wider, mid.ref), { x: 260, y: 100 });
  assert.deepEqual(attachPoint(wider, center.ref), { x: 260, y: 150 });
  // Daleko od punktów szczególnych – krawędź (jak od 1.22); bok skierowany na zewnątrz.
  const edge = findSnap([rect], { x: 150, y: 103 }, 12);
  assert.equal(edge.kind, 'edge');
  assert.deepEqual(edge.ref, { kind: 'edge', index: 0, t: 0.25 });
  assert.deepEqual(snapNormal(mid).map((value) => value + 0), [0, -1]);
  // Trójkąt – środek ciężkości (wierzchołek u góry: 2/3 wysokości od wierzchołka).
  const triangle = shapeFromDrag('triangle', { x: 100, y: 400 }, { x: 400, y: 700 }, style);
  const centroid = findSnap([triangle], { x: 255, y: 595 }, 30);
  assert.equal(centroid.kind, 'center');
  near(centroid.x, 250);
  near(centroid.y, 600);
  // Odcinek nie ma „środka kształtu” ani dodatkowego środka boku – środek jest wśród jego punktów (od 1.22).
  const line = shapeFromDrag('line', { x: 500, y: 100 }, { x: 700, y: 100 }, style);
  const onLine = findSnap([line], { x: 603, y: 104 }, 12);
  assert.equal(onLine.kind, 'corner');
  assert.deepEqual(onLine.ref, { kind: 'corner', index: 2 });
  // Krótki bok (do dwóch promieni) – bez środka boku.
  const small = shapeFromDrag('rect', { x: 900, y: 100 }, { x: 920, y: 120 }, style);
  assert.notEqual(findSnap([small], { x: 910, y: 101 }, 12).kind, 'mid');
});

test('rysunek 1.42: przyciąganie – przecięcie dwóch linii (zapis na krawędzi jednej z nich) i kreska pióra (bez przyklejania)', () => {
  // Odcinek y = x − 300 (od 400 do 600) i pozioma krawędź prostokąta y = 160: przecięcie (460, 160).
  const diagonal = shapeFromDrag('line', { x: 400, y: 100 }, { x: 600, y: 300 }, style);
  const rect = shapeFromDrag('rect', { x: 300, y: 160 }, { x: 700, y: 400 }, style);
  const cross = findSnap([diagonal, rect], { x: 466, y: 157 }, 12);
  assert.equal(cross.kind, 'intersection');
  near(cross.x, 460);
  near(cross.y, 160);
  assert.equal(cross.ref.kind, 'edge');
  const anchored = attachPoint(cross.target, cross.ref);
  near(anchored.x, 460, 0.05);
  near(anchored.y, 160, 0.05);
  // Bliżej narożnika niż przecięcia – narożnik.
  assert.equal(findSnap([diagonal, rect], { x: 302, y: 162 }, 12).kind, 'corner');
  // Kreska pióra: koniec (narożnik bez przyklejenia), linia (krawędź bez przyklejenia), kierunek – w górę w prawo.
  const pen = { tool: 'pen', color: '#0040dd', points: [700, 600, 2, 750, 650, 2, 800, 620, 2] };
  const end = findSnap([pen], { x: 797, y: 623 }, 12);
  assert.equal(end.kind, 'corner');
  assert.deepEqual([end.x, end.y, end.ref], [800, 620, null]);
  const along = findSnap([pen], { x: 726, y: 624 }, 12);
  assert.equal(along.kind, 'edge');
  assert.deepEqual([along.x, along.y, along.ref], [725, 625, null]);
  assert.deepEqual(snapNormal(along), [Math.SQRT1_2, -Math.SQRT1_2]);
  // Przecięcie kreski pióra z odcinkiem – zapis na odcinku (kreski się nie zapisuje).
  const stroke = { tool: 'pen', color: '#0040dd', points: [400, 250, 2, 600, 250, 2] };
  const inkCross = findSnap([stroke, diagonal], { x: 552, y: 247 }, 12);
  assert.equal(inkCross.kind, 'intersection');
  assert.equal(inkCross.target, diagonal);
  near(inkCross.x, 550);
  near(inkCross.y, 250);
  // Dwie kreski pióra – przecięcie bez przyklejenia.
  const other = { tool: 'pen', color: '#0040dd', points: [500, 200, 2, 500, 300, 2] };
  const both = findSnap([stroke, other], { x: 503, y: 253 }, 12);
  assert.equal(both.kind, 'intersection');
  assert.equal(both.ref, null);
  // Pominięte elementy (np. przesuwany odcinek) – bez przyciągania.
  assert.equal(findSnap([pen], { x: 797, y: 623 }, 12, { exclude: new Set([pen]) }), null);
});

test('rysunek 1.42: wymiar poziomy i pionowy – rzut odległości, linia za skrajnym punktem, liczba, odsunięcie, zapis', () => {
  const [a, b] = [{ x: 100, y: 100 }, { x: 300, y: 200 }];
  const horizontal = dimFromPoints('linear', a, b, { ...style, axis: 'h' });
  const vertical = dimFromPoints('linear', a, b, { ...style, axis: 'v' });
  const aligned = dimFromPoints('linear', a, b, { ...style, axis: 'aligned' });
  assert.equal(dimAxis(horizontal), 'h');
  assert.equal(dimAxis(vertical), 'v');
  assert.equal(dimAxis(aligned), null);
  assert.equal('axis' in aligned, false);
  near(measuredLength(horizontal), 200, 0.01);
  near(measuredLength(vertical), 100, 0.01);
  near(measuredLength(aligned), Math.hypot(200, 100), 0.01);
  // Kratka 44 = 1 cm: 200 → 4,55 cm, 100 → 2,27 cm.
  assert.equal(dimensionText(horizontal, 'length'), '4,55 cm');
  assert.equal(dimensionText(vertical, 'length'), '2,27 cm');
  assert.equal(dimensionText(aligned, 'length'), '5,08 cm');
  // Poziomy: linia wymiarowa pozioma 40 nad wyższym punktem (y = 100 − 40), liczba prosto.
  const top = dimGeometry(horizontal, 'length');
  near(top.from.y, 60, 0.01);
  near(top.to.y, 60, 0.01);
  near(top.from.x, 100, 0.01);
  near(top.to.x, 300, 0.01);
  assert.equal(top.text.angle, 0);
  // Pionowy: pionowa linia 40 na prawo od punktu bardziej po prawej (x = 300 + 40), liczba czytana od dołu.
  const right = dimGeometry(vertical, 'length');
  near(right.from.x, 340, 0.01);
  near(right.to.x, 340, 0.01);
  near(Math.abs(right.to.y - right.from.y), 100, 0.01);
  near(right.text.angle, -Math.PI / 2, 1e-9);
  // Odsunięcie z uchwytu: nad – dodatnie, pod – ujemne; linia przechodzi tam, gdzie uchwyt.
  assert.ok(dimOffsetAt(horizontal, 'length', { x: 200, y: 50 }) > 0);
  const below = dimOffsetAt(horizontal, 'length', { x: 200, y: 260 });
  assert.ok(below < 0);
  near(dimGeometry(horizontal, 'length', below).from.y, 200 + Math.abs(below), 0.01);
  // Zmiana kierunku z menu, zapis: tylko wymiar liniowy ma kierunek.
  assert.equal(dimAxis(withDimAxis(horizontal, 'v')), 'v');
  assert.equal('axis' in withDimAxis(horizontal, 'aligned'), false);
  const diameter = dimFromPoints('diameter', a, b, style);
  assert.equal('axis' in withDimAxis(diameter, 'h'), false);
  assert.equal(clean(horizontal).axis, 'h');
  assert.equal(clean({ ...horizontal, axis: 'x' }).axis, undefined);
  assert.equal(clean({ ...diameter, axis: 'h' }).axis, undefined);
});

test('rysunek 1.42: łuk ze środka, początku i końca – przeciwnie do wskazówek zegara, także ponad pół okręgu', () => {
  const center = { x: 500, y: 500 };
  // Ćwiartka: od prawej (600, 500) do góry (500, 400) – oś y strony w dół, więc kąt maleje.
  const quarter = arcFromCenter(center, { x: 600, y: 500 }, { x: 500, y: 400 }, style);
  const geometry = arcGeometry(quarter);
  near(geometry.center.x, 500, 0.05);
  near(geometry.center.y, 500, 0.05);
  near(geometry.radius, 100, 0.05);
  near(geometry.sweep, -Math.PI / 2, 1e-3);
  // Trzy czwarte: od prawej do dołu (przez górę i lewą stronę); koniec wyznacza tylko kierunek.
  const most = arcGeometry(arcFromCenter(center, { x: 600, y: 500 }, { x: 500, y: 900 }, style));
  near(most.radius, 100, 0.05);
  near(most.sweep, -3 * Math.PI / 2, 1e-3);
  // Nie da się: początek w środku, koniec w środku, koniec w kierunku początku.
  assert.equal(arcFromCenter(center, center, { x: 600, y: 500 }, style), null);
  assert.equal(arcFromCenter(center, { x: 600, y: 500 }, center, style), null);
  assert.equal(arcFromCenter(center, { x: 600, y: 500 }, { x: 700, y: 500 }, style), null);
  assert.equal(clean(quarter).shape, 'arc');
});

test('rysunek 1.42: wymiar długości łuku – długość, liczba z ⌒, łuk wymiarowy na zewnątrz, odsunięcie, tolerancja w mm, zapis, DXF', () => {
  const arc = arcFromCenter({ x: 500, y: 500 }, { x: 600, y: 500 }, { x: 500, y: 400 }, style);
  const dim = arcDimFromArc(arc, style);
  assert.equal(dim.shape, 'arcdim');
  assert.deepEqual(dimKeys(dim), ['arc']);
  assert.ok(isLengthKey('arc'));
  // Ćwiartka okręgu o promieniu 100: 157,08 jednostki = 3,57 cm.
  near(arcDimLength(dim), 50 * Math.PI, 0.05);
  assert.equal(dimensionText(dim, 'arc'), '⌒3,57 cm');
  const geometry = dimGeometry(dim, 'arc');
  assert.equal(geometry.kind, 'angle');
  near(geometry.radius, 140, 0.05);
  near(geometry.sweep, -Math.PI / 2, 1e-3);
  assert.equal(geometry.exts.length, 2);
  // Liczba na zewnątrz, w połowie łuku (kierunek 45° w górę w prawo).
  assert.ok(geometry.text.x > 600 && geometry.text.y < 400, 'liczba na zewnątrz łuku');
  // Uchwyt liczby dalej od środka – większe odsunięcie.
  assert.ok(dimOffsetAt(dim, 'arc', { x: 650, y: 350 }) > dimOffsetAt(dim, 'arc', { x: 600, y: 400 }));
  // Tolerancja długości łuku – w mm jak wymiaru długości.
  const toleranced = withDimTolerance(dim, 'arc', { kind: 'sym', value: 0.1 });
  assert.equal(dimensionText(toleranced, 'arc'), '⌒3,57 cm±0,01', '0,1 mm = 0,01 cm');
  // Zapis: trzy punkty, kształt bez wypełnienia; inaczej – odrzucony.
  const saved = clean(dim);
  assert.equal(saved.shape, 'arcdim');
  assert.equal(saved.nodes.length, 6);
  assert.equal(clean({ ...dim, nodes: [-0.5, 0, 0.5, 0] }), null);
  const drawing = cleanDrawing({ ...emptyDrawing(), strokes: [dim] });
  assert.equal(drawing.strokes[0].shape, 'arcdim');
  assert.ok(hasMeasuredContent(drawing), 'wymiar długości – adnotacja jednostki');
  assert.ok(shapeBounds(dim).maxX >= geometry.text.x, 'liczba w obrysie zaznaczenia');
  // DXF: łuk wymiarowy (ARC), linie pomocnicze, liczba z ⌒.
  const parsed = parseDxf(drawingToDxf(drawing).text);
  assert.ok(parsed.entities.some((item) => item.type === 'ARC'));
  const labels = parsed.entities.filter((item) => item.type === 'TEXT').map((item) => dxfText(item.first(1)));
  assert.ok(labels.some((label) => label.startsWith('⌒')), labels.join(' | '));
});

test('rysunek 1.42: osie okręgu – linie przez środek poza obrysem, obrys zaznaczenia, zapis, DXF linią osiową; kreskowanie okręgu ze środka', () => {
  const circle = circleShape({ x: 200, y: 200 }, 50, { ...style, axes: true, fill: 'hatch' });
  assert.equal(circle.axes, true);
  // Od 1.42 okrąg z punktów zachowuje kreskowanie narzędzia (w 1.40 ginęło).
  assert.equal(circle.fill, 'hatch');
  assert.ok(circle.hatch);
  const [across, down] = shapeAxes(circle);
  assert.deepEqual(across, [{ x: 200 - 50 - AXES_OVER, y: 200 }, { x: 200 + 50 + AXES_OVER, y: 200 }]);
  assert.deepEqual(down, [{ x: 200, y: 200 - 50 - AXES_OVER }, { x: 200, y: 200 + 50 + AXES_OVER }]);
  const bounds = shapeBounds(circle);
  assert.ok(bounds.minX <= 200 - 50 - AXES_OVER && bounds.maxY >= 200 + 50 + AXES_OVER, 'osie w obrysie');
  assert.deepEqual(shapeAxes(withAxes(circle, false)), []);
  assert.equal(withAxes(shapeFromDrag('rect', { x: 0, y: 0 }, { x: 100, y: 100 }, style), true).axes, undefined);
  // Okrąg z ramki z osiami narzędzia.
  assert.equal(shapeFromDrag('ellipse', { x: 300, y: 300 }, { x: 400, y: 380 }, { ...style, axes: true }).axes, true);
  assert.equal(clean(circle).axes, true);
  assert.equal(clean({ ...circle, axes: 'tak' }).axes, undefined);
  // DXF: dwie linie osi z rodzajem linii CENTER.
  const parsed = parseDxf(drawingToDxf(cleanDrawing({ ...emptyDrawing(), strokes: [withAxes(circleShape({ x: 600, y: 600 }, 80, style), true)] })).text);
  const axes = parsed.entities.filter((item) => item.type === 'LINE' && /^CENTER$/i.test(item.linetype ?? ''));
  assert.equal(axes.length, 2);
});

test('rysunek 1.42: arkusz A4 pionowo – wpasowany w kartkę, ramka i tabliczka, format „A4”, skala z kratki; ustawienia narzędzi; wersja 15', () => {
  assert.deepEqual(Object.keys(FRAME_FORMATS), ['A4', 'A4V', 'A3']);
  assert.deepEqual(cleanFrame({ format: 'A4V', title: 'Tuleja' }), { format: 'A4V', title: 'Tuleja' });
  // Kartka 1600 × 1100: arkusz 210 × 297 mm na całą wysokość, wyśrodkowany.
  const sheet = frameSheet('A4V', 1600, 1100);
  near(sheet.mm, 1100 / 297, 1e-9);
  near(sheet.height, 1100, 1e-9);
  near(sheet.x, (1600 - 210 * sheet.mm) / 2, 1e-9);
  const layout = frameLayout({ format: 'A4V' }, 1600, 1100);
  near(layout.border.x - sheet.x, 20 * sheet.mm, 1e-6);
  near(layout.border.w, 180 * sheet.mm, 1e-6);
  // Tabliczka 180 mm – na całą szerokość ramki A4 w pionie.
  near(layout.block.w, layout.border.w, 1e-6);
  near(layout.block.x, layout.border.x, 1e-6);
  assert.equal(layout.cells.find((cell) => cell.key === 'format').value, 'A4');
  assert.equal(frameScaleText('A4V', 1600, 1100), '1,19:1');
  assert.equal(cleanDrawing({ ...emptyDrawing(), frame: { format: 'A4V' } }).frame.format, 'A4V');
  // Ustawienia narzędzi: kierunek wymiaru, sposób rysowania łuku, osie nowych okręgów.
  const base = defaultToolSettings();
  assert.deepEqual([base.dimAxis, base.arcMode, base.ellipseAxes], ['aligned', 'three', false]);
  const chosen = cleanToolSettings({ dimAxis: 'v', arcMode: 'center', ellipseAxes: true, dimMode: 'arc' });
  assert.deepEqual([chosen.dimAxis, chosen.arcMode, chosen.ellipseAxes, chosen.dimMode], ['v', 'center', true, 'arc']);
  const wrong = cleanToolSettings({ dimAxis: 'x', arcMode: 'two', ellipseAxes: 1 });
  assert.deepEqual([wrong.dimAxis, wrong.arcMode, wrong.ellipseAxes], ['aligned', 'three', false]);
  assert.equal(DRAWING_VERSION >= 15, true, 'od 1.42 co najmniej 15');
});
