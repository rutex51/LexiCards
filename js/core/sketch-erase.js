// Gumka przez kształty i bryły (od 1.57) – bez przeglądarki.
//
// Element przecięty gumką – kształt (prostokąt, odcinek, okrąg, wymiar…), bryła, szyk kopii albo diagram – staje się
// zwykłym szkicem piórem: jego linie (obrys, zakończenia odcinka, kreskowanie, osie, linie wymiarów; bryła – krawędzie
// widoczne i niewidoczne obrazka, osie) jako kreski pióra w kolorze elementu, o grubości jego linii, na jego warstwach,
// a gumka ściera z nich fragment. Napisy (liczby wymiarów, tekst kształtu i diagramu), wypełnienie i rodzaj linii
// (przerywana, osiowa) znikają – szkic jest linią ciągłą. Pola tekstowe, wzory, tabele, karteczki i symbole tak się nie
// zmieniają: gumka obszarem usuwa je tylko w całości w obszarze.
//
// Gumka obszarem („Zaznaczenie”: prostokąt albo lasso) ściera wszystko w środku obszaru – kreski cięte dokładnie na jego
// brzegu (splitByPolygon, jak przy zaznaczaniu fragmentów). Gumka fragmentów z opcją „Także kształty” robi to samo
// w kole gumki (eraseFromStroke).

import { expandArray, isArray } from './arrays.js';
import { diagramLayout } from './diagrams.js';
import { addPoint, eraseFromStroke, isElement, splitByPolygon, strokeBounds } from './drawing.js';
import { dimGeometry, isMeasure, segmentCapList, shapeAxes, shapeHatch, shapeInnerLines, shapeOutline, shownDims, dimKeys } from './shapes.js';
import { solidGeometry } from './solids.js';

/** Elementy, które gumka zamienia na szkic. */
const SKETCHED = ['shape', 'solid', 'array', 'diagram'];
export const canSketch = (stroke) => SKETCHED.includes(stroke?.tool);
const DEFAULT_SIZE = 2;
const CIRCLE_STEPS = 32;
/**
 * Odstęp punktów szkicu (jednostki strony): kreska pióra jest rysowana wygładzona, więc rzadkie punkty (np. narożniki
 * prostokąta) dałyby zaokrąglenia – gęste punkty na prostych odcinkach zostawiają narożniki ostre.
 */
const SKETCH_STEP = 2;

const circlePath = ({ x, y, r }) => ({
  points: Array.from({ length: CIRCLE_STEPS }, (_, index) => ({
    x: x + r * Math.cos((index / CIRCLE_STEPS) * Math.PI * 2), y: y + r * Math.sin((index / CIRCLE_STEPS) * Math.PI * 2)
  })),
  closed: true
});
const arcPath = (center, radius, start, sweep) => {
  const steps = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
  return {
    points: Array.from({ length: steps + 1 }, (_, index) => {
      const angle = start + (sweep * index) / steps;
      return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    }),
    closed: false
  };
};
const pairPath = ([a, b]) => ({ points: [a, b], closed: false });

/** Linie wymiaru `key` kształtu: linie pomocnicze, linia wymiarowa albo łuk (bez liczby i grotów). */
function dimPaths(shape, key) {
  const geometry = dimGeometry(shape, key);
  if (geometry.kind === 'linear') return [...(geometry.ext ?? []).map(pairPath), pairPath([geometry.from, geometry.to])];
  return [
    ...(geometry.ref ? [pairPath(geometry.ref)] : []), ...(geometry.exts ?? []).map(pairPath),
    ...(Math.abs(geometry.sweep) > 1e-3 ? [arcPath(geometry.center, geometry.radius, geometry.start, geometry.sweep)] : [])
  ];
}

/** Linie kształtu jako łamane punktów strony. */
function shapePaths(shape) {
  const outline = shapeOutline(shape);
  const points = [];
  for (let index = 0; index + 1 < outline.points.length; index += 2) points.push({ x: outline.points[index], y: outline.points[index + 1] });
  const paths = [{ points, closed: outline.closed }];
  for (const cap of segmentCapList(shape)) {
    if (cap.arms) paths.push({ points: [cap.arms[0], cap.tip, cap.arms[1]], closed: false });
    if (cap.polygon) paths.push({ points: cap.polygon, closed: true });
    if (cap.circle) paths.push(circlePath(cap.circle));
  }
  for (const pair of [...shapeInnerLines(shape), ...shapeHatch(shape), ...shapeAxes(shape)]) paths.push(pairPath(pair));
  // Wymiar (narzędzie „Wymiar”) – jego linie pomocnicze; stałe wymiary kształtu – całe (linia wymiarowa jest w obrysie wymiaru).
  if (isMeasure(shape)) paths.push(...dimPaths(shape, dimKeys(shape)[0]).slice(0, -1));
  for (const key of shownDims(shape)) paths.push(...dimPaths(shape, key));
  return paths;
}

/** Linie diagramu (bez napisów). */
function diagramPaths(element, context) {
  const geometry = diagramLayout(element, context);
  const paths = [...(geometry.spine ? [geometry.spine] : []), ...(geometry.lines ?? [])].map(pairPath);
  for (const { from, to } of geometry.arrows ?? []) paths.push(pairPath([from, to]));
  for (const box of geometry.boxes ?? []) {
    paths.push({ points: [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }], closed: true });
  }
  for (const circle of geometry.circles ?? []) paths.push(circlePath(circle));
  for (const item of geometry.polys ?? []) paths.push({ points: item.points, closed: Boolean(item.closed) });
  return paths;
}

/** Łamana punktów strony jako kreska pióra (odcinki zagęszczone co SKETCH_STEP). */
function penStroke(base, path, width) {
  const stroke = { ...base, points: [] };
  const list = path.closed && path.points.length > 2 ? [...path.points, path.points[0]] : path.points;
  list.forEach((point, index) => {
    const previous = list[index - 1];
    if (previous) {
      const steps = Math.floor(Math.hypot(point.x - previous.x, point.y - previous.y) / SKETCH_STEP);
      for (let step = 1; step < steps; step += 1) {
        addPoint(stroke, { x: previous.x + ((point.x - previous.x) * step) / steps, y: previous.y + ((point.y - previous.y) * step) / steps, w: width });
      }
    }
    addPoint(stroke, { x: point.x, y: point.y, w: width });
  });
  return stroke;
}

/**
 * Element jako szkic piórem: lista kresek pióra (pusta – element bez linii albo taki, którego gumka nie zamienia).
 * context.strokes – rysunek (diagram koncentracji wad liczy znaczniki).
 */
export function elementSketch(element, context = {}) {
  if (!canSketch(element)) return [];
  if (isArray(element)) {
    // Kopie szyku – każda osobno (kreski pióra zostają kreskami), na warstwach szyku.
    return expandArray(element).flatMap((item) => {
      const copy = element.layers ? { ...item, layers: element.layers } : item;
      return isElement(copy) ? elementSketch(copy, context) : [copy];
    });
  }
  const base = { tool: 'pen', color: element.color ?? '#1d1d1f', ...(element.layers ? { layers: element.layers } : {}) };
  const width = element.size ?? DEFAULT_SIZE;
  let paths;
  if (element.tool === 'shape') paths = shapePaths(element);
  else if (element.tool === 'diagram') paths = diagramPaths(element, context);
  else {
    const geometry = solidGeometry(element);
    paths = [...geometry.visible, ...(element.edges === 'none' ? [] : geometry.hidden), ...(geometry.axes ?? []).map(pairPath)];
  }
  return paths.filter((path) => path.points.length > 0).map((path) => penStroke(base, path, width)).filter((stroke) => stroke.points.length > 0);
}

const overlaps = (bounds, area, pad = 0) => !(bounds.maxX < area.minX - pad || bounds.minX > area.maxX + pad || bounds.maxY < area.minY - pad || bounds.minY > area.maxY + pad);

/**
 * Gumka obszarem (od 1.57): wszystko w wielokącie `polygon` [x, y, …] znika – kreski cięte na brzegu, elementy, których
 * linii dotyka obszar, zamienione na szkic i przycięte, pola tekstowe i podobne – tylko w całości w obszarze. Zmienia
 * listę `strokes` w miejscu; canErase(element) – pomija elementy ukrytych warstw. Zwraca, czy coś starła.
 */
export function eraseArea(strokes, polygon, { canErase = null, context = {} } = {}) {
  const xs = polygon.filter((_, index) => index % 2 === 0);
  const ys = polygon.filter((_, index) => index % 2 === 1);
  const area = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  let changed = false;
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index];
    if (canErase && !canErase(stroke)) continue;
    if (!overlaps(strokeBounds(stroke), area)) continue;
    if (!canSketch(stroke)) {
      // Kreska – cięta na brzegu; pole tekstowe i podobne – w całości w obszarze albo wcale.
      const parts = splitByPolygon(stroke, polygon);
      if (!parts) continue;
      strokes.splice(index, 1, ...(isElement(stroke) ? [] : parts.outside));
      changed = true;
      continue;
    }
    let touched = false;
    const kept = [];
    for (const line of elementSketch(stroke, { strokes, ...context })) {
      const parts = splitByPolygon(line, polygon);
      if (parts) touched = true;
      kept.push(...(parts ? parts.outside : [line]));
    }
    // Obszar w środku elementu, ale bez jego linii (np. w pustym prostokącie) – element zostaje sobą.
    if (!touched) continue;
    strokes.splice(index, 1, ...kept);
    changed = true;
  }
  return changed;
}

/**
 * Gumka fragmentów przez kształty (od 1.57): element, którego linii dotyka koło gumki (x, y, radius), staje się szkicem
 * i traci starty fragment; zwykłe kreski – jak eraseAt. Zmienia listę `strokes` w miejscu; zwraca, czy coś starła.
 */
export function eraseElementsAt(strokes, x, y, radius, { canErase = null, context = {} } = {}) {
  const area = { minX: x, maxX: x, minY: y, maxY: y };
  let changed = false;
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index];
    if (!canSketch(stroke) || (canErase && !canErase(stroke))) continue;
    if (!overlaps(strokeBounds(stroke), area, radius + (stroke.size ?? DEFAULT_SIZE))) continue;
    let touched = false;
    const kept = [];
    for (const line of elementSketch(stroke, { strokes, ...context })) {
      const pieces = eraseFromStroke(line, x, y, radius);
      if (pieces) touched = true;
      kept.push(...(pieces ?? [line]));
    }
    if (!touched) continue;
    strokes.splice(index, 1, ...kept);
    changed = true;
  }
  return changed;
}
