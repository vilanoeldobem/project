/**
 * Pix donation flow shared by the global panel and an NGO's house (IMPL-0022; PROPOSTA, only mounted when the API
 * says `donations`). The recipient and both parts of the split are shown before any payment; the QR Code comes
 * from AbacatePay. A sandbox charge (`devMode`) offers the provider's simulation button, never in production.
 *
 * Nothing here completes a payment by itself: the donation is confirmed by the provider (webhook or status
 * check), and a visitor's donation never credits a Título because it has no account to credit.
 */
import { useState } from "react";

import { errorText } from "@vila/shared/accounts/errors";
import { computeDonationSplit, formatBrl, parseBrlToCents, type DonationTargetKind } from "@vila/shared/donations/contract";

import { useAccount } from "../lib/account";
import { createPixDonation, fetchDonationStatus, simulatePixDonation, type Donation } from "../lib/api";

const PRESETS = [200, 500, 1000, 2500];
const STATUS_TEXT: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pagamento confirmado",
  refunded: "Doação estornada",
  under_dispute: "Pagamento em disputa",
  expired: "Código expirado",
  cancelled: "Doação cancelada",
};

export function PixDonation({
  targetKind,
  ngoId,
  recipientName,
  ngoPercentBps,
  fixedFeeCents,
  minAmountCents,
}: {
  targetKind: DonationTargetKind;
  ngoId?: string;
  recipientName: string;
  ngoPercentBps: number;
  fixedFeeCents: number;
  minAmountCents: number;
}) {
  const user = useAccount((s) => s.user);
  const [preset, setPreset] = useState(minAmountCents);
  const [custom, setCustom] = useState("");
  const [donation, setDonation] = useState<Donation | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const amountCents = custom.trim() ? (parseBrlToCents(custom) ?? Number.NaN) : preset;
  const split = (() => {
    try {
      return computeDonationSplit(amountCents, { ngoPercentBps, fixedFeeCents });
    } catch {
      return null;
    }
  })();
  const percent = (ngoPercentBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const qrSrc = donation?.brCodeBase64 ? (donation.brCodeBase64.startsWith("data:") ? donation.brCodeBase64 : `data:image/png;base64,${donation.brCodeBase64}`) : "";

  const generate = async () => {
    setError("");
    setCopied(false);
    if (!split) {
      setError(`Informe um valor a partir de ${formatBrl(minAmountCents)}.`);
      return;
    }
    setBusy(true);
    try {
      const created = await createPixDonation({ targetKind, ...(ngoId ? { ngoId } : {}), amountCents });
      setDonation(created.donation);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!donation) return;
    setChecking(true);
    setError("");
    try {
      const result = await fetchDonationStatus(donation.id, true);
      if (!result) setError("Não foi possível consultar o pagamento agora. Tente de novo em instantes.");
      else setDonation(result.donation);
    } finally {
      setChecking(false);
    }
  };

  const simulate = async () => {
    if (!donation) return;
    setChecking(true);
    setError("");
    try {
      const result = await simulatePixDonation(donation.id);
      setDonation(result.donation);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setChecking(false);
    }
  };

  const copy = async () => {
    if (!donation?.brCode) return;
    try {
      await navigator.clipboard.writeText(donation.brCode);
      setCopied(true);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o código abaixo.");
    }
  };

  if (donation) {
    return (
      <section className="donation-pix" data-donation-status={donation.status}>
        <p className="lead">
          Doação de <strong>{formatBrl(donation.amountCents)}</strong> para <strong>{donation.recipientName}</strong>.
        </p>
        <p>
          <span className="status">{STATUS_TEXT[donation.status] ?? donation.status}</span>
        </p>
        {donation.status === "pending" && (
          <>
            {qrSrc ? <img className="donation-pix__qr" src={qrSrc} alt="QR Code Pix da doação" width={220} height={220} /> : <p className="note">O QR Code não chegou nesta resposta.</p>}
            {donation.brCode && (
              <>
                <p className="note">Ou use o Pix copia e cola:</p>
                <code className="donation-pix__code">{donation.brCode}</code>
                <div className="actions">
                  <button className="btn btn--small" onClick={() => void copy()}>
                    {copied ? "Código copiado" : "Copiar código Pix"}
                  </button>
                </div>
              </>
            )}
            {donation.expiresAt && <p className="note">Este código vale até {new Date(donation.expiresAt).toLocaleString("pt-BR")}.</p>}
            <p className="note">A doação só é confirmada quando o provedor avisa o pagamento. Jogar continua gratuito.</p>
            <div className="actions">
              <button className="btn btn--primary" disabled={checking} onClick={() => void refresh()}>
                {checking ? "Consultando…" : "Verificar pagamento"}
              </button>
              {donation.devMode && (
                <button className="btn" disabled={checking} onClick={() => void simulate()}>
                  Simular confirmação (Sandbox AbacatePay)
                </button>
              )}
            </div>
          </>
        )}
        {donation.status === "paid" && (
          <div className="callout" role="status">
            <strong>Pagamento confirmado</strong>
            <p>Obrigado! A doação entrou nos indicadores verificados da Vila.</p>
            {donation.titleCredited && <p className="note">Esta doação foi creditada uma única vez ao seu Título de Doação (DEC-041).</p>}
            {!user && <p className="note">Doações de visitantes não geram Título: entre na sua conta antes de doar para recebê-lo.</p>}
            {donation.receiptUrl && (
              <p>
                <a href={donation.receiptUrl} target="_blank" rel="noopener noreferrer">
                  Ver comprovante
                </a>
              </p>
            )}
            {donation.titleCredited && <p className="note">Cada doação confirmada conta uma única vez e não concede XP de missão (DEC-042).</p>}
          </div>
        )}
        {(donation.status === "refunded" || donation.status === "under_dispute" || donation.status === "expired" || donation.status === "cancelled") && (
          <p className="note">Esta doação não está confirmada. Se você pagou, verifique o pagamento com o provedor antes de tentar de novo.</p>
        )}
        {error && (
          <p className="form__error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="donation-pix">
      <dl className="facts">
        <dt>Destinatário</dt>
        <dd>{recipientName}</dd>
        <dt>{targetKind === "global" ? "Parcela da instituição parceira" : "Parcela da ONG"} ({percent}% − {formatBrl(fixedFeeCents)})</dt>
        <dd>{split ? formatBrl(split.ngoShareCents) : "—"}</dd>
        <dt>Parcela da Vila / taxa operacional</dt>
        <dd>{split ? formatBrl(split.vilaShareCents) : "—"}</dd>
        <dt>Total da doação</dt>
        <dd>{split ? formatBrl(split.amountCents) : "Informe um valor válido"}</dd>
      </dl>
      <fieldset className="checks">
        <legend>Valor da doação (mínimo {formatBrl(minAmountCents)})</legend>
        <div className="look__options">
          {PRESETS.filter((cents) => cents >= minAmountCents).map((cents) => (
            <button
              key={cents}
              type="button"
              className={`btn btn--chip${!custom.trim() && preset === cents ? " is-on" : ""}`}
              aria-pressed={!custom.trim() && preset === cents}
              onClick={() => {
                setPreset(cents);
                setCustom("");
              }}
            >
              {formatBrl(cents)}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field__label">Outro valor (R$) — opcional, a partir de {formatBrl(minAmountCents)}</span>
          <input inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0,00" />
        </label>
      </fieldset>
      {!split && <p className="note">O valor precisa ser pelo menos {formatBrl(minAmountCents)}.</p>}
      <div className="actions">
        <button className="btn btn--primary" disabled={busy || !split} onClick={() => void generate()}>
          {busy ? "Gerando Pix…" : "Gerar Pix de doação"}
        </button>
      </div>
      {error && (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}
      <p className="note">A Vila não guarda seu nome ou e-mail na doação. Jogar é gratuito e nunca é uma doação.</p>
    </section>
  );
}
