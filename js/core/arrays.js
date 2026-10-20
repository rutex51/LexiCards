// Szyk na rysunku (od 1.19) – bez przeglądarki: zaznaczone kreski, pola, wzory i kształty powielone
// w szyku liniowym (rzędy i obiekty w rzędzie) albo kołowym (wokół środka, w pierścieniach). Szyk
// jest jednym elementem rysunku z parametrami – przesuwa się w całości, parametry można zmienić,
// a „Rozdziel” zamienia go na niezależne elementy (expandArray).
//
// Szyk { tool: 'array', kind: 'linear' | 'polar', items, … }:
//   items – elementy źródła (kreski pióra i zakreślacza, pola tekstowe, wzory, kształty; bez szyków);
//   liniowy: columns – obiektów w rzędzie, rows – rzędów, dx – przesunięcie kolejnego obiektu w rzędzie,
//   dy – kolejnego rzędu (jednostki strony, mogą być ujemne);
//   kołowy: count – obiektów w pierścieniu, sweep – kąt wypełnienia w stopniach (360 – pełne koło, inaczej
//   pierwszy i ostatni obiekt na końcach łuku; dodatni – przeciwnie do ruchu wskazówek zegara, jak na
//   linijce), rings – pierścieni, ringStep – odstęp pierścieni (od środka na zewnątrz), (cx, cy) – środek,
//   rotate – czy obiekty obracają się razem z położeniem (pola tekstowe i wzory zawsze stoją prosto).

import { withoutLinks } from './attach.js';
import { isShape, shapeBounds, translateShape } from './shapes.js';

export const ARRAY_KINDS = Object.freeze(['linear', 'polar']);
export const ARRAY_LABELS = Object.freeze({ linear: 'Szyk liniowy', polar: 'Szyk kołowy' });
/** Najwięcej kopii w szyku (razem z pierwszą) i elementów źródła. */
export const ARRAY_MAX = 400;
export const ARRAY_ITEMS_MAX = 500;

export const isArray = (stroke) => stroke?.tool === 'array';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const count = (value, fallback, max) => (finite(value) ? clamp(Math.round(value), 1, max) : fallback);

/** Granice elementu bez grubości (wystarczą do środka źródła). */
function roughBounds(stroke) {
  if (isShape(stroke)) return shapeBounds(stroke);
  if (stroke.tool === 'text' || stroke.tool === 'math') return { minX: stroke.x, minY: stroke.y, maxX: stroke.x + stroke.width, maxY: stroke.y + stroke.height };
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let index = 0; index < stroke.points.length; index += 3) {
    bounds.minX = Math.min(bounds.minX, stroke.points[index]);
    bounds.maxX = Math.max(bounds.maxX, stroke.points[index]);
    bounds.minY = Math.min(bounds.minY, stroke.points[index + 1]);
    bounds.maxY = Math.max(bounds.maxY, stroke.points[index + 1]);
  }
  return bounds;
}

/** Granice elementów źródła szyku. */
export function itemsBounds(items) {
  const all = items.map(roughBounds);
  return {
    minX: Math.min(...all.map((bounds) => bounds.minX)), minY: Math.min(...all.map((bounds) => bounds.minY)),
    maxX: Math.max(...all.map((bounds) => bounds.maxX)), maxY: Math.max(...all.map((bounds) => bounds.maxY))
  };
}

const centerOf = (bounds) => ({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 });

/** Element przesunięty o (dx, dy) – nowy obiekt. */
export function translateItem(stroke, dx, dy) {
  if (dx === 0 && dy === 0) return stroke;
  if (isShape(stroke)) return translateShape(stroke, dx, dy);
  if (stroke.tool === 'text' || stroke.tool === 'math') return { ...stroke, x: round(stroke.x + dx, 1), y: round(stroke.y + dy, 1) };
  const points = stroke.points.slice();
  for (let index = 0; index < points.length; index += 3) {
    points[index] = round(points[index] + dx, 1);
    points[index + 1] = round(points[index + 1] + dy, 1);
  }
  return { tool: stroke.tool, color: stroke.color, points };
}

/**
 * Element obrócony wokół (cx, cy) o `angle` (radiany, jak na ekranie – dodatni zgodnie z ruchem
 * wskazówek zegara): `turn` – obraca też sam element (kreski, kształty); bez tego – tylko jego
 * położenie. Pola tekstowe i wzory nie mają obrotu – przesuwa się ich środek.
 */
export function rotateItem(stroke, cx, cy, angle, turn = true) {
  if (angle === 0) return stroke;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const spin = (x, y) => ({ x: cx + (x - cx) * cos - (y - cy) * sin, y: cy + (x - cx) * sin + (y - cy) * cos });
  const isPen = !isShape(stroke) && stroke.tool !== 'text' && stroke.tool !== 'math';
  if (isPen && turn) {
    const points = stroke.points.slice();
    for (let index = 0; index < points.length; index += 3) {
      const point = spin(points[index], points[index + 1]);
      points[index] = round(point.x, 1);
      points[index + 1] = round(point.y, 1);
    }
    return { tool: stroke.tool, color: stroke.color, points };
  }
  if (isShape(stroke)) {
    const center = spin(stroke.x, stroke.y);
    const next = { ...stroke, x: round(center.x), y: round(center.y) };
    if (turn) {
      const raw = stroke.angle + angle;
      next.angle = Math.atan2(Math.sin(raw), Math.cos(raw));
      if (next.angle <= -Math.PI + 1e-12) next.angle = Math.PI;
    }
    return next;
  }
  // Bez obrotu: środek elementu idzie po okręgu, element zostaje prosto.
  const middle = centerOf(roughBounds(stroke));
  const moved = spin(middle.x, middle.y);
  return translateItem(stroke, moved.x - middle.x, moved.y - middle.y);
}

/** Kąt kolejnego obiektu szyku kołowego (stopnie). */
export function polarStep(array) {
  if (array.sweep >= 360) return 360 / array.count;
  return array.count > 1 ? array.sweep / (array.count - 1) : 0;
}

/** Położenia kopii szyku: [{ dx, dy } albo { ring, angle }] – pierwsza to samo źródło. */
function placements(array) {
  const list = [];
  if (array.kind === 'linear') {
    for (let row = 0; row < array.rows; row += 1) {
      for (let column = 0; column < array.columns; column += 1) list.push({ dx: column * array.dx, dy: row * array.dy });
    }
    return list;
  }
  const step = polarStep(array);
  for (let ring = 0; ring < array.rings; ring += 1) {
    for (let index = 0; index < array.count; index += 1) list.push({ ring, angle: (-index * step * Math.PI) / 180 });
  }
  return list;
}

/** Liczba kopii szyku (razem z pierwszą). */
export const arraySize = (array) => (array.kind === 'linear' ? array.columns * array.rows : array.count * array.rings);

const expanded = new WeakMap();

/**
 * Wszystkie elementy szyku – kopie źródła na swoich miejscach (pierwsza kopia to źródło), jako
 * niezależne elementy (kolejność: kopia po kopii). Wynik zapamiętany – szyk się nie zmienia (zmiana
 * daje nowy obiekt).
 */
export function expandArray(array) {
  let items = expanded.get(array);
  if (items) return items;
  items = [];
  if (array.kind === 'linear') {
    for (const { dx, dy } of placements(array)) items.push(...array.items.map((item) => translateItem(item, dx, dy)));
  } else {
    // Pierścień dalej od środka: źródło przesunięte wzdłuż promienia (od środka przez środek źródła).
    const source = centerOf(itemsBounds(array.items));
    const [rx, ry] = [source.x - array.cx, source.y - array.cy];
    const distance = Math.hypot(rx, ry);
    const [ux, uy] = distance > 1e-9 ? [rx / distance, ry / distance] : [0, -1];
    for (const { ring, angle } of placements(array)) {
      items.push(...array.items.map((item) => rotateItem(translateItem(item, ux * ring * array.ringStep, uy * ring * array.ringStep), array.cx, array.cy, angle, array.rotate)));
    }
  }
  expanded.set(array, items);
  return items;
}

/** Szyk przesunięty o (dx, dy) – nowy obiekt (źródło i środek). */
export function translateArray(array, dx, dy) {
  const next = { ...array, items: array.items.map((item) => translateItem(item, dx, dy)) };
  if (array.kind === 'polar') {
    next.cx = round(array.cx + dx);
    next.cy = round(array.cy + dy);
  }
  return next;
}

/** Odległość środka szyku kołowego od środka źródła (promień pierwszego pierścienia). */
export function polarRadius(array) {
  const source = centerOf(itemsBounds(array.items));
  return Math.hypot(source.x - array.cx, source.y - array.cy);
}

/** Szyk kołowy z innym promieniem – środek przesunięty wzdłuż tej samej prostej (domyślnie pod źródłem). */
export function withPolarRadius(array, radius) {
  const source = centerOf(itemsBounds(array.items));
  const [rx, ry] = [array.cx - source.x, array.cy - source.y];
  const distance = Math.hypot(rx, ry);
  const [ux, uy] = distance > 1e-9 ? [rx / distance, ry / distance] : [0, 1];
  return { ...array, cx: round(source.x + ux * radius), cy: round(source.y + uy * radius) };
}

/**
 * Parametry nowego szyku dla elementów `items`: liniowy – trzy obiekty w rzędzie, odstęp o pół kratki
 * większy niż szerokość źródła; kołowy – sześć obiektów na pełnym kole, środek pod źródłem.
 */
export function arrayDefaults(items, kind, step = 44) {
  const bounds = itemsBounds(items);
  const [width, height] = [bounds.maxX - bounds.minX, bounds.maxY - bounds.minY];
  const center = centerOf(bounds);
  if (kind === 'linear') return { kind, columns: 3, rows: 1, dx: round(width + step / 2, 0), dy: round(height + step / 2, 0) };
  const radius = round(Math.max(width, height) * 1.2 + step, 0);
  return { kind, count: 6, sweep: 360, rings: 1, ringStep: round(Math.max(width, height) + step / 2, 0), cx: round(center.x), cy: round(center.y + radius), rotate: true };
}

/**
 * Sprawdzone parametry szyku (nowy szyk, zmiana parametrów, zapis): liczby ograniczone tak, żeby
 * kopii było najwyżej ARRAY_MAX. `limit` – największe przesunięcie (kilka stron).
 */
export function cleanArrayParams(raw, limit) {
  if (!raw || !ARRAY_KINDS.includes(raw.kind)) return null;
  const distance = (value, fallback) => (finite(value) ? round(clamp(value, -limit, limit)) : fallback);
  if (raw.kind === 'linear') {
    const columns = count(raw.columns, 3, ARRAY_MAX);
    const rows = count(raw.rows, 1, Math.max(1, Math.floor(ARRAY_MAX / columns)));
    return { kind: 'linear', columns, rows, dx: distance(raw.dx, 0), dy: distance(raw.dy, 0) };
  }
  const total = count(raw.count, 6, ARRAY_MAX);
  const rings = count(raw.rings, 1, Math.max(1, Math.floor(ARRAY_MAX / total)));
  return {
    kind: 'polar',
    count: total,
    sweep: finite(raw.sweep) ? round(clamp(raw.sweep, 1, 360)) : 360,
    rings,
    ringStep: finite(raw.ringStep) ? round(clamp(Math.abs(raw.ringStep), 0, limit)) : 0,
    cx: distance(raw.cx, 0),
    cy: distance(raw.cy, 0),
    rotate: raw.rotate !== false
  };
}

/** Szyk z elementów `items` (już sprawdzonych) i parametrów – nowy element albo null. */
export function makeArray(items, params, limit) {
  const clean = cleanArrayParams(params, limit);
  // Bez szyku w szyku; tabele i karteczki (od 1.21) i symbole metrologiczne (od 1.22.1) – też nie.
  // Kopie w szyku (od 1.22) nie mają identyfikatorów ani przyklejeń – są wolne.
  const source = items.filter((item) => item && !isArray(item) && !['table', 'sticky', 'gdt', 'datum', 'roughness'].includes(item.tool)).slice(0, ARRAY_ITEMS_MAX).map(withoutLinks);
  if (!clean || source.length === 0) return null;
  return { tool: 'array', ...clean, items: source };
}
