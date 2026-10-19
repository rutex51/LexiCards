// Rysunki odręczne w notatce (od 1.12): kreski pióra i zakreślacza zapisane jako punkty, żeby
// rysunek dało się później poprawiać. Tu – bez przeglądarki: grubość kreski z nacisku rysika,
// wygładzanie, gumka całych kresek i fragmentów (od 1.12.1), zaznaczanie i przesuwanie kresek,
// linijka, historia cofania, sprawdzanie danych (zapis, kopia zapasowa).
//
// Rysunek: { version: 1, width, height, paper: 'plain' | 'lines' | 'grid', strokes, photo? }
//   width, height – wielkość strony w jednostkach rysunku (strona bez zdjęcia: 1600 × 1100);
//   strokes – [{ tool: 'pen' | 'highlighter', color: '#rrggbb', points: [x, y, w, x, y, w, …] }],
//   w – grubość kreski w danym punkcie (pióro – zależna od nacisku, zakreślacz – stała);
//   photo – { type, width, height, bytes } – zdjęcie pod kreskami („Rysuj na zdjęciu”).

export const DRAWING_VERSION = 1;
/** Strona bez zdjęcia – w poziomie, w proporcjach ekranu iPada i laptopa. */
export const PAGE_WIDTH = 1600;
export const PAGE_HEIGHT = 1100;
/** Strona ze zdjęciem: najdłuższy bok (jak obrazy notatki) – większe zdjęcie jest pomniejszane na stronie. */
export const PHOTO_PAGE_MAX = 2048;
/** Odstęp linii i kratki tła (jednostki rysunku). */
export const PAPER_STEP = 44;
export const PAPERS = Object.freeze(['plain', 'lines', 'grid']);
export const PAPER_LABELS = Object.freeze({ plain: 'Gładkie', lines: 'Linie', grid: 'Kratka' });

/** Kolory tuszu (jak kolory tekstu notatki): czarny, niebieski, czerwony, zielony, pomarańczowy, fioletowy. */
export const INK_COLORS = Object.freeze([
  { id: 'black', hex: '#1d1d1f', label: 'Czarny' },
  { id: 'blue', hex: '#0040dd', label: 'Niebieski' },
  { id: 'red', hex: '#d70015', label: 'Czerwony' },
  { id: 'green', hex: '#248a3d', label: 'Zielony' },
  { id: 'orange', hex: '#c45500', label: 'Pomarańczowy' },
  { id: 'purple', hex: '#8944ab', label: 'Fioletowy' }
]);
/** Kolory zakreślacza (półprzezroczyste, mnożone z tłem – tusz pod spodem zostaje ciemny). */
export const HIGHLIGHTER_COLORS = Object.freeze([
  { id: 'yellow', hex: '#ffd60a', label: 'Żółty' },
  { id: 'green', hex: '#5ee07a', label: 'Zielony' },
  { id: 'pink', hex: '#ff6fb1', label: 'Różowy' },
  { id: 'blue', hex: '#64c8ff', label: 'Niebieski' }
]);
export const HIGHLIGHTER_ALPHA = 0.45;

/** Grubości pióra (od – do, w jednostkach rysunku): cienka, średnia, gruba. */
export const PEN_WIDTHS = Object.freeze([
  Object.freeze({ min: 1.6, max: 4 }),
  Object.freeze({ min: 2.6, max: 6.5 }),
  Object.freeze({ min: 4.5, max: 11 })
]);
/** Grubości zakreślacza (stałe). */
export const HIGHLIGHTER_WIDTHS = Object.freeze([14, 24, 36]);
export const WIDTH_LIMITS = Object.freeze({ min: 0.5, max: 40 });

/** Czułość nacisku: jak mocno nacisk zmienia grubość kreski między „od” a „do”. */
export const SENSITIVITY = Object.freeze({ off: 0, low: 0.5, medium: 1, high: 1.6 });
export const SENSITIVITY_LABELS = Object.freeze({ off: 'Wył.', low: 'Mała', medium: 'Średnia', high: 'Duża' });

/** Gumka (od 1.12.1): całe kreski albo fragmenty; wielkość gumki fragmentów – średnica na ekranie (px). */
export const ERASER_MODES = Object.freeze(['stroke', 'pixel']);
export const ERASER_MODE_LABELS = Object.freeze({ stroke: 'Całe kreski', pixel: 'Fragmenty' });
export const ERASER_SIZES = Object.freeze([8, 16, 28, 48]);
export const ERASER_SIZE_LABELS = Object.freeze(['Mała', 'Średnia', 'Duża', 'Bardzo duża']);

/** Ustawienia narzędzi na tym urządzeniu (pióro: czułość, wygładzanie i grubości; zakreślacz: grubość). */
export function defaultToolSettings() {
  return {
    sensitivity: 'medium',
    smoothing: 0.5,
    penWidths: PEN_WIDTHS.map((width) => ({ ...width })),
    penWidth: 1,
    penColor: 'black',
    highlighterWidth: 1,
    highlighterColor: 'yellow',
    eraserMode: 'stroke',
    eraserSize: 1
  };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** Ustawienia narzędzi odczytane z pamięci urządzenia – złe wartości zastępują domyślne. */
export function cleanToolSettings(raw) {
  const base = defaultToolSettings();
  if (!raw || typeof raw !== 'object') return base;
  const widths = Array.isArray(raw.penWidths) && raw.penWidths.length === PEN_WIDTHS.length
    ? raw.penWidths.map((width, index) => {
      const min = finite(width?.min) ? clamp(width.min, WIDTH_LIMITS.min, WIDTH_LIMITS.max) : PEN_WIDTHS[index].min;
      const max = finite(width?.max) ? clamp(width.max, WIDTH_LIMITS.min, WIDTH_LIMITS.max) : PEN_WIDTHS[index].max;
      return { min: Math.min(min, max), max: Math.max(min, max) };
    })
    : base.penWidths;
  return {
    sensitivity: raw.sensitivity in SENSITIVITY ? raw.sensitivity : base.sensitivity,
    smoothing: finite(raw.smoothing) ? clamp(raw.smoothing, 0, 1) : base.smoothing,
    penWidths: widths,
    penWidth: Number.isInteger(raw.penWidth) && raw.penWidth >= 0 && raw.penWidth < PEN_WIDTHS.length ? raw.penWidth : base.penWidth,
    penColor: INK_COLORS.some((color) => color.id === raw.penColor) ? raw.penColor : base.penColor,
    highlighterWidth: Number.isInteger(raw.highlighterWidth) && raw.highlighterWidth >= 0 && raw.highlighterWidth < HIGHLIGHTER_WIDTHS.length
      ? raw.highlighterWidth : base.highlighterWidth,
    highlighterColor: HIGHLIGHTER_COLORS.some((color) => color.id === raw.highlighterColor) ? raw.highlighterColor : base.highlighterColor,
    eraserMode: ERASER_MODES.includes(raw.eraserMode) ? raw.eraserMode : base.eraserMode,
    eraserSize: Number.isInteger(raw.eraserSize) && raw.eraserSize >= 0 && raw.eraserSize < ERASER_SIZES.length ? raw.eraserSize : base.eraserSize
  };
}

/**
 * Grubość kreski pióra dla nacisku 0–1: między width.min a width.max, tym bardziej zależna od
 * nacisku, im większa czułość. Bez czułości (albo bez nacisku – palec, mysz) – środek zakresu.
 */
export function penWidth(pressure, width, sensitivity = 'medium') {
  const gain = SENSITIVITY[sensitivity] ?? SENSITIVITY.medium;
  const value = finite(pressure) && pressure > 0 ? pressure : 0.5;
  const share = clamp(0.5 + (value - 0.5) * gain, 0, 1);
  return width.min + (width.max - width.min) * share;
}

/**
 * Wygładzanie: kolejny punkt kreski przesunięty w stronę poprzedniego (wygładzanie 0 – bez zmian,
 * 1 – najmocniej). Mniej drżenia przy szybkim pisaniu, kosztem lekkiego „spóźnienia” kreski.
 */
export function smoothPoint(previous, next, smoothing) {
  if (!previous) return next;
  const follow = 1 - clamp(smoothing, 0, 1) * 0.75;
  return { x: previous.x + (next.x - previous.x) * follow, y: previous.y + (next.y - previous.y) * follow, w: next.w };
}

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Dokłada punkt do kreski (zaokrąglony – mniejszy zapis); punkt w tym samym miejscu – pomijany. */
export function addPoint(stroke, point) {
  const { points } = stroke;
  const x = round(point.x, 1);
  const y = round(point.y, 1);
  const w = round(point.w, 2);
  const last = points.length - 3;
  if (last >= 0 && points[last] === x && points[last + 1] === y) {
    points[last + 2] = Math.max(points[last + 2], w);
    return false;
  }
  points.push(x, y, w);
  return true;
}

/** Odległość punktu od odcinka (a–b). */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / length, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Czy gumka o promieniu `radius` w punkcie (x, y) dotyka kreski (z jej grubością). */
export function touchesStroke(stroke, x, y, radius) {
  const { points } = stroke;
  if (points.length < 3) return false;
  if (points.length === 3) return Math.hypot(x - points[0], y - points[1]) <= radius + points[2] / 2;
  for (let index = 3; index < points.length; index += 3) {
    const reach = radius + Math.max(points[index - 1], points[index + 2]) / 2;
    if (segmentDistance(x, y, points[index - 3], points[index - 2], points[index], points[index + 1]) <= reach) return true;
  }
  return false;
}

/** Numery kresek, których dotyka gumka (od góry – ostatnio narysowanych). */
export function strokesAt(strokes, x, y, radius) {
  const hits = [];
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    if (touchesStroke(strokes[index], x, y, radius)) hits.push(index);
  }
  return hits;
}

// ---------------------------------------------------------------- gumka fragmentów, zaznaczanie

/** Granice kreski razem z grubością (zapamiętane – kreski się nie zmieniają). */
const boundsCache = new WeakMap();
export function strokeBounds(stroke) {
  let bounds = boundsCache.get(stroke);
  if (bounds) return bounds;
  const { points } = stroke;
  bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let index = 0; index < points.length; index += 3) {
    const half = points[index + 2] / 2;
    bounds.minX = Math.min(bounds.minX, points[index] - half);
    bounds.maxX = Math.max(bounds.maxX, points[index] + half);
    bounds.minY = Math.min(bounds.minY, points[index + 1] - half);
    bounds.maxY = Math.max(bounds.maxY, points[index + 1] + half);
  }
  boundsCache.set(stroke, bounds);
  return bounds;
}

/** Nowa kreska z punktów [x, y, w, …] – zaokrąglonych i bez powtórzeń, jak przy rysowaniu. */
function strokeFrom(source, points) {
  const stroke = { tool: source.tool, color: source.color, points: [] };
  for (let index = 0; index < points.length; index += 3) addPoint(stroke, { x: points[index], y: points[index + 1], w: points[index + 2] });
  return stroke;
}

/**
 * Gumka fragmentów (od 1.12.1): część kreski w kole (x, y, radius) znika, reszta zostaje jako nowe
 * kreski. Koło sięga do brzegu tuszu (promień + połowa grubości), a odcinek między punktami jest
 * przecinany na brzegu koła, więc dziura nie zależy od gęstości punktów. Zwraca null, gdy koło nie
 * dotyka kreski, albo listę kawałków (pustą, gdy znika cała kreska).
 */
export function eraseFromStroke(stroke, x, y, radius) {
  const bounds = strokeBounds(stroke);
  if (x + radius < bounds.minX || x - radius > bounds.maxX || y + radius < bounds.minY || y - radius > bounds.maxY) return null;
  const { points } = stroke;
  const count = points.length / 3;
  if (count === 0) return null;
  if (count === 1) return Math.hypot(points[0] - x, points[1] - y) < radius + points[2] / 2 ? [] : null;
  const pieces = [];
  let current = Math.hypot(points[0] - x, points[1] - y) < radius + points[2] / 2 ? null : [points[0], points[1], points[2]];
  let cut = current === null;
  for (let point = 1; point < count; point += 1) {
    const [ax, ay, aw] = [points[point * 3 - 3], points[point * 3 - 2], points[point * 3 - 1]];
    const [bx, by, bw] = [points[point * 3], points[point * 3 + 1], points[point * 3 + 2]];
    // Część odcinka A–B w kole: t od `enter` do `leave` (|A + t·(B − A) − środek| < promień).
    const reach = radius + Math.max(aw, bw) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const a = dx * dx + dy * dy;
    const b = (ax - x) * dx + (ay - y) * dy;
    const c = (ax - x) ** 2 + (ay - y) ** 2 - reach * reach;
    let enter = null;
    let leave = null;
    if (a === 0) {
      if (c < 0) [enter, leave] = [0, 1];
    } else if (b * b - a * c > 0) {
      const root = Math.sqrt(b * b - a * c);
      const [t0, t1] = [(-b - root) / a, (-b + root) / a];
      if (t1 > 0 && t0 < 1) [enter, leave] = [Math.max(0, t0), Math.min(1, t1)];
    }
    if (enter === null) {
      if (!current) current = [ax, ay, aw];
      current.push(bx, by, bw);
      continue;
    }
    cut = true;
    const at = (t) => [ax + dx * t, ay + dy * t, aw + (bw - aw) * t];
    if (enter > 0) {
      if (!current) current = [ax, ay, aw];
      current.push(...at(enter));
    }
    if (current) pieces.push(current);
    current = leave < 1 ? [...at(leave), bx, by, bw] : null;
  }
  if (current) pieces.push(current);
  if (!cut) return null;
  // Okruch jednego punktu po przecięciu byłby kropką – znika razem z resztą.
  return pieces.map((piece) => strokeFrom(stroke, piece)).filter((piece) => piece.points.length >= 6);
}

/** Gumka fragmentów na całym rysunku: zmienia listę kresek w miejscu; zwraca, czy coś starła. */
export function eraseAt(strokes, x, y, radius) {
  let changed = false;
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const pieces = eraseFromStroke(strokes[index], x, y, radius);
    if (!pieces) continue;
    strokes.splice(index, 1, ...pieces);
    changed = true;
  }
  return changed;
}

/** Numery kresek leżących w całości w prostokącie (zaznaczanie prostokątem; liczy się linia środkowa kreski). */
export function strokesInRect(strokes, rect) {
  const [left, right] = [Math.min(rect.x0, rect.x1), Math.max(rect.x0, rect.x1)];
  const [top, bottom] = [Math.min(rect.y0, rect.y1), Math.max(rect.y0, rect.y1)];
  const found = [];
  strokes.forEach((stroke, index) => {
    const { points } = stroke;
    for (let point = 0; point < points.length; point += 3) {
      if (points[point] < left || points[point] > right || points[point + 1] < top || points[point + 1] > bottom) return;
    }
    if (points.length > 0) found.push(index);
  });
  return found;
}

/** Granice kilku kresek (zaznaczenie) albo null. */
export function selectionBounds(strokes) {
  if (strokes.length === 0) return null;
  const all = strokes.map(strokeBounds);
  return {
    minX: Math.min(...all.map((bounds) => bounds.minX)), minY: Math.min(...all.map((bounds) => bounds.minY)),
    maxX: Math.max(...all.map((bounds) => bounds.maxX)), maxY: Math.max(...all.map((bounds) => bounds.maxY))
  };
}

/** Kreska przesunięta o (dx, dy) – nowa kreska, oryginał bez zmian. */
export function translateStroke(stroke, dx, dy) {
  const points = stroke.points.slice();
  for (let index = 0; index < points.length; index += 3) {
    points[index] = round(points[index] + dx, 1);
    points[index + 1] = round(points[index + 1] + dy, 1);
  }
  return { tool: stroke.tool, color: stroke.color, points };
}

// ---------------------------------------------------------------- linijka

/** Kąty, do których linijka lekko przyskakuje (co 45°), i jak blisko (w stopniach). */
export const RULER_SNAP_STEP = 45;
export const RULER_SNAP_TOLERANCE = 2.5;

/** Kąt linijki (radiany) z przyskoczeniem do 0°, 45°, 90°, 135°…, w zakresie (−π, π]. */
export function snapRulerAngle(angle) {
  let degrees = ((angle * 180) / Math.PI) % 360;
  if (degrees > 180) degrees -= 360;
  if (degrees <= -180) degrees += 360;
  const nearest = Math.round(degrees / RULER_SNAP_STEP) * RULER_SNAP_STEP;
  if (Math.abs(degrees - nearest) <= RULER_SNAP_TOLERANCE) degrees = nearest === -180 ? 180 : nearest;
  return (degrees * Math.PI) / 180;
}

/**
 * Kąt linijki do wyświetlenia: pełne stopnie 0–179, liczone jak w geometrii – przeciwnie do ruchu
 * wskazówek zegara od poziomu (oś y ekranu biegnie w dół). Linijka obrócona o 180° to ta sama linijka.
 */
export function rulerDegrees(angle) {
  const degrees = Math.round((-angle * 180) / Math.PI);
  return ((degrees % 180) + 180) % 180;
}

/** Położenie punktu względem linijki { x, y, angle }: wzdłuż niej i w poprzek (od linii środkowej). */
export function rulerOffset(ruler, x, y) {
  const [cos, sin] = [Math.cos(ruler.angle), Math.sin(ruler.angle)];
  const [dx, dy] = [x - ruler.x, y - ruler.y];
  return { along: dx * cos + dy * sin, across: -dx * sin + dy * cos };
}

/** Punkt na prostej równoległej do linijki w odległości `across` od jej środka (kreska przy krawędzi). */
export function rulerPoint(ruler, along, across) {
  const [cos, sin] = [Math.cos(ruler.angle), Math.sin(ruler.angle)];
  return { x: ruler.x + along * cos - across * sin, y: ruler.y + along * sin + across * cos };
}

// ---------------------------------------------------------------- historia

/** Te same kreski w tej samej kolejności. */
function sameStrokes(first, second) {
  return first.length === second.length && first.every((stroke, index) => stroke === second[index]);
}

function replaceStrokes(target, source) {
  target.length = 0;
  for (const stroke of source) target.push(stroke);
}

/**
 * Historia cofania. Od 1.12.1 każdy krok to stan listy kresek przed zmianą i po niej – kreski się
 * nie zmieniają (starcie fragmentu, przesunięcie dają nowe kreski), więc cofnięcie przywraca
 * dokładnie poprzedni rysunek. Zmiana trwająca dłużej (pociągnięcie gumką, przesuwanie zaznaczenia)
 * to jeden krok: begin() … commit().
 */
export class DrawingHistory {
  constructor(strokes) {
    this.strokes = strokes;
    this.done = [];
    this.undone = [];
    this.before = null;
  }

  /** Początek zmiany – zapamiętany stan sprzed niej; kolejne zmiany do commit() to jeden krok. */
  begin() {
    if (!this.before) this.before = [...this.strokes];
  }

  /** Koniec zmiany; zwraca, czy coś się zmieniło (zmiana bez skutku nie trafia do historii). */
  commit() {
    const before = this.before;
    this.before = null;
    if (!before || sameStrokes(before, this.strokes)) return false;
    this.done.push({ before, after: [...this.strokes] });
    this.undone = [];
    return true;
  }

  /** Nowa kreska na wierzchu (osobny krok). */
  add(stroke) {
    this.commit();
    this.begin();
    this.strokes.push(stroke);
    this.commit();
  }

  /** Usuwa kreski o podanych numerach; kolejne usunięcia do closeStep() to jeden krok (pociągnięcie gumką). */
  remove(indexes) {
    const unique = [...new Set(indexes)].filter((index) => index >= 0 && index < this.strokes.length).sort((a, b) => b - a);
    if (unique.length === 0) return false;
    this.begin();
    for (const index of unique) this.strokes.splice(index, 1);
    return true;
  }

  /** Koniec pociągnięcia gumką – następne usunięcie to nowy krok cofania. */
  closeStep() {
    return this.commit();
  }

  get canUndo() { return this.done.length > 0 || Boolean(this.before && !sameStrokes(this.before, this.strokes)); }
  get canRedo() { return this.undone.length > 0; }

  undo() {
    this.commit();
    const step = this.done.pop();
    if (!step) return false;
    replaceStrokes(this.strokes, step.before);
    this.undone.push(step);
    return true;
  }

  redo() {
    this.commit();
    const step = this.undone.pop();
    if (!step) return false;
    replaceStrokes(this.strokes, step.after);
    this.done.push(step);
    return true;
  }
}

/** Najwięcej kresek i punktów – większy zapis to raczej uszkodzone dane niż rysunek. */
export const MAX_STROKES = 20000;
export const MAX_POINTS = 60000;
const HEX = /^#[0-9a-f]{6}$/i;

/** Pusty rysunek (strona albo zdjęcie pod spodem). */
export function emptyDrawing({ photo = null, paper = 'grid' } = {}) {
  const scale = photo ? Math.min(1, PHOTO_PAGE_MAX / Math.max(photo.width, photo.height)) : 1;
  return {
    version: DRAWING_VERSION,
    width: photo ? Math.max(16, Math.round(photo.width * scale)) : PAGE_WIDTH,
    height: photo ? Math.max(16, Math.round(photo.height * scale)) : PAGE_HEIGHT,
    paper: photo ? 'plain' : paper,
    strokes: [],
    ...(photo ? { photo } : {})
  };
}

/**
 * Sprawdzony rysunek albo null (zapis, kopia zapasowa): złe kreski i punkty są pomijane, liczby
 * ograniczone do strony. Zdjęcie bez bajtów (opis z pliku danych) zostaje bez nich.
 */
export function cleanDrawing(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // Brak albo zerowy rozmiar – rysunek uszkodzony; bardzo mały albo bardzo duży – przycięty do granic.
  const width = finite(raw.width) && raw.width >= 1 ? clamp(Math.round(raw.width), 16, 8192) : null;
  const height = finite(raw.height) && raw.height >= 1 ? clamp(Math.round(raw.height), 16, 8192) : null;
  if (!width || !height) return null;
  const strokes = [];
  for (const stroke of Array.isArray(raw.strokes) ? raw.strokes.slice(0, MAX_STROKES) : []) {
    if (!stroke || (stroke.tool !== 'pen' && stroke.tool !== 'highlighter') || !HEX.test(stroke.color ?? '')) continue;
    if (!Array.isArray(stroke.points)) continue;
    const points = [];
    const source = stroke.points.slice(0, MAX_POINTS * 3);
    for (let index = 0; index + 2 < source.length; index += 3) {
      const [x, y, w] = [source[index], source[index + 1], source[index + 2]];
      if (!finite(x) || !finite(y) || !finite(w)) continue;
      points.push(clamp(x, -width, width * 2), clamp(y, -height, height * 2), clamp(w, WIDTH_LIMITS.min, WIDTH_LIMITS.max));
    }
    if (points.length >= 3) strokes.push({ tool: stroke.tool, color: stroke.color.toLowerCase(), points });
  }
  let photo = null;
  if (raw.photo && typeof raw.photo === 'object' && /^image\//.test(raw.photo.type ?? '')) {
    const bytes = photoBytes(raw.photo.bytes);
    photo = {
      type: raw.photo.type,
      width: finite(raw.photo.width) ? raw.photo.width : width,
      height: finite(raw.photo.height) ? raw.photo.height : height,
      ...(bytes ? { bytes } : {})
    };
  }
  return {
    version: DRAWING_VERSION,
    width,
    height,
    paper: PAPERS.includes(raw.paper) ? raw.paper : 'plain',
    strokes,
    ...(photo ? { photo } : {})
  };
}

/** Bajty zdjęcia jako ArrayBuffer (z ArrayBuffer albo widoku, np. z archiwum ZIP) albo null. */
function photoBytes(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes.byteLength > 0 ? bytes : null;
  if (ArrayBuffer.isView(bytes) && bytes.byteLength > 0) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return null;
}

/** Rysunek bez bajtów zdjęcia (do pliku JSON w kopii – zdjęcie idzie osobnym plikiem). */
export function drawingWithoutPhotoBytes(drawing) {
  if (!drawing?.photo) return drawing;
  const photo = { ...drawing.photo };
  delete photo.bytes;
  return { ...drawing, photo };
}

/** Czy rysunek ma coś do pokazania (kreski albo zdjęcie). */
export function hasContent(drawing) {
  return Boolean(drawing && (drawing.strokes.length > 0 || drawing.photo));
}

/** Kolejna wolna sygnatura rysunku: „Rysunek 1”, „Rysunek 2”… (wśród sygnatur obrazów notatki). */
export function nextDrawingLabel(labels) {
  const used = new Set(labels.map((label) => String(label ?? '').trim().toLowerCase()));
  let number = 1;
  while (used.has(`rysunek ${number}`)) number += 1;
  return `Rysunek ${number}`;
}
