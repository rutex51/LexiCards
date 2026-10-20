// Okno edycji tabeli (od 1.21) – wspólne dla notatki i rysunku: siatka pól (komórki), wiersze
// i kolumny dodawane i usuwane przy komórce z kursorem, nagłówek (pierwszy wiersz, pierwsza
// kolumna), wyrównanie kolumn i wklejanie z Excela (tekst z tabulatorami) albo tabeli z Worda
// czy strony WWW – od komórki z kursorem, tabela powiększa się sama.

import { TABLE_ALIGNS, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, cleanTable, isEmptyTable, parseTableText, rowsFromHtml } from '../core/tables.js';
import { toggle } from './components.js';
import { openFormSheet } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';

const ALIGN_ICONS = { left: 'alignLeft', center: 'alignCenter', right: 'alignRight' };
const ALIGN_LABELS = { left: 'do lewej', center: 'do środka', right: 'do prawej' };

/**
 * Otwiera okno tabeli. table – tabela do poprawki (kopia; null – nowa 3 × 3), extra – dodatkowe
 * pola pod tabelą (np. wielkość i kolor w rysunku), allowEmpty – czy pusta tabela może być zapisana.
 * onSave(table) – po zamknięciu okna przyciskiem zapisu (sprawdzona tabela).
 */
export function openTableEditor({ title = 'Tabela', submitLabel = 'Zapisz', table = null, extra = null, allowEmpty = false, onSave }) {
  const source = cleanTable(table) ?? cleanTable({ rows: [['', '', ''], ['', '', ''], ['', '', '']] });
  const state = { rows: source.rows.map((row) => [...row]), header: source.header, headerColumn: source.headerColumn, align: [...source.align] };
  /** Komórka z kursorem [wiersz, kolumna] – tam działają przyciski wierszy i kolumn. */
  let focus = [0, 0];
  let saved = null;
  const grid = h('div', { class: 'table-editor__scroll' });
  const status = h('p', { class: 'field__hint table-editor__status', role: 'status' });

  const columns = () => state.rows[0].length;
  const say = (text) => { status.textContent = text; };

  function render(focusCell = focus) {
    const head = h('tr', { class: 'table-editor__controls' },
      state.align.map((align, column) => h('th', null, h('button', {
        type: 'button', class: 'table-editor__align', 'aria-label': `Kolumna ${column + 1}: wyrównanie ${ALIGN_LABELS[align]} – zmień`,
        title: `Wyrównanie ${ALIGN_LABELS[align]}`, dataset: { testid: `table-align-${column}` },
        onClick: () => {
          state.align[column] = TABLE_ALIGNS[(TABLE_ALIGNS.indexOf(align) + 1) % TABLE_ALIGNS.length];
          render();
        }
      }, icon(ALIGN_ICONS[align], { size: 18 })))));
    const body = state.rows.map((row, rowIndex) => h('tr', null, row.map((cell, column) => {
      const heading = (state.header && rowIndex === 0) || (state.headerColumn && column === 0);
      const input = h('textarea', {
        class: `input table-editor__cell${heading ? ' table-editor__cell--head' : ''}`,
        rows: 1, autocomplete: 'off', 'aria-label': `Wiersz ${rowIndex + 1}, kolumna ${column + 1}`,
        style: { textAlign: state.align[column] },
        dataset: { testid: `table-cell-${rowIndex}-${column}` },
        onFocus: () => { focus = [rowIndex, column]; },
        onInput: (event) => {
          state.rows[rowIndex][column] = event.target.value;
          fit(event.target);
        },
        onPaste: (event) => pasteInto(event, rowIndex, column)
      });
      input.value = cell;
      return h('td', null, input);
    })));
    replaceChildren(grid, h('table', { class: 'table-editor__grid', dataset: { testid: 'table-grid' } }, h('thead', null, head), h('tbody', null, body)));
    for (const input of grid.querySelectorAll('textarea')) fit(input);
    if (focusCell) {
      const [row, column] = focusCell;
      grid.querySelector(`[data-testid="table-cell-${Math.min(row, state.rows.length - 1)}-${Math.min(column, columns() - 1)}"]`)?.focus({ preventScroll: false });
    }
  }

  /** Pole rośnie razem z tekstem (nowsze przeglądarki robią to same – field-sizing w CSS). */
  function fit(input) {
    if (globalThis.CSS?.supports?.('field-sizing', 'content')) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  /** Wklejony fragment arkusza albo tabeli (kilka komórek) – od tej komórki; jedna wartość – zwykłe wklejenie. */
  function pasteInto(event, row, column) {
    const data = event.clipboardData;
    if (!data) return;
    const rows = rowsFromHtml(data.getData('text/html')) ?? parseTableText(data.getData('text/plain'));
    if (!rows || (rows.length === 1 && rows[0].length === 1)) return;
    event.preventDefault();
    // Pusta tabela, kursor w pierwszej komórce – tabela dokładnie wielkości wklejonego fragmentu.
    if (row === 0 && column === 0 && state.rows.every((values) => values.every((value) => value === ''))) {
      state.rows = [['']];
      state.align = ['left'];
    }
    let clipped = false;
    rows.forEach((values, rowOffset) => {
      const target = row + rowOffset;
      if (target >= TABLE_MAX_ROWS) {
        clipped = true;
        return;
      }
      while (state.rows.length <= target) state.rows.push(Array.from({ length: columns() }, () => ''));
      values.forEach((value, columnOffset) => {
        const at = column + columnOffset;
        if (at >= TABLE_MAX_COLUMNS) {
          clipped = true;
          return;
        }
        while (columns() <= at) addColumnAt(columns());
        state.rows[target][at] = value;
      });
    });
    say(clipped ? `Wklejono część – tabela może mieć najwyżej ${TABLE_MAX_ROWS} wierszy i ${TABLE_MAX_COLUMNS} kolumn.` : `Wklejono ${rows.length} × ${Math.max(...rows.map((values) => values.length))}.`);
    render([row, column]);
  }

  function addColumnAt(index) {
    for (const row of state.rows) row.splice(index, 0, '');
    state.align.splice(index, 0, 'left');
  }

  const actions = [
    ['table-add-row', 'plus', 'Wiersz', 'Dodaj wiersz pod komórką z kursorem', () => {
      if (state.rows.length >= TABLE_MAX_ROWS) return say(`Tabela może mieć najwyżej ${TABLE_MAX_ROWS} wierszy.`);
      state.rows.splice(focus[0] + 1, 0, Array.from({ length: columns() }, () => ''));
      render([focus[0] + 1, focus[1]]);
      return say('');
    }],
    ['table-add-column', 'plus', 'Kolumna', 'Dodaj kolumnę na prawo od komórki z kursorem', () => {
      if (columns() >= TABLE_MAX_COLUMNS) return say(`Tabela może mieć najwyżej ${TABLE_MAX_COLUMNS} kolumn.`);
      addColumnAt(focus[1] + 1);
      render([focus[0], focus[1] + 1]);
      return say('');
    }],
    ['table-remove-row', 'minus', 'Wiersz', 'Usuń wiersz z kursorem', () => {
      if (state.rows.length <= 1) return say('Tabela musi mieć co najmniej jeden wiersz.');
      state.rows.splice(focus[0], 1);
      render([Math.max(0, focus[0] - 1), focus[1]]);
      return say('');
    }],
    ['table-remove-column', 'minus', 'Kolumna', 'Usuń kolumnę z kursorem', () => {
      if (columns() <= 1) return say('Tabela musi mieć co najmniej jedną kolumnę.');
      for (const row of state.rows) row.splice(focus[1], 1);
      state.align.splice(focus[1], 1);
      render([focus[0], Math.max(0, focus[1] - 1)]);
      return say('');
    }]
  ].map(([testID, iconName, label, hint, onClick]) => h('button', {
    type: 'button', class: 'button button--secondary table-editor__action', title: hint, 'aria-label': hint, dataset: { testid: testID },
    // Przycisk nie zabiera fokusu komórce (na komputerze) – działa przy niej.
    onMousedown: (event) => event.preventDefault(),
    onClick
  }, icon(iconName, { size: 16 }), h('span', null, label)));

  const headerToggle = toggle({ checked: state.header, label: 'Pierwszy wiersz – nagłówek', onChange: (checked) => { state.header = checked; render(null); } });
  headerToggle.querySelector('input').dataset.testid = 'table-header';
  const columnToggle = toggle({ checked: state.headerColumn, label: 'Pierwsza kolumna – nagłówki wierszy', onChange: (checked) => { state.headerColumn = checked; render(null); } });
  columnToggle.querySelector('input').dataset.testid = 'table-header-column';

  const sheet = openFormSheet({
    title,
    submitLabel,
    build: () => [
      h('div', { class: 'table-editor__actions', role: 'group', 'aria-label': 'Wiersze i kolumny' }, actions),
      grid,
      status,
      h('p', { class: 'field__hint' },
        'Przyciski dodają i usuwają wiersz albo kolumnę przy komórce z kursorem. Wklejony fragment arkusza (Excel) albo tabela z Worda '
        + 'wypełnia komórki od kursora. Strzałki nad kolumnami – wyrównanie. Tab – następna komórka, Enter – nowy wiersz w komórce.'),
      h('div', { class: 'table-editor__options' }, headerToggle, columnToggle),
      extra
    ],
    onSubmit: () => {
      const result = cleanTable(state);
      if (!result) throw new Error('Tabela musi mieć co najmniej jedną komórkę.');
      if (!allowEmpty && isEmptyTable(result)) throw new Error('Tabela jest pusta – wpisz coś w komórkach.');
      saved = result;
    },
    onClose: () => {
      if (saved) onSave(saved);
    }
  });
  sheet.dialog.classList.add('table-dialog');
  sheet.dialog.dataset.testid = 'table-editor';
  render([0, 0]);
  return sheet;
}
