import { useVila } from "../game/store";
import { lotFront, LOTS } from "@vila/shared/game/world";
import type { LotInfo, LotState } from "../lib/api";
import { Panel } from "./Panel";

const STATE_LABEL: Record<LotState, string> = {
  available: "Terreno disponível",
  application_sent: "Candidatura enviada",
  under_review: "Em análise",
  published: "Casa publicada",
};

/**
 * Lots around the square; "Ir até lá" walks the avatar to the front of the lot. A lot the API answered without
 * (a database before migration 0012, which adds the lots of the expanded village, IMPL-0024) is listed as not
 * taking applications yet, as its own panel says (`Lot`, `unlisted`), instead of as available.
 */
export function Explore({ lots }: { lots: Record<string, LotInfo> }) {
  const { setTarget, close } = useVila.getState();
  const answered = Object.keys(lots).length > 0;
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
                <small>{answered && !info ? "Ainda não recebe candidaturas" : STATE_LABEL[info?.state ?? "available"]}</small>
              </span>
              <button
                className="btn btn--small"
                onClick={() => {
                  setTarget(lotFront(l));
                  close();
                }}
              >
                Ir até lá
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
