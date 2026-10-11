// Zakładki, których funkcje powstają w kolejnych etapach. Ekran mówi wprost,
// czego jeszcze nie ma, i odsyła tam, gdzie już można coś zrobić.

import { emptyState, settingsAction } from '../components.js';
import { h } from '../dom.js';
import { routes } from '../router.js';

const SCREENS = {
  study: {
    title: 'Nauka',
    iconName: 'cards',
    heading: 'Fiszki są w przygotowaniu',
    text: 'Tutaj będziesz przeglądać fiszki, oceniać znajomość pojęcia, definicji i przykładu oraz powtarzać materiał w odstępach dobranych do tego, co już umiesz.'
  },
  quiz: {
    title: 'Quiz',
    iconName: 'quiz',
    heading: 'Quizy są w przygotowaniu',
    text: 'Tutaj sprawdzisz się w testach jednokrotnego wyboru, łączeniu pojęć z tłumaczeniami i quizach mieszanych.'
  },
  stats: {
    title: 'Statystyki',
    iconName: 'stats',
    heading: 'Statystyki są w przygotowaniu',
    text: 'Tutaj zobaczysz postępy nauki: opanowane pojęcia, zaplanowane powtórki i wyniki quizów.'
  }
};

export class UpcomingScreen {
  constructor(ctx, route) {
    this.ctx = ctx;
    this.config = SCREENS[route.name];
  }

  view() {
    const { config } = this;
    const hasTerms = this.ctx.library.summary().terms > 0;
    return {
      title: config.title,
      actions: [settingsAction()],
      body: emptyState({
        iconName: config.iconName,
        title: config.heading,
        text: `${config.text} ${hasTerms ? 'Twoje pojęcia czekają w Bibliotece.' : 'Na razie dodaj materiały w Bibliotece.'}`,
        actions: [h('a', { class: 'button button--primary', href: routes.domains() }, 'Otwórz Bibliotekę')]
      })
    };
  }
}
