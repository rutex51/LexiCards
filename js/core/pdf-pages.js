// Podział złożonej notatki na strony PDF (od 1.28). Notatkę składa przeglądarka jednym ciągiem
// (szerokość strony A4), a ten moduł wybiera miejsca cięcia – tylko w odstępach między
// fragmentami, których nie dzielimy: wierszami tekstu, obrazami z podpisem, wierszami tabel,
// wzorami w osobnym wierszu. Odstęp na górze nowej strony znika (strona zaczyna się od treści).
//
// Zasady (jak przy druku):
//   - „Nowa strona” z notatki zawsze zaczyna stronę;
//   - nagłówek, podpis tabeli i wiersz nagłówka tabeli nie zostają same na dole strony;
//   - akapit nie zostawia pierwszego wiersza samego na dole ani ostatniego samego na górze strony;
//   - tabela dzielona po wierszach – wiersz nagłówka powtarza się na następnej stronie;
//   - fragment wyższy niż strona (np. bardzo wysoki wiersz tabeli) – cięcie między wierszami tekstu
//     w jego środku, a gdy ich nie ma – na dole strony.
//
// Moduł nie zależy od przeglądarki.

const EPS = 0.5;

/**
 * Fragmenty → strony. atoms: [{ top, bottom, keep?, group?, first?, last?, header? }] (punkty
 * od góry układu): keep – nie kończyć strony zaraz za nim; group, first, last – wiersze jednego
 * akapitu (pierwszy, ostatni); header – { top, bottom } wiersza nagłówka tabeli, do powtórzenia.
 * breaks – miejsca „Nowej strony” (y), height – wysokość treści strony.
 * Zwraca [{ top, bottom, clipTop, clipBottom, header }] – fragment układu na stronie (od górnej
 * krawędzi pierwszego fragmentu do dolnej ostatniego), granice przycięcia (do połowy odstępów do
 * sąsiadów, 1–2 pt) i nagłówek tabeli do powtórzenia na górze strony (albo null).
 */
export function paginate(atoms, { height, breaks = [] }) {
  const slots = mergeAtoms(atoms);
  for (const y of breaks) {
    const slot = slots.find((candidate) => candidate.top >= y - EPS);
    if (slot && slot !== slots[0]) slot.breakBefore = true;
  }
  const pages = [];
  // Przycięcie strony: do połowy odstępu do sąsiedniego fragmentu, od 1 pt (ramki stykających się
  // wierszy tabeli) do 2 pt.
  const margin = (gap) => Math.min(2, Math.max(1, gap / 2));
  let previous = -Infinity;
  let index = 0;
  while (index < slots.length) {
    const start = slots[index];
    const header = start.header && start.header.bottom <= start.top + EPS ? start.header : null;
    const limit = start.top + height - (header ? header.bottom - header.top : 0);
    let fit = index - 1;
    for (let next = index; next < slots.length; next += 1) {
      if (next > index && slots[next].breakBefore) break;
      if (slots[next].bottom > limit + EPS) break;
      fit = next;
    }
    const clipTop = start.top - margin(start.top - previous);
    if (fit < index) {
      // Fragment wyższy niż strona – cięcie w jego środku, reszta zaczyna następną stronę.
      const cut = splitSlot(start, limit);
      pages.push({ top: start.top, bottom: cut.bottom, clipTop, clipBottom: cut.bottom + margin(cut.next - cut.bottom), header });
      slots[index] = { ...start, top: cut.next, atoms: start.atoms.filter((atom) => atom.bottom > cut.next + EPS), breakBefore: false };
      previous = cut.bottom;
      continue;
    }
    let end = fit;
    const natural = fit === slots.length - 1 || slots[fit + 1].breakBefore;
    if (!natural) {
      const good = (at) => !slots[at].keep && !widowed(slots[at], slots[at + 1]);
      const choice = [good, (at) => !slots[at].keep].map((test) => {
        for (let at = fit; at >= index; at -= 1) if (test(at)) return at;
        return -1;
      }).find((at) => at >= 0);
      end = choice ?? fit;
    }
    const bottom = slots[end].bottom;
    pages.push({ top: start.top, bottom, clipTop, clipBottom: bottom + margin((slots[end + 1]?.top ?? Infinity) - bottom), header });
    previous = bottom;
    index = end + 1;
  }
  return pages;
}

/** Fragmenty zachodzące na siebie (np. wiersze komórek w wierszu tabeli) łączone w jeden. */
function mergeAtoms(atoms) {
  const sorted = atoms.filter((atom) => atom.bottom > atom.top).sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const slots = [];
  for (const atom of sorted) {
    const last = slots.at(-1);
    if (last && atom.top < last.bottom - EPS) {
      last.atoms.push(atom);
      if (atom.bottom >= last.bottom - EPS) {
        last.keep = atom.bottom > last.bottom + EPS ? Boolean(atom.keep) : last.keep || Boolean(atom.keep);
      }
      last.bottom = Math.max(last.bottom, atom.bottom);
      last.header ??= atom.header ?? null;
      last.group ??= atom.group ?? null;
      last.first ||= Boolean(atom.first);
      last.last ||= Boolean(atom.last);
    } else {
      slots.push({
        top: atom.top, bottom: atom.bottom, atoms: [atom], keep: Boolean(atom.keep), header: atom.header ?? null,
        group: atom.group ?? null, first: Boolean(atom.first), last: Boolean(atom.last), breakBefore: false
      });
    }
  }
  return slots;
}

/** Czy cięcie między fragmentami zostawia pierwszy wiersz akapitu na dole albo ostatni na górze. */
function widowed(before, after) {
  if (!after || before.group === null || before.group !== after.group) return false;
  return before.first || after.last;
}

/**
 * Cięcie fragmentu wyższego niż strona: najniższy odstęp między jego mniejszymi częściami (wiersze
 * tekstu) nad granicą strony; bez takiego – na granicy. Zwraca { bottom, next } – koniec strony
 * i początek następnej.
 */
function splitSlot(slot, limit) {
  const tall = slot.bottom - slot.top;
  const parts = mergeAtoms(slot.atoms.filter((atom) => atom.bottom - atom.top < tall - EPS && atom.top >= slot.top - EPS));
  let best = null;
  for (let at = 0; at < parts.length - 1; at += 1) {
    if (parts[at].bottom <= limit + EPS && parts[at].bottom > slot.top + EPS && parts[at + 1].top >= parts[at].bottom) best = at;
  }
  if (best === null) return { bottom: limit, next: limit };
  return { bottom: parts[best].bottom, next: parts[best + 1].top };
}
