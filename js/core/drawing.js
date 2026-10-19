// Rysunki odręczne w notatce (od 1.12): kreski pióra i zakreślacza zapisane jako punkty, żeby
// rysunek dało się później poprawiać. Tu – bez przeglądarki: grubość kreski z nacisku rysika,
// wygładzanie, gumka całych kresek, historia cofania, sprawdzanie danych (zapis, kopia zapasowa).
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

/** Ustawienia narzędzi na tym urządzeniu (pióro: czułość, wygładzanie i grubości; zakreślacz: grubość). */
export function defaultToolSettings() {
  return {
    sensitivity: 'medium',
    smoothing: 0.5,
    penWidths: PEN_WIDTHS.map((width) => ({ ...width })),
    penWidth: 1,
    penColor: 'black',
    highlighterWidth: 1,
    highlighterColor: 'yellow'
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
    highlighterColor: HIGHLIGHTER_COLORS.some((color) => color.id === raw.highlighterColor) ? raw.highlighterColor : base.highlighterColor
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

/**
 * Historia zmian rysunku: dodanie kreski i usunięcie kresek (gumka) – do cofania i ponawiania.
 * Działa na tablicy kresek przekazanej przy tworzeniu (zmienia ją w miejscu).
 */
export class DrawingHistory {
  constructor(strokes) {
    this.strokes = strokes;
    this.done = [];
    this.undone = [];
  }

  /** Nowa kreska na wierzchu. */
  add(stroke) {
    this.strokes.push(stroke);
    this.done.push({ kind: 'add', stroke });
    this.undone = [];
  }

  /** Usuwa kreski o podanych numerach (jedno pociągnięcie gumką – jeden krok cofania). */
  remove(indexes) {
    const unique = [...new Set(indexes)].filter((index) => index >= 0 && index < this.strokes.length).sort((a, b) => a - b);
    if (unique.length === 0) return false;
    const removed = unique.map((index) => ({ index, stroke: this.strokes[index] }));
    for (let position = unique.length - 1; position >= 0; position -= 1) this.strokes.splice(unique[position], 1);
    const last = this.done[this.done.length - 1];
    // Kolejne kreski starte tym samym pociągnięciem gumki łączą się w jeden krok.
    if (last?.kind === 'remove' && last.open) {
      last.groups.push(removed);
    } else {
      this.done.push({ kind: 'remove', groups: [removed], open: true });
    }
    this.undone = [];
    return true;
  }

  /** Koniec pociągnięcia gumką – następne usunięcie to nowy krok cofania. */
  closeStep() {
    const last = this.done[this.done.length - 1];
    if (last?.kind === 'remove') last.open = false;
  }

  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }

  undo() {
    this.closeStep();
    const step = this.done.pop();
    if (!step) return false;
    if (step.kind === 'add') {
      const index = this.strokes.lastIndexOf(step.stroke);
      if (index >= 0) this.strokes.splice(index, 1);
    } else {
      // Grupy wracają w odwrotnej kolejności, każda na swoje miejsca.
      for (let group = step.groups.length - 1; group >= 0; group -= 1) {
        for (const { index, stroke } of step.groups[group]) this.strokes.splice(index, 0, stroke);
      }
    }
    this.undone.push(step);
    return true;
  }

  redo() {
    const step = this.undone.pop();
    if (!step) return false;
    if (step.kind === 'add') {
      this.strokes.push(step.stroke);
    } else {
      for (const group of step.groups) {
        for (let position = group.length - 1; position >= 0; position -= 1) {
          const index = this.strokes.indexOf(group[position].stroke);
          if (index >= 0) this.strokes.splice(index, 1);
        }
      }
    }
    this.done.push(step);
    return true;
  }
}

// ---------------------------------------------------------------- dane rysunku

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
