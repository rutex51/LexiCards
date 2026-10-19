// Geometria zaginanej kartki (bez przeglądarki): gdzie przebiega zgięcie, która część kartki
// leży płasko, która jest zagięta i gdzie ląduje zagięty płat.
//
// Układ kartki: grzbiet na x = 0, kartka W × H leży po prawej (0..W, 0..H), y rośnie w dół.
// Chwycony punkt („róg”) leży na wolnej krawędzi x = W: górny róg (W, 0), dolny (W, H)
// albo dowolny punkt pośrodku krawędzi – wtedy kartka zgina się prosto, pionowo.
// Róg przesunięty do punktu P: zgięcie to symetralna odcinka róg–P, a zagięta część
// kartki odbija się względem zgięcia (płaskie zgięcie papieru).

const EPSILON = 1e-6;

/** Rodzaj chwytu według wysokości punktu na stronie: górna i dolna część – róg, środek – krawędź. */
export function gripOf(y, height) {
  if (y < height * 0.3) return 'top';
  if (y > height * 0.7) return 'bottom';
  return 'edge';
}

/** Chwycony punkt kartki dla chwytu (edge – na wysokości `y`). */
export function cornerOf(grip, width, height, y = height / 2) {
  if (grip === 'top') return { x: width, y: 0 };
  if (grip === 'bottom') return { x: width, y: height };
  return { x: width, y: Math.min(height, Math.max(0, y)) };
}

/** Punkt, w którym róg leży po całkowitym przewróceniu kartki (odbicie względem grzbietu). */
export function turnedCorner(corner) {
  return { x: -corner.x, y: corner.y };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Punkt `point` przyciągnięty do koła o środku `center` i promieniu `radius`, jeśli leży dalej. */
function within(point, center, radius) {
  const length = distance(point, center);
  if (length <= radius) return point;
  return {
    x: center.x + ((point.x - center.x) * radius) / length,
    y: center.y + ((point.y - center.y) * radius) / length
  };
}

/**
 * Położenie rogu po ograniczeniach papieru. Kartka nie odrywa się od grzbietu: odległość rogu
 * od obu końców grzbietu nie może przekroczyć tej, jaką ma na płaskiej kartce. Róg nie schodzi
 * za swoją krawędź (dolny poniżej dołu, górny powyżej góry), a chwyt krawędzi zgina pionowo.
 */
export function constrainCorner({ width, height, corner, point }) {
  if (corner.y > 0 && corner.y < height) {
    return { x: Math.min(width, Math.max(-width, point.x)), y: corner.y };
  }
  const bottom = corner.y >= height;
  const near = { x: 0, y: corner.y };
  const far = { x: 0, y: bottom ? 0 : height };
  let result = { x: Math.min(width, point.x), y: bottom ? Math.min(height, point.y) : Math.max(0, point.y) };
  for (let step = 0; step < 4; step += 1) {
    result = within(within(result, near, width), far, Math.hypot(width, height));
  }
  return result;
}

/**
 * Część wielokąta po jednej stronie prostej: punkty X, dla których (X − point)·normal ≥ 0
 * (algorytm Sutherlanda–Hodgmana dla jednej półpłaszczyzny).
 */
export function clipPolygon(polygon, point, normal) {
  const side = (vertex) => (vertex.x - point.x) * normal.x + (vertex.y - point.y) * normal.y;
  const result = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const a = side(current);
    const b = side(next);
    if (a >= -EPSILON) result.push(current);
    if ((a > EPSILON && b < -EPSILON) || (a < -EPSILON && b > EPSILON)) {
      const t = a / (a - b);
      result.push({ x: current.x + (next.x - current.x) * t, y: current.y + (next.y - current.y) * t });
    }
  }
  return result.length >= 3 ? result : [];
}

/** Macierz przekształcenia [a, b, c, d, e, f] (jak w CSS matrix): x' = a·x + c·y + e, y' = b·x + d·y + f. */
export function applyMatrix(m, point) {
  return { x: m[0] * point.x + m[2] * point.y + m[4], y: m[1] * point.x + m[3] * point.y + m[5] };
}

/** Złożenie przekształceń: najpierw `second`, potem `first`. */
export function multiply(first, second) {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5]
  ];
}

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

/** Lustrzane odbicie poziome strony o szerokości `width` (x → width − x). */
export function mirror(width) {
  return [-1, 0, 0, 1, width, 0];
}

/** Odbicie względem prostej przez `point` o kierunku jednostkowym `direction`. */
export function reflection(point, direction) {
  const a = direction.x * direction.x - direction.y * direction.y;
  const b = 2 * direction.x * direction.y;
  const linear = [a, b, b, -a, 0, 0];
  const moved = applyMatrix(linear, point);
  return [a, b, b, -a, point.x - moved.x, point.y - moved.y];
}

/**
 * Zgięcie kartki dla rogu przesuniętego do punktu `point` (już po ograniczeniach).
 * Zwraca null, gdy kartka leży płasko. Wynik:
 *   point, normal – prosta zgięcia (normal wskazuje stronę zagiętą, czyli stronę rogu),
 *   direction – kierunek zgięcia, flat – płaska część kartki, folded – część zagięta
 *   (przed odbiciem), flap – miejsce zagiętego płata, reflection – macierz odbicia,
 *   progress – postęp przewracania 0..1 (1 – róg na miejscu przewróconej kartki).
 */
export function foldGeometry({ width, height, corner, point }) {
  const dx = corner.x - point.x;
  const dy = corner.y - point.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return null;
  const normal = { x: dx / length, y: dy / length };
  const middle = { x: (corner.x + point.x) / 2, y: (corner.y + point.y) / 2 };
  const direction = { x: -normal.y, y: normal.x };
  const page = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const folded = clipPolygon(page, middle, normal);
  if (folded.length === 0) return null;
  const flat = clipPolygon(page, middle, { x: -normal.x, y: -normal.y });
  const matrix = reflection(middle, direction);
  return {
    point: middle,
    normal,
    direction,
    flat,
    folded,
    flap: folded.map((vertex) => applyMatrix(matrix, vertex)),
    reflection: matrix,
    progress: Math.min(1, length / (2 * width))
  };
}

/**
 * Naturalne uniesienie rogu w trakcie przewracania (progress 0..1): dolny róg idzie łukiem
 * w górę, górny w dół, a na końcu wraca na swoją wysokość. Chwyt krawędzi – bez uniesienia.
 */
export function cornerLift(corner, width, height, progress) {
  if (corner.y > 0 && corner.y < height) return 0;
  const amount = Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) * Math.min(height * 0.25, width * 0.4);
  return corner.y >= height ? -amount : amount;
}

/**
 * Droga rogu przy przewracaniu bez palca (przyciski, klawisze): progress 0 – kartka leży
 * płasko, 1 – róg na miejscu przewróconej kartki.
 */
export function cornerPath(corner, width, height, progress) {
  return { x: corner.x - 2 * width * progress, y: corner.y + cornerLift(corner, width, height, progress) };
}
