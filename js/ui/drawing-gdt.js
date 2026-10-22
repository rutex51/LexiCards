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

/** Czcionka wymiarów granicznych (od 1.38) – dwie liczby jedna nad drugą, trochę mniejsze od zwykłej. */
const limitsFont = (size) => textFont(Math.round(size * 0.78), '600');
/** Wysokość ramki wymiaru dokładnego i kontrolnego (od 1.38): jeden wiersz albo dwie liczby graniczne. */
const frameHeight = (parts, size) => size * (parts.tolerance?.kind === 'limits' ? 1.95 : 1.3);
/** Odstęp liczby od ramki: prostokątnej – stały, owalnej – na zaokrąglenie. */
const framePad = (parts, size) => (parts.frame === 'basic' ? size * 0.3 : parts.frame === 'inspection' ? frameHeight(parts, size) * 0.42 : 0);

/**
 * O ile dalej od linii wymiarowej stoi napis wyższy od jednego wiersza (od 1.38): dwie liczby graniczne
 * albo ramka – połowa nadwyżki wysokości.
 */
export function dimTextLift(parts, size = DIM_FONT) {
  const tall = parts.frame === 'basic' || parts.frame === 'inspection' ? frameHeight(parts, size) : parts.tolerance?.kind === 'limits' ? size * 1.85 : size;
  return Math.max(0, (tall - size) / 2);
}

/** Szerokość liczby wymiaru (znak przed liczbą, liczba, tolerancja, od 1.38 nawias i ramka) czcionką `size`. */
export function dimTextWidth(parts, size = DIM_FONT) {
  const font = textFont(size, '600');
  const { prefix, number } = splitPrefix(parts.main);
  let width = (prefix ? size * PREFIX_WIDTH[prefix] : 0) + measureText(number, font);
  const { tolerance } = parts;
  if (tolerance?.kind === 'dev') {
    const small = textFont(Math.round(size * 0.64), '600');
    width += size * 0.18 + Math.max(measureText(tolerance.upper, small), measureText(tolerance.lower, small));
  } else if (tolerance?.kind === 'limits') {
    width += (prefix ? size * 0.06 : 0) + Math.max(measureText(tolerance.upper, limitsFont(size)), measureText(tolerance.lower, limitsFont(size)));
  } else if (tolerance) {
    width += measureText(tolerance.kind === 'fit' ? ` ${tolerance.text}` : tolerance.text, font);
  }
  if (parts.frame === 'reference') width += measureText('()', font);
  return width + framePad(parts, size) * 2;
}
/** Znak rysowany kreską (⌀, □) oddzielony od reszty napisu („R” zostaje literą). */
function splitPrefix(main) {
  const first = main[0];
  return PREFIX_WIDTH[first] ? { prefix: first, number: main.slice(1) } : { prefix: '', number: main };
}

/**
 * Liczba wymiaru wyśrodkowana w (x, y), obrócona o `angle`: znak przed liczbą, liczba i tolerancja
 * (odchyłki – mniejsze, górna nad dolną; od 1.38 wymiary graniczne – jeden nad drugim), z białą obwódką –
 * czytelna na kratce. Od 1.38 wymiar pomocniczy w nawiasie, dokładny w prostokątnej ramce, kontrolny
 * w owalnej.
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
  if (parts.frame === 'basic' || parts.frame === 'inspection') {
    // Ramka na białym tle: prostokąt albo owal (półkola na końcach).
    const [half, tall] = [total / 2, frameHeight(parts, size) / 2];
    ctx.beginPath();
    if (parts.frame === 'basic') ctx.rect(-half, -tall, total, tall * 2);
    else {
      ctx.arc(-half + tall, 0, tall, Math.PI / 2, Math.PI * 1.5);
      ctx.arc(half - tall, 0, tall, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
    }
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, size * 0.07);
    ctx.stroke();
  }
  let cursor = -total / 2 + framePad(parts, size);
  const text = (value, at, dy, textFontValue) => {
    ctx.font = textFontValue;
    ctx.lineWidth = 5;
    ctx.strokeStyle = HALO;
    ctx.strokeText(value, at, dy);
    ctx.fillStyle = color;
    ctx.fillText(value, at, dy);
    return measureText(value, textFontValue);
  };
  if (parts.frame === 'reference') cursor += text('(', cursor, 0, font);
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
    cursor += Math.max(measureText(tolerance.upper, smallFont), measureText(tolerance.lower, smallFont));
  } else if (tolerance?.kind === 'limits') {
    cursor += prefix ? size * 0.06 : 0;
    text(tolerance.upper, cursor, -size * 0.4, limitsFont(size));
    text(tolerance.lower, cursor, size * 0.44, limitsFont(size));
    cursor += Math.max(measureText(tolerance.upper, limitsFont(size)), measureText(tolerance.lower, limitsFont(size)));
  } else if (tolerance) {
    cursor += text(tolerance.kind === 'fit' ? ` ${tolerance.text}` : tolerance.text, cursor, 0, font);
  }
  if (parts.frame === 'reference') text(')', cursor, 0, font);
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
    if (geometry.arrows === 'end') {
      // Promień (od 1.34): od środka do okręgu, grot tylko przy okręgu.
      line(ctx, from, to);
      arrowHead(ctx, to.x, to.y, angle, DIM_ARROW);
    } else if (length >= DIM_ARROW * 2.6) {
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
    if (ref) line(ctx, { x: center.x + Math.cos(start) * DIM_EXT_GAP, y: center.y + Math.sin(start) * DIM_EXT_GAP }, ref[1]);
    // Wymiar kąta (od 1.34): linie pomocnicze wzdłuż ramion, gdy łuk leży dalej niż ich punkty.
    for (const [a, b] of geometry.exts ?? []) line(ctx, a, b);
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
  if (parts) {
    // Wyższy napis (graniczne, ramka) – odsunięty od linii wymiarowej w kierunku czytania „w górę”.
    const { x, y, angle } = geometry.text;
    const lift = geometry.kind === 'linear' ? dimTextLift(parts) : 0;
    paintDimText(ctx, x + Math.sin(angle) * lift, y - Math.cos(angle) * lift, angle, parts, color);
  }
}

// ---------------------------------------------------------------- ramka tolerancji

const gdtPad = (size) => size * 0.42;
const gdtGap = (size) => size * 0.16;

/** Szerokość treści pola tolerancji: ⌀, wartość, odchyłki, Ⓜ/Ⓛ, od 1.38 Ⓟ z wysokością. */
function toleranceWidth(row, size) {
  const font = textFont(size);
  return (row.diameter ? size * PREFIX_WIDTH['⌀'] + gdtGap(size) : 0) + measureText(row.value, font) + deviationsWidth(row)
    + (row.modifier ? gdtGap(size) + size * MODIFIER_WIDTH : 0)
    + (row.projected !== undefined ? gdtGap(size) + size * MODIFIER_WIDTH + (row.projected ? measureText(row.projected, font) : 0) : 0);
}
/** Szerokość pola bazy: litera i (od 1.38) modyfikator. */
const datumWidth = (datum, mod, size) => measureText(datum, textFont(size)) + (mod ? gdtGap(size) + size * MODIFIER_WIDTH : 0);

/**
 * Pola ramki tolerancji zmierzone czcionką: symbol, tolerancja, bazy; od 1.38 pola drugiego wiersza
 * (cells2: tolerancja, bazy) – ramka ma szerokość dłuższego wiersza i wysokość dwóch wierszy.
 */
export function measureGdt(element) {
  const { size } = element;
  const row = gdtHeight(size);
  const cell = (width) => Math.max(row, Math.round(width + gdtPad(size) * 2));
  const cells = [row, cell(toleranceWidth(element, size)), ...element.datums.map((datum, index) => cell(datumWidth(datum, element.datumMods?.[index], size)))];
  const sum = (list) => list.reduce((total, width) => total + width, 0);
  if (!element.row2) return { cells, width: sum(cells), height: row };
  const cells2 = [cell(toleranceWidth(element.row2, size)), ...element.row2.datums.map((datum) => cell(datumWidth(datum, '', size)))];
  return { cells, cells2, width: Math.max(sum(cells), cells[0] + sum(cells2)), height: row * 2 };
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
  if (element.allAround) {
    // „Dookoła” (od 1.38): kółko na strzałce tuż przy ramce – tolerancja na całym obwodzie.
    const length = Math.hypot(x - start.x, y - start.y) || 1;
    const reach = Math.min(element.size * 1.1, length / 2);
    ctx.save();
    ctx.lineWidth = Math.max(DIM_LINE, element.size * 0.06);
    ctx.beginPath();
    ctx.arc(start.x + ((x - start.x) / length) * reach, start.y + ((y - start.y) / length) * reach, element.size * 0.32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** Treść pola tolerancji wyśrodkowana w polu od `left` o szerokości `width`: ⌀, wartość, odchyłki, Ⓜ/Ⓛ, Ⓟ z wysokością. */
function paintToleranceCell(ctx, row, left, width, middle, size) {
  const font = textFont(size);
  let cursor = left + (width - toleranceWidth(row, size)) / 2;
  ctx.lineWidth = Math.max(1.4, size * 0.07);
  if (row.diameter) {
    paintDiameter(ctx, cursor, middle, size);
    cursor += size * PREFIX_WIDTH['⌀'] + gdtGap(size);
  }
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(row.value, cursor, middle + size * 0.04);
  cursor += measureText(row.value, font);
  // Odchyłki (od 1.25): małe, górna nad dolną – jak przy liczbie wymiaru.
  const deviations = gdtDeviations(row);
  if (deviations) {
    const small = textFont(Math.round(size * 0.64), '600');
    ctx.font = small;
    cursor += gdtGap(size);
    ctx.fillText(deviations.upper, cursor, middle - size * 0.3);
    ctx.fillText(deviations.lower, cursor, middle + size * 0.36);
    cursor += Math.max(measureText(deviations.upper, small), measureText(deviations.lower, small));
    ctx.font = font;
  }
  if (row.modifier) {
    paintModifier(ctx, cursor + gdtGap(size), middle, size, row.modifier);
    cursor += gdtGap(size) + size * MODIFIER_WIDTH;
  }
  if (row.projected !== undefined) {
    // Strefa rzutowana (od 1.38): Ⓟ i jej wysokość.
    paintModifier(ctx, cursor + gdtGap(size), middle, size, 'P');
    cursor += gdtGap(size) + size * MODIFIER_WIDTH;
    ctx.font = font;
    ctx.fillText(row.projected, cursor, middle + size * 0.04);
  }
}

/**
 * Ramka tolerancji: pola z symbolem, tolerancją (⌀, Ⓜ/Ⓛ, Ⓟ) i bazami (z Ⓜ/Ⓛ); od 1.38 drugi wiersz
 * (ramka złożona – pole symbolu na oba wiersze) i kółko „dookoła”; strzałka do krawędzi.
 */
export function paintGdt(ctx, element) {
  const { x, y, size, cells, color } = element;
  const row = gdtHeight(size);
  const width = Math.max(DIM_LINE, size * 0.065);
  const sum = (list) => list.reduce((total, cell) => total + cell, 0);
  const first = sum(cells);
  const second = element.row2 ? cells[0] + sum(element.cells2 ?? []) : 0;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'miter';
  // Białe tło pod ramką – czytelna na kratce i na rysunku pod spodem.
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, first, row);
  if (element.row2) ctx.fillRect(x, y + row, second, row);
  ctx.restore();
  ctx.strokeRect(x, y, first, row);
  if (element.row2) {
    ctx.strokeRect(x, y + row, second, row);
    // Pole symbolu na oba wiersze – bez kreski między nimi.
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + width, y + row - width, cells[0] - width * 1.5, width * 2);
    ctx.restore();
    line(ctx, { x: x + cells[0], y: y + row }, { x: x + cells[0], y: y + row * 2 });
  }
  let left = x;
  cells.forEach((cell, index) => {
    if (index > 0) line(ctx, { x: left, y }, { x: left, y: y + row });
    left += cell;
  });
  paintGdtGlyph(ctx, element.symbol, x + cells[0] / 2, y + (row * (element.row2 ? 2 : 1)) / 2, row);
  paintToleranceCell(ctx, element, x + cells[0], cells[1], y + row / 2, size);
  const font = textFont(size);
  /** Bazy wiersza od `start`: litera i modyfikator wyśrodkowane w polu; `separators` – kreski przed polami (drugi wiersz). */
  const datumCells = (datums, mods, widths, start, middle, separators) => {
    let datumLeft = start;
    datums.forEach((datum, index) => {
      const cell = widths[index];
      if (separators) line(ctx, { x: datumLeft, y: middle - row / 2 }, { x: datumLeft, y: middle + row / 2 });
      const content = datumWidth(datum, mods?.[index], size);
      const at = datumLeft + (cell - content) / 2;
      ctx.font = font;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(datum, at, middle + size * 0.04);
      if (mods?.[index]) {
        ctx.lineWidth = Math.max(1.4, size * 0.07);
        paintModifier(ctx, at + measureText(datum, font) + gdtGap(size), middle, size, mods[index]);
        ctx.lineWidth = width;
      }
      datumLeft += cell;
    });
  };
  ctx.lineWidth = width;
  datumCells(element.datums, element.datumMods, cells.slice(2), x + cells[0] + cells[1], y + row / 2, false);
  if (element.row2) {
    const cells2 = element.cells2 ?? [];
    paintToleranceCell(ctx, element.row2, x + cells[0], cells2[0], y + row * 1.5, size);
    ctx.lineWidth = width;
    datumCells(element.row2.datums, null, cells2.slice(1), x + cells[0] + cells2[0], y + row * 1.5, true);
  }
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
export const measureRoughness = (element) => ({
  width: Math.ceil(Math.max(measureText(element.text, textFont(element.size)), element.method ? measureText(element.method, textFont(element.size)) : 0))
});

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
  if (element.allAround) {
    // „Dookoła” (od 1.38): kółko na załamaniu – wymaganie dla wszystkich powierzchni obwodu.
    ctx.beginPath();
    ctx.arc(layout.around.x, layout.around.y, layout.around.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.font = textFont(element.size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (element.text) ctx.fillText(element.text, layout.text.x, layout.text.y);
  // Od 1.38: metoda nad kreską, naddatek z lewej, kierunek struktury przy wierzchołku.
  if (element.method) ctx.fillText(element.method, layout.method.x, layout.method.y);
  if (element.allowance) {
    ctx.textAlign = 'right';
    ctx.fillText(element.allowance, layout.allowance.x, layout.allowance.y);
    ctx.textAlign = 'left';
  }
  if (element.lay === '⊥') {
    // Prostopadły – kreską (znak ⊥ nie w każdej czcionce).
    const { x, y } = layout.lay;
    const h = element.size;
    line(ctx, { x, y }, { x: x + h * 0.7, y });
    line(ctx, { x: x + h * 0.35, y }, { x: x + h * 0.35, y: y - h * 0.7 });
  } else if (element.lay) {
    ctx.fillText(element.lay, layout.lay.x, layout.lay.y);
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
