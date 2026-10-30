// Biblioteka materiałów: dziedziny, moduły, lekcje i pojęcia.
//
// Dane są w pamięci (Map), więc odczyt jest natychmiastowy i synchroniczny. Każda zmiana
// przechodzi przez #mutate(): modyfikuje pamięć, utrwala całość jedną transakcją adaptera,
// a w razie błędu przywraca poprzedni stan. Interfejs nigdy nie widzi stanu częściowego.
//
// Usługa odpowiada też za spójność kluczy przy przenoszeniu elementów i za usuwanie
// kaskadowe: dziedzina → moduły → lekcje → pojęcia → dane nauki pojęć.

import {
  ALL_STORES, DIFFICULTY_MAX, DIFFICULTY_MIN, HISTORY_STORES, MEDIA_STORES, MEMORY_STORES, NOTE_FILE_LIMIT, NOTE_FILE_MAX_BYTES,
  NOTE_IMAGE_LIMIT, NOTE_IMAGE_MAX_BYTES, SETTINGS_ID, TERM_HISTORY_STORES, defaultSettings, makeDomain, makeLesson, makeModule,
  makeNoteFile, makeNoteImage, makeTerm, newID, noteFileMeta, noteImageMeta, nowISO, termFieldsFromDraft, termToDraft
} from './model.js';
import { createdRange, createdWithin } from './created.js';
import { cleanFileName, fileTypeOf } from './note-files.js';
import { NOTE_HTML_LIMIT, normalizeNoteHtml } from './note-format.js';
import { cleanImageCaption, labelKey, withImageLabels } from './note-refs.js';
import { NOTE_TABLE_LIMIT, cleanNoteTables, withTableLabels } from './tables.js';
import { blankToNull, collapseWhitespace, isBlank, normalizeKey } from './text.js';
import { assertAdapter, emptyChanges } from './storage.js';
import { crc32 } from './zip.js';
import { createScheduler } from './fsrs.js';
import { quizResult } from './quiz.js';
import { BOTH, matchesTermStatus } from './stats.js';
import {
  DECISIONS, MAX_CARD_TIME, REPEAT_KINDS, emptyTiles, fsrsRating, makeAssessment, makeSession, nextProgress, repeatQueue,
  reviewSchedule, summarizeSession
} from './study.js';

/** Wpis dziennika powtórek FSRS – jeden na zatwierdzoną fiszkę. */
function reviewRecord({ assessment, rating, reviewed, migrated = false }) {
  return {
    id: newID(),
    termID: assessment.termID,
    direction: assessment.direction,
    assessmentID: assessment.id,
    sessionID: assessment.sessionID ?? null,
    rating,
    stateBefore: reviewed.stateBefore,
    stateAfter: reviewed.schedule.state,
    retrievability: reviewed.retrievability,
    stability: reviewed.schedule.stability,
    difficulty: reviewed.schedule.difficulty,
    interval: reviewed.interval,
    due: reviewed.schedule.due,
    reviewedAt: assessment.assessedAt,
    ...(migrated ? { migrated: true } : {})
  };
}

const LEVEL_GENITIVE = { domain: 'dziedziny', module: 'modułu', lesson: 'lekcji', term: 'pojęcia' };
const LEVEL_STORE = { domain: 'domains', module: 'modules', lesson: 'lessons', term: 'terms' };
const PARENT_PROMPT = { domain: 'Wybierz dziedzinę.', module: 'Wybierz moduł.', lesson: 'Wybierz lekcję.' };

export class LibraryError extends Error {
  constructor(code, message, level = null) {
    super(message);
    this.name = 'LibraryError';
    this.code = code;
    this.level = level;
  }
}

const errors = {
  emptyName: (level) => new LibraryError('emptyName', `Podaj nazwę ${LEVEL_GENITIVE[level]}.`, level),
  missingTermPL: () => new LibraryError('missingTermPL', 'Podaj nazwę pojęcia po polsku.'),
  missingTermEN: () => new LibraryError('missingTermEN', 'Podaj nazwę pojęcia po angielsku.'),
  invalidDifficulty: () => new LibraryError('invalidDifficulty', `Trudność musi być liczbą od ${DIFFICULTY_MIN} do ${DIFFICULTY_MAX}.`),
  notFound: (level) => new LibraryError('notFound', `Nie znaleziono ${LEVEL_GENITIVE[level]}. Element mógł zostać usunięty.`, level),
  parentNotSelected: (level) => new LibraryError('parentNotSelected', PARENT_PROMPT[level], level),
  nothingSelected: () => new LibraryError('nothingSelected', 'Nie wybrano żadnych pojęć.'),
  emptyStudyQueue: () => new LibraryError('emptyStudyQueue', 'Brak fiszek pasujących do wybranych ustawień.'),
  noStudySession: () => new LibraryError('noStudySession', 'Nie ma trwającej sesji nauki.'),
  noLastStudy: () => new LibraryError('noLastStudy', 'Nie ma zakończonej sesji do powtórzenia albo jej pojęcia zostały usunięte.'),
  emptyQuiz: () => new LibraryError('emptyQuiz', 'Z tego materiału nie da się ułożyć quizu – potrzebne są co najmniej dwa pojęcia o różnym brzmieniu.'),
  noQuiz: () => new LibraryError('noQuiz', 'Nie ma trwającego quizu.'),
  nothingToUndo: () => new LibraryError('nothingToUndo', 'Nie ma decyzji do cofnięcia.'),
  invalidDecision: () => new LibraryError('invalidDecision', 'Nieznana decyzja – oczekiwano „Umiem” albo „Powtórz”.'),
  noteTooLong: () => new LibraryError('noteTooLong', 'Notatka jest za długa. Podziel ją albo skróć.'),
  tooManyImages: () => new LibraryError('tooManyImages', `Notatka może mieć najwyżej ${NOTE_IMAGE_LIMIT} obrazów.`),
  tooManyTables: () => new LibraryError('tooManyTables', `Notatka może mieć najwyżej ${NOTE_TABLE_LIMIT} tabel.`),
  imageTooLarge: () => new LibraryError('imageTooLarge', 'Obraz jest za duży (limit to 20 MB).'),
  invalidImage: () => new LibraryError('invalidImage', 'Nie udało się zapisać obrazu – plik jest pusty albo uszkodzony.'),
  tooManyFiles: () => new LibraryError('tooManyFiles', `Notatka może mieć najwyżej ${NOTE_FILE_LIMIT} załączników.`),
  fileTooLarge: (name) => new LibraryError('fileTooLarge', `Plik „${name}” jest za duży (limit to 50 MB).`),
  invalidFile: (name) => new LibraryError('invalidFile', `Nie udało się zapisać pliku „${name}” – jest pusty.`),
  cannotRestore: (message) => new LibraryError('cannotRestore', message)
};

/** Bajty obrazu jako Uint8Array (z ArrayBuffer albo widoku). */
function imageBytes(image) {
  const bytes = image?.bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return null;
}

/** Nowy obraz notatki gotowy do zapisu (sprawdzony). */
function newNoteImage(lessonID, image) {
  const bytes = imageBytes(image);
  if (!bytes || bytes.byteLength === 0 || !image.type) throw errors.invalidImage();
  if (bytes.byteLength > NOTE_IMAGE_MAX_BYTES) throw errors.imageTooLarge();
  return makeNoteImage(lessonID, { ...image, bytes }, image.crc ?? crc32(bytes));
}

/** Nowy załącznik notatki gotowy do zapisu (sprawdzony). */
function newNoteFile(lessonID, file) {
  const bytes = imageBytes(file);
  const name = cleanFileName(file.name);
  if (!bytes || bytes.byteLength === 0) throw errors.invalidFile(name);
  if (bytes.byteLength > NOTE_FILE_MAX_BYTES) throw errors.fileTooLarge(name);
  return makeNoteFile(lessonID, { name, type: fileTypeOf(name, file.type), bytes, duration: file.duration }, file.crc ?? crc32(bytes));
}

/** Opisy obrazów i załączników notatki (starsze notatki nie mają pola `files`). */
function mediaOf(note) {
  return [
    ...(note?.images ?? []).map((meta) => ({ store: 'noteImages', meta })),
    ...(note?.files ?? []).map((meta) => ({ store: 'noteFiles', meta }))
  ];
}

/** Te same obrazy w tej samej kolejności (po sumie kontrolnej i rozmiarze). */
function sameImages(metas, images) {
  if (metas.length !== images.length) return false;
  return metas.every((meta, index) => {
    const bytes = imageBytes(images[index]);
    const crc = images[index].crc ?? (bytes ? crc32(bytes) : null);
    return meta.crc === crc && meta.size === (bytes?.byteLength ?? images[index].size);
  });
}

/** Te same sygnatury obrazów (brakujące liczą się jako „Obraz N” po kolei). */
function sameLabels(metas, images) {
  const current = withImageLabels(metas);
  const incoming = withImageLabels(images);
  // Od 1.18 także podpisy obrazów.
  return current.every((meta, index) => labelKey(meta.label) === labelKey(incoming[index]?.label)
    && cleanImageCaption(meta.caption) === cleanImageCaption(incoming[index]?.caption));
}

function bySortOrder(a, b) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.createdAt === b.createdAt) return 0;
  return a.createdAt < b.createdAt ? -1 : 1;
}

function validatedName(raw, level) {
  const name = collapseWhitespace(raw);
  if (name === '') throw errors.emptyName(level);
  return name;
}

/** Sprawdza szkic pojęcia: nazwy PL i EN są wymagane, reszta opcjonalna. */
export function validateTermDraft(draft) {
  if (isBlank(draft.termPL)) throw errors.missingTermPL();
  if (isBlank(draft.termEN)) throw errors.missingTermEN();
  const difficulty = draft.difficulty;
  if (difficulty !== null && difficulty !== undefined) {
    if (!Number.isInteger(difficulty) || difficulty < DIFFICULTY_MIN || difficulty > DIFFICULTY_MAX) {
      throw errors.invalidDifficulty();
    }
  }
}

/**
 * Aktualizacja pojęcia treścią z importu. Nadpisywane są tylko pola, które wiersz
 * rzeczywiście niesie: pusta komórka albo brak kolumny nie kasuje istniejącej treści.
 * Zwraca nowe pola pojęcia albo null, gdy nic by się nie zmieniło.
 */
function mergeTermUpdate(existing, draft) {
  const merged = termToDraft(existing);
  for (const [key, value] of Object.entries(draft)) {
    if (key === 'tags') {
      if (Array.isArray(value) && value.length > 0) merged.tags = value;
    } else if (key === 'difficulty') {
      if (value !== null && value !== undefined) merged.difficulty = value;
    } else if (key === 'isFavorite') {
      merged.isFavorite = existing.isFavorite || Boolean(value);
    } else if (!isBlank(value)) {
      merged[key] = value;
    }
  }
  const fields = termFieldsFromDraft(merged);
  const same = Object.entries(fields).every(([key, value]) => {
    const current = existing[key];
    // Od 1.56 też pola z obiektami (własne strony fiszki, obrazy na stronach) – porównanie treści.
    if (key === 'cardFaces' || key === 'cardMedia') return JSON.stringify(value) === JSON.stringify(current ?? (key === 'cardMedia' ? [] : null));
    return Array.isArray(value) ? value.join('\n') === (current ?? []).join('\n') : value === (current ?? null) || value === current;
  });
  return same ? null : fields;
}

/** Zbiera zmiany jednej operacji i pozwala je wycofać. */
class UnitOfWork {
  constructor(maps) {
    this.maps = maps;
    this.before = new Map();
    this.purgeTermIDs = [];
    /** Dzienniki nauki nie są trzymane w pamięci – zbieramy tylko zapisy i usunięcia. */
    this.journalPuts = new Map();
    this.journalDeletes = new Map();
    /** Komunikaty dla interfejsu po udanym zapisie, np. utrata statusu „utrwalona”. */
    this.notices = [];
  }

  /** Dopisuje wpis do dziennika (magazynu spoza pamięci). */
  append(store, record) {
    if (!this.journalPuts.has(store)) this.journalPuts.set(store, []);
    this.journalPuts.get(store).push(record);
  }

  /** Usuwa wpis dziennika – używane wyłącznie przy cofaniu ostatniej decyzji. */
  erase(store, id) {
    if (!this.journalDeletes.has(store)) this.journalDeletes.set(store, []);
    this.journalDeletes.get(store).push(id);
  }

  #remember(store, id) {
    const key = `${store}/${id}`;
    if (!this.before.has(key)) {
      this.before.set(key, { store, id, record: this.maps[store].get(id) });
    }
  }

  put(store, record) {
    this.#remember(store, record.id);
    this.maps[store].set(record.id, record);
  }

  delete(store, id) {
    this.#remember(store, id);
    this.maps[store].delete(id);
  }

  purgeTerms(ids) {
    this.purgeTermIDs.push(...ids);
  }

  /** Czy operacja zmienia dzienniki nauki (zapis, usunięcie, usunięcie pojęć). Obrazy notatek się nie liczą. */
  touchesJournals() {
    const journal = (store) => HISTORY_STORES.includes(store);
    return [...this.journalPuts.keys()].some(journal) || [...this.journalDeletes.keys()].some(journal) || this.purgeTermIDs.length > 0;
  }

  /** Zmiany względem stanu sprzed operacji (każdy rekord najwyżej raz). */
  changes() {
    const changes = emptyChanges();
    for (const { store, id, record } of this.before.values()) {
      const current = this.maps[store].get(id);
      if (current !== undefined) {
        (changes.puts[store] ??= []).push(current);
      } else if (record !== undefined) {
        (changes.deletes[store] ??= []).push(id);
      }
    }
    for (const [store, records] of this.journalPuts) (changes.puts[store] ??= []).push(...records);
    for (const [store, ids] of this.journalDeletes) (changes.deletes[store] ??= []).push(...ids);
    changes.purgeTermIDs = [...new Set(this.purgeTermIDs)];
    return changes;
  }

  rollback() {
    for (const { store, id, record } of this.before.values()) {
      if (record === undefined) this.maps[store].delete(id);
      else this.maps[store].set(id, record);
    }
  }
}

export class Library {
  #listeners = new Set();
  /** Odbiorcy komunikatów o skutkach zmian (np. lekcja przestała być utrwalona). */
  #noticeListeners = new Set();
  /** Kolejka operacji zapisu – każda zaczyna się po zakończeniu poprzedniej. */
  #queue = Promise.resolve();
  /** Liczniki i listy wyliczane z danych; unieważniane po każdej zmianie. */
  #derived = null;
  /** Planista FSRS dla bieżącej docelowej skuteczności. */
  #schedulerCache = null;
  /** Wyniki quizów pojęć (termID → { attempts, correct, lastCorrect, lastAt }) – z dziennika quizAnswers. */
  #quizStats = new Map();
  /** Dzienniki do statystyk: { revision, promise } – czytane z bazy raz na zmianę dzienników. */
  #journals = null;
  /** Posortowane listy pojęć dla glosariusza, według rodzaju sortowania. */
  #sorted = new Map();

  constructor(adapter) {
    // Magazyn danych – dowolny adapter z interfejsem z storage.js (od 1.30.2 sprawdzany od razu).
    this.adapter = assertAdapter(adapter);
    this.maps = Object.fromEntries(MEMORY_STORES.map((name) => [name, new Map()]));
    this.revision = 0;
    /** Rośnie przy każdej zmianie dzienników nauki (statystyki czytają je wtedy na nowo). */
    this.journalRevision = 0;
  }

  /** Wczytuje dane z adaptera do pamięci. */
  async load() {
    const data = await this.adapter.loadAll();
    for (const name of MEMORY_STORES) {
      this.maps[name] = new Map((data[name] ?? []).map((record) => [record.id, record]));
    }
    await this.#migrateSchedules();
    await this.#migrateDomainColors();
    await this.#loadQuizStats();
    this.journalRevision += 1;
    this.#changed();
  }

  /**
   * Wersja 1.2: tło ikon dziedzin jest domyślnie szare. Istniejące dziedziny (zapisane, zanim
   * ustawienia miały znacznik domainColorsGray – także gdy ustawień w ogóle nie zapisano)
   * przestawiamy jeden raz; potem kolor wybrany w edycji dziedziny zostaje.
   */
  async #migrateDomainColors() {
    const settings = this.maps.settings.get(SETTINGS_ID);
    // Pusta aplikacja przy pierwszym otwarciu niczego nie zapisuje.
    if (settings?.domainColorsGray || (!settings && this.maps.domains.size === 0)) return;
    const unit = new UnitOfWork(this.maps);
    for (const domain of [...this.maps.domains.values()]) {
      if (domain.color !== 'gray') unit.put('domains', { ...domain, color: 'gray', updatedAt: nowISO() });
    }
    unit.put('settings', { ...(settings ?? defaultSettings()), id: SETTINGS_ID, domainColorsGray: true, updatedAt: nowISO() });
    try {
      await this.adapter.commit(unit.changes());
    } catch (error) {
      unit.rollback();
      console.error(error);
    }
  }

  /**
   * Wszystkie dzienniki nauki ({ assessments, reviews, quizAnswers, studySessions, quizSessions })
   * do statystyk. Wynik jest zapamiętany do następnej zmiany dzienników (`journalRevision`).
   */
  journals() {
    if (this.#journals?.revision === this.journalRevision) return this.#journals.promise;
    const promise = Promise.all(HISTORY_STORES.map((name) => this.adapter.readStore(name)))
      .then((stores) => Object.fromEntries(HISTORY_STORES.map((name, index) => [name, stores[index]])));
    const entry = { revision: this.journalRevision, promise };
    this.#journals = entry;
    promise.catch(() => {
      if (this.#journals === entry) this.#journals = null;
    });
    return promise;
  }

  async #loadQuizStats() {
    this.#quizStats = new Map();
    let answers = [];
    try {
      answers = await this.adapter.readStore('quizAnswers');
    } catch (error) {
      console.error(error);
    }
    answers.sort((a, b) => (a.answeredAt < b.answeredAt ? -1 : a.answeredAt > b.answeredAt ? 1 : 0));
    for (const answer of answers) this.#countQuizAnswer(answer);
  }

  #countQuizAnswer(answer) {
    const stats = this.#quizStats.get(answer.termID) ?? { attempts: 0, correct: 0, lastCorrect: null, lastAt: null };
    stats.attempts += 1;
    if (answer.isCorrect) stats.correct += 1;
    stats.lastCorrect = Boolean(answer.isCorrect);
    stats.lastAt = answer.answeredAt ?? null;
    this.#quizStats.set(answer.termID, stats);
  }

  /** Wyniki quizów pojęcia (oba kierunki razem) albo null, gdy nie pojawiło się w quizie. */
  getQuizStats(termID) {
    const stats = this.#quizStats.get(termID);
    return stats ? { ...stats } : null;
  }

  /**
   * Postępy zapisane przed wprowadzeniem FSRS (wersje 0.3.x) nie mają harmonogramu.
   * Odtwarzamy go z historii ocen – każda ocena to powtórka w tej samej chwili co wtedy –
   * i dopisujemy brakujące wpisy dziennika powtórek. Bez rozmycia, więc wynik jest powtarzalny.
   */
  async #migrateSchedules() {
    const pending = [...this.maps.progress.values()].filter((progress) => progress.reviewCount > 0 && !progress.schedule);
    if (pending.length === 0) return;
    const history = new Map();
    for (const assessment of await this.adapter.readStore('assessments')) {
      const key = `${assessment.termID}\n${assessment.direction}`;
      if (!history.has(key)) history.set(key, []);
      history.get(key).push(assessment);
    }
    const scheduler = createScheduler({ desiredRetention: this.#desiredRetention(), enableFuzzing: false });
    const unit = new UnitOfWork(this.maps);
    for (const progress of pending) {
      const entries = (history.get(`${progress.termID}\n${progress.direction}`) ?? [])
        .sort((a, b) => (a.assessedAt < b.assessedAt ? -1 : a.assessedAt > b.assessedAt ? 1 : 0));
      if (entries.length === 0) continue;
      let schedule = null;
      for (const assessment of entries) {
        const rating = fsrsRating(assessment);
        const reviewed = reviewSchedule(scheduler, schedule, rating, Date.parse(assessment.assessedAt));
        unit.append('reviews', reviewRecord({ assessment, rating, reviewed, migrated: true }));
        schedule = reviewed.schedule;
      }
      unit.put('progress', { ...progress, schedule });
    }
    try {
      await this.adapter.commit(unit.changes());
    } catch (error) {
      // Bez harmonogramu aplikacja nadal działa (fiszki są traktowane jak nowe w FSRS);
      // przeliczenie zostanie ponowione przy następnym otwarciu.
      unit.rollback();
      console.error(error);
    }
  }

  #desiredRetention() {
    const value = Number(this.getSettings().desiredRetention);
    return value >= 0.7 && value <= 0.99 ? value : 0.9;
  }

  /** Planista FSRS z docelową skutecznością z ustawień. */
  scheduler() {
    const retention = this.#desiredRetention();
    if (this.#schedulerCache?.retention !== retention) {
      this.#schedulerCache = { retention, scheduler: createScheduler({ desiredRetention: retention }) };
    }
    return this.#schedulerCache.scheduler;
  }

  /** Wszystkie rekordy postępu (pojęcie + kierunek). */
  listProgress() {
    return [...this.maps.progress.values()];
  }

  /**
   * Rejestruje odbiorcę komunikatów o skutkach zmian: listener([{ kind, level, id, name, reason }]).
   * kind 'consolidationLost' – lekcja albo moduł przestały być utrwalone (reason: 'term' | 'lesson').
   */
  onNotice(listener) {
    this.#noticeListeners.add(listener);
    return () => this.#noticeListeners.delete(listener);
  }

  /** Rejestruje funkcję wywoływaną po każdej zmianie danych. Zwraca funkcję wyrejestrowującą. */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #changed() {
    this.revision += 1;
    this.#derived = null;
    this.#sorted.clear();
    for (const listener of this.#listeners) {
      try {
        listener(this.revision);
      } catch (error) {
        console.error(error);
      }
    }
  }

  /**
   * Wykonuje zmianę niepodzielnie. `work` jest synchroniczne: sprawdza dane i modyfikuje
   * pamięć przez UnitOfWork. Operacje są kolejkowane, więc nigdy się nie przeplatają.
   * `prepare` (opcjonalne, asynchroniczne) czyta potrzebne dane z bazy już w kolejce –
   * jego wynik dostaje `work` jako drugi argument.
   */
  #mutate(work, prepare = null) {
    const run = async () => {
      const prepared = prepare ? await prepare() : undefined;
      const unit = new UnitOfWork(this.maps);
      let result;
      let committing = false;
      try {
        result = work(unit, prepared);
        committing = true;
        await this.adapter.commit(unit.changes());
      } catch (error) {
        unit.rollback();
        this.#derived = null;
        this.#sorted.clear();
        // Podczas zapisu ekran mógł się odświeżyć i pokazać zmianę, która właśnie
        // została wycofana – powiadamiamy, żeby wrócił do stanu z bazy.
        if (committing) this.#changed();
        throw error;
      }
      if (unit.touchesJournals()) this.journalRevision += 1;
      this.#changed();
      if (unit.notices.length > 0) {
        for (const listener of this.#noticeListeners) {
          try {
            listener(unit.notices);
          } catch (error) {
            console.error(error);
          }
        }
      }
      return result;
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => {});
    return next;
  }

  // ---------------------------------------------------------------- odczyt

  getDomain(id) { return this.maps.domains.get(id) ?? null; }
  getModule(id) { return this.maps.modules.get(id) ?? null; }
  getLesson(id) { return this.maps.lessons.get(id) ?? null; }
  getTerm(id) { return this.maps.terms.get(id) ?? null; }

  #require(level, id) {
    const record = this.maps[LEVEL_STORE[level]].get(id);
    if (!record) throw errors.notFound(level);
    return record;
  }

  listDomains() {
    return [...this.maps.domains.values()].sort(bySortOrder);
  }

  listModules(domainID) {
    return [...this.maps.modules.values()].filter((module) => module.domainID === domainID).sort(bySortOrder);
  }

  listLessons(moduleID) {
    return [...this.maps.lessons.values()].filter((lesson) => lesson.moduleID === moduleID).sort(bySortOrder);
  }

  listTerms(lessonID) {
    return this.#derive().termsByLesson.get(lessonID) ?? [];
  }

  getTerms(ids) {
    return ids.map((id) => this.maps.terms.get(id)).filter(Boolean);
  }

  findDomain(name) {
    const key = normalizeKey(name);
    return this.listDomains().find((domain) => domain.nameKey === key) ?? null;
  }

  findModule(name, domainID) {
    const key = normalizeKey(name);
    return this.listModules(domainID).find((module) => module.nameKey === key) ?? null;
  }

  findLesson(name, moduleID) {
    const key = normalizeKey(name);
    return this.listLessons(moduleID).find((lesson) => lesson.nameKey === key) ?? null;
  }

  /** Pojęcie o tych samych znormalizowanych nazwach PL i EN w danej lekcji. */
  findTerm(termPL, termEN, lessonID) {
    const keyPL = normalizeKey(termPL);
    const keyEN = normalizeKey(termEN);
    return this.listTerms(lessonID).find((term) => term.keyPL === keyPL && term.keyEN === keyEN) ?? null;
  }

  /** Jednym przebiegiem buduje listy pojęć w lekcjach i liczniki wszystkich poziomów. */
  #derive() {
    if (this.#derived) return this.#derived;
    const termsByLesson = new Map();
    const lessonCounts = new Map();
    const moduleCounts = new Map();
    const domainCounts = new Map();
    const bump = (map, id, field) => {
      let entry = map.get(id);
      if (!entry) {
        entry = { modules: 0, lessons: 0, terms: 0 };
        map.set(id, entry);
      }
      entry[field] += 1;
    };
    let favorites = 0;

    for (const module of this.maps.modules.values()) bump(domainCounts, module.domainID, 'modules');
    for (const lesson of this.maps.lessons.values()) {
      bump(domainCounts, lesson.domainID, 'lessons');
      bump(moduleCounts, lesson.moduleID, 'lessons');
    }
    for (const term of this.maps.terms.values()) {
      bump(domainCounts, term.domainID, 'terms');
      bump(moduleCounts, term.moduleID, 'terms');
      bump(lessonCounts, term.lessonID, 'terms');
      if (term.isFavorite) favorites += 1;
      let list = termsByLesson.get(term.lessonID);
      if (!list) {
        list = [];
        termsByLesson.set(term.lessonID, list);
      }
      list.push(term);
    }
    for (const list of termsByLesson.values()) list.sort(bySortOrder);

    const progressByKey = new Map();
    for (const progress of this.maps.progress.values()) {
      progressByKey.set(`${progress.termID}\n${progress.direction}`, progress);
    }

    this.#derived = { termsByLesson, lessonCounts, moduleCounts, domainCounts, favorites, progressByKey };
    return this.#derived;
  }

  /** Liczba elementów podrzędnych: counts('domain' | 'module' | 'lesson', id). */
  counts(level, id) {
    const derived = this.#derive();
    const map = { domain: derived.domainCounts, module: derived.moduleCounts, lesson: derived.lessonCounts }[level];
    return { modules: 0, lessons: 0, terms: 0, ...(map.get(id) ?? {}) };
  }

  summary() {
    return {
      domains: this.maps.domains.size,
      modules: this.maps.modules.size,
      lessons: this.maps.lessons.size,
      terms: this.maps.terms.size,
      favorites: this.#derive().favorites
    };
  }

  isEmpty() {
    return this.maps.domains.size === 0 && this.maps.modules.size === 0
      && this.maps.lessons.size === 0 && this.maps.terms.size === 0;
  }

  /** Ścieżka „Dziedzina › Moduł › Lekcja”; pomija brakujące ogniwa. */
  lessonPath(lessonID) {
    const lesson = this.maps.lessons.get(lessonID);
    if (!lesson) return '';
    const parts = [];
    const module = this.maps.modules.get(lesson.moduleID);
    if (module) {
      const domain = this.maps.domains.get(module.domainID);
      if (domain) parts.push(domain.name);
      parts.push(module.name);
    }
    parts.push(lesson.name);
    return parts.join(' › ');
  }

  modulePath(moduleID) {
    const module = this.maps.modules.get(moduleID);
    if (!module) return '';
    const domain = this.maps.domains.get(module.domainID);
    return domain ? `${domain.name} › ${module.name}` : module.name;
  }

  // ---------------------------------------------------------------- glosariusz

  #sortedTerms(sort) {
    let list = this.#sorted.get(sort);
    if (list) return list;
    list = [...this.maps.terms.values()];
    const byCreated = (a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1);
    if (sort === 'english') {
      const collator = new Intl.Collator('en', { numeric: true });
      list.sort((a, b) => collator.compare(a.termEN, b.termEN) || collator.compare(a.termPL, b.termPL) || byCreated(a, b));
    } else if (sort === 'newest') {
      list.sort((a, b) => byCreated(b, a));
    } else if (sort === 'oldest') {
      list.sort(byCreated);
    } else {
      const collator = new Intl.Collator('pl', { numeric: true });
      list.sort((a, b) => collator.compare(a.termPL, b.termPL) || collator.compare(a.termEN, b.termEN) || byCreated(a, b));
    }
    this.#sorted.set(sort, list);
    return list;
  }

  /**
   * Strona glosariusza. query: { scope: {kind: 'all'|'domain'|'module'|'lesson', id},
   * searchText, favoritesOnly, tag, sort: 'polish'|'english'|'newest'|'oldest' }.
   * Wyszukiwanie ignoruje wielkość liter i znaki diakrytyczne; tag musi pasować w całości.
   */
  /**
   * query: { scope, searchText, favoritesOnly, tag, sort, status, statusDirection } – status
   * z TERM_STATUS_FILTERS (statystyki), sprawdzany w kierunku `statusDirection` (domyślnie oba).
   */
  glossary(query = {}, offset = 0, limit = 100) {
    const scope = query.scope ?? { kind: 'all' };
    const text = normalizeKey(query.searchText ?? '');
    const tagKey = normalizeKey(query.tag ?? '');
    const favoritesOnly = Boolean(query.favoritesOnly);
    const status = query.status || null;
    const statusDirection = query.statusDirection ?? BOTH;
    const now = query.now ?? Date.now();
    // Data utworzenia pojęcia (od 1.9): { preset, from, to } jak w filtrze ekranu.
    const created = query.created ? createdRange(query.created, new Date(now)) : null;
    const scopeField = { domain: 'domainID', module: 'moduleID', lesson: 'lessonID' }[scope.kind] ?? null;

    const matches = this.#sortedTerms(query.sort ?? 'polish').filter((term) => {
      if (scopeField && term[scopeField] !== scope.id) return false;
      if (favoritesOnly && !term.isFavorite) return false;
      if (text !== '' && !term.keyPL.includes(text) && !term.keyEN.includes(text)) return false;
      if (tagKey !== '' && !(term.tagKeys ?? []).includes(tagKey)) return false;
      if (status && !matchesTermStatus(this, term.id, status, statusDirection, now)) return false;
      if (created && !createdWithin(term, created)) return false;
      return true;
    });
    const start = Math.max(0, offset);
    return { items: matches.slice(start, start + Math.max(1, limit)), total: matches.length };
  }

  // ---------------------------------------------------------------- numery porządkowe

  #nextOrder(records) {
    let max = -1;
    for (const record of records) {
      if (record.sortOrder > max) max = record.sortOrder;
    }
    return max + 1;
  }

  // ---------------------------------------------------------------- dziedziny

  #insertDomain(unit, draft) {
    const name = validatedName(draft.name, 'domain');
    const domain = makeDomain({
      name,
      details: blankToNull(draft.details),
      icon: draft.icon ?? null,
      color: draft.color ?? null,
      sortOrder: this.#nextOrder(this.maps.domains.values())
    });
    unit.put('domains', domain);
    return domain;
  }

  createDomain(draft) {
    return this.#mutate((unit) => {
      this.#keepDomainColors(unit, draft);
      return this.#insertDomain(unit, draft);
    });
  }

  /**
   * Kolor wybrany w formularzu dziedziny ma przetrwać jednorazowe przestawienie na szare tło
   * (#migrateDomainColors), także gdy ustawień jeszcze nie zapisano.
   */
  #keepDomainColors(unit, draft) {
    const settings = this.maps.settings.get(SETTINGS_ID);
    if (settings?.domainColorsGray || !draft.color || draft.color === 'gray') return;
    unit.put('settings', { ...(settings ?? defaultSettings()), id: SETTINGS_ID, domainColorsGray: true, updatedAt: nowISO() });
  }

  updateDomain(id, draft) {
    return this.#mutate((unit) => {
      const name = validatedName(draft.name, 'domain');
      const domain = this.#require('domain', id);
      this.#keepDomainColors(unit, draft);
      const updated = {
        ...domain,
        name,
        nameKey: normalizeKey(name),
        details: blankToNull(draft.details),
        icon: draft.icon ?? domain.icon,
        color: draft.color ?? domain.color,
        updatedAt: nowISO()
      };
      unit.put('domains', updated);
      return updated;
    });
  }

  /** placement: { existing: id } albo { create: szkic dziedziny }. */
  #resolveDomain(unit, placement) {
    if (!placement) throw errors.parentNotSelected('domain');
    if (placement.existing) return this.#require('domain', placement.existing);
    if (placement.create) return this.#insertDomain(unit, placement.create);
    throw errors.parentNotSelected('domain');
  }

  // ---------------------------------------------------------------- moduły

  #insertModule(unit, draft, domainID) {
    const name = validatedName(draft.name, 'module');
    const module = makeModule({
      domainID,
      name,
      details: blankToNull(draft.details),
      sortOrder: this.#nextOrder(this.listModules(domainID))
    });
    unit.put('modules', module);
    return module;
  }

  /** Tworzy moduł; brakującą dziedzinę można utworzyć w tej samej operacji. */
  createModule(draft, domainPlacement) {
    return this.#mutate((unit) => {
      validatedName(draft.name, 'module');
      const domain = this.#resolveDomain(unit, domainPlacement);
      return this.#insertModule(unit, draft, domain.id);
    });
  }

  updateModule(id, draft) {
    return this.#mutate((unit) => {
      const name = validatedName(draft.name, 'module');
      const module = this.#require('module', id);
      const updated = { ...module, name, nameKey: normalizeKey(name), details: blankToNull(draft.details), updatedAt: nowISO() };
      unit.put('modules', updated);
      return updated;
    });
  }

  /** Przenosi moduł do innej dziedziny wraz z lekcjami, pojęciami i postępami. */
  moveModule(id, toDomainID) {
    return this.#mutate((unit) => {
      const module = this.#require('module', id);
      const target = this.#require('domain', toDomainID);
      if (module.domainID === target.id) return module;

      const updated = {
        ...module,
        domainID: target.id,
        sortOrder: this.#nextOrder(this.listModules(target.id)),
        updatedAt: nowISO()
      };
      unit.put('modules', updated);
      for (const lesson of [...this.maps.lessons.values()]) {
        if (lesson.moduleID === id) unit.put('lessons', { ...lesson, domainID: target.id });
      }
      for (const term of [...this.maps.terms.values()]) {
        if (term.moduleID === id) unit.put('terms', { ...term, domainID: target.id });
      }
      for (const record of [...this.maps.progress.values()]) {
        if (record.moduleID === id) unit.put('progress', { ...record, domainID: target.id });
      }
      return updated;
    });
  }

  /** placement: { existing: id } albo { create: szkic modułu, domain: umiejscowienie dziedziny }. */
  #resolveModule(unit, placement) {
    if (!placement) throw errors.parentNotSelected('module');
    if (placement.existing) return this.#require('module', placement.existing);
    if (placement.create) {
      validatedName(placement.create.name, 'module');
      const domain = this.#resolveDomain(unit, placement.domain);
      return this.#insertModule(unit, placement.create, domain.id);
    }
    throw errors.parentNotSelected('module');
  }

  // ---------------------------------------------------------------- lekcje

  #insertLesson(unit, draft, module) {
    const name = validatedName(draft.name, 'lesson');
    // Nowa lekcja w module utrwalonym: moduł przestaje być utrwalony (nowa lekcja nie jest).
    if (this.isModuleConsolidated(module.id)) {
      unit.notices.push({ kind: 'consolidationLost', level: 'module', id: module.id, name: module.name, reason: 'lesson' });
    }
    const lesson = makeLesson({
      moduleID: module.id,
      domainID: module.domainID,
      name,
      details: blankToNull(draft.details),
      sortOrder: this.#nextOrder(this.listLessons(module.id))
    });
    unit.put('lessons', lesson);
    return lesson;
  }

  /** Tworzy lekcję; brakujący moduł i dziedzina powstają w tej samej operacji. */
  createLesson(draft, modulePlacement) {
    return this.#mutate((unit) => {
      // Nazwę lekcji sprawdzamy przed utworzeniem elementów nadrzędnych.
      validatedName(draft.name, 'lesson');
      const module = this.#resolveModule(unit, modulePlacement);
      return this.#insertLesson(unit, draft, module);
    });
  }

  updateLesson(id, draft) {
    return this.#mutate((unit) => {
      const name = validatedName(draft.name, 'lesson');
      const lesson = this.#require('lesson', id);
      const updated = { ...lesson, name, nameKey: normalizeKey(name), details: blankToNull(draft.details), updatedAt: nowISO() };
      unit.put('lessons', updated);
      return updated;
    });
  }

  /** Przenosi lekcję do innego modułu wraz z pojęciami i postępami. */
  moveLesson(id, toModuleID) {
    return this.#mutate((unit) => {
      const lesson = this.#require('lesson', id);
      const target = this.#require('module', toModuleID);
      if (lesson.moduleID === target.id) return lesson;
      if (!lesson.consolidatedAt && this.isModuleConsolidated(target.id)) {
        unit.notices.push({ kind: 'consolidationLost', level: 'module', id: target.id, name: target.name, reason: 'lesson' });
      }

      const updated = {
        ...lesson,
        moduleID: target.id,
        domainID: target.domainID,
        sortOrder: this.#nextOrder(this.listLessons(target.id)),
        updatedAt: nowISO()
      };
      unit.put('lessons', updated);
      for (const term of [...this.maps.terms.values()]) {
        if (term.lessonID === id) unit.put('terms', { ...term, moduleID: target.id, domainID: target.domainID });
      }
      for (const record of [...this.maps.progress.values()]) {
        if (record.lessonID === id) unit.put('progress', { ...record, moduleID: target.id, domainID: target.domainID });
      }
      return updated;
    });
  }

  /** Nazwa niekolidująca z lekcjami w module: „Nazwa”, „Nazwa (kopia)”, „Nazwa (kopia 2)”… */
  #uniqueLessonName(base, moduleID) {
    if (!this.findLesson(base, moduleID)) return base;
    for (let attempt = 1; ; attempt += 1) {
      const candidate = attempt === 1 ? `${base} (kopia)` : `${base} (kopia ${attempt})`;
      if (!this.findLesson(candidate, moduleID)) return candidate;
    }
  }

  #copyOfTerm(term, lesson, sortOrder) {
    const now = nowISO();
    return {
      ...term,
      id: newID(),
      lessonID: lesson.id,
      moduleID: lesson.moduleID,
      domainID: lesson.domainID,
      tags: [...(term.tags ?? [])],
      tagKeys: [...(term.tagKeys ?? [])],
      sortOrder,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Kopiuje lekcję z pojęciami i notatką (z własnymi kopiami obrazów i załączników; tych, których
   * plików nie ma na urządzeniu, kopia nie dostaje). Kopie nie dziedziczą postępów nauki.
   */
  copyLesson(id, toModuleID) {
    return this.#mutate((unit, { images, files }) => {
      const source = this.#require('lesson', id);
      const target = this.#require('module', toModuleID);
      const terms = this.listTerms(source.id);
      const copy = this.#insertLesson(
        unit,
        { name: this.#uniqueLessonName(source.name, target.id), details: source.details },
        target
      );
      terms.forEach((term, index) => unit.put('terms', this.#copyOfTerm(term, copy, index)));
      const note = this.getNote(source.id);
      if (note) {
        this.#writeNote(unit, copy.id, {
          html: note.html, htmlEN: note.htmlEN ?? '', images, imagesFirst: note.imagesFirst === true, files,
          numberFigures: note.numberFigures === true, tables: note.tables ?? []
        }, null);
      }
      return copy;
    }, async () => ({ images: await this.noteImages(id), files: await this.noteFiles(id) }));
  }

  // ---------------------------------------------------------------- notatki lekcji

  /** Notatka lekcji (tekst i opis obrazów, bez bajtów) albo null. */
  getNote(lessonID) {
    return this.maps.notes.get(lessonID) ?? null;
  }

  /** Liczba lekcji z notatką. */
  noteCount() {
    return this.maps.notes.size;
  }

  /**
   * Obrazy notatki z bajtami ({ ...opis, bytes: ArrayBuffer }) w kolejności z notatki; rysunek ma
   * też `drawing` – kreski do edycji (od 1.12). Obrazów, których plików nie ma na urządzeniu
   * (przywrócone same dane), nie ma na liście – chyba że `withMissing`: wtedy są z `bytes: null`
   * i `missing: true`.
   */
  async noteImages(lessonID, { withMissing = false } = {}) {
    return this.#withBytes('noteImages', this.getNote(lessonID)?.images ?? [], withMissing);
  }

  /** Załączniki notatki z bajtami, jak noteImages(). */
  async noteFiles(lessonID, { withMissing = false } = {}) {
    return this.#withBytes('noteFiles', this.getNote(lessonID)?.files ?? [], withMissing);
  }

  /**
   * Opisy załączników notatki (bez bajtów); te, których plików nie ma na urządzeniu, mają
   * `missing: true`.
   */
  async noteFileList(lessonID) {
    const files = this.getNote(lessonID)?.files ?? [];
    if (files.length === 0) return [];
    const present = new Set(await this.adapter.readKeys('noteFiles'));
    return files.map((meta) => (present.has(meta.id) ? { ...meta } : { ...meta, missing: true }));
  }

  /** Jeden załącznik notatki z bajtami; null, gdy go nie ma (albo jego pliku nie ma na urządzeniu). */
  async noteFile(lessonID, fileID) {
    const meta = (this.getNote(lessonID)?.files ?? []).find((item) => item.id === fileID);
    if (!meta) return null;
    const [record] = await this.adapter.getMany('noteFiles', [meta.id]);
    return record ? { ...meta, bytes: record.bytes } : null;
  }

  async #withBytes(store, metas, withMissing) {
    if (metas.length === 0) return [];
    const records = await this.adapter.getMany(store, metas.map((meta) => meta.id));
    return metas
      .map((meta, index) => {
        const record = records[index];
        if (record) {
          // Znacznik rysunku w opisie zastępują same kreski (rysunek bez kresek – zwykły obraz).
          const plain = { ...meta };
          delete plain.drawing;
          return { ...plain, bytes: record.bytes, ...(record.drawing ? { drawing: record.drawing } : {}) };
        }
        return withMissing ? { ...meta, bytes: null, missing: true } : null;
      })
      .filter(Boolean);
  }

  /** Bajty pliku obrazu albo załącznika (store: 'noteImages' | 'noteFiles') albo null, gdy go nie ma. */
  async mediaBytes(store, id) {
    return (await this.mediaRecord(store, id))?.bytes ?? null;
  }

  /** Plik obrazu albo załącznika: { bytes, drawing? } (rysunek – z kreskami) albo null, gdy go nie ma. */
  async mediaRecord(store, id) {
    const [record] = await this.adapter.getMany(store, [id]);
    if (!record) return null;
    return { bytes: record.bytes, ...(record.drawing ? { drawing: record.drawing } : {}) };
  }

  /** Obrazy i załączniki wszystkich notatek: liczba i łączny rozmiar (z opisów, bez czytania plików). */
  mediaSummary() {
    const summary = { images: 0, files: 0, size: 0 };
    for (const note of this.maps.notes.values()) {
      for (const { store, meta } of mediaOf(note)) {
        summary[store === 'noteImages' ? 'images' : 'files'] += 1;
        summary.size += meta.size ?? 0;
      }
    }
    return summary;
  }

  /**
   * Obrazy i załączniki notatek, których plików nie ma na urządzeniu (np. po przywróceniu samych
   * danych): { images, files, size }.
   */
  async missingMedia() {
    const present = await this.#presentMedia();
    const missing = { images: 0, files: 0, size: 0 };
    for (const note of this.maps.notes.values()) {
      for (const { store, meta } of mediaOf(note)) {
        if (present[store].has(meta.id)) continue;
        missing[store === 'noteImages' ? 'images' : 'files'] += 1;
        missing.size += meta.size ?? 0;
      }
    }
    return missing;
  }

  async #presentMedia() {
    const present = {};
    for (const store of MEDIA_STORES) present[store] = new Set(await this.adapter.readKeys(store));
    return present;
  }

  /**
   * Opisy obrazów i załączników wszystkich notatek: Map id → { store, lessonID, meta, present }.
   * `present` – czy plik jest już na urządzeniu.
   */
  async mediaIndex() {
    const present = await this.#presentMedia();
    const index = new Map();
    for (const note of this.maps.notes.values()) {
      for (const { store, meta } of mediaOf(note)) {
        index.set(meta.id, { store, lessonID: note.lessonID, meta, present: present[store].has(meta.id) });
      }
    }
    return index;
  }

  /**
   * Dopisuje do bazy pliki obrazów i załączników notatek (przywracanie pliku obrazów
   * i załączników). items: [{ id, bytes, drawing? }] – drawing: kreski rysunku. Zapisywane są
   * tylko te, które opisuje któraś notatka i których jeszcze nie ma; zwraca ich liczbę { images, files }.
   */
  addMedia(items) {
    return this.#mutate((unit, present) => {
      const wanted = new Map();
      for (const note of this.maps.notes.values()) {
        for (const entry of mediaOf(note)) wanted.set(entry.meta.id, { ...entry, lessonID: note.lessonID });
      }
      const added = { images: 0, files: 0 };
      for (const item of items) {
        const target = wanted.get(item.id);
        if (!target || present[target.store].has(item.id)) continue;
        present[target.store].add(item.id);
        const bytes = imageBytes(item);
        const { meta, lessonID } = target;
        const make = target.store === 'noteImages' ? makeNoteImage : makeNoteFile;
        // Rekord ma identyfikator z opisu w notatce (fabryka nadaje nowy).
        const source = { ...meta, bytes, drawing: item.drawing ?? null };
        unit.append(target.store, { ...make(lessonID, source, meta.crc ?? crc32(bytes)), id: meta.id });
        added[target.store === 'noteImages' ? 'images' : 'files'] += 1;
      }
      return added;
    }, () => this.#presentMedia());
  }

  /**
   * Zapisuje notatkę lekcji. draft: { html, htmlEN?, images, imagesFirst?, files? } – images
   * w kolejności wyświetlania: { id, label? } zostawia istniejący obraz, { bytes, type, width,
   * height, name, label?, drawing? } dodaje nowy (drawing – kreski rysunku, od 1.12), pominięte
   * istniejące obrazy są usuwane; label – sygnatura
   * (brakująca dostaje „Obraz N”), caption – podpis pod obrazem (od 1.18; pominięty przy
   * istniejącym obrazie – zostaje dotychczasowy), hidden – obraz ukryty w notatce (od 1.29, tak samo). files – załączniki tak samo: { id, name? } zostawia (name –
   * nowa nazwa), { bytes, name, type } dodaje. htmlEN – treść po angielsku, imagesFirst – obrazy
   * w podglądzie przed tekstem, numberFigures – numeracja podpisów „Rys. N.” (od 1.18; od 1.21 też
   * „Tab. N.”), tables – tabele notatki (od 1.21, core/tables.js); bez pól htmlEN, imagesFirst,
   * numberFigures, files i tables zostaje to, co jest w notatce. Notatka bez tekstu, obrazów, tabel
   * i załączników jest usuwana.
   * Zwraca zapisaną notatkę albo null.
   */
  saveNote(lessonID, draft) {
    return this.#mutate((unit) => {
      this.#require('lesson', lessonID);
      return this.#writeNote(unit, lessonID, draft, this.getNote(lessonID));
    });
  }

  deleteNote(lessonID) {
    return this.#mutate((unit) => this.#removeNote(unit, lessonID));
  }

  #writeNote(unit, lessonID, { html, htmlEN, images = [], imagesFirst, numberFigures, files, tables }, existing) {
    const clean = normalizeNoteHtml(html ?? '');
    const cleanEN = typeof htmlEN === 'string' ? normalizeNoteHtml(htmlEN) : (existing?.htmlEN ?? '');
    if (clean.length > NOTE_HTML_LIMIT || cleanEN.length > NOTE_HTML_LIMIT) throw errors.noteTooLong();
    if (images.length > NOTE_IMAGE_LIMIT) throw errors.tooManyImages();
    const metas = [];
    const kept = new Set();
    for (const image of images) {
      if (imageBytes(image)) {
        const record = newNoteImage(lessonID, image);
        unit.append('noteImages', record);
        metas.push(noteImageMeta(record, image.label, cleanImageCaption(image.caption) || null, image.hidden === true));
      } else {
        const meta = existing?.images.find((item) => item.id === image.id);
        if (meta && !kept.has(meta.id)) {
          kept.add(meta.id);
          const { caption: previous, hidden: wasHidden, ...rest } = meta;
          const caption = image.caption === undefined ? cleanImageCaption(previous) : cleanImageCaption(image.caption);
          // Od 1.29 obraz ukryty w notatce (oczko); bez pola – zostaje jak był.
          const hidden = image.hidden === undefined ? wasHidden === true : image.hidden === true;
          metas.push({ ...rest, label: image.label ?? meta.label ?? null, ...(caption ? { caption } : {}), ...(hidden ? { hidden: true } : {}) });
        }
      }
    }
    for (const meta of existing?.images ?? []) {
      if (!kept.has(meta.id)) unit.erase('noteImages', meta.id);
    }
    const fileMetas = this.#writeFiles(unit, lessonID, files, existing);
    // Tabele (od 1.21): sygnatury unikalne także wśród sygnatur obrazów.
    if (Array.isArray(tables) && tables.length > NOTE_TABLE_LIMIT) throw errors.tooManyTables();
    const imageMetas = withImageLabels(metas);
    const labels = imageMetas.map((meta) => meta.label);
    const tableList = Array.isArray(tables) ? cleanNoteTables(tables, labels) : withTableLabels(existing?.tables ?? [], labels);
    if (clean === '' && cleanEN === '' && metas.length === 0 && fileMetas.length === 0 && tableList.length === 0) {
      if (existing) unit.delete('notes', lessonID);
      return null;
    }
    const now = nowISO();
    // Obrazy w podglądzie przed tekstem (od 1.5); zapis bez tego pola (np. import) zostawia wybór notatki.
    const first = typeof imagesFirst === 'boolean' ? imagesFirst : existing?.imagesFirst === true;
    // Numeracja podpisów obrazów (od 1.18) – tak samo: bez pola zostaje wybór notatki.
    const numbered = typeof numberFigures === 'boolean' ? numberFigures : existing?.numberFigures === true;
    const note = {
      id: lessonID, lessonID, html: clean, htmlEN: cleanEN, images: imageMetas, imagesFirst: first,
      numberFigures: numbered, files: fileMetas, tables: tableList, createdAt: existing?.createdAt ?? now, updatedAt: now
    };
    unit.put('notes', note);
    return note;
  }

  /** Załączniki zapisywanej notatki; bez listy (np. import z arkusza) zostają dotychczasowe. */
  #writeFiles(unit, lessonID, files, existing) {
    const current = existing?.files ?? [];
    if (!Array.isArray(files)) return current;
    if (files.length > NOTE_FILE_LIMIT) throw errors.tooManyFiles();
    const metas = [];
    const kept = new Set();
    for (const file of files) {
      if (imageBytes(file)) {
        const record = newNoteFile(lessonID, file);
        unit.append('noteFiles', record);
        metas.push(noteFileMeta(record));
      } else {
        const meta = current.find((item) => item.id === file.id);
        if (meta && !kept.has(meta.id)) {
          kept.add(meta.id);
          metas.push({ ...meta, name: file.name === undefined ? meta.name : cleanFileName(file.name) });
        }
      }
    }
    for (const meta of current) {
      if (!kept.has(meta.id)) unit.erase('noteFiles', meta.id);
    }
    return metas;
  }

  #removeNote(unit, lessonID) {
    const note = this.maps.notes.get(lessonID);
    if (!note) return;
    for (const { store, meta } of mediaOf(note)) unit.erase(store, meta.id);
    unit.delete('notes', lessonID);
  }

  // ---------------------------------------------------------------- utrwalenie (ręczne)

  /** Czy lekcja jest oznaczona jako utrwalona. */
  isLessonConsolidated(lessonID) {
    return Boolean(this.maps.lessons.get(lessonID)?.consolidatedAt);
  }

  /** Moduł jest utrwalony, gdy ma lekcje i wszystkie są utrwalone. */
  isModuleConsolidated(moduleID) {
    const lessons = this.listLessons(moduleID);
    return lessons.length > 0 && lessons.every((lesson) => lesson.consolidatedAt);
  }

  /** Oznacza lekcję jako utrwaloną (albo zdejmuje oznaczenie). Data pierwszego oznaczenia zostaje. */
  setLessonConsolidated(lessonID, consolidated) {
    return this.#mutate((unit) => {
      const lesson = this.#require('lesson', lessonID);
      const consolidatedAt = consolidated ? (lesson.consolidatedAt ?? nowISO()) : null;
      if (consolidatedAt !== (lesson.consolidatedAt ?? null)) unit.put('lessons', { ...lesson, consolidatedAt, updatedAt: nowISO() });
      return consolidatedAt;
    });
  }

  /** Oznacza wszystkie lekcje modułu jako utrwalone (albo zdejmuje oznaczenie ze wszystkich). Zwraca liczbę lekcji. */
  setModuleConsolidated(moduleID, consolidated) {
    return this.#mutate((unit) => {
      this.#require('module', moduleID);
      const lessons = this.listLessons(moduleID);
      if (consolidated && lessons.length === 0) throw new LibraryError('emptyModule', 'Moduł nie ma lekcji – nie ma czego utrwalić.');
      const now = nowISO();
      for (const lesson of lessons) {
        const consolidatedAt = consolidated ? (lesson.consolidatedAt ?? now) : null;
        if (consolidatedAt !== (lesson.consolidatedAt ?? null)) unit.put('lessons', { ...lesson, consolidatedAt, updatedAt: now });
      }
      return lessons.length;
    });
  }

  /** Nowe pojęcie w lekcji utrwalonej: oznaczenie znika (pojęcie jest nowe, lekcja do powtórzenia). */
  #unconsolidate(unit, lessonID, reason = 'term') {
    const lesson = this.maps.lessons.get(lessonID);
    if (!lesson?.consolidatedAt) return false;
    unit.put('lessons', { ...lesson, consolidatedAt: null, updatedAt: nowISO() });
    unit.notices.push({ kind: 'consolidationLost', level: 'lesson', id: lesson.id, name: lesson.name, reason });
    return true;
  }

  // ---------------------------------------------------------------- pojęcia

  createTerm(draft, lessonID) {
    return this.#mutate((unit) => {
      validateTermDraft(draft);
      if (!lessonID) throw errors.parentNotSelected('lesson');
      const lesson = this.#require('lesson', lessonID);
      const term = makeTerm({ lesson, draft, sortOrder: this.#nextOrder(this.listTerms(lesson.id)) });
      unit.put('terms', term);
      this.#unconsolidate(unit, lesson.id);
      return term;
    });
  }

  /** Aktualizuje treść pojęcia. Identyfikator się nie zmienia, więc historia nauki zostaje. */
  updateTerm(id, draft) {
    return this.#mutate((unit) => {
      validateTermDraft(draft);
      const term = this.#require('term', id);
      const updated = { ...term, ...termFieldsFromDraft(draft), updatedAt: nowISO() };
      unit.put('terms', updated);
      return updated;
    });
  }

  setFavorite(isFavorite, termIDs) {
    return this.#mutate((unit) => {
      for (const term of this.getTerms(termIDs)) {
        if (term.isFavorite !== isFavorite) {
          unit.put('terms', { ...term, isFavorite, updatedAt: nowISO() });
        }
      }
    });
  }

  /** Przenosi pojęcia do innej lekcji razem z ich postępami nauki. */
  moveTerms(termIDs, toLessonID) {
    return this.#mutate((unit) => {
      if (termIDs.length === 0) throw errors.nothingSelected();
      const target = this.#require('lesson', toLessonID);
      const moving = this.getTerms(termIDs).filter((term) => term.lessonID !== target.id);
      const moved = new Set(moving.map((term) => term.id));
      let order = this.#nextOrder(this.listTerms(target.id));
      for (const term of moving) {
        unit.put('terms', {
          ...term,
          lessonID: target.id,
          moduleID: target.moduleID,
          domainID: target.domainID,
          sortOrder: order,
          updatedAt: nowISO()
        });
        order += 1;
      }
      for (const record of [...this.maps.progress.values()]) {
        if (moved.has(record.termID)) {
          unit.put('progress', { ...record, lessonID: target.id, moduleID: target.moduleID, domainID: target.domainID });
        }
      }
      if (moving.length > 0) this.#unconsolidate(unit, target.id);
    });
  }

  /** Kopiuje pojęcia do lekcji (w kolejności `termIDs`). Kopie nie dziedziczą postępów. */
  copyTerms(termIDs, toLessonID) {
    return this.#mutate((unit) => {
      if (termIDs.length === 0) throw errors.nothingSelected();
      const target = this.#require('lesson', toLessonID);
      let order = this.#nextOrder(this.listTerms(target.id));
      const copies = [];
      for (const term of this.getTerms(termIDs)) {
        const copy = this.#copyOfTerm(term, target, order);
        unit.put('terms', copy);
        copies.push(copy);
        order += 1;
      }
      if (copies.length > 0) this.#unconsolidate(unit, target.id);
      return copies;
    });
  }

  // ---------------------------------------------------------------- kolejność

  /** Zapisuje kolejność zgodną z pozycjami identyfikatorów w tablicy. */
  reorder(level, orderedIDs) {
    const store = LEVEL_STORE[level];
    return this.#mutate((unit) => {
      orderedIDs.forEach((id, index) => {
        const record = this.maps[store].get(id);
        if (record && record.sortOrder !== index) unit.put(store, { ...record, sortOrder: index });
      });
    });
  }

  // ---------------------------------------------------------------- usuwanie

  #termsOf(target) {
    const all = [...this.maps.terms.values()];
    switch (target.kind) {
      case 'domain': return all.filter((term) => term.domainID === target.id);
      case 'module': return all.filter((term) => term.moduleID === target.id);
      case 'lesson': return all.filter((term) => term.lessonID === target.id);
      case 'terms': return this.getTerms(target.ids);
      default: throw new Error(`Nieznany cel usunięcia: ${target.kind}`);
    }
  }

  /**
   * Liczy elementy, które zostaną usunięte razem z celem.
   * target: { kind: 'domain'|'module'|'lesson', id } albo { kind: 'terms', ids }.
   */
  deletionImpact(target) {
    const impact = { name: null, modules: 0, lessons: 0, terms: 0, progressRecords: 0, notes: 0 };
    const terms = this.#termsOf(target);
    if (target.kind === 'terms') {
      impact.terms = terms.length;
      if (terms.length === 1) impact.name = terms[0].termPL;
    } else {
      const record = this.#require(target.kind, target.id);
      const counts = this.counts(target.kind, target.id);
      impact.name = record.name;
      impact.modules = target.kind === 'domain' ? counts.modules : 0;
      impact.lessons = target.kind === 'lesson' ? 0 : counts.lessons;
      impact.terms = counts.terms;
    }
    const ids = new Set(terms.map((term) => term.id));
    for (const record of this.maps.progress.values()) {
      if (ids.has(record.termID)) impact.progressRecords += 1;
    }
    if (target.kind !== 'terms') impact.notes = this.#lessonsOf(target).filter((lesson) => this.maps.notes.has(lesson.id)).length;
    return impact;
  }

  /** Lekcje usuwane razem z dziedziną, modułem albo lekcją. */
  #lessonsOf(target) {
    const all = [...this.maps.lessons.values()];
    switch (target.kind) {
      case 'domain': return all.filter((lesson) => lesson.domainID === target.id);
      case 'module': return all.filter((lesson) => lesson.moduleID === target.id);
      case 'lesson': return all.filter((lesson) => lesson.id === target.id);
      default: return [];
    }
  }

  /** Usuwa cel wraz z elementami podrzędnymi i danymi nauki usuwanych pojęć. */
  delete(target) {
    return this.#mutate((unit) => this.#deleteTarget(unit, target));
  }

  /**
   * Usuwa jak delete(), ale najpierw zapamiętuje wszystko, co znika: elementy, pojęcia, postępy,
   * dzienniki nauki tych pojęć, notatki z obrazami i załącznikami (od 1.9). Zwraca kopię do
   * restoreDeleted() – „Cofnij” przez chwilę po usunięciu.
   */
  deleteWithUndo(target) {
    return this.#mutate((unit, saved) => {
      this.#deleteTarget(unit, target);
      return saved;
    }, () => this.#deletionCopy(target));
  }

  #deleteTarget(unit, target) {
    if (target.kind === 'terms' && target.ids.length === 0) throw errors.nothingSelected();
    if (target.kind !== 'terms') this.#require(target.kind, target.id);

    const terms = this.#termsOf(target);
    const termIDs = new Set(terms.map((term) => term.id));
    for (const term of terms) unit.delete('terms', term.id);
    for (const record of [...this.maps.progress.values()]) {
      if (termIDs.has(record.termID)) unit.delete('progress', record.id);
    }
    unit.purgeTerms([...termIDs]);
    for (const lesson of this.#lessonsOf(target)) this.#removeNote(unit, lesson.id);

    if (target.kind === 'domain') {
      for (const lesson of [...this.maps.lessons.values()]) {
        if (lesson.domainID === target.id) unit.delete('lessons', lesson.id);
      }
      for (const module of [...this.maps.modules.values()]) {
        if (module.domainID === target.id) unit.delete('modules', module.id);
      }
      unit.delete('domains', target.id);
    } else if (target.kind === 'module') {
      for (const lesson of [...this.maps.lessons.values()]) {
        if (lesson.moduleID === target.id) unit.delete('lessons', lesson.id);
      }
      unit.delete('modules', target.id);
    } else if (target.kind === 'lesson') {
      unit.delete('lessons', target.id);
    }
  }

  /** Kopia wszystkiego, co usunie #deleteTarget() – rekordy z pamięci, dzienniki i pliki z bazy. */
  async #deletionCopy(target) {
    if (target.kind !== 'terms' && !this.maps[LEVEL_STORE[target.kind]]?.has(target.id)) return null;
    const terms = this.#termsOf(target);
    const termIDs = new Set(terms.map((term) => term.id));
    const lessons = this.#lessonsOf(target);
    const records = {
      domains: target.kind === 'domain' ? [this.maps.domains.get(target.id)] : [],
      modules: [...this.maps.modules.values()].filter((module) => (target.kind === 'domain' && module.domainID === target.id)
        || (target.kind === 'module' && module.id === target.id)),
      lessons,
      terms,
      progress: [...this.maps.progress.values()].filter((record) => termIDs.has(record.termID)),
      notes: lessons.map((lesson) => this.maps.notes.get(lesson.id)).filter(Boolean)
    };
    const journals = {};
    for (const name of TERM_HISTORY_STORES) {
      journals[name] = (await Promise.all([...termIDs].map((id) => this.adapter.readByTerm(name, id)))).flat();
    }
    const media = { noteImages: [], noteFiles: [] };
    for (const note of records.notes) {
      for (const { store, meta } of mediaOf(note)) {
        const [record] = await this.adapter.getMany(store, [meta.id]);
        if (record) media[store].push(record);
      }
    }
    return { target: { ...target }, records: structuredClone(records), journals, media };
  }

  /**
   * Przywraca to, co usunęło deleteWithUndo() (kopia z jego wyniku). Element wraca na swoje
   * miejsce, z pojęciami, postępami, historią nauki i notatkami. Nie da się, gdy w międzyczasie
   * zniknął element nadrzędny (np. moduł usuwanej lekcji) albo kopia została już przywrócona.
   */
  restoreDeleted(copy) {
    return this.#mutate((unit) => {
      if (!copy?.records) throw errors.cannotRestore('Nie ma czego przywrócić.');
      const { records, journals, media } = copy;
      const present = [...records.domains.map((item) => ['domains', item]), ...records.modules.map((item) => ['modules', item]),
        ...records.lessons.map((item) => ['lessons', item]), ...records.terms.map((item) => ['terms', item])];
      if (present.some(([store, item]) => this.maps[store].has(item.id))) throw errors.cannotRestore('To zostało już przywrócone.');
      const domainIDs = new Set([...this.maps.domains.keys(), ...records.domains.map((item) => item.id)]);
      const moduleIDs = new Set([...this.maps.modules.keys(), ...records.modules.map((item) => item.id)]);
      const lessonIDs = new Set([...this.maps.lessons.keys(), ...records.lessons.map((item) => item.id)]);
      const orphaned = records.modules.some((item) => !domainIDs.has(item.domainID))
        || records.lessons.some((item) => !moduleIDs.has(item.moduleID))
        || records.terms.some((item) => !lessonIDs.has(item.lessonID));
      if (orphaned) throw errors.cannotRestore('Nie można cofnąć – element, w którym to było, został w międzyczasie usunięty.');
      for (const store of ['domains', 'modules', 'lessons', 'terms', 'progress', 'notes']) {
        for (const record of records[store]) unit.put(store, record);
      }
      for (const [store, list] of [...Object.entries(journals), ...Object.entries(media)]) {
        for (const record of list) unit.append(store, record);
      }
      return { kind: copy.target.kind, terms: records.terms.length };
    });
  }

  /** Usuwa wszystkie materiały, postępy i historię nauki. Ustawienia zostają. */
  async deleteAllContent() {
    const stores = ['domains', 'modules', 'lessons', 'terms', 'progress', 'notes'];
    const run = async () => {
      // Sesje i wybór materiału wskazują na usuwane elementy, więc znikają razem z nimi.
      const settings = {
        ...this.getSettings(),
        id: SETTINGS_ID,
        activeStudySession: null,
        lastStudySession: null,
        studySelection: null,
        activeQuiz: null,
        quizSelection: null,
        updatedAt: nowISO()
      };
      await this.adapter.commit({
        ...emptyChanges(),
        puts: { settings: [settings] },
        clear: [...stores, 'assessments', 'reviews', 'quizAnswers', 'studySessions', 'quizSessions', ...MEDIA_STORES]
      });
      for (const name of stores) this.maps[name] = new Map();
      this.maps.settings.set(SETTINGS_ID, settings);
      this.#quizStats = new Map();
      this.journalRevision += 1;
      this.#changed();
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => {});
    return next;
  }

  // ---------------------------------------------------------------- import wsadowy

  /**
   * Wspólny przebieg importu i jego planu. Gdy `unit` jest podane, zmiany trafiają do
   * biblioteki; gdy jest `null`, powstaje sam raport – co zostałoby utworzone i zmienione.
   * Jeden kod dla obu trybów gwarantuje, że podgląd w kreatorze zgadza się z wynikiem.
   */
  #runImport(rows, duplicates, unit, notes = [], noteMode = 'replace') {
    const report = {
      domains: 0, modules: 0, lessons: 0,
      added: 0, updated: 0, unchanged: 0, skipped: 0,
      duplicatesInLibrary: 0, duplicatesInFile: 0,
      created: { domains: [], modules: [], lessons: [] },
      statuses: new Array(rows.length),
      lessonIDs: [],
      /** Lekcje i moduły, które przestaną być utrwalone (ścieżki) – nowe pojęcia albo nowe lekcje. */
      unconsolidated: [],
      notes: {
        added: 0, replaced: 0, appended: 0, unchanged: 0, skipped: 0, failed: 0, existing: 0, images: 0,
        statuses: new Array(notes.length), lessons: new Array(notes.length)
      }
    };
    const touchedLessons = new Set();
    const lostConsolidation = new Set();
    let placeholder = 0;
    const planned = (fields) => ({ id: `plan:${placeholder += 1}`, ...fields });

    const domainByKey = new Map(this.listDomains().map((domain) => [domain.nameKey, domain]));
    const domainByID = new Map(this.listDomains().map((domain) => [domain.id, domain]));
    const moduleByKey = new Map();
    const moduleByID = new Map();
    for (const module of [...this.maps.modules.values()].sort(bySortOrder)) {
      const key = `${module.domainID}\n${module.nameKey}`;
      if (!moduleByKey.has(key)) moduleByKey.set(key, module);
      moduleByID.set(module.id, module);
    }
    const lessonByKey = new Map();
    for (const lesson of [...this.maps.lessons.values()].sort(bySortOrder)) {
      const key = `${lesson.moduleID}\n${lesson.nameKey}`;
      if (!lessonByKey.has(key)) lessonByKey.set(key, lesson);
    }
    /** Klucz pojęcia → { term, fromFile }; fromFile oznacza pojęcie z wcześniejszego wiersza. */
    const termByKey = new Map();
    const nextTermOrder = new Map();
    for (const term of this.maps.terms.values()) {
      const key = `${term.lessonID}\n${term.keyPL}\n${term.keyEN}`;
      if (!termByKey.has(key)) termByKey.set(key, { term, fromFile: false });
      nextTermOrder.set(term.lessonID, Math.max(nextTermOrder.get(term.lessonID) ?? 0, term.sortOrder + 1));
    }

    /** Lekcja wiersza: wskazana identyfikatorem albo nazwami (brakujące poziomy powstają). */
    const placeLesson = (row) => {
      if (row.lessonID) return this.#require('lesson', row.lessonID);
      // Wskazany istniejący moduł lub dziedzina (po identyfikatorze) mają pierwszeństwo przed nazwą.
      let module = row.moduleID ? this.#require('module', row.moduleID) : null;
      let domain = module ? this.#require('domain', module.domainID) : null;
      if (!domain && row.domainID) domain = this.#require('domain', row.domainID);
      if (!domain) {
        const domainDraft = typeof row.domain === 'string' ? { name: row.domain } : (row.domain ?? {});
        const domainKey = normalizeKey(domainDraft.name);
        domain = domainByKey.get(domainKey);
        if (!domain) {
          domain = unit
            ? this.#insertDomain(unit, domainDraft)
            : planned({ name: validatedName(domainDraft.name, 'domain') });
          domainByKey.set(domainKey, domain);
          domainByID.set(domain.id, domain);
          report.domains += 1;
          report.created.domains.push(domain.name);
        }
      }
      const moduleKey = `${domain.id}\n${normalizeKey(row.module)}`;
      if (!module) module = moduleByKey.get(moduleKey);
      if (!module) {
        module = unit
          ? this.#insertModule(unit, { name: row.module }, domain.id)
          : planned({ name: validatedName(row.module, 'module'), domainID: domain.id });
        moduleByKey.set(moduleKey, module);
        moduleByID.set(module.id, module);
        report.modules += 1;
        report.created.modules.push(`${domain.name} › ${module.name}`);
      }
      const lessonKey = `${module.id}\n${normalizeKey(row.lesson)}`;
      let lesson = lessonByKey.get(lessonKey);
      if (!lesson) {
        if (!lostConsolidation.has(module.id) && this.isModuleConsolidated(module.id)) {
          lostConsolidation.add(module.id);
          report.unconsolidated.push(`${domain.name} › ${module.name}`);
        }
        lesson = unit
          ? this.#insertLesson(unit, { name: row.lesson }, module)
          : planned({ name: validatedName(row.lesson, 'lesson'), moduleID: module.id, domainID: domain.id });
        lessonByKey.set(lessonKey, lesson);
        report.lessons += 1;
        report.created.lessons.push(`${domain.name} › ${module.name} › ${lesson.name}`);
      }
      return lesson;
    };

    rows.forEach((row, index) => {
      try {
        validateTermDraft(row.term);
      } catch (error) {
        throw new LibraryError(error.code, `Wiersz ${row.number ?? index + 1}: ${error.message}`);
      }

      const lesson = placeLesson(row);
      touchedLessons.add(lesson.id);

      const fields = termFieldsFromDraft(row.term);
      const termKey = `${lesson.id}\n${fields.keyPL}\n${fields.keyEN}`;
      const match = termByKey.get(termKey);

      if (match) {
        if (match.fromFile) report.duplicatesInFile += 1;
        else report.duplicatesInLibrary += 1;

        if (duplicates !== 'add') {
          // Powtórzenie w samym pliku nie niesie nowej treści – zostaje pierwsze wystąpienie.
          if (match.fromFile || duplicates === 'skip') {
            report.skipped += 1;
            report.statuses[index] = match.fromFile ? 'skippedInFile' : 'skipped';
            return;
          }
          const merged = mergeTermUpdate(match.term, row.term);
          match.fromFile = true;
          if (!merged) {
            report.unchanged += 1;
            report.statuses[index] = 'unchanged';
            return;
          }
          const updated = { ...match.term, ...merged, updatedAt: nowISO() };
          if (unit) unit.put('terms', updated);
          match.term = updated;
          report.updated += 1;
          report.statuses[index] = 'updated';
          return;
        }
      }

      const order = nextTermOrder.get(lesson.id) ?? 0;
      nextTermOrder.set(lesson.id, order + 1);
      const term = unit
        ? makeTerm({ lesson, draft: row.term, sortOrder: order })
        : planned({ lessonID: lesson.id, ...fields });
      if (unit) unit.put('terms', term);
      if (!match) termByKey.set(termKey, { term, fromFile: true });
      if (lesson.consolidatedAt && !lostConsolidation.has(lesson.id)) {
        lostConsolidation.add(lesson.id);
        report.unconsolidated.push(this.lessonPath(lesson.id));
        if (unit) this.#unconsolidate(unit, lesson.id);
      }
      report.added += 1;
      report.statuses[index] = match ? 'addedDuplicate' : 'added';
    });

    // ------------------------------------------------ notatki lekcji

    /** Lekcja wskazana samą nazwą (bez pełnej ścieżki): jedna pasująca – istniejąca albo z tego importu. */
    const findLesson = (row) => {
      const key = normalizeKey(row.lesson);
      const moduleKey = isBlank(row.module) ? null : normalizeKey(row.module);
      const domainKey = isBlank(row.domain) ? null : normalizeKey(row.domain);
      const matches = [...lessonByKey.values()].filter((lesson) => {
        if (normalizeKey(lesson.name) !== key) return false;
        const module = moduleByID.get(lesson.moduleID);
        if (moduleKey !== null && normalizeKey(module?.name) !== moduleKey) return false;
        const domain = domainByID.get(module?.domainID ?? lesson.domainID);
        return domainKey === null || normalizeKey(domain?.name) === domainKey;
      });
      if (matches.length === 1) return { lesson: matches[0] };
      return { error: matches.length === 0 ? 'missingLesson' : 'ambiguousLesson' };
    };

    const notesDone = new Set();
    notes.forEach((row, index) => {
      const fail = (status) => {
        report.notes.failed += 1;
        report.notes.statuses[index] = status;
      };
      let lesson;
      if (row.lessonID) {
        lesson = this.#require('lesson', row.lessonID);
      } else if (!isBlank(row.domain) && !isBlank(row.module) && !isBlank(row.lesson)) {
        lesson = placeLesson(row);
      } else if (!isBlank(row.lesson)) {
        const found = findLesson(row);
        if (found.error) {
          fail(found.error);
          return;
        }
        lesson = found.lesson;
      } else {
        fail('missingLesson');
        return;
      }
      report.notes.lessons[index] = lesson.id;

      const newImages = row.images ?? [];
      const html = normalizeNoteHtml(row.html ?? '');
      // Treść po angielsku tylko wtedy, gdy arkusz ma na nią kolumnę – inaczej zostaje istniejąca.
      const htmlEN = typeof row.htmlEN === 'string' ? normalizeNoteHtml(row.htmlEN) : undefined;
      // Druga grupa wierszy dla tej samej lekcji w pliku jest dopisywana do pierwszej.
      const repeated = notesDone.has(lesson.id);
      const current = this.getNote(lesson.id);
      let status = 'added';
      let merge = false;
      if (repeated) {
        status = 'appended';
        merge = true;
      } else if (current) {
        report.notes.existing += 1;
        if (noteMode === 'skip') {
          report.notes.skipped += 1;
          report.notes.statuses[index] = 'skipped';
          return;
        }
        if (noteMode === 'append') {
          status = 'appended';
          merge = true;
        } else if (html === current.html && (htmlEN === undefined || htmlEN === (current.htmlEN ?? ''))
          && sameImages(current.images, newImages) && sameLabels(current.images, newImages)) {
          report.notes.unchanged += 1;
          report.notes.statuses[index] = 'unchanged';
          notesDone.add(lesson.id);
          return;
        } else {
          status = 'replaced';
        }
      }
      const base = merge && current ? current : null;
      const imageCount = (base?.images.length ?? 0) + newImages.length;
      const fullHtml = base ? `${base.html}${html}` : html;
      const fullHtmlEN = base && htmlEN !== undefined ? `${base.htmlEN ?? ''}${htmlEN}` : htmlEN;
      if (imageCount > NOTE_IMAGE_LIMIT) {
        fail('tooManyImages');
        return;
      }
      if (fullHtml.length > NOTE_HTML_LIMIT || (fullHtmlEN?.length ?? 0) > NOTE_HTML_LIMIT) {
        fail('tooLong');
        return;
      }
      if (unit) {
        const images = [...(base?.images ?? []).map((meta) => ({ id: meta.id })), ...newImages];
        this.#writeNote(unit, lesson.id, { html: fullHtml, htmlEN: fullHtmlEN, images }, current);
      }
      notesDone.add(lesson.id);
      touchedLessons.add(lesson.id);
      report.notes[status] += 1;
      report.notes.images += newImages.length;
      report.notes.statuses[index] = status;
    });

    if (unit) report.lessonIDs = [...touchedLessons];
    return report;
  }

  /**
   * Dodaje wiele pojęć jedną niepodzielną operacją (import plików, dane przykładowe).
   *
   * Wiersz: { term: szkic pojęcia } oraz położenie – albo `lessonID`, albo nazwy
   * `domain`, `module`, `lesson` (brakujące elementy hierarchii są tworzone).
   * `domain` może być nazwą albo szkicem { name, details, icon, color }.
   * Zamiast nazwy można wskazać istniejący element: `domainID` albo `moduleID`.
   * Opcjonalne `number` to numer wiersza w pliku, używany w komunikatach.
   *
   * duplicates – co zrobić z pojęciem o tych samych nazwach PL i EN w lekcji:
   *   'skip'   – pominąć (domyślnie),
   *   'update' – uzupełnić istniejące treścią z pliku; identyfikator, postępy i historia
   *              nauki zostają, a puste komórki nie kasują istniejącej treści,
   *   'add'    – dodać jako nowe.
   * Powtórzenia w samym pliku są pomijane (poza trybem 'add').
   *
   * Raport: liczby utworzonych elementów (domains, modules, lessons) i ich nazwy (created),
   * liczby pojęć (added, updated, unchanged, skipped), liczby duplikatów oraz status
   * każdego wiersza (statuses).
   *
   * notes – notatki lekcji importowane w tej samej operacji (po pojęciach, więc trafiają też
   * do lekcji tworzonych przez pojęcia): [{ domain, module, lesson | lessonID, html, images }],
   * images: [{ bytes, type, width, height, name }]. Pełna ścieżka tworzy brakujące poziomy;
   * sama nazwa lekcji musi wskazywać dokładnie jedną lekcję (istniejącą albo z tego importu).
   * noteMode – gdy lekcja ma już notatkę: 'replace' (domyślnie), 'append' albo 'skip'.
   * Raport notatek (report.notes): liczby added, replaced, appended, unchanged, skipped,
   * failed, existing (ile lekcji miało już notatkę), images oraz status każdej notatki:
   * added | replaced | appended | unchanged | skipped | missingLesson | ambiguousLesson |
   * tooManyImages | tooLong.
   */
  importRows(rows, { duplicates = 'skip', notes = [], noteMode = 'replace' } = {}) {
    return this.#mutate((unit) => this.#runImport(rows, duplicates, unit, notes, noteMode));
  }

  /** Plan importu: ten sam raport co importRows(), bez żadnej zmiany w bibliotece. */
  planImport(rows, { duplicates = 'skip', notes = [], noteMode = 'replace' } = {}) {
    return this.#runImport(rows, duplicates, null, notes, noteMode);
  }

  // ---------------------------------------------------------------- kopia zapasowa

  /** Zawartość wszystkich magazynów (pamięć + dzienniki z bazy). */
  /** Wszystkie dane; `media: false` – bez magazynów z bajtami obrazów i załączników. */
  async exportAll({ media = true } = {}) {
    const data = {};
    for (const name of ALL_STORES) {
      if (!media && MEDIA_STORES.includes(name)) continue;
      data[name] = MEMORY_STORES.includes(name)
        ? [...this.maps[name].values()]
        : await this.adapter.readStore(name);
    }
    return data;
  }

  /**
   * Zastępuje całą bazę podanymi danymi (po wcześniejszej walidacji kopii). Pliki obrazów
   * i załączników, które opisują nowe notatki i są już w bazie, zostają – przywrócenie samych
   * danych na tym samym urządzeniu ich nie gubi.
   */
  replaceAll(data) {
    const run = async () => {
      const keep = new Set((data.notes ?? []).flatMap((note) => mediaOf(note).map(({ meta }) => meta.id)));
      await this.adapter.replaceAll(data, { keep });
      await this.load();
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => {});
    return next;
  }

  // ---------------------------------------------------------------- nauka z fiszkami

  /** Postęp pojęcia w kierunku 'pl_en' albo 'en_pl'; null, gdy jeszcze nie było oceniane. */
  getProgress(termID, direction) {
    return this.#derive().progressByKey.get(`${termID}\n${direction}`) ?? null;
  }

  /** Trwająca sesja nauki albo null. */
  getStudySession() {
    return this.getSettings().activeStudySession ?? null;
  }

  #putStudySession(unit, session) {
    unit.put('settings', { ...this.getSettings(), id: SETTINGS_ID, activeStudySession: session, updatedAt: nowISO() });
  }

  /**
   * Wpis o sesji w dzienniku; sesja bez żadnej oceny nie zostawia śladu. Sesja z ocenami
   * zostaje też zapamiętana jako „ostatnia” – z pełnym zestawem fiszek, do powtórzenia.
   */
  #archiveStudySession(unit, session) {
    const summary = summarizeSession(session);
    if (summary.assessed === 0) return summary;
    unit.put('settings', {
      ...this.getSettings(),
      id: SETTINGS_ID,
      lastStudySession: { config: session.config, queue: session.baseQueue ?? session.queue, finishedAt: nowISO() },
      updatedAt: nowISO()
    });
    unit.append('studySessions', {
      id: session.id,
      startedAt: session.startedAt,
      completedAt: nowISO(),
      direction: session.config.direction,
      scope: session.config.scope,
      front: session.config.front ?? 'term',
      round: session.round ?? 1,
      selectedDomainIDs: session.config.domainID ? [session.config.domainID] : [],
      selectedModuleIDs: session.config.moduleID ? [session.config.moduleID] : [],
      selectedLessonIDs: [...(session.config.lessonIDs ?? [])],
      totalCards: summary.total,
      assessedCards: summary.assessed,
      knownCards: summary.know,
      repeatCards: summary.repeat,
      statuses: summary.statuses,
      finished: summary.remaining === 0
    });
    return summary;
  }

  /**
   * Rozpoczyna sesję z gotową kolejką [{ termID, direction }]. Poprzednia, niedokończona
   * sesja jest przy tym zamykana i trafia do dziennika.
   */
  startStudy(config, queue, { round = 1, baseQueue = null } = {}) {
    return this.#mutate((unit) => {
      if (!Array.isArray(queue) || queue.length === 0) throw errors.emptyStudyQueue();
      const previous = this.getStudySession();
      if (previous) this.#archiveStudySession(unit, previous);
      const session = makeSession({ config, queue, round, baseQueue });
      this.#putStudySession(unit, session);
      return session;
    });
  }

  /**
   * Fiszki, które dałoby się powtórzyć: z pełnego zestawu trwającej (zwykle właśnie
   * zakończonej) sesji albo, gdy jej nie ma, ostatniej zakończonej. Pomija usunięte pojęcia.
   * kind: 'all' – wszystkie albo grupa z REPEAT_KINDS ('repeat' – odłożone, 'partial' –
   * częściowo zapamiętane, 'unknown' – nieznane) według najnowszej oceny fiszki, więc grupy
   * obejmują wszystkie rundy sesji.
   * Zwraca { config, queue, baseQueue } albo null.
   */
  getRepeatableStudy(kind = 'all') {
    const active = this.getStudySession();
    const source = active
      ? { config: active.config, queue: active.baseQueue ?? active.queue }
      : this.getSettings().lastStudySession;
    if (!source?.config || !Array.isArray(source.queue)) return null;
    const baseQueue = source.queue.filter((card) => this.getTerm(card.termID));
    const belongs = REPEAT_KINDS[kind];
    const queue = belongs
      ? baseQueue.filter((card) => belongs(this.getProgress(card.termID, card.direction)))
      : baseQueue;
    return queue.length > 0 ? { config: source.config, queue, baseQueue } : null;
  }

  /**
   * Polecenia powtórki do pokazania po sesji: [{ kind, queue }] w kolejności odłożone,
   * częściowo zapamiętane, nieznane, cała sesja. Grupa z dokładnie tymi samymi fiszkami co
   * „odłożone” jest pomijana, żeby nie było dwóch przycisków robiących to samo.
   */
  repeatChoices() {
    const whole = this.getRepeatableStudy('all');
    if (!whole) return [];
    const key = (queue) => queue.map((card) => `${card.termID}\n${card.direction}`).sort().join('|');
    const choices = [];
    let postponed = null;
    for (const kind of ['repeat', 'partial', 'unknown']) {
      const study = this.getRepeatableStudy(kind);
      if (!study) continue;
      if (kind === 'repeat') postponed = key(study.queue);
      else if (postponed !== null && key(study.queue) === postponed) continue;
      choices.push({ kind, queue: study.queue });
    }
    choices.push({ kind: 'all', queue: whole.queue });
    return choices;
  }

  /**
   * Rozpoczyna od nowa fiszki sesji z tymi samymi ustawieniami (patrz getRepeatableStudy).
   * Powtórka odłożonych i częściowo zapamiętanych jest kolejną rundą tej samej sesji
   * (zachowuje pełny zestaw), powtórka całości – nową sesją. Bieżąca sesja trafia do dziennika.
   */
  repeatStudy(random = Math.random, kind = 'all') {
    return this.#mutate((unit) => {
      const source = this.getRepeatableStudy(kind);
      if (!source) throw errors.noLastStudy();
      const active = this.getStudySession();
      if (active) this.#archiveStudySession(unit, active);
      const queue = repeatQueue(source.queue, source.config, random);
      const whole = kind === 'all';
      const session = makeSession({
        config: source.config,
        queue,
        baseQueue: whole ? queue : source.baseQueue,
        round: whole ? 1 : (active?.round ?? 1) + 1
      });
      this.#putStudySession(unit, session);
      return session;
    });
  }

  /**
   * Zatwierdza bieżącą fiszkę: dopisuje ocenę do historii, aktualizuje postęp w kierunku
   * fiszki i przesuwa sesję – wszystko jedną transakcją.
   * tiles: { term, description, example } (true – „Umiem”), decision: 'know' | 'repeat'.
   */
  recordStudyDecision({ tiles, decision, random = Math.random, now = Date.now(), duration = null }) {
    return this.#mutate((unit) => {
      if (decision !== DECISIONS.KNOW && decision !== DECISIONS.REPEAT) throw errors.invalidDecision();
      const session = this.getStudySession();
      if (!session || session.position >= session.queue.length) throw errors.noStudySession();
      const card = session.queue[session.position];
      const term = this.#require('term', card.termID);

      const previous = this.getProgress(term.id, card.direction);
      const { assessment, rating, reviewed } = this.#evaluate(term, card.direction, previous, tiles, decision, session.id, random, now);
      // Czas nad fiszką (do statystyk) – z górnym limitem, bo fiszka mogła czekać na ekranie.
      if (Number.isFinite(duration)) assessment.duration = Math.round(Math.min(Math.max(duration, 0), MAX_CARD_TIME));
      const progress = nextProgress(previous, term, assessment, reviewed.schedule);
      const review = reviewRecord({ assessment, rating, reviewed });
      unit.append('assessments', assessment);
      unit.append('reviews', review);
      unit.put('progress', progress);

      const updated = {
        ...session,
        position: session.position + 1,
        results: [...session.results, {
          assessmentID: assessment.id,
          reviewID: review.id,
          rating,
          decision,
          status: assessment.assessmentStatus,
          score: assessment.totalScore,
          available: assessment.availableElementCount,
          progressID: progress.id,
          previousProgress: previous
        }]
      };
      this.#putStudySession(unit, updated);
      return updated;
    });
  }

  /**
   * Ocena fiszki: kafelki (brakujący element pozostaje „Brak danych” niezależnie od wejścia),
   * wpis historii, ocena FSRS i nowy harmonogram w kierunku fiszki.
   */
  #evaluate(term, direction, previous, tiles, decision, sessionID, random, now) {
    // „Umiem” oznacza, że pamiętasz wszystko: dostępne kafelki są zaliczone niezależnie od
    // tego, co zaznaczono. Przy „Powtórz” liczą się kafelki tak, jak je zaznaczono.
    const available = emptyTiles(term);
    const checked = {};
    for (const key of Object.keys(available)) {
      checked[key] = available[key] === null ? null : (decision === DECISIONS.KNOW || Boolean(tiles?.[key]));
    }
    const assessment = makeAssessment({
      term, direction, tiles: checked, decision, sessionID, now: new Date(now).toISOString()
    });
    const rating = fsrsRating(assessment);
    const reviewed = reviewSchedule(this.scheduler(), previous?.schedule ?? null, rating, now, random);
    return { assessment, rating, reviewed };
  }

  /**
   * Podgląd przed zatwierdzeniem: za ile wróci bieżąca fiszka po „Umiem” i po „Powtórz”
   * przy obecnym stanie kafelków. Niczego nie zapisuje. `random` powinno być tym samym
   * źródłem, które dostanie recordStudyDecision – wtedy podgląd zgadza się z wynikiem.
   */
  previewStudyDecision(tiles, { random = Math.random, now = Date.now() } = {}) {
    const session = this.getStudySession();
    if (!session || session.position >= session.queue.length) return null;
    const card = session.queue[session.position];
    const term = this.getTerm(card.termID);
    if (!term) return null;
    const previous = this.getProgress(term.id, card.direction);
    const result = {};
    for (const decision of [DECISIONS.KNOW, DECISIONS.REPEAT]) {
      const { rating, reviewed } = this.#evaluate(term, card.direction, previous, tiles, decision, session.id, random, now);
      result[decision] = { rating, interval: reviewed.interval, schedule: reviewed.schedule };
    }
    return result;
  }

  /** Cofa ostatnią decyzję w sesji: usuwa jej wpis z historii i przywraca poprzedni postęp. */
  undoStudyDecision() {
    return this.#mutate((unit) => {
      const session = this.getStudySession();
      if (!session || session.results.length === 0) throw errors.nothingToUndo();
      const last = session.results[session.results.length - 1];
      const card = session.queue[session.position - 1];
      if (!last.skipped) {
        unit.erase('assessments', last.assessmentID);
        if (last.reviewID) unit.erase('reviews', last.reviewID);
        const term = this.getTerm(card.termID);
        if (last.previousProgress && term) {
          // Pojęcie mogło w międzyczasie zmienić lekcję – klucze zakresu bierzemy z jego stanu.
          unit.put('progress', {
            ...last.previousProgress, lessonID: term.lessonID, moduleID: term.moduleID, domainID: term.domainID
          });
        } else if (this.maps.progress.has(last.progressID)) {
          unit.delete('progress', last.progressID);
        }
      }
      const updated = { ...session, position: session.position - 1, results: session.results.slice(0, -1) };
      this.#putStudySession(unit, updated);
      return updated;
    });
  }

  /** Pomija fiszki pojęć, które usunięto w trakcie sesji. Zwraca aktualną sesję albo null. */
  async skipMissingStudyCards() {
    const missing = () => {
      const session = this.getStudySession();
      return Boolean(session) && session.position < session.queue.length && !this.getTerm(session.queue[session.position].termID);
    };
    if (!missing()) return this.getStudySession();
    return this.#mutate((unit) => {
      let session = this.getStudySession();
      while (session && session.position < session.queue.length && !this.getTerm(session.queue[session.position].termID)) {
        session = { ...session, position: session.position + 1, results: [...session.results, { skipped: true }] };
      }
      this.#putStudySession(unit, session);
      return session;
    });
  }

  /** Kończy sesję (także przed końcem kolejki). Zwraca { session, summary }. */
  finishStudy() {
    return this.#mutate((unit) => {
      const session = this.getStudySession();
      if (!session) throw errors.noStudySession();
      const summary = this.#archiveStudySession(unit, session);
      this.#putStudySession(unit, null);
      return { session, summary };
    });
  }

  /** Historia ocen pojęcia, od najnowszej. Każdy wpis ma dołączoną powtórkę FSRS (`review`), jeśli była. */
  async termAssessments(termID) {
    const [records, reviews] = await Promise.all([
      this.adapter.readByTerm('assessments', termID),
      this.adapter.readByTerm('reviews', termID)
    ]);
    const byAssessment = new Map(reviews.map((review) => [review.assessmentID, review]));
    return records
      .map((record) => ({ ...record, review: byAssessment.get(record.id) ?? null }))
      .sort((a, b) => (a.assessedAt < b.assessedAt ? 1 : a.assessedAt > b.assessedAt ? -1 : 0));
  }

  // ---------------------------------------------------------------- quizy

  /** Trwający (albo właśnie zakończony, z wynikami na ekranie) quiz albo null. */
  getQuiz() {
    return this.getSettings().activeQuiz ?? null;
  }

  #putQuiz(unit, quiz) {
    unit.put('settings', { ...this.getSettings(), id: SETTINGS_ID, activeQuiz: quiz, updatedAt: nowISO() });
  }

  /** Wpis w historii wyników (quizSessions) i podsumowanie quizu. */
  #recordQuizSession(unit, quiz, { finishedAt, finished, timedOut }) {
    const summary = quizResult(quiz);
    unit.append('quizSessions', {
      id: quiz.id,
      startedAt: quiz.startedAt,
      completedAt: finishedAt,
      quizType: quiz.config.type,
      direction: quiz.config.direction,
      totalQuestions: summary.total,
      correctAnswers: summary.correct,
      incorrectAnswers: summary.incorrect,
      unanswered: summary.unanswered,
      percent: summary.percent,
      passThreshold: summary.threshold,
      passed: summary.passed,
      duration: quiz.elapsedMs,
      timeLimit: quiz.config.timeLimit ?? 0,
      finished,
      timedOut,
      repeatOfWrong: Boolean(quiz.config.termIDs?.length),
      selectedDomainIDs: quiz.config.domainID ? [quiz.config.domainID] : [],
      selectedModuleIDs: quiz.config.moduleID ? [quiz.config.moduleID] : [],
      selectedLessonIDs: [...(quiz.config.lessonIDs ?? [])],
      wrongTermIDs: summary.wrongTermIDs
    });
    return summary;
  }

  /**
   * Rozpoczyna quiz z gotowymi pytaniami (buildQuiz). Niedokończony poprzedni quiz z co
   * najmniej jedną odpowiedzią trafia do historii jako przerwany.
   */
  startQuiz(config, { items, total }) {
    return this.#mutate((unit) => {
      if (!Array.isArray(items) || items.length === 0 || !(total > 0)) throw errors.emptyQuiz();
      const previous = this.getQuiz();
      if (previous && !previous.finishedAt && previous.answers.length > 0) {
        this.#recordQuizSession(unit, previous, { finishedAt: nowISO(), finished: false, timedOut: false });
      }
      const quiz = {
        id: newID(), config, items, total, position: 0, answers: [], elapsedMs: 0, startedAt: nowISO(), finishedAt: null
      };
      this.#putQuiz(unit, quiz);
      return quiz;
    });
  }

  /**
   * Zapisuje odpowiedzi na bieżące pytanie (jedna odpowiedź) albo rundę (po jednej na parę)
   * i przechodzi dalej. Po ostatnim pytaniu quiz kończy się w tej samej transakcji.
   * Odpowiedzi trafiają do dziennika quizAnswers; harmonogram powtórek (FSRS) się nie zmienia.
   */
  /**
   * Dopisuje odpowiedzi do dziennika quizAnswers. Odpowiedzi oznaczone `unanswered` (para,
   * której nie zdążono połączyć) liczą się tylko w wyniku quizu, nie w statystykach pojęć.
   */
  #appendQuizAnswers(unit, quiz, answers, { responseTime, answeredAt }) {
    const records = [];
    const kept = [];
    for (const answer of answers) {
      const entry = {
        termID: answer.termID,
        direction: answer.direction,
        questionType: answer.questionType,
        selectedAnswer: answer.selectedAnswer ?? null,
        correctAnswer: answer.correctAnswer,
        isCorrect: Boolean(answer.isCorrect)
      };
      if (answer.unanswered) {
        kept.push({ ...entry, isCorrect: false, unanswered: true });
        continue;
      }
      const record = {
        id: newID(),
        sessionID: quiz.id,
        ...entry,
        usedHint: Boolean(answer.usedHint),
        responseTime: Math.max(0, Math.round(answer.responseTime ?? responseTime)),
        answeredAt
      };
      unit.append('quizAnswers', record);
      records.push(record);
      kept.push(entry);
    }
    return { records, kept };
  }

  recordQuizAnswers(answers, { elapsedMs = null, responseTime = 0, now = Date.now() } = {}) {
    return this.#mutate((unit) => {
      const quiz = this.getQuiz();
      if (!quiz || quiz.finishedAt) throw errors.noQuiz();
      const answeredAt = new Date(now).toISOString();
      const { records, kept } = this.#appendQuizAnswers(unit, quiz, answers, { responseTime, answeredAt });
      const updated = {
        ...quiz,
        position: quiz.position + 1,
        answers: [...quiz.answers, ...kept],
        elapsedMs: elapsedMs ?? quiz.elapsedMs + records.reduce((sum, record) => sum + record.responseTime, 0)
      };
      if (updated.position >= updated.items.length) {
        updated.finishedAt = answeredAt;
        this.#recordQuizSession(unit, updated, { finishedAt: answeredAt, finished: true, timedOut: false });
      }
      this.#putQuiz(unit, updated);
      return { quiz: updated, records };
    }).then((result) => {
      for (const record of result.records) this.#countQuizAnswer(record);
      return result.quiz;
    });
  }

  /**
   * Kończy quiz przed ostatnim pytaniem: koniec czasu (`timedOut`) albo przerwanie.
   * `partial` to odpowiedzi z niedokończonej rundy dopasowywania (połączone pary; pary
   * niepołączone z flagą `unanswered`) – runda liczy się wtedy jako rozegrana.
   * Pytania bez odpowiedzi liczą się jako błędne w wyniku, ale nie trafiają do statystyk pojęć.
   */
  finishQuiz({ elapsedMs = null, timedOut = false, partial = [], now = Date.now() } = {}) {
    return this.#mutate((unit) => {
      const quiz = this.getQuiz();
      if (!quiz) throw errors.noQuiz();
      if (quiz.finishedAt) return { quiz, records: [] };
      const finishedAt = new Date(now).toISOString();
      let updated = { ...quiz, finishedAt, timedOut, elapsedMs: elapsedMs ?? quiz.elapsedMs };
      let records = [];
      if (partial.length > 0 && quiz.position < quiz.items.length) {
        const appended = this.#appendQuizAnswers(unit, quiz, partial, { responseTime: 0, answeredAt: finishedAt });
        records = appended.records;
        updated = { ...updated, position: quiz.position + 1, answers: [...quiz.answers, ...appended.kept] };
      }
      this.#recordQuizSession(unit, updated, { finishedAt, finished: false, timedOut });
      this.#putQuiz(unit, updated);
      return { quiz: updated, records };
    }).then((result) => {
      for (const record of result.records) this.#countQuizAnswer(record);
      return result.quiz;
    });
  }

  /** Zapisuje czas trwającego quizu (ekran quizu zniknął albo aplikacja przeszła w tło). */
  saveQuizTime(elapsedMs) {
    return this.#mutate((unit) => {
      const quiz = this.getQuiz();
      if (!quiz || quiz.finishedAt || !(elapsedMs >= quiz.elapsedMs)) return quiz;
      const updated = { ...quiz, elapsedMs: Math.round(elapsedMs) };
      this.#putQuiz(unit, updated);
      return updated;
    });
  }

  /** Zamyka ekran wyników (albo porzuca quiz bez odpowiedzi). */
  closeQuiz() {
    return this.#mutate((unit) => {
      const quiz = this.getQuiz();
      if (!quiz) return null;
      if (!quiz.finishedAt && quiz.answers.length > 0) {
        this.#recordQuizSession(unit, quiz, { finishedAt: nowISO(), finished: false, timedOut: false });
      }
      this.#putQuiz(unit, null);
      return null;
    });
  }

  /** Historia wyników quizów, od najnowszego. */
  async quizHistory(limit = 50) {
    const sessions = await this.adapter.readStore('quizSessions');
    return sessions
      .sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0))
      .slice(0, limit);
  }

  // ---------------------------------------------------------------- ustawienia

  getSettings() {
    return this.maps.settings.get(SETTINGS_ID) ?? defaultSettings();
  }

  updateSettings(patch) {
    return this.#mutate((unit) => {
      const updated = { ...this.getSettings(), ...patch, id: SETTINGS_ID, updatedAt: nowISO() };
      unit.put('settings', updated);
      return updated;
    });
  }
}
