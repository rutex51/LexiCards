// Szybkie fiszki (od 1.62) – interfejs.
//
// W edytorze notatki: przycisk na pasku formatowania wysyła zaznaczony tekst (albo akapit z odwołaniem [[…]]
// do obrazu lub tabeli) na szybką fiszkę – tekst dostaje kolor fiszki, pogrubienie i sygnaturę ✦N.M,
// a błyszczące piksele lecą z tekstu na fiszkę obok edytora. Fiszka zbiera fragmenty w „worku”;
// „Uporządkuj” – fragmenty trafiają do pól (pojęcie, definicja, przykład, obraz) przeciągnięciem albo
// dotknięciem fragmentu, a potem pola. „Do teczki” – fiszka wpada do teczki 3D w prawym dolnym rogu
// i zwalnia miejsce na następną. Fiszkę można schować za prawą krawędź ekranu (zostaje języczek).
// Okno teczki – fiszki ze wszystkich notatek: porządkowanie, lekcja docelowa (domyślnie – lekcja notatki)
// i „Dodaj do lekcji…” (formularz pojęcia wypełniony fragmentami). Logika fiszek – core/magic.js.
// Kolor (fiolet, złoto, turkus) – Ustawienia → Wygląd; w arkuszu stylów atrybut data-magic-color na <html> (od 1.62.2; data-magic oznacza tylko fragmenty w treści).

import {
  MAGIC_MAX, activeMagicCard, cleanMagic, magicCardStatus, magicFragments, magicTermDraft, nextMagicNumber
} from '../core/magic.js';
import { labelKey, referenceLabel } from '../core/note-refs.js';
import { nowISO } from '../core/model.js';
import { openTermForm, pickDestination } from './actions.js';
import { confirmDialog, mountDialog, showError, toast } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { leafOf, wrapMarked } from './note-editing.js';

/** Pola fiszki w oknie porządkowania: [etykieta, pola] – pojęcie, definicja i przykład po polsku i angielsku, obraz. */
const ROWS = [['Pojęcie', ['termPL', 'termEN']], ['Definicja', ['defPL', 'defEN']], ['Przykład', ['exPL', 'exEN']], ['Obraz', ['media']]];
const SLOT_LABELS = {
  termPL: 'pojęcie po polsku', termEN: 'pojęcie po angielsku', defPL: 'definicja po polsku', defEN: 'definicja po angielsku',
  exPL: 'przykład po polsku', exEN: 'przykład po angielsku', media: 'obraz'
};
/** Szeroki ekran: fiszka obok tekstu; węższy – wysuwana z prawej nad tekstem. */
const WIDE = '(min-width: 1000px)';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fragmentWord = (count) => {
  const last = count % 10;
  const teens = count % 100 >= 12 && count % 100 <= 14;
  return `${count} ${count === 1 ? 'fragment' : last >= 2 && last <= 4 && !teens ? 'fragmenty' : 'fragmentów'}`;
};
const lerp = (a, b, q) => a + (b - a) * q;
const easeOut = (q) => 1 - (1 - q) ** 3;
const easeInOut = (q) => (q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2);
const clamp01 = (q) => Math.max(0, Math.min(1, q));
const bezier = (a, k, b, q) => (1 - q) * (1 - q) * a + 2 * (1 - q) * q * k + q * q * b;

/**
 * Przewija tylko `container` (w pionie), żeby `element` był widoczny – scrollIntoView przesuwałby też okno
 * i elementy z overflow: hidden (cały ekran w bok).
 */
function reveal(container, element) {
  if (!container || !element) return;
  const box = container.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  if (rect.top < box.top) container.scrollTop -= box.top - rect.top + 8;
  else if (rect.bottom > box.bottom) container.scrollTop += rect.bottom - box.bottom + 8;
}

// ---------------------------------------------------------------- iskry

/** Kolory iskier według koloru fiszki (Ustawienia → Wygląd). */
const SPARKS = {
  violet: { colors: ['#7c3aed', '#8b5cf6', '#a78bfa', '#c084fc', '#f5c542', '#ffd76a', '#ffffff'], glow: 'rgba(124, 58, 237, 0.85)', trail: '#8b5cf6' },
  gold: { colors: ['#f5c542', '#ffd76a', '#ffe9a8', '#e0a526', '#c8901a', '#fff3c4', '#ffffff'], glow: 'rgba(214, 150, 20, 0.9)', trail: '#e0a526' },
  teal: { colors: ['#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#38bdf8', '#ccfbf1', '#ffffff'], glow: 'rgba(13, 148, 136, 0.85)', trail: '#14b8a6' }
};
const sparkPalette = () => SPARKS[document.documentElement.dataset.magicColor] ?? SPARKS.violet;

/**
 * Błyszczące piksele na płótnie nad oknem `host` (okno modalne – płótno musi być w nim): stream() – piksele
 * z prostokątów tekstu lecą łukiem do celu (najpierw iskrzą na tekście, od lewej do prawej), burst() – rozprysk.
 * Płótno znika, gdy nie ma już pikseli.
 */
function sparkles(host) {
  let canvas = null;
  let context = null;
  let frame = 0;
  let dpr = 1;
  const parts = [];

  const ensure = () => {
    if (canvas) return;
    canvas = h('canvas', { class: 'magic-sparkles', 'aria-hidden': 'true' });
    host.append(canvas);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    context = canvas.getContext('2d');
  };
  const glint = (x, y, r, color, alpha, glow) => {
    context.globalAlpha = Math.max(0, alpha);
    context.fillStyle = color;
    context.shadowColor = glow;
    context.shadowBlur = r * 4;
    context.beginPath();
    if (r < 1.7) {
      context.arc(x, y, r, 0, Math.PI * 2);
    } else {
      const s = r * 1.9;
      context.moveTo(x, y - s);
      context.quadraticCurveTo(x, y, x + s, y);
      context.quadraticCurveTo(x, y, x, y + s);
      context.quadraticCurveTo(x, y, x - s, y);
      context.quadraticCurveTo(x, y, x, y - s);
    }
    context.fill();
  };
  const draw = () => {
    const t = performance.now();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const p = parts[index];
      const twinkle = 0.55 + 0.45 * Math.sin(t * 0.03 + p.phase);
      if (p.kind === 'seek') {
        const q = (t - p.start) / p.duration;
        if (q >= 1) {
          parts.splice(index, 1);
          continue;
        }
        if (q < 0) {
          glint(p.x0, p.y0, p.r * 0.8, p.color, clamp01((t - p.born) / 120) * twinkle * 0.9, p.glow);
          continue;
        }
        const e = easeInOut(q);
        const e0 = easeInOut(Math.max(0, q - 0.05));
        const x = bezier(p.x0, p.kx, p.x1, e);
        const y = bezier(p.y0, p.ky, p.y1, e);
        const fade = q > 0.9 ? (1 - q) / 0.1 : 1;
        context.shadowBlur = 0;
        context.globalAlpha = 0.28 * fade;
        context.strokeStyle = p.trail;
        context.lineWidth = p.r * 0.9;
        context.beginPath();
        context.moveTo(bezier(p.x0, p.kx, p.x1, e0), bezier(p.y0, p.ky, p.y1, e0));
        context.lineTo(x, y);
        context.stroke();
        glint(x, y, p.r * (1 - 0.4 * e), p.color, twinkle * fade, p.glow);
      } else {
        const dt = t - p.start;
        const q = dt / p.life;
        if (q >= 1) {
          parts.splice(index, 1);
          continue;
        }
        if (q < 0) continue;
        glint(p.x + p.vx * dt, p.y + p.vy * dt + 0.00005 * dt * dt, p.r, p.color, (1 - q) * twinkle, p.glow);
      }
    }
    context.globalAlpha = 1;
    context.shadowBlur = 0;
  };
  const loop = () => {
    draw();
    if (parts.length > 0) {
      frame = window.requestAnimationFrame(loop);
    } else {
      frame = 0;
      canvas?.remove();
      canvas = null;
    }
  };
  const run = () => {
    ensure();
    if (!frame) frame = window.requestAnimationFrame(loop);
  };

  return {
    /** Piksele z tekstu (prostokąty) do celu; zwraca czas lotu (ms; 0 – bez animacji). */
    stream(rects, target) {
      if (reducedMotion()) return 0;
      const list = [...rects].filter((rect) => rect.width > 1 && rect.height > 1);
      if (list.length === 0 || !target) return 0;
      const palette = sparkPalette();
      const total = list.reduce((sum, rect) => sum + rect.width, 0);
      const count = Math.max(56, Math.min(190, Math.round(total / 2.8)));
      const minX = Math.min(...list.map((rect) => rect.left));
      const maxX = Math.max(...list.map((rect) => rect.right));
      const tx = target.left + target.width / 2;
      const ty = target.top + target.height / 2;
      const now = performance.now();
      let end = 0;
      for (let index = 0; index < count; index += 1) {
        let pick = Math.random() * total;
        let rect = list[0];
        for (const item of list) {
          if (pick <= item.width) {
            rect = item;
            break;
          }
          pick -= item.width;
        }
        const x = rect.left + Math.random() * rect.width;
        const y = rect.top + 2 + Math.random() * Math.max(0, rect.height - 4);
        const delay = 160 + ((x - minX) / Math.max(1, maxX - minX)) * 360 + Math.random() * 140;
        const duration = 640 + Math.random() * 360;
        const x1 = tx + (Math.random() - 0.5) * target.width * 0.8;
        const y1 = ty + (Math.random() - 0.5) * target.height * 0.6;
        parts.push({
          kind: 'seek', x0: x, y0: y, x1, y1, kx: (x + x1) / 2 + (Math.random() - 0.5) * 180, ky: Math.min(y, y1) - 50 - Math.random() * 150,
          start: now + delay, born: now, duration, r: 1.1 + Math.random() * 2.6,
          color: palette.colors[Math.floor(Math.random() * palette.colors.length)], glow: palette.glow, trail: palette.trail, phase: Math.random() * 6
        });
        end = Math.max(end, delay + duration);
      }
      this.burst(tx, ty, 16, 0.12, end - 120);
      run();
      return end;
    },
    /** Rozprysk n pikseli z (x, y) po `delay` ms. */
    burst(x, y, count, speed = 0.08, delay = 0, lift = 0) {
      if (reducedMotion()) return;
      const palette = sparkPalette();
      const start = performance.now() + delay;
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = speed * (0.4 + Math.random());
        parts.push({
          kind: 'drift', x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity - lift, start, life: 420 + Math.random() * 420,
          r: 0.8 + Math.random() * 2, color: palette.colors[Math.floor(Math.random() * palette.colors.length)], glow: palette.glow, phase: Math.random() * 6
        });
      }
      run();
    },
    destroy() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      parts.length = 0;
      canvas?.remove();
      canvas = null;
    }
  };
}

/** Odliczanie zgodne z performance.now() (zatrzymanie czasu w testach zatrzymuje też je). */
function after(ms, callback) {
  if (ms <= 0) {
    callback();
    return () => {};
  }
  const start = performance.now();
  let frame = 0;
  const tick = () => {
    if (performance.now() - start >= ms) callback();
    else frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  return () => window.cancelAnimationFrame(frame);
}

// ---------------------------------------------------------------- teczka 3D

/**
 * Teczka 3D z liczbą fiszek: przycisk z tylną ścianką, kartami (do trzech) i przednią klapą, która uchyla się,
 * gdy wpada fiszka. update(count) – nowa liczba.
 */
export function magicFolderButton({ count = 0, onOpen, className = '', testID = 'magic-folder' }) {
  const papers = h('span', { class: 'magic-folder__papers' });
  const badge = h('span', { class: 'magic-folder__badge', dataset: { testid: `${testID}-count` } });
  const front = h('span', { class: 'magic-folder__front' }, h('span', { class: 'magic-folder__emblem', 'aria-hidden': 'true' }, '✦'));
  const button = h('button', {
    type: 'button', class: `magic-folder ${className}`.trim(), dataset: { testid: testID }, onClick: () => onOpen?.()
  },
    h('span', { class: 'magic-folder__shadow' }),
    h('span', { class: 'magic-folder__body' }, h('span', { class: 'magic-folder__back' }), papers, front),
    badge,
    h('span', { class: 'magic-folder__caption' }, 'Teczka'));
  button.update = (value) => {
    const shown = Math.min(3, value);
    badge.textContent = value > 0 ? String(value) : '';
    button.setAttribute('aria-label', value > 0 ? `Teczka – fiszki do sprawdzenia: ${value}` : 'Teczka – nie ma fiszek do sprawdzenia');
    button.title = 'Teczka szybkich fiszek';
    replaceChildren(papers,
      Array.from({ length: shown }, (_, index) => h('span', {
        class: 'magic-folder__paper', style: { transform: `translateY(${-(shown - 1 - index) * 6}px) rotate(${index % 2 ? 2.5 : -2}deg)` }
      })),
      h('span', { class: 'magic-folder__paper magic-folder__paper--in' }));
  };
  button.pop = () => {
    badge.classList.remove('magic-folder__badge--pop');
    void badge.offsetWidth;
    badge.classList.add('magic-folder__badge--pop');
  };
  button.update(count);
  return button;
}

/** Teczka w prawym dolnym rogu ekranów Biblioteki – tylko gdy czekają w niej fiszki. */
export function magicFolderFab(ctx) {
  const count = ctx.library.magicFolderCount();
  if (count === 0) return null;
  return magicFolderButton({ count, className: 'magic-folder--fab', testID: 'magic-folder-fab', onOpen: () => openMagicFolder(ctx) });
}

/**
 * Lot fiszki do teczki: kopia fiszki maleje i leci łukiem nad teczkę, klapa się uchyla, a karta wpada do środka.
 * host – okno, w którym trwa animacja. Zwraca obietnicę po zakończeniu.
 */
function flyToFolder(card, folder, host, sparks, label) {
  return new Promise((resolve) => {
    if (reducedMotion() || !card.isConnected || !folder.isConnected) {
      resolve();
      return;
    }
    const from = card.getBoundingClientRect();
    const flyer = card.cloneNode(true);
    for (const element of [flyer, ...flyer.querySelectorAll('[data-testid]')]) element.removeAttribute('data-testid');
    flyer.classList.add('magic-flyer');
    const face = h('span', { class: 'magic-flyer__face' }, label);
    flyer.append(face);
    Object.assign(flyer.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    host.append(flyer);
    card.style.visibility = 'hidden';
    const paper = folder.querySelector('.magic-folder__paper--in');
    const front = folder.querySelector('.magic-folder__front');
    paper.textContent = label;
    paper.style.transform = 'translateY(-50px)';
    const to = paper.getBoundingClientRect();
    const ax = from.left + from.width / 2;
    const ay = from.top + from.height / 2;
    const bx = to.left + to.width / 2;
    const by = to.top + to.height / 2;
    const kx = Math.min(ax, bx) - 70;
    const ky = Math.min(ay, by) - 150;
    const duration = 1350;
    const start = performance.now();
    const contents = [...flyer.children].filter((child) => child !== face);
    const finish = () => {
      flyer.remove();
      card.style.visibility = '';
      paper.style.transform = '';
      paper.style.visibility = '';
      front.style.transform = '';
      const box = folder.getBoundingClientRect();
      sparks.burst(box.left + box.width / 2, box.top + 30, 26, 0.13, 0, 0.05);
      resolve();
    };
    const step = () => {
      const p = clamp01((performance.now() - start) / duration);
      if (p < 0.8) {
        let cx;
        let cy;
        let width;
        let height;
        let rotate;
        let size = 34;
        if (p < 0.14) {
          const q = easeOut(p / 0.14);
          cx = ax;
          cy = ay - 10 * q;
          width = from.width * (1 + 0.03 * q);
          height = from.height * (1 + 0.03 * q);
          rotate = -2 * q;
        } else {
          const q = easeInOut((p - 0.14) / 0.66);
          cx = bezier(ax, kx, bx, q);
          cy = bezier(ay - 10, ky, by, q);
          width = lerp(from.width * 1.03, to.width, q);
          height = lerp(from.height * 1.03, to.height, q);
          rotate = lerp(-2, 0, q) - 9 * Math.sin(Math.PI * q);
          size = lerp(34, 12, q);
          face.style.opacity = String(clamp01((q - 0.15) / 0.35));
          for (const child of contents) child.style.opacity = String(1 - clamp01(q / 0.3));
          if (Math.random() < 0.7) sparks.burst(cx, cy, 2, 0.05);
        }
        Object.assign(flyer.style, {
          left: `${cx - width / 2}px`, top: `${cy - height / 2}px`, width: `${width}px`, height: `${height}px`,
          borderRadius: `${lerp(18, 6, clamp01((p - 0.14) / 0.66))}px`, transform: `rotate(${rotate}deg)`
        });
        face.style.fontSize = `${size}px`;
      } else {
        flyer.style.visibility = 'hidden';
        paper.style.visibility = 'visible';
        paper.style.transform = `translateY(${lerp(-50, 0, easeOut(clamp01((p - 0.8) / 0.2)))}px)`;
      }
      const open = p < 0.42 ? 0 : p < 0.8 ? easeOut((p - 0.42) / 0.38) : 1 - easeOut(clamp01((p - 0.86) / 0.14));
      front.style.transform = `rotateX(${-16 - 34 * open}deg) translateZ(3px)`;
      if (p < 1) window.requestAnimationFrame(step);
      else finish();
    };
    window.requestAnimationFrame(step);
  });
}

// ---------------------------------------------------------------- fragmenty i pola

/** Fragment na fiszce: sygnatura, tekst albo miniatura i sygnatura obiektu. */
function chip(frag, fragment, { thumb = null, picked = false, arriving = false, fresh = false, focusable = false } = {}) {
  const object = fragment?.object ?? null;
  return h('div', {
    class: `magic-chip${object ? ' magic-chip--object' : ''}${picked ? ' magic-chip--picked' : ''}${arriving ? ' magic-chip--arriving' : ''}${fresh ? ' magic-chip--new' : ''}`,
    dataset: { sig: frag.sig, testid: 'magic-chip' },
    title: object ? `✦${frag.sig} – ${object}` : `✦${frag.sig}`,
    // Porządkowanie z klawiatury: Tab do fragmentu, Enter albo spacja – wybór, potem to samo na polu.
    ...(focusable ? { tabindex: '0', role: 'button', 'aria-pressed': String(picked) } : {})
  },
    h('span', { class: 'magic-chip__sig' }, `✦${frag.sig}`),
    object ? h('span', { class: 'magic-chip__thumb' }, thumb?.(object) ?? icon('image', { size: 18 })) : null,
    h('span', { class: 'magic-chip__text' }, object ?? fragment?.text ?? ''));
}

/**
 * Fragmenty fiszki: tryb porządkowania (edit) – worek i pola; zwykły – wypełnione pola (skrót) i worek.
 * options: thumb(label), picked (sygnatura), arriving / fresh (sygnatura lecącego i świeżo przybyłego fragmentu).
 */
function boardContent(card, fragments, { edit = false, thumb = null, picked = null, arriving = null, fresh = null } = {}) {
  const live = card.frags.filter((frag) => fragments.has(frag.sig));
  const chipOf = (frag) => chip(frag, fragments.get(frag.sig), { thumb, picked: frag.sig === picked, arriving: frag.sig === arriving, fresh: frag.sig === fresh, focusable: edit });
  const loose = live.filter((frag) => !frag.slot);
  const bag = h('div', { class: `magic-bag${edit ? ' magic-bag--flow' : ''}`, dataset: { slot: '', testid: 'magic-bag' }, ...(edit ? { tabindex: '0', 'aria-label': 'Worek' } : {}) },
    h('div', { class: 'magic-bag__label' }, h('span', null, edit ? 'Worek – przeciągnij do pól' : 'Worek – bez pola'), h('span', null, String(loose.length))),
    loose.length > 0 ? loose.map(chipOf) : h('p', { class: 'magic-bag__empty' }, 'Wszystkie fragmenty są w polach.'));
  if (!edit) {
    const rows = ROWS.map(([label, slots]) => {
      const values = slots.map((slot) => live.filter((frag) => frag.slot === slot)
        .map((frag) => fragments.get(frag.sig).object ?? fragments.get(frag.sig).text).join(' ')).filter(Boolean);
      return values.length > 0 ? [h('dt', null, label), h('dd', null, values.join(' · '))] : null;
    }).filter(Boolean);
    return [rows.length > 0 ? h('dl', { class: 'magic-summary' }, rows) : null, bag];
  }
  const slotBox = (slot, language) => {
    const items = live.filter((frag) => frag.slot === slot);
    return h('div', {
      class: `magic-slot${slot === 'media' ? ' magic-slot--media' : ''}`, dataset: { slot, testid: `magic-slot-${slot}` }, 'aria-label': SLOT_LABELS[slot], tabindex: '0'
    },
      language ? h('span', { class: 'magic-slot__language' }, language) : null,
      items.length > 0 ? items.map(chipOf) : h('span', { class: 'magic-slot__hint' }, slot === 'media' ? 'Upuść obraz albo tabelę' : 'Upuść fragment'));
  };
  const fields = h('div', { class: 'magic-fields' }, ROWS.map(([label, slots]) => h('div', { class: `magic-row${slots.length === 1 ? ' magic-row--wide' : ''}` },
    h('div', { class: 'magic-row__label' }, label),
    slots.length === 1 ? slotBox(slots[0]) : [slotBox(slots[0], 'PL'), slotBox(slots[1], 'EN')])));
  return [bag, fields, h('p', { class: 'magic-tip' }, 'Przeciągnij fragment z worka do pola albo dotknij fragmentu, a potem pola. Z pola do worka – tak samo.')];
}

const accepts = (target, fragment) => {
  const slot = target.dataset.slot || null;
  if (!slot) return true;
  return slot === 'media' ? Boolean(fragment?.object) : !fragment?.object;
};
const refuseMessage = (fragment) => (fragment?.object
  ? 'Obraz albo tabela pasuje tylko do pola „Obraz”.'
  : 'Pole „Obraz” przyjmuje tylko obrazy i tabele z notatki.');

/**
 * Przeciąganie fragmentów między workiem i polami w elemencie `root` (tryb porządkowania): ghost – kopia
 * fragmentu pod palcem albo kursorem (w oknie `host`); dotknięcie bez ruchu – wybór (onPick), dotknięcie pola
 * z wybranym fragmentem – onMove. onMove(sig, slot) – fragment trafia do pola (null – do worka).
 */
function enableBoard(root, { host, fragmentOf, picked, onPick, onMove }) {
  root.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    const item = event.target.closest('.magic-chip');
    if (!item || !root.contains(item)) {
      placePicked(event);
      return;
    }
    event.preventDefault();
    const sig = item.dataset.sig;
    const fragment = fragmentOf(sig);
    const start = { x: event.clientX, y: event.clientY };
    const box = item.getBoundingClientRect();
    let ghost = null;
    let over = null;
    // Przewijanie listy pól przy górnej i dolnej krawędzi (fiszka bywa wyższa niż okno).
    let scrollFrame = 0;
    let pointerY = start.y;
    const scroller = (() => {
      for (let node = root; node; node = node.parentElement) {
        if (/(auto|scroll)/.test(window.getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
      }
      return null;
    })();
    const autoScroll = () => {
      scrollFrame = 0;
      if (!ghost || !scroller) return;
      const box = scroller.getBoundingClientRect();
      const speed = pointerY < box.top + 48 ? -10 : pointerY > box.bottom - 48 ? 10 : 0;
      if (speed === 0) return;
      scroller.scrollTop += speed;
      scrollFrame = window.requestAnimationFrame(autoScroll);
    };
    const move = (moveEvent) => {
      pointerY = moveEvent.clientY;
      if (ghost && !scrollFrame) scrollFrame = window.requestAnimationFrame(autoScroll);
      if (!ghost) {
        if (Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < 6) return;
        ghost = item.cloneNode(true);
        ghost.classList.add('magic-chip--ghost');
        ghost.removeAttribute('data-testid');
        ghost.style.width = `${box.width}px`;
        host.append(ghost);
        item.classList.add('magic-chip--placeholder');
      }
      ghost.style.left = `${moveEvent.clientX - (start.x - box.left)}px`;
      ghost.style.top = `${moveEvent.clientY - (start.y - box.top)}px`;
      let target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('.magic-slot, .magic-bag') ?? null;
      if (target && !root.contains(target)) target = null;
      if (target !== over) {
        over?.classList.remove('magic-drop--over', 'magic-drop--refused');
        over = target;
        over?.classList.add(accepts(over, fragment) ? 'magic-drop--over' : 'magic-drop--refused');
      }
    };
    const up = () => {
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!ghost) {
        onPick(picked() === sig ? null : sig);
        return;
      }
      ghost.remove();
      item.classList.remove('magic-chip--placeholder');
      if (!over) return;
      over.classList.remove('magic-drop--over', 'magic-drop--refused');
      if (!accepts(over, fragment)) {
        toast(refuseMessage(fragment));
        return;
      }
      onMove(sig, over.dataset.slot || null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  // Klawiatura: Enter albo spacja na fragmencie – wybór, na polu albo worku – przeniesienie wybranego; fokus zostaje na fragmencie.
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const item = event.target.closest('.magic-chip');
    const target = item ? null : event.target.closest('.magic-slot, .magic-bag');
    const sig = item ? item.dataset.sig : picked();
    if (!sig || !root.contains(event.target) || (!item && !target)) return;
    event.preventDefault();
    if (item) {
      onPick(picked() === sig ? null : sig);
    } else {
      const fragment = fragmentOf(sig);
      if (!accepts(target, fragment)) {
        toast(refuseMessage(fragment));
        return;
      }
      onMove(sig, target.dataset.slot || null);
    }
    host.querySelector(`.magic-chip[data-sig="${sig}"]:not(.magic-chip--ghost)`)?.focus();
  });

  /**
   * Dotknięcie pola albo worka z wybranym fragmentem – na puszczenie palca bez przesunięcia (nie „click”: po dotknięciu
   * fragmentu ekran rysuje się od nowa i spóźnione kliknięcie trafiłoby w worek pod palcem).
   */
  function placePicked(event) {
    const target = event.target.closest('.magic-slot, .magic-bag');
    const sig = picked();
    if (!target || !root.contains(target) || !sig) return;
    const start = { x: event.clientX, y: event.clientY };
    const done = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', done);
    };
    const release = (upEvent) => {
      done();
      if (Math.hypot(upEvent.clientX - start.x, upEvent.clientY - start.y) > 10) return;
      const fragment = fragmentOf(sig);
      if (!accepts(target, fragment)) {
        toast(refuseMessage(fragment));
        return;
      }
      onMove(sig, target.dataset.slot || null);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', done);
  }
}

// ---------------------------------------------------------------- fiszka w edytorze notatki

/**
 * Szybka fiszka w edytorze notatki. options:
 *   ctx, lessonID – lekcja notatki; area – pole tekstu; magic – fiszki notatki (rekord, kopiowane);
 *   texts() – treść obu wersji ({ pl, en }, znormalizowana); rewrite(change) – zmiana treści pola z cofaniem;
 *   liveRange() – zaznaczenie w polu; unwrap(sigs) – fragmenty wracają do zwykłego tekstu w obu wersjach;
 *   thumb(label) – miniatura obrazu albo tabeli; tableLabels() – sygnatury tabel; onLock(locked) – blokada
 *   przycisków formatowania tekstu (kursor we fragmencie).
 * Zwraca { lockbar, layer, capture(), selectionChanged(), refresh(), locked(), draft(), key(), destroy() }.
 */
export function magicEditor({ ctx, lessonID, area, magic, texts, rewrite, liveRange, unwrap, thumb, tableLabels, onLock }) {
  const { library } = ctx;
  const wide = window.matchMedia(WIDE);
  // Na szerokim ekranie fiszka schowana albo widoczna – jak zostawiona ostatnio; na węższym – schowana (wysuwana).
  const hiddenWide = () => library.getSettings().magicPanelHidden === true;
  const state = {
    magic: cleanMagic(magic ? structuredClone(magic) : null) ?? { next: 1, cards: [] },
    hidden: !wide.matches || hiddenWide(),
    mode: 'compact',
    picked: null,
    arriving: null,
    fresh: null,
    busy: false,
    lock: null,
    destroyed: false
  };
  const initialKey = JSON.stringify(cleanMagic(state.magic));
  let host = null;
  let sparks = null;
  const hostOf = () => area.closest('dialog') ?? document.body;
  const sparkLayer = () => {
    const current = hostOf();
    if (!sparks || host !== current) {
      sparks?.destroy();
      host = current;
      sparks = sparkles(current);
    }
    return sparks;
  };
  const fragmentsNow = () => {
    const current = texts();
    return magicFragments(current.pl, current.en);
  };
  const lessonName = () => library.getLesson(lessonID)?.name ?? '';

  // ---- elementy
  const lockbar = h('div', { class: 'magic-lock', hidden: true, role: 'status', dataset: { testid: 'magic-lock' } });
  const card = h('div', { class: 'magic-card', dataset: { testid: 'magic-card' } });
  const panel = h('aside', { class: 'magic-panel', 'aria-label': 'Szybka fiszka', hidden: state.hidden, dataset: { testid: 'magic-panel' } }, card);
  /** Schowanie albo pokazanie przez użytkownika – na szerokim ekranie zapamiętane. */
  const setHidden = (hidden) => {
    state.hidden = hidden;
    if (hidden) {
      state.mode = 'compact';
      state.picked = null;
    }
    if (wide.matches && hiddenWide() !== hidden) library.updateSettings({ magicPanelHidden: hidden }).catch((error) => console.error(error));
    render();
  };
  const tab = h('button', {
    type: 'button', class: 'magic-tab', dataset: { testid: 'magic-tab' }, 'aria-label': 'Pokaż szybką fiszkę',
    onClick: () => setHidden(false)
  }, icon('chevronLeft', { size: 18 }), h('span', { class: 'magic-tab__no' }), h('span', { class: 'magic-tab__count' }));
  const backdrop = h('div', { class: 'magic-backdrop', onClick: () => setHidden(true) });
  const folder = magicFolderButton({ count: 0, onOpen: () => openFolder() });
  const layer = h('div', { class: 'magic-layer' }, backdrop, panel, tab, folder);

  let hideTimer = 0;
  const active = () => activeMagicCard(state.magic);
  const folderCards = () => state.magic.cards.filter((item) => item.state === 'folder');

  function render(fragments = fragmentsNow()) {
    if (state.destroyed) return;
    const current = active();
    const edit = state.mode === 'edit' && Boolean(current);
    const live = current ? current.frags.filter((frag) => fragments.has(frag.sig)) : [];
    const placed = live.filter((frag) => frag.slot).length;
    const number = current?.no ?? nextMagicNumber(state.magic, fragments);
    layer.classList.toggle('magic-layer--hidden', state.hidden);
    layer.classList.toggle('magic-layer--edit', edit);
    layer.parentElement?.classList.toggle('note-edit__main--magic', !state.hidden && wide.matches);
    // Schowana fiszka po wysunięciu jest poza układem (niewidoczna dla czytników ekranu i klawisza Tab).
    if (state.hidden) {
      panel.classList.add('magic-panel--hidden');
      window.clearTimeout(hideTimer);
      if (!panel.hidden) hideTimer = window.setTimeout(() => { if (state.hidden) panel.hidden = true; }, reducedMotion() ? 0 : 450);
    } else {
      window.clearTimeout(hideTimer);
      if (panel.hidden) {
        panel.hidden = false;
        void panel.offsetWidth;
      }
      panel.classList.remove('magic-panel--hidden');
    }
    const body = h('div', { class: `magic-card__body${edit ? ' magic-card__body--edit' : ''}`, dataset: { testid: 'magic-card-body' } },
      live.length === 0
        ? h('div', { class: 'magic-empty' },
          icon('magicCard', { size: 30 }),
          h('p', null, 'Zaznacz fragment notatki albo ustaw kursor w akapicie z odwołaniem [[…]] i dotknij ', icon('magicCard', { size: 17 }), ' na pasku.'),
          h('p', { class: 'magic-empty__sub' }, number ? `Pierwszy fragment dostanie sygnaturę ✦${number}.1, następny ✦${number}.2…` : 'Ta notatka ma już najwięcej szybkich fiszek.'))
        : boardContent(current, fragments, { edit, thumb, picked: state.picked, arriving: state.arriving, fresh: state.fresh }));
    state.fresh = null;
    if (edit) {
      enableBoard(body, {
        host: hostOf(),
        fragmentOf: (sig) => fragmentsNow().get(sig),
        picked: () => state.picked,
        onPick: (sig) => {
          state.picked = sig;
          render();
        },
        onMove: (sig, slot) => {
          const frag = active()?.frags.find((item) => item.sig === sig);
          if (frag) frag.slot = slot;
          state.picked = null;
          render();
        }
      });
    }
    replaceChildren(card,
      h('div', { class: 'magic-card__head' },
        h('span', { class: 'magic-card__kicker' }, icon('sparkles', { size: 15 }), 'Szybka fiszka'),
        h('button', {
          type: 'button', class: 'magic-card__hide', 'aria-label': 'Schowaj fiszkę za krawędź ekranu', title: 'Schowaj fiszkę', dataset: { testid: 'magic-hide' },
          onClick: () => setHidden(true)
        }, icon('chevronRight', { size: 20 }))),
      h('div', { class: 'magic-card__title' },
        h('span', { class: 'magic-card__no', dataset: { testid: 'magic-card-no' } }, number ? `✦${number}` : '✦'),
        h('span', { class: 'magic-card__lesson' }, lessonName(),
          h('small', null, live.length > 0 ? `${fragmentWord(live.length)} · w polach ${placed}` : 'pusta – czeka na fragmenty'))),
      body,
      h('div', { class: 'magic-card__foot' },
        h('button', {
          type: 'button', class: 'button magic-card__button magic-card__order', disabled: live.length === 0, dataset: { testid: 'magic-edit' },
          onClick: () => {
            state.mode = edit ? 'compact' : 'edit';
            state.picked = null;
            render();
          }
        }, edit ? [icon('check', { size: 18 }), h('span', null, 'Gotowe')] : 'Uporządkuj'),
        h('button', {
          type: 'button', class: 'button magic-card__button magic-card__send', disabled: live.length === 0 || state.busy, dataset: { testid: 'magic-send' },
          onClick: () => send()
        }, 'Do teczki')));
    tab.querySelector('.magic-tab__no').textContent = number ? `✦${number}` : '✦';
    const landed = live.filter((frag) => frag.sig !== state.arriving).length;
    tab.querySelector('.magic-tab__count').textContent = landed > 0 ? String(landed) : '';
    // Teczka: fiszki tej notatki z edytora i pozostałe z biblioteki.
    const stored = (library.getNote(lessonID)?.magic?.cards ?? []).filter((item) => item.state === 'folder').length;
    folder.update(folderCards().length + library.magicFolderCount() - stored);
  }

  const pulse = (element) => {
    element.classList.remove('magic-pulse');
    void element.offsetWidth;
    element.classList.add('magic-pulse');
  };

  /**
   * Oznaczony fragment (<span data-magic>) z węzłem `node` – tylko w polu notatki. Poza polem atrybut data-magic
   * nie oznacza fragmentu (do 1.62.1 miał go <html> z kolorem fiszki – złoto i turkus blokowały dodawanie).
   */
  const markedSpan = (node) => {
    const found = (node?.nodeType === 1 ? node : node?.parentElement)?.closest('[data-magic]') ?? null;
    return found && area.contains(found) ? found : null;
  };

  // ---- wysłanie fragmentu na fiszkę
  function capture() {
    if (state.busy) return;
    const range = liveRange();
    if (!range || !area.contains(range.commonAncestorContainer)) {
      toast('Zaznacz fragment notatki albo ustaw kursor w akapicie z odwołaniem [[…]].');
      return;
    }
    const leaf = leafOf(area, range.startContainer);
    if (!leaf) {
      toast('Zaznacz fragment notatki.');
      return;
    }
    const label = leaf.tagName === 'P' ? referenceLabel(leaf.textContent) : null;
    if (label) {
      if (leaf.querySelector('[data-magic]') || markedSpan(leaf)) {
        toast('To odwołanie jest już na szybkiej fiszce.');
        return;
      }
    } else {
      if (range.collapsed || range.toString().trim() === '') {
        toast('Zaznacz tekst, który ma trafić na szybką fiszkę – albo ustaw kursor w akapicie z odwołaniem [[…]].');
        return;
      }
      if (leafOf(area, range.endContainer) !== leaf) {
        toast('Zaznacz tekst w jednym akapicie – dłuższy tekst wyślij w kilku fragmentach.');
        return;
      }
      const hit = markedSpan(range.startContainer) ?? markedSpan(range.endContainer) ?? range.cloneContents().querySelector('[data-magic]');
      if (hit) {
        toast(`Ten tekst jest już na szybkiej fiszce (✦${hit.dataset.magic}).`);
        return;
      }
    }
    let current = active();
    let created = false;
    if (!current) {
      const no = nextMagicNumber(state.magic, fragmentsNow());
      if (!no) {
        toast('Ta notatka ma już najwięcej szybkich fiszek.');
        return;
      }
      current = { no, state: 'active', frags: [], next: 1 };
      state.magic.cards.push(current);
      state.magic.next = Math.max(state.magic.next ?? 1, no + 1);
      created = true;
    }
    if (current.next > MAGIC_MAX) {
      toast('Na tej fiszce jest już najwięcej fragmentów – wyślij ją do teczki.');
      return;
    }
    const sig = `${current.no}.${current.next}`;
    const wrapper = h('span', { dataset: { magic: sig } });
    let wrapped = false;
    rewrite((copy) => {
      wrapped = wrapMarked(copy, wrapper, { whole: Boolean(label) });
    });
    const span = area.querySelector(`[data-magic="${sig}"]`);
    if (!wrapped || !span) {
      if (created) state.magic.cards = state.magic.cards.filter((item) => item !== current);
      toast('Zaznacz tekst, który ma trafić na szybką fiszkę.');
      return;
    }
    current.next += 1;
    current.frags.push({ sig, slot: null });
    window.getSelection()?.collapseToEnd();
    span.classList.add('magic-born');
    after(1400, () => {
      span.classList.remove('magic-born');
      if (span.classList.length === 0) span.removeAttribute('class');
    });
    state.arriving = sig;
    render();
    const target = state.hidden ? tab : card.querySelector(`.magic-chip[data-sig="${sig}"]`);
    if (!state.hidden) reveal(card.querySelector('.magic-card__body'), target);
    const ms = sparkLayer().stream(span.getClientRects(), (target ?? tab).getBoundingClientRect());
    after(ms, () => {
      if (state.arriving !== sig) return;
      state.arriving = null;
      state.fresh = sig;
      render();
      if (state.hidden) pulse(tab);
    });
    selectionChanged();
  }

  // ---- do teczki
  async function send() {
    const current = active();
    if (!current || state.busy) return;
    const fragments = fragmentsNow();
    if (!current.frags.some((frag) => fragments.has(frag.sig))) return;
    state.busy = true;
    state.picked = null;
    state.arriving = null;
    render(fragments);
    current.state = 'folder';
    current.sentAt = nowISO();
    await flyToFolder(card, folder, hostOf(), sparkLayer(), `✦${current.no}`);
    state.busy = false;
    state.mode = 'compact';
    if (!wide.matches) state.hidden = true;
    render();
    folder.pop();
    card.classList.remove('magic-card--enter');
    void card.offsetWidth;
    card.classList.add('magic-card--enter');
    toast(`Fiszka ✦${current.no} jest w teczce.`);
  }

  // ---- kursor we fragmencie: blokada formatowania i pasek z sygnaturą
  function selectionChanged() {
    const selection = window.getSelection();
    let sig = null;
    if (selection?.rangeCount && area.contains(selection.anchorNode)) {
      const found = markedSpan(selection.anchorNode) ?? markedSpan(selection.focusNode);
      if (found) sig = found.dataset.magic;
    }
    onLock(Boolean(sig));
    if (sig === state.lock) return;
    state.lock = sig;
    lockbar.hidden = !sig;
    if (!sig) {
      replaceChildren(lockbar);
      return;
    }
    const owner = state.magic.cards.find((item) => item.no === Number(sig.split('.')[0]));
    const keep = (event) => event.preventDefault();
    const button = (label, testID, onClick) => h('button', { type: 'button', class: 'magic-lock__button', dataset: { testid: testID }, onMousedown: keep, onClick }, label);
    let text;
    let actions;
    if (owner?.state === 'done') {
      const term = owner.termID ? library.getTerm(owner.termID) : null;
      text = term ? ` – fragment fiszki dodanej do lekcji jako „${term.termPL}”.` : ' – fragment fiszki dodanej do lekcji.';
      actions = [button('Usuń oznaczenie', 'magic-lock-remove', () => unmark(sig))];
    } else {
      text = owner?.state === 'folder' ? ' – fragment fiszki w teczce. Kolor i pogrubienie są stałe.' : ' – fragment szybkiej fiszki. Kolor i pogrubienie są stałe.';
      actions = [
        button(owner?.state === 'folder' ? 'Pokaż w teczce' : 'Pokaż na fiszce', 'magic-lock-show', () => show(sig)),
        button('Usuń z fiszki', 'magic-lock-remove', () => unmark(sig))
      ];
    }
    replaceChildren(lockbar, icon('sparkles', { size: 18 }), h('span', { class: 'magic-lock__text' }, h('strong', null, `✦${sig}`), text), actions);
  }

  function show(sig) {
    const owner = state.magic.cards.find((item) => item.no === Number(sig.split('.')[0]));
    if (owner?.state === 'folder') {
      openFolder(owner.no);
      return;
    }
    if (state.hidden) setHidden(false);
    const item = card.querySelector(`.magic-chip[data-sig="${sig}"]`);
    if (item) {
      reveal(card.querySelector('.magic-card__body'), item);
      pulse(item);
    }
  }

  /** Fragment wraca do zwykłego tekstu i znika z fiszki. */
  function unmark(sig) {
    unwrap(new Set([sig]));
    for (const item of state.magic.cards) {
      if (item.frags) item.frags = item.frags.filter((frag) => frag.sig !== sig);
    }
    state.magic.cards = state.magic.cards.filter((item) => item.state === 'done' || item.state === 'active' || item.frags.length > 0);
    selectionChanged();
    render();
    toast(`Fragment ✦${sig} usunięty z fiszki – tekst wrócił do zwykłego.`);
  }

  // ---- teczka (fiszki tej notatki – z edytora, pozostałe – z biblioteki)
  const bridge = {
    lessonID,
    cards: folderCards,
    fragments: fragmentsNow,
    thumb,
    tableLabels,
    update(no, change) {
      const item = state.magic.cards.find((entry) => entry.no === no && entry.state === 'folder');
      if (item) change(item);
      render();
    },
    remove(no) {
      const item = state.magic.cards.find((entry) => entry.no === no);
      if (!item) return;
      unwrap(new Set(item.frags.map((frag) => frag.sig)));
      state.magic.cards = state.magic.cards.filter((entry) => entry !== item);
      render();
    },
    complete(no, termID) {
      const index = state.magic.cards.findIndex((entry) => entry.no === no);
      if (index >= 0) state.magic.cards[index] = { no, state: 'done', termID, doneAt: nowISO() };
      render();
    }
  };
  function openFolder(focus = null) {
    if (state.busy) return;
    openMagicFolder(ctx, { editor: bridge, focus, onClose: () => render() });
  }

  const onWide = () => {
    state.hidden = !wide.matches || hiddenWide();
    render();
  };
  wide.addEventListener('change', onWide);
  // Zmiany tekstu (także usunięcie fragmentu) – fiszka po chwili pokazuje aktualną treść.
  let timer = 0;
  const onInput = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => render(), 400);
  };
  area.addEventListener('input', onInput);
  render(magicFragments(texts().pl, texts().en));

  return {
    lockbar,
    layer,
    capture,
    selectionChanged,
    refresh: () => render(),
    /** Kursor (albo zaznaczenie) we fragmencie fiszki – formatowanie tekstu zablokowane. */
    locked: () => Boolean(state.lock),
    /** Fiszki do zapisu z notatką. */
    draft: () => cleanMagic(state.magic),
    key: () => JSON.stringify(cleanMagic(state.magic)),
    initialKey,
    destroy() {
      state.destroyed = true;
      window.clearTimeout(timer);
      window.clearTimeout(hideTimer);
      wide.removeEventListener('change', onWide);
      area.removeEventListener('input', onInput);
      sparks?.destroy();
    }
  };
}

// ---------------------------------------------------------------- okno teczki

/**
 * Teczka: fiszki czekające na sprawdzenie ze wszystkich notatek. editor – fiszki notatki otwartej w edytorze
 * (zmiany trafiają do edytora i zapisują się z notatką); pozostałe zmienia od razu biblioteka. focus – numer
 * fiszki tej notatki do rozwinięcia.
 */
export function openMagicFolder(ctx, { editor = null, focus = null, onClose = null } = {}) {
  const { library } = ctx;
  let expanded = focus !== null && editor ? `${editor.lessonID}:${focus}` : null;
  let picked = null;
  const body = h('div', { class: 'sheet__body magic-folder-sheet__body', dataset: { testid: 'magic-folder-body' } });
  const count = h('span', { class: 'magic-folder-sheet__count', dataset: { testid: 'magic-folder-sheet-count' } });
  const closeButton = h('button', { type: 'button', class: 'button button--plain', dataset: { testid: 'magic-folder-close' } }, 'Zamknij');
  const panel = h('div', { class: 'sheet__panel magic-folder-sheet', 'aria-label': 'Teczka szybkich fiszek' },
    h('header', { class: 'sheet__header' }, closeButton, h('h2', { class: 'sheet__title magic-folder-sheet__title' }, 'Teczka', count), h('span', { 'aria-hidden': 'true' })),
    body);

  /** Fiszki: [{ key, lessonID, card, fragments, live }] – live: fiszka notatki z edytora. */
  const items = () => {
    const list = library.magicFolder().filter((item) => !editor || item.lessonID !== editor.lessonID).map((item) => ({ ...item, live: false }));
    if (editor) {
      const fragments = editor.fragments();
      for (const card of editor.cards()) list.push({ lessonID: editor.lessonID, card, fragments, live: true });
    }
    return list
      .map((item) => ({ ...item, key: `${item.lessonID}:${item.card.no}` }))
      .sort((a, b) => String(b.card.sentAt ?? '').localeCompare(String(a.card.sentAt ?? '')) || a.card.no - b.card.no);
  };

  const change = async (item, apply, stored) => {
    try {
      if (item.live) editor.update(item.card.no, apply);
      else await stored();
    } catch (error) {
      await showError(error);
    }
    render();
  };

  function itemView(item) {
    const { card, fragments } = item;
    const status = magicCardStatus(card, fragments);
    const target = card.lessonID && library.getLesson(card.lessonID) ? card.lessonID : item.lessonID;
    const draft = magicTermDraft(card, fragments);
    const title = draft.termPL || draft.termEN;
    const open = expanded === item.key;
    const pill = !status.term
      ? { tone: 'warn', text: 'Brak pojęcia' }
      : status.complete ? { tone: 'ok', text: 'Gotowa' } : { tone: 'warn', text: 'Do uzupełnienia' };
    const otherLesson = target !== item.lessonID;
    const hasMedia = card.frags.some((frag) => frag.slot === 'media' && fragments.get(frag.sig)?.object);
    const notes = [
      status.loose > 0 ? `${fragmentWord(status.loose)} bez pola – nie trafi${status.loose === 1 ? '' : 'ą'} na fiszkę.` : null,
      otherLesson && hasMedia ? 'Obrazy z notatki zostaną pominięte – fiszka trafi do innej lekcji niż notatka.' : null
    ].filter(Boolean);
    // Miniatury obrazów – z edytora; w notatkach spoza edytora – ikona obrazu albo tabeli.
    const tables = new Set((library.getNote(item.lessonID)?.tables ?? []).map((table) => labelKey(table.label)));
    const thumb = item.live ? editor.thumb : (label) => icon(tables.has(labelKey(label)) ? 'table' : 'image', { size: 18 });
    let board = null;
    if (open) {
      board = h('div', { class: 'magic-folder-item__board', dataset: { testid: 'magic-folder-board' } },
        boardContent(card, fragments, { edit: true, thumb, picked: picked?.key === item.key ? picked.sig : null }));
      enableBoard(board, {
        host: dialog,
        fragmentOf: (sig) => fragments.get(sig),
        picked: () => (picked?.key === item.key ? picked.sig : null),
        onPick: (sig) => {
          picked = sig ? { key: item.key, sig } : null;
          render();
        },
        onMove: (sig, slot) => {
          picked = null;
          const frags = card.frags.map((frag) => (frag.sig === sig ? { ...frag, slot } : frag));
          change(item, (entry) => { entry.frags = frags; }, () => library.updateMagicCard(item.lessonID, card.no, { frags }));
        }
      });
    }
    return h('article', { class: `magic-folder-item${open ? ' magic-folder-item--open' : ''}`, dataset: { testid: 'magic-folder-item', no: String(card.no), lesson: item.lessonID } },
      h('div', { class: 'magic-folder-item__top' },
        h('span', { class: 'magic-mini', 'aria-hidden': 'true' }, `✦${card.no}`),
        h('div', { class: 'magic-folder-item__main' },
          h('p', { class: 'magic-folder-item__title' }, title || h('span', { class: 'magic-folder-item__untitled' }, 'Bez pojęcia')),
          h('p', { class: 'magic-folder-item__sub' }, `Z notatki „${library.getLesson(item.lessonID)?.name ?? ''}” · ${fragmentWord(status.count)}`)),
        h('span', { class: `magic-pill magic-pill--${pill.tone}`, dataset: { testid: 'magic-folder-status' } }, pill.text)),
      h('div', { class: 'magic-folder-item__lesson' },
        h('span', { class: 'magic-folder-item__label' }, 'Lekcja'),
        h('button', {
          type: 'button', class: 'input input--button magic-folder-item__lesson-button', dataset: { testid: 'magic-folder-lesson' },
          onClick: async () => {
            const chosen = await pickDestination(ctx, { title: 'Lekcja fiszki', level: 'lesson', currentID: target });
            if (!chosen) return;
            const lessonValue = chosen === item.lessonID ? null : chosen;
            change(item, (entry) => {
              if (lessonValue) entry.lessonID = lessonValue;
              else delete entry.lessonID;
            }, () => library.updateMagicCard(item.lessonID, card.no, { lessonID: lessonValue }));
          }
        }, h('span', null, library.lessonPath(target), target === item.lessonID ? h('small', null, ' – lekcja notatki') : null), icon('chevronRight', { size: 18 }))),
      open ? board : h('div', { class: 'magic-folder-item__chips' }, card.frags.filter((frag) => fragments.has(frag.sig)).map((frag) => h('span', { class: 'magic-tag' },
        h('strong', null, `✦${frag.sig}`), ` ${fragments.get(frag.sig).object ?? fragments.get(frag.sig).text}`))),
      h('div', { class: 'magic-folder-item__actions' },
        h('button', {
          type: 'button', class: 'button button--danger-plain', dataset: { testid: 'magic-folder-delete' },
          onClick: async () => {
            const confirmed = await confirmDialog({
              title: `Usunąć fiszkę ✦${card.no}?`,
              message: 'Fragmenty w notatce wrócą do zwykłego tekstu.',
              confirmLabel: 'Usuń',
              destructive: true
            });
            if (!confirmed) return;
            try {
              if (item.live) editor.remove(card.no);
              else await library.removeMagicCard(item.lessonID, card.no);
              toast(`Usunięto fiszkę ✦${card.no}.`);
            } catch (error) {
              await showError(error);
            }
            render();
          }
        }, icon('trash', { size: 18 }), h('span', null, 'Usuń')),
        h('button', {
          type: 'button', class: 'button magic-card__order', dataset: { testid: 'magic-folder-toggle' },
          onClick: () => {
            expanded = open ? null : item.key;
            picked = null;
            render();
          }
        }, open ? 'Zwiń' : 'Uporządkuj'),
        h('button', {
          type: 'button', class: 'button magic-folder-item__add', disabled: !status.term, dataset: { testid: 'magic-folder-add' },
          onClick: () => addToLesson(item, target)
        }, 'Dodaj do lekcji…')),
      notes.length > 0 ? h('p', { class: 'magic-folder-item__note' }, notes.join(' ')) : null);
  }

  /** „Dodaj do lekcji…” – formularz pojęcia wypełniony fragmentami; zapis tworzy pojęcie i zamyka fiszkę. */
  function addToLesson(item, target) {
    const tables = item.live ? editor.tableLabels() : (library.getNote(item.lessonID)?.tables ?? []).map((table) => table.label);
    const draft = magicTermDraft(item.card, item.fragments, { tableLabels: tables, media: target === item.lessonID });
    openTermForm(ctx, {
      lessonID: target,
      preset: {
        termPL: draft.termPL, termEN: draft.termEN, descriptionPL: draft.descriptionPL, descriptionEN: draft.descriptionEN,
        examplePL: draft.examplePL, exampleEN: draft.exampleEN, cardMedia: draft.cardMedia
      },
      title: `Pojęcie z fiszki ✦${item.card.no}`,
      create: async (termDraft, lessonID) => {
        const term = await library.createTermFromMagic(termDraft, lessonID, { noteLessonID: item.lessonID, no: item.card.no });
        if (item.live) editor.complete(item.card.no, term.id);
        if (expanded === item.key) expanded = null;
        toast(`Dodano pojęcie „${term.termPL}” do lekcji ${library.getLesson(lessonID)?.name ?? ''}.`);
        render();
      }
    });
  }

  function render() {
    if (!dialog?.open) return;
    const list = items();
    count.textContent = String(list.length);
    const scroll = body.scrollTop;
    replaceChildren(body,
      h('p', { class: 'magic-folder-sheet__intro' }, 'Fiszki czekają tu na sprawdzenie: przypisz fragmenty do pól i dodaj fiszkę do lekcji. Lekcja jest od razu ustawiona na lekcję notatki – możesz wybrać inną.'),
      list.length > 0 ? list.map(itemView) : h('div', { class: 'magic-folder-sheet__empty', dataset: { testid: 'magic-folder-empty' } }, icon('check', { size: 30 }), h('p', null, 'Teczka jest pusta.')));
    body.scrollTop = scroll;
  }

  const dialog = mountDialog('sheet magic-folder-dialog', panel, { onClose: () => onClose?.() });
  dialog.dataset.testid = 'magic-folder-dialog';
  closeButton.addEventListener('click', () => dialog.close('done'));
  render();
  if (expanded) reveal(body, dialog.querySelector('.magic-folder-item--open'));
  return dialog;
}
