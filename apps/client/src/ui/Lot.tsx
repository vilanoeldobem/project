import { useEffect } from "react";

import { useVila } from "../game/store";
import type { LotInfo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Panel, Status } from "./Panel";

/** Lot / NGO house (P03, DEC-028) and NGO HUD (P04, DEC-029). */
export function Lot({ lotId, info }: { lotId: string; info?: LotInfo }) {
  const record = useVila((s) => s.record);
  const open = useVila((s) => s.open);
  const available = useAuth((s) => s.available);
  useEffect(() => record("causes-visit-lot", lotId), [record, lotId]);
  const n = Number(lotId.split("-")[1]);

  if (info?.state === "published" && info.ngo_name) {
    return (
      <Panel kicker={`Terreno ${n}`} title={info.ngo_name} wide>
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
      </Panel>
    );
  }

  const inReview = info && info.state !== "available";
  return (
    <Panel kicker={`Terreno ${n}`} title={inReview ? "Candidatura em análise" : "Sua ONG pode estar aqui"}>
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
      {available && !inReview ? <>
        <button className="btn" onClick={() => open({ kind: "ngo-applications", lotId })}>Candidatar minha ONG</button>
        <p className="note">Teste local: o envio não reserva o terreno. Documentos e responsáveis ainda serão definidos.</p>
      </> : <p className="note">O cadastro público de ONGs abre em breve.</p>}
    </Panel>
  );
}
