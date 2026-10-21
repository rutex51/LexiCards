// Magazyn danych w pamięci (od 1.30.2 osobny moduł): testy, awaryjna praca bez bazy przeglądarki
// i podstawa magazynu w jednym pliku (storage-snapshot.js). Interfejs – w storage.js.

import { ALL_STORES, MEDIA_STORES, MEMORY_STORES, TERM_HISTORY_STORES } from './model.js';

const clone = (value) => structuredClone(value);

/** Identyfikatory, które zostają w magazynie obrazów lub załączników: wskazane i zapisywane. */
export function keptIDs(keep, records = []) {
  return new Set([...keep, ...records.map((record) => record.id)]);
}

export class MemoryAdapter {
  constructor() {
    this.kind = 'memory';
    this.label = 'Tylko pamięć (do zamknięcia karty)';
    this.capabilities = { persistent: false, sharedTabs: false, requestPersistence: false };
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

  /** Rekordy o podanych identyfikatorach (brakujące jako null), w kolejności identyfikatorów. */
  async getMany(name, ids) {
    const store = this.stores.get(name);
    return ids.map((id) => (store.has(id) ? clone(store.get(id)) : null));
  }

  /** Wpisy dziennika dotyczące jednego pojęcia. */
  async readByTerm(name, termID) {
    return [...this.stores.get(name).values()].filter((record) => record.termID === termID).map(clone);
  }

  async count(name) {
    return this.stores.get(name).size;
  }

  /** Identyfikatory wszystkich rekordów magazynu (bez czytania ich treści). */
  async readKeys(name) {
    return [...this.stores.get(name).keys()];
  }

  /** Cała zawartość wszystkich magazynów { magazyn: [rekordy] } – bez kopii (magazyn w jednym pliku ją koduje). */
  dump() {
    return Object.fromEntries(ALL_STORES.map((name) => [name, [...this.stores.get(name).values()]]));
  }

  /** Zastępuje całą zawartość; `keep` – identyfikatory obrazów i załączników, które zostają. */
  async replaceAll(data, { keep = null } = {}) {
    for (const name of ALL_STORES) {
      const store = this.stores.get(name);
      if (keep && MEDIA_STORES.includes(name)) {
        const kept = keptIDs(keep, data[name]);
        for (const id of [...store.keys()]) if (!kept.has(id)) store.delete(id);
      } else {
        store.clear();
      }
      for (const record of data[name] ?? []) store.set(record.id, clone(record));
    }
  }
}
