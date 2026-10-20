// Okno edycji tabeli (od 1.21) – wspólne dla notatki i rysunku: siatka pól (komórki), wiersze
// i kolumny dodawane i usuwane przy komórce z kursorem, nagłówek (pierwszy wiersz, pierwsza
// kolumna), wyrównanie kolumn i wklejanie z Excela (tekst z tabulatorami) albo tabeli z Worda
// czy strony WWW – od komórki z kursorem, tabela powiększa się sama. Od 1.26 nad każdą kolumną
// przycisk kolumny (format wartości, wyrównanie nagłówka i wartości) i uchwyt szerokości między
// kolumnami; komórka bez kursora pokazuje wartość w formacie kolumny.

import {
  TABLE_FORMATS, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, cellAlign, cleanTable, displayCell, isEmptyTable, isNumericFormat, moveColumnBorder,
  parseTableText, rowsFromHtml, widthsWithColumn, widthsWithoutColumn
} from '../core/tables.js';
import { field, segmented, selectInput, toggle } from './components.js';
import { openFormSheet } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';

const ALIGN_ICONS = { left: 'alignLeft', center: 'alignCenter', right: 'alignRight' };
const ALIGN_LABELS = { left: 'do lewej', center: 'do środka', right: 'do prawej' };
const ALIGN_OPTIONS = [{ value: 'left', label: 'Do lewej' }, { value: 'center', label: 'Do środka' }, { value: 'right', label: 'Do prawej' }];
/** Szerokość komórki w oknie przy równych kolumnach (rem) – z udziałami kolumn: udział × liczba kolumn × ta szerokość. */
const CELL_REM = 9.5;
const CELL_MIN_REM = 4;

/**
 * Okno kolumny (od 1.26): format wartości, wyrównanie wartości i wiersza nagłówka. onApply({ format,
 * align, headAlign }) – po „Gotowe”; liczba albo waluta przy wyrównaniu do lewej – wartości do prawej.
 * Nagłówek wyrównany jak wartości idzie za nimi, dopóki nie wybierzesz mu innego wyrównania.
 */
function openColumnSheet({ column, format, align, headAlign, header, onApply }) {
  const choice = { format, align, headAlign };
  const touched = { align: false, headAlign: false };
  const formatSelect = selectInput({
    value: format, testID: 'table-column-format',
    options: TABLE_FORMATS.map((item) => ({ value: item.id, label: item.label })),
    onChange: (value) => { choice.format = value; }
  });
  const alignControl = (key, testID) => {
    const control = segmented({
      name: `${testID}-${Date.now()}`, label: key === 'align' ? 'Wyrównanie wartości' : 'Wyrównanie nagłówka', value: choice[key], options: ALIGN_OPTIONS,
      onChange: (value) => {
        choice[key] = value;
        touched[key] = true;
      }
    });
    control.dataset.testid = testID;
    return control;
  };
  openFormSheet({
    title: `Kolumna ${column + 1}`,
    submitLabel: 'Gotowe',
    build: () => [
      field('Format wartości', formatSelect, { hint: 'Wpisz liczbę albo datę jak zwykle (np. 1234,5 albo 2026-10-20) – w tabeli zobaczysz ją w formacie kolumny. Nagłówki zostają tekstem.' }),
      field('Wyrównanie wartości', alignControl('align', 'table-column-align')),
      header ? field('Wyrównanie wiersza nagłówka', alignControl('headAlign', 'table-column-head-align')) : null,
      h('p', { class: 'field__hint' }, 'Szerokość kolumny zmienisz, przeciągając uchwyt między kolumnami nad tabelą.')
    ],
    onSubmit: () => {
      if (!touched.align && choice.align === 'left' && isNumericFormat(choice.format) && !isNumericFormat(format)) choice.align = 'right';
      if (!touched.headAlign && headAlign === align) choice.headAlign = choice.align;
      onApply(choice);
    }
  });
}

/**
 * Otwiera okno tabeli. table – tabela do poprawki (kopia; null – nowa 3 × 3), extra – dodatkowe
 * pola pod tabelą (np. wielkość i kolor w rysunku), allowEmpty – czy pusta tabela może być zapisana.
 * onSave(table) – po zamknięciu okna przyciskiem zapisu (sprawdzona tabela).
 */
export function openTableEditor({ title = 'Tabela', submitLabel = 'Zapisz', table = null, extra = null, allowEmpty = false, onSave }) {
  const source = cleanTable(table) ?? cleanTable({ rows: [['', '', ''], ['', '', ''], ['', '', '']] });
  const state = {
    rows: source.rows.map((row) => [...row]), header: source.header, headerColumn: source.headerColumn, align: [...source.align],
    // Od 1.26: wyrównanie nagłówka, formaty i udziały kolumn w szerokości (null – z treści).
    headAlign: [...(source.headAlign ?? source.align)],
    formats: [...(source.formats ?? source.align.map(() => 'text'))],
    colWidths: source.colWidths ? [...source.colWidths] : null
  };
  /** Komórka z kursorem [wiersz, kolumna] – tam działają przyciski wierszy i kolumn. */
  let focus = [0, 0];
  let saved = null;
  const grid = h('div', { class: 'table-editor__scroll' });
  const status = h('p', { class: 'field__hint table-editor__status', role: 'status' });

  const columns = () => state.rows[0].length;
  const say = (text) => { status.textContent = text; };

  /** Szerokość komórek kolumny w oknie (rem): równe kolumny – CELL_REM, z udziałami – w ich proporcji. */
  const cellWidth = (column) => (state.colWidths ? Math.max(CELL_MIN_REM, state.colWidths[column] * columns() * CELL_REM) : CELL_REM);
  const shortFormat = (id) => TABLE_FORMATS.find((format) => format.id === id)?.short ?? 'Abc';

  function editColumn(column) {
    openColumnSheet({
      column, format: state.formats[column], align: state.align[column], headAlign: state.headAlign[column], header: state.header,
      onApply: (choice) => {
        state.formats[column] = choice.format;
        state.align[column] = choice.align;
        state.headAlign[column] = choice.headAlign;
        render(null);
      }
    });
  }

  /**
   * Uchwyt granicy za kolumną `column` (od 1.26): przeciągnięcie zmienia szerokość tej kolumny
   * i następnej (razem tyle samo); pierwsze przeciągnięcie zaczyna od szerokości z treści.
   */
  function startWidthDrag(event, column) {
    event.preventDefault();
    const grip = event.currentTarget;
    grip.setPointerCapture?.(event.pointerId);
    const cells = [...grid.querySelectorAll('tbody tr:first-child textarea')];
    const measured = cells.map((cell) => cell.getBoundingClientRect().width);
    const total = measured.reduce((sum, width) => sum + width, 0) || 1;
    const base = state.colWidths ?? measured.map((width) => width / total);
    const startX = event.clientX;
    const move = (moveEvent) => {
      state.colWidths = moveColumnBorder(base, column, (moveEvent.clientX - startX) / total);
      for (const cell of grid.querySelectorAll('textarea')) cell.style.width = `${cellWidth(Number(cell.dataset.column))}rem`;
    };
    const end = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      render(null);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  function render(focusCell = focus) {
    const widthsButton = actions.find((button) => button.dataset.testid === 'table-widths');
    if (widthsButton) {
      const equal = !state.colWidths;
      widthsButton.querySelector('span').textContent = equal ? 'Równe kolumny' : 'Kolumny z treści';
      const hint = equal ? 'Wszystkie kolumny tej samej szerokości' : 'Szerokości kolumn według tekstu w komórkach';
      widthsButton.title = hint;
      widthsButton.setAttribute('aria-label', hint);
    }
    const head = h('tr', { class: 'table-editor__controls' },
      state.align.map((align, column) => h('th', null, h('div', { class: 'table-editor__column' },
        h('button', {
          type: 'button', class: 'table-editor__align',
          'aria-label': `Kolumna ${column + 1}: format ${shortFormat(state.formats[column])}, wartości ${ALIGN_LABELS[align]} – zmień`,
          title: 'Format i wyrównanie kolumny', dataset: { testid: `table-align-${column}` },
          onClick: () => editColumn(column)
        }, icon(ALIGN_ICONS[align], { size: 18 }), h('span', { class: 'table-editor__format' }, shortFormat(state.formats[column]))),
        column < columns() - 1 ? h('span', {
          class: 'table-editor__grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': `Szerokość kolumn ${column + 1} i ${column + 2} – przeciągnij`,
          title: 'Przeciągnij – szerokość kolumn', dataset: { testid: `table-width-${column}` },
          onPointerdown: (event) => startWidthDrag(event, column)
        }) : null))));
    const body = state.rows.map((row, rowIndex) => h('tr', null, row.map((cell, column) => {
      const heading = (state.header && rowIndex === 0) || (state.headerColumn && column === 0);
      const input = h('textarea', {
        class: `input table-editor__cell${heading ? ' table-editor__cell--head' : ''}`,
        rows: 1, autocomplete: 'off', 'aria-label': `Wiersz ${rowIndex + 1}, kolumna ${column + 1}`,
        style: { textAlign: cellAlign(state, rowIndex, column), width: `${cellWidth(column)}rem` },
        dataset: { testid: `table-cell-${rowIndex}-${column}`, column: String(column) },
        // Z kursorem – tekst jak wpisany, bez kursora – w formacie kolumny (od 1.26).
        onFocus: (event) => {
          focus = [rowIndex, column];
          if (event.target.value !== state.rows[rowIndex][column]) event.target.value = state.rows[rowIndex][column];
        },
        onBlur: (event) => {
          const shown = displayCell(state, rowIndex, column);
          if (event.target.value !== shown) event.target.value = shown;
          fit(event.target);
        },
        onInput: (event) => {
          state.rows[rowIndex][column] = event.target.value;
          fit(event.target);
        },
        onPaste: (event) => pasteInto(event, rowIndex, column)
      });
      input.value = displayCell(state, rowIndex, column);
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
      state.headAlign = ['left'];
      state.formats = ['text'];
      state.colWidths = null;
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
    state.headAlign.splice(index, 0, 'left');
    state.formats.splice(index, 0, 'text');
    state.colWidths = widthsWithColumn(state.colWidths, index);
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
      state.headAlign.splice(focus[1], 1);
      state.formats.splice(focus[1], 1);
      state.colWidths = widthsWithoutColumn(state.colWidths, focus[1]);
      render([focus[0], Math.max(0, focus[1] - 1)]);
      return say('');
    }],
    // Od 1.26: szerokości kolumn – równe; po zmianie szerokości (uchwyt, „Równe”) – znów z treści.
    ['table-widths', 'columns', 'Równe kolumny', 'Wszystkie kolumny tej samej szerokości', () => {
      state.colWidths = state.colWidths ? null : Array.from({ length: columns() }, () => 1 / columns());
      render(null);
      return say(state.colWidths ? 'Kolumny tej samej szerokości.' : 'Szerokości kolumn według tekstu w komórkach.');
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
        + 'wypełnia komórki od kursora. Przycisk nad kolumną – format wartości (tekst, liczba, waluta, data) i wyrównanie nagłówka i wartości; '
        + 'uchwyt między przyciskami – szerokość kolumn. Tab – następna komórka, Enter – nowy wiersz w komórce.'),
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
