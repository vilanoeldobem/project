/**
 * Applies the saved colour theme before first paint. Static file (not inline) because the
 * site CSP has no 'unsafe-inline' for scripts. Key shared with src/App.tsx.
 */
try {
  var theme = localStorage.getItem("vila.site.theme.v1");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (error) {
  /* storage unavailable: the CSS prefers-color-scheme default applies */
}
