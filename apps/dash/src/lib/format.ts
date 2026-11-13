/** Small pure helpers for what the dashboard prints (pt-BR). */
import { type ApplicationSummary, ROLE_LABEL } from "@vila/shared/accounts/contract";

/** Audit actions the API writes today (docs/reference/storage.md); unknown ones are shown by their code. */
export const ACTION_LABEL: Record<string, string> = {
  "ngo.submit": "Candidatura enviada",
  "ngo.resubmit": "Candidatura reenviada",
  "ngo.start_review": "Análise iniciada",
  "ngo.approve": "Aprovada e publicada",
  "ngo.request_changes": "Ajustes solicitados",
  "ngo.reject": "Não aprovada",
  "ngo.withdraw": "Retirada da Vila pela administração",
  "ngo.file_add": "Arquivo enviado",
  "ngo.file_remove": "Arquivo removido",
  "ngo.file_read": "Documento baixado pela administração",
  "ngo.logo_remove": "Logo removido pela administração",
  "user.delete": "Conta excluída pela própria pessoa",
  // Roles and moderation (IMPL-0021).
  "user.role_change": "Papel alterado",
  "user.block": "Conta bloqueada pela administração",
  "user.unblock": "Bloqueio de conta desfeito",
  // The API records that a removal was authorised (the ticket was accepted), not that a connection was closed.
  "presence.remove": "Remoção de visitante autorizada",
};

const FILE_KIND_LABEL = new Map([
  ["logo", "logo"],
  ["document", "documento"],
]);

/** The two roles as people read them (the shared labels); a role this build does not know is shown by its code. */
const ROLE_NAMES = new Map<string, string>(Object.entries(ROLE_LABEL));
export const roleLabel = (role: string): string => ROLE_NAMES.get(role) ?? role;

/**
 * How an audit row reads. A file sent or removed (IMPL-0017) also says which kind of file it was, taken from the
 * detail `{kind, file, revision?}`; the file id there is not a name and is never printed as one. A role change
 * (IMPL-0021) says which way it went, from the detail `{from, to}`. Nothing else of a detail is printed.
 */
export function actionText(action: string, detail: string | null): string {
  const label = ACTION_LABEL[action] ?? action;
  if (action !== "ngo.file_add" && action !== "ngo.file_remove" && action !== "user.role_change") return label;
  try {
    const parsed = JSON.parse(detail ?? "") as { kind?: unknown; from?: unknown; to?: unknown } | null;
    if (action === "user.role_change") {
      const from = ROLE_NAMES.get(parsed?.from as string), to = ROLE_NAMES.get(parsed?.to as string);
      return from && to ? `${label} (${from} → ${to})` : label;
    }
    const kind = FILE_KIND_LABEL.get(parsed?.kind as string);
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

/** Feature flags of `GET /config`; a flag the dashboard does not know yet is shown by its key. */
export const FLAG_LABEL: Record<string, string> = {
  accounts: "Contas, XP no servidor, candidaturas e análise",
  quests: "Missões narrativas quests-v1 (PROPOSTA)",
  files: "Logo e documentos nas candidaturas (PROPOSTA)",
  withdrawal: "Retirada de ONG publicada (PROPOSTA)",
  "moderation.presence": "Remoção de visitante de uma sala do jogo (PROPOSTA)",
  "moderation.block": "Bloqueio de conta (PROPOSTA)",
  residentialPlots: "Posse de terrenos residenciais (PROPOSTA)",
};

/**
 * The flags of `GET /config`, one row each. A group of flags (`moderation: {presence, block}`, IMPL-0021) becomes
 * one row per flag, keyed `group.flag`; everything else is kept as the API sent it.
 */
export function flagRows(config: Record<string, unknown>): Array<[key: string, value: unknown]> {
  return Object.entries(config).flatMap(([key, value]): Array<[string, unknown]> =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? Object.entries(value).map(([inner, v]): [string, unknown] => [`${key}.${inner}`, v]) : [[key, value]]
  );
}

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
