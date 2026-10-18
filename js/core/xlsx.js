// Odczyt i zapis skoroszytów XLSX (Excel, LibreOffice, Numbers, Arkusze Google).
//
// Plik XLSX to archiwum ZIP z dokumentami XML. Czytamy z niego tylko to, czego potrzebuje
// import: listę arkuszy i tekst komórek, a dla arkusza notatek także formatowanie tekstu
// (pogrubienie, kursywa, podkreślenie, przekreślenie, indeksy, kolor, rozmiar) i obrazy –
// wstawione na arkusz (rysunki zakotwiczone przy komórce) albo w komórkę („Umieść w komórce”).
// Formatowanie liczb i dat jest pomijane – liczba trafia do aplikacji w postaci zapisanej w pliku.
//
// Tabela zwracana przez odczyt: { rows: [{ number, cells: string[] }], columnCount },
// gdzie `number` to numer wiersza w arkuszu (od 1), a puste wiersze są pominięte.
// W trybie `rich` wiersz ma też `rich` – fragmenty tekstu komórek z formatowaniem –
// a tabela `images`: [{ row, column, bytes, type, name, inCell }].

import { imageInfo, imageTypeFromName } from './images.js';
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

// ---------------------------------------------------------------- formatowanie tekstu

const RUN_RE = new RegExp(`<${NS}r(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}r>`, 'g');
const RPR_RE = new RegExp(`<${NS}rPr(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}rPr>`);
const FONTS_RE = new RegExp(`<${NS}fonts(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}fonts>`);
const FONT_RE = new RegExp(`<${NS}font(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${NS}font>)`, 'g');
const CELL_XFS_RE = new RegExp(`<${NS}cellXfs(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}cellXfs>`);
const XF_RE = new RegExp(`<${NS}xf(?=[\\s>/])([^>]*?)(?:/>|>[\\s\\S]*?</${NS}xf>)`, 'g');
const INDEXED_COLORS_RE = new RegExp(`<${NS}indexedColors(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}indexedColors>`);
const RGB_COLOR_RE = new RegExp(`<${NS}rgbColor\\b([^>]*)/?>`, 'g');

/** Domyślna paleta indeksowanych kolorów Excela (0–63). */
const INDEXED_COLORS = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'
].map((hex) => `#${hex.toLowerCase()}`);

/** Kolory motywu Office (gdy plik nie ma motywu): tekst/tło, potem akcenty 1–6 i odnośniki. */
const DEFAULT_THEME = ['#ffffff', '#000000', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#0563c1', '#954f72'];
const THEME_NAMES = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

const elementCache = new Map();
/** Wyrażenie dla pustego lub samozamykającego elementu, np. <b/>, <sz val="11"/>. */
function elementRe(name) {
  if (!elementCache.has(name)) elementCache.set(name, new RegExp(`<${NS}${name}(?=[\\s/>])([^>]*)>`));
  return elementCache.get(name);
}

function parseTheme(xml) {
  if (!xml) return DEFAULT_THEME;
  return THEME_NAMES.map((name, index) => {
    const block = new RegExp(`<${NS}${name}>([\\s\\S]*?)</${NS}${name}>`).exec(xml)?.[1] ?? '';
    const rgb = /srgbClr\s+val\s*=\s*["']([0-9A-Fa-f]{6})["']/.exec(block) ?? /lastClr\s*=\s*["']([0-9A-Fa-f]{6})["']/.exec(block);
    return rgb ? `#${rgb[1].toLowerCase()}` : DEFAULT_THEME[index];
  });
}

function resolveColor(attributes, palette) {
  if (attributes.rgb) return `#${attributes.rgb.slice(-6).toLowerCase()}`;
  if (attributes.theme !== undefined) {
    const index = Number(attributes.theme);
    // 0–3: kolory tekstu i tła – czyli „bez koloru”.
    return index >= 4 ? palette.theme[index] ?? null : null;
  }
  if (attributes.indexed !== undefined) {
    const index = Number(attributes.indexed);
    return index < 64 ? palette.indexed[index] ?? null : null;
  }
  return null;
}

/**
 * Właściwości czcionki zapisane w elemencie <font> albo <rPr>. Zwraca tylko właściwości,
 * które są w nim podane – reszta pochodzi z czcionki komórki.
 */
function fontProps(xml, palette) {
  const props = {};
  const flag = (element, key) => {
    const match = elementRe(element).exec(xml);
    if (!match) return;
    const value = /\bval\s*=\s*["']([^"']*)["']/.exec(match[1])?.[1];
    props[key] = value === undefined || !/^(0|false|none)$/i.test(value);
  };
  flag('b', 'b');
  flag('i', 'i');
  flag('u', 'u');
  flag('strike', 's');
  const vertical = elementRe('vertAlign').exec(xml);
  if (vertical) {
    const value = /\bval\s*=\s*["']([^"']*)["']/.exec(vertical[1])?.[1];
    props.sup = value === 'superscript';
    props.sub = value === 'subscript';
  }
  const size = elementRe('sz').exec(xml);
  if (size) {
    const value = Number(/\bval\s*=\s*["']([^"']*)["']/.exec(size[1])?.[1]);
    if (Number.isFinite(value) && value > 0) props.size = value;
  }
  const color = elementRe('color').exec(xml);
  if (color) props.color = resolveColor(parseAttributes(color[1]), palette);
  return props;
}

const PLAIN_FONT = Object.freeze({ b: false, i: false, u: false, s: false, sup: false, sub: false, color: null, size: 11 });

function parseStyles(xml, palette) {
  const fonts = [];
  const fontsXml = xml ? FONTS_RE.exec(xml)?.[1] ?? '' : '';
  for (const match of fontsXml.matchAll(FONT_RE)) fonts.push({ ...PLAIN_FONT, ...fontProps(match[1] ?? '', palette) });
  const fontIDs = [];
  const xfsXml = xml ? CELL_XFS_RE.exec(xml)?.[1] ?? '' : '';
  for (const match of xfsXml.matchAll(XF_RE)) fontIDs.push(Number(/\bfontId\s*=\s*["'](\d+)["']/.exec(match[1])?.[1] ?? 0));
  return {
    cellFont(styleIndex) {
      return fonts[fontIDs[styleIndex] ?? 0] ?? fonts[0] ?? PLAIN_FONT;
    }
  };
}

function parsePalette(stylesXml, themeXml) {
  const indexed = [...INDEXED_COLORS];
  const custom = stylesXml ? INDEXED_COLORS_RE.exec(stylesXml)?.[1] : null;
  if (custom) {
    let index = 0;
    for (const match of custom.matchAll(RGB_COLOR_RE)) {
      const rgb = parseAttributes(match[1]).rgb;
      if (rgb) indexed[index] = `#${rgb.slice(-6).toLowerCase()}`;
      index += 1;
    }
  }
  return { indexed, theme: parseTheme(themeXml) };
}

/** Fragmenty tekstu z elementu <si> lub <is>: [{ text, props }] – props null to czcionka komórki. */
function parseRuns(xml, palette) {
  const source = xml.indexOf('rPh') === -1 ? xml : xml.replace(PHONETIC_RE, '');
  const runs = [];
  for (const match of source.matchAll(RUN_RE)) {
    let text = '';
    for (const part of match[1].matchAll(T_RE)) text += decodeCellText(part[1] ?? '');
    const properties = RPR_RE.exec(match[1]);
    runs.push({ text, props: properties ? fontProps(properties[1], palette) : null });
  }
  if (runs.length === 0) return [{ text: richText(source), props: null }];
  return runs;
}

/**
 * Fragmenty komórki z pełnym formatowaniem. Fragment bez własnych właściwości (<rPr>) ma
 * czcionkę komórki. Właściwości fragmentu są kompletne (tak zapisują Excel i LibreOffice):
 * brak pogrubienia oznacza zwykły tekst – z komórki bierzemy tylko brakujący rozmiar.
 */
function cellRuns(runs, font) {
  return runs.filter((run) => run.text !== '').map((run) => {
    const own = run.props;
    const merged = own
      ? { b: false, i: false, u: false, s: false, sup: false, sub: false, color: null, ...own, size: own.size ?? font.size }
      : font;
    return {
      text: run.text, b: Boolean(merged.b), i: Boolean(merged.i), u: Boolean(merged.u), s: Boolean(merged.s),
      sup: Boolean(merged.sup), sub: Boolean(merged.sub), color: merged.color ?? null, size: merged.size ?? null
    };
  });
}

// ---------------------------------------------------------------- obrazy

const DRAWING_RE = new RegExp(`<${NS}drawing\\b([^>]*)/?>`);
const ANCHOR_RE = new RegExp(`<(${NS})(twoCellAnchor|oneCellAnchor|absoluteAnchor)\\b[^>]*>([\\s\\S]*?)</\\1\\2>`, 'g');
const FROM_RE = new RegExp(`<${NS}from>([\\s\\S]*?)</${NS}from>`);
const COL_RE = new RegExp(`<${NS}col>\\s*(\\d+)\\s*</${NS}col>`);
const ROW_RE = new RegExp(`<${NS}row>\\s*(\\d+)\\s*</${NS}row>`);
const BLIP_RE = new RegExp(`<${NS}blip(?=[\\s/>])([^>]*)>`);
const BK_RE = new RegExp(`<${NS}bk(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}bk>`, 'g');

/** Ścieżka pliku wskazanego w relacji – względem pliku, z którego relacja pochodzi. */
function resolvePath(fromFile, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = fromFile.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

function relationsPath(file) {
  const parts = file.split('/');
  const name = parts.pop();
  return [...parts, '_rels', `${name}.rels`].join('/');
}

function idAttribute(attributes) {
  return attributes['r:id'] ?? attributes['r:embed'] ?? Object.entries(attributes).find(([key]) => key.endsWith(':id') || key.endsWith(':embed'))?.[1] ?? attributes.id;
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

/**
 * rich (opcjonalnie): { styles, sharedRich, palette, cellImage(vm) } – formatowanie tekstu
 * i obrazy w komórkach; bez niego czytany jest sam tekst.
 */
function parseSheet(xml, sharedStrings, rich = null) {
  const rows = [];
  const cellImages = [];
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
      const row = { number: current.number, cells };
      if (rich) {
        row.rich = new Array(length);
        for (let index = 0; index < length; index += 1) row.rich[index] = current.rich[index] ?? [];
      }
      rows.push(row);
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
      current = { number: rowNumber, cells: [], rich: rich ? [] : null };
      nextColumn = 0;
      continue;
    }
    if (!current) continue;
    const attributes = match[2];
    const reference = /\br\s*=\s*["']([A-Z]+)\d+["']/.exec(attributes);
    const column = reference ? columnIndex(reference[1]) : nextColumn;
    nextColumn = column + 1;
    const type = /\bt\s*=\s*["'](\w+)["']/.exec(attributes);
    const kind = type ? type[1] : 'n';
    const text = cellValue(kind, match[3], sharedStrings);
    if (text !== '') current.cells[column] = text;
    if (!rich) continue;

    const valueMetadata = /\bvm\s*=\s*["'](\d+)["']/.exec(attributes);
    if (valueMetadata) {
      const path = rich.cellImage(Number(valueMetadata[1]));
      if (path) cellImages.push({ row: rowNumber, column, path, inCell: true });
    }
    if (text === '') continue;
    const font = rich.styles.cellFont(Number(/\bs\s*=\s*["'](\d+)["']/.exec(attributes)?.[1] ?? 0));
    let runs;
    if (kind === 's') {
      runs = rich.sharedRich[Number(V_RE.exec(match[3])?.[1])] ?? [{ text, props: null }];
    } else if (kind === 'inlineStr') {
      const inline = IS_RE.exec(match[3]);
      runs = inline ? parseRuns(inline[1], rich.palette) : [{ text, props: null }];
    } else {
      runs = [{ text, props: null }];
    }
    current.rich[column] = cellRuns(runs, font);
  }
  finishRow();
  return rich ? { rows, columnCount, cellImages } : { rows, columnCount };
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
  let richContext = null;
  const cache = new Map();

  const readBytes = async (path) => {
    const entry = directory.get(path);
    if (!entry) return null;
    try {
      return await readZipEntry(bytes, entry);
    } catch (error) {
      if (error instanceof ZipError) return null;
      throw error;
    }
  };

  const readRelations = async (file) => {
    const relations = new Map();
    const xml = await readText(relationsPath(file));
    for (const match of (xml ?? '').matchAll(RELATIONSHIP_RE)) {
      const attributes = parseAttributes(match[1]);
      if (attributes.Id && attributes.Target) relations.set(attributes.Id, attributes);
    }
    return relations;
  };

  /** Obrazy „w komórce” (Excel 365): łańcuch metadata.xml → richData → plik obrazu. */
  const loadCellImages = async () => {
    const metadata = await readText('xl/metadata.xml');
    const values = await readText('xl/richData/rdrichvalue.xml');
    if (!metadata || !values) return () => null;
    const types = [...metadata.matchAll(new RegExp(`<${NS}metadataType\\b([^>]*)>`, 'g'))].map((match) => parseAttributes(match[1]).name);
    const futureXml = new RegExp(`<${NS}futureMetadata\\b[^>]*name\\s*=\\s*["']XLRICHVALUE["'][^>]*>([\\s\\S]*?)</${NS}futureMetadata>`).exec(metadata)?.[1] ?? '';
    const future = [...futureXml.matchAll(BK_RE)].map((match) => {
      const block = new RegExp(`<${NS}rvb\\b([^>]*)>`).exec(match[1]);
      return block ? Number(parseAttributes(block[1]).i) : null;
    });
    const valueXml = new RegExp(`<${NS}valueMetadata\\b[^>]*>([\\s\\S]*?)</${NS}valueMetadata>`).exec(metadata)?.[1] ?? '';
    const blocks = [...valueXml.matchAll(BK_RE)].map((match) => {
      const record = new RegExp(`<${NS}rc\\b([^>]*)>`).exec(match[1]);
      const attributes = record ? parseAttributes(record[1]) : {};
      return { type: Number(attributes.t ?? 1), value: Number(attributes.v ?? 0) };
    });
    const richValues = [...values.matchAll(new RegExp(`<${NS}rv\\b([^>]*)>([\\s\\S]*?)</${NS}rv>`, 'g'))].map((match) => ({
      structure: Number(parseAttributes(match[1]).s ?? 0),
      values: [...match[2].matchAll(new RegExp(`<${NS}v(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}v>`, 'g'))].map((value) => decodeXml(value[1]).trim())
    }));
    const structureXml = (await readText('xl/richData/rdrichvaluestructure.xml')) ?? '';
    const structures = [...structureXml.matchAll(new RegExp(`<${NS}s\\b([^>]*)>([\\s\\S]*?)</${NS}s>`, 'g'))].map((match) => (
      [...match[2].matchAll(new RegExp(`<${NS}k\\b([^>]*)>`, 'g'))].map((key) => parseAttributes(key[1]).n)
    ));
    const relationXml = (await readText('xl/richData/richValueRel.xml')) ?? '';
    const relationIDs = [...relationXml.matchAll(new RegExp(`<${NS}rel\\b([^>]*)>`, 'g'))].map((match) => idAttribute(parseAttributes(match[1])));
    const targets = await readRelations('xl/richData/richValueRel.xml');
    return (vm) => {
      const block = blocks[vm - 1];
      if (!block) return null;
      const typeName = types[block.type - 1];
      if (typeName && typeName !== 'XLRICHVALUE') return null;
      const valueIndex = future.length > 0 ? future[block.value] : block.value;
      const value = richValues[valueIndex];
      if (!value) return null;
      const keyIndex = (structures[value.structure] ?? []).indexOf('_rvRel:LocalImageIdentifier');
      if (keyIndex < 0) return null;
      const relation = targets.get(relationIDs[Number(value.values[keyIndex])]);
      if (!relation || /external/i.test(relation.TargetMode ?? '')) return null;
      return resolvePath('xl/richData/richValueRel.xml', relation.Target);
    };
  };

  /** Obrazy wstawione na arkusz: kotwica (komórka lewego górnego rogu) i plik obrazu. */
  const drawingImages = async (sheet, xml) => {
    const drawing = DRAWING_RE.exec(xml);
    if (!drawing) return [];
    const relation = (await readRelations(sheet.path)).get(idAttribute(parseAttributes(drawing[1])));
    if (!relation) return [];
    const drawingPath = resolvePath(sheet.path, relation.Target);
    const drawingXml = await readText(drawingPath);
    if (!drawingXml) return [];
    const targets = await readRelations(drawingPath);
    const images = [];
    for (const anchor of drawingXml.matchAll(ANCHOR_RE)) {
      const blip = BLIP_RE.exec(anchor[3]);
      if (!blip) continue;
      const target = targets.get(idAttribute(parseAttributes(blip[1])));
      if (!target || /external/i.test(target.TargetMode ?? '')) continue;
      const from = FROM_RE.exec(anchor[3])?.[1] ?? '';
      const row = ROW_RE.exec(from);
      const column = COL_RE.exec(from);
      images.push({
        row: row ? Number(row[1]) + 1 : null,
        column: column ? Number(column[1]) : null,
        path: resolvePath(drawingPath, target.Target),
        inCell: false
      });
    }
    return images;
  };

  const loadRichContext = async () => {
    if (richContext) return richContext;
    const stylesXml = await readText('xl/styles.xml');
    const palette = parsePalette(stylesXml, await readText('xl/theme/theme1.xml'));
    const sharedXml = (await readText('xl/sharedStrings.xml')) ?? '';
    const sharedRich = [...sharedXml.matchAll(SI_RE)].map((match) => (match[1] ? parseRuns(match[1], palette) : []));
    richContext = { styles: parseStyles(stylesXml, palette), palette, sharedRich, cellImage: await loadCellImages() };
    return richContext;
  };

  return {
    sheets: sheets.map(({ name, hidden }) => ({ name, hidden })),
    /** Odczyt arkusza; { rich: true } – także formatowanie tekstu i obrazy (arkusz notatek). */
    async readSheet(index, { rich = false } = {}) {
      const sheet = sheets[index];
      if (!sheet) throw new SpreadsheetError('Nie ma takiego arkusza.');
      const key = `${index}:${rich ? 'rich' : 'text'}`;
      if (!cache.has(key)) {
        if (sharedStrings === null) {
          const xml = await readText('xl/sharedStrings.xml');
          sharedStrings = xml ? parseSharedStrings(xml) : [];
        }
        const xml = await readText(sheet.path);
        if (xml === null) throw new SpreadsheetError(`Brak danych arkusza „${sheet.name}” w pliku.`);
        if (!rich) {
          cache.set(key, parseSheet(xml, sharedStrings));
        } else {
          const context = await loadRichContext();
          const { rows, columnCount, cellImages } = parseSheet(xml, sharedStrings, context);
          const references = [...cellImages, ...await drawingImages(sheet, xml)];
          const images = [];
          for (const reference of references) {
            const data = await readBytes(reference.path);
            if (!data || data.byteLength === 0) continue;
            images.push({
              row: reference.row,
              column: reference.column,
              bytes: data,
              type: imageInfo(data).type ?? imageTypeFromName(reference.path),
              name: reference.path.split('/').pop(),
              inCell: reference.inCell
            });
          }
          images.sort((a, b) => (a.row ?? Infinity) - (b.row ?? Infinity) || (a.column ?? 0) - (b.column ?? 0));
          cache.set(key, { rows, columnCount, images });
        }
      }
      return cache.get(key);
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

/** Właściwości fragmentu tekstu w zapisie XLSX (pełne – Excel nie uzupełnia ich z komórki). */
function runPropertiesXml(run) {
  let xml = '<rPr>';
  if (run.b) xml += '<b/>';
  if (run.i) xml += '<i/>';
  if (run.s) xml += '<strike/>';
  if (run.u) xml += '<u/>';
  if (run.sup) xml += '<vertAlign val="superscript"/>';
  else if (run.sub) xml += '<vertAlign val="subscript"/>';
  xml += `<sz val="${run.size ?? 11}"/>`;
  if (run.color && /^#[0-9a-f]{6}$/i.test(run.color)) xml += `<color rgb="FF${run.color.slice(1).toUpperCase()}"/>`;
  else xml += '<color theme="1"/>';
  xml += '<rFont val="Calibri"/><family val="2"/><scheme val="minor"/></rPr>';
  return xml;
}

function textXml(text) {
  // Ciąg wyglądający jak zapis znaku specjalnego (_x000D_) musi zostać oznaczony jako dosłowny.
  const escaped = escapeXml(String(text).replace(/_x([0-9A-Fa-f]{4})_/g, '_x005F_x$1_'));
  const preserve = /^\s|\s$|[\n\t]/.test(escaped) ? ' xml:space="preserve"' : '';
  return `<t${preserve}>${escaped}</t>`;
}

/**
 * Komórka: tekst, liczba, null albo tekst sformatowany { runs: [{ text, b, i, u, s, sup, sub, color, size }] }.
 */
function cellXml(reference, value, style) {
  if (value === null || value === undefined || value === '') return '';
  const styleAttribute = style ? ` s="${style}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
  }
  if (typeof value === 'object' && Array.isArray(value.runs)) {
    const runs = value.runs.filter((run) => run.text !== '');
    if (runs.length === 0) return '';
    const body = runs.map((run) => `<r>${runPropertiesXml(run)}${textXml(run.text)}</r>`).join('');
    return `<c r="${reference}" t="inlineStr"${styleAttribute}><is>${body}</is></c>`;
  }
  return `<c r="${reference}" t="inlineStr"${styleAttribute}><is>${textXml(value)}</is></c>`;
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

const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const DRAWINGML_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
/** Jednostki rysunku: 9525 EMU na piksel (96 dpi). */
const EMU_PER_PIXEL = 9525;
const IMAGE_BOX = { width: 320, height: 220 };
const IMAGE_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/tiff': 'tiff'
};

/** Rozmiar obrazu na arkuszu: mieści się w ramce, zachowuje proporcje. */
function displaySize(image) {
  const width = image.width || IMAGE_BOX.width;
  const height = image.height || IMAGE_BOX.height;
  const scale = Math.min(1, IMAGE_BOX.width / width, IMAGE_BOX.height / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function drawingXml(images, firstMediaIndex) {
  const anchors = images.map((image, index) => {
    const size = displaySize(image);
    const cx = size.width * EMU_PER_PIXEL;
    const cy = size.height * EMU_PER_PIXEL;
    const id = index + 2;
    const name = escapeXml(image.name || `Obraz ${firstMediaIndex + index}`);
    return '<xdr:oneCellAnchor>'
      + `<xdr:from><xdr:col>${image.column}</xdr:col><xdr:colOff>${4 * EMU_PER_PIXEL}</xdr:colOff><xdr:row>${image.row}</xdr:row><xdr:rowOff>${4 * EMU_PER_PIXEL}</xdr:rowOff></xdr:from>`
      + `<xdr:ext cx="${cx}" cy="${cy}"/>`
      + '<xdr:pic>'
      + `<xdr:nvPicPr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>`
      + `<xdr:blipFill><a:blip r:embed="rId${index + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`
      + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>`
      + '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
  }).join('');
  return `${XML_HEADER}<xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="${DRAWINGML_NS}" xmlns:r="${REL_NS}">${anchors}</xdr:wsDr>`;
}

function sheetXml(sheet) {
  const { header, rows = [], columnWidths = [], images = [] } = sheet;
  // Wiersz z obrazem jest na tyle wysoki, żeby obraz się w nim zmieścił (wysokość w punktach).
  const rowHeights = new Map();
  for (const image of images) {
    const points = Math.ceil((displaySize(image).height + 8) * 0.75);
    rowHeights.set(image.row, Math.max(rowHeights.get(image.row) ?? 0, points));
  }
  const rowAttributes = (index) => {
    const height = rowHeights.get(index);
    return height ? ` ht="${height}" customHeight="1"` : '';
  };
  const lines = [];
  lines.push(`<row r="1">${header.map((value, column) => cellXml(`${columnLetters(column)}1`, value, 1)).join('')}</row>`);
  rows.forEach((row, index) => {
    const number = index + 2;
    let cells = '';
    for (let column = 0; column < row.length; column += 1) {
      cells += cellXml(`${columnLetters(column)}${number}`, row[column], 2);
    }
    lines.push(`<row r="${number}"${rowAttributes(index + 1)}>${cells}</row>`);
  });

  const columns = header.map((_, column) => {
    const width = columnWidths[column] ?? 18;
    return `<col min="${column + 1}" max="${column + 1}" width="${width}" customWidth="1"/>`;
  }).join('');

  return `${XML_HEADER}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">`
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${columns}</cols>`
    + `<sheetData>${lines.join('')}</sheetData>`
    + (images.length > 0 ? '<drawing r:id="rId1"/>' : '')
    + '</worksheet>';
}

/**
 * Tworzy skoroszyt. Arkusz: { name, header, rows, columnWidths, images } – `header` to wiersz
 * nagłówków (pogrubiony, zamrożony), `rows` to wiersze danych: teksty, liczby, null albo tekst
 * sformatowany { runs }. `images`: [{ row, column, bytes, type, width, height, name }] – obrazy
 * zakotwiczone przy komórce (row 1 to pierwszy wiersz danych, column 0 to kolumna A).
 * Dawna postać { sheetName, header, rows, columnWidths } tworzy jeden arkusz. Zwraca bajty pliku XLSX.
 */
export async function createWorkbook(options) {
  const sheets = options.sheets ?? [{ name: options.sheetName ?? 'Arkusz1', header: options.header, rows: options.rows, columnWidths: options.columnWidths }];
  const encoder = new TextEncoder();
  const files = [];
  const contentTypes = new Set();
  const overrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
  ];
  const usedNames = new Set();
  let workbookSheets = '';
  let workbookRelations = '';
  let mediaIndex = 0;
  let drawingIndex = 0;

  sheets.forEach((sheet, index) => {
    const number = index + 1;
    let name = safeSheetName(sheet.name ?? `Arkusz${number}`);
    for (let attempt = 2; usedNames.has(name.toLowerCase()); attempt += 1) name = `${name.slice(0, 27)} (${attempt})`;
    usedNames.add(name.toLowerCase());
    workbookSheets += `<sheet name="${escapeXml(name)}" sheetId="${number}" r:id="rId${number}"/>`;
    workbookRelations += `<Relationship Id="rId${number}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${number}.xml"/>`;
    overrides.push(`<Override PartName="/xl/worksheets/sheet${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);

    const images = (sheet.images ?? []).filter((image) => IMAGE_TYPES[image.type] && image.bytes);
    files.push({ name: `xl/worksheets/sheet${number}.xml`, data: encoder.encode(sheetXml({ ...sheet, images })) });
    if (images.length === 0) return;

    drawingIndex += 1;
    const drawingName = `drawing${drawingIndex}.xml`;
    files.push({
      name: `xl/worksheets/_rels/sheet${number}.xml.rels`,
      data: encoder.encode(`${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/drawing" Target="../drawings/${drawingName}"/></Relationships>`)
    });
    let drawingRelations = '';
    images.forEach((image, imageIndex) => {
      mediaIndex += 1;
      const extension = IMAGE_TYPES[image.type];
      contentTypes.add(`<Default Extension="${extension}" ContentType="${image.type}"/>`);
      const mediaName = `image${mediaIndex}.${extension}`;
      const data = image.bytes instanceof Uint8Array ? image.bytes : new Uint8Array(image.bytes);
      files.push({ name: `xl/media/${mediaName}`, data, stored: true });
      drawingRelations += `<Relationship Id="rId${imageIndex + 1}" Type="${REL_NS}/image" Target="../media/${mediaName}"/>`;
    });
    files.push({ name: `xl/drawings/${drawingName}`, data: encoder.encode(drawingXml(images, mediaIndex - images.length + 1)) });
    files.push({ name: `xl/drawings/_rels/${drawingName}.rels`, data: encoder.encode(`${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">${drawingRelations}</Relationships>`) });
    overrides.push(`<Override PartName="/xl/drawings/${drawingName}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
  });
  workbookRelations += `<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>`;

  const workbookXml = `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">`
    + '<bookViews><workbookView/></bookViews>'
    + `<sheets>${workbookSheets}</sheets>`
    + '</workbook>';

  const contentTypesXml = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + [...contentTypes].join('')
    + overrides.join('')
    + '</Types>';

  const rootRelations = `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">`
    + `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>`
    + '</Relationships>';

  return createZip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelations) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(`${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">${workbookRelations}</Relationships>`) },
    { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
    ...files
  ]);
}
