// Logika importu z tabeli: rozpoznawanie nagłówków, przypisanie kolumn do pól,
// zamiana wierszy pliku na wiersze dla Library.importRows() i walidacja.
// Bez zależności od przeglądarki.

import { DIFFICULTY_MAX, DIFFICULTY_MIN } from './model.js';
import { collapseWhitespace, normalizeKey, parseTags } from './text.js';

/** Pola, do których można przypisać kolumnę pliku. `header` to nagłówek używany przy eksporcie. */
export const IMPORT_FIELDS = Object.freeze([
  { id: 'domain', label: 'Dziedzina', header: 'Domain', structure: true },
  { id: 'module', label: 'Moduł', header: 'Module', structure: true },
  { id: 'lesson', label: 'Lekcja', header: 'Lesson', structure: true },
  { id: 'termPL', label: 'Pojęcie po polsku', header: 'Term PL', required: true },
  { id: 'termEN', label: 'Pojęcie po angielsku', header: 'Term EN', required: true },
  { id: 'descriptionPL', label: 'Opis po polsku', header: 'Description PL' },
  { id: 'descriptionEN', label: 'Opis po angielsku', header: 'Description EN' },
  { id: 'examplePL', label: 'Przykład po polsku', header: 'Example PL' },
  { id: 'exampleEN', label: 'Przykład po angielsku', header: 'Example EN' },
  { id: 'tags', label: 'Tagi', header: 'Tags' },
  { id: 'difficulty', label: 'Trudność (1–5)', header: 'Difficulty' },
  { id: 'notes', label: 'Notatki', header: 'Notes' }
]);

export const STRUCTURE_LEVELS = Object.freeze(['domain', 'module', 'lesson']);

const LEVEL_NAMES = { domain: 'dziedziny', module: 'modułu', lesson: 'lekcji' };

// ---------------------------------------------------------------- nagłówki

/** Rdzenie słów (po usunięciu polskich znaków) wskazujące rodzaj kolumny. */
const KIND_PREFIXES = [
  ['example', ['przyklad', 'example', 'zdani', 'sentence', 'uzyci', 'usage', 'kontekst', 'context']],
  ['description', ['opis', 'definic', 'definit', 'descr', 'znaczeni', 'meaning', 'objasnieni', 'wyjasnieni']],
  ['term', ['term', 'pojeci', 'hasl', 'slow', 'word', 'nazw', 'name', 'wyrazeni', 'phrase', 'zwrot', 'tlumaczeni', 'translation']]
];

const OTHER_PREFIXES = [
  ['domain', ['domain', 'dziedzin', 'obszar', 'kategori', 'categor']],
  ['module', ['modul']],
  ['lesson', ['lekcj', 'lesson', 'unit', 'temat', 'topic', 'rozdzial', 'chapter']],
  ['tags', ['tag', 'etykiet', 'label']],
  ['difficulty', ['trudnosc', 'difficult', 'poziom', 'level']],
  ['notes', ['notat', 'note', 'uwag', 'komentarz', 'comment']]
];

function tokens(header) {
  return normalizeKey(header).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

function languageOf(words) {
  for (const word of words) {
    if (word === 'pl' || word === 'pol' || word === 'polish' || word.startsWith('polsk')) return 'PL';
    if (word === 'en' || word === 'eng' || word === 'ang' || word === 'english' || word.startsWith('angielsk')) return 'EN';
  }
  return null;
}

function matchPrefixes(words, table) {
  for (const [id, prefixes] of table) {
    if (words.some((word) => prefixes.some((prefix) => word.startsWith(prefix)))) return id;
  }
  return null;
}

/** Czy nagłówek wskazuje treść pojęcia (pojęcie, opis, przykład) – w dowolnym języku. */
export function looksLikeTermHeader(header) {
  return matchPrefixes(tokens(header), KIND_PREFIXES) !== null;
}

/**
 * Rozpoznaje pole po nagłówku kolumny, np. „Term PL”, „Pojęcie po polsku”, „Opis EN”,
 * „Definicja (angielski)”, „Lekcja”. Zwraca identyfikator pola albo null.
 */
export function guessField(header) {
  const words = tokens(header);
  if (words.length === 0) return null;
  const language = languageOf(words);
  if (language) {
    const kind = matchPrefixes(words, KIND_PREFIXES);
    if (kind) return `${kind}${language}`;
    // „Note EN” (arkusz notatek) to nie pojęcie.
    if (matchPrefixes(words, OTHER_PREFIXES)) return null;
    // Sam język („Polski”, „EN”, „Język angielski”) oznacza kolumnę z pojęciem.
    return words.length <= 2 ? `term${language}` : null;
  }
  return matchPrefixes(words, OTHER_PREFIXES);
}

/** Litera kolumny jak w arkuszu: 0 → A, 26 → AA. */
export function columnLetter(index) {
  let letters = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    letters = String.fromCharCode(65 + ((value - 1) % 26)) + letters;
  }
  return letters;
}

/**
 * Analizuje pierwszy wiersz tabeli. Zwraca:
 *   hasHeader – czy pierwszy wiersz wygląda na nagłówki,
 *   mapping   – { pole: indeks kolumny } dla rozpoznanych pól.
 * Gdy nagłówków nie ma, dwie pierwsze kolumny są traktowane jako pojęcie PL i EN.
 */
export function analyzeHeader(table) {
  const first = table.rows[0]?.cells ?? [];
  const mapping = {};
  let hinted = 0;
  first.forEach((cell, index) => {
    const field = guessField(cell);
    if (field && mapping[field] === undefined) mapping[field] = index;
    if (field || matchPrefixes(tokens(cell), KIND_PREFIXES)) hinted += 1;
  });
  const recognized = Object.keys(mapping).length;
  if (recognized > 0 || hinted >= 2) return { hasHeader: true, mapping };
  const fallback = {};
  if (table.columnCount >= 1) fallback.termPL = 0;
  if (table.columnCount >= 2) fallback.termEN = 1;
  return { hasHeader: false, mapping: fallback };
}

/** Opisy kolumn do list wyboru: nagłówek albo litera i przykładowa wartość. */
export function describeColumns(table, hasHeader) {
  const header = hasHeader ? (table.rows[0]?.cells ?? []) : [];
  const sampleRow = table.rows[hasHeader ? 1 : 0]?.cells ?? [];
  const columns = [];
  for (let index = 0; index < table.columnCount; index += 1) {
    const letter = columnLetter(index);
    const title = collapseWhitespace(header[index]);
    const sample = collapseWhitespace(sampleRow[index]);
    columns.push({
      index,
      letter,
      title,
      sample,
      label: title ? `${letter}: ${title}` : (sample ? `${letter} (np. ${sample.slice(0, 30)})` : letter)
    });
  }
  return columns;
}

// ---------------------------------------------------------------- wiersze

function parseDifficulty(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { value: null, valid: true };
  const number = Number(text.replace(',', '.'));
  if (Number.isInteger(number) && number >= DIFFICULTY_MIN && number <= DIFFICULTY_MAX) return { value: number, valid: true };
  return { value: null, valid: false };
}

/**
 * Zamienia wiersze pliku na wiersze importu.
 *
 * mapping     – { pole: indeks kolumny },
 * destination – { useFileStructure, domain, module, lesson }: nazwy używane dla poziomów,
 *               których nie bierzemy z kolumn pliku.
 *
 * Zwraca:
 *   rows   – [{ number, domain, module, lesson, term }] gotowe dla Library.importRows(),
 *   issues – [{ number, severity: 'error' | 'warning', message }],
 *   counts – { data, valid, rejected, warnings, filledDown, structureOnly }.
 *
 * Pusta komórka w kolumnie dziedziny, modułu lub lekcji przejmuje wartość z wiersza powyżej
 * (tak wyglądają scalone komórki i arkusze z nazwą grupy tylko w pierwszym wierszu).
 */
export function buildImportRows({ table, hasHeader, mapping, destination }) {
  const rows = [];
  const issues = [];
  const counts = { data: 0, valid: 0, rejected: 0, warnings: 0, filledDown: 0, structureOnly: 0 };
  const fromFile = (level) => Boolean(destination.useFileStructure) && mapping[level] !== undefined;
  const carried = { domain: '', module: '', lesson: '' };
  const fixed = {
    domain: collapseWhitespace(destination.domain),
    module: collapseWhitespace(destination.module),
    lesson: collapseWhitespace(destination.lesson)
  };
  const textFields = ['descriptionPL', 'descriptionEN', 'examplePL', 'exampleEN', 'notes'];
  const contentFields = ['termPL', 'termEN', ...textFields].filter((field) => mapping[field] !== undefined);

  const dataRows = hasHeader ? table.rows.slice(1) : table.rows;
  for (const { number, cells } of dataRows) {
    const cell = (field) => (mapping[field] === undefined ? '' : String(cells[mapping[field]] ?? ''));
    counts.data += 1;

    // Struktura: wartość z komórki, a gdy jest pusta – z wiersza powyżej.
    const place = {};
    let usedCarried = false;
    let changedAbove = false;
    for (const level of STRUCTURE_LEVELS) {
      if (!fromFile(level)) {
        place[level] = fixed[level];
        continue;
      }
      const value = collapseWhitespace(cell(level));
      if (value !== '') {
        if (normalizeKey(value) !== normalizeKey(carried[level])) changedAbove = true;
        carried[level] = value;
      } else if (changedAbove) {
        // Zmienił się poziom wyżej – nazwa z poprzedniej grupy już nie obowiązuje.
        carried[level] = '';
      } else if (carried[level] !== '') {
        usedCarried = true;
      }
      place[level] = carried[level];
    }

    const hasContent = contentFields.some((field) => cell(field).trim() !== '');
    if (!hasContent) {
      // Wiersz z samą nazwą grupy (albo zupełnie pusty w przypisanych kolumnach).
      counts.data -= 1;
      counts.structureOnly += 1;
      continue;
    }

    const problems = [];
    const termPL = collapseWhitespace(cell('termPL'));
    const termEN = collapseWhitespace(cell('termEN'));
    if (termPL === '') problems.push('brak pojęcia po polsku');
    if (termEN === '') problems.push('brak pojęcia po angielsku');
    for (const level of STRUCTURE_LEVELS) {
      if (place[level] === '') problems.push(`brak nazwy ${LEVEL_NAMES[level]}`);
    }
    if (problems.length > 0) {
      counts.rejected += 1;
      issues.push({ number, severity: 'error', message: problems.join(', ') });
      continue;
    }

    const term = { termPL, termEN };
    for (const field of textFields) {
      if (mapping[field] !== undefined) term[field] = cell(field).trim();
    }
    if (mapping.tags !== undefined) term.tags = parseTags(cell('tags'));
    if (mapping.difficulty !== undefined) {
      const difficulty = parseDifficulty(cell('difficulty'));
      if (difficulty.valid) {
        term.difficulty = difficulty.value;
      } else {
        counts.warnings += 1;
        issues.push({
          number,
          severity: 'warning',
          message: `trudność „${collapseWhitespace(cell('difficulty')).slice(0, 20)}” nie jest liczbą od ${DIFFICULTY_MIN} do ${DIFFICULTY_MAX} – pominięto ją`
        });
      }
    }

    if (usedCarried) counts.filledDown += 1;
    counts.valid += 1;
    rows.push({ number, domain: place.domain, module: place.module, lesson: place.lesson, term });
  }

  return { rows, issues, counts };
}

/** Czy przypisanie kolumn i miejsce docelowe pozwalają przejść dalej. Zwraca listę braków. */
export function missingForImport(mapping, destination) {
  const missing = [];
  if (mapping.termPL === undefined) missing.push('Przypisz kolumnę z pojęciem po polsku.');
  if (mapping.termEN === undefined) missing.push('Przypisz kolumnę z pojęciem po angielsku.');
  if (mapping.termPL !== undefined && mapping.termPL === mapping.termEN) {
    missing.push('Pojęcie po polsku i po angielsku nie mogą pochodzić z tej samej kolumny.');
  }
  if (destination) {
    for (const level of STRUCTURE_LEVELS) {
      const fromFile = Boolean(destination.useFileStructure) && mapping[level] !== undefined;
      if (!fromFile && collapseWhitespace(destination[level]) === '') {
        missing.push(`Podaj nazwę ${LEVEL_NAMES[level]}.`);
      }
    }
  }
  return missing;
}
