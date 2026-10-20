// Rysunek 1.24: figury z odręcznych kształtów (kreska przytrzymana na końcu) oraz łamana i wielokąt
// z punktami w wierzchołkach.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attachPoint, snapGeometry } from '../../js/core/attach.js';
import { cleanDrawing, cleanToolSettings, defaultToolSettings, emptyDrawing } from '../../js/core/drawing.js';
import { recognizeStroke, recognizedName } from '../../js/core/recognize.js';
import {
  canFill, cleanShape, dimKeys, dimPlaces, moveShapeHandle, polyFromPoints, polyPoints, resizeShape, shapeContains, shapeHandles, shapeOutline,
  touchesShape
} from '../../js/core/shapes.js';

const near = (actual, expected, message, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} ≠ ${expected}`);
const isColor = (value) => /^#[0-9a-f]{6}$/i.test(value ?? '');
const DEG = Math.PI / 180;
const STYLE = { color: '#1d1d1f' };

/** Odręczna kreska przez punkty [x, y]: co ok. 3 jednostki, z drżeniem (powtarzalnym), grubość 3. */
function hand(corners, { noise = 1.2, step = 3, seed = 1 } = {}) {
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const points = [];
  let drift = 0;
  for (let index = 1; index < corners.length; index += 1) {
    const [a, b] = [corners[index - 1], corners[index]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.max(1, Math.round(length / step));
    for (let k = 0; k < count; k += 1) {
      const t = k / count;
      drift = drift * 0.8 + (random() - 0.5) * noise;
      points.push(a[0] + (b[0] - a[0]) * t - ((b[1] - a[1]) / length) * drift, a[1] + (b[1] - a[1]) * t + ((b[0] - a[0]) / length) * drift, 3);
    }
  }
  points.push(...corners.at(-1), 3);
  return points;
}
const oval = (cx, cy, a, b, { angle = 0, turns = 1.03, start = 0 } = {}) => Array.from({ length: Math.round(80 * turns) + 1 }, (_, index) => {
  const t = start + (index / 80) * Math.PI * 2;
  const [x, y] = [a * Math.cos(t), b * Math.sin(t)];
  return [cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle)];
});
const recognize = (corners, options) => recognizeStroke(hand(corners, options), STYLE);

test('rozpoznawanie 1.24: odcinek (poziom, pion i 45° przyciągane), strzałka z grotem „V”, z trójkątem i grotem narysowanym najpierw, łamana', () => {
  for (const seed of [1, 2, 3]) {
    const flat = recognize([[100, 100], [400, 112]], { seed });
    assert.equal(flat.shape, 'line');
    assert.equal(flat.angle, 0, 'odchylenie 2,3° – poziomo');
    near(flat.w, 300.24, 'długość – cięciwa', 0.5);
    assert.equal(recognize([[100, 100], [300, 315]], { seed }).angle, Math.PI / 4, '47° – 45°');
    assert.equal(recognize([[200, 100], [207, 400]], { seed }).angle, Math.PI / 2, 'prawie pion – pion');
    near(recognize([[100, 100], [400, 273]], { seed }).angle, 30 * DEG, '30° zostaje', 0.01);
  }
  // Strzałka: trzon, ramię, powrót, drugie ramię – grot na końcu trzonu (600, 300), kierunek poziomy.
  const arrow = recognize([[300, 300], [600, 300], [560, 280], [600, 300], [562, 322]]);
  assert.equal(arrow.shape, 'arrow');
  assert.equal(arrow.angle, 0);
  near(arrow.x + arrow.w / 2, 600, 'grot na końcu trzonu', 3);
  assert.equal(arrow.endCap, undefined, 'domyślny grot');
  assert.equal(recognize([[300, 300], [600, 300], [560, 278], [560, 322], [600, 300]]).endCap, 'triangle', 'grot – trójkąt');
  // Grot narysowany najpierw (ramię, ostrze, drugie ramię, ostrze), potem trzon w lewo – strzałka wskazuje (400, 300).
  const first = recognize([[360, 280], [400, 300], [362, 322], [400, 300], [100, 300]]);
  assert.deepEqual([first.shape, first.angle], ['arrow', 0]);
  near(first.x + first.w / 2, 400, 'grot w miejscu ostrza', 3);
  // Łamana: wierzchołki w miejscach rogów, boki pod 53° – bez przyciągania do 45°.
  const zigzag = recognize([[100, 300], [250, 100], [400, 300], [550, 100]]);
  assert.equal(zigzag.shape, 'polyline');
  assert.equal(zigzag.nodes.length, 8);
  polyPoints(zigzag).forEach((vertex, index) => {
    const [x, y] = [[100, 300], [250, 100], [400, 300], [550, 100]][index];
    near(vertex.x, x, `wierzchołek ${index} (x)`, 4);
    near(vertex.y, y, `wierzchołek ${index} (y)`, 4);
  });
  assert.equal(recognizedName(zigzag), 'Łamana');
  // Haczyk rysika na początku (krótki) nie robi z odcinka łamanej.
  assert.equal(recognize([[96, 112], [100, 100], [400, 100]]).shape, 'line');
});

test('rozpoznawanie 1.24: trójkąt (równoramienny, prostokątny, odwrócony), prostokąt, kwadrat, romb, równoległobok, trapez, wielokąt', () => {
  const isosceles = recognize([[200, 100], [300, 270], [100, 272], [200, 100]]);
  assert.deepEqual([isosceles.shape, isosceles.angle, isosceles.adjust], ['triangle', 0, 0.5]);
  near(isosceles.w, 200, 'podstawa', 4);
  near(isosceles.h, 172, 'wysokość', 4);
  const right = recognize([[100, 100], [100, 300], [350, 300], [100, 100]]);
  assert.deepEqual([right.angle, right.adjust], [0, 0], 'kąt prosty nad lewym rogiem');
  const down = recognize([[100, 100], [300, 100], [200, 280], [100, 100]]);
  assert.equal(down.angle, Math.PI, 'wierzchołek w dół – ramka obrócona');

  for (const seed of [1, 2, 3]) {
    const rect = recognize([[100, 100], [400, 104], [398, 300], [102, 298], [100, 100]], { seed });
    assert.deepEqual([rect.shape, rect.angle, rect.skew], ['rect', 0, 0], 'kąty prawie proste – prostokąt bez obrotu');
    near(rect.w, 298, 'szerokość', 4);
    near(rect.h, 197, 'wysokość', 4);
  }
  // Zaczęty w połowie boku i z zakładką na końcu – też prostokąt.
  assert.equal(recognize([[250, 100], [400, 104], [398, 300], [102, 298], [100, 100], [250, 100], [290, 101]]).shape, 'rect');
  const square = recognize([[100, 100], [300, 100], [300, 290], [100, 300], [100, 100]]);
  assert.equal(square.w, square.h, 'prawie równe boki – kwadrat');
  assert.equal(recognizedName(square), 'Kwadrat');
  const tilted = recognize([[200, 100], [300, 200], [200, 300], [100, 200], [200, 100]]);
  assert.deepEqual([tilted.shape, tilted.angle, tilted.w === tilted.h], ['diamond', 0, true], 'kwadrat na rogu – romb');
  const rhombus = recognize([[200, 100], [260, 250], [200, 400], [140, 250], [200, 100]]);
  assert.equal(rhombus.shape, 'diamond');
  near(rhombus.w, 120, 'przekątna pozioma', 4);
  near(rhombus.h, 300, 'przekątna pionowa', 4);
  const leaning = recognize([[150, 100], [400, 100], [350, 250], [100, 250], [150, 100]]);
  assert.deepEqual([leaning.shape, leaning.angle], ['rect', 0]);
  near(leaning.skew, 1 / 3, 'pochylenie: góra o 50 w prawo na 150 wysokości', 0.02);
  assert.equal(recognizedName(leaning), 'Równoległobok');
  const trapezoid = recognize([[160, 100], [340, 100], [400, 250], [100, 250], [160, 100]]);
  assert.deepEqual([trapezoid.shape, trapezoid.angle, trapezoid.skew], ['trapezoid', 0, 0]);
  near(trapezoid.adjust, 0.2, 'wcięcie górnej podstawy', 0.02);
  const pentagon = recognize([[200, 100], [300, 170], [260, 290], [140, 290], [100, 170], [200, 100]]);
  assert.deepEqual([pentagon.shape, pentagon.nodes.length / 2], ['polygon', 5]);
  const lShape = recognize([[100, 100], [200, 100], [200, 250], [350, 250], [350, 350], [100, 350], [100, 100]]);
  assert.equal(lShape.shape, 'polygon');
  // Boki prawie poziome i pionowe – dokładnie (wierzchołki w przecięciach przyciągniętych boków).
  for (const vertex of polyPoints(lShape)) {
    assert.ok([100, 200, 350].some((x) => Math.abs(vertex.x - x) < 4) && [100, 250, 350].some((y) => Math.abs(vertex.y - y) < 4), `wierzchołek L (${vertex.x}, ${vertex.y})`);
  }
  const xs = polyPoints(lShape).map((vertex) => Math.round(vertex.x * 100) / 100);
  assert.equal(new Set(xs).size, 3, 'pionowe boki – wspólne x wierzchołków');
});

test('rozpoznawanie 1.24: okrąg, elipsa (pozioma i obrócona), niedomknięta; łuk, fala, ósemka, spirala, kropka – zostają odręczne', () => {
  const stroke = (points, options) => recognizeStroke(hand(points, options), STYLE);
  for (const seed of [1, 2]) {
    const circle = stroke(oval(250, 250, 100, 100, { turns: 1.04, start: 0.3 }), { seed, noise: 1.5 });
    assert.deepEqual([circle.shape, circle.w === circle.h, circle.angle], ['ellipse', true, 0]);
    near(circle.w, 200, 'średnica', 5);
    near(circle.x, 250, 'środek', 3);
    assert.equal(recognizedName(circle), 'Okrąg');
  }
  const wide = stroke(oval(250, 250, 150, 80));
  assert.deepEqual([wide.shape, wide.angle], ['ellipse', 0]);
  near(wide.w, 300, 'oś pozioma', 6);
  near(wide.h, 160, 'oś pionowa', 6);
  const tall = stroke(oval(250, 250, 70, 140, { start: 1 }));
  assert.ok(tall.angle === 0 && tall.h > tall.w, `pionowa elipsa bez obrotu (${tall.w} × ${tall.h})`);
  near(stroke(oval(250, 250, 150, 70, { angle: Math.PI / 6, turns: 1.05, start: 2 })).angle, Math.PI / 6, 'obrócona o 30°', 0.02);
  // Niedomknięta (koniec ok. 25° przed początkiem) – też elipsa, osie bez przechyłu.
  const open = stroke(oval(250, 250, 120, 100, { turns: 0.93, start: 0.5 }));
  assert.deepEqual([open.shape, open.angle], ['ellipse', 0]);

  assert.equal(stroke(oval(250, 250, 100, 100, { turns: 0.5 })), null, 'półokrąg');
  assert.equal(stroke(oval(250, 250, 150, 150, { turns: 0.7 })), null, 'łuk');
  assert.equal(stroke(Array.from({ length: 120 }, (_, index) => [100 + index * 3, 250 + 60 * Math.sin(index / 19)])), null, 'fala');
  assert.equal(stroke(Array.from({ length: 161 }, (_, index) => [250 + 100 * Math.sin((index * Math.PI) / 80), 250 + 80 * Math.sin((index * Math.PI) / 40)])), null, 'ósemka');
  assert.equal(stroke(Array.from({ length: 200 }, (_, index) => [250 + (20 + index * 0.6) * Math.cos(index / 12), 250 + (20 + index * 0.6) * Math.sin(index / 12)])), null, 'spirala');
  assert.equal(stroke([[100, 100], [104, 103]]), null, 'kropka');
  // Mała kreska na ekranie (przekątna poniżej 16 px) – bez rozpoznania; ta sama w powiększeniu – odcinek.
  assert.equal(recognizeStroke(hand([[100, 100], [130, 100]]), STYLE, { scale: 0.4 }), null);
  assert.equal(recognizeStroke(hand([[100, 100], [130, 100]]), STYLE, { scale: 1 }).shape, 'line');
  // Kolor pióra i grubość – mediana grubości kreski.
  const styled = recognizeStroke([100, 100, 2, 200, 101, 4, 300, 100, 4, 400, 102, 4, 500, 100, 9, 600, 101, 4, 700, 100, 4, 800, 100, 4], { color: '#0058be' });
  assert.deepEqual([styled.color, styled.size], ['#0058be', 4]);
});

test('łamana i wielokąt 1.24: wierzchołki w układzie ramki, punkty w wierzchołkach, przesunięcie wierzchołka (z przyciąganiem boku), narożnik zmienia wielkość, obrót', () => {
  const points = [{ x: 100, y: 300 }, { x: 250, y: 100 }, { x: 400, y: 300 }];
  const line = polyFromPoints('polyline', points, { x: 0, y: 0, angle: 0 }, { color: '#1d1d1f', size: 3, fill: 'solid' });
  assert.deepEqual([line.x, line.y, line.w, line.h, line.angle, line.fill], [250, 200, 300, 200, 0, undefined], 'ramka wokół wierzchołków, łamana bez wypełnienia');
  assert.deepEqual(line.nodes, [-0.5, 0.5, 0, -0.5, 0.5, 0.5]);
  polyPoints(line).forEach((vertex, index) => assert.deepEqual(vertex, points[index]));
  assert.equal(shapeOutline(line).closed, false);
  assert.equal(canFill(line), false);
  assert.equal(shapeContains(line, 250, 250), false, 'łamana nie ma wnętrza');
  assert.ok(touchesShape(line, 175, 200, 2), 'dotknięcie boku');

  const handles = shapeHandles(line, 30);
  assert.deepEqual(handles.map((handle) => handle.id), ['nw', 'ne', 'se', 'sw', 'v0', 'v1', 'v2', 'rotate'], 'narożniki, wierzchołki, obrót – bez pochylenia i środków boków');
  assert.deepEqual(handles.filter((handle) => handle.kind === 'vertex').map(({ x, y }) => [x, y]), [[100, 300], [250, 100], [400, 300]]);

  // Wierzchołek v1 w górę – ramka rośnie, pozostałe wierzchołki na miejscu.
  const raised = moveShapeHandle(line, 'v1', { x: 260, y: 40 });
  assert.deepEqual(polyPoints(raised).map(({ x, y }) => [Math.round(x), Math.round(y)]), [[100, 300], [260, 40], [400, 300]]);
  assert.equal(raised.h, 260);
  // Bok do sąsiada prawie poziomy (2°) – dokładnie poziomy.
  const level = moveShapeHandle(line, 'v2', { x: 450, y: 105 });
  near(polyPoints(level)[2].y, 100, 'przyciągnięty do poziomu', 1e-6);
  // Dwa boki przyciągnięte – wierzchołek w przecięciu (pion od v0 i poziom od v2 – kąt prosty).
  const corner = polyFromPoints('polygon', [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }], { x: 0, y: 0, angle: 0 }, { color: '#1d1d1f', size: 3, fill: 'light' });
  assert.equal(corner.fill, 'light');
  const snapped = moveShapeHandle(corner, 'v2', { x: 303, y: 296 });
  assert.deepEqual(polyPoints(snapped)[2], { x: 300, y: 300 });
  assert.equal(snapped.fill, 'light', 'wypełnienie zostaje');
  assert.ok(shapeContains(corner, 200, 200), 'wielokąt ma wnętrze');
  // Narożnik ramki: wierzchołki skalowane razem (nw zostaje… se przesunięty o 100 w prawo).
  const wider = moveShapeHandle(corner, 'se', { x: 400, y: 300 });
  assert.deepEqual(polyPoints(wider).map(({ x, y }) => [Math.round(x), Math.round(y)]), [[100, 100], [400, 100], [400, 300], [100, 300]]);
  // Obrót: ramka obraca się z wierzchołkami; przesunięcie wierzchołka obróconej figury zachowuje kąt ramki.
  const turned = moveShapeHandle(corner, 'rotate', { x: 200 + 300, y: 200 });
  near(turned.angle, Math.PI / 2, 'obrót o 90°', 1e-9);
  const turnedPoint = polyPoints(turned)[0];
  near(turnedPoint.x, 300, 'wierzchołek po obrocie (x)', 1e-6);
  near(turnedPoint.y, 100, 'wierzchołek po obrocie (y)', 1e-6);
  const dragged = moveShapeHandle(turned, 'v0', { x: 330, y: 60 });
  near(dragged.angle, Math.PI / 2, 'kąt ramki zostaje', 1e-9);
  near(polyPoints(dragged)[0].x, 330, 'przesunięty wierzchołek obróconej figury', 1e-6);

  // Wymiary: szerokość i wysokość ramki (bez pochylenia); wpisana szerokość skaluje wierzchołki.
  assert.deepEqual(dimKeys(corner), ['width', 'height']);
  assert.deepEqual(Object.keys(dimPlaces(corner)), ['width', 'height']);
  const resized = resizeShape(corner, { w: 100, skew: 20 });
  assert.deepEqual([resized.w, resized.skew], [100, 0]);
  assert.deepEqual(polyPoints(resized).map(({ x }) => x), [150, 250, 250, 150]);
});

test('łamana i wielokąt 1.24: sprawdzanie danych, przyklejanie do boków (łamana – bez boku zamykającego), ustawienie rozpoznawania', () => {
  const base = { tool: 'shape', color: '#1D1D1F', size: 3, x: 200, y: 200, w: 200, h: 100, angle: 0, skew: 1, adjust: 0.3 };
  const polygon = cleanShape({ ...base, shape: 'polygon', nodes: [-0.5, -0.5, 0.9, -0.5, 0, 0.5], fill: 'solid' }, 1600, 1100, isColor);
  assert.deepEqual([polygon.nodes, polygon.skew, polygon.adjust, polygon.fill, polygon.color], [[-0.5, -0.5, 0.5, -0.5, 0, 0.5], 0, 0, 'solid', '#1d1d1f']);
  const polyline = cleanShape({ ...base, shape: 'polyline', nodes: [-0.5, 0, 0.5, 0], fill: 'solid' }, 1600, 1100, isColor);
  assert.deepEqual([polyline.nodes.length, polyline.fill], [4, undefined], 'łamana z dwóch punktów, bez wypełnienia');
  assert.equal(cleanShape({ ...base, shape: 'polygon', nodes: [-0.5, 0, 0.5, 0] }, 1600, 1100, isColor), null, 'wielokąt – co najmniej 3 wierzchołki');
  assert.equal(cleanShape({ ...base, shape: 'polyline', nodes: [0, 0, 1] }, 1600, 1100, isColor), null, 'nieparzysta liczba');
  assert.equal(cleanShape({ ...base, shape: 'polyline', nodes: [0, 0, 'x', 1] }, 1600, 1100, isColor), null);
  assert.equal(cleanShape({ ...base, shape: 'polyline' }, 1600, 1100, isColor), null, 'bez wierzchołków');
  assert.equal(cleanShape({ ...base, shape: 'polyline', nodes: Array.from({ length: 50 }, () => 0) }, 1600, 1100, isColor), null, 'najwyżej 24 wierzchołki');
  const drawing = cleanDrawing({ ...emptyDrawing(), strokes: [{ ...base, shape: 'polyline', nodes: [-0.5, 0.5, 0, -0.5, 0.5, 0.5] }] });
  assert.equal(drawing.strokes[0].shape, 'polyline');

  // Łamana: 3 wierzchołki, 2 boki; wielokąt – boki dookoła.
  const zigzag = { ...polyline, nodes: [-0.5, 0.5, 0, -0.5, 0.5, 0.5] };
  const open = snapGeometry(zigzag);
  assert.deepEqual([open.corners.length, open.edges.length], [3, 2]);
  const closed = snapGeometry(polygon);
  assert.deepEqual([closed.corners.length, closed.edges.length], [3, 3]);
  const onEdge = attachPoint(polygon, { kind: 'edge', index: 2, t: 0.5 });
  assert.deepEqual(onEdge, { x: 150, y: 200 }, 'środek boku zamykającego (od dolnego wierzchołka do pierwszego)');
  assert.equal(attachPoint(zigzag, { kind: 'edge', index: 2, t: 0.5 }), null, 'łamana nie ma boku zamykającego');

  assert.equal(defaultToolSettings().recognize, true, 'rozpoznawanie domyślnie włączone');
  assert.equal(cleanToolSettings({ recognize: false }).recognize, false);
  assert.equal(cleanToolSettings({ recognize: 'tak' }).recognize, true);
});
