/**
 * Story v2 contracts (PROPOSTA; DEC-039..042, PEN-025). English identifiers; user-facing copy stays pt-BR in
 * the book modules. The v2 runtime is parameterized: every engine and UI function receives the catalog, so a
 * book PR only fills its own module and never edits shared files.
 */
import type { Collider } from "../collision";
import type { Mission } from "../progress";
import type { Quest } from "../quests";
import type { Minigame } from "./minigames";

export const REGIONS = [
  { id: "praca-grande-arvore", name: "Praça da Grande Árvore", book: 1 },
  { id: "mercado-panetone", name: "Mercado do Panetone", book: 1 },
  { id: "jardim-casas", name: "Jardim das Casas", book: 2 },
  { id: "oficina-brinquedos", name: "Oficina dos Brinquedos", book: 2 },
  { id: "colina-correio", name: "Colina do Correio", book: 3 },
  { id: "campanario", name: "Campanário", book: 3 },
  { id: "bosque-pinheiros", name: "Bosque dos Pinheiros", book: 4 },
  { id: "lago-espelho", name: "Lago Espelho", book: 4 },
  { id: "estacao-treno", name: "Estação do Trenó", book: 5 },
  { id: "casa-fio-vale-vento-branco", name: "Casa do Fio e Vale do Vento Branco", book: 5 },
  { id: "vila-amanhecer", name: "Vila do Amanhecer", book: 6 },
  { id: "estrada-orvalho", name: "Estrada do Orvalho", book: 6 },
  { id: "ponte-gelo", name: "Ponte de Gelo", book: 7 },
  { id: "vale-ecos", name: "Vale dos Ecos", book: 7 },
  { id: "jardim-sol", name: "Jardim do Sol", book: 8 },
  { id: "mercado-estacoes", name: "Mercado das Estações", book: 8 },
  { id: "pedra-fundamental", name: "Pedra Fundamental", book: 9 },
  { id: "arquivo-neves", name: "Arquivo das Neves", book: 9 },
  { id: "torre-tempo", name: "Torre do Tempo", book: 10 },
  { id: "praca-nova-noite", name: "Praça da Nova Noite", book: 10 },
] as const;
export type RegionId = (typeof REGIONS)[number]["id"];

export type EntryKind = "prologue" | "main" | "regional" | "side" | "epilogue" | "postgame" | "milestone" | "quick";
export type StoryKind = "main" | "regional" | "side" | "postgame";
export type Theme =
  | "chegada" | "memoria" | "cuidado" | "coragem" | "comunidade" | "natureza" | "tempo" | "partida" | "fio" | "amanhecer";
export type Audience = "todos" | "criancas" | "familias";
export type MetricTag = "historia-principal" | "arco-regional" | "secundaria" | "epilogo" | "pos-jogo" | "marco" | "rapida";
export type Accessibility = "leitura" | "coleta" | "visita" | "entrega" | "conversa" | "minijogo" | "interacao";
export type WorldStateId =
  | "bell-rung" | "market-open" | "garden-named" | "toy-finished" | "mail-sorted" | "clock-running"
  | "brasa-home" | "lake-lit" | "platform-open" | "loom-woven" | "star-lit" | "postman-named"
  | "alba-remembered" | "dawn-bell" | "dew-road" | "bridge-named" | "echo-whole" | "summer-bloom"
  | "seasons-complete" | "foundation-named" | "archive-authored" | "last-hour" | "new-vigil";
export type CounterKey =
  | "missions" | "trades" | "houses" | "memory-wins" | "letters" | "bells" | "trails" | "lanterns"
  | "departures" | "threads" | "mornings" | "dew-footprints" | "bridges" | "echoes" | "summers"
  | "seasons" | "foundations" | "origins" | "hours" | "vigils";
export type Reward = { kind: "cosmetic"; cosmeticId: string } | null;

/**
 * v2 NPC ids are open strings (Mestre Anselmo, Nina, ...) and v2 orders go up to 8 (a regional arc), while v1
 * `Quest` narrows `giverNpcId`/`turnInNpcId` to the five `NpcId`s and `order` to 1..3. `StoryQuest` therefore
 * extends `Omit<Quest, "giverNpcId" | "turnInNpcId" | "order">` and re-adds those three fields with the v2
 * types; every other Quest field is inherited unchanged.
 */
export interface StoryQuest extends Omit<Quest, "giverNpcId" | "turnInNpcId" | "order"> {
  giverNpcId: string;
  turnInNpcId: string;
  order: number;
  book: number;
  chapter: 0 | 1 | 2 | 3;
  region: RegionId | null;
  kind: StoryKind;
  prerequisiteIds: readonly string[];
  worldState: WorldStateId | null;
  theme: Theme;
  audience: Audience;
  metricTag: MetricTag;
  accessibility: Accessibility;
  reward: Reward;
}
export type CatalogQuest = Quest | StoryQuest;

export interface Milestone {
  id: string;
  book: number;
  chainId: string;
  order: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  counterKey: CounterKey;
  threshold: number;
  xp: number;
  reward: Reward;
  region: RegionId;
}

export interface ManifestEntry {
  id: string;
  kind: EntryKind;
  book: number;
  region: RegionId | null;
  xp: number;
  prerequisiteIds: readonly string[];
  status: "pending";
}

export interface StoryNpc {
  id: string;
  name: string;
  role: string;
  seed: string;
  x: number;
  z: number;
  rot: number;
  book: number;
  greeting?: string;
  requires?: readonly WorldStateId[];
}

export interface StorySpawn {
  id: string;
  questId: string;
  objectId: string;
  x: number;
  z: number;
  book: number;
  requires?: readonly WorldStateId[];
}

export interface StoryInteraction {
  id: string;
  questId: string;
  objectId: string;
  x: number;
  z: number;
  radius: number;
  book: number;
  kind: "prop" | "talk" | "minigame";
  npcId?: string;
  label?: string;
  done?: string;
  requires?: readonly WorldStateId[];
}

export interface StoryWorld {
  npcs: readonly StoryNpc[];
  spawns: readonly StorySpawn[];
  interactions: readonly StoryInteraction[];
  obstacles: readonly Collider[];
}

export interface StoryCatalog {
  quests: readonly CatalogQuest[];
  milestones: readonly Milestone[];
  minigames: readonly Minigame[];
  quickMissions: readonly Mission[];
}
