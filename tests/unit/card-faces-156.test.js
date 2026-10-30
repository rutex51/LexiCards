// 1.56 (1.56.1): strony fiszki – kierunki obrotów, dowolne części strony (z „Obrazem”), własne strony pojęcia i obrazy z notatki.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBackup, parseBackupText, restoreBackup } from '../../js/core/backup.js';
import {
  CARD_MEDIA_LIMIT, FLIP_TURN, FLIP_TURN_LABEL, MEDIA_FACE, MEDIA_PART, cleanCardFaces, cleanCardMedia, emptyCardFaces, faceKind,
  faceParts, flipFaces, hasMediaPart, mediaFaces, mediaOnFace, termCardFaces
} from '../../js/core/card-faces.js';
import { emptyTermDraft, termFieldsFromDraft, termToDraft } from '../../js/core/model.js';
import { addTerm, makeBranch, makeLibrary } from './helpers.js';

test('kierunek (od 1.56.2): każdy obrót, także powrót do pytania – od prawej do lewej', () => {
  assert.equal(FLIP_TURN, 'right');
  assert.equal(FLIP_TURN_LABEL, 'od prawej do lewej');
});

test('części strony: każdy niepusty zestaw ma swój rodzaj, kolejność bez znaczenia; „Obraz” jako czwarta część', () => {
  assert.equal(faceKind(['answer']), 'answer');
  assert.equal(faceKind(['description', 'answer']), 'answer-description');
  assert.equal(faceKind(['example', 'answer']), 'answer-example');
  assert.equal(faceKind(['example', 'description']), 'details');
  assert.equal(faceKind(['example', 'answer', 'description']), 'all');
  assert.equal(faceKind([MEDIA_PART, 'answer']), 'answer+media');
  assert.equal(faceKind(['example', MEDIA_PART, 'description']), 'details+media');
  assert.equal(faceKind([MEDIA_PART]), MEDIA_FACE);
  assert.equal(faceKind([]), null);
  assert.deepEqual([...faceParts('answer-example')], ['answer', 'example']);
  assert.deepEqual([...faceParts('all+media')], ['answer', 'description', 'example', MEDIA_PART]);
  assert.deepEqual([...faceParts(MEDIA_FACE)], [MEDIA_PART]);
  assert.deepEqual([...faceParts('zle+media')], []);
  assert.deepEqual([...faceParts('answer+media+media')], []);
  assert.equal(hasMediaPart('details+media'), true);
  assert.equal(hasMediaPart('details'), false);
  // Nowe rodzaje w ustawieniach Nauki – zapisane i odczytane (od 1.56.1 także z obrazem).
  assert.deepEqual(flipFaces(3, { 3: ['answer-description', 'answer-example+media', MEDIA_FACE] }), ['answer-description', 'answer-example+media', MEDIA_FACE]);
  assert.deepEqual(flipFaces(2, { 2: ['nic', 'zle+media'] }), ['answer', 'details']);
});

test('własne strony pojęcia: sprawdzenie zapisu', () => {
  assert.equal(cleanCardFaces(null), null);
  assert.equal(cleanCardFaces({ front: 'term', faces: [] }), null);
  assert.equal(cleanCardFaces({ front: 'term', faces: ['nic'] }), null);
  assert.deepEqual(cleanCardFaces({ front: 'zle', faces: ['answer+media', 'nic', MEDIA_FACE, 'all', 'details'] }),
    { front: 'term', faces: ['answer+media', MEDIA_FACE] }, 'najwyżej 3 strony, złe pominięte, zły front – pojęcie');
  assert.deepEqual(cleanCardFaces({ front: 'example', faces: ['answer-description'] }), { front: 'example', faces: ['answer-description'] });
});

test('obrazy pojęcia: rodzaj i sygnatura, bez powtórzeń, najwyżej 6; numer strony z 1.56 pomijany', () => {
  assert.deepEqual(cleanCardMedia(null), []);
  assert.deepEqual(cleanCardMedia([
    { kind: 'image', label: '  Schemat   bilansu ', face: 3 },
    { kind: 'image', label: 'schemat bilansu' },
    { kind: 'table', label: 'Schemat bilansu', face: 0 },
    { kind: 'file', label: 'x' },
    { kind: 'image', label: '' },
    { kind: 'image', label: 'Wykres' }
  ]), [
    { kind: 'image', label: 'Schemat bilansu' },
    { kind: 'table', label: 'Schemat bilansu' },
    { kind: 'image', label: 'Wykres' }
  ]);
  const many = Array.from({ length: 9 }, (_, index) => ({ kind: 'image', label: `Obraz ${index}` }));
  assert.equal(cleanCardMedia(many).length, CARD_MEDIA_LIMIT);
  assert.equal(cleanCardMedia([{ kind: 'image', label: 'x'.repeat(60) }])[0].label.length, 40);
});

test('strony fiszki w sesji: własne strony przed ustawieniami; bez obrazów część „Obraz” znika, strona z samym obrazem – cała', () => {
  const media = [{ kind: 'image', label: 'A' }, { kind: 'table', label: 'B' }];
  assert.deepEqual(termCardFaces({ cardFaces: null }, 'description', ['answer', 'details']), { front: 'description', faces: ['answer', 'details'] });
  assert.deepEqual(termCardFaces({ cardFaces: null }, 'zle', ['all']), { front: 'term', faces: ['all'] });
  const own = { cardFaces: { front: 'example', faces: ['answer+media', MEDIA_FACE] } };
  assert.deepEqual(termCardFaces({ ...own, cardMedia: media }, 'term', ['all']), { front: 'example', faces: ['answer+media', MEDIA_FACE] });
  assert.deepEqual(termCardFaces(own, 'term', ['all']), { front: 'example', faces: ['answer'] }, 'pojęcie bez obrazów');
  assert.deepEqual(termCardFaces({}, 'term', ['details+media', MEDIA_FACE]), { front: 'term', faces: ['details'] });
  assert.deepEqual(termCardFaces({}, 'term', [MEDIA_FACE]), { front: 'term', faces: ['all'] }, 'żadna strona nie została');
});

test('obrazy na stronach: strony z częścią „Obraz”, bez niej – ostatnia; pytanie bez obrazów', () => {
  const term = { cardMedia: [{ kind: 'image', label: 'A' }, { kind: 'table', label: 'B' }] };
  assert.deepEqual(mediaFaces(['answer', 'details']), [2]);
  assert.deepEqual(mediaFaces(['all']), [1]);
  assert.deepEqual(mediaFaces(['answer+media', 'description', 'example+media']), [1, 3]);
  assert.deepEqual(mediaOnFace(term, 2, ['answer', 'details']).map((item) => item.label), ['A', 'B'], 'wszystkie przypięte');
  assert.deepEqual(mediaOnFace(term, 1, ['answer', 'details']), []);
  assert.deepEqual(mediaOnFace(term, 1, ['answer+media', 'details']).map((item) => item.label), ['A', 'B']);
  assert.deepEqual(mediaOnFace(term, 2, ['answer+media', 'details']), []);
  assert.deepEqual(mediaOnFace(term, 0, ['answer']), []);
  assert.deepEqual(mediaOnFace({}, 1, ['all']), []);
});

test('pusta strona: sam obraz, a pojęcie nie ma przypiętego obrazu', () => {
  const faces = { front: 'term', faces: ['answer', MEDIA_FACE, 'details+media'] };
  assert.deepEqual(emptyCardFaces(faces, []), [2]);
  assert.deepEqual(emptyCardFaces(faces, [{ kind: 'image', label: 'A' }]), []);
  assert.deepEqual(emptyCardFaces(null, []), []);
});

test('pojęcie: szkic → zapis → szkic z własnymi stronami i obrazami; bez nich – null i []', () => {
  const draft = {
    ...emptyTermDraft(), termPL: 'aktywa', termEN: 'assets',
    cardFaces: { front: 'description', faces: ['answer', MEDIA_FACE] },
    cardMedia: [{ kind: 'table', label: 'Koszty', face: 2 }, { kind: 'zle', label: 'x' }]
  };
  const fields = termFieldsFromDraft(draft);
  assert.deepEqual(fields.cardFaces, { front: 'description', faces: ['answer', MEDIA_FACE] });
  assert.deepEqual(fields.cardMedia, [{ kind: 'table', label: 'Koszty' }]);
  const back = termToDraft({ ...fields, id: 't1' });
  assert.deepEqual([back.cardFaces, back.cardMedia], [fields.cardFaces, fields.cardMedia]);
  back.cardFaces.faces.push('all');
  back.cardMedia[0].label = 'Inna';
  assert.deepEqual([fields.cardFaces.faces.length, fields.cardMedia[0].label], [2, 'Koszty'], 'szkic to kopia');
  const old = termToDraft({ termPL: 'a', termEN: 'b' });
  assert.deepEqual([old.cardFaces, old.cardMedia], [null, []], 'pojęcie sprzed 1.56');
  assert.deepEqual([termFieldsFromDraft(emptyTermDraft()).cardFaces, termFieldsFromDraft(emptyTermDraft()).cardMedia], [null, []]);
});

test('biblioteka: zapis pojęcia, import z arkusza nie kasuje stron i obrazów, kopia zapasowa – te same', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library, { domain: 'BE', module: 'Finance', lesson: 'Ratios' });
  assert.equal(library.hasCardMedia(), false);
  const term = await addTerm(library, lesson, 'bilans', 'balance sheet', {
    cardFaces: { front: 'term', faces: ['answer', 'answer-example+media'] },
    cardMedia: [{ kind: 'image', label: 'Schemat' }]
  });
  assert.deepEqual(library.getTerm(term.id).cardFaces, { front: 'term', faces: ['answer', 'answer-example+media'] });
  assert.equal(library.hasCardMedia(), true);

  // Aktualizacja z arkusza (bez tych kolumn) – strony i obrazy zostają.
  const rows = [{ domain: 'BE', module: 'Finance', lesson: 'Ratios', term: { termPL: 'bilans', termEN: 'balance sheet', descriptionPL: 'opis' } }];
  await library.importRows(rows, { duplicates: 'update' });
  const updated = library.getTerm(term.id);
  assert.equal(updated.descriptionPL, 'opis');
  assert.deepEqual(updated.cardMedia, [{ kind: 'image', label: 'Schemat' }]);
  assert.deepEqual(updated.cardFaces, { front: 'term', faces: ['answer', 'answer-example+media'] });
  // Ten sam wiersz jeszcze raz – nic się nie zmienia (porównanie także obiektów).
  const report = await library.importRows(rows, { duplicates: 'update' });
  assert.deepEqual([report.updated, report.unchanged], [0, 1]);

  const text = JSON.stringify(await createBackup(library, '1.56.0'));
  const { library: fresh } = await makeLibrary();
  await restoreBackup(fresh, parseBackupText(text));
  const restored = fresh.getTerm(term.id);
  assert.deepEqual([restored.cardFaces, restored.cardMedia], [updated.cardFaces, updated.cardMedia]);
});
