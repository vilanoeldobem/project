/**
 * Accounts on the client (P13, OQ-02, OQ-03; IMPL-0011): config flag, magic-link sign-in, the signed-in
 * user, progress sync with the server and the NGO application calls. The session lives in an HttpOnly cookie on
 * the API host; this module never sees it. Exploring the Vila never requires an account. The admin review lives
 * in the backoffice dashboard (apps/dash, IMPL-0015).
 */
import { create } from "zustand";

import type { Application, Me } from "@vila/shared/accounts/contract";
import { ApiError } from "@vila/shared/accounts/errors";
import type { NgoApplication } from "@vila/shared/accounts/validate";
import type { Progress } from "@vila/shared/game/progress";

import { useVila } from "../game/store";
import { SERVICES } from "./services";

// Shapes and errors shared with the backoffice dashboard live in `@vila/shared/accounts/*`.
export type { Application, Me };
export { ApiError };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVICES.api}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  if (res.status === 204) return null as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
  if (!res.ok) {
    // Another tab switched accounts: this page is out of date, so re-read who is signed in.
    if (data.error === "account_changed") void refreshAccount();
    throw new ApiError(res.status, data.error ?? "unknown", data.fields);
  }
  return data as T;
}

/** Writes carry the account this page believes is signed in (the API refuses them for any other). */
const accountId = () => useAccount.getState().user?.id ?? "";

export const api = {
  config: () => call<{ accounts: boolean }>("GET", "/config"),
  register: (b: { name: string; nickname: string; city: string; email: string }) => call<{ ok: true; devLink?: string }>("POST", "/auth/register", b),
  requestLink: (email: string) => call<{ ok: true; devLink?: string }>("POST", "/auth/link", { email }),
  verify: (token: string) => call<{ user: Me }>("POST", "/auth/verify", { token }),
  me: () => call<{ user: Me | null }>("GET", "/me"),
  updateMe: (b: { name: string; nickname: string; city: string }) => call<{ user: Me }>("POST", "/me", b),
  logout: () => call<null>("POST", "/auth/logout", {}),
  deleteMe: () => call<null>("DELETE", "/me"),
  progress: () => call<{ progress: Progress }>("GET", "/progress"),
  postEvents: (owner: string, events: Array<{ missionId: string; eventId: string }>) =>
    call<{ progress: Progress }>("POST", "/progress/events", { accountId: owner, events }),
  application: () => call<{ application: Application | null }>("GET", "/ngo/application"),
  submitApplication: (a: NgoApplication) => call<{ application: Application }>("POST", "/ngo/application", { ...a, accountId: accountId() }),
};

interface AccountState {
  /** Accounts turned on by the API (`/config`); everything account-related hides when false. */
  enabled: boolean;
  user: Me | null;
  ready: boolean;
  /** Server copy of the signed-in progress: "pending" while some events wait for the connection. */
  sync: "saved" | "pending";
  setUser: (u: Me | null) => void;
}

export const useAccount = create<AccountState>((set) => ({
  enabled: false,
  user: null,
  ready: false,
  sync: "saved",
  setUser: (user) => set({ user }),
}));

type Event = { missionId: string; eventId: string };

const seenEvents = (p: Progress): Event[] =>
  Object.keys(p.seen).map((k) => {
    const i = k.indexOf(":");
    return { missionId: k.slice(0, i), eventId: k.slice(i + 1) };
  });

/** Events recorded while signed in but not yet accepted by the server (survive a reload; ids only). */
const pendingKey = (owner: string) => `vila.pending.v1:${owner}`;
function loadPending(owner: string): Event[] {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(owner)) ?? "[]") as Event[];
  } catch {
    return [];
  }
}
function savePending(owner: string, events: Event[]) {
  try {
    if (events.length) localStorage.setItem(pendingKey(owner), JSON.stringify(events));
    else localStorage.removeItem(pendingKey(owner));
  } catch {
    /* storage unavailable: pending events last for this session */
  }
}

/** Sends events in chunks (idempotent on the server) and returns the server's progress. */
async function send(owner: string, events: Event[]): Promise<Progress> {
  let server = (await api.progress()).progress;
  for (let i = 0; i < events.length; i += 50) server = (await api.postEvents(owner, events.slice(i, i + 50))).progress;
  return server;
}

/**
 * After sign-in: guest progress made in this browser moves to the account once (OQ-02) and is then cleared
 * here, so the next person to use this browser starts fresh; events left pending go too. The screen then
 * shows the account's progress. Offline: the guest progress stays on screen and is migrated next time.
 */
async function syncProgress(owner: string) {
  const vila = useVila.getState();
  const guest = vila.progressOwner === null ? seenEvents(vila.progress) : [];
  const queued = loadPending(owner);
  try {
    let server = await send(owner, [...guest, ...queued]);
    if (useAccount.getState().user?.id !== owner) return; // signed out meanwhile
    // Events recorded while the first batch was in flight are still guest events: send them before clearing.
    const now = useVila.getState();
    const late = now.progressOwner === null ? seenEvents(now.progress).filter((e) => !guest.some((g) => g.missionId === e.missionId && g.eventId === e.eventId)) : [];
    if (late.length) server = await send(owner, late);
    savePending(owner, []);
    if (guest.length) useVila.getState().clearGuest();
    useVila.getState().adoptProgress(server, owner);
    useAccount.setState({ sync: "saved" });
  } catch {
    useAccount.setState({ sync: "pending" });
  }
}

/** Retries events that failed to send (on reconnect and after each new event). */
async function flushPending() {
  const owner = useVila.getState().progressOwner;
  if (!owner || useAccount.getState().user?.id !== owner) return;
  const queued = loadPending(owner);
  if (!queued.length) return useAccount.setState({ sync: "saved" });
  try {
    await send(owner, queued);
    savePending(owner, loadPending(owner).filter((e) => !queued.some((q) => q.missionId === e.missionId && q.eventId === e.eventId)));
    useAccount.setState({ sync: loadPending(owner).length ? "pending" : "saved" });
  } catch {
    useAccount.setState({ sync: "pending" });
  }
}

let unsubscribe: (() => void) | null = null;

/** While signed in, every new mission event goes to the server for the account that is on screen. */
function followProgress() {
  unsubscribe?.();
  const onUpdate = useVila.subscribe((s, prev) => {
    const owner = s.progressOwner;
    if (s.progress === prev.progress || !owner || owner !== prev.progressOwner) return;
    const fresh = seenEvents(s.progress).filter((e) => !prev.progress.seen[`${e.missionId}:${e.eventId}`]);
    if (!fresh.length) return;
    savePending(owner, [...loadPending(owner), ...fresh]);
    void flushPending();
  });
  const online = () => {
    const user = useAccount.getState().user;
    // A sign-in that happened offline still has guest progress to migrate; otherwise resend what is pending.
    if (user && useVila.getState().progressOwner === null) void syncProgress(user.id);
    else void flushPending();
  };
  window.addEventListener("online", online);
  unsubscribe = () => {
    onUpdate();
    window.removeEventListener("online", online);
  };
}

export async function signedIn(user: Me) {
  useAccount.getState().setUser(user);
  followProgress();
  await syncProgress(user.id);
}

/** Forgets the account on this page (no API call) and shows guest progress again. */
function signedOutHere() {
  unsubscribe?.();
  unsubscribe = null;
  useAccount.setState({ user: null, sync: "saved" });
  useVila.getState().restoreGuest();
}

export async function signOut() {
  await api.logout().catch(() => null);
  signedOutHere();
}

/** Deletes the account on the server, then forgets it here (pending events included). */
export async function deleteAccount() {
  const owner = useAccount.getState().user?.id;
  await api.deleteMe();
  if (owner) savePending(owner, []);
  signedOutHere();
}

/** The account changed in another tab (409 account_changed): follow the cookie, never write across accounts. */
let refreshing = false;
async function refreshAccount() {
  if (refreshing) return;
  refreshing = true;
  try {
    const { user } = await api.me();
    if (user?.id === useAccount.getState().user?.id) return;
    signedOutHere();
    if (user) await signedIn(user);
    useVila.getState().notify(user ? `Você está como @${user.nickname} (a conta mudou em outra aba).` : "Você saiu da conta em outra aba.");
  } catch {
    /* offline: try again on the next write */
  } finally {
    refreshing = false;
  }
}

/**
 * The magic-link token: already moved out of the URL into memory by `public/login-fragment.js` (which runs before
 * Google Tag Manager, so analytics never sees it), or still in the `#login=` fragment if that script did not run.
 */
function takeLoginToken(): string | null {
  const early = window.__vilaLoginToken;
  delete window.__vilaLoginToken;
  if (early) return early;
  const fragment = new URLSearchParams(location.hash.slice(1));
  const token = fragment.get("login");
  if (token) {
    fragment.delete("login");
    history.replaceState(null, "", `${location.pathname}${location.search}${fragment.size ? `#${fragment}` : ""}`);
  }
  return token;
}

/**
 * Startup: reads the flag, consumes a `#login=` link (then removes it from the address bar) or restores
 * the session. The token travels in the fragment, which the browser never sends to any server (so it is
 * in no access log). Never throws; without the API the game stays fully playable.
 */
export async function initAccount() {
  try {
    const { accounts } = await api.config();
    useAccount.setState({ enabled: accounts });
    if (!accounts) return;
    const token = takeLoginToken();
    if (token) {
      try {
        const { user } = await api.verify(token);
        await signedIn(user);
        useVila.getState().notify(`Bem-vindo(a), ${user.nickname}! Seu progresso agora fica salvo na sua conta.`);
      } catch {
        useVila.getState().notify("Esse link expirou ou já foi usado. Peça um novo em Entrar.");
      }
      return;
    }
    const { user } = await api.me();
    if (user) await signedIn(user);
  } catch {
    /* not signed in or API unavailable */
  } finally {
    useAccount.setState({ ready: true });
  }
}
