/**
 * API errors as the browser apps see them (the game and the backoffice dashboard): the stable English code,
 * the pt-BR field messages, and the pt-BR sentence shown for each code.
 */

/** API error with the stable code and pt-BR field messages. `status` 0 = the request never got an answer. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fields: Record<string, string> = {}
  ) {
    super(code);
  }
}

const ERROR_TEXT: Record<string, string> = {
  network: "Sem conexão com a Vila. Tente de novo em instantes.",
  too_many_requests: "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
  mail_unavailable: "Não conseguimos enviar o e-mail agora. Tente de novo mais tarde.",
  account_changed: "Você entrou ou saiu da conta em outra aba. Confira a conta e tente de novo.",
  account_deleting: "A exclusão da conta está em andamento. Tente excluir a conta novamente para concluir.",
  schema_outdated: "As contas estão temporariamente indisponíveis durante uma atualização. Tente de novo mais tarde.",
  files_unavailable: "O armazenamento dos arquivos está indisponível. Tente concluir a exclusão novamente mais tarde.",
  stale_revision: "A organização enviou uma nova versão enquanto esta tela estava aberta. Revise a versão atual.",
  checks_required: "Marque as três verificações antes de aprovar.",
  files_disabled: "O envio de arquivos não está disponível agora.",
  no_application: "Envie a candidatura antes de anexar arquivos.",
  application_locked: "Os arquivos não podem ser alterados agora: a candidatura está em análise ou a organização já foi publicada.",
  application_changed: "A candidatura mudou enquanto o arquivo era enviado. Atualize a página e tente de novo.",
};

/** The sentence to show for a failed call (UI copy, pt-BR). */
export const errorText = (e: unknown): string =>
  e instanceof ApiError ? (ERROR_TEXT[e.code] ?? (Object.keys(e.fields).length ? "Confira os campos destacados." : "Algo deu errado. Tente de novo.")) : "Algo deu errado.";
