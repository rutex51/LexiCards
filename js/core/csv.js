// Odczyt i zapis plików CSV.
//
// Pliki CSV z polskiego Excela bywają zapisane w Windows-1250 i rozdzielone średnikami,
// a eksporty z innych programów w UTF-8 z przecinkami – dlatego kodowanie i separator
// są wykrywane, a użytkownik może je poprawić w kreatorze importu.
//
// Tabela zwracana przez odczyt: { rows: [{ number, cells: string[] }], columnCount },
// gdzie `number` to numer rekordu (taki, jaki pokazuje Excel), a puste rekordy są pominięte.

export const ENCODINGS = Object.freeze([
  { id: 'utf-8', label: 'UTF-8' },
  { id: 'windows-1250', label: 'Windows-1250' },
  { id: 'iso-8859-2', label: 'ISO-8859-2' },
  { id: 'utf-16le', label: 'UTF-16' }
]);

export const DELIMITERS = Object.freeze([
  { id: ';', label: 'Średnik' },
  { id: ',', label: 'Przecinek' },
  { id: '\t', label: 'Tabulator' },
  { id: '|', label: 'Kreska pionowa' }
]);

// ---------------------------------------------------------------- kodowanie

/** Bajty polskich liter, którymi różnią się Windows-1250 i ISO-8859-2 (ą ś ź Ą Ś Ź). */
const WINDOWS_1250_MARKS = new Set([0xb9, 0x9c, 0x9f, 0xa5, 0x8c, 0x8f]);
const ISO_8859_2_MARKS = new Set([0xb1, 0xb6, 0xbc, 0xa1, 0xa6, 0xac]);

function looksLikeUtf8(bytes) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Rozpoznaje kodowanie tekstu: znacznik BOM, poprawność UTF-8, a na końcu polskie litery. */
export function detectEncoding(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';

  // UTF-16 bez znacznika: w tekście łacińskim co drugi bajt jest zerem.
  const sample = bytes.subarray(0, Math.min(bytes.length, 4000));
  let zerosEven = 0;
  let zerosOdd = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] === 0) {
      if (index % 2 === 0) zerosEven += 1;
      else zerosOdd += 1;
    }
  }
  const pairs = sample.length / 2;
  if (pairs >= 8 && zerosOdd > pairs * 0.3 && zerosEven < pairs * 0.05) return 'utf-16le';
  if (pairs >= 8 && zerosEven > pairs * 0.3 && zerosOdd < pairs * 0.05) return 'utf-16be';

  if (looksLikeUtf8(bytes)) return 'utf-8';

  let windows = 0;
  let iso = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte < 0x80) continue;
    if (WINDOWS_1250_MARKS.has(byte)) windows += 1;
    else if (ISO_8859_2_MARKS.has(byte)) iso += 1;
  }
  return iso > windows ? 'iso-8859-2' : 'windows-1250';
}

/** Zamienia bajty na tekst w podanym kodowaniu (znacznik BOM jest usuwany). */
export function decodeText(bytes, encoding) {
  const text = new TextDecoder(encoding).decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ---------------------------------------------------------------- odczyt

const QUOTE = 34;
const LF = 10;
const CR = 13;

/** Wiersz „sep=;” dopisywany przez Excela na początku pliku: zwraca separator albo null. */
export function separatorDirective(text) {
  const match = /^sep=(.)\r?(?:\n|$)/i.exec(text);
  return match ? match[1] : null;
}

function parseRecords(text, delimiter, limit) {
  const delimiterCode = delimiter.charCodeAt(0);
  const length = text.length;
  const records = [];
  let cells = [];
  let index = 0;

  const isBreak = (code) => code === delimiterCode || code === LF || code === CR;

  while (index <= length) {
    if (index < length && text.charCodeAt(index) === QUOTE) {
      // Pole w cudzysłowie: może zawierać separator, nowe wiersze i podwojony cudzysłów.
      let value = '';
      index += 1;
      let segment = index;
      for (;;) {
        const quote = text.indexOf('"', index);
        if (quote === -1) {
          value += text.slice(segment);
          index = length;
          break;
        }
        if (text.charCodeAt(quote + 1) === QUOTE) {
          value += text.slice(segment, quote + 1);
          index = quote + 2;
          segment = index;
          continue;
        }
        value += text.slice(segment, quote);
        index = quote + 1;
        break;
      }
      const rest = index;
      while (index < length && !isBreak(text.charCodeAt(index))) index += 1;
      if (index > rest) value += text.slice(rest, index);
      cells.push(value.indexOf('\r') === -1 ? value : value.replace(/\r\n?/g, '\n'));
    } else {
      const start = index;
      while (index < length && !isBreak(text.charCodeAt(index))) index += 1;
      cells.push(text.slice(start, index));
    }

    if (index < length && text.charCodeAt(index) === delimiterCode) {
      index += 1;
      continue;
    }

    records.push(cells);
    cells = [];
    if (records.length >= limit || index >= length) break;
    index += text.charCodeAt(index) === CR && text.charCodeAt(index + 1) === LF ? 2 : 1;
    if (index >= length) break; // plik kończy się znakiem nowego wiersza
  }
  return records;
}

/**
 * Wybiera separator, przy którym początkowe rekordy mają najbardziej równą
 * (i większą niż jeden) liczbę pól.
 */
export function detectDelimiter(text) {
  const directive = separatorDirective(text);
  if (directive) return directive;
  const sample = text.slice(0, 200_000);
  let best = { delimiter: ';', score: 0 };
  for (const { id: delimiter } of DELIMITERS) {
    const records = parseRecords(sample, delimiter, 60).filter((cells) => cells.some((cell) => cell.trim() !== ''));
    // Ostatni rekord próbki mógł zostać ucięty w połowie.
    if (records.length > 3 && sample.length < text.length) records.pop();
    if (records.length === 0) continue;
    const frequency = new Map();
    for (const cells of records) frequency.set(cells.length, (frequency.get(cells.length) ?? 0) + 1);
    let modal = 1;
    let modalCount = 0;
    for (const [count, times] of frequency) {
      if (times > modalCount || (times === modalCount && count > modal)) {
        modal = count;
        modalCount = times;
      }
    }
    if (modal < 2) continue;
    const consistency = modalCount / records.length;
    const score = consistency * consistency * (modal - 1);
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

/** Czyta tekst CSV do tabeli. */
export function parseCsv(text, delimiter = ';') {
  // Wiersz „sep=;” nie jest danymi – Excel też go nie pokazuje.
  const source = separatorDirective(text) ? text.slice(text.indexOf('\n') + 1) : text;
  const records = parseRecords(source, delimiter, Infinity);
  const rows = [];
  let columnCount = 0;
  records.forEach((cells, index) => {
    let length = cells.length;
    while (length > 0 && cells[length - 1].trim() === '') length -= 1;
    if (length === 0) return;
    rows.push({ number: index + 1, cells: length === cells.length ? cells : cells.slice(0, length) });
    if (length > columnCount) columnCount = length;
  });
  return { rows, columnCount };
}

// ---------------------------------------------------------------- zapis

/**
 * Zapisuje wiersze jako tekst CSV. Pola z separatorem, cudzysłowem, nowym wierszem
 * albo spacją na brzegu trafiają w cudzysłów.
 */
export function writeCsv(lines, { delimiter = ';' } = {}) {
  const special = (text) => text.includes(delimiter) || text.includes('"') || text.includes('\n')
    || text.includes('\r') || /^\s|\s$/.test(text);
  return lines.map((cells) => cells.map((value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return special(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(delimiter)).join('\r\n') + '\r\n';
}

/** Bajty pliku CSV w UTF-8 ze znacznikiem BOM (po nim Excel poprawnie pokazuje polskie znaki). */
export function encodeCsv(text) {
  const body = new TextEncoder().encode(text);
  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xef, 0xbb, 0xbf], 0);
  bytes.set(body, 3);
  return bytes;
}
