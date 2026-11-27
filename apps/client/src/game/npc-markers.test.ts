/** The marker over a quest NPC reads the same catalog the dialogue reads. */
import { describe, expect, it } from "vitest";

import { EMPTY_PROGRESS } from "@vila/shared/game/progress";
import { applyEventIn, catalogFor, questStateIn } from "@vila/shared/game/quests-v2/catalog";

import { npcMarkers } from "./npc-markers";

const NPC = [{ id: "sleigh-keeper", name: "Baltazar" }, { id: "storyteller", name: "Dona Guida" }];
const only = (id: string) => NPC.filter((npc) => npc.id === id);

describe("npc markers", () => {
  it("announces the v1 epilogue at once", () => {
    const labels = npcMarkers(only("sleigh-keeper"), catalogFor(true, true), EMPTY_PROGRESS);
    expect(labels.get("sleigh-keeper")).toBe("! Baltazar");
  });

  it("keeps the v1-only page exactly as before", () => {
    const labels = npcMarkers(only("sleigh-keeper"), catalogFor(true, false), EMPTY_PROGRESS);
    expect(labels.get("sleigh-keeper")).toBe("! Baltazar");
  });

  it("marks a book quest available on a v2-only page", () => {
    const labels = npcMarkers(only("storyteller"), catalogFor(false, true), EMPTY_PROGRESS);
    expect(labels.get("storyteller")).toBe("! Dona Guida");
  });

  it("gives the turn-in `?` and the giver `...` while the quest runs", () => {
    const catalog = catalogFor(false, true);
    const active = applyEventIn(catalog, EMPTY_PROGRESS, "b01-c1-01", "accept").progress;
    const labels = npcMarkers([...only("storyteller"), { id: "mestre-anselmo", name: "Mestre Anselmo" }], catalog, active);
    expect(labels.get("storyteller")).toBe("... Dona Guida");
    expect(labels.get("mestre-anselmo")).toBe("... Mestre Anselmo");

    const ready = applyEventIn(catalog, active, "b01-c1-01", "talk-anselmo-arrival").progress;
    expect(questStateIn(catalog, ready, "b01-c1-01")).toBe("ready_to_turn_in");
    const done = npcMarkers([{ id: "mestre-anselmo", name: "Mestre Anselmo" }], catalog, ready);
    expect(done.get("mestre-anselmo")).toBe("? Mestre Anselmo");
  });
});
