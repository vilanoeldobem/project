/**
 * Admin review of NGO applications (DEC-037: only an authorised admin publishes; every decision audited
 * server-side). Wireframe P12 "Análise administrativa": evidence, the three DEC-015 checks, decision history,
 * "Aprovar / Pedir ajustes / Rejeitar". The applicant appears only by nickname (no personal data here).
 * Moved from the game (`apps/client/src/ui/Admin.tsx`) in IMPL-0015 with the same API calls and messages.
 */
import { useCallback, useEffect, useState } from "react";

import { APPLICATION_STATUSES, type ApplicationDetail, type ApplicationStatus, type ApplicationSummary, lotNumber, type ReviewAction, STATUS_LABEL } from "@vila/shared/accounts/contract";
import { errorText } from "@vila/shared/accounts/errors";
import { NGO_TAGS, type NgoTag } from "@vila/shared/accounts/validate";

import { ACTION_LABEL, dateTime } from "../lib/format";
import { hrefOf } from "../lib/router";
import { api } from "../lib/services";
import { AccountsOff, Field, PageHead, Status } from "./common";

export function Applications({ id, locked }: { id?: string; locked: boolean }) {
  // Lives here (not in the list) so the chosen filter survives opening an application and coming back.
  const [filter, setFilter] = useState<ApplicationStatus | "">("");
  if (locked)
    return (
      <>
        <PageHead title="Candidaturas de ONGs" />
        <AccountsOff what="não há candidaturas para analisar" />
      </>
    );
  return id ? <ReviewDetail key={id} id={id} /> : <ApplicationList filter={filter} onFilter={setFilter} />;
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

function ReviewDetail({ id }: { id: string }) {
  const [d, setD] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => void api.adminGet(id).then(setD, (e) => setError(errorText(e))), [id]);
  // One outer structure while loading and once loaded, so the heading (which holds the focus after navigating) stays.
  return (
    <article className="detail">
      <p className="kicker">Análise administrativa · apenas administradores</p>
      <PageHead title={d ? d.application.name : error ? "Candidatura indisponível" : "Carregando…"} />
      {d ? (
        <Review id={id} d={d} onDetail={setD} />
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

/** The review of one loaded application: evidence, checks, decision and history. `onDetail` receives each fresh copy. */
export function Review({ id, d, onDetail }: { id: string; d: ApplicationDetail; onDetail: (d: ApplicationDetail) => void }) {
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState({ cnpj: false, year: false, funds: false });
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const a = d.application;
  const decide = async (action: ReviewAction) => {
    setBusy(true);
    setError("");
    setFieldError("");
    setDone("");
    try {
      const ticked = { activeCnpj: checks.cnpj, oneYear: checks.year, fundsConfirmable: checks.funds };
      await api.adminDecide(id, action, a.revision, note || undefined, action === "approve" ? ticked : undefined);
      const fresh = await api.adminGet(id);
      onDetail(fresh);
      setNote("");
      setDone(`Decisão registrada: ${STATUS_LABEL[fresh.application.status]}.`);
    } catch (e) {
      // The applicant resubmitted while this screen was open: show the new version, untick the checks.
      if ((e as { code?: string }).code === "stale_revision") {
        onDetail(await api.adminGet(id).catch(() => d));
        setChecks({ cnpj: false, year: false, funds: false });
      }
      setFieldError((e as { fields?: Record<string, string> }).fields?.note ?? "");
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const open = a.status === "submitted" || a.status === "under_review";
  const verified = checks.cnpj && checks.year && checks.funds;
  return (
    <>
      <p className="detail__meta">
        <Status code={a.status}>{STATUS_LABEL[a.status]}</Status> · Terreno {lotNumber(a.lotId)} · versão {a.revision} · enviada por @{d.applicant?.nickname ?? "conta excluída"}
      </p>
      <h2>Evidências</h2>
      <dl className="facts">
        <dt>CNPJ</dt>
        <dd>{a.cnpj}</dd>
        <dt>Abertura</dt>
        <dd>{a.openedOn}</dd>
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
      <fieldset className="checks">
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
              <button className="btn" disabled={busy} onClick={() => void decide("start_review")}>
                Iniciar análise
              </button>
            )}
            {open && (
              <button className="btn btn--primary" disabled={busy || !verified} title={verified ? "" : "Aprovar após verificar"} onClick={() => void decide("approve")}>
                Aprovar
              </button>
            )}
            {open && (
              <button className="btn" disabled={busy} onClick={() => void decide("request_changes")}>
                Pedir ajustes
              </button>
            )}
            <button className="btn" disabled={busy} onClick={() => void decide("reject")}>
              Rejeitar
            </button>
          </div>
          {!verified && open && <p className="muted">Aprovar após verificar os três requisitos.</p>}
        </>
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
            {dateTime(h.at)} · {ACTION_LABEL[h.action] ?? h.action}
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
