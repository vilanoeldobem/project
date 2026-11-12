// Runs before the app bundle: moves a magic-link token (#login=…) out of the address bar into memory, so it is
// never left in the page URL (history, screenshots, copied links). openSession (src/lib/session.ts) consumes it
// once, through takeLoginToken (src/lib/login-token.ts). Same idea as the game's public/login-fragment.js.
(function () {
  var fragment = new URLSearchParams(location.hash.slice(1));
  var token = fragment.get("login");
  if (!token) return;
  fragment.delete("login");
  var rest = fragment.toString();
  history.replaceState(null, "", location.pathname + location.search + (rest ? "#" + rest : ""));
  window.__vilaLoginToken = token;
})();
