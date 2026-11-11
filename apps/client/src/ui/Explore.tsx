import { useVila } from "../game/store";
import { LOTS } from "@vila/shared/game/world";
import type { LotInfo, LotState } from "../lib/api";
import { Panel } from "./Panel";

const STATE_LABEL: Record<LotState, string> = {
  available: "Terreno disponível",
  application_sent: "Candidatura enviada",
  under_review: "Em análise",
  published: "Casa publicada",
};

/** Lots around the plaza; "Ir até lá" walks the avatar there. */
export function Explore({ lots }: { lots: Record<string, LotInfo> }) {
  const { setTarget, close, open } = useVila.getState();
  const published = LOTS.filter((l) => lots[l.id]?.state === "published").length;
  return (
    <Panel kicker="Explorar" title="ONGs da Vila">
      <p className="lead">
        {published === 0
          ? "Nenhuma ONG publicada ainda. Os terrenos estão abertos para organizações aprovadas."
          : `${published} ${published === 1 ? "casa publicada" : "casas publicadas"} na praça.`}
      </p>
      <ul className="lot-list">
        {LOTS.map((l) => {
          const info = lots[l.id];
          return (
            <li key={l.id}>
              <span>
                <strong>{info?.state === "published" && info.ngo_name ? info.ngo_name : `Terreno ${l.slot}`}</strong>
                <small>{STATE_LABEL[info?.state ?? "available"]}</small>
              </span>
              <div className="lot-list__actions">
              <button className="btn btn--small" onClick={() => open({ kind: "lot", lotId: l.id })}>Ver terreno</button>
              <button
                className="btn btn--small"
                onClick={() => {
                  setTarget({ x: l.x * 0.82, z: l.z * 0.82 });
                  close();
                }}
              >
                Ir até lá
              </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
