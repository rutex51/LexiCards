// Ramka fokusu tylko przy obsłudze klawiaturą (od 1.11.1). Safari rysuje ją także po dotknięciu:
// na pierwszym przycisku nowo otwartego okna („Anuluj”) i na przycisku, do którego wraca fokus po
// zamknięciu okna. Po dotknięciu, kliknięciu albo rysiku <html> ma klasę `input-pointer` i ramek
// nie ma (css/app.css); pierwszy klawisz nawigacji (Tab, strzałki, Esc…) przywraca ramki.

const NAVIGATION_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Escape']);
/** Enter i spacja przywracają ramki tylko poza polami tekstowymi (w polu to zwykłe pisanie). */
const ACTIVATION_KEYS = new Set(['Enter', ' ']);

const editable = (target) => target instanceof window.Element
  && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Śledzi, czym obsługiwana jest aplikacja: wskaźnikiem (bez ramek fokusu) czy klawiaturą. */
export function trackInputMode(root = document.documentElement) {
  root.classList.add('input-pointer');
  document.addEventListener('pointerdown', () => root.classList.add('input-pointer'), { capture: true, passive: true });
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (NAVIGATION_KEYS.has(event.key) || (ACTIVATION_KEYS.has(event.key) && !editable(event.target))) {
      root.classList.remove('input-pointer');
    }
  }, true);
}
