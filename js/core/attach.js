// Przyciąganie i przyklejanie końców (od 1.22): koniec odcinka albo strzałki (i strzałki karteczki)
// przyciąga się do narożnika albo krawędzi kształtu, ramki tabeli, karteczki, pola tekstowego czy
// wzoru, a przyklejony – zostaje przy nim, gdy kształt się przesuwa albo zmienia. Bez przeglądarki.
//
// Element, do którego coś jest przyklejone, ma `id` (krótki napis, nadawany przy przyklejeniu).
// Przyklejony koniec – w `attach` elementu: odcinek { start?, end? }, karteczka { leader? }; każde
// to { id, kind: 'corner', index } (narożnik) albo { id, kind: 'edge', index, t } (krawędź – numer
// boku i miejsce na nim 0–1; elipsa – { id, kind: 'edge', angle }: kąt na elipsie w jej układzie).
// Od 1.22.1 także strzałka ramki tolerancji i trójkąt znaku bazy { leader? } oraz wierzchołek symbolu
// chropowatości { tip? } – przyklejony wierzchołek przesuwa cały symbol.
// Od 1.34 środek okręgu (elipsy) i łuku – { id, kind: 'center' }; końce wymiaru przyklejają się jak
// końce odcinka (wymiar idzie za mierzonym kształtem). Do wymiaru nic się nie przyciąga.
// Od 1.42 przyciąganie także do środka zamkniętego kształtu ({ kind: 'center' }), środka boku
// (miejsce 'mid' – zapis { kind: 'edge', index, t: 0,5 }), przecięcia dwóch linii ('intersection' –
// zapis jako miejsce na krawędzi jednego z elementów) i kresek pióra (końce i linia – bez przyklejania).

import { arcGeometry, isMeasure, isSegment, isShape, shapeCenter, shapeOutline, shapePoint } from './shapes.js';

const ID_RE = /^[a-z0-9]{6,16}$/;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const round = (value) => Math.round(value * 100) / 100;
/** Końce, które mogą być przyklejone: odcinek i strzałka – oba, karteczka i symbole – koniec strzałki, chropowatość – wierzchołek. */
const ENDS = Object.freeze({ shape: ['start', 'end'], sticky: ['leader'], gdt: ['leader'], datum: ['leader'], roughness: ['tip'] });

/** Elementy z ramką (prostokąt) – pole tekstowe, wzór, tabela, karteczka, symbol metrologiczny. */
const isFramed = (stroke) => ['text', 'math', 'table', 'sticky', 'gdt', 'datum', 'roughness'].includes(stroke?.tool);
const plainBox = (stroke) => ({ x: stroke.x, y: stroke.y, width: stroke.width, height: stroke.height });

/**
 * Geometria do przyciągania: narożniki [{ x, y }] i boki [[a, b]] (elipsa – bez boków, za to
 * `ellipse` – kształt). Kreski pióra i szyki – null. boxOf(element) – prostokąt elementu z ramką
 * (zwinięta karteczka – sama ikona).
 */
export function snapGeometry(stroke, boxOf = plainBox) {
  if (isShape(stroke)) {
    if (isMeasure(stroke)) return null;
    if (isSegment(stroke)) {
      const [a, b] = [shapePoint(stroke, -0.5, 0), shapePoint(stroke, 0.5, 0)];
      return { corners: [a, b, shapePoint(stroke, 0, 0)], edges: [[a, b]] };
    }
    // Punkt (od 1.27) – sam środek; łuk – końce i krzywa (bez narożników w punktach obrysu).
    if (stroke.shape === 'point') return { corners: [{ x: stroke.x, y: stroke.y }], edges: [] };
    if (stroke.shape === 'curve' || stroke.shape === 'arc') {
      const { points } = shapeOutline(stroke);
      const along = [];
      for (let index = 0; index < points.length; index += 2) along.push({ x: points[index], y: points[index + 1] });
      // Łuk (od 1.34) – także środek jego okręgu.
      const center = stroke.shape === 'arc' ? arcGeometry(stroke)?.center ?? null : null;
      return { corners: [along[0], along.at(-1)], edges: along.slice(1).map((point, index) => [along[index], point]), ...(center ? { center } : {}) };
    }
    if (stroke.shape === 'ellipse') {
      return {
        corners: [[0.5, 0], [0, 0.5], [-0.5, 0], [0, -0.5]].map(([u, v]) => shapePoint(stroke, u, v)), edges: [], ellipse: stroke,
        center: { x: stroke.x, y: stroke.y }
      };
    }
    const { points, closed } = shapeOutline(stroke);
    const corners = [];
    for (let index = 0; index < points.length; index += 2) corners.push({ x: points[index], y: points[index + 1] });
    // Łamana (od 1.24) – bez boku od ostatniego wierzchołka do pierwszego; zamknięty kształt (od 1.42) – ze środkiem.
    const edges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]]);
    const center = closed ? shapeCenter(stroke) : null;
    return { corners, edges: closed ? edges : edges.slice(0, -1), ...(center ? { center } : {}) };
  }
  if (isFramed(stroke)) {
    const box = boxOf(stroke);
    const corners = [
      { x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height }
    ];
    return { corners, edges: corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]]) };
  }
  return null;
}

/** Najbliższy punkt odcinka a–b: { x, y, t, distance }. */
function onSegment(point, a, b) {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  const [x, y] = [a.x + dx * t, a.y + dy * t];
  return { x, y, t, distance: Math.hypot(point.x - x, point.y - y) };
}

/** Najbliższy punkt elipsy (kąt w jej układzie): przybliżenie co 4° i dokładniej wokół najlepszego. */
function onEllipse(point, shape) {
  const at = (angle) => shapePoint(shape, 0.5 * Math.cos(angle), 0.5 * Math.sin(angle));
  let best = null;
  const visit = (angle) => {
    const candidate = at(angle);
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (!best || distance < best.distance) best = { ...candidate, angle, distance };
  };
  for (let step = 0; step < 90; step += 1) visit((step / 90) * Math.PI * 2);
  for (let span = Math.PI / 45; span > 1e-4; span /= 2) {
    const center = best.angle;
    visit(center - span);
    visit(center + span);
  }
  return best;
}

/** Kreska pióra albo zakreślacza (od 1.42 – przyciąga się do niej, ale nic się do niej nie przykleja). */
const isInk = (stroke) => (stroke?.tool === 'pen' || stroke?.tool === 'highlighter') && Array.isArray(stroke.points);
/** Punkty kreski pióra [{ x, y }, …]. */
const inkPoints = (stroke) => Array.from({ length: Math.floor(stroke.points.length / 3) }, (_, index) => ({ x: stroke.points[index * 3], y: stroke.points[index * 3 + 1] }));

/** Najbliższe miejsce na krawędziach elementu (z jego geometrią): { x, y, kind: 'edge', target, ref, distance } albo null. */
function edgeSnapOf(target, geometry, point, radius) {
  let edge = null;
  geometry.edges.forEach(([a, b], index) => {
    const near = onSegment(point, a, b);
    if (near.distance <= radius && (!edge || near.distance < edge.distance)) {
      edge = { x: near.x, y: near.y, kind: 'edge', target, ref: { kind: 'edge', index, t: Math.round(near.t * 10000) / 10000 }, distance: near.distance };
    }
  });
  if (geometry.ellipse) {
    const near = onEllipse(point, geometry.ellipse);
    if (near.distance <= radius && (!edge || near.distance < edge.distance)) {
      edge = { x: near.x, y: near.y, kind: 'edge', target, ref: { kind: 'edge', angle: Math.round(near.angle * 10000) / 10000 }, distance: near.distance };
    }
  }
  return edge;
}

/** Odcinki linii elementu w pobliżu punktu (do przecięć, od 1.42): obrys kształtu (prosta – przez całą stronę), ramka, kreska pióra. */
function linesNear(stroke, point, reach, boxOf) {
  let points = null;
  let closed = false;
  if (isShape(stroke)) {
    if (isMeasure(stroke) || stroke.shape === 'point') return [];
    const outline = shapeOutline(stroke);
    points = [];
    for (let index = 0; index + 1 < outline.points.length; index += 2) points.push({ x: outline.points[index], y: outline.points[index + 1] });
    closed = outline.closed;
  } else if (isFramed(stroke)) {
    const geometry = snapGeometry(stroke, boxOf);
    points = geometry.corners;
    closed = true;
  } else if (isInk(stroke)) {
    points = inkPoints(stroke);
  } else {
    return [];
  }
  const out = [];
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const [a, b] = [points[index], points[(index + 1) % points.length]];
    if (onSegment(point, a, b).distance <= reach) out.push([a, b]);
  }
  return out;
}

/** Punkt przecięcia odcinków a–b i c–d (z końcami) albo null (równoległe). */
function crossing([a, b], [c, d]) {
  const [rx, ry, sx, sy] = [b.x - a.x, b.y - a.y, d.x - c.x, d.y - c.y];
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: a.x + rx * t, y: a.y + ry * t };
}

/**
 * Miejsce przyciągnięcia dla punktu `point` w promieniu `radius` (jednostki strony): najbliższy
 * punkt szczególny – narożnik, środek okręgu, łuku i (od 1.42) zamkniętego kształtu, środek boku,
 * przecięcie dwóch linii, koniec kreski pióra (szukany w nieco większym promieniu – ma pierwszeństwo),
 * inaczej najbliższe miejsce na krawędzi. Wynik { x, y, kind, target, ref } – ref do zapisania
 * w `attach` (bez id; null – bez przyklejania, np. kreska pióra) – albo null. exclude – elementy
 * pomijane (np. przesuwany odcinek).
 */
export function findSnap(strokes, point, radius, { exclude = new Set(), boxOf = plainBox } = {}) {
  let corner = null;
  let edge = null;
  const near = [];
  const offer = (candidate) => {
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distance <= radius * 1.4 && (!corner || distance < corner.distance)) corner = { ...candidate, distance };
  };
  for (const target of strokes) {
    if (exclude.has(target)) continue;
    // Kreska pióra (od 1.42): końce i najbliższe miejsce na linii – bez przyklejania.
    if (isInk(target)) {
      const points = inkPoints(target);
      if (points.length === 0) continue;
      for (const end of [points[0], points.at(-1)]) offer({ x: end.x, y: end.y, kind: 'corner', target, ref: null });
      for (let index = 1; index < points.length; index += 1) {
        const spot = onSegment(point, points[index - 1], points[index]);
        if (spot.distance <= radius && (!edge || spot.distance < edge.distance)) edge = { x: spot.x, y: spot.y, kind: 'edge', target, ref: null, distance: spot.distance };
      }
      near.push(target);
      continue;
    }
    const geometry = snapGeometry(target, boxOf);
    if (!geometry) continue;
    geometry.corners.forEach((candidate, index) => offer({ x: candidate.x, y: candidate.y, kind: 'corner', target, ref: { kind: 'corner', index } }));
    // Środek okręgu i łuku (od 1.34), od 1.42 też zamkniętego kształtu – jak narożnik.
    if (geometry.center) offer({ x: geometry.center.x, y: geometry.center.y, kind: 'center', target, ref: { kind: 'center' } });
    // Środek boku (od 1.42) – boki dłuższe niż dwa promienie (bez gęstych punktów łuków); odcinek ma środek wśród narożników.
    if (!(isShape(target) && isSegment(target))) {
      geometry.edges.forEach(([a, b], index) => {
        if (Math.hypot(b.x - a.x, b.y - a.y) > radius * 2) offer({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'mid', target, ref: { kind: 'edge', index, t: 0.5 } });
      });
    }
    const spot = edgeSnapOf(target, geometry, point, radius);
    if (spot && (!edge || spot.distance < edge.distance)) edge = spot;
    near.push(target);
  }
  // Przecięcia (od 1.42): linie dwóch różnych elementów w pobliżu punktu; przyklejenie – do krawędzi
  // tego z nich, na którym punkt przecięcia da się zapisać (prosta i kreska pióra – nie).
  const reach = radius * 1.4;
  const lines = near.map((target) => ({ target, lines: linesNear(target, point, reach, boxOf) })).filter((item) => item.lines.length > 0).slice(0, 24);
  for (let first = 0; first < lines.length; first += 1) {
    for (let second = first + 1; second < lines.length; second += 1) {
      for (const one of lines[first].lines) {
        for (const two of lines[second].lines) {
          const spot = crossing(one, two);
          if (!spot) continue;
          const distance = Math.hypot(point.x - spot.x, point.y - spot.y);
          if (distance > reach || (corner && corner.distance <= distance)) continue;
          let anchor = null;
          for (const target of [lines[first].target, lines[second].target]) {
            const geometry = isInk(target) ? null : snapGeometry(target, boxOf);
            const on = geometry ? edgeSnapOf(target, geometry, spot, 1) : null;
            if (on && Math.hypot(on.x - spot.x, on.y - spot.y) < 0.5) {
              anchor = on;
              break;
            }
          }
          corner = { x: spot.x, y: spot.y, kind: 'intersection', target: anchor?.target ?? lines[first].target, ref: anchor?.ref ?? null, distance };
        }
      }
    }
  }
  return corner ?? edge;
}

/**
 * Kierunek na zewnątrz elementu w miejscu przyciągnięcia (od 1.22.1 – nowa ramka tolerancji i znak bazy
 * stają prostopadle do krawędzi): bok – prostopadle do niego, od środka elementu; elipsa i narożnik –
 * od środka. Wektor jednostkowy [dx, dy].
 */
export function snapNormal(snap, boxOf = plainBox) {
  const { target } = snap;
  // Kreska pióra (od 1.42) – w górę w prawo, jak bez krawędzi.
  if (isInk(target)) return [Math.SQRT1_2, -Math.SQRT1_2];
  const box = isShape(target) ? null : boxOf(target);
  const center = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: target.x, y: target.y };
  const away = [snap.x - center.x, snap.y - center.y];
  const unit = ([x, y]) => {
    const length = Math.hypot(x, y);
    return length > 1e-9 ? [x / length, y / length] : [0, -1];
  };
  const geometry = snapGeometry(target, boxOf);
  const side = (snap.kind === 'edge' || snap.kind === 'mid') && Number.isInteger(snap.ref?.index) ? geometry?.edges[snap.ref.index] : null;
  if (!side) return unit(away);
  const [a, b] = side;
  let normal = unit([a.y - b.y, b.x - a.x]);
  const facing = normal[0] * away[0] + normal[1] * away[1];
  if (facing < -1e-6 || (Math.abs(facing) <= 1e-6 && normal[1] > 0)) normal = [-normal[0], -normal[1]];
  return normal;
}

/** Punkt przyklejonego końca na elemencie `target` albo null (np. narożnik, którego już nie ma). */
export function attachPoint(target, ref, boxOf = plainBox) {
  const geometry = snapGeometry(target, boxOf);
  if (!geometry) return null;
  if (ref.kind === 'corner') return geometry.corners[ref.index] ?? null;
  if (ref.kind === 'center') return geometry.center ?? null;
  if (ref.kind !== 'edge') return null;
  if (finite(ref.angle) && geometry.ellipse) return shapePoint(geometry.ellipse, 0.5 * Math.cos(ref.angle), 0.5 * Math.sin(ref.angle));
  const side = geometry.edges[ref.index];
  if (!side || !finite(ref.t)) return null;
  const [a, b] = side;
  return { x: a.x + (b.x - a.x) * ref.t, y: a.y + (b.y - a.y) * ref.t };
}

/** Odcinek (albo strzałka) od punktu a do b – te same zakończenia, kolor i grubość. */
export function segmentBetween(shape, a, b) {
  return { ...shape, x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2), w: round(Math.hypot(b.x - a.x, b.y - a.y)), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Nowy identyfikator elementu – inny niż wszystkie na rysunku. */
export function newElementId(strokes) {
  const used = new Set(strokes.map((stroke) => stroke.id).filter(Boolean));
  for (;;) {
    const id = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    if (ID_RE.test(id) && !used.has(id)) return id;
  }
}

/** Kopia elementu bez identyfikatora i przyklejeń (powielenie, wklejenie, szyk – kopia jest wolna). */
export function withoutLinks(stroke) {
  if (!stroke || (!('id' in stroke) && !('attach' in stroke))) return stroke;
  const copy = { ...stroke };
  delete copy.id;
  delete copy.attach;
  return copy;
}

/**
 * Kopie elementów (powielenie, wklejenie) z nowymi identyfikatorami: przyklejenia między kopiami
 * zostają (do nowych identyfikatorów), do elementów spoza kopii – znikają. existing – elementy rysunku.
 */
export function relinkCopies(copies, existing) {
  const ids = new Map();
  const taken = [...existing];
  for (const copy of copies) {
    if (!copy.id) continue;
    const id = newElementId(taken);
    ids.set(copy.id, id);
    taken.push({ id });
  }
  return copies.map((copy) => {
    if (!copy.id && !copy.attach) return copy;
    const next = { ...copy };
    if (copy.id) next.id = ids.get(copy.id);
    if (copy.attach) {
      const attach = Object.fromEntries(Object.entries(copy.attach).filter(([, ref]) => ids.has(ref.id)).map(([end, ref]) => [end, { ...ref, id: ids.get(ref.id) }]));
      if (Object.keys(attach).length > 0) next.attach = attach;
      else delete next.attach;
    }
    return next;
  });
}

/** Element bez przyklejeń do elementów spoza `ids` (przesunięty sam – odkleja się od tego, co zostało). */
export function keepLinksTo(stroke, ids) {
  if (!stroke.attach) return stroke;
  const attach = Object.fromEntries(Object.entries(stroke.attach).filter(([, ref]) => ids.has(ref.id)));
  const next = { ...stroke };
  if (Object.keys(attach).length > 0) next.attach = attach;
  else delete next.attach;
  return next;
}

/** Element z przyklejonym (ref z id) albo odklejonym (ref = null) końcem `end`. */
export function withLink(stroke, end, ref) {
  const attach = { ...(stroke.attach ?? {}) };
  if (ref) attach[end] = ref;
  else delete attach[end];
  const next = { ...stroke };
  if (Object.keys(attach).length > 0) next.attach = attach;
  else delete next.attach;
  return next;
}

/** Bieżący punkt końca `end` elementu: początek lub koniec odcinka, koniec strzałki karteczki. */
export function endPoint(stroke, end) {
  if (end === 'leader') return stroke.leader ?? null;
  if (end === 'tip') return { x: stroke.x, y: stroke.y };
  return shapePoint(stroke, end === 'start' ? -0.5 : 0.5, 0);
}

/** Element z końcem `end` w punkcie `point` (odcinek o długości mniejszej niż 1 – bez zmian). */
function movedEnd(stroke, end, point) {
  if (end === 'leader') return { ...stroke, leader: { x: round(point.x), y: round(point.y) } };
  if (end === 'tip') return { ...stroke, x: round(point.x), y: round(point.y) };
  const other = endPoint(stroke, end === 'start' ? 'end' : 'start');
  const [a, b] = end === 'start' ? [point, other] : [other, point];
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return stroke;
  return segmentBetween(stroke, a, b);
}

/**
 * Przyklejone końce w miejscach na swoich elementach – po każdej zmianie rysunku. Zmienia tablicę
 * w miejscu (nowe obiekty zamiast zmienionych) i zwraca mapę: stary → nowy. Przyklejenie do elementu,
 * którego już nie ma (albo do miejsca, którego nie ma), znika – koniec zostaje tam, gdzie był.
 * Kilka przebiegów – strzałka może być przyklejona do odcinka, który sam jest przyklejony.
 */
export function resolveAttachments(strokes, boxOf = plainBox) {
  const replaced = new Map();
  for (let pass = 0; pass < 3; pass += 1) {
    const byId = new Map();
    for (const stroke of strokes) if (stroke.id && !byId.has(stroke.id)) byId.set(stroke.id, stroke);
    let changed = false;
    strokes.forEach((stroke, index) => {
      if (!stroke.attach) return;
      let next = stroke;
      for (const [end, ref] of Object.entries(stroke.attach)) {
        const target = byId.get(ref.id);
        const point = target && target !== stroke ? attachPoint(target, ref, boxOf) : null;
        if (!point) {
          next = withLink(next, end, null);
          continue;
        }
        const current = endPoint(next, end);
        if (!current || Math.abs(current.x - point.x) > 0.01 || Math.abs(current.y - point.y) > 0.01) next = movedEnd(next, end, point);
      }
      if (next === stroke) return;
      strokes[index] = next;
      changed = true;
      // Łańcuch zamian: pierwszy obiekt → ostatni.
      const original = [...replaced.entries()].find(([, value]) => value === stroke)?.[0] ?? stroke;
      replaced.set(original, next);
    });
    if (!changed) break;
  }
  return replaced;
}

/**
 * Elementy, które idą za zmienianymi (podgląd w trakcie przesuwania albo zmiany kształtu): mapa
 * zmieniany → podgląd; wynik – mapa przyklejony do któregoś z nich → jego podgląd (z końcami
 * w nowych miejscach; także bez zmiany – warstwa zapisanych kresek go pomija od początku ruchu).
 */
export function followersOf(strokes, previews, boxOf = plainBox) {
  const ids = new Map();
  for (const [original, preview] of previews) if (original.id) ids.set(original.id, preview);
  const result = new Map();
  if (ids.size === 0) return result;
  for (const stroke of strokes) {
    if (!stroke.attach || previews.has(stroke)) continue;
    let next = stroke;
    let follows = false;
    for (const [end, ref] of Object.entries(stroke.attach)) {
      const target = ids.get(ref.id);
      if (!target) continue;
      follows = true;
      const point = attachPoint(target, ref, boxOf);
      if (point) next = movedEnd(next, end, point);
    }
    if (follows) result.set(stroke, next);
  }
  return result;
}

/** Sprawdzony odnośnik do zapisu (id, rodzaj, numer, miejsce) albo null. */
function cleanRef(raw) {
  if (!raw || typeof raw !== 'object' || !ID_RE.test(raw.id ?? '')) return null;
  if (raw.kind === 'corner' && Number.isInteger(raw.index) && raw.index >= 0 && raw.index < 100) return { id: raw.id, kind: 'corner', index: raw.index };
  if (raw.kind === 'center') return { id: raw.id, kind: 'center' };
  if (raw.kind !== 'edge') return null;
  if (finite(raw.angle)) return { id: raw.id, kind: 'edge', angle: raw.angle };
  if (Number.isInteger(raw.index) && raw.index >= 0 && raw.index < 100 && finite(raw.t)) {
    return { id: raw.id, kind: 'edge', index: raw.index, t: Math.min(1, Math.max(0, raw.t)) };
  }
  return null;
}

/**
 * Sprawdzony element (zapis, kopia zapasowa) z identyfikatorem i przyklejeniami ze źródła `raw`
 * – tylko poprawne (przyklejone mogą być końce odcinka i strzałki oraz strzałka karteczki).
 */
export function keepLinks(element, raw) {
  if (!element || !raw || typeof raw !== 'object') return element;
  const next = { ...element };
  if (ID_RE.test(raw.id ?? '')) next.id = raw.id;
  const ends = element.tool === 'shape' ? (isSegment(element) ? ENDS.shape : []) : ENDS[element.tool] ?? [];
  if (raw.attach && typeof raw.attach === 'object' && ends.length > 0) {
    const attach = {};
    for (const end of ends) {
      const ref = cleanRef(raw.attach[end]);
      if (ref && (end !== 'leader' || element.leader)) attach[end] = ref;
    }
    if (Object.keys(attach).length > 0) next.attach = attach;
  }
  return next;
}
