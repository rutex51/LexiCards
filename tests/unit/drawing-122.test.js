// Wersja 1.22: liniuszek promieniowy (okręgi i promienie), przyciąganie końców odcinków i strzałek
// do krawędzi i narożników kształtów oraz trwałe „przyklejenie” końca do kształtu.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeArray } from '../../js/core/arrays.js';
import {
  endPoint, findSnap, followersOf, keepLinksTo, newElementId, resolveAttachments, segmentBetween, withLink, withoutLinks
} from '../../js/core/attach.js';
import { DRAWING_VERSION, cleanDrawing, cleanToolSettings, defaultToolSettings, emptyDrawing, translateStroke } from '../../js/core/drawing.js';
import { nearestRay, nearestRing, rayAngles, ringsIn } from '../../js/core/shapes.js';

const near = (actual, expected, message, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} ≠ ${expected}`);
/** Położenia odcinków zapisane z dokładnością 0,01. */
const close = (actual, expected, message) => near(actual, expected, message, 0.02);

test('liniuszek promieniowy 1.22: najbliższy okrąg i promień, okręgi na stronie, kierunki promieni', () => {
  const radial = { x: 800, y: 550, spacing: 44, step: Math.PI / 6, angle: 0 };
  const ring = nearestRing(radial, 800 + 90, 550);
  assert.deepEqual([ring.radius, ring.index], [88, 2]);
  near(ring.distance, 2, 'odległość od okręgu 88');
  assert.equal(nearestRing(radial, 801, 550).radius, 44, 'przy środku – pierwszy okrąg (bez okręgu 0)');
  // Punkt 10° nad osią x (ekran: y w dół) w odległości 100 – najbliższy promień 0°.
  const theta = (-10 * Math.PI) / 180;
  const ray = nearestRay(radial, 800 + 100 * Math.cos(theta), 550 + 100 * Math.sin(theta));
  near(ray.angle, 0, 'promień 0°');
  near(ray.distance, 100 * Math.sin(Math.PI / 18), 'odległość od promienia');
  near(ray.x, 800 + 100 * Math.cos(Math.PI / 18), 'rzut na promień');
  near(ray.y, 550, 'rzut na promień – y');
  // Obrót o 15°: punkt pod kątem 20° – najbliższy promień 15°.
  const rotated = { ...radial, angle: Math.PI / 12 };
  near(nearestRay(rotated, 800 + 100 * Math.cos(Math.PI / 9), 550 + 100 * Math.sin(Math.PI / 9)).angle, Math.PI / 12, 'promień obrócony');
  assert.equal(rayAngles(radial).length, 12, 'co 30° – 12 promieni');
  assert.equal(rayAngles({ ...radial, step: Math.PI / 4 }).length, 8);
  // Środek na środku strony 1600 × 1100: najdalszy narożnik ≈ 970,8 – 22 okręgi co 44.
  assert.equal(ringsIn(radial, 1600, 1100).length, 22);
  // Środek poza stroną: okręgi od pierwszego, który ją przecina.
  const outside = ringsIn({ ...radial, x: -200, y: 550 }, 1600, 1100);
  assert.equal(outside[0], 220, 'pierwszy okrąg sięgający strony');
});

test('liniuszek promieniowy 1.22: ustawienia – rodzaj, odstęp okręgów, promienie, krok z listy, obrót; złe – domyślne', () => {
  assert.deepEqual(
    (({ kind, ringSpacing, rays, rayStep, rayAngle }) => ({ kind, ringSpacing, rays, rayStep, rayAngle }))(defaultToolSettings().guide),
    { kind: 'lines', ringSpacing: 1, rays: true, rayStep: 30, rayAngle: 0 }
  );
  const tools = cleanToolSettings({ guide: { kind: 'radial', ringSpacing: 2.3, rays: false, rayStep: 45, rayAngle: 120 } });
  assert.deepEqual(
    (({ kind, ringSpacing, rays, rayStep, rayAngle }) => ({ kind, ringSpacing, rays, rayStep, rayAngle }))(tools.guide),
    { kind: 'radial', ringSpacing: 2.25, rays: false, rayStep: 45, rayAngle: 90 }
  );
  const wrong = cleanToolSettings({ guide: { kind: 'spirala', ringSpacing: 'x', rays: 1, rayStep: 7, rayAngle: null } }).guide;
  assert.deepEqual([wrong.kind, wrong.ringSpacing, wrong.rays, wrong.rayStep, wrong.rayAngle], ['lines', 1, true, 30, 0]);
});

test('przyciąganie 1.22: narożnik ma pierwszeństwo, krawędź prostokąta i elipsy, ramka pola tekstowego, poza promieniem – nic', () => {
  const rect = { tool: 'shape', shape: 'rect', color: '#1d1d1f', size: 3, x: 500, y: 400, w: 200, h: 100, angle: 0, skew: 0, adjust: 0 };
  const ellipse = { ...rect, shape: 'ellipse', x: 1000, y: 400, w: 200, h: 200 };
  const text = { tool: 'text', color: '#1d1d1f', x: 100, y: 100, size: 30, text: 'Opis', width: 120, height: 40 };
  const strokes = [rect, ellipse, text];
  const corner = findSnap(strokes, { x: 406, y: 356 }, 10);
  assert.deepEqual([corner.kind, corner.x, corner.y, corner.ref], ['corner', 400, 350, { kind: 'corner', index: 0 }], 'lewy górny narożnik');
  const edge = findSnap(strokes, { x: 550, y: 455 }, 10);
  assert.deepEqual([edge.kind, edge.x, edge.y, edge.ref.index], ['edge', 550, 450, 2], 'dolny bok (od prawego do lewego)');
  near(edge.ref.t, 0.25, 'miejsce na boku – ćwierć od prawego narożnika');
  const round = findSnap(strokes, { x: 1000 + 70.71 + 4, y: 400 + 70.71 + 4 }, 10);
  assert.equal(round.kind, 'edge');
  near(round.ref.angle, Math.PI / 4, 'kąt na elipsie (zapis co 0,0001)', 1e-4);
  assert.equal(findSnap(strokes, { x: 225, y: 145 }, 10).kind, 'corner', 'narożnik ramki pola tekstowego');
  assert.equal(findSnap(strokes, { x: 300, y: 300 }, 10), null);
  assert.equal(findSnap(strokes, { x: 406, y: 356 }, 10, { exclude: new Set([rect]) }), null, 'pominięty element');
});

test('przyklejenie 1.22: koniec strzałki idzie za przesuniętym i zmienionym kształtem, odkleja się od usuniętego; kopie wolne; zapis', () => {
  const rect = { tool: 'shape', shape: 'rect', color: '#1d1d1f', size: 3, x: 500, y: 400, w: 200, h: 100, angle: 0, skew: 0, adjust: 0, id: 'abc12345' };
  const arrow = segmentBetween({ tool: 'shape', shape: 'arrow', color: '#1d1d1f', size: 3, h: 0, skew: 0, adjust: 0, x: 0, y: 0, w: 1, angle: 0 },
    { x: 100, y: 100 }, { x: 400, y: 350 });
  const attached = withLink(arrow, 'end', { id: 'abc12345', kind: 'corner', index: 0 });
  const strokes = [rect, attached];
  assert.equal(resolveAttachments(strokes).size, 0, 'koniec już w narożniku – bez zmian');
  // Kształt przesunięty o (+100, +50): koniec strzałki w nowym narożniku, początek bez zmian.
  strokes[0] = translateStroke(rect, 100, 50);
  const replaced = resolveAttachments(strokes);
  assert.equal(replaced.get(attached), strokes[1]);
  const end = endPoint(strokes[1], 'end');
  close(end.x, 500, 'koniec – x');
  close(end.y, 400, 'koniec – y');
  close(endPoint(strokes[1], 'start').x, 100, 'początek bez zmian');
  // Krawędź: miejsce na boku zostaje przy zmianie szerokości.
  const onEdge = withLink(arrow, 'end', { id: 'abc12345', kind: 'edge', index: 0, t: 0.5 });
  const wide = [{ ...rect, w: 400 }, onEdge];
  resolveAttachments(wide);
  close(endPoint(wide[1], 'end').x, 500, 'środek górnego boku');
  close(endPoint(wide[1], 'end').y, 350, 'górny bok');
  // Kształt usunięty – przyklejenie znika, koniec zostaje.
  const alone = [strokes[1]];
  resolveAttachments(alone);
  assert.equal(alone[0].attach, undefined);
  close(endPoint(alone[0], 'end').x, 500, 'koniec tam, gdzie był');
  // Podgląd w trakcie przesuwania: strzałka idzie za kształtem.
  const follow = followersOf([rect, attached], new Map([[rect, translateStroke(rect, 0, 100)]]));
  close(endPoint(follow.get(attached), 'end').y, 450, 'podgląd końca');
  // Przesunięta sama – odkleja się; kopie bez id i przyklejeń; szyk – też.
  assert.equal(keepLinksTo(attached, new Set()).attach, undefined);
  assert.deepEqual(keepLinksTo(attached, new Set(['abc12345'])).attach, attached.attach);
  assert.equal('id' in withoutLinks(rect), false);
  assert.equal('attach' in withoutLinks(attached), false);
  const array = makeArray([rect, attached], { kind: 'linear', columns: 2, rows: 1, dx: 300, dy: 0 }, 5000);
  assert.ok(array.items.every((item) => !('id' in item) && !('attach' in item)), 'kopie w szyku – wolne');
  assert.notEqual(newElementId([rect]), 'abc12345');
  assert.match(newElementId([]), /^[a-z0-9]{8}$/);

  // Zapis: id i przyklejenia przechodzą sprawdzanie, złe – pomijane; karteczka – koniec strzałki.
  const sticky = { tool: 'sticky', x: 100, y: 600, width: 300, height: 200, size: 30, color: 'pink', text: 'Uwaga', created: '2026-10-20',
    leader: { x: 400, y: 450 }, attach: { leader: { id: 'abc12345', kind: 'edge', index: 2, t: 0.5 }, start: { id: 'abc12345', kind: 'corner', index: 0 } } };
  const cleaned = cleanDrawing({ ...emptyDrawing(), strokes: [rect, attached, { ...rect, id: 'ZŁE id' }, { ...attached, attach: { end: { id: 'abc12345', kind: 'wierzchołek' } } }, sticky] });
  assert.equal(cleaned.version, DRAWING_VERSION);
  assert.equal(cleaned.strokes[0].id, 'abc12345');
  assert.deepEqual(cleaned.strokes[1].attach, { end: { id: 'abc12345', kind: 'corner', index: 0 } });
  assert.equal('id' in cleaned.strokes[2], false, 'złe id – pominięte');
  assert.equal('attach' in cleaned.strokes[3], false, 'złe przyklejenie – pominięte');
  assert.deepEqual(cleaned.strokes[4].attach, { leader: { id: 'abc12345', kind: 'edge', index: 2, t: 0.5 } }, 'karteczka – tylko strzałka');
  // Strzałka karteczki idzie za kształtem.
  const withSticky = [{ ...rect, y: 500 }, cleaned.strokes[4]];
  resolveAttachments(withSticky);
  assert.deepEqual(withSticky[1].leader, { x: 500, y: 550 });
});
