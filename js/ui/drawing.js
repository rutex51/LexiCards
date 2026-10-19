// Edytor rysunku (od 1.12): okno na cały ekran z płótnem, pióro z naciskiem rysika, zakreślacz,
// gumka całych kresek albo fragmentów (od 1.12.1), kolory, grubości, cofnij i ponów, tło gładkie /
// w linie / w kratkę, rysowanie na zdjęciu, powiększanie i przesuwanie. Od 1.12.1 także
// zaznaczanie prostokątem (przesuwanie, powielanie, usuwanie) i linijka z kątem, od 1.13 – pola
// tekstowe i wzory (zapis jak w notatce, składany na płótnie przez core/math-layout.js).
//
// Rysik i palec: gdy aplikacja raz zobaczy rysik (pointerType 'pen'), rysuje tylko rysik, a palec
// przesuwa stronę (dłoń oparta o ekran nie zostawia śladów); bez rysika (iPhone) rysuje palec.
// Dwa palce zawsze powiększają i przesuwają. Myszą rysuje się jak piórem; kółko przewija,
// Ctrl + kółko powiększa. Gumka na końcu pióra (Windows) ściera bez zmiany narzędzia.
// Linijkę przesuwa palec albo mysz, obracają ją dwa palce albo uchwyt; kreska zaczęta przy
// krawędzi linijki biegnie prosto wzdłuż niej.
//
// Rysowanie: dwie warstwy płótna – zapisane kreski (rysowane od nowa po zmianie widoku albo
// cofnięciu) i warstwa bieżąca nad nimi (kreska w trakcie, przesuwane zaznaczenie, prostokąt
// zaznaczania, linijka, kółko gumki). Wynik to obraz notatki: PNG strony (JPEG, gdy pod spodem
// jest zdjęcie) i kreski do późniejszej edycji (core/drawing.js).

import {
  DrawingHistory, ELEMENT_TEXT_MAX, ERASER_MODES, ERASER_MODE_LABELS, ERASER_SIZES, ERASER_SIZE_LABELS, HIGHLIGHTER_ALPHA,
  HIGHLIGHTER_COLORS, HIGHLIGHTER_WIDTHS, INK_COLORS, PAPERS, PAPER_LABELS, PAPER_STEP, SENSITIVITY_LABELS, TEXT_SIZES,
  TEXT_SIZE_LABELS, addPoint, cleanToolSettings, defaultToolSettings, emptyDrawing, eraseAt, isElement, penWidth, rulerDegrees,
  rulerOffset, rulerPoint, selectionBounds, smoothPoint, snapRulerAngle, strokesAt, strokesInRect, touchesStroke, translateStroke
} from '../core/drawing.js';
import { layoutMath } from '../core/math-layout.js';
import { plural } from '../core/text.js';
import { field, segmented, textArea } from './components.js';
import { confirmDialog, mountDialog, openFormSheet, showError } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { openMathHelp } from './math.js';

const TOOLS_KEY = 'lexicards-drawing-tools';
const PEN_KEY = 'lexicards-pen-seen';
/** Zakres powiększenia względem „cała strona na ekranie”. */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
/** Promień gumki na ekranie (px). */
const ERASER_RADIUS = 14;
/** Margines wokół strony na ekranie (px). */
const STAGE_MARGIN = 14;
/** Linijka (px ekranu): szerokość, jak blisko krawędzi kreska przyskakuje, uchwyty obrotu. */
const RULER_WIDTH = 64;
const RULER_SNAP = 26;
const RULER_HANDLE_RADIUS = 17;
/** Zaznaczenie: margines ramki (px ekranu), dotknięcie bez przesunięcia (px), przesunięcie kopii (jednostki strony). */
const SELECTION_PAD = 8;
const TAP_SLOP = 5;
const DUPLICATE_OFFSET = PAPER_STEP / 2;
/** Zakres suwaków grubości pióra (jednostki rysunku). */
const WIDTH_RANGE = { min: 0.5, max: 20 };

function loadTools() {
  try {
    return cleanToolSettings(JSON.parse(localStorage.getItem(TOOLS_KEY) ?? 'null'));
  } catch {
    return defaultToolSettings();
  }
}

function saveTools(tools) {
  try {
    localStorage.setItem(TOOLS_KEY, JSON.stringify(tools));
  } catch {
    // Pamięć urządzenia niedostępna – ustawienia tylko do zamknięcia edytora.
  }
}

function penSeenBefore() {
  try {
    return localStorage.getItem(PEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberPen() {
  try {
    localStorage.setItem(PEN_KEY, '1');
  } catch {
    // jak wyżej
  }
}

const inkHex = (id) => (INK_COLORS.find((color) => color.id === id) ?? INK_COLORS[0]).hex;
const highlighterHex = (id) => (HIGHLIGHTER_COLORS.find((color) => color.id === id) ?? HIGHLIGHTER_COLORS[0]).hex;

/** Obraz (zdjęcie pod kreskami) z bajtów – do rysowania na płótnie. */
async function loadPicture(photo) {
  if (!photo?.bytes) return null;
  const url = URL.createObjectURL(new Blob([photo.bytes], { type: photo.type }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    return null;
  } finally {
    // Zdekodowany obraz zostaje w pamięci; adres można zwolnić.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// ---------------------------------------------------------------- rysowanie na płótnie

/** Tło strony: białe, w linie albo w kratkę (w jednostkach rysunku). */
export function paintPaper(ctx, drawing) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, drawing.width, drawing.height);
  if (drawing.paper === 'plain' || drawing.photo) return;
  ctx.save();
  ctx.strokeStyle = drawing.paper === 'grid' ? '#e4e5ec' : '#d8e0ee';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let y = PAPER_STEP; y < drawing.height; y += PAPER_STEP) {
    ctx.moveTo(0, y);
    ctx.lineTo(drawing.width, y);
  }
  if (drawing.paper === 'grid') {
    for (let x = PAPER_STEP; x < drawing.width; x += PAPER_STEP) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, drawing.height);
    }
  }
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- pola tekstowe i wzory (od 1.13)

const TEXT_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
/** Wysokość wiersza pola tekstowego względem wielkości czcionki. */
const TEXT_LINE = 1.25;
let measureCanvas = null;
/** Szerokość napisu daną czcionką (płótno pomocnicze – bez rysowania). */
function measureText(text, font) {
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Wiersze pola tekstowego: Enter zaczyna nowy wiersz, długi wiersz łamie się na słowach (za długie słowo – na znakach). */
function textLines(text, size, maxWidth) {
  const font = `${size}px ${TEXT_FONT}`;
  const fits = (value) => measureText(value, font) <= maxWidth;
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(' ')) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (current !== '' && !fits(candidate)) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
      while (!fits(current) && [...current].length > 1) {
        let head = '';
        for (const char of current) {
          if (head !== '' && !fits(head + char)) break;
          head += char;
        }
        lines.push(head);
        current = current.slice(head.length);
      }
    }
    lines.push(current);
  }
  return lines;
}

const mathLayouts = new Map();
/** Układ wzoru (zapamiętany – ten sam wzór rysuje się w każdej klatce). */
function mathLayout(source, size) {
  const key = `${size}|${source}`;
  let layout = mathLayouts.get(key);
  if (!layout) {
    if (mathLayouts.size > 200) mathLayouts.clear();
    layout = layoutMath(source, { size, measure: measureText });
    mathLayouts.set(key, layout);
  }
  return layout;
}

/** Wielkość pola tekstowego albo wzoru zmierzona na tym urządzeniu: { width, height }. */
function measureElement(element) {
  if (element.tool === 'math') {
    const layout = mathLayout(element.source, element.size);
    return { width: Math.max(1, Math.ceil(layout.width)), height: Math.max(1, Math.ceil(layout.ascent + layout.descent)) };
  }
  const font = `${element.size}px ${TEXT_FONT}`;
  const lines = textLines(element.text, element.size, element.maxWidth);
  const width = Math.max(element.size * 0.5, ...lines.map((line) => measureText(line, font)));
  return { width: Math.ceil(width) + 2, height: Math.ceil(lines.length * element.size * TEXT_LINE) };
}

function paintElement(ctx, element) {
  ctx.save();
  ctx.fillStyle = element.color;
  if (element.tool === 'math') {
    const layout = mathLayout(element.source, element.size);
    layout.draw(ctx, element.x, element.y + layout.ascent, element.color);
  } else {
    ctx.font = `${element.size}px ${TEXT_FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    textLines(element.text, element.size, element.maxWidth).forEach((line, index) => {
      ctx.fillText(line, element.x + 1, element.y + element.size * (0.95 + index * TEXT_LINE));
    });
  }
  ctx.restore();
}

/**
 * Kreska: pióro – odcinki między środkami kolejnych punktów (krzywe), każdy z grubością swojego
 * punktu; zakreślacz – jedna ścieżka o stałej grubości, półprzezroczysta i mnożona z tłem.
 * Pole tekstowe i wzór (od 1.13) – napis i wzór od lewego górnego rogu.
 */
export function paintStroke(ctx, stroke) {
  if (isElement(stroke)) {
    paintElement(ctx, stroke);
    return;
  }
  const points = stroke.points;
  const count = points.length / 3;
  if (count === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  if (stroke.tool === 'highlighter') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.lineWidth = points[2];
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    if (count === 1) ctx.lineTo(points[0] + 0.01, points[1]);
    for (let index = 3; index < points.length; index += 3) ctx.lineTo(points[index], points[index + 1]);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (count === 1) {
    ctx.beginPath();
    ctx.arc(points[0], points[1], points[2] / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  let fromX = points[0];
  let fromY = points[1];
  for (let point = 1; point < count; point += 1) {
    const x = points[point * 3];
    const y = points[point * 3 + 1];
    const width = points[point * 3 + 2];
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    if (point === count - 1) {
      ctx.lineTo(x, y);
    } else {
      const toX = (x + points[point * 3 + 3]) / 2;
      const toY = (y + points[point * 3 + 4]) / 2;
      ctx.quadraticCurveTo(x, y, toX, toY);
      fromX = toX;
      fromY = toY;
    }
    ctx.lineWidth = (points[point * 3 - 1] + width) / 2;
    ctx.stroke();
  }
  ctx.restore();
}

/** Cała strona: tło (albo zdjęcie) i kreski; `skip` – kreski pominięte (przesuwane zaznaczenie). */
export function paintDrawing(ctx, drawing, picture = null, skip = null) {
  paintPaper(ctx, drawing);
  if (picture) ctx.drawImage(picture, 0, 0, drawing.width, drawing.height);
  for (const stroke of drawing.strokes) {
    if (!skip?.has(stroke)) paintStroke(ctx, stroke);
  }
}

/** Obraz rysunku do notatki: PNG strony albo JPEG, gdy pod kreskami jest zdjęcie. */
export async function renderDrawingImage(drawing, picture = null) {
  const canvas = document.createElement('canvas');
  canvas.width = drawing.width;
  canvas.height = drawing.height;
  const ctx = canvas.getContext('2d');
  paintDrawing(ctx, drawing, picture);
  const type = drawing.photo ? 'image/jpeg' : 'image/png';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
  if (!blob) throw new Error('Nie udało się zapisać rysunku.');
  return { bytes: await blob.arrayBuffer(), type, width: drawing.width, height: drawing.height };
}

// ---------------------------------------------------------------- edytor

/** Podgląd kreski w ustawieniach pióra: fala od lekkiego do mocnego nacisku i z powrotem. */
function previewStroke(tools) {
  const width = tools.penWidths[tools.penWidth];
  const stroke = { tool: 'pen', color: inkHex(tools.penColor), points: [] };
  let previous = null;
  for (let step = 0; step <= 60; step += 1) {
    const t = step / 60;
    const pressure = Math.sin(Math.PI * t);
    const point = smoothPoint(previous, { x: 14 + t * 300, y: 36 + Math.sin(t * Math.PI * 2) * 14, w: penWidth(pressure, width, tools.sensitivity) }, 0);
    addPoint(stroke, point);
    previous = point;
  }
  return stroke;
}

/**
 * Otwiera edytor rysunku. drawing – istniejący rysunek (edycja) albo null; photo – zdjęcie pod
 * kreskami dla nowego rysunku ({ bytes, type, width, height }); title – sygnatura w nagłówku.
 * Zwraca obietnicę: { drawing, image } po „Gotowe” albo null po „Anuluj” (i po „Gotowe” bez
 * żadnej zmiany – nowy pusty rysunek nie trafia do notatki).
 */
export function openDrawingEditor({ drawing: source = null, photo = null, title = 'Rysunek' } = {}) {
  return new Promise((resolve) => {
    // Pola tekstowe i wzory mierzone od nowa – czcionki tego urządzenia mogą być trochę inne.
    const drawing = source
      ? { ...source, strokes: source.strokes.map((stroke) => (isElement(stroke) ? { ...stroke, ...measureElement(stroke) } : { ...stroke, points: [...stroke.points] })) }
      : emptyDrawing({ photo });
    const history = new DrawingHistory(drawing.strokes);
    const tools = loadTools();
    /** Narzędzie: 'pen', 'highlighter', 'eraser' albo 'select' (zaznaczanie prostokątem). */
    let tool = 'pen';
    let picture = null;
    let penSeen = penSeenBefore();
    let changed = false;
    let dialog;
    let result = null;
    /** Linijka { x, y, angle } w jednostkach strony albo null (schowana). Nie jest częścią rysunku. */
    let ruler = null;
    /** Zaznaczone kreski (te same obiekty co w rysunku). */
    let selection = new Set();
    /** Kółko gumki pod myszą albo zawieszonym rysikiem (jednostki strony) albo null. */
    let hover = null;

    // Widok: skala (px ekranu na jednostkę rysunku) i przesunięcie strony; zoom – względem „cała strona”;
    // top – miejsce u góry płótna zajęte przez pasek narzędzi (pasek leży nad płótnem).
    const view = { zoom: 1, scale: 1, x: 0, y: 0, width: 0, height: 0, top: STAGE_MARGIN, dpr: 1 };
    const stage = h('div', { class: 'drawing__stage', dataset: { testid: 'drawing-stage' } });
    const base = h('canvas', { class: 'drawing__canvas', 'aria-hidden': 'true' });
    const live = h('canvas', { class: 'drawing__canvas drawing__canvas--live', role: 'img', 'aria-label': `Płótno rysunku: ${title}`, dataset: { testid: 'drawing-canvas' } });
    const selectionCount = h('span', { class: 'drawing__selection-count', dataset: { testid: 'drawing-selection-count' } });
    const editButton = h('button', {
      type: 'button', class: 'drawing__selection-button', hidden: true, dataset: { testid: 'drawing-selection-edit' },
      onClick: () => {
        const [only] = selection;
        if (isElement(only)) editElement(only.tool, only);
      }
    }, icon('edit', { size: 18 }), 'Edytuj');
    const selectionBar = h('div', { class: 'drawing__selection', hidden: true, role: 'toolbar', 'aria-label': 'Zaznaczone kreski' },
      selectionCount,
      editButton,
      h('button', {
        type: 'button', class: 'drawing__selection-button', dataset: { testid: 'drawing-selection-duplicate' },
        onClick: () => duplicateSelection()
      }, icon('copy', { size: 18 }), 'Powiel'),
      h('button', {
        type: 'button', class: 'drawing__selection-button drawing__selection-button--danger', dataset: { testid: 'drawing-selection-delete' },
        onClick: () => deleteSelection()
      }, icon('trash', { size: 18 }), 'Usuń'));
    stage.append(base, live, selectionBar);

    const fitScale = () => Math.min((view.width - STAGE_MARGIN * 2) / drawing.width, (view.height - view.top - STAGE_MARGIN) / drawing.height);
    /** Strona mniejsza niż ekran – na środku (pod paskiem narzędzi); większa – nie ucieka poza krawędź. */
    const clampView = () => {
      const pageWidth = drawing.width * view.scale;
      const pageHeight = drawing.height * view.scale;
      const room = view.height - view.top - STAGE_MARGIN;
      view.x = pageWidth <= view.width - STAGE_MARGIN * 2 ? (view.width - pageWidth) / 2
        : Math.min(STAGE_MARGIN, Math.max(view.width - STAGE_MARGIN - pageWidth, view.x));
      view.y = pageHeight <= room ? view.top + (room - pageHeight) / 2
        : Math.min(view.top, Math.max(view.height - STAGE_MARGIN - pageHeight, view.y));
    };
    const setZoom = (zoom, anchorX = view.width / 2, anchorY = view.height / 2) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
      const unitX = (anchorX - view.x) / view.scale;
      const unitY = (anchorY - view.y) / view.scale;
      view.zoom = next;
      view.scale = fitScale() * next;
      view.x = anchorX - unitX * view.scale;
      view.y = anchorY - unitY * view.scale;
      clampView();
      zoomButton.textContent = `${Math.round(next * 100)}%`;
      requestRender();
    };
    /** Punkt zdarzenia (albo { clientX, clientY }) w jednostkach strony. */
    const toDrawing = (event) => {
      const box = live.getBoundingClientRect();
      return { x: (event.clientX - box.left - view.x) / view.scale, y: (event.clientY - box.top - view.y) / view.scale };
    };
    const toScreen = (point) => ({ x: view.x + point.x * view.scale, y: view.y + point.y * view.scale });

    const prepare = (ctx) => {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.clearRect(0, 0, view.width, view.height);
      ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.x, view.dpr * view.y);
    };
    const clipPage = (ctx) => {
      ctx.beginPath();
      ctx.rect(0, 0, drawing.width, drawing.height);
      ctx.clip();
    };
    let active = null;
    const renderBase = () => {
      const ctx = base.getContext('2d');
      prepare(ctx);
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
      ctx.shadowBlur = 12 / view.scale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, drawing.width, drawing.height);
      ctx.restore();
      ctx.save();
      clipPage(ctx);
      // Przesuwane zaznaczenie rysuje warstwa bieżąca.
      paintDrawing(ctx, drawing, picture, active?.kind === 'move' ? selection : null);
      ctx.restore();
    };

    // ---- linijka (na ekranie stałej szerokości, położenie i kąt w jednostkach strony)
    const rulerHandles = () => {
      const distance = Math.min(170, Math.max(70, Math.min(view.width, view.height) * 0.3)) / view.scale;
      return [rulerPoint(ruler, -distance, 0), rulerPoint(ruler, distance, 0)];
    };
    /** Co jest pod punktem strony: uchwyt obrotu, linijka albo nic. */
    const rulerHit = (point) => {
      if (!ruler) return null;
      if (rulerHandles().some((handle) => Math.hypot(handle.x - point.x, handle.y - point.y) <= (RULER_HANDLE_RADIUS + 6) / view.scale)) return 'handle';
      return Math.abs(rulerOffset(ruler, point.x, point.y).across) <= RULER_WIDTH / 2 / view.scale ? 'body' : null;
    };
    const paintRuler = (ctx) => {
      const center = toScreen(ruler);
      const length = Math.hypot(view.width, view.height) * 2;
      const half = RULER_WIDTH / 2;
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.translate(center.x, center.y);
      ctx.rotate(ruler.angle);
      ctx.fillStyle = 'rgba(242, 242, 247, 0.86)';
      ctx.strokeStyle = 'rgba(60, 60, 67, 0.55)';
      ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
      ctx.shadowBlur = 6;
      ctx.fillRect(-length / 2, -half, length, RULER_WIDTH);
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.moveTo(-length / 2, -half + 0.5);
      ctx.lineTo(length / 2, -half + 0.5);
      ctx.moveTo(-length / 2, half - 0.5);
      ctx.lineTo(length / 2, half - 0.5);
      ctx.stroke();
      // Podziałka co ćwierć kratki (dłuższa kreska co kratkę), od środka linijki.
      const step = (PAPER_STEP / 4) * view.scale;
      const every = step < 4 ? 4 : 1;
      ctx.beginPath();
      for (let index = -Math.ceil(length / 2 / step); index * step <= length / 2; index += every) {
        const x = index * step;
        const tick = index % 4 === 0 ? 14 : 7;
        ctx.moveTo(x, -half);
        ctx.lineTo(x, -half + tick);
        ctx.moveTo(x, half);
        ctx.lineTo(x, half - tick);
      }
      ctx.stroke();
      // Kąt na środku linijki – zawsze czytelny (tekst nie leży do góry nogami).
      ctx.save();
      const flip = Math.cos(ruler.angle) < -1e-9 || (Math.abs(Math.cos(ruler.angle)) < 1e-9 && Math.sin(ruler.angle) > 0);
      if (flip) ctx.rotate(Math.PI);
      ctx.fillStyle = 'rgba(29, 29, 31, 0.9)';
      ctx.font = '600 15px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${rulerDegrees(ruler.angle)}°`, 0, 0);
      ctx.restore();
      // Uchwyty obrotu.
      const distance = Math.min(170, Math.max(70, Math.min(view.width, view.height) * 0.3));
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * distance, 0, RULER_HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(60, 60, 67, 0.45)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(side * distance, 0, 8, -Math.PI * 0.85, Math.PI * 0.35);
        ctx.strokeStyle = 'rgba(29, 29, 31, 0.85)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        const end = { x: side * distance + Math.cos(Math.PI * 0.35) * 8, y: Math.sin(Math.PI * 0.35) * 8 };
        ctx.beginPath();
        ctx.moveTo(end.x - 4, end.y - 1);
        ctx.lineTo(end.x, end.y);
        ctx.lineTo(end.x + 1, end.y - 4);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.restore();
    };

    const eraserRadius = () => (tools.eraserMode === 'pixel' ? ERASER_SIZES[tools.eraserSize] / 2 : ERASER_RADIUS) / view.scale;
    const renderLive = () => {
      const ctx = live.getContext('2d');
      prepare(ctx);
      ctx.save();
      clipPage(ctx);
      if (active?.kind === 'stroke') paintStroke(ctx, active.stroke);
      if (active?.kind === 'move') {
        ctx.translate(active.dx, active.dy);
        for (const stroke of selection) paintStroke(ctx, stroke);
      }
      ctx.restore();
      const bounds = selectionBounds([...selection]);
      if (bounds) {
        const pad = SELECTION_PAD / view.scale;
        const [dx, dy] = active?.kind === 'move' ? [active.dx, active.dy] : [0, 0];
        ctx.save();
        ctx.setLineDash([6 / view.scale, 4 / view.scale]);
        ctx.lineWidth = 1.5 / view.scale;
        ctx.strokeStyle = '#0058be';
        ctx.fillStyle = 'rgba(0, 88, 190, 0.06)';
        ctx.fillRect(bounds.minX - pad + dx, bounds.minY - pad + dy, bounds.maxX - bounds.minX + pad * 2, bounds.maxY - bounds.minY + pad * 2);
        ctx.strokeRect(bounds.minX - pad + dx, bounds.minY - pad + dy, bounds.maxX - bounds.minX + pad * 2, bounds.maxY - bounds.minY + pad * 2);
        ctx.restore();
      }
      if (active?.kind === 'marquee') {
        const { x0, y0, x1, y1 } = active.rect;
        ctx.save();
        ctx.setLineDash([5 / view.scale, 4 / view.scale]);
        ctx.lineWidth = 1.2 / view.scale;
        ctx.strokeStyle = '#0058be';
        ctx.fillStyle = 'rgba(0, 88, 190, 0.08)';
        ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        ctx.restore();
      }
      if (ruler) paintRuler(ctx);
      const cursor = active?.kind === 'erase' ? active.last : (tool === 'eraser' ? hover : null);
      if (cursor) {
        ctx.save();
        ctx.lineWidth = 1.2 / view.scale;
        ctx.strokeStyle = 'rgba(29, 29, 31, 0.7)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(cursor.x, cursor.y, eraserRadius(), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      placeSelectionBar(bounds);
    };
    /** Polecenia zaznaczenia nad ramką (albo pod nią, gdy u góry brakuje miejsca). */
    function placeSelectionBar(bounds) {
      const show = Boolean(bounds) && active?.kind !== 'move' && active?.kind !== 'marquee';
      selectionBar.hidden = !show;
      if (!show) return;
      const items = [...selection];
      const only = items.length === 1 ? items[0] : null;
      selectionCount.textContent = only?.tool === 'text' ? 'Pole tekstowe' : only?.tool === 'math' ? 'Wzór'
        : items.some(isElement) ? plural(items.length, 'element', 'elementy', 'elementów') : plural(items.length, 'kreska', 'kreski', 'kresek');
      editButton.hidden = !isElement(only);
      const top = toScreen({ x: 0, y: bounds.minY }).y - SELECTION_PAD;
      const bottom = toScreen({ x: 0, y: bounds.maxY }).y + SELECTION_PAD;
      const middle = toScreen({ x: (bounds.minX + bounds.maxX) / 2, y: 0 }).x;
      const width = selectionBar.offsetWidth;
      const height = selectionBar.offsetHeight;
      const left = Math.min(Math.max(8, middle - width / 2), Math.max(8, view.width - width - 8));
      const above = top - height - 8;
      selectionBar.style.left = `${left}px`;
      selectionBar.style.top = `${above >= 8 ? above : Math.min(bottom + 8, view.height - height - 8)}px`;
    }
    let frame = 0;
    function requestRender() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderBase();
        renderLive();
      });
    }
    let liveFrame = 0;
    /** Sama warstwa bieżąca (linijka, prostokąt zaznaczania, przesuwane kreski) – w następnej klatce. */
    function requestLive() {
      if (liveFrame || frame) return;
      liveFrame = requestAnimationFrame(() => {
        liveFrame = 0;
        renderLive();
      });
    }
    const resize = () => {
      const box = stage.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const keepFit = view.width === 0;
      view.width = box.width;
      view.height = box.height;
      // Miejsce pod paskiem narzędzi – mierzone przy otwarciu, obrocie ekranu i „100%”; zmiana
      // narzędzia (pasek o inny wiersz wyższy na telefonie) nie przesuwa strony.
      view.top = Math.max(STAGE_MARGIN, topBar.getBoundingClientRect().bottom - box.top + 8);
      view.dpr = Math.min(window.devicePixelRatio || 1, 3);
      for (const canvas of [base, live]) {
        canvas.width = Math.round(box.width * view.dpr);
        canvas.height = Math.round(box.height * view.dpr);
      }
      if (keepFit) {
        view.scale = fitScale() * view.zoom;
        view.x = 0;
        view.y = 0;
      } else {
        view.scale = fitScale() * view.zoom;
      }
      clampView();
      requestRender();
    };
    const observer = new ResizeObserver(resize);

    // ---- pasek narzędzi
    const toolButton = (id, label, iconName) => h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': label, title: label, 'aria-pressed': 'false',
      dataset: { tool: id, testid: `drawing-tool-${id}` },
      onClick: () => {
        // Drugie dotknięcie aktywnego pióra albo zakreślacza – ustawienia.
        if (tool === id && (id === 'pen' || id === 'highlighter')) {
          toggleSettings();
          return;
        }
        setTool(id);
      }
    }, icon(iconName, { size: 24 }));
    function setTool(id) {
      if (id !== 'select') clearSelection();
      tool = id;
      hover = null;
      closeSettings();
      updateToolbar();
      requestLive();
    }
    const penButton = toolButton('pen', 'Pióro', 'pen');
    const highlighterButton = toolButton('highlighter', 'Zakreślacz', 'highlighter');
    const eraserButton = toolButton('eraser', 'Gumka', 'eraser');
    const selectButton = toolButton('select', 'Zaznaczanie – prostokąt albo dotknięcie kreski', 'marquee');
    const textButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Pole tekstowe', title: 'Pole tekstowe', dataset: { testid: 'drawing-insert-text' },
      onClick: () => editElement('text')
    }, icon('textBox', { size: 24 }));
    const mathButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Wzór', title: 'Wzór (zapis jak w notatce)', dataset: { testid: 'drawing-insert-math' },
      onClick: () => editElement('math')
    }, icon('sigma', { size: 24 }));
    const rulerButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Linijka', title: 'Linijka', 'aria-pressed': 'false', dataset: { testid: 'drawing-ruler' },
      onClick: () => toggleRuler()
    }, icon('ruler', { size: 24 }));
    const swatches = h('div', { class: 'drawing__group drawing__swatches', role: 'group', 'aria-label': 'Kolor' });
    const widths = h('div', { class: 'drawing__group drawing__widths', role: 'group', 'aria-label': 'Grubość' });
    const eraserModes = h('div', { class: 'drawing__group drawing__modes', role: 'radiogroup', 'aria-label': 'Gumka' },
      ERASER_MODES.map((mode) => h('button', {
        type: 'button', class: 'drawing__mode', role: 'radio', dataset: { mode, testid: `drawing-eraser-${mode}` },
        onClick: () => { tools.eraserMode = mode; saveTools(tools); updateToolbar(); requestLive(); }
      }, ERASER_MODE_LABELS[mode])));
    const eraserSizes = h('div', { class: 'drawing__group drawing__widths', role: 'radiogroup', 'aria-label': 'Wielkość gumki' },
      ERASER_SIZES.map((size, index) => h('button', {
        type: 'button', class: 'drawing__width drawing__width--eraser', role: 'radio', 'aria-label': `Gumka: ${ERASER_SIZE_LABELS[index].toLowerCase()}`,
        title: ERASER_SIZE_LABELS[index], dataset: { size: String(index), testid: `drawing-eraser-size-${index}` },
        onClick: () => { tools.eraserSize = index; saveTools(tools); updateToolbar(); requestLive(); }
      }, h('span', { style: { width: `${Math.round(6 + index * 4)}px`, height: `${Math.round(6 + index * 4)}px` } }))));
    // Zaznacz wszystko – na iPadzie bez klawiatury nie ma Ctrl+A.
    const selectGroup = h('div', { class: 'drawing__group' }, h('button', {
      type: 'button', class: 'drawing__chip', dataset: { testid: 'drawing-select-all' }, onClick: () => selectAll()
    }, 'Zaznacz wszystko'));
    const undoButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Cofnij', title: 'Cofnij (Ctrl+Z)', dataset: { testid: 'drawing-undo' },
      onClick: () => { if (history.undo()) afterHistory(); }
    }, icon('undo', { size: 24 }));
    const redoButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Ponów', title: 'Ponów (Ctrl+Shift+Z)', dataset: { testid: 'drawing-redo' },
      onClick: () => { if (history.redo()) afterHistory(); }
    }, icon('redo', { size: 24 }));
    const paperButton = h('button', {
      type: 'button', class: 'drawing__chip', dataset: { testid: 'drawing-paper' }, hidden: Boolean(drawing.photo),
      onClick: () => {
        drawing.paper = PAPERS[(PAPERS.indexOf(drawing.paper) + 1) % PAPERS.length];
        changed = true;
        updateToolbar();
        requestRender();
      }
    });
    // Grupy narzędzi zawijają się w całości (na telefonie – dwa wiersze).
    const toolbar = h('div', { class: 'drawing__toolbar', role: 'toolbar', 'aria-label': 'Narzędzia rysunku' },
      h('div', { class: 'drawing__group' }, penButton, highlighterButton, eraserButton, selectButton, textButton, mathButton),
      swatches, widths, eraserModes, eraserSizes, selectGroup,
      h('div', { class: 'drawing__group' }, rulerButton, undoButton, redoButton, paperButton));

    const zoomButton = h('button', {
      type: 'button', class: 'drawing__pill', title: 'Cała strona', dataset: { testid: 'drawing-zoom' },
      onClick: () => { view.zoom = 1; view.width = 0; resize(); zoomButton.textContent = '100%'; }
    }, '100%');
    const penPill = h('span', { class: 'drawing__pill drawing__pill--info', hidden: !penSeen, dataset: { testid: 'drawing-pen-only' } },
      icon('pen', { size: 14 }), 'Rysuje tylko rysik · palec przesuwa');
    const rulerPill = h('span', { class: 'drawing__pill drawing__pill--info', hidden: true, dataset: { testid: 'drawing-ruler-angle' } });
    const status = h('div', { class: 'drawing__status' }, penPill, rulerPill, zoomButton);

    function updateToolbar() {
      for (const button of [penButton, highlighterButton, eraserButton, selectButton]) {
        button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
      }
      const inking = tool === 'pen' || tool === 'highlighter';
      const highlighter = tool === 'highlighter';
      const palette = highlighter ? HIGHLIGHTER_COLORS : INK_COLORS;
      const chosen = highlighter ? tools.highlighterColor : tools.penColor;
      replaceChildren(swatches, palette.map((color) => h('button', {
        type: 'button', class: 'drawing__swatch', style: { '--swatch': color.hex }, 'aria-label': color.label, title: color.label,
        'aria-pressed': String(color.id === chosen), dataset: { testid: `drawing-color-${color.id}` },
        onClick: () => {
          if (highlighter) tools.highlighterColor = color.id;
          else tools.penColor = color.id;
          saveTools(tools);
          updateToolbar();
        }
      })));
      swatches.hidden = !inking;
      // Pasek pod ikoną zakreślacza w kolorze wybranego zakreślacza.
      highlighterButton.style.setProperty('--highlighter-ink', highlighterHex(tools.highlighterColor));
      const sizes = highlighter ? HIGHLIGHTER_WIDTHS.map((width) => width / 3) : tools.penWidths.map((width) => (width.min + width.max) / 1.4);
      const current = highlighter ? tools.highlighterWidth : tools.penWidth;
      replaceChildren(widths, sizes.map((size, index) => h('button', {
        type: 'button', class: 'drawing__width', 'aria-label': ['Cienka', 'Średnia', 'Gruba'][index], title: ['Cienka', 'Średnia', 'Gruba'][index],
        'aria-pressed': String(index === current), dataset: { testid: `drawing-width-${index}` },
        onClick: () => {
          if (highlighter) tools.highlighterWidth = index;
          else tools.penWidth = index;
          saveTools(tools);
          updateToolbar();
          refreshSettings?.();
        }
      }, h('span', { style: { width: `${Math.max(3, Math.min(14, size))}px`, height: `${Math.max(3, Math.min(14, size))}px` } }))));
      widths.hidden = !inking;
      eraserModes.hidden = tool !== 'eraser';
      selectGroup.hidden = tool !== 'select';
      for (const button of eraserModes.children) button.setAttribute('aria-checked', String(button.dataset.mode === tools.eraserMode));
      eraserSizes.hidden = tool !== 'eraser' || tools.eraserMode !== 'pixel';
      for (const button of eraserSizes.children) button.setAttribute('aria-checked', String(Number(button.dataset.size) === tools.eraserSize));
      eraserButton.setAttribute('aria-label', `Gumka – ${ERASER_MODE_LABELS[tools.eraserMode].toLowerCase()}`);
      rulerButton.setAttribute('aria-pressed', String(Boolean(ruler)));
      rulerPill.hidden = !ruler;
      if (ruler) rulerPill.textContent = `Linijka ${rulerDegrees(ruler.angle)}°`;
      undoButton.disabled = !history.canUndo;
      redoButton.disabled = !history.canRedo;
      paperButton.textContent = `Tło: ${PAPER_LABELS[drawing.paper].toLowerCase()}`;
      paperButton.setAttribute('aria-label', `Tło strony: ${PAPER_LABELS[drawing.paper].toLowerCase()} – zmień`);
    }

    // ---- ustawienia pióra (drugie dotknięcie aktywnego pióra albo zakreślacza)
    const settings = h('div', { class: 'drawing__settings', hidden: true, role: 'dialog', 'aria-label': 'Ustawienia pióra', dataset: { testid: 'drawing-settings' } });
    /** Odświeża otwarte ustawienia po zmianie (suwaki zostają te same – przeciąganie trwa dalej). */
    let refreshSettings = null;
    function renderSettings() {
      refreshSettings = null;
      if (settings.hidden) return;
      if (tool === 'highlighter') {
        replaceChildren(settings, h('h3', { class: 'drawing__settings-title' }, 'Zakreślacz'),
          h('p', { class: 'field__hint' }, 'Grubość wybierasz kropkami na pasku, kolor – kółkami. Zakreślacz nie zasłania tuszu pod spodem.'));
        return;
      }
      const width = () => tools.penWidths[tools.penWidth];
      const range = (label, min, max, step, testID, onInput) => h('input', {
        type: 'range', class: 'drawing__range', min, max, step, 'aria-label': label, dataset: { testid: testID },
        onInput: (event) => {
          onInput(Number(event.target.value));
          saveTools(tools);
          refresh();
          updateToolbar();
        }
      });
      const minRange = range('Grubość przy lekkim nacisku', WIDTH_RANGE.min, WIDTH_RANGE.max, 0.1, 'drawing-width-min', (value) => {
        width().min = Math.min(value, width().max);
      });
      const maxRange = range('Grubość przy mocnym nacisku', WIDTH_RANGE.min, WIDTH_RANGE.max, 0.1, 'drawing-width-max', (value) => {
        width().max = Math.max(value, width().min);
      });
      const smoothRange = range('Wygładzanie kreski', 0, 1, 0.05, 'drawing-smoothing', (value) => { tools.smoothing = value; });
      const dual = h('div', { class: 'drawing__dual' }, minRange, maxRange);
      const widthText = h('span');
      const smoothText = h('span');
      const sensitivity = Object.entries(SENSITIVITY_LABELS).map(([id, label]) => h('button', {
        type: 'button', role: 'radio', dataset: { value: id, testid: `drawing-sensitivity-${id}` },
        onClick: () => { tools.sensitivity = id; saveTools(tools); refresh(); }
      }, label));
      const canvas = h('canvas', { class: 'drawing__preview', width: 656, height: 144, 'aria-hidden': 'true' });
      function refresh() {
        const current = width();
        minRange.value = String(current.min);
        maxRange.value = String(current.max);
        smoothRange.value = String(tools.smoothing);
        const percent = (value) => `${((value - WIDTH_RANGE.min) / (WIDTH_RANGE.max - WIDTH_RANGE.min)) * 100}%`;
        dual.style.setProperty('--from', percent(current.min));
        dual.style.setProperty('--to', percent(current.max));
        smoothRange.style.setProperty('--fill-to', `${tools.smoothing * 100}%`);
        widthText.textContent = `od ${current.min.toFixed(1)} do ${current.max.toFixed(1)}`;
        smoothText.textContent = tools.smoothing < 0.2 ? 'małe' : tools.smoothing < 0.7 ? 'średnie' : 'duże';
        for (const button of sensitivity) button.setAttribute('aria-checked', String(button.dataset.value === tools.sensitivity));
        const ctx = canvas.getContext('2d');
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.clearRect(0, 0, 328, 72);
        paintStroke(ctx, previewStroke(tools));
      }
      replaceChildren(settings,
        h('h3', { class: 'drawing__settings-title' }, 'Pióro'),
        h('p', { class: 'drawing__settings-label' }, 'Czułość nacisku'),
        h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Czułość nacisku' }, sensitivity),
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Grubość kreski'), widthText),
        dual,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Wygładzanie kreski'), smoothText),
        smoothRange,
        h('p', { class: 'drawing__settings-label' }, 'Podgląd: lekko – mocno – lekko'),
        canvas,
        h('p', { class: 'field__hint' }, 'Palcem i myszą kreska ma stałą grubość (bez nacisku). Ustawienia zostają na tym urządzeniu.'));
      refreshSettings = refresh;
      refresh();
    }
    const topBar = h('div', { class: 'drawing__top' }, toolbar, settings);
    function toggleSettings() {
      settings.hidden = !settings.hidden;
      renderSettings();
    }
    function closeSettings() {
      settings.hidden = true;
      refreshSettings = null;
    }

    function afterHistory() {
      changed = true;
      // Po cofnięciu zaznaczone kreski mogło zastąpić co innego – zaznaczenie znika.
      selection = new Set();
      updateToolbar();
      requestRender();
    }

    // ---- linijka
    function toggleRuler() {
      if (ruler) {
        ruler = null;
      } else {
        // Na środku widocznej części strony, poziomo.
        const center = { x: (view.width / 2 - view.x) / view.scale, y: (view.height / 2 - view.y) / view.scale };
        ruler = { x: Math.min(drawing.width, Math.max(0, center.x)), y: Math.min(drawing.height, Math.max(0, center.y)), angle: 0 };
      }
      updateToolbar();
      requestLive();
    }
    const setRuler = (next) => {
      ruler = { x: next.x, y: next.y, angle: snapRulerAngle(next.angle) };
      rulerPill.textContent = `Linijka ${rulerDegrees(ruler.angle)}°`;
      requestLive();
    };

    // ---- zaznaczenie
    function clearSelection() {
      if (selection.size === 0) return;
      selection = new Set();
      requestLive();
    }
    const selectionHit = (point) => {
      const bounds = selectionBounds([...selection]);
      const pad = SELECTION_PAD / view.scale;
      return Boolean(bounds) && point.x >= bounds.minX - pad && point.x <= bounds.maxX + pad && point.y >= bounds.minY - pad && point.y <= bounds.maxY + pad;
    };
    /** Zastępuje zaznaczone kreski nowymi (przesunięte) albo dokłada kopie – jeden krok cofania. */
    function moveSelection(dx, dy, { copy = false } = {}) {
      const moved = new Set();
      history.begin();
      if (copy) {
        for (const stroke of drawing.strokes.filter((item) => selection.has(item))) {
          const duplicate = translateStroke(stroke, dx, dy);
          drawing.strokes.push(duplicate);
          moved.add(duplicate);
        }
      } else {
        drawing.strokes.forEach((stroke, index) => {
          if (!selection.has(stroke)) return;
          drawing.strokes[index] = translateStroke(stroke, dx, dy);
          moved.add(drawing.strokes[index]);
        });
      }
      if (history.commit()) changed = true;
      selection = moved;
      updateToolbar();
      requestRender();
    }
    const duplicateSelection = () => moveSelection(DUPLICATE_OFFSET, DUPLICATE_OFFSET, { copy: true });
    function deleteSelection() {
      if (selection.size === 0) return;
      history.begin();
      for (let index = drawing.strokes.length - 1; index >= 0; index -= 1) {
        if (selection.has(drawing.strokes[index])) drawing.strokes.splice(index, 1);
      }
      if (history.commit()) changed = true;
      selection = new Set();
      updateToolbar();
      requestRender();
    }
    // ---- pola tekstowe i wzory
    /** Środek widocznej części strony (pod paskiem narzędzi) – tam trafia nowe pole albo wzór. */
    const visibleCenter = () => ({ x: (view.width / 2 - view.x) / view.scale, y: ((view.top + view.height) / 2 - view.y) / view.scale });
    const sizeIndex = (size) => TEXT_SIZES.reduce((best, value, index) => (Math.abs(value - size) < Math.abs(TEXT_SIZES[best] - size) ? index : best), 0);
    const inkID = (hex) => (INK_COLORS.find((color) => color.hex === hex) ?? INK_COLORS.find((color) => color.id === tools.penColor) ?? INK_COLORS[0]).id;

    /** Wielkość i kolor pola tekstowego albo wzoru (w oknie wstawiania i poprawiania). */
    function elementOptions(choice) {
      const swatchButtons = INK_COLORS.map((color) => h('button', {
        type: 'button', class: 'drawing__swatch', style: { '--swatch': color.hex }, 'aria-label': color.label, title: color.label,
        'aria-pressed': String(color.id === choice.color), dataset: { color: color.id, testid: `drawing-element-color-${color.id}` },
        onClick: () => {
          choice.color = color.id;
          for (const button of swatchButtons) button.setAttribute('aria-pressed', String(button.dataset.color === color.id));
        }
      }));
      return h('div', { class: 'drawing__element-options' },
        field('Wielkość', segmented({
          name: `drawing-element-size-${Date.now()}`, label: 'Wielkość', value: String(choice.size),
          options: TEXT_SIZE_LABELS.map((label, index) => ({ value: String(index), label })),
          onChange: (value) => { choice.size = Number(value); }
        })),
        field('Kolor', h('div', { class: 'drawing__element-colors', role: 'group', 'aria-label': 'Kolor' }, swatchButtons)));
    }

    /** Nowe pole tekstowe albo wzór (element = null) albo poprawka istniejącego; pusta treść usuwa element. */
    function editElement(kind, element = null) {
      const choice = { size: element ? sizeIndex(element.size) : tools.textSize, color: element ? inkID(element.color) : tools.penColor };
      const options = elementOptions(choice);
      const apply = (content) => {
        const value = content.slice(0, ELEMENT_TEXT_MAX);
        if (value.trim() === '') {
          if (element) replaceElement(element, null);
          return;
        }
        tools.textSize = choice.size;
        saveTools(tools);
        const next = {
          tool: kind, color: inkHex(choice.color), x: 0, y: 0, size: TEXT_SIZES[choice.size],
          ...(kind === 'text' ? { text: value, maxWidth: element?.maxWidth ?? Math.round(drawing.width * 0.6) } : { source: value })
        };
        Object.assign(next, measureElement(next));
        if (element) {
          next.x = element.x;
          next.y = element.y;
          replaceElement(element, next);
        } else {
          placeElement(next);
          history.add(next);
          changed = true;
        }
        // Nowe albo poprawione pole jest zaznaczone – od razu można je przesunąć.
        setTool('select');
        selection = new Set([next]);
        updateToolbar();
        requestRender();
      };
      if (kind === 'math') {
        openMathHelp({
          raw: true, allowEmpty: Boolean(element), value: element?.source ?? '', extra: options,
          title: element ? 'Wzór na rysunku' : 'Nowy wzór', submitLabel: element ? 'Zapisz' : 'Wstaw',
          intro: 'Zapis jak we wzorze w notatce, bez znaków dolara: x^2, \\frac{a}{b}, \\sqrt{x}. Wzór pojawi się na środku widocznej części strony i będzie zaznaczony – przesuniesz go palcem, rysikiem albo myszą.',
          onInsert: apply
        });
        return;
      }
      let value = element?.text ?? '';
      let pending = null;
      let sheet = null;
      const input = textArea({
        value, rows: 3, testID: 'drawing-text-input',
        onInput: (text) => {
          value = text;
          sheet?.setCanSubmit(Boolean(element) || value.trim() !== '');
        }
      });
      sheet = openFormSheet({
        title: element ? 'Pole tekstowe' : 'Nowe pole tekstowe',
        submitLabel: element ? 'Zapisz' : 'Wstaw',
        build: () => [
          field('Tekst', input, { hint: element ? 'Pusty tekst usuwa pole z rysunku.' : 'Enter zaczyna nowy wiersz, długi wiersz łamie się sam.' }),
          options
        ],
        onSubmit: () => { pending = value; },
        // Wstawienie po zamknięciu okna (dopóki jest otwarte, edytor pod spodem jest zablokowany).
        onClose: () => {
          if (pending !== null) apply(pending);
        }
      });
      sheet.setCanSubmit(Boolean(element) || value.trim() !== '');
      requestAnimationFrame(() => input.focus());
    }

    /**
     * Miejsce nowego pola albo wzoru: na środku widocznej części strony, a gdy tam już coś jest –
     * pod tym (kolejne wstawiane elementy układają się jeden pod drugim, nie na sobie).
     */
    function placeElement(next) {
      const center = visibleCenter();
      const fit = (value, size, room) => Math.round(Math.min(Math.max(0, value), Math.max(0, room - size)));
      next.x = fit(center.x - next.width / 2, next.width, drawing.width);
      const middle = fit(center.y - next.height / 2, next.height, drawing.height);
      const overlapping = (top) => drawing.strokes.filter((item) => isElement(item)
        && next.x < item.x + item.width && item.x < next.x + next.width && top < item.y + item.height && item.y < top + next.height);
      /** Pierwsze wolne miejsce od `start` w dół albo null, gdy do dołu strony go nie ma. */
      const scan = (start) => {
        let y = start;
        for (let guard = 0; guard < 50; guard += 1) {
          const hits = overlapping(y);
          if (hits.length === 0) return y;
          y = Math.round(Math.max(...hits.map((item) => item.y + item.height)) + PAPER_STEP / 4);
          if (y + next.height > drawing.height) return null;
        }
        return null;
      };
      // Pod spodem brak miejsca – od góry widocznej części strony; wszędzie zajęte – na środku.
      next.y = scan(middle) ?? scan(fit((view.top - view.y) / view.scale, next.height, drawing.height)) ?? middle;
    }

    /** Zastępuje pole albo wzór poprawionym (null – usuwa) jednym krokiem cofania. */
    function replaceElement(element, next) {
      const index = drawing.strokes.indexOf(element);
      if (index < 0) return;
      history.begin();
      if (next) drawing.strokes[index] = next;
      else drawing.strokes.splice(index, 1);
      if (history.commit()) changed = true;
      selection = new Set();
      updateToolbar();
      requestRender();
    }

    function selectAll() {
      if (tool !== 'select') setTool('select');
      selection = new Set(drawing.strokes);
      requestLive();
    }

    // ---- wskaźniki: rysowanie, gumka, zaznaczanie, linijka, przesuwanie i powiększanie
    // `active` – jedna czynność jednym wskaźnikiem (kreska, gumka, prostokąt zaznaczania,
    // przesuwanie zaznaczenia, linijka); `touches` i `gesture` – palce przesuwające stronę albo linijkę.
    const touches = new Map();
    let gesture = null;
    const local = (event) => ({ clientX: event.clientX, clientY: event.clientY });

    const usesEraser = (event) => tool === 'eraser' || (event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) === 32));
    const pointWidth = (event) => {
      if (active.stroke.tool === 'highlighter') return HIGHLIGHTER_WIDTHS[tools.highlighterWidth];
      return penWidth(active.pressure ? event.pressure : 0.5, tools.penWidths[tools.penWidth], active.pressure ? tools.sensitivity : 'off');
    };
    /** Punkt kreski: przy linijce – rzut na prostą wzdłuż jej krawędzi. */
    const strokePoint = (event) => {
      const point = toDrawing(event);
      if (!active.edge) return point;
      return rulerPoint(active.edge.ruler, rulerOffset(active.edge.ruler, point.x, point.y).along, active.edge.across);
    };
    function startStroke(event) {
      const highlighter = tool === 'highlighter';
      const stroke = { tool: highlighter ? 'highlighter' : 'pen', color: highlighter ? highlighterHex(tools.highlighterColor) : inkHex(tools.penColor), points: [] };
      active = { kind: 'stroke', id: event.pointerId, touch: event.pointerType === 'touch', stroke, last: null, pressure: event.pointerType === 'pen', edge: null };
      if (ruler) {
        // Kreska zaczęta na linijce albo przy niej biegnie wzdłuż bliższej krawędzi.
        const point = toDrawing(event);
        const { across } = rulerOffset(ruler, point.x, point.y);
        const half = RULER_WIDTH / 2 / view.scale;
        if (Math.abs(across) <= half + RULER_SNAP / view.scale) active.edge = { ruler: { ...ruler }, across: (across < 0 ? -1 : 1) * half };
      }
      extendStroke(event);
    }
    function extendStroke(event) {
      const events = event.getCoalescedEvents?.() ?? [];
      for (const item of events.length > 0 ? events : [event]) {
        const raw = { ...strokePoint(item), w: pointWidth(item) };
        const point = smoothPoint(active.last, raw, active.stroke.tool === 'pen' && !active.edge ? tools.smoothing : 0);
        addPoint(active.stroke, point);
        active.last = point;
      }
      renderLive();
    }
    function startErase(event) {
      const point = toDrawing(event);
      active = { kind: 'erase', id: event.pointerId, touch: event.pointerType === 'touch', mode: tools.eraserMode, last: point };
      history.begin();
      eraseTo(point);
    }
    /** Gumka od ostatniego punktu do bieżącego – gęsto, żeby szybki ruch nie zostawiał przerw. */
    function eraseTo(point) {
      const radius = eraserRadius();
      const from = active.last;
      const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / (radius / 2)));
      let erased = false;
      for (let step = 1; step <= steps; step += 1) {
        const x = from.x + ((point.x - from.x) * step) / steps;
        const y = from.y + ((point.y - from.y) * step) / steps;
        if (active.mode === 'pixel') erased = eraseAt(drawing.strokes, x, y, radius) || erased;
        else erased = history.remove(strokesAt(drawing.strokes, x, y, radius)) || erased;
      }
      active.last = point;
      if (erased) {
        changed = true;
        requestRender();
      } else {
        requestLive();
      }
    }
    function startSelect(event) {
      const point = toDrawing(event);
      if (selectionHit(point)) {
        active = { kind: 'move', id: event.pointerId, touch: event.pointerType === 'touch', start: point, dx: 0, dy: 0, client: local(event) };
        requestRender();
        return;
      }
      selection = new Set();
      active = { kind: 'marquee', id: event.pointerId, touch: event.pointerType === 'touch', rect: { x0: point.x, y0: point.y, x1: point.x, y1: point.y }, client: local(event) };
      requestLive();
    }
    function startRuler(event, kind) {
      const point = toDrawing(event);
      const grab = Math.atan2(point.y - ruler.y, point.x - ruler.x) - ruler.angle;
      active = { kind, id: event.pointerId, touch: event.pointerType === 'touch', start: point, ruler: { ...ruler }, grab };
    }
    function moveActive(event) {
      const point = toDrawing(event);
      switch (active.kind) {
        case 'stroke':
          extendStroke(event);
          break;
        case 'erase':
          eraseTo(point);
          break;
        case 'marquee':
          active.rect.x1 = point.x;
          active.rect.y1 = point.y;
          requestLive();
          break;
        case 'move':
          active.dx = point.x - active.start.x;
          active.dy = point.y - active.start.y;
          requestLive();
          break;
        case 'ruler-move':
          setRuler({ x: active.ruler.x + point.x - active.start.x, y: active.ruler.y + point.y - active.start.y, angle: active.ruler.angle });
          break;
        case 'ruler-rotate':
          setRuler({ ...active.ruler, angle: Math.atan2(point.y - active.ruler.y, point.x - active.ruler.x) - active.grab });
          break;
        default:
          break;
      }
    }
    function finishActive(cancelled = false) {
      if (!active) return;
      const done = active;
      active = null;
      if (done.kind === 'stroke' && !cancelled && done.stroke.points.length >= 3) {
        history.add(done.stroke);
        changed = true;
      } else if (done.kind === 'erase') {
        history.commit();
        // Rysikiem z gumką przy zaznaczaniu: starte kreski wypadają z zaznaczenia.
        if (selection.size > 0) selection = new Set(drawing.strokes.filter((stroke) => selection.has(stroke)));
      } else if (done.kind === 'marquee') {
        const { x0, y0, x1, y1 } = done.rect;
        if (Math.abs(x1 - x0) * view.scale < TAP_SLOP && Math.abs(y1 - y0) * view.scale < TAP_SLOP) {
          // Dotknięcie kreski zaznacza ją (najwyższą w tym miejscu).
          const [top] = strokesAt(drawing.strokes, x0, y0, SELECTION_PAD / view.scale);
          selection = new Set(top === undefined ? [] : [drawing.strokes[top]]);
        } else {
          selection = new Set(strokesInRect(drawing.strokes, done.rect).map((index) => drawing.strokes[index]));
        }
      } else if (done.kind === 'move' && !cancelled) {
        const tap = Math.abs(done.dx) * view.scale < TAP_SLOP && Math.abs(done.dy) * view.scale < TAP_SLOP;
        const [only] = selection;
        if (!tap) moveSelection(done.dx, done.dy);
        // Dotknięcie zaznaczonego pola tekstowego albo wzoru – poprawka.
        else if (selection.size === 1 && isElement(only) && touchesStroke(only, done.start.x, done.start.y, 0)) editElement(only.tool, only);
      }
      // Palce, które zostały na ekranie, przesuwają dalej od miejsca, w którym są teraz.
      if (gesture && touches.size > 0) startGesture(gesture.kind);
      updateToolbar();
      requestRender();
    }

    /** Palce: przesuwanie i powiększanie strony albo przesuwanie i obracanie linijki. */
    function startGesture(kind) {
      const fingers = [...touches.values()];
      const [a, b] = fingers.map((touch) => toDrawing(touch));
      const [sa, sb] = fingers;
      gesture = {
        kind,
        startZoom: view.zoom, startX: view.x, startY: view.y,
        center: sb ? { x: (sa.clientX + sb.clientX) / 2, y: (sa.clientY + sb.clientY) / 2 } : { x: sa.clientX, y: sa.clientY },
        distance: sb ? Math.hypot(sa.clientX - sb.clientX, sa.clientY - sb.clientY) : 0,
        ruler: ruler ? { ...ruler } : null,
        point: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a,
        turn: b ? Math.atan2(b.y - a.y, b.x - a.x) : null
      };
    }
    function moveGesture() {
      const fingers = [...touches.values()];
      if (fingers.length === 0) return;
      if (gesture.kind === 'ruler') {
        const [a, b] = fingers.map((touch) => toDrawing(touch));
        const point = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
        const start = gesture.ruler;
        if (!b || gesture.turn === null) {
          setRuler({ x: start.x + point.x - gesture.point.x, y: start.y + point.y - gesture.point.y, angle: start.angle });
          return;
        }
        // Obrót wokół środka palców: linijka obraca się i przesuwa razem z nimi.
        const angle = snapRulerAngle(start.angle + Math.atan2(b.y - a.y, b.x - a.x) - gesture.turn);
        const turn = angle - start.angle;
        const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
        const [rx, ry] = [start.x - gesture.point.x, start.y - gesture.point.y];
        setRuler({ x: point.x + rx * cos - ry * sin, y: point.y + rx * sin + ry * cos, angle });
        return;
      }
      const [a, b] = fingers;
      const center = b ? { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 } : { x: a.clientX, y: a.clientY };
      view.x = gesture.startX + center.x - gesture.center.x;
      view.y = gesture.startY + center.y - gesture.center.y;
      if (b && gesture.distance > 0) {
        const zoom = gesture.startZoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / gesture.distance;
        // Powiększenie wokół środka palców.
        const box = live.getBoundingClientRect();
        setZoom(zoom, center.x - box.left, center.y - box.top);
        return;
      }
      clampView();
      requestRender();
    }

    live.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      closeSettings();
      if (event.pointerType === 'pen' && !penSeen) {
        penSeen = true;
        penPill.hidden = false;
        rememberPen();
      }
      const point = toDrawing(event);
      if (event.pointerType === 'touch') {
        // Kolejny palec dołącza do trwającego gestu.
        if (gesture) {
          touches.set(event.pointerId, local(event));
          startGesture(gesture.kind);
          return;
        }
        // Dłoń oparta o ekran w trakcie kreski rysikiem albo myszą – gest bez skutku do końca kreski.
        if (active && !active.touch) {
          touches.set(event.pointerId, local(event));
          startGesture('page');
          return;
        }
        // Drugi palec przy czynności palcem: przy linijce – obrót linijki, inaczej powiększanie
        // (zaczęta kreska palcem przepada).
        if (active?.touch) {
          const first = active;
          const kind = first.kind === 'ruler-move' ? 'ruler' : 'page';
          finishActive(true);
          if (first.client) touches.set(first.id, first.client);
          touches.set(event.pointerId, local(event));
          startGesture(kind);
          return;
        }
        const hit = rulerHit(point);
        if (hit === 'body') {
          touches.set(event.pointerId, local(event));
          startGesture('ruler');
          return;
        }
        if (!hit && penSeen && !(tool === 'select' && selectionHit(point))) {
          touches.set(event.pointerId, local(event));
          startGesture('page');
          return;
        }
      } else if (event.pointerType === 'pen' && active?.touch) {
        // Rysik odbiera palcowi czynność.
        finishActive(true);
      }
      if (active) return;
      try {
        live.setPointerCapture(event.pointerId);
      } catch {
        // przechwycenie nie jest konieczne
      }
      const hit = rulerHit(point);
      if (hit === 'handle') startRuler(event, 'ruler-rotate');
      else if (hit === 'body' && event.pointerType !== 'pen') startRuler(event, 'ruler-move');
      else if (usesEraser(event)) startErase(event);
      else if (tool === 'select') startSelect(event);
      else startStroke(event);
      if (active?.touch) active.client = local(event);
    });
    live.addEventListener('pointermove', (event) => {
      if (touches.has(event.pointerId)) {
        touches.set(event.pointerId, local(event));
        // Dłoń oparta o ekran w trakcie pisania rysikiem nie przesuwa strony.
        if (gesture && !(active && !active.touch)) moveGesture();
        return;
      }
      if (!active || active.id !== event.pointerId) {
        // Kółko gumki pod myszą albo zawieszonym nad ekranem rysikiem.
        if (tool === 'eraser' && event.pointerType !== 'touch' && !active) {
          hover = toDrawing(event);
          requestLive();
        }
        return;
      }
      event.preventDefault();
      if (active.touch) active.client = local(event);
      moveActive(event);
    });
    const release = (event, cancelled) => {
      if (touches.delete(event.pointerId)) {
        if (gesture) {
          if (touches.size === 0) gesture = null;
          else startGesture(gesture.kind);
          updateToolbar();
        }
        return;
      }
      if (active && active.id === event.pointerId) finishActive(cancelled);
    };
    live.addEventListener('pointerup', (event) => release(event, false));
    live.addEventListener('pointercancel', (event) => release(event, true));
    live.addEventListener('pointerleave', () => {
      if (!hover) return;
      hover = null;
      requestLive();
    });
    live.addEventListener('wheel', (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const box = live.getBoundingClientRect();
        setZoom(view.zoom * Math.exp(-event.deltaY / 300), event.clientX - box.left, event.clientY - box.top);
        return;
      }
      view.x -= event.deltaX;
      view.y -= event.deltaY;
      clampView();
      requestRender();
    }, { passive: false });

    // ---- okno
    let saving = false;
    const close = async (save) => {
      if (saving) return;
      if (save && changed) {
        saving = true;
        doneButton.disabled = true;
        try {
          // Zdjęcie pod kreskami musi być wczytane, zanim powstanie obraz rysunku.
          await pictureReady;
          result = { drawing, image: await renderDrawingImage(drawing, picture) };
        } catch (error) {
          saving = false;
          doneButton.disabled = false;
          showError(error);
          return;
        }
      } else if (!save && changed && !(await confirmDialog({
        title: 'Odrzucić zmiany w rysunku?', message: 'Kreski narysowane od otwarcia edytora przepadną.',
        confirmLabel: 'Odrzuć', cancelLabel: 'Rysuj dalej', destructive: true
      }))) {
        return;
      }
      dialog.close(save ? 'done' : 'cancel');
    };
    const cancelButton = h('button', { type: 'button', class: 'button button--plain', dataset: { testid: 'drawing-cancel' }, onClick: () => close(false) }, 'Anuluj');
    const doneButton = h('button', { type: 'button', class: 'button button--plain sheet__submit', dataset: { testid: 'drawing-done' }, onClick: () => close(true) }, 'Gotowe');
    const panel = h('div', { class: 'sheet__panel drawing', 'aria-label': `Rysunek: ${title}` },
      h('header', { class: 'sheet__header' }, cancelButton, h('h2', { class: 'sheet__title' }, title), doneButton),
      h('div', { class: 'drawing__body' }, stage, topBar, status));

    // Skróty działają w całym oknie – także gdy fokus zniknął (np. „Ponów” stał się nieaktywny),
    // ale nie w oknie pytania nad edytorem.
    const onKey = (event) => {
      if (event.target !== document.body && !dialog.contains(event.target)) return;
      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      if (command && key === 'z') {
        event.preventDefault();
        if (event.shiftKey ? history.redo() : history.undo()) afterHistory();
      } else if (command && key === 'y') {
        event.preventDefault();
        if (history.redo()) afterHistory();
      } else if (command && key === 'a') {
        event.preventDefault();
        selectAll();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selection.size > 0) {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === 'Escape' && selection.size > 0) {
        // Esc najpierw zdejmuje zaznaczenie, dopiero następny zamyka edytor.
        event.preventDefault();
        clearSelection();
      }
    };

    dialog = mountDialog('drawing-dialog', panel, {
      onDismiss: () => close(false),
      onClose: () => {
        document.removeEventListener('keydown', onKey, true);
        observer.disconnect();
        window.cancelAnimationFrame(frame);
        window.cancelAnimationFrame(liveFrame);
        resolve(result);
      }
    });
    dialog.dataset.testid = 'drawing-dialog';
    // Faza przechwytywania: Esc przy zaznaczeniu nie dociera do okna (nie zamyka edytora).
    document.addEventListener('keydown', onKey, true);
    updateToolbar();
    observer.observe(stage);
    const pictureReady = loadPicture(drawing.photo).then((loaded) => {
      picture = loaded;
      requestRender();
    });
  });
}
