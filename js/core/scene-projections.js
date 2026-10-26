// Rzuty całej sceny (od 1.54) – bez przeglądarki: przód, góra i lewy bok wszystkich brył w położeniu ze sceny
// (core/scene.js, core/solid-pose.js), metodą europejską jak rzuty jednej bryły (1.48): góra pod przodem, lewy bok na prawo
// od przodu. Krawędzie niewidoczne – na wspólnej siatce wszystkich brył (meshLines), więc bryła zasłania krawędzie innych
// (linią przerywaną). Kula – siatka południków i równoleżników (zarys – okrąg). Osie: walec, stożek, graniastosłup,
// ostrosłup, bryła obrotowa – oś, w widoku wzdłuż osi – krzyżyk; kula – krzyżyk w każdym widoku.

import { PROJECTION_VIEWS, layoutProjections, meshLines, sketchToBody, solidShape } from './solids.js';
import { sceneCamera, sceneSolids, toView } from './scene.js';
import { bodyExtent, worldRotation } from './solid-pose.js';

/** Kamery rzutów: przód – od −Y, góra – z góry, lewy bok – od −X (jak widoki brył i sceny). */
const CAMERAS = Object.freeze({ front: sceneCamera(0, 0), top: sceneCamera(0, 90), left: sceneCamera(-90, 0) });
/** Wysunięcie osi poza bryłę (jednostki strony). */
const AXIS_OVERHANG = 8;
const apply3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

const sphereCache = new Map();
/** Kula jako siatka: 48 południków, 24 pasy; krawędzie gładkie (rysuje się sam zarys). */
export function sphereMesh(r) {
  if (sphereCache.has(r)) return sphereCache.get(r);
  const [around, rings] = [48, 24];
  const V = [[0, -r, 0]];
  for (let ring = 1; ring < rings; ring += 1) {
    const phi = -Math.PI / 2 + (ring * Math.PI) / rings;
    for (let step = 0; step < around; step += 1) {
      const theta = (step * 2 * Math.PI) / around;
      V.push([r * Math.cos(phi) * Math.cos(theta), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(theta)]);
    }
  }
  V.push([0, r, 0]);
  const at = (ring, step) => 1 + (ring - 1) * around + (step % around);
  const F = [];
  for (let step = 0; step < around; step += 1) F.push([[0, at(1, step + 1), at(1, step)]]);
  for (let ring = 1; ring < rings - 1; ring += 1) {
    for (let step = 0; step < around; step += 1) F.push([[at(ring, step), at(ring, step + 1), at(ring + 1, step + 1), at(ring + 1, step)]]);
  }
  const top = V.length - 1;
  for (let step = 0; step < around; step += 1) F.push([[at(rings - 1, step), at(rings - 1, step + 1), top]]);
  // Normalne na zewnątrz – kierunek od środka do środka ściany; kolejność wierzchołków zgodna z normalną.
  const N = F.map(([loop]) => {
    const c = [0, 1, 2].map((axis) => loop.reduce((sum, index) => sum + V[index][axis], 0) / loop.length);
    const length = Math.hypot(...c) || 1;
    return c.map((value) => value / length);
  });
  F.forEach(([loop], face) => {
    const [a, b, c] = loop.map((index) => V[index]);
    const cross = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    if (cross[0] * N[face][0] + cross[1] * N[face][1] + cross[2] * N[face][2] < 0) loop.reverse();
  });
  const edges = new Map();
  F.forEach(([loop], face) => loop.forEach((a, index) => {
    const b = loop[(index + 1) % loop.length];
    const id = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!edges.has(id)) edges.set(id, { a: Math.min(a, b), b: Math.max(a, b), faces: [] });
    edges.get(id).faces.push(face);
  }));
  const mesh = { V, F, N, E: [...edges.values()].map((edge) => ({ ...edge, sharp: false })) };
  if (sphereCache.size > 50) sphereCache.clear();
  sphereCache.set(r, mesh);
  return mesh;
}

/** Wspólna siatka sceny w świecie (jednostki strony; X w prawo, Y w górę kartki, Z do góry). */
export function sceneMesh(solids) {
  const V = [];
  const F = [];
  const N = [];
  const E = [];
  for (const item of solids) {
    const mesh = item.solid.kind === 'sphere' ? sphereMesh(item.solid.dims.d / 2) : solidShape(item.solid);
    const m = worldRotation(item.yaw);
    const [vertexBase, faceBase] = [V.length, F.length];
    for (const vertex of mesh.V) V.push(apply3(m, vertex).map((value, axis) => value + item.origin[axis]));
    for (const normal of mesh.N) N.push(apply3(m, normal));
    for (const loops of mesh.F) F.push(loops.map((loop) => loop.map((index) => index + vertexBase)));
    for (const edge of mesh.E) {
      E.push({
        ...edge, a: edge.a + vertexBase, b: edge.b + vertexBase, faces: edge.faces.map((face) => face + faceBase),
        ...(edge.seam !== undefined ? { seam: edge.seam + faceBase } : {})
      });
    }
  }
  return { V, F, N, E };
}

/** Oś bryły w jej układzie: { a, b, r – promień do krzyżyka } albo null. */
function solidAxis(solid) {
  const { min, max } = bodyExtent(solid);
  const half = (max[1] - min[1]) / 2;
  if (solid.kind === 'sphere') return { a: [0, 0, 0], b: [0, 0, 0], r: solid.dims.d / 2, point: true };
  if (['cylinder', 'cone', 'prism', 'pyramid'].includes(solid.kind)) {
    const r = solid.kind === 'pyramid' ? Math.max(solid.dims.a, solid.dims.b) / 2 : solid.dims.d / 2;
    return { a: [0, -half, 0], b: [0, half, 0], r };
  }
  if (solid.kind === 'revolve') {
    // Oś – x profilu (od 1.54 także na płaszczyźnie pionowej, pod kątem); promień – najdalszy punkt profilu.
    const toBody = sketchToBody(solid);
    const points = solid.profile.islands.flatMap((island) => island.outer);
    const xs = points.map(([x]) => x);
    return { a: toBody([Math.min(...xs), 0, 0]), b: toBody([Math.max(...xs), 0, 0]), r: Math.max(...points.map(([, y]) => y)) };
  }
  return null;
}

/** Osie brył w widoku kamery: odcinki [a, b] w układzie strony względem środka (y w dół). */
function axesIn(camera, solids) {
  const lines = [];
  const page = (point) => {
    const [x, y] = toView(camera, point);
    return { x, y: -y };
  };
  for (const item of solids) {
    const axis = solidAxis(item.solid);
    if (!axis) continue;
    const m = worldRotation(item.yaw);
    const world = (point) => apply3(m, point).map((value, index) => value + item.origin[index]);
    const [a, b] = [page(world(axis.a)), page(world(axis.b))];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (axis.point || length < 1) {
      // Oś na patrzącego (albo kula) – krzyżyk.
      const c = axis.point ? page(world([0, 0, 0])) : a;
      const reach = axis.r + AXIS_OVERHANG;
      lines.push([{ x: c.x - reach, y: c.y }, { x: c.x + reach, y: c.y }], [{ x: c.x, y: c.y - reach }, { x: c.x, y: c.y + reach }]);
      continue;
    }
    const [ux, uy] = [(b.x - a.x) / length, (b.y - a.y) / length];
    lines.push([{ x: a.x - ux * AXIS_OVERHANG, y: a.y - uy * AXIS_OVERHANG }, { x: b.x + ux * AXIS_OVERHANG, y: b.y + uy * AXIS_OVERHANG }]);
  }
  return lines;
}

/**
 * Rzuty sceny: { views: [{ id, visible, hidden, axes, bounds }], bounds } jak solidProjections (układ strony względem
 * środka rzutu z przodu); bez brył – null.
 */
export function sceneProjections(drawing) {
  const solids = sceneSolids(drawing);
  if (solids.length === 0) return null;
  const mesh = sceneMesh(solids);
  const raw = PROJECTION_VIEWS.map((id) => {
    const camera = CAMERAS[id];
    const view = mesh.V.map((point) => toView(camera, point));
    const N = mesh.N.map((normal) => toView(camera, normal));
    const lines = meshLines(mesh, view, N);
    const page = (list) => list.map((line) => ({ ...line, points: line.points.map((point) => ({ x: point.x, y: -point.y })) }));
    return { id, geometry: { visible: page(lines.visible), hidden: page(lines.hidden), axes: axesIn(camera, solids), sphere: null } };
  });
  return layoutProjections(raw);
}
