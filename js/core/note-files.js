// Załączniki notatek (od 1.8): nazwy plików, typy i rodzaje (PDF, Word, Excel, PowerPoint…).
// Bajty załączników są w osobnym magazynie bazy, notatka trzyma tylko ich opis.
// Bez zależności od przeglądarki.

import { collapseWhitespace } from './text.js';

/** Najdłuższa nazwa załącznika (znaki). */
export const FILE_NAME_MAX = 120;
const DEFAULT_NAME = 'Załącznik';
/** Znaki niedozwolone w nazwach plików w Windows (iOS nie pozwala na „/” i „:”). */
const FORBIDDEN = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

const TYPE_BY_EXTENSION = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  mov: 'video/quicktime'
});

/** Rodzaj pliku do ikony i opisu. */
export const FILE_KIND_NAMES = Object.freeze({
  pdf: 'PDF',
  word: 'Dokument Word',
  excel: 'Arkusz Excel',
  powerpoint: 'Prezentacja PowerPoint',
  text: 'Plik tekstowy',
  image: 'Obraz',
  audio: 'Nagranie',
  video: 'Film',
  archive: 'Archiwum ZIP',
  other: 'Plik'
});

const KIND_BY_EXTENSION = Object.freeze({
  pdf: 'pdf',
  doc: 'word', docx: 'word', rtf: 'word', odt: 'word',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', ods: 'excel', csv: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', odp: 'powerpoint',
  txt: 'text', md: 'text',
  zip: 'archive'
});

/** Rozszerzenie nazwy pliku małymi literami („raport.PDF” → „pdf”) albo ''. */
export function fileExtension(name) {
  return /\.([a-z0-9]{1,8})$/i.exec(String(name ?? ''))?.[1]?.toLowerCase() ?? '';
}

/**
 * Nazwa załącznika bez znaków niedozwolonych w nazwach plików (Windows, iOS) i nadmiarowych
 * odstępów, najwyżej 120 znaków (z zachowaniem rozszerzenia). Pusta – „Załącznik”.
 */
export function cleanFileName(name) {
  const allowed = [...String(name ?? '')].map((char) => (char.charCodeAt(0) < 32 || char === '\u007f' || FORBIDDEN.has(char) ? ' ' : char));
  let clean = collapseWhitespace(allowed.join('')).replace(/^\.+/, '').trim();
  if (clean.length > FILE_NAME_MAX) {
    const extension = fileExtension(clean);
    const tail = extension ? `.${extension}` : '';
    clean = `${clean.slice(0, FILE_NAME_MAX - tail.length).trim()}${tail}`;
  }
  return clean === '' ? DEFAULT_NAME : clean;
}

/** Typ MIME załącznika: podany przez przeglądarkę, a gdy go brak – według rozszerzenia. */
export function fileTypeOf(name, type = '') {
  const given = String(type ?? '').trim().toLowerCase();
  if (given !== '' && given !== 'application/octet-stream') return given;
  return TYPE_BY_EXTENSION[fileExtension(name)] ?? 'application/octet-stream';
}

/** Rodzaj pliku: 'pdf' | 'word' | 'excel' | 'powerpoint' | 'text' | 'image' | 'audio' | 'video' | 'archive' | 'other'. */
export function fileKind(name, type = '') {
  const byExtension = KIND_BY_EXTENSION[fileExtension(name)];
  if (byExtension) return byExtension;
  const mime = fileTypeOf(name, type);
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}

/**
 * Nowa nazwa załącznika po zmianie przez użytkownika: oczyszczona, a gdy zgubiono rozszerzenie
 * pierwotnej nazwy – dopisane z powrotem (inaczej system nie wiedziałby, czym otworzyć plik).
 */
export function renamedFile(original, wanted) {
  const extension = fileExtension(original);
  let name = cleanFileName(wanted);
  if (extension && fileExtension(name) !== extension) name = cleanFileName(`${name}.${extension}`);
  return name;
}

/** Przeglądarka na komputerze pokaże plik sama (w nowej karcie): PDF, obrazy, tekst, nagrania. */
export function opensInBrowser(name, type = '') {
  return ['pdf', 'image', 'text', 'audio', 'video'].includes(fileKind(name, type)) && fileExtension(name) !== 'csv';
}
