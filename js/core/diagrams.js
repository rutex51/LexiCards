// Diagramy jakości (od 1.44) – bez przeglądarki: element { tool: 'diagram', kind, x, y, size, color, width, height, … }
// z rozkładem liczonym tutaj (linie, strzałki, ramki i napisy w punktach strony) – ten sam dla płótna, granic
// zaznaczenia i pliku DXF. Napisy nie są mierzone czcionką: długość wiersza – z przeciętnej szerokości znaku,
// a za długi wiersz płótno zwęża (fitText).
//
// Ishikawa (rybia ość): { kind: 'fishbone', problem, bones: [{ name, causes: [{ text, subs: [tekst] }] }] } – głowa
//   (skutek) po prawej, ości kategorii u góry i u dołu kręgosłupa, przyczyny – poziome kreski przy ości (napis od strony
//   nazwy kategorii: u góry nad kreską, u dołu pod nią), podprzyczyny – mniejsza ość przy przyczynie i jej kreski.
//   Długość kresek rośnie z najdłuższym napisem (do dwukrotności), dłuższy napis płótno zwęża.
// 5 × Dlaczego: { kind: 'whys', problem, answers: [tekst] } – pola jedno pod drugim ze strzałkami; ostatnie – przyczyna
//   źródłowa (wyróżnione).
// Od 1.45 (schematy procesów):
// Symbol VSM: { kind: 'vsm', symbol, title, rows: [tekst] } – proces (nazwa i dane), zapas (trójkąt z I), dostawca / klient
//   (fabryka), supermarket, strzałka push, kaizen, operator, transport; napisy – w symbolu albo pod nim.
// Oś czasu VSM: { kind: 'timeline', waitUnit, workUnit, dayHours, steps: [{ wait, work }] } – schodkowa linia (oczekiwanie
//   u góry, praca u dołu) i podsumowanie: czas przejścia (w jednostce oczekiwania), czas wartości dodanej (w jednostce pracy)
//   i jej udział (PCE); dzień – dayHours godzin.
// Legenda wad (koncentracja wad): { kind: 'defects', title, items: [{ mark, color, name }] } – liczy punkty kartki
//   o tym znaczniku i kolorze (rozkład dostaje kreski kartki: diagramLayout(element, { strokes })).

import { pointMark, pointMarkGeometry } from './shapes.js';

export const DIAGRAM_KINDS = Object.freeze(['fishbone', 'whys', 'vsm', 'timeline', 'defects']);
export const DIAGRAM_LABELS = Object.freeze({ fishbone: 'Diagram Ishikawy', whys: '5 × Dlaczego', vsm: 'Symbol VSM', timeline: 'Oś czasu VSM', defects: 'Legenda wad' });
/** Symbole mapy strumienia wartości (od 1.45). */
export const VSM_SYMBOLS = Object.freeze(['process', 'inventory', 'supplier', 'supermarket', 'push', 'kaizen', 'operator', 'truck']);
export const VSM_LABELS = Object.freeze({
  process: 'Proces', inventory: 'Zapas', supplier: 'Dostawca / klient', supermarket: 'Supermarket', push: 'Strzałka push', kaizen: 'Kaizen',
  operator: 'Operator', truck: 'Transport'
});
/** Napisy nowego symbolu: nazwa i wiersze (proces – miejsca na dane). */
export const VSM_DEFAULTS = Object.freeze({
  process: Object.freeze({ title: 'Proces', rows: Object.freeze(['C/T =', 'C/O =', 'Dostępność =']) }),
  inventory: Object.freeze({ title: '', rows: Object.freeze([]) }), supplier: Object.freeze({ title: 'Dostawca', rows: Object.freeze([]) }),
  supermarket: Object.freeze({ title: '', rows: Object.freeze([]) }), push: Object.freeze({ title: '', rows: Object.freeze([]) }),
  kaizen: Object.freeze({ title: 'Kaizen', rows: Object.freeze([]) }), operator: Object.freeze({ title: '', rows: Object.freeze([]) }),
  truck: Object.freeze({ title: '', rows: Object.freeze([]) })
});
/** Jednostki osi czasu VSM i ich długość w sekundach (dzień – z liczby godzin dnia). */
export const TIMELINE_UNITS = Object.freeze(['s', 'min', 'h', 'dni']);
const unitSeconds = (unit, dayHours) => ({ s: 1, min: 60, h: 3600, dni: dayHours * 3600 }[unit] ?? 1);
/** Znaczniki wad – jak znaczniki narzędzia Punkt (shapes.js POINT_MARKS). */
const DEFECT_MARKS = ['center', 'dot', 'cross', 'plus'];
/** Kategorie 6M – ości nowego diagramu Ishikawy. */
export const FISHBONE_BONES = Object.freeze(['Człowiek', 'Maszyna', 'Metoda', 'Materiał', 'Pomiar', 'Środowisko']);
/** Wielkości napisów diagramu (jednostki strony; kratka ma 44): mała, średnia, duża, bardzo duża. */
export const DIAGRAM_SIZES = Object.freeze([16, 20, 26, 32]);
export const DIAGRAM_LIMITS = Object.freeze({
  bones: 8, causes: 10, subs: 5, answers: 7, text: 120, problem: 200, name: 40, rows: 6, steps: 10, items: 8, unit: 12, value: 1e6
});
/** Kolory wypełnień: głowa i przyczyna źródłowa – jasny pomarańcz, nazwy kategorii i pola – jasny szary; od 1.45 kaizen – żółty, ink – kolor diagramu. */
export const DIAGRAM_FILLS = Object.freeze({ head: '#fff1e0', label: '#f2f2f7', root: '#ffe2c2', box: '#ffffff', burst: '#fff3b0' });

const HEX = /^#[0-9a-f]{6}$/i;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value * 100) / 100;
const clip = (value, max) => (typeof value === 'string' ? value.replace(/[\t\r]/g, ' ').trim().slice(0, max) : '');
/** Przeciętna szerokość znaku względem wielkości czcionki (pogrubiona – szersza). */
const CHAR = 0.56;
const CHAR_BOLD = 0.6;

/** Szacowana szerokość napisu (jednostki strony). */
export const textWidth = (text, size, bold = false) => [...text].length * size * (bold ? CHAR_BOLD : CHAR);

/** Wiersze tekstu najwyżej `width` szerokie (szacunkowo): Enter – nowy wiersz, łamanie na słowach, za długie słowo – na znakach. */
export function wrapText(text, size, width, bold = false) {
  const most = Math.max(1, Math.floor(width / (size * (bold ? CHAR_BOLD : CHAR))));
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let piece = word;
      while ([...piece].length > most) {
        if (current) {
          lines.push(current);
          current = '';
        }
        lines.push([...piece].slice(0, most).join(''));
        piece = [...piece].slice(most).join('');
      }
      const candidate = current ? `${current} ${piece}` : piece;
      if ([...candidate].length > most) {
        lines.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * Przyczyny z pola tekstowego okna: każdy wiersz – przyczyna; wiersz zaczęty od „-”, „–”, „•” albo odstępu –
 * podprzyczyna poprzedniej przyczyny. Puste wiersze pomijane.
 */
export function parseCauses(text) {
  const causes = [];
  for (const raw of String(text ?? '').split('\n')) {
    if (!raw.trim()) continue;
    const sub = /^\s+\S|^\s*[-–•]/.test(raw);
    const value = clip(raw.replace(/^\s*[-–•]\s*/, ''), DIAGRAM_LIMITS.text);
    if (!value) continue;
    if (sub && causes.length > 0) {
      const parent = causes.at(-1);
      if (parent.subs.length < DIAGRAM_LIMITS.subs) parent.subs.push(value);
    } else if (causes.length < DIAGRAM_LIMITS.causes) {
      causes.push({ text: value, subs: [] });
    }
  }
  return causes;
}
/** Przyczyny jako tekst pola okna (podprzyczyny od „- ”). */
export const causesText = (causes) => causes.map((cause) => [cause.text, ...cause.subs.map((sub) => `- ${sub}`)].join('\n')).join('\n');

/** Nowy diagram rodzaju `kind` w punkcie (x, y): Ishikawa z kategoriami 6M, 5 × Dlaczego z pięcioma pustymi odpowiedziami. */
export function newDiagram(kind, { x = 0, y = 0, size = DIAGRAM_SIZES[1], color = '#1d1d1f', symbol = 'process' } = {}) {
  const base = { tool: 'diagram', kind, x, y, size, color };
  const vsm = VSM_DEFAULTS[symbol] ?? VSM_DEFAULTS.process;
  const data = {
    whys: () => ({ problem: '', answers: ['', '', '', '', ''] }),
    vsm: () => ({ symbol: VSM_SYMBOLS.includes(symbol) ? symbol : 'process', title: vsm.title, rows: [...vsm.rows] }),
    timeline: () => ({ waitUnit: 'dni', workUnit: 's', dayHours: 24, steps: [{ wait: 0, work: 0 }, { wait: 0, work: 0 }, { wait: 0, work: 0 }] }),
    defects: () => ({ title: 'Wady', items: [{ mark: 'cross', color: '#d70015', name: 'Rysa' }, { mark: 'dot', color: '#0040dd', name: 'Wgniecenie' }] })
  }[kind]?.() ?? { problem: '', bones: FISHBONE_BONES.map((name) => ({ name, causes: [] })) };
  return withDiagramSize({ ...base, ...data });
}

/** Diagram z szerokością i wysokością z rozkładu. */
export function withDiagramSize(element) {
  const { width, height } = diagramLayout({ ...element, x: 0, y: 0 });
  return { ...element, width: round(width), height: round(height) };
}

/** Sprawdzony diagram (zapis, kopia zapasowa) albo null. */
export function cleanDiagram(raw, pageWidth, pageHeight) {
  if (!raw || raw.tool !== 'diagram' || !DIAGRAM_KINDS.includes(raw.kind) || !HEX.test(raw.color ?? '') || ![raw.x, raw.y, raw.size].every(finite)) return null;
  const element = {
    tool: 'diagram', kind: raw.kind, color: raw.color.toLowerCase(),
    x: clamp(raw.x, -pageWidth, pageWidth * 2), y: clamp(raw.y, -pageHeight, pageHeight * 2), size: clamp(raw.size, 10, 60)
  };
  const number = (value) => (finite(value) ? round(clamp(value, 0, DIAGRAM_LIMITS.value)) : 0);
  if (raw.kind === 'vsm') {
    element.symbol = VSM_SYMBOLS.includes(raw.symbol) ? raw.symbol : 'process';
    element.title = clip(raw.title, DIAGRAM_LIMITS.name);
    element.rows = (Array.isArray(raw.rows) ? raw.rows : []).map((row) => clip(row, DIAGRAM_LIMITS.name)).filter(Boolean).slice(0, DIAGRAM_LIMITS.rows);
    return withDiagramSize(element);
  }
  if (raw.kind === 'timeline') {
    element.waitUnit = TIMELINE_UNITS.includes(raw.waitUnit) ? raw.waitUnit : 'dni';
    element.workUnit = TIMELINE_UNITS.includes(raw.workUnit) ? raw.workUnit : 's';
    element.dayHours = finite(raw.dayHours) ? clamp(round(raw.dayHours), 1, 24) : 24;
    const steps = (Array.isArray(raw.steps) ? raw.steps : []).filter((step) => step && typeof step === 'object').slice(0, DIAGRAM_LIMITS.steps)
      .map((step) => ({ wait: number(step.wait), work: number(step.work) }));
    element.steps = steps.length > 0 ? steps : [{ wait: 0, work: 0 }];
    return withDiagramSize(element);
  }
  if (raw.kind === 'defects') {
    element.title = clip(raw.title, DIAGRAM_LIMITS.name);
    element.items = (Array.isArray(raw.items) ? raw.items : []).filter((item) => item && DEFECT_MARKS.includes(item.mark) && HEX.test(item.color ?? ''))
      .slice(0, DIAGRAM_LIMITS.items).map((item) => ({ mark: item.mark, color: item.color.toLowerCase(), name: clip(item.name, DIAGRAM_LIMITS.name) }));
    if (element.items.length === 0) return null;
    return withDiagramSize(element);
  }
  element.problem = clip(raw.problem, DIAGRAM_LIMITS.problem);
  if (raw.kind === 'whys') {
    const answers = Array.isArray(raw.answers) ? raw.answers.slice(0, DIAGRAM_LIMITS.answers).map((answer) => clip(answer, DIAGRAM_LIMITS.problem)) : [];
    element.answers = answers;
  } else {
    const bones = (Array.isArray(raw.bones) ? raw.bones : []).filter((bone) => bone && typeof bone === 'object').slice(0, DIAGRAM_LIMITS.bones).map((bone) => ({
      name: clip(bone.name, DIAGRAM_LIMITS.name),
      causes: (Array.isArray(bone.causes) ? bone.causes : []).filter((cause) => clip(cause?.text, DIAGRAM_LIMITS.text)).slice(0, DIAGRAM_LIMITS.causes).map((cause) => ({
        text: clip(cause.text, DIAGRAM_LIMITS.text),
        subs: (Array.isArray(cause.subs) ? cause.subs : []).map((sub) => clip(sub, DIAGRAM_LIMITS.text)).filter(Boolean).slice(0, DIAGRAM_LIMITS.subs)
      }))
    }));
    if (bones.length === 0) return null;
    element.bones = bones;
  }
  return withDiagramSize(element);
}

/** Nazwa diagramu przy zaznaczeniu (symbol VSM – nazwa symbolu). */
export const diagramLabel = (element) => (element.kind === 'vsm' ? `VSM: ${VSM_LABELS[element.symbol] ?? 'symbol'}` : DIAGRAM_LABELS[element.kind] ?? 'Diagram');

/**
 * Rozkład diagramu w punktach strony: { width, height, lines: [[a, b]] – linie, spine – grubsza linia (kręgosłup),
 * arrows: [{ from, to }] – strzałki z grotem w `to`, boxes: [{ x, y, w, h, fill }], texts: [{ x, y – linia bazowa, text,
 * size, align: 'left' | 'center' | 'right', bold, width – najwięcej }], targets: [{ id, x, y, w, h, slant? }] – miejsca
 * dotknięcia (okno otwiera się przy tym polu; slant – pas wzdłuż ukośnej ości, jedno id może mieć kilka miejsc) }.
 */
export function diagramLayout(element, context = {}) {
  if (element.kind === 'vsm') return vsmLayout(element);
  if (element.kind === 'timeline') return timelineLayout(element);
  if (element.kind === 'defects') return defectsLayout(element, context.strokes ?? null);
  return element.kind === 'whys' ? whysLayout(element) : fishboneLayout(element);
}

function fishboneLayout(element) {
  const s = element.size;
  const { x: ox, y: oy } = element;
  const bones = element.bones?.length ? element.bones : FISHBONE_BONES.map((name) => ({ name, causes: [] }));
  const rowGap = s * 1.7;
  const k = 0.55;
  // Długość kreski przyczyny: najdłuższy napis przyczyny (0,9 s) albo podprzyczyny (0,78 s, kreska – pół długości).
  const causes = bones.flatMap((bone) => bone.causes);
  const L = clamp(Math.max(
    ...causes.map((cause) => textWidth(cause.text, s * 0.9) + s * 1.4),
    ...causes.flatMap((cause) => cause.subs.map((sub) => (textWidth(sub, s * 0.78) + s * 1.2) * 2))
  ), s * 8.5, s * 17);
  const labelH = s * 1.9;
  const margin = s * 0.5;
  const rowsOf = (bone) => bone.causes.reduce((sum, cause) => sum + 1 + cause.subs.length, 0);
  const R = Math.max(2, ...bones.map(rowsOf));
  const H = (R + 0.6) * rowGap;
  // Sąsiednie ości są równoległe – kreski przyczyn (z podprzyczynami do 1,05 L) mieszczą się między nimi na każdej
  // wysokości; pierwsza ość – z miejscem na kreski przy jej końcu.
  const colW = L * 1.08 + s * 1.5;
  const top = Math.ceil(bones.length / 2);
  const columns = top;
  const firstX = margin + k * H + L * 1.05 + s * 0.5;
  const yc = margin + labelH + s * 0.4 + H;
  const headX = firstX + (columns - 1) * colW + s;
  const headW = s * 8;
  const headH = s * 4.6;
  const width = headX + headW + margin;
  const height = yc + H + s * 0.4 + labelH + margin;
  // Ramki nazw – jednakowe, na najdłuższą nazwę (najwyżej 0,9 długości kreski).
  const labelW = Math.min(L * 0.9, Math.max(s * 7.6, ...bones.map((bone) => textWidth(bone.name || 'Kategoria 8', s, true) + s * 1.6)));
  const P = (x, y) => ({ x: ox + x, y: oy + y });
  const lines = [];
  const texts = [];
  const boxes = [];
  const targets = [];
  bones.forEach((bone, index) => {
    const up = index < top;
    const column = up ? index : index - top;
    const sign = up ? -1 : 1;
    const bx = firstX + column * colW;
    const outer = bx - k * H;
    lines.push([P(bx, yc), P(outer, yc + sign * H)]);
    // Nazwa kategorii – ramka na końcu ości.
    const labelY = up ? yc - H - s * 0.2 - labelH : yc + H + s * 0.2;
    boxes.push({ ...P(outer - labelW / 2, labelY), w: labelW, h: labelH, fill: 'label' });
    texts.push({ ...P(outer, labelY + labelH * 0.66), text: bone.name || `Kategoria ${index + 1}`, size: s, align: 'center', bold: true, width: labelW - s * 0.6 });
    let row = 0;
    const rowY = (r) => yc + sign * (H - (r + 0.8) * rowGap);
    const onBone = (y) => bx - k * Math.abs(y - yc);
    // Linia bazowa napisu: u góry – nad kreską, u dołu – pod kreską (od strony nazwy, z dala od podprzyczyn).
    const baseline = (y, size) => (up ? y - s * 0.35 : y + s * 0.3 + size * 0.75);
    for (const cause of bone.causes) {
      const y = rowY(row);
      const end = onBone(y);
      lines.push([P(end - L, y), P(end, y)]);
      texts.push({ ...P(end - s * 0.8, baseline(y, s * 0.9)), text: cause.text, size: s * 0.9, align: 'right', width: L - s * 1.2 });
      row += 1;
      if (cause.subs.length > 0) {
        // Podprzyczyny: mała ość od przyczyny w stronę kręgosłupa (równoległa do ości) i jej kreski.
        const start = { x: end - L * 0.55, y };
        const last = rowY(row + cause.subs.length - 1);
        lines.push([P(start.x, y), P(start.x + k * Math.abs(last - y), last)]);
        for (const sub of cause.subs) {
          const subY = rowY(row);
          const tip = start.x + k * Math.abs(subY - y);
          const reach = L * 0.5;
          lines.push([P(tip - reach, subY), P(tip, subY)]);
          texts.push({ ...P(tip - s * 0.7, baseline(subY, s * 0.78)), text: sub, size: s * 0.78, align: 'right', width: reach - s * 1.1 });
          row += 1;
        }
      }
    }
    // Miejsce dotknięcia: pas wzdłuż ości (równoległobok – sąsiednie ości się nie zasłaniają) i ramka nazwy.
    const reach = L * 1.05 + s * 0.3;
    targets.push({ id: `bone-${index}`, ...P(outer - reach, up ? yc - H : yc), w: bx - outer + reach + s * 0.4, h: H, slant: { ...P(bx, yc), k, reach, pad: s * 0.4 } });
    targets.push({ id: `bone-${index}`, ...P(outer - labelW / 2, labelY), w: labelW, h: labelH });
  });
  // Kręgosłup ze strzałką do głowy i głowa (skutek).
  const spine = [P(margin, yc), P(headX, yc)];
  const head = { ...P(headX, yc - headH / 2), w: headW, h: headH, fill: 'head' };
  boxes.push(head);
  const problemLines = wrapText(element.problem || 'Problem (skutek)', s * 1.05, headW - s * 0.8, true).slice(0, 3);
  const lineH = s * 1.05 * 1.2;
  const first = yc - (problemLines.length * lineH) / 2 + s * 0.85;
  problemLines.forEach((line, index) => texts.push({ ...P(headX + headW / 2, first + index * lineH), text: line, size: s * 1.05, align: 'center', bold: true, width: headW - s * 0.6 }));
  targets.unshift({ id: 'problem', x: head.x, y: head.y, w: head.w, h: head.h });
  return { width, height, lines, spine, arrows: [{ from: P(headX - s * 2, yc), to: P(headX, yc) }], boxes, texts, targets };
}

function whysLayout(element) {
  const s = element.size;
  const { x: ox, y: oy } = element;
  const margin = s * 0.5;
  const W = s * 16;
  const pad = s * 0.6;
  const labelSize = s * 0.72;
  const lineH = s * 1.3;
  const gap = s * 1.8;
  const answers = element.answers ?? [];
  const boxes = [];
  const texts = [];
  const targets = [];
  const arrows = [];
  let y = margin;
  const entries = [
    { id: 'problem', label: 'Problem', text: element.problem || 'Opisz problem', bold: true, fill: 'head' },
    ...answers.map((answer, index) => ({
      id: `answer-${index}`, label: index === answers.length - 1 && answers.length > 1 ? `Dlaczego? ${index + 1} – przyczyna źródłowa` : `Dlaczego? ${index + 1}`,
      text: answer || '…', bold: false, fill: index === answers.length - 1 && answers.length > 1 ? 'root' : 'box'
    }))
  ];
  entries.forEach((entry, index) => {
    const wrapped = wrapText(entry.text, s, W - pad * 2, entry.bold).slice(0, 6);
    const h = pad + labelSize * 1.25 + wrapped.length * lineH + pad * 0.6;
    if (index > 0) arrows.push({ from: { x: ox + margin + W / 2, y: oy + y - gap + s * 0.15 }, to: { x: ox + margin + W / 2, y: oy + y - s * 0.15 } });
    boxes.push({ x: ox + margin, y: oy + y, w: W, h, fill: entry.fill });
    texts.push({ x: ox + margin + pad, y: oy + y + pad + labelSize * 0.85, text: entry.label, size: labelSize, align: 'left', bold: false, width: W - pad * 2, muted: true });
    wrapped.forEach((line, row) => texts.push({
      x: ox + margin + pad, y: oy + y + pad + labelSize * 1.25 + s * 0.95 + row * lineH, text: line, size: s, align: 'left', bold: entry.bold, width: W - pad * 2
    }));
    targets.push({ id: entry.id, x: ox + margin, y: oy + y, w: W, h });
    y += h + gap;
  });
  return { width: W + margin * 2, height: y - gap + margin, lines: [], spine: null, arrows, boxes, texts, targets };
}

// ---------------------------------------------------------------- mapa strumienia wartości i koncentracja wad (od 1.45)

/** Liczba z przecinkiem: najwyżej dwa miejsca po przecinku (poniżej 1 – trzy). */
export function formatNumber(value) {
  const digits = Math.abs(value) < 1 && value !== 0 ? 1000 : 100;
  return String(Math.round(value * digits) / digits).replace('.', ',');
}

/** Pusty rozkład: także wielokąty { points, closed, fill }, okręgi { x, y, r, fill? } i znaczniki wad { color, lines, dot?, ring? }. */
const emptyGeometry = () => ({ lines: [], spine: null, arrows: [], boxes: [], texts: [], targets: [], polys: [], circles: [], marks: [] });

function vsmLayout(element) {
  const s = element.size;
  const { x: ox, y: oy } = element;
  const m = s * 0.4;
  const g = emptyGeometry();
  const P = (x, y) => ({ x: ox + x, y: oy + y });
  const poly = (points, fill = null, closed = true) => g.polys.push({ points: points.map(([x, y]) => P(x, y)), closed, fill });
  const title = element.title ?? '';
  const rows = element.rows ?? [];
  const small = s * 0.85;
  /** Napisy pod symbolem (środek cx, od wysokości top): zwraca dół napisów. */
  const caption = (lines, cx, top, width, boldFirst = false) => {
    let y = top;
    lines.forEach((line, index) => {
      y += s * 1.15;
      g.texts.push({ ...P(cx, y), text: line, size: small, align: 'center', bold: boldFirst && index === 0, width });
    });
    return lines.length > 0 ? y + s * 0.35 : top;
  };
  const widest = (lines, bold = false) => Math.max(0, ...lines.map((line) => textWidth(line, small, bold)));
  const under = title ? [title, ...rows] : rows;
  let [width, height] = [0, 0];
  switch (element.symbol) {
    case 'process': {
      // Nazwa w nagłówku, dane procesu (C/T, C/O, dostępność…) w polu pod nim.
      const W = clamp(widest(rows) + s * 1.4, s * 9, s * 16);
      const head = s * 2.2;
      const lines = rows.flatMap((row) => wrapText(row, small, W - s * 1.2)).slice(0, DIAGRAM_LIMITS.rows * 2);
      const dataH = s * 0.6 + Math.max(1, lines.length) * s * 1.3;
      g.boxes.push({ ...P(m, m), w: W, h: head, fill: 'label' });
      g.texts.push({ ...P(m + W / 2, m + head * 0.66), text: title || VSM_LABELS.process, size: s, align: 'center', bold: true, width: W - s * 0.8 });
      g.boxes.push({ ...P(m, m + head), w: W, h: dataH, fill: 'box' });
      lines.forEach((line, index) => g.texts.push({ ...P(m + s * 0.6, m + head + (index + 1) * s * 1.3), text: line, size: small, align: 'left', bold: false, width: W - s * 1.2 }));
      [width, height] = [W + m * 2, head + dataH + m * 2];
      break;
    }
    case 'inventory': {
      // Trójkąt ostrzegawczy z „I”, pod nim ilość i czas zapasu.
      const W = Math.max(s * 5, widest(under, true) + s * 0.6);
      const [cx, tw, th] = [m + W / 2, s * 5, s * 4.4];
      poly([[cx, m], [cx + tw / 2, m + th], [cx - tw / 2, m + th]], 'box');
      g.texts.push({ ...P(cx, m + th * 0.86), text: 'I', size: s * 2, align: 'center', bold: true, width: tw });
      [width, height] = [W + m * 2, caption(under, cx, m + th, W, Boolean(title)) + m];
      break;
    }
    case 'supplier': {
      // Fabryka (dostawca albo klient): piłokształtny dach, nazwa w środku, wiersze pod spodem.
      const W = Math.max(s * 8, widest(rows) + s * 0.6);
      const [fw, H, roof, peak] = [s * 8, s * 5, s * 1.8, s * 0.4];
      const left = m + (W - fw) / 2;
      poly([[0, H], [0, roof], [fw / 3, peak], [fw / 3, roof], [(fw * 2) / 3, peak], [(fw * 2) / 3, roof], [fw, peak], [fw, H]].map(([x, y]) => [left + x, m + y]), 'box');
      wrapText(title || VSM_LABELS.supplier, s * 0.9, fw - s, true).slice(0, 2).forEach((line, index) => g.texts.push({
        ...P(left + fw / 2, m + roof + s * 1.4 + index * s * 1.1), text: line, size: s * 0.9, align: 'center', bold: true, width: fw - s * 0.6
      }));
      [width, height] = [W + m * 2, caption(rows, m + W / 2, m + H, W) + m];
      break;
    }
    case 'supermarket': {
      // Regał otwarty z lewej (strona odbioru).
      const W = Math.max(s * 4.5, widest(under, true) + s * 0.6);
      const [sw, H] = [s * 4.5, s * 4.5];
      const left = m + (W - sw) / 2;
      g.lines.push([P(left + sw, m), P(left + sw, m + H)]);
      for (let shelf = 0; shelf <= 3; shelf += 1) g.lines.push([P(left, m + (shelf * H) / 3), P(left + sw, m + (shelf * H) / 3)]);
      [width, height] = [W + m * 2, caption(under, m + W / 2, m + H, W, Boolean(title)) + m];
      break;
    }
    case 'push': {
      // Strzałka pchania: pasy na trzonie, nad nią napis.
      const [L, body, headH, neck] = [s * 8.4, s * 1.4, s * 3, s * 6];
      const above = under.length > 0 ? under.length * s * 1.15 + s * 0.4 : 0;
      const W = Math.max(L, widest(under, true) + s * 0.6);
      const [left, cy] = [m + (W - L) / 2, m + above + headH / 2];
      caption(under, m + W / 2, m - s * 0.3, W, Boolean(title));
      poly([[0, cy - body / 2], [neck, cy - body / 2], [neck, cy - headH / 2], [L, cy], [neck, cy + headH / 2], [neck, cy + body / 2], [0, cy + body / 2]]
        .map(([x, y]) => [left + x, y]), 'box');
      for (let stripe = 0; stripe < 3; stripe += 1) {
        const x0 = left + stripe * s * 2;
        poly([[x0, cy - body / 2], [x0 + s, cy - body / 2], [x0 + s, cy + body / 2], [x0, cy + body / 2]], 'ink');
      }
      [width, height] = [W + m * 2, cy + headH / 2 + m];
      break;
    }
    case 'kaizen': {
      // Wybuch kaizen: gwiazda z dwunastoma ramionami, w środku napis (do trzech wierszy).
      const [rx, ry] = [s * 4.2, s * 3];
      const [cx, cy] = [m + rx, m + ry];
      const points = Array.from({ length: 24 }, (_, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI) / 12;
        const r = index % 2 === 0 ? 1 : 0.74;
        return [cx + Math.cos(angle) * rx * r, cy + Math.sin(angle) * ry * r];
      });
      poly(points, 'burst');
      const lines = wrapText(title || VSM_LABELS.kaizen, small, rx * 1.15, true).slice(0, 3);
      const first = cy - ((lines.length - 1) * s * 1.05) / 2 + small * 0.35;
      lines.forEach((line, index) => g.texts.push({ ...P(cx, first + index * s * 1.05), text: line, size: small, align: 'center', bold: true, width: rx * 1.2 }));
      [width, height] = [rx * 2 + m * 2, caption(rows, cx, cy + ry, rx * 2) + m];
      break;
    }
    case 'operator': {
      // Operator: głowa i ramiona, pod spodem napis (np. liczba osób).
      const W = Math.max(s * 4, widest(under, true) + s * 0.6);
      const cx = m + W / 2;
      g.circles.push({ ...P(cx, m + s * 0.9), r: s * 0.8, fill: 'box' });
      const shoulders = Array.from({ length: 17 }, (_, index) => {
        const angle = Math.PI + (index / 16) * Math.PI;
        return [cx + Math.cos(angle) * s * 1.7, m + s * 4.2 + Math.sin(angle) * s * 2];
      });
      poly(shoulders, 'box');
      [width, height] = [W + m * 2, caption(under, cx, m + s * 4.2, W, Boolean(title)) + m];
      break;
    }
    default: {
      // Transport (ciężarówka): napis w skrzyni (np. częstotliwość dostaw), wiersze pod spodem.
      const W = Math.max(s * 8.2, widest(rows) + s * 0.6);
      const left = m + (W - s * 8.2) / 2;
      g.boxes.push({ ...P(left, m + s * 0.6), w: s * 5.4, h: s * 2.8, fill: 'box' });
      poly([[5.6, 1.4], [7.3, 1.4], [8.2, 2.4], [8.2, 3.4], [5.6, 3.4]].map(([x, y]) => [left + x * s, m + y * s]), 'box');
      for (const wheel of [1.4, 6.8]) g.circles.push({ ...P(left + wheel * s, m + s * 3.95), r: s * 0.55, fill: 'box' });
      wrapText(title, small, s * 4.8, true).slice(0, 2).forEach((line, index) => g.texts.push({
        ...P(left + s * 2.7, m + s * 1.75 + index * s * 1.05), text: line, size: small, align: 'center', bold: true, width: s * 5
      }));
      [width, height] = [W + m * 2, caption(rows, m + W / 2, m + s * 4.5, W) + m];
    }
  }
  g.targets.push({ id: 'title', x: ox, y: oy, w: width, h: height });
  return { ...g, width, height };
}

/** Sumy osi czasu: oczekiwanie i praca (w swoich jednostkach), czas przejścia (jednostka oczekiwania), PCE (%). */
export function timelineTotals(element) {
  const day = element.dayHours ?? 24;
  const [waitS, workS] = [unitSeconds(element.waitUnit, day), unitSeconds(element.workUnit, day)];
  const wait = element.steps.reduce((sum, step) => sum + step.wait, 0);
  const work = element.steps.reduce((sum, step) => sum + step.work, 0);
  const seconds = wait * waitS + work * workS;
  return { wait, work, lead: seconds / waitS, pce: seconds > 0 ? ((work * workS) / seconds) * 100 : 0 };
}

function timelineLayout(element) {
  const s = element.size;
  const { x: ox, y: oy } = element;
  const g = emptyGeometry();
  const P = (x, y) => ({ x: ox + x, y: oy + y });
  const m = s * 0.4;
  const colW = s * 5;
  const top = m + s * 1.6;
  const low = top + s * 2.2;
  const small = s * 0.85;
  const label = (value, unit) => `${formatNumber(value)} ${unit}`;
  let x = m;
  element.steps.forEach((step, index) => {
    // Oczekiwanie (zapas) – u góry, praca (wartość dodana) – u dołu.
    g.lines.push([P(x, top), P(x + colW, top)], [P(x + colW, top), P(x + colW, low)], [P(x + colW, low), P(x + colW * 2, low)]);
    if (index < element.steps.length - 1) g.lines.push([P(x + colW * 2, low), P(x + colW * 2, top)]);
    g.texts.push({ ...P(x + colW / 2, top - s * 0.45), text: label(step.wait, element.waitUnit), size: small, align: 'center', bold: false, width: colW - s * 0.4 });
    g.texts.push({ ...P(x + colW * 1.5, low + s * 1.15), text: label(step.work, element.workUnit), size: small, align: 'center', bold: false, width: colW - s * 0.4 });
    x += colW * 2;
  });
  const totals = timelineTotals(element);
  const [boxX, boxW, boxH] = [x + s * 1.2, s * 12, s * 4.6];
  g.boxes.push({ ...P(boxX, m), w: boxW, h: boxH, fill: 'label' });
  [
    [`Czas przejścia: ${label(totals.lead, element.waitUnit)}`, true],
    [`Wartość dodana: ${label(totals.work, element.workUnit)}`, false],
    [`PCE: ${formatNumber(totals.pce)}%`, false]
  ].forEach(([text, bold], index) => g.texts.push({ ...P(boxX + s * 0.6, m + s * 1.3 + index * s * 1.3), text, size: small, align: 'left', bold, width: boxW - s * 1.2 }));
  const width = boxX + boxW + m;
  const height = Math.max(low + s * 1.6, m + boxH) + m;
  g.targets.push({ id: 'steps', x: ox, y: oy, w: width, h: height });
  return { ...g, width, height };
}

/** Liczby punktów kartki (narzędzie Punkt) o znaczniku i kolorze każdej pozycji legendy; bez kresek – null. */
export function defectCounts(element, strokes) {
  if (!Array.isArray(strokes)) return element.items.map(() => null);
  const points = strokes.filter((stroke) => stroke?.tool === 'shape' && stroke.shape === 'point');
  return element.items.map((item) => points.filter((point) => pointMark(point) === item.mark && point.color?.toLowerCase() === item.color).length);
}

function defectsLayout(element, strokes) {
  const s = element.size;
  const { x: ox, y: oy } = element;
  const g = emptyGeometry();
  const P = (x, y) => ({ x: ox + x, y: oy + y });
  const m = s * 0.4;
  const [rowH, head, small] = [s * 1.7, s * 2, s * 0.9];
  const counts = defectCounts(element, strokes);
  const nameW = Math.max(s * 6, ...element.items.map((item) => textWidth(item.name || 'Wada', small)));
  const W = s * 2.2 + nameW + s * 3.4;
  const H = head + (element.items.length + 1) * rowH;
  g.boxes.push({ ...P(m, m), w: W, h: H, fill: 'box' });
  g.boxes.push({ ...P(m, m), w: W, h: head, fill: 'label' });
  g.texts.push({ ...P(m + s * 0.6, m + head * 0.66), text: element.title || DIAGRAM_LABELS.defects, size: s, align: 'left', bold: true, width: W - s * 1.2 });
  element.items.forEach((item, index) => {
    const mid = m + head + (index + 0.5) * rowH;
    const mark = pointMarkGeometry({ shape: 'point', mark: item.mark, x: ox + m + s * 1.1, y: oy + mid, w: s * 1.1, h: s * 1.1, angle: 0, skew: 0, size: Math.max(1.5, s / 9) });
    g.marks.push({ color: item.color, width: Math.max(1.5, s / 9), ...mark });
    g.texts.push({ ...P(m + s * 2.2, mid + small * 0.35), text: item.name || 'Wada', size: small, align: 'left', bold: false, width: nameW });
    g.texts.push({ ...P(m + W - s * 0.6, mid + small * 0.35), text: counts[index] === null ? '–' : String(counts[index]), size: small, align: 'right', bold: true, width: s * 2.6 });
  });
  const totalY = m + head + element.items.length * rowH;
  g.lines.push([P(m, totalY), P(m + W, totalY)]);
  const total = counts.every((count) => count === null) ? '–' : String(counts.reduce((sum, count) => sum + (count ?? 0), 0));
  g.texts.push({ ...P(m + s * 0.6, totalY + rowH / 2 + small * 0.35), text: 'Razem', size: small, align: 'left', bold: true, width: nameW });
  g.texts.push({ ...P(m + W - s * 0.6, totalY + rowH / 2 + small * 0.35), text: total, size: small, align: 'right', bold: true, width: s * 2.6 });
  const [width, height] = [W + m * 2, H + m * 2];
  g.targets.push({ id: 'items', x: ox, y: oy, w: width, h: height });
  return { ...g, width, height };
}

/** Miejsce diagramu pod punktem (id pola – np. 'bone-2', 'answer-0', 'problem') albo null. */
export function diagramTargetAt(element, point) {
  const inside = (target) => {
    if (point.x < target.x || point.x > target.x + target.w || point.y < target.y || point.y > target.y + target.h) return false;
    if (!target.slant) return true;
    const edge = target.slant.x - target.slant.k * Math.abs(point.y - target.slant.y);
    return point.x <= edge + target.slant.pad && point.x >= edge - target.slant.reach;
  };
  return diagramLayout(element).targets.find(inside)?.id ?? null;
}
