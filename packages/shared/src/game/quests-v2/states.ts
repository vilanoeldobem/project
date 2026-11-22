/**
 * World-state selectors (PROPOSTA): a state is on when the story quest that changes the world is completed.
 * Nothing is stored beyond `Progress`; callers memoize the set per progress version.
 */
import type { Progress } from "../progress";
import type { StoryCatalog, WorldStateId } from "./types";

export function worldStatesIn(catalog: StoryCatalog, p: Progress): ReadonlySet<WorldStateId> {
  const out = new Set<WorldStateId>();
  for (const quest of catalog.quests) {
    if (!("book" in quest) || !quest.worldState || !p.completed[quest.id]) continue;
    out.add(quest.worldState);
  }
  return out;
}

export function worldStateOnIn(catalog: StoryCatalog, p: Progress, state: WorldStateId): boolean {
  return worldStatesIn(catalog, p).has(state);
}
