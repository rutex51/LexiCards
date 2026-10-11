// Elementy interfejsu używane na wielu ekranach.

import { h } from './dom.js';
import { icon } from './icons.js';
import { routes } from './router.js';

/** Przycisk z samą ikoną; etykieta jest dostępna dla czytników ekranu i jako podpowiedź. */
export function iconButton(name, label, onClick, { className = '', pressed = null } = {}) {
  return h('button', {
    type: 'button',
    class: `icon-button ${className}`.trim(),
    'aria-label': label,
    title: label,
    'aria-pressed': pressed === null ? null : String(pressed),
    onClick
  }, icon(name));
}

/** Przycisk tekstowy w pasku nawigacji. */
export function navButton(label, onClick, { strong = false } = {}) {
  return h('button', { type: 'button', class: `button button--plain${strong ? ' button--strong' : ''}`, onClick }, label);
}

/** Skrót do ustawień w pasku nawigacji (na szerokim ekranie zastępuje go panel boczny). */
export function settingsAction() {
  return h('a', { class: 'icon-button only-compact', href: routes.settings(), 'aria-label': 'Ustawienia', title: 'Ustawienia' }, icon('settings'));
}

/** Zgrupowana lista w stylu ustawień iOS. */
export function group({ title = null, footer = null, className = '' }, ...rows) {
  const items = rows.flat().filter(Boolean);
  return h('section', { class: `group ${className}`.trim() },
    title ? h('h2', { class: 'group__title' }, title) : null,
    items.length > 0 ? h('ul', { class: 'group__list', role: 'list' }, items) : null,
    footer ? h('p', { class: 'group__footer' }, footer) : null
  );
}

/** Wiersz prowadzący do innego ekranu, z opcjonalnym przyciskiem menu. */
export function linkRow({ href, leading = null, title, subtitle = null, onMenu = null, menuLabel = 'Więcej poleceń', testID = null }) {
  return h('li', { class: 'row', dataset: { testid: testID } },
    h('a', { class: 'row__main', href },
      leading ? h('span', { class: 'row__leading' }, leading) : null,
      h('span', { class: 'row__text' },
        h('span', { class: 'row__title' }, title),
        subtitle ? h('span', { class: 'row__subtitle' }, subtitle) : null
      ),
      h('span', { class: 'row__chevron' }, icon('chevronRight', { size: 18 }))
    ),
    onMenu ? iconButton('more', `${menuLabel}: ${title}`, onMenu, { className: 'row__more' }) : null
  );
}

/** Wiersz w trybie zmiany kolejności: przyciski w górę i w dół. */
export function reorderRow({ leading = null, title, isFirst, isLast, onUp, onDown }) {
  const up = iconButton('arrowUp', `Przesuń wyżej: ${title}`, onUp);
  const down = iconButton('arrowDown', `Przesuń niżej: ${title}`, onDown);
  up.disabled = isFirst;
  down.disabled = isLast;
  return h('li', { class: 'row row--reorder' },
    h('span', { class: 'row__main' },
      leading ? h('span', { class: 'row__leading' }, leading) : null,
      h('span', { class: 'row__text' }, h('span', { class: 'row__title' }, title))
    ),
    up,
    down
  );
}

/** Wiersz-polecenie (przycisk na całą szerokość listy). */
export function actionRow({ label, iconName = null, onClick, destructive = false, testID = null }) {
  return h('li', { class: 'row' },
    h('button', { type: 'button', class: `row__main row__button${destructive ? ' row__button--danger' : ''}`, onClick, dataset: { testid: testID } },
      iconName ? h('span', { class: 'row__leading row__leading--icon' }, icon(iconName)) : null,
      h('span', { class: 'row__text' }, h('span', { class: 'row__title' }, label))
    )
  );
}

/** Wiersz informacyjny: etykieta i wartość. */
export function valueRow(label, value) {
  return h('li', { class: 'row row--static' },
    h('span', { class: 'row__main' },
      h('span', { class: 'row__text' }, h('span', { class: 'row__title' }, label)),
      h('span', { class: 'row__value' }, value)
    )
  );
}

/** Kolorowa plakietka dziedziny z ikoną. */
export function domainBadge(domain, { large = false } = {}) {
  return h('span', {
    class: `badge badge--${domain.color ?? 'blue'}${large ? ' badge--large' : ''}`,
    'aria-hidden': 'true'
  }, domain.icon ?? '📁');
}

/** Pusty stan: zaproszenie do działania zamiast pustego ekranu. */
export function emptyState({ iconName, title, text, actions = [] }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon(iconName, { size: 40 })),
    h('h2', { class: 'empty__title' }, title),
    text ? h('p', { class: 'empty__text' }, text) : null,
    actions.length > 0 ? h('div', { class: 'empty__actions' }, actions) : null
  );
}

export function primaryButton(label, onClick, { testID = null, kind = 'primary' } = {}) {
  return h('button', { type: 'button', class: `button button--${kind}`, onClick, dataset: { testid: testID } }, label);
}

/** Komunikat w treści ekranu lub formularza. kind: error | warning | info. */
export function message(text, kind = 'info') {
  const iconName = kind === 'info' ? 'info' : 'warning';
  return h('p', { class: `form-message form-message--${kind}`, role: kind === 'error' ? 'alert' : 'status' }, icon(iconName, { size: 18 }), h('span', null, text));
}

// ---------------------------------------------------------------- formularze

let fieldCounter = 0;

/** Pole formularza z widoczną etykietą. control: element input/textarea/select. */
export function field(label, control, { hint = null } = {}) {
  const id = control.id || `field-${++fieldCounter}`;
  control.id = id;
  return h('div', { class: 'field' },
    h('label', { class: 'field__label', for: id }, label),
    control,
    hint ? h('p', { class: 'field__hint' }, hint) : null
  );
}

export function textInput({ value = '', placeholder = '', onInput, required = false, focusKey = null, autocapitalize = 'sentences', lang = null, testID = null, type = 'text' }) {
  return h('input', {
    class: 'input',
    type,
    value,
    placeholder,
    required,
    lang,
    autocapitalize,
    autocomplete: 'off',
    'aria-required': required ? 'true' : null,
    dataset: { focusKey, testid: testID },
    onInput: (event) => onInput?.(event.target.value)
  });
}

export function textArea({ value = '', placeholder = '', onInput, rows = 2, lang = null, testID = null }) {
  const element = h('textarea', {
    class: 'input input--multiline',
    rows,
    placeholder,
    lang,
    dataset: { testid: testID },
    onInput: (event) => onInput?.(event.target.value)
  });
  element.value = value;
  // Pole rośnie razem z treścią. Nowsze przeglądarki robią to same (field-sizing w CSS),
  // w pozostałych wysokość ustawiamy po każdej zmianie.
  if (!globalThis.CSS?.supports?.('field-sizing', 'content')) {
    const fit = () => {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    };
    element.addEventListener('input', fit);
    requestAnimationFrame(fit);
  }
  return element;
}

/** Lista wyboru. options: [{ value, label }]. */
export function selectInput({ value, options, onChange, testID = null }) {
  const element = h('select', { class: 'input input--select', dataset: { testid: testID }, onChange: (event) => onChange?.(event.target.value) },
    options.map((option) => h('option', { value: option.value }, option.label))
  );
  element.value = value;
  return element;
}

/** Przełącznik segmentowy (grupa przycisków radiowych). options: [{ value, label }]. */
export function segmented({ name, value, options, onChange, label }) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    options.map((option) => {
      const input = h('input', {
        type: 'radio', name, value: option.value, class: 'segmented__input',
        checked: option.value === value,
        onChange: () => onChange(option.value)
      });
      return h('label', { class: 'segmented__option' }, input, h('span', null, option.label));
    })
  );
}

export function toggle({ checked, onChange, label }) {
  const input = h('input', { type: 'checkbox', class: 'switch__input', role: 'switch', checked, onChange: (event) => onChange(event.target.checked) });
  return h('label', { class: 'switch' }, h('span', { class: 'switch__label' }, label), input, h('span', { class: 'switch__track', 'aria-hidden': 'true' }));
}

export function formGroup(title, ...children) {
  return h('fieldset', { class: 'form-group' },
    title ? h('legend', { class: 'form-group__title' }, title) : null,
    h('div', { class: 'form-group__body' }, children)
  );
}
