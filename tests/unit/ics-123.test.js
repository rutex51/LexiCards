// Wersja 1.23: plik kalendarza .ics – tekst i zawijanie wierszy, strefa czasowa z regułami zmiany
// czasu, powtarzanie, przypomnienie, prywatność, linki do lekcji; link do Nauki z kilkoma lekcjami.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ICS_DAYS, buildCalendar, cleanPlan, describePlan, escapeText, firstPlanDay, foldLine, timezoneLines, utcStamp, zoneInstant, zoneOffset
} from '../../js/core/ics.js';
import { parseHash, routes } from '../../js/ui/router.js';

const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const plan = (extra = {}) => cleanPlan({ day: '2026-10-20', hour: 18, minute: 0, duration: 30, repeat: 'weekly', days: [0, 2, 4], ...extra }, '2026-10-20');
/** Wiersze pliku po rozwinięciu zawiniętych (RFC 5545 3.1). */
const unfold = (text) => text.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
/** Pierwszy wiersz właściwości `name` w wydarzeniu (VEVENT, nie w opisie strefy). */
const value = (lines, name) => lines.slice(lines.indexOf('BEGIN:VEVENT')).find((line) => line.startsWith(`${name}:`) || line.startsWith(`${name};`));

test('kalendarz 1.23: tekst wartości, zawijanie do 75 bajtów bez dzielenia znaku', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = `DESCRIPTION:${'ąę'.repeat(60)}`;
  const folded = foldLine(long);
  const parts = folded.split('\r\n');
  assert.ok(parts.length > 2);
  const encoder = new TextEncoder();
  for (const part of parts) assert.ok(encoder.encode(part).length <= 75, `część ${encoder.encode(part).length} bajtów`);
  assert.ok(parts.slice(1).every((part) => part.startsWith(' ')), 'kolejne części od spacji');
  assert.equal(parts.map((part, index) => (index === 0 ? part : part.slice(1))).join(''), long, 'po rozwinięciu – ten sam tekst');
  assert.equal(foldLine('SUMMARY:krótki'), 'SUMMARY:krótki');
});

test('kalendarz 1.23: strefa czasowa – przesunięcie z Intl, godzina na zegarze, reguły zmiany czasu (Warszawa, Nowy Jork, Sydney, Tokio)', () => {
  assert.equal(zoneOffset('Europe/Warsaw', Date.UTC(2026, 6, 1)), 120);
  assert.equal(zoneOffset('Europe/Warsaw', Date.UTC(2026, 0, 1)), 60);
  assert.equal(zoneOffset('America/New_York', Date.UTC(2026, 0, 1)), -300);
  // 18:00 w Warszawie: latem 16:00 UTC, zimą 17:00 UTC; 23:59:59 w dniu zakończenia.
  assert.equal(utcStamp(zoneInstant('Europe/Warsaw', { year: 2026, month: 7, day: 1, hour: 18, minute: 0 })), '20260701T160000Z');
  assert.equal(utcStamp(zoneInstant('Europe/Warsaw', { year: 2026, month: 12, day: 18, hour: 23, minute: 59, second: 59 })), '20261218T225959Z');
  const warsaw = timezoneLines('Europe/Warsaw', 2026);
  assert.deepEqual(warsaw.filter((line) => /^(BEGIN|DTSTART|RRULE|TZOFFSET)/.test(line)), [
    'BEGIN:VTIMEZONE',
    'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200',
    'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100'
  ]);
  const newYork = timezoneLines('America/New_York', 2026).join('\n');
  assert.ok(newYork.includes('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU') && newYork.includes('RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU'), 'druga niedziela marca, pierwsza listopada');
  const sydney = timezoneLines('Australia/Sydney', 2026).join('\n');
  assert.ok(sydney.includes('BYMONTH=10;BYDAY=1SU') && sydney.includes('TZOFFSETTO:+1100'), 'półkula południowa – czas letni od października');
  assert.deepEqual(timezoneLines('Asia/Tokyo', 2026).filter((line) => line.startsWith('TZOFFSET')), ['TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900']);
});

test('kalendarz 1.23: plan – pierwszy dzień z wybranych dni tygodnia, sprawdzanie ustawień, opis po polsku', () => {
  // 20.10.2026 to wtorek: pn, śr, pt – pierwszy termin w środę.
  assert.equal(firstPlanDay('2026-10-20', 'weekly', [0, 2, 4]), '2026-10-21');
  assert.equal(firstPlanDay('2026-10-20', 'weekly', [1]), '2026-10-20');
  assert.equal(firstPlanDay('2026-10-20', 'daily', [0]), '2026-10-20');
  assert.equal(firstPlanDay('2026-12-31', 'weekly', [0]), '2027-01-04', 'przez nowy rok');
  const fresh = cleanPlan(null, '2026-10-20');
  assert.deepEqual(fresh, {
    day: '2026-10-20', hour: 18, minute: 0, duration: 30, repeat: 'weekly', days: [1], end: 'count', count: 10, until: null,
    reminder: 15, private: true, busy: true, links: true
  });
  const wrong = cleanPlan({ day: '2026-10-01', hour: 25, duration: 17, repeat: 'yearly', days: [9, 2, 2], count: 0, reminder: 7, until: '2026-01-01', private: false, busy: false, links: false }, '2026-10-20');
  assert.deepEqual([wrong.day, wrong.hour, wrong.duration, wrong.repeat, wrong.days, wrong.count, wrong.reminder, wrong.until],
    ['2026-10-20', 18, 30, 'weekly', [2], 10, 15, null], 'przeszły dzień – dziś, złe wartości – domyślne');
  assert.deepEqual([wrong.private, wrong.busy, wrong.links], [false, false, false]);
  const longDay = (day) => `dzień ${day}`;
  const dayText = (day) => day.split('-').reverse().join('.');
  assert.equal(describePlan(plan(), { weekdays: WEEKDAYS, longDay, dayText }), 'pn, śr, pt o 18:00 przez 30 min, od 21.10.2026, 10 razy');
  assert.equal(describePlan(plan({ repeat: 'daily', end: 'until', until: '2026-12-18', duration: 90 }), { weekdays: WEEKDAYS, longDay, dayText }),
    'codziennie o 18:00 przez 1,5 h, od 20.10.2026, do 18.12.2026');
  assert.equal(describePlan(plan({ repeat: 'once', minute: 5 }), { weekdays: WEEKDAYS, longDay, dayText }), 'dzień 2026-10-20 o 18:05 przez 30 min');
});

test('kalendarz 1.23: plik – wydarzenie w strefie urządzenia, powtarzanie (dni tygodnia N razy, codziennie do dnia, jednorazowo), przypomnienie, prywatność, linki', () => {
  const lessons = [
    { title: 'Bilans › Aktywa, pasywa', url: 'https://example.com/LexiCards/#/study/lesson/a1' },
    { title: 'Bilans › Kapitał', url: 'https://example.com/LexiCards/#/study/lesson/b2' }
  ];
  const text = buildCalendar({
    title: 'Nauka – Lekcje: Aktywa, Kapitał', description: 'Nauka w LexiCards.', url: 'https://example.com/LexiCards/#/study/lessons/a1+b2',
    lessons, plan: plan(), zone: 'Europe/Warsaw', now: Date.UTC(2026, 9, 20, 12)
  });
  assert.ok(text.endsWith('\r\n') && !/[^\r]\n/.test(text), 'wiersze CRLF');
  assert.ok(text.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75), 'każdy wiersz najwyżej 75 bajtów');
  const lines = unfold(text);
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines.at(-1), 'END:VCALENDAR');
  assert.ok(lines.includes('VERSION:2.0') && lines.includes('METHOD:PUBLISH'));
  assert.equal(value(lines, 'DTSTART'), 'DTSTART;TZID=Europe/Warsaw:20261021T180000', 'pierwszy termin – środa');
  assert.equal(value(lines, 'DTEND'), 'DTEND;TZID=Europe/Warsaw:20261021T183000');
  assert.equal(value(lines, 'RRULE'), 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;WKST=MO;COUNT=10');
  assert.equal(value(lines, 'SUMMARY'), 'SUMMARY:Nauka – Lekcje: Aktywa\\, Kapitał');
  assert.equal(value(lines, 'DTSTAMP'), 'DTSTAMP:20261020T120000Z');
  assert.ok(lines.includes('CLASS:PRIVATE') && lines.includes('TRANSP:OPAQUE') && lines.includes('X-MICROSOFT-CDO-BUSYSTATUS:BUSY'));
  assert.ok(lines.includes('TRIGGER:-PT15M') && lines.includes('ACTION:DISPLAY'), 'przypomnienie 15 min wcześniej');
  assert.equal(value(lines, 'URL'), 'URL:https://example.com/LexiCards/#/study/lessons/a1+b2');
  const description = value(lines, 'DESCRIPTION');
  assert.ok(description.includes('Rozpocznij naukę: https://example.com/LexiCards/#/study/lessons/a1+b2'));
  assert.ok(description.includes('• Bilans › Aktywa\\, pasywa – https://example.com/LexiCards/#/study/lesson/a1'));
  assert.ok(description.includes('\\n\\nLekcje:\\n'), 'lista lekcji po pustym wierszu');
  assert.match(value(lines, 'UID'), /^UID:lexicards-[a-z0-9]+@lexicards\.local$/);
  assert.equal(lines.filter((line) => line === 'BEGIN:VTIMEZONE').length, 1);
  // Ten sam plan – ten sam identyfikator; inna godzina – inny.
  const same = unfold(buildCalendar({ title: 'Nauka – Lekcje: Aktywa, Kapitał', lessons, plan: plan(), zone: 'Europe/Warsaw' }));
  assert.equal(value(same, 'UID'), value(lines, 'UID'));
  const later = unfold(buildCalendar({ title: 'Nauka – Lekcje: Aktywa, Kapitał', lessons, plan: plan({ hour: 19 }), zone: 'Europe/Warsaw' }));
  assert.notEqual(value(later, 'UID'), value(lines, 'UID'));

  // Codziennie do dnia (UNTIL w UTC – koniec dnia w strefie), publiczne, wolne, bez przypomnienia i bez linków.
  const daily = unfold(buildCalendar({
    title: 'Nauka', url: 'https://example.com/#/study', lessons,
    plan: plan({ repeat: 'daily', end: 'until', until: '2026-12-18', reminder: 0, private: false, busy: false, links: false }), zone: 'Europe/Warsaw'
  }));
  assert.equal(value(daily, 'RRULE'), 'RRULE:FREQ=DAILY;UNTIL=20261218T225959Z');
  assert.equal(value(daily, 'DTSTART'), 'DTSTART;TZID=Europe/Warsaw:20261020T180000');
  assert.ok(daily.includes('CLASS:PUBLIC') && daily.includes('TRANSP:TRANSPARENT') && daily.includes('X-MICROSOFT-CDO-BUSYSTATUS:FREE'));
  assert.equal(daily.some((line) => line.startsWith('BEGIN:VALARM')), false, 'bez przypomnienia');
  assert.equal(value(daily, 'URL'), undefined, 'bez linków');
  assert.equal(value(daily, 'DESCRIPTION'), undefined);
  // Jednorazowo, przez północ – bez RRULE, koniec następnego dnia.
  const once = unfold(buildCalendar({ title: 'Nauka', plan: plan({ repeat: 'once', hour: 23, minute: 45, duration: 30 }), zone: 'UTC' }));
  assert.equal(value(once, 'RRULE'), undefined);
  assert.equal(value(once, 'DTEND'), 'DTEND;TZID=UTC:20261021T001500');
  assert.deepEqual(ICS_DAYS, ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
});

test('kalendarz 1.23: link do Nauki z kilkoma lekcjami – adres i odczyt', () => {
  const hash = routes.studyLessons(['a1', 'b 2']);
  assert.equal(hash, '#/study/lessons/a1+b%202');
  assert.deepEqual(parseHash(hash), { tab: 'study', name: 'study', id: 'lessons:a1+b 2', preset: { level: 'lessons', ids: ['a1', 'b 2'] } });
  assert.deepEqual(parseHash('#/study/lessons/'), { tab: 'study', name: 'study' });
  assert.equal(parseHash('#/study/lesson/x').preset.level, 'lesson', 'jedna lekcja – jak dotąd');
});
