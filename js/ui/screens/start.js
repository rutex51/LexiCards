// Ekran Start: podsumowanie biblioteki i najkrótsza droga do dodania materiałów.

import { sampleTermCount } from '../../core/samples.js';
import { pluralLessons, pluralModules, pluralTerms } from '../../core/text.js';
import { loadSampleData, openDomainForm, openLessonForm, openTermForm } from '../actions.js';
import { actionRow, domainBadge, emptyState, group, primaryButton, settingsAction } from '../components.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { routes } from '../router.js';

/** Zdanie podsumowujące bibliotekę, np. „Masz 40 pojęć w 13 lekcjach.” */
export function summarySentence(summary) {
  if (summary.terms === 0) {
    if (summary.lessons === 0) return 'Biblioteka nie ma jeszcze lekcji ani pojęć.';
    // Biernik: „masz 1 lekcję”; pozostałe formy są takie same jak w mianowniku.
    return `Masz ${summary.lessons === 1 ? '1 lekcję' : pluralLessons(summary.lessons)}, ale jeszcze żadnego pojęcia.`;
  }
  const lessons = summary.lessons === 1 ? '1 lekcji' : `${summary.lessons} lekcjach`;
  return `Masz ${pluralTerms(summary.terms)} w ${lessons}.`;
}

function domainTile(library, domain) {
  const counts = library.counts('domain', domain.id);
  return h('li', { class: 'tile' },
    h('a', { class: 'tile__link', href: routes.domain(domain.id) },
      domainBadge(domain, { large: true }),
      h('span', { class: 'tile__name' }, domain.name),
      h('span', { class: 'tile__meta' }, `${pluralModules(counts.modules)}, ${pluralTerms(counts.terms)}`)
    )
  );
}

export class StartScreen {
  constructor(ctx) {
    this.ctx = ctx;
  }

  view() {
    const { ctx } = this;
    const { library } = ctx;
    const actions = [settingsAction()];

    if (library.isEmpty()) {
      return {
        title: 'Start',
        actions,
        body: emptyState({
          iconName: 'cards',
          title: 'Zacznij od pierwszej dziedziny',
          text: `Dziedzina to temat, którego się uczysz, na przykład „Business English”. Możesz też wczytać ${sampleTermCount()} przykładowych pojęć i od razu zobaczyć, jak działa aplikacja.`,
          actions: [
            primaryButton('Dodaj dziedzinę', () => openDomainForm(ctx), { testID: 'start-add-domain' }),
            primaryButton('Wczytaj przykładowe dane', () => loadSampleData(ctx), { testID: 'start-load-samples', kind: 'secondary' })
          ]
        })
      };
    }

    const summary = library.summary();
    const domains = library.listDomains();

    return {
      title: 'Start',
      subtitle: summarySentence(summary),
      actions,
      body: [
        h('section', { class: 'group' },
          h('h2', { class: 'group__title' }, 'Twoje dziedziny'),
          h('ul', { class: 'tiles', role: 'list' }, domains.map((domain) => domainTile(library, domain)))
        ),
        group({ title: 'Dodaj materiały' },
          actionRow({ label: 'Nowe pojęcie', iconName: 'plus', onClick: () => openTermForm(ctx), testID: 'start-add-term' }),
          actionRow({ label: 'Nowa lekcja', iconName: 'book', onClick: () => openLessonForm(ctx) }),
          actionRow({ label: 'Nowa dziedzina', iconName: 'folder', onClick: () => openDomainForm(ctx) })
        ),
        group({
          title: 'Szukaj',
          footer: summary.favorites > 0 ? `Ulubione: ${pluralTerms(summary.favorites)}.` : null
        },
          h('li', { class: 'row' },
            h('a', { class: 'row__main', href: routes.glossary() },
              h('span', { class: 'row__leading row__leading--icon' }, icon('search')),
              h('span', { class: 'row__text' },
                h('span', { class: 'row__title' }, 'Glosariusz'),
                h('span', { class: 'row__subtitle' }, 'Wszystkie pojęcia w jednym miejscu')
              ),
              h('span', { class: 'row__chevron' }, icon('chevronRight', { size: 18 }))
            )
          )
        ),
        h('p', { class: 'note' },
          icon('info', { size: 18 }),
          h('span', null,
            'Dane są zapisane tylko w tej przeglądarce na tym urządzeniu. ',
            h('a', { href: routes.settings() }, 'Zapisz kopię zapasową'),
            ', żeby ich nie stracić albo przenieść je na inne urządzenie.'
          )
        )
      ]
    };
  }
}
