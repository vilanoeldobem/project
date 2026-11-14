/**
 * Account (P13; OQ-02 visitor free, account optional; OQ-03 magic link). Exactly four fields (DEC-038);
 * only the nickname is public. Copy is pt-BR; layout and wording beyond the wireframe are PROPOSTA.
 *
 * A blocked account (IMPL-0021, PROPOSTA; policy pending, OQ-11) sees that it is blocked, the message the
 * administration wrote and its date, and only what its restricted session still does: sign out and delete the
 * account.
 */
import { useState, type ReactNode } from "react";

import { type Me, ROLE_LABEL } from "@vila/shared/accounts/contract";
import { errorText } from "@vila/shared/accounts/errors";
import { validateRegistration, type Registration } from "@vila/shared/accounts/validate";

import { useVila, type Panel as PanelState } from "../game/store";
import { api, ApiError, deleteAccount, signOut, useAccount } from "../lib/account";
import { SERVICES } from "../lib/services";
import { Confirm } from "./Confirm";
import { Panel } from "./Panel";
import { AvatarPortrait } from "./AvatarPortrait";
import { SheetSection, SheetTabs } from "./sheet";

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className={`field${error ? " field--error" : ""}`}>
      <span className="field__label">{label}</span>
      {children}
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/** The longest nickname the HUD chip shows whole (the API accepts 20 characters). */
export const CHIP_NAME_MAX = 12;

/** The nickname as the chip shows it: a long one is cut here, so the chip knows when its label is not the whole name. */
export function chipName(nickname: string): { shown: string; cut: boolean } {
  return nickname.length > CHIP_NAME_MAX ? { shown: `${nickname.slice(0, CHIP_NAME_MAX - 1)}…`, cut: true } : { shown: nickname, cut: false };
}

/**
 * HUD chip: "Entrar" or "@nickname" (only when accounts are on). Only the nickname is ever cut: the state of a
 * blocked account is a span of its own, and a chip with a cut nickname offers the full text as its tooltip at
 * every width (`chip--cut`, `styles.css`).
 */
export function AccountChip() {
  const { enabled, user } = useAccount();
  const open = useVila((s) => s.open);
  if (!enabled) return null;
  const full = user ? `Sua conta: ${user.nickname}${user.blocked ? " (bloqueada)" : ""}` : "Entrar ou criar conta";
  const name = user ? chipName(user.nickname) : null;
  return (
    <button className={`btn btn--chip${name?.cut ? " chip--cut" : ""}`} onClick={() => open({ kind: "account" })} aria-label={full} data-tip={full}>
      <span className="chip__icon" aria-hidden="true">
        👤
      </span>
      <span className="chip__label">
        {name ? <span className="chip__name">@{name.shown}</span> : "Entrar"}
        {user?.blocked && <span className="chip__state"> (bloqueada)</span>}
      </span>
    </button>
  );
}

export function Account({ then }: { then?: PanelState }) {
  const user = useAccount((s) => s.user);
  if (!user) return <SignedOut />;
  return user.blocked ? <BlockedAccount user={user} /> : <SignedIn then={then} />;
}

/** "12 de novembro de 2026 às 10:00", São Paulo time; empty when the API sent no date. */
export function blockDate(at: string): string {
  const date = new Date(at);
  return at && !Number.isNaN(date.getTime()) ? date.toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "";
}

/**
 * The whole account panel of a blocked account: the message from the administration as it was written, its
 * date, and the two things the restricted session still does. Nothing else is offered, because the API refuses
 * everything else (`403 session_blocked`). Exported for the render test.
 */
export function BlockedAccount({ user }: { user: Me }) {
  const close = useVila((s) => s.close);
  /** When the confirmation of the deletion appeared (null = not asked). */
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const block = user.blocked ?? { message: "", at: "" };
  const when = blockDate(block.at);
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteAccount();
      useVila.getState().notify("Sua conta foi excluída. Seu progresso continua só neste navegador.");
      close();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel board="P13" sheet icon="👤" title="Conta bloqueada" subtitle={`@${user.nickname}`} contentKey={askedAt === null ? "blocked" : "confirm"}>
      <p className="lead" data-state="blocked">
        A conta @{user.nickname} está bloqueada pela administração da Vila.
      </p>
      <div className="callout">
        <strong>Mensagem da administração{when ? ` · ${when}` : ""}</strong>
        <p data-field="block-message">{block.message || "A administração não deixou uma mensagem."}</p>
      </div>
      <p>
        Você continua podendo explorar a Vila e jogar como visitante: o progresso fica só neste navegador. Enquanto a conta estiver bloqueada, ela não salva
        progresso nem envia ou altera candidatura de ONG.
      </p>
      <p className="note">O que você ainda pode fazer com esta conta: sair ou excluí-la.</p>
      {askedAt === null ? (
        <div className="actions">
          <button className="btn" onClick={() => void signOut().then(close)}>
            Sair
          </button>
          <button className="btn" onClick={() => setAskedAt(Date.now())}>
            {user.deletionPending ? "Concluir a exclusão da conta" : "Excluir minha conta"}
          </button>
        </div>
      ) : (
        <Confirm
          title={`Excluir a conta @${user.nickname}?`}
          confirmLabel="Confirmar exclusão"
          busyLabel="Excluindo…"
          busy={busy}
          shownAt={askedAt}
          onConfirm={() => void remove()}
          onCancel={() => setAskedAt(null)}
        >
          <p>Excluir apaga seu nome, nickname, cidade, e-mail, o progresso salvo na conta e o registro deste bloqueio. Não dá para desfazer.</p>
        </Confirm>
      )}
      {error && (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}

function SignedOut() {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [sent, setSent] = useState<{ email: string; devLink?: string } | null>(null);
  if (sent) {
    return (
      <Panel board="P13" sheet icon="👤" title="Confira seu e-mail" subtitle="Cadastro rápido">
        <p className="lead">
          Enviamos um link de acesso para <strong>{sent.email}</strong>. Ele vale por 15 minutos e só funciona uma vez.
        </p>
        <p className="note">Não chegou? Veja a caixa de spam ou peça outro link daqui a pouco.</p>
        <div className="sheet-card">
          <h3>Cadastro recebido</h3>
          <p className="note">Fluxo de acesso a definir.</p>
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
      </Panel>
    );
  }
  return (
    <Panel board="P13" sheet icon="👤" title={mode === "register" ? "Criar conta na Vila" : "Entrar na Vila"} subtitle="Cadastro rápido">
      <p className="note">Explorar e jogar não precisa de conta. Com conta, seu progresso fica salvo e você pode cadastrar uma ONG.</p>
      <SheetTabs
        label="Entrar ou criar conta"
        tabs={["Criar conta", "Já tenho conta"] as const}
        value={mode === "register" ? "Criar conta" : "Já tenho conta"}
        onChange={(tab) => setMode(tab === "Criar conta" ? "register" : "login")}
      />
      {mode === "register" ? <RegisterForm onSent={setSent} /> : <LoginForm onSent={setSent} />}
    </Panel>
  );
}

function RegisterForm({ onSent }: { onSent: (s: { email: string; devLink?: string }) => void }) {
  const look = useVila((s) => s.look);
  const appearance = useVila((s) => s.appearance);
  const [form, setForm] = useState<Registration>({ name: "", nickname: "", city: "", email: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Registration, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof Registration) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { value, errors: found } = validateRegistration(form);
    setErrors(found);
    setError("");
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const r = await api.register(value);
      onSent({ email: value.email, devLink: r.devLink });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields as typeof errors);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="account-grid">
        <SheetSection n={1} icon="📝" title="Seus dados">
          <Field label="Nome *" error={errors.name}>
            <input value={form.name} onChange={set("name")} autoComplete="name" maxLength={80} required />
          </Field>
          <Field label="Nickname *" error={errors.nickname} hint="É o único dado que aparece para as outras pessoas na Vila.">
            <input value={form.nickname} onChange={set("nickname")} autoComplete="nickname" maxLength={20} required autoCapitalize="none" />
          </Field>
          <Field label="Cidade *" error={errors.city}>
            <input value={form.city} onChange={set("city")} autoComplete="address-level2" maxLength={60} required />
          </Field>
          <Field label="E-mail *" error={errors.email} hint="Usamos só para enviar o link de acesso. Sem senha.">
            <input type="email" inputMode="email" value={form.email} onChange={set("email")} autoComplete="email" maxLength={254} required />
          </Field>
          {error && (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn--primary" disabled={busy}>
            {busy ? "Enviando…" : "Criar conta"}
          </button>
        </SheetSection>
        <SheetSection n={3} icon="👤" title="Prévia pública">
          <div className="preview" aria-label="Prévia pública">
            <AvatarPortrait look={look} appearance={appearance} size={8} label="Prévia do personagem" />
            <strong>@{form.nickname || "nickname"}</strong>
            <span className="note">Seu nickname aparece na Vila.</span>
          </div>
        </SheetSection>
      </div>
    </form>
  );
}

function LoginForm({ onSent }: { onSent: (s: { email: string; devLink?: string }) => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.requestLink(email);
      onSent({ email: email.trim().toLowerCase(), devLink: r.devLink });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="E-mail da sua conta">
        <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </Field>
      {error && <p className="form__error" role="alert">{error}</p>}
      <button className="btn btn--primary" disabled={busy || !email.includes("@")}>
        {busy ? "Enviando…" : "Enviar link de acesso"}
      </button>
    </form>
  );
}

function SignedIn({ then }: { then?: PanelState }) {
  const user = useAccount((s) => s.user)!;
  const open = useVila((s) => s.open);
  const close = useVila((s) => s.close);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteAccount();
      useVila.getState().notify("Sua conta foi excluída. Seu progresso continua só neste navegador.");
      close();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel board="P13" sheet icon="👤" title="Conta" subtitle={`@${user.nickname}`}>
      {user.deletionPending && (
        <div className="callout" role="status" data-state="deletion-pending">
          <strong>Exclusão da conta pendente</strong>
          <p>A remoção dos seus arquivos ainda não terminou. Sua sessão continua disponível para tentar concluir. Candidatura e arquivos ficam bloqueados; a exclusão não pode ser cancelada porque alguns dados já podem ter sido apagados.</p>
          <button className="btn btn--primary" disabled={busy} onClick={() => void remove()}>
            {busy ? "Concluindo exclusão…" : "Tentar concluir exclusão"}
          </button>
          {error && <p className="form__error" role="alert">Não foi possível concluir agora. Tente novamente mais tarde.</p>}
        </div>
      )}
      {then && !user.deletionPending && (
        <p>
          <button className="btn btn--primary" onClick={() => open(then)}>
            Continuar
          </button>
        </p>
      )}
      <dl className="facts">
        <dt>Nome</dt>
        <dd>{user.name}</dd>
        <dt>Cidade</dt>
        <dd>{user.city}</dd>
        <dt>E-mail</dt>
        <dd>{user.email}</dd>
        <dt>Papel</dt>
        <dd>{ROLE_LABEL[user.role] ?? ROLE_LABEL.player}</dd>
      </dl>
      <p className="note">Só o seu nickname aparece para outras pessoas. Seu progresso de missões fica salvo nesta conta.</p>
      {!user.deletionPending && <EditProfile />}
      <div className="actions">
        <button className="btn" onClick={() => open({ kind: "avatar" })}>
          Abrir aparência
        </button>
        <button className="btn" onClick={() => open({ kind: "badges" })}>
          Suas badges
        </button>
        {user.role === "admin" && (
          // The review of NGO applications lives in the backoffice dashboard (IMPL-0015): a plain link, new tab.
          <a className="btn" href={SERVICES.dash} target="_blank" rel="noopener">
            Abrir painel administrativo
          </a>
        )}
        <button className="btn" onClick={() => open({ kind: "ngo" })}>
          Minha candidatura de ONG
        </button>
        <button className="btn" onClick={() => void signOut().then(close)}>
          Sair
        </button>
      </div>
      {!user.deletionPending && <details className="danger">
        <summary>Excluir minha conta</summary>
        <p>Apaga seu nome, nickname, cidade, e-mail e o progresso salvo na conta. Não dá para desfazer.</p>
        {!confirm ? (
          <button className="btn" onClick={() => setConfirm(true)}>
            Quero excluir
          </button>
        ) : (
          <button className="btn btn--primary" disabled={busy} onClick={() => void remove()}>
            {busy ? "Excluindo…" : "Confirmar exclusão"}
          </button>
        )}
        {error && <p className="form__error">{error}</p>}
      </details>}
    </Panel>
  );
}

/** Corrects name, nickname or city (the e-mail is the sign-in key and stays). */
function EditProfile() {
  const user = useAccount((s) => s.user)!;
  const setUser = useAccount((s) => s.setUser);
  const [form, setForm] = useState({ name: user.name, nickname: user.nickname, city: user.city });
  const [errors, setErrors] = useState<Partial<Record<keyof Registration, string>>>({});
  const [msg, setMsg] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: found } = validateRegistration({ ...form, email: user.email });
    setErrors(found);
    setMsg("");
    if (Object.keys(found).length) return;
    try {
      setUser((await api.updateMe(form)).user);
      setMsg("Dados atualizados.");
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields as typeof errors);
      setMsg(errorText(err));
    }
  };
  return (
    <details>
      <summary>Editar meus dados</summary>
      <form className="form" onSubmit={save} noValidate>
        <Field label="Nome" error={errors.name}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
        </Field>
        <Field label="Nickname" error={errors.nickname}>
          <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} maxLength={20} autoCapitalize="none" />
        </Field>
        <Field label="Cidade" error={errors.city}>
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={60} />
        </Field>
        {msg && <p className="note" role="status">{msg}</p>}
        <button className="btn">Salvar</button>
      </form>
    </details>
  );
}
