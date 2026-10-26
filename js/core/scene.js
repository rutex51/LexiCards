// Scena 3D (od 1.51) – bez przeglądarki: kartka jako płaszczyzna XY (Z = 0), bryły stojące na niej, wspólna kamera
// (rzut równoległy, jak w rysunku technicznym). Układ świata – jak układ arkusza (od 1.50): X w prawo, Y w górę kartki,
// Z do góry, w jednostkach strony; punkt strony (x, y) leży w (x, wysokość − y, 0).
//
// Bryła w scenie stoi prosto – osie bryły są osiami świata (W1: X = x bryły, Y = −z, Z = y) – podstawą na kartce,
// środkiem nad środkiem swojego obrazka na kartce. Położenie obrazka (q) to w 2D tylko widok obrazka; w scenie bryły
// pokazuje wspólna kamera. Kamera: azymut (od strony −Y w stronę +X) i wysokość nad kartką (0–90°).

import { hasFeatures, isModel, quatFromMatrix, solidShape } from './solids.js';

const D2R = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Gotowe widoki sceny: izometria (od przodu z prawej, jak w programach CAD), przód (od −Y), boki, tył, góra. */
export const SCENE_VIEWS = Object.freeze([
  { id: 'iso', label: 'Izometria', az: 45, el: 35.264 },
  { id: 'front', label: 'Przód', az: 0, el: 0 },
  { id: 'right', label: 'Prawy bok', az: 90, el: 0 },
  { id: 'left', label: 'Lewy bok', az: -90, el: 0 },
  { id: 'back', label: 'Tył', az: 180, el: 0 },
  { id: 'top', label: 'Góra', az: 0, el: 90 }
].map(Object.freeze));
/** Wysokość kamery nad kartką (stopnie): od poziomu kartki do widoku z góry – kartka nigdy od spodu (napisy nie w lustrze). */
export const SCENE_ELEVATION = Object.freeze([0, 90]);
/** Przybliżenie względem „cała scena”. */
export const SCENE_ZOOM = Object.freeze([0.3, 8]);

/** Kamera: wektory ekranu w świecie – xv w prawo, yv w górę, zv do patrzącego. */
export function sceneCamera(az, el) {
  const [a, e] = [az * D2R, el * D2R];
  const zv = [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];
  const xv = [Math.cos(a), Math.sin(a), 0];
  return { az, el, xv, yv: cross(zv, xv), zv };
}
/** Punkt świata w układzie widoku: [w prawo, w górę, do patrzącego]. */
export const toView = (camera, point) => [dot(camera.xv, point), dot(camera.yv, point), dot(camera.zv, point)];

/** Obrót bryły w scenie (wiersze: świat z układu bryły) – X = x, Y = −z, Z = y. */
export const SCENE_POSE = Object.freeze([1, 0, 0, 0, 0, -1, 0, 1, 0]);
/**
 * Położenie bryły dla rysowania z rozkładu 2D (quatMatrix – wiersze: widok z układu bryły): kamera razy obrót bryły w scenie.
 * Wszystkie bryły stoją tak samo, więc kwaternion jest jeden dla całej sceny.
 */
export function sceneQuat(camera) {
  const rows = [camera.xv, camera.yv, camera.zv];
  const m = rows.flatMap((row) => [0, 1, 2].map((column) => row[0] * SCENE_POSE[column] + row[1] * SCENE_POSE[3 + column] + row[2] * SCENE_POSE[6 + column]));
  return quatFromMatrix(m);
}

/** Punkt strony na kartce w świecie (Z = 0). */
export const worldOfPage = (drawing, point) => [point.x, drawing.height - point.y, 0];

/** Zasięg bryły w jej układzie: { min: [x, y, z], max } (kula – promień). */
export function bodyExtent(solid) {
  if (solid.kind === 'sphere') {
    const r = solid.dims.d / 2;
    return { min: [-r, -r, -r], max: [r, r, r] };
  }
  const mesh = solidShape(solid);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const vertex of mesh.V) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], vertex[axis]);
      max[axis] = Math.max(max[axis], vertex[axis]);
    }
  }
  return { min, max };
}

/**
 * Bryły sceny (bez brył w szykach): { solid, index – miejsce w rysunku, origin – punkt świata początku układu bryły,
 * center – środek jej zasięgu w świecie, height – wysokość nad kartką }. Bryła stoi podstawą na kartce: najniższy
 * punkt bryły (najmniejsze y bryły – Z) w Z = 0, początek układu bryły nad środkiem obrazka.
 */
export function sceneSolids(drawing) {
  const list = [];
  drawing.strokes.forEach((stroke, index) => {
    if (stroke.tool !== 'solid') return;
    const { min, max } = bodyExtent(stroke);
    const [x, y] = worldOfPage(drawing, stroke);
    const origin = [x, y, -min[1]];
    // Środek zasięgu w świecie: x bryły → X, −z → Y, y → Z.
    const mid = [0, 1, 2].map((axis) => (min[axis] + max[axis]) / 2);
    const center = [origin[0] + mid[0], origin[1] - mid[2], origin[2] + mid[1]];
    const half = [(max[0] - min[0]) / 2, (max[2] - min[2]) / 2, (max[1] - min[1]) / 2];
    list.push({ solid: stroke, index, origin, center, half, height: max[1] - min[1], model: isModel(stroke) || hasFeatures(stroke) });
  });
  return list;
}

/** Prostopadłościan obejmujący scenę: kartka (Z = 0) i bryły. */
export function sceneBounds(drawing, solids = sceneSolids(drawing)) {
  const min = [0, 0, 0];
  const max = [drawing.width, drawing.height, 0];
  for (const { center, half } of solids) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], center[axis] - half[axis]);
      max[axis] = Math.max(max[axis], center[axis] + half[axis]);
    }
  }
  return { min, max };
}

/**
 * Skala „cała scena” w danym widoku (px na jednostkę strony): rzut prostopadłościanu sceny mieści się w obszarze
 * (szerokość × wysokość pod paskiem) z marginesem. Liczona przy otwarciu, wyborze widoku i „Cała” – w trakcie obracania
 * stała (obraz nie skacze).
 */
export function fitScale(camera, bounds, { width, height, top = 0, margin = 0.9 }) {
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((bits) => [0, 1, 2].map((axis) => ((bits >> axis) & 1 ? bounds.max[axis] : bounds.min[axis])));
  const view = corners.map((point) => toView(camera, point));
  const center = [0, 1, 2].map((axis) => (bounds.min[axis] + bounds.max[axis]) / 2);
  const [cx, cy] = toView(camera, center);
  // Od środka sceny w obie strony – środek zostaje w środku obszaru.
  const spanX = 2 * Math.max(...view.map(([x]) => Math.abs(x - cx)), 1);
  const spanY = 2 * Math.max(...view.map(([, y]) => Math.abs(y - cy)), 1);
  return Math.min((width * margin) / spanX, (Math.max(10, height - top) * margin) / spanY);
}
/** Widok sceny na ekranie: { scale – px na jednostkę strony, ox, oy – miejsce początku świata }; środek sceny w środku obszaru. */
export function sceneView(camera, bounds, { width, height, top = 0, base, zoom = 1, pan = { x: 0, y: 0 } }) {
  const center = [0, 1, 2].map((axis) => (bounds.min[axis] + bounds.max[axis]) / 2);
  const scale = base * zoom;
  const [vx, vy] = toView(camera, center);
  const sx = width / 2 + pan.x;
  const sy = top + (height - top) / 2 + pan.y;
  return { scale, ox: sx - scale * vx, oy: sy + scale * vy };
}
/** Punkt świata na ekranie: { x, y, depth } (depth – im więcej, tym bliżej patrzącego). */
export function projectWorld(camera, view, point) {
  const [vx, vy, vz] = toView(camera, point);
  return { x: view.ox + view.scale * vx, y: view.oy - view.scale * vy, depth: vz };
}
/**
 * Przekształcenie płótna dla kartki: punkt strony (x, y) → ekran; [a, b, c, d, e, f] jak w setTransform. Rzut równoległy
 * płaszczyzny jest liniowy, więc treść kartki rysuje się zwykłym rysowaniem 2D w tym przekształceniu.
 */
export function sheetMatrix(camera, view, drawing) {
  const { xv, yv } = camera;
  const { scale: s, ox, oy } = view;
  const H = drawing.height;
  return [s * xv[0], -s * yv[0], -s * xv[1], s * yv[1], ox + s * xv[1] * H, oy - s * yv[1] * H];
}
/** Kolejność rysowania: od najdalszej bryły (środek zasięgu); przy równej odległości – kolejność w rysunku. */
export function paintOrder(camera, solids) {
  return [...solids].sort((p, q) => toView(camera, p.center)[2] - toView(camera, q.center)[2] || p.index - q.index);
}

/** Obrót sceny przeciągnięciem: piksele → stopnie; wysokość w granicach SCENE_ELEVATION. */
export function orbit(camera, dx, dy, speed = 0.4) {
  const az = ((((camera.az - dx * speed + 180) % 360) + 360) % 360) - 180;
  const el = Math.min(SCENE_ELEVATION[1], Math.max(SCENE_ELEVATION[0], camera.el + dy * speed));
  return { az, el };
}
/** Gotowy widok, w którym jest kamera (z dokładnością do 0,5°), albo null. */
export function sceneViewId(camera) {
  const near = (a, b) => Math.abs((((a - b + 540) % 360) + 360) % 360 - 180) <= 0.5;
  return SCENE_VIEWS.find((view) => Math.abs(view.el - camera.el) <= 0.5 && near(view.az, camera.az))?.id ?? null;
}
/** Kamera w drodze do gotowego widoku (t od 0 do 1) – azymut najkrótszą drogą. */
export function blendCamera(from, to, t) {
  const turn = ((((to.az - from.az + 540) % 360) + 360) % 360) - 180;
  const ease = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  return { az: from.az + turn * ease, el: from.el + (to.el - from.el) * ease };
}
