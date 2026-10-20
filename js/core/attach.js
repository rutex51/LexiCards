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

import { isSegment, isShape, shapeOutline, shapePoint } from './shapes.js';

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
    if (isSegment(stroke)) {
      const [a, b] = [shapePoint(stroke, -0.5, 0), shapePoint(stroke, 0.5, 0)];
      return { corners: [a, b, shapePoint(stroke, 0, 0)], edges: [[a, b]] };
    }
    if (stroke.shape === 'ellipse') {
      return { corners: [[0.5, 0], [0, 0.5], [-0.5, 0], [0, -0.5]].map(([u, v]) => shapePoint(stroke, u, v)), edges: [], ellipse: stroke };
    }
    const { points, closed } = shapeOutline(stroke);
    const corners = [];
    for (let index = 0; index < points.length; index += 2) corners.push({ x: points[index], y: points[index + 1] });
    // Łamana (od 1.24) – bez boku od ostatniego wierzchołka do pierwszego.
    const edges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]]);
    return { corners, edges: closed ? edges : edges.slice(0, -1) };
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

/**
 * Miejsce przyciągnięcia dla punktu `point` w promieniu `radius` (jednostki strony): najbliższy
 * narożnik (szukany w nieco większym promieniu – ma pierwszeństwo), inaczej najbliższe miejsce na
 * krawędzi. Wynik { x, y, kind, target, ref } – ref do zapisania w `attach` (bez id) – albo null.
 * exclude – elementy pomijane (np. przesuwany odcinek).
 */
export function findSnap(strokes, point, radius, { exclude = new Set(), boxOf = plainBox } = {}) {
  let corner = null;
  let edge = null;
  for (const target of strokes) {
    if (exclude.has(target)) continue;
    const geometry = snapGeometry(target, boxOf);
    if (!geometry) continue;
    geometry.corners.forEach((candidate, index) => {
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (distance <= radius * 1.4 && (!corner || distance < corner.distance)) {
        corner = { x: candidate.x, y: candidate.y, kind: 'corner', target, ref: { kind: 'corner', index }, distance };
      }
    });
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
  const box = isShape(target) ? null : boxOf(target);
  const center = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: target.x, y: target.y };
  const away = [snap.x - center.x, snap.y - center.y];
  const unit = ([x, y]) => {
    const length = Math.hypot(x, y);
    return length > 1e-9 ? [x / length, y / length] : [0, -1];
  };
  const geometry = snapGeometry(target, boxOf);
  const side = snap.kind === 'edge' && Number.isInteger(snap.ref?.index) ? geometry?.edges[snap.ref.index] : null;
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
