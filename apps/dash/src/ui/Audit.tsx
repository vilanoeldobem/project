/**
 * Audit trail (`audit_events`, DEC-037): read-only, newest first, page by page. Rows never carry e-mails, names
 * or the text of review messages (the API writes ids and state changes only); the actor shows by nickname.
 */
import { ACTION_LABEL, applicationIdOf, dateTime, prettyJson } from "../lib/format";
import { usePaged } from "../lib/hooks";
import { hrefOf } from "../lib/router";
import { api } from "../lib/services";
import { AccountsOff, DataTable, Live, PageHead } from "./common";

export function Audit({ locked }: { locked: boolean }) {
  return (
    <>
      <PageHead title="Auditoria" lead="Registro das decisões e mudanças (mais recentes primeiro). Somente leitura; nada aqui pode ser editado ou apagado." />
      {locked ? <AccountsOff what="a auditoria não pode ser lida" /> : <AuditTable />}
    </>
  );
}

function AuditTable() {
  const page = usePaged((before) => api.audit(before));
  const events = page.items ?? [];
  return (
    <Live loading={page.loading} error={page.error}>
      {page.items && events.length === 0 && (
        <p className="muted" data-state="empty">
          Nenhum evento registrado.
        </p>
      )}
      {events.length > 0 && (
        <>
          <DataTable
            caption="Eventos de auditoria"
            columns={["Quando", "Ação", "Autor", "Assunto", "Detalhe"]}
            rows={events.map((e, i) => {
              const application = applicationIdOf(e.subject);
              return {
                key: `${e.at}-${i}`,
                cells: [
                  dateTime(e.at),
                  <>
                    {ACTION_LABEL[e.action] ?? e.action} <code className="muted">{e.action}</code>
                  </>,
                  e.actor ? `@${e.actor}` : "—",
                  application ? <a href={hrefOf({ section: "applications", id: application })}>Candidatura {application.slice(0, 8)}</a> : <code>{e.subject}</code>,
                  e.detail ? (
                    <details>
                      <summary>Ver detalhe</summary>
                      <pre>{prettyJson(e.detail)}</pre>
                    </details>
                  ) : (
                    "—"
                  ),
                ],
              };
            })}
          />
          <p className="muted" role="status">
            {events.length} {events.length === 1 ? "evento carregado" : "eventos carregados"}
            {page.hasMore ? "" : " (todos)"}.
          </p>
          {page.hasMore && (
            <button className="btn" disabled={page.loading} onClick={page.more}>
              Carregar mais antigos
            </button>
          )}
        </>
      )}
    </Live>
  );
}
