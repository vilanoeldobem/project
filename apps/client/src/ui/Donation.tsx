import { useEffect, useState } from "react";

import { questState } from "@vila/shared/game/quests";
import { useQuestsEnabled } from "../game/questsFlag";
import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { fetchGlobalDonationConfig, type DonationConfig } from "../lib/api";
import { PixDonation } from "./PixDonation";
import { Panel, Status } from "./Panel";

/**
 * Global donation (P01; DEC-010..013, DEC-026). The recipient is shown before any payment.
 * With no contracted partner (PEN-004) no button may pretend to complete a donation (IMPL-0002). With the
 * donations flag on and the partner configured (IMPL-0022, PROPOSTA), the panel offers a Pix through AbacatePay,
 * always naming the single partner institution; it is never split among the Vila's NGOs.
 * The reading quest (PROPOSTA quests-v1) advances only through the explicit "Entendi" button:
 * opening the panel, scrolling or dwell time never records anything.
 */
export function Donation() {
  const record = useVila((s) => s.record);
  const notify = useVila((s) => s.notify);
  const progress = useVila((s) => s.progress);
  const donations = useAccount((s) => s.donations);
  /** `undefined` while loading, `null` when the read failed. */
  const [config, setConfig] = useState<DonationConfig | null | undefined>(undefined);
  useEffect(() => record("causes-global-donation", "panel"), [record]);
  useEffect(() => {
    if (!donations) return;
    let live = true;
    fetchGlobalDonationConfig().then((result) => live && setConfig(result));
    return () => {
      live = false;
    };
  }, [donations]);
  const reading = useQuestsEnabled() ? questState(progress, "donation-promise-reading") : "locked";
  const global = config?.global;
  return (
    <Panel kicker="Praça da Vila" title="Doação global">
      <p className="lead">Doar sem escolher uma ONG específica.</p>
      <dl className="facts">
        <dt>Destinatário</dt>
        <dd>
          {global?.enabled && global.recipientName ? (
            <>
              Instituição parceira: <strong>{global.recipientName}</strong>
            </>
          ) : (
            <>
              Instituição parceira: <strong>a definir</strong> <Status>Pendente</Status>
            </>
          )}
        </dd>
        <dt>Destinação</dt>
        <dd>A parceira decide a destinação conforme seus programas.</dd>
      </dl>
      <h3>Entender a doação</h3>
      <ul className="bullets">
        <li>A doação global vai para uma única instituição filantrópica independente — não é dividida entre as ONGs da Vila.</li>
        <li>Para apoiar uma organização específica, visite a casa dela na Vila e use “Doar para esta ONG”.</li>
        <li>Jogar é gratuito e nunca é uma doação.</li>
      </ul>
      {reading === "active" && (
        <button
          className="btn btn--primary"
          onClick={() => {
            record("donation-promise-reading", "read-confirm");
            notify("Você leu a promessa da doação global.");
          }}
        >
          Entendi, li a promessa
        </button>
      )}
      {reading === "ready_to_turn_in" && (
        <p className="lead" role="status">
          Agora procure Dona Guida.
        </p>
      )}
      {donations && config === undefined && <p className="note">Carregando a doação global…</p>}
      {donations && global?.enabled && (
        <PixDonation
          targetKind="global"
          recipientName={global.recipientName ?? "Instituição parceira"}
          ngoPercentBps={global.ngoPercentBps}
          fixedFeeCents={global.fixedFeeCents}
          minAmountCents={global.minAmountCents}
        />
      )}
      {(!donations || (config !== undefined && !global?.enabled)) && (
        <>
          <button className="btn btn--primary" disabled aria-describedby="don-note">
            Doar
          </button>
          <p className="note" id="don-note">
            {donations
              ? "A instituição parceira ainda não foi configurada para receber doações."
              : "Doações ficam disponíveis após a definição e o contrato da instituição parceira."}
          </p>
        </>
      )}
    </Panel>
  );
}
