// Runs before the app bundle: moves a magic-link token (#login=…) out of the address bar into memory, so it is
// never left in the page URL (history, screenshots, copied links). openSession (src/lib/session.ts) consumes it
// once, through takeLoginToken (src/lib/login-token.ts). Same idea as the game's public/login-fragment.js.
// The rest of the fragment is kept as written: it may be an address of the dashboard (#/applications/<id>).
// Same rule as splitLoginFragment in src/lib/login-token.ts: keep the two in step.
(function () {
  var parts = location.hash.slice(1).split("&");
  var at = -1;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].indexOf("login=") === 0) {
      at = i;
      break;
    }
  }
  var token = at < 0 ? null : new URLSearchParams(parts[at]).get("login");
  if (!token) return;
  parts.splice(at, 1);
  var rest = parts.join("&");
  history.replaceState(null, "", location.pathname + location.search + (rest ? "#" + rest : ""));
  window.__vilaLoginToken = token;
})();
