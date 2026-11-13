/**
 * Backoffice dashboard of Vila Noel do Bem (IMPL-0015). Who sees what:
 *   - accounts off in the API → the shell with public data only and an honest "contas desligadas" state;
 *   - signed out → the sign-in screen;
 *   - signed in with a blocked account (IMPL-0021, PROPOSTA) → that it is blocked, the message, a sign-out button;
 *   - signed in without the admin role → "Apenas administradores" and a sign-out button, nothing else;
 *   - admin → every section.
 * The API enforces the role on every `/admin/*` route; what is hidden here is convenience, not the protection.
 * An administrator who loses the role while the dashboard is open is refused on the next request (`admin_only`):
 * the session is read again, once, and the admin-only screen takes over. The reads and their rules live in
 * `trackSession` (lib/session.ts).
 *
 * A link to one application (`#applications/<id>`) followed while signed out is remembered, so the person lands
 * on that application after signing in (lib/return-to.ts).
 */
import { useEffect, useRef, useState } from "react";

import { takeLoginToken } from "./lib/login-token";
import { browserStore, forgetReturn, rememberReturn, takeReturn } from "./lib/return-to";
import { hrefOf, namesSection, useRoute } from "./lib/router";
import { api, onSessionChanged } from "./lib/services";
import { isAdmin, openSession, type Session, trackSession, viewOf } from "./lib/session";
import { Applications } from "./ui/Applications";
import { Audit } from "./ui/Audit";
import { Notice } from "./ui/common";
import { Lots } from "./ui/Lots";
import { Pending } from "./ui/Pending";
import { Shell } from "./ui/Shell";
import { Blocked, NotAdmin, SignIn, Starting, Unavailable } from "./ui/SignIn";
import { System } from "./ui/System";
import { Users } from "./ui/Users";

/** One startup per page load, even if React mounts the app twice (StrictMode): a link token is single use. */
let startup: Promise<Session> | undefined;
const start = () => (startup ??= openSession(api, takeLoginToken()));

export function App() {
  const [session, setSession] = useState<Session>({ kind: "loading" });
  const route = useRoute();
  /** The same account was an administrator until the session was read again. */
  const [demoted, setDemoted] = useState(false);
  /** The person signed out here: where they were is not remembered for the next sign-in. */
  const left = useRef(false);
  const [tracker] = useState(() =>
    trackSession(api, (next, lost) => {
      // A session being read or just read is somebody arriving, not the sign-out that was asked for here.
      if (next.kind !== "signed_out") left.current = false;
      setSession(next);
      if (next.kind !== "loading") setDemoted(lost);
    })
  );

  /** Extra flags the screens need (donations, IMPL-0022); read once per admin session. */
  const [donations, setDonations] = useState(false);

  useEffect(() => {
    if (session.kind !== "signed_in" || !isAdmin(session)) {
      setDonations(false);
      return;
    }
    let live = true;
    api.config().then(
      (config) => live && setDonations(config.donations === true),
      () => live && setDonations(false)
    );
    return () => {
      live = false;
    };
  }, [session]);

  useEffect(() => {
    tracker.follow(start());
    // A link opened in a tab that already shows the dashboard only changes the fragment (no page load).
    const onHash = () => {
      const token = takeLoginToken();
      if (token) tracker.reopen(token);
    };
    window.addEventListener("hashchange", onHash);
    // A call refused as signed out, not admin or accounts off: re-read who is here instead of showing stale screens.
    const stop = onSessionChanged(tracker.refused);
    return () => {
      window.removeEventListener("hashchange", onHash);
      stop();
    };
  }, [tracker]);

  const signOut = () => {
    void api
      .logout()
      .catch(() => null)
      .then(() => {
        forgetReturn(browserStore());
        tracker.signedOut();
        left.current = true;
      });
  };

  const view = viewOf(session);
  const wanted = route.section === "applications" ? route.id : undefined;
  useEffect(() => {
    // Asked for one application while signed out: remember it across the sign-in (the link opens another tab).
    if (view === "sign_in" && wanted && !left.current) rememberReturn(browserStore(), wanted);
    // Signed in as an administrator on an address that names no section: go where the person was going.
    if (view === "dashboard" && session.kind === "signed_in") {
      const id = takeReturn(browserStore());
      if (id && !namesSection(location.hash)) location.replace(hrefOf({ section: "applications", id }));
    }
  }, [view, wanted, session.kind]);

  if (session.kind === "loading") return <Starting />;
  // "Tentar de novo" carries the link token that was not consumed, if there was one.
  if (session.kind === "unavailable") return <Unavailable reason={session.reason} onRetry={() => tracker.reopen(session.token)} />;
  if (session.kind === "signed_out") return <SignIn notice={session.notice} />;
  if (session.kind === "signed_in" && view === "blocked") return <Blocked user={session.user} onSignOut={signOut} />;
  if (session.kind === "signed_in" && view === "not_admin") return <NotAdmin user={session.user} demoted={demoted} onSignOut={signOut} />;

  const locked = session.kind === "accounts_off";
  return (
    <Shell route={route} user={session.kind === "signed_in" ? session.user : null} onSignOut={signOut}>
      {locked && (
        <Notice state="accounts-off-banner" title="Contas desligadas" tone="warn">
          <p>
            Esta API está com as contas desligadas (<code>ACCOUNTS_ENABLED</code>): não é possível entrar e as rotas de administração respondem{" "}
            <code>accounts_disabled</code>. O painel mostra só o que é público.
          </p>
        </Notice>
      )}
      {route.section === "applications" && (
        <Applications id={route.id} unknown={route.unknown === true} locked={locked} accountId={session.kind === "signed_in" ? session.user.id : undefined} />
      )}
      {route.section === "lots" && <Lots locked={locked} />}
      {route.section === "audit" && <Audit locked={locked} />}
      {route.section === "users" && <Users locked={locked} accountId={session.kind === "signed_in" ? session.user.id : undefined} />}
      {route.section === "system" && <System />}
      {route.section === "pending" && (
        <Pending locked={locked} donationsOn={!locked && donations} accountId={session.kind === "signed_in" ? session.user.id : undefined} />
      )}
    </Shell>
  );
}
