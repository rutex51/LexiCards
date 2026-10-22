// Warstwy rysunku (od 1.36): lista warstw z ukryciem, przezroczystością i nasyceniem, sygnatury elementów
// (do trzech warstw – rząd 1, 2 i 3) i wynikowy wygląd elementu.
//
// Rysunek ma dwa poziomy stałe – „Tło” (-1: papier, kratka i szablon) i „Obraz” (0: zdjęcie pod rysunkiem) –
// oraz warstwy elementów 1, 2, 3… (na początek pięć, można dodawać do LAYER_LIMIT). Element ma sygnatury
// `layers: [rząd 1, rząd 2?, rząd 3?]` – numery warstw; bez sygnatur należy do warstwy 1. Wygląd elementu
// zbiera się kaskadowo przez jego sygnatury: ukryta którakolwiek – element ukryty, przezroczystości i nasycenia
// mnożą się (warstwa rzędu 1 działa na wszystkie swoje elementy, rzędu 2 i 3 – dodatkowo na swoje).
//
// Bez przeglądarki – testy w Node.js.

import { isArray } from './arrays.js';

/** Najwięcej warstw elementów, sygnatur jednego elementu i znaków nazwy warstwy. */
export const LAYER_LIMIT = 32;
export const SIGNATURE_LIMIT = 3;
export const LAYER_NAME_MAX = 30;
/** Ile warstw elementów ma nowy rysunek. */
export const DEFAULT_LAYER_COUNT = 5;
/** Poziomy stałe: tło strony i obraz (zdjęcie) pod rysunkiem. */
export const BACKGROUND_LAYER = -1;
export const PHOTO_LAYER = 0;
const FIXED_NAMES = { [BACKGROUND_LAYER]: 'Tło', [PHOTO_LAYER]: 'Obraz' };

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const percent = (value, fallback = 100) => (finite(value) ? Math.round(Math.min(100, Math.max(0, value))) : fallback);
const layerName = (id) => FIXED_NAMES[id] ?? `Warstwa ${id}`;

/** Warstwy nowego rysunku: tło, obraz i warstwy 1–5, bez ukrycia, w pełnym kryciu i nasyceniu. */
export function defaultLayers() {
  return [BACKGROUND_LAYER, PHOTO_LAYER, ...Array.from({ length: DEFAULT_LAYER_COUNT }, (_, index) => index + 1)]
    .map((id) => ({ id, name: layerName(id), hidden: false, opacity: 100, saturation: 100 }));
}

/**
 * Sprawdzone warstwy: poziomy stałe zawsze na początku (z nazwą stałą), warstwy elementów o numerach
 * 1–999 bez powtórzeń (najwięcej LAYER_LIMIT), zawsze z warstwą 1; krycie i nasycenie 0–100.
 */
export function cleanLayers(raw) {
  if (!Array.isArray(raw)) return defaultLayers();
  const byId = new Map();
  for (const layer of raw) {
    if (!layer || typeof layer !== 'object' || !Number.isInteger(layer.id) || layer.id < BACKGROUND_LAYER || layer.id > 999 || byId.has(layer.id)) continue;
    const fixed = layer.id <= PHOTO_LAYER;
    if (!fixed && [...byId.keys()].filter((id) => id > PHOTO_LAYER).length >= LAYER_LIMIT) continue;
    const name = !fixed && typeof layer.name === 'string' && layer.name.trim() ? layer.name.trim().slice(0, LAYER_NAME_MAX) : layerName(layer.id);
    byId.set(layer.id, { id: layer.id, name, hidden: layer.hidden === true, opacity: percent(layer.opacity), saturation: percent(layer.saturation) });
  }
  for (const id of [BACKGROUND_LAYER, PHOTO_LAYER, 1]) {
    if (!byId.has(id)) byId.set(id, { id, name: layerName(id), hidden: false, opacity: 100, saturation: 100 });
  }
  const fixed = [BACKGROUND_LAYER, PHOTO_LAYER].map((id) => byId.get(id));
  const elements = [...byId.values()].filter((layer) => layer.id > PHOTO_LAYER);
  // Kolejność warstw elementów – jak zapisana (dodane na końcu), warstwa 1 zawsze jest.
  return [...fixed, ...elements];
}

/** Warstwy rysunku (zapisane albo domyślne). */
export const drawingLayers = (drawing) => drawing?.layers ?? defaultLayers();
/** Warstwy elementów (bez tła i obrazu). */
export const elementLayers = (layers) => layers.filter((layer) => layer.id > PHOTO_LAYER);

/** Sygnatury elementu: numery warstw rzędu 1, 2, 3 (bez sygnatur – warstwa 1). */
export const layersOf = (stroke) => (Array.isArray(stroke?.layers) && stroke.layers.length > 0 ? stroke.layers : [1]);

/**
 * Sprawdzone sygnatury: do SIGNATURE_LIMIT numerów warstw elementów bez powtórzeń, tylko istniejące
 * (`known` – numery warstw rysunku); null, gdy zostaje sama warstwa 1 albo nic (element bez pola `layers`).
 */
export function cleanSignatures(raw, known = null) {
  if (!Array.isArray(raw)) return null;
  const ids = [];
  for (const id of raw) {
    if (!Number.isInteger(id) || id <= PHOTO_LAYER || ids.includes(id) || (known && !known.has(id))) continue;
    ids.push(id);
    if (ids.length === SIGNATURE_LIMIT) break;
  }
  return ids.length === 0 || (ids.length === 1 && ids[0] === 1) ? null : ids;
}

/** Element z sygnaturami `ids` (nowy obiekt; sama warstwa 1 – bez pola `layers`). */
export function withSignatures(stroke, ids) {
  const clean = cleanSignatures(ids);
  const next = { ...stroke };
  if (clean) next.layers = clean;
  else delete next.layers;
  return next;
}

/** Wygląd z kilku warstw: ukryty, gdy którakolwiek ukryta; krycie i nasycenie (0–1) – iloczyny. */
function combine(layers, ids) {
  let hidden = false;
  let opacity = 1;
  let saturation = 1;
  for (const id of ids) {
    const layer = layers.find((item) => item.id === id);
    if (!layer) continue;
    hidden ||= layer.hidden;
    opacity *= layer.opacity / 100;
    saturation *= layer.saturation / 100;
  }
  return { hidden, opacity, saturation };
}

/** Wygląd elementu według jego sygnatur (kaskadowo: rząd 1, potem 2 i 3). */
export const strokeEffect = (layers, stroke) => combine(layers, layersOf(stroke));
/** Wygląd poziomu stałego: tła (-1) albo obrazu (0). */
export const levelEffect = (layers, id) => combine(layers, [id]);
/** Czy któraś warstwa zmienia wygląd (bez tego rysowanie i dotyk idą jak do 1.35). */
export const layersActive = (layers) => layers.some((layer) => layer.hidden || layer.opacity < 100 || layer.saturation < 100);

/** Kolor #rrggbb z nasyceniem pomnożonym przez `factor` (0 – szarość tej samej jasności HSL, 1 – bez zmian). */
export function saturateHex(hex, factor) {
  if (factor >= 1 || typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return hex.toLowerCase();
  let hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue /= 6;
  const saturation = (light > 0.5 ? delta / (2 - max - min) : delta / (max + min)) * Math.max(0, factor);
  const channel = (shift) => {
    const k = (shift + hue * 12) % 12;
    const a = saturation * Math.min(light, 1 - light);
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${[channel(0), channel(8), channel(4)].map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Element do narysowania z kolorami o nasyceniu × `factor`: kolor kreski, kształtu, tekstu i symbolu,
 * tekst na kształcie, tabela, karteczka (`stickyTones` – kolory karteczki { fill, ink } według jej koloru), szyk.
 */
export function toneStroke(stroke, factor, stickyTones = null) {
  if (factor >= 1) return stroke;
  if (isArray(stroke)) return { ...stroke, items: stroke.items.map((item) => toneStroke(item, factor, stickyTones)) };
  const next = { ...stroke };
  if (stroke.tool === 'sticky') {
    const tones = stickyTones?.(stroke.color);
    if (tones) next.color = { fill: saturateHex(tones.fill, factor), ink: saturateHex(tones.ink, factor), ...(tones.clear ? { clear: true } : {}) };
    return next;
  }
  if (typeof stroke.color === 'string') next.color = saturateHex(stroke.color, factor);
  if (stroke.label?.color) next.label = { ...stroke.label, color: saturateHex(stroke.label.color, factor) };
  return next;
}

/** Numer nowej warstwy elementów (następny po największym) albo null, gdy jest już LAYER_LIMIT warstw. */
export function nextLayerId(layers) {
  const ids = elementLayers(layers).map((layer) => layer.id);
  if (ids.length >= LAYER_LIMIT) return null;
  return Math.max(0, ...ids) + 1;
}

/** Warstwy z nową warstwą elementów na końcu (albo bez zmian przy limicie). */
export function addLayer(layers) {
  const id = nextLayerId(layers);
  if (id === null) return layers;
  return [...layers, { id, name: layerName(id), hidden: false, opacity: 100, saturation: 100 }];
}

/** Warstwy ze zmienioną warstwą `id` (`change` – pola do zmiany; nazwy tła i obrazu stałe). */
export function updateLayer(layers, id, change) {
  return cleanLayers(layers.map((layer) => (layer.id === id ? { ...layer, ...change } : layer)));
}

/** Ile elementów ma warstwę `id` w sygnaturach (w dowolnym rzędzie; bez sygnatur – warstwa 1). */
export const layerUse = (strokes, id) => strokes.filter((stroke) => layersOf(stroke).includes(id)).length;

/** Warstwy bez warstwy `id` – tylko nieużywanej warstwy elementów innej niż 1 (inaczej bez zmian). */
export function removeLayer(layers, strokes, id) {
  if (id <= 1 || layerUse(strokes, id) > 0) return layers;
  return layers.filter((layer) => layer.id !== id);
}
