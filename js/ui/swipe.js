// Przesuwanie wiersza listy palcem (od 1.9), jak w aplikacjach na iPhonie: w prawo – działanie
// z lewej strony (utrwalenie), w lewo – z prawej (usunięcie). Lekkie przesunięcie i puszczenie
// pyta o potwierdzenie, zdecydowane (ponad połowę szerokości wiersza) wykonuje działanie od razu.
// Tylko dotyk i rysik – myszą wiersz działa jak dotąd (menu „…”). Pionowe przewijanie listy
// zostaje przeglądarce (touch-action: pan-y), a ruch od samej krawędzi ekranu nie przesuwa wiersza.
//
// Przesuwa się cały wiersz (z tłem); pod nim, na czas ruchu, leży warstwa działania – osobny
// element listy w miejscu wiersza.

import { h } from './dom.js';
import { icon } from './icons.js';

/** Od tylu pikseli przesunięcie jest „lekkie” (pyta), od połowy szerokości – „zdecydowane”. */
export const SWIPE_LIGHT = 56;
export const SWIPE_STRONG = 0.5;
/** Ruch, po którym wiadomo, czy palec idzie w bok, czy przewija listę. */
const SLOP = 10;
/** Ruch zaczęty tak blisko krawędzi ekranu zostaje systemowi (gest „wstecz”). */
const EDGE = 16;
/** Miejsce zajęte przez odstęp od krawędzi, ikonę i przerwę przed napisem (px). */
const LABEL_ROOM = 20 + 22 + 8 + 12;
/** Czas powrotu albo odjazdu wiersza (jak przejście w CSS). */
const SETTLE_MS = 260;

/**
 * Dodaje przesuwanie do wiersza listy (li.row). right – działanie po przesunięciu w prawo,
 * left – w lewo: { label, strongLabel, icon, tone: 'green' | 'red' | 'gray', confirm(), run(), unavailable? }.
 * label – napis przy lekkim przesunięciu, strongLabel – przy zdecydowanym; confirm() – po lekkim
 * przesunięciu (zwykle okno z pytaniem), run() – po zdecydowanym (obietnica; false – nie wyszło,
 * wiersz wraca). unavailable – tekst komunikatu zamiast działania (np. pusta lekcja), pokazywany
 * przez onUnavailable(text).
 */
export function swipeRow(row, { right = null, left = null, onUnavailable = () => {} } = {}) {
  if (!right && !left) return row;
  row.classList.add('row--swipe');

  let gesture = null;
  let layers = null;
  let suppressUntil = 0;

  /** Warstwy działań pod wierszem – na czas ruchu, w liście w miejscu wiersza. */
  const showLayers = () => {
    const list = row.parentElement;
    // Najpierw lista staje się punktem odniesienia – offsetTop wiersza liczy się względem niej.
    list?.classList.add('group__list--swiping');
    const make = (side, action) => h('span', {
      class: `swipe__layer swipe__layer--${side} swipe__layer--${action.tone}`, 'aria-hidden': 'true',
      style: { top: `${row.offsetTop}px`, height: `${row.offsetHeight}px` }
    }, icon(action.icon, { size: 22 }),
    h('span', { class: 'swipe__label swipe__label--light' }, action.label),
    h('span', { class: 'swipe__label swipe__label--strong' }, action.strongLabel ?? action.label));
    layers = [right && make('right', right), left && make('left', left)].filter(Boolean);
    list?.prepend(...layers);
  };
  const hideLayers = () => {
    const list = row.parentElement;
    for (const layer of layers ?? []) layer.remove();
    layers = null;
    if (list && !list.querySelector(':scope > .swipe__layer')) list.classList.remove('group__list--swiping');
  };

  const setOffset = (dx) => {
    row.style.setProperty('--swipe-x', `${dx}px`);
    const width = row.clientWidth || 1;
    const strength = Math.abs(dx) >= width * SWIPE_STRONG ? 'strong' : (Math.abs(dx) >= SWIPE_LIGHT ? 'light' : null);
    const side = dx > 0 ? 'right' : (dx < 0 ? 'left' : null);
    for (const layer of layers ?? []) {
      const shown = layer.classList.contains(`swipe__layer--${side}`);
      layer.classList.toggle('swipe__layer--shown', shown);
      layer.classList.toggle('swipe__layer--strong', strength === 'strong');
      layer.classList.toggle('swipe__layer--faint', strength === null);
      if (!shown) continue;
      // Napis tylko wtedy, gdy mieści się w odsłoniętej części – inaczej sama ikona.
      const label = layer.querySelector(strength === 'strong' ? '.swipe__label--strong' : '.swipe__label--light');
      layer.classList.toggle('swipe__layer--narrow', LABEL_ROOM + label.offsetWidth > Math.abs(dx));
    }
    row.dataset.swipe = strength ?? '';
    return strength;
  };

  /** Wiersz wraca na miejsce (away = 0) albo odjeżdża; warstwę działania widać do końca ruchu. */
  const settle = (away = 0) => {
    row.classList.add('row--swipe-settling');
    row.style.setProperty('--swipe-x', `${away}px`);
    setTimeout(() => {
      row.classList.remove('row--swipe-settling');
      if (away !== 0) return;
      row.classList.remove('row--swiping');
      row.dataset.swipe = '';
      hideLayers();
    }, SETTLE_MS);
  };

  row.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || !event.isPrimary || row.classList.contains('row--swiping')) return;
    if (event.target.closest('button')) return;
    if (event.clientX < EDGE || event.clientX > window.innerWidth - EDGE) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false, dx: 0 };
  });

  row.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const mx = event.clientX - gesture.x;
    const my = event.clientY - gesture.y;
    if (!gesture.active) {
      if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
      // Ruch bardziej w pionie – to przewijanie listy, wiersz zostaje.
      if (Math.abs(mx) < Math.abs(my) * 1.3 || (mx > 0 && !right) || (mx < 0 && !left)) {
        gesture = null;
        return;
      }
      gesture.active = true;
      gesture.x += Math.sign(mx) * SLOP;
      row.setPointerCapture?.(event.pointerId);
      showLayers();
      row.classList.add('row--swiping');
    }
    const width = row.clientWidth || 1;
    let dx = event.clientX - gesture.x;
    if (dx > 0 && !right) dx = 0;
    if (dx < 0 && !left) dx = 0;
    // Za szerokością wiersza – opór.
    if (Math.abs(dx) > width) dx = Math.sign(dx) * (width + (Math.abs(dx) - width) * 0.2);
    gesture.dx = dx;
    setOffset(dx);
  });

  const finish = (event, cancelled = false) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const { active, dx } = gesture;
    gesture = null;
    if (!active) return;
    // Po przesunięciu przeglądarka mogłaby jeszcze wysłać kliknięcie w link wiersza.
    suppressUntil = Date.now() + 500;
    const strength = cancelled ? null : setOffset(dx);
    const action = dx > 0 ? right : left;
    if (!strength || !action) {
      settle(0);
      return;
    }
    if (action.unavailable) {
      settle(0);
      onUnavailable(action.unavailable);
      return;
    }
    if (strength === 'strong') {
      // Usunięcie: wiersz odjeżdża; inne działania – wraca na miejsce.
      settle(action.tone === 'red' ? Math.sign(dx) * (row.clientWidth + 40) : 0);
      Promise.resolve(action.run()).then((done) => {
        if (done === false && row.isConnected) settle(0);
      });
    } else {
      settle(0);
      action.confirm();
    }
  };
  row.addEventListener('pointerup', (event) => finish(event));
  row.addEventListener('pointercancel', (event) => finish(event, true));
  row.addEventListener('click', (event) => {
    if (Date.now() < suppressUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  return row;
}
