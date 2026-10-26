// Układ współrzędnych arkusza (od 1.50) – bez przeglądarki. Początek w lewym dolnym rogu arkusza (ramki A4 / A3
// wpasowanej w stronę, a bez ramki – kartki) albo w punkcie wybranym przez użytkownika (drawing.origin – punkt strony);
// X w prawo, Y w górę (jak w programach CAD i na maszynach pomiarowych), Z – z arkusza do patrzącego.
// Liczby są wymiarami przedmiotu w skali rysunku – w tej samej jednostce co liczby wymiarów (mm w stylu technicznym,
// jednostka skali w stylu „5 cm”), więc współrzędne i wymiary zgadzają się ze sobą.

import { dimFactor, dimFormat, dimMillimeters, dimUnitLabel, toScaleLength } from './drawing.js';
import { frameSheet } from './title-block.js';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** Lewy dolny róg arkusza (strony bez ramki – kartki) w jednostkach strony. */
export function defaultOrigin(drawing) {
  if (drawing.frame && !drawing.photo) {
    const sheet = frameSheet(drawing.frame.format, drawing.width, drawing.height);
    return { x: sheet.x, y: sheet.y + sheet.height };
  }
  return { x: 0, y: drawing.height };
}

/** Początek układu (jednostki strony): wybrany przez użytkownika albo lewy dolny róg arkusza. */
export const sheetOrigin = (drawing) => (drawing.origin && finite(drawing.origin.x) && finite(drawing.origin.y) ? drawing.origin : defaultOrigin(drawing));

/** Ile jednostek liczb (mm przedmiotu w skali rysunku) ma jednostka strony. */
export const coordFactor = (drawing) => toScaleLength(1, drawing.scale) * dimFactor(drawing.scale, dimFormat(drawing));

/** Punkt strony → współrzędne arkusza { x, y } w jednostce liczb wymiarów (Y w górę). */
export function toSheet(drawing, point) {
  const origin = sheetOrigin(drawing);
  const factor = coordFactor(drawing);
  return { x: (point.x - origin.x) * factor, y: (origin.y - point.y) * factor };
}

/** Współrzędne arkusza → punkt strony (odwrotność toSheet). */
export function fromSheet(drawing, coords) {
  const origin = sheetOrigin(drawing);
  const factor = coordFactor(drawing);
  return { x: origin.x + coords.x / factor, y: origin.y - coords.y / factor };
}

/** Jednostka współrzędnych (jak liczb wymiarów): „mm”, „cm”, „in”… */
export const coordUnit = (drawing) => dimUnitLabel(drawing.scale, dimFormat(drawing));

/** Miejsca po przecinku: mm – 1, cm – 2, m i cale – 3 (dokładność ok. 0,1 mm). */
export function coordPlaces(drawing) {
  const millimeters = dimMillimeters(drawing.scale, dimFormat(drawing));
  return Math.min(3, Math.max(1, Math.ceil(Math.log10(millimeters) - 1e-9) + 1));
}

/** Liczba współrzędnej: stała liczba miejsc, przecinek, minus typograficzny, bez „−0”. */
export function formatCoord(value, places = 1) {
  const fixed = value.toFixed(places);
  const zero = Number(fixed) === 0;
  return (zero ? Math.abs(0).toFixed(places) : fixed).replace('-', '−').replace('.', ',');
}

/** Napis „X 103,2 · Y 36,7 mm” dla punktu strony. */
export function coordText(drawing, point) {
  const { x, y } = toSheet(drawing, point);
  const places = coordPlaces(drawing);
  return `X ${formatCoord(x, places)} · Y ${formatCoord(y, places)} ${coordUnit(drawing)}`;
}

/** Gdzie jest początek: opis do panelu „Linijka i skala”. */
export function originText(drawing) {
  if (drawing.origin) {
    const corner = defaultOrigin(drawing);
    const { x, y } = toSheet({ ...drawing, origin: null }, drawing.origin);
    if (Math.abs(drawing.origin.x - corner.x) > 1e-6 || Math.abs(drawing.origin.y - corner.y) > 1e-6) {
      const places = coordPlaces(drawing);
      return `Początek przesunięty: X ${formatCoord(x, places)} · Y ${formatCoord(y, places)} ${coordUnit(drawing)} od lewego dolnego rogu ${drawing.frame && !drawing.photo ? 'arkusza' : 'kartki'}`;
    }
  }
  return drawing.frame && !drawing.photo ? 'Początek w lewym dolnym rogu arkusza' : 'Początek w lewym dolnym rogu kartki';
}
