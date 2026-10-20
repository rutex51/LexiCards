// Symbole metrologiczne na rysunku (od 1.22.1) – bez przeglądarki: lista tolerancji geometrycznych
// (ISO 1101), układ ramki tolerancji, znaku bazy i symbolu chropowatości (ISO 1302) oraz sprawdzanie
// danych. Rysowanie (kreską – tak samo na iPadzie i w Windows) jest w js/ui/drawing-gdt.js.
//
// Ramka tolerancji { tool: 'gdt', x, y, width, height, size, color, symbol, value, diameter?, modifier?,
//   datums, cells, leader? }: (x, y) – lewy górny róg, size – wielkość tekstu, symbol – z GDT_SYMBOLS,
//   value – tolerancja jako tekst („0,05”), diameter – znak ⌀ przed nią, modifier – 'M' (Ⓜ) albo 'L' (Ⓛ),
//   datums – do trzech baz („A”, „B”, „A-B”), cells – szerokości pól zmierzone w edytorze, leader –
//   koniec strzałki (punkt na krawędzi).
// Znak bazy { tool: 'datum', x, y, width, height, size, color, letter, leader }: kwadrat z literą,
//   leader – środek podstawy zaczernionego trójkąta na krawędzi.
// Chropowatość { tool: 'roughness', x, y, size, color, text, kind, width }: (x, y) – wierzchołek symbolu
//   na powierzchni, kind – 'any' (dowolna obróbka), 'removal' (z usunięciem materiału), 'noremoval'
//   (bez usunięcia materiału), text – wymaganie („Ra 1,6”) pod poziomą kreską, width – szerokość tekstu.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const HEX = /^#[0-9a-f]{6}$/i;

/** Tolerancje geometryczne ISO 1101 (nazwy jak w PN-EN ISO 1101); form – tolerancje kształtu (bez baz). */
export const GDT_SYMBOLS = Object.freeze([
  { id: 'straightness', label: 'Prostoliniowość', form: true },
  { id: 'flatness', label: 'Płaskość', form: true },
  { id: 'circularity', label: 'Okrągłość', form: true },
  { id: 'cylindricity', label: 'Walcowość', form: true },
  { id: 'lineProfile', label: 'Kształt wyznaczonego zarysu' },
  { id: 'surfaceProfile', label: 'Kształt wyznaczonej powierzchni' },
  { id: 'parallelism', label: 'Równoległość' },
  { id: 'perpendicularity', label: 'Prostopadłość' },
  { id: 'angularity', label: 'Nachylenie' },
  { id: 'position', label: 'Pozycja' },
  { id: 'concentricity', label: 'Współosiowość (współśrodkowość)' },
  { id: 'symmetry', label: 'Symetria' },
  { id: 'runout', label: 'Bicie' },
  { id: 'totalRunout', label: 'Bicie całkowite' }
]);
export const gdtSymbol = (id) => GDT_SYMBOLS.find((symbol) => symbol.id === id) ?? GDT_SYMBOLS[0];
export const GDT_MODIFIERS = Object.freeze(['M', 'L']);
export const GDT_DATUMS_MAX = 3;
/** Baza: jedna albo dwie wielkie litery, wspólna baza „A-B”. */
export const DATUM_RE = /^[A-Z]{1,2}(-[A-Z]{1,2})?$/;
export const DATUM_LETTER_RE = /^[A-Z]{1,2}$/;
export const GDT_VALUE_MAX = 16;
export const ROUGHNESS_TEXT_MAX = 24;
export const ROUGHNESS_KINDS = Object.freeze(['any', 'removal', 'noremoval']);
export const ROUGHNESS_KIND_LABELS = Object.freeze({ any: 'Dowolna obróbka', removal: 'Z usunięciem materiału', noremoval: 'Bez usunięcia materiału' });
/** Wielkości tekstu symboli (jednostki strony; kratka ma 44): mała, średnia, duża. */
export const SYMBOL_TEXT_SIZES = Object.freeze([20, 26, 34]);

export const isSymbol = (stroke) => stroke?.tool === 'gdt' || stroke?.tool === 'datum' || stroke?.tool === 'roughness';

/** Wysokość ramki tolerancji i bok kwadratu znaku bazy (wielkość tekstu × współczynnik). */
export const gdtHeight = (size) => Math.round(size * 1.7);
export const datumSide = (size) => Math.round(size * 1.6);

/**
 * Symbol chropowatości (ISO 1302): wierzchołek, ramiona pod 60° do powierzchni – krótkie (1,4 h) i długie
 * (2,8 h), pozioma kreska nad tekstem, tekst pod nią na prawo od długiego ramienia; h – wielkość tekstu.
 */
export function roughnessLayout(element) {
  const h = element.size;
  const slope = Math.tan(Math.PI / 3);
  const tip = { x: element.x, y: element.y };
  const short = { x: tip.x - (h * 1.4) / slope, y: tip.y - h * 1.4 };
  const long = { x: tip.x + (h * 2.8) / slope, y: tip.y - h * 2.8 };
  const bar = { x: long.x + Math.max(h, (element.width ?? 0) + h * 0.45), y: long.y };
  const text = { x: long.x + h * 0.22, y: long.y + h * 1.05 };
  const line = Math.max(1.5, h * 0.07);
  return {
    tip, short, long, bar, text, line,
    // Zamknięcie (z usunięciem materiału) – na wysokości krótkiego ramienia; koło (bez usunięcia) – wpisane w ramiona.
    closing: { from: short, to: { x: tip.x + (h * 1.4) / slope, y: short.y } },
    circle: { x: tip.x, y: tip.y - (h * 1.4 * 2) / 3, r: (h * 1.4) / 3 },
    box: { x: short.x - line, y: long.y - line, width: bar.x - short.x + line * 2, height: tip.y - long.y + line * 2 }
  };
}

/** Prostokąt symbolu (zaznaczanie, dotknięcie, przyciąganie): ramka, kwadrat bazy, obrys chropowatości. */
export function symbolBox(element) {
  if (element.tool === 'roughness') return roughnessLayout(element).box;
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

/**
 * Początek strzałki ramki tolerancji i linii znaku bazy: środek boku ramki (kwadratu) zwróconego do
 * celu – lewy albo prawy, a gdy cel jest nad albo pod ramką – górny albo dolny (w miejscu nad celem).
 */
export function symbolLeaderStart(element) {
  const box = symbolBox(element);
  const { x, y } = element.leader;
  if (x < box.x) return { x: box.x, y: box.y + box.height / 2 };
  if (x > box.x + box.width) return { x: box.x + box.width, y: box.y + box.height / 2 };
  const column = element.tool === 'datum' ? box.x + box.width / 2 : clamp(x, box.x + box.height / 2, box.x + box.width - box.height / 2);
  return { x: column, y: y < box.y ? box.y : box.y + box.height };
}

/**
 * Zaczerniony trójkąt bazy: podstawa na krawędzi w punkcie `leader`, wierzchołek w stronę kwadratu;
 * line – od wierzchołka do kwadratu.
 */
export function datumTriangle(element) {
  const start = symbolLeaderStart(element);
  const { leader } = element;
  const length = Math.hypot(start.x - leader.x, start.y - leader.y) || 1;
  const [ux, uy] = [(start.x - leader.x) / length, (start.y - leader.y) / length];
  const half = element.size * 0.5;
  const tall = Math.min(element.size * 0.85, length);
  const apex = { x: leader.x + ux * tall, y: leader.y + uy * tall };
  return {
    points: [{ x: leader.x - uy * half, y: leader.y + ux * half }, { x: leader.x + uy * half, y: leader.y - ux * half }, apex],
    line: [apex, start]
  };
}

/** Kolejna wolna litera bazy na rysunku (A, B, C… – bez I, O i Q, mylonych z cyframi), po Z – „AA”. */
export function nextDatumLetter(strokes) {
  const used = new Set(strokes.filter((stroke) => stroke.tool === 'datum').map((stroke) => stroke.letter));
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ'.split('');
  return letters.find((letter) => !used.has(letter)) ?? 'AA';
}

/** Tekst pola tolerancji: wartość z przecinkiem dziesiętnym, bez zbędnych spacji. */
export const cleanGdtValue = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').replace(/(\d)\.(\d)/g, '$1,$2').slice(0, GDT_VALUE_MAX);

/** Sprawdzone bazy ramki: wielkie litery, puste pominięte, najwyżej trzy. */
export function cleanDatums(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item ?? '').trim().toUpperCase()).filter((item) => DATUM_RE.test(item)).slice(0, GDT_DATUMS_MAX);
}

/** Sprawdzony symbol metrologiczny (zapis, kopia zapasowa) albo null. */
export function cleanSymbol(raw, pageWidth, pageHeight) {
  if (!raw || !isSymbol(raw) || !HEX.test(raw.color ?? '') || ![raw.x, raw.y, raw.size].every(finite)) return null;
  const point = (value) => ({ x: clamp(value.x, -pageWidth, pageWidth * 2), y: clamp(value.y, -pageHeight, pageHeight * 2) });
  const common = { tool: raw.tool, ...point(raw), size: clamp(raw.size, 8, 200), color: raw.color.toLowerCase() };
  const leader = raw.leader && finite(raw.leader.x) && finite(raw.leader.y) ? point(raw.leader) : null;
  if (raw.tool === 'roughness') {
    if (typeof raw.text !== 'string') return null;
    return {
      ...common,
      text: raw.text.trim().slice(0, ROUGHNESS_TEXT_MAX),
      kind: ROUGHNESS_KINDS.includes(raw.kind) ? raw.kind : 'any',
      width: finite(raw.width) ? clamp(raw.width, 0, pageWidth * 3) : 0
    };
  }
  if (raw.tool === 'datum') {
    const letter = String(raw.letter ?? '').trim().toUpperCase();
    if (!DATUM_LETTER_RE.test(letter)) return null;
    const side = datumSide(common.size);
    return { ...common, letter, width: side, height: side, leader: leader ?? { x: common.x + side / 2, y: common.y + side * 2.5 } };
  }
  if (!GDT_SYMBOLS.some((symbol) => symbol.id === raw.symbol)) return null;
  const datums = gdtSymbol(raw.symbol).form ? [] : cleanDatums(raw.datums);
  const value = cleanGdtValue(raw.value);
  const height = gdtHeight(common.size);
  // Szerokości pól: symbol, tolerancja, bazy – zmierzone w edytorze; brak albo złe – szacunek.
  const count = 2 + datums.length;
  const cells = Array.isArray(raw.cells) && raw.cells.length === count && raw.cells.every((cell) => finite(cell) && cell > 0)
    ? raw.cells.map((cell) => clamp(Math.round(cell * 10) / 10, height * 0.5, pageWidth * 2))
    : [height, Math.max(height, (value.length + (raw.diameter === true ? 1.5 : 0) + (raw.modifier ? 1.5 : 0)) * common.size * 0.62 + common.size), ...datums.map(() => height)];
  return {
    ...common,
    symbol: raw.symbol,
    value,
    ...(raw.diameter === true ? { diameter: true } : {}),
    ...(GDT_MODIFIERS.includes(raw.modifier) ? { modifier: raw.modifier } : {}),
    datums,
    cells,
    width: cells.reduce((sum, cell) => sum + cell, 0),
    height,
    ...(leader ? { leader } : {})
  };
}
