// Plik PDF z prawdziwym tekstem (od 1.28) – bez bibliotek i bez przeglądarki: strony A4, tekst
// krojami Helvetica (tekst notatki) i Times (wzory), znaki greckie i matematyczne krojem Symbol,
// prostokąty, ścieżki (linie, krzywe), obrazy (JPEG albo piksele RGB) i linki. Tekst da się
// zaznaczyć, skopiować i wyszukać (ToUnicode).
//
// Kroje: wbudowane czcionki PDF – bez osadzania pliku czcionki, więc plik jest mały. Kodowanie
// Helvetica i Times – WinAnsi (znaki łacińskie, cudzysłowy, kreski, °, ±, ×, €…); polskie litery
// zajmują rzadko używane miejsca 0x81–0x9C (Differences), a wyparte z nich znaki (›, Š, œ…) – kody
// poniżej 32. Znaki spoza kodowania: grecki i matematyczny – krój Symbol, inne litery ze znakami
// diakrytycznymi – bez nich (č → c), reszta – „?”. Szerokości znaków podaje wywołujący (pomiar
// w przeglądarce tym samym krojem, którym notatka jest złożona) – tekst w PDF leży dokładnie tam,
// gdzie w układzie.
//
// Strona ma układ PDF: x w prawo, y w górę, od lewego dolnego rogu, jednostka – punkt (1/72 cala).

/** Strona A4 w punktach. */
export const A4 = Object.freeze({ width: 595.28, height: 841.89 });

/** Odmiany krojów: Helvetica (tekst), Times (wzory), Symbol (znaki greckie i matematyczne). */
export const PDF_FONTS = Object.freeze({
  regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', boldItalic: 'Helvetica-BoldOblique',
  serif: 'Times-Roman', serifBold: 'Times-Bold', serifItalic: 'Times-Italic', serifBoldItalic: 'Times-BoldItalic',
  symbol: 'Symbol'
});
const VARIANTS = Object.keys(PDF_FONTS);

// ---------------------------------------------------------------- kodowanie znaków

/** WinAnsi 0x80–0x9F (reszta – jak Latin-1) bez miejsc zajętych przez polskie litery. */
const WIN_ANSI_HIGH = {
  0x80: '€', 0x82: '‚', 0x84: '„', 0x85: '…', 0x89: '‰', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x99: '™',
  0x9e: 'ž', 0x9f: 'Ÿ'
};
/** Polskie litery w wolnych i rzadkich miejscach WinAnsi: [kod, znak, nazwa glifu]. */
const POLISH = [
  [0x81, 'Ą', 'Aogonek'], [0x83, 'ą', 'aogonek'], [0x86, 'Ć', 'Cacute'], [0x87, 'ć', 'cacute'],
  [0x88, 'Ę', 'Eogonek'], [0x8a, 'ę', 'eogonek'], [0x8b, 'Ł', 'Lslash'], [0x8c, 'ł', 'lslash'],
  [0x8d, 'Ń', 'Nacute'], [0x8e, 'ń', 'nacute'], [0x8f, 'Ś', 'Sacute'], [0x90, 'ś', 'sacute'],
  [0x98, 'Ź', 'Zacute'], [0x9a, 'ź', 'zacute'], [0x9b, 'Ż', 'Zdotaccent'], [0x9c, 'ż', 'zdotaccent']
];

/**
 * Znaki WinAnsi z miejsc zajętych przez polskie litery – w wolnych kodach poniżej 32 (bez kodów
 * tabulatora i końca wiersza): [kod, znak, nazwa glifu].
 */
const DISPLACED = [
  [0x01, 'ƒ', 'florin'], [0x02, '†', 'dagger'], [0x03, '‡', 'daggerdbl'], [0x04, 'ˆ', 'circumflex'],
  [0x05, 'Š', 'Scaron'], [0x06, '‹', 'guilsinglleft'], [0x07, 'Œ', 'OE'], [0x08, 'Ž', 'Zcaron'],
  [0x0e, '˜', 'tilde'], [0x0f, 'š', 'scaron'], [0x10, '›', 'guilsinglright'], [0x11, 'œ', 'oe']
];
/** Różnice względem WinAnsi: [kod, znak, nazwa glifu]. */
const DIFFERENCES = [...DISPLACED, ...POLISH];

/** Znak każdego kodu Helvetica i Times (1–255) – do szerokości i ToUnicode. */
export const LATIN_CODES = (() => {
  const codes = new Map();
  for (const [code, char] of DISPLACED) codes.set(code, char);
  for (let code = 32; code <= 126; code += 1) codes.set(code, String.fromCharCode(code));
  for (const [code, char] of Object.entries(WIN_ANSI_HIGH)) codes.set(Number(code), char);
  for (const [code, char] of POLISH) codes.set(code, char);
  for (let code = 0xa1; code <= 0xff; code += 1) if (code !== 0xad) codes.set(code, String.fromCharCode(code));
  return codes;
})();
const LATIN_LOOKUP = new Map([...LATIN_CODES].map(([code, char]) => [char, code]));
// Spacje twarde i wąskie – zwykła; łącznik niełamiący – dywiz.
for (const char of ['\u00a0', '\u202f', '\u2009', '\u2007']) LATIN_LOOKUP.set(char, 0x20);
LATIN_LOOKUP.set('\u2011', 0x2d);
/** Znaki niewidoczne (miękki dywiz, spacja zerowej szerokości…) – pomijane. */
const INVISIBLE = /[\u00ad\u200b-\u200d\u2060\u2061\ufeff]/;

/** Krój Symbol: znak → kod (kodowanie wbudowane kroju). Minus – z kroju Symbol (dłuższy niż dywiz). */
const SYMBOL_CODES = new Map(Object.entries({
  Α: 0x41, Β: 0x42, Χ: 0x43, Δ: 0x44, Ε: 0x45, Φ: 0x46, Γ: 0x47, Η: 0x48, Ι: 0x49, ϑ: 0x4a, Κ: 0x4b, Λ: 0x4c, Μ: 0x4d,
  Ν: 0x4e, Ο: 0x4f, Π: 0x50, Θ: 0x51, Ρ: 0x52, Σ: 0x53, Τ: 0x54, Υ: 0x55, ς: 0x56, Ω: 0x57, Ξ: 0x58, Ψ: 0x59, Ζ: 0x5a,
  α: 0x61, β: 0x62, χ: 0x63, δ: 0x64, ε: 0x65, φ: 0x66, γ: 0x67, η: 0x68, ι: 0x69, ϕ: 0x6a, κ: 0x6b, λ: 0x6c, μ: 0x6d,
  ν: 0x6e, ο: 0x6f, π: 0x70, θ: 0x71, ρ: 0x72, σ: 0x73, τ: 0x74, υ: 0x75, ϖ: 0x76, ω: 0x77, ξ: 0x78, ψ: 0x79, ζ: 0x7a,
  '∀': 0x22, '∃': 0x24, '∋': 0x27, '∗': 0x2a, '−': 0x2d, '≅': 0x40, '∴': 0x5c, '⊥': 0x5e, '∼': 0x7e,
  '′': 0xa2, '≤': 0xa3, '∞': 0xa5, '↔': 0xab, '←': 0xac, '↑': 0xad, '→': 0xae, '↓': 0xaf, '″': 0xb2, '≥': 0xb3,
  '∝': 0xb5, '∂': 0xb6, '≠': 0xb9, '≡': 0xba, '≈': 0xbb, '⊗': 0xc4, '⊕': 0xc5, '∅': 0xc6, '⌀': 0xc6, '∩': 0xc7, '∪': 0xc8,
  '⊃': 0xc9, '⊇': 0xca, '⊄': 0xcb, '⊂': 0xcc, '⊆': 0xcd, '∈': 0xce, '∉': 0xcf, '∠': 0xd0, '∇': 0xd1, '∏': 0xd5, '√': 0xd6,
  '⋅': 0xd7, '¬': 0xd8, '∧': 0xd9, '∨': 0xda, '⇔': 0xdb, '⇐': 0xdc, '⇑': 0xdd, '⇒': 0xde, '⇓': 0xdf, '◊': 0xe0, '⟨': 0xe1,
  '∑': 0xe5, '⟩': 0xf1, '∫': 0xf2
}));
/** Znak każdego kodu Symbol – do ToUnicode (⌀ i ∅ mają ten sam glif – kopiuje się ∅). */
const SYMBOL_UNICODE = new Map([...SYMBOL_CODES].filter(([char]) => char !== '⌀').map(([char, code]) => [code, char]));

/** Czy znak trafi do PDF bez zmiany (krój łaciński, Symbol, odstęp albo znak niewidoczny). */
export function encodable(char) {
  return LATIN_LOOKUP.has(char) || SYMBOL_CODES.has(char) || INVISIBLE.test(char) || /\s/.test(char);
}

/**
 * Tekst jako odcinki krojów: [{ font: 'latin' | 'symbol', codes: [kod, …], text }]. Znaki spoza obu
 * krojów: litera ze znakiem diakrytycznym bez niego (č → c), odstęp – spacja, inne – „?”.
 */
export function encodeText(text) {
  const runs = [];
  const push = (font, code, char) => {
    const last = runs.at(-1);
    if (last && last.font === font) {
      last.codes.push(code);
      last.text += char;
    } else runs.push({ font, codes: [code], text: char });
  };
  for (const char of String(text)) {
    if (INVISIBLE.test(char)) continue;
    if (LATIN_LOOKUP.has(char)) {
      push('latin', LATIN_LOOKUP.get(char), char);
    } else if (SYMBOL_CODES.has(char)) {
      push('symbol', SYMBOL_CODES.get(char), char);
    } else {
      const base = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (base !== char && base !== '' && [...base].every((part) => LATIN_LOOKUP.has(part))) {
        for (const part of base) push('latin', LATIN_LOOKUP.get(part), part);
      } else if (/\s/.test(char)) {
        push('latin', 0x20, ' ');
      } else {
        push('latin', 0x3f, '?');
      }
    }
  }
  return runs;
}

// ---------------------------------------------------------------- zapis

const encoder = new TextEncoder();
const hex2 = (value) => value.toString(16).padStart(2, '0');
/** Liczba w zapisie PDF: najwyżej dwa miejsca po kropce, bez „-0”. */
export const num = (value) => {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
/** Napis UTF-16BE ze znacznikiem kolejności bajtów (tytuł dokumentu). */
const utf16 = (text) => `<FEFF${[...String(text)].map((char) => {
  const code = char.codePointAt(0);
  if (code <= 0xffff) return code.toString(16).padStart(4, '0');
  const value = code - 0x10000;
  return (0xd800 + (value >> 10)).toString(16) + (0xdc00 + (value & 0x3ff)).toString(16);
}).join('').toUpperCase()}>`;
/** Napis literałowy PDF (adres linku): tylko ASCII, nawiasy i ukośnik wstecz poprzedzone \. */
const literal = (text) => `(${String(text).replace(/[^\x20-\x7e]/g, (char) => encodeURIComponent(char)).replace(/[\\()]/g, (char) => `\\${char}`)})`;
const color = (rgb) => rgb.map((value) => num(value / 255)).join(' ');
const CAPS = { butt: 0, round: 1, square: 2 };
const JOINS = { miter: 0, round: 1, bevel: 2 };

/** Mapa ToUnicode: kod → znak (bfchar, po 100 w bloku). */
function toUnicode(entries) {
  const lines = ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def', '/CMapName /LexiCards def', '/CMapType 2 def',
    '1 begincodespacerange', '<00> <FF>', 'endcodespacerange'];
  for (let start = 0; start < entries.length; start += 100) {
    const block = entries.slice(start, start + 100);
    lines.push(`${block.length} beginbfchar`);
    for (const [code, char] of block) {
      const units = [...char].map((part) => part.codePointAt(0).toString(16).padStart(4, '0')).join('');
      lines.push(`<${hex2(code)}> <${units}>`);
    }
    lines.push('endbfchar');
  }
  lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
  return lines.join('\n');
}

/**
 * Nowy dokument. widths(variant, char) → szerokość znaku na 1000 jednostek wielkości (pomiar
 * krojem układu; variant – klucz PDF_FONTS); compress(bytes) → Promise<bajty zlib> albo null (bez
 * kompresji). Strony: addPage() → { text, rect, line, path, image, link, save, restore, clip };
 * obrazy: addImage({ bytes, width, height, format: 'jpeg' | 'rgb' }).
 */
export function createPdf({ title = '', widths, compress = null }) {
  const pages = [];
  const images = [];
  const used = new Set();

  const fontKey = (variant) => `F${VARIANTS.indexOf(variant) + 1}`;
  const runWidth = (run, variant, size) => [...run.text].reduce((sum, char) => sum + widths(run.font === 'symbol' ? 'symbol' : variant, char), 0) * size / 1000;

  /** Szerokość napisu w punktach (np. do wyśrodkowania numeru strony). */
  function textWidth(text, { variant = 'regular', size = 11 } = {}) {
    return encodeText(text).reduce((sum, run) => sum + runWidth(run, variant, size), 0);
  }

  function addImage({ bytes, width, height, format = 'jpeg' }) {
    images.push({ bytes, width, height, format, name: `Im${images.length + 1}` });
    return images.at(-1).name;
  }

  function addPage() {
    const ops = [];
    const links = [];
    // Ostatnio ustawiony krój i kolor – bez powtarzania przy każdym wyrazie (q/Q je zerują).
    let state = {};
    const page = {
      ops, links,
      /**
       * Napis od punktu (x, y) – lewy koniec linii bazowej. style: { variant, size, color: [r, g, b] }.
       * Odcinki kroju Symbol kładzie za łacińskimi według szerokości. Zwraca szerokość napisu.
       */
      text(text, x, y, { variant = 'regular', size = 11, color: rgb = [0, 0, 0] } = {}) {
        let left = x;
        for (const run of encodeText(text)) {
          const font = run.font === 'symbol' ? 'symbol' : variant;
          used.add(font);
          const fill = color(rgb);
          const parts = [];
          if (state.font !== font || state.size !== size) parts.push(`/${fontKey(font)} ${num(size)} Tf`);
          if (state.fill !== fill) parts.push(`${fill} rg`);
          state = { ...state, font, size, fill };
          ops.push(`BT ${parts.length > 0 ? `${parts.join(' ')} ` : ''}1 0 0 1 ${num(left)} ${num(y)} Tm <${run.codes.map(hex2).join('')}> Tj ET`);
          left += runWidth(run, variant, size);
        }
        return left - x;
      },
      rect(x, y, w, h, rgb) {
        state.fill = undefined;
        ops.push(`${color(rgb)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
      },
      line(x1, y1, x2, y2, width, rgb, dash = null) {
        ops.push(`q ${dash ? `[${dash.map(num).join(' ')}] 0 d ` : ''}${num(width)} w ${color(rgb)} RG ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S Q`);
      },
      /**
       * Ścieżka: [['m', x, y], ['l', x, y], ['c', x1, y1, x2, y2, x, y], ['h']]; style: { fill, stroke
       * (kolory [r, g, b]), width, cap, join (jak w canvas) }.
       */
      path(commands, { fill = null, stroke = null, width = 1, cap = 'butt', join = 'miter' } = {}) {
        if (commands.length === 0 || (!fill && !stroke)) return;
        const parts = ['q'];
        if (fill) parts.push(`${color(fill)} rg`);
        if (stroke) parts.push(`${color(stroke)} RG ${num(width)} w ${CAPS[cap] ?? 0} J ${JOINS[join] ?? 0} j`);
        for (const [op, ...values] of commands) parts.push(`${values.map(num).join(' ')}${values.length > 0 ? ' ' : ''}${op}`);
        parts.push(fill && stroke ? 'B' : (fill ? 'f' : 'S'), 'Q');
        ops.push(parts.join(' '));
      },
      image(name, x, y, w, h) {
        ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /${name} Do Q`);
      },
      link(x, y, w, h, uri) {
        links.push({ rect: [x, y, x + w, y + h], uri });
      },
      save() {
        state = {};
        ops.push('q');
      },
      restore() {
        state = {};
        ops.push('Q');
      },
      /** Przycina dalsze rysowanie (do restore) do prostokąta. */
      clip(x, y, w, h) {
        ops.push(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re W n`);
      }
    };
    pages.push(page);
    return page;
  }

  /** Plik PDF: Uint8Array. */
  async function build() {
    const chunks = [];
    const offsets = [];
    let length = 0;
    const write = (data) => {
      const bytes = typeof data === 'string' ? encoder.encode(data) : data;
      chunks.push(bytes);
      length += bytes.length;
    };
    let next = 0;
    const reserve = () => {
      next += 1;
      return next;
    };
    const objects = [];
    const object = (id, body) => objects.push({ id, body });
    /** Strumień; dict – słownik bez /Length (dopisywany), zip – kompresja, gdy jest. */
    const stream = async (id, dict, content, { zip = true } = {}) => {
      let bytes = typeof content === 'string' ? encoder.encode(content) : content;
      let filter = '';
      if (zip && compress) {
        const packed = await compress(bytes);
        if (packed) {
          bytes = packed;
          filter = ' /Filter /FlateDecode';
        }
      }
      objects.push({ id, dict: `${dict.slice(0, -2).trimEnd()}${filter} /Length ${bytes.length} >>`, bytes });
    };

    const catalog = reserve();
    const pagesID = reserve();
    const info = reserve();
    const latin = VARIANTS.filter((variant) => variant !== 'symbol' && used.has(variant));
    const encodingID = latin.length > 0 ? reserve() : null;
    const latinMap = latin.length > 0 ? reserve() : null;
    const symbolMap = used.has('symbol') ? reserve() : null;
    const fontIDs = Object.fromEntries(VARIANTS.filter((variant) => used.has(variant)).map((variant) => [variant, reserve()]));
    const imageIDs = images.map(() => reserve());
    const pageIDs = pages.map((page) => ({ page: reserve(), content: reserve(), links: page.links.map(() => reserve()) }));

    object(catalog, `<< /Type /Catalog /Pages ${pagesID} 0 R >>`);
    object(pagesID, `<< /Type /Pages /Kids [${pageIDs.map(({ page }) => `${page} 0 R`).join(' ')}] /Count ${pages.length} >>`);
    const now = new Date();
    const date = `D:${now.getUTCFullYear()}${[now.getUTCMonth() + 1, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()]
      .map((value) => String(value).padStart(2, '0')).join('')}Z`;
    object(info, `<< /Title ${utf16(title)} /Producer (LexiCards) /Creator (LexiCards) /CreationDate (${date}) >>`);
    if (encodingID) {
      const differences = DIFFERENCES.map(([code, , name]) => `${code} /${name}`).join(' ');
      object(encodingID, `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [${differences}] >>`);
      await stream(latinMap, '<< >>', toUnicode([...LATIN_CODES].sort(([a], [b]) => a - b)));
    }
    if (symbolMap) await stream(symbolMap, '<< >>', toUnicode([...SYMBOL_UNICODE].sort(([a], [b]) => a - b)));
    for (const variant of latin) {
      const widthList = Array.from({ length: 255 }, (_, index) => {
        const char = LATIN_CODES.get(index + 1);
        return char ? Math.round(widths(variant, char)) : 0;
      });
      object(fontIDs[variant], `<< /Type /Font /Subtype /Type1 /BaseFont /${PDF_FONTS[variant]} /Encoding ${encodingID} 0 R `
        + `/FirstChar 1 /LastChar 255 /Widths [${widthList.join(' ')}] /ToUnicode ${latinMap} 0 R >>`);
    }
    if (symbolMap) {
      const symbolWidths = Array.from({ length: 224 }, (_, index) => {
        const char = SYMBOL_UNICODE.get(index + 32);
        return char ? Math.round(widths('symbol', char)) : 0;
      });
      object(fontIDs.symbol, `<< /Type /Font /Subtype /Type1 /BaseFont /Symbol /FirstChar 32 /LastChar 255 /Widths [${symbolWidths.join(' ')}] /ToUnicode ${symbolMap} 0 R >>`);
    }
    for (const [index, image] of images.entries()) {
      const jpeg = image.format === 'jpeg';
      await stream(imageIDs[index], `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8${jpeg ? ' /Filter /DCTDecode' : ''} >>`,
        image.bytes, { zip: !jpeg });
    }
    const fontResources = Object.keys(fontIDs).length > 0
      ? `/Font << ${Object.entries(fontIDs).map(([variant, id]) => `/${fontKey(variant)} ${id} 0 R`).join(' ')} >>` : '';
    const imageResources = images.length > 0 ? ` /XObject << ${images.map((image, index) => `/${image.name} ${imageIDs[index]} 0 R`).join(' ')} >>` : '';
    for (const [index, page] of pages.entries()) {
      const ids = pageIDs[index];
      const annots = ids.links.length > 0 ? ` /Annots [${ids.links.map((id) => `${id} 0 R`).join(' ')}]` : '';
      object(ids.page, `<< /Type /Page /Parent ${pagesID} 0 R /MediaBox [0 0 ${num(A4.width)} ${num(A4.height)}] `
        + `/Resources << ${fontResources}${imageResources} >> /Contents ${ids.content} 0 R${annots} >>`);
      await stream(ids.content, '<< >>', page.ops.join('\n'));
      page.links.forEach((link, linkIndex) => {
        object(ids.links[linkIndex], `<< /Type /Annot /Subtype /Link /Rect [${link.rect.map(num).join(' ')}] /Border [0 0 0] /A << /S /URI /URI ${literal(link.uri)} >> >>`);
      });
    }

    // Nagłówek i wiersz z bajtami powyżej 127 – znak dla programów, że plik jest binarny.
    write('%PDF-1.4\n');
    write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    objects.sort((a, b) => a.id - b.id);
    for (const item of objects) {
      offsets[item.id] = length;
      if (item.bytes) {
        write(`${item.id} 0 obj\n${item.dict}\nstream\n`);
        write(item.bytes);
        write('\nendstream\nendobj\n');
      } else {
        write(`${item.id} 0 obj\n${item.body}\nendobj\n`);
      }
    }
    const xref = length;
    const rows = [`xref\n0 ${next + 1}\n0000000000 65535 f \n`];
    for (let id = 1; id <= next; id += 1) rows.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    write(rows.join(''));
    write(`trailer\n<< /Size ${next + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }

  return { addPage, addImage, textWidth, build, get pageCount() { return pages.length; } };
}

// ---------------------------------------------------------------- rysowanie jak na płótnie

/** Kolor CSS (#rgb, #rrggbb, rgb(…)) → [r, g, b]; inny – czarny. */
export function parseColor(value) {
  const text = String(value ?? '').trim();
  let match = /^#([0-9a-f]{3})$/i.exec(text);
  if (match) return [...match[1]].map((digit) => parseInt(digit + digit, 16));
  match = /^#([0-9a-f]{6})/i.exec(text);
  if (match) return [0, 2, 4].map((at) => parseInt(match[1].slice(at, at + 2), 16));
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (match) return match.slice(1, 4).map((part) => Math.round(Number(part)));
  return [0, 0, 0];
}

/** Krój z zapisu font płótna („italic bold 12px …”) – wzory: Times (prosty, pochylony, pogrubiony). */
export function serifVariant(font) {
  const italic = /\bitalic\b/.test(font);
  const bold = /\bbold\b/.test(font);
  return `serif${bold ? 'Bold' : ''}${italic ? 'Italic' : ''}`;
}
/** Wielkość z zapisu font płótna (px – w układzie strony to punkty). */
export const fontSize = (font) => Number(/([\d.]+)px/.exec(font)?.[1] ?? 10);

const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
];

/**
 * Obiekt z metodami płótna 2D, który rysuje na stronie PDF – wzory (core/math-layout.js) składane
 * wektorowo. matrix – [a, b, c, d, e, f] z układu rysowania (y w dół) do układu strony.
 * Obsługuje: save/restore, translate/scale, ścieżki (moveTo, lineTo, quadraticCurveTo,
 * bezierCurveTo, arc, closePath), fill, stroke, fillText (krój Times według ctx.font).
 */
export function pdfCanvas(page, matrix) {
  let m = matrix;
  let path = [];
  let last = [0, 0];
  const stack = [];
  const point = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const scale = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const ctx = {
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    font: '10px serif', textAlign: 'left', textBaseline: 'alphabetic',
    save() {
      stack.push({ m, fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, lineWidth: ctx.lineWidth, lineCap: ctx.lineCap, lineJoin: ctx.lineJoin, font: ctx.font });
    },
    restore() {
      const saved = stack.pop();
      if (!saved) return;
      ({ m } = saved);
      Object.assign(ctx, { fillStyle: saved.fillStyle, strokeStyle: saved.strokeStyle, lineWidth: saved.lineWidth, lineCap: saved.lineCap, lineJoin: saved.lineJoin, font: saved.font });
    },
    translate(x, y) { m = multiply(m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { m = multiply(m, [x, 0, 0, y, 0, 0]); },
    beginPath() { path = []; },
    moveTo(x, y) {
      path.push(['m', ...point(x, y)]);
      last = [x, y];
    },
    lineTo(x, y) {
      if (path.length === 0) ctx.moveTo(x, y);
      path.push(['l', ...point(x, y)]);
      last = [x, y];
    },
    bezierCurveTo(x1, y1, x2, y2, x, y) {
      if (path.length === 0) ctx.moveTo(x1, y1);
      path.push(['c', ...point(x1, y1), ...point(x2, y2), ...point(x, y)]);
      last = [x, y];
    },
    quadraticCurveTo(cx, cy, x, y) {
      if (path.length === 0) ctx.moveTo(cx, cy);
      const [x0, y0] = last;
      ctx.bezierCurveTo(x0 + (cx - x0) * 2 / 3, y0 + (cy - y0) * 2 / 3, x + (cx - x) * 2 / 3, y + (cy - y) * 2 / 3, x, y);
    },
    /** Łuk okręgu – odcinki krzywych Béziera po najwyżej 90°. */
    arc(cx, cy, r, start, end, counterclockwise = false) {
      let sweep = end - start;
      if (!counterclockwise && sweep < 0) sweep = sweep % (2 * Math.PI) + 2 * Math.PI;
      if (counterclockwise && sweep > 0) sweep = sweep % (2 * Math.PI) - 2 * Math.PI;
      sweep = Math.max(-2 * Math.PI, Math.min(2 * Math.PI, sweep));
      const from = [cx + r * Math.cos(start), cy + r * Math.sin(start)];
      if (path.length === 0) ctx.moveTo(...from);
      else ctx.lineTo(...from);
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
      const step = sweep / steps;
      const k = (4 / 3) * Math.tan(step / 4);
      for (let index = 0; index < steps; index += 1) {
        const a0 = start + step * index;
        const a1 = a0 + step;
        ctx.bezierCurveTo(
          cx + r * (Math.cos(a0) - k * Math.sin(a0)), cy + r * (Math.sin(a0) + k * Math.cos(a0)),
          cx + r * (Math.cos(a1) + k * Math.sin(a1)), cy + r * (Math.sin(a1) - k * Math.cos(a1)),
          cx + r * Math.cos(a1), cy + r * Math.sin(a1));
      }
    },
    closePath() { path.push(['h']); },
    fill() { page.path(path, { fill: parseColor(ctx.fillStyle) }); },
    stroke() {
      page.path(path, { stroke: parseColor(ctx.strokeStyle), width: ctx.lineWidth * scale(), cap: ctx.lineCap, join: ctx.lineJoin });
    },
    fillText(text, x, y) {
      const [left, baseline] = point(x, y);
      page.text(text, left, baseline, { variant: serifVariant(ctx.font), size: fontSize(ctx.font) * scale(), color: parseColor(ctx.fillStyle) });
    }
  };
  return ctx;
}
