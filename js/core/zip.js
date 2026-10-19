// Minimalny odczyt i zapis archiwów ZIP – tyle, ile potrzeba plikom XLSX i plikowi obrazów
// i załączników kopii zapasowej. Kompresję i dekompresję wykonuje przeglądarka
// (CompressionStream / DecompressionStream), więc moduł nie ma zależności i działa tak samo
// w Node.js. Duże archiwa są zapisywane i czytane kawałkami przez Blob – bez trzymania całego
// pliku w pamięci.

const SIGNATURE_END = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_LOCAL = 0x04034b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** Największy pojedynczy plik w archiwum, jaki zgadzamy się rozpakować (ochrona przed „bombą”). */
const MAX_ENTRY_SIZE = 256 * 1024 * 1024;
/** Granica formatu ZIP bez rozszerzenia ZIP64: 4 GB na archiwum i 65 535 plików. */
const MAX_ZIP_OFFSET = 0xffffffff;
const MAX_ZIP_ENTRIES = 0xffff;

export class ZipError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZipError';
  }
}

// ---------------------------------------------------------------- suma kontrolna

let crcTable = null;

export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------- kompresja

async function pipeThrough(data, transform) {
  const stream = new Blob([data]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function canInflate() {
  return typeof DecompressionStream === 'function';
}

async function inflateRaw(data) {
  if (!canInflate()) {
    throw new ZipError('Ta przeglądarka nie potrafi rozpakować pliku. Zaktualizuj system albo zapisz plik jako CSV.');
  }
  try {
    return await pipeThrough(data, new DecompressionStream('deflate-raw'));
  } catch {
    throw new ZipError('Plik jest uszkodzony – nie udało się go rozpakować.');
  }
}

async function deflateRaw(data) {
  return pipeThrough(data, new CompressionStream('deflate-raw'));
}

// ---------------------------------------------------------------- odczyt

function findEndRecord(view) {
  // Rekord końcowy leży na końcu pliku; może go poprzedzać komentarz (do 65 535 bajtów).
  const lowest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= lowest; offset -= 1) {
    if (view.getUint32(offset, true) === SIGNATURE_END) return offset;
  }
  return -1;
}

/** Położenie i wielkość spisu treści z rekordu końcowego. */
function endRecordInfo(view, end) {
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff) {
    throw new ZipError('Plik jest zbyt duży (format ZIP64 nie jest obsługiwany).');
  }
  return { count, directorySize, directoryOffset };
}

/**
 * Czyta spis treści archiwum. Zwraca Map: nazwa pliku → opis wpisu.
 * Zgłasza ZipError, gdy dane nie są archiwum ZIP.
 */
export function readZipDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 22) throw new ZipError('To nie jest archiwum ZIP.');
  const end = findEndRecord(view);
  if (end < 0) throw new ZipError('To nie jest archiwum ZIP.');
  const { count, directorySize, directoryOffset } = endRecordInfo(view, end);
  if (directoryOffset + directorySize > end) throw new ZipError('Archiwum jest uszkodzone.');
  return parseDirectory(bytes.subarray(directoryOffset, directoryOffset + directorySize), count);
}

/** Wpisy spisu treści (`directory` – sam spis treści, `count` – liczba wpisów). */
function parseDirectory(bytes, count) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8');
  const entries = new Map();
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== SIGNATURE_CENTRAL) {
      throw new ZipError('Archiwum jest uszkodzone.');
    }
    const flags = view.getUint16(offset + 8, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, {
      name,
      encrypted: (flags & 1) === 1,
      method: view.getUint16(offset + 10, true),
      crc: view.getUint32(offset + 16, true),
      compressedSize: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      localOffset: view.getUint32(offset + 42, true)
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function checkEntry(entry) {
  if (entry.encrypted) throw new ZipError('Plik jest zabezpieczony hasłem.');
  if (entry.size > MAX_ENTRY_SIZE) throw new ZipError('Plik jest zbyt duży.');
}

/** Początek danych wpisu za nagłówkiem lokalnym (`header` – 30 bajtów od `entry.localOffset`). */
function dataStart(header, entry) {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header.byteLength < 30 || view.getUint32(0, true) !== SIGNATURE_LOCAL) {
    throw new ZipError('Archiwum jest uszkodzone.');
  }
  return entry.localOffset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
}

/** Rozpakowuje jeden plik z archiwum i sprawdza jego sumę kontrolną. */
export async function readZipEntry(bytes, entry) {
  checkEntry(entry);
  const start = dataStart(bytes.subarray(entry.localOffset, entry.localOffset + 30), entry);
  const compressed = bytes.subarray(start, start + entry.compressedSize);
  if (compressed.byteLength !== entry.compressedSize) throw new ZipError('Archiwum jest uszkodzone.');
  return unpack(compressed, entry);
}

async function unpack(compressed, entry) {
  let data;
  if (entry.method === METHOD_STORED) data = compressed;
  else if (entry.method === METHOD_DEFLATE) data = await inflateRaw(compressed);
  else throw new ZipError('Archiwum używa nieobsługiwanej metody kompresji.');

  if (data.byteLength !== entry.size || crc32(data) !== entry.crc) {
    throw new ZipError('Plik jest uszkodzony (niezgodna suma kontrolna).');
  }
  return data;
}

async function blobBytes(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/**
 * Otwiera archiwum z pliku (Blob) bez wczytywania go w całości: czyta tylko spis treści,
 * a każdy plik dopiero na żądanie. Zwraca { entries: Map, read(entry) → Uint8Array }.
 */
export async function openZipBlob(blob) {
  if (blob.size < 22) throw new ZipError('To nie jest archiwum ZIP.');
  const tailStart = Math.max(0, blob.size - 22 - 0xffff);
  const tail = await blobBytes(blob, tailStart, blob.size);
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const end = findEndRecord(view);
  if (end < 0) throw new ZipError('To nie jest archiwum ZIP.');
  const { count, directorySize, directoryOffset } = endRecordInfo(view, end);
  if (directoryOffset + directorySize > tailStart + end) throw new ZipError('Archiwum jest uszkodzone.');
  const entries = parseDirectory(await blobBytes(blob, directoryOffset, directoryOffset + directorySize), count);
  return {
    entries,
    async read(entry) {
      checkEntry(entry);
      const start = dataStart(await blobBytes(blob, entry.localOffset, entry.localOffset + 30), entry);
      const compressed = await blobBytes(blob, start, start + entry.compressedSize);
      if (compressed.byteLength !== entry.compressedSize) throw new ZipError('Archiwum jest uszkodzone.');
      return unpack(compressed, entry);
    }
  };
}

// ---------------------------------------------------------------- zapis

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

/**
 * Zapis archiwum plik po pliku. Każdy dodany plik trafia od razu do Bloba, więc jego bajty nie
 * muszą zostawać w pamięci do końca (ważne przy dużym pliku obrazów i załączników).
 * add({ name, data: Uint8Array, stored }) – `stored: true` bez kompresji (obrazy PNG i JPEG,
 * PDF, pliki Office są już skompresowane); finish(type) → Blob.
 */
export class ZipWriter {
  constructor({ date = new Date() } = {}) {
    this.stamp = dosDateTime(date);
    this.encoder = new TextEncoder();
    this.parts = [];
    this.central = [];
    this.offset = 0;
    this.count = 0;
  }

  async add(file) {
    const name = this.encoder.encode(file.name);
    let method = METHOD_STORED;
    let body = file.data;
    if (typeof CompressionStream === 'function' && !file.stored && file.data.byteLength > 64) {
      const deflated = await deflateRaw(file.data);
      if (deflated.byteLength < file.data.byteLength) {
        method = METHOD_DEFLATE;
        body = deflated;
      }
    }
    const crc = crc32(file.data);
    const size = 30 + name.byteLength + body.byteLength;
    if (this.count + 1 >= MAX_ZIP_ENTRIES || this.offset + size >= MAX_ZIP_OFFSET) {
      throw new ZipError('Plik byłby zbyt duży (ponad 4 GB albo ponad 65 tysięcy plików).');
    }

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, SIGNATURE_LOCAL, true);
    local.setUint16(4, 20, true);        // wersja potrzebna do rozpakowania
    local.setUint16(6, 0x0800, true);    // nazwy w UTF-8
    local.setUint16(8, method, true);
    local.setUint16(10, this.stamp.time, true);
    local.setUint16(12, this.stamp.date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.byteLength, true);
    local.setUint32(22, file.data.byteLength, true);
    local.setUint16(26, name.byteLength, true);
    local.setUint16(28, 0, true);
    this.parts.push(new Blob([local.buffer, name, body]));

    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, SIGNATURE_CENTRAL, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x0800, true);
    record.setUint16(10, method, true);
    record.setUint16(12, this.stamp.time, true);
    record.setUint16(14, this.stamp.date, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, body.byteLength, true);
    record.setUint32(24, file.data.byteLength, true);
    record.setUint16(28, name.byteLength, true);
    record.setUint32(42, this.offset, true);
    this.central.push(new Uint8Array(record.buffer), name);

    this.offset += size;
    this.count += 1;
  }

  /** Kończy archiwum (spis treści i rekord końcowy). */
  finish(type = 'application/zip') {
    const centralSize = this.central.reduce((sum, part) => sum + part.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, SIGNATURE_END, true);
    end.setUint16(8, this.count, true);
    end.setUint16(10, this.count, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...this.central, new Uint8Array(end.buffer)], { type });
  }
}

/**
 * Tworzy archiwum ZIP w pamięci. files: [{ name, data: Uint8Array, stored }].
 * Dane są kompresowane, gdy środowisko to umożliwia; w przeciwnym razie zapisywane wprost.
 * `stored: true` – bez kompresji (obrazy PNG i JPEG są już skompresowane).
 */
export async function createZip(files, { date = new Date() } = {}) {
  const writer = new ZipWriter({ date });
  for (const file of files) await writer.add(file);
  return new Uint8Array(await writer.finish().arrayBuffer());
}
