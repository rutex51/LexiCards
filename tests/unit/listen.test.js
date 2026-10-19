// Słuchanie: kroki pojęcia, zapowiedzi, szacowanie czasu i odtwarzacz (bez syntezatora mowy
// – w Node.js każda wypowiedź kończy się od razu, a czas przerw odmierza atrapa zegara).

import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import {
  CARD_GAP, DETAIL_GAP, estimateListening, estimateNotes, introText, listenSteps, noteSteps, noteVersions, outroText, sentences
} from '../../js/core/listen.js';
import { ListenPlayer } from '../../js/ui/listen-player.js';

const PL_EN = 'pl_en';
const EN_PL = 'en_pl';
const FULL = {
  id: 't1', termPL: 'bilans', termEN: 'balance sheet',
  descriptionPL: 'Zestawienie aktywów i pasywów.', descriptionEN: 'A statement of assets and liabilities.',
  examplePL: 'Bilans się zgadza.', exampleEN: 'The balance sheet balances.'
};
const POLISH_ONLY = { id: 't2', termPL: 'zysk', termEN: 'profit', descriptionPL: 'Nadwyżka przychodów nad kosztami.', exampleEN: '' };
const BARE = { id: 't3', termPL: 'koszt', termEN: 'cost' };

const kinds = (steps) => steps.map((step) => (step.kind === 'think' ? `think:${step.ms}` : `${step.kind}:${step.lang}`));

test('kroki pojęcia: pojęcie, czas na zastanowienie, odpowiedź, definicja i przykład', () => {
  assert.deepEqual(kinds(listenSteps(FULL, PL_EN, { thinkMs: 5000 })),
    ['prompt:pl', 'think:5000', 'answer:en', 'description:en', 'example:en']);
  const reverse = listenSteps(FULL, EN_PL, { thinkMs: 3000 });
  assert.deepEqual(kinds(reverse), ['prompt:en', 'think:3000', 'answer:pl', 'description:en', 'example:en']);
  assert.deepEqual(reverse.map((step) => step.text ?? null),
    ['balance sheet', null, 'bilans', 'A statement of assets and liabilities.', 'The balance sheet balances.']);
  // Definicja i przykład po polsku.
  assert.deepEqual(kinds(listenSteps(FULL, PL_EN, { thinkMs: 5000, detailLanguage: 'pl' })),
    ['prompt:pl', 'think:5000', 'answer:en', 'description:pl', 'example:pl']);
  // Brak tekstu w wybranym języku – wersja w drugim; brak w obu – krok pominięty.
  assert.deepEqual(kinds(listenSteps(POLISH_ONLY, PL_EN, { thinkMs: 5000 })),
    ['prompt:pl', 'think:5000', 'answer:en', 'description:pl']);
  assert.deepEqual(kinds(listenSteps(BARE, EN_PL, { thinkMs: 8000 })), ['prompt:en', 'think:8000', 'answer:pl']);
  // Bez definicji i przykładu, z powtórzoną odpowiedzią.
  const repeated = listenSteps(FULL, PL_EN, { thinkMs: 5000, description: false, example: false, repeatAnswer: true });
  assert.deepEqual(kinds(repeated), ['prompt:pl', 'think:5000', 'answer:en', 'answer:en']);
  assert.equal(repeated[3].repeat, true);
});

test('zapowiedzi i szacowany czas słuchania', () => {
  assert.equal(introText(1), 'Zaczynamy. 1 pojęcie.');
  assert.equal(introText(3), 'Zaczynamy. 3 pojęcia.');
  assert.equal(outroText(5), 'Koniec. Odsłuchano 5 pojęć.');
  const cards = [{ term: FULL, direction: PL_EN }, { term: BARE, direction: EN_PL }];
  const short = estimateListening(cards, { thinkMs: 3000, description: false, example: false });
  const long = estimateListening(cards, { thinkMs: 8000 });
  assert.ok(short > 2 * 3000 + 2 * CARD_GAP, 'przerwy wliczone');
  assert.ok(long > short, 'dłuższa przerwa i więcej treści – dłużej');
  assert.ok(estimateListening(cards, { thinkMs: 3000 }, 0.7) > estimateListening(cards, { thinkMs: 3000 }, 1.15), 'wolniejsza mowa – dłużej');
});

function makePlayer(cards, options = { thinkMs: 5000 }) {
  const log = [];
  const player = new ListenPlayer({
    cards,
    options,
    settings: () => ({ speechRate: 1 }),
    onChange: () => {
      const step = player.currentStep();
      const entry = `${player.phase}|${player.cardIndex}:${step.kind}`;
      if (log.at(-1) !== entry) log.push(entry);
    }
  });
  return { player, log };
}

test('odtwarzacz: kolejność kroków, przerwy, koniec i liczba odsłuchanych pojęć', (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => mock.timers.reset());
  const { player, log } = makePlayer([{ term: FULL, direction: PL_EN }, { term: BARE, direction: EN_PL }]);
  player.start();
  assert.equal(player.currentStep().kind, 'intro');
  mock.timers.tick(0);
  assert.deepEqual([player.cardIndex, player.currentStep().kind], [0, 'prompt'], 'po zapowiedzi krótka przerwa');
  mock.timers.tick(DETAIL_GAP);
  mock.timers.tick(0);
  assert.equal(player.currentStep().kind, 'think', 'po pojęciu od razu czas na zastanowienie');
  assert.equal(player.thinkEndsAt - player.thinkStartedAt, 5000);
  mock.timers.tick(4999);
  assert.equal(player.currentStep().kind, 'think');
  mock.timers.tick(1);
  mock.timers.tick(0);
  assert.equal(player.currentStep().kind, 'description', 'po odpowiedzi – przerwa przed definicją');
  mock.timers.tick(DETAIL_GAP);
  mock.timers.tick(0);
  assert.equal(player.currentStep().kind, 'example');
  mock.timers.tick(DETAIL_GAP);
  mock.timers.tick(0);
  assert.equal(player.cardIndex, 1, 'po przykładzie – następne pojęcie');
  mock.timers.tick(CARD_GAP);
  mock.timers.tick(0);
  mock.timers.tick(5000);
  mock.timers.tick(0);
  mock.timers.tick(CARD_GAP);
  mock.timers.tick(0);
  assert.equal(player.phase, 'finished');
  assert.equal(player.listened.size, 2);
  assert.equal(player.currentStep().text, 'Koniec. Odsłuchano 2 pojęcia.');
  assert.deepEqual(log.filter((entry) => entry.startsWith('playing')).map((entry) => entry.split('|')[1]), [
    '-1:intro', '0:prompt', '0:think', '0:answer', '0:description', '0:example', '1:prompt', '1:think', '1:answer', '2:outro'
  ]);
});

test('odtwarzacz: pauza zatrzymuje, wznowienie czyta krok od początku; dalej, wstecz, powtórz', (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => mock.timers.reset());
  const cards = [{ term: FULL, direction: PL_EN }, { term: BARE, direction: PL_EN }, { term: POLISH_ONLY, direction: EN_PL }];
  const { player } = makePlayer(cards, { thinkMs: 3000, description: false, example: false });
  player.start();
  mock.timers.tick(0);
  mock.timers.tick(1000);
  assert.equal(player.currentStep().kind, 'think');
  player.pause();
  assert.equal(player.phase, 'paused');
  mock.timers.tick(60_000);
  assert.equal(player.currentStep().kind, 'think', 'w pauzie nic się nie dzieje');
  player.resume();
  assert.equal(player.thinkEndsAt - Date.now(), 3000, 'przerwa liczy się od nowa');

  player.next();
  assert.deepEqual([player.cardIndex, player.currentStep().kind], [1, 'prompt']);
  mock.timers.tick(150);
  mock.timers.tick(0);
  assert.equal(player.currentStep().kind, 'think');
  player.previous();
  assert.deepEqual([player.cardIndex, player.stepIndex], [1, 0], 'w środku pojęcia – to samo od początku');
  player.previous();
  assert.equal(player.cardIndex, 0, 'na początku pojęcia – poprzednie');
  player.next();
  player.next();
  assert.equal(player.cardIndex, 2);
  mock.timers.tick(150);
  mock.timers.tick(0);
  player.repeat();
  assert.deepEqual([player.cardIndex, player.stepIndex], [2, 0]);
  // „Dalej” w pauzie przestawia pojęcie, ale nie wznawia czytania.
  player.pause();
  player.next();
  assert.equal(player.phase, 'paused');
  assert.equal(player.currentStep().kind, 'outro');
  player.stop();
  assert.equal(player.phase, 'finished');
});

test('notatka lekcji w słuchaniu: wersje (PL, EN, obie, brakująca – druga), zdania bez odwołań, podziałów i punktorów', () => {
  const note = {
    html: '<h3>Bilans</h3><p>Aktywa. Pasywa!</p><p>[[Obraz 1]]</p><hr data-page=""><ul><li>Kapitał</li></ul>',
    htmlEN: '<p>Assets.</p>'
  };
  assert.deepEqual(noteVersions(note, 'off'), []);
  assert.deepEqual(noteVersions(note, 'pl').map((item) => item.lang), ['pl']);
  assert.deepEqual(noteVersions(note, 'en').map((item) => item.lang), ['en']);
  assert.deepEqual(noteVersions(note, 'both').map((item) => item.lang), ['pl', 'en']);
  assert.deepEqual(noteVersions({ html: '<p>Tylko PL</p>', htmlEN: '' }, 'en').map((item) => item.lang), ['pl'], 'brak EN – czyta PL');
  assert.deepEqual(noteVersions({ html: '', htmlEN: '<p>Only EN</p>' }, 'both').map((item) => item.lang), ['en']);
  assert.deepEqual(noteVersions(null, 'both'), []);

  assert.deepEqual(noteSteps(note, 'Ratios', 'both').map(({ kind, text, lang }) => `${kind}/${lang} ${text}`), [
    'noteTitle/pl Notatka do lekcji Ratios.',
    'note/pl Bilans',
    'note/pl Aktywa.',
    'note/pl Pasywa!',
    'note/pl Kapitał',
    'noteTitle/en English version.',
    'note/en Assets.'
  ]);
  assert.deepEqual(noteSteps({ html: '<p>[[Obraz 1]]</p>', htmlEN: '' }, 'X', 'pl'), [], 'same odwołania – nic do czytania');
  assert.deepEqual(sentences('Pierwsze. Drugie? Trzecie… a dalej'), ['Pierwsze.', 'Drugie?', 'Trzecie…', 'a dalej']);
  assert.equal(introText(20, 1), 'Zaczynamy. Notatka lekcji i 20 pojęć.');
  assert.equal(introText(3, 2), 'Zaczynamy. 2 notatki i 3 pojęcia.');
  assert.ok(estimateNotes([{ steps: noteSteps(note, 'Ratios', 'pl') }]) > 1500);
});

test('odtwarzacz z notatką: najpierw notatka, potem pojęcia; liczby pojęć bez notatki; „dalej” pomija notatkę', (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(() => mock.timers.reset());
  const steps = noteSteps({ html: '<p>Raz. Dwa.</p>' }, 'Ratios', 'pl');
  const player = new ListenPlayer({
    cards: [{ term: FULL, direction: PL_EN }, { term: BARE, direction: EN_PL }],
    notes: [{ lessonID: 'l1', lessonName: 'Ratios', steps }, { lessonID: 'l2', lessonName: 'Pusta', steps: [] }],
    options: { thinkMs: 1000 },
    settings: () => ({ speechRate: 1 }),
    onChange: () => {}
  });
  assert.equal(player.total, 2, 'notatka nie jest pojęciem');
  assert.equal(player.notes.length, 1, 'notatka bez kroków jest pomijana');
  player.start();
  assert.equal(player.currentStep().text, 'Zaczynamy. Notatka lekcji i 2 pojęcia.');
  mock.timers.tick(0);
  mock.timers.tick(DETAIL_GAP);
  mock.timers.tick(0);
  assert.equal(player.currentNote()?.lessonName, 'Ratios');
  assert.equal(player.currentCard(), null);
  assert.equal(player.cardNumber, 0);
  assert.equal(player.currentStep().kind, 'note', 'po zapowiedzi notatki jej zdania');
  player.next();
  mock.timers.tick(1000);
  assert.equal(player.currentCard()?.term.id, FULL.id, '„dalej” – pierwsze pojęcie');
  assert.equal(player.cardNumber, 1);
  player.previous();
  assert.equal(player.cardNumber, 1, 'w środku pojęcia – to samo od początku');
  player.previous();
  assert.equal(player.currentNote()?.lessonName, 'Ratios', 'wstecz z początku pierwszego pojęcia – notatka');
  player.stop();
});
