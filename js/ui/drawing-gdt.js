// Wymiary techniczne i symbole metrologiczne na płótnie rysunku (od 1.22.1): linie pomocnicze,
// linia wymiarowa ze strzałkami, łuk kąta, liczba z tolerancją; ramka tolerancji (ISO 1101), znak
// bazy i chropowatość (ISO 1302). Znaki ⌀, □, Ⓜ, Ⓛ i symbole tolerancji są rysowane kreską –
// wyglądają tak samo na iPadzie i w Windows, bez względu na czcionki systemu.

import { DIM_ARROW, DIM_EXT_GAP, DIM_FONT, DIM_LINE, dimGeometry } from '../core/shapes.js';
import { datumTriangle, gdtDeviations, gdtHeight, roughnessLayout, symbolLeaderStart } from '../core/gdt.js';
import { measureText, textFont } from './canvas-text.js';

const HALO = 'rgba(255, 255, 255, 0.92)';

/** Zaczerniony grot: ostrze w (x, y), skierowany w stronę `angle`. */
function arrowHead(ctx, x, y, angle, length) {
  const half = length * 0.3;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - cos * length - sin * half, y - sin * length + cos * half);
  ctx.lineTo(x - cos * length + sin * half, y - sin * length - cos * half);
  ctx.closePath();
  ctx.fill();
}

const line = (ctx, a, b) => {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
};

// ---------------------------------------------------------------- znaki rysowane kreską

/** Znak średnicy ⌀: okrąg z ukośną kreską; (x, y) – lewy brzeg na wysokości środka, size – czcionka. */
function paintDiameter(ctx, x, y, size) {
  const r = size * 0.3;
  const [cx, cy] = [x + size * 0.38, y];
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const reach = r * 1.45;
  line(ctx, { x: cx - reach * 0.5, y: cy + reach * 0.866 }, { x: cx + reach * 0.5, y: cy - reach * 0.866 });
}
/** Znak kwadratu □ przed wymiarem. */
function paintSquare(ctx, x, y, size) {
  const side = size * 0.56;
  ctx.strokeRect(x + size * 0.1, y - side / 2, side, side);
}
/** Ⓜ albo Ⓛ: okrąg z literą. */
function paintModifier(ctx, x, y, size, letter) {
  const r = size * 0.42;
  const cx = x + r + size * 0.04;
  ctx.beginPath();
  ctx.arc(cx, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.font = textFont(Math.round(size * 0.58), '600');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, cx, y + size * 0.03);
  ctx.restore();
}
const PREFIX_WIDTH = { '⌀': 0.82, '□': 0.78 };
const MODIFIER_WIDTH = 0.92;

/**
 * Symbol tolerancji geometrycznej w kwadracie o środku (cx, cy) i boku `side` (bieżące strokeStyle,
 * fillStyle i lineWidth): kształtu, kierunku, położenia i bicia – jak w ISO 1101.
 */
export function paintGdtGlyph(ctx, id, cx, cy, side) {
  const r = side * 0.32;
  const P = (dx, dy) => ({ x: cx + dx * r, y: cy + dy * r });
  const circle = (dx, dy, radius) => {
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy + dy * r, radius * r, 0, Math.PI * 2);
    ctx.stroke();
  };
  const path = (points, closed = false) => {
    ctx.beginPath();
    points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    if (closed) ctx.closePath();
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (id) {
    case 'straightness': path([P(-1, 0), P(1, 0)]); break;
    case 'flatness': path([P(-1, 0.42), P(0.55, 0.42), P(1, -0.42), P(-0.55, -0.42)], true); break;
    case 'circularity': circle(0, 0, 0.8); break;
    case 'cylindricity': {
      circle(0, 0, 0.55);
      // Dwie równoległe styczne pod 60°.
      const [nx, ny, dx, dy] = [0.866 * 0.55, 0.5 * 0.55, 0.5, -0.866];
      for (const sign of [-1, 1]) path([P(sign * nx - dx * 1.05, sign * ny - dy * 1.05), P(sign * nx + dx * 1.05, sign * ny + dy * 1.05)]);
      break;
    }
    case 'lineProfile':
    case 'surfaceProfile':
      ctx.beginPath();
      ctx.arc(cx, cy + 0.42 * r, 0.85 * r, Math.PI, Math.PI * 2);
      if (id === 'surfaceProfile') ctx.closePath();
      ctx.stroke();
      break;
    case 'parallelism':
      for (const shift of [-0.36, 0.36]) path([P(shift - 0.42, 0.85), P(shift + 0.42, -0.85)]);
      break;
    case 'perpendicularity': path([P(-0.85, 0.8), P(0.85, 0.8)]); path([P(0, 0.8), P(0, -0.9)]); break;
    case 'angularity': path([P(0.85, 0.75), P(-0.85, 0.75), P(0.7, -0.6)]); break;
    case 'position': circle(0, 0, 0.55); path([P(-1, 0), P(1, 0)]); path([P(0, -1), P(0, 1)]); break;
    case 'concentricity': circle(0, 0, 0.88); circle(0, 0, 0.42); break;
    case 'symmetry': path([P(-0.95, 0), P(0.95, 0)]); path([P(-0.55, -0.45), P(0.55, -0.45)]); path([P(-0.55, 0.45), P(0.55, 0.45)]); break;
    case 'runout':
    case 'totalRunout': {
      const arrows = id === 'runout' ? [[-0.55, 0.8]] : [[-0.95, 0.8], [-0.15, 0.8]];
      for (const [x0, y0] of arrows) {
        const [from, to] = [P(x0, y0), P(x0 + 1.1, y0 - 1.6)];
        path([from, to]);
        arrowHead(ctx, to.x, to.y, Math.atan2(to.y - from.y, to.x - from.x), r * 0.75);
      }
      if (id === 'totalRunout') path([P(-0.95, 0.8), P(-0.15, 0.8)]);
      break;
    }
    default: break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- liczba wymiaru z tolerancją

/** Szerokość liczby wymiaru (znak przed liczbą, liczba, tolerancja) czcionką `size`. */
export function dimTextWidth(parts, size = DIM_FONT) {
  const font = textFont(size, '600');
  const { prefix, number } = splitPrefix(parts.main);
  let width = (prefix ? size * PREFIX_WIDTH[prefix] : 0) + measureText(number, font);
  const { tolerance } = parts;
  if (tolerance?.kind === 'dev') {
    const small = textFont(Math.round(size * 0.64), '600');
    width += size * 0.18 + Math.max(measureText(tolerance.upper, small), measureText(tolerance.lower, small));
  } else if (tolerance) {
    width += measureText(tolerance.kind === 'fit' ? ` ${tolerance.text}` : tolerance.text, font);
  }
  return width;
}
/** Znak rysowany kreską (⌀, □) oddzielony od reszty napisu („R” zostaje literą). */
function splitPrefix(main) {
  const first = main[0];
  return PREFIX_WIDTH[first] ? { prefix: first, number: main.slice(1) } : { prefix: '', number: main };
}

/**
 * Liczba wymiaru wyśrodkowana w (x, y), obrócona o `angle`: znak przed liczbą, liczba i tolerancja
 * (odchyłki – mniejsze, górna nad dolną), z białą obwódką – czytelna na kratce.
 */
export function paintDimText(ctx, x, y, angle, parts, color, size = DIM_FONT) {
  const font = textFont(size, '600');
  const small = Math.round(size * 0.64);
  const { prefix, number } = splitPrefix(parts.main);
  const total = dimTextWidth(parts, size);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  let cursor = -total / 2;
  const text = (value, at, dy, textFontValue) => {
    ctx.font = textFontValue;
    ctx.lineWidth = 5;
    ctx.strokeStyle = HALO;
    ctx.strokeText(value, at, dy);
    ctx.fillStyle = color;
    ctx.fillText(value, at, dy);
    return measureText(value, textFontValue);
  };
  if (prefix) {
    // Biała obwódka pod znakiem, potem sam znak.
    ctx.lineCap = 'round';
    for (const [stroke, width] of [[HALO, 5], [color, Math.max(1.6, size * 0.08)]]) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      if (prefix === '⌀') paintDiameter(ctx, cursor, 0, size);
      else paintSquare(ctx, cursor, 0, size);
    }
    cursor += size * PREFIX_WIDTH[prefix];
  }
  cursor += text(number, cursor, 0, font);
  const { tolerance } = parts;
  if (tolerance?.kind === 'dev') {
    const smallFont = textFont(small, '600');
    cursor += size * 0.18;
    text(tolerance.upper, cursor, -size * 0.3, smallFont);
    text(tolerance.lower, cursor, size * 0.36, smallFont);
  } else if (tolerance) {
    text(tolerance.kind === 'fit' ? ` ${tolerance.text}` : tolerance.text, cursor, 0, font);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- wymiary techniczne

/**
 * Stały wymiar `key` kształtu jak w rysunku technicznym: linie pomocnicze, linia wymiarowa z grotami
 * (gdy się nie mieszczą – na zewnątrz), łuk kąta i liczba; `parts` – napis z dimensionParts, null –
 * bez liczby (zaznaczony kształt: w jej miejscu jest pole wymiaru). `offset` – inne odsunięcie
 * (podgląd w trakcie przeciągania).
 */
export function paintTechnicalDim(ctx, shape, key, parts, { offset, dashed = false } = {}) {
  const geometry = dimGeometry(shape, key, offset);
  const color = shape.color;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = DIM_LINE;
  ctx.lineCap = 'butt';
  if (dashed) ctx.setLineDash([6, 4]);
  if (geometry.kind === 'linear') {
    const { from, to, ext } = geometry;
    ctx.lineWidth = DIM_LINE * 0.8;
    for (const [a, b] of ext) line(ctx, a, b);
    ctx.lineWidth = DIM_LINE;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    if (length >= DIM_ARROW * 2.6) {
      line(ctx, from, to);
      arrowHead(ctx, from.x, from.y, angle + Math.PI, DIM_ARROW);
      arrowHead(ctx, to.x, to.y, angle, DIM_ARROW);
    } else {
      // Krótki wymiar: groty z zewnątrz, linia wymiarowa wysunięta za linie pomocnicze.
      const out = DIM_ARROW * 2;
      line(ctx, { x: from.x - dx * out, y: from.y - dy * out }, { x: to.x + dx * out, y: to.y + dy * out });
      arrowHead(ctx, from.x, from.y, angle, DIM_ARROW);
      arrowHead(ctx, to.x, to.y, angle + Math.PI, DIM_ARROW);
    }
  } else {
    const { center, radius, start, sweep, ref } = geometry;
    ctx.lineWidth = DIM_LINE * 0.8;
    line(ctx, { x: center.x + Math.cos(start) * DIM_EXT_GAP, y: center.y + Math.sin(start) * DIM_EXT_GAP }, ref[1]);
    ctx.lineWidth = DIM_LINE;
    if (Math.abs(sweep) > 1e-3) {
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, start, start + sweep, sweep < 0);
      ctx.stroke();
      const sign = Math.sign(sweep);
      const inside = Math.abs(sweep) * radius >= DIM_ARROW * 2.6;
      const tip = (theta, forward) => {
        const [x, y] = [center.x + Math.cos(theta) * radius, center.y + Math.sin(theta) * radius];
        // Styczna do łuku w kierunku rosnącego kąta.
        const tangent = Math.atan2(Math.cos(theta), -Math.sin(theta));
        arrowHead(ctx, x, y, tangent + (forward ? 0 : Math.PI), DIM_ARROW);
      };
      tip(start, (sign < 0) === inside);
      tip(start + sweep, (sign > 0) === inside);
    }
  }
  ctx.restore();
  if (parts) paintDimText(ctx, geometry.text.x, geometry.text.y, geometry.text.angle, parts, color);
}

// ---------------------------------------------------------------- ramka tolerancji

const gdtPad = (size) => size * 0.42;
const gdtGap = (size) => size * 0.16;

/** Szerokości pól ramki (symbol, tolerancja, bazy), szerokość i wysokość – z treści. */
export function measureGdt(element) {
  const { size } = element;
  const height = gdtHeight(size);
  const font = textFont(size);
  const valueWidth = (element.diameter ? size * PREFIX_WIDTH['⌀'] + gdtGap(size) : 0) + measureText(element.value, font)
    + deviationsWidth(element) + (element.modifier ? gdtGap(size) + size * MODIFIER_WIDTH : 0);
  const cells = [height, Math.max(height, Math.round(valueWidth + gdtPad(size) * 2)),
    ...element.datums.map((datum) => Math.max(height, Math.round(measureText(datum, font) + gdtPad(size) * 2)))];
  return { cells, width: cells.reduce((sum, cell) => sum + cell, 0), height };
}

/** Szerokość odchyłek po tolerancji w ramce (od 1.25): odstęp i dłuższa z dwóch małych liczb. */
function deviationsWidth(element) {
  const deviations = gdtDeviations(element);
  if (!deviations) return 0;
  const small = textFont(Math.round(element.size * 0.64), '600');
  return gdtGap(element.size) + Math.max(measureText(deviations.upper, small), measureText(deviations.lower, small));
}

/** Linia od symbolu do celu z grotem (ramka tolerancji) albo trójkątem (znak bazy) na końcu. */
function paintSymbolLeader(ctx, element) {
  if (!element.leader) return;
  if (element.tool === 'datum') {
    const { points, line: [apex, start] } = datumTriangle(element);
    line(ctx, apex, start);
    ctx.beginPath();
    points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
    ctx.fill();
    return;
  }
  const start = symbolLeaderStart(element);
  const { x, y } = element.leader;
  line(ctx, start, element.leader);
  arrowHead(ctx, x, y, Math.atan2(y - start.y, x - start.x), Math.max(DIM_ARROW, element.size * 0.55));
}

/** Ramka tolerancji: pola z symbolem, tolerancją (⌀, Ⓜ/Ⓛ) i bazami; strzałka do krawędzi. */
export function paintGdt(ctx, element) {
  const { x, y, size, cells, height, color } = element;
  const width = Math.max(DIM_LINE, size * 0.065);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'miter';
  // Białe tło pod ramką – czytelna na kratce i na rysunku pod spodem.
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, element.width, height);
  ctx.restore();
  ctx.strokeRect(x, y, element.width, height);
  let left = x;
  cells.forEach((cell, index) => {
    if (index > 0) line(ctx, { x: left, y }, { x: left, y: y + height });
    left += cell;
  });
  paintGdtGlyph(ctx, element.symbol, x + cells[0] / 2, y + height / 2, height);
  // Pole tolerancji: ⌀, wartość, Ⓜ/Ⓛ – wyśrodkowane.
  const font = textFont(size);
  const valueWidth = measureText(element.value, font);
  const content = (element.diameter ? size * PREFIX_WIDTH['⌀'] + gdtGap(size) : 0) + valueWidth + deviationsWidth(element)
    + (element.modifier ? gdtGap(size) + size * MODIFIER_WIDTH : 0);
  let cursor = x + cells[0] + (cells[1] - content) / 2;
  const middle = y + height / 2;
  ctx.lineWidth = Math.max(1.4, size * 0.07);
  if (element.diameter) {
    paintDiameter(ctx, cursor, middle, size);
    cursor += size * PREFIX_WIDTH['⌀'] + gdtGap(size);
  }
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(element.value, cursor, middle + size * 0.04);
  cursor += valueWidth;
  // Odchyłki (od 1.25): małe, górna nad dolną – jak przy liczbie wymiaru.
  const deviations = gdtDeviations(element);
  if (deviations) {
    const small = textFont(Math.round(size * 0.64), '600');
    ctx.font = small;
    cursor += gdtGap(size);
    ctx.fillText(deviations.upper, cursor, middle - size * 0.3);
    ctx.fillText(deviations.lower, cursor, middle + size * 0.36);
    cursor += Math.max(measureText(deviations.upper, small), measureText(deviations.lower, small));
    ctx.font = font;
  }
  if (element.modifier) paintModifier(ctx, cursor + gdtGap(size), middle, size, element.modifier);
  ctx.textAlign = 'center';
  let datumLeft = x + cells[0] + cells[1];
  element.datums.forEach((datum, index) => {
    const cell = cells[2 + index];
    ctx.fillText(datum, datumLeft + cell / 2, middle + size * 0.04);
    datumLeft += cell;
  });
  ctx.lineWidth = DIM_LINE;
  paintSymbolLeader(ctx, element);
  ctx.restore();
}

// ---------------------------------------------------------------- znak bazy

/** Znak bazy: kwadrat z literą, linia do zaczernionego trójkąta na krawędzi. */
export function paintDatum(ctx, element) {
  const { x, y, width, height, size, color } = element;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = DIM_LINE;
  paintSymbolLeader(ctx, element);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, width, height);
  ctx.restore();
  ctx.lineWidth = Math.max(DIM_LINE, size * 0.065);
  ctx.strokeRect(x, y, width, height);
  ctx.font = textFont(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(element.letter, x + width / 2, y + height / 2 + size * 0.04);
  ctx.restore();
}

// ---------------------------------------------------------------- chropowatość

/** Szerokość tekstu wymagania (pod poziomą kreską symbolu). */
export const measureRoughness = (element) => ({ width: Math.ceil(measureText(element.text, textFont(element.size))) });

/** Symbol chropowatości: ramiona, pozioma kreska, zamknięcie albo koło (rodzaj obróbki) i tekst. */
export function paintRoughness(ctx, element) {
  const layout = roughnessLayout(element);
  const { tip, short, long, bar } = layout;
  ctx.save();
  ctx.strokeStyle = element.color;
  ctx.fillStyle = element.color;
  ctx.lineWidth = layout.line;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(short.x, short.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(long.x, long.y);
  ctx.lineTo(bar.x, bar.y);
  ctx.stroke();
  if (element.kind === 'removal') line(ctx, layout.closing.from, layout.closing.to);
  if (element.kind === 'noremoval') {
    ctx.beginPath();
    ctx.arc(layout.circle.x, layout.circle.y, layout.circle.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (element.text) {
    ctx.font = textFont(element.size);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(element.text, layout.text.x, layout.text.y);
  }
  ctx.restore();
}

/** Mały obraz symbolu tolerancji (przyciski w oknie ramki) – płótno `side` × `side` px. */
export function gdtGlyphCanvas(id, side, color) {
  const canvas = document.createElement('canvas');
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(side * ratio);
  canvas.height = Math.round(side * ratio);
  canvas.style.width = `${side}px`;
  canvas.style.height = `${side}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, side * 0.06);
  paintGdtGlyph(ctx, id, side / 2, side / 2, side);
  return canvas;
}
