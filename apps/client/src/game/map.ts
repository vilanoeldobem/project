/**
 * The schematic map of the village (P10), pure: every lot, shop, residential plot, civic building, park and
 * square the plan defines, placed on the SVG canvas by its world position, and the street of every ring
 * (IMPL-0031). States come from the loaded lots; a lot the API did not answer is "unknown", never "available".
 */
import { LOTS, plotLabel, RESIDENTIAL_PLOTS, SHOPS, shopCopy, siteCopy, SITES, type PlotTier, VILLAGE, VILLAGE_PLAN, WORLD_RADIUS } from "@vila/shared/game/world";

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

/** `available`, `application_sent`, `under_review`, `published`, `unknown` (lots); `shop`; the tier (plots); the use (sites). */
export type MapDotState = LotState | "unknown" | "shop" | PlotTier | "civic" | "park" | "square";

export const mapToSvg = (x: number, z: number): MapPoint => ({ x: MAP_SIZE / 2 + x * SCALE, y: MAP_SIZE / 2 + z * SCALE });

export interface MapDot {
  id: string;
  kind: "lot" | "shop" | "plot" | "site";
  x: number;
  y: number;
  r: number;
  state: MapDotState;
  label: string;
}

// The village of four rings is 99 u in radius on a canvas of 480: a lot's pad is 16 units of canvas wide.
const LOT_DOT_RADIUS = 6.5;
const SHOP_DOT_RADIUS = 5;
const SITE_DOT_RADIUS = 6;
const PLOT_R: Record<PlotTier, number> = { economy: 3.4, standard: 3.8, premium: 4.4 };

/** Vertices of a regular octagon with apothem `apothem` around the centre, sides facing the eight streets. */
export function octagonPoints(apothem: number): string {
  const radius = apothem / Math.cos(Math.PI / 8);
  return Array.from({ length: 8 }, (_, k) => {
    const angle = ((k + 0.5) * 2 * Math.PI) / 8;
    return `${MAP_SIZE / 2 + Math.cos(angle) * radius},${MAP_SIZE / 2 + Math.sin(angle) * radius}`;
  }).join(" ");
}

/** The street of each ring, as the apothem of its axis on the canvas: an octagon each (`octagonPoints`). */
export function ringStreets(): Array<{ id: string; apothem: number; width: number }> {
  return VILLAGE.rings.filter((ring) => ring.street).map((ring) => ({ id: ring.id, apothem: ((ring.street![0] + ring.street![1]) / 2) * SCALE, width: (ring.street![1] - ring.street![0]) * SCALE }));
}

/** The eight avenues, from the round street of the plaza to the end of the village. */
export function avenueLines(): MapLine[] {
  const ringOuter = VILLAGE_PLAN.ringStreet[1];
  const frontage = (WORLD_RADIUS - 1) * SCALE;
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
      label: info?.state === "published" && info.ngo_name ? info.ngo_name : `Terreno ${lot.number}`,
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
  for (const site of SITES) {
    const p = mapToSvg(site.x, site.z);
    dots.push({ id: site.id, kind: "site", x: p.x, y: p.y, r: SITE_DOT_RADIUS, state: site.use, label: siteCopy(site).name });
  }
  return dots;
}
