import { useAuth } from "./auth";
import { SERVICES } from "./services";

export interface NgoApplication {
  id: string; ngoId: string | null; lotId: string; name: string; cnpj: string; openedOn: string;
  summary: string; status: "submitted" | "under_review" | "changes_requested" | "rejected" | "published";
  revision: number; feedback: string | null; createdAt: string; updatedAt: string;
}
export interface ApplicationFields { name: string; cnpj: string; openedOn: string; summary: string; lotId: string }
export interface ApplicationList { applications: NgoApplication[]; canReview: boolean }
export class ApplicationError extends Error {}

export async function applicationRequest<T>(path: string, userId: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${SERVICES.api}${path}`, {
    method, credentials: "include", cache: "no-store",
    headers: { "X-Account-ID": userId, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json() as T & { error?: string };
  if (useAuth.getState().user?.id !== userId) throw new ApplicationError("account_changed");
  if (!response.ok) {
    if (result.error === "account_changed") void useAuth.getState().refresh();
    if (response.status === 401) useAuth.getState().signedOut();
    throw new ApplicationError(result.error ?? "unavailable");
  }
  return result;
}

export function applicationError(error: unknown): string {
  const code = error instanceof ApplicationError ? error.message : "unavailable";
  switch (code) {
    case "revision_conflict": return "Esta candidatura mudou. Atualize a lista e confira a versão mais recente antes de tentar de novo.";
    case "lot_unavailable": return "Esse terreno já está ocupado. Atualize a lista e escolha outro terreno disponível.";
    case "invalid_fields": return "Confira os dados: nome, CNPJ válido, data de abertura com pelo menos um ano de existência, apresentação e terreno.";
    case "cnpj_exists": return "Já existe uma candidatura com esse CNPJ. Confira suas candidaturas ou procure a equipe.";
    case "invalid_transition": return "Essa etapa já mudou. Atualize a lista antes de continuar.";
    case "invalid_eligibility": return "Confirme os três critérios de participação antes de aprovar.";
    case "forbidden": return "Sua conta não tem permissão para revisar candidaturas.";
    case "account_changed": return "A conta mudou em outra aba. Confira seu acesso antes de continuar.";
    case "not_found": return "Esta candidatura não está disponível para sua conta.";
    default: return "Não foi possível concluir. Confira sua conexão e tente novamente.";
  }
}
