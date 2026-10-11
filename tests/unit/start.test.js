import assert from 'node:assert/strict';
import test from 'node:test';
import { summarySentence } from '../../js/ui/screens/start.js';

test('zdanie podsumowujące bibliotekę odmienia liczebniki', () => {
  assert.equal(summarySentence({ terms: 40, lessons: 13 }), 'Masz 40 pojęć w 13 lekcjach.');
  assert.equal(summarySentence({ terms: 1, lessons: 1 }), 'Masz 1 pojęcie w 1 lekcji.');
  assert.equal(summarySentence({ terms: 3, lessons: 2 }), 'Masz 3 pojęcia w 2 lekcjach.');
  assert.equal(summarySentence({ terms: 22, lessons: 5 }), 'Masz 22 pojęcia w 5 lekcjach.');
});

test('zdanie podsumowujące opisuje bibliotekę bez pojęć', () => {
  assert.equal(summarySentence({ terms: 0, lessons: 0 }), 'Biblioteka nie ma jeszcze lekcji ani pojęć.');
  assert.equal(summarySentence({ terms: 0, lessons: 1 }), 'Masz 1 lekcję, ale jeszcze żadnego pojęcia.');
  assert.equal(summarySentence({ terms: 0, lessons: 5 }), 'Masz 5 lekcji, ale jeszcze żadnego pojęcia.');
});
