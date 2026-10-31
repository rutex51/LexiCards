// Tablica A0 (od 1.59) – bez przeglądarki.
//
// Kartka rysunku może być dużym arkuszem zamiast kartki zeszytu: bez pierścieni i wyglądu zeszytu, cztery razy szersza
// i wyższa. Gdy kartka zeszytu to A4 (1600 jednostek – 297 mm), tablica ma wymiary A0 (1189 × 841 mm, proporcje √2).
// Od 1.61 kartka zeszytu leży na środku tablicy (SHEET_X, SHEET_Y) – przy zamianie rysunek przesuwa się o to
// przesunięcie, więc w edytorze zostaje w tym samym miejscu ekranu (tablica ma skalę zeszytu). Z tablicy na kartkę – tylko
// gdy cały rysunek mieści się w obszarze kartki. Obraz tablicy w notatce to obszar z rysunkiem (z marginesem)
// w proporcjach kartki, przeskalowany do wielkości obrazu kartki.

import { BOARD_HEIGHT, BOARD_SHEET, BOARD_WIDTH, PAGE_HEIGHT, PAGE_WIDTH, PAPER_STEP, strokeBounds, translateStroke } from './drawing.js';

export { BOARD_HEIGHT, BOARD_WIDTH };
/** Margines wokół rysunku na obrazie tablicy (jednostki rysunku). */
const BOARD_MARGIN = PAPER_STEP;

export const isBoard = (drawing) => Boolean(drawing?.board);
/** Lewy górny róg obszaru kartki zeszytu na tablicy (od 1.61 – na środku; w 1.59–1.60 – w rogu tablicy). */
export const SHEET_X = BOARD_SHEET.x;
export const SHEET_Y = BOARD_SHEET.y;

/** Przesuwa cały rysunek (kreski, szablon, początek układu) o (dx, dy) – w miejscu. */
export function shiftDrawing(drawing, dx, dy) {
  drawing.strokes.splice(0, drawing.strokes.length, ...drawing.strokes.map((stroke) => translateStroke(stroke, dx, dy)));
  if (drawing.template) drawing.template = { ...drawing.template, x: drawing.template.x + dx, y: drawing.template.y + dy };
  if (drawing.origin) drawing.origin = { ...drawing.origin, x: drawing.origin.x + dx, y: drawing.origin.y + dy };
}

/** Granice rysunku – kresek i elementów (szablon to tło, nie liczy się) – albo null: pusta kartka. */
export function contentBounds(drawing) {
  let bounds = null;
  const add = (box) => {
    if (!box || !Number.isFinite(box.minX) || !Number.isFinite(box.maxX)) return;
    bounds = bounds
      ? { minX: Math.min(bounds.minX, box.minX), minY: Math.min(bounds.minY, box.minY), maxX: Math.max(bounds.maxX, box.maxX), maxY: Math.max(bounds.maxY, box.maxY) }
      : { ...box };
  };
  for (const stroke of drawing.strokes ?? []) add(strokeBounds(stroke));
  return bounds;
}

/** Czy rysunek tablicy mieści się w obszarze kartki zeszytu (od 1.61 – na środku tablicy). */
export function fitsSheet(drawing) {
  const bounds = contentBounds(drawing);
  // Granice kresek obejmują ich grubość – kreska przy brzegu kartki wystaje o pół grubości.
  const slack = 12;
  return !bounds || (bounds.minX >= SHEET_X - slack && bounds.minY >= SHEET_Y - slack
    && bounds.maxX <= SHEET_X + PAGE_WIDTH + slack && bounds.maxY <= SHEET_Y + PAGE_HEIGHT + slack);
}

/** Wymiary i znacznik rysunku jako tablicy (kartka ze zdjęciem – bez zmian): { board, width, height }. */
export function boardShape(drawing, board) {
  if (drawing.photo) return null;
  return board ? { board: true, width: BOARD_WIDTH, height: BOARD_HEIGHT } : { board: false, width: PAGE_WIDTH, height: PAGE_HEIGHT };
}

/**
 * Zamiana kartki na tablicę albo tablicy na kartkę – w miejscu (lista kresek zostaje tym samym obiektem); od 1.61
 * rysunek przesuwa się na środek tablicy i z powrotem. Zwraca true; false – zamiana niemożliwa (zdjęcie albo rysunek
 * wychodzi poza obszar kartki).
 */
export function setBoard(drawing, board) {
  const shape = boardShape(drawing, board);
  if (!shape) return false;
  if (isBoard(drawing) === board) return true;
  if (!board && !fitsSheet(drawing)) return false;
  shiftDrawing(drawing, board ? SHEET_X : -SHEET_X, board ? SHEET_Y : -SHEET_Y);
  drawing.width = shape.width;
  drawing.height = shape.height;
  if (board) drawing.board = true;
  else delete drawing.board;
  return true;
}

/**
 * Obszar tablicy na obraz w notatce: rysunek z marginesem, w proporcjach kartki, co najmniej wielkości kartki (mały
 * rysunek nie jest powiększany), w obrębie tablicy. { x, y, width, height } w jednostkach rysunku.
 */
export function boardViewport(drawing) {
  const bounds = contentBounds(drawing);
  // Pusta tablica – obszar kartki zeszytu.
  if (!bounds) return { x: SHEET_X, y: SHEET_Y, width: PAGE_WIDTH, height: PAGE_HEIGHT };
  const ratio = PAGE_WIDTH / PAGE_HEIGHT;
  let width = Math.max(bounds.maxX - bounds.minX + BOARD_MARGIN * 2, PAGE_WIDTH);
  let height = Math.max(bounds.maxY - bounds.minY + BOARD_MARGIN * 2, PAGE_HEIGHT);
  if (width / height > ratio) height = width / ratio;
  else width = height * ratio;
  const fit = Math.min(1, drawing.width / width, drawing.height / height);
  width *= fit;
  height *= fit;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  return {
    x: clamp((bounds.minX + bounds.maxX) / 2 - width / 2, 0, drawing.width - width),
    y: clamp((bounds.minY + bounds.maxY) / 2 - height / 2, 0, drawing.height - height),
    width,
    height
  };
}
