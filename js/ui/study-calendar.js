// Plan nauki w kalendarzu (od 1.23): okno z pierwszym dniem, godziną, czasem trwania, powtarzaniem
// (codziennie albo w wybrane dni tygodnia – N razy albo do dnia), przypomnieniem i prywatnością; zapis
// pliku .ics (core/ics.js) do Outlooka albo innego kalendarza – bez serwera. W opisie wydarzenia – linki
// do Nauki z wybranym materiałem i do każdej lekcji.

import { MONTHS_OF, WEEKDAYS, addDays, longDay } from '../core/calendar.js';
import { dayValue } from '../core/created.js';
import { PLAN_COUNT_MAX, PLAN_DURATIONS, PLAN_REMINDERS, buildCalendar, cleanPlan, describePlan, firstPlanDay } from '../core/ics.js';
import { describeStudyMaterial } from '../core/study.js';
import { pluralLessons } from '../core/text.js';
import { field, segmented, textInput, toggle } from './components.js';
import { calendar, timeDrums } from './date-picker.js';
import { openFormSheet, toast } from './dialogs.js';
import { h, replaceChildren } from './dom.js';
import { deliverFile } from './files.js';
import { routes } from './router.js';

/** Najwięcej lekcji wymienionych w opisie wydarzenia (więcej – „i N innych”). */
const LESSONS_LISTED = 30;

/** Lekcje materiału nauki: wybrane, modułu, dziedziny albo całej biblioteki. */
function planLessons(library, config) {
  if (config.lessonIDs.length > 0) return config.lessonIDs.map((id) => library.getLesson(id)).filter(Boolean);
  const modules = config.moduleID ? [library.getModule(config.moduleID)].filter(Boolean)
    : (config.domainID ? [config.domainID] : library.listDomains().map((domain) => domain.id)).flatMap((id) => library.listModules(id));
  return modules.flatMap((module) => library.listLessons(module.id));
}

/** Adres Nauki z wybranym materiałem (bez adresu strony). */
function studyLink(config) {
  if (config.lessonIDs.length === 1) return routes.study({ level: 'lesson', id: config.lessonIDs[0] });
  if (config.lessonIDs.length > 1) return routes.studyLessons(config.lessonIDs);
  if (config.moduleID) return routes.study({ level: 'module', id: config.moduleID });
  if (config.domainID) return routes.study({ level: 'domain', id: config.domainID });
  return routes.study();
}

/** Dzień bez nazwy dnia tygodnia: „20 października 2026”. */
const dayText = (day) => {
  const [year, month, date] = day.split('-').map(Number);
  return `${date} ${MONTHS_OF[month - 1]} ${year}`;
};

/** Nazwa pliku: „nauka-modul-bilans.ics” (bez polskich znaków i spacji). */
const fileName = (title) => `${title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'nauka'}.ics`;

/**
 * Okno „Nauka w kalendarzu” dla materiału `config` (domainID, moduleID, lessonIDs) z ekranu Nauka.
 * Wybory zostają w ustawieniach (calendarPlan).
 */
export function openStudyCalendar(ctx, config) {
  const { library } = ctx;
  const today = dayValue();
  const plan = cleanPlan(library.getSettings().calendarPlan, today);
  const material = describeStudyMaterial(library, config);
  let title = `Nauka – ${material}`;
  // Dziś już po wybranej godzinie – pierwszy termin jutro.
  const now = new Date();
  if (plan.day === today && now.getHours() * 60 + now.getMinutes() >= plan.hour * 60 + plan.minute) plan.day = addDays(today, 1);
  // Pierwszy plan – dzień tygodnia pierwszego dnia.
  if (!library.getSettings().calendarPlan) plan.days = [(new Date(`${plan.day}T12:00:00Z`).getUTCDay() + 6) % 7];
  const lessons = planLessons(library, config);

  const summary = h('p', { class: 'calendar-plan__summary', role: 'status', dataset: { testid: 'study-calendar-summary' } });
  const dayLabel = h('p', { class: 'calendar-plan__day', dataset: { testid: 'study-calendar-day-label' } });
  const untilBox = h('div', { class: 'calendar-plan__until' });
  const daysRow = h('div', { class: 'calendar-plan__days', role: 'group', 'aria-label': 'Dni tygodnia' });
  const countInput = h('input', {
    class: 'input calendar-plan__count', type: 'number', inputmode: 'numeric', min: '1', max: String(PLAN_COUNT_MAX), value: String(plan.count),
    'aria-label': 'Liczba terminów', dataset: { testid: 'study-calendar-count' },
    onInput: (event) => {
      const value = Number(event.target.value);
      if (Number.isInteger(value) && value >= 1 && value <= PLAN_COUNT_MAX) plan.count = value;
      refresh();
    }
  });
  const weeklyBlock = h('div', null);
  const endBlock = h('div', null);
  const countBlock = h('div', { class: 'calendar-plan__count-row' }, countInput, h('span', null, 'terminów'));

  function renderDays() {
    replaceChildren(daysRow, WEEKDAYS.map((label, index) => h('button', {
      type: 'button', class: 'picker-chip calendar-plan__weekday', 'aria-pressed': String(plan.days.includes(index)), dataset: { testid: `study-calendar-weekday-${index}` },
      onClick: () => {
        // Co najmniej jeden dzień tygodnia.
        if (plan.days.includes(index)) {
          if (plan.days.length > 1) plan.days = plan.days.filter((day) => day !== index);
        } else {
          plan.days = [...plan.days, index].sort();
        }
        renderDays();
        refresh();
      }
    }, label)));
  }
  function renderUntil() {
    replaceChildren(untilBox, plan.end === 'until' ? calendar({
      value: plan.until ?? plan.day, testID: 'study-calendar-until',
      onPick: (day) => {
        plan.until = day < plan.day ? plan.day : day;
        refresh();
      }
    }).element : countBlock);
  }
  function refresh() {
    weeklyBlock.hidden = plan.repeat !== 'weekly';
    endBlock.hidden = plan.repeat === 'once';
    if (plan.end === 'until' && !plan.until) plan.until = plan.day;
    dayLabel.textContent = longDay(firstPlanDay(plan.day, plan.repeat, plan.days));
    summary.textContent = `W kalendarzu: ${describePlan(plan, { weekdays: WEEKDAYS, longDay, dayText })}.`;
  }

  let done = false;
  openFormSheet({
    title: 'Nauka w kalendarzu',
    submitLabel: 'Zapisz .ics',
    build: () => {
      renderDays();
      renderUntil();
      replaceChildren(weeklyBlock, field('Dni tygodnia', daysRow));
      replaceChildren(endBlock, field('Koniec powtarzania', h('div', null, segmented({
        name: 'study-calendar-end', label: 'Koniec powtarzania', value: plan.end,
        options: [{ value: 'count', label: 'Po liczbie terminów' }, { value: 'until', label: 'W wybranym dniu' }],
        onChange: (value) => {
          plan.end = value;
          renderUntil();
          refresh();
        }
      }), untilBox)));
      refresh();
      return [
        h('p', { class: 'calendar-plan__material', dataset: { testid: 'study-calendar-material' } },
          lessons.length > 1 ? `${material} · ${pluralLessons(lessons.length)}` : material),
        field('Tytuł wydarzenia', textInput({ value: title, testID: 'study-calendar-title', onInput: (value) => { title = value; } })),
        field('Pierwszy dzień', h('div', null, dayLabel, calendar({
          value: plan.day, testID: 'study-calendar-start',
          onPick: (day) => {
            plan.day = day < today ? today : day;
            if (plan.until && plan.until < plan.day) plan.until = plan.day;
            refresh();
          }
        }).element)),
        field('Godzina', timeDrums({
          hour: plan.hour, minute: plan.minute, testID: 'study-calendar-time',
          onChange: ({ hour, minute }) => {
            plan.hour = hour;
            plan.minute = minute;
            refresh();
          }
        }).element),
        field('Czas trwania', segmented({
          name: 'study-calendar-duration', label: 'Czas trwania', value: String(plan.duration),
          options: PLAN_DURATIONS.map((minutes) => ({ value: String(minutes), label: minutes < 60 ? `${minutes} min` : minutes === 60 ? '1 h' : '1,5 h' })),
          onChange: (value) => {
            plan.duration = Number(value);
            refresh();
          }
        })),
        field('Powtarzanie', segmented({
          name: 'study-calendar-repeat', label: 'Powtarzanie', value: plan.repeat,
          options: [{ value: 'once', label: 'Jednorazowo' }, { value: 'daily', label: 'Codziennie' }, { value: 'weekly', label: 'Wybrane dni' }],
          onChange: (value) => {
            plan.repeat = value;
            refresh();
          }
        })),
        weeklyBlock,
        endBlock,
        field('Przypomnienie', segmented({
          name: 'study-calendar-reminder', label: 'Przypomnienie', value: String(plan.reminder),
          options: PLAN_REMINDERS.map((minutes) => ({ value: String(minutes), label: minutes === 0 ? 'Brak' : minutes === 60 ? '1 h' : `${minutes} min` })),
          onChange: (value) => {
            plan.reminder = Number(value);
            refresh();
          }
        })),
        h('div', { class: 'calendar-plan__switches' },
          ...[
            ['private', 'Prywatne – inni widzą tylko zajęty czas', 'study-calendar-private'],
            ['busy', 'Pokaż jako: zajęty', 'study-calendar-busy'],
            ['links', 'Linki do lekcji w opisie', 'study-calendar-links']
          ].map(([key, label, testID]) => {
            const row = toggle({ checked: plan[key], label, onChange: (checked) => { plan[key] = checked; } });
            row.querySelector('input').dataset.testid = testID;
            return row;
          })),
        summary,
        h('p', { class: 'field__hint' }, 'W Outlooku: Kalendarz → Dodaj kalendarz → Prześlij z pliku (albo otwórz plik dwukrotnym kliknięciem). '
          + 'Linki otwierają Naukę z tym materiałem tam, gdzie są dane aplikacji – na Windows w tej przeglądarce; na iPhonie link otworzy '
          + 'Safari, a aplikacja z ekranu początkowego ma osobne dane. Ponowny import tego samego pliku może zdublować wydarzenia – usuń '
          + 'stare albo zaimportuj do osobnego kalendarza. Plik nie łączy się z żadnym serwerem: zmiana planu to nowy plik.')
      ];
    },
    onSubmit: async (api) => {
      if (!title.trim()) {
        api.setError('Wpisz tytuł wydarzenia.');
        return false;
      }
      const base = `${location.origin}${location.pathname}`;
      const listed = lessons.slice(0, LESSONS_LISTED).map((lesson) => {
        const module = library.getModule(lesson.moduleID);
        return { title: module ? `${module.name} › ${lesson.name}` : lesson.name, url: `${base}${routes.study({ level: 'lesson', id: lesson.id })}` };
      });
      const extra = lessons.length - listed.length;
      const text = buildCalendar({
        title: title.trim(),
        description: `Nauka w LexiCards – ${material}.${extra > 0 ? ` W opisie ${listed.length} z ${lessons.length} lekcji.` : ''}`,
        url: `${base}${studyLink(config)}`,
        lessons: listed,
        plan,
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      });
      await library.updateSettings({ calendarPlan: { ...plan } });
      done = true;
      const file = new File([text], fileName(title.trim()), { type: 'text/calendar' });
      const result = await deliverFile(file, { title: 'Plik kalendarza', message: `„${file.name}” – otwórz go w Outlooku albo zapisz w Plikach.` });
      if (result !== 'cancelled') toast(`Zapisano ${file.name}.`);
      return true;
    },
    onClose: () => {
      if (!done) library.updateSettings({ calendarPlan: { ...plan } }).catch((error) => console.error(error));
    }
  });
}
