// Zajęte miejsce (od 1.45.2) – bez ekranu: aplikacja (pliki do pracy offline w pamięci podręcznej przeglądarki),
// dane (materiały, notatki, postępy i ustawienia – w przybliżeniu jak plik danych kopii zapasowej) oraz obrazy
// i załączniki notatek; przeglądarka podaje też swój szacunek zajętego miejsca i limit dla aplikacji.

/** Przedrostek pamięci podręcznej aplikacji (sw.js: `lexicards-<wydanie>`). */
export const APP_CACHE_PREFIX = 'lexicards-';

/**
 * Rozmiar plików aplikacji w pamięci podręcznej (bajty) albo null – brak pamięci podręcznej (np. aplikacja
 * nie zapisała się jeszcze do pracy offline). W trakcie aktualizacji – stare i nowe wydanie razem.
 */
export async function appFilesSize(cacheStorage = globalThis.caches, prefix = APP_CACHE_PREFIX) {
  if (!cacheStorage?.keys) return null;
  const names = (await cacheStorage.keys()).filter((name) => name.startsWith(prefix));
  if (names.length === 0) return null;
  let total = 0;
  for (const name of names) {
    const cache = await cacheStorage.open(name);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (response) total += (await response.blob()).size;
    }
  }
  return total;
}

/** Rozmiar danych bez obrazów i załączników (bajty tekstu UTF-8 – jak plik danych kopii zapasowej). */
export async function dataSize(library) {
  const data = await library.exportAll({ media: false });
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

/**
 * Zajęte miejsce: { app – pliki aplikacji albo null, data – dane, media – { images, files, size } obrazów
 * i załączników, total – suma, browser – zajęte według przeglądarki albo null, quota – limit albo null }.
 */
export async function measureUsage({ library, cacheStorage = globalThis.caches, storage = globalThis.navigator?.storage } = {}) {
  const [app, data, estimate] = await Promise.all([
    appFilesSize(cacheStorage).catch(() => null),
    dataSize(library),
    storage?.estimate ? storage.estimate().catch(() => null) : null
  ]);
  const media = library.mediaSummary();
  return {
    app, data, media,
    total: (app ?? 0) + data + media.size,
    browser: Number.isFinite(estimate?.usage) ? estimate.usage : null,
    quota: Number.isFinite(estimate?.quota) && estimate.quota > 0 ? estimate.quota : null
  };
}
