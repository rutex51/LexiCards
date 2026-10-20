// Przeciąganie kafelków w siatce (od 1.18 – obrazy w edytorze notatki): myszą i rysikiem od razu
// po ruchu, palcem – po chwili przytrzymania (krótki ruch palcem przewija siatkę, jak zwykle).
// Kafelek idzie za wskaźnikiem, a gdy znajdzie się nad innym kafelkiem, zajmuje jego miejsce
// (pozostałe przesuwają się w siatce). Przy lewej i prawej krawędzi przewijanej siatki przewija
// się ona sama. Upuszczenie zwraca nową kolejność: onDrop(numery kafelków w nowej kolejności).

/** Ruch (px), od którego mysz albo rysik przeciąga kafelek, i ruch palca, który zamiast tego przewija. */
const SLOP = 6;
/** Przytrzymanie palcem (ms) przed przeciąganiem. */
const HOLD = 380;
/** Strefa przy krawędzi siatki, w której ta przewija się sama, i największa prędkość (px na klatkę). */
const EDGE = 48;
const SPEED = 12;

/**
 * Włącza przeciąganie w siatce `grid`. itemSelector – kafelki do przeciągania (z data-index –
 * numerem na liście); ignore – elementy, od których przeciągnięcie się nie zaczyna (np. przycisk
 * usuwania). onDrop(order) – order: numery kafelków (data-index) w nowej kolejności.
 */
export function enableGridDrag(grid, { itemSelector, ignore = null, onDrop }) {
  let drag = null;
  let suppressClick = false;

  const items = () => [...grid.querySelectorAll(itemSelector)];

  /** Kafelek pod wskaźnikiem: przesunięcie od jego miejsca w siatce (zmierzonego bez przesunięcia). */
  function place() {
    const { tile, pointer, grab } = drag;
    tile.style.transform = '';
    const home = tile.getBoundingClientRect();
    tile.style.transform = `translate(${pointer.x - grab.x - home.left}px, ${pointer.y - grab.y - home.top}px)`;
  }

  function start() {
    drag.started = true;
    clearTimeout(drag.timer);
    // Kafelek trzymany w punkcie, w którym go dotknięto (nie tam, gdzie wskaźnik był po pierwszym ruchu).
    const rect = drag.tile.getBoundingClientRect();
    drag.grab = { x: drag.start.x - rect.left, y: drag.start.y - rect.top };
    drag.tile.classList.add('grid-drag--dragging');
    grid.classList.add('grid-drag--active');
    try {
      drag.tile.setPointerCapture(drag.id);
    } catch {
      // przechwycenie nie jest konieczne
    }
    place();
    autoScroll();
  }

  /** Kafelek pod wskaźnikiem zajmuje jego miejsce. */
  function update() {
    const { tile, pointer } = drag;
    const others = items().filter((item) => item !== tile);
    const target = others.find((item) => {
      const box = item.getBoundingClientRect();
      return pointer.x >= box.left && pointer.x <= box.right && pointer.y >= box.top && pointer.y <= box.bottom;
    });
    if (target) {
      const order = items();
      if (order.indexOf(target) > order.indexOf(tile)) target.after(tile);
      else target.before(tile);
    }
    place();
  }

  function autoScroll() {
    if (!drag?.started) return;
    const box = grid.getBoundingClientRect();
    const { x } = drag.pointer;
    const speed = x < box.left + EDGE ? -SPEED * (1 - Math.max(0, x - box.left) / EDGE)
      : x > box.right - EDGE ? SPEED * (1 - Math.max(0, box.right - x) / EDGE) : 0;
    if (speed !== 0 && grid.scrollWidth > grid.clientWidth) {
      grid.scrollLeft += speed;
      update();
    }
    drag.frame = requestAnimationFrame(autoScroll);
  }

  function finish(cancelled) {
    if (!drag) return;
    const done = drag;
    drag = null;
    clearTimeout(done.timer);
    window.cancelAnimationFrame(done.frame);
    if (!done.started) return;
    done.tile.classList.remove('grid-drag--dragging');
    grid.classList.remove('grid-drag--active');
    done.tile.style.transform = '';
    // Kliknięcie po przeciągnięciu nie otwiera menu kafelka.
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const order = items().map((item) => Number(item.dataset.index));
    if (!cancelled && order.some((value, position) => value !== done.order[position])) onDrop(order);
    else onDrop(null);
  }

  grid.addEventListener('pointerdown', (event) => {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const tile = event.target.closest(itemSelector);
    if (!tile || !grid.contains(tile) || (ignore && event.target.closest(ignore))) return;
    drag = {
      id: event.pointerId, touch: event.pointerType === 'touch', tile, started: false, frame: 0, timer: 0,
      start: { x: event.clientX, y: event.clientY }, pointer: { x: event.clientX, y: event.clientY }, grab: { x: 0, y: 0 },
      order: items().map((item) => Number(item.dataset.index))
    };
    if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.started) start(); }, HOLD);
  });
  grid.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.pointer = { x: event.clientX, y: event.clientY };
    if (!drag.started) {
      const moved = Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) >= SLOP;
      // Palec, który ruszył przed przytrzymaniem, przewija siatkę – bez przeciągania.
      if (moved && drag.touch) finish(true);
      else if (moved) start();
      return;
    }
    event.preventDefault();
    update();
  });
  grid.addEventListener('pointerup', (event) => {
    if (drag && event.pointerId === drag.id) finish(false);
  });
  grid.addEventListener('pointercancel', (event) => {
    if (drag && event.pointerId === drag.id) finish(true);
  });
  // W trakcie przeciągania palcem strona i siatka się nie przewijają.
  grid.addEventListener('touchmove', (event) => {
    if (drag?.started) event.preventDefault();
  }, { passive: false });
  grid.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  // Przytrzymanie palcem nie otwiera menu systemu (zapisz obraz, zaznacz tekst).
  grid.addEventListener('contextmenu', (event) => {
    if (drag) event.preventDefault();
  });
  return grid;
}
