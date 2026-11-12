/**
 * Accounts (P13) and what an administrator can do about one (IMPL-0021): grant or take the administrator role,
 * and block or unblock the account.
 *
 * Data minimisation: the list endpoint sends no e-mail and no name — only the nickname is public, and minors are
 * a likely audience (LGPD, ECA Digital), so the dashboard holds the minimum.
 *
 * Account block is PROPOSTA: which sanctions exist, who applies them, for how long, with what appeal and what
 * notice is an open product question (OQ-11, DEC-037). The block is offered only when the API says
 * `moderation.block` in `/config`; lifting a block is always offered. Every action has a second step that names
 * the account and says what will happen, and the text of a block is labelled as what it is: a message the person
 * reads. Rules and wording live in `lib/moderation.ts`.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";

import type { UserSummary } from "@vila/shared/accounts/contract";

import { dateTime, roleLabel } from "../lib/format";
import { useLoad, usePaged } from "../lib/hooks";
import {
  BLOCK_MESSAGE_HINT,
  BLOCK_MESSAGE_LABEL,
  confirmationOf,
  offerFor,
  sendUserAction,
  USER_ACTION_LABEL,
  type UserAction,
  withUser,
} from "../lib/moderation";
import { api } from "../lib/services";
import { AccountsOff, Confirmation, DataTable, Field, Live, Notice, PageHead, Status } from "./common";

export function Users({ locked, accountId }: { locked: boolean; accountId?: string }) {
  return (
    <>
      <PageHead title="Usuários" lead="Contas da Vila pelo nickname (mais recentes primeiro). Mudanças de papel e bloqueios ficam registrados na auditoria." />
      {locked ? (
        <>
          <AccountsOff what="a lista de contas não pode ser lida" />
          <SanctionsNote />
        </>
      ) : (
        <Accounts accountId={accountId} />
      )}
    </>
  );
}

/**
 * The PROPOSTA note of the section. `blockOn` is the API's `moderation.block` flag (undefined while it is not
 * known: accounts off, or `/config` not read yet).
 */
export function SanctionsNote({ blockOn }: { blockOn?: boolean }) {
  return (
    <Notice state="pending" title="PROPOSTA (IMPL-0021): bloqueio de conta — política de sanções pendente" tone="warn">
      <p>
        Quais sanções existem, quem as aplica, por quanto tempo, com que recurso e com que aviso ainda é uma pergunta aberta para o dono do produto
        (OQ-11, DEC-037). O bloqueio de conta é só o mecanismo, atrás da bandeira <code>ACCOUNT_BLOCK_ENABLED</code>: hoje ele não tem prazo nem
        recurso, e a pessoa não é avisada por e-mail (ela lê a mensagem ao tentar entrar).
      </p>
      {blockOn === true && <p data-flag-note="on">Nesta API o bloqueio está ligado.</p>}
      {blockOn === false && (
        <p data-flag-note="off">Nesta API o bloqueio está desligado: não é possível bloquear contas. Um bloqueio já registrado continua valendo e pode ser desfeito aqui.</p>
      )}
    </Notice>
  );
}

/** What is open or was just answered, about one account. */
type Pending = { user: UserSummary; action: UserAction };
type Outcome = { userId: string; tone: "ok" | "error"; text: string };

function Accounts({ accountId }: { accountId?: string }) {
  const page = usePaged((before) => api.users(before));
  // A failed `/config` only means the flag is unknown (treated as off): the list itself still opens.
  const config = useLoad(() => api.config(), "config");
  const blockOn = config.data?.moderation?.block === true;
  const users = page.items ?? [];
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState({ message: "", field: "" });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** One request at a time, even if two clicks arrive before the screen is drawn again. */
  const sending = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  /** The account whose row gets the focus back once its panel closes. */
  const [focusRow, setFocusRow] = useState<string | null>(null);
  useEffect(() => {
    if (!focusRow) return;
    setFocusRow(null);
    const row = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []).find((r) => r.dataset.row === focusRow);
    (row?.querySelector<HTMLElement>("button:not(:disabled)") ?? root.current?.querySelector<HTMLElement>("[data-outcome]"))?.focus();
  }, [focusRow]);

  const open = (user: UserSummary, action: UserAction) => {
    if (sending.current) return;
    setPending({ user, action });
    setMessage("");
    setRefusal({ message: "", field: "" });
    setOutcome(null);
  };
  const close = (userId: string) => {
    setPending(null);
    setFocusRow(userId);
  };
  const confirm = async () => {
    if (!pending || !accountId || sending.current) return;
    sending.current = true;
    setBusy(true);
    setRefusal({ message: "", field: "" });
    const { user, action } = pending;
    const result = await sendUserAction(api, action, user, accountId, message);
    sending.current = false;
    setBusy(false);
    if (result.ok) {
      // The row is what the API answered, at once; then the list is read again from the API.
      page.patch((list) => withUser(list, result.user));
      page.reload();
      setOutcome({ userId: user.id, tone: "ok", text: result.done });
      close(user.id);
    } else if (result.stale) {
      // The account changed while this screen was open (or the flag did): show what is true now.
      page.reload();
      config.reload();
      setOutcome({ userId: user.id, tone: "error", text: result.message });
      close(user.id);
    } else {
      setRefusal({ message: result.message, field: result.field });
    }
  };

  return (
    <div ref={root}>
      <Live loading={page.loading} error={page.error} onRetry={page.retry}>
        <p className="muted">E-mail e nome não aparecem aqui: só o nickname é público, e o painel guarda o mínimo.</p>
        {page.items && users.length === 0 && (
          <p className="muted" data-state="empty">
            Nenhuma conta criada.
          </p>
        )}
        {/* The result of an action about an account that is no longer in the list. */}
        {outcome && !users.some((u) => u.id === outcome.userId) && <OutcomeLine outcome={outcome} />}
        {users.length > 0 && (
          <>
            <UserTable
              users={users}
              selfId={accountId}
              blockOn={blockOn}
              busy={busy}
              onAction={open}
              detailOf={(u) =>
                pending?.user.id === u.id ? (
                  <UserConfirmation
                    key={`${u.id}-${pending.action}`}
                    action={pending.action}
                    nickname={u.nickname}
                    message={message}
                    onMessage={(text) => {
                      setMessage(text);
                      // The error was about the text that is being changed.
                      setRefusal((r) => (r.field ? { ...r, field: "" } : r));
                    }}
                    busy={busy}
                    error={refusal.message}
                    fieldError={refusal.field}
                    onConfirm={() => void confirm()}
                    onCancel={() => close(u.id)}
                  />
                ) : outcome?.userId === u.id ? (
                  <OutcomeLine outcome={outcome} />
                ) : undefined
              }
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
      <SanctionsNote blockOn={config.data ? blockOn : undefined} />
    </div>
  );
}

function OutcomeLine({ outcome }: { outcome: Outcome }) {
  return (
    <p className={outcome.tone === "ok" ? "ok" : "error"} role={outcome.tone === "ok" ? "status" : "alert"} tabIndex={-1} data-outcome={outcome.tone}>
      {outcome.text}
    </p>
  );
}

/**
 * The accounts and, for each one, the actions `offerFor` allows. Nothing here is sent: a button opens the
 * confirmation of that row (`detailOf`). No e-mail and no name: the rows do not have them.
 */
export function UserTable({
  users,
  selfId,
  blockOn,
  busy = false,
  onAction,
  detailOf = () => undefined,
}: {
  users: UserSummary[];
  /** The signed-in administrator. */
  selfId?: string;
  blockOn: boolean;
  busy?: boolean;
  onAction: (user: UserSummary, action: UserAction) => void;
  /** What shows right below a row: its open confirmation or the result of its last action. */
  detailOf?: (user: UserSummary) => ReactNode;
}) {
  return (
    <DataTable
      caption="Contas"
      columns={["Nickname", "Papel", "Cidade", "Criada em", "Verificada", "Situação", "Ações"]}
      rows={users.map((u) => {
        const offer = offerFor(u, selfId, blockOn);
        return {
          key: u.id,
          cells: [
            u.id === selfId ? `@${u.nickname} (você)` : `@${u.nickname}`,
            <span className="nowrap">{roleLabel(u.role)}</span>,
            u.city,
            dateTime(u.createdAt),
            u.verified ? "Sim" : "Não",
            u.blocked ? <Status code="blocked">Bloqueada</Status> : "—",
            <div className="row-actions" data-actions={offer.actions.join(" ")}>
              {offer.actions.map((action) => (
                <button key={action} type="button" className="btn btn--small" disabled={busy} data-action={action} aria-label={`${USER_ACTION_LABEL[action]}: @${u.nickname}`} onClick={() => onAction(u, action)}>
                  {USER_ACTION_LABEL[action]}
                </button>
              ))}
              {offer.notes.map((note) => (
                <span key={note} className="muted">
                  {note}
                </span>
              ))}
              {offer.actions.length === 0 && offer.notes.length === 0 && "—"}
            </div>,
          ],
          detail: detailOf(u),
        };
      })}
    />
  );
}

/** The second step of an action about one account: who, what happens, and (for a block) the message the person will read. */
export function UserConfirmation({
  action,
  nickname,
  message = "",
  onMessage = () => {},
  busy = false,
  error = "",
  fieldError = "",
  onConfirm,
  onCancel,
}: {
  action: UserAction;
  nickname: string;
  message?: string;
  onMessage?: (text: string) => void;
  busy?: boolean;
  error?: string;
  fieldError?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const text = confirmationOf(action, nickname);
  return (
    <Confirmation kind={action} title={text.title} understood={text.understood} confirm={USER_ACTION_LABEL[action]} busy={busy} error={error} onConfirm={onConfirm} onCancel={onCancel}>
      <p>{text.effect}</p>
      {action === "block" && (
        <Field label={BLOCK_MESSAGE_LABEL} hint={BLOCK_MESSAGE_HINT} error={fieldError}>
          <textarea value={message} disabled={busy} onChange={(e) => onMessage(e.target.value)} rows={4} />
        </Field>
      )}
    </Confirmation>
  );
}
