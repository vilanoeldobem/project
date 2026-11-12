/** Sending an admin decision about the version of an application that is on screen (DEC-037). */
import type { ApplicationDetail, ApplicationStatus, EligibilityChecks, ReviewAction } from "@vila/shared/accounts/contract";

import type { Api } from "./api";

export type DecisionResult =
  /** Recorded as `status`. `detail` is the application re-read, or the copy on screen with the new state if that read failed. */
  | { ok: true; status: ApplicationStatus; detail: ApplicationDetail }
  /**
   * Refused. `stale` means the application changed while the screen was open (resubmitted, or a file was sent
   * or removed: both bump the revision); `detail` is then the current version, files included, to review again.
   */
  | { ok: false; error: unknown; stale: boolean; detail: ApplicationDetail };

export async function sendDecision(
  api: Pick<Api, "adminDecide" | "adminGet">,
  id: string,
  d: ApplicationDetail,
  action: ReviewAction,
  note: string,
  checks: EligibilityChecks
): Promise<DecisionResult> {
  try {
    const { application } = await api.adminDecide(id, action, d.application.revision, note || undefined, action === "approve" ? checks : undefined);
    // The decision is recorded: show it even if re-reading the history fails (it is only stale then).
    return { ok: true, status: application.status, detail: await api.adminGet(id).catch(() => ({ ...d, application })) };
  } catch (error) {
    const stale = ["stale_revision", "account_deleting"].includes((error as { code?: string }).code ?? "");
    return { ok: false, error, stale, detail: stale ? await api.adminGet(id).catch(() => d) : d };
  }
}

/** Refusals of a withdrawal that mean the screen is out of date: read the application again. */
const WITHDRAWAL_STALE = ["stale_revision", "account_deleting", "application_withdrawn", "bad_transition"];

/**
 * Withdrawing the published NGO on screen (IMPL-0020, PROPOSTA). `message` goes to the organisation as written.
 * Same contract as `sendDecision`: the revision on screen is sent, and a refusal that means the application
 * changed (new revision, account erasure started, already withdrawn) comes back with the current version.
 */
export async function sendWithdrawal(
  api: Pick<Api, "adminWithdraw" | "adminGet">,
  id: string,
  d: ApplicationDetail,
  accountId: string,
  message: string
): Promise<DecisionResult> {
  try {
    const { application } = await api.adminWithdraw(id, accountId, d.application.revision, message);
    return { ok: true, status: application.status, detail: await api.adminGet(id).catch(() => ({ ...d, application })) };
  } catch (error) {
    const stale = WITHDRAWAL_STALE.includes((error as { code?: string }).code ?? "");
    return { ok: false, error, stale, detail: stale ? await api.adminGet(id).catch(() => d) : d };
  }
}
