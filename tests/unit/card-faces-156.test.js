// 1.56: strony fiszki – kierunki obrotów, dowolne części strony, własne strony pojęcia i obrazy z notatki na stronach.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBackup, parseBackupText, restoreBackup } from '../../js/core/backup.js';
import {
  CARD_MEDIA_LIMIT, FLIP_TURNS, MEDIA_FACE, RETURN_TURN, cleanCardFaces, cleanCardMedia, emptyCardFaces, faceKind, faceParts,
  flipFaces, mediaOnFace, termCardFaces
} from '../../js/core/card-faces.js';
import { emptyTermDraft, termFieldsFromDraft, termToDraft } from '../../js/core/model.js';
import { addTerm, makeBranch, makeLibrary } from './helpers.js';

test('kierunki: dwa obroty w poziomie, trzeci w pionie, powrót z dołu do góry', () => {
  assert.deepEqual(FLIP_TURNS, ['left', 'right', 'down']);
  assert.equal(RETURN_TURN, 'up');
});

test('części strony: każdy niepusty zestaw ma swój rodzaj, kolejność bez znaczenia; pusty – sam obraz z notatki', () => {
  assert.equal(faceKind(['answer']), 'answer');
  assert.equal(faceKind(['description', 'answer']), 'answer-description');
  assert.equal(faceKind(['example', 'answer']), 'answer-example');
  assert.equal(faceKind(['example', 'description']), 'details');
  assert.equal(faceKind(['example', 'answer', 'description']), 'all');
  assert.equal(faceKind([]), MEDIA_FACE);
  assert.deepEqual([...faceParts('answer-example')], ['answer', 'example']);
  assert.deepEqual([...faceParts(MEDIA_FACE)], []);
  // Nowe rodzaje w ustawieniach nauki – zapisane i odczytane.
  assert.deepEqual(flipFaces(3, { 3: ['answer-description', 'answer-example', 'example'] }), ['answer-description', 'answer-example', 'example']);
  assert.deepEqual(flipFaces(2, { 2: [MEDIA_FACE, 'nic'] }), ['answer', 'details'], 'w ustawieniach nauki bez stron z samym obrazem');
});

test('własne strony pojęcia: sprawdzenie zapisu', () => {
  assert.equal(cleanCardFaces(null), null);
  assert.equal(cleanCardFaces({ front: 'term', faces: [] }), null);
  assert.equal(cleanCardFaces({ front: 'term', faces: ['nic'] }), null);
  assert.deepEqual(cleanCardFaces({ front: 'zle', faces: ['answer', 'nic', MEDIA_FACE, 'all', 'details'] }),
    { front: 'term', faces: ['answer', MEDIA_FACE] }, 'najwyżej 3 strony, złe pominięte, zły front – pojęcie');
  assert.deepEqual(cleanCardFaces({ front: 'example', faces: ['answer-description'] }), { front: 'example', faces: ['answer-description'] });
});

test('obrazy na stronach: rodzaj, sygnatura, strona 0–3, bez powtórzeń, najwyżej 6', () => {
  assert.deepEqual(cleanCardMedia(null), []);
  assert.deepEqual(cleanCardMedia([
    { kind: 'image', label: '  Schemat   bilansu ', face: 9 },
    { kind: 'image', label: 'schemat bilansu', face: 1 },
    { kind: 'table', label: 'Schemat bilansu', face: -2 },
    { kind: 'file', label: 'x', face: 1 },
    { kind: 'image', label: '', face: 1 },
    { kind: 'image', label: 'Wykres', face: 1.5 }
  ]), [
    { kind: 'image', label: 'Schemat bilansu', face: 3 },
    { kind: 'table', label: 'Schemat bilansu', face: 0 },
    { kind: 'image', label: 'Wykres', face: 0 }
  ]);
  const many = Array.from({ length: 9 }, (_, index) => ({ kind: 'image', label: `Obraz ${index}`, face: 1 }));
  assert.equal(cleanCardMedia(many).length, CARD_MEDIA_LIMIT);
  assert.equal(cleanCardMedia([{ kind: 'image', label: 'x'.repeat(60), face: 1 }])[0].label.length, 40);
});

test('strony fiszki w sesji: własne strony pojęcia przed ustawieniami; obraz dalej niż ostatnia strona – na ostatniej', () => {
  const plain = { cardFaces: null };
  assert.deepEqual(termCardFaces(plain, 'description', ['answer', 'details']), { front: 'description', faces: ['answer', 'details'] });
  assert.deepEqual(termCardFaces(plain, 'zle', ['all']), { front: 'term', faces: ['all'] });
  const own = { cardFaces: { front: 'example', faces: ['answer', MEDIA_FACE] } };
  assert.deepEqual(termCardFaces(own, 'term', ['all']), { front: 'example', faces: ['answer', MEDIA_FACE] });

  const term = { cardMedia: [{ kind: 'image', label: 'A', face: 0 }, { kind: 'table', label: 'B', face: 2 }, { kind: 'image', label: 'C', face: 3 }] };
  assert.deepEqual(mediaOnFace(term, 0, 2).map((item) => item.label), ['A']);
  assert.deepEqual(mediaOnFace(term, 1, 2).map((item) => item.label), ['B', 'C'], '1 obrót – wszystko dalej na odwrocie');
  assert.deepEqual(mediaOnFace(term, 2, 4).map((item) => item.label), ['B']);
  assert.deepEqual(mediaOnFace(term, 3, 4).map((item) => item.label), ['C']);
  assert.deepEqual(mediaOnFace({}, 0, 2), []);
});

test('pusta strona: sama treść z notatki bez przypiętego obrazu', () => {
  const faces = { front: 'term', faces: ['answer', MEDIA_FACE, MEDIA_FACE] };
  assert.deepEqual(emptyCardFaces(faces, []), [2, 3]);
  assert.deepEqual(emptyCardFaces(faces, [{ kind: 'image', label: 'A', face: 2 }]), [3]);
  assert.deepEqual(emptyCardFaces(faces, [{ kind: 'image', label: 'A', face: 2 }, { kind: 'table', label: 'B', face: 3 }]), []);
  assert.deepEqual(emptyCardFaces({ front: 'term', faces: [MEDIA_FACE] }, [{ kind: 'image', label: 'A', face: 3 }]), [], 'obraz z dalszej strony – na ostatniej');
  assert.deepEqual(emptyCardFaces(null, []), []);
});

test('pojęcie: szkic → zapis → szkic z własnymi stronami i obrazami; bez nich – null i []', () => {
  const draft = {
    ...emptyTermDraft(), termPL: 'aktywa', termEN: 'assets',
    cardFaces: { front: 'description', faces: ['answer', MEDIA_FACE] },
    cardMedia: [{ kind: 'table', label: 'Koszty', face: 2 }, { kind: 'zle', label: 'x', face: 1 }]
  };
  const fields = termFieldsFromDraft(draft);
  assert.deepEqual(fields.cardFaces, { front: 'description', faces: ['answer', MEDIA_FACE] });
  assert.deepEqual(fields.cardMedia, [{ kind: 'table', label: 'Koszty', face: 2 }]);
  const back = termToDraft({ ...fields, id: 't1' });
  assert.deepEqual([back.cardFaces, back.cardMedia], [fields.cardFaces, fields.cardMedia]);
  back.cardFaces.faces.push('all');
  back.cardMedia[0].face = 0;
  assert.deepEqual([fields.cardFaces.faces.length, fields.cardMedia[0].face], [2, 2], 'szkic to kopia');
  const old = termToDraft({ termPL: 'a', termEN: 'b' });
  assert.deepEqual([old.cardFaces, old.cardMedia], [null, []], 'pojęcie sprzed 1.56');
  assert.deepEqual([termFieldsFromDraft(emptyTermDraft()).cardFaces, termFieldsFromDraft(emptyTermDraft()).cardMedia], [null, []]);
});

test('biblioteka: zapis pojęcia, import z arkusza nie kasuje stron i obrazów, kopia zapasowa – te same', async () => {
  const { library } = await makeLibrary();
  const { lesson } = await makeBranch(library, { domain: 'BE', module: 'Finance', lesson: 'Ratios' });
  const term = await addTerm(library, lesson, 'bilans', 'balance sheet', {
    cardFaces: { front: 'term', faces: ['answer', 'answer-example'] },
    cardMedia: [{ kind: 'image', label: 'Schemat', face: 1 }]
  });
  assert.deepEqual(library.getTerm(term.id).cardFaces, { front: 'term', faces: ['answer', 'answer-example'] });

  // Aktualizacja z arkusza (bez tych kolumn) – strony i obrazy zostają.
  const rows = [{ domain: 'BE', module: 'Finance', lesson: 'Ratios', term: { termPL: 'bilans', termEN: 'balance sheet', descriptionPL: 'opis' } }];
  await library.importRows(rows, { duplicates: 'update' });
  const updated = library.getTerm(term.id);
  assert.equal(updated.descriptionPL, 'opis');
  assert.deepEqual(updated.cardMedia, [{ kind: 'image', label: 'Schemat', face: 1 }]);
  assert.deepEqual(updated.cardFaces, { front: 'term', faces: ['answer', 'answer-example'] });
  // Ten sam wiersz jeszcze raz – nic się nie zmienia (porównanie także obiektów).
  const report = await library.importRows(rows, { duplicates: 'update' });
  assert.deepEqual([report.updated, report.unchanged], [0, 1]);

  const text = JSON.stringify(await createBackup(library, '1.56.0'));
  const { library: fresh } = await makeLibrary();
  await restoreBackup(fresh, parseBackupText(text));
  const restored = fresh.getTerm(term.id);
  assert.deepEqual([restored.cardFaces, restored.cardMedia], [updated.cardFaces, updated.cardMedia]);
});
