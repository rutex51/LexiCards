// Tabele (od 1.21). W notatce tabela jest obiektem jak obraz: ma sygnaturę („Tabela 1”, „Tabela 2”…),
// linijka [[sygnatura]] w tekście to jej miejsce w podglądzie, a podpis z numeracją – „Tab. 2. Koszty”
// – stoi nad tabelą (numery tabel liczone osobno od rysunków). W rysunku tabela jest elementem strony
// (core/drawing.js). Tu: sprawdzanie danych, sygnatury, numery, HTML (podgląd, druk, schowek), tekst
// (schowek, arkusz) i tabela z tekstu albo HTML wklejonego z Excela, Worda czy strony WWW.
//
// Tabela: { rows: [[tekst komórki, …], …], header, headerColumn, align }
//   rows – wiersze o tej samej liczbie komórek, tekst komórki może mieć znaki nowego wiersza;
//   header – pierwszy wiersz to nagłówek (pogrubiony, w podglądzie z tłem; przy podziale na strony
//   powtarzany), headerColumn – pierwsza kolumna to nagłówki wierszy, align – wyrównanie każdej
//   kolumny: 'left' | 'center' | 'right'.
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
  return {
    rows,
    header: typeof raw.header === 'boolean' ? raw.header : true,
    headerColumn: raw.headerColumn === true,
    align
  };
}

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
  const style = (column, head) => {
    const align = table.align[column] && table.align[column] !== 'left' ? `text-align:${table.align[column]};` : '';
    const extra = portable && head ? 'background:#f2f2f2;font-weight:bold;' : '';
    const value = `${border}${align}${extra}`;
    return value ? ` style="${value}"` : '';
  };
  const bodyStart = table.header ? 1 : 0;
  const start = Math.max(bodyStart, from ?? bodyStart);
  const end = Math.min(table.rows.length, to ?? table.rows.length);
  let html = portable ? '<table style="border-collapse:collapse;width:100%">' : '<table class="note-table">';
  if (table.header) {
    html += `<thead><tr>${table.rows[0].map((cell, column) => `<th${style(column, true)}>${cellHtml(cell)}</th>`).join('')}</tr></thead>`;
  }
  html += '<tbody>';
  for (let index = start; index < end; index += 1) {
    html += `<tr>${table.rows[index].map((cell, column) => (table.headerColumn && column === 0
      ? `<th scope="row"${style(column, true)}>${cellHtml(cell)}</th>`
      : `<td${style(column, false)}>${cellHtml(cell)}</td>`)).join('')}</tr>`;
  }
  return `${html}</tbody></table>`;
}

/** Tabela jako tekst (zwykły tekst schowka): komórki rozdzielone tabulatorem, wiersze – nowym wierszem. */
export function tableText(table) {
  return table.rows.map((row) => row.map((cell) => cell.replace(/\n/g, ' ')).join('\t')).join('\n');
}

/** Tabela do czytania na głos (słuchanie, od 1.21): podpis, potem wiersze – niepuste komórki po przecinku. */
export function tableSpeech(table) {
  const caption = cleanImageCaption(table.caption);
  const rows = table.rows.map((row) => row.map((cell) => cell.replace(/\s+/g, ' ').trim()).filter((cell) => cell !== '').join(', '))
    .filter((line) => line !== '');
  return caption ? [caption, ...rows] : rows;
}

/** Wiersze tabeli jako linijki tekstu „a | b | c” (arkusz notatek w eksporcie). */
export function tableLines(table) {
  return table.rows.map((row) => row.map((cell) => cell.replace(/\n/g, ' ').trim()).join(' | '));
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
