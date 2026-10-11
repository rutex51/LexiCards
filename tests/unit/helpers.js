// Wspólne narzędzia testów jednostkowych.

import { Library } from '../../js/core/library.js';
import { MemoryAdapter } from '../../js/core/storage.js';
import { DIRECTIONS, newID, nowISO } from '../../js/core/model.js';

/** Biblioteka na adapterze pamięciowym – osobna dla każdego testu. */
export async function makeLibrary() {
  const adapter = new MemoryAdapter();
  await adapter.open();
  const library = new Library(adapter);
  await library.load();
  return { library, adapter };
}

/** Gałąź hierarchii utworzona jedną operacją: dziedzina → moduł → lekcja. */
export async function makeBranch(library, { domain = 'Business English', module = 'Finance', lesson = 'Financial Ratios' } = {}) {
  const createdLesson = await library.createLesson(
    { name: lesson },
    { create: { name: module }, domain: { create: { name: domain } } }
  );
  return {
    domain: library.getDomain(createdLesson.domainID),
    module: library.getModule(createdLesson.moduleID),
    lesson: createdLesson
  };
}

export function addTerm(library, lesson, termPL, termEN, extra = {}) {
  return library.createTerm({ termPL, termEN, ...extra }, lesson.id);
}

/**
 * Dodaje komplet danych nauki dla pojęcia bezpośrednio przez adapter:
 * postęp, ocenę fiszki, wpis powtórki i odpowiedź quizu.
 */
export async function addLearningData(library, adapter, term, direction = DIRECTIONS.PL_EN) {
  const sessionID = newID();
  const progress = {
    id: newID(), termID: term.id, lessonID: term.lessonID, moduleID: term.moduleID, domainID: term.domainID,
    direction, reviewCount: 1, createdAt: nowISO(), updatedAt: nowISO()
  };
  await adapter.commit({
    puts: {
      progress: [progress],
      assessments: [{ id: newID(), termID: term.id, direction, sessionID, assessedAt: nowISO() }],
      reviews: [{ id: newID(), termID: term.id, direction, sessionID, reviewedAt: nowISO() }],
      quizAnswers: [{ id: newID(), termID: term.id, sessionID, isCorrect: false }]
    },
    deletes: {},
    purgeTermIDs: [],
    clear: []
  });
  library.maps.progress.set(progress.id, progress);
  return progress;
}

export async function historyCounts(adapter) {
  return {
    assessments: await adapter.count('assessments'),
    reviews: await adapter.count('reviews'),
    quizAnswers: await adapter.count('quizAnswers')
  };
}
