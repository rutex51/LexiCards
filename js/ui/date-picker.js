// Własny wybór daty i godziny (od 1.21.1) zamiast pól przeglądarki (na Windows – stara lista
// w Edge i Chrome): kalendarz miesiąca (dni od poniedziałku, wybór miesiąca i roku, okres „od –
// do”) i bębny godzin i minut – kółko myszy, przeciągnięcie, palec, strzałki albo wpisane cyfry.
// Okna: data i godzina do wstawienia w notatce oraz okres filtra „Utworzone”.

import {
  MONTHS, RANGE_PRESETS, WEEKDAYS, addDays, addMonths, clockText, longDay, monthGrid, monthOf, monthTitle, pickRangeDay, presetRange,
  rangeDays, rangeText
} from '../core/calendar.js';
import { dayValue } from '../core/created.js';
import { formatEnteredDate, pluralDays } from '../core/text.js';
import { segmented } from './components.js';
import { openFormSheet } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';

const MONTH_SHORT = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
const mod = (value, count) => ((value % count) + count) % count;

/** Przycisk-skrót pod kalendarzem albo bębnami („Dziś”, „Teraz”…). */
const chip = (label, testID, onClick) => h('button', { type: 'button', class: 'picker-chip', dataset: { testid: testID }, onClick }, label);

// ---------------------------------------------------------------- kalendarz

/**
 * Kalendarz miesiąca. mode 'day' – value: 'rrrr-mm-dd'; mode 'range' – value: { from, to }.
 * max – ostatni dzień do wyboru (późniejsze wyszarzone); onPick(value) po dotknięciu dnia.
 * Klawiatura: strzałki – dni i tygodnie, PageUp / PageDown – miesiące, Home / End – tydzień;
 * nagłówek otwiera wybór miesiąca i roku.
 */
export function calendar({ mode = 'day', value, max = null, onPick, testID = 'calendar' }) {
  let current = value;
  const selectedDay = () => (mode === 'day' ? current : current.to || current.from) || dayValue();
  let shown = monthOf(selectedDay());
  let focusDay = selectedDay();
  let view = 'days';
  /** Okres w trakcie wybierania: koniec pod wskaźnikiem (podgląd pasma). */
  let hoverDay = null;
  const element = h('div', { class: 'calendar', dataset: { testid: testID } });

  const navButton = (label, name, step, id) => h('button', {
    type: 'button', class: 'calendar__nav', 'aria-label': label, title: label, dataset: { testid: `${testID}-${id}` },
    onClick: () => {
      shown = view === 'days' ? addMonths(shown, step) : { year: shown.year + step, month: shown.month };
      render();
    }
  }, icon(name, { size: 20 }));

  function dayClasses(day, outside) {
    const classes = ['calendar__day'];
    if (outside) classes.push('calendar__day--outside');
    if (day === dayValue()) classes.push('calendar__day--today');
    if (mode === 'day') {
      if (day === current) classes.push('calendar__day--selected');
    } else {
      let { from, to } = current;
      if (from && !to && hoverDay && hoverDay !== from) [from, to] = hoverDay < from ? [hoverDay, from] : [from, hoverDay];
      if (from && to && day > from && day < to) classes.push('calendar__day--between');
      if (day === from) classes.push('calendar__day--start');
      if (day === (to || from)) classes.push('calendar__day--end');
      if (from && to && from !== to && (day === from || day === to)) classes.push('calendar__day--edge');
    }
    return classes.join(' ');
  }

  function renderDays() {
    const days = monthGrid(shown).map(({ day, date, outside }) => h('button', {
      type: 'button', class: dayClasses(day, outside), role: 'gridcell', disabled: Boolean(max && day > max),
      tabindex: day === focusDay ? '0' : '-1', 'aria-label': longDay(day),
      'aria-current': day === dayValue() ? 'date' : null,
      'aria-pressed': mode === 'day' ? String(day === current) : null,
      dataset: { day, testid: `${testID}-day-${day}` },
      onClick: () => pick(day),
      onMouseenter: () => {
        if (mode !== 'range' || !current.from || current.to) return;
        hoverDay = day;
        refreshClasses();
      },
      onKeydown: (event) => moveFocus(event, day)
    }, String(date)));
    replaceChildren(element,
      h('div', { class: 'calendar__head' },
        navButton('Poprzedni miesiąc', 'chevronLeft', -1, 'prev'),
        h('button', {
          type: 'button', class: 'calendar__title', 'aria-label': `${monthTitle(shown)} – wybierz miesiąc i rok`, dataset: { testid: `${testID}-title` },
          onClick: () => { view = 'months'; render(); }
        }, monthTitle(shown), icon('chevronDown', { size: 16 })),
        navButton('Następny miesiąc', 'chevronRight', 1, 'next')),
      h('div', { class: 'calendar__grid', role: 'grid', 'aria-label': monthTitle(shown), onMouseleave: () => { hoverDay = null; refreshClasses(); } },
        WEEKDAYS.map((name) => h('span', { class: 'calendar__weekday', 'aria-hidden': 'true' }, name)),
        days));
  }

  function renderMonths() {
    const thisMonth = monthOf(dayValue());
    replaceChildren(element,
      h('div', { class: 'calendar__head' },
        navButton('Poprzedni rok', 'chevronLeft', -1, 'prev'),
        h('button', {
          type: 'button', class: 'calendar__title', 'aria-label': `${shown.year} – wróć do dni`, dataset: { testid: `${testID}-title` },
          onClick: () => { view = 'days'; render(); }
        }, String(shown.year), icon('chevronUp', { size: 16 })),
        navButton('Następny rok', 'chevronRight', 1, 'next')),
      h('div', { class: 'calendar__months' }, MONTHS.map((name, month) => h('button', {
        type: 'button',
        class: `calendar__month${month === shown.month ? ' calendar__month--selected' : ''}${month === thisMonth.month && shown.year === thisMonth.year ? ' calendar__month--today' : ''}`,
        'aria-label': `${name} ${shown.year}`, dataset: { testid: `${testID}-month-${month + 1}` },
        disabled: Boolean(max && `${shown.year}-${String(month + 1).padStart(2, '0')}-01` > max),
        onClick: () => {
          shown = { year: shown.year, month };
          view = 'days';
          render();
        }
      }, MONTH_SHORT[month]))));
  }

  function render() {
    if (view === 'days') renderDays();
    else renderMonths();
  }

  function refreshClasses() {
    for (const button of element.querySelectorAll('.calendar__day')) {
      const outside = button.classList.contains('calendar__day--outside');
      button.className = dayClasses(button.dataset.day, outside);
    }
  }

  function pick(day) {
    current = mode === 'day' ? day : pickRangeDay(current, day);
    hoverDay = null;
    focusDay = day;
    const month = monthOf(day);
    if (month.year !== shown.year || month.month !== shown.month) shown = month;
    render();
    element.querySelector(`[data-day="${day}"]`)?.focus();
    onPick(current);
  }

  function moveFocus(event, day) {
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let target = null;
    if (event.key in steps) target = addDays(day, steps[event.key]);
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const date = new Date(`${day}T12:00:00`);
      const month = addMonths({ year: date.getFullYear(), month: date.getMonth() }, event.key === 'PageUp' ? -1 : 1);
      const last = new Date(month.year, month.month + 1, 0).getDate();
      target = dayValue(new Date(month.year, month.month, Math.min(date.getDate(), last)));
    } else if (event.key === 'Home' || event.key === 'End') {
      const weekday = (new Date(`${day}T12:00:00`).getDay() + 6) % 7;
      target = addDays(day, event.key === 'Home' ? -weekday : 6 - weekday);
    }
    if (!target) return;
    event.preventDefault();
    if (max && target > max) target = max;
    focusDay = target;
    const month = monthOf(target);
    if (month.year !== shown.year || month.month !== shown.month) shown = month;
    render();
    element.querySelector(`[data-day="${target}"]`)?.focus();
  }

  render();
  return {
    element,
    /** Nowa wartość z zewnątrz (np. „Jutro”, gotowy okres) – kalendarz pokazuje jej miesiąc. */
    set(next) {
      current = next;
      hoverDay = null;
      focusDay = selectedDay();
      shown = monthOf(focusDay);
      view = 'days';
      render();
    }
  };
}

// ---------------------------------------------------------------- bębny

/**
 * Bęben liczb 0…count−1 (zapętlony – za 59 jest 00): przewijany palcem i rysikiem (natywnie,
 * z przyciąganiem), myszą – przeciągnięciem i kółkiem (krok na ząbek), klawiaturą – strzałki,
 * PageUp / PageDown, Home / End; dotknięcie liczby – ta liczba. Lista ma trzy kopie liczb,
 * a po zatrzymaniu wraca do środkowej, więc w obie strony można kręcić bez końca.
 */
function drum({ count, value, label, step = 5, testID, onChange }) {
  const COPIES = 3;
  let current = value;
  /** Indeks pozycji, do której bęben właśnie płynnie jedzie (kolejne kroki liczą się od niej). */
  let target = null;
  let placed = false;
  let settleTimer = 0;
  let paintFrame = 0;
  let styled = [];
  const items = Array.from({ length: count * COPIES }, (_, index) => h('div', {
    class: 'drum__item', dataset: { value: String(index % count) }
  }, String(index % count).padStart(2, '0')));
  const track = h('div', { class: 'drum__track' }, items);
  const element = h('div', {
    class: 'drum', role: 'spinbutton', tabindex: '0', 'aria-label': label,
    'aria-valuemin': '0', 'aria-valuemax': String(count - 1), dataset: { testid: testID }
  }, track);

  const itemHeight = () => items[0].offsetHeight || 40;
  const centerIndex = () => Math.round(element.scrollTop / itemHeight());
  const announce = () => {
    element.setAttribute('aria-valuenow', String(current));
    element.setAttribute('aria-valuetext', String(current).padStart(2, '0'));
  };

  /** Bez animacji: wartość w środkowej kopii. */
  function jump(next) {
    element.scrollTop = (count + next) * itemHeight();
    target = null;
    paint();
  }

  /** Płynnie do wartości – najkrótszą drogą (przez 00, gdy bliżej). */
  function scrollToValue(next, smooth = true) {
    const base = target ?? centerIndex();
    const delta = mod(next - mod(base, count) + Math.floor(count / 2), count) - Math.floor(count / 2);
    target = base + delta;
    element.scrollTo({ top: target * itemHeight(), behavior: smooth ? 'smooth' : 'auto' });
    if (!smooth) settle();
  }

  function setValue(next, { smooth = true, notify = true } = {}) {
    next = mod(next, count);
    const changed = next !== current;
    current = next;
    announce();
    if (placed) scrollToValue(next, smooth);
    if (changed && notify) onChange(current);
  }

  /**
   * Po zatrzymaniu: wartość ze środka, powrót do środkowej kopii. Gdy bęben jeszcze jedzie do
   * zadanej liczby (kółko, strzałka, cyfry), pozycja w połowie drogi nie zmienia wartości – także
   * gdy płynny obrót się przycina; stanął przed celem – od razu na cel.
   */
  function settle() {
    clearTimeout(settleTimer);
    if (!placed || dragging) return;
    if (target !== null && Math.abs(element.scrollTop - target * itemHeight()) > 1) {
      if (performance.now() - lastScroll < 400) {
        settleTimer = setTimeout(settle, 140);
        return;
      }
      element.scrollTo({ top: target * itemHeight(), behavior: 'instant' });
    }
    const index = centerIndex();
    const next = mod(index, count);
    target = null;
    if (index < count || index >= count * 2) element.scrollTop = (count + next) * itemHeight();
    paint();
    if (next !== current) {
      current = next;
      announce();
      onChange(current);
    }
  }

  /** Wygląd bębna: liczby nad i pod środkiem pochylone i bledsze. */
  function paint() {
    paintFrame = 0;
    for (const item of styled) {
      item.style.transform = '';
      item.style.opacity = '';
      item.classList.remove('drum__item--center');
    }
    styled = [];
    const center = element.scrollTop / itemHeight();
    for (let index = Math.floor(center) - 3; index <= Math.ceil(center) + 3; index += 1) {
      const item = items[index];
      if (!item) continue;
      const offset = index - center;
      item.style.transform = `perspective(240px) rotateX(${(-offset * 20).toFixed(1)}deg) scale(${(1 - Math.abs(offset) * 0.04).toFixed(3)})`;
      item.style.opacity = String(Math.max(0.2, 1 - Math.abs(offset) * 0.3).toFixed(2));
      if (Math.abs(offset) < 0.5) item.classList.add('drum__item--center');
      styled.push(item);
    }
  }

  let lastScroll = 0;
  element.addEventListener('scroll', () => {
    lastScroll = performance.now();
    if (!paintFrame) paintFrame = requestAnimationFrame(paint);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 140);
  }, { passive: true });
  element.addEventListener('scrollend', () => settle());
  // Palec (i rysik) przejmuje bęben – liczy się to, gdzie go zatrzyma.
  element.addEventListener('touchstart', () => { target = null; }, { passive: true });

  // Kółko myszy: ząbek – jedna liczba; gładzik – co ok. wysokość liczby.
  let wheel = 0;
  element.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (event.deltaMode === 1 || Math.abs(event.deltaY) >= 50) {
      wheel = 0;
      setValue(current + Math.sign(event.deltaY));
      return;
    }
    wheel += event.deltaY;
    while (Math.abs(wheel) >= 36) {
      setValue(current + Math.sign(wheel));
      wheel -= Math.sign(wheel) * 36;
    }
  }, { passive: false });

  // Mysz: przeciągnięcie przewija bęben (palec i rysik przewijają go same).
  let dragging = null;
  let moved = false;
  element.addEventListener('pointerdown', (event) => {
    moved = false;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    // Bęben jeszcze dojeżdża (kółko, strzałka) – od razu na docelowej liczbie, przeciąganie liczy się od niej.
    if (target !== null) {
      element.scrollTo({ top: target * itemHeight(), behavior: 'instant' });
      target = null;
    }
    dragging = { y: event.clientY, top: element.scrollTop };
    element.setPointerCapture(event.pointerId);
    element.classList.add('drum--dragging');
  });
  element.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dy = event.clientY - dragging.y;
    if (Math.abs(dy) > 3) moved = true;
    element.scrollTop = dragging.top - dy;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = null;
    element.classList.remove('drum--dragging');
    // Do najbliższej liczby.
    element.scrollTo({ top: centerIndex() * itemHeight(), behavior: 'smooth' });
    settleTimer = setTimeout(settle, 220);
  };
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);
  // Dotknięcie albo kliknięcie liczby – ta liczba (z położenia: przy przeciąganiu myszą kliknięcie trafia w cały bęben).
  element.addEventListener('click', (event) => {
    if (moved) return;
    const index = Math.floor((event.clientY - element.getBoundingClientRect().top + element.scrollTop) / itemHeight()) - 2;
    if (index < 0 || index >= items.length) return;
    element.focus({ preventScroll: true });
    setValue(mod(index, count));
  });

  element.addEventListener('keydown', (event) => {
    const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: step, PageUp: -step };
    if (event.key in moves) setValue(current + moves[event.key]);
    else if (event.key === 'Home') setValue(0);
    else if (event.key === 'End') setValue(count - 1);
    else return;
    event.preventDefault();
  });

  // Ustawienie po pojawieniu się w oknie (wcześniej bęben nie ma wysokości).
  const observer = new ResizeObserver(() => {
    if (!element.isConnected || element.clientHeight === 0) return;
    placed = true;
    jump(current);
  });
  observer.observe(element);
  announce();

  return {
    element,
    get value() { return current; },
    set: (next, smooth = true) => setValue(next, { smooth, notify: false })
  };
}

/**
 * Godzina na dwóch bębnach (godziny 00–23, minuty 00–59). Cyfry wpisane na bębnie godzin
 * ustawiają godzinę i przechodzą do minut („1533” – 15:33); dwukropek – do minut; Enter – zatwierdza
 * okno. onChange({ hour, minute }) po każdej zmianie.
 */
export function timeDrums({ hour, minute, onChange, testID = 'time' }) {
  let typed = '';
  let typedTimer = 0;
  const notify = () => onChange({ hour: hours.value, minute: minutes.value });
  const hours = drum({ count: 24, value: hour, label: 'Godzina', step: 6, testID: `${testID}-hour`, onChange: notify });
  const minutes = drum({ count: 60, value: minute, label: 'Minuty', step: 10, testID: `${testID}-minute`, onChange: notify });

  function onKey(event, which) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.target.closest('form')?.requestSubmit();
      return;
    }
    if (event.key === ':' || event.key === '.' || (event.key === 'ArrowRight' && which === hours)) {
      event.preventDefault();
      typed = '';
      minutes.element.focus();
      return;
    }
    if (event.key === 'ArrowLeft' && which === minutes) {
      event.preventDefault();
      typed = '';
      hours.element.focus();
      return;
    }
    if (!/^\d$/.test(event.key)) return;
    event.preventDefault();
    clearTimeout(typedTimer);
    typed += event.key;
    const limit = which === hours ? 2 : 5;
    const value = Number(typed);
    const done = typed.length === 2 || Number(typed[0]) > limit;
    which.set(Math.min(value, which === hours ? 23 : 59));
    notify();
    if (done) {
      typed = '';
      if (which === hours) minutes.element.focus();
    } else {
      typedTimer = setTimeout(() => { typed = ''; }, 1200);
    }
  }
  hours.element.addEventListener('keydown', (event) => onKey(event, hours));
  minutes.element.addEventListener('keydown', (event) => onKey(event, minutes));

  const element = h('div', { class: 'time-drums', dataset: { testid: testID } },
    h('div', { class: 'time-drums__band', 'aria-hidden': 'true' }),
    hours.element,
    h('span', { class: 'time-drums__colon', 'aria-hidden': 'true' }, ':'),
    minutes.element);
  return {
    element,
    set({ hour: nextHour, minute: nextMinute }) {
      hours.set(nextHour);
      minutes.set(nextMinute);
    },
    focus: () => hours.element.focus()
  };
}

// ---------------------------------------------------------------- okna

/**
 * Data i godzina do wstawienia w notatce: kalendarz, bębny, „Data i godzina / Data / Godzina”.
 * onInsert(tekst) – „20.10.2026, 15:35”, „20.10.2026” albo „15:35”.
 */
export function openDateTimeSheet({ now = new Date(), onInsert }) {
  const state = { mode: 'datetime', day: dayValue(now), hour: now.getHours(), minute: now.getMinutes() };
  let result = null;
  const summary = h('p', { class: 'picker-summary__main', dataset: { testid: 'date-summary' } });
  const preview = h('p', { class: 'picker-summary__sub', dataset: { testid: 'date-preview' } });
  const text = () => formatEnteredDate(state.mode === 'time' ? '' : state.day, state.mode === 'date' ? '' : clockText(state));
  const update = () => {
    const clock = clockText(state);
    summary.textContent = state.mode === 'date' ? longDay(state.day) : state.mode === 'time' ? clock : `${longDay(state.day)}, ${clock}`;
    preview.textContent = `Wstawi się: „${text()}”`;
    dateCard.hidden = state.mode === 'time';
    timeCard.hidden = state.mode === 'date';
    layout.classList.toggle('picker-columns--single', state.mode !== 'datetime');
  };
  const days = calendar({ value: state.day, testID: 'date-calendar', onPick: (day) => { state.day = day; update(); } });
  const drums = timeDrums({ hour: state.hour, minute: state.minute, testID: 'date-time', onChange: ({ hour, minute }) => { Object.assign(state, { hour, minute }); update(); } });
  const setDay = (day) => { state.day = day; days.set(day); update(); };
  const setTime = (hour, minute) => { Object.assign(state, { hour, minute }); drums.set(state); update(); };
  const dateCard = h('section', { class: 'picker-card', 'aria-label': 'Data' },
    h('h3', { class: 'picker-card__title' }, 'Data'),
    days.element,
    h('div', { class: 'picker-chips' },
      chip('Dziś', 'date-today', () => setDay(dayValue())),
      chip('Jutro', 'date-tomorrow', () => setDay(addDays(dayValue(), 1))),
      chip('Za tydzień', 'date-week', () => setDay(addDays(dayValue(), 7)))));
  const timeCard = h('section', { class: 'picker-card', 'aria-label': 'Godzina' },
    h('h3', { class: 'picker-card__title' }, 'Godzina'),
    drums.element,
    h('div', { class: 'picker-chips' },
      chip('Teraz', 'date-now', () => {
        const moment = new Date();
        setDay(dayValue(moment));
        setTime(moment.getHours(), moment.getMinutes());
      }),
      chip('Pełna godzina', 'date-full-hour', () => setTime(state.hour, 0)),
      chip('+15 min', 'date-plus-15', () => {
        const total = state.hour * 60 + state.minute + 15;
        if (total >= 24 * 60) setDay(addDays(state.day, 1));
        setTime(Math.floor(total / 60) % 24, total % 60);
      })));
  const layout = h('div', { class: 'picker-columns' }, dateCard, timeCard);
  const sheet = openFormSheet({
    title: 'Data i godzina',
    submitLabel: 'Wstaw',
    build: () => [
      h('div', { class: 'picker-summary', 'aria-live': 'polite' }, summary, preview),
      segmented({
        name: `date-mode-${Date.now()}`, label: 'Co wstawić', value: state.mode,
        options: [{ value: 'datetime', label: 'Data i godzina' }, { value: 'date', label: 'Data' }, { value: 'time', label: 'Godzina' }],
        onChange: (mode) => { state.mode = mode; update(); }
      }),
      layout,
      h('p', { class: 'field__hint' }, 'Bęben obracasz kółkiem myszy, przeciągnięciem, palcem albo strzałkami ↑ ↓; cyfry wpisują godzinę (np. 1533 – 15:33), '
        + 'Enter wstawia. W kalendarzu strzałki przechodzą po dniach, PageUp i PageDown – po miesiącach, a nazwa miesiąca otwiera wybór miesiąca i roku.')
    ],
    onSubmit: () => { result = text(); },
    onClose: () => {
      if (result) onInsert(result);
    }
  });
  sheet.dialog.classList.add('picker-dialog');
  sheet.dialog.dataset.testid = 'date-sheet';
  update();
  return sheet;
}

/**
 * Okres „od – do” (filtr „Utworzone”): kalendarz okresu – dwa dotknięcia: początek i koniec –
 * i gotowe okresy. max – ostatni dzień do wyboru (dziś). onApply({ from, to }).
 */
export function openRangeSheet({ from = '', to = '', max = dayValue(), onApply }) {
  const range = { from, to };
  let result = null;
  const summary = h('p', { class: 'picker-summary__main', dataset: { testid: 'range-summary' } });
  const hint = h('p', { class: 'picker-summary__sub' });
  const update = () => {
    summary.textContent = range.from ? rangeText(range.from, range.to || range.from) : 'Wybierz okres';
    hint.textContent = !range.from ? 'Dotknij pierwszego dnia okresu.'
      : !range.to ? 'Teraz dotknij ostatniego dnia (albo zatwierdź jeden dzień).'
        : `${pluralDays(rangeDays(range.from, range.to))} · dotknij dnia, żeby zacząć od nowa`;
  };
  const days = calendar({ mode: 'range', value: range, max, testID: 'range-calendar', onPick: (next) => { Object.assign(range, next); update(); } });
  const sheet = openFormSheet({
    title: 'Wybrany okres',
    submitLabel: 'Pokaż',
    build: () => [
      h('div', { class: 'picker-summary', 'aria-live': 'polite' }, summary, hint),
      h('section', { class: 'picker-card' },
        days.element,
        h('div', { class: 'picker-chips' }, RANGE_PRESETS.map((preset) => chip(preset.label, `range-${preset.id}`, () => {
          Object.assign(range, presetRange(preset.id));
          days.set({ ...range });
          update();
        }))))
    ],
    onSubmit: () => {
      if (!range.from) throw new Error('Wybierz pierwszy dzień okresu.');
      result = { from: range.from, to: range.to || range.from };
    },
    onClose: () => {
      if (result) onApply(result);
    }
  });
  sheet.dialog.classList.add('picker-dialog', 'picker-dialog--range');
  sheet.dialog.dataset.testid = 'range-sheet';
  update();
  return sheet;
}
