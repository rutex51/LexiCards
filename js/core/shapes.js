// Kształty geometryczne na rysunku (od 1.15) i liniuszek – bez przeglądarki: punkty kształtu,
// obrys (zaznaczanie, gumka, przyciąganie linijki), punkty konstrukcyjne i ich przesuwanie,
// sprawdzanie danych; liniuszek – najbliższa linia z rodziny równoległych linii.
//
// Kształt { tool: 'shape', shape, color, size, x, y, w, h, angle, skew, adjust }:
//   shape – 'line' | 'arrow' | 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'trapezoid';
//   (x, y) – środek; w, h – szerokość i wysokość (odcinek i strzałka: w – długość, h = 0);
//   angle – obrót (radiany); skew – pochylenie: o ile górna krawędź jest przesunięta w prawo
//   względem dolnej, w stosunku do wysokości (tangens kąta pochylenia); size – grubość linii;
//   adjust – trójkąt: wierzchołek nad dolną krawędzią (0 – nad lewym rogiem, ½ – środek, 1 – nad
//   prawym), trapez: wcięcie górnej krawędzi z każdej strony (0 – prostokąt, do 0,45).

export const SHAPES = Object.freeze(['line', 'arrow', 'rect', 'ellipse', 'triangle', 'diamond', 'trapezoid']);
export const SHAPE_LABELS = Object.freeze({
  line: 'Odcinek', arrow: 'Strzałka', rect: 'Prostokąt', ellipse: 'Elipsa', triangle: 'Trójkąt', diamond: 'Romb', trapezoid: 'Trapez'
});
/** Kształty z dwoma końcami (bez wysokości). */
export const isSegment = (shape) => shape.shape === 'line' || shape.shape === 'arrow';
export const isShape = (stroke) => stroke?.tool === 'shape';
export const SKEW_LIMIT = 2.5;
export const MIN_SHAPE = 4;
const DEFAULT_ADJUST = { triangle: 0.5, trapezoid: 0.25 };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const round = (value) => Math.round(value * 100) / 100;

/** Punkt kształtu z układu własnego (u, v od −½ do ½ szerokości i wysokości) na stronie. */
export function shapePoint(shape, u, v) {
  const lx = u * shape.w - shape.skew * v * shape.h;
  const ly = v * shape.h;
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  return { x: shape.x + lx * cos - ly * sin, y: shape.y + lx * sin + ly * cos };
}

/** Punkt strony w układzie kształtu bez pochylenia: { lx, ly } względem środka, osie obrócone z kształtem. */
export function toShapeFrame(shape, x, y) {
  const [dx, dy] = [x - shape.x, y - shape.y];
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  return { lx: dx * cos + dy * sin, ly: -dx * sin + dy * cos };
}

/** Wierzchołki wielokąta kształtu w układzie własnym (u, v). */
function polygonOf(shape) {
  switch (shape.shape) {
    case 'rect': return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    case 'diamond': return [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]];
    case 'triangle': return [[shape.adjust - 0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    case 'trapezoid': return [[-0.5 + shape.adjust, -0.5], [0.5 - shape.adjust, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    default: return null;
  }
}

/** Grot strzałki: dwa ramiona przy końcu odcinka (punkty strony). */
export function arrowHead(shape) {
  const end = shapePoint(shape, 0.5, 0);
  const length = Math.min(Math.max(14, shape.size * 4), Math.abs(shape.w) * 0.6);
  return [-1, 1].map((side) => {
    const angle = shape.angle + Math.PI + side * (Math.PI / 7);
    return { x: end.x + Math.cos(angle) * length, y: end.y + Math.sin(angle) * length };
  });
}

/**
 * Obrys kształtu jako łamana punktów strony { points: [x, y, …], closed } – do zaznaczania, gumki
 * i przyciągania linijki. Elipsa – 48 punktów (rysowana dokładnie krzywymi Béziera).
 */
export function shapeOutline(shape) {
  if (isSegment(shape)) {
    const [a, b] = [shapePoint(shape, -0.5, 0), shapePoint(shape, 0.5, 0)];
    return { points: [a.x, a.y, b.x, b.y], closed: false };
  }
  const corners = shape.shape === 'ellipse'
    ? Array.from({ length: 48 }, (_, index) => [0.5 * Math.cos((index / 48) * Math.PI * 2), 0.5 * Math.sin((index / 48) * Math.PI * 2)])
    : polygonOf(shape);
  const points = [];
  for (const [u, v] of corners) {
    const point = shapePoint(shape, u, v);
    points.push(point.x, point.y);
  }
  return { points, closed: true };
}

/** Ścieżka do narysowania: łamane i krzywe Béziera w punktach strony (elipsa – obraz okręgu przez przekształcenie kształtu). */
export function shapePath(shape) {
  if (shape.shape === 'ellipse') {
    // Okrąg o promieniu ½ z czterech krzywych; przekształcenie afiniczne zachowuje krzywe Béziera.
    const k = 0.5 * 0.5522847498;
    const quarter = [
      [[0.5, k], [k, 0.5], [0, 0.5]], [[-k, 0.5], [-0.5, k], [-0.5, 0]],
      [[-0.5, -k], [-k, -0.5], [0, -0.5]], [[k, -0.5], [0.5, -k], [0.5, 0]]
    ];
    const start = shapePoint(shape, 0.5, 0);
    return {
      start, closed: true,
      curves: quarter.map((curve) => curve.map(([u, v]) => shapePoint(shape, u, v)))
    };
  }
  const { points, closed } = shapeOutline(shape);
  const lines = [];
  for (let index = 2; index < points.length; index += 2) lines.push({ x: points[index], y: points[index + 1] });
  return { start: { x: points[0], y: points[1] }, lines, closed, head: shape.shape === 'arrow' ? arrowHead(shape) : null };
}

/** Granice kształtu razem z grubością linii (i grotem strzałki). */
export function shapeBounds(shape) {
  const { points } = shapeOutline(shape);
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  if (shape.shape === 'arrow') {
    for (const point of arrowHead(shape)) {
      xs.push(point.x);
      ys.push(point.y);
    }
  }
  const half = shape.size / 2;
  return { minX: Math.min(...xs) - half, minY: Math.min(...ys) - half, maxX: Math.max(...xs) + half, maxY: Math.max(...ys) + half };
}

/** Odległość punktu od odcinka (a–b). */
function segmentDistance(px, py, ax, ay, bx, by) {
  const [dx, dy] = [bx - ax, by - ay];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / length, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Czy koło (x, y, radius) dotyka linii kształtu (wnętrze się nie liczy – kształt nie jest wypełniony). */
export function touchesShape(shape, x, y, radius) {
  const { points, closed } = shapeOutline(shape);
  const reach = radius + shape.size / 2;
  const count = points.length / 2;
  for (let index = 1; index < count + (closed ? 1 : 0); index += 1) {
    const [a, b] = [index - 1, index % count];
    if (segmentDistance(x, y, points[a * 2], points[a * 2 + 1], points[b * 2], points[b * 2 + 1]) <= reach) return true;
  }
  if (shape.shape === 'arrow') {
    const end = shapePoint(shape, 0.5, 0);
    return arrowHead(shape).some((point) => segmentDistance(x, y, end.x, end.y, point.x, point.y) <= reach);
  }
  return false;
}

/** Czy punkt leży wewnątrz kształtu (dotknięcie środka pustego prostokąta też go zaznacza). */
export function shapeContains(shape, x, y) {
  if (isSegment(shape)) return false;
  const { points } = shapeOutline(shape);
  let inside = false;
  for (let index = 0, previous = points.length - 2; index < points.length; previous = index, index += 2) {
    const [xi, yi, xj, yj] = [points[index], points[index + 1], points[previous], points[previous + 1]];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Obrys kształtu jako kreska (punkty x, y, grubość) – dla przyciągania zera linijki. */
export function shapeAsStroke(shape) {
  const { points, closed } = shapeOutline(shape);
  const out = [];
  for (let index = 0; index < points.length; index += 2) out.push(points[index], points[index + 1], shape.size);
  if (closed) out.push(points[0], points[1], shape.size);
  return { tool: 'pen', color: shape.color, points: out };
}

/** Kształt przesunięty o (dx, dy) – nowy obiekt. */
export const translateShape = (shape, dx, dy) => ({ ...shape, x: round(shape.x + dx), y: round(shape.y + dy) });

/**
 * Nowy kształt z przeciągnięcia od punktu `from` do `to`: odcinek i strzałka od początku do końca
 * (kąt co 45° przyciągany do 3°), inne – w prostokącie przeciągnięcia (prawie równe boki – równe:
 * kwadrat, koło). Za krótkie przeciągnięcie (dotknięcie) – kształt domyślnej wielkości w tym miejscu.
 */
export function shapeFromDrag(kind, from, to, style, { defaultSize = 176, tap = 6 } = {}) {
  const [dx, dy] = [to.x - from.x, to.y - from.y];
  const base = { tool: 'shape', shape: kind, color: style.color, size: style.size, angle: 0, skew: 0, adjust: DEFAULT_ADJUST[kind] ?? 0 };
  if (Math.hypot(dx, dy) < tap) {
    return isSegment(base)
      ? { ...base, x: from.x, y: from.y, w: defaultSize, h: 0 }
      : { ...base, x: from.x, y: from.y, w: defaultSize, h: defaultSize * (kind === 'ellipse' || kind === 'diamond' ? 1 : 0.75) };
  }
  if (isSegment(base)) {
    const angle = snapAngle(Math.atan2(dy, dx), Math.PI / 4, (3 * Math.PI) / 180);
    const length = Math.hypot(dx, dy);
    return { ...base, x: from.x + (Math.cos(angle) * length) / 2, y: from.y + (Math.sin(angle) * length) / 2, w: length, h: 0, angle };
  }
  let [w, h] = [Math.max(MIN_SHAPE, Math.abs(dx)), Math.max(MIN_SHAPE, Math.abs(dy))];
  if (Math.abs(w - h) <= Math.max(w, h) * 0.06) w = h = Math.max(w, h);
  return { ...base, x: from.x + (Math.sign(dx) * w) / 2, y: from.y + (Math.sign(dy) * h) / 2, w, h };
}

/** Kąt przyciągnięty do wielokrotności `step`, gdy jest od niej nie dalej niż `tolerance`. */
export function snapAngle(angle, step, tolerance) {
  const nearest = Math.round(angle / step) * step;
  return Math.abs(angle - nearest) <= tolerance ? nearest : angle;
}

/** Narożniki i środki boków ramki: [u, v] w układzie własnym. */
const FRAME_HANDLES = {
  nw: [-0.5, -0.5], n: [0, -0.5], ne: [0.5, -0.5], e: [0.5, 0], se: [0.5, 0.5], s: [0, 0.5], sw: [-0.5, 0.5], w: [-0.5, 0]
};
/** Miejsce uchwytu pochylenia na górnej krawędzi (u) – obok uchwytu wysokości. */
const SKEW_AT = 0.3;

/**
 * Punkty konstrukcyjne kształtu (uchwyty) w punktach strony: { id, kind, x, y }. Odcinek i strzałka –
 * dwa końce; inne – narożniki i środki boków (szerokość i wysokość), pochylenie na górnej krawędzi,
 * obrót nad kształtem (`rotateGap` – odległość w jednostkach strony), trójkąt i trapez – kształt.
 */
export function shapeHandles(shape, rotateGap) {
  if (isSegment(shape)) {
    const [a, b] = [shapePoint(shape, -0.5, 0), shapePoint(shape, 0.5, 0)];
    return [{ id: 'start', kind: 'end', ...a }, { id: 'end', kind: 'end', ...b }];
  }
  const handles = Object.entries(FRAME_HANDLES).map(([id, [u, v]]) => ({ id, kind: id.length === 2 ? 'corner' : 'edge', ...shapePoint(shape, u, v) }));
  handles.push({ id: 'skew', kind: 'skew', ...shapePoint(shape, SKEW_AT, -0.5) });
  if (shape.shape === 'triangle') handles.push({ id: 'adjust', kind: 'adjust', ...shapePoint(shape, shape.adjust - 0.5, -0.5) });
  if (shape.shape === 'trapezoid') handles.push({ id: 'adjust', kind: 'adjust', ...shapePoint(shape, -0.5 + shape.adjust, -0.5) });
  // Obrót – nad środkiem, na osi kształtu (przy pochyleniu też – przeciągnięcie nie skacze).
  const reach = shape.h / 2 + rotateGap;
  handles.push({ id: 'rotate', kind: 'rotate', x: shape.x + Math.sin(shape.angle) * reach, y: shape.y - Math.cos(shape.angle) * reach });
  return handles;
}

/** Punkt strony z układu kształtu bez pochylenia (lx, ly względem środka). */
function fromFrame(shape, lx, ly) {
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  return { x: shape.x + lx * cos - ly * sin, y: shape.y + lx * sin + ly * cos };
}

/**
 * Kształt po przesunięciu uchwytu `id` do punktu strony `point` – nowy obiekt, oryginał bez zmian.
 * Narożnik zmienia szerokość i wysokość (przeciwny narożnik zostaje), środek boku – jeden wymiar,
 * pochylenie – przesuwa górną krawędź (dolna zostaje), obrót – kąt (co 15° przyciągany do 2°),
 * kształt – wierzchołek trójkąta albo wcięcie trapezu, koniec odcinka – drugi koniec zostaje.
 */
export function moveShapeHandle(shape, id, point) {
  if (id === 'start' || id === 'end') {
    const fixed = shapePoint(shape, id === 'start' ? 0.5 : -0.5, 0);
    const [from, to] = id === 'start' ? [point, fixed] : [fixed, point];
    let angle = Math.atan2(to.y - from.y, to.x - from.x);
    const length = Math.max(MIN_SHAPE, Math.hypot(to.x - from.x, to.y - from.y));
    angle = snapAngle(angle, Math.PI / 4, (3 * Math.PI) / 180);
    // Kąt przyciągnięty: ruchomy koniec na prostej z nieruchomego.
    const start = id === 'start' ? { x: fixed.x - Math.cos(angle) * length, y: fixed.y - Math.sin(angle) * length } : fixed;
    return { ...shape, x: round(start.x + (Math.cos(angle) * length) / 2), y: round(start.y + (Math.sin(angle) * length) / 2), w: round(length), angle };
  }
  const local = toShapeFrame(shape, point.x, point.y);
  if (id === 'rotate') {
    const angle = Math.atan2(point.y - shape.y, point.x - shape.x) + Math.PI / 2;
    return { ...shape, angle: snapAngle(Math.atan2(Math.sin(angle), Math.cos(angle)), Math.PI / 12, (2 * Math.PI) / 180) };
  }
  if (id === 'skew') {
    // Dolna krawędź zostaje; górna przesuwa się wzdłuż swojej prostej.
    const bottom = { lx: -0.5 * shape.skew * shape.h, ly: 0.5 * shape.h };
    const raw = clamp((local.lx - bottom.lx - SKEW_AT * shape.w) / shape.h, -SKEW_LIMIT, SKEW_LIMIT);
    // Blisko zera – bez pochylenia (łatwo wrócić do prostych boków).
    const skew = Math.abs(raw) < 0.03 ? 0 : Math.round(raw * 1000) / 1000;
    const center = fromFrame(shape, bottom.lx + 0.5 * skew * shape.h, 0);
    return { ...shape, skew, x: round(center.x), y: round(center.y) };
  }
  if (id === 'adjust') {
    const u = (local.lx - 0.5 * shape.skew * shape.h) / shape.w + 0.5;
    const adjust = shape.shape === 'triangle' ? clamp(u, 0, 1) : clamp(u, 0, 0.45);
    // Wierzchołek trójkąta przyciągany do środka i nad narożniki.
    const snapped = shape.shape === 'triangle' ? [0, 0.5, 1].find((value) => Math.abs(value - adjust) < 0.03) ?? adjust : adjust;
    return { ...shape, adjust: round(snapped) };
  }
  // Uchwyt (su/2, sv/2) i przeciwny punkt (−su/2, −sv/2) w układzie bez pochylenia:
  // punkt (u, v) to (u·w − skew·v·h, v·h), więc uchwyt − przeciwny = (su·w − skew·sv·h, sv·h).
  const [su, sv] = FRAME_HANDLES[id].map((value) => value * 2);
  const fixed = { lx: (-su * shape.w + shape.skew * sv * shape.h) / 2, ly: (-sv * shape.h) / 2 };
  const h = sv !== 0 ? Math.max(MIN_SHAPE, sv * (local.ly - fixed.ly)) : shape.h;
  const w = su !== 0 ? Math.max(MIN_SHAPE, su * (local.lx - fixed.lx + shape.skew * sv * h)) : shape.w;
  const delta = { lx: su * w - shape.skew * sv * h, ly: sv * h };
  const center = fromFrame(shape, fixed.lx + delta.lx / 2, fixed.ly + delta.ly / 2);
  return { ...shape, w: round(w), h: round(h), x: round(center.x), y: round(center.y) };
}

/** Sprawdzony kształt (zapis, kopia zapasowa) albo null. */
export function cleanShape(raw, pageWidth, pageHeight, isColor) {
  if (!raw || !SHAPES.includes(raw.shape) || !isColor(raw.color)) return null;
  if (![raw.x, raw.y, raw.w, raw.h, raw.angle, raw.size].every(finite)) return null;
  const segment = raw.shape === 'line' || raw.shape === 'arrow';
  const limit = Math.max(pageWidth, pageHeight) * 4;
  return {
    tool: 'shape',
    shape: raw.shape,
    color: raw.color.toLowerCase(),
    size: clamp(raw.size, 0.5, 40),
    x: clamp(raw.x, -pageWidth, pageWidth * 2),
    y: clamp(raw.y, -pageHeight, pageHeight * 2),
    w: clamp(Math.abs(raw.w), MIN_SHAPE, limit),
    h: segment ? 0 : clamp(Math.abs(raw.h), MIN_SHAPE, limit),
    // Kąt w zakresie (−π, π]; w zakresie – bez przeliczania (bez błędów zaokrągleń).
    angle: raw.angle > Math.PI || raw.angle <= -Math.PI ? Math.atan2(Math.sin(raw.angle), Math.cos(raw.angle)) : raw.angle,
    skew: segment || !finite(raw.skew) ? 0 : clamp(raw.skew, -SKEW_LIMIT, SKEW_LIMIT),
    adjust: raw.shape === 'triangle' ? clamp(finite(raw.adjust) ? raw.adjust : 0.5, 0, 1)
      : raw.shape === 'trapezoid' ? clamp(finite(raw.adjust) ? raw.adjust : 0.25, 0, 0.45) : 0
  };
}

// ---------------------------------------------------------------- liniuszek

/**
 * Liniuszek (od 1.15): równoległe linie przez całą stronę { x, y, angle, spacing } – (x, y) to punkt
 * jednej z linii, angle – kierunek (radiany), spacing – odstęp linii (jednostki strony). Linie
 * poprzeczne – ta sama postać (odstęp mierzony prostopadle do nich).
 */

/** Najbliższa linia rodziny w punkcie: { x, y, angle, distance } – (x, y) to rzut punktu na linię. */
export function nearestGuideLine(family, x, y) {
  const normal = { x: -Math.sin(family.angle), y: Math.cos(family.angle) };
  const offset = (x - family.x) * normal.x + (y - family.y) * normal.y;
  const index = Math.round(offset / family.spacing);
  const distance = offset - index * family.spacing;
  return { x: x - normal.x * distance, y: y - normal.y * distance, angle: family.angle, distance: Math.abs(distance), index };
}

/** Linie rodziny przecinające prostokąt strony: [{ x, y }, …] – punkty linii (kierunek – family.angle). */
export function guideLinesIn(family, width, height) {
  const normal = { x: -Math.sin(family.angle), y: Math.cos(family.angle) };
  const offsets = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => (x - family.x) * normal.x + (y - family.y) * normal.y);
  const [first, last] = [Math.ceil(Math.min(...offsets) / family.spacing), Math.floor(Math.max(...offsets) / family.spacing)];
  const lines = [];
  for (let index = first; index <= last && lines.length < 2000; index += 1) {
    lines.push({ x: family.x + normal.x * index * family.spacing, y: family.y + normal.y * index * family.spacing });
  }
  return lines;
}
