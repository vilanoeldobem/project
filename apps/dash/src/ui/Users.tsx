/**
 * Accounts, read-only (P13). Data minimisation: the list endpoint sends no e-mail and no name — only the
 * nickname is public, and minors are a likely audience (LGPD, ECA Digital), so the dashboard holds the minimum.
 * Sanctions (DEC-037) are not defined by the product owner yet: there is deliberately no action here.
 */
import { dateTime, ROLE_LABEL } from "../lib/format";
import { usePaged } from "../lib/hooks";
import { api } from "../lib/services";
import { AccountsOff, DataTable, Live, Notice, PageHead } from "./common";

export function Users({ locked }: { locked: boolean }) {
  return (
    <>
      <PageHead title="Usuários" lead="Contas da Vila pelo nickname (mais recentes primeiro). Somente leitura." />
      {locked ? <AccountsOff what="a lista de contas não pode ser lida" /> : <UsersTable />}
      <Notice state="pending" title="Sanções: pendente de definição">
        <p>
          As regras de sanção (aviso, suspensão, remoção) ainda não foram definidas pelo dono do produto (DEC-037). Por isso não há nenhuma ação
          sobre contas neste painel.
        </p>
      </Notice>
    </>
  );
}

function UsersTable() {
  const page = usePaged((before) => api.users(before));
  const users = page.items ?? [];
  return (
    <Live loading={page.loading} error={page.error} onRetry={page.retry}>
      <p className="muted">E-mail e nome não aparecem aqui: só o nickname é público, e o painel guarda o mínimo.</p>
      {page.items && users.length === 0 && (
        <p className="muted" data-state="empty">
          Nenhuma conta criada.
        </p>
      )}
      {users.length > 0 && (
        <>
          <DataTable
            caption="Contas"
            columns={["Nickname", "Papel", "Cidade", "Criada em", "Verificada"]}
            rows={users.map((u) => ({
              key: u.id,
              cells: [`@${u.nickname}`, ROLE_LABEL[u.role] ?? u.role, u.city, dateTime(u.createdAt), u.verified ? "Sim" : "Não"],
            }))}
          />
          <p className="muted" role="status">
            {users.length} {users.length === 1 ? "conta carregada" : "contas carregadas"}
            {page.hasMore ? "" : " (todas)"}.
          </p>
          {page.hasMore && (
            <button className="btn" disabled={page.loading} onClick={page.more}>
              Carregar mais antigas
            </button>
          )}
        </>
      )}
    </Live>
  );
}
