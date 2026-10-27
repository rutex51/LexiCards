// Suma i różnica brył (od 1.55) – bez przeglądarki. Dwie bryły ustawione w scenie (core/solid-pose.js): druga dołączona
// do pierwszej albo z niej wycięta – pod dowolnym kątem (obrót wokół Z każdej z nich; bryła ze szkicu na płaszczyźnie
// pionowej – pod kątem osi profilu). Druga bryła trafia do historii modelu pierwszej jako operacja z bryłą (core/solids.js;
// operacje logiczne – core/csg.js), w jej układzie: nic w scenie się nie przesuwa – początek układu pierwszej bryły zostaje,
// a bryły stojące na którejś z nich zostają tam, gdzie stały. „Wyjmij bryłę” – ostatnia taka operacja z powrotem jako
// osobna bryła w tym samym miejscu.

import { meshVolume } from './csg.js';
import { BODY_LIMITS, FEATURE_LIMITS, SOLID_LABELS, bodyMesh, hasFeatures, isBodyFeature, solidShape } from './solids.js';
import { bodyExtent, normalYaw, placement, solidsById, standsOn, withPose, worldRotation } from './solid-pose.js';

const apply3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const applyT = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
const round4 = (value) => Math.round(value * 1e4) / 1e4 || 0;
/** Bryły się stykają, gdy ich zasięgi w scenie są nie dalej niż tyle (jednostki strony). */
const TOUCH = 0.05;

/** Kształt bryły – druga bryła operacji: bez położenia, identyfikatora, pomiarów i odnośników rysunku. */
export function bodyOf(solid) {
  const body = { ...solid };
  for (const key of ['tool', 'x', 'y', 'z', 'yaw', 'on', 'measures', 'id', 'layers', 'attach']) delete body[key];
  return body;
}
/** Zagnieżdżenie brył złożonych: 0 – bez operacji z bryłą. */
export function bodyDepth(solid) {
  return Math.max(0, ...(solid.features ?? []).filter(isBodyFeature).map((feature) => 1 + bodyDepth(feature.body)));
}
/** Nazwa drugiej bryły w historii modelu: „Walec”, „Prostopadłościan (złożony)”. */
export function bodyName(body) {
  const name = body.kind === 'extrude' ? 'Wyciągnięcie' : body.kind === 'revolve' ? 'Bryła obrotowa' : SOLID_LABELS[body.kind] ?? 'Bryła';
  return hasFeatures(body) ? `${name} (z operacjami)` : name;
}

/** Położenie bryły w scenie: początek jej układu (Y od góry strony w dół – różnice jak w świecie) i obrót. */
function frameOf(byId, solid) {
  const place = placement(byId, solid);
  return { place, origin: [place.x, -place.y, place.z - bodyExtent(solid).min[1]], m: worldRotation(place.yaw) };
}
/** Zasięg bryły w scenie (prostopadłościan wzdłuż osi świata). */
function boxOf(solid, frame) {
  const { min, max } = bodyExtent(solid);
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let bits = 0; bits < 8; bits += 1) {
    const corner = [0, 1, 2].map((axis) => ((bits >> axis) & 1 ? max[axis] : min[axis]));
    const point = apply3(frame.m, corner);
    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], point[axis] + frame.origin[axis]);
      high[axis] = Math.max(high[axis], point[axis] + frame.origin[axis]);
    }
  }
  return { low, high };
}
const apart = (a, b) => [0, 1, 2].some((axis) => a.low[axis] > b.high[axis] + TOUCH || b.low[axis] > a.high[axis] + TOUCH);

/**
 * Bryły stojące na `bases` (bezpośrednio) – w tym samym miejscu w scenie: strokes – rysunek po zmianie, byId – przed,
 * reparent – mapa bryła pod spodem → nowa bryła pod spodem (null – stoi sama). Zmienia `strokes` w miejscu.
 */
function keepStanding(strokes, byId, bases, reparent = new Map()) {
  for (const [index, stroke] of strokes.entries()) {
    if (stroke?.tool !== 'solid' || !stroke.on) continue;
    const base = byId.get(stroke.on.id);
    if (!bases.includes(base)) continue;
    const place = placement(byId, stroke);
    const moved = { ...stroke };
    if (reparent.has(base)) {
      const next = reparent.get(base);
      if (next) moved.on = { ...stroke.on, id: next.id };
      else delete moved.on;
    }
    strokes[index] = withPose(strokes, moved, { x: place.x, y: place.y, z: place.z, yaw: place.yaw });
  }
}

/**
 * Suma (op 'add') albo różnica ('cut'): bryła `tool` dołączona do `target` albo z niej wycięta, w położeniu ze sceny.
 * Wynik: { strokes – rysunek po zmianie (bez `tool`), solid – nowa `target` } albo { error }. newId(strokes) – nowy
 * identyfikator (bryła pod spodem brył, które stały na `tool`).
 */
export function combineSolids(strokes, target, tool, op, newId) {
  if (target === tool) return { error: 'Dotknij drugiej bryły – nie tej samej' };
  const byId = solidsById(strokes);
  if (standsOn(byId, target, tool)) return { error: 'Zaznaczona bryła stoi na tej bryle – najpierw zdejmij ją „Na arkusz”' };
  if ((target.features?.length ?? 0) >= FEATURE_LIMITS.count) return { error: `Najwyżej ${FEATURE_LIMITS.count} operacji na jednej bryle` };
  if (1 + bodyDepth(tool) > BODY_LIMITS.depth) return { error: `Za dużo brył złożonych jedna w drugiej (najwyżej ${BODY_LIMITS.depth})` };
  const T = frameOf(byId, target);
  const B = frameOf(byId, tool);
  if (apart(boxOf(target, T), boxOf(tool, B))) {
    return { error: op === 'add' ? 'Bryły się nie stykają – ustaw je tak, by na siebie nachodziły albo się stykały' : 'Bryły się nie przenikają – nie ma czego wyciąć' };
  }
  // Druga bryła w układzie pierwszej: początek – przesunięcie w scenie obrócone do układu bryły, obrót – różnica obrotów wokół Z.
  const at = applyT(T.m, [0, 1, 2].map((axis) => B.origin[axis] - T.origin[axis])).map(round4);
  const turn = normalYaw(Math.round((B.place.yaw - T.place.yaw) * 1e4) / 1e4);
  const feature = { op, body: bodyOf(tool), at, ...(turn !== 0 ? { turn } : {}) };
  const shaped = { ...target, features: [...(target.features ?? []), feature], ...(target.id ? {} : { id: newId(strokes) }) };
  const mesh = solidShape(shaped);
  if (!mesh || mesh.F.length === 0) return { error: op === 'cut' ? 'Wycięcie zabrałoby całą bryłę' : 'Nie udało się połączyć brył' };
  if (op === 'cut') {
    const before = meshVolume(bodyMesh(target));
    if (Math.abs(before - meshVolume(mesh)) <= Math.abs(before) * 1e-6) return { error: 'Bryły się nie przenikają – nie ma czego wyciąć' };
  }
  // Początek układu zostaje: podstawa (najniższy punkt) przesuwa się o tyle, o ile zmienił się zasięg bryły w dół.
  const drop = bodyExtent(shaped).min[1] - bodyExtent(target).min[1];
  const list = strokes.filter((stroke) => stroke !== tool);
  const index = list.indexOf(target);
  list[index] = shaped;
  list[index] = withPose(list, shaped, { x: T.place.x, y: T.place.y, z: T.place.z + drop, yaw: T.place.yaw });
  // Bryły stojące na drugiej bryle – suma: stoją teraz na wyniku, różnica: stoją same; stojące na pierwszej – na wyniku.
  keepStanding(list, byId, [tool, target], new Map([[tool, op === 'add' ? list[index] : null]]));
  return { strokes: list, solid: list[index] };
}

/**
 * „Wyjmij bryłę”: ostatnia operacja z bryłą (suma albo różnica) znika, a druga bryła wraca jako osobna – w tym samym miejscu
 * w scenie (nie niżej niż arkusz), zaraz za bryłą w rysunku. Wynik: { strokes, solid, tool, lifted } albo { error }.
 */
export function extractBody(strokes, solid, newId) {
  const feature = solid.features?.at(-1);
  if (!isBodyFeature(feature)) return { error: 'Ostatnia operacja tej bryły nie jest sumą ani różnicą' };
  const byId = solidsById(strokes);
  const S = frameOf(byId, solid);
  const shaped = { ...solid };
  const rest = solid.features.slice(0, -1);
  if (rest.length > 0) shaped.features = rest;
  else delete shaped.features;
  const drop = bodyExtent(shaped).min[1] - bodyExtent(solid).min[1];
  const list = strokes.slice();
  const index = list.indexOf(solid);
  list[index] = shaped;
  list[index] = withPose(list, shaped, { x: S.place.x, y: S.place.y, z: S.place.z + drop, yaw: S.place.yaw });
  keepStanding(list, byId, [solid]);
  // Druga bryła: jej początek układu i obrót w scenie.
  const origin = apply3(S.m, feature.at).map((value, axis) => value + S.origin[axis]);
  const body = { tool: 'solid', ...feature.body, x: 0, y: 0 };
  const z = origin[2] + bodyExtent(body).min[1];
  const placed = withPose(list, { ...body, id: newId(list) }, { x: origin[0], y: -origin[1], z, yaw: S.place.yaw + (feature.turn ?? 0) });
  list.splice(index + 1, 0, placed);
  return { strokes: list, solid: list[index], tool: placed, lifted: z < -0.01 };
}
