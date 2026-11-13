/**
 * Who is using the dashboard (IMPL-0015). Sign-in is the game's magic link and session cookie; the dashboard
 * only asks for a link (`POST /auth/link`), confirms the token it comes back with, and reads `GET /me`.
 * Pure: the API is passed in, so the rules are tested without a browser.
 */
import type { Me } from "@vila/shared/accounts/contract";
import { ApiError, errorText } from "@vila/shared/accounts/errors";

import type { Api } from "./api";

export type Session =
  | { kind: "loading" }
  /**
   * The API did not answer, or refused for a reason that is not about the link (rate limit, database down):
   * nothing can be shown or decided. `token` is a link token that was not consumed, kept for "Tentar de novo";
   * `reason` is the pt-BR sentence to show when the API gave one.
   */
  | { kind: "unavailable"; token: string | null; reason?: string }
  /** `ACCOUNTS_ENABLED` is off in this API: nobody can sign in; only public data is shown. */
  | { kind: "accounts_off" }
  | { kind: "signed_out"; notice?: string }
  /**
   * Signed in. Only `user.role === "admin"` sees the dashboard (the API enforces it on every route). A blocked
   * account (`user.blocked`, IMPL-0021) has a restricted session: it reads the message and signs out.
   */
  | { kind: "signed_in"; user: Me };

export const EXPIRED_LINK = "Esse link expirou ou já foi usado. Peça um novo abaixo.";
export const SESSION_ENDED = "Sua sessão terminou. Entre de novo.";
/** The API refused a request as if the session had changed, and then said the session is the same. */
export const SESSION_CONTRADICTED =
  "A API recusou um pedido deste painel como se a sessão tivesse mudado, mas a sessão continua a mesma. O painel parou de pedir para não repetir sem fim. Tente de novo em instantes.";

/**
 * Startup, and again whenever the API says the session changed: reads the flag, consumes a magic-link token if
 * there is one, otherwise restores the session from the cookie. Never throws. With accounts off it calls no
 * account route at all (they would only answer `accounts_disabled`).
 *
 * A link token is single use on the server, so it is given up only when the API says it is no good
 * (`invalid_token`). Any other failure keeps it in the result: the request may never have reached the API, or was
 * refused before the token was looked at (rate limit).
 */
export async function openSession(api: Pick<Api, "config" | "verify" | "me">, token: string | null, notice?: string): Promise<Session> {
  try {
    if ((await api.config()).accounts !== true) return { kind: "accounts_off" };
  } catch {
    return { kind: "unavailable", token };
  }
  if (token) {
    try {
      return { kind: "signed_in", user: (await api.verify(token)).user };
    } catch (e) {
      const refused = e instanceof ApiError && e.status !== 0;
      if (!refused || e.code !== "invalid_token") return { kind: "unavailable", token, ...(refused ? { reason: errorText(e) } : {}) };
      notice = EXPIRED_LINK;
    }
  }
  try {
    const { user } = await api.me();
    return user ? { kind: "signed_in", user } : { kind: "signed_out", notice };
  } catch {
    return { kind: "unavailable", token: null };
  }
}

export const isAdmin = (s: Session): boolean => s.kind === "signed_in" && s.user.role === "admin";

/** What the app shows for a session. `dashboard` is every section (also with accounts off: public data only). */
export type View = "starting" | "unavailable" | "sign_in" | "blocked" | "not_admin" | "dashboard";

/**
 * A blocked account sees only that it is blocked, whatever its role: the API refuses everything else it would
 * ask for (`403 session_blocked`). Pure.
 */
export function viewOf(s: Session): View {
  if (s.kind === "loading") return "starting";
  if (s.kind === "unavailable") return "unavailable";
  if (s.kind === "signed_out") return "sign_in";
  if (s.kind === "signed_in") return s.user.blocked ? "blocked" : s.user.role === "admin" ? "dashboard" : "not_admin";
  return "dashboard";
}

/**
 * Refusals that mean "who you are changed", whatever was being asked: signed out, no longer an administrator
 * (demoted while using the dashboard), blocked, or accounts turned off. The app answers them by reading the
 * session again, once, instead of leaving a screen that keeps being refused. Any other refusal (`last_admin`,
 * `self_role`, `stale_revision`, …) is about the action and stays on the screen that asked.
 */
const SESSION_CODES = new Set(["not_signed_in", "admin_only", "session_blocked", "accounts_disabled"]);
export const sessionChangedBy = (code: string): boolean => SESSION_CODES.has(code);

/** The same account was an administrator a moment ago and is not any more: say so on the admin-only screen. */
export const lostAdmin = (before: Session, after: Session): boolean =>
  before.kind === "signed_in" && after.kind === "signed_in" && isAdmin(before) && viewOf(after) === "not_admin" && before.user.id === after.user.id;

/**
 * The session read after a refusal says what the one before it said: the same account, still shown the dashboard.
 * The API contradicts itself (an admin route refuses while `/me` still answers an administrator), and drawing the
 * dashboard again would only repeat the refused request.
 */
export const sameDashboard = (before: Session, after: Session): boolean =>
  before.kind === "signed_in" && after.kind === "signed_in" && viewOf(before) === "dashboard" && viewOf(after) === "dashboard" && before.user.id === after.user.id;

/**
 * Follows who is using the dashboard: every session read goes through here, and `show` gets what the app draws
 * (`demoted`: the same account was an administrator until this read). No React, so the rules are tested as they
 * run:
 *   - a read that answers after a newer one began is dropped;
 *   - a refusal about the session (`sessionChangedBy`) starts one read, unless one is in flight;
 *   - when that read changes nothing (`sameDashboard`), the dashboard is not drawn again: the app shows the
 *     "unavailable" state with `SESSION_CONTRADICTED`, where only "Tentar de novo" asks for anything. Without
 *     this the dashboard and the session read would call each other for as long as the API contradicts itself.
 */
export function trackSession(api: Pick<Api, "config" | "verify" | "me">, show: (session: Session, demoted: boolean) => void) {
  /** Number of the latest session read: an older one that answers late is dropped. */
  let latest = 0;
  /** True while a session read is in flight: its own refusals must not start another one. */
  let opening = false;
  /** The last session that was read (not "loading"): what the next one is compared with. */
  let settled: Session = { kind: "loading" };

  /** `refused`: the session as it was when a refusal asked for this read. */
  const follow = (reading: Promise<Session>, refused?: Session) => {
    const mine = ++latest;
    opening = true;
    void reading.then((read) => {
      if (mine !== latest) return;
      opening = false;
      const session: Session = refused && sameDashboard(refused, read) ? { kind: "unavailable", token: null, reason: SESSION_CONTRADICTED } : read;
      const demoted = lostAdmin(settled, session);
      settled = session;
      show(session, demoted);
    });
  };

  return {
    /** Follows a read that is already under way (the one of the page load). */
    follow: (reading: Promise<Session>) => follow(reading),
    /** Reads the session again (a link token, "Tentar de novo"), showing "loading" meanwhile. */
    reopen: (token: string | null, notice?: string) => {
      show({ kind: "loading" }, false);
      follow(openSession(api, token, notice));
    },
    /** A call was refused because who is signed in changed: read the session again, once. */
    refused: () => {
      if (opening) return;
      const before = settled;
      show({ kind: "loading" }, false);
      follow(openSession(api, null, SESSION_ENDED), before);
    },
    /** The person signed out here: whatever read is still in flight no longer matters. */
    signedOut: () => {
      latest++;
      opening = false;
      settled = { kind: "signed_out" };
      show(settled, false);
    },
  };
}
