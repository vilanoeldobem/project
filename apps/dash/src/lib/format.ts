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
  "ngo.file_add": "Arquivo enviado",
  "ngo.file_remove": "Arquivo removido",
  "ngo.file_read": "Documento baixado pela administração",
  "user.delete": "Conta excluída pela própria pessoa",
};

const FILE_KIND_LABEL = new Map([
  ["logo", "logo"],
  ["document", "documento"],
]);

/**
 * How an audit row reads. A file sent or removed (IMPL-0017) also says which kind of file it was, taken from the
 * detail `{kind, file, revision?}`; the file id there is not a name and is never printed as one.
 */
export function actionText(action: string, detail: string | null): string {
  const label = ACTION_LABEL[action] ?? action;
  if (action !== "ngo.file_add" && action !== "ngo.file_remove") return label;
  try {
    const kind = FILE_KIND_LABEL.get((JSON.parse(detail ?? "") as { kind?: unknown } | null)?.kind as string);
    return kind ? `${label} (${kind})` : label;
  } catch {
    return label;
  }
}

/** Lot states (DEC-028); unknown ones are shown by their code. */
export const LOT_STATE_LABEL: Record<string, string> = {
  available: "Disponível",
  application_sent: "Candidatura enviada",
  under_review: "Em análise",
  published: "Casa publicada",
};

export const ROLE_LABEL: Record<string, string> = { player: "Jogador", admin: "Administrador" };

/** Feature flags of `GET /config`; a flag the dashboard does not know yet is shown by its key. */
export const FLAG_LABEL: Record<string, string> = {
  accounts: "Contas, XP no servidor, candidaturas e análise",
  quests: "Missões narrativas quests-v1 (PROPOSTA)",
  files: "Logo e documentos nas candidaturas (PROPOSTA)",
};

/** File formats the API accepts (IMPL-0017); an unknown one is shown by its media type. */
export const FILE_TYPE_LABEL: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPEG", "application/pdf": "PDF" };

/** File size for people: "734 bytes", "182 KB", "1,5 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

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

/** Rejection and withdrawal release the lot; requested lot ids remain historical. */
export function occupantOf(lot: { id: string }, applications: ApplicationSummary[]): ApplicationSummary | undefined {
  return applications.find((a) => a.lotId === lot.id && a.status !== "rejected" && a.status !== "withdrawn");
}
