/**
 * The ten story minigames (PROPOSTA; slice 12 implements the rules). The XP of a quest never depends on the
 * result; every game has the same skip contract: no timer, adjustable difficulty, and a skip control after
 * three attempts. The existing memory game keeps its v1 event id, so v1 events do not change.
 */
export type MinigameId =
  | "jogo-da-memoria" | "sino-afinado" | "fio-do-tempo" | "treno-na-neve" | "coro-dos-nomes"
  | "mapa-das-estrelas" | "lago-dos-reflexos" | "ponte-das-pegadas" | "forno-da-memoria" | "jardim-das-estacoes";

export interface Minigame {
  id: MinigameId;
  title: string;
  /** Event written when the player completes the game; the active quest lists the one it waits for. */
  eventId: string;
  skipAfterAttempts: 3;
  difficulties: readonly ["calma", "normal", "desafio"];
  timed: false;
}

const game = (id: MinigameId, title: string, eventId: string = id): Minigame => ({
  id,
  title,
  eventId,
  skipAfterAttempts: 3,
  difficulties: ["calma", "normal", "desafio"],
  timed: false,
});

export const MINIGAMES: readonly Minigame[] = [
  game("jogo-da-memoria", "Jogo da Memória", "memory-win"),
  game("sino-afinado", "Sino Afinado"),
  game("fio-do-tempo", "Fio do Tempo"),
  game("treno-na-neve", "Trenó na Neve"),
  game("coro-dos-nomes", "Coro dos Nomes"),
  game("mapa-das-estrelas", "Mapa das Estrelas"),
  game("lago-dos-reflexos", "Lago dos Reflexos"),
  game("ponte-das-pegadas", "Ponte das Pegadas"),
  game("forno-da-memoria", "Forno da Memória"),
  game("jardim-das-estacoes", "Jardim das Estações"),
];
