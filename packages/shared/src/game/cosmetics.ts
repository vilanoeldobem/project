/**
 * Avatar cosmetics catalogue and unlock rules (IMPL-0010, P08/IMPL-0027) — **PROPOSTA**: the ten categories,
 * the 100 items and the free/paid split are the technical owner's proposal for the P08 board. The product
 * record confirms free and paid items in ten categories (DEC-033; functional specification item 8); the paid
 * purchase itself is pending (PEN-022) and is not simulated here.
 *
 * Rules (non-negotiable, AGENTS.md):
 * - free items unlock only by completing missions or reaching levels, derived from `Progress` (read-only
 *   here; the XP rules in progress.ts are unchanged);
 * - every free item is reachable without donating (no mission involves donating; levels come from missions);
 * - paid items are catalogue entries only: `isUnlockedIn` (cosmetics-v2.ts) is always false and `Ver compra`
 *   never grants one; the rules that read this catalogue live in cosmetics-v2.ts;
 * - no purchases, loot boxes, random drops or rewards for time online.
 * `name` and requirement texts are user-facing pt-BR copy.
 */

/** The ten appearance categories of P08, in the board's order. */
export type Slot = "helmet" | "blouse" | "pants" | "dress" | "shoes" | "back" | "face" | "handLeft" | "handRight" | "special";

export type Unlock =
  | { kind: "default" }
  | { kind: "mission"; missionId: string }
  | { kind: "level"; level: number }
  | { kind: "paid" };

export interface Cosmetic {
  id: string;
  slot: Slot;
  name: string;
  unlock: Unlock;
}

export const SLOTS: Slot[] = ["helmet", "blouse", "pants", "dress", "shoes", "back", "face", "handLeft", "handRight", "special"];

export const SLOT_LABELS: Record<Slot, string> = {
  helmet: "Capacete",
  blouse: "Blusa",
  pants: "Calça",
  dress: "Vestido",
  shoes: "Sapato",
  back: "Costas",
  face: "Rosto",
  handLeft: "Mão esquerda",
  handRight: "Mão direita",
  special: "Especial",
};

const mission = (missionId: string): Unlock => ({ kind: "mission", missionId });
const level = (level: number): Unlock => ({ kind: "level", level });
const PAID: Unlock = { kind: "paid" };
const DEFAULT: Unlock = { kind: "default" };

/**
 * The catalogue: ten entries per slot, default first, then seven free items, then two paid. The order inside
 * a slot is the presence wire contract (`net/protocol.ts`): never reorder a slot without changing the
 * protocol; append only.
 */
export const COSMETICS: Cosmetic[] = [
  // Capacete
  { id: "helmet-santa", slot: "helmet", name: "Gorro de Noel", unlock: DEFAULT },
  { id: "helmet-beanie", slot: "helmet", name: "Gorro de tricô", unlock: mission("explore-gifts") },
  { id: "helmet-earmuffs", slot: "helmet", name: "Protetor de orelha", unlock: mission("play-memory") },
  { id: "helmet-holly", slot: "helmet", name: "Coroa de azevinho", unlock: mission("causes-visit-lot") },
  { id: "helmet-elf", slot: "helmet", name: "Gorro de duende", unlock: mission("explore-gifts") },
  { id: "helmet-hood", slot: "helmet", name: "Capuz de inverno", unlock: mission("play-memory") },
  { id: "helmet-snowman", slot: "helmet", name: "Chapéu de neve", unlock: mission("causes-visit-lot") },
  { id: "helmet-antlers", slot: "helmet", name: "Galhada de rena", unlock: level(2) },
  { id: "helmet-crown", slot: "helmet", name: "Coroa dourada", unlock: PAID },
  { id: "helmet-top", slot: "helmet", name: "Cartola", unlock: PAID },

  // Blusa
  { id: "blouse-plain", slot: "blouse", name: "Casaco vermelho", unlock: DEFAULT },
  { id: "blouse-stripes", slot: "blouse", name: "Suéter listrado", unlock: mission("explore-gifts") },
  { id: "blouse-snowflake", slot: "blouse", name: "Suéter floco de neve", unlock: mission("play-memory") },
  { id: "blouse-pine", slot: "blouse", name: "Suéter verde", unlock: mission("causes-visit-lot") },
  { id: "blouse-fairisle", slot: "blouse", name: "Suéter fairisle", unlock: mission("explore-gifts") },
  { id: "blouse-dots", slot: "blouse", name: "Blusa de bolinhas", unlock: mission("play-memory") },
  { id: "blouse-night", slot: "blouse", name: "Blusa noite", unlock: mission("causes-visit-lot") },
  { id: "blouse-vest", slot: "blouse", name: "Colete de lã", unlock: level(2) },
  { id: "blouse-gold", slot: "blouse", name: "Blusa dourada", unlock: PAID },
  { id: "blouse-patch", slot: "blouse", name: "Blusa remendada", unlock: PAID },

  // Calça
  { id: "pants-blue", slot: "pants", name: "Calça azul", unlock: DEFAULT },
  { id: "pants-charcoal", slot: "pants", name: "Calça chumbo", unlock: mission("explore-gifts") },
  { id: "pants-brown", slot: "pants", name: "Calça marrom", unlock: mission("play-memory") },
  { id: "pants-pine", slot: "pants", name: "Calça verde", unlock: mission("causes-visit-lot") },
  { id: "pants-plaid", slot: "pants", name: "Calça xadrez", unlock: mission("explore-gifts") },
  { id: "pants-snow", slot: "pants", name: "Calça de neve", unlock: mission("play-memory") },
  { id: "pants-patch", slot: "pants", name: "Calça remendada", unlock: level(2) },
  { id: "pants-cuffed", slot: "pants", name: "Calça dobrada", unlock: mission("causes-visit-lot") },
  { id: "pants-gold", slot: "pants", name: "Calça dourada", unlock: PAID },
  { id: "pants-leather", slot: "pants", name: "Calça de couro", unlock: PAID },

  // Vestido
  { id: "dress-none", slot: "dress", name: "Sem vestido", unlock: DEFAULT },
  { id: "dress-red", slot: "dress", name: "Vestido vermelho", unlock: mission("explore-gifts") },
  { id: "dress-pine", slot: "dress", name: "Vestido verde", unlock: mission("play-memory") },
  { id: "dress-snow", slot: "dress", name: "Vestido de neve", unlock: mission("causes-visit-lot") },
  { id: "dress-cream", slot: "dress", name: "Vestido creme", unlock: mission("explore-gifts") },
  { id: "dress-elf", slot: "dress", name: "Vestido de duende", unlock: mission("play-memory") },
  { id: "dress-gold", slot: "dress", name: "Vestido dourado", unlock: level(2) },
  { id: "dress-plaid", slot: "dress", name: "Vestido xadrez", unlock: mission("causes-visit-lot") },
  { id: "dress-stars", slot: "dress", name: "Vestido estrelado", unlock: PAID },
  { id: "dress-velvet", slot: "dress", name: "Vestido de veludo", unlock: PAID },

  // Sapato
  { id: "shoes-brown", slot: "shoes", name: "Botas marrons", unlock: DEFAULT },
  { id: "shoes-black", slot: "shoes", name: "Botas pretas", unlock: mission("explore-gifts") },
  { id: "shoes-red", slot: "shoes", name: "Botas vermelhas", unlock: mission("play-memory") },
  { id: "shoes-pine", slot: "shoes", name: "Botas verdes", unlock: mission("causes-visit-lot") },
  { id: "shoes-snow", slot: "shoes", name: "Botas de neve", unlock: mission("explore-gifts") },
  { id: "shoes-fur", slot: "shoes", name: "Botas felpudas", unlock: mission("play-memory") },
  { id: "shoes-clog", slot: "shoes", name: "Tamancos", unlock: level(2) },
  { id: "shoes-sneaker", slot: "shoes", name: "Tênis de neve", unlock: mission("causes-visit-lot") },
  { id: "shoes-skates", slot: "shoes", name: "Patins", unlock: PAID },
  { id: "shoes-gold", slot: "shoes", name: "Sapatos dourados", unlock: PAID },

  // Costas
  { id: "back-none", slot: "back", name: "Sem acessório nas costas", unlock: DEFAULT },
  { id: "back-wings", slot: "back", name: "Asas de neve", unlock: mission("explore-gifts") },
  { id: "back-cape", slot: "back", name: "Capa vermelha", unlock: mission("play-memory") },
  { id: "back-sack", slot: "back", name: "Saco de presentes", unlock: mission("causes-visit-lot") },
  { id: "back-backpack", slot: "back", name: "Mochila de trilha", unlock: mission("explore-gifts") },
  { id: "back-wreath", slot: "back", name: "Guirlanda", unlock: mission("play-memory") },
  { id: "back-board", slot: "back", name: "Prancha de neve", unlock: level(2) },
  { id: "back-flag", slot: "back", name: "Bandeira da Vila", unlock: mission("causes-visit-lot") },
  { id: "back-tree", slot: "back", name: "Pinheirinho", unlock: PAID },
  { id: "back-sled", slot: "back", name: "Trenó pequeno", unlock: PAID },

  // Rosto
  { id: "face-none", slot: "face", name: "Sem acessório no rosto", unlock: DEFAULT },
  { id: "face-glasses", slot: "face", name: "Óculos redondos", unlock: mission("explore-gifts") },
  { id: "face-freckles", slot: "face", name: "Sardas", unlock: mission("play-memory") },
  { id: "face-mustache", slot: "face", name: "Bigode", unlock: mission("causes-visit-lot") },
  { id: "face-beard", slot: "face", name: "Barba de neve", unlock: mission("explore-gifts") },
  { id: "face-blush", slot: "face", name: "Bochechas rosadas", unlock: mission("play-memory") },
  { id: "face-scarf", slot: "face", name: "Cachecol no queixo", unlock: level(2) },
  { id: "face-patch", slot: "face", name: "Tapa-olho", unlock: mission("causes-visit-lot") },
  { id: "face-monocle", slot: "face", name: "Monóculo", unlock: PAID },
  { id: "face-frost", slot: "face", name: "Geada no rosto", unlock: PAID },

  // Mão esquerda
  { id: "hand-left-none", slot: "handLeft", name: "Mão esquerda livre", unlock: DEFAULT },
  { id: "hand-left-candy", slot: "handLeft", name: "Bengala doce", unlock: mission("explore-gifts") },
  { id: "hand-left-bell", slot: "handLeft", name: "Sininho", unlock: mission("play-memory") },
  { id: "hand-left-snowball", slot: "handLeft", name: "Bola de neve", unlock: mission("causes-visit-lot") },
  { id: "hand-left-mug", slot: "handLeft", name: "Caneca quente", unlock: mission("explore-gifts") },
  { id: "hand-left-gift", slot: "handLeft", name: "Presentinho", unlock: mission("play-memory") },
  { id: "hand-left-holly", slot: "handLeft", name: "Ramo de azevinho", unlock: level(2) },
  { id: "hand-left-broom", slot: "handLeft", name: "Vassourinha", unlock: mission("causes-visit-lot") },
  { id: "hand-left-lantern", slot: "handLeft", name: "Lanterna", unlock: PAID },
  { id: "hand-left-star", slot: "handLeft", name: "Estrela guia", unlock: PAID },

  // Mão direita
  { id: "hand-right-none", slot: "handRight", name: "Mão direita livre", unlock: DEFAULT },
  { id: "hand-right-candy", slot: "handRight", name: "Bengala doce", unlock: mission("explore-gifts") },
  { id: "hand-right-bell", slot: "handRight", name: "Sininho", unlock: mission("play-memory") },
  { id: "hand-right-snowball", slot: "handRight", name: "Bola de neve", unlock: mission("causes-visit-lot") },
  { id: "hand-right-mug", slot: "handRight", name: "Caneca quente", unlock: mission("explore-gifts") },
  { id: "hand-right-gift", slot: "handRight", name: "Presentinho", unlock: mission("play-memory") },
  { id: "hand-right-holly", slot: "handRight", name: "Ramo de azevinho", unlock: level(2) },
  { id: "hand-right-broom", slot: "handRight", name: "Vassourinha", unlock: mission("causes-visit-lot") },
  { id: "hand-right-lantern", slot: "handRight", name: "Lanterna", unlock: PAID },
  { id: "hand-right-star", slot: "handRight", name: "Estrela guia", unlock: PAID },

  // Especial
  { id: "special-none", slot: "special", name: "Sem efeito", unlock: DEFAULT },
  { id: "special-halo", slot: "special", name: "Auréola", unlock: mission("explore-gifts") },
  { id: "special-snow", slot: "special", name: "Flocos de neve", unlock: mission("play-memory") },
  { id: "special-sparkle", slot: "special", name: "Brilho", unlock: mission("causes-visit-lot") },
  { id: "special-star", slot: "special", name: "Estrela sobre a cabeça", unlock: mission("explore-gifts") },
  { id: "special-fireflies", slot: "special", name: "Vagalumes", unlock: mission("play-memory") },
  { id: "special-heart", slot: "special", name: "Coração de luz", unlock: level(2) },
  { id: "special-frost", slot: "special", name: "Geada", unlock: mission("causes-visit-lot") },
  { id: "special-aurora", slot: "special", name: "Aurora", unlock: PAID },
  { id: "special-confetti", slot: "special", name: "Confete", unlock: PAID },
];

export type Look = Record<Slot, string>;

export const DEFAULT_LOOK: Look = {
  helmet: "helmet-santa",
  blouse: "blouse-plain",
  pants: "pants-blue",
  dress: "dress-none",
  shoes: "shoes-brown",
  back: "back-none",
  face: "face-none",
  handLeft: "hand-left-none",
  handRight: "hand-right-none",
  special: "special-none",
};

/** A paid item is never unlocked by progress and never equipped; only its preview exists. */
export const isPaid = (c: Cosmetic): boolean => c.unlock.kind === "paid";


