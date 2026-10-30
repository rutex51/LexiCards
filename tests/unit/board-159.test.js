import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BOARD_HEIGHT, BOARD_WIDTH, boardViewport, contentBounds, fitsSheet, isBoard, setBoard } from '../../js/core/board.js';
import { PAGE_HEIGHT, PAGE_WIDTH, cleanDrawing, emptyDrawing } from '../../js/core/drawing.js';

const pen = (points, w = 4) => ({ tool: 'pen', color: '#1d1d1f', points: points.flatMap(([x, y]) => [x, y, w]) });

test('tablica A0 (1.59): 4 × kartka, proporcje √2; zamiana w miejscu, te same współrzędne; zdjęcie – bez zamiany', () => {
  assert.equal(BOARD_WIDTH, PAGE_WIDTH * 4);
  assert.ok(Math.abs(BOARD_WIDTH / BOARD_HEIGHT - Math.SQRT2) < 0.001, 'proporcje A0');
  const drawing = emptyDrawing();
  drawing.strokes.push(pen([[100, 100], [700, 500]]));
  assert.equal(setBoard(drawing, true), true);
  assert.deepEqual([drawing.board, drawing.width, drawing.height], [true, BOARD_WIDTH, BOARD_HEIGHT]);
  assert.deepEqual(drawing.strokes[0].points.slice(0, 2), [100, 100], 'kreska na miejscu');
  // Zapis i odczyt – tablica zostaje tablicą, kreski daleko na tablicy nie są przycinane.
  drawing.strokes.push(pen([[6000, 4000], [6300, 4400]]));
  const saved = cleanDrawing(JSON.parse(JSON.stringify(drawing)));
  assert.deepEqual([saved.board, saved.width, saved.height], [true, BOARD_WIDTH, BOARD_HEIGHT]);
  assert.deepEqual(saved.strokes[1].points.slice(3, 5), [6300, 4400]);
  // Z tablicy na kartkę – tylko gdy wszystko mieści się w obszarze kartki.
  assert.equal(fitsSheet(drawing), false);
  assert.equal(setBoard(drawing, false), false, 'rysunek poza obszarem kartki');
  assert.equal(isBoard(drawing), true);
  drawing.strokes.pop();
  assert.equal(setBoard(drawing, false), true);
  assert.deepEqual([drawing.board, drawing.width, drawing.height], [undefined, PAGE_WIDTH, PAGE_HEIGHT]);
  // Kreska przy samym brzegu kartki (grubość wystaje) – mieści się.
  const edge = emptyDrawing();
  edge.strokes.push(pen([[0, 0], [PAGE_WIDTH, PAGE_HEIGHT]], 8));
  setBoard(edge, true);
  assert.equal(fitsSheet(edge), true);
  // Zdjęcie – bez tablicy; „board” zdjęcia z pliku jest pomijany.
  const photo = emptyDrawing({ photo: { type: 'image/jpeg', width: 800, height: 600 } });
  assert.equal(setBoard(photo, true), false);
  assert.equal(cleanDrawing({ ...photo, board: true }).board, undefined);
});

test('tablica A0 (1.59): obraz do notatki – obszar z rysunkiem w proporcjach kartki, co najmniej kartka, w obrębie tablicy', () => {
  const board = emptyDrawing();
  setBoard(board, true);
  // Pusta – obszar kartki zeszytu.
  assert.deepEqual(boardViewport(board), { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });
  // Mały rysunek w środku tablicy – obszar wielkości kartki wokół niego (bez powiększania).
  board.strokes.push(pen([[3000, 2000], [3200, 2100]]));
  const small = boardViewport(board);
  assert.deepEqual([small.width, small.height], [PAGE_WIDTH, PAGE_HEIGHT]);
  assert.ok(Math.abs(small.x + small.width / 2 - 3100) < 1 && Math.abs(small.y + small.height / 2 - 2050) < 1, 'na środku rysunku');
  // Rysunek na pół tablicy – obszar większy (z marginesem), proporcje kartki, cały rysunek w środku.
  board.strokes.push(pen([[400, 300], [3600, 2500]]));
  const wide = boardViewport(board);
  const bounds = contentBounds(board);
  assert.ok(Math.abs(wide.width / wide.height - PAGE_WIDTH / PAGE_HEIGHT) < 1e-9, 'proporcje kartki');
  assert.ok(wide.x <= bounds.minX && wide.y <= bounds.minY && wide.x + wide.width >= bounds.maxX && wide.y + wide.height >= bounds.maxY, 'cały rysunek');
  // Przy brzegu tablicy – przesunięty do środka, nie wychodzi poza tablicę.
  board.strokes.splice(0, 2, pen([[6300, 4400], [6390, 4500]]));
  const corner = boardViewport(board);
  assert.deepEqual([corner.x + corner.width, corner.y + corner.height].map(Math.round), [BOARD_WIDTH, BOARD_HEIGHT]);
  // Rysunek na całej tablicy – cała szerokość tablicy.
  board.strokes.push(pen([[10, 10], [6390, 4515]]));
  const all = boardViewport(board);
  assert.ok(Math.abs(all.width - BOARD_WIDTH) < 1 && all.x === 0 && all.y >= 0 && all.y + all.height <= BOARD_HEIGHT + 1e-9);
});
