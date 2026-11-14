/**
 * Village map (P10, "crescimento conforme a ocupação por ONGs aprovadas"): a schematic drawing of the plan in
 * force — the plaza, the ring street, the square's frontage and every lot, shop and residential plot — with the
 * visitor's own position. All positions come from `VILLAGE_PLAN`; the lot colours from the API. The idea of a
 * new ring stays a proposal: this screen shows what exists today.
 */
import { SPAWN, VILLAGE_PLAN } from "@vila/shared/game/world";

import { avenueLines, MAP_SIZE, mapDots, mapToSvg, octagonPoints, SCALE } from "../game/map";
import { sim } from "../game/sim";
import { useVila } from "../game/store";
import type { LotInfo } from "../lib/api";
import { Panel } from "./Panel";
import { SheetSection } from "./sheet";

const LEGEND = [
  { state: "plaza", label: "Praça" },
  { state: "published", label: "ONG publicada" },
  { state: "available", label: "Terreno disponível" },
  { state: "under_review", label: "Em análise" },
  { state: "shop", label: "Loja (fechada)" },
  { state: "plot", label: "Terreno residencial" },
  { state: "unknown", label: "Sem informação" },
] as const;

export function MapPanel({ lots = {} }: { lots?: Record<string, LotInfo> }) {
  const close = useVila((s) => s.close);
  const setTarget = useVila((s) => s.setTarget);
  const dots = mapDots(lots);
  const here = mapToSvg(sim.pose.x, sim.pose.z);
  const published = dots.filter((d) => d.kind === "lot" && d.state === "published").length;
  const plaza = VILLAGE_PLAN.plazaRadius * SCALE;
  const [ringInner, ringOuter] = VILLAGE_PLAN.ringStreet;
  const avenues = avenueLines();

  return (
    <Panel
      board="P10"
      sheet
      icon="🗺️"
      title="Expansão da Vila"
      subtitle="Crescimento conforme a ocupação por ONGs aprovadas"
      footer={
        <div className="actions">
          <button
            className="btn btn--primary"
            onClick={() => {
              setTarget({ x: SPAWN.x, z: SPAWN.z });
              close();
            }}
          >
            Voltar à praça
          </button>
        </div>
      }
    >
      <svg className="village-map" role="img" aria-label="Mapa da Vila" viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}>
        <rect className="map-ground" x={0} y={0} width={MAP_SIZE} height={MAP_SIZE} rx={18} />
        <polygon className="map-square" points={octagonPoints(VILLAGE_PLAN.squareApothem * SCALE)} />
        <circle
          className="map-ring"
          cx={MAP_SIZE / 2}
          cy={MAP_SIZE / 2}
          r={((ringInner + ringOuter) / 2) * SCALE}
          strokeWidth={(ringOuter - ringInner) * SCALE}
        />
        <circle className="map-plaza" cx={MAP_SIZE / 2} cy={MAP_SIZE / 2} r={plaza} />
        {avenues.map((line, k) => (
          <line key={k} className="map-avenue" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
        ))}
        {dots.map((dot) =>
          dot.kind === "shop" ? (
            <rect
              key={dot.id}
              className="map-dot"
              data-kind={dot.kind}
              data-state={dot.state}
              x={dot.x - dot.r}
              y={dot.y - dot.r}
              width={dot.r * 2}
              height={dot.r * 2}
              transform={`rotate(45 ${dot.x} ${dot.y})`}
              rx={1.5}
            >
              <title>{dot.label}</title>
            </rect>
          ) : (
            <circle
              key={dot.id}
              className="map-dot"
              data-kind={dot.kind}
              data-state={dot.state}
              cx={dot.x}
              cy={dot.y}
              r={dot.r}
            >
              <title>{dot.label}</title>
            </circle>
          )
        )}
        <circle className="map-here" cx={here.x} cy={here.y} r={6} />
        <text className="map-here__label" x={here.x + 10} y={here.y + 5}>
          Você está aqui
        </text>
      </svg>
      <SheetSection n={1} icon="📍" title="Como ler o mapa">
        <ul className="map-legend">
          {LEGEND.map((item) => (
            <li key={item.state}>
              <span className="map-swatch" data-state={item.state} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
        <dl className="facts">
          <dt>ONGs aprovadas</dt>
          <dd>{published}</dd>
          <dt>Terrenos de ONG</dt>
          <dd>{dots.filter((d) => d.kind === "lot").length}</dd>
          <dt>Lotes residenciais</dt>
          <dd>{dots.filter((d) => d.kind === "plot").length}</dd>
        </dl>
      </SheetSection>
    </Panel>
  );
}
