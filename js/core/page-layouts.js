// Układ kartki (od 1.44) – bez przeglądarki: tło kartki do wypełniania karteczkami, tekstem i rysunkiem, jak ramka
// rysunkowa (należy do tła, nie da się go zaznaczyć ani zetrzeć). Rodzaje: raport A3 (tytuł i siedem pól), koło PDCA,
// macierz 2×2 (wpływ / wysiłek), tablica Kanban i diagram pokrewieństwa (kolumny z nagłówkami).
//
// W rysunku: layout { kind, title?, labels? } – labels: Kanban i pokrewieństwo – nazwy kolumn (2–6), macierz – nazwy
// osi i ćwiartek (6). Przy ramce rysunkowej układ zajmuje wnętrze ramki nad tabliczką.

import { frameLayout } from './title-block.js';

export const LAYOUT_KINDS = Object.freeze(['a3', 'pdca', 'matrix', 'kanban', 'affinity']);
export const LAYOUT_LABELS = Object.freeze({ a3: 'Raport A3', pdca: 'PDCA', matrix: 'Macierz 2×2', kanban: 'Kanban', affinity: 'Diagram pokrewieństwa' });
/** Pola raportu A3: lewa kolumna – problem, prawa – rozwiązanie. */
export const A3_SECTIONS = Object.freeze(['1. Tło', '2. Stan obecny', '3. Cel', '4. Analiza przyczyn', '5. Działania', '6. Plan wdrożenia', '7. Kontrola i wyniki']);
export const PDCA_LABELS = Object.freeze(['P – Planuj', 'D – Wykonaj', 'C – Sprawdź', 'A – Działaj']);
/** Macierz: oś pionowa, oś pozioma, ćwiartki (lewa górna, prawa górna, lewa dolna, prawa dolna). */
export const MATRIX_DEFAULT = Object.freeze(['Wpływ', 'Wysiłek', 'Szybkie korzyści', 'Duże projekty', 'Drobne poprawki', 'Strata czasu']);
export const COLUMN_DEFAULTS = Object.freeze({ kanban: Object.freeze(['Do zrobienia', 'W toku', 'Zrobione']), affinity: Object.freeze(['Grupa 1', 'Grupa 2', 'Grupa 3', 'Grupa 4']) });
export const LAYOUT_LIMITS = Object.freeze({ columns: 6, label: 40, title: 80 });
/** Nagłówki grup diagramu pokrewieństwa – kolory karteczek (żółta, różowa, zielona, niebieska, pomarańczowa). */
export const AFFINITY_FILLS = Object.freeze(['#ffe680', '#ffc2d4', '#c4f0b0', '#b9e0ff', '#ffd2a6', '#e5d4ff']);

const clip = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Sprawdzony układ albo null (brak, zły rodzaj). */
export function cleanLayout(raw) {
  if (!raw || typeof raw !== 'object' || !LAYOUT_KINDS.includes(raw.kind)) return null;
  const layout = { kind: raw.kind };
  if (raw.kind === 'a3') {
    const title = clip(raw.title, LAYOUT_LIMITS.title);
    if (title) layout.title = title;
  }
  if (raw.kind === 'matrix') {
    layout.labels = MATRIX_DEFAULT.map((fallback, index) => clip(raw.labels?.[index], LAYOUT_LIMITS.label) || fallback);
  }
  if (raw.kind === 'kanban' || raw.kind === 'affinity') {
    const labels = (Array.isArray(raw.labels) ? raw.labels : []).map((label) => clip(label, LAYOUT_LIMITS.label)).filter(Boolean).slice(0, LAYOUT_LIMITS.columns);
    layout.labels = labels.length >= 2 ? labels : [...COLUMN_DEFAULTS[raw.kind]];
  }
  return layout;
}

/** Miejsce układu na kartce: wnętrze ramki nad tabliczką albo kartka bez marginesów (z lewej – miejsce na spiralę). */
export function layoutArea(drawing) {
  if (drawing.frame) {
    const { border, block } = frameLayout(drawing.frame, drawing.width, drawing.height, drawing.scale);
    const pad = Math.min(border.w, border.h) * 0.02;
    return { x: border.x + pad, y: border.y + pad, w: border.w - pad * 2, h: block.y - border.y - pad * 2 };
  }
  const [left, side] = [70, 30];
  return { x: left, y: side, w: drawing.width - left - side, h: drawing.height - side * 2 };
}

/**
 * Rysunek układu w punktach strony: { lines: [[a, b]], boxes: [{ x, y, w, h, fill?, strong? }], circles: [{ x, y, r }],
 * arrows: [{ from, to }], texts: [{ x, y – linia bazowa, text, size, align, bold, width, muted? }] }.
 */
export function pageLayoutGeometry(layout, drawing) {
  const area = layoutArea(drawing);
  const size = Math.max(16, Math.min(30, Math.min(area.w, area.h) * 0.026));
  const geometry = { lines: [], boxes: [], circles: [], arrows: [], texts: [] };
  const text = (x, y, value, extra = {}) => geometry.texts.push({ x, y, text: value, size, align: 'left', bold: false, width: area.w, ...extra });
  const { x, y, w, h } = area;
  if (layout.kind === 'a3') {
    // Nagłówek z tytułem, dwie kolumny: problem (4 pola) i rozwiązanie (3 pola).
    const head = size * 2.2;
    geometry.boxes.push({ x, y, w, h: head, fill: '#f2f2f7', strong: true });
    text(x + size * 0.6, y + head * 0.66, `Raport A3${layout.title ? `: ${layout.title}` : ''}`, { bold: true, size: size * 1.1, width: w - size * 1.2 });
    const top = y + head + size * 0.4;
    const half = (w - size * 0.4) / 2;
    const column = (left, sections) => {
      const each = (y + h - top - size * 0.4 * (sections.length - 1)) / sections.length;
      sections.forEach((label, index) => {
        const boxY = top + index * (each + size * 0.4);
        geometry.boxes.push({ x: left, y: boxY, w: half, h: each });
        text(left + size * 0.5, boxY + size * 1.25, label, { bold: true, muted: true, width: half - size });
      });
    };
    column(x, A3_SECTIONS.slice(0, 4));
    column(x + half + size * 0.4, A3_SECTIONS.slice(4));
  } else if (layout.kind === 'pdca') {
    // Koło w ćwiartkach – zgodnie z ruchem wskazówek zegara od prawej górnej: P, D, C, A; strzałki na obwodzie.
    const r = Math.min(w, h) * 0.42;
    const [cx, cy] = [x + w / 2, y + h / 2];
    geometry.circles.push({ x: cx, y: cy, r });
    geometry.lines.push([{ x: cx - r, y: cy }, { x: cx + r, y: cy }], [{ x: cx, y: cy - r }, { x: cx, y: cy + r }]);
    const spots = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
    PDCA_LABELS.forEach((label, index) => {
      const [sx, sy] = spots[index];
      text(cx + sx * r * 0.42, cy + sy * r * 0.42 + size * 0.4, label, { align: 'center', bold: true, size: size * 1.3, width: r * 0.8 });
    });
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      // Grot na obwodzie tuż przed granicą ćwiartki (kierunek – zgodnie z ruchem wskazówek zegara na ekranie).
      const from = angle - 0.14;
      geometry.arrows.push({ from: { x: cx + Math.cos(from) * r, y: cy + Math.sin(from) * r }, to: { x: cx + Math.cos(angle + 0.02) * r, y: cy + Math.sin(angle + 0.02) * r } });
    }
  } else if (layout.kind === 'matrix') {
    // Osie: pionowa (wpływ – w górę rośnie), pozioma (wysiłek – w prawo rośnie); cztery ćwiartki z nazwami.
    const labels = layout.labels ?? MATRIX_DEFAULT;
    const left = x + size * 2.2;
    const bottom = y + h - size * 2.2;
    const [qw, qh] = [(x + w - left) / 2, (bottom - y) / 2];
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const box = { x: left + col * qw, y: y + row * qh, w: qw, h: qh, fill: row === 0 && col === 0 ? '#eef8ea' : row === 1 && col === 1 ? '#fdeeee' : null };
        geometry.boxes.push(box);
        text(box.x + size * 0.6, box.y + size * 1.4, labels[2 + row * 2 + col], { bold: true, muted: true, width: qw - size * 1.2 });
      }
    }
    geometry.arrows.push({ from: { x: left, y: bottom }, to: { x: left, y: y - size * 0.2 } }, { from: { x: left, y: bottom }, to: { x: x + w, y: bottom } });
    // Nazwa osi pionowej – obrócona (czytana od dołu).
    text(left - size * 0.6, y + qh, `${labels[0]} →`, { align: 'center', bold: true, rotate: -Math.PI / 2, width: qh });
    text(left + qw, bottom + size * 1.5, `${labels[1]} →`, { align: 'center', bold: true, width: qw });
  } else {
    // Kanban i pokrewieństwo: kolumny z nagłówkami (pokrewieństwo – nagłówki w kolorach karteczek).
    const labels = layout.labels ?? COLUMN_DEFAULTS[layout.kind];
    const gap = size * 0.4;
    const each = (w - gap * (labels.length - 1)) / labels.length;
    const head = size * 2;
    labels.forEach((label, index) => {
      const left = x + index * (each + gap);
      geometry.boxes.push({ x: left, y, w: each, h });
      geometry.boxes.push({ x: left, y, w: each, h: head, fill: layout.kind === 'affinity' ? AFFINITY_FILLS[index % AFFINITY_FILLS.length] : '#f2f2f7', strong: true });
      text(left + each / 2, y + head * 0.66, label, { align: 'center', bold: true, width: each - size });
    });
  }
  return geometry;
}
