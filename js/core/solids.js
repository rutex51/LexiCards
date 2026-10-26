// Bryły (od 1.47) – bez przeglądarki: element { tool: 'solid', kind, x, y, dims, q, color, size, edges, shade?, showDims?, axes? }.
// (x, y) – środek bryły na stronie; dims – wymiary w jednostkach strony (jak w i h kształtu; liczby na rysunku – ze skali);
// q – położenie w przestrzeni, kwaternion [w, x, y, z]. Układ bryły: x w prawo, y w górę, z do patrzącego – bez obrotu
// widać ją z przodu. Rzut prostokątny, jak w rysunku technicznym; size – grubość krawędzi widocznych.
// Osie dla użytkownika (od 1.50 – wspólny układ z arkuszem, jak w programach CAD i na maszynach pomiarowych; Z do góry
// od 1.48.2): X = x bryły (w prawo), Y = −z bryły (od patrzącego w widoku z przodu – w głąb), Z = y bryły (w górę);
// w izometrii X biegnie w prawo w dół, Y w prawo w górę, Z do góry; przód – od strony −Y, lewy bok – od −X. Szkic leży
// na płaszczyźnie XY (z góry: X w prawo, Y w górę – jak kartka i układ arkusza), wyciągnięcie – wzdłuż Z.
//
// Rodzaje: prostopadłościan { a – długość (x), b – szerokość (z), c – wysokość (y) }, walec { d, h }, stożek { d – podstawa,
// t – góra (0 – ostry, więcej – ścięty), h }, ostrosłup { podstawa a × b, h }, graniastosłup foremny { n – boki (3–12),
// d – średnica okręgu opisanego, h; jedna ściana z przodu }, kula { d }. Oś walca, stożka, ostrosłupa i graniastosłupa – y.
//
// Krawędzie: ostre (ściany pod kątem > 20°) rysowane zawsze – niewidoczne przerywane, ukryte albo jak widoczne (edges);
// gładkie (pobocznica walca i stożka) – tylko zarys. Bryły są wypukłe: ściany zwrócone do patrzącego nie zasłaniają się
// nawzajem, krawędź widać, gdy widać jedną z jej ścian. Rozkład (linie, ściany do cieniowania, osie, wymiary) – ten sam
// dla płótna, granic zaznaczenia i pliku DXF.
//
// Od 1.48 bryły ze szkicu: wyciągnięcie { kind: 'extrude', profile, dims: { h } } – profil (wyspy z otworami, x w prawo,
// y w górę, środek w (0, 0)) wyciągnięty wzdłuż z od −h/2 do h/2; bryła obrotowa { kind: 'revolve', profile, dims: { angle } }
// – profil (x wzdłuż osi, y – odległość od osi ≥ 0) obrócony wokół osi x o kąt (10–360°). sketch – kształty szkicu
// (względem środka bryły) do „Edytuj szkic”, sketchAngle – kierunek osi obrotu na kartce, sketchMirror – szkic odbity.
// Takie bryły mogą być wklęsłe i mieć otwory: krawędź jest próbkowana co kilka jednostek, a każdy punkt sprawdzany, czy
// nie zasłania go ściana bliżej patrzącego (siatka komórek), granice widocznych odcinków – dokładnie (bisekcja);
// cieniowanie – z buforem głębokości (płaszczyzny ścian na stronie, faces[].plane).
//
// Od 1.49 operacje na ścianach: features – lista { op: 'cut' (wycięcie) | 'add' (dodanie), o, u, v, profile, depth,
// through?, sketch?, mirror? }. Szkic leży na płaskiej ścianie bryły: o – punkt ściany (środek szkicu), u i v – kierunki
// szkicu w płaszczyźnie ściany (układ bryły), normalna u × v – na zewnątrz bryły; profil (x wzdłuż u, y wzdłuż v) wyciągnięty
// wzdłuż normalnej: dodanie – na zewnątrz o depth, wycięcie – w głąb o depth albo na wylot (through). Operacje działają po
// kolei na bryle (podstawowej albo ze szkicu) – operacje logiczne w core/csg.js; rysowanie jak u brył ze szkicu.

import { cleanShape, polyFromPoints, shapeOutline, shapePoint } from './shapes.js';
import { meshPolygons, planeOf, subtract, toMesh, union } from './csg.js';

/** Kratka strony (drawing.js PAPER_STEP) – wymiary nowej bryły. */
const STEP = 44;
const D2R = Math.PI / 180;
const HEX = /^#[0-9a-f]{6}$/i;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export const SOLID_KINDS = Object.freeze(['box', 'cylinder', 'cone', 'pyramid', 'prism', 'sphere']);
/** Od 1.48: bryły ze szkicu – wyciągnięcie i bryła obrotowa. */
export const MODEL_KINDS = Object.freeze(['extrude', 'revolve']);
const ALL_KINDS = [...SOLID_KINDS, ...MODEL_KINDS];
export const SOLID_LABELS = Object.freeze({
  box: 'Prostopadłościan', cylinder: 'Walec', cone: 'Stożek', pyramid: 'Ostrosłup', prism: 'Graniastosłup', sphere: 'Kula',
  extrude: 'Wyciągnięcie', revolve: 'Bryła obrotowa'
});
/** Bryła ze szkicu (od 1.48). */
export const isModel = (element) => MODEL_KINDS.includes(element?.kind);
/** Wymiary rodzaju bryły: [klucz, nazwa w oknie]. */
export const SOLID_FIELDS = Object.freeze({
  box: Object.freeze([['a', 'Długość a'], ['b', 'Szerokość b'], ['c', 'Wysokość c']]),
  cylinder: Object.freeze([['d', 'Średnica ⌀'], ['h', 'Wysokość h']]),
  cone: Object.freeze([['d', 'Podstawa ⌀'], ['t', 'Góra ⌀ (0 – ostry)'], ['h', 'Wysokość h']]),
  pyramid: Object.freeze([['a', 'Podstawa a'], ['b', 'Podstawa b'], ['h', 'Wysokość h']]),
  prism: Object.freeze([['n', 'Liczba boków'], ['d', 'Średnica opisana ⌀'], ['h', 'Wysokość h']]),
  sphere: Object.freeze([['d', 'Średnica ⌀']]),
  extrude: Object.freeze([['h', 'Długość wyciągnięcia']]),
  revolve: Object.freeze([['angle', 'Kąt obrotu (°)']])
});
/** Wymiary nowej bryły (jednostki strony – kratki). */
export const SOLID_DEFAULTS = Object.freeze({
  box: Object.freeze({ a: 6 * STEP, b: 4 * STEP, c: 3 * STEP }),
  cylinder: Object.freeze({ d: 4 * STEP, h: 5 * STEP }),
  cone: Object.freeze({ d: 4 * STEP, t: 0, h: 5 * STEP }),
  pyramid: Object.freeze({ a: 4 * STEP, b: 4 * STEP, h: 4.5 * STEP }),
  prism: Object.freeze({ n: 6, d: 4 * STEP, h: 2.5 * STEP }),
  sphere: Object.freeze({ d: 4 * STEP }),
  extrude: Object.freeze({ h: 2 * STEP }),
  revolve: Object.freeze({ angle: 360 })
});
/** Wymiary: najmniej i najwięcej (jednostki strony), liczba boków graniastosłupa. */
export const SOLID_LIMITS = Object.freeze({ min: 4, max: 6000, sides: Object.freeze([3, 12]), angle: Object.freeze([10, 360]) });
/** Profil bryły ze szkicu: najwięcej wysp, pętli (obrysów i otworów) i punktów. */
export const PROFILE_LIMITS = Object.freeze({ islands: 20, loops: 60, points: 4000, sketch: 200 });
/** Operacje na ścianach (od 1.49): wycięcie i dodanie; najwięcej operacji, najmniejsza głębokość (jednostki strony). */
export const FEATURE_OPS = Object.freeze(['cut', 'add']);
export const FEATURE_LABELS = Object.freeze({ cut: 'Wycięcie', add: 'Dodanie' });
export const FEATURE_LIMITS = Object.freeze({ count: 30, min: 1 });
/** Czy bryła ma operacje na ścianach. */
export const hasFeatures = (element) => Array.isArray(element?.features) && element.features.length > 0;
/** Krawędzie niewidoczne: przerywane, ukryte, jak widoczne. */
export const SOLID_EDGES = Object.freeze(['dashed', 'none', 'all']);
export const SOLID_EDGE_LABELS = Object.freeze({ dashed: 'Przerywane', none: 'Ukryte', all: 'Widoczne' });
/** Grubość krawędzi widocznych: cienka, średnia, gruba. */
export const SOLID_LINE_WIDTHS = Object.freeze([1.5, 2.5, 4]);
export const SOLID_LINE_LABELS = Object.freeze(['Cienka', 'Średnia', 'Gruba']);
/** Gotowe widoki: obrót wokół osi pionowej (yaw) i pochylenie (pitch) w stopniach; izometria i dimetria – jak w normie. */
export const SOLID_VIEWS = Object.freeze([
  { id: 'iso', label: 'Izometria', yaw: 45, pitch: 35.264 },
  { id: 'dimetric', label: 'Dimetria', yaw: 20.705, pitch: 19.471 },
  { id: 'front', label: 'Przód', yaw: 0, pitch: 0 },
  { id: 'top', label: 'Góra', yaw: 0, pitch: 90 },
  { id: 'left', label: 'Z lewej', yaw: -90, pitch: 0 },
  { id: 'right', label: 'Z prawej', yaw: 90, pitch: 0 },
  { id: 'back', label: 'Tył', yaw: 180, pitch: 0 },
  { id: 'bottom', label: 'Dół', yaw: 0, pitch: -90 }
].map(Object.freeze));
/** Światło cieniowania (układ widoku: x w prawo, y w górę, z do patrzącego) – z lewej, z góry, z przodu. */
const LIGHT = (() => {
  const light = [-0.35, 0.55, 0.76];
  const length = Math.hypot(...light);
  return light.map((value) => value / length);
})();
/** Wymiary bryły (jednostki strony): odsunięcie linii wymiarowej, przerwa i wysunięcie linii pomocniczej, czcionka. */
export const SOLID_DIM = Object.freeze({ offset: 36, gap: 4, over: 8, font: 22, arrow: 13, line: 1.5 });

// ---------------------------------------------------------------- kwaterniony

export const quatAxis = (x, y, z, angle) => {
  const length = Math.hypot(x, y, z) || 1;
  const sin = Math.sin(angle / 2);
  return [Math.cos(angle / 2), (x / length) * sin, (y / length) * sin, (z / length) * sin];
};
export const quatMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
export function quatNorm(q) {
  const length = Math.hypot(...q) || 1;
  // Jednoznacznie: w ≥ 0 (q i −q to ten sam obrót).
  const sign = q[0] < 0 ? -1 : 1;
  return q.map((value) => (sign * value) / length);
}
/** Macierz obrotu 3 × 3 (wierszami). */
export const quatMatrix = ([w, x, y, z]) => [
  1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
  2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
  2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
/** Kwaternion z macierzy obrotu (wierszami). */
export function quatFromMatrix(m) {
  const trace = m[0] + m[4] + m[8];
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [0.25 * s, (m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s];
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    q = [(m[7] - m[5]) / s, 0.25 * s, (m[1] + m[3]) / s, (m[2] + m[6]) / s];
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    q = [(m[2] - m[6]) / s, (m[1] + m[3]) / s, 0.25 * s, (m[5] + m[7]) / s];
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    q = [(m[3] - m[1]) / s, (m[2] + m[6]) / s, (m[5] + m[7]) / s, 0.25 * s];
  }
  return quatNorm(q);
}
/** Próg ściany zwróconej do patrzącego (składowa z normalnej) – ponad błąd zaokrąglenia położenia. */
const FACING = 1e-5;
const rotate = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

/** Położenie z kątów (stopnie): obrót wokół osi pionowej bryły, pochylenie do patrzącego, obrót na kartce. */
export const quatFromAngles = (yaw, pitch, roll = 0) => quatNorm(quatMul(quatAxis(0, 0, 1, roll * D2R), quatMul(quatAxis(1, 0, 0, pitch * D2R), quatAxis(0, 1, 0, -yaw * D2R))));
/** Kąty położenia (stopnie, z jednym miejscem po przecinku): { yaw, pitch, roll }; pochylenie ±90° – bez obrotu na kartce. */
export function solidAngles(q) {
  const m = quatMatrix(q);
  const pitch = Math.asin(clamp(m[7], -1, 1));
  let yaw;
  let roll;
  if (Math.abs(m[7]) > 0.99999) {
    roll = 0;
    yaw = -Math.atan2(m[2], m[0]);
  } else {
    yaw = -Math.atan2(-m[6], m[8]);
    roll = Math.atan2(-m[1], m[4]);
  }
  const degrees = (angle) => {
    const value = round(angle / D2R, 1);
    return value <= -180 ? 180 : value === 0 ? 0 : value;
  };
  return { yaw: degrees(yaw), pitch: degrees(pitch), roll: degrees(roll) };
}
/** Położenie gotowego widoku. */
export const viewQuat = (id) => {
  const view = SOLID_VIEWS.find((item) => item.id === id) ?? SOLID_VIEWS[0];
  return quatFromAngles(view.yaw, view.pitch, 0);
};
/** Widok, w którym bryła jest ustawiona (z dokładnością do 0,5°), albo null. */
export function solidView(q) {
  const near = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) > Math.cos((0.5 * D2R) / 2);
  return SOLID_VIEWS.find((view) => near(q, viewQuat(view.id)))?.id ?? null;
}
/** Pośrednie położenie (t od 0 do 1) – płynne przejście do widoku. */
export function quatSlerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let end = b;
  if (dot < 0) {
    end = b.map((value) => -value);
    dot = -dot;
  }
  if (dot > 0.9995) return quatNorm(a.map((value, index) => value + (end[index] - value) * t));
  const theta = Math.acos(dot);
  const sin = Math.sin(theta);
  return quatNorm(a.map((value, index) => (value * Math.sin((1 - t) * theta) + end[index] * Math.sin(t * theta)) / sin));
}
/**
 * Obrót z przeciągnięcia o (dx, dy) jednostek ekranu (y w dół), `rate` – stopnie na jednostkę: swobodny – wokół osi
 * prostopadłej do ruchu (jak kula pod palcem), wokół pionu (free: false) – poziomo wokół osi pionowej bryły, pionowo – pochylenie.
 */
export function orbitQuat(q, dx, dy, rate = 0.5, free = true) {
  if (free) {
    const length = Math.hypot(dx, dy);
    if (length === 0) return q;
    return quatNorm(quatMul(quatAxis(dy, dx, 0, length * rate * D2R), q));
  }
  return quatNorm(quatMul(quatAxis(1, 0, 0, dy * rate * D2R), quatMul(q, quatAxis(0, 1, 0, dx * rate * D2R))));
}

// ---------------------------------------------------------------- element

/** Nowa bryła z wymiarami domyślnymi, w izometrii, cieniowana, z wymiarami i osiami. */
export function newSolid(kind, { x = 0, y = 0, color = '#1d1d1f', size = SOLID_LINE_WIDTHS[1] } = {}) {
  // Bryły ze szkicu (od 1.48) – z profilu (newModel).
  return {
    tool: 'solid', kind: SOLID_KINDS.includes(kind) ? kind : 'box', x, y, dims: { ...SOLID_DEFAULTS[SOLID_KINDS.includes(kind) ? kind : 'box'] },
    q: viewQuat('iso'), color, size, edges: 'dashed', shade: true, showDims: true, axes: true
  };
}
export const isSolid = (stroke) => stroke?.tool === 'solid';
export const solidLabel = (element) => (element.kind === 'extrude' ? 'Bryła: wyciągnięcie' : element.kind === 'revolve' ? 'Bryła: obrotowa'
  : `Bryła: ${SOLID_LABELS[element.kind] ?? 'bryła'}`);
/** Czy bryła ma oś symetrii (osie: walec, stożek, ostrosłup, graniastosłup, kula; od 1.48 bryła obrotowa). */
export const hasAxis = (element) => element.kind !== 'box' && element.kind !== 'extrude';

/** Sprawdzone wymiary rodzaju bryły (brakujące – domyślne). */
export function cleanSolidDims(kind, raw) {
  const dims = {};
  for (const [key] of SOLID_FIELDS[kind]) {
    const value = raw?.[key];
    const fallback = SOLID_DEFAULTS[kind][key];
    if (key === 'n') dims.n = finite(value) ? clamp(Math.round(value), ...SOLID_LIMITS.sides) : fallback;
    else if (key === 'angle') dims.angle = finite(value) ? round(clamp(value, ...SOLID_LIMITS.angle), 1) : fallback;
    else if (key === 't') dims.t = finite(value) && value > 0 ? round(clamp(value, SOLID_LIMITS.min, SOLID_LIMITS.max)) : 0;
    else dims[key] = finite(value) && value > 0 ? round(clamp(value, SOLID_LIMITS.min, SOLID_LIMITS.max)) : fallback;
  }
  return dims;
}

/** Sprawdzona bryła (zapis, kopia zapasowa) albo null. */
export function cleanSolid(raw, pageWidth, pageHeight) {
  if (!raw || !ALL_KINDS.includes(raw.kind) || !finite(raw.x) || !finite(raw.y) || !HEX.test(raw.color ?? '')) return null;
  // Od 1.48: bryła ze szkicu – profil (bez poprawnego profilu – odrzucona), kształty szkicu.
  const model = isModel(raw);
  const profile = model ? cleanProfile(raw.profile, raw.kind) : null;
  if (model && !profile) return null;
  const sketch = model && Array.isArray(raw.sketch)
    ? raw.sketch.slice(0, PROFILE_LIMITS.sketch).map((shape) => cleanShape(shape, pageWidth, pageHeight, (color) => HEX.test(color ?? ''))).filter(Boolean) : [];
  // Od 1.49: operacje na ścianach (kula – bez płaskich ścian).
  const features = raw.kind !== 'sphere' && Array.isArray(raw.features)
    ? raw.features.slice(0, FEATURE_LIMITS.count).map((feature) => cleanFeature(feature, pageWidth, pageHeight)).filter(Boolean) : [];
  let q = Array.isArray(raw.q) && raw.q.length === 4 && raw.q.every(finite) && Math.hypot(...raw.q) > 1e-6 ? quatNorm(raw.q).map((value) => round(value, 6)) : viewQuat('iso');
  // Bryła ze szkicu z 1.48 (szkic na płaszczyźnie przodu, bez `plane`): od 1.48.2 szkic leży na XY – położenie
  // przeliczone tak, by bryła wyglądała jak dotąd.
  if (model && raw.plane !== 'xy') q = quatNorm(quatMul(q, quatAxis(1, 0, 0, Math.PI / 2))).map((value) => round(value, 6));
  return {
    tool: 'solid',
    kind: raw.kind,
    x: clamp(round(raw.x), -pageWidth, pageWidth * 2),
    y: clamp(round(raw.y), -pageHeight, pageHeight * 2),
    dims: cleanSolidDims(raw.kind, raw.dims),
    q,
    color: raw.color.toLowerCase(),
    size: finite(raw.size) ? clamp(raw.size, 0.5, 20) : SOLID_LINE_WIDTHS[1],
    edges: SOLID_EDGES.includes(raw.edges) ? raw.edges : 'dashed',
    ...(raw.shade === true ? { shade: true } : {}),
    ...(raw.showDims === true ? { showDims: true } : {}),
    ...(raw.axes === true ? { axes: true } : {}),
    ...(profile ? { profile, plane: 'xy' } : {}),
    ...(sketch.length > 0 ? { sketch } : {}),
    ...(sketch.length > 0 && finite(raw.sketchAngle) && raw.sketchAngle !== 0 ? { sketchAngle: round(raw.sketchAngle, 6) } : {}),
    ...(sketch.length > 0 && raw.sketchMirror === true ? { sketchMirror: true } : {}),
    ...(features.length > 0 ? { features } : {})
  };
}

/** Wektor 3D z liczb albo null. */
const vector = (raw) => (Array.isArray(raw) && raw.length === 3 && raw.every(finite) ? raw.map(Number) : null);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return length > 1e-9 ? [a[0] / length, a[1] / length, a[2] / length] : null;
};
/** Współrzędne układu operacji – 10 miejsc po przecinku (płaszczyzna dodania leży dokładnie na ścianie). */
const fine = (value) => round(value, 10);
/** Sprawdzona operacja na ścianie (od 1.49) albo null: u i v – jednostkowe i prostopadłe (poprawiane, gdy nie są). */
function cleanFeature(raw, pageWidth, pageHeight) {
  if (!raw || !FEATURE_OPS.includes(raw.op)) return null;
  const [o, rawU, rawV] = [vector(raw.o), vector(raw.u), vector(raw.v)];
  if (!o || !rawU || !rawV) return null;
  let u = rawU;
  let v = rawV;
  if (Math.abs(Math.hypot(...u) - 1) > 1e-9 || Math.abs(Math.hypot(...v) - 1) > 1e-9 || Math.abs(dot3(u, v)) > 1e-9) {
    u = unit3(rawU);
    if (!u) return null;
    v = unit3(rawV.map((value, axis) => value - dot3(rawV, u) * u[axis]));
    if (!v) return null;
  }
  const profile = cleanProfile(raw.profile, 'extrude');
  if (!profile || !finite(raw.depth) || raw.depth <= 0) return null;
  const sketch = Array.isArray(raw.sketch)
    ? raw.sketch.slice(0, PROFILE_LIMITS.sketch).map((shape) => cleanShape(shape, pageWidth, pageHeight, (color) => HEX.test(color ?? ''))).filter(Boolean) : [];
  return {
    op: raw.op,
    o: o.map((value) => fine(clamp(value, -SOLID_LIMITS.max, SOLID_LIMITS.max))), u: u.map(fine), v: v.map(fine),
    profile, depth: round(clamp(raw.depth, FEATURE_LIMITS.min, SOLID_LIMITS.max)),
    ...(raw.op === 'cut' && raw.through === true ? { through: true } : {}),
    ...(sketch.length > 0 ? { sketch } : {}),
    ...(sketch.length > 0 && raw.mirror === true ? { mirror: true } : {})
  };
}

// ---------------------------------------------------------------- profil (od 1.48)

/** Pole ze znakiem (y w górę: dodatnie – przeciwnie do wskazówek zegara). */
export const signedArea = (loop) => loop.reduce((sum, [x, y], index) => {
  const [u, v] = loop[(index + 1) % loop.length];
  return sum + x * v - u * y;
}, 0) / 2;
const oriented = (loop, ccw) => ((signedArea(loop) > 0) === ccw ? loop : loop.slice().reverse());
function cleanLoop(raw) {
  if (!Array.isArray(raw)) return null;
  const points = raw.slice(0, PROFILE_LIMITS.points).filter((point) => Array.isArray(point) && finite(point[0]) && finite(point[1]))
    .map(([x, y]) => [round(clamp(x, -SOLID_LIMITS.max, SOLID_LIMITS.max)), round(clamp(y, -SOLID_LIMITS.max, SOLID_LIMITS.max))])
    // Bez powtórzonych sąsiednich punktów.
    .filter((point, index, all) => index === 0 || point[0] !== all[index - 1][0] || point[1] !== all[index - 1][1]);
  if (points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
  return points.length >= 3 && Math.abs(signedArea(points)) > 1 ? points : null;
}
/** Sprawdzony profil { islands: [{ outer, holes }] } (obrys przeciwnie do wskazówek zegara, otwory – zgodnie) albo null; obrotowy – nad osią (y ≥ 0). */
export function cleanProfile(raw, kind) {
  if (!raw || !Array.isArray(raw.islands)) return null;
  const islands = [];
  let total = 0;
  let loops = 0;
  for (const island of raw.islands.slice(0, PROFILE_LIMITS.islands)) {
    const outer = cleanLoop(island?.outer);
    if (!outer) continue;
    const holes = (Array.isArray(island.holes) ? island.holes : []).map(cleanLoop).filter(Boolean);
    total += outer.length + holes.reduce((sum, hole) => sum + hole.length, 0);
    loops += 1 + holes.length;
    if (total > PROFILE_LIMITS.points || loops > PROFILE_LIMITS.loops) break;
    islands.push({ outer: oriented(outer, true), holes: holes.map((hole) => oriented(hole, false)) });
  }
  if (islands.length === 0) return null;
  if (kind === 'revolve' && islands.some((island) => island.outer.some(([, y]) => y < -0.01))) return null;
  return { islands };
}

const insideLoop = (x, y, loop) => {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [a, b] = [loop[i], loop[j]];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
/** Punkty obrysu zamkniętego kształtu (strona) – okrąg i elipsa: 72 punkty; otwarty kształt – null. */
export function shapeLoop(shape) {
  if (shape.shape === 'ellipse') return Array.from({ length: 72 }, (_, index) => {
    const point = shapePoint(shape, 0.5 * Math.cos((index / 72) * Math.PI * 2), 0.5 * Math.sin((index / 72) * Math.PI * 2));
    return [point.x, point.y];
  });
  const { points, closed } = shapeOutline(shape);
  if (!closed || points.length < 6) return null;
  return Array.from({ length: points.length / 2 }, (_, index) => [points[index * 2], points[index * 2 + 1]]);
}
/**
 * Profil z zamkniętych kształtów szkicu (od 1.48): pętle w pętlach – otwory (parzyste zagnieżdżenie – wyspa, nieparzyste –
 * otwór najbliższej wyspy). Wyciągnięcie – względem środka szkicu (y w górę); obrót – w układzie osi `axis` { a, b } (strona;
 * brak – pozioma prosta przez najniższy punkt szkicu): x wzdłuż osi, y – odległość od niej (cały profil po jednej stronie).
 * Wynik: { profile, center – środek bryły na stronie, angle – kierunek osi na stronie } albo { error }.
 */
export function profileFromShapes(shapes, kind, axis = null) {
  const loops = shapes.map(shapeLoop).filter(Boolean);
  if (loops.length === 0) return { error: 'Zaznacz zamknięty kształt (prostokąt, okrąg, wielokąt…) – profil bryły' };
  if (loops.length > PROFILE_LIMITS.loops || loops.reduce((sum, loop) => sum + loop.length, 0) > PROFILE_LIMITS.points) return { error: 'Za duży szkic' };
  const xs = loops.flat().map(([x]) => x);
  const ys = loops.flat().map(([, y]) => y);
  let frame;
  if (kind === 'revolve') {
    const a = axis?.a ?? { x: Math.min(...xs), y: Math.max(...ys) };
    const b = axis?.b ?? { x: Math.max(...xs), y: Math.max(...ys) };
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1) return { error: 'Oś obrotu za krótka' };
    const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const along = loops.flat().map(([x, y]) => (x - a.x) * u.x + (y - a.y) * u.y);
    const across = loops.flat().map(([x, y]) => u.x * (y - a.y) - u.y * (x - a.x));
    const side = across.reduce((sum, value) => sum + value, 0) < 0 ? -1 : 1;
    if (across.some((value) => value * side < -0.5)) return { error: 'Profil przecina oś obrotu – cały musi leżeć po jednej stronie osi' };
    const middle = (Math.min(...along) + Math.max(...along)) / 2;
    frame = {
      center: { x: a.x + u.x * middle, y: a.y + u.y * middle }, angle: Math.atan2(u.y, u.x),
      local: ([x, y]) => [(x - a.x) * u.x + (y - a.y) * u.y - middle, Math.max(0, side * (u.x * (y - a.y) - u.y * (x - a.x)))]
    };
  } else {
    const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    frame = { center, angle: 0, local: ([x, y]) => [x - center.x, center.y - y] };
  }
  // Zagnieżdżenie: ile innych pętli zawiera pętlę (pierwszy punkt w środku i większe pole).
  const areas = loops.map((loop) => Math.abs(signedArea(loop)));
  const parents = loops.map((loop, index) => loops.map((other, at) => at).filter((at) => at !== index && areas[at] > areas[index] && insideLoop(loop[0][0], loop[0][1], loops[at])));
  const islands = [];
  const islandOf = new Map();
  loops.forEach((loop, index) => {
    if (parents[index].length % 2 === 0) {
      islandOf.set(index, islands.length);
      islands.push({ outer: loop.map(frame.local), holes: [] });
    }
  });
  loops.forEach((loop, index) => {
    if (parents[index].length % 2 === 1) {
      // Najbliższa (najmniejsza) zawierająca wyspa.
      const owner = parents[index].filter((at) => islandOf.has(at)).sort((p, q) => areas[p] - areas[q])[0];
      if (owner !== undefined) islands[islandOf.get(owner)].holes.push(loop.map(frame.local));
    }
  });
  const profile = cleanProfile({ islands }, kind);
  if (!profile) return { error: kind === 'revolve' ? 'Profil przecina oś obrotu – cały musi leżeć po jednej stronie osi' : 'Za mały profil' };
  return { profile, center: { x: round(frame.center.x), y: round(frame.center.y) }, angle: frame.angle };
}

/** Nowa bryła ze szkicu (od 1.48): wyciągnięcie (domyślnie połowa krótszego boku szkicu) albo obrót o 360°; od 1.48.2 – z góry (jak szkic na XY). */
export function newModel(kind, profile, { x = 0, y = 0, color = '#1d1d1f', size = SOLID_LINE_WIDTHS[1], sketch = [], sketchAngle = 0 } = {}) {
  const points = profile.islands.flatMap((island) => island.outer);
  const [w, h] = [Math.max(...points.map(([px]) => px)) - Math.min(...points.map(([px]) => px)), Math.max(...points.map(([, py]) => py)) - Math.min(...points.map(([, py]) => py))];
  return {
    tool: 'solid', kind, x, y,
    dims: kind === 'extrude' ? { h: round(clamp(Math.min(w, h) / 2, SOLID_LIMITS.min, SOLID_LIMITS.max)) } : { angle: 360 },
    q: viewQuat('top'), color, size, edges: 'dashed', shade: true, showDims: true, axes: true, profile, plane: 'xy',
    ...(sketch.length > 0 ? { sketch } : {}), ...(sketch.length > 0 && sketchAngle !== 0 ? { sketchAngle: round(sketchAngle, 6) } : {})
  };
}

/** Bryła w innym położeniu (kwaternion) – nowy element. */
export const withQuat = (element, q) => ({ ...element, q: quatNorm(q).map((value) => round(value, 6)) });

/** Obrót na kartce o `angle` (radiany, jak obrót zaznaczenia: dodatni – zgodnie ze wskazówkami zegara) wokół (cx, cy). */
export function turnSolid(element, cx, cy, angle) {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const x = cx + (element.x - cx) * cos - (element.y - cy) * sin;
  const y = cy + (element.x - cx) * sin + (element.y - cy) * cos;
  return { ...withQuat(element, quatMul(quatAxis(0, 0, 1, -angle), element.q)), x: round(x), y: round(y) };
}
/**
 * Odbicie lustrzane rzutu: w poziomie (lewa ↔ prawa) albo w pionie względem prostej (ax, ay) w kierunku `angle`.
 * Bryły są symetryczne względem płaszczyzny x = 0, więc odbity rzut to ta sama bryła w innym położeniu.
 */
export function mirrorSolid(element, at, angle) {
  // Odbicie widoku względem prostej o kierunku `angle` (strona: y w dół) – w układzie widoku (y w górę) kierunek −angle.
  const [c, s] = [Math.cos(-2 * angle), Math.sin(-2 * angle)];
  const flip = [c, s, 0, s, -c, 0, 0, 0, 1];
  const m = quatMatrix(element.q);
  const local = [-1, 0, 0, 0, 1, 0, 0, 0, 1];
  const product = (a, b) => [0, 1, 2].flatMap((row) => [0, 1, 2].map((column) => a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column]));
  const next = product(product(flip, m), local);
  // Środek – odbity względem prostej.
  const [dx, dy] = [element.x - at.x, element.y - at.y];
  const [cos2, sin2] = [Math.cos(2 * angle), Math.sin(2 * angle)];
  const mirrored = { ...withQuat(element, quatFromMatrix(next)), x: round(at.x + dx * cos2 + dy * sin2), y: round(at.y + dx * sin2 - dy * cos2) };
  const across = (loop, ccw) => oriented(loop.map(([x, y]) => [x === 0 ? 0 : -x, y]), ccw);
  const acrossProfile = (profile) => ({ islands: profile.islands.map((island) => ({ outer: across(island.outer, true), holes: island.holes.map((hole) => across(hole, false)) })) });
  // Operacje na ścianach (od 1.49) – odbite razem z bryłą (lustro x układu bryły): o i v odbite, u – odbite i odwrócone,
  // profil x → −x (układ dalej prawoskrętny); szkic operacji – oznaczony.
  if (hasFeatures(element)) {
    const flip = (a) => [a[0] === 0 ? 0 : -a[0], a[1], a[2]];
    mirrored.features = element.features.map((feature) => {
      const next = { ...feature, o: flip(feature.o), u: flip(feature.u).map((value) => (value === 0 ? 0 : -value)), v: flip(feature.v), profile: acrossProfile(feature.profile) };
      if (feature.sketch) {
        if (feature.mirror) delete next.mirror;
        else next.mirror = true;
      }
      return next;
    });
  }
  if (!isModel(element)) return mirrored;
  // Bryła ze szkicu (od 1.48) nie musi być symetryczna – jej profil też odbity (x → −x), szkic – oznaczony.
  mirrored.profile = acrossProfile(element.profile);
  if (element.sketch) {
    if (element.sketchMirror) delete mirrored.sketchMirror;
    else mirrored.sketchMirror = true;
  }
  return mirrored;
}
/** Bryła powiększona `factor` razy wokół (cx, cy). */
export function scaleSolid(element, cx, cy, factor) {
  const dims = Object.fromEntries(Object.entries(element.dims).map(([key, value]) => [key,
    key === 'n' || key === 'angle' ? value : round(clamp(value * factor, key === 't' && value === 0 ? 0 : SOLID_LIMITS.min, SOLID_LIMITS.max))]));
  const next = { ...element, dims, x: round(cx + (element.x - cx) * factor), y: round(cy + (element.y - cy) * factor) };
  // Bryła ze szkicu (od 1.48) – profil razem z nią (kształty szkicu skaluje transform.js).
  const scale = (loop) => loop.map(([x, y]) => [round(x * factor), round(y * factor)]);
  const scaleProfile = (profile) => ({ islands: profile.islands.map((island) => ({ outer: scale(island.outer), holes: island.holes.map(scale) })) });
  if (isModel(element)) next.profile = scaleProfile(element.profile);
  // Operacje na ścianach (od 1.49): miejsce, profil i głębokość.
  if (hasFeatures(element)) {
    next.features = element.features.map((feature) => ({
      ...feature, o: feature.o.map((value) => fine(value * factor)), profile: scaleProfile(feature.profile),
      depth: round(clamp(feature.depth * factor, FEATURE_LIMITS.min, SOLID_LIMITS.max))
    }));
  }
  return next;
}

// ---------------------------------------------------------------- siatka (ściany i krawędzie)

const meshCache = new Map();
/** Siatka bryły w jej układzie (środek w (0, 0, 0)): { V – wierzchołki, F – ściany (numery wierzchołków), N – normalne, E – krawędzie }. */
export function solidMesh(kind, dims) {
  const key = `${kind}:${JSON.stringify(dims)}`;
  const cached = meshCache.get(key);
  if (cached) return cached;
  const V = [];
  const F = [];
  /** Pierścień n punktów na wysokości y (kąt od osi x w stronę z). */
  const ring = (n, r, y, start) => {
    const first = V.length;
    for (let index = 0; index < n; index += 1) {
      const angle = start + (index * 2 * Math.PI) / n;
      V.push([r * Math.cos(angle), y, r * Math.sin(angle)]);
    }
    return first;
  };
  /** Bryła obrotowa albo graniastosłup: podstawa r1, góra r2 (0 – wierzchołek), wysokość h. */
  const lathe = (n, r1, r2, h, start = 0) => {
    const bottom = ring(n, r1, -h / 2, start);
    F.push(Array.from({ length: n }, (_, index) => bottom + index));
    if (r2 > 0) {
      const top = ring(n, r2, h / 2, start);
      F.push(Array.from({ length: n }, (_, index) => top + index));
      for (let index = 0; index < n; index += 1) F.push([bottom + index, bottom + ((index + 1) % n), top + ((index + 1) % n), top + index]);
    } else {
      const apex = V.length;
      V.push([0, h / 2, 0]);
      for (let index = 0; index < n; index += 1) F.push([bottom + index, bottom + ((index + 1) % n), apex]);
    }
  };
  if (kind === 'box') {
    const [a, b, c] = [dims.a / 2, dims.b / 2, dims.c / 2];
    for (const [x, y, z] of [[-a, -c, -b], [a, -c, -b], [a, -c, b], [-a, -c, b], [-a, c, -b], [a, c, -b], [a, c, b], [-a, c, b]]) V.push([x, y, z]);
    F.push([0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]);
  } else if (kind === 'cylinder') {
    lathe(72, dims.d / 2, dims.d / 2, dims.h);
  } else if (kind === 'cone') {
    lathe(72, dims.d / 2, dims.t / 2, dims.h);
  } else if (kind === 'prism') {
    // Jedna ściana z przodu (normalna +z).
    lathe(dims.n, dims.d / 2, dims.d / 2, dims.h, Math.PI / 2 + Math.PI / dims.n);
  } else if (kind === 'pyramid') {
    const [a, b, h] = [dims.a / 2, dims.b / 2, dims.h / 2];
    for (const [x, z] of [[-a, -b], [a, -b], [a, b], [-a, b]]) V.push([x, -h, z]);
    V.push([0, h, 0]);
    F.push([0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]);
  }
  // Normalne (metoda Newella) skierowane na zewnątrz – środek bryły w (0, 0, 0).
  const N = F.map((face) => {
    let [nx, ny, nz, cx, cy, cz] = [0, 0, 0, 0, 0, 0];
    face.forEach((index, at) => {
      const p = V[index];
      const q = V[face[(at + 1) % face.length]];
      nx += (p[1] - q[1]) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
      cx += p[0];
      cy += p[1];
      cz += p[2];
    });
    const length = Math.hypot(nx, ny, nz) || 1;
    const sign = nx * cx + ny * cy + nz * cz < 0 ? -1 : 1;
    return [(sign * nx) / length, (sign * ny) / length, (sign * nz) / length];
  });
  const edges = new Map();
  F.forEach((face, index) => face.forEach((a, at) => {
    const b = face[(at + 1) % face.length];
    const id = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edges.has(id)) edges.set(id, { a: Math.min(a, b), b: Math.max(a, b), faces: [] });
    edges.get(id).faces.push(index);
  }));
  const E = [...edges.values()].map((edge) => {
    const [first, second = first] = edge.faces;
    const [n1, n2] = [N[first], N[second]];
    return { ...edge, sharp: n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < Math.cos(20 * D2R) };
  });
  const mesh = { V, F, N, E };
  if (meshCache.size > 200) meshCache.clear();
  meshCache.set(key, mesh);
  return mesh;
}

/**
 * Punkt z układu profilu bryły ze szkicu (x, y – płaszczyzna szkicu, z – wyciągnięcie; obrotowa: x – oś) do układu bryły
 * (od 1.48.2): szkic na płaszczyźnie XY (x profilu → x bryły – X, y profilu → −z bryły – Y; od 1.50), wyciągnięcie
 * w górę (z profilu → y bryły – Z).
 */
export const fromSketch = ([x, y, z]) => [x, z, -y];

/**
 * Siatka bryły ze szkicu (od 1.48): { V, F – ściany jako pętle [obrys, ...otwory] (numery wierzchołków), N, E }.
 * Kolejność wierzchołków daje normalne na zewnątrz (obrys przeciwnie do wskazówek zegara, otwory – zgodnie).
 */
const modelCache = new WeakMap();
export function modelMesh(element) {
  let byDims = modelCache.get(element.profile);
  if (!byDims) {
    byDims = new Map();
    modelCache.set(element.profile, byDims);
  }
  const key = `${element.kind}:${JSON.stringify(element.dims)}`;
  if (byDims.has(key)) return byDims.get(key);
  const V = [];
  const F = [];
  const { islands } = element.profile;
  if (element.kind === 'extrude') {
    const [z0, z1] = [-element.dims.h / 2, element.dims.h / 2];
    for (const island of islands) {
      const loops = [island.outer, ...island.holes];
      const ring = (z) => loops.map((loop) => {
        const first = V.length;
        for (const [x, y] of loop) V.push([x, y, z]);
        return first;
      });
      const [bottom, top] = [ring(z0), ring(z1)];
      F.push(loops.map((loop, at) => loop.map((_, index) => bottom[at] + loop.length - 1 - index)));
      F.push(loops.map((loop, at) => loop.map((_, index) => top[at] + index)));
      loops.forEach((loop, at) => loop.forEach((_, index) => {
        const next = (index + 1) % loop.length;
        F.push([[bottom[at] + index, bottom[at] + next, top[at] + next, top[at] + index]]);
      }));
    }
  } else {
    const angle = element.dims.angle;
    const full = angle >= 359.99;
    const steps = Math.max(3, Math.round((72 * angle) / 360));
    const sweep = (angle * Math.PI) / 180;
    const dedupe = (loop) => loop.filter((vertex, index) => vertex !== loop[(index + loop.length - 1) % loop.length]);
    for (const island of islands) {
      const loops = [island.outer, ...island.holes];
      // Punkty na osi (y = 0) – jeden wierzchołek dla wszystkich kątów.
      const rings = [];
      for (let step = 0; step < (full ? steps : steps + 1); step += 1) {
        const turn = (step * sweep) / steps;
        const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
        rings.push(loops.map((loop, at) => loop.map(([x, y], index) => {
          if (Math.abs(y) < 1e-9) {
            const id = `${at}:${index}`;
            rings.axis ??= new Map();
            if (!rings.axis.has(id)) {
              rings.axis.set(id, V.length);
              V.push([x, 0, 0]);
            }
            return rings.axis.get(id);
          }
          V.push([x, y * cos, y * sin]);
          return V.length - 1;
        })));
      }
      for (let step = 0; step < steps; step += 1) {
        const [a, b] = [rings[step], rings[full ? (step + 1) % steps : step + 1]];
        loops.forEach((loop, at) => loop.forEach((_, index) => {
          const next = (index + 1) % loop.length;
          const quad = dedupe([a[at][index], a[at][next], b[at][next], b[at][index]]);
          if (quad.length >= 3) F.push([quad]);
        }));
      }
      if (!full) {
        // Ściany na końcach obrotu: na początku – odwrotnie (normalna w stronę mniejszego kąta).
        F.push(rings[0].map((loop) => dedupe(loop.slice().reverse())));
        F.push(rings[steps].map((loop) => dedupe(loop.slice())));
      }
    }
  }
  // Od 1.48.2 szkic leży na płaszczyźnie XY: układ profilu (x, y – szkic, z – wyciągnięcie / obrót) → układ bryły.
  for (const vertex of V) [vertex[0], vertex[1], vertex[2]] = fromSketch(vertex);
  const N = F.map((loops) => {
    const loop = loops[0];
    let [nx, ny, nz] = [0, 0, 0];
    loop.forEach((index, at) => {
      const [p, q] = [V[index], V[loop[(at + 1) % loop.length]]];
      nx += (p[1] - q[1]) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
    });
    const length = Math.hypot(nx, ny, nz) || 1;
    return [nx / length, ny / length, nz / length];
  });
  const edges = new Map();
  F.forEach((loops, face) => loops.forEach((loop) => loop.forEach((a, at) => {
    const b = loop[(at + 1) % loop.length];
    if (a === b) return;
    const id = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edges.has(id)) edges.set(id, { a: Math.min(a, b), b: Math.max(a, b), faces: [] });
    edges.get(id).faces.push(face);
  })));
  const E = [...edges.values()].map((edge) => {
    const [first, second = first] = edge.faces;
    const [n1, n2] = [N[first], N[second]];
    return { ...edge, sharp: edge.faces.length !== 2 || n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < Math.cos(20 * D2R) };
  });
  const mesh = { V, F, N, E };
  byDims.set(key, mesh);
  return mesh;
}

/** Odcinki połączone w łamane (linia przerywana nie zaczyna się od nowa na każdym odcinku okręgu). */
export function chainEdges(edges) {
  const adjacent = new Map();
  edges.forEach((edge, index) => [edge.a, edge.b].forEach((vertex) => {
    if (!adjacent.has(vertex)) adjacent.set(vertex, []);
    adjacent.get(vertex).push(index);
  }));
  const used = new Array(edges.length).fill(false);
  const chains = [];
  const walk = (start) => {
    const chain = [start];
    let vertex = start;
    for (;;) {
      const next = (adjacent.get(vertex) ?? []).find((index) => !used[index]);
      if (next === undefined) break;
      used[next] = true;
      vertex = edges[next].a === vertex ? edges[next].b : edges[next].a;
      chain.push(vertex);
    }
    return chain;
  };
  for (const [vertex, list] of adjacent) if (list.length !== 2) while (list.some((index) => !used[index])) chains.push(walk(vertex));
  edges.forEach((edge, index) => {
    if (!used[index]) chains.push(walk(edge.a));
  });
  return chains;
}

// ---------------------------------------------------------------- operacje na ścianach (od 1.49)

const loopsCache = new Map();
/** Siatka bryły podstawowej w postaci pętli (jak bryły ze szkicu): obrys każdej ściany przeciwnie do wskazówek zegara z zewnątrz. */
export function primitiveMesh(kind, dims) {
  const key = `${kind}:${JSON.stringify(dims)}`;
  const cached = loopsCache.get(key);
  if (cached) return cached;
  const mesh = solidMesh(kind, dims);
  const F = mesh.F.map((face, index) => {
    const { n } = planeOf(face.map((vertex) => mesh.V[vertex]));
    return [dot3(n, mesh.N[index]) < 0 ? face.slice().reverse() : face.slice()];
  });
  const result = { V: mesh.V, F, N: mesh.N, E: mesh.E };
  if (loopsCache.size > 200) loopsCache.clear();
  loopsCache.set(key, result);
  return result;
}

/** Normalna szkicu operacji (na zewnątrz ściany). */
export const featureNormal = (feature) => cross3(feature.u, feature.v);
/** Punkt profilu operacji (x, y) w odległości z od ściany – układ bryły. */
const featurePoint = (feature, n, [x, y], z) => [0, 1, 2].map((axis) => feature.o[axis] + feature.u[axis] * x + feature.v[axis] * y + n[axis] * z);

/** Wyspa profilu operacji wyciągnięta wzdłuż normalnej od z0 do z1 – siatka w układzie bryły. */
function islandSolid(feature, island, z0, z1) {
  const n = featureNormal(feature);
  const V = [];
  const F = [];
  const loops = [island.outer, ...island.holes];
  const ring = (z) => loops.map((loop) => {
    const first = V.length;
    for (const point of loop) V.push(featurePoint(feature, n, point, z));
    return first;
  });
  const [bottom, top] = [ring(z0), ring(z1)];
  F.push(loops.map((loop, at) => loop.map((_, index) => bottom[at] + loop.length - 1 - index)));
  F.push(loops.map((loop, at) => loop.map((_, index) => top[at] + index)));
  loops.forEach((loop, at) => loop.forEach((_, index) => {
    const next = (index + 1) % loop.length;
    F.push([[bottom[at] + index, bottom[at] + next, top[at] + next, top[at] + index]]);
  }));
  return { V, F };
}

/** Wycięcie zaczyna się tyle nad ścianą (jednostki strony) – bez ścian narzędzia w płaszczyźnie ściany bryły. */
const CUT_MARGIN = 0.01;
/** Grubość bryły pod płaszczyzną operacji (wycięcie na wylot, domyślna głębokość). */
function depthBehind(points, feature) {
  const n = featureNormal(feature);
  const d = dot3(n, feature.o);
  let deepest = 0;
  for (const point of points) deepest = Math.max(deepest, d - dot3(n, point));
  return deepest;
}

/** Wielokąty bryły bazowej (bryła ze szkicu z kilkoma wyspami – suma wysp: wyspy mogą na siebie nachodzić). */
function basePolygons(element) {
  if (!isModel(element)) return meshPolygons(primitiveMesh(element.kind, element.dims));
  const { islands } = element.profile;
  if (islands.length === 1) return meshPolygons(modelMesh(element));
  return islands.reduce((sum, island) => union(sum, meshPolygons(modelMesh({ kind: element.kind, dims: element.dims, profile: { islands: [island] } }))), []);
}
/** Operacja na wielokątach bryły: każda wyspa profilu osobno (suma albo różnica). */
function applyFeature(polygons, feature) {
  const behind = feature.op === 'cut' && feature.through ? depthBehind(polygons.flatMap((polygon) => polygon.points), feature) + 1 : 0;
  let result = polygons;
  for (const island of feature.profile.islands) {
    const range = feature.op === 'add' ? [0, feature.depth] : [-(feature.through ? behind : feature.depth), CUT_MARGIN];
    const tool = meshPolygons(islandSolid(feature, island, ...range));
    result = feature.op === 'add' ? union(result, tool) : subtract(result, tool);
  }
  return result;
}

const profileIds = new WeakMap();
let nextProfileId = 1;
const featureKeys = new WeakMap();
/** Klucz bryły bazowej: rodzaj, wymiary i (bryła ze szkicu) tożsamość profilu. */
function baseKey(element) {
  if (!isModel(element)) return `${element.kind}:${JSON.stringify(element.dims)}`;
  if (!profileIds.has(element.profile)) profileIds.set(element.profile, nextProfileId++);
  return `${element.kind}:${JSON.stringify(element.dims)}:${profileIds.get(element.profile)}`;
}
function featureKey(feature) {
  if (!featureKeys.has(feature)) featureKeys.set(feature, JSON.stringify([feature.op, feature.o, feature.u, feature.v, feature.depth, feature.through === true, feature.profile]));
  return featureKeys.get(feature);
}
/** Wielokąty po kolejnych operacjach – zapamiętane (przeciąganie głębokości ostatniej operacji liczy tylko ją). */
const soupCache = new Map();
function featureSoup(element, count) {
  const key = [baseKey(element), ...element.features.slice(0, count).map(featureKey)].join('|');
  const cached = soupCache.get(key);
  if (cached) return cached;
  const result = count === 0 ? basePolygons(element) : applyFeature(featureSoup(element, count - 1), element.features[count - 1]);
  if (soupCache.size > 40) soupCache.delete(soupCache.keys().next().value);
  soupCache.set(key, result);
  return result;
}
const featureMeshes = new WeakMap();
/** Siatka bryły z operacjami na ścianach (ściany scalone, bez T-złączy) – jak siatka bryły ze szkicu. */
export function featureMesh(element) {
  const key = baseKey(element);
  const cached = featureMeshes.get(element.features);
  if (cached?.key === key) return cached.mesh;
  const mesh = toMesh(featureSoup(element, element.features.length));
  featureMeshes.set(element.features, { key, mesh });
  return mesh;
}
/** Siatka bryły (pętle ścian) – z operacjami, ze szkicu albo podstawowa; kula – null. */
export function solidShape(element) {
  if (element.kind === 'sphere') return null;
  if (hasFeatures(element)) return featureMesh(element);
  return isModel(element) ? modelMesh(element) : primitiveMesh(element.kind, element.dims);
}

const insidePage = (x, y, loops) => {
  let inside = false;
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const [a, b] = [loop[i], loop[j]];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
};
/** Ściany zwrócone do patrzącego: { normal – układ bryły, N – układ widoku, D, loops – strona, vertex – punkt ściany }. */
function frontFaces(element) {
  const mesh = solidShape(element);
  if (!mesh) return [];
  const m = quatMatrix(element.q);
  const view = mesh.V.map((vertex) => rotate(m, vertex));
  const list = [];
  mesh.F.forEach((loops, face) => {
    const N = rotate(m, mesh.N[face]);
    if (N[2] <= FACING) return;
    list.push({
      normal: mesh.N[face], N, D: dot3(N, view[loops[0][0]]), vertex: mesh.V[loops[0][0]],
      loops: loops.map((loop) => loop.map((index) => [element.x + view[index][0], element.y - view[index][1]]))
    });
  });
  return list;
}

/** Ściana bryły pod punktem strony (najbliższa patrzącemu): { normal – układ bryły, loops – obrys na stronie } albo null. */
export function faceAt(element, point) {
  let best = null;
  for (const face of frontFaces(element)) {
    if (!insidePage(point.x, point.y, face.loops)) continue;
    const [x, y] = [point.x - element.x, element.y - point.y];
    const z = (face.D - face.N[0] * x - face.N[1] * y) / face.N[2];
    if (!best || z > best.z) best = { normal: face.normal, loops: face.loops, z };
  }
  return best ? { normal: best.normal, loops: best.loops } : null;
}

/**
 * Położenie, w którym ściana o normalnej `normal` (układ bryły) jest zwrócona prosto do patrzącego i stoi prosto: ściana
 * boczna albo pochyła – oś Z (y bryły) w górę ekranu; wierzch i spód – krawędzie wzdłuż osi bryły, obrót jak najmniejszy
 * od obecnego położenia.
 */
export function faceView(element, normal) {
  const n = unit3(normal);
  const up = [0, 1, 0];
  let v;
  if (Math.abs(dot3(up, n)) < 0.9) v = unit3(up.map((value, axis) => value - dot3(up, n) * n[axis]));
  else {
    // Obecny kierunek „w górę ekranu” rzutowany na ścianę – najbliższa oś bryły leżąca w ścianie (przy remisie – pierwsza).
    const m = quatMatrix(element.q);
    const current = [m[3], m[4], m[5]];
    let best = -Infinity;
    for (const axis of [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 1, 0]]) {
      const along = unit3(axis.map((value, index) => value - dot3(axis, n) * n[index]));
      if (!along || Math.abs(dot3(axis, n)) > 0.7) continue;
      const score = dot3(along, current);
      if (score > best + 1e-6) {
        best = score;
        v = along;
      }
    }
  }
  const u = cross3(v, n);
  return quatFromMatrix([...u, ...v, ...n]).map((value) => round(value, 6));
}

/**
 * Układ szkicu na ścianie (od 1.49): bryła widziana prostopadle do płaskiej ściany, szkic `loops` (strona) choć częściowo na
 * niej; `center` – środek szkicu na stronie. Ściana – najbliższa patrzącemu spośród ścian pod szkicem. Wynik:
 * { o, u, v, behind – grubość bryły pod ścianą } albo { error }.
 */
export function sketchFrame(element, loops, center) {
  if (element.kind === 'sphere') return { error: 'Kula nie ma płaskiej ściany – szkic na ścianie tylko na innych bryłach' };
  const facing = frontFaces(element).filter((face) => face.N[2] > 1 - 1e-6);
  if (facing.length === 0) return { error: 'Ustaw bryłę ścianą do siebie: „Szkic na ścianie” i dotknij ściany' };
  const points = loops.flat();
  let best = null;
  for (const face of facing) {
    const overlaps = points.some(([x, y]) => insidePage(x, y, face.loops)) || face.loops[0].some(([x, y]) => insidePage(x, y, loops));
    if (!overlaps) continue;
    const z = face.D / face.N[2];
    if (!best || z > best.z + 1e-6) best = { face, z };
  }
  if (!best) return { error: 'Szkic musi leżeć na ścianie bryły (choć częściowo)' };
  const n = best.face.normal;
  const d = dot3(n, best.face.vertex);
  const m = quatMatrix(element.q);
  const [right, up] = [[m[0], m[1], m[2]], [m[3], m[4], m[5]]];
  const u = unit3(right.map((value, axis) => value - dot3(right, n) * n[axis]));
  const v = cross3(n, u);
  const [x, y] = [center.x - element.x, element.y - center.y];
  const p = [0, 1, 2].map((axis) => right[axis] * x + up[axis] * y);
  const o = p.map((value, axis) => value + n[axis] * (d - dot3(n, p)));
  const frame = { o: o.map(fine), u: u.map(fine), v: v.map(fine) };
  return { ...frame, behind: round(depthBehind(solidShape(element).V, frame)) };
}

/** Nowa operacja: dodanie – połowa krótszego boku szkicu (jak wyciągnięcie), wycięcie – do połowy grubości bryły. */
export function newFeature(op, frame, profile, sketch = []) {
  const points = profile.islands.flatMap((island) => island.outer);
  const [w, h] = [Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x)), Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y))];
  const depth = op === 'add' ? clamp(Math.min(w, h) / 2, SOLID_LIMITS.min, SOLID_LIMITS.max) : Math.max(FEATURE_LIMITS.min, frame.behind / 2);
  return { op, o: frame.o, u: frame.u, v: frame.v, profile, depth: round(depth), ...(sketch.length > 0 ? { sketch } : {}) };
}

/** Grubość bryły pod ścianą operacji (bez niej i późniejszych) – głębokość wycięcia na wylot. */
export function featureBehind(element, index) {
  return round(depthBehind(featureSoup(element, index).flatMap((polygon) => polygon.points), element.features[index]));
}

/** Położenie z widokiem prosto na ścianę operacji (szkic tak, jak go narysowano): wiersze macierzy – u, v, normalna. */
export const featureQuat = (feature) => quatFromMatrix([...feature.u, ...feature.v, ...featureNormal(feature)]).map((value) => round(value, 6));

/** Izometria (z ośmiu stron), w której ściana o normalnej `normal` jest najlepiej widoczna – po operacji. */
export function featureView(normal) {
  let best = null;
  for (const pitch of [35.264, -35.264]) {
    for (const yaw of [45, -45, 135, -135]) {
      const q = quatFromAngles(yaw, pitch);
      const z = rotate(quatMatrix(q), normal)[2];
      if (!best || z > best.z + 1e-6) best = { q, z };
    }
  }
  return best.q;
}

/**
 * Operacje za zmienionymi płaszczyznami (od 1.49): po zmianie wymiarów bryły albo głębokości operacji ściany się przesuwają –
 * operacje narysowane na nich idą razem z nimi (o tyle samo wzdłuż normalnej). `old` i `next` – ta sama bryła przed i po
 * zmianie; `pairs[i]` – numer operacji `next.features[i]` w `old` (−1 – nowa).
 */
export function followFaces(old, next, pairs = next.features?.map((_, index) => index) ?? []) {
  if (!hasFeatures(next)) return next;
  const moved = [];
  const before = old.kind === 'sphere' ? null : isModel(old) ? modelMesh(old) : primitiveMesh(old.kind, old.dims);
  const after = next.kind === 'sphere' ? null : isModel(next) ? modelMesh(next) : primitiveMesh(next.kind, next.dims);
  if (before && after && before.F.length === after.F.length && old.kind === next.kind) {
    before.F.forEach((loops, face) => {
      const [n0, n1] = [before.N[face], after.N[face]];
      if (dot3(n0, n1) < 1 - 1e-9) return;
      const [d0, d1] = [dot3(n0, before.V[loops[0][0]]), dot3(n1, after.V[after.F[face][0][0]])];
      if (Math.abs(d1 - d0) > 1e-6) moved.push({ n: n0, d0, d1 });
    });
  }
  const features = next.features.map((feature, index) => {
    const previous = pairs[index] >= 0 ? old.features?.[pairs[index]] : null;
    if (!previous) return feature;
    const n = featureNormal(previous);
    const d = dot3(n, previous.o);
    const shift = moved.find((plane) => dot3(plane.n, n) > 1 - 1e-6 && Math.abs(plane.d0 - d) < 1e-3);
    const delta = shift ? shift.d1 - shift.d0 : 0;
    const placed = delta === 0 ? feature : { ...feature, o: feature.o.map((value, axis) => fine(value + n[axis] * delta)) };
    // Koniec operacji (wierzch dodania, dno wycięcia) – płaszczyzna dla następnych operacji.
    if (!(previous.op === 'cut' && previous.through) && !(placed.op === 'cut' && placed.through)) {
      const sign = previous.op === 'add' ? 1 : -1;
      const [end0, end1] = [d + sign * previous.depth, d + delta + sign * placed.depth];
      if (Math.abs(end1 - end0) > 1e-6) moved.push({ n, d0: end0, d1: end1 });
    }
    return placed;
  });
  return { ...next, features };
}

// ---------------------------------------------------------------- rozkład na stronie

const geometryCache = new WeakMap();

/**
 * Rozkład bryły na stronie: visible / hidden – łamane krawędzi { points, closed }, faces – ściany zwrócone do patrzącego
 * { points, light } (cieniowanie), sphere – { x, y, r } (kula), axes – osie symetrii [[a, b]], dims – wymiary,
 * bounds – granice (z wymiarami).
 */
export function solidGeometry(element) {
  // Zapamiętany rozkład – tylko gdy bryła się nie zmieniła (element poprawiony w miejscu, np. przy wstawianiu, liczy się od nowa).
  const signature = JSON.stringify([element.kind, element.x, element.y, element.q, element.dims, element.showDims === true, element.axes === true]);
  const cached = geometryCache.get(element);
  if (cached?.signature === signature && cached.profile === element.profile && cached.features === element.features) return cached;
  const m = quatMatrix(element.q);
  const at = (point) => {
    const v = rotate(m, point);
    return { x: element.x + v[0], y: element.y - v[1], z: v[2] };
  };
  // Od 1.49 bryła z operacjami na ścianach (może być wklęsła) – jak bryła ze szkicu.
  const result = element.kind === 'sphere' ? sphereGeometry(element, at) : isModel(element) || hasFeatures(element) ? modelGeometry(element, m, at) : meshGeometry(element, m, at);
  result.bounds = boundsOf(result);
  result.signature = signature;
  result.profile = element.profile;
  result.features = element.features;
  geometryCache.set(element, result);
  return result;
}

function meshGeometry(element, m, at) {
  const mesh = solidMesh(element.kind, element.dims);
  const P = mesh.V.map(at);
  const N = mesh.N.map((normal) => rotate(m, normal));
  // Ściana zwrócona do patrzącego; prawie bokiem (np. ściany otworu w widoku z góry przy położeniu z 6 cyframi) – nie.
  const facing = N.map((normal) => normal[2] > FACING);
  const faces = [];
  mesh.F.forEach((face, index) => {
    if (!facing[index]) return;
    const n = N[index];
    faces.push({ points: face.map((vertex) => ({ x: P[vertex].x, y: P[vertex].y })), light: Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) });
  });
  const visible = [];
  const hidden = [];
  for (const edge of mesh.E) {
    const first = facing[edge.faces[0]];
    const second = edge.faces.length > 1 ? facing[edge.faces[1]] : first;
    if (edge.sharp) (first || second ? visible : hidden).push(edge);
    else if (first !== second) visible.push(edge);
  }
  const lines = (edges) => chainEdges(edges).map((chain) => {
    const closed = chain.length > 2 && chain[0] === chain[chain.length - 1];
    return { points: (closed ? chain.slice(0, -1) : chain).map((vertex) => ({ x: P[vertex].x, y: P[vertex].y })), closed };
  });
  const center = { x: element.x, y: element.y };
  return {
    visible: lines(visible), hidden: lines(hidden), faces, sphere: null,
    axes: axisLines(element, at, center),
    dims: meshDims(element, mesh, P, facing, at, center)
  };
}

/**
 * Bryła ze szkicu (od 1.48), także wklęsła i z otworami: krawędzie ostre i zarys próbkowane co ok. 3 jednostki – punkt
 * widać, gdy nie zasłania go żadna ściana zwrócona do patrzącego (poza ścianami tej krawędzi); granice odcinków –
 * bisekcją. Ściany od patrzącego – z płaszczyzną z(x, y) na stronie (bufor głębokości przy cieniowaniu).
 */
function modelGeometry(element, m, at) {
  const mesh = hasFeatures(element) ? featureMesh(element) : modelMesh(element);
  const view = mesh.V.map((vertex) => rotate(m, vertex));
  const P = view.map(([x, y]) => ({ x: element.x + x, y: element.y - y }));
  const N = mesh.N.map((normal) => rotate(m, normal));
  // Ściana zwrócona do patrzącego; prawie bokiem (np. ściany otworu w widoku z góry przy położeniu z 6 cyframi) – nie.
  const facing = N.map((normal) => normal[2] > FACING);
  const D = mesh.F.map((loops, face) => {
    const point = view[loops[0][0]];
    return N[face][0] * point[0] + N[face][1] * point[1] + N[face][2] * point[2];
  });
  // Siatka komórek (układ widoku, y w górę) ze ścianami od patrzącego.
  const CELL = 16;
  const grid = new Map();
  const boxes = mesh.F.map((loops, face) => {
    if (!facing[face]) return null;
    let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const index of loops[0]) {
      const [x, y] = view[index];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let row = Math.floor(minY / CELL); row <= Math.floor(maxY / CELL); row += 1) {
      for (let column = Math.floor(minX / CELL); column <= Math.floor(maxX / CELL); column += 1) {
        const id = `${row}:${column}`;
        if (!grid.has(id)) grid.set(id, []);
        grid.get(id).push(face);
      }
    }
    return { minX, maxX, minY, maxY };
  });
  const insideFace = (face, x, y) => {
    let inside = false;
    for (const loop of mesh.F[face]) {
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const [a, b] = [view[loop[i]], view[loop[j]]];
        if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
    }
    return inside;
  };
  const seen = ([x, y, z], skip) => {
    const list = grid.get(`${Math.floor(y / CELL)}:${Math.floor(x / CELL)}`);
    if (!list) return true;
    for (const face of list) {
      if (skip.includes(face)) continue;
      const box = boxes[face];
      if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) continue;
      const n = N[face];
      if ((D[face] - n[0] * x - n[1] * y) / n[2] > z + 0.05 && insideFace(face, x, y)) return false;
    }
    return true;
  };
  // Krawędzie do rysowania: ostre i zarys (gładkie między ścianami zwróconymi różnie); obie ściany od patrzącego tyłem – niewidoczne.
  const candidates = [];
  for (const edge of mesh.E) {
    // Od 1.49: krawędź ze szczeliną po operacji (seam – ściana po drugiej stronie) – jak krawędź dwóch ścian.
    const other = edge.faces.length > 1 ? edge.faces[1] : edge.seam;
    const first = facing[edge.faces[0]];
    const second = other !== undefined ? facing[other] : first;
    const faces = edge.seam !== undefined ? [...edge.faces, edge.seam] : edge.faces;
    if (edge.sharp) candidates.push({ ...edge, faces, hidden: !first && !second });
    else if (first !== second) candidates.push({ ...edge, faces, hidden: false });
  }
  const byKey = new Map(candidates.map((edge) => [`${edge.a}-${edge.b}`, edge]));
  const visible = [];
  const hidden = [];
  // Krawędzie z tyłu (całe niewidoczne) – osobne łamane: zamknięte obrysy z przodu zostają zamknięte.
  const chains = [...chainEdges(candidates.filter((edge) => !edge.hidden)), ...chainEdges(candidates.filter((edge) => edge.hidden))];
  for (const chain of chains) {
    let run = null;
    let travelled = 0;
    const flush = () => {
      if (run && run.points.length > 1) (run.seen ? visible : hidden).push({ points: run.points, closed: false, offset: run.offset });
      run = null;
    };
    for (let at = 0; at + 1 < chain.length; at += 1) {
      const [a, b] = [chain[at], chain[at + 1]];
      const edge = byKey.get(a < b ? `${a}-${b}` : `${b}-${a}`);
      const [A, B] = [view[a], view[b]];
      const length = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const steps = Math.max(1, Math.ceil(length / 3));
      const point = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
      const visibleAt = (t) => !edge.hidden && seen(point(t), edge.faces);
      const page = (t) => ({ x: P[a].x + (P[b].x - P[a].x) * t, y: P[a].y + (P[b].y - P[a].y) * t });
      let state = visibleAt(0.5 / steps);
      if (!run || run.seen !== state) {
        flush();
        run = { seen: state, points: [page(0)], offset: travelled };
      }
      for (let step = 1; step < steps; step += 1) {
        const next = visibleAt((step + 0.5) / steps);
        if (next !== state) {
          // Granica między próbkami – bisekcją.
          let [low, high] = [(step - 0.5) / steps, (step + 0.5) / steps];
          for (let round = 0; round < 8; round += 1) {
            const middle = (low + high) / 2;
            if (visibleAt(middle) === state) low = middle;
            else high = middle;
          }
          const border = (low + high) / 2;
          run.points.push(page(border));
          flush();
          run = { seen: next, points: [page(border)], offset: travelled + length * border };
          state = next;
        }
      }
      run.points.push(page(1));
      travelled += length;
    }
    // Zamknięta łamana bez przerw (cała widoczna albo cała niewidoczna) – zamknięta.
    const closed = chain.length > 2 && chain[0] === chain.at(-1);
    if (closed && run && run.points.length === chain.length && run.offset === 0) {
      run.points.pop();
      (run.seen ? visible : hidden).push({ points: run.points, closed: true, offset: 0 });
      run = null;
    }
    flush();
  }
  const faces = [];
  mesh.F.forEach((loops, face) => {
    if (!facing[face]) return;
    const n = N[face];
    // z na stronie: x widoku = X − x bryły, y widoku = y bryły − Y.
    const plane = { a: -n[0] / n[2], b: n[1] / n[2], c: (D[face] + n[0] * element.x - n[1] * element.y) / n[2] };
    faces.push({
      loops: loops.map((loop) => loop.map((index) => ({ x: P[index].x, y: P[index].y }))),
      points: loops[0].map((index) => ({ x: P[index].x, y: P[index].y })),
      light: Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]), plane
    });
  });
  const center = { x: element.x, y: element.y };
  const result = { visible, hidden, faces, sphere: null, depth: true };
  if (!hasFeatures(element)) return { ...result, axes: modelAxes(element, at, center), dims: modelDims(element, mesh, P, facing, at, center) };
  // Z operacjami na ścianach (od 1.49): osie i wymiary – z bryły bazowej (wymiary całości, jak bez operacji).
  const base = isModel(element) ? modelMesh(element) : solidMesh(element.kind, element.dims);
  const baseFacing = base.N.map((normal) => rotate(m, normal)[2] > FACING);
  if (!isModel(element)) return { ...result, axes: axisLines(element, at, center), dims: meshDims(element, base, base.V.map(at), baseFacing, at, center) };
  const baseP = base.V.map((vertex) => {
    const [x, y] = rotate(m, vertex);
    return { x: element.x + x, y: element.y - y };
  });
  return { ...result, axes: modelAxes(element, at, center), dims: modelDims(element, base, baseP, baseFacing, at, center) };
}

/** Granice profilu (układ bryły). */
function profileBounds(profile) {
  const points = profile.islands.flatMap((island) => island.outer);
  return {
    minX: Math.min(...points.map(([x]) => x)), maxX: Math.max(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)), maxY: Math.max(...points.map(([, y]) => y))
  };
}

/** Oś bryły obrotowej (x) – wysunięta poza bryłę; widok wzdłuż osi – krzyż. */
function modelAxes(element, at, center) {
  if (!element.axes || element.kind !== 'revolve') return [];
  const bounds = profileBounds(element.profile);
  const reach = Math.max(12, (bounds.maxX - bounds.minX) * 0.08);
  const [a, b] = [at([bounds.minX - reach, 0, 0]), at([bounds.maxX + reach, 0, 0])];
  if (Math.hypot(b.x - a.x, b.y - a.y) < (bounds.maxX - bounds.minX + 2 * reach) * 0.15) return crossLines(center, bounds.maxY + reach);
  return [[{ x: a.x, y: a.y }, { x: b.x, y: b.y }]];
}

/** Wymiary bryły ze szkicu: wyciągnięcie – długość wzdłuż Z (krawędź zarysu); obrotowa – długość wzdłuż osi i największa średnica. */
function modelDims(element, mesh, P, facing, at, center) {
  if (!element.showDims) return [];
  const dims = [];
  if (element.kind === 'extrude') {
    const preferred = { x: -0.33, y: 0.94 };
    let best = null;
    let score = -Infinity;
    for (const edge of mesh.E) {
      if (edge.faces.length !== 2 || facing[edge.faces[0]] === facing[edge.faces[1]]) continue;
      const [A, B] = [mesh.V[edge.a], mesh.V[edge.b]];
      // Krawędź wzdłuż wyciągnięcia (Z – y bryły).
      if (Math.abs(A[0] - B[0]) > 1e-6 || Math.abs(A[2] - B[2]) > 1e-6) continue;
      const [p1, p2] = [P[edge.a], P[edge.b]];
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 20) continue;
      const value = ((p1.x + p2.x) / 2 - center.x) * preferred.x + ((p1.y + p2.y) / 2 - center.y) * preferred.y;
      if (value > score) {
        score = value;
        best = edge;
      }
    }
    if (best) {
      const [p1, p2] = [P[best.a], P[best.b]];
      const length = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      let n = { x: -(p2.y - p1.y) / length, y: (p2.x - p1.x) / length };
      if (n.x * ((p1.x + p2.x) / 2 - center.x) + n.y * ((p1.y + p2.y) / 2 - center.y) < 0) n = { x: -n.x, y: -n.y };
      dims.push({ type: 'linear', from: { x: p1.x, y: p1.y }, to: { x: p2.x, y: p2.y }, normal: n, offset: SOLID_DIM.offset, gaps: [SOLID_DIM.gap, SOLID_DIM.gap], value: element.dims.h });
    }
    return dims;
  }
  const bounds = profileBounds(element.profile);
  const [a, b] = [at([bounds.minX, 0, 0]), at([bounds.maxX, 0, 0])];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  let perp = length > 1e-6 ? { x: -(b.y - a.y) / length, y: (b.x - a.x) / length } : { x: 1, y: 0 };
  if (perp.y < -1e-9 || (Math.abs(perp.y) <= 1e-9 && perp.x > 0)) perp = { x: -perp.x, y: -perp.y };
  const widest = Math.max(0, ...P.map((point) => (point.x - a.x) * perp.x + (point.y - a.y) * perp.y));
  // Linie pomocnicze od zarysu na końcach (promień profilu przy początku i końcu osi).
  const endRadius = (x) => Math.max(0, ...element.profile.islands.flatMap((island) => island.outer).filter(([px]) => Math.abs(px - x) < 1e-6).map(([, py]) => py));
  if (length >= 20) {
    dims.push({
      type: 'linear', from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y }, normal: perp, offset: widest + SOLID_DIM.offset,
      gaps: [endRadius(bounds.minX) + SOLID_DIM.gap, endRadius(bounds.maxX) + SOLID_DIM.gap], value: bounds.maxX - bounds.minX
    });
  }
  // Największa średnica – w miejscu najdalszego punktu profilu.
  const far = element.profile.islands.flatMap((island) => island.outer).reduce((best, point) => (point[1] > best[1] ? point : best));
  const middle = at([far[0], 0, 0]);
  const u = length > 1e-6 ? { x: perp.x, y: perp.y } : { x: 1, y: 0 };
  const direction = u.x < 0 ? { x: -u.x, y: -u.y } : u;
  dims.push({
    type: 'diameter', from: { x: middle.x - direction.x * far[1], y: middle.y - direction.y * far[1] }, to: { x: middle.x + direction.x * far[1], y: middle.y + direction.y * far[1] },
    value: far[1] * 2, prefix: '⌀'
  });
  return dims;
}

/** Kula: zarys, równik i południk (tylna połowa – niewidoczna), cieniowanie – gradient. */
function sphereGeometry(element, at) {
  const r = element.dims.d / 2;
  const center = { x: element.x, y: element.y };
  const visible = [{ points: Array.from({ length: 96 }, (_, index) => ({ x: center.x + r * Math.cos((index / 96) * Math.PI * 2), y: center.y + r * Math.sin((index / 96) * Math.PI * 2) })), closed: true }];
  const hidden = [];
  for (const circle of [(angle) => [r * Math.cos(angle), 0, r * Math.sin(angle)], (angle) => [0, r * Math.cos(angle), r * Math.sin(angle)]]) {
    const points = Array.from({ length: 97 }, (_, index) => at(circle((index / 96) * Math.PI * 2)));
    let run = [points[0]];
    let front = points[0].z + points[1].z > 0;
    const flush = () => {
      if (run.length > 1) (front ? visible : hidden).push({ points: run.map(({ x, y }) => ({ x, y })), closed: false, thin: true });
    };
    for (let index = 1; index < points.length; index += 1) {
      const side = points[index - 1].z + points[index].z > 0;
      if (side !== front) {
        flush();
        run = [points[index - 1]];
        front = side;
      }
      run.push(points[index]);
    }
    flush();
  }
  return {
    visible, hidden, faces: [], sphere: { x: center.x, y: center.y, r },
    axes: element.axes ? crossLines(center, r + 0.15 * element.dims.d + 8) : [],
    dims: element.showDims ? [{ type: 'diameter', from: { x: center.x - r, y: center.y }, to: { x: center.x + r, y: center.y }, value: element.dims.d, prefix: 'S⌀' }] : []
  };
}

/** Krzyż osi (widok wzdłuż osi albo kula): poziomo i pionowo przez środek. */
const crossLines = (center, reach) => [
  [{ x: center.x - reach, y: center.y }, { x: center.x + reach, y: center.y }],
  [{ x: center.x, y: center.y - reach }, { x: center.x, y: center.y + reach }]
];

/** Oś symetrii (linia punktowa) – wysunięta poza bryłę; widok wzdłuż osi – krzyż osi. */
function axisLines(element, at, center) {
  if (!element.axes || !hasAxis(element)) return [];
  const h = element.dims.h / 2;
  const reach = Math.max(12, element.dims.h * 0.12);
  const [a, b] = [at([0, -h - reach, 0]), at([0, h + reach, 0])];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const radius = element.kind === 'pyramid' ? Math.max(element.dims.a, element.dims.b) / 2 : element.dims.d / 2;
  if (length < (2 * h + 2 * reach) * 0.15) return crossLines(center, radius + reach);
  return [[{ x: a.x, y: a.y }, { x: b.x, y: b.y }]];
}

/** Wymiary: prostopadłościan – trzy krawędzie zarysu; bryły z osią – wysokość wzdłuż osi i średnice; ostrosłup – boki podstawy. */
function meshDims(element, mesh, P, facing, at, center) {
  if (!element.showDims) return [];
  const { dims } = element;
  const dimsOut = [];
  const outward = (p1, p2) => {
    const length = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    let n = { x: -(p2.y - p1.y) / length, y: (p2.x - p1.x) / length };
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    if (n.x * (mid.x - center.x) + n.y * (mid.y - center.y) < 0) n = { x: -n.x, y: -n.y };
    return n;
  };
  const silhouette = (edge) => edge.faces.length === 2 && facing[edge.faces[0]] !== facing[edge.faces[1]];
  // Krawędź zarysu wzdłuż osi: najbliżej dołu i lewej strony (tam wymiary są najczytelniejsze).
  const preferred = { x: -0.33, y: 0.94 };
  const pick = (test) => {
    let best = null;
    let score = -Infinity;
    for (const edge of mesh.E) {
      if (!test(edge) || !silhouette(edge)) continue;
      const [p1, p2] = [P[edge.a], P[edge.b]];
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 20) continue;
      const value = ((p1.x + p2.x) / 2 - center.x) * preferred.x + ((p1.y + p2.y) / 2 - center.y) * preferred.y;
      if (value > score) {
        score = value;
        best = edge;
      }
    }
    return best;
  };
  const along = (axis) => (edge) => {
    const [A, B] = [mesh.V[edge.a], mesh.V[edge.b]];
    return [0, 1, 2].every((k) => (k === axis ? Math.abs(A[k] - B[k]) > 1e-6 : Math.abs(A[k] - B[k]) < 1e-6));
  };
  const edgeDim = (edge, value) => {
    if (!edge) return;
    const [p1, p2] = [P[edge.a], P[edge.b]];
    dimsOut.push({ type: 'linear', from: { x: p1.x, y: p1.y }, to: { x: p2.x, y: p2.y }, normal: outward(p1, p2), offset: SOLID_DIM.offset, gaps: [SOLID_DIM.gap, SOLID_DIM.gap], value });
  };
  if (element.kind === 'box') {
    edgeDim(pick(along(0)), dims.a);
    edgeDim(pick(along(2)), dims.b);
    edgeDim(pick(along(1)), dims.c);
    return dimsOut;
  }
  if (element.kind === 'pyramid') {
    const base = (axis) => (edge) => along(axis)(edge) && Math.abs(mesh.V[edge.a][1] + dims.h / 2) < 1e-6;
    edgeDim(pick(base(0)), dims.a);
    edgeDim(pick(base(2)), dims.b);
  }
  // Wysokość – równolegle do osi, obok zarysu (po lewej).
  const h = dims.h / 2;
  const [b1, b2] = [at([0, -h, 0]), at([0, h, 0])];
  const axisLength = Math.hypot(b2.x - b1.x, b2.y - b1.y);
  let perp = axisLength > 1e-6 ? { x: -(b2.y - b1.y) / axisLength, y: (b2.x - b1.x) / axisLength } : { x: 1, y: 0 };
  if (perp.x > 1e-9 || (Math.abs(perp.x) <= 1e-9 && perp.y < 0)) perp = { x: -perp.x, y: -perp.y };
  const reachAt = (level, origin) => Math.max(0, ...mesh.V.filter((vertex) => Math.abs(vertex[1] - level) < 1e-6)
    .map((vertex) => {
      const point = at(vertex);
      return (point.x - origin.x) * perp.x + (point.y - origin.y) * perp.y;
    }));
  const widest = Math.max(0, ...P.map((point) => (point.x - b1.x) * perp.x + (point.y - b1.y) * perp.y));
  if (axisLength >= 20) {
    dimsOut.push({
      type: 'linear', from: { x: b1.x, y: b1.y }, to: { x: b2.x, y: b2.y }, normal: perp, offset: widest + SOLID_DIM.offset,
      gaps: [reachAt(-h, b1) + SOLID_DIM.gap, reachAt(h, b2) + SOLID_DIM.gap], value: dims.h
    });
  }
  // Średnice – w poprzek elipsy podstawy (walec i graniastosłup – ściany od strony patrzącego), wzdłuż jej dłuższej osi.
  const across = (origin, r) => {
    const u = axisLength > 1e-6 ? { x: -perp.x, y: -perp.y } : { x: 1, y: 0 };
    const direction = u.x < 0 ? { x: -u.x, y: -u.y } : u;
    return [{ x: origin.x - direction.x * r, y: origin.y - direction.y * r }, { x: origin.x + direction.x * r, y: origin.y + direction.y * r }];
  };
  const topFacing = rotate(quatMatrix(element.q), [0, 1, 0])[2] >= 0;
  if (element.kind === 'cylinder' || element.kind === 'prism') {
    const [from, to] = across(topFacing ? b2 : b1, dims.d / 2);
    dimsOut.push({ type: 'diameter', from, to, value: dims.d, prefix: '⌀' });
  } else if (element.kind === 'cone') {
    const [from, to] = across(b1, dims.d / 2);
    dimsOut.push({ type: 'diameter', from, to, value: dims.d, prefix: '⌀' });
    if (dims.t > 0) {
      const [start, end] = across(b2, dims.t / 2);
      dimsOut.push({ type: 'diameter', from: end, to: start, value: dims.t, prefix: '⌀' });
    }
  }
  return dimsOut;
}

/** Szacowana szerokość liczby wymiaru (jednostki strony) – jak w diagramach. */
const labelWidth = (text, size) => [...text].length * size * 0.56;

/**
 * Wymiar do narysowania (płótno, DXF): lines – odcinki, arrows – groty { tip, angle }, label – { x, y, angle, text, size }
 * (środek napisu, kąt czytelny – nigdy do góry nogami). text – liczba wymiaru (z jednostką rysunku).
 */
export function solidDimParts(dim, text) {
  const { font, over, arrow } = SOLID_DIM;
  const upright = (angle) => (angle > Math.PI / 2 + 1e-9 ? angle - Math.PI : angle <= -Math.PI / 2 - 1e-9 ? angle + Math.PI : angle);
  if (dim.type === 'linear') {
    const { from, to, normal: n, offset, gaps } = dim;
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const u = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const q1 = { x: from.x + n.x * offset, y: from.y + n.y * offset };
    const q2 = { x: to.x + n.x * offset, y: to.y + n.y * offset };
    const angle = Math.atan2(u.y, u.x);
    return {
      lines: [
        [{ x: from.x + n.x * gaps[0], y: from.y + n.y * gaps[0] }, { x: q1.x + n.x * over, y: q1.y + n.y * over }],
        [{ x: to.x + n.x * gaps[1], y: to.y + n.y * gaps[1] }, { x: q2.x + n.x * over, y: q2.y + n.y * over }],
        [q1, q2]
      ],
      arrows: [{ tip: q1, angle: angle + Math.PI }, { tip: q2, angle }],
      label: { x: (q1.x + q2.x) / 2 + n.x * (font * 0.75), y: (q1.y + q2.y) / 2 + n.y * (font * 0.75), angle: upright(angle), text, size: font }
    };
  }
  // Średnica: linia przez okrąg i dalej pod liczbę, groty na okręgu.
  const { from, to } = dim;
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const u = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const wide = labelWidth(text, font);
  const end = { x: to.x + u.x * (wide + arrow + 6), y: to.y + u.y * (wide + arrow + 6) };
  const angle = Math.atan2(u.y, u.x);
  // Napis nad przedłużeniem (po stronie „do góry” strony).
  let n = { x: u.y, y: -u.x };
  if (n.y > 0) n = { x: -n.x, y: -n.y };
  const along = arrow + 4 + wide / 2;
  return {
    lines: [[from, end]],
    arrows: [{ tip: from, angle: angle + Math.PI }, { tip: to, angle }],
    label: { x: to.x + u.x * along + n.x * (font * 0.7), y: to.y + u.y * along + n.y * (font * 0.7), angle: upright(angle), text, size: font }
  };
}

/** Granice rozkładu: krawędzie, ściany, kula, osie i wymiary (z miejscem na liczby). */
function boundsOf(geometry) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x, y) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  };
  for (const line of [...geometry.visible, ...geometry.hidden]) for (const point of line.points) add(point.x, point.y);
  for (const [a, b] of geometry.axes) {
    add(a.x, a.y);
    add(b.x, b.y);
  }
  if (geometry.sphere) {
    const { x, y, r } = geometry.sphere;
    add(x - r, y - r);
    add(x + r, y + r);
  }
  for (const dim of geometry.dims) {
    // Miejsce na liczbę – szacunkowo cztery cyfry.
    const parts = solidDimParts(dim, '0000');
    for (const [a, b] of parts.lines) {
      add(a.x, a.y);
      add(b.x, b.y);
    }
    const reach = Math.max(labelWidth('0000', parts.label.size) / 2, parts.label.size / 2);
    add(parts.label.x - reach, parts.label.y - reach);
    add(parts.label.x + reach, parts.label.y + reach);
  }
  if (!Number.isFinite(bounds.minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return bounds;
}

/** Prostokąt bryły { x, y, width, height } (z wymiarami) – zaznaczanie, granice, wstawianie. */
export function solidBox(element) {
  const { bounds } = solidGeometry(element);
  return { x: bounds.minX, y: bounds.minY, width: Math.max(1, bounds.maxX - bounds.minX), height: Math.max(1, bounds.maxY - bounds.minY) };
}

/** Kolor ściany przy cieniowaniu: kolor bryły rozjaśniony (80% bieli) i przyciemniony z dala od światła. */
export function solidTone(color, light) {
  const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  const k = 0.6 + 0.4 * light;
  return `#${rgb.map((value) => Math.round(clamp((value + (255 - value) * 0.8) * k, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------- rzuty 2D (od 1.48)

/** Odstęp rzutów (jednostki strony – dwie kratki). */
export const PROJECTION_GAP = 2 * STEP;
/** Rzuty metodą europejską: z przodu, z góry (pod nim), z lewej (z prawej strony rzutu z przodu). */
export const PROJECTION_VIEWS = Object.freeze(['front', 'top', 'left']);

/** Czy punkt leży na którejś z linii (odległość ≤ tolerance). */
function onLines(point, lines, tolerance) {
  for (const line of lines) {
    const count = line.points.length;
    for (let index = 0; index < (line.closed ? count : count - 1); index += 1) {
      const [a, b] = [line.points[index], line.points[(index + 1) % count]];
      const [dx, dy] = [b.x - a.x, b.y - a.y];
      const length = dx * dx + dy * dy;
      const t = length === 0 ? 0 : clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1);
      if (Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t) <= tolerance) return true;
    }
  }
  return false;
}

/**
 * Części łamanej niewidocznej poza liniami widocznymi (rysunek techniczny: linia widoczna ma pierwszeństwo) – próbki co ok.
 * 2 jednostki; cała poza – bez zmian (zamknięta zostaje zamknięta).
 */
function apartFrom(line, visible) {
  const count = line.points.length;
  const samples = [];
  for (let index = 0; index < (line.closed ? count : count - 1); index += 1) {
    const [a, b] = [line.points[index], line.points[(index + 1) % count]];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let step = 0; step < steps; step += 1) samples.push({ x: a.x + ((b.x - a.x) * step) / steps, y: a.y + ((b.y - a.y) * step) / steps, vertex: step === 0 });
  }
  samples.push({ ...(line.closed ? line.points[0] : line.points.at(-1)), vertex: true });
  const off = samples.map((point) => !onLines(point, visible, 0.6));
  if (off.every(Boolean)) return [line];
  const parts = [];
  let part = null;
  samples.forEach((point, index) => {
    if (!off[index]) return;
    const starts = index === 0 || !off[index - 1];
    const ends = index === samples.length - 1 || !off[index + 1];
    // Część dochodzi do linii widocznej (próbka obok); w środku – tylko wierzchołki łamanej.
    if (starts) part = index > 0 ? [samples[index - 1]] : [];
    if (point.vertex || starts || ends) part.push(point);
    if (ends) {
      if (index < samples.length - 1) part.push(samples[index + 1]);
      parts.push(part);
      part = null;
    }
  });
  return parts.filter((points) => points.length > 1).map((points) => ({ points: points.map(({ x, y }) => ({ x: round(x), y: round(y) })), closed: false }));
}

/**
 * Trzy rzuty bryły (od 1.48) w jej wymiarach, bez obrotu na kartce: { views: [{ id, visible, hidden, axes, bounds }], bounds }
 * – rzut z przodu ze środkiem w (0, 0), rzut z góry pod nim, z lewej – po prawej (odstęp PROJECTION_GAP). Linie niewidoczne,
 * które pokrywają się z widocznymi, odpadają (jak w rysunku technicznym); tak samo linie leżące na innych tego samego rodzaju
 * (np. krawędź otworu widziana z boku na obrysie, dwa otwory jeden za drugim) – każda kreska na rzucie raz.
 */
export function solidProjections(element) {
  const base = { ...element, x: 0, y: 0, showDims: false, axes: true };
  const raw = PROJECTION_VIEWS.map((id) => ({ id, geometry: solidGeometry({ ...base, q: viewQuat(id) }) }));
  const extent = (geometry) => {
    const points = [...geometry.visible, ...geometry.hidden].flatMap((line) => line.points);
    if (geometry.sphere) points.push({ x: -geometry.sphere.r, y: -geometry.sphere.r }, { x: geometry.sphere.r, y: geometry.sphere.r });
    return { minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)) };
  };
  const [front, top, left] = raw.map((view) => extent(view.geometry));
  const shift = {
    front: { x: 0, y: 0 },
    top: { x: 0, y: front.maxY + PROJECTION_GAP - top.minY },
    left: { x: front.maxX + PROJECTION_GAP - left.minX, y: 0 }
  };
  const move = (point, offset) => ({ x: round(point.x + offset.x), y: round(point.y + offset.y) });
  const views = raw.map(({ id, geometry }) => {
    const offset = shift[id];
    // Najpierw dłuższe (obrys), krótsze leżące na już przyjętych odpadają.
    const moved = (lines) => lines.map((line) => ({ points: line.points.map((point) => move(point, offset)), closed: line.closed }))
      .map((line) => ({ line, length: line.points.reduce((sum, point, index, list) => sum + (index > 0 ? Math.hypot(point.x - list[index - 1].x, point.y - list[index - 1].y) : 0), 0) }))
      .sort((p, q) => q.length - p.length).map(({ line }) => line);
    const visible = [];
    for (const line of moved(geometry.visible)) visible.push(...apartFrom(line, visible));
    const hidden = [];
    for (const line of moved(geometry.hidden)) hidden.push(...apartFrom(line, [...visible, ...hidden]));
    const axes = geometry.axes.map(([a, b]) => [move(a, offset), move(b, offset)]);
    const own = extent({ visible, hidden, sphere: null });
    return { id, visible, hidden, axes, bounds: own };
  });
  const all = views.map((view) => view.bounds);
  return { views, bounds: { minX: Math.min(...all.map((b) => b.minX)), maxX: Math.max(...all.map((b) => b.maxX)), minY: Math.min(...all.map((b) => b.minY)), maxY: Math.max(...all.map((b) => b.maxY)) } };
}

/** Okrąg z punktów łamanej zamkniętej (wszystkie w tej samej odległości od środka) – { x, y, r } albo null. */
export function circleOf(line) {
  if (!line.closed || line.points.length < 24) return null;
  const x = line.points.reduce((sum, point) => sum + point.x, 0) / line.points.length;
  const y = line.points.reduce((sum, point) => sum + point.y, 0) / line.points.length;
  const radii = line.points.map((point) => Math.hypot(point.x - x, point.y - y));
  const r = radii.reduce((sum, value) => sum + value, 0) / radii.length;
  return r > 1 && radii.every((value) => Math.abs(value - r) <= Math.max(0.5, r * 0.01)) ? { x, y, r } : null;
}

/**
 * Rzuty jako zwykłe kształty kartki (od 1.48) – do wymiarowania: krawędzie widoczne – linią ciągłą (okręgi – okręgami,
 * dwa punkty – odcinkiem, więcej – łamaną albo wielokątem), niewidoczne – przerywaną, osie – osiową; (x, y) – środek rzutu
 * z przodu na stronie. style: { color, size } – niewidoczne i osie o połowę cieńsze.
 */
export function projectionShapes(element, at, style) {
  const { views } = solidProjections(element);
  const thin = Math.max(0.5, round(style.size * 0.5, 1));
  const shapes = [];
  const place = (point) => ({ x: round(point.x + at.x), y: round(point.y + at.y) });
  const add = (line, size, dash) => {
    const points = line.points.map(place);
    const extra = dash !== 'solid' ? { dash } : {};
    const circle = circleOf({ ...line, points });
    if (circle) {
      shapes.push({ tool: 'shape', shape: 'ellipse', color: style.color, size, x: round(circle.x), y: round(circle.y), w: round(circle.r * 2), h: round(circle.r * 2), angle: 0, skew: 0, adjust: 0, ...extra });
      return;
    }
    if (points.length === 2 || (!line.closed && points.length === 2)) {
      const [a, b] = points;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 1) return;
      shapes.push({ tool: 'shape', shape: 'line', color: style.color, size, x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2), w: round(length), h: 0, angle: Math.atan2(b.y - a.y, b.x - a.x), skew: 0, adjust: 0, ...extra });
      return;
    }
    // Łamana na prostej (np. tworząca widziana z boku) – odcinek.
    const [first, last] = [points[0], points.at(-1)];
    const straight = !line.closed && points.every((point) => {
      const [dx, dy] = [last.x - first.x, last.y - first.y];
      const length = Math.hypot(dx, dy) || 1;
      return Math.abs((point.x - first.x) * dy - (point.y - first.y) * dx) / length <= 0.5;
    });
    if (straight) {
      add({ points: [line.points[0], line.points.at(-1)], closed: false }, size, dash);
      return;
    }
    shapes.push({ ...polyFromPoints(line.closed ? 'polygon' : 'polyline', points, { x: first.x, y: first.y, angle: 0 }, { color: style.color, size }), ...extra });
  };
  for (const view of views) {
    for (const line of view.visible) add(line, style.size, 'solid');
    for (const line of view.hidden) add(line, thin, 'dashed');
    for (const [a, b] of view.axes) add({ points: [a, b], closed: false }, thin, 'center');
  }
  return shapes;
}
