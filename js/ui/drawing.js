// Edytor rysunku (od 1.12): okno na cały ekran z płótnem, pióro z naciskiem rysika, zakreślacz,
// gumka całych kresek, kolory, grubości, cofnij i ponów, tło gładkie / w linie / w kratkę,
// rysowanie na zdjęciu, powiększanie i przesuwanie.
//
// Rysik i palec: gdy aplikacja raz zobaczy rysik (pointerType 'pen'), rysuje tylko rysik, a palec
// przesuwa stronę (dłoń oparta o ekran nie zostawia śladów); bez rysika (iPhone) rysuje palec.
// Dwa palce zawsze powiększają i przesuwają. Myszą rysuje się jak piórem; kółko przewija,
// Ctrl + kółko powiększa. Gumka na końcu pióra (Windows) ściera bez zmiany narzędzia.
//
// Rysowanie: dwie warstwy płótna – zapisane kreski (rysowane od nowa po zmianie widoku albo
// cofnięciu) i bieżąca kreska nad nimi. Wynik to obraz notatki: PNG strony (JPEG, gdy pod spodem
// jest zdjęcie) i kreski do późniejszej edycji (core/drawing.js).

import {
  DrawingHistory, HIGHLIGHTER_ALPHA, HIGHLIGHTER_COLORS, HIGHLIGHTER_WIDTHS, INK_COLORS, PAPERS, PAPER_LABELS, PAPER_STEP,
  SENSITIVITY_LABELS, addPoint, cleanToolSettings, defaultToolSettings, emptyDrawing, penWidth, smoothPoint, strokesAt
} from '../core/drawing.js';
import { confirmDialog, mountDialog, showError } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';

const TOOLS_KEY = 'lexicards-drawing-tools';
const PEN_KEY = 'lexicards-pen-seen';
/** Zakres powiększenia względem „cała strona na ekranie”. */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
/** Promień gumki na ekranie (px). */
const ERASER_RADIUS = 14;
/** Margines wokół strony na ekranie (px). */
const STAGE_MARGIN = 14;
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

/**
 * Kreska: pióro – odcinki między środkami kolejnych punktów (krzywe), każdy z grubością swojego
 * punktu; zakreślacz – jedna ścieżka o stałej grubości, półprzezroczysta i mnożona z tłem.
 */
export function paintStroke(ctx, stroke) {
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

/** Cała strona: tło (albo zdjęcie) i kreski. */
export function paintDrawing(ctx, drawing, picture = null) {
  paintPaper(ctx, drawing);
  if (picture) ctx.drawImage(picture, 0, 0, drawing.width, drawing.height);
  for (const stroke of drawing.strokes) paintStroke(ctx, stroke);
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
    const drawing = source
      ? { ...source, strokes: source.strokes.map((stroke) => ({ ...stroke, points: [...stroke.points] })) }
      : emptyDrawing({ photo });
    const history = new DrawingHistory(drawing.strokes);
    const tools = loadTools();
    let tool = 'pen';
    let picture = null;
    let penSeen = penSeenBefore();
    let changed = false;
    let dialog;
    let result = null;

    // Widok: skala (px ekranu na jednostkę rysunku) i przesunięcie strony; zoom – względem „cała strona”.
    const view = { zoom: 1, scale: 1, x: 0, y: 0, width: 0, height: 0, dpr: 1 };
    const stage = h('div', { class: 'drawing__stage', dataset: { testid: 'drawing-stage' } });
    const base = h('canvas', { class: 'drawing__canvas', 'aria-hidden': 'true' });
    const live = h('canvas', { class: 'drawing__canvas drawing__canvas--live', role: 'img', 'aria-label': `Płótno rysunku: ${title}`, dataset: { testid: 'drawing-canvas' } });
    stage.append(base, live);

    const fitScale = () => Math.min((view.width - STAGE_MARGIN * 2) / drawing.width, (view.height - STAGE_MARGIN * 2) / drawing.height);
    /** Strona mniejsza niż ekran – na środku; większa – nie ucieka poza krawędź. */
    const clampView = () => {
      const pageWidth = drawing.width * view.scale;
      const pageHeight = drawing.height * view.scale;
      view.x = pageWidth <= view.width - STAGE_MARGIN * 2 ? (view.width - pageWidth) / 2
        : Math.min(STAGE_MARGIN, Math.max(view.width - STAGE_MARGIN - pageWidth, view.x));
      view.y = pageHeight <= view.height - STAGE_MARGIN * 2 ? (view.height - pageHeight) / 2
        : Math.min(STAGE_MARGIN, Math.max(view.height - STAGE_MARGIN - pageHeight, view.y));
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
    const toDrawing = (event) => {
      const box = live.getBoundingClientRect();
      return { x: (event.clientX - box.left - view.x) / view.scale, y: (event.clientY - box.top - view.y) / view.scale };
    };

    const prepare = (ctx) => {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.clearRect(0, 0, view.width, view.height);
      ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.x, view.dpr * view.y);
    };
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
      ctx.beginPath();
      ctx.rect(0, 0, drawing.width, drawing.height);
      ctx.clip();
      paintDrawing(ctx, drawing, picture);
      ctx.restore();
    };
    let active = null;
    const renderLive = () => {
      const ctx = live.getContext('2d');
      prepare(ctx);
      if (active?.stroke) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, drawing.width, drawing.height);
        ctx.clip();
        paintStroke(ctx, active.stroke);
        ctx.restore();
      }
    };
    let frame = 0;
    function requestRender() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderBase();
        renderLive();
      });
    }
    const resize = () => {
      const box = stage.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const keepFit = view.width === 0;
      view.width = box.width;
      view.height = box.height;
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
        if (tool === id && id !== 'eraser') {
          toggleSettings();
          return;
        }
        tool = id;
        closeSettings();
        updateToolbar();
      }
    }, icon(iconName, { size: 24 }));
    const penButton = toolButton('pen', 'Pióro', 'pen');
    const highlighterButton = toolButton('highlighter', 'Zakreślacz', 'highlighter');
    const eraserButton = toolButton('eraser', 'Gumka – ściera całe kreski', 'eraser');
    const swatches = h('div', { class: 'drawing__group drawing__swatches', role: 'group', 'aria-label': 'Kolor' });
    const widths = h('div', { class: 'drawing__group drawing__widths', role: 'group', 'aria-label': 'Grubość' });
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
      h('div', { class: 'drawing__group' }, penButton, highlighterButton, eraserButton),
      swatches, widths,
      h('div', { class: 'drawing__group' }, undoButton, redoButton, paperButton));

    const zoomButton = h('button', {
      type: 'button', class: 'drawing__pill', title: 'Cała strona', dataset: { testid: 'drawing-zoom' },
      onClick: () => { view.zoom = 1; view.width = 0; resize(); zoomButton.textContent = '100%'; }
    }, '100%');
    const penPill = h('span', { class: 'drawing__pill drawing__pill--info', hidden: !penSeen, dataset: { testid: 'drawing-pen-only' } },
      icon('pen', { size: 14 }), 'Rysuje tylko rysik · palec przesuwa');
    const status = h('div', { class: 'drawing__status' }, penPill, zoomButton);

    function updateToolbar() {
      for (const button of [penButton, highlighterButton, eraserButton]) {
        button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
      }
      const highlighter = tool === 'highlighter';
      const palette = highlighter ? HIGHLIGHTER_COLORS : INK_COLORS;
      const chosen = highlighter ? tools.highlighterColor : tools.penColor;
      replaceChildren(swatches, palette.map((color) => h('button', {
        type: 'button', class: 'drawing__swatch', style: { '--swatch': color.hex }, 'aria-label': color.label, title: color.label,
        'aria-pressed': String(color.id === chosen), dataset: { testid: `drawing-color-${color.id}` },
        onClick: () => {
          if (highlighter) tools.highlighterColor = color.id;
          else {
            tools.penColor = color.id;
            if (tool === 'eraser') tool = 'pen';
          }
          saveTools(tools);
          updateToolbar();
        }
      })));
      swatches.hidden = tool === 'eraser';
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
      widths.hidden = tool === 'eraser';
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
      updateToolbar();
      requestRender();
    }

    // ---- wskaźniki: rysowanie, gumka, przesuwanie i powiększanie
    const pointers = new Map();
    let gesture = null;

    const usesEraser = (event) => tool === 'eraser' || (event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) === 32));
    const startStroke = (event) => {
      const point = toDrawing(event);
      if (usesEraser(event)) {
        active = { id: event.pointerId, erase: true };
        erase(point);
        return;
      }
      const highlighter = tool === 'highlighter';
      const stroke = { tool: highlighter ? 'highlighter' : 'pen', color: highlighter ? highlighterHex(tools.highlighterColor) : inkHex(tools.penColor), points: [] };
      active = { id: event.pointerId, stroke, last: null, pressure: event.pointerType === 'pen' };
      extendStroke(event);
    };
    const pointWidth = (event) => {
      if (active.stroke.tool === 'highlighter') return HIGHLIGHTER_WIDTHS[tools.highlighterWidth];
      return penWidth(active.pressure ? event.pressure : 0.5, tools.penWidths[tools.penWidth], active.pressure ? tools.sensitivity : 'off');
    };
    function extendStroke(event) {
      const events = event.getCoalescedEvents?.() ?? [];
      for (const item of events.length > 0 ? events : [event]) {
        const raw = { ...toDrawing(item), w: pointWidth(item) };
        const point = smoothPoint(active.last, raw, active.stroke.tool === 'pen' ? tools.smoothing : 0);
        addPoint(active.stroke, point);
        active.last = point;
      }
      renderLive();
    }
    function erase(point) {
      const hits = strokesAt(drawing.strokes, point.x, point.y, ERASER_RADIUS / view.scale);
      if (hits.length > 0 && history.remove(hits)) afterHistory();
    }
    const finishStroke = (cancelled = false) => {
      if (!active) return;
      if (active.erase) history.closeStep();
      else if (!cancelled && active.stroke.points.length >= 3) {
        history.add(active.stroke);
        changed = true;
      }
      active = null;
      // Palce, które zostały na ekranie, przesuwają dalej od miejsca, w którym są teraz.
      if (gesture && pointers.size > 0) startGesture();
      updateToolbar();
      requestRender();
    };

    const startGesture = () => {
      const touches = [...pointers.values()];
      const [a, b] = touches;
      gesture = {
        startZoom: view.zoom, startX: view.x, startY: view.y,
        center: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: a.x, y: a.y },
        distance: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
      };
    };
    const moveGesture = () => {
      const touches = [...pointers.values()];
      const [a, b] = touches;
      if (!a) return;
      const center = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: a.x, y: a.y };
      view.x = gesture.startX + center.x - gesture.center.x;
      view.y = gesture.startY + center.y - gesture.center.y;
      if (b && gesture.distance > 0) {
        const zoom = gesture.startZoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance;
        // Powiększenie wokół środka palców.
        const box = live.getBoundingClientRect();
        setZoom(zoom, center.x - box.left, center.y - box.top);
        return;
      }
      clampView();
      requestRender();
    };
    const local = (event) => ({ x: event.clientX, y: event.clientY });

    live.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      closeSettings();
      if (event.pointerType === 'pen' && !penSeen) {
        penSeen = true;
        penPill.hidden = false;
        rememberPen();
      }
      if (event.pointerType === 'touch') {
        pointers.set(event.pointerId, local(event));
        // Rysik w użyciu – palec przesuwa; drugi palec – zawsze powiększanie (zaczęta kreska palcem przepada).
        if (penSeen || pointers.size > 1) {
          if (active && !active.erase && pointers.has(active.id)) finishStroke(true);
          startGesture();
          return;
        }
      } else if (event.pointerType === 'pen' && active && pointers.has(active.id)) {
        // Rysik odbiera palcowi kreskę.
        finishStroke(true);
        pointers.clear();
        gesture = null;
      }
      if (active) return;
      try {
        live.setPointerCapture(event.pointerId);
      } catch {
        // przechwycenie nie jest konieczne
      }
      startStroke(event);
    });
    live.addEventListener('pointermove', (event) => {
      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, local(event));
        if (gesture) {
          // Dłoń oparta o ekran w trakcie pisania rysikiem nie przesuwa strony.
          if (!active) moveGesture();
          return;
        }
      }
      if (!active || active.id !== event.pointerId) return;
      event.preventDefault();
      if (active.erase) {
        erase(toDrawing(event));
        return;
      }
      extendStroke(event);
    });
    const release = (event, cancelled) => {
      if (pointers.delete(event.pointerId)) {
        if (gesture) {
          if (pointers.size === 0) gesture = null;
          else startGesture();
          return;
        }
      }
      if (active && active.id === event.pointerId) finishStroke(cancelled);
    };
    live.addEventListener('pointerup', (event) => release(event, false));
    live.addEventListener('pointercancel', (event) => release(event, true));
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
      h('div', { class: 'drawing__body' }, h('div', { class: 'drawing__top' }, toolbar, settings), stage, status));

    // Skróty działają w całym oknie – także gdy fokus zniknął (np. „Ponów” stał się nieaktywny),
    // ale nie w oknie pytania nad edytorem.
    const onKey = (event) => {
      if (event.target !== document.body && !dialog.contains(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey ? history.redo() : history.undo()) afterHistory();
      } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        if (history.redo()) afterHistory();
      }
    };

    dialog = mountDialog('drawing-dialog', panel, {
      onDismiss: () => close(false),
      onClose: () => {
        document.removeEventListener('keydown', onKey);
        observer.disconnect();
        window.cancelAnimationFrame(frame);
        resolve(result);
      }
    });
    dialog.dataset.testid = 'drawing-dialog';
    document.addEventListener('keydown', onKey);
    updateToolbar();
    observer.observe(stage);
    const pictureReady = loadPicture(drawing.photo).then((loaded) => {
      picture = loaded;
      requestRender();
    });
  });
}
