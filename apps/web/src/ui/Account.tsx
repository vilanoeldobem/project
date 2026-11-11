import { useEffect, useState, type FormEvent } from "react";

import { useVila } from "../game/store";
import { AuthError, authRequest, takeLoginFragment, useAuth } from "../lib/auth";
import { Panel } from "./Panel";

export function AuthBootstrap() {
  useEffect(() => {
    void useAuth.getState().refresh();
    if (useAuth.getState().token !== null) useVila.getState().open({ kind: "account" });
    const onHashChange = () => {
      const token = takeLoginFragment();
      if (token !== null) {
        useAuth.setState({ token });
        useVila.getState().open({ kind: "account" });
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return null;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof AuthError)) return "Não foi possível conectar. Confira sua internet e tente novamente.";
  switch (error.message) {
    case "invalid_link": return "Esse link expirou, já foi usado ou foi aberto em outro navegador. Peça um novo link aqui.";
    case "nickname_unavailable": return "Esse nickname já está em uso. Crie um novo pedido de cadastro com outro nickname.";
    case "rate_limited": return "Muitos pedidos em pouco tempo. Aguarde alguns minutos antes de tentar de novo.";
    case "invalid_fields": return "Confira os campos. Use de 3 a 24 letras, números ou sublinhado no nickname.";
    case "auth_unavailable": return "O acesso por e-mail ainda não está disponível. Você pode continuar como visitante.";
    default: return "Não foi possível concluir. Tente novamente em instantes.";
  }
}

export function AccountPanel() {
  const { user, ready, failed, available, token, refresh, clearToken } = useAuth();
  const close = useVila((s) => s.close);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    void perform(async () => {
      await authRequest("request", { mode, ...values });
      setSent(true);
    });
  }

  return (
    <Panel title={user && !token ? "Minha conta" : "Sua conta na Vila"} kicker="A Vila continua livre para visitar">
      {message && <p className="account-message" role="alert">{message}</p>}
      {!ready ? <p role="status">Conferindo seu acesso…</p> : failed ? <>
        <p role="alert">Não foi possível conferir sua sessão.</p>
        <button className="btn" onClick={() => void refresh()}>Tentar novamente</button>
      </> : !available ? <p>O acesso por e-mail ainda está em preparação. Explore e jogue como visitante enquanto isso.</p>
        : token !== null ? <>
          <p>Confirme para acessar sua conta. O link vale por 15 minutos e precisa ser aberto no mesmo navegador em que foi solicitado.</p>
          <button className="btn btn--primary" disabled={busy} onClick={() => void perform(async () => {
            await authRequest("confirm", { token });
            clearToken();
            await refresh();
          })}>{busy ? "Confirmando…" : "Confirmar acesso"}</button>
          <button className="btn" disabled={busy} onClick={() => { clearToken(); setMessage(""); }}>Pedir outro link</button>
        </> : user ? <>
          <p>Olá, <strong>{user.nickname}</strong>! Seu e-mail está verificado.</p>
          <dl className="account-details">
            <dt>Nome</dt><dd>{user.name}</dd>
            <dt>Nickname</dt><dd>{user.nickname}</dd>
            <dt>Cidade</dt><dd>{user.city}</dd>
            <dt>E-mail</dt><dd>{user.email}</dd>
          </dl>
          <p className="note">Só seu nickname poderá ser público. Nome, cidade e e-mail ficam na sua conta.</p>
          <p className="note">Por enquanto, missões e XP continuam salvos apenas neste navegador.</p>
          <button className="btn" disabled={busy} onClick={() => void perform(async () => {
            await authRequest("logout", {});
            useAuth.getState().signedOut();
            setSent(false);
          })}>{busy ? "Saindo…" : "Sair da conta"}</button>
        </> : sent ? <div role="status">
          <p>Se o pedido puder ser concluído, você receberá um link no e-mail informado. Ele vale por 15 minutos.</p>
          <p>Abra o link neste mesmo navegador e toque em “Confirmar acesso”.</p>
          <p className="note">Modo de teste local: nenhum e-mail real é enviado.</p>
          <button className="btn" onClick={() => { setSent(false); setMessage(""); }}>Voltar</button>
        </div> : <>
          <div className="account-switch" aria-label="Tipo de acesso">
            <button className="btn" aria-pressed={mode === "login"} disabled={busy} onClick={() => { setMode("login"); setMessage(""); }}>Já tenho conta</button>
            <button className="btn" aria-pressed={mode === "signup"} disabled={busy} onClick={() => { setMode("signup"); setMessage(""); }}>Criar conta</button>
          </div>
          <p>Entre com um link enviado ao seu e-mail. Não precisa de senha.</p>
          <form className="account-form" onSubmit={submit}>
            {mode === "signup" && <>
              <label>Nome<input name="name" autoComplete="name" required minLength={2} maxLength={80} disabled={busy} /></label>
              <label>Nickname<input name="nickname" autoComplete="nickname" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]{3,24}" aria-describedby="nickname-help" disabled={busy} /></label>
              <p id="nickname-help" className="note">Seu nome público: 3 a 24 letras, números ou sublinhado.</p>
              <label>Cidade<input name="city" autoComplete="address-level2" required minLength={2} maxLength={80} disabled={busy} /></label>
            </>}
            <label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} /></label>
            {mode === "signup" && <p className="note">Nome, cidade e e-mail ficam privados. A conta só será criada após você confirmar o e-mail.</p>}
            <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? "Solicitando…" : "Receber link de acesso"}</button>
          </form>
          <p className="note">Modo de teste local: nenhum e-mail real é enviado.</p>
        </>}
      <div className="account-footer"><button className="btn" onClick={close}>Continuar na Vila</button></div>
    </Panel>
  );
}
