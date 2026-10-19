// Podział notatki na strony (wersja 1.3): znacznik w HTML, podział strony z Worda, zwykły tekst
// i tekst sformatowany komórki arkusza (eksport → import bez zmian).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PAGE_BREAK_LINE, docFromHtml, docFromRichText, htmlFromDoc, isEmptyNoteHtml, noteText, normalizeNoteHtml,
  portableNoteHtml, richTextFromDoc
} from '../../js/core/note-format.js';

const BREAK = '<hr data-page="">';

test('podział strony: <hr data-page> zostaje, zwykła linia pozioma tylko kończy akapit', () => {
  assert.equal(normalizeNoteHtml(`<p>A</p>${BREAK}<p>B</p>`), `<p>A</p>${BREAK}<p>B</p>`);
  assert.equal(normalizeNoteHtml('<p>A</p><hr><p>B</p>'), '<p>A</p><p>B</p>');
  assert.equal(normalizeNoteHtml('<p>A<hr data-page>B</p>'), `<p>A</p>${BREAK}<p>B</p>`, 'podział w środku akapitu');
  assert.equal(normalizeNoteHtml('<ul><li>a</li></ul><hr data-page=""><ul><li>b</li></ul>'), `<ul><li>a</li></ul>${BREAK}<ul><li>b</li></ul>`);
  assert.equal(normalizeNoteHtml(`<hr data-page="" onclick="alert(1)"><p>A</p>`), '<p>A</p>', 'bez atrybutów i bez pustej strony na początku');
});

test('podział strony: bez pustych stron – na początku, na końcu i dwa z rzędu', () => {
  assert.equal(normalizeNoteHtml(`${BREAK}${BREAK}<p>A</p>${BREAK}${BREAK}${BREAK}<p>B</p>${BREAK}`), `<p>A</p>${BREAK}<p>B</p>`);
  assert.equal(isEmptyNoteHtml(`${BREAK}${BREAK}`), true);
  assert.equal(normalizeNoteHtml(`<p> </p>${BREAK}<p></p>`), '');
  assert.deepEqual(htmlFromDoc({ blocks: [{ type: 'break' }, { type: 'p', runs: [{ text: 'A' }] }, { type: 'break' }] }), '<p>A</p>');
});

test('podział strony z Worda i z przeglądarki (page-break-before, break-before) zaczyna nową stronę', () => {
  const word = '<p class=MsoNormal>Strona pierwsza</p><br clear=all style="mso-special-character:line-break;page-break-before:always"><p class=MsoNormal>Strona druga</p>';
  assert.equal(normalizeNoteHtml(word), `<p>Strona pierwsza</p>${BREAK}<p>Strona druga</p>`);
  assert.equal(normalizeNoteHtml('<p>A</p><h2 style="break-before: page">B</h2>'), `<p>A</p>${BREAK}<h3>B</h3>`);
  assert.equal(normalizeNoteHtml('<p>A</p><p style="page-break-before:auto">B</p>'), '<p>A</p><p>B</p>');
});

test('podział strony w zwykłym tekście, w podglądzie na liście i przy kopiowaniu', () => {
  const html = `<h3>Wstęp</h3><p>A</p>${BREAK}<ol><li>x</li></ol>`;
  assert.equal(noteText(html), `Wstęp\n\nA\n\n${PAGE_BREAK_LINE}\n\n1. x`);
  assert.equal(portableNoteHtml(html), html, 'w schowku znacznik zostaje (inne aplikacje pokażą linię)');
  // Wklejenie notatki skopiowanej z aplikacji odtwarza podział.
  assert.equal(normalizeNoteHtml(portableNoteHtml(html)), html);
});

test('podział strony w komórce arkusza: wiersz „---”; eksport i import dają tę samą notatkę', () => {
  const html = `<h3>Bilans</h3><p>Aktywa i pasywa.</p>${BREAK}<ul><li>pierwszy</li><li>drugi</li></ul>${BREAK}<p>Koniec</p>`;
  const runs = richTextFromDoc(docFromHtml(html));
  const text = runs.map((run) => run.text).join('');
  assert.equal(text, 'Bilans\nAktywa i pasywa.\n\n---\n\n• pierwszy\n• drugi\n\n---\n\nKoniec');
  // Odczyt komórki z pliku daje rozmiar czcionki każdego fragmentu (zwykły tekst: 11).
  assert.equal(htmlFromDoc(docFromRichText(runs.map((run) => ({ size: 11, ...run })))), html);

  // Komórka wpisana ręcznie: „---” w osobnym wierszu, także z odstępami; „---” w tekście zostaje tekstem.
  const typed = docFromRichText([{ text: 'Strona 1\n  ---  \nStrona 2\nwynik --- dalej\n---' }]);
  assert.equal(htmlFromDoc(typed), `<p>Strona 1</p>${BREAK}<p>Strona 2<br>wynik --- dalej</p>`);
  assert.deepEqual(docFromRichText([{ text: '---\n---' }]).blocks, [], 'same podziały to pusta notatka');
});
