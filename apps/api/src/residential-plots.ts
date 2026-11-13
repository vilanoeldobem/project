/**
 * Public read of the residential plots (IMPL-0024, PROPOSTA; OQ-17).
 *
 *   GET /residential-plots → { enabled, plots: [{ id, tier, slot, x, z, facing, state }] }
 *
 * Ownership is switched off (`RESIDENTIAL_PLOTS_ENABLED`, "false" in production and staging): no recorded
 * product decision lets a player hold land (DEC-028 reserves plots for NGOs), so every plot answers
 * "unavailable". There is no claim route, no ownership column and no price: what a tier would require is a
 * level, kept in the shared plan (`VILLAGE_PLAN`), never an amount.
 *
 * The shared layout is the source of the plots and their positions: the answer always lists every plot of
 * `RESIDENTIAL_PLOTS`, in its order, and the `residential_plots` table (migration 0012) only adds state. So:
 *
 * - with the flag off (or accounts off, or no database) the answer is a constant and D1 is not read at all;
 * - with the flag on, a plot is "available" when its row is in the table; a missing row, a missing table
 *   (production's database is at migration 0003) or any D1 error leaves it "unavailable", never a 500 and
 *   never a shorter list. Rows the layout does not know are ignored.
 *
 * `enabled` is the flag (with accounts on), the very value `/config.residentialPlots` reports: whether a given
 * plot can be held is its own `state`.
 */
import { RESIDENTIAL_PLOTS, type PlotTier } from "@vila/shared/game/world";

import type { Env } from "./api";
import { json, NO_STORE } from "./http";

/** "occupied" is reserved for the phase that brings ownership: nothing answers it today. */
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

/** "true" only with accounts on: holding a plot needs an account. Shared by `/config` and this route. */
export const residentialPlotsEnabled = (env: Env): boolean => env.ACCOUNTS_ENABLED === "true" && env.RESIDENTIAL_PLOTS_ENABLED === "true";

/** The layout the game draws: every plot "available" only when `listed` has its id. */
const fromLayout = (listed: ReadonlySet<string> | null): PlotRow[] =>
  RESIDENTIAL_PLOTS.map(({ id, tier, slot, x, z, facing }) => ({ id, tier, slot, x, z, facing, state: listed?.has(id) ? "available" : "unavailable" }));

const noPlotsTable = (e: unknown): boolean => e instanceof Error && /no such table: residential_plots\b/i.test(e.message);

/** Ids of the plots the table knows, or null when it cannot say (older schema, D1 error): nothing to hold then. */
async function listedPlots(db: D1Database): Promise<Set<string> | null> {
  try {
    const { results } = await db.prepare("SELECT id FROM residential_plots").all<{ id: string }>();
    return new Set(results.map((row) => row.id));
  } catch (e) {
    // An older schema is expected (production is at 0003). Anything else is logged by name, never the message.
    if (!noPlotsTable(e)) console.error("residential_plots_read_failed", e instanceof Error ? e.name : "unknown");
    return null;
  }
}

export async function residentialPlots(env: Env): Promise<Response> {
  const enabled = residentialPlotsEnabled(env);
  const listed = enabled && env.DB ? await listedPlots(env.DB) : null;
  return json({ enabled, plots: fromLayout(listed) }, { headers: NO_STORE });
}
