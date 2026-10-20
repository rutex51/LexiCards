// Plik kalendarza .ics (od 1.23, RFC 5545) – nauka zaplanowana w Outlooku albo innym kalendarzu, bez
// serwera: termin z czasem trwania, powtarzanie (codziennie albo w wybrane dni tygodnia – do dnia albo
// N razy), przypomnienie, prywatność („Prywatne”, „Zajęty”), opis z linkami do lekcji. Strefa czasowa
// urządzenia z regułami zmiany czasu (VTIMEZONE wyliczona z przeglądarki) – termin o 18:00 zostaje
// o 18:00 także po zmianie czasu. Bez przeglądarki (poza Intl).

import { dayValue } from './created.js';

/** Dni tygodnia RFC 5545 od poniedziałku (jak WEEKDAYS w core/calendar.js). */
export const ICS_DAYS = Object.freeze(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
export const PLAN_DURATIONS = Object.freeze([15, 20, 30, 45, 60, 90]);
export const PLAN_REMINDERS = Object.freeze([0, 5, 10, 15, 30, 60]);
export const PLAN_REPEATS = Object.freeze(['once', 'daily', 'weekly']);
export const PLAN_COUNT_MAX = 365;

const pad = (value, size = 2) => String(value).padStart(size, '0');

/** Tekst wartości (RFC 5545 3.3.11): ukośnik, średnik, przecinek i nowe wiersze poprzedzone ukośnikiem. */
export const escapeText = (text) => String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Wiersz zawinięty do 75 bajtów UTF-8 (kolejne części od spacji), bez dzielenia znaku. */
export function foldLine(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Przesunięcie strefy `zone` (minuty na wschód od UTC) w chwili `time` (ms) – z Intl. */
export function zoneOffset(zone, time) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
  }).formatToParts(new Date(time)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return Math.round((wall - Math.floor(time / 1000) * 1000) / 60000);
}

/** Czas „na zegarze” { year, month (1–12), day, hour, minute } jako liczba ms (UTC tych samych cyfr). */
const wallTime = ({ year, month, day, hour = 0, minute = 0, second = 0 }) => Date.UTC(year, month - 1, day, hour, minute, second);
const wallParts = (time) => {
  const date = new Date(time);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds() };
};
/** „20261020T180000” (czas na zegarze) i „20261020T160000Z” (UTC). */
const localStamp = (parts) => `${parts.year}${pad(parts.month)}${pad(parts.day)}T${pad(parts.hour)}${pad(parts.minute)}${pad(parts.second ?? 0)}`;
export const utcStamp = (time) => `${localStamp(wallParts(time))}Z`;

/** Chwila (ms UTC) godziny na zegarze w strefie `zone`. */
export function zoneInstant(zone, parts) {
  const wall = wallTime(parts);
  let time = wall - zoneOffset(zone, wall) * 60000;
  // Drugie przybliżenie – przesunięcie w samej chwili (przy zmianie czasu).
  time = wall - zoneOffset(zone, time) * 60000;
  return time;
}

const offsetText = (minutes) => `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}${pad(Math.abs(minutes) % 60)}`;

/** n-ty (n > 0) albo ostatni (n = −1) dzień tygodnia `weekday` (0 – niedziela) miesiąca. */
function nthWeekday(year, month, weekday, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, days)).getUTCDay();
  return days - ((last - weekday + 7) % 7);
}

const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * Opis strefy (VTIMEZONE) z reguł zmiany czasu w roku `year`: bez zmiany – samo STANDARD; ze zmianą –
 * STANDARD i DAYLIGHT z regułą „n-ta / ostatnia niedziela miesiąca o godzinie” odczytaną z Intl.
 */
export function timezoneLines(zone, year) {
  const start = Date.UTC(year, 0, 1);
  const transitions = [];
  let previous = zoneOffset(zone, start);
  for (let day = 1; day <= 366; day += 1) {
    const time = start + day * 86400000;
    const offset = zoneOffset(zone, time);
    if (offset === previous) continue;
    // Godzina zmiany (co 15 minut w ostatniej dobie).
    let moment = time - 86400000;
    while (zoneOffset(zone, moment + 900000) === previous) moment += 900000;
    transitions.push({ time: moment + 900000, from: previous, to: offset });
    previous = offset;
  }
  if (transitions.length === 0) {
    const offset = offsetText(previous);
    return ['BEGIN:VTIMEZONE', `TZID:${zone}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${offset}`, `TZOFFSETTO:${offset}`, 'END:STANDARD', 'END:VTIMEZONE'];
  }
  const lines = ['BEGIN:VTIMEZONE', `TZID:${zone}`];
  for (const change of transitions.slice(0, 2)) {
    // Czas na zegarze tuż przed zmianą (według poprzedniego przesunięcia).
    const local = wallParts(change.time + change.from * 60000);
    const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
    const days = new Date(Date.UTC(local.year, local.month, 0)).getUTCDate();
    const n = local.day + 7 > days ? -1 : Math.ceil(local.day / 7);
    const kind = change.to > change.from ? 'DAYLIGHT' : 'STANDARD';
    const first = { year: 1970, month: local.month, day: nthWeekday(1970, local.month, weekday, n), hour: local.hour, minute: local.minute };
    lines.push(`BEGIN:${kind}`, `DTSTART:${localStamp(first)}`, `RRULE:FREQ=YEARLY;BYMONTH=${local.month};BYDAY=${n}${RRULE_DAYS[weekday]}`,
      `TZOFFSETFROM:${offsetText(change.from)}`, `TZOFFSETTO:${offsetText(change.to)}`, `END:${kind}`);
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

/** Pierwszy dzień planu: `day` albo – przy wybranych dniach tygodnia – najbliższy z nich od `day`. */
export function firstPlanDay(day, repeat, days) {
  if (repeat !== 'weekly' || days.length === 0) return day;
  const [year, month, date] = day.split('-').map(Number);
  for (let step = 0; step < 7; step += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, date + step));
    const index = (candidate.getUTCDay() + 6) % 7;
    if (days.includes(index)) return `${candidate.getUTCFullYear()}-${pad(candidate.getUTCMonth() + 1)}-${pad(candidate.getUTCDate())}`;
  }
  return day;
}

/** Skrót z napisu (FNV-1a) – stały identyfikator wydarzenia dla tego samego planu. */
function hashText(text) {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Sprawdzony plan (ustawienia okna): złe wartości – domyślne. */
export function cleanPlan(raw, today = dayValue()) {
  const plan = raw && typeof raw === 'object' ? raw : {};
  const int = (value, low, high, fallback) => (Number.isInteger(value) && value >= low && value <= high ? value : fallback);
  const days = Array.isArray(plan.days) ? [...new Set(plan.days.filter((day) => Number.isInteger(day) && day >= 0 && day < 7))].sort() : [];
  const todayIndex = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  return {
    day: /^\d{4}-\d{2}-\d{2}$/.test(plan.day ?? '') && plan.day >= today ? plan.day : today,
    hour: int(plan.hour, 0, 23, 18),
    minute: int(plan.minute, 0, 59, 0),
    duration: PLAN_DURATIONS.includes(plan.duration) ? plan.duration : 30,
    repeat: PLAN_REPEATS.includes(plan.repeat) ? plan.repeat : 'weekly',
    days: days.length > 0 ? days : [todayIndex],
    end: plan.end === 'until' ? 'until' : 'count',
    count: int(plan.count, 1, PLAN_COUNT_MAX, 10),
    until: /^\d{4}-\d{2}-\d{2}$/.test(plan.until ?? '') && plan.until >= today ? plan.until : null,
    reminder: PLAN_REMINDERS.includes(plan.reminder) ? plan.reminder : 15,
    private: plan.private !== false,
    busy: plan.busy !== false,
    links: plan.links !== false
  };
}

/**
 * Plik kalendarza: { title, description, url, lessons: [{ title, url }], plan (cleanPlan), zone, now }.
 * Zwraca tekst .ics (wiersze CRLF, zawinięte do 75 bajtów).
 */
export function buildCalendar({ title, description = '', url = null, lessons = [], plan, zone, now = Date.now() }) {
  const [year, month, day] = firstPlanDay(plan.day, plan.repeat, plan.days).split('-').map(Number);
  const start = { year, month, day, hour: plan.hour, minute: plan.minute, second: 0 };
  const end = wallParts(wallTime(start) + plan.duration * 60000);
  let rule = null;
  if (plan.repeat !== 'once') {
    rule = plan.repeat === 'daily' ? 'FREQ=DAILY' : `FREQ=WEEKLY;BYDAY=${plan.days.map((index) => ICS_DAYS[index]).join(',')};WKST=MO`;
    if (plan.end === 'until' && plan.until) {
      const [untilYear, untilMonth, untilDay] = plan.until.split('-').map(Number);
      rule += `;UNTIL=${utcStamp(zoneInstant(zone, { year: untilYear, month: untilMonth, day: untilDay, hour: 23, minute: 59, second: 59 }))}`;
    } else {
      rule += `;COUNT=${plan.count}`;
    }
  }
  const text = [description, url && plan.links ? `Rozpocznij naukę: ${url}` : '', ...(plan.links && lessons.length > 0
    ? ['', 'Lekcje:', ...lessons.map((lesson) => `• ${lesson.title}${lesson.url ? ` – ${lesson.url}` : ''}`)]
    : [])].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '')).join('\n').trim();
  const uid = `lexicards-${hashText(`${title}|${localStamp(start)}|${rule ?? ''}|${lessons.map((lesson) => lesson.title).join('|')}`)}@lexicards.local`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LexiCards//Nauka//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:LexiCards – nauka',
    ...timezoneLines(zone, year),
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=${zone}:${localStamp(start)}`,
    `DTEND;TZID=${zone}:${localStamp(end)}`,
    ...(rule ? [`RRULE:${rule}`] : []),
    `SUMMARY:${escapeText(title)}`,
    ...(text ? [`DESCRIPTION:${escapeText(text)}`] : []),
    ...(url && plan.links ? [`URL:${url}`] : []),
    `CLASS:${plan.private ? 'PRIVATE' : 'PUBLIC'}`,
    `TRANSP:${plan.busy ? 'OPAQUE' : 'TRANSPARENT'}`,
    `X-MICROSOFT-CDO-BUSYSTATUS:${plan.busy ? 'BUSY' : 'FREE'}`,
    'CATEGORIES:LexiCards',
    ...(plan.reminder > 0 ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(title)}`, `TRIGGER:-PT${plan.reminder}M`, 'END:VALARM'] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/**
 * Opis planu po polsku: „pn, śr, pt o 18:00 przez 30 min, od 21 października 2026, 10 razy”;
 * longDay – dzień z nazwą dnia tygodnia, dayText – sam dzień.
 */
export function describePlan(plan, { weekdays, longDay, dayText }) {
  const time = `${pad(plan.hour)}:${pad(plan.minute)}`;
  const first = firstPlanDay(plan.day, plan.repeat, plan.days);
  const when = plan.repeat === 'once' ? longDay(first)
    : plan.repeat === 'daily' ? 'codziennie'
      : plan.days.map((index) => weekdays[index].toLowerCase()).join(', ');
  const ending = plan.repeat === 'once' ? ''
    : plan.end === 'until' && plan.until ? `, do ${dayText(plan.until)}` : `, ${plan.count} ${plan.count === 1 ? 'raz' : 'razy'}`;
  const duration = plan.duration < 60 ? `${plan.duration} min` : plan.duration === 60 ? '1 h' : `${formatHours(plan.duration)} h`;
  return `${when} o ${time} przez ${duration}${plan.repeat === 'once' ? '' : `, od ${dayText(first)}`}${ending}`;
}
const formatHours = (minutes) => String(minutes / 60).replace('.', ',');
