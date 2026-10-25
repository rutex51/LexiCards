// Bryły (od 1.47) na płótnie: ściany cieniowane, krawędzie niewidoczne (przerywane), osie, krawędzie widoczne i wymiary
// z rozkładu (core/solids.js); kostka widoków przy zaznaczonej bryle – przeciąganie obraca, ściana ustawia widok.
// Od 1.48 bryły ze szkicu (mogą być wklęsłe) – ściany z buforem głębokości w pikselach płótna.

import { solidDimText } from '../core/drawing.js';
import { SOLID_DIM, quatMatrix, solidDimParts, solidGeometry, solidTone } from '../core/solids.js';
import { textFont } from './canvas-text.js';

/** Łamane w jednej ścieżce każda (przerywana linia biegnie dalej przez kolejne odcinki okręgu; od 1.48 – od miejsca na krawędzi). */
function strokeLines(ctx, lines, width, dash) {
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  for (const line of lines) {
    ctx.lineDashOffset = line.offset ?? 0;
    ctx.beginPath();
    line.points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    if (line.closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

/**
 * Ściany bryły ze szkicu (od 1.48) z buforem głębokości: każda ściana – wielokąt z otworami wypełniany wierszami pikseli,
 * z(x, y) z jej płaszczyzny (faces[].plane na stronie, przeliczona na piksele przez przekształcenie płótna); obraz
 * kładziony w pikselach płótna (przezroczystość warstwy działa jak przy innych elementach).
 */
function paintDepth(ctx, faces, color) {
  const m = ctx.getTransform();
  const toPixel = (point) => ({ x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f });
  const pixels = faces.flatMap((face) => face.loops.flat().map(toPixel));
  if (pixels.length === 0) return;
  const x0 = Math.max(0, Math.floor(Math.min(...pixels.map((p) => p.x))) - 1);
  const y0 = Math.max(0, Math.floor(Math.min(...pixels.map((p) => p.y))) - 1);
  const w = Math.min(ctx.canvas.width, Math.ceil(Math.max(...pixels.map((p) => p.x))) + 2) - x0;
  const h = Math.min(ctx.canvas.height, Math.ceil(Math.max(...pixels.map((p) => p.y))) + 2) - y0;
  if (w <= 0 || h <= 0 || w * h > 16e6) return;
  const image = ctx.createImageData(w, h);
  const buffer = new Uint32Array(image.data.buffer);
  const depth = new Float32Array(w * h).fill(-Infinity);
  const inv = m.inverse();
  for (const face of faces) {
    const [r, g, b] = [1, 3, 5].map((start) => parseInt(solidTone(color, face.light).slice(start, start + 2), 16));
    const value = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    const { a: pa, b: pb, c: pc } = face.plane;
    // z w pikselach (px, py) – przez stronę.
    const [A, B, C] = [pa * inv.a + pb * inv.b, pa * inv.c + pb * inv.d, pa * inv.e + pb * inv.f + pc];
    const rings = face.loops.map((loop) => loop.map((point) => {
      const pixel = toPixel(point);
      return { x: pixel.x - x0, y: pixel.y - y0 };
    }));
    let [top, bottom] = [Infinity, -Infinity];
    for (const point of rings[0]) {
      top = Math.min(top, point.y);
      bottom = Math.max(bottom, point.y);
    }
    for (let row = Math.max(0, Math.ceil(top - 0.5)); row <= Math.min(h - 1, Math.floor(bottom - 0.5)); row += 1) {
      const center = row + 0.5;
      const crossings = [];
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [p, q] = [ring[i], ring[j]];
          if ((p.y <= center) !== (q.y <= center)) crossings.push(p.x + ((center - p.y) * (q.x - p.x)) / (q.y - p.y));
        }
      }
      crossings.sort((u, v) => u - v);
      for (let at = 0; at + 1 < crossings.length; at += 2) {
        for (let column = Math.max(0, Math.ceil(crossings[at] - 0.5)); column <= Math.min(w - 1, Math.floor(crossings[at + 1] - 0.5)); column += 1) {
          const z = A * (column + x0 + 0.5) + B * (center + y0) + C;
          const index = row * w + column;
          if (z > depth[index] + 1e-4) {
            depth[index] = z;
            buffer[index] = value;
          }
        }
      }
    }
  }
  const sheet = document.createElement('canvas');
  sheet.width = w;
  sheet.height = h;
  sheet.getContext('2d').putImageData(image, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(sheet, x0, y0);
  ctx.restore();
}

function arrowHead(ctx, tip, angle) {
  const { arrow } = SOLID_DIM;
  const half = arrow * 0.3;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - cos * arrow - sin * half, tip.y - sin * arrow + cos * half);
  ctx.lineTo(tip.x - cos * arrow + sin * half, tip.y - sin * arrow - cos * half);
  ctx.closePath();
  ctx.fill();
}

/** Bryła: options.scale i options.dimFormat – liczby wymiarów jak przy kształtach. */
export function paintSolid(ctx, element, { scale = null, dimFormat = 'unit' } = {}) {
  const geometry = solidGeometry(element);
  const { color, size } = element;
  const thin = Math.max(0.8, size * 0.5);
  const unit = Math.max(1, size / 2.5);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (element.shade && geometry.depth) {
    paintDepth(ctx, geometry.faces, color);
  } else if (element.shade) {
    if (geometry.sphere) {
      const { x, y, r } = geometry.sphere;
      const gradient = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r);
      gradient.addColorStop(0, solidTone(color, 1));
      gradient.addColorStop(1, solidTone(color, 0.05));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const face of geometry.faces) {
      // Obwódka w kolorze ściany – bez jasnych szczelin między sąsiednimi ścianami.
      ctx.fillStyle = ctx.strokeStyle = solidTone(color, face.light);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      face.points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'butt';
  if (element.edges === 'dashed') strokeLines(ctx, geometry.hidden, thin, [10 * unit, 5 * unit]);
  else if (element.edges === 'all') strokeLines(ctx, geometry.hidden, Math.max(0.8, size * 0.75), []);
  if (geometry.axes.length > 0) {
    ctx.lineWidth = Math.max(0.8, size * 0.4);
    ctx.setLineDash([22 * unit, 5 * unit, 3 * unit, 5 * unit]);
    ctx.beginPath();
    for (const [a, b] of geometry.axes) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.lineCap = 'round';
  strokeLines(ctx, geometry.visible.filter((line) => line.thin), thin, []);
  strokeLines(ctx, geometry.visible.filter((line) => !line.thin), size, []);
  for (const dim of geometry.dims) {
    const parts = solidDimParts(dim, solidDimText(dim, scale, dimFormat));
    ctx.lineWidth = SOLID_DIM.line;
    ctx.beginPath();
    for (const [a, b] of parts.lines) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    for (const arrow of parts.arrows) arrowHead(ctx, arrow.tip, arrow.angle);
    const { label } = parts;
    ctx.save();
    ctx.translate(label.x, label.y);
    ctx.rotate(label.angle);
    ctx.font = textFont(label.size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Jasna obwódka – liczba czytelna także na cieniowanej ścianie.
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.strokeText(label.text, 0, 0);
    ctx.fillText(label.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- kostka widoków (px ekranu)

/** Połowa boku kostki i jej odstęp od ramki zaznaczenia (px ekranu). */
export const CUBE_HALF = 24;
export const CUBE_GAP = 18;
/** Ściany kostki: napis, normalna, kierunek napisu (w prawo, w górę), widok. */
const CUBE_FACES = [
  ['PRZÓD', [0, 0, 1], [1, 0, 0], [0, 1, 0], 'front'], ['TYŁ', [0, 0, -1], [-1, 0, 0], [0, 1, 0], 'back'],
  ['PRAWA', [1, 0, 0], [0, 0, -1], [0, 1, 0], 'right'], ['LEWA', [-1, 0, 0], [0, 0, 1], [0, 1, 0], 'left'],
  ['GÓRA', [0, 1, 0], [1, 0, 0], [0, 0, -1], 'top'], ['DÓŁ', [0, -1, 0], [1, 0, 0], [0, 0, 1], 'bottom']
];
const turn = (m, [x, y, z]) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

/** Ściany kostki zwrócone do patrzącego (od najdalszej): { label, view, corners, center, n, u, v } w px ekranu. */
export function cubeFaces(q, center, half = CUBE_HALF) {
  const m = quatMatrix(q);
  return CUBE_FACES.map(([label, normal, right, up, view]) => {
    const [n, u, v] = [turn(m, normal), turn(m, right), turn(m, up)];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({ x: center.x + (n[0] + u[0] * a + v[0] * b) * half, y: center.y - (n[1] + u[1] * a + v[1] * b) * half }));
    return { label, view, n, u, v, corners, center: { x: center.x + n[0] * half, y: center.y - n[1] * half } };
  }).filter((face) => face.n[2] > 0.02).sort((a, b) => a.n[2] - b.n[2]);
}

/** Widok ściany kostki pod punktem (px ekranu) albo null. */
export function cubeFaceAt(q, center, point, half = CUBE_HALF) {
  for (const face of cubeFaces(q, center, half).reverse()) {
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [a, b] = [face.corners[i], face.corners[j]];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    if (inside) return face.view;
  }
  return null;
}

/** Kostka widoków w tym samym położeniu co bryła; ctx – w px ekranu (dpr – gęstość pikseli, do napisów na ścianach). */
export function paintViewCube(ctx, q, center, dpr, { accent = '#0058be', active = false } = {}) {
  const half = CUBE_HALF;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = active ? accent : 'rgba(60, 60, 67, 0.35)';
  ctx.lineWidth = active ? 2 : 1;
  ctx.beginPath();
  ctx.arc(center.x, center.y, half * 1.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (const face of cubeFaces(q, center, half)) {
    ctx.beginPath();
    face.corners.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
    const shade = Math.round(228 + 22 * face.n[2]);
    ctx.fillStyle = `rgb(${shade - 8}, ${shade - 3}, ${shade})`;
    ctx.fill();
    ctx.strokeStyle = '#8e8e93';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (face.n[2] > 0.3) {
      // Napis na ścianie – w jej płaszczyźnie (kostka 80 jednostek, napis 17).
      const k = half / 40;
      ctx.save();
      ctx.setTransform(dpr * face.u[0] * k, dpr * -face.u[1] * k, dpr * -face.v[0] * k, dpr * face.v[1] * k, dpr * face.center.x, dpr * face.center.y);
      ctx.fillStyle = '#3a3a3c';
      ctx.font = textFont(17, '700');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(face.label, 0, 1);
      ctx.restore();
    }
  }
  ctx.restore();
}
