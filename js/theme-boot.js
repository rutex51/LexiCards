// Ustawia zapamiętany motyw, zanim cokolwiek zostanie narysowane (bez mignięcia jasnego tła).
(function () {
  try {
    var appearance = localStorage.getItem('lexicards-appearance');
    if (appearance === 'light' || appearance === 'dark') {
      document.documentElement.dataset.theme = appearance;
    }
  } catch (error) {
    // Pamięć lokalna niedostępna – zostaje motyw systemowy.
  }
})();
