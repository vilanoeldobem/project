/** The ten minigames and the shared accessibility contract. */
import { describe, expect, it } from "vitest";

import { MINIGAMES, minigameForInteraction } from "./minigames";
import { STORY_WORLD } from "./world";

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

describe("story interaction mapping", () => {
  it("maps every current minigame interaction to one game", () => {
    const interactions = STORY_WORLD.interactions.filter((interaction) => interaction.kind === "minigame");
    expect(interactions.length).toBe(25);
    for (const interaction of interactions) expect(minigameForInteraction(interaction), interaction.id).toBeDefined();
  });

  it("names the memory, trenó and fio labels and the three singing aliases", () => {
    expect(minigameForInteraction({ id: "play-memory-toy-test", label: "Jogar Jogo da Memória" })?.id).toBe("jogo-da-memoria");
    expect(minigameForInteraction({ id: "play-treno-na-neve", label: "Jogar Trenó na Neve" })?.id).toBe("treno-na-neve");
    expect(minigameForInteraction({ id: "b10-r1-07-fio", label: "Jogar Fio do Tempo" })?.id).toBe("fio-do-tempo");
    for (const id of ["sing-brasa-calm", "sing-brasa-again", "sing-lake-echo"]) {
      expect(minigameForInteraction({ id, label: "Cantar com Brasa" })?.id).toBe("coro-dos-nomes");
    }
    expect(minigameForInteraction({ id: "unknown", label: "Interagir" })).toBeUndefined();
  });
});
