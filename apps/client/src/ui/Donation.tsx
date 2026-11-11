import { useEffect } from "react";

import { questState } from "@vila/shared/game/quests";
import { questsEnabled } from "../game/questsFlag";
import { useVila } from "../game/store";
import { Panel, Status } from "./Panel";

/**
 * Global donation (P01; DEC-010..013, DEC-026). The recipient is shown before any payment.
 * With no contracted partner (PEN-004) no button may pretend to complete a donation (IMPL-0002).
 * The reading quest (PROPOSTA quests-v1) advances only through the explicit "Entendi" button:
 * opening the panel, scrolling or dwell time never records anything.
 */
export function Donation() {
  const record = useVila((s) => s.record);
  const notify = useVila((s) => s.notify);
  const progress = useVila((s) => s.progress);
  useEffect(() => record("causes-global-donation", "panel"), [record]);
  const reading = questsEnabled() ? questState(progress, "donation-promise-reading") : "locked";
  return (
    <Panel kicker="Praça da Vila" title="Doação global">
      <p className="lead">Doar sem escolher uma ONG específica.</p>
      <dl className="facts">
        <dt>Destinatário</dt>
        <dd>
          Instituição parceira: <strong>a definir</strong> <Status>Pendente</Status>
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
      <button className="btn btn--primary" disabled aria-describedby="don-note">
        Doar
      </button>
      <p className="note" id="don-note">
        Doações ficam disponíveis após a definição e o contrato da instituição parceira.
      </p>
    </Panel>
  );
}
