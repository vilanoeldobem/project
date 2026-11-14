/**
 * The schematic map of the village (P10), pure: every lot, shop and residential plot the plan defines, placed on
 * the SVG canvas by its world position. States come from the loaded lots; a lot the API did not answer is
 * "unknown", never "available".
 */
import { LOTS, plotLabel, RESIDENTIAL_PLOTS, SHOPS, shopCopy, type PlotTier, VILLAGE_PLAN, WORLD_RADIUS } from "@vila/shared/game/world";

import type { LotInfo, LotState } from "../lib/api";

export const MAP_SIZE = 480;
/** World units → canvas units, with a margin for the dots on the edge. */
export const SCALE = (MAP_SIZE / 2 - 12) / WORLD_RADIUS;

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** `available`, `application_sent`, `under_review`, `published`, `unknown` (lots); `shop`; the tier (plots). */
export type MapDotState = LotState | "unknown" | "shop" | PlotTier;

export const mapToSvg = (x: number, z: number): MapPoint => ({ x: MAP_SIZE / 2 + x * SCALE, y: MAP_SIZE / 2 + z * SCALE });

export interface MapDot {
  id: string;
  kind: "lot" | "shop" | "plot";
  x: number;
  y: number;
  r: number;
  state: MapDotState;
  label: string;
}

const LOT_DOT_RADIUS = 10;
const SHOP_DOT_RADIUS = 6;
const PLOT_R: Record<PlotTier, number> = { economy: 2.6, standard: 3.2, premium: 3.8 };

/** Vertices of a regular octagon with apothem `apothem` around the centre, sides facing the eight streets. */
export function octagonPoints(apothem: number): string {
  const radius = apothem / Math.cos(Math.PI / 8);
  return Array.from({ length: 8 }, (_, k) => {
    const angle = ((k + 0.5) * 2 * Math.PI) / 8;
    return `${MAP_SIZE / 2 + Math.cos(angle) * radius},${MAP_SIZE / 2 + Math.sin(angle) * radius}`;
  }).join(" ");
}

/** The eight streets that leave the ring towards the square's frontage. */
export function avenueLines(): MapLine[] {
  const ringOuter = VILLAGE_PLAN.ringStreet[1];
  const frontage = (VILLAGE_PLAN.squareApothem / Math.cos(Math.PI / 8)) * SCALE;
  return Array.from({ length: 8 }, (_, k) => {
    const angle = ((k + 0.5) * 2 * Math.PI) / 8;
    return {
      x1: MAP_SIZE / 2 + Math.cos(angle) * ringOuter * SCALE,
      y1: MAP_SIZE / 2 + Math.sin(angle) * ringOuter * SCALE,
      x2: MAP_SIZE / 2 + Math.cos(angle) * frontage,
      y2: MAP_SIZE / 2 + Math.sin(angle) * frontage,
    };
  });
}

export function mapDots(lots: Record<string, LotInfo>): MapDot[] {
  const dots: MapDot[] = [];
  for (const lot of LOTS) {
    const info = lots[lot.id];
    const p = mapToSvg(lot.x, lot.z);
    dots.push({
      id: lot.id,
      kind: "lot",
      x: p.x,
      y: p.y,
      r: LOT_DOT_RADIUS,
      state: info?.state ?? "unknown",
      label: info?.state === "published" && info.ngo_name ? info.ngo_name : `Terreno ${lot.slot}`,
    });
  }
  for (const shop of SHOPS) {
    const p = mapToSvg(shop.x, shop.z);
    dots.push({ id: shop.id, kind: "shop", x: p.x, y: p.y, r: SHOP_DOT_RADIUS, state: "shop", label: shopCopy(shop.id).name });
  }
  for (const plot of RESIDENTIAL_PLOTS) {
    const p = mapToSvg(plot.x, plot.z);
    dots.push({ id: plot.id, kind: "plot", x: p.x, y: p.y, r: PLOT_R[plot.tier], state: plot.tier, label: plotLabel(plot) });
  }
  return dots;
}
