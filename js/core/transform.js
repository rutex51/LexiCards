// Obrót i odbicie lustrzane zaznaczenia na rysunku (od 1.30) – bez przeglądarki. Kreski pióra
// i zakreślacza, kształty i szyki obracają się i odbijają w całości; pola tekstowe, wzory, tabele,
// karteczki i symbole metrologiczne stoją prosto (dają się czytać) – zmienia się tylko ich miejsce
// (środek ramki, chropowatość – wierzchołek), a koniec strzałki karteczki i symbolu idzie razem
// z resztą. Przyklejone końce (core/attach.js) między przekształcanymi elementami dostają miejsca
// przyklejenia, w które trafiły; przyklejone do elementów spoza zaznaczenia – odklejają się.
//
// Odbicie „w poziomie” zamienia lewą stronę z prawą (oś pionowa), „w pionie” – górę z dołem; od 1.41
// także względem prostej przez dwa punkty. Od 1.41 skalowanie o współczynnik wokół punktu (kształty
// i kreski rosną, elementy stojące prosto zmieniają tylko miejsce) i przenoszenie stylu elementu.
// Kształt odbity zostaje tym samym rodzajem kształtu: zmienia się kąt, pochylenie, wierzchołek
// trójkąta i wierzchołki łamanej; odcinek i strzałka – tylko kąt (początek zostaje początkiem).
// Bryła (od 1.47) obraca się na kartce (obrót wokół osi patrzenia), odbija (to samo w innym położeniu) i skaluje.

import { isArray, polarStep, rotateItem } from './arrays.js';
import { endPoint, findSnap, keepLinksTo, withLink } from './attach.js';
import { elementBox, isElement, translateStroke } from './drawing.js';
import { MIN_SHAPE, canDash, canFill, isMeasure, isSegment, isShape, withDash, withShapeFill } from './shapes.js';
import { isSolid, mirrorSolid, scaleSolid, turnSolid } from './solids.js';

export const MIRROR_AXES = Object.freeze(['horizontal', 'vertical']);
export const MIRROR_LABELS = Object.freeze({ horizontal: 'W poziomie', vertical: 'W pionie' });
/** Skalowanie (od 1.41): najmniejszy i największy współczynnik. */
export const SCALE_LIMITS = Object.freeze({ min: 0.01, max: 100 });
/** Krok obrotu z Shift (albo „Proporcje”) i przyciąganie bez niego – jak przy obrocie kształtu. */
export const TURN_STEP = Math.PI / 12;
const TURN_SNAP = (2 * Math.PI) / 180;

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
/** Kąt w zakresie (−π, π]. */
function normalAngle(angle) {
  const value = Math.atan2(Math.sin(angle), Math.cos(angle));
  return value <= -Math.PI + 1e-12 ? Math.PI : value;
}

/** Element stojący prosto: pole tekstowe, wzór, tabela, karteczka, symbol metrologiczny (bryła – nie: obraca się). */
export const isUpright = (stroke) => isElement(stroke) && !isShape(stroke) && !isArray(stroke) && !isSolid(stroke);

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
  if (isSolid(stroke)) return turnSolid(stroke, cx, cy, angle);
  return turnHatch(rotateItem(stroke, cx, cy, angle), (-angle * 180) / Math.PI);
}

/** Kreskowanie obrócone razem z kształtem (od 1.40): kąt linii + `degrees` (jak na linijce). */
function turnHatch(shape, degrees) {
  if (!shape.hatch) return shape;
  return { ...shape, hatch: { ...shape.hatch, angle: ((Math.round(shape.hatch.angle + degrees) % 180) + 180) % 180 } };
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
  // Kreskowanie (od 1.40) – linie odbite: kąt a → 180° − a.
  if (shape.hatch) next.hatch = { ...shape.hatch, angle: (180 - shape.hatch.angle) % 180 };
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
  if (isSolid(stroke)) return mirrorSolid(stroke, horizontal ? { x: at, y: 0 } : { x: 0, y: at }, horizontal ? Math.PI / 2 : 0);
  const points = stroke.points.slice();
  const offset = horizontal ? 0 : 1;
  for (let index = offset; index < points.length; index += 3) points[index] = round(2 * at - points[index], 1);
  return { ...stroke, points };
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

// ---------------------------------------------------------------- odbicie względem prostej, skala, styl (od 1.41)

/**
 * Element odbity względem prostej przez punkty `a` i `b` (od 1.41): obrót do poziomu wokół `a`, odbicie góra–dół,
 * obrót z powrotem. Punkty w jednym miejscu – bez zmian.
 */
export function mirrorAcross(stroke, a, b) {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return stroke;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return rotateStroke(mirrorStroke(rotateStroke(stroke, a.x, a.y, -angle), 'vertical', a.y), a.x, a.y, angle);
}

/** Kształt powiększony `factor` razy wokół punktu (`map` – nowe miejsce punktu): wymiary, odsunięcia wymiarów, narożniki. */
function scaleShape(shape, map, factor) {
  const center = map(shape);
  const next = { ...shape, x: round(center.x), y: round(center.y) };
  // Punkt – znacznik tej samej wielkości.
  if (shape.shape === 'point') return next;
  next.w = round(Math.max(MIN_SHAPE, shape.w * factor));
  if (!isSegment(shape)) next.h = round(Math.max(MIN_SHAPE, shape.h * factor));
  if (shape.dimOffsets) next.dimOffsets = Object.fromEntries(Object.entries(shape.dimOffsets).map(([key, value]) => [key, round(value * factor)]));
  if (shape.corner) next.corner = { ...shape.corner, size: round(Math.max(0.5, shape.corner.size * factor)) };
  return next;
}

/**
 * Element powiększony `factor` razy wokół (cx, cy) (od 1.41) – nowy obiekt. Kreski i kształty rosną (grubość linii,
 * tekst na kształcie, znacznik punktu i kreskowanie – bez zmian), elementy stojące prosto (pola tekstowe, wzory, tabele,
 * karteczki, symbole) – zmienia się tylko ich miejsce; szyk – źródło i odstępy.
 */
export function scaleStroke(stroke, cx, cy, factor) {
  if (factor === 1) return stroke;
  const map = (point) => ({ x: cx + (point.x - cx) * factor, y: cy + (point.y - cy) * factor });
  if (isArray(stroke)) {
    const next = { ...stroke, items: stroke.items.map((item) => scaleStroke(item, cx, cy, factor)) };
    if (stroke.kind === 'linear') {
      next.dx = round(stroke.dx * factor);
      next.dy = round(stroke.dy * factor);
    } else {
      const center = map({ x: stroke.cx, y: stroke.cy });
      next.cx = round(center.x);
      next.cy = round(center.y);
      if (Number.isFinite(stroke.ringStep)) next.ringStep = round(stroke.ringStep * factor);
    }
    return next;
  }
  if (isUpright(stroke)) return placeUpright(stroke, map);
  if (isShape(stroke)) return scaleShape(stroke, map, factor);
  if (isSolid(stroke)) {
    // Szkic bryły (od 1.48) – razem z nią (współrzędne względem jej środka); od 1.49 – też szkice operacji na ścianach.
    const next = scaleSolid(stroke, cx, cy, factor);
    if (stroke.sketch) next.sketch = stroke.sketch.map((shape) => scaleStroke(shape, 0, 0, factor));
    if (next.features) next.features = next.features.map((feature) => (feature.sketch ? { ...feature, sketch: feature.sketch.map((shape) => scaleStroke(shape, 0, 0, factor)) } : feature));
    return next;
  }
  const points = stroke.points.slice();
  for (let index = 0; index < points.length; index += 3) {
    points[index] = round(cx + (points[index] - cx) * factor, 1);
    points[index + 1] = round(cy + (points[index + 1] - cy) * factor, 1);
  }
  return { ...stroke, points };
}

const HEX = /^#[0-9a-f]{6}$/i;
/** Elementy z kolorem do przeniesienia: kreski, kształty, pola tekstowe, wzory i symbole. */
const STYLED = ['pen', 'highlighter', 'shape', 'text', 'math', 'gdt', 'datum', 'roughness', 'diagram', 'solid'];
/** Grubość linii: kształtu i (od 1.47) bryły – size, kreski – średnia szerokość punktów; inne – null. */
export function lineWidthOf(stroke) {
  if (isShape(stroke) || isSolid(stroke)) return stroke.size;
  if (stroke.tool !== 'pen' && stroke.tool !== 'highlighter') return null;
  let sum = 0;
  for (let index = 2; index < stroke.points.length; index += 3) sum += stroke.points[index];
  return sum / Math.max(1, stroke.points.length / 3);
}
/** Czy z elementu da się przenieść styl (kolor w zapisie #rrggbb). */
export const hasStyle = (stroke) => STYLED.includes(stroke?.tool) && HEX.test(stroke.color ?? '');

/**
 * Element `target` w stylu elementu `source` (od 1.41, jak „Przenieś właściwości” w CAD): kolor; między kształtami
 * i kreskami – grubość linii (kreska – szerokości punktów przeskalowane, nacisk zostaje); między kształtami – rodzaj
 * linii, wypełnienie i kreskowanie. Szyk – każdy element źródła. Bez stylu – bez zmian.
 */
export function withStyleOf(target, source) {
  if (!hasStyle(source)) return target;
  if (isArray(target)) return { ...target, items: target.items.map((item) => withStyleOf(item, source)) };
  if (!hasStyle(target)) return target;
  let next = { ...target, color: source.color.toLowerCase() };
  const width = lineWidthOf(source);
  if (width !== null && isShape(next) && !isMeasure(next)) next.size = round(Math.min(40, Math.max(0.5, width)), 1);
  if (width !== null && isSolid(next)) next.size = round(Math.min(20, Math.max(0.5, width)), 1);
  if (width !== null && (next.tool === 'pen' || next.tool === 'highlighter') && source.tool !== 'highlighter' && next.tool !== 'highlighter') {
    const factor = width / Math.max(0.1, lineWidthOf(next));
    next.points = next.points.map((value, at) => (at % 3 === 2 ? round(Math.min(40, Math.max(0.5, value * factor))) : value));
  }
  if (isShape(source) && isShape(next)) {
    if (canDash(source) && canDash(next)) next = withDash(next, source.dash ?? 'solid');
    if (canFill(source) && canFill(next)) next = withShapeFill(next, source.fill ?? 'none', source.hatch);
  }
  return next;
}
