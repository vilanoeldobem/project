/**
 * Unified cosmetic catalog (PROPOSTA; P08/IMPL-0027). The v1 array is the prefix; the ten books append to
 * the end of their slots, which is the presence wire contract. Nothing is bought: paid items stay
 * `unlock.kind: "paid"` and are never unlocked, worn or parsed from the wire.
 */
import {
  COSMETICS as COSMETICS_V1,
  DEFAULT_LOOK,
  isPaid,
  type Cosmetic,
  type Look,
  SLOTS,
} from "./cosmetics";
import { levelOf, type Progress } from "./progress";
import * as B00 from "./quests-v2/books/book-00-epilogue";
import * as B01 from "./quests-v2/books/book-01";
import * as B02 from "./quests-v2/books/book-02";
import * as B03 from "./quests-v2/books/book-03";
import * as B04 from "./quests-v2/books/book-04";
import * as B05 from "./quests-v2/books/book-05";
import * as B06 from "./quests-v2/books/book-06";
import * as B07 from "./quests-v2/books/book-07";
import * as B08 from "./quests-v2/books/book-08";
import * as B09 from "./quests-v2/books/book-09";
import * as B10 from "./quests-v2/books/book-10";
import type { StoryCatalog } from "./quests-v2/types";

const BOOKS = [B00, B01, B02, B03, B04, B05, B06, B07, B08, B09, B10] as const;

export const COSMETICS_V2: Cosmetic[] = [...COSMETICS_V1, ...BOOKS.flatMap((book) => book.COSMETICS)];

export function isUnlockedIn(catalog: readonly Cosmetic[], c: Cosmetic, p: Progress): boolean {
  if (!catalog.includes(c) || c.unlock.kind === "paid") return false;
  if (c.unlock.kind === "default") return true;
  if (c.unlock.kind === "mission") return Boolean(p.completed[c.unlock.missionId]);
  return levelOf(p.xp) >= c.unlock.level;
}

export function unlockedIdsIn(catalog: readonly Cosmetic[], p: Progress): Set<string> {
  return new Set(catalog.filter((c) => isUnlockedIn(catalog, c, p)).map((c) => c.id));
}

/** One item on a look, with the only overlap rule: a dress replaces blouse/trousers and vice versa. */
export function wearIn(catalog: readonly Cosmetic[], look: Look, id: string): Look {
  const c = catalog.find((x) => x.id === id);
  if (!c) return look;
  const next: Look = { ...look, [c.slot]: c.id };
  if (c.slot === "dress" && c.id !== DEFAULT_LOOK.dress) {
    next.blouse = DEFAULT_LOOK.blouse;
    next.pants = DEFAULT_LOOK.pants;
  } else if ((c.slot === "blouse" || c.slot === "pants") && next.dress !== DEFAULT_LOOK.dress) {
    next.dress = DEFAULT_LOOK.dress;
  }
  return next;
}

/** Keeps only known, unlocked items in their own slot; anything else falls back to the default. */
export function sanitizeLookIn(catalog: readonly Cosmetic[], look: Partial<Record<string, unknown>> | null | undefined, p: Progress): Look {
  const ok = unlockedIdsIn(catalog, p);
  const out: Look = { ...DEFAULT_LOOK };
  for (const slot of SLOTS) {
    const id = look?.[slot];
    const c = catalog.find((x) => x.id === id);
    if (c && c.slot === slot && ok.has(c.id)) out[slot] = c.id;
  }
  if (out.dress !== DEFAULT_LOOK.dress) {
    out.blouse = DEFAULT_LOOK.blouse;
    out.pants = DEFAULT_LOOK.pants;
  }
  return out;
}

/** Requirement text for the union; milestone rewards resolve to the milestone title, not the raw id. */
export function requirementIn(story: StoryCatalog, c: Cosmetic): string {
  if (c.unlock.kind === "default") return "";
  if (c.unlock.kind === "paid") return "Visual pago";
  if (c.unlock.kind === "level") return `Chegue ao nível ${c.unlock.level}`;
  const missionId = c.unlock.missionId;
  const mission = story.quickMissions.find((m) => m.id === missionId);
  if (mission) return `Conclua: ${mission.title}`;
  const quest = story.quests.find((q) => q.id === missionId);
  if (quest) return `Conclua: ${quest.title}`;
  const milestone = story.milestones.find((m) => m.id === missionId);
  return `Conclua: ${milestone?.title ?? missionId}`;
}

export { isPaid, type Cosmetic, type Look };
