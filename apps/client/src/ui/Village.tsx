import { useEffect, useState } from "react";

import { levelOf } from "@vila/shared/game/progress";
import { billboardNotice, BILLBOARDS, RESIDENTIAL_PLOTS, shopCopy, SHOPS, type TierRequirement, VILLAGE_PLAN } from "@vila/shared/game/world";
import { useVila } from "../game/store";
import { fetchResidentialPlots, type PlotState } from "../lib/api";
import { Panel, Status } from "./Panel";

/**
 * Panels of the expanded village (IMPL-0023, PROPOSTA): a residential plot, a shop and a billboard. Each one
 * says what is there and that it is not open yet. There is nothing to buy, to claim or to rent on any of
 * them: no price, no currency, no button that would pretend otherwise (IMPL-0002, DEC-042).
 */

/** What a tier asks, in words. A requirement is a level reached by playing, never an amount. */
const requirementText = (r: TierRequirement): string => `Chegar ao nível ${r.level} jogando`;

/** State of every plot, read once per visit to the page: the answer only changes with a deploy or a flag. */
let plotStates: Promise<Map<string, PlotState>> | null = null;
const loadPlotStates = () => (plotStates ??= fetchResidentialPlots().then((r) => new Map((r?.plots ?? []).map((p) => [p.id, p.state]))));

/** Residential plot: its id, its tier, what the tier requires, and that ownership is not open. */
export function PlotPanel({ plotId }: { plotId: string }) {
  const plot = RESIDENTIAL_PLOTS.find((p) => p.id === plotId);
  const level = useVila((s) => levelOf(s.progress.xp));
  // "unavailable" until the API says otherwise: ownership is off, and an API that cannot be read opens nothing.
  const [state, setState] = useState<PlotState>("unavailable");
  useEffect(() => {
    let alive = true;
    void loadPlotStates().then((states) => alive && setState(states.get(plotId) ?? "unavailable"));
    return () => void (alive = false);
  }, [plotId]);
  if (!plot) return null;
  const tier = VILLAGE_PLAN.tiers[plot.tier];
  return (
    <Panel kicker="Terreno residencial" title={`Terreno ${tier.label} ${plot.slot}`} contentKey={state}>
      <p className="lead">
        A posse de terrenos ainda não está aberta. <Status>Em breve</Status>
      </p>
      <dl className="facts">
        <dt>Identificação</dt>
        <dd>
          <code>{plot.id}</code>
        </dd>
        <dt>Categoria</dt>
        <dd>{tier.label}</dd>
        <dt>Requisito</dt>
        <dd>
          {requirementText(tier.requirement)} (você está no nível {level}).
        </dd>
        {state !== "unavailable" && (
          <>
            <dt>Situação</dt>
            <dd>{state === "occupied" ? "Ocupado" : "Livre"}</dd>
          </>
        )}
      </dl>
      <p>Nada aqui é vendido: um terreno será liberado jogando, pelas missões da Vila. O requisito acima é uma proposta em estudo e pode mudar.</p>
      <p className="note">A casa neste terreno é cenário: ninguém mora nela.</p>
    </Panel>
  );
}

/** Shop: what it will offer and that it has not opened. No catalogue, no purchase. */
export function ShopPanel({ shopId }: { shopId: string }) {
  if (!SHOPS.some((s) => s.id === shopId)) return null;
  const { name, offer } = shopCopy(shopId);
  return (
    <Panel kicker="Loja de Natal" title={name}>
      <p className="lead">
        Esta loja ainda não abriu. <Status>Em breve</Status>
      </p>
      <p>Quando abrir, aqui você vai encontrar {offer}.</p>
      <p>Nada será vendido por dinheiro: o que a loja oferecer será liberado jogando, pelas missões da Vila.</p>
      <p className="note">
        Proposta em estudo: o que cada loja oferece ainda pode mudar. Identificação: <code>{shopId}</code>
      </p>
    </Panel>
  );
}

/** Billboard: its notice as flat text, its id, and that the space is not for rent. */
export function BillboardPanel({ billboardId }: { billboardId: string }) {
  const index = BILLBOARDS.findIndex((b) => b.id === billboardId);
  if (index < 0) return null;
  const shop = shopCopy(BILLBOARDS[index].shopId).name;
  return (
    <Panel kicker="Placa da Vila" title={`Placa ${index + 1}`}>
      <p className="lead">“{billboardNotice(billboardId)}”</p>
      <dl className="facts">
        <dt>Identificação</dt>
        <dd>
          <code>{billboardId}</code>
        </dd>
        <dt>Onde fica</dt>
        <dd>No telhado da loja {shop}</dd>
      </dl>
      <p>Este espaço ainda não está disponível para aluguel. Por enquanto, as placas mostram só avisos da própria Vila.</p>
    </Panel>
  );
}
