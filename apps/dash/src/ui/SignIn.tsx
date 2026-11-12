/**
 * Sign-in (IMPL-0015): the game's magic link (OQ-03), asked from the dashboard so the link opens the dashboard.
 * No account is created here: accounts are created in the game and the admin role is granted by hand in D1
 * (DEC-037). The answer is the same for any e-mail (no account enumeration).
 */
import { useState } from "react";

import { errorText } from "@vila/shared/accounts/errors";
import type { Me } from "@vila/shared/accounts/contract";

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
      <p className="muted">Aqui não se cria conta: a conta é criada no jogo e o papel de administrador é concedido pela equipe técnica.</p>
    </Frame>
  );
}

/** Signed in without the admin role: this message, a way out, and nothing else (no menu, no data). */
export function NotAdmin({ user, onSignOut }: { user: Me; onSignOut: () => void }) {
  return (
    <Frame title="Apenas administradores">
      <p className="lead">Esta área é só para a administração da Vila.</p>
      <p className="muted">Você entrou como @{user.nickname}, que não tem o papel de administrador.</p>
      <button className="btn" onClick={onSignOut}>
        Sair
      </button>
    </Frame>
  );
}

export function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <Frame title="API indisponível">
      <p className="lead" role="alert">
        Não foi possível falar com a API da Vila. Sem ela o painel não tem o que mostrar.
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
