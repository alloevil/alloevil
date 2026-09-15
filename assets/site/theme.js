/* Resolves the colour scheme before first paint, so the page never flashes the wrong theme.
   Loaded blocking from <head> on every page (a few hundred bytes, cached); script.js wires the
   toggle afterwards. Stored under one key, defaulting to the OS preference. */
(function () {
  var theme = "dark";
  try {
    var saved = localStorage.getItem("allo-theme");
    if (saved === "light" || saved === "dark") {
      theme = saved;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      theme = "light";
    }
  } catch (e) {
    /* storage blocked: fall back to dark */
  }
  document.documentElement.dataset.theme = theme;
})();
