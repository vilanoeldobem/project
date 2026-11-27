/** The nine story games: solvable, deterministic by seed, and the duplicate interaction resolver. */
import { describe, expect, it } from "vitest";

import { MINIGAMES } from "@vila/shared/game/quests-v2/minigames";
import { STORY_CATALOG } from "@vila/shared/game/quests-v2/catalog";
import type { StoryCatalog } from "@vila/shared/game/quests-v2/types";
import { EMPTY_PROGRESS, type Progress } from "@vila/shared/game/progress";

import {
  STORY_GAMES,
  canSkip,
  matchCorrect,
  matchScore,
  orderCorrect,
  orderScore,
  storyGame,
  storyInteractionFor,
  type Difficulty,
  type MatchPuzzle,
  type OrderPuzzle,
  type Puzzle,
} from "./story-games";

const SEEDS = Array.from({ length: 12 }, (_, i) => `seed-${i}`);
const DIFFICULTIES: readonly Difficulty[] = ["calma", "normal", "desafio"];
const TITLES = new Map(MINIGAMES.map((game) => [game.id, game.title]));

const fingerprint = (puzzle: Puzzle): string =>
  puzzle.kind === "order"
    ? JSON.stringify(puzzle.tokens.map((token) => token.id))
    : JSON.stringify({ left: puzzle.left.map((token) => token.id), right: puzzle.right.map((token) => token.id) });

const swappedOrder = (puzzle: OrderPuzzle): string[] => {
  const picks = [...puzzle.solution];
  [picks[0], picks[1]] = [picks[1], picks[0]];
  return picks;
};

const reversedOrder = (puzzle: OrderPuzzle): string[] => [...puzzle.solution].reverse();

const swappedMatch = (puzzle: MatchPuzzle): Record<string, string> => {
  const pairs = { ...puzzle.solution };
  const [a, b] = puzzle.left.map((token) => token.id);
  [pairs[a], pairs[b]] = [pairs[b], pairs[a]];
  return pairs;
};

const reversedMatch = (puzzle: MatchPuzzle): Record<string, string> => {
  const ids = puzzle.left.map((token) => token.id);
  const pairs = { ...puzzle.solution };
  const last = ids.length - 1;
  [pairs[ids[last - 1]], pairs[ids[last]]] = [pairs[ids[last]], pairs[ids[last - 1]]];
  return pairs;
};

describe("story games", () => {
  it("has the nine games in the canon order with the shared titles", () => {
    expect(STORY_GAMES).toHaveLength(9);
    expect(STORY_GAMES.map((game) => game.id)).toEqual([
      "sino-afinado",
      "fio-do-tempo",
      "treno-na-neve",
      "coro-dos-nomes",
      "mapa-das-estrelas",
      "lago-dos-reflexos",
      "ponte-das-pegadas",
      "forno-da-memoria",
      "jardim-das-estacoes",
    ]);
    for (const game of STORY_GAMES) expect(game.title, game.id).toBe(TITLES.get(game.id));
    expect(storyGame("sino-afinado")).toBe(STORY_GAMES[0]);
    expect(storyGame("jogo-da-memoria" as never)).toBeUndefined();
  });

  it.each(STORY_GAMES.map((game) => [game.id, game] as const))("%s is solvable at every difficulty", (id, game) => {
    for (const difficulty of DIFFICULTIES) {
      const puzzle = game.build(difficulty, "seed-0");
      expect(puzzle.kind, id).toBe(game.id === "fio-do-tempo" || game.id === "treno-na-neve" || game.id === "coro-dos-nomes" || game.id === "ponte-das-pegadas" || game.id === "forno-da-memoria" ? "order" : "match");
      if (puzzle.kind === "order") {
        expect(puzzle.solution.length).toBeGreaterThanOrEqual(4);
        expect(puzzle.solution.length).toBeLessThanOrEqual(6);
        expect(orderCorrect(puzzle, puzzle.solution)).toBe(true);
        expect(orderScore(puzzle, puzzle.solution)).toBe(puzzle.solution.length);
        expect(orderCorrect(puzzle, swappedOrder(puzzle))).toBe(false);
        expect(orderCorrect(puzzle, reversedOrder(puzzle))).toBe(false);
        expect(new Set(puzzle.tokens.map((token) => token.id))).toEqual(new Set(puzzle.solution));
      } else {
        expect(puzzle.left.length).toBeGreaterThanOrEqual(4);
        expect(puzzle.left.length).toBeLessThanOrEqual(8);
        expect(puzzle.left.length).toBe(id === "sino-afinado" ? (difficulty === "calma" ? 4 : difficulty === "normal" ? 5 : 6) : difficulty === "calma" ? 4 : difficulty === "normal" ? 6 : 8);
        expect(matchCorrect(puzzle, puzzle.solution)).toBe(true);
        expect(matchScore(puzzle, puzzle.solution)).toBe(puzzle.left.length);
        expect(matchCorrect(puzzle, swappedMatch(puzzle))).toBe(false);
        expect(matchCorrect(puzzle, reversedMatch(puzzle))).toBe(false);
        expect(new Set(puzzle.left.map((token) => token.id)).size).toBe(puzzle.left.length);
        expect(new Set(puzzle.right.map((token) => token.id)).size).toBe(puzzle.right.length);
      }
    }
  });

  it.each(STORY_GAMES.map((game) => [game.id, game] as const))("%s is deterministic and varies its display", (id, game) => {
    for (const difficulty of DIFFICULTIES) {
      expect(game.build(difficulty, "seed-0")).toEqual(game.build(difficulty, "seed-0"));
      const fingerprints = new Set(SEEDS.map((seed) => fingerprint(game.build(difficulty, seed))));
      expect(fingerprints.size, `${id} ${difficulty}`).toBeGreaterThanOrEqual(6);
    }
  });

  it("allows the skip only after three attempts", () => {
    expect(canSkip(0)).toBe(false);
    expect(canSkip(2)).toBe(false);
    expect(canSkip(3)).toBe(true);
    expect(canSkip(10)).toBe(true);
  });

  it("resolves a duplicate coro interaction by the open quest", () => {
    const catalog: StoryCatalog = {
      ...STORY_CATALOG,
      quests: STORY_CATALOG.quests
        .filter((quest) => quest.id === "b06-r1-07" || quest.id === "b07-c2-03")
        .map((quest) => ("prerequisiteIds" in quest ? { ...quest, prerequisiteIds: [] } : quest)),
    };
    const b06: Progress = { ...EMPTY_PROGRESS, seen: { "b06-r1-07:accept": true } };
    const b07: Progress = { ...EMPTY_PROGRESS, seen: { "b07-c2-03:accept": true } };
    expect(storyInteractionFor("coro-dos-nomes", catalog, b06)?.questId).toBe("b06-r1-07");
    expect(storyInteractionFor("coro-dos-nomes", catalog, b07)?.questId).toBe("b07-c2-03");
    expect(storyInteractionFor("coro-dos-nomes", catalog, b07)?.done).toBe("O coro terminou e cada voz encontrou seu lugar.");
    expect(storyInteractionFor("coro-dos-nomes", catalog, b06)?.done).toBe("O coro encheu a manhã e o sino guardou cada nome.");
    // Both open: the first candidate of the catalog wins, and a seen event moves on to the next.
    const both: Progress = { ...EMPTY_PROGRESS, seen: { "b06-r1-07:accept": true, "b07-c2-03:accept": true } };
    expect(storyInteractionFor("coro-dos-nomes", catalog, both)?.questId).toBe("b06-r1-07");
    const firstSeen: Progress = { ...both, seen: { ...both.seen, "b06-r1-07:coro-dos-nomes": true } };
    expect(storyInteractionFor("coro-dos-nomes", catalog, firstSeen)?.questId).toBe("b07-c2-03");
    expect(storyInteractionFor("missing", catalog, both)).toBeUndefined();
  });
});
