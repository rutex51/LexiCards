// Kółka narzędzi edytora rysunku (od 1.32): grupy narzędzi i układ małych kółek wokół dużego.
//
// Kółko po prawej – grupy standardowe, po lewej – grupy użytkownika (na początek zestaw Metrologia).
// Wybór grupy zmienia górne menu: pierwszy wiersz – narzędzia grupy, drugi – kolor i grubość
// wybranego narzędzia, pod spodem – wybór bez osobnego okna (np. tryb gumki). Małe kółka leżą na
// okręgu wokół dużego; widać tylko wycinek okręgu skierowany do środka ekranu (ok. 35–50% obwodu),
// dalsze kółka i kółka przy krawędzi ekranu płynnie znikają. Przesunięcie palcem albo kółko myszy
// obraca kółka – zatrzymują się na najbliższej grupie.
//
// Pozycje narzędzi w grupach: 'pen', 'highlighter', 'eraser' (narzędzia), 'shape:<rodzaj>' (kształt
// – narzędzie „Kształty” z wybranym rodzajem), od 1.36 'dim:<rodzaj>' (wymiar: długość, kąt, promień,
// średnica – kształt 'dim' z rodzajem) oraz polecenia otwierające okno: 'text', 'math', 'table',
// 'sticky', 'gdt', 'datum', 'roughness' (narzędzie się nie zmienia).
//
// Od 1.33 grupy można dobrać (okno „Grupy narzędzi”, ustawienia narzędzi na urządzeniu): grupy
// standardowe – które są na prawym kółku i w jakiej kolejności; lewe kółko – gotowe zestawy i własne
// grupy z wybranymi narzędziami.

import { DIM_MODES, SHAPE_LABELS } from './shapes.js';

/** Od 1.36 rodzaje wymiaru to osobne pozycje grupy Wymiary (do 1.35 jedna pozycja 'shape:dim' z wyborem pod menu). */
export const DIM_ITEMS = Object.freeze(['dim:linear', 'dim:angle', 'dim:radius', 'dim:diameter']);

export const TOOL_GROUPS = Object.freeze([
  { id: 'write', label: 'Pisanie', icon: 'pen', items: ['pen', 'highlighter', 'eraser'] },
  {
    // Od 1.34 także łuk przez trzy punkty.
    id: 'shapes', label: 'Kształty', icon: 'shapeRect',
    items: ['shape:line', 'shape:arrow', 'shape:rect', 'shape:ellipse', 'shape:arc', 'shape:triangle', 'shape:diamond', 'shape:trapezoid', 'shape:curve']
  },
  { id: 'construct', label: 'Konstrukcja', icon: 'shapeXline', items: ['shape:xline', 'shape:point'] },
  { id: 'text', label: 'Tekst i wzory', icon: 'textBox', items: ['text', 'math', 'table', 'sticky'] },
  // Od 1.34: narzędzie „Wymiar”; od 1.36 jego rodzaje – osobne pozycje (długość, kąt, promień, średnica).
  { id: 'dims', label: 'Wymiary', icon: 'dimension', items: DIM_ITEMS },
  { id: 'symbols', label: 'Symbole metrologiczne', icon: 'gdtFrame', items: ['gdt', 'datum', 'roughness'] }
].map((group) => Object.freeze({ ...group, items: Object.freeze(group.items) })));

/** Gotowe zestawy (od 1.33): w oknie „Grupy narzędzi” dotknięcie dodaje zestaw jako grupę na lewym kółku albo go usuwa. */
export const PRESETS = Object.freeze([
  { id: 'metrology', label: 'Metrologia', icon: 'caliper', items: [...DIM_ITEMS, 'shape:line', 'shape:xline', 'shape:point', 'gdt', 'datum', 'roughness'] },
  { id: 'sketch', label: 'Szkic odręczny', icon: 'sketch', items: ['pen', 'eraser', 'shape:arrow'] },
  { id: 'geometry', label: 'Geometria', icon: 'geometry', items: ['shape:line', 'shape:ellipse', 'shape:xline', 'shape:point'] },
  { id: 'notes', label: 'Notatki', icon: 'notes', items: ['text', 'math', 'sticky', 'highlighter'] }
].map((group) => Object.freeze({ ...group, items: Object.freeze(group.items) })));

/** Grupy użytkownika na początek: zestaw Metrologia. */
export const USER_GROUPS = Object.freeze(PRESETS.filter((group) => group.id === 'metrology'));

/** Wszystkie pozycje, które mogą być w grupie (narzędzia i polecenia grup standardowych). */
export const ALL_ITEMS = Object.freeze(TOOL_GROUPS.flatMap((group) => group.items));
const COMMAND_LABELS = {
  pen: 'Pióro', highlighter: 'Zakreślacz', eraser: 'Gumka', text: 'Tekst', math: 'Wzór', table: 'Tabela', sticky: 'Karteczka',
  gdt: 'Ramka tolerancji', datum: 'Baza', roughness: 'Chropowatość',
  'dim:linear': 'Wymiar – długość', 'dim:angle': 'Wymiar – kąt', 'dim:radius': 'Wymiar – promień', 'dim:diameter': 'Wymiar – średnica'
};
/** Nazwa pozycji w oknie „Grupy narzędzi” i w opisie grupy. */
export const itemLabel = (item) => (item.startsWith('shape:') ? SHAPE_LABELS[item.slice(6)] : COMMAND_LABELS[item]) ?? item;

/** Ikony do wyboru dla własnej grupy. */
export const GROUP_ICONS = Object.freeze(['star', 'caliper', 'sketch', 'geometry', 'notes', 'ruler', 'tag', 'sparkles']);
/** Najwięcej własnych grup, pozycji w grupie i znaków nazwy. */
export const GROUP_LIMITS = Object.freeze({ groups: 8, items: 12, label: 30 });
const GROUP_ID = /^[a-z0-9-]{1,24}$/;
const STANDARD_IDS = TOOL_GROUPS.map((group) => group.id);
/** Zestaw Metrologia z 1.32–1.33 (bez wymiaru) – niezmieniony przez użytkownika dostaje od 1.34 narzędzie „Wymiar”. */
const METROLOGY_133 = 'shape:line,shape:xline,shape:point,gdt,datum,roughness';

/** Dobór grup (od 1.33): order – kolejność grup standardowych, off – grupy schowane, mine – grupy lewego kółka. */
export function defaultToolGroups() {
  return { order: [...STANDARD_IDS], off: [], mine: USER_GROUPS.map((group) => ({ ...group, items: [...group.items] })) };
}

/** Własna grupa ze sprawdzonymi polami albo null. */
function cleanOwnGroup(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !GROUP_ID.test(raw.id) || STANDARD_IDS.includes(raw.id)) return null;
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, GROUP_LIMITS.label) : '';
  // Wymiar z 1.34–1.35 ('shape:dim') – od 1.36 cztery rodzaje w tym miejscu.
  const listed = Array.isArray(raw.items) ? raw.items.flatMap((item) => (item === 'shape:dim' ? DIM_ITEMS : [item])) : [];
  let items = [...new Set(listed.filter((item) => ALL_ITEMS.includes(item)))].slice(0, GROUP_LIMITS.items);
  if (raw.id === 'metrology' && items.join() === METROLOGY_133) items = [...PRESETS[0].items];
  return { id: raw.id, label: label || 'Moja grupa', icon: GROUP_ICONS.includes(raw.icon) ? raw.icon : 'star', items };
}

/**
 * Dobór grup z pamięci urządzenia: nieznane grupy standardowe wypadają, brakujące (np. nowe w następnej
 * wersji) dochodzą w miejscu z kolejności domyślnej; zawsze zostaje co najmniej jedna grupa standardowa.
 * Bez zapisanych grup lewego kółka – zestaw Metrologia.
 */
export function cleanToolGroups(raw) {
  const base = defaultToolGroups();
  if (!raw || typeof raw !== 'object') return base;
  const order = Array.isArray(raw.order) ? [...new Set(raw.order.filter((id) => STANDARD_IDS.includes(id)))] : [];
  // Nowa grupa standardowa (np. Wymiary od 1.34) – za grupą, która jest przed nią w kolejności domyślnej.
  STANDARD_IDS.forEach((id, index) => {
    if (order.includes(id)) return;
    const before = STANDARD_IDS.slice(0, index).reverse().find((other) => order.includes(other));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  const off = Array.isArray(raw.off) ? [...new Set(raw.off.filter((id) => STANDARD_IDS.includes(id)))] : [];
  const mine = [];
  for (const group of Array.isArray(raw.mine) ? raw.mine : base.mine) {
    const clean = cleanOwnGroup(group);
    if (clean && mine.length < GROUP_LIMITS.groups && !mine.some((other) => other.id === clean.id)) mine.push(clean);
  }
  return { order, off: off.length < STANDARD_IDS.length ? off : [], mine };
}

/** Identyfikator nowej własnej grupy ('own-1', 'own-2'…) – inny niż grup już zapisanych. */
export function newGroupId(mine) {
  let number = 1;
  while (mine.some((group) => group.id === `own-${number}`)) number += 1;
  return `own-${number}`;
}

export const RING_SIDES = Object.freeze(['right', 'left']);
/**
 * Grupy na kółku: po prawej – grupy standardowe w wybranej kolejności (bez schowanych), po lewej –
 * grupy użytkownika z co najmniej jednym narzędziem (pusta grupa czeka w oknie na wybór narzędzi).
 */
export function groupsOf(side, config = defaultToolGroups()) {
  if (side === 'left') return config.mine.filter((group) => group.items.length > 0);
  return config.order.filter((id) => !config.off.includes(id)).map((id) => TOOL_GROUPS.find((group) => group.id === id));
}
export const findGroup = (side, id, config) => groupsOf(side, config).find((group) => group.id === id) ?? null;

/** Pozycja odpowiadająca narzędziu: 'pen', 'shape:rect', od 1.36 'dim:angle'… (zaznaczanie nie należy do grup). */
export const toolItem = (tool, shape, dimMode = 'linear') => (tool !== 'shape' ? tool
  : shape === 'dim' ? `dim:${DIM_MODES.includes(dimMode) ? dimMode : 'linear'}` : `shape:${shape}`);
/** Pozycja, która jest narzędziem (a nie poleceniem z oknem). */
export const isModeItem = (item) => item === 'pen' || item === 'highlighter' || item === 'eraser' || item.startsWith('shape:') || item.startsWith('dim:');

/**
 * Grupa pokazywana na starcie: zapamiętana ('right:shapes'), gdy jest na kółku; inaczej grupa
 * z bieżącym narzędziem (najpierw standardowa); inaczej pierwsza grupa prawego kółka. Zwraca { side, id }.
 */
export function startGroup(saved, item, config) {
  const [side, id] = typeof saved === 'string' ? saved.split(':') : [];
  if (RING_SIDES.includes(side) && findGroup(side, id, config)) return { side, id };
  for (const ring of RING_SIDES) {
    const own = groupsOf(ring, config).find((group) => group.items.includes(item));
    if (own) return { side: ring, id: own.id };
  }
  return { side: 'right', id: groupsOf('right', config)[0].id };
}

/**
 * Odstęp kółek (stopnie) i czy okrąg się zamyka: co 45° (w wycinku widać 3–4 grupy); od ośmiu grup
 * kółka obiegają cały okrąg, przy mniejszej liczbie obrót zatrzymuje się na pierwszej i ostatniej.
 */
export function ringStep(count) {
  return { step: 45, wrap: count >= 8 };
}

const wrapAngle = (angle) => ((((angle + 180) % 360) + 360) % 360) - 180;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Obrót (stopnie, 0 – pierwsza grupa na środku wycinka) w dozwolonym zakresie. */
export function clampRotation(rotation, count) {
  const { step, wrap } = ringStep(count);
  if (wrap) return rotation;
  return clamp(rotation, 0, Math.max(0, count - 1) * step);
}

/** Najbliższa grupa przy obrocie: { index, rotation } – rotation dociągnięty do grupy. */
export function snapRotation(rotation, count) {
  const { step, wrap } = ringStep(count);
  const steps = Math.round(clampRotation(rotation, count) / step);
  const index = wrap ? ((steps % count) + count) % count : clamp(steps, 0, count - 1);
  return { index, rotation: wrap ? steps * step : index * step };
}

/** Obrót, przy którym grupa `index` jest na środku wycinka – najbliższy bieżącemu (bez obrotu o cały okrąg). */
export function rotationFor(index, count, current = 0) {
  const { step, wrap } = ringStep(count);
  const target = index * step;
  if (!wrap) return target;
  return current + wrapAngle(target - current);
}

/** Środek widocznego wycinka: kółko po prawej – w dół i w lewo (do środka ekranu), po lewej – w dół i w prawo. */
export const RING_CENTER = Object.freeze({ right: 122, left: 58 });
/** Pełna widoczność do tylu stopni od środka wycinka, potem zanikanie do RING_FADE_END. */
export const RING_FULL = 50;
export const RING_FADE_END = 95;
/** Zanikanie przy krawędzi ekranu: odległość (px), przy której kółko zaczyna znikać, i szerokość zanikania. */
const EDGE_GAP = 6;
const EDGE_FADE = 26;

/**
 * Małe kółka: { index, angle, x, y, opacity } – x i y względem środka dużego kółka (px), angle w stopniach
 * ekranu (0 – w prawo, 90 – w dół). edge – odległość środka dużego kółka od krawędzi ekranu po jego
 * stronie (px), size – średnica małego kółka.
 */
export function ringItems({ count, rotation, side, radius, edge, size }) {
  const { step, wrap } = ringStep(count);
  const center = RING_CENTER[side] ?? RING_CENTER.right;
  const right = side !== 'left';
  return Array.from({ length: count }, (_, index) => {
    const raw = index * step - rotation;
    const offset = wrap ? wrapAngle(raw) : raw;
    const angle = right ? center + offset : center - offset;
    const rad = (angle * Math.PI) / 180;
    const x = radius * Math.cos(rad);
    const y = radius * Math.sin(rad);
    const distance = Math.abs(offset);
    let opacity = distance <= RING_FULL ? 1 : distance >= RING_FADE_END ? 0 : 1 - (distance - RING_FULL) / (RING_FADE_END - RING_FULL);
    // Odległość brzegu kółka od krawędzi ekranu po stronie dużego kółka.
    const room = edge - (right ? x : -x) - size / 2;
    opacity *= clamp((room - EDGE_GAP) / EDGE_FADE, 0, 1);
    return { index, angle, x, y, opacity: Math.round(opacity * 1000) / 1000 };
  });
}

/** Ukryte elementy interfejsu (od 1.32): kółka, górne menu, dolny pasek, pastylki informacji i zmian. */
export const UI_PARTS = Object.freeze(['right', 'left', 'top', 'bottom', 'info', 'status']);

/** Zapisane ukrycie: true/false dla każdej części; lewe kółko – null (na telefonie schowane, gdzie indziej widoczne). */
export function cleanUiHidden(raw) {
  const result = {};
  for (const part of UI_PARTS) {
    const value = raw && typeof raw === 'object' ? raw[part] : undefined;
    result[part] = typeof value === 'boolean' ? value : part === 'left' ? null : false;
  }
  return result;
}

/** Część ukryta: null przy lewym kółku – schowane na wąskim ekranie (telefon). */
export const uiPartHidden = (hidden, part, narrow) => (hidden[part] === null ? narrow : Boolean(hidden[part]));
