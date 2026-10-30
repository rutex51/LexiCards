// Notatka w stronach: treść dzielona na strony mieszczące się w oknie (bez przewijania)
// i przewracanie kartek – gestem, przyciskami i klawiszami – z efektem książki.
//
// Strony liczy przeglądarka, mierząc treść w niewidocznej stronie tej samej wielkości:
//   - bloki (akapity, nagłówki, punkty list) trafiają na stronę po kolei;
//   - akapit albo punkt listy, który się nie mieści, jest dzielony między wyrazami
//     (formatowanie zostaje po obu stronach podziału), a numeracja listy biegnie dalej;
//   - nagłówek nie zostaje sam na dole strony – przechodzi z treścią na następną;
//   - „Nowa strona” wstawiona w edytorze (<hr data-page>) zaczyna nową stronę;
//   - obraz z odwołaniem [[sygnatura]] stoi w miejscu odwołania (od 1.6), pozostałe obrazy są po
//     tekście albo – gdy tak wybrano w notatce – przed nim; każdy zmniejszony najwyżej do wysokości strony;
//   - blok, którego nie da się podzielić (np. bardzo długa lista zagnieżdżona), dostaje stronę
//     przewijaną – to jedyny wyjątek od zasady „bez przewijania”;
//   - wzory zapisane $…$ (od 1.11) są składane przed podziałem i nigdy nie dzielą się między strony;
//   - tabela (od 1.21) stoi w miejscu odwołania (bez odwołania – za obrazami), z podpisem nad nią;
//     gdy się nie mieści, dzieli się po wierszach, a wiersz nagłówka powtarza się na następnej stronie.
// Krótka notatka (jedna strona) wygląda jak dawniej: karta o wysokości treści.
//
// Przewracanie: kartka zagina się od chwyconego rogu (geometria w core/page-curl.js). Płaska
// część strony jest przycięta wzdłuż zgięcia, zagięty płat to odwrót kartki odbity względem
// zgięcia – w jednej stronie z prześwitującym, lustrzanym tekstem, w dwóch stronach (duży ekran)
// ze stroną, która po przewróceniu leży po drugiej stronie grzbietu.

import { normalizeNoteHtml } from '../core/note-format.js';
import { figureCaption, figureNumbers, findImageByLabel, referenceLabel, withImageLabels } from '../core/note-refs.js';
import { findTableByLabel, tableCaption, tableHtml, tableNumbers, withTableLabels } from '../core/tables.js';
import {
  IDENTITY, applyMatrix, constrainCorner, cornerLift, cornerOf, cornerPath, foldGeometry, gripOf, mirror, multiply, turnedCorner
} from '../core/page-curl.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { renderMath } from './math.js';
import { playPage } from './sounds.js';

/** Akapit dzielimy między stronami, gdy na dole zostało co najmniej tyle wierszy. */
const MIN_LINES_TO_SPLIT = 2.2;
/** Obraz zmniejszamy, żeby został na stronie, jeśli zachowa co najmniej taką część wysokości (i 140 px). */
const MIN_IMAGE_SHARE = 0.55;
const MIN_IMAGE_HEIGHT = 140;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------- treść

/**
 * Treść notatki jako ciąg jednostek: { kind: 'block', node } | { kind: 'item', node, list,
 * listID, number } | { kind: 'break' } | { kind: 'image', index } | { kind: 'table', index, node,
 * caption, from, to }. `source` – numer jednostki w notatce (do odnalezienia strony po ponownym
 * podziale). images – obrazy z sygnaturami, tables (od 1.21) – tabele z sygnaturami: akapit z samym
 * odwołaniem [[sygnatura]] staje się obrazem albo tabelą, odwołanie bez obiektu zostaje tekstem
 * oznaczonym na czerwono; obrazy i tabele bez odwołania są na początku albo na końcu.
 */
function contentUnits(html, images, imagesFirst = false, language = 'pl', numberFigures = false, tables = []) {
  // Podpis pod obrazem (od 1.18): „Rys. N. podpis” albo sam podpis.
  const numbers = figureNumbers(html, images, imagesFirst);
  const captionOf = (index) => figureCaption(images[index]?.caption, numbers[index], numberFigures);
  // Tabele (od 1.21): podpis „Tab. N.” nad tabelą; wiersze treści [from, to) – przy podziale między strony.
  const tableNums = tableNumbers(html, tables, imagesFirst);
  const tableUnit = (index) => {
    const holder = document.createElement('template');
    holder.innerHTML = tableHtml(tables[index]);
    const node = document.importNode(holder.content.firstChild, true);
    const rows = node.tBodies[0]?.rows.length ?? 0;
    return { kind: 'table', index, node, from: 0, to: rows, caption: tableCaption(tables[index].caption, tableNums[index], numberFigures) };
  };
  const referencedTables = new Set();
  const template = document.createElement('template');
  template.innerHTML = normalizeNoteHtml(html);
  const root = document.importNode(template.content, true);
  const units = [];
  const referenced = new Set();
  let listID = 0;
  for (const node of [...root.childNodes]) {
    if (node.nodeType !== window.Node.ELEMENT_NODE) continue;
    const tag = node.tagName.toLowerCase();
    if (tag === 'hr') {
      units.push({ kind: 'break' });
    } else if (tag === 'ul' || tag === 'ol') {
      listID += 1;
      [...node.children].forEach((item, index) => units.push({ kind: 'item', node: item, list: tag, listID, number: index + 1 }));
    } else {
      const label = tag === 'p' ? referenceLabel(node.textContent) : null;
      const index = label === null ? -1 : findImageByLabel(images, label);
      if (index >= 0) {
        units.push({ kind: 'image', index, caption: captionOf(index) });
        referenced.add(index);
        continue;
      }
      const table = label === null ? -1 : findTableByLabel(tables, label);
      if (table >= 0) {
        units.push(tableUnit(table));
        referencedTables.add(table);
        continue;
      }
      if (label !== null) {
        node.classList.add('note-ref--missing');
        node.title = 'Notatka nie ma obrazu o tej sygnaturze';
      }
      units.push({ kind: 'block', node });
    }
  }
  // Wzory $…$ – już po rozpoznaniu odwołań do obrazów (te sprawdzają sam tekst).
  for (const unit of units) if (unit.node) renderMath(unit.node, language);
  const rest = images.map((_, index) => index).filter((index) => !referenced.has(index)).map((index) => ({ kind: 'image', index, caption: captionOf(index) }));
  for (const [index] of tables.entries()) {
    if (referencedTables.has(index)) continue;
    const unit = tableUnit(index);
    renderMath(unit.node, language);
    rest.push(unit);
  }
  const all = imagesFirst ? [...rest, ...units] : [...units, ...rest];
  return all.map((unit, source) => ({ ...unit, source }));
}

/**
 * Cała treść notatki jednym ciągiem – do druku i zapisu PDF (od 1.20): bloki tekstu, listy, obrazy
 * z podpisami w miejscach odwołań (pozostałe przed tekstem albo po nim) i podziały stron. images –
 * obrazy z sygnaturami ({ url, label, caption, … }, bez pliku – url null).
 */
export function noteFlow({ html, images, tables = [], imagesFirst = false, numberFigures = false, language = 'pl' }) {
  const root = h('div', { class: 'note-flow' });
  let text = null;
  let list = null;
  const labeled = withImageLabels(images);
  for (const unit of contentUnits(html, labeled, imagesFirst, language, numberFigures, withTableLabels(tables, labeled.map((image) => image.label)))) {
    if (unit.kind === 'break') {
      root.append(h('div', { class: 'note-flow__break', 'aria-hidden': 'true' }));
      text = null;
      list = null;
    } else if (unit.kind === 'image') {
      const meta = images[unit.index] ?? {};
      root.append(h('figure', { class: 'note-flow__figure', dataset: { testid: 'note-print-figure' } },
        meta.url
          ? h('img', { src: meta.url, alt: '' })
          : h('p', { class: 'note-flow__missing' }, meta.label ? `Brak pliku obrazu „${meta.label}”` : 'Brak pliku obrazu'),
        unit.caption ? h('figcaption', { class: 'note-flow__caption' }, unit.caption) : null));
      text = null;
      list = null;
    } else {
      if (!text) {
        text = h('div', { class: 'note-text note-flow__text', lang: language });
        root.append(text);
      }
      if (unit.kind === 'item') {
        if (list?.id !== unit.listID) {
          list = { id: unit.listID, element: document.createElement(unit.list) };
          text.append(list.element);
        }
        list.element.append(unit.node);
      } else if (unit.kind === 'table') {
        list = null;
        text.append(tableBox(unit));
      } else {
        list = null;
        text.append(unit.node);
      }
    }
  }
  return root;
}

/** Punkt tekstu (węzeł, przesunięcie) dla przesunięcia liczonego w znakach treści elementu. */
function textPoint(element, offset) {
  const walker = document.createTreeWalker(element, window.NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let last = null;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (remaining <= node.length) return [node, remaining];
    remaining -= node.length;
    last = node;
  }
  return last ? [last, last.length] : [element, element.childNodes.length];
}

/** Kopia elementu z fragmentem jego tekstu [start, end) – z formatowaniem (pogrubienia, kolory). */
function textSlice(element, start, end) {
  const range = document.createRange();
  range.setStart(...textPoint(element, start));
  range.setEnd(...textPoint(element, end));
  const copy = element.cloneNode(false);
  copy.append(range.cloneContents());
  return copy;
}

/**
 * Tabela na stronie (od 1.21): podpis nad nią (tylko na pierwszej części) i wiersze treści
 * [unit.from, unit.to) – nagłówek (<thead>) zawsze; przewijana w bok, gdy jest szersza niż strona.
 */
function tableBox(unit) {
  const table = unit.node.cloneNode(true);
  const body = table.tBodies[0];
  if (body) [...body.rows].forEach((row, index) => { if (index < unit.from || index >= unit.to) row.remove(); });
  return h('figure', { class: 'note-page__table-box', dataset: { testid: 'note-table' } },
    unit.caption && !unit.continued ? h('p', { class: 'note-page__table-caption', dataset: { testid: 'note-table-caption' } }, unit.caption) : null,
    h('div', { class: 'note-page__table-scroll' }, table));
}

/** Miejsca, w których można przełamać tekst: początki wyrazów (po odstępie). */
function wordStarts(text) {
  const starts = [];
  for (let index = 1; index < text.length; index += 1) {
    if (/\s/.test(text[index - 1]) && !/\s/.test(text[index])) starts.push(index);
  }
  return starts;
}

/** Zakresy tekstu elementu zajęte przez wzory [od, do) – wzoru nie dzielimy między strony. */
function mathRanges(element) {
  return [...element.querySelectorAll('math')].map((math) => {
    const before = document.createRange();
    before.setStart(element, 0);
    before.setEndBefore(math);
    const start = before.toString().length;
    return [start, start + math.textContent.length];
  });
}

/** Czy jednostkę można dzielić między stronami: akapit, punkt listy bez list zagnieżdżonych, tabela (po wierszach). */
function splittable(unit) {
  if (unit.kind === 'table') return unit.to - unit.from > 1;
  if (unit.kind === 'item') return !unit.node.querySelector('ul, ol');
  return unit.kind === 'block' && unit.node.tagName === 'P';
}

// ---------------------------------------------------------------- podział na strony

/**
 * Dzieli jednostki na strony. content – pusty element w niewidocznej stronie pomiarowej
 * (ta sama szerokość i style co prawdziwa strona), available – wysokość treści strony.
 * Zwraca [{ source, scroll, nodes }].
 */
function paginate(units, images, content, available, language = 'pl') {
  const pages = [];
  const queue = units.map((unit) => ({ ...unit }));
  const width = content.clientWidth;
  const lineHeight = parseFloat(getComputedStyle(content).lineHeight) || 26;
  let page;
  let text = null;
  let list = null;
  let placed = [];

  const start = (source) => {
    content.replaceChildren();
    text = null;
    list = null;
    placed = [];
    page = { source, scroll: false };
  };
  const commit = () => {
    if (content.childNodes.length === 0) return;
    pages.push({ ...page, nodes: [...content.childNodes] });
  };
  // Okno może się jeszcze otwierać z animacją powiększenia (na komputerze od 96%) – wysokości
  // z getBoundingClientRect przeliczamy na wielkość bez tego powiększenia.
  const scale = content.getBoundingClientRect().width / (content.offsetWidth || 1) || 1;
  const used = () => content.getBoundingClientRect().height / scale;
  const fits = () => used() <= available + 0.5;

  const ratioOf = (unit) => {
    const meta = images[unit.index] ?? {};
    return meta.width && meta.height ? meta.width / meta.height : 4 / 3;
  };
  /** Wysokość obrazu na stronie: cała szerokość strony, najwyżej cała wysokość (albo `limit`). */
  const imageHeight = (unit, limit = available) => Math.max(40, Math.min(width / ratioOf(unit), available, limit));

  /** Wysokość podpisu pod obrazem razem z odstępem (podpis próbnie na stronie) – obraz jest o tyle niższy. */
  const captionNode = (unit) => h('p', { class: 'note-page__caption', dataset: { testid: 'note-figure-caption' } }, unit.caption);
  const captionHeight = (unit) => {
    if (!unit.caption) return 0;
    const probe = captionNode(unit);
    content.append(probe);
    const height = probe.getBoundingClientRect().height / scale + parseFloat(getComputedStyle(probe).marginTop || '0');
    probe.remove();
    return height;
  };
  const figure = (unit) => {
    const meta = images[unit.index] ?? {};
    const ratio = ratioOf(unit);
    const reserved = captionHeight(unit);
    const height = imageHeight(unit, Math.max(MIN_IMAGE_HEIGHT, (unit.limit ?? available) - reserved));
    if (!meta.url) {
      // Obraz bez pliku na urządzeniu (przywrócone same dane) – ramka z wyjaśnieniem.
      return h('button', {
        type: 'button',
        class: 'note-page__figure note-page__figure--missing',
        style: { height: `${Math.min(height, 140)}px` },
        dataset: { index: String(unit.index), testid: 'note-missing-image' }
      },
        h('strong', null, meta.label ? `Brak pliku obrazu „${meta.label}”` : 'Brak pliku obrazu'),
        h('span', null, 'Przywróć plik obrazów i załączników w Ustawieniach.'));
    }
    const button = h('button', {
      type: 'button',
      class: 'note-page__figure',
      style: { height: `${height}px` },
      'aria-label': `Powiększ obraz ${unit.index + 1} z ${images.length}${unit.caption ? ` – ${unit.caption}` : ''}`,
      dataset: { index: String(unit.index) }
    }, h('img', {
      src: meta.url, alt: '', draggable: 'false',
      style: { width: `${Math.min(width, height * ratio)}px`, height: `${height}px` }
    }));
    return unit.caption ? h('figure', { class: 'note-page__figure-box' }, button, captionNode(unit)) : button;
  };

  /** Dokłada jednostkę na bieżącą stronę; zwraca funkcję cofającą. */
  const append = (unit) => {
    if (unit.kind === 'image') {
      const node = figure(unit);
      content.append(node);
      const previous = list;
      const previousText = text;
      // Tekst po obrazie (obrazy przed tekstem) zaczyna nowy blok pod obrazem.
      list = null;
      text = null;
      return () => { node.remove(); list = previous; text = previousText; };
    }
    let createdText = false;
    if (!text) {
      text = h('div', { class: 'note-text note-page__text', lang: language, dataset: { testid: 'note-text' } });
      content.append(text);
      createdText = true;
    }
    const undoText = () => {
      if (createdText) {
        text.remove();
        text = null;
      }
    };
    if (unit.kind === 'item') {
      let element = list?.id === unit.listID ? list.element : null;
      let createdList = false;
      if (!element) {
        element = document.createElement(unit.list);
        if (unit.list === 'ol' && unit.number > 1) element.setAttribute('start', String(unit.number));
        text.append(element);
        createdList = true;
      }
      const node = unit.node.cloneNode(true);
      if (unit.continued) node.classList.add('note-page__continued');
      element.append(node);
      const previous = list;
      list = { id: unit.listID, element };
      return () => {
        node.remove();
        if (createdList) element.remove();
        list = previous;
        undoText();
      };
    }
    const node = unit.kind === 'table' ? tableBox(unit) : unit.node.cloneNode(true);
    text.append(node);
    const previous = list;
    list = null;
    return () => { node.remove(); list = previous; undoText(); };
  };

  /** Największy początek tekstu jednostki, który mieści się na bieżącej stronie: [pierwsza, reszta]. */
  const split = (unit) => {
    if (!splittable(unit)) return null;
    if (unit.kind === 'table') {
      // Tabela (od 1.21): najwięcej wierszy, które mieszczą się na stronie; reszta – z nagłówkiem na następnej.
      let low = 1;
      let high = unit.to - unit.from - 1;
      let best = 0;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const undo = append({ ...unit, to: unit.from + middle });
        const ok = fits();
        undo();
        if (ok) {
          best = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      if (best === 0) return null;
      return [{ ...unit, to: unit.from + best }, { ...unit, from: unit.from + best, continued: true }];
    }
    const full = unit.node.textContent;
    const formulas = mathRanges(unit.node);
    const starts = wordStarts(full).filter((point) => !formulas.some(([from, to]) => point > from && point < to));
    let low = 0;
    let high = starts.length - 1;
    let best = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const undo = append({ ...unit, node: textSlice(unit.node, 0, starts[middle]) });
      const ok = fits();
      undo();
      if (ok) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (best < 0) return null;
    const cut = starts[best];
    const head = textSlice(unit.node, 0, cut);
    // Akapit wyjustowany (od 1.20): ostatni wiersz przed podziałem też do obu krawędzi.
    head.classList.add('note-page__split');
    return [
      { ...unit, node: head },
      { ...unit, node: textSlice(unit.node, cut, full.length), continued: unit.kind === 'item' ? true : unit.continued }
    ];
  };

  start(queue[0]?.source ?? 0);
  while (queue.length > 0) {
    const unit = queue.shift();
    if (unit.kind === 'break') {
      if (content.childNodes.length > 0) {
        commit();
        start(queue[0]?.source ?? unit.source);
      }
      continue;
    }
    const undo = append(unit);
    if (fits()) {
      placed.push(unit);
      continue;
    }
    undo();

    if (content.childNodes.length > 0 && unit.kind === 'image') {
      // Obraz pod tekstem: lekko zmniejszony zostaje na stronie, zamiast zostawiać pustą przestrzeń.
      const full = imageHeight(unit);
      const gap = parseFloat(getComputedStyle(content).fontSize) * 0.85;
      let room = Math.floor(available - used() - gap);
      let placedHere = false;
      while (room >= Math.max(MIN_IMAGE_HEIGHT, full * MIN_IMAGE_SHARE)) {
        const undoSmaller = append({ ...unit, limit: room });
        if (fits()) {
          placedHere = true;
          break;
        }
        undoSmaller();
        room -= 4;
      }
      if (placedHere) {
        placed.push(unit);
        continue;
      }
    }

    if (content.childNodes.length > 0) {
      // Reszta strony: akapit dzielimy między stronami, jeśli zmieszczą się co najmniej dwa wiersze.
      if (available - used() >= lineHeight * MIN_LINES_TO_SPLIT) {
        const parts = split(unit);
        if (parts) {
          append(parts[0]);
          commit();
          start(unit.source);
          queue.unshift(parts[1]);
          continue;
        }
      }
      // Nagłówek nie zostaje sam na dole strony.
      const last = placed[placed.length - 1];
      const carried = [];
      if (last?.kind === 'block' && last.node.tagName === 'H3' && placed.length > 1) {
        text.lastElementChild.remove();
        carried.push(last);
      }
      commit();
      start(carried[0]?.source ?? unit.source);
      queue.unshift(...carried, unit);
      continue;
    }

    // Pusta strona, a jednostka i tak się nie mieści.
    const parts = split(unit);
    if (parts) {
      append(parts[0]);
      commit();
      start(unit.source);
      queue.unshift(parts[1]);
      continue;
    }
    append(unit);
    page.scroll = true;
    commit();
    start(queue[0]?.source ?? unit.source);
  }
  commit();
  content.replaceChildren();
  return pages;
}

// ---------------------------------------------------------------- przewracana kartka

/** Czas przewrócenia całej kartki (ms). */
const TURN_DURATION = 720;
/** Ruch palca (część szerokości strony), po którym puszczona kartka kończy przewracanie. */
const TURN_THRESHOLD = 0.28;
/** Narożnik strony, za który kartkę chwyta się myszą (px). */
const MOUSE_CORNER = 48;
/** Dwie strony obok siebie – od takiej wielkości okna (px). */
const SPREAD_MIN_WIDTH = 960;
const SPREAD_MIN_HEIGHT = 520;
/** Kółko myszy: ruch (px), który przewraca kartkę, i cisza (ms), po której można przewrócić następną. */
const WHEEL_STEP = 40;
const WHEEL_QUIET = 180;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((2 - 2 * t) ** 3) / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;

/** Czy okno jest dość duże na dwie strony obok siebie (komputer, tablet). */
function spreadAvailable() {
  return window.innerWidth >= SPREAD_MIN_WIDTH && window.innerHeight >= SPREAD_MIN_HEIGHT;
}

const cssPolygon = (points) => (points.length < 3
  ? 'polygon(0px 0px, 0px 0px, 0px 0px)'
  : `polygon(${points.map((point) => `${point.x.toFixed(2)}px ${point.y.toFixed(2)}px`).join(', ')})`);
const cssMatrix = (matrix) => `matrix(${matrix.map((value) => value.toFixed(5)).join(', ')})`;

/**
 * Pas cienia lub światła wzdłuż zgięcia: zaczyna się na prostej zgięcia (przez `origin`)
 * i ma `thickness` w stronę `normal`; gradient z CSS biegnie od zgięcia na zewnątrz.
 */
function placeBand(band, origin, normal, thickness, opacity, length) {
  const along = { x: -normal.y, y: normal.x };
  band.style.width = `${Math.max(1, thickness).toFixed(2)}px`;
  band.style.height = `${length}px`;
  band.style.transform = cssMatrix([normal.x, normal.y, along.x, along.y,
    origin.x - (along.x * length) / 2, origin.y - (along.y * length) / 2]);
  band.style.opacity = Math.min(1, Math.max(0, opacity)).toFixed(3);
}

/** Jak daleko od zgięcia sięga zagięta część kartki (px). */
const foldDepth = (geometry) => Math.max(0, ...geometry.folded.map((vertex) =>
  (vertex.x - geometry.point.x) * geometry.normal.x + (vertex.y - geometry.point.y) * geometry.normal.y));

// ---------------------------------------------------------------- przewrócenie kartki nad dowolną stroną

/**
 * Jedno przewrócenie kartki od dolnego rogu (od 1.60 – edytor notatki w widoku książki), jak w książce poniżej:
 * host – element z position: relative o wielkości strony (width × height), turning – przewracana strona leżąca już
 * w host na wierzchu (np. kopia strony), back – jej odwrót (element, przez który prześwituje tekst w lustrze).
 * forward – kartka idzie z płaskiej strony w lewo; wstecz – wraca z lewej na wierzch. Zwraca obietnicę końca animacji;
 * warstwy cienia i płata są potem usunięte, a `turning` i `back` – do usunięcia przez wołającego.
 */
export function curlTurn({ host, turning, back, width, height, forward, duration = TURN_DURATION }) {
  const corner = cornerOf('bottom', width, height);
  const cast = h('div', { class: 'note-curl__layer', 'aria-hidden': 'true' }, h('span', { class: 'note-curl__band note-curl__band--cast' }));
  const fold = h('div', { class: 'note-curl__layer', 'aria-hidden': 'true' }, h('span', { class: 'note-curl__band note-curl__band--fold' }));
  const light = h('span', { class: 'note-curl__band note-curl__band--light', 'aria-hidden': 'true' });
  back.classList.add('note-page--flap');
  Object.assign(back.style, { position: 'absolute', left: '0px', top: '0px', width: `${width}px`, height: `${height}px` });
  back.append(light);
  const flap = h('div', { class: 'note-curl__flap', 'aria-hidden': 'true' }, h('div', { class: 'note-curl__lift' }, back));
  turning.before(cast);
  turning.after(fold, flap);
  const layers = [cast, fold, flap];
  const render = (point) => {
    const geometry = foldGeometry({ width, height, corner, point });
    if (!geometry) {
      turning.style.clipPath = '';
      for (const layer of layers) layer.hidden = true;
      return;
    }
    for (const layer of layers) layer.hidden = false;
    turning.style.clipPath = cssPolygon(geometry.flat);
    back.style.transform = cssMatrix(geometry.reflection);
    back.style.clipPath = cssPolygon(geometry.folded);
    cast.style.clipPath = cssPolygon(geometry.folded);
    fold.style.clipPath = cssPolygon(geometry.flat);
    const lift = Math.sin(Math.PI * geometry.progress);
    const length = 2 * (width + height);
    placeBand(cast.firstChild, geometry.point, geometry.normal, width * (0.04 + 0.2 * lift), lift * 1.6, length);
    placeBand(fold.firstChild, geometry.point, { x: -geometry.normal.x, y: -geometry.normal.y }, width * (0.03 + 0.12 * lift), lift * 2, length);
    placeBand(light, geometry.point, geometry.normal, foldDepth(geometry) + 1, lift * 2.5, length);
  };
  render(forward ? corner : turnedCorner(corner));
  playPage({ land: duration, direction: forward ? 1 : -1 });
  return new Promise((resolve) => {
    const started = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const progress = easeInOut(t);
      render(constrainCorner({ width, height, corner, point: cornerPath(corner, width, height, forward ? progress : 1 - progress) }));
      if (t < 1 && host.isConnected) {
        requestAnimationFrame(frame);
        return;
      }
      for (const layer of layers) layer.remove();
      light.remove();
      resolve();
    };
    requestAnimationFrame(frame);
  });
}

// ---------------------------------------------------------------- książka

/**
 * Notatka w stronach. Zwraca { element, pager, layout(), turn(delta), handleWheel(event), handleKey(event),
 * destroy() }.
 * element – miejsce na strony (rozciąga się na dostępną wysokość), pager – przyciski stron.
 * images: [{ url, width, height }]; onOpenImage(index) – dotknięcie obrazu.
 * spread – dwie strony obok siebie na dużym ekranie (wybór zapamiętuje onSpreadChange);
 * imagesFirst – obrazy bez odwołania przed tekstem; numberFigures – podpisy „Rys. N.” (od 1.18);
 * language – język treści ('pl' | 'en'). Podpis obrazu (caption) jest pod nim, wyśrodkowany.
 */
export function noteBook({
  html, images, tables = [], imagesFirst = false, numberFigures = false, language = 'pl', onOpenImage, onLayout = () => {}, spread: spreadChosen = false,
  onSpreadChange = () => {}
}) {
  const labeled = withImageLabels(images);
  const units = contentUnits(html, labeled, imagesFirst, language, numberFigures, withTableLabels(tables, labeled.map((image) => image.label)));
  const element = h('div', { class: 'note-book', dataset: { testid: 'note-book' } });
  const indicator = h('span', { class: 'note-pager__indicator', 'aria-live': 'polite', dataset: { testid: 'note-page-indicator' } });
  const spreadButton = h('button', {
    type: 'button', class: 'icon-button note-pager__button note-pager__spread', 'aria-label': 'Dwie strony obok siebie',
    title: 'Dwie strony obok siebie', 'aria-pressed': String(spreadChosen), dataset: { testid: 'note-spread' },
    onClick: () => {
      if (busy || drag?.active) return;
      spreadChosen = !spreadChosen;
      spreadButton.setAttribute('aria-pressed', String(spreadChosen));
      onSpreadChange(spreadChosen);
      layout();
    }
  }, icon('bookOpen'));
  const previousButton = h('button', {
    type: 'button', class: 'icon-button note-pager__button', 'aria-label': 'Poprzednia strona', title: 'Poprzednia strona',
    dataset: { testid: 'note-page-previous' }, onClick: () => turn(-1)
  }, icon('chevronLeft'));
  const nextButton = h('button', {
    type: 'button', class: 'icon-button note-pager__button', 'aria-label': 'Następna strona', title: 'Następna strona',
    dataset: { testid: 'note-page-next' }, onClick: () => turn(1)
  }, icon('chevronRight'));
  const pager = h('div', { class: 'note-pager', hidden: true }, spreadButton, previousButton, indicator, nextButton);

  let pages = [];
  let elements = [];
  /** Pusta kartka po prawej, gdy w dwóch stronach liczba stron jest nieparzysta. */
  let blank = null;
  /** Numer (od 0) bieżącej strony; w dwóch stronach – lewej. */
  let index = 0;
  let spread = false;
  let busy = false;
  let drag = null;
  let suppressClick = false;
  /** Wielkość książki i okna przy ostatnim podziale na strony. */
  let lastSize = '';
  let resizeTimer = null;
  /** Numer podziału na strony – rośnie przy każdym ponownym podziale (np. po obrocie telefonu). */
  let version = 0;
  let wheelSum = 0;
  let wheelLocked = false;
  let wheelTimer = null;

  /** Ile stron widać naraz. */
  const shown = () => (spread ? 2 : 1);
  const sizeKey = () => `${element.clientWidth}x${element.clientHeight}/${window.innerWidth}x${window.innerHeight}`;
  const at = (number) => elements[number] ?? blank;
  const canTurn = (direction) => {
    const target = index + direction * shown();
    return target >= 0 && target < pages.length;
  };

  function pageElement(page, number, total) {
    return h('section', {
      class: `note-page${page.scroll ? ' note-page--scroll' : ''}`,
      'aria-label': `Strona ${number} z ${total}`,
      dataset: { testid: 'note-page', page: String(number) }
    }, h('div', { class: 'note-page__content' }, page.nodes));
  }

  /** Okno notatki (panel z fokusem) – tam wraca fokus ze znikającej strony. */
  const focusDialog = () => element.closest('.dialog-focus')?.focus({ preventScroll: true });

  /** Zmienia widoczne strony; fokus z usuwanej strony (np. z obrazu) przechodzi na okno. */
  function showPages(...nodes) {
    const inside = element.contains(document.activeElement);
    replaceChildren(element, ...nodes);
    if (inside && !element.contains(document.activeElement)) focusDialog();
  }

  /** Bieżąca strona, a w dwóch stronach – para stron. */
  function showCurrent() {
    showPages(...(spread ? [at(index), at(index + 1)] : [elements[index]]));
  }

  function update() {
    const total = pages.length;
    const active = document.activeElement;
    const last = Math.min(total, index + shown());
    indicator.textContent = last > index + 1 ? `${index + 1}–${last} z ${total}` : `${index + 1} z ${total}`;
    previousButton.disabled = !canTurn(-1);
    nextButton.disabled = !canTurn(1);
    // Wyłączony przycisk traci fokus i klawisze przestałyby działać – fokus wraca na okno.
    if ((active === previousButton && previousButton.disabled) || (active === nextButton && nextButton.disabled)) {
      focusDialog();
    }
    element.dataset.page = String(index + 1);
    element.dataset.pages = String(total);
    element.dataset.spread = String(spread);
  }

  /** Dzieli treść na strony w niewidocznej stronie pomiarowej o wielkości prawdziwej strony. */
  function measurePages() {
    const measure = h('div', { class: `note-page note-page--measure${spread ? ' note-page--left' : ''}`, 'aria-hidden': 'true' },
      h('div', { class: 'note-page__content' }));
    showPages(measure);
    const style = getComputedStyle(measure);
    const available = measure.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const result = paginate(units, images, measure.firstChild, Math.max(120, available), language);
    return result.length > 0 ? result : [{ source: 0, scroll: false, nodes: [] }];
  }

  /**
   * Dzieli treść na strony dla bieżącej wielkości okna i pokazuje stronę z tym samym miejscem
   * treści. Dwie strony obok siebie – gdy są wybrane, okno jest duże, a notatka ma kilka stron.
   */
  function layout() {
    const keep = pages[index]?.source ?? 0;
    element.classList.remove('note-book--single', 'note-book--spread');
    spread = false;
    onLayout('measure');
    pages = measurePages();
    const single = pages.length === 1 && !pages[0].scroll;
    const roomy = spreadAvailable();
    if (!single && roomy && spreadChosen) {
      spread = true;
      element.classList.add('note-book--spread');
      onLayout('measure-spread');
      pages = measurePages();
    }
    elements = pages.map((page, number) => pageElement(page, number + 1, pages.length));
    if (spread) elements.forEach((node, number) => node.classList.add(number % 2 === 0 ? 'note-page--left' : 'note-page--right'));
    blank = spread ? h('section', { class: 'note-page note-page--blank note-page--right', 'aria-hidden': 'true' }) : null;
    // Strona z tym samym miejscem treści: pierwsza zaczynająca się od zapamiętanej jednostki
    // (długi akapit zajmuje kilka stron o tym samym początku), a gdy takiej nie ma – ostatnia przed nią.
    index = 0;
    for (let number = 0; number < pages.length && pages[number].source <= keep; number += 1) {
      index = number;
      if (pages[number].source === keep) break;
    }
    if (spread) index -= index % 2;
    showCurrent();
    element.classList.toggle('note-book--single', single);
    pager.hidden = single;
    spreadButton.hidden = single || !roomy;
    onLayout(single ? 'single' : spread ? 'spread' : 'paged');
    update();
    lastSize = sizeKey();
    version += 1;
  }

  // ---- przewracanie kartek

  /**
   * Kartka do przewrócenia (w jej własnym układzie: grzbiet na x = 0, kartka po prawej).
   * Jedna strona: w przód – bieżąca, wstecz – poprzednia, która leży już przewrócona; na odwrocie
   * prześwituje tekst tej samej strony. Dwie strony: w przód – prawa, wstecz – lewa (układ
   * odbity); na odwrocie jest strona, która po przewróceniu leży po drugiej stronie grzbietu.
   */
  function prepareTurn(direction) {
    const width = spread ? element.clientWidth / 2 : element.clientWidth;
    const height = element.clientHeight;
    let sheet;
    if (spread) {
      const forward = direction > 0;
      sheet = {
        sign: forward ? 1 : -1, spine: width, fromRest: true, backMirror: forward,
        still: at(forward ? index : index + 1),
        turning: at(forward ? index + 1 : index),
        back: at(forward ? index + 2 : index - 1),
        under: at(forward ? index + 3 : index - 2)
      };
    } else {
      const turning = elements[direction > 0 ? index : index - 1];
      sheet = {
        sign: 1, spine: 0, fromRest: direction > 0, backMirror: false, still: null, turning,
        back: h('section', { class: 'note-page note-page--back', 'aria-hidden': 'true', inert: '' },
          turning.querySelector('.note-page__content').cloneNode(true)),
        under: elements[direction > 0 ? index + 1 : index]
      };
    }
    Object.assign(sheet, { width, height, direction, target: index + direction * shown() });
    sheet.cast = h('div', { class: 'note-curl__layer', 'aria-hidden': 'true' }, h('span', { class: 'note-curl__band note-curl__band--cast' }));
    sheet.fold = h('div', { class: 'note-curl__layer', 'aria-hidden': 'true' }, h('span', { class: 'note-curl__band note-curl__band--fold' }));
    sheet.light = h('span', { class: 'note-curl__band note-curl__band--light', 'aria-hidden': 'true' });
    sheet.back.classList.add('note-page--flap');
    Object.assign(sheet.back.style, { left: '0px', top: '0px', width: `${width}px`, height: `${height}px` });
    sheet.back.append(sheet.light);
    sheet.flap = h('div', { class: 'note-curl__flap', 'aria-hidden': 'true' }, h('div', { class: 'note-curl__lift' }, sheet.back));
    element.classList.add('note-book--turning');
    showPages(...[sheet.still, sheet.under, sheet.cast, sheet.turning, sheet.fold, sheet.flap].filter(Boolean));
    return sheet;
  }

  /** Ustawia chwycony punkt kartki i rysuje ją w położeniu początkowym. */
  function grip(sheet, corner) {
    sheet.corner = corner;
    render(sheet, sheet.fromRest ? corner : turnedCorner(corner));
  }

  const constrained = (sheet, point) => constrainCorner({ width: sheet.width, height: sheet.height, corner: sheet.corner, point });

  /**
   * Rysuje kartkę z rogiem w punkcie `point`: płaska część strony, zagięty płat (odwrót kartki
   * odbity względem zgięcia), cień przy zgięciu na płaskiej części, jasny pas na płacie
   * i cień rzucany na stronę pod spodem – rośnie, gdy kartka się unosi.
   */
  function render(sheet, point) {
    sheet.point = point;
    const { width, height, sign } = sheet;
    const geometry = foldGeometry({ width, height, corner: sheet.corner, point });
    const layers = [sheet.cast, sheet.fold, sheet.flap];
    if (!geometry) {
      sheet.turning.style.clipPath = '';
      for (const layer of layers) layer.hidden = true;
      return;
    }
    for (const layer of layers) layer.hidden = false;
    const toStage = [sign, 0, 0, 1, sheet.spine, 0];
    const frontLocal = sign > 0 ? IDENTITY : mirror(width);
    const backLocal = sheet.backMirror ? mirror(width) : IDENTITY;
    const stage = (points) => points.map((point) => applyMatrix(toStage, point));

    sheet.turning.style.clipPath = cssPolygon(geometry.flat.map((vertex) => applyMatrix(frontLocal, vertex)));
    sheet.back.style.transform = cssMatrix(multiply(toStage, multiply(geometry.reflection, backLocal)));
    sheet.back.style.clipPath = cssPolygon(geometry.folded.map((vertex) => applyMatrix(backLocal, vertex)));
    sheet.cast.style.clipPath = cssPolygon(stage(geometry.folded));
    sheet.fold.style.clipPath = cssPolygon(stage(geometry.flat));

    const lift = Math.sin(Math.PI * geometry.progress);
    const length = 2 * (width + height);
    const origin = applyMatrix(toStage, geometry.point);
    const normal = { x: sign * geometry.normal.x, y: geometry.normal.y };
    placeBand(sheet.cast.firstChild, origin, normal, width * (0.04 + 0.2 * lift), lift * 1.6, length);
    placeBand(sheet.fold.firstChild, origin, { x: -normal.x, y: -normal.y }, width * (0.03 + 0.12 * lift), lift * 2, length);
    const backNormal = { x: (sheet.backMirror ? -1 : 1) * geometry.normal.x, y: geometry.normal.y };
    // Jasny pas obejmuje cały płat – jego koniec wypada na najdalszym punkcie płata, bez widocznej granicy.
    placeBand(sheet.light, applyMatrix(backLocal, geometry.point), backNormal, foldDepth(geometry) + 1, lift * 2.5, length);
  }

  /** Ruch rogu po drodze `path` (t = 0..1) w czasie `duration`. */
  function animate(sheet, path, duration, easing) {
    return new Promise((resolve) => {
      const started = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - started) / duration);
        render(sheet, path(easing(t)));
        if (t < 1 && element.isConnected) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  /** Kończy przewracanie: strony wracają na swoje miejsca bez stylów obrotu. */
  function finishTurn(sheet, completed) {
    sheet.light.remove();
    for (const node of [sheet.still, sheet.turning, sheet.back, sheet.under]) {
      if (!node) continue;
      node.classList.remove('note-page--flap');
      for (const property of ['clipPath', 'transform', 'left', 'top', 'width', 'height']) node.style[property] = '';
    }
    element.classList.remove('note-book--turning');
    if (completed) index = sheet.target;
    showCurrent();
    update();
  }

  /** Przewraca kartkę (przyciski, klawisze): róg idzie łukiem od dolnego rogu strony. */
  async function turn(delta) {
    const direction = delta > 0 ? 1 : -1;
    if (busy || drag?.active || !canTurn(direction)) return;
    if (reducedMotion()) {
      index += direction * shown();
      showCurrent();
      update();
      return;
    }
    busy = true;
    const step = prepareTurn(direction);
    grip(step, cornerOf('bottom', step.width, step.height));
    const { corner, width, height } = step;
    playPage({ land: TURN_DURATION, direction });
    await animate(step, (t) => constrained(step, cornerPath(corner, width, height, step.fromRest ? t : 1 - t)), TURN_DURATION, easeInOut);
    finishTurn(step, true);
    busy = false;
  }

  // ---- gest: róg kartki idzie za palcem (myszą – za narożnik strony)

  /** Narożnik strony pod kursorem myszy, za który można chwycić kartkę: { direction } albo null. */
  function cornerZone(event) {
    if (busy || pages.length < 2 || element.classList.contains('note-book--single')) return null;
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (y > MOUSE_CORNER && y < rect.height - MOUSE_CORNER) return null;
    if (x > rect.width - MOUSE_CORNER && canTurn(1)) return { direction: 1 };
    if (x < MOUSE_CORNER && canTurn(-1)) return { direction: -1 };
    return null;
  }

  /**
   * Róg kartki dla przesunięcia palca (dx, dy). Kartka leżąca płasko: róg idzie za palcem.
   * Jedna strona wstecz (kartka wraca spoza lewej krawędzi): zgięcie idzie za palcem.
   */
  function dragPoint(step, dx, dy) {
    const { width, height, corner } = step;
    const along = step.sign * dx;
    const x = step.fromRest ? corner.x + Math.min(0, along) : -width + 2 * Math.max(0, along);
    const progress = (corner.x - x) / (2 * width);
    return constrained(step, { x, y: corner.y + dy + cornerLift(corner, width, height, progress) });
  }

  element.addEventListener('pointerdown', (event) => {
    if (busy || drag || pages.length < 2 || reducedMotion()) return;
    const zone = event.pointerType === 'mouse' ? cornerZone(event) : null;
    if (event.pointerType === 'mouse') {
      // Myszą zaznacza się tekst – kartkę chwyta się tylko za narożnik.
      if (event.button !== 0 || !zone) return;
      event.preventDefault();
    }
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, active: false, zone };
  });
  element.addEventListener('pointermove', (event) => {
    if (!drag) {
      if (event.pointerType === 'mouse') element.classList.toggle('note-book--grab', Boolean(cornerZone(event)));
      return;
    }
    if (drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      let direction = drag.zone?.direction;
      if (drag.zone) {
        if (Math.hypot(dx, dy) < 4) return;
      } else {
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
          drag = null;
          return;
        }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        direction = dx < 0 ? 1 : -1;
      }
      if (!canTurn(direction)) {
        drag = null;
        return;
      }
      drag.active = true;
      drag.step = prepareTurn(direction);
      const y = drag.y - element.getBoundingClientRect().top;
      grip(drag.step, cornerOf(gripOf(y, drag.step.height), drag.step.width, drag.step.height, y));
      element.classList.add('note-book--dragging');
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // bez przechwycenia gest nadal działa
      }
    }
    event.preventDefault();
    render(drag.step, dragPoint(drag.step, dx, dy));
  });
  const release = async (event, cancelled) => {
    if (!drag || drag.id !== event.pointerId) return;
    const current = drag;
    drag = null;
    if (!current.active) {
      // Kliknięcie w narożnik bez przeciągania – kartka przewraca się sama.
      if (current.zone && !cancelled) turn(current.zone.direction);
      return;
    }
    element.classList.remove('note-book--dragging');
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const step = current.step;
    const dx = event.clientX - current.x;
    const along = step.sign * dx * (step.fromRest ? -1 : 1);
    const moved = Math.max(0, along) / step.width;
    const speed = Math.abs(dx) / Math.max(1, event.timeStamp - current.time);
    const completed = !cancelled && (moved > TURN_THRESHOLD || (speed > 0.5 && moved > 0.07));
    busy = true;
    const from = step.point;
    const goal = completed === step.fromRest ? turnedCorner(step.corner) : step.corner;
    const distance = Math.hypot(goal.x - from.x, goal.y - from.y);
    const duration = Math.max(140, (TURN_DURATION * 0.8 * distance) / (2 * step.width));
    // Puszczona kartka: końcówka dźwięku – klapnięcie razem z końcem animacji.
    if (completed) playPage({ land: TURN_DURATION, direction: step.direction, remaining: duration });
    await animate(step, (t) => constrained(step, { x: from.x + (goal.x - from.x) * t, y: from.y + (goal.y - from.y) * t }), duration, easeOut);
    finishTurn(step, completed);
    busy = false;
  };
  element.addEventListener('pointerup', (event) => release(event, false));
  element.addEventListener('pointercancel', (event) => release(event, true));
  element.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' && !drag) element.classList.remove('note-book--grab');
  });
  // Przeciąganie narożnika myszą nie zaznacza tekstu.
  element.addEventListener('selectstart', (event) => {
    if (drag) event.preventDefault();
  });

  element.addEventListener('click', (event) => {
    const target = event.target.closest('.note-page__figure');
    if (!target || suppressClick) return;
    onOpenImage(Number(target.dataset.index));
  });

  // Nowy podział na strony, gdy zmieni się wielkość okna albo widocznej części ekranu. Na iPhonie
  // klawiatura zmienia tylko tę drugą (visualViewport), a okno notatki rośnie i maleje razem
  // z nią – notatka zapisana przy otwartej klawiaturze dzieli się od nowa, gdy klawiatura się schowa.
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!element.isConnected) return;
      if (busy || drag?.active) {
        onResize();
        return;
      }
      if (sizeKey() !== lastSize) layout();
    }, 150);
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);

  /** Czy strona przewijana (wyjątek dla bardzo długiego bloku) może się jeszcze przewinąć w tę stronę. */
  const canScroll = (scroller, delta) => (delta > 0
    ? scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1
    : scroller.scrollTop > 0);

  return {
    element,
    pager,
    layout,
    turn,
    /** Numer podziału na strony (zmienia się po ponownym podziale). */
    get version() {
      return version;
    },
    /** Widoczne strony (numery od 0). */
    visiblePages() {
      return spread ? [index, index + 1].filter((number) => number < pages.length) : [index];
    },
    /**
     * Fragmenty treści do czytania na głos, w kolejności: [{ text, page, element }] – nagłówki,
     * akapity i punkty list (punkt bez list zagnieżdżonych); bez obrazów i odwołań bez obrazu.
     */
    readingParts() {
      const parts = [];
      elements.forEach((pageElement, page) => {
        for (const block of pageElement.querySelectorAll('.note-page__text h3, .note-page__text p, .note-page__text li, .note-page__text tr')) {
          if (block.classList.contains('note-ref--missing')) continue;
          const copy = block.cloneNode(true);
          // Wiersz tabeli (od 1.21) – komórki po przecinku.
          if (block.tagName === 'TR') for (const cell of [...copy.cells].slice(0, -1)) cell.append(', ');
          for (const nested of copy.querySelectorAll('ul, ol')) nested.remove();
          // Wzór czytany słowami („x do kwadratu”), nie znak po znaku.
          for (const math of copy.querySelectorAll('math')) math.replaceWith(` ${math.getAttribute('data-spoken') ?? ''} `);
          const text = copy.textContent.replace(/\s+/g, ' ').trim();
          if (text) parts.push({ text, page, element: block });
        }
      });
      return parts;
    },
    /** Pokazuje stronę (numer od 0): sąsiednią przewraca jak kartkę, dalszą – od razu. */
    async showPage(page) {
      const first = spread ? page - (page % 2) : page;
      if (first === index || first < 0 || first >= pages.length || busy || drag?.active) return;
      if (first === index + shown()) await turn(1);
      else if (first === index - shown()) await turn(-1);
      else {
        index = first;
        showCurrent();
        update();
      }
    },
    /**
     * Kółko myszy i przewijanie na gładziku: w dół (albo w lewo na gładziku) – następna strona,
     * w górę – poprzednia. Jeden ruch to jedna kartka: kolejną przewraca dopiero ruch po chwili
     * ciszy (bezwładność gładzika nie przerzuca kilku stron). Strona przewijana najpierw się
     * przewija. Zwraca true, gdy zdarzenie obsłużono (wtedy okno się nie przewija).
     */
    handleWheel(event) {
      if (pages.length < 2 || event.ctrlKey || element.classList.contains('note-book--single')) return false;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const delta = (Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX) * unit;
      if (delta === 0) return false;
      const scroller = event.target?.closest?.('.note-page--scroll');
      if (scroller && element.contains(scroller) && canScroll(scroller, delta)) return false;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelLocked = false;
        wheelSum = 0;
      }, WHEEL_QUIET);
      if (wheelLocked || busy || drag) return true;
      // Zmiana kierunku zaczyna liczenie od nowa.
      wheelSum = Math.sign(wheelSum) === Math.sign(delta) ? wheelSum + delta : delta;
      if (Math.abs(wheelSum) >= WHEEL_STEP) {
        wheelLocked = true;
        const direction = Math.sign(wheelSum);
        wheelSum = 0;
        if (canTurn(direction)) turn(direction);
      }
      return true;
    },
    /** Klawisze stron: ←/→, Page Up/Down, Home/End. Zwraca true, gdy klawisz obsłużono. */
    handleKey(event) {
      if (pages.length < 2 || event.altKey || event.ctrlKey || event.metaKey) return false;
      const target = event.target;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')) return false;
      const step = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 }[event.key];
      if (step) {
        turn(step);
        return true;
      }
      if (event.key === 'Home' || event.key === 'End') {
        const last = pages.length - 1;
        const target = event.key === 'Home' ? 0 : last - (spread ? last % 2 : 0);
        if (target !== index && !busy) {
          index = target;
          showCurrent();
          update();
        }
        return true;
      }
      return false;
    },
    destroy() {
      clearTimeout(resizeTimer);
      clearTimeout(wheelTimer);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    }
  };
}
