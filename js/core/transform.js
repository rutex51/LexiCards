// Obrót i odbicie lustrzane zaznaczenia na rysunku (od 1.30) – bez przeglądarki. Kreski pióra
// i zakreślacza, kształty i szyki obracają się i odbijają w całości; pola tekstowe, wzory, tabele,
// karteczki i symbole metrologiczne stoją prosto (dają się czytać) – zmienia się tylko ich miejsce
// (środek ramki, chropowatość – wierzchołek), a koniec strzałki karteczki i symbolu idzie razem
// z resztą. Przyklejone końce (core/attach.js) między przekształcanymi elementami dostają miejsca
// przyklejenia, w które trafiły; przyklejone do elementów spoza zaznaczenia – odklejają się.
//
// Odbicie „w poziomie” zamienia lewą stronę z prawą (oś pionowa), „w pionie” – górę z dołem.
// Kształt odbity zostaje tym samym rodzajem kształtu: zmienia się kąt, pochylenie, wierzchołek
// trójkąta i wierzchołki łamanej; odcinek i strzałka – tylko kąt (początek zostaje początkiem).

import { isArray, polarStep, rotateItem } from './arrays.js';
import { endPoint, findSnap, keepLinksTo, withLink } from './attach.js';
import { elementBox, isElement, translateStroke } from './drawing.js';
import { isSegment, isShape } from './shapes.js';

export const MIRROR_AXES = Object.freeze(['horizontal', 'vertical']);
export const MIRROR_LABELS = Object.freeze({ horizontal: 'W poziomie', vertical: 'W pionie' });
/** Krok obrotu z Shift (albo „Proporcje”) i przyciąganie bez niego – jak przy obrocie kształtu. */
export const TURN_STEP = Math.PI / 12;
const TURN_SNAP = (2 * Math.PI) / 180;

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
/** Kąt w zakresie (−π, π]. */
function normalAngle(angle) {
  const value = Math.atan2(Math.sin(angle), Math.cos(angle));
  return value <= -Math.PI + 1e-12 ? Math.PI : value;
}

/** Element stojący prosto: pole tekstowe, wzór, tabela, karteczka, symbol metrologiczny. */
export const isUpright = (stroke) => isElement(stroke) && !isShape(stroke) && !isArray(stroke);

/** Czy obrót albo odbicie coś zmieni: kilka elementów albo jeden, który się obraca (nie stoi prosto). */
export const canTurn = (strokes) => strokes.length > 1 || (strokes.length === 1 && !isUpright(strokes[0]));

/** Kąt obrotu z przeciągnięcia: lock – dokładnie co 15°, bez niego przyciągany do pełnych 15° (±2°). */
export function snapTurn(angle, lock = false) {
  const normal = normalAngle(angle);
  const nearest = Math.round(normal / TURN_STEP) * TURN_STEP;
  if (lock || Math.abs(normal - nearest) <= TURN_SNAP) return normalAngle(nearest);
  return normal;
}

/** Kąt do pokazania: stopnie, dodatni – przeciwnie do ruchu wskazówek zegara (jak na linijce). */
export const turnDegrees = (angle) => {
  const degrees = Math.round((-normalAngle(angle) * 180) / Math.PI);
  return degrees === -180 ? 180 : degrees;
};

/** Punkt, który wyznacza miejsce elementu stojącego prosto: środek ramki, chropowatość – wierzchołek. */
function anchorOf(stroke) {
  if (stroke.tool === 'roughness') return { x: stroke.x, y: stroke.y };
  const box = elementBox(stroke);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Element stojący prosto przeniesiony tam, gdzie `map` przenosi jego punkt; koniec strzałki – osobno. */
function placeUpright(stroke, map) {
  const anchor = anchorOf(stroke);
  const moved = map(anchor);
  const next = translateStroke(stroke, moved.x - anchor.x, moved.y - anchor.y);
  if (stroke.leader) {
    const leader = map(stroke.leader);
    next.leader = { x: round(leader.x, 1), y: round(leader.y, 1) };
  }
  return next;
}

/** Kąt szyku liniowego – zapisany tylko, gdy różny od zera. */
function withArrayAngle(array, angle) {
  const next = { ...array };
  delete next.angle;
  const value = normalAngle(angle);
  if (Math.abs(value) > 1e-9) next.angle = value;
  return next;
}

/**
 * Element obrócony wokół (cx, cy) o `angle` (radiany, dodatni – zgodnie z ruchem wskazówek zegara,
 * jak na ekranie) – nowy obiekt. Stojący prosto – tylko jego miejsce.
 */
export function rotateStroke(stroke, cx, cy, angle) {
  if (angle === 0) return stroke;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const spin = (point) => ({ x: cx + (point.x - cx) * cos - (point.y - cy) * sin, y: cy + (point.x - cx) * sin + (point.y - cy) * cos });
  if (isArray(stroke)) {
    const items = stroke.items.map((item) => rotateStroke(item, cx, cy, angle));
    if (stroke.kind === 'linear') return withArrayAngle({ ...stroke, items }, (stroke.angle ?? 0) + angle);
    const center = spin({ x: stroke.cx, y: stroke.cy });
    return { ...stroke, items, cx: round(center.x), cy: round(center.y) };
  }
  if (isUpright(stroke)) return placeUpright(stroke, spin);
  return rotateItem(stroke, cx, cy, angle);
}

/** Kształt odbity: `flip` – odbicie punktu strony, horizontal – lewa strona z prawą. */
function mirrorShape(shape, horizontal, flip) {
  const center = flip(shape);
  const next = { ...shape, x: round(center.x), y: round(center.y) };
  if (isSegment(shape)) {
    // Początek zostaje początkiem – zakończenia i przyklejenia bez zmian.
    next.angle = normalAngle(horizontal ? Math.PI - shape.angle : -shape.angle);
    return next;
  }
  // W układzie kształtu: lewa strona staje się prawą (u → −u), w pionie – i obrót o 180°.
  next.angle = normalAngle(horizontal ? -shape.angle : Math.PI - shape.angle);
  if (shape.skew) next.skew = -shape.skew;
  if (shape.shape === 'triangle') next.adjust = round(1 - (shape.adjust ?? 0.5), 4);
  if (Array.isArray(shape.nodes)) next.nodes = shape.nodes.map((value, index) => (index % 2 === 0 && value !== 0 ? -value : value));
  return next;
}

/** Szyk odbity: źródło i środek; kołowy na łuku idzie w drugą stronę – źródło na drugim końcu łuku. */
function mirrorArray(array, axis, at) {
  const horizontal = axis === 'horizontal';
  const items = array.items.map((item) => mirrorStroke(item, axis, at));
  if (array.kind === 'linear') {
    const key = horizontal ? 'dx' : 'dy';
    const next = { ...array, items, [key]: array[key] === 0 ? 0 : -array[key] };
    return array.angle ? withArrayAngle(next, -array.angle) : next;
  }
  const next = { ...array, items, cx: horizontal ? round(2 * at - array.cx) : array.cx, cy: horizontal ? array.cy : round(2 * at - array.cy) };
  if (array.sweep >= 360) return next;
  const turn = ((array.count - 1) * polarStep(array) * Math.PI) / 180;
  next.items = items.map((item) => rotateItem(item, next.cx, next.cy, turn, array.rotate));
  return next;
}

/**
 * Element odbity względem prostej: axis 'horizontal' – pionowej x = at (lewa strona z prawą),
 * 'vertical' – poziomej y = at (góra z dołem). Nowy obiekt; stojący prosto – tylko jego miejsce.
 */
export function mirrorStroke(stroke, axis, at) {
  const horizontal = axis === 'horizontal';
  const flip = (point) => (horizontal ? { x: 2 * at - point.x, y: point.y } : { x: point.x, y: 2 * at - point.y });
  if (isArray(stroke)) return mirrorArray(stroke, axis, at);
  if (isUpright(stroke)) return placeUpright(stroke, flip);
  if (isShape(stroke)) return mirrorShape(stroke, horizontal, flip);
  const points = stroke.points.slice();
  const offset = horizontal ? 0 : 1;
  for (let index = offset; index < points.length; index += 3) points[index] = round(2 * at - points[index], 1);
  return { tool: stroke.tool, color: stroke.color, points };
}

/**
 * Elementy `strokes` (zaznaczenie) po przekształceniu `transform` – nowa lista w tej samej kolejności.
 * Końce przyklejone do elementów spoza listy – odklejone; między elementami listy – przyklejone tam,
 * gdzie trafiły (narożnik albo krawędź po przekształceniu), a gdy nie leżą na elemencie (np. obrócona
 * strzałka do tabeli, która stoi prosto) – w tym samym miejscu elementu co przedtem.
 */
export function transformStrokes(strokes, transform, boxOf = elementBox) {
  const ids = new Set(strokes.map((stroke) => stroke.id).filter(Boolean));
  const moved = strokes.map((stroke) => keepLinksTo(transform(stroke), ids));
  const byId = new Map(moved.filter((stroke) => stroke.id).map((stroke) => [stroke.id, stroke]));
  return moved.map((stroke) => {
    if (!stroke.attach) return stroke;
    let next = stroke;
    for (const [end, ref] of Object.entries(stroke.attach)) {
      const target = byId.get(ref.id);
      const point = target && target !== stroke ? endPoint(stroke, end) : null;
      const snap = point ? findSnap([target], point, 1, { boxOf }) : null;
      if (snap) next = withLink(next, end, { ...snap.ref, id: ref.id });
    }
    return next;
  });
}
