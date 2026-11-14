/**
 * What the village's characters say (PROPOSTA of the technical owner, IMPL-0025; the product owner decides the
 * final lines, OQ-20). Fixed pt-BR text chosen by who the character is, where it is, what it is doing, the hour
 * and the weather: no language model, no free text, no question asked of the visitor.
 *
 * Rules of the copy (`life.test.ts` checks them over every line that can be produced):
 *
 * - two or three short lines, then the dialogue closes: no tree, no sequence, nothing to come back for;
 * - nothing is sold in the village: a shopkeeper or the lumberjack says what the place is about and that it has
 *   not opened ("Nada é vendido na Vila." is the established line), never a price, a currency or an offer;
 * - no pressure to stay, return, donate or spend; "Doar é sempre uma escolha." when the donation is mentioned;
 * - the global donation is one path of the village, the NGOs are another: no line mixes them (DEC-010..013);
 * - nothing personal is asked or said: no name, age, place, school or contact.
 */
import { SHOP_COPY, SHOPS } from "./world";
import type { LifeActivity, LifeKind, LifePlace } from "./life";

export interface LifeTalkContext {
  kind: LifeKind;
  place: LifePlace;
  activity: LifeActivity;
  /** São Paulo hour, 0..24. */
  hour: number;
  /** Snowfall, 0..1. */
  snow: number;
  /** The shop a shopkeeper keeps. */
  shopId?: string;
  /** Any whole number: turns which of the three paths a villager points to (the caller passes one per character). */
  turn?: number;
}

export interface LifeTalk {
  /** Who is talking, as the panel's title and the action button name it. Never a person's name. */
  name: string;
  /** One line over the title: what the character is. */
  role: string;
  lines: string[];
}

/** Characters a visitor can talk to: the people. Animals react, they do not talk. */
export const LIFE_NAMES: Partial<Record<LifeKind, { name: string; role: string; action: string }>> = {
  santa: { name: "Papai Noel", role: "Visitante ilustre da Vila", action: "Conversar com Papai Noel" },
  elf: { name: "Duende", role: "Ajudante do Papai Noel", action: "Conversar com o duende" },
  shopkeeper: { name: "Lojista", role: "Cuida de uma loja da praça", action: "Conversar com lojista" },
  lumberjack: { name: "Lenhador", role: "Cuida do pátio da lenha", action: "Conversar com o lenhador" },
  villager: { name: "Morador da Vila", role: "Vizinho da praça", action: "Conversar com morador" },
  visitor: { name: "Visitante", role: "Veio passear na Vila", action: "Conversar com visitante" },
};

export const NOTHING_SOLD = "Nada é vendido na Vila.";

export type DayPart = "morning" | "afternoon" | "evening" | "night";
export const dayPart = (hour: number): DayPart => (hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : hour >= 18 && hour < 22 ? "evening" : "night");
export type SnowLevel = "clear" | "light" | "snow" | "heavy";
export const snowLevel = (snow: number): SnowLevel => (snow < 0.05 ? "clear" : snow < 0.35 ? "light" : snow < 0.65 ? "snow" : "heavy");

const GREETING: Record<DayPart, string> = { morning: "Bom dia!", afternoon: "Boa tarde!", evening: "Boa noite!", night: "Boa noite!" };
const WEATHER: Record<SnowLevel, string> = {
  clear: "O céu limpou e a praça está brilhando.",
  light: "Está caindo uma neve fininha, boa para passear.",
  snow: "Olha a neve caindo. A Vila fica ainda mais bonita.",
  heavy: "Que nevasca! Hoje é melhor andar devagar e ficar perto das luzes.",
};
const HOUR: Record<DayPart, string> = {
  morning: "De manhã a praça acorda devagar.",
  afternoon: "À tarde a praça fica mais movimentada.",
  evening: "A esta hora as luzes da Vila já estão acesas.",
  night: "A Vila está quieta a esta hora.",
};
const VILLAGER_PLACE: Partial<Record<LifePlace, string>> = {
  bench: "Paramos aqui no banco para pôr a conversa em dia.",
  tree: "Gosto de olhar a árvore daqui.",
  stall: "Estou olhando as barracas da feira.",
  paddock: "Vim ver as renas. Elas gostam de companhia.",
  pond: "O lago congelado fica bonito visto daqui.",
};
/** The three paths of the HUD, by the names on their buttons (`PATHS`, `ui/Hud.tsx`). */
export const WAYS: readonly string[] = [
  "Para conhecer as ONGs, o caminho “Explorar ONGs” fica no alto da tela.",
  "No caminho “Jogar” tem um jogo da memória.",
  "A “Doação global” fica na árvore da praça. Doar é sempre uma escolha.",
];

const shopOf = (shopId: string | undefined) => SHOP_COPY[Math.max(0, SHOPS.findIndex((s) => s.id === shopId)) % SHOP_COPY.length];

/** The lines of one conversation. Deterministic in its context; two or three lines. */
export function lifeTalk(ctx: LifeTalkContext): LifeTalk | null {
  const who = LIFE_NAMES[ctx.kind];
  if (!who) return null;
  const part = dayPart(ctx.hour), level = snowLevel(ctx.snow);
  const hello = `${GREETING[part]} ${WEATHER[level]}`;
  let lines: string[];
  switch (ctx.kind) {
    case "lumberjack":
      lines =
        ctx.place === "yard"
          ? ["A lenha da Vila vai sair daqui, do pátio na beira da floresta.", "O pátio da lenha ainda não abriu.", NOTHING_SOLD]
          : ctx.activity === "carry" || ctx.place === "shop"
            ? ["Estou levando umas achas para perto do Empório da Lareira.", "A lenha vai sair do pátio, no fim da travessa norte. Ele ainda não abriu.", NOTHING_SOLD]
            : ["Parei um pouco para descansar os braços.", "A lenha vai sair do pátio na beira da floresta, que ainda não abriu.", NOTHING_SOLD];
      break;
    case "shopkeeper": {
      const shop = shopOf(ctx.shopId);
      lines =
        ctx.place === "shop"
          ? [`Este lugar se chama ${shop.name}. O tema é ${shop.theme}.`, ctx.activity === "sweep" ? "A loja ainda não abriu. Enquanto isso, varro a neve da porta." : "A loja ainda não abriu.", NOTHING_SOLD]
          : [`Eu cuido de uma loja da praça: ${shop.name}.`, "A loja ainda não abriu.", NOTHING_SOLD];
      break;
    }
    case "santa":
      lines =
        ctx.place === "tree"
          ? ["Ho, ho, ho! Que alegria ver você na Vila.", "A árvore da praça é o coração da Vila.", "Cada casa em volta da praça é de uma ONG. Conheça no seu tempo."]
          : ["Ho, ho, ho! Que alegria ver você na Vila.", "Estou cuidando do trenó e das renas.", "Cada casa em volta da praça é de uma ONG. Conheça no seu tempo."];
      break;
    case "elf":
      lines =
        ctx.activity === "carry"
          ? ["Com licença, estou levando enfeites para a árvore!", "A árvore fica bem no meio da praça.", "As casas em volta da praça são das ONGs."]
          : ctx.place === "tree"
            ? ["Deixamos os enfeites aqui, pertinho da árvore.", "A árvore é o coração da Vila.", "As casas em volta da praça são das ONGs."]
            : ["Estamos arrumando o trenó do Papai Noel.", "Os enfeites vão daqui para a árvore da praça.", "As casas em volta da praça são das ONGs."];
      break;
    case "visitor":
      lines = [hello, ctx.place === "billboard" ? "Vim passear na Vila e estou lendo os avisos das placas." : "Vim passear na Vila. As avenidas levam todas até a árvore.", HOUR[part]];
      break;
    default:
      lines = [hello, (ctx.activity !== "walk" && VILLAGER_PLACE[ctx.place]) || (level === "heavy" ? "Vou me recolher até a neve acalmar." : "Estou dando uma volta pela Vila."), WAYS[(((ctx.turn ?? 0) % WAYS.length) + WAYS.length) % WAYS.length]];
  }
  return { name: who.name, role: who.role, lines };
}
