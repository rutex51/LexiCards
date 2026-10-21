// Magazyn danych w jednym pliku (od 1.30.2): cała zawartość w pamięci (MemoryAdapter), a po każdej
// zmianie – zapis całości („migawki”) przez `sink`. Przygotowanie pod plik danych w folderze OneDrive
// (Windows – plik wskazany raz w przeglądarce, iPhone – aplikacja natywna); sam zapis do pliku robi
// sink, ten moduł go nie zna. Bez przeglądarki – testowany w Node.js.
//
// sink: { read(): Promise<migawka | null>, write(migawka): Promise<void> } – migawka to zwykły obiekt
// gotowy do JSON.stringify (bajty obrazów i załączników jako base64, encodeSnapshot / decodeSnapshot).
// Zapisy idą po kolei. Nieudany zapis: dane w pamięci wracają do stanu z pliku, błąd trafia do
// biblioteki – jak przy nieudanej transakcji IndexedDB (zmiana nie zostaje zapisana).

import { base64ToBytes, bytesToBase64 } from './base64.js';
import { ALL_STORES } from './model.js';
import { MemoryAdapter } from './storage-memory.js';

export const SNAPSHOT_FORMAT = 'lexicards-store';
export const SNAPSHOT_VERSION = 1;

const BYTES = '$bytes';

/** Kopia wartości do JSON: ArrayBuffer i tablice bajtów jako { $bytes: base64 }. */
function encodeValue(value) {
  if (value instanceof ArrayBuffer) return { [BYTES]: bytesToBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) return { [BYTES]: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  return value;
}

/** Odwrotność encodeValue: { $bytes } – ArrayBuffer (tak jak zapisuje biblioteka). */
function decodeValue(value) {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === BYTES && typeof value[BYTES] === 'string') {
      const bytes = base64ToBytes(value[BYTES]);
      if (!bytes) throw new Error('Plik danych jest uszkodzony (bajty obrazu albo załącznika).');
      return bytes;
    }
    return Object.fromEntries(keys.map((key) => [key, decodeValue(value[key])]));
  }
  return value;
}

/** Migawka magazynów { magazyn: [rekordy] } – obiekt do zapisu w pliku. */
export function encodeSnapshot(stores, savedAt = new Date().toISOString()) {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    savedAt,
    stores: Object.fromEntries(ALL_STORES.map((name) => [name, encodeValue(stores[name] ?? [])]))
  };
}

/** Magazyny z migawki; nieznany format albo nowsza wersja – błąd (plik z innej aplikacji albo nowszej wersji). */
export function decodeSnapshot(snapshot) {
  if (!snapshot || snapshot.format !== SNAPSHOT_FORMAT || !snapshot.stores || typeof snapshot.stores !== 'object') {
    throw new Error('To nie jest plik danych LexiCards.');
  }
  if (!(snapshot.version >= 1 && snapshot.version <= SNAPSHOT_VERSION)) {
    throw new Error('Plik danych pochodzi z nowszej wersji aplikacji – zaktualizuj aplikację.');
  }
  return Object.fromEntries(ALL_STORES.map((name) => [name, Array.isArray(snapshot.stores[name]) ? decodeValue(snapshot.stores[name]) : []]));
}

export class SnapshotAdapter {
  constructor(sink, { label = 'Plik danych' } = {}) {
    this.kind = 'snapshot';
    this.label = label;
    // Trwały (plik), ale bez wspólnej bazy kart przeglądarki i bez prośby o ochronę danych.
    this.capabilities = { persistent: true, sharedTabs: false, requestPersistence: false };
    this.sink = sink;
    this.memory = new MemoryAdapter();
    this.queue = Promise.resolve();
  }

  async open() {
    await this.#reload();
  }

  async #reload() {
    const snapshot = await this.sink.read();
    this.memory = new MemoryAdapter();
    if (snapshot) await this.memory.replaceAll(decodeSnapshot(snapshot));
  }

  /** Zmiana w pamięci i zapis całości; kolejne zapisy czekają na poprzedni. */
  #persist(apply) {
    const run = this.queue.then(async () => {
      await apply();
      try {
        await this.sink.write(encodeSnapshot(this.memory.dump()));
      } catch (error) {
        await this.#reload().catch(() => {});
        throw error;
      }
    });
    // Błąd jednego zapisu nie blokuje następnych.
    this.queue = run.catch(() => {});
    return run;
  }

  commit(changes) {
    return this.#persist(() => this.memory.commit(changes));
  }

  replaceAll(data, options) {
    return this.#persist(() => this.memory.replaceAll(data, options));
  }

  loadAll() { return this.memory.loadAll(); }
  readStore(name) { return this.memory.readStore(name); }
  getMany(name, ids) { return this.memory.getMany(name, ids); }
  readByTerm(name, termID) { return this.memory.readByTerm(name, termID); }
  count(name) { return this.memory.count(name); }
  readKeys(name) { return this.memory.readKeys(name); }
}
