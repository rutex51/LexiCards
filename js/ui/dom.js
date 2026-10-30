// Minimalne narzędzia do budowania DOM bez bibliotek.

const SVG_NS = 'http://www.w3.org/2000/svg';

function appendChildren(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === '') continue;
    if (Array.isArray(child)) appendChildren(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * Tworzy element: h('button', { class: 'x', onClick: fn, 'aria-label': 'Usuń' }, 'tekst', dziecko).
 * Właściwości `on…` rejestrują zdarzenia, `dataset` ustawia atrybuty data-*,
 * wartości false/null/undefined pomijają atrybut, true ustawia atrybut pusty.
 */
export function h(tag, props = null, ...children) {
  const element = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'dataset') {
        for (const [name, data] of Object.entries(value)) {
          if (data !== null && data !== undefined) element.dataset[name] = data;
        }
      } else if (key === 'style' && typeof value === 'object') {
        // Nazwy jak w CSS („font-size”, „--zmienna”) albo w JS („fontSize”).
        for (const [name, style] of Object.entries(value)) {
          element.style.setProperty(name.startsWith('--') ? name : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), style);
        }
      } else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected') {
        element[key] = value;
      } else if (value === true) {
        element.setAttribute(key, '');
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }
  appendChildren(element, children);
  return element;
}

/** Zastępuje zawartość elementu podanymi dziećmi. */
export function replaceChildren(element, ...children) {
  element.replaceChildren();
  appendChildren(element, children);
  return element;
}

/** Tworzy element SVG z listy kształtów ikony. */
export function svg(shapes, { size = 24, label = null, className = 'icon' } = {}) {
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('viewBox', '0 0 24 24');
  root.setAttribute('width', String(size));
  root.setAttribute('height', String(size));
  root.setAttribute('class', className);
  root.setAttribute('fill', 'none');
  root.setAttribute('stroke', 'currentColor');
  root.setAttribute('stroke-width', '1.8');
  root.setAttribute('stroke-linecap', 'round');
  root.setAttribute('stroke-linejoin', 'round');
  if (label) {
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', label);
  } else {
    root.setAttribute('aria-hidden', 'true');
  }
  for (const shape of shapes) {
    const node = document.createElementNS(SVG_NS, shape.tag ?? 'path');
    for (const [key, value] of Object.entries(shape)) {
      if (key !== 'tag') node.setAttribute(key, String(value));
    }
    root.appendChild(node);
  }
  return root;
}

/** Zapamiętuje pole z fokusem (po atrybucie data-focus-key) i przywraca je po przebudowie widoku. */
export function captureFocus(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active) || !active.dataset?.focusKey) return () => {};
  const key = active.dataset.focusKey;
  const start = active.selectionStart ?? null;
  const end = active.selectionEnd ?? null;
  return () => {
    const next = root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
    if (!next) return;
    next.focus({ preventScroll: true });
    if (start !== null && typeof next.setSelectionRange === 'function') {
      try {
        next.setSelectionRange(start, end);
      } catch {
        // pola bez zaznaczenia tekstu (np. checkbox)
      }
    }
  };
}

/** Uruchamia funkcję najwyżej raz na `delay` ms po ostatnim wywołaniu. */
export function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const TAP_SLOP = 10;
const TAP_MAX_DURATION = 800;

/**
 * Wywołuje `handler` po dotknięciu albo kliknięciu elementu.
 *
 * Safari na iPhonie potrafi zgubić zdarzenie click przy pierwszym dotknięciu przycisku,
 * który pojawił się w miejscu treści zmienionej po poprzednim dotknięciu (błąd WebKit
 * w iOS 26: ekran reaguje dopiero na drugie dotknięcie). Dlatego krótkie dotknięcie bez
 * przesunięcia obsługujemy już przy touchend, a preventDefault() wyłącza syntetyczny
 * click, który inaczej mógłby trafić w nowy ekran. Mysz, klawiatura i VoiceOver nadal
 * działają przez zwykły click. ignore(event) – dotknięcia, które zostają przy zwykłym click
 * (np. przyciski wewnątrz elementu).
 */
export function onTap(element, handler, { ignore = null } = {}) {
  let start = null;
  element.addEventListener('touchstart', (event) => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    start = touch ? { x: touch.clientX, y: touch.clientY, time: event.timeStamp } : null;
  }, { passive: true });
  element.addEventListener('touchmove', (event) => {
    const touch = event.touches[0];
    if (start && touch && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP) start = null;
  }, { passive: true });
  element.addEventListener('touchcancel', () => { start = null; });
  element.addEventListener('touchend', (event) => {
    const begin = start;
    start = null;
    const touch = event.changedTouches[0];
    if (!begin || !touch || element.disabled) return;
    if (event.timeStamp - begin.time > TAP_MAX_DURATION) return;
    if (Math.hypot(touch.clientX - begin.x, touch.clientY - begin.y) > TAP_SLOP) return;
    if (ignore?.(event)) return;
    event.preventDefault();
    handler(event);
  });
  element.addEventListener('click', handler);
  return element;
}
