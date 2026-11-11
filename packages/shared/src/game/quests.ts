/**
 * Quest catalog and state machine (PROPOSTA quests-v1; DEC-039..DEC-042, PEN-025).
 *
 * Pure module: no DOM, no three.js, no Workers runtime. `progress.ts` imports the values here and
 * this file imports only types from `./progress`, so neither module has a runtime cycle.
 *
 * Rules:
 * - one active quest at a time (`activeQuest`);
 * - a quest needs its prerequisite completed, then `accept`, then its objectives (`deliver` quests are
 *   ready as soon as they are accepted: the item exists by derivation), then `turn-in` for the XP;
 * - every objective id is a stable event id; nothing is stored besides `Progress`.
 * Copy (`title`, `description`, `unit`, dialogue) is pt-BR and transcribed from
 * `content/proposals/quests-v1/{quests,npcs,dialogues}.csv`.
 */
import type { Mission, Progress } from "./progress";
import { LOTS } from "./world";

export type ObjectiveType = "talk" | "collect" | "deliver" | "visit" | "read" | "minigame" | "interact";
export type QuestState = "locked" | "available" | "active" | "ready_to_turn_in" | "completed";
export type NpcId = "sleigh-keeper" | "market-keeper" | "postmaster" | "pond-keeper" | "storyteller";

export interface Quest extends Mission {
  chainId: string;
  chainTitle: string;
  order: 1 | 2 | 3;
  description: string;
  objectiveType: ObjectiveType;
  objectKind: "quest_item" | "world_prop" | "none";
  objectId?: string;
  objectName?: string;
  giverNpcId: NpcId;
  turnInNpcId: NpcId;
  prerequisiteId?: string;
  dialogue: { offer: string; turnIn: string };
  objectiveEventIds: readonly string[];
  /** Offered only while at least one lot has a published NGO (no fake NGO when none exists). */
  needsPublishedLot?: boolean;
  /** Shown when talking to the objective NPC during the quest (talk objectives). */
  objectiveDialogue?: string;
}

export interface InventoryItem {
  objectId: string;
  name: string;
  count: number;
  target: number;
  questId: string;
}

export const CHAIN_TITLES: Record<string, string> = {
  "flight-night": "A Noite de Voo",
  "market-opening": "A inauguração da barraca",
  "undelivered-letters": "As cartas que ficaram",
  "lake-lights": "A noite das luzes do lago",
  "village-story": "O livro da Vila",
};

export const NPC_IDS: readonly NpcId[] = ["sleigh-keeper", "market-keeper", "postmaster", "pond-keeper", "storyteller"];

export const QUESTS: Quest[] = [
  {
    id: "harness-bells",
    chainId: "flight-night",
    chainTitle: "A Noite de Voo",
    order: 1,
    track: "explore",
    title: "Sinos do arreio",
    description:
      "O vento da última noite espalhou os sinos do arreio das renas pela neve da praça. Baltazar precisa deles de volta antes da Noite de Voo. Encontre dois sinos ao redor dos pinheiros da praça.",
    objectiveType: "collect",
    objectKind: "quest_item",
    objectId: "reindeer-bell",
    objectName: "Sino do arreio",
    target: 2,
    unit: "sinos",
    xp: 20,
    giverNpcId: "sleigh-keeper",
    turnInNpcId: "sleigh-keeper",
    dialogue: {
      offer:
        "A Noite de Voo chega e as renas balançam sem música. Dois sinos do arreio voaram com o vento e caíram perto dos pinheiros da praça. Traz de volta, ajudante?",
      turnIn: "Ouvi o tinido de longe! Com sinos no arreio, as renas sabem que a viagem é séria. O céu agradece.",
    },
    objectiveEventIds: ["bell-pine-north", "bell-pine-east"],
  },
  {
    id: "route-memory-game",
    chainId: "flight-night",
    chainTitle: "A Noite de Voo",
    order: 2,
    track: "play",
    title: "A rota na memória",
    description:
      "A ventania embaralhou a lista da rota do trenó, escrita por Seu Nivaldo. Treine a memória no Jogo da Memória da Vila e confirme a ordem da rota com o carteiro.",
    objectiveType: "minigame",
    objectKind: "none",
    target: 1,
    unit: "partida",
    xp: 30,
    giverNpcId: "sleigh-keeper",
    turnInNpcId: "postmaster",
    prerequisiteId: "harness-bells",
    dialogue: {
      offer:
        "O vento embaralhou minha lista de rota, que Seu Nivaldo escreveu. Jogue uma partida do Jogo da Memória para treinar o olho e confirme a ordem com ele.",
      turnIn: "Ordem confirmada, palavra por palavra. Memória firme vale mais que vento forte. O céu agradece, guardador de rotas.",
    },
    objectiveEventIds: ["memory-win"],
  },
  {
    id: "charm-for-the-flight",
    chainId: "flight-night",
    chainTitle: "A Noite de Voo",
    order: 3,
    track: "explore",
    title: "O patuá da Noite de Voo",
    description:
      "Todo trenó precisa de um patuá da sorte abençoado antes de voar. Baltazar preparou o dele, mas a bênção cabe a Dona Guida. Leve o patuá à contadora de histórias, perto da grande árvore.",
    objectiveType: "deliver",
    objectKind: "quest_item",
    objectId: "lucky-charm",
    objectName: "Patuá da sorte",
    target: 1,
    unit: "patuá",
    xp: 50,
    giverNpcId: "sleigh-keeper",
    turnInNpcId: "storyteller",
    prerequisiteId: "route-memory-game",
    dialogue: {
      offer:
        "Voo nenhum começa sem patuá. Este é meu, mas bênção quem dá é Dona Guida. Leve até ela, perto da grande árvore, e volte com o coração leve.",
      turnIn: "Um patuá do guardião! Guarde estas palavras: sorte não se carrega, se planta. Pronto: abençoado e pronto para a noite.",
    },
    objectiveEventIds: [],
  },
  {
    id: "market-invitations",
    chainId: "market-opening",
    chainTitle: "A inauguração da barraca",
    order: 1,
    track: "explore",
    title: "Convites para a inauguração",
    description:
      "A barraca de Dona Filó abre na Noite de Voo e ela quer a Vila inteira na festa. Avise Seu Nivaldo, ao lado da caixa de correio, de que os convites estão prontos, e volte para contar.",
    objectiveType: "talk",
    objectKind: "none",
    target: 1,
    unit: "conversa",
    xp: 15,
    giverNpcId: "market-keeper",
    turnInNpcId: "market-keeper",
    dialogue: {
      offer:
        "A inauguração é na Noite de Voo e eu quero a Vila inteira na festa! Avise Seu Nivaldo, ao lado do correio, que os convites estão prontos. Depois volte.",
      turnIn: "Ele mandou lembranças? Que bom! Correio acordado é sinal de festa chegando. Falta pouco, falta pouco.",
    },
    objectiveEventIds: ["talk-postmaster"],
    objectiveDialogue: "Os convites estão prontos? Diga à Dona Filó que o correio já sabe.",
  },
  {
    id: "ornament-crates",
    chainId: "market-opening",
    chainTitle: "A inauguração da barraca",
    order: 2,
    track: "explore",
    title: "Enfeites espalhados pelo vento",
    description:
      "A ventania levou duas caixas de enfeites da barraca para a rua e para a neve ao redor do mercado oeste. Dona Filó conta cada caixa como quem conta ovos. Encontre as duas.",
    objectiveType: "collect",
    objectKind: "quest_item",
    objectId: "ornament-crate",
    objectName: "Caixa de enfeites",
    target: 2,
    unit: "caixas",
    xp: 25,
    giverNpcId: "market-keeper",
    turnInNpcId: "market-keeper",
    prerequisiteId: "market-invitations",
    dialogue: {
      offer:
        "Ventania não respeita barraca armada! Duas caixas de enfeites voaram para a rua. Sem enfeite, inauguração fica só promessa. Traz minhas caixas, tem festa dentro.",
      turnIn: "Minhas caixas! Nenhuma tigela quebrada, milagre da neve macia. Agora a barraca volta a parecer Natal.",
    },
    objectiveEventIds: ["crate-street", "crate-market"],
  },
  {
    id: "market-lucky-game",
    chainId: "market-opening",
    chainTitle: "A inauguração da barraca",
    order: 3,
    track: "play",
    title: "A brincadeira da inauguração",
    description:
      "Antes de abrir a barraca, Dona Filó mantém um costume de feira: alguém precisa vencer o Jogo da Memória da Vila. Ganhe uma partida e avise Baltazar, ao sul, de que o mercado está pronto.",
    objectiveType: "minigame",
    objectKind: "none",
    target: 1,
    unit: "partida",
    xp: 50,
    giverNpcId: "market-keeper",
    turnInNpcId: "sleigh-keeper",
    prerequisiteId: "ornament-crates",
    dialogue: {
      offer: "Todo ano, alguém precisa achar um par no Jogo da Memória antes da barraca abrir. É tradição de feira. Ganha a partida e avisa o Baltazar, meu primeiro freguês.",
      turnIn: "A mercadora mandou aviso? Então a Noite de Voo ganhará cheiro de panetone. E o trenó estaciona na frente, sempre.",
    },
    objectiveEventIds: ["memory-win"],
  },
  {
    id: "frozen-mailbox",
    chainId: "undelivered-letters",
    chainTitle: "As cartas que ficaram",
    order: 1,
    track: "explore",
    title: "A caixa congelada",
    description:
      "O gelo da última ventania trancou a caixa de correio da Vila, e dentro dela dormem cartas do Natal passado. Seu Nivaldo pede que você destrave a caixa junto à placa de boas-vindas.",
    objectiveType: "interact",
    objectKind: "world_prop",
    objectId: "village-mailbox",
    objectName: "Caixa de correio",
    target: 1,
    unit: "caixa",
    xp: 15,
    giverNpcId: "postmaster",
    turnInNpcId: "postmaster",
    dialogue: {
      offer:
        "Uma caixa de correio trancada é uma promessa presa no gelo. Um gesto firme a liberta. Faça este favor à Vila e a este velho carteiro.",
      turnIn: "Aberta! Ouvi o estalo da tampa como um sino de festa. Tem carta dentro, sim. Sempre tem.",
    },
    objectiveEventIds: ["mailbox-open"],
  },
  {
    id: "letter-pairs-game",
    chainId: "undelivered-letters",
    chainTitle: "As cartas que ficaram",
    order: 2,
    track: "play",
    title: "O jogo dos pares",
    description:
      "As cartas antigas perderam o par: quem manda e quem recebe. Seu Nivaldo conhece o treino certo para esse olhar: vencer uma partida do Jogo da Memória, onde cada carta encontra seu par.",
    objectiveType: "minigame",
    objectKind: "none",
    target: 1,
    unit: "partida",
    xp: 30,
    giverNpcId: "postmaster",
    turnInNpcId: "postmaster",
    prerequisiteId: "frozen-mailbox",
    dialogue: {
      offer:
        "No correio, toda carta tem par: quem escreve e quem lê. Nesta pilha, os pares se esconderam. Vença o Jogo da Memória e seus olhos aprenderão a reuni-los.",
      turnIn: "Pares reunidos! Seu olhar agora merece franquia postal. E a última carta tem endereço novo, sabia?",
    },
    objectiveEventIds: ["memory-win"],
  },
  {
    id: "newest-house-visit",
    chainId: "undelivered-letters",
    chainTitle: "As cartas que ficaram",
    order: 3,
    track: "causes",
    title: "A casa mais nova da Vila",
    description:
      "A última carta guardada é para a casa mais nova da Vila: a de uma ONG publicada. Visite um terreno com casa publicada, conheça quem mora lá e leve a notícia a Dona Guida, que guarda a história da Vila.",
    objectiveType: "visit",
    objectKind: "none",
    target: 1,
    unit: "visita",
    xp: 50,
    giverNpcId: "postmaster",
    turnInNpcId: "storyteller",
    prerequisiteId: "letter-pairs-game",
    dialogue: {
      offer:
        "Restou uma carta sem endereço certo: é para a casa mais nova da Vila. Visite-a, conheça quem mora lá e leve a notícia a Dona Guida, guardiã da nossa história.",
      turnIn: "A casa mais nova entrou no meu livro, e quem trouxe foi você. Numa Vila, vizinho novo é capítulo novo.",
    },
    objectiveEventIds: LOTS.map((l) => l.id),
    needsPublishedLot: true,
  },
  {
    id: "lake-lanterns",
    chainId: "lake-lights",
    chainTitle: "A noite das luzes do lago",
    order: 1,
    track: "explore",
    title: "Lanternas sob a neve",
    description:
      "A Noite das Luzes chegou, mas o vento enterrou as lanternas da margem na neve perto dos pinheiros do leste. Aurora precisa de duas lanternas para acender a beira do lago congelado.",
    objectiveType: "collect",
    objectKind: "quest_item",
    objectId: "lake-lantern",
    objectName: "Lanterna do lago",
    target: 2,
    unit: "lanternas",
    xp: 20,
    giverNpcId: "pond-keeper",
    turnInNpcId: "pond-keeper",
    dialogue: {
      offer: "A água dorme, mas a noite acorda com luz. Duas das minhas lanternas dormem debaixo da neve, perto dos pinheiros do leste. Traz para mim?",
      turnIn: "Ainda quentes de tanto esperar. Quando acendê-las, o lago guardará o céu dentro dele.",
    },
    objectiveEventIds: ["lantern-lake-1", "lantern-lake-2"],
  },
  {
    id: "kids-sled-run",
    chainId: "lake-lights",
    chainTitle: "A noite das luzes do lago",
    order: 2,
    track: "play",
    title: "Uma descida de trenó",
    description:
      "Para levar as lanternas até o lago, Aurora sugere o caminho da garotada: o trenó pequeno guardado ao sul, perto do grande trenó. Dê uma volta nele, do jeito brincante da Vila.",
    objectiveType: "interact",
    objectKind: "world_prop",
    objectId: "kids-sled",
    objectName: "Trenó pequeno",
    target: 1,
    unit: "volta",
    xp: 25,
    giverNpcId: "pond-keeper",
    turnInNpcId: "pond-keeper",
    prerequisiteId: "lake-lanterns",
    dialogue: {
      offer: "Luz carregada com pressa escorre. O trenó pequeno da garotada desce devagar e sorrindo. Dê uma volta nele, e as lanternas viajam sem peso.",
      turnIn: "Ouvi sua risada daqui. Riso também ilumina margem de lago. Falta pouco para a noite ficar pronta.",
    },
    objectiveEventIds: ["sled-ride"],
  },
  {
    id: "lantern-for-the-flight",
    chainId: "lake-lights",
    chainTitle: "A noite das luzes do lago",
    order: 3,
    track: "explore",
    title: "A luz que guia o voo",
    description:
      "Com as luzes da margem acesas, Aurora separa a lanterna mais firme para a grande noite: ela guiará o voo do trenó. Leve a lanterna a Baltazar, ao sul, junto ao trenó do Noel.",
    objectiveType: "deliver",
    objectKind: "quest_item",
    objectId: "lake-lantern",
    objectName: "Lanterna do lago",
    target: 1,
    unit: "lanterna",
    xp: 50,
    giverNpcId: "pond-keeper",
    turnInNpcId: "sleigh-keeper",
    prerequisiteId: "kids-sled-run",
    dialogue: {
      offer: "Uma destas lanternas não é minha de guardar: é do voo. Leve-a a Baltazar, junto ao grande trenó, que o céu da noite reconhece de longe.",
      turnIn: "A luz da vigia! Renas gostam de lago que brilha, sabia? Com ela na frente, a rota fica curta e alegre.",
    },
    objectiveEventIds: [],
  },
  {
    id: "tree-promise-visit",
    chainId: "village-story",
    chainTitle: "O livro da Vila",
    order: 1,
    track: "causes",
    title: "A promessa da árvore",
    description:
      "O livro da Vila tem uma página em branco, e Dona Guida sabe onde está a resposta: na grande árvore da praça. Visite a árvore e o painel de doação global que ela guarda.",
    objectiveType: "visit",
    objectKind: "none",
    target: 1,
    unit: "visita",
    xp: 15,
    giverNpcId: "storyteller",
    turnInNpcId: "storyteller",
    dialogue: {
      offer: "Toda Vila tem história; a nossa ainda tem página em branco. A grande árvore guarda uma promessa antiga. Vá vê-la e volte com os olhos cheios.",
      turnIn: "Esteve diante da árvore? Então já sabe: promessa boa é a que se entende. Falta ler o que ela promete.",
    },
    objectiveEventIds: ["tree"],
  },
  {
    id: "donation-promise-reading",
    chainId: "village-story",
    chainTitle: "O livro da Vila",
    order: 2,
    track: "causes",
    title: "O que a árvore promete",
    description:
      "A promessa da árvore está escrita no painel de doação global. Leia com calma: para onde vai a doação global, o que ela não é e por que jogar nunca é doar.",
    objectiveType: "read",
    objectKind: "world_prop",
    objectId: "donation-panel",
    objectName: "Painel de doação global",
    target: 1,
    unit: "leitura",
    xp: 20,
    giverNpcId: "storyteller",
    turnInNpcId: "storyteller",
    prerequisiteId: "tree-promise-visit",
    dialogue: {
      offer: "Página de livro não se adivinha, se lê. Abra o painel da árvore e leia a promessa com calma. Palavra lida vira palavra sabida.",
      turnIn: "Doação global vai para uma única instituição, nunca repartida entre as ONGs da Vila. E brincar nunca é doar. Sabedoria de árvore, essa.",
    },
    objectiveEventIds: ["read-confirm"],
  },
  {
    id: "story-page-delivery",
    chainId: "village-story",
    chainTitle: "O livro da Vila",
    order: 3,
    track: "explore",
    title: "A última página",
    description:
      "A página em branco do livro da Vila foi escrita com o que você viu e leu. Dona Guida a entrega a você para que a história viaje: leve a página a Seu Nivaldo, junto à caixa de correio.",
    objectiveType: "deliver",
    objectKind: "quest_item",
    objectId: "story-page",
    objectName: "Página da história",
    target: 1,
    unit: "página",
    xp: 50,
    giverNpcId: "storyteller",
    turnInNpcId: "postmaster",
    prerequisiteId: "donation-promise-reading",
    dialogue: {
      offer: "Toda história acaba em viagem. Esta página é sua, do começo ao fim. Leve-a a Seu Nivaldo, no correio: carta de história é a que mais viaja.",
      turnIn: "Uma página do livro da Vila! Guardarei com as cartas de amor, que são o mesmo tipo de promessa. Obrigado, portador de histórias.",
    },
    objectiveEventIds: [],
  },
];

const byId = new Map(QUESTS.map((q) => [q.id, q]));

const seenKey = (questId: string, eventId: string) => `${questId}:${eventId}`;

export function questState(p: Progress, questId: string): QuestState {
  const quest = byId.get(questId);
  if (!quest) return "locked";
  if (p.completed[questId]) return "completed";
  if (quest.prerequisiteId && !p.completed[quest.prerequisiteId]) return "locked";
  if (!p.seen[seenKey(questId, "accept")]) return "available";
  // Deliver quests carry the item by derivation: they are ready the moment they are accepted.
  if (quest.objectiveType === "deliver") return "ready_to_turn_in";
  const seen = quest.objectiveEventIds.filter((id) => p.seen[seenKey(questId, id)]).length;
  return seen >= quest.target ? "ready_to_turn_in" : "active";
}

/** The single quest that is `active` or `ready_to_turn_in`, if any (one active quest at a time). */
export function activeQuest(p: Progress): Quest | undefined {
  return QUESTS.find((q) => {
    const state = questState(p, q.id);
    return state === "active" || state === "ready_to_turn_in";
  });
}

/** `available` and no other quest in progress. */
export function canAccept(p: Progress, questId: string): boolean {
  return questState(p, questId) === "available" && activeQuest(p) === undefined;
}

export function questProgress(p: Progress, questId: string): { count: number; target: number } {
  const quest = byId.get(questId);
  if (!quest) return { count: 0, target: 0 };
  if (p.completed[questId]) return { count: quest.target, target: quest.target };
  if (!p.seen[seenKey(questId, "accept")]) return { count: 0, target: quest.target };
  if (quest.objectiveType === "deliver") return { count: 1, target: quest.target };
  const seen = quest.objectiveEventIds.filter((id) => p.seen[seenKey(questId, id)]).length;
  return { count: Math.min(seen, quest.target), target: quest.target };
}

/** Quest items carried by the active quest, derived from progress (nothing new is stored). */
export function activeInventory(p: Progress): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const quest of QUESTS) {
    if (quest.objectKind !== "quest_item" || !quest.objectId || !quest.objectName) continue;
    const state = questState(p, quest.id);
    if (state !== "active" && state !== "ready_to_turn_in") continue;
    const count = quest.objectiveType === "deliver" ? 1 : questProgress(p, quest.id).count;
    if (count > 0) items.push({ objectId: quest.objectId, name: quest.objectName, count, target: quest.target, questId: quest.id });
  }
  return items;
}
