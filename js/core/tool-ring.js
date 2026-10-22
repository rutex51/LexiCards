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
// – narzędzie „Kształty” z wybranym rodzajem) oraz polecenia otwierające okno: 'text', 'math',
// 'table', 'sticky', 'gdt', 'datum', 'roughness' (narzędzie się nie zmienia).

export const TOOL_GROUPS = Object.freeze([
  { id: 'write', label: 'Pisanie', icon: 'pen', items: ['pen', 'highlighter', 'eraser'] },
  {
    id: 'shapes', label: 'Kształty', icon: 'shapeRect',
    items: ['shape:line', 'shape:arrow', 'shape:rect', 'shape:ellipse', 'shape:triangle', 'shape:diamond', 'shape:trapezoid', 'shape:curve']
  },
  { id: 'construct', label: 'Konstrukcja', icon: 'shapeXline', items: ['shape:xline', 'shape:point'] },
  { id: 'text', label: 'Tekst i wzory', icon: 'textBox', items: ['text', 'math', 'table', 'sticky'] },
  { id: 'symbols', label: 'Symbole metrologiczne', icon: 'gdtFrame', items: ['gdt', 'datum', 'roughness'] }
].map((group) => Object.freeze({ ...group, items: Object.freeze(group.items) })));

/** Grupy użytkownika na początek (od 1.32 – zestaw Metrologia; własne grupy – w następnej wersji). */
export const USER_GROUPS = Object.freeze([
  { id: 'metrology', label: 'Metrologia', icon: 'caliper', items: ['shape:line', 'shape:xline', 'shape:point', 'gdt', 'datum', 'roughness'] }
].map((group) => Object.freeze({ ...group, items: Object.freeze(group.items) })));

export const RING_SIDES = Object.freeze(['right', 'left']);
export const groupsOf = (side) => (side === 'left' ? USER_GROUPS : TOOL_GROUPS);
export const findGroup = (side, id) => groupsOf(side).find((group) => group.id === id) ?? null;

/** Pozycja odpowiadająca narzędziu: 'pen', 'shape:rect'… (zaznaczanie nie należy do grup). */
export const toolItem = (tool, shape) => (tool === 'shape' ? `shape:${shape}` : tool);
/** Pozycja, która jest narzędziem (a nie poleceniem z oknem). */
export const isModeItem = (item) => item === 'pen' || item === 'highlighter' || item === 'eraser' || item.startsWith('shape:');

/**
 * Grupa pokazywana na starcie: zapamiętana ('right:shapes'), gdy istnieje; inaczej grupa
 * standardowa z bieżącym narzędziem; inaczej „Pisanie”. Zwraca { side, id }.
 */
export function startGroup(saved, item) {
  const [side, id] = typeof saved === 'string' ? saved.split(':') : [];
  if (RING_SIDES.includes(side) && findGroup(side, id)) return { side, id };
  const own = TOOL_GROUPS.find((group) => group.items.includes(item));
  return { side: 'right', id: (own ?? TOOL_GROUPS[0]).id };
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
