// Rysowanie na płótnie rzeczy dodanych w 1.15: kształty geometryczne (core/shapes.js; od 1.17
// z wypełnieniem, od 1.19 z zakończeniami odcinka, od 1.27 z rodzajem linii, prosta, łuk i punkt)
// i szablon pod kreskami – boisko piłkarskie rysowane liniami albo obraz z pliku (core/templates.js).

import { FILL_ALPHA, dashPattern, hatchWidth, isPointShape, pointMarkGeometry, shapeAxes, shapeHatch, shapeInnerLines, shapePath } from '../core/shapes.js';
import { PITCH, TEMPLATE_ALPHA } from '../core/templates.js';
import { frameLayout } from '../core/title-block.js';
import { textFont } from './canvas-text.js';

/** Kolory ramki rysunkowej (od 1.41): linie i napisy – tusz, nazwy pól – szare, brzeg arkusza – jasny. */
const FRAME_INK = '#1d1d1f';
const FRAME_LABEL = '#6e6e73';
const FRAME_EDGE = '#a1a1a6';

/**
 * Ramka rysunkowa z tabliczką (od 1.41): brzeg arkusza (cienka linia), ramka (gruba), tabliczka i jej napisy
 * (za długi napis – mniejszy, najwyżej do 60%, potem ucięty).
 */
export function paintFrame(ctx, drawing) {
  if (!drawing.frame) return;
  const layout = frameLayout(drawing.frame, drawing.width, drawing.height, drawing.scale);
  const { sheet, border, block, lines, cells, widths } = layout;
  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  ctx.strokeStyle = FRAME_EDGE;
  ctx.lineWidth = widths.edge;
  ctx.strokeRect(sheet.x, sheet.y, sheet.width, sheet.height);
  ctx.strokeStyle = FRAME_INK;
  ctx.lineWidth = widths.border;
  ctx.strokeRect(border.x, border.y, border.w, border.h);
  ctx.strokeRect(block.x, block.y, block.w, block.h);
  ctx.lineWidth = widths.thin;
  ctx.beginPath();
  for (const [a, b] of lines) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const cell of cells) {
    const pad = cell.labelSize * 0.7;
    ctx.fillStyle = FRAME_LABEL;
    ctx.font = textFont(cell.labelSize);
    ctx.fillText(cell.label, cell.x + pad, cell.y + pad + cell.labelSize * 0.8);
    if (!cell.value) continue;
    const room = cell.w - pad * 2;
    let size = cell.valueSize;
    const weight = cell.bold ? '600' : '';
    ctx.font = textFont(size, weight);
    const wide = ctx.measureText(cell.value).width;
    if (wide > room) {
      size = Math.max(cell.valueSize * 0.6, size * (room / wide));
      ctx.font = textFont(size, weight);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.w, cell.h);
    ctx.clip();
    ctx.fillStyle = FRAME_INK;
    ctx.fillText(cell.value, cell.x + pad, cell.y + cell.h - pad * 1.1);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Kształt: łamana albo krzywe Béziera (elipsa) o stałej grubości; wypełnienie pod linią; odcinek
 * i strzałka – z zakończeniami (grot – ramiona, trójkąt, kwadrat i romb – wypełnione, koło – wypełnione).
 */
export function paintShape(ctx, shape) {
  // Punkt (od 1.27): znacznik – kreski, kółko albo kropka, zawsze linią ciągłą.
  if (isPointShape(shape)) {
    paintPointMark(ctx, shape);
    return;
  }
  const path = shapePath(shape);
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Kreskowanie (od 1.40) – cieńsze linie pod obrysem.
  if (shape.fill === 'hatch' && path.closed) {
    ctx.lineWidth = hatchWidth(shape);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (const [a, b] of shapeHatch(shape)) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.lineWidth = shape.size;
    ctx.lineCap = 'round';
  }
  ctx.beginPath();
  ctx.moveTo(path.start.x, path.start.y);
  if (path.curves) {
    for (const [a, b, c] of path.curves) ctx.bezierCurveTo(a.x, a.y, b.x, b.y, c.x, c.y);
  } else {
    for (const point of path.lines) ctx.lineTo(point.x, point.y);
  }
  if (path.closed) ctx.closePath();
  if (shape.fill && shape.fill !== 'hatch' && path.closed) {
    // Krycie względem bieżącego (od 1.36 – przezroczystość warstwy).
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * (FILL_ALPHA[shape.fill] ?? 1);
    ctx.fillStyle = shape.color;
    ctx.fill();
    ctx.globalAlpha = alpha;
  }
  // Od 1.27 rodzaj linii (przerywana, osiowa…) – tylko linia kształtu; groty i zakończenia – ciągłe.
  ctx.setLineDash(dashPattern(shape));
  ctx.stroke();
  // Podproces (od 1.45) – pionowe linie przy bokach, tą samą linią.
  const inner = shapeInnerLines(shape);
  if (inner.length > 0) {
    ctx.beginPath();
    for (const [a, b] of inner) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  // Osie okręgu i elipsy (od 1.42) – cieńsza linia osiowa przez środek, poza obrysem.
  const axes = shapeAxes(shape);
  if (axes.length > 0) {
    const width = Math.max(0.6, shape.size / 2);
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.setLineDash(dashPattern({ shape: 'line', dash: 'center', size: width * 1.6 }));
    ctx.beginPath();
    for (const [a, b] of axes) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.lineWidth = shape.size;
    ctx.lineCap = 'round';
  }
  ctx.setLineDash([]);
  const arms = path.caps.filter((cap) => cap.arms);
  if (arms.length > 0) {
    ctx.beginPath();
    for (const cap of arms) {
      for (const point of cap.arms) {
        ctx.moveTo(cap.tip.x, cap.tip.y);
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.stroke();
  }
  // Zakończenia wypełnione: obrys tą samą linią – ostre rogi zaokrąglone jak reszta kształtu.
  ctx.fillStyle = shape.color;
  ctx.lineWidth = Math.min(shape.size, 3);
  for (const cap of path.caps) {
    if (cap.arms) continue;
    ctx.beginPath();
    if (cap.circle) {
      ctx.arc(cap.circle.x, cap.circle.y, cap.circle.r, 0, Math.PI * 2);
    } else {
      cap.polygon.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Znacznik punktu (od 1.27): punkt symetrii – kółko z krzyżykiem, kropka, krzyżyk ×, środek +. */
function paintPointMark(ctx, shape) {
  const mark = pointMarkGeometry(shape);
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = Math.min(shape.size, shape.w / 5);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of mark.lines) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  if (mark.ring) {
    ctx.moveTo(mark.ring.x + mark.ring.r, mark.ring.y);
    ctx.arc(mark.ring.x, mark.ring.y, mark.ring.r, 0, Math.PI * 2);
  }
  ctx.stroke();
  if (mark.dot) {
    ctx.beginPath();
    ctx.arc(mark.dot.x, mark.dot.y, mark.dot.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Boisko piłkarskie w prostokącie szablonu: linie, koła i łuki, punkty (stała grubość linii na stronie). */
function paintPitch(ctx, template) {
  const [sx, sy] = [template.w / PITCH.width, template.h / PITCH.height];
  const at = (x, y) => [template.x + x * sx, template.y + y * sy];
  ctx.strokeStyle = '#1d1d1f';
  ctx.fillStyle = '#1d1d1f';
  ctx.lineWidth = Math.max(1, Math.min(3, template.w / 600));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const item of PITCH.items) {
    if (item.kind === 'line') {
      ctx.moveTo(...at(item.x1, item.y1));
      ctx.lineTo(...at(item.x2, item.y2));
    } else if (item.kind === 'arc') {
      const [cx, cy] = at(item.x, item.y);
      ctx.moveTo(cx + Math.cos(item.from) * item.r * sx, cy + Math.sin(item.from) * item.r * sy);
      ctx.ellipse(cx, cy, item.r * sx, item.r * sy, 0, item.from, item.to);
    }
  }
  ctx.stroke();
  for (const item of PITCH.items.filter((entry) => entry.kind === 'dot')) {
    ctx.beginPath();
    ctx.arc(...at(item.x, item.y), Math.max(2, 0.3 * sx), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Szablon pod kreskami (kalka): z kryciem według jasności; obraz jest mnożony z tłem – biel znika,
 * kratka pod spodem zostaje widoczna. `image` – wczytany obraz szablonu z pliku (boisko go nie ma).
 */
export function paintTemplate(ctx, template, image) {
  if (!template) return;
  ctx.save();
  ctx.globalAlpha *= TEMPLATE_ALPHA[template.level];
  if (template.source === 'pitch') {
    paintPitch(ctx, template);
  } else if (image) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(image, template.x, template.y, template.w, template.h);
  }
  ctx.restore();
}
