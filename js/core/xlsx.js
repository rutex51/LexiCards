// Odczyt i zapis skoroszytów XLSX (Excel, LibreOffice, Numbers, Arkusze Google).
//
// Plik XLSX to archiwum ZIP z dokumentami XML. Czytamy z niego tylko to, czego potrzebuje
// import pojęć: listę arkuszy i tekst komórek. Formatowanie liczb i dat jest pomijane –
// liczba trafia do aplikacji w postaci zapisanej w pliku.
//
// Tabela zwracana przez odczyt: { rows: [{ number, cells: string[] }], columnCount },
// gdzie `number` to numer wiersza w arkuszu (od 1), a puste wiersze są pominięte.

import { ZipError, createZip, readZipDirectory, readZipEntry } from './zip.js';

export class SpreadsheetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SpreadsheetError';
  }
}

/** Opcjonalny prefiks przestrzeni nazw – część programów zapisuje np. <x:row>. */
const NS = '(?:[A-Za-z_][\\w.-]*:)?';

const SI_RE = new RegExp(`<${NS}si(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${NS}si>)`, 'g');
const T_RE = new RegExp(`<${NS}t(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${NS}t>)`, 'g');
const PHONETIC_RE = new RegExp(`<${NS}rPh(?:\\s[^>]*)?>[\\s\\S]*?</${NS}rPh>`, 'g');
const V_RE = new RegExp(`<${NS}v(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}v>`);
const IS_RE = new RegExp(`<${NS}is(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}is>`);
const SHEET_RE = new RegExp(`<${NS}sheet(?=[\\s>/])([^>]*)>`, 'g');
const RELATIONSHIP_RE = new RegExp(`<${NS}Relationship(?=[\\s>/])([^>]*)>`, 'g');
const TOKEN_RE = new RegExp(
  `<${NS}row(?=[\\s>/])([^>]*)>|<${NS}c(?=[\\s>/])([^>]*?)(?:/>|>([\\s\\S]*?)</${NS}c>)`, 'g'
);
const ATTRIBUTE_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

// ---------------------------------------------------------------- XML

function decodeXml(text) {
  if (text.indexOf('&') === -1) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (match, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity];
    const code = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

/** Tekst komórki: encje XML, zapis znaków specjalnych _xHHHH_ i ujednolicone końce wierszy. */
function decodeCellText(raw) {
  let text = raw;
  if (text.startsWith('<![CDATA[') && text.endsWith(']]>')) text = text.slice(9, -3);
  else text = decodeXml(text);
  if (text.indexOf('_x') !== -1) {
    text = text.replace(/_x([0-9A-Fa-f]{4})_/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return text.indexOf('\r') === -1 ? text : text.replace(/\r\n?/g, '\n');
}

function parseAttributes(source) {
  const result = {};
  for (const match of source.matchAll(ATTRIBUTE_RE)) {
    result[match[1]] = decodeXml(match[2] ?? match[3] ?? '');
  }
  return result;
}

/** Tekst z elementu <si> lub <is>: wszystkie fragmenty <t>, bez zapisu fonetycznego. */
function richText(xml) {
  const source = xml.indexOf('rPh') === -1 ? xml : xml.replace(PHONETIC_RE, '');
  let text = '';
  for (const match of source.matchAll(T_RE)) text += decodeCellText(match[1] ?? '');
  return text;
}

// ---------------------------------------------------------------- odczyt

function columnIndex(letters) {
  let index = 0;
  for (let position = 0; position < letters.length; position += 1) {
    index = index * 26 + (letters.charCodeAt(position) - 64);
  }
  return index - 1;
}

function formatNumber(raw) {
  const text = raw.trim();
  if (text === '') return '';
  const value = Number(text);
  return Number.isFinite(value) ? String(value) : text;
}

function parseSharedStrings(xml) {
  const strings = [];
  for (const match of xml.matchAll(SI_RE)) strings.push(match[1] ? richText(match[1]) : '');
  return strings;
}

function cellValue(type, body, sharedStrings) {
  if (!body) return '';
  if (type === 'inlineStr') {
    const inline = IS_RE.exec(body);
    return inline ? richText(inline[1]) : '';
  }
  const value = V_RE.exec(body);
  if (!value) return '';
  switch (type) {
    case 's': return sharedStrings[Number(value[1])] ?? '';
    case 'str':
    case 'd': return decodeCellText(value[1]);
    case 'b': return value[1].trim() === '1' ? 'TRUE' : 'FALSE';
    case 'e': return '';
    default: return formatNumber(decodeXml(value[1]));
  }
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  let columnCount = 0;
  let rowNumber = 0;
  let current = null;
  let nextColumn = 0;

  const finishRow = () => {
    if (!current) return;
    let length = current.cells.length;
    while (length > 0 && (current.cells[length - 1] ?? '').trim() === '') length -= 1;
    if (length > 0) {
      const cells = new Array(length);
      for (let index = 0; index < length; index += 1) cells[index] = current.cells[index] ?? '';
      rows.push({ number: current.number, cells });
      if (length > columnCount) columnCount = length;
    }
    current = null;
  };

  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(xml)) !== null) {
    if (match[1] !== undefined) {
      finishRow();
      const declared = /\br\s*=\s*["'](\d+)["']/.exec(match[1]);
      rowNumber = declared ? Number(declared[1]) : rowNumber + 1;
      current = { number: rowNumber, cells: [] };
      nextColumn = 0;
      continue;
    }
    if (!current) continue;
    const attributes = match[2];
    const reference = /\br\s*=\s*["']([A-Z]+)\d+["']/.exec(attributes);
    const column = reference ? columnIndex(reference[1]) : nextColumn;
    nextColumn = column + 1;
    const type = /\bt\s*=\s*["'](\w+)["']/.exec(attributes);
    const text = cellValue(type ? type[1] : 'n', match[3], sharedStrings);
    if (text !== '') current.cells[column] = text;
  }
  finishRow();
  return { rows, columnCount };
}

function resolveTarget(target) {
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

/**
 * Otwiera skoroszyt. Zwraca { sheets: [{ name, hidden }], readSheet(index) → tabela }.
 * Arkusze są czytane dopiero na żądanie.
 */
export async function openWorkbook(bytes) {
  let directory;
  try {
    directory = readZipDirectory(bytes);
  } catch (error) {
    if (error instanceof ZipError) throw new SpreadsheetError('To nie jest plik XLSX.');
    throw error;
  }
  const workbookEntry = directory.get('xl/workbook.xml');
  if (!workbookEntry) throw new SpreadsheetError('To nie jest skoroszyt XLSX (brak arkuszy w pliku).');

  const decoder = new TextDecoder('utf-8');
  const readText = async (path) => {
    const entry = directory.get(path);
    if (!entry) return null;
    try {
      return decoder.decode(await readZipEntry(bytes, entry));
    } catch (error) {
      if (error instanceof ZipError) throw new SpreadsheetError(error.message);
      throw error;
    }
  };

  const workbookXml = await readText('xl/workbook.xml');
  const relationsXml = (await readText('xl/_rels/workbook.xml.rels')) ?? '';
  const targets = new Map();
  for (const match of relationsXml.matchAll(RELATIONSHIP_RE)) {
    const attributes = parseAttributes(match[1]);
    if (attributes.Id && attributes.Target) targets.set(attributes.Id, attributes);
  }

  const sheets = [];
  for (const match of workbookXml.matchAll(SHEET_RE)) {
    const attributes = parseAttributes(match[1]);
    const relationID = attributes['r:id'] ?? Object.entries(attributes).find(([key]) => key.endsWith(':id'))?.[1];
    const relation = targets.get(relationID);
    // Arkusze wykresów nie mają komórek.
    if (!relation || /chartsheet|dialogsheet/i.test(relation.Type ?? '')) continue;
    sheets.push({
      name: attributes.name ?? `Arkusz ${sheets.length + 1}`,
      hidden: Boolean(attributes.state && attributes.state !== 'visible'),
      path: resolveTarget(relation.Target)
    });
  }
  if (sheets.length === 0) throw new SpreadsheetError('Skoroszyt nie zawiera arkuszy z danymi.');

  let sharedStrings = null;
  const cache = new Map();

  return {
    sheets: sheets.map(({ name, hidden }) => ({ name, hidden })),
    async readSheet(index) {
      const sheet = sheets[index];
      if (!sheet) throw new SpreadsheetError('Nie ma takiego arkusza.');
      if (!cache.has(index)) {
        if (sharedStrings === null) {
          const xml = await readText('xl/sharedStrings.xml');
          sharedStrings = xml ? parseSharedStrings(xml) : [];
        }
        const xml = await readText(sheet.path);
        if (xml === null) throw new SpreadsheetError(`Brak danych arkusza „${sheet.name}” w pliku.`);
        cache.set(index, parseSheet(xml, sharedStrings));
      }
      return cache.get(index);
    }
  };
}

// ---------------------------------------------------------------- zapis

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Znaki sterujące niedozwolone w XML 1.0. */
const INVALID_XML_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(text) {
  const source = String(text);
  // Samotna połówka pary zastępczej dałaby niepoprawny plik – zamieniamy ją na znak zastępczy.
  const wellFormed = typeof source.toWellFormed === 'function' ? source.toWellFormed() : source;
  return wellFormed
    .replace(INVALID_XML_RE, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnLetters(index) {
  let letters = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    letters = String.fromCharCode(65 + ((value - 1) % 26)) + letters;
  }
  return letters;
}

/** Nazwa arkusza: najwyżej 31 znaków, bez znaków zakazanych przez Excel. */
export function safeSheetName(name) {
  const cleaned = String(name ?? '').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '');
  return (cleaned || 'Arkusz1').slice(0, 31);
}

function cellXml(reference, value, style) {
  if (value === null || value === undefined || value === '') return '';
  const styleAttribute = style ? ` s="${style}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
  }
  // Ciąg wyglądający jak zapis znaku specjalnego (_x000D_) musi zostać oznaczony jako dosłowny.
  const text = escapeXml(String(value).replace(/_x([0-9A-Fa-f]{4})_/g, '_x005F_x$1_'));
  const preserve = /^\s|\s$|[\n\t]/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${reference}" t="inlineStr"${styleAttribute}><is><t${preserve}>${text}</t></is></c>`;
}

const STYLES_XML = `${XML_HEADER}<styleSheet xmlns="${MAIN_NS}">`
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

/**
 * Tworzy skoroszyt z jednym arkuszem. `header` to wiersz nagłówków (pogrubiony, zamrożony),
 * `rows` to wiersze danych – teksty, liczby albo null. Zwraca bajty pliku XLSX.
 */
export async function createWorkbook({ sheetName = 'Arkusz1', header, rows, columnWidths = [] }) {
  const lines = [];
  lines.push(`<row r="1">${header.map((value, column) => cellXml(`${columnLetters(column)}1`, value, 1)).join('')}</row>`);
  rows.forEach((row, index) => {
    const number = index + 2;
    let cells = '';
    for (let column = 0; column < row.length; column += 1) {
      cells += cellXml(`${columnLetters(column)}${number}`, row[column], 2);
    }
    lines.push(`<row r="${number}">${cells}</row>`);
  });

  const columns = header.map((_, column) => {
    const width = columnWidths[column] ?? 18;
    return `<col min="${column + 1}" max="${column + 1}" width="${width}" customWidth="1"/>`;
  }).join('');

  const sheetXml = `${XML_HEADER}<worksheet xmlns="${MAIN_NS}">`
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${columns}</cols>`
    + `<sheetData>${lines.join('')}</sheetData>`
    + '</worksheet>';

  const workbookXml = `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">`
    + '<bookViews><workbookView/></bookViews>'
    + `<sheets><sheet name="${escapeXml(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>`
    + '</workbook>';

  const contentTypes = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>';

  const rootRelations = `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">`
    + `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>`
    + '</Relationships>';

  const workbookRelations = `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">`
    + `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>`
    + `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>`
    + '</Relationships>';

  const encoder = new TextEncoder();
  return createZip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRelations) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelations) },
    { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheetXml) }
  ]);
}
