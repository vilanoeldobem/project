import { create } from "zustand";

export interface Account {
  id: string;
  name: string;
  nickname: string;
  city: string;
  email: string;
}

export class AuthError extends Error {}

export async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new AuthError(result.error ?? "internal");
  return result as T;
}

// Fragments never reach the server. Remove the credential before any UI navigation.
export function takeLoginFragment(): string | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const token = fragment.get("login");
  if (fragment.has("login")) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return token;
}
const pendingToken = takeLoginFragment();
let revision = 0;

interface AuthState {
  user: Account | null;
  available: boolean;
  ready: boolean;
  failed: boolean;
  token: string | null;
  refresh: () => Promise<void>;
  clearToken: () => void;
  signedOut: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null, available: false, ready: false, failed: false, token: pendingToken,
  clearToken: () => set({ token: null }),
  signedOut: () => { revision++; set({ user: null, failed: false }); },
  refresh: async () => {
    const current = ++revision;
    try {
      const state = await authRequest<{ user: Account | null; available: boolean }>("session");
      if (current === revision) set({ user: state.user, available: state.available, ready: true, failed: false });
    } catch {
      if (current === revision) set({ ready: true, failed: true });
    }
  },
}));
