// Kolejność list biblioteki (od 1.16): ręczna (ustalona przez użytkownika – przeciąganiem albo
// strzałkami), alfabetyczna od A albo od Z, a dla modułów i lekcji także według daty utworzenia.
// Wybór jest w ustawieniach (`listSort`: { domain, module, lesson }) – osobno dla każdego poziomu.

/** Rodzaje kolejności na poziomach biblioteki (dziedziny nie pokazują daty utworzenia – bez sortowania po dacie). */
export const LIST_SORTS = Object.freeze({
  domain: Object.freeze(['manual', 'name', 'name-desc']),
  module: Object.freeze(['manual', 'name', 'name-desc', 'newest', 'oldest']),
  lesson: Object.freeze(['manual', 'name', 'name-desc', 'newest', 'oldest'])
});
export const SORT_LABELS = Object.freeze({
  manual: 'Ręcznie', name: 'Nazwa A–Z', 'name-desc': 'Nazwa Z–A', newest: 'Od najnowszych', oldest: 'Od najstarszych'
});
/** Krótki opis przy tytule listy. */
export const SORT_SHORT = Object.freeze({
  manual: 'Ręcznie', name: 'A–Z', 'name-desc': 'Z–A', newest: 'Najnowsze', oldest: 'Najstarsze'
});

export const defaultListSort = () => ({ domain: 'manual', module: 'manual', lesson: 'manual' });

/** Kolejność listy danego poziomu z ustawień (nieznana albo brak – ręczna). */
export function listSortOf(settings, level) {
  const value = settings?.listSort?.[level];
  return LIST_SORTS[level]?.includes(value) ? value : 'manual';
}

// Porównanie po polsku, liczby jak liczby („Test 2” przed „Test 10”), bez rozróżniania wielkości liter.
const collator = new Intl.Collator('pl', { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name ?? '', b.name ?? '');
const byManual = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
const created = (item) => item.createdAt ?? '';

/**
 * Elementy w wybranej kolejności (nowa tablica). Ręczna – kolejność ustalona przez użytkownika
 * (sortOrder); przy równych nazwach albo datach decyduje kolejność ręczna.
 */
export function sortItems(items, sort) {
  const list = [...items];
  switch (sort) {
    case 'name': return list.sort((a, b) => byName(a, b) || byManual(a, b));
    case 'name-desc': return list.sort((a, b) => byName(b, a) || byManual(a, b));
    case 'newest': return list.sort((a, b) => (created(a) < created(b) ? 1 : created(a) > created(b) ? -1 : 0) || byName(a, b) || byManual(a, b));
    case 'oldest': return list.sort((a, b) => (created(a) < created(b) ? -1 : created(a) > created(b) ? 1 : 0) || byName(a, b) || byManual(a, b));
    default: return list.sort(byManual);
  }
}

/** Nowa kolejność identyfikatorów po przeniesieniu elementu z miejsca `from` na miejsce `to`. */
export function movedOrder(ids, from, to) {
  const order = [...ids];
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  return order;
}
