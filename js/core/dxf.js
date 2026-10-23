// DXF (od 1.37): wczytywanie rysunków CAD i zapis kartki – format tekstowy AutoCAD, bez zewnętrznych bibliotek.
//
// Czytanie: sekcje HEADER (jednostki $INSUNITS), TABLES (warstwy: kolor, wyłączenie, rodzaj linii), BLOCKS
// (bloki do INSERT i obrazów wymiarów) i ENTITIES: LINE, XLINE, RAY, CIRCLE, ARC, ELLIPSE, LWPOLYLINE i POLYLINE
// (z łukami – „bulge”), SPLINE, POINT, TEXT, MTEXT, INSERT (blok przesunięty, obrócony i przeskalowany),
// DIMENSION (jego blok z liniami i tekstem). Pomijane (liczone): kreskowanie, bryły 3D, obrazy, odnośniki.
// Wynik to „prymitywy” w jednostkach pliku (oś y w górę), potem elementy rysunku w jednostkach strony.
//
// Zapis: DXF R12 (AC1009 – czyta go każdy program CAD): warstwy, rodzaje linii (CONTINUOUS, DASHED, CENTER,
// PHANTOM, DOT), kolory ACI, elementy w milimetrach w skali rysunku (oś y w górę).
//
// Bez przeglądarki – testy w Node.js.

import { isArray, expandArray } from './arrays.js';
import { PAPER_STEP, SCALE_UNITS, cleanScale, dimFormat, dimensionParts, dimensionText, leaderStart, stickyColor } from './drawing.js';
import { drawingLayers, elementLayers, layersOf } from './layers.js';
import { frameLayout } from './title-block.js';
import { diagramLayout, textWidth } from './diagrams.js';
import { pageLayoutGeometry } from './page-layouts.js';
import {
  arcFromPoints, arcGeometry, circleShape, cornerSize, curveSamples, dimGeometry, dimKeys, isMeasure, polyFromPoints, polyPoints, shapeAxes, shapeHatch,
  shapeOutline, shapePoint, shownDims, DIM_ARROW, DIM_FONT, POLY_NODES_MAX
} from './shapes.js';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- jednostki i kolory

/** Ile milimetrów ma jednostka pliku według $INSUNITS (0 – bez jednostki: mm). */
const INSUNITS_MM = { 0: 1, 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 25.4e-6, 9: 0.0254, 10: 914.4, 13: 0.001, 14: 100, 15: 10000 };
/** Ile milimetrów ma jednostka strony rysunku (skala: kratka = value jednostek skali). */
export function pageUnitMillimeters(scale) {
  const { value, unit } = cleanScale(scale);
  const meters = (SCALE_UNITS.find((item) => item.id === unit) ?? SCALE_UNITS[1]).meters;
  return (value * meters * 1000) / PAPER_STEP;
}

/** Kolor ACI (indeks AutoCAD 1–255) jako #rrggbb; 7 (biały/czarny) – czarny tusz. */
export function aciHex(index) {
  const named = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#1d1d1f', 8: '#808080', 9: '#c0c0c0' };
  if (named[index]) return named[index];
  if (index >= 250 && index <= 255) return `#${['33', '50', '69', '82', 'be', 'ff'][index - 250].repeat(3)}`;
  if (!(index >= 10 && index <= 249)) return '#1d1d1f';
  const hue = Math.floor((index - 10) / 10) * 15;
  const shade = (index - 10) % 10;
  const value = [1, 0.65, 0.5, 0.3, 0.15][Math.floor(shade / 2)];
  const saturation = shade % 2 === 0 ? 1 : 0.5;
  const f = (n) => {
    const k = (n + hue / 60) % 6;
    return value - value * saturation * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((part) => Math.round(part * 255).toString(16).padStart(2, '0')).join('')}`;
}

const rgbOf = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const luminance = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
/** Kolor na białej kartce: bardzo jasny (biały, żółty) – przyciemniony, żeby był widoczny. */
export function paperColor(hex) {
  const rgb = rgbOf(hex);
  const light = luminance(rgb);
  if (light <= 0.8) return hex;
  const factor = 0.55 / light;
  return `#${rgb.map((part) => Math.round(part * factor).toString(16).padStart(2, '0')).join('')}`;
}

/** Najbliższy kolor ACI dla #rrggbb (ciemny – 7, czarny w programach CAD na białym tle). */
export function hexAci(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) return 7;
  const rgb = rgbOf(hex);
  if (luminance(rgb) < 0.2 && Math.max(...rgb) - Math.min(...rgb) < 40) return 7;
  let best = 7;
  let distance = Infinity;
  for (let index = 1; index <= 255; index += 1) {
    if (index === 7) continue;
    const other = rgbOf(aciHex(index));
    const d = (other[0] - rgb[0]) ** 2 + (other[1] - rgb[1]) ** 2 + (other[2] - rgb[2]) ** 2;
    if (d < distance) [best, distance] = [index, d];
  }
  return best;
}

/** Rodzaj linii z nazwy typu linii DXF. */
export function dashOfLinetype(name) {
  const upper = String(name ?? '').toUpperCase();
  if (/CENTER|CENTRE|AXIS|DASHDOT/.test(upper)) return 'center';
  if (/PHANTOM|DIVIDE|BORDER/.test(upper)) return 'phantom';
  if (/DOT/.test(upper)) return 'dotted';
  if (/DASH|HIDDEN/.test(upper)) return 'dashed';
  return 'solid';
}

// ---------------------------------------------------------------- czytanie

/** Pary [kod, wartość] pliku DXF (kod – liczba całkowita, wartość – tekst bez spacji na końcach). */
export function dxfPairs(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const pairs = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10);
    if (!Number.isInteger(code)) break;
    pairs.push([code, lines[index + 1].trim()]);
  }
  return pairs;
}

/** Encja: typ, wspólne pola (warstwa, kolor, rodzaj linii, grubość) i wszystkie pary kodów. */
function makeEntity(type, codes) {
  const first = (code) => codes.find(([at]) => at === code)?.[1];
  const number = (code) => {
    const value = Number(first(code));
    return finite(value) ? value : null;
  };
  return {
    type, codes, first, number,
    layer: first(8) ?? '0',
    color: number(62),
    trueColor: number(420),
    linetype: first(6) ?? null,
    weight: number(370)
  };
}

/** Encje od pary `start` do końca sekcji albo bloku: lista encji (POLYLINE z wierzchołkami VERTEX). */
function readEntities(pairs, start, stop) {
  const entities = [];
  let index = start;
  while (index < pairs.length) {
    const [code, value] = pairs[index];
    if (code === 0 && stop.includes(value)) break;
    if (code !== 0) {
      index += 1;
      continue;
    }
    const codes = [];
    index += 1;
    while (index < pairs.length && pairs[index][0] !== 0) codes.push(pairs[index++]);
    const entity = makeEntity(value, codes);
    if (value === 'POLYLINE') {
      entity.vertices = [];
      while (index < pairs.length && pairs[index][0] === 0 && pairs[index][1] === 'VERTEX') {
        const vertex = [];
        index += 1;
        while (index < pairs.length && pairs[index][0] !== 0) vertex.push(pairs[index++]);
        entity.vertices.push(makeEntity('VERTEX', vertex));
      }
      if (index < pairs.length && pairs[index][1] === 'SEQEND') {
        index += 1;
        while (index < pairs.length && pairs[index][0] !== 0) index += 1;
      }
    }
    entities.push(entity);
  }
  return { entities, next: index };
}

/**
 * Plik DXF: { unitMm – mm w jednostce pliku, layers – Map(nazwa → { color, hidden, linetype }), blocks – Map(nazwa →
 * { base, entities }), entities } albo błąd, gdy to nie jest DXF tekstowy.
 */
export function parseDxf(text) {
  if (/^AutoCAD Binary DXF/.test(String(text).slice(0, 22))) throw new Error('To DXF binarny – zapisz rysunek w programie CAD jako DXF tekstowy (ASCII).');
  const pairs = dxfPairs(text);
  if (!pairs.some(([code, value]) => code === 0 && value === 'SECTION')) throw new Error('To nie jest plik DXF (tekstowy).');
  let unitMm = 1;
  const layers = new Map();
  const blocks = new Map();
  let entities = [];
  for (let index = 0; index < pairs.length; index += 1) {
    const [code, value] = pairs[index];
    if (code !== 0 || value !== 'SECTION') continue;
    const name = pairs[index + 1]?.[1];
    if (name === 'HEADER') {
      for (let at = index + 2; at < pairs.length && !(pairs[at][0] === 0 && pairs[at][1] === 'ENDSEC'); at += 1) {
        if (pairs[at][0] === 9 && pairs[at][1] === '$INSUNITS') unitMm = INSUNITS_MM[Number(pairs[at + 1]?.[1])] ?? 1;
      }
    } else if (name === 'TABLES') {
      let at = index + 2;
      while (at < pairs.length && !(pairs[at][0] === 0 && pairs[at][1] === 'ENDSEC')) {
        if (pairs[at][0] === 0 && pairs[at][1] === 'LAYER' && pairs[at - 1]?.[0] !== 2) {
          const codes = [];
          at += 1;
          while (at < pairs.length && pairs[at][0] !== 0) codes.push(pairs[at++]);
          const layer = makeEntity('LAYER', codes);
          const title = layer.first(2);
          if (title) {
            const color = layer.number(62) ?? 7;
            layers.set(title, { color: Math.abs(color), hidden: color < 0 || ((layer.number(70) ?? 0) & 1) === 1, linetype: layer.first(6) ?? 'CONTINUOUS' });
          }
        } else {
          at += 1;
        }
      }
    } else if (name === 'BLOCKS') {
      let at = index + 2;
      while (at < pairs.length && !(pairs[at][0] === 0 && pairs[at][1] === 'ENDSEC')) {
        if (pairs[at][0] === 0 && pairs[at][1] === 'BLOCK') {
          const codes = [];
          at += 1;
          while (at < pairs.length && pairs[at][0] !== 0) codes.push(pairs[at++]);
          const block = makeEntity('BLOCK', codes);
          const read = readEntities(pairs, at, ['ENDBLK', 'ENDSEC']);
          at = read.next;
          const title = block.first(2);
          if (title) blocks.set(title, { base: { x: block.number(10) ?? 0, y: block.number(20) ?? 0 }, entities: read.entities });
        } else {
          at += 1;
        }
      }
    } else if (name === 'ENTITIES') {
      entities = readEntities(pairs, index + 2, ['ENDSEC']).entities;
    }
  }
  return { unitMm, layers, blocks, entities };
}

/**
 * Tekst pliku DXF z bajtów: UTF-8 (AutoCAD 2007 i nowsze), inaczej strona kodowa z $DWGCODEPAGE
 * (np. ANSI_1250), a bez niej – Windows-1250 (polskie litery ze starszych plików).
 */
export function decodeDxf(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    // Nie UTF-8 – strona kodowa ANSI.
  }
  const page = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*ANSI_(\d+)/i.exec(new TextDecoder('latin1').decode(data.subarray(0, 65536)))?.[1];
  for (const label of [page ? `windows-${page}` : null, 'windows-1250']) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(data);
    } catch {
      // Nieznana strona kodowa – następna.
    }
  }
  return new TextDecoder('latin1').decode(data);
}

/** Tekst DXF: %%c ⌀, %%d °, %%p ±, \U+XXXX – znak Unicode, w MTEXT bez kodów formatowania (\P – nowy wiersz). */
export function dxfText(value, mtext = false) {
  let text = String(value ?? '').replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  if (mtext) {
    text = text.replace(/\\P/g, '\n').replace(/\\~/g, ' ').replace(/\\[ACFHQTWfcpq][^;\\{}]*;/g, '').replace(/\\[LlOoKkNX]/g, '')
      .replace(/\\S([^^/#;]*)[\\^/#]([^;]*);/g, '$1/$2').replace(/\\\\/g, '\\').replace(/[{}]/g, '');
  }
  return text.replace(/%%[cC]/g, '⌀').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%%/g, '%').replace(/%%[uUoO]/g, '');
}

/** Punkty łuku z wybrzuszeniem („bulge”) między a i b (bez punktu a). */
function bulgePoints(a, b, bulge) {
  if (!bulge || Math.abs(bulge) < 1e-9) return [b];
  const angle = 4 * Math.atan(bulge);
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord < 1e-12) return [b];
  const radius = chord / (2 * Math.sin(angle / 2));
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const distance = radius * Math.cos(angle / 2);
  const normal = { x: -(b.y - a.y) / chord, y: (b.x - a.x) / chord };
  const center = { x: middle.x + normal.x * distance, y: middle.y + normal.y * distance };
  const start = Math.atan2(a.y - center.y, a.x - center.x);
  const steps = Math.max(2, Math.ceil(Math.abs(angle) / (Math.PI / 16)));
  const r = Math.abs(radius);
  return Array.from({ length: steps }, (_, index) => {
    const t = start + (angle * (index + 1)) / steps;
    return index === steps - 1 ? b : { x: center.x + Math.cos(t) * r, y: center.y + Math.sin(t) * r };
  });
}

/** Punkty łamanej z wybrzuszeniami: vertices – [{ x, y, bulge }], closed – zamknięta. */
function polylinePoints(vertices, closed) {
  if (vertices.length === 0) return [];
  const points = [{ x: vertices[0].x, y: vertices[0].y }];
  const count = closed ? vertices.length : vertices.length - 1;
  for (let index = 0; index < count; index += 1) {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    points.push(...bulgePoints(a, b, a.bulge));
  }
  return points;
}

/** Krzywa B-spline (DXF SPLINE): punkty z węzłów, punktów kontrolnych i wag; bez węzłów – punkty dopasowania. */
function splinePoints(entity) {
  const degree = entity.number(71) ?? 3;
  const knots = entity.codes.filter(([code]) => code === 40).map(([, value]) => Number(value));
  const xs = entity.codes.filter(([code]) => code === 10).map(([, value]) => Number(value));
  const ys = entity.codes.filter(([code]) => code === 20).map(([, value]) => Number(value));
  const weights = entity.codes.filter(([code]) => code === 41).map(([, value]) => Number(value));
  const controls = xs.map((x, index) => ({ x, y: ys[index] ?? 0, w: weights[index] ?? 1 }));
  if (controls.length < 2 || knots.length !== controls.length + degree + 1) {
    const fx = entity.codes.filter(([code]) => code === 11).map(([, value]) => Number(value));
    const fy = entity.codes.filter(([code]) => code === 21).map(([, value]) => Number(value));
    const fit = fx.map((x, index) => ({ x, y: fy[index] ?? 0 }));
    return fit.length >= 2 ? fit : controls.map(({ x, y }) => ({ x, y }));
  }
  const [low, high] = [knots[degree], knots[controls.length]];
  const count = Math.min(400, Math.max(16, controls.length * 8));
  const at = (t) => {
    let span = degree;
    while (span < controls.length - 1 && t >= knots[span + 1]) span += 1;
    const d = Array.from({ length: degree + 1 }, (_, j) => {
      const point = controls[span - degree + j];
      return { x: point.x * point.w, y: point.y * point.w, w: point.w };
    });
    for (let r = 1; r <= degree; r += 1) {
      for (let j = degree; j >= r; j -= 1) {
        const i = span - degree + j;
        const denominator = knots[i + degree - r + 1] - knots[i];
        const alpha = denominator === 0 ? 0 : (t - knots[i]) / denominator;
        d[j] = { x: (1 - alpha) * d[j - 1].x + alpha * d[j].x, y: (1 - alpha) * d[j - 1].y + alpha * d[j].y, w: (1 - alpha) * d[j - 1].w + alpha * d[j].w };
      }
    }
    return { x: d[degree].x / d[degree].w, y: d[degree].y / d[degree].w };
  };
  return Array.from({ length: count + 1 }, (_, index) => at(low + ((high - low) * index) / count - (index === count ? 1e-9 : 0)));
}

/** Przekształcenie bloku (INSERT): skala, obrót (radiany), przesunięcie; punkt bazowy bloku odejmowany wcześniej. */
const transformPoint = (point, t) => {
  const [x, y] = [(point.x - t.base.x) * t.sx, (point.y - t.base.y) * t.sy];
  return { x: t.x + x * Math.cos(t.angle) - y * Math.sin(t.angle), y: t.y + x * Math.sin(t.angle) + y * Math.cos(t.angle) };
};
const IDENTITY = { base: { x: 0, y: 0 }, sx: 1, sy: 1, angle: 0, x: 0, y: 0 };

/** Punkty okręgu albo łuku (kąty w radianach, przeciwnie do ruchu wskazówek zegara). */
function circlePoints(center, radius, start, end) {
  let sweep = end - start;
  while (sweep <= 0) sweep += TAU;
  const steps = Math.max(8, Math.ceil(sweep / (Math.PI / 32)));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = start + (sweep * index) / steps;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

/**
 * Prymitywy pliku (jednostki pliku, oś y w górę): { kind: 'line' | 'xline' | 'circle' | 'arc' | 'ellipse' | 'poly' | 'point' | 'text',
 * …geometria, layer, color (#rrggbb), dash, weight (mm) } i liczba pominiętych encji.
 */
export function dxfPrimitives(parsed) {
  const out = [];
  let skipped = 0;
  const layerOf = (name) => parsed.layers.get(name) ?? { color: 7, hidden: false, linetype: 'CONTINUOUS' };
  const walk = (entities, transform, inherited, depth) => {
    for (const entity of entities) {
      const layer = entity.layer === '0' && inherited ? inherited.layer : entity.layer;
      const colorIndex = entity.color === 0 && inherited ? inherited.colorIndex : entity.color === null || entity.color === 256 ? layerOf(layer).color : entity.color;
      const color = entity.trueColor !== null && entity.color !== 256
        ? `#${(entity.trueColor & 0xffffff).toString(16).padStart(6, '0')}` : aciHex(Math.abs(colorIndex ?? 7));
      const linetype = !entity.linetype || /^BYLAYER$/i.test(entity.linetype) ? layerOf(layer).linetype
        : /^BYBLOCK$/i.test(entity.linetype) ? inherited?.linetype ?? 'CONTINUOUS' : entity.linetype;
      const common = { layer, color, colorIndex: Math.abs(colorIndex ?? 7), dash: dashOfLinetype(linetype), weight: entity.weight !== null && entity.weight > 0 ? entity.weight / 100 : null };
      const p = (xc, yc) => transform({ x: entity.number(xc) ?? 0, y: entity.number(yc) ?? 0 });
      const uniform = (length) => {
        const a = transform({ x: 0, y: 0 });
        const b = transform({ x: length, y: 0 });
        return Math.hypot(b.x - a.x, b.y - a.y);
      };
      // Odbicie przez blok (ujemna skala) albo skala niejednakowa – okręgi i łuki jako punkty.
      const probe = [transform({ x: 0, y: 0 }), transform({ x: 1, y: 0 }), transform({ x: 0, y: 1 })];
      const ux = { x: probe[1].x - probe[0].x, y: probe[1].y - probe[0].y };
      const uy = { x: probe[2].x - probe[0].x, y: probe[2].y - probe[0].y };
      const conformal = Math.abs(Math.hypot(ux.x, ux.y) - Math.hypot(uy.x, uy.y)) < 1e-6 * Math.max(1, Math.hypot(ux.x, ux.y)) && ux.x * uy.y - ux.y * uy.x > 0;
      const turn = Math.atan2(ux.y, ux.x);
      switch (entity.type) {
        case 'LINE':
          out.push({ ...common, kind: 'line', a: p(10, 20), b: p(11, 21) });
          break;
        case 'XLINE':
        case 'RAY': {
          const a = p(10, 20);
          const b = transform({ x: (entity.number(10) ?? 0) + (entity.number(11) ?? 1), y: (entity.number(20) ?? 0) + (entity.number(21) ?? 0) });
          // Od 1.40 półprosta – osobno (do 1.39 jak prosta).
          out.push({ ...common, kind: entity.type === 'RAY' ? 'ray' : 'xline', a, b });
          break;
        }
        case 'CIRCLE':
        case 'ARC': {
          const center = { x: entity.number(10) ?? 0, y: entity.number(20) ?? 0 };
          const radius = entity.number(40) ?? 0;
          if (radius <= 0) break;
          const arc = entity.type === 'ARC';
          const [start, end] = arc ? [((entity.number(50) ?? 0) * Math.PI) / 180, ((entity.number(51) ?? 360) * Math.PI) / 180] : [0, TAU];
          if (conformal) {
            out.push({ ...common, kind: arc ? 'arc' : 'circle', c: transform(center), r: uniform(radius), start: start + turn, end: end + turn });
          } else {
            out.push({ ...common, kind: 'poly', points: circlePoints(center, radius, start, end).map(transform), closed: !arc });
          }
          break;
        }
        case 'ELLIPSE': {
          const center = { x: entity.number(10) ?? 0, y: entity.number(20) ?? 0 };
          const major = { x: entity.number(11) ?? 1, y: entity.number(21) ?? 0 };
          const ratio = entity.number(40) ?? 1;
          const [start, end] = [entity.number(41) ?? 0, entity.number(42) ?? TAU];
          const full = Math.abs(end - start - TAU) < 1e-6 || Math.abs(end - start) < 1e-9;
          const a = Math.hypot(major.x, major.y);
          const rotation = Math.atan2(major.y, major.x);
          if (full && conformal) {
            out.push({ ...common, kind: 'ellipse', c: transform(center), a: uniform(a), b: uniform(a * ratio), angle: rotation + turn });
          } else {
            let sweep = end - start;
            while (sweep <= 0) sweep += TAU;
            const steps = Math.max(12, Math.ceil(sweep / (Math.PI / 32)));
            const points = Array.from({ length: steps + 1 }, (_, index) => {
              const t = start + (sweep * index) / steps;
              const [lx, ly] = [Math.cos(t) * a, Math.sin(t) * a * ratio];
              return transform({ x: center.x + lx * Math.cos(rotation) - ly * Math.sin(rotation), y: center.y + lx * Math.sin(rotation) + ly * Math.cos(rotation) });
            });
            out.push({ ...common, kind: 'poly', points, closed: full });
          }
          break;
        }
        case 'LWPOLYLINE': {
          const vertices = [];
          for (const [code, value] of entity.codes) {
            if (code === 10) vertices.push({ x: Number(value), y: 0, bulge: 0 });
            else if (code === 20 && vertices.length) vertices.at(-1).y = Number(value);
            else if (code === 42 && vertices.length) vertices.at(-1).bulge = Number(value);
          }
          const closed = ((entity.number(70) ?? 0) & 1) === 1;
          const points = polylinePoints(vertices, closed).map(transform);
          if (points.length >= 2) out.push({ ...common, kind: 'poly', points, closed });
          break;
        }
        case 'POLYLINE': {
          const flags = entity.number(70) ?? 0;
          if (flags & (16 | 64)) {
            skipped += 1;
            break;
          }
          const vertices = (entity.vertices ?? []).filter((vertex) => ((vertex.number(70) ?? 0) & 16) === 0)
            .map((vertex) => ({ x: vertex.number(10) ?? 0, y: vertex.number(20) ?? 0, bulge: vertex.number(42) ?? 0 }));
          const closed = (flags & 1) === 1;
          const points = polylinePoints(vertices, closed).map(transform);
          if (points.length >= 2) out.push({ ...common, kind: 'poly', points, closed });
          break;
        }
        case 'SPLINE': {
          const points = splinePoints(entity).map(transform);
          if (points.length >= 2) out.push({ ...common, kind: 'poly', points, closed: ((entity.number(70) ?? 0) & 1) === 1 });
          break;
        }
        case 'POINT':
          out.push({ ...common, kind: 'point', p: p(10, 20) });
          break;
        case 'SOLID':
        case 'TRACE': {
          // Wypełniony trójkąt albo czworokąt (np. grot wymiaru): wierzchołki w kolejności 1, 2, 4, 3.
          const third = p(12, 22);
          const fourth = entity.number(13) === null ? third : p(13, 23);
          out.push({ ...common, kind: 'poly', points: [p(10, 20), p(11, 21), fourth, third], closed: true, fill: true });
          break;
        }
        case 'TEXT':
        case 'MTEXT': {
          const mtext = entity.type === 'MTEXT';
          const raw = mtext ? entity.codes.filter(([code]) => code === 3 || code === 1).map(([, value]) => value).join('') : entity.first(1);
          const text = dxfText(raw, mtext).trim();
          if (!text) break;
          // TEXT wyrównany (72/73) ma punkt w 11/21. Zaczepienie: ax – część szerokości (0 lewo, 0,5 środek, 1 prawo),
          // ay – linia bazowa, góra, środek albo dół tekstu (MTEXT: punkt 71 – 1…9 od lewego górnego).
          const [horizontal, vertical] = [entity.number(72) ?? 0, entity.number(73) ?? 0];
          const aligned = !mtext && (horizontal !== 0 || vertical !== 0) && entity.number(11) !== null;
          const point = aligned ? p(11, 21) : p(10, 20);
          let [ax, ay] = [0, mtext ? 'top' : 'baseline'];
          if (mtext) {
            const attach = Math.min(9, Math.max(1, entity.number(71) ?? 1)) - 1;
            [ax, ay] = [(attach % 3) / 2, ['top', 'middle', 'bottom'][Math.floor(attach / 3)]];
          } else if (aligned && horizontal !== 3 && horizontal !== 5) {
            ax = horizontal === 1 || horizontal === 4 ? 0.5 : horizontal === 2 ? 1 : 0;
            ay = horizontal === 4 ? 'middle' : ['baseline', 'bottom', 'middle', 'top'][vertical] ?? 'baseline';
          }
          out.push({ ...common, kind: 'text', p: point, height: uniform(entity.number(40) ?? 2.5), text, top: mtext, ax, ay });
          break;
        }
        case 'INSERT':
        case 'DIMENSION': {
          const block = parsed.blocks.get(entity.first(2));
          if (!block || depth > 8) {
            if (!block && entity.type === 'INSERT') skipped += 1;
            break;
          }
          const inner = entity.type === 'DIMENSION'
            ? IDENTITY
            : {
              base: block.base, sx: entity.number(41) ?? 1, sy: entity.number(42) ?? 1, angle: ((entity.number(50) ?? 0) * Math.PI) / 180,
              x: entity.number(10) ?? 0, y: entity.number(20) ?? 0
            };
          const next = (point) => transform(transformPoint(point, inner));
          walk(block.entities, next, { layer, colorIndex: colorIndex ?? 7, linetype }, depth + 1);
          break;
        }
        default:
          skipped += 1;
      }
    }
  };
  walk(parsed.entities, (point) => point, null, 0);
  return { primitives: out, skipped };
}

/** Prostokąt obejmujący prymitywy (jednostki pliku) albo null. */
export function primitivesBounds(primitives) {
  const points = [];
  for (const item of primitives) {
    if (item.kind === 'line') points.push(item.a, item.b);
    else if (item.kind === 'xline' || item.kind === 'ray' || item.kind === 'point') points.push(item.kind === 'point' ? item.p : item.a);
    else if (item.kind === 'circle') points.push({ x: item.c.x - item.r, y: item.c.y - item.r }, { x: item.c.x + item.r, y: item.c.y + item.r });
    else if (item.kind === 'arc') points.push(...circlePoints(item.c, item.r, item.start, item.end));
    else if (item.kind === 'ellipse') points.push({ x: item.c.x - item.a, y: item.c.y - item.a }, { x: item.c.x + item.a, y: item.c.y + item.a });
    else if (item.kind === 'poly') points.push(...item.points);
    else if (item.kind === 'text') {
      const width = item.height * item.text.length * 0.6;
      const left = item.p.x - width * (item.ax ?? 0);
      points.push({ x: left, y: item.p.y }, { x: left + width, y: item.p.y + item.height });
    }
  }
  const valid = points.filter((point) => finite(point.x) && finite(point.y));
  if (valid.length === 0) return null;
  const xs = valid.map((point) => point.x);
  const ys = valid.map((point) => point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Skala „1 kratka = …” z szeregu 1–2–5, przy której obszar `widthMm` × `heightMm` mieści się w stronie (kratki). */
export function fittingScale(widthMm, heightMm, pageWidth, pageHeight, margin = 0.9) {
  const need = Math.max(widthMm / ((pageWidth / PAPER_STEP) * margin), heightMm / ((pageHeight / PAPER_STEP) * margin), 1e-9);
  const steps = [1, 2, 5];
  let exponent = Math.floor(Math.log10(need));
  for (;;) {
    for (const step of steps) {
      const mm = step * 10 ** exponent;
      if (mm >= need - 1e-12) {
        // Jednostka skali: mm do 10 mm, cm do 1 m, m powyżej.
        if (mm < 10) return { value: Number(mm.toPrecision(6)), unit: 'mm' };
        if (mm < 1000) return { value: Number((mm / 10).toPrecision(6)), unit: 'cm' };
        return { value: Number((mm / 1000).toPrecision(6)), unit: 'm' };
      }
    }
    exponent += 1;
  }
}

/**
 * Elementy rysunku z prymitywów: placement – { unitMm, pageUnitMm, origin: { x, y } – punkt strony dla lewego górnego
 * rogu obszaru pliku, bounds }, layerOf(nazwa) – numer warstwy rysunku, defaultSize – grubość bez grubości z pliku.
 */
export function primitivesToElements(primitives, { unitMm, pageUnitMm, origin, bounds, layerOf = () => 1, defaultSize = 2 }) {
  const k = unitMm / pageUnitMm;
  const at = (point) => ({ x: origin.x + (point.x - bounds.minX) * k, y: origin.y + (bounds.maxY - point.y) * k });
  const elements = [];
  for (const item of primitives) {
    const style = {
      color: paperColor(item.color), size: item.weight ? Math.min(40, Math.max(0.5, Math.round((item.weight / pageUnitMm) * 10) / 10)) : defaultSize,
      dash: item.dash, fill: 'none'
    };
    const layer = layerOf(item.layer);
    const put = (element) => {
      if (!element) return;
      if (layer !== 1) element.layers = [layer];
      elements.push(element);
    };
    const segment = (shape, a, b) => {
      const [dx, dy] = [b.x - a.x, b.y - a.y];
      const length = Math.hypot(dx, dy);
      if (length < 0.01) return null;
      const element = {
        tool: 'shape', shape, color: style.color, size: style.size, x: round1((a.x + b.x) / 2), y: round1((a.y + b.y) / 2),
        w: round1(Math.max(4, length)), h: 0, angle: Math.atan2(dy, dx), skew: 0, adjust: 0
      };
      if (style.dash !== 'solid') element.dash = style.dash;
      return element;
    };
    switch (item.kind) {
      case 'line':
        put(segment('line', at(item.a), at(item.b)));
        break;
      case 'xline':
      case 'ray': {
        const [a, b] = [at(item.a), at(item.b)];
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        put(segment(item.kind, a, { x: a.x + ((b.x - a.x) / length) * 176, y: a.y + ((b.y - a.y) / length) * 176 }));
        break;
      }
      case 'circle':
        put(circleShape(at(item.c), item.r * k, style));
        break;
      case 'arc': {
        const point = (angle) => at({ x: item.c.x + Math.cos(angle) * item.r, y: item.c.y + Math.sin(angle) * item.r });
        let sweep = item.end - item.start;
        while (sweep <= 0) sweep += TAU;
        put(arcFromPoints(point(item.start), point(item.start + sweep), point(item.start + sweep / 2), style));
        break;
      }
      case 'ellipse': {
        const center = at(item.c);
        const element = {
          tool: 'shape', shape: 'ellipse', color: style.color, size: style.size, x: round1(center.x), y: round1(center.y),
          w: round1(Math.max(4, item.a * 2 * k)), h: round1(Math.max(4, item.b * 2 * k)), angle: -item.angle, skew: 0, adjust: 0
        };
        if (style.dash !== 'solid') element.dash = style.dash;
        put(element);
        break;
      }
      case 'poly': {
        const points = dedupe(item.points.map(at));
        if (points.length < 2) break;
        if (item.closed && points.at(-1) && points.length > 3 && Math.hypot(points.at(-1).x - points[0].x, points.at(-1).y - points[0].y) <= 0.05) points.pop();
        if (item.closed && points.length >= 3 && points.length <= POLY_NODES_MAX) {
          put(withDashOf(polyFromPoints('polygon', points, { x: points[0].x, y: points[0].y, angle: 0 }, item.fill ? { ...style, fill: 'solid' } : style), style.dash));
          break;
        }
        const path = item.closed ? [...points, points[0]] : points;
        // Najwyżej POLY_NODES_MAX wierzchołków w łamanej – dłuższa dzieli się na kawałki o wspólnych końcach.
        for (let start = 0; start < path.length - 1; start += POLY_NODES_MAX - 1) {
          const part = path.slice(start, start + POLY_NODES_MAX);
          if (part.length >= 2) put(withDashOf(polyFromPoints('polyline', part, { x: part[0].x, y: part[0].y, angle: 0 }, style), style.dash));
        }
        break;
      }
      case 'point': {
        const point = at(item.p);
        put({ tool: 'shape', shape: 'point', color: style.color, size: style.size, x: round1(point.x), y: round1(point.y), w: 16, h: 16, angle: 0, skew: 0, adjust: 0, mark: 'dot' });
        break;
      }
      case 'text': {
        // Wysokość znaków DXF ≈ 0,7 wielkości czcionki; TEXT – punkt na linii bazowej, MTEXT – lewy górny róg.
        const size = Math.min(200, Math.max(8, Math.round((item.height * k) / 0.7)));
        const point = at(item.p);
        const lines = item.text.split('\n');
        const width = Math.max(...lines.map((line) => line.length)) * size * 0.55 + 2;
        const height = lines.length * size * 1.25;
        const anchor = item.ay ?? (item.top ? 'top' : 'baseline');
        const top = anchor === 'top' ? point.y : anchor === 'middle' ? point.y - height / 2 : anchor === 'bottom' ? point.y - height : point.y - size * 0.95;
        const left = point.x - width * (item.ax ?? 0);
        put({ tool: 'text', color: style.color, x: round1(left), y: round1(top), size, text: item.text, width: Math.ceil(width), height: Math.ceil(height), maxWidth: Math.ceil(width) + size });
        break;
      }
      default:
    }
  }
  return elements;
}

const round1 = (value) => Math.round(value * 10) / 10;
const dedupe = (points) => points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.05);
const withDashOf = (shape, dash) => (dash && dash !== 'solid' ? { ...shape, dash } : shape);

// ---------------------------------------------------------------- zapis

/** Nazwa warstwy DXF: bez znaków niedozwolonych (< > / \ " : ; ? * | = `), najwyżej 31 znaków (R12), wielkie litery. */
export const dxfLayerName = (name) => (String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
  .replace(/[^A-Za-z0-9_$-]+/g, '_').replace(/^_+|_+$/g, '') || 'WARSTWA').slice(0, 31).toUpperCase();

const LINETYPES = [
  ['CONTINUOUS', 'Solid line', []],
  ['DASHED', 'Dashed __ __ __', [12, -6]],
  ['CENTER', 'Center ____ _ ____', [31.75, -6.35, 6.35, -6.35]],
  ['PHANTOM', 'Phantom ____ _ _ ____', [31.75, -6.35, 6.35, -6.35, 6.35, -6.35]],
  ['DOT', 'Dot . . . .', [0, -6.35]]
];
const DASH_LINETYPE = { solid: 'CONTINUOUS', dashed: 'DASHED', center: 'CENTER', phantom: 'PHANTOM', dotted: 'DOT' };
const fixed = (value) => (Math.abs(value) < 1e-9 ? '0' : String(Number(value.toFixed(4))));
/** Kąt w stopniach 0–360 z radianów (oś y w górę). */
const degrees = (angle) => fixed((((angle * 180) / Math.PI) % 360 + 360) % 360);

/** Napis do DXF R12 (same znaki ASCII): ⌀ %%c, ° %%d, ± %%p, minus „−” jako „-”, inne znaki – \U+XXXX. */
export function dxfString(value) {
  let out = '';
  for (const char of String(value).replace(/[\r\n]+/g, ' ')) {
    const code = char.codePointAt(0);
    if (char === '⌀' || char === 'Ø' || char === 'ø') out += '%%c';
    else if (char === '°') out += '%%d';
    else if (char === '±') out += '%%p';
    else if (char === '−' || char === '–') out += '-';
    else if (code >= 32 && code < 127) out += char;
    else if (code <= 0xffff && code >= 160) out += `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    else out += '?';
  }
  return out;
}

/**
 * Kartka jako DXF R12 (tekst): elementy w milimetrach w skali rysunku (oś y w górę), warstwa – sygnatura rzędu 1
 * (ukryta – wyłączona), kolor ACI, rodzaj linii; wymiary – linie, groty (SOLID) i liczba (TEXT), napisy – same
 * znaki ASCII (\U+XXXX). Zwraca { text, written – zapisane elementy kartki, skipped } (pominięte: tabele,
 * karteczki, symbole metrologiczne).
 */
export function drawingToDxf(drawing) {
  const mm = pageUnitMillimeters(drawing.scale);
  const pt = (point) => ({ x: point.x * mm, y: (drawing.height - point.y) * mm });
  const layers = drawingLayers(drawing);
  const names = new Map(elementLayers(layers).map((layer) => [layer.id, dxfLayerName(layer.name)]));
  // Te same nazwy po uproszczeniu – z numerem.
  const seen = new Set();
  for (const [id, name] of names) {
    let unique = name;
    for (let n = 2; seen.has(unique); n += 1) unique = `${name.slice(0, 28)}_${n}`;
    seen.add(unique);
    names.set(id, unique);
  }
  const out = [];
  const pair = (code, value) => out.push(String(code), String(value));
  const entities = [];
  let skipped = 0;
  const head = (type, stroke) => {
    const layer = names.get(layersOf(stroke)[0]) ?? names.get(1);
    return [[0, type], [8, layer], [62, hexAci(stroke.color)], ...(stroke.dash && stroke.dash !== 'solid' ? [[6, DASH_LINETYPE[stroke.dash]]] : [])];
  };
  const add = (codes) => entities.push(codes);
  const line = (stroke, a, b) => add([...head('LINE', stroke), [10, fixed(a.x)], [20, fixed(a.y)], [30, 0], [11, fixed(b.x)], [21, fixed(b.y)], [31, 0]]);
  const polyline = (stroke, points, closed) => {
    if (points.length < 2) return;
    add([...head('POLYLINE', stroke), [66, 1], [10, 0], [20, 0], [30, 0], [70, closed ? 1 : 0]]);
    // Wierzchołek z bulge (od 1.40 – zaokrąglone narożniki prostokąta): łuk do następnego wierzchołka.
    for (const point of points) {
      add([[0, 'VERTEX'], [8, head('VERTEX', stroke)[1][1]], [10, fixed(point.x)], [20, fixed(point.y)], [30, 0], ...(point.bulge ? [[42, fixed(point.bulge)]] : [])]);
    }
    add([[0, 'SEQEND'], [8, head('SEQEND', stroke)[1][1]]]);
  };
  const text = (stroke, point, height, value) => add([...head('TEXT', stroke), [10, fixed(point.x)], [20, fixed(point.y)], [30, 0], [40, fixed(height)], [1, dxfString(value)]]);
  const arc = (stroke, center, radius, from, sweep) => {
    // Strona: oś y w dół – kąty z odwróconym znakiem; DXF: łuk przeciwnie do ruchu wskazówek zegara.
    const c = pt(center);
    let [start, end] = [-from, -(from + sweep)];
    if (sweep > 0) [start, end] = [end, start];
    add([...head('ARC', stroke), [10, fixed(c.x)], [20, fixed(c.y)], [30, 0], [40, fixed(radius * mm)], [50, degrees(start)], [51, degrees(end)]]);
  };
  // Grot wymiaru – wypełniony trójkąt (SOLID) z ostrzem w `tip`, skierowany pod kątem `angle` (strona).
  const arrowHead = (stroke, tip, angle) => {
    const [cos, sin, half] = [Math.cos(angle), Math.sin(angle), DIM_ARROW * 0.3];
    const corners = [tip, { x: tip.x - cos * DIM_ARROW - sin * half, y: tip.y - sin * DIM_ARROW + cos * half },
      { x: tip.x - cos * DIM_ARROW + sin * half, y: tip.y - sin * DIM_ARROW - cos * half }].map(pt);
    add([...head('SOLID', stroke), ...[...corners, corners[2]].flatMap((point, index) => [[10 + index, fixed(point.x)], [20 + index, fixed(point.y)], [30 + index, 0]])]);
  };
  const format = dimFormat(drawing);
  // Wymiar `key` jak na kartce: linie pomocnicze, linia wymiarowa albo łuk, groty i liczba (TEXT wyśrodkowany).
  const writeDim = (stroke, key) => {
    const geometry = dimGeometry(stroke, key);
    if (geometry.kind === 'linear') {
      const { from, to, ext } = geometry;
      for (const [a, b] of ext) line(stroke, pt(a), pt(b));
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
      if (geometry.arrows === 'end') {
        line(stroke, pt(from), pt(to));
        arrowHead(stroke, to, angle);
      } else if (length >= DIM_ARROW * 2.6) {
        line(stroke, pt(from), pt(to));
        arrowHead(stroke, from, angle + Math.PI);
        arrowHead(stroke, to, angle);
      } else {
        const reach = DIM_ARROW * 2;
        line(stroke, pt({ x: from.x - dx * reach, y: from.y - dy * reach }), pt({ x: to.x + dx * reach, y: to.y + dy * reach }));
        arrowHead(stroke, from, angle);
        arrowHead(stroke, to, angle + Math.PI);
      }
    } else {
      const { center, radius, start, sweep, ref } = geometry;
      if (ref) line(stroke, pt(ref[0]), pt(ref[1]));
      for (const [a, b] of geometry.exts ?? []) line(stroke, pt(a), pt(b));
      if (Math.abs(sweep) > 1e-3) {
        arc(stroke, center, radius, start, sweep);
        const sign = Math.sign(sweep);
        const inside = Math.abs(sweep) * radius >= DIM_ARROW * 2.6;
        const tip = (theta, forward) => {
          const tangent = Math.atan2(Math.cos(theta), -Math.sin(theta));
          arrowHead(stroke, { x: center.x + Math.cos(theta) * radius, y: center.y + Math.sin(theta) * radius }, tangent + (forward ? 0 : Math.PI));
        };
        tip(start, (sign < 0) === inside);
        tip(start + sweep, (sign > 0) === inside);
      }
    }
    // Liczba: TEXT wyśrodkowany; od 1.38 graniczne – dwa wiersze, dokładny – w prostokącie, kontrolny – w owalu.
    const { angle } = geometry.text;
    const parts = dimensionParts(stroke, key, drawing.scale, format);
    const limits = parts.tolerance?.kind === 'limits';
    const framed = parts.frame === 'basic' || parts.frame === 'inspection';
    const local = (dx, dy) => ({
      x: geometry.text.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: geometry.text.y + dx * Math.sin(angle) + dy * Math.cos(angle)
    });
    const lift = geometry.kind === 'linear' ? (limits ? DIM_FONT * 0.42 : framed ? DIM_FONT * 0.15 : 0) : 0;
    const label = (value, dy) => {
      const at = pt(local(0, dy - lift));
      add([...head('TEXT', stroke), [10, fixed(at.x)], [20, fixed(at.y)], [30, 0], [40, fixed(DIM_FONT * 0.7 * mm)],
        [1, dxfString(value)], [50, degrees(-angle)], [72, 1], [11, fixed(at.x)], [21, fixed(at.y)], [31, 0], [73, 2]]);
    };
    const value = dimensionText(stroke, key, drawing.scale, format);
    if (limits) {
      label(`${parts.main}${parts.tolerance.upper}`, -DIM_FONT * 0.45);
      label(`${parts.main}${parts.tolerance.lower}`, DIM_FONT * 0.45);
    } else {
      label(value, 0);
    }
    if (framed) {
      const tall = DIM_FONT * (limits ? 0.95 : 0.62);
      const half = (Math.max(...(limits ? [parts.tolerance.upper, parts.tolerance.lower].map((text) => parts.main.length + text.length) : [value.length])) * DIM_FONT * 0.42) / 2
        + (parts.frame === 'basic' ? DIM_FONT * 0.3 : tall * 0.9);
      const outline = parts.frame === 'basic'
        ? [local(-half, -tall - lift), local(half, -tall - lift), local(half, tall - lift), local(-half, tall - lift)]
        : [...Array.from({ length: 9 }, (_, index) => {
          const turn = -Math.PI / 2 + (Math.PI * index) / 8;
          return local(half - tall + Math.cos(turn) * tall, Math.sin(turn) * tall - lift);
        }), ...Array.from({ length: 9 }, (_, index) => {
          const turn = Math.PI / 2 + (Math.PI * index) / 8;
          return local(-half + tall + Math.cos(turn) * tall, Math.sin(turn) * tall - lift);
        })];
      polyline(stroke, outline.map(pt), true);
    }
  };
  /**
   * Linie, strzałki, ramki, okręgi i napisy (diagram, od 1.44 – także układ kartki) w kolorze elementu; napis wyśrodkowany
   * albo do prawej – przesunięty o szacowaną szerokość (TEXT bez wyrównania), obrócony – z kątem 50.
   */
  const writeGeometry = (stroke, geometry) => {
    for (const [a, b] of [...(geometry.spine ? [geometry.spine] : []), ...(geometry.lines ?? [])]) line(stroke, pt(a), pt(b));
    for (const { from, to } of geometry.arrows ?? []) {
      line(stroke, pt(from), pt(to));
      arrowHead(stroke, to, Math.atan2(to.y - from.y, to.x - from.x));
    }
    for (const box of geometry.boxes ?? []) {
      polyline(stroke, [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }].map(pt), true);
    }
    for (const circle of geometry.circles ?? []) {
      const ring = Array.from({ length: 72 }, (_, index) => ({ x: circle.x + Math.cos((index / 72) * Math.PI * 2) * circle.r, y: circle.y + Math.sin((index / 72) * Math.PI * 2) * circle.r }));
      polyline(stroke, ring.map(pt), true);
    }
    for (const item of geometry.texts ?? []) {
      if (!item.text) continue;
      const wide = Math.min(item.width ?? Infinity, textWidth(item.text, item.size, item.bold));
      const shift = item.align === 'center' ? wide / 2 : item.align === 'right' ? wide : 0;
      if (item.rotate) {
        const start = pt({ x: item.x, y: item.y + shift });
        add([...head('TEXT', stroke), [10, fixed(start.x)], [20, fixed(start.y)], [30, 0], [40, fixed(item.size * mm * 0.7)], [1, dxfString(item.text)], [50, 90]]);
      } else {
        text(stroke, pt({ x: item.x - shift, y: item.y }), item.size * mm * 0.7, item.text);
      }
    }
  };
  const writeStroke = (stroke) => {
    if (isArray(stroke)) {
      for (const item of expandArray(stroke)) writeStroke({ ...item, layers: stroke.layers ?? item.layers });
      return;
    }
    if (stroke.tool === 'pen' || stroke.tool === 'highlighter') {
      const points = [];
      for (let index = 0; index + 2 < stroke.points.length; index += 3) points.push(pt({ x: stroke.points[index], y: stroke.points[index + 1] }));
      polyline(stroke, points, false);
      return;
    }
    if (stroke.tool === 'text' || stroke.tool === 'math') {
      // Każdy wiersz – osobny TEXT (R12 nie ma tekstu wielowierszowego).
      const rows = (stroke.tool === 'text' ? stroke.text : stroke.source).split('\n');
      rows.forEach((row, index) => {
        if (row.trim()) text(stroke, pt({ x: stroke.x + 1, y: stroke.y + stroke.size * (0.95 + index * 1.25) }), stroke.size * mm * 0.7, row);
      });
      return;
    }
    if (stroke.tool === 'sticky' && stickyColor(stroke.color).clear && !stroke.collapsed) {
      // Odnośnik bez kartki (od 1.38): tekst (wiersze jak wpisane) i strzałka z grotem.
      const ink = { ...stroke, color: stickyColor(stroke.color).ink };
      const pad = Math.round(stroke.size * 0.65);
      stroke.text.split('\n').forEach((row, index) => {
        if (row.trim()) text(ink, pt({ x: stroke.x + pad, y: stroke.y + pad + stroke.size * (0.95 + index * 1.25) }), stroke.size * mm * 0.7, row);
      });
      if (stroke.leader) {
        const start = leaderStart(stroke);
        line(ink, pt(start), pt(stroke.leader));
        arrowHead(ink, stroke.leader, Math.atan2(stroke.leader.y - start.y, stroke.leader.x - start.x));
      }
      return;
    }
    // Diagram jakości (od 1.44): linie, strzałki, ramki i napisy rozkładu.
    if (stroke.tool === 'diagram') {
      writeGeometry(stroke, diagramLayout(stroke));
      return;
    }
    if (stroke.tool !== 'shape') {
      skipped += 1;
      return;
    }
    if (isMeasure(stroke)) {
      writeDim(stroke, dimKeys(stroke)[0]);
      return;
    }
    // Stałe wymiary kształtu (od 1.22.1) – jak wymiary narzędzia „Wymiar”.
    for (const key of shownDims(stroke)) writeDim(stroke, key);
    // Kreskowanie (od 1.40) – odcinki linią ciągłą; osie okręgu (od 1.42) – linią osiową.
    for (const [a, b] of shapeHatch(stroke)) line({ ...stroke, dash: 'solid' }, pt(a), pt(b));
    for (const [a, b] of shapeAxes(stroke)) line({ ...stroke, dash: 'center' }, pt(a), pt(b));
    switch (stroke.shape) {
      case 'ray': {
        // Półprosta (od 1.40) – od pierwszego punktu do brzegu strony i dalej (DXF R12 nie ma RAY).
        const reach = Math.hypot(drawing.width, drawing.height);
        const start = shapePoint(stroke, -0.5, 0);
        line(stroke, pt(start), pt({ x: start.x + Math.cos(stroke.angle) * reach, y: start.y + Math.sin(stroke.angle) * reach }));
        return;
      }
      case 'rect':
        if (stroke.corner?.kind === 'round' && !stroke.skew && cornerSize(stroke) > 0) {
          // Zaokrąglenia – łuki (bulge ćwiartki: −tan 22,5°, zgodnie z ruchem wskazówek zegara).
          const [r, hw, hh] = [cornerSize(stroke), stroke.w / 2, stroke.h / 2];
          const at = (lx, ly, bulge = 0) => ({ ...pt(shapePoint(stroke, lx / stroke.w, ly / stroke.h)), bulge });
          const quarter = -Math.tan(Math.PI / 8);
          const list = [];
          for (const point of [at(-hw + r, -hh), at(hw - r, -hh, quarter), at(hw, -hh + r), at(hw, hh - r, quarter), at(hw - r, hh),
            at(-hw + r, hh, quarter), at(-hw, hh - r), at(-hw, -hh + r, quarter)]) {
            const last = list.at(-1);
            if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1e-6) last.bulge = point.bulge;
            else list.push(point);
          }
          polyline(stroke, list, true);
          return;
        }
        break;
      case 'line':
      case 'arrow':
      case 'xline': {
        const [a, b] = [{ x: stroke.x - (Math.cos(stroke.angle) * stroke.w) / 2, y: stroke.y - (Math.sin(stroke.angle) * stroke.w) / 2 },
          { x: stroke.x + (Math.cos(stroke.angle) * stroke.w) / 2, y: stroke.y + (Math.sin(stroke.angle) * stroke.w) / 2 }];
        if (stroke.shape === 'xline') {
          // Prosta – przez całą stronę (DXF R12 nie ma XLINE).
          const reach = Math.hypot(drawing.width, drawing.height);
          const [ux, uy] = [Math.cos(stroke.angle), Math.sin(stroke.angle)];
          line(stroke, pt({ x: stroke.x - ux * reach, y: stroke.y - uy * reach }), pt({ x: stroke.x + ux * reach, y: stroke.y + uy * reach }));
        } else {
          line(stroke, pt(a), pt(b));
        }
        return;
      }
      case 'ellipse':
        if (Math.abs(stroke.w - stroke.h) < 0.01 && !stroke.skew) {
          const c = pt(stroke);
          add([...head('CIRCLE', stroke), [10, fixed(c.x)], [20, fixed(c.y)], [30, 0], [40, fixed((stroke.w / 2) * mm)]]);
          return;
        }
        break;
      case 'arc': {
        const geometry = arcGeometry(stroke);
        if (geometry) {
          arc(stroke, geometry.center, geometry.radius, geometry.start, geometry.sweep);
          return;
        }
        break;
      }
      case 'point': {
        const c = pt(stroke);
        add([...head('POINT', stroke), [10, fixed(c.x)], [20, fixed(c.y)], [30, 0]]);
        return;
      }
      case 'curve':
        polyline(stroke, curveSamples(stroke).map(pt), false);
        return;
      case 'polyline':
      case 'polygon':
        polyline(stroke, polyPoints(stroke).map(pt), stroke.shape === 'polygon');
        return;
      default:
    }
    const { points, closed } = shapeOutline(stroke);
    const list = [];
    for (let index = 0; index + 1 < points.length; index += 2) list.push(pt({ x: points[index], y: points[index + 1] }));
    polyline(stroke, list, closed);
  };
  // Ramka rysunkowa z tabliczką (od 1.41) – osobna warstwa RAMKA: brzeg arkusza, ramka, tabliczka i jej napisy.
  const frameLayer = drawing.frame ? ['RAMKA', 'RAMKA_RYSUNKOWA', 'RAMKA_LEXICARDS'].find((name) => !seen.has(name)) : null;
  if (frameLayer) {
    const start = entities.length;
    const ink = { color: '#1d1d1f' };
    const { sheet, border, block, lines, cells } = frameLayout(drawing.frame, drawing.width, drawing.height, drawing.scale);
    const box = (x, y, w, h) => polyline(ink, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map(pt), true);
    box(sheet.x, sheet.y, sheet.width, sheet.height);
    box(border.x, border.y, border.w, border.h);
    box(block.x, block.y, block.w, block.h);
    for (const [a, b] of lines) line(ink, pt(a), pt(b));
    for (const cell of cells) {
      const pad = cell.labelSize * 0.7;
      text(ink, pt({ x: cell.x + pad, y: cell.y + pad + cell.labelSize * 0.8 }), cell.labelSize * 0.7 * mm, cell.label);
      if (cell.value) text(ink, pt({ x: cell.x + pad, y: cell.y + cell.h - pad * 1.1 }), cell.valueSize * 0.7 * mm, cell.value);
    }
    for (let index = start; index < entities.length; index += 1) entities[index] = entities[index].map(([code, value]) => (code === 8 ? [8, frameLayer] : [code, value]));
  }
  // Układ kartki (od 1.44) – osobna warstwa UKLAD (jak ramka).
  const layoutLayer = drawing.layout ? ['UKLAD', 'UKLAD_KARTKI', 'UKLAD_LEXICARDS'].find((name) => !seen.has(name)) : null;
  if (layoutLayer) {
    const start = entities.length;
    writeGeometry({ color: '#6e6e73' }, pageLayoutGeometry(drawing.layout, drawing));
    for (let index = start; index < entities.length; index += 1) entities[index] = entities[index].map(([code, value]) => (code === 8 ? [8, layoutLayer] : [code, value]));
  }
  let written = 0;
  for (const stroke of drawing.strokes) {
    const before = skipped;
    writeStroke(stroke);
    if (skipped === before) written += 1;
  }
  // Nagłówek: R12, jednostki – milimetry, zakres rysunku.
  pair(0, 'SECTION'); pair(2, 'HEADER');
  pair(9, '$ACADVER'); pair(1, 'AC1009');
  pair(9, '$INSUNITS'); pair(70, 4);
  pair(9, '$EXTMIN'); pair(10, 0); pair(20, 0); pair(30, 0);
  pair(9, '$EXTMAX'); pair(10, fixed(drawing.width * mm)); pair(20, fixed(drawing.height * mm)); pair(30, 0);
  pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'TABLES');
  pair(0, 'TABLE'); pair(2, 'LTYPE'); pair(70, LINETYPES.length);
  for (const [name, description, pattern] of LINETYPES) {
    pair(0, 'LTYPE'); pair(2, name); pair(70, 0); pair(3, description); pair(72, 65); pair(73, pattern.length);
    pair(40, fixed(pattern.reduce((sum, value) => sum + Math.abs(value), 0)));
    for (const value of pattern) pair(49, fixed(value));
  }
  pair(0, 'ENDTAB');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, names.size + 1 + (frameLayer ? 1 : 0) + (layoutLayer ? 1 : 0));
  pair(0, 'LAYER'); pair(2, '0'); pair(70, 0); pair(62, 7); pair(6, 'CONTINUOUS');
  for (const extra of [frameLayer, layoutLayer].filter(Boolean)) {
    pair(0, 'LAYER'); pair(2, extra); pair(70, 0); pair(62, 7); pair(6, 'CONTINUOUS');
  }
  for (const layer of elementLayers(layers)) {
    pair(0, 'LAYER'); pair(2, names.get(layer.id)); pair(70, 0); pair(62, layer.hidden ? -7 : 7); pair(6, 'CONTINUOUS');
  }
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  for (const codes of entities) for (const [code, value] of codes) pair(code, value);
  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return { text: `${out.join('\r\n')}\r\n`, written, skipped };
}
