import { useEffect, useState } from "react";

import { attainableLevel, levelOf } from "@vila/shared/game/progress";
import { BILLBOARDS, type BoardFormat, boardNotices, plotLabel, RESIDENTIAL_PLOTS, type ResidentialPlot, shopCopy, SHOPS, siteCopy, SITES, streetLabel, VILLAGE_PLAN } from "@vila/shared/game/world";
import { useVila } from "../game/store";
import { fetchResidentialPlots, type PlotState } from "../lib/api";
import { Panel } from "./Panel";
import { Wardrobe } from "./Wardrobe";

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
  // Off until the API says otherwise: ownership is off, and an API that cannot be read opens nothing.
  const [answer, setAnswer] = useState<PlotsAnswer>(OFF);
  useEffect(() => {
    let alive = true;
    void loadPlots().then((a) => alive && setAnswer(a));
    return () => void (alive = false);
  }, []);
  if (!plot) return null;
  return <PlotPanelView plot={plot} enabled={answer.enabled} state={answer.states.get(plotId) ?? "unavailable"} level={level} />;
}

/**
 * What the plot panel shows. With ownership off (production and staging) it is the plot, its neighbourhood and
 * one neutral statement. The proposed requirement of the tier appears only with the flag on, and then it says
 * whether the missions that are open can reach it at all.
 */
export function PlotPanelView({ plot, enabled, state, level }: { plot: ResidentialPlot; enabled: boolean; state: PlotState; level: number }) {
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
                {required > attainableLevel(true) ? "Com as missões abertas hoje ainda não dá para chegar a esse nível." : `Você está no nível ${level}.`}
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
 * Shop: its name, its theme and that the shop is closed. At its door the village's provador opens the free
 * wardrobe (P08/IMPL-0027): the visitor tries and equips what they already own; paid cards only read
 * "Ver compra" and say the purchase is not available. The store itself is still closed and nothing is sold.
 */
export function ShopPanel({ shopId }: { shopId: string }) {
  if (!SHOPS.some((s) => s.id === shopId)) return null;
  const { name, theme } = shopCopy(shopId);
  return (
    <Panel board="P08" sheet icon="🪞" kicker="Loja de Natal" title={name} subtitle="Provador da Vila">
      <div data-shop-id={shopId}>
        <p className="lead">Esta loja está fechada. O provador é grátis: experimente os visuais e equipe o que já é seu.</p>
        <p className="note">Tema: {theme}.</p>
        <Wardrobe shopId={shopId} />
        <p className="note">Nada é vendido na Vila.</p>
      </div>
    </Panel>
  );
}

const BOARD_LABEL: Record<BoardFormat, string> = { rooftop: "Placa", outdoor: "Outdoor", lawn: "Placa de jardim", screen: "Telão" };

/** Where a board stands, in words: the shop whose roof it is on, the park, square or building it belongs to, or the end of an avenue. */
function boardPlace(board: (typeof BILLBOARDS)[number]): string {
  if (board.shopId) return `No telhado da loja ${shopCopy(board.shopId).name}`;
  const site = SITES.find((x) => x.id === board.siteId);
  if (!site) return "No fim de uma avenida";
  const { name } = siteCopy(site);
  return site.use === "civic" ? (board.grounded ? `Ao lado de: ${name}` : `No telhado de: ${name}`) : `Em: ${name}`;
}

/**
 * A display board: its notice as flat text and where it stands. The boards carry the village's own notices
 * (PEN-008, OQ-18): no word here says that anything else could be shown, nor that it could not.
 */
export function BillboardPanel({ billboardId }: { billboardId: string }) {
  const board = BILLBOARDS.find((b) => b.id === billboardId);
  if (!board) return null;
  const ofFormat = BILLBOARDS.filter((b) => b.format === board.format);
  const notices = boardNotices(billboardId);
  return (
    <Panel kicker={board.format === "screen" ? "Telão da Vila" : "Placa da Vila"} title={`${BOARD_LABEL[board.format]} ${ofFormat.indexOf(board) + 1}`}>
      <div data-billboard-id={billboardId} data-board-format={board.format}>
        {notices.map((notice) => (
          <p className="lead" key={notice}>
            “{notice}”
          </p>
        ))}
        <dl className="facts">
          <dt>Onde fica</dt>
          <dd>{boardPlace(board)}</dd>
        </dl>
        <p>As placas mostram avisos da própria Vila.</p>
      </div>
    </Panel>
  );
}

const SITE_KICKER = { civic: "Prédio da Vila", park: "Parque da Vila", square: "Praça da Vila" } as const;

/**
 * A civic building, a park or a square (IMPL-0031, PROPOSTA): its name, what it is and where it stands. It is
 * scenery, and the panel says so in the words of today: nothing is served, sold or booked there, and no line
 * says that it will be.
 */
export function SitePanel({ siteId }: { siteId: string }) {
  const site = SITES.find((x) => x.id === siteId);
  if (!site) return null;
  const { name, about } = siteCopy(site);
  return (
    <Panel kicker={SITE_KICKER[site.use]} title={name}>
      <div data-site-id={site.id} data-site-kind={site.kind ?? site.use}>
        <p className="lead">{about}</p>
        <dl className="facts">
          <dt>Onde fica</dt>
          <dd>{streetLabel(site.ring)}</dd>
        </dl>
        <p className="note">{site.use === "civic" ? "Este prédio é cenário da Vila: não há atendimento e nada é vendido aqui." : "Um lugar para passear. Nada é vendido na Vila."}</p>
      </div>
    </Panel>
  );
}
