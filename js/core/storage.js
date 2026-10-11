// Warstwa zapisu. Biblioteka trzyma dane w pamięci, a każdą zmianę utrwala jedną
// niepodzielną transakcją przez adapter. Dwa adaptery mają ten sam interfejs:
//   MemoryAdapter – testy i awaryjna praca bez bazy przeglądarki,
//   IdbAdapter    – IndexedDB w przeglądarce.
//
// Postać zmian przekazywanych do commit():
//   puts:         { magazyn: [rekordy] }  – zapis lub nadpisanie
//   deletes:      { magazyn: [id] }       – usunięcie
//   purgeTermIDs: [id pojęć]              – usunięcie dzienników nauki tych pojęć
//   clear:        [magazyny]              – wyczyszczenie całych magazynów

import { ALL_STORES, MEMORY_STORES, TERM_HISTORY_STORES } from './model.js';

export const DB_NAME = 'lexicards';
export const DB_VERSION = 1;

export function emptyChanges() {
  return { puts: {}, deletes: {}, purgeTermIDs: [], clear: [] };
}

function clone(value) {
  return structuredClone(value);
}

// ---------------------------------------------------------------- pamięć

export class MemoryAdapter {
  constructor() {
    this.kind = 'memory';
    this.stores = new Map(ALL_STORES.map((name) => [name, new Map()]));
    /** Testy: ustaw, aby najbliższy zapis zakończył się błędem. */
    this.failNextCommit = null;
  }

  async open() {}

  async loadAll() {
    const result = {};
    for (const name of MEMORY_STORES) {
      result[name] = [...this.stores.get(name).values()].map(clone);
    }
    return result;
  }

  async commit(changes) {
    if (this.failNextCommit) {
      const error = this.failNextCommit;
      this.failNextCommit = null;
      throw error;
    }
    for (const name of changes.clear ?? []) {
      this.stores.get(name).clear();
    }
    for (const [name, records] of Object.entries(changes.puts ?? {})) {
      const store = this.stores.get(name);
      for (const record of records) store.set(record.id, clone(record));
    }
    for (const [name, ids] of Object.entries(changes.deletes ?? {})) {
      const store = this.stores.get(name);
      for (const id of ids) store.delete(id);
    }
    const purge = new Set(changes.purgeTermIDs ?? []);
    if (purge.size > 0) {
      for (const name of TERM_HISTORY_STORES) {
        const store = this.stores.get(name);
        for (const [id, record] of store) {
          if (purge.has(record.termID)) store.delete(id);
        }
      }
    }
  }

  async readStore(name) {
    return [...this.stores.get(name).values()].map(clone);
  }

  async count(name) {
    return this.stores.get(name).size;
  }

  async replaceAll(data) {
    for (const name of ALL_STORES) {
      const store = this.stores.get(name);
      store.clear();
      for (const record of data[name] ?? []) store.set(record.id, clone(record));
    }
  }
}

// ---------------------------------------------------------------- IndexedDB

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transakcja została przerwana.'));
  });
}

export class IdbAdapter {
  constructor(name = DB_NAME) {
    this.kind = 'indexeddb';
    this.name = name;
    this.db = null;
  }

  async open() {
    const request = indexedDB.open(this.name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ALL_STORES) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: 'id' });
        if (TERM_HISTORY_STORES.includes(name)) {
          store.createIndex('termID', 'termID', { unique: false });
        }
      }
    };
    this.db = await requestToPromise(request);
    // Inna karta otworzyła nowszą wersję bazy – zwalniamy połączenie, żeby jej nie blokować.
    this.db.onversionchange = () => this.db.close();
  }

  async loadAll() {
    const transaction = this.db.transaction(MEMORY_STORES, 'readonly');
    const requests = MEMORY_STORES.map((name) => requestToPromise(transaction.objectStore(name).getAll()));
    const lists = await Promise.all(requests);
    const result = {};
    MEMORY_STORES.forEach((name, index) => {
      result[name] = lists[index];
    });
    return result;
  }

  async commit(changes) {
    const names = new Set([
      ...Object.keys(changes.puts ?? {}),
      ...Object.keys(changes.deletes ?? {}),
      ...(changes.clear ?? [])
    ]);
    const purge = changes.purgeTermIDs ?? [];
    if (purge.length > 0) {
      for (const name of TERM_HISTORY_STORES) names.add(name);
    }
    if (names.size === 0) return;

    const transaction = this.db.transaction([...names], 'readwrite');
    const done = transactionDone(transaction);

    // Wszystkie żądania zlecamy synchronicznie; transakcja zatwierdza się sama po ich
    // wykonaniu albo w całości wycofuje przy pierwszym błędzie.
    for (const name of changes.clear ?? []) {
      transaction.objectStore(name).clear();
    }
    for (const [name, records] of Object.entries(changes.puts ?? {})) {
      const store = transaction.objectStore(name);
      for (const record of records) store.put(record);
    }
    for (const [name, ids] of Object.entries(changes.deletes ?? {})) {
      const store = transaction.objectStore(name);
      for (const id of ids) store.delete(id);
    }
    if (purge.length > 0) {
      for (const name of TERM_HISTORY_STORES) {
        const store = transaction.objectStore(name);
        const index = store.index('termID');
        for (const termID of purge) {
          const keysRequest = index.getAllKeys(IDBKeyRange.only(termID));
          keysRequest.onsuccess = () => {
            for (const key of keysRequest.result) store.delete(key);
          };
        }
      }
    }
    await done;
  }

  async readStore(name) {
    const transaction = this.db.transaction([name], 'readonly');
    return requestToPromise(transaction.objectStore(name).getAll());
  }

  async count(name) {
    const transaction = this.db.transaction([name], 'readonly');
    return requestToPromise(transaction.objectStore(name).count());
  }

  /** Zastępuje całą zawartość bazy (przywracanie kopii zapasowej). */
  async replaceAll(data) {
    const transaction = this.db.transaction(ALL_STORES, 'readwrite');
    const done = transactionDone(transaction);
    for (const name of ALL_STORES) {
      const store = transaction.objectStore(name);
      store.clear();
      for (const record of data[name] ?? []) store.put(record);
    }
    await done;
  }
}

/**
 * Otwiera bazę przeglądarki; gdy jest niedostępna (np. zablokowana w ustawieniach),
 * zwraca adapter pamięciowy, a aplikacja ostrzega, że dane nie zostaną zachowane.
 */
export async function openDefaultAdapter() {
  if (typeof indexedDB !== 'undefined') {
    try {
      const adapter = new IdbAdapter();
      await adapter.open();
      return adapter;
    } catch (error) {
      console.warn('IndexedDB niedostępne, praca w pamięci:', error);
    }
  }
  const fallback = new MemoryAdapter();
  await fallback.open();
  return fallback;
}
