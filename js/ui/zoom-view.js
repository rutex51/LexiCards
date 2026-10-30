// Pełny ekran obrazu albo tabeli z fiszki (od 1.57): element przybliża się z miejsca na fiszce na środek ekranu, a reszta
// ciemnieje; dotknięcie, ✕ albo Esc – oddala go z powrotem na fiszkę. Obraz zajmuje prawie cały ekran (w poziomie ekranu
// – prawie całą szerokość i wysokość), tabela – tyle, ile potrzebuje (najwyżej prawie cały ekran, dalej się przewija).

import { h } from './dom.js';
import { icon } from './icons.js';

const DURATION = 320;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** Część ekranu na obraz (szerokość, wysokość) i miejsce na podpis pod nim (px). */
const FILL = 0.96;
const CAPTION_ROOM = 48;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Widoczny prostokąt elementu; obraz dopasowany do ramki (object-fit: contain) – sam obraz, bez pustych pasów. */
function shownRect(element) {
  const box = element.getBoundingClientRect();
  if (element.tagName !== 'IMG' || !element.naturalWidth || !element.naturalHeight) return box;
  const scale = Math.min(box.width / element.naturalWidth, box.height / element.naturalHeight);
  const [width, height] = [element.naturalWidth * scale, element.naturalHeight * scale];
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}

/** Przekształcenie (początek w lewym górnym rogu), które kładzie prostokąt `to` na prostokąt `from`. */
const placeOn = (from, to) => `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;

/**
 * Pokazuje `source` (obraz albo tabelę na fiszce) na pełnym ekranie. image – adres obrazu albo null; table – element
 * tabeli do skopiowania; label – sygnatura pod spodem. Zwraca { close() } – oddalenie (też po dotknięciu i Esc).
 */
export function openZoom(source, { image = null, table = null, label = '' }) {
  const shade = h('div', { class: 'zoom-view__shade' });
  let content;
  if (image) {
    // Wielkość od razu (bez czekania na wczytanie): obraz jak na fiszce, dopasowany do ekranu.
    const room = { width: window.innerWidth * FILL, height: (window.innerHeight - (label ? CAPTION_ROOM : 0)) * FILL };
    const scale = Math.min(room.width / source.naturalWidth, room.height / source.naturalHeight);
    content = h('img', {
      class: 'zoom-view__content zoom-view__image', src: image, alt: label, draggable: 'false',
      style: { width: `${Math.round(source.naturalWidth * scale)}px`, height: `${Math.round(source.naturalHeight * scale)}px` }
    });
  } else {
    content = h('div', { class: 'zoom-view__content zoom-view__table' }, table.cloneNode(true));
  }
  const close = h('button', {
    type: 'button', class: 'zoom-view__close', 'aria-label': 'Zamknij powiększenie', title: 'Zamknij', dataset: { testid: 'card-zoom-close' }
  }, icon('close', { size: 24 }));
  const dialog = h('dialog', { class: 'zoom-view', 'aria-label': label || 'Powiększenie', dataset: { testid: 'card-zoom' } },
    shade, content, label ? h('p', { class: 'zoom-view__caption' }, label) : null, close);
  document.body.append(dialog);
  dialog.showModal();

  const motion = !reducedMotion() && typeof content.animate === 'function';
  if (motion) {
    shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: 'ease-out' });
    content.animate([{ transform: placeOn(shownRect(source), content.getBoundingClientRect()) }, { transform: 'none' }], { duration: DURATION, easing: EASING });
  }
  // Na fiszce w tym czasie pusto – wygląda, jakby to ten sam obraz wyszedł z fiszki.
  source.style.visibility = 'hidden';

  let closing = null;
  const finish = () => {
    closing ??= (async () => {
      if (motion) {
        const back = { duration: DURATION * 0.85, easing: EASING, fill: 'forwards' };
        await Promise.all([
          shade.animate([{ opacity: 1 }, { opacity: 0 }], back).finished,
          content.animate([{ transform: 'none' }, { transform: placeOn(shownRect(source), content.getBoundingClientRect()) }], back).finished
        ]).catch(() => {});
      }
      source.style.visibility = '';
      dialog.close();
      dialog.remove();
    })();
    return closing;
  };
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish();
  });
  // Dotknięcie gdziekolwiek (też ✕) oddala; przewijanie dużej tabeli – bez dotknięcia, więc jej nie zamyka.
  dialog.addEventListener('click', (event) => {
    event.stopPropagation();
    finish();
  });
  return { close: finish, dialog };
}
