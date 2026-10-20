// Kształty geometryczne na rysunku (od 1.15) i liniuszek – bez przeglądarki: punkty kształtu,
// obrys (zaznaczanie, gumka, przyciąganie linijki), punkty konstrukcyjne i ich przesuwanie,
// sprawdzanie danych; liniuszek – najbliższa linia z rodziny równoległych linii, a od 1.22
// liniuszek promieniowy – najbliższy okrąg i promień. Od 1.17:
// wypełnienie, tekst na kształcie i wymiary wpisywane z klawiatury (szerokość, wysokość, kąt
// pochylenia; odcinek – długość i kąt).
//
// Kształt { tool: 'shape', shape, color, size, x, y, w, h, angle, skew, adjust, fill?, label? }:
//   shape – 'line' | 'arrow' | 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'trapezoid';
//   (x, y) – środek; w, h – szerokość i wysokość (odcinek i strzałka: w – długość, h = 0);
//   angle – obrót (radiany); skew – pochylenie: o ile górna krawędź jest przesunięta w prawo
//   względem dolnej, w stosunku do wysokości (tangens kąta pochylenia); size – grubość linii;
//   adjust – trójkąt: wierzchołek nad dolną krawędzią (0 – nad lewym rogiem, ½ – środek, 1 – nad
//   prawym), trapez: wcięcie górnej krawędzi z każdej strony (0 – prostokąt, do 0,45);
//   od 1.17 fill – 'light' (kolor kształtu, przejrzysty) albo 'solid' (pełny), brak – bez wypełnienia
//   (odcinek i strzałka go nie mają); label – tekst na kształcie { text, size, color, width, height }:
//   na środku kształtu (odcinek – nad linią), obrócony razem z nim, ale nigdy do góry nogami,
//   łamany do szerokości kształtu; width i height – zmierzone przy wpisaniu (granice, dotknięcie);
//   od 1.19 startCap, endCap – zakończenia odcinka i strzałki (SEGMENT_CAPS; zapisane tylko, gdy inne
//   niż domyślne: odcinek – bez, strzałka – grot na końcu), dims – wymiary widoczne na rysunku na stałe
//   (['width', 'height', 'skew'] albo odcinek ['length', 'angle']).

export const SHAPES = Object.freeze(['line', 'arrow', 'rect', 'ellipse', 'triangle', 'diamond', 'trapezoid']);
export const SHAPE_LABELS = Object.freeze({
  line: 'Odcinek', arrow: 'Strzałka', rect: 'Prostokąt', ellipse: 'Elipsa', triangle: 'Trójkąt', diamond: 'Romb', trapezoid: 'Trapez'
});
/** Kształty z dwoma końcami (bez wysokości). */
export const isSegment = (shape) => shape.shape === 'line' || shape.shape === 'arrow';
export const isShape = (stroke) => stroke?.tool === 'shape';
export const SKEW_LIMIT = 2.5;
export const MIN_SHAPE = 4;
/** Krok kąta z Shift (od 1.19): odcinek, koniec odcinka i obrót – co 15°. */
const LOCK_STEP = Math.PI / 12;
const DEFAULT_ADJUST = { triangle: 0.5, trapezoid: 0.25 };
/** Wypełnienie kształtu (od 1.17): brak, jasne (kolor kształtu, przejrzysty) albo pełne. */
export const SHAPE_FILLS = Object.freeze(['none', 'light', 'solid']);
export const SHAPE_FILL_LABELS = Object.freeze({ none: 'Brak', light: 'Jasne', solid: 'Pełne' });
export const FILL_ALPHA = Object.freeze({ light: 0.22, solid: 1 });
export const canFill = (shape) => !isSegment(shape);
/** Najdłuższy tekst na kształcie. */
export const LABEL_TEXT_MAX = 500;
/** Największy kąt pochylenia wpisywany z klawiatury (stopnie) – odpowiada SKEW_LIMIT. */
export const SKEW_DEGREES_LIMIT = Math.floor((Math.atan(SKEW_LIMIT) * 180) / Math.PI);

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

// ---------------------------------------------------------------- zakończenia odcinka (od 1.19)

/** Zakończenia odcinka i strzałki: brak, grot strzałki, trójkąt, koło, kwadrat, romb. */
export const SEGMENT_CAPS = Object.freeze(['none', 'arrow', 'triangle', 'circle', 'square', 'diamond']);
export const SEGMENT_CAP_LABELS = Object.freeze({ none: 'Brak', arrow: 'Grot', triangle: 'Trójkąt', circle: 'Koło', square: 'Kwadrat', diamond: 'Romb' });

/** Zakończenia { start, end }: zapisane albo domyślne – odcinek bez, strzałka z grotem na końcu (jak do 1.18). */
export function segmentCaps(shape) {
  const pick = (value, fallback) => (SEGMENT_CAPS.includes(value) ? value : fallback);
  return { start: pick(shape.startCap, 'none'), end: pick(shape.endCap, shape.shape === 'arrow' ? 'arrow' : 'none') };
}

/** Odcinek z zakończeniami { start, end } – nowy obiekt; zapisane tylko te, które są inne niż domyślne. */
export function withCaps(shape, caps) {
  const next = { ...shape };
  delete next.startCap;
  delete next.endCap;
  const fallback = segmentCaps(next);
  if (SEGMENT_CAPS.includes(caps.start) && caps.start !== fallback.start) next.startCap = caps.start;
  if (SEGMENT_CAPS.includes(caps.end) && caps.end !== fallback.end) next.endCap = caps.end;
  return next;
}

/** Wielkość zakończenia – jak grot strzałki: od grubości linii, najwyżej część długości odcinka (przy dwóch – mniejsza). */
function capLength(shape, caps) {
  const both = caps.start !== 'none' && caps.end !== 'none';
  return Math.min(Math.max(14, shape.size * 4), Math.abs(shape.w) * (both ? 0.4 : 0.6));
}

/**
 * Zakończenie odcinka na końcu `which` ('start' albo 'end'): { kind, tip, trim, arms?, polygon?, circle? }
 * w punktach strony. tip – koniec odcinka, trim – miejsce, w którym kończy się linia (trójkąt – pod
 * podstawą, żeby linia nie wystawała za ostrze), arms – ramiona grotu, polygon – wypełniony trójkąt,
 * kwadrat albo romb, circle – wypełnione koło { x, y, r }. Koło, kwadrat i romb mają środek na końcu odcinka.
 */
export function segmentCap(shape, which) {
  const caps = segmentCaps(shape);
  const kind = caps[which];
  const tip = shapePoint(shape, which === 'end' ? 0.5 : -0.5, 0);
  if (kind === 'none') return { kind, tip, trim: tip };
  // u – na zewnątrz odcinka, n – w poprzek.
  const sign = which === 'end' ? 1 : -1;
  const [ux, uy] = [Math.cos(shape.angle) * sign, Math.sin(shape.angle) * sign];
  const [nx, ny] = [-uy, ux];
  const length = capLength(shape, caps);
  const at = (along, across) => ({ x: tip.x + ux * along + nx * across, y: tip.y + uy * along + ny * across });
  switch (kind) {
    case 'arrow': {
      const [cos, sin] = [Math.cos(Math.PI / 7), Math.sin(Math.PI / 7)];
      return { kind, tip, trim: tip, arms: [at(-cos * length, -sin * length), at(-cos * length, sin * length)] };
    }
    case 'triangle':
      return { kind, tip, trim: at(-length * 0.75, 0), polygon: [tip, at(-length, length * 0.42), at(-length, -length * 0.42)] };
    case 'circle':
      return { kind, tip, trim: tip, circle: { ...tip, r: Math.max(shape.size * 1.2, length * 0.32) } };
    case 'square': {
      const half = Math.max(shape.size * 1.1, length * 0.3);
      return { kind, tip, trim: tip, polygon: [at(half, half), at(half, -half), at(-half, -half), at(-half, half)] };
    }
    default:
      return { kind, tip, trim: tip, polygon: [at(length * 0.45, 0), at(0, length * 0.3), at(-length * 0.45, 0), at(0, -length * 0.3)] };
  }
}

/** Grot strzałki: dwa ramiona przy końcu odcinka (punkty strony); od 1.19 – zakończenie „Grot” na końcu `which`. */
export const arrowHead = (shape, which = 'end') => segmentCap(shape, which).arms ?? [];

/** Zakończenia odcinka (bez „brak”). */
export const segmentCapList = (shape) => (isSegment(shape) ? ['start', 'end'].map((which) => segmentCap(shape, which)).filter((cap) => cap.kind !== 'none') : []);

/** Skrajne punkty zakończeń odcinka – granice i zaznaczanie. */
export function capPoints(shape) {
  const points = [];
  for (const cap of segmentCapList(shape)) {
    if (cap.arms) points.push(...cap.arms);
    if (cap.polygon) points.push(...cap.polygon);
    if (cap.circle) {
      const { x, y, r } = cap.circle;
      points.push({ x: x - r, y: y - r }, { x: x + r, y: y - r }, { x: x + r, y: y + r }, { x: x - r, y: y + r });
    }
  }
  return points;
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
      start, closed: true, caps: [],
      curves: quarter.map((curve) => curve.map(([u, v]) => shapePoint(shape, u, v)))
    };
  }
  if (isSegment(shape)) {
    // Od 1.19: linia między zakończeniami (przy trójkącie – do jego podstawy) i same zakończenia.
    const [start, end] = [segmentCap(shape, 'start'), segmentCap(shape, 'end')];
    return { start: start.trim, lines: [end.trim], closed: false, caps: [start, end].filter((cap) => cap.kind !== 'none') };
  }
  const { points, closed } = shapeOutline(shape);
  const lines = [];
  for (let index = 2; index < points.length; index += 2) lines.push({ x: points[index], y: points[index + 1] });
  return { start: { x: points[0], y: points[1] }, lines, closed, caps: [] };
}

/** Granice kształtu razem z grubością linii, zakończeniami odcinka, tekstem i (od 1.19) stałymi wymiarami. */
export function shapeBounds(shape) {
  const { points } = shapeOutline(shape);
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  const half = shape.size / 2;
  for (const point of [...capPoints(shape), ...labelCorners(shape), ...dimCorners(shape)]) {
    xs.push(point.x);
    ys.push(point.y);
  }
  return { minX: Math.min(...xs) - half, minY: Math.min(...ys) - half, maxX: Math.max(...xs) + half, maxY: Math.max(...ys) + half };
}

// ---------------------------------------------------------------- tekst na kształcie (od 1.17)

/** Najszerszy wiersz tekstu na kształcie (czcionka `size`): szerokość kształtu z marginesem, odcinek – jego długość. */
export function labelMaxWidth(shape, size) {
  return isSegment(shape) ? Math.max(size * 3, shape.w) : Math.max(size * 2, shape.w * 0.86 - shape.size);
}

/**
 * Środek, kąt i wielkość tekstu na kształcie: środek kształtu, a odcinka – nad środkiem linii.
 * Tekst obraca się z kształtem, ale nie leży do góry nogami (kąt czytelny: od −90° do 90°).
 */
export function labelFrame(shape) {
  const { label } = shape;
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  const flip = cos < -1e-9 || (Math.abs(cos) < 1e-9 && sin > 0);
  const angle = flip ? Math.atan2(-sin, -cos) : shape.angle;
  if (!isSegment(shape)) return { x: shape.x, y: shape.y, angle, width: label.width, height: label.height };
  const lift = label.height / 2 + shape.size / 2 + label.size * 0.25;
  return { x: shape.x + Math.sin(angle) * lift, y: shape.y - Math.cos(angle) * lift, angle, width: label.width, height: label.height };
}

/** Narożniki prostokąta tekstu na kształcie (punkty strony); bez tekstu – brak. */
function labelCorners(shape) {
  if (!shape.label) return [];
  const frame = labelFrame(shape);
  const [cos, sin] = [Math.cos(frame.angle), Math.sin(frame.angle)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const [lx, ly] = [(a * frame.width) / 2, (b * frame.height) / 2];
    return { x: frame.x + lx * cos - ly * sin, y: frame.y + lx * sin + ly * cos };
  });
}

/** Czy koło (x, y, radius) dotyka tekstu na kształcie. */
function touchesLabel(shape, x, y, radius) {
  if (!shape.label) return false;
  const frame = labelFrame(shape);
  const [cos, sin] = [Math.cos(frame.angle), Math.sin(frame.angle)];
  const [dx, dy] = [x - frame.x, y - frame.y];
  return Math.abs(dx * cos + dy * sin) <= frame.width / 2 + radius && Math.abs(-dx * sin + dy * cos) <= frame.height / 2 + radius;
}

/** Odległość punktu od odcinka (a–b). */
function segmentDistance(px, py, ax, ay, bx, by) {
  const [dx, dy] = [bx - ax, by - ay];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / length, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * Czy koło (x, y, radius) dotyka linii kształtu albo tekstu na nim; wnętrze liczy się tylko
 * u kształtu wypełnionego (od 1.17).
 */
export function touchesShape(shape, x, y, radius) {
  if (touchesLabel(shape, x, y, radius) || (shape.fill && shapeContains(shape, x, y))) return true;
  const { points, closed } = shapeOutline(shape);
  const reach = radius + shape.size / 2;
  const count = points.length / 2;
  for (let index = 1; index < count + (closed ? 1 : 0); index += 1) {
    const [a, b] = [index - 1, index % count];
    if (segmentDistance(x, y, points[a * 2], points[a * 2 + 1], points[b * 2], points[b * 2 + 1]) <= reach) return true;
  }
  return segmentCapList(shape).some((cap) => {
    if (cap.arms) return cap.arms.some((point) => segmentDistance(x, y, cap.tip.x, cap.tip.y, point.x, point.y) <= reach);
    if (cap.circle) return Math.hypot(x - cap.circle.x, y - cap.circle.y) <= cap.circle.r + reach;
    const flat = cap.polygon.flatMap((point) => [point.x, point.y]);
    return pointInPolygon(x, y, flat) || cap.polygon.some((point, index) => {
      const next = cap.polygon[(index + 1) % cap.polygon.length];
      return segmentDistance(x, y, point.x, point.y, next.x, next.y) <= reach;
    });
  });
}

/** Czy punkt leży wewnątrz wielokąta [x, y, x, y, …] (reguła parzystości). */
function pointInPolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 2; index < points.length; previous = index, index += 2) {
    const [xi, yi, xj, yj] = [points[index], points[index + 1], points[previous], points[previous + 1]];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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
 * Od 1.19 `lock` (Shift albo „Proporcje” w panelu) – równe boki (kwadrat, koło), odcinek co 15°;
 * style.caps – zakończenia nowego odcinka { start, end }.
 */
export function shapeFromDrag(kind, from, to, style, { defaultSize = 176, tap = 6, lock = false } = {}) {
  const [dx, dy] = [to.x - from.x, to.y - from.y];
  let base = { tool: 'shape', shape: kind, color: style.color, size: style.size, angle: 0, skew: 0, adjust: DEFAULT_ADJUST[kind] ?? 0 };
  if ((style.fill === 'light' || style.fill === 'solid') && canFill(base)) base.fill = style.fill;
  if (isSegment(base) && style.caps) base = withCaps(base, style.caps);
  if (Math.hypot(dx, dy) < tap) {
    return isSegment(base)
      ? { ...base, x: from.x, y: from.y, w: defaultSize, h: 0 }
      : { ...base, x: from.x, y: from.y, w: defaultSize, h: defaultSize * (kind === 'ellipse' || kind === 'diamond' || lock ? 1 : 0.75) };
  }
  if (isSegment(base)) {
    const raw = Math.atan2(dy, dx);
    const angle = lock ? snapAngle(raw, LOCK_STEP, LOCK_STEP) : snapAngle(raw, Math.PI / 4, (3 * Math.PI) / 180);
    const length = Math.hypot(dx, dy);
    return { ...base, x: from.x + (Math.cos(angle) * length) / 2, y: from.y + (Math.sin(angle) * length) / 2, w: length, h: 0, angle };
  }
  let [w, h] = [Math.max(MIN_SHAPE, Math.abs(dx)), Math.max(MIN_SHAPE, Math.abs(dy))];
  if (lock || Math.abs(w - h) <= Math.max(w, h) * 0.06) w = h = Math.max(w, h);
  // Bez ruchu w jednym kierunku (np. przeciągnięcie poziome z Shift) – kształt w dół i w prawo.
  const [sx, sy] = [Math.sign(dx) || 1, Math.sign(dy) || 1];
  return { ...base, x: from.x + (sx * w) / 2, y: from.y + (sy * h) / 2, w, h };
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
 * Od 1.19 `lock` (Shift): narożnik zachowuje proporcje kształtu, koniec odcinka i obrót – co 15°.
 */
export function moveShapeHandle(shape, id, point, { lock = false } = {}) {
  if (id === 'start' || id === 'end') {
    const fixed = shapePoint(shape, id === 'start' ? 0.5 : -0.5, 0);
    const [from, to] = id === 'start' ? [point, fixed] : [fixed, point];
    let angle = Math.atan2(to.y - from.y, to.x - from.x);
    const length = Math.max(MIN_SHAPE, Math.hypot(to.x - from.x, to.y - from.y));
    angle = lock ? snapAngle(angle, LOCK_STEP, LOCK_STEP) : snapAngle(angle, Math.PI / 4, (3 * Math.PI) / 180);
    // Kąt przyciągnięty: ruchomy koniec na prostej z nieruchomego.
    const start = id === 'start' ? { x: fixed.x - Math.cos(angle) * length, y: fixed.y - Math.sin(angle) * length } : fixed;
    return { ...shape, x: round(start.x + (Math.cos(angle) * length) / 2), y: round(start.y + (Math.sin(angle) * length) / 2), w: round(length), angle };
  }
  const local = toShapeFrame(shape, point.x, point.y);
  if (id === 'rotate') {
    const angle = Math.atan2(point.y - shape.y, point.x - shape.x) + Math.PI / 2;
    const normal = Math.atan2(Math.sin(angle), Math.cos(angle));
    // Z Shift dokładnie co 15° (−180° to to samo co 180°).
    const snapped = lock ? snapAngle(normal, LOCK_STEP, LOCK_STEP) : snapAngle(normal, Math.PI / 12, (2 * Math.PI) / 180);
    return { ...shape, angle: snapped <= -Math.PI + 1e-9 ? Math.PI : snapped };
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
  let h = sv !== 0 ? Math.max(MIN_SHAPE, sv * (local.ly - fixed.ly)) : shape.h;
  let w = su !== 0 ? Math.max(MIN_SHAPE, su * (local.lx - fixed.lx + shape.skew * sv * h)) : shape.w;
  if (lock && su !== 0 && sv !== 0) {
    // Narożnik z Shift: większa ze zmian szerokości i wysokości – dla obu (proporcje zostają).
    const scale = Math.max(w / shape.w, h / shape.h);
    [w, h] = [Math.max(MIN_SHAPE, shape.w * scale), Math.max(MIN_SHAPE, shape.h * scale)];
  }
  const delta = { lx: su * w - shape.skew * sv * h, ly: sv * h };
  const center = fromFrame(shape, fixed.lx + delta.lx / 2, fixed.ly + delta.ly / 2);
  return { ...shape, w: round(w), h: round(h), x: round(center.x), y: round(center.y) };
}

// ---------------------------------------------------------------- wymiary z klawiatury (od 1.17)

/** Kąt pochylenia w stopniach: dodatni – górna krawędź przesunięta w prawo (kształt pochylony w prawo). */
export const skewDegrees = (shape) => (Math.atan(shape.skew) * 180) / Math.PI;

/**
 * Kształt o wpisanych wymiarach – szerokości, wysokości (jednostki strony) i kącie pochylenia
 * (stopnie) – wokół tego samego środka; brakująca wartość zostaje bez zmian.
 */
export function resizeShape(shape, { w = shape.w, h = shape.h, skew = null } = {}) {
  if (isSegment(shape)) return { ...shape, w: round(Math.max(MIN_SHAPE, w)) };
  const degrees = skew === null ? null : clamp(skew, -SKEW_DEGREES_LIMIT, SKEW_DEGREES_LIMIT);
  return {
    ...shape,
    w: round(Math.max(MIN_SHAPE, w)),
    h: round(Math.max(MIN_SHAPE, h)),
    skew: degrees === null ? shape.skew : Math.round(Math.tan((degrees * Math.PI) / 180) * 1000) / 1000
  };
}

/** Kierunek odcinka w stopniach jak na linijce – przeciwnie do ruchu wskazówek zegara od poziomu, od −180° do 180°. */
export function segmentDegrees(shape) {
  // + 0: bez „−0” przy odcinku poziomym.
  const degrees = (-shape.angle * 180) / Math.PI + 0;
  return degrees <= -180 ? degrees + 360 : degrees > 180 ? degrees - 360 : degrees;
}

/** Odcinek o wpisanej długości (jednostki strony) i kierunku (stopnie) – początek zostaje na miejscu. */
export function setSegment(shape, { length = shape.w, degrees = segmentDegrees(shape) } = {}) {
  const start = shapePoint(shape, -0.5, 0);
  const raw = (-degrees * Math.PI) / 180;
  const angle = Math.atan2(Math.sin(raw), Math.cos(raw)) || 0;
  const w = Math.max(MIN_SHAPE, length);
  return { ...shape, w: round(w), angle, x: round(start.x + (Math.cos(angle) * w) / 2), y: round(start.y + (Math.sin(angle) * w) / 2) };
}

// ---------------------------------------------------------------- wymiary na rysunku (od 1.19)

/** Wymiary kształtu: szerokość, wysokość i kąt pochylenia; odcinka i strzałki – długość i kąt. */
export const dimKeys = (shape) => (isSegment(shape) ? ['length', 'angle'] : ['width', 'height', 'skew']);
/** Wielkość czcionki stałego wymiaru i jego odstęp od linii ramki (jednostki strony; kratka ma 44). */
export const DIM_FONT = 22;
export const DIM_GAP = 8;

/**
 * Miejsca wymiarów (pola w edytorze i stałe napisy): { klucz: { point, normal } } – punkt na środku
 * linii ramki konstrukcyjnej i kierunek na zewnątrz. Szerokość – pod dolną linią, wysokość – przy
 * prawej, kąt pochylenia – przy lewej; odcinek: długość – pod środkiem (w kierunku czytelnym), kąt – za końcem.
 */
export function dimPlaces(shape) {
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  const turn = ([x, y]) => [x * cos - y * sin, x * sin + y * cos];
  const unit = (vector) => {
    const length = Math.hypot(...vector) || 1;
    return vector.map((value) => value / length);
  };
  if (isSegment(shape)) {
    const flip = cos < -1e-9 || (Math.abs(cos) < 1e-9 && sin > 0) ? -1 : 1;
    return { length: { point: shapePoint(shape, 0, 0), normal: turn([0, flip]) }, angle: { point: shapePoint(shape, 0.5, 0), normal: [cos, sin] } };
  }
  return {
    width: { point: shapePoint(shape, 0, 0.5), normal: turn([0, 1]) },
    height: { point: shapePoint(shape, 0.5, 0), normal: turn(unit([1, shape.skew])) },
    skew: { point: shapePoint(shape, -0.5, 0), normal: turn(unit([-1, -shape.skew])) }
  };
}

/** Środek pola albo napisu wymiaru (width × height) odsuniętego od linii ramki o `gap` na zewnątrz. */
export function dimCenter(place, width, height, gap) {
  const [nx, ny] = place.normal;
  const reach = gap + Math.abs(nx) * (width / 2) + Math.abs(ny) * (height / 2);
  return { x: place.point.x + nx * reach, y: place.point.y + ny * reach };
}

/** Wymiary widoczne na stałe (w kolejności) – tylko pasujące do kształtu. */
export const shownDims = (shape) => (Array.isArray(shape.dims) ? dimKeys(shape).filter((key) => shape.dims.includes(key)) : []);

/** Szacowane narożniki stałych wymiarów (granice kształtu; napis ma najwyżej ok. 4 czcionki szerokości). */
function dimCorners(shape) {
  const keys = shownDims(shape);
  if (keys.length === 0) return [];
  const places = dimPlaces(shape);
  const [width, height] = [DIM_FONT * 4, DIM_FONT * 1.3];
  return keys.flatMap((key) => {
    const center = dimCenter(places[key], width, height, DIM_GAP);
    return [[-1, -1], [1, 1]].map(([a, b]) => ({ x: center.x + (a * width) / 2, y: center.y + (b * height) / 2 }));
  });
}

/** Kształt z wymiarami widocznymi na stałe (klucze z dimKeys) – nowy obiekt; pusta lista usuwa pole. */
export function withDims(shape, keys) {
  const next = { ...shape };
  const dims = dimKeys(shape).filter((key) => keys.includes(key));
  if (dims.length > 0) next.dims = dims;
  else delete next.dims;
  return next;
}

/** Sprawdzony tekst na kształcie albo null. */
function cleanLabel(raw, isColor, limit) {
  if (!raw || typeof raw !== 'object' || typeof raw.text !== 'string' || raw.text.trim() === '' || !isColor(raw.color)) return null;
  if (![raw.size, raw.width, raw.height].every(finite)) return null;
  return {
    text: raw.text.slice(0, LABEL_TEXT_MAX),
    size: clamp(raw.size, 8, 200),
    color: raw.color.toLowerCase(),
    width: clamp(raw.width, 1, limit),
    height: clamp(raw.height, 1, limit)
  };
}

/** Sprawdzony kształt (zapis, kopia zapasowa) albo null. */
export function cleanShape(raw, pageWidth, pageHeight, isColor) {
  if (!raw || !SHAPES.includes(raw.shape) || !isColor(raw.color)) return null;
  if (![raw.x, raw.y, raw.w, raw.h, raw.angle, raw.size].every(finite)) return null;
  const segment = raw.shape === 'line' || raw.shape === 'arrow';
  const limit = Math.max(pageWidth, pageHeight) * 4;
  const label = cleanLabel(raw.label, isColor, limit);
  // Od 1.19: zakończenia odcinka (tylko inne niż domyślne) i wymiary widoczne na stałe.
  const caps = segment ? withCaps({ shape: raw.shape }, { start: raw.startCap ?? 'none', end: raw.endCap ?? (raw.shape === 'arrow' ? 'arrow' : 'none') }) : {};
  const dims = withDims({ shape: raw.shape }, Array.isArray(raw.dims) ? raw.dims : []).dims;
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
      : raw.shape === 'trapezoid' ? clamp(finite(raw.adjust) ? raw.adjust : 0.25, 0, 0.45) : 0,
    ...(!segment && (raw.fill === 'light' || raw.fill === 'solid') ? { fill: raw.fill } : {}),
    ...(label ? { label } : {}),
    ...(caps.startCap ? { startCap: caps.startCap } : {}),
    ...(caps.endCap ? { endCap: caps.endCap } : {}),
    ...(dims ? { dims } : {})
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

/**
 * Liniuszek promieniowy (od 1.22): okręgi wokół środka { x, y } co `spacing` (jednostki strony)
 * i promienie co `step` (radiany), obrócone o `angle` (kierunek pierwszego promienia). Najbliższy
 * okrąg w punkcie: { radius, distance, index } – bez okręgu o promieniu 0.
 */
export function nearestRing(radial, x, y) {
  const radius = Math.hypot(x - radial.x, y - radial.y);
  const index = Math.max(1, Math.round(radius / radial.spacing));
  return { radius: index * radial.spacing, distance: Math.abs(radius - index * radial.spacing), index };
}

/** Najbliższy promień w punkcie: { angle, distance, x, y } – kierunek promienia, odległość i rzut punktu na promień. */
export function nearestRay(radial, x, y) {
  const radius = Math.hypot(x - radial.x, y - radial.y);
  const theta = Math.atan2(y - radial.y, x - radial.x);
  const angle = radial.angle + Math.round((theta - radial.angle) / radial.step) * radial.step;
  const along = radius * Math.cos(theta - angle);
  return {
    angle,
    distance: radius * Math.abs(Math.sin(theta - angle)),
    x: radial.x + Math.cos(angle) * along,
    y: radial.y + Math.sin(angle) * along
  };
}

/** Promienie okręgów, które przecinają prostokąt strony (najwyżej 2000). */
export function ringsIn(radial, width, height) {
  const far = Math.max(...[[0, 0], [width, 0], [0, height], [width, height]].map(([px, py]) => Math.hypot(px - radial.x, py - radial.y)));
  const near = Math.hypot(Math.max(-radial.x, 0, radial.x - width), Math.max(-radial.y, 0, radial.y - height));
  const radii = [];
  for (let index = Math.max(1, Math.ceil(near / radial.spacing)); index * radial.spacing <= far && radii.length < 2000; index += 1) {
    radii.push(index * radial.spacing);
  }
  return radii;
}

/** Kierunki wszystkich promieni (radiany) – pełny obrót co `step`. */
export function rayAngles(radial) {
  const count = Math.max(1, Math.round((Math.PI * 2) / radial.step));
  return Array.from({ length: count }, (_, index) => radial.angle + index * radial.step);
}
