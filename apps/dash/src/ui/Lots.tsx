/**
 * Current lot assignments (P03, DEC-028). The locked view reads the public projection only.
 */
import { type AdminLot, lotNumber, STATUS_LABEL } from "@vila/shared/accounts/contract";

import { LOT_STATE_LABEL } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { hrefOf } from "../lib/router";
import { api } from "../lib/services";
import { DataTable, Live, Notice, PageHead, Status } from "./common";

type LotRow = Pick<AdminLot, "id" | "state" | "ngo_name"> & Partial<Pick<AdminLot, "applicationId" | "applicationStatus">>;

export function Lots({ locked }: { locked: boolean }) {
  return (
    <>
      <PageHead title="ONGs e terrenos" lead="Situação de cada terreno da praça e a organização que o ocupa. Somente leitura." />
      {locked && (
        <Notice state="accounts-off" title="Contas desligadas" tone="warn">
          <p>Sem sessão de administrador, aparecem só os dados públicos dos terrenos; candidaturas em andamento não são mostradas.</p>
        </Notice>
      )}
      <LotList key={locked ? "public" : "admin"} locked={locked} />
    </>
  );
}

function LotList({ locked }: { locked: boolean }) {
  const lots = useLoad<{ lots: LotRow[] }>(() => locked ? api.lots() : api.adminLots(), "lots");
  return (
    <Live loading={lots.loading} error={lots.error} onRetry={lots.reload}>
      {lots.data && <LotTable rows={lots.data.lots} />}
    </Live>
  );
}

export function LotTable({ rows }: { rows: LotRow[] }) {
  const published = rows.filter((l) => l.state === "published").length;
  return (
    <>
      <p className="muted">
        {rows.length} {rows.length === 1 ? "terreno" : "terrenos"} · {published} com casa publicada
      </p>
      <DataTable
        caption="Terrenos da praça"
        columns={["Terreno", "Situação do terreno", "Organização", "Candidatura"]}
        rows={rows.map((lot) => ({
          key: lot.id,
          cells: [
            `Terreno ${lotNumber(lot.id)}`,
            <Status code={lot.state}>{LOT_STATE_LABEL[lot.state] ?? lot.state}</Status>,
            lot.ngo_name ?? "—",
            lot.applicationId && lot.applicationStatus ? <a href={hrefOf({ section: "applications", id: lot.applicationId })}>{STATUS_LABEL[lot.applicationStatus]}</a> : "—",
          ],
        }))}
      />
    </>
  );
}
