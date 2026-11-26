/**
 * Public indicators (P02, DEC-027). A value without a verifiable source is shown as "—", with the API's note;
 * the values and their labels come from `/indicators`, untouched. The "doações confirmadas" card states where
 * the number would come from, without inventing a source, a period or a date.
 */
import { formatBrl } from "@vila/shared/donations/contract";
import { useEffect, useState } from "react";

import { fetchIndicators, type Indicator } from "../lib/api";
import { Panel } from "./Panel";
import { SheetNotice } from "./sheet";

/** Amounts from the API are integer cents. Every other current indicator is a count. */
export function IndicatorCard({ indicator }: { indicator: Indicator }) {
  const { key, label, value, note } = indicator;
  let display = "—";
  if (value !== null) display = key === "confirmed_amount" ? formatBrl(value) : value.toLocaleString("pt-BR");
  return (
    <div className="sheet-card">
      <strong>{display}</strong>
      <span>{label}</span>
      {value === null && <small>{note ?? "Depende de verificação."}</small>}
    </div>
  );
}

const usageMetrics = [
  { key: "unique_visitors", label: "visitantes únicos desde o lançamento" },
  { key: "visits_by_ngo_house", label: "visitas por casa de ONG" },
  { key: "players_by_minigame", label: "jogadores por minijogo" },
];

/** P02 describes missing usage figures together. A metric that the API sends already has its own card and note. */
export function UsageCoverage({ indicators }: { indicators: Indicator[] }) {
  const missing = usageMetrics.filter(metric => !indicators.some(indicator => indicator.key === metric.key));
  if (!missing.length) return null;
  return (
    <p className="note">
      Sem medição disponível para {new Intl.ListFormat("pt-BR").format(missing.map(metric => metric.label))}.
      {missing.some(metric => metric.key === "unique_visitors") && " O contador da praça mostra conexões ativas. Uma pessoa com duas abas pode aparecer duas vezes."}
    </p>
  );
}

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
            {data.indicators.map((i) => <IndicatorCard key={i.key} indicator={i} />)}
          </div>
          <UsageCoverage indicators={data.indicators} />
          {data.indicators.some((i) => i.key === "confirmed_donations" && i.value !== null) && (
            <div className="sheet-card">
              <h3>Doações confirmadas</h3>
              <p>O painel soma os registros da Vila que continuam confirmados na data da consulta. Uma doação estornada sai da contagem.</p>
            </div>
          )}
          <p className="note">Consulta ao painel: {new Date(data.updatedAt).toLocaleString("pt-BR")}</p>
        </>
      )}
      <SheetNotice tone="info" icon="ℹ️">
        Um indicador sem fonte verificável aparece como “—” (DEC-027).
      </SheetNotice>
    </Panel>
  );
}
