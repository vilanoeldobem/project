/**
 * A lot the API does not list: the API answered its lots and this one is not among them (a database before
 * migration 0012, which adds the lots of the expanded village, IMPL-0024). The game draws it from the shared
 * layout, but it takes no application yet, so nothing may call it available: its 3D label, its panel and the
 * "Explorar ONGs" list all use `UNLISTED_LABEL`, and a visit to it is not sent as progress (an API that does not
 * list the lot may not know its id either).
 */
export const UNLISTED_LABEL = "Terreno em preparação";

/** True when the API answered its lots and `lotId` is not one of them. Before the answer, no lot is unlisted. */
export const isUnlisted = (lots: Readonly<Record<string, unknown>>, lotId: string): boolean => Object.keys(lots).length > 0 && !lots[lotId];

/**
 * The short 3D label of a lot: the NGO of a published house; "being prepared" for a lot the API does not list
 * (never "available": it takes no application); otherwise available.
 */
export function lotLabel(lots: Readonly<Record<string, { state: string; ngo_name: string | null }>>, lotId: string): string {
  const lot = lots[lotId];
  if (lot?.state === "published" && lot.ngo_name) return lot.ngo_name;
  return isUnlisted(lots, lotId) ? UNLISTED_LABEL : "Terreno disponível";
}
