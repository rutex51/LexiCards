// Rysunek 1.22.1: wymiary techniczne (linie pomocnicze, linia wymiarowa, łuk kąta, odsunięcie, piętra,
// znak i tolerancja, styl „50” / „5 cm”) i symbole metrologiczne (ramka tolerancji, baza, chropowatość).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeArray } from '../../js/core/arrays.js';
import { findSnap, resolveAttachments, snapNormal } from '../../js/core/attach.js';
import {
  DRAWING_VERSION, cleanDrawing, cleanToolSettings, defaultToolSettings, dimFactor, dimUnitLabel, dimensionParts, dimensionText, elementBox,
  strokeBounds, touchesStroke
} from '../../js/core/drawing.js';
import {
  GDT_SYMBOLS, cleanSymbol, datumTriangle, isSymbol, nextDatumLetter, roughnessLayout, symbolLeaderStart
} from '../../js/core/gdt.js';
import {
  DIM_OFFSET, DIM_TIER, cleanDimTolerance, cleanShape, dimGeometry, dimOffset, dimOffsetAt, stackDimOffset, withDimOffset, withDimTolerance, withDims
} from '../../js/core/shapes.js';

const near = (actual, expected, message, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} ≠ ${expected}`);
const point = (actual, [x, y], message, tolerance = 1e-6) => {
  near(actual.x, x, `${message} (x)`, tolerance);
  near(actual.y, y, `${message} (y)`, tolerance);
};
const rect = (extra = {}) => ({ tool: 'shape', shape: 'rect', color: '#1d1d1f', size: 3, x: 500, y: 400, w: 200, h: 100, angle: 0, skew: 0, adjust: 0, ...extra });
const isColor = (value) => /^#[0-9a-f]{6}$/i.test(value ?? '');
const CM = { value: 1, unit: 'cm' };

test('wymiary techniczne 1.22.1: linie pomocnicze, linia wymiarowa, liczba nad linią (pion – od dołu do góry), łuk pochylenia i kąta odcinka', () => {
  const shape = rect();
  // Szerokość: dolna krawędź (400–600, y 450), linia wymiarowa 40 niżej, linie pomocnicze od przerwy 4 do 8 za linię.
  const width = dimGeometry(shape, 'width');
  assert.equal(width.kind, 'linear');
  point(width.from, [400, 490], 'początek linii wymiarowej');
  point(width.to, [600, 490], 'koniec linii wymiarowej');
  point(width.ext[0][0], [400, 454], 'linia pomocnicza – od przerwy');
  point(width.ext[0][1], [400, 498], 'linia pomocnicza – za linią wymiarową');
  near(width.text.angle, 0, 'liczba poziomo');
  near(width.text.y, 490 - 16, 'liczba nad linią wymiarową');
  // Wysokość: prawa krawędź, linia 40 w prawo; liczba obrócona o −90° (czytana od prawej), na lewo od linii.
  const height = dimGeometry(shape, 'height');
  point(height.from, [640, 350], 'wysokość – góra');
  point(height.to, [640, 450], 'wysokość – dół');
  near(height.text.angle, -Math.PI / 2, 'pionowa liczba od dołu do góry');
  near(height.text.x, 640 - 16, 'liczba po lewej stronie linii');
  // Odsunięcie zapisane w kształcie i podane wprost.
  near(dimGeometry(withDimOffset(shape, 'width', 100), 'width').from.y, 550, 'zapisane odsunięcie');
  near(dimGeometry(shape, 'width', 70).from.y, 520, 'podane odsunięcie');
  near(dimOffset(shape, 'width'), DIM_OFFSET, 'domyślne odsunięcie');

  // Równoległobok (pochylenie 25°): wysokość prostopadle do podstawy – linie pomocnicze od prawego górnego
  // i prawego dolnego narożnika, linia wymiarowa za dalszym z nich.
  const skewed = rect({ skew: Math.tan((25 * Math.PI) / 180) });
  const skewHeight = dimGeometry(skewed, 'height');
  near(skewHeight.from.x, 600 + skewed.skew * 50 + 40, 'linia wymiarowa za górnym prawym narożnikiem');
  near(skewHeight.to.y - skewHeight.from.y, 100, 'wysokość prostopadle do podstawy');
  // Kąt pochylenia: łuk przy lewym dolnym narożniku od pionu do lewego boku.
  const skew = dimGeometry(skewed, 'skew');
  assert.equal(skew.kind, 'angle');
  point(skew.center, [400 - skewed.skew * 50, 450], 'wierzchołek kąta');
  near(skew.start, -Math.PI / 2, 'od pionu');
  near(skew.sweep, (25 * Math.PI) / 180, '25°');
  // Szerokość elipsy i rombu – między skrajnymi punktami (nie narożnikami ramki).
  point(dimGeometry(rect({ shape: 'ellipse' }), 'width').ext[0][0], [400, 404], 'elipsa – od skrajnego punktu');

  // Odcinek w górę w prawo (−30° na ekranie): kąt od poziomu w prawo na początku; długość – po drugiej
  // stronie niż łuk (nad odcinkiem).
  const line = { tool: 'shape', shape: 'line', color: '#1d1d1f', size: 3, x: 500, y: 400, w: 200, h: 0, angle: -Math.PI / 6, skew: 0, adjust: 0 };
  const angle = dimGeometry(line, 'angle');
  point(angle.center, [500 - 100 * Math.cos(Math.PI / 6), 400 + 50], 'kąt na początku odcinka');
  near(angle.start, 0, 'od poziomu');
  near(angle.sweep, -Math.PI / 6, 'łuk −30°');
  const length = dimGeometry(line, 'length');
  assert.ok(length.normal[1] < 0, 'długość nad odcinkiem – łuk kąta jest pod nim');
  near(Math.hypot(length.to.x - length.from.x, length.to.y - length.from.y), 200, 'linia wymiarowa równa odcinkowi');

  // Przeciągnięcie liczby: odsunięcie z położenia wskaźnika (w granicach).
  // Liczba szerokości stoi 16 nad linią – wskaźnik w miejscu liczby przy odsunięciu 90.
  near(dimOffsetAt(shape, 'width', { x: 520, y: 450 + 90 - 16 }), 90, 'odsunięcie od wskaźnika');
  near(dimOffsetAt(shape, 'width', dimGeometry(shape, 'width').text), DIM_OFFSET, 'w miejscu liczby – bieżące odsunięcie');
  near(dimOffsetAt(shape, 'height', dimGeometry(shape, 'height').text), DIM_OFFSET, 'wysokość – bieżące odsunięcie');
  near(dimOffsetAt(shape, 'width', { x: 520, y: 300 }), 12, 'najmniej 12');
});

test('wymiary techniczne 1.22.1: piętra – nowa linia wymiarowa na tej samej wysokości co inna przesuwa się dalej; prostopadłe i rozłączne – bez zmiany', () => {
  const upper = withDims(rect(), ['width', 'height']);
  // Drugi prostokąt nad tą samą dolną krawędzią (ta sama szerokość) – szerokość zachodzi na tę z pierwszego.
  const lower = withDims(rect({ y: 420, h: 60 }), ['width']);
  assert.equal(stackDimOffset([upper, lower], lower, 'width', DIM_OFFSET), DIM_OFFSET + DIM_TIER, 'piętro dalej');
  // Trzeci – jeszcze jedno piętro, gdy na pierwszym i drugim są już linie.
  const second = withDimOffset(lower, 'width', DIM_OFFSET + DIM_TIER);
  const third = withDims(rect({ y: 410, h: 80 }), ['width']);
  assert.equal(stackDimOffset([upper, second, third], third, 'width', DIM_OFFSET), DIM_OFFSET + DIM_TIER * 2);
  // Daleko w bok – bez zmiany; wysokość obok szerokości (prostopadle) – bez zmiany.
  const aside = withDims(rect({ x: 1200 }), ['width']);
  assert.equal(stackDimOffset([upper, aside], aside, 'width', DIM_OFFSET), DIM_OFFSET);
  assert.equal(stackDimOffset([upper], upper, 'height', DIM_OFFSET), DIM_OFFSET, 'wysokość i szerokość tego samego kształtu');
  // Kąt – bez pięter.
  assert.equal(stackDimOffset([upper], upper, 'skew', 50), 50);
});

test('wymiary techniczne 1.22.1: styl „50” (mm) i „5 cm”, znak ⌀ R □, tolerancja ±, odchyłki, pasowanie; sprawdzanie danych', () => {
  // 220 jednostek = 5 kratek = 5 cm.
  const shape = rect({ w: 220, h: 88 });
  assert.equal(dimensionText(shape, 'width', CM), '5 cm');
  assert.equal(dimensionText(shape, 'width', CM, 'technical'), '50');
  assert.equal(dimensionText(shape, 'width', { value: 1, unit: 'in' }, 'technical'), '5', 'jednostki imperialne – cale');
  assert.equal(dimensionText(shape, 'width', { value: 2, unit: 'm' }, 'technical'), '10000');
  assert.equal(dimFactor(CM, 'technical'), 10);
  assert.equal(dimFactor(CM, 'unit'), 1);
  assert.deepEqual([dimUnitLabel(CM, 'technical'), dimUnitLabel({ value: 1, unit: 'ft' }, 'technical'), dimUnitLabel({ value: 1, unit: 'm' })], ['mm', 'in', 'm']);
  const marked = withDimTolerance(withDimTolerance(shape, 'width', { prefix: '⌀', kind: 'fit', fit: ' H7/g6 ' }), 'height', { kind: 'dev', upper: 0.1, lower: -0.05 });
  assert.equal(dimensionText(marked, 'width', CM, 'technical'), '⌀50 H7/g6');
  assert.equal(dimensionText(marked, 'height', CM, 'technical'), '20 +0,1/−0,05');
  assert.deepEqual(dimensionParts(marked, 'height', CM, 'technical').tolerance, { kind: 'dev', upper: '+0,1', lower: '−0,05' });
  assert.equal(dimensionText(withDimTolerance(shape, 'width', { prefix: 'R', kind: 'sym', value: -0.1 }), 'width', CM, 'technical'), 'R50±0,1');
  // Od 1.25 tolerancje długości w mm – przy liczbach „5 cm” pokazane w cm (−2 mm = −0,2 cm).
  assert.equal(dimensionText(withDimTolerance(shape, 'width', { kind: 'dev', upper: 0, lower: -2 }), 'width', CM), '5 cm 0/−0,2');
  // Kąt: bez znaku i pasowania, tolerancja w stopniach.
  const skewed = rect({ skew: Math.tan((25 * Math.PI) / 180) });
  assert.equal(dimensionText(withDimTolerance(skewed, 'skew', { prefix: '⌀', kind: 'sym', value: 1 }), 'skew', CM), '25°±1°');
  assert.equal(withDimTolerance(skewed, 'skew', { kind: 'fit', fit: 'H7' }).dimTols, undefined, 'pasowanie kąta – pominięte');
  assert.equal(withDimTolerance(marked, 'width', null).dimTols.width, undefined, 'bez oznaczenia – usunięte');

  // Sprawdzanie: złe tolerancje pominięte, odsunięcia w granicach, tylko klucze kształtu.
  assert.equal(cleanDimTolerance({ kind: 'sym', value: 0 }), null);
  assert.equal(cleanDimTolerance({ kind: 'dev', upper: 0.1 }), null);
  assert.equal(cleanDimTolerance({ kind: 'fit', fit: 'H' }), null);
  assert.equal(cleanDimTolerance({ prefix: 'X' }), null);
  assert.deepEqual(cleanDimTolerance({ prefix: '□' }), { prefix: '□' });
  const cleaned = cleanShape({
    ...marked, dims: ['width', 'height'], dimOffsets: { width: 5000, height: 3, length: 50, skew: 'x' },
    dimTols: { ...marked.dimTols, length: { kind: 'sym', value: 1 }, skew: { kind: 'fit', fit: 'H7' } }
  }, 1600, 1100, isColor);
  assert.deepEqual(cleaned.dimOffsets, { width: 600, height: 12 });
  assert.deepEqual(Object.keys(cleaned.dimTols), ['width', 'height']);
  assert.equal(cleaned.dimTols.width.fit, 'H7/g6');
  // Rysunek: styl liczb i wersja formatu; ustawienia – wzór odsunięcia.
  const drawing = cleanDrawing({ width: 1600, height: 1100, strokes: [cleaned], dimStyle: 'technical' });
  assert.equal(drawing.version, DRAWING_VERSION);
  assert.equal(DRAWING_VERSION, 20, 'od 1.48.2 – szkic na XY (Z do góry); 1.48 – bryły ze szkicu; 1.47 – bryły; 1.45 – schematy procesów; 1.44 – diagramy jakości i układ kartki; 1.42 – wymiar długości łuku, kierunek wymiaru, osie okręgu; 1.41 – ramka rysunkowa; 1.40 – wielokąt foremny, półprosta, narożniki, kreskowanie (1.38 – uzupełnienia tolerancji i symboli)');
  assert.equal(drawing.dimStyle, 'technical');
  assert.equal('dimStyle' in cleanDrawing({ width: 1600, height: 1100, strokes: [], dimStyle: 'mm' }), false);
  assert.equal(defaultToolSettings().dimOffset, DIM_OFFSET);
  assert.equal(cleanToolSettings({ dimOffset: 9999 }).dimOffset, 600);
  assert.equal(cleanToolSettings({ dimOffset: 'x' }).dimOffset, DIM_OFFSET);
});

test('symbole 1.22.1: ramka tolerancji (14 symboli ISO 1101, ⌀, Ⓜ/Ⓛ, bazy), znak bazy, chropowatość – sprawdzanie, układ, strzałki', () => {
  assert.equal(GDT_SYMBOLS.length, 14);
  assert.equal(new Set(GDT_SYMBOLS.map((symbol) => symbol.id)).size, 14);
  assert.deepEqual(GDT_SYMBOLS.filter((symbol) => symbol.form).map((symbol) => symbol.id), ['straightness', 'flatness', 'circularity', 'cylindricity']);
  const frame = cleanSymbol({
    tool: 'gdt', x: 900, y: 300, size: 26, color: '#1D1D1F', symbol: 'position', value: ' 0.05 ', diameter: true, modifier: 'M',
    datums: ['a', '', 'B-C', 'D', 'x1'], cells: [44, 100, 44, 44], leader: { x: 700, y: 330 }
  }, 1600, 1100);
  assert.deepEqual([frame.value, frame.datums, frame.diameter, frame.modifier, frame.color], ['0,05', ['A', 'B-C', 'D'], true, 'M', '#1d1d1f']);
  assert.equal(frame.cells.length, 5, 'pola: symbol, tolerancja i trzy bazy');
  assert.equal(frame.width, frame.cells.reduce((sum, cell) => sum + cell, 0));
  // Tolerancja kształtu – bez baz; zły symbol, brak koloru – odrzucone.
  assert.deepEqual(cleanSymbol({ tool: 'gdt', x: 0, y: 0, size: 26, color: '#000000', symbol: 'flatness', value: '0,1', datums: ['A'] }, 1600, 1100).datums, []);
  assert.equal(cleanSymbol({ tool: 'gdt', x: 0, y: 0, size: 26, color: '#000000', symbol: 'roundness', value: '1' }, 1600, 1100), null);
  assert.equal(cleanSymbol({ tool: 'datum', x: 0, y: 0, size: 26, color: '#000000', letter: '1' }, 1600, 1100), null);
  const datum = cleanSymbol({ tool: 'datum', x: 500, y: 600, size: 26, color: '#000000', letter: 'b' }, 1600, 1100);
  assert.equal(datum.letter, 'B');
  assert.equal(datum.width, datum.height);
  assert.ok(datum.leader, 'bez końca – trójkąt pod kwadratem');
  const rough = cleanSymbol({ tool: 'roughness', x: 600, y: 350, size: 26, color: '#000000', text: ' Ra 1,6 ', kind: 'polish', width: 70 }, 1600, 1100);
  assert.deepEqual([rough.text, rough.kind], ['Ra 1,6', 'any']);
  assert.ok([frame, datum, rough].every(isSymbol));

  // Litery baz: kolejna wolna, bez I, O, Q.
  const letters = 'ABCDEFGH'.split('').map((letter) => ({ tool: 'datum', letter }));
  assert.equal(nextDatumLetter(letters), 'J');
  assert.equal(nextDatumLetter([]), 'A');

  // Chropowatość: wierzchołek w (x, y), ramiona pod 60°, tekst pod poziomą kreską na prawo od długiego ramienia.
  const layout = roughnessLayout(rough);
  point(layout.tip, [600, 350], 'wierzchołek');
  near((layout.tip.y - layout.short.y) / (layout.tip.x - layout.short.x), Math.tan(Math.PI / 3), 'krótkie ramię pod 60°');
  near((layout.tip.y - layout.long.y) / (layout.long.x - layout.tip.x), Math.tan(Math.PI / 3), 'długie ramię pod 60°');
  near(layout.long.y, 350 - 26 * 2.8, 'pozioma kreska na wysokości długiego ramienia');
  assert.ok(layout.text.y > layout.long.y && layout.text.x > layout.long.x, 'tekst pod kreską, za ramieniem');
  assert.ok(layout.bar.x >= layout.text.x + 70, 'kreska nad całym tekstem');
  assert.deepEqual(elementBox(rough), layout.box);

  // Strzałka ramki: od lewego boku (cel po lewej), od dołu (cel pod ramką); trójkąt bazy – podstawa w punkcie.
  point(symbolLeaderStart(frame), [900, 300 + frame.height / 2], 'z lewego boku');
  const below = { ...frame, leader: { x: 950, y: 500 } };
  point(symbolLeaderStart(below), [950, 300 + frame.height], 'z dolnego boku nad celem');
  const placed = { ...datum, x: 500, y: 600, leader: { x: datum.x + datum.width / 2, y: 500 } };
  const triangle = datumTriangle(placed);
  near((triangle.points[0].x + triangle.points[1].x) / 2, placed.leader.x, 'środek podstawy w punkcie');
  near(triangle.points[0].y, 500, 'podstawa pozioma – prostopadle do linii');
  assert.ok(triangle.points[2].y > 500, 'wierzchołek w stronę kwadratu');
  // Granice, dotknięcie strzałki, szyk bez symboli.
  assert.ok(strokeBounds(frame).minX <= 700, 'granice ze strzałką');
  assert.ok(touchesStroke(frame, 800, 330 + (300 + frame.height / 2 - 330) / 2, 2), 'dotknięcie linii strzałki');
  assert.equal(makeArray([frame, datum, rough], { kind: 'linear', count: 2, gap: 10, rows: 1, rowGap: 10 }, 400), null);
});

test('symbole 1.22.1: strzałka ramki i trójkąt bazy przyklejone do krawędzi, wierzchołek chropowatości przesuwa cały symbol; kierunek na zewnątrz; zapis', () => {
  const shape = { ...rect(), id: 'abc12345' };
  const frame = { tool: 'gdt', x: 700, y: 360, width: 160, height: 44, size: 26, color: '#000000', symbol: 'perpendicularity', value: '0,05', datums: ['A'], cells: [44, 72, 44], leader: { x: 600, y: 400 }, attach: { leader: { id: 'abc12345', kind: 'edge', index: 1, t: 0.5 } } };
  const rough = { tool: 'roughness', x: 450, y: 350, size: 26, color: '#000000', text: 'Ra 1,6', kind: 'removal', width: 70, attach: { tip: { id: 'abc12345', kind: 'edge', index: 0, t: 0.25 } } };
  const strokes = [{ ...shape, x: 550, y: 430 }, frame, rough];
  resolveAttachments(strokes);
  point(strokes[1].leader, [650, 430], 'strzałka ramki na przesuniętej prawej krawędzi');
  assert.deepEqual([strokes[1].x, strokes[1].y], [700, 360], 'ramka zostaje na miejscu');
  point(strokes[2], [500, 380], 'cały symbol chropowatości na przesuniętej górnej krawędzi');
  // Przyciąganie do ramki symbolu (jak do innych elementów z ramką) i kierunek na zewnątrz krawędzi.
  const snap = findSnap(strokes, { x: 652, y: 440 }, 10, { boxOf: elementBox });
  assert.equal(snap.target, strokes[0]);
  assert.deepEqual(snapNormal(snap, elementBox).map((value) => Math.round(value * 1000) / 1000 + 0), [1, 0], 'prawa krawędź – w prawo');
  const bottom = findSnap(strokes, { x: 560, y: 482 }, 10, { boxOf: elementBox });
  assert.deepEqual(snapNormal(bottom, elementBox).map((value) => Math.round(value * 1000) / 1000 + 0), [0, 1], 'dolna – w dół');
  // Zapis: przyklejenia strzałki i wierzchołka zostają.
  const cleaned = cleanDrawing({ width: 1600, height: 1100, strokes });
  assert.deepEqual(cleaned.strokes[1].attach, frame.attach);
  assert.deepEqual(cleaned.strokes[2].attach, rough.attach);
  assert.equal(cleaned.strokes[2].tool, 'roughness');
});
