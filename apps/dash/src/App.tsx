/**
 * Backoffice dashboard of Vila Noel do Bem (IMPL-0015). Who sees what:
 *   - accounts off in the API → the shell with public data only and an honest "contas desligadas" state;
 *   - signed out → the sign-in screen;
 *   - signed in without the admin role → "Apenas administradores" and a sign-out button, nothing else;
 *   - admin → every section.
 * The API enforces the role on every `/admin/*` route; what is hidden here is convenience, not the protection.
 */
import { useCallback, useEffect, useState } from "react";

import { takeLoginToken } from "./lib/login-token";
import { useRoute } from "./lib/router";
import { api, onSessionChanged } from "./lib/services";
import { isAdmin, openSession, type Session, SESSION_ENDED } from "./lib/session";
import { Applications } from "./ui/Applications";
import { Audit } from "./ui/Audit";
import { Notice } from "./ui/common";
import { Lots } from "./ui/Lots";
import { Pending } from "./ui/Pending";
import { Shell } from "./ui/Shell";
import { NotAdmin, SignIn, Starting, Unavailable } from "./ui/SignIn";
import { System } from "./ui/System";
import { Users } from "./ui/Users";

/** One startup per page load, even if React mounts the app twice (StrictMode): a link token is single use. */
let startup: Promise<Session> | undefined;
const start = () => (startup ??= openSession(api, takeLoginToken()));

export function App() {
  const [session, setSession] = useState<Session>({ kind: "loading" });
  const route = useRoute();

  const reopen = useCallback((token: string | null, notice?: string) => {
    setSession({ kind: "loading" });
    void openSession(api, token, notice).then(setSession);
  }, []);

  useEffect(() => {
    let live = true;
    void start().then((s) => live && setSession(s));
    // A link opened in a tab that already shows the dashboard only changes the fragment (no page load).
    const onHash = () => {
      const token = takeLoginToken();
      if (token) reopen(token);
    };
    window.addEventListener("hashchange", onHash);
    // A call refused as signed out, not admin or accounts off: re-read who is here instead of showing stale screens.
    const stop = onSessionChanged(() => reopen(null, SESSION_ENDED));
    return () => {
      live = false;
      window.removeEventListener("hashchange", onHash);
      stop();
    };
  }, [reopen]);

  const signOut = () => {
    void api
      .logout()
      .catch(() => null)
      .then(() => setSession({ kind: "signed_out" }));
  };

  if (session.kind === "loading") return <Starting />;
  if (session.kind === "unavailable") return <Unavailable onRetry={() => reopen(null)} />;
  if (session.kind === "signed_out") return <SignIn notice={session.notice} />;
  if (session.kind === "signed_in" && !isAdmin(session)) return <NotAdmin user={session.user} onSignOut={signOut} />;

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
      {route.section === "applications" && <Applications id={route.id} locked={locked} />}
      {route.section === "lots" && <Lots locked={locked} />}
      {route.section === "audit" && <Audit locked={locked} />}
      {route.section === "users" && <Users locked={locked} />}
      {route.section === "system" && <System />}
      {route.section === "pending" && <Pending />}
    </Shell>
  );
}
