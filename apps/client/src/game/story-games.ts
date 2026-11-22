/**
 * Rules of the nine story minigames (PROPOSTA, slice 12). Pure data and functions: no React, no store, no
 * timer and no `Math.random`. The two calm mechanics are ordering (a sequence of themed tokens) and matching
 * (each left token belongs to one right token). A seed changes only the display order; the solution is the
 * canonical order/pairs for the game and difficulty. The memory game stays in `ui/MemoryGame.tsx` and is the
 * tenth game.
 */
import type { MinigameId } from "@vila/shared/game/quests-v2/minigames";
import type { StoryInteraction } from "@vila/shared/game/quests-v2/types";
import { STORY_WORLD } from "@vila/shared/game/quests-v2/world";
import { Rng } from "../scene/gen/rng";

export type StoryGameId = Exclude<MinigameId, "jogo-da-memoria">;
export type Difficulty = "calma" | "normal" | "desafio";

export interface Token {
  id: string;
  label: string;
}

export interface OrderPuzzle {
  kind: "order";
  rule: string;
  hint: string;
  tokens: Token[];
  solution: string[];
}

export interface MatchPuzzle {
  kind: "match";
  rule: string;
  hint: string;
  left: Token[];
  right: Token[];
  solution: Record<string, string>;
}

export type Puzzle = OrderPuzzle | MatchPuzzle;

export interface StoryGameDefinition {
  id: StoryGameId;
  title: string;
  icon: string;
  summary: string;
  instruction: string;
  build: (difficulty: Difficulty, seed: string) => Puzzle;
}

interface MatchPair {
  left: Token;
  right: Token;
}

interface OrderData {
  kind: "order";
  rule: string;
  hint: string;
  tiers: Record<Difficulty, readonly Token[]>;
}

interface MatchData {
  kind: "match";
  rule: string;
  hint: string;
  tiers: Record<Difficulty, readonly MatchPair[]>;
}

type GameData = OrderData | MatchData;

const t = (id: string, label: string): Token => ({ id, label });
const pair = (left: Token, right: Token): MatchPair => ({ left, right });

const META: Record<StoryGameId, Omit<StoryGameDefinition, "build">> = {
  "sino-afinado": {
    id: "sino-afinado",
    title: "Sino Afinado",
    icon: "🔔",
    summary: "Ajuste cada sino à nota que a canção pede.",
    instruction: "Toque cada sino e escolha a nota certa no campanário.",
  },
  "fio-do-tempo": {
    id: "fio-do-tempo",
    title: "Fio do Tempo",
    icon: "🧵",
    summary: "Ordene os fios do mais antigo ao mais novo.",
    instruction: "Coloque os fios do tempo na ordem, do mais antigo ao mais novo.",
  },
  "treno-na-neve": {
    id: "treno-na-neve",
    title: "Trenó na Neve",
    icon: "🛷",
    summary: "Marque o caminho do trenó pela neve.",
    instruction: "Escolha o caminho do trenó, do alto da colina até a estação.",
  },
  "coro-dos-nomes": {
    id: "coro-dos-nomes",
    title: "Coro dos Nomes",
    icon: "🎶",
    summary: "Junte as vozes na ordem da canção.",
    instruction: "Coloque as vozes na ordem da canção, da primeira à última.",
  },
  "mapa-das-estrelas": {
    id: "mapa-das-estrelas",
    title: "Mapa das Estrelas",
    icon: "✨",
    summary: "Ligue cada estrela à sua constelação.",
    instruction: "Ligue cada estrela à constelação certa no mapa.",
  },
  "lago-dos-reflexos": {
    id: "lago-dos-reflexos",
    title: "Lago dos Reflexos",
    icon: "🌊",
    summary: "Encontre o reflexo de cada coisa no lago.",
    instruction: "Encontre o reflexo de cada coisa no lago.",
  },
  "ponte-das-pegadas": {
    id: "ponte-das-pegadas",
    title: "Ponte das Pegadas",
    icon: "👣",
    summary: "Atravesse a ponte na ordem das pegadas.",
    instruction: "Marque as pegadas na ordem, da menor para a maior.",
  },
  "forno-da-memoria": {
    id: "forno-da-memoria",
    title: "Forno da Memória",
    icon: "🍞",
    summary: "Siga a receita do forno sem pressa.",
    instruction: "Siga a receita do forno, do primeiro passo ao último.",
  },
  "jardim-das-estacoes": {
    id: "jardim-das-estacoes",
    title: "Jardim das Estações",
    icon: "🌷",
    summary: "Plante cada flor na estação certa.",
    instruction: "Plante cada flor na estação certa do jardim.",
  },
};

const fio = {
  calma: [
    t("fio-1", "A primeira promessa (ano 1)"),
    t("fio-2", "A carta de Alba (ano 12)"),
    t("fio-3", "O trenó de Baltazar (ano 30)"),
    t("fio-4", "A Longa Noite (ano 50)"),
  ],
  normal: [
    t("fio-1", "A primeira promessa (ano 1)"),
    t("fio-2", "A carta de Alba (ano 12)"),
    t("fio-3", "O trenó de Baltazar (ano 30)"),
    t("fio-4", "A Longa Noite (ano 50)"),
    t("fio-5", "O amanhecer (ano 51)"),
  ],
  desafio: [
    t("fio-1", "A primeira promessa (ano 1)"),
    t("fio-2", "A carta de Alba (ano 12)"),
    t("fio-3", "O trenó de Baltazar (ano 30)"),
    t("fio-4", "A Longa Noite (ano 50)"),
    t("fio-5", "O amanhecer (ano 51)"),
    t("fio-6", "A nova vigília (ano 52)"),
  ],
} as const;

const treno = {
  calma: [
    t("treno-hill", "Alto da colina"),
    t("treno-pine", "Curva do pinheiro"),
    t("treno-bridge", "Ponte de gelo"),
    t("treno-station", "Estação do Trenó"),
  ],
  normal: [
    t("treno-hill", "Alto da colina"),
    t("treno-pine", "Curva do pinheiro"),
    t("treno-bridge", "Ponte de gelo"),
    t("treno-valley", "Vale do Vento Branco"),
    t("treno-station", "Estação do Trenó"),
  ],
  desafio: [
    t("treno-hill", "Alto da colina"),
    t("treno-pine", "Curva do pinheiro"),
    t("treno-bridge", "Ponte de gelo"),
    t("treno-valley", "Vale do Vento Branco"),
    t("treno-plaza", "Praça da Vila"),
    t("treno-station", "Estação do Trenó"),
  ],
} as const;

const coro = {
  calma: [t("voz-guida", "Dona Guida"), t("voz-nina", "Nina"), t("voz-tomas", "Tomás"), t("voz-alba", "Alba")],
  normal: [
    t("voz-guida", "Dona Guida"),
    t("voz-nina", "Nina"),
    t("voz-tomas", "Tomás"),
    t("voz-brasa", "Brasa"),
    t("voz-alba", "Alba"),
  ],
  desafio: [
    t("voz-guida", "Dona Guida"),
    t("voz-nina", "Nina"),
    t("voz-tomas", "Tomás"),
    t("voz-brasa", "Brasa"),
    t("voz-nivaldo", "Seu Nivaldo"),
    t("voz-alba", "Alba"),
  ],
} as const;

const pegadas = {
  calma: [
    t("pegada-passarinho", "Pegada de passarinho"),
    t("pegada-lia", "Pegada de Lia"),
    t("pegada-tomas", "Pegada de Tomás"),
    t("pegada-guardiao", "Pegada do Guardião"),
  ],
  normal: [
    t("pegada-passarinho", "Pegada de passarinho"),
    t("pegada-lia", "Pegada de Lia"),
    t("pegada-pip", "Pegada de Pip"),
    t("pegada-tomas", "Pegada de Tomás"),
    t("pegada-guardiao", "Pegada do Guardião"),
  ],
  desafio: [
    t("pegada-passarinho", "Pegada de passarinho"),
    t("pegada-lia", "Pegada de Lia"),
    t("pegada-pip", "Pegada de Pip"),
    t("pegada-tomas", "Pegada de Tomás"),
    t("pegada-brasa", "Pegada de Brasa"),
    t("pegada-guardiao", "Pegada do Guardião"),
  ],
} as const;

const forno = {
  calma: [
    t("forno-acender", "Acender o forno"),
    t("forno-peneirar", "Peneirar a farinha"),
    t("forno-sovar", "Sovar a massa"),
    t("forno-assar", "Assar o pão"),
  ],
  normal: [
    t("forno-acender", "Acender o forno"),
    t("forno-peneirar", "Peneirar a farinha"),
    t("forno-acucar", "Misturar o açúcar"),
    t("forno-sovar", "Sovar a massa"),
    t("forno-assar", "Assar o pão"),
  ],
  desafio: [
    t("forno-acender", "Acender o forno"),
    t("forno-peneirar", "Peneirar a farinha"),
    t("forno-acucar", "Misturar o açúcar"),
    t("forno-sovar", "Sovar a massa"),
    t("forno-assar", "Assar o pão"),
    t("forno-repartir", "Repartir na feira"),
  ],
} as const;

const sinoPairs = [
  pair(t("sino-1", "Sino de 1 palmo"), t("nota-la", "Lá (agudo)")),
  pair(t("sino-2", "Sino de 2 palmos"), t("nota-sol", "Sol")),
  pair(t("sino-3", "Sino de 3 palmos"), t("nota-fa", "Fá")),
  pair(t("sino-4", "Sino de 4 palmos"), t("nota-mi", "Mi")),
  pair(t("sino-5", "Sino de 5 palmos"), t("nota-re", "Ré")),
  pair(t("sino-6", "Sino de 6 palmos"), t("nota-do", "Dó (grave)")),
] as const;

const lagoPairs = [
  pair(t("lago-lanterna", "Lanterna"), t("reflexo-luz", "Luz tremida")),
  pair(t("lago-sino", "Sino"), t("reflexo-circulo", "Círculo escuro")),
  pair(t("lago-rena", "Rena"), t("reflexo-galhada", "Galhada")),
  pair(t("lago-casa", "Casa"), t("reflexo-janela", "Janela acesa")),
  pair(t("lago-estrela", "Estrela"), t("reflexo-ponto", "Ponto no fundo")),
  pair(t("lago-treno", "Trenó"), t("reflexo-rastro", "Rastro na margem")),
  pair(t("lago-ponte", "Ponte"), t("reflexo-arco", "Arco partido")),
  pair(t("lago-vela", "Vela"), t("reflexo-chama", "Chama invertida")),
] as const;

const mapaPairs = [
  pair(t("estrela-chegada", "Estrela da Chegada"), t("constelacao-porta", "Constelação da Porta")),
  pair(t("estrela-correio", "Estrela do Correio"), t("constelacao-carta", "Constelação da Carta")),
  pair(t("estrela-lago", "Estrela do Lago"), t("constelacao-espelho", "Constelação do Espelho")),
  pair(t("estrela-treno", "Estrela do Trenó"), t("constelacao-treno", "Constelação do Trenó")),
  pair(t("estrela-vigilia", "Estrela da Vigília"), t("constelacao-vela", "Constelação da Vela")),
  pair(t("estrela-amanhecer", "Estrela do Amanhecer"), t("constelacao-sol", "Constelação do Sol")),
  pair(t("estrela-fundacao", "Estrela da Fundação"), t("constelacao-pedra", "Constelação da Pedra")),
  pair(t("estrela-arquivo", "Estrela do Arquivo"), t("constelacao-livro", "Constelação do Livro")),
] as const;

const jardimPairs = [
  pair(t("flor-degelo", "Flor de degelo"), t("estacao-primavera", "Primavera")),
  pair(t("flor-sol", "Flor de sol"), t("estacao-verao", "Verão")),
  pair(t("flor-colheita", "Flor de colheita"), t("estacao-outono", "Outono")),
  pair(t("flor-geada", "Flor de geada"), t("estacao-inverno", "Inverno")),
  pair(t("flor-orvalho", "Flor de orvalho"), t("estacao-primavera", "Primavera")),
  pair(t("flor-sombra", "Flor de sombra"), t("estacao-verao", "Verão")),
  pair(t("flor-vento", "Flor de vento"), t("estacao-outono", "Outono")),
  pair(t("flor-neve", "Flor de neve"), t("estacao-inverno", "Inverno")),
] as const;

const DATA: Record<StoryGameId, GameData> = {
  "sino-afinado": {
    kind: "match",
    rule: "Quanto maior o sino, mais grave a nota.",
    hint: "Comece pelo sino maior: ele pede a nota mais grave.",
    tiers: {
      calma: sinoPairs.slice(0, 4),
      normal: sinoPairs.slice(0, 5),
      desafio: sinoPairs,
    },
  },
  "fio-do-tempo": {
    kind: "order",
    rule: "Ordene os fios do mais antigo ao mais novo.",
    hint: "O ano 1 abre o fio.",
    tiers: fio,
  },
  "treno-na-neve": {
    kind: "order",
    rule: "Ordene o caminho do alto da colina até a estação.",
    hint: "A colina é o começo; a estação é o fim.",
    tiers: treno,
  },
  "coro-dos-nomes": {
    kind: "order",
    rule: "A canção começa em Dona Guida e termina em Alba. Ordene as vozes do meio.",
    hint: "Dona Guida abre a canção e Alba fecha.",
    tiers: coro,
  },
  "mapa-das-estrelas": {
    kind: "match",
    rule: "Cada estrela pertence à constelação que leva o seu nome.",
    hint: "A constelação tem o mesmo nome da estrela.",
    tiers: {
      calma: mapaPairs.slice(0, 4),
      normal: mapaPairs.slice(0, 6),
      desafio: mapaPairs,
    },
  },
  "lago-dos-reflexos": {
    kind: "match",
    rule: "Cada coisa do lago tem um reflexo. Encontre o par de cada uma.",
    hint: "A lanterna reflete uma luz que treme.",
    tiers: {
      calma: lagoPairs.slice(0, 4),
      normal: lagoPairs.slice(0, 6),
      desafio: lagoPairs,
    },
  },
  "ponte-das-pegadas": {
    kind: "order",
    rule: "Ordene as pegadas da menor para a maior.",
    hint: "O passarinho deixa a menor pegada.",
    tiers: pegadas,
  },
  "forno-da-memoria": {
    kind: "order",
    rule: "Siga a receita do forno, do primeiro passo ao último.",
    hint: "Acender o forno vem antes de tudo.",
    tiers: forno,
  },
  "jardim-das-estacoes": {
    kind: "match",
    rule: "Cada flor abre numa estação. Leve cada flor ao seu canteiro.",
    hint: "A primavera recebe a flor de degelo.",
    tiers: {
      calma: jardimPairs.slice(0, 4),
      normal: jardimPairs.slice(0, 6),
      desafio: jardimPairs,
    },
  },
};

const GAME_IDS: readonly StoryGameId[] = [
  "sino-afinado",
  "fio-do-tempo",
  "treno-na-neve",
  "coro-dos-nomes",
  "mapa-das-estrelas",
  "lago-dos-reflexos",
  "ponte-das-pegadas",
  "forno-da-memoria",
  "jardim-das-estacoes",
];

const shuffle = <T>(rng: Rng, items: readonly T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const uniqueRight = (pairs: readonly MatchPair[]): Token[] => {
  const seen = new Map<string, Token>();
  for (const pair of pairs) if (!seen.has(pair.right.id)) seen.set(pair.right.id, pair.right);
  return [...seen.values()];
};

const buildOrder = (id: StoryGameId, data: OrderData, difficulty: Difficulty, seed: string): OrderPuzzle => {
  const rng = new Rng(`${id}|${difficulty}|${seed}`, "story-game");
  const solution = data.tiers[difficulty].map((token) => token.id);
  return { kind: "order", rule: data.rule, hint: data.hint, tokens: shuffle(rng, data.tiers[difficulty]), solution };
};

const buildMatch = (id: StoryGameId, data: MatchData, difficulty: Difficulty, seed: string): MatchPuzzle => {
  const rng = new Rng(`${id}|${difficulty}|${seed}`, "story-game");
  const pairs = data.tiers[difficulty];
  return {
    kind: "match",
    rule: data.rule,
    hint: data.hint,
    left: shuffle(rng, pairs.map((pair) => pair.left)),
    right: shuffle(rng, uniqueRight(pairs)),
    solution: Object.fromEntries(pairs.map((pair) => [pair.left.id, pair.right.id])),
  };
};

export const STORY_GAMES: readonly StoryGameDefinition[] = GAME_IDS.map((id) => {
  const meta = META[id];
  const data = DATA[id];
  return {
    ...meta,
    build: (difficulty, seed) =>
      data.kind === "order" ? buildOrder(id, data, difficulty, seed) : buildMatch(id, data, difficulty, seed),
  };
});

export const storyGame = (id: StoryGameId): StoryGameDefinition | undefined =>
  STORY_GAMES.find((game) => game.id === id);

/** The interaction of the active quest when duplicate ids exist (`coro-dos-nomes` appears four times). */
export function storyInteractionFor(id: string, activeQuestId?: string): StoryInteraction | undefined {
  if (activeQuestId) {
    const exact = STORY_WORLD.interactions.find((interaction) => interaction.id === id && interaction.questId === activeQuestId);
    if (exact) return exact;
  }
  return STORY_WORLD.interactions.find((interaction) => interaction.id === id);
}

export const canSkip = (attempts: number): boolean => attempts >= 3;

export const orderCorrect = (puzzle: OrderPuzzle, picks: readonly string[]): boolean =>
  picks.length === puzzle.solution.length && puzzle.solution.every((id, index) => picks[index] === id);

export const orderScore = (puzzle: OrderPuzzle, picks: readonly string[]): number => {
  const length = Math.min(picks.length, puzzle.solution.length);
  let score = 0;
  for (let i = 0; i < length; i++) if (picks[i] === puzzle.solution[i]) score++;
  return score;
};

export const matchCorrect = (puzzle: MatchPuzzle, pairs: Readonly<Record<string, string>>): boolean =>
  puzzle.left.every((token) => pairs[token.id] === puzzle.solution[token.id]);

export const matchScore = (puzzle: MatchPuzzle, pairs: Readonly<Record<string, string>>): number =>
  puzzle.left.filter((token) => pairs[token.id] === puzzle.solution[token.id]).length;

