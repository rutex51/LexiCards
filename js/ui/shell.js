// Powłoka aplikacji: pasek zakładek u dołu (telefon) albo panel boczny (szeroki ekran),
// pasek nawigacji z przyciskiem powrotu i poleceniami oraz obszar treści.

import { captureFocus, h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { TABS, routes } from './router.js';

/** Zakładka wyróżniona na pasku u dołu ekranu (telefon). */
const PRIMARY_TAB = 'study';

export class Shell {
  constructor(root, router) {
    this.router = router;
    this.tabLinks = new Map();
    this.sideLinks = new Map();

    this.backSlot = h('div', { class: 'navbar__back' });
    this.actionSlot = h('div', { class: 'navbar__actions' });
    this.inlineTitle = h('div', { class: 'navbar__inline-title', 'aria-hidden': 'true' });
    this.titleElement = h('h1', { class: 'screen__title', tabindex: '-1' });
    this.subtitleElement = h('p', { class: 'screen__subtitle', hidden: true });
    this.bodyElement = h('div', { class: 'screen__body' });
    this.bottomBar = h('div', { class: 'bottombar', hidden: true });
    this.banner = h('div', { class: 'banner', role: 'status', hidden: true });

    const sidebar = h('nav', { class: 'sidebar', 'aria-label': 'Główne sekcje' },
      h('div', { class: 'sidebar__brand' },
        h('span', { class: 'sidebar__logo', 'aria-hidden': 'true' }, 'Lx'),
        h('span', null, 'LexiCards')
      ),
      h('div', { class: 'sidebar__links' }, TABS.map((tab) => this.#navLink(tab, this.sideLinks, 'sidebar__link'))),
      h('div', { class: 'sidebar__footer' }, this.#settingsLink('sidebar__link'))
    );

    // Na ekranach przygotowania nauki i słuchania środkowy przycisk zamienia się w „Rozpocznij”
    // (to samo kółko z symbolem odtwarzania) – zamiast przycisku na pasku poleceń.
    this.primaryAction = null;
    this.primaryButton = h('button', {
      type: 'button', class: 'tabbar__link tabbar__link--primary tabbar__link--action', hidden: true,
      onClick: () => { if (this.primaryAction && !this.primaryAction.disabled) this.primaryAction.onAction(); }
    });
    const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Główne sekcje' },
      TABS.map((tab) => [
        this.#navLink(tab, this.tabLinks, 'tabbar__link'),
        tab.id === PRIMARY_TAB ? this.primaryButton : null
      ])
    );

    this.navbar = h('header', { class: 'navbar' }, this.backSlot, this.inlineTitle, this.actionSlot);
    this.main = h('main', { class: 'screen', id: 'main' },
      this.banner,
      this.navbar,
      h('div', { class: 'screen__header' }, this.titleElement, this.subtitleElement),
      this.bodyElement
    );

    replaceChildren(root, sidebar, this.main, this.bottomBar, tabbar);
    this.root = root;

    // Gdy duży tytuł chowa się pod paskiem nawigacji, pasek pokazuje tytuł w małej wersji.
    let scheduled = false;
    window.addEventListener('scroll', () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        this.#updateScrolled();
      });
    }, { passive: true });
  }

  #updateScrolled() {
    const hidden = this.titleElement.getBoundingClientRect().bottom < this.navbar.getBoundingClientRect().bottom;
    this.navbar.classList.toggle('navbar--scrolled', hidden);
  }

  #navLink(tab, registry, className) {
    // Na pasku zakładek „Nauka” – główne działanie aplikacji – to okrągły przycisk w kolorze aplikacji.
    const primary = className === 'tabbar__link' && tab.id === PRIMARY_TAB;
    const link = h('a', { class: primary ? `${className} ${className}--primary` : className, href: tab.root },
      primary ? h('span', { class: 'tabbar__bubble' }, icon(tab.icon, { size: 26 })) : icon(tab.icon),
      h('span', null, tab.title));
    link.addEventListener('click', (event) => {
      // Zakładka pamięta ostatnie miejsce; ponowny wybór aktywnej wraca na jej początek.
      event.preventDefault();
      this.router.navigate(this.router.tabHref(tab));
    });
    registry.set(tab.id, link);
    return link;
  }

  #settingsLink(className) {
    this.settingsLink = h('a', { class: className, href: routes.settings() }, icon('settings'), h('span', null, 'Ustawienia'));
    return this.settingsLink;
  }

  setActiveTab(tabID, isSettings = false) {
    for (const registry of [this.tabLinks, this.sideLinks]) {
      for (const [id, link] of registry) {
        if (id === tabID) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    }
    if (isSettings) this.settingsLink.setAttribute('aria-current', 'page');
    else this.settingsLink.removeAttribute('aria-current');
  }

  /**
   * Środkowy przycisk jako działanie ekranu: { label, short, disabled, testID, onAction } albo null
   * (zwykła zakładka „Nauka”). `onAction` wywołuje się w obsłudze dotknięcia – słuchanie tego wymaga.
   */
  #setPrimaryAction(action) {
    this.primaryAction = action ?? null;
    const link = this.tabLinks.get(PRIMARY_TAB);
    const button = this.primaryButton;
    link.hidden = Boolean(action);
    button.hidden = !action;
    if (!action) {
      button.replaceChildren();
      delete button.dataset.testid;
      return;
    }
    button.disabled = Boolean(action.disabled);
    button.setAttribute('aria-label', action.label);
    button.title = action.label;
    if (action.testID) button.dataset.testid = action.testID;
    replaceChildren(button,
      h('span', { class: 'tabbar__bubble', 'aria-hidden': 'true' }, icon('play', { size: 28 })),
      h('span', { 'aria-hidden': 'true' }, action.short ?? action.label));
  }

  showBanner(message) {
    this.banner.hidden = !message;
    this.banner.textContent = message ?? '';
  }

  /**
   * Wyświetla ekran. view: { title, subtitle, back: { href, label }, actions: [Node],
   * body: Node, bottomBar: Node|null, wide: bool, primaryAction: { label, short, disabled, testID, onAction } }.
   * `keepScroll` zachowuje pozycję przewijania i fokus (odświeżenie tego samego ekranu).
   */
  render(view, { keepScroll = false } = {}) {
    const scrollY = window.scrollY;
    const restoreFocus = keepScroll ? captureFocus(this.main) : null;

    document.title = view.title ? `${view.title} – LexiCards` : 'LexiCards';
    this.titleElement.textContent = view.title ?? '';
    this.inlineTitle.textContent = view.title ?? '';
    this.subtitleElement.hidden = !view.subtitle;
    this.subtitleElement.textContent = view.subtitle ?? '';

    replaceChildren(this.backSlot, view.back
      ? h('a', { class: 'navbar__backlink', href: view.back.href }, icon('chevronLeft'), h('span', null, view.back.label))
      : null);
    replaceChildren(this.actionSlot, view.actions ?? []);
    replaceChildren(this.bodyElement, view.body);
    this.main.classList.toggle('screen--wide', Boolean(view.wide));
    // compact: bez dużego tytułu (tytuł widać w pasku); focus: bez paska zakładek – ekran nauki.
    this.main.classList.toggle('screen--compact', Boolean(view.compact));
    this.root.classList.toggle('app--focus', Boolean(view.focus));

    this.bottomBar.hidden = !view.bottomBar;
    replaceChildren(this.bottomBar, view.bottomBar ?? null);
    this.root.classList.toggle('app--bottombar', Boolean(view.bottomBar));
    this.#setPrimaryAction(view.primaryAction);

    if (keepScroll) {
      window.scrollTo(0, scrollY);
      restoreFocus?.();
    } else {
      window.scrollTo(0, 0);
    }
    this.#updateScrolled();
  }

  /** Przenosi fokus na tytuł nowego ekranu (czytniki ekranu ogłaszają zmianę). */
  focusTitle() {
    this.titleElement.focus({ preventScroll: true });
  }
}
