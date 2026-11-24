/* Apply saved theme before first paint (see ThemeService). */
(function () {
  try {
    var t = localStorage.getItem('fc.theme');
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
