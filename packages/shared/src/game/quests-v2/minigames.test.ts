/** The ten minigames and the shared accessibility contract. */
import { describe, expect, it } from "vitest";

import { MINIGAMES } from "./minigames";

describe("minigames", () => {
  it("has ten unique ids and keeps the memory event", () => {
    expect(MINIGAMES).toHaveLength(10);
    expect(new Set(MINIGAMES.map((game) => game.id)).size).toBe(10);
    expect(MINIGAMES.find((game) => game.id === "jogo-da-memoria")?.eventId).toBe("memory-win");
  });

  it("never times a game and always offers the skip after three attempts", () => {
    for (const game of MINIGAMES) {
      expect(game.timed).toBe(false);
      expect(game.skipAfterAttempts).toBe(3);
      expect(game.difficulties).toEqual(["calma", "normal", "desafio"]);
      expect(game.eventId.length).toBeGreaterThan(0);
    }
  });
});
