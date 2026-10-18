// Eksport pojęć do pliku XLSX albo CSV. Układ kolumn jest taki sam jak przy imporcie,
// więc wyeksportowany plik można poprawić w arkuszu i wczytać z powrotem.
// XLSX ma też arkusz „Notatki” z notatkami lekcji: tekst z formatowaniem i obrazy
// (każdy obraz w osobnym wierszu tej samej lekcji). CSV to jedna tabela – tylko pojęcia.

import { base64ToBytes } from './base64.js';
import { encodeCsv, writeCsv } from './csv.js';
import { IMPORT_FIELDS } from './importer.js';
import { docFromHtml, richTextFromDoc } from './note-format.js';
import { NOTE_HEADER } from './note-import.js';
import { TEMPLATE_IMAGE, TEMPLATE_IMAGE_BASE64 } from './template-image.js';
import { formatTags, normalizeKey } from './text.js';
import { createWorkbook } from './xlsx.js';

export const EXPORT_FORMATS = Object.freeze([
  { id: 'xlsx', label: 'Excel (XLSX)', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { id: 'csv', label: 'CSV', type: 'text/csv' }
]);

const COLUMN_WIDTHS = {
  domain: 20, module: 22, lesson: 24, termPL: 28, termEN: 28,
  descriptionPL: 46, descriptionEN: 46, examplePL: 46, exampleEN: 46,
  tags: 20, difficulty: 11, notes: 30
};

export const EXPORT_HEADER = Object.freeze(IMPORT_FIELDS.map((field) => field.header));

/** Nazwy arkuszy eksportu i wzoru. */
export const TERMS_SHEET = 'Pojęcia';
export const NOTES_SHEET = 'Notatki';
const NOTE_COLUMN_WIDTHS = [20, 22, 24, 70, 48];
const NOTE_IMAGE_COLUMN = 4;

function termRow(domain, module, lesson, term) {
  return [
    domain.name, module.name, lesson.name,
    term.termPL, term.termEN,
    term.descriptionPL ?? '', term.descriptionEN ?? '',
    term.examplePL ?? '', term.exampleEN ?? '',
    formatTags(term.tags), term.difficulty ?? '', term.notes ?? ''
  ];
}

/**
 * Zbiera wiersze eksportu w kolejności biblioteki.
 * scope: { kind: 'all' } | { kind: 'domain' | 'module' | 'lesson', id } | { kind: 'terms', ids }.
 * Zwraca { name, rows } – `name` to nazwa zakresu używana w nazwie pliku.
 */
export function collectExportRows(library, scope) {
  const rows = [];
  const selected = scope.kind === 'terms' ? new Set(scope.ids) : null;
  let name = 'biblioteka';
  if (scope.kind === 'domain') name = library.getDomain(scope.id)?.name ?? name;
  else if (scope.kind === 'module') name = library.getModule(scope.id)?.name ?? name;
  else if (scope.kind === 'lesson') name = library.getLesson(scope.id)?.name ?? name;
  else if (scope.kind === 'terms') name = 'wybrane pojęcia';

  for (const domain of library.listDomains()) {
    if (scope.kind === 'domain' && domain.id !== scope.id) continue;
    for (const module of library.listModules(domain.id)) {
      if (scope.kind === 'module' && module.id !== scope.id) continue;
      for (const lesson of library.listLessons(module.id)) {
        if (scope.kind === 'lesson' && lesson.id !== scope.id) continue;
        for (const term of library.listTerms(lesson.id)) {
          if (selected && !selected.has(term.id)) continue;
          rows.push(termRow(domain, module, lesson, term));
        }
      }
    }
  }
  return { name, rows };
}

/**
 * Lekcje z notatkami w zakresie eksportu (w kolejności biblioteki): [{ domain, module, lesson, note }].
 * Zaznaczone pojęcia (scope.kind 'terms') nie mają notatek.
 */
export function collectExportNotes(library, scope) {
  if (scope.kind === 'terms') return [];
  const notes = [];
  for (const domain of library.listDomains()) {
    if (scope.kind === 'domain' && domain.id !== scope.id) continue;
    for (const module of library.listModules(domain.id)) {
      if (scope.kind === 'module' && module.id !== scope.id) continue;
      for (const lesson of library.listLessons(module.id)) {
        if (scope.kind === 'lesson' && lesson.id !== scope.id) continue;
        const note = library.getNote(lesson.id);
        if (note) notes.push({ domain, module, lesson, note });
      }
    }
  }
  return notes;
}

/**
 * Arkusz notatek: pierwszy wiersz lekcji ma treść i pierwszy obraz, kolejne obrazy
 * są w następnych wierszach tej samej lekcji. entries: [{ domain, module, lesson, html, images }].
 */
function notesSheet(entries) {
  const rows = [];
  const images = [];
  for (const entry of entries) {
    const runs = richTextFromDoc(docFromHtml(entry.html));
    const count = Math.max(1, entry.images.length);
    for (let index = 0; index < count; index += 1) {
      rows.push([entry.domain, entry.module, entry.lesson, index === 0 && runs.length > 0 ? { runs } : null, null]);
      const image = entry.images[index];
      if (image) images.push({ ...image, row: rows.length, column: NOTE_IMAGE_COLUMN });
    }
  }
  return { name: NOTES_SHEET, header: [...NOTE_HEADER], rows, images, columnWidths: NOTE_COLUMN_WIDTHS };
}

/** Nazwa pliku, np. „LexiCards-financial-ratios-2026-10-11.xlsx”. */
export function exportFileName(scopeName, format, date = new Date()) {
  const slug = normalizeKey(scopeName).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pojecia';
  const pad = (value) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `LexiCards-${slug}-${day}.${format}`;
}

async function encodeTable(format, rows, noteEntries = []) {
  if (format === 'csv') return encodeCsv(writeCsv([EXPORT_HEADER, ...rows]));
  const sheets = [{
    name: TERMS_SHEET,
    header: EXPORT_HEADER,
    rows,
    columnWidths: IMPORT_FIELDS.map((field) => COLUMN_WIDTHS[field.id])
  }];
  if (noteEntries.length > 0) sheets.push(notesSheet(noteEntries));
  return createWorkbook({ sheets });
}

/**
 * Buduje plik eksportu. Zwraca { name, type, bytes, count, notes, images }.
 * options.notes (domyślnie true) – arkusz notatek lekcji z zakresu (tylko XLSX).
 */
export async function buildExportFile(library, scope, format, date = new Date(), { notes: withNotes = true } = {}) {
  const description = EXPORT_FORMATS.find((item) => item.id === format);
  if (!description) throw new Error(`Nieznany format eksportu: ${format}`);
  const { name, rows } = collectExportRows(library, scope);
  const entries = [];
  if (format === 'xlsx' && withNotes) {
    for (const { domain, module, lesson, note } of collectExportNotes(library, scope)) {
      entries.push({ domain: domain.name, module: module.name, lesson: lesson.name, html: note.html, images: await library.noteImages(lesson.id) });
    }
  }
  return {
    name: exportFileName(name, format, date),
    type: description.type,
    bytes: await encodeTable(format, rows, entries),
    count: rows.length,
    notes: entries.length,
    images: entries.reduce((sum, entry) => sum + entry.images.length, 0)
  };
}

/** Przykładowa notatka wzoru: pokazuje formatowanie, listy i obraz. */
const TEMPLATE_NOTE_HTML = '<h3>Bilans – najważniejsze</h3>'
  + '<p><strong>Bilans</strong> (<em>balance sheet</em>) pokazuje majątek firmy i źródła jego finansowania '
  + '<u>na określony dzień</u>.</p>'
  + '<ul><li>Aktywa = Pasywa</li><li>Pasywa to <span data-color="green">kapitał własny</span> i <span data-color="red">zobowiązania</span></li></ul>'
  + '<p>Formatowanie komórki (pogrubienie, kursywa, podkreślenie, kolor) przechodzi do notatki. '
  + 'Wiersz od „• ” to punkt listy, od „1. ” – lista numerowana, od „# ” – nagłówek. '
  + 'Obraz wklej do kolumny Image w wierszu lekcji; kolejne obrazy – w kolejnych wierszach z tą samą lekcją.</p>';

/** Wzór pliku do importu: nagłówki i dwa przykładowe pojęcia, w XLSX także arkusz notatek. */
export async function buildTemplateFile(format = 'xlsx') {
  const description = EXPORT_FORMATS.find((item) => item.id === format);
  const rows = [
    ['Business English', 'Finance', 'Financial Statements', 'bilans', 'balance sheet',
      'Zestawienie aktywów, zobowiązań i kapitału własnego firmy na określony dzień.',
      "A statement of a company's assets, liabilities and equity at a specific date.",
      'Bilans pokazuje, że zadłużenie spółki spadło.',
      "The balance sheet shows that the company's debt has decreased.",
      'finanse, sprawozdania', 2, ''],
    ['Business English', 'Finance', 'Financial Statements', 'aktywa', 'assets', '', '', '', '', '', '', '']
  ];
  const notes = format === 'xlsx'
    ? [{
        domain: 'Business English', module: 'Finance', lesson: 'Financial Statements', html: TEMPLATE_NOTE_HTML,
        images: [{ ...TEMPLATE_IMAGE, bytes: new Uint8Array(base64ToBytes(TEMPLATE_IMAGE_BASE64)) }]
      }]
    : [];
  return {
    name: `LexiCards-wzor-importu.${format}`,
    type: description.type,
    bytes: await encodeTable(format, rows, notes),
    count: rows.length
  };
}
