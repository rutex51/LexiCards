// Rzuty całej sceny (od 1.54) – bez przeglądarki: przód, góra i lewy bok wszystkich brył w położeniu ze sceny
// (core/scene.js, core/solid-pose.js), metodą europejską jak rzuty jednej bryły (1.48): góra pod przodem, lewy bok na prawo
// od przodu. Krawędzie niewidoczne – na wspólnej siatce wszystkich brył (meshLines), więc bryła zasłania krawędzie innych
// (linią przerywaną). Kula – siatka południków i równoleżników (zarys – okrąg). Osie: walec, stożek, graniastosłup,
// ostrosłup, bryła obrotowa – oś, w widoku wzdłuż osi – krzyżyk; kula – krzyżyk w każdym widoku; od 1.55 także osie drugich
// brył sumy i różnicy (np. otworów).

import { PROJECTION_VIEWS, bodyAxes, bodyMesh, layoutProjections, meshLines } from './solids.js';
import { sceneCamera, sceneSolids, toView } from './scene.js';
import { worldRotation } from './solid-pose.js';

// Kula jako siatka – od 1.55 w core/solids.js (też do sumy i różnicy).
export { sphereMesh } from './solids.js';

/** Kamery rzutów: przód – od −Y, góra – z góry, lewy bok – od −X (jak widoki brył i sceny). */
const CAMERAS = Object.freeze({ front: sceneCamera(0, 0), top: sceneCamera(0, 90), left: sceneCamera(-90, 0) });
/** Wysunięcie osi poza bryłę (jednostki strony). */
const AXIS_OVERHANG = 8;
const apply3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/** Wspólna siatka sceny w świecie (jednostki strony; X w prawo, Y w górę kartki, Z do góry). */
export function sceneMesh(solids) {
  const V = [];
  const F = [];
  const N = [];
  const E = [];
  for (const item of solids) {
    const mesh = bodyMesh(item.solid);
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

/** Osie brył w widoku kamery: odcinki [a, b] w układzie strony względem środka (y w dół). */
function axesIn(camera, solids) {
  const lines = [];
  const page = (point) => {
    const [x, y] = toView(camera, point);
    return { x, y: -y };
  };
  for (const item of solids) {
    const m = worldRotation(item.yaw);
    const world = (point) => apply3(m, point).map((value, index) => value + item.origin[index]);
    // Od 1.55 także osie drugich brył sumy i różnicy (np. otworów).
    for (const axis of bodyAxes(item.solid)) {
      const [a, b] = [page(world(axis.a)), page(world(axis.b))];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (axis.point || length < 1) {
        // Oś na patrzącego (albo kula) – krzyżyk.
        const reach = axis.r + AXIS_OVERHANG;
        lines.push([{ x: a.x - reach, y: a.y }, { x: a.x + reach, y: a.y }], [{ x: a.x, y: a.y - reach }, { x: a.x, y: a.y + reach }]);
        continue;
      }
      const [ux, uy] = [(b.x - a.x) / length, (b.y - a.y) / length];
      lines.push([{ x: a.x - ux * AXIS_OVERHANG, y: a.y - uy * AXIS_OVERHANG }, { x: b.x + ux * AXIS_OVERHANG, y: b.y + uy * AXIS_OVERHANG }]);
    }
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
