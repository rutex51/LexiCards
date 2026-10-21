// Umowa magazynu danych (od 1.30.2): te same sprawdzenia dla każdego adaptera z js/core/storage.js –
// w Node.js (pamięć, jeden plik) i w przeglądarce (IndexedDB, test e2e). Bez node:assert, żeby moduł
// działał też w przeglądarce. makeAdapter() – nowy, pusty, jeszcze nie otwarty adapter.

function check(condition, message) {
  if (!condition) throw new Error(`Umowa magazynu: ${message}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byID = (records) => [...records].sort((a, b) => (a.id < b.id ? -1 : 1));
const bytesOf = (value) => [...new Uint8Array(value)];

/** Uruchamia wszystkie sprawdzenia; zwraca liczbę sprawdzonych przypadków. */
export async function runStorageContract(makeAdapter) {
  let cases = 0;
  const adapter = await makeAdapter();
  await adapter.open();
  check(typeof adapter.label === 'string' && typeof adapter.capabilities?.persistent === 'boolean', 'opis magazynu (label, capabilities)');

  // Zapis, odczyt w pamięci i na żądanie.
  const domain = { id: 'd1', name: 'Dziedzina' };
  const terms = [{ id: 't1', lessonID: 'l1', termPL: 'płynność' }, { id: 't2', lessonID: 'l1', termPL: 'dźwignia' }];
  const reviews = [{ id: 'r1', termID: 't1', at: 1 }, { id: 'r2', termID: 't2', at: 2 }, { id: 'r3', termID: 't1', at: 3 }];
  const image = { id: 'img1', lessonID: 'l1', type: 'image/png', bytes: new Uint8Array([137, 80, 78, 71, 0, 255]).buffer };
  await adapter.commit({ puts: { domains: [domain], terms, reviews, noteImages: [image] }, deletes: {}, purgeTermIDs: [], clear: [] });
  const all = await adapter.loadAll();
  check(same(all.domains, [domain]) && same(byID(all.terms), terms), 'loadAll zwraca zapisane rekordy');
  check(!('reviews' in all) && !('noteImages' in all), 'loadAll – tylko magazyny w pamięci');
  cases += 1;
  check(same(byID(await adapter.readStore('reviews')), reviews), 'readStore');
  check(same(byID(await adapter.readByTerm('reviews', 't1')), [reviews[0], reviews[2]]), 'readByTerm');
  check((await adapter.count('reviews')) === 3 && same((await adapter.readKeys('terms')).sort(), ['t1', 't2']), 'count i readKeys');
  const [stored, missing] = await adapter.getMany('noteImages', ['img1', 'brak']);
  check(missing === null && same(bytesOf(stored.bytes), [137, 80, 78, 71, 0, 255]), 'getMany – bajty obrazu i brakujący rekord');
  cases += 1;

  // Odczyt to kopia – zmiana zwróconego rekordu nie zmienia magazynu.
  const [copy] = (await adapter.loadAll()).domains;
  copy.name = 'zmieniona';
  check((await adapter.loadAll()).domains[0].name === 'Dziedzina', 'rekordy są kopiami');
  cases += 1;

  // Nadpisanie, usunięcie, dzienniki usuniętego pojęcia, wyczyszczenie magazynu.
  await adapter.commit({ puts: { domains: [{ ...domain, name: 'Nowa' }] }, deletes: { terms: ['t1'] }, purgeTermIDs: ['t1'], clear: [] });
  check((await adapter.loadAll()).domains[0].name === 'Nowa', 'nadpisanie');
  check(same((await adapter.readKeys('terms')), ['t2']), 'usunięcie');
  check(same((await adapter.readStore('reviews')).map((record) => record.id), ['r2']), 'purgeTermIDs usuwa dzienniki pojęcia');
  await adapter.commit({ puts: {}, deletes: {}, purgeTermIDs: [], clear: ['domains'] });
  check((await adapter.count('domains')) === 0, 'clear');
  cases += 1;

  // Pusta zmiana nic nie psuje.
  await adapter.commit({ puts: {}, deletes: {}, purgeTermIDs: [], clear: [] });
  check((await adapter.count('terms')) === 1, 'pusta zmiana');
  cases += 1;

  // Całość od nowa; keep – zostające obrazy i załączniki.
  const second = { id: 'img2', lessonID: 'l2', type: 'image/png', bytes: new Uint8Array([1, 2, 3]).buffer };
  await adapter.commit({ puts: { noteImages: [second] }, deletes: {}, purgeTermIDs: [], clear: [] });
  await adapter.replaceAll({ domains: [{ id: 'd9', name: 'Z kopii' }], terms: [] }, { keep: ['img2'] });
  check(same((await adapter.loadAll()).domains, [{ id: 'd9', name: 'Z kopii' }]) && (await adapter.count('terms')) === 0, 'replaceAll – dane');
  check(same(await adapter.readKeys('noteImages'), ['img2']) && (await adapter.count('reviews')) === 0, 'replaceAll z keep – zostaje wskazany obraz');
  await adapter.replaceAll({ domains: [] });
  check((await adapter.count('noteImages')) === 0, 'replaceAll bez keep – wszystko od nowa');
  cases += 1;
  return cases;
}
