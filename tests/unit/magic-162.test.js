import { test } from 'node:test';
import assert from 'node:assert/strict';

import { docFromHtml, normalizeNoteHtml, noteText } from '../../js/core/note-format.js';
import { renameReferences } from '../../js/core/note-refs.js';
import {
  MAGIC_TEXT_MAX, activeMagicCard, cleanMagic, cleanMagicTexts, keptSigs, magicCardStatus, magicFragments, magicTermDraft, nextMagicNumber, settleMagic, stripMagic, unmarkMagic
} from '../../js/core/magic.js';
import { DEFAULT_MAGIC_COLOR, MAGIC_COLORS, MAGIC_FOLDER_COLORS, defaultSettings, magicColor, magicFolderColor } from '../../js/core/model.js';
import { createBackup, parseBackupText, restoreBackup } from '../../js/core/backup.js';
import { makeBranch, makeLibrary } from './helpers.js';

const NOTE = '<p><span data-magic="1.1">Zobowiązania</span> (<span data-magic="1.2">liabilities</span>) to <span data-magic="1.3">obecny <em>obowiązek</em> jednostki</span>.</p>'
  + '<p><span data-magic="1.4">[[Bilans]]</span></p><p>Przykład: <span data-magic="2.1">kredyt bankowy</span>.</p>';
const TABLE = { label: 'Bilans', rows: [['Aktywa', 'Pasywa'], ['Maszyny', 'Kredyt']], align: ['left', 'left'], header: true };

test('szybkie fiszki 1.62 – format notatki: <span data-magic="N.M"> zostaje (jeden na fragment, także z formatowaniem w środku), błędne sygnatury znikają, wklejanie bez oznaczeń, zwykły tekst bez sygnatur', () => {
  const html = normalizeNoteHtml(NOTE);
  assert.equal(normalizeNoteHtml(html), html, 'postać stała');
  assert.ok(html.includes('<span data-magic="1.3">obecny <em>obowiązek</em> jednostki</span>'), 'jeden span z kursywą w środku');
  assert.ok(html.includes('<p><span data-magic="1.4">[[Bilans]]</span></p>'));
  assert.equal(normalizeNoteHtml('<p><span data-magic="0.1">a</span><span data-magic="1">b</span><span data-magic="1.2x">c</span></p>'), '<p>abc</p>', 'niepoprawne sygnatury');
  assert.equal(normalizeNoteHtml(NOTE, { magic: false }).includes('data-magic'), false, 'wklejony tekst bez oznaczeń');
  assert.equal(noteText(html).includes('✦'), false);
  assert.ok(noteText(html).startsWith('Zobowiązania (liabilities) to obecny obowiązek jednostki.'));
  // Dwa fragmenty obok siebie zostają osobne; spacja między częściami jednego fragmentu – w nim.
  const runs = docFromHtml('<p><span data-magic="1.1">a</span><span data-magic="1.2">b</span></p>').blocks[0].runs;
  assert.deepEqual(runs.map((run) => run.magic), ['1.1', '1.2']);
  // Zmiana sygnatury obrazu nie zdejmuje oznaczenia odwołania.
  assert.ok(renameReferences(html, 'Bilans', 'Bilans 2024').includes('<span data-magic="1.4">[[Bilans 2024]]</span>'));
});

test('szybkie fiszki 1.62 – fragmenty z treści: tekst (bez sygnatur), odwołanie [[…]] jako obiekt, druga wersja językowa, fragment w kilku akapitach', () => {
  const fragments = magicFragments(NOTE, '<p>The <span data-magic="2.2">bank loan</span>.</p>');
  assert.deepEqual(fragments.get('1.1'), { text: 'Zobowiązania', language: 'pl', object: null });
  assert.deepEqual(fragments.get('1.3'), { text: 'obecny obowiązek jednostki', language: 'pl', object: null });
  assert.deepEqual(fragments.get('1.4'), { text: '[[Bilans]]', language: 'pl', object: 'Bilans' });
  assert.deepEqual(fragments.get('2.2'), { text: 'bank loan', language: 'en', object: null });
  const split = magicFragments('<p><span data-magic="3.1">pierwsza część</span></p><p><span data-magic="3.1">druga część</span></p>');
  assert.equal(split.get('3.1').text, 'pierwsza część druga część');
});

test('szybkie fiszki 1.62 – sprawdzanie fiszek: fragmenty spoza treści znikają, pusta fiszka znika, jedna fiszka w budowie, dodane do lekcji zostają; porządek treści (settleMagic)', () => {
  const fragments = magicFragments(NOTE);
  const raw = {
    next: 1,
    cards: [
      { no: 1, state: 'active', next: 2, frags: [{ sig: '1.1', slot: 'termPL' }, { sig: '1.2', slot: 'bad' }, { sig: '1.9', slot: null }, { sig: '2.1', slot: null }, { sig: '1.4', slot: 'media' }] },
      { no: 2, state: 'active', frags: [{ sig: '2.1', slot: 'exPL' }], sentAt: '2026-10-31T10:00:00.000Z' },
      { no: 3, state: 'folder', frags: [{ sig: '3.1', slot: null }] },
      { no: 4, state: 'done', termID: 't1', doneAt: '2026-10-31T11:00:00.000Z' },
      { no: 4, state: 'folder', frags: [] },
      { no: 'x', state: 'active', frags: [] }
    ]
  };
  const magic = cleanMagic(raw, fragments);
  assert.deepEqual(magic.cards.map((card) => [card.no, card.state]), [[1, 'active'], [2, 'folder'], [4, 'done']], 'druga „w budowie” trafia do teczki, pusta fiszka 3 znika');
  assert.deepEqual(magic.cards[0].frags, [{ sig: '1.1', slot: 'termPL' }, { sig: '1.2', slot: null }, { sig: '1.4', slot: 'media' }]);
  assert.equal(magic.cards[0].next, 5, 'następny numer fragmentu za najwyższym');
  assert.equal(magic.next, 5);
  assert.equal(activeMagicCard(magic).no, 1);
  assert.equal(nextMagicNumber(magic, fragments), 5);
  // Fragment 1.3 nie jest na żadnej fiszce – znika z treści; fragmenty fiszki dodanej do lekcji (4.x) zostałyby.
  const settled = settleMagic(raw, normalizeNoteHtml(NOTE + '<p><span data-magic="4.1">zostaje</span></p>'));
  assert.equal(settled.html.includes('data-magic="1.3"'), false);
  assert.ok(settled.html.includes('obecny <em>obowiązek</em> jednostki'), 'tekst zostaje');
  assert.ok(settled.html.includes('<span data-magic="4.1">zostaje</span>'));
  assert.deepEqual([...keptSigs(settled.magic, magicFragments(settled.html))].sort(), ['1.1', '1.2', '1.4', '2.1', '4.1']);
  assert.equal(settleMagic(null, '<p>bez</p>').magic, null);
  assert.equal(settleMagic(null, normalizeNoteHtml(NOTE)).html.includes('data-magic'), false, 'bez fiszek – bez oznaczeń');
  assert.equal(stripMagic(normalizeNoteHtml(NOTE), new Set(['1.1'])).match(/data-magic/g).length, 1);
  assert.equal(unmarkMagic(normalizeNoteHtml(NOTE), new Set(['1.1', '1.2'])).includes('data-magic="1.1"'), false);
});

test('szybkie fiszki 1.62 – stan fiszki i szkic pojęcia: teksty pól w kolejności, obraz z pola „Obraz” (tabela albo obraz), bez obrazów w innej lekcji', () => {
  const fragments = magicFragments(NOTE);
  const card = { no: 1, state: 'folder', frags: [{ sig: '1.1', slot: 'termPL' }, { sig: '1.2', slot: 'termEN' }, { sig: '1.3', slot: 'defPL' }, { sig: '1.4', slot: 'media' }] };
  assert.deepEqual(magicCardStatus(card, fragments), { count: 4, loose: 0, typed: 0, term: true, complete: true });
  assert.deepEqual(magicTermDraft(card, fragments, { tableLabels: ['Bilans'] }), {
    termPL: 'Zobowiązania', termEN: 'liabilities', descriptionPL: 'obecny obowiązek jednostki', descriptionEN: '', examplePL: '', exampleEN: '',
    cardMedia: [{ kind: 'table', label: 'Bilans' }]
  });
  assert.deepEqual(magicTermDraft(card, fragments).cardMedia, [{ kind: 'image', label: 'Bilans' }]);
  assert.deepEqual(magicTermDraft(card, fragments, { media: false }).cardMedia, []);
  const loose = { ...card, frags: [{ sig: '1.1', slot: null }, { sig: '1.3', slot: 'defPL' }] };
  assert.deepEqual(magicCardStatus(loose, fragments), { count: 2, loose: 1, typed: 0, term: false, complete: false });
});

test('szybkie fiszki 1.62 – kolor w ustawieniach: fiolet (domyślny), złoto, turkus; nieznany – domyślny', () => {
  assert.deepEqual(MAGIC_COLORS.map((item) => item.id), ['violet', 'gold', 'teal']);
  assert.equal(defaultSettings().magicColor, DEFAULT_MAGIC_COLOR);
  assert.equal(magicColor({ magicColor: 'gold' }), 'gold');
  assert.equal(magicColor({ magicColor: 'pink' }), 'violet');
});

test('szybkie fiszki 1.62.1 – kolor teczki: żółta, czarna, szara, biała; bez wyboru – żółta, przy złotej fiszce szara; własny wybór zostaje przy każdym kolorze fiszki', () => {
  assert.deepEqual(MAGIC_FOLDER_COLORS.map((item) => item.id), ['yellow', 'black', 'gray', 'white']);
  assert.equal(defaultSettings().magicFolderColor, null);
  assert.equal(magicFolderColor(defaultSettings()), 'yellow');
  assert.equal(magicFolderColor({ magicColor: 'teal' }), 'yellow');
  assert.equal(magicFolderColor({ magicColor: 'gold' }), 'gray');
  assert.equal(magicFolderColor({ magicColor: 'gold', magicFolderColor: 'black' }), 'black');
  assert.equal(magicFolderColor({ magicColor: 'violet', magicFolderColor: 'white' }), 'white');
  assert.equal(magicFolderColor({ magicColor: 'gold', magicFolderColor: 'navy' }), 'gray', 'nieznany – domyślny');
});

test('szybkie fiszki 1.62 – biblioteka: zapis notatki z fiszkami (porządek z treścią), teczka, zmiana pól i lekcji, usunięcie (tekst bez oznaczeń), pojęcie z fiszki w jednym zapisie; kopia zapasowa', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library, { lesson: 'Financial Statements' });
  const other = await library.createLesson({ name: 'Investments' }, { existing: lesson.moduleID });
  const magic = {
    next: 3,
    cards: [
      { no: 1, state: 'folder', frags: [{ sig: '1.1', slot: 'termPL' }, { sig: '1.2', slot: 'termEN' }, { sig: '1.3', slot: 'defPL' }, { sig: '1.4', slot: 'media' }], sentAt: '2026-10-31T10:00:00.000Z' },
      { no: 2, state: 'active', frags: [{ sig: '2.1', slot: null }, { sig: '2.7', slot: null }] }
    ]
  };
  const saved = await library.saveNote(lesson.id, { html: NOTE, htmlEN: '', images: [], tables: [TABLE], magic });
  assert.deepEqual(saved.magic.cards[1].frags, [{ sig: '2.1', slot: null }], 'fragmentu 2.7 nie ma w treści');
  assert.equal(library.magicFolderCount(), 1);
  const [entry] = library.magicFolder();
  assert.equal(entry.lessonID, lesson.id);
  assert.equal(entry.fragments.get('1.1').text, 'Zobowiązania');

  // Zapis bez pola magic (np. import) zostawia fiszki; tekst bez fragmentu – fiszka bez niego.
  await library.saveNote(lesson.id, { html: NOTE.replace('<span data-magic="2.1">kredyt bankowy</span>', 'kredyt bankowy'), images: [], tables: [TABLE] });
  assert.deepEqual(library.getNote(lesson.id).magic.cards.map((card) => card.no), [1], 'fiszka 2 bez fragmentów znika');

  await library.updateMagicCard(lesson.id, 1, { frags: [{ sig: '1.1', slot: 'termPL' }, { sig: '1.2', slot: 'termEN' }, { sig: '1.3', slot: null }, { sig: '1.4', slot: 'media' }], lessonID: other.id });
  let card = library.getNote(lesson.id).magic.cards[0];
  assert.equal(card.lessonID, other.id);
  assert.equal(card.frags[2].slot, null);
  await library.updateMagicCard(lesson.id, 1, { lessonID: null });
  assert.equal(library.getNote(lesson.id).magic.cards[0].lessonID, undefined, 'z powrotem lekcja notatki');

  const term = await library.createTermFromMagic({ termPL: 'Zobowiązania', termEN: 'liabilities', descriptionPL: 'obecny obowiązek', cardMedia: [{ kind: 'table', label: 'Bilans' }] },
    lesson.id, { noteLessonID: lesson.id, no: 1 });
  assert.equal(library.getTerm(term.id).descriptionPL, 'obecny obowiązek');
  assert.deepEqual(library.getTerm(term.id).cardMedia, [{ kind: 'table', label: 'Bilans' }]);
  card = library.getNote(lesson.id).magic.cards[0];
  assert.deepEqual([card.state, card.termID], ['done', term.id]);
  assert.equal(library.magicFolderCount(), 0);
  assert.ok(library.getNote(lesson.id).html.includes('data-magic="1.1"'), 'fragmenty fiszki dodanej do lekcji zostają oznaczone');
  await assert.rejects(library.updateMagicCard(lesson.id, 1, { lessonID: null }), /Tej szybkiej fiszki już nie ma/);
  await assert.rejects(library.createTermFromMagic({ termPL: 'x', termEN: '' }, lesson.id, { noteLessonID: lesson.id, no: 1 }), /po angielsku/);

  // Usunięcie fiszki z teczki – fragmenty wracają do zwykłego tekstu.
  await library.saveNote(other.id, { html: '<p><span data-magic="1.1">dywidenda</span> i reszta</p>', images: [], magic: { next: 2, cards: [{ no: 1, state: 'folder', frags: [{ sig: '1.1', slot: 'termPL' }] }] } });
  assert.equal(library.magicFolderCount(), 1);
  // Numeracja osobno w każdej lekcji: fiszka ✦1 jest jednocześnie w obu notatkach.
  assert.deepEqual([library.getNote(lesson.id).magic.cards[0].no, library.getNote(other.id).magic.cards[0].no], [1, 1]);
  assert.deepEqual(library.magicFolder().map((item) => [item.lessonID, item.card.no]), [[other.id, 1]]);
  await library.removeMagicCard(other.id, 1);
  assert.equal(library.getNote(other.id).html, '<p>dywidenda i reszta</p>');
  assert.equal(library.getNote(other.id).magic, undefined);

  // Kopia zapasowa – fiszki wracają (sprawdzone z treścią).
  const backup = await createBackup(library, '1.62.0');
  const { library: fresh } = await makeLibrary();
  await restoreBackup(fresh, parseBackupText(JSON.stringify(backup)));
  assert.deepEqual(fresh.getNote(lesson.id).magic.cards.map((item) => [item.no, item.state, item.termID]), [[1, 'done', term.id]]);
  assert.ok(fresh.getNote(lesson.id).html.includes('data-magic="1.4"'));
});

test('szybkie fiszki 1.63 – tekst wpisany ręcznie w polach: sprawdzanie (pola tekstowe, bez pustych, najwyżej 500 znaków), dopisany za fragmentami w szkicu pojęcia, liczy się do stanu; fiszka z samym tekstem zostaje; zapis w bibliotece', async () => {
  assert.equal(cleanMagicTexts(null), null);
  assert.deepEqual(cleanMagicTexts({ termPL: '  dług  ', termEN: '', media: 'obraz', defPL: 5, exEN: 'x'.repeat(600) }), { termPL: 'dług', exEN: 'x'.repeat(MAGIC_TEXT_MAX) });
  const html = '<p><span data-magic="1.1">Zobowiązania</span> to obowiązki firmy.</p>';
  const fragments = magicFragments(html);
  const card = { no: 1, state: 'folder', next: 2, frags: [{ sig: '1.1', slot: 'termPL' }], texts: { termPL: 'finansowe', termEN: 'liabilities', defPL: 'Obecny obowiązek jednostki.' } };
  const draft = magicTermDraft(card, fragments);
  assert.deepEqual([draft.termPL, draft.termEN, draft.descriptionPL], ['Zobowiązania finansowe', 'liabilities', 'Obecny obowiązek jednostki.']);
  assert.deepEqual(magicCardStatus(card, fragments), { count: 1, loose: 0, typed: 3, term: true, complete: true });
  // Fiszka bez fragmentów, ale z tekstem – zostaje (z tekstem); bez obu – znika.
  const cleaned = cleanMagic({ next: 3, cards: [{ no: 1, state: 'active', next: 1, frags: [], texts: { termEN: 'equity' } }, { no: 2, state: 'folder', next: 1, frags: [] }] }, fragments);
  assert.deepEqual(cleaned.cards, [{ no: 1, state: 'active', frags: [], next: 1, texts: { termEN: 'equity' } }]);
  // Biblioteka: zapis tekstu w fiszce z teczki i usunięcie (pusty).
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library);
  await library.saveNote(lesson.id, { html, magic: { next: 2, cards: [{ no: 1, state: 'folder', next: 2, frags: [{ sig: '1.1', slot: null }] }] } });
  await library.updateMagicCard(lesson.id, 1, { texts: { termEN: ' liabilities ', defEN: '' } });
  assert.deepEqual(library.getNote(lesson.id).magic.cards[0].texts, { termEN: 'liabilities' });
  await library.updateMagicCard(lesson.id, 1, { texts: {} });
  assert.equal('texts' in library.getNote(lesson.id).magic.cards[0], false);
});
