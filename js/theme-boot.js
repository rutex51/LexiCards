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
  } catch (error) {
    // Pamięć lokalna niedostępna – zostaje motyw systemowy.
  }
})();
