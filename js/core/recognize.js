// Rozpoznawanie odręcznych kształtów (od 1.24): kreska pióra przytrzymana na końcu (ok. ½ s)
// zamienia się w figurę – kształt z core/shapes.js. Bez przeglądarki: kreska to punkty strony,
// wynik – kształt albo null (kreska zostaje odręczna, nic nie zmienia się wbrew rysującemu).
//
// Kolejność: kreska prawie prosta – odcinek (kierunek przyciągany do poziomu, pionu i 45°);
// otwarta z rogami – strzałka (grot „V” albo trójkąt na końcu) albo łamana; zamknięta – wielokąt
// o prostych bokach (trójkąt, prostokąt i kwadrat, romb, równoległobok, trapez, inne – wielokąt)
// albo okrąg i elipsa. Rogi – metodą „ShortStraw” (Wolin, Eoff, Hammond 2008): punkty co 1/40
// przekątnej, „słomka” – odległość punktów 3 kroki przed i za; róg tam, gdzie słomka jest wyraźnie
// krótsza niż zwykle (kreska skręca). Boki – prosta dopasowana do punktów boku (bez zaokrąglonych
// rogów), wierzchołki – przecięcia sąsiednich boków.

import { MIN_SHAPE, POLY_NODES_MAX, polyFromPoints, snapAngle, withCaps } from './shapes.js';

const DEG = Math.PI / 180;
/** Kierunki przyciągane do poziomu i pionu – do 7°, do 45° – do 5° (prawie ukośne bywają zamierzone). */
const SNAP_TOLERANCE = 7 * DEG;
const DIAGONAL_TOLERANCE = 5 * DEG;
/** Najmniejsza kreska do rozpoznania – przekątna na ekranie (px). */
const MIN_SCREEN = 16;
/** Kreska zamknięta: koniec od początku najwyżej o tyle przekątnej. */
const CLOSE_GAP = 0.18;
/** Słomka: odległość punktów o tyle kroków przed i za. */
const STRAW = 3;
/** Bok prosty: odchylenie od cięciwy najwyżej taka część jej długości. */
const STRAIGHT = 0.075;
/** Kąty prawie równe (prostokąt, równoległe boki) – do 12° i 10°. */
const RIGHT_TOLERANCE = 12 * DEG;
const PARALLEL_TOLERANCE = 10 * DEG;
/** Boki prawie równe (kwadrat, romb) – do 12% i 15%. */
const SQUARE_TOLERANCE = 0.12;
const RHOMBUS_TOLERANCE = 0.15;

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const round = (value) => Math.round(value * 100) / 100;
/** Kąt w zakresie (−π, π]; wielokrotność 45° (z błędem zaokrąglenia) – dokładnie. */
const normalAngle = (angle) => {
  let value = Math.atan2(Math.sin(angle), Math.cos(angle));
  const eighth = Math.round(value / (Math.PI / 4));
  if (Math.abs(value - (eighth * Math.PI) / 4) < 1e-9) value = (eighth * Math.PI) / 4 + 0;
  return value <= -Math.PI + 1e-9 ? Math.PI : value;
};
/** Różnica kierunków prostych (bez zwrotu): 0–90°. */
const lineDifference = (first, second) => {
  const value = Math.abs(normalAngle(first - second)) % Math.PI;
  return Math.min(value, Math.PI - value);
};
const snap = (angle) => {
  const straight = snapAngle(angle, Math.PI / 2, SNAP_TOLERANCE);
  return straight !== angle ? straight : snapAngle(angle, Math.PI / 4, DIAGONAL_TOLERANCE);
};

/** Punkty kreski [x, y, w, …] bez powtórzeń: { points: [{ x, y }], size } (size – mediana grubości). */
function readStroke(flat) {
  const points = [];
  const widths = [];
  for (let index = 0; index + 2 < flat.length; index += 3) {
    const point = { x: flat[index], y: flat[index + 1] };
    widths.push(flat[index + 2]);
    const last = points[points.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) points.push(point);
  }
  widths.sort((a, b) => a - b);
  return { points, size: widths.length > 0 ? widths[Math.floor(widths.length / 2)] : 2 };
}

/** Długość łamanej. */
function lengthOf(points) {
  let sum = 0;
  for (let index = 1; index < points.length; index += 1) sum += dist(points[index - 1], points[index]);
  return sum;
}

/** Punkty co `spacing` wzdłuż kreski (pierwszy i ostatni zostają). */
function resample(points, spacing) {
  const out = [{ ...points[0] }];
  let carry = 0;
  for (let index = 1; index < points.length; index += 1) {
    let from = points[index - 1];
    const to = points[index];
    let gap = dist(from, to);
    while (carry + gap >= spacing && gap > 0) {
      const t = (spacing - carry) / gap;
      const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      out.push(point);
      from = point;
      gap = dist(from, to);
      carry = 0;
    }
    carry += gap;
  }
  const last = points[points.length - 1];
  if (dist(out[out.length - 1], last) > spacing * 0.3) out.push({ ...last });
  return out;
}

/**
 * Kreska zamknięta: punkty pętli (bez kawałka za miejscem, w którym koniec dochodzi do początku –
 * albo początek do końca) albo null, gdy koniec jest daleko od początku.
 */
function closedLoop(points, diagonal) {
  const count = points.length;
  const [start, end] = [points[0], points[count - 1]];
  let best = { distance: dist(start, end), head: 0, tail: count - 1 };
  for (let index = Math.floor(count * 0.6); index < count; index += 1) {
    const distance = dist(points[index], start);
    if (distance < best.distance) best = { distance, head: 0, tail: index };
  }
  for (let index = 0; index <= Math.ceil(count * 0.4); index += 1) {
    const distance = dist(points[index], end);
    if (distance < best.distance) best = { distance, head: index, tail: count - 1 };
  }
  if (best.distance > diagonal * CLOSE_GAP) return null;
  const loop = points.slice(best.head, best.tail + 1);
  // Ostatni punkt prawie na pierwszym – bez niego (pętla wraca do początku sama).
  if (loop.length > 3 && dist(loop[0], loop[loop.length - 1]) < dist(loop[0], loop[1]) * 0.5) loop.pop();
  return loop.length >= 8 ? loop : null;
}

// ---------------------------------------------------------------- rogi (ShortStraw)

/** Indeksy od a do b wzdłuż kreski (w pętli – dookoła). */
function span(a, b, count, closed) {
  if (!closed) return b - a;
  const steps = (b - a + count) % count;
  return steps === 0 ? count : steps;
}
const at = (points, index, closed) => points[closed ? ((index % points.length) + points.length) % points.length : index];

/** Długość kreski od punktu a do b. */
function pathBetween(points, a, b, closed) {
  const steps = span(a, b, points.length, closed);
  let sum = 0;
  for (let step = 0; step < steps; step += 1) sum += dist(at(points, a + step, closed), at(points, a + step + 1, closed));
  return sum;
}

/**
 * Czy kreska od a do b jest prawie prosta: cięciwa / droga co najmniej `threshold` albo odchylenie
 * od cięciwy najwyżej `flat` jej długości (drżąca, ale prosta kreska ma dłuższą drogę).
 */
function isLine(points, a, b, closed, threshold, flat) {
  const path = pathBetween(points, a, b, closed);
  return path === 0 || dist(at(points, a, closed), at(points, b, closed)) / path >= threshold || deviation(points, a, b, closed) <= flat;
}

/** Największe odchylenie punktów od a do b od cięciwy – w stosunku do jej długości. */
function deviation(points, a, b, closed) {
  const [from, to] = [at(points, a, closed), at(points, b, closed)];
  const chord = dist(from, to);
  if (chord === 0) return Infinity;
  let worst = 0;
  const steps = span(a, b, points.length, closed);
  for (let step = 1; step < steps; step += 1) {
    const point = at(points, a + step, closed);
    worst = Math.max(worst, Math.abs((to.x - from.x) * (from.y - point.y) - (from.x - point.x) * (to.y - from.y)) / chord);
  }
  return worst / chord;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Słomki punktów (otwarta kreska – przy końcach Infinity). */
function strawsOf(points, closed) {
  const count = points.length;
  return points.map((_, index) => {
    if (!closed && (index < STRAW || index >= count - STRAW)) return Infinity;
    return dist(at(points, index - STRAW, closed), at(points, index + STRAW, closed));
  });
}

/** Najostrzejszy skręt pętli: najkrótsza słomka / mediana (okrąg – ok. 0,9 i więcej, róg – 0,8 i mniej). */
function sharpest(points) {
  const straws = strawsOf(points, true);
  return Math.min(...straws) / median(straws);
}

/** Rogi kreski (indeksy punktów; otwarta – z początkiem i końcem). */
function findCorners(points, closed) {
  const count = points.length;
  const straws = strawsOf(points, closed);
  const finite = straws.filter(Number.isFinite);
  if (finite.length === 0) return closed ? [] : [0, count - 1];
  const threshold = median(finite) * 0.95;
  const corners = [];
  // W pętli – od miejsca bez skrętu, żeby jeden róg nie rozpadł się na dwa na łączeniu.
  const first = closed ? straws.findIndex((value) => value >= threshold) : 0;
  if (first < 0) return [];
  for (let step = 0; step < count;) {
    const index = (first + step) % count;
    if (straws[index] < threshold) {
      let best = index;
      while (step < count && straws[(first + step) % count] < threshold) {
        const current = (first + step) % count;
        if (straws[current] < straws[best]) best = current;
        step += 1;
      }
      corners.push(best);
    } else {
      step += 1;
    }
  }
  if (closed) {
    corners.sort((a, b) => a - b);
  } else {
    corners.unshift(0);
    corners.push(count - 1);
  }
  return refineCorners(points, corners, straws, closed);
}

/**
 * Poprawki ShortStraw: między rogami, między którymi kreska nie jest prosta – róg w najostrzejszym
 * miejscu środkowej połowy; róg, który leży na prostej między sąsiednimi – usunięty.
 */
function refineCorners(points, corners, straws, closed) {
  const list = [...corners];
  const count = points.length;
  for (let guard = 0; guard < 60; guard += 1) {
    let added = false;
    const pairs = closed ? list.length : list.length - 1;
    for (let index = 0; index < pairs && !added; index += 1) {
      const [a, b] = [list[index], list[(index + 1) % list.length]];
      if (isLine(points, a, b, closed, 0.95, 0.05)) continue;
      const steps = span(a, b, count, closed);
      if (steps < 4) continue;
      let best = null;
      for (let step = Math.floor(steps * 0.25); step <= Math.ceil(steps * 0.75); step += 1) {
        const candidate = (a + step) % count;
        if (candidate === a || candidate === b) continue;
        if (best === null || straws[candidate] < straws[best]) best = candidate;
      }
      if (best === null) continue;
      list.splice(index + 1, 0, best);
      if (closed) list.sort((x, y) => x - y);
      added = true;
    }
    if (!added) break;
  }
  // Dwa rogi tuż obok siebie (pętelka w rogu) – jeden, ostrzejszy.
  const total = pathBetween(points, 0, closed ? 0 : count - 1, closed);
  for (let guard = 0; guard < 60 && list.length > (closed ? 3 : 2); guard += 1) {
    const pairs = closed ? list.length : list.length - 1;
    const short = Array.from({ length: pairs }, (_, index) => index)
      .find((index) => pathBetween(points, list[index], list[(index + 1) % list.length], closed) < total * 0.04
        && (closed || (index > 0 && index + 1 < list.length - 1)));
    if (short === undefined) break;
    const [first, second] = [short, (short + 1) % list.length];
    list.splice(straws[list[first]] <= straws[list[second]] ? second : first, 1);
  }
  for (let guard = 0; guard < 60; guard += 1) {
    let removed = false;
    const [from, to] = closed ? [0, list.length] : [1, list.length - 1];
    for (let index = from; index < to && !removed; index += 1) {
      if (closed && list.length <= 3) break;
      const [previous, next] = [list[(index - 1 + list.length) % list.length], list[(index + 1) % list.length]];
      if (isLine(points, previous, next, closed, 0.96, 0.04)) {
        list.splice(index, 1);
        removed = true;
      }
    }
    if (!removed) break;
  }
  return list;
}

// ---------------------------------------------------------------- boki i wierzchołki

/**
 * Prosta dopasowana do punktów boku od a do b (bez 15% przy każdym końcu – zaokrąglone rogi):
 * { x, y, angle } – punkt i kierunek od a do b.
 */
function fitLine(points, a, b, closed) {
  const steps = span(a, b, points.length, closed);
  const trim = steps >= 8 ? Math.floor(steps * 0.15) : 0;
  const chosen = [];
  for (let step = trim; step <= steps - trim; step += 1) chosen.push(at(points, a + step, closed));
  const cx = chosen.reduce((sum, point) => sum + point.x, 0) / chosen.length;
  const cy = chosen.reduce((sum, point) => sum + point.y, 0) / chosen.length;
  let [sxx, syy, sxy] = [0, 0, 0];
  for (const point of chosen) {
    sxx += (point.x - cx) ** 2;
    syy += (point.y - cy) ** 2;
    sxy += (point.x - cx) * (point.y - cy);
  }
  let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const [from, to] = [at(points, a, closed), at(points, b, closed)];
  if ((to.x - from.x) * Math.cos(angle) + (to.y - from.y) * Math.sin(angle) < 0) angle += Math.PI;
  return { x: cx, y: cy, angle: normalAngle(angle) };
}

/** Przecięcie prostych albo null (prawie równoległe). */
function intersect(first, second) {
  const [ax, ay, bx, by] = [Math.cos(first.angle), Math.sin(first.angle), Math.cos(second.angle), Math.sin(second.angle)];
  const cross = ax * by - ay * bx;
  if (Math.abs(cross) < Math.sin(10 * DEG)) return null;
  const t = ((second.x - first.x) * by - (second.y - first.y) * bx) / cross;
  return { x: first.x + ax * t, y: first.y + ay * t };
}

/** Rzut punktu na prostą. */
function project(line, point) {
  const [cos, sin] = [Math.cos(line.angle), Math.sin(line.angle)];
  const along = (point.x - line.x) * cos + (point.y - line.y) * sin;
  return { x: line.x + cos * along, y: line.y + sin * along };
}

/** Prosta obrócona wokół swojego punktu do przyciągniętego kierunku. */
const snapLine = (line) => ({ ...line, angle: snap(line.angle) });

/**
 * Wierzchołki z rogów: przecięcia prostych sąsiednich boków (otwarta – końce rzutowane na pierwszy
 * i ostatni bok). Przecięcie daleko od rogu (prawie równoległe boki) – sam róg.
 */
function vertices(points, corners, closed, { snapped = false, diagonal }) {
  const sides = [];
  const pairs = closed ? corners.length : corners.length - 1;
  for (let index = 0; index < pairs; index += 1) {
    const line = fitLine(points, corners[index], corners[(index + 1) % corners.length], closed);
    sides.push(snapped ? snapLine(line) : line);
  }
  const result = [];
  for (let index = 0; index < corners.length; index += 1) {
    const corner = points[corners[index]];
    if (!closed && index === 0) {
      result.push(project(sides[0], corner));
      continue;
    }
    if (!closed && index === corners.length - 1) {
      result.push(project(sides[sides.length - 1], corner));
      continue;
    }
    const [before, after] = [sides[(index - 1 + sides.length) % sides.length], sides[index % sides.length]];
    const crossing = intersect(before, after);
    result.push(crossing && dist(crossing, corner) <= diagonal * 0.25 ? crossing : { ...corner });
  }
  return result;
}

/** Czy każdy bok (między rogami) jest prosty. */
function straightSides(points, corners, closed) {
  const pairs = closed ? corners.length : corners.length - 1;
  for (let index = 0; index < pairs; index += 1) {
    if (deviation(points, corners[index], corners[(index + 1) % corners.length], closed) > STRAIGHT) return false;
  }
  return true;
}

/** Kąt skrętu w wierzchołku (0 – prosto, π – zawrócenie). */
function turnAt(previous, point, next) {
  const first = Math.atan2(point.y - previous.y, point.x - previous.x);
  const second = Math.atan2(next.y - point.y, next.x - point.x);
  return Math.abs(normalAngle(second - first));
}

// ---------------------------------------------------------------- figury

const base = (kind, style) => ({ tool: 'shape', shape: kind, color: style.color, size: style.size, angle: 0, skew: 0, adjust: 0 });

/** Punkt w układzie obróconym o `angle` wokół (0, 0) i z powrotem. */
const rotate = (point, angle) => ({ x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle) });

/** Odcinek od a do b (kierunek przyciągany; `keep` – który punkt zostaje: 'middle' albo 'end'). */
function segment(kind, from, to, style, keep = 'middle') {
  const length = dist(from, to);
  const angle = normalAngle(snap(Math.atan2(to.y - from.y, to.x - from.x)));
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const center = keep === 'end'
    ? { x: to.x - (cos * length) / 2, y: to.y - (sin * length) / 2 }
    : { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return { ...base(kind, style), x: round(center.x), y: round(center.y), w: round(Math.max(MIN_SHAPE, length)), h: 0, angle };
}

/** Kształt w ramce: środek, kąt, szerokość i wysokość. */
const framed = (kind, style, center, angle, w, h, extra = {}) => ({
  ...base(kind, style), x: round(center.x), y: round(center.y), w: round(Math.max(MIN_SHAPE, w)), h: round(Math.max(MIN_SHAPE, h)), angle: normalAngle(angle), ...extra
});

const mean = (points) => ({ x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length });

/**
 * Trójkąt: podstawa – bok przyciągnięty do poziomu albo pionu (poziomy pierwszy), inaczej
 * najdłuższy; wierzchołek nad podstawą (adjust), prawie nad środkiem albo nad rogiem – dokładnie;
 * prawie równoboczny – równoboczny.
 */
function triangle(points, style) {
  const options = [0, 1, 2].map((index) => {
    let [left, right, apex] = [points[index], points[(index + 1) % 3], points[(index + 2) % 3]];
    let angle = snap(Math.atan2(right.y - left.y, right.x - left.x));
    // Wierzchołek ma być „nad” podstawą (ujemne y w układzie podstawy).
    const local = (point) => rotate({ x: point.x - left.x, y: point.y - left.y }, -angle);
    if (local(apex).y > 0) {
      [left, right] = [right, left];
      angle = normalAngle(angle + Math.PI);
    }
    const [l, r, a] = [local(left), local(right), local(apex)];
    const w = r.x - l.x;
    const bottom = (l.y + r.y) / 2;
    const h = bottom - a.y;
    const adjust = w > 0 ? (a.x - l.x) / w : -1;
    const axis = Math.min(lineDifference(angle, 0), lineDifference(angle, Math.PI / 2));
    return { left, angle, w, h, adjust, bottom, axis, horizontal: lineDifference(angle, 0) < 1e-6, length: dist(points[index], points[(index + 1) % 3]) };
  }).filter((option) => option.w > 0 && option.h > 0 && option.adjust >= -0.08 && option.adjust <= 1.08);
  if (options.length === 0) return null;
  options.sort((a, b) => (Number(b.horizontal) - Number(a.horizontal)) || (Number(b.axis < 1e-6) - Number(a.axis < 1e-6)) || b.length - a.length);
  const { left, angle, w, bottom } = options[0];
  let { h, adjust } = options[0];
  adjust = Math.min(1, Math.max(0, adjust));
  for (const nice of [0, 0.5, 1]) if (Math.abs(adjust - nice) <= 0.07) adjust = nice;
  if (adjust === 0.5 && Math.abs(h - (w * Math.sqrt(3)) / 2) <= w * 0.07) h = (w * Math.sqrt(3)) / 2;
  // Środek ramki w układzie podstawy: (w/2, bottom − h/2) od lewego rogu.
  const offset = rotate({ x: w / 2, y: bottom - h / 2 }, angle);
  return framed('triangle', style, { x: left.x + offset.x, y: left.y + offset.y }, angle, w, h, { adjust: round(adjust) });
}

/** Kąt wewnętrzny w wierzchołku. */
function cornerAngle(previous, point, next) {
  const first = Math.atan2(previous.y - point.y, previous.x - point.x);
  const second = Math.atan2(next.y - point.y, next.x - point.x);
  return Math.abs(normalAngle(second - first));
}

/** Kierunek wspólny boków prostokąta (mod 90°) – średnia na kole ×4. */
function rectAngle(points) {
  let [sx, sy] = [0, 0];
  for (let index = 0; index < 4; index += 1) {
    const [a, b] = [points[index], points[(index + 1) % 4]];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const weight = dist(a, b);
    sx += Math.cos(angle * 4) * weight;
    sy += Math.sin(angle * 4) * weight;
  }
  return Math.atan2(sy, sx) / 4;
}

/**
 * Czworokąt: prostokąt i kwadrat (kąty prawie proste – proste; kwadrat stojący na rogu – romb),
 * równoległobok (pochylony prostokąt), romb, trapez, inny – wielokąt.
 */
function quadrilateral(points, style, loop, corners, diagonal) {
  const lengths = points.map((point, index) => dist(point, points[(index + 1) % 4]));
  const directions = points.map((point, index) => Math.atan2(points[(index + 1) % 4].y - point.y, points[(index + 1) % 4].x - point.x));
  const angles = points.map((point, index) => cornerAngle(points[(index + 3) % 4], point, points[(index + 1) % 4]));
  const center = mean(points);
  const meanSide = lengths.reduce((sum, value) => sum + value, 0) / 4;
  const equalSides = lengths.every((value) => Math.abs(value - meanSide) <= meanSide * RHOMBUS_TOLERANCE);
  if (angles.every((angle) => Math.abs(angle - Math.PI / 2) <= RIGHT_TOLERANCE)) {
    // Prostokąt: kierunek od −45° do 45°; szerokość – średnia boków w tym kierunku.
    let angle = rectAngle(points);
    angle = Math.abs(angle) <= SNAP_TOLERANCE ? 0 : Math.abs(Math.abs(angle) - Math.PI / 4) <= SNAP_TOLERANCE ? Math.sign(angle) * (Math.PI / 4) : angle;
    const along = Math.abs(Math.cos(directions[0] - angle)) >= Math.SQRT1_2;
    let [w, h] = along ? [(lengths[0] + lengths[2]) / 2, (lengths[1] + lengths[3]) / 2] : [(lengths[1] + lengths[3]) / 2, (lengths[0] + lengths[2]) / 2];
    const square = Math.abs(w - h) <= Math.max(w, h) * SQUARE_TOLERANCE;
    if (square) w = h = (w + h) / 2;
    // Kwadrat obrócony o 45° – romb (przekątne w poziomie i pionie).
    if (square && Math.abs(Math.abs(angle) - Math.PI / 4) < 1e-9) return framed('diamond', style, center, 0, w * Math.SQRT2, h * Math.SQRT2);
    return framed('rect', style, center, angle, w, h);
  }
  const parallel = (first, second) => lineDifference(directions[first], directions[second]) <= PARALLEL_TOLERANCE;
  const pairs = [parallel(0, 2), parallel(1, 3)];
  // Para boków podstaw: równoległa, bliższa poziomu.
  const flatness = [0, 1].map((index) => Math.min(lineDifference(directions[index], 0), lineDifference(directions[index + 2], 0)));
  const horizontalPair = [0, 1].find((index) => pairs[index] && flatness[index] <= SNAP_TOLERANCE);
  if (equalSides && pairs[0] && pairs[1] && horizontalPair === undefined) return rhombus(points, style);
  const basesIndex = horizontalPair ?? (pairs[0] && pairs[1] ? (flatness[0] <= flatness[1] ? 0 : 1) : pairs.findIndex(Boolean));
  if (basesIndex < 0) return polygon(loop, corners, style, diagonal);
  return trapezoidLike(points, basesIndex, style, pairs[0] && pairs[1]) ?? polygon(loop, corners, style, diagonal);
}

/** Romb: przekątne – osie ramki (bliższa poziomu – szerokość). */
function rhombus(points, style) {
  const diagonals = [[points[0], points[2]], [points[1], points[3]]].map(([a, b]) => ({ length: dist(a, b), angle: Math.atan2(b.y - a.y, b.x - a.x) }));
  diagonals.sort((a, b) => lineDifference(a.angle, 0) - lineDifference(b.angle, 0));
  let angle = normalAngle(diagonals[0].angle);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle <= -Math.PI / 2) angle += Math.PI;
  return framed('diamond', style, mean(points), snap(angle), diagonals[0].length, diagonals[1].length);
}

/**
 * Równoległobok (pochylony prostokąt) albo trapez (z pochyleniem, gdy ramiona nie są równe):
 * boki `basesIndex` i `basesIndex + 2` – podstawy; dłuższa na dole ramki.
 */
function trapezoidLike(points, basesIndex, style, both) {
  const [first, second] = [[points[basesIndex], points[(basesIndex + 1) % 4]], [points[(basesIndex + 2) % 4], points[(basesIndex + 3) % 4]]];
  const longer = dist(...first) >= dist(...second) ? first : second;
  let angle = snap(Math.atan2(longer[1].y - longer[0].y, longer[1].x - longer[0].x));
  const center = mean(points);
  const local = (point) => rotate({ x: point.x - center.x, y: point.y - center.y }, -angle);
  const below = (pair) => local(pair[0]).y + local(pair[1]).y > 0;
  if (both) {
    // Równoległobok wygląda tak samo po obrocie o 180° – ramka bez odwracania (od −90° do 90°).
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle <= -Math.PI / 2) angle += Math.PI;
  } else if (!below(longer)) {
    // Trapez: dłuższa podstawa na dole – inaczej ramka obrócona o 180°.
    angle = normalAngle(angle + Math.PI);
  }
  const lower = below(first) ? first : second;
  const upper = lower === first ? second : first;
  const bottom = lower.map(local).sort((a, b) => a.x - b.x);
  const top = upper.map(local).sort((a, b) => a.x - b.x);
  const h = (bottom[0].y + bottom[1].y) / 2 - (top[0].y + top[1].y) / 2;
  if (h <= 0) return null;
  const w = bottom[1].x - bottom[0].x;
  const topWidth = top[1].x - top[0].x;
  if (w <= 0 || topWidth <= 0) return null;
  const middle = { x: (bottom[0].x + bottom[1].x + top[0].x + top[1].x) / 4, y: (bottom[0].y + bottom[1].y + top[0].y + top[1].y) / 4 };
  let skew = ((top[0].x + top[1].x) / 2 - (bottom[0].x + bottom[1].x) / 2) / h;
  if (Math.abs(skew) <= 0.06) skew = 0;
  const frameCenter = rotate(middle, angle);
  const place = { x: center.x + frameCenter.x, y: center.y + frameCenter.y };
  if (both) {
    // Równoległobok: szerokość – średnia podstaw.
    return framed('rect', style, place, angle, (w + topWidth) / 2, h, { skew: Math.round(skew * 1000) / 1000 });
  }
  const adjust = (w - topWidth) / (2 * w);
  if (adjust > 0.45 || Math.abs(skew) > 2.5) return null;
  return framed('trapezoid', style, place, angle, w, h, { adjust: round(adjust), skew: Math.round(skew * 1000) / 1000 });
}

/** Wielokąt: boki przyciągnięte do poziomu, pionu i 45°, wierzchołki – przecięcia boków. */
function polygon(loop, corners, style, diagonal) {
  const points = vertices(loop, corners, true, { snapped: true, diagonal });
  return polyFromPoints('polygon', points, { ...mean(points), angle: 0 }, style);
}

/**
 * Elipsa dopasowana do pętli: osie z kowariancji (albo o kącie `fixed`), półosie z rozpiętości;
 * błąd – średnie odchylenie promienia, sweep – kąt obiegu wokół środka.
 */
function fitEllipse(points, fixed = null) {
  const center = mean(points);
  let [sxx, syy, sxy] = [0, 0, 0];
  for (const point of points) {
    sxx += (point.x - center.x) ** 2;
    syy += (point.y - center.y) ** 2;
    sxy += (point.x - center.x) * (point.y - center.y);
  }
  const angle = fixed ?? 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const local = points.map((point) => rotate({ x: point.x - center.x, y: point.y - center.y }, -angle));
  const xs = local.map((point) => point.x);
  const ys = local.map((point) => point.y);
  const [a, b] = [(Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2];
  const shift = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
  if (a <= 0 || b <= 0) return null;
  let error = 0;
  let sweep = 0;
  local.forEach((point, index) => {
    const [x, y] = [point.x - shift.x, point.y - shift.y];
    error += Math.abs(Math.hypot(x / a, y / b) - 1);
    const next = local[(index + 1) % local.length];
    sweep += normalAngle(Math.atan2(next.y - shift.y, next.x - shift.x) - Math.atan2(y, x));
  });
  const offset = rotate(shift, angle);
  return { x: center.x + offset.x, y: center.y + offset.y, a, b, angle, error: error / local.length, sweep: Math.abs(sweep) };
}

/**
 * Okrąg albo elipsa: osie poziomo i pionowo albo pod 45°, gdy elipsa tak dopasowana jest prawie
 * tak samo dobra (przy prawie okrągłej kierunek osi z kowariancji jest niepewny).
 */
function ellipse(loop, best, style) {
  let fit = best;
  for (const candidate of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
    if (lineDifference(best.angle, candidate) > 25 * DEG) continue;
    const other = fitEllipse(loop, candidate);
    if (other && other.error <= best.error * 1.15 + 0.01 && (fit === best || other.error < fit.error)) fit = other;
  }
  let { a, b, angle } = fit;
  if (Math.min(a, b) / Math.max(a, b) >= 0.87) {
    a = b = (a + b) / 2;
    angle = 0;
  }
  angle = normalAngle(angle);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle <= -Math.PI / 2) angle += Math.PI;
  angle = snap(angle);
  if (Math.abs(Math.abs(angle) - Math.PI / 2) < 1e-9) {
    // Pionowa oś – ramka bez obrotu, zamienione wymiary.
    [a, b] = [b, a];
    angle = 0;
  }
  return framed('ellipse', style, fit, angle, a * 2, b * 2);
}

/**
 * Strzałka z wierzchołków łamanej: trzon A–B i grot przy B – „V” (A, B, C, B, D: ramię, powrót,
 * drugie ramię) albo trójkąt (A, B, C, D, B). Null – to nie strzałka.
 */
function arrowFrom(points, style) {
  if (points.length !== 5) return null;
  const [a, b] = [points[0], points[1]];
  const shaft = dist(a, b);
  const v = dist(points[3], b) <= Math.max(dist(b, points[2]), dist(points[3], points[4])) * 0.35;
  const t = dist(points[4], b) <= Math.max(dist(b, points[2]), dist(b, points[3])) * 0.35;
  if (!v && !t) return null;
  const arms = v ? [points[2], points[4]] : [points[2], points[3]];
  const back = Math.atan2(a.y - b.y, a.x - b.x);
  for (const arm of arms) {
    const length = dist(b, arm);
    if (length < shaft * 0.06 || length > shaft * 0.6) return null;
    const spread = Math.abs(normalAngle(Math.atan2(arm.y - b.y, arm.x - b.x) - back));
    if (spread < 8 * DEG || spread > 80 * DEG) return null;
  }
  // Ramiona po obu stronach trzonu.
  const side = (point) => Math.sign((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x));
  if (side(arms[0]) * side(arms[1]) >= 0) return null;
  const arrow = segment('arrow', a, b, style, 'end');
  return v ? arrow : withCaps(arrow, { start: 'none', end: 'triangle' });
}

/**
 * Kształt rozpoznany w kresce pióra albo null. `flat` – punkty kreski [x, y, w, …] (strona),
 * style – { color }, scale – piksele ekranu na jednostkę strony (najmniejsza kreska).
 */
export function recognizeStroke(flat, style, { scale = 1 } = {}) {
  const { points: raw, size } = readStroke(flat);
  if (raw.length < 2) return null;
  const xs = raw.map((point) => point.x);
  const ys = raw.map((point) => point.y);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (diagonal * scale < MIN_SCREEN) return null;
  const shapeStyle = { color: style.color, size: Math.round(Math.min(40, Math.max(0.5, size)) * 10) / 10 };
  const length = lengthOf(raw);
  const points = resample(raw, Math.max(length / 400, diagonal / 40));
  if (points.length < 8) return null;
  const loop = closedLoop(points, diagonal);
  if (!loop) {
    const [start, end] = [raw[0], raw[raw.length - 1]];
    const chord = dist(start, end);
    if (chord / length >= 0.94 && deviation(points, 0, points.length - 1, false) <= STRAIGHT) return segment('line', start, end, shapeStyle);
    const corners = findCorners(points, false);
    // Haczyk na początku albo końcu (rysik dotknął ekranu z poślizgiem) – bez niego.
    while (corners.length > 2 && pathBetween(points, corners[0], corners[1], false) < length * 0.06) corners.shift();
    while (corners.length > 2 && pathBetween(points, corners[corners.length - 2], corners[corners.length - 1], false) < length * 0.06) corners.pop();
    if (corners.length === 2) {
      const [from, to] = [points[corners[0]], points[corners[1]]];
      return deviation(points, corners[0], corners[1], false) <= STRAIGHT ? segment('line', from, to, shapeStyle) : null;
    }
    if (corners.length > POLY_NODES_MAX) return null;
    const plain = vertices(points, corners, false, { diagonal });
    const arrow = arrowFrom(plain, shapeStyle) ?? arrowFrom([...plain].reverse(), shapeStyle);
    if (arrow) return arrow;
    if (!straightSides(points, corners, false)) return null;
    const snapped = vertices(points, corners, false, { snapped: true, diagonal });
    return polyFromPoints('polyline', snapped, { ...mean(snapped), angle: 0 }, shapeStyle);
  }
  const corners = findCorners(loop, true);
  const sharp = corners.length >= 3 && corners.length <= POLY_NODES_MAX && straightSides(loop, corners, true);
  const plain = sharp ? vertices(loop, corners, true, { diagonal }) : null;
  const turns = plain ? plain.map((point, index) => turnAt(plain[(index - 1 + plain.length) % plain.length], point, plain[(index + 1) % plain.length])) : [];
  const fit = fitEllipse(loop);
  // Wyraźne rogi i kształt daleki od elipsy – to nie okrąg (wielokąt, którego boków nie udało się ustalić).
  const oval = Boolean(fit) && fit.error <= 0.12 && fit.sweep >= 300 * DEG && fit.sweep <= 420 * DEG && Math.min(fit.a, fit.b) / Math.max(fit.a, fit.b) >= 0.12
    && !(fit.error > 0.045 && sharpest(loop) <= 0.82);
  if (sharp && (!oval || Math.min(...turns) >= 40 * DEG)) {
    if (plain.length === 3) return triangle(plain, shapeStyle) ?? polygon(loop, corners, shapeStyle, diagonal);
    if (plain.length === 4) return quadrilateral(plain, shapeStyle, loop, corners, diagonal);
    return polygon(loop, corners, shapeStyle, diagonal);
  }
  return oval ? ellipse(loop, fit, shapeStyle) : null;
}

/** Nazwa rozpoznanej figury (komunikat, testy): kwadrat, okrąg, równoległobok… */
export function recognizedName(shape) {
  switch (shape.shape) {
    case 'line': return 'Odcinek';
    case 'arrow': return 'Strzałka';
    case 'rect': return shape.skew !== 0 ? 'Równoległobok' : shape.w === shape.h ? 'Kwadrat' : 'Prostokąt';
    case 'ellipse': return shape.w === shape.h ? 'Okrąg' : 'Elipsa';
    case 'triangle': return 'Trójkąt';
    case 'diamond': return 'Romb';
    case 'trapezoid': return 'Trapez';
    case 'polyline': return 'Łamana';
    case 'polygon': return 'Wielokąt';
    default: return 'Kształt';
  }
}
