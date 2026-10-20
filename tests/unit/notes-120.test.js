// Notatki 1.20: wyrównanie i interlinia akapitu (zapis, edytor, schowek, wklejanie z Worda), adres
// linku wpisany ręcznie, data i godzina do wstawienia, ostatnio użyte symbole, ustawienia ekranu Nauka.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultSettings } from '../../js/core/model.js';
import {
  NOTE_ALIGNS, NOTE_LINE_SPACINGS, docFromHtml, editorNoteHtml, normalizeLink, normalizeNoteHtml, noteText, portableNoteHtml, richTextFromDoc
} from '../../js/core/note-format.js';
import { RECENT_SYMBOLS_MAX, SYMBOL_GROUPS, SYMBOL_NAMES, cleanRecentSymbols, rememberSymbol } from '../../js/core/symbols.js';
import { formatClock, formatDay, formatDayTime, formatEnteredDate } from '../../js/core/text.js';

test('notatka 1.20: wyrównanie i interlinia – zapis przy akapicie, nagłówku i punkcie listy; złe wartości znikają; zwykły tekst bez zmian', () => {
  assert.deepEqual(NOTE_ALIGNS.map((align) => align.id), [null, 'center', 'right', 'justify']);
  assert.deepEqual(NOTE_LINE_SPACINGS.map((spacing) => [spacing.id, spacing.label]), [['1', '1,0'], [null, '1,15'], ['1.5', '1,5'], ['2', '2,0']]);
  const saved = '<p data-align="center" data-line="1.5">Środek</p><h3 data-align="right" data-line="2">Nagłówek</h3>'
    + '<ul><li data-align="justify">Punkt<ul><li>Zagnieżdżony</li></ul></li></ul><p data-indent="2" data-align="right" data-line="1">Wcięty</p>';
  assert.equal(normalizeNoteHtml(saved), saved, 'zapisany HTML się nie zmienia');
  const doc = docFromHtml(saved);
  assert.deepEqual(doc.blocks.map((block) => [block.type, block.align ?? null, block.line ?? null, block.indent ?? 0]), [
    ['p', 'center', '1.5', 0], ['h', 'right', '2', 0], ['li', 'justify', null, 0], ['li', null, null, 0], ['p', 'right', '1', 2]
  ], 'punkt zagnieżdżony nie przejmuje wyrównania punktu nadrzędnego');
  assert.equal(normalizeNoteHtml('<p data-align="middle" data-line="3">a</p><p data-align="left">b</p>'), '<p>a</p><p>b</p>');
  assert.equal(noteText(saved), 'Środek\n\nNagłówek\n\n• Punkt\n    • Zagnieżdżony\n\n        Wcięty');
  // W arkuszu (eksport) wyrównania i interlinii nie ma – tekst ten sam.
  assert.equal(richTextFromDoc(doc).map((run) => run.text).join(''), richTextFromDoc(docFromHtml(normalizeNoteHtml(saved.replace(/ data-(align|line)="[^"]*"/g, '')))).map((run) => run.text).join(''));
});

test('notatka 1.20: wklejanie – wyrównanie z Worda i stron (align, text-align, <center>, dziedziczenie z bloku), „do lewej” je zdejmuje', () => {
  assert.equal(normalizeNoteHtml('<p class=MsoNormal align=center style="text-align:center">Tytuł</p><p style="text-align:justify">Treść</p>'),
    '<p data-align="center">Tytuł</p><p data-align="justify">Treść</p>');
  assert.equal(normalizeNoteHtml('<div style="text-align:right"><p>Prawo</p><p style="text-align:left">Lewo</p></div><center>Środek</center>'),
    '<p data-align="right">Prawo</p><p>Lewo</p><p data-align="center">Środek</p>');
  // Interlinia tylko z atrybutu notatki (style stron WWW nie zmieniają odstępów).
  assert.equal(normalizeNoteHtml('<p style="line-height:200%">a</p><p data-line="2">b</p>'), '<p>a</p><p data-line="2">b</p>');
});

test('notatka 1.20: edytor (wcięcie jako <blockquote> z wyrównaniem przy akapicie) i schowek (styl dla Worda, atrybuty do ponownego wklejenia)', () => {
  const saved = '<p data-indent="2" data-align="justify" data-line="1.5">Wcięty</p><h3 data-line="2">H</h3><ul><li data-align="center">Punkt</li></ul><p data-indent="1">Sam</p>';
  const editor = editorNoteHtml(saved);
  assert.equal(editor, '<blockquote><blockquote><p data-align="justify" data-line="1.5">Wcięty</p></blockquote></blockquote><h3 data-line="2">H</h3>'
    + '<ul><li data-align="center">Punkt</li></ul><blockquote><p>Sam</p></blockquote>');
  assert.equal(normalizeNoteHtml(editor, { editor: true }), saved, 'z edytora z powrotem do zapisu');
  const portable = portableNoteHtml(saved);
  assert.equal(portable, '<p data-align="justify" data-line="1.5" style="margin-left:4em;text-align:justify;line-height:150%">Wcięty</p>'
    + '<h3 data-line="2" style="line-height:200%">H</h3><ul><li data-align="center" style="text-align:center">Punkt</li></ul><p style="margin-left:2em">Sam</p>');
  // Wklejone z powrotem do notatki – wyrównanie i interlinia zostają.
  assert.equal(normalizeNoteHtml(portable), '<p data-align="justify" data-line="1.5">Wcięty</p><h3 data-line="2">H</h3><ul><li data-align="center">Punkt</li></ul><p>Sam</p>');
  assert.ok(portableNoteHtml('<p data-line="1">a</p>').includes('line-height:100%'));
});

test('link 1.20: adres wpisany ręcznie – www i domena dostają https://, e-mail – mailto:, inne protokoły i nie-adresy odrzucone', () => {
  const cases = {
    'https://example.com/a?b=1': 'https://example.com/a?b=1',
    'HTTP://Example.com': 'HTTP://Example.com',
    'www.przyklad.pl': 'https://www.przyklad.pl',
    ' przyklad.pl/strona#a ': 'https://przyklad.pl/strona#a',
    'zażółć.pl': 'https://zażółć.pl',
    'example.com:8080/x': 'https://example.com:8080/x',
    'jan@example.com': 'mailto:jan@example.com',
    'mailto:jan@example.com': 'mailto:jan@example.com',
    'javascript:alert(1)': null,
    'ftp://example.com': null,
    'data:text/html,x': null,
    'localhost:3000': null,
    'przyklad': null,
    'a b.pl': null,
    'http://': null,
    '': null
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(normalizeLink(input), expected, input);
});

test('data i godzina 1.20: „20.10.2026”, „20.10.2026, 14:35”, „14:35”; wpisane ręcznie – data, godzina albo oba', () => {
  const date = new Date(2026, 9, 20, 14, 35, 59);
  assert.equal(formatDay(date), '20.10.2026');
  assert.equal(formatClock(date), '14:35');
  assert.equal(formatDayTime(date), '20.10.2026, 14:35');
  assert.equal(formatDay(new Date(2026, 0, 5, 7, 4)), '05.01.2026');
  assert.equal(formatClock(new Date(2026, 0, 5, 7, 4)), '07:04');
  assert.equal(formatEnteredDate('2026-11-05', '09:30'), '05.11.2026, 09:30');
  assert.equal(formatEnteredDate('2026-11-05', ''), '05.11.2026');
  assert.equal(formatEnteredDate('', '9:30'), '09:30');
  assert.equal(formatEnteredDate('', ''), null);
  assert.equal(formatEnteredDate('2026-13-40', '25:00'), null);
});

test('symbole 1.20: grupy z nazwami (średnica ⌀, promil, paragraf…), ostatnio użyte – najnowszy pierwszy, bez powtórzeń, najwyżej osiem', () => {
  const all = SYMBOL_GROUPS.flatMap((group) => group.symbols);
  for (const symbol of ['%', '‰', '°', '§', '⌀', '±', 'µ', 'Ω', '→']) assert.ok(all.includes(symbol), symbol);
  assert.equal(SYMBOL_NAMES['⌀'], 'średnica');
  assert.equal(SYMBOL_NAMES['‰'], 'promil');
  for (const group of SYMBOL_GROUPS) assert.equal(new Set(group.symbols).size, group.symbols.length, `bez powtórzeń w grupie ${group.label}`);
  let recent = [];
  for (const symbol of ['°', '⌀', '%', '°']) recent = rememberSymbol(recent, symbol);
  assert.deepEqual(recent, ['°', '%', '⌀']);
  for (const symbol of all.slice(0, 12)) recent = rememberSymbol(recent, symbol);
  assert.equal(recent.length, RECENT_SYMBOLS_MAX);
  assert.deepEqual(cleanRecentSymbols(['°', '°', 7, '', 'abc', '⌀', null]), ['°', '⌀']);
  assert.deepEqual(cleanRecentSymbols('°'), []);
});

test('ustawienia 1.20: grupy „Powtórka na dziś” i „Ostatnia sesja” na ekranie Nauka domyślnie widoczne', () => {
  const settings = defaultSettings();
  assert.equal(settings.studyShowReview, true);
  assert.equal(settings.studyShowLast, true);
});
