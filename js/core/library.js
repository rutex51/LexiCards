// Biblioteka materiałów: dziedziny, moduły, lekcje i pojęcia.
//
// Dane są w pamięci (Map), więc odczyt jest natychmiastowy i synchroniczny. Każda zmiana
// przechodzi przez #mutate(): modyfikuje pamięć, utrwala całość jedną transakcją adaptera,
// a w razie błędu przywraca poprzedni stan. Interfejs nigdy nie widzi stanu częściowego.
//
// Usługa odpowiada też za spójność kluczy przy przenoszeniu elementów i za usuwanie
// kaskadowe: dziedzina → moduły → lekcje → pojęcia → dane nauki pojęć.

import {
  ALL_STORES, DIFFICULTY_MAX, DIFFICULTY_MIN, MEMORY_STORES, SETTINGS_ID,
  defaultSettings, makeDomain, makeLesson, makeModule, makeTerm, newID, nowISO, termFieldsFromDraft, termToDraft
} from './model.js';
import { blankToNull, collapseWhitespace, isBlank, normalizeKey } from './text.js';
import { emptyChanges } from './storage.js';
import { DECISIONS, emptyTiles, makeAssessment, makeSession, nextProgress, repeatQueue, summarizeSession } from './study.js';

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
  nothingToUndo: () => new LibraryError('nothingToUndo', 'Nie ma decyzji do cofnięcia.'),
  invalidDecision: () => new LibraryError('invalidDecision', 'Nieznana decyzja – oczekiwano „Umiem” albo „Powtórz”.')
};

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
  /** Kolejka operacji zapisu – każda zaczyna się po zakończeniu poprzedniej. */
  #queue = Promise.resolve();
  /** Liczniki i listy wyliczane z danych; unieważniane po każdej zmianie. */
  #derived = null;
  /** Posortowane listy pojęć dla glosariusza, według rodzaju sortowania. */
  #sorted = new Map();

  constructor(adapter) {
    this.adapter = adapter;
    this.maps = Object.fromEntries(MEMORY_STORES.map((name) => [name, new Map()]));
    this.revision = 0;
  }

  /** Wczytuje dane z adaptera do pamięci. */
  async load() {
    const data = await this.adapter.loadAll();
    for (const name of MEMORY_STORES) {
      this.maps[name] = new Map((data[name] ?? []).map((record) => [record.id, record]));
    }
    this.#changed();
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
   */
  #mutate(work) {
    const run = async () => {
      const unit = new UnitOfWork(this.maps);
      let result;
      let committing = false;
      try {
        result = work(unit);
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
      this.#changed();
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
  glossary(query = {}, offset = 0, limit = 100) {
    const scope = query.scope ?? { kind: 'all' };
    const text = normalizeKey(query.searchText ?? '');
    const tagKey = normalizeKey(query.tag ?? '');
    const favoritesOnly = Boolean(query.favoritesOnly);
    const scopeField = { domain: 'domainID', module: 'moduleID', lesson: 'lessonID' }[scope.kind] ?? null;

    const matches = this.#sortedTerms(query.sort ?? 'polish').filter((term) => {
      if (scopeField && term[scopeField] !== scope.id) return false;
      if (favoritesOnly && !term.isFavorite) return false;
      if (text !== '' && !term.keyPL.includes(text) && !term.keyEN.includes(text)) return false;
      if (tagKey !== '' && !(term.tagKeys ?? []).includes(tagKey)) return false;
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
    return this.#mutate((unit) => this.#insertDomain(unit, draft));
  }

  updateDomain(id, draft) {
    return this.#mutate((unit) => {
      const name = validatedName(draft.name, 'domain');
      const domain = this.#require('domain', id);
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

  /** Kopiuje lekcję z pojęciami. Kopie nie dziedziczą postępów nauki. */
  copyLesson(id, toModuleID) {
    return this.#mutate((unit) => {
      const source = this.#require('lesson', id);
      const target = this.#require('module', toModuleID);
      const terms = this.listTerms(source.id);
      const copy = this.#insertLesson(
        unit,
        { name: this.#uniqueLessonName(source.name, target.id), details: source.details },
        target
      );
      terms.forEach((term, index) => unit.put('terms', this.#copyOfTerm(term, copy, index)));
      return copy;
    });
  }

  // ---------------------------------------------------------------- pojęcia

  createTerm(draft, lessonID) {
    return this.#mutate((unit) => {
      validateTermDraft(draft);
      if (!lessonID) throw errors.parentNotSelected('lesson');
      const lesson = this.#require('lesson', lessonID);
      const term = makeTerm({ lesson, draft, sortOrder: this.#nextOrder(this.listTerms(lesson.id)) });
      unit.put('terms', term);
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
    const impact = { name: null, modules: 0, lessons: 0, terms: 0, progressRecords: 0 };
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
    return impact;
  }

  /** Usuwa cel wraz z elementami podrzędnymi i danymi nauki usuwanych pojęć. */
  delete(target) {
    return this.#mutate((unit) => {
      if (target.kind === 'terms' && target.ids.length === 0) throw errors.nothingSelected();
      if (target.kind !== 'terms') this.#require(target.kind, target.id);

      const terms = this.#termsOf(target);
      const termIDs = new Set(terms.map((term) => term.id));
      for (const term of terms) unit.delete('terms', term.id);
      for (const record of [...this.maps.progress.values()]) {
        if (termIDs.has(record.termID)) unit.delete('progress', record.id);
      }
      unit.purgeTerms([...termIDs]);

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
    });
  }

  /** Usuwa wszystkie materiały, postępy i historię nauki. Ustawienia zostają. */
  async deleteAllContent() {
    const stores = ['domains', 'modules', 'lessons', 'terms', 'progress'];
    const run = async () => {
      // Sesje i wybór materiału wskazują na usuwane elementy, więc znikają razem z nimi.
      const settings = {
        ...this.getSettings(),
        id: SETTINGS_ID,
        activeStudySession: null,
        lastStudySession: null,
        studySelection: null,
        updatedAt: nowISO()
      };
      await this.adapter.commit({
        ...emptyChanges(),
        puts: { settings: [settings] },
        clear: [...stores, 'assessments', 'reviews', 'quizAnswers', 'studySessions', 'quizSessions']
      });
      for (const name of stores) this.maps[name] = new Map();
      this.maps.settings.set(SETTINGS_ID, settings);
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
  #runImport(rows, duplicates, unit) {
    const report = {
      domains: 0, modules: 0, lessons: 0,
      added: 0, updated: 0, unchanged: 0, skipped: 0,
      duplicatesInLibrary: 0, duplicatesInFile: 0,
      created: { domains: [], modules: [], lessons: [] },
      statuses: new Array(rows.length),
      lessonIDs: []
    };
    const touchedLessons = new Set();
    let placeholder = 0;
    const planned = (fields) => ({ id: `plan:${placeholder += 1}`, ...fields });

    const domainByKey = new Map(this.listDomains().map((domain) => [domain.nameKey, domain]));
    const moduleByKey = new Map();
    for (const module of [...this.maps.modules.values()].sort(bySortOrder)) {
      const key = `${module.domainID}\n${module.nameKey}`;
      if (!moduleByKey.has(key)) moduleByKey.set(key, module);
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

    rows.forEach((row, index) => {
      try {
        validateTermDraft(row.term);
      } catch (error) {
        throw new LibraryError(error.code, `Wiersz ${row.number ?? index + 1}: ${error.message}`);
      }

      let lesson;
      if (row.lessonID) {
        lesson = this.#require('lesson', row.lessonID);
      } else {
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
          report.modules += 1;
          report.created.modules.push(`${domain.name} › ${module.name}`);
        }
        const lessonKey = `${module.id}\n${normalizeKey(row.lesson)}`;
        lesson = lessonByKey.get(lessonKey);
        if (!lesson) {
          lesson = unit
            ? this.#insertLesson(unit, { name: row.lesson }, module)
            : planned({ name: validatedName(row.lesson, 'lesson'), moduleID: module.id, domainID: domain.id });
          lessonByKey.set(lessonKey, lesson);
          report.lessons += 1;
          report.created.lessons.push(`${domain.name} › ${module.name} › ${lesson.name}`);
        }
      }
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
      report.added += 1;
      report.statuses[index] = match ? 'addedDuplicate' : 'added';
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
   */
  importRows(rows, { duplicates = 'skip' } = {}) {
    return this.#mutate((unit) => this.#runImport(rows, duplicates, unit));
  }

  /** Plan importu: ten sam raport co importRows(), bez żadnej zmiany w bibliotece. */
  planImport(rows, { duplicates = 'skip' } = {}) {
    return this.#runImport(rows, duplicates, null);
  }

  // ---------------------------------------------------------------- kopia zapasowa

  /** Zawartość wszystkich magazynów (pamięć + dzienniki z bazy). */
  async exportAll() {
    const data = {};
    for (const name of ALL_STORES) {
      data[name] = MEMORY_STORES.includes(name)
        ? [...this.maps[name].values()]
        : await this.adapter.readStore(name);
    }
    return data;
  }

  /** Zastępuje całą bazę podanymi danymi (po wcześniejszej walidacji kopii). */
  replaceAll(data) {
    const run = async () => {
      await this.adapter.replaceAll(data);
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
   * Fiszki, które dałoby się powtórzyć: pełny zestaw trwającej (zwykle właśnie zakończonej)
   * sesji albo, gdy jej nie ma, ostatniej zakończonej. Pomija usunięte pojęcia.
   * Zwraca { config, queue } albo null.
   */
  getRepeatableStudy() {
    const active = this.getStudySession();
    const source = active
      ? { config: active.config, queue: active.baseQueue ?? active.queue }
      : this.getSettings().lastStudySession;
    if (!source?.config || !Array.isArray(source.queue)) return null;
    const queue = source.queue.filter((card) => this.getTerm(card.termID));
    return queue.length > 0 ? { config: source.config, queue } : null;
  }

  /**
   * Rozpoczyna od nowa te same fiszki z tymi samymi ustawieniami (patrz getRepeatableStudy),
   * niezależnie od tego, jak zostały ocenione. Bieżąca sesja jest zamykana i trafia do dziennika.
   */
  repeatStudy(random = Math.random) {
    return this.#mutate((unit) => {
      const source = this.getRepeatableStudy();
      if (!source) throw errors.noLastStudy();
      const active = this.getStudySession();
      if (active) this.#archiveStudySession(unit, active);
      const queue = repeatQueue(source.queue, source.config, random);
      const session = makeSession({ config: source.config, queue, baseQueue: queue });
      this.#putStudySession(unit, session);
      return session;
    });
  }

  /**
   * Zatwierdza bieżącą fiszkę: dopisuje ocenę do historii, aktualizuje postęp w kierunku
   * fiszki i przesuwa sesję – wszystko jedną transakcją.
   * tiles: { term, description, example } (true – „Umiem”), decision: 'know' | 'repeat'.
   */
  recordStudyDecision({ tiles, decision }) {
    return this.#mutate((unit) => {
      if (decision !== DECISIONS.KNOW && decision !== DECISIONS.REPEAT) throw errors.invalidDecision();
      const session = this.getStudySession();
      if (!session || session.position >= session.queue.length) throw errors.noStudySession();
      const card = session.queue[session.position];
      const term = this.#require('term', card.termID);

      // Kafelek elementu, którego pojęcie nie ma, pozostaje „Brak danych” niezależnie od wejścia.
      const available = emptyTiles(term);
      const checked = {};
      for (const key of Object.keys(available)) checked[key] = available[key] === null ? null : Boolean(tiles?.[key]);

      const previous = this.getProgress(term.id, card.direction);
      const assessment = makeAssessment({ term, direction: card.direction, tiles: checked, decision, sessionID: session.id });
      const progress = nextProgress(previous, term, assessment);
      unit.append('assessments', assessment);
      unit.put('progress', progress);

      const updated = {
        ...session,
        position: session.position + 1,
        results: [...session.results, {
          assessmentID: assessment.id,
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

  /** Cofa ostatnią decyzję w sesji: usuwa jej wpis z historii i przywraca poprzedni postęp. */
  undoStudyDecision() {
    return this.#mutate((unit) => {
      const session = this.getStudySession();
      if (!session || session.results.length === 0) throw errors.nothingToUndo();
      const last = session.results[session.results.length - 1];
      const card = session.queue[session.position - 1];
      if (!last.skipped) {
        unit.erase('assessments', last.assessmentID);
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

  /** Historia ocen pojęcia, od najnowszej. */
  async termAssessments(termID) {
    const records = await this.adapter.readByTerm('assessments', termID);
    return records.sort((a, b) => (a.assessedAt < b.assessedAt ? 1 : a.assessedAt > b.assessedAt ? -1 : 0));
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
