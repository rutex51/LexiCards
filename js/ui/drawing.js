// Edytor rysunku (od 1.12): okno na cały ekran z płótnem, pióro z naciskiem rysika, zakreślacz,
// gumka całych kresek albo fragmentów (od 1.12.1), kolory, grubości, cofnij i ponów, tło gładkie /
// w linie / w kratkę, rysowanie na zdjęciu, powiększanie i przesuwanie. Od 1.12.1 także
// zaznaczanie prostokątem (przesuwanie, powielanie, usuwanie) i linijka z kątem, od 1.13 – pola
// tekstowe i wzory (zapis jak w notatce, składany na płótnie przez core/math-layout.js). Od 1.14:
// skala rysunku i liczby na linijce, zero linijki przyciągane do przecięć i linii (prostopadle),
// własne kolory (siatka, suwaki RGB, pipetka), zaznaczanie fragmentów prostokątem i lassem
// (kierunek obrysu decyduje: całe kreski albo tylko wnętrze), kopiuj i wklej (też między rysunkami).
// Od 1.15: jasność linii i kratki, szablon pod kreskami (boisko albo obraz z pliku, ustawiany na
// stronie i potem nieruchomy), liniuszek – równoległe linie (i poprzeczne), do których przyciąga
// się kreska – oraz kształty geometryczne z punktami konstrukcyjnymi. Od 1.17: wycinek (prawy
// przycisk albo tryb „Wycinek” – obraz wszystkiego w obszarze, z tłem), „Osadź” – zaznaczenie albo
// wycinek jako obraz notatki, wymiary kształtu wpisywane w polach na jego ramce, wypełnienie
// kształtu i tekst na kształcie (przesuwa się i obraca razem z nim).
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
  HIGHLIGHTER_COLORS, HIGHLIGHTER_WIDTHS, INK_COLORS, PAPERS, PAPER_LABELS, PAPER_STEP, SCALE_UNITS, SELECT_MODES, SELECT_MODE_LABELS,
  SELECT_SHAPES, SENSITIVITY_LABELS, TEXT_SIZES, TEXT_SIZE_LABELS, addPoint, cleanDrawing, cleanScale, cleanToolSettings,
  defaultToolSettings, emptyDrawing, eraseAt, formatLength, formatNumber, formatRatio, fromScaleLength, hexToRgb, hslToHex, isClockwise,
  isElement, isHexColor, lineAngleDifference, parseDecimal, penWidth, perpendicularAngle, rectPolygon, rememberColor, rgbToHex,
  rulerDegrees, rulerOffset, rulerPoint, scaleUnitLabel, screenScale, screenScaleValue, selectionBounds, smoothPoint, snapRulerAngle,
  snapToStrokes, splitByPolygon, strokeBounds, strokesAt, strokesInPolygon, strokesInRect, toScaleLength, touchesStroke, translateStroke
} from '../core/drawing.js';
import { layoutMath } from '../core/math-layout.js';
import {
  LABEL_TEXT_MAX, SHAPES, SHAPE_FILLS, SHAPE_FILL_LABELS, SHAPE_LABELS, SKEW_DEGREES_LIMIT, canFill, guideLinesIn, isSegment, isShape,
  labelFrame, labelMaxWidth, moveShapeHandle, nearestGuideLine, resizeShape, segmentDegrees, setSegment, shapeContains, shapeFromDrag,
  shapeHandles, shapePoint, skewDegrees, touchesShape
} from '../core/shapes.js';
import {
  DEFAULT_PAPER_LEVEL, DEFAULT_TEMPLATE_LEVEL, LEVEL_LABELS, PAPER_COLORS, TEMPLATE_ALPHA, TEMPLATE_LABELS, centerTemplate,
  fitTemplate, pitchScale, scaleTemplate
} from '../core/templates.js';
import { plural } from '../core/text.js';
import { field, segmented, textArea, toggle } from './components.js';
import { confirmDialog, mountDialog, openFormSheet, openMenu, showError } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { openMathHelp } from './math.js';
import { paintShape, paintTemplate } from './drawing-paint.js';
import { prepareImage } from './images.js';

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
/** Od 1.14: jak blisko zero linijki przyskakuje do przecięcia albo linii (px ekranu) i do kąta prostego. */
const ZERO_SNAP = 20;
const PERPENDICULAR_SNAP = (8 * Math.PI) / 180;
const ZERO_COLOR = '#0058be';
/** Lasso: najmniejszy odstęp kolejnych punktów obrysu (px ekranu). */
const LASSO_STEP = 4;
/** Zaznaczanie: całe kreski – niebieskie, fragmenty (tylko wnętrze obszaru) – zielone, kreskowane; wycinek (od 1.17) – fioletowy. */
const SELECT_COLORS = { whole: '#0058be', region: '#1d8a3a', snip: '#8944ab' };
const SELECT_FILLS = { whole: 'rgba(0, 88, 190, 0.07)', region: 'rgba(29, 138, 58, 0.09)', snip: 'rgba(137, 68, 171, 0.08)' };
const OUTLINE_LABELS = { rect: 'Prostokąt', lasso: 'Lasso' };
const SELECT_MODE_TITLES = {
  auto: 'Według kierunku: prostokąt od lewej i lasso przeciwnie do wskazówek zegara – całe kreski; od prawej i zgodnie ze wskazówkami – fragmenty',
  whole: 'Zawsze całe kreski (leżące w całości w środku)',
  region: 'Zawsze fragmenty – tylko to, co w środku obszaru',
  snip: 'Wycinek – obraz wszystkiego w obszarze: tło, kratka, szablon i części kresek (do skopiowania albo osadzenia w notatce)'
};
const SELECT_HINTS = {
  rect: 'Od lewej do prawej – całe kreski, od prawej do lewej – fragmenty',
  lasso: 'Przeciwnie do wskazówek zegara – całe kreski, zgodnie – fragmenty',
  whole: 'Zaznaczasz całe kreski (w całości w środku)',
  region: 'Zaznaczasz fragmenty – tylko to, co w środku',
  snip: 'Wycinek – wszystko w obszarze, z tłem i kratką'
};
/** Schowek rysunku (od 1.14) – też między rysunkami i po ponownym otwarciu aplikacji (na tym urządzeniu). */
const CLIPBOARD_KEY = 'lexicards-drawing-clipboard';
const CLIPBOARD_LIMIT = 1500000;
/** Liniuszek (od 1.15): jak blisko linii musi się zacząć kreska (px ekranu), jak zgodny kierunek (radiany), kółko do przesuwania. */
const GUIDE_SNAP = 12;
const GUIDE_ANGLE = (20 * Math.PI) / 180;
const GUIDE_DECIDE = 10;
const GUIDE_KNOB = 11;
const GUIDE_COLOR = 'rgba(0, 88, 190, 0.42)';
const SHAPE_ICONS = {
  line: 'shapeLine', arrow: 'shapeArrow', rect: 'shapeRect', ellipse: 'shapeEllipse', triangle: 'shapeTriangle', diamond: 'shapeDiamond', trapezoid: 'shapeTrapezoid'
};
/** Kształty: uchwyty (px ekranu) – promień trafienia, odległość uchwytu obrotu od kształtu. */
const HANDLE_HIT = 18;
const ROTATE_GAP = 30;
/** Pola wymiarów kształtu (od 1.17): odstęp pola od linii ramki (px ekranu). */
const DIM_GAP = 16;
/** Obraz wycinka i osadzanego zaznaczenia (od 1.17): dwa piksele na jednostkę strony, najdłuższy bok jak obrazy notatki. */
const EXPORT_SCALE = 2;
const EXPORT_MAX = 2048;
const EXPORT_PAD = 16;

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

// Kolor narzędzia: nazwa koloru z palety albo (od 1.14) własny kolor #rrggbb.
const inkHex = (id) => (isHexColor(id) ? id : (INK_COLORS.find((color) => color.id === id) ?? INK_COLORS[0]).hex);
const highlighterHex = (id) => (isHexColor(id) ? id : (HIGHLIGHTER_COLORS.find((color) => color.id === id) ?? HIGHLIGHTER_COLORS[0]).hex);

/** Obraz (zdjęcie pod kreskami albo szablon z pliku) z bajtów – do rysowania na płótnie. */
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

/** Tło strony: białe, w linie albo w kratkę (w jednostkach rysunku); jasność linii – od 1.15. */
export function paintPaper(ctx, drawing) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, drawing.width, drawing.height);
  if (drawing.paper === 'plain' || drawing.photo) return;
  ctx.save();
  ctx.strokeStyle = PAPER_COLORS[drawing.paper][drawing.paperLevel ?? DEFAULT_PAPER_LEVEL];
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

/** Kształt z tekstem zmierzonym na tym urządzeniu (od 1.17; wiersze łamią się do szerokości kształtu). */
function measureLabel(shape) {
  if (!shape?.label) return shape;
  const { label } = shape;
  const font = `${label.size}px ${TEXT_FONT}`;
  const lines = textLines(label.text, label.size, labelMaxWidth(shape, label.size));
  const width = Math.max(label.size * 0.5, ...lines.map((line) => measureText(line, font)));
  return { ...shape, label: { ...label, width: Math.ceil(width) + 2, height: Math.ceil(lines.length * label.size * TEXT_LINE) } };
}

/** Tekst na kształcie: wiersze wyśrodkowane, obrócone razem z kształtem (nigdy do góry nogami). */
function paintLabel(ctx, shape) {
  const { label } = shape;
  const frame = labelFrame(shape);
  const lines = textLines(label.text, label.size, labelMaxWidth(shape, label.size));
  ctx.save();
  ctx.translate(frame.x, frame.y);
  ctx.rotate(frame.angle);
  ctx.fillStyle = label.color;
  ctx.font = `${label.size}px ${TEXT_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const top = -(lines.length * label.size * TEXT_LINE) / 2;
  lines.forEach((line, index) => ctx.fillText(line, 0, top + label.size * (0.95 + index * TEXT_LINE)));
  ctx.restore();
}

/**
 * Kreska: pióro – odcinki między środkami kolejnych punktów (krzywe), każdy z grubością swojego
 * punktu; zakreślacz – jedna ścieżka o stałej grubości, półprzezroczysta i mnożona z tłem.
 * Pole tekstowe i wzór (od 1.13) – napis i wzór od lewego górnego rogu; kształt – z wypełnieniem
 * i tekstem (od 1.17).
 */
export function paintStroke(ctx, stroke) {
  if (isShape(stroke)) {
    paintShape(ctx, stroke);
    if (stroke.label) paintLabel(ctx, stroke);
    return;
  }
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

/**
 * Cała strona: tło (albo zdjęcie), szablon i kreski; media – wczytane obrazy { photo, template };
 * `skip` – kreski pominięte (przesuwane zaznaczenie, poprawiany kształt).
 */
export function paintDrawing(ctx, drawing, media = {}, skip = null) {
  paintPaper(ctx, drawing);
  if (media.photo) ctx.drawImage(media.photo, 0, 0, drawing.width, drawing.height);
  paintTemplate(ctx, drawing.template, media.template);
  for (const stroke of drawing.strokes) {
    if (!skip?.has(stroke)) paintStroke(ctx, stroke);
  }
}

/** Obraz rysunku do notatki: PNG strony albo JPEG, gdy pod kreskami jest zdjęcie. */
export async function renderDrawingImage(drawing, media = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = drawing.width;
  canvas.height = drawing.height;
  const ctx = canvas.getContext('2d');
  paintDrawing(ctx, drawing, media);
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
 * Ile pikseli CSS ma cal na tym ekranie (od 1.14 – szacunek skali). Przeglądarka nie podaje
 * fizycznej wielkości ekranu, więc liczba wynika z rodzaju urządzenia: iPhone, iPad (mini),
 * Mac, telefon i tablet z Androidem, inny komputer (Windows: zwykle 96, z powiększeniem ekranu – więcej).
 */
function screenPixelsPerInch() {
  const agent = navigator.userAgent;
  const ratio = window.devicePixelRatio || 1;
  const shorter = Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0);
  if (/iPhone|iPod/.test(agent)) return ratio >= 3 ? 153 : 163;
  // iPad z iPadOS przedstawia się jak Mac – odróżnia go ekran dotykowy.
  if (/iPad/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return shorter > 0 && shorter <= 744 ? 163 : 132;
  if (/Android/.test(agent)) return /Mobile/.test(agent) ? 160 : 135;
  if (/Macintosh/.test(agent)) return 127;
  return ratio > 1 ? 110 : 96;
}

/** Siatka kolorów (od 1.14): 12 odcieni w sześciu jasnościach i wiersz szarości od bieli do czerni. */
const COLOR_GRID = (() => {
  const hues = [0, 22, 40, 55, 85, 135, 170, 195, 215, 250, 280, 320];
  const rows = [[90, 86], [85, 72], [80, 58], [78, 46], [72, 35], [65, 24]];
  const colors = rows.flatMap(([saturation, lightness]) => hues.map((hue) => hslToHex(hue, saturation, lightness)));
  for (let step = 0; step < 12; step += 1) colors.push(hslToHex(0, 0, 100 - (step * 100) / 11));
  return colors;
})();
const COLOR_TABS = [['grid', 'Siatka'], ['sliders', 'Suwaki'], ['picker', 'Pipetka']];
const CHANNEL_LABELS = ['Czerwony', 'Zielony', 'Niebieski'];

/** Kolor #rrggbb z wpisanego kodu („#12ab34”, „12AB34”, „#1a3”) albo null. */
function parseHex(text) {
  const value = `#${text.trim().replace(/^#/, '').toLowerCase()}`;
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${[...value.slice(1)].map((digit) => digit + digit).join('')}`;
  return isHexColor(value) ? value : null;
}

// ---- schowek rysunku (od 1.14): kreski, pola tekstowe i wzory – w pamięci i na urządzeniu

let clipboard = null;

function readClipboard() {
  if (clipboard) return clipboard;
  try {
    const raw = JSON.parse(localStorage.getItem(CLIPBOARD_KEY) ?? 'null');
    // Sprawdzone jak rysunek (zapis mógł pochodzić ze starszej wersji albo być uszkodzony).
    const clean = raw && cleanDrawing({ width: 8192, height: 8192, strokes: raw.strokes });
    if (clean?.strokes.length > 0) clipboard = { strokes: clean.strokes };
  } catch {
    // Pamięć urządzenia niedostępna – schowek tylko w tym oknie.
  }
  return clipboard;
}

function writeClipboard(strokes) {
  clipboard = { strokes };
  try {
    const text = JSON.stringify(clipboard);
    if (text.length <= CLIPBOARD_LIMIT) localStorage.setItem(CLIPBOARD_KEY, text);
    else localStorage.removeItem(CLIPBOARD_KEY);
  } catch {
    // jak wyżej
  }
}

/**
 * Płótno obszaru strony (od 1.17): `area` – { minX, minY, maxX, maxY } w jednostkach strony,
 * dwa piksele na jednostkę (najdłuższy bok najwyżej jak obraz notatki); paint(ctx) rysuje w jednostkach strony.
 */
function areaCanvas(area, paint) {
  const width = Math.max(1, area.maxX - area.minX);
  const height = Math.max(1, area.maxY - area.minY);
  const scale = Math.min(EXPORT_SCALE, EXPORT_MAX / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, -area.minX * scale, -area.minY * scale);
  paint(ctx);
  return canvas;
}

/** Zaznaczone kreski i elementy na białym tle z marginesem (Kopiuj – obraz w schowku systemu, Osadź). */
function strokesCanvas(strokes) {
  const bounds = selectionBounds(strokes);
  const area = { minX: bounds.minX - EXPORT_PAD, minY: bounds.minY - EXPORT_PAD, maxX: bounds.maxX + EXPORT_PAD, maxY: bounds.maxY + EXPORT_PAD };
  return areaCanvas(area, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(area.minX, area.minY, area.maxX - area.minX, area.maxY - area.minY);
    for (const stroke of strokes) paintStroke(ctx, stroke);
  });
}

const canvasBlob = (canvas, type = 'image/png') => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Nie udało się przygotować obrazu.'))), type, 0.9);
});

/**
 * Obraz PNG w schowku systemu – do wklejenia w notatce albo w innej aplikacji (gdy przeglądarka
 * pozwala). `png` – obietnica obrazu (schowek trzeba otworzyć od razu, w chwili dotknięcia).
 * Zwraca obietnicę: true – skopiowano, false – przeglądarka nie pozwoliła.
 */
function copyImage(png) {
  try {
    if (!navigator.clipboard?.write || typeof window.ClipboardItem !== 'function') return Promise.resolve(false);
    return navigator.clipboard.write([new window.ClipboardItem({ 'image/png': png })]).then(() => true, () => false);
  } catch {
    // Schowek systemu niedostępny – zostaje schowek rysunku.
    return Promise.resolve(false);
  }
}

/**
 * Otwiera edytor rysunku. drawing – istniejący rysunek (edycja) albo null; photo – zdjęcie pod
 * kreskami dla nowego rysunku ({ bytes, type, width, height }); title – sygnatura w nagłówku;
 * onEmbed (od 1.17) – „Osadź”: async ({ blob, width, height }) → sygnatura nowego obrazu notatki
 * (błąd – komunikat w edytorze); bez niej przycisku „Osadź” nie ma.
 * Zwraca obietnicę: { drawing, image } po „Gotowe” albo null po „Anuluj” (i po „Gotowe” bez
 * żadnej zmiany – nowy pusty rysunek nie trafia do notatki).
 */
export function openDrawingEditor({ drawing: source = null, photo = null, title = 'Rysunek', onEmbed = null } = {}) {
  return new Promise((resolve) => {
    // Pola tekstowe i wzory mierzone od nowa – czcionki tego urządzenia mogą być trochę inne.
    const drawing = source
      ? {
        ...source,
        scale: cleanScale(source.scale),
        paperLevel: source.paperLevel ?? DEFAULT_PAPER_LEVEL,
        strokes: source.strokes.map((stroke) => (isShape(stroke) ? measureLabel(stroke)
          : isElement(stroke) ? { ...stroke, ...measureElement(stroke) } : { ...stroke, points: [...stroke.points] }))
      }
      : emptyDrawing({ photo });
    const history = new DrawingHistory(drawing.strokes);
    const tools = loadTools();
    /** Narzędzie: 'pen', 'highlighter', 'eraser' albo 'select' (zaznaczanie prostokątem albo lassem). */
    let tool = 'pen';
    let penSeen = penSeenBefore();
    let changed = false;
    let dialog;
    let result = null;
    /**
     * Linijka { x, y, angle, snap } w jednostkach strony albo null (schowana). Nie jest częścią
     * rysunku. snap (od 1.14) – punkt, do którego przyskoczyło zero przy krawędzi, albo null.
     */
    let ruler = null;
    /** Zaznaczone kreski (te same obiekty co w rysunku). */
    let selection = new Set();
    /** Od 1.14: 'whole' – całe kreski, 'region' – fragmenty (kreski przecięte na brzegu obszaru). */
    let selectionKind = 'whole';
    /** Kreski przecięte przy zaznaczaniu fragmentu, jeszcze bez kroku cofania (begin() bez commit()). */
    let regionPending = false;
    /**
     * Wycinek (od 1.17): { polygon, bounds, kind } – obszar strony (prostokąt albo lasso), z którego
     * powstaje obraz wszystkiego, co w nim widać; albo null. Nie zmienia rysunku.
     */
    let snip = null;
    /** Kółko gumki pod myszą albo zawieszonym rysikiem (jednostki strony) albo null. */
    let hover = null;
    /** Pipetka (od 1.14): dotknięcie płótna pobiera kolor; lupa pod palcem, rysikiem albo kursorem. */
    let picking = false;
    let pickHover = null;
    /** Długość ostatniej kreski wzdłuż linijki (jednostki strony) albo null. */
    let measured = null;
    /** Kolejne wklejenia tego samego schowka – każde trochę niżej i w prawo. */
    let pasteCount = 0;
    const pixelsPerInch = screenPixelsPerInch();
    /** Jest mysz albo gładzik (od 1.17 – podpowiedź o wycinku prawym przyciskiem). */
    const finePointer = Boolean(window.matchMedia?.('(any-pointer: fine)').matches);
    /** Wczytane obrazy: zdjęcie pod kreskami i (od 1.15) szablon z pliku. */
    const media = { photo: null, template: null };
    /** Ustawianie szablonu na stronie (od 1.15): { before } – szablon sprzed ustawiania (Anuluj) albo null. */
    let placing = null;
    /** Liniuszek (od 1.15): { x, y } – punkt jednej z linii (kółko do przesuwania) albo null (schowany). */
    let guide = null;

    // Widok: skala (px ekranu na jednostkę rysunku) i przesunięcie strony; zoom – względem „cała strona”;
    // top – miejsce u góry płótna zajęte przez pasek narzędzi (pasek leży nad płótnem).
    const view = { zoom: 1, scale: 1, x: 0, y: 0, width: 0, height: 0, top: STAGE_MARGIN, dpr: 1 };
    const stage = h('div', { class: 'drawing__stage', dataset: { testid: 'drawing-stage' } });
    const base = h('canvas', { class: 'drawing__canvas', 'aria-hidden': 'true' });
    const live = h('canvas', { class: 'drawing__canvas drawing__canvas--live', role: 'img', 'aria-label': `Płótno rysunku: ${title}`, dataset: { testid: 'drawing-canvas' } });
    const selectionCount = h('span', { class: 'drawing__selection-count', dataset: { testid: 'drawing-selection-count' } });
    // Na wąskim ekranie przyciski zaznaczenia mają same ikony (napis zostaje dla czytnika ekranu).
    const selectionButton = (testID, iconName, label, hint, onClick, danger = false) => h('button', {
      type: 'button', class: danger ? 'drawing__selection-button drawing__selection-button--danger' : 'drawing__selection-button',
      'aria-label': label, title: hint, dataset: { testid: testID }, onClick
    }, icon(iconName, { size: 18 }), h('span', { class: 'drawing__selection-label' }, label));
    const editButton = selectionButton('drawing-selection-edit', 'edit', 'Edytuj', 'Edytuj', () => {
      const [only] = selection;
      if (isElement(only) && !isShape(only)) editElement(only.tool, only);
    });
    editButton.hidden = true;
    // Od 1.17: tekst i wypełnienie zaznaczonego kształtu, „Osadź” – obraz zaznaczenia albo wycinka w notatce.
    const shapeTextButton = selectionButton('drawing-selection-text', 'textBox', 'Tekst', 'Tekst na kształcie – przesuwa się i obraca razem z nim', () => {
      const [only] = selection;
      if (isShape(only)) editShapeLabel(only);
    });
    const fillButton = selectionButton('drawing-selection-fill', 'fill', 'Wypełnienie', 'Wypełnienie kształtu', () => chooseFill());
    const copyButton = selectionButton('drawing-selection-copy', 'copy', 'Kopiuj', 'Kopiuj (Ctrl+C) – wklejasz przyciskiem „Wklej” albo Ctrl+V, także w innym rysunku', () => copySelection());
    const duplicateButton = selectionButton('drawing-selection-duplicate', 'duplicate', 'Powiel', 'Powiel – kopia obok', () => duplicateSelection());
    const embedButton = selectionButton('drawing-selection-embed', 'embed', 'Osadź', 'Osadź w notatce jako obraz', () => embedSelection());
    const deleteButton = selectionButton('drawing-selection-delete', 'trash', 'Usuń', 'Usuń (Delete)', () => deleteSelection(), true);
    const selectionBar = h('div', { class: 'drawing__selection', hidden: true, role: 'toolbar', 'aria-label': 'Zaznaczone kreski' },
      selectionCount, editButton, shapeTextButton, fillButton, copyButton, duplicateButton, embedButton, deleteButton);
    // Pola wymiarów zaznaczonego kształtu (od 1.17): na liniach ramki konstrukcyjnej, wpisywane z klawiatury.
    const dims = h('div', { class: 'drawing__dims', hidden: true, dataset: { testid: 'drawing-dims' } });
    stage.append(base, live, dims, selectionBar);

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
      refreshRulerPanel?.();
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
      // Przesuwane zaznaczenie i poprawiany kształt rysuje warstwa bieżąca.
      paintDrawing(ctx, drawing, media, active?.kind === 'move' || active?.kind === 'shape-edit' ? selection : null);
      ctx.restore();
    };

    // ---- linijka (na ekranie stałej szerokości, położenie i kąt w jednostkach strony)
    const rulerHalf = () => RULER_WIDTH / 2 / view.scale;
    const rulerHandles = () => {
      const distance = Math.min(170, Math.max(70, Math.min(view.width, view.height) * 0.3)) / view.scale;
      return [rulerPoint(ruler, -distance, 0), rulerPoint(ruler, distance, 0)];
    };
    /** Co jest pod punktem strony: uchwyt obrotu, linijka albo nic. */
    const rulerHit = (point) => {
      if (!ruler) return null;
      if (rulerHandles().some((handle) => Math.hypot(handle.x - point.x, handle.y - point.y) <= (RULER_HANDLE_RADIUS + 6) / view.scale)) return 'handle';
      return Math.abs(rulerOffset(ruler, point.x, point.y).across) <= rulerHalf() ? 'body' : null;
    };
    /** Linijka pod kątem `angle` z zerem krawędzi `snap.side` w punkcie `snap`. */
    const zeroAt = (snap, angle, perpendicular) => {
      const offset = rulerPoint({ x: 0, y: 0, angle }, 0, snap.side * rulerHalf());
      return {
        x: snap.x - offset.x, y: snap.y - offset.y, angle,
        snap: { x: snap.x, y: snap.y, kind: snap.kind, side: snap.side, angle: snap.angle ?? null, perpendicular }
      };
    };
    /**
     * Linijka po przesunięciu albo obrocie: kąty co 45°, a od 1.14 zero przy jednej z krawędzi
     * przyskakuje do przecięcia kresek (pierwszeństwo) albo do linii; linijka prawie prostopadła do
     * tej linii (do 8°) ustawia się dokładnie prostopadle, zerem na linii.
     */
    function settleRuler(next) {
      const half = rulerHalf();
      const rank = (found) => (found.kind === 'crossing' ? 0 : 1);
      let snap = null;
      if (tools.rulerSnap) {
        for (const side of [-1, 1]) {
          const zero = rulerPoint(next, 0, side * half);
          const found = snapToStrokes(drawing.strokes, zero.x, zero.y, ZERO_SNAP / view.scale);
          if (!found) continue;
          const distance = Math.hypot(found.x - zero.x, found.y - zero.y);
          if (!snap || rank(found) < rank(snap) || (rank(found) === rank(snap) && distance < snap.distance)) snap = { ...found, side, distance };
        }
      }
      const perpendicular = snap?.kind === 'line' && lineAngleDifference(next.angle, snap.angle + Math.PI / 2) <= PERPENDICULAR_SNAP;
      const angle = perpendicular ? perpendicularAngle(snap.angle, next.angle) : snapRulerAngle(next.angle);
      return snap ? zeroAt(snap, angle, perpendicular) : { x: next.x, y: next.y, angle, snap: null };
    }
    const paintRuler = (ctx) => {
      const center = toScreen(ruler);
      const length = Math.hypot(view.width, view.height) * 2;
      const half = RULER_WIDTH / 2;
      // Napisy zawsze czytelne – nie leżą do góry nogami.
      const flip = Math.cos(ruler.angle) < -1e-9 || (Math.abs(Math.cos(ruler.angle)) < 1e-9 && Math.sin(ruler.angle) > 0);
      const label = (text, x, y, align = 'center') => {
        ctx.save();
        ctx.translate(x, y);
        if (flip) ctx.rotate(Math.PI);
        ctx.textAlign = align;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      };
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
      // Podziałka i liczby (od 1.14) w jednostkach skali rysunku, od zera na środku w obie strony:
      // liczby co 1, 2 albo 5 × 10ⁿ jednostek (tak gęsto, żeby się nie stykały), a między nimi
      // kreski co dziesiątą, piątą albo połowę odstępu – jak na zwykłej linijce; obok zera jednostka.
      const { value, unit } = drawing.scale;
      const unitPx = (PAPER_STEP * view.scale) / value;
      const reach = length / 2;
      ctx.font = '500 11px -apple-system, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const textWidth = (number) => ctx.measureText(formatNumber(number)).width;
      const unitWidth = ctx.measureText(unit).width;
      let labelStep = 0;
      for (let power = -6; labelStep === 0 && power <= 12; power += 1) {
        labelStep = [1, 2, 5].map((digit) => digit * 10 ** power).find((candidate) => {
          const spacing = candidate * unitPx;
          if (spacing < 16) return false;
          const last = Math.floor(reach / spacing) * candidate;
          const widest = Math.max(textWidth(candidate), textWidth(last), textWidth(last / 2));
          return spacing >= Math.max(widest + 12, 10 + unitWidth + textWidth(candidate) / 2);
        }) ?? 0;
      }
      const labelPx = labelStep * unitPx;
      if (labelPx > 0) {
        const parts = [10, 5, 2].find((count) => labelPx / count >= 4) ?? 1;
        const tickPx = labelPx / parts;
        const count = Math.ceil(reach / tickPx);
        ctx.beginPath();
        for (let index = -count; index <= count; index += 1) {
          const x = index * tickPx;
          const tick = index % parts === 0 ? 14 : parts === 10 && index % 5 === 0 ? 10 : 6;
          ctx.moveTo(x, -half);
          ctx.lineTo(x, -half + tick);
          ctx.moveTo(x, half);
          ctx.lineTo(x, half - tick);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(29, 29, 31, 0.82)';
        for (let index = 1; index * labelPx <= reach; index += 1) {
          const text = formatNumber(index * labelStep);
          label(text, index * labelPx, -half + 23);
          label(text, -index * labelPx, -half + 23);
        }
      }
      // Zero: znaczniki przy obu krawędziach (do nich przyskakuje), „0” i jednostka.
      ctx.fillStyle = ZERO_COLOR;
      ctx.beginPath();
      ctx.moveTo(-5, -half);
      ctx.lineTo(5, -half);
      ctx.lineTo(0, -half + 8);
      ctx.closePath();
      ctx.moveTo(-5, half);
      ctx.lineTo(5, half);
      ctx.lineTo(0, half - 8);
      ctx.closePath();
      ctx.fill();
      ctx.font = '700 11px -apple-system, system-ui, sans-serif';
      label('0', 0, -half + 23);
      ctx.font = '500 10px -apple-system, system-ui, sans-serif';
      label(unit, (flip ? -1 : 1) * 7, -half + 23, 'left');
      // Kąt – pod liczbami.
      ctx.fillStyle = 'rgba(29, 29, 31, 0.9)';
      ctx.font = '600 13px -apple-system, system-ui, sans-serif';
      label(`${rulerDegrees(ruler.angle)}°`, 0, 9);
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
      // Zero przyciągnięte do linii albo przecięcia – kółko w tym miejscu.
      if (ruler.snap) {
        const point = toScreen(ruler.snap);
        ctx.save();
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = ZERO_COLOR;
        ctx.stroke();
        if (ruler.snap.kind === 'crossing') {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = ZERO_COLOR;
          ctx.fill();
        }
        ctx.restore();
      }
    };
    /** Długość kreski wzdłuż linijki (w skali rysunku) obok rysika, po zewnętrznej stronie krawędzi. */
    const paintLength = (ctx, edge) => {
      const side = edge.across < 0 ? -1 : 1;
      const point = toScreen(rulerPoint(edge.ruler, edge.along, edge.across + (side * 24) / view.scale));
      const text = formatLength(edge.to - edge.from, drawing.scale);
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.font = '600 13px -apple-system, system-ui, sans-serif';
      const width = ctx.measureText(text).width + 18;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(point.x - width / 2, point.y - 12, width, 24, 12);
      else ctx.rect(point.x - width / 2, point.y - 12, width, 24);
      ctx.fillStyle = 'rgba(29, 29, 31, 0.86)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, point.x, point.y + 0.5);
      ctx.restore();
    };

    // ---- pipetka: kolor spod punktu (warstwa zapisanych kresek, zdjęcie, tło strony) i lupa
    function pickAt(point) {
      const box = base.getBoundingClientRect();
      const x = Math.floor((point.clientX - box.left) * view.dpr);
      const y = Math.floor((point.clientY - box.top) * view.dpr);
      if (x < 0 || y < 0 || x >= base.width || y >= base.height) return;
      const [red, green, blue, alpha] = base.getContext('2d').getImageData(x, y, 1, 1).data;
      // Poza stroną (cień, tło okna) – bez zmiany.
      if (alpha === 255) setDraft(rgbToHex([red, green, blue]));
    }
    /** Lupa nad punktem (pod nim, gdy u góry brakuje miejsca): powiększone piksele, środek w ramce, obwódka w wybranym kolorze. */
    const paintLoupe = (ctx, point) => {
      const box = live.getBoundingClientRect();
      const x = point.clientX - box.left;
      const y = point.clientY - box.top;
      const radius = 44;
      const cells = 15;
      const centerY = y - radius - 34 >= 8 ? y - radius - 34 : y + radius + 34;
      const size = (radius * 2) / cells;
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(x, centerY, radius, 0, Math.PI * 2);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - radius, centerY - radius, radius * 2, radius * 2);
      ctx.imageSmoothingEnabled = false;
      const sx = Math.floor(x * view.dpr) - (cells - 1) / 2;
      const sy = Math.floor(y * view.dpr) - (cells - 1) / 2;
      ctx.drawImage(base, sx, sy, cells, cells, x - radius, centerY - radius, radius * 2, radius * 2);
      ctx.restore();
      ctx.lineWidth = 7;
      ctx.strokeStyle = colorDraft;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, centerY, radius + 3.5, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - size / 2, centerY - size / 2, size, size);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - size / 2 - 1.5, centerY - size / 2 - 1.5, size + 3, size + 3);
      ctx.restore();
    };

    /**
     * Czy zaznaczanie w toku daje całe kreski, fragmenty czy (od 1.17) wycinek: prawy przycisk albo
     * tryb, a w trybie „Auto” – kierunek (prostokąt – w lewo, lasso – zgodnie ze wskazówkami).
     */
    const selectModeOf = (gesture) => {
      if (gesture.snip) return 'snip';
      if (tools.selectMode !== 'auto') return tools.selectMode;
      if (gesture.kind === 'lasso') return isClockwise(gesture.polygon) ? 'region' : 'whole';
      return gesture.rect.x1 < gesture.rect.x0 ? 'region' : 'whole';
    };

    // ---- kształty (od 1.15): zaznaczony kształt i jego punkty konstrukcyjne
    /** Kształt z widocznymi punktami konstrukcyjnymi: jedyny zaznaczony (przy zaznaczaniu i kształtach) albo poprawiany. */
    function editedShape() {
      if (active?.kind === 'shape-edit') return active.preview;
      if (selection.size !== 1 || (tool !== 'select' && tool !== 'shape') || ['move', 'shape-new'].includes(active?.kind) || placing) return null;
      const [only] = selection;
      return isShape(only) ? only : null;
    }
    const rotateHandle = (shape) => shapeHandles(shape, ROTATE_GAP / view.scale).find((handle) => handle.id === 'rotate') ?? shapePoint(shape, 0, -0.5);
    /** Punkt konstrukcyjny zaznaczonego kształtu pod punktem strony (najbliższy) albo null. */
    function shapeHandleAt(point) {
      const shape = editedShape();
      if (!shape) return null;
      let best = null;
      for (const handle of shapeHandles(shape, ROTATE_GAP / view.scale)) {
        const distance = Math.hypot(handle.x - point.x, handle.y - point.y) * view.scale;
        // Wierzchołek trójkąta leży na środku górnego boku – wtedy wygrywa z uchwytem wysokości.
        const rank = distance - (handle.kind === 'adjust' ? 10 : 0);
        if (distance <= HANDLE_HIT && (!best || rank < best.rank)) best = { ...handle, distance, rank, shape };
      }
      return best;
    }
    function paintHandles(ctx, shape) {
      const handles = shapeHandles(shape, ROTATE_GAP / view.scale);
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.strokeStyle = SELECT_COLORS.whole;
      ctx.lineWidth = 1;
      if (!isSegment(shape)) {
        // Ramka kształtu (przy pochyleniu – równoległobok) i ramię uchwytu obrotu.
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(([u, v], index) => {
          const point = toScreen(shapePoint(shape, u, v));
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        const rotate = toScreen(rotateHandle(shape));
        const axis = toScreen({ x: shape.x + (Math.sin(shape.angle) * shape.h) / 2, y: shape.y - (Math.cos(shape.angle) * shape.h) / 2 });
        ctx.moveTo(axis.x, axis.y);
        ctx.lineTo(rotate.x, rotate.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const handle of handles) {
        const point = toScreen(handle);
        ctx.beginPath();
        if (handle.kind === 'skew' || handle.kind === 'adjust') {
          ctx.moveTo(point.x, point.y - 7);
          ctx.lineTo(point.x + 7, point.y);
          ctx.lineTo(point.x, point.y + 7);
          ctx.lineTo(point.x - 7, point.y);
          ctx.closePath();
        } else {
          ctx.arc(point.x, point.y, handle.kind === 'rotate' ? 8 : 6, 0, Math.PI * 2);
        }
        ctx.fillStyle = handle.kind === 'adjust' ? '#ff9f0a' : handle.kind === 'skew' ? '#d6e6fa' : '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (handle.kind === 'rotate') {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 3.5, -Math.PI * 0.9, Math.PI * 0.4);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ---- wymiary kształtu z klawiatury (od 1.17): pola na środku linii ramki konstrukcyjnej
    // Kształt: szerokość – pod dolną linią, wysokość – przy prawej, kąt pochylenia – przy lewej
    // (pochylają się boki); odcinek i strzałka: długość – pod środkiem, kąt – za końcem.
    // Długości w skali rysunku (jak na linijce), kąty w stopniach. Enter albo wyjście z pola – zmiana
    // (jeden krok cofania), Esc – bez zmiany.
    const DIM_FIELDS = [
      ['width', 'Szerokość', 'length'], ['height', 'Wysokość', 'length'], ['skew', 'Kąt pochylenia', 'angle'],
      ['length', 'Długość', 'length'], ['angle', 'Kąt', 'angle']
    ];
    const dimFields = Object.fromEntries(DIM_FIELDS.map(([key, label, kind]) => {
      const input = h('input', {
        class: 'drawing__dim-input', type: 'text', inputmode: key === 'width' || key === 'height' || key === 'length' ? 'decimal' : 'text',
        autocomplete: 'off', spellcheck: 'false', 'aria-label': label, dataset: { testid: `drawing-dim-${key}` }
      });
      const unit = h('span', { class: 'drawing__dim-unit', 'aria-hidden': 'true' });
      const box = h('label', { class: 'drawing__dim', title: label, hidden: true }, input, unit);
      const field = { key, kind, box, input, unit, dirty: false };
      input.addEventListener('input', () => { field.dirty = true; });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitDim(field);
          input.blur();
        } else if (event.key === 'Escape') {
          // Esc w polu – wartość wraca, edytor zostaje otwarty.
          event.preventDefault();
          event.stopPropagation();
          field.dirty = false;
          input.blur();
        }
      });
      input.addEventListener('focus', () => requestAnimationFrame(() => input.select()));
      input.addEventListener('blur', () => {
        commitDim(field);
        requestLive();
      });
      dims.append(box);
      return [key, field];
    }));
    /** Wartość pola dla kształtu (długości w skali rysunku, kąty w stopniach). */
    function dimValue(key, shape) {
      if (key === 'width' || key === 'length') return toScaleLength(shape.w, drawing.scale);
      if (key === 'height') return toScaleLength(shape.h, drawing.scale);
      if (key === 'skew') return skewDegrees(shape);
      return segmentDegrees(shape);
    }
    /** Wpisana wartość: nowy kształt (jeden krok cofania); zła – komunikat i poprzednia wartość. */
    function commitDim(field) {
      if (!field.dirty) return;
      field.dirty = false;
      const shape = editedShape();
      if (!shape || active) return;
      const value = parseDecimal(field.input.value);
      if (value === null || (field.kind === 'length' && value <= 0)) {
        flash(field.kind === 'length' ? 'Wpisz wymiar większy od zera.' : 'Wpisz kąt w stopniach.');
        requestLive();
        return;
      }
      const units = fromScaleLength(value, drawing.scale);
      let next;
      if (field.key === 'width') next = resizeShape(shape, { w: units });
      else if (field.key === 'height') next = resizeShape(shape, { h: units });
      else if (field.key === 'length') next = setSegment(shape, { length: units });
      else if (field.key === 'angle') next = setSegment(shape, { degrees: value });
      else {
        if (Math.abs(value) > SKEW_DEGREES_LIMIT) flash(`Pochylenie najwyżej ${SKEW_DEGREES_LIMIT}° w każdą stronę.`);
        next = resizeShape(shape, { skew: value });
      }
      next = measureLabel(next);
      if (['x', 'y', 'w', 'h', 'angle', 'skew'].every((key) => next[key] === shape[key])) {
        requestLive();
        return;
      }
      replaceShape(shape, next);
      updateToolbar();
      requestRender();
    }
    /** Pola wymiarów przy ramce kształtu – po każdej zmianie widoku i kształtu; w trakcie przeciągania punktu tylko pokazują wartości. */
    function placeDims(shape) {
      const show = Boolean(shape) && (!active || active.kind === 'shape-edit');
      dims.hidden = !show;
      if (!show) return;
      dims.classList.toggle('drawing__dims--busy', Boolean(active));
      const segment = isSegment(shape);
      const [cos, sin] = [Math.cos(shape.angle), Math.sin(shape.angle)];
      const turn = ([x, y]) => [x * cos - y * sin, x * sin + y * cos];
      const unit = (vector) => {
        const length = Math.hypot(...vector) || 1;
        return vector.map((value) => value / length);
      };
      // Odcinek: „pod” i „za końcem” – w kierunku czytelnym (jak tekst odcinka).
      const flip = segment && (cos < -1e-9 || (Math.abs(cos) < 1e-9 && sin > 0)) ? -1 : 1;
      const places = segment
        ? { length: [shapePoint(shape, 0, 0), turn([0, flip])], angle: [shapePoint(shape, 0.5, 0), [cos, sin]] }
        : {
          width: [shapePoint(shape, 0, 0.5), turn([0, 1])],
          height: [shapePoint(shape, 0.5, 0), turn(unit([1, shape.skew]))],
          skew: [shapePoint(shape, -0.5, 0), turn(unit([-1, -shape.skew]))]
        };
      for (const field of Object.values(dimFields)) {
        const place = places[field.key];
        field.box.hidden = !place;
        if (!place) continue;
        if (document.activeElement !== field.input && !field.dirty) {
          field.input.value = formatNumber(dimValue(field.key, shape));
          field.unit.textContent = field.kind === 'length' ? scaleUnitLabel(drawing.scale) : '°';
        }
        const [point, [nx, ny]] = place;
        const anchor = toScreen(point);
        const [width, height] = [field.box.offsetWidth, field.box.offsetHeight];
        const reach = DIM_GAP + Math.abs(nx) * (width / 2) + Math.abs(ny) * (height / 2);
        const x = Math.min(view.width - width / 2 - 4, Math.max(width / 2 + 4, anchor.x + nx * reach));
        const y = Math.min(view.height - height / 2 - 4, Math.max(height / 2 + 4, anchor.y + ny * reach));
        field.box.style.left = `${Math.round(x - width / 2)}px`;
        field.box.style.top = `${Math.round(y - height / 2)}px`;
      }
    }

    // ---- liniuszek (od 1.15): równoległe linie przez całą stronę, poprzeczne, kółko do przesuwania
    /** Rodziny linii: główne i (gdy włączone) poprzeczne – kąty jak na linijce (przeciwnie do wskazówek zegara). */
    function guideFamilies() {
      const settings = tools.guide;
      const angle = (-settings.angle * Math.PI) / 180;
      const families = [{ kind: 'main', x: guide.x, y: guide.y, angle, spacing: settings.spacing * PAPER_STEP }];
      if (settings.cross) {
        // Odstęp poprzecznych mierzony wzdłuż linii głównych.
        const between = (settings.crossAngle * Math.PI) / 180;
        families.push({ kind: 'cross', x: guide.x, y: guide.y, angle: angle - between, spacing: settings.crossSpacing * PAPER_STEP * Math.abs(Math.sin(between)) });
      }
      return families;
    }
    function paintGuide(ctx) {
      const reach = Math.hypot(drawing.width, drawing.height);
      ctx.save();
      ctx.lineWidth = 1 / view.scale;
      ctx.strokeStyle = GUIDE_COLOR;
      for (const family of guideFamilies()) {
        const [dx, dy] = [Math.cos(family.angle) * reach, Math.sin(family.angle) * reach];
        ctx.setLineDash(family.kind === 'cross' ? [6 / view.scale, 4 / view.scale] : []);
        ctx.beginPath();
        for (const line of guideLinesIn(family, drawing.width, drawing.height)) {
          ctx.moveTo(line.x - dx, line.y - dy);
          ctx.lineTo(line.x + dx, line.y + dy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    const guideKnobHit = (point) => Boolean(guide) && Math.hypot(point.x - guide.x, point.y - guide.y) * view.scale <= GUIDE_KNOB + 8;
    function paintGuideKnob(ctx) {
      const point = toScreen(guide);
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.beginPath();
      ctx.arc(point.x, point.y, GUIDE_KNOB, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fill();
      ctx.strokeStyle = ZERO_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x + dx * 6, point.y + dy * 6);
      }
      ctx.stroke();
      ctx.restore();
    }

    // ---- szablon w trakcie ustawiania: ramka na stronie (przeciągnięcie przesuwa szablon)
    function paintPlacement(ctx) {
      const template = drawing.template;
      ctx.save();
      ctx.setLineDash([8 / view.scale, 5 / view.scale]);
      ctx.lineWidth = 1.5 / view.scale;
      ctx.strokeStyle = ZERO_COLOR;
      ctx.fillStyle = 'rgba(0, 88, 190, 0.05)';
      ctx.fillRect(template.x, template.y, template.w, template.h);
      ctx.strokeRect(template.x, template.y, template.w, template.h);
      ctx.restore();
    }

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
      if (active?.kind === 'shape-new' && active.shape) paintStroke(ctx, active.shape);
      if (active?.kind === 'shape-edit') paintStroke(ctx, active.preview);
      if (guide) paintGuide(ctx);
      ctx.restore();
      if (placing && drawing.template) paintPlacement(ctx);
      const bounds = selectionBounds([...selection]);
      // Jeden kształt: zamiast ramki – jego punkty konstrukcyjne.
      const handled = editedShape();
      if (handled) paintHandles(ctx, handled);
      if (bounds && !handled) {
        const pad = SELECTION_PAD / view.scale;
        const [dx, dy] = active?.kind === 'move' ? [active.dx, active.dy] : [0, 0];
        ctx.save();
        ctx.setLineDash([6 / view.scale, 4 / view.scale]);
        ctx.lineWidth = 1.5 / view.scale;
        ctx.strokeStyle = SELECT_COLORS[selectionKind];
        ctx.fillStyle = SELECT_FILLS[selectionKind];
        ctx.fillRect(bounds.minX - pad + dx, bounds.minY - pad + dy, bounds.maxX - bounds.minX + pad * 2, bounds.maxY - bounds.minY + pad * 2);
        ctx.strokeRect(bounds.minX - pad + dx, bounds.minY - pad + dy, bounds.maxX - bounds.minX + pad * 2, bounds.maxY - bounds.minY + pad * 2);
        ctx.restore();
      }
      if (snip) {
        // Wycinek (od 1.17): obrys obszaru – fioletowy, kreskowany.
        ctx.save();
        ctx.setLineDash([6 / view.scale, 4 / view.scale]);
        ctx.lineWidth = 1.6 / view.scale;
        ctx.strokeStyle = SELECT_COLORS.snip;
        ctx.fillStyle = SELECT_FILLS.snip;
        ctx.beginPath();
        ctx.moveTo(snip.polygon[0], snip.polygon[1]);
        for (let index = 2; index < snip.polygon.length; index += 2) ctx.lineTo(snip.polygon[index], snip.polygon[index + 1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      if (active?.kind === 'marquee' || active?.kind === 'lasso') {
        // Całe kreski – linia ciągła, fragmenty i wycinek – kreskowana (i inny kolor).
        const mode = selectModeOf(active);
        ctx.save();
        if (mode !== 'whole') ctx.setLineDash([5 / view.scale, 4 / view.scale]);
        ctx.lineWidth = 1.4 / view.scale;
        ctx.strokeStyle = SELECT_COLORS[mode];
        ctx.fillStyle = SELECT_FILLS[mode];
        ctx.beginPath();
        if (active.kind === 'marquee') {
          const { x0, y0, x1, y1 } = active.rect;
          ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        } else {
          const { polygon } = active;
          ctx.moveTo(polygon[0], polygon[1]);
          for (let index = 2; index < polygon.length; index += 2) ctx.lineTo(polygon[index], polygon[index + 1]);
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      if (guide) paintGuideKnob(ctx);
      if (ruler) paintRuler(ctx);
      if (active?.kind === 'stroke' && active.edge && active.edge.to >= active.edge.from) paintLength(ctx, active.edge);
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
      const loupe = active?.kind === 'pick' ? active.client : pickHover;
      if (picking && loupe) paintLoupe(ctx, loupe);
      // Pola wymiarów najpierw – polecenia zaznaczenia ich nie zasłaniają (np. po obrocie kształtu pole jest nad nim).
      placeDims(handled);
      placeSelectionBar(snip ? snip.bounds : handled ? { ...bounds, minY: Math.min(bounds.minY, rotateHandle(handled).y - 14 / view.scale) } : bounds, dimsExtent());
      updateSelectHint();
    };
    /** Góra i dół widocznych pól wymiarów (px płótna) albo null. */
    function dimsExtent() {
      if (dims.hidden) return null;
      const boxes = Object.values(dimFields).filter((field) => !field.box.hidden).map((field) => field.box);
      if (boxes.length === 0) return null;
      return { top: Math.min(...boxes.map((box) => box.offsetTop)), bottom: Math.max(...boxes.map((box) => box.offsetTop + box.offsetHeight)) };
    }
    /** Polecenia zaznaczenia nad ramką (albo pod nią, gdy u góry brakuje miejsca); `extra` – pola wymiarów do ominięcia. */
    function placeSelectionBar(bounds, extra = null) {
      const show = Boolean(bounds) && !['move', 'marquee', 'lasso', 'pick', 'shape-new', 'shape-edit', 'template-move'].includes(active?.kind) && !placing;
      selectionBar.hidden = !show;
      if (!show) return;
      const items = [...selection];
      const only = items.length === 1 ? items[0] : null;
      selectionCount.textContent = snip ? 'Wycinek' : selectionKind === 'region' ? 'Fragment' : only?.tool === 'text' ? 'Pole tekstowe' : only?.tool === 'math' ? 'Wzór'
        : isShape(only) ? SHAPE_LABELS[only.shape]
        : items.some(isElement) ? plural(items.length, 'element', 'elementy', 'elementów') : plural(items.length, 'kreska', 'kreski', 'kresek');
      // Wycinek (od 1.17): tylko kopiuj i osadź – rysunek się nie zmienia.
      const shape = !snip && isShape(only) ? only : null;
      editButton.hidden = Boolean(snip) || !isElement(only) || isShape(only);
      shapeTextButton.hidden = !shape;
      fillButton.hidden = !shape || !canFill(shape);
      duplicateButton.hidden = Boolean(snip);
      deleteButton.hidden = Boolean(snip);
      embedButton.hidden = !onEmbed;
      copyButton.title = snip ? 'Kopiuj wycinek jako obraz (Ctrl+C) – wkleisz go w notatce albo w innej aplikacji'
        : 'Kopiuj (Ctrl+C) – wklejasz przyciskiem „Wklej” albo Ctrl+V, także w innym rysunku';
      const top = Math.min(toScreen({ x: 0, y: bounds.minY }).y - SELECTION_PAD, extra?.top ?? Infinity);
      const bottom = Math.max(toScreen({ x: 0, y: bounds.maxY }).y + SELECTION_PAD, extra?.bottom ?? -Infinity);
      const middle = toScreen({ x: (bounds.minX + bounds.maxX) / 2, y: 0 }).x;
      const width = selectionBar.offsetWidth;
      const height = selectionBar.offsetHeight;
      const left = Math.min(Math.max(8, middle - width / 2), Math.max(8, view.width - width - 8));
      const above = top - height - 8;
      selectionBar.style.left = `${left}px`;
      // Nad zaznaczeniem, gdy mieści się pod paskiem narzędzi (od 1.17 – nie wchodzi pod pasek); inaczej pod nim.
      selectionBar.style.top = `${above >= view.top ? above : Math.min(bottom + 8, view.height - height - 8)}px`;
    }
    /** Podpowiedź przy zaznaczaniu: co zaznaczy kierunek obrysu, a w trakcie – co właśnie zaznaczasz. */
    function updateSelectHint() {
      const outlining = active?.kind === 'marquee' || active?.kind === 'lasso';
      const show = tool === 'select' && (outlining || (selection.size === 0 && !snip && !active));
      selectHint.hidden = !show;
      if (!show) return;
      const mode = outlining ? selectModeOf(active) : null;
      // Od 1.17 prawy przycisk myszy (albo przycisk na rysiku) robi wycinek – podpowiedź, gdy jest mysz.
      const rightButton = tools.selectMode !== 'snip' && finePointer ? ' · prawy przycisk – wycinek' : '';
      selectHint.textContent = outlining
        ? (mode === 'snip' ? 'Wycinek – wszystko w obszarze, z tłem' : mode === 'region' ? 'Zaznaczasz fragmenty – tylko wnętrze' : 'Zaznaczasz całe kreski')
        : SELECT_HINTS[tools.selectMode === 'auto' ? tools.selectShape : tools.selectMode] + rightButton;
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
      refreshRulerPanel?.();
      requestRender();
    };
    const observer = new ResizeObserver(resize);

    // ---- pasek narzędzi
    const toolButton = (id, label, iconName) => h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': label, title: label, 'aria-pressed': 'false',
      dataset: { tool: id, testid: `drawing-tool-${id}` },
      onClick: () => {
        // Drugie dotknięcie aktywnego pióra albo zakreślacza – ustawienia; kształty – wybór kształtu.
        if (tool === id && (id === 'pen' || id === 'highlighter')) {
          toggleSettings();
          return;
        }
        if (id === 'shape') {
          const open = tool !== 'shape' || shapePanel.hidden;
          if (tool !== 'shape') setTool('shape');
          closeSettings();
          if (open) toggleShapePanel();
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
    const selectButton = toolButton('select', 'Zaznaczanie – prostokąt', 'marquee');
    selectButton.dataset.shape = 'rect';
    // Kształty (od 1.15): ikona – wybrany kształt.
    const shapeButton = toolButton('shape', 'Kształty', 'shapeRect');
    shapeButton.dataset.kind = 'rect';
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
    // Zaznaczanie (od 1.14): kształt – prostokąt albo lasso – i tryb (kierunek, całe kreski, fragmenty).
    const selectShapes = h('div', { class: 'drawing__group', role: 'radiogroup', 'aria-label': 'Kształt zaznaczenia' },
      SELECT_SHAPES.map((shape) => h('button', {
        type: 'button', class: 'drawing__tool', role: 'radio', 'aria-label': OUTLINE_LABELS[shape], title: OUTLINE_LABELS[shape],
        dataset: { shape, testid: `drawing-select-${shape}` },
        onClick: () => { tools.selectShape = shape; saveTools(tools); updateToolbar(); requestLive(); }
      }, icon(shape === 'lasso' ? 'lasso' : 'marquee', { size: 24 }))));
    const selectModes = h('div', { class: 'drawing__group drawing__modes', role: 'radiogroup', 'aria-label': 'Co zaznaczać' },
      // Od 1.17 cztery tryby (z wycinkiem) – na telefonie „Fragm.”, żeby pasek miał najwyżej trzy wiersze.
      SELECT_MODES.map((mode) => h('button', {
        type: 'button', class: 'drawing__mode', role: 'radio', title: SELECT_MODE_TITLES[mode], 'aria-label': SELECT_MODE_LABELS[mode],
        dataset: { mode, testid: `drawing-select-mode-${mode}` },
        onClick: () => { tools.selectMode = mode; saveTools(tools); updateToolbar(); requestLive(); }
      }, mode === 'region'
        ? [h('span', { class: 'drawing__wide-label' }, SELECT_MODE_LABELS[mode]), h('span', { class: 'drawing__narrow-label' }, 'Fragm.')]
        : SELECT_MODE_LABELS[mode])));
    const pasteButton = h('button', {
      type: 'button', class: 'drawing__chip', hidden: true, title: 'Wklej (Ctrl+V)', dataset: { testid: 'drawing-paste' }, onClick: () => paste()
    }, 'Wklej');
    // Zaznacz wszystko – na iPadzie bez klawiatury nie ma Ctrl+A.
    // Na telefonie krócej („Wszystko”) – pasek zaznaczania mieści się w trzech wierszach.
    const selectGroup = h('div', { class: 'drawing__group' }, pasteButton, h('button', {
      type: 'button', class: 'drawing__chip', 'aria-label': 'Zaznacz wszystko', dataset: { testid: 'drawing-select-all' }, onClick: () => selectAll()
    }, h('span', { class: 'drawing__wide-label' }, 'Zaznacz wszystko'), h('span', { class: 'drawing__narrow-label' }, 'Wszystko')));
    const undoButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Cofnij', title: 'Cofnij (Ctrl+Z)', dataset: { testid: 'drawing-undo' },
      onClick: () => stepHistory(false)
    }, icon('undo', { size: 24 }));
    const redoButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Ponów', title: 'Ponów (Ctrl+Shift+Z)', dataset: { testid: 'drawing-redo' },
      onClick: () => stepHistory(true)
    }, icon('redo', { size: 24 }));
    // Tło strony (od 1.15 – panel: rodzaj, jasność linii, szablon); na telefonie krótki napis.
    const paperLabel = h('span', { class: 'drawing__wide-label' });
    const paperButton = h('button', {
      type: 'button', class: 'drawing__chip', 'aria-haspopup': 'dialog', dataset: { testid: 'drawing-paper' }, hidden: Boolean(drawing.photo),
      onClick: () => togglePaperPanel()
    }, paperLabel, h('span', { class: 'drawing__narrow-label' }, 'Tło'));
    const guideButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Liniuszek', title: 'Liniuszek – równoległe linie, do których przyciąga się kreska',
      'aria-pressed': 'false', dataset: { testid: 'drawing-guide' }, onClick: () => toggleGuide()
    }, icon('guide', { size: 24 }));
    // Grupy narzędzi zawijają się w całości (na telefonie – w kilku wierszach).
    const toolbar = h('div', { class: 'drawing__toolbar', role: 'toolbar', 'aria-label': 'Narzędzia rysunku' },
      h('div', { class: 'drawing__group' }, penButton, highlighterButton, eraserButton, selectButton, shapeButton, textButton, mathButton),
      swatches, widths, eraserModes, eraserSizes, selectShapes, selectModes, selectGroup,
      h('div', { class: 'drawing__group' }, rulerButton, guideButton, undoButton, redoButton, paperButton));

    const zoomButton = h('button', {
      type: 'button', class: 'drawing__pill', title: 'Cała strona', dataset: { testid: 'drawing-zoom' },
      onClick: () => { view.zoom = 1; view.width = 0; resize(); zoomButton.textContent = '100%'; }
    }, '100%');
    const penPill = h('span', { class: 'drawing__pill drawing__pill--info', hidden: !penSeen, dataset: { testid: 'drawing-pen-only' } },
      icon('pen', { size: 14 }), 'Rysuje tylko rysik · palec przesuwa');
    const selectHint = h('span', { class: 'drawing__pill drawing__pill--info', hidden: true, dataset: { testid: 'drawing-select-hint' } });
    const notice = h('span', { class: 'drawing__pill drawing__pill--info drawing__pill--notice', hidden: true, role: 'status', dataset: { testid: 'drawing-notice' } });
    const lengthPill = h('span', { class: 'drawing__pill drawing__pill--info', hidden: true, dataset: { testid: 'drawing-ruler-length' } });
    // Kąt linijki; dotknięcie – skala rysunku i przyciąganie (od 1.14).
    const rulerText = h('span');
    const rulerPill = h('button', {
      type: 'button', class: 'drawing__pill', hidden: true, 'aria-haspopup': 'dialog', title: 'Linijka i skala rysunku',
      dataset: { testid: 'drawing-ruler-angle' }, onClick: () => toggleRulerPanel()
    }, rulerText, icon('chevronDown', { size: 14 }));
    const perpendicularButton = h('button', {
      type: 'button', class: 'drawing__pill drawing__pill--symbol', hidden: true, 'aria-label': 'Linijka prostopadle do linii pod zerem',
      title: 'Prostopadle do linii pod zerem', dataset: { testid: 'drawing-ruler-perpendicular' }, onClick: () => perpendicularRuler()
    }, '⊥');
    // Liniuszek: kąt i odstęp; dotknięcie – ustawienia (od 1.15).
    const guideText = h('span');
    const guidePill = h('button', {
      type: 'button', class: 'drawing__pill', hidden: true, 'aria-haspopup': 'dialog', title: 'Liniuszek – ustawienia',
      dataset: { testid: 'drawing-guide-pill' }, onClick: () => toggleGuidePanel()
    }, guideText, icon('chevronDown', { size: 14 }));
    const status = h('div', { class: 'drawing__status' }, notice, penPill, selectHint, lengthPill, guidePill, rulerPill, perpendicularButton, zoomButton);
    let noticeTimer = 0;
    /** Krótki komunikat w edytorze (komunikaty aplikacji są pod oknem rysunku). */
    function flash(message) {
      notice.textContent = message;
      notice.hidden = false;
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { notice.hidden = true; }, 3500);
    }

    const swatchButton = (hex, label, testID, pressed, onClick, custom = false) => h('button', {
      type: 'button', class: custom ? 'drawing__swatch drawing__swatch--custom' : 'drawing__swatch', style: { '--swatch': hex }, 'aria-label': label, title: label,
      'aria-pressed': String(pressed), dataset: { testid: testID }, onClick
    });
    function updateToolbar() {
      for (const button of [penButton, highlighterButton, eraserButton, selectButton, shapeButton]) {
        button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
      }
      // Kształty (od 1.15) mają kolor i grubość pióra.
      const inking = tool === 'pen' || tool === 'highlighter' || tool === 'shape';
      const highlighter = tool === 'highlighter';
      const palette = highlighter ? HIGHLIGHTER_COLORS : INK_COLORS;
      const chosen = highlighter ? tools.highlighterColor : tools.penColor;
      const choose = (value) => {
        if (highlighter) tools.highlighterColor = value;
        else tools.penColor = value;
        saveTools(tools);
        closeSettings();
        updateToolbar();
        requestLive();
      };
      // Kolory palety, do trzech własnych (od 1.14) i „+” – panel własnego koloru.
      replaceChildren(swatches,
        palette.map((color) => swatchButton(color.hex, color.label, `drawing-color-${color.id}`, color.id === chosen, () => choose(color.id))),
        tools.customColors.map((hex, index) => swatchButton(hex, `Własny kolor ${hex.toUpperCase()}`, `drawing-color-custom-${index}`, hex === chosen, () => choose(hex), true)),
        h('button', {
          type: 'button', class: 'drawing__swatch drawing__swatch--add', 'aria-label': 'Inny kolor – siatka, suwaki albo pipetka', title: 'Inny kolor',
          'aria-expanded': String(!colorPanel.hidden), dataset: { testid: 'drawing-color-custom' }, onClick: () => toggleColorPanel()
        }, icon('plus', { size: 16 })));
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
      for (const button of eraserModes.children) button.setAttribute('aria-checked', String(button.dataset.mode === tools.eraserMode));
      eraserSizes.hidden = tool !== 'eraser' || tools.eraserMode !== 'pixel';
      for (const button of eraserSizes.children) button.setAttribute('aria-checked', String(Number(button.dataset.size) === tools.eraserSize));
      eraserButton.setAttribute('aria-label', `Gumka – ${ERASER_MODE_LABELS[tools.eraserMode].toLowerCase()}`);
      for (const group of [selectShapes, selectModes, selectGroup]) group.hidden = tool !== 'select';
      for (const button of selectShapes.children) button.setAttribute('aria-checked', String(button.dataset.shape === tools.selectShape));
      for (const button of selectModes.children) button.setAttribute('aria-checked', String(button.dataset.mode === tools.selectMode));
      pasteButton.hidden = !readClipboard();
      // Ikona zaznaczania – wybrany kształt.
      if (selectButton.dataset.shape !== tools.selectShape) {
        selectButton.dataset.shape = tools.selectShape;
        replaceChildren(selectButton, icon(tools.selectShape === 'lasso' ? 'lasso' : 'marquee', { size: 24 }));
        const label = `Zaznaczanie – ${OUTLINE_LABELS[tools.selectShape].toLowerCase()}`;
        selectButton.setAttribute('aria-label', label);
        selectButton.title = label;
      }
      if (shapeButton.dataset.kind !== tools.shape) {
        shapeButton.dataset.kind = tools.shape;
        replaceChildren(shapeButton, icon(SHAPE_ICONS[tools.shape], { size: 24 }));
        shapeButton.setAttribute('aria-label', `Kształty – ${SHAPE_LABELS[tools.shape].toLowerCase()}`);
        shapeButton.title = `Kształty – ${SHAPE_LABELS[tools.shape].toLowerCase()}`;
      }
      rulerButton.setAttribute('aria-pressed', String(Boolean(ruler)));
      guideButton.setAttribute('aria-pressed', String(Boolean(guide)));
      updateRulerPill();
      updateGuidePill();
      // Fragment zaznaczony (kreski przecięte na chwilę) nie jest jeszcze krokiem do cofnięcia.
      undoButton.disabled = !(regionPending ? history.done.length > 0 : history.canUndo);
      redoButton.disabled = !history.canRedo;
      paperLabel.textContent = `Tło: ${PAPER_LABELS[drawing.paper].toLowerCase()}${drawing.template ? ' i szablon' : ''}`;
      paperButton.setAttribute('aria-label', `Tło strony: ${PAPER_LABELS[drawing.paper].toLowerCase()}${drawing.template ? ' i szablon' : ''} – zmień`);
      paperButton.setAttribute('aria-expanded', String(!paperPanel.hidden));
    }
    function updateGuidePill() {
      guidePill.hidden = !guide;
      if (!guide) return;
      const settings = tools.guide;
      guideText.textContent = `Liniuszek ${((settings.angle % 180) + 180) % 180}° · co ${formatLength(settings.spacing * PAPER_STEP, drawing.scale)}`
        + (settings.cross ? ' · poprzeczne' : '');
    }
    function updateRulerPill() {
      rulerPill.hidden = !ruler;
      perpendicularButton.hidden = !ruler;
      lengthPill.hidden = !(ruler || guide) || !(measured > 0);
      if (measured > 0) lengthPill.textContent = `Kreska: ${formatLength(measured, drawing.scale)}`;
      if (!ruler) return;
      const { snap } = ruler;
      const where = !snap ? '' : snap.kind === 'crossing' ? ' · na przecięciu' : snap.perpendicular ? ' · prostopadle' : ' · na linii';
      rulerText.textContent = `Linijka ${rulerDegrees(ruler.angle)}°${where}`;
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

    // ---- własny kolor (od 1.14): siatka, suwaki RGB z kodem HEX, pipetka; pamiętane trzy ostatnie
    const colorPanel = h('div', { class: 'drawing__settings drawing__color-panel', hidden: true, role: 'dialog', 'aria-label': 'Inny kolor', dataset: { testid: 'drawing-color-panel' } });
    /** Kolor wybierany w panelu (jeszcze nie użyty) i karta panelu. */
    let colorDraft = '#000000';
    let colorTab = 'grid';
    let syncColor = null;
    const setDraft = (hex, source = null) => {
      colorDraft = hex;
      syncColor?.(source);
    };
    function toggleColorPanel() {
      const open = colorPanel.hidden;
      closeSettings();
      if (open) {
        colorDraft = tool === 'highlighter' ? highlighterHex(tools.highlighterColor) : inkHex(tools.penColor);
        colorPanel.hidden = false;
        renderColorPanel();
      }
      updateToolbar();
      requestLive();
    }
    function renderColorPanel() {
      picking = colorTab === 'picker';
      pickHover = null;
      const tabs = COLOR_TABS.map(([id, label]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(id === colorTab), dataset: { testid: `drawing-color-tab-${id}` },
        onClick: () => { colorTab = id; renderColorPanel(); requestLive(); }
      }, label));
      let body;
      let sync = () => {};
      if (colorTab === 'grid') {
        const cells = COLOR_GRID.map((hex, index) => h('button', {
          type: 'button', class: 'drawing__grid-color', style: { '--swatch': hex }, 'aria-label': hex.toUpperCase(),
          dataset: { color: hex, testid: `drawing-grid-color-${index}` }, onClick: () => setDraft(hex)
        }));
        body = h('div', { class: 'drawing__color-grid', role: 'group', 'aria-label': 'Siatka kolorów' }, cells);
        sync = () => {
          for (const cell of cells) cell.setAttribute('aria-pressed', String(cell.dataset.color === colorDraft));
        };
      } else if (colorTab === 'sliders') {
        const channels = ['r', 'g', 'b'].map((name, channel) => ({
          channel,
          output: h('span', { class: 'drawing__channel-value' }),
          range: h('input', {
            type: 'range', class: 'drawing__range drawing__channel', min: 0, max: 255, step: 1, 'aria-label': CHANNEL_LABELS[channel],
            dataset: { testid: `drawing-channel-${name}` },
            onInput: (event) => {
              const rgb = hexToRgb(colorDraft);
              rgb[channel] = Number(event.target.value);
              setDraft(rgbToHex(rgb), 'range');
            }
          })
        }));
        const hexInput = h('input', {
          class: 'input drawing__hex', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 7,
          'aria-label': 'Kod koloru (HEX)', dataset: { testid: 'drawing-color-hex' },
          onInput: (event) => {
            const hex = parseHex(event.target.value);
            event.target.setAttribute('aria-invalid', String(!hex));
            if (hex) setDraft(hex, 'hex');
          }
        });
        body = h('div', { class: 'drawing__channels' },
          channels.map(({ channel, output, range }) => h('label', { class: 'drawing__channel-row' },
            h('span', { class: 'drawing__channel-name' }, 'RGB'[channel]), range, output)),
          h('label', { class: 'drawing__channel-row' }, h('span', { class: 'drawing__channel-name' }, 'HEX'), hexInput));
        sync = (source) => {
          const rgb = hexToRgb(colorDraft);
          for (const { channel, output, range } of channels) {
            range.value = String(rgb[channel]);
            output.textContent = String(rgb[channel]);
            // Tor suwaka: od zera do pełnej składowej przy dwóch pozostałych bez zmian.
            const low = [...rgb];
            const high = [...rgb];
            low[channel] = 0;
            high[channel] = 255;
            range.style.setProperty('--track', `linear-gradient(to right, ${rgbToHex(low)}, ${rgbToHex(high)})`);
          }
          if (source !== 'hex') {
            hexInput.value = colorDraft.toUpperCase();
            hexInput.removeAttribute('aria-invalid');
          }
        };
      } else {
        body = h('p', { class: 'drawing__picker-hint' },
          'Dotknij rysunku albo przeciągnij po nim – pipetka pobierze kolor spod palca, rysika albo kursora (także ze zdjęcia pod kreskami). Lupa pokazuje powiększone miejsce.');
      }
      const preview = h('span', { class: 'drawing__color-preview', 'aria-hidden': 'true' });
      const code = h('span', { class: 'drawing__color-code', dataset: { testid: 'drawing-color-value' } });
      syncColor = (source) => {
        preview.style.setProperty('--swatch', colorDraft);
        code.textContent = colorDraft.toUpperCase();
        sync(source);
      };
      replaceChildren(colorPanel,
        h('h3', { class: 'drawing__settings-title' }, tool === 'highlighter' ? 'Kolor zakreślacza' : 'Kolor pióra'),
        h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Sposób wyboru koloru' }, tabs),
        h('div', { class: 'drawing__color-body' }, body),
        h('div', { class: 'drawing__color-footer' }, preview, code,
          h('button', {
            type: 'button', class: 'drawing__chip', dataset: { testid: 'drawing-color-cancel' },
            onClick: () => { closeSettings(); updateToolbar(); requestLive(); }
          }, 'Anuluj'),
          h('button', { type: 'button', class: 'drawing__chip drawing__chip--accent', dataset: { testid: 'drawing-color-use' }, onClick: () => useColor() }, 'Użyj koloru')));
      syncColor();
    }
    function useColor() {
      const highlighter = tool === 'highlighter';
      // Kolor z palety – zwykłe kółko palety; inny – wśród własnych (najnowszy pierwszy, najwyżej trzy).
      const known = (highlighter ? HIGHLIGHTER_COLORS : INK_COLORS).find((color) => color.hex === colorDraft);
      if (!known) tools.customColors = rememberColor(tools.customColors, colorDraft);
      if (highlighter) tools.highlighterColor = known ? known.id : colorDraft;
      else tools.penColor = known ? known.id : colorDraft;
      saveTools(tools);
      closeSettings();
      updateToolbar();
      requestLive();
    }

    // ---- linijka i skala rysunku (od 1.14): ile ma kratka, szacunek skali na ekranie, przyciąganie
    const rulerPanel = h('div', { class: 'drawing__settings', hidden: true, role: 'dialog', 'aria-label': 'Linijka i skala', dataset: { testid: 'drawing-ruler-panel' } });
    let refreshRulerPanel = null;
    function toggleRulerPanel() {
      const open = rulerPanel.hidden;
      closeSettings();
      if (!open) return;
      rulerPanel.hidden = false;
      renderRulerPanel();
    }
    /** Skala rysunku – zapisywana z rysunkiem (liczby na linijce i długość kreski). */
    function setScale(next) {
      const scale = cleanScale(next);
      if (scale.value === drawing.scale.value && scale.unit === drawing.scale.unit) return;
      drawing.scale = scale;
      changed = true;
      updateRulerPill();
      // Odstępy liniuszka są podane także w skali rysunku.
      updateGuidePill();
      refreshGuidePanel?.();
      requestLive();
    }
    function renderRulerPanel() {
      const valueInput = h('input', {
        class: 'input drawing__scale-value', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Ile ma jedna kratka',
        dataset: { testid: 'drawing-scale-value' },
        onInput: (event) => {
          const value = Number(event.target.value.replace(/\s/g, '').replace(',', '.'));
          const valid = Number.isFinite(value) && value > 0;
          event.target.setAttribute('aria-invalid', String(!valid));
          if (!valid) return;
          setScale({ value, unit: drawing.scale.unit });
          refresh(false);
        }
      });
      const units = (system, label) => h('optgroup', { label },
        // Skróty SI są znane; przy imperialnych – także nazwa („ft – stopy”).
        SCALE_UNITS.filter((unit) => unit.system === system).map((unit) => h('option', { value: unit.id }, system === 'si' ? unit.label : `${unit.label} – ${unit.name}`)));
      const unitSelect = h('select', {
        class: 'input input--select drawing__scale-unit', 'aria-label': 'Jednostka', dataset: { testid: 'drawing-scale-unit' },
        onChange: (event) => {
          setScale({ value: drawing.scale.value, unit: event.target.value });
          refresh();
        }
      }, units('si', 'Jednostki SI'), units('imperial', 'Jednostki imperialne'));
      const screenText = h('p', { class: 'field__hint', dataset: { testid: 'drawing-scale-screen' } });
      const snapToggle = toggle({
        checked: tools.rulerSnap, label: 'Przyciąganie zera do przecięć i linii',
        onChange: (checked) => {
          tools.rulerSnap = checked;
          saveTools(tools);
          if (ruler) setRuler(ruler);
        }
      });
      snapToggle.querySelector('input').dataset.testid = 'drawing-ruler-snap';
      const estimate = () => screenScale(drawing.scale, PAPER_STEP * view.scale, pixelsPerInch);
      function refresh(updateInput = true) {
        if (updateInput) {
          valueInput.value = String(drawing.scale.value).replace('.', ',');
          valueInput.removeAttribute('aria-invalid');
        }
        unitSelect.value = drawing.scale.unit;
        const { millimeters, ratio } = estimate();
        screenText.textContent = `Przy powiększeniu ${Math.round(view.zoom * 100)}% kratka ma na tym ekranie ok. ${formatNumber(millimeters)} mm – `
          + `rysunek widać w skali ok. ${formatRatio(ratio)}. To szacunek: przeglądarka nie podaje wielkości ekranu.`;
      }
      replaceChildren(rulerPanel,
        h('h3', { class: 'drawing__settings-title' }, 'Linijka i skala'),
        h('p', { class: 'drawing__settings-label' }, 'Skala rysunku'),
        h('div', { class: 'drawing__scale' }, h('span', null, '1 kratka ='), valueInput, unitSelect),
        screenText,
        h('button', {
          type: 'button', class: 'drawing__chip drawing__chip--block', dataset: { testid: 'drawing-scale-actual' },
          onClick: () => {
            const imperial = SCALE_UNITS.find((unit) => unit.id === drawing.scale.unit)?.system === 'imperial';
            const unit = imperial ? 'in' : 'mm';
            setScale({ value: screenScaleValue(estimate().millimeters, unit), unit });
            refresh();
          }
        }, 'Skala 1:1 – kratka jak na ekranie'),
        h('div', { class: 'drawing__settings-switch' }, snapToggle),
        h('p', { class: 'field__hint' }, 'Liczby na linijce są w tej skali, od zera na środku w obie strony. Zero przy krawędzi linijki '
          + 'przyskakuje do przecięcia kresek albo do linii, a linijka prawie prostopadła do tej linii ustawia się prostopadle. '
          + 'Przycisk ⊥ obok kąta – prostopadle do linii pod zerem. Skala zapisuje się razem z rysunkiem.'));
      refreshRulerPanel = () => refresh(document.activeElement !== valueInput);
      refresh();
    }

    // ---- tło strony (od 1.15): rodzaj, jasność linii, szablon pod kreskami (kalka) i jego ustawianie
    const paperPanel = h('div', { class: 'drawing__settings', hidden: true, role: 'dialog', 'aria-label': 'Tło strony', dataset: { testid: 'drawing-paper-panel' } });
    const templateInput = h('input', {
      type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', hidden: true, dataset: { testid: 'drawing-template-input' },
      onChange: (event) => {
        const [file] = event.target.files;
        event.target.value = '';
        if (file) importTemplate(file);
      }
    });
    function togglePaperPanel() {
      const open = paperPanel.hidden;
      closeSettings();
      if (open) {
        paperPanel.hidden = false;
        renderPaperPanel();
      }
      updateToolbar();
    }
    /** Pięć poziomów jasności: próbki linii od najjaśniejszej. */
    const levelButtons = (current, color, testID, onPick) => h('div', { class: 'drawing__levels', role: 'radiogroup', 'aria-label': 'Jasność' },
      LEVEL_LABELS.map((label, index) => h('button', {
        type: 'button', class: 'drawing__level', role: 'radio', 'aria-label': label, title: label, 'aria-checked': String(index === current),
        style: { '--line': color(index) }, dataset: { testid: `${testID}-${index}` }, onClick: () => onPick(index)
      })));
    const chip = (label, testID, onClick, extra = '') => h('button', { type: 'button', class: `drawing__chip${extra}`, dataset: { testid: testID }, onClick }, label);
    function afterBackground() {
      changed = true;
      updateToolbar();
      requestRender();
      renderPaperPanel();
    }
    function renderPaperPanel() {
      if (paperPanel.hidden) return;
      if (placing) {
        renderPlacement();
        return;
      }
      const parts = [h('h3', { class: 'drawing__settings-title' }, 'Tło strony')];
      if (!drawing.photo) {
        parts.push(h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Rodzaj tła' }, PAPERS.map((paper) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(drawing.paper === paper), dataset: { testid: `drawing-paper-${paper}` },
          onClick: () => {
            drawing.paper = paper;
            afterBackground();
          }
        }, PAPER_LABELS[paper]))));
        if (drawing.paper !== 'plain') {
          parts.push(
            h('p', { class: 'drawing__settings-label' }, h('span', null, 'Jasność linii'), h('span', null, LEVEL_LABELS[drawing.paperLevel].toLowerCase())),
            levelButtons(drawing.paperLevel, (index) => PAPER_COLORS[drawing.paper][index], 'drawing-paper-level', (index) => {
              drawing.paperLevel = index;
              afterBackground();
            }));
        }
      }
      parts.push(h('p', { class: 'drawing__settings-label' }, 'Szablon pod kreskami (kalka)'));
      const template = drawing.template;
      if (!template) {
        parts.push(
          h('div', { class: 'drawing__template-actions' },
            chip('Boisko piłkarskie', 'drawing-template-pitch', () => insertTemplate(fitTemplate({ source: 'pitch', level: DEFAULT_TEMPLATE_LEVEL }, drawing.width, drawing.height), null)),
            chip('Z pliku…', 'drawing-template-file', () => templateInput.click())),
          h('p', { class: 'field__hint' }, 'Kalka leży pod kreskami: boisko albo dowolny wzór linii z obrazu (PNG, JPEG, WebP). Po wstawieniu ustawiasz '
            + 'jej wielkość i miejsce, potem się nie przesuwa – jak kratka. Biel obrazu znika, linie zostają.'));
      } else {
        const missing = template.source === 'image' && !media.template;
        parts.push(
          h('p', { class: 'drawing__template-name', dataset: { testid: 'drawing-template-name' } }, `${TEMPLATE_LABELS[template.source]}${missing ? ' – brak pliku obrazu' : ''}`),
          h('p', { class: 'drawing__settings-label' }, h('span', null, 'Jasność szablonu'), h('span', null, LEVEL_LABELS[template.level].toLowerCase())),
          levelButtons(template.level, (index) => `rgba(29, 29, 31, ${TEMPLATE_ALPHA[index]})`, 'drawing-template-level', (index) => {
            drawing.template = { ...drawing.template, level: index };
            afterBackground();
          }),
          h('div', { class: 'drawing__template-actions' },
            chip('Ustaw wielkość i miejsce', 'drawing-template-place', () => startPlacement()),
            chip('Usuń szablon', 'drawing-template-remove', () => {
              delete drawing.template;
              media.template = null;
              afterBackground();
            }, ' drawing__chip--danger')));
      }
      parts.push(templateInput);
      replaceChildren(paperPanel, ...parts);
    }
    /** Nowy szablon na stronie – od razu ustawianie (wielkość i miejsce). */
    function insertTemplate(template, image) {
      placing = { before: drawing.template ?? null, beforeImage: media.template, beforeScale: drawing.scale, pitchScale: false };
      drawing.template = template;
      media.template = image;
      changed = true;
      // Boisko na rysunku bez własnej skali – skala w metrach od razu (linijka mierzy boisko).
      if (template.source === 'pitch' && drawing.scale.value === 1 && drawing.scale.unit === 'cm') placing.pitchScale = true;
      applyPitchScale();
      paperPanel.hidden = false;
      renderPaperPanel();
      updateToolbar();
      requestRender();
    }
    function startPlacement() {
      const template = drawing.template;
      const scaled = template.source === 'pitch' && drawing.scale.unit === 'm' && Math.abs(drawing.scale.value - pitchScale(template, PAPER_STEP)) < 0.01;
      placing = { before: template, beforeImage: media.template, beforeScale: drawing.scale, pitchScale: scaled };
      renderPaperPanel();
      requestRender();
    }
    /** Skala rysunku według boiska (105 m na szerokość szablonu) – gdy włączona przy ustawianiu boiska. */
    function applyPitchScale() {
      if (!placing || drawing.template?.source !== 'pitch') return;
      drawing.scale = placing.pitchScale
        ? cleanScale({ value: Number(pitchScale(drawing.template, PAPER_STEP).toPrecision(3)), unit: 'm' })
        : placing.beforeScale;
      updateRulerPill();
      updateGuidePill();
    }
    /** Koniec ustawiania: szablon zostaje (keep) albo wraca poprzedni (Anuluj). */
    function finishPlacement(keep) {
      if (!placing) return;
      const { before, beforeImage, beforeScale } = placing;
      placing = null;
      if (!keep) {
        if (before) drawing.template = before;
        else delete drawing.template;
        media.template = beforeImage;
        drawing.scale = beforeScale;
      }
      renderPaperPanel();
      updateToolbar();
      requestRender();
    }
    function renderPlacement() {
      const template = drawing.template;
      const fitted = fitTemplate(template, drawing.width, drawing.height);
      const set = (next) => {
        drawing.template = next;
        changed = true;
        applyPitchScale();
        renderPlacement();
        requestRender();
      };
      const parts = [
        h('h3', { class: 'drawing__settings-title' }, `${TEMPLATE_LABELS[template.source]}: wielkość i miejsce`),
        h('div', { class: 'drawing__placement' },
          h('button', { type: 'button', class: 'drawing__chip drawing__chip--square', 'aria-label': 'Pomniejsz', dataset: { testid: 'drawing-template-smaller' },
            onClick: () => set(scaleTemplate(template, 1 / 1.1, drawing.width, drawing.height)) }, icon('minus', { size: 18 })),
          h('span', { class: 'drawing__placement-size', dataset: { testid: 'drawing-template-size' } }, `${Math.round((template.w / fitted.w) * 100)}%`),
          h('button', { type: 'button', class: 'drawing__chip drawing__chip--square', 'aria-label': 'Powiększ', dataset: { testid: 'drawing-template-larger' },
            onClick: () => set(scaleTemplate(template, 1.1, drawing.width, drawing.height)) }, icon('plus', { size: 18 })),
          chip('Dopasuj', 'drawing-template-fit', () => set(fitted)),
          chip('Wyśrodkuj', 'drawing-template-center', () => set(centerTemplate(template, drawing.width, drawing.height)))),
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Jasność szablonu'), h('span', null, LEVEL_LABELS[template.level].toLowerCase())),
        levelButtons(template.level, (index) => `rgba(29, 29, 31, ${TEMPLATE_ALPHA[index]})`, 'drawing-template-level', (index) => set({ ...template, level: index }))
      ];
      if (template.source === 'pitch') {
        const scaleToggle = toggle({
          checked: placing.pitchScale, label: `Skala rysunku według boiska (105 m): 1 kratka = ${formatNumber(pitchScale(template, PAPER_STEP))} m`,
          onChange: (checked) => {
            placing.pitchScale = checked;
            applyPitchScale();
            requestLive();
          }
        });
        scaleToggle.querySelector('input').dataset.testid = 'drawing-template-scale';
        parts.push(h('div', { class: 'drawing__settings-switch' }, scaleToggle));
      }
      parts.push(
        h('p', { class: 'field__hint' }, 'Przeciągnij szablon na stronie palcem, rysikiem albo myszą (dwa palce nadal powiększają stronę). Po „Gotowe” szablon się nie przesuwa.'),
        h('div', { class: 'drawing__color-footer' },
          h('span', { class: 'drawing__color-code' }),
          chip('Anuluj', 'drawing-template-cancel', () => finishPlacement(false)),
          chip('Gotowe', 'drawing-template-done', () => finishPlacement(true), ' drawing__chip--accent')));
      replaceChildren(paperPanel, ...parts);
    }
    async function importTemplate(file) {
      try {
        const prepared = await prepareImage(file, { name: file.name });
        const image = await loadPicture(prepared);
        if (!image) throw new Error('Nie udało się odczytać obrazu szablonu.');
        insertTemplate(fitTemplate({
          source: 'image', type: prepared.type, width: prepared.width, height: prepared.height, bytes: prepared.bytes, level: DEFAULT_TEMPLATE_LEVEL
        }, drawing.width, drawing.height), image);
      } catch (error) {
        flash(error?.message || 'Nie udało się wczytać szablonu.');
      }
    }

    // ---- kształty (od 1.15): wybór kształtu
    const shapePanel = h('div', { class: 'drawing__settings', hidden: true, role: 'dialog', 'aria-label': 'Kształty', dataset: { testid: 'drawing-shape-panel' } });
    function toggleShapePanel() {
      const open = shapePanel.hidden;
      closeSettings();
      if (!open) return;
      shapePanel.hidden = false;
      renderShapePanel();
    }
    function renderShapePanel() {
      if (shapePanel.hidden) return;
      replaceChildren(shapePanel,
        h('h3', { class: 'drawing__settings-title' }, 'Kształty'),
        h('div', { class: 'drawing__shape-kinds', role: 'radiogroup', 'aria-label': 'Kształt' }, SHAPES.map((kind) => h('button', {
          type: 'button', class: 'drawing__shape-kind', role: 'radio', 'aria-checked': String(kind === tools.shape), dataset: { testid: `drawing-shape-${kind}` },
          onClick: () => {
            tools.shape = kind;
            saveTools(tools);
            closeSettings();
            updateToolbar();
          }
        }, icon(SHAPE_ICONS[kind], { size: 26 }), h('span', null, SHAPE_LABELS[kind])))),
        // Od 1.17: wypełnienie nowych kształtów (i zaznaczonego).
        h('p', { class: 'drawing__settings-label' }, 'Wypełnienie'),
        h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Wypełnienie' }, SHAPE_FILLS.map((fill) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(fill === tools.shapeFill), dataset: { testid: `drawing-fill-default-${fill}` },
          onClick: () => {
            tools.shapeFill = fill;
            saveTools(tools);
            const [only] = selection;
            if (selection.size === 1 && isShape(only) && canFill(only)) fillShape(only, fill);
            renderShapePanel();
          }
        }, SHAPE_FILL_LABELS[fill]))),
        h('p', { class: 'field__hint' }, 'Przeciągnij po stronie – kształt powstaje w prostokącie przeciągnięcia (odcinek i strzałka – od początku do końca); '
          + 'dotknięcie – kształt w tym miejscu. Kolor i grubość – jak pióra; wypełnienie jasne jest przejrzyste. Punkty zaznaczonego kształtu: '
          + 'narożniki i boki – szerokość i wysokość, romb na górnej krawędzi – pochylenie, kółko nad kształtem – obrót, pomarańczowy punkt – '
          + 'wierzchołek trójkąta albo wcięcie trapezu. Wymiary i kąt pochylenia wpiszesz w polach przy ramce, tekst – przyciskiem „Tekst” '
          + 'albo dotknięciem zaznaczonego kształtu.'));
      updateToolbar();
    }

    // ---- liniuszek (od 1.15): odstęp i kąt linii, linie poprzeczne, przyciąganie
    const guidePanel = h('div', { class: 'drawing__settings', hidden: true, role: 'dialog', 'aria-label': 'Liniuszek', dataset: { testid: 'drawing-guide-panel' } });
    let refreshGuidePanel = null;
    function toggleGuidePanel() {
      const open = guidePanel.hidden;
      closeSettings();
      if (!open) return;
      guidePanel.hidden = false;
      renderGuidePanel();
    }
    function renderGuidePanel() {
      const settings = tools.guide;
      const range = (key, min, max, step, label) => h('input', {
        type: 'range', class: 'drawing__range', min, max, step, 'aria-label': label, dataset: { testid: `drawing-guide-${key}` },
        onInput: (event) => {
          settings[key] = Number(event.target.value);
          changedGuide();
        }
      });
      const ranges = {
        spacing: range('spacing', 0.25, 6, 0.25, 'Odstęp linii'),
        angle: range('angle', -90, 90, 1, 'Kąt linii'),
        crossSpacing: range('crossSpacing', 0.25, 12, 0.25, 'Odstęp linii poprzecznych'),
        crossAngle: range('crossAngle', 10, 170, 1, 'Kąt linii poprzecznych')
      };
      const texts = Object.fromEntries(Object.keys(ranges).map((key) => [key, h('span')]));
      const squares = (value) => (Number.isInteger(value) ? plural(value, 'kratka', 'kratki', 'kratek') : `${formatNumber(value)} kratki`);
      const quick = (key, values, unit = '°') => h('div', { class: 'drawing__quick' }, values.map((value) => chip(`${value}${unit}`, `drawing-guide-${key}-${value}`, () => {
        settings[key] = value;
        changedGuide();
      })));
      const crossToggle = toggle({ checked: settings.cross, label: 'Linie poprzeczne', onChange: (checked) => { settings.cross = checked; changedGuide(); } });
      crossToggle.querySelector('input').dataset.testid = 'drawing-guide-cross';
      const snapToggle = toggle({ checked: settings.snap, label: 'Przyciąganie kreski do linii', onChange: (checked) => { settings.snap = checked; changedGuide(); } });
      snapToggle.querySelector('input').dataset.testid = 'drawing-guide-snap';
      const crossBlock = h('div', null,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Odstęp poprzecznych'), texts.crossSpacing), ranges.crossSpacing,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Kąt poprzecznych względem linii'), texts.crossAngle), ranges.crossAngle,
        quick('crossAngle', [60, 75, 90]));
      function refresh() {
        for (const [key, input] of Object.entries(ranges)) {
          input.value = String(settings[key]);
          input.style.setProperty('--fill-to', `${((settings[key] - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`);
        }
        texts.spacing.textContent = `${squares(settings.spacing)} · ${formatLength(settings.spacing * PAPER_STEP, drawing.scale)}`;
        texts.angle.textContent = `${settings.angle}°`;
        texts.crossSpacing.textContent = `${squares(settings.crossSpacing)} · ${formatLength(settings.crossSpacing * PAPER_STEP, drawing.scale)}`;
        texts.crossAngle.textContent = settings.crossAngle === 90 ? '90° – prostopadle' : `${settings.crossAngle}°`;
        crossBlock.hidden = !settings.cross;
      }
      function changedGuide() {
        saveTools(tools);
        refresh();
        updateGuidePill();
        requestLive();
      }
      replaceChildren(guidePanel,
        h('h3', { class: 'drawing__settings-title' }, 'Liniuszek'),
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Odstęp linii'), texts.spacing), ranges.spacing,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Kąt linii'), texts.angle), ranges.angle,
        quick('angle', [0, 45, 90]),
        h('div', { class: 'drawing__settings-switch' }, crossToggle),
        crossBlock,
        h('div', { class: 'drawing__settings-switch' }, snapToggle),
        h('p', { class: 'field__hint' }, 'Kreska zaczęta przy linii i prowadzona wzdłuż niej biegnie prosto po linii (także po poprzecznej); '
          + 'w innym kierunku – zwykła kreska. Kółko na stronie przesuwa liniuszek (przyskakuje do węzłów kratki). Liniuszek nie trafia do rysunku.'));
      refreshGuidePanel = refresh;
      refresh();
    }
    function toggleGuide() {
      if (guide) {
        guide = null;
        guidePanel.hidden = true;
        refreshGuidePanel = null;
      } else {
        // Kółko na środku widocznej części strony, w węźle kratki.
        const center = visibleCenter();
        const node = (value, size) => Math.min(size, Math.max(0, Math.round(value / PAPER_STEP) * PAPER_STEP));
        guide = { x: node(center.x, drawing.width), y: node(center.y, drawing.height) };
      }
      measured = null;
      updateToolbar();
      requestLive();
    }

    const topBar = h('div', { class: 'drawing__top' }, toolbar, settings, colorPanel, rulerPanel, paperPanel, shapePanel, guidePanel);
    function toggleSettings() {
      const open = settings.hidden;
      closeSettings();
      settings.hidden = !open;
      renderSettings();
    }
    /** Zamyka panele pod paskiem: ustawienia pióra, własny kolor (i pipetkę), linijkę i skalę. */
    function closeSettings() {
      settings.hidden = true;
      refreshSettings = null;
      colorPanel.hidden = true;
      syncColor = null;
      picking = false;
      pickHover = null;
      rulerPanel.hidden = true;
      refreshRulerPanel = null;
      shapePanel.hidden = true;
      guidePanel.hidden = true;
      refreshGuidePanel = null;
      // Zamknięcie panelu tła w trakcie ustawiania szablonu – szablon zostaje tam, gdzie jest.
      if (placing) finishPlacement(true);
      paperPanel.hidden = true;
    }
    const panelOpen = () => [settings, colorPanel, rulerPanel, paperPanel, shapePanel, guidePanel].some((panel) => !panel.hidden);

    function afterHistory() {
      changed = true;
      // Po cofnięciu zaznaczone kreski mogło zastąpić co innego – zaznaczenie znika.
      selection = new Set();
      selectionKind = 'whole';
      updateToolbar();
      requestRender();
    }
    /** Cofnij albo ponów; zaznaczony fragment najpierw wraca w całości (bez kroku cofania). */
    function stepHistory(redo) {
      clearSelection();
      if (redo ? history.redo() : history.undo()) afterHistory();
      else updateToolbar();
    }

    // ---- linijka
    function toggleRuler() {
      if (ruler) {
        ruler = null;
        rulerPanel.hidden = true;
        refreshRulerPanel = null;
      } else {
        // Na środku widocznej części strony, poziomo.
        const center = { x: (view.width / 2 - view.x) / view.scale, y: (view.height / 2 - view.y) / view.scale };
        ruler = { x: Math.min(drawing.width, Math.max(0, center.x)), y: Math.min(drawing.height, Math.max(0, center.y)), angle: 0, snap: null };
      }
      measured = null;
      updateToolbar();
      requestLive();
    }
    const setRuler = (next) => {
      ruler = settleRuler(next);
      measured = null;
      updateRulerPill();
      requestLive();
    };
    /** ⊥: linijka prostopadle do linii pod zerem (przy jednej z krawędzi), zerem na tej linii. */
    function perpendicularRuler() {
      if (!ruler) return;
      const half = rulerHalf();
      const radius = (ZERO_SNAP * 1.5) / view.scale;
      let best = null;
      for (const side of [-1, 1]) {
        const zero = rulerPoint(ruler, 0, side * half);
        // Każda kreska osobno – na przecięciu liczy się najbliższa linia, nie punkt przecięcia.
        for (const stroke of drawing.strokes) {
          const found = snapToStrokes([stroke], zero.x, zero.y, radius);
          if (found?.kind !== 'line') continue;
          const distance = Math.hypot(found.x - zero.x, found.y - zero.y);
          if (!best || distance < best.distance) best = { ...found, side, distance };
        }
      }
      if (!best) {
        flash('Pod zerem linijki nie ma linii – przesuń linijkę, aż zero przy krawędzi trafi na linię.');
        return;
      }
      ruler = zeroAt(best, perpendicularAngle(best.angle, ruler.angle), true);
      measured = null;
      updateRulerPill();
      requestLive();
    }

    // ---- zaznaczenie
    const orderedSelection = () => drawing.strokes.filter((stroke) => selection.has(stroke));
    /** Kreski przecięte przy zaznaczaniu fragmentu wracają w całości – zaznaczenie bez skutku nie zostawia śladu. */
    function dropRegion() {
      if (!regionPending) return;
      regionPending = false;
      history.rollback();
      requestRender();
    }
    function clearSelection() {
      dropRegion();
      selectionKind = 'whole';
      if (snip) {
        snip = null;
        requestLive();
      }
      if (selection.size === 0) return;
      selection = new Set();
      requestLive();
    }
    /** Koniec zmiany: krok cofania (razem z przecięciem kresek zaznaczonego fragmentu). */
    function commitStep() {
      regionPending = false;
      if (history.commit()) changed = true;
    }
    const selectionHit = (point) => {
      const bounds = selectionBounds([...selection]);
      const pad = SELECTION_PAD / view.scale;
      return Boolean(bounds) && point.x >= bounds.minX - pad && point.x <= bounds.maxX + pad && point.y >= bounds.minY - pad && point.y <= bounds.maxY + pad;
    };
    /**
     * Zaznaczenie fragmentów (od 1.14): kreski przecięte brzegiem obszaru zastępują kawałki – w środku
     * (zaznaczone) i poza nim. Zmiana trafia do historii dopiero z przesunięciem albo usunięciem;
     * zaznaczenie zdjęte bez skutku przywraca całe kreski. Pola tekstowe i wzory – tylko w całości.
     */
    function selectRegion(polygon) {
      const xs = polygon.filter((_, index) => index % 2 === 0);
      const ys = polygon.filter((_, index) => index % 2 === 1);
      const area = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
      history.begin();
      const inside = [];
      let cut = false;
      for (let index = drawing.strokes.length - 1; index >= 0; index -= 1) {
        const stroke = drawing.strokes[index];
        const bounds = strokeBounds(stroke);
        if (bounds.maxX < area.minX || bounds.minX > area.maxX || bounds.maxY < area.minY || bounds.minY > area.maxY) continue;
        const parts = splitByPolygon(stroke, polygon);
        if (!parts) continue;
        if (parts.inside.length !== 1 || parts.inside[0] !== stroke) {
          drawing.strokes.splice(index, 1, ...parts.outside, ...parts.inside);
          cut = true;
        }
        inside.push(...parts.inside);
      }
      if (cut && inside.length > 0) regionPending = true;
      else if (cut) history.rollback();
      else history.commit();
      selection = new Set(inside);
      selectionKind = 'region';
    }
    /** Zastępuje zaznaczone kreski przesuniętymi – jeden krok cofania. */
    function moveSelection(dx, dy) {
      const moved = new Set();
      history.begin();
      drawing.strokes.forEach((stroke, index) => {
        if (!selection.has(stroke)) return;
        drawing.strokes[index] = translateStroke(stroke, dx, dy);
        moved.add(drawing.strokes[index]);
      });
      commitStep();
      selection = moved;
      updateToolbar();
      requestRender();
    }
    /** Kopie zaznaczonych kresek obok, zaznaczone. Fragment – kopia samego wnętrza (oryginał zostaje w całości). */
    function duplicateSelection() {
      const items = orderedSelection();
      if (items.length === 0) return;
      dropRegion();
      history.begin();
      const copies = items.map((stroke) => translateStroke(stroke, DUPLICATE_OFFSET, DUPLICATE_OFFSET));
      drawing.strokes.push(...copies);
      commitStep();
      selection = new Set(copies);
      updateToolbar();
      requestRender();
    }
    function deleteSelection() {
      if (selection.size === 0) return;
      history.begin();
      for (let index = drawing.strokes.length - 1; index >= 0; index -= 1) {
        if (selection.has(drawing.strokes[index])) drawing.strokes.splice(index, 1);
      }
      commitStep();
      selection = new Set();
      selectionKind = 'whole';
      updateToolbar();
      requestRender();
    }
    /**
     * Kopiuj (od 1.14): do schowka rysunku – też do innego rysunku – i jako obraz do schowka systemu.
     * Wycinek (od 1.17) – tylko obraz w schowku systemu (wkleisz go w notatce albo w innej aplikacji).
     */
    function copySelection(done = 'Skopiowano') {
      if (snip) {
        const area = snip;
        copyImage(mediaReady().then(() => canvasBlob(snipCanvas(area)))).then((copied) => flash(copied
          ? 'Skopiowano wycinek jako obraz – wkleisz go w tekście notatki albo w innej aplikacji.'
          : 'Ta przeglądarka nie pozwala skopiować obrazu – użyj „Osadź”, żeby wycinek trafił do notatki.'));
        return false;
      }
      const items = orderedSelection();
      if (items.length === 0) return false;
      writeClipboard(items);
      copyImage(canvasBlob(strokesCanvas(items)));
      pasteCount = 0;
      updateToolbar();
      flash(`${done} – „Wklej” na pasku zaznaczania albo Ctrl+V, także w innym rysunku.`);
      return true;
    }
    /** Zdjęcie i szablon z pliku wczytane – dopiero wtedy obraz wycinka jest pełny. */
    const mediaReady = () => Promise.all([pictureReady, templateReady]);
    /** Obraz wycinka: wszystko, co widać na stronie w obszarze (tło, kratka, zdjęcie, szablon, kreski), poza nim – przezroczyście. */
    function snipCanvas(area) {
      const { polygon } = area;
      return areaCanvas(area.bounds, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(polygon[0], polygon[1]);
        for (let index = 2; index < polygon.length; index += 2) ctx.lineTo(polygon[index], polygon[index + 1]);
        ctx.closePath();
        ctx.clip();
        paintDrawing(ctx, drawing, media);
      });
    }
    /** Wycinek z obrysu: obszar przycięty do strony; poza stroną – nic. */
    function makeSnip(polygon, kind) {
      const xs = polygon.filter((_, index) => index % 2 === 0);
      const ys = polygon.filter((_, index) => index % 2 === 1);
      const bounds = {
        minX: Math.max(0, Math.min(...xs)), minY: Math.max(0, Math.min(...ys)),
        maxX: Math.min(drawing.width, Math.max(...xs)), maxY: Math.min(drawing.height, Math.max(...ys))
      };
      if (bounds.maxX - bounds.minX < 1 || bounds.maxY - bounds.minY < 1) {
        flash('Wycinek jest poza stroną.');
        return null;
      }
      return { polygon: [...polygon], bounds, kind };
    }
    let embedding = false;
    /**
     * Osadź (od 1.17): zaznaczone kreski i elementy (na białym tle) albo wycinek jako nowy obraz
     * notatki; zaznaczenie zostaje. Wycinek ze zdjęciem w prostokącie – JPEG, inne – PNG.
     */
    async function embedSelection() {
      if (!onEmbed || embedding) return;
      const area = snip;
      const items = area ? null : orderedSelection();
      if (!area && items.length === 0) return;
      embedding = true;
      embedButton.disabled = true;
      try {
        await mediaReady();
        const canvas = area ? snipCanvas(area) : strokesCanvas(items);
        const blob = await canvasBlob(canvas, area && drawing.photo && area.kind === 'rect' ? 'image/jpeg' : 'image/png');
        const label = await onEmbed({ blob, width: canvas.width, height: canvas.height });
        flash(`Osadzono w notatce jako „${label}”.`);
      } catch (error) {
        flash(error?.message || 'Nie udało się osadzić obrazu w notatce.');
      } finally {
        embedding = false;
        embedButton.disabled = false;
      }
    }

    // ---- wypełnienie i tekst kształtu (od 1.17)
    /** Wypełnienie zaznaczonego kształtu – menu z wyborem. */
    function chooseFill() {
      const [only] = selection;
      if (selection.size !== 1 || !isShape(only) || !canFill(only)) return;
      openMenu({
        title: 'Wypełnienie kształtu',
        items: SHAPE_FILLS.map((fill) => ({
          label: SHAPE_FILL_LABELS[fill], checked: (only.fill ?? 'none') === fill, testID: `drawing-fill-${fill}`, onSelect: () => fillShape(only, fill)
        }))
      });
    }
    function fillShape(shape, fill) {
      if (!drawing.strokes.includes(shape) || (shape.fill ?? 'none') === fill) return;
      const next = { ...shape };
      if (fill === 'none') delete next.fill;
      else next.fill = fill;
      // Pełne wypełnienie w kolorze tekstu – tekst biały, żeby było go widać.
      if (fill === 'solid' && next.label?.color === next.color) next.label = { ...next.label, color: '#ffffff' };
      replaceShape(shape, next);
      updateToolbar();
      requestRender();
    }
    /** Tekst na kształcie: wpisanie albo poprawka (pusty – usuwa tekst); wielkość i kolor jak w polu tekstowym. */
    function editShapeLabel(shape) {
      const { label } = shape;
      const choice = {
        size: label ? sizeIndex(label.size) : tools.textSize,
        color: label ? inkChoice(label.color) : shape.fill === 'solid' ? '#ffffff' : inkChoice(shape.color)
      };
      const options = elementOptions(choice);
      let value = label?.text ?? '';
      let pending = null;
      let sheet = null;
      const input = textArea({
        value, rows: 3, testID: 'drawing-shape-text-input',
        onInput: (text) => {
          value = text;
          sheet?.setCanSubmit(Boolean(label) || value.trim() !== '');
        }
      });
      sheet = openFormSheet({
        title: 'Tekst na kształcie',
        submitLabel: label ? 'Zapisz' : 'Wstaw',
        build: () => [
          field('Tekst', input, {
            hint: label ? 'Pusty tekst usuwa go z kształtu.' : 'Tekst jest na środku kształtu (odcinka – nad nim) i przesuwa się, obraca i zmienia szerokość razem z nim.'
          }),
          options
        ],
        onSubmit: () => { pending = value; },
        onClose: () => {
          if (pending !== null) applyShapeLabel(shape, pending, choice);
        }
      });
      sheet.setCanSubmit(Boolean(label) || value.trim() !== '');
      requestAnimationFrame(() => input.focus());
    }
    function applyShapeLabel(shape, text, choice) {
      if (!drawing.strokes.includes(shape)) return;
      const value = text.slice(0, LABEL_TEXT_MAX);
      const next = { ...shape };
      if (value.trim() === '') {
        if (!shape.label) return;
        delete next.label;
      } else {
        tools.textSize = choice.size;
        saveTools(tools);
        next.label = { text: value, size: TEXT_SIZES[choice.size], color: inkHex(choice.color), width: 1, height: 1 };
      }
      replaceShape(shape, measureLabel(next));
      updateToolbar();
      requestRender();
    }
    /** Wklej: na środku widocznej części strony (kolejne wklejenia – trochę niżej), zaznaczone. */
    function paste() {
      const content = readClipboard();
      if (!content) return;
      clearSelection();
      const bounds = selectionBounds(content.strokes);
      const center = visibleCenter();
      const shift = pasteCount * DUPLICATE_OFFSET;
      pasteCount += 1;
      const dx = Math.min(drawing.width, Math.max(0, center.x)) - (bounds.minX + bounds.maxX) / 2 + shift;
      const dy = Math.min(drawing.height, Math.max(0, center.y)) - (bounds.minY + bounds.maxY) / 2 + shift;
      // Pola tekstowe i wzory mierzone od nowa (czcionki tego urządzenia).
      const pasted = content.strokes.map((stroke) => translateStroke(isShape(stroke) ? measureLabel(stroke)
        : isElement(stroke) ? { ...stroke, ...measureElement(stroke) } : stroke, dx, dy));
      history.begin();
      drawing.strokes.push(...pasted);
      commitStep();
      if (tool !== 'select') setTool('select');
      selection = new Set(pasted);
      selectionKind = 'whole';
      updateToolbar();
      requestRender();
    }
    // ---- pola tekstowe i wzory
    /** Środek widocznej części strony (pod paskiem narzędzi) – tam trafia nowe pole albo wzór. */
    const visibleCenter = () => ({ x: (view.width / 2 - view.x) / view.scale, y: ((view.top + view.height) / 2 - view.y) / view.scale });
    const sizeIndex = (size) => TEXT_SIZES.reduce((best, value, index) => (Math.abs(value - size) < Math.abs(TEXT_SIZES[best] - size) ? index : best), 0);
    /** Kolor elementu: nazwa z palety tuszu albo własny #rrggbb (od 1.14). */
    const inkChoice = (hex) => INK_COLORS.find((color) => color.hex === hex)?.id ?? (isHexColor(hex) ? hex : tools.penColor);

    /** Wielkość i kolor pola tekstowego albo wzoru (w oknie wstawiania i poprawiania). */
    function elementOptions(choice) {
      const colors = [
        ...INK_COLORS.map((color) => ({ value: color.id, hex: color.hex, label: color.label, testID: `drawing-element-color-${color.id}` })),
        ...tools.customColors.map((hex, index) => ({ value: hex, hex, label: `Własny kolor ${hex.toUpperCase()}`, testID: `drawing-element-color-custom-${index}` }))
      ];
      if (isHexColor(choice.color) && !colors.some((color) => color.value === choice.color)) {
        colors.push({ value: choice.color, hex: choice.color, label: `Kolor ${choice.color.toUpperCase()}`, testID: 'drawing-element-color-own' });
      }
      const swatchButtons = colors.map((color) => h('button', {
        type: 'button', class: 'drawing__swatch', style: { '--swatch': color.hex }, 'aria-label': color.label, title: color.label,
        'aria-pressed': String(color.value === choice.color), dataset: { color: color.value, testid: color.testID },
        onClick: () => {
          choice.color = color.value;
          for (const button of swatchButtons) button.setAttribute('aria-pressed', String(button.dataset.color === color.value));
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
      // Nowy element zastępuje zaznaczenie (zaznaczony fragment wraca w całości).
      if (!element) clearSelection();
      const choice = { size: element ? sizeIndex(element.size) : tools.textSize, color: element ? inkChoice(element.color) : tools.penColor };
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
        selectionKind = 'whole';
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
      const overlapping = (top) => drawing.strokes.filter((item) => isElement(item) && !isShape(item)
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
      commitStep();
      selection = new Set();
      selectionKind = 'whole';
      updateToolbar();
      requestRender();
    }

    function selectAll() {
      if (tool !== 'select') setTool('select');
      clearSelection();
      selection = new Set(drawing.strokes);
      requestLive();
    }

    // ---- wskaźniki: rysowanie, gumka, zaznaczanie, linijka, pipetka, przesuwanie i powiększanie
    // `active` – jedna czynność jednym wskaźnikiem (kreska, gumka, prostokąt albo lasso zaznaczania,
    // przesuwanie zaznaczenia, linijka, pipetka); `touches` i `gesture` – palce przesuwające stronę albo linijkę.
    const touches = new Map();
    let gesture = null;
    const local = (event) => ({ clientX: event.clientX, clientY: event.clientY });

    const usesEraser = (event) => tool === 'eraser' || (event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) === 32));
    const pointWidth = (event) => {
      if (active.stroke.tool === 'highlighter') return HIGHLIGHTER_WIDTHS[tools.highlighterWidth];
      return penWidth(active.pressure ? event.pressure : 0.5, tools.penWidths[tools.penWidth], active.pressure ? tools.sensitivity : 'off');
    };
    /** Punkt kreski: przy linijce – rzut na prostą wzdłuż jej krawędzi (i zasięg kreski wzdłuż linijki – długość). */
    const strokePoint = (event) => {
      const point = toDrawing(event);
      const { edge } = active;
      if (!edge) return point;
      const { along } = rulerOffset(edge.ruler, point.x, point.y);
      edge.along = along;
      edge.from = Math.min(edge.from, along);
      edge.to = Math.max(edge.to, along);
      return rulerPoint(edge.ruler, along, edge.across);
    };
    function startStroke(event) {
      const highlighter = tool === 'highlighter';
      const stroke = { tool: highlighter ? 'highlighter' : 'pen', color: highlighter ? highlighterHex(tools.highlighterColor) : inkHex(tools.penColor), points: [] };
      active = { kind: 'stroke', id: event.pointerId, touch: event.pointerType === 'touch', stroke, last: null, pressure: event.pointerType === 'pen', edge: null };
      if (ruler) {
        // Kreska zaczęta na linijce albo przy niej biegnie wzdłuż bliższej krawędzi.
        const point = toDrawing(event);
        const { across } = rulerOffset(ruler, point.x, point.y);
        const half = rulerHalf();
        if (Math.abs(across) <= half + RULER_SNAP / view.scale) {
          active.edge = { ruler: { ...ruler }, across: (across < 0 ? -1 : 1) * half, along: 0, from: Infinity, to: -Infinity };
        }
      }
      // Liniuszek (od 1.15): kierunek kreski wiadomo dopiero po kilku pikselach – wtedy decyzja.
      if (!active.edge && guide && tools.guide.snap) active.guidePending = { start: toDrawing(event), raw: [] };
      extendStroke(event);
    }
    /**
     * Kreska odsunięta od początku o kilka px: gdy zaczęła się przy linii liniuszka i biegnie wzdłuż
     * niej (do 20°), cała – od początku – leży na tej linii, a dalsze punkty są na nią rzutowane.
     */
    function decideGuide(raw) {
      const pending = active.guidePending;
      const { start } = pending;
      if (Math.hypot(raw.x - start.x, raw.y - start.y) * view.scale < GUIDE_DECIDE) return false;
      active.guidePending = null;
      const direction = Math.atan2(raw.y - start.y, raw.x - start.x);
      let best = null;
      for (const family of guideFamilies()) {
        const line = nearestGuideLine(family, start.x, start.y);
        const off = lineAngleDifference(direction, family.angle);
        if (line.distance * view.scale > GUIDE_SNAP || off > GUIDE_ANGLE) continue;
        if (!best || off < best.off) best = { line, off };
      }
      if (!best) return false;
      const edge = { ruler: { x: best.line.x, y: best.line.y, angle: best.line.angle }, across: 0, along: 0, from: Infinity, to: -Infinity, guide: true };
      active.edge = edge;
      active.stroke.points = [];
      active.last = null;
      for (const point of pending.raw) {
        const { along } = rulerOffset(edge.ruler, point.x, point.y);
        edge.along = along;
        edge.from = Math.min(edge.from, along);
        edge.to = Math.max(edge.to, along);
        const next = { ...rulerPoint(edge.ruler, along, 0), w: point.w };
        addPoint(active.stroke, next);
        active.last = next;
      }
      return true;
    }
    function extendStroke(event) {
      const events = event.getCoalescedEvents?.() ?? [];
      for (const item of events.length > 0 ? events : [event]) {
        const raw = { ...strokePoint(item), w: pointWidth(item) };
        if (active.guidePending) {
          active.guidePending.raw.push(raw);
          if (decideGuide(raw)) continue;
        }
        const point = smoothPoint(active.last, raw, active.stroke.tool === 'pen' && !active.edge ? tools.smoothing : 0);
        addPoint(active.stroke, point);
        active.last = point;
      }
      if (active.edge) {
        measured = active.edge.to - active.edge.from;
        updateRulerPill();
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
    /** Zaznaczanie: przeciągnięcie zaznaczenia – przesuwanie; poza nim – obrys. `snipping` – prawy przycisk (wycinek, od 1.17). */
    function startSelect(event, snipping = false) {
      const point = toDrawing(event);
      if (!snipping && selectionHit(point)) {
        active = { kind: 'move', id: event.pointerId, touch: event.pointerType === 'touch', start: point, dx: 0, dy: 0, client: local(event) };
        requestRender();
        return;
      }
      clearSelection();
      const common = { id: event.pointerId, touch: event.pointerType === 'touch', start: point, client: local(event), snip: snipping };
      active = tools.selectShape === 'lasso'
        ? { kind: 'lasso', ...common, polygon: [point.x, point.y] }
        : { kind: 'marquee', ...common, rect: { x0: point.x, y0: point.y, x1: point.x, y1: point.y } };
      requestLive();
    }
    function startRuler(event, kind) {
      const point = toDrawing(event);
      // Linijka z zerem na linii albo przecięciu obraca się wokół tego punktu (zero zostaje na miejscu).
      const pivot = kind === 'ruler-rotate' && ruler.snap ? { x: ruler.snap.x, y: ruler.snap.y, side: ruler.snap.side } : null;
      const origin = pivot ?? ruler;
      const grab = Math.atan2(point.y - origin.y, point.x - origin.x) - ruler.angle;
      active = { kind, id: event.pointerId, touch: event.pointerType === 'touch', start: point, ruler: { ...ruler }, grab, pivot };
    }
    function startPick(event) {
      try {
        live.setPointerCapture(event.pointerId);
      } catch {
        // przechwycenie nie jest konieczne
      }
      active = { kind: 'pick', id: event.pointerId, touch: event.pointerType === 'touch', client: local(event) };
      pickAt(event);
      requestLive();
    }
    /** Styl nowego kształtu: kolor pióra, średnia grubość wybranej grubości pióra i (od 1.17) wypełnienie. */
    const shapeStyle = () => {
      const width = tools.penWidths[tools.penWidth];
      return { color: inkHex(tools.penColor), size: Math.round(((width.min + width.max) / 2) * 10) / 10, fill: tools.shapeFill };
    };
    const common = (event, point) => ({ id: event.pointerId, touch: event.pointerType === 'touch', start: point, client: local(event) });
    /** Kształty: przeciągnięcie zaznaczonego kształtu przesuwa go, gdzie indziej – nowy kształt. */
    function startShape(event) {
      const point = toDrawing(event);
      const [only] = selection;
      if (selection.size === 1 && isShape(only) && (shapeContains(only, point.x, point.y) || touchesShape(only, point.x, point.y, HANDLE_HIT / view.scale))) {
        active = { kind: 'move', ...common(event, point), dx: 0, dy: 0 };
        requestRender();
        return;
      }
      const hadSelection = selection.size > 0;
      clearSelection();
      active = { kind: 'shape-new', ...common(event, point), shape: null, moved: false, hadSelection };
    }
    function startShapeEdit(event, handle) {
      active = { kind: 'shape-edit', ...common(event, toDrawing(event)), handle: handle.id, original: handle.shape, preview: handle.shape, moved: false };
      requestRender();
    }
    /**
     * Pole wymiaru do punktu konstrukcyjnego dotkniętego bez przeciągania (od 1.17): romb – kąt
     * pochylenia, górny i dolny bok – wysokość, boczne i narożniki – szerokość, koniec odcinka – długość.
     */
    const HANDLE_FIELDS = { skew: 'skew', n: 'height', s: 'height', e: 'width', w: 'width', nw: 'width', ne: 'width', sw: 'width', se: 'width', start: 'length', end: 'length' };
    function startGuideMove(event) {
      active = { kind: 'guide-move', ...common(event, toDrawing(event)), origin: { ...guide } };
    }
    function startTemplateMove(event) {
      try {
        live.setPointerCapture(event.pointerId);
      } catch {
        // przechwycenie nie jest konieczne
      }
      active = { kind: 'template-move', ...common(event, toDrawing(event)), origin: { x: drawing.template.x, y: drawing.template.y } };
    }
    /** Poprawiony kształt zamiast poprzedniego – jeden krok cofania; zostaje zaznaczony. */
    function replaceShape(original, next) {
      const index = drawing.strokes.indexOf(original);
      if (index < 0) return;
      history.begin();
      drawing.strokes[index] = next;
      commitStep();
      selection = new Set([next]);
      selectionKind = 'whole';
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
        case 'lasso': {
          const { polygon } = active;
          if (Math.hypot(point.x - polygon.at(-2), point.y - polygon.at(-1)) * view.scale >= LASSO_STEP) {
            polygon.push(point.x, point.y);
            requestLive();
          }
          break;
        }
        case 'move':
          active.dx = point.x - active.start.x;
          active.dy = point.y - active.start.y;
          requestLive();
          break;
        case 'ruler-move':
          setRuler({ x: active.ruler.x + point.x - active.start.x, y: active.ruler.y + point.y - active.start.y, angle: active.ruler.angle });
          break;
        case 'ruler-rotate': {
          const origin = active.pivot ?? active.ruler;
          const angle = Math.atan2(point.y - origin.y, point.x - origin.x) - active.grab;
          if (!active.pivot) {
            setRuler({ x: origin.x, y: origin.y, angle });
            break;
          }
          const offset = rulerPoint({ x: 0, y: 0, angle }, 0, active.pivot.side * rulerHalf());
          setRuler({ x: origin.x - offset.x, y: origin.y - offset.y, angle });
          break;
        }
        case 'pick':
          active.client = local(event);
          pickAt(event);
          requestLive();
          break;
        case 'shape-new':
          if (Math.hypot(point.x - active.start.x, point.y - active.start.y) * view.scale >= TAP_SLOP) active.moved = true;
          if (active.moved) active.shape = shapeFromDrag(tools.shape, active.start, point, shapeStyle(), { tap: 0 });
          requestLive();
          break;
        case 'shape-edit':
          // Drobny ruch to jeszcze dotknięcie (pole wymiaru), nie przeciąganie punktu.
          if (!active.moved && Math.hypot(point.x - active.start.x, point.y - active.start.y) * view.scale < TAP_SLOP) break;
          active.moved = true;
          active.preview = measureLabel(moveShapeHandle(active.original, active.handle, point));
          requestLive();
          break;
        case 'guide-move': {
          // Kółko liniuszka przyskakuje do węzłów kratki (do 8 px).
          const snap = (value) => {
            const node = Math.round(value / PAPER_STEP) * PAPER_STEP;
            return Math.abs(node - value) * view.scale <= 8 ? node : value;
          };
          guide = { x: snap(active.origin.x + point.x - active.start.x), y: snap(active.origin.y + point.y - active.start.y) };
          requestLive();
          break;
        }
        case 'template-move':
          drawing.template = {
            ...drawing.template,
            x: Math.round((active.origin.x + point.x - active.start.x) * 10) / 10,
            y: Math.round((active.origin.y + point.y - active.start.y) * 10) / 10
          };
          changed = true;
          requestRender();
          break;
        default:
          break;
      }
    }
    /** Koniec prostokąta albo lassa: dotknięcie – kreska w tym miejscu; obrys – całe kreski albo fragmenty. */
    function finishOutline(done) {
      const polygon = done.kind === 'lasso' ? done.polygon : rectPolygon(done.rect);
      const xs = polygon.filter((_, index) => index % 2 === 0);
      const ys = polygon.filter((_, index) => index % 2 === 1);
      if ((Math.max(...xs) - Math.min(...xs)) * view.scale < TAP_SLOP && (Math.max(...ys) - Math.min(...ys)) * view.scale < TAP_SLOP) {
        // Dotknięcie kreski zaznacza ją (najwyższą w tym miejscu).
        const [top] = strokesAt(drawing.strokes, done.start.x, done.start.y, SELECTION_PAD / view.scale);
        // Dotknięcie pustego środka kształtu też go zaznacza (najwyższego).
        const inside = drawing.strokes.findLastIndex((stroke) => isShape(stroke) && shapeContains(stroke, done.start.x, done.start.y));
        const index = top ?? (inside >= 0 ? inside : undefined);
        selection = new Set(index === undefined ? [] : [drawing.strokes[index]]);
        selectionKind = 'whole';
        return;
      }
      if (selectModeOf(done) === 'snip') {
        snip = makeSnip(polygon, done.kind);
        selection = new Set();
        return;
      }
      if (selectModeOf(done) === 'region') {
        selectRegion(polygon);
        return;
      }
      const found = done.kind === 'lasso' ? strokesInPolygon(drawing.strokes, polygon) : strokesInRect(drawing.strokes, done.rect);
      selection = new Set(found.map((index) => drawing.strokes[index]));
      selectionKind = 'whole';
    }
    function finishActive(cancelled = false) {
      if (!active) return;
      const done = active;
      active = null;
      let focusField = null;
      if (done.kind === 'stroke') {
        if (!cancelled && done.stroke.points.length >= 3) {
          history.add(done.stroke);
          changed = true;
        } else if (done.edge) {
          measured = null;
        }
      } else if (done.kind === 'erase') {
        commitStep();
        // Rysikiem z gumką przy zaznaczaniu: starte kreski wypadają z zaznaczenia.
        if (selection.size > 0) selection = new Set(drawing.strokes.filter((stroke) => selection.has(stroke)));
      } else if ((done.kind === 'marquee' || done.kind === 'lasso') && !cancelled) {
        finishOutline(done);
      } else if (done.kind === 'shape-new' && !cancelled) {
        // Dotknięcie przy zaznaczonym kształcie tylko je zdejmuje; inaczej – kształt (dotknięcie – domyślnej wielkości).
        if (done.moved || !done.hadSelection) {
          const shape = done.shape ?? shapeFromDrag(tools.shape, done.start, done.start, shapeStyle());
          history.add(shape);
          changed = true;
          selection = new Set([shape]);
          selectionKind = 'whole';
        }
      } else if (done.kind === 'shape-edit' && !cancelled) {
        if (done.moved) replaceShape(done.original, done.preview);
        else focusField = HANDLE_FIELDS[done.handle] ?? null;
      } else if (done.kind === 'move' && !cancelled) {
        const tap = Math.abs(done.dx) * view.scale < TAP_SLOP && Math.abs(done.dy) * view.scale < TAP_SLOP;
        const [only] = selection;
        if (!tap) moveSelection(done.dx, done.dy);
        // Dotknięcie zaznaczonego pola tekstowego albo wzoru – poprawka; kształtu (od 1.17) – tekst na nim.
        else if (selection.size === 1 && isElement(only) && !isShape(only) && touchesStroke(only, done.start.x, done.start.y, 0)) editElement(only.tool, only);
        else if (selection.size === 1 && isShape(only)
          && (shapeContains(only, done.start.x, done.start.y) || touchesShape(only, done.start.x, done.start.y, SELECTION_PAD / view.scale))) editShapeLabel(only);
      }
      // Palce, które zostały na ekranie, przesuwają dalej od miejsca, w którym są teraz.
      if (gesture && touches.size > 0) startGesture(gesture.kind);
      updateToolbar();
      requestRender();
      if (focusField && dimFields[focusField]) {
        // Pole widoczne od razu (bez czekania na klatkę) – kursor w nim.
        renderLive();
        dimFields[focusField].input.focus();
      }
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
      // Prawy przycisk myszy albo przycisk na rysiku przy zaznaczaniu – wycinek (od 1.17).
      const snipping = event.button === 2 && (event.pointerType === 'mouse' || event.pointerType === 'pen') && tool === 'select' && !picking && !placing;
      if (event.pointerType === 'mouse' && event.button !== 0 && !snipping) return;
      event.preventDefault();
      if (event.pointerType === 'pen' && !penSeen) {
        penSeen = true;
        penPill.hidden = false;
        rememberPen();
      }
      // Pipetka: każdy wskaźnik pobiera kolor (panel koloru zostaje otwarty).
      if (picking) {
        if (!active && touches.size === 0) startPick(event);
        return;
      }
      // Ustawianie szablonu: wskaźnik przesuwa szablon; drugi palec – powiększanie strony.
      if (placing && !(event.pointerType === 'touch' && (gesture || active?.touch))) {
        if (!active) startTemplateMove(event);
        return;
      }
      if (!placing) closeSettings();
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
        // Palec przy rysiku: punkty kształtu, kółko liniuszka i zaznaczenie – tak; poza nimi przesuwa stronę.
        const [only] = selection;
        const onSelection = (tool === 'select' && selectionHit(point))
          || (tool === 'shape' && selection.size === 1 && isShape(only) && shapeContains(only, point.x, point.y));
        if (!hit && penSeen && !onSelection && !shapeHandleAt(point) && !guideKnobHit(point)) {
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
      const handle = snipping ? null : shapeHandleAt(point);
      const hit = handle || snipping ? null : rulerHit(point);
      if (snipping) startSelect(event, true);
      else if (handle) startShapeEdit(event, handle);
      else if (hit === 'handle') startRuler(event, 'ruler-rotate');
      else if (guideKnobHit(point)) startGuideMove(event);
      else if (hit === 'body' && event.pointerType !== 'pen') startRuler(event, 'ruler-move');
      else if (usesEraser(event)) startErase(event);
      else if (tool === 'select') startSelect(event);
      else if (tool === 'shape') startShape(event);
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
        if (active || event.pointerType === 'touch') return;
        // Lupa pipetki albo kółko gumki pod myszą lub zawieszonym nad ekranem rysikiem.
        if (picking) {
          pickHover = local(event);
          requestLive();
        } else if (tool === 'eraser') {
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
    // Prawy przycisk na płótnie robi wycinek – bez menu przeglądarki.
    live.addEventListener('contextmenu', (event) => event.preventDefault());
    live.addEventListener('pointerleave', () => {
      if (!hover && !pickHover) return;
      hover = null;
      pickHover = null;
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
      // Zaznaczony fragment wraca w całości – w zapisie kreski nie są pocięte bez potrzeby.
      clearSelection();
      if (save && changed) {
        saving = true;
        doneButton.disabled = true;
        try {
          // Zdjęcie pod kreskami musi być wczytane, zanim powstanie obraz rysunku.
          await Promise.all([pictureReady, templateReady]);
          result = { drawing, image: await renderDrawingImage(drawing, media) };
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

    /** Pole do pisania (skala, kod koloru) – skróty i Delete działają w nim jak zwykle. */
    const typing = (target) => target instanceof window.HTMLElement && (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      || (target.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(target.type)));
    // Skróty działają w całym oknie – także gdy fokus zniknął (np. „Ponów” stał się nieaktywny),
    // ale nie w oknie pytania nad edytorem.
    const onKey = (event) => {
      if (event.target !== document.body && !dialog.contains(event.target)) return;
      if (event.key === 'Escape' && panelOpen()) {
        // Esc najpierw zamyka panel pod paskiem, potem zdejmuje zaznaczenie, dopiero następny zamyka edytor.
        event.preventDefault();
        closeSettings();
        updateToolbar();
        requestLive();
        return;
      }
      if (typing(event.target)) return;
      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      if (command && key === 'z') {
        event.preventDefault();
        stepHistory(event.shiftKey);
      } else if (command && key === 'y') {
        event.preventDefault();
        stepHistory(true);
      } else if (command && key === 'a') {
        event.preventDefault();
        selectAll();
      } else if (command && (key === 'c' || key === 'x') && (selection.size > 0 || snip)) {
        event.preventDefault();
        if (copySelection(key === 'x' ? 'Wycięto' : 'Skopiowano') && key === 'x') deleteSelection();
      } else if (command && key === 'v' && readClipboard()) {
        event.preventDefault();
        paste();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selection.size > 0) {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === 'Escape' && (selection.size > 0 || snip)) {
        event.preventDefault();
        clearSelection();
        updateToolbar();
      }
    };

    dialog = mountDialog('drawing-dialog', panel, {
      onDismiss: () => close(false),
      onClose: () => {
        document.removeEventListener('keydown', onKey, true);
        observer.disconnect();
        clearTimeout(noticeTimer);
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
      media.photo = loaded;
      requestRender();
    });
    const templateReady = loadPicture(drawing.template).then((loaded) => {
      media.template = loaded;
      requestRender();
    });
  });
}
