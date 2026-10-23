// Rysunek 1.44 (szablony jakości): diagram Ishikawy (rozkład ości, przyczyny i podprzyczyny, miejsca dotknięcia),
// 5 × Dlaczego (przyczyna źródłowa), sprawdzanie zapisu, układ kartki (A3, PDCA, macierz 2×2, Kanban, pokrewieństwo),
// DXF (napisy diagramu, warstwa UKLAD), grupa Jakość i zestaw Jakość / Lean.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeArray } from '../../js/core/arrays.js';
import {
  DIAGRAM_FILLS, DIAGRAM_LIMITS, DIAGRAM_SIZES, FISHBONE_BONES, causesText, cleanDiagram, diagramLabel, diagramLayout, diagramTargetAt,
  newDiagram, parseCauses, textWidth, withDiagramSize, wrapText
} from '../../js/core/diagrams.js';
import { DRAWING_VERSION, cleanDrawing, elementBox, emptyDrawing, isBox, isElement, strokeBounds, translateStroke } from '../../js/core/drawing.js';
import { drawingToDxf, dxfText, parseDxf } from '../../js/core/dxf.js';
import {
  A3_SECTIONS, AFFINITY_FILLS, COLUMN_DEFAULTS, LAYOUT_KINDS, LAYOUT_LIMITS, MATRIX_DEFAULT, PDCA_LABELS, cleanLayout, layoutArea, pageLayoutGeometry
} from '../../js/core/page-layouts.js';
import { frameLayout } from '../../js/core/title-block.js';
import { ALL_ITEMS, PRESETS, QUALITY_ITEMS, TOOL_GROUPS, itemLabel } from '../../js/core/tool-ring.js';
import { scaleStroke, withStyleOf } from '../../js/core/transform.js';

const PAGE = [1600, 1100];
const near = (actual, expected, message, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} ≈ ${expected}`);
const fishbone = (bones, extra = {}) => cleanDiagram({ ...newDiagram('fishbone', { x: 100, y: 120 }), bones, problem: 'Wymiar poza tolerancją', ...extra }, ...PAGE);
const sixM = (patch = {}) => FISHBONE_BONES.map((name, index) => ({ name, causes: patch[index] ?? [] }));

test('rysunek 1.44: przyczyny z pola tekstowego – wiersz to przyczyna, „-”, „–”, „•” albo wcięcie – podprzyczyna; z powrotem do tekstu', () => {
  const text = 'Zużyte narzędzie\n- brak wymiany\n  za długa seria\n\nTemperatura wrzeciona\n• brak chłodzenia\n– zła emulsja';
  const causes = parseCauses(text);
  assert.deepEqual(causes, [
    { text: 'Zużyte narzędzie', subs: ['brak wymiany', 'za długa seria'] },
    { text: 'Temperatura wrzeciona', subs: ['brak chłodzenia', 'zła emulsja'] }
  ]);
  assert.equal(causesText(causes), 'Zużyte narzędzie\n- brak wymiany\n- za długa seria\nTemperatura wrzeciona\n- brak chłodzenia\n- zła emulsja');
  assert.deepEqual(parseCauses(causesText(causes)), causes, 'tekst i przyczyny – w obie strony');
  // Podprzyczyna bez przyczyny – zwykła przyczyna; puste wiersze i same myślniki – pomijane.
  assert.deepEqual(parseCauses('- osamotniona\n-\n   \nDruga'), [{ text: 'osamotniona', subs: [] }, { text: 'Druga', subs: [] }]);
  // Granice: 10 przyczyn, 5 podprzyczyn, 120 znaków.
  const many = Array.from({ length: 14 }, (_, index) => `P${index}`).join('\n');
  assert.equal(parseCauses(many).length, DIAGRAM_LIMITS.causes);
  const subs = `Główna\n${Array.from({ length: 8 }, (_, index) => `- s${index}`).join('\n')}`;
  assert.equal(parseCauses(subs)[0].subs.length, DIAGRAM_LIMITS.subs);
  assert.equal(parseCauses('x'.repeat(300))[0].text.length, DIAGRAM_LIMITS.text);
  assert.deepEqual(parseCauses(null), []);
});

test('rysunek 1.44: szacowana szerokość napisu i łamanie wierszy (słowa, Enter, za długie słowo)', () => {
  assert.equal(textWidth('abcd', 10), 4 * 10 * 0.56);
  assert.ok(textWidth('abcd', 10, true) > textWidth('abcd', 10));
  assert.deepEqual(wrapText('Rysy na obudowie', 10, 60), ['Rysy na', 'obudowie']);
  assert.deepEqual(wrapText('Jeden\nDwa', 10, 200), ['Jeden', 'Dwa']);
  assert.deepEqual(wrapText('abcdefghijkl', 10, 34), ['abcdef', 'ghijkl'], 'za długie słowo – na znakach');
});

test('rysunek 1.44: nowy diagram – Ishikawa z 6M bez przyczyn, 5 × Dlaczego z pięcioma pustymi polami; wymiary z rozkładu', () => {
  const fish = newDiagram('fishbone', { x: 10, y: 20 });
  assert.deepEqual(fish.bones.map((bone) => bone.name), FISHBONE_BONES);
  assert.ok(fish.bones.every((bone) => bone.causes.length === 0));
  assert.equal(fish.size, DIAGRAM_SIZES[1]);
  const layout = diagramLayout({ ...fish, x: 0, y: 0 });
  assert.equal(fish.width, Math.round(layout.width * 100) / 100);
  assert.equal(fish.height, Math.round(layout.height * 100) / 100);
  const whys = newDiagram('whys');
  assert.deepEqual(whys.answers, ['', '', '', '', '']);
  assert.equal(diagramLabel(fish), 'Diagram Ishikawy');
  assert.equal(diagramLabel(whys), '5 × Dlaczego');
  // Element pudełkowy: zaznaczenie, przesuwanie, granice.
  assert.ok(isElement(fish) && isBox(fish));
  assert.deepEqual(elementBox(fish), { x: 10, y: 20, width: fish.width, height: fish.height });
  const moved = translateStroke(fish, 30, -5);
  assert.deepEqual([moved.x, moved.y], [40, 15]);
  const bounds = strokeBounds(fish);
  assert.ok(bounds.minX <= 10 && bounds.maxX >= 10 + fish.width - 0.01);
});

test('rysunek 1.44: Ishikawa – ości na przemian u góry i u dołu, nazwy w ramkach, głowa po prawej, przyczyny przy ości', () => {
  const diagram = fishbone(sixM({ 1: [{ text: 'Zużyte narzędzie', subs: ['brak wymiany'] }, { text: 'Temperatura wrzeciona', subs: [] }], 4: [{ text: 'Suwmiarka bez kalibracji', subs: [] }] }));
  const layout = diagramLayout(diagram);
  const [a, b] = layout.spine;
  assert.equal(a.y, b.y, 'kręgosłup poziomo');
  const yc = a.y;
  // Ramki: 6 nazw (3 nad, 3 pod kręgosłupem) i głowa.
  const labels = layout.boxes.filter((box) => box.fill === 'label');
  assert.equal(labels.length, 6);
  assert.equal(labels.filter((box) => box.y + box.h < yc).length, 3);
  assert.equal(labels.filter((box) => box.y > yc).length, 3);
  const head = layout.boxes.find((box) => box.fill === 'head');
  assert.ok(labels.every((box) => box.x < head.x), 'głowa na prawo od ości');
  const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  assert.ok(layout.boxes.every((box, index) => layout.boxes.every((other, at) => at === index || !overlap(box, other))), 'ramki nie nachodzą na siebie');
  assert.ok(labels.every((box) => Math.abs(box.w - labels[0].w) < 0.01), 'ramki nazw jednakowe');
  assert.ok(head.y < yc && head.y + head.h > yc);
  assert.equal(layout.arrows.length, 1);
  assert.equal(layout.arrows[0].to.x, head.x, 'strzałka kręgosłupa do głowy');
  // Napisy: nazwy kategorii, przyczyny wyrównane do prawej przy ości.
  for (const name of FISHBONE_BONES) assert.ok(layout.texts.some((item) => item.text === name && item.bold), name);
  const cause = layout.texts.find((item) => item.text === 'Zużyte narzędzie');
  const sub = layout.texts.find((item) => item.text === 'brak wymiany');
  assert.equal(cause.align, 'right');
  assert.ok(sub.size < cause.size, 'podprzyczyna mniejsza');
  // Górna ość – napis nad kreską; dolna („Pomiar”) – pod kreską (z dala od podprzyczyn rosnących w stronę kręgosłupa).
  const lineAt = (text) => layout.lines.find(([p, q]) => p.y === q.y && Math.abs(q.x - (text.x + diagram.size * 0.8)) < 0.01);
  assert.ok(cause.y < lineAt(cause)[0].y, 'u góry – nad kreską');
  const measure = layout.texts.find((item) => item.text === 'Suwmiarka bez kalibracji');
  assert.ok(measure.y > lineAt(measure)[0].y, 'u dołu – pod kreską');
  // Wszystko w obrysie elementu.
  const inside = (point) => point.x >= diagram.x - 0.01 && point.x <= diagram.x + diagram.width + 0.01 && point.y >= diagram.y - 0.01 && point.y <= diagram.y + diagram.height + 0.01;
  assert.ok(layout.lines.flat().every(inside), 'linie w obrysie');
  assert.ok(layout.boxes.every((box) => inside(box) && inside({ x: box.x + box.w, y: box.y + box.h })), 'ramki w obrysie');
});

test('rysunek 1.44: Ishikawa – kreski przyczyn rosną z najdłuższym napisem (do 17 s), więcej wierszy – wyższe ości; nieparzysta liczba ości', () => {
  const s = DIAGRAM_SIZES[1];
  const short = fishbone(sixM({ 0: [{ text: 'Krótko', subs: [] }] }));
  const long = fishbone(sixM({ 0: [{ text: 'Zużyte narzędzie tokarskie', subs: [] }] }));
  const huge = fishbone(sixM({ 0: [{ text: 'x'.repeat(120), subs: [] }] }));
  assert.ok(long.width > short.width, 'dłuższy napis – szerszy diagram');
  const reach = (diagram) => {
    const [p, q] = diagramLayout(diagram).lines.find(([from, to]) => from.y === to.y);
    return q.x - p.x;
  };
  near(reach(short), s * 8.5, 'najkrócej 8,5 s');
  assert.ok(reach(long) > s * 8.5 && reach(long) < s * 17);
  near(reach(huge), s * 17, 'najdłużej 17 s – dalej płótno zwęża napis');
  // Podprzyczyna – kreska o połowę krótsza, więc długi napis podprzyczyny wydłuża kreski bardziej.
  const subbed = fishbone(sixM({ 0: [{ text: 'A', subs: ['brak wymiany'] }] }));
  assert.ok(reach(subbed) > s * 8.5);
  near(reach(subbed), (textWidth('brak wymiany', s * 0.78) + s * 1.2) * 2, 'kreska z podprzyczyny');
  // Więcej wierszy na jednej ości – wyższy diagram.
  const rows = fishbone(sixM({ 2: [1, 2, 3, 4, 5].map((n) => ({ text: `P${n}`, subs: [] })) }));
  assert.ok(rows.height > short.height);
  // Trzy ości: dwie u góry, jedna u dołu.
  const three = fishbone([{ name: 'A', causes: [] }, { name: 'B', causes: [] }, { name: 'C', causes: [] }]);
  const layout = diagramLayout(three);
  const yc = layout.spine[0].y;
  const labels = layout.boxes.filter((box) => box.fill === 'label');
  assert.equal(labels.filter((box) => box.y < yc).length, 2);
  assert.equal(labels.filter((box) => box.y > yc).length, 1);
});

test('rysunek 1.44: Ishikawa – dotknięcie głowy, ramki nazwy i pasa wzdłuż ości; sąsiednie ości się nie zasłaniają', () => {
  const diagram = fishbone(sixM({ 1: [{ text: 'Zużyte narzędzie', subs: [] }], 4: [{ text: 'Suwmiarka', subs: [] }] }));
  const layout = diagramLayout(diagram);
  const head = layout.targets.find((target) => target.id === 'problem');
  assert.equal(diagramTargetAt(diagram, { x: head.x + head.w / 2, y: head.y + head.h / 2 }), 'problem');
  // Ramka nazwy „Pomiar” i miejsce tuż przy ości – ta sama ość.
  const label = layout.boxes.filter((box) => box.fill === 'label')[4];
  assert.equal(diagramTargetAt(diagram, { x: label.x + label.w / 2, y: label.y + label.h / 2 }), 'bone-4');
  const yc = layout.spine[0].y;
  const bones = layout.lines.filter(([p, q]) => p.y === yc && q.y !== yc);
  assert.equal(bones.length, 6);
  for (const [index, [from, to]] of bones.entries()) {
    // Punkt w połowie ości, trochę w lewo – ta ość, nie sąsiednia.
    const mid = { x: (from.x + to.x) / 2 - diagram.size, y: (from.y + to.y) / 2 };
    assert.equal(diagramTargetAt(diagram, mid), `bone-${index}`, `ość ${index}`);
  }
  // Na prawo od ości (w pasie poprzedniej kolumny już nie) i poza diagramem – nic albo inna ość.
  const [from, to] = bones[1];
  const right = { x: (from.x + to.x) / 2 + diagram.size * 2, y: (from.y + to.y) / 2 };
  assert.notEqual(diagramTargetAt(diagram, right), 'bone-1');
  assert.equal(diagramTargetAt(diagram, { x: diagram.x - 50, y: diagram.y - 50 }), null);
  // Punkt testu e2e (60% szerokości, połowa wysokości pierwszego miejsca ości) – w pasie ości.
  const band = layout.targets.find((target) => target.id === 'bone-4');
  assert.equal(diagramTargetAt(diagram, { x: band.x + band.w * 0.6, y: band.y + band.h * 0.5 }), 'bone-4');
});

test('rysunek 1.44: 5 × Dlaczego – pola jedno pod drugim ze strzałkami, ostatnie – przyczyna źródłowa; długi tekst – wyższe pole', () => {
  const diagram = cleanDiagram({ ...newDiagram('whys', { x: 50, y: 60 }), problem: 'Rysy na obudowie', answers: ['Ocierają się', 'Brak przekładek', ''] }, ...PAGE);
  const layout = diagramLayout(diagram);
  assert.equal(layout.boxes.length, 4);
  assert.equal(layout.arrows.length, 3);
  assert.deepEqual(layout.boxes.map((box) => box.fill), ['head', 'box', 'box', 'root']);
  for (let index = 1; index < layout.boxes.length; index += 1) assert.ok(layout.boxes[index].y > layout.boxes[index - 1].y + layout.boxes[index - 1].h, 'jedno pod drugim');
  const labels = layout.texts.filter((item) => item.muted).map((item) => item.text);
  assert.deepEqual(labels, ['Problem', 'Dlaczego? 1', 'Dlaczego? 2', 'Dlaczego? 3 – przyczyna źródłowa']);
  assert.ok(layout.texts.some((item) => item.text === '…'), 'puste pole – wielokropek');
  assert.deepEqual(layout.targets.map((target) => target.id), ['problem', 'answer-0', 'answer-1', 'answer-2']);
  const second = layout.targets[2];
  assert.equal(diagramTargetAt(diagram, { x: second.x + 5, y: second.y + 5 }), 'answer-1');
  // Jedna odpowiedź – bez wyróżnienia przyczyny źródłowej.
  const one = diagramLayout(cleanDiagram({ ...diagram, answers: ['Tylko jedna'] }, ...PAGE));
  assert.deepEqual(one.boxes.map((box) => box.fill), ['head', 'box']);
  // Długi tekst – więcej wierszy, wyższe pole i wyższy diagram.
  const long = cleanDiagram({ ...diagram, answers: ['Bardzo długa odpowiedź, która na pewno nie zmieści się w jednym wierszu pola diagramu', 'B', 'C'] }, ...PAGE);
  assert.ok(long.height > diagram.height);
  assert.equal(diagramLayout(diagram).width, diagram.width);
});

test('rysunek 1.44: sprawdzanie zapisu diagramu – zły rodzaj, kolor, brak ości; granice tekstów, liczby ości i odpowiedzi, wielkość', () => {
  const base = newDiagram('fishbone', { x: 100, y: 100 });
  assert.equal(cleanDiagram({ ...base, kind: 'pareto' }, ...PAGE), null);
  assert.equal(cleanDiagram({ ...base, color: 'red' }, ...PAGE), null);
  assert.equal(cleanDiagram({ ...base, x: 'a' }, ...PAGE), null);
  assert.equal(cleanDiagram({ ...base, bones: [] }, ...PAGE), null, 'Ishikawa bez ości');
  assert.equal(cleanDiagram(null, ...PAGE), null);
  const many = cleanDiagram({ ...base, bones: Array.from({ length: 12 }, (_, index) => ({ name: `K${index}`, causes: [] })) }, ...PAGE);
  assert.equal(many.bones.length, DIAGRAM_LIMITS.bones);
  const messy = cleanDiagram({
    ...base, color: '#AA0000', size: 500, x: -99999, problem: 'p'.repeat(400),
    bones: [{ name: 'n'.repeat(80), causes: [{ text: '' }, { text: 'Dobra', subs: ['', 'sub', 7] }, 'zła'] }, 'nie ość']
  }, ...PAGE);
  assert.equal(messy.color, '#aa0000');
  assert.equal(messy.size, 60);
  assert.equal(messy.x, -PAGE[0]);
  assert.equal(messy.problem.length, DIAGRAM_LIMITS.problem);
  assert.equal(messy.bones.length, 1);
  assert.equal(messy.bones[0].name.length, DIAGRAM_LIMITS.name);
  assert.deepEqual(messy.bones[0].causes, [{ text: 'Dobra', subs: ['sub'] }]);
  const whys = cleanDiagram({ ...newDiagram('whys'), answers: Array.from({ length: 10 }, (_, index) => `O${index}`) }, ...PAGE);
  assert.equal(whys.answers.length, DIAGRAM_LIMITS.answers);
  assert.equal(cleanDiagram({ ...newDiagram('whys'), answers: 'tekst' }, ...PAGE).answers.length, 0);
  // Wymiary zawsze z rozkładu (nie z zapisu).
  assert.deepEqual(cleanDiagram({ ...base, width: 5, height: 5 }, ...PAGE).width, withDiagramSize(base).width);
});

test('rysunek 1.44: diagram w rysunku – zapis (format 16), kolor jak w „Styl jak…”, skala tylko przesuwa, bez szyku', () => {
  assert.equal(DRAWING_VERSION, 16);
  const diagram = newDiagram('fishbone', { x: 200, y: 200 });
  const drawing = cleanDrawing({ ...emptyDrawing(), strokes: [diagram, { ...diagram, kind: 'zły' }] });
  assert.equal(drawing.strokes.length, 1);
  assert.equal(drawing.strokes[0].tool, 'diagram');
  assert.deepEqual(drawing.strokes[0].bones.map((bone) => bone.name), FISHBONE_BONES);
  const styled = withStyleOf(diagram, { tool: 'pen', color: '#0040DD', points: [0, 0, 2, 10, 10, 2] });
  assert.equal(styled.color, '#0040dd');
  // Stoi prosto: skala przesuwa środek, wielkość i wymiary bez zmian.
  const scaled = scaleStroke(diagram, 0, 0, 2);
  assert.deepEqual([scaled.size, scaled.width, scaled.height], [diagram.size, diagram.width, diagram.height]);
  near(scaled.x + scaled.width / 2, (diagram.x + diagram.width / 2) * 2, 'środek x', 0.1);
  near(scaled.y + scaled.height / 2, (diagram.y + diagram.height / 2) * 2, 'środek y', 0.1);
  assert.equal(makeArray([diagram], { kind: 'linear', count: 3, dx: 100, dy: 0 }, 50), null, 'diagram nie wchodzi do szyku');
});

test('rysunek 1.44: układ kartki – sprawdzanie: rodzaje, tytuł A3, macierz z sześcioma nazwami, kolumny Kanban i pokrewieństwa 2–6', () => {
  assert.deepEqual(LAYOUT_KINDS, ['a3', 'pdca', 'matrix', 'kanban', 'affinity']);
  assert.equal(cleanLayout(null), null);
  assert.equal(cleanLayout({ kind: 'gantt' }), null);
  assert.deepEqual(cleanLayout({ kind: 'a3', title: '  Rysy   na obudowie ', labels: ['x'] }), { kind: 'a3', title: 'Rysy na obudowie' });
  assert.deepEqual(cleanLayout({ kind: 'a3', title: '   ' }), { kind: 'a3' });
  assert.equal(cleanLayout({ kind: 'a3', title: 't'.repeat(200) }).title.length, LAYOUT_LIMITS.title);
  assert.deepEqual(cleanLayout({ kind: 'pdca', title: 'x' }), { kind: 'pdca' });
  assert.deepEqual(cleanLayout({ kind: 'matrix' }).labels, [...MATRIX_DEFAULT]);
  assert.deepEqual(cleanLayout({ kind: 'matrix', labels: ['Ryzyko', '', 'A'] }).labels, ['Ryzyko', MATRIX_DEFAULT[1], 'A', ...MATRIX_DEFAULT.slice(3)]);
  assert.deepEqual(cleanLayout({ kind: 'kanban', labels: ['Jedna'] }).labels, [...COLUMN_DEFAULTS.kanban], 'jedna kolumna – domyślne');
  assert.deepEqual(cleanLayout({ kind: 'kanban', labels: ['A', '', 'B'] }).labels, ['A', 'B']);
  assert.equal(cleanLayout({ kind: 'affinity', labels: Array.from({ length: 9 }, (_, index) => `G${index}`) }).labels.length, LAYOUT_LIMITS.columns);
  assert.deepEqual(cleanLayout({ kind: 'affinity' }).labels, [...COLUMN_DEFAULTS.affinity]);
  assert.equal(cleanLayout({ kind: 'kanban', labels: ['k'.repeat(90), 'B'] }).labels[0].length, LAYOUT_LIMITS.label);
  // W rysunku: kartka bez zdjęcia – zostaje; na zdjęciu – nie ma układu.
  assert.deepEqual(cleanDrawing({ ...emptyDrawing(), layout: { kind: 'pdca' } }).layout, { kind: 'pdca' });
  assert.equal(cleanDrawing({ ...emptyDrawing(), layout: { kind: 'zły' } }).layout, undefined);
  const photo = emptyDrawing({ photo: { type: 'image/jpeg', width: 800, height: 600, bytes: new Uint8Array([1, 2, 3]).buffer } });
  assert.equal(cleanDrawing({ ...photo, layout: { kind: 'pdca' } }).layout, undefined);
});

test('rysunek 1.44: miejsce układu – kartka z marginesami (z lewej miejsce na spiralę), przy ramce – wnętrze ramki nad tabliczką', () => {
  const drawing = emptyDrawing();
  assert.deepEqual(layoutArea(drawing), { x: 70, y: 30, w: drawing.width - 100, h: drawing.height - 60 });
  const framed = { ...drawing, frame: { format: 'A4' } };
  const { border, block } = frameLayout(framed.frame, framed.width, framed.height, framed.scale);
  const area = layoutArea(framed);
  assert.ok(area.x > border.x && area.y > border.y);
  assert.ok(area.x + area.w < border.x + border.w);
  assert.ok(area.y + area.h < block.y, 'nad tabliczką');
});

test('rysunek 1.44: rysunek układu – A3 (tytuł i 7 pól), PDCA (koło, 4 strzałki), macierz (ćwiartki, osie, obrócona nazwa), kolumny', () => {
  const drawing = emptyDrawing();
  const area = layoutArea(drawing);
  const a3 = pageLayoutGeometry(cleanLayout({ kind: 'a3', title: 'Rysy' }), drawing);
  assert.equal(a3.boxes.length, 1 + A3_SECTIONS.length);
  assert.equal(a3.texts[0].text, 'Raport A3: Rysy');
  assert.deepEqual(a3.texts.slice(1).map((item) => item.text), [...A3_SECTIONS]);
  assert.ok(a3.boxes.every((box) => box.x >= area.x - 0.01 && box.x + box.w <= area.x + area.w + 0.01 && box.y + box.h <= area.y + area.h + 0.01), 'pola w miejscu układu');
  assert.equal(pageLayoutGeometry({ kind: 'a3' }, drawing).texts[0].text, 'Raport A3');

  const pdca = pageLayoutGeometry({ kind: 'pdca' }, drawing);
  assert.equal(pdca.circles.length, 1);
  assert.equal(pdca.lines.length, 2);
  assert.equal(pdca.arrows.length, 4);
  assert.deepEqual(pdca.texts.map((item) => item.text), [...PDCA_LABELS]);
  const [circle] = pdca.circles;
  const plan = pdca.texts[0];
  assert.ok(plan.x > circle.x && plan.y < circle.y, 'P – prawa górna ćwiartka');

  const matrix = pageLayoutGeometry(cleanLayout({ kind: 'matrix' }), drawing);
  assert.equal(matrix.boxes.length, 4);
  assert.equal(matrix.arrows.length, 2);
  assert.equal(matrix.texts.length, 6);
  const vertical = matrix.texts.find((item) => item.text === `${MATRIX_DEFAULT[0]} →`);
  assert.equal(vertical.rotate, -Math.PI / 2);
  assert.ok(matrix.texts.some((item) => item.text === 'Szybkie korzyści'));

  const kanban = pageLayoutGeometry(cleanLayout({ kind: 'kanban', labels: ['A', 'B', 'C', 'D'] }), drawing);
  assert.equal(kanban.boxes.length, 8, 'kolumna i nagłówek');
  assert.deepEqual(kanban.texts.map((item) => item.text), ['A', 'B', 'C', 'D']);
  assert.ok(kanban.boxes.filter((box) => box.strong).every((box) => box.fill === '#f2f2f7'));
  const affinity = pageLayoutGeometry(cleanLayout({ kind: 'affinity' }), drawing);
  assert.deepEqual(affinity.boxes.filter((box) => box.strong).map((box) => box.fill), AFFINITY_FILLS.slice(0, 4));
  // Kolumny – całą szerokość miejsca, z odstępami.
  const columns = kanban.boxes.filter((box) => !box.strong);
  assert.ok(Math.abs(columns[0].x - area.x) < 0.01 && Math.abs(columns.at(-1).x + columns.at(-1).w - (area.x + area.w)) < 0.01);
});

test('rysunek 1.44: DXF – diagram liniami i napisami, układ kartki na warstwie UKLAD (obok ramki RAMKA)', () => {
  const diagram = fishbone(sixM({ 1: [{ text: 'Zużyte narzędzie', subs: ['brak wymiany'] }] }));
  const drawing = cleanDrawing({ ...emptyDrawing(), strokes: [diagram], layout: { kind: 'kanban', labels: ['Pomysły', 'W toku'] }, frame: { format: 'A4' } });
  const parsed = parseDxf(drawingToDxf(drawing).text);
  const texts = parsed.entities.filter((item) => item.type === 'TEXT').map((item) => dxfText(item.first(1)));
  for (const expected of ['Człowiek', 'Pomiar', 'Zużyte narzędzie', 'brak wymiany', 'Pomysły', 'W toku']) assert.ok(texts.includes(expected), `${expected}: ${texts.join(' | ')}`);
  assert.ok(texts.some((text) => text.startsWith('Wymiar')), 'problem w głowie');
  assert.ok(parsed.layers.has('UKLAD'));
  assert.ok(parsed.layers.has('RAMKA'));
  const onLayout = parsed.entities.filter((item) => item.layer === 'UKLAD');
  assert.ok(onLayout.some((item) => item.type === 'POLYLINE'), 'kolumny – zamknięte polilinie');
  assert.ok(onLayout.filter((item) => item.type === 'TEXT').length === 2);
  assert.ok(parsed.entities.filter((item) => item.type === 'LINE' && item.layer !== 'UKLAD' && item.layer !== 'RAMKA').length >= 6, 'ości i kreski diagramu');
  // Bez układu – bez warstwy UKLAD; PDCA – okrąg jako polilinia.
  assert.equal(parseDxf(drawingToDxf(cleanDrawing({ ...emptyDrawing(), strokes: [diagram] })).text).layers.has('UKLAD'), false);
  const pdca = parseDxf(drawingToDxf(cleanDrawing({ ...emptyDrawing(), layout: { kind: 'pdca' } })).text);
  assert.ok(pdca.entities.some((item) => item.layer === 'UKLAD' && item.type === 'POLYLINE'));
  // Macierz – nazwa osi pionowej obrócona o 90°.
  const matrix = parseDxf(drawingToDxf(cleanDrawing({ ...emptyDrawing(), layout: { kind: 'matrix' } })).text);
  const axis = matrix.entities.find((item) => item.type === 'TEXT' && dxfText(item.first(1)).startsWith('Wpływ'));
  assert.equal(axis.number(50), 90);
});

test('rysunek 1.44: grupa Jakość (Ishikawa, 5 × Dlaczego, SIPOC, Układ) i zestaw „Jakość / Lean” z narzędziami z grup', () => {
  const group = TOOL_GROUPS.find((item) => item.id === 'quality');
  assert.equal(group.label, 'Jakość');
  assert.deepEqual(group.items, [...QUALITY_ITEMS]);
  assert.deepEqual(QUALITY_ITEMS.map(itemLabel), ['Diagram Ishikawy', '5 × Dlaczego', 'SIPOC', 'Układ kartki']);
  const lean = PRESETS.find((preset) => preset.id === 'lean');
  assert.equal(lean.label, 'Jakość / Lean');
  assert.ok(lean.items.every((item) => ALL_ITEMS.includes(item)), lean.items.join());
  assert.ok(QUALITY_ITEMS.every((item) => lean.items.includes(item)));
  assert.ok(Object.keys(DIAGRAM_FILLS).length === 4);
});
