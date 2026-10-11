// Okna modalne oparte na elemencie <dialog>: arkusz formularza, potwierdzenie,
// menu poleceń oraz krótkie komunikaty (toast). Przeglądarka sama pilnuje fokusu,
// klawisza Esc i blokady tła.

import { h } from './dom.js';
import { icon } from './icons.js';

let dialogCounter = 0;

function mountDialog(className, content, { onClose } = {}) {
  const dialog = h('dialog', { class: `dialog ${className}` }, content);
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.(dialog.returnValue);
  });
  // Dotknięcie tła (poza panelem) zamyka okno.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('dismiss');
  });
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
      h('h2', { class: 'sheet__title', id: titleID }, title),
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
    list.appendChild(h('button', {
      type: 'button',
      role: 'menuitem',
      class: `menu__item${item.destructive ? ' menu__item--danger' : ''}`,
      disabled: Boolean(item.disabled),
      onClick: () => {
        dialog.close('select');
        item.onSelect?.();
      }
    }, item.icon ? icon(item.icon) : null, h('span', null, item.label)));
  }
  const panel = h('div', { class: 'menu__panel', 'aria-labelledby': title ? titleID : null, 'aria-label': title ? null : 'Polecenia' },
    title ? h('h2', { class: 'menu__title', id: titleID }, title) : null,
    list,
    h('button', { type: 'button', class: 'menu__item menu__cancel', onClick: () => dialog.close('cancel') }, 'Anuluj')
  );
  dialog = mountDialog('menu', panel);
  return dialog;
}

/** Krótki komunikat u dołu ekranu, odczytywany przez czytniki ekranu. */
export function toast(message, { kind = 'info', duration = 4500 } = {}) {
  let region = document.getElementById('toasts');
  if (!region) {
    region = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(region);
  }
  const element = h('div', { class: `toast toast--${kind}` }, message);
  region.appendChild(element);
  setTimeout(() => {
    element.classList.add('toast--leaving');
    setTimeout(() => element.remove(), 300);
  }, duration);
  return element;
}

/** Pokazuje błąd operacji wykonanej z listy. */
export function showError(error) {
  console.error(error);
  return alertDialog({ title: 'Nie udało się wykonać operacji', message: error?.message ?? String(error) });
}
