// Notatka w stronach: treść dzielona na strony mieszczące się w oknie (bez przewijania)
// i przewracanie kartek – gestem, przyciskami i klawiszami – z efektem książki.
//
// Strony liczy przeglądarka, mierząc treść w niewidocznej stronie tej samej wielkości:
//   - bloki (akapity, nagłówki, punkty list) trafiają na stronę po kolei;
//   - akapit albo punkt listy, który się nie mieści, jest dzielony między wyrazami
//     (formatowanie zostaje po obu stronach podziału), a numeracja listy biegnie dalej;
//   - nagłówek nie zostaje sam na dole strony – przechodzi z treścią na następną;
//   - „Nowa strona” wstawiona w edytorze (<hr data-page>) zaczyna nową stronę;
//   - obrazy są po tekście, każdy zmniejszony najwyżej do wysokości strony;
//   - blok, którego nie da się podzielić (np. bardzo długa lista zagnieżdżona), dostaje stronę
//     przewijaną – to jedyny wyjątek od zasady „bez przewijania”.
// Krótka notatka (jedna strona) wygląda jak dawniej: karta o wysokości treści.

import { normalizeNoteHtml } from '../core/note-format.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';

/** Czas pełnego obrotu kartki (ms) i kąt, przy którym kartka znika za krawędzią. */
const TURN_DURATION = 560;
const TURN_ANGLE = -100;
const TURN_EASING = 'cubic-bezier(0.32, 0.06, 0.22, 1)';
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
 * listID, number } | { kind: 'break' } | { kind: 'image', index }. `source` – numer jednostki
 * w notatce (do odnalezienia strony po ponownym podziale).
 */
function contentUnits(html, imageCount) {
  const template = document.createElement('template');
  template.innerHTML = normalizeNoteHtml(html);
  const root = document.importNode(template.content, true);
  const units = [];
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
      units.push({ kind: 'block', node });
    }
  }
  for (let index = 0; index < imageCount; index += 1) units.push({ kind: 'image', index });
  return units.map((unit, source) => ({ ...unit, source }));
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

/** Miejsca, w których można przełamać tekst: początki wyrazów (po odstępie). */
function wordStarts(text) {
  const starts = [];
  for (let index = 1; index < text.length; index += 1) {
    if (/\s/.test(text[index - 1]) && !/\s/.test(text[index])) starts.push(index);
  }
  return starts;
}

/** Czy jednostkę można dzielić między stronami: akapit albo punkt listy bez list zagnieżdżonych. */
function splittable(unit) {
  if (unit.kind === 'item') return !unit.node.querySelector('ul, ol');
  return unit.kind === 'block' && unit.node.tagName === 'P';
}

// ---------------------------------------------------------------- podział na strony

/**
 * Dzieli jednostki na strony. content – pusty element w niewidocznej stronie pomiarowej
 * (ta sama szerokość i style co prawdziwa strona), available – wysokość treści strony.
 * Zwraca [{ source, scroll, nodes }].
 */
function paginate(units, images, content, available) {
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
  const used = () => content.getBoundingClientRect().height;
  const fits = () => used() <= available + 0.5;

  const ratioOf = (unit) => {
    const meta = images[unit.index] ?? {};
    return meta.width && meta.height ? meta.width / meta.height : 4 / 3;
  };
  /** Wysokość obrazu na stronie: cała szerokość strony, najwyżej cała wysokość (albo `limit`). */
  const imageHeight = (unit, limit = available) => Math.max(40, Math.min(width / ratioOf(unit), available, limit));

  const figure = (unit) => {
    const meta = images[unit.index] ?? {};
    const ratio = ratioOf(unit);
    const height = imageHeight(unit, unit.limit ?? available);
    return h('button', {
      type: 'button',
      class: 'note-page__figure',
      style: { height: `${height}px` },
      'aria-label': `Powiększ obraz ${unit.index + 1} z ${images.length}`,
      dataset: { index: String(unit.index) }
    }, h('img', {
      src: meta.url, alt: '', draggable: 'false',
      style: { width: `${Math.min(width, height * ratio)}px`, height: `${height}px` }
    }));
  };

  /** Dokłada jednostkę na bieżącą stronę; zwraca funkcję cofającą. */
  const append = (unit) => {
    if (unit.kind === 'image') {
      const node = figure(unit);
      content.append(node);
      const previous = list;
      list = null;
      return () => { node.remove(); list = previous; };
    }
    let createdText = false;
    if (!text) {
      text = h('div', { class: 'note-text note-page__text', lang: 'pl', dataset: { testid: 'note-text' } });
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
    const node = unit.node.cloneNode(true);
    text.append(node);
    const previous = list;
    list = null;
    return () => { node.remove(); list = previous; undoText(); };
  };

  /** Największy początek tekstu jednostki, który mieści się na bieżącej stronie: [pierwsza, reszta]. */
  const split = (unit) => {
    if (!splittable(unit)) return null;
    const full = unit.node.textContent;
    const starts = wordStarts(full);
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
    return [
      { ...unit, node: textSlice(unit.node, 0, cut) },
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

// ---------------------------------------------------------------- książka

/**
 * Notatka w stronach. Zwraca { element, pager, layout(), turn(delta), handleKey(event), destroy() }.
 * element – miejsce na strony (rozciąga się na dostępną wysokość), pager – przyciski stron.
 * images: [{ url, width, height }]; onOpenImage(index) – dotknięcie obrazu.
 */
export function noteBook({ html, images, onOpenImage, onLayout = () => {} }) {
  const units = contentUnits(html, images.length);
  const element = h('div', { class: 'note-book', dataset: { testid: 'note-book' } });
  const indicator = h('span', { class: 'note-pager__indicator', 'aria-live': 'polite', dataset: { testid: 'note-page-indicator' } });
  const previousButton = h('button', {
    type: 'button', class: 'icon-button note-pager__button', 'aria-label': 'Poprzednia strona', title: 'Poprzednia strona',
    dataset: { testid: 'note-page-previous' }, onClick: () => turn(-1)
  }, icon('chevronLeft'));
  const nextButton = h('button', {
    type: 'button', class: 'icon-button note-pager__button', 'aria-label': 'Następna strona', title: 'Następna strona',
    dataset: { testid: 'note-page-next' }, onClick: () => turn(1)
  }, icon('chevronRight'));
  const pager = h('div', { class: 'note-pager', hidden: true }, previousButton, indicator, nextButton);

  let pages = [];
  let elements = [];
  let index = 0;
  let busy = false;
  let drag = null;
  let suppressClick = false;
  let lastSize = '';
  let resizeTimer = null;

  const shade = (page) => page.querySelector('.note-page__shade');
  /** Przyciemnienie obracanej kartki i kartki pod nią w zależności od kąta. */
  const turnShade = (angle) => Math.min(1, -angle / 90) * 0.55;
  const underShade = (angle) => (1 - Math.min(1, -angle / 90)) * 0.4;

  function pageElement(page, number, total) {
    return h('section', {
      class: `note-page${page.scroll ? ' note-page--scroll' : ''}`,
      'aria-label': `Strona ${number} z ${total}`,
      dataset: { testid: 'note-page', page: String(number) }
    },
      h('div', { class: 'note-page__content' }, page.nodes),
      h('span', { class: 'note-page__shade', 'aria-hidden': 'true' })
    );
  }

  /** Okno notatki (panel z fokusem) – tam wraca fokus ze znikającej strony. */
  const focusDialog = () => element.closest('.dialog-focus')?.focus({ preventScroll: true });

  /** Zmienia widoczne strony; fokus z usuwanej strony (np. z obrazu) przechodzi na okno. */
  function showPages(...nodes) {
    const inside = element.contains(document.activeElement);
    replaceChildren(element, ...nodes);
    if (inside && !element.contains(document.activeElement)) focusDialog();
  }

  function update() {
    const total = pages.length;
    const active = document.activeElement;
    indicator.textContent = `${index + 1} z ${total}`;
    previousButton.disabled = index === 0;
    nextButton.disabled = index >= total - 1;
    // Wyłączony przycisk traci fokus i klawisze przestałyby działać – fokus wraca na okno.
    if ((active === previousButton && previousButton.disabled) || (active === nextButton && nextButton.disabled)) {
      focusDialog();
    }
    element.dataset.page = String(index + 1);
    element.dataset.pages = String(total);
    element.dataset.more = index < total - 1 ? 'true' : 'false';
  }

  /** Dzieli treść na strony dla bieżącej wielkości okna i pokazuje stronę z tym samym miejscem treści. */
  function layout() {
    const keep = pages[index]?.source ?? 0;
    element.classList.remove('note-book--single');
    onLayout('measure');
    const measure = h('div', { class: 'note-page note-page--measure', 'aria-hidden': 'true' },
      h('div', { class: 'note-page__content' }));
    showPages(measure);
    const style = getComputedStyle(measure);
    const available = measure.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    pages = paginate(units, images, measure.firstChild, Math.max(120, available));
    if (pages.length === 0) pages = [{ source: 0, scroll: false, nodes: [] }];
    elements = pages.map((page, number) => pageElement(page, number + 1, pages.length));
    index = 0;
    for (let number = 0; number < pages.length; number += 1) if (pages[number].source <= keep) index = number;
    showPages(elements[index]);
    const single = pages.length === 1 && !pages[0].scroll;
    element.classList.toggle('note-book--single', single);
    pager.hidden = single;
    onLayout(single ? 'single' : 'paged');
    update();
    lastSize = `${window.innerWidth}x${window.innerHeight}`;
  }

  // ---- przewracanie kartek

  /** Obrót kartki od kąta `from` do `to`; `other` – strona pod nią (cień maleje lub rośnie). */
  async function animateTurn(page, other, from, to) {
    const duration = Math.max(120, TURN_DURATION * (Math.abs(to - from) / Math.abs(TURN_ANGLE)));
    const options = { duration, easing: TURN_EASING, fill: 'forwards' };
    const animations = [
      page.animate([{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }], options),
      shade(page).animate([{ opacity: turnShade(from) }, { opacity: turnShade(to) }], options),
      shade(other).animate([{ opacity: underShade(from) }, { opacity: underShade(to) }], options)
    ];
    try {
      await animations[0].finished;
    } catch {
      // przerwane (np. zamknięcie okna) – stan i tak zostanie uporządkowany
    }
    for (const animation of animations) animation.cancel();
    for (const node of [page, other]) {
      node.style.transform = '';
      shade(node).style.opacity = '';
    }
  }

  /** Strony przygotowane do obrotu: w przód – następna pod bieżącą; wstecz – poprzednia nad nią. */
  function prepare(direction) {
    const current = elements[index];
    const incoming = elements[index + direction];
    if (direction > 0) {
      element.insertBefore(incoming, current);
      return { turning: current, under: incoming, from: 0, to: TURN_ANGLE, target: index + 1 };
    }
    incoming.style.transform = `rotateY(${TURN_ANGLE}deg)`;
    element.append(incoming);
    return { turning: incoming, under: current, from: TURN_ANGLE, to: 0, target: index - 1 };
  }

  function finish(turn, completed) {
    const keepElement = completed ? elements[turn.target] : elements[index];
    for (const node of [turn.turning, turn.under]) {
      if (node === keepElement) continue;
      const hadFocus = node.contains(document.activeElement);
      node.remove();
      if (hadFocus) focusDialog();
    }
    if (completed) index = turn.target;
    update();
  }

  async function turn(delta) {
    const target = index + delta;
    if (busy || drag?.active || target < 0 || target >= pages.length) return;
    if (reducedMotion() || typeof elements[index].animate !== 'function') {
      showPages(elements[target]);
      index = target;
      update();
      return;
    }
    busy = true;
    const step = prepare(delta > 0 ? 1 : -1);
    await animateTurn(step.turning, step.under, step.from, step.to);
    finish(step, true);
    busy = false;
  }

  // ---- gest: przeciągnięcie palcem obraca kartkę razem z palcem

  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || busy || pages.length < 2) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, active: false };
  });
  element.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
        drag = null;
        return;
      }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const direction = dx < 0 ? 1 : -1;
      if (index + direction < 0 || index + direction >= pages.length || reducedMotion()) {
        drag = null;
        return;
      }
      drag.active = true;
      drag.step = prepare(direction);
      drag.direction = direction;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // bez przechwycenia gest nadal działa
      }
    }
    event.preventDefault();
    const width = element.clientWidth || 1;
    const progress = Math.min(1, Math.max(0, (drag.direction > 0 ? -dx : dx) / (width * 0.9)));
    drag.progress = progress;
    const angle = drag.direction > 0 ? TURN_ANGLE * progress : TURN_ANGLE * (1 - progress);
    drag.angle = angle;
    drag.step.turning.style.transform = `rotateY(${angle}deg)`;
    shade(drag.step.turning).style.opacity = String(turnShade(angle));
    shade(drag.step.under).style.opacity = String(underShade(angle));
  });
  const release = async (event, cancelled) => {
    if (!drag || drag.id !== event.pointerId) return;
    const current = drag;
    drag = null;
    if (!current.active) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const dx = event.clientX - current.x;
    const speed = Math.abs(dx) / Math.max(1, event.timeStamp - current.time);
    const completed = !cancelled && (current.progress > 0.3 || (speed > 0.5 && current.progress > 0.08));
    busy = true;
    const step = current.step;
    const end = completed ? step.to : step.from;
    await animateTurn(step.turning, step.under, current.angle ?? step.from, end);
    finish(step, completed);
    busy = false;
  };
  element.addEventListener('pointerup', (event) => release(event, false));
  element.addEventListener('pointercancel', (event) => release(event, true));

  element.addEventListener('click', (event) => {
    const target = event.target.closest('.note-page__figure');
    if (!target || suppressClick) return;
    onOpenImage(Number(target.dataset.index));
  });

  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (busy || drag?.active || !element.isConnected) return;
      if (`${window.innerWidth}x${window.innerHeight}` !== lastSize) layout();
    }, 150);
  };
  window.addEventListener('resize', onResize);

  return {
    element,
    pager,
    layout,
    turn,
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
        const target = event.key === 'Home' ? 0 : pages.length - 1;
        if (target !== index && !busy) {
          showPages(elements[target]);
          index = target;
          update();
        }
        return true;
      }
      return false;
    },
    destroy() {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    }
  };
}
