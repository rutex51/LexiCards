// Okna modalne oparte na elemencie <dialog>: arkusz formularza, potwierdzenie,
// menu poleceń oraz krótkie komunikaty (toast). Przeglądarka sama pilnuje fokusu,
// klawisza Esc i blokady tła.

import { h } from './dom.js';
import { hintsToggle } from './hints.js';
import { icon } from './icons.js';

let dialogCounter = 0;

/**
 * Pokazuje okno modalne. onDismiss (opcjonalnie) przejmuje zamknięcie przez Esc i dotknięcie
 * tła – np. żeby zapytać o niezapisane zmiany; bez niego okno po prostu się zamyka.
 */
export function mountDialog(className, content, { onClose, onDismiss } = {}) {
  const dialog = h('dialog', { class: `dialog ${className}` }, content);
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.(dialog.returnValue);
  });
  // Dotknięcie tła (poza panelem) zamyka okno.
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    if (onDismiss) onDismiss();
    else dialog.close('dismiss');
  });
  if (onDismiss) {
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      onDismiss();
    });
  }
  dialog.showModal();
  return dialog;
}

/**
 * Arkusz formularza z nagłówkiem „Anuluj – tytuł – Zapisz”.
 * build(api) zwraca zawartość; api: setError(tekst|null), setCanSubmit(bool), close().
 * onSubmit() może być asynchroniczne; zwrócenie `false` zostawia arkusz otwarty,
 * a zgłoszony błąd jest pokazywany w arkuszu.
 */
export function openFormSheet({ title, submitLabel = 'Zapisz', cancelLabel = 'Anuluj', build, onSubmit, onClose }) {
  const titleID = `dialog-title-${++dialogCounter}`;
  const errorBox = h('p', { class: 'form-message form-message--error', role: 'alert', hidden: true });
  const submitButton = h('button', { type: 'submit', class: 'button button--primary sheet__submit' }, submitLabel);
  const cancelButton = h('button', { type: 'button', class: 'button button--plain' }, cancelLabel);
  let busy = false;
  let dialog;

  const api = {
    setError(message) {
      errorBox.hidden = !message;
      errorBox.textContent = message ?? '';
      if (message) errorBox.scrollIntoView({ block: 'nearest' });
    },
    setCanSubmit(enabled) {
      submitButton.disabled = !enabled;
    },
    setCancelLabel(label) {
      cancelButton.textContent = label;
    },
    close() {
      dialog.close('done');
    }
  };

  const body = h('div', { class: 'sheet__body' }, build(api), errorBox);
  const form = h('form', { class: 'sheet__panel', novalidate: true, 'aria-labelledby': titleID },
    h('header', { class: 'sheet__header' },
      cancelButton,
      // Od 1.29 obok tytułu ⓘ – chowa i pokazuje podpowiedzi (gdy okno je ma).
      h('div', { class: 'sheet__heading' }, h('h2', { class: 'sheet__title', id: titleID }, title), hintsToggle()),
      submitButton
    ),
    body
  );

  cancelButton.addEventListener('click', () => dialog.close('cancel'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || submitButton.disabled) return;
    busy = true;
    api.setError(null);
    try {
      const result = await onSubmit(api);
      if (result !== false) dialog.close('done');
    } catch (error) {
      api.setError(error?.message ?? String(error));
    } finally {
      busy = false;
    }
  });

  dialog = mountDialog('sheet', form, { onClose });
  return { dialog, ...api };
}

/**
 * Pytanie z dwoma przyciskami. Zwraca obietnicę: true po potwierdzeniu.
 * `onConfirm` jest wywoływane jeszcze w obsłudze kliknięcia – dla operacji, na które
 * przeglądarka pozwala tylko bezpośrednio po geście użytkownika (np. udostępnianie pliku).
 */
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Anuluj', destructive = false, onConfirm = null }) {
  return new Promise((resolve) => {
    const titleID = `dialog-title-${++dialogCounter}`;
    let dialog;
    const confirmButton = h('button', {
      type: 'button',
      class: `button ${destructive ? 'button--danger' : 'button--primary'}`,
      dataset: { testid: 'confirm' },
      onClick: () => {
        onConfirm?.();
        dialog.close('confirm');
      }
    }, confirmLabel);
    const cancelButton = h('button', { type: 'button', class: 'button button--secondary', onClick: () => dialog.close('cancel') }, cancelLabel);
    const panel = h('div', { class: 'alert__panel', role: 'alertdialog', 'aria-labelledby': titleID },
      h('h2', { class: 'alert__title', id: titleID }, title),
      message ? h('p', { class: 'alert__message' }, message) : null,
      h('div', { class: 'alert__actions' }, cancelButton, confirmButton)
    );
    dialog = mountDialog('alert', panel, { onClose: (value) => resolve(value === 'confirm') });
    cancelButton.focus();
  });
}

/** Komunikat z jednym przyciskiem. */
export function alertDialog({ title, message, buttonLabel = 'OK' }) {
  return new Promise((resolve) => {
    const titleID = `dialog-title-${++dialogCounter}`;
    let dialog;
    const panel = h('div', { class: 'alert__panel', role: 'alertdialog', 'aria-labelledby': titleID },
      h('h2', { class: 'alert__title', id: titleID }, title),
      message ? h('p', { class: 'alert__message' }, message) : null,
      h('div', { class: 'alert__actions' },
        h('button', { type: 'button', class: 'button button--primary', onClick: () => dialog.close('ok') }, buttonLabel)
      )
    );
    dialog = mountDialog('alert', panel, { onClose: () => resolve() });
  });
}

/**
 * Menu poleceń. items: [{ label, icon, onSelect, destructive, disabled } | 'separator'].
 * Na telefonie wysuwa się od dołu, na szerokim ekranie pojawia się na środku.
 */
export function openMenu({ title = null, items }) {
  let dialog;
  const titleID = `dialog-title-${++dialogCounter}`;
  const list = h('div', { class: 'menu__list', role: 'menu' });
  for (const item of items) {
    if (!item) continue;
    if (item === 'separator') {
      list.appendChild(h('hr', { class: 'menu__separator' }));
      continue;
    }
    // Pozycja do wyboru jednej z opcji (od 1.16, np. kolejność listy): znacznik przy wybranej.
    const radio = typeof item.checked === 'boolean';
    list.appendChild(h('button', {
      type: 'button',
      role: radio ? 'menuitemradio' : 'menuitem',
      'aria-checked': radio ? String(item.checked) : null,
      class: `menu__item${item.destructive ? ' menu__item--danger' : ''}`,
      disabled: Boolean(item.disabled),
      dataset: { testid: item.testID },
      onClick: () => {
        dialog.close('select');
        item.onSelect?.();
      }
    }, radio ? (item.checked ? icon('check') : h('span', { class: 'menu__blank', 'aria-hidden': 'true' })) : item.icon ? icon(item.icon) : null,
    // Od 1.27 pozycja do wyboru może mieć też ikonę (np. rodzaj linii) – za znacznikiem.
    radio && item.icon ? icon(item.icon) : null,
    h('span', null, item.label)));
  }
  const panel = h('div', { class: 'menu__panel', 'aria-labelledby': title ? titleID : null, 'aria-label': title ? null : 'Polecenia' },
    title ? h('h2', { class: 'menu__title', id: titleID }, title) : null,
    list,
    h('button', { type: 'button', class: 'menu__item menu__cancel', onClick: () => dialog.close('cancel') }, 'Anuluj')
  );
  dialog = mountDialog('menu', panel);
  return dialog;
}

/** Usuwa komunikat z krótką animacją znikania. */
function dismissToast(element) {
  if (!element.isConnected || element.classList.contains('toast--leaving')) return;
  element.classList.add('toast--leaving');
  setTimeout(() => element.remove(), 300);
}

/**
 * Komunikat z przyciskiem „Cofnij” (od 1.9): bez okna, wisi przez `seconds` sekund – pasek u dołu
 * komunikatu pokazuje, ile czasu zostało – i znika sam. onUndo() po dotknięciu (raz).
 */
export function undoToast(message, onUndo, { seconds = 60 } = {}) {
  let element = null;
  let used = false;
  element = toast(message, {
    timeout: seconds * 1000,
    action: {
      label: 'Cofnij',
      onSelect: () => {
        if (used) return;
        used = true;
        dismissToast(element);
        onUndo();
      }
    }
  });
  element.classList.add('toast--undo');
  element.dataset.testid = 'undo-toast';
  element.style.setProperty('--undo-time', `${seconds}s`);
  element.append(h('span', { class: 'toast__timer', 'aria-hidden': 'true' }));
  return element;
}

/**
 * Krótki komunikat u dołu ekranu, odczytywany przez czytniki ekranu. Komunikat z przyciskiem
 * (action) zostaje, dopóki użytkownik go nie użyje – albo przez `timeout` ms, gdy jest podany.
 */
export function toast(message, { kind = 'info', duration = 4500, action = null, timeout = null } = {}) {
  let region = document.getElementById('toasts');
  if (!region) {
    region = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(region);
  }
  // Komunikat z przyciskiem (action: { label, onSelect }) zostaje, dopóki użytkownik go nie użyje.
  const element = h('div', { class: `toast toast--${kind}${action ? ' toast--action' : ''}` },
    h('span', null, message),
    action ? h('button', { type: 'button', class: 'toast__button', onClick: () => action.onSelect() }, action.label) : null
  );
  region.appendChild(element);
  if (!action || timeout) setTimeout(() => dismissToast(element), action ? timeout : duration);
  return element;
}

/** Pokazuje błąd operacji wykonanej z listy. */
export function showError(error) {
  console.error(error);
  return alertDialog({ title: 'Nie udało się wykonać operacji', message: error?.message ?? String(error) });
}
