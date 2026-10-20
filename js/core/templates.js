// Tło rysunku (od 1.15): poziomy jasności linii i kratki oraz szablon – kalka pod kreskami
// (wbudowane boisko piłkarskie albo obraz z pliku), położony na stronie i nieruchomy jak kratka.
//
// Szablon w rysunku: { source: 'pitch' | 'image', x, y, w, h, level, type?, width?, height?, bytes? }
//   (x, y) – lewy górny róg na stronie, w, h – wielkość (jednostki strony), level – jasność 0–4;
//   obraz: type, width, height – plik (PNG, JPEG, GIF, WebP), bytes – jego bajty.

/** Jasność linii i kratki tła oraz szablonu: pięć poziomów, od najjaśniejszego. */
export const LEVELS = 5;
export const LEVEL_LABELS = Object.freeze(['Bardzo jasne', 'Jasne', 'Średnie', 'Ciemne', 'Bardzo ciemne']);
/** Domyślnie: kratka i linie jak do 1.14 (poziom 1), szablon – średni. */
export const DEFAULT_PAPER_LEVEL = 1;
export const DEFAULT_TEMPLATE_LEVEL = 2;
export const PAPER_COLORS = Object.freeze({
  grid: Object.freeze(['#eff0f4', '#e4e5ec', '#d1d4de', '#b5b9c8', '#9196aa']),
  lines: Object.freeze(['#e7ecf5', '#d8e0ee', '#c0cce2', '#a3b4d2', '#8296bd'])
});
/** Krycie szablonu na kolejnych poziomach (szablon jest mnożony z tłem – biel znika). */
export const TEMPLATE_ALPHA = Object.freeze([0.14, 0.28, 0.45, 0.7, 1]);
export const TEMPLATE_SOURCES = Object.freeze(['pitch', 'image']);
export const TEMPLATE_LABELS = Object.freeze({ pitch: 'Boisko piłkarskie', image: 'Szablon z pliku' });

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export const cleanLevel = (value, fallback) => (Number.isInteger(value) && value >= 0 && value < LEVELS ? value : fallback);

/**
 * Boisko piłkarskie (przepisy: 105 × 68 m) w metrach: linie { kind: 'line', x1, y1, x2, y2 },
 * okręgi i łuki { kind: 'arc', x, y, r, from, to } (kąty w radianach), punkty { kind: 'dot', x, y }.
 */
export const PITCH = Object.freeze((() => {
  const [width, height] = [105, 68];
  const middle = height / 2;
  const items = [
    { kind: 'line', x1: 0, y1: 0, x2: width, y2: 0 },
    { kind: 'line', x1: width, y1: 0, x2: width, y2: height },
    { kind: 'line', x1: width, y1: height, x2: 0, y2: height },
    { kind: 'line', x1: 0, y1: height, x2: 0, y2: 0 },
    { kind: 'line', x1: width / 2, y1: 0, x2: width / 2, y2: height },
    { kind: 'arc', x: width / 2, y: middle, r: 9.15, from: 0, to: Math.PI * 2 },
    { kind: 'dot', x: width / 2, y: middle }
  ];
  // Pole karne 16,5 × 40,32 m, pole bramkowe 5,5 × 18,32 m, punkt karny 11 m, łuk 9,15 m, bramka 7,32 × 2 m.
  for (const side of [0, 1]) {
    const edge = side === 0 ? 0 : width;
    const inward = side === 0 ? 1 : -1;
    const box = (depth, span) => {
      const [top, bottom, inner] = [middle - span / 2, middle + span / 2, edge + inward * depth];
      items.push({ kind: 'line', x1: edge, y1: top, x2: inner, y2: top });
      items.push({ kind: 'line', x1: inner, y1: top, x2: inner, y2: bottom });
      items.push({ kind: 'line', x1: inner, y1: bottom, x2: edge, y2: bottom });
    };
    box(16.5, 40.32);
    box(5.5, 18.32);
    const spot = edge + inward * 11;
    items.push({ kind: 'dot', x: spot, y: middle });
    // Łuk poza polem karnym: część okręgu wokół punktu karnego za linią 16,5 m.
    const reach = Math.acos((16.5 - 11) / 9.15);
    const facing = side === 0 ? 0 : Math.PI;
    items.push({ kind: 'arc', x: spot, y: middle, r: 9.15, from: facing - reach, to: facing + reach });
    const goal = edge - inward * 2;
    items.push({ kind: 'line', x1: edge, y1: middle - 3.66, x2: goal, y2: middle - 3.66 });
    items.push({ kind: 'line', x1: goal, y1: middle - 3.66, x2: goal, y2: middle + 3.66 });
    items.push({ kind: 'line', x1: goal, y1: middle + 3.66, x2: edge, y2: middle + 3.66 });
  }
  // Łuki rożne (1 m).
  items.push({ kind: 'arc', x: 0, y: 0, r: 1, from: 0, to: Math.PI / 2 });
  items.push({ kind: 'arc', x: width, y: 0, r: 1, from: Math.PI / 2, to: Math.PI });
  items.push({ kind: 'arc', x: width, y: height, r: 1, from: Math.PI, to: Math.PI * 1.5 });
  items.push({ kind: 'arc', x: 0, y: height, r: 1, from: Math.PI * 1.5, to: Math.PI * 2 });
  return { width, height, items };
})());

/** Wielkość szablonu (jego proporcje) – boisko w metrach, obraz w pikselach. */
export const templateSize = (template) => (template.source === 'pitch'
  ? { width: PITCH.width, height: PITCH.height }
  : { width: template.width, height: template.height });

/** Szablon dopasowany do strony (z marginesem jednej kratki), na środku. */
export function fitTemplate(template, pageWidth, pageHeight, margin = 44) {
  const { width, height } = templateSize(template);
  const scale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height);
  const [w, h] = [width * scale, height * scale];
  return { ...template, x: round((pageWidth - w) / 2), y: round((pageHeight - h) / 2), w: round(w), h: round(h) };
}

/** Szablon na środku strony (ta sama wielkość). */
export const centerTemplate = (template, pageWidth, pageHeight) => ({
  ...template, x: round((pageWidth - template.w) / 2), y: round((pageHeight - template.h) / 2)
});

/** Szablon powiększony (factor > 1) albo pomniejszony wokół swojego środka; najmniej 1/20 strony, najwyżej 4 strony. */
export function scaleTemplate(template, factor, pageWidth, pageHeight) {
  const longest = Math.max(pageWidth, pageHeight);
  const limit = clamp(factor, longest / 20 / Math.max(template.w, template.h), (longest * 4) / Math.max(template.w, template.h));
  const [w, h] = [template.w * limit, template.h * limit];
  return { ...template, x: round(template.x + (template.w - w) / 2), y: round(template.y + (template.h - h) / 2), w: round(w), h: round(h) };
}

const round = (value) => Math.round(value * 10) / 10;

/** Wielkość szablonu w procentach (od 1.19 wpisywana): 100% – dopasowany do strony. */
export function templatePercent(template, pageWidth, pageHeight) {
  return (template.w / fitTemplate(template, pageWidth, pageHeight).w) * 100;
}

/** Szablon o wpisanej wielkości (procent wielkości dopasowanej) – wokół swojego środka, w granicach scaleTemplate. */
export function setTemplatePercent(template, percent, pageWidth, pageHeight) {
  const target = (fitTemplate(template, pageWidth, pageHeight).w * percent) / 100;
  return scaleTemplate(template, target / template.w, pageWidth, pageHeight);
}

/** Narożniki szablonu: [u, v] – 0 lewy albo górny brzeg, 1 prawy albo dolny. */
export const TEMPLATE_CORNERS = Object.freeze({ nw: [0, 0], ne: [1, 0], se: [1, 1], sw: [0, 1] });

/** Narożnik szablonu `corner` jako punkt strony. */
export function templateCorner(template, corner) {
  const [u, v] = TEMPLATE_CORNERS[corner];
  return { x: template.x + u * template.w, y: template.y + v * template.h };
}

/**
 * Szablon po przeciągnięciu narożnika `corner` do punktu `point` (od 1.19): przeciwny narożnik zostaje,
 * proporcje też – wielkość z rzutu punktu na przekątną; granice jak przy +/−.
 */
export function resizeTemplateCorner(template, corner, point, pageWidth, pageHeight) {
  const [u, v] = TEMPLATE_CORNERS[corner];
  const fixed = templateCorner(template, Object.keys(TEMPLATE_CORNERS).find((key) => {
    const [a, b] = TEMPLATE_CORNERS[key];
    return a === 1 - u && b === 1 - v;
  }));
  const [dx, dy] = [(u ? 1 : -1) * template.w, (v ? 1 : -1) * template.h];
  const factor = ((point.x - fixed.x) * dx + (point.y - fixed.y) * dy) / (dx * dx + dy * dy);
  const longest = Math.max(pageWidth, pageHeight);
  const size = Math.max(template.w, template.h);
  const limit = clamp(factor, longest / 20 / size, (longest * 4) / size);
  const [w, h] = [template.w * limit, template.h * limit];
  return { ...template, x: round(u ? fixed.x : fixed.x - w), y: round(v ? fixed.y : fixed.y - h), w: round(w), h: round(h) };
}

/** Skala rysunku z boiska: ile metrów ma kratka (`step` jednostek strony), gdy boisko ma szerokość template.w. */
export const pitchScale = (template, step = 44) => (PITCH.width * step) / template.w;

/** Sprawdzony szablon albo null; bajty obrazu (ArrayBuffer) – z `bytes`, gdy są (kopia zapasowa dokłada je osobno). */
export function cleanTemplate(raw, pageWidth, pageHeight, toBytes) {
  if (!raw || typeof raw !== 'object' || !TEMPLATE_SOURCES.includes(raw.source)) return null;
  if (![raw.x, raw.y, raw.w, raw.h].every(finite) || raw.w <= 0 || raw.h <= 0) return null;
  const longest = Math.max(pageWidth, pageHeight);
  const template = {
    source: raw.source,
    x: clamp(raw.x, -longest * 4, longest * 4),
    y: clamp(raw.y, -longest * 4, longest * 4),
    w: clamp(raw.w, 1, longest * 4),
    h: clamp(raw.h, 1, longest * 4),
    level: cleanLevel(raw.level, DEFAULT_TEMPLATE_LEVEL)
  };
  if (raw.source === 'pitch') return template;
  if (!/^image\/(png|jpeg|gif|webp)$/.test(raw.type ?? '') || !finite(raw.width) || !finite(raw.height) || raw.width < 1 || raw.height < 1) return null;
  const bytes = toBytes(raw.bytes);
  return { ...template, type: raw.type, width: Math.round(raw.width), height: Math.round(raw.height), ...(bytes ? { bytes } : {}) };
}
