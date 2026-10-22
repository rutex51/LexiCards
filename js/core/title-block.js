// Ramka rysunkowa z tabliczką (od 1.41) – bez przeglądarki. Kartka bez zdjęcia jest arkuszem A4 albo A3
// w poziomie wpasowanym w stronę (wyśrodkowanym): ramka 20 mm od lewego brzegu arkusza i 10 mm od
// pozostałych (ISO 5457), tabliczka 180 × 34 mm w prawym dolnym rogu ramki (układ uproszczony według
// ISO 7200): rysował, data, skala, format; tytuł; materiał, numer rysunku.
//
// Ramka w rysunku: frame { format: 'A4' | 'A3', title?, number?, material?, scale?, date?, author? } –
// napisy tabliczki; scale pusta – skala liczona z kratki rysunku i formatu arkusza (frameScaleText).

import { PAPER_STEP, SCALE_UNITS, cleanScale, formatNumber } from './drawing.js';

/** Arkusze w poziomie: szerokość i wysokość w mm. */
export const FRAME_FORMATS = Object.freeze({ A4: Object.freeze({ width: 297, height: 210 }), A3: Object.freeze({ width: 420, height: 297 }) });
/** Pola tabliczki, ich nazwy i najdłuższe napisy. */
export const FRAME_FIELDS = Object.freeze(['title', 'number', 'material', 'scale', 'date', 'author']);
export const FRAME_FIELD_LABELS = Object.freeze({ title: 'Tytuł', number: 'Nr rysunku', material: 'Materiał', scale: 'Skala', date: 'Data', author: 'Rysował' });
export const FRAME_FIELD_MAX = Object.freeze({ title: 80, number: 40, material: 60, scale: 20, date: 20, author: 40 });
/** Marginesy ramki (mm od brzegu arkusza), tabliczka (mm) i grubości linii (mm). */
const MARGIN = { left: 20, top: 10, right: 10, bottom: 10 };
const BLOCK = { width: 180, rows: [10, 14, 10] };
export const FRAME_LINES = Object.freeze({ edge: 0.25, border: 0.7, thin: 0.35 });

/** Sprawdzona ramka albo null (brak, zły format). */
export function cleanFrame(raw) {
  if (!raw || typeof raw !== 'object' || !FRAME_FORMATS[raw.format]) return null;
  const frame = { format: raw.format };
  for (const key of FRAME_FIELDS) {
    const text = typeof raw[key] === 'string' ? raw[key].replace(/\s+/g, ' ').trim().slice(0, FRAME_FIELD_MAX[key]) : '';
    if (text) frame[key] = text;
  }
  return frame;
}

/** Arkusz na stronie: { mm – jednostek strony na milimetr arkusza, x, y – lewy górny róg, width, height }. */
export function frameSheet(format, pageWidth, pageHeight) {
  const size = FRAME_FORMATS[format] ?? FRAME_FORMATS.A4;
  const mm = Math.min(pageWidth / size.width, pageHeight / size.height);
  return { mm, x: (pageWidth - size.width * mm) / 2, y: (pageHeight - size.height * mm) / 2, width: size.width * mm, height: size.height * mm };
}

/**
 * Skala rysunku na arkuszu: kratka strony ma na arkuszu PAPER_STEP / mm milimetrów, a w rzeczywistości – tyle,
 * ile mówi skala rysunku („1:2”, „2:1”, „1:1,19”; do trzech cyfr znaczących).
 */
export function frameScaleText(format, pageWidth, pageHeight, scale) {
  const { mm } = frameSheet(format, pageWidth, pageHeight);
  const { value, unit } = cleanScale(scale);
  const real = value * (SCALE_UNITS.find((item) => item.id === unit)?.meters ?? 0.01) * 1000;
  const ratio = real / (PAPER_STEP / mm);
  const nice = (number) => formatNumber(Number(number.toPrecision(3)));
  return ratio >= 1 ? `1:${nice(ratio)}` : `${nice(1 / ratio)}:1`;
}

/**
 * Rysunek ramki w jednostkach strony: sheet – arkusz (cienka linia brzegu), border – ramka (gruba), block – tabliczka
 * (obrys gruby), lines – linie wewnątrz tabliczki [[a, b], …] (cienkie), cells – pola { key, label, value, x, y, w, h,
 * labelSize, valueSize, bold } (value – napis tabliczki; skala bez wpisu – z kratki, format – „A4”), widths – grubości.
 */
export function frameLayout(frame, pageWidth, pageHeight, scale) {
  const sheet = frameSheet(frame.format, pageWidth, pageHeight);
  const { mm } = sheet;
  const border = {
    x: sheet.x + MARGIN.left * mm, y: sheet.y + MARGIN.top * mm,
    w: sheet.width - (MARGIN.left + MARGIN.right) * mm, h: sheet.height - (MARGIN.top + MARGIN.bottom) * mm
  };
  const height = BLOCK.rows.reduce((sum, row) => sum + row, 0);
  const block = { x: border.x + border.w - BLOCK.width * mm, y: border.y + border.h - height * mm, w: BLOCK.width * mm, h: height * mm };
  const value = (key) => (key === 'scale' ? frame.scale || frameScaleText(frame.format, pageWidth, pageHeight, scale) : key === 'format' ? frame.format : frame[key] ?? '');
  // Wiersze: [klucz, szerokość mm], …
  const rows = [
    [['author', 55], ['date', 40], ['scale', 35], ['format', 50]],
    [['title', 180]],
    [['material', 90], ['number', 90]]
  ];
  const cells = [];
  const lines = [];
  let top = block.y;
  rows.forEach((row, index) => {
    const rowHeight = BLOCK.rows[index] * mm;
    if (index > 0) lines.push([{ x: block.x, y: top }, { x: block.x + block.w, y: top }]);
    let left = block.x;
    row.forEach(([key, width], column) => {
      if (column > 0) lines.push([{ x: left, y: top }, { x: left, y: top + rowHeight }]);
      cells.push({
        key, label: key === 'format' ? 'Format' : FRAME_FIELD_LABELS[key], value: value(key),
        x: left, y: top, w: width * mm, h: rowHeight,
        labelSize: 2.2 * mm, valueSize: (key === 'title' ? 6 : 3.5) * mm, bold: key === 'title' || key === 'number'
      });
      left += width * mm;
    });
    top += rowHeight;
  });
  return {
    sheet, border, block, lines, cells,
    widths: { edge: FRAME_LINES.edge * mm, border: FRAME_LINES.border * mm, thin: FRAME_LINES.thin * mm }
  };
}
