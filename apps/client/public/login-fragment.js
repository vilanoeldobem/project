// Runs before any third-party script (Google Tag Manager): moves a magic-link token (#login=…) out of the
// address bar into memory, so analytics never sees it in the page URL. initAccount (src/lib/account.ts) consumes it.
(function () {
  var fragment = new URLSearchParams(location.hash.slice(1));
  var token = fragment.get("login");
  if (!token) return;
  fragment.delete("login");
  var rest = fragment.toString();
  history.replaceState(null, "", location.pathname + location.search + (rest ? "#" + rest : ""));
  window.__vilaLoginToken = token;
})();
