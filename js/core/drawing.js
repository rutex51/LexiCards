// Rysunki odręczne w notatce (od 1.12): kreski pióra i zakreślacza zapisane jako punkty, żeby
// rysunek dało się później poprawiać. Tu – bez przeglądarki: grubość kreski z nacisku rysika,
// wygładzanie, gumka całych kresek i fragmentów (od 1.12.1), zaznaczanie i przesuwanie kresek,
// linijka, historia cofania, sprawdzanie danych (zapis, kopia zapasowa). Od 1.14: skala rysunku
// i liczby na linijce, przyciąganie zera linijki do przecięć i linii, zaznaczanie fragmentów
// prostokątem albo lassem (kreski cięte na brzegu obszaru), własne kolory. Od 1.15: kształty
// geometryczne (core/shapes.js), jasność tła i szablon pod kreskami (core/templates.js).
//
// Rysunek: { version: 2, width, height, paper: 'plain' | 'lines' | 'grid', strokes, photo? }
//   width, height – wielkość strony w jednostkach rysunku (strona bez zdjęcia: 1600 × 1100);
//   strokes – [{ tool: 'pen' | 'highlighter', color: '#rrggbb', points: [x, y, w, x, y, w, …] }],
//   w – grubość kreski w danym punkcie (pióro – zależna od nacisku, zakreślacz – stała);
//   od 1.13 także pola tekstowe { tool: 'text', color, x, y, size, text, maxWidth, width, height }
//   i wzory { tool: 'math', color, x, y, size, source, width, height } – (x, y) to lewy górny róg,
//   width i height – zmierzone przy wstawieniu (zaznaczanie, gumka), size – wysokość czcionki;
//   photo – { type, width, height, bytes } – zdjęcie pod kreskami („Rysuj na zdjęciu”);
//   od 1.14 scale – { value, unit } – ile w rzeczywistości ma jedna kratka (linijka, długość kreski);
//   od 1.15 w strokes także kształty { tool: 'shape', … } (core/shapes.js), paperLevel – jasność
//   linii i kratki (0–4), template – szablon pod kreskami (core/templates.js) albo brak;
//   od 1.17 kształt może mieć wypełnienie (fill) i tekst (label).

import {
  SHAPES, SHAPE_FILLS, arrowHead, cleanShape, isShape, shapeAsStroke, shapeBounds, shapeOutline, touchesShape
} from './shapes.js';
import { DEFAULT_PAPER_LEVEL, cleanLevel, cleanTemplate } from './templates.js';

/**
 * 1 – kreski (1.12), 2 – także pola tekstowe i wzory (1.13), 3 – kształty, jasność tła, szablon (1.15),
 * 4 – wypełnienie i tekst kształtu (1.17).
 */
export const DRAWING_VERSION = 4;
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

/** Skala rysunku (od 1.14): jedna kratka = value jednostek – SI albo imperialnych; meters – długość jednostki. */
export const SCALE_UNITS = Object.freeze([
  { id: 'mm', label: 'mm', name: 'milimetry', system: 'si', meters: 0.001 },
  { id: 'cm', label: 'cm', name: 'centymetry', system: 'si', meters: 0.01 },
  { id: 'm', label: 'm', name: 'metry', system: 'si', meters: 1 },
  { id: 'km', label: 'km', name: 'kilometry', system: 'si', meters: 1000 },
  { id: 'in', label: 'in', name: 'cale', system: 'imperial', meters: 0.0254 },
  { id: 'ft', label: 'ft', name: 'stopy', system: 'imperial', meters: 0.3048 },
  { id: 'yd', label: 'yd', name: 'jardy', system: 'imperial', meters: 0.9144 },
  { id: 'mi', label: 'mi', name: 'mile', system: 'imperial', meters: 1609.344 }
]);
export const defaultScale = () => ({ value: 1, unit: 'cm' });
const unitOf = (id) => SCALE_UNITS.find((unit) => unit.id === id) ?? SCALE_UNITS[1];

/** Sprawdzona skala rysunku (zła albo brak – 1 kratka = 1 cm). */
export function cleanScale(raw) {
  if (!raw || typeof raw !== 'object' || !finite(raw.value) || raw.value <= 0 || !SCALE_UNITS.some((unit) => unit.id === raw.unit)) return defaultScale();
  return { value: clamp(raw.value, 1e-6, 1e9), unit: raw.unit };
}

/** Liczba po polsku: przecinek dziesiętny, kilka cyfr znaczących, bez zbędnych zer. */
export function formatNumber(value) {
  const size = Math.abs(value);
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : size >= 1 ? 2 : 3;
  return String(Number(value.toFixed(digits))).replace('.', ',');
}

/** Długość w jednostkach strony jako długość rzeczywista w skali rysunku, np. „3,5 m”. */
export function formatLength(units, scale) {
  const { value, unit } = cleanScale(scale);
  return `${formatNumber((units / PAPER_STEP) * value)} ${unitOf(unit).label}`;
}

/** Od 1.17 (wymiary kształtu z klawiatury): długość w skali rysunku, z powrotem w jednostkach strony i skrót jednostki. */
export const toScaleLength = (units, scale) => (units / PAPER_STEP) * cleanScale(scale).value;
export const fromScaleLength = (length, scale) => (length / cleanScale(scale).value) * PAPER_STEP;
export const scaleUnitLabel = (scale) => unitOf(cleanScale(scale).unit).label;

/** Liczba wpisana po polsku albo z kropką („4,5”, „ -12.5 cm”, „15°”) albo null. */
export function parseDecimal(text) {
  const match = String(text ?? '').replace(/\s/g, '').replace(',', '.').match(/^[-+−]?\d*\.?\d+/);
  if (!match) return null;
  const value = Number(match[0].replace('−', '-'));
  return Number.isFinite(value) ? value : null;
}

/**
 * Szacunek skali na ekranie: kratka ma na ekranie `squarePx` pikseli CSS, a ekran ma ok.
 * `pxPerInch` pikseli CSS na cal. Zwraca { millimeters – kratka na ekranie, ratio – N w skali 1:N }.
 */
export function screenScale(scale, squarePx, pxPerInch) {
  const { value, unit } = cleanScale(scale);
  const millimeters = (squarePx / pxPerInch) * 25.4;
  return { millimeters, ratio: (value * unitOf(unit).meters * 1000) / millimeters };
}

/** Skala 1:N zaokrąglona do dwóch cyfr znaczących („1:170”, „1:2 500”, „1:1,6”; powiększenie – „2:1”, „2,5:1”). */
export function formatRatio(ratio) {
  if (!finite(ratio) || ratio <= 0) return '–';
  const nice = (value) => {
    const power = 10 ** (Math.floor(Math.log10(value)) - 1);
    return Math.round(value / power) * power;
  };
  const text = (value) => (value >= 100 ? String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : formatNumber(value));
  return ratio >= 1 ? `1:${text(nice(ratio))}` : `${text(nice(1 / ratio))}:1`;
}

/** Skala, w której kratka ma tyle, ile widać na ekranie (1:1) – w jednostce `unit`. */
export function screenScaleValue(squareMillimeters, unit) {
  return Number(((squareMillimeters / 1000) / unitOf(unit).meters).toPrecision(3));
}

/** Własne kolory (od 1.14): zapamiętane najwyżej trzy, najnowszy pierwszy. */
export const CUSTOM_COLOR_LIMIT = 3;
export const isHexColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/** Kolor z HSL (odcień 0–360, nasycenie i jasność 0–100) jako #rrggbb – siatka kolorów. */
export function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[channel(0), channel(8), channel(4)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/** Składowe #rrggbb → [r, g, b] (0–255). */
export const hexToRgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
export const rgbToHex = (rgb) => `#${rgb.map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;

/** Lista własnych kolorów po dodaniu `hex` (bez powtórzeń, najnowszy pierwszy, najwyżej trzy). */
export function rememberColor(colors, hex) {
  const value = hex.toLowerCase();
  return [value, ...colors.filter((color) => color !== value)].slice(0, CUSTOM_COLOR_LIMIT);
}

/**
 * Zaznaczanie (od 1.14): prostokąt albo lasso; tryb – według kierunku, całe kreski albo fragmenty,
 * a od 1.17 wycinek – obraz wszystkiego w obszarze (z tłem, kratką i częściami kresek).
 */
export const SELECT_SHAPES = Object.freeze(['rect', 'lasso']);
export const SELECT_MODES = Object.freeze(['auto', 'whole', 'region', 'snip']);
export const SELECT_MODE_LABELS = Object.freeze({ auto: 'Auto', whole: 'Całe', region: 'Fragmenty', snip: 'Wycinek' });

/** Pola tekstowe i wzory (od 1.13): wielkość czcionki w jednostkach strony (kratka ma 44). */
export const TEXT_SIZES = Object.freeze([28, 40, 56]);
export const TEXT_SIZE_LABELS = Object.freeze(['Mała', 'Średnia', 'Duża']);
/** Najdłuższy tekst pola i zapis wzoru. */
export const ELEMENT_TEXT_MAX = 2000;

/** Czy to pole tekstowe, wzór albo (od 1.15) kształt – a nie kreska z punktami. */
export const isElement = (stroke) => stroke?.tool === 'text' || stroke?.tool === 'math' || stroke?.tool === 'shape';

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
    eraserSize: 1,
    textSize: 1,
    customColors: [],
    selectShape: 'rect',
    selectMode: 'auto',
    rulerSnap: true,
    shape: 'rect',
    shapeFill: 'none',
    guide: defaultGuide()
  };
}

/**
 * Liniuszek (od 1.15): odstęp linii w kratkach, kąt linii w stopniach (0 – poziomo, przeciwnie do
 * ruchu wskazówek zegara), linie poprzeczne – odstęp wzdłuż linii i kąt względem linii (90 – prosto),
 * przyciąganie pióra do linii.
 */
export const defaultGuide = () => ({ spacing: 1, angle: 0, cross: false, crossSpacing: 1, crossAngle: 90, snap: true });
export const GUIDE_LIMITS = Object.freeze({ spacing: [0.25, 6], crossSpacing: [0.25, 12], angle: [-90, 90], crossAngle: [10, 170] });

function cleanGuide(raw) {
  const base = defaultGuide();
  if (!raw || typeof raw !== 'object') return base;
  const number = (key, step) => (finite(raw[key]) ? clamp(Math.round(raw[key] / step) * step, ...GUIDE_LIMITS[key]) : base[key]);
  return {
    spacing: number('spacing', 0.25),
    angle: number('angle', 1),
    cross: typeof raw.cross === 'boolean' ? raw.cross : base.cross,
    crossSpacing: number('crossSpacing', 0.25),
    crossAngle: number('crossAngle', 1),
    snap: typeof raw.snap === 'boolean' ? raw.snap : base.snap
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
    // Od 1.14 kolor może być też własny (#rrggbb).
    penColor: INK_COLORS.some((color) => color.id === raw.penColor) || isHexColor(raw.penColor) ? raw.penColor : base.penColor,
    highlighterWidth: Number.isInteger(raw.highlighterWidth) && raw.highlighterWidth >= 0 && raw.highlighterWidth < HIGHLIGHTER_WIDTHS.length
      ? raw.highlighterWidth : base.highlighterWidth,
    highlighterColor: HIGHLIGHTER_COLORS.some((color) => color.id === raw.highlighterColor) || isHexColor(raw.highlighterColor)
      ? raw.highlighterColor : base.highlighterColor,
    eraserMode: ERASER_MODES.includes(raw.eraserMode) ? raw.eraserMode : base.eraserMode,
    eraserSize: Number.isInteger(raw.eraserSize) && raw.eraserSize >= 0 && raw.eraserSize < ERASER_SIZES.length ? raw.eraserSize : base.eraserSize,
    textSize: Number.isInteger(raw.textSize) && raw.textSize >= 0 && raw.textSize < TEXT_SIZES.length ? raw.textSize : base.textSize,
    customColors: Array.isArray(raw.customColors)
      ? [...new Set(raw.customColors.filter(isHexColor).map((color) => color.toLowerCase()))].slice(0, CUSTOM_COLOR_LIMIT) : base.customColors,
    selectShape: SELECT_SHAPES.includes(raw.selectShape) ? raw.selectShape : base.selectShape,
    selectMode: SELECT_MODES.includes(raw.selectMode) ? raw.selectMode : base.selectMode,
    rulerSnap: typeof raw.rulerSnap === 'boolean' ? raw.rulerSnap : base.rulerSnap,
    shape: SHAPES.includes(raw.shape) ? raw.shape : base.shape,
    shapeFill: SHAPE_FILLS.includes(raw.shapeFill) ? raw.shapeFill : base.shapeFill,
    guide: cleanGuide(raw.guide)
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
  if (isShape(stroke)) return touchesShape(stroke, x, y, radius);
  if (isElement(stroke)) {
    return x >= stroke.x - radius && x <= stroke.x + stroke.width + radius && y >= stroke.y - radius && y <= stroke.y + stroke.height + radius;
  }
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
  if (isShape(stroke)) {
    bounds = shapeBounds(stroke);
    boundsCache.set(stroke, bounds);
    return bounds;
  }
  if (isElement(stroke)) {
    bounds = { minX: stroke.x, minY: stroke.y, maxX: stroke.x + stroke.width, maxY: stroke.y + stroke.height };
    boundsCache.set(stroke, bounds);
    return bounds;
  }
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
  // Pola tekstowego i wzoru nie da się przeciąć – usuwa je gumka całych kresek albo zaznaczenie.
  if (isElement(stroke)) return null;
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
    if (isElement(stroke)) {
      if (elementCorners(stroke).every(([x, y]) => x >= left && x <= right && y >= top && y <= bottom)) found.push(index);
      return;
    }
    const { points } = stroke;
    for (let point = 0; point < points.length; point += 3) {
      if (points[point] < left || points[point] > right || points[point + 1] < top || points[point + 1] > bottom) return;
    }
    if (points.length > 0) found.push(index);
  });
  return found;
}

/**
 * Punkty, które muszą leżeć w obszarze, żeby pole tekstowe, wzór albo kształt był zaznaczony:
 * narożniki pola i wzoru, punkty obrysu kształtu (i grot strzałki).
 */
function elementCorners(element) {
  if (!isShape(element)) {
    return [[element.x, element.y], [element.x + element.width, element.y], [element.x + element.width, element.y + element.height], [element.x, element.y + element.height]];
  }
  const { points } = shapeOutline(element);
  const corners = [];
  for (let index = 0; index < points.length; index += 2) corners.push([points[index], points[index + 1]]);
  if (element.shape === 'arrow') for (const point of arrowHead(element)) corners.push([point.x, point.y]);
  return corners;
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
  if (isElement(stroke)) return { ...stroke, x: round(stroke.x + dx, 1), y: round(stroke.y + dy, 1) };
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

// ---------------------------------------------------------------- przyciąganie linijki (od 1.14)

/** Przecięcie odcinków A–B i C–D: { x, y, t } (t – położenie na A–B) albo null. */
function crossing(ax, ay, bx, by, cx, cy, dx, dy) {
  const [rx, ry, sx, sy] = [bx - ax, by - ay, dx - cx, dy - cy];
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / denominator;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + t * rx, y: ay + t * ry, t };
}

/** Odcinki kreski [ax, ay, bx, by] przechodzące nie dalej niż `radius` od punktu. */
function segmentsNear(stroke, x, y, radius) {
  const { points } = stroke;
  const found = [];
  for (let index = 3; index < points.length; index += 3) {
    const segment = [points[index - 3], points[index - 2], points[index], points[index + 1]];
    if (segmentDistance(x, y, ...segment) <= radius) found.push(segment);
  }
  return found;
}

/**
 * Punkt, do którego przyskakuje zero linijki: najbliższe przecięcie dwóch kresek w promieniu,
 * a gdy go nie ma – najbliższy punkt kreski, z kierunkiem kreski w tym miejscu (radiany).
 * Zwraca { x, y, kind: 'crossing' | 'line', angle? } albo null. Pola tekstowe i wzory się nie liczą.
 */
export function snapToStrokes(strokes, x, y, radius) {
  // Kształty (od 1.15) – jak kreski wzdłuż ich obrysu; pola tekstowe i wzory się nie liczą.
  const near = strokes
    .map((stroke) => (isShape(stroke) ? shapeAsStroke(stroke) : stroke))
    .filter((stroke) => {
      if (isElement(stroke) || stroke.points.length < 6) return false;
      const bounds = strokeBounds(stroke);
      return x >= bounds.minX - radius && x <= bounds.maxX + radius && y >= bounds.minY - radius && y <= bounds.maxY + radius;
    })
    .map((stroke) => segmentsNear(stroke, x, y, radius))
    .filter((segments) => segments.length > 0);
  let best = null;
  for (let first = 0; first < near.length; first += 1) {
    for (let second = first + 1; second < near.length; second += 1) {
      for (const a of near[first]) {
        for (const b of near[second]) {
          const point = crossing(...a, ...b);
          if (!point) continue;
          const distance = Math.hypot(point.x - x, point.y - y);
          if (distance <= radius && (!best || distance < best.distance)) best = { x: point.x, y: point.y, kind: 'crossing', distance };
        }
      }
    }
  }
  if (!best) {
    for (const segments of near) {
      for (const [ax, ay, bx, by] of segments) {
        const length = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = length === 0 ? 0 : clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length, 0, 1);
        const point = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
        const distance = Math.hypot(point.x - x, point.y - y);
        if (length > 0 && (!best || distance < best.distance)) best = { ...point, kind: 'line', angle: Math.atan2(by - ay, bx - ax), distance };
      }
    }
  }
  if (!best) return null;
  const snap = { ...best };
  delete snap.distance;
  return snap;
}

/** Różnica kierunków prostych (bez zwrotu, 0 – π/2). */
export function lineAngleDifference(first, second) {
  const difference = (((first - second) % Math.PI) + Math.PI) % Math.PI;
  return Math.min(difference, Math.PI - difference);
}

/** Kąt linijki prostopadłej do kierunku `lineAngle`, najbliższy obecnemu kątowi `current`. */
export function perpendicularAngle(lineAngle, current) {
  const candidates = [lineAngle + Math.PI / 2, lineAngle - Math.PI / 2];
  const turn = (angle) => Math.abs(Math.atan2(Math.sin(angle - current), Math.cos(angle - current)));
  return turn(candidates[0]) <= turn(candidates[1]) ? candidates[0] : candidates[1];
}

// ---------------------------------------------------------------- obszar zaznaczania (od 1.14)

/** Prostokąt { x0, y0, x1, y1 } jako wielokąt [x, y, x, y, …]. */
export const rectPolygon = ({ x0, y0, x1, y1 }) => [x0, y0, x1, y0, x1, y1, x0, y1];

/** Czy punkt leży wewnątrz wielokąta [x, y, x, y, …] (reguła parzystości). */
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 2; index < polygon.length; previous = index, index += 2) {
    const [xi, yi, xj, yj] = [polygon[index], polygon[index + 1], polygon[previous], polygon[previous + 1]];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Czy obrys biegnie zgodnie z ruchem wskazówek zegara – tak, jak go widać na ekranie (oś y w dół):
 * lasso zgodnie ze wskazówkami zaznacza wnętrze (fragmenty), przeciwnie – całe kreski.
 */
export function isClockwise(polygon) {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 2) {
    const next = (index + 2) % polygon.length;
    area += polygon[index] * polygon[next + 1] - polygon[next] * polygon[index + 1];
  }
  return area > 0;
}

/** Czy pole tekstowe albo wzór leży w całości w wielokącie. */
const elementInPolygon = (element, polygon) => elementCorners(element).every(([x, y]) => pointInPolygon(x, y, polygon));

/** Numery kresek, pól i wzorów leżących w całości w wielokącie (lasso – całe kreski). */
export function strokesInPolygon(strokes, polygon) {
  const found = [];
  strokes.forEach((stroke, index) => {
    if (isElement(stroke)) {
      if (elementInPolygon(stroke, polygon)) found.push(index);
      return;
    }
    const { points } = stroke;
    for (let point = 0; point < points.length; point += 3) {
      if (!pointInPolygon(points[point], points[point + 1], polygon)) return;
    }
    if (points.length > 0) found.push(index);
  });
  return found;
}

/**
 * Kreska podzielona brzegiem obszaru (zaznaczanie fragmentów): { inside, outside } – kawałki
 * w środku i poza nim, cięte dokładnie na brzegu (grubość przeliczona w miejscu cięcia). Kreska
 * w całości w środku zostaje tym samym obiektem; null – kreska nie sięga obszaru. Pola tekstowego
 * i wzoru nie da się przeciąć – są w środku tylko w całości.
 */
export function splitByPolygon(stroke, polygon) {
  if (isElement(stroke)) return elementInPolygon(stroke, polygon) ? { inside: [stroke], outside: [] } : null;
  const { points } = stroke;
  const count = points.length / 3;
  if (count === 0) return null;
  if (count === 1) return pointInPolygon(points[0], points[1], polygon) ? { inside: [stroke], outside: [] } : null;
  const runs = [];
  let current = null;
  const push = (inside, x, y, w) => {
    if (!current || current.inside !== inside) {
      // Nowy kawałek zaczyna się w punkcie, w którym skończył się poprzedni (na brzegu obszaru).
      const start = current ? current.points.slice(-3) : [];
      current = { inside, points: [...start] };
      runs.push(current);
    }
    current.points.push(x, y, w);
  };
  for (let point = 1; point < count; point += 1) {
    const [ax, ay, aw] = [points[point * 3 - 3], points[point * 3 - 2], points[point * 3 - 1]];
    const [bx, by, bw] = [points[point * 3], points[point * 3 + 1], points[point * 3 + 2]];
    const cuts = [0];
    for (let index = 0, previous = polygon.length - 2; index < polygon.length; previous = index, index += 2) {
      const hit = crossing(ax, ay, bx, by, polygon[previous], polygon[previous + 1], polygon[index], polygon[index + 1]);
      if (hit && hit.t > 0 && hit.t < 1) cuts.push(hit.t);
    }
    cuts.push(1);
    cuts.sort((a, b) => a - b);
    const at = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t, aw + (bw - aw) * t];
    if (point === 1) push(pointInPolygon(...at(Math.min(cuts[1], 1) / 2).slice(0, 2), polygon), ax, ay, aw);
    for (let index = 1; index < cuts.length; index += 1) {
      if (cuts[index] - cuts[index - 1] < 1e-9) continue;
      const middle = at((cuts[index - 1] + cuts[index]) / 2);
      push(pointInPolygon(middle[0], middle[1], polygon), ...at(cuts[index]));
    }
  }
  if (!runs.some((run) => run.inside)) return null;
  if (runs.every((run) => run.inside)) return { inside: [stroke], outside: [] };
  const pieces = (inside) => runs.filter((run) => run.inside === inside).map((run) => strokeFrom(stroke, run.points)).filter((piece) => piece.points.length >= 6);
  return { inside: pieces(true), outside: pieces(false) };
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

  /**
   * Odrzuca zmianę zaczętą begin() – kreski wracają do stanu sprzed niej, bez kroku cofania
   * (od 1.14: kreski przecięte przy zaznaczaniu fragmentu, gdy zaznaczenie zniknęło bez skutku).
   */
  rollback() {
    if (!this.before) return false;
    replaceStrokes(this.strokes, this.before);
    this.before = null;
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
    paperLevel: DEFAULT_PAPER_LEVEL,
    strokes: [],
    scale: defaultScale(),
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
    if (isElement(stroke)) {
      const element = cleanElement(stroke, width, height);
      if (element) strokes.push(element);
      continue;
    }
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
  const template = cleanTemplate(raw.template, width, height, photoBytes);
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
    paperLevel: cleanLevel(raw.paperLevel, DEFAULT_PAPER_LEVEL),
    strokes,
    scale: cleanScale(raw.scale),
    ...(template ? { template } : {}),
    ...(photo ? { photo } : {})
  };
}

/** Sprawdzone pole tekstowe, wzór albo kształt (zapis, kopia zapasowa) albo null. */
function cleanElement(raw, pageWidth, pageHeight) {
  if (raw.tool === 'shape') return cleanShape(raw, pageWidth, pageHeight, (color) => HEX.test(color ?? ''));
  const content = raw.tool === 'text' ? raw.text : raw.source;
  if (typeof content !== 'string' || content.trim() === '' || !HEX.test(raw.color ?? '')) return null;
  if (![raw.x, raw.y, raw.size, raw.width, raw.height].every(finite)) return null;
  const size = clamp(raw.size, 8, 200);
  const element = {
    tool: raw.tool,
    color: raw.color.toLowerCase(),
    x: clamp(raw.x, -pageWidth, pageWidth * 2),
    y: clamp(raw.y, -pageHeight, pageHeight * 2),
    size,
    [raw.tool === 'text' ? 'text' : 'source']: content.slice(0, ELEMENT_TEXT_MAX),
    width: clamp(raw.width, 1, pageWidth * 3),
    height: clamp(raw.height, 1, pageHeight * 3)
  };
  if (raw.tool === 'text') element.maxWidth = finite(raw.maxWidth) ? clamp(raw.maxWidth, size, pageWidth * 3) : pageWidth;
  return element;
}

/** Bajty zdjęcia jako ArrayBuffer (z ArrayBuffer albo widoku, np. z archiwum ZIP) albo null. */
function photoBytes(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes.byteLength > 0 ? bytes : null;
  if (ArrayBuffer.isView(bytes) && bytes.byteLength > 0) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return null;
}

/** Rysunek bez bajtów zdjęcia i szablonu (do pliku JSON w kopii – zdjęcie i szablon idą osobnymi plikami). */
export function drawingWithoutPhotoBytes(drawing) {
  if (!drawing?.photo && !drawing?.template?.bytes) return drawing;
  const copy = { ...drawing };
  for (const key of ['photo', 'template']) {
    if (!copy[key]) continue;
    copy[key] = { ...copy[key] };
    delete copy[key].bytes;
  }
  return copy;
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
