// Rysunki odręczne w notatce (od 1.12): kreski pióra i zakreślacza zapisane jako punkty, żeby
// rysunek dało się później poprawiać. Tu – bez przeglądarki: grubość kreski z nacisku rysika,
// wygładzanie, gumka całych kresek i fragmentów (od 1.12.1), zaznaczanie i przesuwanie kresek,
// linijka, historia cofania, sprawdzanie danych (zapis, kopia zapasowa). Od 1.14: skala rysunku
// i liczby na linijce, przyciąganie zera linijki do przecięć i linii, zaznaczanie fragmentów
// prostokątem albo lassem (kreski cięte na brzegu obszaru), własne kolory. Od 1.15: kształty
// geometryczne (core/shapes.js), jasność tła i szablon pod kreskami (core/templates.js).
//
// Rysunek: { version: 2, width, height, paper: 'plain' | 'lines' | 'grid', strokes, photo? }
//   width, height – wielkość strony w jednostkach rysunku (strona bez zdjęcia: 1600 × 1100);
//   strokes – [{ tool: 'pen' | 'highlighter', color: '#rrggbb', points: [x, y, w, x, y, w, …] }],
//   w – grubość kreski w danym punkcie (pióro – zależna od nacisku, zakreślacz – stała);
//   od 1.13 także pola tekstowe { tool: 'text', color, x, y, size, text, maxWidth, width, height }
//   i wzory { tool: 'math', color, x, y, size, source, width, height } – (x, y) to lewy górny róg,
//   width i height – zmierzone przy wstawieniu (zaznaczanie, gumka), size – wysokość czcionki;
//   photo – { type, width, height, bytes } – zdjęcie pod kreskami („Rysuj na zdjęciu”);
//   od 1.14 scale – { value, unit } – ile w rzeczywistości ma jedna kratka (linijka, długość kreski);
//   od 1.15 w strokes także kształty { tool: 'shape', … } (core/shapes.js), paperLevel – jasność
//   linii i kratki (0–4), template – szablon pod kreskami (core/templates.js) albo brak;
//   od 1.17 kształt może mieć wypełnienie (fill) i tekst (label); od 1.19 – zakończenia odcinka
//   (startCap, endCap) i wymiary widoczne na stałe (dims), a w strokes także szyki { tool: 'array', … }
//   (core/arrays.js) – elementy powielone w szyku liniowym albo kołowym;
//   od 1.21 tabele { tool: 'table', x, y, width, height, size, color, rows, header, headerColumn, align }
//   (tabela jak w notatce – core/tables.js, od 1.26 też headAlign, formats i colWidths; height zmierzona)
//   i karteczki { tool: 'sticky', x, y, width, height, size, color: nazwa koloru karteczki, text,
//   created: 'rrrr-mm-dd', collapsed?, hidden?,
//   leader? } – collapsed: zwinięta do ikony, hidden: bez niej na obrazie rysunku w notatce,
//   leader { x, y }: strzałka od karteczki do punktu strony; od 1.22 element może mieć id, a odcinek,
//   strzałka i karteczka – przyklejone końce attach { start?, end?, leader? } (core/attach.js);
//   od 1.22.1 wymiary kształtu rysowane jak w rysunku technicznym (odsunięcia i tolerancje – core/shapes.js),
//   dimStyle: 'technical' – liczby wymiarów w milimetrach bez jednostki („50”; brak – „5 cm”), a w strokes
//   symbole metrologiczne: ramka tolerancji 'gdt', znak bazy 'datum', chropowatość 'roughness' (core/gdt.js);
//   od 1.24 kształty także łamana 'polyline' i wielokąt 'polygon' z wierzchołkami (nodes) – z rozpoznania
//   odręcznego kształtu (core/recognize.js); od 1.25 (format 10) dimUnit – jednostka liczb technicznych
//   ('mm' | 'cm' | 'm' | 'in'; brak – mm albo cale przy skali imperialnej), tolerancje długości kształtów
//   w milimetrach (starsze rysunki – przeliczane przy wczytaniu), ramka tolerancji może mieć odchyłki.
//   Od 1.36 (format 11) layers – warstwy rysunku (core/layers.js; brak – tło, obraz i warstwy 1–5),
//   activeLayer – warstwa nowych elementów (brak – 1), w elementach layers – sygnatury (warstwy rzędu 1–3).
//   Od 1.41 (format 14) frame – ramka rysunkowa z tabliczką (core/title-block.js; tylko kartka bez zdjęcia).
//   Od 1.44 (format 16) w strokes diagramy jakości { tool: 'diagram', kind: 'fishbone' | 'whys', … } (core/diagrams.js)
//   i layout – układ kartki: raport A3, PDCA, macierz 2×2, Kanban, diagram pokrewieństwa (core/page-layouts.js;
//   tylko kartka bez zdjęcia).
//   Od 1.45 (format 17) kształty schematu blokowego i łącznik (core/shapes.js), diagramy 'vsm', 'timeline', 'defects',
//   układ 'lanes' (tory); w ustawieniach narzędzi – zakończenia łącznika (connectorCaps).
//   Od 1.47 (format 18) w strokes bryły { tool: 'solid', kind, x, y, dims, q, … } (core/solids.js) – rzut prostokątny
//   bryły obracanej w przestrzeni.
//   Od 1.50 (format 22) origin { x, y } – początek układu współrzędnych arkusza przesunięty przez użytkownika (punkt
//   strony; brak – lewy dolny róg arkusza albo kartki, core/sheet-coords.js).
//   Od 1.52 (format 23) bryła ma położenie w scenie: z – wysokość podstawy, yaw – obrót wokół Z, on – bryła pod spodem
//   (core/solid-pose.js); obrazek bryły postawionej jest w obrazku bryły na dole stosu.
//   Od 1.53 (format 24) bryła może mieć measures [{ a, b }] – pomiary 3D między cechami brył (core/measure3d.js).
//   Od 1.54 (format 25) bryła ze szkicu na płaszczyźnie pionowej: plane 'xz' | 'yz' i planeAngle – kąt osi profilu.

import { ARRAY_ITEMS_MAX, ARRAY_KINDS, expandArray, isArray, makeArray, translateArray } from './arrays.js';
import { DEFAULT_RECENT_FITS, cleanRecentFits } from './fits.js';
import {
  ARC_MODES, CORNER_KINDS, DIM_AXES, DIM_MODES, DIM_OFFSET, DIM_OFFSET_LIMITS, ELLIPSE_MODES, FIT_RE, NGON_DEFAULT, NGON_SIDES, POINT_MARKS, SEGMENT_CAPS, SHAPES,
  SHAPE_DASHES, SHAPE_FILLS, angleDimDegrees, arcDimLength, capPoints, cleanHatch, cleanShape, isLengthKey, isLinearDim, isMeasure, isShape, isXline, measuredLength,
  scaleDimTolerances, segmentDegrees,
  shapeAsStroke, shapeBounds, shapeMeasure, shapeOutline, skewDegrees, touchesShape
} from './shapes.js';
import { keepLinks } from './attach.js';
import { cleanSymbol, isSymbol, symbolBox, symbolLeaderStart } from './gdt.js';
import { cleanTable } from './tables.js';
import { DEFAULT_PAPER_LEVEL, cleanLevel, cleanTemplate } from './templates.js';
import { cleanFrame } from './title-block.js';
import { cleanDiagram } from './diagrams.js';
import { cleanSolid, solidBox } from './solids.js';
import { resolveStacks } from './solid-pose.js';
import { resolveMeasures } from './measure3d.js';
import { cleanLayout } from './page-layouts.js';
import { cleanRingPositions, cleanToolGroups, cleanUiHidden, defaultToolGroups } from './tool-ring.js';
import { cleanLayers, cleanSignatures, defaultLayers, elementLayers } from './layers.js';

/**
 * 1 – kreski (1.12), 2 – także pola tekstowe i wzory (1.13), 3 – kształty, jasność tła, szablon (1.15),
 * 4 – wypełnienie i tekst kształtu (1.17), 5 – zakończenia odcinka, stałe wymiary i szyki (1.19),
 * 6 – tabele i karteczki (1.21), 7 – identyfikatory elementów i przyklejone końce odcinków (1.22),
 * 8 – wymiary techniczne (odsunięcia, tolerancje, styl liczb) i symbole metrologiczne (1.22.1), 11 – warstwy (1.36),
 * 12 – wymiary graniczne, rodzaj wymiaru, miejsca po przecinku, ramka z Ⓟ i drugim wierszem, chropowatość
 * z kierunkiem struktury, odnośnik (1.38), 13 – wielokąt foremny, półprosta, narożniki prostokąta, kreskowanie (1.40),
 * 14 – ramka rysunkowa z tabliczką (1.41), 15 – wymiar długości łuku, wymiar poziomy i pionowy, osie okręgu,
 * arkusz A4 pionowo (1.42), 16 – diagramy Ishikawy i 5 × Dlaczego, układ kartki (1.44), 17 – kształty schematu blokowego,
 * łącznik, symbole i oś czasu VSM, legenda wad, tory (1.45), 18 – bryły (1.47), 19 – bryły ze szkicu: wyciągnięcie i obrót
 * profilu, szkic w bryle (1.48), 20 – szkic na płaszczyźnie XY, Z do góry (1.48.2), 21 – wycięcia i dodania na ścianach
 * brył (1.49), 22 – początek układu współrzędnych arkusza (1.50).
 */
export const DRAWING_VERSION = 25;
/** Strona bez zdjęcia – w poziomie, w proporcjach ekranu iPada i laptopa. */
export const PAGE_WIDTH = 1600;
export const PAGE_HEIGHT = 1100;
/** Strona ze zdjęciem: najdłuższy bok (jak obrazy notatki) – większe zdjęcie jest pomniejszane na stronie. */
export const PHOTO_PAGE_MAX = 2048;
/** Odstęp linii i kratki tła (jednostki rysunku). */
export const PAPER_STEP = 44;
export const PAPERS = Object.freeze(['plain', 'lines', 'grid']);
export const PAPER_LABELS = Object.freeze({ plain: 'Gładkie', lines: 'Linie', grid: 'Kratka' });

/** Kolory tuszu (jak kolory tekstu notatki): czarny, niebieski, czerwony, zielony, pomarańczowy, fioletowy. */
export const INK_COLORS = Object.freeze([
  { id: 'black', hex: '#1d1d1f', label: 'Czarny' },
  { id: 'blue', hex: '#0040dd', label: 'Niebieski' },
  { id: 'red', hex: '#d70015', label: 'Czerwony' },
  { id: 'green', hex: '#248a3d', label: 'Zielony' },
  { id: 'orange', hex: '#c45500', label: 'Pomarańczowy' },
  { id: 'purple', hex: '#8944ab', label: 'Fioletowy' }
]);
/** Kolory zakreślacza (półprzezroczyste, mnożone z tłem – tusz pod spodem zostaje ciemny). */
export const HIGHLIGHTER_COLORS = Object.freeze([
  { id: 'yellow', hex: '#ffd60a', label: 'Żółty' },
  { id: 'green', hex: '#5ee07a', label: 'Zielony' },
  { id: 'pink', hex: '#ff6fb1', label: 'Różowy' },
  { id: 'blue', hex: '#64c8ff', label: 'Niebieski' }
]);
export const HIGHLIGHTER_ALPHA = 0.45;

/** Grubości pióra (od – do, w jednostkach rysunku): cienka, średnia, gruba. */
export const PEN_WIDTHS = Object.freeze([
  Object.freeze({ min: 1.6, max: 4 }),
  Object.freeze({ min: 2.6, max: 6.5 }),
  Object.freeze({ min: 4.5, max: 11 })
]);
/** Grubości zakreślacza (stałe; od 1.21 do zmiany w ustawieniach zakreślacza). */
export const HIGHLIGHTER_WIDTHS = Object.freeze([14, 24, 36]);
export const HIGHLIGHTER_RANGE = Object.freeze({ min: 4, max: 60 });
export const WIDTH_LIMITS = Object.freeze({ min: 0.5, max: 40 });

/** Czułość nacisku: jak mocno nacisk zmienia grubość kreski między „od” a „do”. */
export const SENSITIVITY = Object.freeze({ off: 0, low: 0.5, medium: 1, high: 1.6 });
export const SENSITIVITY_LABELS = Object.freeze({ off: 'Wył.', low: 'Mała', medium: 'Średnia', high: 'Duża' });

/**
 * Stały wymiar kształtu (od 1.19): szerokość, wysokość i długość w skali rysunku („5 cm”), kąt
 * pochylenia i kierunek odcinka w stopniach („15°”). Od 1.22.1 styl 'technical' – długości bez
 * jednostki („50”; od 1.25 w jednostce `format.unit` – mm, cm, m albo cale), znak przed liczbą
 * (⌀, R, □) i tolerancja: { kind: 'sym', text: '±0,1' }, { kind: 'dev', upper: '+0,1', lower: '−0,05' }
 * albo pasowanie { kind: 'fit', text: 'H7' }. Od 1.25 liczby tolerancji długości są zapisane
 * w milimetrach i pokazywane w jednostce liczby wymiaru. format – z dimFormat(rysunek) albo
 * dawny styl ('technical' | 'unit'). Wynik: { main, tolerance }.
 */
export function dimensionParts(shape, key, scale, format = 'unit') {
  const marks = shape.dimTols?.[key] ?? null;
  const degrees = key === 'skew' ? skewDegrees(shape) : key === 'angle' ? (shape.shape === 'angledim' ? angleDimDegrees(shape) : segmentDegrees(shape)) : null;
  // Od 1.42: długość łuku, wymiar poziomy i pionowy – rzut odległości punktów.
  const units = key === 'height' ? shape.h : key === 'arc' ? arcDimLength(shape) : shape.shape === 'dim' ? measuredLength(shape) : shape.w;
  const technical = formatOf(format).style === 'technical';
  // Od 1.38 stała liczba miejsc po przecinku (0–3) zamiast samoczynnej.
  const places = Number.isInteger(marks?.places) ? marks.places : null;
  const value = degrees ?? toScaleLength(units, scale) * (technical ? dimFactor(scale, format) : 1);
  const after = degrees !== null ? '°' : technical ? '' : ` ${unitOf(cleanScale(scale).unit).label}`;
  // Długość łuku (od 1.42) – znak ⌒ przed liczbą.
  const prefix = key === 'arc' ? '⌒' : marks?.prefix && isLinearDim(key) ? marks.prefix : '';
  let main = `${prefix}${places === null ? formatNumber(value) : fixedNumber(value, places)}${after}`;
  const suffix = degrees !== null ? '°' : '';
  // Tolerancja długości: z milimetrów do jednostki liczby wymiaru; kąta – w stopniach.
  const per = degrees !== null ? 1 : dimMillimeters(scale, format);
  const shown = (deviation) => formatTolerance(deviation / per);
  const signed = (deviation) => `${deviation > 0 ? `+${shown(deviation)}` : deviation < 0 ? `−${shown(-deviation)}` : '0'}${suffix}`;
  const frame = ['basic', 'reference', 'inspection'].includes(marks?.style) ? marks.style : null;
  let tolerance = null;
  if (frame === 'basic' || frame === 'reference') tolerance = null;
  else if (marks?.kind === 'sym') tolerance = { kind: 'sym', text: `±${shown(marks.value)}${suffix}` };
  else if (marks?.kind === 'dev') tolerance = { kind: 'dev', upper: signed(marks.upper), lower: signed(marks.lower) };
  else if (marks?.kind === 'fit') tolerance = { kind: 'fit', text: marks.fit };
  else if (marks?.kind === 'limits') {
    // Wymiary graniczne (od 1.38): wymiar nominalny z odchyłkami, tyle miejsc, ile ma dokładniejsza liczba.
    const decimals = places ?? Math.max(...[formatNumber(value), shown(Math.abs(marks.upper)), shown(Math.abs(marks.lower))].map((text) => text.split(',')[1]?.length ?? 0));
    const bound = (deviation) => `${fixedNumber(value + deviation / per, decimals)}${after}`;
    tolerance = { kind: 'limits', upper: bound(marks.upper), lower: bound(marks.lower) };
    main = prefix;
  }
  return { main, tolerance, ...(frame ? { frame } : {}) };
}
/** Liczba z `places` miejscami po przecinku („40,00”). */
const fixedNumber = (value, places) => (Math.abs(value) < 0.5 * 10 ** -places ? 0 : value).toFixed(places).replace('.', ',');
/**
 * Wymiar jako jeden napis („⌀20 H7”, „50±0,1”, „30 +0,1/−0,05”; od 1.38 graniczne „40,05/39,98”,
 * pomocniczy w nawiasie „(40)”; ramka wymiaru dokładnego i kontrolnego – tylko na rysunku).
 */
export function dimensionText(shape, key, scale, format = 'unit') {
  const { main, tolerance, frame } = dimensionParts(shape, key, scale, format);
  let text = main;
  if (tolerance?.kind === 'limits') text = `${main}${tolerance.upper}/${tolerance.lower}`;
  else if (tolerance?.kind === 'dev') text = `${main} ${tolerance.upper}/${tolerance.lower}`;
  else if (tolerance) text = tolerance.kind === 'sym' ? `${main}${tolerance.text}` : `${main} ${tolerance.text}`;
  return frame === 'reference' ? `(${text})` : text;
}

/** Skala rysunku (od 1.14): jedna kratka = value jednostek – SI albo imperialnych; meters – długość jednostki. */
export const SCALE_UNITS = Object.freeze([
  { id: 'mm', label: 'mm', name: 'milimetry', system: 'si', meters: 0.001 },
  { id: 'cm', label: 'cm', name: 'centymetry', system: 'si', meters: 0.01 },
  { id: 'm', label: 'm', name: 'metry', system: 'si', meters: 1 },
  { id: 'km', label: 'km', name: 'kilometry', system: 'si', meters: 1000 },
  { id: 'in', label: 'in', name: 'cale', system: 'imperial', meters: 0.0254 },
  { id: 'ft', label: 'ft', name: 'stopy', system: 'imperial', meters: 0.3048 },
  { id: 'yd', label: 'yd', name: 'jardy', system: 'imperial', meters: 0.9144 },
  { id: 'mi', label: 'mi', name: 'mile', system: 'imperial', meters: 1609.344 }
]);
export const defaultScale = () => ({ value: 1, unit: 'cm' });
const unitOf = (id) => SCALE_UNITS.find((unit) => unit.id === id) ?? SCALE_UNITS[1];

/** Sprawdzona skala rysunku (zła albo brak – 1 kratka = 1 cm). */
export function cleanScale(raw) {
  if (!raw || typeof raw !== 'object' || !finite(raw.value) || raw.value <= 0 || !SCALE_UNITS.some((unit) => unit.id === raw.unit)) return defaultScale();
  return { value: clamp(raw.value, 1e-6, 1e9), unit: raw.unit };
}

/** Liczba tolerancji (od 1.25): do czterech cyfr znaczących (0,0005), przecinek dziesiętny. */
export function formatTolerance(value) {
  if (!finite(value) || value === 0) return '0';
  const decimals = Math.min(6, Math.max(0, 3 - Math.floor(Math.log10(Math.abs(value)))));
  return String(Number(value.toFixed(decimals))).replace('.', ',');
}

/** Liczba po polsku: przecinek dziesiętny, kilka cyfr znaczących, bez zbędnych zer. */
export function formatNumber(value) {
  const size = Math.abs(value);
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : size >= 1 ? 2 : 3;
  return String(Number(value.toFixed(digits))).replace('.', ',');
}

/** Długość w jednostkach strony jako długość rzeczywista w skali rysunku, np. „3,5 m”. */
export function formatLength(units, scale) {
  const { value, unit } = cleanScale(scale);
  return `${formatNumber((units / PAPER_STEP) * value)} ${unitOf(unit).label}`;
}

/** Od 1.17 (wymiary kształtu z klawiatury): długość w skali rysunku, z powrotem w jednostkach strony i skrót jednostki. */
export const toScaleLength = (units, scale) => (units / PAPER_STEP) * cleanScale(scale).value;
export const fromScaleLength = (length, scale) => (length / cleanScale(scale).value) * PAPER_STEP;
export const scaleUnitLabel = (scale) => unitOf(cleanScale(scale).unit).label;
/**
 * Jednostki liczb wymiarów w stylu technicznym (od 1.25 do wyboru; 1.22.1 – mm albo cale przy skali
 * imperialnej): skrót przy polach, ile mm ma jednostka, nazwa w oznaczeniu „Wymiary w …” na rysunku.
 */
export const DIM_UNITS = Object.freeze([
  { id: 'mm', label: 'mm', millimeters: 1, note: 'mm' },
  { id: 'cm', label: 'cm', millimeters: 10, note: 'cm' },
  { id: 'm', label: 'm', millimeters: 1000, note: 'm' },
  { id: 'in', label: 'in', millimeters: 25.4, note: 'calach' }
]);
const dimUnitOf = (id) => DIM_UNITS.find((unit) => unit.id === id) ?? null;
/** Domyślna jednostka liczb technicznych: mm, przy skali w jednostkach imperialnych – cale. */
export const defaultDimUnit = (scale) => (unitOf(cleanScale(scale).unit).system === 'imperial' ? 'in' : 'mm');
/** Format liczb wymiarów rysunku: { style: 'technical' | 'unit', unit } (od 1.25; unit – tylko technicznie). */
export function dimFormat(drawing) {
  if (drawing?.dimStyle !== 'technical') return { style: 'unit', unit: null };
  return { style: 'technical', unit: dimUnitOf(drawing.dimUnit)?.id ?? defaultDimUnit(drawing.scale) };
}
/** Format z obiektu albo dawnego napisu stylu. */
const formatOf = (format) => (typeof format === 'string' || !format ? { style: format === 'technical' ? 'technical' : 'unit', unit: null } : format);
/** Jednostka liczb wymiaru: { label, millimeters } – technicznie wybrana, opisowo – jednostka skali. */
function dimUnitIn(scale, format) {
  const { style, unit } = formatOf(format);
  if (style === 'technical') return dimUnitOf(unit) ?? dimUnitOf(defaultDimUnit(scale));
  const scaleUnit = unitOf(cleanScale(scale).unit);
  return { id: scaleUnit.id, label: scaleUnit.label, millimeters: scaleUnit.meters * 1000 };
}
/** Ile milimetrów ma jednostka liczby wymiaru (tolerancje zapisane w mm – od 1.25). */
export const dimMillimeters = (scale, format) => dimUnitIn(scale, format).millimeters;
/** Mnożnik z jednostki skali do jednostki liczb wymiaru (styl opisowy – 1). */
export function dimFactor(scale, format) {
  if (formatOf(format).style !== 'technical') return 1;
  return (unitOf(cleanScale(scale).unit).meters * 1000) / dimMillimeters(scale, format);
}
export const dimUnitLabel = (scale, format) => dimUnitIn(scale, format).label;
/** Oznaczenie jednostki na rysunku przy liczbach bez jednostki („Wymiary w mm”) albo null (od 1.25). */
export const dimUnitNote = (format) => (formatOf(format).style === 'technical' ? `Wymiary w ${dimUnitOf(formatOf(format).unit)?.note ?? 'mm'}` : null);
/**
 * Czy rysunek ma liczby, których dotyczy oznaczenie jednostki: widoczne wymiary długości albo ramki
 * tolerancji (od 1.25).
 */
export function hasMeasuredContent(drawing) {
  return drawing.strokes.some((stroke) => stroke.tool === 'gdt' || (stroke.tool === 'solid' && stroke.showDims === true)
    || (isShape(stroke) && Array.isArray(stroke.dims) && stroke.dims.some((key) => isLengthKey(key))));
}

/** Liczba wpisana po polsku albo z kropką („4,5”, „ -12.5 cm”, „15°”) albo null. */
export function parseDecimal(text) {
  const match = String(text ?? '').replace(/\s/g, '').replace(',', '.').match(/^[-+−]?\d*\.?\d+/);
  if (!match) return null;
  const value = Number(match[0].replace('−', '-'));
  return Number.isFinite(value) ? value : null;
}

/**
 * Szacunek skali na ekranie: kratka ma na ekranie `squarePx` pikseli CSS, a ekran ma ok.
 * `pxPerInch` pikseli CSS na cal. Zwraca { millimeters – kratka na ekranie, ratio – N w skali 1:N }.
 */
export function screenScale(scale, squarePx, pxPerInch) {
  const { value, unit } = cleanScale(scale);
  const millimeters = (squarePx / pxPerInch) * 25.4;
  return { millimeters, ratio: (value * unitOf(unit).meters * 1000) / millimeters };
}

/** Skala 1:N zaokrąglona do dwóch cyfr znaczących („1:170”, „1:2 500”, „1:1,6”; powiększenie – „2:1”, „2,5:1”). */
export function formatRatio(ratio) {
  if (!finite(ratio) || ratio <= 0) return '–';
  const nice = (value) => {
    const power = 10 ** (Math.floor(Math.log10(value)) - 1);
    return Math.round(value / power) * power;
  };
  const text = (value) => (value >= 100 ? String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : formatNumber(value));
  return ratio >= 1 ? `1:${text(nice(ratio))}` : `${text(nice(1 / ratio))}:1`;
}

/** Skala, w której kratka ma tyle, ile widać na ekranie (1:1) – w jednostce `unit`. */
export function screenScaleValue(squareMillimeters, unit) {
  return Number(((squareMillimeters / 1000) / unitOf(unit).meters).toPrecision(3));
}

/** Własne kolory (od 1.14): zapamiętane najwyżej trzy, najnowszy pierwszy. */
export const CUSTOM_COLOR_LIMIT = 3;
export const isHexColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/** Kolor z HSL (odcień 0–360, nasycenie i jasność 0–100) jako #rrggbb – siatka kolorów. */
export function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[channel(0), channel(8), channel(4)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/** Składowe #rrggbb → [r, g, b] (0–255). */
export const hexToRgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
export const rgbToHex = (rgb) => `#${rgb.map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;

/** Lista własnych kolorów po dodaniu `hex` (bez powtórzeń, najnowszy pierwszy, najwyżej trzy). */
export function rememberColor(colors, hex) {
  const value = hex.toLowerCase();
  return [value, ...colors.filter((color) => color !== value)].slice(0, CUSTOM_COLOR_LIMIT);
}

/**
 * Zaznaczanie (od 1.14): prostokąt albo lasso; tryb – według kierunku, całe kreski albo fragmenty,
 * a od 1.17 wycinek – obraz wszystkiego w obszarze (z tłem, kratką i częściami kresek).
 */
export const SELECT_SHAPES = Object.freeze(['rect', 'lasso']);
export const SELECT_MODES = Object.freeze(['auto', 'whole', 'region', 'snip']);
export const SELECT_MODE_LABELS = Object.freeze({ auto: 'Auto', whole: 'Całe', region: 'Fragmenty', snip: 'Wycinek' });

/**
 * Pola tekstowe i wzory (od 1.13): wielkość czcionki w jednostkach strony (kratka ma 44); od 1.18
 * także „Bardzo duża” – te same cztery wielkości co tekst notatki.
 */
export const TEXT_SIZES = Object.freeze([28, 40, 56, 80]);
export const TEXT_SIZE_LABELS = Object.freeze(['Mała', 'Średnia', 'Duża', 'Bardzo duża']);
/** Najdłuższy tekst pola i zapis wzoru. */
export const ELEMENT_TEXT_MAX = 2000;

/** Czy to pole tekstowe, wzór, (od 1.15) kształt, (od 1.19) szyk albo (od 1.21) tabela lub karteczka – a nie kreska z punktami. */
export const isElement = (stroke) => ['text', 'math', 'shape', 'array', 'table', 'sticky', 'gdt', 'datum', 'roughness', 'diagram', 'solid'].includes(stroke?.tool);

// ---------------------------------------------------------------- tabele i karteczki (od 1.21)

/** Wielkości tekstu tabeli na rysunku (jednostki strony): mała, średnia, duża, bardzo duża. */
export const TABLE_TEXT_SIZES = Object.freeze([20, 26, 34, 44]);
/** Karteczki: kolory (tło i ciemniejszy odcień – zagięty róg, strzałka), wielkości tekstu, ikona zwiniętej. */
export const STICKY_COLORS = Object.freeze([
  { id: 'yellow', fill: '#ffe680', ink: '#b38b00', label: 'Żółta' },
  { id: 'pink', fill: '#ffc2d4', ink: '#c2386a', label: 'Różowa' },
  { id: 'green', fill: '#c4f0b0', ink: '#3f8a2a', label: 'Zielona' },
  { id: 'blue', fill: '#b9e0ff', ink: '#2a74b8', label: 'Niebieska' },
  { id: 'orange', fill: '#ffd2a6', ink: '#c2620f', label: 'Pomarańczowa' },
  // Od 1.38: odnośnik – sam tekst ze strzałką, bez kartki (clear).
  { id: 'clear', fill: '#ffffff', ink: '#1d1d1f', label: 'Bez tła – odnośnik', clear: true }
]);
export const STICKY_TEXT_SIZES = Object.freeze([24, 30, 38]);
export const STICKY_ICON = 60;
export const STICKY_MIN = Object.freeze({ width: 160, height: 120 });
export const STICKY_TEXT_MAX = 1000;
/** Kolory karteczki { fill, ink } – według koloru karteczki; od 1.36 także gotowe kolory (karteczka z nasyceniem warstwy). */
export const stickyColor = (id) => (id && typeof id === 'object' ? id : STICKY_COLORS.find((color) => color.id === id) ?? STICKY_COLORS[0]);
/** Tabela, karteczka, (od 1.22.1) symbol metrologiczny, (od 1.44) diagram jakości i (od 1.47) bryła – element z oknem poprawki. */
export const isBox = (stroke) => stroke?.tool === 'table' || stroke?.tool === 'sticky' || isSymbol(stroke) || stroke?.tool === 'diagram' || stroke?.tool === 'solid';

/** Prostokąt elementu { x, y, width, height }: zwinięta karteczka (od 1.21) – sama ikona. */
export function elementBox(element) {
  if (element.tool === 'sticky' && element.collapsed) return { x: element.x, y: element.y, width: STICKY_ICON, height: STICKY_ICON };
  if (isSymbol(element)) return symbolBox(element);
  // Bryła (od 1.47): (x, y) to jej środek – prostokąt z rzutu (z wymiarami).
  if (element.tool === 'solid') return solidBox(element);
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

/** Początek strzałki karteczki: punkt na brzegu karteczki (albo ikony) w stronę celu; od 1.22.1 także ramki tolerancji i znaku bazy. */
export function leaderStart(sticky) {
  if (isSymbol(sticky)) return symbolLeaderStart(sticky);
  const box = elementBox(sticky);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const dx = sticky.leader.x - center.x;
  const dy = sticky.leader.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const scale = Math.min(dx === 0 ? Infinity : (box.width / 2) / Math.abs(dx), dy === 0 ? Infinity : (box.height / 2) / Math.abs(dy));
  return { x: center.x + dx * Math.min(1, scale), y: center.y + dy * Math.min(1, scale) };
}

/** Gumka (od 1.12.1): całe kreski albo fragmenty; wielkość gumki fragmentów – średnica na ekranie (px). */
export const ERASER_MODES = Object.freeze(['stroke', 'pixel']);
export const ERASER_MODE_LABELS = Object.freeze({ stroke: 'Całe kreski', pixel: 'Fragmenty' });
export const ERASER_SIZES = Object.freeze([8, 16, 28, 48]);
export const ERASER_SIZE_LABELS = Object.freeze(['Mała', 'Średnia', 'Duża', 'Bardzo duża']);

/** Ustawienia narzędzi na tym urządzeniu (pióro: czułość, wygładzanie i grubości; zakreślacz: grubość). */
export function defaultToolSettings() {
  return {
    sensitivity: 'medium',
    smoothing: 0.5,
    penWidths: PEN_WIDTHS.map((width) => ({ ...width })),
    penWidth: 1,
    penColor: 'black',
    highlighterWidth: 1,
    // Od 1.21: grubość każdej z trzech kropek zakreślacza (okno ustawień zakreślacza).
    highlighterWidths: [...HIGHLIGHTER_WIDTHS],
    highlighterColor: 'yellow',
    eraserMode: 'stroke',
    eraserSize: 1,
    textSize: 1,
    customColors: [],
    selectShape: 'rect',
    selectMode: 'auto',
    rulerSnap: true,
    shape: 'rect',
    shapeFill: 'none',
    guide: defaultGuide(),
    // Od 1.19: proporcje jak z Shift (kwadrat, koło, kąty co 15°) i zakończenia nowych odcinków i strzałek.
    shapeLock: false,
    lineCaps: { start: 'none', end: 'none' },
    arrowCaps: { start: 'none', end: 'arrow' },
    // Od 1.27: rodzaj linii nowych kształtów, zakończenia strzałki po łuku i znacznik punktu.
    shapeDash: 'solid',
    curveCaps: { start: 'none', end: 'arrow' },
    // Od 1.45: zakończenia nowych łączników (jak strzałki – grot na końcu).
    connectorCaps: { start: 'none', end: 'arrow' },
    pointMark: 'center',
    // Od 1.34: sposób rysowania okręgu (ramka, środek i promień, 2 albo 3 punkty) i rodzaj wymiaru narzędzia „Wymiar”.
    ellipseMode: 'frame',
    dimMode: 'linear',
    // Od 1.42: kierunek wymiaru liniowego, sposób rysowania łuku, osie nowych okręgów.
    dimAxis: 'aligned',
    arcMode: 'three',
    ellipseAxes: false,
    // Od 1.43: ostatnie odsunięcie, promień zaokrąglenia, wielkość fazy i promień okręgu stycznego (jednostki strony).
    editOffset: PAPER_STEP / 2,
    editFillet: PAPER_STEP / 2,
    editChamfer: PAPER_STEP / 4,
    ttrRadius: PAPER_STEP,
    arrayKind: 'linear',
    // Od 1.21: kolor ostatnio dodanej karteczki.
    stickyColor: 'yellow',
    // Od 1.22: końce odcinków i strzałek przyciągane do krawędzi i narożników (magnes).
    edgeSnap: true,
    // Od 1.22.1: odsunięcie linii wymiarowej – wzór dla następnych wymiarów (ostatnio przeciągnięte).
    dimOffset: DIM_OFFSET,
    // Od 1.24: kreska pióra przytrzymana na końcu zamienia się w figurę.
    recognize: true,
    // Od 1.25: ostatnio użyte pasowania (okno tolerancji wymiaru pokazuje tylko je).
    recentFits: [...DEFAULT_RECENT_FITS],
    // Od 1.30: palec rysuje także wtedy, gdy aplikacja zna rysik (dwa palce przesuwają i powiększają).
    fingerDraws: false,
    // Od 1.32 (kółka narzędzi): ostatnio pokazana grupa ('right:shapes') i schowane elementy interfejsu.
    toolGroup: null,
    uiHidden: cleanUiHidden(null),
    // Od 1.33: dobór grup na kółkach (okno „Grupy narzędzi”).
    toolGroups: defaultToolGroups(),
    // Od 1.35.1: rodzaj linii i wypełnienie zapamiętane osobno dla każdego kształtu ({ xline: { dash: 'center' } });
    // brak – wspólne shapeDash i shapeFill (ustawienia sprzed 1.35.1).
    shapeStyles: {},
    // Od 1.39: kółka narzędzi przesunięte ręcznie ({ right: { x, y } | null, left }).
    ringPositions: cleanRingPositions(null),
    // Od 1.40: liczba boków nowego wielokąta foremnego i narożniki nowego prostokąta (null – ostre).
    ngonSides: NGON_DEFAULT,
    rectCorner: null,
    // Od 1.50: układ współrzędnych arkusza – osie w początku, współrzędne pod kursorem, pola X/Y i punkt ze współrzędnych.
    coords: false
  };
}

/** Rodzaj linii i wypełnienie nowych kształtów rodzaju `kind` (od 1.35.1 – osobno dla każdego kształtu; od 1.40 z kreskowaniem). */
export function shapeToolStyle(tools, kind) {
  const own = tools.shapeStyles?.[kind] ?? {};
  return { dash: own.dash ?? tools.shapeDash, fill: own.fill ?? tools.shapeFill, hatch: cleanHatch(own.hatch) };
}

/** Ustawienia narzędzi z rodzajem linii (`key` 'dash') albo wypełnieniem ('fill') kształtu `kind` – tylko tego kształtu. */
export function withShapeToolStyle(tools, kind, key, value) {
  return { ...tools, shapeStyles: { ...tools.shapeStyles, [kind]: { ...tools.shapeStyles?.[kind], [key]: value } } };
}

/** Sprawdzone style kształtów: znane kształty, znane rodzaje linii i wypełnienia. */
function cleanShapeStyles(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const styles = {};
  for (const kind of SHAPES) {
    const own = raw[kind];
    if (!own || typeof own !== 'object') continue;
    const style = {};
    if (SHAPE_DASHES.includes(own.dash)) style.dash = own.dash;
    if (SHAPE_FILLS.includes(own.fill)) style.fill = own.fill;
    if (own.hatch && typeof own.hatch === 'object') style.hatch = cleanHatch(own.hatch);
    if (Object.keys(style).length > 0) styles[kind] = style;
  }
  return styles;
}

/** Narożniki nowego prostokąta (od 1.40): { kind, size } albo null – ostre. */
function cleanToolCorner(raw) {
  if (!raw || !CORNER_KINDS.includes(raw.kind) || !finite(raw.size) || raw.size <= 0) return null;
  return { kind: raw.kind, size: clamp(Math.round(raw.size * 100) / 100, 0.5, 2000) };
}

/** Sprawdzone zakończenia { start, end } albo domyślne. */
function cleanCaps(raw, fallback) {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  return { start: SEGMENT_CAPS.includes(raw.start) ? raw.start : fallback.start, end: SEGMENT_CAPS.includes(raw.end) ? raw.end : fallback.end };
}

/**
 * Liniuszek (od 1.15): odstęp linii w kratkach, kąt linii w stopniach (0 – poziomo, przeciwnie do
 * ruchu wskazówek zegara), linie poprzeczne – odstęp wzdłuż linii i kąt względem linii (90 – prosto),
 * przyciąganie pióra do linii. Od 1.22 rodzaj: 'lines' – równoległe linie, 'radial' – okręgi wokół
 * środka co ringSpacing kratek i (rays) promienie co rayStep stopni, obrócone o rayAngle.
 */
export const defaultGuide = () => ({
  kind: 'lines', spacing: 1, angle: 0, cross: false, crossSpacing: 1, crossAngle: 90, snap: true,
  ringSpacing: 1, rays: true, rayStep: 30, rayAngle: 0
});
export const GUIDE_KINDS = Object.freeze(['lines', 'radial']);
/** Co ile stopni promienie liniuszka promieniowego (dzielniki 360°). */
export const RAY_STEPS = Object.freeze([5, 10, 15, 20, 30, 45, 60, 90]);
export const GUIDE_LIMITS = Object.freeze({
  spacing: [0.25, 6], crossSpacing: [0.25, 12], angle: [-90, 90], crossAngle: [10, 170], ringSpacing: [0.25, 6], rayAngle: [-90, 90]
});

function cleanGuide(raw) {
  const base = defaultGuide();
  if (!raw || typeof raw !== 'object') return base;
  const number = (key, step) => (finite(raw[key]) ? clamp(Math.round(raw[key] / step) * step, ...GUIDE_LIMITS[key]) : base[key]);
  return {
    spacing: number('spacing', 0.25),
    angle: number('angle', 1),
    cross: typeof raw.cross === 'boolean' ? raw.cross : base.cross,
    crossSpacing: number('crossSpacing', 0.25),
    crossAngle: number('crossAngle', 1),
    snap: typeof raw.snap === 'boolean' ? raw.snap : base.snap,
    kind: GUIDE_KINDS.includes(raw.kind) ? raw.kind : base.kind,
    ringSpacing: number('ringSpacing', 0.25),
    rays: typeof raw.rays === 'boolean' ? raw.rays : base.rays,
    rayStep: RAY_STEPS.includes(raw.rayStep) ? raw.rayStep : base.rayStep,
    rayAngle: number('rayAngle', 1)
  };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
/** Długość edycji geometrii (od 1.43): od 0,1 do 5000 jednostek strony (zaokrąglenie – także 0, ostry narożnik). */
const editLength = (value, fallback, zero = false) => (finite(value) && (value > 0 || (zero && value === 0)) && value <= 5000 ? Math.round(value * 100) / 100 : fallback);

/** Ustawienia narzędzi odczytane z pamięci urządzenia – złe wartości zastępują domyślne. */
export function cleanToolSettings(raw) {
  const base = defaultToolSettings();
  if (!raw || typeof raw !== 'object') return base;
  const widths = Array.isArray(raw.penWidths) && raw.penWidths.length === PEN_WIDTHS.length
    ? raw.penWidths.map((width, index) => {
      const min = finite(width?.min) ? clamp(width.min, WIDTH_LIMITS.min, WIDTH_LIMITS.max) : PEN_WIDTHS[index].min;
      const max = finite(width?.max) ? clamp(width.max, WIDTH_LIMITS.min, WIDTH_LIMITS.max) : PEN_WIDTHS[index].max;
      return { min: Math.min(min, max), max: Math.max(min, max) };
    })
    : base.penWidths;
  return {
    sensitivity: raw.sensitivity in SENSITIVITY ? raw.sensitivity : base.sensitivity,
    smoothing: finite(raw.smoothing) ? clamp(raw.smoothing, 0, 1) : base.smoothing,
    penWidths: widths,
    penWidth: Number.isInteger(raw.penWidth) && raw.penWidth >= 0 && raw.penWidth < PEN_WIDTHS.length ? raw.penWidth : base.penWidth,
    // Od 1.14 kolor może być też własny (#rrggbb).
    penColor: INK_COLORS.some((color) => color.id === raw.penColor) || isHexColor(raw.penColor) ? raw.penColor : base.penColor,
    highlighterWidth: Number.isInteger(raw.highlighterWidth) && raw.highlighterWidth >= 0 && raw.highlighterWidth < HIGHLIGHTER_WIDTHS.length
      ? raw.highlighterWidth : base.highlighterWidth,
    highlighterWidths: Array.isArray(raw.highlighterWidths) && raw.highlighterWidths.length === HIGHLIGHTER_WIDTHS.length
      ? raw.highlighterWidths.map((width, index) => (finite(width) ? clamp(Math.round(width), HIGHLIGHTER_RANGE.min, HIGHLIGHTER_RANGE.max) : HIGHLIGHTER_WIDTHS[index]))
      : base.highlighterWidths,
    highlighterColor: HIGHLIGHTER_COLORS.some((color) => color.id === raw.highlighterColor) || isHexColor(raw.highlighterColor)
      ? raw.highlighterColor : base.highlighterColor,
    eraserMode: ERASER_MODES.includes(raw.eraserMode) ? raw.eraserMode : base.eraserMode,
    eraserSize: Number.isInteger(raw.eraserSize) && raw.eraserSize >= 0 && raw.eraserSize < ERASER_SIZES.length ? raw.eraserSize : base.eraserSize,
    textSize: Number.isInteger(raw.textSize) && raw.textSize >= 0 && raw.textSize < TEXT_SIZES.length ? raw.textSize : base.textSize,
    customColors: Array.isArray(raw.customColors)
      ? [...new Set(raw.customColors.filter(isHexColor).map((color) => color.toLowerCase()))].slice(0, CUSTOM_COLOR_LIMIT) : base.customColors,
    selectShape: SELECT_SHAPES.includes(raw.selectShape) ? raw.selectShape : base.selectShape,
    selectMode: SELECT_MODES.includes(raw.selectMode) ? raw.selectMode : base.selectMode,
    rulerSnap: typeof raw.rulerSnap === 'boolean' ? raw.rulerSnap : base.rulerSnap,
    shape: SHAPES.includes(raw.shape) ? raw.shape : base.shape,
    shapeFill: SHAPE_FILLS.includes(raw.shapeFill) ? raw.shapeFill : base.shapeFill,
    guide: cleanGuide(raw.guide),
    shapeLock: typeof raw.shapeLock === 'boolean' ? raw.shapeLock : base.shapeLock,
    lineCaps: cleanCaps(raw.lineCaps, base.lineCaps),
    arrowCaps: cleanCaps(raw.arrowCaps, base.arrowCaps),
    shapeDash: SHAPE_DASHES.includes(raw.shapeDash) ? raw.shapeDash : base.shapeDash,
    curveCaps: cleanCaps(raw.curveCaps, base.curveCaps),
    connectorCaps: cleanCaps(raw.connectorCaps, base.connectorCaps),
    pointMark: POINT_MARKS.includes(raw.pointMark) ? raw.pointMark : base.pointMark,
    ellipseMode: ELLIPSE_MODES.includes(raw.ellipseMode) ? raw.ellipseMode : base.ellipseMode,
    dimMode: DIM_MODES.includes(raw.dimMode) ? raw.dimMode : base.dimMode,
    dimAxis: DIM_AXES.includes(raw.dimAxis) ? raw.dimAxis : base.dimAxis,
    arcMode: ARC_MODES.includes(raw.arcMode) ? raw.arcMode : base.arcMode,
    ellipseAxes: typeof raw.ellipseAxes === 'boolean' ? raw.ellipseAxes : base.ellipseAxes,
    editOffset: editLength(raw.editOffset, base.editOffset),
    editFillet: editLength(raw.editFillet, base.editFillet, true),
    editChamfer: editLength(raw.editChamfer, base.editChamfer),
    ttrRadius: editLength(raw.ttrRadius, base.ttrRadius),
    arrayKind: ARRAY_KINDS.includes(raw.arrayKind) ? raw.arrayKind : base.arrayKind,
    stickyColor: STICKY_COLORS.some((color) => color.id === raw.stickyColor) ? raw.stickyColor : base.stickyColor,
    edgeSnap: typeof raw.edgeSnap === 'boolean' ? raw.edgeSnap : base.edgeSnap,
    dimOffset: finite(raw.dimOffset) ? clamp(Math.round(raw.dimOffset), DIM_OFFSET_LIMITS.min, DIM_OFFSET_LIMITS.max) : base.dimOffset,
    recognize: typeof raw.recognize === 'boolean' ? raw.recognize : base.recognize,
    recentFits: cleanRecentFits(raw.recentFits, (fit) => FIT_RE.test(fit)),
    fingerDraws: typeof raw.fingerDraws === 'boolean' ? raw.fingerDraws : base.fingerDraws,
    toolGroup: typeof raw.toolGroup === 'string' && raw.toolGroup.length <= 40 ? raw.toolGroup : base.toolGroup,
    uiHidden: cleanUiHidden(raw.uiHidden),
    toolGroups: cleanToolGroups(raw.toolGroups),
    shapeStyles: cleanShapeStyles(raw.shapeStyles),
    ringPositions: cleanRingPositions(raw.ringPositions),
    ngonSides: NGON_SIDES.includes(raw.ngonSides) ? raw.ngonSides : base.ngonSides,
    rectCorner: cleanToolCorner(raw.rectCorner),
    coords: typeof raw.coords === 'boolean' ? raw.coords : base.coords
  };
}

/**
 * Grubość kreski pióra dla nacisku 0–1: między width.min a width.max, tym bardziej zależna od
 * nacisku, im większa czułość. Bez czułości (albo bez nacisku – palec, mysz) – środek zakresu.
 */
export function penWidth(pressure, width, sensitivity = 'medium') {
  const gain = SENSITIVITY[sensitivity] ?? SENSITIVITY.medium;
  const value = finite(pressure) && pressure > 0 ? pressure : 0.5;
  const share = clamp(0.5 + (value - 0.5) * gain, 0, 1);
  return width.min + (width.max - width.min) * share;
}

/**
 * Wygładzanie: kolejny punkt kreski przesunięty w stronę poprzedniego (wygładzanie 0 – bez zmian,
 * 1 – najmocniej). Mniej drżenia przy szybkim pisaniu, kosztem lekkiego „spóźnienia” kreski.
 */
export function smoothPoint(previous, next, smoothing) {
  if (!previous) return next;
  const follow = 1 - clamp(smoothing, 0, 1) * 0.75;
  return { x: previous.x + (next.x - previous.x) * follow, y: previous.y + (next.y - previous.y) * follow, w: next.w };
}

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Dokłada punkt do kreski (zaokrąglony – mniejszy zapis); punkt w tym samym miejscu – pomijany. */
export function addPoint(stroke, point) {
  const { points } = stroke;
  const x = round(point.x, 1);
  const y = round(point.y, 1);
  const w = round(point.w, 2);
  const last = points.length - 3;
  if (last >= 0 && points[last] === x && points[last + 1] === y) {
    points[last + 2] = Math.max(points[last + 2], w);
    return false;
  }
  points.push(x, y, w);
  return true;
}

/** Odległość punktu od odcinka (a–b). */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / length, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Czy gumka o promieniu `radius` w punkcie (x, y) dotyka kreski (z jej grubością). */
export function touchesStroke(stroke, x, y, radius) {
  if (isShape(stroke)) return touchesShape(stroke, x, y, radius);
  if (isArray(stroke)) {
    const bounds = strokeBounds(stroke);
    if (x < bounds.minX - radius || x > bounds.maxX + radius || y < bounds.minY - radius || y > bounds.maxY + radius) return false;
    return expandArray(stroke).some((item) => touchesStroke(item, x, y, radius));
  }
  if (isElement(stroke)) {
    const box = elementBox(stroke);
    if (x >= box.x - radius && x <= box.x + box.width + radius && y >= box.y - radius && y <= box.y + box.height + radius) return true;
    // Strzałka karteczki (od 1.21) i symbolu metrologicznego (od 1.22.1) też się liczy.
    if (stroke.leader) {
      const start = leaderStart(stroke);
      return segmentDistance(x, y, start.x, start.y, stroke.leader.x, stroke.leader.y) <= radius + 4;
    }
    return false;
  }
  const { points } = stroke;
  if (points.length < 3) return false;
  if (points.length === 3) return Math.hypot(x - points[0], y - points[1]) <= radius + points[2] / 2;
  for (let index = 3; index < points.length; index += 3) {
    const reach = radius + Math.max(points[index - 1], points[index + 2]) / 2;
    if (segmentDistance(x, y, points[index - 3], points[index - 2], points[index], points[index + 1]) <= reach) return true;
  }
  return false;
}

/** Numery kresek, których dotyka gumka (od góry – ostatnio narysowanych). */
export function strokesAt(strokes, x, y, radius) {
  const hits = [];
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    if (touchesStroke(strokes[index], x, y, radius)) hits.push(index);
  }
  return hits;
}

// ---------------------------------------------------------------- gumka fragmentów, zaznaczanie

/** Granice kreski razem z grubością (zapamiętane – kreski się nie zmieniają). */
const boundsCache = new WeakMap();
export function strokeBounds(stroke) {
  let bounds = boundsCache.get(stroke);
  if (bounds) return bounds;
  if (isShape(stroke)) {
    bounds = shapeBounds(stroke);
    boundsCache.set(stroke, bounds);
    return bounds;
  }
  if (isArray(stroke)) {
    bounds = selectionBounds(expandArray(stroke));
    boundsCache.set(stroke, bounds);
    return bounds;
  }
  if (isElement(stroke)) {
    const box = elementBox(stroke);
    bounds = { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height };
    if (stroke.leader) {
      // Trójkąt bazy (od 1.22.1) – wokół końca o pół wielkości tekstu.
      const reach = stroke.tool === 'datum' ? stroke.size * 0.6 : 6;
      bounds.minX = Math.min(bounds.minX, stroke.leader.x - reach);
      bounds.minY = Math.min(bounds.minY, stroke.leader.y - reach);
      bounds.maxX = Math.max(bounds.maxX, stroke.leader.x + reach);
      bounds.maxY = Math.max(bounds.maxY, stroke.leader.y + reach);
    }
    boundsCache.set(stroke, bounds);
    return bounds;
  }
  const { points } = stroke;
  bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let index = 0; index < points.length; index += 3) {
    const half = points[index + 2] / 2;
    bounds.minX = Math.min(bounds.minX, points[index] - half);
    bounds.maxX = Math.max(bounds.maxX, points[index] + half);
    bounds.minY = Math.min(bounds.minY, points[index + 1] - half);
    bounds.maxY = Math.max(bounds.maxY, points[index + 1] + half);
  }
  boundsCache.set(stroke, bounds);
  return bounds;
}

/** Nowa kreska z punktów [x, y, w, …] – zaokrąglonych i bez powtórzeń, jak przy rysowaniu. */
function strokeFrom(source, points) {
  // Od 1.36 z sygnaturami kreski (kawałki po gumce zostają na jej warstwach).
  const stroke = { ...source, points: [] };
  for (let index = 0; index < points.length; index += 3) addPoint(stroke, { x: points[index], y: points[index + 1], w: points[index + 2] });
  return stroke;
}

/**
 * Gumka fragmentów (od 1.12.1): część kreski w kole (x, y, radius) znika, reszta zostaje jako nowe
 * kreski. Koło sięga do brzegu tuszu (promień + połowa grubości), a odcinek między punktami jest
 * przecinany na brzegu koła, więc dziura nie zależy od gęstości punktów. Zwraca null, gdy koło nie
 * dotyka kreski, albo listę kawałków (pustą, gdy znika cała kreska).
 */
export function eraseFromStroke(stroke, x, y, radius) {
  // Pola tekstowego i wzoru nie da się przeciąć – usuwa je gumka całych kresek albo zaznaczenie.
  if (isElement(stroke)) return null;
  const bounds = strokeBounds(stroke);
  if (x + radius < bounds.minX || x - radius > bounds.maxX || y + radius < bounds.minY || y - radius > bounds.maxY) return null;
  const { points } = stroke;
  const count = points.length / 3;
  if (count === 0) return null;
  if (count === 1) return Math.hypot(points[0] - x, points[1] - y) < radius + points[2] / 2 ? [] : null;
  const pieces = [];
  let current = Math.hypot(points[0] - x, points[1] - y) < radius + points[2] / 2 ? null : [points[0], points[1], points[2]];
  let cut = current === null;
  for (let point = 1; point < count; point += 1) {
    const [ax, ay, aw] = [points[point * 3 - 3], points[point * 3 - 2], points[point * 3 - 1]];
    const [bx, by, bw] = [points[point * 3], points[point * 3 + 1], points[point * 3 + 2]];
    // Część odcinka A–B w kole: t od `enter` do `leave` (|A + t·(B − A) − środek| < promień).
    const reach = radius + Math.max(aw, bw) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const a = dx * dx + dy * dy;
    const b = (ax - x) * dx + (ay - y) * dy;
    const c = (ax - x) ** 2 + (ay - y) ** 2 - reach * reach;
    let enter = null;
    let leave = null;
    if (a === 0) {
      if (c < 0) [enter, leave] = [0, 1];
    } else if (b * b - a * c > 0) {
      const root = Math.sqrt(b * b - a * c);
      const [t0, t1] = [(-b - root) / a, (-b + root) / a];
      if (t1 > 0 && t0 < 1) [enter, leave] = [Math.max(0, t0), Math.min(1, t1)];
    }
    if (enter === null) {
      if (!current) current = [ax, ay, aw];
      current.push(bx, by, bw);
      continue;
    }
    cut = true;
    const at = (t) => [ax + dx * t, ay + dy * t, aw + (bw - aw) * t];
    if (enter > 0) {
      if (!current) current = [ax, ay, aw];
      current.push(...at(enter));
    }
    if (current) pieces.push(current);
    current = leave < 1 ? [...at(leave), bx, by, bw] : null;
  }
  if (current) pieces.push(current);
  if (!cut) return null;
  // Okruch jednego punktu po przecięciu byłby kropką – znika razem z resztą.
  return pieces.map((piece) => strokeFrom(stroke, piece)).filter((piece) => piece.points.length >= 6);
}

/** Gumka fragmentów na całym rysunku: zmienia listę kresek w miejscu; zwraca, czy coś starła. */
export function eraseAt(strokes, x, y, radius, canErase = null) {
  let changed = false;
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    // Od 1.36 – bez elementów ukrytych warstw (`canErase`).
    if (canErase && !canErase(strokes[index])) continue;
    const pieces = eraseFromStroke(strokes[index], x, y, radius);
    if (!pieces) continue;
    strokes.splice(index, 1, ...pieces);
    changed = true;
  }
  return changed;
}

/** Numery kresek leżących w całości w prostokącie (zaznaczanie prostokątem; liczy się linia środkowa kreski). */
export function strokesInRect(strokes, rect) {
  const [left, right] = [Math.min(rect.x0, rect.x1), Math.max(rect.x0, rect.x1)];
  const [top, bottom] = [Math.min(rect.y0, rect.y1), Math.max(rect.y0, rect.y1)];
  const found = [];
  strokes.forEach((stroke, index) => {
    if (isArray(stroke)) {
      const copies = expandArray(stroke);
      if (strokesInRect(copies, rect).length === copies.length) found.push(index);
      return;
    }
    if (isElement(stroke)) {
      if (elementCorners(stroke).every(([x, y]) => x >= left && x <= right && y >= top && y <= bottom)) found.push(index);
      return;
    }
    const { points } = stroke;
    for (let point = 0; point < points.length; point += 3) {
      if (points[point] < left || points[point] > right || points[point + 1] < top || points[point + 1] > bottom) return;
    }
    if (points.length > 0) found.push(index);
  });
  return found;
}

/**
 * Punkty, które muszą leżeć w obszarze, żeby pole tekstowe, wzór albo kształt był zaznaczony:
 * narożniki pola i wzoru, punkty obrysu kształtu (i grot strzałki).
 */
function elementCorners(element) {
  if (!isShape(element)) {
    const box = elementBox(element);
    const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]];
    // Koniec strzałki karteczki (od 1.21) też musi być w obszarze.
    if (element.leader) corners.push([element.leader.x, element.leader.y]);
    return corners;
  }
  const { points } = shapeOutline(element);
  const corners = [];
  for (let index = 0; index < points.length; index += 2) corners.push([points[index], points[index + 1]]);
  // Zakończenia odcinka (grot, trójkąt, koło…) też muszą być w obszarze.
  for (const point of capPoints(element)) corners.push([point.x, point.y]);
  return corners;
}

// ---------------------------------------------------------------- kolejność rysowania i pole (od 1.40)

/** Kolejność rysowania zaznaczonych: na wierzch, wyżej, niżej, na spód. */
export const ORDER_MOVES = Object.freeze(['front', 'up', 'down', 'back']);
export const ORDER_LABELS = Object.freeze({ front: 'Na wierzch', up: 'Wyżej', down: 'Niżej', back: 'Na spód' });
const boundsMeet = (a, b) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/**
 * Kreski w nowej kolejności rysowania (później – wyżej): wybrane (`chosen` – zbiór) na wierzch albo
 * na spód (ich kolejność między sobą zostaje); „wyżej” – każda wybrana tuż nad najbliższą wyżej
 * niewybraną, którą zakrywa (granice się stykają), „niżej” – tuż pod najbliższą niżej. Bez zmian –
 * ta sama tablica.
 */
export function reorderStrokes(strokes, chosen, move, boundsOf = strokeBounds) {
  const picked = strokes.filter((stroke) => chosen.has(stroke));
  if (picked.length === 0 || picked.length === strokes.length) return strokes;
  let next;
  if (move === 'front' || move === 'back') {
    const rest = strokes.filter((stroke) => !chosen.has(stroke));
    next = move === 'front' ? [...rest, ...picked] : [...picked, ...rest];
  } else {
    next = [...strokes];
    const up = move === 'up';
    // Najpierw te najdalej w kierunku ruchu – nie przeskakują siebie nawzajem.
    for (const stroke of up ? [...picked].reverse() : picked) {
      const from = next.indexOf(stroke);
      const own = boundsOf(stroke);
      let to = -1;
      for (let index = from + (up ? 1 : -1); index >= 0 && index < next.length; index += up ? 1 : -1) {
        if (chosen.has(next[index])) continue;
        if (boundsMeet(own, boundsOf(next[index]))) {
          to = index;
          break;
        }
      }
      if (to < 0) continue;
      next.splice(from, 1);
      next.splice(to, 0, stroke);
    }
  }
  return next.every((stroke, index) => stroke === strokes[index]) ? strokes : next;
}

/**
 * Pole i obwód zamkniętego kształtu (od 1.40) w jednostce liczb wymiarów rysunku (styl techniczny –
 * jego jednostka, inaczej jednostka skali): { area: '12,5 cm²', perimeter: '14,3 cm' } albo null.
 */
export function shapeMeasureText(shape, scale, format = 'unit') {
  const measure = shapeMeasure(shape);
  if (!measure) return null;
  const factor = toScaleLength(1, scale) * dimFactor(scale, format);
  return { area: `${formatNumber(measure.area * factor * factor)} ${dimUnitLabel(scale, format)}²`, perimeter: lengthText(measure.perimeter, scale, format) };
}
/**
 * Długość linii (od 1.45 – „spaghetti”: trasy ruchu) w jednostkach strony albo null: odcinek, strzałka, łącznik (przebieg),
 * łamana, łuk, strzałka po łuku, kreska pióra i zakreślacza (bez prostej, półprostej, wymiaru i figur zamkniętych).
 */
export function pathLength(stroke) {
  const sum = (points) => points.reduce((total, point, index) => (index === 0 ? 0 : total + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y)), 0);
  if (stroke?.tool === 'pen' || stroke?.tool === 'highlighter') {
    const points = [];
    for (let index = 0; index + 2 < stroke.points.length; index += 3) points.push({ x: stroke.points[index], y: stroke.points[index + 1] });
    return points.length > 1 ? sum(points) : null;
  }
  if (!isShape(stroke) || isXline(stroke) || isMeasure(stroke) || stroke.shape === 'point') return null;
  const { points, closed } = shapeOutline(stroke);
  if (closed) return null;
  const list = [];
  for (let index = 0; index + 1 < points.length; index += 2) list.push({ x: points[index], y: points[index + 1] });
  return sum(list);
}
/** Suma długości linii zaznaczenia jako napis w jednostkach rysunku i ich liczba – albo null (żadnej linii). */
export function pathLengthText(strokes, scale, format = 'unit') {
  const lengths = strokes.map(pathLength).filter((length) => length !== null);
  if (lengths.length === 0) return null;
  return { count: lengths.length, text: lengthText(lengths.reduce((total, length) => total + length, 0), scale, format) };
}
/** Liczba wymiaru bryły (od 1.47): długość w jednostkach strony jak liczba wymiaru kształtu („⌀40”; opisowo – „⌀4 cm”). */
export function solidDimText(dim, scale, format = 'unit') {
  const technical = formatOf(format).style === 'technical';
  const value = toScaleLength(dim.value, scale) * (technical ? dimFactor(scale, format) : 1);
  return `${dim.prefix ?? ''}${formatNumber(value)}${technical ? '' : ` ${unitOf(cleanScale(scale).unit).label}`}`;
}
/** Długość w jednostkach strony jako napis w jednostce liczb wymiarów rysunku („2,5 mm”). */
export const lengthText = (units, scale, format = 'unit') => `${formatNumber(toScaleLength(units, scale) * dimFactor(scale, format))} ${dimUnitLabel(scale, format)}`;

/** Granice kilku kresek (zaznaczenie) albo null. */
export function selectionBounds(strokes) {
  if (strokes.length === 0) return null;
  const all = strokes.map(strokeBounds);
  return {
    minX: Math.min(...all.map((bounds) => bounds.minX)), minY: Math.min(...all.map((bounds) => bounds.minY)),
    maxX: Math.max(...all.map((bounds) => bounds.maxX)), maxY: Math.max(...all.map((bounds) => bounds.maxY))
  };
}

/** Kreska przesunięta o (dx, dy) – nowa kreska, oryginał bez zmian. */
export function translateStroke(stroke, dx, dy) {
  if (isArray(stroke)) return translateArray(stroke, dx, dy);
  if (isElement(stroke)) {
    const moved = { ...stroke, x: round(stroke.x + dx, 1), y: round(stroke.y + dy, 1) };
    if (stroke.leader) moved.leader = { x: round(stroke.leader.x + dx, 1), y: round(stroke.leader.y + dy, 1) };
    return moved;
  }
  const points = stroke.points.slice();
  for (let index = 0; index < points.length; index += 3) {
    points[index] = round(points[index] + dx, 1);
    points[index + 1] = round(points[index + 1] + dy, 1);
  }
  return { ...stroke, points };
}

// ---------------------------------------------------------------- linijka

/** Kąty, do których linijka lekko przyskakuje (co 45°), i jak blisko (w stopniach). */
export const RULER_SNAP_STEP = 45;
export const RULER_SNAP_TOLERANCE = 2.5;

/** Kąt linijki (radiany) z przyskoczeniem do 0°, 45°, 90°, 135°…, w zakresie (−π, π]. */
export function snapRulerAngle(angle) {
  let degrees = ((angle * 180) / Math.PI) % 360;
  if (degrees > 180) degrees -= 360;
  if (degrees <= -180) degrees += 360;
  const nearest = Math.round(degrees / RULER_SNAP_STEP) * RULER_SNAP_STEP;
  if (Math.abs(degrees - nearest) <= RULER_SNAP_TOLERANCE) degrees = nearest === -180 ? 180 : nearest;
  return (degrees * Math.PI) / 180;
}

/**
 * Kąt linijki do wyświetlenia: pełne stopnie 0–179, liczone jak w geometrii – przeciwnie do ruchu
 * wskazówek zegara od poziomu (oś y ekranu biegnie w dół). Linijka obrócona o 180° to ta sama linijka.
 */
export function rulerDegrees(angle) {
  const degrees = Math.round((-angle * 180) / Math.PI);
  return ((degrees % 180) + 180) % 180;
}

/** Położenie punktu względem linijki { x, y, angle }: wzdłuż niej i w poprzek (od linii środkowej). */
export function rulerOffset(ruler, x, y) {
  const [cos, sin] = [Math.cos(ruler.angle), Math.sin(ruler.angle)];
  const [dx, dy] = [x - ruler.x, y - ruler.y];
  return { along: dx * cos + dy * sin, across: -dx * sin + dy * cos };
}

/** Punkt na prostej równoległej do linijki w odległości `across` od jej środka (kreska przy krawędzi). */
export function rulerPoint(ruler, along, across) {
  const [cos, sin] = [Math.cos(ruler.angle), Math.sin(ruler.angle)];
  return { x: ruler.x + along * cos - across * sin, y: ruler.y + along * sin + across * cos };
}

// ---------------------------------------------------------------- przyciąganie linijki (od 1.14)

/** Przecięcie odcinków A–B i C–D: { x, y, t } (t – położenie na A–B) albo null. */
function crossing(ax, ay, bx, by, cx, cy, dx, dy) {
  const [rx, ry, sx, sy] = [bx - ax, by - ay, dx - cx, dy - cy];
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / denominator;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + t * rx, y: ay + t * ry, t };
}

/** Odcinki kreski [ax, ay, bx, by] przechodzące nie dalej niż `radius` od punktu. */
function segmentsNear(stroke, x, y, radius) {
  const { points } = stroke;
  const found = [];
  for (let index = 3; index < points.length; index += 3) {
    const segment = [points[index - 3], points[index - 2], points[index], points[index + 1]];
    if (segmentDistance(x, y, ...segment) <= radius) found.push(segment);
  }
  return found;
}

/**
 * Punkt, do którego przyskakuje zero linijki: najbliższe przecięcie dwóch kresek w promieniu,
 * a gdy go nie ma – najbliższy punkt kreski, z kierunkiem kreski w tym miejscu (radiany).
 * Zwraca { x, y, kind: 'crossing' | 'line', angle? } albo null. Pola tekstowe i wzory się nie liczą.
 */
export function snapToStrokes(strokes, x, y, radius) {
  // Kształty (od 1.15) – jak kreski wzdłuż ich obrysu, szyki (od 1.19) – każda kopia; pola tekstowe i wzory się nie liczą.
  const near = strokes
    .flatMap((stroke) => (isArray(stroke) ? expandArray(stroke) : [stroke]))
    .map((stroke) => (isShape(stroke) ? shapeAsStroke(stroke) : stroke))
    .filter((stroke) => {
      if (isElement(stroke) || stroke.points.length < 6) return false;
      const bounds = strokeBounds(stroke);
      return x >= bounds.minX - radius && x <= bounds.maxX + radius && y >= bounds.minY - radius && y <= bounds.maxY + radius;
    })
    .map((stroke) => segmentsNear(stroke, x, y, radius))
    .filter((segments) => segments.length > 0);
  let best = null;
  for (let first = 0; first < near.length; first += 1) {
    for (let second = first + 1; second < near.length; second += 1) {
      for (const a of near[first]) {
        for (const b of near[second]) {
          const point = crossing(...a, ...b);
          if (!point) continue;
          const distance = Math.hypot(point.x - x, point.y - y);
          if (distance <= radius && (!best || distance < best.distance)) best = { x: point.x, y: point.y, kind: 'crossing', distance };
        }
      }
    }
  }
  if (!best) {
    for (const segments of near) {
      for (const [ax, ay, bx, by] of segments) {
        const length = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = length === 0 ? 0 : clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length, 0, 1);
        const point = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
        const distance = Math.hypot(point.x - x, point.y - y);
        if (length > 0 && (!best || distance < best.distance)) best = { ...point, kind: 'line', angle: Math.atan2(by - ay, bx - ax), distance };
      }
    }
  }
  if (!best) return null;
  const snap = { ...best };
  delete snap.distance;
  return snap;
}

/** Różnica kierunków prostych (bez zwrotu, 0 – π/2). */
export function lineAngleDifference(first, second) {
  const difference = (((first - second) % Math.PI) + Math.PI) % Math.PI;
  return Math.min(difference, Math.PI - difference);
}

/** Kąt linijki prostopadłej do kierunku `lineAngle`, najbliższy obecnemu kątowi `current`. */
export function perpendicularAngle(lineAngle, current) {
  const candidates = [lineAngle + Math.PI / 2, lineAngle - Math.PI / 2];
  const turn = (angle) => Math.abs(Math.atan2(Math.sin(angle - current), Math.cos(angle - current)));
  return turn(candidates[0]) <= turn(candidates[1]) ? candidates[0] : candidates[1];
}

// ---------------------------------------------------------------- obszar zaznaczania (od 1.14)

/** Prostokąt { x0, y0, x1, y1 } jako wielokąt [x, y, x, y, …]. */
export const rectPolygon = ({ x0, y0, x1, y1 }) => [x0, y0, x1, y0, x1, y1, x0, y1];

/** Czy punkt leży wewnątrz wielokąta [x, y, x, y, …] (reguła parzystości). */
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 2; index < polygon.length; previous = index, index += 2) {
    const [xi, yi, xj, yj] = [polygon[index], polygon[index + 1], polygon[previous], polygon[previous + 1]];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Czy obrys biegnie zgodnie z ruchem wskazówek zegara – tak, jak go widać na ekranie (oś y w dół):
 * lasso zgodnie ze wskazówkami zaznacza wnętrze (fragmenty), przeciwnie – całe kreski.
 */
export function isClockwise(polygon) {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 2) {
    const next = (index + 2) % polygon.length;
    area += polygon[index] * polygon[next + 1] - polygon[next] * polygon[index + 1];
  }
  return area > 0;
}

/** Czy pole tekstowe, wzór, kształt albo (od 1.19) szyk – wszystkie kopie – leży w całości w wielokącie. */
function elementInPolygon(element, polygon) {
  if (isArray(element)) {
    const copies = expandArray(element);
    return strokesInPolygon(copies, polygon).length === copies.length;
  }
  return elementCorners(element).every(([x, y]) => pointInPolygon(x, y, polygon));
}

/** Numery kresek, pól i wzorów leżących w całości w wielokącie (lasso – całe kreski). */
export function strokesInPolygon(strokes, polygon) {
  const found = [];
  strokes.forEach((stroke, index) => {
    if (isElement(stroke)) {
      if (elementInPolygon(stroke, polygon)) found.push(index);
      return;
    }
    const { points } = stroke;
    for (let point = 0; point < points.length; point += 3) {
      if (!pointInPolygon(points[point], points[point + 1], polygon)) return;
    }
    if (points.length > 0) found.push(index);
  });
  return found;
}

/**
 * Kreska podzielona brzegiem obszaru (zaznaczanie fragmentów): { inside, outside } – kawałki
 * w środku i poza nim, cięte dokładnie na brzegu (grubość przeliczona w miejscu cięcia). Kreska
 * w całości w środku zostaje tym samym obiektem; null – kreska nie sięga obszaru. Pola tekstowego
 * i wzoru nie da się przeciąć – są w środku tylko w całości.
 */
export function splitByPolygon(stroke, polygon) {
  if (isElement(stroke)) return elementInPolygon(stroke, polygon) ? { inside: [stroke], outside: [] } : null;
  const { points } = stroke;
  const count = points.length / 3;
  if (count === 0) return null;
  if (count === 1) return pointInPolygon(points[0], points[1], polygon) ? { inside: [stroke], outside: [] } : null;
  const runs = [];
  let current = null;
  const push = (inside, x, y, w) => {
    if (!current || current.inside !== inside) {
      // Nowy kawałek zaczyna się w punkcie, w którym skończył się poprzedni (na brzegu obszaru).
      const start = current ? current.points.slice(-3) : [];
      current = { inside, points: [...start] };
      runs.push(current);
    }
    current.points.push(x, y, w);
  };
  for (let point = 1; point < count; point += 1) {
    const [ax, ay, aw] = [points[point * 3 - 3], points[point * 3 - 2], points[point * 3 - 1]];
    const [bx, by, bw] = [points[point * 3], points[point * 3 + 1], points[point * 3 + 2]];
    const cuts = [0];
    for (let index = 0, previous = polygon.length - 2; index < polygon.length; previous = index, index += 2) {
      const hit = crossing(ax, ay, bx, by, polygon[previous], polygon[previous + 1], polygon[index], polygon[index + 1]);
      if (hit && hit.t > 0 && hit.t < 1) cuts.push(hit.t);
    }
    cuts.push(1);
    cuts.sort((a, b) => a - b);
    const at = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t, aw + (bw - aw) * t];
    if (point === 1) push(pointInPolygon(...at(Math.min(cuts[1], 1) / 2).slice(0, 2), polygon), ax, ay, aw);
    for (let index = 1; index < cuts.length; index += 1) {
      if (cuts[index] - cuts[index - 1] < 1e-9) continue;
      const middle = at((cuts[index - 1] + cuts[index]) / 2);
      push(pointInPolygon(middle[0], middle[1], polygon), ...at(cuts[index]));
    }
  }
  if (!runs.some((run) => run.inside)) return null;
  if (runs.every((run) => run.inside)) return { inside: [stroke], outside: [] };
  const pieces = (inside) => runs.filter((run) => run.inside === inside).map((run) => strokeFrom(stroke, run.points)).filter((piece) => piece.points.length >= 6);
  return { inside: pieces(true), outside: pieces(false) };
}

// ---------------------------------------------------------------- historia

/** Te same kreski w tej samej kolejności. */
function sameStrokes(first, second) {
  return first.length === second.length && first.every((stroke, index) => stroke === second[index]);
}

function replaceStrokes(target, source) {
  target.length = 0;
  for (const stroke of source) target.push(stroke);
}

/**
 * Historia cofania. Od 1.12.1 każdy krok to stan listy kresek przed zmianą i po niej – kreski się
 * nie zmieniają (starcie fragmentu, przesunięcie dają nowe kreski), więc cofnięcie przywraca
 * dokładnie poprzedni rysunek. Zmiana trwająca dłużej (pociągnięcie gumką, przesuwanie zaznaczenia)
 * to jeden krok: begin() … commit().
 */
export class DrawingHistory {
  constructor(strokes) {
    this.strokes = strokes;
    this.done = [];
    this.undone = [];
    this.before = null;
  }

  /** Początek zmiany – zapamiętany stan sprzed niej; kolejne zmiany do commit() to jeden krok. */
  begin() {
    if (!this.before) this.before = [...this.strokes];
  }

  /** Koniec zmiany; zwraca, czy coś się zmieniło (zmiana bez skutku nie trafia do historii). */
  commit() {
    const before = this.before;
    this.before = null;
    if (!before || sameStrokes(before, this.strokes)) return false;
    this.done.push({ before, after: [...this.strokes] });
    this.undone = [];
    return true;
  }

  /** Nowa kreska na wierzchu (osobny krok). */
  add(stroke) {
    this.commit();
    this.begin();
    this.strokes.push(stroke);
    this.commit();
  }

  /** Usuwa kreski o podanych numerach; kolejne usunięcia do closeStep() to jeden krok (pociągnięcie gumką). */
  remove(indexes) {
    const unique = [...new Set(indexes)].filter((index) => index >= 0 && index < this.strokes.length).sort((a, b) => b - a);
    if (unique.length === 0) return false;
    this.begin();
    for (const index of unique) this.strokes.splice(index, 1);
    return true;
  }

  /**
   * Odrzuca zmianę zaczętą begin() – kreski wracają do stanu sprzed niej, bez kroku cofania
   * (od 1.14: kreski przecięte przy zaznaczaniu fragmentu, gdy zaznaczenie zniknęło bez skutku).
   */
  rollback() {
    if (!this.before) return false;
    replaceStrokes(this.strokes, this.before);
    this.before = null;
    return true;
  }

  /** Koniec pociągnięcia gumką – następne usunięcie to nowy krok cofania. */
  closeStep() {
    return this.commit();
  }

  get canUndo() { return this.done.length > 0 || Boolean(this.before && !sameStrokes(this.before, this.strokes)); }
  get canRedo() { return this.undone.length > 0; }

  undo() {
    this.commit();
    const step = this.done.pop();
    if (!step) return false;
    replaceStrokes(this.strokes, step.before);
    this.undone.push(step);
    return true;
  }

  redo() {
    this.commit();
    const step = this.undone.pop();
    if (!step) return false;
    replaceStrokes(this.strokes, step.after);
    this.done.push(step);
    return true;
  }
}

/** Najwięcej kresek i punktów – większy zapis to raczej uszkodzone dane niż rysunek. */
export const MAX_STROKES = 20000;
export const MAX_POINTS = 60000;
const HEX = /^#[0-9a-f]{6}$/i;

/** Pusty rysunek (strona albo zdjęcie pod spodem). */
export function emptyDrawing({ photo = null, paper = 'grid' } = {}) {
  const scale = photo ? Math.min(1, PHOTO_PAGE_MAX / Math.max(photo.width, photo.height)) : 1;
  return {
    version: DRAWING_VERSION,
    width: photo ? Math.max(16, Math.round(photo.width * scale)) : PAGE_WIDTH,
    height: photo ? Math.max(16, Math.round(photo.height * scale)) : PAGE_HEIGHT,
    paper: photo ? 'plain' : paper,
    paperLevel: DEFAULT_PAPER_LEVEL,
    strokes: [],
    scale: defaultScale(),
    ...(photo ? { photo } : {})
  };
}

/**
 * Sprawdzony rysunek albo null (zapis, kopia zapasowa): złe kreski i punkty są pomijane, liczby
 * ograniczone do strony. Zdjęcie bez bajtów (opis z pliku danych) zostaje bez nich.
 */
export function cleanDrawing(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // Brak albo zerowy rozmiar – rysunek uszkodzony; bardzo mały albo bardzo duży – przycięty do granic.
  const width = finite(raw.width) && raw.width >= 1 ? clamp(Math.round(raw.width), 16, 8192) : null;
  const height = finite(raw.height) && raw.height >= 1 ? clamp(Math.round(raw.height), 16, 8192) : null;
  if (!width || !height) return null;
  const strokes = [];
  // Od 1.25 (format 10) tolerancje długości są w milimetrach; starsze – w jednostce liczby wymiaru
  // (styl „50” – mm, przy skali imperialnej cale; styl „5 cm” – jednostka skali).
  const scale = cleanScale(raw.scale);
  const legacy = !(finite(raw.version) && raw.version >= 10);
  const toMillimeters = !legacy ? 1 : raw.dimStyle === 'technical' ? dimMillimeters(scale, { style: 'technical', unit: defaultDimUnit(scale) }) : dimMillimeters(scale, 'unit');
  // Od 1.36 (format 11) warstwy rysunku i sygnatury elementów – tylko istniejących warstw.
  const layers = Array.isArray(raw.layers) ? cleanLayers(raw.layers) : null;
  const known = new Set(elementLayers(layers ?? defaultLayers()).map((layer) => layer.id));
  for (const stroke of Array.isArray(raw.strokes) ? raw.strokes.slice(0, MAX_STROKES) : []) {
    const clean = cleanStroke(stroke, width, height, true, known);
    if (clean) strokes.push(toMillimeters === 1 ? clean : tolerancesInMillimeters(clean, toMillimeters));
  }
  // Bryły postawione na innych (od 1.52, format 23): odnośniki do brył, których nie ma – usunięte, obrazki stosów – wyliczone.
  resolveStacks(strokes);
  // Pomiary 3D (od 1.53, format 24) z bryłami albo cechami, których nie ma – usunięte.
  resolveMeasures(strokes);
  const template = cleanTemplate(raw.template, width, height, photoBytes);
  let photo = null;
  if (raw.photo && typeof raw.photo === 'object' && /^image\//.test(raw.photo.type ?? '')) {
    const bytes = photoBytes(raw.photo.bytes);
    photo = {
      type: raw.photo.type,
      width: finite(raw.photo.width) ? raw.photo.width : width,
      height: finite(raw.photo.height) ? raw.photo.height : height,
      ...(bytes ? { bytes } : {})
    };
  }
  return {
    version: DRAWING_VERSION,
    width,
    height,
    paper: PAPERS.includes(raw.paper) ? raw.paper : 'plain',
    paperLevel: cleanLevel(raw.paperLevel, DEFAULT_PAPER_LEVEL),
    strokes,
    scale,
    ...(raw.dimStyle === 'technical' ? { dimStyle: 'technical', ...(dimUnitOf(raw.dimUnit) ? { dimUnit: raw.dimUnit } : {}) } : {}),
    ...(template ? { template } : {}),
    ...(photo ? { photo } : {}),
    // Ramka rysunkowa (od 1.41) – tylko kartka bez zdjęcia.
    ...(!photo && cleanFrame(raw.frame) ? { frame: cleanFrame(raw.frame) } : {}),
    // Układ kartki (od 1.44) – też tylko bez zdjęcia.
    ...(!photo && cleanLayout(raw.layout) ? { layout: cleanLayout(raw.layout) } : {}),
    ...(layers ? { layers } : {}),
    ...(Number.isInteger(raw.activeLayer) && raw.activeLayer !== 1 && known.has(raw.activeLayer) ? { activeLayer: raw.activeLayer } : {}),
    // Początek układu współrzędnych arkusza (od 1.50) – punkt na kartce.
    ...(cleanOrigin(raw.origin, width, height) ? { origin: cleanOrigin(raw.origin, width, height) } : {})
  };
}

/** Początek układu współrzędnych arkusza (od 1.50): punkt na kartce (jednostki strony, 2 miejsca) albo null. */
export function cleanOrigin(raw, width, height) {
  if (!raw || typeof raw !== 'object' || !finite(raw.x) || !finite(raw.y)) return null;
  const round = (value) => Math.round(value * 100) / 100;
  return { x: round(clamp(raw.x, 0, width)), y: round(clamp(raw.y, 0, height)) };
}

/** Kształt (i kształty w szyku) z tolerancjami długości przeliczonymi do mm – `factor` mm w dawnej jednostce. */
function tolerancesInMillimeters(stroke, factor) {
  if (isArray(stroke)) return { ...stroke, items: stroke.items.map((item) => tolerancesInMillimeters(item, factor)) };
  return isShape(stroke) && stroke.dimTols ? scaleDimTolerances(stroke, factor) : stroke;
}

/**
 * Sprawdzona kreska, pole, wzór, kształt albo (od 1.19, gdy `arrays`) szyk – albo null. Elementy szyku
 * sprawdzane tak samo (bez szyków w szyku).
 */
function cleanStroke(stroke, width, height, arrays, known = null) {
  const clean = cleanStrokeData(stroke, width, height, arrays, known);
  if (!clean) return null;
  // Od 1.36 sygnatury (warstwy rzędu 1–3); sama warstwa 1 – bez pola.
  const signatures = cleanSignatures(stroke.layers, known);
  if (signatures) clean.layers = signatures;
  else delete clean.layers;
  return clean;
}

function cleanStrokeData(stroke, width, height, arrays, known) {
  if (isArray(stroke)) {
    if (!arrays || !Array.isArray(stroke.items)) return null;
    const items = stroke.items.slice(0, ARRAY_ITEMS_MAX).map((item) => cleanStroke(item, width, height, false, known)).filter(Boolean);
    return makeArray(items, stroke, Math.max(width, height) * 4);
  }
  if (isElement(stroke)) return cleanElement(stroke, width, height);
  if (!stroke || (stroke.tool !== 'pen' && stroke.tool !== 'highlighter') || !HEX.test(stroke.color ?? '')) return null;
  if (!Array.isArray(stroke.points)) return null;
  const points = [];
  const source = stroke.points.slice(0, MAX_POINTS * 3);
  // Zakreślacz (od 1.21) może być grubszy – do 60.
  const widest = stroke.tool === 'highlighter' ? HIGHLIGHTER_RANGE.max : WIDTH_LIMITS.max;
  for (let index = 0; index + 2 < source.length; index += 3) {
    const [x, y, w] = [source[index], source[index + 1], source[index + 2]];
    if (!finite(x) || !finite(y) || !finite(w)) continue;
    points.push(clamp(x, -width, width * 2), clamp(y, -height, height * 2), clamp(w, WIDTH_LIMITS.min, widest));
  }
  return points.length >= 3 ? { tool: stroke.tool, color: stroke.color.toLowerCase(), points } : null;
}

/** Sprawdzone pole tekstowe, wzór, kształt, tabela albo karteczka – od 1.22 z identyfikatorem i przyklejonymi końcami. */
function cleanElement(raw, pageWidth, pageHeight) {
  return keepLinks(cleanElementData(raw, pageWidth, pageHeight), raw);
}

/** Sprawdzone pole tekstowe, wzór albo kształt (zapis, kopia zapasowa) albo null. */
function cleanElementData(raw, pageWidth, pageHeight) {
  if (raw.tool === 'shape') return cleanShape(raw, pageWidth, pageHeight, (color) => HEX.test(color ?? ''));
  if (raw.tool === 'table' || raw.tool === 'sticky') return cleanBox(raw, pageWidth, pageHeight);
  if (isSymbol(raw)) return cleanSymbol(raw, pageWidth, pageHeight);
  if (raw.tool === 'diagram') return cleanDiagram(raw, pageWidth, pageHeight);
  if (raw.tool === 'solid') return cleanSolid(raw, pageWidth, pageHeight);
  const content = raw.tool === 'text' ? raw.text : raw.source;
  if (typeof content !== 'string' || content.trim() === '' || !HEX.test(raw.color ?? '')) return null;
  if (![raw.x, raw.y, raw.size, raw.width, raw.height].every(finite)) return null;
  const size = clamp(raw.size, 8, 200);
  const element = {
    tool: raw.tool,
    color: raw.color.toLowerCase(),
    x: clamp(raw.x, -pageWidth, pageWidth * 2),
    y: clamp(raw.y, -pageHeight, pageHeight * 2),
    size,
    [raw.tool === 'text' ? 'text' : 'source']: content.slice(0, ELEMENT_TEXT_MAX),
    width: clamp(raw.width, 1, pageWidth * 3),
    height: clamp(raw.height, 1, pageHeight * 3)
  };
  if (raw.tool === 'text') element.maxWidth = finite(raw.maxWidth) ? clamp(raw.maxWidth, size, pageWidth * 3) : pageWidth;
  return element;
}

/** Sprawdzona tabela albo karteczka (od 1.21) albo null. */
function cleanBox(raw, pageWidth, pageHeight) {
  if (![raw.x, raw.y, raw.width, raw.height, raw.size].every(finite)) return null;
  const common = {
    tool: raw.tool,
    x: clamp(raw.x, -pageWidth, pageWidth * 2),
    y: clamp(raw.y, -pageHeight, pageHeight * 2),
    width: clamp(raw.width, 40, pageWidth * 3),
    height: clamp(raw.height, 20, pageHeight * 3),
    size: clamp(raw.size, 8, 200)
  };
  if (raw.tool === 'table') {
    const table = cleanTable(raw);
    if (!table || !HEX.test(raw.color ?? '')) return null;
    return { ...common, color: raw.color.toLowerCase(), ...table };
  }
  if (typeof raw.text !== 'string') return null;
  const sticky = {
    ...common,
    color: stickyColor(raw.color).id,
    text: raw.text.slice(0, STICKY_TEXT_MAX),
    created: /^\d{4}-\d{2}-\d{2}$/.test(raw.created ?? '') ? raw.created : '2026-01-01'
  };
  if (raw.collapsed === true) sticky.collapsed = true;
  if (raw.hidden === true) sticky.hidden = true;
  if (raw.leader && finite(raw.leader.x) && finite(raw.leader.y)) {
    sticky.leader = { x: clamp(raw.leader.x, -pageWidth, pageWidth * 2), y: clamp(raw.leader.y, -pageHeight, pageHeight * 2) };
  }
  return sticky;
}

/** Bajty zdjęcia jako ArrayBuffer (z ArrayBuffer albo widoku, np. z archiwum ZIP) albo null. */
function photoBytes(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes.byteLength > 0 ? bytes : null;
  if (ArrayBuffer.isView(bytes) && bytes.byteLength > 0) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return null;
}

/** Rysunek bez bajtów zdjęcia i szablonu (do pliku JSON w kopii – zdjęcie i szablon idą osobnymi plikami). */
export function drawingWithoutPhotoBytes(drawing) {
  if (!drawing?.photo && !drawing?.template?.bytes) return drawing;
  const copy = { ...drawing };
  for (const key of ['photo', 'template']) {
    if (!copy[key]) continue;
    copy[key] = { ...copy[key] };
    delete copy[key].bytes;
  }
  return copy;
}

/** Czy rysunek ma coś do pokazania (kreski albo zdjęcie). */
export function hasContent(drawing) {
  return Boolean(drawing && (drawing.strokes.length > 0 || drawing.photo));
}

/** Kolejna wolna sygnatura rysunku: „Rysunek 1”, „Rysunek 2”… (wśród sygnatur obrazów notatki). */
export function nextDrawingLabel(labels) {
  const used = new Set(labels.map((label) => String(label ?? '').trim().toLowerCase()));
  let number = 1;
  while (used.has(`rysunek ${number}`)) number += 1;
  return `Rysunek ${number}`;
}
