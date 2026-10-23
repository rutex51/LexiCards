// Edycja geometrii (od 1.43, pakiet E planu „rysunek jak w CAD”) – bez przeglądarki: odsunięcie (odcinek, prosta,
// okrąg, łuk, prostokąt, łamana i wielokąt), zaokrąglenie i faza dwóch odcinków, przycinanie i wydłużanie do
// przecięć z innymi elementami, okrąg styczny do dwóch elementów o danym promieniu (TTR).
//
// Każda funkcja zwraca { shapes } (nowe kształty) albo { error } – komunikat dla użytkownika. Wyniki nie mają
// identyfikatora ani przyklejeń (poza kawałkiem, który zostaje w miejscu elementu – zob. trimAt).

import {
  MIN_SHAPE, arcFromPoints, arcGeometry, circleShape, cornerSize, isArc, isConnector, isMeasure, isSegment, isShape, isXline, polyFromPoints,
  polyPoints, segmentCaps, shapeContains, shapeOutline, shapePoint, withCaps, withCorner, withDash
} from './shapes.js';

const TAU = Math.PI * 2;
const EPS = 1e-9;
const round = (value) => Math.round(value * 100) / 100;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const length = (a) => Math.hypot(a.x, a.y);
const unit = (a) => {
  const size = length(a);
  return size > EPS ? { x: a.x / size, y: a.y / size } : { x: 0, y: 0 };
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Kąt w [0, 2π). */
const wrap = (angle) => ((angle % TAU) + TAU) % TAU;

/** Okrąg: elipsa o równych bokach bez pochylenia (do 2%). */
export const isCircleShape = (shape) => isShape(shape) && shape.shape === 'ellipse' && !shape.skew && Math.abs(shape.w - shape.h) <= Math.max(shape.w, shape.h) * 0.02;
/** Odcinek do edycji (odcinek i strzałka – bez prostej, półprostej i wymiaru). */
export const isPlainSegment = (shape) => isShape(shape) && (shape.shape === 'line' || shape.shape === 'arrow');
/** Końce odcinka (także prostej i półprostej – dwa punkty, przez które biegnie). */
export const segmentEnds = (shape) => [shapePoint(shape, -0.5, 0), shapePoint(shape, 0.5, 0)];

/** Kształt bez identyfikatora i przyklejeń (wynik edycji – nowy element). */
function fresh(shape) {
  const next = { ...shape };
  delete next.id;
  delete next.attach;
  return next;
}

/** Odcinek tego samego stylu od `a` do `b` (zakończenia – tylko na końcach, które zostają: keep { start, end }). */
function segmentFrom(shape, a, b, keep = { start: true, end: true }) {
  const caps = segmentCaps(shape);
  const next = {
    ...shape, x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2), w: round(Math.max(MIN_SHAPE, distance(a, b))), angle: Math.atan2(b.y - a.y, b.x - a.x)
  };
  return withCaps(next, { start: keep.start ? caps.start : 'none', end: keep.end ? caps.end : 'none' });
}

/** Nowy kształt z warstwami i sygnaturami elementu `source`. */
const withLayersOf = (shape, source) => (source.layers ? { ...shape, layers: [...source.layers] } : shape);

/** Łuk w kolorze, grubości i rodzaju linii elementu `source` na okręgu (center, radius) od kąta `from` o kąt `sweep`. */
function arcOn(source, center, radius, from, sweep) {
  const at = (angle) => ({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  const arc = arcFromPoints(at(from), at(from + sweep), at(from + sweep / 2), source);
  return arc ? withLayersOf(arc, source) : null;
}

// ---------------------------------------------------------------- odsunięcie

/** Lewa normalna jednostkowa odcinka a–b. */
const normalOf = (a, b) => unit({ x: -(b.y - a.y), y: b.x - a.x });

/** Przecięcie prostych p + t·r i q + u·s albo null (równoległe). */
function lineCross(p, r, q, s) {
  const denominator = cross(r, s);
  if (Math.abs(denominator) < EPS) return null;
  const t = cross(sub(q, p), s) / denominator;
  return add(p, scale(r, t));
}

/** Łamana przesunięta o `offset` w stronę lewej normalnej (ujemne – w prawo); zamknięta – wierzchołki cyklicznie. */
function offsetPolyline(points, offset, closed) {
  const count = points.length;
  const edges = [];
  for (let index = 0; index < (closed ? count : count - 1); index += 1) {
    const [a, b] = [points[index], points[(index + 1) % count]];
    const n = normalOf(a, b);
    edges.push({ a: add(a, scale(n, offset)), b: add(b, scale(n, offset)), dir: sub(b, a) });
  }
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const previous = closed ? edges[(index - 1 + edges.length) % edges.length] : edges[index - 1];
    const next = closed ? edges[index % edges.length] : edges[index];
    if (!previous) out.push(next.a);
    else if (!next) out.push(previous.b);
    else out.push(lineCross(previous.a, previous.dir, next.a, next.dir) ?? next.a);
  }
  return { points: out, edges };
}

/** Pole ze znakiem wielokąta (oś y w dół: dodatnie – zgodnie z ruchem wskazówek zegara na ekranie). */
function signedArea(points) {
  let sum = 0;
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  });
  return sum / 2;
}

/** Czy element da się odsunąć (odcinek, prosta, półprosta, okrąg, łuk, prostokąt bez pochylenia, łamana, wielokąt). */
export function canOffset(shape) {
  // Łącznik (od 1.45) – połączenie dwóch elementów, nie linia do odsuwania ani przycinania.
  if (!isShape(shape) || isMeasure(shape) || isConnector(shape)) return false;
  if (isSegment(shape)) return true;
  if (isArc(shape)) return Boolean(arcGeometry(shape));
  if (isCircleShape(shape)) return true;
  if (shape.shape === 'rect') return !shape.skew;
  return ['polyline', 'polygon', 'triangle', 'diamond', 'trapezoid', 'ngon'].includes(shape.shape);
}

/**
 * Odsunięcie elementu o `amount` (jednostki strony, > 0) w stronę punktu `side` (jak OFFSET w CAD): odcinek, prosta,
 * półprosta – równolegle; okrąg i łuk – współśrodkowo; prostokąt – o tyle samo z każdej strony (zaokrąglenie R ± d,
 * faza – o d·(2 − √2)); łamana i wielokąt (także trójkąt, romb, trapez, wielokąt foremny – jako wielokąt) – boki
 * równolegle, wierzchołki w przecięciach boków. { shapes: [nowy] } albo { error }.
 */
export function offsetShape(shape, amount, side) {
  if (!canOffset(shape)) return { error: 'Tego elementu nie da się odsunąć – odsuń odcinek, prostą, okrąg, łuk, prostokąt albo łamaną.' };
  if (!(amount > 0)) return { error: 'Odległość musi być większa od zera.' };
  if (isSegment(shape)) {
    const [a, b] = segmentEnds(shape);
    const n = normalOf(a, b);
    const sign = dot(sub(side, a), n) >= 0 ? 1 : -1;
    return { shapes: [fresh({ ...shape, x: round(shape.x + n.x * amount * sign), y: round(shape.y + n.y * amount * sign) })] };
  }
  if (isCircleShape(shape)) {
    const radius = shape.w / 2;
    const outside = distance(side, shape) > radius;
    const next = outside ? radius + amount : radius - amount;
    if (next * 2 < MIN_SHAPE) return { error: 'Odległość większa niż promień – okrąg do środka już się nie zmieści.' };
    const diameter = round(next * 2);
    return { shapes: [fresh({ ...shape, w: diameter, h: diameter })] };
  }
  if (isArc(shape)) {
    const { center, radius, start, sweep } = arcGeometry(shape);
    const next = distance(side, center) > radius ? radius + amount : radius - amount;
    if (next < MIN_SHAPE / 2) return { error: 'Odległość większa niż promień łuku.' };
    const arc = arcOn(shape, center, next, start, sweep);
    return arc ? { shapes: [fresh(arc)] } : { error: 'Nie da się odsunąć tego łuku.' };
  }
  if (shape.shape === 'rect') {
    const outside = !shapeContains(shape, side.x, side.y);
    const sign = outside ? 1 : -1;
    const [w, h] = [shape.w + 2 * amount * sign, shape.h + 2 * amount * sign];
    if (w < MIN_SHAPE || h < MIN_SHAPE) return { error: 'Odległość za duża – prostokąt do środka już się nie zmieści.' };
    let next = fresh({ ...shape, w: round(w), h: round(h) });
    if (shape.corner) {
      const size = cornerSize(shape) + sign * amount * (shape.corner.kind === 'chamfer' ? 2 - Math.SQRT2 : 1);
      next = withCorner(next, size > 0.01 ? { kind: shape.corner.kind, size } : null);
    }
    return { shapes: [next] };
  }
  // Łamana i wielokąt (od wielokąta foremnego i figur – wielokąt).
  const closed = shape.shape !== 'polyline';
  const points = closed && shape.shape !== 'polygon'
    ? (() => {
      const outline = shapeOutline(shape).points;
      return Array.from({ length: outline.length / 2 }, (_, index) => ({ x: outline[index * 2], y: outline[index * 2 + 1] }));
    })()
    : polyPoints(shape);
  let sign;
  if (closed) {
    // Lewa normalna wskazuje na zewnątrz, gdy wielokąt biegnie przeciwnie do ruchu wskazówek zegara na ekranie.
    const leftOut = signedArea(points) < 0;
    const outside = !shapeContains(shape, side.x, side.y);
    sign = outside === leftOut ? 1 : -1;
  } else {
    // Strona – względem najbliższego boku.
    let best = null;
    for (let index = 0; index + 1 < points.length; index += 1) {
      const [a, b] = [points[index], points[index + 1]];
      const t = Math.max(0, Math.min(1, dot(sub(side, a), sub(b, a)) / Math.max(EPS, dot(sub(b, a), sub(b, a)))));
      const gap = distance(side, add(a, scale(sub(b, a), t)));
      if (!best || gap < best.gap) best = { gap, a, b };
    }
    sign = dot(sub(side, best.a), normalOf(best.a, best.b)) >= 0 ? 1 : -1;
  }
  const { points: moved, edges } = offsetPolyline(points, amount * sign, closed);
  // Za duże odsunięcie do środka – bok odwraca kierunek.
  for (let index = 0; index < edges.length; index += 1) {
    const [a, b] = [moved[index], moved[(index + 1) % moved.length]];
    if (dot(sub(b, a), edges[index].dir) <= 0) return { error: 'Odległość za duża – boki zachodzą na siebie.' };
  }
  const kind = closed ? 'polygon' : 'polyline';
  const style = { color: shape.color, size: shape.size, fill: shape.fill, hatch: shape.hatch };
  const next = withLayersOf(withDash(polyFromPoints(kind, moved, { x: shape.x, y: shape.y, angle: shape.angle }, style), shape.dash), shape);
  return { shapes: [next] };
}

// ---------------------------------------------------------------- zaokrąglenie i faza

/**
 * Narożnik dwóch odcinków: przecięcie P ich prostych i dla każdego – koniec, który zostaje (dalszy od P albo po stronie
 * dotknięcia `picks[i]`), kierunek u od P do niego. null – odcinki równoległe.
 */
function cornerOf(first, second, picks = []) {
  const [a0, a1] = segmentEnds(first);
  const [b0, b1] = segmentEnds(second);
  const corner = lineCross(a0, sub(a1, a0), b0, sub(b1, b0));
  if (!corner) return null;
  // Zostaje koniec dalszy od P – spośród leżących po tej stronie P, po której jest dotknięcie (rzut na odcinek).
  const keep = (ends, pick) => {
    const along = (point) => dot(sub(point, corner), sub(ends[1], ends[0]));
    const side = [0, 1].filter((index) => !pick || Math.sign(along(ends[index])) === Math.sign(along(pick)));
    const pool = side.length > 0 ? side : [0, 1];
    return pool.reduce((best, index) => (distance(ends[index], corner) > distance(ends[best], corner) ? index : best), pool[0]);
  };
  const sides = [keep([a0, a1], picks[0]), keep([b0, b1], picks[1])];
  const kept = [[a0, a1][sides[0]], [b0, b1][sides[1]]];
  return { corner, kept, keepIndex: sides, u: kept.map((point) => unit(sub(point, corner))) };
}

/** Odcinek `shape` od zachowanego końca do punktu `to` – kierunek i zakończenia jak w oryginale. */
function trimmedTo(shape, keptIndex, kept, to) {
  return keptIndex === 1 ? segmentFrom(shape, to, kept, { start: false, end: true }) : segmentFrom(shape, kept, to, { start: true, end: false });
}

/** Odcinek bez przyklejenia końca, który się zmienił. */
function unlinkEnd(shape, keptIndex) {
  if (!shape.attach) return shape;
  const attach = { ...shape.attach };
  delete attach[keptIndex === 1 ? 'start' : 'end'];
  const next = { ...shape };
  if (Object.keys(attach).length > 0) next.attach = attach;
  else delete next.attach;
  return next;
}

/**
 * Zaokrąglenie dwóch odcinków promieniem `radius` (jak FILLET): odcinki skrócone (albo wydłużone) do punktów styczności
 * i łuk między nimi; promień 0 – ostry narożnik w przecięciu. picks – dotknięte miejsca (która część zostaje).
 * { shapes: [pierwszy, drugi, łuk?] } albo { error }.
 */
export function filletSegments(first, second, radius, picks = []) {
  if (!isPlainSegment(first) || !isPlainSegment(second)) return { error: 'Zaokrąglić można dwa odcinki.' };
  if (!(radius >= 0)) return { error: 'Promień nie może być ujemny.' };
  const geometry = cornerOf(first, second, picks);
  if (!geometry) return { error: 'Odcinki są równoległe – nie mają narożnika.' };
  const { corner, kept, keepIndex, u } = geometry;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(u[0], u[1]))));
  if (angle < 1e-3 || angle > Math.PI - 1e-3) return { error: 'Odcinki leżą na jednej prostej.' };
  const reach = radius / Math.tan(angle / 2);
  if (reach > distance(kept[0], corner) + 1e-6 || reach > distance(kept[1], corner) + 1e-6) return { error: 'Promień za duży – łuk nie zmieści się na odcinkach.' };
  const touch = u.map((direction) => add(corner, scale(direction, reach)));
  const lines = [first, second].map((shape, index) => unlinkEnd(trimmedTo(shape, keepIndex[index], kept[index], touch[index]), keepIndex[index]));
  if (radius === 0) return { shapes: lines };
  const bisector = unit(add(u[0], u[1]));
  const center = add(corner, scale(bisector, radius / Math.sin(angle / 2)));
  const middle = sub(center, scale(bisector, radius));
  const arc = arcOn(first, center, radius, Math.atan2(touch[0].y - center.y, touch[0].x - center.x), signedSweep(center, touch[0], middle, touch[1]));
  return arc ? { shapes: [...lines, arc] } : { error: 'Nie da się wpisać łuku.' };
}

/** Kąt łuku od `a` do `b` przez `m` (ze znakiem). */
function signedSweep(center, a, m, b) {
  const angle = (point) => Math.atan2(point.y - center.y, point.x - center.x);
  const forward = wrap(angle(b) - angle(a));
  return wrap(angle(m) - angle(a)) <= forward ? forward : forward - TAU;
}

/**
 * Faza dwóch odcinków (jak CHAMFER, równe odległości): odcinki skrócone o `size` od przecięcia i nowy odcinek
 * między nimi. { shapes: [pierwszy, drugi, faza] } albo { error }.
 */
export function chamferSegments(first, second, size, picks = []) {
  if (!isPlainSegment(first) || !isPlainSegment(second)) return { error: 'Fazować można dwa odcinki.' };
  if (!(size > 0)) return { error: 'Wielkość fazy musi być większa od zera.' };
  const geometry = cornerOf(first, second, picks);
  if (!geometry) return { error: 'Odcinki są równoległe – nie mają narożnika.' };
  const { corner, kept, keepIndex, u } = geometry;
  if (size > distance(kept[0], corner) + 1e-6 || size > distance(kept[1], corner) + 1e-6) return { error: 'Faza za duża – nie zmieści się na odcinkach.' };
  const cut = u.map((direction) => add(corner, scale(direction, size)));
  const lines = [first, second].map((shape, index) => unlinkEnd(trimmedTo(shape, keepIndex[index], kept[index], cut[index]), keepIndex[index]));
  const bevel = withCaps(fresh(segmentFrom({ ...first, shape: 'line' }, cut[0], cut[1])), { start: 'none', end: 'none' });
  return { shapes: [...lines, bevel] };
}

// ---------------------------------------------------------------- przecięcia (przycinanie, wydłużanie, okrąg styczny)

/**
 * Krawędzie elementu do przecięć: odcinki { kind: 'seg', a, b } (prosta i półprosta – długie odcinki) i okręgi
 * { kind: 'circle', center, radius, start?, sweep? } (łuk – z zakresem kątów). Wymiary i punkty – bez krawędzi.
 */
export function edgesOf(stroke) {
  if (isShape(stroke)) {
    if (isMeasure(stroke) || stroke.shape === 'point') return [];
    if (isCircleShape(stroke)) return [{ kind: 'circle', center: { x: stroke.x, y: stroke.y }, radius: stroke.w / 2 }];
    if (isArc(stroke)) {
      const arc = arcGeometry(stroke);
      if (arc) return [{ kind: 'circle', center: arc.center, radius: arc.radius, start: arc.start, sweep: arc.sweep }];
    }
    const { points, closed } = shapeOutline(stroke);
    return pathEdges(points, closed);
  }
  if ((stroke?.tool === 'pen' || stroke?.tool === 'highlighter') && Array.isArray(stroke.points)) {
    const flat = [];
    for (let index = 0; index + 2 < stroke.points.length; index += 3) flat.push(stroke.points[index], stroke.points[index + 1]);
    return pathEdges(flat, false);
  }
  return [];
}

function pathEdges(flat, closed) {
  const points = Array.from({ length: Math.floor(flat.length / 2) }, (_, index) => ({ x: flat[index * 2], y: flat[index * 2 + 1] }));
  const edges = [];
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) edges.push({ kind: 'seg', a: points[index], b: points[(index + 1) % points.length] });
  return edges;
}

/** Czy kąt `angle` leży na łuku (start, sweep) – z małym zapasem. */
function onArc(edge, angle) {
  if (edge.sweep === undefined) return true;
  const along = edge.sweep >= 0 ? wrap(angle - edge.start) : wrap(edge.start - angle);
  return along <= Math.abs(edge.sweep) + 1e-6 || along >= TAU - 1e-6;
}

/** Punkty przecięcia prostej p + t·d (t – parametr) z krawędzią: [{ t, point }] – tylko punkty leżące na krawędzi. */
function lineHits(p, d, edge) {
  if (edge.kind === 'seg') {
    const s = sub(edge.b, edge.a);
    const denominator = cross(d, s);
    if (Math.abs(denominator) < EPS) return [];
    const t = cross(sub(edge.a, p), s) / denominator;
    const u = cross(sub(edge.a, p), d) / denominator;
    if (u < -1e-9 || u > 1 + 1e-9) return [];
    return [{ t, point: add(p, scale(d, t)) }];
  }
  // Okrąg: |p + t·d − c|² = r².
  const f = sub(p, edge.center);
  const [a, b, c] = [dot(d, d), 2 * dot(f, d), dot(f, f) - edge.radius * edge.radius];
  const delta = b * b - 4 * a * c;
  if (delta < 0 || a < EPS) return [];
  const root = Math.sqrt(delta);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((t, index, list) => index === 0 || Math.abs(t - list[0]) > 1e-9)
    .map((t) => ({ t, point: add(p, scale(d, t)) }))
    .filter(({ point }) => onArc(edge, Math.atan2(point.y - edge.center.y, point.x - edge.center.x)));
}

/** Kąty przecięcia okręgu (c, r) z krawędzią – [{ angle, point }] (na krawędzi). */
function circleHits(center, radius, edge) {
  const angleOf = (point) => Math.atan2(point.y - center.y, point.x - center.x);
  if (edge.kind === 'seg') {
    return lineHits(edge.a, sub(edge.b, edge.a), { kind: 'circle', center, radius })
      .filter(({ t }) => t >= -1e-9 && t <= 1 + 1e-9).map(({ point }) => ({ angle: angleOf(point), point }));
  }
  const gap = distance(center, edge.center);
  if (gap < EPS || gap > radius + edge.radius + 1e-9 || gap < Math.abs(radius - edge.radius) - 1e-9) return [];
  const along = (radius * radius - edge.radius * edge.radius + gap * gap) / (2 * gap);
  const height = Math.sqrt(Math.max(0, radius * radius - along * along));
  const axis = unit(sub(edge.center, center));
  const base = add(center, scale(axis, along));
  const across = { x: -axis.y, y: axis.x };
  const points = height < 1e-9 ? [base] : [add(base, scale(across, height)), sub(base, scale(across, height))];
  return points.filter((point) => onArc(edge, Math.atan2(point.y - edge.center.y, point.x - edge.center.x))).map((point) => ({ angle: angleOf(point), point }));
}

/** Krawędzie wszystkich innych elementów (do przecięć z `target`). */
function cuttersFor(strokes, target) {
  return strokes.filter((stroke) => stroke !== target).flatMap((stroke) => edgesOf(stroke));
}

/** Czy element da się przyciąć (odcinek, strzałka, prosta, półprosta, okrąg, łuk). */
export const canTrim = (shape) => isShape(shape) && !isMeasure(shape) && !isConnector(shape) && (isSegment(shape) || isCircleShape(shape) || (isArc(shape) && Boolean(arcGeometry(shape))));

/**
 * Przycięcie (jak TRIM w trybie szybkim): część elementu `target` między najbliższymi przecięciami z innymi
 * elementami po obu stronach dotkniętego miejsca `point` znika. Odcinek – krótszy albo dwa odcinki; prosta – półproste;
 * półprosta – odcinek albo krótsza półprosta; okrąg – łuk (potrzebne dwa przecięcia); łuk – krótszy albo dwa łuki.
 * { shapes: [kawałki – pierwszy zostaje na miejscu elementu] } albo { error }.
 */
export function trimAt(strokes, target, point) {
  if (!canTrim(target)) return { error: 'Przyciąć można odcinek, prostą, półprostą, okrąg albo łuk.' };
  const cutters = cuttersFor(strokes, target);
  if (isSegment(target)) {
    const [a, b] = segmentEnds(target);
    const d = sub(b, a);
    const tap = dot(sub(point, a), d) / dot(d, d);
    const low = target.shape === 'xline' ? -Infinity : 0;
    const high = isXline(target) ? Infinity : 1;
    const hits = cutters.flatMap((edge) => lineHits(a, d, edge)).map(({ t }) => t).filter((t) => t > low + 1e-6 && t < high - 1e-6);
    const before = Math.max(-Infinity, ...hits.filter((t) => t < tap - 1e-9));
    const after = Math.min(Infinity, ...hits.filter((t) => t > tap + 1e-9));
    if (before === -Infinity && after === Infinity) return { error: 'Ten element niczego nie przecina – nie ma czego przyciąć.' };
    const at = (t) => add(a, scale(d, t));
    const pieces = [];
    if (before > low) pieces.push(piece(target, low, before, at, d));
    if (after < high) pieces.push(piece(target, after, high, at, d));
    return { shapes: pieces.map((shape, index) => (index === 0 ? keepIdentity(shape, target) : fresh(shape))) };
  }
  const circle = isCircleShape(target) ? { center: { x: target.x, y: target.y }, radius: target.w / 2, start: 0, sweep: TAU, full: true } : { ...arcGeometry(target), full: false };
  const { center, radius } = circle;
  const tapAngle = Math.atan2(point.y - center.y, point.x - center.x);
  // Położenie na łuku: 0 – początek, |sweep| – koniec (w kierunku łuku).
  const direction = circle.sweep >= 0 ? 1 : -1;
  const along = (angle) => (direction > 0 ? wrap(angle - circle.start) : wrap(circle.start - angle));
  const span = Math.abs(circle.sweep);
  const hits = cutters.flatMap((edge) => circleHits(center, radius, edge)).map(({ angle }) => along(angle))
    .filter((s) => (circle.full ? true : s > 1e-6 && s < span - 1e-6));
  const tap = along(tapAngle);
  if (circle.full) {
    const unique = [...new Set(hits.map((s) => Math.round(s * 1e6) / 1e6))].sort((x, y) => x - y);
    if (unique.length < 2) return { error: 'Okrąg trzeba przeciąć w co najmniej dwóch miejscach.' };
    const after = unique.find((s) => s > tap) ?? unique[0] + TAU;
    const before = [...unique].reverse().find((s) => s < tap) ?? unique.at(-1) - TAU;
    // Zostaje łuk od „po” do „przed” (dookoła, z pominięciem dotkniętej części).
    const arc = arcOn(target, center, radius, circle.start + after, TAU - (after - before));
    return arc ? { shapes: [keepIdentity(fresh(arc), target, false)] } : { error: 'Nie da się przyciąć tego okręgu.' };
  }
  const before = Math.max(-Infinity, ...hits.filter((s) => s < tap));
  const after = Math.min(Infinity, ...hits.filter((s) => s > tap));
  if (before === -Infinity && after === Infinity) return { error: 'Ten łuk niczego nie przecina – nie ma czego przyciąć.' };
  const pieces = [];
  if (before > -Infinity) pieces.push(arcOn(target, center, radius, circle.start, direction * before));
  if (after < Infinity) pieces.push(arcOn(target, center, radius, circle.start + direction * after, direction * (span - after)));
  return { shapes: pieces.filter(Boolean).map((shape, index) => (index === 0 ? keepIdentity(fresh(shape), target, false) : fresh(shape))) };
}

/** Kawałek odcinka, prostej albo półprostej od parametru `from` do `to` (nieskończoność – półprosta). */
function piece(target, from, to, at, d) {
  if (from === -Infinity) {
    // Od −∞ do `to`: półprosta od punktu `to` w stronę początku.
    const start = at(to);
    return { ...withCaps(fresh(target), { start: 'none', end: 'none' }), shape: 'ray', ...rayFrom(start, scale(d, -1)) };
  }
  if (to === Infinity) {
    const start = at(from);
    return { ...withCaps(fresh(target), { start: 'none', end: 'none' }), shape: 'ray', ...rayFrom(start, d) };
  }
  // Kawałek półprostej od początku – odcinek bez zakończeń.
  if (isXline(target)) return segmentFrom({ ...fresh(target), shape: 'line' }, at(from), at(to), { start: false, end: false });
  return segmentFrom(target, at(from), at(to), { start: from <= 1e-9, end: to >= 1 - 1e-9 });
}

/** Półprosta od punktu `start` w kierunku `d` (drugi punkt – 2 kratki dalej). */
function rayFrom(start, d) {
  const u = unit(d);
  const through = add(start, scale(u, 88));
  return { x: round((start.x + through.x) / 2), y: round((start.y + through.y) / 2), w: 88, h: 0, angle: Math.atan2(u.y, u.x) };
}

/** Kawałek, który zostaje na miejscu elementu: jego identyfikator (i przyklejone końce, gdy kształt ten sam). */
function keepIdentity(shape, target, sameEnds = true) {
  const next = { ...shape };
  if (target.id) next.id = target.id;
  if (sameEnds && target.attach && shape.shape === target.shape) {
    const [a, b] = segmentEnds(target);
    const [p, q] = segmentEnds(shape);
    const attach = {};
    if (target.attach.start && distance(a, p) < 0.01) attach.start = target.attach.start;
    if (target.attach.end && distance(b, q) < 0.01) attach.end = target.attach.end;
    if (Object.keys(attach).length > 0) next.attach = attach;
  }
  return next;
}

/** Czy element da się wydłużyć (odcinek, strzałka, półprosta – od początku, łuk). */
export const canExtend = (shape) => isShape(shape) && !isMeasure(shape) && (isPlainSegment(shape) || (isArc(shape) && Boolean(arcGeometry(shape))));

/**
 * Wydłużenie (jak EXTEND): koniec bliższy dotknięciu `point` przesuwa się do najbliższego przecięcia z innym
 * elementem w kierunku wydłużenia (odcinek – wzdłuż prostej, łuk – po okręgu). { shapes: [wydłużony] } albo { error }.
 */
export function extendAt(strokes, target, point) {
  if (!canExtend(target)) return { error: 'Wydłużyć można odcinek albo łuk.' };
  const cutters = cuttersFor(strokes, target);
  if (isPlainSegment(target)) {
    const [a, b] = segmentEnds(target);
    const d = sub(b, a);
    const atEnd = distance(point, b) <= distance(point, a);
    const hits = cutters.flatMap((edge) => lineHits(a, d, edge)).map(({ t }) => t);
    const next = atEnd ? Math.min(Infinity, ...hits.filter((t) => t > 1 + 1e-6)) : Math.max(-Infinity, ...hits.filter((t) => t < -1e-6));
    if (!Number.isFinite(next)) return { error: 'Na przedłużeniu nic nie leży – nie ma do czego wydłużyć.' };
    const to = add(a, scale(d, next));
    const shape = atEnd ? segmentFrom(target, a, to) : segmentFrom(target, to, b);
    return { shapes: [unlinkEnd(shape, atEnd ? 0 : 1)] };
  }
  const { center, radius, start, sweep } = arcGeometry(target);
  const direction = sweep >= 0 ? 1 : -1;
  const startPoint = { x: center.x + Math.cos(start) * radius, y: center.y + Math.sin(start) * radius };
  const endPoint = { x: center.x + Math.cos(start + sweep) * radius, y: center.y + Math.sin(start + sweep) * radius };
  const atEnd = distance(point, endPoint) <= distance(point, startPoint);
  const span = Math.abs(sweep);
  // Położenie przecięć poza łukiem: od końca dalej (atEnd) albo od początku wstecz.
  const beyond = cutters.flatMap((edge) => circleHits(center, radius, edge)).map(({ angle }) => (atEnd
    ? wrap(direction * (angle - (start + sweep)))
    : wrap(direction * (start - angle)))).filter((s) => s > 1e-6 && s < TAU - span - 1e-6);
  if (beyond.length === 0) return { error: 'Na przedłużeniu łuku nic nie leży – nie ma do czego wydłużyć.' };
  const extra = Math.min(...beyond);
  const arc = atEnd ? arcOn(target, center, radius, start, direction * (span + extra)) : arcOn(target, center, radius, start - direction * extra, direction * (span + extra));
  return arc ? { shapes: [keepIdentity(fresh(arc), target, false)] } : { error: 'Nie da się wydłużyć tego łuku.' };
}

// ---------------------------------------------------------------- okrąg styczny (TTR)

/** Element do styczności: prosta (odcinek, bok – najbliższy dotknięciu) albo okrąg (okrąg, łuk). */
export function tangentTarget(stroke, point) {
  const edges = edgesOf(stroke);
  let best = null;
  for (const edge of edges) {
    const gap = edge.kind === 'seg' ? segmentGap(point, edge.a, edge.b) : Math.abs(distance(point, edge.center) - edge.radius);
    if (!best || gap < best.gap) best = { gap, edge };
  }
  if (!best) return null;
  return best.edge.kind === 'seg' ? { kind: 'line', a: best.edge.a, b: best.edge.b } : { kind: 'circle', center: best.edge.center, radius: best.edge.radius };
}

function segmentGap(point, a, b) {
  const d = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(point, a), d) / Math.max(EPS, dot(d, d))));
  return distance(point, add(a, scale(d, t)));
}

/** Miejsca środka w odległości `radius` od elementu: proste równoległe albo okręgi współśrodkowe. */
function centerLoci(target, radius) {
  if (target.kind === 'line') {
    const n = normalOf(target.a, target.b);
    const d = sub(target.b, target.a);
    return [1, -1].map((sign) => ({ kind: 'line', p: add(target.a, scale(n, radius * sign)), d }));
  }
  return [target.radius + radius, Math.abs(target.radius - radius)].filter((r) => r > 1e-6).map((r) => ({ kind: 'circle', center: target.center, radius: r }));
}

function lociCross(one, two) {
  if (one.kind === 'line' && two.kind === 'line') {
    const point = lineCross(one.p, one.d, two.p, two.d);
    return point ? [point] : [];
  }
  if (one.kind === 'circle' && two.kind === 'line') return lociCross(two, one);
  if (one.kind === 'line') return lineHits(one.p, one.d, { kind: 'circle', center: two.center, radius: two.radius }).map(({ point }) => point);
  return circleHits(one.center, one.radius, { kind: 'circle', center: two.center, radius: two.radius }).map(({ point }) => point);
}

/** Punkt styczności okręgu o środku `center` z elementem. */
function touchPoint(target, center) {
  if (target.kind === 'line') {
    const d = sub(target.b, target.a);
    return add(target.a, scale(d, dot(sub(center, target.a), d) / dot(d, d)));
  }
  return add(target.center, scale(unit(sub(center, target.center)), target.radius));
}

/**
 * Okrąg o promieniu `radius` styczny do dwóch elementów (jak TTR): spośród możliwych – ten, którego punkty styczności
 * leżą najbliżej dotkniętych miejsc `picks`. { shapes: [okrąg] } albo { error }.
 */
export function tangentCircle(first, second, radius, picks, style) {
  if (!(radius > 0)) return { error: 'Promień musi być większy od zera.' };
  if (!first || !second) return { error: 'Dotknij linii albo okręgu.' };
  const centers = centerLoci(first, radius).flatMap((one) => centerLoci(second, radius).flatMap((two) => lociCross(one, two)));
  if (centers.length === 0) return { error: 'Nie ma okręgu o tym promieniu stycznego do obu elementów.' };
  let best = null;
  for (const center of centers) {
    const score = distance(touchPoint(first, center), picks[0]) + distance(touchPoint(second, center), picks[1]);
    if (!best || score < best.score) best = { score, center };
  }
  return { shapes: [circleShape(best.center, radius, style)] };
}
