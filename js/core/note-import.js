// Import notatek lekcji z arkusza (osobny arkusz skoroszytu albo plik CSV).
//
// Arkusz notatek ma kolumny Domain, Module, Lesson (jak arkusz pojęć), Note – treść notatki,
// opcjonalnie Note EN – ta sama notatka po angielsku (od 1.6), Image – obrazy i Image label –
// sygnatura obrazu z tego wiersza (od 1.6; bez niej „Obraz 1”, „Obraz 2”… po kolei). Linijka
// [[sygnatura]] w treści to miejsce obrazu; od 1.18 Image caption – podpis pod obrazem.
// Treść może mieć formatowanie z Excela (pogrubienie, kursywa,
// podkreślenie, przekreślenie, indeksy, kolor), listy i nagłówki (zob. docFromRichText).
// Obrazy mogą leżeć w dowolnej kolumnie: wstawione na arkusz (zakotwiczone przy komórce)
// albo w komórkę – należą do wiersza, w którym jest ich lewy górny róg. Kilka wierszy tej samej
// lekcji (np. jeden obraz w wierszu) składa się na jedną notatkę.
// Bez zależności od przeglądarki.

import { IMAGE_FORMAT_NAMES } from './images.js';
import { analyzeHeader, columnLetter, guessField, looksLikeTermHeader } from './importer.js';
import { docFromRichText, htmlFromDoc } from './note-format.js';
import { collapseWhitespace, normalizeKey } from './text.js';

/** Pola arkusza notatek; `header` to nagłówek używany w eksporcie i we wzorze. */
export const NOTE_FIELDS = Object.freeze([
  { id: 'domain', label: 'Dziedzina', header: 'Domain' },
  { id: 'module', label: 'Moduł', header: 'Module' },
  { id: 'lesson', label: 'Lekcja', header: 'Lesson' },
  { id: 'text', label: 'Treść notatki', header: 'Note' },
  { id: 'textEN', label: 'Treść notatki po angielsku', header: 'Note EN' },
  { id: 'image', label: 'Obrazy', header: 'Image' },
  { id: 'imageLabel', label: 'Sygnatura obrazu', header: 'Image label' },
  { id: 'imageCaption', label: 'Podpis obrazu', header: 'Image caption' }
]);

export const NOTE_HEADER = Object.freeze(NOTE_FIELDS.map((field) => field.header));

/** Obrazy, które przeglądarka może wyświetlić albo przerobić (BMP, TIFF, HEIC, AVIF – nie każda). */
export const IMPORTABLE_IMAGE_TYPES = Object.freeze([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/heic', 'image/avif'
]);

const TEXT_PREFIXES = ['notat', 'note', 'tresc', 'content', 'tekst', 'text', 'komentarz', 'comment', 'uwag'];
const IMAGE_PREFIXES = ['obraz', 'image', 'img', 'grafik', 'graphic', 'ilustrac', 'illustr', 'zdjec', 'photo', 'foto', 'picture', 'rysun', 'diagram', 'schemat'];
const LABEL_PREFIXES = ['label', 'sygnatur', 'signature', 'etykiet'];
/** Podpis pod obrazem (od 1.18; wcześniej „podpis” i „caption” oznaczały sygnaturę). */
const CAPTION_PREFIXES = ['podpis', 'caption'];
const ENGLISH_WORDS = ['en', 'eng', 'ang', 'english'];

function words(header) {
  return normalizeKey(header).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/** Pole arkusza notatek rozpoznane po nagłówku albo null. */
export function guessNoteField(header) {
  const parts = words(header);
  if (parts.length === 0) return null;
  if (parts.some((word) => CAPTION_PREFIXES.some((prefix) => word.startsWith(prefix)))
    && parts.some((word) => IMAGE_PREFIXES.some((prefix) => word.startsWith(prefix)) || CAPTION_PREFIXES.some((prefix) => word.startsWith(prefix)))
    && !parts.some((word) => TEXT_PREFIXES.some((prefix) => word.startsWith(prefix)))) return 'imageCaption';
  if (parts.some((word) => LABEL_PREFIXES.some((prefix) => word.startsWith(prefix)))) return 'imageLabel';
  if (parts.some((word) => IMAGE_PREFIXES.some((prefix) => word.startsWith(prefix)))) return 'image';
  const field = guessField(header);
  if (field === 'domain' || field === 'module' || field === 'lesson') return field;
  if (parts.some((word) => TEXT_PREFIXES.some((prefix) => word.startsWith(prefix)))) {
    const english = parts.some((word) => ENGLISH_WORDS.includes(word) || word.startsWith('angielsk'));
    return english ? 'textEN' : 'text';
  }
  return null;
}

/** Przypisanie kolumn arkusza notatek: { hasHeader, mapping: { pole: indeks } }. */
export function analyzeNotesHeader(table) {
  const header = table.rows[0]?.cells ?? [];
  const mapping = {};
  header.forEach((cell, index) => {
    const field = guessNoteField(cell);
    if (field && mapping[field] === undefined) mapping[field] = index;
  });
  return { hasHeader: Object.keys(mapping).length > 0, mapping };
}

/**
 * Rodzaj arkusza: 'notes' – notatki lekcji, 'terms' – pojęcia (także arkusz bez nagłówków),
 * 'empty' – bez danych. Arkusz notatek ma kolumnę treści albo obrazów, nie ma kolumn pojęć
 * i albo nazywa się „Notatki”/„Notes”, albo ma kolumnę lekcji.
 */
export function classifyTable(table, sheetName = '') {
  if (!table || table.rows.length === 0) return 'empty';
  const terms = analyzeHeader(table);
  if (terms.hasHeader && (terms.mapping.termPL !== undefined || terms.mapping.termEN !== undefined)) return 'terms';
  const { hasHeader, mapping } = analyzeNotesHeader(table);
  if (!hasHeader || (mapping.text === undefined && mapping.image === undefined)) return 'terms';
  const header = table.rows[0].cells;
  const used = new Set(Object.values(mapping));
  const termHints = header.some((cell, index) => !used.has(index) && looksLikeTermHeader(cell));
  const named = /^(notatk|notes?$|note\b|lesson notes)/.test(normalizeKey(sheetName).trim());
  if (named || (mapping.lesson !== undefined && !termHints)) return 'notes';
  return 'terms';
}

const LEVELS = ['domain', 'module', 'lesson'];

/**
 * Buduje notatki z arkusza.
 *
 * table   – tabela z odczytu { rich: true } (CSV: zwykła tabela, bez obrazów),
 * mapping – { domain, module, lesson, text, textEN, image, imageLabel, imageCaption } (indeksy kolumn),
 * target  – opcjonalnie lekcja dla wszystkich wierszy: { lessonID } albo { domain, module, lesson };
 *           gdy jej nie ma, lekcję wskazują kolumny (brak kolumny lekcji to błąd).
 *
 * Zwraca:
 *   notes  – [{ key, numbers, domain, module, lesson, lessonID?, html, htmlEN?, images: [{ bytes, type, name, row, label, caption }] }]
 *            (htmlEN tylko wtedy, gdy arkusz ma kolumnę Note EN),
 *   issues – [{ number, severity, message }],
 *   counts – { rows, notes, images, rejected, warnings, skippedImages }.
 */
export function buildNoteRows({ table, mapping, target = null }) {
  const issues = [];
  const counts = { rows: 0, notes: 0, images: 0, rejected: 0, warnings: 0, skippedImages: 0 };
  const groups = new Map();
  const order = [];
  /** Numer wiersza → grupa (do przypisania obrazów). */
  const rowGroups = [];
  const fromTarget = Boolean(target);
  if (!fromTarget && mapping.lesson === undefined) {
    return {
      notes: [],
      issues: [{ number: table.rows[0]?.number ?? 1, severity: 'error', message: 'arkusz nie ma kolumny z nazwą lekcji (Lesson)' }],
      counts: { ...counts, rejected: Math.max(0, table.rows.length - 1) }
    };
  }

  const carried = { domain: '', module: '', lesson: '' };
  const dataRows = table.rows.slice(1);
  /** Numer wiersza → sygnatura obrazu wpisana w tym wierszu i (od 1.18) podpis obrazu. */
  const labels = new Map();
  const captions = new Map();
  const richRuns = (row, index) => (index === undefined
    ? []
    : (row.rich?.[index] ?? (String(row.cells[index] ?? '') ? [{ text: String(row.cells[index]) }] : [])));
  for (const row of dataRows) {
    const text = (index) => (index === undefined ? '' : String(row.cells[index] ?? ''));
    if (mapping.imageLabel !== undefined && text(mapping.imageLabel).trim() !== '') labels.set(row.number, text(mapping.imageLabel));
    if (mapping.imageCaption !== undefined && text(mapping.imageCaption).trim() !== '') captions.set(row.number, text(mapping.imageCaption));
    const place = {};
    let changedAbove = false;
    for (const level of LEVELS) {
      if (fromTarget || mapping[level] === undefined) {
        place[level] = '';
        continue;
      }
      const value = collapseWhitespace(text(mapping[level]));
      if (value !== '') {
        if (normalizeKey(value) !== normalizeKey(carried[level])) changedAbove = true;
        carried[level] = value;
      } else if (changedAbove) {
        carried[level] = '';
      }
      place[level] = carried[level];
    }

    const doc = docFromRichText(richRuns(row, mapping.text));
    const docEN = docFromRichText(richRuns(row, mapping.textEN));
    const hasText = doc.blocks.length > 0 || docEN.blocks.length > 0;
    const hasPlace = LEVELS.some((level) => place[level] !== '');
    if (!hasText && !hasPlace && !fromTarget) continue;

    if (!fromTarget && place.lesson === '') {
      counts.rejected += 1;
      issues.push({ number: row.number, severity: 'error', message: 'brak nazwy lekcji' });
      rowGroups.push({ number: row.number, group: null });
      continue;
    }
    const key = fromTarget ? 'target' : LEVELS.map((level) => normalizeKey(place[level])).join('\n');
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        numbers: [],
        ...(fromTarget ? { ...target } : { domain: place.domain, module: place.module, lesson: place.lesson }),
        blocks: [],
        blocksEN: [],
        images: []
      };
      groups.set(key, group);
      order.push(group);
    }
    group.numbers.push(row.number);
    group.blocks.push(...doc.blocks);
    group.blocksEN.push(...docEN.blocks);
    if (hasText) counts.rows += 1;
    rowGroups.push({ number: row.number, group });
  }

  // Obrazy należą do ostatniego wiersza z danymi, który zaczyna się nie niżej niż obraz.
  const firstData = dataRows[0]?.number ?? Infinity;
  for (const image of table.images ?? []) {
    const where = image.column === null || image.column === undefined ? '' : ` (kolumna ${columnLetter(image.column)})`;
    if (image.row === null || image.row === undefined) {
      counts.skippedImages += 1;
      counts.warnings += 1;
      issues.push({ number: firstData, severity: 'warning', message: 'obraz bez zakotwiczenia przy komórce – pominięto go' });
      continue;
    }
    let owner = null;
    for (const entry of rowGroups) {
      if (entry.number <= image.row) owner = entry;
      else break;
    }
    if (!owner || !owner.group) {
      counts.skippedImages += 1;
      counts.warnings += 1;
      issues.push({
        number: image.row,
        severity: 'warning',
        message: owner ? `obraz${where} w wierszu z błędem – pominięto go` : `obraz${where} nad pierwszym wierszem notatek – pominięto go`
      });
      continue;
    }
    if (!IMPORTABLE_IMAGE_TYPES.includes(image.type)) {
      counts.skippedImages += 1;
      counts.warnings += 1;
      const format = IMAGE_FORMAT_NAMES[image.type] ?? 'nieznanym';
      issues.push({ number: image.row, severity: 'warning', message: `obraz${where} w formacie ${format} nie może być wyświetlony – zapisz go jako PNG albo JPEG; pominięto go` });
      continue;
    }
    owner.group.images.push({
      bytes: image.bytes, type: image.type, name: image.name ?? null, row: image.row, label: labels.get(image.row) ?? null,
      caption: captions.get(image.row) ?? null
    });
    // Wiersz z samym obrazem też należy do notatki (np. „Wiersze 2–3”).
    if (!owner.group.numbers.includes(image.row)) owner.group.numbers.push(image.row);
  }

  const notes = [];
  for (const group of order) {
    group.numbers.sort((a, b) => a - b);
    const html = htmlFromDoc({ blocks: group.blocks });
    const htmlEN = htmlFromDoc({ blocks: group.blocksEN });
    if (html === '' && htmlEN === '' && group.images.length === 0) continue;
    const { blocks, blocksEN, ...rest } = group;
    notes.push({ ...rest, html, ...(mapping.textEN === undefined ? {} : { htmlEN }), blockCount: blocks.length + blocksEN.length });
    counts.images += group.images.length;
  }
  counts.notes = notes.length;
  issues.sort((a, b) => a.number - b.number);
  return { notes, issues, counts };
}
