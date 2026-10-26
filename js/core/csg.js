// Operacje logiczne na bryłach (od 1.49): różnica i suma wielościanów zamkniętych. Klasyczna metoda grafiki
// komputerowej – podział przestrzeni drzewem BSP płaszczyznami ścian (opisana m.in. przez Thibaulta i Naylora w 1987 r.);
// implementacja własna, bez bibliotek.
//
// Wielościan to lista płaskich wielokątów wypukłych { points: [[x, y, z], …], plane }: punkty przeciwnie do wskazówek
// zegara, patrząc z zewnątrz; plane { n – normalna na zewnątrz (jednostkowa), w – odległość od początku układu }. Części
// jednej ściany mają wspólny obiekt płaszczyzny – po operacji ściany tej samej płaszczyzny łączą się z powrotem.
// Wynik zamienia `toMesh` na siatkę jak u brył ze szkicu: { V, F – ściany jako pętle [obrys, …otwory], N, E }.

/** Grubość płaszczyzny przy klasyfikacji punktów (jednostki strony). */
const EPS = 1e-5;
/**
 * Punkty bliżej siebie – jeden wierzchołek siatki. Profil szkicu ma punkty co 0,01 jednostki strony, więc drobniejsze
 * różnice to tylko błędy rachunku (np. ściany narzędzia prawie równoległe do ścian bryły) – na kartce niewidoczne.
 */
const WELD = 2e-3;
/** Punkt na odcinku innej ściany (T-złącze). */
const ON_LINE = 1e-3;
/** Punkt pośredni na prostej (usuwany). */
const STRAIGHT = 1e-3;
/** Kolec w pętli (droga tam i z powrotem w tej odległości) – usuwany; pętla węższa niż tyle – odpada. */
const SPIKE = 1e-2;
/**
 * Krawędzie z jedną ścianą leżące na jednej prostej (w tej odległości albo 2% długości) – wspólna krawędź dwóch ścian
 * (szczelina z rachunku przy ścianach przecinających się pod bardzo małym kątem).
 */
const SEAM = 2e-2;

const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Płaszczyzna przez punkty (normalna metodą Newella – odporna na punkty prawie w linii). */
export function planeOf(points) {
  let [nx, ny, nz, cx, cy, cz] = [0, 0, 0, 0, 0, 0];
  points.forEach((p, index) => {
    const q = points[(index + 1) % points.length];
    nx += (p[1] - q[1]) * (p[2] + q[2]);
    ny += (p[2] - q[2]) * (p[0] + q[0]);
    nz += (p[0] - q[0]) * (p[1] + q[1]);
    cx += p[0];
    cy += p[1];
    cz += p[2];
  });
  const n = unit([nx, ny, nz]);
  return { n, w: (n[0] * cx + n[1] * cy + n[2] * cz) / points.length };
}

/** Płaszczyzna odwrócona – zapamiętana, żeby części jednej ściany dalej miały wspólny obiekt. */
function flipped(plane) {
  if (!plane.flip) plane.flip = { n: [-plane.n[0], -plane.n[1], -plane.n[2]], w: -plane.w, flip: plane };
  return plane.flip;
}
const flipPolygon = (polygon) => ({ points: polygon.points.slice().reverse(), plane: flipped(polygon.plane) });

/**
 * Wielokąt względem płaszczyzny: przed nią, za nią, w niej (według zwrotu normalnej – do `coplanarFront` albo
 * `coplanarBack`) albo przecięty na dwie części.
 */
function split(plane, polygon, coplanarFront, coplanarBack, front, back) {
  let type = 0;
  const types = polygon.points.map((point) => {
    const t = dot(plane.n, point) - plane.w;
    const kind = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
    type |= kind;
    return kind;
  });
  if (type === COPLANAR) (dot(plane.n, polygon.plane.n) > 0 ? coplanarFront : coplanarBack).push(polygon);
  else if (type === FRONT) front.push(polygon);
  else if (type === BACK) back.push(polygon);
  else {
    const f = [];
    const b = [];
    const { points } = polygon;
    points.forEach((p, i) => {
      const j = (i + 1) % points.length;
      const q = points[j];
      if (types[i] !== BACK) f.push(p);
      if (types[i] !== FRONT) b.push(p);
      if ((types[i] | types[j]) === SPANNING) {
        const t = (plane.w - dot(plane.n, p)) / dot(plane.n, minus(q, p));
        const cut = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
        f.push(cut);
        b.push(cut);
      }
    });
    if (f.length >= 3) front.push({ points: f, plane: polygon.plane });
    if (b.length >= 3) back.push({ points: b, plane: polygon.plane });
  }
}

// ---------------------------------------------------------------- drzewo BSP (bez rekurencji – głębokie drzewa)

const node = () => ({ plane: null, front: null, back: null, polygons: [] });

/** Ile wielokątów (z próbki) płaszczyzna przecina – mniej przecięć, mniej drobnych części. */
function splits(plane, list) {
  let count = 0;
  const step = Math.max(1, Math.floor(list.length / 48));
  for (let index = 0; index < list.length; index += step) {
    let type = 0;
    for (const point of list[index].points) {
      const t = dot(plane.n, point) - plane.w;
      type |= t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
      if (type === SPANNING) break;
    }
    if (type === SPANNING) count += 1;
  }
  return count;
}
/** Płaszczyzna podziału: z kilku kandydatów ta, która przecina najmniej wielokątów. */
function choosePlane(list) {
  if (list.length <= 4) return list[0].plane;
  const step = Math.max(1, Math.floor(list.length / 8));
  let best = list[0].plane;
  let fewest = Infinity;
  for (let index = 0; index < list.length; index += step) {
    const count = splits(list[index].plane, list);
    if (count < fewest) {
      fewest = count;
      best = list[index].plane;
      if (count === 0) break;
    }
  }
  return best;
}
/** Dokłada wielokąty do drzewa: płaszczyzna węzła – jednego z wielokątów, pozostałe na przód albo w tył. */
function build(root, polygons) {
  const stack = [[root, polygons]];
  while (stack.length > 0) {
    const [at, list] = stack.pop();
    if (list.length === 0) continue;
    if (!at.plane) at.plane = choosePlane(list);
    const front = [];
    const back = [];
    for (const polygon of list) split(at.plane, polygon, at.polygons, at.polygons, front, back);
    if (front.length > 0) stack.push([(at.front ??= node()), front]);
    if (back.length > 0) stack.push([(at.back ??= node()), back]);
  }
}
const tree = (polygons) => {
  const root = node();
  build(root, polygons);
  return root;
};
function nodes(root) {
  const list = [];
  const stack = [root];
  while (stack.length > 0) {
    const at = stack.pop();
    list.push(at);
    if (at.front) stack.push(at.front);
    if (at.back) stack.push(at.back);
  }
  return list;
}
/** Wielokąty poza bryłą drzewa (części w środku odpadają). */
function clipPolygons(root, polygons) {
  const kept = [];
  const stack = [[root, polygons]];
  while (stack.length > 0) {
    const [at, list] = stack.pop();
    if (!at.plane) {
      kept.push(...list);
      continue;
    }
    const front = [];
    const back = [];
    for (const polygon of list) split(at.plane, polygon, front, back, front, back);
    if (at.front) stack.push([at.front, front]);
    else kept.push(...front);
    if (at.back) stack.push([at.back, back]);
  }
  return kept;
}
/** Części wielokątów drzewa `root` poza bryłą `other`; `box` – obrys `other` (bryła ograniczona): wielokąty z dala zostają bez podziału. */
function clipTo(root, other, box = null) {
  for (const at of nodes(root)) {
    if (!box) {
      at.polygons = clipPolygons(other, at.polygons);
      continue;
    }
    const near = [];
    const far = [];
    for (const polygon of at.polygons) (apart(boundsOf([polygon]), box) ? far : near).push(polygon);
    at.polygons = near.length > 0 ? [...far, ...clipPolygons(other, near)] : far;
  }
}
/** Dopełnienie bryły: wielokąty i płaszczyzny odwrócone, przód z tyłem zamienione. */
function invert(root) {
  for (const at of nodes(root)) {
    at.polygons = at.polygons.map(flipPolygon);
    if (at.plane) at.plane = flipped(at.plane);
    [at.front, at.back] = [at.back, at.front];
  }
}
const allPolygons = (root) => nodes(root).flatMap((at) => at.polygons);

/** Prostopadłościan otaczający wielokąty. */
function boundsOf(polygons) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) {
    for (const point of polygon.points) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
  }
  return { min, max };
}
const apart = (a, b) => [0, 1, 2].some((axis) => a.min[axis] > b.max[axis] + EPS || b.min[axis] > a.max[axis] + EPS);

/** Różnica A − B (B wycina z A). */
export function subtract(a, b) {
  const [boxA, boxB] = [boundsOf(a), boundsOf(b)];
  if (a.length === 0 || b.length === 0 || apart(boxA, boxB)) return a.slice();
  const A = tree(a);
  const B = tree(b);
  invert(A);
  clipTo(A, B, boxB);
  clipTo(B, A);
  invert(B);
  clipTo(B, A);
  invert(B);
  build(A, allPolygons(B));
  invert(A);
  return allPolygons(A);
}

/** Suma A ∪ B. */
export function union(a, b) {
  if (a.length === 0) return b.slice();
  const [boxA, boxB] = [boundsOf(a), boundsOf(b)];
  if (b.length === 0 || apart(boxA, boxB)) return [...a, ...b];
  const A = tree(a);
  const B = tree(b);
  clipTo(A, B, boxB);
  clipTo(B, A, boxA);
  invert(B);
  clipTo(B, A);
  invert(B);
  build(A, allPolygons(B));
  return allPolygons(A);
}

// ---------------------------------------------------------------- ściany z otworami → wielokąty wypukłe

/** Dwa wektory leżące w płaszczyźnie o normalnej `n` (u × v = n). */
export function planeAxes(n) {
  const helper = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(helper, n));
  return { u, v: cross(n, u) };
}

/**
 * Części wypukłe obszaru z pętli 2D (otwory – reguła parzystości): pasy między kolejnymi wysokościami wierzchołków,
 * w każdym pasie trapezy między parami krawędzi. Prosto i bez przypadków szczególnych (wierzchołki na jednej wysokości,
 * otwory przy brzegu); punkty pośrednie na krawędziach usuwa potem `toMesh`.
 */
export function convexParts(loops) {
  const levels = [];
  for (const y of loops.flat().map((point) => point[1]).sort((p, q) => p - q)) if (levels.length === 0 || y - levels.at(-1) > 1e-9) levels.push(y);
  const edges = [];
  for (const loop of loops) {
    loop.forEach((a, index) => {
      const b = loop[(index + 1) % loop.length];
      if (Math.abs(a[1] - b[1]) > 1e-12) edges.push(a[1] < b[1] ? [a, b] : [b, a]);
    });
  }
  const parts = [];
  for (let level = 0; level + 1 < levels.length; level += 1) {
    const [y0, y1] = [levels[level], levels[level + 1]];
    const middle = (y0 + y1) / 2;
    const crossing = [];
    for (const [a, b] of edges) {
      if (a[1] >= middle || b[1] <= middle) continue;
      const at = (y) => a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
      crossing.push([at(middle), at(y0), at(y1)]);
    }
    crossing.sort((p, q) => p[0] - q[0]);
    for (let index = 0; index + 1 < crossing.length; index += 2) {
      const [left, right] = [crossing[index], crossing[index + 1]];
      const quad = [[left[1], y0], [right[1], y0], [right[2], y1], [left[2], y1]];
      const points = quad.filter((point, at) => {
        const previous = quad[(at + 3) % 4];
        return Math.abs(point[0] - previous[0]) > 1e-12 || Math.abs(point[1] - previous[1]) > 1e-12;
      });
      if (points.length >= 3) parts.push(points);
    }
  }
  return parts;
}

/** Czy pętla 2D (przeciwnie do wskazówek zegara) jest wypukła. */
function convexLoop(loop) {
  for (let index = 0; index < loop.length; index += 1) {
    const [a, b, c] = [loop[index], loop[(index + 1) % loop.length], loop[(index + 2) % loop.length]];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-9) return false;
  }
  return true;
}

/**
 * Wielokąty wypukłe z siatki { V, F – pętle [obrys, …otwory] }: ściana wypukła bez otworów – sama, inne – trapezy
 * w jej płaszczyźnie. Kolejność punktów obrysu daje normalną na zewnątrz.
 */
export function meshPolygons(mesh) {
  const polygons = [];
  for (const loops of mesh.F) {
    const outer = loops[0].map((index) => mesh.V[index]);
    if (outer.length < 3) continue;
    const plane = planeOf(outer);
    const { u, v } = planeAxes(plane.n);
    const flat = loops.map((loop) => loop.map((index) => [dot(mesh.V[index], u), dot(mesh.V[index], v)]));
    if (loops.length === 1 && convexLoop(flat[0])) {
      polygons.push({ points: outer.map((point) => point.slice()), plane });
      continue;
    }
    for (const part of convexParts(flat)) {
      polygons.push({
        plane,
        points: part.map(([x, y]) => [plane.n[0] * plane.w + u[0] * x + v[0] * y, plane.n[1] * plane.w + u[1] * x + v[1] * y, plane.n[2] * plane.w + u[2] * x + v[2] * y])
      });
    }
  }
  return polygons;
}

// ---------------------------------------------------------------- wielokąty → siatka

/** Numery punktów leżących na odcinku a–b (bez końców), od a do b – szukane w posortowanych współrzędnych. */
function pointsIndex(V, ids) {
  const sorted = [0, 1, 2].map((axis) => ids.slice().sort((p, q) => V[p][axis] - V[q][axis]));
  const lower = (list, axis, value) => {
    let [low, high] = [0, list.length];
    while (low < high) {
      const middle = (low + high) >> 1;
      if (V[list[middle]][axis] < value) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  return (a, b) => {
    const [A, B] = [V[a], V[b]];
    const d = minus(B, A);
    const length2 = dot(d, d);
    if (length2 === 0) return [];
    // Oś, wzdłuż której w zakresie odcinka leży najmniej punktów.
    let axis = 0;
    let range = null;
    for (let candidate = 0; candidate < 3; candidate += 1) {
      const list = sorted[candidate];
      const first = lower(list, candidate, Math.min(A[candidate], B[candidate]) - ON_LINE);
      const last = lower(list, candidate, Math.max(A[candidate], B[candidate]) + ON_LINE * 1.0001);
      if (!range || last - first < range[1] - range[0]) {
        axis = candidate;
        range = [first, last];
      }
    }
    const found = [];
    const list = sorted[axis];
    for (let at = range[0]; at < range[1]; at += 1) {
      const index = list[at];
      if (index === a || index === b) continue;
      const P = V[index];
      const t = dot(minus(P, A), d) / length2;
      if (t <= 1e-9 || t >= 1 - 1e-9) continue;
      const off = minus(P, [A[0] + d[0] * t, A[1] + d[1] * t, A[2] + d[2] * t]);
      if (dot(off, off) <= ON_LINE * ON_LINE) found.push([t, index]);
    }
    return found.sort((p, q) => p[0] - q[0]).map(([, index]) => index);
  };
}

/** Pętla z dołożonymi punktami leżącymi na jej odcinkach (T-złącza). */
function withPointsOnEdges(loop, on) {
  const result = [];
  loop.forEach((a, index) => {
    result.push(a);
    result.push(...on(a, loop[(index + 1) % loop.length]));
  });
  return result;
}

/** Czy B leży na odcinku A–C (punkt pośredni na prostej). */
function between(A, B, C) {
  const d = minus(C, A);
  const length2 = dot(d, d);
  if (length2 === 0) return true;
  const t = dot(minus(B, A), d) / length2;
  const off = minus(B, [A[0] + d[0] * t, A[1] + d[1] * t, A[2] + d[2] * t]);
  return t > 0 && t < 1 && dot(off, off) <= STRAIGHT * STRAIGHT;
}
/**
 * Kolec: z A do B i prawie tą samą drogą z powrotem do C (kąt przy B bliski zera – wąski trójkąt po błędach rachunku).
 */
function spike(A, B, C) {
  const [u, v] = [minus(A, B), minus(C, B)];
  const [lu, lv] = [Math.hypot(...u), Math.hypot(...v)];
  if (lu === 0 || lv === 0) return true;
  if (dot(u, v) <= 0) return false;
  const [short, long, length] = lu < lv ? [u, v, lv] : [v, u, lu];
  const along = dot(short, long) / length;
  return Math.sqrt(Math.max(0, dot(short, short) - along * along)) <= SPIKE;
}
/** Wierzchołek do usunięcia: punkt pośredni na prostej albo czubek kolca. */
const removable = (A, B, C) => between(A, B, C) || spike(A, B, C);
/** Pętla bez punktów pośrednich na prostej, kolców i powtórzeń – jeden przebieg ze stosem, potem miejsce łączenia końców. */
function simplify(loop, V) {
  const points = [];
  for (const index of loop) {
    if (points.at(-1) === index) continue;
    while (points.length >= 2 && removable(V[points.at(-2)], V[points.at(-1)], V[index])) points.pop();
    if (points.at(-1) !== index) points.push(index);
  }
  if (points.length > 1 && points[0] === points.at(-1)) points.pop();
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    if (removable(V[points.at(-2)], V[points.at(-1)], V[points[0]])) {
      points.pop();
      changed = true;
    } else if (removable(V[points.at(-1)], V[points[0]], V[points[1]])) {
      points.shift();
      changed = true;
    }
  }
  return points;
}

/** Pole ze znakiem pętli 2D (dodatnie – przeciwnie do wskazówek zegara). */
const area2 = (loop) => loop.reduce((sum, [x, y], index) => {
  const [u, v] = loop[(index + 1) % loop.length];
  return sum + x * v - u * y;
}, 0) / 2;
const inside2 = (x, y, loop) => {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [a, b] = [loop[i], loop[j]];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};

/**
 * Siatka z wielokątów: wierzchołki sklejone, części jednej płaszczyzny połączone w ściany (wspólne krawędzie znikają,
 * zostaje obrys i otwory), punkty pośrednie na prostych usunięte, T-złącza między ścianami uzupełnione – każda krawędź
 * ma dwie ściany. Krawędź ostra – ściany pod kątem ponad `sharpAngle` (stopnie).
 */
export function toMesh(polygons, sharpAngle = 20) {
  // Sklejanie wierzchołków: komórki siatki, sprawdzane z sąsiednimi.
  const V = [];
  const cells = new Map();
  const CELL = WELD * 10;
  const cellKey = (x, y, z) => `${x},${y},${z}`;
  const weld = (point) => {
    const key = point.map((value) => Math.floor(value / CELL));
    // Sąsiednie komórki – tylko w osiach, w których punkt leży przy granicy komórki.
    const near = point.map((value, axis) => {
      const offset = value / CELL - key[axis];
      return offset * CELL < WELD ? [0, -1] : (1 - offset) * CELL < WELD ? [0, 1] : [0];
    });
    for (const dx of near[0]) {
      for (const dy of near[1]) {
        for (const dz of near[2]) {
          const list = cells.get(cellKey(key[0] + dx, key[1] + dy, key[2] + dz));
          if (!list) continue;
          for (const index of list) {
            const q = V[index];
            if (Math.abs(q[0] - point[0]) <= WELD && Math.abs(q[1] - point[1]) <= WELD && Math.abs(q[2] - point[2]) <= WELD) return index;
          }
        }
      }
    }
    V.push(point.slice());
    const id = cellKey(...key);
    if (!cells.has(id)) cells.set(id, []);
    cells.get(id).push(V.length - 1);
    return V.length - 1;
  };
  // Grupy płaszczyzn: ten sam obiekt płaszczyzny albo płaszczyzna równa w granicach błędu.
  const groups = [];
  const byPlane = new Map();
  for (const polygon of polygons) {
    let ids = polygon.points.map(weld);
    ids = ids.filter((index, at) => index !== ids[(at + ids.length - 1) % ids.length]);
    if (ids.length < 3) continue;
    let group = byPlane.get(polygon.plane);
    if (!group) {
      const { n, w } = polygon.plane;
      group = groups.find((other) => dot(other.n, n) > 1 - 1e-9 && Math.abs(other.w - w) < WELD);
      if (!group) {
        group = { n, w, parts: [] };
        groups.push(group);
      }
      byPlane.set(polygon.plane, group);
    }
    group.parts.push(ids);
  }
  // Ściany grupy: krawędzie części (z T-złączami w grupie) – przeciwne się znoszą, reszta to obrysy i otwory.
  const faces = [];
  for (const group of groups) {
    const ids = [...new Set(group.parts.flat())];
    const on = pointsIndex(V, ids);
    const count = new Map();
    const SIZE = 2 ** 26;
    for (const part of group.parts) {
      const loop = withPointsOnEdges(part, on);
      loop.forEach((a, at) => {
        const b = loop[(at + 1) % loop.length];
        if (a === b) return;
        const key = a * SIZE + b;
        count.set(key, (count.get(key) ?? 0) + 1);
      });
    }
    const outgoing = new Map();
    for (const [key, times] of count) {
      const [a, b] = [Math.floor(key / SIZE), key % SIZE];
      const net = times - (count.get(b * SIZE + a) ?? 0);
      for (let copy = 0; copy < net; copy += 1) {
        if (!outgoing.has(a)) outgoing.set(a, []);
        outgoing.get(a).push(b);
      }
    }
    const { u, v } = planeAxes(group.n);
    const flat = (index) => [dot(V[index], u), dot(V[index], v)];
    const angle = (a, b) => {
      const [p, q] = [flat(a), flat(b)];
      return Math.atan2(q[1] - p[1], q[0] - p[0]);
    };
    const loops = [];
    for (const start of [...outgoing.keys()]) {
      while ((outgoing.get(start)?.length ?? 0) > 0) {
        const loop = [start];
        let [previous, current] = [start, outgoing.get(start).pop()];
        let guard = 0;
        while (current !== start && guard < 100000) {
          guard += 1;
          loop.push(current);
          const options = outgoing.get(current) ?? [];
          if (options.length === 0) break;
          // Kilka wyjść z punktu (obszary stykające się wierzchołkiem): pierwsze zgodnie ze wskazówkami zegara
          // od kierunku powrotu – obszar zostaje po lewej stronie.
          let pick = 0;
          if (options.length > 1) {
            const back = angle(current, previous);
            let best = Infinity;
            options.forEach((next, at) => {
              let turn = back - angle(current, next);
              while (turn <= 1e-12) turn += Math.PI * 2;
              if (turn < best) {
                best = turn;
                pick = at;
              }
            });
          }
          [previous, current] = [current, options.splice(pick, 1)[0]];
        }
        if (current === start && loop.length >= 3) loops.push(loop);
      }
    }
    // Obrysy (przeciwnie do wskazówek zegara względem normalnej) i otwory – do najmniejszego obrysu, który je zawiera.
    // Pętle szersze niż SPIKE (pole / obwód) – węższe to szczeliny z rachunku.
    const shaped = loops.map((loop) => {
      const points = loop.map(flat);
      const perimeter = points.reduce((sum, [x, y], index) => sum + Math.hypot(points[(index + 1) % points.length][0] - x, points[(index + 1) % points.length][1] - y), 0);
      return { loop, points, area: area2(points), perimeter };
    }).filter((item) => Math.abs(item.area) > (item.perimeter * SPIKE) / 2);
    const outers = shaped.filter((item) => item.area > 0).map((item) => ({ ...item, holes: [] }));
    for (const hole of shaped.filter((item) => item.area < 0)) {
      let owner = null;
      let votes = -1;
      for (const outer of outers) {
        const inside = hole.points.filter(([x, y]) => inside2(x, y, outer.points)).length;
        if (inside > votes || (inside === votes && owner && outer.area < owner.area)) {
          owner = outer;
          votes = inside;
        }
      }
      owner?.holes.push(hole.loop);
    }
    for (const outer of outers) faces.push({ n: group.n, loops: [outer.loop, ...outer.holes] });
  }
  // Bez punktów pośrednich na prostych, potem T-złącza między ścianami (wspólne krawędzie – te same wierzchołki).
  for (const face of faces) face.loops = face.loops.map((loop) => simplify(loop, V)).filter((loop) => loop.length >= 3);
  const kept = faces.filter((face) => face.loops.length > 0);
  const used = [...new Set(kept.flatMap((face) => face.loops.flat()))];
  const on = pointsIndex(V, used);
  for (const face of kept) face.loops = face.loops.map((loop) => withPointsOnEdges(loop, on));
  // Numeracja tylko użytych wierzchołków.
  const renumber = new Map();
  const vertices = [];
  for (const face of kept) {
    for (const loop of face.loops) {
      for (const index of loop) {
        if (!renumber.has(index)) {
          renumber.set(index, vertices.length);
          vertices.push(V[index]);
        }
      }
    }
  }
  const F = kept.map((face) => face.loops.map((loop) => loop.map((index) => renumber.get(index))));
  const N = kept.map((face) => face.n.slice());
  const edges = new Map();
  F.forEach((loops, face) => loops.forEach((loop) => loop.forEach((a, at) => {
    const b = loop[(at + 1) % loop.length];
    if (a === b) return;
    const id = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edges.has(id)) edges.set(id, { a: Math.min(a, b), b: Math.max(a, b), faces: [] });
    edges.get(id).faces.push(face);
  })));
  const limit = Math.cos((sharpAngle * Math.PI) / 180);
  const list = [...edges.values()];
  pairSeams(list.filter((edge) => edge.faces.length === 1), vertices);
  const E = list.map((edge) => {
    const [first, second = first] = edge.faces;
    const other = edge.seam ?? second;
    const sharp = (edge.faces.length !== 2 && edge.seam === undefined) || dot(N[first], N[other]) < limit;
    return edge.seam === undefined ? { a: edge.a, b: edge.b, faces: edge.faces, sharp } : { a: edge.a, b: edge.b, faces: edge.faces, seam: edge.seam, sharp };
  });
  return { V: vertices, F, N, E };
}

/**
 * Krawędzie z jedną ścianą (wąska szczelina po błędach rachunku przy prawie równoległych ścianach): dwie takie krawędzie
 * na jednej prostej, nachodzące na siebie, rysują się jak wspólna krawędź swoich ścian (seam – ściana drugiej krawędzi);
 * ostrość – z kąta między nimi. Bez tego gładka ściana otworu dostałaby zbędną kreskę.
 */
function pairSeams(open, V) {
  for (let i = 0; i < open.length; i += 1) {
    const e = open[i];
    const [A, B] = [V[e.a], V[e.b]];
    const d = minus(B, A);
    const length2 = dot(d, d);
    if (length2 === 0) continue;
    for (let j = i + 1; j < open.length; j += 1) {
      const f = open[j];
      if (f.faces[0] === e.faces[0]) continue;
      const span = Math.max(Math.sqrt(length2), Math.hypot(...minus(V[f.b], V[f.a])));
      const reach = Math.max(SEAM, span * 0.02);
      const ts = [V[f.a], V[f.b]].map((P) => {
        const t = dot(minus(P, A), d) / length2;
        const off = minus(P, [A[0] + d[0] * t, A[1] + d[1] * t, A[2] + d[2] * t]);
        return dot(off, off) <= reach * reach ? t : null;
      });
      if (ts.includes(null)) continue;
      // Część wspólna – co najmniej połowa krótszej krawędzi.
      const overlap = Math.min(1, Math.max(...ts)) - Math.max(0, Math.min(...ts));
      const shorter = Math.min(1, Math.abs(ts[1] - ts[0]));
      if (overlap <= 0 || overlap < shorter / 2) continue;
      e.seam ??= f.faces[0];
      f.seam ??= e.faces[0];
    }
  }
}

/** Objętość siatki zamkniętej (wzór Gaussa – suma po ścianach; ściany z otworami). */
export function meshVolume(mesh) {
  let volume = 0;
  mesh.F.forEach((loops) => {
    let area = [0, 0, 0];
    for (const loop of loops) {
      loop.forEach((index, at) => {
        const [p, q] = [mesh.V[index], mesh.V[loop[(at + 1) % loop.length]]];
        const c = cross(p, q);
        area = [area[0] + c[0] / 2, area[1] + c[1] / 2, area[2] + c[2] / 2];
      });
    }
    volume += dot(mesh.V[loops[0][0]], area) / 3;
  });
  return volume;
}
