// Zmiany treści edytora notatki z cofaniem (od 1.20).
//
// Polecenia przeglądarki (document.execCommand) zapisują się w historii cofania (Ctrl+Z), ale
// nie wszystko da się nimi zrobić: interlinii i wyrównania akapitu, „Usuń formatowanie” razem
// z nagłówkami, listami i wcięciami ani wstawienia odwołania [[sygnatura]] czy nowej strony jako
// osobnego bloku. Takie zmiany robimy na kopii treści pola, a potem podmieniamy całą treść jednym
// poleceniem „insertHTML” – w historii to jeden krok, który Ctrl+Z cofa.
//
// Podmiana: na początek pola trafia pusty akapit-wartownik <p data-s>. Bez niego Chromium wstawia
// nową treść do wnętrza pierwszego bloku, gdy jest nim nagłówek, punkt listy albo wcięcie (zwykły
// akapit zastępuje poprawnie). Po cofnięciu wartownik wraca – w CSS jest ukryty, a przy zapisie
// znika jak każdy pusty akapit.
//
// Miejsce kursora przed zmianą i po niej opisuje klucz { block, offset }: numer bloku z tekstem
// (akapit, nagłówek, punkt listy) i liczba znaków od jego początku (złamanie wiersza <br> – jeden
// znak). Przeglądarka po cofnięciu zaznacza całą podmienioną treść – kursor wraca na miejsce sprzed
// zmiany (i po ponowieniu – na miejsce po zmianie).

import { docFromHtml, editorNoteHtml, htmlFromDoc } from '../core/note-format.js';

/** Bloki z tekstem. */
const LEAF = 'p, h1, h2, h3, h4, h5, h6, li, pre, div';
/** Elementy blokowe – tekst poza nimi (na najwyższym poziomie pola) trafia do akapitu. */
const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'DIV', 'PRE', 'TABLE']);
const SENTINEL = 'data-s';
const SENTINEL_RE = /<p data-s="">(?:<br>)?<\/p>/g;
/** Znaczniki początku i końca zaznaczenia w kopii treści (znaki prywatne Unicode – nie ma ich w notatkach). */
const START = '';
const END = '';
/** Pusty akapit w „Usuń formatowanie” – żeby nie zniknął przy porządkowaniu treści. */
const EMPTY = '';
const HISTORY_LIMIT = 60;

/** Bloki z tekstem w kolejności dokumentu (bez wartowników). */
export function leafBlocks(root) {
  return [...root.querySelectorAll(LEAF)].filter((element) => !element.hasAttribute(SENTINEL));
}

/** Najbliższy blok z tekstem zawierający węzeł albo null. */
export function leafOf(root, node) {
  let element = node?.nodeType === 1 ? node : node?.parentNode;
  while (element && element !== root) {
    if (element.matches(LEAF) && !element.hasAttribute(SENTINEL)) return element;
    element = element.parentNode;
  }
  return null;
}

const indexOf = (node) => Array.prototype.indexOf.call(node.parentNode.childNodes, node);

/** Tekst i złamania wiersza bloku po kolei – bez bloków zagnieżdżonych (lista w punkcie listy). */
function pieces(leaf) {
  const result = [];
  const walker = document.createTreeWalker(leaf, window.NodeFilter.SHOW_TEXT | window.NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => (node !== leaf && node.nodeType === 1 && node.matches(LEAF) ? window.NodeFilter.FILTER_REJECT : window.NodeFilter.FILTER_ACCEPT)
  });
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === 3 || node.nodeName === 'BR') result.push(node);
  }
  return result;
}

/** Klucz miejsca (węzeł, przesunięcie) w polu root – zob. opis modułu. */
export function pointKey(root, node, offset) {
  const blocks = leafBlocks(root);
  const point = document.createRange();
  point.setStart(node, offset);
  point.collapse(true);
  const leaf = leafOf(root, node);
  if (!leaf) {
    // Między blokami: początek następnego bloku albo koniec ostatniego.
    const next = blocks.findIndex((block) => point.comparePoint(block, 0) >= 0);
    if (next >= 0) return { block: next, offset: 0 };
    const last = blocks[blocks.length - 1];
    return { block: Math.max(0, blocks.length - 1), offset: last ? pieces(last).reduce((sum, piece) => sum + (piece.nodeType === 3 ? piece.length : 1), 0) : 0 };
  }
  let count = 0;
  for (const piece of pieces(leaf)) {
    if (piece === node) return { block: blocks.indexOf(leaf), offset: count + offset };
    if (point.comparePoint(piece.parentNode, indexOf(piece) + 1) > 0) break;
    count += piece.nodeType === 3 ? piece.length : 1;
  }
  return { block: blocks.indexOf(leaf), offset: count };
}

/** Miejsce (węzeł, przesunięcie) dla klucza. */
export function keyPoint(root, key) {
  const blocks = leafBlocks(root);
  const leaf = blocks[Math.min(Math.max(0, key.block), blocks.length - 1)];
  if (!leaf) return [root, root.childNodes.length];
  let left = Math.max(0, key.offset);
  let last = null;
  for (const piece of pieces(leaf)) {
    if (piece.nodeType === 3) {
      if (left <= piece.length) return [piece, left];
      left -= piece.length;
    } else {
      if (left === 0) return [piece.parentNode, indexOf(piece)];
      left -= 1;
    }
    last = piece;
  }
  if (!last) return [leaf, 0];
  return last.nodeType === 3 ? [last, last.length] : [last.parentNode, indexOf(last) + 1];
}

/** Zaznacza miejsce z kluczy { start, end }. */
export function selectKeys(root, keys) {
  if (!keys?.start) return;
  const range = document.createRange();
  range.setStart(...keyPoint(root, keys.start));
  range.setEnd(...keyPoint(root, keys.end ?? keys.start));
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Klucze zaznaczenia `range` (null – brak zaznaczenia w polu). */
export function rangeKeys(root, range) {
  if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return { start: pointKey(root, range.startContainer, range.startOffset), end: pointKey(root, range.endContainer, range.endOffset) };
}

// ---------------------------------------------------------------- kopia treści ze znacznikami zaznaczenia

const pathOf = (root, node) => {
  const path = [];
  for (let current = node; current !== root; current = current.parentNode) path.unshift(indexOf(current));
  return path;
};
const follow = (root, path) => path.reduce((node, index) => node.childNodes[index], root);

/**
 * Miejsce wewnątrz bloku z tekstem: kursor między blokami (np. tuż w polu albo w liście) trafia na
 * początek następnego bloku albo na koniec poprzedniego.
 */
function intoLeaf(root, node, offset) {
  if (node.nodeType !== 1 || leafOf(root, node)) return [node, offset];
  const after = node.childNodes[offset];
  if (after) {
    const leaf = after.nodeType === 1 ? (after.matches(LEAF) ? after : after.querySelector(LEAF)) : null;
    if (leaf) return [leaf, 0];
    if (after.nodeType === 3) return [after, 0];
  }
  const before = node.childNodes[offset - 1];
  if (before?.nodeType === 1) {
    const leaves = before.matches(LEAF) ? [before] : [...before.querySelectorAll(LEAF)];
    const leaf = leaves[leaves.length - 1];
    if (leaf) return [leaf, leaf.childNodes.length];
  }
  if (before?.nodeType === 3) return [before, before.length];
  return [node, offset];
}

function insertMark(root, node, offset, mark) {
  if (node.nodeType === 3) node.insertData(offset, mark);
  else node.insertBefore(document.createTextNode(mark), node.childNodes[offset] ?? null);
}

/** Tekst na najwyższym poziomie pola (np. pisany w pustym polu) – do akapitów. */
function wrapLoose(root) {
  let paragraph = null;
  for (const node of [...root.childNodes]) {
    const loose = node.nodeType === 3 ? (paragraph !== null || node.data.trim() !== '') : node.nodeType === 1 && !BLOCK_TAGS.has(node.nodeName);
    if (!loose) {
      paragraph = null;
      continue;
    }
    if (!paragraph) {
      paragraph = document.createElement('p');
      node.before(paragraph);
    }
    paragraph.append(node);
  }
}

/**
 * Kopia treści pola z zaznaczeniem `range` oznaczonym znacznikami START i END (bez zaznaczenia –
 * bez znaczników), bez wartowników, z luźnym tekstem w akapitach.
 */
export function markedCopy(root, range) {
  const copy = root.cloneNode(true);
  if (range && root.contains(range.startContainer) && root.contains(range.endContainer)) {
    const start = intoLeaf(root, range.startContainer, range.startOffset);
    const end = range.collapsed ? start : intoLeaf(root, range.endContainer, range.endOffset);
    const startPath = pathOf(root, start[0]);
    const endPath = pathOf(root, end[0]);
    // Najpierw koniec – wstawienie go nie przesuwa początku.
    insertMark(copy, follow(copy, endPath), end[1], END);
    insertMark(copy, follow(copy, startPath), start[1], START);
  }
  for (const sentinel of copy.querySelectorAll(`[${SENTINEL}]`)) sentinel.remove();
  wrapLoose(copy);
  return copy;
}

/** Znacznik w kopii: { node, index } albo null. */
function findMark(root, mark) {
  const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const index = walker.currentNode.data.indexOf(mark);
    if (index >= 0) return { node: walker.currentNode, index };
  }
  return null;
}

/** Usuwa znaczniki z kopii; zwraca klucze zaznaczenia (null – nie było znaczników). */
export function takeMarks(root) {
  const start = findMark(root, START);
  if (start) start.node.deleteData(start.index, 1);
  const end = findMark(root, END);
  if (end) end.node.deleteData(end.index, 1);
  if (!start) return null;
  const startKey = pointKey(root, start.node, start.index);
  return { start: startKey, end: end ? pointKey(root, end.node, end.index) : startKey };
}

/** Czy zaznaczenie w kopii jest puste (sam kursor). */
export function markCollapsed(root) {
  const start = findMark(root, START);
  return !start || start.node.data[start.index + 1] === END;
}

// ---------------------------------------------------------------- zmiany

/**
 * Bloki objęte zaznaczeniem w kopii (od bloku początku do bloku końca; koniec na samym początku
 * bloku go nie obejmuje). Bez zaznaczenia albo przy samym kursorze i whole – wszystkie.
 */
export function selectedLeaves(root, { whole = false } = {}) {
  const blocks = leafBlocks(root);
  const start = findMark(root, START);
  const end = findMark(root, END);
  if (!start || !end || (whole && markCollapsed(root))) return blocks;
  const first = blocks.indexOf(leafOf(root, start.node));
  let last = blocks.indexOf(leafOf(root, end.node));
  if (first < 0 || last < 0) return blocks;
  if (last > first && pointKey(root, end.node, end.index).offset === 0) last -= 1;
  return blocks.slice(first, last + 1);
}

/**
 * Wyrównanie albo interlinia bloków (atrybut data-align / data-line; null – zwykłe). Zaznaczone
 * bloki, a przy samym kursorze – cały tekst.
 */
export function setParagraph(root, name, value) {
  for (const leaf of selectedLeaves(root, { whole: true })) {
    if (value) leaf.setAttribute(name, value);
    else leaf.removeAttribute(name);
    if (name === 'data-align' && leaf.style?.textAlign) {
      leaf.style.textAlign = '';
      if (!leaf.getAttribute('style')) leaf.removeAttribute('style');
    }
  }
}

/** Wyrównanie i interlinia bloku przy kursorze (w polu na żywo): { align, line }. */
export function paragraphAt(root, range) {
  const leaf = (range && leafOf(root, range.startContainer)) ?? leafBlocks(root)[0] ?? null;
  return { align: leaf?.getAttribute('data-align') ?? null, line: leaf?.getAttribute('data-line') ?? null };
}

/**
 * „Usuń formatowanie” (od 1.20): w zaznaczonym tekście znika wszystko oprócz linków – pogrubienie,
 * kursywa, podkreślenie, przekreślenie, indeksy, kolor i wielkość; bloki objęte zaznaczeniem stają
 * się zwykłymi akapitami (bez nagłówka, listy, wcięcia, wyrównania i interlinii). Przy samym
 * kursorze – cały blok, w którym jest kursor. Zwraca klucze zaznaczenia po zmianie.
 */
export function clearFormatting(root) {
  const start = findMark(root, START);
  const end = findMark(root, END);
  if (!start || !end) return null;
  const top = (node) => {
    let current = node;
    while (current.parentNode !== root) current = current.parentNode;
    return current;
  };
  const first = top(start.node);
  const last = top(end.node);
  const nodes = [];
  for (let node = first; node; node = node.nextSibling) {
    nodes.push(node);
    if (node === last) break;
  }
  // Puste akapity zostają na swoim miejscu.
  for (const node of nodes) {
    if (node.nodeType !== 1) continue;
    for (const leaf of node.matches(LEAF) ? [node, ...node.querySelectorAll(LEAF)] : node.querySelectorAll(LEAF)) {
      const own = pieces(leaf).filter((piece) => piece.nodeType === 3).map((piece) => piece.data).join('').replace(/[]/g, '');
      if (own.trim() === '') leaf.prepend(document.createTextNode(EMPTY));
    }
  }
  const before = leafBlocks(root).filter((leaf) => !first.contains(leaf) && (first.compareDocumentPosition(leaf) & window.Node.DOCUMENT_POSITION_PRECEDING)).length;
  const html = nodes.map((node) => (node.nodeType === 1 ? node.outerHTML : node.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;'))).join('');
  const doc = docFromHtml(html, { editor: true });

  // Miejsca znaczników w tekście bloków (bez znaczników i znaków pustego akapitu).
  const found = {};
  const empty = new Set();
  doc.blocks.forEach((block, index) => {
    let position = 0;
    let text = '';
    for (const run of block.runs) {
      let clean = '';
      for (const char of run.text) {
        if (char === START || char === END) found[char] = { block: index, offset: position + clean.length };
        else if (char !== EMPTY) clean += char;
      }
      run.text = clean;
      position += clean.length;
      text += clean;
    }
    block.runs = block.runs.filter((run) => run.text !== '');
    if (block.type !== 'break' && text.trim() === '') empty.add(index);
  });
  const from = found[START] ?? found[END];
  const to = found[END] ?? from;
  if (!from) return null;
  const collapsed = from.block === to.block && from.offset === to.offset;
  let lastBlock = to.block;
  if (!collapsed && to.block > from.block && to.offset === 0) lastBlock -= 1;
  for (let index = from.block; index <= lastBlock; index += 1) {
    const block = doc.blocks[index];
    if (block.type === 'break') continue;
    const startAt = collapsed || index > from.block ? 0 : from.offset;
    const endAt = collapsed || index < to.block ? Infinity : to.offset;
    block.runs = clearRuns(block.runs, startAt, endAt);
    block.type = 'p';
    for (const key of ['list', 'depth', 'indent', 'align', 'line']) delete block[key];
  }
  for (const index of empty) doc.blocks[index].runs = [{ text: EMPTY }];
  const result = editorNoteHtml(htmlFromDoc(doc)).replace(new RegExp(`>${EMPTY}<`, 'g'), '><br><').replaceAll(EMPTY, '');
  const holder = document.createElement('template');
  holder.innerHTML = result || '<p><br></p>';
  first.before(holder.content);
  for (const node of nodes) node.remove();

  // Numer bloku w polu: bloki przed zmienianym fragmentem + bloki z tekstem dokumentu przed blokiem.
  const leafIndex = (blockIndex) => before + doc.blocks.slice(0, blockIndex).filter((block) => block.type !== 'break').length;
  return {
    start: { block: leafIndex(from.block), offset: from.offset },
    end: { block: leafIndex(to.block), offset: to.offset }
  };
}

/** Fragmenty bez formatowania (poza linkiem) w zakresie znaków [start, end). */
function clearRuns(runs, start, end) {
  const result = [];
  let position = 0;
  for (const run of runs) {
    const length = run.text.length;
    const from = Math.max(start, position);
    const to = Math.min(end, position + length);
    if (to <= from) {
      result.push(run);
    } else {
      if (from > position) result.push({ ...run, text: run.text.slice(0, from - position) });
      result.push({ text: run.text.slice(from - position, to - position), ...(run.href ? { href: run.href } : {}) });
      if (to < position + length) result.push({ ...run, text: run.text.slice(to - position) });
    }
    position += length;
  }
  return result;
}

/**
 * Blok (odwołanie do obrazu albo nowa strona) w miejscu kursora, zawsze między blokami: na końcu
 * bloku – wstawiony blok i pusty akapit do pisania dalej; w środku akapitu – akapit dzieli się na
 * dwa; w liście – lista dzieli się po bieżącym punkcie. Bez kursora w tekście – na końcu.
 * Zwraca klucze kursora po wstawieniu (początek bloku za wstawionym).
 */
export function insertBlockAt(root, inserted) {
  const mark = findMark(root, START);
  let point = null;
  if (mark) {
    point = [mark.node, mark.index];
    takeMarks(root);
  }
  let block = point ? point[0] : root.lastChild;
  if (block === root) block = root.childNodes[Math.max(0, point[1] - 1)] ?? root.lastChild;
  while (block && block.parentNode !== root) block = block.parentNode;
  const empty = document.createElement('p');
  empty.append(document.createElement('br'));
  let after = [empty];
  let caretTarget = empty;
  if (block?.nodeType === 1 && /^(UL|OL)$/.test(block.tagName) && point) {
    let item = point[0];
    while (item && item.parentNode !== block) item = item.parentNode;
    const items = [...block.children];
    const following = item ? items.slice(items.indexOf(item) + 1) : [];
    if (following.length > 0) {
      const rest = document.createElement(block.tagName);
      rest.append(...following);
      after = [empty, rest];
    }
  } else if (block?.nodeType === 1 && point) {
    // Tekst za kursorem przechodzi za wstawiony blok.
    const tail = document.createRange();
    tail.setStart(...point);
    tail.setEnd(block, block.childNodes.length);
    const moved = tail.extractContents();
    if (moved.textContent.trim() !== '') {
      const rest = block.cloneNode(false);
      rest.append(moved);
      after = [rest];
      caretTarget = leafBlocks(rest)[0] ?? rest;
    }
    if (block.textContent === '' && !block.querySelector('br')) block.append(document.createElement('br'));
  }
  if (block) block.after(inserted, ...after);
  else root.append(inserted, ...after);
  const target = leafOf(root, caretTarget) ?? caretTarget;
  const key = { block: Math.max(0, leafBlocks(root).indexOf(target)), offset: 0 };
  return { start: key, end: key };
}

// ---------------------------------------------------------------- podmiana treści z cofaniem

/**
 * Podmiana treści pola `area` z historią miejsc kursora. Zwraca { apply(range, change), onInput(event) }:
 * apply – kopia treści ze znacznikami zaznaczenia, change(copy) zmienia ją (i może zwrócić klucze
 * zaznaczenia po zmianie), potem podmiana jednym krokiem cofania; onInput – po cofnięciu i
 * ponowieniu (zdarzenie „input”) kursor wraca na właściwe miejsce.
 */
export function contentEditing(area) {
  const history = [];
  const clean = () => area.innerHTML.replace(SENTINEL_RE, '');

  function replace(html, keys, beforeKeys) {
    const before = clean();
    const sentinel = document.createElement('p');
    sentinel.setAttribute(SENTINEL, '');
    sentinel.append(document.createElement('br'));
    area.classList.add('note-editor__area--replacing');
    area.prepend(sentinel);
    const all = document.createRange();
    all.selectNodeContents(area);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(all);
    document.execCommand('insertHTML', false, html || '<p><br></p>');
    area.classList.remove('note-editor__area--replacing');
    selectKeys(area, keys);
    history.push({ before, beforeKeys, after: clean(), afterKeys: keys });
    if (history.length > HISTORY_LIMIT) history.shift();
  }

  return {
    apply(range, change) {
      const beforeKeys = rangeKeys(area, range);
      const copy = markedCopy(area, range);
      const keys = change(copy) ?? takeMarks(copy);
      // Znaczniki, których zmiana nie zdjęła, nie mogą trafić do treści.
      takeMarks(copy);
      replace(copy.innerHTML, keys, beforeKeys);
    },
    onInput(event) {
      if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return;
      const current = clean();
      const undo = event.inputType === 'historyUndo';
      const entry = history.findLast((item) => (undo ? item.before : item.after) === current);
      if (entry) selectKeys(area, undo ? entry.beforeKeys : entry.afterKeys);
    }
  };
}
