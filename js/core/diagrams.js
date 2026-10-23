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

export const DIAGRAM_KINDS = Object.freeze(['fishbone', 'whys']);
export const DIAGRAM_LABELS = Object.freeze({ fishbone: 'Diagram Ishikawy', whys: '5 × Dlaczego' });
/** Kategorie 6M – ości nowego diagramu Ishikawy. */
export const FISHBONE_BONES = Object.freeze(['Człowiek', 'Maszyna', 'Metoda', 'Materiał', 'Pomiar', 'Środowisko']);
/** Wielkości napisów diagramu (jednostki strony; kratka ma 44): mała, średnia, duża, bardzo duża. */
export const DIAGRAM_SIZES = Object.freeze([16, 20, 26, 32]);
export const DIAGRAM_LIMITS = Object.freeze({ bones: 8, causes: 10, subs: 5, answers: 7, text: 120, problem: 200, name: 40 });
/** Kolory wypełnień: głowa i przyczyna źródłowa – jasny pomarańcz, nazwy kategorii i pola – jasny szary. */
export const DIAGRAM_FILLS = Object.freeze({ head: '#fff1e0', label: '#f2f2f7', root: '#ffe2c2', box: '#ffffff' });

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
export function newDiagram(kind, { x = 0, y = 0, size = DIAGRAM_SIZES[1], color = '#1d1d1f' } = {}) {
  const base = { tool: 'diagram', kind, x, y, size, color };
  const data = kind === 'whys'
    ? { problem: '', answers: ['', '', '', '', ''] }
    : { problem: '', bones: FISHBONE_BONES.map((name) => ({ name, causes: [] })) };
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
    x: clamp(raw.x, -pageWidth, pageWidth * 2), y: clamp(raw.y, -pageHeight, pageHeight * 2), size: clamp(raw.size, 10, 60),
    problem: clip(raw.problem, DIAGRAM_LIMITS.problem)
  };
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

/** Nazwa diagramu przy zaznaczeniu. */
export const diagramLabel = (element) => DIAGRAM_LABELS[element.kind] ?? 'Diagram';

/**
 * Rozkład diagramu w punktach strony: { width, height, lines: [[a, b]] – linie, spine – grubsza linia (kręgosłup),
 * arrows: [{ from, to }] – strzałki z grotem w `to`, boxes: [{ x, y, w, h, fill }], texts: [{ x, y – linia bazowa, text,
 * size, align: 'left' | 'center' | 'right', bold, width – najwięcej }], targets: [{ id, x, y, w, h, slant? }] – miejsca
 * dotknięcia (okno otwiera się przy tym polu; slant – pas wzdłuż ukośnej ości, jedno id może mieć kilka miejsc) }.
 */
export function diagramLayout(element) {
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
