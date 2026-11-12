/** Small pure helpers for what the dashboard prints (pt-BR). */
import type { ApplicationSummary } from "@vila/shared/accounts/contract";

/** Audit actions the API writes today (docs/reference/storage.md); unknown ones are shown by their code. */
export const ACTION_LABEL: Record<string, string> = {
  "ngo.submit": "Candidatura enviada",
  "ngo.resubmit": "Candidatura reenviada",
  "ngo.start_review": "Análise iniciada",
  "ngo.approve": "Aprovada e publicada",
  "ngo.request_changes": "Ajustes solicitados",
  "ngo.reject": "Não aprovada",
  "user.delete": "Conta excluída pela própria pessoa",
};

/** Lot states (DEC-028); unknown ones are shown by their code. */
export const LOT_STATE_LABEL: Record<string, string> = {
  available: "Disponível",
  application_sent: "Candidatura enviada",
  under_review: "Em análise",
  published: "Casa publicada",
};

export const ROLE_LABEL: Record<string, string> = { player: "Jogador", admin: "Administrador" };

/** Feature flags of `GET /config`; a flag the dashboard does not know yet is shown by its key. */
export const FLAG_LABEL: Record<string, string> = { accounts: "Contas, XP no servidor, candidaturas e análise" };

export const dateTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
};

/** Audit detail is JSON text: pretty-printed when it parses, shown as it is otherwise. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** `ngo:<uuid>` → the application the event is about, when the subject is one. */
export function applicationIdOf(subject: string): string | null {
  const m = /^ngo:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(subject);
  return m ? m[1] : null;
}

/** How a `/config` value reads: booleans are flags; anything else is printed as JSON. */
export function flagText(value: unknown): string {
  return value === true ? "Ligado" : value === false ? "Desligado" : JSON.stringify(value);
}

/** The application occupying a lot: a rejected one no longer holds it. */
export function occupantOf(lot: { id: string }, applications: ApplicationSummary[]): ApplicationSummary | undefined {
  return applications.find((a) => a.lotId === lot.id && a.status !== "rejected");
}
