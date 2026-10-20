// Rysowanie na płótnie rzeczy dodanych w 1.15: kształty geometryczne (core/shapes.js; od 1.17
// z wypełnieniem, od 1.19 z zakończeniami odcinka) i szablon pod kreskami – boisko piłkarskie
// rysowane liniami albo obraz z pliku (core/templates.js).

import { FILL_ALPHA, shapePath } from '../core/shapes.js';
import { PITCH, TEMPLATE_ALPHA } from '../core/templates.js';

/**
 * Kształt: łamana albo krzywe Béziera (elipsa) o stałej grubości; wypełnienie pod linią; odcinek
 * i strzałka – z zakończeniami (grot – ramiona, trójkąt, kwadrat i romb – wypełnione, koło – wypełnione).
 */
export function paintShape(ctx, shape) {
  const path = shapePath(shape);
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = shape.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(path.start.x, path.start.y);
  if (path.curves) {
    for (const [a, b, c] of path.curves) ctx.bezierCurveTo(a.x, a.y, b.x, b.y, c.x, c.y);
  } else {
    for (const point of path.lines) ctx.lineTo(point.x, point.y);
  }
  if (path.closed) ctx.closePath();
  if (shape.fill && path.closed) {
    ctx.globalAlpha = FILL_ALPHA[shape.fill] ?? 1;
    ctx.fillStyle = shape.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const cap of path.caps) {
    if (!cap.arms) continue;
    for (const point of cap.arms) {
      ctx.moveTo(cap.tip.x, cap.tip.y);
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.stroke();
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
  ctx.globalAlpha = TEMPLATE_ALPHA[template.level];
  if (template.source === 'pitch') {
    paintPitch(ctx, template);
  } else if (image) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(image, template.x, template.y, template.w, template.h);
  }
  ctx.restore();
}
