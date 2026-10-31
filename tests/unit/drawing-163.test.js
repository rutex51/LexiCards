// Rysunek 1.63: wiaderko (core/bucket.js), formaty arkusza (core/board.js), kolor kartki, domyślny styl kształtów.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bucketFill, dilateMask, fillContains, fillRings, floodRegion, traceRings } from '../../js/core/bucket.js';
import { BOARD_FORMATS, boardFormat, boardViewport, fitsFormat, isBoard, setBoard, sheetAreaOrigin } from '../../js/core/board.js';
import {
  PAGE_HEIGHT, PAGE_WIDTH, STYLE_DEFAULTS, cleanDrawing, cleanToolSettings, emptyDrawing, eraseAt, paperColor, shapeToolStyle, strokesAt,
  translateStroke
} from '../../js/core/drawing.js';
import { mirrorStroke, rotateStroke, scaleStroke } from '../../js/core/transform.js';
import { TOOL_GROUPS, isModeItem, itemLabel } from '../../js/core/tool-ring.js';

/** Maska width × height z prostokątnymi ramkami linii [x0, y0, x1, y1] (grubość 1 px). */
function maskWith(width, height, frames, gaps = []) {
  const ink = new Uint8Array(width * height);
  const set = (x, y) => { if (x >= 0 && y >= 0 && x < width && y < height) ink[y * width + x] = 1; };
  for (const [x0, y0, x1, y1] of frames) {
    for (let x = x0; x <= x1; x += 1) { set(x, y0); set(x, y1); }
    for (let y = y0; y <= y1; y += 1) { set(x0, y); set(x1, y); }
  }
  for (const [x, y] of gaps) ink[y * width + x] = 0;
  return ink;
}
const identity = (x, y) => ({ x, y });

test('wiaderko 1.63: obszar zamknięty – wypełnienie z otworem (reguła parzystości), poszerzone pod linie; dotknięta linia i obszar otwarty – bez wypełnienia', () => {
  const ink = maskWith(60, 60, [[10, 10, 40, 40], [20, 20, 30, 30]]);
  const result = bucketFill(ink, 60, 60, 15, 15, { color: '#ffe680', map: identity });
  assert.ok(result.stroke, JSON.stringify(result));
  const fill = result.stroke;
  assert.equal(fill.tool, 'fill');
  assert.equal(fill.color, '#ffe680');
  assert.equal(fill.rings.length, 2, 'brzeg i otwór');
  assert.equal(fill.points.length / 3, fill.rings.reduce((sum, count) => sum + count, 0));
  assert.equal(fillContains(fill, 15, 15), true, 'w środku');
  assert.equal(fillContains(fill, 25, 25), false, 'otwór pusty');
  assert.equal(fillContains(fill, 5, 5), false, 'poza obszarem');
  // Poszerzone o piksel – pod linię ramki (linia x = 10 ma piksele 10…11).
  assert.equal(fillContains(fill, 10.5, 25), true, 'pod linią ramki');
  assert.equal(fillContains(fill, 9.5, 25), false, 'nie za linią');
  // Dotknięta linia; obszar dochodzący do brzegu okna – otwarty.
  assert.deepEqual(bucketFill(ink, 60, 60, 10, 25, { color: '#ffe680', map: identity }), { error: 'line' });
  const open = bucketFill(ink, 60, 60, 5, 5, { color: '#ffe680', map: identity });
  assert.equal(open.error, 'open');
  assert.equal(open.edges.left && open.edges.top, true);
  // Przeliczenie na jednostki rysunku (map): okno od (100, 50), 2 piksele na jednostkę.
  const scaled = bucketFill(ink, 60, 60, 15, 15, { color: '#ffe680', map: (x, y) => ({ x: 100 + x / 2, y: 50 + y / 2 }) }).stroke;
  assert.equal(fillContains(scaled, 100 + 7.5, 50 + 7.5), true);
});

test('wiaderko 1.63: szczelina w linii – domknięta przy gap (do 2 × gap pikseli), bez gap – obszar otwarty; maska poszerzana kwadratem', () => {
  // Ramka z przerwą 3 px w górnej krawędzi.
  const ink = maskWith(60, 60, [[10, 10, 40, 40]], [[24, 10], [25, 10], [26, 10]]);
  assert.equal(bucketFill(ink, 60, 60, 25, 25, { color: '#b9e0ff', map: identity }).error, 'open', 'bez domykania wylewa się');
  const closed = bucketFill(ink, 60, 60, 25, 25, { color: '#b9e0ff', map: identity, gap: 2 });
  assert.ok(closed.stroke, 'szczelina 3 px domknięta przy gap 2');
  assert.equal(fillContains(closed.stroke, 25, 25), true);
  assert.equal(fillContains(closed.stroke, 25, 3), false, 'nie wylewa się przez szczelinę');
  // Poszerzenie maski: punkt (5, 5) z promieniem 2 – kwadrat 5 × 5.
  const dot = new Uint8Array(100);
  dot[5 * 10 + 5] = 1;
  const grown = dilateMask(dot, 10, 10, 2);
  assert.equal(grown.reduce((sum, value) => sum + value, 0), 25);
  assert.equal(grown[3 * 10 + 3], 1);
  assert.equal(grown[2 * 10 + 5], 0);
  // Obrys pojedynczego piksela – kwadrat 4 narożników; piksele stykające się narożnikiem – dwie pętle.
  const one = new Uint8Array(9);
  one[4] = 1;
  assert.deepEqual(traceRings(one, 3, 3), [[1, 1, 2, 1, 2, 2, 1, 2]]);
  const diagonal = new Uint8Array(16);
  diagonal[1 * 4 + 1] = 1;
  diagonal[2 * 4 + 2] = 1;
  assert.equal(traceRings(diagonal, 4, 4).length, 2);
  // Wypełnianie wierszami zatrzymuje się na liniach.
  const flood = floodRegion(maskWith(20, 20, [[2, 2, 10, 10]]), 20, 20, 5, 5);
  assert.equal(flood.count, 7 * 7);
  assert.deepEqual(flood.edges, { left: false, top: false, right: false, bottom: false });
});

test('wiaderko 1.63: wypełnienie w rysunku – zapis i sprawdzanie, trafienie wnętrza, gumka fragmentów go nie tnie, przesuwanie i przekształcenia zachowują obrysy; narzędzie w grupie „Pisanie”', () => {
  const ink = maskWith(60, 60, [[10, 10, 40, 40], [20, 20, 30, 30]]);
  const fill = bucketFill(ink, 60, 60, 15, 15, { color: '#FFE680', map: identity }).stroke;
  const drawing = { ...emptyDrawing(), strokes: [fill, { tool: 'pen', color: '#1d1d1f', points: [0, 0, 2, 50, 50, 2] }] };
  const saved = cleanDrawing(JSON.parse(JSON.stringify(drawing)));
  assert.deepEqual(saved.strokes[0].rings, fill.rings);
  assert.equal(saved.strokes[0].color, '#ffe680');
  // Uszkodzone: liczby obrysów nie pasują do punktów, za mało punktów, zły kolor – odpada.
  assert.equal(cleanDrawing({ ...drawing, strokes: [{ ...fill, rings: [3, 3] }] }).strokes.length, 0);
  assert.equal(cleanDrawing({ ...drawing, strokes: [{ tool: 'fill', color: '#ffe680', points: [0, 0, 1, 5, 5, 1] }] }).strokes.length, 0);
  assert.equal(cleanDrawing({ ...drawing, strokes: [{ ...fill, color: 'żółty' }] }).strokes.length, 0);
  // Dotknięcie wnętrza trafia wypełnienie (zaznaczanie, gumka całych kresek), otworu – nie.
  assert.deepEqual(strokesAt([fill], 15, 15, 1), [0]);
  assert.deepEqual(strokesAt([fill], 25, 25, 1), []);
  // Gumka fragmentów – wypełnienie zostaje całe.
  const list = [fill];
  assert.equal(eraseAt(list, 15, 15, 5), false);
  assert.equal(list[0], fill);
  // Przesunięcie, obrót, odbicie, skala – obrysy (liczby punktów) bez zmian, punkt w środku dalej w środku.
  const moved = translateStroke(fill, 100, 0);
  assert.deepEqual(moved.rings, fill.rings);
  assert.equal(fillContains(moved, 115, 15), true);
  assert.equal(fillContains(rotateStroke(fill, 25, 25, Math.PI / 2), 35, 15), true);
  assert.equal(fillContains(mirrorStroke(fill, 'horizontal', 25), 35, 15), true);
  assert.equal(fillContains(scaleStroke(fill, 0, 0, 2), 30, 30), true);
  assert.equal(fillRings(scaleStroke(fill, 0, 0, 2)).length, 2);
  // Narzędzie: grupa „Pisanie”, nazwa „Wiaderko”, kolor zapamiętany na urządzeniu.
  assert.deepEqual(TOOL_GROUPS.find((group) => group.id === 'write').items, ['pen', 'highlighter', 'eraser', 'fill']);
  assert.equal(isModeItem('fill'), true);
  assert.equal(itemLabel('fill'), 'Wiaderko');
  assert.equal(cleanToolSettings(null).fillColor, 'yellow');
  assert.equal(cleanToolSettings({ fillColor: '#123abc' }).fillColor, '#123abc');
  assert.equal(cleanToolSettings({ fillColor: 'tęcza' }).fillColor, 'yellow');
});

test('arkusz 1.63: formaty A3–4A0 (proporcje √2, A3 – 297 mm wysokości = kartka), zmiana formatu w miejscu – obszar kartki na środku, mniejszy format tylko gdy rysunek się mieści; zapis formatu', () => {
  assert.deepEqual(Object.keys(BOARD_FORMATS), ['A3', 'A2', 'A1', 'A0', '2A0', '4A0']);
  assert.deepEqual(BOARD_FORMATS.A3, { width: 2263, height: 1600 });
  assert.deepEqual(BOARD_FORMATS.A0, { width: 6400, height: 4525 });
  assert.deepEqual(BOARD_FORMATS['4A0'], { width: 12800, height: 9051 });
  for (const { width, height } of Object.values(BOARD_FORMATS)) assert.ok(Math.abs(width / height - Math.SQRT2) < 0.001);
  const drawing = emptyDrawing();
  drawing.strokes.push({ tool: 'pen', color: '#1d1d1f', points: [100, 100, 4, 700, 500, 4] });
  assert.equal(setBoard(drawing, true, 'A3'), true);
  assert.deepEqual([boardFormat(drawing), drawing.width, drawing.height, drawing.boardFormat], ['A3', 2263, 1600, 'A3']);
  const a3 = sheetAreaOrigin(drawing);
  assert.deepEqual(a3, { x: Math.round((2263 - PAGE_WIDTH) / 2), y: 250 });
  assert.deepEqual(drawing.strokes[0].points.slice(0, 2), [100 + a3.x, 100 + a3.y]);
  // Na 4A0 – kreska przesuwa się razem z obszarem kartki (to samo miejsce względem kartki).
  assert.equal(setBoard(drawing, true, '4A0'), true);
  const big = sheetAreaOrigin(drawing);
  assert.deepEqual(drawing.strokes[0].points.slice(0, 2), [100 + big.x, 100 + big.y]);
  // Kreska daleko na 4A0 – na A1 się nie mieści, na 2A0 – tak.
  drawing.strokes.push({ tool: 'pen', color: '#1d1d1f', points: [big.x - 3000, big.y, 4, big.x - 2900, big.y, 4] });
  assert.equal(fitsFormat(drawing, 'A1'), false);
  assert.equal(setBoard(drawing, true, 'A1'), false);
  assert.equal(boardFormat(drawing), '4A0');
  assert.equal(fitsFormat(drawing, '2A0'), true);
  // Zapis i odczyt: format zostaje, wymiary zawsze z formatu (A0 – bez pola, jak do 1.62).
  const saved = cleanDrawing(JSON.parse(JSON.stringify({ ...drawing, width: 999 })));
  assert.deepEqual([saved.board, saved.boardFormat, saved.width, saved.height], [true, '4A0', 12800, 9051]);
  assert.equal(saved.strokes[1].points[0], big.x - 3000, 'kreski daleko na arkuszu nie są przycinane');
  drawing.strokes.pop();
  assert.equal(setBoard(drawing, true, 'A0'), true);
  assert.equal('boardFormat' in drawing, false);
  assert.equal(cleanDrawing(JSON.parse(JSON.stringify(drawing))).boardFormat, undefined);
  // Nieznany format – A0; pusty arkusz – obraz w notatce z obszaru kartki.
  assert.deepEqual([cleanDrawing({ ...drawing, boardFormat: 'B1' }).width], [6400]);
  const empty = emptyDrawing();
  setBoard(empty, true, 'A2');
  assert.deepEqual(boardViewport(empty), { ...sheetAreaOrigin(empty), width: PAGE_WIDTH, height: PAGE_HEIGHT });
  // Z powrotem na kartkę zeszytu – rysunek w tym samym miejscu kartki.
  assert.equal(setBoard(drawing, false), true);
  assert.equal(isBoard(drawing), false);
  assert.deepEqual(drawing.strokes[0].points.slice(0, 2), [100, 100]);
});

test('rysunek 1.63: kolor kartki – zapisany, gdy inny niż biały (bez zdjęcia); domyślnie kształty z linią ciągłą bez wypełnienia – ustawienia sprzed 1.63 tracą zapamiętane rodzaje linii i wypełnienia', () => {
  assert.equal(paperColor(emptyDrawing()), '#ffffff');
  const tinted = cleanDrawing({ ...emptyDrawing(), paperColor: '#FBF5E6' });
  assert.equal(tinted.paperColor, '#fbf5e6');
  assert.equal(paperColor(tinted), '#fbf5e6');
  assert.equal('paperColor' in cleanDrawing({ ...emptyDrawing(), paperColor: '#ffffff' }), false);
  assert.equal('paperColor' in cleanDrawing({ ...emptyDrawing(), paperColor: 'beż' }), false);
  const photo = emptyDrawing({ photo: { type: 'image/jpeg', width: 800, height: 600 } });
  assert.equal('paperColor' in cleanDrawing({ ...photo, paperColor: '#fbf5e6' }), false, 'zdjęcie – bez koloru kartki');
  // Ustawienia sprzed 1.63: osiowa prosta, wypełniony prostokąt i wspólna przerywana – od nowa ciągła bez wypełnienia.
  const old = cleanToolSettings({
    shapeDash: 'dashed', shapeFill: 'light',
    shapeStyles: { xline: { dash: 'center' }, rect: { fill: 'solid', hatch: { angle: 135, gap: 6, cross: true } } }
  });
  assert.equal(old.styleDefaults, STYLE_DEFAULTS);
  for (const kind of ['xline', 'rect', 'ellipse']) {
    const { dash, fill } = shapeToolStyle(old, kind);
    assert.deepEqual({ dash, fill }, { dash: 'solid', fill: 'none' }, kind);
  }
  assert.deepEqual(shapeToolStyle(old, 'rect').hatch, { angle: 135, gap: 6, cross: true }, 'kreskowanie zostaje');
  // Wybory po 1.63 są zapamiętywane jak dotąd.
  const fresh = cleanToolSettings({ ...old, shapeStyles: { rect: { fill: 'light' } } });
  assert.equal(shapeToolStyle(fresh, 'rect').fill, 'light');
});
