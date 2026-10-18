// Kopia zapasowa: pełny, wersjonowany zapis bazy w jednym pliku JSON.
// Przywracanie najpierw sprawdza cały plik, a dopiero potem zastępuje bazę –
// uszkodzony plik nigdy nie nadpisze danych.

import {
  ALL_STORES, SCHEMA_VERSION, SETTINGS_ID, TERM_HISTORY_STORES, defaultSettings, nowISO, termFieldsFromDraft
} from './model.js';
import { base64ToBytes, bytesToBase64 } from './base64.js';
import { LibraryError } from './library.js';
import { imageInfo } from './images.js';
import { normalizeNoteHtml } from './note-format.js';
import { blankToNull, collapseWhitespace, normalizeKey } from './text.js';

export const BACKUP_FORMAT = 'lexicards-backup';
/** 2 – notatki lekcji z obrazami (wersja 1.1). Kopie w wersji 1 nadal można przywrócić. */
export const BACKUP_FORMAT_VERSION = 2;

function invalid(message) {
  return new LibraryError('invalidBackup', message);
}

/** Tworzy obiekt kopii zapasowej ze wszystkich magazynów. Obrazy notatek są zapisane w Base64. */
export async function createBackup(library, appVersion = '') {
  const data = await library.exportAll();
  data.noteImages = data.noteImages.map(({ bytes, ...record }) => ({ ...record, data: bytesToBase64(bytes) }));
  const counts = Object.fromEntries(ALL_STORES.map((name) => [name, data[name].length]));
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: nowISO(),
    counts,
    data
  };
}

/** Nazwa pliku kopii, np. „LexiCards-kopia-2026-10-11.json”. */
export function backupFileName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `LexiCards-kopia-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

function requireRecords(data, name) {
  const records = data[name] ?? [];
  if (!Array.isArray(records)) throw invalid(`Sekcja „${name}” w kopii ma nieprawidłową postać.`);
  const seen = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || record.id === '') {
      throw invalid(`Sekcja „${name}” zawiera rekord bez identyfikatora.`);
    }
    if (seen.has(record.id)) throw invalid(`Sekcja „${name}” zawiera powtórzony identyfikator.`);
    seen.add(record.id);
  }
  return records;
}

function namedRecord(record, section) {
  const name = collapseWhitespace(record.name);
  if (name === '') throw invalid(`Sekcja „${section}” zawiera element bez nazwy.`);
  return {
    ...record,
    name,
    nameKey: normalizeKey(name),
    details: blankToNull(record.details),
    sortOrder: Number.isFinite(record.sortOrder) ? record.sortOrder : 0,
    createdAt: record.createdAt ?? nowISO(),
    updatedAt: record.updatedAt ?? record.createdAt ?? nowISO()
  };
}

/**
 * Sprawdza kopię i zwraca dane gotowe do zapisu: z przeliczonymi kluczami wyszukiwania
 * i naprawionymi kopiami kluczy zakresu. Zgłasza błąd, gdy plik nie jest kopią LexiCards,
 * pochodzi z nowszej wersji albo ma zerwane powiązania w hierarchii materiałów.
 * Dane nauki wskazujące na nieistniejące pojęcia są pomijane i zliczane w `dropped`.
 */
export function validateBackup(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== BACKUP_FORMAT) {
    throw invalid('To nie jest plik kopii zapasowej LexiCards.');
  }
  if (!Number.isInteger(raw.formatVersion) || raw.formatVersion < 1) {
    throw invalid('Plik kopii ma nieprawidłowy numer wersji.');
  }
  if (raw.formatVersion > BACKUP_FORMAT_VERSION) {
    throw invalid('Kopia pochodzi z nowszej wersji aplikacji. Zaktualizuj aplikację i spróbuj ponownie.');
  }
  if (!raw.data || typeof raw.data !== 'object') {
    throw invalid('Plik kopii nie zawiera danych.');
  }

  const source = raw.data;
  const data = {};
  let dropped = 0;

  data.domains = requireRecords(source, 'domains').map((record) => namedRecord(record, 'domains'));
  const domainIDs = new Set(data.domains.map((record) => record.id));

  data.modules = requireRecords(source, 'modules').map((record) => {
    if (!domainIDs.has(record.domainID)) throw invalid(`Moduł „${record.name ?? ''}” wskazuje na nieistniejącą dziedzinę.`);
    return namedRecord(record, 'modules');
  });
  const modulesByID = new Map(data.modules.map((record) => [record.id, record]));

  data.lessons = requireRecords(source, 'lessons').map((record) => {
    const module = modulesByID.get(record.moduleID);
    if (!module) throw invalid(`Lekcja „${record.name ?? ''}” wskazuje na nieistniejący moduł.`);
    return { ...namedRecord(record, 'lessons'), domainID: module.domainID };
  });
  const lessonsByID = new Map(data.lessons.map((record) => [record.id, record]));

  data.terms = requireRecords(source, 'terms').map((record) => {
    const lesson = lessonsByID.get(record.lessonID);
    if (!lesson) throw invalid(`Pojęcie „${record.termPL ?? ''}” wskazuje na nieistniejącą lekcję.`);
    const fields = termFieldsFromDraft({ ...record, tags: Array.isArray(record.tags) ? record.tags : [] });
    if (fields.termPL === '' || fields.termEN === '') throw invalid('Kopia zawiera pojęcie bez nazwy po polsku lub po angielsku.');
    return {
      ...record,
      ...fields,
      moduleID: lesson.moduleID,
      domainID: lesson.domainID,
      sortOrder: Number.isFinite(record.sortOrder) ? record.sortOrder : 0,
      createdAt: record.createdAt ?? nowISO(),
      updatedAt: record.updatedAt ?? record.createdAt ?? nowISO()
    };
  });
  const termsByID = new Map(data.terms.map((record) => [record.id, record]));

  data.progress = [];
  for (const record of requireRecords(source, 'progress')) {
    const term = termsByID.get(record.termID);
    if (!term) {
      dropped += 1;
      continue;
    }
    data.progress.push({ ...record, lessonID: term.lessonID, moduleID: term.moduleID, domainID: term.domainID });
  }

  for (const name of ['assessments', 'reviews', 'quizAnswers', 'studySessions', 'quizSessions']) {
    const records = requireRecords(source, name);
    if (TERM_HISTORY_STORES.includes(name)) {
      data[name] = records.filter((record) => termsByID.has(record.termID));
      dropped += records.length - data[name].length;
    } else {
      data[name] = records;
    }
  }

  // Notatki: tylko do istniejących lekcji, z obrazami, które są w kopii.
  const images = new Map();
  for (const record of requireRecords(source, 'noteImages')) {
    const bytes = base64ToBytes(record.data);
    if (!bytes || bytes.byteLength === 0) {
      dropped += 1;
      continue;
    }
    const rest = { ...record };
    delete rest.data;
    images.set(record.id, { ...rest, type: record.type || imageInfo(bytes).type, size: bytes.byteLength, bytes });
  }
  data.notes = [];
  const usedImages = new Set();
  for (const record of requireRecords(source, 'notes')) {
    const lessonID = record.lessonID ?? record.id;
    if (!lessonsByID.has(lessonID) || data.notes.some((note) => note.id === lessonID)) {
      dropped += 1;
      continue;
    }
    const metas = (Array.isArray(record.images) ? record.images : []).filter((meta) => meta && images.has(meta.id) && !usedImages.has(meta.id));
    for (const meta of metas) usedImages.add(meta.id);
    const html = normalizeNoteHtml(typeof record.html === 'string' ? record.html : '');
    if (html === '' && metas.length === 0) continue;
    data.notes.push({
      ...record,
      id: lessonID,
      lessonID,
      html,
      images: metas.map((meta) => {
        const image = images.get(meta.id);
        return { id: meta.id, type: image.type, width: image.width ?? null, height: image.height ?? null, size: image.size, crc: image.crc ?? null, name: image.name ?? null };
      }),
      createdAt: record.createdAt ?? nowISO(),
      updatedAt: record.updatedAt ?? record.createdAt ?? nowISO()
    });
  }
  data.noteImages = [...images.values()].filter((image) => usedImages.has(image.id)).map((image) => {
    const note = data.notes.find((item) => item.images.some((meta) => meta.id === image.id));
    return { ...image, lessonID: note.lessonID };
  });
  dropped += images.size - data.noteImages.length;

  const settings = requireRecords(source, 'settings').find((record) => record.id === SETTINGS_ID);
  data.settings = settings ? [{ ...defaultSettings(), ...settings, id: SETTINGS_ID }] : [];

  const counts = Object.fromEntries(ALL_STORES.map((name) => [name, data[name].length]));
  return { data, counts, dropped, exportedAt: raw.exportedAt ?? null };
}

/** Sprawdza kopię i zastępuje nią całą bazę. Zwraca raport z liczbą rekordów. */
export async function restoreBackup(library, raw) {
  const result = validateBackup(raw);
  await library.replaceAll(result.data);
  return result;
}

/** Wczytuje kopię z tekstu JSON (np. zawartości wybranego pliku). */
export function parseBackupText(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw invalid('Nie udało się odczytać pliku. To nie jest poprawny plik kopii zapasowej.');
  }
}
