// Scena 3D w edytorze rysunku (od 1.51) – tylko do oglądania: kartka jako płaszczyzna XY z całą treścią 2D, bryły stojące
// na niej (core/scene.js), wspólna kamera. Przeciągnięcie obraca scenę, kółko myszy i dwa palce przybliżają (dwa palce
// także przesuwają), gotowe widoki – przyciski u góry, dotknięcie bryły – zaznaczenie. W ruchu (obracanie, przybliżanie,
// przejście do widoku) – same krawędzie, bez krycia i cieniowania; po puszczeniu – pełny obraz: kartka rysowana wektorowo,
// bryły z krawędziami niewidocznymi i cieniowaniem, od najdalszej (zasłaniają się nawzajem).

import { quatMatrix, solidGeometry, solidLabel, solidShape } from '../core/solids.js';
import {
  SCENE_VIEWS, SCENE_ZOOM, blendCamera, fitScale, orbit, paintOrder, projectWorld, sceneBounds, sceneCamera, sceneQuat, sceneSolids, sceneView, sceneViewId,
  sheetMatrix, toView, worldOfPage
} from '../core/scene.js';
import { paintSolid } from './drawing-solids.js';
import { textFont } from './canvas-text.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const ACCENT = '#0058be';
const LINE = '#1d1d1f';
const AXES = [['X', [1, 0, 0], '#d92d20'], ['Y', [0, 1, 0], '#1e8e3e'], ['Z', [0, 0, 1], '#1a6fdb']];
/** Długość osi w początku układu (jednostki strony – dwie i pół kratki). */
const AXIS_LENGTH = 110;
/** Przejście do gotowego widoku (ms) i chwila po ostatnim obrocie kółka myszy, po której wraca pełny obraz. */
const BLEND_MS = 380;
const WHEEL_SETTLE = 250;
const TAP = 5;

/**
 * Scena: { element, open({ drawing, origin, selected, paintPage, dimFormat }), close(), resize(), isOpen() }.
 * paintPage(ctx, skip) – treść kartki w jednostkach strony bez elementów ze zbioru skip (brył); origin – początek układu
 * arkusza (punkt strony); onSelect(bryła | null), onExit() – powrót do 2D.
 */
export function createScene({ onSelect, onExit }) {
  const canvas = h('canvas', { class: 'drawing__scene-canvas', role: 'img', 'aria-label': 'Scena 3D', dataset: { testid: 'drawing-scene-canvas' } });
  const viewButtons = SCENE_VIEWS.map((item) => h('button', {
    type: 'button', class: 'drawing__scene-chip', 'aria-pressed': 'false', dataset: { testid: `drawing-scene-view-${item.id}`, view: item.id },
    onClick: () => goTo(item)
  }, item.label));
  const exitButton = h('button', {
    type: 'button', class: 'drawing__scene-chip drawing__scene-chip--exit', title: 'Wróć do kartki 2D (Esc)', dataset: { testid: 'drawing-scene-exit' },
    onClick: () => onExit()
  }, '2D');
  const fitButton = h('button', {
    type: 'button', class: 'drawing__scene-chip', title: 'Cała scena – bez przybliżenia i przesunięcia', dataset: { testid: 'drawing-scene-fit' },
    onClick: () => {
      state.zoom = 1;
      state.pan = { x: 0, y: 0 };
      state.base = fit(state.camera);
      render();
    }
  }, icon('zoomFit', { size: 16 }), 'Cała');
  const bar = h('div', { class: 'drawing__scene-bar', role: 'toolbar', 'aria-label': 'Scena 3D – widoki' },
    exitButton, h('span', { class: 'drawing__scene-sep' }), ...viewButtons, h('span', { class: 'drawing__scene-sep' }), fitButton);
  const picked = h('span', { class: 'drawing__pill drawing__pill--info', hidden: true, dataset: { testid: 'drawing-scene-selected' } });
  const hint = h('span', { class: 'drawing__pill drawing__pill--info drawing__scene-hint', dataset: { testid: 'drawing-scene-hint' } });
  const element = h('div', { class: 'drawing__scene', hidden: true, dataset: { testid: 'drawing-scene' } },
    canvas, bar, h('div', { class: 'drawing__scene-info' }, picked, hint));

  const state = {
    open: false, drawing: null, origin: null, paintPage: null, dimFormat: 'unit', selected: null,
    camera: sceneCamera(45, 35.264), base: 1, zoom: 1, pan: { x: 0, y: 0 }, moving: false,
    solids: [], bounds: null, painted: [], blend: 0, wheelTimer: 0, sheetImage: null
  };
  const pointers = new Map();
  let gesture = null;

  function open({ drawing, origin, selected = null, paintPage, dimFormat }) {
    Object.assign(state, {
      open: true, drawing, origin, paintPage, dimFormat, selected, camera: sceneCamera(45, 35.264), zoom: 1, pan: { x: 0, y: 0 }, moving: false, sheetImage: null
    });
    state.solids = sceneSolids(drawing);
    state.bounds = sceneBounds(drawing, state.solids);
    element.hidden = false;
    state.base = fit(state.camera);
    render();
  }
  function close() {
    state.open = false;
    state.sheetImage = null;
    window.cancelAnimationFrame(state.blend);
    clearTimeout(state.wheelTimer);
    pointers.clear();
    gesture = null;
    element.hidden = true;
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
    state.paintPage(ctx, new Set(state.solids.map((item) => item.solid)));
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
      state.paintPage(ctx, new Set(state.solids.map((item) => item.solid)));
    }
    ctx.restore();
  }
  /** Bryła do rysowania rozkładem 2D: wspólne położenie sceny, środek – rzut początku układu bryły (jednostki widoku). */
  function viewSolid(item, q) {
    const [vx, vy] = toView(state.camera, item.origin);
    const selected = item.solid === state.selected;
    return { ...item.solid, q, x: vx, y: -vy, showDims: false, shade: true, color: selected ? ACCENT : item.solid.color };
  }
  /** W ruchu: krawędzie ostre i obrys ścian gładkich, wszystkie (także z tyłu) – bez sortowania i zasłaniania. */
  function paintWire(ctx, item, q, view) {
    const shown = viewSolid(item, q);
    ctx.save();
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.ox, view.dpr * view.oy);
    ctx.strokeStyle = item.solid === state.selected ? ACCENT : LINE;
    ctx.lineWidth = (item.solid === state.selected ? 1.8 : 1.2) / view.scale;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (item.solid.kind === 'sphere') {
      ctx.arc(shown.x, shown.y, item.solid.dims.d / 2, 0, Math.PI * 2);
    } else {
      const mesh = solidShape(item.solid);
      const m = quatMatrix(q);
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
    const tips = {};
    for (const [label, direction, color] of AXES) {
      const tip = projectWorld(camera, view, origin.map((value, axis) => value + direction[axis] * AXIS_LENGTH));
      const [dx, dy] = [tip.x - start.x, tip.y - start.y];
      const length = Math.hypot(dx, dy);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.5;
      if (length < 6) {
        // Oś na patrzącego – kółko z kropką.
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
      const [ux, uy] = [dx / length, dy / length];
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(tip.x - ux * 8, tip.y - uy * 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - ux * 11 - uy * 4.5, tip.y - uy * 11 + ux * 4.5);
      ctx.lineTo(tip.x - ux * 11 + uy * 4.5, tip.y - uy * 11 - ux * 4.5);
      ctx.closePath();
      ctx.fill();
      tips[label] = tip;
      halo(ctx, label, tip.x + ux * 11, tip.y + uy * 11, color);
    }
    ctx.restore();
    return { start, tips };
  }
  function halo(ctx, text, x, y, color) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  function render() {
    if (!state.open) return;
    const view = layout();
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintSheet(ctx, view);
    const q = sceneQuat(state.camera);
    const order = paintOrder(state.camera, state.solids);
    state.painted = [];
    for (const item of order) {
      if (state.moving) {
        paintWire(ctx, item, q, view);
        continue;
      }
      const shown = viewSolid(item, q);
      ctx.save();
      ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.ox, view.dpr * view.oy);
      paintSolid(ctx, shown, { scale: state.drawing.scale, dimFormat: state.dimFormat });
      ctx.restore();
      state.painted.push({ item, shown });
    }
    const axes = paintAxes(ctx, view);
    // Dla testów: widok, ruch, środki brył (px płótna, w kolejności rysunku), zaznaczona bryła, osie w początku.
    const id = sceneViewId(state.camera);
    canvas.dataset.view = id ?? '';
    canvas.dataset.moving = String(state.moving);
    canvas.dataset.centers = state.solids.map((item) => {
      const point = projectWorld(state.camera, view, item.center);
      return `${item.index}:${Math.round(point.x)},${Math.round(point.y)}`;
    }).join(';');
    canvas.dataset.selected = state.selected ? String(state.drawing.strokes.indexOf(state.selected)) : '';
    canvas.dataset.axes = ['X', 'Y', 'Z'].map((label) => `${Math.round(axes.tips[label].x)},${Math.round(axes.tips[label].y)}`).concat(`${Math.round(axes.start.x)},${Math.round(axes.start.y)}`).join(';');
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === id));
    picked.hidden = !state.selected;
    if (state.selected) picked.textContent = solidLabel(state.selected);
    hint.textContent = state.moving ? 'W ruchu – same krawędzie (bez krycia); po puszczeniu – pełny obraz'
      : 'Przeciągnij – obrót sceny · kółko albo dwa palce – przybliżenie · dotknij bryły – zaznaczenie';
    hint.classList.toggle('drawing__scene-hint--moving', state.moving);
  }

  // ---------------------------------------------------------------- widoki, obrót, przybliżenie, zaznaczenie

  function goTo(target) {
    window.cancelAnimationFrame(state.blend);
    const from = { az: state.camera.az, el: state.camera.el, base: state.base, zoom: state.zoom, pan: state.pan };
    // Gotowy widok – cała scena w tym widoku (skala dopasowana, bez przybliżenia i przesunięcia).
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
    if (pointers.size === 2) {
      // Dwa palce: przybliżenie i przesunięcie (zaczęty obrót – koniec).
      const [p, q] = [...pointers.values()];
      gesture = { kind: 'pinch', distance: Math.hypot(q.x - p.x, q.y - p.y) || 1, middle: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, zoom: state.zoom, pan: { ...state.pan } };
      return;
    }
    if (pointers.size > 2) return;
    const point = local(event);
    // Środkowy przycisk albo Shift – przesuwanie sceny; inaczej obrót.
    gesture = { kind: event.button === 1 || event.shiftKey ? 'pan' : 'orbit', start: point, last: point, moved: false, pan: { ...state.pan } };
  });
  canvas.addEventListener('pointermove', (event) => {
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
      state.selected = pick(done.start);
      onSelect(state.selected);
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
    close,
    isOpen: () => state.open,
    resize: () => {
      if (!state.open) return;
      state.base = fit(state.camera);
      render();
    }
  };
}
