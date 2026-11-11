/**
 * Avatar cosmetics catalogue and unlock rules (IMPL-0010) — **PROPOSTA**: items, names and unlocks are a
 * proposal awaiting the owner (doc 22 / DEC-032 avatar editor), not an approved reward table.
 *
 * Rules (non-negotiable, AGENTS.md):
 * - unlocked only by completing missions or reaching levels, derived from `Progress` (read-only here; the
 *   XP rules in progress.ts are unchanged);
 * - every item is reachable without donating (no mission involves donating; levels come from missions);
 * - no purchases, loot boxes, random drops or rewards for time online.
 * `name` and requirement texts are user-facing pt-BR copy.
 */
import { levelOf, MISSIONS, type Progress } from "./progress";

export type Slot = "hat" | "scarf" | "sweater" | "palette";

export type Unlock = { kind: "default" } | { kind: "mission"; missionId: string } | { kind: "level"; level: number };

export interface Cosmetic {
  id: string;
  slot: Slot;
  name: string;
  unlock: Unlock;
}

export const COSMETICS: Cosmetic[] = [
  { id: "hat-santa", slot: "hat", name: "Gorro de Noel", unlock: { kind: "default" } },
  { id: "hat-beanie", slot: "hat", name: "Gorro de tricô", unlock: { kind: "mission", missionId: "explore-gifts" } },
  { id: "hat-earmuffs", slot: "hat", name: "Protetor de orelha", unlock: { kind: "mission", missionId: "play-memory" } },
  { id: "hat-holly", slot: "hat", name: "Coroa de azevinho", unlock: { kind: "level", level: 2 } },
  { id: "scarf-none", slot: "scarf", name: "Sem cachecol", unlock: { kind: "default" } },
  { id: "scarf-stripes", slot: "scarf", name: "Cachecol listrado", unlock: { kind: "mission", missionId: "explore-gifts" } },
  { id: "scarf-pine", slot: "scarf", name: "Cachecol verde", unlock: { kind: "mission", missionId: "causes-visit-lot" } },
  { id: "sweater-none", slot: "sweater", name: "Casaco liso", unlock: { kind: "default" } },
  { id: "sweater-snowflake", slot: "sweater", name: "Suéter floco de neve", unlock: { kind: "mission", missionId: "play-memory" } },
  { id: "sweater-stripes", slot: "sweater", name: "Suéter listrado", unlock: { kind: "level", level: 2 } },
  { id: "palette-classic", slot: "palette", name: "Clássico", unlock: { kind: "default" } },
  { id: "palette-forest", slot: "palette", name: "Floresta", unlock: { kind: "mission", missionId: "causes-visit-lot" } },
  { id: "palette-night", slot: "palette", name: "Noite estrelada", unlock: { kind: "level", level: 2 } },
];

export const SLOTS: Slot[] = ["hat", "scarf", "sweater", "palette"];

export type Look = Record<Slot, string>;

export const DEFAULT_LOOK: Look = { hat: "hat-santa", scarf: "scarf-none", sweater: "sweater-none", palette: "palette-classic" };

export function isUnlocked(c: Cosmetic, p: Progress): boolean {
  if (c.unlock.kind === "default") return true;
  if (c.unlock.kind === "mission") return Boolean(p.completed[c.unlock.missionId]);
  return levelOf(p.xp) >= c.unlock.level;
}

export const unlockedIds = (p: Progress) => new Set(COSMETICS.filter((c) => isUnlocked(c, p)).map((c) => c.id));

/** Keeps only known, unlocked items in their own slot; anything else falls back to the default. */
export function sanitizeLook(look: Partial<Record<string, unknown>> | null | undefined, p: Progress): Look {
  const ok = unlockedIds(p);
  const out = { ...DEFAULT_LOOK };
  for (const slot of SLOTS) {
    const id = look?.[slot];
    const c = COSMETICS.find((x) => x.id === id);
    if (c && c.slot === slot && ok.has(c.id)) out[slot] = c.id;
  }
  return out;
}

/** pt-BR requirement text for a locked item. */
export function requirement(c: Cosmetic): string {
  if (c.unlock.kind === "default") return "";
  if (c.unlock.kind === "level") return `Chegue ao nível ${c.unlock.level}`;
  const missionId = c.unlock.missionId;
  return `Conclua: ${MISSIONS.find((m) => m.id === missionId)?.title ?? missionId}`;
}
