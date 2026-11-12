/**
 * Who is using the dashboard (IMPL-0015). Sign-in is the game's magic link and session cookie; the dashboard
 * only asks for a link (`POST /auth/link`), confirms the token it comes back with, and reads `GET /me`.
 * Pure: the API is passed in, so the rules are tested without a browser.
 */
import type { Me } from "@vila/shared/accounts/contract";
import { ApiError } from "@vila/shared/accounts/errors";

import type { Api } from "./api";

export type Session =
  | { kind: "loading" }
  /** The API did not answer: nothing can be shown or decided. */
  | { kind: "unavailable" }
  /** `ACCOUNTS_ENABLED` is off in this API: nobody can sign in; only public data is shown. */
  | { kind: "accounts_off" }
  | { kind: "signed_out"; notice?: string }
  /** Signed in. Only `user.role === "admin"` sees the dashboard (the API enforces it on every route). */
  | { kind: "signed_in"; user: Me };

export const EXPIRED_LINK = "Esse link expirou ou já foi usado. Peça um novo abaixo.";
export const SESSION_ENDED = "Sua sessão terminou. Entre de novo.";

/**
 * Startup, and again whenever the API says the session changed: reads the flag, consumes a magic-link token if
 * there is one, otherwise restores the session from the cookie. Never throws. With accounts off it calls no
 * account route at all (they would only answer `accounts_disabled`).
 */
export async function openSession(api: Pick<Api, "config" | "verify" | "me">, token: string | null, notice?: string): Promise<Session> {
  try {
    if ((await api.config()).accounts !== true) return { kind: "accounts_off" };
    if (token) {
      try {
        return { kind: "signed_in", user: (await api.verify(token)).user };
      } catch (e) {
        if (!(e instanceof ApiError) || e.code === "network") throw e;
        notice = EXPIRED_LINK;
      }
    }
    const { user } = await api.me();
    return user ? { kind: "signed_in", user } : { kind: "signed_out", notice };
  } catch {
    return { kind: "unavailable" };
  }
}

export const isAdmin = (s: Session): boolean => s.kind === "signed_in" && s.user.role === "admin";
