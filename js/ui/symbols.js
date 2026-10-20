// Wybór symboli (od 1.20): panel z ostatnio użytymi i grupami znaków – w edytorze notatki pod
// paskiem formatowania, w rysunku pod polem tekstu. Ostatnio użyte są zapamiętane na urządzeniu
// (wspólne dla notatek i rysunku).

import { SYMBOL_GROUPS, SYMBOL_NAMES, cleanRecentSymbols, rememberSymbol } from '../core/symbols.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';

const RECENT_KEY = 'lexicards-recent-symbols';

/** Ostatnio wybrane symbole (najnowszy pierwszy). */
export function readRecentSymbols() {
  try {
    return cleanRecentSymbols(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

function saveRecentSymbol(symbol) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(rememberSymbol(readRecentSymbols(), symbol)));
  } catch {
    // Pamięć urządzenia niedostępna – bez listy ostatnich.
  }
}

/**
 * Panel symboli: onPick(symbol) po dotknięciu. Przyciski nie zabierają fokusu polu tekstu
 * (kursor zostaje w miejscu). Zwraca { element, refresh() } – refresh odświeża „Ostatnio użyte”.
 */
export function symbolPanel({ onPick, testID = 'symbols', className = '' }) {
  const element = h('div', { class: `symbols ${className}`.trim(), role: 'group', 'aria-label': 'Symbole', dataset: { testid: testID } });
  const button = (symbol) => h('button', {
    type: 'button',
    class: 'symbols__item',
    'aria-label': SYMBOL_NAMES[symbol] ?? symbol,
    title: SYMBOL_NAMES[symbol] ? `${symbol} – ${SYMBOL_NAMES[symbol]}` : symbol,
    dataset: { testid: `${testID}-item` },
    onMousedown: (event) => event.preventDefault(),
    onClick: () => {
      saveRecentSymbol(symbol);
      onPick(symbol);
      refresh();
    }
  }, symbol);
  const section = (label, symbols, id) => h('div', { class: 'symbols__group', dataset: { testid: `${testID}-${id}` } },
    h('p', { class: 'symbols__label' }, label),
    h('div', { class: 'symbols__grid' }, symbols.map(button)));
  function refresh() {
    const recent = readRecentSymbols();
    replaceChildren(element,
      recent.length > 0 ? section('Ostatnio użyte', recent, 'recent') : null,
      SYMBOL_GROUPS.map((group) => section(group.label, group.symbols, group.id)));
  }
  refresh();
  return { element, refresh };
}

/**
 * Symbole pod polem tekstu (rysunek): przycisk „Symbole” rozwija panel; wybrany znak trafia
 * w miejsce kursora w polu (zaznaczony tekst zastępuje).
 */
export function symbolField(input, { testID = 'symbols' } = {}) {
  const panel = symbolPanel({
    testID,
    className: 'symbols--field',
    onPick: (symbol) => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.setRangeText(symbol, start, end, 'end');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      input.focus();
    }
  });
  panel.element.hidden = true;
  const toggle = h('button', {
    type: 'button',
    class: 'button button--plain symbols__toggle',
    'aria-expanded': 'false',
    dataset: { testid: `${testID}-toggle` },
    onMousedown: (event) => event.preventDefault(),
    onClick: () => {
      panel.element.hidden = !panel.element.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.element.hidden));
      if (!panel.element.hidden) panel.refresh();
    }
  }, icon('omega', { size: 18 }), h('span', null, 'Symbole (%, °, §, ⌀…)'));
  return h('div', { class: 'symbols-field' }, toggle, panel.element);
}
