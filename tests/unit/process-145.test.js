// Rysunek 1.45 (schematy procesów): kształty schematu blokowego, łącznik pod kątem prostym (przebieg, przyklejone końce),
// długość linii („spaghetti”), tory w układzie kartki, symbole i oś czasu VSM, legenda wad (koncentracja wad), DXF,
// grupa Procesy i zestaw „Procesy / VSM”, format rysunku 17.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { endPoint, resolveAttachments, snapGeometry, withLink } from '../../js/core/attach.js';
import {
  DIAGRAM_LIMITS, VSM_LABELS, VSM_SYMBOLS, cleanDiagram, defectCounts, diagramLabel, diagramLayout, formatNumber, newDiagram, timelineTotals
} from '../../js/core/diagrams.js';
import { DRAWING_VERSION, cleanDrawing, cleanToolSettings, defaultToolSettings, emptyDrawing, pathLength, pathLengthText, translateStroke } from '../../js/core/drawing.js';
import { drawingToDxf, hexAci, parseDxf } from '../../js/core/dxf.js';
import { canOffset, canTrim } from '../../js/core/geometry-edit.js';
import { COLUMN_DEFAULTS, cleanLayout, pageLayoutGeometry } from '../../js/core/page-layouts.js';
import {
  CONNECTOR_ROUTES, FLOW_SHAPES, SHAPES, SHAPE_LABELS, canFill, cleanShape, connectorPoints, connectorRoute, defaultRoute, dimKeys, isConnector, isSegment,
  routeFromEnds, segmentCap, segmentCaps, shapeFromDrag, shapeInnerLines, shapeMeasure, shapeOutline, shapePath, withRoute
} from '../../js/core/shapes.js';
import { ALL_ITEMS, PRESETS, PROCESS_ITEMS, TOOL_GROUPS, itemLabel } from '../../js/core/tool-ring.js';

const PAGE = [1600, 1100];
const style = { color: '#1d1d1f', size: 2 };
const isColor = (value) => /^#[0-9a-f]{6}$/i.test(value);
const clean = (shape) => cleanShape(shape, ...PAGE, isColor);
const near = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const points = (shape) => {
  const { points: flat } = shapeOutline(shape);
  return Array.from({ length: flat.length / 2 }, (_, index) => ({ x: flat[index * 2], y: flat[index * 2 + 1] }));
};
const connector = (from, to) => shapeFromDrag('connector', from, to, style);

test('rysunek 1.45: kształty schematu – początek / koniec (półokrągłe boki), dane (równoległobok), dokument (falisty dół), podproces (linie przy bokach)', () => {
  assert.deepEqual(FLOW_SHAPES, ['terminator', 'data', 'document', 'subprocess']);
  for (const kind of [...FLOW_SHAPES, 'connector']) {
    assert.ok(SHAPES.includes(kind), kind);
    assert.ok(SHAPE_LABELS[kind], `nazwa ${kind}`);
  }
  const make = (kind) => shapeFromDrag(kind, { x: 100, y: 100 }, { x: 300, y: 180 }, style);
  // Początek / koniec: obrys z łuków o promieniu połowy wysokości – pole prostokąta bez czterech narożników.
  const pill = make('terminator');
  const r = 40;
  near(shapeMeasure(pill).area, 200 * 80 - (4 - Math.PI) * r * r);
  assert.ok(shapePath(pill).curves, 'rysowany krzywymi');
  const ends = points(pill);
  near(Math.min(...ends.map((point) => point.x)), 100);
  near(Math.max(...ends.map((point) => point.x)), 300);
  // Dane: wcięcie 0,35 wysokości (najwyżej 0,3 szerokości) – górny lewy i dolny prawy narożnik przesunięte.
  const [topLeft, topRight, bottomRight, bottomLeft] = points(make('data'));
  near(topLeft.x, 100 + 28);
  near(topRight.x, 300);
  near(bottomRight.x, 300 - 28);
  near(bottomLeft.x, 100);
  near(shapeMeasure(make('data')).area, (200 - 28) * 80);
  // Dokument: prosta góra, dół – fala poniżej i powyżej linii 0,42 wysokości.
  const wave = points(make('document')).slice(2);
  assert.equal(wave.length, 17);
  assert.ok(Math.max(...wave.map((point) => point.y)) > 100 + 80 * 0.92 - 0.5, 'fala w dół');
  assert.ok(Math.min(...wave.map((point) => point.y)) < 100 + 80 * 0.84 + 0.5, 'fala w górę');
  // Podproces: obrys prostokąta i dwie pionowe linie przy bokach (odsunięte o 0,18 wysokości).
  const sub = make('subprocess');
  const lines = shapeInnerLines(sub);
  assert.equal(lines.length, 2);
  near(lines[0][0].x, 100 + 80 * 0.18);
  near(lines[1][0].x, 300 - 80 * 0.18);
  assert.deepEqual([lines[0][0].y, lines[0][1].y], [100, 180]);
  assert.deepEqual(shapeInnerLines(make('rect')), []);
  // Wypełnienie, zapis.
  for (const kind of FLOW_SHAPES) {
    assert.ok(canFill(make(kind)), `${kind} – wypełnienie`);
    assert.equal(clean(make(kind)).shape, kind);
  }
});

test('rysunek 1.45: łącznik – odcinek z grotem, przebieg pod kątem prostym (poziomo, pionowo, jedno załamanie), domyślny z kierunku', () => {
  const link = connector({ x: 100, y: 100 }, { x: 300, y: 200 });
  assert.ok(isConnector(link) && isSegment(link));
  assert.deepEqual(segmentCaps(link), { start: 'none', end: 'arrow' });
  assert.deepEqual(dimKeys(link), [], 'bez wymiarów długości i kąta');
  assert.equal(defaultRoute(link), 'h', 'bardziej w poziomie');
  const round = (list) => list.map((point) => [Math.round(point.x), Math.round(point.y)]);
  assert.deepEqual(round(connectorPoints(link)), [[100, 100], [200, 100], [200, 200], [300, 200]]);
  assert.deepEqual(round(connectorPoints(withRoute(link, 'v'))), [[100, 100], [100, 150], [300, 150], [300, 200]]);
  assert.deepEqual(round(connectorPoints(withRoute(link, 'hv'))), [[100, 100], [300, 100], [300, 200]]);
  assert.deepEqual(round(connectorPoints(withRoute(link, 'vh'))), [[100, 100], [100, 200], [300, 200]]);
  // Zapisany tylko przebieg inny niż domyślny.
  assert.equal(withRoute(link, 'h').route, undefined);
  assert.equal(withRoute(link, 'vh').route, 'vh');
  assert.equal(withRoute({ ...link, shape: 'arrow' }, 'vh').route, undefined, 'strzałka – bez przebiegu');
  assert.deepEqual(CONNECTOR_ROUTES, ['h', 'v', 'hv', 'vh']);
  // Przebieg z kierunków wyjścia z przyklejonych elementów.
  assert.equal(routeFromEnds('h', 'h'), 'h');
  assert.equal(routeFromEnds('h', 'v'), 'hv');
  assert.equal(routeFromEnds('v', 'h'), 'vh');
  assert.equal(routeFromEnds(null, 'v'), 'v');
  assert.equal(routeFromEnds(null, null), null);
  // Obrys (zaznaczanie, granice) i ścieżka – przez załamania; grot – wzdłuż ostatniego odcinka (w prawo).
  assert.deepEqual(round(points(link)), [[100, 100], [200, 100], [200, 200], [300, 200]]);
  const path = shapePath(link);
  assert.equal(path.lines.length, 3);
  const cap = segmentCap(link, 'end');
  assert.ok(cap.arms.every((arm) => arm.x < 300 && Math.abs(arm.y - 200) < 10), 'grot w poziomie przy końcu');
  const down = segmentCap(withRoute(link, 'hv'), 'end');
  assert.ok(down.arms.every((arm) => arm.y < 200 && Math.abs(arm.x - 300) < 10), 'przy „hv” grot z góry');
  // Pod sobą (bez odcinka w poziomie) – bez odcinków zerowej długości.
  const straight = connector({ x: 100, y: 100 }, { x: 100, y: 300 });
  assert.equal(points(straight).length, 2);
  // Zapis: przebieg sprawdzony, zakończenia.
  assert.equal(clean(withRoute(link, 'v')).route, 'v');
  assert.equal(clean({ ...link, route: 'zły' }).route, undefined);
  assert.equal(clean({ ...link, route: 'h' }).route, undefined, 'domyślny – nie zapisany');
  // Nie do odsuwania ani przycinania; przyciąganie – do załamań i odcinków przebiegu.
  assert.equal(canOffset(link), false);
  assert.equal(canTrim(link), false);
  const geometry = snapGeometry(link);
  assert.equal(geometry.corners.length, 4);
  assert.equal(geometry.edges.length, 3);
  assert.equal(connectorRoute(withRoute(link, 'v')), 'v');
  // Przyklejony koniec idzie za przesuniętym kształtem; przebieg zostaje.
  const box = { ...shapeFromDrag('rect', { x: 400, y: 300 }, { x: 600, y: 400 }, style), id: 'box12345' };
  const attached = withRoute(withLink(connector({ x: 100, y: 100 }, { x: 500, y: 300 }), 'end', { id: 'box12345', kind: 'edge', index: 0, t: 0.5 }), 'hv');
  const strokes = [translateStroke(box, 100, 50), attached];
  resolveAttachments(strokes);
  const end = endPoint(strokes[1], 'end');
  near(end.x, 600);
  near(end.y, 350);
  assert.equal(connectorRoute(strokes[1]), 'hv');
  // Załamanie nad nowym miejscem końca, na wysokości początku (zaokrąglenia zapisu – setne części).
  const elbow = connectorPoints(strokes[1]).at(1);
  near(elbow.x, end.x);
  near(elbow.y, 100, 0.01);
});

test('rysunek 1.45: długość linii („spaghetti”) – odcinek, łącznik, łamana, kreska pióra; figury zamknięte, prosta i wymiar – bez; suma w jednostkach rysunku', () => {
  const line = shapeFromDrag('line', { x: 0, y: 0 }, { x: 300, y: 400 }, style);
  near(pathLength(line), 500);
  near(pathLength(connector({ x: 100, y: 100 }, { x: 300, y: 200 })), 300, 0.01);
  const pen = { tool: 'pen', color: '#1d1d1f', points: [0, 0, 2, 30, 40, 2, 30, 100, 2] };
  near(pathLength(pen), 50 + 60);
  assert.equal(pathLength({ tool: 'pen', points: [0, 0, 2] }), null, 'jeden punkt');
  assert.equal(pathLength(shapeFromDrag('rect', { x: 0, y: 0 }, { x: 100, y: 100 }, style)), null, 'prostokąt – pole i obwód');
  assert.equal(pathLength(shapeFromDrag('xline', { x: 0, y: 0 }, { x: 100, y: 0 }, style)), null, 'prosta – bez końca');
  assert.equal(pathLength({ tool: 'text', text: 'x' }), null);
  const scale = emptyDrawing().scale;
  const one = pathLengthText([line], scale);
  assert.equal(one.count, 1);
  const both = pathLengthText([line, pen, { tool: 'text' }], scale);
  assert.equal(both.count, 2, 'tylko linie');
  assert.match(both.text, /^\d+([,]\d+)? cm$/);
  assert.equal(pathLengthText([{ tool: 'text' }], scale), null);
});

test('rysunek 1.45: tory (swimlanes) – 2–6 nazwanych pasów, z lewej pole z obróconą nazwą', () => {
  assert.deepEqual(cleanLayout({ kind: 'lanes' }).labels, [...COLUMN_DEFAULTS.lanes]);
  assert.deepEqual(cleanLayout({ kind: 'lanes', labels: ['Klient', '', 'Produkcja'] }).labels, ['Klient', 'Produkcja']);
  assert.deepEqual(cleanLayout({ kind: 'lanes', labels: ['Sam'] }).labels, [...COLUMN_DEFAULTS.lanes]);
  const drawing = emptyDrawing();
  const geometry = pageLayoutGeometry(cleanLayout({ kind: 'lanes', labels: ['A', 'B', 'C'] }), drawing);
  assert.equal(geometry.boxes.length, 6, 'pas i pole nazwy');
  assert.deepEqual(geometry.texts.map((item) => item.text), ['A', 'B', 'C']);
  assert.ok(geometry.texts.every((item) => item.rotate === -Math.PI / 2));
  const lanes = geometry.boxes.filter((box) => !box.strong);
  for (let index = 1; index < lanes.length; index += 1) near(lanes[index].y, lanes[index - 1].y + lanes[index - 1].h);
  assert.deepEqual(cleanDrawing({ ...emptyDrawing(), layout: { kind: 'lanes', labels: ['X', 'Y'] } }).layout, { kind: 'lanes', labels: ['X', 'Y'] });
});

test('rysunek 1.45: symbole VSM – osiem rodzajów, domyślne napisy, proces z danymi w polu, zapas z „I”, sprawdzanie zapisu', () => {
  assert.equal(VSM_SYMBOLS.length, 8);
  for (const symbol of VSM_SYMBOLS) {
    const element = cleanDiagram(newDiagram('vsm', { x: 10, y: 10, symbol }), ...PAGE);
    assert.ok(element, symbol);
    assert.equal(diagramLabel(element), `VSM: ${VSM_LABELS[symbol]}`);
    const layout = diagramLayout(element);
    assert.ok(element.width > 40 && element.height > 40, `${symbol}: wymiary`);
    const inside = (point) => point.x >= 9.99 && point.x <= 10 + element.width + 0.01 && point.y >= 9.99 && point.y <= 10 + element.height + 0.01;
    assert.ok([...layout.polys.flatMap((item) => item.points), ...layout.lines.flat()].every(inside), `${symbol}: w obrysie`);
    assert.equal(layout.targets[0].id, 'title');
  }
  const process = cleanDiagram({ ...newDiagram('vsm'), title: 'Toczenie', rows: ['C/T = 45 s', '', 'C/O = 15 min'] }, ...PAGE);
  assert.deepEqual(process.rows, ['C/T = 45 s', 'C/O = 15 min'], 'puste wiersze pominięte');
  const texts = diagramLayout(process).texts.map((item) => item.text);
  assert.deepEqual(texts, ['Toczenie', 'C/T = 45 s', 'C/O = 15 min']);
  const [head, data] = diagramLayout(process).boxes;
  assert.equal(head.fill, 'label');
  assert.equal(data.y, head.y + head.h, 'dane pod nazwą');
  const inventory = diagramLayout(cleanDiagram({ ...newDiagram('vsm', { symbol: 'inventory' }), title: '300 szt.', rows: ['2 dni'] }, ...PAGE));
  assert.deepEqual(inventory.texts.map((item) => item.text), ['I', '300 szt.', '2 dni']);
  assert.equal(inventory.polys[0].points.length, 3, 'trójkąt');
  const push = diagramLayout(cleanDiagram(newDiagram('vsm', { symbol: 'push' }), ...PAGE));
  assert.equal(push.polys.filter((item) => item.fill === 'ink').length, 3, 'pasy strzałki push');
  // Sprawdzanie: zły rodzaj symbolu – proces; za dużo wierszy – 6; za długi tekst – przycięty.
  const messy = cleanDiagram({ ...newDiagram('vsm'), symbol: 'rakieta', rows: Array.from({ length: 9 }, (_, index) => `w${index}`), title: 't'.repeat(90) }, ...PAGE);
  assert.equal(messy.symbol, 'process');
  assert.equal(messy.rows.length, DIAGRAM_LIMITS.rows);
  assert.equal(messy.title.length, DIAGRAM_LIMITS.name);
});

test('rysunek 1.45: oś czasu VSM – schodkowa linia, czas przejścia w jednostce oczekiwania, wartość dodana, PCE z długością dnia', () => {
  const element = cleanDiagram({ ...newDiagram('timeline'), steps: [{ wait: 2, work: 45 }, { wait: 1.5, work: 30 }] }, ...PAGE);
  assert.deepEqual([element.waitUnit, element.workUnit, element.dayHours], ['dni', 's', 24]);
  const totals = timelineTotals(element);
  assert.equal(totals.wait, 3.5);
  assert.equal(totals.work, 75);
  near(totals.lead, 3.5 + 75 / 86400, 1e-9);
  near(totals.pce, (75 / (3.5 * 86400 + 75)) * 100, 1e-9);
  // Dzień – jedna zmiana (8 h): PCE trzy razy większy (prawie).
  const shift = timelineTotals({ ...element, dayHours: 8 });
  near(shift.pce, (75 / (3.5 * 8 * 3600 + 75)) * 100, 1e-9);
  const layout = diagramLayout(element);
  assert.deepEqual(layout.texts.map((item) => item.text), ['2 dni', '45 s', '1,5 dni', '30 s', 'Czas przejścia: 3,5 dni', 'Wartość dodana: 75 s', 'PCE: 0,025%']);
  // Linie: na krok – góra, pion, dół; między krokami – pion w górę.
  assert.equal(layout.lines.length, 2 * 3 + 1);
  assert.equal(formatNumber(1234.567), '1234,57');
  assert.equal(formatNumber(0.0123), '0,012');
  // Sprawdzanie: liczby ujemne i nie-liczby – 0, za dużo kroków – 10, bez kroków – jeden, złe jednostki – domyślne.
  const messy = cleanDiagram({
    ...newDiagram('timeline'), waitUnit: 'lata', workUnit: 'min', dayHours: 99, steps: [{ wait: -2, work: 'x' }, ...Array.from({ length: 12 }, () => ({ wait: 1, work: 1 }))]
  }, ...PAGE);
  assert.deepEqual(messy.steps[0], { wait: 0, work: 0 });
  assert.equal(messy.steps.length, DIAGRAM_LIMITS.steps);
  assert.deepEqual([messy.waitUnit, messy.workUnit, messy.dayHours], ['dni', 'min', 24]);
  assert.deepEqual(cleanDiagram({ ...newDiagram('timeline'), steps: [] }, ...PAGE).steps, [{ wait: 0, work: 0 }]);
});

test('rysunek 1.45: legenda wad – liczy punkty kartki o znaczniku i kolorze wady, razem; bez kresek – „–”; sprawdzanie zapisu', () => {
  const legend = cleanDiagram(newDiagram('defects', { x: 20, y: 20 }), ...PAGE);
  assert.deepEqual(legend.items.map((item) => [item.mark, item.color]), [['cross', '#d70015'], ['dot', '#0040dd']]);
  const point = (mark, color, x = 100) => ({ ...shapeFromDrag('point', { x, y: 100 }, { x, y: 100 }, { ...style, color, mark }), mark });
  const strokes = [point('cross', '#d70015'), point('cross', '#D70015', 140), point('dot', '#0040dd'), point('dot', '#d70015'), point('plus', '#d70015'), legend];
  assert.deepEqual(defectCounts(legend, strokes), [2, 1]);
  assert.deepEqual(defectCounts(legend, null), [null, null]);
  const texts = diagramLayout(legend, { strokes }).texts.map((item) => item.text);
  assert.deepEqual(texts, ['Wady', 'Rysa', '2', 'Wgniecenie', '1', 'Razem', '3']);
  assert.deepEqual(diagramLayout(legend).texts.map((item) => item.text), ['Wady', 'Rysa', '–', 'Wgniecenie', '–', 'Razem', '–']);
  const marks = diagramLayout(legend).marks;
  assert.deepEqual(marks.map((mark) => mark.color), ['#d70015', '#0040dd']);
  assert.ok(marks[0].lines.length === 2 && marks[1].dot, 'krzyżyk i kropka jak narzędzie Punkt');
  // Zapis: złe pozycje pominięte, bez pozycji – null, najwyżej 8.
  assert.equal(cleanDiagram({ ...legend, items: [{ mark: 'gwiazdka', color: '#d70015' }, { mark: 'dot', color: 'red' }] }, ...PAGE), null);
  const many = cleanDiagram({ ...legend, items: Array.from({ length: 12 }, () => ({ mark: 'dot', color: '#0040dd', name: 'x' })) }, ...PAGE);
  assert.equal(many.items.length, DIAGRAM_LIMITS.items);
});

test('rysunek 1.45: DXF – kształty schematu i łącznik polilinią, linie podprocesu, symbole VSM, znaczniki legendy w kolorze wady, tory na warstwie UKLAD', () => {
  const make = (kind, x) => shapeFromDrag(kind, { x, y: 100 }, { x: x + 160, y: 180 }, style);
  const shapes = [make('terminator', 100), make('data', 300), make('document', 500), make('subprocess', 700), connector({ x: 260, y: 140 }, { x: 300, y: 400 })];
  const legend = cleanDiagram(newDiagram('defects', { x: 100, y: 600 }), ...PAGE);
  const vsm = cleanDiagram(newDiagram('vsm', { x: 600, y: 600, symbol: 'inventory' }), ...PAGE);
  const red = { ...shapeFromDrag('point', { x: 900, y: 900 }, { x: 900, y: 900 }, { ...style, color: '#d70015', mark: 'cross' }), mark: 'cross' };
  const drawing = cleanDrawing({ ...emptyDrawing(), strokes: [...shapes, legend, vsm, red], layout: { kind: 'lanes' } });
  assert.equal(drawing.strokes.length, 8);
  const parsed = parseDxf(drawingToDxf(drawing).text);
  const polylines = parsed.entities.filter((item) => item.type === 'POLYLINE' && item.layer !== 'UKLAD');
  assert.ok(polylines.length >= 5 + 2 + 1, `kształty, łącznik, ramki legendy, trójkąt zapasu (${polylines.length})`);
  const lines = parsed.entities.filter((item) => item.type === 'LINE');
  assert.ok(lines.length >= 2 + 2, `linie podprocesu i krzyżyk legendy (${lines.length})`);
  assert.ok(parsed.entities.some((item) => item.type === 'LINE' && item.color === hexAci('#d70015')), 'krzyżyk w kolorze wady');
  const texts = parsed.entities.filter((item) => item.type === 'TEXT').map((item) => item.first(1));
  assert.ok(texts.includes('Rysa') && texts.includes('I'), texts.join(' | '));
  assert.ok(texts.includes('1'), 'legenda liczy znacznik kartki także w DXF');
  assert.ok(parsed.entities.some((item) => item.layer === 'UKLAD'), 'tory');
});

test('rysunek 1.45: grupa Procesy i zestaw „Procesy / VSM”, format rysunku 17, zakończenia łącznika w ustawieniach', () => {
  const group = TOOL_GROUPS.find((item) => item.id === 'process');
  assert.equal(group.label, 'Procesy');
  assert.deepEqual(group.items, [...PROCESS_ITEMS]);
  assert.equal(TOOL_GROUPS.at(-1).id, 'process', 'na końcu – dotychczasowe grupy zostają na swoich miejscach');
  assert.deepEqual(PROCESS_ITEMS.map(itemLabel), ['Początek / koniec', 'Dane', 'Dokument', 'Podproces', 'Łącznik', 'Symbol VSM', 'Oś czasu VSM', 'Legenda wad']);
  const preset = PRESETS.find((item) => item.id === 'process-map');
  assert.equal(preset.label, 'Procesy / VSM');
  assert.ok(preset.items.every((item) => ALL_ITEMS.includes(item)));
  assert.equal(preset.items.length, 12);
  assert.equal(DRAWING_VERSION, 17);
  assert.deepEqual(defaultToolSettings().connectorCaps, { start: 'none', end: 'arrow' });
  assert.deepEqual(cleanToolSettings({ connectorCaps: { start: 'circle', end: 'zły' } }).connectorCaps, { start: 'circle', end: 'arrow' });
});
