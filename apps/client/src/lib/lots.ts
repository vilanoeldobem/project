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

/**
 * Developer preview of a full village (localhost and dev builds only, like `?envTime`): with `?villageDemo=full`
 * every lot the API answered is drawn as a published house, so the render budget can be measured with every
 * chalet on screen (IMPL-0031). The houses carry a label that says what they are, never the name of an
 * organisation; nothing is written anywhere, and a deployed game ignores the parameter.
 */
export function withDemoHouses<T extends { id: string; state: string; ngo_name: string | null; ngo_level?: number | null }>(lots: T[], search: string, allowed: boolean): T[] {
  if (!allowed || new URLSearchParams(search).get("villageDemo") !== "full") return lots;
  // The five levels of the building in turn (IMPL-0032), so the preview also shows and measures every level.
  return lots.map((lot, i) => (lot.state === "published" ? lot : { ...lot, state: "published", ngo_name: `Casa de demonstração ${i + 1}`, ngo_level: 1 + (i % 5) }));
}

/** Where the developer preview above may run: a dev build, or a local build opened on localhost. Never a deployed game. */
export const demoAllowed = (): boolean => import.meta.env.DEV || (typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
