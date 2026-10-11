// Kreator importu z pliku XLSX lub CSV w siedmiu krokach:
// plik → arkusz (albo sposób odczytu CSV) → kolumny → miejsce → sprawdzenie → podgląd → zatwierdzenie.
// Do ostatniego kroku nic nie jest zapisywane; import to jedna niepodzielna operacja.

import { DELIMITERS, ENCODINGS } from '../../core/csv.js';
import { buildTemplateFile } from '../../core/exporter.js';
import {
  IMPORT_FIELDS, STRUCTURE_LEVELS, analyzeHeader, buildImportRows, describeColumns, missingForImport
} from '../../core/importer.js';
import { openTableFile } from '../../core/tablefile.js';
import { joinList, plural, pluralTerms } from '../../core/text.js';
import {
  actionRow, field, formGroup, group, message, primaryButton, radioRow, selectInput, textInput, toggle, valueRow
} from '../components.js';
import { showError, toast } from '../dialogs.js';
import { h } from '../dom.js';
import { deliverFile, pickFile } from '../files.js';
import { icon } from '../icons.js';
import { routes } from '../router.js';

const NEW = '__new__';
const NONE = '';
const PREVIEW_PAGE = 30;
const ISSUE_LIMIT = 100;
const NAME_LIMIT = 8;
const FILE_TYPES = '.xlsx,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const STEP_TITLES = ['Wybierz plik', 'Wybierz arkusz', 'Przypisz kolumny', 'Wybierz miejsce', 'Sprawdź dane', 'Przejrzyj pojęcia', 'Zatwierdź import'];
const LAST_STEP = STEP_TITLES.length - 1;
const DONE = STEP_TITLES.length;

const LEVEL_LABELS = { domain: 'Dziedzina', module: 'Moduł', lesson: 'Lekcja' };
const NEW_LABELS = { domain: 'Nowa dziedzina…', module: 'Nowy moduł…', lesson: 'Nowa lekcja…' };
const NEW_NAME_LABELS = { domain: 'Nazwa dziedziny', module: 'Nazwa modułu', lesson: 'Nazwa lekcji' };
const CHOOSE_PROMPTS = { domain: 'Wybierz dziedzinę.', module: 'Wybierz moduł.', lesson: 'Wybierz lekcję.' };

const DUPLICATE_MODES = [
  { id: 'skip', title: 'Pomiń duplikaty', subtitle: 'Istniejące pojęcia zostają bez zmian.' },
  { id: 'update', title: 'Aktualizuj istniejące', subtitle: 'Treść z pliku uzupełnia istniejące pojęcia. Postępy nauki zostają, a puste komórki niczego nie kasują.' },
  { id: 'add', title: 'Dodaj jako nowe', subtitle: 'Powstaną drugie egzemplarze tych pojęć.' }
];

const STATUS_LABELS = {
  added: 'Nowe',
  addedDuplicate: 'Duplikat – zostanie dodany jako nowe',
  updated: 'Duplikat – zostanie zaktualizowany',
  unchanged: 'Duplikat – bez zmian',
  skipped: 'Duplikat – zostanie pominięty',
  skippedInFile: 'Powtórzenie w pliku – zostanie pominięte'
};

const pluralRows = (count) => plural(count, 'wiersz', 'wiersze', 'wierszy');
const pluralColumns = (count) => plural(count, 'kolumna', 'kolumny', 'kolumn');

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Oddaje sterowanie przeglądarce, żeby zdążyła narysować komunikat „trwa…”. */
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function limitedList(names, limit = NAME_LIMIT) {
  const shown = names.slice(0, limit).map((name) => h('li', null, name));
  if (names.length > limit) shown.push(h('li', { class: 'wizard__more' }, `…i ${names.length - limit} więcej`));
  return h('ul', { class: 'wizard__names' }, shown);
}

export class ImportScreen {
  constructor(ctx, route) {
    this.ctx = ctx;
    const preset = route.id ? ctx.library.getLesson(route.id) : null;
    this.presetLessonID = preset?.id ?? null;

    this.step = 0;
    this.busy = null;
    this.error = null;
    this.token = 0;

    this.file = null;          // { name, size, source }
    this.sheetIndex = 0;
    this.csv = { encoding: null, delimiter: null };
    this.table = null;
    this.analyzedTable = null; // tabela, dla której wyliczono przypisanie kolumn

    this.hasHeader = true;
    this.mapping = {};
    this.detectedStructure = [];

    this.place = {
      // Import „do tej lekcji” domyślnie nie rozkłada pojęć według kolumn pliku.
      useFileStructure: !preset,
      domain: { choice: preset?.domainID ?? NONE, name: '' },
      module: { choice: preset?.moduleID ?? NONE, name: '' },
      lesson: { choice: preset?.id ?? NONE, name: '' }
    };

    this.duplicates = 'skip';
    this.built = null;
    this.rows = null;
    this.plan = null;
    this.previewLimit = PREVIEW_PAGE;
    this.result = null;

    this.nextButton = null;
    this.hintElement = null;
    this.disposed = false;
  }

  dispose() {
    this.disposed = true;
    this.token += 1;
  }

  #refresh() {
    if (!this.disposed) this.ctx.refresh();
  }

  // ---------------------------------------------------------------- plik i tabela

  /** `anyType` pokazuje wszystkie pliki – na wypadek, gdyby system wyszarzył właściwy. */
  async #pickFile(anyType = false) {
    const picked = await pickFile(anyType ? '' : FILE_TYPES);
    if (!picked) return;
    const token = (this.token += 1);
    this.error = null;
    this.busy = 'Wczytywanie pliku…';
    this.#refresh();
    try {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      const source = await openTableFile(bytes);
      if (token !== this.token) return;
      this.file = { name: picked.name, size: picked.size, source };
      this.table = null;
      this.analyzedTable = null;
      this.built = null;
      this.plan = null;
      if (source.kind === 'csv') {
        this.csv = { encoding: source.encoding, delimiter: source.delimiter };
        this.table = source.read(this.csv);
      } else {
        // Zaczynamy od pierwszego widocznego arkusza, w którym są dane.
        const order = source.sheets.map((sheet, index) => index).sort((a, b) => Number(source.sheets[a].hidden) - Number(source.sheets[b].hidden));
        this.sheetIndex = order[0] ?? 0;
        for (const index of order) {
          const table = await source.readSheet(index);
          if (token !== this.token) return;
          if (table.rows.length > 0) {
            this.sheetIndex = index;
            this.table = table;
            break;
          }
        }
        this.table ??= await source.readSheet(this.sheetIndex);
      }
      this.step = 1;
    } catch (error) {
      if (token !== this.token) return;
      this.file = null;
      this.error = error?.name === 'SpreadsheetError' ? error.message : `Nie udało się odczytać pliku. ${error?.message ?? ''}`.trim();
      if (error?.name !== 'SpreadsheetError') console.error(error);
    } finally {
      if (token === this.token) {
        this.busy = null;
        this.#refresh();
      }
    }
  }

  async #selectSheet(index) {
    const token = (this.token += 1);
    this.sheetIndex = index;
    this.error = null;
    this.busy = 'Wczytywanie arkusza…';
    this.#refresh();
    try {
      const table = await this.file.source.readSheet(index);
      if (token !== this.token) return;
      this.table = table;
    } catch (error) {
      if (token !== this.token) return;
      this.table = null;
      this.error = error?.message ?? String(error);
    } finally {
      if (token === this.token) {
        this.busy = null;
        this.#refresh();
      }
    }
  }

  #rereadCsv() {
    try {
      this.error = null;
      this.table = this.file.source.read(this.csv);
    } catch (error) {
      this.table = null;
      this.error = `Nie udało się odczytać pliku w tym kodowaniu. ${error?.message ?? ''}`.trim();
    }
    this.#refresh();
  }

  async #downloadTemplate() {
    try {
      const template = await buildTemplateFile('xlsx');
      const file = new File([template.bytes], template.name, { type: template.type });
      const outcome = await deliverFile(file, {
        title: 'Wzór pliku jest gotowy',
        message: 'Zawiera nagłówki kolumn i dwa przykładowe pojęcia. W następnym kroku wybierz „Zachowaj w Plikach”.'
      });
      if (outcome === 'downloaded') toast(`Zapisano plik ${file.name}.`);
    } catch (error) {
      await showError(error);
    }
  }

  // ---------------------------------------------------------------- kolumny

  #analyze() {
    if (this.analyzedTable === this.table) return;
    const analysis = analyzeHeader(this.table);
    this.hasHeader = analysis.hasHeader;
    this.mapping = analysis.mapping;
    this.detectedStructure = STRUCTURE_LEVELS.filter((level) => analysis.mapping[level] !== undefined);
    this.analyzedTable = this.table;
  }

  // ---------------------------------------------------------------- miejsce docelowe

  #fromFile(level) {
    return this.place.useFileStructure && this.mapping[level] !== undefined;
  }

  /** Wybrany istniejący element danego poziomu albo null. */
  #chosen(level) {
    if (this.#fromFile(level)) return null;
    const { choice } = this.place[level];
    if (choice === NONE || choice === NEW) return null;
    const { library } = this.ctx;
    return { domain: library.getDomain(choice), module: library.getModule(choice), lesson: library.getLesson(choice) }[level] ?? null;
  }

  /** Istniejące elementy do wyboru – tylko gdy poziom wyżej to konkretny, istniejący element. */
  #options(level) {
    const { library } = this.ctx;
    if (level === 'domain') return library.listDomains();
    if (level === 'module') {
      const domain = this.#chosen('domain');
      return domain ? library.listModules(domain.id) : [];
    }
    const module = this.#chosen('module');
    return module ? library.listLessons(module.id) : [];
  }

  /** Dopasowuje wybory do tego, co faktycznie da się wybrać (np. po zmianie dziedziny). */
  #normalizePlace() {
    for (const level of STRUCTURE_LEVELS) {
      if (this.#fromFile(level)) continue;
      const state = this.place[level];
      const options = this.#options(level);
      if (options.length === 0) state.choice = NEW;
      else if (state.choice !== NEW && !options.some((item) => item.id === state.choice)) state.choice = NONE;
    }
  }

  #destination() {
    const name = (level) => {
      if (this.#fromFile(level)) return '';
      const state = this.place[level];
      if (state.choice === NEW) return state.name;
      return this.#chosen(level)?.name ?? '';
    };
    return { useFileStructure: this.place.useFileStructure, domain: name('domain'), module: name('module'), lesson: name('lesson') };
  }

  // ---------------------------------------------------------------- sprawdzenie i plan

  #computePlan() {
    this.plan = this.ctx.library.planImport(this.rows, { duplicates: this.duplicates });
  }

  async #validate() {
    const token = (this.token += 1);
    this.error = null;
    this.busy = 'Sprawdzanie danych…';
    this.#refresh();
    await nextFrame();
    if (token !== this.token) return false;
    try {
      const built = buildImportRows({
        table: this.table, hasHeader: this.hasHeader, mapping: this.mapping, destination: this.#destination()
      });
      // Wybrane istniejące elementy wskazujemy identyfikatorem – nazwa mogłaby się powtarzać.
      const lesson = this.#chosen('lesson');
      const module = this.#chosen('module');
      const domain = this.#chosen('domain');
      this.rows = built.rows.map((row) => {
        if (lesson) return { number: row.number, lessonID: lesson.id, term: row.term };
        if (module) return { ...row, moduleID: module.id };
        if (domain) return { ...row, domainID: domain.id };
        return row;
      });
      this.built = built;
      this.previewLimit = PREVIEW_PAGE;
      this.#computePlan();
      return true;
    } catch (error) {
      this.built = null;
      this.plan = null;
      this.error = error?.message ?? String(error);
      return false;
    } finally {
      if (token === this.token) {
        this.busy = null;
        this.#refresh();
      }
    }
  }

  async #import() {
    const token = (this.token += 1);
    this.error = null;
    this.busy = 'Importowanie…';
    this.#refresh();
    await nextFrame();
    try {
      const report = await this.ctx.library.importRows(this.rows, { duplicates: this.duplicates });
      this.result = report;
      this.step = DONE;
    } catch (error) {
      this.error = `Import się nie powiódł i niczego nie zmienił. ${error?.message ?? ''}`.trim();
    } finally {
      if (token === this.token) {
        this.busy = null;
        this.#refresh();
      }
    }
  }

  // ---------------------------------------------------------------- nawigacja kreatora

  /** Powód, dla którego nie można przejść dalej, albo null. */
  #blocker() {
    switch (this.step) {
      case 0: return this.file ? null : 'Wybierz plik, żeby przejść dalej.';
      case 1:
        if (!this.table) return 'Nie udało się odczytać danych.';
        return this.table.rows.length === 0 ? 'Tu nie ma żadnych danych.' : null;
      case 2: return missingForImport(this.mapping, null)[0] ?? null;
      case 3: {
        const unchosen = STRUCTURE_LEVELS.find((level) => !this.#fromFile(level) && this.place[level].choice === NONE);
        return unchosen ? CHOOSE_PROMPTS[unchosen] : (missingForImport(this.mapping, this.#destination())[0] ?? null);
      }
      case 4: return this.built && this.built.rows.length > 0 ? null : 'Żaden wiersz nie nadaje się do importu.';
      case LAST_STEP:
        return this.plan && this.plan.added + this.plan.updated > 0 ? null : 'Plik nie wnosi nic nowego – nie ma czego importować.';
      default: return null;
    }
  }

  /** Aktualizuje przycisk „Dalej” bez przebudowy ekranu (podczas pisania w polu tekstowym). */
  #syncNavigation() {
    const blocker = this.#blocker();
    if (this.nextButton) this.nextButton.disabled = Boolean(blocker) || Boolean(this.busy);
    if (this.hintElement) {
      this.hintElement.textContent = blocker ?? '';
      this.hintElement.hidden = !blocker;
    }
  }

  async #next() {
    if (this.busy || this.#blocker()) return;
    if (this.step === 1) this.#analyze();
    if (this.step === 2) this.#normalizePlace();
    if (this.step === 3 && !(await this.#validate())) return;
    if (this.step === LAST_STEP) {
      await this.#import();
      return;
    }
    this.step += 1;
    this.error = null;
    window.scrollTo(0, 0);
    this.#refresh();
  }

  #back() {
    if (this.busy || this.step === 0) return;
    this.step -= 1;
    this.error = null;
    window.scrollTo(0, 0);
    this.#refresh();
  }

  // ---------------------------------------------------------------- widoki kroków

  #previewTable(rowLimit = 6, columnLimit = 8) {
    const rows = this.table.rows.slice(0, rowLimit);
    const columns = Math.min(this.table.columnCount, columnLimit);
    return h('div', { class: 'table-wrap' },
      h('table', { class: 'table table--compact', dataset: { testid: 'import-file-preview' } },
        h('caption', { class: 'visually-hidden' }, 'Początek pliku'),
        h('tbody', null, rows.map((row) => h('tr', null,
          h('th', { scope: 'row', class: 'table__narrow' }, String(row.number)),
          Array.from({ length: columns }, (_, index) => h('td', null, row.cells[index] ?? ''))
        )))
      )
    );
  }

  #fileStep() {
    return [
      h('p', { class: 'wizard__lead' },
        'Wybierz plik XLSX albo CSV z pojęciami. Do ostatniego kroku nic nie zostanie zapisane.'),
      this.file ? group({},
        h('li', { class: 'row row--static', dataset: { testid: 'import-file' } },
          h('span', { class: 'row__main' },
            h('span', { class: 'row__leading row__leading--icon' }, icon(this.file.source.kind === 'xlsx' ? 'table' : 'file')),
            h('span', { class: 'row__text' },
              h('span', { class: 'row__title' }, this.file.name),
              h('span', { class: 'row__subtitle' }, `${this.file.source.kind === 'xlsx' ? 'Skoroszyt Excel' : 'Plik CSV'}, ${formatSize(this.file.size)}`)
            )
          )
        )
      ) : null,
      h('div', { class: 'wizard__actions' },
        primaryButton(this.file ? 'Wybierz inny plik' : 'Wybierz plik', () => this.#pickFile(), {
          testID: 'import-pick', kind: this.file ? 'secondary' : 'primary'
        }),
        h('button', { type: 'button', class: 'button button--plain wizard__all-files', dataset: { testid: 'import-pick-any' }, onClick: () => this.#pickFile(true) },
          'Plik jest wyszarzony? Pokaż wszystkie pliki')
      ),
      group({
        title: 'Jak przygotować plik',
        footer: 'Nagłówki mogą być po polsku albo po angielsku, w dowolnej kolejności. Jeśli aplikacja ich nie rozpozna, przypiszesz kolumny ręcznie.'
      },
        valueRow('Wymagane kolumny', 'Term PL, Term EN'),
        valueRow('Treść', 'Description PL/EN, Example PL/EN'),
        valueRow('Podział na lekcje', 'Domain, Module, Lesson'),
        valueRow('Dodatkowe', 'Tags, Difficulty, Notes'),
        actionRow({ label: 'Pobierz wzór pliku', iconName: 'download', onClick: () => this.#downloadTemplate(), testID: 'import-template' })
      )
    ];
  }

  #sheetStep() {
    const { source } = this.file;
    const parts = [];
    if (source.kind === 'xlsx') {
      parts.push(group({ title: source.sheets.length === 1 ? 'Arkusz' : 'Arkusze w pliku' },
        source.sheets.map((sheet, index) => radioRow({
          name: 'import-sheet',
          value: String(index),
          checked: index === this.sheetIndex,
          title: sheet.name,
          subtitle: sheet.hidden ? 'Arkusz ukryty' : null,
          onChange: () => this.#selectSheet(index)
        }))
      ));
    } else {
      parts.push(formGroup('Odczyt pliku',
        field('Kodowanie znaków', selectInput({
          value: this.csv.encoding,
          testID: 'import-encoding',
          options: [
            ...ENCODINGS.map((item) => ({ value: item.id, label: item.id === source.encoding ? `${item.label} (wykryte)` : item.label })),
            ...(ENCODINGS.some((item) => item.id === source.encoding) ? [] : [{ value: source.encoding, label: `${source.encoding.toUpperCase()} (wykryte)` }])
          ],
          onChange: (value) => { this.csv.encoding = value; this.#rereadCsv(); }
        }), { hint: 'Zmień, jeśli polskie litery w podglądzie są zniekształcone.' }),
        field('Separator kolumn', selectInput({
          value: this.csv.delimiter,
          testID: 'import-delimiter',
          options: [
            ...DELIMITERS.map((item) => ({ value: item.id, label: item.id === source.delimiter ? `${item.label} (wykryty)` : item.label })),
            ...(DELIMITERS.some((item) => item.id === source.delimiter) ? [] : [{ value: source.delimiter, label: `„${source.delimiter}” (wykryty)` }])
          ],
          onChange: (value) => { this.csv.delimiter = value; this.#rereadCsv(); }
        }))
      ));
    }

    if (this.table && this.table.rows.length > 0) {
      parts.push(h('section', { class: 'group' },
        h('h3', { class: 'group__title group__title--small', dataset: { testid: 'import-size' } },
          `${pluralRows(this.table.rows.length)}, ${pluralColumns(this.table.columnCount)}`),
        this.#previewTable(),
        h('p', { class: 'group__footer' }, 'Początek pliku. Liczby z lewej to numery wierszy w arkuszu.')
      ));
    } else if (this.table && !this.busy) {
      parts.push(message(source.kind === 'xlsx' ? 'Ten arkusz jest pusty. Wybierz inny.' : 'W pliku nie ma danych.', 'warning'));
    }
    return parts;
  }

  #columnsStep() {
    const columns = describeColumns(this.table, this.hasHeader);
    const used = new Set(Object.values(this.mapping));
    const unused = columns.filter((column) => !used.has(column.index));
    const fieldSelect = (definition) => field(
      definition.required ? `${definition.label} (wymagane)` : definition.label,
      selectInput({
        value: this.mapping[definition.id] === undefined ? NONE : String(this.mapping[definition.id]),
        testID: `import-map-${definition.id}`,
        options: [{ value: NONE, label: 'Brak' }, ...columns.map((column) => ({ value: String(column.index), label: column.label }))],
        onChange: (value) => {
          if (value === NONE) delete this.mapping[definition.id];
          else this.mapping[definition.id] = Number(value);
          this.#refresh();
        }
      })
    );
    const byID = Object.fromEntries(IMPORT_FIELDS.map((definition) => [definition.id, definition]));
    const selects = (...ids) => ids.map((id) => fieldSelect(byID[id]));

    return [
      formGroup(null,
        toggle({
          checked: this.hasHeader,
          label: 'Pierwszy wiersz zawiera nagłówki',
          onChange: (value) => { this.hasHeader = value; this.#refresh(); }
        })
      ),
      formGroup('Pojęcie', selects('termPL', 'termEN')),
      formGroup('Opis i przykład', selects('descriptionPL', 'descriptionEN', 'examplePL', 'exampleEN')),
      formGroup('Podział na dziedziny, moduły i lekcje', selects('domain', 'module', 'lesson')),
      formGroup('Dodatkowe', selects('tags', 'difficulty', 'notes')),
      unused.length > 0
        ? h('p', { class: 'note', dataset: { testid: 'import-unused' } }, icon('info', { size: 18 }),
            h('span', null, `Kolumny bez przypisania zostaną pominięte: ${unused.map((column) => column.title || column.letter).join(', ')}.`))
        : null
    ];
  }

  #placeChooser(level) {
    const state = this.place[level];
    const options = this.#options(level);
    const nameInput = textInput({
      value: state.name,
      placeholder: NEW_NAME_LABELS[level],
      focusKey: `import-new-${level}`,
      testID: `import-new-${level}`,
      // Bez przebudowy ekranu: pole nie traci fokusu ani podpowiedzi klawiatury.
      onInput: (value) => { state.name = value; this.#syncNavigation(); }
    });
    if (options.length === 0) return [field(NEW_NAME_LABELS[level], nameInput)];
    const nameField = field(NEW_NAME_LABELS[level], nameInput);
    nameField.hidden = state.choice !== NEW;
    return [
      field(LEVEL_LABELS[level], selectInput({
        value: state.choice,
        testID: `import-${level}`,
        options: [
          { value: NONE, label: 'Wybierz…' },
          ...options.map((item) => ({ value: item.id, label: item.name })),
          { value: NEW, label: NEW_LABELS[level] }
        ],
        onChange: (value) => {
          state.choice = value;
          this.#normalizePlace();
          this.#refresh();
        }
      })),
      nameField
    ];
  }

  #placeStep() {
    this.#normalizePlace();
    const columns = describeColumns(this.table, this.hasHeader);
    const columnName = (level) => {
      const column = columns[this.mapping[level]];
      return column?.title || `kolumna ${column?.letter ?? ''}`;
    };
    const available = STRUCTURE_LEVELS.filter((level) => this.mapping[level] !== undefined);
    const parts = [];

    if (available.length > 0) {
      parts.push(formGroup(null,
        toggle({
          checked: this.place.useFileStructure,
          label: 'Odtwórz strukturę z pliku',
          onChange: (value) => {
            this.place.useFileStructure = value;
            this.#normalizePlace();
            this.#refresh();
          }
        })
      ));
      parts.push(h('p', { class: 'form-note', dataset: { testid: 'import-structure-note' } },
        this.place.useFileStructure
          ? `Pojęcia trafią do miejsc wskazanych w kolumnach: ${available.map(columnName).join(', ')}. Brakujące elementy zostaną utworzone – zobaczysz ich listę przed zatwierdzeniem.`
          : 'Wszystkie pojęcia z pliku trafią do jednej lekcji. Kolumny ze strukturą zostaną pominięte.'));
    }

    const fixed = STRUCTURE_LEVELS.filter((level) => !this.#fromFile(level));
    if (fixed.length > 0) {
      parts.push(formGroup(
        fixed.length === STRUCTURE_LEVELS.length ? 'Lekcja docelowa' : 'Uzupełnij brakujące poziomy',
        fixed.flatMap((level) => this.#placeChooser(level))
      ));
      if (fixed.length < STRUCTURE_LEVELS.length) {
        parts.push(h('p', { class: 'form-note' },
          `Plik nie ma kolumny: ${fixed.map((level) => LEVEL_LABELS[level].toLowerCase()).join(', ')}. Wskazana tutaj nazwa zostanie użyta dla wszystkich wierszy.`));
      }
    }
    return parts;
  }

  #checkStep() {
    const { built, plan } = this;
    if (!built || !plan) return [];
    const { counts } = built;
    const parts = [];

    parts.push(group({ title: 'Wynik sprawdzenia' },
      valueRow('Wiersze z pojęciami', String(counts.data)),
      valueRow('Poprawne', String(counts.valid)),
      counts.rejected > 0 ? valueRow('Odrzucone z powodu błędów', String(counts.rejected)) : null,
      counts.warnings > 0 ? valueRow('Ostrzeżenia', String(counts.warnings)) : null,
      counts.filledDown > 0 ? valueRow('Struktura przejęta z wiersza powyżej', String(counts.filledDown)) : null
    ));

    if (counts.rejected > 0) {
      parts.push(message(`${pluralRows(counts.rejected)} z błędami nie zostanie zaimportowane. Pozostałe możesz zaimportować teraz, a błędy poprawić w pliku i wczytać go ponownie.`, 'warning'));
    }

    if (plan.duplicatesInLibrary > 0) {
      parts.push(group({
        title: `W bibliotece jest już ${pluralTerms(plan.duplicatesInLibrary)} z pliku`,
        footer: 'Duplikat to pojęcie o tej samej nazwie polskiej i angielskiej w tej samej lekcji (bez względu na wielkość liter i polskie znaki).'
      },
        DUPLICATE_MODES.map((mode) => radioRow({
          name: 'import-duplicates',
          value: mode.id,
          checked: this.duplicates === mode.id,
          title: mode.title,
          subtitle: mode.subtitle,
          testID: `import-duplicates-${mode.id}`,
          onChange: (value) => {
            this.duplicates = value;
            try {
              this.#computePlan();
            } catch (error) {
              this.error = error?.message ?? String(error);
            }
            this.#refresh();
          }
        }))
      ));
    }
    if (plan.duplicatesInFile > 0) {
      parts.push(h('p', { class: 'note', dataset: { testid: 'import-file-duplicates' } }, icon('info', { size: 18 }),
        h('span', null, this.duplicates === 'add'
          ? `Powtórzenia w samym pliku: ${plan.duplicatesInFile}. W tym trybie każde wystąpienie zostanie dodane.`
          : `Powtórzenia w samym pliku: ${plan.duplicatesInFile}. Importowane jest pierwsze wystąpienie.`)));
    }

    if (built.issues.length > 0) {
      const shown = built.issues.slice(0, ISSUE_LIMIT);
      parts.push(h('section', { class: 'group' },
        h('h3', { class: 'group__title' }, 'Uwagi do wierszy'),
        h('ul', { class: 'group__list issues', role: 'list', dataset: { testid: 'import-issues' } },
          shown.map((issue) => h('li', { class: `issue issue--${issue.severity}` },
            icon(issue.severity === 'error' ? 'close' : 'warning', { size: 18 }),
            h('span', null,
              h('strong', null, `Wiersz ${issue.number}`),
              ` – ${issue.severity === 'error' ? 'błąd' : 'ostrzeżenie'}: ${issue.message}`)
          ))
        ),
        built.issues.length > ISSUE_LIMIT
          ? h('p', { class: 'group__footer' }, `Pokazano pierwsze ${ISSUE_LIMIT} z ${built.issues.length} uwag.`)
          : null
      ));
    } else {
      parts.push(message('Wszystkie wiersze są poprawne.', 'info'));
    }
    return parts;
  }

  #previewStep() {
    const { plan, rows } = this;
    if (!plan || !rows) return [];
    const { library } = this.ctx;
    const shown = rows.slice(0, this.previewLimit);
    const pathOf = (row) => (row.lessonID ? library.lessonPath(row.lessonID) : [
      row.domainID ? library.getDomain(row.domainID)?.name : row.domain,
      row.moduleID ? library.getModule(row.moduleID)?.name : row.module,
      row.lesson
    ].join(' › '));
    const snippet = (text) => (text.length > 110 ? `${text.slice(0, 110)}…` : text);

    return [
      h('section', { class: 'group' },
        h('h3', { class: 'group__title group__title--small', dataset: { testid: 'import-preview-count' } },
          shown.length < rows.length ? `Pierwsze ${shown.length} z ${pluralTerms(rows.length)}` : pluralTerms(rows.length)),
        h('ul', { class: 'group__list terms', role: 'list', dataset: { testid: 'import-preview' } },
          shown.map((row, index) => {
            const status = plan.statuses[index];
            const details = [row.term.descriptionPL, row.term.descriptionEN, row.term.examplePL, row.term.exampleEN].find((value) => value);
            return h('li', { class: 'term term--preview' },
              h('div', { class: 'term__text' },
                h('span', { class: 'term__pl', lang: 'pl' }, row.term.termPL),
                h('span', { class: 'term__en', lang: 'en' }, row.term.termEN),
                details ? h('span', { class: 'term__snippet' }, snippet(details)) : null,
                h('span', { class: 'term__path' }, `Wiersz ${row.number} → ${pathOf(row)}`),
                h('span', { class: `status status--${status}` }, STATUS_LABELS[status] ?? '')
              )
            );
          })
        )
      ),
      shown.length < rows.length
        ? h('button', {
            type: 'button', class: 'button button--secondary button--block', dataset: { testid: 'import-preview-more' },
            onClick: () => { this.previewLimit += PREVIEW_PAGE; this.#refresh(); }
          }, 'Pokaż więcej')
        : null
    ];
  }

  #confirmStep() {
    const { plan } = this;
    if (!plan) return [];
    const parts = [];
    parts.push(group({ title: 'Pojęcia' },
      valueRow('Zostaną dodane', String(plan.added)),
      plan.updated > 0 ? valueRow('Zostaną zaktualizowane', String(plan.updated)) : null,
      plan.unchanged > 0 ? valueRow('Bez zmian (takie same jak w bibliotece)', String(plan.unchanged)) : null,
      plan.skipped > 0 ? valueRow('Zostaną pominięte', String(plan.skipped)) : null,
      this.built.counts.rejected > 0 ? valueRow('Odrzucone z powodu błędów', String(this.built.counts.rejected)) : null
    ));

    const created = [
      ['Nowe dziedziny', plan.created.domains],
      ['Nowe moduły', plan.created.modules],
      ['Nowe lekcje', plan.created.lessons]
    ].filter(([, names]) => names.length > 0);

    if (created.length > 0) {
      parts.push(h('section', { class: 'group', dataset: { testid: 'import-created' } },
        h('h3', { class: 'group__title' }, 'Zostaną utworzone'),
        h('div', { class: 'wizard__created' },
          created.map(([title, names]) => h('div', null,
            h('h4', { class: 'wizard__created-title' }, `${title}: ${names.length}`),
            limitedList(names)
          ))
        )
      ));
    } else {
      parts.push(message('Pojęcia trafią do istniejących lekcji – nie powstanie żadna nowa dziedzina, moduł ani lekcja.', 'info'));
    }
    parts.push(h('p', { class: 'note' }, icon('info', { size: 18 }),
      h('span', null, 'Import wykonuje się w całości albo wcale. Jeśli coś pójdzie nie tak, biblioteka zostanie bez zmian.')));
    return parts;
  }

  #resultView() {
    const { result } = this;
    const { library } = this.ctx;
    const lines = [];
    if (result.added > 0) lines.push(`Dodano: ${pluralTerms(result.added)}.`);
    if (result.updated > 0) lines.push(`Zaktualizowano: ${pluralTerms(result.updated)}.`);
    if (result.skipped + result.unchanged > 0) lines.push(`Pominięto: ${pluralTerms(result.skipped + result.unchanged)}.`);
    const created = [];
    if (result.domains > 0) created.push(plural(result.domains, 'dziedzinę', 'dziedziny', 'dziedzin'));
    if (result.modules > 0) created.push(plural(result.modules, 'moduł', 'moduły', 'modułów'));
    if (result.lessons > 0) created.push(plural(result.lessons, 'lekcję', 'lekcje', 'lekcji'));
    if (created.length > 0) lines.push(`Utworzono: ${joinList(created)}.`);

    const onlyLesson = result.lessonIDs.length === 1 ? library.getLesson(result.lessonIDs[0]) : null;
    return {
      title: 'Import z pliku',
      back: this.#backLink(),
      body: h('div', { class: 'empty', dataset: { testid: 'import-done' } },
        h('div', { class: 'empty__icon' }, icon('check', { size: 40 })),
        h('h2', { class: 'empty__title' }, 'Import zakończony'),
        h('p', { class: 'empty__text' }, lines.join(' ')),
        h('div', { class: 'empty__actions' },
          onlyLesson
            ? h('a', { class: 'button button--primary', href: routes.lesson(onlyLesson.id), dataset: { testid: 'import-open-lesson' } }, 'Otwórz lekcję')
            : h('a', { class: 'button button--primary', href: routes.domains(), dataset: { testid: 'import-open-library' } }, 'Otwórz Bibliotekę'),
          h('a', { class: 'button button--secondary', href: routes.glossary() }, 'Zobacz w Glosariuszu')
        )
      )
    };
  }

  #backLink() {
    const lesson = this.presetLessonID ? this.ctx.library.getLesson(this.presetLessonID) : null;
    return lesson
      ? { href: routes.lesson(lesson.id), label: lesson.name }
      : { href: routes.domains(), label: 'Biblioteka' };
  }

  view() {
    if (this.step === DONE && this.result) return this.#resultView();

    const stepBody = [
      () => this.#fileStep(),
      () => this.#sheetStep(),
      () => this.#columnsStep(),
      () => this.#placeStep(),
      () => this.#checkStep(),
      () => this.#previewStep(),
      () => this.#confirmStep()
    ][this.step]();

    const csvSheetTitle = this.step === 1 && this.file?.source.kind === 'csv' ? 'Sprawdź odczyt pliku' : STEP_TITLES[this.step];
    const blocker = this.#blocker();
    const importing = this.step === LAST_STEP;
    const total = this.plan ? this.plan.added + this.plan.updated : 0;

    this.nextButton = h('button', {
      type: 'button',
      class: 'button button--primary',
      disabled: Boolean(blocker) || Boolean(this.busy),
      dataset: { testid: 'import-next' },
      onClick: () => this.#next()
    }, importing ? (total > 0 ? `Importuj ${pluralTerms(total)}` : 'Importuj') : 'Dalej');

    this.hintElement = h('p', {
      class: 'wizard__hint', role: 'status', hidden: !blocker || this.step === 0, dataset: { testid: 'import-hint' }
    }, blocker ?? '');

    return {
      title: 'Import z pliku',
      subtitle: `Krok ${this.step + 1} z ${STEP_TITLES.length}`,
      back: this.#backLink(),
      body: [
        h('ol', { class: 'steps', 'aria-hidden': 'true' },
          STEP_TITLES.map((title, index) => h('li', {
            class: `steps__item${index < this.step ? ' steps__item--done' : ''}${index === this.step ? ' steps__item--current' : ''}`
          }))
        ),
        h('h2', { class: 'wizard__title', dataset: { testid: 'import-step-title' } }, csvSheetTitle),
        this.busy ? h('p', { class: 'form-message form-message--info', role: 'status', dataset: { testid: 'import-busy' } }, this.busy) : null,
        this.error ? message(this.error, 'error') : null,
        ...stepBody,
        this.hintElement
      ],
      bottomBar: h('div', { class: 'bottombar__inner' },
        this.step > 0
          ? h('button', { type: 'button', class: 'button button--plain', disabled: Boolean(this.busy), dataset: { testid: 'import-back' }, onClick: () => this.#back() }, 'Wstecz')
          : h('span'),
        this.nextButton
      )
    };
  }
}
