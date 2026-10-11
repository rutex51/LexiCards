// Eksport pojęć do pliku XLSX albo CSV. Układ kolumn jest taki sam jak przy imporcie,
// więc wyeksportowany plik można poprawić w arkuszu i wczytać z powrotem.

import { encodeCsv, writeCsv } from './csv.js';
import { IMPORT_FIELDS } from './importer.js';
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

/** Nazwa pliku, np. „LexiCards-financial-ratios-2026-10-11.xlsx”. */
export function exportFileName(scopeName, format, date = new Date()) {
  const slug = normalizeKey(scopeName).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pojecia';
  const pad = (value) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `LexiCards-${slug}-${day}.${format}`;
}

async function encodeTable(format, sheetName, rows) {
  if (format === 'csv') return encodeCsv(writeCsv([EXPORT_HEADER, ...rows]));
  return createWorkbook({
    sheetName,
    header: EXPORT_HEADER,
    rows,
    columnWidths: IMPORT_FIELDS.map((field) => COLUMN_WIDTHS[field.id])
  });
}

/** Buduje plik eksportu. Zwraca { name, type, bytes, count }. */
export async function buildExportFile(library, scope, format, date = new Date()) {
  const description = EXPORT_FORMATS.find((item) => item.id === format);
  if (!description) throw new Error(`Nieznany format eksportu: ${format}`);
  const { name, rows } = collectExportRows(library, scope);
  return {
    name: exportFileName(name, format, date),
    type: description.type,
    bytes: await encodeTable(format, 'Pojęcia', rows),
    count: rows.length
  };
}

/** Wzór pliku do importu: nagłówki i dwa przykładowe wiersze. */
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
  return {
    name: `LexiCards-wzor-importu.${format}`,
    type: description.type,
    bytes: await encodeTable(format, 'Pojęcia', rows),
    count: rows.length
  };
}
