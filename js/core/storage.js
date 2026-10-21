// Magazyn danych (od 1.30.2 wydzielony). Biblioteka (library.js) trzyma dane w pamięci, a każdą
// zmianę utrwala jedną niepodzielną transakcją przez adapter – zna tylko interfejs poniżej, więc
// miejsce zapisu można zmienić bez zmian w bibliotece i ekranach. Adaptery:
//   MemoryAdapter   (storage-memory.js)   – testy i awaryjna praca bez bazy przeglądarki,
//   IdbAdapter      (storage-idb.js)      – IndexedDB w przeglądarce (domyślny),
//   SnapshotAdapter (storage-snapshot.js) – całość w jednym pliku przez `sink` (przyszły plik
//                                           danych w OneDrive: Windows, aplikacja na iPhone'a).
//
// Interfejs adaptera (wszystkie metody asynchroniczne, rekordy – kopie, nie obiekty adaptera):
//   open()                       – przygotowanie (otwarcie bazy, wczytanie pliku),
//   loadAll()                    – { magazyn: [rekordy] } magazynów trzymanych w pamięci (MEMORY_STORES),
//   commit(changes)              – zmiany w całości albo wcale (postać – niżej),
//   readStore(name)              – wszystkie rekordy magazynu,
//   getMany(name, ids)           – rekordy o podanych identyfikatorach (brakujące – null), w tej kolejności,
//   readByTerm(name, termID)     – wpisy dziennika jednego pojęcia (TERM_HISTORY_STORES),
//   count(name), readKeys(name)  – liczba i identyfikatory rekordów,
//   replaceAll(data, { keep })   – cała zawartość od nowa (kopia zapasowa); keep – zostające obrazy
//                                  i załączniki (przywrócenie samych danych).
// Pola: kind (nazwa), label (miejsce zapisu dla użytkownika), capabilities { persistent – dane
// zostają po zamknięciu, sharedTabs – inne karty widzą ten sam magazyn, requestPersistence –
// przeglądarkę można poprosić o ochronę danych }.
//
// Postać zmian przekazywanych do commit():
//   puts:         { magazyn: [rekordy] }  – zapis lub nadpisanie
//   deletes:      { magazyn: [id] }       – usunięcie
//   purgeTermIDs: [id pojęć]              – usunięcie dzienników nauki tych pojęć
//   clear:        [magazyny]              – wyczyszczenie całych magazynów

import { IdbAdapter } from './storage-idb.js';
import { MemoryAdapter } from './storage-memory.js';

export { DB_NAME, DB_VERSION, IdbAdapter } from './storage-idb.js';
export { MemoryAdapter } from './storage-memory.js';
export { SNAPSHOT_FORMAT, SNAPSHOT_VERSION, SnapshotAdapter, decodeSnapshot, encodeSnapshot } from './storage-snapshot.js';

export const ADAPTER_METHODS = Object.freeze(['open', 'loadAll', 'commit', 'readStore', 'getMany', 'readByTerm', 'count', 'readKeys', 'replaceAll']);

export function emptyChanges() {
  return { puts: {}, deletes: {}, purgeTermIDs: [], clear: [] };
}

/** Sprawdza, czy obiekt ma interfejs adaptera (nowy adapter – błąd od razu, nie przy pierwszym zapisie). */
export function assertAdapter(adapter) {
  const missing = ADAPTER_METHODS.filter((name) => typeof adapter?.[name] !== 'function');
  if (missing.length > 0) throw new Error(`Magazyn danych bez metod: ${missing.join(', ')}.`);
  const capabilities = adapter.capabilities;
  if (!capabilities || typeof capabilities.persistent !== 'boolean' || typeof adapter.label !== 'string') {
    throw new Error('Magazyn danych bez opisu (label, capabilities).');
  }
  return adapter;
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
