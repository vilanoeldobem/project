/**
 * Admin review of NGO applications (DEC-037: only an authorised admin publishes; every decision audited
 * server-side). Wireframe P12 "Análise administrativa": evidence, the three DEC-015 checks, decision history,
 * "Aprovar / Pedir ajustes / Rejeitar". The applicant appears only by nickname (no personal data here).
 */
import { useCallback, useEffect, useState } from "react";

import { NGO_TAGS, type NgoTag } from "@vila/shared/accounts/validate";

import { api, type Application, type ApplicationStatus, useAccount } from "../lib/account";
import { errorText, Field } from "./Account";
import { STATUS_LABEL } from "./NgoApplication";
import { Panel, Status } from "./Panel";

const ACTION_LABEL: Record<string, string> = {
  "ngo.submit": "Candidatura enviada",
  "ngo.resubmit": "Candidatura reenviada",
  "ngo.start_review": "Análise iniciada",
  "ngo.approve": "Aprovada e publicada",
  "ngo.request_changes": "Ajustes solicitados",
  "ngo.reject": "Não aprovada",
};

type Row = Awaited<ReturnType<typeof api.adminList>>["applications"][number];
type Detail = Awaited<ReturnType<typeof api.adminGet>>;

export function AdminPanel() {
  const user = useAccount((s) => s.user);
  const [filter, setFilter] = useState<ApplicationStatus | "">("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api.adminList(filter || undefined).then((r) => setRows(r.applications), (e) => setError(errorText(e)));
  }, [filter]);
  useEffect(load, [load]);

  if (user?.role !== "admin")
    return (
      <Panel kicker="Administração" title="Apenas administradores">
        <p>Esta área é só para a administração da Vila.</p>
      </Panel>
    );
  if (selected) return <ReviewDetail id={selected} onBack={() => (setSelected(null), load())} />;
  return (
    <Panel kicker="Administração" title="Análise de ONGs" wide>
      <div className="look__options" role="group" aria-label="Filtrar por situação">
        {(["", "submitted", "under_review", "changes_requested", "published", "rejected"] as const).map((s) => (
          <button key={s} className={`btn btn--chip${filter === s ? " is-on" : ""}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {s ? STATUS_LABEL[s] : "Todas"}
          </button>
        ))}
      </div>
      {error && <p className="form__error">{error}</p>}
      {rows === null ? (
        <p>Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="note">Nenhuma candidatura nesta situação.</p>
      ) : (
        <ul className="admin-list">
          {rows.map((r) => (
            <li key={r.id}>
              <button className="admin-list__item" onClick={() => setSelected(r.id)}>
                <strong>{r.name}</strong> <span className="note">{r.city} · Terreno {Number(r.lotId?.split("-")[1])} · versão {r.revision}</span>
                <Status>{STATUS_LABEL[r.status]}</Status>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ReviewDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState({ cnpj: false, year: false, funds: false });
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => void api.adminGet(id).then(setD, (e) => setError(errorText(e))), [id]);
  if (!d)
    return (
      <Panel kicker="Administração" title="Carregando…">
        {error && <p className="form__error">{error}</p>}
      </Panel>
    );
  const a: Application = d.application;
  const decide = async (action: "start_review" | "approve" | "request_changes" | "reject") => {
    setBusy(true);
    setError("");
    setFieldError("");
    try {
      await api.adminDecide(id, action, note || undefined);
      setD(await api.adminGet(id));
      setNote("");
    } catch (e) {
      setFieldError((e as { fields?: Record<string, string> }).fields?.note ?? "");
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const open = a.status === "submitted" || a.status === "under_review";
  const verified = checks.cnpj && checks.year && checks.funds;
  return (
    <Panel kicker="Análise administrativa · apenas administradores" title={a.name} wide>
      <p>
        <Status>{STATUS_LABEL[a.status]}</Status> · Terreno {Number(a.lotId.split("-")[1])} · versão {a.revision} · enviada por @
        {d.applicant?.nickname ?? "conta excluída"}
      </p>
      <h3>Evidências</h3>
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
          <label key={k} className="env-check">
            <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />
            {label}
          </label>
        ))}
        <p className="note">Esta lista é só um apoio para quem analisa; não fica gravada.</p>
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
          {!verified && open && <p className="note">Aprovar após verificar os três requisitos.</p>}
        </>
      )}
      {error && <p className="form__error" role="alert">{error}</p>}
      <h3>Histórico da decisão</h3>
      <ol className="history">
        {d.history.map((h, i) => (
          <li key={i}>
            {new Date(h.at).toLocaleString("pt-BR")} · {ACTION_LABEL[h.action] ?? h.action}
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
      <button className="btn" onClick={onBack}>
        Voltar à lista
      </button>
    </Panel>
  );
}
