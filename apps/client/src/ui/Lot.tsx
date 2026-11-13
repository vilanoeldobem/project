import { useEffect } from "react";

import { questState } from "@vila/shared/game/quests";
import { questsEnabled } from "../game/questsFlag";
import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { fetchLogo, type LotInfo } from "../lib/api";
import { BlobImage } from "./BlobImage";
import { LotModeration, useLotModerating } from "./LotModeration";
import { Panel, Status } from "./Panel";

/**
 * Lot / NGO house (P03, DEC-028) and NGO HUD (P04, DEC-029). An administrator in moderation mode also gets the
 * moderation actions of the house (IMPL-0021, `LotModeration`); `onChanged` reads the lots again after one.
 * `unlisted`: the API answered its lots and this one is not among them (a database before migration 0011, which
 * adds the lots of the expanded village, IMPL-0023): the lot is drawn, but it cannot take an application yet.
 */
export function Lot({ lotId, info, unlisted = false, onChanged = () => {} }: { lotId: string; info?: LotInfo; unlisted?: boolean; onChanged?: () => void }) {
  const record = useVila((s) => s.record);
  const open = useVila((s) => s.open);
  useEffect(() => record("causes-visit-lot", lotId), [record, lotId]);
  // newest-house-visit (PROPOSTA quests-v1): only a published house with a real NGO counts.
  useEffect(() => {
    if (!questsEnabled() || info?.state !== "published" || !info.ngo_name) return;
    if (questState(useVila.getState().progress, "newest-house-visit") !== "active") return;
    useVila.getState().record("newest-house-visit", lotId);
    useVila.getState().notify("Visita registrada! Leve a notícia a Dona Guida.");
  }, [info?.state, info?.ngo_name, lotId]);
  const n = Number(lotId.split("-")[1]);
  const accounts = useAccount((s) => s.enabled);
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
            <button className="btn btn--primary" disabled>
              Doar para esta ONG
            </button>
            <p className="note">Pagamento ainda não habilitado (PEN-006).</p>
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
      {unlisted ? (
        <p className="note">Este terreno ainda não recebe candidaturas.</p>
      ) : accounts ? (
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
