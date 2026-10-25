// Bryły (od 1.47) – bez przeglądarki: element { tool: 'solid', kind, x, y, dims, q, color, size, edges, shade?, showDims?, axes? }.
// (x, y) – środek bryły na stronie; dims – wymiary w jednostkach strony (jak w i h kształtu; liczby na rysunku – ze skali);
// q – położenie w przestrzeni, kwaternion [w, x, y, z]. Układ bryły: x w prawo, y w górę, z do patrzącego – bez obrotu
// widać ją z przodu. Rzut prostokątny, jak w rysunku technicznym; size – grubość krawędzi widocznych.
//
// Rodzaje: prostopadłościan { a – długość (x), b – szerokość (z), c – wysokość (y) }, walec { d, h }, stożek { d – podstawa,
// t – góra (0 – ostry, więcej – ścięty), h }, ostrosłup { podstawa a × b, h }, graniastosłup foremny { n – boki (3–12),
// d – średnica okręgu opisanego, h; jedna ściana z przodu }, kula { d }. Oś walca, stożka, ostrosłupa i graniastosłupa – y.
//
// Krawędzie: ostre (ściany pod kątem > 20°) rysowane zawsze – niewidoczne przerywane, ukryte albo jak widoczne (edges);
// gładkie (pobocznica walca i stożka) – tylko zarys. Bryły są wypukłe: ściany zwrócone do patrzącego nie zasłaniają się
// nawzajem, krawędź widać, gdy widać jedną z jej ścian. Rozkład (linie, ściany do cieniowania, osie, wymiary) – ten sam
// dla płótna, granic zaznaczenia i pliku DXF.

/** Kratka strony (drawing.js PAPER_STEP) – wymiary nowej bryły. */
const STEP = 44;
const D2R = Math.PI / 180;
const HEX = /^#[0-9a-f]{6}$/i;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export const SOLID_KINDS = Object.freeze(['box', 'cylinder', 'cone', 'pyramid', 'prism', 'sphere']);
export const SOLID_LABELS = Object.freeze({ box: 'Prostopadłościan', cylinder: 'Walec', cone: 'Stożek', pyramid: 'Ostrosłup', prism: 'Graniastosłup', sphere: 'Kula' });
/** Wymiary rodzaju bryły: [klucz, nazwa w oknie]. */
export const SOLID_FIELDS = Object.freeze({
  box: Object.freeze([['a', 'Długość a'], ['b', 'Szerokość b'], ['c', 'Wysokość c']]),
  cylinder: Object.freeze([['d', 'Średnica ⌀'], ['h', 'Wysokość h']]),
  cone: Object.freeze([['d', 'Podstawa ⌀'], ['t', 'Góra ⌀ (0 – ostry)'], ['h', 'Wysokość h']]),
  pyramid: Object.freeze([['a', 'Podstawa a'], ['b', 'Podstawa b'], ['h', 'Wysokość h']]),
  prism: Object.freeze([['n', 'Liczba boków'], ['d', 'Średnica opisana ⌀'], ['h', 'Wysokość h']]),
  sphere: Object.freeze([['d', 'Średnica ⌀']])
});
/** Wymiary nowej bryły (jednostki strony – kratki). */
export const SOLID_DEFAULTS = Object.freeze({
  box: Object.freeze({ a: 6 * STEP, b: 4 * STEP, c: 3 * STEP }),
  cylinder: Object.freeze({ d: 4 * STEP, h: 5 * STEP }),
  cone: Object.freeze({ d: 4 * STEP, t: 0, h: 5 * STEP }),
  pyramid: Object.freeze({ a: 4 * STEP, b: 4 * STEP, h: 4.5 * STEP }),
  prism: Object.freeze({ n: 6, d: 4 * STEP, h: 2.5 * STEP }),
  sphere: Object.freeze({ d: 4 * STEP })
});
/** Wymiary: najmniej i najwięcej (jednostki strony), liczba boków graniastosłupa. */
export const SOLID_LIMITS = Object.freeze({ min: 4, max: 6000, sides: Object.freeze([3, 12]) });
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
  return {
    tool: 'solid', kind: SOLID_KINDS.includes(kind) ? kind : 'box', x, y, dims: { ...SOLID_DEFAULTS[SOLID_KINDS.includes(kind) ? kind : 'box'] },
    q: viewQuat('iso'), color, size, edges: 'dashed', shade: true, showDims: true, axes: true
  };
}
export const isSolid = (stroke) => stroke?.tool === 'solid';
export const solidLabel = (element) => `Bryła: ${SOLID_LABELS[element.kind] ?? 'bryła'}`;
/** Czy bryła ma oś symetrii (osie: walec, stożek, ostrosłup, graniastosłup, kula). */
export const hasAxis = (element) => element.kind !== 'box';

/** Sprawdzone wymiary rodzaju bryły (brakujące – domyślne). */
export function cleanSolidDims(kind, raw) {
  const dims = {};
  for (const [key] of SOLID_FIELDS[kind]) {
    const value = raw?.[key];
    const fallback = SOLID_DEFAULTS[kind][key];
    if (key === 'n') dims.n = finite(value) ? clamp(Math.round(value), ...SOLID_LIMITS.sides) : fallback;
    else if (key === 't') dims.t = finite(value) && value > 0 ? round(clamp(value, SOLID_LIMITS.min, SOLID_LIMITS.max)) : 0;
    else dims[key] = finite(value) && value > 0 ? round(clamp(value, SOLID_LIMITS.min, SOLID_LIMITS.max)) : fallback;
  }
  return dims;
}

/** Sprawdzona bryła (zapis, kopia zapasowa) albo null. */
export function cleanSolid(raw, pageWidth, pageHeight) {
  if (!raw || !SOLID_KINDS.includes(raw.kind) || !finite(raw.x) || !finite(raw.y) || !HEX.test(raw.color ?? '')) return null;
  const q = Array.isArray(raw.q) && raw.q.length === 4 && raw.q.every(finite) && Math.hypot(...raw.q) > 1e-6 ? quatNorm(raw.q).map((value) => round(value, 6)) : viewQuat('iso');
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
    ...(raw.axes === true ? { axes: true } : {})
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
  return { ...withQuat(element, quatFromMatrix(next)), x: round(at.x + dx * cos2 + dy * sin2), y: round(at.y + dx * sin2 - dy * cos2) };
}
/** Bryła powiększona `factor` razy wokół (cx, cy). */
export function scaleSolid(element, cx, cy, factor) {
  const dims = Object.fromEntries(Object.entries(element.dims).map(([key, value]) => [key, key === 'n' ? value : round(clamp(value * factor, key === 't' && value === 0 ? 0 : SOLID_LIMITS.min, SOLID_LIMITS.max))]));
  return { ...element, dims, x: round(cx + (element.x - cx) * factor), y: round(cy + (element.y - cy) * factor) };
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
  if (cached?.signature === signature) return cached;
  const m = quatMatrix(element.q);
  const at = (point) => {
    const v = rotate(m, point);
    return { x: element.x + v[0], y: element.y - v[1], z: v[2] };
  };
  const result = element.kind === 'sphere' ? sphereGeometry(element, at) : meshGeometry(element, m, at);
  result.bounds = boundsOf(result);
  result.signature = signature;
  geometryCache.set(element, result);
  return result;
}

function meshGeometry(element, m, at) {
  const mesh = solidMesh(element.kind, element.dims);
  const P = mesh.V.map(at);
  const N = mesh.N.map((normal) => rotate(m, normal));
  const facing = N.map((normal) => normal[2] > 1e-9);
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
