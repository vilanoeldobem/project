/**
 * Accounts on the client (P13, OQ-02, OQ-03; IMPL-0011): config flag, magic-link sign-in, the signed-in
 * user, progress sync with the server and the NGO/admin calls. The session lives in an HttpOnly cookie on
 * the API host; this module never sees it. Exploring the Vila never requires an account.
 */
import { create } from "zustand";

import type { NgoApplication } from "@vila/shared/accounts/validate";
import type { Progress } from "@vila/shared/game/progress";

import { useVila } from "../game/store";
import { SERVICES } from "./services";

export interface Me {
  id: string;
  name: string;
  nickname: string;
  city: string;
  email: string;
  role: "player" | "admin";
}

export type ApplicationStatus = "submitted" | "under_review" | "changes_requested" | "published" | "rejected";
export interface Application extends NgoApplication {
  id: string;
  status: ApplicationStatus;
  revision: number;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** API error with the stable code and pt-BR field messages. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fields: Record<string, string> = {}
  ) {
    super(code);
  }
}

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
  if (!res.ok) throw new ApiError(res.status, data.error ?? "unknown", data.fields);
  return data as T;
}

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
  postEvents: (events: Array<{ missionId: string; eventId: string }>) => call<{ progress: Progress }>("POST", "/progress/events", { events }),
  application: () => call<{ application: Application | null }>("GET", "/ngo/application"),
  submitApplication: (a: NgoApplication) => call<{ application: Application }>("POST", "/ngo/application", a),
  adminList: (status?: string) => call<{ applications: Array<Pick<Application, "id" | "name" | "city" | "status" | "revision" | "lotId" | "createdAt" | "updatedAt">> }>(
    "GET",
    `/admin/applications${status ? `?status=${encodeURIComponent(status)}` : ""}`
  ),
  adminGet: (id: string) =>
    call<{ application: Application; applicant: { nickname: string } | null; history: Array<{ at: string; action: string; actor: string | null; detail: string | null }> }>(
      "GET",
      `/admin/applications/${id}`
    ),
  adminDecide: (id: string, action: "start_review" | "approve" | "request_changes" | "reject", note?: string) =>
    call<{ application: Application }>("POST", `/admin/applications/${id}/decision`, { action, note }),
};

interface AccountState {
  /** Accounts turned on by the API (`/config`); everything account-related hides when false. */
  enabled: boolean;
  user: Me | null;
  ready: boolean;
  setUser: (u: Me | null) => void;
}

export const useAccount = create<AccountState>((set) => ({
  enabled: false,
  user: null,
  ready: false,
  setUser: (user) => set({ user }),
}));

const seenEvents = (p: Progress) =>
  Object.keys(p.seen).map((k) => {
    const i = k.indexOf(":");
    return { missionId: k.slice(0, i), eventId: k.slice(i + 1) };
  });

/** Sends local events to the server (idempotent) and adopts the server's progress. */
async function syncProgress() {
  const local = seenEvents(useVila.getState().progress);
  let server = (await api.progress()).progress;
  for (let i = 0; i < local.length; i += 50) server = (await api.postEvents(local.slice(i, i + 50))).progress;
  useVila.getState().adoptProgress(server);
}

let unsubscribe: (() => void) | null = null;

/** While signed in, every new local mission event is mirrored to the server. */
function followProgress() {
  unsubscribe?.();
  unsubscribe = useVila.subscribe((s, prev) => {
    if (s.progress === prev.progress || !useAccount.getState().user) return;
    const fresh = Object.keys(s.progress.seen).filter((k) => !prev.progress.seen[k]);
    if (!fresh.length) return;
    api
      .postEvents(fresh.map((k) => ({ missionId: k.slice(0, k.indexOf(":")), eventId: k.slice(k.indexOf(":") + 1) })))
      .catch(() => {
        /* offline: the events stay local and are sent again on the next sign-in (idempotent) */
      });
  });
}

export async function signedIn(user: Me) {
  useAccount.getState().setUser(user);
  followProgress();
  await syncProgress().catch(() => {
    /* keep local progress if the server is unreachable */
  });
}

export async function signOut() {
  await api.logout().catch(() => null);
  unsubscribe?.();
  unsubscribe = null;
  useAccount.getState().setUser(null);
}

/**
 * Startup: reads the flag, consumes a `?login=` link (then removes it from the address bar) or restores
 * the session. Never throws; without the API the game stays fully playable.
 */
export async function initAccount() {
  try {
    const { accounts } = await api.config();
    useAccount.setState({ enabled: accounts });
    if (!accounts) return;
    const params = new URLSearchParams(location.search);
    const token = params.get("login");
    if (token) {
      params.delete("login");
      history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`);
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
