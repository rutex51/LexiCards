// Tabele i karteczki na rysunku (od 1.21): układ i pomiar (tabela ma wysokość z treści, karteczka
// rośnie razem z tekstem) oraz rysowanie na płótnie – na stronie edytora i na obrazie w notatce.

import { STICKY_ICON, STICKY_MIN, elementBox, leaderStart, stickyColor } from '../core/drawing.js';
import { TEXT_LINE, measureText, textFont, textLines } from './canvas-text.js';

/** Kolor tła nagłówka tabeli i tekstu karteczki. */
const TABLE_HEAD_FILL = '#eef0f4';
const STICKY_INK = '#1d1d1f';

// ---------------------------------------------------------------- tabela

const tablePad = (table) => table.size * 0.35;
const isHead = (table, row, column) => (table.header && row === 0) || (table.headerColumn && column === 0);

/** Naturalne szerokości kolumn: najdłuższy wiersz tekstu komórki (bez łamania) i odstępy. */
function naturalWidths(table) {
  const pad = tablePad(table);
  const columns = table.rows[0].length;
  return Array.from({ length: columns }, (_, column) => Math.max(table.size * 2, ...table.rows.map((row, index) => {
    const font = textFont(table.size, isHead(table, index, column) ? '600' : '');
    return Math.max(0, ...row[column].split('\n').map((line) => measureText(line, font))) + pad * 2;
  })));
}

/** Szerokość tabeli bez łamania tekstu (nowa tabela – najwyżej `limit`). */
export function naturalTableWidth(table, limit = Infinity) {
  const total = naturalWidths(table).reduce((sum, width) => sum + width, 0);
  return Math.ceil(Math.min(limit, Math.max(table.rows[0].length * table.size * 3, total)));
}

/**
 * Układ tabeli: szerokości kolumn (naturalne, rozciągnięte albo ściśnięte do szerokości tabeli),
 * wiersze tekstu każdej komórki (łamane do szerokości kolumny) i wysokości wierszy.
 */
export function tableLayout(table) {
  const pad = tablePad(table);
  const natural = naturalWidths(table);
  const total = natural.reduce((sum, width) => sum + width, 0);
  const widths = natural.map((width) => (width / total) * table.width);
  const lines = table.rows.map((row, index) => row.map((cell, column) => textLines(cell, table.size, Math.max(table.size, widths[column] - pad * 2),
    isHead(table, index, column) ? '600' : '')));
  const heights = lines.map((cells) => Math.max(1, ...cells.map((cell) => cell.length)) * table.size * TEXT_LINE + pad * 2);
  return { pad, widths, heights, lines };
}

/** Wysokość tabeli zmierzona na tym urządzeniu. */
export function measureTable(table) {
  return { height: Math.ceil(tableLayout(table).heights.reduce((sum, height) => sum + height, 0)) };
}

/** Tabela: białe tło, nagłówek z tłem, tekst i linie w kolorze tabeli, kolumny wyrównane jak ustawiono. */
export function paintTable(ctx, table) {
  const { pad, widths, heights, lines } = tableLayout(table);
  const height = heights.reduce((sum, value) => sum + value, 0);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(table.x, table.y, table.width, height);
  let top = table.y;
  table.rows.forEach((row, index) => {
    let left = table.x;
    row.forEach((_, column) => {
      const head = isHead(table, index, column);
      if (head) {
        ctx.fillStyle = TABLE_HEAD_FILL;
        ctx.fillRect(left, top, widths[column], heights[index]);
      }
      ctx.fillStyle = table.color;
      ctx.font = textFont(table.size, head ? '600' : '');
      ctx.textBaseline = 'alphabetic';
      const align = table.align[column] ?? 'left';
      ctx.textAlign = align;
      const x = align === 'center' ? left + widths[column] / 2 : align === 'right' ? left + widths[column] - pad : left + pad;
      lines[index][column].forEach((line, lineIndex) => {
        ctx.fillText(line, x, top + pad + table.size * (0.95 + lineIndex * TEXT_LINE));
      });
      left += widths[column];
    });
    top += heights[index];
  });
  ctx.strokeStyle = table.color;
  ctx.lineWidth = Math.max(1.2, table.size / 16);
  ctx.beginPath();
  ctx.rect(table.x, table.y, table.width, height);
  let y = table.y;
  for (const rowHeight of heights.slice(0, -1)) {
    y += rowHeight;
    ctx.moveTo(table.x, y);
    ctx.lineTo(table.x + table.width, y);
  }
  let x = table.x;
  for (const columnWidth of widths.slice(0, -1)) {
    x += columnWidth;
    ctx.moveTo(x, table.y);
    ctx.lineTo(x, table.y + height);
  }
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- karteczka

const stickyPad = (sticky) => Math.round(sticky.size * 0.65);

/** Wysokość karteczki: ustawiona, a gdy tekst się nie mieści – większa. */
export function measureSticky(sticky) {
  const pad = stickyPad(sticky);
  const lines = textLines(sticky.text, sticky.size, Math.max(sticky.size, sticky.width - pad * 2));
  const needed = Math.ceil(lines.length * sticky.size * TEXT_LINE + pad * 2);
  return { height: Math.max(sticky.height, STICKY_MIN.height, needed) };
}

/** Data dodania karteczki „20.10.2026” (zapis rrrr-mm-dd). */
export const stickyDate = (sticky) => sticky.created.split('-').reverse().join('.');

/** Strzałka od brzegu karteczki do punktu strony, w ciemniejszym odcieniu karteczki. */
function paintLeader(ctx, sticky) {
  const { ink } = stickyColor(sticky.color);
  const start = leaderStart(sticky);
  const { x, y } = sticky.leader;
  const angle = Math.atan2(y - start.y, x - start.x);
  const head = 28;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(x - Math.cos(angle) * head * 0.8, y - Math.sin(angle) * head * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - head * Math.cos(angle - 0.42), y - head * Math.sin(angle - 0.42));
  ctx.lineTo(x - head * Math.cos(angle + 0.42), y - head * Math.sin(angle + 0.42));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Kartka z cieniem i zagiętym rogiem w prostokącie (x, y, w, h). */
function paintCard(ctx, x, y, width, height, color, fold) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = color.fill;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + height - fold);
  ctx.lineTo(x + width - fold, y + height);
  ctx.lineTo(x, y + height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Zagięty róg.
  ctx.save();
  ctx.fillStyle = color.ink;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(x + width, y + height - fold);
  ctx.lineTo(x + width - fold, y + height - fold);
  ctx.lineTo(x + width - fold, y + height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Karteczka: rozwinięta – kolorowa kartka z tekstem, zwinięta – ikona z numerem; strzałka do miejsca.
 * options: number – numer karteczki na rysunku, editor – na stronie edytora (ukryta na obrazie
 * karteczka ma przerywaną obwódkę).
 */
export function paintSticky(ctx, sticky, { number = null, editor = false } = {}) {
  const color = stickyColor(sticky.color);
  if (sticky.leader) paintLeader(ctx, sticky);
  const box = elementBox(sticky);
  if (sticky.collapsed) {
    paintCard(ctx, box.x, box.y, box.width, box.height, color, STICKY_ICON * 0.24);
    ctx.save();
    ctx.strokeStyle = color.ink;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [index, share] of [0.62, 0.62, 0.4].entries()) {
      const y = box.y + STICKY_ICON * (0.32 + index * 0.17);
      ctx.moveTo(box.x + STICKY_ICON * 0.2, y);
      ctx.lineTo(box.x + STICKY_ICON * (0.2 + share), y);
    }
    ctx.stroke();
    if (number !== null) {
      ctx.fillStyle = '#d70015';
      ctx.beginPath();
      ctx.arc(box.x + STICKY_ICON, box.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = textFont(17, '700');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), box.x + STICKY_ICON, box.y + 1);
    }
    ctx.restore();
  } else {
    paintCard(ctx, box.x, box.y, box.width, box.height, color, Math.min(36, box.width * 0.14));
    paintStickyText(ctx, sticky, box.x, box.y);
  }
  if (editor && sticky.hidden) {
    // Bez tej karteczki na obrazie rysunku – przerywana obwódka (tylko w edytorze).
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color.ink;
    ctx.strokeRect(box.x - 5, box.y - 5, box.width + 10, box.height + 10);
    ctx.restore();
  }
}

function paintStickyText(ctx, sticky, x, y) {
  const pad = stickyPad(sticky);
  ctx.save();
  ctx.fillStyle = STICKY_INK;
  ctx.font = textFont(sticky.size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  textLines(sticky.text, sticky.size, Math.max(sticky.size, sticky.width - pad * 2)).forEach((line, index) => {
    ctx.fillText(line, x + pad, y + pad + sticky.size * (0.95 + index * TEXT_LINE));
  });
  ctx.restore();
}

/** Miejsce treści zwiniętej karteczki (na prawo od ikony) – w jednostkach strony. */
export function stickyPopoverBox(sticky) {
  const header = Math.round(sticky.size * 1.5);
  const height = measureSticky({ ...sticky, height: STICKY_MIN.height }).height + header;
  return { x: sticky.x + STICKY_ICON + 16, y: sticky.y, width: sticky.width, height, header };
}

/**
 * Treść zwiniętej karteczki (zaznaczonej w edytorze): kartka obok ikony z nagłówkiem „Karteczka N ·
 * data dodania” – rysowana na warstwie bieżącej, nie trafia do rysunku.
 */
export function paintStickyPopover(ctx, sticky, number) {
  const color = stickyColor(sticky.color);
  const { x, y, height, header } = stickyPopoverBox(sticky);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, sticky.width, height);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = color.fill;
  ctx.fillRect(x, y, sticky.width, header);
  ctx.fillStyle = STICKY_INK;
  ctx.font = textFont(Math.round(sticky.size * 0.72), '600');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`Karteczka ${number} · ${stickyDate(sticky)}`, x + stickyPad(sticky), y + header / 2);
  ctx.restore();
  paintStickyText(ctx, sticky, x, y + header);
}
