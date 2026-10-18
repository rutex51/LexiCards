// Treść notatki: tekst z formatowaniem.
//
// W bazie notatka jest zapisana jako HTML z wąskiego, stałego zestawu znaczników:
//   bloki:  <p>, <h3>, <ul>/<ol> z <li> (listy zagnieżdżone do trzech poziomów),
//   wewnątrz: <strong>, <em>, <u>, <s>, <sup>, <sub>, <span data-color="…">, <a href>, <br>.
// Każdy HTML – wklejony z Worda, strony WWW, Notatek, zapisany w edytorze albo z kopii
// zapasowej – przechodzi przez normalizeNoteHtml(), która zostawia wyłącznie te znaczniki.
// Dzięki temu treść jest bezpieczna do wyświetlenia (bez skryptów, stylów i obrazów z sieci)
// i zawsze ma tę samą postać.
//
// Pośrednio treść to dokument: lista bloków z fragmentami tekstu (runs). Z dokumentu powstaje
// HTML, zwykły tekst oraz tekst sformatowany komórki Excela (eksport) – i odwrotnie: tekst
// sformatowany z komórki (import) zamienia się w dokument.
//
//   Dokument: { blocks: [{ type: 'p' | 'h' | 'li', list?: 'ul' | 'ol', depth?: 0–2, runs }] }
//   Fragment: { text, b?, i?, u?, s?, sup?, sub?, color?, href? } – '\n' w tekście to nowy wiersz.
//
// Moduł nie zależy od przeglądarki.

/** Kolory tekstu notatki. W HTML zapisywana jest nazwa, a kolor dobiera motyw (jasny/ciemny). */
export const NOTE_COLORS = Object.freeze([
  { id: 'red', label: 'Czerwony', hex: '#d70015' },
  { id: 'orange', label: 'Pomarańczowy', hex: '#c45500' },
  { id: 'green', label: 'Zielony', hex: '#248a3d' },
  { id: 'blue', label: 'Niebieski', hex: '#0040dd' },
  { id: 'purple', label: 'Fioletowy', hex: '#8944ab' }
]);

const COLOR_IDS = new Set(NOTE_COLORS.map((color) => color.id));
const COLOR_BY_HEX = new Map(NOTE_COLORS.map((color) => [color.hex, color.id]));
const MARKS = ['b', 'i', 'u', 's', 'sup', 'sub'];
const MAX_DEPTH = 2;

/** Najdłuższa treść notatki (znaki HTML) – ochrona przed przypadkowym wklejeniem całej książki. */
export const NOTE_HTML_LIMIT = 200_000;

// ---------------------------------------------------------------- kolory

function parseColor(value) {
  const text = String(value ?? '').trim().toLowerCase();
  let match = /^#([0-9a-f]{6})$/.exec(text);
  if (match) return `#${match[1]}`;
  match = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (match) return `#${match[1]}${match[1]}${match[2]}${match[2]}${match[3]}${match[3]}`;
  match = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(text);
  if (match) {
    if (match[4] !== undefined && parseFloat(match[4]) === 0) return null;
    return `#${[match[1], match[2], match[3]].map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('')}`;
  }
  return null;
}

/** Kolor z palety notatek dokładnie odpowiadający zapisowi CSS (np. z edytora) albo null. */
export function paletteColor(value) {
  const hex = parseColor(value);
  return hex ? COLOR_BY_HEX.get(hex) ?? null : null;
}

/**
 * Najbliższy kolor palety dla dowolnego koloru (np. z komórki Excela). Czerń, biel i szarości
 * (zwykły kolor tekstu) dają null. Żółty i złoty trafiają do pomarańczowego – na białym tle
 * żółty tekst byłby nieczytelny.
 */
export function nearestNoteColor(value) {
  const hex = parseColor(value);
  if (!hex) return null;
  if (COLOR_BY_HEX.has(hex)) return COLOR_BY_HEX.get(hex);
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return null;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.25 || lightness < 0.12 || lightness > 0.92) return null;
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 70) return 'orange';
  if (hue < 170) return 'green';
  if (hue < 260) return 'blue';
  return 'purple';
}

export function noteColorHex(id) {
  return NOTE_COLORS.find((color) => color.id === id)?.hex ?? null;
}

// ---------------------------------------------------------------- fragmenty tekstu

function sameMarks(a, b) {
  return MARKS.every((mark) => Boolean(a[mark]) === Boolean(b[mark]))
    && (a.color ?? null) === (b.color ?? null)
    && (a.href ?? null) === (b.href ?? null);
}

function marksOf(source) {
  const marks = {};
  for (const mark of MARKS) if (source[mark]) marks[mark] = true;
  if (source.sup && source.sub) delete marks.sub;
  if (source.color && COLOR_IDS.has(source.color)) marks.color = source.color;
  if (source.href) marks.href = source.href;
  return marks;
}

function commonMarks(a, b) {
  const marks = {};
  for (const mark of MARKS) if (a[mark] && b[mark]) marks[mark] = true;
  if (a.color && a.color === b.color) marks.color = a.color;
  if (a.href && a.href === b.href) marks.href = a.href;
  return marks;
}

/** Dopisuje tekst do listy fragmentów, łącząc go z poprzednim o tym samym formatowaniu. */
function pushRun(runs, text, marks) {
  if (text === '') return;
  const last = runs[runs.length - 1];
  if (last && sameMarks(last, marks)) last.text += text;
  else runs.push({ text, ...marksOf(marks) });
}

function runsText(runs) {
  return runs.map((run) => run.text).join('');
}

/** Usuwa białe znaki i znaki nowego wiersza z początku i końca listy fragmentów. */
function trimRuns(runs) {
  while (runs.length > 0) {
    runs[0].text = runs[0].text.replace(/^[ \n]+/, '');
    if (runs[0].text !== '') break;
    runs.shift();
  }
  while (runs.length > 0) {
    const last = runs[runs.length - 1];
    last.text = last.text.replace(/[ \n]+$/, '');
    if (last.text !== '') break;
    runs.pop();
  }
  // Spacje przed i po złamaniu wiersza nie mają znaczenia.
  for (const run of runs) run.text = run.text.replace(/ +\n/g, '\n').replace(/\n +/g, '\n');
  return runs;
}

function cleanRuns(runs) {
  const merged = [];
  for (const run of runs) pushRun(merged, run.text, run);
  return trimRuns(merged);
}

// ---------------------------------------------------------------- odczyt HTML

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', euro: '€',
  copy: '©', reg: '®', trade: '™', deg: '°', plusmn: '±', times: '×', divide: '÷',
  frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³', para: '¶', sect: '§',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', le: '≤', ge: '≥', ne: '≠', asymp: '≈',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', sigma: 'σ', Sigma: 'Σ', mu: 'μ', pi: 'π',
  oacute: 'ó', Oacute: 'Ó', eacute: 'é', aacute: 'á', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', ntilde: 'ñ'
};

function decodeEntities(text) {
  if (text.indexOf('&') === -1) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);?/g, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return Object.hasOwn(ENTITIES, entity) ? ENTITIES[entity] : match;
  });
}

const TAG_RE = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<[!?][^>]*>|<(\/?)([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
const ATTRIBUTE_RE = /([^\s"'=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** Znaczniki, których zawartość nie jest tekstem notatki (skrypty, style, metadane Worda…). */
const SKIPPED = new Set(['script', 'style', 'title', 'head', 'textarea', 'noscript', 'template', 'xml', 'svg', 'math', 'iframe', 'object', 'select', 'button']);
const VOID = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'wbr', 'col', 'area', 'base', 'embed', 'source', 'track', 'param']);
const BLOCKS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'dl', 'dt', 'dd', 'blockquote', 'pre',
  'section', 'article', 'header', 'footer', 'aside', 'nav', 'main', 'figure', 'figcaption', 'address',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'caption', 'hr', 'body', 'html', 'details', 'summary', 'center'
]);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const CELLS = new Set(['td', 'th']);

function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(ATTRIBUTE_RE)) {
    const name = match[1].toLowerCase();
    if (!Object.hasOwn(attributes, name)) attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function parseStyle(style) {
  const result = {};
  for (const declaration of String(style ?? '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon === -1) continue;
    result[declaration.slice(0, colon).trim().toLowerCase()] = declaration.slice(colon + 1).trim().toLowerCase();
  }
  return result;
}

/** Bezpieczny adres odnośnika: tylko http(s) i e-mail. */
export function safeHref(value) {
  const text = String(value ?? '').trim();
  if (/^https?:\/\/[^\s<>"]+$/i.test(text)) return text;
  if (/^mailto:[^\s<>"]+$/i.test(text)) return text;
  return null;
}

/** Formatowanie wynikające z elementu: dziedziczone formatowanie rodzica plus własne. */
function elementMarks(tag, attributes, parent) {
  const marks = { ...parent };
  switch (tag) {
    case 'b': case 'strong': marks.b = true; break;
    case 'i': case 'em': case 'cite': case 'dfn': case 'var': marks.i = true; break;
    case 'u': case 'ins': marks.u = true; break;
    case 's': case 'strike': case 'del': marks.s = true; break;
    case 'sup': marks.sup = true; delete marks.sub; break;
    case 'sub': marks.sub = true; delete marks.sup; break;
    case 'a': {
      const href = safeHref(attributes.href);
      if (href) marks.href = href;
      break;
    }
    case 'font': {
      const color = paletteColor(attributes.color);
      if (color) marks.color = color;
      break;
    }
    default: break;
  }
  if (attributes['data-color'] && COLOR_IDS.has(attributes['data-color'])) marks.color = attributes['data-color'];
  if (attributes.style) {
    const style = parseStyle(attributes.style);
    const weight = style['font-weight'];
    if (weight) {
      if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) marks.b = true;
      else if (weight === 'normal' || weight === 'lighter' || Number(weight) > 0) delete marks.b;
    }
    const fontStyle = style['font-style'];
    if (fontStyle === 'italic' || fontStyle === 'oblique') marks.i = true;
    else if (fontStyle === 'normal') delete marks.i;
    const decoration = `${style['text-decoration'] ?? ''} ${style['text-decoration-line'] ?? ''}`;
    if (decoration.includes('underline')) marks.u = true;
    if (decoration.includes('line-through')) marks.s = true;
    if (style['vertical-align'] === 'super') { marks.sup = true; delete marks.sub; }
    if (style['vertical-align'] === 'sub') { marks.sub = true; delete marks.sup; }
    if (style.color) {
      // Kolory ze stron WWW i dokumentów to zwykle wygląd źródła, nie wyróżnienie – zostają tylko kolory palety.
      const color = paletteColor(style.color);
      if (color) marks.color = color;
    }
  }
  return marks;
}

/** Element listy z Worda (akapit z „mso-list”): poziom listy albo null. */
function wordListLevel(attributes) {
  const style = String(attributes.style ?? '');
  if (!/mso-list\s*:/i.test(style) || /mso-list\s*:\s*ignore/i.test(style)) return null;
  const level = /level(\d)/i.exec(style);
  return level ? Math.min(MAX_DEPTH, Number(level[1]) - 1) : 0;
}

/** Punktory list wklejanych z Worda („o” i „§” to znaki czcionek Symbol/Wingdings). */
const WORD_BULLET_RE = /^[•·▪◦‣⁃●○■□§\-–—*+o]\s+/u;
const WORD_NUMBER_RE = /^(\d{1,3}|[a-zA-Z]|[ivxIVX]{1,4})[.)]\s+/;
/** Punktory wpisane w komórce arkusza. */
const LINE_BULLET_RE = /^[•·▪◦‣⁃●○■\-–—*+]\s+/u;

/**
 * Zamienia HTML na dokument notatki. Rozumie dowolny HTML (także nie do końca poprawny),
 * ale zostawia tylko treść i formatowanie, które notatka obsługuje.
 */
export function docFromHtml(html) {
  const source = String(html ?? '');
  const blocks = [];
  /** Otwarte elementy: { tag, marks, word } – word: poziom listy Worda. */
  const stack = [];
  let current = null;
  let pendingSpace = false;
  let pendingBreak = false;
  let pendingCell = false;
  let skipping = null;

  const topMarks = () => stack[stack.length - 1]?.marks ?? {};

  const flush = () => {
    if (current) {
      const runs = cleanRuns(current.runs);
      if (runs.length > 0) blocks.push({ ...current, runs });
    }
    current = null;
    pendingSpace = false;
    pendingBreak = false;
    pendingCell = false;
  };

  /** Rodzaj bloku dla nowego tekstu, wynikający z otwartych elementów. */
  const startBlock = () => {
    let lists = 0;
    let item = null;
    let heading = false;
    let word = null;
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const { tag } = stack[index];
      if (tag === 'ul' || tag === 'ol') {
        lists += 1;
      } else if (tag === 'li' && !item) {
        item = { index };
      } else if (HEADINGS.has(tag) && !item && lists === 0) {
        heading = true;
      }
      if (stack[index].word !== null && stack[index].word !== undefined && word === null) word = stack[index].word;
    }
    if (item) {
      let listType = 'ul';
      let depth = -1;
      for (let index = item.index - 1; index >= 0; index -= 1) {
        const { tag } = stack[index];
        if (tag === 'ul' || tag === 'ol') {
          if (depth === -1) listType = tag;
          depth += 1;
        }
      }
      current = { type: 'li', list: listType, depth: Math.min(MAX_DEPTH, Math.max(0, depth)), runs: [] };
    } else if (word !== null) {
      current = { type: 'li', list: 'ul', depth: word, runs: [], wordList: true };
    } else {
      current = { type: heading ? 'h' : 'p', runs: [] };
    }
  };

  const inPre = () => stack.some((entry) => entry.tag === 'pre');

  const addText = (raw) => {
    let text = raw.replace(/[​﻿]/g, '');
    if (inPre()) {
      text = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ');
    } else {
      text = text.replace(/[\t\n\r\f  ]+/g, ' ');
    }
    if (text === '') return;
    if (!inPre() && text.trim() === '') {
      pendingSpace = true;
      return;
    }
    if (!current) startBlock();
    const marks = topMarks();
    if (!inPre() && text.startsWith(' ')) {
      pendingSpace = true;
      text = text.replace(/^ +/, '');
    }
    const content = runsText(current.runs);
    if (pendingBreak && content !== '') pushRun(current.runs, '\n', {});
    else if (pendingCell && content !== '') pushRun(current.runs, ' – ', {});
    else if (pendingSpace && content !== '' && !content.endsWith('\n') && !content.endsWith(' ')) {
      // Spacja między elementami ma tylko formatowanie wspólne dla obu stron (bez podkreślenia „w próżni”).
      pushRun(current.runs, ' ', commonMarks(current.runs[current.runs.length - 1], marks));
    }
    pendingBreak = false;
    pendingCell = false;
    pendingSpace = false;
    if (!inPre() && text.endsWith(' ')) {
      pendingSpace = true;
      text = text.replace(/ +$/, '');
    }
    pushRun(current.runs, text, marks);
  };

  /** Akapit wewnątrz elementu listy nie zaczyna nowego punktu – to tylko nowy wiersz. */
  const insideItem = () => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const { tag } = stack[index];
      if (tag === 'li') return true;
      if (tag === 'ul' || tag === 'ol' || CELLS.has(tag) || tag === 'table') return false;
    }
    return false;
  };

  const blockBoundary = (tag) => {
    if (tag === 'li' || tag === 'ul' || tag === 'ol') {
      flush();
      return;
    }
    if (insideItem()) {
      if (current && runsText(current.runs) !== '') pendingBreak = true;
      return;
    }
    flush();
  };

  for (const match of source.matchAll(TAG_RE)) {
    const token = match[0];
    if (skipping) {
      if (match[2] && match[1] === '/' && match[2].toLowerCase() === skipping) skipping = null;
      continue;
    }
    if (token.startsWith('<!--') || token.startsWith('<!') || token.startsWith('<?')) continue;
    if (match[2] === undefined) {
      if (token !== '<') addText(decodeEntities(token));
      else addText('<');
      continue;
    }
    const tag = match[2].toLowerCase();
    const closing = match[1] === '/';

    if (!closing) {
      if (SKIPPED.has(tag)) {
        if (!/\/\s*$/.test(match[3])) skipping = tag;
        continue;
      }
      const attributes = parseAttributes(match[3]);
      if (tag === 'br') {
        if (!current) startBlock();
        pushRun(current.runs, '\n', {});
        pendingSpace = false;
        continue;
      }
      if (VOID.has(tag)) {
        if (tag === 'hr') flush();
        continue;
      }
      if (tag === 'li') {
        // Niezamknięty poprzedni punkt tej samej listy.
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          const entry = stack[index];
          if (entry.tag === 'ul' || entry.tag === 'ol') break;
          if (entry.tag === 'li') {
            stack.length = index;
            break;
          }
        }
      } else if (BLOCKS.has(tag) && stack[stack.length - 1]?.tag === 'p') {
        stack.pop();
      }
      if (CELLS.has(tag)) pendingCell = true;
      if (tag === 'tr') flush();
      const word = tag === 'p' ? wordListLevel(attributes) : null;
      if (BLOCKS.has(tag)) blockBoundary(tag);
      stack.push({ tag, marks: elementMarks(tag, attributes, topMarks()), word });
      continue;
    }

    // Zamknięcie: zdejmujemy elementy do pasującego otwarcia (nadmiarowe zamknięcia pomijamy).
    let index = stack.length - 1;
    while (index >= 0 && stack[index].tag !== tag) index -= 1;
    if (index < 0) continue;
    const closed = stack.splice(index);
    if (closed.some((entry) => BLOCKS.has(entry.tag))) {
      blockBoundary(tag);
    }
  }
  flush();

  // Akapit z punktorem wpisanym ręcznie albo lista z Worda: znak listy zamieniamy na prawdziwą listę.
  for (const block of blocks) {
    if (!block.wordList) continue;
    delete block.wordList;
    const text = runsText(block.runs);
    const number = WORD_NUMBER_RE.exec(text);
    const bullet = WORD_BULLET_RE.exec(text);
    if (number) {
      block.list = 'ol';
      dropLeading(block.runs, number[0].length);
    } else if (bullet) {
      dropLeading(block.runs, bullet[0].length);
    }
    block.runs = cleanRuns(block.runs);
  }
  return { blocks: blocks.filter((block) => block.runs.length > 0) };
}

/** Usuwa `count` pierwszych znaków z listy fragmentów. */
function dropLeading(runs, count) {
  let left = count;
  while (left > 0 && runs.length > 0) {
    const first = runs[0];
    if (first.text.length <= left) {
      left -= first.text.length;
      runs.shift();
    } else {
      first.text = first.text.slice(left);
      left = 0;
    }
  }
}

// ---------------------------------------------------------------- zapis HTML

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineHtml(runs) {
  let html = '';
  for (const run of runs) {
    let text = run.text.split('\n').map(escapeHtml).join('<br>');
    if (run.sub) text = `<sub>${text}</sub>`;
    if (run.sup) text = `<sup>${text}</sup>`;
    if (run.s) text = `<s>${text}</s>`;
    if (run.u) text = `<u>${text}</u>`;
    if (run.i) text = `<em>${text}</em>`;
    if (run.b) text = `<strong>${text}</strong>`;
    if (run.color && COLOR_IDS.has(run.color)) text = `<span data-color="${run.color}">${text}</span>`;
    const href = run.href ? safeHref(run.href) : null;
    if (href) text = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    html += text;
  }
  return html;
}

/** Zamienia dokument na znormalizowany HTML notatki. */
export function htmlFromDoc(doc) {
  let html = '';
  const open = [];
  const closeLists = (depth) => {
    while (open.length > depth) html += `</li></${open.pop()}>`;
  };
  for (const block of doc.blocks ?? []) {
    const runs = cleanRuns((block.runs ?? []).map((run) => ({ ...run })));
    if (runs.length === 0) continue;
    if (block.type !== 'li') {
      closeLists(0);
      html += block.type === 'h' ? `<h3>${inlineHtml(runs)}</h3>` : `<p>${inlineHtml(runs)}</p>`;
      continue;
    }
    const list = block.list === 'ol' ? 'ol' : 'ul';
    const depth = Math.min(Math.max(0, block.depth ?? 0), open.length, MAX_DEPTH);
    closeLists(depth + 1);
    if (open.length === depth + 1) {
      if (open[depth] !== list) {
        html += `</li></${open.pop()}><${list}>`;
        open.push(list);
      } else {
        html += '</li>';
      }
    } else {
      html += `<${list}>`;
      open.push(list);
    }
    html += `<li>${inlineHtml(runs)}`;
  }
  closeLists(0);
  return html;
}

/** Normalizuje dowolny HTML do bezpiecznej postaci notatki. Pusta treść daje ''. */
export function normalizeNoteHtml(html) {
  return htmlFromDoc(docFromHtml(html));
}

// ---------------------------------------------------------------- zwykły tekst

function listNumbers(blocks) {
  const numbers = [];
  const counters = [];
  for (const block of blocks) {
    if (block.type !== 'li') {
      counters.length = 0;
      numbers.push(null);
      continue;
    }
    const depth = block.depth ?? 0;
    counters.length = Math.min(counters.length, depth + 1);
    if (counters[depth] === undefined || counters[depth].list !== block.list) counters[depth] = { list: block.list, value: 0 };
    counters[depth].value += 1;
    numbers.push(counters[depth].value);
  }
  return numbers;
}

/** Zwykły tekst dokumentu: punkty list z „•” albo numerem, akapity rozdzielone pustym wierszem. */
export function textFromDoc(doc) {
  const blocks = doc.blocks ?? [];
  const numbers = listNumbers(blocks);
  let text = '';
  blocks.forEach((block, index) => {
    const content = runsText(block.runs);
    if (index > 0) text += block.type === 'li' && blocks[index - 1].type === 'li' ? '\n' : '\n\n';
    if (block.type === 'li') {
      const indent = '    '.repeat(block.depth ?? 0);
      text += `${indent}${block.list === 'ol' ? `${numbers[index]}.` : '•'} ${content.replace(/\n/g, `\n${indent}  `)}`;
    } else {
      text += content;
    }
  });
  return text;
}

/** Zwykły tekst notatki zapisanej w HTML (podgląd, kopiowanie, wyszukiwanie). */
export function noteText(html) {
  return textFromDoc(docFromHtml(html));
}

// ---------------------------------------------------------------- tekst sformatowany komórki (Excel)

const MARKDOWN_BOLD_RE = /\*\*(?=\S)([\s\S]*?\S)\*\*/g;
const HEADING_RE = /^#{1,6}\s+/;

/** Fragmenty z pogrubieniem **tak** i kursywą *tak* zapisanymi znakami (np. w CSV). */
function applyMarkdown(runs) {
  const result = [];
  for (const run of runs) {
    // Najpierw pogrubienie, potem kursywa w pozostałych kawałkach.
    const bold = splitByPattern(run, MARKDOWN_BOLD_RE, 'b');
    for (const piece of bold) result.push(...splitItalic(piece));
  }
  return result;
}

function splitByPattern(run, pattern, mark) {
  const pieces = [];
  let last = 0;
  pattern.lastIndex = 0;
  for (const match of run.text.matchAll(pattern)) {
    if (match.index > last) pieces.push({ ...run, text: run.text.slice(last, match.index) });
    pieces.push({ ...run, text: match[1], [mark]: true });
    last = match.index + match[0].length;
  }
  if (last === 0) return [run];
  if (last < run.text.length) pieces.push({ ...run, text: run.text.slice(last) });
  return pieces;
}

const WORD_CHAR = /[\p{L}\p{N}_*]/u;

/** *kursywa*: gwiazdki przylegają do tekstu, a przed i za nimi nie ma litery ani cyfry (np. „5*3*2”). */
function splitItalic(run) {
  const text = run.text;
  if (text.indexOf('*') === -1) return [run];
  const pieces = [];
  let last = 0;
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('*', index);
    if (start === -1) break;
    const before = start > 0 ? text[start - 1] : '';
    const first = text[start + 1] ?? '';
    if ((before && WORD_CHAR.test(before)) || first === '' || /\s|\*/.test(first)) {
      index = start + 1;
      continue;
    }
    let end = text.indexOf('*', start + 1);
    while (end !== -1) {
      const inner = text[end - 1];
      const after = text[end + 1] ?? '';
      if (!/\s/.test(inner) && !(after && WORD_CHAR.test(after)) && !text.slice(start + 1, end).includes('\n')) break;
      end = text.indexOf('*', end + 1);
    }
    if (end === -1) break;
    if (start > last) pieces.push({ ...run, text: text.slice(last, start) });
    pieces.push({ ...run, text: text.slice(start + 1, end), i: true });
    last = end + 1;
    index = end + 1;
  }
  if (last === 0) return [run];
  if (last < text.length) pieces.push({ ...run, text: text.slice(last) });
  return pieces;
}

/** Najczęstszy rozmiar czcionki w komórce (ważony liczbą znaków). */
function dominantSize(runs) {
  const weights = new Map();
  for (const run of runs) {
    if (!run.size) continue;
    weights.set(run.size, (weights.get(run.size) ?? 0) + run.text.replace(/\s/g, '').length);
  }
  let best = null;
  let bestWeight = -1;
  for (const [size, weight] of weights) {
    if (weight > bestWeight) {
      best = size;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * Zamienia tekst sformatowany komórki arkusza na dokument notatki.
 * runs: [{ text, b, i, u, s, sup, sub, color: '#rrggbb' | null, size }] – fragmenty komórki
 * (komórka bez formatowania to jeden fragment).
 *
 * Wiersze komórki (Alt+Enter): pusty wiersz rozdziela akapity, kolejne wiersze akapitu są
 * łamane. Wiersz zaczynający się od „•”, „-”, „*” to punkt listy, od „1.” lub „1)” – lista
 * numerowana; wcięcie (po dwie spacje) to poziom listy. Wiersz od „# ” albo cały pogrubiony
 * i większy od reszty tekstu to nagłówek. **tak** pogrubia, *tak* – kursywa (dla plików CSV).
 */
export function docFromRichText(runs) {
  const source = (runs ?? []).filter((run) => run && run.text);
  const baseSize = dominantSize(source);
  const lines = [[]];
  for (const run of source) {
    const parts = String(run.text).replace(/\r\n?/g, '\n').split('\n');
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part !== '') lines[lines.length - 1].push({ ...run, text: part.replace(/ /g, ' ') });
    });
  }

  const blocks = [];
  let paragraph = null;
  for (const line of lines) {
    const text = runsText(line);
    if (text.trim() === '') {
      paragraph = null;
      continue;
    }
    const leading = /^[ \t]*/.exec(text)[0];
    const indent = [...leading].reduce((sum, char) => sum + (char === '\t' ? 2 : 1), 0);
    let content = line.map((run) => ({ ...run }));
    dropLeading(content, leading.length);
    const stripped = runsText(content);

    let type = 'p';
    let list = null;
    const heading = HEADING_RE.exec(stripped);
    const number = /^(\d{1,3})[.)]\s+/.exec(stripped);
    const bullet = LINE_BULLET_RE.exec(stripped);
    if (heading) {
      type = 'h';
      dropLeading(content, heading[0].length);
    } else if (number) {
      type = 'li';
      list = 'ol';
      dropLeading(content, number[0].length);
    } else if (bullet && !stripped.startsWith('o ') && !/^\*\S/.test(stripped)) {
      type = 'li';
      list = 'ul';
      dropLeading(content, bullet[0].length);
    } else if (stripped.startsWith('o ') && indent > 0) {
      // „o” to punktor drugiego poziomu w Wordzie i Outlooku – tylko z wcięciem.
      type = 'li';
      list = 'ul';
      dropLeading(content, 2);
    } else if (baseSize && content.every((run) => run.b || run.text.trim() === '')
      && content.some((run) => (run.size ?? baseSize) > baseSize + 0.5)) {
      type = 'h';
    }

    content = applyMarkdown(content).map((run) => {
      const marks = marksOf({ ...run, color: nearestNoteColor(run.color) });
      if (type === 'h') delete marks.b;
      return { text: run.text, ...marks };
    });

    if (type === 'p') {
      if (paragraph) {
        pushRun(paragraph.runs, '\n', {});
        for (const run of content) pushRun(paragraph.runs, run.text, run);
      } else {
        paragraph = { type: 'p', runs: [] };
        for (const run of content) pushRun(paragraph.runs, run.text, run);
        blocks.push(paragraph);
      }
      continue;
    }
    paragraph = null;
    const block = { type, runs: [] };
    if (type === 'li') {
      block.list = list;
      block.depth = Math.min(MAX_DEPTH, Math.floor(indent / 2));
    }
    for (const run of content) pushRun(block.runs, run.text, run);
    blocks.push(block);
  }
  for (const block of blocks) block.runs = cleanRuns(block.runs);
  return { blocks: blocks.filter((block) => block.runs.length > 0) };
}

/** Rozmiar czcionki nagłówka w komórce arkusza (zwykły tekst ma 11). */
export const SHEET_HEADING_SIZE = 13;

/**
 * Zamienia dokument na tekst sformatowany komórki arkusza – tak, żeby docFromRichText()
 * odtworzyła ten sam dokument. Zwraca fragmenty { text, b, i, u, s, sup, sub, color: '#rrggbb', size }.
 */
export function richTextFromDoc(doc) {
  const blocks = doc.blocks ?? [];
  const numbers = listNumbers(blocks);
  const runs = [];
  const push = (text, marks = {}) => {
    if (text === '') return;
    const run = { text };
    for (const mark of MARKS) if (marks[mark]) run[mark] = true;
    if (marks.color) run.color = noteColorHex(marks.color);
    if (marks.size) run.size = marks.size;
    const last = runs[runs.length - 1];
    if (last && MARKS.every((mark) => Boolean(last[mark]) === Boolean(run[mark])) && last.color === run.color && last.size === run.size) {
      last.text += text;
    } else {
      runs.push(run);
    }
  };
  blocks.forEach((block, index) => {
    if (index > 0) push(block.type === 'p' && blocks[index - 1].type === 'p' ? '\n\n' : '\n');
    if (block.type === 'li') {
      push(`${'  '.repeat(block.depth ?? 0)}${block.list === 'ol' ? `${numbers[index]}.` : '•'} `);
    }
    for (const run of block.runs) {
      const text = block.type === 'p' ? run.text : run.text.replace(/\n/g, ' ');
      push(text, block.type === 'h' ? { ...run, b: true, size: SHEET_HEADING_SIZE } : run);
    }
  });
  return runs;
}

/**
 * HTML notatki dla innych aplikacji (schowek): kolory zapisane wprost w stylu, bez atrybutów
 * aplikacji. Word, Pages, Notatki i poczta zachowają pogrubienia, listy i kolory.
 */
export function portableNoteHtml(html) {
  return normalizeNoteHtml(html)
    .replace(/<span data-color="(\w+)">/g, (match, id) => `<span style="color:${noteColorHex(id) ?? 'inherit'}">`)
    .replace(/ target="_blank" rel="noopener noreferrer"/g, '');
}

/** Czy dokument (albo HTML) nie ma żadnej treści. */
export function isEmptyNoteHtml(html) {
  return docFromHtml(html).blocks.length === 0;
}
