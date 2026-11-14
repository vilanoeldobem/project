/**
 * Admin review of NGO applications (DEC-037: only an authorised admin publishes; every decision audited
 * server-side). Wireframe P12 "Análise administrativa": evidence, the three DEC-015 checks, decision history,
 * "Aprovar / Pedir ajustes / Rejeitar". The applicant appears only by nickname (no personal data here).
 * Moved from the game (`apps/client/src/ui/Admin.tsx`) in IMPL-0015 with the same API calls and messages.
 *
 * Files (IMPL-0017, PROPOSTA): the logo is previewed; documents are only downloaded, one audited read per click.
 *
 * Withdrawal (IMPL-0020, PROPOSTA): a published NGO can be taken out of the village only when the API says
 * `withdrawal` in `/config`. The text the admin writes is the message the organisation reads, and is labelled so.
 *
 * Logo removal (IMPL-0021): an administrator can remove the logo of an NGO in any status (a published logo is
 * public), after a confirmation, for the revision on screen.
 *
 * `#applications/<id>` (the link the game builds) opens one application here. An address that names an
 * application that does not exist, or not with a well-formed id, shows "Candidatura não encontrada."
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { APPLICATION_STATUSES, type ApplicationDetail, type ApplicationStatus, type ApplicationSummary, lotNumber, type ReviewAction, STATUS_LABEL } from "@vila/shared/accounts/contract";
import { errorText } from "@vila/shared/accounts/errors";
import type { ApplicationFile } from "@vila/shared/accounts/files";
import { NGO_TAGS, formatBrDate, type NgoTag } from "@vila/shared/accounts/validate";

import { downloadDocument } from "../lib/files";
import { actionText, dateTime, FILE_TYPE_LABEL, fileSize } from "../lib/format";
import { logoRefusalText, sendDecision, sendLogoRemoval, sendWithdrawal } from "../lib/review";
import { hrefOf } from "../lib/router";
import { api } from "../lib/services";
import { AccountsOff, Confirmation, Field, Notice, PageHead, Status } from "./common";
import { NgoPaymentConfig } from "./Donations";

/** `unknown`: the address names one application, but not with a well-formed id (lib/router.ts). */
export function Applications({ id, unknown = false, locked, accountId }: { id?: string; unknown?: boolean; locked: boolean; accountId?: string }) {
  // Lives here (not in the list) so the chosen filter survives opening an application and coming back.
  const [filter, setFilter] = useState<ApplicationStatus | "">("");
  if (locked)
    return (
      <>
        <PageHead title="Candidaturas de ONGs" />
        <AccountsOff what="não há candidaturas para analisar" />
      </>
    );
  // Nothing of a malformed address is sent to the API: the answer is already known.
  if (unknown)
    return (
      <article className="detail">
        <p className="kicker">Análise administrativa · apenas administradores</p>
        <PageHead title="Candidatura não encontrada" />
        <NotFound />
      </article>
    );
  return id ? <ReviewDetail key={id} id={id} accountId={accountId} /> : <ApplicationList filter={filter} onFilter={setFilter} />;
}

/** The state of an address that leads to no application: said plainly, with the way back to the list. */
function NotFound() {
  return (
    <>
      <Notice state="not-found" title="Candidatura não encontrada." tone="warn">
        <p>O endereço não corresponde a nenhuma candidatura desta instalação: ele pode estar incompleto, ou a candidatura não existe mais.</p>
      </Notice>
      <BackToList />
    </>
  );
}

function ApplicationList({ filter, onFilter }: { filter: ApplicationStatus | ""; onFilter: (s: ApplicationStatus | "") => void }) {
  const [rows, setRows] = useState<ApplicationSummary[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    let live = true;
    setError("");
    api.adminList(filter || undefined).then(
      (r) => live && setRows(r.applications),
      (e) => live && setError(errorText(e))
    );
    return () => {
      live = false;
    };
  }, [filter]);
  useEffect(load, [load]);
  return (
    <>
      <PageHead title="Candidaturas de ONGs" lead="Análise administrativa: só a aprovação publica a casa na Vila (DEC-037). Cada decisão fica na auditoria." />
      <div className="chips" role="group" aria-label="Filtrar por situação">
        {(["", ...APPLICATION_STATUSES] as const).map((s) => (
          <button key={s} className={`btn btn--chip${filter === s ? " is-on" : ""}`} aria-pressed={filter === s} onClick={() => onFilter(s)}>
            {s ? STATUS_LABEL[s] : "Todas"}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {rows === null ? (
          !error && <p className="muted">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="muted" data-state="empty">
            Nenhuma candidatura nesta situação.
          </p>
        ) : (
          <ul className="rows">
            {rows.map((r) => (
              <li key={r.id}>
                <a className="row" href={hrefOf({ section: "applications", id: r.id })}>
                  <strong>{r.name}</strong>{" "}
                  <span className="muted">
                    {r.city} · {r.lotId ? `Terreno ${lotNumber(r.lotId)}` : "sem terreno"} · versão {r.revision}
                  </span>{" "}
                  <Status code={r.status}>{STATUS_LABEL[r.status]}</Status>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

const BackToList = () => (
  <p>
    <a className="btn" href={hrefOf({ section: "applications" })}>
      Voltar à lista
    </a>
  </p>
);

function ReviewDetail({ id, accountId }: { id: string; accountId?: string }) {
  const [d, setD] = useState<ApplicationDetail | null>(null);
  /** `GET /config` says whether uploads work in this API; an older API does not send the flag (= off). */
  const [filesOn, setFilesOn] = useState(false);
  /** `GET /config` says whether a published NGO can be withdrawn (IMPL-0020, PROPOSTA); absent = off. */
  const [withdrawalOn, setWithdrawalOn] = useState(false);
  /** `GET /config` says whether donations are on (IMPL-0023, PROPOSTA); absent = off. */
  const [donationsOn, setDonationsOn] = useState(false);
  const [error, setError] = useState("");
  /** The API knows no application with this id (a link to one that never existed here, or was erased). */
  const [missing, setMissing] = useState(false);
  useEffect(
    () =>
      // A failed `/config` only means the flags are unknown (treated as off): the application itself still opens.
      void Promise.all([api.adminGet(id), api.config().catch((): { files?: boolean; withdrawal?: boolean; donations?: boolean } => ({}))]).then(
        ([detail, config]) => {
          setFilesOn(config.files === true);
          setWithdrawalOn(config.withdrawal === true);
          setDonationsOn(config.donations === true);
          setD(detail);
        },
        (e) => ((e as { code?: string }).code === "not_found" ? setMissing(true) : setError(errorText(e)))
      ),
    [id]
  );
  // One outer structure while loading and once loaded, so the heading (which holds the focus after navigating) stays.
  return (
    <article className="detail">
      <p className="kicker">Análise administrativa · apenas administradores</p>
      <PageHead title={d ? d.application.name : missing ? "Candidatura não encontrada" : error ? "Candidatura indisponível" : "Carregando…"} />
      {d ? (
        <Review id={id} d={d} filesOn={filesOn} withdrawalOn={withdrawalOn} donationsOn={donationsOn} accountId={accountId} onDetail={setD} />
      ) : missing ? (
        <div aria-live="polite">
          <NotFound />
        </div>
      ) : (
        <>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <BackToList />
        </>
      )}
    </article>
  );
}

/**
 * The review of one loaded application: evidence, files, checks, decision and history. `onDetail` receives each
 * fresh copy; `filesOn` and `withdrawalOn` are the API's `files` and `withdrawal` flags; `accountId` is the
 * signed-in admin (the withdrawal names the account the page believes is signed in).
 */
export function Review({
  id,
  d,
  filesOn,
  withdrawalOn = false,
  donationsOn = false,
  accountId,
  onDetail,
}: {
  id: string;
  d: ApplicationDetail;
  filesOn: boolean;
  withdrawalOn?: boolean;
  /** Donations are on in this API (IMPL-0023, PROPOSTA) and the review shows the payment configuration. */
  donationsOn?: boolean;
  accountId?: string;
  onDetail: (d: ApplicationDetail) => void;
}) {
  const [note, setNote] = useState("");
  /** The admin confirmed that a withdrawal cannot be undone here. */
  const [understood, setUnderstood] = useState(false);
  const [checks, setChecks] = useState({ cnpj: false, year: false, funds: false });
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const a = d.application;
  const deleting = d.applicant?.deletionPending === true;
  const decide = async (action: ReviewAction) => {
    setBusy(true);
    setError("");
    setFieldError("");
    setDone("");
    const result = await sendDecision(api, id, d, action, note, { activeCnpj: checks.cnpj, oneYear: checks.year, fundsConfirmable: checks.funds });
    if (result.ok) {
      onDetail(result.detail);
      setNote("");
      setDone(`Decisão registrada: ${STATUS_LABEL[result.status]}.`);
    } else {
      // The application changed while this screen was open (resubmitted, or a file sent or removed): show the
      // current version, files included, and untick the checks.
      if (result.stale) {
        onDetail(result.detail);
        setChecks({ cnpj: false, year: false, funds: false });
      }
      setFieldError((result.error as { fields?: Record<string, string> }).fields?.note ?? "");
      setError(errorText(result.error));
    }
    setBusy(false);
  };
  const withdraw = async () => {
    if (!accountId) return;
    setBusy(true);
    setError("");
    setFieldError("");
    setDone("");
    const result = await sendWithdrawal(api, id, d, accountId, note);
    if (result.ok) {
      onDetail(result.detail);
      setNote("");
      setDone(`Retirada registrada: ${STATUS_LABEL[result.status]}. A casa saiu da Vila e o terreno foi liberado.`);
    } else {
      // The application changed while this screen was open: show the current version and ask to confirm again.
      if (result.stale) onDetail(result.detail);
      setFieldError((result.error as { fields?: Record<string, string> }).fields?.reason ?? "");
      setError(errorText(result.error));
    }
    setUnderstood(false);
    setBusy(false);
  };
  const open = a.status === "submitted" || a.status === "under_review";
  const verified = checks.cnpj && checks.year && checks.funds;
  return (
    <>
      <p className="detail__meta">
        <Status code={a.status}>{STATUS_LABEL[a.status]}</Status> · Terreno {lotNumber(a.lotId)} · versão {a.revision} · enviada por @{d.applicant?.nickname ?? "conta excluída"}
      </p>
      {deleting && (
        <Notice state="deletion-pending" title="Exclusão da conta pendente" tone="warn">
          <p>O responsável pediu a exclusão da conta e a remoção dos arquivos ainda não terminou. Não aprove nem peça ajustes: parte das evidências já pode ter sido apagada.</p>
          <p>Em uma candidatura ainda aberta, rejeitar libera o terreno sem cancelar a exclusão. O responsável pode tentar concluir a exclusão pela tela da conta quando o armazenamento voltar.</p>
        </Notice>
      )}
      <h2>Evidências</h2>
      <dl className="facts">
        <dt>CNPJ</dt>
        <dd>{a.cnpj}</dd>
        <dt>Abertura</dt>
        <dd>{formatBrDate(a.openedOn) || a.openedOn}</dd>
        <dt>Cidade</dt>
        <dd>{a.city}</dd>
        <dt>Confirmação dos recursos</dt>
        <dd>{a.fundsConfirmation}</dd>
        <dt>Resumo</dt>
        <dd>{a.summary}</dd>
        <dt>Sobre</dt>
        <dd>{a.description}</dd>
        <dt>Áreas</dt>
        <dd>{a.tags.map((t) => NGO_TAGS[t as NgoTag] ?? t).join(", ")}</dd>
        {a.projects.length > 0 && (
          <>
            <dt>Projetos</dt>
            <dd>{a.projects.map((p) => p.title).join(" · ")}</dd>
          </>
        )}
      </dl>
      {/* An API older than IMPL-0017 sends no `files`. */}
      <Files applicationId={id} d={d} enabled={filesOn} accountId={accountId} onDetail={onDetail} />
      {/* IMPL-0023 (PROPOSTA): only while the donations flag is on and the NGO is still in the village. */}
      {donationsOn && a.status !== "withdrawn" && (
        <NgoPaymentConfig
          key={`${a.id}:${a.ngoPayment?.updatedAt ?? "new"}`}
          ngoId={id}
          accountId={accountId}
          requested={{ method: a.paymentMethod, donationUrl: a.donationUrl }}
          payment={a.ngoPayment}
          onSaved={(payment) => onDetail({ ...d, application: { ...a, ...(payment ? { ngoPayment: payment } : {}) } })}
        />
      )}
      <fieldset className="checks" disabled={deleting}>
        <legend>Verificação dos 3 requisitos (DEC-015)</legend>
        {(
          [
            ["cnpj", "CNPJ ativo (consultado na Receita Federal)"],
            ["year", "Pelo menos 1 ano de existência"],
            ["funds", "Forma confiável de confirmar os recursos"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />
            {label}
          </label>
        ))}
        <p className="muted">Ao aprovar, as três confirmações ficam registradas no histórico da decisão.</p>
      </fieldset>
      {(open || a.status === "changes_requested") && (
        <>
          <Field label="Mensagem para a organização (obrigatória para pedir ajustes ou não aprovar)" error={fieldError}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
          </Field>
          <div className="actions">
            {a.status === "submitted" && (
              <button className="btn" disabled={busy || deleting} onClick={() => void decide("start_review")}>
                Iniciar análise
              </button>
            )}
            {open && (
              <button className="btn btn--primary" disabled={busy || deleting || !verified} title={deleting ? "Exclusão da conta pendente" : verified ? "" : "Aprovar após verificar"} onClick={() => void decide("approve")}>
                Aprovar
              </button>
            )}
            {open && (
              <button className="btn" disabled={busy || deleting} onClick={() => void decide("request_changes")}>
                Pedir ajustes
              </button>
            )}
            <button className="btn" disabled={busy} onClick={() => void decide("reject")}>
              Rejeitar
            </button>
          </div>
          {!verified && open && !deleting && <p className="muted">Aprovar após verificar os três requisitos.</p>}
        </>
      )}
      {a.status === "published" && withdrawalOn && (
        <section data-action="withdraw" aria-labelledby="withdraw-title">
          <h2 id="withdraw-title">Retirar da Vila</h2>
          <Notice state="withdrawal-proposal" title="PROPOSTA (IMPL-0020): o que a retirada faz hoje" tone="warn">
            <p>
              A casa sai da Vila e o terreno fica disponível na hora. O painel não tem como desfazer: a organização não volta a ser publicada, a conta
              do responsável não consegue enviar outra candidatura e o CNPJ continua em uso. Os arquivos e as fotos continuam guardados; o
              responsável pode removê-los.
            </p>
          </Notice>
          <Field
            label="Mensagem para a organização (obrigatória, de 10 a 1000 caracteres)"
            hint="A organização lê este texto como foi escrito, na tela da candidatura. Não é uma anotação interna: não cite terceiros nem dados pessoais."
            error={fieldError}
          >
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            Entendo que a retirada não pode ser desfeita pelo painel
          </label>
          <div className="actions">
            <button
              className="btn"
              disabled={busy || deleting || !understood || !accountId}
              title={deleting ? "Exclusão da conta pendente" : understood ? "" : "Confirme antes de retirar"}
              onClick={() => void withdraw()}
            >
              Retirar da Vila
            </button>
          </div>
          {deleting && <p className="muted">A retirada fica indisponível enquanto a exclusão da conta do responsável não terminar.</p>}
        </section>
      )}
      {a.status === "withdrawn" && (
        <Notice state="withdrawn" title="Retirada da Vila pela administração">
          <p>A casa não aparece mais na Vila e o terreno foi liberado. Nenhuma decisão pode ser registrada e o painel não tem como desfazer a retirada.</p>
          {a.withdrawal && (
            <>
              <p>
                <strong>Mensagem enviada à organização</strong> em {dateTime(a.withdrawal.at)}:
              </p>
              <p data-field="withdrawal-message">{a.withdrawal.reason}</p>
            </>
          )}
        </Notice>
      )}
      <div aria-live="polite">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="ok" role="status">
            {done}
          </p>
        )}
      </div>
      <h2>Histórico da decisão</h2>
      <ol className="history">
        {d.history.map((h, i) => (
          <li key={i}>
            {dateTime(h.at)} · {actionText(h.action, h.detail)}
            {h.actor ? ` · @${h.actor}` : ""}
          </li>
        ))}
      </ol>
      {a.reviewNote && (
        <div className="callout">
          <strong>Última mensagem enviada</strong>
          <p>{a.reviewNote}</p>
        </div>
      )}
      <BackToList />
    </>
  );
}

/** A file that was listed when the screen loaded may be gone by the time it is read (replaced or removed). */
const readError = (e: unknown): string =>
  (e as { code?: string }).code === "not_found"
    ? "Este arquivo não está mais disponível: a organização pode ter trocado ou removido. Recarregue a página para ver os arquivos atuais."
    : errorText(e);

const fileFacts = (file: ApplicationFile): string =>
  `${FILE_TYPE_LABEL[file.contentType] ?? file.contentType} · ${fileSize(file.size)} · enviado em ${dateTime(file.createdAt)}`;

/**
 * Logo and supporting documents of the application (IMPL-0017). Which documents an NGO must send is PENDENTE
 * (PEN-019), so they are only numbered: there is no file name (it may carry personal data) and no expected list.
 *
 * An administrator can remove the logo, in any status (IMPL-0021): `accountId` is who is signed in (without it
 * the removal is not offered) and `onDetail` receives the application as it is afterwards.
 */
function Files({ applicationId, d, enabled, accountId, onDetail }: { applicationId: string; d: ApplicationDetail; enabled: boolean; accountId?: string; onDetail: (d: ApplicationDetail) => void }) {
  // An API older than IMPL-0017 sends no `files`.
  const files = d.files ?? [];
  const logo = files.find((f) => f.kind === "logo");
  const documents = files.filter((f) => f.kind === "document");
  const deleting = d.applicant?.deletionPending === true;
  /** The logo removal: its confirmation is open, the request is out, and what it answered. */
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");
  const [outcome, setOutcome] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const sending = useRef(false);
  /** When the confirmation closes, the focus goes back to the button that opened it, or to the result if the logo is gone. */
  const trigger = useRef<HTMLButtonElement>(null);
  const result = useRef<HTMLParagraphElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (wasConfirming.current && !confirming) (trigger.current ?? result.current)?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const removeLogo = async () => {
    if (!accountId || sending.current) return;
    sending.current = true;
    setBusy(true);
    setRefusal("");
    const sent = await sendLogoRemoval(api, applicationId, d, accountId);
    sending.current = false;
    setBusy(false);
    if (sent.ok) {
      onDetail(sent.detail);
      setConfirming(false);
      setOutcome({ tone: "ok", text: `Logo removido. A candidatura passou para a versão ${sent.detail.application.revision}.` });
    } else if (sent.stale) {
      // The application changed while this screen was open: show the current version and its files.
      onDetail(sent.detail);
      setConfirming(false);
      setOutcome({ tone: "error", text: logoRefusalText(sent.error) });
    } else {
      setRefusal(logoRefusalText(sent.error));
    }
  };
  return (
    <>
      <h2>Arquivos</h2>
      {!enabled && (
        <Notice state="files-off" title="Envio de arquivos desligado" tone="warn">
          <p>
            O envio de arquivos está desligado nesta API (<code>NGO_FILES_ENABLED</code>, ou o armazenamento não está configurado): as
            organizações não conseguem enviar nem trocar arquivos agora. {files.length > 0 ? "Os arquivos abaixo foram enviados antes e continuam valendo: confira-os, porque o logo fica público se o envio for ligado de novo depois da aprovação." : "Nada aqui é dado de exemplo: os arquivos aparecem quando o envio for ligado."}
          </p>
        </Notice>
      )}
      {!enabled && files.length === 0 ? null : files.length === 0 ? (
        <p className="muted" data-state="empty">
          Nenhum arquivo enviado.
        </p>
      ) : (
        <>
          <h3>Logo</h3>
          {logo ? <LogoPreview key={logo.id} applicationId={applicationId} file={logo} /> : <p className="muted">Nenhum logo enviado.</p>}
          {logo && accountId && !confirming && (
            <p>
              <button
                type="button"
                ref={trigger}
                className="btn btn--small"
                data-action="remove-logo"
                disabled={deleting}
                title={deleting ? "Exclusão da conta pendente" : ""}
                onClick={() => {
                  setRefusal("");
                  setOutcome(null);
                  setConfirming(true);
                }}
              >
                Remover logo
              </button>
            </p>
          )}
          {logo && accountId && confirming && (
            <LogoRemovalConfirmation name={d.application.name} revision={d.application.revision} busy={busy} error={refusal} onConfirm={() => void removeLogo()} onCancel={() => setConfirming(false)} />
          )}
          <h3>Documentos</h3>
          {documents.length === 0 ? (
            <p className="muted">Nenhum documento enviado.</p>
          ) : (
            <>
              <p className="muted">Os documentos não abrem no painel: são apenas baixados. Cada download de documento fica registrado na auditoria.</p>
              <ul className="files">
                {documents.map((file, i) => (
                  <DocumentRow key={file.id} applicationId={applicationId} file={file} position={i + 1} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <div aria-live="polite" data-result="remove-logo">
        {outcome && (
          <p className={outcome.tone === "ok" ? "ok" : "error"} role={outcome.tone === "ok" ? "status" : "alert"} tabIndex={-1} ref={result}>
            {outcome.text}
          </p>
        )}
      </div>
    </>
  );
}

/** The second step of a logo removal: which organisation, what happens to the file, and that it cannot be undone here. */
export function LogoRemovalConfirmation({
  name,
  revision,
  busy = false,
  error = "",
  onConfirm,
  onCancel,
}: {
  name: string;
  /** The version on screen: the one the removal is sent for. */
  revision: number;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Confirmation
      kind="remove-logo"
      title={`Remover o logo de ${name}?`}
      understood="Entendo que o logo será apagado e que o painel não tem como desfazer"
      confirm="Remover logo"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>
        O arquivo é apagado e deixa de aparecer aqui e, se a organização está publicada, na casa dela na Vila. O painel não tem como desfazer. A
        candidatura passa para uma nova versão (hoje: versão {revision}) e a remoção fica registrada na auditoria.
      </p>
    </Confirmation>
  );
}

/** The only file read without being asked: the logo becomes public once the NGO is published, and its read is not audited. */
function LogoPreview({ applicationId, file }: { applicationId: string; file: ApplicationFile }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    let made = "";
    api.fileBytes(applicationId, file.id).then(
      (blob) => {
        if (!live) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      },
      (e) => live && setError(readError(e))
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [applicationId, file.id]);
  return (
    <div className="logo" data-file="logo">
      {url ? (
        <img src={url} alt="Logo enviado pela organização" />
      ) : error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : (
        <p className="muted">Carregando o logo…</p>
      )}
      <p className="muted">{fileFacts(file)}</p>
    </div>
  );
}

function DocumentRow({ applicationId, file, position }: { applicationId: string; file: ApplicationFile; position: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      await downloadDocument(api, applicationId, file, position);
    } catch (e) {
      setError(readError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li data-file="document">
      <span>
        <strong>Documento {position}</strong> <span className="muted">{fileFacts(file)}</span>
      </span>
      <button className="btn btn--small" disabled={busy} aria-label={`Baixar documento ${position}`} onClick={() => void download()}>
        {busy ? "Baixando…" : "Baixar"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
