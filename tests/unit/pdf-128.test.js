// PDF z prawdziwym tekstem 1.28: kodowanie znaków (polskie litery, Symbol, znaki zastępcze), budowa
// pliku (tabela xref, tylko użyte kroje, ToUnicode, kompresja, obrazy, linki, tytuł), rysowanie wzoru
// przez obiekt płótna, podział na strony (Nowa strona, nagłówki, samotne wiersze, nagłówek tabeli,
// fragment wyższy niż strona).

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { deflateSync, inflateSync } from 'node:zlib';

import { layoutMath } from '../../js/core/math-layout.js';
import { paginate } from '../../js/core/pdf-pages.js';
import { A4, LATIN_CODES, createPdf, encodable, encodeText, fontSize, num, parseColor, pdfCanvas, serifVariant } from '../../js/core/pdf.js';

const NBSP = String.fromCharCode(0xa0);
const SOFT_HYPHEN = String.fromCharCode(0xad);
const widths = (variant, char) => (char === ' ' ? 278 : (variant === 'bold' ? 600 : 500));
const compress = async (bytes) => deflateSync(bytes);

/** Prosty czytnik PDF: obiekty (słownik, strumień po rozpakowaniu) i sprawdzenie tabeli xref. */
function readPdf(bytes) {
  const buffer = Buffer.from(bytes);
  const text = buffer.toString('latin1');
  const objects = new Map();
  for (const match of text.matchAll(/(\d+) 0 obj\n/g)) {
    const id = Number(match[1]);
    const start = match.index + match[0].length;
    const streamAt = text.indexOf('\nstream\n', start);
    const endAt = text.indexOf('\nendobj', start);
    if (streamAt >= 0 && streamAt < endAt) {
      const dict = text.slice(start, streamAt);
      const length = Number(/\/Length (\d+)/.exec(dict)[1]);
      let data = buffer.subarray(streamAt + 8, streamAt + 8 + length);
      if (dict.includes('/FlateDecode')) data = inflateSync(data);
      objects.set(id, { offset: match.index, dict, data });
    } else {
      objects.set(id, { offset: match.index, dict: text.slice(start, endAt) });
    }
  }
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)[1]);
  const rows = text.slice(startxref).split('\n');
  const size = Number(/xref\n0 (\d+)/.exec(text.slice(startxref))[1]);
  const offsets = rows.slice(3, 2 + size).map((row) => Number(row.slice(0, 10)));
  return { text, objects, startxref, size, offsets };
}

/** Tekst strony: napisy <…> Tj odczytane mapą ToUnicode kroju z zasobów strony. */
function pageText(pdf, pageID) {
  const page = pdf.objects.get(pageID).dict;
  const fonts = Object.fromEntries([...page.matchAll(/\/(F\d) (\d+) 0 R/g)].map((match) => [match[1], Number(match[2])]));
  const maps = {};
  for (const [key, id] of Object.entries(fonts)) {
    const cmap = pdf.objects.get(Number(/\/ToUnicode (\d+)/.exec(pdf.objects.get(id).dict)[1])).data.toString('latin1');
    maps[key] = new Map([...cmap.matchAll(/<([0-9a-f]{2})> <([0-9a-f]+)>/g)].map((match) => [parseInt(match[1], 16),
      String.fromCodePoint(...match[2].match(/.{4}/g).map((unit) => parseInt(unit, 16)))]));
  }
  const content = pdf.objects.get(Number(/\/Contents (\d+)/.exec(page)[1])).data.toString('latin1');
  let font = null;
  let out = '';
  for (const match of content.matchAll(/\/(F\d) [\d.]+ Tf|<([0-9a-f]*)> Tj/g)) {
    if (match[1]) font = match[1];
    else out += match[2].match(/.{2}/g).map((code) => maps[font].get(parseInt(code, 16)) ?? '?').join('');
  }
  return out;
}

test('PDF 1.28: kodowanie – polskie litery w Helvetica, grecki i minus w Symbol, spacje, znaki zastępcze', () => {
  const runs = encodeText('Zażółć Ą');
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].codes, [0x5a, 0x61, 0x9c, 0xf3, 0x8c, 0x87, 0x20, 0x81]);
  assert.deepEqual(encodeText('α≤β').map((run) => [run.font, run.codes]), [['symbol', [0x61, 0xa3, 0x62]]]);
  assert.deepEqual(encodeText('−5').map((run) => run.font), ['symbol', 'latin'], 'minus z kroju Symbol');
  assert.deepEqual(encodeText(`1${NBSP}234`)[0].codes, [0x31, 0x20, 0x32, 0x33, 0x34], 'twarda spacja – zwykła');
  assert.equal(encodeText(`roz${SOFT_HYPHEN}dział`)[0].text, 'rozdział', 'miękki dywiz pominięty');
  assert.equal(encodeText('čřŽ›')[0].text, 'crŽ›', 'litery bez kodowania – bez znaku diakrytycznego');
  assert.deepEqual(encodeText('Ж😀')[0].codes, [0x3f, 0x3f]);
  assert.equal(encodeText('›')[0].codes[0], 0x10, 'znak wyparty przez polską literę – kod poniżej 32');
  assert.deepEqual(['ą', 'σ', '∘', '⌊', ' ', SOFT_HYPHEN].map(encodable), [true, true, false, false, true, true]);
  assert.equal(LATIN_CODES.get(0x9b), 'Ż');
  assert.equal(LATIN_CODES.has(0x0a), false, 'bez kodu końca wiersza');
  assert.deepEqual([num(1.005), num(-0.001), num(12)], ['1', '0', '12']);
});

test('PDF 1.28: budowa pliku – xref, strony A4, tylko użyte kroje, ToUnicode, Differences, tytuł, link, kompresja', async () => {
  const pdf = createPdf({ title: 'Notatka – zażółć', widths, compress });
  const first = pdf.addPage();
  assert.ok(Math.abs(first.text('Zażółć gęślą jaźń', 50, 700) - (15 * 500 + 2 * 278) * 11 / 1000) < 1e-9, 'szerokość napisu');
  first.text('α ≥ 0 › pogrubiony', 50, 680, { variant: 'bold', size: 14, color: [215, 0, 21] });
  first.link(50, 660, 100, 12, 'https://example.com/a(b)?q=ż');
  pdf.addPage().text('Druga strona', 50, 700);
  const bytes = await pdf.build();
  const head = Buffer.from(bytes.subarray(0, 15));
  assert.equal(head.subarray(0, 9).toString('latin1'), '%PDF-1.4\n');
  assert.ok(head[10] > 127, 'wiersz z bajtami powyżej 127');
  const read = readPdf(bytes);
  assert.equal(read.offsets.length, read.size - 1);
  read.offsets.forEach((offset, index) => assert.equal(read.objects.get(index + 1)?.offset, offset, `obiekt ${index + 1} w miejscu z xref`));
  assert.ok(read.text.slice(read.startxref).startsWith('xref\n'));
  assert.match(read.text, /\/Type \/Pages \/Kids \[\d+ 0 R \d+ 0 R\] \/Count 2/);
  assert.equal([...read.text.matchAll(/\/MediaBox \[0 0 595\.28 841\.89\]/g)].length, 2, 'A4');
  const fonts = [...read.text.matchAll(/\/BaseFont \/([\w-]+)/g)].map((match) => match[1]);
  assert.deepEqual(fonts, ['Helvetica', 'Helvetica-Bold', 'Symbol'], 'tylko użyte kroje (bez Times)');
  assert.match(read.text, /\/Differences \[1 \/florin .*16 \/guilsinglright 17 \/oe 129 \/Aogonek .*156 \/zdotaccent\]/);
  assert.match(read.text, /\/FirstChar 1 \/LastChar 255 \/Widths \[(\d+ ){254}\d+\]/);
  // Tytuł UTF-16 z polskimi literami; link – tylko ASCII, nawiasy poprzedzone \.
  assert.ok(read.text.includes('/Title <FEFF004E006F007400610074006B0061002020130020007A0061017C00F301420107>'));
  assert.ok(read.text.includes('/URI (https://example.com/a\\(b\\)?q=%C5%BC)'));
  assert.match(read.text, /\/Annots \[\d+ 0 R\]/);
  // Strumienie skompresowane; tekst odczytany przez ToUnicode z pliku.
  assert.ok([...read.objects.values()].filter((object) => object.data).every((object) => object.dict.includes('/FlateDecode')));
  const pages = [...read.text.matchAll(/(\d+) 0 obj\n<< \/Type \/Page /g)].map((match) => Number(match[1]));
  assert.equal(pageText(read, pages[0]), 'Zażółć gęślą jaźńα ≥ 0 › pogrubiony');
  assert.equal(pageText(read, pages[1]), 'Druga strona');
  const content = read.objects.get(Number(/\/Contents (\d+)/.exec(read.objects.get(pages[0]).dict)[1])).data.toString('latin1');
  assert.ok(content.includes('0.84 0 0.08 rg'), 'kolor tekstu');
  assert.equal(pdf.pageCount, 2);
  assert.equal(pdf.textWidth('ab', { size: 10 }), 10);
});

test('PDF 1.28: krój i kolor ustawiane raz (q/Q zerują), obrazy JPEG i RGB, ścieżki, przycięcie', async () => {
  const pdf = createPdf({ widths, compress: null });
  const page = pdf.addPage();
  page.text('a', 0, 0);
  page.text('b', 10, 0);
  page.save();
  page.clip(0, 0, 100, 50);
  page.text('c', 20, 0);
  page.restore();
  page.path([['m', 0, 0], ['l', 10, 0], ['c', 1, 2, 3, 4, 5, 6], ['h']], { fill: [255, 0, 0], stroke: [0, 0, 0], width: 0.5, cap: 'round', join: 'round' });
  page.line(0, 0, 10, 0, 1, [0, 0, 0], [3, 2]);
  const jpeg = pdf.addImage({ bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 2, height: 1 });
  const rgb = pdf.addImage({ bytes: new Uint8Array(6), width: 2, height: 1, format: 'rgb' });
  page.image(jpeg, 0, 0, 20, 10);
  page.image(rgb, 0, 0, 20, 10);
  assert.deepEqual(page.ops.slice(0, 3), [
    'BT /F1 11 Tf 0 0 0 rg 1 0 0 1 0 0 Tm <61> Tj ET',
    'BT 1 0 0 1 10 0 Tm <62> Tj ET',
    'q'
  ]);
  assert.equal(page.ops[3], '0 0 100 50 re W n');
  assert.equal(page.ops[4], 'BT /F1 11 Tf 0 0 0 rg 1 0 0 1 20 0 Tm <63> Tj ET', 'po q krój i kolor od nowa');
  assert.equal(page.ops[6], 'q 1 0 0 rg 0 0 0 RG 0.5 w 1 J 1 j 0 0 m 10 0 l 1 2 3 4 5 6 c h B Q');
  assert.equal(page.ops[7], 'q [3 2] 0 d 1 w 0 0 0 RG 0 0 m 10 0 l S Q');
  const read = readPdf(await pdf.build());
  assert.match(read.text, /\/Subtype \/Image \/Width 2 \/Height 1 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length 4/);
  assert.match(read.text, /\/Subtype \/Image \/Width 2 \/Height 1 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Length 6/, 'RGB bez kompresji');
  assert.match(read.text, /\/XObject << \/Im1 \d+ 0 R \/Im2 \d+ 0 R >>/);
});

test('PDF 1.28: wzór rysowany wektorowo – Times pochylony, Symbol, kreski i krzywe w układzie strony', () => {
  const pdf = createPdf({ widths, compress: null });
  const page = pdf.addPage();
  const layout = layoutMath('\\sqrt{x} + \\frac{a}{\\alpha}', { size: 12, measure: (text) => [...text].length * 6 });
  const ctx = pdfCanvas(page, [1, 0, 0, -1, 50, A4.height - 100]);
  layout.draw(ctx, 0, layout.ascent, 'rgb(29, 29, 31)');
  const text = page.ops.filter((op) => op.startsWith('BT'));
  assert.ok(text.some((op) => /\/F7 12 Tf .*<78> Tj/.test(op)), 'x – Times pochylony (F7)');
  assert.ok(text.some((op) => /\/F9 [\d.]+ Tf .*<61> Tj/.test(op)), 'α – Symbol (F9)');
  assert.ok(text.every((op) => op.includes('Tm')));
  const strokes = page.ops.filter((op) => op.endsWith(' S Q'));
  assert.ok(strokes.length >= 2, 'znak pierwiastka i kreska ułamka');
  assert.ok(strokes.every((op) => op.includes('0.11 0.11 0.12 RG')), 'kolor wzoru');
  // y w dół w układzie wzoru → y w górę na stronie: linia bazowa wzoru 100 pt od góry strony.
  const baseline = Number(/1 0 0 1 [\d.]+ ([\d.]+) Tm/.exec(text.find((op) => op.includes('<78>')))[1]);
  assert.ok(Math.abs(baseline - (A4.height - 100 - layout.ascent)) < 0.02, `linia bazowa ${baseline}`);
  // Pełny okrąg – cztery krzywe Béziera.
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  assert.equal((page.ops.at(-1).match(/ c/g) ?? []).length, 4);
  assert.deepEqual([parseColor('#d70015'), parseColor('#abc'), parseColor('rgba(1, 2, 3, 0.5)'), parseColor('bogus')], [[215, 0, 21], [170, 187, 204], [1, 2, 3], [0, 0, 0]]);
  assert.deepEqual([serifVariant('italic 12px x'), serifVariant('bold 12px x'), serifVariant('italic bold 9px x'), serifVariant('12px x')],
    ['serifItalic', 'serifBold', 'serifBoldItalic', 'serif']);
  assert.equal(fontSize('italic 12.5px "STIX"'), 12.5);
});

// ---------------------------------------------------------------- podział na strony

const lines = (from, count, { group = null, step = 17, height = 12.6 } = {}) => Array.from({ length: count }, (_, index) => ({
  top: from + index * step, bottom: from + index * step + height, group, first: group !== null && index === 0, last: group !== null && index === count - 1
}));

test('PDF 1.28: podział – strona wypełniona wierszami, cięcie w odstępie, „Nowa strona”, przycięcie do połowy odstępu', () => {
  const pages = paginate(lines(0, 100), { height: 739.84 });
  assert.deepEqual(pages.map((page) => [page.top, page.bottom]), [[0, 726.6], [731, 1457.6], [1462, 1695.6]]);
  assert.equal(pages[0].clipBottom, 728.6, 'połowa odstępu do następnego wiersza, najwyżej 2 pt');
  assert.equal(pages[1].clipTop, 729);
  assert.equal(pages[0].clipTop, -2);
  const broken = paginate(lines(0, 10), { height: 739.84, breaks: [17 * 4 - 1] });
  assert.deepEqual(broken.map((page) => [page.top, page.bottom]), [[0, 63.6], [68, 165.6]]);
  assert.deepEqual(paginate([], { height: 100 }), []);
});

test('PDF 1.28: podział – nagłówek nie zostaje na dole, akapit bez samotnego pierwszego i ostatniego wiersza', () => {
  // Nagłówek (keep) jako ostatni wiersz, który by się zmieścił – przechodzi na następną stronę.
  const heading = [...lines(0, 5), { top: 85, bottom: 97.6, keep: true }, ...lines(102, 5)];
  assert.deepEqual(paginate(heading, { height: 100 }).map((page) => page.top), [0, 85]);
  // Akapit 4 wierszy zaczyna się tuż przed końcem strony: pierwszy wiersz nie zostaje sam.
  const orphan = [...lines(0, 5), ...lines(85, 4, { group: 1 })];
  assert.deepEqual(paginate(orphan, { height: 100 }).map((page) => page.top), [0, 85]);
  // Ostatni wiersz akapitu nie zaczyna strony sam – przechodzą dwa.
  const widow = lines(0, 7, { group: 2 });
  assert.deepEqual(paginate(widow, { height: 100 }).map((page) => page.top), [0, 85]);
  // Same nagłówki (keep) – bez wyjścia: cięcie mimo wszystko.
  const all = Array.from({ length: 10 }, (_, index) => ({ top: index * 17, bottom: index * 17 + 12.6, keep: true }));
  assert.deepEqual(paginate(all, { height: 100 }).map((page) => page.top), [0, 102]);
});

test('PDF 1.28: podział – wiersze tabeli, nagłówek tabeli powtarzany; fragment wyższy niż strona cięty między wierszami tekstu', () => {
  const header = { top: 0, bottom: 20 };
  const rows = [{ top: 0, bottom: 20, keep: true }, ...Array.from({ length: 12 }, (_, index) => ({ top: 20 + index * 20, bottom: 40 + index * 20, header }))];
  const pages = paginate(rows, { height: 100 });
  assert.deepEqual(pages.map((page) => [page.top, page.bottom, page.header?.bottom ?? null]), [[0, 100, null], [100, 180, 20], [180, 260, 20]]);
  assert.equal(pages[1].clipTop, 99, 'wiersze stykają się – przycięcie 1 pt (ramka)');
  // Wiersz tabeli 250 pt (komórka z długim tekstem) – cięcie w odstępie między wierszami tekstu.
  const tall = [{ top: 0, bottom: 250 }, ...lines(3, 14)];
  const split = paginate(tall, { height: 100 });
  assert.deepEqual(split.map((page) => [page.top, page.bottom]), [[0, 83.6], [88, 185.6], [190, 250]]);
  // Bez wierszy tekstu – cięcie na granicy strony.
  assert.deepEqual(paginate([{ top: 0, bottom: 250 }], { height: 100 }).map((page) => [page.top, page.bottom]), [[0, 100], [100, 200], [200, 250]]);
});
