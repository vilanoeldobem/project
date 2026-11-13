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
  ModerationConfig,
  NgoPayment,
  ReviewAction,
  Role,
  UserSummary,
} from "@vila/shared/accounts/contract";
import { ApiError } from "@vila/shared/accounts/errors";
import type { DonationView, NgoPaymentMethod } from "@vila/shared/donations/contract";

import { isId } from "./ids";

/** `GET /health`. */
export interface Health {
  ok: boolean;
  version: string;
  environment: string;
  db: boolean;
  mail: boolean;
}

/**
 * `GET /config`: feature flags. `files` is true only when uploads work (IMPL-0017), `withdrawal` only when the
 * withdrawal of a published NGO is on (IMPL-0020, PROPOSTA) and `moderation` says which moderation actions work
 * (IMPL-0021, PROPOSTA); an older API sends none of them. Every key the API sends is kept (the system screen
 * prints them all).
 */
export interface Config {
  accounts?: boolean;
  quests?: boolean;
  files?: boolean;
  withdrawal?: boolean;
  moderation?: Partial<ModerationConfig>;
  /** Donations and the AbacatePay reconciliation (IMPL-0023, PROPOSTA); absent on an older API (= off). */
  donations?: boolean;
  [flag: string]: unknown;
}

/** `GET /admin/donations/overview`: the global split and the partner institution (admin only). */
export interface DonationSettings {
  primaryNgoName: string | null;
  primaryNgoCnpj: string | null;
  subAccountId: string | null;
  ngoPercentBps: number;
  fixedFeeCents: number;
  configured: boolean;
  updatedAt: string | null;
}

/** One NGO row of the overview: its payment mode, as stored (snake keys come from the API's SQL row). */
export interface NgoPaymentRow {
  id: string;
  name: string;
  status: string;
  lotId: string | null;
  payment_method: NgoPaymentMethod | null;
  donation_url: string | null;
  sub_account_id: string | null;
  link_validated: number | null;
  ngo_percent_bps: number | null;
  fixed_fee_cents: number | null;
}

/** A donation as the admin routes return it; the API's view, narrowed to what the dashboard renders. */
export type DonationRow = Pick<
  DonationView,
  "id" | "targetKind" | "ngoId" | "recipientName" | "amountCents" | "ngoShareCents" | "vilaShareCents" | "status" | "titleCredited" | "paidAt" | "createdAt"
>;

export interface DonationRedirect {
  id: string;
  ngo_id: string;
  ngo_name: string | null;
  created_at: string;
}

export interface DonationOverview {
  settings: DonationSettings;
  ngos: NgoPaymentRow[];
  recentDonations: DonationRow[];
  recentRedirects: DonationRedirect[];
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
 * An id as a path segment. Anything that is not a well-formed id never reaches a request path: the call is
 * refused here as `not_found`, without a request (and without telling the session listener: the API said nothing).
 */
function segment(id: string): string {
  if (!isId(id)) throw new ApiError(404, "not_found");
  return id;
}

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
    /** Global donation and provider settings (IMPL-0023; only when `/config` says `donations`). */
    donationOverview: () => call<DonationOverview>("GET", "/admin/donations/overview"),
    saveDonationSettings: (body: {
      accountId: string;
      primaryNgoName: string;
      primaryNgoCnpj: string;
      ngoPercentBps: number;
      fixedFeeCents: number;
      subAccountId?: string;
    }) => call<{ settings: DonationSettings }>("POST", "/admin/donations/settings", body),
    /** Confirms how one NGO receives donations (sub-account by CNPJ, or a validated external HTTPS link). */
    saveNgoPayment: (
      id: string,
      body: {
        accountId: string;
        paymentMethod: "abacatepay" | "external_link";
        donationUrl?: string;
        linkValidated?: boolean;
        ngoPercentBps: number;
        fixedFeeCents: number;
        subAccountId?: string;
      }
    ) => call<{ payment: NgoPayment | null }>("POST", `/admin/ngos/${id}/payment-config`, body),
    /** A donation paid on the NGO's own page, verified by an admin: it counts publicly, it grants no Título. */
    registerExternalProof: (body: { accountId: string; ngoId: string; amountCents: number; proofReference: string; note?: string }) =>
      call<{ donation: DonationRow }>("POST", "/admin/donations/external-proof", body),
    config: () => call<Config>("GET", "/config"),
    lots: () => call<{ lots: Lot[] }>("GET", "/lots"),
    requestLink: (email: string) => call<{ ok: true; devLink?: string }>("POST", "/auth/link", { email }),
    verify: (token: string) => call<{ user: Me }>("POST", "/auth/verify", { token }),
    me: () => call<{ user: Me | null }>("GET", "/me"),
    logout: () => call<null>("POST", "/auth/logout", {}),
    adminList: (status?: ApplicationStatus) =>
      call<{ applications: ApplicationSummary[] }>("GET", `/admin/applications${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    adminGet: async (id: string) => call<ApplicationDetail>("GET", `/admin/applications/${segment(id)}`),
    /** `revision` is the version on screen: a newer resubmission makes the API refuse (409 stale_revision). */
    adminDecide: async (id: string, action: ReviewAction, revision: number, note?: string, checks?: EligibilityChecks) =>
      call<{ application: ApplicationDetail["application"] }>("POST", `/admin/applications/${segment(id)}/decision`, { action, revision, note, checks }),
    /**
     * Withdraws a published NGO from the village (IMPL-0020, PROPOSTA; only when `/config` says `withdrawal`).
     * `message` is what the organisation will read, word for word; `accountId` is the admin this page believes is
     * signed in and `revision` the version on screen (a newer one makes the API refuse: 409 stale_revision).
     */
    adminWithdraw: async (id: string, accountId: string, revision: number, message: string) =>
      call<{ application: ApplicationDetail["application"] }>("POST", `/admin/ngos/${segment(id)}/withdraw`, { accountId, revision, reason: message }),
    /**
     * Removes the logo of an NGO, in any status (IMPL-0021): a published logo is public. `accountId` is the admin
     * this page believes is signed in and `revision` the version on screen (409 stale_revision when it moved).
     */
    adminRemoveLogo: async (id: string, accountId: string, revision: number) =>
      call<{ application: ApplicationDetail["application"] }>("POST", `/admin/ngos/${segment(id)}/logo/remove`, { accountId, revision }),
    /** Grants or takes the administrator role (IMPL-0021). Nobody changes their own role; the API audits the change. */
    adminSetRole: async (id: string, accountId: string, role: Role) => call<{ user: UserSummary }>("POST", `/admin/users/${segment(id)}/role`, { accountId, role }),
    /**
     * Blocks an account (IMPL-0021, PROPOSTA; only when `/config` says `moderation.block`). `message` is what the
     * blocked person will read, word for word: it is not an internal note.
     */
    adminBlock: async (id: string, accountId: string, message: string) => call<{ user: UserSummary }>("POST", `/admin/users/${segment(id)}/block`, { accountId, message }),
    /** Lifts a block. Works with the block flag off: nobody stays blocked without a way out. */
    adminUnblock: async (id: string, accountId: string) => call<{ user: UserSummary }>("POST", `/admin/users/${segment(id)}/unblock`, { accountId }),
    /**
     * The bytes of one file of an application (IMPL-0017). They can only be read this way: the route checks the
     * `Origin`, so a plain link or `<img src>` is refused. The API audits every read of a document
     * (`ngo.file_read`): call this for a document only when the admin asks for it.
     */
    fileBytes: async (applicationId: string, fileId: string): Promise<Blob> => {
      const res = await send("GET", `/admin/applications/${segment(applicationId)}/files/${segment(fileId)}`, {});
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
