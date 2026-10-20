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
// kształtu i tekst na kształcie (przesuwa się i obraca razem z nim). Od 1.19: wielkość szablonu
// wpisywana w procentach albo przeciągnięciem narożnika, Shift (albo „Proporcje”) – kwadrat, koło,
// kąty co 15°, przytrzymany Ctrl – chwilowo zaznaczanie (Auto), środkowy przycisk myszy przesuwa
// stronę, szyk liniowy i kołowy (jeden element z parametrami, „Rozdziel” – osobne elementy), kilka
// kartek w jednym oknie (każda – osobny rysunek w notatce), zakończenia odcinka i wymiary kształtu
// widoczne na stałe (oko przy polu wymiaru). Od 1.21: tabele (to samo okno tabeli co w notatce),
// karteczki (zwijane do ikony, ze strzałką do miejsca, ukrywane na obrazie w notatce) i okno grubości
// zakreślacza. Od 1.22: liniuszek promieniowy (okręgi i promienie ze środka, obrót), przewracanie
// kartek kółkiem myszy i przyciskami ‹ › z animacją oraz końce odcinka, strzałki i strzałki karteczki
// przyciągane do krawędzi i narożników innych elementów i przyklejane do nich (core/attach.js).
//
// Rysik i palec: gdy aplikacja raz zobaczy rysik (pointerType 'pen'), rysuje tylko rysik, a palec
// przesuwa stronę (dłoń oparta o ekran nie zostawia śladów); bez rysika (iPhone) rysuje palec.
// Dwa palce zawsze powiększają i przesuwają. Myszą rysuje się jak piórem; kółko przewija (od 1.22
// przy kilku kartkach i całej stronie – przewraca kartkę), Ctrl + kółko powiększa. Gumka na końcu pióra (Windows) ściera bez zmiany narzędzia.
// Linijkę przesuwa palec albo mysz, obracają ją dwa palce albo uchwyt; kreska zaczęta przy
// krawędzi linijki biegnie prosto wzdłuż niej.
//
// Rysowanie: dwie warstwy płótna – zapisane kreski (rysowane od nowa po zmianie widoku albo
// cofnięciu) i warstwa bieżąca nad nimi (kreska w trakcie, przesuwane zaznaczenie, prostokąt
// zaznaczania, linijka, kółko gumki). Wynik to obraz notatki: PNG strony (JPEG, gdy pod spodem
// jest zdjęcie) i kreski do późniejszej edycji (core/drawing.js).

import {
  ARRAY_LABELS, ARRAY_MAX, arrayDefaults, arraySize, cleanArrayParams, expandArray, isArray, itemsBounds, makeArray, polarRadius, withPolarRadius
} from '../core/arrays.js';
import {
  endPoint, findSnap, followersOf, keepLinksTo, newElementId, relinkCopies, resolveAttachments, segmentBetween, snapNormal, withLink
} from '../core/attach.js';
import {
  DrawingHistory, ELEMENT_TEXT_MAX, ERASER_MODES, ERASER_MODE_LABELS, ERASER_SIZES, ERASER_SIZE_LABELS, HIGHLIGHTER_ALPHA,
  HIGHLIGHTER_COLORS, HIGHLIGHTER_RANGE, INK_COLORS, RAY_STEPS, STICKY_COLORS, STICKY_MIN, STICKY_TEXT_MAX, STICKY_TEXT_SIZES, TABLE_TEXT_SIZES, isBox, PAPERS, PAPER_LABELS, PAPER_STEP, SCALE_UNITS, SELECT_MODES, SELECT_MODE_LABELS,
  SELECT_SHAPES, SENSITIVITY_LABELS, TEXT_SIZES, TEXT_SIZE_LABELS, addPoint, cleanDrawing, cleanScale, cleanToolSettings,
  defaultToolSettings, dimFactor, dimUnitLabel, dimensionParts, elementBox, emptyDrawing, eraseAt, formatLength, formatNumber, formatRatio, fromScaleLength, isClockwise,
  isElement, isHexColor, lineAngleDifference, parseDecimal, penWidth, perpendicularAngle, rectPolygon, rememberColor, rgbToHex,
  hasContent, rulerDegrees, rulerOffset, rulerPoint, scaleUnitLabel, screenScale, screenScaleValue, selectionBounds, smoothPoint, snapRulerAngle,
  snapToStrokes, splitByPolygon, strokeBounds, strokesAt, strokesInPolygon, strokesInRect, toScaleLength, touchesStroke, translateStroke
} from '../core/drawing.js';
import { layoutMath } from '../core/math-layout.js';
import {
  DIM_PREFIXES, FIT_RE, LABEL_TEXT_MAX, SEGMENT_CAPS, SEGMENT_CAP_LABELS, SHAPES, SHAPE_FILLS, SHAPE_FILL_LABELS, SHAPE_LABELS, SKEW_DEGREES_LIMIT,
  canFill, dimCenter, dimGeometry, dimOffset, dimOffsetAt, dimPlaces, guideLinesIn, isLinearDim, isSegment, isShape, labelFrame, labelMaxWidth, moveShapeHandle, nearestGuideLine, nearestRay,
  nearestRing, rayAngles, resizeShape, ringsIn, stackDimOffset, withDimOffset, withDimTolerance,
  segmentCaps, segmentDegrees, setSegment, shapeContains, shapeFromDrag, shapeHandles, shapePoint, shownDims, skewDegrees, touchesShape,
  withCaps, withDims
} from '../core/shapes.js';
import {
  DEFAULT_PAPER_LEVEL, DEFAULT_TEMPLATE_LEVEL, LEVEL_LABELS, PAPER_COLORS, TEMPLATE_ALPHA, TEMPLATE_CORNERS, TEMPLATE_LABELS, centerTemplate,
  fitTemplate, pitchScale, resizeTemplateCorner, scaleTemplate, setTemplatePercent, templateCorner, templatePercent
} from '../core/templates.js';
import { plural } from '../core/text.js';
import { TOOLS_KEY, colorTabBody } from './color-picker.js';
import { field, segmented, textArea, toggle } from './components.js';
import { confirmDialog, mountDialog, openFormSheet, openMenu, showError } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import {
  DATUM_LETTER_RE, DATUM_RE, GDT_DATUMS_MAX, GDT_SYMBOLS, ROUGHNESS_KINDS, ROUGHNESS_KIND_LABELS, ROUGHNESS_TEXT_MAX, SYMBOL_TEXT_SIZES, cleanGdtValue,
  datumSide, gdtSymbol, isSymbol, nextDatumLetter
} from '../core/gdt.js';
import {
  gdtGlyphCanvas, measureGdt, measureRoughness, paintDatum, paintGdt, paintRoughness, paintTechnicalDim
} from './drawing-gdt.js';
import { openMathHelp } from './math.js';
import { paintShape, paintTemplate } from './drawing-paint.js';
import { prepareImage } from './images.js';
import { symbolField } from './symbols.js';
import { TEXT_FONT, TEXT_LINE, measureText, textLines } from './canvas-text.js';
import { measureSticky, measureTable, naturalTableWidth, paintSticky, paintStickyPopover, paintTable, stickyDate, stickyPopoverBox } from './drawing-boxes.js';
import { openTableEditor } from './table-editor.js';

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
/** Zakończenia odcinka (od 1.19) – ikony wyboru. */
const CAP_ICONS = { none: 'capNone', arrow: 'capArrow', triangle: 'capTriangle', circle: 'capCircle', square: 'capSquare', diamond: 'capDiamond' };
const SHAPE_ICONS = {
  line: 'shapeLine', arrow: 'shapeArrow', rect: 'shapeRect', ellipse: 'shapeEllipse', triangle: 'shapeTriangle', diamond: 'shapeDiamond', trapezoid: 'shapeTrapezoid'
};
/** Kształty: uchwyty (px ekranu) – promień trafienia, odległość uchwytu obrotu od kształtu. */
const HANDLE_HIT = 18;
/** Promień przyciągania końca do krawędzi albo narożnika (od 1.22) – ok. 3–4 mm na ekranie (px). */
const EDGE_SNAP = 14;
const ROTATE_GAP = 30;
/** Ctrl (od 1.19): po ilu ms przytrzymania klawisza narzędzie zmienia się na zaznaczanie. */
const CTRL_DELAY = 200;
/** Pola wymiarów kształtu (od 1.17): odstęp pola od linii ramki (px ekranu). */
const DIM_SCREEN_GAP = 16;
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

/** Element zmierzony od nowa na tym urządzeniu: pole, wzór, tekst kształtu (od 1.19 – też w szyku); kreska – kopia punktów. */
function remeasure(stroke) {
  if (isArray(stroke)) return { ...stroke, items: stroke.items.map(remeasure) };
  if (isShape(stroke)) return measureLabel(stroke);
  // Symbole metrologiczne (od 1.22.1): pola ramki i tekst chropowatości – z czcionki tego urządzenia.
  if (stroke.tool === 'gdt') return { ...stroke, ...measureGdt(stroke) };
  if (stroke.tool === 'roughness') return { ...stroke, ...measureRoughness(stroke) };
  if (stroke.tool === 'datum') return stroke;
  // Tabela i karteczka (od 1.21): wysokość z treści.
  if (stroke.tool === 'table') return { ...stroke, ...measureTable(stroke) };
  if (stroke.tool === 'sticky') return { ...stroke, ...measureSticky(stroke) };
  if (isElement(stroke)) return { ...stroke, ...measureElement(stroke) };
  return { ...stroke, points: [...stroke.points] };
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
 * Stałe wymiary kształtu (od 1.19), od 1.22.1 jak w rysunku technicznym: linie pomocnicze, linia
 * wymiarowa ze strzałkami (kąt – łuk) i liczba w kolorze kształtu; `text: false` – same linie
 * (zaznaczony kształt: liczby są w polach wymiarów), `offsets` – podgląd innego odsunięcia.
 */
function paintDims(ctx, shape, scale, style, { text = true, offsets = null } = {}) {
  for (const key of shownDims(shape)) {
    const offset = offsets?.[key];
    paintTechnicalDim(ctx, shape, key, text ? dimensionParts(shape, key, scale, style) : null, { offset, dashed: offset !== undefined });
  }
}

/**
 * Kreska: pióro – odcinki między środkami kolejnych punktów (krzywe), każdy z grubością swojego
 * punktu; zakreślacz – jedna ścieżka o stałej grubości, półprzezroczysta i mnożona z tłem.
 * Pole tekstowe i wzór (od 1.13) – napis i wzór od lewego górnego rogu; kształt – z wypełnieniem
 * i tekstem (od 1.17), zakończeniami odcinka i stałymi wymiarami (od 1.19); szyk (od 1.19) – wszystkie
 * kopie; od 1.21 tabela i karteczka. options: scale – skala rysunku (napisy wymiarów), dims: false – bez
 * stałych wymiarów, number – numer karteczki, editor – strona edytora (karteczka ukryta na obrazie
 * z obwódką), image – obraz do notatki (karteczka ukryta na obrazie – pominięta).
 */
export function paintStroke(ctx, stroke, options = {}) {
  if (isArray(stroke)) {
    for (const item of expandArray(stroke)) paintStroke(ctx, item, options);
    return;
  }
  if (stroke.tool === 'table') {
    paintTable(ctx, stroke);
    return;
  }
  if (stroke.tool === 'sticky') {
    if (!(options.image && stroke.hidden)) paintSticky(ctx, stroke, options);
    return;
  }
  // Symbole metrologiczne (od 1.22.1).
  if (stroke.tool === 'gdt') {
    paintGdt(ctx, stroke);
    return;
  }
  if (stroke.tool === 'datum') {
    paintDatum(ctx, stroke);
    return;
  }
  if (stroke.tool === 'roughness') {
    paintRoughness(ctx, stroke);
    return;
  }
  if (isShape(stroke)) {
    paintShape(ctx, stroke);
    if (stroke.label) paintLabel(ctx, stroke);
    if (options.dims !== false) paintDims(ctx, stroke, options.scale, options.dimStyle);
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
 * `skip` – kreski pominięte (przesuwane zaznaczenie, poprawiany kształt); `plain` (od 1.19) – kształt
 * bez stałych wymiarów (zaznaczony – w jego miejscu są pola wymiarów); mode (od 1.21): editor –
 * strona edytora, image – obraz do notatki (bez karteczek ukrytych na obrazie).
 */
export function paintDrawing(ctx, drawing, media = {}, skip = null, plain = null, { editor = false, image = false } = {}) {
  paintPaper(ctx, drawing);
  if (media.photo) ctx.drawImage(media.photo, 0, 0, drawing.width, drawing.height);
  paintTemplate(ctx, drawing.template, media.template);
  let number = 0;
  for (const stroke of drawing.strokes) {
    // Karteczki mają numery w kolejności na rysunku (od 1.21).
    if (stroke.tool === 'sticky') number += 1;
    if (!skip?.has(stroke)) {
      paintStroke(ctx, stroke, { scale: drawing.scale, dimStyle: drawing.dimStyle, dims: stroke !== plain, number: stroke.tool === 'sticky' ? number : null, editor, image });
    }
  }
}

/** Numer karteczki na rysunku (od 1.21): kolejność wśród karteczek (od 1). */
const stickyNumber = (drawing, sticky) => drawing.strokes.filter((stroke) => stroke.tool === 'sticky').indexOf(sticky) + 1;

/** Obraz rysunku do notatki: PNG strony albo JPEG, gdy pod kreskami jest zdjęcie. */
export async function renderDrawingImage(drawing, media = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = drawing.width;
  canvas.height = drawing.height;
  const ctx = canvas.getContext('2d');
  paintDrawing(ctx, drawing, media, null, null, { image: true });
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

/** Karty panelu własnego koloru (od 1.14; siatka i suwaki – wspólne z kolorem tekstu notatki, ui/color-picker.js). */
const COLOR_TABS = [['grid', 'Siatka'], ['sliders', 'Suwaki'], ['picker', 'Pipetka']];

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

/** Zaznaczone kreski i elementy na białym tle z marginesem (Kopiuj – obraz w schowku systemu, Osadź); scale – skala rysunku (wymiary). */
function strokesCanvas(strokes, scale) {
  const bounds = selectionBounds(strokes);
  const area = { minX: bounds.minX - EXPORT_PAD, minY: bounds.minY - EXPORT_PAD, maxX: bounds.maxX + EXPORT_PAD, maxY: bounds.maxY + EXPORT_PAD };
  return areaCanvas(area, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(area.minX, area.minY, area.maxX - area.minX, area.maxY - area.minY);
    for (const stroke of strokes) paintStroke(ctx, stroke, { scale });
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
 * Zwraca obietnicę: po „Gotowe” { drawing, image, pages } – drawing i image to pierwsza kartka (null,
 * gdy się nie zmieniła), pages (od 1.19) – kolejne kartki z treścią: [{ drawing, image }]; null po
 * „Anuluj” i po „Gotowe” bez żadnej zmiany (nowy pusty rysunek nie trafia do notatki).
 */
export function openDrawingEditor({ drawing: source = null, photo = null, title = 'Rysunek', onEmbed = null } = {}) {
  return new Promise((resolve) => {
    // Pola tekstowe i wzory mierzone od nowa – czcionki tego urządzenia mogą być trochę inne.
    const first = source
      ? { ...source, scale: cleanScale(source.scale), paperLevel: source.paperLevel ?? DEFAULT_PAPER_LEVEL, strokes: source.strokes.map(remeasure) }
      : emptyDrawing({ photo });
    /**
     * Kartki (od 1.19): pierwsza – rysunek z notatki (albo nowy), kolejne – nowe rysunki. Każda ma
     * swoją historię cofania, obrazy (zdjęcie, szablon) i znacznik zmiany; edytor pracuje na bieżącej.
     */
    const pages = [];
    let pageIndex = 0;
    let drawing = first;
    let history = new DrawingHistory(drawing.strokes);
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
    /** Miejsce przyciągnięcia pod myszą przy narzędziu kształtów – odcinek albo strzałka (od 1.22). */
    let edgeHover = null;
    // Symbol metrologiczny czekający na dotknięcie miejsca na rysunku (od 1.22.1): { element }.
    let symbolPlacing = null;
    /** Długość ostatniej kreski wzdłuż linijki (jednostki strony) albo null. */
    let measured = null;
    /** Kolejne wklejenia tego samego schowka – każde trochę niżej i w prawo. */
    let pasteCount = 0;
    const pixelsPerInch = screenPixelsPerInch();
    /** Jest mysz albo gładzik (od 1.17 – podpowiedź o wycinku prawym przyciskiem). */
    const finePointer = Boolean(window.matchMedia?.('(any-pointer: fine)').matches);
    /** Wczytane obrazy bieżącej kartki: zdjęcie pod kreskami i (od 1.15) szablon z pliku. */
    let media = { photo: null, template: null };
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
    /** Pole tekstowe albo wzór (nie kształt i nie szyk). */
    const isTextual = (stroke) => stroke?.tool === 'text' || stroke?.tool === 'math';
    const editButton = selectionButton('drawing-selection-edit', 'edit', 'Edytuj', 'Edytuj', () => {
      const [only] = selection;
      if (isTextual(only)) editElement(only.tool, only);
      else if (isBox(only)) editBox(only);
    });
    editButton.hidden = true;
    // Od 1.21: karteczka zwinięta do ikony albo rozwinięta – jednym dotknięciem.
    const collapseButton = selectionButton('drawing-selection-collapse', 'minus', 'Zwiń', 'Zwiń karteczkę do ikony', () => toggleCollapsed());
    // Od 1.17: tekst i wypełnienie zaznaczonego kształtu, „Osadź” – obraz zaznaczenia albo wycinka w notatce.
    const shapeTextButton = selectionButton('drawing-selection-text', 'textBox', 'Tekst', 'Tekst na kształcie – przesuwa się i obraca razem z nim', () => {
      const [only] = selection;
      if (isShape(only)) editShapeLabel(only);
    });
    const fillButton = selectionButton('drawing-selection-fill', 'fill', 'Wypełnienie', 'Wypełnienie kształtu', () => chooseFill());
    // Od 1.19: zakończenia odcinka, szyk (nowy albo zmiana parametrów) i rozdzielenie szyku.
    const capsButton = selectionButton('drawing-selection-caps', 'capArrow', 'Końce', 'Zakończenia odcinka: grot, trójkąt, koło, kwadrat, romb', () => chooseCaps());
    // Od 1.22: magnes – przyciąganie końców do krawędzi i narożników (wł./wył., zapamiętane na urządzeniu).
    const magnetButton = selectionButton('drawing-selection-magnet', 'magnet', 'Przyciąganie',
      'Przyciąganie końców do krawędzi i narożników – wł./wył. (z Alt – chwilowo swobodnie)', () => toggleEdgeSnap());
    const arrayButton = selectionButton('drawing-selection-array', 'array', 'Szyk', 'Powiel w szyku – liniowym albo kołowym', () => editArray());
    const explodeButton = selectionButton('drawing-selection-explode', 'explode', 'Rozdziel', 'Rozdziel szyk – każda kopia osobno', () => explodeArray());
    const copyButton = selectionButton('drawing-selection-copy', 'copy', 'Kopiuj', 'Kopiuj (Ctrl+C) – wklejasz przyciskiem „Wklej” albo Ctrl+V, także w innym rysunku', () => copySelection());
    const duplicateButton = selectionButton('drawing-selection-duplicate', 'duplicate', 'Powiel', 'Powiel – kopia obok', () => duplicateSelection());
    const embedButton = selectionButton('drawing-selection-embed', 'embed', 'Osadź', 'Osadź w notatce jako obraz', () => embedSelection());
    const deleteButton = selectionButton('drawing-selection-delete', 'trash', 'Usuń', 'Usuń (Delete)', () => deleteSelection(), true);
    const selectionBar = h('div', { class: 'drawing__selection', hidden: true, role: 'toolbar', 'aria-label': 'Zaznaczone kreski' },
      selectionCount, editButton, collapseButton, shapeTextButton, fillButton, capsButton, magnetButton, copyButton, duplicateButton, arrayButton, explodeButton, embedButton, deleteButton);
    // Pola wymiarów zaznaczonego kształtu (od 1.17): na liniach ramki konstrukcyjnej, wpisywane z klawiatury.
    const dims = h('div', { class: 'drawing__dims', hidden: true, dataset: { testid: 'drawing-dims' } });
    // Od 1.22: animacja przewracania kartki (zdjęcia stron nad płótnem, tylko w trakcie).
    const flipCanvas = h('canvas', { class: 'drawing__flip', hidden: true, 'aria-hidden': 'true' });
    stage.append(base, live, flipCanvas, dims, selectionBar);

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
    /** Kształt, którego stałe wymiary pominęła ostatnio warstwa zapisanych kresek (są przy nim pola wymiarów). */
    let plainShape = null;
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
      // Przesuwane zaznaczenie, poprawiany kształt i (od 1.19) przesuwany środek szyku rysuje warstwa bieżąca.
      plainShape = editedShape();
      const moving = ['move', 'shape-edit', 'array-center', 'box-edit'].includes(active?.kind) ? selection : null;
      // Przyklejone końce (od 1.22) idą za przesuwanym kształtem – rysuje je warstwa bieżąca.
      const followers = activeFollowers();
      paintDrawing(ctx, drawing, media, followers ? new Set([...(moving ?? []), ...followers.keys()]) : moving, plainShape, { editor: true });
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
    /** Długość kreski wzdłuż linijki (w skali rysunku) obok rysika, po zewnętrznej stronie krawędzi; przy okręgu (od 1.22) – na zewnątrz łuku. */
    const paintLength = (ctx, edge) => {
      const side = edge.across < 0 ? -1 : 1;
      const outside = edge.circle ? edge.circle.r + 24 / view.scale : 0;
      const point = edge.circle
        ? toScreen({ x: edge.circle.x + Math.cos(edge.last) * outside, y: edge.circle.y + Math.sin(edge.last) * outside })
        : toScreen(rulerPoint(edge.ruler, edge.along, edge.across + (side * 24) / view.scale));
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
      if (selectMode() !== 'auto') return selectMode();
      if (gesture.kind === 'lasso') return isClockwise(gesture.polygon) ? 'region' : 'whole';
      return gesture.rect.x1 < gesture.rect.x0 ? 'region' : 'whole';
    };

    // ---- Ctrl (od 1.19): przytrzymany – chwilowo zaznaczanie w trybie Auto, puszczony – poprzednie narzędzie
    /** { previous, mode, released } – narzędzie sprzed Ctrl, tryb zaznaczania na ten czas, Ctrl puszczony w trakcie zaznaczania. */
    let ctrlHold = null;
    let ctrlTimer = 0;
    let shiftDown = false;
    /** Przytrzymany Alt (od 1.22): końce bez przyciągania do krawędzi i narożników. */
    let altDown = false;
    /** Tryb zaznaczania: z przytrzymanym Ctrl – Auto (albo wybrany w tym czasie), inaczej – z ustawień. */
    const selectMode = () => ctrlHold?.mode ?? tools.selectMode;
    function beginCtrlHold() {
      clearTimeout(ctrlTimer);
      ctrlTimer = 0;
      if (ctrlHold || tool === 'select' || active || placing || picking) return;
      ctrlHold = { previous: tool, mode: 'auto', released: false };
      setTool('select');
    }
    function endCtrlHold() {
      clearTimeout(ctrlTimer);
      ctrlTimer = 0;
      if (!ctrlHold) return;
      // W trakcie zaznaczania albo przesuwania – narzędzie wraca po puszczeniu wskaźnika.
      if (active) {
        ctrlHold.released = true;
        return;
      }
      const { previous } = ctrlHold;
      ctrlHold = null;
      setTool(previous);
    }

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
    // (jeden krok cofania), Esc – bez zmiany. Od 1.19 oko przy polu: wymiar widoczny na rysunku na stałe.
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
      const eye = h('button', {
        type: 'button', class: 'drawing__dim-eye', 'aria-pressed': 'false', dataset: { testid: `drawing-dim-eye-${key}` },
        onPointerdown: (event) => event.stopPropagation(),
        onClick: () => toggleDim(key)
      });
      // Od 1.22.1: znak i tolerancja wymiaru (lewy górny róg) i uchwyt – przeciągnięcie odsuwa linię wymiarową.
      const marks = h('button', {
        type: 'button', class: 'drawing__dim-marks', 'aria-pressed': 'false', 'aria-label': `${label}: znak i tolerancja`, title: 'Znak przed liczbą (⌀, R, □) i tolerancja',
        dataset: { testid: `drawing-dim-marks-${key}` },
        onPointerdown: (event) => event.stopPropagation(),
        onClick: () => editDimMarks(key)
      }, '±');
      const grip = h('button', {
        type: 'button', class: 'drawing__dim-grip', hidden: true, 'aria-label': `${label}: przeciągnij, żeby odsunąć linię wymiarową`,
        title: 'Przeciągnij – odsunięcie linii wymiarowej (następne wymiary dostaną ten sam odstęp)', dataset: { testid: `drawing-dim-grip-${key}` },
        onPointerdown: (event) => startDimDrag(event, key)
      }, icon('dimDrag', { size: 14 }));
      const box = h('div', { class: 'drawing__dim', hidden: true }, h('label', { class: 'drawing__dim-field', title: label }, input, unit), eye, marks, grip);
      const field = { key, kind, label, box, input, unit, eye, marks, grip, shown: null, dirty: false };
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
      // select() ustawia też fokus – po szybkim Esc albo Enter (pole już bez fokusu) nie wraca do pola.
      input.addEventListener('focus', () => requestAnimationFrame(() => {
        if (document.activeElement === input) input.select();
      }));
      input.addEventListener('blur', () => {
        commitDim(field);
        requestLive();
      });
      dims.append(box);
      return [key, field];
    }));
    /** Wartość pola dla kształtu (długości w skali rysunku – od 1.22.1 w stylu technicznym w mm, kąty w stopniach). */
    function dimValue(key, shape) {
      const factor = dimFactor(drawing.scale, drawing.dimStyle);
      if (key === 'width' || key === 'length') return toScaleLength(shape.w, drawing.scale) * factor;
      if (key === 'height') return toScaleLength(shape.h, drawing.scale) * factor;
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
      const units = fromScaleLength(value / dimFactor(drawing.scale, drawing.dimStyle), drawing.scale);
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
    /**
     * Pola wymiarów przy ramce kształtu – po każdej zmianie widoku i kształtu; w trakcie przeciągania
     * punktu tylko pokazują wartości. Odcinek: „pod” i „za końcem” – w kierunku czytelnym (dimPlaces).
     */
    function placeDims(shape) {
      const show = Boolean(shape) && (!active || active.kind === 'shape-edit' || active.kind === 'dim-offset');
      dims.hidden = !show;
      if (!show) return;
      dims.classList.toggle('drawing__dims--busy', Boolean(active) && active.kind !== 'dim-offset');
      const places = dimPlaces(shape);
      const shown = shownDims(shape);
      for (const field of Object.values(dimFields)) {
        const place = places[field.key];
        field.box.hidden = !place;
        if (!place) continue;
        if (document.activeElement !== field.input && !field.dirty) {
          field.input.value = formatNumber(dimValue(field.key, shape));
          field.unit.textContent = field.kind === 'length' ? dimUnitLabel(drawing.scale, drawing.dimStyle) : '°';
        }
        // Oko (od 1.19): wymiar widoczny na rysunku także po odznaczeniu kształtu.
        const visible = shown.includes(field.key);
        if (field.shown !== visible) {
          field.shown = visible;
          field.eye.setAttribute('aria-pressed', String(visible));
          field.eye.setAttribute('aria-label', `${field.label}: ${visible ? 'widoczny na rysunku – ukryj' : 'pokaż na rysunku na stałe'}`);
          field.eye.title = visible ? 'Widoczny na rysunku – dotknij, żeby ukryć' : 'Pokaż ten wymiar na rysunku na stałe';
          replaceChildren(field.eye, icon(visible ? 'eye' : 'eyeOff', { size: 15 }));
        }
        field.grip.hidden = !visible;
        field.marks.setAttribute('aria-pressed', String(Boolean(shape.dimTols?.[field.key])));
        const [width, height] = [field.box.offsetWidth, field.box.offsetHeight];
        // Wymiar widoczny na stałe (od 1.22.1) – pole w miejscu liczby nad linią wymiarową.
        const offset = active?.kind === 'dim-offset' && active.key === field.key ? active.offset : undefined;
        const center = visible ? toScreen(dimGeometry(shape, field.key, offset).text)
          : dimCenter({ point: toScreen(place.point), normal: place.normal }, width, height, DIM_SCREEN_GAP);
        const x = Math.min(view.width - width / 2 - 4, Math.max(width / 2 + 4, center.x));
        const y = Math.min(view.height - height / 2 - 4, Math.max(height / 2 + 4, center.y));
        field.box.style.left = `${Math.round(x - width / 2)}px`;
        field.box.style.top = `${Math.round(y - height / 2)}px`;
      }
    }
    /** Oko przy polu wymiaru: wymiar widoczny na rysunku na stałe albo nie – jeden krok cofania. */
    function toggleDim(key) {
      const shape = editedShape();
      if (!shape || active) return;
      const shown = shownDims(shape);
      replaceShape(shape, shown.includes(key) ? withDims(shape, shown.filter((item) => item !== key)) : showDim(shape, key));
      updateToolbar();
      requestRender();
    }
    /**
     * Kształt z widocznym wymiarem `key` (od 1.22.1): linia wymiarowa w odsunięciu z wzoru (ostatnio
     * przeciągniętego), a gdy wchodziłaby na inną – piętro dalej; kąt – domyślny łuk.
     */
    function showDim(shape, key) {
      const next = withDims(shape, [...shownDims(shape), key]);
      if (!isLinearDim(key) || Number.isFinite(shape.dimOffsets?.[key])) return next;
      return withDimOffset(next, key, stackDimOffset(drawing.strokes, next, key, tools.dimOffset));
    }
    /** Przeciąganie uchwytu pola wymiaru: podgląd odsunięcia (przerywany), po puszczeniu – zapis i wzór dla następnych. */
    function startDimDrag(event, key) {
      event.preventDefault();
      event.stopPropagation();
      const shape = editedShape();
      if (!shape || active) return;
      const grip = event.currentTarget;
      grip.setPointerCapture?.(event.pointerId);
      active = { kind: 'dim-offset', id: event.pointerId, key, shape, offset: dimOffset(shape, key) };
      // Miejsce chwytu względem liczby – linia wymiarowa nie przeskakuje pod palec.
      const start = toDrawing(event);
      const text = dimGeometry(shape, key).text;
      const [grabX, grabY] = [start.x - text.x, start.y - text.y];
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== event.pointerId || active?.kind !== 'dim-offset') return;
        const point = toDrawing(moveEvent);
        active.offset = dimOffsetAt(shape, key, { x: point.x - grabX, y: point.y - grabY });
        requestLive();
      };
      const finish = (upEvent) => {
        if (upEvent.pointerId !== event.pointerId) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        const done = active;
        active = null;
        if (done?.kind !== 'dim-offset') return;
        if (upEvent.type === 'pointerup' && done.offset !== dimOffset(shape, key)) {
          replaceShape(shape, withDimOffset(shape, key, done.offset));
          if (isLinearDim(key)) {
            tools.dimOffset = done.offset;
            saveTools(tools);
          }
          updateToolbar();
        }
        requestRender();
      };
      // Na oknie – ruch dociera także wtedy, gdy wskaźnik zjedzie z uchwytu.
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      requestLive();
    }
    /**
     * Znak i tolerancja wymiaru (od 1.22.1): ⌀, R, □ przed liczbą (długości), tolerancja ± (symetryczna),
     * odchyłki (górna i dolna) albo pasowanie („H7”, „H7/g6”); wartości w jednostkach liczby wymiaru.
     * Zapis pokazuje wymiar na rysunku (oko).
     */
    function editDimMarks(key) {
      const shape = editedShape();
      if (!shape || active) return;
      const dimField = dimFields[key];
      const linear = isLinearDim(key);
      const current = shape.dimTols?.[key] ?? {};
      const choice = { prefix: current.prefix ?? '', kind: current.kind ?? 'none' };
      const unit = linear ? dimUnitLabel(drawing.scale, drawing.dimStyle) : '°';
      const number = (value) => (Number.isFinite(value) ? formatNumber(value) : '');
      const decimal = (testID, label, value) => h('input', {
        class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': label,
        value: number(value), dataset: { testid: testID }, onInput: () => refresh()
      });
      const symmetric = decimal('drawing-dim-tol-value', 'Tolerancja ±', current.value);
      const upper = decimal('drawing-dim-tol-upper', 'Odchyłka górna', current.upper);
      const lower = decimal('drawing-dim-tol-lower', 'Odchyłka dolna', current.lower);
      const fit = h('input', {
        class: 'input', type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Pasowanie', placeholder: 'H7',
        value: current.fit ?? '', dataset: { testid: 'drawing-dim-tol-fit' }, onInput: () => refresh()
      });
      const preview = h('p', { class: 'drawing__dim-preview', dataset: { testid: 'drawing-dim-tol-preview' } });
      const blocks = {
        sym: field('Tolerancja ±', h('div', { class: 'drawing__dim-tol-row' }, symmetric, h('span', null, unit))),
        dev: h('div', { class: 'drawing__dim-tol-pair' },
          field('Górna', h('div', { class: 'drawing__dim-tol-row' }, upper, h('span', null, unit))),
          field('Dolna', h('div', { class: 'drawing__dim-tol-row' }, lower, h('span', null, unit)))),
        fit: field('Pasowanie', h('div', null, fit, h('div', { class: 'drawing__quick' },
          ['H7', 'H8', 'g6', 'h6', 'js6', 'H7/g6', 'H7/h6', 'H7/k6'].map((item) => chip(item, `drawing-dim-fit-${item.replace('/', '-')}`, () => {
            fit.value = item;
            refresh();
          })))), { hint: 'Wielka litera – otwór, mała – wałek; „H7/g6” – pasowanie otworu z wałkiem.' })
      };
      /** Oznaczenie z pól albo { error }. */
      function read() {
        const marks = { prefix: choice.prefix };
        if (choice.kind === 'sym') {
          const value = parseDecimal(symmetric.value);
          if (value === null || value === 0) return { error: 'Wpisz tolerancję, np. 0,1.' };
          Object.assign(marks, { kind: 'sym', value: Math.abs(value) });
        } else if (choice.kind === 'dev') {
          const [high, low] = [parseDecimal(upper.value), parseDecimal(lower.value)];
          if (high === null || low === null) return { error: 'Wpisz obie odchyłki, np. +0,1 i −0,05.' };
          if (high < low) return { error: 'Odchyłka górna nie może być mniejsza od dolnej.' };
          Object.assign(marks, { kind: 'dev', upper: high, lower: low });
        } else if (choice.kind === 'fit') {
          if (!FIT_RE.test(fit.value.trim())) return { error: 'Wpisz pasowanie, np. H7, g6 albo H7/g6.' };
          Object.assign(marks, { kind: 'fit', fit: fit.value.trim() });
        }
        return { marks };
      }
      function refresh() {
        for (const [kind, block] of Object.entries(blocks)) block.hidden = choice.kind !== kind;
        const { marks } = read();
        const sample = withDimTolerance(shape, key, marks ?? { prefix: choice.prefix });
        preview.textContent = `Na rysunku: ${dimensionTextOf(sample, key)}`;
      }
      let pending = null;
      openFormSheet({
        title: `${dimField.label} – znak i tolerancja`,
        submitLabel: 'Gotowe',
        build: () => [
          linear ? field('Znak przed liczbą', segmented({
            name: `drawing-dim-prefix-${Date.now()}`, label: 'Znak przed liczbą', value: choice.prefix,
            options: DIM_PREFIXES.map((prefix) => ({ value: prefix, label: prefix || 'Brak' })),
            onChange: (value) => {
              choice.prefix = value;
              refresh();
            }
          })) : null,
          field('Tolerancja', segmented({
            name: `drawing-dim-tol-${Date.now()}`, label: 'Tolerancja', value: choice.kind,
            options: [{ value: 'none', label: 'Brak' }, { value: 'sym', label: '±' }, { value: 'dev', label: 'Odchyłki' }, ...(linear ? [{ value: 'fit', label: 'Pasowanie' }] : [])],
            onChange: (value) => {
              choice.kind = value;
              refresh();
            }
          })),
          blocks.sym, blocks.dev, blocks.fit,
          preview,
          h('p', { class: 'field__hint' }, `Wartości w ${linear ? `jednostkach liczby wymiaru (${unit})` : 'stopniach'}. Wymiar z tolerancją jest widoczny na rysunku. `
            + 'Liczby „50” (mm) albo „5 cm” – w panelu linijki (dotknij kąta linijki).')
        ],
        onSubmit: (api) => {
          const { marks, error } = read();
          if (error) {
            api.setError(error);
            return false;
          }
          pending = marks;
          return true;
        },
        onClose: () => {
          if (!pending) return;
          const now = editedShape();
          if (!now || now !== shape) return;
          let next = withDimTolerance(shape, key, pending);
          if (!shownDims(next).includes(key)) next = showDim(next, key);
          replaceShape(shape, next);
          updateToolbar();
          requestRender();
        }
      });
      refresh();
    }
    /** Napis wymiaru w bieżącym stylu rysunku (podgląd w oknie). */
    const dimensionTextOf = (shape, key) => {
      const { main, tolerance } = dimensionParts(shape, key, drawing.scale, drawing.dimStyle);
      if (!tolerance) return main;
      return tolerance.kind === 'dev' ? `${main} ${tolerance.upper} / ${tolerance.lower}` : tolerance.kind === 'sym' ? `${main}${tolerance.text}` : `${main} ${tolerance.text}`;
    };

    // ---- liniuszek (od 1.15): równoległe linie przez całą stronę, poprzeczne, kółko do przesuwania;
    // od 1.22 promieniowy – okręgi wokół kółka i promienie z niego
    const radialGuide = () => tools.guide.kind === 'radial';
    /** Liniuszek promieniowy: środek w kółku, okręgi co odstęp, promienie co krok – kąty przeciwnie do wskazówek zegara. */
    function radialFamily() {
      const settings = tools.guide;
      return {
        x: guide.x, y: guide.y, spacing: settings.ringSpacing * PAPER_STEP,
        step: (settings.rayStep * Math.PI) / 180, angle: (-settings.rayAngle * Math.PI) / 180
      };
    }
    /** Rodziny linii: główne i (gdy włączone) poprzeczne – kąty jak na linijce (przeciwnie do wskazówek zegara). */
    function guideFamilies() {
      if (radialGuide()) return [];
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
      if (radialGuide()) {
        const radial = radialFamily();
        ctx.beginPath();
        for (const radius of ringsIn(radial, drawing.width, drawing.height)) {
          ctx.moveTo(radial.x + radius, radial.y);
          ctx.arc(radial.x, radial.y, radius, 0, Math.PI * 2);
        }
        ctx.stroke();
        if (tools.guide.rays) {
          ctx.setLineDash([6 / view.scale, 4 / view.scale]);
          ctx.beginPath();
          for (const angle of rayAngles(radial)) {
            ctx.moveTo(radial.x, radial.y);
            ctx.lineTo(radial.x + Math.cos(angle) * reach * 2, radial.y + Math.sin(angle) * reach * 2);
          }
          ctx.stroke();
        }
      }
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

    // ---- szablon w trakcie ustawiania: ramka na stronie (przeciągnięcie przesuwa szablon, od 1.19 narożnik – zmienia wielkość)
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
      // Narożniki: kwadraty stałej wielkości na ekranie.
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = ZERO_COLOR;
      ctx.fillStyle = '#ffffff';
      for (const corner of Object.keys(TEMPLATE_CORNERS)) {
        const point = toScreen(templateCorner(template, corner));
        ctx.fillRect(point.x - 7, point.y - 7, 14, 14);
        ctx.strokeRect(point.x - 7, point.y - 7, 14, 14);
      }
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
        // Karteczka przesuwana sama (od 1.21) – koniec strzałki zostaje w miejscu.
        const kept = keptTarget();
        ctx.save();
        ctx.translate(active.dx, active.dy);
        for (const stroke of selection) {
          if (stroke !== kept) paintStroke(ctx, stroke, { scale: drawing.scale, dimStyle: drawing.dimStyle, editor: true, number: stroke.tool === 'sticky' ? stickyNumber(drawing, stroke) : null });
        }
        ctx.restore();
        if (kept) paintStroke(ctx, movedSticky(kept, active.dx, active.dy), { editor: true, number: stickyNumber(drawing, kept) });
      }
      if (active?.kind === 'box-edit') paintStroke(ctx, active.preview, { editor: true, number: stickyNumber(drawing, active.original) });
      // Przyklejone końce idące za przesuwanym albo zmienianym kształtem (od 1.22).
      for (const [original, preview] of activeFollowers() ?? []) {
        paintStroke(ctx, preview, { scale: drawing.scale, dimStyle: drawing.dimStyle, editor: true, number: original.tool === 'sticky' ? stickyNumber(drawing, original) : null });
      }
      if (active?.kind === 'shape-new' && active.shape) paintStroke(ctx, active.shape);
      if (active?.kind === 'shape-edit') paintStroke(ctx, active.preview, { dims: false });
      if (active?.kind === 'array-center') paintStroke(ctx, active.preview, { scale: drawing.scale, dimStyle: drawing.dimStyle });
      // Zaznaczony kształt (od 1.22.1): linie wymiarów technicznych – liczby są w polach wymiarów;
      // przeciągany uchwyt pola – podgląd odsunięcia (przerywany).
      const dimmed = editedShape();
      if (dimmed) paintDims(ctx, dimmed, drawing.scale, drawing.dimStyle, { text: false, offsets: active?.kind === 'dim-offset' ? { [active.key]: active.offset } : null });
      if (guide) paintGuide(ctx);
      ctx.restore();
      if (placing && drawing.template) paintPlacement(ctx);
      const bounds = active?.kind === 'box-edit' ? strokeBounds(active.preview) : selectionBounds([...selection]);
      // Jeden kształt: zamiast ramki – jego punkty konstrukcyjne.
      const handled = editedShape();
      if (handled) paintHandles(ctx, handled);
      // Zwinięta karteczka (od 1.21): zaznaczona – obok ikony jej treść.
      const [onlyOne] = selection;
      const popover = selection.size === 1 && onlyOne?.tool === 'sticky' && onlyOne.collapsed && active?.kind !== 'move' && !snip ? stickyPopoverBox(onlyOne) : null;
      if (popover) {
        ctx.save();
        paintStickyPopover(ctx, onlyOne, stickyNumber(drawing, onlyOne));
        ctx.restore();
      }
      // Środek szyku kołowego (od 1.19) – do przeciągnięcia.
      const polar = active?.kind === 'array-center' ? active.preview : selectedPolar();
      if (polar) paintArrayCenter(ctx, polar);
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
      // Tabela i karteczka (od 1.21): narożnik do zmiany wielkości i koniec strzałki karteczki.
      const box = editedBox();
      if (box) paintBoxHandles(ctx, box);
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
      // Miejsca przyciągnięcia końców (od 1.22): w trakcie rysowania i przeciągania, a z myszą – też przed.
      const snaps = active?.kind === 'shape-new' ? [active.startSnap, active.endSnap]
        : active?.kind === 'shape-edit' || active?.kind === 'box-edit' ? [active.snap]
          : !active && (tool === 'shape' || symbolPlacing) ? [edgeHover] : [];
      for (const snap of snaps) if (snap) paintSnapMarker(ctx, snap);
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
      // Zaznaczony kształt zmienił się bez przerysowania tła – jego stałe wymiary pokaże (albo ukryje) następna klatka.
      if (handled !== plainShape && active?.kind !== 'shape-edit') requestRender();
      // Pola wymiarów najpierw – polecenia zaznaczenia ich nie zasłaniają (np. po obrocie kształtu pole jest nad nim).
      placeDims(handled);
      // Treść zwiniętej karteczki – polecenia nad nią albo pod nią, nie na niej.
      const barBounds = popover && bounds ? { ...bounds, minY: Math.min(bounds.minY, popover.y), maxY: Math.max(bounds.maxY, popover.y + popover.height) } : bounds;
      placeSelectionBar(snip ? snip.bounds : handled ? { ...bounds, minY: Math.min(bounds.minY, rotateHandle(handled).y - 14 / view.scale) } : barBounds, dimsExtent());
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
      const show = Boolean(bounds) && !['move', 'marquee', 'lasso', 'pick', 'shape-new', 'shape-edit', 'template-move', 'template-scale', 'array-center', 'box-edit']
        .includes(active?.kind) && !placing;
      selectionBar.hidden = !show;
      if (!show) return;
      const items = [...selection];
      const only = items.length === 1 ? items[0] : null;
      selectionCount.textContent = snip ? 'Wycinek' : selectionKind === 'region' ? 'Fragment' : only?.tool === 'text' ? 'Pole tekstowe' : only?.tool === 'math' ? 'Wzór'
        : only?.tool === 'table' ? 'Tabela' : only?.tool === 'sticky' ? `Karteczka ${stickyNumber(drawing, only)}`
        : only?.tool === 'gdt' ? gdtSymbol(only.symbol).label : only?.tool === 'datum' ? `Baza ${only.letter}` : only?.tool === 'roughness' ? 'Chropowatość'
        : isShape(only) ? SHAPE_LABELS[only.shape] : isArray(only) ? `${ARRAY_LABELS[only.kind]} · ${arraySize(only)}`
        : items.some(isElement) ? plural(items.length, 'element', 'elementy', 'elementów') : plural(items.length, 'kreska', 'kreski', 'kresek');
      // Wycinek (od 1.17): tylko kopiuj i osadź – rysunek się nie zmienia.
      const shape = !snip && isShape(only) ? only : null;
      editButton.hidden = Boolean(snip) || !(isTextual(only) || isBox(only));
      const sticky = !snip && only?.tool === 'sticky' ? only : null;
      collapseButton.hidden = !sticky;
      if (sticky) {
        const label = sticky.collapsed ? 'Rozwiń' : 'Zwiń';
        collapseButton.querySelector('.drawing__selection-label').textContent = label;
        collapseButton.setAttribute('aria-label', label);
        collapseButton.title = sticky.collapsed ? 'Rozwiń karteczkę' : 'Zwiń karteczkę do ikony';
        replaceChildren(collapseButton, icon(sticky.collapsed ? 'plus' : 'minus', { size: 18 }), h('span', { class: 'drawing__selection-label' }, label));
      }
      shapeTextButton.hidden = !shape;
      fillButton.hidden = !shape || !canFill(shape);
      capsButton.hidden = !shape || !isSegment(shape);
      // Magnes (od 1.22): przy odcinku, strzałce i karteczce ze strzałką.
      // Od 1.22.1 także strzałka ramki tolerancji, trójkąt bazy i wierzchołek chropowatości.
      const withEnds = Boolean(shape && isSegment(shape)) || Boolean(sticky?.leader) || (!snip && selection.size === 1 && isSymbol(only));
      magnetButton.hidden = !withEnds;
      if (withEnds) {
        const label = tools.edgeSnap ? 'Przyciąganie wł.' : 'Przyciąganie wył.';
        magnetButton.setAttribute('aria-pressed', String(tools.edgeSnap));
        magnetButton.querySelector('.drawing__selection-label').textContent = label;
      }
      // Tabel i karteczek (od 1.21) nie powiela się w szyku.
      arrayButton.hidden = Boolean(snip) || items.some(isBox);
      arrayButton.setAttribute('aria-label', isArray(only) ? 'Szyk – parametry' : 'Szyk');
      explodeButton.hidden = Boolean(snip) || !isArray(only);
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
      // Od 1.19 – pod paskiem w jego obecnej wysokości (przy zaznaczaniu na iPadzie pasek ma dwa wiersze).
      const toolbarBottom = Math.max(view.top, topBar.getBoundingClientRect().bottom - stage.getBoundingClientRect().top + 8);
      selectionBar.style.top = `${above >= toolbarBottom ? above : Math.min(bottom + 8, view.height - height - 8)}px`;
    }
    /** Podpowiedź przy zaznaczaniu: co zaznaczy kierunek obrysu, a w trakcie – co właśnie zaznaczasz. */
    function updateSelectHint() {
      const outlining = active?.kind === 'marquee' || active?.kind === 'lasso';
      const show = tool === 'select' && (outlining || (selection.size === 0 && !snip && !active));
      selectHint.hidden = !show;
      if (!show) return;
      const mode = outlining ? selectModeOf(active) : null;
      // Od 1.17 prawy przycisk myszy (albo przycisk na rysiku) robi wycinek – podpowiedź, gdy jest mysz.
      const rightButton = selectMode() !== 'snip' && finePointer ? ' · prawy przycisk – wycinek' : '';
      selectHint.textContent = outlining
        ? (mode === 'snip' ? 'Wycinek – wszystko w obszarze, z tłem' : mode === 'region' ? 'Zaznaczasz fragmenty – tylko wnętrze' : 'Zaznaczasz całe kreski')
        : ctrlHold ? `Ctrl: zaznaczanie (${SELECT_MODE_LABELS[selectMode()]}) – puść Ctrl, żeby wrócić do poprzedniego narzędzia`
          : SELECT_HINTS[selectMode() === 'auto' ? tools.selectShape : selectMode()] + rightButton;
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
        // Narzędzie wybrane przy przytrzymanym Ctrl (od 1.19) – zostaje po puszczeniu klawisza.
        ctrlHold = null;
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
    // Od 1.21: tabela (to samo okno tabeli co w notatce) i karteczka.
    const tableButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Tabela', title: 'Tabela', dataset: { testid: 'drawing-insert-table' },
      onClick: () => editTable()
    }, icon('table', { size: 24 }));
    const stickyButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Karteczka', title: 'Karteczka – notatka na rysunku', dataset: { testid: 'drawing-insert-sticky' },
      onClick: () => editSticky()
    }, icon('sticky', { size: 24 }));
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
        onClick: () => {
          tools.selectMode = mode;
          if (ctrlHold) ctrlHold.mode = mode;
          saveTools(tools);
          updateToolbar();
          requestLive();
        }
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
      type: 'button', class: 'drawing__chip drawing__chip--paper', 'aria-haspopup': 'dialog', dataset: { testid: 'drawing-paper' }, hidden: Boolean(drawing.photo),
      onClick: () => togglePaperPanel()
    }, paperLabel, h('span', { class: 'drawing__narrow-label' }, 'Tło'));
    const guideButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Liniuszek', title: 'Liniuszek – równoległe linie, do których przyciąga się kreska',
      'aria-pressed': 'false', dataset: { testid: 'drawing-guide' }, onClick: () => toggleGuide()
    }, icon('guide', { size: 24 }));
    // Grupy narzędzi zawijają się w całości (na telefonie – w kilku wierszach).
    const toolbar = h('div', { class: 'drawing__toolbar', role: 'toolbar', 'aria-label': 'Narzędzia rysunku' },
      h('div', { class: 'drawing__group' }, penButton, highlighterButton, eraserButton, selectButton, shapeButton, textButton, mathButton),
      h('div', { class: 'drawing__group' }, tableButton, stickyButton),
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
    // Kartki (od 1.19): numer bieżącej i menu – nowa kartka, przejście do innej, usunięcie dodanej.
    const pageText = h('span', { dataset: { testid: 'drawing-page-number' } });
    const pagePill = h('button', {
      type: 'button', class: 'drawing__pill', 'aria-haspopup': 'menu', title: 'Kartki – nowa kartka, przejście do innej, usunięcie',
      dataset: { testid: 'drawing-pages' }, onClick: () => openPageMenu()
    }, icon('paper', { size: 14 }), pageText, icon('chevronDown', { size: 14 }));
    // Od 1.22: poprzednia i następna kartka jednym dotknięciem (na iPadzie palce przesuwają stronę, kółka nie ma).
    const pageStep = (step, label, name, testID) => h('button', {
      type: 'button', class: 'drawing__pill drawing__pill--icon', 'aria-label': label, title: `${label} (${step < 0 ? 'PageUp' : 'PageDown'} albo kółko myszy)`,
      hidden: true, dataset: { testid: testID }, onClick: () => flipTo(pageIndex + step)
    }, icon(name, { size: 16 }));
    const pagePrev = pageStep(-1, 'Poprzednia kartka', 'chevronLeft', 'drawing-page-prev');
    const pageNext = pageStep(1, 'Następna kartka', 'chevronRight', 'drawing-page-next');
    const status = h('div', { class: 'drawing__status' }, notice, penPill, selectHint, lengthPill, guidePill, rulerPill, perpendicularButton, pagePrev, pagePill, pageNext, zoomButton);
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
      const sizes = highlighter ? tools.highlighterWidths.map((width) => width / 3) : tools.penWidths.map((width) => (width.min + width.max) / 1.4);
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
      for (const button of selectModes.children) button.setAttribute('aria-checked', String(button.dataset.mode === selectMode()));
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
      paperButton.title = paperLabel.textContent;
      paperButton.setAttribute('aria-expanded', String(!paperPanel.hidden));
    }
    function updateGuidePill() {
      guidePill.hidden = !guide;
      if (!guide) return;
      const settings = tools.guide;
      guideText.textContent = radialGuide()
        ? `Promieniowy · okręgi co ${formatLength(settings.ringSpacing * PAPER_STEP, drawing.scale)}${settings.rays ? ` · promienie co ${settings.rayStep}°` : ''}`
        : `Liniuszek ${((settings.angle % 180) + 180) % 180}° · co ${formatLength(settings.spacing * PAPER_STEP, drawing.scale)}`
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
        renderHighlighterSettings();
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

    /**
     * Ustawienia zakreślacza (od 1.21 – jak pióra): grubość każdej z trzech kropek suwakiem, podgląd
     * zakreślenia na przykładowym tekście. Grubość zostaje na tym urządzeniu.
     */
    function renderHighlighterSettings() {
      const names = ['Cienka', 'Średnia', 'Gruba'];
      const value = h('span');
      const range = h('input', {
        type: 'range', class: 'drawing__range', min: HIGHLIGHTER_RANGE.min, max: HIGHLIGHTER_RANGE.max, step: 1,
        'aria-label': 'Grubość zakreślacza', dataset: { testid: 'drawing-highlighter-width' },
        onInput: (event) => {
          tools.highlighterWidths[tools.highlighterWidth] = Number(event.target.value);
          saveTools(tools);
          refresh();
          updateToolbar();
        }
      });
      const levels = names.map((name, index) => h('button', {
        type: 'button', role: 'radio', dataset: { value: String(index), testid: `drawing-highlighter-level-${index}` },
        onClick: () => { tools.highlighterWidth = index; saveTools(tools); refresh(); updateToolbar(); }
      }, name));
      const canvas = h('canvas', { class: 'drawing__preview', width: 656, height: 144, 'aria-hidden': 'true' });
      function refresh() {
        const width = tools.highlighterWidths[tools.highlighterWidth];
        range.value = String(width);
        range.style.setProperty('--fill-to', `${((width - HIGHLIGHTER_RANGE.min) / (HIGHLIGHTER_RANGE.max - HIGHLIGHTER_RANGE.min)) * 100}%`);
        value.textContent = String(width);
        for (const button of levels) button.setAttribute('aria-checked', String(Number(button.dataset.value) === tools.highlighterWidth));
        const ctx = canvas.getContext('2d');
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.clearRect(0, 0, 328, 72);
        ctx.fillStyle = '#1d1d1f';
        ctx.font = `22px ${TEXT_FONT}`;
        ctx.textBaseline = 'middle';
        ctx.fillText('Ważne pojęcie do zapamiętania', 14, 36);
        paintStroke(ctx, { tool: 'highlighter', color: highlighterHex(tools.highlighterColor), points: [10, 37, width, 318, 37, width] });
      }
      replaceChildren(settings,
        h('h3', { class: 'drawing__settings-title' }, 'Zakreślacz'),
        h('p', { class: 'drawing__settings-label' }, 'Kropka na pasku'),
        h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Kropka na pasku' }, levels),
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Grubość'), value),
        range,
        h('p', { class: 'drawing__settings-label' }, 'Podgląd'),
        canvas,
        h('p', { class: 'field__hint' }, 'Każda z trzech kropek na pasku ma swoją grubość; kolor wybierasz kółkami. Zakreślacz nie zasłania tuszu pod spodem. Ustawienia zostają na tym urządzeniu.'));
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
      if (colorTab === 'grid' || colorTab === 'sliders') {
        const part = colorTabBody(colorTab, { prefix: 'drawing', getColor: () => colorDraft, setColor: setDraft });
        body = part.body;
        sync = part.sync;
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
    /** Styl liczb wymiarów (od 1.22.1) – zapisywany z rysunkiem, jak skala. */
    function setDimStyle(value) {
      if ((drawing.dimStyle === 'technical') === (value === 'technical')) return;
      if (value === 'technical') drawing.dimStyle = 'technical';
      else delete drawing.dimStyle;
      changed = true;
      requestRender();
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
      // Od 1.22.1: liczby wymiarów na rysunku – z jednostką („5 cm”) albo technicznie, w milimetrach („50”).
      const dimStyleControl = segmented({
        name: `drawing-dim-style-${Date.now()}`, label: 'Liczby wymiarów', value: drawing.dimStyle === 'technical' ? 'technical' : 'unit',
        options: [{ value: 'unit', label: '„5 cm”' }, { value: 'technical', label: '„50” (mm)' }],
        onChange: (value) => setDimStyle(value)
      });
      dimStyleControl.dataset.testid = 'drawing-dim-style';
      replaceChildren(rulerPanel,
        h('h3', { class: 'drawing__settings-title' }, 'Linijka i skala'),
        h('p', { class: 'drawing__settings-label' }, 'Skala rysunku'),
        h('div', { class: 'drawing__scale' }, h('span', null, '1 kratka ='), valueInput, unitSelect),
        screenText,
        h('p', { class: 'drawing__settings-label' }, 'Liczby wymiarów na rysunku'),
        dimStyleControl,
        h('p', { class: 'field__hint' }, '„50” – jak w rysunku technicznym: milimetry (przy jednostkach imperialnych – cale), bez jednostki.'),
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
    /** Odświeża wpisaną wielkość szablonu po przeciągnięciu narożnika (bez przebudowy panelu). */
    let refreshPlacementSize = null;
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
      const sizeInput = h('input', {
        class: 'drawing__placement-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Wielkość szablonu w procentach',
        dataset: { testid: 'drawing-template-size' },
        onKeydown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
          }
        },
        onChange: (event) => {
          const percent = parseDecimal(event.target.value);
          if (percent === null || percent <= 0) {
            flash('Wpisz wielkość w procentach, np. 85.');
            event.target.value = formatNumber(templatePercent(drawing.template, drawing.width, drawing.height));
            return;
          }
          set(setTemplatePercent(drawing.template, percent, drawing.width, drawing.height));
        }
      });
      sizeInput.value = formatNumber(templatePercent(template, drawing.width, drawing.height));
      refreshPlacementSize = () => {
        if (document.activeElement !== sizeInput) sizeInput.value = formatNumber(templatePercent(drawing.template, drawing.width, drawing.height));
      };
      const parts = [
        h('h3', { class: 'drawing__settings-title' }, `${TEMPLATE_LABELS[template.source]}: wielkość i miejsce`),
        h('div', { class: 'drawing__placement' },
          h('button', { type: 'button', class: 'drawing__chip drawing__chip--square', 'aria-label': 'Pomniejsz', dataset: { testid: 'drawing-template-smaller' },
            onClick: () => set(scaleTemplate(template, 1 / 1.1, drawing.width, drawing.height)) }, icon('minus', { size: 18 })),
          // Od 1.19 wielkość wpisywana (np. 87,5) – Enter albo wyjście z pola.
          h('label', { class: 'drawing__placement-size', title: 'Wielkość szablonu – 100% to dopasowany do strony' }, sizeInput, h('span', { 'aria-hidden': 'true' }, '%')),
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
        h('p', { class: 'field__hint' }, 'Przeciągnij szablon na stronie palcem, rysikiem albo myszą (dwa palce nadal powiększają stronę); narożnik – zmienia wielkość '
          + '(przeciwny narożnik zostaje). Wielkość wpiszesz też w polu z procentami. Po „Gotowe” szablon się nie przesuwa.'),
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
            // Odcinek i strzałka (od 1.19): panel zostaje – pod spodem wybór zakończeń.
            if (isSegment({ shape: kind })) renderShapePanel();
            else closeSettings();
            updateToolbar();
          }
        }, icon(SHAPE_ICONS[kind], { size: 26 }), h('span', null, SHAPE_LABELS[kind])))),
        // Od 1.22.1: symbole metrologiczne – okno, potem dotknięcie krawędzi albo narożnika.
        h('p', { class: 'drawing__settings-label' }, 'Symbole metrologiczne'),
        h('div', { class: 'drawing__shape-kinds drawing__shape-kinds--symbols' }, [
          ['gdt', 'gdtFrame', 'Ramka tolerancji', () => editGdt()],
          ['datum', 'datumMark', 'Baza', () => editDatum()],
          ['roughness', 'roughness', 'Chropowatość', () => editRoughness()]
        ].map(([kind, iconName, label, open]) => h('button', {
          type: 'button', class: 'drawing__shape-kind', dataset: { testid: `drawing-symbol-${kind}` },
          onClick: () => {
            closeSettings();
            updateToolbar();
            open();
          }
        }, icon(iconName, { size: 26 }), h('span', null, label)))),
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
        // Od 1.19: zakończenia nowych odcinków i strzałek (zaznaczonego – przyciskiem „Końce”).
        isSegment({ shape: tools.shape }) ? capChoices(segmentDefaultCaps(), 'drawing-caps-default', (caps) => {
          tools[tools.shape === 'arrow' ? 'arrowCaps' : 'lineCaps'] = caps;
          saveTools(tools);
          renderShapePanel();
        }) : null,
        h('div', { class: 'drawing__settings-switch' }, lockToggle()),
        h('div', { class: 'drawing__settings-switch' }, edgeSnapToggle()),
        h('p', { class: 'field__hint' }, 'Przeciągnij po stronie – kształt powstaje w prostokącie przeciągnięcia (odcinek i strzałka – od początku do końca); '
          + 'dotknięcie – kształt w tym miejscu. Kolor i grubość – jak pióra; wypełnienie jasne jest przejrzyste. Punkty zaznaczonego kształtu: '
          + 'narożniki i boki – szerokość i wysokość, romb na górnej krawędzi – pochylenie, kółko nad kształtem – obrót, pomarańczowy punkt – '
          + 'wierzchołek trójkąta albo wcięcie trapezu. Wymiary i kąt pochylenia wpiszesz w polach przy ramce (oko przy polu – wymiar zostaje '
          + 'na rysunku), tekst – przyciskiem „Tekst” albo dotknięciem zaznaczonego kształtu. Z klawiszem Shift (albo z włączonymi '
          + 'proporcjami): kwadrat, koło, odcinek co 15°, narożnik bez zmiany proporcji.'));
      updateToolbar();
    }
    /** Przyciąganie końców odcinka i strzałki do krawędzi i narożników (od 1.22) – na urządzeniu; Alt – chwilowo swobodnie. */
    function edgeSnapToggle() {
      const snap = toggle({
        checked: tools.edgeSnap, label: 'Końce odcinka i strzałki przyciągane do krawędzi i narożników (z Alt – swobodnie)',
        onChange: (checked) => {
          tools.edgeSnap = checked;
          saveTools(tools);
          updateToolbar();
        }
      });
      snap.querySelector('input').dataset.testid = 'drawing-edge-snap';
      return snap;
    }
    /** Proporcje jak z Shift (od 1.19) – na iPadzie i iPhonie bez klawiatury. */
    function lockToggle() {
      const lock = toggle({
        checked: tools.shapeLock, label: 'Proporcje jak z Shift: kwadrat, koło, kąty co 15°',
        onChange: (checked) => {
          tools.shapeLock = checked;
          saveTools(tools);
        }
      });
      lock.querySelector('input').dataset.testid = 'drawing-lock-proportions';
      return lock;
    }
    /** Zakończenia nowego odcinka albo strzałki (wybrane w panelu kształtów). */
    const segmentDefaultCaps = () => ({ ...(tools.shape === 'arrow' ? tools.arrowCaps : tools.lineCaps) });
    /**
     * Wybór zakończeń odcinka (od 1.19): dwa wiersze – początek i koniec – po sześć przycisków z ikoną.
     * onPick({ start, end }) po każdej zmianie.
     */
    function capChoices(caps, testID, onPick) {
      const row = (which, label) => h('div', { class: 'drawing__caps-row' },
        h('span', { class: 'drawing__caps-label' }, label),
        h('div', { class: 'drawing__caps', role: 'radiogroup', 'aria-label': `${label} odcinka` }, SEGMENT_CAPS.map((cap) => h('button', {
          type: 'button', class: `drawing__cap${which === 'start' ? ' drawing__cap--start' : ''}`, role: 'radio', 'aria-checked': String(caps[which] === cap),
          'aria-label': `${label}: ${SEGMENT_CAP_LABELS[cap].toLowerCase()}`, title: SEGMENT_CAP_LABELS[cap], dataset: { testid: `${testID}-${which}-${cap}` },
          onClick: (event) => {
            caps[which] = cap;
            for (const button of event.currentTarget.parentNode.children) button.setAttribute('aria-checked', String(button === event.currentTarget));
            onPick({ ...caps });
          }
        }, icon(CAP_ICONS[cap], { size: 22 })))));
      return h('div', { class: 'drawing__caps-group' },
        h('p', { class: 'drawing__settings-label' }, 'Zakończenia odcinka'),
        row('start', 'Początek'), row('end', 'Koniec'));
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
        crossAngle: range('crossAngle', 10, 170, 1, 'Kąt linii poprzecznych'),
        ringSpacing: range('ringSpacing', 0.25, 6, 0.25, 'Odstęp okręgów'),
        rayAngle: range('rayAngle', -90, 90, 1, 'Obrót promieni')
      };
      // Krok promieni (od 1.22) – tylko dzielniki 360°, suwak po kolejnych wartościach.
      const rayStep = h('input', {
        type: 'range', class: 'drawing__range', min: 0, max: RAY_STEPS.length - 1, step: 1, 'aria-label': 'Promienie co (stopnie)',
        dataset: { testid: 'drawing-guide-rayStep' },
        onInput: (event) => {
          settings.rayStep = RAY_STEPS[Number(event.target.value)];
          changedGuide();
        }
      });
      const texts = Object.fromEntries([...Object.keys(ranges), 'rayStep'].map((key) => [key, h('span')]));
      const squares = (value) => (Number.isInteger(value) ? plural(value, 'kratka', 'kratki', 'kratek') : `${formatNumber(value)} kratki`);
      const quick = (key, values, unit = '°') => h('div', { class: 'drawing__quick' }, values.map((value) => chip(`${value}${unit}`, `drawing-guide-${key}-${value}`, () => {
        settings[key] = value;
        changedGuide();
      })));
      const switchRow = (label, key, testID, extra = () => {}) => {
        const row = toggle({ checked: settings[key], label, onChange: (checked) => { settings[key] = checked; extra(); changedGuide(); } });
        row.querySelector('input').dataset.testid = testID;
        return h('div', { class: 'drawing__settings-switch' }, row);
      };
      const kind = segmented({
        name: `drawing-guide-kind-${Date.now()}`, label: 'Rodzaj liniuszka', value: settings.kind,
        options: [{ value: 'lines', label: 'Równoległy' }, { value: 'radial', label: 'Promieniowy' }],
        onChange: (value) => {
          settings.kind = value;
          changedGuide();
        }
      });
      kind.dataset.testid = 'drawing-guide-kind';
      const crossBlock = h('div', null,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Odstęp poprzecznych'), texts.crossSpacing), ranges.crossSpacing,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Kąt poprzecznych względem linii'), texts.crossAngle), ranges.crossAngle,
        quick('crossAngle', [60, 75, 90]));
      const linesBlock = h('div', null,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Odstęp linii'), texts.spacing), ranges.spacing,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Kąt linii'), texts.angle), ranges.angle,
        quick('angle', [0, 45, 90]),
        switchRow('Linie poprzeczne', 'cross', 'drawing-guide-cross'),
        crossBlock);
      const rayBlock = h('div', null,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Promienie co'), texts.rayStep), rayStep,
        quick('rayStep', [15, 30, 45]),
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Obrót'), texts.rayAngle), ranges.rayAngle,
        quick('rayAngle', [0, 15, 45]));
      const radialBlock = h('div', null,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Odstęp okręgów'), texts.ringSpacing), ranges.ringSpacing,
        switchRow('Promienie ze środka', 'rays', 'drawing-guide-rays'),
        rayBlock);
      const hint = h('p', { class: 'field__hint' });
      function refresh() {
        for (const [key, input] of Object.entries(ranges)) {
          input.value = String(settings[key]);
          input.style.setProperty('--fill-to', `${((settings[key] - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`);
        }
        const stepIndex = Math.max(0, RAY_STEPS.indexOf(settings.rayStep));
        rayStep.value = String(stepIndex);
        rayStep.style.setProperty('--fill-to', `${(stepIndex / (RAY_STEPS.length - 1)) * 100}%`);
        texts.spacing.textContent = `${squares(settings.spacing)} · ${formatLength(settings.spacing * PAPER_STEP, drawing.scale)}`;
        texts.angle.textContent = `${settings.angle}°`;
        texts.crossSpacing.textContent = `${squares(settings.crossSpacing)} · ${formatLength(settings.crossSpacing * PAPER_STEP, drawing.scale)}`;
        texts.crossAngle.textContent = settings.crossAngle === 90 ? '90° – prostopadle' : `${settings.crossAngle}°`;
        texts.ringSpacing.textContent = `${squares(settings.ringSpacing)} · ${formatLength(settings.ringSpacing * PAPER_STEP, drawing.scale)}`;
        texts.rayStep.textContent = `${settings.rayStep}° · ${plural(360 / settings.rayStep, 'promień', 'promienie', 'promieni')}`;
        texts.rayAngle.textContent = `${settings.rayAngle}°`;
        crossBlock.hidden = !settings.cross;
        linesBlock.hidden = settings.kind === 'radial';
        radialBlock.hidden = settings.kind !== 'radial';
        rayBlock.hidden = !settings.rays;
        hint.textContent = settings.kind === 'radial'
          ? 'Kreska zaczęta przy okręgu i prowadzona wzdłuż niego biegnie po łuku, przy promieniu i wzdłuż niego – prosto po promieniu; '
            + 'w innym kierunku – zwykła kreska. Kółko na stronie to środek (przesuwasz je; przyskakuje do węzłów kratki). Liniuszek nie trafia do rysunku.'
          : 'Kreska zaczęta przy linii i prowadzona wzdłuż niej biegnie prosto po linii (także po poprzecznej); '
            + 'w innym kierunku – zwykła kreska. Kółko na stronie przesuwa liniuszek (przyskakuje do węzłów kratki). Liniuszek nie trafia do rysunku.';
      }
      function changedGuide() {
        saveTools(tools);
        refresh();
        updateGuidePill();
        requestLive();
      }
      replaceChildren(guidePanel,
        h('h3', { class: 'drawing__settings-title' }, 'Liniuszek'),
        kind,
        linesBlock,
        radialBlock,
        switchRow('Przyciąganie kreski do linii', 'snap', 'drawing-guide-snap'),
        hint);
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

    // ---- kartki (od 1.19): kilka rysunków w jednym oknie – po „Gotowe” każda kartka to osobny rysunek notatki
    /** Najwięcej kartek w jednym oknie (notatka ma najwyżej 30 obrazów). */
    const PAGE_LIMIT = 20;
    /** Kartka: rysunek, jego historia, wczytane obrazy (zdjęcie, szablon) i obietnica ich wczytania. */
    function makePage(pageDrawing, pageHistory = new DrawingHistory(pageDrawing.strokes)) {
      const page = { drawing: pageDrawing, history: pageHistory, media: { photo: null, template: null }, changed: false };
      const loaded = (key) => (image) => {
        page.media[key] = image;
        if (page === pages[pageIndex]) requestRender();
      };
      page.ready = Promise.all([loadPicture(pageDrawing.photo).then(loaded('photo')), loadPicture(pageDrawing.template).then(loaded('template'))]);
      return page;
    }
    const pageTitle = () => (pageIndex === 0 ? title : `${title} · kartka ${pageIndex + 1}`);
    function updatePagePill() {
      pageText.textContent = `Kartka ${pageIndex + 1} z ${pages.length}`;
      pagePrev.hidden = pages.length < 2;
      pageNext.hidden = pages.length < 2;
      pagePrev.disabled = pageIndex === 0;
      pageNext.disabled = pageIndex === pages.length - 1;
      headerTitle.textContent = pageTitle();
      live.setAttribute('aria-label', `Płótno rysunku: ${pageTitle()}`);
    }
    /** Przejście na kartkę `index`: zaznaczenie znika, widok – cała strona. */
    function showPage(index) {
      if (index === pageIndex || index < 0 || index >= pages.length || active) return;
      clearSelection();
      closeSettings();
      pages[pageIndex].changed = changed;
      pageIndex = index;
      ({ drawing, history, media, changed } = pages[index]);
      measured = null;
      pasteCount = 0;
      paperButton.hidden = Boolean(drawing.photo);
      // Najpierw pasek tej kartki (może mieć inną wysokość – np. przycisk tła z szablonem), potem układ strony pod nim.
      updatePagePill();
      updateToolbar();
      view.zoom = 1;
      view.width = 0;
      resize();
      zoomButton.textContent = '100%';
      requestRender();
    }
    /**
     * Przejście na kartkę `index` z animacją (od 1.22): kartka unosi się od dolnej krawędzi i przewraca
     * do góry (następna), a poprzednia opada z góry – jak w notesie zszytym u góry. Zdjęcia stron
     * (płótno zapisanych kresek przed zmianą i po niej) rysuje osobne płótno nad stroną; bez animacji,
     * gdy system prosi o ograniczenie ruchu.
     */
    const FLIP_MS = 520;
    let flipping = null;
    function flipTo(index) {
      if (index === pageIndex || index < 0 || index >= pages.length || active) return;
      // Kolejne dotknięcie w trakcie animacji – poprzednia kończy się od razu.
      if (flipping) {
        flipping = null;
        flipCanvas.hidden = true;
      }
      const motion = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && base.width > 0;
      const before = motion ? snapshotBase() : null;
      const forward = index > pageIndex;
      showPage(index);
      if (!motion) return;
      renderBase();
      flipping = { forward, before, after: snapshotBase(), page: pageRect(), start: performance.now() };
      flipCanvas.width = base.width;
      flipCanvas.height = base.height;
      flipCanvas.hidden = false;
      // Pierwsza klatka od razu – inaczej przez chwilę widać już nową kartkę.
      stepFlip(flipping.start);
    }
    function snapshotBase() {
      const copy = document.createElement('canvas');
      copy.width = base.width;
      copy.height = base.height;
      copy.getContext('2d').drawImage(base, 0, 0);
      return copy;
    }
    /** Strona na płótnie (piksele urządzenia). */
    const pageRect = () => ({ x: view.x * view.dpr, y: view.y * view.dpr, w: drawing.width * view.scale * view.dpr, h: drawing.height * view.scale * view.dpr });
    function stepFlip(now) {
      if (!flipping) return;
      const t = Math.min(1, (now - flipping.start) / FLIP_MS);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const ctx = flipCanvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, flipCanvas.width, flipCanvas.height);
      const { page } = flipping;
      if (flipping.forward) {
        // Następna: stara kartka unosi się – zgięcie od dołu do góry.
        paintCurl(ctx, flipping.before, page, page.y + page.h * (1 - eased), 1 - Math.max(0, (t - 0.7) / 0.3));
      } else {
        // Poprzednia: pod spodem stara kartka, nowa opada z góry – zgięcie od góry do dołu.
        ctx.drawImage(flipping.before, 0, 0);
        paintCurl(ctx, flipping.after, page, page.y + page.h * eased, Math.min(1, t / 0.3));
      }
      if (t < 1) {
        requestAnimationFrame(stepFlip);
      } else {
        flipping = null;
        flipCanvas.hidden = true;
      }
    }
    /**
     * Kartka `image` zgięta na wysokości `fold`: nad zgięciem leży płasko, część spod zgięcia jest
     * odbita do góry (odwrót kartki – jasny papier z przebijającym rysunkiem i cieniem przy zgięciu),
     * a pod zgięciem pada cień na kartkę pod spodem. flapAlpha – przezroczystość odwiniętej części.
     */
    function paintCurl(ctx, image, page, fold, flapAlpha) {
      const bottom = page.y + page.h;
      const margin = 30 * view.dpr;
      ctx.save();
      ctx.beginPath();
      ctx.rect(page.x - margin, page.y - margin, page.w + margin * 2, Math.max(0, fold - page.y + margin));
      ctx.clip();
      ctx.drawImage(image, 0, 0);
      ctx.restore();
      const flap = bottom - fold;
      if (flap <= 0.5) return;
      // Cień odwiniętej części na kartce pod spodem.
      const shadow = Math.min(flap, 36 * view.dpr);
      const below = ctx.createLinearGradient(0, fold, 0, fold + shadow);
      below.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
      below.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = below;
      ctx.fillRect(page.x, fold, page.w, shadow);
      ctx.save();
      ctx.globalAlpha = flapAlpha;
      ctx.beginPath();
      ctx.rect(page.x, fold - flap, page.w, flap);
      ctx.clip();
      ctx.fillStyle = '#f7f7f8';
      ctx.fillRect(page.x, fold - flap, page.w, flap);
      ctx.save();
      ctx.globalAlpha = flapAlpha * 0.12;
      ctx.translate(0, fold * 2);
      ctx.scale(1, -1);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
      const shade = ctx.createLinearGradient(0, fold, 0, fold - Math.min(flap, 140 * view.dpr));
      shade.addColorStop(0, 'rgba(0, 0, 0, 0.16)');
      shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shade;
      ctx.fillRect(page.x, fold - flap, page.w, flap);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = flapAlpha * 0.35;
      ctx.strokeStyle = '#8e8e93';
      ctx.lineWidth = view.dpr;
      ctx.beginPath();
      ctx.moveTo(page.x, fold - flap);
      ctx.lineTo(page.x + page.w, fold - flap);
      ctx.stroke();
      ctx.restore();
    }

    /** Nowa kartka za ostatnią: to samo tło (zdjęcie – kratka), jasność linii i skala, bez szablonu. */
    function addPage() {
      if (pages.length >= PAGE_LIMIT) {
        flash(`W jednym oknie najwyżej ${PAGE_LIMIT} kartek.`);
        return;
      }
      const next = {
        ...emptyDrawing({ paper: drawing.photo ? 'grid' : drawing.paper }), paperLevel: drawing.paperLevel ?? DEFAULT_PAPER_LEVEL, scale: { ...drawing.scale },
        ...(drawing.dimStyle ? { dimStyle: drawing.dimStyle } : {})
      };
      pages.push(makePage(next));
      showPage(pages.length - 1);
      flash(`Kartka ${pages.length} – po „Gotowe” trafi do notatki jako osobny rysunek.`);
    }
    /** Usuwa dodaną kartkę (pierwsza to rysunek z notatki – zostaje); kartka z kreskami – po potwierdzeniu. */
    async function deletePage() {
      const index = pageIndex;
      if (index === 0) return;
      if (hasContent(drawing) && !(await confirmDialog({
        title: `Usunąć kartkę ${index + 1}?`, message: 'Kreski z tej kartki przepadną.', confirmLabel: 'Usuń', cancelLabel: 'Zostaw', destructive: true
      }))) return;
      showPage(index - 1);
      pages.splice(index, 1);
      updatePagePill();
    }
    function openPageMenu() {
      openMenu({
        title: 'Kartki',
        items: [
          { label: 'Nowa kartka', icon: 'plus', testID: 'drawing-page-new', onSelect: () => addPage() },
          pages.length > 1 ? 'separator' : null,
          ...(pages.length > 1 ? pages.map((_, index) => ({
            label: index === 0 ? `Kartka 1 – ${title}` : `Kartka ${index + 1}`, checked: index === pageIndex, testID: `drawing-page-${index + 1}`,
            onSelect: () => flipTo(index)
          })) : []),
          pageIndex > 0 ? 'separator' : null,
          pageIndex > 0 ? { label: 'Usuń tę kartkę', icon: 'trash', destructive: true, testID: 'drawing-page-delete', onSelect: () => deletePage() } : null
        ]
      });
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
      // Przyklejone końce (od 1.22) – w miejscach na swoich kształtach, w tym samym kroku cofania.
      history.begin();
      const replaced = resolveAttachments(drawing.strokes, elementBox);
      if (replaced.size > 0 && selection.size > 0) selection = new Set([...selection].map((stroke) => replaced.get(stroke) ?? stroke));
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
      const kept = keptTarget();
      // Przesunięty bez elementu, do którego był przyklejony (od 1.22), odkleja się od niego; karteczka
      // przesuwana sama zostawia koniec strzałki na miejscu – ten zostaje przyklejony.
      const ids = new Set([...selection].map((stroke) => stroke.id).filter(Boolean));
      history.begin();
      drawing.strokes.forEach((stroke, index) => {
        if (!selection.has(stroke)) return;
        const next = stroke === kept ? movedSticky(stroke, dx, dy) : translateStroke(stroke, dx, dy);
        drawing.strokes[index] = next.attach && stroke !== kept ? keepLinksTo(next, ids) : next;
        moved.add(drawing.strokes[index]);
      });
      commitStep();
      selection = moved;
      updateToolbar();
      requestRender();
    }
    /** Karteczka ze strzałką (od 1.22.1 też ramka tolerancji i znak bazy) przesuwana sama – koniec strzałki zostaje tam, gdzie wskazuje; inaczej null. */
    function keptTarget() {
      const [only] = selection;
      return selection.size === 1 && ['sticky', 'gdt', 'datum'].includes(only?.tool) && only.leader ? only : null;
    }
    const movedSticky = (sticky, dx, dy) => ({ ...translateStroke(sticky, dx, dy), leader: sticky.leader });

    /** Kopie zaznaczonych kresek obok, zaznaczone. Fragment – kopia samego wnętrza (oryginał zostaje w całości). */
    function duplicateSelection() {
      const items = orderedSelection();
      if (items.length === 0) return;
      dropRegion();
      history.begin();
      // Kopie (od 1.22) z nowymi identyfikatorami – przyklejone między sobą zostają przyklejone.
      const copies = relinkCopies(items.map((stroke) => translateStroke(stroke, DUPLICATE_OFFSET, DUPLICATE_OFFSET)), drawing.strokes);
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
      copyImage(canvasBlob(strokesCanvas(items, drawing.scale)));
      pasteCount = 0;
      updateToolbar();
      flash(`${done} – „Wklej” na pasku zaznaczania albo Ctrl+V, także w innym rysunku.`);
      return true;
    }
    /** Zdjęcie i szablon z pliku wczytane – dopiero wtedy obraz wycinka jest pełny. */
    const mediaReady = () => pages[pageIndex].ready;
    /** Obraz wycinka: wszystko, co widać na stronie w obszarze (tło, kratka, zdjęcie, szablon, kreski), poza nim – przezroczyście. */
    function snipCanvas(area) {
      const { polygon } = area;
      return areaCanvas(area.bounds, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(polygon[0], polygon[1]);
        for (let index = 2; index < polygon.length; index += 2) ctx.lineTo(polygon[index], polygon[index + 1]);
        ctx.closePath();
        ctx.clip();
        paintDrawing(ctx, drawing, media, null, null, { image: true });
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
        const canvas = area ? snipCanvas(area) : strokesCanvas(items, drawing.scale);
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
          // Symbole (od 1.20): %, °, §, ⌀ … w miejscu kursora.
          symbolField(input, { testID: 'drawing-symbols' }),
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
    // ---- zakończenia odcinka i szyk (od 1.19)
    /** Zakończenia zaznaczonego odcinka albo strzałki – okno z wyborem dla początku i końca. */
    function chooseCaps() {
      const [only] = selection;
      if (selection.size !== 1 || !isShape(only) || !isSegment(only)) return;
      const caps = segmentCaps(only);
      let picked = null;
      openFormSheet({
        title: 'Zakończenia odcinka',
        build: () => [capChoices(caps, 'drawing-caps', (next) => Object.assign(caps, next))],
        onSubmit: () => { picked = { ...caps }; },
        onClose: () => {
          if (!picked || !drawing.strokes.includes(only)) return;
          const next = withCaps(only, picked);
          if (next.startCap === only.startCap && next.endCap === only.endCap) return;
          replaceShape(only, next);
          updateToolbar();
          requestRender();
        }
      });
    }
    /**
     * Szyk: nowy z zaznaczenia (szyki w zaznaczeniu – rozdzielone) albo zmiana parametrów zaznaczonego
     * szyku. Okno: rodzaj (liniowy, kołowy) i parametry; długości w skali rysunku, kąty w stopniach.
     */
    function editArray() {
      const [only] = selection;
      const editing = selection.size === 1 && isArray(only) ? only : null;
      const items = editing ? editing.items : orderedSelection().flatMap((stroke) => (isArray(stroke) ? expandArray(stroke) : [stroke]));
      if (snip || items.length === 0) return;
      const limit = Math.max(drawing.width, drawing.height) * 4;
      // Parametry obu rodzajów – przełączenie rodzaju nie gubi wpisanych wartości.
      const start = {
        linear: editing?.kind === 'linear' ? editing : arrayDefaults(items, 'linear', PAPER_STEP),
        polar: editing?.kind === 'polar' ? editing : arrayDefaults(items, 'polar', PAPER_STEP)
      };
      let kind = editing?.kind ?? tools.arrayKind ?? 'linear';
      const unit = scaleUnitLabel(drawing.scale);
      const length = (units) => formatNumber(toScaleLength(units, drawing.scale));
      const number = (name, label, value, suffix, hint = null) => {
        const id = `drawing-array-${name}-${Date.now()}`;
        const input = h('input', {
          id, class: 'input drawing__array-input', type: 'text', inputmode: suffix ? 'decimal' : 'numeric', autocomplete: 'off', value: String(value),
          dataset: { testid: `drawing-array-${name}` }
        });
        return {
          name, input,
          element: h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label),
            h('div', { class: 'drawing__array-value' }, input, suffix ? h('span', { 'aria-hidden': 'true' }, suffix) : null),
            hint ? h('p', { class: 'field__hint' }, hint) : null)
        };
      };
      const linear = [
        number('columns', 'Obiektów w rzędzie', start.linear.columns, null),
        number('dx', 'Odstęp w rzędzie', length(start.linear.dx), unit, 'Ujemny – w lewo.'),
        number('rows', 'Rzędów', start.linear.rows, null),
        number('dy', 'Odstęp rzędów', length(start.linear.dy), unit, 'Ujemny – w górę.')
      ];
      const polar = [
        number('count', 'Obiektów', start.polar.count, null),
        number('sweep', 'Kąt wypełnienia', formatNumber(start.polar.sweep), '°', '360° – pełne koło.'),
        number('radius', 'Promień', length(polarRadius({ ...start.polar, items })), unit, 'Do środka obiektu.'),
        number('rings', 'Pierścieni', start.polar.rings, null),
        number('ringStep', 'Odstęp pierścieni', length(start.polar.ringStep), unit)
      ];
      let rotate = start.polar.rotate;
      const rotateToggle = toggle({ checked: rotate, label: 'Obracaj obiekty razem z położeniem', onChange: (checked) => { rotate = checked; } });
      rotateToggle.querySelector('input').dataset.testid = 'drawing-array-rotate';
      const linearBox = h('div', { class: 'drawing__array-grid' }, linear.map((item) => item.element));
      const polarBox = h('div', { class: 'drawing__array-grid' }, polar.map((item) => item.element), h('div', { class: 'drawing__settings-switch drawing__array-wide' }, rotateToggle));
      const showKind = () => {
        linearBox.hidden = kind !== 'linear';
        polarBox.hidden = kind !== 'polar';
      };
      const kindSwitch = segmented({
        name: `drawing-array-kind-${Date.now()}`, label: 'Rodzaj szyku', value: kind,
        options: [{ value: 'linear', label: 'Liniowy' }, { value: 'polar', label: 'Kołowy' }],
        onChange: (value) => {
          kind = value;
          showKind();
        }
      });
      showKind();
      let made = null;
      openFormSheet({
        title: editing ? ARRAY_LABELS[editing.kind] : 'Powiel w szyku',
        submitLabel: editing ? 'Zapisz' : 'Utwórz szyk',
        build: () => [
          field('Rodzaj', kindSwitch),
          linearBox,
          polarBox,
          h('p', { class: 'field__hint' }, 'Odstęp – od początku jednego obiektu do początku następnego. Kołowy: obiekty idą przeciwnie do ruchu '
            + 'wskazówek zegara, środek szyku (kółko z krzyżykiem) przesuniesz na rysunku. Szyk to jeden element: przesuwasz go w całości, '
            + 'parametry zmienisz przyciskiem „Szyk” (albo dotknięciem szyku), a „Rozdziel” zamienia go na osobne elementy. Pierwsza kopia '
            + 'leży w miejscu oryginału.')
        ],
        onSubmit: (api) => {
          const values = Object.fromEntries((kind === 'linear' ? linear : polar).map((item) => [item.name, parseDecimal(item.input.value)]));
          const counts = kind === 'linear' ? ['columns', 'rows'] : ['count', 'rings'];
          if (Object.values(values).some((value) => value === null) || counts.some((name) => !Number.isInteger(values[name]) || values[name] < 1)) {
            api.setError('Wpisz liczby: liczba obiektów i rzędów – całkowita, co najmniej 1.');
            return false;
          }
          if (values[counts[0]] * values[counts[1]] > ARRAY_MAX) {
            api.setError(`Szyk może mieć najwyżej ${ARRAY_MAX} kopii (teraz ${values[counts[0]] * values[counts[1]]}).`);
            return false;
          }
          if (kind === 'polar' && (values.sweep <= 0 || values.sweep > 360)) {
            api.setError('Kąt wypełnienia – od 1° do 360°.');
            return false;
          }
          const units = (value) => fromScaleLength(value, drawing.scale);
          const params = kind === 'linear'
            ? { kind, columns: values.columns, rows: values.rows, dx: units(values.dx), dy: units(values.dy) }
            : { ...start.polar, kind, count: values.count, sweep: values.sweep, rings: values.rings, ringStep: units(values.ringStep), rotate };
          let array = makeArray(items, cleanArrayParams(params, limit), limit);
          if (array && kind === 'polar') array = withPolarRadius(array, Math.max(0, units(values.radius)));
          made = array;
          return true;
        },
        onClose: () => {
          if (!made) return;
          tools.arrayKind = made.kind;
          saveTools(tools);
          if (editing) replaceArray(editing, made);
          else createArray(made);
        }
      });
    }
    /** Nowy szyk w miejscu zaznaczonych elementów (najwyższego z nich) – jeden krok cofania, szyk zaznaczony. */
    function createArray(array) {
      const chosen = new Set(selection);
      const indexes = drawing.strokes.map((stroke, index) => (chosen.has(stroke) ? index : -1)).filter((index) => index >= 0);
      if (indexes.length === 0) return;
      // Przecięte przy zaznaczaniu fragmentu kreski – razem z szykiem jeden krok cofania.
      history.begin();
      for (const index of [...indexes].reverse()) drawing.strokes.splice(index, 1);
      drawing.strokes.splice(indexes.at(-1) - (indexes.length - 1), 0, array);
      commitStep();
      selection = new Set([array]);
      selectionKind = 'whole';
      flash(`${ARRAY_LABELS[array.kind]}: ${plural(arraySize(array), 'kopia', 'kopie', 'kopii')} – przesuwasz go w całości, „Rozdziel” – osobno.`);
      updateToolbar();
      requestRender();
    }
    /** Szyk o zmienionych parametrach albo przesuniętym środku zamiast poprzedniego – jeden krok cofania. */
    function replaceArray(original, next) {
      const index = drawing.strokes.indexOf(original);
      if (index < 0) return;
      history.begin();
      drawing.strokes[index] = next;
      commitStep();
      selection = new Set([next]);
      selectionKind = 'whole';
      updateToolbar();
      requestRender();
    }
    /** Rozdziel: wszystkie kopie szyku jako niezależne elementy (zaznaczone) – jeden krok cofania. */
    function explodeArray() {
      const [only] = selection;
      if (selection.size !== 1 || !isArray(only)) return;
      const index = drawing.strokes.indexOf(only);
      if (index < 0) return;
      const parts = expandArray(only);
      history.begin();
      drawing.strokes.splice(index, 1, ...parts);
      commitStep();
      selection = new Set(parts);
      selectionKind = 'whole';
      flash(`Szyk rozdzielony: ${plural(parts.length, 'element', 'elementy', 'elementów')}.`);
      updateToolbar();
      requestRender();
    }
    /** Zaznaczony szyk kołowy (jedyny) – jego środek można przeciągnąć. */
    function selectedPolar() {
      const [only] = selection;
      return selection.size === 1 && !snip && isArray(only) && only.kind === 'polar' && !['move', 'marquee', 'lasso'].includes(active?.kind) ? only : null;
    }
    const arrayCenterHit = (point) => {
      const array = selectedPolar();
      return Boolean(array) && Math.hypot(point.x - array.cx, point.y - array.cy) * view.scale <= HANDLE_HIT;
    };
    /** Środek szyku kołowego: kółko z krzyżykiem i przerywana linia do środka pierwszej kopii. */
    function paintArrayCenter(ctx, array) {
      const center = toScreen({ x: array.cx, y: array.cy });
      const bounds = itemsBounds(array.items);
      const source = toScreen({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 });
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.strokeStyle = SELECT_COLORS.whole;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(source.x, source.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(center.x - 5, center.y);
      ctx.lineTo(center.x + 5, center.y);
      ctx.moveTo(center.x, center.y - 5);
      ctx.lineTo(center.x, center.y + 5);
      ctx.stroke();
      ctx.restore();
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
      const pasted = relinkCopies(content.strokes.map((stroke) => translateStroke(remeasure(stroke), dx, dy)), drawing.strokes);
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
    function elementOptions(choice, sizeLabels = TEXT_SIZE_LABELS) {
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
          options: sizeLabels.map((label, index) => ({ value: String(index), label })),
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
          symbolField(input, { testID: 'drawing-symbols' }),
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
      // Zwinięta karteczka (od 1.21) zajmuje tylko miejsce ikony.
      const { width, height } = elementBox(next);
      const fit = (value, size, room) => Math.round(Math.min(Math.max(0, value), Math.max(0, room - size)));
      next.x = fit(center.x - width / 2, width, drawing.width);
      const middle = fit(center.y - height / 2, height, drawing.height);
      const overlapping = (top) => drawing.strokes.filter((item) => isTextual(item) || isBox(item)).map(elementBox)
        .filter((box) => next.x < box.x + box.width && box.x < next.x + width && top < box.y + box.height && box.y < top + height);
      /** Pierwsze wolne miejsce od `start` w dół albo null, gdy do dołu strony go nie ma. */
      const scan = (start) => {
        let y = start;
        for (let guard = 0; guard < 50; guard += 1) {
          const hits = overlapping(y);
          if (hits.length === 0) return y;
          y = Math.round(Math.max(...hits.map((box) => box.y + box.height)) + PAPER_STEP / 4);
          if (y + height > drawing.height) return null;
        }
        return null;
      };
      // Pod spodem brak miejsca – od góry widocznej części strony; wszędzie zajęte – na środku.
      next.y = scan(middle) ?? scan(fit((view.top - view.y) / view.scale, height, drawing.height)) ?? middle;
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

    // ---- tabele i karteczki (od 1.21)
    /** Poprawka zaznaczonej tabeli albo karteczki. */
    const editBox = (element) => (element.tool === 'table' ? editTable(element) : element.tool === 'sticky' ? editSticky(element)
      : element.tool === 'gdt' ? editGdt(element) : element.tool === 'datum' ? editDatum(element) : editRoughness(element));
    /** Nowy albo poprawiony element zaznaczony – od razu można go przesunąć. */
    function selectOnly(element) {
      if (tool !== 'select') setTool('select');
      selection = new Set([element]);
      selectionKind = 'whole';
      updateToolbar();
      requestRender();
    }
    /** Element w miejscu poprzedniego (jeden krok cofania) albo nowy na środku widocznej części strony. */
    function putBox(element, next) {
      if (element) {
        replaceElement(element, next);
      } else {
        placeElement(next);
        if (next.leader) next.leader = defaultLeader(next);
        history.add(next);
        changed = true;
      }
      selectOnly(next);
    }

    /** Nowa tabela (element = null) albo poprawka istniejącej – to samo okno tabeli co w notatce. */
    function editTable(element = null) {
      if (!element) clearSelection();
      const known = element ? TABLE_TEXT_SIZES.indexOf(element.size) : -1;
      const choice = { size: known >= 0 ? known : 1, color: element ? inkChoice(element.color) : tools.penColor };
      openTableEditor({
        title: element ? 'Tabela na rysunku' : 'Nowa tabela',
        submitLabel: element ? 'Zapisz' : 'Wstaw',
        table: element,
        allowEmpty: Boolean(element),
        extra: elementOptions(choice),
        onSave: (table) => {
          const next = { tool: 'table', x: element?.x ?? 0, y: element?.y ?? 0, width: 0, height: 0, size: TABLE_TEXT_SIZES[choice.size], color: inkHex(choice.color), ...table };
          // Ta sama liczba kolumn i wielkość tekstu – szerokość zostaje (tekst się zawija); inaczej – od nowa.
          const same = element && element.size === next.size && element.rows[0].length === next.rows[0].length;
          next.width = same ? element.width : naturalTableWidth(next, Math.round(drawing.width * 0.8));
          Object.assign(next, measureTable(next));
          putBox(element, next);
        }
      });
    }

    /** Koniec strzałki nowej karteczki: na prawo w dół od niej, na stronie. */
    function defaultLeader(sticky) {
      return {
        x: Math.round(Math.min(drawing.width - 20, sticky.x + sticky.width + 140)),
        y: Math.round(Math.min(drawing.height - 20, sticky.y + sticky.height + 90))
      };
    }

    /** Dzisiejsza data jako rrrr-mm-dd (data dodania karteczki). */
    const today = () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    };

    /**
     * Nowa karteczka (element = null) albo poprawka: tekst (z symbolami), kolor, wielkość tekstu,
     * zwinięta do ikony, strzałka do miejsca, widoczna na obrazie rysunku w notatce.
     */
    function editSticky(element = null) {
      if (!element) clearSelection();
      const known = element ? STICKY_TEXT_SIZES.indexOf(element.size) : -1;
      const choice = {
        color: element?.color ?? tools.stickyColor,
        size: known >= 0 ? known : 1,
        collapsed: element?.collapsed === true,
        leader: Boolean(element?.leader),
        visible: element ? element.hidden !== true : true
      };
      let value = element?.text ?? '';
      let pending = null;
      const input = textArea({ value, rows: 4, testID: 'drawing-sticky-input', onInput: (text) => { value = text; } });
      input.maxLength = STICKY_TEXT_MAX;
      const swatches = STICKY_COLORS.map((color) => h('button', {
        type: 'button', class: 'drawing__swatch', style: { '--swatch': color.fill }, 'aria-label': color.label, title: color.label,
        'aria-pressed': String(color.id === choice.color), dataset: { color: color.id, testid: `drawing-sticky-color-${color.id}` },
        onClick: () => {
          choice.color = color.id;
          for (const button of swatches) button.setAttribute('aria-pressed', String(button.dataset.color === color.id));
        }
      }));
      const option = (label, key, testID) => {
        const row = toggle({ checked: choice[key], label, onChange: (checked) => { choice[key] = checked; } });
        row.querySelector('input').dataset.testid = testID;
        return row;
      };
      openFormSheet({
        title: element ? `Karteczka ${stickyNumber(drawing, element)}` : 'Nowa karteczka',
        submitLabel: element ? 'Zapisz' : 'Wstaw',
        build: () => [
          field('Tekst', input, {
            hint: element ? `Dodana ${stickyDate(element)}.` : 'Karteczka pojawi się na środku widocznej części strony – przesuniesz ją, a narożnikiem zmienisz jej wielkość.'
          }),
          symbolField(input, { testID: 'drawing-symbols' }),
          field('Kolor', h('div', { class: 'drawing__element-colors', role: 'group', 'aria-label': 'Kolor karteczki' }, swatches)),
          field('Wielkość tekstu', segmented({
            name: `drawing-sticky-size-${Date.now()}`, label: 'Wielkość tekstu', value: String(choice.size),
            options: ['Mała', 'Średnia', 'Duża'].map((label, index) => ({ value: String(index), label })),
            onChange: (size) => { choice.size = Number(size); }
          })),
          h('div', { class: 'drawing__sticky-options' },
            option('Zwinięta – tylko ikona', 'collapsed', 'drawing-sticky-collapsed'),
            option('Strzałka do miejsca', 'leader', 'drawing-sticky-leader'),
            option('Widoczna na obrazie w notatce', 'visible', 'drawing-sticky-visible')),
          h('p', { class: 'field__hint' }, 'Zwinięta karteczka to ikona z numerem – dotknięcie pokazuje jej treść. Koniec strzałki przeciągniesz na rysunku. '
            + 'Karteczka niewidoczna na obrazie jest tylko w edytorze (z przerywaną obwódką).')
        ],
        onSubmit: () => { pending = value; },
        onClose: () => {
          if (pending !== null) applySticky(element, pending, choice);
        }
      });
      requestAnimationFrame(() => input.focus());
    }
    function applySticky(element, text, choice) {
      tools.stickyColor = choice.color;
      saveTools(tools);
      const next = element ? { ...element } : { tool: 'sticky', x: 0, y: 0, width: 360, height: 260, created: today() };
      Object.assign(next, { text: text.slice(0, STICKY_TEXT_MAX), color: choice.color, size: STICKY_TEXT_SIZES[choice.size] });
      delete next.collapsed;
      delete next.hidden;
      if (choice.collapsed) next.collapsed = true;
      if (!choice.visible) next.hidden = true;
      if (!choice.leader) delete next.leader;
      else next.leader = element?.leader ?? defaultLeader(next);
      Object.assign(next, measureSticky(next));
      putBox(element, next);
    }
    // ---- symbole metrologiczne (od 1.22.1): ramka tolerancji, znak bazy, chropowatość
    /** Wielkość (Mała, Średnia, Duża) i kolor symbolu – jak przy polu tekstowym. */
    function symbolOptions(choice) {
      return elementOptions(choice, ['Mała', 'Średnia', 'Duża']);
    }
    const symbolChoice = (element) => {
      const known = element ? SYMBOL_TEXT_SIZES.indexOf(element.size) : -1;
      return { size: known >= 0 ? known : 1, color: element ? inkChoice(element.color) : tools.penColor };
    };
    /** Nowy symbol – po oknie czeka na dotknięcie miejsca; poprawiony – w tym samym miejscu (jeden krok cofania). */
    function putSymbol(element, next) {
      if (element) {
        // Ten sam identyfikator i przyklejenia – strzałka zostaje przy krawędzi.
        const index = drawing.strokes.indexOf(element);
        replaceElement(element, { ...next, ...(element.id ? { id: element.id } : {}), ...(element.attach ? { attach: element.attach } : {}) });
        if (drawing.strokes[index]) selectOnly(drawing.strokes[index]);
        return;
      }
      clearSelection();
      symbolPlacing = { element: next };
      flash(next.tool === 'roughness' ? 'Dotknij krawędzi – tam stanie wierzchołek symbolu (Esc – bez wstawiania).'
        : next.tool === 'datum' ? 'Dotknij krawędzi – tam stanie trójkąt bazy (Esc – bez wstawiania).'
          : 'Dotknij krawędzi albo narożnika – tam będzie strzałka ramki (Esc – bez wstawiania).');
      updateToolbar();
      requestLive();
    }
    function cancelSymbolPlacing() {
      symbolPlacing = null;
      edgeHover = null;
      flash('Bez wstawiania symbolu.');
      requestLive();
    }
    /**
     * Symbol w dotkniętym miejscu: koniec strzałki (trójkąt, wierzchołek) przyciągnięty do krawędzi albo
     * narożnika i przyklejony; ramka i kwadrat bazy – obok, z dala od środka elementu pod spodem.
     */
    function placeSymbol(point, event) {
      const snap = edgeSnapAt(point, event);
      const target = snap ?? point;
      const element = { ...symbolPlacing.element };
      symbolPlacing = null;
      edgeHover = null;
      const end = { x: Math.round(target.x * 100) / 100, y: Math.round(target.y * 100) / 100 };
      notice.hidden = true;
      if (element.tool === 'roughness') {
        Object.assign(element, end);
      } else {
        element.leader = end;
        // Prostopadle do krawędzi, na zewnątrz (bez krawędzi – w górę w prawo); bliższy brzeg ramki ok. 2 kratki od niej.
        const [dx, dy] = snap ? snapNormal(snap, elementBox) : [0.7071, -0.7071];
        const reach = (element.tool === 'datum' ? 60 : 90) + Math.abs(dx) * (element.width / 2) + Math.abs(dy) * (element.height / 2);
        const fit = (value, size, room) => Math.round(Math.min(Math.max(0, value), Math.max(0, room - size)));
        element.x = fit(end.x + dx * reach - element.width / 2, element.width, drawing.width);
        element.y = fit(end.y + dy * reach - element.height / 2, element.height, drawing.height);
      }
      history.begin();
      drawing.strokes.push(element);
      const index = drawing.strokes.length - 1;
      drawing.strokes[index] = linkEnds(element, [[element.tool === 'roughness' ? 'tip' : 'leader', snap]]);
      commitStep();
      selectOnly(drawing.strokes[index]);
    }
    /** Pola wyboru symbolu tolerancji: 14 symboli ISO 1101 (rysowane kreską). */
    function gdtSymbolPicker(choice, onChange) {
      const buttons = GDT_SYMBOLS.map((symbol) => h('button', {
        type: 'button', class: 'drawing__gdt-symbol', role: 'radio', 'aria-checked': String(symbol.id === choice.symbol),
        'aria-label': symbol.label, title: symbol.label, dataset: { symbol: symbol.id, testid: `drawing-gdt-symbol-${symbol.id}` },
        onClick: () => {
          choice.symbol = symbol.id;
          for (const button of buttons) button.setAttribute('aria-checked', String(button.dataset.symbol === symbol.id));
          onChange();
        }
      }, gdtGlyphCanvas(symbol.id, 30, '#1d1d1f')));
      return h('div', { class: 'drawing__gdt-symbols', role: 'radiogroup', 'aria-label': 'Symbol tolerancji' }, buttons);
    }
    /**
     * Ramka tolerancji (nowa albo poprawka): symbol, ⌀, wartość tolerancji, Ⓜ / Ⓛ, do trzech baz
     * (tolerancje kształtu – bez baz), wielkość i kolor; podgląd ramki.
     */
    function editGdt(element = null) {
      if (!element) clearSelection();
      const choice = {
        ...symbolChoice(element), symbol: element?.symbol ?? 'perpendicularity', diameter: element?.diameter === true,
        modifier: element?.modifier ?? ''
      };
      const value = h('input', {
        class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder: '0,05', maxLength: 16,
        'aria-label': 'Tolerancja', value: element?.value ?? '', dataset: { testid: 'drawing-gdt-value' }, onInput: () => refresh()
      });
      const toggleButton = (label, testID, onClick) => h('button', { type: 'button', class: 'drawing__chip drawing__gdt-toggle', 'aria-pressed': 'false', dataset: { testid: testID }, onClick }, label);
      const diameter = toggleButton('⌀', 'drawing-gdt-diameter', () => {
        choice.diameter = !choice.diameter;
        refresh();
      });
      diameter.setAttribute('aria-label', 'Strefa tolerancji – średnica (⌀)');
      const modifiers = ['M', 'L'].map((letter) => {
        const button = toggleButton(letter === 'M' ? 'Ⓜ' : 'Ⓛ', `drawing-gdt-modifier-${letter}`, () => {
          choice.modifier = choice.modifier === letter ? '' : letter;
          refresh();
        });
        button.dataset.letter = letter;
        button.setAttribute('aria-label', letter === 'M' ? 'Maksimum materiału (Ⓜ)' : 'Minimum materiału (Ⓛ)');
        return button;
      });
      const datums = Array.from({ length: GDT_DATUMS_MAX }, (_, index) => h('input', {
        class: 'input drawing__gdt-datum', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', maxLength: 5,
        'aria-label': `Baza ${index + 1}`, value: element?.datums?.[index] ?? '', dataset: { testid: `drawing-gdt-datum-${index + 1}` },
        onInput: (event) => {
          event.target.value = event.target.value.toUpperCase();
          refresh();
        }
      }));
      const datumHint = h('p', { class: 'field__hint' });
      const symbolName = h('p', { class: 'drawing__gdt-name', dataset: { testid: 'drawing-gdt-name' } });
      const preview = h('canvas', { class: 'drawing__gdt-preview', dataset: { testid: 'drawing-gdt-preview' } });
      const options = symbolOptions(choice);
      /** Ramka z pól okna (bez położenia). */
      const build = () => {
        const form = gdtSymbol(choice.symbol).form;
        const next = {
          tool: 'gdt', x: element?.x ?? 0, y: element?.y ?? 0, size: SYMBOL_TEXT_SIZES[choice.size], color: inkHex(choice.color),
          symbol: choice.symbol, value: cleanGdtValue(value.value),
          datums: form ? [] : datums.map((input) => input.value.trim().toUpperCase()).filter(Boolean),
          ...(choice.diameter ? { diameter: true } : {}), ...(choice.modifier ? { modifier: choice.modifier } : {}),
          ...(element?.leader ? { leader: element.leader } : {})
        };
        return { ...next, ...measureGdt(next) };
      };
      function refresh() {
        const form = gdtSymbol(choice.symbol).form;
        symbolName.textContent = gdtSymbol(choice.symbol).label;
        diameter.setAttribute('aria-pressed', String(choice.diameter));
        for (const button of modifiers) button.setAttribute('aria-pressed', String(button.dataset.letter === choice.modifier));
        for (const input of datums) input.disabled = form;
        datumHint.textContent = form ? 'Tolerancja kształtu – bez baz.' : 'Wielka litera, np. A; wspólna baza – A-B. Puste pola pomijam.';
        const sample = build();
        const ratio = window.devicePixelRatio || 1;
        const scale = Math.min(1.4, 300 / Math.max(1, sample.width + 8));
        preview.width = Math.round((sample.width + 8) * scale * ratio);
        preview.height = Math.round((sample.height + 8) * scale * ratio);
        preview.style.width = `${Math.round((sample.width + 8) * scale)}px`;
        preview.style.height = `${Math.round((sample.height + 8) * scale)}px`;
        const ctx = preview.getContext('2d');
        ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
        paintGdt(ctx, { ...sample, x: 4, y: 4 });
      }
      let pending = null;
      openFormSheet({
        title: element ? 'Ramka tolerancji' : 'Nowa ramka tolerancji',
        submitLabel: element ? 'Zapisz' : 'Wstaw',
        build: () => [
          field('Symbol (ISO 1101)', h('div', null, gdtSymbolPicker(choice, refresh), symbolName)),
          field('Tolerancja', h('div', { class: 'drawing__gdt-row' }, diameter, value, ...modifiers)),
          field('Bazy', h('div', null, h('div', { class: 'drawing__gdt-row' }, datums), datumHint)),
          field('Podgląd', preview),
          options,
          h('p', { class: 'field__hint' }, element ? 'Koniec strzałki przeciągniesz na rysunku (kółko) – przyciąga się do krawędzi i narożników.'
            : 'Po „Wstaw” dotknij krawędzi albo narożnika – tam będzie strzałka (przyciąga się do niej i zostaje przy niej, gdy przesuwasz kształt); ramkę przeciągniesz potem w wybrane miejsce.')
        ],
        onSubmit: (api) => {
          const sample = build();
          if (!sample.value) {
            api.setError('Wpisz tolerancję, np. 0,05.');
            return false;
          }
          const typed = datums.map((input) => input.value.trim().toUpperCase()).filter(Boolean);
          if (!gdtSymbol(choice.symbol).form && typed.some((datum) => !DATUM_RE.test(datum))) {
            api.setError('Baza to wielka litera, np. A (wspólna – A-B).');
            return false;
          }
          pending = sample;
          return true;
        },
        onClose: () => {
          if (pending) putSymbol(element, pending);
        }
      });
      refresh();
      requestAnimationFrame(() => value.focus());
    }
    /** Znak bazy: litera (kolejna wolna), wielkość i kolor. */
    function editDatum(element = null) {
      if (!element) clearSelection();
      const choice = symbolChoice(element);
      const letter = h('input', {
        class: 'input drawing__gdt-datum', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', maxLength: 2,
        'aria-label': 'Litera bazy', value: element?.letter ?? nextDatumLetter(drawing.strokes), dataset: { testid: 'drawing-datum-letter' },
        onInput: (event) => { event.target.value = event.target.value.toUpperCase(); }
      });
      let pending = null;
      openFormSheet({
        title: element ? `Baza ${element.letter}` : 'Nowy znak bazy',
        submitLabel: element ? 'Zapisz' : 'Wstaw',
        build: () => [
          field('Litera', letter, { hint: 'Wielka litera, np. A – ta sama co w polu bazy ramki tolerancji.' }),
          symbolOptions(choice),
          h('p', { class: 'field__hint' }, element ? 'Trójkąt bazy przeciągniesz na rysunku (kółko) – przyciąga się do krawędzi.'
            : 'Po „Wstaw” dotknij krawędzi – tam stanie zaczerniony trójkąt; kwadrat z literą przeciągniesz potem w wybrane miejsce.')
        ],
        onSubmit: (api) => {
          const value = letter.value.trim().toUpperCase();
          if (!DATUM_LETTER_RE.test(value)) {
            api.setError('Wpisz wielką literę, np. A.');
            return false;
          }
          const size = SYMBOL_TEXT_SIZES[choice.size];
          const side = datumSide(size);
          pending = {
            tool: 'datum', x: element?.x ?? 0, y: element?.y ?? 0, size, color: inkHex(choice.color), letter: value, width: side, height: side,
            ...(element?.leader ? { leader: element.leader } : {})
          };
          return true;
        },
        onClose: () => {
          if (pending) putSymbol(element, pending);
        }
      });
      requestAnimationFrame(() => letter.focus());
    }
    /** Chropowatość (ISO 1302): rodzaj obróbki, wymaganie („Ra 1,6”), wielkość i kolor. */
    function editRoughness(element = null) {
      if (!element) clearSelection();
      const choice = { ...symbolChoice(element), kind: element?.kind ?? 'removal' };
      const text = h('input', {
        class: 'input', type: 'text', autocomplete: 'off', spellcheck: 'false', maxLength: ROUGHNESS_TEXT_MAX, 'aria-label': 'Wymaganie',
        value: element?.text ?? 'Ra 1,6', dataset: { testid: 'drawing-roughness-text' }
      });
      let pending = null;
      openFormSheet({
        title: element ? 'Chropowatość' : 'Nowy symbol chropowatości',
        submitLabel: element ? 'Zapisz' : 'Wstaw',
        build: () => [
          field('Obróbka', segmented({
            name: `drawing-roughness-kind-${Date.now()}`, label: 'Obróbka', value: choice.kind,
            options: ROUGHNESS_KINDS.map((kind) => ({ value: kind, label: ROUGHNESS_KIND_LABELS[kind] })),
            onChange: (kind) => { choice.kind = kind; }
          })),
          field('Wymaganie', h('div', null, text, h('div', { class: 'drawing__quick' },
            ['Ra 0,4', 'Ra 0,8', 'Ra 1,6', 'Ra 3,2', 'Ra 6,3', 'Ra 12,5', 'Rz 6,3', 'Rz 25'].map((item) => chip(item, `drawing-roughness-${item.replace(/[\s,]/g, '')}`, () => {
              text.value = item;
            })))), { hint: 'Pod poziomą kreską symbolu (ISO 1302); puste – sam symbol.' }),
          symbolOptions(choice),
          h('p', { class: 'field__hint' }, element ? 'Wierzchołek przeciągniesz na rysunku (kółko) – przyciąga się do krawędzi i przesuwa cały symbol.'
            : 'Po „Wstaw” dotknij krawędzi – tam stanie wierzchołek symbolu (zostaje przy krawędzi, gdy przesuwasz kształt).')
        ],
        onSubmit: () => {
          const next = {
            tool: 'roughness', x: element?.x ?? 0, y: element?.y ?? 0, size: SYMBOL_TEXT_SIZES[choice.size], color: inkHex(choice.color),
            text: text.value.trim().replace(/(\d)\.(\d)/g, '$1,$2').slice(0, ROUGHNESS_TEXT_MAX), kind: choice.kind
          };
          pending = { ...next, ...measureRoughness(next) };
          return true;
        },
        onClose: () => {
          if (pending) putSymbol(element, pending);
        }
      });
    }
    function toggleCollapsed() {
      const [only] = selection;
      if (selection.size !== 1 || only?.tool !== 'sticky') return;
      const next = { ...only };
      if (only.collapsed) delete next.collapsed;
      else next.collapsed = true;
      replaceShape(only, next);
      updateToolbar();
      requestRender();
    }

    /** Tabela albo karteczka z uchwytami: jedyna zaznaczona (przy zaznaczaniu) albo poprawiana. */
    function editedBox() {
      if (active?.kind === 'box-edit') return active.preview;
      if (selection.size !== 1 || tool !== 'select' || active?.kind === 'move' || placing) return null;
      const [only] = selection;
      return isBox(only) ? only : null;
    }
    /** Uchwyty: narożnik (zmiana wielkości; zwinięta karteczka – bez niego) i koniec strzałki karteczki. */
    function boxHandles(element) {
      // Symbol metrologiczny (od 1.22.1): bez narożnika – tylko koniec strzałki albo wierzchołek chropowatości.
      if (element.tool === 'roughness') return [{ id: 'target', x: element.x, y: element.y }];
      if (isSymbol(element)) return element.leader ? [{ id: 'target', x: element.leader.x, y: element.leader.y }] : [];
      const handles = [];
      if (!(element.tool === 'sticky' && element.collapsed)) handles.push({ id: 'resize', x: element.x + element.width, y: element.y + element.height });
      if (element.tool === 'sticky' && element.leader) handles.push({ id: 'target', x: element.leader.x, y: element.leader.y });
      return handles;
    }
    function boxHandleAt(point) {
      const element = editedBox();
      if (!element) return null;
      let best = null;
      for (const handle of boxHandles(element)) {
        const distance = Math.hypot(handle.x - point.x, handle.y - point.y) * view.scale;
        if (distance <= HANDLE_HIT && (!best || distance < best.distance)) best = { ...handle, distance, element };
      }
      return best;
    }
    function paintBoxHandles(ctx, element) {
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = SELECT_COLORS.whole;
      ctx.fillStyle = '#ffffff';
      for (const handle of boxHandles(element)) {
        const point = toScreen(handle);
        ctx.beginPath();
        if (handle.id === 'target') ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        else ctx.rect(point.x - 7, point.y - 7, 14, 14);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    function startBoxEdit(event, handle) {
      active = { kind: 'box-edit', ...common(event, toDrawing(event)), handle: handle.id, original: handle.element, preview: handle.element, moved: false };
      requestRender();
    }
    /** Element po przeciągnięciu uchwytu: narożnik – szerokość (tabela) albo wielkość (karteczka), koniec strzałki – nowe miejsce. */
    function editBoxHandle(original, handle, point) {
      // Wierzchołek chropowatości (od 1.22.1) przesuwa cały symbol.
      if (handle === 'target' && original.tool === 'roughness') return { ...original, x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 };
      if (handle === 'target') return { ...original, leader: { x: Math.round(point.x), y: Math.round(point.y) } };
      if (original.tool === 'table') {
        const next = { ...original, width: Math.round(Math.max(original.rows[0].length * original.size * 2, point.x - original.x)) };
        return { ...next, ...measureTable(next) };
      }
      const next = {
        ...original,
        width: Math.round(Math.max(STICKY_MIN.width, point.x - original.x)),
        height: Math.round(Math.max(STICKY_MIN.height, point.y - original.y))
      };
      return { ...next, ...measureSticky(next) };
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
      if (active.stroke.tool === 'highlighter') return tools.highlighterWidths[tools.highlighterWidth];
      return penWidth(active.pressure ? event.pressure : 0.5, tools.penWidths[tools.penWidth], active.pressure ? tools.sensitivity : 'off');
    };
    /**
     * Punkt kreski: przy linijce – rzut na prostą wzdłuż jej krawędzi (i zasięg kreski wzdłuż linijki –
     * długość); od 1.22 przy okręgu liniuszka promieniowego – rzut na okrąg (długość – po łuku).
     */
    const strokePoint = (event) => onEdge(active.edge, toDrawing(event));
    function onEdge(edge, point) {
      if (!edge) return point;
      if (edge.circle) {
        const { x, y, r } = edge.circle;
        let angle = Math.atan2(point.y - y, point.x - x);
        // Kąt ciągły (bez skoku przy ±180°) – długość łuku od początku kreski.
        if (edge.last !== undefined) angle = edge.last + Math.atan2(Math.sin(angle - edge.last), Math.cos(angle - edge.last));
        edge.last = angle;
        const along = angle * r;
        edge.along = along;
        edge.from = Math.min(edge.from, along);
        edge.to = Math.max(edge.to, along);
        return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
      }
      const { along } = rulerOffset(edge.ruler, point.x, point.y);
      edge.along = along;
      edge.from = Math.min(edge.from, along);
      edge.to = Math.max(edge.to, along);
      return rulerPoint(edge.ruler, along, edge.across);
    }
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
      // Liniuszek promieniowy (od 1.22): wzdłuż okręgu – łuk, wzdłuż promienia – prosto po promieniu.
      if (radialGuide()) {
        const radial = radialFamily();
        const ring = nearestRing(radial, start.x, start.y);
        const tangent = Math.atan2(start.y - radial.y, start.x - radial.x) + Math.PI / 2;
        const ringOff = lineAngleDifference(direction, tangent);
        if (ring.distance * view.scale <= GUIDE_SNAP && ringOff <= GUIDE_ANGLE) best = { circle: { x: radial.x, y: radial.y, r: ring.radius }, off: ringOff };
        if (tools.guide.rays) {
          const ray = nearestRay(radial, start.x, start.y);
          const rayOff = lineAngleDifference(direction, ray.angle);
          if (ray.distance * view.scale <= GUIDE_SNAP && rayOff <= GUIDE_ANGLE && (!best || rayOff < best.off)) {
            best = { line: { x: radial.x, y: radial.y, angle: ray.angle }, off: rayOff };
          }
        }
      }
      if (!best) return false;
      const edge = best.circle
        ? { circle: best.circle, along: 0, from: Infinity, to: -Infinity, guide: true }
        : { ruler: { x: best.line.x, y: best.line.y, angle: best.line.angle }, across: 0, along: 0, from: Infinity, to: -Infinity, guide: true };
      active.edge = edge;
      active.stroke.points = [];
      active.last = null;
      for (const point of pending.raw) {
        const next = { ...onEdge(edge, point), w: point.w };
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
    /** Styl nowego kształtu: kolor pióra, średnia grubość wybranej grubości pióra, (od 1.17) wypełnienie i (od 1.19) zakończenia odcinka. */
    const shapeStyle = () => {
      const width = tools.penWidths[tools.penWidth];
      return { color: inkHex(tools.penColor), size: Math.round(((width.min + width.max) / 2) * 10) / 10, fill: tools.shapeFill, caps: segmentDefaultCaps() };
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
      // Odcinek i strzałka (od 1.22): początek przyciągnięty do narożnika albo krawędzi.
      const snap = isSegment({ shape: tools.shape }) ? edgeSnapAt(point, event) : null;
      if (snap) {
        active.start = { x: snap.x, y: snap.y };
        active.startSnap = snap;
      }
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
      // Od 1.19: przeciągnięcie narożnika zmienia wielkość (przeciwny narożnik zostaje), reszta – przesuwa.
      const corner = templateCornerAt(toDrawing(event));
      active = corner
        ? { kind: 'template-scale', ...common(event, toDrawing(event)), corner, origin: { ...drawing.template } }
        : { kind: 'template-move', ...common(event, toDrawing(event)), origin: { x: drawing.template.x, y: drawing.template.y } };
    }
    /** Narożnik szablonu (ustawianego) pod punktem strony albo null. */
    function templateCornerAt(point) {
      if (!placing || !drawing.template) return null;
      return Object.keys(TEMPLATE_CORNERS).find((corner) => {
        const at = templateCorner(drawing.template, corner);
        return Math.hypot(at.x - point.x, at.y - point.y) * view.scale <= HANDLE_HIT;
      }) ?? null;
    }
    /** Środkowy przycisk myszy (od 1.19): przesuwanie strony. */
    function startPan(event) {
      try {
        live.setPointerCapture(event.pointerId);
      } catch {
        // przechwycenie nie jest konieczne
      }
      active = { kind: 'pan', id: event.pointerId, touch: false, client: local(event), startX: view.x, startY: view.y };
      stage.classList.add('drawing__stage--panning');
    }
    function startArrayCenter(event) {
      const [array] = selection;
      active = { kind: 'array-center', ...common(event, toDrawing(event)), original: array, preview: array, moved: false };
      requestRender();
    }
    /** Shift albo „Proporcje” (od 1.19): kwadrat, koło, kąty co 15°, narożnik bez zmiany proporcji. */
    const locked = (event) => tools.shapeLock || Boolean(event?.shiftKey) || shiftDown;

    // ---- przyciąganie końców (od 1.22): do narożników i krawędzi kształtów i ramek; Alt – swobodnie
    const snapsEdges = (event) => tools.edgeSnap && !event?.altKey && !altDown;
    /** Miejsce przyciągnięcia końca w punkcie (null – bez przyciągania albo nic w pobliżu). */
    function edgeSnapAt(point, event, exclude = new Set()) {
      if (!snapsEdges(event)) return null;
      return findSnap(drawing.strokes, point, EDGE_SNAP / view.scale, { exclude, boxOf: elementBox });
    }
    /** Identyfikator elementu – nadany w bieżącym kroku cofania, gdy go nie miał (ids – już nadane w tym kroku). */
    function ensureId(target, ids) {
      if (ids.has(target)) return ids.get(target);
      const id = target.id ?? newElementId(drawing.strokes);
      if (!target.id) {
        const index = drawing.strokes.indexOf(target);
        if (index >= 0) drawing.strokes[index] = { ...target, id };
      }
      ids.set(target, id);
      return id;
    }
    /** Element z przyklejonymi (snap) albo odklejonymi (null) końcami – links: [[koniec, snap]]; w kroku cofania. */
    function linkEnds(stroke, links) {
      const ids = new Map();
      let next = stroke;
      for (const [end, snap] of links) next = withLink(next, end, snap ? { ...snap.ref, id: ensureId(snap.target, ids) } : null);
      return next;
    }
    /** Zastępuje element poprawionym z przyklejonymi albo odklejonymi końcami – jeden krok cofania. */
    function replaceLinked(original, next, links) {
      const index = drawing.strokes.indexOf(original);
      if (index < 0) return;
      history.begin();
      drawing.strokes[index] = linkEnds(next, links);
      commitStep();
      selection = new Set([drawing.strokes[index]]);
      selectionKind = 'whole';
    }
    /** Znacznik miejsca przyciągnięcia: kwadrat – narożnik, kółko – krawędź. */
    function paintSnapMarker(ctx, snap) {
      const point = toScreen(snap);
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.lineWidth = 2;
      ctx.strokeStyle = ZERO_COLOR;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      if (snap.kind === 'corner') ctx.rect(point.x - 6, point.y - 6, 12, 12);
      else ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    /** Przyklejone końce idące za przesuwanym albo zmienianym elementem: mapa przyklejony → podgląd (albo null). */
    function activeFollowers() {
      let previews = null;
      if (active?.kind === 'move') previews = new Map([...selection].filter((stroke) => stroke.id).map((stroke) => [stroke, translateStroke(stroke, active.dx, active.dy)]));
      else if ((active?.kind === 'shape-edit' || active?.kind === 'box-edit') && active.original.id) previews = new Map([[active.original, active.preview ?? active.original]]);
      if (!previews || previews.size === 0) return null;
      const followers = followersOf(drawing.strokes, previews, elementBox);
      // Zaznaczone przesuwają się razem z zaznaczeniem.
      for (const stroke of selection) followers.delete(stroke);
      return followers.size > 0 ? followers : null;
    }
    function toggleEdgeSnap() {
      tools.edgeSnap = !tools.edgeSnap;
      saveTools(tools);
      flash(tools.edgeSnap ? 'Przyciąganie końców do krawędzi i narożników – włączone.' : 'Przyciąganie końców – wyłączone: końce zostają tam, gdzie je puścisz.');
      updateToolbar();
      if (!shapePanel.hidden) renderShapePanel();
      // Napis magnesu w pasku zaznaczenia.
      requestLive();
    }
    /** Kształt w trakcie przeciągania od nowa – po wciśnięciu albo puszczeniu Shift bez ruchu wskaźnika. */
    function refreshShapeDrag() {
      if (active?.kind === 'shape-new' && active.moved && active.point) {
        active.shape = shapeFromDrag(tools.shape, active.start, active.point, shapeStyle(), { tap: 0, lock: locked() });
        requestLive();
      } else if (active?.kind === 'shape-edit' && active.moved && active.point) {
        active.preview = measureLabel(moveShapeHandle(active.original, active.handle, active.point, { lock: locked() }));
        requestLive();
      }
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
          active.point = point;
          if (Math.hypot(point.x - active.start.x, point.y - active.start.y) * view.scale >= TAP_SLOP) active.moved = true;
          if (active.moved) active.shape = shapeFromDrag(tools.shape, active.start, point, shapeStyle(), { tap: 0, lock: locked(event) });
          // Koniec odcinka przyciągnięty (od 1.22) – dokładnie w tym miejscu, bez przyciągania kąta.
          active.endSnap = active.moved && isSegment({ shape: tools.shape }) ? edgeSnapAt(point, event) : null;
          if (active.endSnap) active.shape = segmentBetween(active.shape, active.start, active.endSnap);
          requestLive();
          break;
        case 'shape-edit':
          active.point = point;
          // Drobny ruch to jeszcze dotknięcie (pole wymiaru), nie przeciąganie punktu.
          if (!active.moved && Math.hypot(point.x - active.start.x, point.y - active.start.y) * view.scale < TAP_SLOP) break;
          active.moved = true;
          active.snap = isSegment(active.original) && (active.handle === 'start' || active.handle === 'end')
            ? edgeSnapAt(point, event, new Set([active.original])) : null;
          if (active.snap) {
            const other = endPoint(active.original, active.handle === 'start' ? 'end' : 'start');
            const [a, b] = active.handle === 'start' ? [active.snap, other] : [other, active.snap];
            active.preview = measureLabel(segmentBetween(active.original, a, b));
          } else {
            active.preview = measureLabel(moveShapeHandle(active.original, active.handle, point, { lock: locked(event) }));
          }
          requestLive();
          break;
        case 'box-edit': {
          if (!active.moved && Math.hypot(point.x - active.start.x, point.y - active.start.y) * view.scale < TAP_SLOP) break;
          active.moved = true;
          // Koniec strzałki karteczki (od 1.22) – też przyciągany.
          active.snap = active.handle === 'target' ? edgeSnapAt(point, event, new Set([active.original])) : null;
          active.preview = editBoxHandle(active.original, active.handle, active.snap ?? point);
          requestLive();
          break;
        }
        case 'pan':
          view.x = active.startX + event.clientX - active.client.clientX;
          view.y = active.startY + event.clientY - active.client.clientY;
          clampView();
          requestRender();
          break;
        case 'array-center': {
          if (!active.moved && Math.hypot(point.x - active.start.x, point.y - active.start.y) * view.scale < TAP_SLOP) break;
          active.moved = true;
          const { original } = active;
          active.preview = { ...original, cx: Math.round((original.cx + point.x - active.start.x) * 100) / 100, cy: Math.round((original.cy + point.y - active.start.y) * 100) / 100 };
          requestLive();
          break;
        }
        case 'template-scale':
          drawing.template = resizeTemplateCorner(active.origin, active.corner, point, drawing.width, drawing.height);
          changed = true;
          applyPitchScale();
          refreshPlacementSize?.();
          requestRender();
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
          const shape = done.shape ?? shapeFromDrag(tools.shape, done.start, done.start, shapeStyle(), { lock: locked() });
          // Końce przyciągnięte (od 1.22) – przyklejone do kształtu (idą za nim).
          const links = isSegment(shape) ? [['start', done.startSnap], ['end', done.moved ? done.endSnap : null]].filter(([, snap]) => snap) : [];
          let added = shape;
          if (links.length > 0) {
            history.begin();
            added = linkEnds(shape, links);
            drawing.strokes.push(added);
            commitStep();
          } else {
            history.add(shape);
          }
          changed = true;
          selection = new Set([added]);
          selectionKind = 'whole';
        }
      } else if (done.kind === 'shape-edit' && !cancelled) {
        // Przeciągnięty koniec odcinka: przyklejony w nowym miejscu albo odklejony.
        if (done.moved && isSegment(done.original) && (done.handle === 'start' || done.handle === 'end')) replaceLinked(done.original, done.preview, [[done.handle, done.snap]]);
        else if (done.moved) replaceShape(done.original, done.preview);
        else focusField = HANDLE_FIELDS[done.handle] ?? null;
      } else if (done.kind === 'pan') {
        stage.classList.remove('drawing__stage--panning');
      } else if (done.kind === 'array-center' && !cancelled && done.moved) {
        replaceArray(done.original, done.preview);
      } else if (done.kind === 'box-edit' && !cancelled && done.moved) {
        if (done.handle === 'target') replaceLinked(done.original, done.preview, [[done.original.tool === 'roughness' ? 'tip' : 'leader', done.snap]]);
        else replaceShape(done.original, done.preview);
      } else if (done.kind === 'move' && !cancelled) {
        const tap = Math.abs(done.dx) * view.scale < TAP_SLOP && Math.abs(done.dy) * view.scale < TAP_SLOP;
        const [only] = selection;
        if (!tap) moveSelection(done.dx, done.dy);
        // Dotknięcie zaznaczonego pola tekstowego albo wzoru – poprawka; kształtu (od 1.17) – tekst na nim; szyku (od 1.19) – parametry.
        else if (selection.size === 1 && isTextual(only) && touchesStroke(only, done.start.x, done.start.y, 0)) editElement(only.tool, only);
        // Tabela i karteczka (od 1.21) – okno edycji.
        else if (selection.size === 1 && isBox(only) && touchesStroke(only, done.start.x, done.start.y, 0)) editBox(only);
        else if (selection.size === 1 && isArray(only) && touchesStroke(only, done.start.x, done.start.y, SELECTION_PAD / view.scale)) editArray();
        else if (selection.size === 1 && isShape(only)
          && (shapeContains(only, done.start.x, done.start.y) || touchesShape(only, done.start.x, done.start.y, SELECTION_PAD / view.scale))) editShapeLabel(only);
      }
      // Palce, które zostały na ekranie, przesuwają dalej od miejsca, w którym są teraz.
      if (gesture && touches.size > 0) startGesture(gesture.kind);
      // Ctrl puszczony w trakcie zaznaczania (od 1.19) – poprzednie narzędzie wraca dopiero teraz.
      if (ctrlHold?.released) endCtrlHold();
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
      // Środkowy przycisk myszy (od 1.19) przesuwa stronę – przy każdym narzędziu.
      if (event.pointerType === 'mouse' && event.button === 1) {
        event.preventDefault();
        if (!active) startPan(event);
        return;
      }
      // Ctrl przy myszy albo rysiku (od 1.19) – zaznaczanie od razu, bez czekania na przytrzymanie.
      if (event.ctrlKey && event.pointerType !== 'touch' && tool !== 'select' && !active) beginCtrlHold();
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
      // Wstawianie symbolu metrologicznego (od 1.22.1): dotknięcie – miejsce strzałki, trójkąta albo wierzchołka.
      // Gdy aplikacja zna już rysik, palec (i dłoń) przesuwa stronę – symbol wstawia rysik albo mysz.
      if (symbolPlacing && !active && !gesture && touches.size === 0 && !(penSeen && event.pointerType === 'touch')) {
        placeSymbol(point, event);
        return;
      }
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
        if (!hit && penSeen && !onSelection && !shapeHandleAt(point) && !boxHandleAt(point) && !guideKnobHit(point) && !arrayCenterHit(point)) {
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
      // Narożnik tabeli albo karteczki i koniec strzałki karteczki (od 1.21).
      const boxHandle = snipping || handle ? null : boxHandleAt(point);
      // Środek zaznaczonego szyku kołowego (od 1.19) – przed linijką i zaznaczeniem.
      const centerHit = !snipping && !handle && !boxHandle && arrayCenterHit(point);
      const hit = handle || boxHandle || centerHit || snipping ? null : rulerHit(point);
      if (snipping) startSelect(event, true);
      else if (handle) startShapeEdit(event, handle);
      else if (boxHandle) startBoxEdit(event, boxHandle);
      else if (centerHit) startArrayCenter(event);
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
        } else if (symbolPlacing || (tool === 'shape' && isSegment({ shape: tools.shape }))) {
          const snap = edgeSnapAt(toDrawing(event), event);
          if (snap || edgeHover) {
            edgeHover = snap;
            requestLive();
          }
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
      if (!hover && !pickHover && !edgeHover) return;
      hover = null;
      pickHover = null;
      edgeHover = null;
      requestLive();
    });
    // Środkowy przycisk: bez przewijania przeglądarki (kółko z czterema strzałkami w Windows).
    live.addEventListener('mousedown', (event) => {
      if (event.button === 1) event.preventDefault();
    });
    live.addEventListener('auxclick', (event) => event.preventDefault());
    live.addEventListener('wheel', (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        // Ctrl + kółko powiększa – to nie przytrzymanie Ctrl do zaznaczania.
        clearTimeout(ctrlTimer);
        ctrlTimer = 0;
        const box = live.getBoundingClientRect();
        setZoom(view.zoom * Math.exp(-event.deltaY / 300), event.clientX - box.left, event.clientY - box.top);
        return;
      }
      // Kartki (od 1.22): przy całej stronie ruch kółka w pionie przewraca kartkę; powiększona strona
      // najpierw się przesuwa, a na górnym albo dolnym brzegu dalszy ruch kółka przewraca kartkę.
      const vertical = Math.abs(event.deltaY) > Math.abs(event.deltaX);
      const before = view.y;
      if (pages.length < 2 || !vertical || view.zoom > 1.0001) {
        view.x -= event.deltaX;
        view.y -= event.deltaY;
        clampView();
        requestRender();
      }
      if (pages.length < 2 || !vertical) return;
      const now = performance.now();
      // Nowy ruch kółka po przerwie; przewrócona kartka blokuje resztę tego ruchu (bezwładność gładzika).
      if (now - wheelTurn.last > 220) Object.assign(wheelTurn, { sum: 0, locked: false });
      wheelTurn.last = now;
      if (Math.abs(view.y - before) > 0.5) {
        wheelTurn.sum = 0;
        return;
      }
      if (wheelTurn.locked) return;
      wheelTurn.sum += event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
      if (Math.abs(wheelTurn.sum) < (view.zoom > 1.0001 ? 150 : 50)) return;
      const step = Math.sign(wheelTurn.sum);
      Object.assign(wheelTurn, { sum: 0, locked: true });
      if (pageIndex + step >= 0 && pageIndex + step < pages.length) flipTo(pageIndex + step);
    }, { passive: false });
    const wheelTurn = { sum: 0, last: 0, locked: false };

    // ---- okno
    let saving = false;
    const close = async (save) => {
      if (saving) return;
      // Zaznaczony fragment wraca w całości – w zapisie kreski nie są pocięte bez potrzeby.
      clearSelection();
      pages[pageIndex].changed = changed;
      const anyChange = pages.some((page) => page.changed);
      if (save && anyChange) {
        saving = true;
        doneButton.disabled = true;
        try {
          // Zdjęcie pod kreskami musi być wczytane, zanim powstanie obraz rysunku.
          await Promise.all(pages.map((page) => page.ready));
          const [main, ...rest] = pages;
          // Kolejne kartki (od 1.19) – tylko z treścią (pusta nowa kartka nie trafia do notatki).
          const extra = [];
          for (const page of rest.filter((item) => item.changed && hasContent(item.drawing))) {
            extra.push({ drawing: page.drawing, image: await renderDrawingImage(page.drawing, page.media) });
          }
          const image = main.changed ? await renderDrawingImage(main.drawing, main.media) : null;
          result = image || extra.length > 0 ? { drawing: image ? main.drawing : null, image, pages: extra } : null;
        } catch (error) {
          saving = false;
          doneButton.disabled = false;
          showError(error);
          return;
        }
      } else if (!save && anyChange && !(await confirmDialog({
        title: 'Odrzucić zmiany w rysunku?', message: 'Kreski narysowane od otwarcia edytora przepadną.',
        confirmLabel: 'Odrzuć', cancelLabel: 'Rysuj dalej', destructive: true
      }))) {
        return;
      }
      dialog.close(save ? 'done' : 'cancel');
    };
    const cancelButton = h('button', { type: 'button', class: 'button button--plain', dataset: { testid: 'drawing-cancel' }, onClick: () => close(false) }, 'Anuluj');
    const doneButton = h('button', { type: 'button', class: 'button button--plain sheet__submit', dataset: { testid: 'drawing-done' }, onClick: () => close(true) }, 'Gotowe');
    const headerTitle = h('h2', { class: 'sheet__title', dataset: { testid: 'drawing-title' } }, title);
    const panel = h('div', { class: 'sheet__panel drawing', 'aria-label': `Rysunek: ${title}` },
      h('header', { class: 'sheet__header' }, cancelButton, headerTitle, doneButton),
      h('div', { class: 'drawing__body' }, stage, topBar, status));

    /** Pole do pisania (skala, kod koloru) – skróty i Delete działają w nim jak zwykle. */
    const typing = (target) => target instanceof window.HTMLElement && (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      || (target.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(target.type)));
    // Skróty działają w całym oknie – także gdy fokus zniknął (np. „Ponów” stał się nieaktywny),
    // ale nie w oknie pytania nad edytorem.
    const onKey = (event) => {
      if (event.target !== document.body && !dialog.contains(event.target)) return;
      if (event.key === 'Shift' && !shiftDown) {
        shiftDown = true;
        refreshShapeDrag();
      }
      if (event.key === 'Alt') {
        // Bez paska menu przeglądarki – Alt to tu swobodne osadzanie końców.
        event.preventDefault();
        altDown = true;
      }
      if (event.key === 'Control') {
        // Przytrzymanie (bez innego klawisza) – zaznaczanie; skrót Ctrl+… nie zmienia narzędzia.
        if (!event.repeat && !ctrlHold && !ctrlTimer && tool !== 'select' && !typing(event.target) && !panelOpen()) ctrlTimer = setTimeout(beginCtrlHold, CTRL_DELAY);
        return;
      }
      if (event.ctrlKey && ctrlTimer) {
        clearTimeout(ctrlTimer);
        ctrlTimer = 0;
      }
      // Kartki (od 1.19): PageUp i PageDown – poprzednia i następna.
      if ((event.key === 'PageUp' || event.key === 'PageDown') && !typing(event.target) && !panelOpen()) {
        event.preventDefault();
        flipTo(pageIndex + (event.key === 'PageDown' ? 1 : -1));
        return;
      }
      if (event.key === 'Escape' && symbolPlacing) {
        event.preventDefault();
        cancelSymbolPlacing();
        return;
      }
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

    const onKeyUp = (event) => {
      if (event.key === 'Shift') {
        shiftDown = false;
        refreshShapeDrag();
      }
      if (event.key === 'Alt') {
        event.preventDefault();
        altDown = false;
      }
      if (event.key === 'Control') endCtrlHold();
    };
    // Okno bez fokusu (np. Alt+Tab z wciśniętym Ctrl) – puszczenia klawisza nie będzie.
    const onBlur = () => {
      shiftDown = false;
      altDown = false;
      endCtrlHold();
    };

    dialog = mountDialog('drawing-dialog', panel, {
      onDismiss: () => close(false),
      onClose: () => {
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('keyup', onKeyUp, true);
        window.removeEventListener('blur', onBlur);
        clearTimeout(ctrlTimer);
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
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    updateToolbar();
    observer.observe(stage);
    pages.push(makePage(drawing, history));
    ({ media } = pages[0]);
    updatePagePill();
  });
}
