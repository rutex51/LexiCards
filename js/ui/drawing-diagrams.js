// Diagramy jakości (od 1.44) i układ kartki na płótnie: linie, strzałki, ramki, okręgi i napisy z rozkładu
// (core/diagrams.js, core/page-layouts.js). Za długi napis – zwężony (najwyżej do 60%), potem ucięty.

import { DIAGRAM_FILLS, diagramLayout } from '../core/diagrams.js';
import { pageLayoutGeometry } from '../core/page-layouts.js';
import { textFont } from './canvas-text.js';

/** Kolory układu kartki: linie i nagłówki – szare (tło do wypełniania), pola z nazwami – jaśniejsze. */
const LAYOUT_INK = '#8e8e93';
const LAYOUT_TEXT = '#48484a';
const MUTED = '#6e6e73';

function arrowHead(ctx, from, to, length) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const half = length * 0.32;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - cos * length - sin * half, to.y - sin * length + cos * half);
  ctx.lineTo(to.x - cos * length + sin * half, to.y - sin * length - cos * half);
  ctx.closePath();
  ctx.fill();
}

/** Napis w miejscu (linia bazowa), wyrównany; szerszy niż `width` – zwężony do 60%, dalej ucięty z „…”. */
function fitText(ctx, item, color) {
  if (!item.text) return;
  const weight = item.bold ? '600' : '';
  let size = item.size;
  ctx.font = textFont(size, weight);
  let value = item.text;
  const room = item.width ?? Infinity;
  let wide = ctx.measureText(value).width;
  if (wide > room) {
    size = Math.max(item.size * 0.6, size * (room / wide));
    ctx.font = textFont(size, weight);
    wide = ctx.measureText(value).width;
    while (wide > room && value.length > 1) {
      value = value.slice(0, -2);
      wide = ctx.measureText(`${value}…`).width;
    }
    if (value !== item.text) value = `${value}…`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = item.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  if (item.rotate) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotate);
    ctx.fillText(value, 0, 0);
    ctx.restore();
  } else {
    ctx.fillText(value, item.x, item.y);
  }
}

/** Rozkład (diagram albo układ kartki) w kolorze `ink`; wypełnienia ramek – `fills` (nazwa → kolor) albo kolor wprost. */
function paintGeometry(ctx, geometry, { ink, text = ink, muted = MUTED, width, fills = {} }) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const box of geometry.boxes ?? []) {
    const fill = fills[box.fill] ?? (box.fill?.startsWith?.('#') ? box.fill : null);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = box.strong ? width * 1.3 : width;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = width;
  for (const circle of geometry.circles ?? []) {
    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  for (const [a, b] of geometry.lines ?? []) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  if (geometry.spine) {
    ctx.lineWidth = width * 2;
    ctx.beginPath();
    ctx.moveTo(geometry.spine[0].x, geometry.spine[0].y);
    ctx.lineTo(geometry.spine[1].x, geometry.spine[1].y);
    ctx.stroke();
    ctx.lineWidth = width;
  }
  for (const arrow of geometry.arrows ?? []) {
    ctx.beginPath();
    ctx.moveTo(arrow.from.x, arrow.from.y);
    ctx.lineTo(arrow.to.x, arrow.to.y);
    ctx.stroke();
    arrowHead(ctx, arrow.from, arrow.to, Math.max(10, width * 7));
  }
  for (const item of geometry.texts ?? []) fitText(ctx, item, item.muted ? muted : text);
  ctx.restore();
}

/** Diagram Ishikawy albo 5 × Dlaczego w kolorze elementu. */
export function paintDiagram(ctx, element) {
  paintGeometry(ctx, diagramLayout(element), { ink: element.color, width: Math.max(1.5, element.size / 11), fills: DIAGRAM_FILLS });
}

/** Układ kartki (od 1.44) – szare linie i nagłówki pod rysunkiem. */
export function paintPageLayout(ctx, drawing) {
  if (!drawing.layout) return;
  paintGeometry(ctx, pageLayoutGeometry(drawing.layout, drawing), { ink: LAYOUT_INK, text: LAYOUT_TEXT, width: 1.6 });
}
