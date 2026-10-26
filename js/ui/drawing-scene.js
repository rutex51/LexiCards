// Scena 3D w edytorze rysunku (od 1.51): kartka jako płaszczyzna XY z całą treścią 2D, bryły stojące na niej
// (core/scene.js), wspólna kamera. Przeciągnięcie obraca scenę, kółko myszy i dwa palce przybliżają (dwa palce
// także przesuwają), gotowe widoki – przyciski u góry, dotknięcie bryły – zaznaczenie. W ruchu (obracanie, przybliżanie,
// przejście do widoku, przesuwanie bryły) – same krawędzie, bez krycia i cieniowania; po puszczeniu – pełny obraz: kartka
// rysowana wektorowo, bryły z krawędziami niewidocznymi i cieniowaniem, od najdalszej (zasłaniają się nawzajem).
//
// Od 1.52 położenie brył (core/solid-pose.js): panel zaznaczonej bryły – X, Y, Z (wysokość podstawy) i obrót wokół Z
// w układzie arkusza, „Postaw na ścianie” (dotknięcie wierzchu innej bryły), „Na arkusz (Z = 0)”; strzałki osi przy
// zaznaczonej bryle – przeciągnięcie przesuwa ją wzdłuż tej osi (po jednej strzałce na oś, tylko przesuwanie). Zmiany idą
// do rysunku przez onChange i onPlace (krok cofania w edytorze), „Cofnij” w pasku.
//
// Od 1.53 pomiary 3D (core/measure3d.js): „Pomiar” w pasku – dotknięcie dwóch cech brył (narożnik, środek ściany,
// krawędź, ściana, oś walca), także na różnych bryłach; wynik (odległość z ΔX, ΔY, ΔZ albo kąt) zostaje w scenie jako
// wymiar – zapisany w bryle pierwszej cechy, idzie za bryłami. Dotknięcie liczby pomiaru – szczegóły i „Usuń pomiar”.

import { faceAt, quatMatrix, solidGeometry, solidLabel, solidShape } from '../core/solids.js';
import {
  SCENE_VIEWS, SCENE_ZOOM, blendCamera, fitScale, orbit, paintOrder, projectWorld, sceneBounds, sceneCamera, sceneQuat, sceneSolids, sceneView, sceneViewId,
  sheetMatrix, toView, worldOfPage
} from '../core/scene.js';
import { facesUp, liftOff, normalYaw, placement, resolveStacks, solidsById, stackChanges, standsOn, withPose, worldRotation } from '../core/solid-pose.js';
import {
  MEASURE_LIMITS, ROLE_LABELS, angleText, drawingMeasures, featureRef, featureVisible, measureFeatures, measureTitle, solidFeatures, withMeasure, withoutMeasure,
  worldFeature
} from '../core/measure3d.js';
import { newElementId } from '../core/attach.js';
import { coordFactor, coordPlaces, coordUnit, formatCoord, fromSheet, toSheet } from '../core/sheet-coords.js';
import { parseDecimal } from '../core/drawing.js';
import { paintSolid } from './drawing-solids.js';
import { textFont } from './canvas-text.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const ACCENT = '#0058be';
const LINE = '#1d1d1f';
const AXES = [['X', [1, 0, 0], '#d92d20'], ['Y', [0, 1, 0], '#1e8e3e'], ['Z', [0, 0, 1], '#1a6fdb']];
/** Długość osi w początku układu (jednostki strony – dwie i pół kratki). */
const AXIS_LENGTH = 110;
/** Strzałki przesuwania zaznaczonej bryły: długość (px, oś w poprzek patrzenia), najkrótsza widoczna i zasięg dotknięcia (px). */
const ARROW = Object.freeze({ length: 72, shortest: 16, hit: 14, touch: 22 });
/** Przejście do gotowego widoku (ms) i chwila po ostatnim obrocie kółka myszy, po której wraca pełny obraz. */
const BLEND_MS = 380;
const WHEEL_SETTLE = 250;
const TAP = 5;
/** Jak długo widać komunikat w pastylce podpowiedzi (ms). */
const NOTE_MS = 3200;
/** Pomiary 3D (od 1.53): kolor wymiarów, zasięg dotknięcia punktu i krawędzi (px; mysz / palec). */
const MEASURE = Object.freeze({ color: '#c2410c', fill: 'rgba(194, 65, 12, 0.13)', point: [12, 20], line: [8, 14] });
const shortLabel = (solid) => solidLabel(solid).replace('Bryła: ', '');

/**
 * Scena: { element, open({ drawing, origin, selected, paintPage, dimFormat, canUndo }), update({ selected, canUndo }), close(),
 * cancel(), resize(), isOpen() }. paintPage(ctx, skip) – treść kartki w jednostkach strony bez elementów ze zbioru skip (brył);
 * origin – początek układu arkusza (punkt strony); onSelect(bryła | null), onExit() – powrót do 2D; onChange(mapa stara → nowa)
 * – nowe położenie brył; onPlace(bryła, bryła pod spodem, punkt strony, wysokość ściany) – „Postaw na ścianie”; onUndo() –
 * „Cofnij”. Po zmianie edytor zapisuje krok cofania i woła update.
 */
export function createScene({ onSelect, onExit, onChange, onPlace, onUndo }) {
  const canvas = h('canvas', { class: 'drawing__scene-canvas', role: 'img', 'aria-label': 'Scena 3D', dataset: { testid: 'drawing-scene-canvas' } });
  const viewButtons = SCENE_VIEWS.map((item) => h('button', {
    type: 'button', class: 'drawing__scene-chip', 'aria-pressed': 'false', dataset: { testid: `drawing-scene-view-${item.id}`, view: item.id },
    onClick: () => goTo(item)
  }, item.label));
  const exitButton = h('button', {
    type: 'button', class: 'drawing__scene-chip drawing__scene-chip--exit', title: 'Wróć do kartki 2D (Esc)', dataset: { testid: 'drawing-scene-exit' },
    onClick: () => onExit()
  }, '2D');
  const undoButton = h('button', {
    type: 'button', class: 'drawing__scene-chip', title: 'Cofnij ostatnią zmianę', 'aria-label': 'Cofnij', disabled: true, dataset: { testid: 'drawing-scene-undo' },
    onClick: () => onUndo()
  }, icon('undo', { size: 16 }));
  const fitButton = h('button', {
    type: 'button', class: 'drawing__scene-chip', title: 'Cała scena – bez przybliżenia i przesunięcia', dataset: { testid: 'drawing-scene-fit' },
    onClick: () => {
      state.zoom = 1;
      state.pan = { x: 0, y: 0 };
      state.bounds = sceneBounds(state.drawing, state.solids);
      state.base = fit(state.camera);
      render();
    }
  }, icon('zoomFit', { size: 16 }), 'Cała');
  const measureButton = h('button', {
    type: 'button', class: 'drawing__scene-chip', 'aria-pressed': 'false', title: 'Pomiar 3D – odległość albo kąt między cechami brył',
    dataset: { testid: 'drawing-scene-measure-toggle' },
    onClick: () => (state.measuring ? stopMeasuring() : startMeasuring())
  }, icon('caliper', { size: 16 }), 'Pomiar');
  const bar = h('div', { class: 'drawing__scene-bar', role: 'toolbar', 'aria-label': 'Scena 3D – widoki' },
    exitButton, undoButton, measureButton, h('span', { class: 'drawing__scene-sep' }), ...viewButtons, h('span', { class: 'drawing__scene-sep' }), fitButton);
  const picked = h('span', { class: 'drawing__pill drawing__pill--info', hidden: true, dataset: { testid: 'drawing-scene-selected' } });
  const hint = h('span', { class: 'drawing__pill drawing__pill--info drawing__scene-hint', dataset: { testid: 'drawing-scene-hint' } });

  // Panel położenia zaznaczonej bryły (od 1.52): liczby w układzie arkusza, zmiana po Enter albo po wyjściu z pola.
  const poseInput = (key, label) => h('input', {
    class: 'input drawing__scene-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': label, dataset: { testid: `drawing-scene-pose-${key}` },
    onChange: () => applyFields(),
    onKeydown: (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      applyFields();
    }
  });
  const fields = { x: poseInput('x', 'X'), y: poseInput('y', 'Y'), z: poseInput('z', 'Z – wysokość podstawy'), yaw: poseInput('yaw', 'Obrót wokół Z (stopnie)') };
  const field = (key, letter, mod, suffix = null) => h('label', { class: 'drawing__scene-field' },
    h('span', { class: `drawing__coord-axis drawing__coord-axis--${mod}`, 'aria-hidden': 'true' }, letter), fields[key], ...(suffix ? [h('span', { class: 'drawing__scene-suffix' }, suffix)] : []));
  const poseName = h('strong', { class: 'drawing__scene-card-name', dataset: { testid: 'drawing-scene-pose-name' } });
  const poseOn = h('span', { class: 'drawing__scene-card-on', dataset: { testid: 'drawing-scene-pose-on' } });
  const poseUnit = h('span', { class: 'drawing__scene-card-unit', dataset: { testid: 'drawing-scene-pose-unit' } });
  const placeButton = h('button', {
    type: 'button', class: 'drawing__scene-action', 'aria-pressed': 'false', dataset: { testid: 'drawing-scene-place' },
    onClick: () => (state.placing ? stopPlacing() : startPlacing())
  }, 'Postaw na ścianie…');
  const floorButton = h('button', {
    type: 'button', class: 'drawing__scene-action', dataset: { testid: 'drawing-scene-floor' },
    onClick: () => {
      if (!state.selected) return;
      stopPlacing(false);
      change(new Map([[state.selected, liftOff(state.drawing.strokes, state.selected)]]));
    }
  }, 'Na arkusz (Z = 0)');
  const card = h('div', { class: 'drawing__scene-card', hidden: true, dataset: { testid: 'drawing-scene-pose' } },
    h('div', { class: 'drawing__scene-card-head' }, poseName, poseOn, poseUnit),
    h('div', { class: 'drawing__scene-fields' }, field('x', 'X', 'x'), field('y', 'Y', 'y'), field('z', 'Z', 'z'), field('yaw', '↻', 'turn', '°')),
    h('div', { class: 'drawing__scene-actions' }, placeButton, floorButton));
  // Panel pomiaru (od 1.53): co dotknąć, wynik, „Od nowa”, „Usuń pomiar”, „Zakończ pomiar”.
  const measureTitleText = h('strong', { class: 'drawing__scene-card-name', dataset: { testid: 'drawing-scene-measure-title' } }, 'Pomiar 3D');
  const measureUnit = h('span', { class: 'drawing__scene-card-unit' });
  const measureText = h('p', { class: 'drawing__scene-measure-text', dataset: { testid: 'drawing-scene-measure-text' } });
  const measureValue = h('p', { class: 'drawing__scene-measure-value', hidden: true, dataset: { testid: 'drawing-scene-measure-value' } });
  const measureDetail = h('p', { class: 'drawing__scene-measure-text', hidden: true, dataset: { testid: 'drawing-scene-measure-detail' } });
  const restartButton = h('button', {
    type: 'button', class: 'drawing__scene-action', hidden: true, dataset: { testid: 'drawing-scene-measure-restart' },
    onClick: () => {
      state.first = null;
      fillCard();
      render();
    }
  }, 'Od nowa');
  const deleteButton = h('button', {
    type: 'button', class: 'drawing__scene-action drawing__scene-action--danger', hidden: true, dataset: { testid: 'drawing-scene-measure-delete' },
    onClick: () => deleteMeasure()
  }, 'Usuń pomiar');
  const doneButton = h('button', {
    type: 'button', class: 'drawing__scene-action', dataset: { testid: 'drawing-scene-measure-done' },
    onClick: () => stopMeasuring()
  }, 'Zakończ pomiar');
  const measureCard = h('div', { class: 'drawing__scene-card', hidden: true, dataset: { testid: 'drawing-scene-measure' } },
    h('div', { class: 'drawing__scene-card-head' }, measureTitleText, measureUnit), measureText, measureValue, measureDetail,
    h('div', { class: 'drawing__scene-actions' }, restartButton, deleteButton, doneButton));
  const element = h('div', { class: 'drawing__scene', hidden: true, dataset: { testid: 'drawing-scene' } },
    canvas, bar, h('div', { class: 'drawing__scene-dock' }, h('div', { class: 'drawing__scene-info' }, picked, hint), card, measureCard));

  const state = {
    open: false, drawing: null, origin: null, paintPage: null, dimFormat: 'unit', selected: null, canUndo: false,
    camera: sceneCamera(45, 35.264), base: 1, zoom: 1, pan: { x: 0, y: 0 }, moving: false,
    solids: [], bounds: null, painted: [], blend: 0, wheelTimer: 0, sheetImage: null,
    arrows: [], placing: false, note: '', noteTimer: 0, preview: null,
    measuring: false, first: null, hover: null, chosen: null, labels: []
  };
  const pointers = new Map();
  let gesture = null;

  function open({ drawing, origin, selected = null, paintPage, dimFormat, canUndo = false }) {
    Object.assign(state, {
      open: true, drawing, origin, paintPage, dimFormat, selected, canUndo, camera: sceneCamera(45, 35.264), zoom: 1, pan: { x: 0, y: 0 }, moving: false,
      sheetImage: null, placing: false, note: '', preview: null, measuring: false, first: null, hover: null, chosen: null
    });
    state.solids = sceneSolids(drawing);
    state.bounds = sceneBounds(drawing, state.solids);
    element.hidden = false;
    state.base = fit(state.camera);
    fillCard();
    render();
  }
  /** Po zmianie rysunku (położenie, cofnięcie): bryły od nowa, kamera i skala bez zmian (obraz nie skacze). */
  function update({ selected = null, canUndo = false } = {}) {
    if (!state.open) return;
    state.selected = selected && state.drawing.strokes.includes(selected) ? selected : null;
    state.canUndo = canUndo;
    state.preview = null;
    state.placing = false;
    state.solids = sceneSolids(state.drawing);
    // Pomiar wskazany przed zmianą – jeśli dalej jest w tej samej bryle; pierwsza cecha – jeśli bryła się nie zmieniła.
    if (state.chosen && !chosenMeasure()) state.chosen = null;
    if (state.first && !state.drawing.strokes.includes(state.first.item.solid)) state.first = null;
    state.hover = null;
    fillCard();
    render();
  }
  function close() {
    state.open = false;
    state.sheetImage = null;
    state.placing = false;
    state.preview = null;
    Object.assign(state, { measuring: false, first: null, hover: null, chosen: null });
    window.cancelAnimationFrame(state.blend);
    clearTimeout(state.wheelTimer);
    clearTimeout(state.noteTimer);
    pointers.clear();
    gesture = null;
    element.hidden = true;
  }
  /** Esc: przerywa przesuwanie strzałką albo „Postaw na ścianie”; zwraca, czy było co przerwać. */
  function cancel() {
    if (gesture?.kind === 'move') {
      gesture = null;
      pointers.clear();
      state.moving = false;
      dropPreview();
      return true;
    }
    if (state.placing) {
      stopPlacing();
      return true;
    }
    // Pomiar (od 1.53): najpierw pierwsza cecha, potem wskazany pomiar, potem tryb pomiaru.
    if (state.first) {
      state.first = null;
      fillCard();
      render();
      return true;
    }
    if (state.chosen) {
      state.chosen = null;
      fillCard();
      render();
      return true;
    }
    if (state.measuring) {
      stopMeasuring();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- położenie zaznaczonej bryły (od 1.52)

  const factor = () => coordFactor(state.drawing);
  const places = () => coordPlaces(state.drawing);
  /** Zaznaczona bryła i jej położenie (w trakcie przesuwania – z podglądu). */
  function selectedPlace() {
    const index = state.drawing.strokes.indexOf(state.selected);
    if (index < 0) return null;
    const strokes = state.preview ?? state.drawing.strokes;
    return { solid: strokes[index], place: placement(solidsById(strokes), strokes[index]) };
  }
  function fillCard() {
    fillMeasureCard();
    const current = state.selected && !state.measuring && !state.chosen ? selectedPlace() : null;
    card.hidden = !current;
    if (!current) return;
    const { solid, place } = current;
    const sheet = toSheet(state.drawing, place);
    const digits = places();
    poseName.textContent = shortLabel(solid);
    const below = place.root === solid ? null : solidsById(state.drawing.strokes).get(solid.on.id);
    poseOn.textContent = below ? `stoi na: ${shortLabel(below)}` : '';
    poseOn.hidden = !below;
    poseUnit.textContent = `${coordUnit(state.drawing)}, skala rysunku`;
    const values = { x: formatCoord(sheet.x, digits), y: formatCoord(sheet.y, digits), z: formatCoord(place.z * factor(), digits), yaw: formatCoord(place.yaw, 1) };
    for (const [key, input] of Object.entries(fields)) input.value = values[key];
    floorButton.disabled = !below && place.z === 0;
    placeButton.textContent = state.placing ? 'Anuluj – bez zmian' : 'Postaw na ścianie…';
    placeButton.setAttribute('aria-pressed', String(state.placing));
  }
  /** Wpisane liczby → położenie zaznaczonej bryły (bez zmiany – nic). */
  function applyFields() {
    if (!state.selected || !state.open) return;
    const read = (input) => (input.value.trim() === '' ? 0 : parseDecimal(input.value));
    const [x, y, z, yaw] = ['x', 'y', 'z', 'yaw'].map((key) => read(fields[key]));
    if ([x, y, z, yaw].some((value) => value === null)) {
      fillCard();
      note('Wpisz liczby, np. 25 albo −12,5.');
      return;
    }
    if (z < 0) {
      fillCard();
      note('Wysokość podstawy – 0 albo więcej (bryła nie wchodzi pod arkusz).');
      return;
    }
    const current = placement(solidsById(state.drawing.strokes), state.selected);
    const sheet = toSheet(state.drawing, current);
    const step = 10 ** -places();
    const turn = normalYaw(yaw);
    if (Math.abs(sheet.x - x) < step && Math.abs(sheet.y - y) < step && Math.abs(current.z * factor() - z) < step && Math.abs(normalYaw(current.yaw - turn)) < 0.05) return;
    const point = fromSheet(state.drawing, { x, y });
    change(new Map([[state.selected, withPose(state.drawing.strokes, state.selected, { x: point.x, y: point.y, z: z / factor(), yaw: turn })]]));
  }
  function change(map) {
    state.preview = null;
    onChange(map);
  }
  function dropPreview() {
    state.preview = null;
    state.solids = sceneSolids(state.drawing);
    fillCard();
    render();
  }
  function note(text) {
    state.note = text;
    clearTimeout(state.noteTimer);
    state.noteTimer = setTimeout(() => {
      state.note = '';
      if (state.open) render();
    }, NOTE_MS);
    render();
  }
  function startPlacing() {
    if (!state.selected) return;
    state.placing = true;
    fillCard();
    render();
  }
  function stopPlacing(redraw = true) {
    if (!state.placing) return;
    state.placing = false;
    fillCard();
    if (redraw) render();
  }
  /** „Postaw na ścianie”: wierzch innej bryły pod punktem ekranu → zaznaczona bryła stoi na nim w tym miejscu. */
  function placeAt(point) {
    const view = layout();
    const at = { x: (point.x - view.ox) / view.scale, y: (point.y - view.oy) / view.scale };
    const byId = solidsById(state.drawing.strokes);
    for (const { item, shown } of [...state.painted].reverse()) {
      // Zaznaczona bryła i te, które na niej stoją, nie zasłaniają ściany pod spodem.
      if (item.solid === state.selected || standsOn(byId, item.solid, state.selected)) continue;
      const face = faceAt(shown, at);
      if (!face) continue;
      if (!facesUp(face.normal, item.yaw)) {
        note('To nie jest wierzch – dotknij poziomej ściany od góry.');
        return;
      }
      // Punkt ściany: promień od patrzącego przez punkt ekranu przecięty z płaszczyzną ściany (Z – wysokość ściany).
      const z = item.origin[2] + face.vertex[1];
      const { xv, yv, zv } = state.camera;
      const [vx, vy] = [at.x, -at.y];
      if (Math.abs(zv[2]) < 1e-6) return;
      const t = (z - vx * xv[2] - vy * yv[2]) / zv[2];
      const world = [0, 1].map((axis) => vx * xv[axis] + vy * yv[axis] + t * zv[axis]);
      state.placing = false;
      onPlace(state.selected, item.solid, { x: world[0], y: state.drawing.height - world[1] }, z);
      return;
    }
    note('Dotknij wierzchu innej bryły – tam stanie zaznaczona.');
  }

  // ---------------------------------------------------------------- pomiary 3D (od 1.53)

  const itemOf = (solid) => state.solids.find((item) => item.solid === solid) ?? null;
  const toWorld = (item, point) => {
    const m = worldRotation(item.yaw ?? 0);
    return [0, 1, 2].map((axis) => item.origin[axis] + m[axis * 3] * point[0] + m[axis * 3 + 1] * point[1] + m[axis * 3 + 2] * point[2]);
  };
  const lengthText = (value) => `${formatCoord(value * factor(), places())} ${coordUnit(state.drawing)}`;
  /** Liczba pomiaru: odległość (równoległe – ze znakiem ∥) albo kąt. */
  const valueText = (result) => (result.kind === 'angle' ? angleText(result.value) : `${result.parallel ? '∥ ' : ''}${lengthText(result.value)}`);
  const describe = (role, solid) => `${ROLE_LABELS[role]} (${shortLabel(solid)})`;
  /** Pomiary w scenie: cechy w świecie i wynik; bryły z podglądu w trakcie przesuwania strzałką. */
  function sceneMeasures() {
    const strokes = state.preview ?? state.drawing.strokes;
    return drawingMeasures(strokes).map((entry) => {
      const [first, second] = [itemOf(entry.a.solid), itemOf(entry.b.solid)];
      if (!first || !second) return null;
      const a = worldFeature(first, entry.a.feature);
      const b = worldFeature(second, entry.b.feature);
      return { ...entry, index: strokes.indexOf(entry.owner), worldA: a, worldB: b, result: measureFeatures(a, b) };
    }).filter(Boolean);
  }
  function chosenMeasure() {
    if (!state.chosen) return null;
    return sceneMeasures().find((entry) => entry.index === state.chosen.index && entry.at === state.chosen.at) ?? null;
  }
  function startMeasuring() {
    stopPlacing(false);
    Object.assign(state, { measuring: true, first: null, hover: null, chosen: null });
    fillCard();
    render();
  }
  function stopMeasuring() {
    Object.assign(state, { measuring: false, first: null, hover: null, chosen: null });
    fillCard();
    render();
  }
  function fillMeasureCard() {
    const chosen = chosenMeasure();
    measureCard.hidden = !state.measuring && !chosen;
    measureButton.setAttribute('aria-pressed', String(state.measuring));
    canvas.classList.toggle('drawing__scene-canvas--measure', state.measuring);
    if (measureCard.hidden) return;
    restartButton.hidden = !state.first;
    deleteButton.hidden = !chosen || Boolean(state.first);
    doneButton.hidden = !state.measuring;
    measureUnit.textContent = `${coordUnit(state.drawing)}, skala rysunku`;
    measureValue.hidden = true;
    measureDetail.hidden = true;
    measureTitleText.textContent = 'Pomiar 3D';
    if (state.first) {
      measureText.textContent = `1: ${describe(state.first.feature.role, state.first.item.solid)}. Dotknij drugiej cechy – może być na innej bryle.`;
      return;
    }
    if (!chosen) {
      measureText.textContent = 'Dotknij cechy bryły: narożnika, środka ściany, krawędzi, płaskiej ściany albo powierzchni walca (oś).';
      return;
    }
    const { result } = chosen;
    measureTitleText.textContent = measureTitle(result);
    measureText.textContent = `${describe(chosen.a.ref.role, chosen.a.solid)} → ${describe(chosen.b.ref.role, chosen.b.solid)}`;
    measureValue.hidden = false;
    measureValue.textContent = valueText(result);
    const k = factor();
    const digits = places();
    const detail = result.delta
      ? `ΔX ${formatCoord(result.delta[0] * k, digits)} · ΔY ${formatCoord(result.delta[1] * k, digits)} · ΔZ ${formatCoord(result.delta[2] * k, digits)} ${coordUnit(state.drawing)}`
      : result.distance !== undefined ? `Najmniejsza odległość prostych: ${lengthText(result.distance)}` : '';
    measureDetail.hidden = !detail;
    measureDetail.textContent = detail;
  }
  function deleteMeasure() {
    const chosen = chosenMeasure();
    if (!chosen) return;
    state.chosen = null;
    change(new Map([[chosen.owner, withoutMeasure(chosen.owner, chosen.at)]]));
  }
  /** Ściana siatki pod punktem ekranu najbliższa patrzącemu: { item, index } albo { item, sphere: true } albo null. */
  function facetAt(point, view) {
    const at = { x: (point.x - view.ox) / view.scale, y: (view.oy - point.y) / view.scale };
    let best = null;
    for (const item of state.solids) {
      const [ox, oy, oz] = toView(state.camera, item.origin);
      const [x, y] = [at.x - ox, at.y - oy];
      if (item.solid.kind === 'sphere') {
        const r = item.solid.dims.d / 2;
        const inside = r * r - x * x - y * y;
        if (inside >= 0 && (!best || oz + Math.sqrt(inside) > best.depth)) best = { item, sphere: true, depth: oz + Math.sqrt(inside) };
        continue;
      }
      const mesh = solidShape(item.solid);
      const m = quatMatrix(sceneQuat(state.camera, item.yaw));
      const rotate = (v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
      const V = mesh.V.map(rotate);
      mesh.F.forEach((loops, index) => {
        const N = rotate(mesh.N[index]);
        if (N[2] <= 1e-5) return;
        let inside = false;
        for (const loop of loops) {
          for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
            const [a, b] = [V[loop[i]], V[loop[j]]];
            if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
          }
        }
        if (!inside) return;
        const p0 = V[loops[0][0]];
        const depth = oz + (N[0] * p0[0] + N[1] * p0[1] + N[2] * p0[2] - N[0] * x - N[1] * y) / N[2];
        if (!best || depth > best.depth) best = { item, index, depth };
      });
    }
    return best;
  }
  /**
   * Cecha pod punktem ekranu: najpierw punkty (narożnik, środek ściany, wierzchołek, środek kuli) widoczne od strony
   * patrzącego, potem krawędzie proste, na końcu ściana najbliższa patrzącemu (płaska – ściana, zakrzywiona – oś bryły).
   * Wynik: { item, feature, world } albo { item, none: true } (powierzchnia bez cechy) albo null.
   */
  function featureAt(point, touch) {
    const view = layout();
    const { camera } = state;
    const near = MEASURE.point[touch ? 1 : 0];
    const reach = MEASURE.line[touch ? 1 : 0];
    let best = null;
    for (const item of state.solids) {
      for (const feature of solidFeatures(item.solid).points) {
        if (!featureVisible(item.solid, feature, item.yaw, camera.zv)) continue;
        const world = worldFeature(item, feature);
        const screen = projectWorld(camera, view, world.p);
        const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
        if (distance > near) continue;
        if (!best || distance < best.distance - 2 || (distance <= best.distance + 2 && screen.depth > best.depth)) best = { item, feature, world, distance, depth: screen.depth };
      }
    }
    if (best) return best;
    for (const item of state.solids) {
      for (const feature of solidFeatures(item.solid).edges) {
        if (!featureVisible(item.solid, feature, item.yaw, camera.zv)) continue;
        for (const [start, end] of feature.segments) {
          const [a, b] = [projectWorld(camera, view, toWorld(item, start)), projectWorld(camera, view, toWorld(item, end))];
          const [dx, dy] = [b.x - a.x, b.y - a.y];
          const t = dx * dx + dy * dy > 1e-9 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
          const distance = Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
          const depth = a.depth + (b.depth - a.depth) * t;
          if (distance <= reach && (!best || distance < best.distance - 1 || (distance <= best.distance + 1 && depth > best.depth))) {
            best = { item, feature, world: worldFeature(item, feature), distance, depth };
          }
        }
      }
    }
    if (best) return best;
    const facet = facetAt(point, view);
    if (!facet) return null;
    const features = solidFeatures(facet.item.solid);
    if (facet.sphere) return { item: facet.item, feature: features.points[0], world: worldFeature(facet.item, features.points[0]) };
    const target = features.facets[facet.index];
    if (!target) return { item: facet.item, none: true };
    const feature = target.kind === 'face' ? features.faces[target.index] : features.axis;
    return { item: facet.item, feature, world: worldFeature(facet.item, feature) };
  }
  /** Dotknięcie w trybie pomiaru: pierwsza cecha, potem druga – pomiar zapisany w bryle pierwszej. */
  function measureTap(point, touch) {
    const found = featureAt(point, touch);
    if (!found) {
      note('Tu nie ma bryły – dotknij narożnika, krawędzi albo ściany.');
      return;
    }
    if (found.none) {
      note('Na tej powierzchni nie ma cechy do pomiaru – dotknij krawędzi, narożnika albo płaskiej ściany.');
      return;
    }
    if (!state.first) {
      state.first = found;
      state.chosen = null;
      fillCard();
      render();
      return;
    }
    const { first } = state;
    if (first.item.solid === found.item.solid && first.feature === found.feature) {
      note('To ta sama cecha – dotknij innej.');
      return;
    }
    const strokes = state.drawing.strokes;
    const taken = [...strokes];
    const withId = (solid) => {
      if (solid.id) return solid;
      const next = { ...solid, id: newElementId(taken) };
      taken.push(next);
      return next;
    };
    const owner = withId(first.item.solid);
    const other = found.item.solid === first.item.solid ? owner : withId(found.item.solid);
    const next = withMeasure(owner, featureRef(owner, first.feature), featureRef(other, found.feature));
    if (!next) {
      note(`W jednej bryle najwyżej ${MEASURE_LIMITS.count} pomiarów – usuń któryś.`);
      return;
    }
    const map = new Map([[first.item.solid, next]]);
    if (other !== owner && other !== found.item.solid) map.set(found.item.solid, other);
    state.first = null;
    state.hover = null;
    state.chosen = { index: strokes.indexOf(first.item.solid), at: next.measures.length - 1 };
    change(map);
  }
  /** Liczba pomiaru pod punktem ekranu (do wskazania pomiaru) albo null. */
  function labelAt(point, touch) {
    const pad = touch ? 8 : 3;
    return [...state.labels].reverse().find((label) => point.x >= label.x - pad && point.x <= label.x + label.w + pad && point.y >= label.y - pad && point.y <= label.y + label.h + pad) ?? null;
  }
  /** Cecha w scenie: punkt – kropka, prosta – gruby odcinek, płaszczyzna – zabarwiony obrys (px płótna, bez dpr). */
  function paintFeature(ctx, view, world, color, fill) {
    const screen = (p) => projectWorld(state.camera, view, p);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (world.kind === 'point') {
      const p = screen(world.p);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      return;
    }
    if (world.kind === 'line') {
      const [a, b] = [screen(world.a), screen(world.b)];
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.beginPath();
    for (const loop of world.loops) {
      loop.forEach((point, index) => {
        const p = screen(point);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  /** Pomiary (wymiary w scenie), pierwsza cecha i cecha pod myszą; liczby pomiarów – miejsca do dotknięcia. */
  function paintMeasures(ctx, view) {
    const list = sceneMeasures();
    state.labels = [];
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const entry of list) {
      const active = state.chosen?.index === entry.index && state.chosen?.at === entry.at;
      for (const world of [entry.worldA, entry.worldB]) paintFeature(ctx, view, world, MEASURE.color, active ? 'rgba(194, 65, 12, 0.22)' : MEASURE.fill);
      const { result } = entry;
      const [from, to] = [projectWorld(state.camera, view, result.from), projectWorld(state.camera, view, result.to)];
      ctx.strokeStyle = MEASURE.color;
      ctx.lineWidth = active ? 2.6 : 1.8;
      ctx.setLineDash(result.kind === 'angle' ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Liczba w białej ramce przy środku odcinka.
      const text = valueText(result);
      ctx.font = textFont(12.5, '700');
      const w = ctx.measureText(text).width + 14;
      const h = 22;
      const x = (from.x + to.x) / 2 - w / 2;
      let y = (from.y + to.y) / 2 - h - 6;
      // Liczby nie zasłaniają się nawzajem – następna wyżej.
      const overlaps = () => state.labels.some((label) => x < label.x + label.w + 2 && x + w + 2 > label.x && y < label.y + label.h + 2 && y + h + 2 > label.y);
      for (let attempt = 0; attempt < 6 && overlaps(); attempt += 1) y -= h + 4;
      ctx.fillStyle = active ? MEASURE.color : '#ffffff';
      ctx.strokeStyle = MEASURE.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 11);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? '#ffffff' : MEASURE.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
      state.labels.push({ index: entry.index, at: entry.at, x, y, w, h });
    }
    if (state.hover && state.hover.feature !== state.first?.feature) paintFeature(ctx, view, worldFeature(itemOf(state.hover.item.solid) ?? state.hover.item, state.hover.feature), 'rgba(0, 88, 190, 0.55)', 'rgba(0, 88, 190, 0.1)');
    if (state.first) paintFeature(ctx, view, worldFeature(itemOf(state.first.item.solid) ?? state.first.item, state.first.feature), ACCENT, 'rgba(0, 88, 190, 0.18)');
    ctx.restore();
    return list;
  }

  // ---------------------------------------------------------------- rysowanie

  /** Miejsce na scenę: płótno bez paska widoków u góry. */
  function room() {
    const box = canvas.getBoundingClientRect();
    const top = Math.min(box.height * 0.3, bar.offsetTop + bar.offsetHeight + 8);
    return { width: box.width, height: box.height, top };
  }
  /** Skala „cała scena” dla kamery. */
  const fit = (camera) => fitScale(camera, state.bounds, room());
  function layout() {
    const box = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(box.width * dpr));
    const height = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    // Pasek widoków u góry zajmuje miejsce – scena pod nim.
    const { top } = room();
    const view = sceneView(state.camera, state.bounds, { width: box.width, height: box.height, top, base: state.base, zoom: state.zoom, pan: state.pan });
    return { ...view, dpr, width: box.width, height: box.height };
  }
  /** Bryły rysunku – na kartce ich nie ma (stoją w scenie). */
  const solidSet = () => new Set(state.drawing.strokes.filter((stroke) => stroke.tool === 'solid'));
  /** Obraz treści kartki (do rysowania w ruchu – raz, potem tylko przekształcany). */
  function sheetImage() {
    if (state.sheetImage) return state.sheetImage;
    const { drawing } = state;
    const k = Math.min(2, 2400 / Math.max(drawing.width, drawing.height));
    const image = document.createElement('canvas');
    image.width = Math.max(1, Math.round(drawing.width * k));
    image.height = Math.max(1, Math.round(drawing.height * k));
    const ctx = image.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    state.paintPage(ctx, solidSet());
    state.sheetImage = { image, k };
    return state.sheetImage;
  }
  function paintSheet(ctx, view) {
    const { drawing, camera } = state;
    const [a, b, c, d, e, f] = sheetMatrix(camera, view, drawing);
    const { dpr } = view;
    // Cień pod kartką i jej brzeg (kartka widziana bokiem – sama linia).
    const corners = [[0, 0], [drawing.width, 0], [drawing.width, drawing.height], [0, drawing.height]]
      .map(([x, y]) => projectWorld(camera, view, worldOfPage(drawing, { x, y })));
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    corners.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(60, 60, 67, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    if (Math.abs(a * d - b * c) < 1e-6) return;
    ctx.save();
    if (state.moving) {
      const { image, k } = sheetImage();
      ctx.setTransform(dpr * a / k, dpr * b / k, dpr * c / k, dpr * d / k, dpr * e, dpr * f);
      ctx.drawImage(image, 0, 0);
    } else {
      // Pełny obraz – treść kartki rysowana wektorowo w przekształceniu kartki (ostra przy każdym przybliżeniu).
      ctx.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * e, dpr * f);
      ctx.beginPath();
      ctx.rect(0, 0, drawing.width, drawing.height);
      ctx.clip();
      state.paintPage(ctx, solidSet());
    }
    ctx.restore();
  }
  const isChosen = (item) => Boolean(state.selected) && item.index === state.drawing.strokes.indexOf(state.selected);
  /** Bryła do rysowania rozkładem 2D: położenie w scenie (kamera i obrót wokół Z), środek – rzut początku układu bryły (jednostki widoku). */
  function viewSolid(item) {
    const [vx, vy] = toView(state.camera, item.origin);
    return { ...item.solid, q: sceneQuat(state.camera, item.yaw), x: vx, y: -vy, showDims: false, shade: true, color: isChosen(item) ? ACCENT : item.solid.color };
  }
  /** W ruchu: krawędzie ostre i obrys ścian gładkich, wszystkie (także z tyłu) – bez sortowania i zasłaniania. */
  function paintWire(ctx, item, view) {
    const shown = viewSolid(item);
    const chosen = isChosen(item);
    ctx.save();
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.ox, view.dpr * view.oy);
    ctx.strokeStyle = chosen ? ACCENT : LINE;
    ctx.lineWidth = (chosen ? 1.8 : 1.2) / view.scale;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (item.solid.kind === 'sphere') {
      ctx.arc(shown.x, shown.y, item.solid.dims.d / 2, 0, Math.PI * 2);
    } else {
      const mesh = solidShape(item.solid);
      const m = quatMatrix(shown.q);
      const rotate = (v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
      const P = mesh.V.map((vertex) => {
        const v = rotate(vertex);
        return [shown.x + v[0], shown.y - v[1]];
      });
      const facing = mesh.N.map((normal) => rotate(normal)[2] > 1e-5);
      for (const edge of mesh.E) {
        const [f1, f2 = f1] = edge.faces.map((face) => facing[face]);
        if (!edge.sharp && f1 === f2) continue;
        ctx.moveTo(...P[edge.a]);
        ctx.lineTo(...P[edge.b]);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
  /** Strzałka z grotem i literą osi (px płótna, bez dpr; grubość linii – z ctx). */
  function arrow(ctx, from, to, color, label) {
    const [dx, dy] = [to.x - from.x, to.y - from.y];
    const length = Math.hypot(dx, dy);
    const [ux, uy] = [dx / length, dy / length];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x - ux * 8, to.y - uy * 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - ux * 11 - uy * 4.5, to.y - uy * 11 + ux * 4.5);
    ctx.lineTo(to.x - ux * 11 + uy * 4.5, to.y - uy * 11 - ux * 4.5);
    ctx.closePath();
    ctx.fill();
    halo(ctx, label, to.x + ux * 11, to.y + uy * 11, color);
  }
  function paintAxes(ctx, view) {
    const { camera, drawing } = state;
    const origin = worldOfPage(drawing, state.origin);
    const start = projectWorld(camera, view, origin);
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.font = textFont(13, '700');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.5;
    const tips = {};
    for (const [label, direction, color] of AXES) {
      const tip = projectWorld(camera, view, origin.map((value, axis) => value + direction[axis] * AXIS_LENGTH));
      if (Math.hypot(tip.x - start.x, tip.y - start.y) < 6) {
        // Oś na patrzącego – kółko z kropką.
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(start.x, start.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(start.x, start.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        tips[label] = start;
        halo(ctx, label, start.x - 15, start.y, color);
        continue;
      }
      arrow(ctx, start, tip, color, label);
      tips[label] = tip;
    }
    ctx.restore();
    return { start, tips };
  }
  /**
   * Strzałki przesuwania zaznaczonej bryły (od 1.52): X i Y od środka podstawy, Z od środka wierzchu, po jednej na oś, w kolorze
   * osi; długość jak odcinek ARROW.length px w poprzek patrzenia (oś skrócona w rzucie – krótsza; prawie na patrzącego – bez
   * strzałki). Wynik: [{ axis, label, color, a, b, per – px ekranu na jednostkę strony wzdłuż osi }].
   */
  function moveArrows(view) {
    const item = state.solids.find(isChosen);
    // Strzałki – razem z panelem położenia (bez wyboru ściany i bez pomiaru).
    if (!item || state.placing || state.measuring || state.chosen) return [];
    const { camera } = state;
    const foot = [item.origin[0], item.origin[1], item.base];
    const list = [];
    AXES.forEach(([label, direction, color], axis) => {
      const from = axis === 2 ? [foot[0], foot[1], item.base + item.height] : foot;
      const a = projectWorld(camera, view, from);
      const unit = projectWorld(camera, view, from.map((value, index) => value + direction[index]));
      const per = [unit.x - a.x, unit.y - a.y];
      const k = ARROW.length / view.scale;
      if (Math.hypot(...per) * k < ARROW.shortest) return;
      list.push({ axis, label, color, a, b: { x: a.x + per[0] * k, y: a.y + per[1] * k }, per });
    });
    return list;
  }
  function paintArrows(ctx, view, arrows) {
    ctx.save();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.font = textFont(13, '700');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of arrows) {
      const active = gesture?.kind === 'move' && gesture.axis === item.axis;
      // Biała obwódka – strzałka widoczna także na ciemnej bryle.
      ctx.lineWidth = active ? 8 : 7;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.moveTo(item.a.x, item.a.y);
      ctx.lineTo(item.b.x, item.b.y);
      ctx.stroke();
      ctx.lineWidth = active ? 4.5 : 3.5;
      arrow(ctx, item.a, item.b, item.color, item.label);
      ctx.beginPath();
      ctx.arc(item.a.x, item.a.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function halo(ctx, text, x, y, color) {
    const width = ctx.lineWidth;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.lineWidth = width;
  }
  function render() {
    if (!state.open) return;
    const view = layout();
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintSheet(ctx, view);
    const order = paintOrder(state.camera, state.solids);
    state.painted = [];
    for (const item of order) {
      if (state.moving) {
        paintWire(ctx, item, view);
        continue;
      }
      const shown = viewSolid(item);
      ctx.save();
      ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.ox, view.dpr * view.oy);
      paintSolid(ctx, shown, { scale: state.drawing.scale, dimFormat: state.dimFormat });
      ctx.restore();
      state.painted.push({ item, shown });
    }
    const axes = paintAxes(ctx, view);
    const measures = paintMeasures(ctx, view);
    state.arrows = moveArrows(view);
    paintArrows(ctx, view, state.arrows);
    // Dla testów: widok, ruch, środki brył (px płótna, w kolejności rysunku), zaznaczona bryła, osie w początku, strzałki.
    const id = sceneViewId(state.camera);
    canvas.dataset.view = id ?? '';
    canvas.dataset.moving = String(state.moving);
    canvas.dataset.centers = state.solids.map((item) => {
      const point = projectWorld(state.camera, view, item.center);
      return `${item.index}:${Math.round(point.x)},${Math.round(point.y)}`;
    }).join(';');
    canvas.dataset.selected = state.selected ? String(state.drawing.strokes.indexOf(state.selected)) : '';
    canvas.dataset.axes = ['X', 'Y', 'Z'].map((label) => `${Math.round(axes.tips[label].x)},${Math.round(axes.tips[label].y)}`).concat(`${Math.round(axes.start.x)},${Math.round(axes.start.y)}`).join(';');
    canvas.dataset.arrows = state.arrows.map((item) => `${item.label}:${Math.round(item.a.x)},${Math.round(item.a.y)},${Math.round(item.b.x)},${Math.round(item.b.y)}`).join(';');
    canvas.dataset.placing = String(state.placing);
    // Pomiary (od 1.53): tryb, środki liczb pomiarów (numer bryły.numer pomiaru:x,y), punkty do wskazania w trybie pomiaru.
    canvas.dataset.measuring = String(state.measuring);
    canvas.dataset.measures = state.labels.map((label) => `${label.index}.${label.at}:${Math.round(label.x + label.w / 2)},${Math.round(label.y + label.h / 2)}`).join(';');
    canvas.dataset.snaps = state.measuring ? state.solids.flatMap((item) => solidFeatures(item.solid).points
      .filter((feature) => featureVisible(item.solid, feature, item.yaw, state.camera.zv))
      .map((feature) => {
        const point = projectWorld(state.camera, view, worldFeature(item, feature).p);
        return `${item.index}:${feature.role}:${Math.round(point.x)},${Math.round(point.y)}`;
      })).join(';') : '';
    canvas.dataset.first = state.first ? state.first.feature.role : '';
    canvas.dataset.chosen = state.chosen && measures.some((entry) => entry.index === state.chosen.index && entry.at === state.chosen.at) ? `${state.chosen.index}.${state.chosen.at}` : '';
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === id));
    undoButton.disabled = !state.canUndo;
    picked.hidden = !state.selected;
    if (state.selected) picked.textContent = solidLabel(state.selected);
    const moving = gesture?.kind === 'move' ? selectedPlace() : null;
    hint.textContent = state.note
      || (moving ? `Przesuwanie wzdłuż ${AXES[gesture.axis][0]} – same krawędzie · ${poseText(moving.place)}`
        : state.placing ? 'Dotknij wierzchu innej bryły – tam stanie zaznaczona · Esc – bez zmian'
          : state.measuring && !state.moving ? 'Pomiar: dotknij dwóch cech brył · przeciągnij – obrót sceny · Esc – od nowa'
          : state.moving ? 'W ruchu – same krawędzie (bez krycia); po puszczeniu – pełny obraz'
            : state.selected ? 'Przeciągnij – obrót sceny · strzałka – przesuwanie wzdłuż osi · liczby – w panelu'
              : 'Przeciągnij – obrót sceny · kółko albo dwa palce – przybliżenie · dotknij bryły – zaznaczenie');
    hint.classList.toggle('drawing__scene-hint--moving', state.moving || state.placing || state.measuring);
    hint.classList.toggle('drawing__scene-hint--note', Boolean(state.note));
  }
  /** „X 120,0 · Y 80,0 · Z 30,0 mm” – położenie w układzie arkusza. */
  function poseText(place) {
    const sheet = toSheet(state.drawing, place);
    const digits = places();
    return `X ${formatCoord(sheet.x, digits)} · Y ${formatCoord(sheet.y, digits)} · Z ${formatCoord(place.z * factor(), digits)} ${coordUnit(state.drawing)}`;
  }

  // ---------------------------------------------------------------- widoki, obrót, przybliżenie, zaznaczenie, przesuwanie

  function goTo(target) {
    window.cancelAnimationFrame(state.blend);
    const from = { az: state.camera.az, el: state.camera.el, base: state.base, zoom: state.zoom, pan: state.pan };
    // Gotowy widok – cała scena w tym widoku (skala dopasowana, bez przybliżenia i przesunięcia).
    state.bounds = sceneBounds(state.drawing, state.solids);
    const base = fit(sceneCamera(target.az, target.el));
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / BLEND_MS);
      const { az, el } = blendCamera(from, target, t);
      const k = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      state.base = from.base + (base - from.base) * k;
      state.zoom = from.zoom + (1 - from.zoom) * k;
      state.pan = { x: from.pan.x * (1 - k), y: from.pan.y * (1 - k) };
      state.camera = sceneCamera(t >= 1 ? target.az : az, t >= 1 ? target.el : el);
      state.moving = t < 1;
      render();
      if (t < 1) state.blend = window.requestAnimationFrame(step);
    };
    state.blend = window.requestAnimationFrame(step);
  }
  const local = (event) => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  /** Bryła pod punktem ekranu – od najbliższej (ostatnio rysowanej); ściany z rozkładu pełnego obrazu. */
  function pick(point) {
    const view = layout();
    const x = (point.x - view.ox) / view.scale;
    const y = (point.y - view.oy) / view.scale;
    const inside = (ring) => {
      let result = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [a, b] = [ring[i], ring[j]];
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) result = !result;
      }
      return result;
    };
    for (const { item, shown } of [...state.painted].reverse()) {
      const geometry = solidGeometry(shown);
      if (geometry.sphere && Math.hypot(x - geometry.sphere.x, y - geometry.sphere.y) <= geometry.sphere.r) return item.solid;
      for (const face of geometry.faces ?? []) {
        const rings = face.loops ?? [face.points];
        if (rings.length > 0 && inside(rings[0]) && !rings.slice(1).some(inside)) return item.solid;
      }
    }
    return null;
  }
  /** Strzałka pod punktem ekranu (najbliższa) albo null. */
  function arrowAt(point, touch) {
    let best = null;
    for (const item of state.arrows) {
      const [dx, dy] = [item.b.x - item.a.x, item.b.y - item.a.y];
      const t = Math.max(0, Math.min(1, ((point.x - item.a.x) * dx + (point.y - item.a.y) * dy) / (dx * dx + dy * dy)));
      const distance = Math.hypot(point.x - item.a.x - dx * t, point.y - item.a.y - dy * t);
      if (distance <= (touch ? ARROW.touch : ARROW.hit) && (!best || distance < best.distance)) best = { ...item, distance };
    }
    return best;
  }
  /**
   * Przesunięcie wzdłuż osi: przesunięcie wskaźnika rzutowane na kierunek strzałki na ekranie → jednostki strony; liczba
   * w układzie arkusza zaokrąglona (mm – do 1, cm – do 0,1, m – do 0,01), wysokość podstawy nie mniejsza niż 0.
   */
  function dragPose(point) {
    const { per, start, place, axis } = gesture;
    const t = ((point.x - start.x) * per[0] + (point.y - start.y) * per[1]) / (per[0] * per[0] + per[1] * per[1]);
    const step = 10 ** (1 - places());
    const snap = (value) => Math.round(value / step) * step;
    const pose = { x: place.x, y: place.y, z: place.z, yaw: place.yaw };
    if (axis === 2) {
      pose.z = Math.max(0, snap((place.z + t) * factor())) / factor();
      return pose;
    }
    const from = toSheet(state.drawing, place);
    const moved = toSheet(state.drawing, { x: place.x + (axis === 0 ? t : 0), y: place.y - (axis === 1 ? t : 0) });
    const target = fromSheet(state.drawing, axis === 0 ? { x: snap(moved.x), y: from.y } : { x: from.x, y: snap(moved.y) });
    return { ...pose, x: target.x, y: target.y };
  }
  /** Podgląd w trakcie przesuwania: bryła w nowym położeniu, bryły na niej – za nią (rysunek bez zmian do puszczenia). */
  function previewPose(pose) {
    const strokes = [...state.drawing.strokes];
    const index = strokes.indexOf(state.selected);
    strokes[index] = withPose(state.drawing.strokes, state.selected, pose);
    resolveStacks(strokes, stackChanges(state.drawing.strokes, strokes));
    state.preview = strokes;
    state.solids = sceneSolids({ ...state.drawing, strokes });
    gesture.pose = pose;
  }
  function settle() {
    if (!state.moving) return;
    state.moving = false;
    render();
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button === 2) return;
    event.preventDefault();
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // przechwycenie nie jest konieczne
    }
    pointers.set(event.pointerId, local(event));
    window.cancelAnimationFrame(state.blend);
    // W trakcie przesuwania strzałką drugi palec nic nie zmienia.
    if (gesture?.kind === 'move') return;
    if (pointers.size === 2) {
      // Dwa palce: przybliżenie i przesunięcie (zaczęty obrót – koniec).
      const [p, q] = [...pointers.values()];
      gesture = { kind: 'pinch', distance: Math.hypot(q.x - p.x, q.y - p.y) || 1, middle: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, zoom: state.zoom, pan: { ...state.pan } };
      return;
    }
    if (pointers.size > 2) return;
    const point = local(event);
    // Strzałka zaznaczonej bryły – przesuwanie wzdłuż osi (w trakcie – same krawędzie).
    const handle = event.button === 0 && !event.shiftKey ? arrowAt(point, event.pointerType !== 'mouse') : null;
    if (handle) {
      const place = placement(solidsById(state.drawing.strokes), state.selected);
      gesture = { kind: 'move', axis: handle.axis, start: point, per: handle.per, place, pose: null, moved: false };
      state.moving = true;
      render();
      return;
    }
    // Środkowy przycisk albo Shift – przesuwanie sceny; inaczej obrót.
    gesture = { kind: event.button === 1 || event.shiftKey ? 'pan' : 'orbit', start: point, last: point, moved: false, pan: { ...state.pan }, touch: event.pointerType !== 'mouse' };
  });
  canvas.addEventListener('pointermove', (event) => {
    // Pomiar (od 1.53): cecha pod myszą podświetlona.
    if (state.measuring && event.pointerType === 'mouse' && pointers.size === 0) {
      const found = featureAt(local(event), false);
      const hover = found && !found.none ? found : null;
      if ((hover?.feature ?? null) !== (state.hover?.feature ?? null)) {
        state.hover = hover;
        render();
      }
      return;
    }
    if (!pointers.has(event.pointerId) || !gesture) return;
    event.preventDefault();
    pointers.set(event.pointerId, local(event));
    if (gesture.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [p, q] = [...pointers.values()];
      const distance = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const middle = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      state.zoom = Math.min(SCENE_ZOOM[1], Math.max(SCENE_ZOOM[0], gesture.zoom * (distance / gesture.distance)));
      state.pan = { x: gesture.pan.x + middle.x - gesture.middle.x, y: gesture.pan.y + middle.y - gesture.middle.y };
      state.moving = true;
      render();
      return;
    }
    const point = local(event);
    if (gesture.kind === 'move') {
      if (!gesture.moved && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) < TAP) return;
      gesture.moved = true;
      previewPose(dragPose(point));
      fillCard();
      render();
      return;
    }
    if (!gesture.moved && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) < TAP) return;
    gesture.moved = true;
    state.moving = true;
    if (gesture.kind === 'pan') {
      state.pan = { x: gesture.pan.x + point.x - gesture.start.x, y: gesture.pan.y + point.y - gesture.start.y };
    } else {
      const { az, el } = orbit(state.camera, point.x - gesture.last.x, point.y - gesture.last.y);
      state.camera = sceneCamera(az, el);
    }
    gesture.last = point;
    render();
  });
  const release = (event, cancelled) => {
    if (!pointers.delete(event.pointerId)) return;
    const done = gesture;
    if (done?.kind === 'move') {
      if (pointers.size > 0) return;
      gesture = null;
      state.moving = false;
      const { pose, place } = done;
      // Dotknięcie strzałki bez przeciągania – jak dotknięcie sceny (zaznacza bryłę pod spodem, np. stojącą na zaznaczonej).
      if (!cancelled && !done.moved) {
        dropPreview();
        state.selected = pick(done.start);
        onSelect(state.selected);
        fillCard();
        render();
        return;
      }
      const same = !pose || (Math.abs(pose.x - place.x) < 1e-6 && Math.abs(pose.y - place.y) < 1e-6 && Math.abs(pose.z - place.z) < 1e-6);
      if (cancelled || same) {
        dropPreview();
        return;
      }
      change(new Map([[state.selected, withPose(state.drawing.strokes, state.selected, pose)]]));
      return;
    }
    if (done?.kind === 'pinch') {
      // Puszczony jeden palec – koniec przybliżania; drugi nie zaczyna obrotu.
      if (pointers.size === 0) gesture = null;
      else gesture = { kind: 'none' };
      if (pointers.size === 0) settle();
      return;
    }
    if (pointers.size > 0) return;
    gesture = null;
    if (!cancelled && done && done.kind !== 'none' && !done.moved) {
      if (state.placing) {
        placeAt(done.start);
        return;
      }
      // Liczba pomiaru (od 1.53) – szczegóły pomiaru; w trybie pomiaru – cechy brył.
      const label = state.first ? null : labelAt(done.start, done.touch);
      if (label) {
        state.chosen = { index: label.index, at: label.at };
        fillCard();
        render();
        return;
      }
      if (state.measuring) {
        measureTap(done.start, done.touch);
        return;
      }
      state.chosen = null;
      state.selected = pick(done.start);
      onSelect(state.selected);
      fillCard();
      render();
      return;
    }
    settle();
  };
  canvas.addEventListener('pointerup', (event) => release(event, false));
  canvas.addEventListener('pointercancel', (event) => release(event, true));
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    state.zoom = Math.min(SCENE_ZOOM[1], Math.max(SCENE_ZOOM[0], state.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    // Przybliżanie też jest ruchem: same krawędzie, pełny obraz chwilę po ostatnim obrocie kółka.
    state.moving = true;
    clearTimeout(state.wheelTimer);
    state.wheelTimer = setTimeout(settle, WHEEL_SETTLE);
    render();
  }, { passive: false });

  return {
    element,
    open,
    update,
    close,
    cancel,
    isOpen: () => state.open,
    resize: () => {
      if (!state.open) return;
      state.base = fit(state.camera);
      render();
    }
  };
}
