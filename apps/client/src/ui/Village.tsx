import { useEffect, useState } from "react";

import { attainableLevel, levelOf } from "@vila/shared/game/progress";
import { billboardNotice, BILLBOARDS, plotLabel, RESIDENTIAL_PLOTS, type ResidentialPlot, shopCopy, SHOPS, VILLAGE_PLAN } from "@vila/shared/game/world";
import { useQuestsEnabled } from "../game/questsFlag";
import { useVila } from "../game/store";
import { fetchResidentialPlots, type PlotState } from "../lib/api";
import { Panel } from "./Panel";

/**
 * Panels of the expanded village (IMPL-0024, PROPOSTA): a residential plot, a shop and a billboard. Each one
 * says what is there, in neutral words. Whether players may ever hold a plot, what a shop would do and what
 * else a sign could show are not decided (OQ-17, OQ-18), so no panel says that any of it is coming: no "em
 * breve", no requirement while ownership is off, no word about renting. There is nothing to buy, to claim or
 * to rent on any of them: no price, no currency, no button (IMPL-0002, DEC-042).
 *
 * The visitor reads friendly labels ("Terreno 12 · Bairro da Floresta"); the ids stay in `data-` attributes
 * for the tests and the verify scripts.
 */

/** What the API says about the plots, read once per visit to the page: it only changes with a deploy or a flag. */
interface PlotsAnswer {
  /** `RESIDENTIAL_PLOTS_ENABLED` with accounts on (the same value as `/config.residentialPlots`). */
  enabled: boolean;
  states: Map<string, PlotState>;
}
const OFF: PlotsAnswer = { enabled: false, states: new Map() };
let plotsAnswer: Promise<PlotsAnswer> | null = null;
const loadPlots = () => (plotsAnswer ??= fetchResidentialPlots().then((r) => (r ? { enabled: r.enabled === true, states: new Map(r.plots.map((p) => [p.id, p.state])) } : OFF)));

const STATE_LABEL: Record<PlotState, string> = { unavailable: "Indisponível", available: "Livre", occupied: "Ocupado" };

/** Residential plot: which one it is, its neighbourhood, and that nobody holds it. */
export function PlotPanel({ plotId }: { plotId: string }) {
  const plot = RESIDENTIAL_PLOTS.find((p) => p.id === plotId);
  const level = useVila((s) => levelOf(s.progress.xp));
  const quests = useQuestsEnabled();
  // Off until the API says otherwise: ownership is off, and an API that cannot be read opens nothing.
  const [answer, setAnswer] = useState<PlotsAnswer>(OFF);
  useEffect(() => {
    let alive = true;
    void loadPlots().then((a) => alive && setAnswer(a));
    return () => void (alive = false);
  }, []);
  if (!plot) return null;
  return <PlotPanelView plot={plot} enabled={answer.enabled} state={answer.states.get(plotId) ?? "unavailable"} level={level} quests={quests} />;
}

/**
 * What the plot panel shows. With ownership off (production and staging) it is the plot, its neighbourhood and
 * one neutral statement. The proposed requirement of the tier appears only with the flag on, and then it says
 * whether the missions that are open can reach it at all.
 */
export function PlotPanelView({ plot, enabled, state, level, quests }: { plot: ResidentialPlot; enabled: boolean; state: PlotState; level: number; quests: boolean }) {
  const tier = VILLAGE_PLAN.tiers[plot.tier];
  const required = tier.requirement.level;
  return (
    <Panel kicker="Terreno residencial" title={plotLabel(plot)} contentKey={enabled ? state : "off"}>
      <div data-plot-id={plot.id}>
        <p className="lead">
          {enabled
            ? "Os terrenos residenciais não têm dono. A posse por jogadores é uma proposta em estudo. Ainda não é possível pedir um terreno."
            : "Os terrenos residenciais não têm dono. A posse por jogadores é uma proposta em estudo e ainda não foi decidida."}
        </p>
        <dl className="facts">
          <dt>Terreno</dt>
          <dd>{plot.slot}</dd>
          <dt>Bairro</dt>
          <dd>{tier.label}</dd>
          {enabled && (
            <>
              <dt>Requisito em estudo</dt>
              <dd>
                Chegar ao nível {required} jogando.{" "}
                {required > attainableLevel(quests) ? "Com as missões abertas hoje ainda não dá para chegar a esse nível." : `Você está no nível ${level}.`}
              </dd>
              <dt>Situação</dt>
              <dd>{STATE_LABEL[state]}</dd>
            </>
          )}
        </dl>
        {enabled && <p>Nada aqui é vendido. O requisito é uma proposta em estudo e pode mudar.</p>}
        <p className="note">A casa neste terreno é cenário: ninguém mora nela.</p>
      </div>
    </Panel>
  );
}

/**
 * Shop: its name, its theme and that it is closed. No catalogue, and no promise of one: "ainda não abriu" would
 * announce an opening that nobody decided.
 */
export function ShopPanel({ shopId }: { shopId: string }) {
  if (!SHOPS.some((s) => s.id === shopId)) return null;
  const { name, theme } = shopCopy(shopId);
  return (
    <Panel kicker="Loja de Natal" title={name}>
      <div data-shop-id={shopId}>
        <p className="lead">Esta loja está fechada.</p>
        <p>Tema: {theme}. Se e como ela vai funcionar ainda não foi decidido.</p>
        <p className="note">Nada é vendido na Vila.</p>
      </div>
    </Panel>
  );
}

/** Billboard: its notice as flat text and where it stands. The signs carry the village's own notices. */
export function BillboardPanel({ billboardId }: { billboardId: string }) {
  const index = BILLBOARDS.findIndex((b) => b.id === billboardId);
  if (index < 0) return null;
  const shop = shopCopy(BILLBOARDS[index].shopId).name;
  return (
    <Panel kicker="Placa da Vila" title={`Placa ${index + 1}`}>
      <div data-billboard-id={billboardId}>
        <p className="lead">“{billboardNotice(billboardId)}”</p>
        <dl className="facts">
          <dt>Onde fica</dt>
          <dd>No telhado da loja {shop}</dd>
        </dl>
        <p>As placas mostram avisos da própria Vila.</p>
      </div>
    </Panel>
  );
}
