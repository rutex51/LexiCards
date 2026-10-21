// Plik PDF notatki tworzony w aplikacji (od 1.28) – bez okna drukowania (w aplikacji na iPhonie,
// otwartej z ekranu początkowego, druk nie działa). Tekst w pliku jest prawdziwym tekstem: da się
// go zaznaczyć, skopiować i wyszukać. Strona A4.
//
// Jak powstaje plik:
//   1. Notatkę składa przeglądarka – ta sama treść co do druku (noteFlow: tekst z formatowaniem,
//      listy, tabele, obrazy z podpisami, wzory) w niewidocznym elemencie szerokości treści strony A4,
//      krojem Helvetica (na Windows Arial – te same szerokości znaków). 1 pt strony = SCALE px –
//      większa skala daje dokładniejszy pomiar.
//   2. Z układu odczytujemy położenie każdego wyrazu (Range.getClientRects), tła i ramki komórek
//      tabel, obrazy, znaczniki list i miejsca wzorów. Wzór dostaje w układzie pudełko wielkości
//      wzoru złożonego przez core/math-layout.js (MathML przeglądarki ma inne wymiary).
//   3. core/pdf-pages.js wybiera miejsca podziału na strony, core/pdf.js zapisuje plik: wyrazy
//      w tych samych miejscach krojem PDF o szerokościach zmierzonych w przeglądarce, wzory –
//      wektorowo (Times i Symbol; z rzadkimi znakami spoza tych krojów – jako obraz), obrazy – JPEG
//      w wybranej jakości.

import { layoutMath } from '../core/math-layout.js';
import { paginate } from '../core/pdf-pages.js';
import { A4, createPdf, encodable, encodeText, parseColor, pdfCanvas } from '../core/pdf.js';
import { field, segmented, textInput } from './components.js';
import { openFormSheet, toast } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { downloadFile, prefersShareSheet } from './files.js';
import { icon } from './icons.js';
import { noteFlow } from './note-book.js';

/** Piksele układu na punkt strony. */
const SCALE = 3;
/** Marginesy strony: 16 mm z boków, 18 mm u góry i u dołu (jak przy druku). */
const MARGIN_X = 45.35;
const MARGIN_Y = 51.02;
const CONTENT_WIDTH = A4.width - 2 * MARGIN_X;
const CONTENT_HEIGHT = A4.height - 2 * MARGIN_Y;
const SANS = 'Helvetica, Arial, "Liberation Sans", "Nimbus Sans", sans-serif';
const SERIF = '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif';
const FOOTER_COLOR = [110, 110, 115];

/** Jakość obrazów: rozdzielczość obrazów i wzorów zapisanych jako obraz oraz jakość JPEG. */
export const PDF_QUALITIES = Object.freeze([
  { id: 'standard', label: 'Standardowa', dpi: 150, mathDpi: 300, jpeg: 0.8, hint: 'Obrazy 150 dpi – mniejszy plik, dobry do czytania na ekranie i zwykłego druku.' },
  { id: 'high', label: 'Wysoka', dpi: 300, mathDpi: 600, jpeg: 0.92, hint: 'Obrazy 300 dpi – ostrzejsze przy powiększeniu i w druku, plik kilka razy większy.' }
]);
const qualityOf = (id) => PDF_QUALITIES.find((quality) => quality.id === id) ?? PDF_QUALITIES[0];

/** Nazwa pliku z nazwy lekcji: bez znaków niedozwolonych w nazwach plików, z „.pdf”. */
export function pdfFileName(name) {
  const base = String(name ?? '').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${base || 'Notatka'}.pdf`;
}

// ---------------------------------------------------------------- pomiar krojów

/** Szerokości znaków krojów PDF (na 1000 jednostek wielkości) i wysokości nad linią bazową. */
function fontMetrics() {
  const context = document.createElement('canvas').getContext('2d');
  const widths = new Map();
  const ascents = new Map();
  const cssFont = (variant) => {
    const serif = variant.startsWith('serif');
    return `${/italic/i.test(variant) ? 'italic ' : ''}${/bold/i.test(variant) ? 'bold ' : ''}1000px ${serif ? SERIF : SANS}`;
  };
  return {
    /** Szerokość znaku; krój Symbol mierzymy krojem tekstu (tak go składa przeglądarka). */
    width(variant, char) {
      const key = `${variant} ${char}`;
      if (!widths.has(key)) {
        context.font = cssFont(variant === 'symbol' ? 'regular' : variant);
        widths.set(key, context.measureText(char).width);
      }
      return widths.get(key);
    },
    /** Wysokość nad linią bazową pola tekstu (jak w układzie przeglądarki) dla stylu elementu. */
    ascent(style) {
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if (!ascents.has(font)) {
        context.font = font;
        const metrics = context.measureText('Hg');
        ascents.set(font, metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent * 1.25);
      }
      return ascents.get(font);
    },
    /** Szerokość napisu wzoru złożonego krojami PDF (Times, Symbol) – font jak w canvas. */
    mathWidth(text, font) {
      const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 10);
      const variant = `serif${/\bbold\b/.test(font) ? 'Bold' : ''}${/\bitalic\b/.test(font) ? 'Italic' : ''}`;
      let total = 0;
      for (const run of encodeText(text)) {
        for (const char of run.text) total += this.width(run.font === 'symbol' ? 'symbol' : variant, char);
      }
      return total * size / 1000;
    },
    /** Szerokość napisu wzoru krojem przeglądarki (wzór zapisany jako obraz). */
    canvasWidth(text, font) {
      context.font = font;
      return context.measureText(text).width;
    }
  };
}

// ---------------------------------------------------------------- układ notatki

/** Wzory: pudełko wielkości wzoru złożonego do PDF zamiast elementu <math>. */
function prepareMath(root, metrics) {
  const formulas = [];
  for (const math of [...root.querySelectorAll('math')]) {
    const source = math.getAttribute('data-source') ?? math.textContent;
    const display = math.getAttribute('display') === 'block';
    // Styl odczytany przed zamianą elementu (odłączony element nie ma stylu).
    const style = getComputedStyle(math);
    const size = parseFloat(style.fontSize) / SCALE;
    const color = style.color;
    const texts = [];
    layoutMath(source, { size, measure: (text) => { texts.push(text); return 0; } });
    const vector = texts.every((text) => [...text].every(encodable));
    const layout = layoutMath(source, { size, measure: vector ? (text, font) => metrics.mathWidth(text, font) : (text, font) => metrics.canvasWidth(text, font) });
    const available = (math.parentElement?.clientWidth || CONTENT_WIDTH * SCALE) / SCALE;
    const scale = Math.min(1, available / layout.width);
    const holder = h('span', { class: `note-pdf__math${display ? ' note-pdf__math--display' : ''}` });
    holder.style.width = `${layout.width * scale * SCALE}px`;
    holder.style.height = `${(layout.ascent + layout.descent) * scale * SCALE}px`;
    if (!display) holder.style.verticalAlign = `${-layout.descent * scale * SCALE}px`;
    math.replaceWith(holder);
    formulas.push({ holder, layout, vector, scale, color });
  }
  return formulas;
}

/** Znaczniki list jako elementy (kropka, kółko, kwadrat, „1.”) – żeby trafiły do PDF. */
function prepareLists(root) {
  for (const item of root.querySelectorAll('.note-text li')) {
    const list = item.parentElement;
    if (list.tagName === 'OL') {
      const number = [...list.children].indexOf(item) + (list.start || 1);
      item.prepend(h('span', { class: 'note-pdf__marker' }, `${number}.`));
    } else {
      let depth = 0;
      for (let node = list; node && node !== root; node = node.parentElement) if (node.tagName === 'UL') depth += 1;
      const shape = ['disc', 'circle', 'square'][Math.min(depth, 3) - 1];
      item.prepend(h('span', { class: 'note-pdf__marker' }, h('span', { class: 'note-pdf__bullet', dataset: { shape } })));
    }
  }
}

/**
 * Tabela szersza niż strona: mniejszy tekst (do 7 pt), a gdy to nie wystarcza – łamanie długich
 * słów w komórkach i tekst do 5 pt.
 */
function fitTables(root) {
  const shrink = (table, floor) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const width = table.getBoundingClientRect().width;
      const room = table.parentElement.getBoundingClientRect().width;
      if (width <= room + 1) return true;
      const size = parseFloat(getComputedStyle(table).fontSize);
      if (size <= floor * SCALE + 0.01) return false;
      table.style.fontSize = `${Math.max(floor * SCALE, size * (room / width) * 0.98)}px`;
    }
    return table.getBoundingClientRect().width <= table.parentElement.getBoundingClientRect().width + 1;
  };
  for (const table of root.querySelectorAll('table')) {
    if (shrink(table, 7)) continue;
    table.classList.add('note-pdf__table--wrap');
    shrink(table, 5);
  }
}

/** Niewidoczny element z notatką złożoną na szerokość strony. */
function layoutRoot({ title, path, content }) {
  const root = h('div', { class: 'note-pdf', 'aria-hidden': 'true', dataset: { testid: 'note-pdf-layout' } },
    path ? h('p', { class: 'note-pdf__path' }, path) : null,
    h('h1', { class: 'note-pdf__title' }, title),
    noteFlow(content));
  root.style.setProperty('--pt', `${SCALE}px`);
  root.style.width = `${CONTENT_WIDTH * SCALE}px`;
  document.body.append(root);
  return root;
}

// ---------------------------------------------------------------- odczyt układu

/** Kolor tła z przezroczystością – zmieszany z białą kartką; całkiem przezroczysty – null. */
function opaque(value) {
  const alpha = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(value ?? '');
  const share = alpha ? Number(alpha[1]) : (/^(rgb|#)/.test(value ?? '') ? 1 : 0);
  if (!(share > 0.01)) return null;
  return parseColor(value).map((channel) => Math.round(255 - (255 - channel) * share));
}

/**
 * Elementy do narysowania i fragmenty do podziału na strony, w punktach od lewego górnego rogu
 * układu: items – { kind, top, bottom, … }, atoms – jak w paginate(), breaks – „Nowa strona”.
 */
function readLayout(root, metrics, formulas) {
  const origin = root.getBoundingClientRect();
  const box = (rect) => ({
    left: (rect.left - origin.left) / SCALE, top: (rect.top - origin.top) / SCALE,
    width: rect.width / SCALE, height: rect.height / SCALE
  });
  const items = [];
  const atoms = [];
  const links = [];

  // Tła i ramki (komórki tabel, brakujący obraz).
  for (const element of root.querySelectorAll('*')) {
    if (element.closest('.note-pdf__math') || element.matches('.note-pdf__bullet')) continue;
    const style = getComputedStyle(element);
    const rect = box(element.getBoundingClientRect());
    if (rect.width <= 0 || rect.height <= 0) continue;
    const background = opaque(style.backgroundColor);
    if (background) items.push({ kind: 'rect', layer: 0, ...rect, bottom: rect.top + rect.height, color: background });
    const collapsed = style.borderCollapse === 'collapse' && /^(TD|TH)$/.test(element.tagName);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const width = parseFloat(style[`border${side}Width`]) / SCALE;
      const kind = style[`border${side}Style`];
      if (!(width > 0) || kind === 'none' || kind === 'hidden') continue;
      const inset = collapsed ? 0 : width / 2;
      const left = rect.left + inset;
      const right = rect.left + rect.width - inset;
      const top = rect.top + inset;
      const bottom = rect.top + rect.height - inset;
      const ends = { Top: [left, top, right, top], Bottom: [left, bottom, right, bottom], Left: [left, top, left, bottom], Right: [right, top, right, bottom] }[side];
      const dash = kind === 'dashed' ? [width * 3, width * 2] : (kind === 'dotted' ? [width, width] : null);
      items.push({ kind: 'line', layer: 1, points: ends, width, color: parseColor(style[`border${side}Color`]), dash, top: Math.min(ends[1], ends[3]) - width, bottom: Math.max(ends[1], ends[3]) + width });
    }
  }

  // Wyrazy: położenie z układu, linia bazowa z wysokości kroju nad nią.
  const groups = new Map();
  const groupLines = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || !/\S/.test(node.data) || parent.closest('.note-pdf__math')) continue;
    const style = getComputedStyle(parent);
    const size = parseFloat(style.fontSize) / SCALE;
    const bold = parseInt(style.fontWeight, 10) >= 600;
    const italic = style.fontStyle !== 'normal';
    const variant = bold ? (italic ? 'boldItalic' : 'bold') : (italic ? 'italic' : 'regular');
    const color = parseColor(style.color);
    const ascent = metrics.ascent(style) / SCALE;
    const block = parent.closest('li, p, h1, h3, td, th, figcaption');
    if (block && !/^(TD|TH)$/.test(block.tagName) && !groups.has(block)) {
      groups.set(block, groupLines.length);
      groupLines.push([]);
    }
    const group = groups.get(block) ?? null;
    const keep = Boolean(block?.matches('h1, h3, .note-pdf__path, .note-page__table-caption'));
    const link = parent.closest('a[href]')?.getAttribute('href') ?? null;
    const underline = Boolean(parent.closest('u')) || link !== null;
    const strike = Boolean(parent.closest('s'));
    const pieces = [];
    const add = (text, rect, spaceAfter) => {
      const area = box(rect);
      const last = pieces.at(-1);
      if (last && Math.abs(last.top - area.top) < 0.5 && Math.abs(last.left + last.width - area.left) < 0.05 && !last.spaceAfter) {
        last.text += text;
        last.width = area.left + area.width - last.left;
        last.spaceAfter = spaceAfter;
      } else pieces.push({ text, ...area, spaceAfter });
    };
    for (const match of node.data.matchAll(/\S+/g)) {
      const end = match.index + match[0].length;
      const spaceAfter = end < node.data.length;
      range.setStart(node, match.index);
      range.setEnd(node, end);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      if (rects.length <= 1) {
        if (rects[0]) add(match[0], rects[0], spaceAfter);
        continue;
      }
      // Wyraz przełamany między wierszami – znak po znaku.
      let offset = match.index;
      const chars = [...match[0]];
      chars.forEach((char, index) => {
        range.setStart(node, offset);
        range.setEnd(node, offset + char.length);
        offset += char.length;
        const rect = [...range.getClientRects()].find((candidate) => candidate.width > 0 && candidate.height > 0);
        if (rect) add(char, rect, spaceAfter && index === chars.length - 1);
      });
    }
    const lines = new Map();
    for (const piece of pieces) {
      const baseline = piece.top + ascent;
      items.push({
        kind: 'text', layer: 2, text: piece.spaceAfter ? `${piece.text} ` : piece.text, left: piece.left, baseline,
        top: piece.top, bottom: piece.top + piece.height, size, variant, color
      });
      const key = Math.round(piece.top * 2);
      const line = lines.get(key);
      if (line) {
        line.left = Math.min(line.left, piece.left);
        line.right = Math.max(line.right, piece.left + piece.width);
      } else lines.set(key, { left: piece.left, right: piece.left + piece.width, top: piece.top, bottom: piece.top + piece.height, baseline });
    }
    for (const line of lines.values()) {
      atoms.push({ top: line.top, bottom: line.bottom, keep, group });
      if (group !== null) groupLines[group].push(line.top);
      const thickness = Math.max(0.5, size * 0.05);
      if (underline) items.push({ kind: 'line', layer: 3, points: [line.left, line.baseline + size * 0.11, line.right, line.baseline + size * 0.11], width: thickness, color, top: line.top, bottom: line.bottom });
      if (strike) items.push({ kind: 'line', layer: 3, points: [line.left, line.baseline - size * 0.3, line.right, line.baseline - size * 0.3], width: thickness, color, top: line.top, bottom: line.bottom });
      if (link && /^(https?:|mailto:)/i.test(link)) links.push({ left: line.left, right: line.right, top: line.top, bottom: line.bottom, uri: link });
    }
  }
  // Pierwszy i ostatni wiersz akapitu – do zasady „bez samotnych wierszy”.
  for (const atom of atoms) {
    if (atom.group === null) continue;
    const tops = groupLines[atom.group];
    atom.first = atom.top === Math.min(...tops);
    atom.last = atom.top === Math.max(...tops);
  }

  // Znaczniki list (kropka, kółko, kwadrat).
  for (const bullet of root.querySelectorAll('.note-pdf__bullet')) {
    const rect = box(bullet.getBoundingClientRect());
    items.push({ kind: 'bullet', layer: 2, shape: bullet.dataset.shape, ...rect, bottom: rect.top + rect.height, color: parseColor(getComputedStyle(bullet).color) });
    atoms.push({ top: rect.top, bottom: rect.top + rect.height });
  }

  // Wzory.
  for (const formula of formulas) {
    const rect = box(formula.holder.getBoundingClientRect());
    items.push({ kind: 'math', layer: 2, formula, ...rect, bottom: rect.top + rect.height });
    atoms.push({ top: rect.top, bottom: rect.top + rect.height });
  }

  // Obrazy z podpisami – w całości na jednej stronie.
  const images = [];
  for (const image of root.querySelectorAll('img')) {
    const rect = box(image.getBoundingClientRect());
    if (rect.width <= 0 || rect.height <= 0) continue;
    const item = { kind: 'image', layer: 1, element: image, ...rect, bottom: rect.top + rect.height };
    items.push(item);
    images.push(item);
  }
  for (const figure of root.querySelectorAll('figure.note-flow__figure')) {
    const rect = box(figure.getBoundingClientRect());
    atoms.push({ top: rect.top, bottom: rect.top + rect.height });
  }

  // Wiersze tabel – nagłówek tabeli powtarza się na następnej stronie.
  for (const table of root.querySelectorAll('table')) {
    const head = table.tHead ? box(table.tHead.getBoundingClientRect()) : null;
    const header = head && head.height > 0 ? { top: head.top, bottom: head.top + head.height } : null;
    for (const row of table.rows) {
      const rect = box(row.getBoundingClientRect());
      const inHead = row.parentElement === table.tHead;
      atoms.push({ top: rect.top, bottom: rect.top + rect.height, keep: inHead, header: inHead ? null : header });
    }
  }

  const breaks = [...root.querySelectorAll('.note-flow__break')].map((element) => box(element.getBoundingClientRect()).top);
  return { items: items.sort((a, b) => a.layer - b.layer), atoms, breaks, links, images };
}

// ---------------------------------------------------------------- obrazy

/** Płótno jako JPEG; potem płótno zwolnione (Safari na iPhonie ma mało pamięci na płótna). */
async function canvasJpeg(canvas, quality) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Nie udało się zapisać obrazu do PDF.'))), 'image/jpeg', quality);
  });
  const image = { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  canvas.width = 0;
  canvas.height = 0;
  return image;
}

/** Obraz w rozdzielczości jakości (bez powiększania ponad oryginał) jako JPEG na białym tle. */
async function rasterImage(image, item, quality) {
  const ratio = quality.dpi / 72;
  let width = Math.max(1, Math.round(item.width * ratio));
  let height = Math.max(1, Math.round(item.height * ratio));
  if (image.naturalWidth > 0 && width > image.naturalWidth) {
    height = Math.max(1, Math.round(height * image.naturalWidth / width));
    width = image.naturalWidth;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return canvasJpeg(canvas, quality.jpeg);
}

/** Wzór ze znakami spoza krojów PDF – jako obraz (krój wzorów przeglądarki). */
async function rasterMath(formula, quality) {
  const { layout, scale } = formula;
  const ratio = (quality.mathDpi / 72) * scale;
  const width = Math.max(1, Math.ceil(layout.width * ratio));
  const height = Math.max(1, Math.ceil((layout.ascent + layout.descent) * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.scale(ratio, ratio);
  layout.draw(context, 0, layout.ascent, formula.color);
  return canvasJpeg(canvas, 0.95);
}

/** Kompresja strumieni (zlib) – gdy przeglądarka ją ma (Safari od 16.4, Chrome, Edge). */
async function deflate(bytes) {
  if (typeof window.CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new window.CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// ---------------------------------------------------------------- strony

/** Rysuje elementy z pasa układu [from, to) na stronie; shift – położenie pasa (y układu → od góry strony). */
function paintBand(page, layout, from, to, shift) {
  const Y = (y) => A4.height - shift - y;
  const X = (x) => MARGIN_X + x;
  page.save();
  page.clip(0, Y(to), A4.width, to - from);
  for (const item of layout.items) {
    if (item.bottom <= from || item.top >= to) continue;
    switch (item.kind) {
      case 'rect':
        page.rect(X(item.left), Y(item.top + item.height), item.width, item.height, item.color);
        break;
      case 'line': {
        const [x1, y1, x2, y2] = item.points;
        page.line(X(x1), Y(y1), X(x2), Y(y2), item.width, item.color, item.dash);
        break;
      }
      case 'text':
        page.text(item.text, X(item.left), Y(item.baseline), { variant: item.variant, size: item.size, color: item.color });
        break;
      case 'image':
        page.image(item.name, X(item.left), Y(item.top + item.height), item.width, item.height);
        break;
      case 'bullet': {
        const r = item.width / 2;
        const cx = X(item.left + r);
        const cy = Y(item.top + item.height / 2);
        const context = pdfCanvas(page, [1, 0, 0, 1, 0, 0]);
        context.beginPath();
        if (item.shape === 'square') {
          context.moveTo(cx - r, cy - r);
          context.lineTo(cx + r, cy - r);
          context.lineTo(cx + r, cy + r);
          context.lineTo(cx - r, cy + r);
          context.closePath();
        } else {
          context.arc(cx, cy, item.shape === 'circle' ? r * 0.88 : r, 0, Math.PI * 2);
          context.closePath();
        }
        const css = `rgb(${item.color.join(',')})`;
        if (item.shape === 'circle') {
          context.strokeStyle = css;
          context.lineWidth = r * 0.24;
          context.stroke();
        } else {
          context.fillStyle = css;
          context.fill();
        }
        break;
      }
      case 'math': {
        const { formula } = item;
        if (formula.imageName) {
          page.image(formula.imageName, X(item.left), Y(item.top + item.height), item.width, item.height);
        } else {
          const context = pdfCanvas(page, [formula.scale, 0, 0, -formula.scale, X(item.left), Y(item.top)]);
          formula.layout.draw(context, 0, formula.layout.ascent, formula.color);
        }
        break;
      }
      default:
        break;
    }
  }
  page.restore();
  for (const link of layout.links) {
    if (link.top >= from - 0.5 && link.bottom <= to + 0.5) page.link(X(link.left), Y(link.bottom), link.right - link.left, link.bottom - link.top, link.uri);
  }
}

/**
 * Plik PDF notatki. title – nazwa lekcji (tytuł strony i dokumentu), path – dziedzina i moduł,
 * quality – 'standard' | 'high', pozostałe opcje – jak w noteFlow (html, images, tables,
 * imagesFirst, numberFigures, language). onProgress(tekst, część 0–1) – postęp. Zwraca { bytes, pages }.
 */
export async function createNotePdf({ title, path = null, quality: qualityID = 'standard', onProgress = () => {}, ...content }) {
  const quality = qualityOf(qualityID);
  onProgress('Składam strony…', 0.05);
  const root = layoutRoot({ title, path, content });
  try {
    await Promise.all([...root.querySelectorAll('img')].map((image) => image.decode().catch(() => {})));
    await document.fonts?.ready;
    const metrics = fontMetrics();
    prepareLists(root);
    const formulas = prepareMath(root, metrics);
    fitTables(root);
    const layout = readLayout(root, metrics, formulas);
    const regions = paginate(layout.atoms, { height: CONTENT_HEIGHT, breaks: layout.breaks });

    const pdf = createPdf({ title, widths: (variant, char) => metrics.width(variant, char), compress: deflate });
    const rasters = [...layout.images, ...formulas.filter((formula) => !formula.vector)];
    for (const [index, item] of layout.images.entries()) {
      onProgress(`Obrazy: ${index + 1} z ${rasters.length}…`, 0.15 + 0.7 * (index / Math.max(1, rasters.length)));
      await nextFrame();
      item.name = pdf.addImage(await rasterImage(item.element, item, quality));
    }
    for (const formula of formulas.filter((entry) => !entry.vector)) {
      formula.imageName = pdf.addImage(await rasterMath(formula, quality));
    }

    regions.forEach((region, index) => {
      const page = pdf.addPage();
      let top = MARGIN_Y;
      if (region.header) {
        paintBand(page, layout, region.header.top - 1, region.header.bottom + 0.5, top - region.header.top);
        top += region.header.bottom - region.header.top;
      }
      paintBand(page, layout, region.clipTop, region.clipBottom, top - region.top);
      if (regions.length > 1) {
        const label = `${index + 1} / ${regions.length}`;
        const size = 8.5;
        page.text(label, (A4.width - pdf.textWidth(label, { size })) / 2, MARGIN_Y / 2 - 3, { size, color: FOOTER_COLOR });
      }
    });
    onProgress(`Zapisuję strony: ${regions.length}…`, 0.9);
    await nextFrame();
    const bytes = await pdf.build();
    return { bytes, pages: regions.length };
  } finally {
    root.remove();
  }
}

// ---------------------------------------------------------------- okno „PDF notatki”

const pluralPages = (count) => {
  if (count === 1) return '1 strona';
  const tens = count % 100;
  return `${count} ${count % 10 >= 2 && count % 10 <= 4 && (tens < 12 || tens > 14) ? 'strony' : 'stron'}`;
};
const formatSize = (bytes) => (bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} kB`
  : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/**
 * Okno „PDF notatki” w trzech krokach (jak w makiecie): nazwa pliku i jakość obrazów → postęp →
 * gotowy plik z „Udostępnij…” (arkusz systemu: Zachowaj w Plikach, Drukuj, Poczta, AirDrop) i „Pobierz
 * plik”. quality – ostatni wybór, onQuality(id) – zapamiętanie wyboru, onPrint – druk notatki oknem
 * drukowania przeglądarki (nie na iPhonie w aplikacji z ekranu początkowego – tam druk nie działa).
 */
export function openNotePdf({ title, path = null, quality = 'standard', onQuality = null, onPrint = null, ...content }) {
  const state = { name: pdfFileName(title).replace(/\.pdf$/, ''), quality: qualityOf(quality).id, stage: 'options' };
  const hasImages = (content.images ?? []).some((image) => image.url);
  const view = h('div', { class: 'note-pdf-sheet' });
  let api = null;

  const qualityHint = () => (hasImages
    ? qualityOf(state.quality).hint
    : 'Notatka nie ma obrazów – jakość nie zmienia pliku (wzory są w nim tekstem i liniami).');

  function optionsView() {
    const hint = h('p', { class: 'field__hint', dataset: { testid: 'note-pdf-quality-hint' } }, qualityHint());
    return [
      field('Nazwa pliku', textInput({
        value: state.name, testID: 'note-pdf-name', autocapitalize: 'off',
        onInput: (value) => {
          state.name = value;
          api.setCanSubmit(value.trim() !== '');
        }
      }), { hint: 'Na końcu dochodzi „.pdf”.' }),
      h('div', { class: 'field', dataset: { testid: 'note-pdf-quality' } },
        h('span', { class: 'field__label' }, 'Jakość obrazów'),
        segmented({
          name: 'note-pdf-quality',
          label: 'Jakość obrazów',
          value: state.quality,
          options: PDF_QUALITIES.map((option) => ({ value: option.id, label: option.label })),
          onChange: (value) => {
            state.quality = value;
            onQuality?.(value);
            hint.textContent = qualityHint();
          }
        }),
        hint),
      h('p', { class: 'note-pdf-sheet__note' },
        'Strona A4, jak w podglądzie notatki (z numeracją rysunków i tabel). Tekst w pliku można zaznaczać, kopiować i wyszukiwać. Plik powstaje na tym urządzeniu – nic nie jest nigdzie wysyłane.'),
      onPrint && !window.navigator.standalone
        ? h('button', {
            type: 'button', class: 'button button--plain note-pdf-sheet__print', dataset: { testid: 'note-pdf-print' },
            onClick: () => {
              api.close();
              onPrint();
            }
          }, icon('print', { size: 18 }), h('span', null, 'Drukuj…'))
        : null
    ];
  }

  function doneView(file, pages) {
    const share = async () => {
      try {
        await navigator.share({ files: [file], title: file.name });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        // Arkusz udostępniania zawiódł – zostaje zwykłe pobranie.
        downloadFile(file);
      }
    };
    let canShare = false;
    try {
      canShare = typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) === true;
    } catch {
      canShare = false;
    }
    const shareFirst = prefersShareSheet(file);
    const shareButton = canShare ? [
      h('button', {
        type: 'button', class: `button ${shareFirst ? 'button--primary' : 'button--secondary'} note-pdf-sheet__action`, dataset: { testid: 'note-pdf-share' },
        onClick: share
      }, icon('share', { size: 18 }), h('span', null, 'Udostępnij…')),
      h('p', { class: 'note-pdf-sheet__note' }, 'Na iPhonie: ', h('strong', null, 'Zachowaj w Plikach'), ' (iCloud Drive albo „Na moim iPhonie”), ',
        h('strong', null, 'Drukuj'), ', Poczta, AirDrop.')
    ] : [];
    const downloadButton = [
      h('button', {
        type: 'button', class: `button ${shareFirst ? 'button--secondary' : 'button--primary'} note-pdf-sheet__action`, dataset: { testid: 'note-pdf-download' },
        onClick: () => {
          downloadFile(file);
          toast(`Zapisano plik ${file.name}.`);
        }
      }, icon('download', { size: 18 }), h('span', null, 'Pobierz plik')),
      h('p', { class: 'note-pdf-sheet__note' }, 'Na komputerze – do folderu Pobrane.')
    ];
    return [
      h('div', { class: 'field note-pdf-sheet__file', dataset: { testid: 'note-pdf-file' } },
        h('span', { class: 'note-pdf-sheet__file-icon', 'aria-hidden': 'true' }, icon('file', { size: 22 })),
        h('span', { class: 'note-pdf-sheet__file-text' },
          h('strong', { dataset: { testid: 'note-pdf-file-name' } }, file.name),
          h('span', { class: 'field__hint field__hint--live', dataset: { testid: 'note-pdf-file-info' } }, `${pluralPages(pages)} · ${formatSize(file.size)} · A4`))),
      ...(shareFirst ? [...shareButton, ...downloadButton] : [...downloadButton, ...shareButton])
    ];
  }

  const sheet = openFormSheet({
    title: 'PDF notatki',
    submitLabel: 'Utwórz',
    build(sheetApi) {
      api = sheetApi;
      replaceChildren(view, optionsView());
      return view;
    },
    async onSubmit() {
      if (state.stage === 'done') return true;
      if (state.stage === 'progress') return false;
      const submit = view.closest('form').querySelector('.sheet__submit');
      const name = pdfFileName(state.name);
      const bar = h('span', { class: 'note-pdf-sheet__bar' });
      const status = h('p', { class: 'field__hint field__hint--live', dataset: { testid: 'note-pdf-status' } }, 'Składam strony…');
      state.stage = 'progress';
      api.setCanSubmit(false);
      replaceChildren(view, h('div', { class: 'field', dataset: { testid: 'note-pdf-progress' } },
        h('span', { class: 'field__label' }, `Tworzę plik ${name}…`),
        h('span', { class: 'note-pdf-sheet__progress', role: 'progressbar', 'aria-label': 'Postęp tworzenia pliku' }, bar),
        status));
      try {
        const result = await createNotePdf({
          title, path, quality: state.quality, ...content,
          onProgress: (text, share) => {
            status.textContent = text;
            bar.style.width = `${Math.round(share * 100)}%`;
          }
        });
        const file = new File([result.bytes], name, { type: 'application/pdf' });
        state.stage = 'done';
        api.setCancelLabel('Zamknij');
        submit.textContent = 'Gotowe';
        api.setCanSubmit(true);
        replaceChildren(view, doneView(file, result.pages));
        return false;
      } catch (error) {
        state.stage = 'options';
        replaceChildren(view, optionsView());
        api.setCanSubmit(true);
        throw error;
      }
    }
  });
  sheet.dialog.dataset.testid = 'note-pdf-sheet';
  return sheet;
}
