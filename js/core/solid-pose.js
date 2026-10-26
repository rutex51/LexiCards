// Położenie brył w przestrzeni (od 1.52) – bez przeglądarki. Bryła stoi w układzie arkusza (X w prawo, Y w górę kartki,
// Z do góry): punkt strony (x, y) – miejsce jej obrazka na kartce i zarazem X, Y w scenie (początek układu bryły nad nim),
// z – wysokość podstawy (najniższego punktu bryły) nad kartką, yaw – obrót wokół osi Z w stopniach (patrząc z góry –
// przeciwnie do ruchu wskazówek zegara), w (−180°, 180°]. Bez z i yaw – bryła stoi na kartce prosto (jak w 1.51).
//
// Bryła postawiona na innej: on { id, x, y, z, yaw } – położenie względem bryły pod spodem (o identyfikatorze id): x, y –
// przesunięcie początku układu w układzie tamtej bryły obróconym o jej yaw (jednostki strony, Y w górę kartki), z –
// wysokość podstawy nad wierzchem tamtej bryły (na wierzchu – 0), yaw – obrót względem niej. Idzie za bryłą pod spodem
// (przesunięcie, obrót, wysokość, zmiana wymiarów). Na kartce 2D cały stos to jeden obrazek – w widoku bryły na samym dole:
// x, y, q bryły postawionej (i jej bezwzględne z, yaw) wylicza resolveStacks. Zmiana samego obrazka bryły postawionej
// (przesunięcie, obrót obrazka, widok) przechodzi na cały obrazek – na bryłę na dole.

import { quatFromMatrix, quatMatrix, solidShape } from './solids.js';

const D2R = Math.PI / 180;
const ID_RE = /^[a-z0-9]{6,16}$/;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Granice: wysokość podstawy i przesunięcie względem bryły pod spodem (jednostki strony), najdłuższy stos. */
export const POSE_LIMITS = Object.freeze({ z: 20000, offset: 20000, chain: 12 });

/** Kąt w stopniach w (−180, 180]. */
export function normalYaw(value) {
  const angle = ((value % 360) + 360) % 360;
  const result = angle > 180 ? angle - 360 : angle;
  return Object.is(result, -0) ? 0 : result;
}

/** Sprawdzone położenie z zapisu (do bryły): { z?, yaw?, on? } – zero i brak to to samo. */
export function cleanPose(raw) {
  const pose = {};
  if (finite(raw?.z) && raw.z > 0) pose.z = round(Math.min(raw.z, POSE_LIMITS.z));
  if (finite(raw?.yaw) && normalYaw(round(raw.yaw)) !== 0) pose.yaw = normalYaw(round(raw.yaw));
  const on = raw?.on;
  if (on && typeof on === 'object' && ID_RE.test(on.id ?? '') && [on.x, on.y, on.z, on.yaw].every(finite)) {
    const limit = (value) => round(clamp(value, -POSE_LIMITS.offset, POSE_LIMITS.offset));
    pose.on = { id: on.id, x: limit(on.x), y: limit(on.y), z: limit(on.z), yaw: normalYaw(round(on.yaw)) };
  }
  return pose;
}

// ---------------------------------------------------------------- zasięg i obroty

const extentCache = new WeakMap();
/** Zasięg bryły w jej układzie: { min: [x, y, z], max } (kula – promień). */
export function bodyExtent(solid) {
  const cached = extentCache.get(solid);
  if (cached) return cached;
  let result;
  if (solid.kind === 'sphere') {
    const r = solid.dims.d / 2;
    result = { min: [-r, -r, -r], max: [r, r, r] };
  } else {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const vertex of solidShape(solid).V) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], vertex[axis]);
        max[axis] = Math.max(max[axis], vertex[axis]);
      }
    }
    result = { min, max };
  }
  extentCache.set(solid, result);
  return result;
}
/** Wysokość bryły (wzdłuż Z – y bryły). */
export function solidHeight(solid) {
  const { min, max } = bodyExtent(solid);
  return max[1] - min[1];
}

/** Obrót bryły stojącej prosto (wiersze: świat z układu bryły) – X = x, Y = −z, Z = y (W1). */
export const UPRIGHT = Object.freeze([1, 0, 0, 0, 0, -1, 0, 1, 0]);
const mul3 = (a, b) => [0, 1, 2].flatMap((row) => [0, 1, 2].map((column) => a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column]));
const transpose3 = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const apply3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
/** Obrót wokół osi Z świata (stopnie). */
export function rotZ(yaw) {
  const [c, s] = [Math.cos(yaw * D2R), Math.sin(yaw * D2R)];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
/** Obrót bryły w świecie: wokół Z o yaw, bryła stojąca prosto. */
export const worldRotation = (yaw) => mul3(rotZ(yaw), UPRIGHT);

// ---------------------------------------------------------------- stosy

/** Bryły rysunku po identyfikatorze (pierwsza z danym identyfikatorem). */
export function solidsById(strokes) {
  const byId = new Map();
  for (const stroke of strokes) if (stroke?.tool === 'solid' && stroke.id && !byId.has(stroke.id)) byId.set(stroke.id, stroke);
  return byId;
}
/** Bryła pod spodem (istniejąca i inna) albo null. */
export function baseOf(byId, solid) {
  if (!solid.on) return null;
  const base = byId.get(solid.on.id);
  return base && base !== solid ? base : null;
}

/**
 * Położenie bryły w scenie: { x, y – punkt strony pod początkiem układu bryły (X, Y), z – wysokość podstawy, yaw, height,
 * root – bryła na dole stosu, depth – ile brył pod spodem }. Bez bryły pod spodem (albo w pętli) – stoi sama: x, y obrazka.
 */
export function placement(byId, solid, seen = new Set()) {
  const base = seen.has(solid) || seen.size >= POSE_LIMITS.chain ? null : baseOf(byId, solid);
  if (!base) return { x: solid.x, y: solid.y, z: solid.z ?? 0, yaw: solid.yaw ?? 0, height: solidHeight(solid), root: solid, depth: 0 };
  seen.add(solid);
  const below = placement(byId, base, seen);
  const [c, s] = [Math.cos(below.yaw * D2R), Math.sin(below.yaw * D2R)];
  const { x: ox, y: oy } = solid.on;
  return {
    x: below.x + c * ox - s * oy,
    y: below.y - (s * ox + c * oy),
    z: Math.max(0, below.z + below.height + solid.on.z),
    yaw: normalYaw(below.yaw + solid.on.yaw),
    height: solidHeight(solid),
    root: below.root,
    depth: below.depth + 1
  };
}
/** Początek układu bryły w świecie, ale z Y od góry strony w dół (−y): różnice tak samo jak w świecie, bez wysokości strony. */
const originOf = (solid, place) => [place.x, -place.y, place.z - bodyExtent(solid).min[1]];

/**
 * Obrazek bryły postawionej w obrazku bryły na dole stosu (root, jej położenie rootPlace): { x, y, q } – ten sam widok co bryła
 * na dole (q), przesunięcie i obrót względem niej jak w scenie.
 */
export function stackedPicture(root, rootPlace, solid, place) {
  const a = originOf(root, rootPlace);
  const b = originOf(solid, place);
  const back = mul3(transpose3(UPRIGHT), rotZ(-rootPlace.yaw));
  const d = apply3(back, [b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const m = quatMatrix(root.q);
  const v = apply3(m, d);
  const relative = mul3(mul3(transpose3(UPRIGHT), rotZ(place.yaw - rootPlace.yaw)), UPRIGHT);
  return { x: root.x + v[0], y: root.y - v[1], q: quatFromMatrix(mul3(m, relative)).map((value) => round(value, 6)) };
}

/** Wszystkie bryły stosu (bryła na dole i postawione na niej, także pośrednio) – w kolejności rysunku. */
export function stackOf(strokes, solid, byId = solidsById(strokes)) {
  const root = placement(byId, solid).root;
  return strokes.filter((stroke) => stroke?.tool === 'solid' && placement(byId, stroke).root === root);
}
/** Czy `other` stoi (także pośrednio) na `solid`. */
export function standsOn(byId, other, solid) {
  let current = other;
  for (let step = 0; step < POSE_LIMITS.chain; step += 1) {
    const base = baseOf(byId, current);
    if (!base) return false;
    if (base === solid) return true;
    current = base;
  }
  return false;
}

const sameOn = (a, b) => (!a && !b) || (a && b && a.id === b.id && a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw);
const sameQ = (a, b) => a.every((value, index) => Math.abs(value - b[index]) < 1e-6);
const sameShape = (a, b) => a.kind === b.kind && a.profile === b.profile && a.features === b.features && JSON.stringify(a.dims) === JSON.stringify(b.dims);

/** Zmienione bryły z identyfikatorem: mapa przed → po (te same identyfikatory, inne obiekty). */
export function stackChanges(before, after) {
  const old = solidsById(before);
  const changes = new Map();
  for (const stroke of after) {
    if (stroke?.tool !== 'solid' || !stroke.id) continue;
    const previous = old.get(stroke.id);
    if (previous && previous !== stroke) changes.set(previous, stroke);
  }
  return changes;
}

/**
 * Stosy po zmianie rysunku: odnośniki do brył, których nie ma (albo w pętli) – usunięte (bryła zostaje w miejscu obrazka);
 * zmieniony sam obrazek bryły postawionej (ten sam odnośnik, te same wymiary, inne x, y albo q) – zmiana przechodzi na bryłę
 * na dole stosu; potem obrazki i bezwzględne z, yaw brył postawionych – z brył na dole. Zmienia tablicę w miejscu (nowe
 * obiekty zamiast zmienionych), zwraca mapę stary → nowy. changes – mapa przed → po (stackChanges).
 */
export function resolveStacks(strokes, changes = new Map()) {
  const replaced = new Map();
  const put = (index, next) => {
    const original = [...replaced.entries()].find(([, value]) => value === strokes[index])?.[0] ?? strokes[index];
    replaced.set(original, next);
    strokes[index] = next;
  };
  if (!strokes.some((stroke) => stroke?.tool === 'solid' && stroke.on)) return replaced;
  // Odnośniki do brył, których nie ma, i pętle.
  let byId = solidsById(strokes);
  strokes.forEach((stroke, index) => {
    if (stroke?.tool !== 'solid' || !stroke.on) return;
    if (!baseOf(byId, stroke) || standsOn(byId, stroke, stroke)) {
      const next = { ...stroke };
      delete next.on;
      put(index, next);
      byId = solidsById(strokes);
    }
  });
  // Zmieniony sam obrazek bryły postawionej – cały obrazek (bryła na dole) idzie za nim.
  const changedNow = new Set(changes.values());
  const moved = new Set();
  for (const [before, after] of changes) {
    const index = strokes.indexOf(after);
    if (index < 0 || !after.on || !before.on || !sameOn(before.on, after.on) || !sameShape(before, after)) continue;
    if (before.x === after.x && before.y === after.y && sameQ(before.q, after.q)) continue;
    const place = placement(byId, after);
    const root = place.root;
    if (root === after || changedNow.has(root) || moved.has(root)) continue;
    // Obrazek bryły na dole: widok taki, by bryła postawiona miała nowy widok, i miejsce – by była w nowym miejscu.
    const rootPlace = placement(byId, root);
    const relative = mul3(mul3(transpose3(UPRIGHT), rotZ(place.yaw - rootPlace.yaw)), UPRIGHT);
    const m = mul3(quatMatrix(after.q), transpose3(relative));
    const a = originOf(root, rootPlace);
    const b = originOf(after, place);
    const d = apply3(mul3(transpose3(UPRIGHT), rotZ(-rootPlace.yaw)), [b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const v = apply3(m, d);
    const next = { ...root, x: round(after.x - v[0]), y: round(after.y + v[1]), q: quatFromMatrix(m).map((value) => round(value, 6)) };
    put(strokes.indexOf(root), next);
    moved.add(next);
    byId = solidsById(strokes);
  }
  // Obrazki brył postawionych – z brył na dole.
  strokes.forEach((stroke, index) => {
    if (stroke?.tool !== 'solid' || !stroke.on) return;
    const place = placement(byId, stroke);
    if (place.root === stroke) return;
    const picture = stackedPicture(place.root, placement(byId, place.root), stroke, place);
    const z = round(Math.max(0, place.z));
    const yaw = normalYaw(round(place.yaw));
    const x = round(picture.x);
    const y = round(picture.y);
    if (x === stroke.x && y === stroke.y && sameQ(picture.q, stroke.q) && z === (stroke.z ?? 0) && yaw === (stroke.yaw ?? 0)) return;
    const next = { ...stroke, x, y, q: picture.q };
    delete next.z;
    delete next.yaw;
    if (z > 0) next.z = z;
    if (yaw !== 0) next.yaw = yaw;
    put(index, next);
    byId = solidsById(strokes);
  });
  return replaced;
}

/**
 * Bryły idące za zmienianymi (podgląd w trakcie przesuwania, obracania obrazka): mapa zmieniana → podgląd; wynik – mapa
 * pozostałych brył stosów → ich podgląd (te, które się zmieniły).
 */
export function stackFollowers(strokes, previews) {
  if (!strokes.some((stroke) => stroke?.tool === 'solid' && stroke.on)) return new Map();
  const copy = strokes.map((stroke) => previews.get(stroke) ?? stroke);
  const changes = new Map([...previews].filter(([original]) => original?.tool === 'solid' && original.id));
  resolveStacks(copy, changes);
  const result = new Map();
  strokes.forEach((stroke, index) => {
    if (previews.has(stroke) || copy[index] === stroke) return;
    result.set(stroke, copy[index]);
  });
  return result;
}

// ---------------------------------------------------------------- zmiany położenia

/** Bryła bez wysokości i obrotu w zapisie, gdy są zerowe. */
function withZYaw(solid, z, yaw) {
  const next = { ...solid };
  delete next.z;
  delete next.yaw;
  const height = round(clamp(z, 0, POSE_LIMITS.z));
  const angle = normalYaw(round(yaw));
  if (height > 0) next.z = height;
  if (angle !== 0) next.yaw = angle;
  return next;
}
/** Odnośnik do bryły pod spodem dla położenia { x, y, z, yaw } (x, y – punkt strony). */
function relativeTo(byId, base, { x, y, z, yaw }) {
  const below = placement(byId, base);
  const [dx, dy] = [x - below.x, -(y - below.y)];
  const [c, s] = [Math.cos(below.yaw * D2R), Math.sin(below.yaw * D2R)];
  const limit = (value) => round(clamp(value, -POSE_LIMITS.offset, POSE_LIMITS.offset));
  return { id: base.id, x: limit(c * dx + s * dy), y: limit(-s * dx + c * dy), z: limit(z - (below.z + below.height)), yaw: normalYaw(round(yaw - below.yaw)) };
}

/**
 * Bryła w położeniu { x, y – punkt strony (X, Y w scenie), z – wysokość podstawy, yaw }: bryła stojąca sama – x, y to też
 * miejsce obrazka; postawiona na innej – nowy odnośnik (obrazek wyliczy resolveStacks). Wysokość nie mniejsza niż 0.
 */
export function withPose(strokes, solid, pose) {
  const byId = solidsById(strokes);
  const base = baseOf(byId, solid);
  const z = Math.max(0, pose.z);
  if (!base || standsOn(byId, base, solid)) return withZYaw({ ...solid, x: round(pose.x), y: round(pose.y) }, z, pose.yaw);
  return { ...withZYaw(solid, z, pose.yaw), on: relativeTo(byId, base, { ...pose, z }) };
}

/**
 * „Postaw na ścianie”: bryła stoi na poziomej ścianie bryły `base` na wysokości `z`, początkiem układu nad punktem strony
 * `point`; obrót bez zmian. Bryła na dole stosu i postawiona dostają identyfikatory (newId(strokes)). Wynik: { solid, base }
 * albo { error } (bryła na samej sobie albo na bryle, która na niej stoi).
 */
export function placeOn(strokes, solid, base, point, z, newId) {
  if (base === solid) return { error: 'Bryła nie może stać na sobie' };
  let byId = solidsById(strokes);
  if (standsOn(byId, base, solid)) return { error: 'Ta bryła stoi na zaznaczonej – najpierw zdejmij ją na arkusz' };
  const taken = [...strokes];
  const nextBase = base.id ? base : { ...base, id: newId(taken) };
  taken.push(nextBase);
  const nextSolid = solid.id ? solid : { ...solid, id: newId(taken) };
  const list = strokes.map((stroke) => (stroke === base ? nextBase : stroke === solid ? nextSolid : stroke));
  byId = solidsById(list);
  const yaw = placement(byId, nextSolid).yaw;
  const clean = { ...nextSolid };
  delete clean.on;
  const on = relativeTo(byId, nextBase, { x: point.x, y: point.y, z: Math.max(0, z), yaw });
  return { solid: { ...withZYaw(clean, Math.max(0, z), yaw), on }, base: nextBase };
}

/** „Na arkusz”: bryła stoi sama na kartce (z = 0) w miejscu nad którym była (X, Y i obrót bez zmian). */
export function liftOff(strokes, solid) {
  const place = placement(solidsById(strokes), solid);
  const next = withZYaw({ ...solid, x: round(place.x), y: round(place.y) }, 0, place.yaw);
  delete next.on;
  return next;
}

/** Ściana bryły w scenie pozioma, zwrócona w górę (normalna w układzie bryły → świat). */
export function facesUp(normal, yaw = 0) {
  const n = apply3(worldRotation(yaw), normal);
  const length = Math.hypot(...n) || 1;
  return n[2] / length > 1 - 1e-6;
}

/**
 * Kolejność rysowania na kartce 2D: bryły stosu razem, w miejscu pierwszej z nich w rysunku, od najdalszej w widoku
 * obrazka bryły na dole (środek zasięgu); pozostałe elementy – bez zmian. Bez stosów – ta sama tablica.
 */
export function stackPaintOrder(strokes) {
  if (!strokes.some((stroke) => stroke?.tool === 'solid' && stroke.on)) return strokes;
  const byId = solidsById(strokes);
  const places = new Map();
  const groups = new Map();
  for (const stroke of strokes) {
    if (stroke?.tool !== 'solid') continue;
    const place = placement(byId, stroke);
    places.set(stroke, place);
    if (!groups.has(place.root)) groups.set(place.root, []);
    groups.get(place.root).push(stroke);
  }
  const done = new Set();
  const order = [];
  for (const stroke of strokes) {
    const place = places.get(stroke);
    const group = place ? groups.get(place.root) : null;
    if (!group || group.length < 2) {
      order.push(stroke);
      continue;
    }
    if (done.has(place.root)) continue;
    done.add(place.root);
    const root = place.root;
    const rootPlace = places.get(root);
    const start = originOf(root, rootPlace);
    const back = mul3(transpose3(UPRIGHT), rotZ(-rootPlace.yaw));
    const m = quatMatrix(root.q);
    const depth = (member) => {
      const memberPlace = places.get(member);
      const { min, max } = bodyExtent(member);
      const mid = apply3(worldRotation(memberPlace.yaw), [0, 1, 2].map((axis) => (min[axis] + max[axis]) / 2));
      const origin = originOf(member, memberPlace);
      const d = apply3(back, [0, 1, 2].map((axis) => origin[axis] + mid[axis] - start[axis]));
      return apply3(m, d)[2];
    };
    order.push(...group.map((member) => ({ member, z: depth(member) })).sort((a, b) => a.z - b.z).map((item) => item.member));
  }
  return order;
}
