// Rysunek 1.19: zakończenia odcinka, Shift (proporcje i kąty co 15°), stałe wymiary kształtu, szyk
// liniowy i kołowy (rozwinięcie, przesunięcie, parametry, dane rysunku), wielkość szablonu wpisana
// i z narożnika, ustawienia narzędzi.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARRAY_MAX, arrayDefaults, arraySize, cleanArrayParams, expandArray, isArray, makeArray, polarRadius, polarStep, translateArray,
  withPolarRadius
} from '../../js/core/arrays.js';
import {
  DRAWING_VERSION, cleanDrawing, cleanToolSettings, defaultToolSettings, dimensionText, emptyDrawing, snapToStrokes, splitByPolygon, strokeBounds,
  strokesAt, strokesInRect, touchesStroke, translateStroke
} from '../../js/core/drawing.js';
import {
  arrowHead, cleanShape, dimKeys, dimPlaces, moveShapeHandle, segmentCap, segmentCaps, shapeBounds, shapeFromDrag, shapePath, shapePoint,
  touchesShape, withCaps, withDims
} from '../../js/core/shapes.js';
import { fitTemplate, resizeTemplateCorner, setTemplatePercent, templateCorner, templatePercent } from '../../js/core/templates.js';

const near = (actual, expected, message, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${message ?? ''} ${actual} ≠ ${expected}`);
const rect = (extra = {}) => ({ tool: 'shape', shape: 'rect', color: '#1d1d1f', size: 4, x: 200, y: 100, w: 100, h: 60, angle: 0, skew: 0, adjust: 0, ...extra });
/** Odcinek od (100, 100) do (300, 100). */
const line = (extra = {}) => ({ ...rect({ shape: 'line', w: 200, h: 0 }), ...extra });
const isColor = () => true;
const CM = { value: 1, unit: 'cm' };

test('zakończenia odcinka: domyślne (odcinek – bez, strzałka – grot), zapis tylko innych niż domyślne, kształt zakończeń, linia do podstawy trójkąta', () => {
  assert.deepEqual(segmentCaps(line()), { start: 'none', end: 'none' });
  assert.deepEqual(segmentCaps(line({ shape: 'arrow' })), { start: 'none', end: 'arrow' }, 'strzałka sprzed 1.19 – grot na końcu');
  const both = withCaps(line(), { start: 'circle', end: 'arrow' });
  assert.deepEqual([both.startCap, both.endCap], ['circle', 'arrow']);
  const plainArrow = withCaps({ ...line({ shape: 'arrow' }), endCap: 'square' }, { start: 'none', end: 'arrow' });
  assert.equal('startCap' in plainArrow || 'endCap' in plainArrow, false, 'domyślne zakończenia nie są zapisane');
  assert.equal(withCaps(line({ shape: 'arrow' }), { start: 'none', end: 'none' }).endCap, 'none', 'strzałka bez grotu – zapisane');

  // Trójkąt na końcu: ostrze w końcu odcinka, podstawa 16 jednostek wcześniej (grubość 4 → 16), linia kończy się pod trójkątem.
  const triangle = segmentCap(line({ endCap: 'triangle' }), 'end');
  assert.deepEqual(triangle.tip, { x: 300, y: 100 });
  assert.deepEqual(triangle.polygon[0], { x: 300, y: 100 });
  near(triangle.polygon[1].x, 284);
  near(triangle.polygon[1].y, 106.72);
  near(triangle.trim.x, 288);
  const path = shapePath(line({ endCap: 'triangle' }));
  assert.deepEqual(path.start, { x: 100, y: 100 });
  near(path.lines[0].x, 288, 'linia do podstawy trójkąta');
  assert.equal(path.caps.length, 1);
  assert.deepEqual(shapePath(rect({ shape: 'ellipse' })).caps, [], 'elipsa – bez zakończeń (rysowanie nie może się przerwać)');
  assert.deepEqual(shapePath(rect()).caps, []);

  // Koło na początku: środek w końcu odcinka; granice i dotknięcie obejmują koło.
  const circle = segmentCap(line({ startCap: 'circle' }), 'start');
  assert.deepEqual([circle.circle.x, circle.circle.y], [100, 100]);
  near(circle.circle.r, 5.12);
  near(shapeBounds(line({ startCap: 'circle' })).minX, 100 - 5.12 - 2);
  assert.equal(touchesShape(line({ startCap: 'square' }), 100, 104, 0.5), true, 'kwadrat na początku');
  assert.equal(touchesShape(line(), 100, 104, 0.5), false, 'bez zakończenia – za daleko od linii');
  assert.equal(segmentCap(line({ endCap: 'diamond' }), 'end').polygon.length, 4);
  assert.equal(arrowHead(line({ shape: 'arrow' })).length, 2, 'grot strzałki jak do 1.18');
  assert.deepEqual(arrowHead(line()), []);
  // Grot na początku – ramiona za początkiem (w stronę końca).
  assert.ok(arrowHead(line({ startCap: 'arrow' }), 'start').every((point) => point.x > 100));

  // Sprawdzanie danych: złe zakończenie pominięte, prostokąt ich nie ma.
  const cleaned = cleanShape(line({ startCap: 'diamond', endCap: 'bogus' }), 1600, 1100, isColor);
  assert.deepEqual([cleaned.startCap, 'endCap' in cleaned], ['diamond', false]);
  assert.equal(cleanShape(line({ shape: 'arrow', endCap: 'none' }), 1600, 1100, isColor).endCap, 'none');
  assert.equal('startCap' in cleanShape(rect({ startCap: 'circle' }), 1600, 1100, isColor), false);
  // Zaznaczanie prostokątem – koło musi być w środku.
  const capped = line({ startCap: 'circle' });
  assert.deepEqual(strokesInRect([capped], { x0: 96, y0: 80, x1: 320, y1: 120 }), [], 'koło wystaje za lewy brzeg');
  assert.deepEqual(strokesInRect([capped], { x0: 90, y0: 80, x1: 320, y1: 120 }), [0]);
});

test('Shift (proporcje): kwadrat i koło z przeciągnięcia, odcinek co 15°, narożnik bez zmiany proporcji, obrót co 15°', () => {
  const style = { color: '#0040dd', size: 3 };
  const square = shapeFromDrag('rect', { x: 0, y: 0 }, { x: 100, y: 40 }, style, { lock: true });
  assert.deepEqual([square.w, square.h, square.x, square.y], [100, 100, 50, 50]);
  const circle = shapeFromDrag('ellipse', { x: 0, y: 0 }, { x: -80, y: 30 }, style, { lock: true });
  assert.deepEqual([circle.w, circle.h, circle.x, circle.y], [80, 80, -40, 40]);
  assert.equal(shapeFromDrag('rect', { x: 0, y: 0 }, { x: 100, y: 0 }, style, { lock: true }).y, 50, 'bez ruchu w pionie – w dół');
  const degrees = (20 * Math.PI) / 180;
  const free = shapeFromDrag('line', { x: 0, y: 0 }, { x: Math.cos(degrees) * 100, y: Math.sin(degrees) * 100 }, style);
  near(free.angle, degrees, 'bez Shift – 20°');
  const snapped = shapeFromDrag('line', { x: 0, y: 0 }, { x: Math.cos(degrees) * 100, y: Math.sin(degrees) * 100 }, style, { lock: true });
  near(snapped.angle, Math.PI / 12, 'z Shift – 15°');
  assert.equal(shapeFromDrag('rect', { x: 10, y: 10 }, { x: 10, y: 10 }, style, { lock: true }).h, 176, 'dotknięcie z Shift – kwadrat');
  assert.equal(shapeFromDrag('line', { x: 0, y: 0 }, { x: 100, y: 0 }, { ...style, caps: { start: 'circle', end: 'none' } }).startCap, 'circle', 'zakończenia nowego odcinka');

  // Narożnik z Shift: większa zmiana dla obu wymiarów – 100 × 60 → 150 × 90, lewy górny narożnik zostaje.
  const resized = moveShapeHandle(rect(), 'se', { x: 300, y: 140 }, { lock: true });
  assert.deepEqual([resized.w, resized.h, resized.x, resized.y], [150, 90, 225, 115]);
  const unlocked = moveShapeHandle(rect(), 'se', { x: 300, y: 140 });
  assert.deepEqual([unlocked.w, unlocked.h], [150, 70]);
  // Koniec odcinka i obrót – co 15°.
  const end = moveShapeHandle(line(), 'end', { x: 100 + Math.cos((50 * Math.PI) / 180) * 100, y: 100 - Math.sin((50 * Math.PI) / 180) * 100 }, { lock: true });
  near(end.angle, -Math.PI / 4);
  near(shapePoint(end, -0.5, 0).x, 100, 'początek zostaje', 0.01);
  const turn = (angle) => ({ x: 200 + Math.sin(angle) * 100, y: 100 - Math.cos(angle) * 100 });
  near(moveShapeHandle(rect(), 'rotate', turn(degrees)).angle, degrees, 'bez Shift – 20°');
  near(moveShapeHandle(rect(), 'rotate', turn(degrees), { lock: true }).angle, Math.PI / 12);
});

test('stałe wymiary kształtu: klucze, kolejność, sprawdzanie, napisy w skali rysunku, miejsce i granice', () => {
  assert.deepEqual(dimKeys(rect()), ['width', 'height', 'skew']);
  assert.deepEqual(dimKeys(line()), ['length', 'angle']);
  assert.deepEqual(withDims(rect(), ['skew', 'width', 'length']).dims, ['width', 'skew'], 'kolejność i tylko pasujące');
  assert.equal('dims' in withDims(rect({ dims: ['width'] }), []), false);
  assert.deepEqual(cleanShape(rect({ dims: ['height', 'bogus', 'height'] }), 1600, 1100, isColor).dims, ['height']);
  assert.equal('dims' in cleanShape(rect({ dims: 'width' }), 1600, 1100, isColor), false);

  assert.equal(dimensionText(rect({ w: 220 }), 'width', CM), '5 cm');
  assert.equal(dimensionText(rect({ h: 132 }), 'height', { value: 0.5, unit: 'm' }), '1,5 m');
  assert.equal(dimensionText(rect({ skew: Math.tan((15 * Math.PI) / 180) }), 'skew', CM), '15°');
  assert.equal(dimensionText(line({ w: 176, angle: -Math.PI / 6 }), 'length', CM), '4 cm');
  assert.equal(dimensionText(line({ w: 176, angle: -Math.PI / 6 }), 'angle', CM), '30°');

  // Szerokość – pod środkiem dolnej linii; wysokość – przy prawej.
  const places = dimPlaces(rect());
  assert.deepEqual(places.width.point, { x: 200, y: 130 });
  assert.deepEqual(places.width.normal.map((value) => value + 0), [0, 1]);
  assert.deepEqual(places.height.point, { x: 250, y: 100 });
  assert.ok(shapeBounds(rect({ dims: ['width'] })).maxY > shapeBounds(rect()).maxY + 30, 'napis wymiaru w granicach kształtu');
});

test('szyk liniowy: kopie w rzędach, przesunięcie całego szyku, granice, trafienie, zaznaczanie, przyciąganie linijki', () => {
  const pen = { tool: 'pen', color: '#1d1d1f', points: [100, 100, 2, 120, 100, 2] };
  const text = { tool: 'text', color: '#d70015', x: 90, y: 110, size: 28, text: 'A', maxWidth: 400, width: 20, height: 35 };
  const array = makeArray([pen, text], { kind: 'linear', columns: 3, rows: 2, dx: 50, dy: 40 }, 6400);
  assert.equal(isArray(array), true);
  assert.equal(arraySize(array), 6);
  const copies = expandArray(array);
  assert.equal(copies.length, 12);
  assert.equal(copies[0], pen, 'pierwsza kopia to źródło');
  assert.deepEqual(copies.at(-2).points, [200, 140, 2, 220, 140, 2]);
  assert.deepEqual([copies.at(-1).x, copies.at(-1).y], [190, 150]);
  assert.equal(expandArray(array), copies, 'rozwinięcie zapamiętane');

  const bounds = strokeBounds(array);
  assert.deepEqual([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY], [90, 99, 221, 185], 'pole tekstowe od x = 90, kreska z grubością');
  assert.equal(touchesStroke(array, 210, 140, 1), true, 'ostatnia kopia kreski');
  assert.equal(touchesStroke(array, 130, 125, 1), false, 'między kopiami');
  assert.deepEqual(strokesAt([pen, array], 210, 140, 1), [1]);
  assert.deepEqual(strokesInRect([array], { x0: 80, y0: 90, x1: 230, y1: 190 }), [0]);
  assert.deepEqual(strokesInRect([array], { x0: 80, y0: 90, x1: 180, y1: 190 }), [], 'szyk tylko w całości');
  assert.equal(splitByPolygon(array, [80, 90, 180, 90, 180, 190, 80, 190]), null, 'fragment szyku nie zaznacza się');
  assert.deepEqual(splitByPolygon(array, [80, 90, 230, 90, 230, 190, 80, 190]).inside, [array]);
  const moved = translateStroke(array, 10, -5);
  assert.deepEqual(moved.items[0].points, [110, 95, 2, 130, 95, 2]);
  assert.equal(array.items[0].points[0], 100, 'oryginał bez zmian');
  const snap = snapToStrokes([array], 205, 147, 10);
  assert.deepEqual([snap.kind, Math.round(snap.x), Math.round(snap.y)], ['line', 205, 140], 'zero linijki przyskakuje do kopii');

  const defaults = arrayDefaults([pen], 'linear', 44);
  assert.deepEqual([defaults.columns, defaults.rows, defaults.dx], [3, 1, 42], 'odstęp: szerokość + pół kratki');
});

test('szyk kołowy: obiekty wokół środka (przeciwnie do wskazówek zegara), obrót albo prosto, łuk, pierścienie, promień, przesunięcie', () => {
  const box = { tool: 'shape', shape: 'rect', color: '#1d1d1f', size: 2, x: 100, y: 0, w: 20, h: 10, angle: 0, skew: 0, adjust: 0 };
  const label = { tool: 'text', color: '#1d1d1f', x: 90, y: -10, size: 28, text: 'B', maxWidth: 400, width: 20, height: 20 };
  const params = { kind: 'polar', count: 4, sweep: 360, rings: 1, ringStep: 0, cx: 100, cy: 100, rotate: true };
  const array = makeArray([box], params, 6400);
  assert.equal(polarStep(array), 90);
  assert.equal(polarRadius(array), 100);
  const copies = expandArray(array);
  assert.equal(copies.length, 4);
  // Druga kopia – 90° przeciwnie do ruchu wskazówek zegara: na lewo od środka, obrócona.
  near(copies[1].x, 0);
  near(copies[1].y, 100);
  near(copies[1].angle, -Math.PI / 2);
  near(copies[2].y, 200, 'trzecia – pod środkiem');
  const upright = expandArray(makeArray([box, label], { ...params, rotate: false }, 6400));
  near(upright[2].angle, 0, 'bez obrotu – kształt prosto');
  near(upright[3].x, -10, 'pole tekstowe – środek na okręgu');
  near(upright[3].y, 90);
  const arc = expandArray(makeArray([box], { ...params, count: 3, sweep: 90 }, 6400));
  near(arc[2].x, 0, 'łuk 90°: ostatnia na lewo');
  near(arc[1].angle, -Math.PI / 4);
  const rings = expandArray(makeArray([box], { ...params, rings: 2, ringStep: 50 }, 6400));
  assert.equal(rings.length, 8);
  near(rings[4].y, -50, 'drugi pierścień dalej od środka');

  const moved = translateArray(array, 10, 20);
  assert.deepEqual([moved.cx, moved.cy, moved.items[0].x, moved.items[0].y], [110, 120, 110, 20]);
  const wider = withPolarRadius(array, 150);
  assert.deepEqual([wider.cx, wider.cy], [100, 150], 'środek dalej na tej samej prostej');
  const defaults = arrayDefaults([box], 'polar', 44);
  assert.equal(defaults.cx, 100);
  assert.ok(defaults.cy > 0, 'domyślnie środek pod źródłem');
});

test('szyk: parametry w granicach (najwyżej 400 kopii), bez szyku w szyku, dane rysunku – sprawdzanie, wersja formatu, zapis bez zmian', () => {
  assert.equal(ARRAY_MAX, 400);
  assert.deepEqual(cleanArrayParams({ kind: 'linear', columns: 500, rows: 9, dx: 'x', dy: 1e9 }, 6400), { kind: 'linear', columns: 400, rows: 1, dx: 0, dy: 6400 });
  assert.equal(cleanArrayParams({ kind: 'linear', columns: 100, rows: 10 }, 6400).rows, 4);
  const polar = cleanArrayParams({ kind: 'polar', count: 0, sweep: 400, rings: 2.6, ringStep: -30, cx: 5, cy: 6 }, 6400);
  assert.deepEqual(polar, { kind: 'polar', count: 1, sweep: 360, rings: 3, ringStep: 30, cx: 5, cy: 6, rotate: true });
  assert.equal(cleanArrayParams({ kind: 'spiral' }, 6400), null);
  const pen = { tool: 'pen', color: '#1d1d1f', points: [100, 100, 2, 120, 100, 2] };
  const inner = makeArray([pen], { kind: 'linear', columns: 2, rows: 1, dx: 30, dy: 0 }, 6400);
  assert.deepEqual(makeArray([inner, pen], { kind: 'linear', columns: 2 }, 6400).items, [pen], 'szyk w szyku pominięty');
  assert.equal(makeArray([inner], { kind: 'linear' }, 6400), null);

  const drawing = {
    ...emptyDrawing(),
    strokes: [
      { tool: 'array', kind: 'linear', columns: 2, rows: 1, dx: 30, dy: 0, items: [pen, { tool: 'pen', color: 'red', points: [] }, inner] },
      { tool: 'array', kind: 'polar', count: 3, sweep: 360, rings: 1, ringStep: 0, cx: 400, cy: 400, rotate: false, items: [line({ endCap: 'circle', dims: ['length'] })] },
      { tool: 'array', kind: 'linear', items: [] }
    ]
  };
  const cleaned = cleanDrawing(JSON.parse(JSON.stringify(drawing)));
  assert.equal(DRAWING_VERSION, 17, 'od 1.45 – schematy procesów; 1.44 – diagramy jakości i układ kartki; 1.42 – wymiar długości łuku, kierunek wymiaru, osie okręgu; 1.41 – ramka rysunkowa; 1.40 – wielokąt foremny, półprosta, narożniki, kreskowanie (1.38 – wymiary graniczne, rodzaj wymiaru, ramka z drugim wierszem, odnośnik (1.36 – warstwy i sygnatury elementów, 1.25 – jednostka liczb wymiarów, tolerancje w mm, odchyłki w ramce, 1.24 – łamana i wielokąt, 1.22.1 – wymiary techniczne i symbole, 1.22 – przyklejone końce, 1.21 – tabele i karteczki)');
  assert.equal(cleaned.version, DRAWING_VERSION);
  assert.equal(cleaned.strokes.length, 2, 'pusty szyk pominięty');
  assert.deepEqual(cleaned.strokes[0].items, [pen], 'zła kreska i szyk w szyku pominięte');
  assert.equal(cleaned.strokes[1].rotate, false);
  assert.deepEqual([cleaned.strokes[1].items[0].endCap, cleaned.strokes[1].items[0].dims], ['circle', ['length']]);
  assert.deepEqual(cleanDrawing(JSON.parse(JSON.stringify(cleaned))), cleaned, 'zapis i odczyt bez zmian');
});

test('szablon 1.19: wielkość wpisana w procentach (wokół środka) i przeciągnięcie narożnika (przeciwny zostaje, proporcje też)', () => {
  const fitted = fitTemplate({ source: 'pitch', level: 2 }, 1600, 1100);
  near(templatePercent(fitted, 1600, 1100), 100);
  const smaller = setTemplatePercent(fitted, 87.5, 1600, 1100);
  near(templatePercent(smaller, 1600, 1100), 87.5, 'procent', 0.1);
  near(smaller.x + smaller.w / 2, fitted.x + fitted.w / 2, 'środek', 0.1);
  const corner = templateCorner(fitted, 'se');
  const dragged = resizeTemplateCorner(fitted, 'se', { x: corner.x - fitted.w * 0.25, y: corner.y - fitted.h * 0.25 }, 1600, 1100);
  assert.deepEqual([dragged.x, dragged.y], [fitted.x, fitted.y], 'lewy górny narożnik zostaje');
  near(dragged.w / dragged.h, fitted.w / fitted.h, 'proporcje', 0.01);
  near(dragged.w, fitted.w * 0.75, 'szerokość', 0.1);
  const fromTop = resizeTemplateCorner(fitted, 'nw', { x: fitted.x - 100, y: fitted.y }, 1600, 1100);
  near(fromTop.x + fromTop.w, fitted.x + fitted.w, 'prawy dolny zostaje', 0.1);
  near(fromTop.y + fromTop.h, fitted.y + fitted.h, 'prawy dolny zostaje', 0.1);
  const tiny = resizeTemplateCorner(fitted, 'se', { x: fitted.x, y: fitted.y }, 1600, 1100);
  near(Math.max(tiny.w, tiny.h), 1600 / 20, 'najmniej 1/20 strony', 0.2);
});

test('ustawienia narzędzi 1.19: proporcje, zakończenia nowych odcinków i strzałek, rodzaj szyku', () => {
  const base = defaultToolSettings();
  assert.deepEqual([base.shapeLock, base.lineCaps, base.arrowCaps, base.arrayKind], [false, { start: 'none', end: 'none' }, { start: 'none', end: 'arrow' }, 'linear']);
  const clean = cleanToolSettings({ shapeLock: true, lineCaps: { start: 'circle', end: 'bogus' }, arrowCaps: 'x', arrayKind: 'polar' });
  assert.deepEqual([clean.shapeLock, clean.lineCaps, clean.arrowCaps, clean.arrayKind], [true, { start: 'circle', end: 'none' }, { start: 'none', end: 'arrow' }, 'polar']);
  assert.equal(cleanToolSettings({ arrayKind: 'spiral', shapeLock: 'yes' }).arrayKind, 'linear');
  assert.equal(cleanToolSettings({ shapeLock: 'yes' }).shapeLock, false);
});
