import { useEffect, useState } from "react";

import { errorText } from "@vila/shared/accounts/errors";
import { formatBrl } from "@vila/shared/donations/contract";
import { questState } from "@vila/shared/game/quests";
import { questsEnabled } from "../game/questsFlag";
import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { fetchLogo, fetchNgoDonationInfo, recordDonationRedirect, type LotInfo, type NgoDonationInfo } from "../lib/api";
import { UNLISTED_LABEL } from "../lib/lots";
import { BlobImage } from "./BlobImage";
import { LotModeration, useLotModerating } from "./LotModeration";
import { Panel, Status } from "./Panel";
import { PixDonation } from "./PixDonation";

/**
 * Lot / NGO house (P03, DEC-028) and NGO HUD (P04, DEC-029). An administrator in moderation mode also gets the
 * moderation actions of the house (IMPL-0021, `LotModeration`); `onChanged` reads the lots again after one.
 *
 * Donations (IMPL-0023; PROPOSTA, only when `/config` says `donations`): a published house offers the NGO's own
 * Pix (AbacatePay sub-account) or its validated payment page. A redirected payment happens outside the Vila and
 * credits nothing by itself; the note says so. With the flag off the honest disabled state stays (IMPL-0002).
 *
 * `unlisted`: the API answered its lots and this one is not among them (`lib/lots.ts`): the lot is drawn, but
 * it cannot take an application yet. Its panel says it is being prepared, with no invitation to apply, and the
 * visit is not recorded as progress.
 */
export function Lot({ lotId, info, unlisted = false, onChanged = () => {} }: { lotId: string; info?: LotInfo; unlisted?: boolean; onChanged?: () => void }) {
  const record = useVila((s) => s.record);
  const open = useVila((s) => s.open);
  useEffect(() => {
    if (!unlisted) record("causes-visit-lot", lotId);
  }, [record, lotId, unlisted]);
  // newest-house-visit (PROPOSTA quests-v1): only a published house with a real NGO counts.
  useEffect(() => {
    if (!questsEnabled() || info?.state !== "published" || !info.ngo_name) return;
    if (questState(useVila.getState().progress, "newest-house-visit") !== "active") return;
    useVila.getState().record("newest-house-visit", lotId);
    useVila.getState().notify("Visita registrada! Leve a notícia a Dona Guida.");
  }, [info?.state, info?.ngo_name, lotId]);
  const n = Number(lotId.split("-")[1]);
  const accounts = useAccount((s) => s.enabled);
  const donations = useAccount((s) => s.donations);
  const ngoId = info?.state === "published" ? (info.ngo_id ?? null) : null;
  /** `undefined` while loading, `null` when the read failed. */
  const [donationInfo, setDonationInfo] = useState<NgoDonationInfo | null | undefined>(undefined);
  const [donationError, setDonationError] = useState("");
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    // Another house reuses this component: never show the previous NGO's name, split or stats while loading.
    setDonationInfo(undefined);
    setDonationError("");
    if (!donations || !ngoId) return;
    let live = true;
    fetchNgoDonationInfo(ngoId).then((result) => live && setDonationInfo(result));
    return () => {
      live = false;
    };
  }, [donations, ngoId]);

  /** The payment happens on the NGO's own page; the Vila only logs that it sent the visitor there. */
  const openExternal = async () => {
    if (!ngoId) return;
    setOpening(true);
    setDonationError("");
    try {
      const result = await recordDonationRedirect(ngoId);
      if (result?.url) window.open(result.url, "_blank", "noopener,noreferrer");
      else setDonationError("O link desta ONG não está disponível agora.");
    } catch (e) {
      setDonationError(errorText(e));
    } finally {
      setOpening(false);
    }
  };
  const moderation = useLotModerating();

  if (info?.state === "published" && info.ngo_name) {
    return (
      <Panel
        kicker={`Terreno ${n}`}
        title={info.ngo_name}
        // The NGO's public logo (IMPL-0017), when it has one and it loads.
        mark={info.ngo_logo ? <BlobImage className="logo panel__mark" source={info.ngo_logo} load={fetchLogo} alt={`Logo de ${info.ngo_name}`} /> : undefined}
        wide
        // The key changes when the moderation section leaves (role lost, mode off, signed out): the focus that
        // was in it goes back to the dialog.
        contentKey={moderation ? "published:moderation" : "published"}
      >
        <div className="ngo-hud">
          <section>
            <p>{info.ngo_summary}</p>
            <p className="note">Destinatário: esta ONG</p>
            {donations && ngoId ? (
              donationInfo === undefined ? (
                <p className="note">Carregando as doações desta ONG…</p>
              ) : donationInfo === null ? (
                <>
                  <button className="btn btn--primary" disabled>
                    Doar para esta ONG
                  </button>
                  <p className="note">Não foi possível carregar o recebimento desta ONG agora. Tente reabrir a casa.</p>
                </>
              ) : !donationInfo.enabled ? (
                <>
                  <button className="btn btn--primary" disabled>
                    Doar para esta ONG
                  </button>
                  <p className="note">O recebimento de doações desta casa ainda não foi configurado pela administração.</p>
                </>
              ) : donationInfo.method === "external_link" ? (
                <>
                  <DonationStats donations={donationInfo.confirmedDonations} cents={donationInfo.confirmedAmountCents} />
                  <button className="btn btn--primary" disabled={opening} onClick={() => void openExternal()}>
                    {opening ? "Abrindo…" : "Abrir página de pagamento da ONG"}
                  </button>
                  <p className="note">
                    O pagamento ocorre no meio próprio da ONG. Redirecionamentos não geram crédito automático de doação nem de Título sem
                    comprovação.
                  </p>
                </>
              ) : (
                <>
                  <DonationStats donations={donationInfo.confirmedDonations} cents={donationInfo.confirmedAmountCents} />
                  <PixDonation
                    targetKind="ngo"
                    ngoId={ngoId}
                    recipientName={donationInfo.name}
                    ngoPercentBps={donationInfo.ngoPercentBps}
                    fixedFeeCents={donationInfo.fixedFeeCents}
                    minAmountCents={donationInfo.minAmountCents}
                  />
                </>
              )
            ) : (
              <>
                <button className="btn btn--primary" disabled>
                  Doar para esta ONG
                </button>
                <p className="note">Pagamento ainda não habilitado (PEN-006).</p>
              </>
            )}
            {donationError && (
              <p className="form__error" role="alert">
                {donationError}
              </p>
            )}
          </section>
          <section>
            <button className="btn" onClick={() => open({ kind: "memory" })}>
              Jogar gratuitamente
            </button>
          </section>
        </div>
        {info.ngo_id && <LotModeration ngoId={info.ngo_id} name={info.ngo_name} onChanged={onChanged} />}
      </Panel>
    );
  }

  if (unlisted) {
    return (
      <Panel kicker={`Terreno ${n}`} title={UNLISTED_LABEL}>
        <p className="lead">Este terreno ainda não recebe candidaturas.</p>
        <p className="note">Os terrenos que já recebem candidaturas aparecem em “Explorar ONGs” como “Terreno disponível”.</p>
      </Panel>
    );
  }

  const inReview = info && info.state !== "available";
  return (
    // The key sends the focus back to the dialog when a withdrawal (IMPL-0021) takes the house off this panel.
    <Panel kicker={`Terreno ${n}`} title={inReview ? "Candidatura em análise" : "Sua ONG pode estar aqui"} contentKey={info?.state ?? "unknown"}>
      {inReview ? (
        <p>
          Casa ainda não publicada. <Status>Em análise</Status>
        </p>
      ) : (
        <p className="lead">Terreno disponível para uma organização social aprovada.</p>
      )}
      <h3>Critérios para participar</h3>
      <ol className="bullets">
        <li>CNPJ ativo.</li>
        <li>Pelo menos 1 ano de existência.</li>
        <li>Meio confiável de confirmar os valores destinados à organização.</li>
      </ol>
      <p>Toda candidatura passa por análise da administração. Só a aprovação publica a casa na Vila.</p>
      {accounts ? (
        <button className="btn btn--primary" disabled={Boolean(inReview)} onClick={() => open({ kind: "ngo", lotId })}>
          Candidatar minha ONG
        </button>
      ) : (
        <>
          <button className="btn" disabled>
            Conheça o cadastro
          </button>
          <p className="note">O cadastro de ONGs abre em breve.</p>
        </>
      )}
    </Panel>
  );
}

/** Paid donations of a house, as the public donation route reports them: no donor data, no invented numbers. */
function DonationStats({ donations, cents }: { donations: number; cents: number }) {
  return (
    <p className="note" data-donation-stats>
      {donations === 0 ? "Nenhuma doação confirmada ainda." : `${donations} ${donations === 1 ? "doação confirmada" : "doações confirmadas"} · ${formatBrl(cents)}.`}
    </p>
  );
}
