// Przeciąganie wierszy w trybie zmiany kolejności (od 1.16): uchwyt ≡ – palcem, rysikiem albo
// myszą (myszą także cały wiersz). Przeciągany wiersz idzie za wskaźnikiem, pozostałe robią mu
// miejsce; przy górnej i dolnej krawędzi ekranu strona sama się przewija. Wiersz przechodzi
// tylko w obrębie swojej grupy (np. utrwalone na końcu listy nie mijają się z resztą).
// Upuszczenie zapisuje nową kolejność (onMove); strzałki w wierszu działają dalej (klawiatura).

/** Ruch (px) zanim myszą przeciągany wiersz oderwie się od miejsca (żeby kliknięcie zostało kliknięciem). */
const MOUSE_SLOP = 4;
/** Strefa przy krawędzi okna, w której strona przewija się sama, i największa prędkość (px na klatkę). */
const EDGE = 72;
const SPEED = 14;

/**
 * Włącza przeciąganie w liście `list` (ul z wierszami li). groupOf(index) – grupa wiersza;
 * onMove(from, to) – upuszczenie na innym miejscu (numery w liście).
 */
export function enableDragReorder(list, { groupOf = () => 0, onMove }) {
  let drag = null;

  const rows = () => [...list.children].filter((item) => item.tagName === 'LI');

  function begin(event, row, handle) {
    const items = rows();
    const from = items.indexOf(row);
    if (from < 0) return;
    const scrollY = window.scrollY;
    const boxes = items.map((item) => {
      const box = item.getBoundingClientRect();
      return { top: box.top + scrollY, height: box.height, middle: box.top + scrollY + box.height / 2 };
    });
    // Zakres grupy przeciąganego wiersza.
    let [low, high] = [from, from];
    while (low > 0 && groupOf(low - 1) === groupOf(from)) low -= 1;
    while (high < items.length - 1 && groupOf(high + 1) === groupOf(from)) high += 1;
    drag = {
      id: event.pointerId, handle, row, items, boxes, from, to: from, low, high,
      startY: event.clientY + scrollY, pointerY: event.clientY, started: event.pointerType !== 'mouse' || handle.classList.contains('row__grip'),
      frame: 0
    };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // przechwycenie nie jest konieczne
    }
    if (drag.started) start();
  }

  function start() {
    drag.started = true;
    drag.row.classList.add('row--dragging');
    list.classList.add('group__list--dragging');
    autoScroll();
  }

  function update() {
    const { boxes, from, low, high } = drag;
    const pageY = drag.pointerY + window.scrollY;
    // Wiersz nie wychodzi poza swoją grupę.
    const min = boxes[low].top - boxes[from].top;
    const max = boxes[high].top + boxes[high].height - (boxes[from].top + boxes[from].height);
    const dy = Math.min(max, Math.max(min, pageY - drag.startY));
    // Miejsce zmienia się, gdy brzeg przeciąganego wiersza minie środek sąsiada
    // (także przy wierszach różnej wysokości wiersz dojdzie do końca grupy).
    const top = boxes[from].top + dy;
    const bottom = top + boxes[from].height;
    let to = from;
    while (to > low && top < boxes[to - 1].middle) to -= 1;
    while (to < high && bottom > boxes[to + 1].middle) to += 1;
    drag.to = to;
    const height = boxes[from].height;
    drag.items.forEach((item, index) => {
      if (index === from) {
        item.style.transform = `translateY(${dy}px)`;
        return;
      }
      const shift = from < to && index > from && index <= to ? -height : from > to && index >= to && index < from ? height : 0;
      item.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  /** Przewijanie strony, gdy wskaźnik jest przy górnej albo dolnej krawędzi okna. */
  function autoScroll() {
    if (!drag?.started) return;
    const { pointerY } = drag;
    const speed = pointerY < EDGE ? -SPEED * (1 - pointerY / EDGE)
      : pointerY > window.innerHeight - EDGE ? SPEED * (1 - (window.innerHeight - pointerY) / EDGE) : 0;
    if (speed !== 0) {
      window.scrollBy(0, speed);
      update();
    }
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function finish(cancelled) {
    if (!drag) return;
    const done = drag;
    drag = null;
    window.cancelAnimationFrame(done.frame);
    list.classList.remove('group__list--dragging');
    done.row.classList.remove('row--dragging');
    if (!cancelled && done.started && done.to !== done.from) {
      onMove(done.from, done.to);
      return;
    }
    for (const item of done.items) item.style.transform = '';
  }

  list.addEventListener('pointerdown', (event) => {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const row = event.target.closest('li');
    if (!row || row.parentElement !== list) return;
    const grip = event.target.closest('.row__grip');
    // Bez uchwytu – tylko myszą, i nie na przyciskach (strzałki) ani polach (od 1.33: pole zaznaczenia w wierszu).
    if (!grip && (event.pointerType !== 'mouse' || event.target.closest('button, input, label, select, textarea'))) return;
    event.preventDefault();
    begin(event, row, grip ?? row);
  });
  list.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.pointerY = event.clientY;
    if (!drag.started) {
      if (Math.abs(event.clientY + window.scrollY - drag.startY) < MOUSE_SLOP) return;
      start();
    }
    event.preventDefault();
    update();
  });
  list.addEventListener('pointerup', (event) => {
    if (drag && event.pointerId === drag.id) finish(false);
  });
  list.addEventListener('pointercancel', (event) => {
    if (drag && event.pointerId === drag.id) finish(true);
  });
  return list;
}
