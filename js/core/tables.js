// Tabele (od 1.21). W notatce tabela jest obiektem jak obraz: ma sygnaturę („Tabela 1”, „Tabela 2”…),
// linijka [[sygnatura]] w tekście to jej miejsce w podglądzie, a podpis z numeracją – „Tab. 2. Koszty”
// – stoi nad tabelą (numery tabel liczone osobno od rysunków). W rysunku tabela jest elementem strony
// (core/drawing.js). Tu: sprawdzanie danych, sygnatury, numery, HTML (podgląd, druk, schowek), tekst
// (schowek, arkusz) i tabela z tekstu albo HTML wklejonego z Excela, Worda czy strony WWW.
//
// Tabela: { rows: [[tekst komórki, …], …], header, headerColumn, align, headAlign?, formats?, colWidths? }
//   rows – wiersze o tej samej liczbie komórek, tekst komórki może mieć znaki nowego wiersza;
//   header – pierwszy wiersz to nagłówek (pogrubiony, w podglądzie z tłem; przy podziale na strony
//   powtarzany), headerColumn – pierwsza kolumna to nagłówki wierszy, align – wyrównanie każdej
//   kolumny: 'left' | 'center' | 'right'. Od 1.26: headAlign – wyrównanie wiersza nagłówka (osobno
//   od wartości; brak – jak align), formats – format wartości kolumny (TABLE_FORMATS; brak – tekst),
//   colWidths – udział każdej kolumny w szerokości tabeli (suma 1; brak – z treści).
//   Komórka zostaje zapisana tak, jak ją wpisano – format działa przy pokazywaniu (displayCell).
// Tabela notatki ma dodatkowo label (sygnatura) i caption (podpis, opcjonalny).
//
// Bez zależności od przeglądarki.

import { docFromHtml, htmlFromDoc, noteText } from './note-format.js';
import { cleanImageCaption, cleanImageLabel, labelKey, referenceLabel, referencedLabels } from './note-refs.js';

export const TABLE_MAX_ROWS = 100;
export const TABLE_MAX_COLUMNS = 12;
export const TABLE_CELL_MAX = 500;
/** Najwięcej tabel w jednej notatce. */
export const NOTE_TABLE_LIMIT = 30;
export const TABLE_ALIGNS = Object.freeze(['left', 'center', 'right']);
const DEFAULT_PREFIX = 'Tabela';

/**
 * Formaty wartości kolumny (od 1.26): tekst, liczba całkowita, liczba z separatorem tysięcy i dwoma
 * miejscami po przecinku, waluta (ta sama liczba z symbolem po niej) i data (dd.mm.rrrr).
 */
export const TABLE_FORMATS = Object.freeze([
  { id: 'text', label: 'Tekst', short: 'Abc' },
  { id: 'integer', label: 'Liczba całkowita (1235)', short: '123' },
  { id: 'number', label: 'Liczba (1 234,56)', short: '0,00' },
  { id: 'pln', label: 'Waluta – złoty (1 234,56 zł)', short: 'zł', symbol: 'zł' },
  { id: 'eur', label: 'Waluta – euro (1 234,56 €)', short: '€', symbol: '€' },
  { id: 'usd', label: 'Waluta – dolar (1 234,56 $)', short: '$', symbol: '$' },
  { id: 'gbp', label: 'Waluta – funt (1 234,56 £)', short: '£', symbol: '£' },
  { id: 'chf', label: 'Waluta – frank (1 234,56 CHF)', short: 'CHF', symbol: 'CHF' },
  { id: 'date', label: 'Data (20.10.2026)', short: 'Data' }
]);
const FORMAT_IDS = TABLE_FORMATS.map((format) => format.id);
/** Formaty liczbowe – wartości domyślnie do prawej. */
export const isNumericFormat = (format) => format !== 'text' && format !== 'date' && FORMAT_IDS.includes(format);
const formatOf = (id) => TABLE_FORMATS.find((format) => format.id === id) ?? TABLE_FORMATS[0];
/** Najmniejszy udział kolumny w szerokości tabeli. */
const MIN_COLUMN_SHARE = 0.02;

const cleanCell = (value) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').slice(0, TABLE_CELL_MAX);

/** Pusta tabela rows × columns z wierszem nagłówka. */
export function emptyTable(rows = 3, columns = 3) {
  return {
    rows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => '')),
    header: true,
    headerColumn: false,
    align: Array.from({ length: columns }, () => 'left')
  };
}

/**
 * Sprawdzona tabela albo null: wiersze przycięte do 100, kolumny do 12, komórki – tekst do 500 znaków;
 * krótsze wiersze dopełnione pustymi komórkami.
 */
export function cleanTable(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rows)) return null;
  const rows = raw.rows.slice(0, TABLE_MAX_ROWS).filter(Array.isArray).map((row) => row.slice(0, TABLE_MAX_COLUMNS).map(cleanCell));
  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || columns === 0) return null;
  for (const row of rows) while (row.length < columns) row.push('');
  const align = Array.from({ length: columns }, (_, index) => (TABLE_ALIGNS.includes(raw.align?.[index]) ? raw.align[index] : 'left'));
  const table = {
    rows,
    header: typeof raw.header === 'boolean' ? raw.header : true,
    headerColumn: raw.headerColumn === true,
    align
  };
  // Od 1.26: wyrównanie nagłówka, formaty i szerokości kolumn – zapisane tylko, gdy coś zmieniają.
  if (Array.isArray(raw.headAlign)) {
    const headAlign = align.map((value, index) => (TABLE_ALIGNS.includes(raw.headAlign[index]) ? raw.headAlign[index] : value));
    if (headAlign.some((value, index) => value !== align[index])) table.headAlign = headAlign;
  }
  if (Array.isArray(raw.formats)) {
    const formats = Array.from({ length: columns }, (_, index) => (FORMAT_IDS.includes(raw.formats[index]) ? raw.formats[index] : 'text'));
    if (formats.some((format) => format !== 'text')) table.formats = formats;
  }
  const widths = cleanColumnWidths(raw.colWidths, columns);
  if (widths) table.colWidths = widths;
  return table;
}

/** Udziały kolumn w szerokości (suma 1, każdy co najmniej 2%) albo null – złe dane albo inna liczba kolumn. */
export function cleanColumnWidths(raw, columns) {
  if (!Array.isArray(raw) || raw.length !== columns || columns === 0) return null;
  if (!raw.every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)) return null;
  const total = raw.reduce((sum, value) => sum + value, 0);
  const shares = raw.map((value) => Math.max(MIN_COLUMN_SHARE, value / total));
  const sum = shares.reduce((acc, value) => acc + value, 0);
  return shares.map((value) => Math.round((value / sum) * 10000) / 10000);
}

/**
 * Szerokości po przeciągnięciu granicy między kolumną `column` a następną (od 1.26): `delta` – zmiana
 * udziału lewej kolumny; prawa traci tyle samo (szerokość tabeli bez zmian), żadna nie schodzi poniżej 2%.
 */
export function moveColumnBorder(widths, column, delta) {
  const next = [...widths];
  const pair = next[column] + next[column + 1];
  const left = Math.min(pair - MIN_COLUMN_SHARE, Math.max(MIN_COLUMN_SHARE, next[column] + delta));
  next[column] = left;
  next[column + 1] = pair - left;
  return next;
}

/** Udziały kolumn po wstawieniu kolumny w miejscu `index` (nowa – średniej szerokości) albo null. */
export function widthsWithColumn(widths, index) {
  if (!widths) return null;
  const next = [...widths];
  next.splice(index, 0, 1 / widths.length);
  return cleanColumnWidths(next, next.length);
}

/** Udziały kolumn po usunięciu kolumny `index` albo null. */
export function widthsWithoutColumn(widths, index) {
  if (!widths || widths.length <= 1) return null;
  const next = widths.filter((_, at) => at !== index);
  return cleanColumnWidths(next, next.length);
}

// ---------------------------------------------------------------- formaty wartości (od 1.26)

const SPACES = /[\s\u00a0\u202f\u2009']/g;
const CURRENCY_MARKS = /(zł|pln|eur|usd|gbp|chf|€|\$|£)/gi;

/**
 * Liczba z tekstu komórki albo null: odstępy i apostrofy między cyframi to separator tysięcy, symbol
 * waluty jest pomijany; przecinek – część dziesiętna, kropka też (1.5), ale kilka kropek albo kropki
 * przed przecinkiem – tysiące (1.234.567, 1.234,56); minus „-” albo „−”.
 */
export function parseNumber(text) {
  let source = String(text ?? '').trim().replace(CURRENCY_MARKS, '').replace(SPACES, '').replace(/\u2212/g, '-');
  if (!/^[-+]?(\d+([.,]\d+)*)([.,]\d+)?$/.test(source) && !/^[-+]?[.,]\d+$/.test(source)) return null;
  const commas = (source.match(/,/g) ?? []).length;
  const dots = (source.match(/\./g) ?? []).length;
  if (commas > 0 && dots > 0) {
    const decimal = source.lastIndexOf(',') > source.lastIndexOf('.') ? ',' : '.';
    const group = decimal === ',' ? '.' : ',';
    source = source.split(group).join('').replace(decimal, '.');
  } else if (commas > 1 || dots > 1) {
    source = source.replace(/[.,]/g, '');
  } else {
    source = source.replace(',', '.');
  }
  const value = Number(source);
  return Number.isFinite(value) ? value : null;
}

/** Liczba po polsku: separator tysięcy (twarda spacja), przecinek, `decimals` miejsc, minus „−”. */
export function formatNumber(value, decimals = 2, grouping = true) {
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  const grouped = grouping ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') : whole;
  const negative = value < 0 && Number(fixed) !== 0;
  return `${negative ? '−' : ''}${grouped}${fraction ? `,${fraction}` : ''}`;
}

/** Data z tekstu („2026-10-20”, „20.10.2026”, „20/10/26”, „20-10-2026”) jako „20.10.2026” albo null. */
export function parseDate(text) {
  const source = String(text ?? '').trim();
  let year;
  let month;
  let day;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(source);
  if (match) [, year, month, day] = match.map(Number);
  else {
    match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(source);
    if (!match) return null;
    [, day, month, year] = match.map(Number);
    if (match[3].length === 2) year += 2000;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

/** Komórka nagłówka (wiersz nagłówka albo kolumna nagłówków wierszy) – bez formatu. */
export const isHeadCell = (table, row, column) => (table.header && row === 0) || (table.headerColumn && column === 0);

/**
 * Tekst komórki do pokazania (od 1.26): wartość w formacie kolumny; nagłówki, komórki z kilkoma
 * wierszami i tekst, który nie jest liczbą (datą) – tak, jak je wpisano.
 */
export function displayCell(table, row, column) {
  const text = table.rows[row]?.[column] ?? '';
  const format = formatOf(table.formats?.[column]);
  if (format.id === 'text' || isHeadCell(table, row, column) || text.trim() === '' || text.includes('\n')) return text;
  if (format.id === 'date') return parseDate(text) ?? text;
  const value = parseNumber(text);
  if (value === null) return text;
  if (format.id === 'integer') return formatNumber(Math.round(value), 0, false);
  const number = formatNumber(value, 2, true);
  return format.symbol ? `${number}\u00a0${format.symbol}` : number;
}

/** Wiersze tabeli tak, jak je widać (formaty kolumn). */
export const displayRows = (table) => table.rows.map((row, index) => row.map((_, column) => displayCell(table, index, column)));

/** Wyrównanie komórki: wiersz nagłówka – headAlign (od 1.26), pozostałe – align kolumny. */
export const cellAlign = (table, row, column) => ((table.header && row === 0 ? table.headAlign?.[column] : null) ?? table.align[column] ?? 'left');


/** Wielkość tabeli: { rows, columns }. */
export const tableSize = (table) => ({ rows: table.rows.length, columns: table.rows[0]?.length ?? 0 });

/** Czy tabela nie ma żadnego tekstu. */
export const isEmptyTable = (table) => table.rows.every((row) => row.every((cell) => cell.trim() === ''));

/**
 * Tabela z tekstu wklejonego z arkusza (Excel, Numbers, Google): komórki rozdzielone tabulatorem,
 * wiersze – nowym wierszem; komórka w cudzysłowie może mieć znaki nowego wiersza i cudzysłowy ("").
 * Zwraca wiersze (bez pustego ostatniego wiersza) albo null, gdy tekst nie ma tabulatora ani kilku wierszy.
 */
export function parseTableText(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!source.includes('\t') && !source.trim().includes('\n')) return null;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === '\t') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  while (rows.length > 0 && rows[rows.length - 1].every((value) => value === '')) rows.pop();
  return rows.length > 0 ? rows : null;
}

/**
 * Wiersze pierwszej tabeli z HTML (<table> wklejona z Worda, Excela, strony WWW) albo null. Tekst
 * komórki – bez formatowania (akapity jako nowe wiersze), komórka scalona (colspan) – z pustymi obok.
 */
export function rowsFromHtml(html) {
  const table = /<table\b[\s\S]*?<\/table>/i.exec(String(html ?? ''));
  if (!table) return null;
  const rows = [];
  for (const match of table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/table>)/gi)) {
    const row = [];
    for (const cell of match[1].matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)(?=<t[dh]\b|<\/tr>|$)/gi)) {
      const text = noteText(cell[3].replace(/<\/t[dh]>\s*$/i, '')).replace(/\n{2,}/g, '\n');
      row.push(text);
      const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(cell[2])?.[1] ?? 1);
      for (let extra = 1; extra < Math.min(span, TABLE_MAX_COLUMNS); extra += 1) row.push('');
    }
    if (row.length > 0) rows.push(row);
  }
  return rows.length > 0 ? rows : null;
}

// ---------------------------------------------------------------- tabele notatki

/** Kolejna wolna sygnatura „Tabela N” wśród `labels` (sygnatury obrazów i tabel notatki). */
export function nextTableLabel(labels) {
  const used = new Set(labels.map(labelKey));
  let number = 1;
  while (used.has(labelKey(`${DEFAULT_PREFIX} ${number}`))) number += 1;
  return `${DEFAULT_PREFIX} ${number}`;
}

/**
 * Tabele notatki z sygnaturami: sygnatura zostaje, jeśli jest poprawna i nie powtarza się wśród
 * tabel i obrazów (`taken` – sygnatury obrazów); brakująca albo powtórzona dostaje „Tabela N”.
 */
export function withTableLabels(tables, taken = []) {
  const used = new Set(taken.map(labelKey));
  const labels = tables.map((table) => {
    const label = cleanImageLabel(table?.label);
    const key = labelKey(label);
    if (label === '' || used.has(key)) return null;
    used.add(key);
    return label;
  });
  return tables.map((table, index) => {
    let label = labels[index];
    if (label === null) {
      label = nextTableLabel([...used]);
      used.add(labelKey(label));
    }
    return { ...table, label };
  });
}

/**
 * Sprawdzone tabele notatki (zapis, kopia zapasowa): najwyżej 30, każda z sygnaturą (unikalną także
 * wśród sygnatur obrazów `taken`) i podpisem; złe – pominięte.
 */
export function cleanNoteTables(list, taken = []) {
  if (!Array.isArray(list)) return [];
  const tables = [];
  for (const raw of list.slice(0, NOTE_TABLE_LIMIT)) {
    const table = cleanTable(raw);
    if (!table) continue;
    const caption = cleanImageCaption(raw.caption);
    tables.push({ label: raw.label ?? null, ...(caption ? { caption } : {}), ...table });
  }
  return withTableLabels(tables, taken);
}

/** Numer tabeli (od 0) o tej sygnaturze albo -1. */
export function findTableByLabel(tables, label) {
  const key = labelKey(label);
  return key === '' ? -1 : tables.findIndex((table) => labelKey(table.label) === key);
}

/**
 * Numery tabel („Tab. N.”) według kolejności w podglądzie: tabele z odwołaniem w miejscu pierwszego
 * odwołania, pozostałe przed tekstem (imagesFirst) albo po nim – jak rysunki, ale liczone osobno.
 */
export function tableNumbers(html, tables, imagesFirst = false) {
  const referenced = [];
  for (const label of referencedLabels(html)) {
    const index = findTableByLabel(tables, label);
    if (index >= 0 && !referenced.includes(index)) referenced.push(index);
  }
  const rest = tables.map((_, index) => index).filter((index) => !referenced.includes(index));
  const order = imagesFirst ? [...rest, ...referenced] : [...referenced, ...rest];
  const numbers = [];
  order.forEach((index, position) => { numbers[index] = position + 1; });
  return numbers;
}

/** Podpis nad tabelą: z numeracją – „Tab. 2. Koszty” (bez podpisu – „Tab. 2.”), bez – sam podpis; null – nic. */
export function tableCaption(caption, number, numbered) {
  const text = cleanImageCaption(caption);
  if (numbered) return text ? `Tab. ${number}. ${text}` : `Tab. ${number}.`;
  return text || null;
}

// ---------------------------------------------------------------- HTML i tekst

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cellHtml = (text) => escapeHtml(text).replace(/\n/g, '<br>');

/**
 * Tabela jako HTML: wiersz nagłówka w <thead> (przy druku powtarzany na każdej stronie), nagłówki
 * wierszy jako <th scope="row">, wyrównanie kolumn w stylu. portable – style wprost w komórkach
 * (obramowanie, odstępy, tło nagłówka) dla Worda, OneNote i poczty; rows – zakres wierszy treści
 * [from, to) (podział tabeli między strony podglądu; nagłówek zawsze).
 */
export function tableHtml(table, { portable = false, from = null, to = null } = {}) {
  const border = portable ? 'border:1px solid #9a9a9a;padding:4px 8px;vertical-align:top;' : '';
  const style = (row, column, head) => {
    const value = cellAlign(table, row, column);
    const align = value !== 'left' ? `text-align:${value};` : '';
    const extra = portable && head ? 'background:#f2f2f2;font-weight:bold;' : '';
    const css = `${border}${align}${extra}`;
    return css ? ` style="${css}"` : '';
  };
  const cell = (row, column) => cellHtml(displayCell(table, row, column));
  const bodyStart = table.header ? 1 : 0;
  const start = Math.max(bodyStart, from ?? bodyStart);
  const end = Math.min(table.rows.length, to ?? table.rows.length);
  // Szerokości kolumn (od 1.26) – <colgroup> w procentach; od 1.27 bez stałego układu tabeli: kolumna
  // nie jest węższa niż najdłuższe słowo (na wąskim ekranie słowa i liczby nie łamią się w środku).
  let html = portable ? '<table style="border-collapse:collapse;width:100%">' : '<table class="note-table">';
  if (table.colWidths) html += `<colgroup>${table.colWidths.map((share) => `<col style="width:${Math.round(share * 10000) / 100}%">`).join('')}</colgroup>`;
  if (table.header) {
    html += `<thead><tr>${table.rows[0].map((_, column) => `<th${style(0, column, true)}>${cell(0, column)}</th>`).join('')}</tr></thead>`;
  }
  html += '<tbody>';
  for (let index = start; index < end; index += 1) {
    html += `<tr>${table.rows[index].map((_, column) => (table.headerColumn && column === 0
      ? `<th scope="row"${style(index, column, true)}>${cell(index, column)}</th>`
      : `<td${style(index, column, false)}>${cell(index, column)}</td>`)).join('')}</tr>`;
  }
  return `${html}</tbody></table>`;
}

/** Tabela jako tekst (zwykły tekst schowka): komórki rozdzielone tabulatorem, wiersze – nowym wierszem. */
export function tableText(table) {
  return displayRows(table).map((row) => row.map((cell) => cell.replace(/\n/g, ' ')).join('\t')).join('\n');
}

/** Tabela do czytania na głos (słuchanie, od 1.21): podpis, potem wiersze – niepuste komórki po przecinku. */
export function tableSpeech(table) {
  const caption = cleanImageCaption(table.caption);
  const rows = displayRows(table).map((row) => row.map((cell) => cell.replace(/\s+/g, ' ').trim()).filter((cell) => cell !== '').join(', '))
    .filter((line) => line !== '');
  return caption ? [caption, ...rows] : rows;
}

/** Wiersze tabeli jako linijki tekstu „a | b | c” (arkusz notatek w eksporcie). */
export function tableLines(table) {
  return displayRows(table).map((row) => row.map((cell) => cell.replace(/\n/g, ' ').trim()).join(' | '));
}

/**
 * Treść notatki z tabelami jako tekstem (arkusz notatek w eksporcie – komórka nie ma tabel): akapit
 * z odwołaniem do tabeli zamienia się w podpis i wiersze „a | b | c” (wiersz nagłówka pogrubiony),
 * tabele bez odwołania – na końcu. Bez tabel – treść bez zmian.
 */
export function htmlWithTables(html, tables) {
  if (!tables?.length) return html;
  const doc = docFromHtml(html ?? '');
  const placed = new Set();
  const blocksOf = (table) => {
    const caption = cleanImageCaption(table.caption);
    const runs = [{ text: caption ? `${table.label} – ${caption}` : table.label, i: true }];
    tableLines(table).forEach((line, index) => {
      runs.push({ text: '\n' });
      runs.push(index === 0 && table.header ? { text: line, b: true } : { text: line });
    });
    return { type: 'p', runs };
  };
  const blocks = [];
  for (const block of doc.blocks) {
    const label = block.type === 'p' ? referenceLabel(block.runs.map((run) => run.text).join('')) : null;
    const index = label === null ? -1 : findTableByLabel(tables, label);
    if (index < 0) {
      blocks.push(block);
      continue;
    }
    placed.add(index);
    blocks.push(blocksOf(tables[index]));
  }
  tables.forEach((table, index) => {
    if (!placed.has(index)) blocks.push(blocksOf(table));
  });
  return htmlFromDoc({ blocks });
}
