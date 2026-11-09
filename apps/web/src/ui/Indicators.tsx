import { useEffect, useState } from "react";

import { fetchIndicators, type Indicator } from "../lib/api";
import { Panel } from "./Panel";

/** Public indicators (P02, DEC-027). A value without a verifiable source is shown as "—". */
export function Indicators() {
  const [data, setData] = useState<{ updatedAt: string; indicators: Indicator[] } | null | undefined>(undefined);
  useEffect(() => {
    fetchIndicators().then(setData);
  }, []);
  return (
    <Panel kicker="Transparência" title="Indicadores públicos da Vila">
      {data === undefined && <p className="note">Carregando…</p>}
      {data === null && <p className="note">Indicadores indisponíveis no momento.</p>}
      {data && (
        <>
          <ul className="indicators">
            {data.indicators.map((i) => (
              <li key={i.key}>
                <strong>{i.value === null ? "—" : i.value.toLocaleString("pt-BR")}</strong>
                <span>{i.label}</span>
                {i.value === null && <small>{i.note ?? "Depende de verificação."}</small>}
              </li>
            ))}
          </ul>
          <p className="note">Atualizado em {new Date(data.updatedAt).toLocaleString("pt-BR")}.</p>
        </>
      )}
    </Panel>
  );
}
