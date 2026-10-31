// Wiaderko (od 1.63) – wypełnienie zamkniętego obszaru kolorem, jak w programach do malowania – bez przeglądarki.
//
// Edytor rysuje linie rysunku (bez tła kartki i bez wcześniejszych wypełnień) na płótnie poza ekranem i podaje tu maskę
// „tuszu”: 1 – piksel linii, 0 – wolny. Obszar to wolne piksele połączone z dotkniętym (sąsiedzi w poziomie i pionie).
// Obszar, który dochodzi do brzegu okna, nie jest zamknięty (null). Obszar jest poszerzany o piksel pod linie (wypełnienie
// leży pod kreskami, więc nie zostaje jasna szczelina przy wygładzonym brzegu linii), potem obrysowany: brzeg zewnętrzny
// i otwory (np. wnętrze mniejszego zamkniętego kształtu w środku), uproszczony i przeliczony na jednostki rysunku.
//
// Wypełnienie w rysunku: { tool: 'fill', color, points: [x, y, w, …], rings: [n1, n2, …] } – punkty jak w kresce pióra
// (w – zawsze 1, nieużywane), rings – liczby punktów kolejnych obrysów (pierwszy – brzeg, dalej otwory); malowane regułą
// parzystości (otwory zostają puste). Dzięki punktom jak w kresce przesuwanie, obrót, odbicie, skalowanie, zaznaczanie
// i warstwy działają tak samo jak dla kresek.

/** Najmniejsze pole obrysu (w pikselach maski) – mniejsze otwory i okruchy są pomijane. */
const MIN_RING_AREA = 3;
/** Najwięcej punktów wypełnienia (jak w kresce pióra – MAX_POINTS w core/drawing.js). */
export const FILL_POINTS_MAX = 60000;

/**
 * Obszar wolnych pikseli połączony z (sx, sy): { region – Uint8Array (1 – w obszarze), count, edges – { left, top, right,
 * bottom } (czy obszar dotyka brzegu okna) } albo null – (sx, sy) poza oknem albo na linii.
 */
export function floodRegion(ink, width, height, sx, sy) {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height || ink[y0 * width + x0]) return null;
  const region = new Uint8Array(width * height);
  const edges = { left: false, top: false, right: false, bottom: false };
  let count = 0;
  // Wypełnianie wierszami: odcinek wolnych pikseli w wierszu, potem wiersz wyżej i niżej.
  const stack = [x0, y0];
  while (stack.length > 0) {
    const y = stack.pop();
    let x = stack.pop();
    const row = y * width;
    if (region[row + x] || ink[row + x]) continue;
    while (x > 0 && !region[row + x - 1] && !ink[row + x - 1]) x -= 1;
    let above = false;
    let below = false;
    for (; x < width && !region[row + x] && !ink[row + x]; x += 1) {
      region[row + x] = 1;
      count += 1;
      if (x === 0) edges.left = true;
      if (x === width - 1) edges.right = true;
      if (y === 0) edges.top = true;
      if (y === height - 1) edges.bottom = true;
      if (y > 0) {
        const free = !region[row - width + x] && !ink[row - width + x];
        if (free && !above) stack.push(x, y - 1);
        above = free;
      }
      if (y < height - 1) {
        const free = !region[row + width + x] && !ink[row + width + x];
        if (free && !below) stack.push(x, y + 1);
        below = free;
      }
    }
  }
  return { region, count, edges };
}

/**
 * Maska poszerzona o `radius` pikseli w każdą stronę (kwadrat – także po skosie). Nowa maska; dwa przebiegi (wiersze,
 * potem kolumny), więc czas nie zależy od promienia.
 */
export function dilateMask(mask, width, height, radius = 1) {
  if (radius <= 0) return mask.slice();
  const rows = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    // Ostatni zapalony piksel w zasięgu – liczony w obie strony wiersza.
    let last = -Infinity;
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x]) last = x;
      if (x - last <= radius) rows[row + x] = 1;
    }
    last = Infinity;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (mask[row + x]) last = x;
      if (last - x <= radius) rows[row + x] = 1;
    }
  }
  const next = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    let last = -Infinity;
    for (let y = 0; y < height; y += 1) {
      if (rows[y * width + x]) last = y;
      if (y - last <= radius) next[y * width + x] = 1;
    }
    last = Infinity;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (rows[y * width + x]) last = y;
      if (last - y <= radius) next[y * width + x] = 1;
    }
  }
  return next;
}

/**
 * Obrysy obszaru: lista pętli wierzchołków siatki pikseli [x, y, x, y, …] (narożniki pikseli, tylko załamania). Brzeg
 * zewnętrzny – zgodnie z ruchem wskazówek zegara na ekranie, otwory – przeciwnie; piksele stykające się tylko narożnikiem
 * należą do osobnych pętli.
 */
export function traceRings(region, width, height) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && region[y * width + x] === 1;
  const stride = width + 1;
  const out = new Map();
  const addEdge = (ax, ay, bx, by) => {
    const key = ay * stride + ax;
    const list = out.get(key);
    const edge = { to: by * stride + bx, dx: bx - ax, dy: by - ay, used: false };
    if (list) list.push(edge);
    else out.set(key, [edge]);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }
  const rings = [];
  for (const [startKey, list] of out) {
    for (const first of list) {
      if (first.used) continue;
      const ring = [];
      let key = startKey;
      let edge = first;
      while (edge && !edge.used) {
        edge.used = true;
        ring.push(key % stride, Math.floor(key / stride));
        key = edge.to;
        const options = (out.get(key) ?? []).filter((candidate) => !candidate.used);
        if (options.length <= 1) {
          edge = options[0] ?? null;
          continue;
        }
        // Rozwidlenie (piksele stykają się narożnikiem): najpierw skręt w prawo, potem prosto, potem w lewo.
        const [dx, dy] = [edge.dx, edge.dy];
        const order = [[-dy, dx], [dx, dy], [dy, -dx]];
        edge = order.map(([ox, oy]) => options.find((candidate) => candidate.dx === ox && candidate.dy === oy)).find(Boolean) ?? options[0];
      }
      const corners = dropCollinear(ring);
      if (corners.length >= 6) rings.push(corners);
    }
  }
  return rings;
}

/** Pętla bez punktów leżących na prostej między sąsiadami. */
function dropCollinear(ring) {
  const count = ring.length / 2;
  const kept = [];
  for (let index = 0; index < count; index += 1) {
    const prev = (index - 1 + count) % count;
    const next = (index + 1) % count;
    const [ax, ay, bx, by, cx, cy] = [ring[prev * 2], ring[prev * 2 + 1], ring[index * 2], ring[index * 2 + 1], ring[next * 2], ring[next * 2 + 1]];
    if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) !== 0) kept.push(bx, by);
  }
  return kept;
}

/** Pole pętli [x, y, …] (ze znakiem – na ekranie dodatnie przy obiegu zgodnym z ruchem wskazówek zegara). */
export function ringArea(ring) {
  let sum = 0;
  for (let index = 0, prev = ring.length - 2; index < ring.length; prev = index, index += 2) {
    sum += ring[prev] * ring[index + 1] - ring[index] * ring[prev + 1];
  }
  return sum / 2;
}

/** Odległość punktu (px, py) od odcinka A–B. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Łamana [x, y, …] uproszczona (Douglas–Peucker) z dokładnością `epsilon`; końce zostają. */
function simplifyChain(points, epsilon) {
  const count = points.length / 2;
  if (count <= 2) return points.slice();
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack = [[0, count - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop();
    let far = -1;
    let distance = epsilon;
    for (let index = from + 1; index < to; index += 1) {
      const d = segmentDistance(points[index * 2], points[index * 2 + 1], points[from * 2], points[from * 2 + 1], points[to * 2], points[to * 2 + 1]);
      if (d > distance) {
        far = index;
        distance = d;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([from, far], [far, to]);
    }
  }
  const result = [];
  for (let index = 0; index < count; index += 1) if (keep[index]) result.push(points[index * 2], points[index * 2 + 1]);
  return result;
}

/** Pętla [x, y, …] uproszczona z dokładnością `epsilon` – dzielona w punkcie najdalszym od pierwszego. */
export function simplifyRing(ring, epsilon) {
  const count = ring.length / 2;
  if (count <= 4) return ring.slice();
  let far = 0;
  let best = -1;
  for (let index = 1; index < count; index += 1) {
    const d = Math.hypot(ring[index * 2] - ring[0], ring[index * 2 + 1] - ring[1]);
    if (d > best) {
      best = d;
      far = index;
    }
  }
  const first = simplifyChain(ring.slice(0, far * 2 + 2), epsilon);
  const second = simplifyChain([...ring.slice(far * 2), ring[0], ring[1]], epsilon);
  const merged = [...first, ...second.slice(2, -2)];
  return merged.length >= 6 ? merged : ring.slice();
}

/**
 * Wypełnienie z dotknięcia: ink – maska linii (Uint8Array, width × height pikseli), (sx, sy) – dotknięty piksel, map –
 * piksel siatki (narożnik) → punkt rysunku { x, y }; gap – szczeliny między liniami do tylu pikseli z każdej strony (razem
 * do 2 × gap) są domykane: linie są na czas szukania obszaru pogrubione o gap, a obszar potem poszerzony o gap + 1 – pod
 * linie (odręczna pętla rzadko zamyka się co do piksela). Zwraca { stroke } albo { error: 'line' | 'open', edges } – dotknięta
 * linia albo obszar otwarty (dochodzi do brzegu okna; edges – które brzegi).
 */
export function bucketFill(ink, width, height, sx, sy, { color, map, epsilon = 0.75, gap = 0 }) {
  const walls = gap > 0 ? dilateMask(ink, width, height, gap) : ink;
  const flood = floodRegion(walls, width, height, sx, sy);
  if (!flood) return { error: 'line' };
  if (flood.edges.left || flood.edges.top || flood.edges.right || flood.edges.bottom) return { error: 'open', edges: flood.edges };
  const rings = traceRings(dilateMask(flood.region, width, height, gap + 1), width, height)
    .filter((ring) => Math.abs(ringArea(ring)) >= MIN_RING_AREA);
  if (rings.length === 0) return { error: 'line' };
  // Najpierw brzeg zewnętrzny (największe pole), potem otwory.
  rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  let tolerance = epsilon;
  let simple = rings.map((ring) => simplifyRing(ring, tolerance));
  // Bardzo poszarpany obszar – mocniejsze upraszczanie, aż zmieści się w limicie punktów.
  while (simple.reduce((sum, ring) => sum + ring.length / 2, 0) > FILL_POINTS_MAX && tolerance < 64) {
    tolerance *= 2;
    simple = rings.map((ring) => simplifyRing(ring, tolerance));
  }
  const points = [];
  const counts = [];
  for (const ring of simple) {
    if (ring.length < 6) continue;
    for (let index = 0; index < ring.length; index += 2) {
      const point = map(ring[index], ring[index + 1]);
      points.push(Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10, 1);
    }
    counts.push(ring.length / 2);
  }
  if (counts.length === 0) return { error: 'line' };
  return { stroke: { tool: 'fill', color, points, ...(counts.length > 1 ? { rings: counts } : {}) } };
}

/** Obrysy wypełnienia jako listy punktów [[x, y, x, y, …], …] (pierwszy – brzeg, dalej otwory). */
export function fillRings(stroke) {
  const total = stroke.points.length / 3;
  const counts = Array.isArray(stroke.rings) && stroke.rings.length > 0 ? stroke.rings : [total];
  const rings = [];
  let start = 0;
  for (const count of counts) {
    const ring = [];
    for (let index = start; index < start + count && index < total; index += 1) ring.push(stroke.points[index * 3], stroke.points[index * 3 + 1]);
    if (ring.length >= 6) rings.push(ring);
    start += count;
  }
  return rings;
}

/** Czy punkt (x, y) leży w wypełnieniu (reguła parzystości – otwory się nie liczą). */
export function fillContains(stroke, x, y) {
  let inside = false;
  for (const ring of fillRings(stroke)) {
    for (let index = 0, prev = ring.length - 2; index < ring.length; prev = index, index += 2) {
      const [ax, ay, bx, by] = [ring[prev], ring[prev + 1], ring[index], ring[index + 1]];
      if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    }
  }
  return inside;
}

/** Sprawdzone liczby punktów obrysów wypełnienia (suma – liczba punktów, każdy obrys – co najmniej 3) albo null. */
export function cleanRings(raw, total) {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  if (!raw.every((count) => Number.isInteger(count) && count >= 3)) return null;
  return raw.reduce((sum, count) => sum + count, 0) === total ? raw.slice() : null;
}
