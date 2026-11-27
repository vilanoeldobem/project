/**
 * The symbol over a quest NPC (`?` ready, `!` available, `...` in progress; `npc-markers.test.ts`), never colour
 * alone. One pass over the catalog the dialogue also reads, so a locked quest (the v2 epilogue gate, a book not
 * reached yet) never shows `!`.
 */
import type { Progress } from "@vila/shared/game/progress";
import { questStateIn } from "@vila/shared/game/quests-v2/catalog";
import type { StoryCatalog } from "@vila/shared/game/quests-v2/types";

const RANK = { "?": 3, "!": 2, "...": 1 } as const;
type Marker = keyof typeof RANK;

/** `id → "<marker> <name>"` for the given NPCs, or `id → "<name>"` when the quest book has nothing for it. */
export function npcMarkers(
  npcs: readonly { id: string; name: string }[],
  catalog: StoryCatalog,
  progress: Progress
): ReadonlyMap<string, string> {
  const markers = new Map<string, Marker>();
  const set = (id: string, marker: Marker) => {
    const previous = markers.get(id);
    if (!previous || RANK[marker] > RANK[previous]) markers.set(id, marker);
  };
  for (const quest of catalog.quests) {
    const state = questStateIn(catalog, progress, quest.id);
    if (state === "ready_to_turn_in") set(quest.turnInNpcId, "?");
    else if (state === "available") set(quest.giverNpcId, "!");
    else if (state === "active") {
      set(quest.giverNpcId, "...");
      set(quest.turnInNpcId, "...");
    }
  }
  return new Map(
    npcs.map((npc) => {
      const marker = markers.get(npc.id);
      return [npc.id, marker ? `${marker} ${npc.name}` : npc.name];
    })
  );
}
