// Kreator importu z pliku XLSX lub CSV. Pojęcia przechodzą przez siedem kroków:
// plik → arkusz (albo sposób odczytu CSV) → kolumny → miejsce → sprawdzenie → podgląd → zatwierdzenie.
// Skoroszyt z arkuszem notatek („Notatki”: Domain, Module, Lesson, Note, Image) ma dodatkowo
// krok wyboru zawartości (pojęcia, notatki albo jedno i drugie) i krok sprawdzenia notatek.
// Do ostatniego kroku nic nie jest zapisywane; import to jedna niepodzielna operacja.

import { DELIMITERS, ENCODINGS } from '../../core/csv.js';
import { buildTemplateFile } from '../../core/exporter.js';
import {
  IMPORT_FIELDS, STRUCTURE_LEVELS, analyzeHeader, buildImportRows, describeColumns, missingForImport
} from '../../core/importer.js';
import { noteText } from '../../core/note-format.js';
import { analyzeNotesHeader, buildNoteRows, classifyTable } from '../../core/note-import.js';
import { openTableFile } from '../../core/tablefile.js';
import { joinList, plural, pluralForm, pluralImages, pluralNotes, pluralTerms } from '../../core/text.js';
import {
  actionRow, checkRow, field, formGroup, group, message, primaryButton, radioRow, selectInput, textInput, toggle, valueRow
} from '../components.js';
import { showError, toast } from '../dialogs.js';
import { h } from '../dom.js';
import { deliverFile, pickFile } from '../files.js';
import { icon } from '../icons.js';
import { prepareImage, urlPool } from '../images.js';
import { routes } from '../router.js';

const NEW = '__new__';
const NONE = '';
const PREVIEW_PAGE = 30;
const ISSUE_LIMIT = 100;
const NAME_LIMIT = 8;
const FILE_TYPES = '.xlsx,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const STEP_TITLES = {
  file: 'Wybierz plik',
  contents: 'Wybierz zawartość',
  sheet: 'Wybierz arkusz',
  columns: 'Przypisz kolumny',
  place: 'Wybierz miejsce',
  check: 'Sprawdź dane',
  preview: 'Przejrzyj pojęcia',
  notes: 'Sprawdź notatki',
  confirm: 'Zatwierdź import'
};
/** Kroki importu samych pojęć – pokazywane, zanim plik zostanie wybrany. */
const TERM_STEPS = ['file', 'sheet', 'columns', 'place', 'check', 'preview', 'confirm'];

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

const NOTE_MODES = [
  { id: 'replace', title: 'Zastąp notatką z pliku', subtitle: 'Dotychczasowa treść i obrazy tych lekcji zostaną usunięte.' },
  { id: 'append', title: 'Dopisz na końcu', subtitle: 'Treść i obrazy z pliku zostaną dodane po istniejących.' },
  { id: 'skip', title: 'Zostaw istniejące', subtitle: 'Lekcje, które mają notatkę, zostaną pominięte.' }
];

const NOTE_STATUS_LABELS = {
  added: 'Nowa notatka',
  replaced: 'Zastąpi istniejącą notatkę',
  appended: 'Zostanie dopisana do istniejącej',
  unchanged: 'Bez zmian – taka sama jak w lekcji',
  skipped: 'Pominięta – lekcja ma już notatkę',
  missingLesson: 'Nie ma takiej lekcji – dodaj kolumny Domain i Module, żeby ją utworzyć',
  ambiguousLesson: 'Kilka lekcji ma tę nazwę – dodaj kolumny Domain i Module',
  tooManyImages: 'Za dużo obrazów – notatka może mieć najwyżej 30',
  tooLong: 'Za długa treść notatki'
};
const NOTE_STATUS_CLASS = {
  added: 'added', replaced: 'updated', appended: 'updated', unchanged: 'unchanged', skipped: 'skipped'
};

const pluralRows = (count) => plural(count, 'wiersz', 'wiersze', 'wierszy');
const pluralColumns = (count) => plural(count, 'kolumna', 'kolumny', 'kolumn');
/** Biernik: „Dodano 1 notatkę”. */
const notesAccusative = (count) => plural(count, 'notatkę', 'notatki', 'notatek');

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

    this.stepIndex = 0;
    this.busy = null;
    this.error = null;
    this.token = 0;

    this.file = null;          // { name, size, source }
    this.sheetIndex = 0;
    this.csv = { encoding: null, delimiter: null };
    this.table = null;
    this.analyzedTable = null; // tabela, dla której wyliczono przypisanie kolumn

    /** Rodzaje arkuszy: [{ index, name, hidden, kind: 'terms' | 'notes' | 'empty', rows }]. */
    this.sheetInfo = [];
    this.notesSheetIndex = null;
    this.notesTable = null;
    this.contents = { terms: true, notes: false };

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
    this.notesBuilt = null;    // { notes, issues, counts, target }
    this.noteRows = null;
    this.noteMode = 'replace';
    this.preparedImages = new WeakMap();
    this.thumbnails = urlPool();
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
    this.thumbnails.release();
  }

  #refresh() {
    if (!this.disposed) this.ctx.refresh();
  }

  // ---------------------------------------------------------------- kroki

  /** Kroki kreatora dla wybranego pliku i zawartości. */
  #steps() {
    if (!this.file) return TERM_STEPS;
    const steps = ['file'];
    if (this.#hasChoice()) steps.push('contents');
    if (this.contents.terms) steps.push('sheet', 'columns', 'place', 'check', 'preview');
    else if (this.file.source.kind === 'csv') steps.push('sheet');
    if (this.contents.notes) steps.push('notes');
    steps.push('confirm');
    return steps;
  }

  #stepID() {
    return this.#steps()[this.stepIndex] ?? 'file';
  }

  /** Plik ma i pojęcia, i notatki – użytkownik wybiera, co zaimportować. */
  #hasChoice() {
    return this.notesSheetIndex !== null && this.sheetInfo.some((sheet) => sheet.kind === 'terms');
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
      this.rows = null;
      this.plan = null;
      this.notesBuilt = null;
      this.noteRows = null;
      this.notesTable = null;
      this.notesSheetIndex = null;
      this.sheetInfo = [];
      if (source.kind === 'csv') {
        this.csv = { encoding: source.encoding, delimiter: source.delimiter };
        this.table = source.read(this.csv);
        this.#classifyCsv();
      } else {
        for (const [index, sheet] of source.sheets.entries()) {
          const table = await source.readSheet(index);
          if (token !== this.token) return;
          this.sheetInfo.push({
            index, name: sheet.name, hidden: sheet.hidden, kind: classifyTable(table, sheet.name), rows: table.rows.length,
            // Wiersze z danymi (bez nagłówka) – do opisu zawartości pliku.
            dataRows: Math.max(0, table.rows.length - (analyzeHeader(table).hasHeader ? 1 : 0))
          });
        }
        // Arkusz notatek: pierwszy widoczny (albo ukryty, gdy widocznego nie ma).
        const notes = this.sheetInfo.filter((sheet) => sheet.kind === 'notes').sort((a, b) => Number(a.hidden) - Number(b.hidden));
        this.notesSheetIndex = notes[0]?.index ?? null;
        if (this.notesSheetIndex !== null) this.notesTable = await source.readSheet(this.notesSheetIndex, { rich: true });
        // Pojęcia: pierwszy widoczny arkusz z danymi, który nie jest arkuszem notatek.
        const order = this.sheetInfo.filter((sheet) => sheet.index !== this.notesSheetIndex)
          .sort((a, b) => Number(a.hidden) - Number(b.hidden) || Number(b.kind === 'terms') - Number(a.kind === 'terms'));
        this.sheetIndex = order.find((sheet) => sheet.kind === 'terms' && sheet.rows > 0)?.index ?? order[0]?.index ?? 0;
        this.table = await source.readSheet(this.sheetIndex);
        this.contents = { terms: this.notesSheetIndex === null || this.sheetInfo.some((sheet) => sheet.kind === 'terms'), notes: this.notesSheetIndex !== null };
      }
      if (token !== this.token) return;
      this.stepIndex = 1;
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

  /** Plik CSV to jedna tabela: albo pojęcia, albo notatki (bez obrazów). */
  #classifyCsv() {
    const notes = this.table && classifyTable(this.table, this.file.name.replace(/\.[^.]+$/, '')) === 'notes';
    this.sheetInfo = [{ index: 0, name: this.file.name, hidden: false, kind: notes ? 'notes' : 'terms', rows: this.table?.rows.length ?? 0 }];
    this.notesSheetIndex = notes ? 0 : null;
    this.notesTable = notes ? this.table : null;
    this.contents = { terms: !notes, notes };
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
      this.#classifyCsv();
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
        message: 'Arkusz „Pojęcia” ma nagłówki kolumn i dwa przykładowe pojęcia, a arkusz „Notatki” – przykładową notatkę z formatowaniem i obrazem. W następnym kroku wybierz „Zachowaj w Plikach”.'
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
    this.plan = this.ctx.library.planImport(this.contents.terms ? (this.rows ?? []) : [], {
      duplicates: this.duplicates,
      notes: this.contents.notes ? (this.noteRows ?? []) : [],
      noteMode: this.noteMode
    });
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

  /**
   * Lekcja dla wszystkich notatek albo null (wtedy wskazują ją kolumny arkusza notatek):
   * gdy wszystkie pojęcia trafiają do jednej lekcji, notatki też; gdy arkusz notatek nie ma
   * kolumny lekcji, a import zaczął się w lekcji – do niej.
   */
  #noteTarget(mapping) {
    if (this.contents.terms && STRUCTURE_LEVELS.every((level) => !this.#fromFile(level))) {
      const lesson = this.#chosen('lesson');
      if (lesson) return { lessonID: lesson.id, reason: 'terms' };
      const destination = this.#destination();
      const module = this.#chosen('module');
      const domain = this.#chosen('domain');
      return {
        domain: destination.domain, module: destination.module, lesson: destination.lesson,
        ...(module ? { moduleID: module.id } : domain ? { domainID: domain.id } : {}),
        reason: 'terms'
      };
    }
    if (mapping.lesson === undefined && this.presetLessonID && this.ctx.library.getLesson(this.presetLessonID)) {
      return { lessonID: this.presetLessonID, reason: 'preset' };
    }
    return null;
  }

  /** Obraz z arkusza gotowy do zapisu (zmniejszony, w formacie dla przeglądarek); pamiętany. */
  #preparedImage(image) {
    if (!this.preparedImages.has(image.bytes)) {
      this.preparedImages.set(image.bytes, prepareImage(image.bytes, { type: image.type, name: image.name }));
    }
    return this.preparedImages.get(image.bytes);
  }

  async #prepareNotes() {
    const token = (this.token += 1);
    this.error = null;
    this.busy = 'Sprawdzanie notatek…';
    this.#refresh();
    await nextFrame();
    if (token !== this.token) return false;
    try {
      const table = this.file.source.kind === 'csv' ? this.table : this.notesTable;
      const { mapping } = analyzeNotesHeader(table);
      const target = this.#noteTarget(mapping);
      const { reason, ...placement } = target ?? {};
      const built = buildNoteRows({ table, mapping, target: target ? placement : null });
      const issues = [...built.issues];
      for (const note of built.notes) {
        const images = [];
        for (const image of note.images) {
          try {
            images.push({ ...(await this.#preparedImage(image)), label: image.label ?? null });
          } catch {
            built.counts.skippedImages += 1;
            built.counts.warnings += 1;
            issues.push({ number: image.row, severity: 'warning', message: 'obrazu nie da się odczytać w tej przeglądarce – zapisz go jako PNG albo JPEG; pominięto go' });
          }
          if (token !== this.token) return false;
        }
        note.images = images;
      }
      built.counts.images = built.notes.reduce((sum, note) => sum + note.images.length, 0);
      issues.sort((a, b) => a.number - b.number);
      this.notesBuilt = { ...built, issues, reason: reason ?? null };
      this.noteRows = built.notes.map((note) => ({
        lessonID: note.lessonID, domainID: note.domainID, moduleID: note.moduleID,
        domain: note.domain ?? '', module: note.module ?? '', lesson: note.lesson ?? '',
        html: note.html, ...(typeof note.htmlEN === 'string' ? { htmlEN: note.htmlEN } : {}), images: note.images
      }));
      this.#computePlan();
      return true;
    } catch (error) {
      this.notesBuilt = null;
      this.noteRows = null;
      this.error = error?.message ?? String(error);
      console.error(error);
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
      const report = await this.ctx.library.importRows(this.contents.terms ? this.rows ?? [] : [], {
        duplicates: this.duplicates,
        notes: this.contents.notes ? this.noteRows ?? [] : [],
        noteMode: this.noteMode
      });
      this.result = report;
      this.stepIndex = this.#steps().length;
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

  /** Liczba zmian, które wniesie import (pojęcia i notatki). */
  #changes() {
    if (!this.plan) return { terms: 0, notes: 0 };
    return {
      terms: this.contents.terms ? this.plan.added + this.plan.updated : 0,
      notes: this.contents.notes ? this.plan.notes.added + this.plan.notes.replaced + this.plan.notes.appended : 0
    };
  }

  /** Powód, dla którego nie można przejść dalej, albo null. */
  #blocker() {
    switch (this.#stepID()) {
      case 'file': return this.file ? null : 'Wybierz plik, żeby przejść dalej.';
      case 'contents': return this.contents.terms || this.contents.notes ? null : 'Zaznacz, co chcesz zaimportować.';
      case 'sheet':
        if (!this.table) return 'Nie udało się odczytać danych.';
        return this.table.rows.length === 0 ? 'Tu nie ma żadnych danych.' : null;
      case 'columns': return missingForImport(this.mapping, null)[0] ?? null;
      case 'place': {
        const unchosen = STRUCTURE_LEVELS.find((level) => !this.#fromFile(level) && this.place[level].choice === NONE);
        return unchosen ? CHOOSE_PROMPTS[unchosen] : (missingForImport(this.mapping, this.#destination())[0] ?? null);
      }
      case 'check': return this.built && this.built.rows.length > 0 ? null : 'Żaden wiersz nie nadaje się do importu.';
      case 'notes': {
        const usable = this.noteRows && this.plan ? this.noteRows.length - this.plan.notes.failed : 0;
        if (usable > 0) return null;
        return this.contents.terms
          ? 'Żadna notatka nie nadaje się do importu. Wróć i odznacz notatki, żeby zaimportować same pojęcia.'
          : 'Żadna notatka nie nadaje się do importu.';
      }
      case 'confirm': {
        const changes = this.#changes();
        return changes.terms + changes.notes > 0 ? null : 'Plik nie wnosi nic nowego – nie ma czego importować.';
      }
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
    const id = this.#stepID();
    if (id === 'sheet' && this.contents.terms) this.#analyze();
    if (id === 'columns') this.#normalizePlace();
    if (id === 'place' && !(await this.#validate())) return;
    if (id === 'confirm') {
      await this.#import();
      return;
    }
    const nextID = this.#steps()[this.stepIndex + 1];
    if (nextID === 'notes' && !(await this.#prepareNotes())) return;
    if (nextID === 'confirm') {
      try {
        this.#computePlan();
      } catch (error) {
        this.error = error?.message ?? String(error);
        this.#refresh();
        return;
      }
    }
    this.stepIndex += 1;
    this.error = null;
    window.scrollTo(0, 0);
    this.#refresh();
  }

  #back() {
    if (this.busy || this.stepIndex === 0) return;
    this.stepIndex -= 1;
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
        footer: 'Nagłówki mogą być po polsku albo po angielsku, w dowolnej kolejności. Jeśli aplikacja ich nie rozpozna, przypiszesz kolumny ręcznie. Notatki z arkusza przenoszą formatowanie tekstu i obrazy wklejone do komórek – zobacz arkusz „Notatki” we wzorze.'
      },
        valueRow('Wymagane kolumny', 'Term PL, Term EN'),
        valueRow('Treść', 'Description PL/EN, Example PL/EN'),
        valueRow('Podział na lekcje', 'Domain, Module, Lesson'),
        valueRow('Dodatkowe', 'Tags, Difficulty, Notes'),
        valueRow('Notatki do lekcji', 'osobny arkusz: Domain, Module, Lesson, Note, Image'),
        actionRow({ label: 'Pobierz wzór pliku', iconName: 'download', onClick: () => this.#downloadTemplate(), testID: 'import-template' })
      )
    ];
  }

  #contentsStep() {
    const terms = this.sheetInfo.filter((sheet) => sheet.kind === 'terms');
    const notes = this.sheetInfo.find((sheet) => sheet.index === this.notesSheetIndex);
    const notesRows = Math.max(0, (this.notesTable?.rows.length ?? 1) - 1);
    const notesImages = this.notesTable?.images?.length ?? 0;
    const termsSubtitle = terms.length === 1
      ? `Arkusz „${terms[0].name}”: ${pluralRows(terms[0].dataRows ?? terms[0].rows)}`
      : `${plural(terms.length, 'arkusz', 'arkusze', 'arkuszy')} z pojęciami – wybierzesz jeden w następnym kroku`;
    const set = (key) => (checked) => {
      this.contents[key] = checked;
      this.#refresh();
    };
    return [
      h('p', { class: 'wizard__lead' },
        'W pliku są pojęcia i notatki do lekcji. Zaznacz, co zaimportować – możesz też wybrać tylko jedno z nich.'),
      group({ title: 'Zawartość pliku' },
        checkRow({ checked: this.contents.terms, title: 'Pojęcia (fiszki)', subtitle: termsSubtitle, testID: 'import-content-terms', onChange: set('terms') }),
        checkRow({
          checked: this.contents.notes,
          title: 'Notatki do lekcji',
          subtitle: `Arkusz „${notes?.name ?? ''}”: ${pluralRows(notesRows)}${notesImages > 0 ? `, ${pluralImages(notesImages)}` : ''}`,
          testID: 'import-content-notes',
          onChange: set('notes')
        })
      )
    ];
  }

  #sheetStep() {
    const { source } = this.file;
    const parts = [];
    if (source.kind === 'xlsx') {
      // Arkusz notatek ma osobny krok – na liście arkuszy z pojęciami go nie ma.
      const listed = source.sheets.map((sheet, index) => ({ sheet, index }))
        .filter(({ index }) => !(this.contents.notes && index === this.notesSheetIndex));
      parts.push(group({ title: listed.length === 1 ? 'Arkusz' : 'Arkusze w pliku' },
        listed.map(({ sheet, index }) => radioRow({
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

  /** Lista uwag do wierszy (błędy i ostrzeżenia). */
  #issuesList(issues, testID) {
    const shown = issues.slice(0, ISSUE_LIMIT);
    return h('section', { class: 'group' },
      h('h3', { class: 'group__title' }, 'Uwagi do wierszy'),
      h('ul', { class: 'group__list issues', role: 'list', dataset: { testid: testID } },
        shown.map((issue) => h('li', { class: `issue issue--${issue.severity}` },
          icon(issue.severity === 'error' ? 'close' : 'warning', { size: 18 }),
          h('span', null,
            h('strong', null, `Wiersz ${issue.number}`),
            ` – ${issue.severity === 'error' ? 'błąd' : 'ostrzeżenie'}: ${issue.message}`)
        ))
      ),
      issues.length > ISSUE_LIMIT
        ? h('p', { class: 'group__footer' }, `Pokazano pierwsze ${ISSUE_LIMIT} z ${issues.length} uwag.`)
        : null
    );
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
      parts.push(this.#issuesList(built.issues, 'import-issues'));
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

  /** Ścieżka lekcji notatki: z biblioteki (gdy lekcja istnieje) albo z nazw w pliku. */
  #notePath(row, index) {
    const { library } = this.ctx;
    const lessonID = this.plan?.notes.lessons[index] ?? row.lessonID;
    if (lessonID && library.getLesson(lessonID)) return library.lessonPath(lessonID);
    return [row.domain, row.module, row.lesson].filter(Boolean).join(' › ') || '—';
  }

  #notesStep() {
    const { notesBuilt: built, plan, noteRows } = this;
    if (!built || !plan || !noteRows) return [];
    const report = plan.notes;
    const parts = [];
    this.thumbnails.release();

    parts.push(group({ title: 'Wynik sprawdzenia' },
      valueRow('Notatki', String(built.counts.notes)),
      valueRow('Obrazy', String(built.counts.images)),
      built.counts.rejected > 0 ? valueRow('Wiersze odrzucone z powodu błędów', String(built.counts.rejected)) : null,
      built.counts.skippedImages > 0 ? valueRow('Pominięte obrazy', String(built.counts.skippedImages)) : null,
      report.failed > 0 ? valueRow('Notatki, których nie da się zaimportować', String(report.failed)) : null
    ));

    if (built.reason === 'terms') {
      parts.push(message('Wszystkie pojęcia trafiają do jednej lekcji, więc notatki z pliku też trafią do niej.', 'info'));
    } else if (built.reason === 'preset') {
      parts.push(message('Arkusz notatek nie ma kolumny z lekcją – notatka trafi do lekcji, z której zaczął się import.', 'info'));
    }

    if (report.existing > 0) {
      const lessons = `${report.existing} ${pluralForm(report.existing, 'lekcja ma', 'lekcje mają', 'lekcji ma')}`;
      parts.push(group({ title: `${lessons} już notatkę`, footer: 'Dotyczy tylko lekcji, które mają notatkę. Pozostałe notatki zostaną dodane.' },
        NOTE_MODES.map((mode) => radioRow({
          name: 'import-note-mode',
          value: mode.id,
          checked: this.noteMode === mode.id,
          title: mode.title,
          subtitle: mode.subtitle,
          testID: `import-note-mode-${mode.id}`,
          onChange: (value) => {
            this.noteMode = value;
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

    parts.push(h('section', { class: 'group' },
      h('h3', { class: 'group__title group__title--small' }, pluralNotes(noteRows.length)),
      h('ul', { class: 'group__list terms', role: 'list', dataset: { testid: 'import-notes-list' } },
        noteRows.map((row, index) => {
          const status = report.statuses[index];
          const text = noteText(row.html || row.htmlEN || '').replace(/\s+/g, ' ').trim();
          const numbers = built.notes[index]?.numbers ?? [];
          const rowsLabel = numbers.length > 1 ? `Wiersze ${numbers[0]}–${numbers[numbers.length - 1]}` : `Wiersz ${numbers[0] ?? '?'}`;
          return h('li', { class: 'term term--preview note-preview' },
            h('div', { class: 'term__text' },
              h('span', { class: 'term__path' }, `${rowsLabel} → ${this.#notePath(row, index)}`),
              h('span', { class: 'note-preview__text' }, text ? (text.length > 160 ? `${text.slice(0, 160)}…` : text) : 'Bez tekstu – same obrazy'),
              row.images.length > 0
                ? h('span', { class: 'note-preview__images' },
                    row.images.slice(0, 4).map((image) => h('img', { class: 'note-preview__thumb', src: this.thumbnails.add(image), alt: '' })),
                    row.images.length > 4 ? h('span', { class: 'note-preview__more' }, `+${row.images.length - 4}`) : null,
                    h('span', { class: 'visually-hidden' }, pluralImages(row.images.length)))
                : null,
              h('span', { class: `status status--${NOTE_STATUS_CLASS[status] ?? 'error'}` }, NOTE_STATUS_LABELS[status] ?? '')
            )
          );
        })
      )
    ));

    if (built.issues.length > 0) parts.push(this.#issuesList(built.issues, 'import-notes-issues'));
    return parts;
  }

  #confirmStep() {
    const { plan } = this;
    if (!plan) return [];
    const parts = [];
    if (this.contents.terms) {
      parts.push(group({ title: 'Pojęcia' },
        valueRow('Zostaną dodane', String(plan.added)),
        plan.updated > 0 ? valueRow('Zostaną zaktualizowane', String(plan.updated)) : null,
        plan.unchanged > 0 ? valueRow('Bez zmian (takie same jak w bibliotece)', String(plan.unchanged)) : null,
        plan.skipped > 0 ? valueRow('Zostaną pominięte', String(plan.skipped)) : null,
        this.built?.counts.rejected > 0 ? valueRow('Odrzucone z powodu błędów', String(this.built.counts.rejected)) : null
      ));
    }
    if (this.contents.notes) {
      const notes = plan.notes;
      parts.push(h('div', { dataset: { testid: 'import-confirm-notes' } }, group({ title: 'Notatki do lekcji' },
        valueRow('Zostaną dodane', String(notes.added)),
        notes.replaced > 0 ? valueRow('Zastąpią istniejące', String(notes.replaced)) : null,
        notes.appended > 0 ? valueRow('Zostaną dopisane', String(notes.appended)) : null,
        notes.unchanged > 0 ? valueRow('Bez zmian', String(notes.unchanged)) : null,
        notes.skipped > 0 ? valueRow('Zostaną pominięte', String(notes.skipped)) : null,
        notes.failed > 0 ? valueRow('Nie da się zaimportować', String(notes.failed)) : null,
        notes.images > 0 ? valueRow('Obrazy w notatkach', String(notes.images)) : null
      )));
    }

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
      parts.push(message(this.contents.terms
        ? 'Pojęcia trafią do istniejących lekcji – nie powstanie żadna nowa dziedzina, moduł ani lekcja.'
        : 'Notatki trafią do istniejących lekcji – nie powstanie żadna nowa dziedzina, moduł ani lekcja.', 'info'));
    }
    if (this.contents.terms && plan.unconsolidated.length > 0) {
      parts.push(h('section', { class: 'group', dataset: { testid: 'import-unconsolidated' } },
        h('h3', { class: 'group__title' }, 'Przestaną być utrwalone'),
        h('div', { class: 'wizard__created' }, limitedList(plan.unconsolidated)),
        h('p', { class: 'group__footer' }, 'Dochodzą tu nowe pojęcia albo lekcje, więc ich fiszki wrócą do zwykłych powtórek. Status możesz potem nadać ponownie.')
      ));
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
    const notes = result.notes;
    if (notes.added > 0) lines.push(`Dodano ${notesAccusative(notes.added)}${notes.images > 0 && notes.replaced + notes.appended === 0 ? ` (${pluralImages(notes.images)})` : ''}.`);
    if (notes.replaced > 0) lines.push(`Zastąpiono ${notesAccusative(notes.replaced)}.`);
    if (notes.appended > 0) lines.push(`Uzupełniono ${notesAccusative(notes.appended)}.`);
    if (notes.skipped + notes.unchanged > 0) lines.push(`Pominięto ${notesAccusative(notes.skipped + notes.unchanged)}.`);
    const created = [];
    if (result.domains > 0) created.push(plural(result.domains, 'dziedzinę', 'dziedziny', 'dziedzin'));
    if (result.modules > 0) created.push(plural(result.modules, 'moduł', 'moduły', 'modułów'));
    if (result.lessons > 0) created.push(plural(result.lessons, 'lekcję', 'lekcje', 'lekcji'));
    if (created.length > 0) lines.push(`Utworzono: ${joinList(created)}.`);
    if (result.unconsolidated?.length > 0) {
      // Ścieżka lekcji ma trzy części (dziedzina › moduł › lekcja), modułu – dwie.
      const lessons = result.unconsolidated.filter((path) => path.split(' › ').length > 2).length;
      const modules = result.unconsolidated.length - lessons;
      const from = [
        lessons > 0 ? `${lessons} lekcji` : null,
        modules > 0 ? `${modules} ${pluralForm(modules, 'modułu', 'modułów', 'modułów')}` : null
      ].filter(Boolean);
      lines.push(`Zdjęto utrwalenie z ${joinList(from)}.`);
    }

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

  /** Napis na przycisku importu: „Importuj 40 pojęć i 2 notatki”. */
  #importLabel() {
    const changes = this.#changes();
    const parts = [];
    if (changes.terms > 0) parts.push(pluralTerms(changes.terms));
    if (changes.notes > 0) parts.push(notesAccusative(changes.notes));
    return parts.length > 0 ? `Importuj ${parts.join(' i ')}` : 'Importuj';
  }

  view() {
    const steps = this.#steps();
    if (this.result && this.stepIndex >= steps.length) return this.#resultView();

    const id = this.#stepID();
    const stepBody = {
      file: () => this.#fileStep(),
      contents: () => this.#contentsStep(),
      sheet: () => this.#sheetStep(),
      columns: () => this.#columnsStep(),
      place: () => this.#placeStep(),
      check: () => this.#checkStep(),
      preview: () => this.#previewStep(),
      notes: () => this.#notesStep(),
      confirm: () => this.#confirmStep()
    }[id]();

    const stepTitle = id === 'sheet' && this.file?.source.kind === 'csv' ? 'Sprawdź odczyt pliku' : STEP_TITLES[id];
    const blocker = this.#blocker();
    const importing = id === 'confirm';

    this.nextButton = h('button', {
      type: 'button',
      class: 'button button--primary',
      disabled: Boolean(blocker) || Boolean(this.busy),
      dataset: { testid: 'import-next' },
      onClick: () => this.#next()
    }, importing ? this.#importLabel() : 'Dalej');

    this.hintElement = h('p', {
      class: 'wizard__hint', role: 'status', hidden: !blocker || id === 'file', dataset: { testid: 'import-hint' }
    }, blocker ?? '');

    return {
      title: 'Import z pliku',
      subtitle: `Krok ${this.stepIndex + 1} z ${steps.length}`,
      back: this.#backLink(),
      body: [
        h('ol', { class: 'steps', 'aria-hidden': 'true' },
          steps.map((step, index) => h('li', {
            class: `steps__item${index < this.stepIndex ? ' steps__item--done' : ''}${index === this.stepIndex ? ' steps__item--current' : ''}`
          }))
        ),
        h('h2', { class: 'wizard__title', dataset: { testid: 'import-step-title' } }, stepTitle),
        this.busy ? h('p', { class: 'form-message form-message--info', role: 'status', dataset: { testid: 'import-busy' } }, this.busy) : null,
        this.error ? message(this.error, 'error') : null,
        ...stepBody,
        this.hintElement
      ],
      bottomBar: h('div', { class: 'bottombar__inner' },
        this.stepIndex > 0
          ? h('button', { type: 'button', class: 'button button--plain', disabled: Boolean(this.busy), dataset: { testid: 'import-back' }, onClick: () => this.#back() }, 'Wstecz')
          : h('span'),
        this.nextButton
      )
    };
  }
}
