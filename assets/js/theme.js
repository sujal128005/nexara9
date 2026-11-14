// Runs before the page paints so the chosen theme never flashes. Light is the default.
(function () {
  var t = 'light';
  try { var s = localStorage.getItem('n9-theme'); if (s === 'dark' || s === 'light') t = s; } catch (e) { /* storage blocked */ }
  document.documentElement.setAttribute('data-theme', t);
})();
