/**
 * Donations in the backoffice (IMPL-0021; PROPOSTA, only when `/config` says `donations`). Flat HTML, every
 * mutation named with the admin account on screen. Three jobs: configure the global donation (partner institution
 * and split), confirm how one NGO receives donations, and record a donation that an NGO received on its own page
 * after an admin checked the proof. The last one counts in the public indicators but grants no Título.
 *
 * No number on this screen is invented: values come from the API, and an empty history says so.
 */
import { useCallback, useEffect, useState } from "react";

import type { NgoPayment } from "@vila/shared/accounts/contract";
import { ApiError, errorText } from "@vila/shared/accounts/errors";
import { computeDonationSplit, formatBrl, validateExternalDonationUrl } from "@vila/shared/donations/contract";

import type { DonationOverview, DonationRow, NgoPaymentRow } from "../lib/api";
import { dateTime } from "../lib/format";
import { api } from "../lib/services";
import { DataTable, Field, Live, Status } from "./common";

const STATUS_TEXT: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Confirmada",
  refunded: "Estornada",
  under_dispute: "Em disputa",
  expired: "Expirada",
  cancelled: "Cancelada",
};
const TARGET_TEXT: Record<string, string> = { global: "Doação global", ngo: "ONG" };

/** Cents preview of the R$ 2,00 minimum, or the pt-BR reason the numbers do not close. */
function previewOf(percent: string, fee: string): { ngo: string; vila: string } | { error: string } {
  const bps = Math.round(Number(percent) * 100);
  const fixedFeeCents = Math.round(Number(fee));
  try {
    const split = computeDonationSplit(200, { ngoPercentBps: bps, fixedFeeCents });
    return { ngo: formatBrl(split.ngoShareCents), vila: formatBrl(split.vilaShareCents) };
  } catch (error) {
    return { error: error instanceof RangeError ? error.message : "Confira a porcentagem e a taxa fixa." };
  }
}

function fieldErrorsOf(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}

export function DonationsAdmin({ accountId }: { accountId: string }) {
  const [overview, setOverview] = useState<DonationOverview | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    let live = true;
    setError("");
    api.donationOverview().then(
      (data) => live && setOverview(data),
      (e) => live && setError(errorText(e))
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(load, [load]);
  return (
    <>
      <h2>Doações e AbacatePay (PROPOSTA)</h2>
      <p className="lead">
        Painel de uma funcionalidade ainda não aprovada em produção (<code>DONATIONS_ENABLED</code>): as decisões sobre parceira, provedor e Título
        seguem pendentes (PEN-004, PEN-006, PEN-026). Nenhum valor aparece sem ter passado pelo provedor ou por uma conferência administrativa.
      </p>
      <Live loading={overview === null} error={error} onRetry={load}>
        {overview && (
          <>
            <GlobalSettings settings={overview.settings} accountId={accountId} onSaved={load} />
            <NgoPaymentList rows={overview.ngos} />
            <ExternalProof rows={overview.ngos} accountId={accountId} onSaved={load} />
            <DonationHistory donations={overview.recentDonations} redirects={overview.recentRedirects} />
          </>
        )}
      </Live>
    </>
  );
}

function GlobalSettings({ settings, accountId, onSaved }: { settings: DonationOverview["settings"]; accountId: string; onSaved: () => void }) {
  const [name, setName] = useState(settings.primaryNgoName ?? "");
  const [cnpj, setCnpj] = useState(settings.primaryNgoCnpj ?? "");
  const [percent, setPercent] = useState(String(settings.ngoPercentBps / 100));
  const [fee, setFee] = useState(String(settings.fixedFeeCents));
  const [subAccountId, setSubAccountId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = previewOf(percent, fee);
  const save = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      await api.saveDonationSettings({
        accountId,
        primaryNgoName: name,
        primaryNgoCnpj: cnpj,
        ngoPercentBps: Math.round(Number(percent) * 100),
        fixedFeeCents: Math.round(Number(fee)),
        ...(subAccountId.trim() ? { subAccountId: subAccountId.trim() } : {}),
      });
      setMessage("Configuração da doação global salva.");
      setSubAccountId("");
      onSaved();
    } catch (e) {
      setErrors(fieldErrorsOf(e));
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-action="global-donation">
      <h3>Doação global: instituição parceira e split padrão</h3>
      <p className="muted">
        A doação global vai para uma única instituição parceira (DEC-010..013). O CNPJ cria a subconta na AbacatePay quando ela ainda não existe e
        nunca aparece em tela pública.
      </p>
      <Field label="Nome público da instituição parceira" error={errors.primaryNgoName}>
        <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="CNPJ da instituição (somente números)" error={errors.primaryNgoCnpj} hint="Usado para criar ou localizar a subconta.">
        <input value={cnpj} inputMode="numeric" maxLength={18} onChange={(e) => setCnpj(e.target.value)} />
      </Field>
      <Field label="Percentual destinado à ONG (%)" error={errors.ngoPercentBps} hint="De 1% a 100%, em centésimos de ponto percentual.">
        <input value={percent} inputMode="decimal" onChange={(e) => setPercent(e.target.value)} />
      </Field>
      <Field label="Taxa fixa retida pela Vila (centavos)" error={errors.fixedFeeCents} hint="De 80 a 190 centavos (R$ 0,80 a R$ 1,90).">
        <input value={fee} inputMode="numeric" onChange={(e) => setFee(e.target.value)} />
      </Field>
      <Field label="ID da subconta (opcional)" error={errors.subAccountId} hint="Preencha só se a subconta já existe na AbacatePay; sem isso, ela é criada pelo CNPJ.">
        <input value={subAccountId} maxLength={80} onChange={(e) => setSubAccountId(e.target.value)} placeholder="sacc_…" />
      </Field>
      {"error" in preview ? (
        <p className="field__error" role="alert">
          {preview.error}
        </p>
      ) : (
        <p className="muted" data-preview="split">
          Em uma doação de {formatBrl(200)}: parcela da ONG {preview.ngo} · parcela da Vila {preview.vila}.
        </p>
      )}
      <div className="actions">
        <button className="btn btn--primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Salvando…" : "Salvar e vincular subconta primária"}
        </button>
      </div>
      <div aria-live="polite">{message && <p role="status">{message}</p>}</div>
      <p className="muted">
        A API nunca mostra o token do provedor. Com <code>ABACATEPAY_API_KEY</code> de sandbox, a subconta local <code>dev_sacc_…</code> é usada
        enquanto a AbacatePay não habilita subcontas naquela conta; o split continua registrado no banco.
      </p>
    </section>
  );
}

function NgoPaymentList({ rows }: { rows: NgoPaymentRow[] }) {
  const withConfig = rows.filter((r) => r.payment_method !== null || r.status === "published");
  return (
    <section data-action="ngo-payments">
      <h3>Como cada ONG recebe</h3>
      {withConfig.length === 0 ? (
        <p className="muted" data-state="empty">
          Nenhuma ONG publicada ainda.
        </p>
      ) : (
        <DataTable
          caption="Forma de recebimento por ONG"
          columns={["ONG", "Situação", "Recebimento", "Split na doação mínima"]}
          rows={withConfig.map((r) => {
            const percent = r.ngo_percent_bps == null ? null : String(r.ngo_percent_bps / 100);
            const fee = r.fixed_fee_cents == null ? null : String(r.fixed_fee_cents);
            const preview = percent && fee ? previewOf(percent, fee) : null;
            return {
              key: r.id,
              cells: [
                <a href={`#/applications/${r.id}`}>{r.name}</a>,
                <Status code={r.status}>{r.status === "published" ? "Publicada" : r.status}</Status>,
                r.payment_method === "external_link"
                  ? r.link_validated
                    ? "Link próprio conferido"
                    : "Link próprio (não conferido)"
                  : r.sub_account_id
                    ? "Subconta AbacatePay"
                    : "Não configurado",
                preview && "ngo" in preview ? `ONG ${preview.ngo} · Vila ${preview.vila}` : "—",
              ],
            };
          })}
        />
      )}
      <p className="muted">A configuração de cada ONG fica na análise da candidatura, em Candidaturas.</p>
    </section>
  );
}

function ExternalProof({ rows, accountId, onSaved }: { rows: NgoPaymentRow[]; accountId: string; onSaved: () => void }) {
  const published = rows.filter((r) => r.status === "published");
  const [ngoId, setNgoId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      await api.registerExternalProof({
        accountId,
        ngoId: ngoId || published[0]?.id || "",
        amountCents: Math.round(Number(amount) * 100),
        proofReference: reference,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setMessage("Doação externa comprovada registrada nos indicadores.");
      setAmount("");
      setReference("");
      setNote("");
      onSaved();
    } catch (e) {
      setErrors(fieldErrorsOf(e));
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-action="external-proof">
      <h3>Registrar doação externa comprovada</h3>
      <p className="muted">
        Para quando a organização recebeu a doação no próprio meio de pagamento e a administração conferiu o comprovante. A doação comprovada entra
        nos indicadores verificados; a regra do Título para links externos segue pendente, então ela não credita Título.
      </p>
      {published.length === 0 ? (
        <p className="muted" data-state="empty">
          Nenhuma ONG publicada para registrar uma doação.
        </p>
      ) : (
        <>
          <Field label="ONG" error={errors.ngoId}>
            <select value={ngoId} onChange={(e) => setNgoId(e.target.value)}>
              {published.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor comprovado (R$)" error={errors.amountCents} hint="Mínimo de R$ 2,00.">
            <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </Field>
          <Field label="Referência do comprovante" error={errors.proofReference} hint="Identificação que permite conferir o comprovante depois.">
            <input value={reference} maxLength={200} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Observação (opcional)" error={errors.note}>
            <textarea value={note} rows={2} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="actions">
            <button className="btn btn--primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Registrando…" : "Registrar doação comprovada"}
            </button>
          </div>
        </>
      )}
      <div aria-live="polite">{message && <p role="status">{message}</p>}</div>
    </section>
  );
}

const donationRows = (rows: DonationRow[]) => rows.map((d) => ({
  key: d.id,
  cells: [
    <Status code={d.status}>{STATUS_TEXT[d.status] ?? d.status}</Status>,
    `${TARGET_TEXT[d.targetKind] ?? d.targetKind} · ${d.recipientName}`,
    formatBrl(d.amountCents),
    formatBrl(d.ngoShareCents),
    formatBrl(d.vilaShareCents),
    d.titleCredited ? "Creditada uma vez" : "Sem crédito de Título",
    dateTime(d.createdAt),
  ],
}));

function DonationHistory({ donations, redirects }: { donations: DonationRow[]; redirects: DonationOverview["recentRedirects"] }) {
  return (
    <section data-action="donation-history">
      <h3>Histórico de doações e redirecionamentos</h3>
      {donations.length === 0 ? (
        <p className="muted" data-state="empty">
          Nenhuma doação registrada.
        </p>
      ) : (
        <DataTable caption="Doações recentes" columns={["Situação", "Destino", "Valor", "Parcela da ONG", "Parcela da Vila", "Título", "Quando"]} rows={donationRows(donations)} />
      )}
      <h4>Redirecionamentos para links próprios</h4>
      {redirects.length === 0 ? (
        <p className="muted" data-state="empty">
          Nenhum redirecionamento registrado.
        </p>
      ) : (
        <DataTable
          caption="Redirecionamentos recentes"
          columns={["ONG", "Quando"]}
          rows={redirects.map((r) => ({ key: r.id, cells: [r.ngo_name ?? r.ngo_id, dateTime(r.created_at)] }))}
        />
      )}
      <p className="muted">Um redirecionamento não é uma doação: ele só é registrado, nunca conta em indicador nem em Título.</p>
    </section>
  );
}

/**
 * The payment configuration of one NGO, inside its application review. `requested` is what the organisation asked
 * for; the admin may change it, but an external link only becomes active after it is opened and ticked.
 */
export function NgoPaymentConfig({
  ngoId,
  accountId,
  requested,
  payment,
  onSaved,
}: {
  ngoId: string;
  accountId?: string;
  requested?: { method?: string; donationUrl?: string };
  payment?: NgoPayment;
  onSaved?: (payment: NgoPayment | null) => void;
}) {
  const [method, setMethod] = useState<"abacatepay" | "external_link">(payment?.method ?? (requested?.method === "external_link" ? "external_link" : "abacatepay"));
  const [url, setUrl] = useState(payment?.donationUrl ?? requested?.donationUrl ?? "");
  const [validated, setValidated] = useState(payment?.linkValidated ?? false);
  const [percent, setPercent] = useState(String((payment?.ngoPercentBps ?? 9500) / 100));
  const [fee, setFee] = useState(String(payment?.fixedFeeCents ?? 80));
  const [subAccountId, setSubAccountId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = previewOf(percent, fee);
  const link = validateExternalDonationUrl(url);
  const save = async () => {
    if (!accountId) return;
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      const saved = await api.saveNgoPayment(ngoId, {
        accountId,
        paymentMethod: method,
        ...(method === "external_link" ? { donationUrl: url, linkValidated: validated } : {}),
        ngoPercentBps: Math.round(Number(percent) * 100),
        fixedFeeCents: Math.round(Number(fee)),
        ...(method === "abacatepay" && subAccountId.trim() ? { subAccountId: subAccountId.trim() } : {}),
      });
      setMessage("Configuração de pagamento salva.");
      setSubAccountId("");
      onSaved?.(saved.payment);
    } catch (e) {
      setErrors(fieldErrorsOf(e));
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-action="payment-config">
      <h2>Recebimento de doações (PROPOSTA)</h2>
      <p className="muted">
        Pedido na candidatura:{" "}
        {requested?.method === "external_link" ? `link próprio${requested.donationUrl ? ` (${requested.donationUrl})` : ""}` : "AbacatePay (subconta Pix)"}. A
        casa só recebe doações depois desta configuração.
      </p>
      <Field label="Forma de recebimento">
        <select value={method} onChange={(e) => setMethod(e.target.value === "external_link" ? "external_link" : "abacatepay")}>
          <option value="abacatepay">AbacatePay (subconta Pix pelo CNPJ)</option>
          <option value="external_link">Link próprio de pagamento (HTTPS)</option>
        </select>
      </Field>
      {method === "external_link" ? (
        <>
          <Field label="Link de doação da organização" error={errors.donationUrl ?? (url && !link.url ? link.error : undefined)} hint="HTTPS público da própria organização.">
            <input value={url} maxLength={500} onChange={(e) => { setUrl(e.target.value); setValidated(false); }} placeholder="https://ong.org.br/doar" />
          </Field>
          <label className="check">
            <input type="checkbox" checked={validated} onChange={(e) => setValidated(e.target.checked)} />
            Link HTTPS conferido e válido
          </label>
          {errors.linkValidated && <p className="field__error" role="alert">{errors.linkValidated}</p>}
        </>
      ) : (
        <Field label="ID da subconta (opcional)" error={errors.subAccountId} hint="Sem ele, a subconta é criada/localizada pelo CNPJ da ONG.">
          <input value={subAccountId} maxLength={80} onChange={(e) => setSubAccountId(e.target.value)} placeholder="sacc_…" />
        </Field>
      )}
      <Field label="Percentual destinado à ONG (%)" error={errors.ngoPercentBps}>
        <input value={percent} inputMode="decimal" onChange={(e) => setPercent(e.target.value)} />
      </Field>
      <Field label="Taxa fixa retida pela Vila (centavos)" error={errors.fixedFeeCents}>
        <input value={fee} inputMode="numeric" onChange={(e) => setFee(e.target.value)} />
      </Field>
      {"error" in preview ? (
        <p className="field__error" role="alert">
          {preview.error}
        </p>
      ) : (
        <p className="muted" data-preview="split">
          Em uma doação de {formatBrl(200)}: parcela da ONG {preview.ngo} · parcela da Vila {preview.vila}.
        </p>
      )}
      <div className="actions">
        <button className="btn btn--primary" disabled={busy || !accountId} onClick={() => void save()}>
          {busy ? "Salvando…" : "Salvar configuração de pagamento"}
        </button>
      </div>
      {!accountId && <p className="muted">Entre como administrador para salvar.</p>}
      <div aria-live="polite">{message && <p role="status">{message}</p>}</div>
    </section>
  );
}
