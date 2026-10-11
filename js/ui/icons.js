// Zestaw ikon interfejsu (własne, rysowane kreską 24×24).

import { svg } from './dom.js';

const p = (d) => ({ d });
const filled = (d) => ({ d, fill: 'currentColor', stroke: 'none' });
const dot = (cx, cy, r = 1.6) => ({ tag: 'circle', cx, cy, r, fill: 'currentColor', stroke: 'none' });

const ICONS = {
  home: [p('M4 11l8-7 8 7'), p('M6 10v9.5h4.2v-5.5h3.6v5.5H18V10')],
  library: [p('M5 4.5h3.2v15H5z'), p('M10.4 4.5h3.2v15h-3.2z'), p('M15.9 5.6l3-.8 3.6 13.9-3 .8z')],
  cards: [
    p('M8.5 8H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H8.5A1.5 1.5 0 0 1 7 17.5v-8A1.5 1.5 0 0 1 8.5 8z'),
    p('M3.5 15.5v-9A1.5 1.5 0 0 1 5 5h11')
  ],
  quiz: [p('M4 7l2 2 3.2-3.4'), p('M4 15.5l2 2 3.2-3.4'), p('M13 7.5h7'), p('M13 16h7')],
  stats: [p('M5 20v-8'), p('M12 20V5'), p('M19 20v-11')],
  settings: [
    { tag: 'circle', cx: 12, cy: 12, r: 3 },
    p('M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z')
  ],
  plus: [p('M12 5v14'), p('M5 12h14')],
  chevronRight: [p('M9 6l6 6-6 6')],
  chevronLeft: [p('M15 6l-6 6 6 6')],
  chevronDown: [p('M6 9l6 6 6-6')],
  more: [dot(5.5, 12), dot(12, 12), dot(18.5, 12)],
  star: [p('M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z')],
  starFilled: [filled('M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z')],
  trash: [p('M4 7h16'), p('M9.5 7V4.5h5V7'), p('M6.2 7l.9 12.5h9.8L17.8 7'), p('M10 11v5.5'), p('M14 11v5.5')],
  edit: [p('M4 20h4L19.5 8.5l-4-4L4 16z'), p('M13.5 6.5l4 4')],
  search: [{ tag: 'circle', cx: 11, cy: 11, r: 6.5 }, p('M20 20l-4.3-4.3')],
  check: [p('M5 12.5l4.5 4.5L19 7.5')],
  close: [p('M6 6l12 12'), p('M18 6L6 18')],
  arrowUp: [p('M12 19V5'), p('M6 11l6-6 6 6')],
  arrowDown: [p('M12 5v14'), p('M6 13l6 6 6-6')],
  move: [
    p('M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
    p('M9.5 13.5h6'), p('M13 11l2.5 2.5L13 16')
  ],
  copy: [
    p('M9.5 9h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 19.5v-9A1.5 1.5 0 0 1 9.5 9z'),
    p('M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5')
  ],
  download: [p('M12 4v11'), p('M7 10.5l5 5 5-5'), p('M5 20h14')],
  upload: [p('M12 16V5'), p('M7 9.5l5-5 5 5'), p('M5 20h14')],
  filter: [p('M4 6.5h16'), p('M7 12h10'), p('M10 17.5h4')],
  info: [{ tag: 'circle', cx: 12, cy: 12, r: 8.5 }, p('M12 11v5.5'), dot(12, 7.8, 1.1)],
  warning: [p('M12 4l9 15.5H3z'), p('M12 10v4.5'), dot(12, 17, 1.1)],
  folder: [p('M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z')],
  stack: [p('M12 4l8.5 4.3L12 12.6 3.5 8.3z'), p('M3.5 12.3l8.5 4.3 8.5-4.3'), p('M3.5 16.2l8.5 4.3 8.5-4.3')],
  book: [p('M5 5a2 2 0 0 1 2-2h12v14.5H7.5A2.5 2.5 0 0 0 5 20z'), p('M5 20a2.5 2.5 0 0 0 2.5 1H19v-3.5')],
  reorder: [p('M7 19V5'), p('M4 8l3-3 3 3'), p('M17 5v14'), p('M14 16l3 3 3-3')],
  select: [{ tag: 'circle', cx: 12, cy: 12, r: 8.5 }, p('M8.2 12.3l2.6 2.6 5-5.3')],
  sparkles: [p('M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6z'), p('M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z')]
};

/** Zwraca element SVG ikony o podanej nazwie. */
export function icon(name, options = {}) {
  const shapes = ICONS[name];
  if (!shapes) throw new Error(`Nieznana ikona: ${name}`);
  return svg(shapes, options);
}

export const ICON_NAMES = Object.keys(ICONS);
