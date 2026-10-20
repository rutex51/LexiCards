// Kopia zapasowa i przeniesienie na inne urządzenie – dwa pliki (od 1.8):
//   dane                – materiały, notatki (tekst i opisy obrazów i załączników), postępy,
//                         historia i ustawienia w jednym pliku JSON (mały, szybki);
//   obrazy i załączniki – bajty wszystkich obrazów i załączników notatek w jednym pliku ZIP.
// Przywracanie danych najpierw sprawdza cały plik, a dopiero potem zastępuje bazę – uszkodzony
// plik nigdy nie nadpisze danych. Pliki obrazów i załączników, które są już na urządzeniu,
// zostają; brakujące dochodzą z drugiego pliku. Kopie z wersji 1.1–1.7 (jeden plik JSON
// z obrazami w Base64) nadal można przywrócić.

import {
  ALL_STORES, MEDIA_STORES, SCHEMA_VERSION, SETTINGS_ID, TERM_HISTORY_STORES, defaultSettings, nowISO, termFieldsFromDraft
} from './model.js';
import { base64ToBytes } from './base64.js';
import { cleanDrawing, drawingWithoutPhotoBytes } from './drawing.js';
import { LibraryError } from './library.js';
import { IMAGE_EXTENSIONS, imageInfo } from './images.js';
import { cleanFileName, fileTypeOf } from './note-files.js';
import { normalizeNoteHtml } from './note-format.js';
import { withImageLabels } from './note-refs.js';
import { blankToNull, collapseWhitespace, normalizeKey } from './text.js';
import { ZipError, ZipWriter, openZipBlob } from './zip.js';

export const BACKUP_FORMAT = 'lexicards-backup';
/**
 * 2 – notatki lekcji z obrazami (wersja 1.1), 3 – same dane, obrazy i załączniki w osobnym
 * pliku (wersja 1.8). Kopie w wersji 1 i 2 nadal można przywrócić.
 */
export const BACKUP_FORMAT_VERSION = 3;
/** Plik obrazów i załączników: archiwum ZIP ze spisem treści MEDIA_MANIFEST. */
export const MEDIA_FORMAT = 'lexicards-media';
export const MEDIA_FORMAT_VERSION = 1;
export const MEDIA_MANIFEST = 'lexicards-pliki.json';
/** Ile bajtów obrazów i załączników zapisywać do bazy jedną transakcją przy przywracaniu. */
const MEDIA_BATCH_BYTES = 16 * 1024 * 1024;

function invalid(message) {
  return new LibraryError('invalidBackup', message);
}

const DATA_STORES = ALL_STORES.filter((name) => !MEDIA_STORES.includes(name));

/**
 * Tworzy obiekt kopii danych (bez bajtów obrazów i załączników – te są w osobnym pliku,
 * createMediaArchive). `media` – ile obrazów i załączników opisują notatki.
 */
export async function createBackup(library, appVersion = '') {
  const data = await library.exportAll({ media: false });
  const counts = Object.fromEntries(DATA_STORES.map((name) => [name, data[name].length]));
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: nowISO(),
    counts,
    media: library.mediaSummary(),
    data
  };
}

function dateStamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Nazwa pliku danych, np. „LexiCards-dane-2026-10-19.json”. */
export function backupFileName(date = new Date()) {
  return `LexiCards-dane-${dateStamp(date)}.json`;
}

/** Nazwa pliku obrazów i załączników, np. „LexiCards-obrazy-i-zalaczniki-2026-10-19.zip”. */
export function mediaFileName(date = new Date()) {
  return `LexiCards-obrazy-i-zalaczniki-${dateStamp(date)}.zip`;
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
    // Data utrwalenia (od 1.2): tylko poprawna data, inaczej lekcja jest nieoznaczona.
    const consolidatedAt = typeof record.consolidatedAt === 'string' && Number.isFinite(Date.parse(record.consolidatedAt))
      ? record.consolidatedAt
      : null;
    return { ...namedRecord(record, 'lessons'), domainID: module.domainID, consolidatedAt };
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

  // Notatki: tylko do istniejących lekcji. Kopie z wersji 1.1–1.7 mają obrazy w samym pliku
  // (Base64) – opis obrazu bez pliku w kopii jest pomijany. Od wersji 3 notatki mają tylko opisy
  // obrazów i załączników, a pliki są w osobnym pliku (albo już na urządzeniu).
  const embedded = new Map();
  for (const record of requireRecords(source, 'noteImages')) {
    const bytes = base64ToBytes(record.data);
    if (!bytes || bytes.byteLength === 0) {
      dropped += 1;
      continue;
    }
    const rest = { ...record };
    delete rest.data;
    embedded.set(record.id, { ...rest, type: record.type || imageInfo(bytes).type, size: bytes.byteLength, bytes });
  }
  const separate = raw.formatVersion >= 3;
  const usedMedia = new Set();
  /** Opisy obrazów albo załączników notatki: poprawne, bez powtórzeń (także między notatkami). */
  const mediaList = (list, accept) => (Array.isArray(list) ? list : []).filter((meta) => {
    if (!meta || typeof meta.id !== 'string' || meta.id === '' || usedMedia.has(meta.id) || !accept(meta)) return false;
    usedMedia.add(meta.id);
    return true;
  });
  data.notes = [];
  for (const record of requireRecords(source, 'notes')) {
    const lessonID = record.lessonID ?? record.id;
    if (!lessonsByID.has(lessonID) || data.notes.some((note) => note.id === lessonID)) {
      dropped += 1;
      continue;
    }
    const html = normalizeNoteHtml(typeof record.html === 'string' ? record.html : '');
    const htmlEN = normalizeNoteHtml(typeof record.htmlEN === 'string' ? record.htmlEN : '');
    const metas = mediaList(record.images, (meta) => embedded.has(meta.id) || separate);
    const files = separate ? mediaList(record.files, () => true) : [];
    if (html === '' && htmlEN === '' && metas.length === 0 && files.length === 0) continue;
    data.notes.push({
      ...record,
      id: lessonID,
      lessonID,
      html,
      htmlEN,
      imagesFirst: record.imagesFirst === true,
      images: withImageLabels(metas.map((meta) => imageMeta(meta, embedded.get(meta.id)))),
      files: files.map(fileMeta),
      createdAt: record.createdAt ?? nowISO(),
      updatedAt: record.updatedAt ?? record.createdAt ?? nowISO()
    });
  }
  data.noteImages = [...embedded.values()].filter((image) => usedMedia.has(image.id)).map((image) => {
    const note = data.notes.find((item) => item.images.some((meta) => meta.id === image.id));
    return { ...image, lessonID: note.lessonID };
  });
  data.noteFiles = [];
  dropped += embedded.size - data.noteImages.length;
  const media = { images: 0, files: 0, size: 0, included: data.noteImages.length };
  for (const note of data.notes) {
    media.images += note.images.length;
    media.files += note.files.length;
    media.size += [...note.images, ...note.files].reduce((sum, meta) => sum + meta.size, 0);
  }

  const settings = requireRecords(source, 'settings').find((record) => record.id === SETTINGS_ID);
  // Kopia sprzed wersji 1.2 nie ma znacznika szarych ikon: po przywróceniu jej dziedziny też
  // przechodzą na szare tło (raz, tak jak przy aktualizacji).
  data.settings = settings ? [{ ...defaultSettings(), domainColorsGray: false, ...settings, id: SETTINGS_ID }] : [];

  const counts = Object.fromEntries(ALL_STORES.map((name) => [name, data[name].length]));
  return { data, counts, media, dropped, exportedAt: raw.exportedAt ?? null };
}

const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);

/** Opis obrazu w notatce – z pliku obrazu w kopii (wersje 1.1–1.7) albo z samego opisu. */
function imageMeta(meta, image = null) {
  const source = image ?? meta;
  return {
    id: meta.id,
    type: typeof source.type === 'string' && source.type !== '' ? source.type : 'image/png',
    width: finiteOr(source.width, null),
    height: finiteOr(source.height, null),
    size: finiteOr(source.size, 0),
    crc: Number.isInteger(source.crc) ? source.crc : null,
    name: typeof source.name === 'string' ? source.name : null,
    label: typeof meta.label === 'string' ? meta.label : null,
    // Rysunek do edycji (od 1.12) – kreski są w pliku obrazów i załączników.
    ...(meta.drawing === true ? { drawing: true } : {})
  };
}

/** Opis załącznika w notatce. */
function fileMeta(meta) {
  const name = cleanFileName(meta.name);
  return {
    id: meta.id,
    name,
    type: fileTypeOf(name, meta.type),
    size: finiteOr(meta.size, 0),
    crc: Number.isInteger(meta.crc) ? meta.crc : null,
    ...(Number.isFinite(meta.duration) && meta.duration > 0 ? { duration: meta.duration } : {})
  };
}

/**
 * Sprawdza kopię danych i zastępuje nią całą bazę. Pliki obrazów i załączników, które są już
 * na urządzeniu, zostają. Zwraca raport z liczbą rekordów.
 */
export async function restoreBackup(library, raw) {
  const result = validateBackup(raw);
  await library.replaceAll(result.data);
  return result;
}

// ---------------------------------------------------------------- obrazy i załączniki

/** Ścieżka pliku w archiwum: obrazy/<id>.png, zalaczniki/<id>/<nazwa pliku>. */
function mediaPath(store, meta) {
  return store === 'noteImages'
    ? `obrazy/${meta.id}.${IMAGE_EXTENSIONS[meta.type] ?? 'bin'}`
    : `zalaczniki/${meta.id}/${cleanFileName(meta.name)}`;
}

/**
 * Kreski rysunku (od 1.12) w archiwum: rysunki/<id>.json, zdjęcie pod kreskami
 * rysunki/<id>-zdjecie.jpeg i (od 1.15) szablon z pliku rysunki/<id>-szablon.png. Zwraca opis do
 * spisu treści: { path, photo, template? } (photo – ścieżka albo null).
 */
async function addDrawing(writer, id, drawing) {
  const path = `rysunki/${id}.json`;
  await writer.add({ name: path, data: new TextEncoder().encode(JSON.stringify(drawingWithoutPhotoBytes(drawing))) });
  let photo = null;
  if (drawing.photo?.bytes) {
    photo = `rysunki/${id}-zdjecie.${IMAGE_EXTENSIONS[drawing.photo.type] ?? 'bin'}`;
    await writer.add({ name: photo, data: new Uint8Array(drawing.photo.bytes), stored: true });
  }
  let template = null;
  if (drawing.template?.bytes) {
    template = `rysunki/${id}-szablon.${IMAGE_EXTENSIONS[drawing.template.type] ?? 'bin'}`;
    await writer.add({ name: template, data: new Uint8Array(drawing.template.bytes), stored: true });
  }
  return { path, photo, ...(template ? { template } : {}) };
}

/** Kreski rysunku z archiwum (z jego zdjęciem) albo null, gdy ich nie ma albo są uszkodzone. */
async function readDrawing(archive, description) {
  if (!description || typeof description.path !== 'string') return null;
  try {
    const entry = archive.entries.get(description.path);
    if (!entry) return null;
    const raw = JSON.parse(new TextDecoder().decode(await archive.read(entry)));
    if (raw?.photo && typeof description.photo === 'string') {
      const photo = archive.entries.get(description.photo);
      if (!photo) return null;
      raw.photo = { ...raw.photo, bytes: await archive.read(photo) };
    }
    // Szablon bez pliku w archiwum – rysunek bez szablonu (kreski zostają).
    if (raw?.template?.source === 'image') {
      const template = typeof description.template === 'string' ? archive.entries.get(description.template) : null;
      if (template) raw.template = { ...raw.template, bytes: await archive.read(template) };
      else delete raw.template;
    }
    return cleanDrawing(raw);
  } catch (error) {
    if (error instanceof ZipError || error instanceof SyntaxError) return null;
    throw error;
  }
}

/**
 * Plik obrazów i załączników wszystkich notatek (ZIP bez kompresji – obrazy, PDF i pliki Office
 * są już skompresowane). Pliki są czytane z bazy po jednym. Spis treści (MEDIA_MANIFEST) wiąże
 * każdy plik z jego opisem w notatce. Zwraca { blob, images, files, size, missing } – missing:
 * opisane w notatkach, a nieobecne na urządzeniu (nie trafiają do pliku).
 */
export async function createMediaArchive(library, appVersion = '', { onProgress = null } = {}) {
  const index = await library.mediaIndex();
  const writer = new ZipWriter();
  const items = [];
  const report = { images: 0, files: 0, size: 0, missing: 0 };
  let done = 0;
  for (const [id, entry] of index) {
    onProgress?.(done, index.size);
    done += 1;
    const record = entry.present ? await library.mediaRecord(entry.store, id) : null;
    if (!record?.bytes) {
      report.missing += 1;
      continue;
    }
    const data = new Uint8Array(record.bytes);
    const path = mediaPath(entry.store, entry.meta);
    await writer.add({ name: path, data, stored: true });
    const kind = entry.store === 'noteImages' ? 'image' : 'file';
    items.push({
      id, kind, lessonID: entry.lessonID, path, name: entry.meta.name ?? null, type: entry.meta.type, size: data.byteLength,
      crc: entry.meta.crc ?? null,
      ...(record.drawing ? { drawing: await addDrawing(writer, id, record.drawing) } : {})
    });
    report[kind === 'image' ? 'images' : 'files'] += 1;
    report.size += data.byteLength;
  }
  const manifest = {
    format: MEDIA_FORMAT, formatVersion: MEDIA_FORMAT_VERSION, appVersion, exportedAt: nowISO(),
    counts: { images: report.images, files: report.files, size: report.size }, items
  };
  await writer.add({ name: MEDIA_MANIFEST, data: new TextEncoder().encode(JSON.stringify(manifest)) });
  return { blob: writer.finish(), ...report };
}

const notMediaFile = () => invalid('To nie jest plik obrazów i załączników LexiCards.');

/** Otwiera plik obrazów i załączników: { manifest, archive } (archiwum czytane kawałkami). */
export async function openMediaArchive(blob) {
  let archive;
  let manifest;
  try {
    archive = await openZipBlob(blob);
    const entry = archive.entries.get(MEDIA_MANIFEST);
    if (!entry) throw notMediaFile();
    manifest = JSON.parse(new TextDecoder().decode(await archive.read(entry)));
  } catch (error) {
    if (error instanceof ZipError || error instanceof SyntaxError) throw notMediaFile();
    throw error;
  }
  if (!manifest || manifest.format !== MEDIA_FORMAT || !Array.isArray(manifest.items)) throw notMediaFile();
  if (!Number.isInteger(manifest.formatVersion) || manifest.formatVersion > MEDIA_FORMAT_VERSION) {
    throw invalid('Plik obrazów i załączników pochodzi z nowszej wersji aplikacji. Zaktualizuj aplikację i spróbuj ponownie.');
  }
  return { manifest, archive };
}

/**
 * Dopisuje do bazy obrazy i załączniki z pliku – tylko te, które opisują notatki w bibliotece
 * i których jeszcze nie ma na urządzeniu. Niczego nie usuwa i nie zmienia notatek, więc
 * przerwanie w połowie niczego nie psuje. Zapis porcjami (do 16 MB na transakcję).
 * Zwraca { images, files, present, unmatched, damaged, missing }: dodane obrazy i załączniki,
 * już obecne, niepasujące do żadnej notatki, uszkodzone oraz wciąż brakujące po przywróceniu.
 */
export async function restoreMedia(library, blob, { onProgress = null } = {}) {
  const { manifest, archive } = await openMediaArchive(blob);
  const index = await library.mediaIndex();
  const report = { images: 0, files: 0, present: 0, unmatched: 0, damaged: 0, missing: 0 };
  let batch = [];
  let batchBytes = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    const added = await library.addMedia(batch);
    report.images += added.images;
    report.files += added.files;
    batch = [];
    batchBytes = 0;
  };
  let done = 0;
  for (const item of manifest.items) {
    onProgress?.(done, manifest.items.length);
    done += 1;
    const target = index.get(item?.id);
    if (!target || target.store !== (item.kind === 'file' ? 'noteFiles' : 'noteImages')) {
      report.unmatched += 1;
      continue;
    }
    if (target.present) {
      report.present += 1;
      continue;
    }
    const entry = typeof item.path === 'string' ? archive.entries.get(item.path) : null;
    let bytes = null;
    try {
      // Suma kontrolna musi się zgadzać z opisem w notatce – to ten sam plik.
      if (entry && (target.meta.crc === null || target.meta.crc === undefined || entry.crc === target.meta.crc)) {
        bytes = await archive.read(entry);
      }
    } catch (error) {
      if (!(error instanceof ZipError)) throw error;
    }
    if (!bytes || bytes.byteLength === 0) {
      report.damaged += 1;
      continue;
    }
    target.present = true;
    // Rysunek bez (albo z uszkodzonymi) kreskami wraca jako zwykły obraz.
    const drawing = item.kind === 'file' ? null : await readDrawing(archive, item.drawing);
    batch.push({ id: item.id, bytes, ...(drawing ? { drawing } : {}) });
    batchBytes += bytes.byteLength;
    if (batchBytes >= MEDIA_BATCH_BYTES) await flush();
  }
  await flush();
  onProgress?.(manifest.items.length, manifest.items.length);
  report.missing = [...index.values()].filter((entry) => !entry.present).length;
  return report;
}

/** Czy plik to archiwum ZIP (plik obrazów i załączników), a nie plik danych JSON. */
export async function isZipFile(blob) {
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5);
}

/** Wczytuje kopię z tekstu JSON (np. zawartości wybranego pliku). */
export function parseBackupText(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw invalid('Nie udało się odczytać pliku. To nie jest poprawny plik kopii zapasowej.');
  }
}
