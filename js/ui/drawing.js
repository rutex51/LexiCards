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
// Od 1.30: kartki okna to rysunki notatki (przy zdjęciu – jej zdjęcia), obrót zaznaczenia uchwytem,
// odbicie lustrzane (core/transform.js), Shift – kilka elementów kliknięciami i przełącznik palca.
//
// Rysik i palec: gdy aplikacja raz zobaczy rysik (pointerType 'pen'), rysuje tylko rysik, a palec
// przesuwa stronę (dłoń oparta o ekran nie zostawia śladów); bez rysika (iPhone) rysuje palec.
// Od 1.30 pigułka „Rysuje tylko rysik” przełącza: palec też rysuje (zapamiętane na urządzeniu).
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
  endPoint, findSnap, followersOf, keepLinksTo, newElementId, relinkCopies, resolveAttachments, segmentBetween, snapGeometry, snapNormal, withLink
} from '../core/attach.js';
import {
  DrawingHistory, ELEMENT_TEXT_MAX, ERASER_MODES, ERASER_MODE_LABELS, ERASER_SIZES, ERASER_SIZE_LABELS, HIGHLIGHTER_ALPHA,
  HIGHLIGHTER_COLORS, HIGHLIGHTER_RANGE, INK_COLORS, RAY_STEPS, WIDTH_LIMITS, STICKY_COLORS, STICKY_MIN, STICKY_TEXT_MAX, STICKY_TEXT_SIZES, TABLE_TEXT_SIZES, isBox, PAPERS, PAPER_LABELS, PAPER_STEP, SCALE_UNITS, SELECT_MODES, SELECT_MODE_LABELS,
  SELECT_SHAPES, SENSITIVITY_LABELS, TEXT_SIZES, TEXT_SIZE_LABELS, addPoint, cleanDrawing, cleanScale, cleanToolSettings, shapeToolStyle, stickyColor, withShapeToolStyle,
  DIM_UNITS, DRAWING_VERSION, defaultDimUnit, defaultToolSettings, dimFactor, dimFormat, dimMillimeters, dimUnitLabel, dimUnitNote, dimensionParts, formatTolerance, hasMeasuredContent, elementBox, emptyDrawing, eraseAt, formatLength, formatNumber, formatRatio, fromScaleLength, isClockwise,
  MAX_STROKES, isElement, isHexColor, lineAngleDifference, parseDecimal, penWidth, perpendicularAngle, rectPolygon, rememberColor, rgbToHex,
  hasContent, rulerDegrees, rulerOffset, rulerPoint, scaleUnitLabel, screenScale, screenScaleValue, selectionBounds, smoothPoint, snapRulerAngle,
  snapToStrokes, splitByPolygon, strokeBounds, strokesAt, strokesInPolygon, strokesInRect, toScaleLength, touchesStroke, translateStroke,
  ORDER_LABELS, ORDER_MOVES, lengthText, reorderStrokes, shapeMeasureText
} from '../core/drawing.js';
import { layoutMath } from '../core/math-layout.js';
import { decodeDxf, drawingToDxf, dxfPrimitives, fittingScale, pageUnitMillimeters, parseDxf, primitivesBounds, primitivesToElements } from '../core/dxf.js';
import {
  BACKGROUND_LAYER, LAYER_LIMIT, LAYER_NAME_MAX, PHOTO_LAYER, SIGNATURE_LIMIT, addLayer, drawingLayers, elementLayers, layerUse, layersActive, layersOf,
  levelEffect, removeLayer, saturateHex, strokeEffect, toneStroke, updateLayer, withSignatures
} from '../core/layers.js';
import { constrainCorner, cornerOf, cornerPath, foldGeometry } from '../core/page-curl.js';
import { recognizeStroke } from '../core/recognize.js';
import { rememberFit } from '../core/fits.js';
import {
  MIRROR_AXES, MIRROR_LABELS, SCALE_LIMITS, canTurn, hasStyle, mirrorAcross, mirrorStroke, rotateStroke, scaleStroke, snapTurn, transformStrokes, turnDegrees,
  withStyleOf
} from '../core/transform.js';
import { FRAME_FIELDS, FRAME_FIELD_LABELS, FRAME_FIELD_MAX, FRAME_FORMATS, cleanFrame, frameScaleText } from '../core/title-block.js';
import { cleanColumnWidths, moveColumnBorder } from '../core/tables.js';
import { DIAGRAM_LIMITS, DIAGRAM_SIZES, causesText, cleanDiagram, diagramLabel, diagramTargetAt, newDiagram, parseCauses, withDiagramSize } from '../core/diagrams.js';
import { COLUMN_DEFAULTS, LAYOUT_KINDS, LAYOUT_LABELS, MATRIX_DEFAULT, cleanLayout } from '../core/page-layouts.js';
import { paintDiagram, paintPageLayout } from './drawing-diagrams.js';
import { openFitTable } from './fit-table.js';
import { RING_SIDES, findGroup, groupsOf, isModeItem, startGroup, toolItem, uiPartHidden } from '../core/tool-ring.js';
import { openToolGroups } from './drawing-groups.js';
import { createRing } from './drawing-ring.js';
import {
  DIM_FONT, DIM_PREFIXES, FIT_RE, LABEL_TEXT_MAX, POINT_MARKS, POINT_MARK_LABELS, SEGMENT_CAPS, SEGMENT_CAP_LABELS, SHAPES, SHAPE_DASHES, SHAPE_DASH_LABELS,
  SHAPE_FILLS, SHAPE_FILL_LABELS, SHAPE_LABELS, SKEW_DEGREES_LIMIT, canDash, hasCaps, isPointShape, pointMark, shapeDash, withDash,
  canFill, dimCenter, dimGeometry, dimOffset, dimOffsetAt, dimPlaces, guideLinesIn, isLinearDim, isSegment, isShape, labelFrame, labelMaxWidth, moveShapeHandle, nearestGuideLine, nearestRay,
  nearestRing, rayAngles, resizeShape, ringsIn, stackDimOffset, withDimOffset, withDimTolerance,
  segmentCaps, segmentDegrees, setSegment, shapeContains, shapeFromDrag, shapeHandles, shapePoint, shownDims, skewDegrees, touchesShape,
  withCaps, withDims, ELLIPSE_MODES, ELLIPSE_MODE_LABELS, angleDimFromPoints, arcFromPoints, arcGeometry,
  angleDimDegrees, circleFromPoints, dimAwayFrom, dimFromPoints, dimMode, isArc, isMeasure,
  CORNER_LABELS, HATCH_ANGLES, HATCH_GAPS, HATCH_GAP_LABELS, NGON_SIDES, cleanHatch, ngonSides, withCorner, withNgonSides, withShapeFill,
  ARC_MODES, ARC_MODE_LABELS, DIM_AXES, DIM_AXIS_LABELS, DIM_OFFSET_LIMITS, DIM_TIER, arcDimFromArc, arcDimLength, arcFromCenter, dimAxis, measuredLength,
  withAxes, withDimAxis, POLY_NODES_MAX, polyFromPoints
} from '../core/shapes.js';
import {
  canExtend, canOffset, canTrim, chamferSegments, edgesOf, extendAt, filletSegments, isPlainSegment, offsetShape, tangentCircle, tangentTarget, trimAt
} from '../core/geometry-edit.js';
import {
  DEFAULT_PAPER_LEVEL, DEFAULT_TEMPLATE_LEVEL, LEVEL_LABELS, PAPER_COLORS, TEMPLATE_ALPHA, TEMPLATE_CORNERS, TEMPLATE_LABELS, centerTemplate,
  fitTemplate, pitchScale, resizeTemplateCorner, scaleTemplate, setTemplatePercent, templateCorner, templatePercent
} from '../core/templates.js';
import { plural } from '../core/text.js';
import { TOOLS_KEY, colorTabBody } from './color-picker.js';
import { field, group, radioRow, segmented, textArea, textInput, toggle } from './components.js';
import { deliverFile, pickFile } from './files.js';
import { confirmDialog, mountDialog, openFormSheet, openMenu, showError } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { hintsToggle } from './hints.js';
import { icon } from './icons.js';
import {
  DATUM_LETTER_RE, DATUM_RE, GDT_DATUMS_MAX, GDT_SYMBOLS, ROUGHNESS_ALLOWANCE_MAX, ROUGHNESS_KINDS, ROUGHNESS_KIND_LABELS, ROUGHNESS_LAYS, ROUGHNESS_LAY_LABELS,
  ROUGHNESS_METHOD_MAX, ROUGHNESS_TEXT_MAX, SYMBOL_TEXT_SIZES, cleanGdtValue,
  datumSide, gdtSymbol, isSymbol, nextDatumLetter, roughnessLayout
} from '../core/gdt.js';
import {
  dimTextWidth, gdtGlyphCanvas, measureGdt, measureRoughness, paintDatum, paintDimText, paintGdt, paintRoughness, paintTechnicalDim
} from './drawing-gdt.js';
import { openMathHelp } from './math.js';
import { paintFrame, paintShape, paintTemplate } from './drawing-paint.js';
import { prepareImage } from './images.js';
import { symbolField } from './symbols.js';
import { TEXT_FONT, TEXT_LINE, measureText, textFont, textLines } from './canvas-text.js';
import { fitStickyWidth, measureSticky, measureTable, naturalTableWidth, paintSticky, paintStickyPopover, paintTable, stickyDate, stickyPopoverBox, tableColumnWidths } from './drawing-boxes.js';
import { openTableEditor } from './table-editor.js';
import { playPage } from './sounds.js';

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
/** Wysokość paska zaznaczenia w jednym wierszu (px) – wyższy znaczy, że polecenia przeszły do drugiego wiersza (od 1.41). */
const SELECTION_ROW = 60;
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
  line: 'shapeLine', arrow: 'shapeArrow', rect: 'shapeRect', ellipse: 'shapeEllipse', triangle: 'shapeTriangle', diamond: 'shapeDiamond', trapezoid: 'shapeTrapezoid',
  xline: 'shapeXline', curve: 'shapeCurve', point: 'shapePoint', arc: 'shapeArc', dim: 'dimension', ngon: 'shapeNgon', ray: 'shapeRay', polyline: 'shapePolyline'
};
/** SIPOC (od 1.44): tabela z nagłówkami dostawcy, wejścia, proces, wyjścia, klienci i czterema pustymi wierszami. */
const SIPOC_TABLE = Object.freeze({ rows: [['Dostawcy (S)', 'Wejścia (I)', 'Proces (P)', 'Wyjścia (O)', 'Klienci (C)'], ...Array.from({ length: 4 }, () => ['', '', '', '', ''])], header: true });
/** Narożniki prostokąta (od 1.40) – ikony wyboru i gotowe wielkości (¼, ½ i 1 kratka). */
const CORNER_ICONS = { none: 'cornerNone', round: 'cornerRound', chamfer: 'cornerChamfer' };
const CORNER_CHOICE_LABELS = { none: 'Ostre', ...CORNER_LABELS };
const CORNER_SIZES = [PAPER_STEP / 4, PAPER_STEP / 2, PAPER_STEP];
/** Kolejność rysowania (od 1.40) – ikony w menu. */
const ORDER_ICONS = { front: 'orderFront', up: 'orderUp', down: 'orderDown', back: 'orderBack' };
/** Rodzaje linii i znaczniki punktu (od 1.27) – ikony wyboru. */
const DASH_ICONS = { solid: 'lineSolid', dashed: 'lineDashed', center: 'lineCenter', phantom: 'linePhantom', dotted: 'lineDotted' };
const MARK_ICONS = { center: 'shapePoint', dot: 'markDot', cross: 'markCross', plus: 'markPlus' };
/** Kształty: uchwyty (px ekranu) – promień trafienia, odległość uchwytu obrotu od kształtu. */
const HANDLE_HIT = 18;
/** Promień przyciągania końca do krawędzi albo narożnika (od 1.22) – ok. 3–4 mm na ekranie (px). */
const EDGE_SNAP = 14;
const ROTATE_GAP = 30;
/**
 * Rozpoznawanie kształtów (od 1.24): pióro przytrzymane na końcu kreski tyle ms – kreska zamienia się
 * w figurę; drżenie ręki do tylu px ekranu nie przerywa przytrzymania.
 */
const HOLD_MS = 500;
const HOLD_SLOP = 6;
/**
 * Spirala na lewym grzbiecie kartki (od 1.24.1, tylko w edytorze – obraz rysunku w notatce, wycinek
 * i „Osadź” jej nie mają): dziurki co kratkę w odległości holeX od lewej krawędzi, zwoje drutu wokół
 * osi tuż za krawędzią (axis); jednostki strony. OUT – ile spirala wystaje za krawędź (miejsce przy
 * dopasowaniu strony do ekranu). Strona ze zdjęciem – bez spirali.
 */
const SPIRAL = Object.freeze({ step: PAPER_STEP, holeX: 24, holeR: 7, axis: -6, wire: 5, margin: 30 });
const SPIRAL_OUT = 40;
/** Połysk drutu spirali (od 1.35): [kolor, szerokość względem drutu, przesunięcie ku górze 0–1]. */
const WIRE_SHINE = Object.freeze([
  ['#7c7c80', 0.8, 0], ['#8e8e93', 0.66, 0.15], ['#a1a1a6', 0.52, 0.35], ['#b7b7bc', 0.4, 0.55], ['#cdcdd2', 0.29, 0.75], ['rgba(236, 236, 241, 0.92)', 0.17, 1]
]);
/** Oznaczenie „Wymiary w mm” (od 1.25): wielkość tekstu, odstęp od dołu i od lewej krawędzi (za dziurkami spirali). */
const UNIT_NOTE_SIZE = 22;
const UNIT_NOTE_MARGIN = 20;
const UNIT_NOTE_LEFT = 52;
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
export function paintPaper(ctx, drawing, effect = null) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, drawing.width, drawing.height);
  // Od 1.36 poziom „Tło”: ukryty – sama biała strona, przezroczystość i nasycenie – linii papieru.
  if (drawing.paper === 'plain' || drawing.photo || effect?.hidden) return;
  ctx.save();
  if (effect) ctx.globalAlpha = effect.opacity;
  ctx.strokeStyle = saturateHex(PAPER_COLORS[drawing.paper][drawing.paperLevel ?? DEFAULT_PAPER_LEVEL], effect?.saturation ?? 1);
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
  // Diagram jakości (od 1.44) – wielkość z rozkładu.
  if (stroke.tool === 'diagram') return withDiagramSize(stroke);
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
function paintDims(ctx, shape, scale, format, { text = true, offsets = null } = {}) {
  for (const key of shownDims(shape)) {
    const offset = offsets?.[key];
    paintTechnicalDim(ctx, shape, key, text ? dimensionParts(shape, key, scale, format) : null, { offset, dashed: offset !== undefined });
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
  // Diagram Ishikawy i 5 × Dlaczego (od 1.44).
  if (stroke.tool === 'diagram') {
    paintDiagram(ctx, stroke);
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
    // Wymiar narzędzia „Wymiar” (od 1.34) – sam wymiar; bez liczby (dims: false), gdy liczba jest w polu zaznaczonego.
    if (isMeasure(stroke)) {
      paintDims(ctx, stroke, options.scale, options.dimFormat, { text: options.dims !== false });
      return;
    }
    paintShape(ctx, stroke);
    if (stroke.label) paintLabel(ctx, stroke);
    if (options.dims !== false) paintDims(ctx, stroke, options.scale, options.dimFormat);
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
    ctx.globalAlpha *= HIGHLIGHTER_ALPHA;
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
  const format = dimFormat(drawing);
  // Warstwy (od 1.36): tło, obraz i elementy – ukryte, przezroczyste, mniej nasycone.
  const layers = drawingLayers(drawing);
  const active = layersActive(layers);
  const background = active ? levelEffect(layers, BACKGROUND_LAYER) : null;
  paintPaper(ctx, drawing, background);
  if (media.photo) paintPhoto(ctx, drawing, media.photo, active ? levelEffect(layers, PHOTO_LAYER) : null);
  if (drawing.template && !background?.hidden) {
    ctx.save();
    if (background) ctx.globalAlpha = background.opacity;
    paintTemplate(ctx, drawing.template, media.template);
    ctx.restore();
    if (background && background.saturation < 1) desaturate(ctx, drawing.template, background.saturation);
  }
  // Ramka rysunkowa z tabliczką (od 1.41) – razem z tłem (ukryte tło – bez ramki).
  if (drawing.frame && !background?.hidden) {
    ctx.save();
    if (background) ctx.globalAlpha = background.opacity;
    paintFrame(ctx, drawing);
    ctx.restore();
  }
  // Układ kartki (od 1.44) – też część tła.
  if (drawing.layout && !background?.hidden) {
    ctx.save();
    if (background) ctx.globalAlpha = background.opacity;
    paintPageLayout(ctx, drawing);
    ctx.restore();
  }
  let number = 0;
  for (const stroke of drawing.strokes) {
    // Karteczki mają numery w kolejności na rysunku (od 1.21).
    if (stroke.tool === 'sticky') number += 1;
    if (skip?.has(stroke)) continue;
    const effect = active ? strokeEffect(layers, stroke) : null;
    if (effect?.hidden) continue;
    const painted = effect && effect.saturation < 1 ? toneStroke(stroke, effect.saturation, stickyColor) : stroke;
    const options = { scale: drawing.scale, dimFormat: format, dims: stroke !== plain, number: stroke.tool === 'sticky' ? number : null, editor, image };
    if (effect && effect.opacity < 1) {
      ctx.save();
      ctx.globalAlpha = effect.opacity;
      paintStroke(ctx, painted, options);
      ctx.restore();
    } else {
      paintStroke(ctx, painted, options);
    }
  }
  paintUnitNote(ctx, drawing, format);
}

/** Zdjęcie pod rysunkiem (poziom „Obraz”, od 1.36 z ukryciem, przezroczystością i nasyceniem). */
function paintPhoto(ctx, drawing, photo, effect) {
  if (effect?.hidden) return;
  ctx.save();
  if (effect) ctx.globalAlpha = effect.opacity;
  ctx.drawImage(photo, 0, 0, drawing.width, drawing.height);
  ctx.restore();
  if (effect && effect.saturation < 1) desaturate(ctx, { x: 0, y: 0, w: drawing.width, h: drawing.height }, effect.saturation);
}

/** Mniejsze nasycenie prostokąta już narysowanego (tryb mieszania „nasycenie” z szarym, bez dodatkowego płótna). */
function desaturate(ctx, rect, saturation) {
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = 1 - saturation;
  ctx.fillStyle = '#808080';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/**
 * Oznaczenie jednostki (od 1.25): przy liczbach wymiarów bez jednostki – „Wymiary w mm” w lewym dolnym
 * rogu strony (na rysunku i na obrazie w notatce; w edytorze nie zasłania go pasek narzędzi ani
 * przyciski kartek), gdy są wymiary długości albo ramki tolerancji.
 */
function paintUnitNote(ctx, drawing, format) {
  const note = dimUnitNote(format);
  if (!note || !hasMeasuredContent(drawing)) return;
  ctx.save();
  ctx.font = textFont(UNIT_NOTE_SIZE, '500');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#3a3a3c';
  ctx.fillText(note, UNIT_NOTE_LEFT, drawing.height - UNIT_NOTE_MARGIN);
  ctx.restore();
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
    // Od 1.25 schowek ma tolerancje w mm (jak rysunek w formacie 10) – bez przeliczania.
    const clean = raw && cleanDrawing({ width: 8192, height: 8192, strokes: raw.strokes, version: DRAWING_VERSION });
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

/**
 * Zaznaczone kreski i elementy na białym tle z marginesem (Kopiuj – obraz w schowku systemu, Osadź); scale – skala rysunku
 * (wymiary), layers – warstwy rysunku (od 1.36 krycie i nasycenie jak na stronie).
 */
function strokesCanvas(strokes, scale, layers = null) {
  const bounds = selectionBounds(strokes);
  const area = { minX: bounds.minX - EXPORT_PAD, minY: bounds.minY - EXPORT_PAD, maxX: bounds.maxX + EXPORT_PAD, maxY: bounds.maxY + EXPORT_PAD };
  return areaCanvas(area, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(area.minX, area.minY, area.maxX - area.minX, area.maxY - area.minY);
    for (const stroke of strokes) {
      const effect = layers && layersActive(layers) ? strokeEffect(layers, stroke) : null;
      if (effect?.hidden) continue;
      ctx.save();
      if (effect) ctx.globalAlpha = effect.opacity;
      paintStroke(ctx, effect && effect.saturation < 1 ? toneStroke(stroke, effect.saturation, stickyColor) : stroke, { scale });
      ctx.restore();
    }
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

/** Rysunek z notatki do edycji: pola tekstowe i wzory mierzone od nowa – czcionki tego urządzenia mogą być trochę inne. */
const editableDrawing = (source) => ({
  ...source, scale: cleanScale(source.scale), paperLevel: source.paperLevel ?? DEFAULT_PAPER_LEVEL, strokes: source.strokes.map(remeasure)
});
/** Rysunek kartki: istniejący (drawing), na zdjęciu (photo) albo nowy pusty. */
const sheetDrawing = (sheet) => (sheet.drawing ? editableDrawing(sheet.drawing) : emptyDrawing({ photo: sheet.photo ?? null }));

/**
 * Otwiera edytor rysunku. drawing – istniejący rysunek (edycja) albo null; photo – zdjęcie pod
 * kreskami dla nowego rysunku ({ bytes, type, width, height }); title – sygnatura w nagłówku.
 * Od 1.30 sheets – kilka rysunków notatki w jednym oknie, przewracanych jak kartki: [{ title,
 * drawing } – rysunek, { title, photo } – zdjęcie do rysowania, { title, load } – load() daje obietnicę
 * { drawing } albo { photo } (zdjęcie wczytane dopiero przy przejściu na nie), { title } – nowy
 * rysunek (bez zmian nie trafia do notatki)]; start – kartka otwarta na początku (bez load).
 * newPages – „Nowa kartka” (przy zdjęciach – bez niej); pageRoom – ile kartek można dodać (miejsce
 * w notatce); pageTitle(n) – sygnatura n-tej dodanej kartki.
 * onEmbed (od 1.17) – „Osadź”: async ({ blob, width, height, sheet }) → sygnatura nowego obrazu notatki
 * (sheet – numer kartki; błąd – komunikat w edytorze); bez niej przycisku „Osadź” nie ma.
 * Zwraca obietnicę: po „Gotowe” { sheets, pages } – sheets: zmienione kartki [{ index, drawing, image }]
 * (index – numer w sheets), pages (od 1.19) – dodane kartki z treścią [{ drawing, image, title }];
 * null po „Anuluj” i po „Gotowe” bez żadnej zmiany.
 */
export function openDrawingEditor({
  drawing: source = null, photo = null, title = 'Rysunek', onEmbed = null, sheets = null, start = 0, newPages = true, pageRoom = 20, pageTitle: addedTitle = null
} = {}) {
  return new Promise((resolve) => {
    const sheetList = sheets?.length ? sheets : [{ title, drawing: source, photo }];
    const startIndex = Math.min(Math.max(0, Math.round(start) || 0), sheetList.length - 1);
    /**
     * Kartki (od 1.19; od 1.30 – rysunki notatki i dodane kartki). Każda ma swój rysunek (kartka ze
     * zdjęciem do wczytania – na razie bez), historię cofania, obrazy (zdjęcie, szablon) i znacznik
     * zmiany; edytor pracuje na bieżącej.
     */
    const pages = [];
    let pageIndex = startIndex;
    let drawing = sheetDrawing(sheetList[startIndex]);
    let history = new DrawingHistory(drawing.strokes);
    const tools = loadTools();
    /** Narzędzie: 'pen', 'highlighter', 'eraser' albo 'select' (zaznaczanie prostokątem albo lassem). */
    let tool = 'pen';
    /** Ostatnie narzędzie inne niż zaznaczanie – lewy Alt i przycisk zaznaczania wracają do niego (od 1.32). */
    let lastTool = 'pen';
    let penSeen = penSeenBefore();
    /** Palec przesuwa stronę: aplikacja zna rysik, a (od 1.30) palec nie ma rysować. */
    const fingerPans = () => penSeen && !tools.fingerDraws;
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
    /** Kształt z kilku punktów w trakcie (od 1.34): { kind: 'circle3' | 'arc' | 'angle', points } i punkt pod myszą. */
    let pending = null;
    let pendingHover = null;
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
    const view = { zoom: 1, scale: 1, x: 0, y: 0, width: 0, height: 0, top: STAGE_MARGIN, bottom: STAGE_MARGIN, dpr: 1 };
    const stage = h('div', { class: 'drawing__stage', dataset: { testid: 'drawing-stage' } });
    const base = h('canvas', { class: 'drawing__canvas', 'aria-hidden': 'true' });
    const live = h('canvas', { class: 'drawing__canvas drawing__canvas--live', role: 'img', 'aria-label': `Płótno rysunku: ${title}`, dataset: { testid: 'drawing-canvas' } });
    const selectionCount = h('span', { class: 'drawing__selection-count', dataset: { testid: 'drawing-selection-count' } });
    // Od 1.40: pole i obwód zaznaczonego zamkniętego kształtu w jednostkach rysunku.
    const selectionMeasure = h('span', {
      class: 'drawing__selection-measure', hidden: true, title: 'Pole i obwód w skali rysunku', dataset: { testid: 'drawing-selection-measure' }
    });
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
    // Od 1.35 styl zaznaczonego kształtu (do 1.34 przycisk „Styl” i okno) – w trzecim menu nad stroną.
    // Od 1.19: szyk (nowy albo zmiana parametrów) i rozdzielenie szyku.
    // Od 1.22: magnes – przyciąganie końców do krawędzi i narożników (wł./wył., zapamiętane na urządzeniu).
    const magnetButton = selectionButton('drawing-selection-magnet', 'magnet', 'Przyciąganie',
      'Przyciąganie końców do krawędzi i narożników – wł./wył. (z Alt – chwilowo swobodnie)', () => toggleEdgeSnap());
    const arrayButton = selectionButton('drawing-selection-array', 'array', 'Szyk', 'Powiel w szyku – liniowym albo kołowym', () => editArray());
    const explodeButton = selectionButton('drawing-selection-explode', 'explode', 'Rozdziel', 'Rozdziel szyk – każda kopia osobno', () => explodeArray());
    const copyButton = selectionButton('drawing-selection-copy', 'copy', 'Kopiuj', 'Kopiuj (Ctrl+C) – wklejasz przyciskiem „Wklej” albo Ctrl+V, także w innym rysunku', () => copySelection());
    const duplicateButton = selectionButton('drawing-selection-duplicate', 'duplicate', 'Powiel', 'Powiel – kopia obok', () => duplicateSelection());
    // Od 1.30: odbicie lustrzane zaznaczenia – w poziomie albo w pionie (menu), obok „Powiel”.
    const mirrorButton = selectionButton('drawing-selection-mirror', 'mirror', 'Odbij', 'Odbicie lustrzane – w poziomie, w pionie albo względem prostej przez dwa punkty', () => openMirrorMenu());
    mirrorButton.setAttribute('aria-haspopup', 'menu');
    // Od 1.41: skalowanie o współczynnik i „Styl jak…” – styl dotkniętego elementu na zaznaczonych.
    const scaleButton = selectionButton('drawing-selection-scale', 'scale', 'Skaluj', 'Skaluj o współczynnik – wokół środka zaznaczenia', () => openScaleSheet());
    const matchButton = selectionButton('drawing-selection-match', 'brush', 'Styl jak…', 'Styl jak… – dotknij elementu, którego kolor, grubość, linię i wypełnienie przenieść na zaznaczone', () => startPointPick('match'));
    // Od 1.42: wymiary łańcuchowe i od bazy – po zaznaczonym wymiarze liniowym kolejne dotknięcia dodają wymiary.
    // Od 1.44: kolejne „Dlaczego?” zaznaczonego diagramu 5 × Dlaczego – okno z nowym polem.
    const whyButton = selectionButton('drawing-selection-why', 'whys', 'Dlaczego?', 'Kolejne „Dlaczego?” – nowe pole na końcu łańcucha', () => {
      const [only] = selection;
      if (only?.tool === 'diagram') editDiagram(only, 'whys', 'add');
    });
    const chainButton = selectionButton('drawing-selection-chain', 'dimChain', 'Łańcuch', 'Wymiary łańcuchowe – każde dotknięcie dodaje wymiar od końca poprzedniego (Esc – koniec)', () => startPointPick('chain'));
    const baselineButton = selectionButton('drawing-selection-baseline', 'dimBaseline', 'Od bazy', 'Wymiary od bazy – każde dotknięcie dodaje wymiar od początku tego wymiaru, piętro wyżej (Esc – koniec)', () => startPointPick('baseline'));
    // Od 1.40: kolejność rysowania – na wierzch, wyżej, niżej, na spód (menu).
    const orderButton = selectionButton('drawing-selection-order', 'order', 'Kolejność', 'Kolejność rysowania – na wierzch, wyżej, niżej, na spód', () => openOrderMenu());
    orderButton.setAttribute('aria-haspopup', 'menu');
    const embedButton = selectionButton('drawing-selection-embed', 'embed', 'Osadź', 'Osadź w notatce jako obraz', () => embedSelection());
    const deleteButton = selectionButton('drawing-selection-delete', 'trash', 'Usuń', 'Usuń (Delete)', () => deleteSelection(), true);
    // Od 1.36: warstwy zaznaczonych (sygnatury rzędu 1–3) – panel warstw nad dolnym paskiem.
    const layersSelectionButton = selectionButton('drawing-selection-layers', 'stack', 'Warstwy', 'Warstwy zaznaczonych (sygnatury)', () => openLayersPanel());
    // Od 1.35: „Przesuń” – przeciągnięcie w dowolnym miejscu strony przesuwa zaznaczenie (na ekranie dotykowym
    // trudno trafić w cienką kreskę); ponowne dotknięcie przycisku albo zdjęcie zaznaczenia – koniec.
    let moveMode = false;
    const moveButton = selectionButton('drawing-selection-move', 'move', 'Przesuń', 'Przesuń – przeciągnij w dowolnym miejscu strony (dotknij ponownie, żeby skończyć)', () => {
      moveMode = !moveMode;
      moveButton.setAttribute('aria-pressed', String(moveMode));
      stage.classList.toggle('drawing__stage--moving', moveMode);
      updateToolbar();
      requestLive();
    });
    moveButton.setAttribute('aria-pressed', 'false');
    const selectionBar = h('div', { class: 'drawing__selection', hidden: true, role: 'toolbar', 'aria-label': 'Zaznaczone kreski' },
      // Od 1.41 nazwa i pole z obwodem w jednej kolumnie (na telefonie – pole i obwód w osobnym wierszu).
      h('span', { class: 'drawing__selection-head' }, selectionCount, selectionMeasure), moveButton, editButton, collapseButton, shapeTextButton, magnetButton, layersSelectionButton, copyButton, duplicateButton,
      whyButton, chainButton, baselineButton, mirrorButton, scaleButton, matchButton, orderButton, arrayButton, explodeButton, embedButton, deleteButton);
    // Pola wymiarów zaznaczonego kształtu (od 1.17): na liniach ramki konstrukcyjnej, wpisywane z klawiatury.
    const dims = h('div', { class: 'drawing__dims', hidden: true, dataset: { testid: 'drawing-dims' } });
    // Od 1.22: animacja przewracania kartki (zdjęcia stron nad płótnem, tylko w trakcie).
    const flipCanvas = h('canvas', { class: 'drawing__flip', hidden: true, 'aria-hidden': 'true' });
    stage.append(base, live, flipCanvas, dims, selectionBar);

    /** Spirala przy lewej krawędzi (od 1.24.1) – kartki bez zdjęcia; miejsce na nią po obu stronach (strona na środku). */
    const hasSpiral = () => !drawing.photo;
    const spiralRoom = () => (hasSpiral() ? SPIRAL_OUT : 0);
    const fitScale = () => Math.min((view.width - STAGE_MARGIN * 2) / (drawing.width + spiralRoom() * 2), (view.height - view.top - view.bottom) / drawing.height);
    /** Strona mniejsza niż ekran – na środku (pod paskiem narzędzi); większa – nie ucieka poza krawędź (spirala – w zasięgu). */
    const clampView = () => {
      const pageWidth = drawing.width * view.scale;
      const pageHeight = drawing.height * view.scale;
      const room = view.height - view.top - view.bottom;
      const spiral = spiralRoom() * view.scale;
      view.x = pageWidth + spiral * 2 <= view.width - STAGE_MARGIN * 2 + 0.5 ? (view.width - pageWidth) / 2
        : Math.min(STAGE_MARGIN + spiral, Math.max(view.width - STAGE_MARGIN - pageWidth, view.x));
      view.y = pageHeight <= room ? view.top + (room - pageHeight) / 2
        : Math.min(view.top, Math.max(view.height - view.bottom - pageHeight, view.y));
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
    /** W trakcie przewracania kartki (od 1.25.1) zwoje spirali rysuje płótno animacji – pod płatem kartki. */
    let coilsOnFlip = false;
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
      const moving = ['move', 'shape-edit', 'array-center', 'box-edit', 'turn'].includes(active?.kind) ? selection : null;
      // Przyklejone końce (od 1.22) idą za przesuwanym kształtem – rysuje je warstwa bieżąca.
      const followers = activeFollowers();
      paintDrawing(ctx, drawing, media, followers ? new Set([...(moving ?? []), ...followers.keys()]) : moving, plainShape, { editor: true });
      paintHoles(ctx);
      ctx.restore();
    };

    // ---- spirala na grzbiecie (od 1.24.1): dziurki – na stronie, zwoje – na warstwie bieżącej (nad kreskami)
    /** Środki dziurek (y, jednostki strony) – co kratkę, na środku wysokości strony. */
    function spiralHoles() {
      const count = Math.max(0, Math.floor((drawing.height - SPIRAL.margin * 2) / SPIRAL.step) + 1);
      const first = (drawing.height - (count - 1) * SPIRAL.step) / 2;
      return Array.from({ length: count }, (_, index) => first + index * SPIRAL.step);
    }
    /** Dziurki w kartce: przez dziurkę widać kartkę pod spodem (szarość), cień na górnym brzegu. */
    function paintHoles(ctx) {
      if (!hasSpiral()) return;
      ctx.save();
      // Środek dziurki trochę na prawo od końca drutu – drut wchodzi w dziurkę przy jej lewym brzegu.
      const x = SPIRAL.holeX + 2.5;
      for (const y of spiralHoles()) {
        ctx.beginPath();
        ctx.arc(x, y, SPIRAL.holeR, 0, Math.PI * 2);
        ctx.fillStyle = '#b4b4b9';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, SPIRAL.holeR - 1, Math.PI * 0.9, Math.PI * 2.1);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, SPIRAL.holeR + 0.4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.restore();
    }
    /**
     * Zwoje spirali (płótno z przekształceniem strony): drut wokół osi przy krawędzi – przednia połowa
     * zwoju wychodzi z dziurki, przechodzi nad krawędzią i schodzi o pół kratki (z cieniem na kartce
     * i połyskiem), tylna – pod kartką do następnej dziurki (widać ją tylko za krawędzią, ciemniejszą).
     * Od 1.35 drut kończy się w ostatniej dziurce (bez zwoju w powietrzu pod nią), a połysk przechodzi
     * łagodnie – kilka coraz jaśniejszych i węższych pasm.
     */
    function paintCoils(ctx) {
      if (!hasSpiral()) return;
      const holes = spiralHoles();
      const radius = SPIRAL.holeX - SPIRAL.axis;
      // Zwój widziany lekko z ukosa (jak spirala zeszytu na zdjęciu): przednia połowa wygina się w górę, tylna – w dół.
      const tilt = radius * 0.38;
      const turn = (y, from, to) => Array.from({ length: 17 }, (_, index) => {
        const angle = from + ((to - from) * index) / 16;
        return [SPIRAL.axis + radius * Math.cos(angle), y + (SPIRAL.step * angle) / (Math.PI * 2) - tilt * Math.sin(angle)];
      });
      const path = (points) => {
        ctx.beginPath();
        points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      };
      const unit = view.scale * view.dpr;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.save();
      ctx.beginPath();
      ctx.rect(-SPIRAL_OUT * 2, -SPIRAL.step, SPIRAL_OUT * 2, drawing.height + SPIRAL.step * 2);
      ctx.clip();
      ctx.strokeStyle = '#636366';
      ctx.lineWidth = SPIRAL.wire * 0.85;
      for (const y of holes.slice(0, -1)) {
        path(turn(y, Math.PI, Math.PI * 2));
        ctx.stroke();
      }
      ctx.restore();
      for (const y of holes.slice(0, -1)) {
        const points = turn(y, 0, Math.PI);
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
        ctx.shadowBlur = 2.5 * unit;
        ctx.shadowOffsetX = 1.2 * unit;
        ctx.shadowOffsetY = 2 * unit;
        path(points);
        ctx.strokeStyle = '#48484a';
        ctx.lineWidth = SPIRAL.wire;
        ctx.stroke();
        ctx.restore();
        // Połysk: pasma od szarego do prawie białego, coraz węższe i bliżej górnej krawędzi drutu.
        for (const [color, width, lift] of WIRE_SHINE) {
          ctx.save();
          ctx.translate(-0.5 * lift, -0.7 * lift);
          path(points);
          ctx.strokeStyle = color;
          ctx.lineWidth = SPIRAL.wire * width;
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }

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
          const found = snapToStrokes(shownStrokes(), zero.x, zero.y, ZERO_SNAP / view.scale);
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
      // Shift (od 1.30) dokłada całe elementy – bez względu na kierunek obrysu i tryb.
      if (gesture.add) return 'whole';
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

    // ---- obrót zaznaczenia (od 1.30): uchwyt nad środkiem ramki – kilka elementów, kreski, szyki; jeden kształt
    // obraca się swoim uchwytem (punkty konstrukcyjne), a pole tekstowe, wzór, tabela i karteczka stoją prosto
    const spinPoint = (point, center, angle) => {
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      return { x: center.x + (point.x - center.x) * cos - (point.y - center.y) * sin, y: center.y + (point.x - center.x) * sin + (point.y - center.y) * cos };
    };
    /** Uchwyt obrotu zaznaczenia { x, y, center, bounds } (jednostki strony) albo null; w trakcie obrotu – obrócony. */
    function turnKnob() {
      if (active?.kind === 'turn') return { ...spinPoint(active.knob, active.center, active.angle), center: active.center, bounds: active.bounds };
      if (tool !== 'select' || active || snip || placing || selection.size === 0 || editedShape()) return null;
      const items = [...selection];
      if (!canTurn(items)) return null;
      const bounds = selectionBounds(items);
      const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
      return { x: center.x, y: bounds.minY - (SELECTION_PAD + ROTATE_GAP) / view.scale, center, bounds };
    }
    const turnKnobHit = (point) => {
      const knob = turnKnob();
      return Boolean(knob) && Math.hypot(knob.x - point.x, knob.y - point.y) * view.scale <= HANDLE_HIT;
    };
    function startTurn(event) {
      const knob = turnKnob();
      const point = toDrawing(event);
      const items = orderedSelection();
      active = {
        kind: 'turn', id: event.pointerId, touch: event.pointerType === 'touch', start: point, client: local(event), items, preview: items,
        bounds: knob.bounds, center: knob.center, knob: { x: knob.x, y: knob.y }, grab: Math.atan2(point.y - knob.center.y, point.x - knob.center.x), angle: 0, moved: false
      };
      requestRender();
    }
    /** Uchwyt obrotu z ramieniem; w trakcie obrotu – obrócona ramka i kąt. */
    function paintTurnKnob(ctx, knob) {
      const { bounds, center } = knob;
      const angle = active?.kind === 'turn' ? active.angle : 0;
      const pad = SELECTION_PAD / view.scale;
      const top = toScreen(spinPoint({ x: center.x, y: bounds.minY - pad }, center, angle));
      const point = toScreen(knob);
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.strokeStyle = SELECT_COLORS.whole;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      if (active?.kind === 'turn') {
        [[bounds.minX - pad, bounds.minY - pad], [bounds.maxX + pad, bounds.minY - pad], [bounds.maxX + pad, bounds.maxY + pad], [bounds.minX - pad, bounds.maxY + pad]]
          .map(([x, y]) => toScreen(spinPoint({ x, y }, center, angle)))
          .forEach((corner, index) => (index === 0 ? ctx.moveTo(corner.x, corner.y) : ctx.lineTo(corner.x, corner.y)));
        ctx.closePath();
      }
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, -Math.PI * 0.9, Math.PI * 0.4);
      ctx.lineWidth = 1.3;
      ctx.stroke();
      if (active?.kind === 'turn' && active.moved) {
        // Kąt jak na linijce: dodatni – przeciwnie do ruchu wskazówek zegara.
        const text = `${turnDegrees(active.angle)}°`.replace('-', '−');
        ctx.font = '600 13px -apple-system, system-ui, sans-serif';
        const width = ctx.measureText(text).width + 18;
        const [x, y] = [point.x, point.y - 30];
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - width / 2, y - 12, width, 24, 12);
        else ctx.rect(x - width / 2, y - 12, width, 24);
        ctx.fillStyle = 'rgba(29, 29, 31, 0.86)';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y + 0.5);
      }
      ctx.restore();
    }
    /** Punkt konstrukcyjny zaznaczonego kształtu pod punktem strony (najbliższy) albo null. */
    function shapeHandleAt(point) {
      const shape = editedShape();
      if (!shape) return null;
      let best = null;
      for (const handle of shapeHandles(shape, ROTATE_GAP / view.scale)) {
        const distance = Math.hypot(handle.x - point.x, handle.y - point.y) * view.scale;
        // Wierzchołek trójkąta leży na środku górnego boku – wtedy wygrywa z uchwytem wysokości;
        // wierzchołek łamanej (od 1.24) – z narożnikiem ramki, gdy leżą w tym samym miejscu.
        const rank = distance - (handle.kind === 'adjust' || handle.kind === 'vertex' ? 10 : 0);
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
      if (isPointShape(shape)) {
        // Zaznaczony punkt (od 1.35): kółko wokół znacznika – punkt nie ma uchwytów, a ramka byłaby za mała.
        const center = toScreen(shape);
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.fillStyle = SELECT_FILLS.whole;
        ctx.beginPath();
        ctx.arc(center.x, center.y, Math.max(20, (shape.w / 2) * view.scale + 10), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // Wymiar (od 1.34) – bez ramki i uchwytu obrotu, same punkty.
      if (!isSegment(shape) && !isPointShape(shape) && !isMeasure(shape)) {
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
          ctx.arc(point.x, point.y, handle.kind === 'rotate' ? 8 : handle.kind === 'vertex' ? 6.5 : 6, 0, Math.PI * 2);
        }
        // Wierzchołek łamanej i wielokąta (od 1.24) – pełny niebieski punkt w białej obwódce.
        ctx.fillStyle = handle.kind === 'adjust' ? '#ff9f0a' : handle.kind === 'skew' ? '#d6e6fa' : handle.kind === 'vertex' ? SELECT_COLORS.whole : '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        if (handle.kind === 'vertex') {
          ctx.save();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.stroke();
        }
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
      ['length', 'Długość', 'length'], ['angle', 'Kąt', 'angle'],
      // Od 1.42: wymiar długości łuku (liczba tylko do odczytu).
      ['arc', 'Długość łuku', 'length']
    ];
    const dimFields = Object.fromEntries(DIM_FIELDS.map(([key, label, kind]) => {
      const input = h('input', {
        class: 'drawing__dim-input', type: 'text', inputmode: key === 'width' || key === 'height' || key === 'length' ? 'decimal' : 'text',
        autocomplete: 'off', spellcheck: 'false', 'aria-label': label, dataset: { testid: `drawing-dim-${key}` }
      });
      const unit = h('span', { class: 'drawing__dim-unit', 'aria-hidden': 'true' });
      // Od 1.42: znak ⌀ przed polem szerokości okręgu.
      const prefix = h('span', { class: 'drawing__dim-prefix', hidden: true, 'aria-hidden': 'true', dataset: { testid: `drawing-dim-prefix-${key}` } }, '⌀');
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
      const box = h('div', { class: 'drawing__dim', hidden: true, dataset: { testid: `drawing-dim-box-${key}` } }, h('label', { class: 'drawing__dim-field', title: label }, prefix, input, unit), eye, marks, grip);
      const field = { key, kind, label, box, input, unit, prefix, eye, marks, grip, shown: null, dirty: false };
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
      const factor = dimFactor(drawing.scale, dimFormat(drawing));
      // Od 1.42: wymiar poziomy i pionowy – rzut, długość łuku – po łuku.
      if (key === 'length') return toScaleLength(shape.shape === 'dim' ? measuredLength(shape) : shape.w, drawing.scale) * factor;
      if (key === 'arc') return toScaleLength(arcDimLength(shape), drawing.scale) * factor;
      if (key === 'width') return toScaleLength(shape.w, drawing.scale) * factor;
      if (key === 'height') return toScaleLength(shape.h, drawing.scale) * factor;
      if (key === 'skew') return skewDegrees(shape);
      // Wymiar kąta (od 1.34) – zmierzony kąt.
      if (shape.shape === 'angledim') return angleDimDegrees(shape);
      return segmentDegrees(shape);
    }
    /** Wpisana wartość: nowy kształt (jeden krok cofania); zła – komunikat i poprzednia wartość. */
    function commitDim(field) {
      if (!field.dirty) return;
      field.dirty = false;
      const shape = editedShape();
      // Wymiar narzędzia „Wymiar” (od 1.34) mierzy – liczby się nie wpisuje.
      if (!shape || active || isMeasure(shape)) return;
      const value = parseDecimal(field.input.value);
      if (value === null || (field.kind === 'length' && value <= 0)) {
        flash(field.kind === 'length' ? 'Wpisz wymiar większy od zera.' : 'Wpisz kąt w stopniach.');
        requestLive();
        return;
      }
      const units = fromScaleLength(value / dimFactor(drawing.scale, dimFormat(drawing)), drawing.scale);
      let next;
      // Od 1.42 okrąg zostaje okręgiem: pole ⌀ zmienia szerokość i wysokość.
      if ((field.key === 'width' || field.key === 'height') && isCircle(shape)) next = resizeShape(shape, { w: units, h: units });
      else if (field.key === 'width') next = resizeShape(shape, { w: units });
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
      // Od 1.42 okrąg: jedno pole ⌀ (szerokość), bez wysokości i pochylenia – chyba że widoczne na rysunku.
      const circle = isCircle(shape);
      for (const field of Object.values(dimFields)) {
        const place = (circle && (field.key === 'height' || field.key === 'skew') && !shown.includes(field.key)) ? null : places[field.key];
        field.box.hidden = !place;
        field.prefix.hidden = !(circle && field.key === 'width');
        if (!place) continue;
        if (document.activeElement !== field.input && !field.dirty) {
          field.input.value = formatNumber(dimValue(field.key, shape));
          field.unit.textContent = field.kind === 'length' ? dimUnitLabel(drawing.scale, dimFormat(drawing)) : '°';
        }
        // Wymiar narzędzia „Wymiar” (od 1.34): liczba tylko do odczytu, bez oka; odsunięcie – liniowy i kąt.
        const measure = isMeasure(shape);
        field.input.readOnly = measure;
        field.eye.hidden = measure;
        // Oko (od 1.19): wymiar widoczny na rysunku także po odznaczeniu kształtu.
        const visible = shown.includes(field.key);
        if (field.shown !== visible) {
          field.shown = visible;
          field.eye.setAttribute('aria-pressed', String(visible));
          field.eye.setAttribute('aria-label', `${field.label}: ${visible ? 'widoczny na rysunku – ukryj' : 'pokaż na rysunku na stałe'}`);
          field.eye.title = visible ? 'Widoczny na rysunku – dotknij, żeby ukryć' : 'Pokaż ten wymiar na rysunku na stałe';
          replaceChildren(field.eye, icon(visible ? 'eye' : 'eyeOff', { size: 15 }));
        }
        field.grip.hidden = !visible || (measure && shape.shape === 'dim' && dimMode(shape) !== 'linear');
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
      if (!shape || active || isMeasure(shape)) return;
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
            // Wymiar narzędzia „Wymiar” (od 1.34) ma odsunięcie ze znakiem – wzorem jest jego wielkość.
            tools.dimOffset = Math.abs(done.offset);
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
    /**
     * Pole liczby ze znakiem (od 1.25): przycisk +/− przed polem – na iPhonie klawiatura liczb nie ma
     * znaków; wpisany znak (klawiatura sprzętowa) przechodzi na przycisk. read() – liczba ze znakiem
     * albo null, show(liczba) – wpisuje bez znaku i ustawia przycisk.
     */
    function signedInput({ testID, label, value, sign = 1, onChange }) {
      let current = Number.isFinite(value) && value !== 0 ? Math.sign(value) : sign;
      const button = h('button', { type: 'button', class: 'drawing__chip drawing__sign', dataset: { testid: `${testID}-sign` } });
      const input = h('input', {
        class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': label,
        dataset: { testid: testID },
        onInput: () => {
          const typed = input.value.trim();
          if (/^[-−+]/.test(typed)) {
            current = typed[0] === '+' ? 1 : -1;
            input.value = typed.slice(1);
            update();
          }
          onChange();
        }
      });
      const update = () => {
        button.textContent = current > 0 ? '+' : '−';
        button.setAttribute('aria-label', `${label}: ${current > 0 ? 'plus' : 'minus'} – zmień znak`);
      };
      button.addEventListener('click', () => {
        current = -current;
        update();
        onChange();
      });
      const show = (number) => {
        if (Number.isFinite(number) && number !== 0) current = Math.sign(number);
        input.value = Number.isFinite(number) ? formatTolerance(Math.abs(number)) : '';
        update();
      };
      show(value);
      return {
        element: h('div', { class: 'drawing__signed' }, button, input),
        input,
        read: () => {
          const number = parseDecimal(input.value);
          return number === null ? null : current * Math.abs(number);
        },
        show
      };
    }
    /** Drawing w stylu bez jednostki przed tolerowaniem (od 1.25: domyślnie mm); przywrócenie po „Anuluj”. */
    function technicalForTolerancing() {
      const before = { dimStyle: drawing.dimStyle, dimUnit: drawing.dimUnit };
      const switched = dimFormat(drawing).style !== 'technical';
      if (switched) setDimFormat('technical', defaultDimUnit(drawing.scale));
      return {
        switched,
        restore: () => {
          if (!switched) return;
          if (before.dimStyle) drawing.dimStyle = before.dimStyle;
          else delete drawing.dimStyle;
          if (before.dimUnit) drawing.dimUnit = before.dimUnit;
          else delete drawing.dimUnit;
          requestRender();
        }
      };
    }
    /** Najmniejsze odsunięcie linii wymiarowej z dwiema liczbami granicznymi nad nią (od 1.38). */
    const LIMITS_DIM_OFFSET = 54;
    /** Komunikat po pierwszym tolerowaniu na rysunku z liczbami „5 cm”. */
    const announceTechnical = () => flash(`${dimUnitNote(dimFormat(drawing))} – liczby bez jednostki, oznaczenie w lewym dolnym rogu rysunku. Inna jednostka – panel linijki.`);

    /**
     * Znak przed liczbą (⌀, R, □) i tolerancja wymiaru (od 1.22.1): ±, odchyłki albo pasowanie, z podglądem.
     * Od 1.25: przy długości rysunek przechodzi na liczby bez jednostki (domyślnie mm; „Anuluj” – wraca),
     * jednostkę wybierasz tu albo w panelu linijki; odchyłki ze znakiem z przycisku +/−; pasowania –
     * ostatnio użyte i cała tabela ISO 286. Tolerancje długości zapisywane w mm. Od 1.38: wymiary graniczne
     * (z odchyłek), rodzaj wymiaru (dokładny w ramce i pomocniczy w nawiasie – bez tolerancji, kontrolny
     * w owalnej ramce), miejsca po przecinku i podgląd rysowany jak na kartce.
     */
    function editDimMarks(key) {
      const shape = editedShape();
      if (!shape || active) return;
      const dimField = dimFields[key];
      const linear = isLinearDim(key);
      const technical = linear ? technicalForTolerancing() : { switched: false, restore: () => {} };
      const current = shape.dimTols?.[key] ?? {};
      const choice = { prefix: current.prefix ?? '', kind: current.kind ?? 'none', style: current.style ?? 'normal', places: String(current.places ?? 'auto') };
      const unitLabel = () => (linear ? dimUnitLabel(drawing.scale, dimFormat(drawing)) : '°');
      // Tolerancje długości: zapis w mm, pola – w jednostce liczby wymiaru.
      const per = () => (linear ? dimMillimeters(drawing.scale, dimFormat(drawing)) : 1);
      const fromStored = (value) => (Number.isFinite(value) ? value / per() : value);
      const units = [];
      const unitSpan = () => {
        const span = h('span', null, unitLabel());
        units.push(span);
        return span;
      };
      const symmetric = h('input', {
        class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Tolerancja ±',
        value: Number.isFinite(current.value) ? formatTolerance(fromStored(current.value)) : '', dataset: { testid: 'drawing-dim-tol-value' }, onInput: () => refresh()
      });
      const upper = signedInput({ testID: 'drawing-dim-tol-upper', label: 'Odchyłka górna', value: fromStored(current.upper), sign: 1, onChange: () => refresh() });
      const lower = signedInput({ testID: 'drawing-dim-tol-lower', label: 'Odchyłka dolna', value: fromStored(current.lower), sign: -1, onChange: () => refresh() });
      const fit = h('input', {
        class: 'input', type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Pasowanie', placeholder: 'H7',
        value: current.fit ?? '', dataset: { testid: 'drawing-dim-tol-fit' }, onInput: () => refresh()
      });
      // Ostatnio użyte pasowania (od 1.25) i cała tabela.
      const recent = h('div', { class: 'drawing__quick', dataset: { testid: 'drawing-dim-fit-recent' } });
      const setFit = (value) => {
        fit.value = value;
        refresh();
      };
      const renderRecent = () => replaceChildren(recent,
        tools.recentFits.map((item) => chip(item, `drawing-dim-fit-${item.replace('/', '-')}`, () => setFit(item))),
        chip('Tabela pasowań…', 'drawing-dim-fit-table', () => openFitTable({ value: fit.value.trim(), onPick: (value) => setFit(value) }), ' drawing__chip--accent'));
      renderRecent();
      const preview = h('p', { class: 'drawing__dim-preview', dataset: { testid: 'drawing-dim-tol-preview' } });
      const look = h('canvas', { class: 'drawing__gdt-preview', dataset: { testid: 'drawing-dim-tol-look' } });
      const plainHint = h('p', { class: 'field__hint', hidden: true }, 'Wymiar teoretycznie dokładny i pomocniczy są bez tolerancji.');
      const blocks = {
        sym: field('Tolerancja ±', h('div', { class: 'drawing__dim-tol-row' }, symmetric, unitSpan())),
        dev: h('div', { class: 'drawing__dim-tol-pair' },
          field('Górna', h('div', { class: 'drawing__dim-tol-row' }, upper.element, unitSpan())),
          field('Dolna', h('div', { class: 'drawing__dim-tol-row' }, lower.element, unitSpan()))),
        fit: field('Pasowanie', h('div', null, fit, recent), { hint: 'Ostatnio użyte; „Tabela pasowań…” – wszystkie klasy ISO 286. Wielka litera – otwór, mała – wałek; „H7/g6” – pasowanie otworu z wałkiem.' })
      };
      // Jednostka liczb bez jednostki – dla całego rysunku (przeliczenie wpisanych liczb przy zmianie).
      const unitControl = linear ? dimUnitChoice(dimFormat(drawing).unit, (unit) => {
        const before = per();
        setDimFormat('technical', unit);
        const ratio = before / per();
        const convert = (input) => {
          const number = parseDecimal(input.value);
          if (number !== null) input.value = formatTolerance(Math.abs(number) * ratio);
        };
        convert(symmetric);
        convert(upper.input);
        convert(lower.input);
        refresh();
      }) : null;
      if (unitControl) unitControl.dataset.testid = 'drawing-dim-tol-unit';
      /** Oznaczenie z pól (tolerancje długości w mm) albo { error }. */
      function read() {
        const marks = { prefix: choice.prefix };
        if (choice.style !== 'normal') marks.style = choice.style;
        if (choice.places !== 'auto') marks.places = Number(choice.places);
        const stored = (value) => Number((value * per()).toPrecision(12));
        if (choice.style === 'basic' || choice.style === 'reference') return { marks };
        if (choice.kind === 'sym') {
          const value = parseDecimal(symmetric.value);
          if (value === null || value === 0) return { error: 'Wpisz tolerancję, np. 0,1.' };
          Object.assign(marks, { kind: 'sym', value: stored(Math.abs(value)) });
        } else if (choice.kind === 'dev' || choice.kind === 'limits') {
          const [high, low] = [upper.read(), lower.read()];
          if (high === null || low === null) return { error: 'Wpisz obie odchyłki, np. +0,1 i −0,05 (znak – przycisk przed polem).' };
          if (high < low) return { error: 'Odchyłka górna nie może być mniejsza od dolnej.' };
          Object.assign(marks, { kind: choice.kind, upper: stored(high), lower: stored(low) });
        } else if (choice.kind === 'fit') {
          if (!FIT_RE.test(fit.value.trim())) return { error: 'Wpisz pasowanie, np. H7, g6 albo H7/g6.' };
          Object.assign(marks, { kind: 'fit', fit: fit.value.trim() });
        }
        return { marks };
      }
      function refresh() {
        const plain = choice.style === 'basic' || choice.style === 'reference';
        for (const [kind, block] of Object.entries(blocks)) block.hidden = plain || !(choice.kind === kind || (kind === 'dev' && choice.kind === 'limits'));
        toleranceField.hidden = plain;
        plainHint.hidden = !plain;
        for (const span of units) span.textContent = unitLabel();
        const { marks } = read();
        const sample = withDimTolerance(shape, key, marks ?? { prefix: choice.prefix, style: choice.style, places: choice.places === 'auto' ? undefined : Number(choice.places) });
        preview.textContent = `Na rysunku: ${dimensionTextOf(sample, key)}`;
        // Podgląd (od 1.38) – liczba narysowana jak na kartce: graniczne jedna nad drugą, ramka, owal.
        const parts = dimensionParts(sample, key, drawing.scale, dimFormat(drawing));
        const size = DIM_FONT * 1.2;
        const [width, height] = [dimTextWidth(parts, size) + 16, size * 2.6];
        const ratio = window.devicePixelRatio || 1;
        look.width = Math.round(width * ratio);
        look.height = Math.round(height * ratio);
        look.style.width = `${Math.round(width)}px`;
        look.style.height = `${Math.round(height)}px`;
        const ctx = look.getContext('2d');
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        paintDimText(ctx, width / 2, height / 2, 0, parts, sample.color ?? '#1d1d1f', size);
      }
      const toleranceField = field('Tolerancja', segmented({
        name: `drawing-dim-tol-${Date.now()}`, label: 'Tolerancja', value: choice.kind,
        options: [{ value: 'none', label: 'Brak' }, { value: 'sym', label: '±' }, { value: 'dev', label: 'Odchyłki' }, { value: 'limits', label: 'Graniczne' },
          ...(linear ? [{ value: 'fit', label: 'Pasowanie' }] : [])],
        onChange: (value) => {
          choice.kind = value;
          refresh();
        }
      }));
      toleranceField.classList.add('drawing__dim-tol-kinds');
      const styleField = (control) => {
        const element = field('Wymiar', control, { hint: 'Dokładny – w ramce (teoretycznie dokładny), pomocniczy – w nawiasie, kontrolny – w owalnej ramce.' });
        element.classList.add('drawing__dim-style-field');
        return element;
      };
      let pending = null;
      openFormSheet({
        title: `${dimField.label} – tolerancja`,
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
          styleField(segmented({
            name: `drawing-dim-style-${Date.now()}`, label: 'Wymiar', value: choice.style,
            options: [{ value: 'normal', label: 'Zwykły' }, { value: 'basic', label: 'Dokładny' }, { value: 'reference', label: 'Pomocniczy' }, { value: 'inspection', label: 'Kontrolny' }],
            onChange: (value) => {
              choice.style = value;
              refresh();
            }
          })),
          toleranceField, plainHint,
          blocks.sym, blocks.dev, blocks.fit,
          field('Miejsca po przecinku', segmented({
            name: `drawing-dim-places-${Date.now()}`, label: 'Miejsca po przecinku', value: choice.places,
            options: [{ value: 'auto', label: 'Auto' }, ...[0, 1, 2, 3].map((places) => ({ value: String(places), label: String(places) }))],
            onChange: (value) => {
              choice.places = value;
              refresh();
            }
          })),
          preview, look,
          unitControl ? field('Jednostka liczb wymiarów (cały rysunek)', unitControl, {
            hint: 'Liczby bez jednostki – jednostka jest w oznaczeniu „Wymiary w …” w lewym dolnym rogu rysunku. Liczby „5 cm” z jednostką – w panelu linijki.'
          }) : h('p', { class: 'field__hint' }, 'Wartości w stopniach. Wymiar z tolerancją jest widoczny na rysunku.')
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
          if (!pending) {
            technical.restore();
            return;
          }
          const now = editedShape();
          if (!now || now !== shape) return;
          if (pending.kind === 'fit') {
            tools.recentFits = rememberFit(tools.recentFits, pending.fit);
            saveTools(tools);
          }
          let next = withDimTolerance(shape, key, pending);
          if (!shownDims(next).includes(key)) next = showDim(next, key);
          // Wymiary graniczne (od 1.38) – dwie liczby nad linią: linia wymiarowa za blisko kształtu – dalej.
          if (pending.kind === 'limits' && linear && !(next.shape === 'dim' && next.mode)) {
            const offset = dimOffset(next, key);
            if (Math.abs(offset) < LIMITS_DIM_OFFSET) next = withDimOffset(next, key, (offset < 0 ? -1 : 1) * LIMITS_DIM_OFFSET);
          }
          replaceShape(shape, next);
          if (technical.switched) announceTechnical();
          updateToolbar();
          requestRender();
        }
      });
      refresh();
    }
    /** Napis wymiaru w bieżącym stylu rysunku (podgląd w oknie). */
    const dimensionTextOf = (shape, key) => {
      const { main, tolerance, frame } = dimensionParts(shape, key, drawing.scale, dimFormat(drawing));
      const framed = (text) => (frame === 'reference' ? `(${text})` : frame === 'basic' ? `${text} w ramce` : frame === 'inspection' ? `${text} w owalnej ramce` : text);
      if (!tolerance) return framed(main);
      if (tolerance.kind === 'limits') return framed(`${main}${tolerance.upper} / ${tolerance.lower}`);
      return framed(tolerance.kind === 'dev' ? `${main} ${tolerance.upper} / ${tolerance.lower}` : tolerance.kind === 'sym' ? `${main}${tolerance.text}` : `${main} ${tolerance.text}`);
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
    /** Zaznaczenie z wyglądem (od 1.35): po jego zmianie menu pokazuje kolor, grubość i styl zaznaczonych. */
    let shownEdit = '';
    const editSignature = () => `${selectionKind}:${snip ? 'snip' : ''}:${[...selection].map((stroke) => [stroke.tool, stroke.shape, stroke.color, stroke.size, stroke.dash,
      stroke.fill, stroke.mark, stroke.startCap, stroke.endCap, stroke.points?.[2]].join(',')).join('|')}`;
    const renderLive = () => {
      const ctx = live.getContext('2d');
      prepare(ctx);
      const edit = editSignature();
      if (edit !== shownEdit) {
        shownEdit = edit;
        updateToolbar();
      }
      // Zwoje spirali (od 1.24.1) – nad zapisanymi kreskami, pod wszystkim innym na tej warstwie
      // (w trakcie przewracania kartki – na płótnie animacji).
      if (!coilsOnFlip) paintCoils(ctx);
      ctx.save();
      clipPage(ctx);
      if (active?.kind === 'stroke') paintStroke(ctx, active.recognized?.shape ?? active.stroke);
      if (active?.kind === 'move') {
        // Karteczka przesuwana sama (od 1.21) – koniec strzałki zostaje w miejscu.
        const kept = keptTarget();
        ctx.save();
        ctx.translate(active.dx, active.dy);
        for (const stroke of selection) {
          if (stroke !== kept) paintStroke(ctx, stroke, { scale: drawing.scale, dimFormat: dimFormat(drawing), editor: true, number: stroke.tool === 'sticky' ? stickyNumber(drawing, stroke) : null });
        }
        ctx.restore();
        if (kept) paintStroke(ctx, movedSticky(kept, active.dx, active.dy), { editor: true, number: stickyNumber(drawing, kept) });
      }
      if (active?.kind === 'turn') {
        active.preview.forEach((stroke, index) => paintStroke(ctx, stroke, {
          scale: drawing.scale, dimFormat: dimFormat(drawing), editor: true, number: stroke.tool === 'sticky' ? stickyNumber(drawing, active.items[index]) : null
        }));
      }
      if (active?.kind === 'box-edit') paintStroke(ctx, active.preview, { editor: true, number: stickyNumber(drawing, active.original) });
      // Przyklejone końce idące za przesuwanym albo zmienianym kształtem (od 1.22).
      for (const [original, preview] of activeFollowers() ?? []) {
        paintStroke(ctx, preview, { scale: drawing.scale, dimFormat: dimFormat(drawing), editor: true, number: original.tool === 'sticky' ? stickyNumber(drawing, original) : null });
      }
      if (active?.kind === 'shape-new' && active.shape) paintStroke(ctx, active.shape, { scale: drawing.scale, dimFormat: dimFormat(drawing) });
      paintPending(ctx);
      if (active?.kind === 'shape-edit') paintStroke(ctx, active.preview, { dims: false });
      if (active?.kind === 'array-center') paintStroke(ctx, active.preview, { scale: drawing.scale, dimFormat: dimFormat(drawing) });
      // Zaznaczony kształt (od 1.22.1): linie wymiarów technicznych – liczby są w polach wymiarów;
      // przeciągany uchwyt pola – podgląd odsunięcia (przerywany).
      const dimmed = editedShape();
      if (dimmed) paintDims(ctx, dimmed, drawing.scale, dimFormat(drawing), { text: false, offsets: active?.kind === 'dim-offset' ? { [active.key]: active.offset } : null });
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
      const knob = turnKnob();
      if (bounds && !handled && active?.kind !== 'turn') {
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
      if (knob) paintTurnKnob(ctx, knob);
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
        : active?.kind === 'shape-edit' || active?.kind === 'box-edit' || active?.kind === 'points' ? [active.snap]
          : !active && (tool === 'shape' || symbolPlacing || pointPick) ? [edgeHover] : [];
      for (const snap of snaps) if (snap) paintSnapMarker(ctx, snap);
      if (pointPick?.first) paintAxisPick(ctx);
      if (pointPick && EDIT_END[pointPick.kind]) paintEditPick(ctx);
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
      let barBounds = popover && bounds ? { ...bounds, minY: Math.min(bounds.minY, popover.y), maxY: Math.max(bounds.maxY, popover.y + popover.height) } : bounds;
      // Uchwyt obrotu (od 1.30) – polecenia nad nim, nie na nim.
      if (knob && barBounds) barBounds = { ...barBounds, minY: Math.min(barBounds.minY, knob.y - 14 / view.scale) };
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
      // Bez zaznaczenia nie ma czego przesuwać – „Przesuń” się wyłącza.
      if (moveMode && selection.size === 0) moveMode = false;
      const show = Boolean(bounds) && !['move', 'marquee', 'lasso', 'pick', 'shape-new', 'shape-edit', 'template-move', 'template-scale', 'array-center', 'box-edit', 'turn']
        .includes(active?.kind) && !placing;
      selectionBar.hidden = !show;
      if (!show) return;
      const items = [...selection];
      const only = items.length === 1 ? items[0] : null;
      selectionCount.textContent = snip ? 'Wycinek' : selectionKind === 'region' ? 'Fragment' : only?.tool === 'text' ? 'Pole tekstowe' : only?.tool === 'math' ? 'Wzór'
        : only?.tool === 'table' ? 'Tabela' : only?.tool === 'sticky' ? `Karteczka ${stickyNumber(drawing, only)}`
        : only?.tool === 'gdt' ? gdtSymbol(only.symbol).label : only?.tool === 'datum' ? `Baza ${only.letter}` : only?.tool === 'roughness' ? 'Chropowatość'
        : only?.tool === 'diagram' ? diagramLabel(only)
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
      // Wymiar (od 1.34) – bez tekstu na kształcie.
      shapeTextButton.hidden = !shape || isMeasure(shape);
      const measure = shape ? shapeMeasureText(shape, drawing.scale, dimFormat(drawing)) : null;
      selectionMeasure.hidden = !measure;
      if (measure) selectionMeasure.textContent = `pole ${measure.area} · obwód ${measure.perimeter}`;
      // Magnes (od 1.22): przy odcinku, strzałce i karteczce ze strzałką.
      // Od 1.22.1 także strzałka ramki tolerancji, trójkąt bazy i wierzchołek chropowatości.
      const withEnds = Boolean(shape && isSegment(shape)) || Boolean(sticky?.leader) || (!snip && selection.size === 1 && isSymbol(only));
      magnetButton.hidden = !withEnds;
      moveButton.hidden = Boolean(snip);
      moveButton.setAttribute('aria-pressed', String(moveMode));
      stage.classList.toggle('drawing__stage--moving', moveMode);
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
      mirrorButton.hidden = Boolean(snip) || !canTurn(items);
      orderButton.hidden = Boolean(snip) || selectionKind !== 'whole' || items.length === drawing.strokes.length;
      scaleButton.hidden = Boolean(snip) || selectionKind !== 'whole' || !canTurn(items);
      const linearMeasure = Boolean(shape) && shape.shape === 'dim' && dimMode(shape) === 'linear';
      chainButton.hidden = !linearMeasure;
      whyButton.hidden = snip || !(only?.tool === 'diagram' && only.kind === 'whys' && (only.answers.length < DIAGRAM_LIMITS.answers || only.answers.some((answer) => !answer)));
      baselineButton.hidden = !linearMeasure;
      matchButton.hidden = Boolean(snip) || selectionKind !== 'whole' || !items.some((stroke) => hasStyle(stroke) || isArray(stroke));
      deleteButton.hidden = Boolean(snip);
      embedButton.hidden = !onEmbed;
      copyButton.title = snip ? 'Kopiuj wycinek jako obraz (Ctrl+C) – wkleisz go w notatce albo w innej aplikacji'
        : 'Kopiuj (Ctrl+C) – wklejasz przyciskiem „Wklej” albo Ctrl+V, także w innym rysunku';
      // Od 1.41: polecenia, które nie mieszczą się w jednym wierszu – same ikony (napis w podpowiedzi i dla czytnika ekranu);
      // na telefonie i tak w dwóch wierszach.
      selectionBar.classList.remove('drawing__selection--compact');
      if (selectionBar.offsetHeight > SELECTION_ROW) selectionBar.classList.add('drawing__selection--compact');
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
    /** Kształt z kilku punktów (od 1.34): okrąg przez 3 punkty, łuk, wymiar kąta – albo null. */
    function multiKind() {
      if (tool !== 'shape') return null;
      if (tools.shape === 'ellipse' && tools.ellipseMode === 'three') return 'circle3';
      // Od 1.43: okrąg styczny do dwóch elementów i łamana punkt po punkcie.
      if (tools.shape === 'ellipse' && tools.ellipseMode === 'ttr') return 'ttr';
      if (tools.shape === 'polyline') return 'polyline';
      // Od 1.42 łuk także ze środka, początku i końca.
      if (tools.shape === 'arc') return tools.arcMode === 'center' ? 'arcCenter' : 'arc';
      if (tools.shape === 'dim' && tools.dimMode === 'angle') return 'angle';
      return null;
    }
    /** Punkty nowego kształtu przyciągane do narożników, krawędzi i (od 1.34) środków okręgów. */
    const snapsPoints = () => isSegment({ shape: tools.shape }) || multiKind() !== null || (tools.shape === 'ellipse' && (tools.ellipseMode === 'center' || tools.ellipseMode === 'two'));
    const POINT_HINTS = {
      circle3: ['Okrąg przez 3 punkty: dotknij pierwszego punktu (albo przeciągnij od pierwszego do drugiego)', 'Okrąg: dotknij drugiego punktu · Esc – od nowa', 'Okrąg: dotknij trzeciego punktu · Esc – od nowa'],
      arc: ['Łuk: przeciągnij od początku do końca (albo dotknij obu)', 'Łuk: dotknij końca · Esc – od nowa', 'Łuk: dotknij punktu, przez który ma przejść · Esc – od nowa'],
      arcCenter: ['Łuk: dotknij środka (albo przeciągnij od środka do początku)', 'Łuk: dotknij początku – promień · Esc – od nowa',
        'Łuk: dotknij końca – łuk biegnie przeciwnie do ruchu wskazówek zegara · Esc – od nowa'],
      angle: ['Kąt: przeciągnij od wierzchołka wzdłuż pierwszego ramienia', 'Kąt: dotknij punktu na pierwszym ramieniu · Esc – od nowa', 'Kąt: dotknij punktu na drugim ramieniu · Esc – od nowa'],
      ttr: ['Okrąg styczny: dotknij pierwszej linii albo okręgu', 'Okrąg styczny: dotknij drugiej linii albo okręgu · Esc – od nowa', 'Okrąg styczny: promień w oknie'],
      polyline: ['Łamana: dotknij pierwszego punktu (albo przeciągnij od pierwszego do drugiego)', 'Łamana: dotknij następnego punktu · Esc – od nowa',
        'Łamana: następny punkt · ostatni jeszcze raz, Enter albo Esc – koniec · pierwszy – zamknięty wielokąt']
    };
    const DIM_HINTS = {
      linear: 'Wymiar: przeciągnij od punktu do punktu albo dotknij krawędzi', diameter: 'Średnica: dotknij okręgu albo łuku (albo przeciągnij przez średnicę)',
      radius: 'Promień: dotknij okręgu albo łuku (albo przeciągnij od środka do okręgu)',
      arc: 'Długość łuku: dotknij łuku'
    };
    /** Podpowiedź przy narzędziach z punktów (od 1.34): co dotknąć teraz. */
    function updateShapeHint() {
      const kind = multiKind();
      let text = null;
      if (kind) text = POINT_HINTS[kind][Math.min(2, pending?.kind === kind ? pending.points.length : 0)];
      else if (tool === 'shape' && tools.shape === 'dim') text = DIM_HINTS[tools.dimMode];
      else if (tool === 'shape' && tools.shape === 'ellipse' && tools.ellipseMode === 'center') text = 'Okrąg: przeciągnij od środka do okręgu';
      else if (tool === 'shape' && tools.shape === 'ellipse' && tools.ellipseMode === 'two') text = 'Okrąg: przeciągnij przez średnicę – od punktu do punktu';
      shapeHint.hidden = !text;
      shapeHint.textContent = text ?? '';
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
      // Od 1.32 pod górnym menu (bez uchwytu); dolny pasek leży nad marginesem strony – da się go schować.
      view.top = Math.max(STAGE_MARGIN, toolbar.getBoundingClientRect().bottom - box.top + 8);
      view.bottom = STAGE_MARGIN;
      placeRingTop();
      applyUi();
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

    // ---- pasek narzędzi (od 1.32: górne menu – narzędzia grupy z kółka, kolor i grubość, wybór; dolny pasek – narzędzia ogólne)
    /** Przycisk narzędzia albo polecenia w górnym menu – ikona i krótki napis (na telefonie sama ikona). */
    const menuButton = (item, label, iconName, testID, short = label) => h('button', {
      type: 'button', class: 'drawing__tool drawing__tool--labeled', 'aria-label': label, title: label,
      dataset: { item, testid: testID }, onClick: () => activateItem(item)
    }, icon(iconName, { size: 24 }), h('span', { class: 'drawing__tool-label', 'aria-hidden': 'true' }, short));
    const toolButton = (id, label, iconName) => {
      const button = menuButton(id, label, iconName, `drawing-tool-${id}`);
      button.dataset.tool = id;
      button.setAttribute('aria-pressed', 'false');
      return button;
    };
    function setTool(id) {
      if (id !== 'select') clearSelection();
      pending = null;
      // Lewy Alt (od 1.32) wraca do ostatniego narzędzia sprzed zaznaczania.
      if (id !== 'select') lastTool = id;
      tool = id;
      hover = null;
      closeSettings();
      updateToolbar();
      requestLive();
    }
    const penButton = toolButton('pen', 'Pióro', 'pen');
    const highlighterButton = toolButton('highlighter', 'Zakreślacz', 'highlighter');
    const eraserButton = toolButton('eraser', 'Gumka', 'eraser');
    // Zaznaczanie – na dolnym pasku (narzędzie ogólne); ikona – wybrany kształt obszaru.
    const selectButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Zaznaczanie – prostokąt', title: 'Zaznaczanie – prostokąt (lewy Alt, prawy przycisk myszy)',
      'aria-pressed': 'false', dataset: { tool: 'select', shape: 'rect', testid: 'drawing-tool-select' },
      onClick: () => {
        ctrlHold = null;
        setTool('select');
      }
    }, icon('marquee', { size: 24 }));
    /** Krótkie napisy rodzajów kształtów w górnym menu. */
    const SHAPE_SHORT = { curve: 'Po łuku', ngon: 'Foremny' };
    const kindButtons = new Map(SHAPES.map((kind) => {
      const button = menuButton(`shape:${kind}`, SHAPE_LABELS[kind], SHAPE_ICONS[kind], `drawing-shape-${kind}`, SHAPE_SHORT[kind] ?? SHAPE_LABELS[kind]);
      button.setAttribute('aria-pressed', 'false');
      return [kind, button];
    }));
    // Od 1.36 rodzaje wymiaru – osobne narzędzia w górnym menu (do 1.35 wybór pod menu).
    // Od 1.42 także długość łuku.
    const DIM_TOOLS = {
      linear: ['Długość', 'dimension'], angle: ['Kąt', 'dimAngle'], radius: ['Promień', 'dimRadius'], diameter: ['Średnica', 'dimDiameter'],
      arc: ['Długość łuku', 'dimArc', 'Dł. łuku']
    };
    const dimButtons = new Map(Object.entries(DIM_TOOLS).map(([mode, [label, iconName, short]]) => {
      const button = menuButton(`dim:${mode}`, `Wymiar – ${label.toLowerCase()}`, iconName, `drawing-measure-${mode}`, short ?? label);
      button.setAttribute('aria-pressed', 'false');
      return [mode, button];
    }));
    // Od 1.43: edycja geometrii – polecenia; wybrane czeka na dotknięcia elementów (narzędzie zostaje).
    const EDIT_TOOLS = {
      offset: ['Odsuń', 'offset'], fillet: ['Zaokrąglij', 'fillet'], chamfer: ['Fazuj', 'chamfer'], trim: ['Przytnij', 'trim'], extend: ['Wydłuż', 'extend']
    };
    const editButtons = new Map(Object.entries(EDIT_TOOLS).map(([kind, [label, iconName]]) => {
      const button = menuButton(`edit:${kind}`, label, iconName, `drawing-edit-${kind}`);
      button.setAttribute('aria-pressed', 'false');
      return [kind, button];
    }));
    const textButton = menuButton('text', 'Pole tekstowe', 'textBox', 'drawing-insert-text', 'Tekst');
    const mathButton = menuButton('math', 'Wzór', 'sigma', 'drawing-insert-math');
    mathButton.title = 'Wzór (zapis jak w notatce)';
    // Od 1.21: tabela (to samo okno tabeli co w notatce) i karteczka.
    const tableButton = menuButton('table', 'Tabela', 'table', 'drawing-insert-table');
    const stickyButton = menuButton('sticky', 'Karteczka', 'sticky', 'drawing-insert-sticky');
    stickyButton.title = 'Karteczka – notatka na rysunku';
    // Od 1.22.1 symbole metrologiczne (od 1.32 – grupa na kółku): okno, potem dotknięcie krawędzi albo narożnika.
    const gdtButton = menuButton('gdt', 'Ramka tolerancji', 'gdtFrame', 'drawing-symbol-gdt', 'Tolerancja');
    const datumButton = menuButton('datum', 'Baza', 'datumMark', 'drawing-symbol-datum');
    const roughnessButton = menuButton('roughness', 'Chropowatość', 'roughness', 'drawing-symbol-roughness');
    // Od 1.44: jakość – diagram Ishikawy, 5 × Dlaczego, SIPOC (tabela), układ kartki.
    const fishboneButton = menuButton('diagram:fishbone', 'Diagram Ishikawy', 'fishbone', 'drawing-insert-fishbone', 'Ishikawa');
    const whysButton = menuButton('diagram:whys', '5 × Dlaczego', 'whys', 'drawing-insert-whys', '5 Why');
    const sipocButton = menuButton('sipoc', 'SIPOC – dostawcy, wejścia, proces, wyjścia, klienci', 'sipoc', 'drawing-insert-sipoc', 'SIPOC');
    const layoutButton = menuButton('layout', 'Układ kartki – A3, PDCA, macierz 2×2, Kanban, pokrewieństwo', 'pageLayout', 'drawing-insert-layout', 'Układ');
    /** Pozycja grupy → przycisk (ten sam przycisk w kilku grupach – pokazywana jest jedna grupa naraz). */
    const itemButtons = new Map([
      ['pen', penButton], ['highlighter', highlighterButton], ['eraser', eraserButton],
      ...[...kindButtons].map(([kind, button]) => [`shape:${kind}`, button]),
      ...[...dimButtons].map(([mode, button]) => [`dim:${mode}`, button]),
      ...[...editButtons].map(([kind, button]) => [`edit:${kind}`, button]),
      ['text', textButton], ['math', mathButton], ['table', tableButton], ['sticky', stickyButton],
      ['gdt', gdtButton], ['datum', datumButton], ['roughness', roughnessButton],
      ['diagram:fishbone', fishboneButton], ['diagram:whys', whysButton], ['sipoc', sipocButton], ['layout', layoutButton]
    ]);
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
      // Od 1.17 cztery tryby (z wycinkiem) – na telefonie „Fragm.”.
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
    // Tło strony (od 1.15 – panel: rodzaj, jasność linii, szablon); od 1.32 na dolnym pasku – sama ikona, opis dla czytnika.
    const paperLabel = h('span', { class: 'visually-hidden' });
    const paperButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-haspopup': 'dialog', dataset: { testid: 'drawing-paper' }, hidden: Boolean(drawing.photo),
      onClick: () => togglePaperPanel()
    }, icon('paper', { size: 24 }), paperLabel);
    const guideButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Liniuszek', title: 'Liniuszek – równoległe linie, do których przyciąga się kreska',
      'aria-pressed': 'false', dataset: { testid: 'drawing-guide' }, onClick: () => toggleGuide()
    }, icon('guide', { size: 24 }));
    // Górne menu: nazwa grupy, narzędzia grupy, pod nimi kolor i grubość (na telefonie – po dotknięciu kropki koloru).
    const groupName = h('div', { class: 'drawing__group-name', dataset: { testid: 'drawing-group-name' } });
    const toolRow = h('div', { class: 'drawing__row drawing__row--tools', role: 'group', dataset: { testid: 'drawing-tool-row' } });
    const optionsDot = h('span', { class: 'drawing__options-dot' });
    const optionsButton = h('button', {
      type: 'button', class: 'drawing__tool drawing__options-toggle', 'aria-label': 'Kolor i grubość', title: 'Kolor i grubość', 'aria-expanded': 'false',
      dataset: { testid: 'drawing-options' }, onClick: () => toggleOptions()
    }, optionsDot);
    const optionRow = h('div', { class: 'drawing__row drawing__row--options', dataset: { testid: 'drawing-option-row' } }, swatches, widths, eraserSizes);
    const toolbar = h('div', { class: 'drawing__toolbar', role: 'toolbar', 'aria-label': 'Narzędzia rysunku' },
      groupName, h('div', { class: 'drawing__row drawing__row--main' }, optionsButton, toolRow), optionRow);
    // Wybór bez osobnego okna (tryb gumki, obszar i tryb zaznaczania) – pastylka pod menu.
    // Od 1.34: sposób rysowania okręgu i rodzaj wymiaru – wybór pod menu (makieta: „Ramka / Środek i R / 2 pkt / 3 pkt”).
    // Na telefonie – krótsze napisy (wybór mieści się obok kółka).
    const ELLIPSE_SHORT = { frame: ['Ramka', 'Ramka'], center: ['Środek i R', 'Środek'], two: ['2 pkt', '2 pkt'], three: ['3 pkt', '3 pkt'], ttr: ['Styczny', 'Styczny'] };
    const modeChoices = (modes, labels, short, label, testID, key) => h('div', { class: 'drawing__group drawing__modes', role: 'radiogroup', 'aria-label': label },
      modes.map((mode) => h('button', {
        type: 'button', class: 'drawing__mode', role: 'radio', 'aria-label': labels[mode], title: labels[mode], dataset: { mode, testid: `${testID}-${mode}` },
        onClick: () => {
          tools[key] = mode;
          saveTools(tools);
          pending = null;
          updateToolbar();
          requestLive();
        }
      }, short[mode][0] === short[mode][1] ? short[mode][0]
        : [h('span', { class: 'drawing__wide-label' }, short[mode][0]), h('span', { class: 'drawing__narrow-label' }, short[mode][1])])));
    const ellipseModes = modeChoices(ELLIPSE_MODES, ELLIPSE_MODE_LABELS, ELLIPSE_SHORT, 'Okrąg i elipsa', 'drawing-ellipse', 'ellipseMode');
    // Od 1.42: łuk przez 3 punkty albo ze środka; wymiar liniowy równoległy, poziomy albo pionowy.
    const arcModes = modeChoices(ARC_MODES, ARC_MODE_LABELS, { three: ['3 pkt', '3 pkt'], center: ['Środek, początek, koniec', 'Środek'] }, 'Łuk', 'drawing-arc', 'arcMode');
    const dimAxes = modeChoices(DIM_AXES, DIM_AXIS_LABELS, { aligned: ['Równoległy', 'Równol.'], h: ['Poziomy', 'Poziomy'], v: ['Pionowy', 'Pionowy'] },
      'Wymiar liniowy', 'drawing-dim-axis', 'dimAxis');
    // Od 1.35 trzecie menu kształtów: styl nowych kształtów (i zaznaczonych) – znacznik punktu, rodzaj linii,
    // wypełnienie, zakończenia; kilka grup – przyciski z rozwijanym wyborem; ⓘ rozwija w dół resztę (przełączniki, opis).
    const styleRow = h('div', { class: 'drawing__group drawing__style-row', hidden: true, dataset: { testid: 'drawing-style-row' } });
    const styleDrop = h('div', { class: 'drawing__style-drop', hidden: true, dataset: { testid: 'drawing-style-drop' } });
    const choices = h('div', { class: 'drawing__choices', dataset: { testid: 'drawing-choices' } }, eraserModes, ellipseModes, arcModes, dimAxes, styleRow);
    // Od 1.35 wybór narzędzi ogólnych (zaznaczanie: obszar, tryb, „Wklej”, „Zaznacz wszystko”) – nad dolnym paskiem.
    const dockChoices = h('div', { class: 'drawing__choices drawing__choices--dock', hidden: true, dataset: { testid: 'drawing-dock-choices' } }, selectShapes, selectModes, selectGroup);
    const topHandle = h('button', {
      type: 'button', class: 'drawing__handle', 'aria-label': 'Schowaj górne menu', title: 'Schowaj górne menu (przesuń w górę)',
      dataset: { testid: 'drawing-hide-top' }, onClick: () => setHidden('top', true)
    }, h('span'));
    // Dolny pasek: narzędzia ogólne.
    const dockHandle = h('button', {
      type: 'button', class: 'drawing__handle', 'aria-label': 'Schowaj dolny pasek', title: 'Schowaj dolny pasek (przesuń w dół)',
      dataset: { testid: 'drawing-hide-bottom' }, onClick: () => setHidden('bottom', true)
    }, h('span'));
    // Warstwy (od 1.36) – na dolnym pasku obok tła.
    const layersButton = h('button', {
      type: 'button', class: 'drawing__tool', 'aria-label': 'Warstwy', title: 'Warstwy – widoczność, przezroczystość, nasycenie, warstwy zaznaczonych',
      'aria-haspopup': 'dialog', 'aria-expanded': 'false', dataset: { testid: 'drawing-layers' }, onClick: () => toggleLayersPanel()
    }, icon('stack', { size: 24 }));
    const dock = h('div', { class: 'drawing__dock' }, dockChoices, dockHandle,
      h('div', { class: 'drawing__dock-bar', role: 'toolbar', 'aria-label': 'Narzędzia ogólne' },
        selectButton, rulerButton, guideButton, paperButton, layersButton, h('span', { class: 'drawing__dock-gap', 'aria-hidden': 'true' }), undoButton, redoButton));

    const zoomButton = h('button', {
      type: 'button', class: 'drawing__pill drawing__pill--gray', title: 'Powiększenie – dotknij: cała strona', dataset: { testid: 'drawing-zoom' },
      onClick: () => { view.zoom = 1; view.width = 0; resize(); zoomButton.textContent = '100%'; }
    }, '100%');
    // Rysik i palec (od 1.30 przełącznik): palec przesuwa stronę (dłoń nie zostawia śladów) albo też rysuje –
    // wtedy przesuwają i powiększają dwa palce.
    const penPill = h('button', {
      type: 'button', class: 'drawing__pill', hidden: !penSeen, dataset: { testid: 'drawing-pen-only' }, onClick: () => toggleFingerDraws()
    });
    function updatePenPill() {
      const finger = tools.fingerDraws;
      replaceChildren(penPill, icon(finger ? 'finger' : 'pen', { size: 14 }), finger ? 'Palec też rysuje · dwa palce przesuwają' : 'Rysuje tylko rysik · palec przesuwa');
      penPill.setAttribute('aria-pressed', String(finger));
      penPill.title = finger ? 'Dotknij: rysuje tylko rysik, palec przesuwa stronę' : 'Dotknij: palec też rysuje, dwa palce przesuwają i powiększają';
    }
    updatePenPill();
    function toggleFingerDraws() {
      tools.fingerDraws = !tools.fingerDraws;
      saveTools(tools);
      updatePenPill();
      flash(tools.fingerDraws ? 'Palec też rysuje – dwa palce przesuwają i powiększają stronę.' : 'Rysuje tylko rysik – palec przesuwa stronę, dłoń oparta o ekran nie zostawia śladów.');
    }
    const selectHint = h('span', { class: 'drawing__pill drawing__pill--info', hidden: true, dataset: { testid: 'drawing-select-hint' } });
    // Od 1.34: co robić przy okręgu z punktów, łuku i wymiarze (który punkt teraz).
    const shapeHint = h('span', { class: 'drawing__pill drawing__pill--info', hidden: true, role: 'status', dataset: { testid: 'drawing-shape-hint' } });
    const notice = h('span', { class: 'drawing__pill drawing__pill--info drawing__pill--notice drawing__notice', hidden: true, role: 'status', dataset: { testid: 'drawing-notice' } });
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
    // Od 1.32: po lewej – pastylki informacyjne (szare), po prawej – to, co można zmienić (białe).
    const scalePill = h('span', { class: 'drawing__pill drawing__pill--info', dataset: { testid: 'drawing-scale-info' } });
    const info = h('div', { class: 'drawing__info', dataset: { testid: 'drawing-info' } }, selectHint, shapeHint, lengthPill, scalePill, zoomButton);
    const status = h('div', { class: 'drawing__status', dataset: { testid: 'drawing-status' } }, penPill, guidePill, rulerPill, perpendicularButton,
      h('div', { class: 'drawing__pages' }, pagePrev, pagePill, pageNext));
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
    // ---- edycja zaznaczonego (od 1.35): kolor, grubość i styl z menu zmieniają zaznaczone elementy
    /** Element z kolorem do zmiany: kreska pióra i zakreślacza, kształt, pole tekstowe, wzór, symbol. */
    const hasPaint = (stroke) => ['pen', 'highlighter', 'shape', 'text', 'math', 'gdt', 'datum', 'roughness', 'diagram'].includes(stroke.tool);
    /** Element z grubością linii: kreska pióra i zakreślacza, kształt (bez wymiaru). */
    const hasLineWidth = (stroke) => stroke.tool === 'pen' || stroke.tool === 'highlighter' || (isShape(stroke) && !isMeasure(stroke));
    /**
     * Zaznaczone całe elementy, które zmienia menu (bez fragmentu i wycinka); przy narzędziu kształtów – tylko kształty
     * tego rodzaju (właśnie narysowany), inny rodzaj w menu – ustawienia następnych.
     */
    const editedSelection = () => (snip || selectionKind !== 'whole' ? [] : [...selection].filter((stroke) => drawing.strokes.includes(stroke)
      && (tool !== 'shape' || (isShape(stroke) && stroke.shape === tools.shape))));
    /** Zaznaczone elementy z kolorem do zmiany. */
    const paintedSelection = () => editedSelection().filter(hasPaint);
    /** Wspólny kolor zaznaczonych jako wybór palety (id albo własny kolor) – null, gdy różne. */
    function commonColor(strokes, highlighter) {
      const palette = highlighter ? HIGHLIGHTER_COLORS : INK_COLORS;
      const ids = new Set(strokes.map((stroke) => palette.find((color) => color.hex.toLowerCase() === stroke.color.toLowerCase())?.id ?? stroke.color.toLowerCase()));
      return ids.size === 1 ? [...ids][0] : null;
    }
    /** Średnia grubość kreski albo grubość linii kształtu. */
    const lineWidthOf = (stroke) => {
      if (isShape(stroke)) return stroke.size;
      let sum = 0;
      for (let index = 2; index < stroke.points.length; index += 3) sum += stroke.points[index];
      return sum / Math.max(1, stroke.points.length / 3);
    };
    /** Grubość z menu (0–2) najbliższa grubości elementu. */
    function widthIndexOf(stroke) {
      const presets = stroke.tool === 'highlighter' ? tools.highlighterWidths : tools.penWidths.map((width) => (width.min + width.max) / 2);
      const size = lineWidthOf(stroke);
      return presets.reduce((best, value, index) => (Math.abs(value - size) < Math.abs(presets[best] - size) ? index : best), 0);
    }
    /** Wspólna grubość zaznaczonych (numer w menu) albo -1. */
    function commonWidth(strokes) {
      const indexes = new Set(strokes.map(widthIndexOf));
      return indexes.size === 1 ? [...indexes][0] : -1;
    }
    /** Element z grubością `index` z menu: kształt – grubość linii, kreska – szerokości punktów przeskalowane (nacisk zostaje). */
    function withLineWidth(stroke, index) {
      if (isShape(stroke)) {
        const width = tools.penWidths[index];
        return { ...stroke, size: Math.round(((width.min + width.max) / 2) * 10) / 10 };
      }
      const highlighter = stroke.tool === 'highlighter';
      const target = highlighter ? tools.highlighterWidths[index] : (tools.penWidths[index].min + tools.penWidths[index].max) / 2;
      const factor = target / Math.max(0.1, lineWidthOf(stroke));
      const limit = highlighter ? HIGHLIGHTER_RANGE.max : WIDTH_LIMITS.max;
      const points = stroke.points.map((value, at) => (at % 3 === 2 ? Math.round(Math.min(limit, Math.max(WIDTH_LIMITS.min, highlighter ? target : value * factor)) * 100) / 100 : value));
      return { ...stroke, points };
    }
    /** Zmiana zaznaczonych elementów spełniających `test` – jeden krok cofania; zaznaczenie zostaje (nowe obiekty). */
    function changeSelection(test, change, from = editedSelection()) {
      const targets = from.filter(test);
      const pairs = targets.map((stroke) => [stroke, change(stroke)]).filter(([stroke, next]) => JSON.stringify(stroke) !== JSON.stringify(next));
      if (pairs.length === 0) return;
      history.begin();
      for (const [stroke, next] of pairs) drawing.strokes[drawing.strokes.indexOf(stroke)] = next;
      commitStep();
      selection = new Set([...selection].map((stroke) => pairs.find(([original]) => original === stroke)?.[1] ?? stroke));
      selectionKind = 'whole';
      updateToolbar();
      requestRender();
    }
    function updateToolbar() {
      for (const button of [penButton, highlighterButton, eraserButton, selectButton]) {
        button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
      }
      for (const [kind, button] of kindButtons) button.setAttribute('aria-pressed', String(tool === 'shape' && tools.shape === kind));
      updateMenu();
      // Od 1.36: wybór pod menu (trzeci pasek) należy do narzędzia z pokazywanej grupy – inna grupa w menu (np. symbole
      // przy wymiarze) – bez niego; styl zaznaczonych (tryb edycji) zostaje.
      toolInMenu = Boolean(findGroup(shownGroup.side, shownGroup.id, tools.toolGroups)?.items.includes(toolItem(tool, tools.shape, tools.dimMode)));
      // Kształty (od 1.15) mają kolor i grubość pióra. Od 1.35 zaznaczone elementy: kolor i grubość w menu
      // zmieniają je; od 1.35.1 tylko je (tryb edycji) – kolor i grubość narzędzia zmienia wybór bez zaznaczenia.
      const inking = tool === 'pen' || tool === 'highlighter' || tool === 'shape';
      const painted = paintedSelection();
      const sized = painted.filter(hasLineWidth);
      const highlighter = painted.length > 0 ? painted.every((stroke) => stroke.tool === 'highlighter') : tool === 'highlighter';
      const palette = highlighter ? HIGHLIGHTER_COLORS : INK_COLORS;
      const chosen = painted.length > 0 ? commonColor(painted, highlighter) : highlighter ? tools.highlighterColor : tools.penColor;
      const choose = (value) => {
        if (inking && painted.length === 0) {
          if (tool === 'highlighter') tools.highlighterColor = value;
          else tools.penColor = value;
          saveTools(tools);
        }
        if (painted.length > 0) {
          const hex = highlighter ? highlighterHex(value) : inkHex(value);
          changeSelection(hasPaint, (stroke) => ({ ...stroke, color: hex }));
        }
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
      swatches.hidden = !inking && painted.length === 0;
      const dotColor = chosen ? (highlighter ? highlighterHex(chosen) : inkHex(chosen)) : 'transparent';
      optionsDot.style.setProperty('--swatch', inking || painted.length > 0 ? dotColor : 'transparent');
      // Pasek pod ikoną zakreślacza w kolorze wybranego zakreślacza.
      highlighterButton.style.setProperty('--highlighter-ink', highlighterHex(tools.highlighterColor));
      const sizes = highlighter ? tools.highlighterWidths.map((width) => width / 3) : tools.penWidths.map((width) => (width.min + width.max) / 1.4);
      const current = sized.length > 0 ? commonWidth(sized) : highlighter ? tools.highlighterWidth : tools.penWidth;
      replaceChildren(widths, sizes.map((size, index) => h('button', {
        type: 'button', class: 'drawing__width', 'aria-label': ['Cienka', 'Średnia', 'Gruba'][index], title: ['Cienka', 'Średnia', 'Gruba'][index],
        'aria-pressed': String(index === current), dataset: { testid: `drawing-width-${index}` },
        onClick: () => {
          if (inking && sized.length === 0) {
            if (tool === 'highlighter') tools.highlighterWidth = index;
            else tools.penWidth = index;
            saveTools(tools);
          }
          if (sized.length > 0) changeSelection(hasLineWidth, (stroke) => withLineWidth(stroke, index));
          updateToolbar();
          refreshSettings?.();
        }
      }, h('span', { style: { width: `${Math.max(3, Math.min(14, size))}px`, height: `${Math.max(3, Math.min(14, size))}px` } }))));
      widths.hidden = !inking && sized.length === 0;
      eraserModes.hidden = tool !== 'eraser' || !toolInMenu;
      for (const button of eraserModes.children) button.setAttribute('aria-checked', String(button.dataset.mode === tools.eraserMode));
      eraserSizes.hidden = tool !== 'eraser' || tools.eraserMode !== 'pixel';
      for (const button of eraserSizes.children) button.setAttribute('aria-checked', String(Number(button.dataset.size) === tools.eraserSize));
      eraserButton.setAttribute('aria-label', `Gumka – ${ERASER_MODE_LABELS[tools.eraserMode].toLowerCase()}`);
      for (const group of [selectShapes, selectModes, selectGroup]) group.hidden = tool !== 'select';
      // Wiersz koloru i pastylka wyboru – tylko gdy mają co pokazać.
      optionRow.hidden = [swatches, widths, eraserSizes].every((group) => group.hidden);
      optionsButton.hidden = optionRow.hidden;
      if (optionRow.hidden) setOptionsOpen(false);
      ellipseModes.hidden = !(tool === 'shape' && tools.shape === 'ellipse') || !toolInMenu;
      for (const button of ellipseModes.children) button.setAttribute('aria-checked', String(button.dataset.mode === tools.ellipseMode));
      for (const [kind, button] of editButtons) button.setAttribute('aria-pressed', String(pointPick?.kind === kind));
      arcModes.hidden = !(tool === 'shape' && tools.shape === 'arc') || !toolInMenu;
      for (const button of arcModes.children) button.setAttribute('aria-checked', String(button.dataset.mode === tools.arcMode));
      dimAxes.hidden = !(tool === 'shape' && tools.shape === 'dim' && tools.dimMode === 'linear') || !toolInMenu;
      for (const button of dimAxes.children) button.setAttribute('aria-checked', String(button.dataset.mode === tools.dimAxis));
      for (const [mode, button] of dimButtons) button.setAttribute('aria-pressed', String(tool === 'shape' && tools.shape === 'dim' && tools.dimMode === mode));
      renderStyleRow();
      choices.hidden = [eraserModes, ellipseModes, arcModes, dimAxes, styleRow].every((group) => group.hidden);
      dockChoices.hidden = [selectShapes, selectModes, selectGroup].every((group) => group.hidden);
      updateShapeHint();
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
      layersButton.setAttribute('aria-expanded', String(!layersPanel.hidden));
      const activeName = layersNow().find((layer) => layer.id === (drawing.activeLayer ?? 1))?.name ?? 'Warstwa 1';
      layersButton.title = `Warstwy – nowe elementy: ${activeName}`;
      scalePill.textContent = `Kratka: ${formatLength(PAPER_STEP, drawing.scale)}`;
      updateRings();
    }

    // ---- kółka narzędzi (od 1.32): grupy standardowe po prawej, użytkownika po lewej; od 1.33 – dobór grup
    /** Pokazywana grupa: { side, id } – jej narzędzia są w pierwszym wierszu górnego menu. */
    let shownGroup = startGroup(tools.toolGroup, toolItem(tool, tools.shape, tools.dimMode), tools.toolGroups);
    /** Ostatnio użyte narzędzie każdej grupy – wybór grupy wraca do niego. */
    const groupTools = new Map();
    let menuGroup = null;
    function updateMenu() {
      const group = findGroup(shownGroup.side, shownGroup.id, tools.toolGroups);
      const key = `${shownGroup.side}:${group.id}`;
      if (menuGroup !== key) {
        menuGroup = key;
        replaceChildren(toolRow, group.items.map((item) => itemButtons.get(item)));
        groupName.textContent = group.label;
        toolbar.dataset.group = group.id;
      }
    }
    /** Wybór grupy z kółka: menu pokazuje jej narzędzia; grupa z narzędziami (pióro, kształty) – od razu ostatnie z nich. */
    function showGroup(side, id) {
      const group = findGroup(side, id, tools.toolGroups);
      if (!group) return;
      shownGroup = { side, id };
      tools.toolGroup = `${side}:${id}`;
      saveTools(tools);
      ctrlHold = null;
      const current = toolItem(tool, tools.shape, tools.dimMode);
      // Otwarte ustawienia kształtów: grupa tylko się pokazuje – kształt zmienia dopiero dotknięcie (jak w panelu do 1.31).
      const browsing = tool === 'shape' && !shapePanel.hidden;
      if (!group.items.includes(current) && !browsing) {
        const remembered = groupTools.get(`${side}:${id}`);
        const lastShape = `shape:${tools.shape}`;
        // Grupa kształtów – ostatnio używany kształt (jak dawny przycisk „Kształty”), inaczej pierwsze narzędzie grupy.
        const next = remembered && group.items.includes(remembered) ? remembered
          : group.items.includes(lastShape) ? lastShape : group.items.find(isModeItem);
        if (next) {
          applyItem(next);
          return;
        }
      }
      // Narzędzie bez zmian – otwarty panel zostaje (np. ustawienia kształtu przy przejściu do „Konstrukcji”).
      updateToolbar();
      requestLive();
    }
    /** Narzędzie albo polecenie z menu; drugie dotknięcie wybranego narzędzia – jego ustawienia. */
    function activateItem(item) {
      ctrlHold = null;
      const current = toolItem(tool, tools.shape, tools.dimMode);
      if (item === current && (item === 'pen' || item === 'highlighter')) {
        toggleSettings();
        return;
      }
      if (item === current && (item.startsWith('shape:') || item.startsWith('dim:'))) {
        toggleShapePanel();
        return;
      }
      if (item.startsWith('edit:') && pointPick?.kind === item.slice(5)) {
        cancelPointPick(EDIT_END[pointPick.kind]);
        updateToolbar();
        return;
      }
      applyItem(item);
    }
    function applyItem(item) {
      if (isModeItem(item)) groupTools.set(`${shownGroup.side}:${shownGroup.id}`, item);
      // Od 1.36 rodzaj wymiaru – kształt „Wymiar” z tym rodzajem.
      if (item.startsWith('dim:')) {
        tools.shape = 'dim';
        tools.dimMode = item.slice(4);
        saveTools(tools);
        pending = null;
        if (tool !== 'shape') {
          setTool('shape');
          return;
        }
        if (!shapePanel.hidden) renderShapePanel();
        updateToolbar();
        requestLive();
        return;
      }
      if (item.startsWith('shape:')) {
        const panelWasOpen = !shapePanel.hidden;
        // Otwarte „Więcej” (ⓘ) zostaje przy odcinku, strzałkach i punkcie – jak do 1.34, gdy były w nim zakończenia i znacznik.
        const keepPanel = (kind) => panelWasOpen && (hasCaps({ shape: kind }) || kind === 'point');
        tools.shape = item.slice(6);
        saveTools(tools);
        pending = null;
        if (tool !== 'shape') {
          setTool('shape');
          if (keepPanel(tools.shape)) toggleShapePanel();
          return;
        }
        // Inny kształt przy narzędziu kształtów – zaznaczenie zostaje (jak w panelu kształtów do 1.31).
        if (keepPanel(tools.shape)) renderShapePanel();
        else closeSettings();
        updateToolbar();
        requestLive();
        return;
      }
      if (isModeItem(item)) {
        setTool(item);
        return;
      }
      if (item.startsWith('edit:')) {
        closeSettings();
        startEdit(item.slice(5));
        return;
      }
      closeSettings();
      updateToolbar();
      const open = { text: () => editElement('text'), math: () => editElement('math'), table: () => editTable(), sticky: () => editSticky(),
        gdt: () => editGdt(), datum: () => editDatum(), roughness: () => editRoughness(),
        'diagram:fishbone': () => editDiagram(null, 'fishbone'), 'diagram:whys': () => editDiagram(null, 'whys'), sipoc: () => editTable(null, SIPOC_TABLE), layout: () => editLayout() }[item];
      open?.();
    }
    /** Wygląd dużego kółka (wariant C): wypełnienie w kolorze narzędzia, obwódka biała; narzędzie bez koloru – kolor aplikacji. */
    function mainLook() {
      const shape = tool === 'shape' ? tools.shape : null;
      const measure = shape === 'dim' ? DIM_TOOLS[tools.dimMode] ?? DIM_TOOLS.linear : null;
      const iconName = tool === 'select' ? (tools.selectShape === 'lasso' ? 'lasso' : 'marquee')
        : measure ? measure[1] : shape ? SHAPE_ICONS[shape] : tool === 'highlighter' ? 'highlighter' : tool === 'eraser' ? 'eraser' : 'pen';
      const name = tool === 'select' ? 'Zaznaczanie' : measure ? `Wymiar – ${measure[0].toLowerCase()}` : shape ? SHAPE_LABELS[shape]
        : { pen: 'Pióro', highlighter: 'Zakreślacz', eraser: 'Gumka' }[tool] ?? 'Pióro';
      const hex = tool === 'highlighter' ? highlighterHex(tools.highlighterColor) : tool === 'pen' || tool === 'shape' ? inkHex(tools.penColor) : null;
      return {
        icon: iconName,
        fill: hex ?? 'var(--accent-fill)',
        ink: hex ? (lightColor(hex) ? '#1d1d1f' : '#ffffff') : 'var(--on-accent)',
        label: `${name}${tool === 'pen' || tool === 'highlighter' || tool === 'shape' ? ' – dotknij: ustawienia' : ''}`
      };
    }
    /** Kolor jasny (żółty zakreślacz) – ikona na nim ciemna. */
    function lightColor(hex) {
      const value = parseInt(hex.slice(1, 7), 16);
      const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
      return 0.299 * r + 0.587 * g + 0.114 * b > 170;
    }
    function onRingMain(side) {
      if (shownGroup.side !== side) {
        const group = findGroup(side, menuGroups[side], tools.toolGroups) ?? groupsOf(side, tools.toolGroups)[0];
        // Kółko bez grup (usunięte wszystkie własne) – duże kółko otwiera dobór grup.
        if (group) showGroup(side, group.id);
        else editGroups(side);
        return;
      }
      if (tool === 'pen' || tool === 'highlighter') toggleSettings();
      else if (tool === 'shape') toggleShapePanel();
      updateToolbar();
    }
    /** Ostatnio pokazana grupa każdego kółka (duże kółko drugiej strony pokazuje jej ikonę). */
    const menuGroups = Object.fromEntries(RING_SIDES.map((side) => [side, side === shownGroup.side ? shownGroup.id : groupsOf(side, tools.toolGroups)[0]?.id ?? null]));
    const RING_LABELS = { right: 'Narzędzia standardowe', left: 'Moje narzędzia' };
    const rings = Object.fromEntries(RING_SIDES.map((side) => [side, createRing({
      side,
      groups: groupsOf(side, tools.toolGroups),
      label: RING_LABELS[side],
      onPick: (id) => showGroup(side, id),
      onMain: () => onRingMain(side),
      onHide: (hiddenNow) => setHidden(side, hiddenNow),
      onEdit: () => editGroups(side),
      // Od 1.39: kółko przesunięte ręcznie – miejsce zapamiętane na urządzeniu.
      onMove: (position) => {
        tools.ringPositions = { ...tools.ringPositions, [side]: position };
        saveTools(tools);
      }
    })]));
    /**
     * Kółka narzędzi: na szerokim ekranie obok górnego menu, na węższym – pod nim, od 1.35 także pod wyborem
     * (trzecie menu z kilkoma grupami nie zasłania małych kółek).
     */
    let ringTop = 0;
    function placeRingTop() {
      const box = stage.getBoundingClientRect();
      if (box.width === 0) return;
      // Schowane górne menu (od 1.39): kółko od razu na górze – bez czekania na koniec animacji chowania
      // (w jej trakcie menu ma jeszcze dawne położenie).
      const topAway = uiAll || uiPartHidden(uiHidden, 'top', isNarrow());
      const below = topAway ? 0 : Math.max(toolbar.getBoundingClientRect().bottom, choices.hidden ? 0 : choices.getBoundingClientRect().bottom);
      const top = box.width >= 1100 || topAway ? 10 : Math.max(10, Math.round(below - box.top + 14));
      if (top === ringTop) return;
      ringTop = top;
      body.style.setProperty('--drawing-ring-top', `${top}px`);
    }
    function updateRings() {
      placeRingTop();
      menuGroups[shownGroup.side] = shownGroup.id;
      const narrow = isNarrow();
      for (const side of RING_SIDES) {
        const own = shownGroup.side === side;
        const other = findGroup(side, menuGroups[side], tools.toolGroups) ?? groupsOf(side, tools.toolGroups)[0];
        const idle = other
          ? { icon: other.icon, label: `${RING_LABELS[side]}: ${other.label}` }
          : { icon: 'plus', label: `${RING_LABELS[side]}: brak grup – dotknij, aby dodać` };
        rings[side].update({
          active: own ? shownGroup.id : null,
          main: own ? mainLook() : { ...idle, fill: 'var(--accent-fill)', ink: 'var(--on-accent)' },
          hidden: uiPartHidden(uiHidden, side, narrow),
          all: uiAll,
          narrow,
          position: tools.ringPositions?.[side] ?? null
        });
      }
    }
    /** Okno „Grupy narzędzi” (od 1.33); z lewego kółka – z otwartą do edycji jego ostatnią grupą. */
    function editGroups(side) {
      ctrlHold = null;
      closeSettings();
      openToolGroups({ config: tools.toolGroups, editing: side === 'left' ? menuGroups.left : null, onSave: applyGroups });
    }
    /** Nowy dobór grup: kółka i menu od razu; pokazana grupa, której już nie ma – grupa z bieżącym narzędziem. */
    function applyGroups(config) {
      tools.toolGroups = config;
      if (!findGroup(shownGroup.side, shownGroup.id, config)) {
        shownGroup = startGroup(null, toolItem(tool, tools.shape, tools.dimMode), config);
        tools.toolGroup = `${shownGroup.side}:${shownGroup.id}`;
      }
      saveTools(tools);
      menuGroup = null;
      for (const side of RING_SIDES) {
        if (side === shownGroup.side) menuGroups[side] = shownGroup.id;
        else if (!findGroup(side, menuGroups[side], config)) menuGroups[side] = groupsOf(side, config)[0]?.id ?? null;
        rings[side].setGroups(groupsOf(side, config), menuGroups[side]);
      }
      updateToolbar();
      requestLive();
    }
    const isNarrow = () => window.matchMedia?.('(max-width: 599px)').matches ?? false;

    // ---- chowanie elementów interfejsu (od 1.32): przesunięcie do krawędzi, zakładka przywraca; oko w nagłówku – wszystko
    const uiHidden = tools.uiHidden;
    let uiAll = false;
    function setHidden(part, value) {
      uiHidden[part] = value;
      // Schowanie kółka (od 1.39) przywraca jego stałe miejsce przy krawędzi.
      if (value && RING_SIDES.includes(part)) tools.ringPositions = { ...tools.ringPositions, [part]: null };
      tools.uiHidden = uiHidden;
      saveTools(tools);
      if (value && (part === 'top' || part === 'bottom')) closeSettings();
      applyUi();
    }
    function toggleAll() {
      uiAll = !uiAll;
      if (uiAll) closeSettings();
      applyUi();
    }
    const showTab = (part, label, iconName, testID) => h('button', {
      type: 'button', class: `drawing__show drawing__show--${part}`, hidden: true, 'aria-label': label, title: label,
      dataset: { testid: testID }, onClick: () => setHidden(part, false)
    }, icon(iconName, { size: 16 }));
    const topTab = showTab('top', 'Pokaż górne menu', 'chevronDown', 'drawing-show-top');
    const dockTab = showTab('bottom', 'Pokaż dolny pasek', 'chevronUp', 'drawing-show-bottom');
    const infoTab = showTab('info', 'Pokaż informacje', 'chevronRight', 'drawing-show-info');
    const statusTab = showTab('status', 'Pokaż kartki i przełączniki', 'chevronLeft', 'drawing-show-status');
    function applyUi() {
      const narrow = isNarrow();
      const parts = [['top', topBar, topTab], ['bottom', dock, dockTab], ['info', info, infoTab], ['status', status, statusTab]];
      for (const [part, element, tab] of parts) {
        const hiddenPart = uiPartHidden(uiHidden, part, narrow);
        element.classList.toggle('drawing--away', hiddenPart || uiAll);
        element.inert = hiddenPart || uiAll;
        tab.hidden = !hiddenPart || uiAll;
      }
      hideAllButton.setAttribute('aria-pressed', String(uiAll));
      const label = uiAll ? 'Pokaż interfejs' : 'Ukryj cały interfejs';
      hideAllButton.setAttribute('aria-label', label);
      hideAllButton.title = label;
      replaceChildren(hideAllButton, icon(uiAll ? 'eye' : 'eyeOff', { size: 22 }));
      updateRings();
    }
    /**
     * Przesunięcie elementu w stronę krawędzi chowa go (górne menu – w górę, dolny pasek – w dół, pastylki – na boki).
     * Gest zaczyna się na elemencie (nie na kartce); dotknięcie przycisku działa jak zwykle.
     */
    function swipeAway(element, part, direction) {
      let start = null;
      element.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.target.closest('input, select, textarea, .drawing__settings, .drawing__row--tools')) return;
        start = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      });
      element.addEventListener('pointermove', (event) => {
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        const along = direction === 'up' ? -dy : direction === 'down' ? dy : direction === 'left' ? -dx : dx;
        const across = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);
        if (!start.moved) {
          if (along < 10 || along < across) return;
          start.moved = true;
          try {
            element.setPointerCapture(event.pointerId);
          } catch {
            // bez przechwycenia gest też działa
          }
        }
      });
      const end = (event, cancelled) => {
        if (!start || start.id !== event.pointerId) return;
        const { moved, x, y } = start;
        start = null;
        if (!moved || cancelled) return;
        const dx = event.clientX - x;
        const dy = event.clientY - y;
        const along = direction === 'up' ? -dy : direction === 'down' ? dy : direction === 'left' ? -dx : dx;
        if (along > 36) setHidden(part, true);
      };
      element.addEventListener('pointerup', (event) => end(event, false));
      element.addEventListener('pointercancel', (event) => end(event, true));
    }
    // Telefon (od 1.32): kolor i grubość po dotknięciu kropki koloru – pod jednym wierszem narzędzi.
    let optionsOpen = false;
    function setOptionsOpen(open) {
      optionsOpen = open;
      topBarElement()?.classList.toggle('drawing__top--options', open);
      optionsButton.setAttribute('aria-expanded', String(open));
    }
    function toggleOptions() {
      setOptionsOpen(!optionsOpen);
    }
    const topBarElement = () => toolbar.parentElement;

    // ---- lewy Alt (od 1.32): samo naciśnięcie – zaznaczanie na stałe, ponownie – poprzednie narzędzie
    /** Wciśnięty lewy Alt: clean – bez innego klawisza i bez wskaźnika w tym czasie. */
    let altTap = null;
    function toggleSelectTool() {
      ctrlHold = null;
      if (tool === 'select') {
        setTool(lastTool);
        flash(`Wrócono do: ${mainLook().label.split(' – ')[0].toLowerCase()}.`);
        return;
      }
      const previous = mainLook().label.split(' – ')[0].toLowerCase();
      setTool('select');
      flash(`Zaznaczanie – lewy Alt wraca do: ${previous}.`);
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
      // Od 1.24: zamiana odręcznego kształtu w figurę po przytrzymaniu pióra na końcu kreski.
      const recognizeRow = toggle({
        checked: tools.recognize, label: 'Figury z odręcznych kształtów',
        onChange: (checked) => { tools.recognize = checked; saveTools(tools); }
      });
      recognizeRow.querySelector('input').dataset.testid = 'drawing-recognize';
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
        panelTitle('Pióro'),
        h('p', { class: 'drawing__settings-label' }, 'Czułość nacisku'),
        h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Czułość nacisku' }, sensitivity),
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Grubość kreski'), widthText),
        dual,
        h('p', { class: 'drawing__settings-label' }, h('span', null, 'Wygładzanie kreski'), smoothText),
        smoothRange,
        h('p', { class: 'drawing__settings-label' }, 'Podgląd: lekko – mocno – lekko'),
        canvas,
        h('div', { class: 'drawing__settings-switch' }, recognizeRow),
        h('p', { class: 'field__hint' }, 'Narysuj kształt i na końcu przytrzymaj pióro (ok. ½ s) – odcinek, strzałka, łamana, trójkąt, prostokąt, romb, okrąg, elipsa i wielokąt zamienią się w figurę. „Cofnij” przywraca kreskę odręczną.'),
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
        panelTitle('Zakreślacz'),
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
        panelTitle(tool === 'highlighter' ? 'Kolor zakreślacza' : 'Kolor pióra'),
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
    /**
     * Styl liczb wymiarów (od 1.22.1) i od 1.25 jednostka liczb bez jednostki (mm, cm, m, cale) –
     * zapisywane z rysunkiem, jak skala. Tolerancje są w mm, więc zmiana ich nie psuje.
     */
    function setDimFormat(style, unit = null) {
      const before = dimFormat(drawing);
      if (style === 'technical') {
        drawing.dimStyle = 'technical';
        const chosen = unit ?? before.unit ?? defaultDimUnit(drawing.scale);
        if (chosen === defaultDimUnit(drawing.scale)) delete drawing.dimUnit;
        else drawing.dimUnit = chosen;
      } else {
        delete drawing.dimStyle;
        delete drawing.dimUnit;
      }
      const after = dimFormat(drawing);
      if (after.style === before.style && after.unit === before.unit) return;
      changed = true;
      requestRender();
    }
    /** Wybór jednostki liczb bez jednostki (od 1.25): mm, cm, m, cale. */
    const dimUnitChoice = (value, onChange) => segmented({
      name: `drawing-dim-unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: 'Jednostka liczb wymiarów', value,
      options: DIM_UNITS.map((unit) => ({ value: unit.id, label: unit.id === 'in' ? 'cale' : unit.label })),
      onChange
    });
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
      const screenText = h('p', { class: 'field__hint field__hint--live', dataset: { testid: 'drawing-scale-screen' } });
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
        dimUnitBox.hidden = dimFormat(drawing).style !== 'technical';
        const { millimeters, ratio } = estimate();
        screenText.textContent = `Przy powiększeniu ${Math.round(view.zoom * 100)}% kratka ma na tym ekranie ok. ${formatNumber(millimeters)} mm – `
          + `rysunek widać w skali ok. ${formatRatio(ratio)}. To szacunek: przeglądarka nie podaje wielkości ekranu.`;
      }
      // Od 1.22.1: liczby wymiarów na rysunku – z jednostką („5 cm”) albo technicznie bez jednostki („50”);
      // od 1.25 bez jednostki w mm, cm, m albo calach – z oznaczeniem „Wymiary w …” w rogu rysunku.
      const dimStyleControl = segmented({
        name: `drawing-dim-style-${Date.now()}`, label: 'Liczby wymiarów', value: dimFormat(drawing).style,
        options: [{ value: 'unit', label: 'Z jednostką „5 cm”' }, { value: 'technical', label: 'Bez jednostki „50”' }],
        onChange: (value) => {
          setDimFormat(value);
          refresh();
        }
      });
      dimStyleControl.dataset.testid = 'drawing-dim-style';
      const dimUnitControl = dimUnitChoice(dimFormat(drawing).unit ?? defaultDimUnit(drawing.scale), (unit) => {
        setDimFormat('technical', unit);
        refresh();
      });
      dimUnitControl.dataset.testid = 'drawing-dim-unit';
      const dimUnitBox = h('div', null, h('p', { class: 'drawing__settings-label' }, 'Jednostka liczb bez jednostki'), dimUnitControl);
      replaceChildren(rulerPanel,
        panelTitle('Linijka i skala'),
        h('p', { class: 'drawing__settings-label' }, 'Skala rysunku'),
        h('div', { class: 'drawing__scale' }, h('span', null, '1 kratka ='), valueInput, unitSelect),
        screenText,
        h('p', { class: 'drawing__settings-label' }, 'Liczby wymiarów na rysunku'),
        dimStyleControl,
        dimUnitBox,
        h('p', { class: 'field__hint' }, 'Bez jednostki – jak w rysunku technicznym (domyślnie milimetry, przy jednostkach imperialnych – cale); '
          + 'jednostka jest w oznaczeniu „Wymiary w mm” w lewym dolnym rogu rysunku. Tolerancje zostają te same przy zmianie jednostki.'),
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
    // Warstwy (od 1.36) – panel nad dolnym paskiem (treść niżej, przy sygnaturach).
    const layersPanel = h('div', { class: 'drawing__settings drawing__layers', hidden: true, role: 'dialog', 'aria-label': 'Warstwy', dataset: { testid: 'drawing-layers-panel' } });
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
      const parts = [panelTitle('Tło strony')];
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
        panelTitle(`${TEMPLATE_LABELS[template.source]}: wielkość i miejsce`),
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
    /** Wskazówki do kształtów w panelu kształtów (od 1.34; od 1.35 także punkt, prosta i strzałka po łuku – zamiast opisu ogólnego). */
    const SHAPE_TIPS = {
      point: 'Punkt: dotknij strony – znacznik w tym miejscu. Rodzaj znacznika (punkt symetrii, kropka, krzyżyk, środek) – pod menu; '
        + 'zmienia też zaznaczone punkty.',
      xline: 'Prosta: przeciągnij od punktu do punktu – biegnie przez całą stronę przez te dwa punkty. Rodzaj linii (np. osiowa) – pod menu.',
      // Od 1.40: półprosta, wielokąt foremny, narożniki prostokąta.
      ray: 'Półprosta: przeciągnij od początku przez drugi punkt – biegnie od początku przez całą stronę. Rodzaj linii (np. osiowa) – pod menu.',
      ngon: 'Wielokąt foremny: przeciągnij od środka do wierzchołka (z Shift – obrót co 15°), dotknięcie – wielokąt z podstawą u dołu. '
        + 'Liczba boków (3–12) – pod menu „Boki”; zmienia też zaznaczone. Narożnik ramki zaznaczonego zachowuje foremność, bok – rozciąga.',
      rect: 'Narożniki – pod menu: ostre, zaokrąglenie R albo faza, wielkość ¼, ½, 1 kratka albo wpisana. Pole i obwód zaznaczonego kształtu – przy jego nazwie.',
      curve: 'Strzałka po łuku: przeciągnij od początku do końca. Zaznaczona ma dwa punkty pośrednie – przeciągnij je, łuk przechodzi przez nie. '
        + 'Rodzaj linii i końce – pod menu.',
      ellipse: 'Okrąg i elipsa – wybór pod menu: Ramka (prostokąt przeciągnięcia), Środek i R (od środka do okręgu), 2 pkt (średnica – od punktu do punktu), '
        + '3 pkt (okrąg przez trzy dotknięte punkty), Styczny (dotknij dwóch linii albo okręgów i wpisz promień). Punkty przyciągają się do narożników, środków boków i kształtów, przecięć, krawędzi '
        + 'i końców kresek. Osie – pod menu: krzyż osi przez środek okręgu (znacznik środka). Średnicę okręgu wpiszesz w polu ⌀ przy ramce.',
      // Od 1.43: łamana punkt po punkcie.
      polyline: 'Łamana: dotykaj kolejnych wierzchołków (punkty przyciągają się jak końce odcinka). Koniec – ostatni punkt jeszcze raz, Enter albo Esc; '
        + 'dotknięcie pierwszego punktu zamyka łamaną w wielokąt (z wypełnieniem narzędzia). Punkty zaznaczonej łamanej – przeciągnij je.',
      // Od 1.42: łuk ze środka, wymiar poziomy i pionowy, długość łuku.
      arc: 'Łuk – wybór pod menu: 3 pkt (przeciągnij od początku do końca albo dotknij obu, potem dotknij punktu, przez który ma przejść) albo '
        + 'Środek (dotknij środka, początku i końca – łuk biegnie od początku do końca przeciwnie do wskazówek zegara). '
        + 'Punkty zaznaczonego łuku: początek, środek łuku i koniec – przeciągnij je.',
      dim: 'Wymiar – wybór pod menu: Liniowy (przeciągnij od punktu do punktu albo dotknij krawędzi; kierunek pod menu – wzdłuż, poziomy, pionowy), '
        + 'Średnica ⌀ i Promień R (dotknij okręgu albo łuku), Kąt (wierzchołek i po punkcie na ramionach), Długość łuku (dotknij łuku). '
        + 'Końce przyciągnięte do kształtu idą za nim. Zaznaczony wymiar liniowy: Łańcuch i Od bazy – kolejne wymiary jednym dotknięciem punktu. '
        + 'Liczba mierzy rysunek w jego skali; ± przy liczbie – znak i tolerancja, uchwyt przy liczbie – odsunięcie (także na drugą stronę).'
    };
    function renderShapePanel() {
      if (shapePanel.hidden) return;
      // Od 1.35 styl (znacznik, linia, wypełnienie, zakończenia) jest w trzecim menu – tu, po ⓘ, przełączniki i opis.
      replaceChildren(shapePanel,
        panelTitle(`Kształty – ${SHAPE_LABELS[tools.shape].toLowerCase()}`),
        tools.shape === 'dim' || tools.shape === 'arc' || tools.shape === 'point' ? null : h('div', { class: 'drawing__settings-switch' }, lockToggle()),
        tools.shape === 'point' ? null : h('div', { class: 'drawing__settings-switch' }, edgeSnapToggle()),
        // Od 1.34: okrąg z punktów, łuk i wymiar – jak ich używać.
        SHAPE_TIPS[tools.shape] ? h('p', { class: 'field__hint' }, SHAPE_TIPS[tools.shape]) : null,
        // Opis ogólny – przy kształtach z ramką (punkt, prosta i strzałka po łuku mają własny).
        ['point', 'xline', 'ray', 'ngon', 'curve', 'arc', 'dim', 'polyline'].includes(tools.shape) ? null : h('p', { class: 'field__hint' },
          'Przeciągnij po stronie – kształt powstaje w prostokącie przeciągnięcia (odcinek i strzałka – od początku do końca); '
          + 'dotknięcie – kształt w tym miejscu. Kolor i grubość – jak pióra; rodzaj linii, wypełnienie (jasne jest przejrzyste) i końce – pod menu. '
          + 'Punkty zaznaczonego kształtu: narożniki i boki – szerokość i wysokość, romb na górnej krawędzi – pochylenie, kółko nad kształtem – obrót, '
          + 'pomarańczowy punkt – wierzchołek trójkąta albo wcięcie trapezu. Wymiary i kąt pochylenia wpiszesz w polach przy ramce (oko przy polu – '
          + 'wymiar zostaje na rysunku), tekst – przyciskiem „Tekst” albo dotknięciem zaznaczonego kształtu. Z klawiszem Shift (albo z włączonymi '
          + 'proporcjami): kwadrat, koło, odcinek co 15°, narożnik bez zmiany proporcji.'));
      updateToolbar();
    }
    // ---- trzecie menu kształtów (od 1.35): styl nowych kształtów i zaznaczonych
    /** Otwarty wybór pod trzecim menu: 'mark' | 'dash' | 'fill' | 'caps' | null. */
    let openPicker = null;
    let styleKey = '';
    /** Narzędzie jest w grupie pokazywanej w górnym menu (od 1.36 – inaczej trzeci pasek tylko w trybie edycji). */
    let toolInMenu = true;
    const STYLE_LABELS = { mark: 'Znacznik', dash: 'Linia', fill: 'Wypełnienie', caps: 'Końce', sides: 'Boki', corner: 'Narożniki', axes: 'Osie', axis: 'Kierunek' };
    /** Wymiar liniowy narzędzia „Wymiar” (od 1.42 – kierunek do wyboru). */
    const isLinearMeasure = (shape) => shape.shape === 'dim' && dimMode(shape) === 'linear';
    /** Narożniki jako napis do porównań ('none' – ostre, 'round:11'). */
    const cornerKey = (corner) => (corner ? `${corner.kind}:${corner.size}` : 'none');
    const cornerOfKey = (key) => (!key || key === 'none' ? null : { kind: key.split(':')[0], size: Number(key.split(':')[1]) });
    const sameValue = (values) => (values.length > 0 && values.every((value) => value === values[0]) ? values[0] : null);
    /**
     * Styl w trzecim menu: zaznaczone kształty (całe) – ich wspólne wartości (null – różne), bez zaznaczenia –
     * ustawienia nowych kształtów narzędzia. Klucz bez wartości – ta grupa nie dotyczy kształtów. null – nic do pokazania.
     */
    function styleState() {
      const targets = editedSelection().filter(isShape);
      const kind = tool === 'shape' ? tools.shape : null;
      if (targets.length === 0 && !kind) return null;
      const probe = targets.length > 0 ? targets : [{ shape: kind }];
      const own = kind ? shapeToolStyle(tools, kind) : {};
      const pick = (test, value, fallback) => {
        if (!probe.some(test)) return undefined;
        return targets.length > 0 ? sameValue(targets.filter(test).map(value)) : fallback;
      };
      const caps = probe.some(hasCaps)
        ? (targets.length > 0 ? { start: sameValue(targets.filter(hasCaps).map((shape) => segmentCaps(shape).start)), end: sameValue(targets.filter(hasCaps).map((shape) => segmentCaps(shape).end)) }
          : segmentDefaultCaps())
        : undefined;
      return {
        targets, kind,
        values: {
          mark: pick(isPointShape, pointMark, tools.pointMark),
          dash: pick(canDash, shapeDash, own.dash),
          fill: pick(canFill, (shape) => shape.fill ?? 'none', own.fill),
          caps,
          // Od 1.40: liczba boków wielokąta foremnego i narożniki prostokąta.
          sides: pick((shape) => shape.shape === 'ngon', ngonSides, tools.ngonSides),
          corner: pick((shape) => shape.shape === 'rect', (shape) => cornerKey(shape.corner), cornerKey(tools.rectCorner)),
          // Od 1.42: osie okręgu i elipsy; kierunek zaznaczonego wymiaru liniowego (nowego – w wyborze pod menu).
          axes: pick((shape) => shape.shape === 'ellipse', (shape) => Boolean(shape.axes), tools.ellipseAxes),
          axis: targets.length > 0 ? pick(isLinearMeasure, (shape) => dimAxis(shape) ?? 'aligned', tools.dimAxis) : undefined
        }
      };
    }
    /** Ikona przycisku grupy – wybrana wartość. */
    function styleIcon(key, value) {
      if (key === 'mark') return MARK_ICONS[value ?? 'center'];
      if (key === 'dash') return DASH_ICONS[value ?? 'solid'];
      if (key === 'caps') return CAP_ICONS[value?.end ?? 'none'];
      if (key === 'sides') return 'shapeNgon';
      if (key === 'axes') return 'centerMark';
      if (key === 'axis') return value === 'v' ? 'dimVertical' : value === 'h' ? 'dimension' : 'dimAligned';
      if (key === 'corner') return CORNER_ICONS[cornerOfKey(value)?.kind ?? 'none'];
      return value === 'hatch' ? 'hatch' : 'fill';
    }
    /** Napis przycisku grupy – przy bokach ich liczba („6 boków”). */
    const styleLabel = (key, value) => (key === 'sides' && value ? plural(value, 'bok', 'boki', 'boków') : STYLE_LABELS[key]);
    /** Kreskowanie nowych kształtów rodzaju `kind` (od 1.40). */
    const toolHatch = (kind) => shapeToolStyle(tools, kind).hatch;
    /**
     * Kształt z wypełnieniem `fill` (pełne w kolorze tekstu – tekst biały, żeby było go widać); kreskowanie (od 1.40) –
     * dotychczasowe kształtu albo ustawione dla jego rodzaju.
     */
    function withFill(shape, fill) {
      const next = withShapeFill(shape, fill, shape.hatch ?? toolHatch(shape.shape));
      if (fill === 'solid' && next.label?.color === next.color) next.label = { ...next.label, color: '#ffffff' };
      return next;
    }
    /** Kreskowanie w wyborze wypełnienia: zaznaczonych (wspólne albo null) albo nowych kształtów narzędzia. */
    function hatchState(state) {
      if (state.targets.length === 0) return toolHatch(state.kind);
      const hatched = state.targets.filter((shape) => canFill(shape) && shape.fill === 'hatch').map((shape) => cleanHatch(shape.hatch));
      if (hatched.length === 0) return null;
      return hatched.every((hatch) => JSON.stringify(hatch) === JSON.stringify(hatched[0])) ? hatched[0] : null;
    }
    /**
     * Wybór w trzecim menu. Bez zaznaczenia – styl następnych kształtów narzędzia (od 1.35.1 rodzaj linii i wypełnienie
     * osobno dla każdego kształtu); zaznaczone (tryb edycji) – zmieniają się tylko one, ustawienia narzędzia zostają.
     */
    function pickStyle(key, value, which = null) {
      const state = styleState();
      if (!state) return;
      if (state.targets.length === 0) {
        if (key === 'mark') tools.pointMark = value;
        if (key === 'dash' || key === 'fill') tools.shapeStyles = withShapeToolStyle(tools, state.kind, key, value).shapeStyles;
        if (key === 'caps' && hasCaps({ shape: tools.shape })) tools[CAPS_KEYS[tools.shape]] = { ...segmentDefaultCaps(), [which]: value };
        if (key === 'hatch') tools.shapeStyles = withShapeToolStyle(tools, state.kind, 'hatch', cleanHatch({ ...toolHatch(state.kind), ...value })).shapeStyles;
        if (key === 'sides') tools.ngonSides = value;
        if (key === 'corner') tools.rectCorner = value;
        if (key === 'axes') tools.ellipseAxes = value;
        saveTools(tools);
      }
      if (key === 'mark') restyle(isPointShape, (shape) => ({ ...shape, mark: value }));
      if (key === 'dash') restyle(canDash, (shape) => withDash(shape, value));
      if (key === 'fill') restyle(canFill, (shape) => withFill(shape, value));
      if (key === 'caps') restyle(hasCaps, (shape) => withCaps(shape, { ...segmentCaps(shape), [which]: value }));
      if (key === 'hatch') restyle((shape) => canFill(shape) && shape.fill === 'hatch', (shape) => ({ ...shape, hatch: cleanHatch({ ...cleanHatch(shape.hatch), ...value }) }));
      if (key === 'sides') restyle((shape) => shape.shape === 'ngon', (shape) => withNgonSides(shape, value));
      if (key === 'corner') restyle((shape) => shape.shape === 'rect', (shape) => withCorner(shape, value));
      if (key === 'axes') restyle((shape) => shape.shape === 'ellipse', (shape) => withAxes(shape, value));
      if (key === 'axis') restyle(isLinearMeasure, (shape) => withDimAxis(shape, value));
      updateToolbar();
      requestLive();
    }
    /** Przycisk wyboru z napisem (segmenty trzeciego menu). */
    const segmentButton = (label, checked, testID, onClick, extra = {}) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(checked), dataset: { testid: testID }, onClick, ...extra
    }, label);
    /** Wybór liczby boków wielokąta foremnego (od 1.40). */
    function sidesTiles(value) {
      return h('div', { class: 'drawing__segmented drawing__segmented--wrap', role: 'radiogroup', 'aria-label': 'Liczba boków' }, NGON_SIDES.map((sides) => segmentButton(
        String(sides), sides === value, `drawing-sides-${sides}`, () => pickStyle('sides', sides), { 'aria-label': plural(sides, 'bok', 'boki', 'boków') })));
    }
    /** Narożniki prostokąta (od 1.40): ostre, zaokrąglenie, faza; wielkość – gotowa albo wpisana w jednostkach rysunku. */
    function cornerTiles(value) {
      const current = cornerOfKey(value);
      const kind = value === null ? null : current?.kind ?? 'none';
      const size = current?.size ?? tools.rectCorner?.size ?? CORNER_SIZES[0];
      const format = dimFormat(drawing);
      const kinds = styleChoices(['none', 'round', 'chamfer'], CORNER_ICONS, CORNER_CHOICE_LABELS, kind, 'drawing-corner',
        (next) => pickStyle('corner', next === 'none' ? null : { kind: next, size }));
      if (!current) return kinds;
      const factor = toScaleLength(1, drawing.scale) * dimFactor(drawing.scale, format);
      const input = h('input', {
        type: 'text', inputmode: 'decimal', class: 'drawing__corner-size', value: formatNumber(current.size * factor), 'aria-label': `${CORNER_CHOICE_LABELS[current.kind]} – wielkość`,
        dataset: { testid: 'drawing-corner-size' },
        onChange: (event) => {
          const typed = parseDecimal(event.currentTarget.value);
          if (typed !== null && typed > 0) pickStyle('corner', { kind: current.kind, size: Math.round((typed / factor) * 100) / 100 });
          else event.currentTarget.value = formatNumber(current.size * factor);
        }
      });
      return h('div', { class: 'drawing__corner' }, kinds,
        h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Wielkość narożnika' }, CORNER_SIZES.map((preset) => segmentButton(
          lengthText(preset, drawing.scale, format), Math.abs(preset - current.size) < 0.01, `drawing-corner-${preset}`, () => pickStyle('corner', { kind: current.kind, size: preset })))),
        h('label', { class: 'drawing__corner-field' }, current.kind === 'round' ? 'R' : 'Faza', input, h('span', {}, dimUnitLabel(drawing.scale, format))));
    }
    /** Kreskowanie (od 1.40): kąt linii, odstęp i krzyżowe – pod wyborem wypełnienia. */
    function hatchTiles(hatch) {
      return h('div', { class: 'drawing__hatch' },
        h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Kąt kreskowania' }, HATCH_ANGLES.map((angle) => segmentButton(
          `${angle}°`, hatch?.angle === angle, `drawing-hatch-angle-${angle}`, () => pickStyle('hatch', { angle })))),
        h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Odstęp linii' }, HATCH_GAPS.map((gap) => segmentButton(
          HATCH_GAP_LABELS[gap], hatch?.gap === gap, `drawing-hatch-gap-${gap}`, () => pickStyle('hatch', { gap })))),
        h('button', {
          type: 'button', class: 'drawing__chip', 'aria-pressed': String(Boolean(hatch?.cross)), dataset: { testid: 'drawing-hatch-cross' },
          onClick: () => pickStyle('hatch', { cross: !hatch?.cross })
        }, 'Krzyżowe'));
    }
    /** Przyciski wyboru jednej grupy stylu (ikony; zakończenia – początek i koniec, wypełnienie – napisy). */
    function styleTiles(key, value) {
      if (key === 'mark') return styleChoices(POINT_MARKS, MARK_ICONS, POINT_MARK_LABELS, value, 'drawing-mark-default', (mark) => pickStyle('mark', mark));
      if (key === 'dash') return styleChoices(SHAPE_DASHES, DASH_ICONS, SHAPE_DASH_LABELS, value, 'drawing-dash-default', (dash) => pickStyle('dash', dash));
      if (key === 'caps') {
        const before = { ...value };
        return capChoices({ ...value }, 'drawing-caps-default', (caps) => {
          const which = caps.start !== before.start ? 'start' : 'end';
          pickStyle('caps', caps[which], which);
        });
      }
      if (key === 'sides') return sidesTiles(value);
      if (key === 'corner') return cornerTiles(value);
      if (key === 'axes') {
        return h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Osie okręgu' }, [[false, 'Bez osi', 'off'], [true, 'Osie', 'on']].map(([axes, label, id]) => segmentButton(
          label, value === axes, `drawing-axes-${id}`, () => pickStyle('axes', axes))));
      }
      if (key === 'axis') {
        return h('div', { class: 'drawing__segmented', role: 'radiogroup', 'aria-label': 'Kierunek wymiaru' }, DIM_AXES.map((axis) => segmentButton(
          DIM_AXIS_LABELS[axis], value === axis, `drawing-axis-${axis}`, () => pickStyle('axis', axis))));
      }
      const fills = h('div', { class: 'drawing__segmented drawing__segmented--wrap', role: 'radiogroup', 'aria-label': 'Wypełnienie' }, SHAPE_FILLS.map((fill) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(fill === value), dataset: { testid: `drawing-fill-default-${fill}` },
        onClick: () => pickStyle('fill', fill)
      }, SHAPE_FILL_LABELS[fill])));
      if (value !== 'hatch') return fills;
      const state = styleState();
      return h('div', { class: 'drawing__fill' }, fills, state ? hatchTiles(hatchState(state)) : null);
    }
    /**
     * Trzecie menu kształtów: jedna grupa (znacznik punktu, rodzaj linii prostej i łuku) – od razu jej przyciski;
     * kilka – przyciski z wybraną wartością, które rozwijają wybór w dół; ⓘ – przełączniki i opis (panel kształtów).
     */
    function renderStyleRow() {
      const state = styleState();
      const editing = Boolean(state?.targets.length);
      const shown = state && (editing || toolInMenu) ? state : null;
      const keys = shown ? Object.keys(shown.values).filter((key) => shown.values[key] !== undefined) : [];
      const info = tool === 'shape' && toolInMenu;
      const key = JSON.stringify([keys, shown?.values ?? null, openPicker, info, tools.shape, shapePanel.hidden]);
      styleRow.hidden = keys.length === 0 && !info;
      if (openPicker && !keys.includes(openPicker)) openPicker = null;
      renderStyleDrop(shown);
      if (key === styleKey) return;
      styleKey = key;
      const inline = keys.length === 1 && (keys[0] === 'mark' || keys[0] === 'dash');
      const parts = inline ? [styleTiles(keys[0], state.values[keys[0]])] : keys.map((name) => h('button', {
        type: 'button', class: 'drawing__mode drawing__picker', 'aria-haspopup': 'true', 'aria-expanded': String(openPicker === name),
        'aria-label': `${STYLE_LABELS[name]} – wybór`, title: STYLE_LABELS[name], dataset: { testid: `drawing-style-${name}` },
        onClick: () => {
          const next = openPicker === name ? null : name;
          closeSettings();
          openPicker = next;
          updateToolbar();
        }
      }, icon(styleIcon(name, state.values[name]), { size: 20 }), h('span', { class: 'drawing__picker-label' }, styleLabel(name, state.values[name])), icon('chevronDown', { size: 12 })));
      replaceChildren(styleRow, parts, info ? h('button', {
        type: 'button', class: 'drawing__mode drawing__style-info', 'aria-expanded': String(!shapePanel.hidden), 'aria-label': 'Więcej – przełączniki i opis', title: 'Więcej',
        dataset: { testid: 'drawing-style-info' }, onClick: () => toggleShapePanel()
      }, icon('info', { size: 18 })) : null);
    }
    /** Rozwinięty wybór grupy stylu pod trzecim menu. */
    function renderStyleDrop(state) {
      styleDrop.hidden = !openPicker || !state;
      if (styleDrop.hidden) return;
      replaceChildren(styleDrop, h('p', { class: 'drawing__settings-label' }, styleLabel(openPicker, state.values[openPicker])), styleTiles(openPicker, state.values[openPicker]));
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
    /** Zakończenia nowego odcinka, strzałki albo (od 1.27) strzałki po łuku – wybrane w panelu kształtów. */
    const CAPS_KEYS = { line: 'lineCaps', arrow: 'arrowCaps', curve: 'curveCaps' };
    const segmentDefaultCaps = () => ({ ...tools[CAPS_KEYS[tools.shape] ?? 'lineCaps'] });
    /**
     * Wybór stylu (od 1.27): rodzaju linii albo znacznika punktu – przyciski z ikoną (nazwa wybranego –
     * w nagłówku nad nimi, każda – w podpowiedzi i dla czytnika ekranu). onPick(wartość).
     */
    function styleChoices(values, icons, labels, current, testID, onPick) {
      return h('div', { class: 'drawing__styles', role: 'radiogroup' }, values.map((value) => h('button', {
        type: 'button', class: 'drawing__style', role: 'radio', 'aria-checked': String(value === current), 'aria-label': labels[value], title: labels[value],
        dataset: { testid: `${testID}-${value}` },
        onClick: () => onPick(value)
      }, icon(icons[value], { size: 28 }))));
    }
    /** Zmiana stylu zaznaczonych kształtów spełniających `test` – jeden krok cofania. */
    function restyle(test, change) {
      changeSelection((stroke) => isShape(stroke) && test(stroke), change);
    }
    /**
     * Wybór zakończeń odcinka (od 1.19): dwa wiersze – początek i koniec – po sześć przycisków z ikoną.
     * onPick({ start, end }) po każdej zmianie.
     */
    function capChoices(caps, testID, onPick) {
      const row = (which, label) => h('div', { class: 'drawing__caps-row' },
        h('span', { class: 'drawing__caps-label' }, label),
        h('div', { class: 'drawing__caps', role: 'radiogroup', 'aria-label': `${label} linii` }, SEGMENT_CAPS.map((cap) => h('button', {
          type: 'button', class: `drawing__cap${which === 'start' ? ' drawing__cap--start' : ''}`, role: 'radio', 'aria-checked': String(caps[which] === cap),
          'aria-label': `${label}: ${SEGMENT_CAP_LABELS[cap].toLowerCase()}`, title: SEGMENT_CAP_LABELS[cap], dataset: { testid: `${testID}-${which}-${cap}` },
          onClick: (event) => {
            caps[which] = cap;
            for (const button of event.currentTarget.parentNode.children) button.setAttribute('aria-checked', String(button === event.currentTarget));
            onPick({ ...caps });
          }
        }, icon(CAP_ICONS[cap], { size: 22 })))));
      return h('div', { class: 'drawing__caps-group' }, row('start', 'Początek'), row('end', 'Koniec'));
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
        panelTitle('Liniuszek'),
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

    const topBar = h('div', { class: 'drawing__top' }, toolbar, choices, styleDrop, topHandle, settings, colorPanel, shapePanel);
    // Kółka pod menu – położenie jeszcze raz po animacji chowania i pokazywania menu (od 1.39).
    topBar.addEventListener('transitionend', (event) => {
      if (event.target === topBar) placeRingTop();
    });
    // Od 1.35 panele narzędzi ogólnych (linijka i skala, tło, liniuszek) – nad dolnym paskiem.
    dock.prepend(rulerPanel, paperPanel, guidePanel, layersPanel);
    function toggleSettings() {
      const open = settings.hidden;
      closeSettings();
      settings.hidden = !open;
      renderSettings();
    }
    /** Zamyka panele pod paskiem: ustawienia pióra, własny kolor (i pipetkę), linijkę i skalę. */
    // ---- warstwy (od 1.36): tło, obraz i warstwy elementów; sygnatury zaznaczonych (rząd 1–3)
    const layersNow = () => drawingLayers(drawing);
    /** Element poza ukrytymi warstwami – tylko takie można zaznaczyć, zetrzeć i do nich przyciągać. */
    const isShown = (stroke) => !strokeEffect(layersNow(), stroke).hidden;
    const someHidden = () => layersNow().some((layer) => layer.hidden && layer.id > PHOTO_LAYER);
    const shownStrokes = () => (someHidden() ? drawing.strokes.filter(isShown) : drawing.strokes);
    const shownIndexes = (indexes) => (someHidden() ? indexes.filter((index) => isShown(drawing.strokes[index])) : indexes);
    /** Nowy element – na warstwie, na której się rysuje (warstwa 1 – bez sygnatur). */
    function onActiveLayer(stroke) {
      const id = drawing.activeLayer ?? 1;
      if (stroke && id !== 1 && !stroke.layers) stroke.layers = [id];
      return stroke;
    }
    function toggleLayersPanel() {
      const open = layersPanel.hidden;
      closeSettings();
      if (open) {
        layersPanel.hidden = false;
        renderLayersPanel();
      }
      updateToolbar();
    }
    function openLayersPanel() {
      if (layersPanel.hidden) toggleLayersPanel();
    }
    /** Zaznaczone całe elementy – im nadaje się sygnatury. */
    const layerTargets = () => (snip || selectionKind !== 'whole' ? [] : [...selection].filter((stroke) => drawing.strokes.includes(stroke)));
    /** Nowe warstwy rysunku; `quiet` – bez przebudowy panelu (suwak w trakcie przeciągania). */
    function setLayers(next, quiet = false) {
      drawing.layers = next;
      changed = true;
      // Zaznaczone elementy na ukrytej warstwie przestają być zaznaczone.
      if (selection.size > 0 && someHidden()) {
        const kept = [...selection].filter(isShown);
        if (kept.length !== selection.size) selection = new Set(kept);
      }
      requestRender();
      updateToolbar();
      if (!quiet) renderLayersPanel();
    }
    /** Sygnatury zaznaczonych: rząd `rank` (0–2) – warstwa `id` albo (rząd 2 i 3) null – bez niej. */
    function signSelection(rank, id) {
      changeSelection(() => true, (stroke) => {
        const ids = [...layersOf(stroke)];
        if (id === null) ids.splice(rank, 1);
        else if (rank < ids.length) ids[rank] = id;
        else ids.push(id);
        return withSignatures(stroke, ids);
      }, layerTargets());
      changed = true;
      renderLayersPanel();
    }
    /** Suwak 0–100 % (krycie, nasycenie) z wartością obok. */
    function percentSlider(label, value, testID, onInput) {
      const output = h('span', { class: 'drawing__layer-value' }, `${value}%`);
      const input = h('input', {
        type: 'range', class: 'drawing__range', min: 0, max: 100, step: 5, value: String(value), 'aria-label': label, dataset: { testid: testID },
        onInput: (event) => {
          output.textContent = `${event.target.value}%`;
          onInput(Number(event.target.value), true);
        },
        onChange: (event) => onInput(Number(event.target.value), false)
      });
      return h('label', { class: 'drawing__layer-slider' }, h('span', { class: 'drawing__layer-label' }, label), input, output);
    }
    function layerRow(layer) {
      const fixed = layer.id <= PHOTO_LAYER;
      const change = (fields, quiet = false) => setLayers(updateLayer(layersNow(), layer.id, fields), quiet);
      const count = fixed ? null : layerUse(drawing.strokes, layer.id);
      const activeId = drawing.activeLayer ?? 1;
      const head = h('div', { class: 'drawing__layer-head' },
        fixed ? h('span', { class: 'drawing__layer-mark', 'aria-hidden': 'true' }, icon(layer.id === BACKGROUND_LAYER ? 'paper' : 'image', { size: 16 }))
          : h('button', {
            type: 'button', class: 'drawing__layer-active', role: 'radio', 'aria-checked': String(layer.id === activeId),
            'aria-label': `Rysuj na warstwie „${layer.name}”`, title: 'Nowe elementy na tej warstwie', dataset: { testid: `drawing-layer-active-${layer.id}` },
            onClick: () => {
              if (layer.id === 1) delete drawing.activeLayer;
              else drawing.activeLayer = layer.id;
              changed = true;
              updateToolbar();
              renderLayersPanel();
            }
          }),
        h('button', {
          type: 'button', class: 'drawing__layer-eye', 'aria-pressed': String(!layer.hidden), 'aria-label': `${layer.hidden ? 'Pokaż' : 'Ukryj'} „${layer.name}”`,
          title: layer.hidden ? 'Pokaż' : 'Ukryj', dataset: { testid: `drawing-layer-eye-${layer.id}` }, onClick: () => change({ hidden: !layer.hidden })
        }, icon(layer.hidden ? 'eyeOff' : 'eye', { size: 18 })),
        fixed ? h('span', { class: 'drawing__layer-name' }, layer.name)
          : h('input', {
            type: 'text', class: 'drawing__layer-name', value: layer.name, maxLength: LAYER_NAME_MAX, 'aria-label': `Nazwa warstwy ${layer.id}`,
            dataset: { testid: `drawing-layer-name-${layer.id}` }, onChange: (event) => change({ name: event.target.value })
          }),
        count === null ? null : h('span', { class: 'drawing__layer-count', title: 'Elementy z tą warstwą', dataset: { testid: `drawing-layer-count-${layer.id}` } }, String(count)),
        !fixed && layer.id > 1 && count === 0 ? h('button', {
          type: 'button', class: 'drawing__layer-remove', 'aria-label': `Usuń warstwę „${layer.name}”`, title: 'Usuń pustą warstwę',
          dataset: { testid: `drawing-layer-remove-${layer.id}` },
          onClick: () => {
            if (drawing.activeLayer === layer.id) delete drawing.activeLayer;
            setLayers(removeLayer(layersNow(), drawing.strokes, layer.id));
          }
        }, icon('trash', { size: 16 })) : null);
      return h('div', { class: `drawing__layer${layer.hidden ? ' drawing__layer--hidden' : ''}`, dataset: { testid: `drawing-layer-${layer.id}` } }, head,
        h('div', { class: 'drawing__layer-sliders' },
          percentSlider('Krycie', layer.opacity, `drawing-layer-opacity-${layer.id}`, (value, quiet) => change({ opacity: value }, quiet)),
          percentSlider('Nasycenie', layer.saturation, `drawing-layer-saturation-${layer.id}`, (value, quiet) => change({ saturation: value }, quiet))));
    }
    /** Wybór warstwy jednego rzędu sygnatur zaznaczonych (różne – „różne”). */
    function signatureSelect(rank, targets, layers) {
      const values = targets.map((stroke) => layersOf(stroke)[rank] ?? null);
      const same = values.every((value) => value === values[0]) ? values[0] : undefined;
      const options = [
        ...(same === undefined ? [h('option', { value: 'mixed', disabled: true, selected: true }, 'różne')] : []),
        ...(rank > 0 ? [h('option', { value: '', selected: same === null }, '—')] : []),
        ...layers.map((layer) => h('option', { value: String(layer.id), selected: same === layer.id }, layer.name))
      ];
      return h('label', { class: 'drawing__sign' }, h('span', { class: 'drawing__layer-label' }, `Rząd ${rank + 1}`),
        h('select', {
          class: 'drawing__sign-select', 'aria-label': `Warstwa rzędu ${rank + 1}`, dataset: { testid: `drawing-sign-${rank + 1}` },
          onChange: (event) => signSelection(rank, event.target.value === '' ? null : Number(event.target.value))
        }, options));
    }
    function renderLayersPanel() {
      if (layersPanel.hidden) return;
      const layers = layersNow();
      const elements = elementLayers(layers);
      const targets = layerTargets();
      const parts = [panelTitle('Warstwy')];
      if (targets.length > 0) {
        parts.push(h('div', { class: 'drawing__signs', dataset: { testid: 'drawing-signs' } },
          h('p', { class: 'drawing__settings-label' }, `Zaznaczone (${targets.length}) – sygnatury`),
          h('div', { class: 'drawing__sign-row' }, Array.from({ length: SIGNATURE_LIMIT }, (_, rank) => signatureSelect(rank, targets, elements)))));
      }
      parts.push(h('div', { class: 'drawing__layer-list', role: 'radiogroup', 'aria-label': 'Warstwa nowych elementów' }, elements.map(layerRow)));
      parts.push(h('button', {
        type: 'button', class: 'drawing__chip drawing__layer-add', disabled: elements.length >= LAYER_LIMIT, dataset: { testid: 'drawing-layer-add' },
        onClick: () => setLayers(addLayer(layersNow()))
      }, '+ Dodaj warstwę'));
      parts.push(h('p', { class: 'drawing__settings-label' }, 'Poziomy stałe'));
      parts.push(h('div', { class: 'drawing__layer-list' }, layers.filter((layer) => layer.id === BACKGROUND_LAYER || (layer.id === PHOTO_LAYER && drawing.photo)).map(layerRow)));
      parts.push(h('p', { class: 'field__hint' }, 'Kółko – warstwa nowych elementów. Element ma do trzech warstw (sygnatur): rząd 1 – główna, rząd 2 i 3 – '
        + 'dodatkowe. Działają kaskadowo: ukryta którakolwiek – element ukryty, krycie i nasycenie się mnożą. Tło – papier, kratka i szablon; '
        + 'obraz – zdjęcie pod rysunkiem. Obraz w notatce i plik PDF wyglądają tak samo.'));
      replaceChildren(layersPanel, parts);
    }
    function closeSettings() {
      openPicker = null;
      styleDrop.hidden = true;
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
      layersPanel.hidden = true;
    }
    const panelOpen = () => [settings, colorPanel, rulerPanel, paperPanel, shapePanel, guidePanel, layersPanel].some((panel) => !panel.hidden);
    /**
     * Tytuł panelu pod paskiem z przyciskiem zamknięcia (od 1.25) – na telefonie panel zakrywa stronę,
     * a dotknięcie obok niego wymagało celowania w odsłonięty skrawek strony.
     */
    function panelTitle(text) {
      return h('div', { class: 'drawing__settings-head' },
        h('h3', { class: 'drawing__settings-title' }, text),
        // Od 1.29: ⓘ chowa i pokazuje podpowiedzi (gdy panel je ma).
        hintsToggle(),
        h('button', {
          type: 'button', class: 'drawing__settings-close', 'aria-label': 'Zamknij panel', title: 'Zamknij', dataset: { testid: 'drawing-panel-close' },
          onClick: () => {
            closeSettings();
            updateToolbar();
            requestLive();
          }
        }, icon('close', { size: 18 })));
    }

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

    // ---- kartki (od 1.19): kilka rysunków w jednym oknie – po „Gotowe” każda kartka to osobny rysunek notatki;
    // od 1.30 kartki to rysunki notatki (albo jej zdjęcia), przewracane jak w zeszycie
    /**
     * Kartka: { title, sheet, added, drawing, history, media, changed, ready, loaded } – sheet: kartka
     * z sheets (dodana – null), drawing – null, dopóki zdjęcie się nie wczyta; ready – obietnica
     * wczytania obrazów (zdjęcie, szablon), loaded – już wczytane.
     */
    function makePage(pageDrawing, { history: pageHistory = null, title: name, sheet = null, added = false }) {
      const page = { title: name, sheet, added, drawing: null, history: null, media: { photo: null, template: null }, changed: false, ready: null, loaded: false };
      if (pageDrawing) fillPage(page, pageDrawing, pageHistory);
      return page;
    }
    function fillPage(page, pageDrawing, pageHistory = null) {
      page.drawing = pageDrawing;
      page.history = pageHistory ?? new DrawingHistory(pageDrawing.strokes);
      loadMedia(page);
    }
    /** Wczytuje zdjęcie i szablon kartki (po zwolnieniu – od nowa); zwraca obietnicę. */
    function loadMedia(page) {
      const media = page.media;
      const loaded = (key) => (image) => {
        media[key] = image;
        if (page === pages[pageIndex] && page.media === media) requestRender();
      };
      const ready = Promise.all([loadPicture(page.drawing.photo).then(loaded('photo')), loadPicture(page.drawing.template).then(loaded('template'))]);
      page.ready = ready;
      ready.then(() => {
        if (page.ready === ready) page.loaded = true;
      });
      return ready;
    }
    /** Kartka gotowa do pokazania (od 1.30): rysunek (zdjęcie – wczytane dopiero teraz) i jego obrazy. */
    function preparePage(page) {
      if (page.drawing) return page.ready ?? loadMedia(page);
      page.preparing ??= (async () => {
        const loaded = await page.sheet.load();
        if (!page.drawing) fillPage(page, sheetDrawing(loaded));
        await page.ready;
      })().finally(() => {
        page.preparing = null;
      });
      return page.preparing;
    }
    /**
     * Zdjęcia kartek dalej niż sąsiednie zwalniają pamięć (od 1.30 – na iPhonie notatka może mieć
     * wiele zdjęć); sąsiednie wczytują się zawczasu, żeby kartka przewracała się od razu.
     */
    function settlePages() {
      pages.forEach((page, index) => {
        const near = Math.abs(index - pageIndex) <= 1;
        if (near && page.sheet?.load && !page.drawing) preparePage(page).catch(() => {});
        if (!near && page.drawing && (page.drawing.photo || page.drawing.template) && page.ready) {
          page.media = { photo: null, template: null };
          page.ready = null;
          page.loaded = false;
        }
      });
    }
    const pageTitle = () => pages[pageIndex]?.title ?? title;
    function updatePagePill() {
      pageText.textContent = `Kartka ${pageIndex + 1} z ${pages.length}`;
      // Przy zdjęciach (od 1.30) bez „Nowej kartki” – menu kartek tylko przy kilku.
      pagePill.hidden = !newPages && pages.length < 2;
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
      settlePages();
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
     * Przejście na kartkę `index` z animacją (od 1.22; od 1.24 jak w notatkach): kartka zagina się od
     * prawego dolnego rogu i przewraca w lewo (grzbiet z lewej) – następna leży pod nią; poprzednia
     * wraca tą samą drogą nad bieżącą. Geometria zgięcia – core/page-curl.js. Zdjęcia obu stron
     * (zapisane kreski) w widoku całej strony rysuje osobne płótno nad stroną; bez animacji, gdy system
     * prosi o ograniczenie ruchu.
     */
    const FLIP_MS = 900;
    let flipping = null;
    /** Kartka, na którą edytor przejdzie po jej wczytaniu (od 1.30 – zdjęcie albo szablon jeszcze się wczytuje). */
    let flipWanted = null;
    function flipTo(index) {
      if (index === pageIndex || index < 0 || index >= pages.length || active) return;
      const target = pages[index];
      if (!target.drawing || !target.loaded) {
        flipWanted = index;
        preparePage(target).then(() => {
          if (flipWanted !== index) return;
          flipWanted = null;
          flipTo(index);
        }, () => {
          if (flipWanted === index) flipWanted = null;
          flash(`Nie udało się otworzyć: ${target.title}.`);
        });
        return;
      }
      flipWanted = null;
      // Kolejne dotknięcie w trakcie animacji – poprzednia kończy się od razu.
      if (flipping) {
        flipping = null;
        flipCanvas.hidden = true;
      }
      const motion = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && base.width > 0;
      let before = null;
      if (motion) {
        // Bieżąca kartka w widoku całej strony (jak następna po przejściu) – inaczej powiększone zdjęcie
        // nie pasowałoby do strony pod spodem.
        if (view.zoom !== 1) {
          view.zoom = 1;
          view.width = 0;
          resize();
          zoomButton.textContent = '100%';
        }
        renderBase();
        before = snapshotPage();
      }
      const forward = index > pageIndex;
      showPage(index);
      if (!motion) return;
      renderBase();
      flipping = { forward, before, after: snapshotPage(), start: performance.now() };
      playPage({ land: FLIP_MS, direction: forward ? 1 : -1 });
      flipCanvas.width = base.width;
      flipCanvas.height = base.height;
      flipCanvas.hidden = false;
      coilsOnFlip = true;
      renderLive();
      // Pierwsza klatka od razu – inaczej przez chwilę widać już nową kartkę.
      stepFlip(flipping.start);
    }
    /** Zdjęcie strony z płótna zapisanych kresek: { image, rect } – rect w pikselach urządzenia. */
    function snapshotPage() {
      const rect = {
        x: Math.round(view.x * view.dpr), y: Math.round(view.y * view.dpr),
        w: Math.max(1, Math.round(drawing.width * view.scale * view.dpr)), h: Math.max(1, Math.round(drawing.height * view.scale * view.dpr))
      };
      const image = document.createElement('canvas');
      image.width = rect.w;
      image.height = rect.h;
      image.getContext('2d').drawImage(base, -rect.x, -rect.y);
      return { image, rect };
    }
    const easeFlip = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((2 - 2 * t) ** 3) / 2);
    function stepFlip(now) {
      if (!flipping) return;
      const t = Math.min(1, (now - flipping.start) / FLIP_MS);
      const ctx = flipCanvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, flipCanvas.width, flipCanvas.height);
      const { forward, before, after } = flipping;
      // Spirala zostaje na miejscu (od 1.24.1): nad płaską częścią kartki, pod przewracanym płatem (od 1.25.1).
      const coils = () => {
        ctx.save();
        ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.x, view.dpr * view.y);
        paintCoils(ctx);
        ctx.restore();
      };
      if (forward) {
        // Następna: pod spodem (na płótnie strony) już nowa kartka, stara przewraca się w lewo.
        paintTurn(ctx, before, easeFlip(t), coils);
      } else {
        // Poprzednia: pod spodem stara kartka, nowa wraca z lewej (róg od przewróconego położenia).
        ctx.drawImage(before.image, before.rect.x, before.rect.y);
        paintTurn(ctx, after, 1 - easeFlip(t), coils);
      }
      if (t < 1) {
        requestAnimationFrame(stepFlip);
      } else {
        flipping = null;
        flipCanvas.hidden = true;
        coilsOnFlip = false;
        renderLive();
      }
    }
    /** Pole wielokąta [{ x, y }, …]. */
    const polygonArea = (polygon) => Math.abs(polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0)) / 2;
    /**
     * Płat przewracanej kartki znika (od 1.25.1), gdy zgięcie dochodzi do grzbietu: płaska część kartki
     * mniejsza niż ta część strony – płat coraz bardziej przezroczysty, spirala wychodzi spod niego.
     * Od 1.26 później (5% zamiast 18%) – płat widać prawie do końca przewracania.
     */
    const FLAP_FADE = 0.05;
    /** Ścieżka wielokąta [{ x, y }, …]. */
    function polygonPath(ctx, polygon) {
      ctx.beginPath();
      polygon.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.closePath();
    }
    /**
     * Pas cienia albo światła wzdłuż zgięcia: od punktu zgięcia w kierunku `normal` przez `thickness`
     * pikseli, kolory `stops` [[miejsce 0–1, kolor], …], przezroczystość `alpha` (wypełnia przycięty obszar).
     */
    function foldBand(ctx, origin, normal, thickness, stops, alpha, extent) {
      if (alpha <= 0 || thickness <= 0) return;
      const gradient = ctx.createLinearGradient(origin.x, origin.y, origin.x + normal.x * thickness, origin.y + normal.y * thickness);
      for (const [offset, color] of stops) gradient.addColorStop(offset, color);
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = gradient;
      ctx.fillRect(-extent, -extent, extent * 3, extent * 3);
      ctx.restore();
    }
    // Pasy jak w notatkach (css .note-curl__band): cień na stronie pod spodem, przy zgięciu na płaskiej części
    // i jasne zaokrąglenie papieru na płacie.
    const CAST_STOPS = [[0, 'rgba(0,0,0,0.3)'], [0.08, 'rgba(0,0,0,0.22)'], [0.2, 'rgba(0,0,0,0.14)'], [0.38, 'rgba(0,0,0,0.07)'], [0.62, 'rgba(0,0,0,0.025)'], [1, 'rgba(0,0,0,0)']];
    const FOLD_STOPS = [[0, 'rgba(0,0,0,0.24)'], [0.15, 'rgba(0,0,0,0.15)'], [0.4, 'rgba(0,0,0,0.07)'], [0.7, 'rgba(0,0,0,0.02)'], [1, 'rgba(0,0,0,0)']];
    const LIGHT_STOPS = [
      [0, 'rgba(0,0,0,0.1)'], [0.05, 'rgba(255,255,255,0.9)'], [0.13, 'rgba(255,255,255,0.4)'], [0.3, 'rgba(255,255,255,0)'],
      [0.45, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,0.025)'], [1, 'rgba(0,0,0,0.05)']
    ];
    /**
     * Kartka `page` ({ image, rect }) w trakcie przewracania (progress 0 – płasko, 1 – przewrócona):
     * róg dolny prawy idzie łukiem w lewo, płaska część zostaje, zagięty płat (odwrót – jasny papier,
     * przez który lekko prześwituje rysunek w lustrze) leży odbity względem zgięcia; cień pada na stronę
     * pod spodem. Od 1.25.1 płat przechodzi nad spiralę i poza ekran, a znika płynnie, gdy zgięcie
     * dochodzi do grzbietu; `between` – rysowane nad płaską częścią, pod płatem (zwoje spirali).
     */
    function paintTurn(ctx, page, progress, between = () => {}) {
      const { image, rect } = page;
      const [width, height] = [rect.w, rect.h];
      const corner = cornerOf('bottom', width, height);
      const point = constrainCorner({ width, height, corner, point: cornerPath(corner, width, height, progress) });
      const geometry = foldGeometry({ width, height, corner, point });
      ctx.save();
      ctx.translate(rect.x, rect.y);
      if (!geometry) {
        if (progress < 0.5) ctx.drawImage(image, 0, 0);
        ctx.restore();
        between();
        return;
      }
      const extent = Math.max(width, height) * 2;
      const lift = Math.sin(Math.PI * geometry.progress);
      const away = { x: -geometry.normal.x, y: -geometry.normal.y };
      // Płaska część kartki z cieniem przy zgięciu.
      ctx.save();
      polygonPath(ctx, geometry.flat);
      ctx.clip();
      ctx.drawImage(image, 0, 0);
      foldBand(ctx, geometry.point, away, width * (0.03 + 0.12 * lift), FOLD_STOPS, lift * 2, extent);
      ctx.restore();
      // Cień płata na stronie pod spodem (odsłonięta część).
      ctx.save();
      polygonPath(ctx, geometry.folded);
      ctx.clip();
      foldBand(ctx, geometry.point, geometry.normal, width * (0.04 + 0.2 * lift), CAST_STOPS, lift * 1.6, extent);
      ctx.restore();
      ctx.restore();
      // Między płaską częścią a płatem – zwoje spirali (kartka obraca się wokół nich).
      between();
      // Płat (od 1.25.1 bez przycinania przy grzbiecie): przewraca się nad spiralę i dalej poza ekran,
      // a gdy zgięcie dochodzi do grzbietu – płynnie znika (spirala wychodzi spod niego).
      const flatShare = polygonArea(geometry.flat) / (width * height);
      const vanish = Math.min(1, Math.max(0, (FLAP_FADE - flatShare) / FLAP_FADE));
      const fade = 1 - vanish * vanish * (3 - 2 * vanish);
      if (fade <= 0.001) return;
      ctx.save();
      ctx.translate(rect.x, rect.y);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 6 * view.dpr;
      ctx.shadowOffsetY = 2 * view.dpr;
      polygonPath(ctx, geometry.flap);
      ctx.fillStyle = '#f7f7f8';
      ctx.fill();
      ctx.restore();
      polygonPath(ctx, geometry.flap);
      ctx.clip();
      ctx.save();
      ctx.globalAlpha = 0.12 * fade;
      ctx.transform(...geometry.reflection);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
      const depth = Math.max(1, ...geometry.folded.map((vertex) => (vertex.x - geometry.point.x) * geometry.normal.x + (vertex.y - geometry.point.y) * geometry.normal.y));
      foldBand(ctx, geometry.point, away, depth + 1, LIGHT_STOPS, lift * 2.5 * fade, extent);
      ctx.restore();
    }

    /**
     * Nowa kartka za ostatnią: to samo tło (zdjęcie – kratka), jasność linii i skala, bez szablonu. Od 1.30
     * tylko przy rysunkach (przy zdjęciach kartki to zdjęcia notatki) i dopóki notatka ma miejsce na obraz.
     */
    function addPage() {
      if (!newPages) return;
      const added = pages.filter((page) => page.added).length;
      if (added >= pageRoom) {
        flash('Notatka nie ma już miejsca na kolejny rysunek (najwyżej 30 obrazów).');
        return;
      }
      const next = {
        ...emptyDrawing({ paper: drawing.photo ? 'grid' : drawing.paper }), paperLevel: drawing.paperLevel ?? DEFAULT_PAPER_LEVEL, scale: { ...drawing.scale },
        ...(drawing.dimStyle ? { dimStyle: drawing.dimStyle } : {}),
        ...(drawing.dimUnit ? { dimUnit: drawing.dimUnit } : {})
      };
      pages.push(makePage(next, { title: addedTitle?.(added + 1) ?? `Kartka ${pages.length + 1}`, added: true }));
      showPage(pages.length - 1);
      flash(`${pageTitle()} – po „Gotowe” trafi do notatki jako osobny rysunek.`);
    }
    /** Usuwa dodaną kartkę (rysunki notatki zostają); kartka z kreskami – po potwierdzeniu. */
    async function deletePage() {
      const index = pageIndex;
      if (!pages[index].added) return;
      if (hasContent(drawing) && !(await confirmDialog({
        title: `Usunąć kartkę ${index + 1}?`, message: 'Kreski z tej kartki przepadną.', confirmLabel: 'Usuń', cancelLabel: 'Zostaw', destructive: true
      }))) return;
      // Na sąsiednią kartkę (wczytaną – sąsiednie wczytują się zawczasu); poprzednia zostaje na swoim miejscu.
      const neighbour = pages[index - 1]?.drawing ? index - 1 : index + 1;
      showPage(neighbour);
      pages.splice(index, 1);
      if (neighbour > index) pageIndex -= 1;
      updatePagePill();
    }
    function openPageMenu() {
      const added = pages[pageIndex].added;
      openMenu({
        title: 'Kartki',
        items: [
          newPages ? { label: 'Nowa kartka', icon: 'plus', testID: 'drawing-page-new', onSelect: () => addPage() } : null,
          newPages && pages.length > 1 ? 'separator' : null,
          ...(pages.length > 1 ? pages.map((page, index) => ({
            label: `Kartka ${index + 1} – ${page.title}`, checked: index === pageIndex, testID: `drawing-page-${index + 1}`,
            onSelect: () => flipTo(index)
          })) : []),
          // Od 1.37: rysunek z pliku DXF i kartka jako DXF.
          'separator',
          { label: 'Wczytaj DXF…', icon: 'upload', testID: 'drawing-dxf-import', onSelect: () => importDxf() },
          { label: 'Zapisz kartkę jako DXF', icon: 'download', testID: 'drawing-dxf-export', onSelect: () => exportDxf() },
          // Od 1.41: ramka rysunkowa z tabliczką (kartka bez zdjęcia).
          drawing.photo ? null : {
            label: drawing.frame ? `Ramka rysunkowa ${FRAME_FORMATS[drawing.frame.format].label}…` : 'Ramka rysunkowa…', icon: 'titleBlock', testID: 'drawing-frame', onSelect: () => editFrame()
          },
          // Od 1.44: układ kartki – A3, PDCA, macierz 2×2, Kanban, pokrewieństwo.
          drawing.photo ? null : {
            label: drawing.layout ? `Układ kartki: ${LAYOUT_LABELS[drawing.layout.kind]}…` : 'Układ kartki…', icon: 'pageLayout', testID: 'drawing-layout', onSelect: () => editLayout()
          },
          added ? 'separator' : null,
          added ? { label: 'Usuń tę kartkę', icon: 'trash', destructive: true, testID: 'drawing-page-delete', onSelect: () => deletePage() } : null
        ]
      });
    }

    // ---- ramka rysunkowa z tabliczką (od 1.41)
    /** Okno ramki: arkusz (bez ramki, A4, A3 – w poziomie) i napisy tabliczki; skala pusta – z kratki i arkusza. */
    function editFrame() {
      const old = drawing.frame;
      const draft = { format: old?.format ?? 'A4' };
      for (const key of FRAME_FIELDS) draft[key] = old?.[key] ?? '';
      if (!old) draft.date = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      let saved = false;
      const autoScale = (format) => `${frameScaleText(format, drawing.width, drawing.height, drawing.scale)} – z kratki`;
      const inputs = {};
      openFormSheet({
        title: 'Ramka rysunkowa',
        submitLabel: 'Gotowe',
        build: () => [
          segmented({
            name: 'drawing-frame-format', value: draft.format, label: 'Arkusz',
            options: [{ value: 'none', label: 'Bez ramki' }, ...Object.entries(FRAME_FORMATS).map(([format, size]) => ({ value: format, label: size.label }))],
            onChange: (value) => {
              draft.format = value;
              if (FRAME_FORMATS[value]) inputs.scale.placeholder = autoScale(value);
            }
          }),
          ...FRAME_FIELDS.map((key) => {
            const input = textInput({
              value: draft[key], placeholder: key === 'scale' ? autoScale(FRAME_FORMATS[draft.format] ? draft.format : 'A4') : '', testID: `drawing-frame-${key}`,
              onInput: (value) => { draft[key] = value; }
            });
            input.maxLength = FRAME_FIELD_MAX[key];
            inputs[key] = input;
            return field(FRAME_FIELD_LABELS[key], input);
          }),
          h('p', { class: 'field__hint' }, 'Kartka to arkusz w poziomie: ramka 20 mm od lewego brzegu i 10 mm od pozostałych, tabliczka 180 mm w prawym '
            + 'dolnym rogu (rysował, data, skala, format, tytuł, materiał, numer rysunku). Skala bez wpisu – z kratki rysunku i wielkości arkusza. '
            + 'Ramka jest częścią tła kartki: widać ją na obrazie w notatce, w PDF i w pliku DXF (warstwa RAMKA).')
        ],
        onSubmit: () => {
          saved = true;
          return true;
        },
        onClose: () => {
          if (!saved) return;
          const next = FRAME_FORMATS[draft.format] ? cleanFrame(draft) : null;
          if (JSON.stringify(next) === JSON.stringify(old ?? null)) return;
          if (next) drawing.frame = next;
          else delete drawing.frame;
          changed = true;
          updateToolbar();
          requestRender();
          flash(next ? `Ramka ${FRAME_FORMATS[next.format].label} z tabliczką` : 'Bez ramki rysunkowej');
        }
      });
    }

    // ---- układ kartki (od 1.44)
    /** Okno układu: rodzaj (bez układu, A3, PDCA, macierz, Kanban, pokrewieństwo) i jego napisy. */
    function editLayout() {
      if (drawing.photo) {
        flash('Kartka ze zdjęciem nie ma układu – dodaj nową kartkę.');
        return;
      }
      const old = drawing.layout ?? null;
      const draft = {
        kind: old?.kind ?? 'none',
        title: old?.title ?? '',
        matrix: [...(old?.kind === 'matrix' ? old.labels : MATRIX_DEFAULT)],
        columns: { kanban: (old?.kind === 'kanban' ? old.labels : COLUMN_DEFAULTS.kanban).join('\n'), affinity: (old?.kind === 'affinity' ? old.labels : COLUMN_DEFAULTS.affinity).join('\n') }
      };
      const titleField = field('Tytuł raportu', textInput({ value: draft.title, testID: 'drawing-layout-title', onInput: (value) => { draft.title = value; } }));
      const matrixNames = ['Oś pionowa', 'Oś pozioma', 'Lewa górna ćwiartka', 'Prawa górna ćwiartka', 'Lewa dolna ćwiartka', 'Prawa dolna ćwiartka'];
      const matrixFields = h('div', {}, matrixNames.map((name, index) => field(name, textInput({
        value: draft.matrix[index], testID: `drawing-layout-matrix-${index}`, onInput: (value) => { draft.matrix[index] = value; }
      }))));
      const columnsArea = textArea({ value: '', rows: 4, testID: 'drawing-layout-columns', onInput: (value) => { draft.columns[draft.kind] = value; } });
      const columnsField = field('Kolumny – jedna w wierszu (2–6)', columnsArea);
      const show = () => {
        titleField.hidden = draft.kind !== 'a3';
        matrixFields.hidden = draft.kind !== 'matrix';
        columnsField.hidden = draft.kind !== 'kanban' && draft.kind !== 'affinity';
        if (!columnsField.hidden) columnsArea.value = draft.columns[draft.kind];
      };
      show();
      let saved = false;
      openFormSheet({
        title: 'Układ kartki',
        submitLabel: 'Gotowe',
        build: () => [
          group({ title: 'Układ' }, ...['none', ...LAYOUT_KINDS].map((kind) => radioRow({
            name: 'drawing-layout-kind', value: kind, checked: kind === draft.kind, title: kind === 'none' ? 'Bez układu' : LAYOUT_LABELS[kind],
            subtitle: { none: null, a3: 'Tytuł i siedem pól: od tła i stanu obecnego do kontroli wyników', pdca: 'Koło: planuj, wykonaj, sprawdź, działaj',
              matrix: 'Wpływ i wysiłek – cztery ćwiartki', kanban: 'Kolumny: do zrobienia, w toku, zrobione', affinity: 'Kolumny-grupy z kolorowymi nagłówkami' }[kind],
            testID: `drawing-layout-kind-${kind}`, onChange: () => { draft.kind = kind; show(); }
          }))),
          titleField, matrixFields, columnsField,
          h('p', { class: 'field__hint' }, 'Układ to tło kartki (jak ramka): wypełniasz go karteczkami, tekstem i rysunkiem. Widać go na obrazie w notatce, '
            + 'w PDF i w pliku DXF (warstwa UKLAD); ukrycie tła w warstwach ukrywa i układ. Przy ramce rysunkowej układ jest w ramce nad tabliczką.')
        ],
        onSubmit: () => {
          saved = true;
          return true;
        },
        onClose: () => {
          if (!saved) return;
          const labels = draft.kind === 'matrix' ? draft.matrix : (draft.columns[draft.kind] ?? '').split('\n');
          const next = draft.kind === 'none' ? null : cleanLayout({ kind: draft.kind, title: draft.title, labels });
          if (JSON.stringify(next) === JSON.stringify(old)) return;
          if (next) drawing.layout = next;
          else delete drawing.layout;
          changed = true;
          updateToolbar();
          requestRender();
          flash(next ? `Układ kartki: ${LAYOUT_LABELS[next.kind]}` : 'Bez układu kartki');
        }
      });
    }

    // ---- DXF (od 1.37): rysunek CAD na kartkę i kartka jako plik DXF
    /** Wybór pliku DXF, okno z podsumowaniem i miejscem (ta kartka albo nowa, skala dopasowana albo kartki), wczytanie. */
    async function importDxf() {
      const file = await pickFile('.dxf');
      if (!file) return;
      let parsed;
      try {
        parsed = parseDxf(decodeDxf(await file.arrayBuffer()));
      } catch (error) {
        flash(error?.message || 'Nie udało się odczytać pliku DXF.');
        return;
      }
      const { primitives, skipped } = dxfPrimitives(parsed);
      const bounds = primitivesBounds(primitives);
      if (!bounds) {
        flash('W pliku nie ma linii, okręgów, łuków ani tekstów do wczytania.');
        return;
      }
      const widthMm = (bounds.maxX - bounds.minX) * parsed.unitMm;
      const heightMm = (bounds.maxY - bounds.minY) * parsed.unitMm;
      const fitted = fittingScale(widthMm, heightMm, drawing.width, drawing.height);
      const fits = (scale) => widthMm / pageUnitMillimeters(scale) <= drawing.width && heightMm / pageUnitMillimeters(scale) <= drawing.height;
      const canAdd = newPages && pages.filter((page) => page.added).length < pageRoom;
      const empty = drawing.strokes.length === 0;
      const scaleText = (scale) => `1 kratka = ${formatLength(PAPER_STEP, scale)}`;
      const places = [
        ...(empty ? [{ value: 'fit', title: 'Ta kartka – skala dopasowana', subtitle: scaleText(fitted) }] : []),
        ...(canAdd ? [{ value: 'new', title: 'Nowa kartka – skala dopasowana', subtitle: scaleText(fitted) }] : []),
        { value: 'here', title: 'Ta kartka – jej skala', subtitle: `${scaleText(drawing.scale)}${fits(drawing.scale) ? '' : ' – rysunek nie zmieści się na kartce'}` }
      ];
      let where = places[0].value;
      let chosen = null;
      const layerCount = new Set(primitives.map((item) => item.layer)).size;
      openFormSheet({
        title: 'Wczytaj DXF',
        submitLabel: 'Wczytaj',
        build: () => [
          h('p', { class: 'drawing__dxf-summary', dataset: { testid: 'drawing-dxf-summary' } },
            `${file.name}: ${plural(primitives.length, 'element', 'elementy', 'elementów')}, ${plural(layerCount, 'warstwa', 'warstwy', 'warstw')}, `
            + `${formatNumber(widthMm)} × ${formatNumber(heightMm)} mm${skipped > 0 ? ` · pominięte: ${skipped} (np. kreskowanie, bryły 3D)` : ''}.`),
          group({ title: 'Gdzie' }, ...places.map((place) => radioRow({
            name: 'drawing-dxf-place', value: place.value, checked: place.value === where, title: place.title, subtitle: place.subtitle,
            testID: `drawing-dxf-place-${place.value}`, onChange: () => { where = place.value; }
          }))),
          h('p', { class: 'field__hint' }, 'Linie, okręgi, łuki, elipsy, łamane, splajny, punkty i teksty stają się kształtami rysunku (wymiary – liniami '
            + 'i tekstem), warstwy pliku – warstwami rysunku. Skala dopasowana: rysunek mieści się na kartce, a wymiary mierzą prawdziwe milimetry.')
        ],
        onSubmit: () => {
          chosen = where;
          return true;
        },
        onClose: () => {
          if (chosen) placeDxf(file.name, parsed, primitives, bounds, chosen === 'here' ? drawing.scale : fitted, chosen === 'new', skipped);
        }
      });
    }
    /** Elementy z pliku na kartce: warstwy pliku – warstwy rysunku (nowe na końcu, do limitu), na środku kartki; jeden krok cofania. */
    function placeDxf(name, parsed, primitives, bounds, scale, onNewPage, skipped) {
      if (onNewPage) addPage();
      drawing.scale = { ...scale };
      let layers = drawingLayers(drawing);
      const ids = new Map();
      for (const layerName of new Set(primitives.map((item) => item.layer))) {
        if (layerName === '0') {
          ids.set(layerName, 1);
          continue;
        }
        const existing = elementLayers(layers).find((layer) => layer.name.toLowerCase() === layerName.toLowerCase());
        if (existing) {
          ids.set(layerName, existing.id);
          continue;
        }
        const next = addLayer(layers);
        if (next === layers) {
          ids.set(layerName, elementLayers(layers).at(-1).id);
          continue;
        }
        const id = next.at(-1).id;
        layers = updateLayer(next, id, { name: layerName, hidden: parsed.layers.get(layerName)?.hidden === true });
        ids.set(layerName, id);
      }
      drawing.layers = layers;
      const pageUnitMm = pageUnitMillimeters(drawing.scale);
      const k = parsed.unitMm / pageUnitMm;
      const [width, height] = [(bounds.maxX - bounds.minX) * k, (bounds.maxY - bounds.minY) * k];
      const origin = { x: Math.max(0, (drawing.width - width) / 2), y: Math.max(0, (drawing.height - height) / 2) };
      const width0 = tools.penWidths[tools.penWidth];
      const elements = primitivesToElements(primitives, {
        unitMm: parsed.unitMm, pageUnitMm, origin, bounds, layerOf: (layerName) => ids.get(layerName) ?? 1,
        defaultSize: Math.round(((width0.min + width0.max) / 2) * 10) / 10
      }).map(remeasure);
      // Najwyżej MAX_STROKES elementów na kartce – nadmiar bardzo dużego pliku pomijany (z komunikatem).
      const over = Math.max(0, drawing.strokes.length + elements.length - MAX_STROKES);
      if (over > 0) elements.length -= over;
      setTool('select');
      history.begin();
      drawing.strokes.push(...elements);
      commitStep();
      changed = true;
      selection = new Set(elements.filter(isShown));
      selectionKind = 'whole';
      updateToolbar();
      requestRender();
      flash(`Wczytano ${plural(elements.length, 'element', 'elementy', 'elementów')} z „${name}”${skipped > 0 ? ` (pominięte: ${skipped})` : ''}`
        + `${over > 0 ? ` – ${formatNumber(over)} nie zmieściło się (najwięcej ${formatNumber(MAX_STROKES)} na kartce)` : ''}.`);
    }
    /** Kartka jako plik DXF (R12, milimetry): pobranie albo – na iPhonie i iPadzie – arkusz udostępniania. */
    async function exportDxf() {
      const { text, written, skipped } = drawingToDxf(drawing);
      const safe = pageTitle().replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Rysunek';
      const file = new File([text], `${safe}.dxf`, { type: 'application/dxf' });
      const result = await deliverFile(file, { title: 'Zapisz kartkę jako DXF', message: `Plik „${file.name}” – ${plural(written, 'element', 'elementy', 'elementów')} w milimetrach.` });
      if (result !== 'cancelled') flash(`Zapisano „${file.name}”${skipped > 0 ? ` – pominięte: ${skipped} (tabele, karteczki, symbole)` : ''}.`);
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
        for (const stroke of shownStrokes()) {
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
      moveMode = false;
      if (pointPick) cancelPointPick();
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
    /** Punkt na zaznaczeniu, które przeciągnięcie przesunie (zaznaczanie – ramka; kształty – zaznaczony kształt). */
    const onSelection = (point) => {
      const [only] = selection;
      return (tool === 'select' && selectionHit(point))
        || (tool === 'shape' && selection.size === 1 && isShape(only)
          && (shapeContains(only, point.x, point.y) || touchesShape(only, point.x, point.y, HANDLE_HIT / view.scale)));
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
        if (!isShown(stroke)) continue;
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
    /** Zaznaczone elementy zastąpione przekształconymi (te same miejsca w rysunku) – jeden krok cofania, zostają zaznaczone. */
    function replaceSelection(items, next) {
      const map = new Map(items.map((stroke, index) => [stroke, next[index]]));
      history.begin();
      drawing.strokes.forEach((stroke, index) => {
        if (map.has(stroke)) drawing.strokes[index] = map.get(stroke);
      });
      // Zaznaczenie przed krokiem – przyklejone końce poprawione w tym kroku zostają zaznaczone.
      selection = new Set(next);
      commitStep();
      updateToolbar();
      requestRender();
    }
    /** Odbicie lustrzane (od 1.30) względem środka zaznaczenia: 'horizontal' – lewa strona z prawą, 'vertical' – góra z dołem. */
    function mirrorSelection(axis) {
      const items = orderedSelection();
      if (snip || !canTurn(items)) return;
      const bounds = selectionBounds(items);
      const at = axis === 'horizontal' ? (bounds.minX + bounds.maxX) / 2 : (bounds.minY + bounds.maxY) / 2;
      replaceSelection(items, transformStrokes(items, (stroke) => mirrorStroke(stroke, axis, at), elementBox));
    }
    function openMirrorMenu() {
      openMenu({
        title: 'Odbicie lustrzane',
        items: [
          ...MIRROR_AXES.map((axis) => ({
            label: MIRROR_LABELS[axis], icon: axis === 'horizontal' ? 'mirror' : 'mirrorVertical', testID: `drawing-mirror-${axis}`,
            onSelect: () => mirrorSelection(axis)
          })),
          // Od 1.41: względem prostej przez dwa dotknięte punkty – zaznaczone albo ich odbita kopia (oryginał zostaje).
          'separator',
          { label: 'Względem prostej…', icon: 'mirrorLine', testID: 'drawing-mirror-line', onSelect: () => startPointPick('mirror') },
          { label: 'Kopia względem prostej…', icon: 'mirrorLine', testID: 'drawing-mirror-copy', onSelect: () => startPointPick('mirror-copy') }
        ]
      });
    }
    // ---- odbicie względem prostej, skalowanie, „Styl jak…” (od 1.41)
    /** Czekanie na dotknięcia: 'mirror' i 'mirror-copy' – dwa punkty osi (first – pierwszy), 'match' – element wzoru stylu. */
    let pointPick = null;
    let axisHover = null;
    const PICK_HINTS = {
      mirror: ['Odbicie: dotknij pierwszego punktu osi (Esc – bez odbicia)', 'Odbicie: dotknij drugiego punktu osi (Esc – bez odbicia)'],
      'mirror-copy': ['Kopia odbita: dotknij pierwszego punktu osi (Esc – bez kopii)', 'Kopia odbita: dotknij drugiego punktu osi (Esc – bez kopii)'],
      match: ['Dotknij elementu, którego styl przenieść na zaznaczone (Esc – bez zmian)'],
      chain: ['Łańcuch: dotknij następnego punktu – wymiar od końca poprzedniego (Esc – koniec)'],
      baseline: ['Od bazy: dotknij następnego punktu – wymiar od początku bazowego, piętro dalej (Esc – koniec)']
    };
    /** Podpowiedź wyboru – zostaje do końca wyboru (bez znikania po kilku sekundach). */
    function showPickHint() {
      clearTimeout(noticeTimer);
      notice.textContent = EDIT_HINTS[pointPick.kind]?.(pointPick.step) ?? PICK_HINTS[pointPick.kind][pointPick.first ? 1 : 0];
      notice.hidden = false;
    }
    function startPointPick(kind) {
      if (selection.size === 0 || snip) return;
      const [only] = selection;
      // Łańcuch i od bazy (od 1.42): base – wymiar bazowy, last – ostatnio dodany.
      pointPick = { kind, first: null, ...(kind === 'chain' || kind === 'baseline' ? { base: only, last: only } : {}) };
      showPickHint();
      requestLive();
    }
    function cancelPointPick(message = null) {
      pointPick = null;
      axisHover = null;
      edgeHover = null;
      editHover = null;
      if (message) flash(message);
      else notice.hidden = true;
      requestLive();
    }
    // ---- edycja geometrii (od 1.43): odsuń, zaokrąglij, fazuj, przytnij, wydłuż
    /** Komunikat na koniec (Esc, drugie dotknięcie polecenia) – jest tylko przy poleceniach edycji. */
    const EDIT_END = { offset: 'Koniec odsuwania', fillet: 'Koniec zaokrąglania', chamfer: 'Koniec fazowania', trim: 'Koniec przycinania', extend: 'Koniec wydłużania' };
    /** Wielkości poleceń (jednostki strony w ustawieniach narzędzi) i ich okna. */
    const EDIT_VALUES = {
      offset: { key: 'editOffset', title: 'Odsuń', label: 'Odległość', submit: 'Dalej',
        hint: 'Kopia równoległa (okrąg, łuk – współśrodkowa; prostokąt i łamana – o tyle samo z każdej strony). Potem dotknij elementu i strony.' },
      fillet: { key: 'editFillet', title: 'Zaokrąglij', label: 'Promień R', submit: 'Dalej', zero: true,
        hint: 'Łuk styczny do dwóch odcinków; odcinki skracają się (albo wydłużają) do łuku. 0 – ostry narożnik w przecięciu.' },
      chamfer: { key: 'editChamfer', title: 'Fazuj', label: 'Faza', submit: 'Dalej', hint: 'Faza 45° – odcinki skrócone o tyle od narożnika, między nimi nowy odcinek.' },
      ttr: { key: 'ttrRadius', title: 'Okrąg styczny', label: 'Promień R', submit: 'Gotowe', hint: 'Okrąg styczny do obu dotkniętych elementów – po stronie dotknięć.' }
    };
    const editValueText = (kind) => lengthText(tools[EDIT_VALUES[kind].key], drawing.scale, dimFormat(drawing));
    const EDIT_HINTS = {
      offset: (step) => (step ? `Odsuń o ${editValueText('offset')}: dotknij strony, po której ma stanąć kopia (Esc – koniec)`
        : `Odsuń o ${editValueText('offset')}: dotknij odcinka, okręgu, łuku, prostokąta albo łamanej (Esc – koniec)`),
      fillet: (step) => `Zaokrąglij R ${editValueText('fillet')}: dotknij ${step ? 'drugiego' : 'pierwszego'} odcinka – w części, która zostaje (Esc – koniec)`,
      chamfer: (step) => `Fazuj ${editValueText('chamfer')}: dotknij ${step ? 'drugiego' : 'pierwszego'} odcinka – w części, która zostaje (Esc – koniec)`,
      trim: () => 'Przytnij: dotknij części elementu do usunięcia – między przecięciami z innymi (Esc – koniec)',
      extend: () => 'Wydłuż: dotknij odcinka albo łuku przy końcu, który ma dojść do najbliższego elementu (Esc – koniec)'
    };
    /** Element pod wskaźnikiem albo podgląd odsunięcia (mysz) przy poleceniu edycji. */
    let editHover = null;
    /** Okno wielkości polecenia (w jednostkach liczb wymiarów); then(wartość w jednostkach strony), cancel – bez wartości. */
    function askEditLength(kind, then, cancel = null) {
      const spec = EDIT_VALUES[kind];
      const format = dimFormat(drawing);
      const factor = toScaleLength(1, drawing.scale) * dimFactor(drawing.scale, format);
      let text = formatNumber(Math.round(tools[spec.key] * factor * 1000) / 1000);
      let value = null;
      openFormSheet({
        title: spec.title,
        submitLabel: spec.submit,
        build: () => [
          field(`${spec.label} (${dimUnitLabel(drawing.scale, format)})`, textInput({ value: text, testID: 'drawing-edit-value', onInput: (next) => { text = next; } }), { hint: spec.hint })
        ],
        onSubmit: () => {
          const typed = parseDecimal(text);
          if (typed === null || typed < 0 || (typed === 0 && !spec.zero)) throw new Error(spec.zero ? 'Wpisz liczbę: 0 albo więcej' : 'Wpisz liczbę większą od zera');
          value = Math.round((typed / factor) * 100) / 100;
          return true;
        },
        onClose: () => {
          if (value === null) {
            cancel?.();
            return;
          }
          tools[spec.key] = value;
          saveTools(tools);
          then(value);
        }
      });
    }
    /**
     * Polecenie edycji z menu: przycinanie i wydłużanie – od razu dotknięcia; odsunięcie, zaokrąglenie i faza – najpierw
     * wielkość. Zaznaczone elementy, które pasują (jeden do odsunięcia, dwa odcinki), zastępują pierwsze dotknięcia.
     */
    function startEdit(kind) {
      if (snip) return;
      if (pointPick) cancelPointPick();
      pending = null;
      const chosen = orderedSelection();
      if (kind === 'trim' || kind === 'extend') {
        beginEditPick(kind);
        return;
      }
      askEditLength(kind, () => {
        if (kind === 'offset') {
          beginEditPick(kind, chosen.length === 1 && canOffset(chosen[0]) ? { held: { target: chosen[0] }, step: 1 } : {});
          return;
        }
        const segments = chosen.filter(isPlainSegment);
        if (segments.length === 2 && chosen.length === 2) {
          beginEditPick(kind);
          finishCorner(kind, segments[0], null, segments[1], null);
          return;
        }
        beginEditPick(kind, segments.length === 1 && chosen.length === 1 ? { held: { target: segments[0], point: null }, step: 1 } : {});
      });
    }
    function beginEditPick(kind, extra = {}) {
      clearSelection();
      pointPick = { kind, step: 0, held: null, ...extra };
      editHover = null;
      showPickHint();
      updateToolbar();
      requestRender();
    }
    /** Komunikat o błędzie przy poleceniu – podpowiedź wraca po chwili. */
    function editFail(message) {
      const { kind } = pointPick;
      flash(message);
      setTimeout(() => {
        if (pointPick?.kind === kind) showPickHint();
      }, 2500);
    }
    /** Element pod punktem spełniający warunek (najwyższy). */
    function editTargetAt(point, accept) {
      const shown = shownStrokes();
      return strokesAt(shown, point.x, point.y, HANDLE_HIT / view.scale).map((index) => shown[index]).find(accept) ?? null;
    }
    const editAccepts = (kind) => (kind === 'trim' ? canTrim : kind === 'extend' ? canExtend : kind === 'offset' ? canOffset
      : (stroke) => isPlainSegment(stroke) && stroke !== pointPick?.held?.target);
    /** Wynik edycji: elementy zastąpione kształtami (lista [element, [kształty]]), `added` – nowe na wierzchu; jeden krok cofania. */
    function applyEdit(replacements, added = []) {
      history.begin();
      for (const [target, shapes] of replacements) {
        const index = drawing.strokes.indexOf(target);
        if (index >= 0) drawing.strokes.splice(index, 1, ...shapes);
      }
      drawing.strokes.push(...added);
      commitStep();
      changed = true;
      editHover = null;
      requestRender();
    }
    /** Zaokrąglenie albo faza dwóch odcinków (dotknięcia – która część zostaje; null – dalsza od narożnika). */
    function finishCorner(kind, first, firstPoint, second, secondPoint) {
      const picks = [firstPoint, secondPoint];
      const result = kind === 'fillet' ? filletSegments(first, second, tools.editFillet, picks) : chamferSegments(first, second, tools.editChamfer, picks);
      pointPick.held = null;
      pointPick.step = 0;
      if (result.error) {
        editFail(result.error);
        return;
      }
      const [one, two, ...extra] = result.shapes;
      applyEdit([[first, [one]], [second, [two]]], extra);
      showPickHint();
    }
    /** Dotknięcie przy poleceniu edycji. */
    function editPickAt(point) {
      const { kind } = pointPick;
      const target = pointPick.held && kind === 'offset' ? null : editTargetAt(point, editAccepts(kind));
      if (kind === 'trim' || kind === 'extend') {
        if (!target) {
          editFail(kind === 'trim' ? 'Dotknij odcinka, prostej, półprostej, okręgu albo łuku.' : 'Dotknij odcinka albo łuku przy końcu do wydłużenia.');
          return;
        }
        const result = kind === 'trim' ? trimAt(shownStrokes(), target, point) : extendAt(shownStrokes(), target, point);
        if (result.error) {
          editFail(result.error);
          return;
        }
        applyEdit([[target, result.shapes]]);
        return;
      }
      if (kind === 'offset') {
        if (!pointPick.held) {
          if (!target) {
            editFail('Dotknij odcinka, prostej, okręgu, łuku, prostokąta albo łamanej.');
            return;
          }
          pointPick.held = { target };
          pointPick.step = 1;
          showPickHint();
          requestLive();
          return;
        }
        const result = offsetShape(pointPick.held.target, tools.editOffset, point);
        pointPick.held = null;
        pointPick.step = 0;
        if (result.error) {
          editFail(result.error);
          return;
        }
        applyEdit([], result.shapes);
        showPickHint();
        return;
      }
      if (!target) {
        editFail('Dotknij odcinka – zaokrąglić i fazować można dwa odcinki.');
        return;
      }
      if (!pointPick.held) {
        pointPick.held = { target, point };
        pointPick.step = 1;
        showPickHint();
        requestLive();
        return;
      }
      finishCorner(kind, pointPick.held.target, pointPick.held.point, target, point);
    }
    /** Pod myszą: element, którego dotyczy polecenie, albo (odsunięcie) kopia w miejscu wskaźnika. */
    function editHoverAt(point) {
      const { kind, held } = pointPick;
      if (kind === 'offset' && held) {
        const result = offsetShape(held.target, tools.editOffset, point);
        return result.shapes ? { preview: result.shapes[0] } : null;
      }
      const target = editTargetAt(point, editAccepts(kind));
      return target ? { target } : null;
    }
    /** Edycja: wybrany element (pierwszy odcinek, element do odsunięcia) i element pod myszą – podświetlone; kopia – przerywana. */
    function paintEditPick(ctx) {
      const options = { scale: drawing.scale, dimFormat: dimFormat(drawing) };
      const glow = (stroke) => {
        ctx.save();
        ctx.globalAlpha = 0.35;
        paintStroke(ctx, { ...stroke, color: '#0a84ff', size: stroke.size + 6 / view.scale, fill: undefined, hatch: undefined, label: undefined }, options);
        ctx.restore();
      };
      if (pointPick.held?.target) glow(pointPick.held.target);
      if (editHover?.target && editHover.target !== pointPick.held?.target) glow(editHover.target);
      if (editHover?.preview) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        paintStroke(ctx, { ...editHover.preview, color: '#0a84ff', dash: 'dashed' }, options);
        ctx.restore();
      }
    }
    /**
     * Wymiar łańcuchowy albo od bazy (od 1.42) do punktu `point`: od końca ostatniego wymiaru (łańcuch) albo od początku
     * bazowego (od bazy), ten sam kierunek; linia wymiarowa w jednej linii z poprzednią (łańcuch) albo piętro dalej (od bazy).
     * Jeden krok cofania; nowy wymiar zaznaczony, wybór trwa.
     */
    function addLinkedDim(point, event) {
      const snap = edgeSnapAt(point, event);
      const at = snap ? { x: snap.x, y: snap.y } : point;
      const { kind, base, last } = pointPick;
      const from = kind === 'chain' ? shapePoint(last, 0.5, 0) : shapePoint(base, -0.5, 0);
      if (Math.hypot(at.x - from.x, at.y - from.y) * view.scale < 8) {
        flash('Dotknij innego punktu niż początek wymiaru.');
        return;
      }
      const axis = dimAxis(base);
      const previous = dimGeometry(last, 'length');
      const normal = previous.normal;
      const along = (item) => item.x * normal[0] + item.y * normal[1];
      const line = along(previous.from) + (kind === 'baseline' ? DIM_TIER : 0);
      const direction = Math.atan2(at.y - from.y, at.x - from.x);
      const up = axis === 'h' ? [0, -1] : axis === 'v' ? [1, 0] : [Math.sin(direction), -Math.cos(direction)];
      const side = up[0] * normal[0] + up[1] * normal[1] >= 0 ? 1 : -1;
      // Poziomy i pionowy – linia wymiarowa dokładnie w linii (piętrze); równoległy – to samo odsunięcie (od bazy – dalej).
      const reach = axis ? line - Math.max(along(from), along(at)) : Math.abs(dimOffset(last, 'length')) + (kind === 'baseline' ? DIM_TIER : 0);
      const style = { color: base.color, size: base.size, axis: axis ?? 'aligned' };
      const shape = dimFromPoints('linear', from, at, style, side * Math.max(DIM_OFFSET_LIMITS.min, reach));
      history.begin();
      const added = onActiveLayer(linkEnds(shape, [['start', edgeSnapAt(from, event)], ['end', snap]]));
      drawing.strokes.push(added);
      commitStep();
      changed = true;
      pointPick.last = added;
      selection = new Set([added]);
      selectionKind = 'whole';
      showPickHint();
      updateToolbar();
      requestRender();
    }
    /** Dotknięcie przy wyborze: punkt osi (przyciągnięty do narożników i krawędzi) albo element – wzór stylu. */
    function pickPointAt(point, event) {
      if (EDIT_END[pointPick.kind]) {
        editPickAt(point);
        return;
      }
      if (pointPick.kind === 'chain' || pointPick.kind === 'baseline') {
        addLinkedDim(point, event);
        return;
      }
      if (pointPick.kind === 'match') {
        const shown = shownStrokes();
        const [index] = strokesAt(shown, point.x, point.y, HANDLE_HIT / view.scale);
        const source = index === undefined ? null : shown[index];
        if (!source || !hasStyle(source)) {
          flash(source ? 'Ten element nie ma koloru ani linii do przeniesienia – dotknij kreski, kształtu albo tekstu.' : 'Tu nie ma elementu – dotknij jego linii (Esc – bez zmian).');
          setTimeout(() => { if (pointPick) showPickHint(); }, 2500);
          return;
        }
        cancelPointPick('Styl przeniesiony na zaznaczone');
        changeSelection((stroke) => hasStyle(stroke) || isArray(stroke), (stroke) => withStyleOf(stroke, source));
        return;
      }
      const snap = edgeSnapAt(point, event);
      const at = snap ? { x: snap.x, y: snap.y } : point;
      if (!pointPick.first) {
        pointPick.first = at;
        showPickHint();
        requestLive();
        return;
      }
      const { kind, first } = pointPick;
      if (Math.hypot(at.x - first.x, at.y - first.y) * view.scale < 8) {
        flash('Drugi punkt osi – w innym miejscu niż pierwszy');
        return;
      }
      cancelPointPick(kind === 'mirror' ? 'Odbito względem prostej' : 'Dodano kopię odbitą – oryginał został');
      mirrorAcrossSelection(first, at, kind === 'mirror-copy');
    }
    /** Zaznaczenie odbite względem prostej a–b; `copy` – odbita kopia obok oryginału (zaznaczona kopia). Jeden krok cofania. */
    function mirrorAcrossSelection(a, b, copy) {
      const items = orderedSelection();
      if (items.length === 0) return;
      const mirrored = transformStrokes(items, (stroke) => mirrorAcross(stroke, a, b), elementBox);
      if (!copy) {
        replaceSelection(items, mirrored);
        return;
      }
      dropRegion();
      history.begin();
      const copies = relinkCopies(mirrored, drawing.strokes);
      drawing.strokes.push(...copies);
      commitStep();
      selection = new Set(copies);
      updateToolbar();
      requestRender();
    }
    /** Oś odbicia w trakcie wyboru: pierwszy punkt i prosta przez punkt pod wskaźnikiem (przerywana, przez całą stronę). */
    function paintAxisPick(ctx) {
      const { first } = pointPick;
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 88, 190, 0.85)';
      ctx.fillStyle = 'rgba(0, 88, 190, 0.85)';
      ctx.lineWidth = 1.5 / view.scale;
      if (axisHover && Math.hypot(axisHover.x - first.x, axisHover.y - first.y) > 1) {
        const length = Math.hypot(axisHover.x - first.x, axisHover.y - first.y);
        const reach = (drawing.width + drawing.height) * 2;
        const [ux, uy] = [(axisHover.x - first.x) / length, (axisHover.y - first.y) / length];
        ctx.setLineDash([8 / view.scale, 5 / view.scale]);
        ctx.beginPath();
        ctx.moveTo(first.x - ux * reach, first.y - uy * reach);
        ctx.lineTo(first.x + ux * reach, first.y + uy * reach);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(first.x, first.y, 5 / view.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    /** Okno „Skaluj”: współczynnik (2, 0,5 albo 1:2), wokół środka zaznaczenia; jeden krok cofania. */
    function openScaleSheet() {
      const items = orderedSelection();
      if (snip || items.length === 0) return;
      let text = '2';
      let factor = null;
      const parse = (value) => {
        const ratio = /^\s*([\d.,]+)\s*:\s*([\d.,]+)\s*$/.exec(value);
        if (ratio) {
          const [a, b] = [parseDecimal(ratio[1]), parseDecimal(ratio[2])];
          return a && b ? a / b : null;
        }
        return parseDecimal(value);
      };
      openFormSheet({
        title: 'Skaluj',
        submitLabel: 'Skaluj',
        build: () => [
          field('Współczynnik', textInput({ value: text, testID: 'drawing-scale-factor', onInput: (value) => { text = value; } }),
            { hint: 'Wokół środka zaznaczenia: 2 – dwa razy większe, 0,5 – o połowę mniejsze (także 2:1 albo 1:2). Kreski i kształty rosną '
              + '(grubość linii, tekst na kształcie i kreskowanie – bez zmian), pola tekstowe, wzory, tabele, karteczki i symbole tylko się przesuwają.' })
        ],
        onSubmit: () => {
          const value = parse(text);
          if (!(value >= SCALE_LIMITS.min && value <= SCALE_LIMITS.max)) throw new Error(`Współczynnik od ${formatNumber(SCALE_LIMITS.min)} do ${SCALE_LIMITS.max}`);
          factor = value;
          return true;
        },
        onClose: () => {
          if (factor) scaleSelection(factor);
        }
      });
    }
    function scaleSelection(factor) {
      const items = orderedSelection();
      if (snip || items.length === 0 || factor === 1) return;
      const bounds = selectionBounds(items);
      const [cx, cy] = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
      replaceSelection(items, transformStrokes(items, (stroke) => scaleStroke(stroke, cx, cy, factor), elementBox));
      flash(`Przeskalowano ×${formatNumber(factor)}`);
    }
    /** Kolejność rysowania zaznaczonych (od 1.40) – jeden krok cofania; bez zmiany – komunikat. */
    function orderSelection(move) {
      if (snip || selectionKind !== 'whole' || selection.size === 0) return;
      const next = reorderStrokes(drawing.strokes, selection, move);
      if (next === drawing.strokes) {
        flash(move === 'front' || move === 'up' ? 'Zaznaczenie jest już nad tym, co zakrywa' : 'Zaznaczenie jest już pod tym, co je zakrywa');
        return;
      }
      history.begin();
      drawing.strokes.splice(0, drawing.strokes.length, ...next);
      commitStep();
      updateToolbar();
      requestRender();
    }
    function openOrderMenu() {
      openMenu({
        title: 'Kolejność rysowania',
        items: ORDER_MOVES.map((move) => ({ label: ORDER_LABELS[move], icon: ORDER_ICONS[move], testID: `drawing-order-${move}`, onSelect: () => orderSelection(move) }))
      });
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
      copyImage(canvasBlob(strokesCanvas(items, drawing.scale, drawingLayers(drawing))));
      pasteCount = 0;
      updateToolbar();
      flash(`${done} – „Wklej” na pasku zaznaczania albo Ctrl+V, także w innym rysunku.`);
      return true;
    }
    /** Zdjęcie i szablon z pliku wczytane – dopiero wtedy obraz wycinka jest pełny. */
    const mediaReady = () => preparePage(pages[pageIndex]);
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
        const canvas = area ? snipCanvas(area) : strokesCanvas(items, drawing.scale, drawingLayers(drawing));
        const blob = await canvasBlob(canvas, area && drawing.photo && area.kind === 'rect' ? 'image/jpeg' : 'image/png');
        const label = await onEmbed({ blob, width: canvas.width, height: canvas.height, sheet: pageIndex });
        flash(`Osadzono w notatce jako „${label}”.`);
      } catch (error) {
        flash(error?.message || 'Nie udało się osadzić obrazu w notatce.');
      } finally {
        embedding = false;
        embedButton.disabled = false;
      }
    }

    // ---- wypełnienie i tekst kształtu (od 1.17)
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
    // ---- szyk (od 1.19)
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
            ? { kind, columns: values.columns, rows: values.rows, dx: units(values.dx), dy: units(values.dy), angle: start.linear.angle }
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
      return selection.size === 1 && !snip && isArray(only) && only.kind === 'polar' && !['move', 'marquee', 'lasso', 'turn'].includes(active?.kind) ? only : null;
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
          history.add(onActiveLayer(next));
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
    const editBox = (element, point = null) => (element.tool === 'table' ? editTable(element) : element.tool === 'sticky' ? editSticky(element)
      : element.tool === 'diagram' ? editDiagram(element, element.kind, point ? diagramTargetAt(element, point) : null)
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
        history.add(onActiveLayer(next));
        changed = true;
      }
      selectOnly(next);
    }

    /** Nowa tabela (element = null; od 1.44 też z gotowego wzoru, np. SIPOC) albo poprawka istniejącej – to samo okno tabeli co w notatce. */
    function editTable(element = null, template = null) {
      if (!element) clearSelection();
      const known = element ? TABLE_TEXT_SIZES.indexOf(element.size) : -1;
      const choice = { size: known >= 0 ? known : 1, color: element ? inkChoice(element.color) : tools.penColor };
      openTableEditor({
        title: element ? 'Tabela na rysunku' : template ? 'SIPOC' : 'Nowa tabela',
        submitLabel: element ? 'Zapisz' : 'Wstaw',
        table: element ?? template,
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

    // ---- diagramy jakości (od 1.44)
    /**
     * Diagram Ishikawy albo 5 × Dlaczego: nowy (element = null) albo poprawka. focus – pole z kursorem: 'problem',
     * 'bone-2', 'answer-1' albo 'add' (5 × Dlaczego – nowe pole na końcu). Ości: nazwa i przyczyny – wiersz to przyczyna,
     * wiersz od „-” – podprzyczyna; ość bez nazwy i przyczyn znika.
     */
    function editDiagram(element = null, kind = element?.kind, focus = null) {
      if (!element) clearSelection();
      const known = element ? DIAGRAM_SIZES.indexOf(element.size) : -1;
      const choice = { size: known >= 0 ? known : 1, color: element ? inkChoice(element.color) : tools.penColor };
      const draft = JSON.parse(JSON.stringify(element ?? newDiagram(kind)));
      const fishbone = kind === 'fishbone';
      // „Dlaczego?” – pierwsze puste pole, a gdy wszystkie są wypełnione – nowe na końcu.
      if (!fishbone && focus === 'add') {
        const empty = draft.answers.findIndex((answer) => !answer.trim());
        if (empty < 0 && draft.answers.length < DIAGRAM_LIMITS.answers) draft.answers.push('');
        focus = `answer-${empty >= 0 ? empty : draft.answers.length - 1}`;
      }
      // Przyczyny ości – tekst pól (zamieniany na przyczyny przy zapisie).
      const causeTexts = fishbone ? draft.bones.map((bone) => causesText(bone.causes)) : [];
      const fields = new Map();
      const list = h('div', { class: 'drawing__diagram-list' });
      const addButton = h('button', {
        type: 'button', class: 'button button--plain drawing__diagram-add', dataset: { testid: fishbone ? 'drawing-fishbone-add' : 'drawing-whys-add' },
        onClick: () => {
          if (fishbone) {
            draft.bones.push({ name: '', causes: [] });
            causeTexts.push('');
          } else {
            draft.answers.push('');
          }
          render();
          (fishbone ? fields.get(`name-${draft.bones.length - 1}`) : fields.get(`answer-${draft.answers.length - 1}`))?.focus();
        }
      }, fishbone ? '+ Dodaj kategorię' : '+ Dodaj „Dlaczego?”');
      function render() {
        fields.clear();
        const blocks = fishbone
          ? draft.bones.map((bone, index) => {
            const name = textInput({ value: bone.name, placeholder: `Kategoria ${index + 1}`, testID: `drawing-fishbone-name-${index}`, onInput: (value) => { bone.name = value; } });
            const causes = textArea({
              value: causeTexts[index], rows: 3, placeholder: 'Przyczyna\n- podprzyczyna', testID: `drawing-fishbone-causes-${index}`,
              onInput: (value) => { causeTexts[index] = value; }
            });
            fields.set(`name-${index}`, name);
            fields.set(`bone-${index}`, causes);
            return h('div', { class: 'drawing__diagram-block' }, field(`Ość ${index + 1} – nazwa`, name), field('Przyczyny', causes));
          })
          : draft.answers.map((answer, index) => {
            const input = textArea({
              value: answer, rows: 2, testID: `drawing-whys-answer-${index}`,
              placeholder: index === 0 ? 'Dlaczego to się stało?' : 'Dlaczego?', onInput: (value) => { draft.answers[index] = value; }
            });
            fields.set(`answer-${index}`, input);
            return field(`Dlaczego? ${index + 1}`, input);
          });
        addButton.hidden = (fishbone ? draft.bones.length : draft.answers.length) >= (fishbone ? DIAGRAM_LIMITS.bones : DIAGRAM_LIMITS.answers);
        replaceChildren(list, blocks, addButton);
      }
      render();
      const problem = textArea({ value: draft.problem, rows: 2, placeholder: fishbone ? 'Skutek, np. wymiar poza tolerancją' : 'Problem', testID: 'drawing-diagram-problem', onInput: (value) => { draft.problem = value; } });
      fields.set('problem', problem);
      let saved = null;
      openFormSheet({
        title: element ? diagramLabel(draft) : `Nowy: ${diagramLabel(draft)}`,
        submitLabel: element ? 'Zapisz' : 'Wstaw',
        build: () => [
          field(fishbone ? 'Problem (skutek – głowa ryby)' : 'Problem', problem),
          list,
          h('p', { class: 'field__hint' }, fishbone
            ? 'Każdy wiersz to przyczyna; wiersz zaczęty od „-” – jej podprzyczyna. Kategoria bez nazwy i przyczyn znika. Na start – 6M: człowiek, maszyna, '
              + 'metoda, materiał, pomiar, środowisko. Dotknięcie ości zaznaczonego diagramu otwiera to okno przy jej przyczynach.'
            : 'Pytaj „dlaczego?” aż do przyczyny źródłowej – ostatnie pole jest wyróżnione. Kolejne pole – przyciskiem „Dlaczego?” nad zaznaczonym diagramem.'),
          elementOptions(choice)
        ],
        onSubmit: () => {
          const bones = fishbone
            ? draft.bones.map((bone, index) => ({ name: bone.name, causes: parseCauses(causeTexts[index]) })).filter((bone) => bone.name.trim() || bone.causes.length > 0)
            : null;
          if (fishbone && bones.length === 0) throw new Error('Diagram potrzebuje co najmniej jednej kategorii');
          saved = cleanDiagram({
            ...draft, ...(bones ? { bones } : {}), size: DIAGRAM_SIZES[choice.size], color: inkHex(choice.color), x: element?.x ?? 0, y: element?.y ?? 0
          }, drawing.width, drawing.height);
          return true;
        },
        onClose: () => {
          if (saved) putBox(element, element ? { ...saved, ...(element.id ? { id: element.id } : {}), ...(element.layers ? { layers: element.layers } : {}) } : saved);
        }
      });
      requestAnimationFrame(() => fields.get(focus)?.focus());
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
          // Odnośnik (od 1.38) – od razu ze strzałką.
          if (color.clear && !choice.leader) {
            choice.leader = true;
            leaderOption.querySelector('input').checked = true;
          }
        }
      }));
      const option = (label, key, testID) => {
        const row = toggle({ checked: choice[key], label, onChange: (checked) => { choice[key] = checked; } });
        row.querySelector('input').dataset.testid = testID;
        return row;
      };
      const leaderOption = option('Strzałka do miejsca', 'leader', 'drawing-sticky-leader');
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
            leaderOption,
            option('Widoczna na obrazie w notatce', 'visible', 'drawing-sticky-visible')),
          h('p', { class: 'field__hint' }, 'Zwinięta karteczka to ikona z numerem – dotknięcie pokazuje jej treść. Koniec strzałki przeciągniesz na rysunku. '
            + 'Karteczka niewidoczna na obrazie jest tylko w edytorze (z przerywaną obwódką). Kolor „Bez tła” – odnośnik: sam tekst ze strzałką.')
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
      // Odnośnik (od 1.38): pole dopasowane do tekstu – nowy, zmieniony na odnośnik albo z innym tekstem lub wielkością.
      if (stickyColor(next.color).clear && !(element && stickyColor(element.color).clear && element.text === next.text && element.size === next.size)) {
        next.width = fitStickyWidth(next);
      }
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
      drawing.strokes.push(onActiveLayer(element));
      const index = drawing.strokes.length - 1;
      drawing.strokes[index] = linkEnds(element, [[element.tool === 'roughness' ? 'tip' : 'leader', snap]]);
      commitStep();
      selectOnly(drawing.strokes[index]);
      if (element.tool === 'gdt') technicalAfterFrame();
    }
    /** Ramka tolerancji na rysunku z liczbami „5 cm” (od 1.25): rysunek przechodzi na liczby bez jednostki (mm). */
    function technicalAfterFrame() {
      if (dimFormat(drawing).style === 'technical') return;
      setDimFormat('technical', defaultDimUnit(drawing.scale));
      announceTechnical();
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
        modifier: element?.modifier ?? '', deviations: Number.isFinite(element?.upper) && Number.isFinite(element?.lower),
        // Od 1.38: Ⓟ, modyfikatory przy bazach, drugi wiersz, „dookoła”.
        projected: element?.projected !== undefined && element?.projected !== null, datumMods: Array.from({ length: GDT_DATUMS_MAX }, (_, index) => element?.datumMods?.[index] ?? ''),
        row2: Boolean(element?.row2), row2Diameter: element?.row2?.diameter === true, allAround: element?.allAround === true
      };
      // Od 1.25: odchyłki po tolerancji (jak przy wymiarze – znak z przycisku), w jednostce liczb wymiarów.
      const upper = signedInput({ testID: 'drawing-gdt-upper', label: 'Odchyłka górna', value: element?.upper, sign: 1, onChange: () => refresh() });
      const lower = signedInput({ testID: 'drawing-gdt-lower', label: 'Odchyłka dolna', value: element?.lower, sign: -1, onChange: () => refresh() });
      const deviationsToggle = toggle({
        checked: choice.deviations, label: 'Odchyłki po tolerancji',
        onChange: (checked) => {
          choice.deviations = checked;
          refresh();
        }
      });
      deviationsToggle.querySelector('input').dataset.testid = 'drawing-gdt-deviations';
      const unit = dimUnitLabel(drawing.scale, dimFormat(drawing).style === 'technical' ? dimFormat(drawing) : { style: 'technical', unit: defaultDimUnit(drawing.scale) });
      const deviationsBox = h('div', { class: 'drawing__dim-tol-pair' },
        field('Górna', h('div', { class: 'drawing__dim-tol-row' }, upper.element, h('span', null, unit))),
        field('Dolna', h('div', { class: 'drawing__dim-tol-row' }, lower.element, h('span', null, unit))));
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
      // Modyfikator przy bazie (od 1.38): kolejne dotknięcia – brak, Ⓜ, Ⓛ.
      const modLabel = (mod) => (mod === 'M' ? 'Ⓜ' : mod === 'L' ? 'Ⓛ' : '–');
      const datumMods = datums.map((_, index) => {
        const button = toggleButton(modLabel(choice.datumMods[index]), `drawing-gdt-datum-mod-${index + 1}`, () => {
          choice.datumMods[index] = choice.datumMods[index] === '' ? 'M' : choice.datumMods[index] === 'M' ? 'L' : '';
          refresh();
        });
        button.setAttribute('aria-label', `Modyfikator przy bazie ${index + 1}`);
        return button;
      });
      const projected = toggleButton('Ⓟ', 'drawing-gdt-projected', () => {
        choice.projected = !choice.projected;
        refresh();
      });
      projected.setAttribute('aria-label', 'Strefa rzutowana (Ⓟ)');
      const projectedHeight = h('input', {
        class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder: 'wysokość, np. 12', maxLength: 16,
        'aria-label': 'Wysokość strefy rzutowanej', value: element?.projected ?? '', dataset: { testid: 'drawing-gdt-projected-height' }, onInput: () => refresh()
      });
      const row2Diameter = toggleButton('⌀', 'drawing-gdt-row2-diameter', () => {
        choice.row2Diameter = !choice.row2Diameter;
        refresh();
      });
      row2Diameter.setAttribute('aria-label', 'Drugi wiersz – strefa tolerancji średnica (⌀)');
      const row2Value = h('input', {
        class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder: '0,02', maxLength: 16,
        'aria-label': 'Tolerancja drugiego wiersza', value: element?.row2?.value ?? '', dataset: { testid: 'drawing-gdt-row2-value' }, onInput: () => refresh()
      });
      const row2Datums = Array.from({ length: GDT_DATUMS_MAX }, (_, index) => h('input', {
        class: 'input drawing__gdt-datum', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', maxLength: 5,
        'aria-label': `Drugi wiersz – baza ${index + 1}`, value: element?.row2?.datums?.[index] ?? '', dataset: { testid: `drawing-gdt-row2-datum-${index + 1}` },
        onInput: (event) => {
          event.target.value = event.target.value.toUpperCase();
          refresh();
        }
      }));
      const switchOf = (label, testID, key) => {
        const element = toggle({
          checked: choice[key], label,
          onChange: (checked) => {
            choice[key] = checked;
            refresh();
          }
        });
        element.querySelector('input').dataset.testid = testID;
        return element;
      };
      const row2Box = h('div', null,
        field('Drugi wiersz – tolerancja', h('div', { class: 'drawing__gdt-row' }, row2Diameter, row2Value)),
        field('Drugi wiersz – bazy', h('div', { class: 'drawing__gdt-row' }, row2Datums)));
      const datumHint = h('p', { class: 'field__hint' });
      const symbolName = h('p', { class: 'drawing__gdt-name', dataset: { testid: 'drawing-gdt-name' } });
      const preview = h('canvas', { class: 'drawing__gdt-preview', dataset: { testid: 'drawing-gdt-preview' } });
      const options = symbolOptions(choice);
      /** Ramka z pól okna (bez położenia). */
      const build = () => {
        const form = gdtSymbol(choice.symbol).form;
        const pairs = form ? [] : datums.map((input, index) => [input.value.trim().toUpperCase(), choice.datumMods[index]]).filter(([datum]) => datum);
        const next = {
          tool: 'gdt', x: element?.x ?? 0, y: element?.y ?? 0, size: SYMBOL_TEXT_SIZES[choice.size], color: inkHex(choice.color),
          symbol: choice.symbol, value: cleanGdtValue(value.value),
          datums: pairs.map(([datum]) => datum),
          ...(pairs.some(([, mod]) => mod) ? { datumMods: pairs.map(([, mod]) => mod) } : {}),
          ...(choice.diameter ? { diameter: true } : {}), ...(choice.modifier ? { modifier: choice.modifier } : {}),
          ...(choice.projected ? { projected: cleanGdtValue(projectedHeight.value) } : {}),
          ...(choice.row2 && cleanGdtValue(row2Value.value) ? {
            row2: {
              value: cleanGdtValue(row2Value.value), ...(choice.row2Diameter ? { diameter: true } : {}),
              datums: form ? [] : row2Datums.map((input) => input.value.trim().toUpperCase()).filter(Boolean)
            }
          } : {}),
          ...(choice.allAround ? { allAround: true } : {}),
          ...(element?.leader ? { leader: element.leader } : {})
        };
        const [high, low] = [upper.read(), lower.read()];
        if (choice.deviations && high !== null && low !== null && high >= low) Object.assign(next, { upper: high, lower: low });
        return { ...next, ...measureGdt(next) };
      };
      function refresh() {
        const form = gdtSymbol(choice.symbol).form;
        symbolName.textContent = gdtSymbol(choice.symbol).label;
        diameter.setAttribute('aria-pressed', String(choice.diameter));
        for (const button of modifiers) button.setAttribute('aria-pressed', String(button.dataset.letter === choice.modifier));
        for (const input of [...datums, ...row2Datums]) input.disabled = form;
        datumMods.forEach((button, index) => {
          button.textContent = modLabel(choice.datumMods[index]);
          button.setAttribute('aria-pressed', String(choice.datumMods[index] !== ''));
          button.disabled = form;
        });
        projected.setAttribute('aria-pressed', String(choice.projected));
        projectedHeight.hidden = !choice.projected;
        row2Diameter.setAttribute('aria-pressed', String(choice.row2Diameter));
        row2Box.hidden = !choice.row2;
        deviationsBox.hidden = !choice.deviations;
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
          field(`Tolerancja (${unit})`, h('div', { class: 'drawing__gdt-row' }, diameter, value, ...modifiers)),
          h('div', { class: 'drawing__settings-switch' }, deviationsToggle),
          deviationsBox,
          field('Strefa rzutowana', h('div', { class: 'drawing__gdt-row' }, projected, projectedHeight), { hint: 'Ⓟ z wysokością strefy (w jednostce liczb wymiarów).' }),
          field('Bazy (z modyfikatorem)', h('div', null, h('div', { class: 'drawing__gdt-row drawing__gdt-datums' },
            datums.map((input, index) => h('span', { class: 'drawing__gdt-datum-pair' }, input, datumMods[index]))), datumHint)),
          h('div', { class: 'drawing__settings-switch' }, switchOf('Drugi wiersz (ramka złożona)', 'drawing-gdt-row2', 'row2')),
          row2Box,
          h('div', { class: 'drawing__settings-switch' }, switchOf('Dookoła – tolerancja na całym obwodzie', 'drawing-gdt-all-around', 'allAround')),
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
          if (choice.deviations) {
            const [high, low] = [upper.read(), lower.read()];
            if (high === null || low === null) {
              api.setError('Wpisz obie odchyłki, np. +0,02 i −0,01 (znak – przycisk przed polem).');
              return false;
            }
            if (high < low) {
              api.setError('Odchyłka górna nie może być mniejsza od dolnej.');
              return false;
            }
          }
          if (choice.row2 && !cleanGdtValue(row2Value.value)) {
            api.setError('Wpisz tolerancję drugiego wiersza, np. 0,02 (albo wyłącz drugi wiersz).');
            return false;
          }
          const typed = [...datums, ...(choice.row2 ? row2Datums : [])].map((input) => input.value.trim().toUpperCase()).filter(Boolean);
          if (!gdtSymbol(choice.symbol).form && typed.some((datum) => !DATUM_RE.test(datum))) {
            api.setError('Baza to wielka litera, np. A (wspólna – A-B).');
            return false;
          }
          pending = sample;
          return true;
        },
        onClose: () => {
          if (!pending) return;
          putSymbol(element, pending);
          // Poprawiona ramka na rysunku z liczbami „5 cm” (od 1.25) – liczby bez jednostki (mm); nowa – po wstawieniu.
          if (element) technicalAfterFrame();
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
    /**
     * Chropowatość (ISO 1302): rodzaj obróbki, wymaganie („Ra 1,6”), wielkość i kolor; od 1.38 kierunek
     * struktury, naddatek na obróbkę, metoda wytwarzania, „dookoła” i podgląd.
     */
    function editRoughness(element = null) {
      if (!element) clearSelection();
      const choice = { ...symbolChoice(element), kind: element?.kind ?? 'removal', lay: element?.lay ?? '', allAround: element?.allAround === true };
      const preview = h('canvas', { class: 'drawing__gdt-preview', dataset: { testid: 'drawing-roughness-preview' } });
      const text = h('input', {
        class: 'input', type: 'text', autocomplete: 'off', spellcheck: 'false', maxLength: ROUGHNESS_TEXT_MAX, 'aria-label': 'Wymaganie',
        value: element?.text ?? 'Ra 1,6', dataset: { testid: 'drawing-roughness-text' }, onInput: () => refresh()
      });
      const allowance = h('input', {
        class: 'input drawing__roughness-allowance', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', maxLength: ROUGHNESS_ALLOWANCE_MAX,
        placeholder: 'naddatek', 'aria-label': 'Naddatek na obróbkę', value: element?.allowance ?? '', dataset: { testid: 'drawing-roughness-allowance' }, onInput: () => refresh()
      });
      const method = h('input', {
        class: 'input', type: 'text', autocomplete: 'off', spellcheck: 'false', maxLength: ROUGHNESS_METHOD_MAX, placeholder: 'metoda, np. szlifowane',
        'aria-label': 'Metoda wytwarzania', value: element?.method ?? '', dataset: { testid: 'drawing-roughness-method' }, onInput: () => refresh()
      });
      const aroundToggle = toggle({
        checked: choice.allAround, label: 'Dookoła (cały obwód)',
        onChange: (checked) => {
          choice.allAround = checked;
          refresh();
        }
      });
      aroundToggle.querySelector('input').dataset.testid = 'drawing-roughness-all-around';
      const layName = h('p', { class: 'field__hint', dataset: { testid: 'drawing-roughness-lay-name' } });
      /** Symbol z pól okna (bez położenia). */
      const build = () => {
        const next = {
          tool: 'roughness', x: element?.x ?? 0, y: element?.y ?? 0, size: SYMBOL_TEXT_SIZES[choice.size], color: inkHex(choice.color),
          text: text.value.trim().replace(/(\d)\.(\d)/g, '$1,$2').slice(0, ROUGHNESS_TEXT_MAX), kind: choice.kind,
          ...(choice.lay ? { lay: choice.lay } : {}),
          ...(cleanGdtValue(allowance.value) ? { allowance: cleanGdtValue(allowance.value).slice(0, ROUGHNESS_ALLOWANCE_MAX) } : {}),
          ...(method.value.trim() ? { method: method.value.trim().replace(/\s+/g, ' ').slice(0, ROUGHNESS_METHOD_MAX) } : {}),
          ...(choice.allAround ? { allAround: true } : {})
        };
        return { ...next, ...measureRoughness(next) };
      };
      function refresh() {
        layName.textContent = choice.lay ? `Kierunek struktury: ${ROUGHNESS_LAY_LABELS[choice.lay].toLowerCase()}.` : 'Bez oznaczenia kierunku struktury.';
        const sample = build();
        const box = roughnessLayout(sample).box;
        const ratio = window.devicePixelRatio || 1;
        const scale = Math.min(1.6, 300 / Math.max(1, box.width + 12));
        preview.width = Math.round((box.width + 12) * scale * ratio);
        preview.height = Math.round((box.height + 12) * scale * ratio);
        preview.style.width = `${Math.round((box.width + 12) * scale)}px`;
        preview.style.height = `${Math.round((box.height + 12) * scale)}px`;
        const ctx = preview.getContext('2d');
        ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
        paintRoughness(ctx, { ...sample, x: sample.x - box.x + 6, y: sample.y - box.y + 6 });
      }
      let pending = null;
      openFormSheet({
        title: element ? 'Chropowatość' : 'Nowy symbol chropowatości',
        submitLabel: element ? 'Zapisz' : 'Wstaw',
        build: () => [
          field('Obróbka', segmented({
            name: `drawing-roughness-kind-${Date.now()}`, label: 'Obróbka', value: choice.kind,
            options: ROUGHNESS_KINDS.map((kind) => ({ value: kind, label: ROUGHNESS_KIND_LABELS[kind] })),
            onChange: (kind) => {
              choice.kind = kind;
              refresh();
            }
          })),
          field('Wymaganie', h('div', null, text, h('div', { class: 'drawing__quick' },
            ['Ra 0,4', 'Ra 0,8', 'Ra 1,6', 'Ra 3,2', 'Ra 6,3', 'Ra 12,5', 'Rz 6,3', 'Rz 25'].map((item) => chip(item, `drawing-roughness-${item.replace(/[\s,]/g, '')}`, () => {
              text.value = item;
              refresh();
            })))), { hint: 'Pod poziomą kreską symbolu (ISO 1302); puste – sam symbol.' }),
          field('Kierunek struktury', h('div', null, segmented({
            name: `drawing-roughness-lay-${Date.now()}`, label: 'Kierunek struktury', value: choice.lay,
            options: [{ value: '', label: '–' }, ...ROUGHNESS_LAYS.map((lay) => ({ value: lay, label: lay }))],
            onChange: (lay) => {
              choice.lay = lay;
              refresh();
            }
          }), layName)),
          field('Naddatek i metoda wytwarzania', h('div', { class: 'drawing__gdt-row' }, allowance, method), { hint: 'Naddatek (mm) – z lewej strony symbolu, metoda – nad kreską.' }),
          h('div', { class: 'drawing__settings-switch' }, aroundToggle),
          field('Podgląd', preview),
          symbolOptions(choice),
          h('p', { class: 'field__hint' }, element ? 'Wierzchołek przeciągniesz na rysunku (kółko) – przyciąga się do krawędzi i przesuwa cały symbol.'
            : 'Po „Wstaw” dotknij krawędzi – tam stanie wierzchołek symbolu (zostaje przy krawędzi, gdy przesuwasz kształt).')
        ],
        onSubmit: () => {
          pending = build();
          return true;
        },
        onClose: () => {
          if (pending) putSymbol(element, pending);
        }
      });
      refresh();
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
    /**
     * Uchwyty: narożnik (zmiana wielkości; zwinięta karteczka – bez niego), koniec strzałki karteczki
     * i (od 1.26) granice kolumn tabeli na górnej krawędzi – szerokość dwóch sąsiednich kolumn.
     */
    function boxHandles(element) {
      // Symbol metrologiczny (od 1.22.1): bez narożnika – tylko koniec strzałki albo wierzchołek chropowatości.
      if (element.tool === 'roughness') return [{ id: 'target', x: element.x, y: element.y }];
      if (isSymbol(element)) return element.leader ? [{ id: 'target', x: element.leader.x, y: element.leader.y }] : [];
      const handles = [];
      if (!(element.tool === 'sticky' && element.collapsed)) handles.push({ id: 'resize', x: element.x + element.width, y: element.y + element.height });
      if (element.tool === 'sticky' && element.leader) handles.push({ id: 'target', x: element.leader.x, y: element.leader.y });
      if (element.tool === 'table') {
        let x = element.x;
        tableColumnWidths(element).slice(0, -1).forEach((width, column) => {
          x += width;
          handles.push({ id: `col-${column}`, x, y: element.y });
        });
      }
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
        else if (handle.id.startsWith('col-')) ctx.roundRect(point.x - 4, point.y - 11, 8, 22, 4);
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
      if (handle.startsWith('col-')) {
        // Granica kolumn (od 1.26): lewa kolumna do wskaźnika, prawa – o tyle węższa; tabela tej samej szerokości.
        const column = Number(handle.slice(4));
        const widths = tableColumnWidths(original);
        const left = original.x + widths.slice(0, column).reduce((sum, width) => sum + width, 0);
        const shares = moveColumnBorder(widths.map((width) => width / original.width), column, (point.x - left - widths[column]) / original.width);
        const next = { ...original, colWidths: cleanColumnWidths(shares, shares.length) };
        return { ...next, ...measureTable(next) };
      }
      if (original.tool === 'table') {
        const next = { ...original, width: Math.round(Math.max(original.rows[0].length * original.size * 2, point.x - original.x)) };
        return { ...next, ...measureTable(next) };
      }
      const next = {
        ...original,
        width: Math.round(Math.max(stickyColor(original.color).clear ? 60 : STICKY_MIN.width, point.x - original.x)),
        height: Math.round(Math.max(STICKY_MIN.height, point.y - original.y))
      };
      return { ...next, ...measureSticky(next) };
    }

    function selectAll() {
      if (tool !== 'select') setTool('select');
      clearSelection();
      selection = new Set(shownStrokes());
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
      // Rozpoznawanie kształtu (od 1.24): pióro (nie zakreślacz), bez linijki i liniuszka.
      if (!highlighter && tools.recognize) active.hold = { anchor: local(event), timer: 0, event };
      extendStroke(event);
    }
    /**
     * Przytrzymanie pióra: każdy ruch dalej niż HOLD_SLOP od miejsca, w którym pióro stanęło, liczy
     * czas od nowa; po HOLD_MS bez ruchu – rozpoznanie kształtu.
     */
    function watchHold(event) {
      const hold = active?.hold;
      if (!hold || active.recognized) return;
      const point = local(event);
      if (hold.timer && Math.hypot(point.x - hold.anchor.x, point.y - hold.anchor.y) <= HOLD_SLOP) return;
      clearTimeout(hold.timer);
      hold.anchor = point;
      hold.event = event;
      const stroke = active.stroke;
      hold.timer = setTimeout(() => recognizeHeld(stroke), HOLD_MS);
    }
    /** Kreska `stroke` wciąż rysowana i przytrzymana – figura w miejscu kreski (podgląd do puszczenia pióra). */
    function recognizeHeld(stroke) {
      // Kreska wzdłuż linijki albo liniuszka jest już prosta – bez rozpoznawania.
      if (active?.kind !== 'stroke' || active.stroke !== stroke || active.edge) return;
      const shape = recognizeStroke(stroke.points, { color: stroke.color }, { scale: view.scale });
      if (!shape) return;
      // Końce odcinka i strzałki przy krawędzi albo narożniku – przyciągnięte i przyklejone (jak narzędzie Kształty).
      let next = shape;
      let links = [];
      if (isSegment(shape)) {
        const ends = [shapePoint(shape, -0.5, 0), shapePoint(shape, 0.5, 0)];
        const snaps = ends.map((point) => edgeSnapAt(point, active.hold.event));
        if (snaps.some(Boolean)) {
          next = segmentBetween(shape, snaps[0] ?? ends[0], snaps[1] ?? ends[1]);
          links = [['start', snaps[0]], ['end', snaps[1]]].filter(([, snap]) => snap);
        }
      }
      active.recognized = { shape: next, links };
      renderLive();
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
      // Kreska już zamieniona w figurę (od 1.24) – dalszy ruch do puszczenia pióra jej nie zmienia.
      if (active.recognized) return;
      watchHold(event);
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
        if (active.mode === 'pixel') erased = eraseAt(drawing.strokes, x, y, radius, someHidden() ? isShown : null) || erased;
        else erased = history.remove(shownIndexes(strokesAt(drawing.strokes, x, y, radius))) || erased;
      }
      active.last = point;
      if (erased) {
        changed = true;
        requestRender();
      } else {
        requestLive();
      }
    }
    /**
     * Zaznaczanie: przeciągnięcie zaznaczenia – przesuwanie; poza nim – obrys. `snipping` – prawy przycisk (wycinek, od 1.17).
     * Z Shift (od 1.30) zaznaczenie zostaje: dotknięcie dokłada element albo go zdejmuje (też w ramce zaznaczenia –
     * blisko leżące elementy), obrys dokłada całe elementy.
     */
    function startSelect(event, snipping = false) {
      const point = toDrawing(event);
      const adding = !snipping && (Boolean(event.shiftKey) || shiftDown) && !snip && selectionKind === 'whole';
      if (!snipping && !adding && selectionHit(point)) {
        active = { kind: 'move', id: event.pointerId, touch: event.pointerType === 'touch', start: point, dx: 0, dy: 0, client: local(event) };
        requestRender();
        return;
      }
      if (!adding) clearSelection();
      const common = { id: event.pointerId, touch: event.pointerType === 'touch', start: point, client: local(event), snip: snipping, add: adding };
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
      // Od 1.35.1 rodzaj linii i wypełnienie – wybranego kształtu.
      const own = shapeToolStyle(tools, tools.shape);
      return {
        color: inkHex(tools.penColor), size: Math.round(((width.min + width.max) / 2) * 10) / 10, fill: own.fill, caps: segmentDefaultCaps(),
        // Od 1.27: rodzaj linii i znacznik punktu; od 1.40 kreskowanie, boki wielokąta foremnego i narożniki prostokąta.
        dash: own.dash, mark: tools.pointMark, hatch: own.hatch, sides: tools.ngonSides, corner: tools.rectCorner,
        // Od 1.42: osie okręgu, kierunek wymiaru liniowego.
        axes: tools.ellipseAxes, axis: tools.dimAxis
      };
    };
    /** Styl nowego kształtu z rodzajem wymiaru i wzorem odsunięcia (od 1.34) – dla narzędzia „Wymiar”. */
    const newShapeStyle = () => ({ ...shapeStyle(), mode: tools.dimMode, offset: tools.dimOffset });
    // Długość łuku (od 1.42) – tylko dotknięcie łuku, bez kształtu z przeciągnięcia.
    const dragShape = (from, to, event) => (tools.shape === 'dim' && tools.dimMode === 'arc' ? null
      : shapeFromDrag(tools.shape, from, to, newShapeStyle(), { tap: 0, lock: locked(event), mode: tools.ellipseMode }));
    const common = (event, point) => ({ id: event.pointerId, touch: event.pointerType === 'touch', start: point, client: local(event) });
    /** Punkt poza kartką (od 1.39 nowe elementy powstają tylko na niej); `margin` – zapas w jednostkach strony. */
    const offPage = (point, margin = 0) => point.x < -margin || point.y < -margin || point.x > drawing.width + margin || point.y > drawing.height + margin;
    /** Kreska z co najmniej jednym punktem na kartce (od 1.39 kreska w całości obok kartki przepada). */
    const onSheet = (stroke) => {
      for (let index = 0; index + 1 < stroke.points.length; index += 3) {
        if (!offPage({ x: stroke.points[index], y: stroke.points[index + 1] })) return true;
      }
      return false;
    };
    /** Punkt przesunięty na kartkę (koniec przeciąganego kształtu nie wychodzi poza nią). */
    const onPage = (point) => ({ x: Math.min(drawing.width, Math.max(0, point.x)), y: Math.min(drawing.height, Math.max(0, point.y)) });
    /** Dotknięcie obok kartki przy kształcie z punktów (od 1.39): bez punktu – zdjęte zaznaczenie, palec przesuwa stronę. */
    function startOffPage(event) {
      if (selection.size > 0) clearSelection();
      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, local(event));
        startGesture('page');
      }
      updateToolbar();
      requestRender();
    }
    /** Kształty: przeciągnięcie zaznaczonego kształtu przesuwa go, gdzie indziej – nowy kształt. */
    function startShape(event) {
      // Od 1.39 kształt powstaje tylko na kartce: początek obok niej – na jej brzegu (przeciągnięcie, które
      // wchodzi na kartkę), samo dotknięcie obok kartki tylko zdejmuje zaznaczenie.
      const raw = toDrawing(event);
      const off = offPage(raw);
      const point = off ? onPage(raw) : raw;
      const [only] = selection;
      // Wymiar i kształty z punktów (od 1.34) zaczynają się tam, gdzie wskaźnik – także na zaznaczonym (np. wspólny narożnik).
      const measuring = tools.shape === 'dim' || multiKind() !== null;
      if (!measuring && selection.size === 1 && isShape(only) && (shapeContains(only, point.x, point.y) || touchesShape(only, point.x, point.y, HANDLE_HIT / view.scale))) {
        active = { kind: 'move', ...common(event, point), dx: 0, dy: 0 };
        requestRender();
        return;
      }
      const hadSelection = selection.size > 0;
      clearSelection();
      // Od 1.34: okrąg przez 3 punkty, łuk i wymiar kąta – punkt po punkcie (od 1.39 – punkty tylko na kartce).
      if (multiKind()) {
        if (off) startOffPage(event);
        else startPoints(event, point, hadSelection);
        return;
      }
      active = { kind: 'shape-new', ...common(event, point), shape: null, moved: false, hadSelection, offStart: off, onSheet: !off };
      // Odcinek i strzałka (od 1.22), wymiar i okrąg ze środka albo z dwóch punktów (od 1.34): początek przyciągnięty.
      const snap = snapsPoints() ? edgeSnapAt(point, event) : null;
      if (snap) {
        active.start = { x: snap.x, y: snap.y };
        active.startSnap = snap;
      }
    }
    /** Punkt kształtu z kilku punktów (od 1.34): dotknięcie – jeden punkt, przeciągnięcie – od pierwszego do drugiego. */
    function startPoints(event, point, hadSelection) {
      const kind = multiKind();
      if (pending?.kind !== kind) pending = { kind, points: [] };
      const snap = edgeSnapAt(point, event);
      const at = snap ? { x: snap.x, y: snap.y } : point;
      active = { kind: 'points', ...common(event, at), point: at, snap, moved: false, hadSelection: hadSelection && pending.points.length === 0 };
      requestLive();
    }
    /** Kształt z trzech punktów albo null (punkty na jednej prostej, ramię kąta bez długości). */
    function pointsShape(kind, [a, b, c]) {
      if (kind === 'circle3') return circleFromPoints(a, b, c, shapeStyle());
      if (kind === 'arc') return arcFromPoints(a, b, c, shapeStyle());
      if (kind === 'arcCenter') return arcFromCenter(a, b, c, shapeStyle());
      return angleDimFromPoints(a, b, c, shapeStyle());
    }
    /** Koniec gestu przy kształcie z punktów: nowy punkt; przy trzecim – kształt (jeden krok cofania), zostaje zaznaczony. */
    /** Łamana z punktów strony (od 1.43) – zamknięta: wielokąt; ramka bez obrotu, styl narzędzia. */
    function polylineFrom(points, closed) {
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const frame = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, angle: 0 };
      const style = shapeStyle();
      return withDash(polyFromPoints(closed ? 'polygon' : 'polyline', points, frame, style), style.dash);
    }
    /** Koniec łamanej (Enter, Esc, ostatni punkt jeszcze raz) – zamknięta przez dotknięcie pierwszego punktu. */
    function completePolyline(closed) {
      const points = pending?.kind === 'polyline' ? pending.points : [];
      pending = null;
      pendingHover = null;
      if (points.length >= (closed ? 3 : 2)) {
        const shape = onActiveLayer(polylineFrom(points, closed));
        history.add(shape);
        changed = true;
        selection = new Set([shape]);
        selectionKind = 'whole';
      }
      updateShapeHint();
      updateToolbar();
      requestRender();
    }
    /** Punkt łamanej (od 1.43): dotknięcie – wierzchołek; ostatni jeszcze raz – koniec, pierwszy – wielokąt. */
    function finishPolylinePoint(done) {
      const { points } = pending;
      const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * view.scale < 10;
      const at = points.length === 0 ? done.start : done.point;
      if (points.length >= 2 && same(at, points.at(-1))) {
        completePolyline(false);
        return;
      }
      if (points.length >= 3 && same(at, points[0])) {
        completePolyline(true);
        return;
      }
      if (points.length === 0) {
        points.push(done.start);
        if (done.moved && !same(done.point, done.start)) points.push(done.point);
      } else if (!same(at, points.at(-1))) {
        points.push(at);
      }
      if (points.length >= POLY_NODES_MAX) {
        completePolyline(false);
        return;
      }
      updateShapeHint();
    }
    /** Okrąg styczny (od 1.43): dwa dotknięte elementy (linia – bok najbliższy dotknięciu, okrąg albo łuk), potem promień w oknie. */
    function finishTangentPick(done) {
      const point = done.moved ? done.point : done.start;
      const shown = shownStrokes();
      const stroke = strokesAt(shown, point.x, point.y, HANDLE_HIT / view.scale).map((index) => shown[index]).find((item) => edgesOf(item).length > 0);
      if (!stroke) {
        flash('Dotknij linii albo okręgu – do nich okrąg będzie styczny.');
        return;
      }
      pending.points.push(point);
      pending.targets = [...(pending.targets ?? []), tangentTarget(stroke, point)];
      if (pending.points.length < 2) {
        updateShapeHint();
        return;
      }
      const { points, targets } = pending;
      askEditLength('ttr', (radius) => {
        pending = null;
        const result = tangentCircle(targets[0], targets[1], radius, points, shapeStyle());
        updateShapeHint();
        if (result.error) {
          flash(result.error);
          requestLive();
          return;
        }
        const [circle] = result.shapes;
        history.add(onActiveLayer(circle));
        changed = true;
        selection = new Set([circle]);
        selectionKind = 'whole';
        updateToolbar();
        requestRender();
      }, () => {
        // Okno zamknięte bez promienia – dotknięcia od nowa.
        pending = null;
        updateShapeHint();
        requestLive();
      });
    }
    function finishPoints(done) {
      if (!pending || pending.kind !== multiKind()) return;
      // Dotknięcie przy zaznaczeniu tylko je zdejmuje (jak przy innych kształtach).
      if (done.hadSelection && !done.moved) return;
      if (pending.kind === 'polyline') {
        finishPolylinePoint(done);
        return;
      }
      if (pending.kind === 'ttr') {
        finishTangentPick(done);
        return;
      }
      const { points } = pending;
      const push = (point) => {
        const last = points.at(-1);
        if (!last || Math.hypot(point.x - last.x, point.y - last.y) * view.scale >= 3) points.push(point);
      };
      if (points.length === 0) {
        push(done.start);
        if (done.moved) push(done.point);
      } else {
        push(done.point);
      }
      if (points.length >= 3) {
        const shape = pointsShape(pending.kind, points.slice(0, 3));
        if (!shape) {
          points.splice(2);
          flash(pending.kind === 'angle' ? 'Ramię kąta bez długości – dotknij innego punktu.'
            : pending.kind === 'arcCenter' ? 'Koniec w kierunku początku – dotknij innego punktu.' : 'Trzy punkty na jednej prostej – dotknij innego trzeciego punktu.');
        } else {
          pending = null;
          history.add(onActiveLayer(shape));
          changed = true;
          selection = new Set([shape]);
          selectionKind = 'whole';
        }
      }
      updateShapeHint();
    }
    /** Okrąg (elipsa o równych bokach, bez pochylenia). */
    const isCircle = (stroke) => stroke.shape === 'ellipse' && !stroke.skew && Math.abs(stroke.w - stroke.h) <= Math.max(stroke.w, stroke.h) * 0.02;
    /** Środek elementu – strona linii wymiarowej (od 1.34): dalej od niego. */
    function centerOf(target) {
      if (isShape(target)) return { x: target.x, y: target.y };
      const box = elementBox(target);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    /** Przyklejenie końca wymiaru w punkcie `point` leżącym na elemencie `target` (krawędź okręgu, narożnik). */
    const snapOn = (target, point) => findSnap([target], point, 1, { boxOf: elementBox });
    /** Wymiar liniowy w odsunięciu z wzoru po stronie dalszej od `away` – piętro dalej, gdy wchodziłby na inny. */
    function placedDim(shape, away) {
      const sided = away ? dimAwayFrom(shape, away) : shape;
      return withDimOffset(sided, 'length', stackDimOffset(drawing.strokes, sided, 'length', dimOffset(sided, 'length')));
    }
    /**
     * Wymiar z dotknięcia (od 1.34): średnica albo promień – okręgu albo łuku pod palcem (linia wymiarowa
     * w kierunku dotknięcia, końce przyklejone – wymiar idzie za okręgiem); liniowy – krawędzi pod palcem
     * (odcinek, bok kształtu albo ramki; końce przyklejone do jej narożników). { shape, links } albo null.
     */
    function measureAt(point) {
      const reach = HANDLE_HIT / view.scale;
      const style = newShapeStyle();
      // Długość łuku (od 1.42): łuk pod palcem – wymiar na zewnątrz, z tymi samymi punktami co łuk.
      if (tools.dimMode === 'arc') {
        const target = [...shownStrokes()].reverse().find((stroke) => isShape(stroke) && isArc(stroke) && touchesShape(stroke, point.x, point.y, reach));
        return target && arcGeometry(target) ? { shape: arcDimFromArc(target, style), links: [] } : null;
      }
      if (tools.dimMode === 'diameter' || tools.dimMode === 'radius') {
        const target = [...shownStrokes()].reverse().find((stroke) => isShape(stroke) && (isArc(stroke) || isCircle(stroke)) && touchesShape(stroke, point.x, point.y, reach));
        const circle = target ? (isArc(target) ? arcGeometry(target) : { center: { x: target.x, y: target.y }, radius: target.w / 2 }) : null;
        if (!circle) return null;
        const { center, radius } = circle;
        const length = Math.hypot(point.x - center.x, point.y - center.y);
        const [ux, uy] = length > 1e-6 ? [(point.x - center.x) / length, (point.y - center.y) / length] : [Math.SQRT1_2, -Math.SQRT1_2];
        const edge = (sign) => ({ x: center.x + ux * radius * sign, y: center.y + uy * radius * sign });
        if (tools.dimMode === 'radius') {
          return { shape: dimFromPoints('radius', center, edge(1), style), links: [['start', { target, ref: { kind: 'center' } }], ['end', snapOn(target, edge(1))]] };
        }
        // Średnica łuku – bez przyklejenia (drugi koniec nie leży na łuku).
        return { shape: dimFromPoints('diameter', edge(-1), edge(1), style), links: isArc(target) ? [] : [['start', snapOn(target, edge(-1))], ['end', snapOn(target, edge(1))]] };
      }
      const snap = findSnap(shownStrokes(), point, reach, { boxOf: elementBox });
      // Od 1.42 także środek boku (to samo miejsce na krawędzi).
      if (!snap || (snap.kind !== 'edge' && snap.kind !== 'mid') || !Number.isInteger(snap.ref?.index)) return null;
      const { target } = snap;
      if (isShape(target) && (isArc(target) || target.shape === 'curve' || target.shape === 'xline' || target.shape === 'ray')) return null;
      const geometry = snapGeometry(target, elementBox);
      const [a, b] = geometry.edges[snap.ref.index];
      const ends = isShape(target) && isSegment(target) ? [0, 1] : [snap.ref.index, (snap.ref.index + 1) % geometry.corners.length];
      return {
        shape: placedDim(dimFromPoints('linear', a, b, style, tools.dimOffset), centerOf(target)),
        links: ends.map((index, at) => [at === 0 ? 'start' : 'end', { target, ref: { kind: 'corner', index } }])
      };
    }
    /** Koniec gestu narzędzia „Wymiar” (od 1.34): przeciągnięcie – wymiar między punktami, dotknięcie – measureAt. */
    function finishDim(done) {
      let made = null;
      // Długość łuku (od 1.42) – zawsze dotknięcie (przeciągnięcie – w miejscu puszczenia).
      if (!done.moved || tools.dimMode === 'arc') {
        if (done.hadSelection && !done.moved) return;
        made = measureAt(done.moved ? done.point : done.start);
        if (!made) {
          flash(tools.dimMode === 'linear' ? 'Wymiar: przeciągnij od punktu do punktu albo dotknij krawędzi kształtu.'
            : tools.dimMode === 'arc' ? 'Dotknij linii łuku.' : 'Dotknij linii okręgu albo łuku.');
          return;
        }
      } else if (done.shape) {
        const links = [['start', done.startSnap], ['end', done.endSnap]].filter(([, snap]) => snap);
        const target = (done.startSnap ?? done.endSnap)?.target;
        made = { shape: dimMode(done.shape) === 'linear' ? placedDim(done.shape, target ? centerOf(target) : null) : done.shape, links };
      }
      if (!made) return;
      const links = made.links.filter(([, snap]) => snap);
      history.begin();
      const added = onActiveLayer(links.length > 0 ? linkEnds(made.shape, links) : made.shape);
      drawing.strokes.push(added);
      commitStep();
      changed = true;
      selection = new Set([added]);
      selectionKind = 'whole';
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
      return findSnap(shownStrokes(), point, EDGE_SNAP / view.scale, { exclude, boxOf: elementBox });
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
      // Od 1.42 miejsce bez zapisu (kreska pióra, przecięcie prostych) – koniec wolny.
      for (const [end, snap] of links) next = withLink(next, end, snap?.ref ? { ...snap.ref, id: ensureId(snap.target, ids) } : null);
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
    /**
     * Kształt z punktów w trakcie (od 1.34): postawione punkty, linia między nimi, a przy trzecim (pod palcem
     * albo myszą) – podgląd okręgu, łuku albo wymiaru kąta.
     */
    function paintPending(ctx) {
      const kind = multiKind();
      if (!kind || (pending?.kind !== kind && active?.kind !== 'points')) return;
      const points = [...(pending?.kind === kind ? pending.points : [])];
      if (active?.kind === 'points') {
        // Pierwszy gest – od początku do miejsca pod palcem; następne – punkt pod palcem.
        if (points.length === 0) {
          points.push(active.start);
          if (active.moved) points.push(active.point);
        } else {
          points.push(active.point);
        }
      } else if (pendingHover && points.length > 0 && kind !== 'ttr') {
        points.push(pendingHover);
      }
      if (points.length === 0) return;
      const preview = kind === 'polyline' ? (points.length >= 2 ? polylineFrom(points, false) : null)
        : kind === 'ttr' ? null : points.length >= 3 ? pointsShape(kind, points.slice(0, 3)) : null;
      if (preview) paintStroke(ctx, preview, { scale: drawing.scale, dimFormat: dimFormat(drawing) });
      ctx.save();
      ctx.strokeStyle = ZERO_COLOR;
      ctx.fillStyle = ZERO_COLOR;
      ctx.lineWidth = 1.5 / view.scale;
      if (!preview && points.length >= 2 && kind !== 'ttr') {
        ctx.setLineDash([6 / view.scale, 4 / view.scale]);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const point of kind === 'polyline' ? points : points.slice(0, 3)) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4.5 / view.scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    /** Znacznik miejsca przyciągnięcia: kwadrat – narożnik, kółko – krawędź; od 1.42 trójkąt – środek boku, × – przecięcie. */
    function paintSnapMarker(ctx, snap) {
      const point = toScreen(snap);
      ctx.save();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.lineWidth = 2;
      ctx.strokeStyle = ZERO_COLOR;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      if (snap.kind === 'corner') ctx.rect(point.x - 6, point.y - 6, 12, 12);
      else if (snap.kind === 'mid') {
        ctx.moveTo(point.x, point.y - 7);
        ctx.lineTo(point.x + 7, point.y + 5);
        ctx.lineTo(point.x - 7, point.y + 5);
        ctx.closePath();
      } else if (snap.kind === 'intersection') {
        ctx.moveTo(point.x - 7, point.y - 7);
        ctx.lineTo(point.x + 7, point.y + 7);
        ctx.moveTo(point.x + 7, point.y - 7);
        ctx.lineTo(point.x - 7, point.y + 7);
      } else ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      if (snap.kind !== 'intersection') ctx.fill();
      // Środek okręgu albo łuku (od 1.34) – kółko z krzyżykiem.
      if (snap.kind === 'center') {
        ctx.moveTo(point.x - 9, point.y);
        ctx.lineTo(point.x + 9, point.y);
        ctx.moveTo(point.x, point.y - 9);
        ctx.lineTo(point.x, point.y + 9);
      }
      ctx.stroke();
      ctx.restore();
    }
    /** Przyklejone końce idące za przesuwanym albo zmienianym elementem: mapa przyklejony → podgląd (albo null). */
    function activeFollowers() {
      let previews = null;
      if (active?.kind === 'move') previews = new Map([...selection].filter((stroke) => stroke.id).map((stroke) => [stroke, translateStroke(stroke, active.dx, active.dy)]));
      else if (active?.kind === 'turn') previews = new Map(active.items.map((stroke, index) => [stroke, active.preview[index]]).filter(([stroke]) => stroke.id));
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
        active.shape = dragShape(active.start, active.endSnap ?? active.point, null);
        if (active.endSnap && isSegment(active.shape)) active.shape = segmentBetween(active.shape, active.start, active.endSnap);
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
      let point = toDrawing(event);
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
        case 'turn': {
          if (!active.moved && Math.hypot(point.x - active.start.x, point.y - active.start.y) * view.scale < TAP_SLOP) break;
          active.moved = true;
          const { center } = active;
          // Co 15° z Shift (albo „Proporcje”), bez niego – przyciągany do pełnych 15°.
          active.angle = snapTurn(Math.atan2(point.y - center.y, point.x - center.x) - active.grab, locked(event));
          active.preview = active.items.map((stroke) => rotateStroke(stroke, center.x, center.y, active.angle));
          requestLive();
          break;
        }
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
          // Koniec kształtu (od 1.39) – na kartce; zaczęty obok niej musi na nią wejść.
          if (!offPage(point)) active.onSheet = true;
          point = onPage(point);
          active.point = point;
          if (Math.hypot(point.x - active.start.x, point.y - active.start.y) * view.scale >= TAP_SLOP) active.moved = true;
          if (active.moved) active.shape = dragShape(active.start, point, event);
          // Koniec odcinka przyciągnięty (od 1.22) – dokładnie w tym miejscu, bez przyciągania kąta; od 1.34 także wymiaru i okręgu.
          active.endSnap = active.moved && snapsPoints() ? edgeSnapAt(point, event) : null;
          if (active.endSnap && active.shape) {
            active.shape = isSegment(active.shape) ? segmentBetween(active.shape, active.start, active.endSnap)
              : dragShape(active.start, { x: active.endSnap.x, y: active.endSnap.y }, event);
          }
          requestLive();
          break;
        case 'points': {
          // Od 1.34: punkt kształtu z kilku punktów – przyciągany; od 1.39 – na kartce.
          point = onPage(point);
          active.snap = edgeSnapAt(point, event);
          active.point = active.snap ? { x: active.snap.x, y: active.snap.y } : point;
          if (Math.hypot(point.x - active.start.x, point.y - active.start.y) * view.scale >= TAP_SLOP) active.moved = true;
          requestLive();
          break;
        }
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
          // Dotknięcie bez przesunięcia (od 1.24) nie rusza kółka – przy zaznaczaniu zaznacza to, co pod nim.
          if (!active.moved && Math.hypot(point.x - active.start.x, point.y - active.start.y) * view.scale < TAP_SLOP) break;
          active.moved = true;
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
        const [top] = shownIndexes(strokesAt(drawing.strokes, done.start.x, done.start.y, SELECTION_PAD / view.scale));
        // Dotknięcie pustego środka kształtu też go zaznacza (najwyższego).
        const inside = drawing.strokes.findLastIndex((stroke) => isShape(stroke) && isShown(stroke) && shapeContains(stroke, done.start.x, done.start.y));
        const index = top ?? (inside >= 0 ? inside : undefined);
        const target = index === undefined ? null : drawing.strokes[index];
        if (done.add) {
          // Shift (od 1.30): element dokładany do zaznaczenia albo z niego zdejmowany.
          const next = new Set(selection);
          if (target && next.has(target)) next.delete(target);
          else if (target) next.add(target);
          selection = next;
        } else {
          selection = new Set(target ? [target] : []);
        }
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
      const found = shownIndexes(done.kind === 'lasso' ? strokesInPolygon(drawing.strokes, polygon) : strokesInRect(drawing.strokes, done.rect));
      selection = new Set([...(done.add ? selection : []), ...found.map((index) => drawing.strokes[index])]);
      selectionKind = 'whole';
    }
    function finishActive(cancelled = false) {
      if (!active) return;
      const done = active;
      active = null;
      let focusField = null;
      if (done.kind === 'stroke') {
        clearTimeout(done.hold?.timer);
        if (!cancelled && done.recognized) {
          // Dwa kroki cofania (od 1.24): odręczna kreska, potem figura – „Cofnij” przywraca kreskę.
          history.add(onActiveLayer(done.stroke));
          history.begin();
          const index = drawing.strokes.indexOf(done.stroke);
          if (index >= 0) drawing.strokes[index] = onActiveLayer(done.recognized.links.length > 0 ? linkEnds(done.recognized.shape, done.recognized.links) : done.recognized.shape);
          commitStep();
          changed = true;
        } else if (!cancelled && done.stroke.points.length >= 3 && onSheet(done.stroke)) {
          history.add(onActiveLayer(done.stroke));
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
      } else if (done.kind === 'guide-move' && !cancelled && !done.moved && tool === 'select') {
        // Dotknięcie kółka liniuszka przy zaznaczaniu (od 1.24) – jak dotknięcie strony: zaznacza element pod nim.
        clearSelection();
        finishOutline({ kind: 'marquee', start: done.start, rect: { x0: done.start.x, y0: done.start.y, x1: done.start.x, y1: done.start.y } });
      } else if (done.kind === 'points' && !cancelled) {
        finishPoints(done);
      } else if (done.kind === 'shape-new' && done.offStart && (!done.moved || !done.onSheet)) {
        // Od 1.39: dotknięcie albo przeciągnięcie obok kartki – bez kształtu (zaznaczenie już zdjęte).
        updateToolbar();
      } else if (done.kind === 'shape-new' && !cancelled && tools.shape === 'dim') {
        finishDim(done);
      } else if (done.kind === 'shape-new' && !cancelled) {
        // Dotknięcie przy zaznaczonym kształcie tylko je zdejmuje; inaczej – kształt (dotknięcie – domyślnej wielkości).
        if (done.moved || !done.hadSelection) {
          const shape = done.shape ?? shapeFromDrag(tools.shape, done.start, done.start, newShapeStyle(), { lock: locked(), mode: tools.ellipseMode });
          // Końce przyciągnięte (od 1.22) – przyklejone do kształtu (idą za nim).
          const links = isSegment(shape) ? [['start', done.startSnap], ['end', done.moved ? done.endSnap : null]].filter(([, snap]) => snap) : [];
          let added = shape;
          if (links.length > 0) {
            history.begin();
            added = onActiveLayer(linkEnds(shape, links));
            drawing.strokes.push(added);
            commitStep();
          } else {
            history.add(onActiveLayer(shape));
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
      } else if (done.kind === 'turn' && !cancelled && done.moved && done.angle !== 0) {
        const { center, angle } = done;
        replaceSelection(done.items, transformStrokes(done.items, (stroke) => rotateStroke(stroke, center.x, center.y, angle), elementBox));
      } else if (done.kind === 'box-edit' && !cancelled && done.moved) {
        if (done.handle === 'target') replaceLinked(done.original, done.preview, [[done.original.tool === 'roughness' ? 'tip' : 'leader', done.snap]]);
        else replaceShape(done.original, done.preview);
      } else if (done.kind === 'move' && !cancelled) {
        const tap = Math.abs(done.dx) * view.scale < TAP_SLOP && Math.abs(done.dy) * view.scale < TAP_SLOP;
        const [only] = selection;
        if (!tap) moveSelection(done.dx, done.dy);
        // Przy „Przesuń” (od 1.35) dotknięcie niczego nie otwiera.
        else if (done.free) requestLive();
        // Dotknięcie zaznaczonego pola tekstowego albo wzoru – poprawka; kształtu (od 1.17) – tekst na nim; szyku (od 1.19) – parametry.
        else if (selection.size === 1 && isTextual(only) && touchesStroke(only, done.start.x, done.start.y, 0)) editElement(only.tool, only);
        // Tabela i karteczka (od 1.21) – okno edycji.
        else if (selection.size === 1 && isBox(only) && touchesStroke(only, done.start.x, done.start.y, 0)) editBox(only, done.start);
        else if (selection.size === 1 && isArray(only) && touchesStroke(only, done.start.x, done.start.y, SELECTION_PAD / view.scale)) editArray();
        else if (selection.size === 1 && isShape(only) && !isMeasure(only)
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
      if (b && gesture.distance > 0) {
        // Dwa palce (od 1.24.2 – liczone od początku gestu, nie od poprzedniej klatki): powiększenie
        // według odstępu palców, a punkt strony, który był pod środkiem palców na początku, zostaje
        // pod ich środkiem – także gdy palce przy tym idą (przesuwanie). Dawniej przesunięcie od początku
        // gestu łączyło się ze skalą z poprzedniej klatki i strona uciekała w stronę lewego górnego rogu.
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gesture.startZoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / gesture.distance));
        const box = live.getBoundingClientRect();
        view.zoom = zoom;
        view.scale = fitScale() * zoom;
        view.x = center.x - box.left - gesture.point.x * view.scale;
        view.y = center.y - box.top - gesture.point.y * view.scale;
        clampView();
        zoomButton.textContent = `${Math.round(zoom * 100)}%`;
        refreshRulerPanel?.();
        requestRender();
        return;
      }
      view.x = gesture.startX + center.x - gesture.center.x;
      view.y = gesture.startY + center.y - gesture.center.y;
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
      // Lewy Alt wciśnięty razem ze wskaźnikiem – to swobodne końce, nie przełączenie na zaznaczanie.
      if (altTap) altTap.clean = false;
      // Ctrl przy myszy albo rysiku (od 1.19) – zaznaczanie od razu, bez czekania na przytrzymanie.
      if (event.ctrlKey && event.pointerType !== 'touch' && tool !== 'select' && !active) beginCtrlHold();
      // Prawy przycisk myszy albo przycisk na rysiku (od 1.32) – zaznaczanie przy każdym narzędziu; narzędzie
      // zostaje zaznaczaniem (lewy Alt albo przycisk zaznaczania wraca do poprzedniego). Wycinek – tryb „Wycinek”.
      const rightSelect = event.button === 2 && (event.pointerType === 'mouse' || event.pointerType === 'pen') && !picking && !placing && !symbolPlacing && !active;
      if (rightSelect && tool !== 'select') {
        ctrlHold = null;
        setTool('select');
      }
      if (event.pointerType === 'mouse' && event.button !== 0 && !rightSelect) return;
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
      // „Przesuń” (od 1.35): przeciągnięcie w dowolnym miejscu przesuwa zaznaczenie (drugi palec – jak zwykle, powiększanie).
      if (moveMode && selection.size > 0 && !snip && !active && !gesture && touches.size === 0 && event.button === 0) {
        try {
          live.setPointerCapture(event.pointerId);
        } catch {
          // przechwycenie nie jest konieczne
        }
        active = { kind: 'move', id: event.pointerId, touch: event.pointerType === 'touch', start: point, dx: 0, dy: 0, client: local(event), free: true };
        requestRender();
        return;
      }
      // Wstawianie symbolu metrologicznego (od 1.22.1): dotknięcie – miejsce strzałki, trójkąta albo wierzchołka.
      // Gdy aplikacja zna już rysik, palec (i dłoń) przesuwa stronę – symbol wstawia rysik albo mysz.
      if (symbolPlacing && !active && !gesture && touches.size === 0 && !(fingerPans() && event.pointerType === 'touch')) {
        // Od 1.39 symbol tylko na kartce – dotknięcie obok niej czeka dalej na miejsce.
        if (offPage(point, HANDLE_HIT / view.scale)) flash('Dotknij krawędzi na kartce – poza nią symbol nie powstaje (Esc – bez wstawiania).');
        else placeSymbol(point, event);
        return;
      }
      // Odbicie względem prostej i „Styl jak…” (od 1.41): dotknięcie – punkt osi albo element wzoru.
      if (pointPick && !active && !gesture && touches.size === 0 && !(fingerPans() && event.pointerType === 'touch')) {
        pickPointAt(point, event);
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
        if (!hit && fingerPans() && !onSelection(point) && !shapeHandleAt(point) && !boxHandleAt(point) && !guideKnobHit(point) && !arrayCenterHit(point) && !turnKnobHit(point)) {
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
      const handle = rightSelect ? null : shapeHandleAt(point);
      // Narożnik tabeli albo karteczki i koniec strzałki karteczki (od 1.21).
      const boxHandle = rightSelect || handle ? null : boxHandleAt(point);
      // Środek zaznaczonego szyku kołowego (od 1.19) – przed linijką i zaznaczeniem.
      const centerHit = !rightSelect && !handle && !boxHandle && arrayCenterHit(point);
      // Uchwyt obrotu zaznaczenia (od 1.30).
      const turnHit = !rightSelect && !handle && !boxHandle && !centerHit && turnKnobHit(point);
      const hit = handle || boxHandle || centerHit || turnHit || rightSelect ? null : rulerHit(point);
      if (rightSelect) startSelect(event);
      else if (handle) startShapeEdit(event, handle);
      else if (boxHandle) startBoxEdit(event, boxHandle);
      else if (centerHit) startArrayCenter(event);
      else if (turnHit) startTurn(event);
      else if (hit === 'handle') startRuler(event, 'ruler-rotate');
      // Zaznaczenie przed kółkiem liniuszka (od 1.24): przeciągnięcie zaznaczonego pola albo kształtu,
      // który leży na kółku, przesuwa je, a nie liniuszek.
      else if (guideKnobHit(point) && !onSelection(point)) startGuideMove(event);
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
        } else if (pointPick && EDIT_END[pointPick.kind]) {
          editHover = editHoverAt(toDrawing(event));
          requestLive();
        } else if (pointPick && pointPick.kind !== 'match') {
          // Oś odbicia pod myszą; łańcuch i od bazy (od 1.42) – miejsce przyciągnięcia.
          const at = toDrawing(event);
          const snap = edgeSnapAt(at, event);
          axisHover = snap ? { x: snap.x, y: snap.y } : at;
          edgeHover = snap;
          requestLive();
        } else if (symbolPlacing || (tool === 'shape' && snapsPoints())) {
          const at = toDrawing(event);
          const snap = edgeSnapAt(at, event);
          // Od 1.34: kształt z punktów – podgląd do punktu pod myszą.
          if (pending?.points.length > 0) {
            pendingHover = snap ? { x: snap.x, y: snap.y } : at;
            edgeHover = snap;
            requestLive();
          } else if (snap || edgeHover) {
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
    // Prawy przycisk na płótnie zaznacza – bez menu przeglądarki.
    live.addEventListener('contextmenu', (event) => event.preventDefault());
    live.addEventListener('pointerleave', () => {
      if (!hover && !pickHover && !edgeHover && !pendingHover) return;
      hover = null;
      pickHover = null;
      edgeHover = null;
      pendingHover = null;
      requestLive();
    });
    // Środkowy przycisk: bez przewijania przeglądarki (kółko z czterema strzałkami w Windows).
    live.addEventListener('mousedown', (event) => {
      if (event.button === 1) event.preventDefault();
    });
    live.addEventListener('auxclick', (event) => event.preventDefault());
    live.addEventListener('wheel', (event) => {
      event.preventDefault();
      // Od 1.32: kółko myszy przy kółku narzędzi (między małymi kółkami) obraca grupy, a nie przesuwa strony.
      if (!event.ctrlKey && !event.metaKey && RING_SIDES.some((side) => rings[side].wheelAt(event))) return;
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
          // Zdjęcie pod kreskami musi być wczytane, zanim powstanie obraz rysunku (zwolnione – od nowa).
          const saved = pages.filter((page) => page.changed && page.drawing);
          await Promise.all(saved.map((page) => page.ready ?? loadMedia(page)));
          // Dodane kartki (od 1.19) – tylko z treścią (pusta nowa kartka nie trafia do notatki).
          const changedSheets = [];
          const extra = [];
          for (const page of saved) {
            if (page.added && !hasContent(page.drawing)) continue;
            const image = await renderDrawingImage(page.drawing, page.media);
            if (page.added) extra.push({ drawing: page.drawing, image, title: page.title });
            else changedSheets.push({ index: pages.indexOf(page), drawing: page.drawing, image });
          }
          result = changedSheets.length > 0 || extra.length > 0 ? { sheets: changedSheets, pages: extra } : null;
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
    // Od 1.32: oko w nagłówku chowa i przywraca cały interfejs (zostaje sam rysunek).
    const hideAllButton = h('button', {
      type: 'button', class: 'drawing__hide-all', 'aria-pressed': 'false', dataset: { testid: 'drawing-hide-ui' }, onClick: () => toggleAll()
    });
    const body = h('div', { class: 'drawing__body' }, stage,
      rings.right.element, rings.left.element, topBar, topTab, dock, dockTab, info, infoTab, status, statusTab, rings.right.tab, rings.left.tab, notice);
    const panel = h('div', { class: 'sheet__panel drawing', 'aria-label': `Rysunek: ${title}` },
      h('header', { class: 'sheet__header' }, cancelButton, headerTitle, h('div', { class: 'drawing__header-end' }, hideAllButton, doneButton)),
      body);
    swipeAway(topBar, 'top', 'up');
    swipeAway(dock, 'bottom', 'down');
    swipeAway(info, 'info', 'left');
    swipeAway(status, 'status', 'right');

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
        // Bez paska menu przeglądarki – Alt to tu swobodne osadzanie końców, a samo naciśnięcie lewego Alt
        // (od 1.32) przełącza na zaznaczanie. Prawy Alt (AltGr – polskie litery) nie przełącza.
        event.preventDefault();
        altDown = true;
        if (!event.repeat) altTap = event.code === 'AltLeft' && !event.ctrlKey && !typing(event.target) && !panelOpen() ? { clean: true } : null;
      } else if (altTap) {
        altTap.clean = false;
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
      if (event.key === 'Escape' && pointPick) {
        event.preventDefault();
        cancelPointPick({ match: 'Bez przenoszenia stylu', chain: 'Koniec wymiarów łańcuchowych', baseline: 'Koniec wymiarów od bazy', ...EDIT_END }[pointPick.kind] ?? 'Bez odbicia');
        updateToolbar();
        return;
      }
      // Łamana (od 1.43): Enter i Esc kończą łamaną z co najmniej dwoma punktami.
      if ((event.key === 'Escape' || event.key === 'Enter') && pending?.kind === 'polyline' && pending.points.length >= 2 && !typing(event.target)) {
        event.preventDefault();
        completePolyline(false);
        return;
      }
      // Kształt z punktów (od 1.34): Esc – od nowa.
      if (event.key === 'Escape' && pending?.points.length > 0) {
        event.preventDefault();
        pending = null;
        pendingHover = null;
        updateShapeHint();
        requestLive();
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
      } else if (event.key === ' ' && !command && !event.altKey && selection.size > 0 && !snip) {
        // Spacja (od 1.32) – powiel zaznaczenie; puszczenie spacji nie naciska przycisku z fokusem.
        event.preventDefault();
        spaceDuplicated = true;
        if (!event.repeat) duplicateSelection();
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
        const tap = altTap;
        altTap = null;
        if (event.code === 'AltLeft' && tap?.clean && !active) toggleSelectTool();
      }
      if (event.key === ' ' && spaceDuplicated) {
        event.preventDefault();
        spaceDuplicated = false;
      }
      if (event.key === 'Control') endCtrlHold();
    };
    let spaceDuplicated = false;
    // Okno bez fokusu (np. Alt+Tab z wciśniętym Ctrl) – puszczenia klawisza nie będzie.
    const onBlur = () => {
      shiftDown = false;
      altDown = false;
      altTap = null;
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
    applyUi();
    observer.observe(stage);
    for (const [index, sheet] of sheetList.entries()) {
      const current = index === startIndex;
      pages.push(makePage(current ? drawing : sheet.load ? null : sheetDrawing(sheet), { history: current ? history : null, title: sheet.title ?? title, sheet }));
    }
    ({ media } = pages[pageIndex]);
    paperButton.hidden = Boolean(drawing.photo);
    settlePages();
    updatePagePill();
  });
}
