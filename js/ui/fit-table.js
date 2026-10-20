// Tabela pasowań ISO 286 (od 1.25): pasowania zalecane (dotknięcie – wybór od razu) i dowolna klasa
// tolerancji albo pasowanie złożone z litery i klasy dokładności otworu i wałka. Od 1.26 tytuł okna
// „Tabela pasowań” (krótszy – mieści się na telefonie), norma – w podpowiedzi.

import { HOLE_LETTERS, IT_GRADES, PREFERRED_FITS, SHAFT_LETTERS, isTableFit, toleranceClass } from '../core/fits.js';
import { field, segmented } from './components.js';
import { openFormSheet } from './dialogs.js';
import { h } from './dom.js';

const chip = (label, testID, onClick) => h('button', { type: 'button', class: 'drawing__chip drawing__fit-chip', 'aria-pressed': 'false', dataset: { testid: testID }, onClick }, label);
const testName = (fit) => fit.replace('/', '-');

/**
 * Okno „Tabela pasowań”: onPick(fit) – wybrane pasowanie albo klasa („H7/g6”, „H7”, „g6”).
 * value – bieżące pasowanie (zaznaczone w budowaniu, gdy jest z tabeli).
 */
export function openFitTable({ value = '', onPick }) {
  let sheet = null;
  const [initialHole, initialShaft] = value.includes('/') ? value.split('/') : /^[A-Z]/.test(value) ? [value, ''] : ['', value];
  const parse = (text, letters) => {
    const match = /^([A-Za-z]{1,2})(\d{1,2})$/.exec(text ?? '');
    return match && letters.includes(match[1]) && IT_GRADES.includes(match[2]) ? { letter: match[1], grade: match[2] } : null;
  };
  const choice = {
    mode: value.includes('/') ? 'fit' : /^[a-z]/.test(value) ? 'shaft' : 'hole',
    hole: parse(initialHole, HOLE_LETTERS) ?? { letter: 'H', grade: '7' },
    shaft: parse(initialShaft, SHAFT_LETTERS) ?? { letter: 'g', grade: '6' }
  };
  const preview = h('p', { class: 'drawing__dim-preview', dataset: { testid: 'fit-table-preview' } });
  const result = () => (choice.mode === 'hole' ? toleranceClass(choice.hole.letter, choice.hole.grade)
    : choice.mode === 'shaft' ? toleranceClass(choice.shaft.letter, choice.shaft.grade)
      : `${toleranceClass(choice.hole.letter, choice.hole.grade)}/${toleranceClass(choice.shaft.letter, choice.shaft.grade)}`);

  /** Litery i klasy dokładności otworu albo wałka. */
  function builder(kind) {
    const letters = kind === 'hole' ? HOLE_LETTERS : SHAFT_LETTERS;
    const letterChips = letters.map((letter) => chip(letter, `fit-table-${kind}-letter-${letter}`, () => {
      choice[kind].letter = letter;
      refresh();
    }));
    const gradeChips = IT_GRADES.map((grade) => chip(grade, `fit-table-${kind}-grade-${grade}`, () => {
      choice[kind].grade = grade;
      refresh();
    }));
    const box = h('div', { class: 'drawing__fit-builder' },
      h('p', { class: 'drawing__settings-label' }, kind === 'hole' ? 'Otwór – położenie pola (litera)' : 'Wałek – położenie pola (litera)'),
      h('div', { class: 'drawing__quick' }, letterChips),
      h('p', { class: 'drawing__settings-label' }, 'Klasa dokładności IT'),
      h('div', { class: 'drawing__quick' }, gradeChips));
    box.update = () => {
      for (const button of letterChips) button.setAttribute('aria-pressed', String(button.textContent === choice[kind].letter));
      for (const button of gradeChips) button.setAttribute('aria-pressed', String(button.textContent === choice[kind].grade));
    };
    return box;
  }
  const builders = { hole: builder('hole'), shaft: builder('shaft') };
  function refresh() {
    builders.hole.hidden = choice.mode === 'shaft';
    builders.shaft.hidden = choice.mode === 'hole';
    builders.hole.update();
    builders.shaft.update();
    preview.textContent = `Wybrane: ${result()}`;
  }
  const pick = (fit) => {
    onPick(fit);
    sheet?.close();
  };
  openFormSheet({
    title: 'Tabela pasowań',
    submitLabel: 'Wybierz',
    build: (api) => {
      sheet = api;
      return [
        ...PREFERRED_FITS.map((system) => field(system.label, h('div', null, system.groups.map((group) => h('div', { class: 'drawing__fit-group' },
          h('span', { class: 'drawing__fit-kind' }, group.label),
          h('div', { class: 'drawing__quick' }, group.fits.map((fit) => chip(fit, `fit-table-${testName(fit)}`, () => pick(fit))))))))),
        field('Dowolna klasa tolerancji albo pasowanie', h('div', null, segmented({
          name: `fit-table-mode-${Date.now()}`, label: 'Co wybierasz', value: choice.mode,
          options: [{ value: 'hole', label: 'Otwór' }, { value: 'shaft', label: 'Wałek' }, { value: 'fit', label: 'Pasowanie' }],
          onChange: (mode) => {
            choice.mode = mode;
            refresh();
          }
        }), builders.hole, builders.shaft, preview)),
        h('p', { class: 'field__hint' }, 'Klasy tolerancji i pasowania według ISO 286. Wielka litera – otwór, mała – wałek; liczba – klasa dokładności IT. Pasowanie – klasa otworu i wałka (H7/g6). '
          + 'W oknie tolerancji widać tylko ostatnio wybrane.')
      ];
    },
    onSubmit: () => {
      const fit = result();
      if (!isTableFit(fit)) return false;
      onPick(fit);
      return true;
    }
  });
  refresh();
}
