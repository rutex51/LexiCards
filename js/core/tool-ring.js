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
// 'sticky', 'gdt', 'datum', 'roughness' (narzędzie się nie zmienia); od 1.43 polecenia edycji geometrii
// 'edit:<rodzaj>' (odsuń, zaokrąglij, fazuj, przytnij, wydłuż) – dotknięcia elementów, narzędzie zostaje; od 1.44
// jakość: 'diagram:fishbone', 'diagram:whys', 'sipoc' (okna) i 'layout' (układ kartki); od 1.47 bryły 'solid:<rodzaj>'
// (wstawienie bryły na środku widocznej części strony).
//
// Od 1.33 grupy można dobrać (okno „Grupy narzędzi”, ustawienia narzędzi na urządzeniu): grupy
// standardowe – które są na prawym kółku i w jakiej kolejności; lewe kółko – gotowe zestawy i własne
// grupy z wybranymi narzędziami.

import { DIM_MODES, SHAPE_LABELS } from './shapes.js';

/** Od 1.36 rodzaje wymiaru to osobne pozycje grupy Wymiary (do 1.35 jedna pozycja 'shape:dim' z wyborem pod menu). */
export const DIM_ITEMS = Object.freeze(['dim:linear', 'dim:angle', 'dim:radius', 'dim:diameter', 'dim:arc']);
/** Edycja geometrii (od 1.43, pakiet E planu): odsuń, zaokrąglij, fazuj, przytnij, wydłuż. */
export const EDIT_ITEMS = Object.freeze(['edit:offset', 'edit:fillet', 'edit:chamfer', 'edit:trim', 'edit:extend']);
/** Jakość (od 1.44): diagram Ishikawy, 5 × Dlaczego, SIPOC, układ kartki. */
export const QUALITY_ITEMS = Object.freeze(['diagram:fishbone', 'diagram:whys', 'sipoc', 'layout']);
/** Od 1.45: schematy procesów – schemat blokowy, łącznik, mapa strumienia wartości, legenda wad. */
export const PROCESS_ITEMS = Object.freeze([
  'shape:terminator', 'shape:data', 'shape:document', 'shape:subprocess', 'shape:connector', 'vsm', 'diagram:timeline', 'diagram:defects'
]);
/** Od 1.47: bryły – prostopadłościan, walec, stożek, ostrosłup, graniastosłup, kula. */
export const SOLID_ITEMS = Object.freeze(['solid:box', 'solid:cylinder', 'solid:cone', 'solid:pyramid', 'solid:prism', 'solid:sphere']);

export const TOOL_GROUPS = Object.freeze([
  { id: 'write', label: 'Pisanie', icon: 'pen', items: ['pen', 'highlighter', 'eraser'] },
  {
    // Od 1.34 także łuk przez trzy punkty, od 1.40 wielokąt foremny, od 1.43 łamana.
    id: 'shapes', label: 'Kształty', icon: 'shapeRect',
    items: ['shape:line', 'shape:arrow', 'shape:polyline', 'shape:rect', 'shape:ngon', 'shape:ellipse', 'shape:arc', 'shape:triangle', 'shape:diamond', 'shape:trapezoid', 'shape:curve']
  },
  // Od 1.40 także półprosta.
  { id: 'construct', label: 'Konstrukcja', icon: 'shapeXline', items: ['shape:xline', 'shape:ray', 'shape:point'] },
  { id: 'text', label: 'Tekst i wzory', icon: 'textBox', items: ['text', 'math', 'table', 'sticky'] },
  // Od 1.34: narzędzie „Wymiar”; od 1.36 jego rodzaje – osobne pozycje (długość, kąt, promień, średnica).
  { id: 'dims', label: 'Wymiary', icon: 'dimension', items: DIM_ITEMS },
  { id: 'symbols', label: 'Symbole metrologiczne', icon: 'gdtFrame', items: ['gdt', 'datum', 'roughness'] },
  // Od 1.43: edycja geometrii – na końcu (dotychczasowe grupy zostają na swoich miejscach kółka).
  { id: 'edit', label: 'Edycja', icon: 'trim', items: EDIT_ITEMS },
  // Od 1.44: jakość i Lean – na końcu.
  { id: 'quality', label: 'Jakość', icon: 'fishbone', items: QUALITY_ITEMS },
  // Od 1.45: procesy – na końcu.
  { id: 'process', label: 'Procesy', icon: 'flowchart', items: PROCESS_ITEMS },
  // Od 1.47: bryły – na końcu.
  { id: 'solids', label: 'Bryły', icon: 'solidBox', items: SOLID_ITEMS }
].map((group) => Object.freeze({ ...group, items: Object.freeze(group.items) })));

/** Gotowe zestawy (od 1.33): w oknie „Grupy narzędzi” dotknięcie dodaje zestaw jako grupę na lewym kółku albo go usuwa. */
export const PRESETS = Object.freeze([
  { id: 'metrology', label: 'Metrologia', icon: 'caliper', items: [...DIM_ITEMS, 'shape:line', 'shape:xline', 'shape:point', 'gdt', 'datum', 'roughness'] },
  { id: 'sketch', label: 'Szkic odręczny', icon: 'sketch', items: ['pen', 'eraser', 'shape:arrow'] },
  { id: 'geometry', label: 'Geometria', icon: 'geometry', items: ['shape:line', 'shape:ellipse', 'shape:xline', 'shape:point'] },
  { id: 'notes', label: 'Notatki', icon: 'notes', items: ['text', 'math', 'sticky', 'highlighter'] },
  // Od 1.44: jakość i Lean – diagramy, tabele, karteczki i kształty schematów.
  { id: 'lean', label: 'Jakość / Lean', icon: 'fishbone', items: [...QUALITY_ITEMS, 'sticky', 'text', 'table', 'shape:rect', 'shape:diamond', 'shape:arrow'] },
  // Od 1.45: schemat procesu i mapa strumienia wartości – kształty schematu (z procesem i decyzją), łącznik, VSM, wady.
  {
    id: 'process-map', label: 'Procesy / VSM', icon: 'flowchart',
    items: ['shape:terminator', 'shape:rect', 'shape:diamond', 'shape:data', 'shape:document', 'shape:subprocess', 'shape:connector', 'vsm', 'diagram:timeline',
      'diagram:defects', 'shape:point', 'sticky']
  }
].map((group) => Object.freeze({ ...group, items: Object.freeze(group.items) })));

/** Grupy użytkownika na początek: zestaw Metrologia. */
export const USER_GROUPS = Object.freeze(PRESETS.filter((group) => group.id === 'metrology'));

/** Wszystkie pozycje, które mogą być w grupie (narzędzia i polecenia grup standardowych). */
export const ALL_ITEMS = Object.freeze(TOOL_GROUPS.flatMap((group) => group.items));
const COMMAND_LABELS = {
  pen: 'Pióro', highlighter: 'Zakreślacz', eraser: 'Gumka', text: 'Tekst', math: 'Wzór', table: 'Tabela', sticky: 'Karteczka',
  gdt: 'Ramka tolerancji', datum: 'Baza', roughness: 'Chropowatość',
  'dim:linear': 'Wymiar – długość', 'dim:angle': 'Wymiar – kąt', 'dim:radius': 'Wymiar – promień', 'dim:diameter': 'Wymiar – średnica',
  'dim:arc': 'Wymiar – długość łuku',
  'edit:offset': 'Odsuń', 'edit:fillet': 'Zaokrąglij', 'edit:chamfer': 'Fazuj', 'edit:trim': 'Przytnij', 'edit:extend': 'Wydłuż',
  'diagram:fishbone': 'Diagram Ishikawy', 'diagram:whys': '5 × Dlaczego', sipoc: 'SIPOC', layout: 'Układ kartki',
  vsm: 'Symbol VSM', 'diagram:timeline': 'Oś czasu VSM', 'diagram:defects': 'Legenda wad',
  'solid:box': 'Prostopadłościan', 'solid:cylinder': 'Walec', 'solid:cone': 'Stożek', 'solid:pyramid': 'Ostrosłup', 'solid:prism': 'Graniastosłup',
  'solid:sphere': 'Kula'
};
/** Nazwa pozycji w oknie „Grupy narzędzi” i w opisie grupy. */
export const itemLabel = (item) => (item.startsWith('shape:') ? SHAPE_LABELS[item.slice(6)] : COMMAND_LABELS[item]) ?? item;

/** Ikony do wyboru dla własnej grupy. */
export const GROUP_ICONS = Object.freeze(['star', 'caliper', 'sketch', 'geometry', 'notes', 'ruler', 'tag', 'sparkles', 'fishbone', 'flowchart', 'solidBox']);
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
 * Od 1.44 przy więcej niż ośmiu kółkach – gęściej (360° / liczba), żeby ostatnie nie stawało na pierwszym.
 */
export function ringStep(count) {
  return { step: count > 8 ? 360 / count : 45, wrap: count >= 8 };
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

/**
 * Odstęp kątowy widocznych małych kółek (od 1.58, stopnie): co najmniej 45°, a tyle, żeby między kółkami o średnicy
 * `size` na okręgu o promieniu `radius` było co najmniej `gap` px – promień się nie zmienia.
 */
export function ringPitch(radius, size, gap) {
  const half = Math.min(1, (size + gap) / (2 * radius));
  return Math.max(45, Math.round(((Math.asin(half) * 360) / Math.PI) * 10) / 10);
}
/** Najmniejszy odstęp kółek ściśniętych za wycinkiem (stopnie). */
const PACKED_MIN = 14;

/**
 * Do ilu stopni od środka wycinka kółka leżą co `pitch` (dalej – ściśnięte): `span`, ale najwyżej tyle, żeby za tą
 * częścią zostało co najmniej PACKED_MIN° na kółko. Infinity – kółka nie są ściskane (wszystkie co `pitch`, a okrąg
 * zamknięty – równo: 8 kółek co 45°; bez zamkniętego okręgu – co `pitch`).
 */
function evenSpan(count, pitch, span) {
  const { wrap } = ringStep(count);
  if (!wrap || count * pitch <= 360) return Infinity;
  const room = (180 - (PACKED_MIN * count) / 2) / (1 - PACKED_MIN / pitch);
  return Math.max(0, Math.min(span, room));
}

/**
 * Kąt (stopnie od środka wycinka) kółka oddalonego o `slots` miejsc od środka (od 1.58): widoczne kółka co `pitch`;
 * gdy na całym okręgu co `pitch` się nie mieszczą (zamknięty okrąg), kółka dalej niż `span` stopni od środka – tam,
 * gdzie kółka już nie widać – są ściśnięte w pozostałej części okręgu.
 */
export function slotAngle(slots, count, pitch, span) {
  const uniform = evenSpan(count, pitch, span);
  if (uniform === Infinity) return slots * (ringStep(count).wrap ? 360 / count : pitch);
  const half = count / 2;
  const even = uniform / pitch;
  const size = Math.abs(slots);
  if (size <= even) return slots * pitch;
  return Math.sign(slots) * (uniform + ((size - even) * (180 - uniform)) / (half - even));
}

/** Przeciągnięcie palcem o 1° obraca kółka o tyle stopni obrotu (`ringStep`) – kółko pod palcem idzie za nim. */
export function ringDragRatio(count, pitch) {
  const { step, wrap } = ringStep(count);
  if (!wrap) return step / pitch;
  return count * pitch <= 360 ? 1 : step / pitch;
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
 * stronie (px), size – średnica małego kółka. Od 1.39 kółko przesunięte ręcznie – free: { angle – środek
 * wycinka (w stronę środka ekranu), room: { left, right, top, bottom } – odległość środka dużego kółka od
 * brzegów }: im dalej od brzegów, tym szerszy wycinek, z dala od nich – cały okrąg; kółka przy którymkolwiek
 * brzegu znikają.
 */
export function ringItems({ count, rotation, side, radius, edge, size, free = null, pitch = 45 }) {
  const { step, wrap } = ringStep(count);
  const center = free ? free.angle : RING_CENTER[side] ?? RING_CENTER.right;
  const right = side !== 'left';
  const clearance = free ? Math.min(free.room.left, free.room.right, free.room.top, free.room.bottom) : 0;
  const open = free ? clamp((clearance - radius * 0.6) / (radius * 0.9), 0, 1) : 0;
  let full = RING_FULL + (180 - RING_FULL) * open;
  let fadeEnd = RING_FADE_END + (181 - RING_FADE_END) * open;
  // Od 1.58: kółka ściśnięte za widoczną częścią (slotAngle) nie prześwitują – wycinek (z zanikaniem) kończy się razem
  // z nią, więc kółko wchodzi do wycinka dopiero z pełnym odstępem.
  const even = evenSpan(count, pitch, fadeEnd);
  if (even < fadeEnd) {
    fadeEnd = even;
    full = Math.min(full, even - (RING_FADE_END - RING_FULL));
  }
  return Array.from({ length: count }, (_, index) => {
    const raw = index * step - rotation;
    const offset = slotAngle((wrap ? wrapAngle(raw) : raw) / step, count, pitch, fadeEnd);
    const angle = right ? center + offset : center - offset;
    const rad = (angle * Math.PI) / 180;
    const x = radius * Math.cos(rad);
    const y = radius * Math.sin(rad);
    const distance = Math.abs(free ? wrapAngle(offset) : offset);
    let opacity = distance <= full ? 1 : distance >= fadeEnd ? 0 : 1 - (distance - full) / (fadeEnd - full);
    // Odległość brzegu kółka od krawędzi ekranu: po stronie dużego kółka, a przesuniętego – od najbliższego brzegu.
    const room = free
      ? Math.min(free.room.left + x, free.room.right - x, free.room.top + y, free.room.bottom - y) - size / 2
      : edge - (right ? x : -x) - size / 2;
    opacity *= clamp((room - EDGE_GAP) / EDGE_FADE, 0, 1);
    return { index, angle, x, y, opacity: Math.round(opacity * 1000) / 1000 };
  });
}

/**
 * Położenie kółek przesuniętych ręcznie (od 1.39): { right, left } – środek dużego kółka jako część szerokości
 * i wysokości obszaru edytora (0–1); null – stałe miejsce przy krawędzi (także po schowaniu kółka).
 */
export function cleanRingPositions(raw) {
  const result = {};
  for (const side of RING_SIDES) {
    const value = raw && typeof raw === 'object' ? raw[side] : null;
    result[side] = value && Number.isFinite(value.x) && Number.isFinite(value.y)
      ? { x: Math.round(clamp(value.x, 0, 1) * 10000) / 10000, y: Math.round(clamp(value.y, 0, 1) * 10000) / 10000 } : null;
  }
  return result;
}

/** Kierunek wycinka kółka przesuniętego do (x, y) w obszarze width × height: w stronę środka obszaru (stopnie ekranu). */
export function ringFacing(x, y, width, height) {
  const [dx, dy] = [width / 2 - x, height / 2 - y];
  return Math.hypot(dx, dy) < 1 ? 90 : (Math.atan2(dy, dx) * 180) / Math.PI;
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
