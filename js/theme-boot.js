// Ustawia zapamiętany motyw i kolor aplikacji, zanim cokolwiek zostanie narysowane
// (bez mignięcia jasnego tła albo niebieskich przycisków).
(function () {
  try {
    var appearance = localStorage.getItem('lexicards-appearance');
    if (appearance === 'light' || appearance === 'dark') {
      document.documentElement.dataset.theme = appearance;
    }
    var accent = localStorage.getItem('lexicards-accent');
    if (accent === 'graphite' || accent === 'orange' || accent === 'green' || accent === 'red') {
      document.documentElement.dataset.accent = accent;
    }
    // Od 1.62: kolor magicznej fiszki.
    var magic = localStorage.getItem('lexicards-magic');
    if (magic === 'gold' || magic === 'teal') {
      document.documentElement.dataset.magic = magic;
    }
    // Od 1.29: podpowiedzi w oknach schowane przyciskiem ⓘ (js/ui/hints.js).
    if (localStorage.getItem('lexicards-hints') === 'hidden') {
      document.documentElement.classList.add('hints-hidden');
    }
  } catch (error) {
    // Pamięć lokalna niedostępna – zostaje motyw systemowy.
  }
})();
