import { useEffect, useState, type FormEvent } from "react";
import { LOTS } from "@vila/shared/game/world";
import { useVila } from "../game/store";
import { useAuth } from "../lib/auth";
import type { LotInfo } from "../lib/api";
import { applicationError, applicationRequest, type ApplicationFields, type ApplicationList, type NgoApplication } from "../lib/ngo-applications";
import { Panel, Status } from "./Panel";

const labels: Record<NgoApplication["status"], string> = {
  submitted: "Candidatura enviada", under_review: "Em análise", changes_requested: "Ajustes solicitados",
  rejected: "Não aprovada", published: "Casa publicada",
};
const latestOpening = new Date(); latestOpening.setUTCFullYear(latestOpening.getUTCFullYear() - 1);
const steps = ["Dados da organização", "Comprovações", "Apresentação", "Revisão"];
const localNote = "Proposta de fluxo em teste local. Documentos e responsáveis pela análise ainda serão definidos pela equipe. Não envie documentos por aqui.";

export function NgoApplications({ lotId, review = false, lots, onPublished }: {
  lotId?: string; review?: boolean; lots: Record<string, LotInfo>; onPublished: () => void;
}) {
  const { user, available, ready } = useAuth();
  const open = useVila((state) => state.open);
  if (!ready) return <Panel title="Candidaturas"><p role="status">Conferindo seu acesso…</p></Panel>;
  if (!available || !user) return <Panel title="Candidaturas" kicker="Teste local">
    <p>Entre na sua conta para acompanhar ou enviar uma candidatura. A Vila continua aberta para visitar e jogar.</p>
    <button className="btn" onClick={() => open({ kind: "account" })}>Acessar minha conta</button>
  </Panel>;
  return <ApplicationWorkspace key={`${user.id}:${review}:${lotId ?? "list"}`} userId={user.id} lotId={lotId} review={review} lots={lots} onPublished={onPublished} />;
}

function ApplicationWorkspace({ userId, lotId, review, lots, onPublished }: {
  userId: string; lotId?: string; review: boolean; lots: Record<string, LotInfo>; onPublished: () => void;
}) {
  const open = useVila((state) => state.open);
  const [data, setData] = useState<ApplicationList | null>(null);
  const [selected, setSelected] = useState<NgoApplication | null>(null);
  const [editing, setEditing] = useState(Boolean(lotId));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const path = review ? "/admin/ngo-applications" : "/ngo-applications";
  async function reload() {
    setBusy(true); setMessage("");
    try { setData(await applicationRequest<ApplicationList>(path, userId)); }
    catch (error) { setMessage(applicationError(error)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void reload(); }, [userId, review]);
  async function changed() { setEditing(false); setSelected(null); await reload(); onPublished(); }
  return <Panel title={review ? "Revisar candidaturas" : "Minhas candidaturas"} kicker="Teste local · proposta" wide>
    <p className="note">{localNote}</p>
    {message && <p role="alert" className="account-message">{message}</p>}
    {busy && <p role="status">Atualizando candidaturas…</p>}
    {!editing && !selected && <>
      <div className="account-switch">
        <button className="btn" disabled={busy} onClick={() => void reload()}>Atualizar lista</button>
        {!review && <button className="btn btn--primary" disabled={busy || !data} onClick={() => setEditing(true)}>Nova candidatura</button>}
        {!review && data?.canReview && <button className="btn" onClick={() => open({ kind: "ngo-applications", review: true })}>Revisar candidaturas</button>}
        {review && <button className="btn" onClick={() => open({ kind: "ngo-applications" })}>Minhas candidaturas</button>}
      </div>
      {data?.applications.length === 0 && <p>Nenhuma candidatura por aqui ainda.</p>}
      <ul className="application-list">{data?.applications.map((application) => <li key={application.id}>
        <div><strong>{application.name}</strong><br /><Status>{labels[application.status]}</Status></div>
        <button className="btn btn--small" onClick={() => setSelected(application)}>Ver candidatura</button>
      </li>)}</ul>
    </>}
    {editing ? <ApplicationForm key={selected?.id ?? "new"} application={selected} lotId={lotId} lots={lots} userId={userId} onSaved={changed} onBack={() => setEditing(false)} />
      : selected && <>
        <ApplicationDetails application={selected} />
        {review && data?.canReview ? <ApplicationReview application={selected} userId={userId} onSaved={changed} />
          : !review && selected.status === "changes_requested" && <button className="btn btn--primary" onClick={() => setEditing(true)}>Ajustar e reenviar</button>}
        <button className="btn" onClick={() => setSelected(null)}>Voltar à lista</button>
      </>}
  </Panel>;
}

function ApplicationDetails({ application }: { application: NgoApplication }) {
  return <section className="application-detail">
    <h3>{application.name}</h3><p><Status>{labels[application.status]}</Status></p>
    <dl className="account-details"><dt>CNPJ</dt><dd>{application.cnpj}</dd><dt>Abertura</dt><dd>{application.openedOn}</dd>
      <dt>Terreno solicitado</dt><dd>{Number(application.lotId.split("-")[1])}</dd></dl>
    <p className="application-summary">{application.summary}</p>
    {application.feedback && <div className="account-message"><strong>Retorno da análise</strong><p className="application-summary">{application.feedback}</p></div>}
    <p className="note">Enviar a candidatura não reserva o terreno nem publica a casa. A publicação depende de aprovação por um responsável autorizado.</p>
  </section>;
}

function ApplicationForm({ application, lotId, lots, userId, onSaved, onBack }: {
  application: NgoApplication | null; lotId?: string; lots: Record<string, LotInfo>; userId: string; onSaved: () => Promise<void>; onBack: () => void;
}) {
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<ApplicationFields>(() => ({ name: application?.name ?? "", cnpj: application?.cnpj ?? "", openedOn: application?.openedOn ?? "",
    summary: application?.summary ?? "", lotId: application?.lotId ?? lotId ?? "" }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function field(key: keyof ApplicationFields, value: string) { setFields((old) => ({ ...old, [key]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) { setStep(step + 1); return; }
    setBusy(true); setMessage("");
    try {
      await applicationRequest(application ? `/ngo-applications/${application.id}` : "/ngo-applications", userId, application ? "PUT" : "POST",
        { ...fields, cnpj: fields.cnpj.replace(/\D/g, ""), ...(application ? { expectedRevision: application.revision } : {}) });
      await onSaved();
    } catch (error) { setMessage(applicationError(error)); }
    finally { setBusy(false); }
  }
  return <form className="account-form" onSubmit={(event) => void submit(event)}>
    <ol className="application-steps" aria-label="Etapas da candidatura">{steps.map((title, index) => <li key={title} aria-current={index === step ? "step" : undefined}>{index + 1}. {title}</li>)}</ol>
    <h3>{steps[step]}</h3>
    {message && <p role="alert" className="account-message">{message}</p>}
    {step === 0 && <>
      <label>Nome da organização<input value={fields.name} onChange={(e) => field("name", e.target.value)} required minLength={2} maxLength={120} disabled={busy} /></label>
      <label>CNPJ<input value={fields.cnpj} onChange={(e) => field("cnpj", e.target.value)} inputMode="numeric" placeholder="00.000.000/0000-00" required minLength={14} maxLength={18} disabled={busy} /></label>
      <label>Data de abertura<input type="date" value={fields.openedOn} onChange={(e) => field("openedOn", e.target.value)} required max={latestOpening.toISOString().slice(0, 10)} disabled={busy} /></label>
      <p className="note">A organização precisa ter pelo menos um ano de existência.</p>
      <label>Terreno solicitado<select value={fields.lotId} onChange={(e) => field("lotId", e.target.value)} required disabled={busy}>
        <option value="">Escolha um terreno</option>
        {LOTS.filter((lot) => lots[lot.id]?.state === "available" || lot.id === fields.lotId).map((lot) => <option key={lot.id} value={lot.id}>Terreno {lot.slot}</option>)}
      </select></label>
    </>}
    {step === 1 && <>
      <p>Os critérios de participação são CNPJ ativo, pelo menos um ano de existência e um meio confiável de conferir os valores destinados à organização.</p>
      <p className="account-message">A lista de documentos e o canal seguro de envio ainda estão pendentes. Esta versão não coleta arquivos nem comprova esses critérios automaticamente.</p>
    </>}
    {step === 2 && <label>Apresentação da organização<textarea value={fields.summary} onChange={(e) => field("summary", e.target.value)} required minLength={10} maxLength={2000} rows={5} disabled={busy} />
      <span className="note">Explique a causa e o trabalho realizado. Evite dados pessoais e informações sensíveis.</span></label>}
    {step === 3 && <>
      <dl className="account-details"><dt>Organização</dt><dd>{fields.name}</dd><dt>CNPJ</dt><dd>{fields.cnpj}</dd><dt>Abertura</dt><dd>{fields.openedOn}</dd><dt>Terreno</dt><dd>{Number(fields.lotId.split("-")[1])}</dd></dl>
      <p className="application-summary">{fields.summary}</p>
      <p>O envio mantém sua candidatura privada para acompanhamento e análise. Não reserva o terreno nem publica a casa.</p>
    </>}
    <div className="account-switch">
      <button className="btn" type="button" disabled={busy} onClick={() => step ? setStep(step - 1) : onBack()}>{step ? "Etapa anterior" : "Voltar"}</button>
      <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? "Enviando…" : step < 3 ? "Próxima etapa" : application ? "Reenviar candidatura" : "Enviar candidatura"}</button>
    </div>
  </form>;
}

function ApplicationReview({ application, userId, onSaved }: { application: NgoApplication; userId: string; onSaved: () => Promise<void> }) {
  const [feedback, setFeedback] = useState("");
  const [eligibility, setEligibility] = useState({ activeCnpj: false, minimumAge: false, fundsVerification: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function review(action: string) {
    if ((action === "request_changes" || action === "reject") && feedback.trim().length < 2) { setMessage("Escreva o motivo para orientar a organização."); return; }
    setBusy(true); setMessage("");
    try {
      await applicationRequest(`/admin/ngo-applications/${application.id}/review`, userId, "POST", { expectedRevision: application.revision, action, feedback: feedback.trim(), ...(action === "approve" ? { eligibility } : {}) });
      await onSaved();
    } catch (error) { setMessage(applicationError(error)); }
    finally { setBusy(false); }
  }
  return <section className="account-form" aria-label="Análise da candidatura">
    {message && <p role="alert" className="account-message">{message}</p>}
    {application.status === "submitted" && <button className="btn btn--primary" disabled={busy} onClick={() => void review("start_review")}>Iniciar análise</button>}
    {application.status === "under_review" && <>
      <label>Retorno para a organização<textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} maxLength={2000} disabled={busy} /></label>
      <fieldset className="application-checks"><legend>Conferência manual dos critérios (DEC-015)</legend>
        <p className="note">Confirme somente após verificar por um meio confiável. O sistema não consulta registros nem valida documentos nesta versão.</p>
        {([ ["activeCnpj", "Conferi que o CNPJ está ativo"], ["minimumAge", "Conferi pelo menos 1 ano de existência"], ["fundsVerification", "Conferi um meio confiável de verificar os valores destinados à organização"] ] as const).map(([key, title]) => <label key={key}><input type="checkbox" checked={eligibility[key]} onChange={(e) => setEligibility((old) => ({ ...old, [key]: e.target.checked }))} disabled={busy} />{title}</label>)}
      </fieldset>
      <div className="account-switch">
        <button className="btn" disabled={busy} onClick={() => void review("request_changes")}>Solicitar ajustes</button>
        <button className="btn" disabled={busy} onClick={() => void review("reject")}>Não aprovar</button>
        <button className="btn btn--primary" disabled={busy || !Object.values(eligibility).every(Boolean)} onClick={() => void review("approve")}>Aprovar e publicar casa</button>
      </div>
    </>}
  </section>;
}
