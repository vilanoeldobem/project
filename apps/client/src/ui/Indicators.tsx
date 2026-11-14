/**
 * Public indicators (P02, DEC-027). A value without a verifiable source is shown as "—", with the API's note;
 * the values and their labels come from `/indicators`, untouched. The "doações confirmadas" card states where
 * the number would come from, without inventing a source, a period or a date.
 */
import { useEffect, useState } from "react";

import { fetchIndicators, type Indicator } from "../lib/api";
import { Panel } from "./Panel";
import { SheetNotice } from "./sheet";

export function Indicators() {
  const [data, setData] = useState<{ updatedAt: string; indicators: Indicator[] } | null | undefined>(undefined);
  useEffect(() => {
    fetchIndicators().then(setData);
  }, []);
  return (
    <Panel board="P02" sheet icon="📊" title="Indicadores da Vila" subtitle="Transparência">
      {data === undefined && <p className="note">Carregando…</p>}
      {data === null && <p className="note">Indicadores indisponíveis no momento.</p>}
      {data && (
        <>
          <div className="sheet-cards">
            {data.indicators.map((i) => (
              <div key={i.key} className="sheet-card">
                <strong>{i.value === null ? "—" : i.value.toLocaleString("pt-BR")}</strong>
                <span>{i.label}</span>
                {i.value === null && <small>{i.note ?? "Depende de verificação."}</small>}
              </div>
            ))}
          </div>
          <div className="sheet-card">
            <h3>Doações confirmadas</h3>
            <p>Total de doações que tiveram confirmação após verificação.</p>
            <dl className="facts">
              <dt>Fonte</dt>
              <dd>A definir</dd>
              <dt>Período</dt>
              <dd>A definir</dd>
              <dt>Atualizado</dt>
              <dd>{new Date(data.updatedAt).toLocaleString("pt-BR")}</dd>
            </dl>
          </div>
        </>
      )}
      <SheetNotice tone="info" icon="ℹ️">
        Um indicador sem fonte verificável aparece como “—” (DEC-027).
      </SheetNotice>
    </Panel>
  );
}
