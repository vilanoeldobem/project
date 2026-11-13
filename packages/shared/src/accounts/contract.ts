/**
 * Shapes of the account and NGO-review API answers (docs/reference/api.md), shared by the browser apps that
 * call them: the game (`apps/client`) and the backoffice dashboard (`apps/dash`, IMPL-0015). Types and pt-BR
 * labels only; no fetch, no DOM.
 */
import type { ApplicationFile } from "./files";
import type { NgoApplication } from "./validate";

/**
 * The two roles (IMPL-0021). The stored values stay `player` and `admin`; people read the labels below. Only an
 * administrator opens the dashboard and sees moderation actions in the game.
 */
export const ROLES = ["player", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** UI copy for the roles. */
export const ROLE_LABEL: Record<Role, string> = {
  player: "Padrão",
  admin: "Administrador",
};

/**
 * A block in force on an account (IMPL-0021, PROPOSTA; OQ-11). `message` is what the administration wrote to the
 * blocked person: they read it as written. It is not an internal note.
 */
export interface AccountBlock {
  message: string;
  at: string;
}

/** What `GET /me` returns about the signed-in person (never sent to anyone else). */
export interface Me {
  id: string;
  name: string;
  nickname: string;
  city: string;
  email: string;
  role: Role;
  /** Durable account erasure is pending; absent only when talking to an older API. */
  deletionPending?: boolean;
  /**
   * Present only while the account is blocked. A blocked account's session is restricted: it reads `GET /me`,
   * signs out and deletes the account; every other signed-in route answers `403 session_blocked`.
   */
  blocked?: AccountBlock;
}

export const APPLICATION_STATUSES = ["submitted", "under_review", "changes_requested", "published", "rejected", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** State names are PROPOSTA (IMPL-0011); the labels are UI copy. */
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: "Candidatura enviada",
  under_review: "Em análise",
  changes_requested: "Ajustes solicitados",
  published: "Aprovada e publicada",
  rejected: "Não aprovada",
  withdrawn: "Retirada da Vila",
};

export interface Application extends NgoApplication {
  id: string;
  status: ApplicationStatus;
  revision: number;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Present once the administration withdrew the NGO (IMPL-0020, PROPOSTA). `reason` is the message the admin
   * wrote to the organisation: the applicant reads it as written. It is not an internal note.
   */
  withdrawal?: { reason: string; at: string };
}

/** `GET /ngo/application` and the answer of `POST /ngo/application`. `files` is empty unless uploads are on (IMPL-0017). */
export interface OwnApplication {
  application: Application | null;
  files: ApplicationFile[];
}

/** `POST /ngo/application/files?kind=…`: the stored file and the application's new revision. */
export interface FileUploaded {
  file: ApplicationFile;
  revision: number;
}

/** Row of `GET /admin/applications`. */
export type ApplicationSummary = Pick<Application, "id" | "name" | "city" | "status" | "revision" | "lotId" | "createdAt" | "updatedAt">;

/** One `audit_events` row as the admin routes return it: `actor` is a nickname (null once the account is gone). */
export interface AuditEntry {
  at: string;
  action: string;
  /** JSON text without personal data, or null. */
  detail: string | null;
  actor: string | null;
}

/** `GET /admin/applications/:id`. */
export interface ApplicationDetail {
  application: Application;
  applicant: { nickname: string; deletionPending?: boolean } | null;
  history: AuditEntry[];
  /** Logo first, then documents in the order they were sent; empty unless uploads are on (IMPL-0017). */
  files: ApplicationFile[];
}

export type ReviewAction = "start_review" | "approve" | "request_changes" | "reject";

/** The three DEC-015 checks the admin ticked before approving (recorded in the audit). */
export interface EligibilityChecks {
  activeCnpj: boolean;
  oneYear: boolean;
  fundsConfirmable: boolean;
}

/** Row of `GET /admin/audit`. */
export interface AuditEvent extends AuditEntry {
  subject: string;
}

/**
 * Row of `GET /admin/users`, and the `user` answered by the role, block and unblock routes: no e-mail and no name
 * (only the nickname is public; data minimisation), and never the block message.
 */
export interface UserSummary {
  id: string;
  nickname: string;
  role: Role;
  city: string;
  createdAt: string;
  verified: boolean;
  /** A block is in force on the account (IMPL-0021, PROPOSTA). */
  blocked: boolean;
}

/** `moderation` in `GET /config`: what works right now (accounts on and the flag on), so the apps show only that. */
export interface ModerationConfig {
  /** Removing a visitor from a room (PRESENCE_MODERATION_ENABLED). */
  presence: boolean;
  /** Blocking an account (ACCOUNT_BLOCK_ENABLED). Lifting a block already recorded works with the flag off. */
  block: boolean;
}

/** `POST /admin/moderation/ticket`: a single-use ticket, sent by the game on its open connection as `["m", target, ticket]`. */
export interface ModerationTicket {
  ticket: string;
  /** ISO instant, 30 seconds after the ticket was issued. */
  expiresAt: string;
}

/** "plaza-03" → 3 (the number people see on the lot). */
export const lotNumber = (lotId: string): number => Number(lotId.split("-")[1]);
