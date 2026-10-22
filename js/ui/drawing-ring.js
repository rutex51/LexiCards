// Kółko narzędzi edytora rysunku (od 1.32): duże kółko z wybranym narzędziem i małe kółka grup
// na okręgu wokół niego (geometria – core/tool-ring.js).
//
// Przeciągnięcie palcem, rysikiem albo myszą po małych kółkach i kółko myszy obracają grupy (po
// puszczeniu – dociągnięcie do najbliższej). Dotknięcie małego kółka wybiera grupę. Duże kółko:
// dotknięcie – ustawienia narzędzia, przesunięcie do krawędzi ekranu – chowa kółko. Zakładka przy
// krawędzi chowa i przywraca kółko. Od 1.33 ostatnie małe kółko („Grupy narzędzi”) otwiera dobór grup,
// a grupy można wymienić (setGroups) bez budowania kółka od nowa.

import { clampRotation, ringItems, ringStep, rotationFor, snapRotation } from '../core/tool-ring.js';
import { h } from './dom.js';
import { icon } from './icons.js';

/** Wymiary (px): duże kółko, małe kółko, promień okręgu, odległość środka dużego kółka od krawędzi ekranu. */
const SIZES = Object.freeze({
  wide: { main: 84, small: 46, radius: 84, edge: 78 },
  narrow: { main: 62, small: 40, radius: 62, edge: 54 }
});
/** Przesunięcie (px), po którym gest przestaje być dotknięciem; po ilu px przesunięcia do krawędzi kółko się chowa. */
const MOVE_SLOP = 8;
const HIDE_DISTANCE = 40;
/** Kółko myszy: tyle jednostek przewinięcia obraca o jedną grupę. */
const WHEEL_STEP = 40;

const wrap = (angle) => ((((angle + 180) % 360) + 360) % 360) - 180;

/**
 * side: 'right' | 'left'; groups: [{ id, label, icon }]; onPick(id) – wybór grupy; onMain() – dotknięcie
 * dużego kółka; onHide(hidden) – schowanie albo przywrócenie; onEdit() – ostatnie małe kółko (dobór grup).
 * Zwraca { element, tab, update(state), setGroups(list, active), groupButton(id), editButton }.
 */
export function createRing({ side, groups: initial, label, onPick, onMain, onHide, onEdit }) {
  const right = side !== 'left';
  let groups = initial;
  let sizes = SIZES.wide;
  let rotation = 0;
  let hidden = false;
  let drag = null;
  let swipe = null;
  let suppressClick = false;
  let wheelSum = 0;
  let wheelTime = 0;

  const makeGroupButton = (group) => h('button', {
    type: 'button', class: 'drawing-ring__group', 'aria-label': group.label, title: group.label, 'aria-pressed': 'false',
    dataset: { group: group.id, testid: `drawing-group-${group.id}` },
    onClick: (event) => {
      if (suppressClick) return;
      turnTo(buttons.indexOf(event.currentTarget));
      onPick(group.id);
    },
    // Klawiatura: grupa spoza wycinka obraca się na środek, gdy dostanie fokus.
    onFocus: (event) => turnTo(buttons.indexOf(event.currentTarget))
  }, icon(group.icon, { size: 22 }));
  // Ostatnie małe kółko – dobór grup (od 1.33): zestawy, własne grupy, kolejność.
  const editButton = h('button', {
    type: 'button', class: 'drawing-ring__group drawing-ring__group--edit', 'aria-label': 'Grupy narzędzi – dobór i kolejność', title: 'Grupy narzędzi',
    dataset: { testid: `drawing-ring-${side}-edit` },
    onClick: () => {
      if (suppressClick) return;
      onEdit();
    },
    onFocus: () => turnTo(buttons.length - 1)
  }, icon('ringEdit', { size: 22 }));
  let buttons = [...groups.map(makeGroupButton), editButton];
  const main = h('button', { type: 'button', class: 'drawing-ring__main', dataset: { testid: `drawing-ring-${side}-main` } });
  const element = h('div', { class: `drawing-ring drawing-ring--${side}`, role: 'group', 'aria-label': label, dataset: { testid: `drawing-ring-${side}` } },
    ...buttons, main);
  const tab = h('button', {
    type: 'button', class: `drawing-ring__tab drawing-ring__tab--${side}`, dataset: { testid: `drawing-ring-${side}-tab` },
    onClick: () => onHide(!hidden)
  });

  function center() {
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }
  const angleAt = (event, origin) => (Math.atan2(event.clientY - origin.y, event.clientX - origin.x) * 180) / Math.PI;

  function layout() {
    const box = 2 * (sizes.radius + sizes.small / 2 + 4);
    element.style.width = `${box}px`;
    element.style.height = `${box}px`;
    element.style[right ? 'right' : 'left'] = `${sizes.edge - box / 2}px`;
    element.style[right ? 'left' : 'right'] = '';
    element.style.top = `calc(var(--drawing-ring-top, 10px) + ${sizes.main / 2 - box / 2}px)`;
    element.style.setProperty('--ring-main', `${sizes.main}px`);
    element.style.setProperty('--ring-small', `${sizes.small}px`);
    tab.style.top = `calc(var(--drawing-ring-top, 10px) + ${sizes.main / 2 - 26}px)`;
    const items = ringItems({ count: buttons.length, rotation, side, radius: sizes.radius, edge: sizes.edge, size: sizes.small });
    for (const item of items) {
      const button = buttons[item.index];
      button.style.left = `${box / 2 + item.x - sizes.small / 2}px`;
      button.style.top = `${box / 2 + item.y - sizes.small / 2}px`;
      button.style.opacity = String(item.opacity);
      // Prawie niewidoczne kółko nie łapie dotknięć (dotknięcie trafia w kartkę pod spodem).
      button.style.pointerEvents = item.opacity > 0.3 ? '' : 'none';
    }
  }
  function turnTo(index) {
    if (index < 0) return;
    rotation = rotationFor(index, buttons.length, rotation);
    layout();
  }
  /** Pierwsze ułożenie (i po zmianie wielkości albo grup) bez animacji – kółka nie „dolatują” na miejsca. */
  function placeAtOnce() {
    element.classList.remove('drawing-ring--ready');
    layout();
    requestAnimationFrame(() => requestAnimationFrame(() => element.classList.add('drawing-ring--ready')));
  }
  /** Nowe grupy (od 1.33, po zmianie w oknie „Grupy narzędzi”); active – grupa obrócona na środek wycinka. */
  function setGroups(list, active = null) {
    groups = list;
    for (const button of buttons) if (button !== editButton) button.remove();
    buttons = [...groups.map(makeGroupButton), editButton];
    element.prepend(...buttons.slice(0, -1));
    const index = groups.findIndex((group) => group.id === active);
    rotation = index >= 0 ? rotationFor(index, buttons.length, 0) : snapRotation(rotation, buttons.length).rotation;
    if (element.style.width) placeAtOnce();
  }

  // ---- obracanie: przeciągnięcie po małych kółkach
  element.addEventListener('pointerdown', (event) => {
    if (main.contains(event.target) || (event.pointerType === 'mouse' && event.button !== 0) || drag) return;
    const origin = center();
    const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
    if (distance < sizes.main / 2 || distance > sizes.radius + sizes.small / 2 + 6) return;
    drag = { id: event.pointerId, origin, start: angleAt(event, origin), rotation, moved: false };
  });
  element.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const delta = wrap(angleAt(event, drag.origin) - drag.start);
    if (!drag.moved) {
      const reach = Math.abs((delta * Math.PI) / 180) * sizes.radius;
      if (reach < MOVE_SLOP) return;
      drag.moved = true;
      element.classList.add('drawing-ring--turning');
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // bez przechwycenia obrót też działa
      }
    }
    event.preventDefault();
    rotation = clampRotation(right ? drag.rotation - delta : drag.rotation + delta, buttons.length);
    layout();
  });
  const endDrag = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const { moved } = drag;
    drag = null;
    if (!moved) return;
    element.classList.remove('drawing-ring--turning');
    // Po obrocie „kliknięcie” w kółko, nad którym puszczono palec, nie wybiera grupy.
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    rotation = snapRotation(rotation, buttons.length).rotation;
    layout();
  };
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);
  /** Kółko myszy w pierścieniu małych kółek (także między nimi – kółka uciekają spod kursora w trakcie obrotu). */
  function wheelAt(event) {
    if (hidden || element.inert) return false;
    const origin = center();
    const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
    if (distance < sizes.main / 2 || distance > sizes.radius + sizes.small / 2 + 6) return false;
    event.preventDefault();
    const now = performance.now();
    if (now - wheelTime > 300) wheelSum = 0;
    wheelTime = now;
    wheelSum += event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
    if (Math.abs(wheelSum) < WHEEL_STEP) return true;
    const direction = Math.sign(wheelSum);
    wheelSum = 0;
    const { step } = ringStep(buttons.length);
    rotation = snapRotation(clampRotation(rotation + direction * step, buttons.length), buttons.length).rotation;
    layout();
    return true;
  }
  element.addEventListener('wheel', (event) => {
    if (!wheelAt(event)) event.preventDefault();
  }, { passive: false });

  // ---- duże kółko: dotknięcie – ustawienia, przesunięcie do krawędzi – schowanie
  main.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  });
  main.addEventListener('pointermove', (event) => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.moved) {
      if (Math.abs(dx) < MOVE_SLOP || Math.abs(dx) < Math.abs(dy)) return;
      swipe.moved = true;
      try {
        main.setPointerCapture(event.pointerId);
      } catch {
        // bez przechwycenia gest też działa
      }
    }
    const outward = right ? Math.max(0, dx) : Math.min(0, dx);
    main.style.transform = `translateX(${outward}px)`;
  });
  const endSwipe = (event, cancelled) => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const { moved, x } = swipe;
    swipe = null;
    main.style.transform = '';
    if (!moved) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const dx = event.clientX - x;
    if (!cancelled && (right ? dx > HIDE_DISTANCE : dx < -HIDE_DISTANCE)) onHide(true);
  };
  main.addEventListener('pointerup', (event) => endSwipe(event, false));
  main.addEventListener('pointercancel', (event) => endSwipe(event, true));
  main.addEventListener('click', () => {
    if (!suppressClick) onMain();
  });

  /**
   * state: { active – id pokazanej grupy z tego kółka albo null, main: { icon, fill, ink, label },
   * hidden, all – cały interfejs schowany, narrow – wąski ekran }.
   */
  function update(state) {
    const nextSizes = state.narrow ? SIZES.narrow : SIZES.wide;
    const resized = nextSizes !== sizes;
    sizes = nextSizes;
    for (const button of buttons) if (button !== editButton) button.setAttribute('aria-pressed', String(button.dataset.group === state.active));
    main.replaceChildren(icon(state.main.icon, { size: Math.round(sizes.main * 0.42) }));
    main.style.setProperty('--ring-fill', state.main.fill);
    main.style.setProperty('--ring-ink', state.main.ink);
    main.setAttribute('aria-label', state.main.label);
    main.title = state.main.label;
    hidden = Boolean(state.hidden);
    element.classList.toggle('drawing-ring--hidden', hidden || state.all);
    element.inert = hidden || state.all;
    tab.hidden = Boolean(state.all);
    tab.replaceChildren(icon((hidden ? !right : right) ? 'chevronRight' : 'chevronLeft', { size: 16 }));
    const tabLabel = hidden ? `Pokaż: ${label.toLowerCase()}` : `Schowaj: ${label.toLowerCase()}`;
    tab.setAttribute('aria-label', tabLabel);
    tab.title = tabLabel;
    tab.setAttribute('aria-expanded', String(!hidden));
    if (resized || !element.style.width) placeAtOnce();
  }

  return {
    element, tab, update, wheelAt, setGroups, editButton, turnTo,
    groupButton: (id) => buttons.find((button) => button.dataset.group === id) ?? null
  };
}
