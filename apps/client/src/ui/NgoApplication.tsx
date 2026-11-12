/**
 * NGO application (P12; DEC-015 criteria, DEC-037 admin approval, DEC-028 house content). Four steps from the
 * wireframe: "Dados da organização", "Documentos e comprovações", "Apresentação e projetos", "Revisão e
 * envio". The field list is PROPOSTA (G08/PEN-019); documents are declared in the form. With uploads on in the API
 * (IMPL-0017, PROPOSTA) a sent application also takes a logo and optional documents: see `ApplicationFiles`.
 * An NGO the administration withdrew from the village (IMPL-0020, PROPOSTA) is shown as such, with the message the
 * administration wrote to the organisation; it cannot be edited or sent again.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { type Application, lotNumber, STATUS_LABEL } from "@vila/shared/accounts/contract";
import { errorText } from "@vila/shared/accounts/errors";
import type { ApplicationFile } from "@vila/shared/accounts/files";
import { APPLICATION_STEP, NGO_TAGS, type NgoApplication, type NgoTag, validateApplication } from "@vila/shared/accounts/validate";
import { LOTS } from "@vila/shared/game/world";

import { useVila } from "../game/store";
import { api, ApiError, useAccount } from "../lib/account";
import { fetchLots, type LotInfo } from "../lib/api";
import { Field } from "./Account";
import { ApplicationFiles } from "./ApplicationFiles";
import { Panel, Status } from "./Panel";

const STEPS = ["Dados da organização", "Documentos e comprovações", "Apresentação e projetos", "Revisão e envio"] as const;

const EMPTY: NgoApplication = {
  name: "",
  cnpj: "",
  openedOn: "",
  city: "",
  declarations: { activeCnpj: false, oneYear: false, fundsConfirmable: false },
  fundsConfirmation: "",
  summary: "",
  description: "",
  tags: [],
  projects: [],
  lotId: "",
};

export function NgoApplicationPanel({ lotId }: { lotId?: string }) {
  const user = useAccount((s) => s.user);
  const open = useVila((s) => s.open);
  const [app, setApp] = useState<Application | null | undefined>(undefined);
  /** Metadata only (IMPL-0017); empty with uploads off or an API that does not know them. */
  const [files, setFiles] = useState<ApplicationFile[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      api.application().then((r) => {
        setApp(r.application);
        setFiles(r.files ?? []);
      }),
    []
  );
  useEffect(() => {
    if (!user) return;
    load().catch((e) => setError(errorText(e)));
  }, [user, load]);

  if (!user)
    return (
      <Panel kicker="Cadastro de ONGs" title="Entre para candidatar sua ONG">
        <p className="lead">A candidatura é feita por uma conta da Vila (nome, nickname, cidade e e-mail).</p>
        <button className="btn btn--primary" onClick={() => open({ kind: "account", then: { kind: "ngo", lotId } })}>
          Entrar ou criar conta
        </button>
      </Panel>
    );
  if (app === undefined)
    return (
      <Panel kicker="Cadastro de ONGs" title="Carregando…">
        {error ? <p className="form__error">{error}</p> : <p>Carregando sua candidatura…</p>}
      </Panel>
    );
  if (app && !editing)
    return (
      <ApplicationStatusView
        app={app}
        files={files}
        onEdit={() => setEditing(true)}
        onFiles={(changed, revision) => {
          setFiles(changed);
          setApp((current) => current && { ...current, revision });
        }}
        onStale={load}
      />
    );
  return <Wizard initial={app ?? { ...EMPTY, lotId: lotId ?? "" }} heldLot={app?.lotId} onDone={(a) => (setApp(a), setEditing(false))} />;
}

/** What the applicant sees about an application already sent. Exported for the render test. */
export function ApplicationStatusView({
  app,
  files,
  onEdit,
  onFiles,
  onStale,
}: {
  app: Application;
  files: ApplicationFile[];
  onEdit: () => void;
  onFiles: (files: ApplicationFile[], revision: number) => void;
  onStale: () => Promise<unknown>;
}) {
  const canEdit = app.status === "changes_requested" || app.status === "rejected";
  const withdrawn = app.status === "withdrawn";
  const filesOn = useAccount((s) => s.files);
  return (
    // A removed file takes its buttons away: the key sends the focus back to the dialog.
    <Panel kicker="Cadastro de ONGs" title={app.name} contentKey={files.map((f) => f.id).join()}>
      <p>
        <Status>{STATUS_LABEL[app.status]}</Status> · Terreno {lotNumber(app.lotId)}
        {withdrawn ? " (liberado)" : ""} · versão {app.revision}
      </p>
      <ol className="flow" aria-label="Etapas">
        <li className="is-done">Candidatura enviada</li>
        <li className={app.status === "submitted" ? "" : "is-done"}>Análise administrativa</li>
        <li className={app.status === "published" || withdrawn ? "is-done" : ""}>Casa publicada após aprovação</li>
        {withdrawn && <li className="is-done">Retirada da Vila pela administração</li>}
      </ol>
      {withdrawn ? (
        <>
          <p className="note" data-state="withdrawn">
            A administração retirou esta organização da Vila: a casa não aparece mais e o terreno foi liberado. Esta candidatura não pode ser editada nem
            reenviada.
          </p>
          {app.withdrawal && (
            <div className="callout">
              <strong>Mensagem da administração</strong>
              <p>{app.withdrawal.reason}</p>
            </div>
          )}
        </>
      ) : (
        app.status !== "published" && <p className="note">A casa só aparece na Vila depois da aprovação da administração.</p>
      )}
      {app.reviewNote && (
        <div className="callout">
          <strong>Mensagem da análise</strong>
          <p>{app.reviewNote}</p>
        </div>
      )}
      {canEdit && (
        <button className="btn btn--primary" onClick={onEdit}>
          Editar e reenviar
        </button>
      )}
      {filesOn && <ApplicationFiles status={app.status} files={files} onChange={onFiles} onStale={onStale} />}
    </Panel>
  );
}

function Wizard({ initial, heldLot, onDone }: { initial: NgoApplication; heldLot?: string; onDone: (a: Application) => void }) {
  const [form, setForm] = useState<NgoApplication>(initial);
  const [step, setStep] = useState(1);
  const [shown, setShown] = useState<Partial<Record<keyof NgoApplication, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lots, setLots] = useState<LotInfo[]>([]);
  const filesOn = useAccount((s) => s.files);
  useEffect(() => void fetchLots().then((r) => r && setLots(r.lots)), []);
  const available = useMemo(() => LOTS.filter((l) => l.id === heldLot || lots.find((x) => x.id === l.id)?.state === "available"), [lots, heldLot]);
  const errors = validateApplication(form, new Date()).errors;
  const stepErrors = (n: number) => Object.fromEntries(Object.entries(errors).filter(([k]) => APPLICATION_STEP[k as keyof NgoApplication] === n));
  const set = <K extends keyof NgoApplication>(k: K, v: NgoApplication[K]) => setForm({ ...form, [k]: v });
  const next = () => {
    const found = stepErrors(step);
    setShown(found);
    if (!Object.keys(found).length) setStep(step + 1);
  };
  const submit = async () => {
    const found = validateApplication(form, new Date()).errors;
    if (Object.keys(found).length) {
      setShown(found);
      setStep(Math.min(...Object.keys(found).map((k) => APPLICATION_STEP[k as keyof NgoApplication])));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { application } = await api.submitApplication(validateApplication(form, new Date()).value);
      useVila.getState().notify("Candidatura enviada! A administração da Vila vai analisar.");
      onDone(application);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) {
        setShown(e.fields as typeof shown);
        setStep(Math.min(...Object.keys(e.fields).map((k) => APPLICATION_STEP[k as keyof NgoApplication] ?? 4)));
      }
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const decl = form.declarations;
  return (
    <Panel kicker={`Cadastro da ONG · etapa ${step} de 4`} title={STEPS[step - 1]} wide>
      <ol className="steps" aria-label="Etapas da candidatura">
        {STEPS.map((s, i) => (
          <li key={s} className={i + 1 === step ? "is-on" : i + 1 < step ? "is-done" : ""} aria-current={i + 1 === step ? "step" : undefined}>
            {s}
          </li>
        ))}
      </ol>
      <div className="form">
        {step === 1 && (
          <>
            <Field label="Nome da organização *" error={shown.name}>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
            </Field>
            <Field label="CNPJ *" error={shown.cnpj} hint="Só números ou no formato 00.000.000/0000-00.">
              <input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} inputMode="numeric" maxLength={18} />
            </Field>
            <Field label="Data de abertura do CNPJ *" error={shown.openedOn} hint="A organização precisa ter pelo menos 1 ano.">
              <input type="date" value={form.openedOn} onChange={(e) => set("openedOn", e.target.value)} />
            </Field>
            <Field label="Cidade da sede *" error={shown.city} hint="Usada na análise da candidatura; não aparece no perfil público.">
              <input value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={60} />
            </Field>
          </>
        )}
        {step === 2 && (
          <>
            <fieldset className={`checks${shown.declarations ? " field--error" : ""}`}>
              <legend>Requisitos declarados — a verificar</legend>
              {(
                [
                  ["activeCnpj", "CNPJ ativo"],
                  ["oneYear", "Pelo menos 1 ano de existência"],
                  ["fundsConfirmable", "Forma confiável de confirmar os recursos recebidos"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="env-check">
                  <input type="checkbox" checked={decl[k]} onChange={(e) => set("declarations", { ...decl, [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
              {shown.declarations && <span className="field__error">{shown.declarations}</span>}
            </fieldset>
            <Field label="Como os recursos podem ser confirmados? *" error={shown.fundsConfirmation} hint="Ex.: extratos da conta da organização, relatório conciliável, página de campanha identificada.">
              <textarea value={form.fundsConfirmation} onChange={(e) => set("fundsConfirmation", e.target.value)} maxLength={1000} rows={4} />
            </Field>
            {filesOn ? (
              <p className="note">Depois de enviar a candidatura, você pode anexar o logo e documentos na tela da candidatura. É opcional.</p>
            ) : (
              <p className="note">Os documentos serão pedidos pela administração durante a análise. Não envie documentos por aqui.</p>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <p className="note">Após a aprovação, nome, resumo, descrição, áreas de atuação e projetos ficarão públicos na Vila. Não inclua dados pessoais nesses textos.</p>
            <Field label="Resumo (público após aprovação) *" error={shown.summary}>
              <input value={form.summary} onChange={(e) => set("summary", e.target.value)} maxLength={280} />
            </Field>
            <Field label="Sobre a organização *" error={shown.description}>
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} rows={5} />
            </Field>
            <fieldset className={`checks${shown.tags ? " field--error" : ""}`}>
              <legend>Áreas de atuação (até 4) *</legend>
              <div className="look__options">
                {(Object.keys(NGO_TAGS) as NgoTag[]).map((t) => {
                  const on = form.tags.includes(t);
                  return (
                    <button
                      type="button"
                      key={t}
                      className={`btn btn--chip${on ? " is-on" : ""}`}
                      aria-pressed={on}
                      disabled={!on && form.tags.length >= 4}
                      onClick={() => set("tags", on ? form.tags.filter((x) => x !== t) : [...form.tags, t])}
                    >
                      {NGO_TAGS[t]}
                    </button>
                  );
                })}
              </div>
              {shown.tags && <span className="field__error">{shown.tags}</span>}
            </fieldset>
            <fieldset className="checks">
              <legend>Projetos (opcional, até 3)</legend>
              {form.projects.map((p, i) => (
                <div key={i} className="project">
                  <input placeholder="Título do projeto" value={p.title} maxLength={80} onChange={(e) => set("projects", form.projects.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <textarea placeholder="Descrição curta" value={p.description} maxLength={400} rows={2} onChange={(e) => set("projects", form.projects.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  <button type="button" className="btn btn--small" onClick={() => set("projects", form.projects.filter((_, j) => j !== i))}>
                    Remover
                  </button>
                </div>
              ))}
              {form.projects.length < 3 && (
                <button type="button" className="btn btn--small" onClick={() => set("projects", [...form.projects, { title: "", description: "" }])}>
                  Adicionar projeto
                </button>
              )}
              {shown.projects && <span className="field__error">{shown.projects}</span>}
            </fieldset>
          </>
        )}
        {step === 4 && (
          <>
            <Field label="Terreno desejado *" error={shown.lotId}>
              <select value={form.lotId} onChange={(e) => set("lotId", e.target.value)}>
                <option value="">Escolha um terreno disponível</option>
                {available.map((l) => (
                  <option key={l.id} value={l.id}>
                    Terreno {lotNumber(l.id)}
                  </option>
                ))}
              </select>
            </Field>
            <dl className="facts">
              <dt>Organização</dt>
              <dd>
                {form.name} · {form.city}
              </dd>
              <dt>CNPJ</dt>
              <dd>
                {form.cnpj} · aberto em {form.openedOn}
              </dd>
              <dt>Resumo</dt>
              <dd>{form.summary}</dd>
              <dt>Áreas</dt>
              <dd>{form.tags.map((t) => NGO_TAGS[t]).join(", ")}</dd>
            </dl>
            <p className="note">Depois do envio: análise administrativa. A casa só é publicada na Vila se a candidatura for aprovada.</p>
          </>
        )}
        {error && <p className="form__error" role="alert">{error}</p>}
        <div className="actions">
          {step > 1 && (
            <button type="button" className="btn" onClick={() => setStep(step - 1)}>
              Voltar
            </button>
          )}
          {step < 4 ? (
            <button type="button" className="btn btn--primary" onClick={next}>
              Continuar
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void submit()}>
              {busy ? "Enviando…" : "Enviar candidatura"}
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
