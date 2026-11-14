import { describe, expect, it } from "vitest";

import { LIFE_ACTIVITIES, LIFE_CAST, LIFE_KINDS, type LifePlace, isPerson } from "./life";
import { dayPart, LIFE_NAMES, lifeTalk, type LifeTalkContext, NOTHING_SOLD, SHOP_CLOSED, snowLevel, WAYS, YARD_CLOSED } from "./life-dialogue";
import { SHOP_COPY, SHOPS } from "./world";

const PLACES: LifePlace[] = ["home", "street", "square", "tree", "sleigh", "bench", "stall", "shop", "yard", "paddock", "billboard", "pond", "perch", "edge"];
const HOURS = [0.5, 6, 9.5, 12, 15, 18.5, 21, 23];
const SNOW = [0, 0.2, 0.48, 0.78, 1];

/** Every context a conversation can be opened in, and more: the copy rules hold for all of them. */
function* contexts(): Generator<LifeTalkContext> {
  for (const kind of LIFE_KINDS)
    for (const place of PLACES)
      for (const activity of LIFE_ACTIVITIES)
        for (const hour of HOURS)
          for (const snow of SNOW)
            for (const shopId of kind === "shopkeeper" ? SHOPS.map((s) => s.id) : [undefined])
              for (const turn of kind === "villager" ? [0, 1, 2, 3, -1] : [0]) yield { kind, place, activity, hour, snow, shopId, turn };
}
const ALL = [...contexts()];
const LINES = new Set(ALL.flatMap((ctx) => lifeTalk(ctx)?.lines ?? []));

describe("what the village's characters say (IMPL-0025, PROPOSTA)", () => {
  // Explicit limits on the tests that walk every context: the CI runner is about twice as slow, a busy machine more.
  it("gives people two or three short lines and animals none", { timeout: 30_000 }, () => {
    expect(ALL.length).toBeGreaterThan(50_000);
    for (const ctx of ALL) {
      const talk = lifeTalk(ctx);
      if (!isPerson(ctx.kind)) {
        expect(talk, ctx.kind).toBeNull();
        continue;
      }
      expect(talk, ctx.kind).not.toBeNull();
      expect(talk!.lines.length).toBeGreaterThanOrEqual(2);
      expect(talk!.lines.length).toBeLessThanOrEqual(3);
      expect(talk!.name).toBe(LIFE_NAMES[ctx.kind]!.name);
    }
    expect(LINES.size).toBeGreaterThan(30);
    for (const line of LINES) {
      expect(line.length, line).toBeGreaterThan(8);
      expect(line.length, line).toBeLessThanOrEqual(110);
      expect(/[.!]$/.test(line), line).toBe(true);
    }
    // Everyone in the cast who is a person has a name on the action button; nobody has a person's name.
    for (const c of LIFE_CAST) expect(Boolean(LIFE_NAMES[c.kind]), c.id).toBe(isPerson(c.kind));
    for (const who of Object.values(LIFE_NAMES)) expect(who.action.startsWith("Conversar com "), who.action).toBe(true);
  });

  it("never sells, prices, pressures or asks anything personal, in any line it can produce", () => {
    const text = [...LINES].filter((l) => l !== NOTHING_SOLD);
    const banned: Array<[string, RegExp]> = [
      ["sale", /vend|compr|à venda|oferta|promo|desconto|encomend|reserv|alug/i],
      ["price or currency", /R\$|\breais\b|\breal\b|preç|custa|\bcaro\b|barat|moeda|dinheiro|pag(a|o|ue|ar|amento)\b|grátis|de graça|pix|cartão/i],
      ["pressure", /volte|amanhã|todo dia|todos os dias|não perca|corra|depressa|rápido|agora mesmo|últim|só hoje|falta pouco|precisa|tem que|você deve|\bdoe\b|\bdoem\b|ajude|contribu|não vá embora|fique mais/i],
      ["personal data", /seu nome|se chama você|como você se chama|quantos anos|idade|onde você mora|sua cidade|escola|e-?mail|telefone|whats|endereço|seus pais|sua mãe|seu pai|sua família/i],
      ["a question to the visitor", /\?/],
      ["a machine talking about itself", /\bIA\b|intelig|rob[ôo]|chat|modelo/i],
    ];
    for (const line of text) for (const [what, pattern] of banned) expect(pattern.test(line), `${what}: "${line}"`).toBe(false);
    // The established line is the only one that names selling, and it denies it.
    expect(NOTHING_SOLD).toBe("Nada é vendido na Vila.");
    expect([...LINES].filter((l) => /vend/i.test(l))).toEqual([NOTHING_SOLD]);
    // The global donation and the NGOs are two paths: no line mixes them, and the donation is always a choice.
    for (const line of LINES) {
      expect(/doa/i.test(line) && /ONG/.test(line), line).toBe(false);
      if (/doa/i.test(line)) expect(line, line).toContain("Doar é sempre uma escolha.");
    }
  });

  it("has the lumberjack say what he does today and that the yard is closed: never where firewood will come from", { timeout: 30_000 }, () => {
    for (const ctx of ALL.filter((c) => c.kind === "lumberjack")) {
      const { lines } = lifeTalk(ctx)!;
      expect(lines.join(" ")).toMatch(/corto/);
      expect(lines).toContain("O pátio da lenha está fechado.");
      expect(lines[lines.length - 1]).toBe(NOTHING_SOLD);
    }
    expect(lifeTalk({ kind: "lumberjack", place: "yard", activity: "chop", hour: 10, snow: 0.2 })!.lines).toEqual([
      "Eu corto e empilho lenha aqui, na beira da floresta.",
      "O pátio da lenha está fechado.",
      "Nada é vendido na Vila.",
    ]);
    expect(lifeTalk({ kind: "lumberjack", place: "street", activity: "carry", hour: 10, snow: 0.2 })!.lines).toEqual([
      "Estou levando umas achas para perto do Empório da Lareira. Eu corto a lenha na beira da floresta.",
      "O pátio da lenha está fechado.",
      "Nada é vendido na Vila.",
    ]);
    expect(lifeTalk({ kind: "lumberjack", place: "street", activity: "rest", hour: 12.5, snow: 0.2 })!.lines[0]).toBe("Parei um pouco para descansar os braços. Eu corto e empilho lenha na beira da floresta.");
  });

  it("has each shopkeeper name the shop and its theme, say it is closed, and offer nothing", () => {
    SHOPS.forEach((shop, i) => {
      for (const activity of ["tend", "sweep", "walk"] as const) {
        const { lines, name } = lifeTalk({ kind: "shopkeeper", place: activity === "walk" ? "street" : "shop", activity, hour: 14, snow: 0.5, shopId: shop.id })!;
        expect(name).toBe("Lojista");
        expect(lines[0]).toContain(SHOP_COPY[i].name);
        expect(lines[1]).toContain("A loja está fechada.");
        expect(lines[2]).toBe(NOTHING_SOLD);
      }
      expect(lifeTalk({ kind: "shopkeeper", place: "shop", activity: "tend", hour: 14, snow: 0, shopId: shop.id })!.lines).toEqual([`Este lugar se chama ${SHOP_COPY[i].name}. O tema é ${SHOP_COPY[i].theme}.`, "A loja está fechada.", "Nada é vendido na Vila."]);
    });
    expect(lifeTalk({ kind: "shopkeeper", place: "shop", activity: "sweep", hour: 10, snow: 0, shopId: "shop-01" })!.lines[1]).toBe("A loja está fechada. Eu varro a neve da porta.");
  });

  it("announces nothing that was not decided: no \"not yet\", no opening, nothing a place or a thing \"will\" be or do", () => {
    // "Ainda não abriu" announces an opening nobody decided; "a lenha vai sair daqui" announces a feature. A
    // character says what is there and what it does today. (Its own next step, "estou indo para casa", is not a promise.)
    const FUTURE = /ainda não|não abri|vai abrir|vão abrir|abre em|abre às|reabr|inaugur|em breve|logo mais|daqui a pouco|vai sair|vão sair|vai ter|vão ter|vai chegar|vão chegar|vai funcionar|vai vender|vai poder|será|serão|haverá|quando abrir|quando estiver|no futuro|futur|aguarde|novidade|por enquanto|enquanto isso|até lá|um dia\b/i;
    for (const line of LINES) expect(FUTURE.test(line), `a promise: "${line}"`).toBe(false);
    // The pattern `apps/client/scripts/verify.mjs` holds the panels of the village to (its `PROMISE`): the
    // characters' lines pass it too, the established line about selling included.
    const PROMISE = /em breve|será liberad|quando abrir|ainda não abri|alug|R\$|comprar|preço/i;
    for (const line of LINES) expect(PROMISE.test(line), `verify.mjs would reject: "${line}"`).toBe(false);
    // What a closed place says, in the words of the shop's own panel ("Esta loja está fechada.").
    expect([SHOP_CLOSED, YARD_CLOSED]).toEqual(["A loja está fechada.", "O pátio da lenha está fechado."]);
    expect([...LINES].filter((l) => /fechad/.test(l)).length).toBeGreaterThanOrEqual(3);
    // The patterns do catch what they are for.
    for (const bad of ["A loja ainda não abriu.", "A lenha da Vila vai sair daqui.", "A loja vai abrir em dezembro.", "Em breve teremos novidades.", "Por enquanto só varro a porta."]) expect(FUTURE.test(bad), bad).toBe(true);
  });

  it("has Santa and the elves point to the NGOs and to the tree, by where they are", { timeout: 30_000 }, () => {
    const santaTree = lifeTalk({ kind: "santa", place: "tree", activity: "watch", hour: 16, snow: 0 })!;
    expect(santaTree.name).toBe("Papai Noel");
    expect(santaTree.lines).toEqual(["Ho, ho, ho! Que alegria ver você na Vila.", "A árvore da praça é o coração da Vila.", "Cada casa em volta da praça é de uma ONG. Conheça no seu tempo."]);
    expect(lifeTalk({ kind: "santa", place: "sleigh", activity: "tend", hour: 16, snow: 0 })!.lines[1]).toBe("Estou cuidando do trenó e das renas.");
    for (const ctx of ALL.filter((c) => c.kind === "santa" || c.kind === "elf")) expect(lifeTalk(ctx)!.lines.join(" ")).toMatch(/ONG/);
    expect(lifeTalk({ kind: "elf", place: "street", activity: "carry", hour: 16, snow: 0 })!.lines[0]).toBe("Com licença, estou levando enfeites para a árvore!");
    expect(lifeTalk({ kind: "elf", place: "tree", activity: "place", hour: 16, snow: 0 })!.lines[0]).toBe("Deixamos os enfeites aqui, pertinho da árvore.");
    expect(lifeTalk({ kind: "elf", place: "sleigh", activity: "load", hour: 16, snow: 0 })!.lines[0]).toBe("Estamos arrumando o trenó do Papai Noel.");
  });

  it("has a villager greet by the hour, comment on the weather and point to one of the three paths", () => {
    expect(lifeTalk({ kind: "villager", place: "bench", activity: "chat", hour: 9, snow: 0, turn: 0 })!.lines).toEqual([
      "Bom dia! O céu limpou e a praça está brilhando.",
      "Paramos aqui no banco para pôr a conversa em dia.",
      "Para conhecer as ONGs, o caminho “Explorar ONGs” fica no alto da tela.",
    ]);
    expect(lifeTalk({ kind: "villager", place: "tree", activity: "watch", hour: 15, snow: 0.8, turn: 1 })!.lines).toEqual([
      "Boa tarde! Que nevasca! Hoje é melhor andar devagar e ficar perto das luzes.",
      "Gosto de olhar a árvore daqui.",
      "No caminho “Jogar” tem um jogo da memória.",
    ]);
    expect(lifeTalk({ kind: "villager", place: "street", activity: "walk", hour: 20, snow: 0.3, turn: 2 })!.lines).toEqual([
      "Boa noite! Está caindo uma neve fininha, boa para passear.",
      "Estou dando uma volta pela Vila.",
      "A “Doação global” fica na árvore da praça. Doar é sempre uma escolha.",
    ]);
    expect(lifeTalk({ kind: "villager", place: "street", activity: "walk", hour: 15, snow: 0.9, turn: 0 })!.lines[1]).toBe("Com esta neve, estou indo para casa.");
    // The three paths, by the names on their buttons.
    expect(WAYS.map((w) => /“([^”]+)”/.exec(w)![1])).toEqual(["Explorar ONGs", "Jogar", "Doação global"]);
    for (let turn = -6; turn < 9; turn++) expect(WAYS).toContain(lifeTalk({ kind: "villager", place: "square", activity: "stand", hour: 10, snow: 0, turn })!.lines[2]);
    expect(lifeTalk({ kind: "visitor", place: "billboard", activity: "watch", hour: 11, snow: 0.5 })!.lines).toEqual([
      "Bom dia! Olha a neve caindo. A Vila fica ainda mais bonita.",
      "Vim passear na Vila e estou lendo os avisos das placas.",
      "De manhã a praça acorda devagar.",
    ]);
  });

  it("names the parts of the day and the weather the way the routines do", () => {
    expect([4, 5, 11.9, 12, 17.9, 18, 21.9, 22].map(dayPart)).toEqual(["night", "morning", "morning", "afternoon", "afternoon", "evening", "evening", "night"]);
    expect([0, 0.04, 0.2, 0.48, 0.78, 1].map(snowLevel)).toEqual(["clear", "clear", "light", "snow", "heavy", "heavy"]);
  });
});
