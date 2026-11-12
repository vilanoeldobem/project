/**
 * Client of the HTTP API for the backoffice dashboard (docs/reference/api.md). The session is the HttpOnly
 * cookie the API host sets (`credentials: "include"`); this module never sees it. No account is created here.
 */
import type {
  ApplicationDetail,
  ApplicationStatus,
  ApplicationSummary,
  AuditEvent,
  EligibilityChecks,
  Me,
  ReviewAction,
  UserSummary,
} from "@vila/shared/accounts/contract";
import { ApiError } from "@vila/shared/accounts/errors";

/** `GET /health`. */
export interface Health {
  ok: boolean;
  version: string;
  environment: string;
  db: boolean;
  mail: boolean;
}

/**
 * `GET /config`: feature flags. `files` is true only when uploads work (IMPL-0017); an older API does not send
 * it. Every key the API sends is kept (the system screen prints them all).
 */
export interface Config {
  accounts?: boolean;
  quests?: boolean;
  files?: boolean;
  [flag: string]: unknown;
}

/** Row of `GET /lots` (public): the NGO name appears only once published. */
export interface Lot {
  id: string;
  street: string;
  slot: number;
  state: string;
  ngo_name: string | null;
  ngo_summary: string | null;
}

/** One page of a newest-first list; `next` is the `before` of the following page (null on the last one). */
export interface Page<T> {
  items: T[];
  next: string | null;
}

const pageQuery = (before?: string) => (before ? `?before=${encodeURIComponent(before)}` : "");

/**
 * `onError` sees every failed call (the app uses it to notice a session that ended or lost the admin role).
 * `fetcher` is injectable for tests.
 */
export function createApi(base: string, fetcher: typeof fetch = fetch, onError: (e: ApiError) => void = () => {}) {
  /** Sends one request with the session cookie; an unanswered or refused one becomes an `ApiError`. */
  async function send(method: string, path: string, headers: Record<string, string>, body?: string): Promise<Response> {
    let res: Response;
    try {
      res = await fetcher(`${base}${path}`, { method, credentials: "include", headers, body });
    } catch {
      throw new ApiError(0, "network");
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
      const error = new ApiError(res.status, data.error ?? "unknown", data.fields);
      onError(error);
      throw error;
    }
    return res;
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await send(
      method,
      path,
      body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body === undefined ? undefined : JSON.stringify(body)
    );
    if (res.status === 204) return null as T;
    return (await res.json().catch(() => ({}))) as T;
  }

  return {
    health: () => call<Health>("GET", "/health"),
    config: () => call<Config>("GET", "/config"),
    lots: () => call<{ lots: Lot[] }>("GET", "/lots"),
    requestLink: (email: string) => call<{ ok: true; devLink?: string }>("POST", "/auth/link", { email }),
    verify: (token: string) => call<{ user: Me }>("POST", "/auth/verify", { token }),
    me: () => call<{ user: Me | null }>("GET", "/me"),
    logout: () => call<null>("POST", "/auth/logout", {}),
    adminList: (status?: ApplicationStatus) =>
      call<{ applications: ApplicationSummary[] }>("GET", `/admin/applications${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    adminGet: (id: string) => call<ApplicationDetail>("GET", `/admin/applications/${id}`),
    /** `revision` is the version on screen: a newer resubmission makes the API refuse (409 stale_revision). */
    adminDecide: (id: string, action: ReviewAction, revision: number, note?: string, checks?: EligibilityChecks) =>
      call<{ application: ApplicationDetail["application"] }>("POST", `/admin/applications/${id}/decision`, { action, revision, note, checks }),
    /**
     * The bytes of one file of an application (IMPL-0017). They can only be read this way: the route checks the
     * `Origin`, so a plain link or `<img src>` is refused. The API audits every read of a document
     * (`ngo.file_read`): call this for a document only when the admin asks for it.
     */
    fileBytes: async (applicationId: string, fileId: string): Promise<Blob> => {
      const res = await send("GET", `/admin/applications/${applicationId}/files/${fileId}`, {});
      return res.blob().catch(() => {
        throw new ApiError(0, "network");
      });
    },
    audit: async (before?: string): Promise<Page<AuditEvent>> => {
      const r = await call<{ events: AuditEvent[]; next: string | null }>("GET", `/admin/audit${pageQuery(before)}`);
      return { items: r.events, next: r.next };
    },
    users: async (before?: string): Promise<Page<UserSummary>> => {
      const r = await call<{ users: UserSummary[]; next: string | null }>("GET", `/admin/users${pageQuery(before)}`);
      return { items: r.users, next: r.next };
    },
  };
}

export type Api = ReturnType<typeof createApi>;
