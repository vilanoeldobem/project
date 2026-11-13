/**
 * Public read of the residential plots (IMPL-0023, PROPOSTA; OQ-17).
 *
 *   GET /residential-plots → { enabled, plots: [{ id, tier, slot, x, z, facing, state }] }
 *
 * Ownership is switched off (`RESIDENTIAL_PLOTS_ENABLED`, "false" in production and staging): no recorded
 * product decision lets a player hold land (DEC-028 reserves plots for NGOs), so every plot answers
 * "unavailable" and nothing in this API writes `owner_id`. There is no claim route and no price: what a tier
 * requires is a level, kept in the shared plan (`VILLAGE_PLAN`), never an amount.
 *
 * Always-on public route: it must answer on every schema the code may meet. Production's database is at
 * migration 0003 and `residential_plots` comes with 0012, so a missing table (or no database at all) answers
 * the layout from the shared constants, every plot "unavailable", never a 500. Who holds a plot is never part
 * of the answer, on any schema or flag.
 */
import { PLOT_TIERS, type PlotTier, RESIDENTIAL_PLOTS } from "@vila/shared/game/world";

import type { Env } from "./api";
import { json, NO_STORE } from "./http";

export type PlotState = "unavailable" | "available" | "occupied";

export interface PlotRow {
  id: string;
  tier: PlotTier;
  slot: number;
  x: number;
  z: number;
  facing: number;
  state: PlotState;
}

/** "true" only with accounts on: holding a plot needs an account. */
export const residentialPlotsEnabled = (env: Env): boolean => env.ACCOUNTS_ENABLED === "true" && env.RESIDENTIAL_PLOTS_ENABLED === "true";

/** The layout the game draws, with nothing to hold: what an older database (or none) answers. */
const fromLayout = (): PlotRow[] => RESIDENTIAL_PLOTS.map(({ id, tier, slot, x, z, facing }) => ({ id, tier, slot, x, z, facing, state: "unavailable" }));

const noPlotsTable = (e: unknown): boolean => e instanceof Error && /no such table: residential_plots\b/i.test(e.message);

async function fromDatabase(db: D1Database, enabled: boolean): Promise<PlotRow[]> {
  // `owner_id` never leaves the database: only whether the plot is held.
  const { results } = await db
    .prepare(
      `SELECT id, tier, slot, x, z, facing, owner_id IS NOT NULL AS held
         FROM residential_plots
        ORDER BY CASE tier ${PLOT_TIERS.map((t, i) => `WHEN '${t}' THEN ${i}`).join(" ")} END, slot`
    )
    .all<Omit<PlotRow, "state"> & { held: number }>();
  return results.map(({ held, ...plot }) => ({ ...plot, state: !enabled ? "unavailable" : held ? "occupied" : "available" }));
}

export async function residentialPlots(env: Env): Promise<Response> {
  const enabled = residentialPlotsEnabled(env);
  let plots: PlotRow[];
  if (!env.DB) plots = fromLayout();
  else {
    try {
      plots = await fromDatabase(env.DB, enabled);
    } catch (e) {
      if (!noPlotsTable(e)) throw e;
      plots = fromLayout();
    }
  }
  // Without the table there is nothing to hold, whatever the flag says.
  return json({ enabled: enabled && plots.some((p) => p.state !== "unavailable"), plots }, { headers: NO_STORE });
}
