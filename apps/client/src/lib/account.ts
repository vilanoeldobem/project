/**
 * Accounts on the client (P13, OQ-02, OQ-03; IMPL-0011): config flag, magic-link sign-in, the signed-in
 * user, progress sync with the server and the NGO application calls (with its files, IMPL-0017). The session
 * lives in an HttpOnly cookie on the API host; this module never sees it. Exploring the Vila never requires an
 * account. The admin review lives in the backoffice dashboard (apps/dash, IMPL-0015); the game only sends the
 * moderation actions an administrator takes in moderation mode (IMPL-0021, `lib/moderation.ts`).
 *
 * A blocked account (IMPL-0021, PROPOSTA) keeps a restricted session: it reads `/me` (with the message from the
 * administration), signs out and deletes the account. Nothing else is sent for it: no progress, no application.
 */
import { create } from "zustand";

import type { Application, ApplicationDetail, FileUploaded, Me, ModerationConfig, ModerationTicket, OwnApplication } from "@vila/shared/accounts/contract";
import { ApiError } from "@vila/shared/accounts/errors";
import type { ApplicationFile, FileKind, FileType } from "@vila/shared/accounts/files";
import type { NgoApplication } from "@vila/shared/accounts/validate";
import type { Progress } from "@vila/shared/game/progress";

import { sendableEvents, setServerQuests } from "../game/questsFlag";
import { useVila } from "../game/store";
import { SERVICES } from "./services";

// Shapes and errors shared with the backoffice dashboard live in `@vila/shared/accounts/*`.
export type { Application, Me };
export { ApiError };

/** One request to the API. Throws `ApiError` when there is no answer (also when `signal` gave it up) or the answer is an error. */
async function request(method: string, path: string, headers: Record<string, string>, body?: BodyInit, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${SERVICES.api}${path}`, { method, credentials: "include", headers, body, signal });
  } catch {
    throw new ApiError(0, "network");
  }
  if (res.ok) return res;
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
  // Another tab switched accounts, or the account was blocked or lost the administrator role (IMPL-0021): this
  // page is out of date, so re-read who is signed in and what they may do.
  if (data.error === "account_changed" || data.error === "session_blocked" || data.error === "admin_only") void refreshAccount();
  // The page shows an account and the API says nobody is signed in: the session ended somewhere else (signed out
  // in another tab, expired, or ended by a block). Read `/me` again, once per ended session.
  else if (data.error === "not_signed_in" && sessionMayHaveEnded()) void refreshAccount(true);
  throw new ApiError(res.status, data.error ?? "unknown", data.fields);
}

/** A JSON call. `headers` are added to the request (a write without a JSON body names its account there). */
async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const res = await request(
    method,
    path,
    { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body === undefined ? undefined : JSON.stringify(body),
    signal
  );
  if (res.status === 204) return null as T;
  return (await res.json().catch(() => ({}))) as T;
}

/** Writes carry the account this page believes is signed in (the API refuses them for any other). */
const accountId = () => useAccount.getState().user?.id ?? "";

/** Row of `GET /admin/ngos/:id/photos` as the game reads it (IMPL-0018, PROPOSTA): the revision a removal names. */
export interface AdminPhoto {
  id: string;
  status: string;
  revision: number;
}

export const api = {
  /** `withdrawal` and `moderation` are missing in the answer of an API older than IMPL-0020 / IMPL-0021. */
  config: () => call<{ accounts: boolean; quests?: boolean; files?: boolean; withdrawal?: boolean; moderation?: Partial<ModerationConfig> }>("GET", "/config"),
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
  /** `files` is missing in the answer of an API older than IMPL-0017. */
  application: () => call<Pick<OwnApplication, "application"> & { files?: ApplicationFile[] }>("GET", "/ngo/application"),
  submitApplication: (a: NgoApplication) => call<{ application: Application }>("POST", "/ngo/application", { ...a, accountId: accountId() }),
  /**
   * Sends a file of the caller's application (IMPL-0017): the body is the file itself, so the account goes in a
   * header. (The copy is for `fetch`, which takes a view of a plain `ArrayBuffer` only.)
   */
  uploadFile: (kind: FileKind, type: FileType, bytes: Uint8Array) =>
    request("POST", `/ngo/application/files?kind=${kind}`, { Accept: "application/json", "Content-Type": type, "X-Vila-Account": accountId() }, new Uint8Array(bytes)).then(
      (res) => res.json() as Promise<FileUploaded>
    ),
  deleteFile: (id: string) => call<{ revision: number }>("DELETE", `/ngo/application/files/${id}`, undefined, { "X-Vila-Account": accountId() }),
  /** The bytes of one of the caller's own files. The route needs the session and the page's `Origin`, so a plain link or `<img src>` cannot read it. */
  fileBlob: (id: string) => request("GET", `/ngo/application/files/${id}`, {}).then((res) => res.blob()),

  // Administrator only (IMPL-0021): called from moderation mode and nowhere else. The API checks the role on
  // every call; a write names the account this page believes is signed in, and the version it saw (`revision`).
  adminApplication: (ngoId: string) => call<ApplicationDetail>("GET", `/admin/applications/${ngoId}`),
  adminPhotos: (ngoId: string) => call<{ photos: AdminPhoto[] }>("GET", `/admin/ngos/${ngoId}/photos`),
  adminRemoveLogo: (ngoId: string, revision: number) =>
    call<{ application: Application }>("POST", `/admin/ngos/${ngoId}/logo/remove`, { accountId: accountId(), revision }),
  adminRemovePhoto: (photoId: string, revision: number) =>
    call<{ photo: AdminPhoto }>("POST", `/admin/ngo-photos/${photoId}/decision`, { accountId: accountId(), action: "remove", revision }),
  /** `message` is what the organisation reads, word for word (IMPL-0020, PROPOSTA). */
  adminWithdraw: (ngoId: string, revision: number, message: string) =>
    call<{ application: Application }>("POST", `/admin/ngos/${ngoId}/withdraw`, { accountId: accountId(), revision, reason: message }),
  /**
   * A single-use ticket to remove the connection `target` from `room` (PROPOSTA). Never stored, shown or logged.
   * `signal` gives the request up (the removal flow does not wait for ever, `net/removal.ts`).
   */
  moderationTicket: (room: number, target: number, signal?: AbortSignal) =>
    call<ModerationTicket>("POST", "/admin/moderation/ticket", { accountId: accountId(), room, target }, {}, signal),
};

interface AccountState {
  /** Accounts turned on by the API (`/config`); everything account-related hides when false. */
  enabled: boolean;
  /** Files of an NGO application turned on by the API (`/config`, IMPL-0017); every file control hides when false. */
  files: boolean;
  /** Withdrawing a published NGO turned on by the API (`/config`, IMPL-0020, PROPOSTA). */
  withdrawal: boolean;
  /** Removing a visitor from a room turned on by the API (`/config.moderation.presence`, IMPL-0021, PROPOSTA). */
  presenceModeration: boolean;
  user: Me | null;
  ready: boolean;
  /** Server copy of the signed-in progress: "pending" while some events wait for the connection. */
  sync: "saved" | "pending";
  setUser: (u: Me | null) => void;
}

export const useAccount = create<AccountState>((set) => ({
  enabled: false,
  files: false,
  withdrawal: false,
  presenceModeration: false,
  user: null,
  ready: false,
  sync: "saved",
  setUser: (user) => set({ user }),
}));

type Event = { missionId: string; eventId: string };

/** `owner` is still the signed-in account and its session may sync (a blocked one may not; IMPL-0021). */
function syncs(owner: string): boolean {
  const user = useAccount.getState().user;
  return user?.id === owner && !user.blocked;
}

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

/**
 * Sends events in chunks (idempotent on the server) and returns the server's progress. With quests off
 * (IMPL-0013) quest events are left out: the API would skip them, so they are not retried either.
 */
async function send(owner: string, all: Event[]): Promise<Progress> {
  const events = sendableEvents(all);
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
    if (!syncs(owner)) return; // signed out or blocked meanwhile
    // Events recorded while the first batch was in flight are still guest events: send them before clearing.
    const now = useVila.getState();
    const late = now.progressOwner === null ? seenEvents(now.progress).filter((e) => !guest.some((g) => g.missionId === e.missionId && g.eventId === e.eventId)) : [];
    if (late.length) server = await send(owner, late);
    if (!syncs(owner)) return;
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
  if (!owner || !syncs(owner)) return;
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
    const fresh = sendableEvents(seenEvents(s.progress).filter((e) => !prev.progress.seen[`${e.missionId}:${e.eventId}`]));
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
  if (user.blocked) return stopSync();
  followProgress();
  await syncProgress(user.id);
}

/**
 * A blocked account (IMPL-0021, PROPOSTA): the API refuses its progress and its application, so nothing is sent
 * or retried, and the screen goes back to the progress kept in this browser, exactly as after a reload. Events
 * still waiting for the account stay in this browser and go out if the block is lifted.
 */
function stopSync() {
  unsubscribe?.();
  unsubscribe = null;
  useAccount.setState({ sync: "saved" });
  if (useVila.getState().progressOwner !== null) useVila.getState().restoreGuest();
}

/** Forgets the account on this page (no API call) and shows guest progress again. */
function signedOutHere() {
  unsubscribe?.();
  unsubscribe = null;
  stillSignedIn = null;
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
  try { await api.deleteMe(); }
  catch (error) {
    // A failed storage operation may already have started irreversible erasure; show the server's state.
    await refreshing; // Finish any read started before deletion, then request the post-failure state.
    await refreshAccount();
    throw error;
  }
  if (owner) savePending(owner, []);
  signedOutHere();
}

const BLOCKED_NOTICE = "Sua conta está bloqueada pela administração. Abra a conta para ler a mensagem.";
/** Neutral on purpose: the page cannot tell a sign-out in another tab from an expired or ended session. */
export const SESSION_ENDED_NOTICE = "Sua sessão terminou. Entre de novo.";

/**
 * The account for which a `401 not_signed_in` was followed by a `/me` that still answered that very account (an
 * API that contradicts itself), and when. `/me` is not read again for that reason before `SESSION_RECHECK_MS`
 * have passed: one re-read per ended session, never one per refused request.
 */
let stillSignedIn: { id: string; at: number } | null = null;
export const SESSION_RECHECK_MS = 60_000;

/** The page shows an account, and `/me` has not just confirmed it after a `not_signed_in`. */
function sessionMayHaveEnded(): boolean {
  const id = useAccount.getState().user?.id;
  return id !== undefined && (stillSignedIn?.id !== id || Date.now() - stillSignedIn.at >= SESSION_RECHECK_MS);
}

/** True when the re-read in flight was asked for (also) by a `401 not_signed_in`. */
let endedAsked = false;

/**
 * The account changed in another tab (409 account_changed), was blocked (403 session_blocked), lost the
 * administrator role (403 admin_only) or its session ended (401 not_signed_in, `ended`): follow the cookie, never
 * write across accounts. Signed out is where a session that ended lands: the progress on screen is this
 * browser's again, nothing is left "pending", and moderation mode goes off (`lib/moderation.ts` follows the account).
 */
let refreshing: Promise<void> | null = null;
function refreshAccount(ended = false): Promise<void> {
  endedAsked ||= ended;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const { user } = await api.me();
      const current = useAccount.getState().user;
      if (user?.id === current?.id) {
        // Same account. A block recorded or lifted while this page was open changes what the session may do.
        if (user && Boolean(user.blocked) !== Boolean(current?.blocked)) {
          await signedIn(user);
          useVila.getState().notify(user.blocked ? BLOCKED_NOTICE : "O bloqueio da sua conta foi retirado.");
        } else useAccount.getState().setUser(user);
        // Refused as signed out, yet `/me` says this account is signed in: do not ask again for that reason.
        if (user && endedAsked) stillSignedIn = { id: user.id, at: Date.now() };
        return;
      }
      signedOutHere();
      if (user) await signedIn(user);
      useVila.getState().notify(
        user ? `Você está como @${user.nickname} (a conta mudou em outra aba).` : endedAsked ? SESSION_ENDED_NOTICE : "Você saiu da conta em outra aba."
      );
    } catch {
      /* offline: try again on the next write */
    }
  })().finally(() => {
    refreshing = null;
    endedAsked = false;
  });
  return refreshing;
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
 * Startup: reads the flags (accounts, quests, files, withdrawal, moderation), consumes a `#login=` link (then removes it from the address
 * bar) or restores the session. The token travels in the fragment, which the browser never sends to any
 * server (so it is in no access log). Never throws; without the API the game stays fully playable (quests,
 * which need the API's flag, stay off).
 */
export async function initAccount() {
  try {
    const { accounts, quests, files, withdrawal, moderation } = await api.config();
    setServerQuests(quests === true);
    useAccount.setState({
      enabled: accounts,
      files: accounts && files === true,
      withdrawal: accounts && withdrawal === true,
      presenceModeration: accounts && moderation?.presence === true,
    });
    if (!accounts) return;
    const token = takeLoginToken();
    if (token) {
      try {
        const { user } = await api.verify(token);
        await signedIn(user);
        if (user.blocked) {
          // The link proved the e-mail is theirs: show the message from the administration right away.
          useVila.getState().notify(BLOCKED_NOTICE);
          useVila.getState().open({ kind: "account" });
        } else useVila.getState().notify(`Bem-vindo(a), ${user.nickname}! Seu progresso agora fica salvo na sua conta.`);
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
