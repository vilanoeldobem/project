/**
 * Lots and the organisation on each one (P03, DEC-028). Read-only: the lot state comes from the public
 * `GET /lots`; which application holds a lot before publication comes from the admin list. Nothing is changed
 * here — a lot only changes through an application and its review.
 */
import { lotNumber, STATUS_LABEL } from "@vila/shared/accounts/contract";

import { LOT_STATE_LABEL, occupantOf } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { hrefOf } from "../lib/router";
import { api } from "../lib/services";
import { DataTable, Live, Notice, PageHead, Status } from "./common";

export function Lots({ locked }: { locked: boolean }) {
  const lots = useLoad(() => api.lots(), "lots");
  const applications = useLoad(() => (locked ? Promise.resolve({ applications: [] }) : api.adminList()), locked ? "off" : "on");
  const rows = lots.data?.lots ?? [];
  const apps = applications.data?.applications ?? [];
  const published = rows.filter((l) => l.state === "published").length;
  return (
    <>
      <PageHead title="ONGs e terrenos" lead="Situação de cada terreno da praça e a organização que o ocupa. Somente leitura." />
      {locked && (
        <Notice state="accounts-off" title="Contas desligadas" tone="warn">
          <p>Sem sessão de administrador, aparecem só os dados públicos dos terrenos; candidaturas em andamento não são mostradas.</p>
        </Notice>
      )}
      <Live loading={lots.loading || applications.loading} error={lots.error || applications.error} onRetry={() => (lots.reload(), applications.reload())}>
        {lots.data && (
          <>
            <p className="muted">
              {rows.length} {rows.length === 1 ? "terreno" : "terrenos"} · {published} com casa publicada
            </p>
            <DataTable
              caption="Terrenos da praça"
              columns={["Terreno", "Situação do terreno", "Organização", "Candidatura"]}
              rows={rows.map((lot) => {
                const occupant = occupantOf(lot, apps);
                return {
                  key: lot.id,
                  cells: [
                    `Terreno ${lotNumber(lot.id)}`,
                    <Status code={lot.state}>{LOT_STATE_LABEL[lot.state] ?? lot.state}</Status>,
                    occupant?.name ?? lot.ngo_name ?? "—",
                    occupant ? <a href={hrefOf({ section: "applications", id: occupant.id })}>{STATUS_LABEL[occupant.status]}</a> : "—",
                  ],
                };
              })}
            />
          </>
        )}
      </Live>
    </>
  );
}
