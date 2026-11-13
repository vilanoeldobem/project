/** Sending an admin decision, a withdrawal or a logo removal about the version of an application that is on screen (DEC-037). */
import type { ApplicationDetail, ApplicationStatus, EligibilityChecks, ReviewAction } from "@vila/shared/accounts/contract";
import { errorText } from "@vila/shared/accounts/errors";

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

/** Refusals of a logo removal that mean the screen is out of date: read the application again. */
const LOGO_STALE = ["stale_revision", "account_deleting", "not_found", "file_cleanup_pending"];

/** Sentences for the refusals of a logo removal that the shared list has no sentence for, or words for another screen. */
const LOGO_TEXT: Record<string, string> = {
  not_found: "Este logo não existe mais: pode ter sido removido ou trocado. Confira os arquivos atuais.",
  self_review: "Você é a pessoa responsável por esta organização. Outra pessoa da administração precisa remover o logo.",
  files_unavailable: "O armazenamento dos arquivos está indisponível agora. O logo não foi removido; tente de novo mais tarde.",
  file_cleanup_pending: "O logo já saiu da candidatura e não é mais exibido. A limpeza do arquivo no armazenamento ainda não terminou.",
};

/** The sentence shown for a refused logo removal: the API's own sentence for its code unless this screen has a closer one. */
export const logoRefusalText = (error: unknown): string => LOGO_TEXT[(error as { code?: string }).code ?? ""] ?? errorText(error);

/**
 * Removing the logo of the NGO on screen, in any status (IMPL-0021): a published logo is public, so the
 * administration can take it down. Same contract as `sendDecision`: the revision on screen is sent, and a refusal
 * that means the application changed comes back with the current version. The removal bumps the revision.
 */
export async function sendLogoRemoval(api: Pick<Api, "adminRemoveLogo" | "adminGet">, id: string, d: ApplicationDetail, accountId: string): Promise<DecisionResult> {
  try {
    const { application } = await api.adminRemoveLogo(id, accountId, d.application.revision);
    // The logo is gone: show that even if re-reading the files and the history fails.
    const without = { ...d, application, files: (d.files ?? []).filter((f) => f.kind !== "logo") };
    return { ok: true, status: application.status, detail: await api.adminGet(id).catch(() => without) };
  } catch (error) {
    const stale = LOGO_STALE.includes((error as { code?: string }).code ?? "");
    return { ok: false, error, stale, detail: stale ? await api.adminGet(id).catch(() => d) : d };
  }
}
