/**
 * Level of an NGO's building in the village (IMPL-0032, PROPOSTA): the house on its lot grows with the total of
 * the donations confirmed for that NGO. Pure: the API computes the level and sends the level alone, never the
 * amount; the game draws the building of that level.
 *
 * The thresholds are **placeholders of the technical owner**, not a product decision. Whether a building should
 * grow with money at all, on which base (gross or net, amount or number of donations), what an NGO that takes
 * donations on its own page gets, and whether a level may go down after a refund are the product owner's to
 * answer (OQ-23). Until then the feature is dark: `NGO_LEVELS_ENABLED` is "false" in production and staging,
 * and so is `DONATIONS_ENABLED`, so every house is drawn at level 1.
 *
 * What the level is not: it is not a ranking shown as a list, it unlocks nothing, it gives no XP (DEC-042) and
 * it says nothing about the quality of an organisation.
 */

/** The first level and the last. */
export const NGO_LEVEL_MIN = 1;
export const NGO_LEVEL_MAX = 5;
export type NgoLevel = 1 | 2 | 3 | 4 | 5;

/**
 * The confirmed total, in cents, from which each level starts (index 0 = level 1). Placeholders (OQ-23):
 * R$ 0, R$ 500, R$ 2 500, R$ 10 000 and R$ 50 000.
 */
export const NGO_LEVEL_FROM_CENTS: readonly number[] = [0, 50_000, 250_000, 1_000_000, 5_000_000];

/**
 * The level for a confirmed total in cents. Anything that is not a positive, finite amount is level 1: a house
 * with no donation is a house like any other, never a missing one.
 */
export function ngoLevel(confirmedCents: number | null | undefined): NgoLevel {
  if (typeof confirmedCents !== "number" || !Number.isFinite(confirmedCents)) return 1;
  let level = 1;
  for (let i = 1; i < NGO_LEVEL_FROM_CENTS.length; i++) if (confirmedCents >= NGO_LEVEL_FROM_CENTS[i]) level = i + 1;
  return level as NgoLevel;
}

/** A level as the scene takes it: whatever arrives (null with the feature off, a number from the API) becomes 1…5. */
export function asNgoLevel(value: unknown): NgoLevel {
  return typeof value === "number" && Number.isInteger(value) && value >= NGO_LEVEL_MIN && value <= NGO_LEVEL_MAX ? (value as NgoLevel) : 1;
}
