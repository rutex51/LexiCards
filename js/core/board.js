// Arkusz (od 1.59 jako „tablica A0”, od 1.63 w formatach A3–4A0) – bez przeglądarki.
//
// Kartka rysunku może być dużym arkuszem zamiast kartki zeszytu: bez pierścieni i wyglądu zeszytu. Gdy kartka zeszytu
// to A4 (1600 jednostek – 297 mm), arkusz ma wymiary swojego formatu (A0 – 1189 × 841 mm, cztery razy szerszy
// i wyższy od kartki; proporcje √2; BOARD_FORMATS w core/drawing.js). Od 1.61 kartka zeszytu leży na środku arkusza
// (sheetAreaOrigin) – przy zamianie rysunek przesuwa się o to przesunięcie, więc w edytorze zostaje w tym samym miejscu
// ekranu (arkusz ma skalę zeszytu); przy zmianie formatu (od 1.63) – o różnicę położeń obszaru kartki. Z arkusza na
// kartkę albo na mniejszy format – tylko gdy cały rysunek się mieści. Obraz arkusza w notatce to obszar z rysunkiem
// (z marginesem) w proporcjach kartki, przeskalowany do wielkości obrazu kartki.

import {
  BOARD_FORMATS, BOARD_FORMAT_IDS, BOARD_HEIGHT, BOARD_SHEET, BOARD_WIDTH, DEFAULT_BOARD_FORMAT, PAGE_HEIGHT, PAGE_WIDTH, PAPER_STEP,
  strokeBounds, translateStroke
} from './drawing.js';

export { BOARD_FORMATS, BOARD_FORMAT_IDS, BOARD_HEIGHT, BOARD_WIDTH, DEFAULT_BOARD_FORMAT };
/** Margines wokół rysunku na obrazie arkusza (jednostki rysunku). */
const BOARD_MARGIN = PAPER_STEP;
/** Granice kresek obejmują ich grubość – kreska przy brzegu wystaje o pół grubości. */
const SLACK = 12;

export const isBoard = (drawing) => Boolean(drawing?.board);
/** Format arkusza ('A3' … '4A0'; bez zapisanego – A0) albo null – kartka zeszytu. */
export const boardFormat = (drawing) => (isBoard(drawing) ? (BOARD_FORMAT_IDS.includes(drawing.boardFormat) ? drawing.boardFormat : DEFAULT_BOARD_FORMAT) : null);
/** Lewy górny róg obszaru kartki zeszytu na arkuszu A0 (od 1.61 – na środku; w 1.59–1.60 – w rogu). */
export const SHEET_X = BOARD_SHEET.x;
export const SHEET_Y = BOARD_SHEET.y;
/** Lewy górny róg obszaru kartki zeszytu na środku arkusza o wymiarach width × height. */
const originIn = (width, height) => ({ x: Math.round((width - PAGE_WIDTH) / 2), y: Math.round((height - PAGE_HEIGHT) / 2) });
/** Lewy górny róg obszaru kartki zeszytu na arkuszu rysunku (kartka zeszytu – 0, 0). */
export const sheetAreaOrigin = (drawing) => (isBoard(drawing) ? originIn(drawing.width, drawing.height) : { x: 0, y: 0 });

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

/** Czy rysunek arkusza mieści się w obszarze kartki zeszytu (od 1.61 – na środku arkusza). */
export function fitsSheet(drawing) {
  const bounds = contentBounds(drawing);
  const origin = sheetAreaOrigin(drawing);
  return !bounds || (bounds.minX >= origin.x - SLACK && bounds.minY >= origin.y - SLACK
    && bounds.maxX <= origin.x + PAGE_WIDTH + SLACK && bounds.maxY <= origin.y + PAGE_HEIGHT + SLACK);
}

/** Wymiary rysunku w formacie `format` ('A3' … '4A0'; null – kartka zeszytu): { width, height }. */
const sizeOf = (format) => (format ? BOARD_FORMATS[format] : { width: PAGE_WIDTH, height: PAGE_HEIGHT });

/**
 * Czy rysunek zmieści się w formacie `format` (null – kartka zeszytu) po przesunięciu razem z obszarem kartki zeszytu
 * (od 1.63). Kartka ze zdjęciem – nie.
 */
export function fitsFormat(drawing, format) {
  if (drawing.photo) return false;
  if (!format) return isBoard(drawing) ? fitsSheet(drawing) : true;
  const bounds = contentBounds(drawing);
  if (!bounds) return true;
  const size = sizeOf(format);
  const from = sheetAreaOrigin(drawing);
  const to = originIn(size.width, size.height);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return bounds.minX + dx >= -SLACK && bounds.minY + dy >= -SLACK && bounds.maxX + dx <= size.width + SLACK && bounds.maxY + dy <= size.height + SLACK;
}

/**
 * Zamiana kartki na arkusz, arkusza na kartkę albo (od 1.63) formatu arkusza – w miejscu (lista kresek zostaje tym
 * samym obiektem); rysunek przesuwa się razem z obszarem kartki zeszytu (na środku arkusza). board – true albo
 * format; format – A3 … 4A0 (bez – A0). Zwraca true; false – zamiana niemożliwa (zdjęcie albo rysunek wychodzi
 * poza obszar kartki czy mniejszy arkusz).
 */
export function setBoard(drawing, board, format = DEFAULT_BOARD_FORMAT) {
  if (drawing.photo) return false;
  const target = board ? (BOARD_FORMAT_IDS.includes(format) ? format : DEFAULT_BOARD_FORMAT) : null;
  if (boardFormat(drawing) === target) return true;
  if (!fitsFormat(drawing, target)) return false;
  const size = sizeOf(target);
  const from = sheetAreaOrigin(drawing);
  const to = target ? originIn(size.width, size.height) : { x: 0, y: 0 };
  shiftDrawing(drawing, to.x - from.x, to.y - from.y);
  drawing.width = size.width;
  drawing.height = size.height;
  if (target) drawing.board = true;
  else delete drawing.board;
  if (target && target !== DEFAULT_BOARD_FORMAT) drawing.boardFormat = target;
  else delete drawing.boardFormat;
  return true;
}

/**
 * Obszar arkusza na obraz w notatce: rysunek z marginesem, w proporcjach kartki, co najmniej wielkości kartki (mały
 * rysunek nie jest powiększany), w obrębie arkusza. { x, y, width, height } w jednostkach rysunku.
 */
export function boardViewport(drawing) {
  const bounds = contentBounds(drawing);
  // Pusty arkusz – obszar kartki zeszytu.
  if (!bounds) return { ...sheetAreaOrigin(drawing), width: PAGE_WIDTH, height: PAGE_HEIGHT };
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
