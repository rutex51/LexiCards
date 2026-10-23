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
  // Uchwyt przeciągania wiersza i kolejność listy (od 1.16).
  grip: [p('M5 8.5h14'), p('M5 12h14'), p('M5 15.5h14')],
  sort: [p('M4 6.5h9'), p('M4 12h6.5'), p('M4 17.5h4'), p('M17.5 5v14'), p('M14.5 16l3 3 3-3')],
  chevronRight: [p('M9 6l6 6-6 6')],
  chevronLeft: [p('M15 6l-6 6 6 6')],
  chevronDown: [p('M6 9l6 6 6-6')],
  chevronUp: [p('M6 15l6-6 6 6')],
  more: [dot(5.5, 12), dot(12, 12), dot(18.5, 12)],
  star: [p('M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z')],
  starFilled: [filled('M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z')],
  trash: [p('M4 7h16'), p('M9.5 7V4.5h5V7'), p('M6.2 7l.9 12.5h9.8L17.8 7'), p('M10 11v5.5'), p('M14 11v5.5')],
  edit: [p('M4 20h4L19.5 8.5l-4-4L4 16z'), p('M13.5 6.5l4 4')],
  search: [{ tag: 'circle', cx: 11, cy: 11, r: 6.5 }, p('M20 20l-4.3-4.3')],
  check: [p('M5 12.5l4.5 4.5L19 7.5')],
  close: [p('M6 6l12 12'), p('M18 6L6 18')],
  arrowUp: [p('M12 19V5'), p('M6 11l6-6 6 6')],
  arrowLeft: [p('M19 12H5'), p('M11 6l-6 6 6 6')],
  arrowRight: [p('M5 12h14'), p('M13 6l6 6-6 6')],
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
  share: [p('M12 14.5V3.5'), p('M7.8 7.7L12 3.5l4.2 4.2'), p('M8 10.5H5.5V20h13v-9.5H16')],
  external: [p('M14 4h6v6'), p('M20 4l-8.5 8.5'), p('M18 13.5V20H4V6h6.5')],
  paperclip: [p('M19.5 11.2l-7.6 7.6a4.8 4.8 0 0 1-6.8-6.8l8.2-8.2a3.2 3.2 0 0 1 4.5 4.5l-8.2 8.2a1.6 1.6 0 0 1-2.3-2.3l7.6-7.6')],
  upload: [p('M12 16V5'), p('M7 9.5l5-5 5 5'), p('M5 20h14')],
  filter: [p('M4 6.5h16'), p('M7 12h10'), p('M10 17.5h4')],
  info: [{ tag: 'circle', cx: 12, cy: 12, r: 8.5 }, p('M12 11v5.5'), dot(12, 7.8, 1.1)],
  warning: [p('M12 4l9 15.5H3z'), p('M12 10v4.5'), dot(12, 17, 1.1)],
  file: [p('M7 3h7.5L19 7.5V21H7z'), p('M14.5 3v4.5H19')],
  translate: [p('M4 8h13'), p('M14 5l3 3-3 3'), p('M20 16H7'), p('M10 13l-3 3 3 3')],
  chat: [p('M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7L8 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z')],
  speaker: [p('M4 9.5h3l4.5-4v13l-4.5-4H4z'), p('M15.5 9a4 4 0 0 1 0 6'), p('M18 6.5a7.5 7.5 0 0 1 0 11')],
  play: [filled('M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z')],
  pause: [filled('M6.5 5h3.5v14H6.5z'), filled('M14 5h3.5v14H14z')],
  stop: [filled('M6.5 6.5h11v11h-11z')],
  mic: [p('M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3z'), p('M6 11a6 6 0 0 0 12 0'), p('M12 17v3.5'), p('M8.5 20.5h7')],
  skipForward: [filled('M5 6.2v11.6a.7.7 0 0 0 1.1.6l8.6-5.8a.7.7 0 0 0 0-1.2L6.1 5.6A.7.7 0 0 0 5 6.2z'), filled('M16.5 5.5h2.5v13h-2.5z')],
  skipBack: [filled('M19 6.2v11.6a.7.7 0 0 1-1.1.6l-8.6-5.8a.7.7 0 0 1 0-1.2l8.6-5.8a.7.7 0 0 1 1.1.6z'), filled('M5 5.5h2.5v13H5z')],
  headphones: [p('M4 15v-3a8 8 0 0 1 16 0v3'), p('M4 15h3.5v5H5.5A1.5 1.5 0 0 1 4 18.5z'), p('M20 15h-3.5v5h2a1.5 1.5 0 0 0 1.5-1.5z')],
  undo: [p('M9 6.5L4.5 11 9 15.5'), p('M5 11h9.5a4.5 4.5 0 0 1 0 9H12')],
  redo: [p('M15 6.5l4.5 4.5-4.5 4.5'), p('M19 11H9.5a4.5 4.5 0 0 0 0 9H12')],
  // Wstecz / dalej w pasku nawigacji (od 1.11.2): zawinięte strzałki jak w aplikacjach Apple.
  historyBack: [p('M8.5 4L4 8.5 8.5 13'), p('M4.5 8.5H15a5 5 0 0 1 0 10h-3.5')],
  historyForward: [p('M15.5 4L20 8.5 15.5 13'), p('M19.5 8.5H9a5 5 0 0 0 0 10h3.5')],
  clock: [{ tag: 'circle', cx: 12, cy: 12, r: 8.5 }, p('M12 7.5V12l3 2')],
  flip: [p('M19.5 12a7.5 7.5 0 0 1-13.2 4.9'), p('M4.5 12a7.5 7.5 0 0 1 13.2-4.9'), p('M18.2 3.6v3.8h-3.8'), p('M5.8 20.4v-3.8h3.8')],
  minus: [p('M5 12h14')],
  table: [p('M4 5.5h16v13H4z'), p('M4 10h16'), p('M4 14.3h16'), p('M9.5 5.5v13')],
  // Szerokości kolumn tabeli (od 1.26).
  columns: [p('M4 5.5h16v13H4z'), p('M9.3 5.5v13'), p('M14.7 5.5v13'), p('M6.2 12h1.4'), p('M16.4 12h1.4')],
  folder: [p('M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z')],
  stack: [p('M12 4l8.5 4.3L12 12.6 3.5 8.3z'), p('M3.5 12.3l8.5 4.3 8.5-4.3'), p('M3.5 16.2l8.5 4.3 8.5-4.3')],
  book: [p('M5 5a2 2 0 0 1 2-2h12v14.5H7.5A2.5 2.5 0 0 0 5 20z'), p('M5 20a2.5 2.5 0 0 0 2.5 1H19v-3.5')],
  bookOpen: [p('M12 6.5C10 5 7.2 4.6 3.5 5v13c3.7-.4 6.5 0 8.5 1.5'), p('M12 6.5c2-1.5 4.8-1.9 8.5-1.5v13c-3.7-.4-6.5 0-8.5 1.5'), p('M12 6.5v13')],
  reorder: [p('M7 19V5'), p('M4 8l3-3 3 3'), p('M17 5v14'), p('M14 16l3 3 3-3')],
  select: [{ tag: 'circle', cx: 12, cy: 12, r: 8.5 }, p('M8.2 12.3l2.6 2.6 5-5.3')],
  sparkles: [p('M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6z'), p('M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z')],
  // Notatki i edytor tekstu.
  note: [
    p('M7 3.5h10A1.5 1.5 0 0 1 18.5 5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z'),
    p('M8.75 8.5h6.5'), p('M8.75 12h6.5'), p('M8.75 15.5h3.75')
  ],
  image: [
    p('M5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 5z'),
    { tag: 'circle', cx: 9, cy: 9.6, r: 1.6 }, p('M20.5 15.2l-4.6-4.6L6.3 19')
  ],
  bold: [{ d: 'M7.5 5h5.25a3.25 3.25 0 0 1 0 6.5H7.5zM7.5 11.5h6a3.5 3.5 0 0 1 0 7h-6z', 'stroke-width': 2.4 }],
  italic: [p('M10.5 5h7'), p('M6.5 19h7'), p('M14.5 5l-5 14')],
  underline: [p('M7.5 4.5v6.25a4.5 4.5 0 0 0 9 0V4.5'), p('M5.5 20h13')],
  heading: [{ d: 'M6.5 5v14M17.5 5v14M6.5 12h11', 'stroke-width': 2.2 }],
  pageBreak: [p('M6.5 3.5V8.5h11v-5'), p('M6.5 20.5v-5h11v5'), p('M3 12h3'), p('M10.5 12h3'), p('M18 12h3')],
  sigma: [p('M17.5 6V4.5h-11l6.5 7.5-6.5 7.5h11V18')],
  // Wstaw obiekt do tekstu notatki (od 1.26): obraz z plusem.
  insertObject: [
    p('M4.5 8h9a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 17.5v-8A1.5 1.5 0 0 1 4.5 8z'),
    p('M15 15.4l-3.2-3.2L5.5 19'), { tag: 'circle', cx: 7, cy: 11.3, r: 1.2 }, p('M18.5 2.5v7'), p('M15 6h7')
  ],
  listBullet: [dot(5.2, 7, 1.4), dot(5.2, 12, 1.4), dot(5.2, 17, 1.4), p('M9.5 7h10'), p('M9.5 12h10'), p('M9.5 17h10')],
  listNumber: [
    { d: 'M4.3 5.3l1.4-.8v5', 'stroke-width': 1.5 },
    { d: 'M4 14.5c.3-.7.9-1 1.5-.9.7.1 1 .6 1 1.1-.1.8-1.4 1.6-2.5 3.1h2.7', 'stroke-width': 1.5 },
    p('M10 7h10'), p('M10 12h10'), p('M10 17h10')
  ],
  textColor: [p('M6.5 15.5L12 3.5l5.5 12'), p('M8.4 11.3h7.2')],
  // Notatka (od 1.18): indeks górny i dolny, wielkość tekstu, wcięcie.
  superscript: [p('M4.5 9l7.5 9'), p('M12 9l-7.5 9'), { d: 'M15.4 7.4c.2-.9.9-1.5 1.8-1.5s1.7.6 1.7 1.5c0 1.2-1.6 1.9-3.5 3.7h3.7', 'stroke-width': 1.5 }],
  subscript: [p('M4.5 6l7.5 9'), p('M12 6l-7.5 9'), { d: 'M15.4 15.4c.2-.9.9-1.5 1.8-1.5s1.7.6 1.7 1.5c0 1.2-1.6 1.9-3.5 3.7h3.7', 'stroke-width': 1.5 }],
  textSize: [p('M3 18.5L8.5 5.5l5.5 13'), p('M5.1 13.6h6.8'), p('M14.5 18.5l3.2-7.5 3.3 7.5'), p('M15.7 16h4')],
  indent: [p('M4 5.5h16'), p('M11 10h9'), p('M11 14h9'), p('M4 18.5h16'), p('M4.5 9l3.5 3-3.5 3')],
  outdent: [p('M4 5.5h16'), p('M11 10h9'), p('M11 14h9'), p('M4 18.5h16'), p('M8 9l-3.5 3 3.5 3')],
  clearFormat: [p('M6 5h11'), p('M11.5 5L9 17'), p('M14 14l5.5 5.5'), p('M19.5 14L14 19.5')],
  zoomIn: [{ tag: 'circle', cx: 11, cy: 11, r: 6.5 }, p('M20 20l-4.3-4.3'), p('M11 8.3v5.4'), p('M8.3 11h5.4')],
  // Rysunki (od 1.12). Pasek pod zakreślaczem ma kolor wybranego zakreślacza (klasa icon__accent).
  pen: [p('M4 20l1.2-4.6L15.6 5a2.1 2.1 0 0 1 3 3L8.2 18.4z'), p('M13.8 6.8l3 3')],
  highlighter: [
    p('M9 15l-3 3h5l1.5-1.5'), p('M8 13.5l7.8-7.8a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L11.5 17z'),
    { d: 'M4 21h16', class: 'icon__accent', 'stroke-width': 2.6 }
  ],
  // Zaznaczanie prostokątem i linijka w edytorze rysunku (od 1.12.1).
  marquee: [{ d: 'M4 4.5h12v7.5M4 4.5v12h7.5', 'stroke-dasharray': '2.4 2.4' }, filled('M13.5 13.5l7 2.4-3 1.3-1.3 3z')],
  textBox: [{ d: 'M3.5 5h17v14h-17z', 'stroke-dasharray': '2.4 2.2' }, p('M8 9h8'), p('M12 9v7')],
  // Lasso i powielanie (od 1.14) – „Kopiuj” ma ikonę copy, „Powiel” – kopię z plusem.
  lasso: [
    { d: 'M12 4c4.7 0 8.5 2.5 8.5 5.6s-3.8 5.6-8.5 5.6-8.5-2.5-8.5-5.6S7.3 4 12 4z', 'stroke-dasharray': '2.4 2.3' },
    p('M7.4 14.2c-1.3 1.2-1.4 2.6-.3 3.5 1.2 1 1.1 2.3-.2 3.3')
  ],
  // Kształty, liniuszek i tło strony (od 1.15).
  shapeLine: [p('M5 19L19 5'), dot(5, 19, 1.8), dot(19, 5, 1.8)],
  shapeArrow: [p('M5 19L18.5 5.5'), p('M11 5.2h7.8V13')],
  shapeRect: [p('M4 6.5h16v11H4z')],
  shapeEllipse: [{ tag: 'ellipse', cx: 12, cy: 12, rx: 8.5, ry: 6 }],
  shapeTriangle: [p('M12 4.5l8.5 15h-17z')],
  shapeDiamond: [p('M12 3.5l8.5 8.5-8.5 8.5L3.5 12z')],
  shapeTrapezoid: [p('M7.5 6.5h9l4 11h-17z')],
  // Od 1.27: prosta, strzałka po łuku, punkt (symetrii) i rodzaje linii.
  shapeXline: [p('M2.5 19.5l19-15'), dot(8.8, 14.5, 1.7), dot(15.2, 9.5, 1.7)],
  shapeCurve: [p('M4 18.5C5.5 10 13 5.8 19.5 7.2'), p('M15.6 4.4l3.9 2.8-3 3.8')],
  shapePoint: [{ tag: 'circle', cx: 12, cy: 12, r: 4.6 }, p('M12 4v16'), p('M4 12h16')],
  // Od 1.34: łuk przez trzy punkty, wymiar (grupa Wymiary) i jego rodzaje.
  shapeArc: [p('M4 18A9.5 9.5 0 0 1 20 9.5'), dot(4, 18, 1.8), dot(10.6, 9.4, 1.8), dot(20, 9.5, 1.8)],
  // Od 1.40: wielokąt foremny, półprosta, narożniki prostokąta, kreskowanie i kolejność rysowania.
  shapeNgon: [p('M20.5 12l-4.25 7.36h-8.5L3.5 12l4.25-7.36h8.5z')],
  shapeRay: [dot(4.5, 18.5, 2.1), p('M4.5 18.5L21.5 5.5'), dot(12.6, 12.3, 1.6)],
  cornerNone: [p('M5 19.5V5h14.5')],
  cornerRound: [p('M5 19.5V12a7 7 0 0 1 7-7h7.5')],
  cornerChamfer: [p('M5 19.5v-8l6.5-6.5h8')],
  hatch: [p('M4.5 4.5h15v15h-15z'), { d: 'M4.5 12L12 4.5M4.5 19.5l15-15M12 19.5l7.5-7.5', 'stroke-width': 1.2 }],
  order: [p('M8.5 8.5h11v11h-11z'), p('M4.5 15.5v-11h11')],
  orderFront: [p('M4.5 4h15'), p('M12 20V8.5'), p('M8 12.5l4-4 4 4')],
  orderUp: [p('M12 19V6'), p('M7.5 10.5L12 6l4.5 4.5')],
  orderDown: [p('M12 5v13'), p('M7.5 13.5L12 18l4.5-4.5')],
  orderBack: [p('M4.5 20h15'), p('M12 4v11.5'), p('M8 11.5l4 4 4-4')],
  dimension: [p('M4 5.5v13'), p('M20 5.5v13'), p('M4 12h16'), p('M7.5 9.2L4 12l3.5 2.8'), p('M16.5 9.2L20 12l-3.5 2.8')],
  // Od 1.36 rodzaje wymiaru w górnym menu: kąt (łuk między ramionami), promień (od środka do okręgu), średnica (⌀).
  dimAngle: [p('M4 19.5h16.5'), p('M4 19.5L14.5 5'), p('M15.2 19.5a11.2 11.2 0 0 0-4.6-9'), p('M8.6 11.6l2-1.3.2 2.4')],
  dimRadius: [p('M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17'), dot(12, 12, 1.5), p('M12 12l5.4-5.4'), p('M14.4 6.9l3-.3-.3 3')],
  dimDiameter: [p('M12 4.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15'), p('M5 19L19 5')],
  lineSolid: [p('M3 12h18')],
  lineDashed: [{ d: 'M3 12h18', 'stroke-dasharray': '4 3' }],
  lineCenter: [{ d: 'M3 12h18', 'stroke-dasharray': '7 2.5 0.01 2.5' }],
  linePhantom: [{ d: 'M2 12h20', 'stroke-dasharray': '6 2.2 0.01 2.2 0.01 2.2' }],
  lineDotted: [{ d: 'M3.5 12h17', 'stroke-dasharray': '0.01 3.2', 'stroke-width': 2.4 }],
  markDot: [dot(12, 12, 3.6)],
  markCross: [p('M7 7l10 10'), p('M17 7L7 17')],
  markPlus: [p('M12 5v14'), p('M5 12h14')],
  // Magnes (od 1.22): przyciąganie końców do krawędzi i narożników.
  // Od 1.22.1: uchwyt odsunięcia linii wymiarowej, ramka tolerancji, znak bazy, chropowatość.
  dimDrag: [p('M12 4v16'), p('M8.5 7.5L12 4l3.5 3.5'), p('M8.5 16.5L12 20l3.5-3.5')],
  // Od 1.32: zestaw Metrologia na kółku narzędzi – suwmiarka.
  caliper: [p('M2.5 5h19v4h-19z'), p('M5 9v9.5l3 1.5V9'), p('M14 9v6.5l3 1.5V9'), p('M10 5v2M13 5v2M16 5v2M19 5v2')],
  // Od 1.33: gotowe zestawy Szkic odręczny, Geometria (cyrkiel) i Notatki (notes), dobór grup na kółku.
  sketch: [p('M3.5 15.5c1.8-4.6 3.6-6.2 5.2-3.4s2.8 4.4 4.8.8 3.4-5.8 7-6.6'), p('M4 20h16')],
  geometry: [{ tag: 'circle', cx: 12, cy: 5.5, r: 1.8 }, p('M11 7.1L5.5 20'), p('M13 7.1L18.5 20'), p('M7.2 16.2a8 8 0 0 0 9.6 0')],
  notes: [p('M6 4.5h12v15H6z'), p('M9 4.5V3M12 4.5V3M15 4.5V3'), p('M9 9.5h6'), p('M9 13h6'), p('M9 16.5h3.5')],
  ringEdit: [p('M4 7h9'), p('M17 7h3'), { tag: 'circle', cx: 15, cy: 7, r: 2 }, p('M4 17h3'), p('M11 17h9'), { tag: 'circle', cx: 9, cy: 17, r: 2 }],
  gdtFrame: [p('M2.5 8h19v8h-19z'), p('M9 8v8'), p('M15.5 8v8'), p('M4 14h3.5'), p('M5.75 14v-4')],
  datumMark: [p('M8 3.5h8v7H8z'), p('M12 10.5v5'), filled('M8 20.5h8L12 15.5z')],
  roughness: [p('M3.5 12.5l3.2 6.5 5.6-14h9')],
  magnet: [p('M6 4h4v8a2 2 0 0 0 4 0V4h4v8a6 6 0 0 1-12 0z'), p('M6 8h4M14 8h4')],
  guide: [p('M3.5 6.5h17'), p('M3.5 12h17'), p('M3.5 17.5h17'), { d: 'M8 4l-3 16M14 4l-3 16M20 4l-3 16', 'stroke-dasharray': '1.6 2', 'stroke-width': 1.2 }],
  paper: [p('M5 4h14v16H5z'), { d: 'M5 9.3h14M5 14.6h14M9.7 4v16M14.3 4v16', 'stroke-width': 1.1 }],
  // Osadzanie fragmentu rysunku w notatce i wypełnienie kształtu (od 1.17).
  embed: [p('M3.5 8.5h11.5v11H3.5z'), p('M3.5 17.2l3.6-3.6 3 3 1.8-1.8 3.1 3.1'), p('M20.5 3.5l-7 7'), p('M13.5 6v4.5H18')],
  fill: [p('M4.5 4.5h15v15h-15z'), filled('M4.5 12.5h15v7h-15z')],
  duplicate: [
    p('M9.5 9h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 19.5v-9A1.5 1.5 0 0 1 9.5 9z'),
    p('M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5'), p('M14 12.3v5.4'), p('M11.3 15h5.4')
  ],
  // Od 1.30: odbicie lustrzane (w poziomie, w pionie), obrót zaznaczenia i palec (palec też rysuje).
  mirror: [{ d: 'M12 3v18', 'stroke-dasharray': '2 2' }, p('M9.5 6.5L3.5 17.5h6z'), filled('M14.5 6.5l6 11h-6z')],
  mirrorVertical: [{ d: 'M3 12h18', 'stroke-dasharray': '2 2' }, p('M17.5 9.5L6.5 3.5v6z'), filled('M17.5 14.5l-11 6v-6z')],
  // Od 1.41: odbicie względem prostej (ukośna oś), skalowanie, „Styl jak…” (pędzel), ramka rysunkowa z tabliczką.
  mirrorLine: [{ d: 'M4 20L20 4', 'stroke-dasharray': '2 2' }, p('M4.5 11.5l5.5-5.5 1 6.5z'), filled('M12.5 19.5l6.5-1-5.5-5.5z')],
  scale: [p('M4 13.5v6.5h6.5'), p('M4 20l7-7'), p('M13 4h7v7'), p('M20 4l-8 8'), { d: 'M4 9V4h5', 'stroke-dasharray': '1.6 2' }],
  brush: [p('M14.5 4.5l5 5-7.5 7.5-5-5z'), p('M7 12l-1.8 1.8a2.3 2.3 0 0 0 0 3.2l1.8 1.8a2.3 2.3 0 0 0 3.2 0L12 17'), p('M4 20.5h6')],
  titleBlock: [p('M3 4.5h18v15H3z'), p('M11 14h10'), p('M11 14v5.5'), p('M16 14v5.5'), p('M11 16.8h10')],
  // Od 1.42: wymiar długości łuku, osie okręgu, wymiar pionowy i równoległy, łańcuch i od bazy.
  dimArc: [p('M5 19.5a8 8 0 0 1 14 0'), p('M3 15.5a10.5 10.5 0 0 1 18 0'), p('M3.2 12.3l-.2 3.2 2.9-1.3'), p('M18.1 14.2l2.9 1.3-.2-3.2')],
  centerMark: [{ tag: 'circle', cx: 12, cy: 12, r: 6.5 }, { d: 'M2.5 12h19M12 2.5v19', 'stroke-dasharray': '5 1.8 0.01 1.8', 'stroke-width': 1.2 }],
  dimVertical: [p('M5.5 4h13'), p('M5.5 20h13'), p('M12 4v16'), p('M9.2 7.5L12 4l2.8 3.5'), p('M9.2 16.5L12 20l2.8-3.5')],
  dimAligned: [p('M4 15l8-8'), p('M13 22l8-8'), p('M5.5 18.5l12-12'), p('M5.3 14.3l.2 4.2 4.2.2'), p('M13.8 6.3l3.7-.2-.2 3.7')],
  dimChain: [p('M3 8v10'), p('M12 8v10'), p('M21 8v10'), p('M3 13h18'), p('M5.5 11.2L3 13l2.5 1.8'), p('M9.5 11.2L12 13l-2.5 1.8'), p('M14.5 11.2L12 13l2.5 1.8'), p('M18.5 11.2L21 13l-2.5 1.8')],
  dimBaseline: [p('M3 5v15'), p('M12 13v7'), p('M21 7v13'), p('M3 15h9'), p('M3 9h18'), p('M9.5 13.2L12 15l-2.5 1.8'), p('M18.5 7.2L21 9l-2.5 1.8')],
  // Od 1.43: łamana i edycja geometrii – odsuń, zaokrąglij, fazuj, przytnij, wydłuż.
  shapePolyline: [p('M3.5 18.5l5-10 6 6 6-10'), dot(3.5, 18.5, 1.6), dot(8.5, 8.5, 1.6), dot(14.5, 14.5, 1.6), dot(20.5, 4.5, 1.6)],
  offset: [p('M4 14l8-8 8 8'), { d: 'M4 20l8-8 8 8', 'stroke-dasharray': '2.2 2' }],
  fillet: [p('M4 20v-8a8 8 0 0 1 8-8h8'), { d: 'M4 12V4h8', 'stroke-dasharray': '1.6 2' }],
  chamfer: [p('M4 20v-8l8-8h8'), { d: 'M4 12V4h8', 'stroke-dasharray': '1.6 2' }],
  trim: [p('M7 4v16'), p('M17 4v16'), p('M3 12h4'), p('M17 12h4'), { d: 'M8.5 12h7', 'stroke-dasharray': '1.6 2' }],
  extend: [p('M20 4v16'), p('M3 12h8'), { d: 'M11 12h8', 'stroke-dasharray': '1.6 2' }, p('M15.5 9.3L19 12l-3.5 2.7')],
  rotate: [p('M19 12.5a7 7 0 1 1-2.2-5.1'), p('M17.6 3.4v4.2h-4.2'), dot(12, 12.5, 1.4)],
  finger: [
    p('M9 14.2V5.3a1.6 1.6 0 0 1 3.2 0V11'), p('M12.2 10.4a1.6 1.6 0 0 1 3.2 0v.9'),
    p('M15.4 11.1a1.6 1.6 0 0 1 3.2 0V15a6 6 0 0 1-6 6H12a5.4 5.4 0 0 1-4.3-2.2l-3-4.1a1.5 1.5 0 0 1 2.4-1.8L9 14.6')
  ],
  ruler: [p('M3.5 15.8L15.8 3.5l4.7 4.7L8.2 20.5z'), p('M7.3 12l1.9 1.9'), p('M10 9.3l1.3 1.3'), p('M12.7 6.6l1.9 1.9')],
  // Sygnatura obrazu (etykieta) – od 1.12, odróżnia się od ołówka „Edytuj rysunek”.
  tag: [p('M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z'), { tag: 'circle', cx: 8, cy: 8.5, r: 1.4 }],
  eraser: [p('M8.5 19.5h11'), p('M5.2 14.3l8.6-8.6a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8L12 18.5H9.4l-4.2-4.2z'), p('M9.3 10.2l5.5 5.5')],
  // Rysunek od 1.19: wymiar widoczny na stałe (oko), szyk i jego rozdzielenie, zakończenia odcinka.
  eye: [p('M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z'), { tag: 'circle', cx: 12, cy: 12, r: 2.8 }],
  eyeOff: [p('M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z'), { tag: 'circle', cx: 12, cy: 12, r: 2.8 }, p('M4 20L20 4')],
  array: [p('M3.5 5.5h4.2v4.2H3.5z'), p('M9.9 5.5h4.2v4.2H9.9z'), p('M16.3 5.5h4.2v4.2h-4.2z'), p('M3.5 14.3h4.2v4.2H3.5z'), p('M9.9 14.3h4.2v4.2H9.9z'), p('M16.3 14.3h4.2v4.2h-4.2z')],
  explode: [
    { d: 'M9 9h6v6H9z', 'stroke-dasharray': '2 1.8' },
    p('M6.5 6.5L3.5 3.5M3.5 6.8V3.5h3.3'), p('M17.5 6.5l3-3M17.2 3.5h3.3v3.3'), p('M6.5 17.5l-3 3M3.5 17.2v3.3h3.3'), p('M17.5 17.5l3 3M20.5 17.2v3.3h-3.3')
  ],
  capNone: [p('M3 12h18')],
  capArrow: [p('M3 12h17.5'), p('M15 7.2l5.5 4.8-5.5 4.8')],
  capTriangle: [p('M3 12h12'), filled('M21 12l-7.5-4.5v9z')],
  capCircle: [p('M3 12h13'), dot(17.2, 12, 3.6)],
  capSquare: [p('M3 12h11'), filled('M13.6 8.4h7.2v7.2h-7.2z')],
  capDiamond: [p('M3 12h11'), filled('M21.2 12l-4-4.6-4 4.6 4 4.6z')],
  // Notatki 1.20: wyrównanie i interlinia, link, symbole, data, druk (PDF).
  alignLeft: [p('M4 6h16'), p('M4 10h10'), p('M4 14h16'), p('M4 18h10')],
  alignCenter: [p('M4 6h16'), p('M7 10h10'), p('M4 14h16'), p('M7 18h10')],
  alignRight: [p('M4 6h16'), p('M10 10h10'), p('M4 14h16'), p('M10 18h10')],
  alignJustify: [p('M4 6h16'), p('M4 10h16'), p('M4 14h16'), p('M4 18h11')],
  lineSpacing: [p('M11.5 6h8.5'), p('M11.5 12h8.5'), p('M11.5 18h8.5'), p('M6 4.5v15'), p('M3.5 7L6 4.5 8.5 7'), p('M3.5 17L6 19.5 8.5 17')],
  link: [p('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.2 1.2'), p('M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.2-1.2')],
  unlink: [p('M14.8 12.2l3.4-3.4a3.5 3.5 0 0 0-5-5l-3.4 3.4'), p('M9.2 11.8l-3.4 3.4a3.5 3.5 0 0 0 5 5l3.4-3.4'), p('M4 4l16 16')],
  omega: [p('M4.5 19.5h4.6v-2.3a6.6 6.6 0 1 1 5.8 0v2.3h4.6')],
  calendar: [
    p('M5 6h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 6z'),
    p('M3.5 10.5h17'), p('M8 3.5v4'), p('M16 3.5v4'), dot(8.5, 14.5, 1.1), dot(12, 14.5, 1.1), dot(15.5, 14.5, 1.1)
  ],
  sticky: [
    p('M5 4.5h14a.5.5 0 0 1 .5.5v9.6L14.6 19.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z'), p('M19.5 14.5h-4.6a.5.5 0 0 0-.5.5v4.5'),
    p('M8 9h8'), p('M8 12.5h5')
  ],
  print: [
    p('M7 9V4h10v5'), p('M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2'),
    p('M7 14h10v6H7z')
  ]
};

/** Zwraca element SVG ikony o podanej nazwie. */
export function icon(name, options = {}) {
  const shapes = ICONS[name];
  if (!shapes) throw new Error(`Nieznana ikona: ${name}`);
  // Klasa z nazwą ikony (np. „icon--note”) – styl jednej ikony wszędzie, gdzie się pojawia.
  return svg(shapes, { ...options, className: `${options.className ?? 'icon'} icon--${name}` });
}

export const ICON_NAMES = Object.keys(ICONS);
