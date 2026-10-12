// Wykresy statystyk rysowane w SVG, bez bibliotek: wykres w czasie (linie albo słupki),
// pasek udziałów statusów i miernik odsetka.
//
// Zasady (jedna metoda dla wszystkich wykresów):
//  - wykres rysuje się w rzeczywistej szerokości kontenera (ResizeObserver), więc tekst osi
//    ma stały rozmiar na telefonie i na komputerze,
//  - linie 2 px, słupki najwyżej 24 px z zaokrąglonym końcem, 2 px przerwy w kolorze tła
//    między stykającymi się elementami, siatka z cienkich linii,
//  - podpowiedź po najechaniu, dotknięciu albo strzałkach na klawiaturze pokazuje wszystkie
//    serie w danym dniu; te same liczby są w tabeli pod wykresem („Dane w tabeli”),
//  - kolory pochodzą ze zmiennych CSS (--viz-*), osobnych dla jasnego i ciemnego motywu,
//  - napisy mają kolory tekstu, nigdy kolor serii; serie rozróżnia legenda.

import { h } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PLOT_HEIGHT = 150;
const TOP = 10;
const AXIS_BAND = 24;
const RIGHT = 10;
const COLUMN_MAX = 24;
const GAP = 2;

let chartCounter = 0;

function s(tag, attributes = {}, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined && value !== false) element.setAttribute(key, String(value));
  }
  for (const child of children) if (child) element.appendChild(child);
  return element;
}

/** Zaokrąglona górna granica osi i podziałka (1, 2, 5 × 10ⁿ), najwyżej 4 przedziały. */
export function niceScale(maxValue, { integer = true } = {}) {
  const max = Math.max(maxValue, integer ? 4 : 1);
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  let step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough);
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(value);
  return { top, ticks };
}

/** Ścieżka słupka z zaokrąglonym górnym końcem (dół prosty – przy osi). */
function columnPath(x, y, width, height, round) {
  const r = round ? Math.min(4, width / 2, height) : 0;
  if (r <= 0) return `M${x},${y + height}V${y}H${x + width}V${y + height}Z`;
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function legendKey(item) {
  return h('span', { class: `chart__key chart__key--${item.kind === 'column' || item.kind === 'swatch' ? 'box' : 'line'} viz-${item.tone}`, 'aria-hidden': 'true' });
}

/** Legenda wykresu – zawsze przy co najmniej dwóch seriach. */
export function legend(items, className = '') {
  return h('ul', { class: `chart__legend ${className}`.trim(), role: 'list' },
    items.map((item) => h('li', { class: 'chart__legend-item' }, legendKey(item), h('span', null, item.name)))
  );
}

/**
 * Wykres w czasie.
 * options: {
 *   title, label (dla czytników ekranu), testID,
 *   points: [{ key, long, short }] – dni (pełna data do podpowiedzi, krótka na oś),
 *   series: [{ id, name, tone, kind: 'line' | 'column', values: (number|null)[], area, dots }],
 *   stacked (słupki jeden na drugim), yMax (stała góra osi, np. 100), integer,
 *   format: (value) => tekst wartości, axisFormat: (value) => tekst podziałki,
 *   empty: tekst, gdy nie ma żadnych danych
 * }
 */
export function timeChart(options) {
  const id = `chart-${++chartCounter}`;
  const { points, series } = options;
  const format = options.format ?? ((value) => String(value));
  const axisFormat = options.axisFormat ?? format;
  const hasData = series.some((item) => item.values.some((value) => value !== null && value !== 0));

  const root = h('figure', { class: 'chart', dataset: { testid: options.testID } });
  const caption = options.title ? h('figcaption', { class: 'chart__title' }, options.title) : null;
  if (caption) root.appendChild(caption);
  if (options.note) root.appendChild(h('p', { class: 'chart__note' }, options.note));
  if (series.length >= 2) root.appendChild(legend(series));

  if (!hasData) {
    root.appendChild(h('p', { class: 'chart__empty', dataset: { testid: options.testID ? `${options.testID}-empty` : null } }, options.empty ?? 'Brak danych w tym okresie.'));
    return root;
  }

  const tooltip = h('div', { class: 'chart__tooltip', hidden: true, 'aria-hidden': 'true' });
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const plot = h('div', {
    class: 'chart__plot',
    tabindex: '0',
    role: 'img',
    'aria-label': `${options.label ?? options.title}. Strzałki w lewo i w prawo pokazują wartości kolejnych dni.`,
    style: { height: `${TOP + PLOT_HEIGHT + AXIS_BAND}px` }
  }, tooltip);
  root.append(plot, live);

  // Skala: suma słupków w stosie albo największa wartość serii.
  let maxValue = 0;
  for (let index = 0; index < points.length; index += 1) {
    if (options.stacked) {
      maxValue = Math.max(maxValue, series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0));
    } else {
      for (const item of series) maxValue = Math.max(maxValue, item.values[index] ?? 0);
    }
  }
  const scale = options.yMax ? niceScaleFixed(options.yMax) : niceScale(maxValue, { integer: options.integer !== false });

  let state = { width: 0, index: null, svg: null, geometry: null };

  const draw = (width) => {
    const left = Math.max(...scale.ticks.map((tick) => axisFormat(tick).length)) * 7 + 10;
    const plotWidth = Math.max(40, width - left - RIGHT);
    const slot = plotWidth / points.length;
    const x = (index) => left + slot * (index + 0.5);
    const y = (value) => TOP + PLOT_HEIGHT - (value / scale.top) * PLOT_HEIGHT;
    const baseline = TOP + PLOT_HEIGHT;

    const svg = s('svg', { width, height: TOP + PLOT_HEIGHT + AXIS_BAND, class: 'chart__svg', 'aria-hidden': 'true', focusable: 'false' });
    const grid = s('g', { class: 'chart__grid' });
    for (const tick of scale.ticks) {
      const ty = Math.round(y(tick)) + 0.5;
      grid.appendChild(s('line', { x1: left, x2: width - RIGHT, y1: ty, y2: ty, class: tick === 0 ? 'chart__baseline' : 'chart__gridline' }));
      const label = s('text', { x: left - 8, y: ty + 4, class: 'chart__tick', 'text-anchor': 'end' });
      label.textContent = axisFormat(tick);
      grid.appendChild(label);
    }
    svg.appendChild(grid);

    // Podpisy dni: tyle, ile się zmieści, zawsze pierwszy i ostatni.
    const maxLabels = Math.max(2, Math.floor(plotWidth / 64));
    const every = Math.max(1, Math.ceil((points.length - 1) / (maxLabels - 1)));
    const axis = s('g', { class: 'chart__axis' });
    const labelled = new Set([0, points.length - 1]);
    for (let index = 0; index < points.length - 1; index += every) labelled.add(index);
    for (const index of [...labelled].sort((a, b) => a - b)) {
      if (index !== points.length - 1 && index !== 0 && points.length - 1 - index < every * 0.6) continue;
      const anchor = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle';
      const tx = index === 0 ? Math.max(left, x(index) - slot / 2) : index === points.length - 1 ? Math.min(width - RIGHT, x(index) + slot / 2) : x(index);
      const label = s('text', { x: tx, y: baseline + 17, class: 'chart__tick', 'text-anchor': anchor });
      label.textContent = points[index].short;
      axis.appendChild(label);
    }
    svg.appendChild(axis);

    const marks = s('g', { class: 'chart__marks' });
    const columnSeries = series.filter((item) => item.kind === 'column');
    const columns = [];
    if (columnSeries.length > 0) {
      const columnWidth = Math.max(1, Math.min(COLUMN_MAX, slot - GAP, slot * 0.72));
      for (let index = 0; index < points.length; index += 1) {
        const group = [];
        let stackTop = baseline;
        const visible = columnSeries.filter((item) => (item.values[index] ?? 0) > 0);
        visible.forEach((item, position) => {
          const value = item.values[index];
          let height = (value / scale.top) * PLOT_HEIGHT;
          // Przerwa w kolorze tła między segmentami stosu.
          if (position > 0) height = Math.max(0, height - GAP);
          const top = stackTop - height - (position > 0 ? GAP : 0);
          const path = s('path', {
            d: columnPath(x(index) - columnWidth / 2, top, columnWidth, height, position === visible.length - 1),
            class: `chart__column viz-${item.tone}`
          });
          marks.appendChild(path);
          group.push(path);
          stackTop = top;
        });
        columns.push(group);
      }
    }

    for (const item of series.filter((entry) => entry.kind !== 'column')) {
      // Linia przerywa się na dniach bez wartości.
      let d = '';
      let open = false;
      const runs = [];
      let run = [];
      item.values.forEach((value, index) => {
        if (value === null || value === undefined) {
          open = false;
          if (run.length) runs.push(run);
          run = [];
          return;
        }
        d += `${open ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
        open = true;
        run.push(index);
      });
      if (run.length) runs.push(run);
      if (item.area) {
        for (const segment of runs) {
          if (segment.length < 2) continue;
          let area = `M${x(segment[0]).toFixed(1)},${baseline}`;
          for (const index of segment) area += `L${x(index).toFixed(1)},${y(item.values[index]).toFixed(1)}`;
          area += `L${x(segment.at(-1)).toFixed(1)},${baseline}Z`;
          marks.appendChild(s('path', { d: area, class: `chart__area viz-${item.tone}` }));
        }
      }
      if (d) marks.appendChild(s('path', { d, class: `chart__line viz-${item.tone}` }));
      // Punkty: dla serii z rzadkimi danymi i dla pojedynczych dni bez sąsiadów.
      item.values.forEach((value, index) => {
        if (value === null || value === undefined) return;
        const lonely = runs.some((segment) => segment.length === 1 && segment[0] === index);
        if (item.dots || lonely) marks.appendChild(s('circle', { cx: x(index), cy: y(value), r: 4, class: `chart__dot viz-${item.tone}` }));
      });
    }
    svg.appendChild(marks);

    const cursor = s('g', { class: 'chart__cursor', visibility: 'hidden' });
    const crosshair = s('line', { y1: TOP, y2: baseline, class: 'chart__crosshair' });
    cursor.appendChild(crosshair);
    const cursorDots = series.filter((item) => item.kind !== 'column').map((item) => {
      const dot = s('circle', { r: 5, class: `chart__dot chart__dot--active viz-${item.tone}` });
      cursor.appendChild(dot);
      return { item, dot };
    });
    svg.appendChild(cursor);

    plot.querySelector('svg')?.remove();
    plot.insertBefore(svg, tooltip);
    state = { ...state, width, svg, geometry: { left, plotWidth, slot, x, y, cursor, crosshair, cursorDots, columns } };
    if (state.index !== null) show(state.index, false);
  };

  const show = (index, announce) => {
    const { geometry } = state;
    if (!geometry) return;
    const clamped = Math.max(0, Math.min(points.length - 1, index));
    state.index = clamped;
    const cx = geometry.x(clamped);
    geometry.cursor.setAttribute('visibility', 'visible');
    geometry.crosshair.setAttribute('x1', cx);
    geometry.crosshair.setAttribute('x2', cx);
    for (const { item, dot } of geometry.cursorDots) {
      const value = item.values[clamped];
      if (value === null || value === undefined) {
        dot.setAttribute('visibility', 'hidden');
      } else {
        dot.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', cx);
        dot.setAttribute('cy', geometry.y(value));
      }
    }
    geometry.columns.forEach((group, position) => {
      for (const path of group) path.classList.toggle('chart__column--active', position === clamped);
    });

    tooltip.replaceChildren(
      h('span', { class: 'chart__tooltip-date' }, points[clamped].long),
      ...series.map((item) => {
        const value = item.values[clamped];
        return h('span', { class: 'chart__tooltip-row' },
          h('span', { class: `chart__key chart__key--line viz-${item.tone}`, 'aria-hidden': 'true' }),
          h('strong', null, value === null || value === undefined ? '–' : format(value)),
          h('span', null, item.name));
      })
    );
    tooltip.hidden = false;
    const width = tooltip.offsetWidth;
    const leftEdge = Math.max(4, Math.min(state.width - width - 4, cx - width / 2));
    tooltip.style.left = `${leftEdge}px`;
    if (announce) {
      live.textContent = `${points[clamped].long}: ${series.map((item) => {
        const value = item.values[clamped];
        return `${item.name} ${value === null || value === undefined ? 'brak danych' : format(value)}`;
      }).join(', ')}`;
    }
  };

  const hide = () => {
    state.index = null;
    tooltip.hidden = true;
    state.geometry?.cursor.setAttribute('visibility', 'hidden');
    for (const group of state.geometry?.columns ?? []) for (const path of group) path.classList.remove('chart__column--active');
  };

  const indexAt = (event) => {
    const { geometry } = state;
    const box = plot.getBoundingClientRect();
    const offset = event.clientX - box.left - geometry.left;
    return Math.floor(offset / geometry.slot);
  };
  plot.addEventListener('pointerdown', (event) => {
    if (state.geometry) show(indexAt(event), false);
  });
  plot.addEventListener('pointermove', (event) => {
    if (!state.geometry) return;
    if (event.pointerType === 'mouse' || event.buttons) show(indexAt(event), false);
  });
  plot.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') hide();
  });
  plot.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const start = state.index ?? (event.key === 'ArrowLeft' ? points.length : -1);
      show(start + (event.key === 'ArrowLeft' ? -1 : 1), true);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      show(event.key === 'Home' ? 0 : points.length - 1, true);
    } else if (event.key === 'Escape') {
      hide();
    }
  });
  plot.addEventListener('blur', hide);

  // Rysunek powstaje, gdy znana jest szerokość kontenera, i powtarza się po jej zmianie.
  if (typeof window.ResizeObserver === 'function') {
    const observer = new window.ResizeObserver((entries) => {
      if (!root.isConnected) {
        observer.disconnect();
        return;
      }
      const width = Math.floor(entries[0].contentRect.width);
      if (width > 0 && width !== state.width) draw(width);
    });
    observer.observe(plot);
  } else {
    requestAnimationFrame(() => {
      if (plot.clientWidth > 0) draw(plot.clientWidth);
    });
  }

  root.appendChild(dataTable(id, points, series, format));
  return root;
}

function niceScaleFixed(top) {
  return { top, ticks: [0, top / 4, top / 2, (top * 3) / 4, top] };
}

/** Tabela z danymi wykresu (dni z jakąkolwiek wartością) – ten sam zestaw liczb bez wykresu. */
function dataTable(id, points, series, format) {
  const rows = points
    .map((point, index) => ({ point, values: series.map((item) => item.values[index]) }))
    .filter((row) => row.values.some((value) => value !== null && value !== undefined && value !== 0));
  return h('details', { class: 'chart__table' },
    h('summary', null, 'Dane w tabeli'),
    rows.length === 0
      ? h('p', { class: 'chart__note' }, 'Brak danych w tym okresie.')
      : h('div', { class: 'chart__table-scroll' },
          h('table', { 'aria-describedby': null, id: `${id}-table` },
            h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Dzień'), series.map((item) => h('th', { scope: 'col' }, item.name)))),
            h('tbody', null, rows.map((row) => h('tr', null,
              h('th', { scope: 'row' }, row.point.long),
              row.values.map((value) => h('td', null, value === null || value === undefined ? '–' : format(value)))
            )))
          ))
  );
}

/**
 * Pasek udziałów (np. statusy pojęć): segmenty w kolejności `parts`, 2 px przerwy, zaokrąglone
 * końce. parts: [{ id, value, tone, name }]. Pusty pasek dla zera.
 */
export function shareBar(parts, { label, className = '' } = {}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return h('div', {
    class: `share-bar ${className}`.trim(),
    role: 'img',
    'aria-label': label ?? parts.map((part) => `${part.name}: ${part.value}`).join(', ')
  },
    total === 0 ? null : parts.filter((part) => part.value > 0).map((part) => h('span', {
      class: `share-bar__part viz-${part.tone}`,
      style: { 'flex-grow': String(part.value) },
      title: `${part.name}: ${part.value}`
    }))
  );
}

/** Miernik odsetka: ścieżka i wypełnienie w kolorze serii. */
export function meter(value, { tone, label }) {
  return h('div', {
    class: 'meter',
    role: 'meter',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': value === null ? null : String(value),
    'aria-label': label
  }, value ? h('span', { class: `meter__fill viz-${tone}`, style: { width: `${value}%` } }) : null);
}
