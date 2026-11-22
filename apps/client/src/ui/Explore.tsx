import { useVila } from "../game/store";
import { type LotDef, lotFront, LOTS, streetLabel } from "@vila/shared/game/world";
import type { LotInfo, LotState } from "../lib/api";
import { isUnlisted, UNLISTED_LABEL } from "../lib/lots";
import { Panel } from "./Panel";

const STATE_LABEL: Record<LotState, string> = {
  available: "Terreno disponível",
  application_sent: "Candidatura enviada",
  under_review: "Em análise",
  published: "Casa publicada",
};

/**
 * The lots of the village, street by street: the square first, then each ring (IMPL-0031). "Ir até lá" walks
 * the avatar to the front of the lot. Published houses come first in their street; the square and every street
 * with a published house start open, the others closed, so the list of 97 lots opens as a short one. A lot the
 * API answered without is listed as being prepared (`UNLISTED_LABEL`), as its own panel and its 3D label say,
 * instead of as available.
 */
export function Explore({ lots }: { lots: Record<string, LotInfo> }) {
  const { setTarget, close } = useVila.getState();
  const isPublished = (l: LotDef) => lots[l.id]?.state === "published";
  const published = LOTS.filter(isPublished).length;
  const streets = [...new Set(LOTS.map((l) => l.street))].map((street) => {
    const all = LOTS.filter((l) => l.street === street);
    return { street, lots: [...all.filter(isPublished), ...all.filter((l) => !isPublished(l))], houses: all.filter(isPublished).length };
  });
  return (
    <Panel kicker="Explorar" title="ONGs da Vila">
      <p className="lead">
        {published === 0
          ? "Nenhuma ONG publicada ainda. Os terrenos estão abertos para organizações aprovadas."
          : `${published} ${published === 1 ? "casa publicada" : "casas publicadas"} na Vila.`}
      </p>
      {streets.map(({ street, lots: list, houses }) => (
        <details key={street} className="lot-street" open={street === "plaza" || houses > 0}>
          <summary>
            <strong>{streetLabel(street)}</strong>
            <small>
              {list.length} terrenos{houses > 0 ? ` · ${houses} ${houses === 1 ? "casa publicada" : "casas publicadas"}` : ""}
            </small>
          </summary>
          <ul className="lot-list">
            {list.map((l) => {
              const info = lots[l.id];
              return (
                <li key={l.id}>
                  <span>
                    <strong>{info?.state === "published" && info.ngo_name ? info.ngo_name : `Terreno ${l.number}`}</strong>
                    <small>{isUnlisted(lots, l.id) ? UNLISTED_LABEL : STATE_LABEL[info?.state ?? "available"]}</small>
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
        </details>
      ))}
      <div className="actions">
        <button className="btn" onClick={() => useVila.getState().open({ kind: "map" })}>
          Ver a Vila no mapa
        </button>
        <button className="btn" onClick={() => useVila.getState().open({ kind: "invite" })}>
          Indicar uma ONG
        </button>
      </div>
    </Panel>
  );
}
