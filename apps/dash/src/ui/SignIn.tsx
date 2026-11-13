/**
 * Sign-in (IMPL-0015): the game's magic link (OQ-03), asked from the dashboard so the link opens the dashboard.
 * No account is created here: accounts are created in the game, and the administrator role is granted by another
 * administrator in the accounts section (IMPL-0021; the first one by the documented database command, DEC-037).
 * The answer is the same for any e-mail (no account enumeration).
 *
 * Also the full-page states of a session that does not open the dashboard: not an administrator, or blocked.
 */
import { useState } from "react";

import { errorText } from "@vila/shared/accounts/errors";
import type { Me } from "@vila/shared/accounts/contract";

import { dateTime } from "../lib/format";
import { api } from "../lib/services";
import { Field } from "./common";

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="gate">
      <div className="gate__card">
        <p className="kicker">Vila Noel do Bem · Painel administrativo</p>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function SignIn({ notice }: { notice?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ email: string; devLink?: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.requestLink(email);
      setSent({ email: email.trim().toLowerCase(), devLink: r.devLink });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  if (sent)
    return (
      <Frame title="Confira seu e-mail">
        <div role="status">
          <p className="lead">
            Se <strong>{sent.email}</strong> for de uma conta da Vila, enviamos um link de acesso. Ele vale por 15 minutos e só funciona uma vez.
          </p>
          <p className="muted">Não chegou? Veja a caixa de spam ou peça outro link daqui a pouco.</p>
        </div>
        {sent.devLink && (
          <p>
            <a className="btn btn--small" href={sent.devLink}>
              Abrir link (só em desenvolvimento)
            </a>
          </p>
        )}
        <button className="btn" onClick={() => setSent(null)}>
          Voltar
        </button>
      </Frame>
    );
  return (
    <Frame title="Entrar">
      <p className="muted">Área restrita à administração da Vila. Você recebe um link de acesso por e-mail; não há senha.</p>
      {notice && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}
      <form className="form" onSubmit={submit} noValidate>
        <Field label="E-mail da sua conta">
          <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
        </Field>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn--primary" disabled={busy || !email.includes("@")}>
          {busy ? "Enviando…" : "Enviar link de acesso"}
        </button>
      </form>
      <p className="muted">Aqui não se cria conta: a conta é criada no jogo e o papel de administrador é concedido por quem já administra a Vila.</p>
    </Frame>
  );
}

/**
 * Signed in without the admin role: this message, a way out, and nothing else (no menu, no data). `demoted` says
 * the same account was an administrator a moment ago (the role was taken while the dashboard was open).
 */
export function NotAdmin({ user, demoted = false, onSignOut }: { user: Me; demoted?: boolean; onSignOut: () => void }) {
  return (
    <Frame title="Apenas administradores">
      <p className="lead">Esta área é só para a administração da Vila.</p>
      {demoted ? (
        <p role="alert" data-state="demoted">
          O papel de administrador de @{user.nickname} foi retirado enquanto o painel estava aberto. Se foi um engano, fale com outra pessoa da administração.
        </p>
      ) : (
        <p className="muted">Você entrou como @{user.nickname}, que não tem o papel de administrador.</p>
      )}
      <button className="btn" onClick={onSignOut}>
        Sair
      </button>
    </Frame>
  );
}

/**
 * A blocked account (IMPL-0021, PROPOSTA): that it is blocked, the message the administration wrote to the
 * person, as written, and a way out. Nothing else: no menu, no data, whatever the role. The API refuses every
 * other request of this session (`403 session_blocked`).
 */
export function Blocked({ user, onSignOut }: { user: Me; onSignOut: () => void }) {
  const block = user.blocked;
  return (
    <Frame title="Conta bloqueada">
      <p className="lead" data-state="blocked">
        A conta @{user.nickname} foi bloqueada pela administração da Vila e não abre este painel.
      </p>
      {block?.message ? (
        <>
          <p>
            <strong>Mensagem da administração</strong>
            {block.at ? ` (${dateTime(block.at)})` : ""}:
          </p>
          <p className="message" data-field="block-message">
            {block.message}
          </p>
        </>
      ) : (
        <p className="muted">Não foi possível ler a mensagem do bloqueio agora. Saia e entre de novo para ver.</p>
      )}
      <p className="muted">Você ainda pode sair e, pelo jogo, excluir a sua conta.</p>
      <button className="btn" onClick={onSignOut}>
        Sair
      </button>
    </Frame>
  );
}

/** `reason`: the API answered but refused for now (rate limit, database down); without it, no answer came at all. */
export function Unavailable({ reason, onRetry }: { reason?: string; onRetry: () => void }) {
  return (
    <Frame title={reason ? "Não foi possível entrar agora" : "API indisponível"}>
      <p className="lead" role="alert">
        {reason ?? "Não foi possível falar com a API da Vila. Sem ela o painel não tem o que mostrar."}
      </p>
      <button className="btn" onClick={onRetry}>
        Tentar de novo
      </button>
    </Frame>
  );
}

export function Starting() {
  return (
    <Frame title="Carregando…">
      <p className="muted" role="status">
        Conferindo a sessão.
      </p>
    </Frame>
  );
}
