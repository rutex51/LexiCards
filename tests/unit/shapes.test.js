// Rysunek 1.15: kształty geometryczne (punkty, obrys, uchwyty – szerokość, wysokość, pochylenie,
// obrót, wierzchołek trójkąta, końce odcinka), liniuszek (najbliższa linia, linie na stronie),
// tło (poziomy jasności, szablon: boisko, dopasowanie, środek, powiększanie) i dane rysunku
// z kształtami i szablonem (sprawdzanie, zaznaczanie, gumka, kopia zapasowa z plikiem szablonu).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MIN_SHAPE, arrowHead, cleanShape, guideLinesIn, moveShapeHandle, nearestGuideLine, shapeBounds, shapeContains, shapeFromDrag,
  shapeHandles, shapeOutline, shapePoint, touchesShape
} from '../../js/core/shapes.js';
import {
  DEFAULT_TEMPLATE_LEVEL, PITCH, centerTemplate, cleanTemplate, fitTemplate, pitchScale, scaleTemplate
} from '../../js/core/templates.js';
import {
  DRAWING_VERSION, addPoint, cleanDrawing, cleanToolSettings, emptyDrawing, eraseAt, isElement, selectionBounds, snapToStrokes,
  splitByPolygon, strokesAt, strokesInPolygon, strokesInRect, translateStroke
} from '../../js/core/drawing.js';
import { createBackup, createMediaArchive, openMediaArchive, restoreBackup, restoreMedia } from '../../js/core/backup.js';
import { makeBranch, makeLibrary } from './helpers.js';

const near = (actual, expected, message, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${message ?? ''} ${actual} ≠ ${expected}`);
const rect = (extra = {}) => ({ tool: 'shape', shape: 'rect', color: '#1d1d1f', size: 4, x: 200, y: 100, w: 100, h: 60, angle: 0, skew: 0, adjust: 0, ...extra });

test('kształty: punkty z pochyleniem i obrotem, obrys, granice, trafienie linii i wnętrza, strzałka', () => {
  const plain = rect();
  assert.deepEqual(shapePoint(plain, -0.5, -0.5), { x: 150, y: 70 });
  assert.deepEqual(shapeOutline(plain).points, [150, 70, 250, 70, 250, 130, 150, 130]);
  // Pochylenie 0,5: górna krawędź 30 w prawo od środka, dolna 15 w lewo.
  const skewed = rect({ skew: 0.5 });
  assert.deepEqual(shapePoint(skewed, -0.5, -0.5), { x: 165, y: 70 });
  assert.deepEqual(shapePoint(skewed, -0.5, 0.5), { x: 135, y: 130 });
  const turned = rect({ angle: Math.PI / 2 });
  const corner = shapePoint(turned, 0.5, -0.5);
  near(corner.x, 230);
  near(corner.y, 150);
  assert.deepEqual(shapeBounds(plain), { minX: 148, minY: 68, maxX: 252, maxY: 132 });
  assert.equal(touchesShape(plain, 150, 100, 1), true, 'lewa krawędź');
  assert.equal(touchesShape(plain, 200, 100, 1), false, 'środek pustego prostokąta – nie linia');
  assert.equal(shapeContains(plain, 200, 100), true);
  assert.equal(shapeContains(plain, 260, 100), false);
  const ellipse = rect({ shape: 'ellipse' });
  assert.equal(shapeOutline(ellipse).points.length, 96);
  assert.equal(touchesShape(ellipse, 250, 100, 1), true);
  assert.equal(touchesShape(ellipse, 151, 71, 1), false, 'narożnik ramki poza elipsą');
  const triangle = rect({ shape: 'triangle', adjust: 0 });
  assert.deepEqual(shapeOutline(triangle).points, [150, 70, 250, 130, 150, 130], 'wierzchołek nad lewym narożnikiem – trójkąt prostokątny');
  const arrow = { ...rect({ shape: 'arrow', h: 0 }), w: 200 };
  const [left, right] = arrowHead(arrow);
  assert.ok(left.x < 300 && right.x < 300 && left.y !== right.y, 'grot przy końcu (300, 100), ramiona do tyłu');
  assert.equal(touchesShape(arrow, 200, 100, 0), true);
});

test('kształty: przeciągnięcie tworzy kształt (kwadrat przy prawie równych bokach, odcinek co 45°), dotknięcie – domyślna wielkość', () => {
  const style = { color: '#0040dd', size: 3 };
  const box = shapeFromDrag('rect', { x: 300, y: 200 }, { x: 100, y: 50 }, style);
  assert.deepEqual([box.x, box.y, box.w, box.h], [200, 125, 200, 150], 'od prawej dolnej do lewej górnej');
  const square = shapeFromDrag('ellipse', { x: 0, y: 0 }, { x: 100, y: 97 }, style);
  assert.deepEqual([square.w, square.h], [100, 100], 'prawie koło – koło');
  const segment = shapeFromDrag('line', { x: 0, y: 0 }, { x: 100, y: 3 }, style);
  assert.equal(segment.angle, 0, 'kąt przyciągnięty do poziomu');
  near(segment.w, Math.hypot(100, 3));
  assert.equal(segment.h, 0);
  const tap = shapeFromDrag('triangle', { x: 400, y: 400 }, { x: 401, y: 401 }, style);
  assert.deepEqual([tap.x, tap.y, tap.w, tap.h, tap.adjust], [400, 400, 176, 132, 0.5]);
  assert.deepEqual([tap.color, tap.size, tap.tool], ['#0040dd', 3, 'shape']);
});

test('kształty: punkty konstrukcyjne – narożnik i bok (wymiary, przeciwny punkt na miejscu), pochylenie, obrót, wierzchołek, końce odcinka', () => {
  const shape = rect();
  const ids = shapeHandles(shape, 30).map((handle) => handle.id);
  assert.deepEqual(ids, ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'skew', 'rotate']);
  // Prawy dolny narożnik do (300, 160): lewy górny (150, 70) zostaje.
  const resized = moveShapeHandle(shape, 'se', { x: 300, y: 160 });
  assert.deepEqual([resized.w, resized.h], [150, 90]);
  assert.deepEqual(shapePoint(resized, -0.5, -0.5), { x: 150, y: 70 });
  // Prawy bok – tylko szerokość; ruch w pionie bez znaczenia.
  const wider = moveShapeHandle(shape, 'e', { x: 290, y: 400 });
  assert.deepEqual([wider.w, wider.h, wider.y], [140, 60, 100]);
  // Za przeciwny punkt – najmniejsza wielkość, bez odwracania.
  assert.equal(moveShapeHandle(shape, 'e', { x: 0, y: 100 }).w, MIN_SHAPE);
  // Pochylenie: górna krawędź 30 w prawo, dolna na miejscu.
  const handle = shapeHandles(shape, 30).find((item) => item.id === 'skew');
  const skewed = moveShapeHandle(shape, 'skew', { x: handle.x + 30, y: handle.y });
  near(skewed.skew, 0.5);
  const bottom = shapePoint(skewed, -0.5, 0.5);
  near(bottom.x, 150);
  near(bottom.y, 130);
  near(shapePoint(skewed, -0.5, -0.5).x, 180, 'górny lewy narożnik przesunięty o 30');
  assert.equal(moveShapeHandle(skewed, 'skew', { x: handle.x + 1, y: handle.y }).skew, 0, 'blisko zera – bez pochylenia');
  // Pochylony kształt: narożnik nadal zmienia wymiary, przeciwny narożnik zostaje.
  const skewedResize = moveShapeHandle(skewed, 'nw', { x: 170, y: 40 });
  const fixed = shapePoint(skewed, 0.5, 0.5);
  const after = shapePoint(skewedResize, 0.5, 0.5);
  near(after.x, fixed.x);
  near(after.y, fixed.y);
  near(skewedResize.h, 90);
  // Obrót: uchwyt nad środkiem; przeciągnięcie w prawo od środka – 90°, blisko 15° – przyciągnięte.
  const rotated = moveShapeHandle(shape, 'rotate', { x: 400, y: 100 });
  near(rotated.angle, Math.PI / 2);
  const nearly = moveShapeHandle(shape, 'rotate', { x: 200 + Math.sin((16 * Math.PI) / 180) * 100, y: 100 - Math.cos((16 * Math.PI) / 180) * 100 });
  near(nearly.angle, Math.PI / 12, 'kąt 16° → 15°');
  // Wierzchołek trójkąta: nad prawym narożnikiem (przyciągnięty), trapez – wcięcie.
  const triangle = rect({ shape: 'triangle', adjust: 0.5 });
  assert.equal(moveShapeHandle(triangle, 'adjust', { x: 248, y: 70 }).adjust, 1);
  assert.equal(moveShapeHandle(rect({ shape: 'trapezoid', adjust: 0.25 }), 'adjust', { x: 170, y: 70 }).adjust, 0.2);
  // Odcinek: koniec przesunięty, początek zostaje; kąt blisko 45° – 45°.
  const segment = { ...rect({ shape: 'line', h: 0 }), x: 100, y: 100, w: 100 };
  const moved = moveShapeHandle(segment, 'end', { x: 152, y: 198 });
  const start = shapePoint(moved, -0.5, 0);
  // Położenie zaokrąglane do 0,01 jednostki.
  near(start.x, 50, 'początek', 0.01);
  near(start.y, 100, 'początek', 0.01);
  near(moved.angle, Math.PI / 4);
});

test('kształty w rysunku: sprawdzanie danych, zaznaczanie prostokątem i lassem, dotknięcie, gumka, przesunięcie, przyciąganie linijki', () => {
  const cleaned = cleanDrawing({
    ...emptyDrawing(),
    strokes: [
      rect({ color: '#ABCDEF', size: 99, skew: 9, angle: Math.PI * 3 }),
      rect({ shape: 'hexagon' }),
      rect({ w: 'x' }),
      rect({ shape: 'line', h: 50, skew: 1 }),
      rect({ shape: 'triangle', adjust: 7 })
    ]
  });
  assert.equal(cleaned.version, DRAWING_VERSION);
  assert.equal(DRAWING_VERSION, 3);
  assert.equal(cleaned.strokes.length, 3);
  assert.deepEqual([cleaned.strokes[0].color, cleaned.strokes[0].size, cleaned.strokes[0].skew], ['#abcdef', 40, 2.5]);
  near(cleaned.strokes[0].angle, Math.PI);
  assert.deepEqual([cleaned.strokes[1].h, cleaned.strokes[1].skew], [0, 0], 'odcinek bez wysokości i pochylenia');
  assert.equal(cleaned.strokes[2].adjust, 1);
  assert.deepEqual(cleanShape(rect(), 1600, 1100, () => true), rect());

  const shape = rect();
  const pen = { tool: 'pen', color: '#000000', points: [] };
  for (const [x, y] of [[100, 300], [200, 300]]) addPoint(pen, { x, y, w: 2 });
  const strokes = [pen, shape];
  assert.equal(isElement(shape), true);
  assert.deepEqual(strokesInRect(strokes, { x0: 140, y0: 60, x1: 260, y1: 140 }), [1], 'prostokąt wokół kształtu');
  assert.deepEqual(strokesInRect(strokes, { x0: 160, y0: 60, x1: 260, y1: 140 }), [], 'kształt wystaje');
  assert.deepEqual(strokesInPolygon(strokes, [140, 60, 260, 60, 260, 140, 140, 140]), [1]);
  assert.deepEqual(splitByPolygon(shape, [0, 0, 175, 0, 175, 200, 0, 200]), null, 'kształtu nie da się przeciąć – częściowo w obszarze');
  assert.deepEqual(strokesAt(strokes, 250, 100, 3), [1], 'dotknięcie prawej krawędzi');
  assert.deepEqual(strokesAt(strokes, 200, 100, 3), [], 'środek – nie linia');
  const copy = [...strokes];
  assert.equal(eraseAt(copy, 250, 100, 10), false, 'gumka fragmentów nie przecina kształtu');
  const moved = translateStroke(shape, 10, -5);
  assert.deepEqual([moved.x, moved.y, moved.w, moved.tool], [210, 95, 100, 'shape']);
  assert.deepEqual(selectionBounds([shape]), { minX: 148, minY: 68, maxX: 252, maxY: 132 });
  // Zero linijki przyciągane do narożnika (przecięcie krawędzi innych kształtów) i do krawędzi.
  const other = rect({ x: 250, y: 70, w: 60, h: 40 });
  const crossing = snapToStrokes([shape, other], 222, 71, 10);
  assert.equal(crossing.kind, 'crossing');
  near(crossing.x, 220);
  near(crossing.y, 70);
  const edge = snapToStrokes([shape], 100 + 52, 110, 5);
  assert.deepEqual([edge.kind, edge.x, edge.y], ['line', 150, 110]);
});

test('liniuszek: najbliższa linia (także pochylonej rodziny), linie przecinające stronę, ustawienia', () => {
  const lines = { x: 0, y: 0, angle: 0, spacing: 44 };
  const nearest = nearestGuideLine(lines, 100, 50);
  assert.deepEqual([nearest.x, nearest.y, nearest.distance, nearest.index], [100, 44, 6, 1]);
  const slanted = { x: 0, y: 0, angle: Math.PI / 4, spacing: 10 };
  const point = nearestGuideLine(slanted, 10, 0);
  near(point.distance, 10 - 10 / Math.SQRT2, 'odległość od linii o numerze −1');
  near(point.x - point.y, 10 * Math.SQRT2, 'rzut na linię o numerze −1 (y = x − 10√2)');
  assert.equal(point.index, -1);
  assert.equal(guideLinesIn(lines, 1600, 1100).length, 26, 'linie od y = 0 do y = 1100 co 44');
  assert.equal(guideLinesIn({ x: 800, y: 550, angle: Math.PI / 2, spacing: 100 }, 1600, 1100).length, 17);
  const tools = cleanToolSettings({ guide: { spacing: 0.3, angle: 200, cross: true, crossSpacing: 'x', crossAngle: 65, snap: false }, shape: 'ellipse' });
  assert.deepEqual(tools.guide, { spacing: 0.25, angle: 90, cross: true, crossSpacing: 1, crossAngle: 65, snap: false });
  assert.equal(tools.shape, 'ellipse');
  assert.equal(cleanToolSettings({ shape: 'gwiazda' }).shape, 'rect');
});

test('tło: poziomy jasności, szablon – boisko (proporcje, skala w metrach), dopasowanie, środek, powiększanie, sprawdzanie danych', () => {
  assert.equal(emptyDrawing().paperLevel, 1);
  assert.equal(cleanDrawing({ ...emptyDrawing(), paperLevel: 4 }).paperLevel, 4);
  assert.equal(cleanDrawing({ ...emptyDrawing(), paperLevel: 9 }).paperLevel, 1);
  assert.deepEqual([PITCH.width, PITCH.height], [105, 68]);
  assert.ok(PITCH.items.some((item) => item.kind === 'arc' && item.r === 9.15), 'koło środkowe');
  const pitch = fitTemplate({ source: 'pitch', level: DEFAULT_TEMPLATE_LEVEL }, 1600, 1100);
  near(pitch.w / pitch.h, 105 / 68, 'proporcje boiska');
  assert.equal(pitch.w, 1512, 'na szerokość strony z marginesem kratki');
  near(pitch.x + pitch.w / 2, 800);
  near(pitchScale(pitch), (105 * 44) / 1512, 'metry na kratkę');
  const smaller = scaleTemplate(pitch, 0.5, 1600, 1100);
  assert.deepEqual([smaller.w, smaller.x + smaller.w / 2], [756, 800], 'pomniejszenie wokół środka');
  const moved = centerTemplate({ ...smaller, x: 0, y: 0 }, 1600, 1100);
  assert.deepEqual([moved.x, moved.y], [422, 305.2]);
  const image = fitTemplate({ source: 'image', type: 'image/png', width: 400, height: 800, level: 3 }, 1600, 1100);
  assert.deepEqual([image.h, image.w], [1012, 506], 'wysoki obraz – na wysokość strony');

  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const toBytes = (value) => (value instanceof ArrayBuffer ? value : null);
  assert.deepEqual(cleanTemplate({ ...image, bytes }, 1600, 1100, toBytes).bytes, bytes);
  assert.equal(cleanTemplate({ ...image, type: 'image/svg+xml' }, 1600, 1100, toBytes), null);
  assert.equal(cleanTemplate({ ...pitch, w: 0 }, 1600, 1100, toBytes), null);
  assert.equal(cleanTemplate({ ...pitch, level: 7 }, 1600, 1100, toBytes).level, DEFAULT_TEMPLATE_LEVEL);
  const drawing = cleanDrawing({ ...emptyDrawing(), template: pitch });
  assert.deepEqual(drawing.template, { source: 'pitch', x: pitch.x, y: pitch.y, w: pitch.w, h: pitch.h, level: 2 });
  assert.equal(cleanDrawing({ ...emptyDrawing(), template: { source: 'mapa' } }).template, undefined);
});

test('kopia zapasowa: kształt, jasność tła i szablon z pliku (osobny plik w ZIP) wracają bez zmian; boisko bez pliku', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]).buffer;
  const withImage = {
    ...emptyDrawing(), paperLevel: 3, strokes: [rect({ skew: 0.4, angle: 0.3 })],
    template: { source: 'image', type: 'image/png', width: 40, height: 20, x: 10, y: 20, w: 400, h: 200, level: 4, bytes: png }
  };
  const withPitch = { ...emptyDrawing(), template: fitTemplate({ source: 'pitch', level: 1 }, 1600, 1100) };
  await library.saveNote(lesson.id, {
    html: '<p>Szablony</p>',
    images: [
      { bytes: png.slice(0), type: 'image/png', width: 1600, height: 1100, label: 'Rysunek 1', drawing: withImage },
      { bytes: png.slice(0), type: 'image/png', width: 1600, height: 1100, label: 'Rysunek 2', drawing: withPitch }
    ]
  });
  const backup = JSON.parse(JSON.stringify(await createBackup(library, 'test')));
  const archive = await createMediaArchive(library, 'test');
  const { manifest } = await openMediaArchive(archive.blob);
  assert.match(manifest.items[0].drawing.template, /^rysunki\/.+-szablon\.png$/);
  assert.equal(manifest.items[1].drawing.template, undefined, 'boisko rysuje aplikacja – bez pliku');
  const { library: fresh } = await makeLibrary();
  await restoreBackup(fresh, backup);
  await restoreMedia(fresh, archive.blob);
  const [first, second] = await fresh.noteImages(lesson.id);
  assert.equal(first.drawing.paperLevel, 3);
  assert.deepEqual(first.drawing.strokes, [rect({ skew: 0.4, angle: 0.3 })]);
  assert.deepEqual([...new Uint8Array(first.drawing.template.bytes)], [...new Uint8Array(png)]);
  assert.deepEqual({ ...first.drawing.template, bytes: null }, { ...withImage.template, bytes: null });
  assert.deepEqual(second.drawing.template, withPitch.template);
});
