// Magazyn danych w IndexedDB przeglądarki (od 1.30.2 osobny moduł). Interfejs – w storage.js.

import { ALL_STORES, MEDIA_STORES, MEMORY_STORES, TERM_HISTORY_STORES } from './model.js';
import { keptIDs } from './storage-memory.js';

export const DB_NAME = 'lexicards';
/**
 * 2 – notatki lekcji i ich obrazy (wersja 1.1), 3 – załączniki notatek (wersja 1.8).
 * Brakujące magazyny powstają przy otwarciu.
 */
export const DB_VERSION = 3;

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
    this.label = 'Ta przeglądarka';
    // Zapis trwały, ta sama baza we wszystkich kartach, przeglądarkę można poprosić o ochronę danych.
    this.capabilities = { persistent: true, sharedTabs: true, requestPersistence: true };
    this.name = name;
    this.db = null;
  }

  async open() {
    const request = indexedDB.open(this.name, DB_VERSION);
    // Starsza wersja aplikacji otwarta w innej karcie zamyka połączenie (onversionchange);
    // gdyby tego nie zrobiła, otwarcie czeka – wtedy podpowiadamy, co zrobić.
    request.onblocked = () => console.warn('Baza danych czeka na zamknięcie starszej wersji aplikacji w innej karcie.');
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

  /** Rekordy o podanych identyfikatorach (brakujące jako null), w kolejności identyfikatorów. */
  async getMany(name, ids) {
    if (ids.length === 0) return [];
    const transaction = this.db.transaction([name], 'readonly');
    const store = transaction.objectStore(name);
    const records = await Promise.all(ids.map((id) => requestToPromise(store.get(id))));
    return records.map((record) => record ?? null);
  }

  /** Wpisy dziennika dotyczące jednego pojęcia (przez indeks, bez czytania całego magazynu). */
  async readByTerm(name, termID) {
    const transaction = this.db.transaction([name], 'readonly');
    return requestToPromise(transaction.objectStore(name).index('termID').getAll(IDBKeyRange.only(termID)));
  }

  async count(name) {
    const transaction = this.db.transaction([name], 'readonly');
    return requestToPromise(transaction.objectStore(name).count());
  }

  /** Identyfikatory wszystkich rekordów magazynu (bez czytania ich treści). */
  async readKeys(name) {
    const transaction = this.db.transaction([name], 'readonly');
    return requestToPromise(transaction.objectStore(name).getAllKeys());
  }

  /**
   * Zastępuje całą zawartość bazy (przywracanie kopii zapasowej). `keep` – identyfikatory
   * obrazów i załączników, które zostają w bazie (przywrócenie samych danych); pozostałe znikają.
   */
  async replaceAll(data, { keep = null } = {}) {
    const transaction = this.db.transaction(ALL_STORES, 'readwrite');
    const done = transactionDone(transaction);
    for (const name of ALL_STORES) {
      const store = transaction.objectStore(name);
      if (keep && MEDIA_STORES.includes(name)) {
        // Usunięcia przychodzą po zapisach poniżej – zapisywane rekordy też są na liście zostających.
        const kept = keptIDs(keep, data[name]);
        const keysRequest = store.getAllKeys();
        keysRequest.onsuccess = () => {
          for (const key of keysRequest.result) if (!kept.has(key)) store.delete(key);
        };
      } else {
        store.clear();
      }
      for (const record of data[name] ?? []) store.put(record);
    }
    await done;
  }
}
