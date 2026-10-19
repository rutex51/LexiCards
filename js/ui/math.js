// Wzory w notatce (od 1.11): zapis z core/math.js zamieniany na MathML, który przeglądarka składa
// sama (Safari, Chrome i Edge – bez bibliotek i bez internetu); zamiana $…$ w tekście notatki na
// wzory i ściągawka zapisu w edytorze (okno pod ikoną info).

import { MATH_CHEATSHEET, mathSegments, parseMath, spokenMath } from '../core/math.js';
import { field, textInput } from './components.js';
import { openFormSheet } from './dialogs.js';
import { h } from './dom.js';

const MATHML = 'http://www.w3.org/1998/Math/MathML';

/** Czy przeglądarka składa wzory MathML (bez tego zapis zostaje tekstem). */
export function mathSupported() {
  return typeof window.MathMLElement === 'function';
}

function element(tag, attributes = {}, ...children) {
  const node = document.createElementNS(MATHML, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined && value !== false) node.setAttribute(name, String(value));
  }
  for (const child of children.flat()) if (child) node.append(child);
  return node;
}

/** Nawiasy otwierające i zamykające – bez odstępów od sąsiadów („n(n+1)”, nie „n ( n + 1 )”). */
const OPENING = new Set(['(', '[', '{', '⟨', '⌊', '⌈']);
const CLOSING = new Set([')', ']', '}', '⟩', '⌋', '⌉']);
/** Niewidoczne „zastosowanie funkcji” po nazwie funkcji (dla czytników ekranu). */
const APPLY_FUNCTION = '\u2061';

const isFunction = (node) => Boolean(node.fn || (node.t === 'scripts' && node.base.fn));
const opensWithBracket = (node) => (node?.t === 'o' && OPENING.has(node.v)) || node?.t === 'fence';

/** Elementy ciągu; po nazwie funkcji mały odstęp („sin x”), ale nie przed nawiasem („sin(x)”). */
function buildRow(children) {
  return children.flatMap((child, index) => {
    if (!isFunction(child)) return [build(child)];
    const next = children[index + 1];
    return [
      build(child),
      element('mo', {}, APPLY_FUNCTION),
      next && !opensWithBracket(next) ? element('mspace', { width: '0.1667em' }) : null
    ].filter(Boolean);
  });
}

/** Węzeł drzewa zapisu → element MathML. */
function build(node) {
  switch (node.t) {
    case 'row':
      return element('mrow', {}, buildRow(node.c));
    case 'i':
      // Lim, max… z granicami – jak znak działania (granice pod spodem tylko we wzorze w osobnym wierszu).
      if (node.limits) return element('mo', { movablelimits: 'true', form: 'prefix' }, node.v);
      return element('mi', {
        // Jedna litera jest domyślnie pochylona; nazwy funkcji i wielkie litery greckie – proste.
        mathvariant: node.upright && [...node.v].length === 1 ? 'normal' : null,
        class: node.bold ? 'math-bold' : null
      }, node.v);
    case 'n':
      return element('mn', { class: node.bold ? 'math-bold' : null }, node.v);
    case 'o':
      return element('mo', {
        form: OPENING.has(node.v) ? 'prefix' : (CLOSING.has(node.v) ? 'postfix' : null),
        largeop: node.large ? 'true' : null,
        movablelimits: node.limits ? 'true' : null
      }, node.v);
    case 'text':
      // Odstępy na brzegach tekstu (np. \text{ m/s}) zostają.
      return element('mtext', {}, node.v.replace(/ /g, ' '));
    case 'frac':
      return element('mfrac', { linethickness: node.line === false ? '0' : null }, build(node.a), build(node.b));
    case 'sqrt':
      return node.index ? element('mroot', {}, build(node.a), build(node.index)) : element('msqrt', {}, build(node.a));
    case 'scripts': {
      const limits = node.base.limits;
      const both = node.sub && node.sup;
      const tag = limits
        ? (both ? 'munderover' : (node.sub ? 'munder' : 'mover'))
        : (both ? 'msubsup' : (node.sub ? 'msub' : 'msup'));
      return element(tag, {}, build(node.base), node.sub ? build(node.sub) : null, node.sup ? build(node.sup) : null);
    }
    case 'accent': {
      const mark = element('mo', { stretchy: /[‾→]/.test(node.v) ? 'true' : 'false' }, node.v);
      return node.under
        ? element('munder', { accentunder: 'true' }, build(node.base), mark)
        : element('mover', { accent: 'true' }, build(node.base), mark);
    }
    case 'fence':
      return element('mrow', {},
        node.open ? element('mo', { fence: 'true', stretchy: 'true' }, node.open) : null,
        build(node.body),
        node.close ? element('mo', { fence: 'true', stretchy: 'true' }, node.close) : null);
    case 'space':
      return element('mspace', { width: `${node.w}em` });
    case 'error':
      return element('mtext', { class: 'math-error' }, node.v);
    default:
      return element('mrow');
  }
}

/**
 * Wzór jako element <math>: display – w osobnym wierszu. data-source – zapis (kopiowanie),
 * data-spoken – słowny odpowiednik (czytanie na głos w języku notatki).
 */
export function mathElement(source, { display = false, language = 'pl' } = {}) {
  const { tree, errors } = parseMath(source);
  const math = element('math', { display: display ? 'block' : null, class: errors.length > 0 ? 'math-has-error' : null }, build(tree));
  math.setAttribute('data-source', source);
  math.setAttribute('data-spoken', spokenMath(source, language));
  return math;
}

/** Zamienia zapis $…$ i $$…$$ w tekście elementu na wzory. Zwraca liczbę wzorów. */
export function renderMath(root, language = 'pl') {
  if (!mathSupported() || !root.textContent.includes('$')) return 0;
  const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.data.includes('$') && !node.parentElement?.closest('math')) nodes.push(node);
  }
  let count = 0;
  for (const node of nodes) {
    const parts = mathSegments(node.data);
    if (!parts.some((part) => part.type === 'math')) {
      // Same znaki \$ – zwykłe dolary.
      const plain = parts.map((part) => part.text).join('');
      if (plain !== node.data) node.data = plain;
      continue;
    }
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      if (part.type === 'math') {
        fragment.append(mathElement(part.source, { display: part.display, language }));
        count += 1;
      } else fragment.append(part.text);
    }
    node.replaceWith(fragment);
  }
  return count;
}

/** Wzór (albo zwykły tekst) w wierszu ściągawki. */
function sample(item) {
  if (item.plain) return h('span', { class: 'math-help__plain' }, item.plain);
  return mathElement(item.source, { display: Boolean(item.display) });
}

/**
 * Ściągawka zapisu wzorów z polem do wypróbowania. Dotknięcie przykładu wpisuje go do pola;
 * onInsert(tekst) – „Wstaw” dokłada wypróbowany wzór do notatki ($…$). Bez onInsert – tylko podgląd.
 */
export function openMathHelp({ onInsert = null } = {}) {
  let value = '';
  let sheet = null;
  let pending = null;
  const preview = h('div', { class: 'math-try__preview', 'aria-live': 'polite', dataset: { testid: 'math-preview' } });
  const message = h('p', { class: 'field__hint', dataset: { testid: 'math-message' } });
  const input = textInput({
    value, placeholder: 'np. \\frac{a}{b} + x^2', autocapitalize: 'off', testID: 'math-try',
    onInput: (text) => {
      value = text;
      update();
    }
  });
  input.spellcheck = false;
  input.setAttribute('autocorrect', 'off');
  input.lang = 'en';

  function update() {
    const source = value.trim();
    if (source === '') {
      preview.replaceChildren(h('span', { class: 'math-try__empty' }, 'Tu pojawi się wzór.'));
      message.textContent = 'Wpisz zapis albo dotknij przykładu poniżej.';
    } else {
      preview.replaceChildren(mathElement(source, { display: true }));
      const { errors } = parseMath(source);
      message.textContent = errors.length > 0 ? errors.join(' ') : `W notatce wpisz: $${source}$`;
      message.classList.toggle('math-try__message--error', errors.length > 0);
    }
    sheet?.setCanSubmit(source !== '' || !onInsert);
  }

  const groups = MATH_CHEATSHEET.map((group) => h('section', { class: 'math-help__group' },
    h('h3', { class: 'form-group__title' }, group.title),
    h('ul', { class: 'math-help__list', role: 'list' }, group.items.map((item) => h('li', null,
      h('button', {
        type: 'button', class: 'math-help__item', dataset: { testid: 'math-example' },
        'aria-label': `${item.note}: ${item.source}`,
        onClick: () => {
          if (item.plain) return;
          value = item.source;
          input.value = value;
          update();
          input.focus({ preventScroll: true });
          preview.scrollIntoView({ block: 'nearest' });
        }
      },
        h('span', { class: 'math-help__result' }, sample(item)),
        h('span', { class: 'math-help__text' },
          h('code', { class: 'math-help__source' }, item.plain ? item.source : item.display ? `$$${item.source}$$` : item.source),
          h('span', { class: 'math-help__note' }, item.note))
      ))))));

  sheet = openFormSheet({
    title: 'Równania',
    cancelLabel: 'Zamknij',
    submitLabel: onInsert ? 'Wstaw' : 'Gotowe',
    build: () => [
      h('p', { class: 'field__hint math-help__intro' },
        'Wzór wpisujesz w tekście notatki między znakami dolara: $x^2$. W podglądzie notatki zapis zamienia się we wzór; ',
        'w edytorze zostaje tekstem, więc łatwo go poprawić. Do czytania na głos wzór zamienia się w słowa.'),
      h('div', { class: 'math-try' }, field('Wypróbuj', input), preview, message),
      ...groups
    ],
    onSubmit: () => {
      const source = value.trim();
      if (onInsert && source !== '') pending = `$${source}$`;
    },
    // Wstawienie dopiero po zamknięciu okna – dopóki jest otwarte, edytor pod spodem jest zablokowany.
    onClose: () => {
      if (pending) onInsert(pending);
    }
  });
  update();
  return sheet;
}
