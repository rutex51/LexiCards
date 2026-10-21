// Teksty pomocnicze w oknach (od 1.29): przycisk ⓘ obok tytułu okna (formularze, notatka, panele
// rysunku) chowa i pokazuje wszystkie podpowiedzi naraz – we wszystkich oknach, z zapamiętaniem
// na tym urządzeniu. Chowane są tylko opisy (`.field__hint`, `.form-note` i podobne); stan
// i komunikaty (postęp, błąd, informacja o pliku – `.field__hint--live`, role status / alert)
// zostają zawsze. Przycisk widać tylko w oknie, które ma podpowiedzi (CSS – :has).

import { h } from './dom.js';
import { icon } from './icons.js';

// Wybór czyta też js/theme-boot.js – klasa strony jest ustawiona, zanim pojawi się pierwsze okno.
const KEY = 'lexicards-hints';
const CLASS = 'hints-hidden';

/** Czy podpowiedzi są schowane. */
export const hintsHidden = () => document.documentElement.classList.contains(CLASS);

function sync(button) {
  const hidden = hintsHidden();
  button.setAttribute('aria-pressed', String(!hidden));
  button.title = hidden ? 'Pokaż podpowiedzi' : 'Ukryj podpowiedzi';
  button.setAttribute('aria-label', button.title);
}

/** Chowa albo pokazuje podpowiedzi we wszystkich oknach i zapamiętuje wybór. */
export function toggleHints() {
  const hidden = !hintsHidden();
  document.documentElement.classList.toggle(CLASS, hidden);
  try {
    window.localStorage.setItem(KEY, hidden ? 'hidden' : 'shown');
  } catch {
    // Bez pamięci przeglądarki wybór obowiązuje do zamknięcia aplikacji.
  }
  for (const button of document.querySelectorAll('.hints-toggle')) sync(button);
}

/** Przycisk ⓘ: wciśnięty – podpowiedzi widać. */
export function hintsToggle() {
  const button = h('button', {
    type: 'button', class: 'hints-toggle', dataset: { testid: 'hints-toggle' },
    // Bez zabierania fokusu (pole tekstu zostaje aktywne).
    onMousedown: (event) => event.preventDefault(),
    onClick: () => toggleHints()
  }, icon('info', { size: 17 }));
  sync(button);
  return button;
}
