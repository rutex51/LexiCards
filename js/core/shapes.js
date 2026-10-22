// Kształty geometryczne na rysunku (od 1.15) i liniuszek – bez przeglądarki: punkty kształtu,
// obrys (zaznaczanie, gumka, przyciąganie linijki), punkty konstrukcyjne i ich przesuwanie,
// sprawdzanie danych; liniuszek – najbliższa linia z rodziny równoległych linii, a od 1.22
// liniuszek promieniowy – najbliższy okrąg i promień. Od 1.17:
// wypełnienie, tekst na kształcie i wymiary wpisywane z klawiatury (szerokość, wysokość, kąt
// pochylenia; odcinek – długość i kąt).
//
// Kształt { tool: 'shape', shape, color, size, x, y, w, h, angle, skew, adjust, fill?, label? }:
//   shape – 'line' | 'arrow' | 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'trapezoid';
//   (x, y) – środek; w, h – szerokość i wysokość (odcinek i strzałka: w – długość, h = 0);
//   angle – obrót (radiany); skew – pochylenie: o ile górna krawędź jest przesunięta w prawo
//   względem dolnej, w stosunku do wysokości (tangens kąta pochylenia); size – grubość linii;
//   adjust – trójkąt: wierzchołek nad dolną krawędzią (0 – nad lewym rogiem, ½ – środek, 1 – nad
//   prawym), trapez: wcięcie górnej krawędzi z każdej strony (0 – prostokąt, do 0,45);
//   od 1.17 fill – 'light' (kolor kształtu, przejrzysty) albo 'solid' (pełny), brak – bez wypełnienia
//   (odcinek i strzałka go nie mają); label – tekst na kształcie { text, size, color, width, height }:
//   na środku kształtu (odcinek – nad linią), obrócony razem z nim, ale nigdy do góry nogami,
//   łamany do szerokości kształtu; width i height – zmierzone przy wpisaniu (granice, dotknięcie);
//   od 1.19 startCap, endCap – zakończenia odcinka i strzałki (SEGMENT_CAPS; zapisane tylko, gdy inne
//   niż domyślne: odcinek – bez, strzałka – grot na końcu), dims – wymiary widoczne na rysunku na stałe
//   (['width', 'height', 'skew'] albo odcinek ['length', 'angle']); od 1.22.1 rysowane jak w rysunku
//   technicznym – dimOffsets { klucz: odsunięcie linii wymiarowej albo promień łuku } i dimTols
//   { klucz: { prefix?, kind?: 'sym' | 'dev' | 'fit', value?, upper?, lower?, fit? } } (znak i tolerancja).
//   Od 1.24 łamana 'polyline' i wielokąt 'polygon' (z rozpoznanego odręcznego kształtu): nodes – wierzchołki
//   [u, v, u, v, …] w układzie własnym (od −½ do ½ szerokości i wysokości ramki), więc przesuwanie,
//   obrót i zmiana wielkości działają jak przy innych kształtach; bez pochylenia, łamana – bez wypełnienia.
//   Od 1.27: dash – rodzaj linii kształtu (SHAPE_DASHES: przerywana, osiowa – kreska-kropka, dwupunktowa,
//   kropkowa; brak – ciągła); 'xline' – prosta przez dwa punkty (jak odcinek, ale rysowana przez całą
//   stronę); 'curve' – strzałka po łuku: cztery wierzchołki w nodes (początek, dwa punkty pośrednie,
//   koniec) – krzywa Béziera przechodząca przez wszystkie cztery, z zakończeniami jak odcinek (domyślnie
//   grot na końcu); 'point' – punkt (znacznik mark: POINT_MARKS) o średnicy w (w = h).
//   Od 1.34: 'arc' – łuk okręgu przez trzy wierzchołki w nodes (początek, punkt na łuku, koniec);
//   'dim' – wymiar narzędzia „Wymiar” (jak odcinek między mierzonymi punktami, ale rysowany sam
//   wymiar 'length'): mode 'linear' (linia wymiarowa z liniami pomocniczymi, odsunięcie ze znakiem –
//   strona), 'diameter' (linia przez środek okręgu, ⌀), 'radius' (od środka do okręgu, R);
//   'angledim' – wymiar kąta: nodes – wierzchołek i po punkcie na każdym ramieniu.

export const SHAPES = Object.freeze(['line', 'arrow', 'rect', 'ellipse', 'triangle', 'diamond', 'trapezoid', 'xline', 'curve', 'point', 'arc', 'dim']);
export const SHAPE_LABELS = Object.freeze({
  line: 'Odcinek', arrow: 'Strzałka', rect: 'Prostokąt', ellipse: 'Elipsa', triangle: 'Trójkąt', diamond: 'Romb', trapezoid: 'Trapez',
  xline: 'Prosta', curve: 'Strzałka po łuku', point: 'Punkt', polyline: 'Łamana', polygon: 'Wielokąt', arc: 'Łuk', dim: 'Wymiar', angledim: 'Wymiar kąta'
});
/** Kształty z wierzchołkami (od 1.24) – tylko z rozpoznania odręcznego kształtu, nie z panelu kształtów. */
export const POLY_SHAPES = Object.freeze(['polyline', 'polygon']);
/** Z wierzchołkami w nodes: łamana, wielokąt, (od 1.27) strzałka po łuku, (od 1.34) łuk i wymiar kąta. */
export const isPoly = (shape) => ['polyline', 'polygon', 'curve', 'arc', 'angledim'].includes(shape.shape);
/** Najwięcej wierzchołków łamanej i wielokąta. */
export const POLY_NODES_MAX = 24;
/** Kształty z dwoma końcami (bez wysokości); od 1.27 także prosta, od 1.34 wymiar (mierzone punkty). */
export const isSegment = (shape) => shape.shape === 'line' || shape.shape === 'arrow' || shape.shape === 'xline' || shape.shape === 'dim';
export const isXline = (shape) => shape.shape === 'xline';
export const isCurve = (shape) => shape.shape === 'curve';
export const isPointShape = (shape) => shape.shape === 'point';
export const isArc = (shape) => shape.shape === 'arc';
/** Wymiar narzędzia „Wymiar” (od 1.34): liniowy, średnica, promień ('dim') albo kąt ('angledim') – rysowany sam wymiar. */
export const isMeasure = (shape) => shape.shape === 'dim' || shape.shape === 'angledim';
/** Rodzaje wymiaru 'dim' i kąt (wybór pod menu przy narzędziu „Wymiar”). */
export const DIM_MODES = Object.freeze(['linear', 'diameter', 'radius', 'angle']);
export const DIM_MODE_LABELS = Object.freeze({ linear: 'Liniowy', diameter: 'Średnica ⌀', radius: 'Promień R', angle: 'Kąt' });
export const dimMode = (shape) => (shape.mode === 'diameter' || shape.mode === 'radius' ? shape.mode : 'linear');
/** Sposób rysowania okręgu i elipsy (od 1.34): ramka, środek i promień, dwa punkty (średnica), trzy punkty. */
export const ELLIPSE_MODES = Object.freeze(['frame', 'center', 'two', 'three']);
export const ELLIPSE_MODE_LABELS = Object.freeze({ frame: 'Ramka', center: 'Środek i promień', two: '2 punkty', three: '3 punkty' });
/** Kształty z zakończeniami (grot, trójkąt…): odcinek, strzałka i (od 1.27) strzałka po łuku – prosta ich nie ma. */
export const hasCaps = (shape) => shape.shape === 'line' || shape.shape === 'arrow' || shape.shape === 'curve';
export const isShape = (stroke) => stroke?.tool === 'shape';
export const SKEW_LIMIT = 2.5;
export const MIN_SHAPE = 4;
/** Krok kąta z Shift (od 1.19): odcinek, koniec odcinka i obrót – co 15°. */
const LOCK_STEP = Math.PI / 12;
const DEFAULT_ADJUST = { triangle: 0.5, trapezoid: 0.25 };
/** Wypełnienie kształtu (od 1.17): brak, jasne (kolor kształtu, przejrzysty) albo pełne. */
export const SHAPE_FILLS = Object.freeze(['none', 'light', 'solid']);
export const SHAPE_FILL_LABELS = Object.freeze({ none: 'Brak', light: 'Jasne', solid: 'Pełne' });
export const FILL_ALPHA = Object.freeze({ light: 0.22, solid: 1 });
export const canFill = (shape) => !isSegment(shape) && !['polyline', 'curve', 'point', 'arc', 'angledim'].includes(shape.shape);

// ---------------------------------------------------------------- rodzaj linii i punkt (od 1.27)

/** Rodzaj linii kształtu: ciągła, przerywana, osiowa (kreska-kropka), dwupunktowa (kreska-dwie kropki), kropkowa. */
export const SHAPE_DASHES = Object.freeze(['solid', 'dashed', 'center', 'phantom', 'dotted']);
export const SHAPE_DASH_LABELS = Object.freeze({ solid: 'Ciągła', dashed: 'Przerywana', center: 'Osiowa', phantom: 'Dwupunktowa', dotted: 'Kropkowa' });
/** Punkt nie ma linii. */
export const canDash = (shape) => shape.shape !== 'point' && !isMeasure(shape);
/** Rodzaj linii kształtu (brak albo nieznany – ciągła). */
export const shapeDash = (shape) => (canDash(shape) && SHAPE_DASHES.includes(shape.dash) ? shape.dash : 'solid');

/**
 * Wzór kresek do setLineDash (jednostki strony) – od grubości linii. Linia ma zaokrąglone końce, więc
 * kreska jest dłuższa o grubość, a przerwa krótsza; kropka to kreska prawie zerowej długości.
 */
export function dashPattern(shape) {
  const unit = Math.max(1.5, shape.size);
  const dot = 0.001;
  switch (shapeDash(shape)) {
    case 'dashed': return [unit * 4, unit * 4];
    case 'center': return [unit * 12, unit * 4, dot, unit * 4];
    case 'phantom': return [unit * 12, unit * 4, dot, unit * 4, dot, unit * 4];
    case 'dotted': return [dot, unit * 3];
    default: return [];
  }
}

/** Kształt z rodzajem linii – nowy obiekt; ciągła – bez pola. */
export function withDash(shape, dash) {
  const next = { ...shape };
  delete next.dash;
  if (canDash(shape) && SHAPE_DASHES.includes(dash) && dash !== 'solid') next.dash = dash;
  return next;
}

/** Znacznik punktu: punkt symetrii (kółko z krzyżykiem), kropka, krzyżyk ×, środek +. */
export const POINT_MARKS = Object.freeze(['center', 'dot', 'cross', 'plus']);
export const POINT_MARK_LABELS = Object.freeze({ center: 'Punkt symetrii', dot: 'Kropka', cross: 'Krzyżyk', plus: 'Środek' });
export const pointMark = (shape) => (POINT_MARKS.includes(shape.mark) ? shape.mark : 'center');
/** Średnica znacznika punktu z grubości linii. */
export const pointDiameter = (size) => clamp(Math.round(size * 7), 16, 60);

/**
 * Znacznik punktu w punktach strony: { lines: [[a, b], …], ring?: { x, y, r }, dot?: { x, y, r } } –
 * obrócony z kształtem.
 */
export function pointMarkGeometry(shape) {
  const half = shape.w / 2;
  const center = { x: shape.x, y: shape.y };
  const along = (u, v) => shapePoint({ ...shape, skew: 0 }, u, v);
  const plus = [[along(-0.5, 0), along(0.5, 0)], [along(0, -0.5), along(0, 0.5)]];
  const k = 0.5 * Math.SQRT1_2;
  switch (pointMark(shape)) {
    case 'dot': return { lines: [], dot: { ...center, r: Math.max(shape.size * 1.2, half * 0.36) } };
    case 'cross': return { lines: [[along(-k, -k), along(k, k)], [along(-k, k), along(k, -k)]] };
    case 'plus': return { lines: plus };
    default: return { lines: plus, ring: { ...center, r: half * 0.62 } };
  }
}

// ---------------------------------------------------------------- strzałka po łuku (od 1.27)

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Krzywa łuku: [P0, C1, C2, P3] – krzywa Béziera od pierwszego do ostatniego wierzchołka, która
 * przechodzi przez dwa punkty pośrednie (w t = ⅓ i ⅔): 12·C1 + 6·C2 = 27·P1 − 8·P0 − P3,
 * 6·C1 + 12·C2 = 27·P2 − P0 − 8·P3.
 */
export function curveControls(shape) {
  const [p0, p1, p2, p3] = polyPoints(shape);
  const a = { x: 27 * p1.x - 8 * p0.x - p3.x, y: 27 * p1.y - 8 * p0.y - p3.y };
  const b = { x: 27 * p2.x - p0.x - 8 * p3.x, y: 27 * p2.y - p0.y - 8 * p3.y };
  return [p0, { x: (2 * a.x - b.x) / 18, y: (2 * a.y - b.y) / 18 }, { x: (2 * b.x - a.x) / 18, y: (2 * b.y - a.y) / 18 }, p3];
}

/** Punkt krzywej Béziera [P0, C1, C2, P3] w t. */
export function bezierPoint([p0, c1, c2, p3], t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y
  };
}

/** Fragment krzywej od t0 do t1 (de Casteljau) – [P0, C1, C2, P3]. */
function bezierPart(curve, t0, t1) {
  const split = ([p0, c1, c2, p3], t) => {
    const [a, b, c] = [lerp(p0, c1, t), lerp(c1, c2, t), lerp(c2, p3, t)];
    const [d, e] = [lerp(a, b, t), lerp(b, c, t)];
    const f = lerp(d, e, t);
    return [[p0, a, d, f], [f, e, c, p3]];
  };
  const right = t0 > 0 ? split(curve, t0)[1] : curve;
  return t1 < 1 ? split(right, (t1 - t0) / (1 - t0))[0] : right;
}

/** Parametr t, w którym krzywa jest `distance` od swojego końca `which` (do przycięcia pod trójkątem). */
function bezierTrim(curve, which, distance) {
  const tip = which === 'end' ? curve[3] : curve[0];
  let [low, high] = which === 'end' ? [0.5, 1] : [0, 0.5];
  for (let step = 0; step < 30; step += 1) {
    const middle = (low + high) / 2;
    const point = bezierPoint(curve, middle);
    const far = Math.hypot(point.x - tip.x, point.y - tip.y) > distance;
    if ((which === 'end') === far) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Punkty krzywej łuku (obrys do zaznaczania, gumki i granic). */
export function curveSamples(shape, count = 32) {
  const curve = curveControls(shape);
  return Array.from({ length: count + 1 }, (_, index) => bezierPoint(curve, index / count));
}

/**
 * Nowa strzałka po łuku z przeciągnięcia od `from` do `to`: punkty pośrednie w ⅓ i ⅔ cięciwy,
 * odsunięte w górę (na lewo od kierunku przeciągnięcia) o ⅕ jej długości – łuk; dotknięcie – łuk
 * domyślnej długości w prawo.
 */
function curveFromDrag(from, to, style, defaultSize, tap) {
  let end = to;
  if (Math.hypot(to.x - from.x, to.y - from.y) < tap) end = { x: from.x + defaultSize, y: from.y };
  const [dx, dy] = [end.x - from.x, end.y - from.y];
  const length = Math.hypot(dx, dy) || 1;
  const lift = { x: (dy / length) * length * 0.2, y: (-dx / length) * length * 0.2 };
  const points = [from, { x: from.x + dx / 3 + lift.x, y: from.y + dy / 3 + lift.y }, { x: from.x + (2 * dx) / 3 + lift.x, y: from.y + (2 * dy) / 3 + lift.y }, end];
  const frame = { x: (from.x + end.x) / 2, y: (from.y + end.y) / 2, angle: Math.atan2(dy, dx) };
  return polyFromPoints('curve', points, frame, style);
}
// ---------------------------------------------------------------- okrąg z punktów i łuk (od 1.34)

const TAU = Math.PI * 2;
/** Kąt od `from` do `to` w kierunku rosnących kątów: [0, 2π). */
const forward = (from, to) => (((to - from) % TAU) + TAU) % TAU;

/**
 * Okrąg przez trzy punkty: { x, y, r } albo null, gdy punkty leżą (prawie) na jednej prostej albo
 * się pokrywają (okrąg byłby ogromny albo nie istnieje).
 */
export function circleThrough(a, b, c) {
  const span = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - b.x, c.y - b.y), Math.hypot(c.x - a.x, c.y - a.y));
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (span < 1 || Math.abs(cross) / span < Math.max(0.5, span * 0.004)) return null;
  const d = 2 * cross;
  const [aa, bb, cc] = [a.x * a.x + a.y * a.y, b.x * b.x + b.y * b.y, c.x * c.x + c.y * c.y];
  const x = (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d;
  const y = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

/** Okrąg (elipsa o równych bokach) o środku `center` i promieniu `radius` w stylu `style`. */
export function circleShape(center, radius, style) {
  const diameter = round(Math.max(MIN_SHAPE, radius * 2));
  const shape = { tool: 'shape', shape: 'ellipse', color: style.color, size: style.size, x: round(center.x), y: round(center.y), w: diameter, h: diameter, angle: 0, skew: 0, adjust: 0 };
  if (style.fill === 'light' || style.fill === 'solid') shape.fill = style.fill;
  return withDash(shape, style.dash);
}

/** Okrąg przez trzy punkty strony albo null (punkty na jednej prostej). */
export function circleFromPoints(a, b, c, style) {
  const circle = circleThrough(a, b, c);
  return circle ? circleShape(circle, circle.r, style) : null;
}

/**
 * Łuk: { center, radius, start, sweep } – od wierzchołka początku do końca (kąty strony, radiany),
 * przez punkt pośredni; null, gdy trzy punkty leżą na jednej prostej (wtedy rysowany jest odcinek).
 */
export function arcGeometry(shape) {
  const [start, through, end] = polyPoints(shape);
  const circle = circleThrough(start, through, end);
  if (!circle) return null;
  const angle = (point) => Math.atan2(point.y - circle.y, point.x - circle.x);
  const [a0, a1, a2] = [angle(start), angle(through), angle(end)];
  let sweep = forward(a0, a2);
  if (forward(a0, a1) > sweep) sweep -= TAU;
  return { center: { x: circle.x, y: circle.y }, radius: circle.r, start: a0, sweep };
}

/** Punkty łuku (obrys do zaznaczania, gumki i granic); łuk bez krzywizny – początek i koniec. */
export function arcSamples(shape, count = 48) {
  const geometry = arcGeometry(shape);
  if (!geometry) {
    const points = polyPoints(shape);
    return [points[0], points[2]];
  }
  const { center, radius, start, sweep } = geometry;
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = start + (sweep * index) / count;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

/** Łuk okręgu jako krzywe Béziera (co najwyżej ćwierć okręgu na krzywą): [[C1, C2, P], …] od punktu początku. */
export function arcBeziers(center, radius, start, sweep) {
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const step = sweep / count;
  const k = (4 / 3) * Math.tan(step / 4);
  const at = (angle) => ({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  return Array.from({ length: count }, (_, index) => {
    const [a, b] = [start + step * index, start + step * (index + 1)];
    const [p, q] = [at(a), at(b)];
    return [
      { x: p.x - Math.sin(a) * radius * k, y: p.y + Math.cos(a) * radius * k },
      { x: q.x + Math.sin(b) * radius * k, y: q.y - Math.cos(b) * radius * k },
      q
    ];
  });
}

/**
 * Nowy łuk przez trzy punkty strony: od `start` do `end` przez `through` (punkt pośredni zapisany
 * w połowie łuku – tam jest jego uchwyt); null, gdy punkty leżą na jednej prostej.
 */
export function arcFromPoints(start, end, through, style) {
  const circle = circleThrough(start, through, end);
  if (!circle) return null;
  const angle = (point) => Math.atan2(point.y - circle.y, point.x - circle.x);
  let sweep = forward(angle(start), angle(end));
  if (forward(angle(start), angle(through)) > sweep) sweep -= TAU;
  const middle = angle(start) + sweep / 2;
  const mid = { x: circle.x + Math.cos(middle) * circle.r, y: circle.y + Math.sin(middle) * circle.r };
  const frame = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, angle: Math.atan2(end.y - start.y, end.x - start.x) };
  return withDash(polyFromPoints('arc', [start, mid, end], frame, style), style.dash);
}

// ---------------------------------------------------------------- narzędzie „Wymiar” (od 1.34)

/**
 * Wymiar między punktami `a` i `b`: liniowy (odsunięcie ze znakiem – strona linii wymiarowej),
 * średnica (⌀, linia wymiarowa na punktach) albo promień (R, od środka `a` do okręgu `b`).
 */
export function dimFromPoints(mode, a, b, style, offset = DIM_OFFSET) {
  const shape = {
    tool: 'shape', shape: 'dim', color: style.color, size: style.size,
    x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2), w: round(Math.max(MIN_SHAPE, Math.hypot(b.x - a.x, b.y - a.y))), h: 0,
    angle: Math.atan2(b.y - a.y, b.x - a.x), skew: 0, adjust: 0, dims: ['length']
  };
  if (mode === 'diameter' || mode === 'radius') {
    shape.mode = mode;
    shape.dimTols = { length: { prefix: mode === 'diameter' ? '⌀' : 'R' } };
  } else {
    shape.dimOffsets = { length: clampSigned(offset) };
  }
  return shape;
}

/** Odsunięcie ze znakiem: wielkość w granicach DIM_OFFSET_LIMITS, znak zostaje (zero – dodatnie). */
function clampSigned(value) {
  const sign = value < 0 ? -1 : 1;
  return sign * clamp(Math.round(Math.abs(value)), DIM_OFFSET_LIMITS.min, DIM_OFFSET_LIMITS.max);
}

/** Wymiar liniowy z linią wymiarową po stronie dalszej od punktu `point` (np. środka mierzonego kształtu). */
export function dimAwayFrom(shape, point) {
  const offset = Math.abs(dimOffset(shape, 'length'));
  const up = [Math.sin(shape.angle), -Math.cos(shape.angle)];
  const facing = (shape.x - point.x) * up[0] + (shape.y - point.y) * up[1];
  return { ...shape, dimOffsets: { ...(shape.dimOffsets ?? {}), length: facing < -1e-6 ? -offset : offset } };
}

/** Wymiar kąta: wierzchołek i po punkcie na każdym ramieniu (punkty strony); null – ramię bez długości. */
export function angleDimFromPoints(vertex, a, b, style) {
  if (Math.hypot(a.x - vertex.x, a.y - vertex.y) < 2 || Math.hypot(b.x - vertex.x, b.y - vertex.y) < 2) return null;
  const frame = { x: vertex.x, y: vertex.y, angle: 0 };
  return { ...polyFromPoints('angledim', [vertex, a, b], frame, style), dims: ['angle'] };
}

/** Kąt wymiaru kąta (od 1.34): { vertex, start, sweep, arms } – mniejszy z kątów między ramionami (do 180°). */
export function angleDimArms(shape) {
  const [vertex, a, b] = polyPoints(shape);
  const start = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  let sweep = Math.atan2(b.y - vertex.y, b.x - vertex.x) - start;
  sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep));
  return { vertex, start, sweep, arms: [Math.hypot(a.x - vertex.x, a.y - vertex.y), Math.hypot(b.x - vertex.x, b.y - vertex.y)] };
}

/** Wartość wymiaru kąta w stopniach. */
export const angleDimDegrees = (shape) => (Math.abs(angleDimArms(shape).sweep) * 180) / Math.PI;

/** Najdłuższy tekst na kształcie. */
export const LABEL_TEXT_MAX = 500;
/** Największy kąt pochylenia wpisywany z klawiatury (stopnie) – odpowiada SKEW_LIMIT. */
export const SKEW_DEGREES_LIMIT = Math.floor((Math.atan(SKEW_LIMIT) * 180) / Math.PI);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const round = (value) => Math.round(value * 100) / 100;

/** Punkt kształtu z układu własnego (u, v od −½ do ½ szerokości i wysokości) na stronie. */
export function shapePoint(shape, u, v) {
  const lx = u * shape.w - shape.skew * v * shape.h;
  const ly = v * shape.h;
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  return { x: shape.x + lx * cos - ly * sin, y: shape.y + lx * sin + ly * cos };
}

/** Punkt strony w układzie kształtu bez pochylenia: { lx, ly } względem środka, osie obrócone z kształtem. */
export function toShapeFrame(shape, x, y) {
  const [dx, dy] = [x - shape.x, y - shape.y];
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  return { lx: dx * cos + dy * sin, ly: -dx * sin + dy * cos };
}

/** Wierzchołki wielokąta kształtu w układzie własnym (u, v). */
function polygonOf(shape) {
  switch (shape.shape) {
    case 'rect': return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    case 'diamond': return [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]];
    case 'triangle': return [[shape.adjust - 0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    case 'trapezoid': return [[-0.5 + shape.adjust, -0.5], [0.5 - shape.adjust, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    case 'polyline':
    case 'polygon': return nodePairs(shape);
    default: return null;
  }
}

/** Wierzchołki łamanej albo wielokąta: [[u, v], …]. */
const nodePairs = (shape) => Array.from({ length: shape.nodes.length / 2 }, (_, index) => [shape.nodes[index * 2], shape.nodes[index * 2 + 1]]);

// ---------------------------------------------------------------- zakończenia odcinka (od 1.19)

/** Zakończenia odcinka i strzałki: brak, grot strzałki, trójkąt, koło, kwadrat, romb. */
export const SEGMENT_CAPS = Object.freeze(['none', 'arrow', 'triangle', 'circle', 'square', 'diamond']);
export const SEGMENT_CAP_LABELS = Object.freeze({ none: 'Brak', arrow: 'Grot', triangle: 'Trójkąt', circle: 'Koło', square: 'Kwadrat', diamond: 'Romb' });

/**
 * Zakończenia { start, end }: zapisane albo domyślne – odcinek bez, strzałka i (od 1.27) strzałka po łuku
 * z grotem na końcu (jak do 1.18); prosta – bez zakończeń.
 */
export function segmentCaps(shape) {
  if (shape.shape === 'xline') return { start: 'none', end: 'none' };
  const pick = (value, fallback) => (SEGMENT_CAPS.includes(value) ? value : fallback);
  return { start: pick(shape.startCap, 'none'), end: pick(shape.endCap, shape.shape === 'arrow' || shape.shape === 'curve' ? 'arrow' : 'none') };
}

/** Odcinek z zakończeniami { start, end } – nowy obiekt; zapisane tylko te, które są inne niż domyślne. */
export function withCaps(shape, caps) {
  const next = { ...shape };
  delete next.startCap;
  delete next.endCap;
  if (!hasCaps(shape)) return next;
  const fallback = segmentCaps(next);
  if (SEGMENT_CAPS.includes(caps.start) && caps.start !== fallback.start) next.startCap = caps.start;
  if (SEGMENT_CAPS.includes(caps.end) && caps.end !== fallback.end) next.endCap = caps.end;
  return next;
}

/** Wielkość zakończenia – jak grot strzałki: od grubości linii, najwyżej część długości odcinka (przy dwóch – mniejsza). */
function capLength(shape, caps, span) {
  const both = caps.start !== 'none' && caps.end !== 'none';
  return Math.min(Math.max(14, shape.size * 4), span * (both ? 0.4 : 0.6));
}

/**
 * Koniec `which` kształtu z zakończeniami: { tip, ux, uy, span } – punkt końca, kierunek na zewnątrz
 * i długość (odcinek – długość, łuk – cięciwa). Od 1.27 łuk: kierunek stycznej w końcu krzywej.
 */
function capFrame(shape, which) {
  if (isCurve(shape)) {
    const curve = curveControls(shape);
    const nodes = polyPoints(shape);
    const [tip, toward, fallback] = which === 'end' ? [curve[3], curve[2], nodes[2]] : [curve[0], curve[1], nodes[1]];
    let [dx, dy] = [tip.x - toward.x, tip.y - toward.y];
    if (Math.hypot(dx, dy) < 1e-6) [dx, dy] = [tip.x - fallback.x, tip.y - fallback.y];
    const length = Math.hypot(dx, dy) || 1;
    return { tip, ux: dx / length, uy: dy / length, span: Math.hypot(curve[3].x - curve[0].x, curve[3].y - curve[0].y) };
  }
  const sign = which === 'end' ? 1 : -1;
  return { tip: shapePoint(shape, which === 'end' ? 0.5 : -0.5, 0), ux: Math.cos(shape.angle) * sign, uy: Math.sin(shape.angle) * sign, span: Math.abs(shape.w) };
}

/**
 * Zakończenie odcinka na końcu `which` ('start' albo 'end'): { kind, tip, trim, arms?, polygon?, circle? }
 * w punktach strony. tip – koniec odcinka, trim – miejsce, w którym kończy się linia (trójkąt – pod
 * podstawą, żeby linia nie wystawała za ostrze), arms – ramiona grotu, polygon – wypełniony trójkąt,
 * kwadrat albo romb, circle – wypełnione koło { x, y, r }. Koło, kwadrat i romb mają środek na końcu odcinka.
 */
export function segmentCap(shape, which) {
  const caps = segmentCaps(shape);
  const kind = caps[which];
  // u – na zewnątrz odcinka, n – w poprzek.
  const { tip, ux, uy, span } = capFrame(shape, which);
  if (kind === 'none') return { kind, tip, trim: tip };
  const [nx, ny] = [-uy, ux];
  const length = capLength(shape, caps, span);
  const at = (along, across) => ({ x: tip.x + ux * along + nx * across, y: tip.y + uy * along + ny * across });
  switch (kind) {
    case 'arrow': {
      const [cos, sin] = [Math.cos(Math.PI / 7), Math.sin(Math.PI / 7)];
      return { kind, tip, trim: tip, arms: [at(-cos * length, -sin * length), at(-cos * length, sin * length)] };
    }
    case 'triangle':
      return { kind, tip, trim: at(-length * 0.75, 0), polygon: [tip, at(-length, length * 0.42), at(-length, -length * 0.42)] };
    case 'circle':
      return { kind, tip, trim: tip, circle: { ...tip, r: Math.max(shape.size * 1.2, length * 0.32) } };
    case 'square': {
      const half = Math.max(shape.size * 1.1, length * 0.3);
      return { kind, tip, trim: tip, polygon: [at(half, half), at(half, -half), at(-half, -half), at(-half, half)] };
    }
    default:
      return { kind, tip, trim: tip, polygon: [at(length * 0.45, 0), at(0, length * 0.3), at(-length * 0.45, 0), at(0, -length * 0.3)] };
  }
}

/** Grot strzałki: dwa ramiona przy końcu odcinka (punkty strony); od 1.19 – zakończenie „Grot” na końcu `which`. */
export const arrowHead = (shape, which = 'end') => segmentCap(shape, which).arms ?? [];

/** Zakończenia odcinka (bez „brak”). */
export const segmentCapList = (shape) => (hasCaps(shape) ? ['start', 'end'].map((which) => segmentCap(shape, which)).filter((cap) => cap.kind !== 'none') : []);

/** Skrajne punkty zakończeń odcinka – granice i zaznaczanie. */
export function capPoints(shape) {
  const points = [];
  for (const cap of segmentCapList(shape)) {
    if (cap.arms) points.push(...cap.arms);
    if (cap.polygon) points.push(...cap.polygon);
    if (cap.circle) {
      const { x, y, r } = cap.circle;
      points.push({ x: x - r, y: y - r }, { x: x + r, y: y - r }, { x: x + r, y: y + r }, { x: x - r, y: y + r });
    }
  }
  return points;
}

/**
 * Obrys kształtu jako łamana punktów strony { points: [x, y, …], closed } – do zaznaczania, gumki
 * i przyciągania linijki. Elipsa – 48 punktów (rysowana dokładnie krzywymi Béziera).
 */
/** Jak daleko za swoje punkty sięga prosta (od 1.27) – poza każdą stronę; na płótnie i tak przycięta. */
export const XLINE_REACH = 20000;

export function shapeOutline(shape) {
  if (isXline(shape)) {
    const [a, b] = [shapePoint(shape, -0.5, 0), shapePoint(shape, 0.5, 0)];
    const [ux, uy] = [Math.cos(shape.angle), Math.sin(shape.angle)];
    return { points: [a.x - ux * XLINE_REACH, a.y - uy * XLINE_REACH, b.x + ux * XLINE_REACH, b.y + uy * XLINE_REACH], closed: false };
  }
  if (isCurve(shape)) return { points: curveSamples(shape).flatMap((point) => [point.x, point.y]), closed: false };
  if (isArc(shape)) return { points: arcSamples(shape).flatMap((point) => [point.x, point.y]), closed: false };
  // Wymiar (od 1.34): linia wymiarowa albo łuk kąta – to, co widać (mierzone punkty leżą na innych kształtach).
  if (isMeasure(shape)) return { points: measureLine(shape).flatMap((point) => [point.x, point.y]), closed: false };
  if (isPointShape(shape)) {
    const points = [];
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2;
      points.push(shape.x + Math.cos(angle) * shape.w / 2, shape.y + Math.sin(angle) * shape.w / 2);
    }
    return { points, closed: true };
  }
  if (isSegment(shape)) {
    const [a, b] = [shapePoint(shape, -0.5, 0), shapePoint(shape, 0.5, 0)];
    return { points: [a.x, a.y, b.x, b.y], closed: false };
  }
  const corners = shape.shape === 'ellipse'
    ? Array.from({ length: 48 }, (_, index) => [0.5 * Math.cos((index / 48) * Math.PI * 2), 0.5 * Math.sin((index / 48) * Math.PI * 2)])
    : polygonOf(shape);
  const points = [];
  for (const [u, v] of corners) {
    const point = shapePoint(shape, u, v);
    points.push(point.x, point.y);
  }
  return { points, closed: shape.shape !== 'polyline' };
}

/** Ścieżka do narysowania: łamane i krzywe Béziera w punktach strony (elipsa – obraz okręgu przez przekształcenie kształtu). */
export function shapePath(shape) {
  if (shape.shape === 'ellipse') {
    // Okrąg o promieniu ½ z czterech krzywych; przekształcenie afiniczne zachowuje krzywe Béziera.
    const k = 0.5 * 0.5522847498;
    const quarter = [
      [[0.5, k], [k, 0.5], [0, 0.5]], [[-k, 0.5], [-0.5, k], [-0.5, 0]],
      [[-0.5, -k], [-k, -0.5], [0, -0.5]], [[k, -0.5], [0.5, -k], [0.5, 0]]
    ];
    const start = shapePoint(shape, 0.5, 0);
    return {
      start, closed: true, caps: [],
      curves: quarter.map((curve) => curve.map(([u, v]) => shapePoint(shape, u, v)))
    };
  }
  if (isCurve(shape)) {
    // Od 1.27: krzywa łuku (przy trójkącie – przycięta pod jego podstawą) i zakończenia.
    const curve = curveControls(shape);
    const [start, end] = [segmentCap(shape, 'start'), segmentCap(shape, 'end')];
    const cut = (cap, which) => (cap.trim === cap.tip ? (which === 'end' ? 1 : 0)
      : bezierTrim(curve, which, Math.hypot(cap.trim.x - cap.tip.x, cap.trim.y - cap.tip.y)));
    const part = bezierPart(curve, cut(start, 'start'), cut(end, 'end'));
    return { start: part[0], curves: [part.slice(1)], closed: false, caps: [start, end].filter((cap) => cap.kind !== 'none') };
  }
  if (isArc(shape)) {
    // Od 1.34: łuk okręgu krzywymi Béziera; bez krzywizny – odcinek.
    const geometry = arcGeometry(shape);
    const points = polyPoints(shape);
    if (!geometry) return { start: points[0], lines: [points[2]], closed: false, caps: [] };
    return { start: points[0], curves: arcBeziers(geometry.center, geometry.radius, geometry.start, geometry.sweep), closed: false, caps: [] };
  }
  if (isXline(shape) || isPointShape(shape)) {
    const { points, closed } = shapeOutline(shape);
    return { start: { x: points[0], y: points[1] }, lines: [{ x: points[2], y: points[3] }], closed, caps: [] };
  }
  if (isSegment(shape)) {
    // Od 1.19: linia między zakończeniami (przy trójkącie – do jego podstawy) i same zakończenia.
    const [start, end] = [segmentCap(shape, 'start'), segmentCap(shape, 'end')];
    return { start: start.trim, lines: [end.trim], closed: false, caps: [start, end].filter((cap) => cap.kind !== 'none') };
  }
  const { points, closed } = shapeOutline(shape);
  const lines = [];
  for (let index = 2; index < points.length; index += 2) lines.push({ x: points[index], y: points[index + 1] });
  return { start: { x: points[0], y: points[1] }, lines, closed, caps: [] };
}

/** Granice kształtu razem z grubością linii, zakończeniami odcinka, tekstem i (od 1.19) stałymi wymiarami. */
export function shapeBounds(shape) {
  // Prosta (od 1.27) – granice jej dwóch punktów (zaznaczenie prostokątem, ramka), nie całej linii.
  const { points } = isXline(shape) ? { points: [shapePoint(shape, -0.5, 0), shapePoint(shape, 0.5, 0)].flatMap((point) => [point.x, point.y]) } : shapeOutline(shape);
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  const half = shape.size / 2;
  for (const point of [...capPoints(shape), ...labelCorners(shape), ...dimCorners(shape)]) {
    xs.push(point.x);
    ys.push(point.y);
  }
  return { minX: Math.min(...xs) - half, minY: Math.min(...ys) - half, maxX: Math.max(...xs) + half, maxY: Math.max(...ys) + half };
}

// ---------------------------------------------------------------- tekst na kształcie (od 1.17)

/** Najszerszy wiersz tekstu na kształcie (czcionka `size`): szerokość kształtu z marginesem, odcinek – jego długość. */
export function labelMaxWidth(shape, size) {
  return isSegment(shape) ? Math.max(size * 3, shape.w) : Math.max(size * 2, shape.w * 0.86 - shape.size);
}

/**
 * Środek, kąt i wielkość tekstu na kształcie: środek kształtu, a odcinka – nad środkiem linii.
 * Tekst obraca się z kształtem, ale nie leży do góry nogami (kąt czytelny: od −90° do 90°).
 */
export function labelFrame(shape) {
  const { label } = shape;
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  const flip = cos < -1e-9 || (Math.abs(cos) < 1e-9 && sin > 0);
  const angle = flip ? Math.atan2(-sin, -cos) : shape.angle;
  if (isPointShape(shape)) {
    // Punkt (od 1.27): tekst obok znacznika, w prawo i w górę.
    return { x: shape.x + shape.w / 2 + label.width / 2 + 4, y: shape.y - shape.w / 2 - label.height / 2, angle: 0, width: label.width, height: label.height };
  }
  if (!isSegment(shape)) return { x: shape.x, y: shape.y, angle, width: label.width, height: label.height };
  const lift = label.height / 2 + shape.size / 2 + label.size * 0.25;
  return { x: shape.x + Math.sin(angle) * lift, y: shape.y - Math.cos(angle) * lift, angle, width: label.width, height: label.height };
}

/** Narożniki prostokąta tekstu na kształcie (punkty strony); bez tekstu – brak. */
function labelCorners(shape) {
  if (!shape.label) return [];
  const frame = labelFrame(shape);
  const [cos, sin] = [Math.cos(frame.angle), Math.sin(frame.angle)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const [lx, ly] = [(a * frame.width) / 2, (b * frame.height) / 2];
    return { x: frame.x + lx * cos - ly * sin, y: frame.y + lx * sin + ly * cos };
  });
}

/** Czy koło (x, y, radius) dotyka tekstu na kształcie. */
function touchesLabel(shape, x, y, radius) {
  if (!shape.label) return false;
  const frame = labelFrame(shape);
  const [cos, sin] = [Math.cos(frame.angle), Math.sin(frame.angle)];
  const [dx, dy] = [x - frame.x, y - frame.y];
  return Math.abs(dx * cos + dy * sin) <= frame.width / 2 + radius && Math.abs(-dx * sin + dy * cos) <= frame.height / 2 + radius;
}

/** Odległość punktu od odcinka (a–b). */
function segmentDistance(px, py, ax, ay, bx, by) {
  const [dx, dy] = [bx - ax, by - ay];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / length, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * Czy koło (x, y, radius) dotyka linii kształtu albo tekstu na nim; wnętrze liczy się tylko
 * u kształtu wypełnionego (od 1.17).
 */
export function touchesShape(shape, x, y, radius) {
  if (isMeasure(shape)) return touchesMeasure(shape, x, y, radius);
  if (touchesLabel(shape, x, y, radius) || (shape.fill && shapeContains(shape, x, y))) return true;
  if (isPointShape(shape)) return Math.hypot(x - shape.x, y - shape.y) <= shape.w / 2 + radius;
  const { points, closed } = shapeOutline(shape);
  const reach = radius + shape.size / 2;
  const count = points.length / 2;
  for (let index = 1; index < count + (closed ? 1 : 0); index += 1) {
    const [a, b] = [index - 1, index % count];
    if (segmentDistance(x, y, points[a * 2], points[a * 2 + 1], points[b * 2], points[b * 2 + 1]) <= reach) return true;
  }
  return segmentCapList(shape).some((cap) => {
    if (cap.arms) return cap.arms.some((point) => segmentDistance(x, y, cap.tip.x, cap.tip.y, point.x, point.y) <= reach);
    if (cap.circle) return Math.hypot(x - cap.circle.x, y - cap.circle.y) <= cap.circle.r + reach;
    const flat = cap.polygon.flatMap((point) => [point.x, point.y]);
    return pointInPolygon(x, y, flat) || cap.polygon.some((point, index) => {
      const next = cap.polygon[(index + 1) % cap.polygon.length];
      return segmentDistance(x, y, point.x, point.y, next.x, next.y) <= reach;
    });
  });
}

/** Czy punkt leży wewnątrz wielokąta [x, y, x, y, …] (reguła parzystości). */
function pointInPolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 2; index < points.length; previous = index, index += 2) {
    const [xi, yi, xj, yj] = [points[index], points[index + 1], points[previous], points[previous + 1]];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Czy punkt leży wewnątrz kształtu (dotknięcie środka pustego prostokąta też go zaznacza). */
export function shapeContains(shape, x, y) {
  if (isPointShape(shape)) return Math.hypot(x - shape.x, y - shape.y) <= shape.w / 2;
  if (isSegment(shape) || ['polyline', 'curve', 'arc', 'angledim'].includes(shape.shape)) return false;
  const { points } = shapeOutline(shape);
  let inside = false;
  for (let index = 0, previous = points.length - 2; index < points.length; previous = index, index += 2) {
    const [xi, yi, xj, yj] = [points[index], points[index + 1], points[previous], points[previous + 1]];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Obrys kształtu jako kreska (punkty x, y, grubość) – dla przyciągania zera linijki. */
export function shapeAsStroke(shape) {
  const { points, closed } = shapeOutline(shape);
  const out = [];
  for (let index = 0; index < points.length; index += 2) out.push(points[index], points[index + 1], shape.size);
  if (closed) out.push(points[0], points[1], shape.size);
  return { tool: 'pen', color: shape.color, points: out };
}

/** Kształt przesunięty o (dx, dy) – nowy obiekt. */
export const translateShape = (shape, dx, dy) => ({ ...shape, x: round(shape.x + dx), y: round(shape.y + dy) });

/**
 * Nowy kształt z przeciągnięcia od punktu `from` do `to`: odcinek i strzałka od początku do końca
 * (kąt co 45° przyciągany do 3°), inne – w prostokącie przeciągnięcia (prawie równe boki – równe:
 * kwadrat, koło). Za krótkie przeciągnięcie (dotknięcie) – kształt domyślnej wielkości w tym miejscu.
 * Od 1.19 `lock` (Shift albo „Proporcje” w panelu) – równe boki (kwadrat, koło), odcinek co 15°;
 * style.caps – zakończenia nowego odcinka { start, end }.
 */
export function shapeFromDrag(kind, from, to, style, { defaultSize = 176, tap = 6, lock = false, mode = 'frame' } = {}) {
  const [dx, dy] = [to.x - from.x, to.y - from.y];
  // Od 1.27: punkt – w miejscu końca przeciągnięcia (dotknięcia), znacznik z panelu.
  if (kind === 'point') {
    const diameter = pointDiameter(style.size);
    return { tool: 'shape', shape: 'point', color: style.color, size: style.size, x: to.x, y: to.y, w: diameter, h: diameter, angle: 0, skew: 0, adjust: 0, mark: pointMark(style) };
  }
  if (kind === 'curve') return withDash(withCaps(curveFromDrag(from, to, style, defaultSize, tap), style.caps ?? {}), style.dash);
  // Od 1.34: okrąg ze środka i promienia albo z dwóch punktów (średnica); dotknięcie – okrąg w tym miejscu.
  if (kind === 'ellipse' && (mode === 'center' || mode === 'two')) {
    const length = Math.hypot(dx, dy);
    if (length < tap) return circleShape(from, defaultSize / 2, style);
    return mode === 'center' ? circleShape(from, length, style) : circleShape({ x: from.x + dx / 2, y: from.y + dy / 2 }, length / 2, style);
  }
  if (kind === 'dim') return dimFromPoints(style.mode, from, Math.hypot(dx, dy) < tap ? { x: from.x + defaultSize, y: from.y } : to, style, style.offset);
  if (kind === 'arc') {
    // Łuk z jednego przeciągnięcia (tylko podgląd i dotknięcie): połowa okręgu nad cięciwą.
    const end = Math.hypot(dx, dy) < tap ? { x: from.x + defaultSize, y: from.y } : to;
    const [ex, ey] = [end.x - from.x, end.y - from.y];
    const through = { x: from.x + ex / 2 + ey / 2, y: from.y + ey / 2 - ex / 2 };
    return arcFromPoints(from, end, through, style);
  }
  let base = { tool: 'shape', shape: kind, color: style.color, size: style.size, angle: 0, skew: 0, adjust: DEFAULT_ADJUST[kind] ?? 0 };
  if ((style.fill === 'light' || style.fill === 'solid') && canFill(base)) base.fill = style.fill;
  if (hasCaps(base) && style.caps) base = withCaps(base, style.caps);
  base = withDash(base, style.dash);
  if (Math.hypot(dx, dy) < tap) {
    return isSegment(base)
      ? { ...base, x: from.x, y: from.y, w: defaultSize, h: 0 }
      : { ...base, x: from.x, y: from.y, w: defaultSize, h: defaultSize * (kind === 'ellipse' || kind === 'diamond' || lock ? 1 : 0.75) };
  }
  if (isSegment(base)) {
    const raw = Math.atan2(dy, dx);
    const angle = lock ? snapAngle(raw, LOCK_STEP, LOCK_STEP) : snapAngle(raw, Math.PI / 4, (3 * Math.PI) / 180);
    const length = Math.hypot(dx, dy);
    return { ...base, x: from.x + (Math.cos(angle) * length) / 2, y: from.y + (Math.sin(angle) * length) / 2, w: length, h: 0, angle };
  }
  let [w, h] = [Math.max(MIN_SHAPE, Math.abs(dx)), Math.max(MIN_SHAPE, Math.abs(dy))];
  if (lock || Math.abs(w - h) <= Math.max(w, h) * 0.06) w = h = Math.max(w, h);
  // Bez ruchu w jednym kierunku (np. przeciągnięcie poziome z Shift) – kształt w dół i w prawo.
  const [sx, sy] = [Math.sign(dx) || 1, Math.sign(dy) || 1];
  return { ...base, x: from.x + (sx * w) / 2, y: from.y + (sy * h) / 2, w, h };
}

/** Kąt przyciągnięty do wielokrotności `step`, gdy jest od niej nie dalej niż `tolerance`. */
export function snapAngle(angle, step, tolerance) {
  const nearest = Math.round(angle / step) * step;
  return Math.abs(angle - nearest) <= tolerance ? nearest : angle;
}

/** Narożniki i środki boków ramki: [u, v] w układzie własnym. */
const FRAME_HANDLES = {
  nw: [-0.5, -0.5], n: [0, -0.5], ne: [0.5, -0.5], e: [0.5, 0], se: [0.5, 0.5], s: [0, 0.5], sw: [-0.5, 0.5], w: [-0.5, 0]
};
/** Miejsce uchwytu pochylenia na górnej krawędzi (u) – obok uchwytu wysokości. */
const SKEW_AT = 0.3;

/**
 * Punkty konstrukcyjne kształtu (uchwyty) w punktach strony: { id, kind, x, y }. Odcinek i strzałka –
 * dwa końce; inne – narożniki i środki boków (szerokość i wysokość), pochylenie na górnej krawędzi,
 * obrót nad kształtem (`rotateGap` – odległość w jednostkach strony), trójkąt i trapez – kształt.
 */
export function shapeHandles(shape, rotateGap) {
  // Punkt (od 1.27) – tylko przesuwanie.
  if (isPointShape(shape)) return [];
  // Wymiar kąta (od 1.34) – wierzchołek i ramiona.
  if (shape.shape === 'angledim') return nodePairs(shape).map(([u, v], index) => ({ id: `v${index}`, kind: 'vertex', ...shapePoint(shape, u, v) }));
  if (isSegment(shape)) {
    const [a, b] = [shapePoint(shape, -0.5, 0), shapePoint(shape, 0.5, 0)];
    return [{ id: 'start', kind: 'end', ...a }, { id: 'end', kind: 'end', ...b }];
  }
  // Łamana i wielokąt (od 1.24): narożniki ramki (wielkość), obrót i punkt w każdym wierzchołku.
  const poly = isPoly(shape);
  const handles = Object.entries(FRAME_HANDLES).filter(([id]) => !poly || id.length === 2)
    .map(([id, [u, v]]) => ({ id, kind: id.length === 2 ? 'corner' : 'edge', ...shapePoint(shape, u, v) }));
  if (poly) nodePairs(shape).forEach(([u, v], index) => handles.push({ id: `v${index}`, kind: 'vertex', ...shapePoint(shape, u, v) }));
  else handles.push({ id: 'skew', kind: 'skew', ...shapePoint(shape, SKEW_AT, -0.5) });
  if (shape.shape === 'triangle') handles.push({ id: 'adjust', kind: 'adjust', ...shapePoint(shape, shape.adjust - 0.5, -0.5) });
  if (shape.shape === 'trapezoid') handles.push({ id: 'adjust', kind: 'adjust', ...shapePoint(shape, -0.5 + shape.adjust, -0.5) });
  // Obrót – nad środkiem, na osi kształtu (przy pochyleniu też – przeciągnięcie nie skacze).
  const reach = shape.h / 2 + rotateGap;
  handles.push({ id: 'rotate', kind: 'rotate', x: shape.x + Math.sin(shape.angle) * reach, y: shape.y - Math.cos(shape.angle) * reach });
  return handles;
}

/** Punkt strony z układu kształtu bez pochylenia (lx, ly względem środka). */
function fromFrame(shape, lx, ly) {
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  return { x: shape.x + lx * cos - ly * sin, y: shape.y + lx * sin + ly * cos };
}

/**
 * Kształt po przesunięciu uchwytu `id` do punktu strony `point` – nowy obiekt, oryginał bez zmian.
 * Narożnik zmienia szerokość i wysokość (przeciwny narożnik zostaje), środek boku – jeden wymiar,
 * pochylenie – przesuwa górną krawędź (dolna zostaje), obrót – kąt (co 15° przyciągany do 2°),
 * kształt – wierzchołek trójkąta albo wcięcie trapezu, koniec odcinka – drugi koniec zostaje.
 * Od 1.19 `lock` (Shift): narożnik zachowuje proporcje kształtu, koniec odcinka i obrót – co 15°.
 */
export function moveShapeHandle(shape, id, point, { lock = false } = {}) {
  if (/^v\d+$/.test(id) && isPoly(shape)) return moveNode(shape, Number(id.slice(1)), point, { lock });
  if (id === 'start' || id === 'end') {
    const fixed = shapePoint(shape, id === 'start' ? 0.5 : -0.5, 0);
    const [from, to] = id === 'start' ? [point, fixed] : [fixed, point];
    let angle = Math.atan2(to.y - from.y, to.x - from.x);
    const length = Math.max(MIN_SHAPE, Math.hypot(to.x - from.x, to.y - from.y));
    angle = lock ? snapAngle(angle, LOCK_STEP, LOCK_STEP) : snapAngle(angle, Math.PI / 4, (3 * Math.PI) / 180);
    // Kąt przyciągnięty: ruchomy koniec na prostej z nieruchomego.
    const start = id === 'start' ? { x: fixed.x - Math.cos(angle) * length, y: fixed.y - Math.sin(angle) * length } : fixed;
    return { ...shape, x: round(start.x + (Math.cos(angle) * length) / 2), y: round(start.y + (Math.sin(angle) * length) / 2), w: round(length), angle };
  }
  const local = toShapeFrame(shape, point.x, point.y);
  if (id === 'rotate') {
    const angle = Math.atan2(point.y - shape.y, point.x - shape.x) + Math.PI / 2;
    const normal = Math.atan2(Math.sin(angle), Math.cos(angle));
    // Z Shift dokładnie co 15° (−180° to to samo co 180°).
    const snapped = lock ? snapAngle(normal, LOCK_STEP, LOCK_STEP) : snapAngle(normal, Math.PI / 12, (2 * Math.PI) / 180);
    return { ...shape, angle: snapped <= -Math.PI + 1e-9 ? Math.PI : snapped };
  }
  if (id === 'skew') {
    // Dolna krawędź zostaje; górna przesuwa się wzdłuż swojej prostej.
    const bottom = { lx: -0.5 * shape.skew * shape.h, ly: 0.5 * shape.h };
    const raw = clamp((local.lx - bottom.lx - SKEW_AT * shape.w) / shape.h, -SKEW_LIMIT, SKEW_LIMIT);
    // Blisko zera – bez pochylenia (łatwo wrócić do prostych boków).
    const skew = Math.abs(raw) < 0.03 ? 0 : Math.round(raw * 1000) / 1000;
    const center = fromFrame(shape, bottom.lx + 0.5 * skew * shape.h, 0);
    return { ...shape, skew, x: round(center.x), y: round(center.y) };
  }
  if (id === 'adjust') {
    const u = (local.lx - 0.5 * shape.skew * shape.h) / shape.w + 0.5;
    const adjust = shape.shape === 'triangle' ? clamp(u, 0, 1) : clamp(u, 0, 0.45);
    // Wierzchołek trójkąta przyciągany do środka i nad narożniki.
    const snapped = shape.shape === 'triangle' ? [0, 0.5, 1].find((value) => Math.abs(value - adjust) < 0.03) ?? adjust : adjust;
    return { ...shape, adjust: round(snapped) };
  }
  // Uchwyt (su/2, sv/2) i przeciwny punkt (−su/2, −sv/2) w układzie bez pochylenia:
  // punkt (u, v) to (u·w − skew·v·h, v·h), więc uchwyt − przeciwny = (su·w − skew·sv·h, sv·h).
  const [su, sv] = FRAME_HANDLES[id].map((value) => value * 2);
  const fixed = { lx: (-su * shape.w + shape.skew * sv * shape.h) / 2, ly: (-sv * shape.h) / 2 };
  let h = sv !== 0 ? Math.max(MIN_SHAPE, sv * (local.ly - fixed.ly)) : shape.h;
  let w = su !== 0 ? Math.max(MIN_SHAPE, su * (local.lx - fixed.lx + shape.skew * sv * h)) : shape.w;
  if (lock && su !== 0 && sv !== 0) {
    // Narożnik z Shift: większa ze zmian szerokości i wysokości – dla obu (proporcje zostają).
    const scale = Math.max(w / shape.w, h / shape.h);
    [w, h] = [Math.max(MIN_SHAPE, shape.w * scale), Math.max(MIN_SHAPE, shape.h * scale)];
  }
  const delta = { lx: su * w - shape.skew * sv * h, ly: sv * h };
  const center = fromFrame(shape, fixed.lx + delta.lx / 2, fixed.ly + delta.ly / 2);
  return { ...shape, w: round(w), h: round(h), x: round(center.x), y: round(center.y) };
}

/**
 * Łamana albo wielokąt z wierzchołkami w punktach strony [{ x, y }, …] w układzie `frame` (środek,
 * kąt): ramka – najmniejszy prostokąt wokół wierzchołków w tym układzie (od 1.24).
 */
export function polyFromPoints(kind, points, frame, style) {
  const [cos, sin] = [Math.cos(frame.angle), Math.sin(frame.angle)];
  const local = points.map((point) => {
    const [dx, dy] = [point.x - frame.x, point.y - frame.y];
    return [dx * cos + dy * sin, -dx * sin + dy * cos];
  });
  const xs = local.map(([lx]) => lx);
  const ys = local.map(([, ly]) => ly);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [w, h] = [Math.max(MIN_SHAPE, maxX - minX), Math.max(MIN_SHAPE, maxY - minY)];
  const [cx, cy] = [(minX + maxX) / 2, (minY + maxY) / 2];
  const nodes = local.flatMap(([lx, ly]) => [Math.round(((lx - cx) / w) * 10000) / 10000, Math.round(((ly - cy) / h) * 10000) / 10000]);
  const shape = {
    tool: 'shape', shape: kind, color: style.color, size: style.size,
    x: round(frame.x + cx * cos - cy * sin), y: round(frame.y + cx * sin + cy * cos),
    w: round(w), h: round(h), angle: frame.angle, skew: 0, adjust: 0, nodes
  };
  if (kind === 'polygon' && (style.fill === 'light' || style.fill === 'solid')) shape.fill = style.fill;
  return shape;
}

/** Wierzchołki łamanej albo wielokąta w punktach strony. */
export const polyPoints = (shape) => nodePairs(shape).map(([u, v]) => shapePoint(shape, u, v));

/**
 * Wierzchołek `index` łamanej albo wielokąta przesunięty do punktu strony – ramka dopasowana do
 * nowych wierzchołków (kąt ramki zostaje). Bok do sąsiedniego wierzchołka przyciągany do poziomu,
 * pionu i 45° (do 3°; z Shift – co 15°); przy obu sąsiadach – w przecięciu obu kierunków.
 */
function moveNode(shape, index, point, { lock = false } = {}) {
  const points = polyPoints(shape);
  if (index < 0 || index >= points.length) return shape;
  const closed = shape.shape === 'polygon';
  // Punkty strzałki po łuku (od 1.27), łuku i wymiaru kąta (od 1.34) – bez przyciągania kierunków.
  if (isCurve(shape) || isArc(shape) || shape.shape === 'angledim') {
    points[index] = point;
    return { ...polyFromPoints(shape.shape, points, shape, shape), ...keepExtras(shape) };
  }
  const neighbours = [index - 1, index + 1]
    .map((other) => (closed ? (other + points.length) % points.length : other))
    .filter((other) => other >= 0 && other < points.length && other !== index)
    .map((other) => points[other]);
  const [step, tolerance] = lock ? [LOCK_STEP, LOCK_STEP] : [Math.PI / 4, (3 * Math.PI) / 180];
  const lines = [];
  for (const from of neighbours) {
    const raw = Math.atan2(point.y - from.y, point.x - from.x);
    const angle = snapAngle(raw, step, tolerance);
    if (angle !== raw && Math.hypot(point.x - from.x, point.y - from.y) > 0) lines.push({ from, angle });
  }
  let target = point;
  if (lines.length === 2) {
    // Przecięcie obu prostych (równoległe – tylko pierwsza).
    const [a, b] = lines;
    const [ax, ay, bx, by] = [Math.cos(a.angle), Math.sin(a.angle), Math.cos(b.angle), Math.sin(b.angle)];
    const cross = ax * by - ay * bx;
    if (Math.abs(cross) > 1e-6) {
      const t = ((b.from.x - a.from.x) * by - (b.from.y - a.from.y) * bx) / cross;
      target = { x: a.from.x + ax * t, y: a.from.y + ay * t };
    } else {
      lines.pop();
    }
  }
  if (lines.length === 1) {
    const [{ from, angle }] = lines;
    const along = (point.x - from.x) * Math.cos(angle) + (point.y - from.y) * Math.sin(angle);
    target = { x: from.x + Math.cos(angle) * along, y: from.y + Math.sin(angle) * along };
  }
  points[index] = target;
  return { ...polyFromPoints(shape.shape, points, shape, shape), ...keepExtras(shape) };
}

/** Pola geometrii kształtu – przy przeliczeniu łamanej zastępowane; reszta (wypełnienie, tekst, wymiary, id…) zostaje. */
const GEOMETRY_KEYS = new Set(['tool', 'shape', 'color', 'size', 'x', 'y', 'w', 'h', 'angle', 'skew', 'adjust', 'nodes']);
const keepExtras = (shape) => Object.fromEntries(Object.entries(shape).filter(([key]) => !GEOMETRY_KEYS.has(key)));

// ---------------------------------------------------------------- wymiary z klawiatury (od 1.17)

/** Kąt pochylenia w stopniach: dodatni – górna krawędź przesunięta w prawo (kształt pochylony w prawo). */
export const skewDegrees = (shape) => (Math.atan(shape.skew) * 180) / Math.PI;

/**
 * Kształt o wpisanych wymiarach – szerokości, wysokości (jednostki strony) i kącie pochylenia
 * (stopnie) – wokół tego samego środka; brakująca wartość zostaje bez zmian.
 */
export function resizeShape(shape, { w = shape.w, h = shape.h, skew = null } = {}) {
  if (isSegment(shape)) return { ...shape, w: round(Math.max(MIN_SHAPE, w)) };
  const degrees = skew === null || isPoly(shape) ? null : clamp(skew, -SKEW_DEGREES_LIMIT, SKEW_DEGREES_LIMIT);
  return {
    ...shape,
    w: round(Math.max(MIN_SHAPE, w)),
    h: round(Math.max(MIN_SHAPE, h)),
    skew: degrees === null ? shape.skew : Math.round(Math.tan((degrees * Math.PI) / 180) * 1000) / 1000
  };
}

/** Kierunek odcinka w stopniach jak na linijce – przeciwnie do ruchu wskazówek zegara od poziomu, od −180° do 180°. */
export function segmentDegrees(shape) {
  // + 0: bez „−0” przy odcinku poziomym.
  const degrees = (-shape.angle * 180) / Math.PI + 0;
  return degrees <= -180 ? degrees + 360 : degrees > 180 ? degrees - 360 : degrees;
}

/** Odcinek o wpisanej długości (jednostki strony) i kierunku (stopnie) – początek zostaje na miejscu. */
export function setSegment(shape, { length = shape.w, degrees = segmentDegrees(shape) } = {}) {
  const start = shapePoint(shape, -0.5, 0);
  const raw = (-degrees * Math.PI) / 180;
  const angle = Math.atan2(Math.sin(raw), Math.cos(raw)) || 0;
  const w = Math.max(MIN_SHAPE, length);
  return { ...shape, w: round(w), angle, x: round(start.x + (Math.cos(angle) * w) / 2), y: round(start.y + (Math.sin(angle) * w) / 2) };
}

// ---------------------------------------------------------------- wymiary na rysunku (od 1.19)

/** Wymiary kształtu: szerokość, wysokość i kąt pochylenia; odcinka i strzałki – długość i kąt. */
export const dimKeys = (shape) => (shape.shape === 'xline' || shape.shape === 'angledim' ? ['angle'] : shape.shape === 'dim' ? ['length']
  : ['curve', 'point', 'arc'].includes(shape.shape) ? [] : isSegment(shape) ? ['length', 'angle'] : isPoly(shape) ? ['width', 'height'] : ['width', 'height', 'skew']);
/** Wielkość czcionki stałego wymiaru i jego odstęp od linii ramki (jednostki strony; kratka ma 44). */
export const DIM_FONT = 22;
export const DIM_GAP = 8;

/**
 * Miejsca wymiarów (pola w edytorze i stałe napisy): { klucz: { point, normal } } – punkt na środku
 * linii ramki konstrukcyjnej i kierunek na zewnątrz. Szerokość – pod dolną linią, wysokość – przy
 * prawej, kąt pochylenia – przy lewej; odcinek: długość – pod środkiem (w kierunku czytelnym), kąt – za końcem.
 */
export function dimPlaces(shape) {
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  const turn = ([x, y]) => [x * cos - y * sin, x * sin + y * cos];
  const unit = (vector) => {
    const length = Math.hypot(...vector) || 1;
    return vector.map((value) => value / length);
  };
  // Wymiar kąta (od 1.34) – pole w miejscu liczby.
  if (shape.shape === 'angledim') return { angle: { point: dimGeometry(shape, 'angle').text, normal: [0, -1] } };
  if (isSegment(shape)) {
    const flip = cos < -1e-9 || (Math.abs(cos) < 1e-9 && sin > 0) ? -1 : 1;
    return onlyDimKeys(shape, { length: { point: shapePoint(shape, 0, 0), normal: turn([0, flip]) }, angle: { point: shapePoint(shape, 0.5, 0), normal: [cos, sin] } });
  }
  const places = {
    width: { point: shapePoint(shape, 0, 0.5), normal: turn([0, 1]) },
    height: { point: shapePoint(shape, 0.5, 0), normal: turn(unit([1, shape.skew])) },
    skew: { point: shapePoint(shape, -0.5, 0), normal: turn(unit([-1, -shape.skew])) }
  };
  // Łamana i wielokąt (od 1.24) – bez pochylenia.
  if (isPoly(shape)) delete places.skew;
  return onlyDimKeys(shape, places);
}

/** Miejsca tylko wymiarów kształtu (dimKeys): prosta – sam kąt, łuk i punkt (od 1.27) – żadnych. */
function onlyDimKeys(shape, places) {
  const keys = dimKeys(shape);
  return Object.fromEntries(Object.entries(places).filter(([key]) => keys.includes(key)));
}

/** Środek pola albo napisu wymiaru (width × height) odsuniętego od linii ramki o `gap` na zewnątrz. */
export function dimCenter(place, width, height, gap) {
  const [nx, ny] = place.normal;
  const reach = gap + Math.abs(nx) * (width / 2) + Math.abs(ny) * (height / 2);
  return { x: place.point.x + nx * reach, y: place.point.y + ny * reach };
}

/** Wymiary widoczne na stałe (w kolejności) – tylko pasujące do kształtu. */
export const shownDims = (shape) => (Array.isArray(shape.dims) ? dimKeys(shape).filter((key) => shape.dims.includes(key)) : []);

// ---------------------------------------------------------------- wymiary techniczne (od 1.22.1)

/**
 * Stały wymiar rysowany jak w rysunku technicznym: linie pomocnicze od kształtu, linia wymiarowa
 * ze strzałkami w odsunięciu `offset` (jednostki strony) i liczba nad nią; kąt – łuk ze strzałkami
 * o promieniu `offset` od linii odniesienia. Odsunięcie zapisane w kształcie (`dimOffsets`), a gdy
 * go nie ma – domyślne.
 */
export const DIM_OFFSET = 40;
/** Kolejne „piętro” wymiarów, gdy linie wymiarowe wchodziłyby na siebie. */
export const DIM_TIER = 36;
/** Przerwa między kształtem a linią pomocniczą, wysunięcie linii pomocniczej za linię wymiarową, strzałka, grubość linii. */
export const DIM_EXT_GAP = 4;
export const DIM_EXT_OVER = 8;
export const DIM_ARROW = 13;
export const DIM_LINE = 1.5;
/** Odsunięcie: najmniej – tuż za przerwą, najwięcej – ok. 14 kratek. */
export const DIM_OFFSET_LIMITS = Object.freeze({ min: 12, max: 600 });
/** Znak przed liczbą wymiaru (średnica, promień, kwadrat) i rodzaje tolerancji: ±, odchyłki, pasowanie. */
export const DIM_PREFIXES = Object.freeze(['', '⌀', 'R', '□']);
export const DIM_TOLERANCES = Object.freeze(['sym', 'dev', 'limits', 'fit']);
/**
 * Rodzaje wymiaru (od 1.38): teoretycznie dokładny (w prostokątnej ramce), pomocniczy (w nawiasie)
 * i kontrolny (w owalnej ramce); zwykły – bez pola. Dokładny i pomocniczy są bez tolerancji.
 */
export const DIM_STYLES = Object.freeze(['basic', 'reference', 'inspection']);
/** Najwięcej miejsc po przecinku liczby wymiaru (od 1.38; bez pola – samoczynnie). */
export const DIM_PLACES_MAX = 3;
export const isLinearDim = (key) => key === 'width' || key === 'height' || key === 'length';

/** Domyślny promień łuku kąta: połowa ramienia (boku albo odcinka; wymiar kąta – krótszego ramienia), od 36 do 140. */
function defaultArcRadius(shape, key) {
  const side = shape.shape === 'angledim' ? Math.min(...angleDimArms(shape).arms) : key === 'skew' ? Math.hypot(shape.skew * shape.h, shape.h) : shape.w;
  return clamp(side * 0.5, 36, 140);
}

/** Odsunięcie linii wymiarowej (albo promień łuku kąta) wymiaru `key`; wymiar liniowy narzędzia „Wymiar” – ze znakiem (strona). */
export function dimOffset(shape, key) {
  const saved = shape.dimOffsets?.[key];
  if (finite(saved)) return saved;
  return isLinearDim(key) ? DIM_OFFSET : defaultArcRadius(shape, key);
}

/**
 * Punkty mierzone i kierunki wymiaru liniowego: a, b – punkty kształtu, normal – na zewnątrz (tam stoi
 * linia wymiarowa). Szerokość – dolna krawędź (elipsa i romb – skrajne punkty), wysokość – prostopadle
 * do podstawy, po prawej (trójkąt – wierzchołek, trapez – górny prawy narożnik); odcinek – jego końce,
 * linia wymiarowa po stronie bez łuku kąta odcinka.
 */
function linearMeasure(shape, key) {
  const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
  const turn = ([x, y]) => [x * cos - y * sin, x * sin + y * cos];
  if (isSegment(shape)) {
    // Po stronie bez łuku kąta (łuk – między poziomem a odcinkiem, przy początku).
    const sweep = Math.atan2(sin, cos);
    return { a: shapePoint(shape, -0.5, 0), b: shapePoint(shape, 0.5, 0), normal: turn([0, sweep < -1e-9 ? -1 : 1]) };
  }
  if (key === 'width') {
    const v = shape.shape === 'ellipse' || shape.shape === 'diamond' ? 0 : 0.5;
    return { a: shapePoint(shape, -0.5, v), b: shapePoint(shape, 0.5, v), normal: turn([0, 1]) };
  }
  const top = shape.shape === 'ellipse' || shape.shape === 'diamond' ? [0, -0.5]
    : shape.shape === 'triangle' ? [shape.adjust - 0.5, -0.5]
      : shape.shape === 'trapezoid' ? [0.5 - shape.adjust, -0.5] : [0.5, -0.5];
  const bottom = shape.shape === 'ellipse' || shape.shape === 'diamond' ? [0, 0.5] : [0.5, 0.5];
  return { a: shapePoint(shape, ...top), b: shapePoint(shape, ...bottom), normal: turn([1, 0]) };
}

/**
 * Kąt napisu wzdłuż kierunku (dx, dy), czytelny – od −90° do 90°, bez 90° (nigdy do góry nogami):
 * liczbę pionowego wymiaru czyta się od prawej strony rysunku, od dołu do góry (ISO 129).
 */
function readableAngle(dx, dy) {
  let angle = Math.atan2(dy, dx);
  if (angle > Math.PI / 2 - 1e-9) angle -= Math.PI;
  if (angle < -Math.PI / 2 - 1e-9) angle += Math.PI;
  return angle;
}

/**
 * Geometria stałego wymiaru (od 1.22.1). Liniowy: { kind: 'linear', from, to – końce linii wymiarowej,
 * ext – dwie linie pomocnicze [[od, do]], text – { x, y, angle } środek liczby (nad linią w kierunku
 * czytania), normal }. Kąt: { kind: 'angle', center, radius, start, sweep – łuk (radiany na ekranie),
 * ref – linia odniesienia [od, do], text – { x, y, angle: 0 } }.
 */
export function dimGeometry(shape, key, offset = dimOffset(shape, key)) {
  if (shape.shape === 'angledim') return angleDimGeometry(shape, offset);
  if (shape.shape === 'dim') return measureGeometry(shape, offset);
  if (!isLinearDim(key)) {
    // Pochylenie: przy lewym dolnym narożniku, od prostopadłej do podstawy do lewego boku;
    // kąt odcinka: na początku, od poziomu w prawo do odcinka.
    const center = key === 'skew' ? shapePoint(shape, -0.5, 0.5) : shapePoint(shape, -0.5, 0);
    const start = key === 'skew' ? shape.angle - Math.PI / 2 : 0;
    const sweep = key === 'skew' ? Math.atan(shape.skew) : Math.atan2(Math.sin(shape.angle), Math.cos(shape.angle));
    const radius = offset;
    const reach = radius + DIM_EXT_OVER;
    const middle = start + sweep / 2;
    const away = radius + DIM_FONT * 0.95;
    return {
      kind: 'angle', center, radius, start, sweep,
      ref: [center, { x: center.x + Math.cos(start) * reach, y: center.y + Math.sin(start) * reach }],
      text: { x: center.x + Math.cos(middle) * away, y: center.y + Math.sin(middle) * away, angle: 0 }
    };
  }
  const { a, b, normal } = linearMeasure(shape, key);
  const along = (point) => point.x * normal[0] + point.y * normal[1];
  const base = Math.max(along(a), along(b)) + offset;
  const foot = (point) => {
    const reach = base - along(point);
    return { x: point.x + normal[0] * reach, y: point.y + normal[1] * reach };
  };
  const [from, to] = [foot(a), foot(b)];
  const ext = [[a, from], [b, to]].map(([point, end]) => {
    const gap = Math.min(DIM_EXT_GAP, Math.max(0, base - along(point)));
    return [
      { x: point.x + normal[0] * gap, y: point.y + normal[1] * gap },
      { x: end.x + normal[0] * DIM_EXT_OVER, y: end.y + normal[1] * DIM_EXT_OVER }
    ];
  });
  const angle = readableAngle(to.x - from.x, to.y - from.y);
  // Nad linią w kierunku czytania (dla poziomej – w górę strony).
  const up = [Math.sin(angle), -Math.cos(angle)];
  const lift = DIM_FONT * 0.5 + 5;
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return { kind: 'linear', from, to, ext, normal, text: { x: middle.x + up[0] * lift, y: middle.y + up[1] * lift, angle } };
}

/** Odsunięcie wskaźnika `point` od kształtu dla wymiaru `key` (przeciąganie liczby) – w granicach. */
export function dimOffsetAt(shape, key, point) {
  if (shape.shape === 'dim') {
    // Wymiar narzędzia „Wymiar” (od 1.34): linia wymiarowa po tej stronie mierzonych punktów, po której jest wskaźnik.
    const up = [Math.sin(shape.angle), -Math.cos(shape.angle)];
    const geometry = measureGeometry(shape, DIM_OFFSET);
    const lift = (geometry.text.x - (geometry.from.x + geometry.to.x) / 2) * up[0] + (geometry.text.y - (geometry.from.y + geometry.to.y) / 2) * up[1];
    const along = (point.x - shape.x) * up[0] + (point.y - shape.y) * up[1] - lift;
    return clampSigned(along);
  }
  if (!isLinearDim(key)) {
    const { center } = dimGeometry(shape, key, 1);
    return clamp(Math.round(Math.hypot(point.x - center.x, point.y - center.y) - DIM_FONT * 0.95), DIM_OFFSET_LIMITS.min, DIM_OFFSET_LIMITS.max);
  }
  const { a, b, normal } = linearMeasure(shape, key);
  const along = (item) => item.x * normal[0] + item.y * normal[1];
  // Liczba stoi nad linią wymiarową w kierunku czytania – po stronie kształtu albo po drugiej.
  const geometry = dimGeometry(shape, key, 0);
  const lift = along(geometry.text) - along(geometry.from);
  return clamp(Math.round(along(point) - lift - Math.max(along(a), along(b))), DIM_OFFSET_LIMITS.min, DIM_OFFSET_LIMITS.max);
}

/**
 * Geometria wymiaru narzędzia „Wymiar” (od 1.34) – jak dimGeometry. Liniowy: linia wymiarowa równoległa
 * do mierzonych punktów, po stronie znaku odsunięcia (dodatni – „nad” kierunkiem od początku do końca);
 * średnica – linia wymiarowa na mierzonych punktach, bez linii pomocniczych; promień – od środka do
 * okręgu z jednym grotem (arrows: 'end').
 */
function measureGeometry(shape, offset) {
  const [a, b] = [shapePoint(shape, -0.5, 0), shapePoint(shape, 0.5, 0)];
  const mode = dimMode(shape);
  const angle = readableAngle(b.x - a.x, b.y - a.y);
  const reading = [Math.sin(angle), -Math.cos(angle)];
  const lift = DIM_FONT * 0.5 + 5;
  if (mode !== 'linear') {
    // Promień: liczba w połowie, średnica – w ćwierci od początku (środek okręgu zostaje wolny).
    const t = mode === 'radius' ? 0.5 : 0.3;
    const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    return {
      kind: 'linear', from: a, to: b, ext: [], normal: reading, arrows: mode === 'radius' ? 'end' : 'both',
      text: { x: at.x + reading[0] * lift, y: at.y + reading[1] * lift, angle }
    };
  }
  const up = [Math.sin(shape.angle), -Math.cos(shape.angle)];
  const side = offset < 0 ? -1 : 1;
  const normal = [up[0] * side, up[1] * side];
  const distance = Math.abs(offset);
  const shift = (point, reach) => ({ x: point.x + normal[0] * reach, y: point.y + normal[1] * reach });
  const [from, to] = [shift(a, distance), shift(b, distance)];
  const gap = Math.min(DIM_EXT_GAP, distance);
  const ext = [[shift(a, gap), shift(a, distance + DIM_EXT_OVER)], [shift(b, gap), shift(b, distance + DIM_EXT_OVER)]];
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return { kind: 'linear', from, to, ext, normal, text: { x: middle.x + reading[0] * lift, y: middle.y + reading[1] * lift, angle } };
}

/**
 * Geometria wymiaru kąta (od 1.34): łuk o promieniu `radius` wokół wierzchołka od pierwszego ramienia
 * do drugiego (mniejszy kąt), linie pomocnicze wzdłuż ramion, gdy łuk jest dalej niż ich punkty.
 */
function angleDimGeometry(shape, radius) {
  const { vertex, start, sweep, arms } = angleDimArms(shape);
  const exts = [start, start + sweep].map((angle, index) => {
    const reach = radius + DIM_EXT_OVER;
    if (reach <= arms[index]) return null;
    const from = arms[index] + DIM_EXT_GAP;
    return [
      { x: vertex.x + Math.cos(angle) * Math.min(from, reach), y: vertex.y + Math.sin(angle) * Math.min(from, reach) },
      { x: vertex.x + Math.cos(angle) * reach, y: vertex.y + Math.sin(angle) * reach }
    ];
  }).filter(Boolean);
  const middle = start + sweep / 2;
  const away = radius + DIM_FONT * 0.95;
  return {
    kind: 'angle', center: vertex, radius, start, sweep, exts,
    text: { x: vertex.x + Math.cos(middle) * away, y: vertex.y + Math.sin(middle) * away, angle: 0 }
  };
}

/** Widoczna linia wymiaru (obrys): linia wymiarowa albo łuk kąta – punkty strony. */
function measureLine(shape) {
  const geometry = dimGeometry(shape, dimKeys(shape)[0]);
  if (geometry.kind === 'linear') return [geometry.from, geometry.to];
  const { center, radius, start, sweep } = geometry;
  return Array.from({ length: 17 }, (_, index) => ({ x: center.x + Math.cos(start + (sweep * index) / 16) * radius, y: center.y + Math.sin(start + (sweep * index) / 16) * radius }));
}

/** Czy koło dotyka wymiaru: linii wymiarowej, linii pomocniczych, łuku albo liczby (szacowany prostokąt). */
function touchesMeasure(shape, x, y, radius) {
  const geometry = dimGeometry(shape, dimKeys(shape)[0]);
  const reach = radius + DIM_LINE;
  const lines = geometry.kind === 'linear' ? [[geometry.from, geometry.to], ...geometry.ext] : geometry.exts;
  if (lines.some(([a, b]) => segmentDistance(x, y, a.x, a.y, b.x, b.y) <= reach)) return true;
  if (geometry.kind === 'angle') {
    const points = measureLine(shape);
    if (points.slice(1).some((point, index) => segmentDistance(x, y, points[index].x, points[index].y, point.x, point.y) <= reach)) return true;
  }
  const { text } = geometry;
  const [cos, sin] = [Math.cos(text.angle), Math.sin(text.angle)];
  const [dx, dy] = [x - text.x, y - text.y];
  return Math.abs(dx * cos + dy * sin) <= DIM_FONT * 2.5 + radius && Math.abs(-dx * sin + dy * cos) <= DIM_FONT * 0.7 + radius;
}

/**
 * Odsunięcie nowego wymiaru liniowego: `offset` (wzór z poprzednich), a gdy jego linia wymiarowa
 * wchodziłaby na inną (równoległą, w tym samym miejscu, zachodzącą na siebie) – kolejne „piętro”.
 */
export function stackDimOffset(strokes, shape, key, offset) {
  if (!isLinearDim(key)) return offset;
  const others = [];
  for (const stroke of strokes) {
    if (!isShape(stroke)) continue;
    for (const other of shownDims(stroke)) {
      if (!isLinearDim(other) || (stroke === shape && other === key)) continue;
      others.push(dimGeometry(stroke, other));
    }
  }
  const span = (line, dx, dy) => [line.from, line.to].map((point) => point.x * dx + point.y * dy).sort((p, q) => p - q);
  let next = offset;
  // Wymiar narzędzia „Wymiar” (od 1.34) – piętro dalej po swojej stronie.
  const tierStep = offset < 0 ? -DIM_TIER : DIM_TIER;
  for (let tier = 0; tier < 8; tier += 1) {
    const line = dimGeometry(shape, key, next);
    const [dx, dy] = [-line.normal[1], line.normal[0]];
    const [low, high] = span(line, dx, dy);
    const level = line.from.x * line.normal[0] + line.from.y * line.normal[1];
    const clash = others.some((item) => {
      if (Math.abs(item.normal[0] * line.normal[1] - item.normal[1] * line.normal[0]) > 0.03) return false;
      const distance = Math.abs(item.from.x * line.normal[0] + item.from.y * line.normal[1] - level);
      if (distance > DIM_TIER * 0.6) return false;
      const [a, b] = span(item, dx, dy);
      return a < high + DIM_FONT && b > low - DIM_FONT;
    });
    if (!clash) return next;
    next += tierStep;
  }
  return next;
}

/** Narożniki stałych wymiarów do granic kształtu: linie, łuki i szacowany napis (ok. 5 czcionek szerokości). */
function dimCorners(shape) {
  const corners = [];
  const [width, height] = [DIM_FONT * 5, DIM_FONT * 1.4];
  for (const key of shownDims(shape)) {
    const geometry = dimGeometry(shape, key);
    const { text } = geometry;
    corners.push({ x: text.x - width / 2, y: text.y - height / 2 }, { x: text.x + width / 2, y: text.y + height / 2 });
    if (geometry.kind === 'linear') {
      corners.push(geometry.from, geometry.to, ...geometry.ext.flat());
    } else if (shape.shape === 'angledim') {
      // Wymiar kąta (od 1.34) – sam łuk i linie pomocnicze.
      corners.push(...measureLine(shape), ...geometry.exts.flat());
    } else {
      const { center, radius } = geometry;
      corners.push({ x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y + radius }, geometry.ref[1]);
    }
  }
  return corners;
}

/** Sprawdzone odsunięcia (liczby) i oznaczenia (znak, tolerancja) wymiarów kształtu – tylko jego wymiarów. */
function cleanDimExtras(raw, shape) {
  const keys = dimKeys(shape);
  const offsets = {};
  const tolerances = {};
  if (raw.dimOffsets && typeof raw.dimOffsets === 'object') {
    for (const key of keys) {
      const value = raw.dimOffsets[key];
      // Wymiar liniowy narzędzia „Wymiar” (od 1.34) – odsunięcie ze znakiem.
      if (finite(value)) offsets[key] = shape.shape === 'dim' ? clampSigned(value) : clamp(Math.round(value), DIM_OFFSET_LIMITS.min, DIM_OFFSET_LIMITS.max);
    }
  }
  if (raw.dimTols && typeof raw.dimTols === 'object') {
    for (const key of keys) {
      const clean = cleanDimTolerance(raw.dimTols[key], isLinearDim(key));
      if (clean) tolerances[key] = clean;
    }
  }
  return {
    ...(Object.keys(offsets).length > 0 ? { dimOffsets: offsets } : {}),
    ...(Object.keys(tolerances).length > 0 ? { dimTols: tolerances } : {})
  };
}

/** Pasowanie: „H7”, „g6”, „H7/g6”, „js6” (litery i klasa). */
export const FIT_RE = /^[A-Za-z]{1,3}\d{1,2}(\/[A-Za-z]{1,3}\d{1,2})?$/;

/**
 * Sprawdzone oznaczenie wymiaru albo null: { prefix?: '⌀' | 'R' | '□' (tylko długości), kind?: 'sym' |
 * 'dev' | 'limits' | 'fit', value? (±), upper?, lower? (odchyłki; 'limits' – wymiary graniczne z tych
 * odchyłek), fit? (pasowanie), style?: 'basic' | 'reference' | 'inspection', places?: 0–3 } (od 1.38
 * wymiary graniczne, rodzaj wymiaru i miejsca po przecinku).
 */
export function cleanDimTolerance(raw, linear = true) {
  if (!raw || typeof raw !== 'object') return null;
  const result = {};
  if (linear && DIM_PREFIXES.includes(raw.prefix) && raw.prefix) result.prefix = raw.prefix;
  if (DIM_STYLES.includes(raw.style)) result.style = raw.style;
  if (Number.isInteger(raw.places) && raw.places >= 0 && raw.places <= DIM_PLACES_MAX) result.places = raw.places;
  const limit = (value) => clamp(Math.round(value * 1e6) / 1e6, -1e6, 1e6);
  // Wymiar teoretycznie dokładny i pomocniczy – bez tolerancji.
  if (result.style === 'basic' || result.style === 'reference') return Object.keys(result).length > 0 ? result : null;
  if (raw.kind === 'sym' && finite(raw.value) && raw.value !== 0) Object.assign(result, { kind: 'sym', value: Math.abs(limit(raw.value)) });
  else if ((raw.kind === 'dev' || raw.kind === 'limits') && finite(raw.upper) && finite(raw.lower)) Object.assign(result, { kind: raw.kind, upper: limit(raw.upper), lower: limit(raw.lower) });
  else if (raw.kind === 'fit' && linear && typeof raw.fit === 'string' && FIT_RE.test(raw.fit.trim())) Object.assign(result, { kind: 'fit', fit: raw.fit.trim() });
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Kształt z liczbami tolerancji długości pomnożonymi przez `factor` (od 1.25 – przeliczenie dawnych
 * rysunków do mm); tolerancje kątów bez zmian.
 */
export function scaleDimTolerances(shape, factor) {
  if (!shape.dimTols) return shape;
  const exact = (value) => Number((value * factor).toPrecision(12));
  const tolerances = {};
  for (const [key, marks] of Object.entries(shape.dimTols)) {
    if (!isLinearDim(key)) {
      tolerances[key] = marks;
      continue;
    }
    const next = { ...marks };
    if (finite(next.value)) next.value = exact(next.value);
    if (finite(next.upper)) next.upper = exact(next.upper);
    if (finite(next.lower)) next.lower = exact(next.lower);
    tolerances[key] = next;
  }
  return { ...shape, dimTols: tolerances };
}

/** Kształt z oznaczeniem wymiaru `key` (null – bez znaku i tolerancji) – nowy obiekt. */
export function withDimTolerance(shape, key, tolerance) {
  const next = { ...shape };
  const tolerances = { ...(shape.dimTols ?? {}) };
  const clean = cleanDimTolerance(tolerance, isLinearDim(key));
  if (clean) tolerances[key] = clean;
  else delete tolerances[key];
  if (Object.keys(tolerances).length > 0) next.dimTols = tolerances;
  else delete next.dimTols;
  return next;
}

/** Kształt z odsunięciem wymiaru `key` – nowy obiekt. */
export function withDimOffset(shape, key, offset) {
  const value = shape.shape === 'dim' ? clampSigned(offset) : clamp(Math.round(offset), DIM_OFFSET_LIMITS.min, DIM_OFFSET_LIMITS.max);
  return { ...shape, dimOffsets: { ...(shape.dimOffsets ?? {}), [key]: value } };
}

/** Kształt z wymiarami widocznymi na stałe (klucze z dimKeys) – nowy obiekt; pusta lista usuwa pole. */
export function withDims(shape, keys) {
  const next = { ...shape };
  const dims = dimKeys(shape).filter((key) => keys.includes(key));
  if (dims.length > 0) next.dims = dims;
  else delete next.dims;
  return next;
}

/** Sprawdzony tekst na kształcie albo null. */
function cleanLabel(raw, isColor, limit) {
  if (!raw || typeof raw !== 'object' || typeof raw.text !== 'string' || raw.text.trim() === '' || !isColor(raw.color)) return null;
  if (![raw.size, raw.width, raw.height].every(finite)) return null;
  return {
    text: raw.text.slice(0, LABEL_TEXT_MAX),
    size: clamp(raw.size, 8, 200),
    color: raw.color.toLowerCase(),
    width: clamp(raw.width, 1, limit),
    height: clamp(raw.height, 1, limit)
  };
}

/** Sprawdzone wierzchołki łamanej albo wielokąta [u, v, …] (od −½ do ½) albo null. */
function cleanNodes(raw, least, most = POLY_NODES_MAX) {
  if (!Array.isArray(raw) || raw.length % 2 !== 0 || raw.length < least * 2 || raw.length > most * 2 || !raw.every(finite)) return null;
  return raw.map((value) => clamp(value, -0.5, 0.5));
}

/** Sprawdzony kształt (zapis, kopia zapasowa) albo null. */
export function cleanShape(raw, pageWidth, pageHeight, isColor) {
  if (!raw || !(SHAPES.includes(raw.shape) || POLY_SHAPES.includes(raw.shape) || raw.shape === 'angledim') || !isColor(raw.color)) return null;
  if (![raw.x, raw.y, raw.w, raw.h, raw.angle, raw.size].every(finite)) return null;
  const segment = isSegment(raw);
  // Od 1.24: wierzchołki łamanej (co najmniej 2) i wielokąta (co najmniej 3) w układzie własnym; strzałka po łuku (od 1.27) –
  // dokładnie 4, łuk i wymiar kąta (od 1.34) – dokładnie 3.
  const poly = isPoly(raw);
  const exact = { curve: 4, arc: 3, angledim: 3 }[raw.shape];
  const nodes = poly ? cleanNodes(raw.nodes, exact ?? (raw.shape === 'polygon' ? 3 : 2), exact ?? POLY_NODES_MAX) : null;
  if (poly && !nodes) return null;
  const limit = Math.max(pageWidth, pageHeight) * 4;
  // Wymiar (od 1.34) – bez tekstu na kształcie; zawsze widoczny swój wymiar, rodzaj (średnica, promień).
  const measure = isMeasure(raw);
  const label = measure ? null : cleanLabel(raw.label, isColor, limit);
  // Od 1.19: zakończenia odcinka (tylko inne niż domyślne) i wymiary widoczne na stałe.
  const caps = hasCaps(raw) ? withCaps({ shape: raw.shape }, { ...segmentCaps({ shape: raw.shape }), ...(raw.startCap ? { start: raw.startCap } : {}), ...(raw.endCap ? { end: raw.endCap } : {}) }) : {};
  const point = isPointShape(raw);
  const dims = measure ? dimKeys(raw) : withDims({ shape: raw.shape }, Array.isArray(raw.dims) ? raw.dims : []).dims;
  return {
    tool: 'shape',
    shape: raw.shape,
    color: raw.color.toLowerCase(),
    size: clamp(raw.size, 0.5, 40),
    x: clamp(raw.x, -pageWidth, pageWidth * 2),
    y: clamp(raw.y, -pageHeight, pageHeight * 2),
    w: clamp(Math.abs(raw.w), MIN_SHAPE, limit),
    h: segment ? 0 : point ? clamp(Math.abs(raw.w), MIN_SHAPE, limit) : clamp(Math.abs(raw.h), MIN_SHAPE, limit),
    // Kąt w zakresie (−π, π]; w zakresie – bez przeliczania (bez błędów zaokrągleń).
    angle: raw.angle > Math.PI || raw.angle <= -Math.PI ? Math.atan2(Math.sin(raw.angle), Math.cos(raw.angle)) : raw.angle,
    skew: segment || poly || point || !finite(raw.skew) ? 0 : clamp(raw.skew, -SKEW_LIMIT, SKEW_LIMIT),
    adjust: raw.shape === 'triangle' ? clamp(finite(raw.adjust) ? raw.adjust : 0.5, 0, 1)
      : raw.shape === 'trapezoid' ? clamp(finite(raw.adjust) ? raw.adjust : 0.25, 0, 0.45) : 0,
    ...(canFill(raw) && (raw.fill === 'light' || raw.fill === 'solid') ? { fill: raw.fill } : {}),
    ...(nodes ? { nodes } : {}),
    ...(label ? { label } : {}),
    ...(caps.startCap ? { startCap: caps.startCap } : {}),
    ...(caps.endCap ? { endCap: caps.endCap } : {}),
    // Od 1.27: rodzaj linii (nie ciągła) i znacznik punktu.
    ...(canDash(raw) && SHAPE_DASHES.includes(raw.dash) && raw.dash !== 'solid' ? { dash: raw.dash } : {}),
    ...(point ? { mark: pointMark(raw) } : {}),
    ...(raw.shape === 'dim' && dimMode(raw) !== 'linear' ? { mode: dimMode(raw) } : {}),
    ...(dims ? { dims } : {}),
    // Od 1.22.1: odsunięcia linii wymiarowych i oznaczenia wymiarów (znak, tolerancja).
    ...cleanDimExtras(raw, { shape: raw.shape })
  };
}

// ---------------------------------------------------------------- liniuszek

/**
 * Liniuszek (od 1.15): równoległe linie przez całą stronę { x, y, angle, spacing } – (x, y) to punkt
 * jednej z linii, angle – kierunek (radiany), spacing – odstęp linii (jednostki strony). Linie
 * poprzeczne – ta sama postać (odstęp mierzony prostopadle do nich).
 */

/** Najbliższa linia rodziny w punkcie: { x, y, angle, distance } – (x, y) to rzut punktu na linię. */
export function nearestGuideLine(family, x, y) {
  const normal = { x: -Math.sin(family.angle), y: Math.cos(family.angle) };
  const offset = (x - family.x) * normal.x + (y - family.y) * normal.y;
  const index = Math.round(offset / family.spacing);
  const distance = offset - index * family.spacing;
  return { x: x - normal.x * distance, y: y - normal.y * distance, angle: family.angle, distance: Math.abs(distance), index };
}

/** Linie rodziny przecinające prostokąt strony: [{ x, y }, …] – punkty linii (kierunek – family.angle). */
export function guideLinesIn(family, width, height) {
  const normal = { x: -Math.sin(family.angle), y: Math.cos(family.angle) };
  const offsets = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => (x - family.x) * normal.x + (y - family.y) * normal.y);
  const [first, last] = [Math.ceil(Math.min(...offsets) / family.spacing), Math.floor(Math.max(...offsets) / family.spacing)];
  const lines = [];
  for (let index = first; index <= last && lines.length < 2000; index += 1) {
    lines.push({ x: family.x + normal.x * index * family.spacing, y: family.y + normal.y * index * family.spacing });
  }
  return lines;
}

/**
 * Liniuszek promieniowy (od 1.22): okręgi wokół środka { x, y } co `spacing` (jednostki strony)
 * i promienie co `step` (radiany), obrócone o `angle` (kierunek pierwszego promienia). Najbliższy
 * okrąg w punkcie: { radius, distance, index } – bez okręgu o promieniu 0.
 */
export function nearestRing(radial, x, y) {
  const radius = Math.hypot(x - radial.x, y - radial.y);
  const index = Math.max(1, Math.round(radius / radial.spacing));
  return { radius: index * radial.spacing, distance: Math.abs(radius - index * radial.spacing), index };
}

/** Najbliższy promień w punkcie: { angle, distance, x, y } – kierunek promienia, odległość i rzut punktu na promień. */
export function nearestRay(radial, x, y) {
  const radius = Math.hypot(x - radial.x, y - radial.y);
  const theta = Math.atan2(y - radial.y, x - radial.x);
  const angle = radial.angle + Math.round((theta - radial.angle) / radial.step) * radial.step;
  const along = radius * Math.cos(theta - angle);
  return {
    angle,
    distance: radius * Math.abs(Math.sin(theta - angle)),
    x: radial.x + Math.cos(angle) * along,
    y: radial.y + Math.sin(angle) * along
  };
}

/** Promienie okręgów, które przecinają prostokąt strony (najwyżej 2000). */
export function ringsIn(radial, width, height) {
  const far = Math.max(...[[0, 0], [width, 0], [0, height], [width, height]].map(([px, py]) => Math.hypot(px - radial.x, py - radial.y)));
  const near = Math.hypot(Math.max(-radial.x, 0, radial.x - width), Math.max(-radial.y, 0, radial.y - height));
  const radii = [];
  for (let index = Math.max(1, Math.ceil(near / radial.spacing)); index * radial.spacing <= far && radii.length < 2000; index += 1) {
    radii.push(index * radial.spacing);
  }
  return radii;
}

/** Kierunki wszystkich promieni (radiany) – pełny obrót co `step`. */
export function rayAngles(radial) {
  const count = Math.max(1, Math.round((Math.PI * 2) / radial.step));
  return Array.from({ length: count }, (_, index) => radial.angle + index * radial.step);
}
