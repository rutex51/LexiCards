// Pomiary 3D (od 1.53) – bez przeglądarki. Cechy bryły w jej układzie (jak współrzędne siatki: x, y – w górę, z):
// narożniki, środki ścian płaskich, wierzchołek stożka, środek kuli (punkty); krawędzie proste (proste); ściany płaskie
// (płaszczyzny); oś walca, stożka i bryły obrotowej (prosta – dotknięcie powierzchni zakrzywionej). Pomiar między dwiema
// cechami, także na różnych bryłach: punkt–punkt – odległość i ΔX, ΔY, ΔZ; punkt–prosta i punkt–płaszczyzna – odległość
// prostopadła; dwie proste, prosta i płaszczyzna, dwie płaszczyzny – kąt (0–90°), a gdy równoległe – odległość.
//
// Pomiar jest zapisany w bryle pierwszej cechy: measures [{ a, b }], odnośnik { id – bryła, role, p, d? } – rola cechy,
// punkt (narożnik, środek, środek krawędzi albo ściany) i kierunek (krawędź) albo normalna (ściana, środek ściany)
// w układzie bryły. Po zmianie bryły (przesunięcie, obrót, wymiary) – cecha tej samej roli i kierunku najbliższa zapisanej:
// pomiar idzie za bryłą, rysunek brył się nie zmienia.

import { sketchToBody, solidShape } from './solids.js';
import { worldRotation } from './solid-pose.js';

const ID_RE = /^[a-z0-9]{6,16}$/;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const R2D = 180 / Math.PI;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
  const size = length(a);
  return size > 1e-12 ? mul(a, 1 / size) : null;
};
const apply3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/** Role cech: punkty, proste i płaszczyzny. */
export const MEASURE_ROLES = Object.freeze({
  corner: 'point', center: 'point', apex: 'point', sphere: 'point', edge: 'line', axis: 'line', face: 'plane'
});
/** Nazwy cech w interfejsie. */
export const ROLE_LABELS = Object.freeze({
  corner: 'Narożnik', center: 'Środek ściany', apex: 'Wierzchołek', sphere: 'Środek kuli', edge: 'Krawędź', axis: 'Oś', face: 'Ściana'
});
/** Najwięcej pomiarów w jednej bryle; kąt, poniżej którego proste i płaszczyzny są równoległe (stopnie). */
export const MEASURE_LIMITS = Object.freeze({ count: 20, parallel: 0.01 });

// ---------------------------------------------------------------- cechy bryły

const featureCache = new WeakMap();
/**
 * Cechy bryły w jej układzie: { points: [{ role, p, d?, faces? }], edges: [{ role: 'edge', p – środek, d, a, b, faces, segments }],
 * faces: [{ role: 'face', p – środek, n, loops }], axis: { role: 'axis', p, d, a, b } | null, facets – ściana siatki →
 * { kind: 'face', index } | { kind: 'axis' } | null, mesh }. Ściany płaskie – ściany siatki połączone krawędziami gładkimi
 * o tej samej normalnej; zakrzywione (walec, stożek, bryła obrotowa) – oś bryły.
 */
export function solidFeatures(solid) {
  const cached = featureCache.get(solid);
  if (cached) return cached;
  const result = solid.kind === 'sphere' ? sphereFeatures() : meshFeatures(solid);
  featureCache.set(solid, result);
  return result;
}
function sphereFeatures() {
  return { points: [{ role: 'sphere', p: [0, 0, 0] }], edges: [], faces: [], axis: null, facets: [], mesh: null };
}
function meshFeatures(solid) {
  const mesh = solidShape(solid);
  const count = mesh.F.length;
  // Obszary: ściany siatki połączone krawędziami gładkimi.
  const parent = Array.from({ length: count }, (_, index) => index);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== root) [index, parent[index]] = [parent[index], root];
    return root;
  };
  for (const edge of mesh.E) {
    if (edge.sharp || edge.faces.length < 2) continue;
    const [a, b] = edge.faces.map(find);
    if (a !== b) parent[a] = b;
  }
  const regions = new Map();
  for (let face = 0; face < count; face += 1) {
    const root = find(face);
    if (!regions.has(root)) regions.set(root, []);
    regions.get(root).push(face);
  }
  const faces = [];
  const facets = new Array(count).fill(null);
  let curved = false;
  for (const members of regions.values()) {
    const n = mesh.N[members[0]];
    if (!members.every((face) => dot(mesh.N[face], n) > 1 - 1e-6)) {
      curved = true;
      for (const face of members) facets[face] = { kind: 'axis' };
      continue;
    }
    // Środek ściany: środek ciężkości pól (otwory – z ujemnym polem, kolejność wierzchołków względem normalnej).
    let area = 0;
    let center = [0, 0, 0];
    const loops = [];
    for (const face of members) {
      for (const loop of mesh.F[face]) {
        const points = loop.map((index) => mesh.V[index]);
        loops.push(points);
        for (let at = 1; at + 1 < points.length; at += 1) {
          const piece = dot(cross(sub(points[at], points[0]), sub(points[at + 1], points[0])), n) / 2;
          area += piece;
          center = add(center, mul(add(add(points[0], points[at]), points[at + 1]), piece / 3));
        }
      }
    }
    const p = Math.abs(area) > 1e-9 ? mul(center, 1 / area) : loops[0][0];
    const index = faces.length;
    faces.push({ role: 'face', p, n, loops });
    for (const face of members) facets[face] = { kind: 'face', index };
  }
  // Krawędzie proste: ostre krawędzie między dwiema ścianami płaskimi – odcinki tej samej pary ścian to jedna prosta.
  const lines = new Map();
  for (const edge of mesh.E) {
    if (!edge.sharp || edge.faces.length !== 2) continue;
    const [f1, f2] = edge.faces.map((face) => facets[face]);
    if (f1?.kind !== 'face' || f2?.kind !== 'face' || f1.index === f2.index) continue;
    const key = f1.index < f2.index ? `${f1.index}-${f2.index}` : `${f2.index}-${f1.index}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(edge);
  }
  const edges = [];
  const incident = new Map();
  const touching = new Map();
  for (const [key, segments] of lines) {
    const pair = key.split('-').map(Number);
    const [first] = segments;
    const d = unit(sub(mesh.V[first.b], mesh.V[first.a]));
    if (!d) continue;
    const start = mesh.V[first.a];
    let [low, high] = [Infinity, -Infinity];
    for (const segment of segments) {
      for (const vertex of [segment.a, segment.b]) {
        const t = dot(sub(mesh.V[vertex], start), d);
        low = Math.min(low, t);
        high = Math.max(high, t);
        if (!incident.has(vertex)) incident.set(vertex, []);
        incident.get(vertex).push(d);
        if (!touching.has(vertex)) touching.set(vertex, new Set());
        pair.forEach((index) => touching.get(vertex).add(index));
      }
    }
    const a = add(start, mul(d, low));
    const b = add(start, mul(d, high));
    edges.push({ role: 'edge', p: mul(add(a, b), 0.5), d, a, b, faces: pair, segments: segments.map((segment) => [mesh.V[segment.a], mesh.V[segment.b]]) });
  }
  // Narożniki: wierzchołki co najmniej dwóch krawędzi prostych w różnych kierunkach. faces – ściany płaskie przy cesze
  // (widać ją, gdy któraś z nich jest zwrócona do patrzącego; brak – zawsze).
  const points = [];
  for (const [vertex, directions] of incident) {
    if (directions.some((d) => Math.abs(dot(d, directions[0])) < 0.999)) points.push({ role: 'corner', p: mesh.V[vertex], faces: [...touching.get(vertex)] });
  }
  faces.forEach((face, index) => points.push({ role: 'center', p: face.p, d: face.n, faces: [index] }));
  if (solid.kind === 'cone' && solid.dims.t === 0) points.push({ role: 'apex', p: [0, solid.dims.h / 2, 0] });
  // Oś: walec i stożek – y bryły, bryła obrotowa – x bryły; od podstawy do góry (obrotowa – na długości profilu).
  let axis = null;
  if (curved && (solid.kind === 'cylinder' || solid.kind === 'cone')) {
    const h = solid.dims.h / 2;
    axis = { role: 'axis', p: [0, 0, 0], d: [0, 1, 0], a: [0, -h, 0], b: [0, h, 0] };
  } else if (curved && solid.kind === 'revolve') {
    // Oś bryły obrotowej – x profilu (szkic na XY – x bryły; od 1.54 na płaszczyźnie pionowej – pod kątem osi profilu).
    const toBody = sketchToBody(solid);
    const xs = solid.profile.islands.flatMap((island) => island.outer.map(([x]) => x));
    const [low, high] = [Math.min(...xs), Math.max(...xs)];
    const [a, b] = [toBody([low, 0, 0]), toBody([high, 0, 0])];
    axis = { role: 'axis', p: mul(add(a, b), 0.5), d: unit(sub(b, a)), a, b };
  }
  if (!axis) for (let face = 0; face < count; face += 1) if (facets[face]?.kind === 'axis') facets[face] = null;
  return { points, edges, faces, axis, facets, mesh };
}

/** Cecha w świecie (bryła w scenie: origin – początek układu bryły, yaw): punkty i kierunki obrócone, przesunięte. */
export function worldFeature(item, feature) {
  const m = worldRotation(item.yaw ?? 0);
  const at = (point) => add(item.origin, apply3(m, point));
  const kind = MEASURE_ROLES[feature.role];
  const world = { role: feature.role, kind, p: at(feature.p) };
  if (kind === 'line') Object.assign(world, { d: unit(apply3(m, feature.d)), a: at(feature.a), b: at(feature.b) });
  if (kind === 'plane') Object.assign(world, { d: unit(apply3(m, feature.n)), loops: feature.loops.map((loop) => loop.map(at)) });
  return world;
}

// ---------------------------------------------------------------- odnośniki

const round4 = (value) => Math.round(value * 1e4) / 1e4 || 0;
/** Odnośnik do cechy bryły (do zapisu). */
export function featureRef(solid, feature) {
  const ref = { id: solid.id, role: feature.role, p: feature.p.map(round4) };
  const direction = feature.role === 'face' ? feature.n : feature.role === 'center' || feature.role === 'edge' ? feature.d : null;
  if (direction) ref.d = direction.map(round4);
  return ref;
}
const nearest = (list, p) => list.reduce((best, item) => (!best || length(sub(item.p, p)) < length(sub(best.p, p)) ? item : best), null);
/** Cecha bryły dla odnośnika: tej samej roli (i kierunku) najbliższa zapisanego punktu; null – brak. */
export function resolveRef(solid, ref) {
  const features = solidFeatures(solid);
  switch (ref.role) {
    case 'corner': return nearest(features.points.filter((item) => item.role === 'corner'), ref.p);
    case 'center': return nearest(features.points.filter((item) => item.role === 'center' && dot(item.d, ref.d) > 0.999), ref.p);
    case 'apex': return features.points.find((item) => item.role === 'apex') ?? null;
    case 'sphere': return features.points.find((item) => item.role === 'sphere') ?? null;
    case 'edge': return nearest(features.edges.filter((item) => Math.abs(dot(item.d, ref.d)) > 0.999), ref.p);
    case 'face': return nearest(features.faces.filter((item) => dot(item.n, ref.d) > 0.999), ref.p);
    case 'axis': return features.axis;
    default: return null;
  }
}

const vector = (raw) => (Array.isArray(raw) && raw.length === 3 && raw.every(finite) ? raw.map(round4) : null);
function cleanRef(raw) {
  if (!raw || typeof raw !== 'object' || !ID_RE.test(raw.id ?? '') || !(raw.role in MEASURE_ROLES)) return null;
  const p = vector(raw.p);
  if (!p) return null;
  const needs = raw.role === 'face' || raw.role === 'center' || raw.role === 'edge';
  const d = needs ? vector(raw.d) : null;
  if (needs && (!d || length(d) < 1e-6)) return null;
  return { id: raw.id, role: raw.role, p, ...(d ? { d: unit(d).map(round4) } : {}) };
}
/** Sprawdzone pomiary bryły (zapis): { measures } albo {}. */
export function cleanMeasures(raw) {
  if (!Array.isArray(raw)) return {};
  const measures = raw.slice(0, MEASURE_LIMITS.count).map((item) => {
    const [a, b] = [cleanRef(item?.a), cleanRef(item?.b)];
    return a && b ? { a, b } : null;
  }).filter(Boolean);
  return measures.length > 0 ? { measures } : {};
}

/**
 * Pomiary rysunku: [{ owner – bryła z zapisem, at – numer pomiaru, a, b – { solid, ref, feature } }]; pomiar z bryłą,
 * której nie ma, albo z cechą, której nie da się znaleźć – pominięty.
 */
export function drawingMeasures(strokes) {
  const byId = new Map();
  for (const stroke of strokes) if (stroke?.tool === 'solid' && stroke.id && !byId.has(stroke.id)) byId.set(stroke.id, stroke);
  const list = [];
  for (const owner of strokes) {
    if (owner?.tool !== 'solid' || !owner.measures) continue;
    owner.measures.forEach((measure, at) => {
      const ends = [measure.a, measure.b].map((ref) => {
        const solid = byId.get(ref.id);
        const feature = solid ? resolveRef(solid, ref) : null;
        return feature ? { solid, ref, feature } : null;
      });
      if (ends.every(Boolean)) list.push({ owner, at, a: ends[0], b: ends[1] });
    });
  }
  return list;
}
/** Pomiary z bryłami, których nie ma, albo bez cechy – usunięte (wczytanie rysunku). Zmienia tablicę w miejscu. */
export function resolveMeasures(strokes) {
  if (!strokes.some((stroke) => stroke?.tool === 'solid' && stroke.measures)) return;
  const valid = new Set(drawingMeasures(strokes).map((item) => `${strokes.indexOf(item.owner)}:${item.at}`));
  strokes.forEach((stroke, index) => {
    if (stroke?.tool !== 'solid' || !stroke.measures) return;
    const kept = stroke.measures.filter((_, at) => valid.has(`${index}:${at}`));
    if (kept.length === stroke.measures.length) return;
    const next = { ...stroke };
    if (kept.length > 0) next.measures = kept;
    else delete next.measures;
    strokes[index] = next;
  });
}
/** Bryła z dodanym pomiarem między cechami (odnośniki) – nowy obiekt; za dużo pomiarów – null. */
export function withMeasure(owner, a, b) {
  const list = owner.measures ?? [];
  if (list.length >= MEASURE_LIMITS.count) return null;
  return { ...owner, measures: [...list, { a, b }] };
}
/** Bryła bez pomiaru numer `at`. */
export function withoutMeasure(owner, at) {
  const list = (owner.measures ?? []).filter((_, index) => index !== at);
  const next = { ...owner };
  if (list.length > 0) next.measures = list;
  else delete next.measures;
  return next;
}

// ---------------------------------------------------------------- pomiar

const ORDER = { point: 0, line: 1, plane: 2 };
const footOnLine = (point, line) => add(line.p, mul(line.d, dot(sub(point, line.p), line.d)));
const footOnPlane = (point, plane) => sub(point, mul(plane.d, dot(sub(point, plane.p), plane.d)));
const angleBetween = (cosine) => Math.acos(Math.min(1, Math.abs(cosine))) * R2D;

/**
 * Pomiar między dwiema cechami w świecie (worldFeature): { kind: 'distance' | 'angle', type – rodzaj pary,
 * value – odległość (jednostki strony) albo kąt (stopnie), delta – [ΔX, ΔY, ΔZ] (punkt–punkt), parallel, distance –
 * najmniejsza odległość prostych skośnych, from, to – odcinek do narysowania (świat), first, second – cechy w kolejności
 * punkt, prosta, płaszczyzna }.
 */
export function measureFeatures(a, b) {
  const [first, second] = ORDER[a.kind] <= ORDER[b.kind] ? [a, b] : [b, a];
  const pair = `${first.kind}-${second.kind}`;
  const result = { type: pair, first, second, parallel: false };
  if (pair === 'point-point') {
    const delta = sub(second.p, first.p);
    return { ...result, kind: 'distance', value: length(delta), delta, from: first.p, to: second.p };
  }
  if (pair === 'point-line') {
    const to = footOnLine(first.p, second);
    return { ...result, kind: 'distance', value: length(sub(to, first.p)), from: first.p, to };
  }
  if (pair === 'point-plane') {
    const to = footOnPlane(first.p, second);
    return { ...result, kind: 'distance', value: length(sub(to, first.p)), from: first.p, to };
  }
  if (pair === 'line-line') {
    const angle = angleBetween(dot(first.d, second.d));
    if (angle < MEASURE_LIMITS.parallel) {
      const to = footOnLine(first.p, second);
      return { ...result, kind: 'distance', parallel: true, value: length(sub(to, first.p)), from: first.p, to };
    }
    // Najbliższe punkty prostych skośnych (albo przecinających się – odległość 0).
    const w = sub(first.p, second.p);
    const [aa, bb, cc, dd, ee] = [dot(first.d, first.d), dot(first.d, second.d), dot(second.d, second.d), dot(first.d, w), dot(second.d, w)];
    const den = aa * cc - bb * bb;
    const s = (bb * ee - cc * dd) / den;
    const t = (aa * ee - bb * dd) / den;
    const from = add(first.p, mul(first.d, s));
    const to = add(second.p, mul(second.d, t));
    return { ...result, kind: 'angle', value: angle, distance: length(sub(to, from)), from: first.p, to: second.p };
  }
  if (pair === 'line-plane') {
    const angle = 90 - angleBetween(dot(first.d, second.d));
    if (angle < MEASURE_LIMITS.parallel) {
      const to = footOnPlane(first.p, second);
      return { ...result, kind: 'distance', parallel: true, value: length(sub(to, first.p)), from: first.p, to };
    }
    return { ...result, kind: 'angle', value: angle, from: first.p, to: second.p };
  }
  const angle = angleBetween(dot(first.d, second.d));
  if (angle < MEASURE_LIMITS.parallel) {
    const to = footOnPlane(first.p, second);
    return { ...result, kind: 'distance', parallel: true, value: length(sub(to, first.p)), from: first.p, to };
  }
  return { ...result, kind: 'angle', value: angle, from: first.p, to: second.p };
}

/** Tytuł pomiaru w interfejsie. */
export function measureTitle(result) {
  const titles = {
    'point-point': 'Odległość',
    'point-line': 'Odległość punktu od prostej',
    'point-plane': 'Odległość punktu od płaszczyzny',
    'line-line': result.parallel ? 'Proste równoległe – odległość' : 'Kąt między prostymi',
    'line-plane': result.parallel ? 'Prosta równoległa do płaszczyzny – odległość' : 'Kąt prostej z płaszczyzną',
    'plane-plane': result.parallel ? 'Płaszczyzny równoległe – odległość' : 'Kąt między płaszczyznami'
  };
  return titles[result.type];
}

/** Kąt w stopniach z dwoma miejscami po przecinku: „20,00°”. */
export const angleText = (degrees) => `${(Math.round(degrees * 100) / 100).toFixed(2).replace('.', ',')}°`;

/** Czy cechę widać (któraś ze ścian płaskich przy niej zwrócona do patrzącego; zv – kierunek do patrzącego w świecie). */
export function featureVisible(solid, feature, yaw, zv) {
  if (!feature.faces) return true;
  const { faces } = solidFeatures(solid);
  const m = worldRotation(yaw ?? 0);
  return feature.faces.some((index) => dot(apply3(m, faces[index].n), zv) > 1e-5);
}
